import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { DRAFT_APPROVAL } from '../../edge/drafts.ts'

for (const approved of [false, true])
  test(`authenticated Pages status reaches Worker RPC with approval=${approved} and never calls OpenAI`, async () => {
    const issuer = 'https://test-team.cloudflareaccess.com'
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const jwk = {
      ...(await exportJWK(publicKey)),
      kid: 'draft-status-key',
      alg: 'RS256',
      use: 'sig',
    }
    const token = await new SignJWT({ email: 'admin@example.invalid', type: 'app' })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience('test-audience')
      .setSubject('test-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
    let outboundCalls = 0
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        cf: false,
        telemetry: { enabled: false },
        workers: [
          {
            name: 'pages',
            modules: true,
            scriptPath: resolve('test-results/pages/index.js'),
            compatibilityDate: '2026-10-19',
            compatibilityFlags: ['nodejs_compat'],
            bindings: {
              ACCESS_ISSUER: issuer,
              ACCESS_AUD: 'test-audience',
              ADMIN_EMAIL: 'admin@example.invalid',
            },
            durableObjects: {
              SEARCHAD: { className: 'SearchAdBudget', scriptName: 'api', useSQLite: true },
            },
            serviceBindings: {
              ASSETS: async () => {
                throw Error('API must never return SPA HTML')
              },
            },
            outboundService: async (request) => {
              assert.equal(request.url, `${issuer}/cdn-cgi/access/certs`)
              return Response.json({ keys: [jwk] })
            },
          },
          {
            name: 'api',
            modules: true,
            scriptPath: resolve('test-results/worker/index.js'),
            compatibilityDate: '2026-10-19',
            compatibilityFlags: ['nodejs_compat'],
            bindings: {
              OPENAI_API_KEY: 'TEST_ONLY_DRAFT',
              DRAFT_COST_APPROVAL: approved ? DRAFT_APPROVAL : '',
            },
            durableObjects: { SEARCHAD: { className: 'SearchAdBudget', useSQLite: true } },
            outboundService: async () => {
              outboundCalls++
              throw Error('External calls forbidden')
            },
          },
        ],
      }),
    )
    try {
      for (let i = 0; i < 2; i++) {
        const r = await runtime.dispatchFetch('https://prismkit.online/api/ai/drafts/status', {
          headers: { 'cf-access-jwt-assertion': token, 'x-prismkit-request': 'draft-ai' },
        })
        assert.equal(r.status, 200)
        assert.equal(r.headers.get('cache-control'), 'no-store')
        assert.deepEqual(await r.json(), {
          connected: approved,
          blocked: false,
          used: approved ? 0 : null,
          monthUsed: approved ? 0 : null,
          remaining: approved ? 30 : null,
          estimatedUsd: approved ? 0 : null,
          reservedUsd: approved ? 0 : null,
        })
      }
      const hubHeaders = { 'cf-access-jwt-assertion': token, 'x-prismkit-request': 'hub-query' }
      const hub = await runtime.dispatchFetch('https://prismkit.online/api/hub/status', {
        headers: hubHeaders,
      })
      assert.equal(hub.status, 200)
      const hubState = await hub.json()
      assert.equal(hubState.configured, false)
      assert.equal(hubState.apis.length, 6)
      assert.ok(hubState.apis.every((a) => !a.enabled && a.dailyUsed === 0 && a.monthlyUsed === 0))
      for (const api of ['blog', 'cafe', 'kin', 'news', 'trend', 'shopping']) {
        const blockedHub = await runtime.dispatchFetch('https://prismkit.online/api/hub/query', {
          method: 'POST',
          headers: { ...hubHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api,
            query: '테스트',
            startDate: '2026-01-01',
            endDate: '2026-01-14',
            category: '50000000',
          }),
        })
        assert.equal(blockedHub.status, 403)
        assert.equal((await blockedHub.json()).error.code, 'POLICY_HOLD')
      }
      const noAuthHub = await runtime.dispatchFetch('https://prismkit.online/api/hub/status', {
        headers: { 'x-prismkit-request': 'hub-query' },
      })
      assert.equal(noAuthHub.status, 401)
      await noAuthHub.arrayBuffer()
      assert.equal(outboundCalls, 0)
    } finally {
      await runtime.dispose()
    }
  })

