import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brief, content } from '../tests/fixtures/manuscript.ts'
import {
  DRAFT_APPROVAL,
  generateDraft,
  draftStatus,
  draftBudget,
  type DraftBudget,
  type DraftStore,
} from './drafts.ts'
import { draftRoute } from './draft-route.ts'
import { handleProtected } from './security.ts'
const now = Date.parse('2026-10-21T06:00:00Z'),
  settings = { OPENAI_API_KEY: 'TEST_ONLY', DRAFT_COST_APPROVAL: DRAFT_APPROVAL }
function memory(): DraftStore {
  let b: DraftBudget | null = null
  return {
    read: () => b && structuredClone(b),
    write: (x) => {
      b = structuredClone(x)
    },
  }
}
const response = () =>
  Response.json({
    status: 'completed',
    usage: { input_tokens: 4000, output_tokens: 6000 },
    output: [{ content: [{ type: 'output_text', text: JSON.stringify(content) }] }],
  })
test('draft budgets require separate approval, never reuse image approval, and expire', async () => {
  const s = memory()
  let calls = 0
  const f: typeof fetch = async () => {
    calls++
    return response()
  }
  for (const cfg of [
    { OPENAI_API_KEY: 'TEST_ONLY' },
    { ...settings, DRAFT_COST_APPROVAL: 'wrong' },
  ])
    await assert.rejects(generateDraft(brief, 'request-0000000001', cfg, s, f, now), /승인/)
  await assert.rejects(
    generateDraft(
      brief,
      'request-0000000001',
      settings,
      s,
      f,
      Date.parse('2026-11-22T00:00:00+09:00'),
    ),
  )
  assert.equal(calls, 0)
  assert.equal(draftStatus({}, s, now).used, null)
})
test('model, no-store, structured template and usage cost are enforced for both manuscript types', async () => {
  for (const type of ['naver', 'reviewman'] as const) {
    let calls = 0
    const s = memory()
    const r = await generateDraft(
      { ...brief, type },
      'request-0000000001',
      settings,
      s,
      async (_url, init) => {
        calls++
        const b = JSON.parse(init!.body as string)
        assert.equal(b.store, false)
        assert.equal(b.max_output_tokens, 6000)
        assert.equal(b.model, 'gpt-4.1-mini-2025-04-14')
        assert.equal(b.text.format.strict, true)
        assert.ok(b.instructions.includes(type === 'naver' ? 'NAVER BLOG' : 'REVIEWMAN'))
        assert.ok(!b.tools)
        return response()
      },
      now,
    )
    assert.equal(calls, 1)
    assert.equal(r.usage.estimatedUsd, 0.0112)
    assert.equal(draftStatus(settings, s, now).reservedUsd, 0.03)
  }
})
test('durable reservation precedes fetch and blocks concurrent requests and duplicate IDs', async () => {
  const s = memory()
  let calls = 0
  await generateDraft(
    brief,
    'request-0000000001',
    settings,
    s,
    async () => {
      calls++
      assert.equal(s.read()!.used, 1)
      await assert.rejects(
        generateDraft(
          brief,
          'request-0000000002',
          settings,
          s,
          async () => {
            calls++
            return response()
          },
          now + 11000,
        ),
        /생성 중/,
      )
      return response()
    },
    now,
  )
  await assert.rejects(
    generateDraft(
      brief,
      'request-0000000001',
      settings,
      s,
      async () => {
        calls++
        return response()
      },
      now + 11000,
    ),
    /이미 요청/,
  )
  assert.equal(calls, 1)
})
test('daily/monthly caps survive day rollover and corrupted state fails closed', async () => {
  const s = memory()
  let calls = 0
  const f: typeof fetch = async () => {
    calls++
    return response()
  }
  for (let i = 0; i < 5; i++)
    await generateDraft(brief, `request-000000000${i}`, settings, s, f, now + i * 11000)
  await assert.rejects(
    generateDraft(brief, 'request-0000000009', settings, s, f, now + 60000),
    /소진/,
  )
  assert.equal(draftStatus(settings, s, now + 86400000).used, 0)
  assert.equal(draftStatus(settings, s, now + 86400000).monthUsed, 5)
  const b = s.read()!
  b.monthUsed = 50
  b.ids = Array.from({length:50},(_,i)=>`request-00000000-${i}`)
  s.write(b)
  await assert.rejects(
    generateDraft(brief, 'request-0000000010', settings, s, f, now + 86400000),
    /소진/,
  )
  assert.equal(calls, 5)
  assert.throws(() => draftBudget({ ...b, used: -1 }, now), /자동 초기화/)
  for(const day of ['2026-02-30','2026-99-99','2027-01-01']) assert.throws(()=>draftBudget({...b,day},now),/자동 초기화/)
})
test('429 never retries, reserves failed calls and remains blocked across days', async () => {
  const s = memory()
  let calls = 0
  const f: typeof fetch = async () => {
    calls++
    return new Response('provider secret body', { status: 429 })
  }
  await assert.rejects(
    generateDraft(brief, 'request-0000000001', settings, s, f, now),
    (e) => e instanceof Error && !e.message.includes('secret'),
  )
  assert.equal(s.read()!.used, 1)
  assert.equal(s.read()!.lease, 0)
  await assert.rejects(
    generateDraft(brief, 'request-0000000002', settings, s, f, now + 86400000),
    /차단/,
  )
  assert.equal(calls, 1)
})
test('refusal, incomplete output, fabricated source and network errors preserve budgets', async () => {
  for (const f of [
    async () => Response.json({ status: 'incomplete' }),
    async () =>
      Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }),
    async () =>
      Response.json({
        status: 'completed',
        output: [
          {
            content: [
              { type: 'output_text', text: JSON.stringify({ ...content, sourceIds: ['fake'] }) },
            ],
          },
        ],
      }),
    async () => {
      throw Error('secret-network-detail')
    },
  ]) {
    const s = memory()
    await assert.rejects(
      generateDraft(brief, 'request-0000000001', settings, s, f, now),
      (e) => e instanceof Error && !e.message.includes('secret-network'),
    )
    assert.equal(s.read()!.used, 1)
    assert.equal(s.read()!.lease, 0)
  }
})
test('draft routes enforce Access before RPC, method, origin, header and bounded JSON', async () => {
  let calls = 0
  const rpc = () => ({
    draftUsage: async () => {
      calls++
      return Response.json({})
    },
    draftGenerate: async () => {
      calls++
      return Response.json({})
    },
  })
  const base = 'https://prismkit.online/api/ai/drafts/status'
  assert.equal((await draftRoute(new Request(base), rpc)).status, 403)
  assert.equal(
    (
      await draftRoute(
        new Request(base, { method: 'POST', headers: { 'x-prismkit-request': 'draft-ai' } }),
        rpc,
      )
    ).status,
    405,
  )
  assert.equal(
    (
      await draftRoute(
        new Request(base, {
          headers: { 'x-prismkit-request': 'draft-ai', origin: 'https://evil.example' },
        }),
        rpc,
      )
    ).status,
    403,
  )
  const denied = await handleProtected(
    new Request(base),
    {},
    async () => new Response(),
    async () => {
      throw Error('no')
    },
    async () => {
      throw Error('auth')
    },
    undefined,
    () => draftRoute(new Request(base), rpc),
  )
  assert.equal(denied.status, 401)
  assert.equal(calls, 0)
  assert.equal(
    (await draftRoute(new Request(base, { headers: { 'x-prismkit-request': 'draft-ai' } }), rpc))
      .status,
    200,
  )
  assert.equal(calls, 1)
  const huge = await draftRoute(
    new Request(base.replace('status', 'generate'), {
      method: 'POST',
      headers: { 'x-prismkit-request': 'draft-ai', 'content-type': 'application/json' },
      body: 'x'.repeat(18000),
    }),
    rpc,
  )
  assert.ok(huge.status >= 400)
  assert.equal(calls, 1)
})
test('provider timeout releases lease without refund or retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const s = memory()
  let calls = 0
  const pending = generateDraft(
    brief,
    'request-timeout-0001',
    settings,
    s,
    async (_url, init) => {
      calls++
      return new Promise<Response>((_resolve, reject) =>
        init!.signal!.addEventListener('abort', () => reject(Error('aborted'))),
      )
    },
    now,
  )
  t.mock.timers.tick(80001)
  await assert.rejects(pending, /시간|실패/)
  assert.equal(s.read()!.used, 1)
  assert.equal(s.read()!.lease, 0)
  assert.equal(calls, 1)
})
