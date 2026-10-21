import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { brief, content } from '../fixtures/manuscript.ts'
test('manuscript reservations survive isolate restart and remain separate from capture and Naver budgets', async () => {
  const persistence = mkdtempSync(resolve('test-results/draft-durable-'))
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
          script: `export default {async fetch(r,e){const d=e.SEARCHAD.get(e.SEARCHAD.idFromName('prismkit-drafts-v1'));const path=new URL(r.url).pathname;if(path==='/status')return d.draftUsage();if(path==='/image')return e.SEARCHAD.get(e.SEARCHAD.idFromName('prismkit-ai-v1')).aiUsage();if(path==='/naver')return e.SEARCHAD.get(e.SEARCHAD.idFromName('prismkit-searchad-v1')).usage();return d.draftGenerate(${JSON.stringify(brief)},'runtime-request-000001')}}`,
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
            OPENAI_API_KEY: 'TEST_ONLY_DRAFT',
            AI_COST_APPROVAL: 'gpt-4.1-mini-2025-04-14:daily30:monthly5USD:2026-11-21',
            DRAFT_COST_APPROVAL: 'gpt-4.1-mini-2025-04-14:daily5:monthly1.50USD:2026-11-21',
          },
          durableObjects: { SEARCHAD: { className: 'SearchAdBudget', useSQLite: true } },
          outboundService: async (r) => {
            assert.equal(r.url, 'https://api.openai.com/v1/responses')
            calls++
            return Response.json({
              status: 'completed',
              usage: { input_tokens: 4000, output_tokens: 6000 },
              output: [{ content: [{ type: 'output_text', text: JSON.stringify(content) }] }],
            })
          },
        },
      ],
    })
  let runtime = new Miniflare(options())
  try {
    const r = await runtime.dispatchFetch('https://local.invalid/generate')
    assert.equal(r.status, 200, r.status !== 200 ? await r.text() : undefined)
    assert.equal((await r.json()).model, 'gpt-4.1-mini-2025-04-14')
    await runtime.dispose()
    runtime = new Miniflare(options())
    const usage = await (await runtime.dispatchFetch('https://local.invalid/status')).json()
    assert.equal(usage.used, 1)
    assert.equal(usage.reservedUsd, 0.03)
    assert.equal(usage.estimatedUsd, 0.0112)
    const duplicate = await runtime.dispatchFetch('https://local.invalid/generate')
    assert.equal(duplicate.status, 409)
    await duplicate.text()
    assert.equal(calls, 1)
    for (const p of ['image', 'naver'])
      assert.equal(
        (await (await runtime.dispatchFetch(`https://local.invalid/${p}`)).json()).used,
        0,
      )
  } finally {
    await runtime.dispose()
  }
})
