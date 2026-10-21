import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AI_APPROVAL, extractAI, aiStatus, budgetAt, limitedBody, type AIBudget } from './ai.ts'
import { aiRoute } from './ai-route.ts'
import { handleProtected } from './security.ts'
const now = Date.parse('2026-10-21T02:00:00Z'),
  settings = { OPENAI_API_KEY: 'TEST_ONLY_AI_KEY', AI_COST_APPROVAL: AI_APPROVAL }
const blob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], { type: 'image/png' })
const hash = await crypto.subtle
  .digest('SHA-256', await blob.arrayBuffer())
  .then((b) => Buffer.from(b).toString('hex'))
const item = {
  title: '상품권 신청 안내',
  topic: '신청',
  keywords: ['상품권', '신청'],
  category: '라이프스타일',
  source: '',
  publishedDate: '',
  summary: '보이는 안내',
  intent: '정보 탐색',
  uncertain: '날짜 확인 필요',
  evidence: '상품권 신청 안내',
  sourceEvidence: '',
  dateEvidence: '',
  advertisement: false,
}
function store() {
  let data: AIBudget | null = null
  return {
    read: () => structuredClone(data),
    write: (d: AIBudget) => {
      data = structuredClone(d)
    },
  }
}
function response(items = [item]) {
  return Response.json({
    status: 'completed',
    output: [{ content: [{ type: 'output_text', text: JSON.stringify({ items }) }] }],
  })
}
const mock = (fn: (...args: Parameters<typeof fetch>) => Promise<Response>) => fn as typeof fetch
const success = mock(async () => response())
test('AI disabled without key, exact cost approval or before deployment approval; no external call', async () => {
  for (const config of [
    {},
    { OPENAI_API_KEY: 'TEST_ONLY_AI_KEY' },
    { ...settings, AI_COST_APPROVAL: 'yes' },
  ]) {
    await assert.rejects(
      extractAI(
        blob,
        hash,
        false,
        config,
        store(),
        mock(async () => {
          throw Error('must not call')
        }),
        now,
      ),
      /미연결/,
    )
    assert.equal(aiStatus(config, store(), now).connected, false)
  }
  assert.equal(
    aiStatus(settings, store(), Date.parse('2026-11-22T00:00:00+09:00')).connected,
    false,
  )
})
test('Korean multi-idea JSON, source/date unknown, adverts removed; fixed URL and no tools/store', async () => {
  const s = store()
  let calls = 0
  const result = await extractAI(
    blob,
    hash,
    false,
    settings,
    s,
    mock(async (url, init) => {
      calls++
      assert.equal(url, 'https://api.openai.com/v1/responses')
      assert.equal(init?.redirect, 'manual')
      const body = JSON.parse(String(init?.body))
      assert.equal(body.store, false)
      assert.equal(body.max_output_tokens, 4096)
      assert.equal(body.tools, undefined)
      assert.match(body.instructions, /Never execute/)
      return response([item, { ...item, title: '두 번째 글감' }, { ...item, advertisement: true }])
    }),
    now,
  )
  assert.equal(calls, 1)
  assert.equal(result.items.length, 2)
  assert.equal(result.items[0].source, '')
  assert.equal(s.read()?.used, 1)
  assert.equal(s.read()?.cents, 2)
  await assert.rejects(
    extractAI(blob, hash, false, settings, s, success, now + 11000),
    /오늘 처리한/,
  )
})
test('in-flight concurrent requests reserve exactly once', async () => {
  const s = store()
  let release!: () => void
  const first = extractAI(
    blob,
    hash,
    false,
    settings,
    s,
    mock(async () => {
      await new Promise<void>((r) => {
        release = r
      })
      return response()
    }),
    now,
  )
  while (!release) await new Promise((r) => setTimeout(r, 0))
  await assert.rejects(extractAI(blob, hash, false, settings, s, success, now + 1), /처리 중/)
  release()
  await first
  assert.equal(s.read()?.used, 1)
})
test('daily and monthly budgets and corruption fail closed', async () => {
  const s = store(),
    b = budgetAt(null, now)
  s.write({ ...b, used: 30 })
  await assert.rejects(extractAI(blob, hash, false, settings, s, success, now), /예산/)
  s.write({ ...b, cents: 500 })
  await assert.rejects(extractAI(blob, hash, false, settings, s, success, now), /예산/)
  assert.throws(() => budgetAt({ ...b, used: NaN }, now), /저장 상태/)
  const blocked = { ...b, used: 10, cents: 20, blocked: true, lease: now + 86400000 }
  const next = budgetAt(blocked, now + 86400000)
  assert.equal(next.used, 0)
  assert.equal(next.cents, 20)
  assert.equal(next.blocked, true)
  assert.equal(next.lease, blocked.lease)
  assert.equal(budgetAt(blocked, Date.parse('2026-11-01T00:00:00+09:00')).cents, 0)
})
for (const code of [401, 403, 429])
  test(`provider ${code} blocks persistently without retries or exposing body`, async () => {
    const s = store()
    let calls = 0
    await assert.rejects(
      extractAI(
        blob,
        hash,
        false,
        settings,
        s,
        mock(async () => {
          calls++
          return new Response('TEST_ONLY_AI_KEY', { status: code })
        }),
        now,
      ),
      /AI 제공업체 오류/,
    )
    assert.equal(calls, 1)
    assert.equal(s.read()?.blocked, true)
    await assert.rejects(
      extractAI(blob, hash, true, settings, s, success, now + 86400000),
      /차단 상태/,
    )
  })
