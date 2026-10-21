import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi } from 'vitest'
import { LiveKeywords } from './live-keywords'
it('shows budget loading, failure, manual retry and success independently of Naver status', async () => {
  let finish: (r: Response) => void = () => {}
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValueOnce(
      Response.json({
        used: 1,
        remaining: 9,
        limit: 10,
        day: '2026-10-21',
        resetsAt: new Date(Date.now() + 86400000).toISOString(),
        blocked: false,
        migration: true,
        lastQueryAt: null,
      }),
    )
  render(<LiveKeywords keyword="" onKeywordChange={() => {}} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '호출 예산 확인' }))
  expect(screen.getByRole('button', { name: '예산 조회 중…' })).toBeDisabled()
  finish(new Response('', { status: 401 }))
  expect(await screen.findByRole('alert')).toHaveTextContent('인증')
  expect(fetcher).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: '호출 예산 확인' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('예산 조회 성공'))
  expect(screen.getByText(/네이버 API 연결 상태/)).toHaveTextContent('확인 불가')
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls.every(([url]) => url === '/api/searchad/usage')).toBe(true)
})
