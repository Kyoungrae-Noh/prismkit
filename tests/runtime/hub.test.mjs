import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('activated HUB RPC retains six API caches, quotas and authentication blocks across restarts', async () => {
  const persistence = mkdtempSync(resolve('test-results/hub-durable-'))
  let calls = 0
  const apis = ['blog', 'cafe', 'kin', 'news', 'trend', 'shopping']
  const options = () =>
    convertV4MiniflareOptions({
      cf: false,
      telemetry: { enabled: false },
      resourcePersistencePath: persistence,
      workers: [
        {
          name: 'driver',
          modules: true,
          compatibilityDate: '2026-10-19',
          script: `export default {async fetch(request,env){const stub=env.SEARCHAD.get(env.SEARCHAD.idFromName('hub-test'));return request.method==='POST'?stub.hubQuery(await request.json()):stub.hubUsage()}}`,
          durableObjects: {
            SEARCHAD: { className: 'SearchAdBudget', scriptName: 'api', useSQLite: true },
          },
        },
        {
          name: 'api',
          modules: true,
          scriptPath: resolve('test-results/worker/index.js'),
          compatibilityDate: '2026-10-19',
          compatibilityFlags: ['nodejs_compat'],
          bindings: {
            NAVER_API_HUB_CLIENT_ID: 'TEST_ID',
            NAVER_API_HUB_CLIENT_SECRET: 'TEST_SECRET',
          },
          durableObjects: { SEARCHAD: { className: 'SearchAdBudget', useSQLite: true } },
          outboundService: async (request) => {
            calls++
            const url = new URL(request.url)
            assert.equal(url.hostname, 'naverapihub.apigw.ntruss.com')
            assert.equal(request.headers.get('X-NCP-APIGW-API-KEY-ID'), 'TEST_ID')
            assert.equal(request.headers.get('X-NCP-APIGW-API-KEY'), 'TEST_SECRET')
            if (url.searchParams.get('query') === '인증오류')
              return new Response('{}', { status: 401 })
            if (request.method === 'POST') {
              const body = await request.json()
              return Response.json({
                startDate: body.startDate,
                endDate: body.endDate,
                timeUnit: 'date',
                results: [{ title: '테스트', data: [{ period: body.startDate, ratio: 25 }] }],
              })
            }
            return Response.json({ total: 42, start: 1, display: 0, items: [] })
          },
        },
      ],
    })
  let runtime = new Miniflare(options())
  const query = (api, keyword = '테스트') =>
    runtime.dispatchFetch('https://local.invalid/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api,
        query: keyword,
        startDate: '2026-01-01',
        endDate: '2026-01-14',
        category: '50000000',
      }),
    })
  try {
    for (const api of apis) {
      const response = await query(api)
      assert.equal(
        response.status,
        200,
        `${api}, outbound=${calls}: ${response.status !== 200 ? await response.text() : ''}`,
      )
      const body = await response.json()
      assert.equal(body.mode, 'LIVE')
      assert.equal(body.cached, false)
    }
    assert.equal(calls, 6)
    await runtime.dispose()
    runtime = new Miniflare(options())
    for (const api of apis) {
      const response = await query(api)
      assert.equal(response.status, 200)
      assert.equal((await response.json()).cached, true)
    }
    assert.equal(calls, 6)
    const status = await (await runtime.dispatchFetch('https://local.invalid/')).json()
    assert.equal(status.configured, true)
    assert.ok(status.apis.every((a) => a.enabled && a.dailyUsed === 1 && a.monthlyUsed === 1))
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const rejected = await query('blog', '인증오류')
    assert.equal(rejected.status, 401)
    assert.equal((await rejected.json()).error.code, 'AUTH')
    assert.equal(calls, 7)
    await runtime.dispose()
    runtime = new Miniflare(options())
    const blocked = await query('blog', '새키워드')
    assert.equal(blocked.status, 429)
    assert.equal((await blocked.json()).error.code, 'AUTH')
    assert.equal(calls, 7)
  } finally {
    await runtime.dispose()
  }
})
