import { expect, test } from '@playwright/test'

test('manual research persists source, dates, bounds and edits without API calls', async ({
  page,
}, testInfo) => {
  const external: string[] = []
  page.on('request', (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url())
  })
  await page.goto('/keywords')
  await expect(page.getByText('DEMO · 샘플 데이터 모드')).toBeVisible()
  await page.getByRole('button', { name: '수동 자료 추가' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('핵심 키워드', { exact: true }).fill('가을 캠핑 조사')
  await dialog.getByLabel('관련 키워드 붙여넣기').fill('가을 캠핑, 텐트\n텐트;캠핑 장비')
  await dialog.getByLabel('검색 의도', { exact: true }).fill('구매 전 비교')
  await dialog.getByLabel('PC 월간 검색량', { exact: true }).fill('<10')
  await dialog.getByLabel('모바일 월간 검색량', { exact: true }).fill('200')
  await dialog.getByLabel('데이터 출처', { exact: true }).fill('사용자가 확인한 키워드 도구')
  await dialog.getByLabel('확인 날짜').fill('2026-01-01')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    testInfo.project.use.viewport!.width,
  )
  await page.screenshot({ path: testInfo.outputPath('manual-form.png') })
  await dialog.getByRole('button', { name: '수동 자료 저장' }).click()
  await expect(dialog).not.toBeVisible()
  await page.reload()
  const record = page.getByRole('article', { name: '가을 캠핑 조사 수동 분석' })
  await expect(record).toContainText('MANUAL · UNVERIFIED')
  await expect(record).toContainText('2026-01-01')
  await expect(record).toContainText('사용자가 확인한 키워드 도구')
  await expect(record.locator('dl')).toContainText('검색량 합계확인 불가')
  await expect(record.locator('dl')).toContainText('블로그 검색 결과 수확인 불가')
  await expect(record).toContainText('미분석 · 보류')
  await record.getByRole('button', { name: '가을 캠핑 조사 수동 자료 수정' }).click()
  await expect(dialog.getByLabel('PC 월간 검색량', { exact: true })).toHaveValue('<10')
  await dialog.getByLabel('PC 월간 검색량', { exact: true }).fill('0')
  await dialog.getByLabel('블로그 검색 결과 수', { exact: true }).fill('1500')
  await dialog.getByLabel('데이터 출처', { exact: true }).fill('수정한 출처')
  await dialog.getByLabel('확인 날짜').fill('2026-02-01')
  await dialog.getByRole('button', { name: '수동 자료 저장' }).click()
  await page.reload()
  await expect(record.locator('dl')).toContainText('검색량 합계200')
  await expect(record.locator('dl')).toContainText('블로그 검색 결과 수1,500')
  await expect(record).toContainText('수정한 출처')
  await expect(record).toContainText('2026-02-01')
  await expect(page.getByRole('article', { name: '가을 캠핑 조사 수동 분석' })).toHaveCount(1)
  await record.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('manual-result.png'), fullPage: true })
  expect(external).toEqual([])
})

test('corrupt research storage preserves data and leaves idea management usable', async ({
  page,
}) => {
  await page.goto('/keywords')
  await page.evaluate(() =>
    localStorage.setItem('prismkit.keyword-research.v1', 'corrupt-original'),
  )
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('원본은 보존')
  await expect(page.getByRole('button', { name: '수동 자료 추가' })).toBeDisabled()
  expect(await page.evaluate(() => localStorage.getItem('prismkit.keyword-research.v1'))).toBe(
    'corrupt-original',
  )
  await page.goto('/ideas')
  await page.getByRole('button', { name: '새 글감 추가' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
