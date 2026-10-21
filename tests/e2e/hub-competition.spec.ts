import { expect, test } from '@playwright/test'
import { demoHub } from '../../src/providers/hub-client'

test('competition joins matching search volume and hands evidence to drafts without extra paid calls', async ({
  page,
}) => {
  let searchCalls = 0,
    generated = 0
  const queries: string[] = []
  await page.route('**/api/searchad/usage', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'mock' } } }),
  )
  await page.route('**/api/searchad/keyword?*', (route) => {
    searchCalls++
    const meta = {
      source: { id: 'searchad', label: '테스트 검색광고', mode: 'API' },
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
          data: { pc: 1000, mobile: 2500, total: 3500, period: 'recent-30-days' },
        },
        expansion: { ...meta, data: { keywords: [], kind: 'searchad-related' } },
        rows: [{ keyword: '분석 테스트', pc: 1000, mobile: 2500, total: 3500 }],
        cached: false,
      },
    })
  })
  await page.route('**/api/hub/query', async (route) => {
    const input = route.request().postDataJSON()
    queries.push(input.api)
    await route.fulfill({ json: { ...(await demoHub(input)), mode: 'LIVE' } })
  })
  await page.route('**/api/ai/**', (route) => {
    generated++
    return route.abort()
  })
  await page.goto('/keywords')
  const search = page.getByRole('region', { name: '검색광고 실시간 조회' })
  const competition = page.getByRole('region', { name: '키워드 경쟁 분석' })
  await search.getByLabel('조회할 키워드').fill('분석 테스트')
  expect(queries).toEqual([])
  expect(searchCalls).toBe(0)
  await search.getByRole('button', { name: '검색량 조회', exact: true }).click()
  await expect(search.getByText('LIVE · VERIFIED')).toBeVisible()
  await competition.getByRole('button', { name: '경쟁·트렌드 조회' }).click()
  await expect(competition.getByText('추가 조사 필요', { exact: true })).toBeVisible()
  await expect(competition.locator('tbody tr').first()).toContainText('3500')
  await expect(competition.locator('tbody tr').first()).toContainText('420')
  await expect(competition.locator('tbody tr').first()).toContainText('180')
  expect(queries).toEqual(['blog', 'cafe', 'trend'])
  expect(searchCalls).toBe(1)
  await search.getByLabel('조회할 키워드').fill('다른 키워드')
  await expect(competition.getByRole('button', { name: '원고 제작', exact: true })).toHaveCount(0)
  expect(queries).toHaveLength(3)
  await search.getByLabel('조회할 키워드').fill('분석 테스트')
  await competition.getByRole('button', { name: '원고 제작', exact: true }).click()
  await expect(page).toHaveURL(/\/manuscripts\?candidate=/)
  await expect(page.getByLabel('발행 후보')).not.toHaveValue('')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = localStorage.getItem('prismkit.manuscript-brief.v1')
        return saved ? JSON.parse(saved).keyword : null
      }),
    )
    .toBe('분석 테스트')
  const brief = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('prismkit.manuscript-brief.v1')!),
  )
  expect(brief.keyword).toBe('분석 테스트')
  expect(brief.evidence).toContain('블로그 420 / 카페 180')
  expect(generated).toBe(0)
})

test('competition preserves partial results after 429 and never retries or invents volume', async ({
  page,
}) => {
  const queries: string[] = []
  let searchCalls = 0
  await page.route('**/api/searchad/**', (route) => {
    searchCalls++
    return route.abort()
  })
  await page.route('**/api/hub/query', async (route) => {
    const input = route.request().postDataJSON()
    queries.push(input.api)
    if (input.api === 'blog')
      return route.fulfill({ status: 429, json: { error: { message: '호출 한도 차단' } } })
    await route.fulfill({ json: { ...(await demoHub(input)), mode: 'LIVE' } })
  })
  await page.goto('/keywords?keyword=부분결과')
  const competition = page.getByRole('region', { name: '키워드 경쟁 분석' })
  await competition.getByRole('button', { name: '경쟁·트렌드 조회' }).click()
  await expect(competition.getByRole('status')).toContainText('호출 한도 차단')
  await expect(competition.locator('tbody tr').first()).toContainText('180')
  await expect(competition.getByText('추가 조사 필요', { exact: true })).toBeVisible()
  expect(queries).toEqual(['blog', 'cafe', 'trend'])
  expect(searchCalls).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
