import { expect, test } from '@playwright/test'
const at = '2026-10-19T10:24:17.896Z'
const meta = {
  source: { id: 'searchad', label: '네이버 검색광고 키워드 도구', mode: 'API' },
  verification: 'VERIFIED',
  collectedAt: at,
  checkedDate: '2026-10-19',
  error: null,
  missing: [],
}
const response = {
  volume: { ...meta, data: { pc: 100, mobile: 200, total: 300, period: 'recent-30-days' } },
  expansion: { ...meta, data: { keywords: ['관련 예시'], kind: 'searchad-related' } },
  rows: [
    { keyword: '테스트 키워드', pc: 100, mobile: 200, total: 300 },
    { keyword: '관련 예시', pc: '<10', mobile: 500, total: null },
  ],
  cached: false,
}
test('LIVE requires a button request; displays counts, bounds, sorting and safe failures (mock)', async ({
  page,
}, testInfo) => {
  await page.route('**/api/searchad/usage', (route) =>
    route.fulfill({ status: 503, json: { error: { message: '모의 예산 확인 불가' } } }),
  )
  let requests = 0
  await page.route('**/api/searchad/keyword?*', async (route) => {
    requests++
    expect(route.request().headers()['x-prismkit-request']).toBe('keyword-query')
    await route.fulfill({
      status: requests === 1 ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(
        requests === 1
          ? response
          : { error: { code: 'AUTH', message: '검색광고 인증에 실패했습니다.' } },
      ),
    })
  })
  await page.goto('/keywords')
  const envResponse = await page.request.get('/.env')
  expect(envResponse.status()).toBe(403)
  const panel = page.getByRole('region', { name: '검색광고 실시간 조회' })
  await expect(panel.getByText('LIVE · VERIFIED')).toHaveCount(0)
  await panel.getByLabel('조회할 키워드').fill('테스트 키워드')
  expect(requests).toBe(0)
  await panel.getByRole('button', { name: '검색량 조회', exact: true }).click()
  await expect(panel.getByText('LIVE · VERIFIED')).toBeVisible()
  await expect(panel.getByRole('heading', { name: '조회 결과: 테스트 키워드' })).toBeVisible()
  await expect(panel.getByText('<10', { exact: true })).toBeVisible()
  await expect(panel.getByText('확인 불가', { exact: true })).toBeVisible()
  await expect(panel.locator('time')).toHaveAttribute('datetime', at)
  await panel.getByLabel('실제 검색량 정렬').selectOption('mobile')
  await expect(panel.locator('tbody tr').first()).toContainText('관련 예시')
  expect(requests).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    testInfo.project.use.viewport!.width,
  )
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('live-mocked.png'), fullPage: true })
  await panel.getByRole('button', { name: '검색량 조회', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('인증에 실패')
  await expect(panel.getByText('LIVE · VERIFIED')).toHaveCount(0)
  expect(requests).toBe(2)
  await expect(page.getByRole('button', { name: '수동 자료 추가' })).toBeEnabled()
})
