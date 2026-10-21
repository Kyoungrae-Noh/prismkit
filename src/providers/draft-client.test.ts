import { it, expect, vi } from 'vitest'
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
      expect(new Headers(init?.headers).get('x-prismkit-draft-format')).toBe('2')
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
it('status timeout aborts once after 15 seconds without claiming a generation reservation', async () => {
  vi.useFakeTimers()
  try {
    let calls = 0
    const pending = fetchDraftStatus(async (_url, init) => {
      calls++
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      })
    })
    const assertion = expect(pending).rejects.toThrow('생성 요청은 전송하지 않았습니다')
    await vi.advanceTimersByTimeAsync(15000)
    await assertion
    expect(calls).toBe(1)
  } finally {
    vi.useRealTimers()
  }
})
it('status errors are actionable and never expose upstream details', async () => {
  await expect(
    fetchDraftStatus(async () => {
      throw new TypeError('private network details')
    }),
  ).rejects.toThrow('네트워크와 관리자 로그인')
  await expect(
    fetchDraftStatus(async () =>
      Response.json({ error: { message: 'private details' } }, { status: 503 }),
    ),
  ).rejects.toThrow('서버 연결')
  for (const body of ['null', '{broken']) {
    await expect(
      fetchDraftStatus(
        async () => new Response(body, { headers: { 'content-type': 'application/json' } }),
      ),
    ).rejects.toThrow('사용량 응답 오류')
  }
})