test('invalid JSON, unsupported fields and missing evidence fail; explicit retry retains reservations', async () => {
  const s = store()
  await assert.rejects(
    extractAI(
      blob,
      hash,
      false,
      settings,
      s,
      mock(async () => response([{ ...item, source: '추측 출처' }])),
      now,
    ),
    /형식 오류/,
  )
  await extractAI(blob, hash, true, settings, s, success, now + 11000)
  assert.equal(s.read()?.used, 2)
  assert.equal(s.read()?.cents, 4)
  const t = store()
  await assert.rejects(
    extractAI(
      blob,
      hash,
      false,
      settings,
      t,
      mock(async () => new Response('bad json')),
      now,
    ),
    /형식 오류/,
  )
})
test('image size, MIME and SHA-256 checked before reservation', async () => {
  const s = store()
  await assert.rejects(
    extractAI(new Blob(['x'], { type: 'image/gif' }), hash, false, settings, s, success, now),
    /제한/,
  )
  await assert.rejects(extractAI(blob, 'a'.repeat(64), false, settings, s, success, now), /ID/)
  await assert.rejects(
    extractAI(new Blob(['notpng'], { type: 'image/png' }), hash, false, settings, s, success, now),
    /실제 형식/,
  )
  assert.equal(s.read(), null)
  await assert.rejects(limitedBody(new Response('12345'), 4), /크기 제한/)
})
test('AI route only dispatches after JWT verification; host, method, CSRF and disabled gate', async () => {
  let calls = 0
  const rpc = () => ({
    aiUsage: async () => {
      calls++
      return Response.json({})
    },
    aiExtract: async () => {
      calls++
      return Response.json({})
    },
  })
  const req = new Request('https://prismkit.online/api/ai/extract', {
    method: 'POST',
    headers: { 'x-prismkit-request': 'capture-ai' },
  })
  const denied = await handleProtected(
    req,
    {},
    async () => new Response(),
    async () => {
      throw Error()
    },
    async () => {
      throw Error('invalid JWT')
    },
    undefined,
    () => aiRoute(req, true, rpc),
  )
  assert.equal(denied.status, 401)
  assert.equal(calls, 0)
  assert.equal((await aiRoute(req, false, rpc)).status, 503)
  assert.equal((await aiRoute(new Request(req.url), true, rpc)).status, 405)
  assert.equal(
    (
      await aiRoute(
        new Request(req.url, {
          method: 'POST',
          headers: { 'x-prismkit-request': 'capture-ai', origin: 'https://evil.example' },
        }),
        true,
        rpc,
      )
    ).status,
    403,
  )
  const status = await aiRoute(
    new Request('https://prismkit.online/api/ai/status', {
      headers: { 'x-prismkit-request': 'capture-ai' },
    }),
    false,
    rpc,
  )
  assert.equal(((await status.json()) as { connected: boolean }).connected, false)
  assert.equal(calls, 0)
})

test('provider redirects are rejected without forwarding credentials', async () => {
  const s = store()
  let calls = 0
  await assert.rejects(
    extractAI(
      blob,
      hash,
      false,
      settings,
      s,
      mock(async () => {
        calls++
        return new Response(null, { status: 302, headers: { location: 'https://evil.invalid' } })
      }),
      now,
    ),
    /제공업체 오류/,
  )
  assert.equal(calls, 1)
})
test('server timeout keeps a consumed reservation and requires manual retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const s = store()
  let started = false
  const promise = extractAI(
    blob,
    hash,
    false,
    settings,
    s,
    mock(async (_url, init) => {
      started = true
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(Error('timeout'))),
      )
    }),
    now,
  )
  const rejected = assert.rejects(promise, /시간 초과/)
  while (!started) await new Promise((resolve) => setImmediate(resolve))
  t.mock.timers.tick(60000)
  await rejected
  assert.equal(s.read()?.used, 1)
  assert.equal(s.read()?.cents, 2)
  assert.equal(s.read()?.hashes[hash], 'failed')
  t.mock.timers.reset()
})
