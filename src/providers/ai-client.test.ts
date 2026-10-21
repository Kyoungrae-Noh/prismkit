import { it, expect, vi } from 'vitest'
import { extractImage, fetchAIStatus } from './ai-client'
import { disconnectedStatus } from '../domain/ai-contract'
it('state check is separate from image extraction and never sends credentials to vendor', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(disconnectedStatus()))
  expect((await fetchAIStatus(fetcher)).connected).toBe(false)
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/ai/status')
})
it.each([401, 403, 429, 500])('reports HTTP %i without retry', async (status) => {
  const fetcher = vi.fn(async () => Response.json({ error: { code: 'BUDGET' } }, { status }))
  await expect(extractImage('a'.repeat(64), new Blob(), false, fetcher)).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('HTML Access page and malformed structured JSON are not treated as completion', async () => {
  await expect(
    fetchAIStatus(vi.fn(async () => new Response('<html>Login</html>'))),
  ).rejects.toThrow('응답 형식')
  await expect(
    extractImage(
      'a'.repeat(64),
      new Blob(),
      false,
      vi.fn(async () => Response.json({ items: [] })),
    ),
  ).rejects.toThrow('스키마')
})
it('network error and timeout remain failures, with no automatic retry', async () => {
  await expect(
    fetchAIStatus(
      vi.fn(async () => {
        throw Error('secret URL')
      }),
    ),
  ).rejects.toThrow('네트워크')
  vi.useFakeTimers()
  try {
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    )
    const p = expect(fetchAIStatus(fetcher)).rejects.toThrow('시간 초과')
    await vi.advanceTimersByTimeAsync(70000)
    await p
    expect(fetcher).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
  }
})
