import { test, expect } from '@playwright/test'
import { demoHub } from '../../src/providers/hub-client'
import { mockAnalysisBudget } from './analysis-mocks'

test('selected dual quick analysis deduplicates, survives reload, reuses detail data and renders desktop/mobile comparisons', async ({
  page,
}, info) => {
  const main = '카카오뱅크 비상금대출',
    first = main + ' 연장 가능성',
    second = main + ' 해지 방법',
    untouched = '여행 예약 취소 방법'
  const hub: { api: string; query: string; display?: number }[] = [],
    searches: string[] = []
  let ai = 0
  await mockAnalysisBudget(page)
  await page.route('**/api/hub/status', (r) =>
    r.fulfill({
      json: {
        configured: true,
        limits: { daily: 30, monthly: 300, intervalMs: 1000, cacheSeconds: 300 },
        apis: ['blog', 'cafe', 'kin', 'news', 'trend', 'shopping'].map((api) => ({
          api,
          enabled: true,
          blocked: false,
          reason: 'mock',
          dailyUsed: 0,
          monthlyUsed: 0,
        })),
      },
    }),
  )
  await page.route('**/api/hub/query', async (route) => {
    const r = route.request().postDataJSON()
    hub.push(r)
    const value = { ...(await demoHub(r)), mode: 'LIVE' }
    if (['kin', 'news'].includes(r.api))
      value.items = [first, second, untouched].map((title, i) => ({
        title,
        description: '테스트 요약',
        url: `https://example.com/${r.api}/${i}`,
        originalUrl: null,
        date: null,
        dateKind: 'unavailable',
        source: 'mock',
        apiPosition: i + 1,
      }))
    if (r.api === 'blog') value.total = r.query === main ? 6008 : r.query.includes('연장') ? 88 : 33
    await route.fulfill({ json: value })
  })
  await page.route('**/api/searchad/keyword?*', (r) => {
    const keyword = new URL(r.request().url()).searchParams.get('keyword')!
    searches.push(keyword)
    const meta = {
      source: { id: 'searchad', label: 'mock', mode: 'API' },
      verification: 'VERIFIED',
      collectedAt: new Date().toISOString(),
      checkedDate: null,
      error: null,
      missing: [],
    }
    return r.fulfill({
      json: {
        cached: false,
        volume: {
          ...meta,
          data: { pc: 2000, mobile: 10000, total: 12000, period: 'recent-30-days' },
        },
        expansion: { ...meta, data: { keywords: [], kind: 'searchad-related' } },
        rows: [
          { keyword: main, pc: 2000, mobile: 10000, total: 12000 },
          { keyword: main + ' 연장', pc: 50, mobile: 300, total: 350 },
          { keyword: main + ' 해지 방법', pc: '<10', mobile: 10, total: null },
        ],
      },
    })
  })
  await page.route('**/api/ai/**', (r) => {
    ai++
    return r.abort()
  })
  await page.goto('/ideas')
  const panel = page.getByRole('region', { name: 'API 글감 발굴' })
  await panel.getByLabel('나의 관심 주제').fill('경제 금융')
  await expect(panel.getByLabel('수집 개수')).toHaveValue('10')
  await panel.getByLabel('수집 개수').fill('60')
  await panel.getByRole('button', { name: '글감 발굴', exact: true }).click()
  const rows = panel.locator('.dual-table tbody tr')
  await expect(rows).toHaveCount(3)
  expect(hub.slice(0, 2).every((r) => r.display === 30)).toBe(true)
  await expect(panel.getByRole('button', { name: '후보 빠른 분석' })).toBeDisabled()
  await expect(rows.first()).toContainText('미조회')
  expect(searches).toHaveLength(0)
  await panel.getByLabel(`분석 선택: ${first}`, { exact: true }).check()
  await panel.getByLabel(`분석 선택: ${second}`, { exact: true }).check()
  await expect(panel).toContainText('고유 키워드 3개')
  await panel.getByRole('button', { name: '후보 빠른 분석' }).click()
  await expect(panel.getByRole('button', { name: '후보 빠른 분석' })).toBeEnabled({
    timeout: 15000,
  })
  const firstRow = rows.filter({ hasText: first }),
    secondRow = rows.filter({ hasText: second }),
    untouchedRow = rows.filter({ hasText: untouched })
  await expect(firstRow).toContainText('12000')
  await expect(firstRow).toContainText('350')
  await expect(firstRow).toContainText('6008')
  await expect(firstRow).toContainText('88')
  await expect(secondRow).toContainText('미확인')
  await expect(untouchedRow).toContainText('미조회')
  expect(searches).toEqual([main])
  expect(hub.filter((r) => r.api === 'blog')).toHaveLength(3)
  expect(hub.some((r) => r.query.includes('여행'))).toBe(false)
  await panel.getByLabel('후보 정렬').selectOption('volume')
  await expect(rows.first()).toContainText(first)
  await panel.getByLabel('후보 정렬').selectOption('ratio')
  await expect(panel).toContainText('실험용 참고 비율')
  await page.reload()
  await expect(panel.getByLabel('나의 관심 주제')).toHaveValue('경제 금융')
  await expect(panel.getByLabel('수집 개수')).toHaveValue('60')
  await expect(firstRow).toContainText('350')
  expect(searches).toHaveLength(1)
  await expect(panel.getByRole('button', { name: '후보 빠른 분석' })).toBeDisabled()
  const before = hub.length
  await firstRow.getByRole('button', { name: '상세 분석' }).click()
  const detail = page.getByRole('region', { name: '통합 상세 분석' })
  await expect(detail.getByRole('button', { name: '분석 다시 실행' })).toBeEnabled({
    timeout: 15000,
  })
  expect(searches).toHaveLength(1)
  expect(
    hub
      .slice(before)
      .map((r) => r.api)
      .sort(),
  ).toEqual(['cafe', 'cafe', 'trend'])
  await expect(page.getByRole('region', { name: '메인·세부 비교' })).toContainText('12000')
  await expect(detail.locator('.analysis-summary')).toContainText('350')
  await panel.screenshot({ path: `test-results/dual-${info.project.name}.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (info.project.name === 'desktop')
    expect(
      await rows
        .first()
        .locator('..')
        .locator('..')
        .evaluate((el) => el.scrollWidth <= el.parentElement!.clientWidth),
    ).toBe(true)
  if (info.project.name !== 'desktop') await expect(rows.first()).toHaveCSS('display', 'grid')
  await detail.getByRole('button', { name: '원고 제작', exact: true }).click()
  await expect(page).toHaveURL(/\/manuscripts/)
  const brief = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('prismkit.manuscript-brief.v1')!),
  )
  expect(brief.keyword).toBe(main + ' 연장')
  expect(brief.topic).toBe(first)
  expect(brief.evidence).toContain('메인 키워드')
  expect(brief.evidence).toContain('세부 키워드')
  expect(brief.evidence).toContain('350')
  expect(ai).toBe(0)
})

test('exhausted SearchAd budget stops a selected batch and preserves all unprocessed candidates without retry', async ({
  page,
}) => {
  await mockAnalysisBudget(page, 0)
  let paid = 0,
    blogs = 0
  await page.route('**/api/hub/status', (r) =>
    r.fulfill({
      json: {
        configured: true,
        limits: { daily: 30, monthly: 300, intervalMs: 1000, cacheSeconds: 300 },
        apis: ['blog', 'cafe', 'kin', 'news', 'trend', 'shopping'].map((api) => ({
          api,
          enabled: true,
          blocked: false,
          reason: 'mock',
          dailyUsed: 0,
          monthlyUsed: 0,
        })),
      },
    }),
  )
  await page.route('**/api/hub/query', async (r) => {
    const body = r.request().postDataJSON()
    if (body.api === 'blog') blogs++
    return r.fulfill({ json: { ...(await demoHub(body)), mode: 'LIVE' } })
  })
  await page.route('**/api/searchad/keyword?*', (r) => {
    paid++
    return r.abort()
  })
  await page.goto('/ideas')
  const p = page.getByRole('region', { name: 'API 글감 발굴' })
  await p.getByLabel('나의 관심 주제').fill('여행')
  await p.getByRole('button', { name: '글감 발굴', exact: true }).click()
  await p.getByLabel('현재 목록 선택').check()
  const preservedCount = await p.locator('.dual-table tbody tr').count()
  await p.getByRole('button', { name: '후보 빠른 분석' }).click()
  await expect(p.getByRole('button', { name: '후보 빠른 분석' })).toBeEnabled()
  await expect(p).toContainText('빠른 분석 중단')
  expect(paid).toBe(0)
  expect(blogs).toBe(0)
  await expect(p.locator('.dual-table tbody tr')).toHaveCount(preservedCount)
  await expect(p).toContainText('미조회')
})
