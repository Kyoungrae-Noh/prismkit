import { test, expect } from '@playwright/test'
import { demoHub } from '../../src/providers/hub-client'

test('one analysis joins exact core demand, competition, trend and explicit fact review into the original-title draft', async ({
  page,
}, info) => {
  const title = '카카오뱅크 비상금대출 연장 가능성',
    core = '카카오뱅크 비상금대출'
  const queries: string[] = []
  let volumeCalls = 0,
    paid = 0
  await page.route('**/api/hub/status', (r) =>
    r.fulfill({
      json: {
        configured: true,
        limits: { daily: 30, monthly: 300, intervalMs: 1000, cacheSeconds: 300 },
        apis: ['blog', 'cafe', 'kin', 'news', 'trend', 'shopping'].map((api) => ({
          api,
          enabled: true,
          reason: 'mock',
          dailyUsed: 0,
          monthlyUsed: 0,
          blocked: false,
        })),
      },
    }),
  )
  await page.route('**/api/hub/query', async (route) => {
    const r = route.request().postDataJSON()
    queries.push(r.api)
    const response = { ...(await demoHub(r)), mode: 'LIVE' }
    if (['kin', 'news'].includes(r.api))
      response.items = [
        {
          title,
          url: `https://example.com/${r.api}`,
          description: '원문 내용은 별도 확인',
          date: null,
          dateKind: 'unavailable',
          source: 'mock',
          apiPosition: 1,
          originalUrl: null,
        },
      ]
    else {
      expect(r.query).toBe(core)
      if (r.api === 'blog') response.total = 6008
      if (r.api === 'cafe') response.total = 1200
    }
    await route.fulfill({ json: response })
  })
  await page.route('**/api/searchad/keyword?*', (route) => {
    volumeCalls++
    expect(new URL(route.request().url()).searchParams.get('keyword')).toBe(core)
    const meta = {
      source: { id: 'searchad', label: '네이버 검색광고', mode: 'API' },
      verification: 'VERIFIED',
      collectedAt: new Date().toISOString(),
      checkedDate: '2026-10-21',
      error: null,
      missing: [],
    }
    return route.fulfill({
      json: {
        volume: {
          ...meta,
          data: { pc: 2000, mobile: 10000, total: 12000, period: 'recent-30-days' },
        },
        expansion: { ...meta, data: { keywords: ['비상금대출 금리'], kind: 'searchad-related' } },
        rows: [
          { keyword: core.replace(/ /g, ''), pc: 2000, mobile: 10000, total: 12000 },
          { keyword: '비상금대출 금리', pc: 10, mobile: 20, total: 30 },
        ],
        cached: false,
      },
    })
  })
  await page.route('**/api/ai/**', (route) => {
    paid++
    return route.abort()
  })
  await page.goto('/ideas')
  const panel = page.getByRole('region', { name: 'API 글감 발굴' })
  await panel.getByLabel('나의 관심 주제').fill('경제 금융')
  await panel.getByRole('button', { name: '글감 발굴', exact: true }).click()
  const rows = panel.locator('.discovery-table tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.first().getByRole('button')).toHaveCount(1)
  await expect(rows.first()).toContainText('최대 4회')
  expect(volumeCalls).toBe(0)
  await rows.first().getByRole('button', { name: '상세 분석', exact: true }).click()
  const detail = page.getByRole('region', { name: '통합 상세 분석' })
  await expect(detail.getByRole('button', { name: '분석 다시 실행' })).toBeEnabled()
  await expect(detail.locator('.analysis-summary')).toContainText('12000')
  await expect(detail.locator('.analysis-summary')).toContainText('6008')
  await expect(detail.locator('.analysis-summary')).toContainText('1200')
  await expect(detail.getByText('추가 조사 필요', { exact: true })).toBeVisible()
  expect(volumeCalls).toBe(1)
  expect(queries).toEqual(['kin', 'news', 'blog', 'cafe', 'trend'])
  await rows.first().getByRole('button', { name: '상세 분석', exact: true }).click()
  expect(volumeCalls).toBe(1)
  expect(queries).toHaveLength(5)
  await detail.getByRole('button', { name: '분석 다시 실행' }).click()
  await expect(detail.getByRole('button', { name: '분석 다시 실행' })).toBeEnabled()
  await detail.getByText('근거 보기 · 조회 상태·시각', { exact: true }).click()
  await expect(detail.getByRole('cell', { name: '캐시', exact: true })).toHaveCount(4)
  expect(volumeCalls).toBe(1)
  expect(queries).toHaveLength(5)
  await detail.getByRole('button', { name: '후보 저장', exact: true }).click()
  await detail.getByText('평가 근거·사용자 확인 (외부 호출 없음)', { exact: true }).click()
  await detail.getByLabel('Reviewman 수익화 적합성').selectOption('fit')
  await detail
    .getByLabel('Reviewman 활용 근거')
    .fill('경제 분야의 공식 안내와 조건 비교 콘텐츠로 연결')
  await expect(detail.getByText('추가 조사 필요', { exact: true })).toBeVisible()
  await detail.getByLabel('공식 출처 URL').fill('https://example.com/official-mock')
  await detail
    .getByLabel('공식 원문 확인 내용')
    .fill('테스트용 공식 조건·기준일 대조 기록이며 실제 금융 안내가 아닙니다.')
  await detail.getByRole('button', { name: '공식 확인 기록', exact: true }).click()
  expect(volumeCalls).toBe(1)
  expect(queries).toHaveLength(5)
  await detail.screenshot({ path: `test-results/integrated-${info.project.name}.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await detail.getByRole('button', { name: '원고 제작', exact: true }).click()
  await expect(page).toHaveURL(/\/manuscripts\?candidate=/)
  await expect(page.getByLabel('발행 후보')).not.toHaveValue('')
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('prismkit.manuscript-brief.v1') ?? 'null')?.keyword,
      ),
    )
    .toBe(core)
  const saved = await page.evaluate(() => ({
    brief: JSON.parse(localStorage.getItem('prismkit.manuscript-brief.v1')!),
    candidates: JSON.parse(localStorage.getItem('prismkit.candidates.v1')!),
  }))
  expect(saved.brief.topic).toBe(title)
  expect(saved.brief.evidence).toContain('블로그 6008 / 카페 1200')
  expect(saved.brief.evidence).toContain('12000')
  expect(saved.brief.evidence).toContain('상대 지표')
  expect(saved.brief.sources).toHaveLength(1)
  expect(saved.brief.sources[0].url).toBe('https://example.com/official-mock')
  expect(saved.candidates.items[0].analysisHistory).toHaveLength(1)
  expect(paid).toBe(0)
})
