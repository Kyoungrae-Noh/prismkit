import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
test('AI SQLite reservations persist across isolates and remain separate from Naver quota', async () => {
  const persistence = mkdtempSync(resolve('test-results/ai-durable-'))
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
          script: `export default {async fetch(r,e){const s=e.SEARCHAD.get(e.SEARCHAD.idFromName('prismkit-ai-v1'));if(new URL(r.url).pathname==='/status')return s.aiUsage();if(new URL(r.url).pathname==='/naver')return e.SEARCHAD.get(e.SEARCHAD.idFromName('prismkit-searchad-v1')).usage();const b=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])],{type:'image/png'});const id=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');return s.aiExtract(b,id,false)}}`,
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
            OPENAI_API_KEY: 'TEST_ONLY_AI_KEY',
            AI_COST_APPROVAL: 'gpt-4.1-mini-2025-04-14:daily30:monthly5USD:2026-11-21',
          },
          durableObjects: { SEARCHAD: { className: 'SearchAdBudget', useSQLite: true } },
          outboundService: async (r) => {
            assert.equal(r.url, 'https://api.openai.com/v1/responses')
            calls++
            return Response.json({
              status: 'completed',
              output: [{ content: [{ type: 'output_text', text: '{"items":[]}' }] }],
            })
          },
        },
      ],
    })
  let runtime = new Miniflare(options())
  try {
    const response = await runtime.dispatchFetch('https://local.invalid/extract')
    assert.equal(response.status, 200, response.status !== 200 ? await response.text() : undefined)
    await response.json()
    assert.equal(calls, 1)
    await runtime.dispose()
    runtime = new Miniflare(options())
    const usage = await runtime.dispatchFetch('https://local.invalid/status')
    assert.equal((await usage.json()).used, 1)
    const blocked = await runtime.dispatchFetch('https://local.invalid/extract')
    assert.ok([409, 429].includes(blocked.status))
    await blocked.text()
    assert.equal(calls, 1)
    const naver = await runtime.dispatchFetch('https://local.invalid/naver')
    assert.equal((await naver.json()).used, 0)
  } finally {
    await runtime.dispose()
  }
})
