import { it, expect } from 'vitest'
import { fetchDraftStatus, requestDraft } from './draft-client'
import { brief, manuscript } from '../../tests/fixtures/manuscript'
it('rejects login HTML, malformed budgets and response identity mismatch', async () => {
  await expect(fetchDraftStatus(async () => new Response('<html>login</html>'))).rejects.toThrow(
    '로그인',
  )
  await expect(
    fetchDraftStatus(async () => Response.json({ connected: true, blocked: false })),
  ).rejects.toThrow('사용량')
  await expect(
    requestDraft(brief, 'another-request-id', async () => Response.json(manuscript())),
  ).rejects.toThrow('불일치')
})
it('sends only explicit generation requests with same-origin credentials and never retries a 429', async () => {
  let calls = 0
  await expect(
    requestDraft(brief, 'request-0000000001', async (_url, init) => {
      calls++
      expect(init?.credentials).toBe('same-origin')
      expect(init?.redirect).toBe('error')
      expect(init?.method).toBe('POST')
      return Response.json(
        { error: { code: 'BLOCKED', message: 'secret response' } },
        { status: 429 },
      )
    }),
  ).rejects.toThrow('차단')
  expect(calls).toBe(1)
})
it('status reads do not generate and valid response preserves provenance', async () => {
  let calls = 0
  const s = await fetchDraftStatus(async (url, init) => {
    calls++
    expect(url).toBe('/api/ai/drafts/status')
    expect(init?.method).toBe('GET')
    return Response.json({
      connected: false,
      blocked: false,
      used: null,
      monthUsed: null,
      remaining: null,
      estimatedUsd: null,
      reservedUsd: null,
    })
  })
  expect(calls).toBe(1)
  expect(s.connected).toBe(false)
  const m = manuscript()
  expect((await requestDraft(m.brief, m.id, async () => Response.json(m))).brief).toEqual(brief)
})
