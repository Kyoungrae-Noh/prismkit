import { it, expect, vi } from 'vitest'
import { readBudget } from './usage-client'
const valid = () => ({
  used: 1,
  remaining: 9,
  limit: 10,
  day: '2026-10-21',
  resetsAt: new Date(Date.now() + 86400000).toISOString(),
  blocked: false,
  migration: true,
  lastQueryAt: null,
})
it('queries only the budget endpoint with authenticated same-origin headers', async () => {
  const fetcher = vi.fn(async () => Response.json(valid()))
  expect((await readBudget(fetcher)).remaining).toBe(9)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0]).toMatchObject([
    '/api/searchad/usage',
    { headers: { 'X-Prismkit-Request': 'keyword-query' }, redirect: 'error' },
  ])
})
for (const [status, message] of [
  [401, '인증'],
  [403, '인증'],
  [503, '서버 오류'],
  [429, 'HTTP 429'],
] as const)
  it(`shows actionable HTTP ${status} without retry`, async () => {
    const f = vi.fn(async () => new Response('', { status }))
    await expect(readBudget(f)).rejects.toThrow(message)
    expect(f).toHaveBeenCalledTimes(1)
  })
it('distinguishes HTML, corrupt JSON, invalid quota and expired response', async () => {
  for (const response of [
    new Response('<html>login</html>'),
    new Response('{', { headers: { 'content-type': 'application/json' } }),
    Response.json({ ...valid(), remaining: 99 }),
  ])
    await expect(readBudget(async () => response)).rejects.toThrow('형식')
  await expect(
    readBudget(async () => Response.json({ ...valid(), resetsAt: '2000-01-01' })),
  ).rejects.toThrow('시각')
})
it('distinguishes timeout from network failures', async () => {
  await expect(
    readBudget(async () => {
      throw new DOMException('timeout', 'TimeoutError')
    }),
  ).rejects.toThrow('시간 초과')
  await expect(
    readBudget(async () => {
      throw new TypeError('network')
    }),
  ).rejects.toThrow('네트워크')
})
