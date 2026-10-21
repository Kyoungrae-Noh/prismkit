import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from './app'
import { WorkspaceProvider } from './workspace'
import { createLocalRepository, STORAGE_KEY } from '../data/local-repository'

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceProvider repository={createLocalRepository(localStorage)}>
        <App />
      </WorkspaceProvider>
    </MemoryRouter>,
  )
}
describe('Phase 0 workspace flows', () => {
  it('shows the dashboard, sample notice and navigates to data connections', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByRole('heading', { name: /콘텐츠의 다음 기회를/ })).toBeInTheDocument()
    expect(
      screen.getByText('2026년 9월의 가상 데이터 · 실제 검색 통계가 아닙니다.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '데이터 연결' }))
    expect(await screen.findByRole('heading', { name: /데이터 연결/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /다음 Phase에서 제공/ })).toHaveLength(3)
    expect(
      screen
        .getAllByRole('button', { name: /다음 Phase에서 제공/ })
        .every((button) => button.hasAttribute('disabled')),
    ).toBe(true)
  })
  it('creates, searches, edits and deletes a persisted idea', async () => {
    const user = userEvent.setup()
    renderApp('/ideas')
    await user.click(await screen.findByRole('button', { name: '새 글감 추가' }))
    const form = within(screen.getByRole('dialog'))
    await user.type(form.getByLabelText(/제목/), '테스트 콘텐츠 기획')
    await user.type(form.getByLabelText(/핵심 키워드/), '콘텐츠 전략')
    await user.click(form.getByRole('button', { name: '글감 추가' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.type(screen.getByRole('textbox', { name: '글감 검색' }), '테스트 콘텐츠')
    await user.click(screen.getByRole('button', { name: '테스트 콘텐츠 기획 수정' }))
    const edit = within(screen.getByRole('dialog'))
    await user.selectOptions(edit.getByLabelText('진행 상태'), 'drafting')
    await user.click(edit.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY)!).ideas.find(
        (idea: { title: string }) => idea.title === '테스트 콘텐츠 기획',
      ).status,
    ).toBe('drafting')
    await user.click(screen.getByRole('button', { name: '테스트 콘텐츠 기획 삭제' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제하기' }))
    expect(await screen.findByText('표시할 글감이 없어요')).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('테스트 콘텐츠 기획')
  })
  it('filters, sorts keywords and saves a keyword as an idea without contacting a provider', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderApp('/keywords')
    await user.click(await screen.findByText('DEMO 예시 살펴보기 · 실제 분석과 무관한 가상 데이터'))
    const search = await screen.findByRole('textbox', { name: '키워드 검색' })
    await user.selectOptions(screen.getByLabelText('키워드 정렬'), 'volume')
    expect(
      within(within(screen.getByLabelText('DEMO 예시 영역')).getAllByRole('row')[1]).getByText(
        '건강한 식단',
      ),
    ).toBeInTheDocument()
    await user.type(search, '없는 키워드')
    expect(screen.getByText('일치하는 샘플 키워드가 없어요')).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, '여행')
    await user.click(screen.getByRole('button', { name: '가을 국내 여행 상세 보기' }))
    expect(within(screen.getByRole('dialog')).getByText('단풍 여행')).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: '닫기' })[0])
    await user.clear(search)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ideas: [] }))
    window.dispatchEvent(new StorageEvent('storage'))
    const save = await screen.findByRole('button', { name: 'AI 생산성 도구 글감으로 저장' })
    await user.click(save)
    const form = within(screen.getByRole('dialog'))
    expect(form.getByLabelText(/핵심 키워드/)).toHaveValue('AI 생산성 도구')
    await user.type(form.getByLabelText(/제목/), 'AI로 반복 업무 줄이기')
    await user.click(form.getByRole('button', { name: '글감 추가' }))
    expect(
      await screen.findByRole('button', { name: 'AI 생산성 도구 글감에 저장됨' }),
    ).toBeDisabled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('supports status deep links and board view', async () => {
    const user = userEvent.setup()
    renderApp('/ideas?status=drafting')
    await user.click(await screen.findByRole('button', { name: '보드 보기' }))
    expect(screen.getByText('내 하루를 바꾸는 작은 루틴, 모닝 저널 시작하기')).toBeInTheDocument()
    expect(screen.queryByText('주말에 떠나는 가을 숲 여행')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '보드 보기' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
  it('shows a recoverable error without overwriting corrupt local data', async () => {
    localStorage.setItem(STORAGE_KEY, 'corrupt-data')
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent('원본 데이터는 보존')
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('corrupt-data')
  })
  it('provides navigation for unknown routes', async () => {
    renderApp('/does-not-exist')
    expect(
      await screen.findByRole('heading', { name: '페이지를 찾을 수 없어요' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '대시보드로 이동' })).toHaveAttribute('href', '/')
  })
})