test('compiled Pages routing protects SPA, assets, API and preview hosts using real JWT verification', async () => {
  const issuer = 'https://test-team.cloudflareaccess.com'
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }
  const token = await new SignJWT({ email: 'admin@example.invalid', type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer)
    .setAudience('test-audience')
    .setSubject('test-user')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
  let assets = 0
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      cf: false,
      telemetry: { enabled: false },
      modules: true,
      scriptPath: resolve('test-results/pages/index.js'),
      compatibilityDate: '2026-10-19',
      compatibilityFlags: ['nodejs_compat'],
      bindings: {
        ACCESS_ISSUER: issuer,
        ACCESS_AUD: 'test-audience',
        ADMIN_EMAIL: 'admin@example.invalid',
      },
      serviceBindings: {
        ASSETS: async () => {
          assets++
          return new Response('<html>Prismkit SPA</html>', {
            headers: { 'Content-Type': 'text/html' },
          })
        },
      },
      outboundService: async (request) => {
        assert.equal(request.url, `${issuer}/cdn-cgi/access/certs`)
        return Response.json({ keys: [jwk] })
      },
    }),
  )
  try {
    for (const path of [
      '/',
      '/keywords',
      '/publishing',
      '/assets/app.js',
      '/api/searchad/keyword?keyword=test',
      '/api/ai/drafts/status',
      '/api/ai/drafts/generate',
      '/manuscripts',
      '/api/ai/status',
      '/api/ai/extract',
    ]) {
      const denied = await runtime.dispatchFetch(`https://prismkit.online${path}`)
      assert.equal(denied.status, 401, path)
      await denied.arrayBuffer()
    }
    assert.equal(assets, 0)
    for (const path of ['/', '/keywords', '/publishing']) {
      const allowed = await runtime.dispatchFetch(`https://prismkit.online${path}`, {
        headers: { 'cf-access-jwt-assertion': token },
      })
      assert.equal(allowed.status, 200, path)
      assert.equal(allowed.headers.get('cache-control'), 'no-store')
      assert.match(await allowed.text(), /Prismkit SPA/)
    }
    for (const host of ['prismkit-git.pages.dev', 'test.prismkit-git.pages.dev']) {
      const denied = await runtime.dispatchFetch(`https://${host}/`, {
        headers: { 'cf-access-jwt-assertion': token },
      })
      assert.equal(denied.status, 403)
      await denied.arrayBuffer()
    }
    const forged = await runtime.dispatchFetch(
      'https://prismkit.online/api/searchad/keyword?keyword=test',
      { headers: { 'cf-access-jwt-assertion': 'forged' } },
    )
    assert.equal(forged.status, 401)
    await forged.arrayBuffer()
    const missingBinding = await runtime.dispatchFetch(
      'https://prismkit.online/api/searchad/keyword?keyword=test',
      { headers: { 'cf-access-jwt-assertion': token, 'x-prismkit-request': 'keyword-query' } },
    )
    assert.equal(missingBinding.status, 503)
    assert.ok(!(await missingBinding.text()).includes('test-audience'))
    const aiStatus = await runtime.dispatchFetch('https://prismkit.online/api/ai/status', {
      headers: { 'cf-access-jwt-assertion': token, 'x-prismkit-request': 'capture-ai' },
    })
    assert.equal(aiStatus.status, 200)
    assert.equal((await aiStatus.json()).connected, false)
    const aiDisabled = await runtime.dispatchFetch('https://prismkit.online/api/ai/extract', {
      method: 'POST',
      headers: { 'cf-access-jwt-assertion': token, 'x-prismkit-request': 'capture-ai' },
    })
    assert.equal(aiDisabled.status, 503)
    assert.equal((await aiDisabled.json()).error.code, 'DISABLED')
    assert.equal(assets, 3, 'Rejected API requests must never fall back to the SPA')
  } finally {
    await runtime.dispose()
  }
})
