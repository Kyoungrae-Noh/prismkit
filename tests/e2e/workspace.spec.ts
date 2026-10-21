import { expect, test } from '@playwright/test'

test('all routes render without page overflow or runtime errors', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const [path, heading] of [
    ['/', '콘텐츠의 다음 기회를'],
    ['/ideas', '글감 관리'],
    ['/keywords', '키워드 분석'],
    ['/connections', '데이터 연결'],
    ['/backup', '백업·복원'],
    ['/publishing', '경쟁 분석'],
    ['/captures', '캡처 글감 수집'],
    ['/recommendations', '발행 후보 TOP 10'],
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: new RegExp(heading), level: 1 })).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`${path === '/' ? 'dashboard' : path.slice(1)}.png`),
      fullPage: true,
    })
  }
  expect(errors).toEqual([])
})

test('create, reload, edit, cancel with Escape, and use navigation', async ({ page }, testInfo) => {
  await page.goto('/ideas')
  await page.getByRole('button', { name: '새 글감 추가' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('제목', { exact: false }).fill('브라우저 테스트 글감')
  await dialog.getByLabel('핵심 키워드', { exact: false }).fill('자동화')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    testInfo.project.use.viewport!.width,
  )
  await page.screenshot({ path: testInfo.outputPath('idea-dialog.png') })
  await dialog.getByRole('button', { name: '글감 추가', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '브라우저 테스트 글감 수정' }).click()
  await expect(dialog.getByLabel('핵심 키워드', { exact: false })).toHaveValue('자동화')
  await dialog.getByLabel('진행 상태').selectOption('drafting')
  await dialog.getByRole('button', { name: '변경사항 저장' }).click()
  await page.reload()
  await page.getByRole('button', { name: '브라우저 테스트 글감 수정' }).click()
  await expect(dialog.getByLabel('진행 상태')).toHaveValue('drafting')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  if (testInfo.project.name !== 'desktop') {
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click()
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible()
  }
  await page.getByRole('link', { name: '키워드 분석', exact: true }).click()
  await expect(page).toHaveURL(/\/keywords$/)
  await page.getByText('DEMO 예시 살펴보기 · 실제 분석과 무관한 가상 데이터').click()
  await page.getByRole('textbox', { name: '키워드 검색' }).fill('AI')
  await expect(page.getByRole('button', { name: 'AI 생산성 도구 상세 보기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '모닝 루틴 상세 보기' })).toHaveCount(0)
})
