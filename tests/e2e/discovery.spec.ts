import { test, expect } from '@playwright/test'
import { demoHub } from '../../src/providers/hub-client'
import { mockAnalysisBudget } from './analysis-mocks'

test('mock-authorized discovery hands selected evidence to manuscripts without generating or claiming official sources', async ({
  page,
}) => {
  let generated = 0,
    searchadCalls = 0
  await page.route('**/api/hub/status', (route) =>
    route.fulfill({
      json: {
        configured: true,
        limits: { daily: 30, monthly: 300, intervalMs: 1000, cacheSeconds: 300 },
        apis: ['blog', 'cafe', 'kin', 'news', 'trend', 'shopping'].map((api) => ({
          api,
          enabled: true,
          reason: 'mock permission only',
          dailyUsed: 0,
          monthlyUsed: 0,
          blocked: false,
        })),
      },
    }),
  )
  await page.route('**/api/hub/query', async (route) => {
    const r = route.request().postDataJSON()
    const result = await demoHub(r)
    await route.fulfill({ json: { ...result, mode: 'LIVE' } })
  })
  await page.route('**/api/searchad/**', (route) => {
    searchadCalls++
    return route.fulfill({ status: 429, json: { error: { message: 'mock budget limit' } } })
  })
  await mockAnalysisBudget(page)
  await page.route('**/api/ai/**', (route) => {
    generated++
    return route.abort()
  })
  await page.goto('/ideas')
  const panel = page.getByRole('region', { name: 'API 글감 발굴' })
  await panel.getByLabel('나의 관심 주제').fill('새로운 관심 주제')
  await panel.getByRole('button', { name: '글감 발굴', exact: true }).click()
  expect(searchadCalls).toBe(0)
  await panel.getByRole('button', { name: '상세 분석', exact: true }).first().click()
  await expect(panel.getByRole('status')).toContainText('mock budget limit')
  expect(searchadCalls).toBe(1)
  await panel.getByRole('button', { name: '원고 제작', exact: true }).first().click()
  await expect(page).toHaveURL(/\/manuscripts\?candidate=/)
  await expect(page.getByLabel('발행 후보')).not.toHaveValue('')
  const brief = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('prismkit.manuscript-brief.v1')!),
  )
  expect(brief.keyword).toContain('새로운 관심 주제')
  expect(brief.evidence).toContain('발굴 검토:')
  expect(brief.evidence).toContain('실제 검색량')
  expect(brief.sources).toEqual([])
  expect(generated).toBe(0)
})
test('discovery stays in ideas, handles policy hold, runs explicit DEMO and preserves saved candidates', async ({
  page,
}) => {
  let external = 0,
    hubQueries = 0
  await page.route('**/api/hub/status', (route) =>
    route.fulfill({
      json: {
        configured: true,
        limits: { daily: 30, monthly: 300, intervalMs: 1000, cacheSeconds: 300 },
        apis: ['blog', 'cafe', 'kin', 'news', 'trend', 'shopping'].map((api) => ({
          api,
          enabled: false,
          reason: '이용 조건 확인 필요',
          dailyUsed: 0,
          monthlyUsed: 0,
          blocked: false,
        })),
      },
    }),
  )
  await page.route('**/api/hub/query', (route) => {
    hubQueries++
    return route.abort()
  })
  await page.route('**/api/searchad/**', (route) => {
    external++
    return route.abort()
  })
  await page.route('**/api/ai/**', (route) => {
    external++
    return route.abort()
  })
  await page.goto('/ideas')
  const panel = page.getByRole('region', { name: 'API 글감 발굴' })
  await panel.getByLabel('나의 관심 주제').fill('여행 예약')
  await panel.getByRole('button', { name: '글감 발굴', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('LIVE 발굴 보류')
  await panel.getByText('고급 설정·API 상태·실험용 필터').click()
  await panel.getByLabel('실행 모드').selectOption('DEMO')
  await panel.getByRole('button', { name: '글감 발굴', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('외부 API는 호출하지 않았습니다')
  await panel.getByRole('button', { name: '상세 분석', exact: true }).first().click()
  await expect(panel.getByText('DEMO — 발행 판단 보류', { exact: true }).first()).toBeVisible()
  await expect(panel.getByRole('button', { name: '원고 제작', exact: true }).first()).toBeDisabled()
  await panel.getByRole('button', { name: '후보 저장', exact: true }).first().click()
  await expect(panel.getByRole('status')).toContainText('전체 JSON 백업')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('prismkit.candidates.v1')!).items[0].candidate.mode,
    ),
  ).toBe('DEMO')
  expect(hubQueries).toBe(0)
  expect(external).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await panel.getByText('고급 설정·API 상태·실험용 필터').click()
  await panel.screenshot({ path: `test-results/discovery-${test.info().project.name}.png` })
  await page.reload()
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('prismkit.candidates.v1')!).items.length,
    ),
  ).toBeGreaterThan(0)
})
test('discovery shows status errors and composing Korean text does not issue queries', async ({
  page,
}) => {
  let queries = 0
  await page.route('**/api/hub/status', (route) =>
    route.fulfill({ status: 401, json: { error: { message: '관리자 로그인 필요' } } }),
  )
  await page.route('**/api/hub/query', (route) => {
    queries++
    return route.abort()
  })
  await page.goto('/ideas')
  const panel = page.getByRole('region', { name: 'API 글감 발굴' }),
    input = panel.getByLabel('나의 관심 주제')
  await input.focus()
  const session = await page.context().newCDPSession(page)
  await session.send('Input.imeSetComposition', {
    text: '한글 관심 주제',
    selectionStart: 8,
    selectionEnd: 8,
  })
  await expect(input).toHaveValue('한글 관심 주제')
  await session.send('Input.insertText', { text: '한글 관심 주제' })
  expect(queries).toBe(0)
  await panel.getByRole('button', { name: '연결 상태 확인' }).click()
  await expect(panel.getByRole('status')).toContainText('관리자 로그인 필요')
  await expect(panel.getByRole('button', { name: '연결 상태 확인' })).toBeEnabled()
})
