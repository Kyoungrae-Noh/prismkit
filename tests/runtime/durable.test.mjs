import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('workerd RPC and SQLite retain cache and quota across runtime restarts', async () => {
  const persistence = mkdtempSync(resolve('test-results/durable-'))
  let calls = 0
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
          script: `export default {fetch(request,env){return env.SEARCHAD.get(env.SEARCHAD.idFromName('prismkit-searchad-v1')).query(new URL(request.url).searchParams.get('keyword'))}}`,
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
            NAVER_SEARCHAD_API_KEY: 'TEST_KEY',
            NAVER_SEARCHAD_SECRET_KEY: 'TEST_SECRET',
            NAVER_SEARCHAD_CUSTOMER_ID: 'TEST_CUSTOMER',
          },
          durableObjects: { SEARCHAD: { className: 'SearchAdBudget', useSQLite: true } },
          outboundService: async (request) => {
            assert.equal(new URL(request.url).hostname, 'api.searchad.naver.com')
            calls++
            return Response.json({
              keywordList: [
                { relKeyword: '테스트', monthlyPcQcCnt: 100, monthlyMobileQcCnt: '<10' },
              ],
            })
          },
        },
      ],
    })
  let runtime = new Miniflare(options())
  const query = (keyword) =>
    runtime.dispatchFetch(`https://local.invalid/?keyword=${encodeURIComponent(keyword)}`)
  try {
    const first = await query('테스트')
    assert.equal(first.status, 200, first.status !== 200 ? await first.text() : undefined)
    assert.equal((await first.json()).rows[0].mobile, '<10')
    assert.equal(calls, 1)
    const blocked = await query('다른키워드')
    assert.equal(blocked.status, 429)
    await blocked.arrayBuffer()
    await runtime.dispose()
    runtime = new Miniflare(options())
    const cached = await query('테스트')
    assert.equal(cached.status, 200)
    assert.equal((await cached.json()).cached, true)
    assert.equal(calls, 1, 'A restarted isolate must not contact Naver again')
    const stillLimited = await query('새키워드')
    assert.equal(stillLimited.status, 429, 'A restarted isolate must retain the call interval')
    await stillLimited.arrayBuffer()
    const api = await runtime.getWorker('api')
    const direct = await api.fetch('https://local.invalid/')
    assert.equal(direct.status, 403)
    await direct.arrayBuffer()
  } finally {
    await runtime.dispose()
  }
})

test('legacy SQLite payload migrates without clearing quota or block on redeployment', async () => {
  const persistence = mkdtempSync(resolve('test-results/legacy-durable-'))
  const legacy = `import {DurableObject} from 'cloudflare:workers';
    export class SearchAdBudget extends DurableObject {
      async query(){this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)');
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO budget VALUES(1,?)',JSON.stringify({calls:10,last:Date.now()-86400000,blocked:true,busyUntil:0}));return Response.json({seeded:true});}
    } export default {fetch(){return new Response('',{status:403})}}`
  const options = (seed) =>
    convertV4MiniflareOptions({
      cf: false,
      telemetry: { enabled: false },
      resourcePersistencePath: persistence,
      workers: [
        {
          name: 'driver',
          modules: true,
          compatibilityDate: '2026-10-19',
          script: `export default {fetch(request,env){const s=env.SEARCHAD.get(env.SEARCHAD.idFromName('prismkit-searchad-v1'));return ${seed ? 's.query()' : 's.usage()'}}}`,
          durableObjects: {
            SEARCHAD: { className: 'SearchAdBudget', scriptName: 'api', useSQLite: true },
          },
        },
        {
          name: 'api',
          modules: true,
          ...(seed ? { script: legacy } : { scriptPath: resolve('test-results/worker/index.js') }),
          compatibilityDate: '2026-10-19',
          compatibilityFlags: ['nodejs_compat'],
          durableObjects: { SEARCHAD: { className: 'SearchAdBudget', useSQLite: true } },
          outboundService: () => {
            throw new Error('No upstream calls allowed during migration')
          },
        },
      ],
    })
  let runtime = new Miniflare(options(true))
  try {
    assert.equal((await runtime.dispatchFetch('https://local.invalid/')).status, 200)
    await runtime.dispose()
    runtime = new Miniflare(options(false))
    const response = await runtime.dispatchFetch('https://local.invalid/')
    assert.equal(response.status, 200)
    const usage = await response.json()
    assert.equal(usage.used, 10)
    assert.equal(usage.remaining, 0)
    assert.equal(usage.limit, 10)
    assert.equal(usage.blocked, true)
    assert.equal(usage.migration, true)
    await runtime.dispose()
    runtime = new Miniflare(options(false))
    assert.deepEqual(await (await runtime.dispatchFetch('https://local.invalid/')).json(), usage)
  } finally {
    await runtime.dispose()
  }
})
