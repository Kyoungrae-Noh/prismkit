import { expect, test } from '@playwright/test'
import { analyzeCandidates } from '../../src/domain/candidates'
const context = { topic: '온누리상품권', reviewmanTopics: [] },
  keyword = '온누리상품권 사용방법'
const candidate = {
  id: 'test-candidate',
  candidate: analyzeCandidates(
    [
      {
        keyword,
        pc: 100,
        mobile: 200,
        total: 300,
        collectedAt: new Date().toISOString(),
        source: 'E2E 수동 자료',
        mode: 'MANUAL',
      },
    ],
    context,
  )[0],
  context,
  ideaId: null,
  savedAt: new Date().toISOString(),
  ruleVersion: 'rules-v1',
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', () => {
    throw new Error('Unexpected API call')
  })
  await page.goto('/publishing')
  await page.evaluate(
    (item) =>
      localStorage.setItem('prismkit.candidates.v1', JSON.stringify({ version: 1, items: [item] })),
    candidate,
  )
  await page.goto('/publishing?candidate=test-candidate')
})
test('manual competition, URL validation, screenshot save/remove and reload', async ({
  page,
}, testInfo) => {
  await expect(page.getByRole('region', { name: '통합 발행 판단' })).toContainText(
    'PC 100 / 모바일 200',
  )
  await page.getByRole('button', { name: '경쟁 자료 입력·수정' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('검색 결과 URL', { exact: true }).fill('https://example.com/')
  await dialog.getByRole('button', { name: '경쟁 자료 저장' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await dialog.getByRole('button', { name: '검색 URL 채우기' }).click()
  await dialog.getByLabel('검색 확인 날짜').fill(new Date().toISOString().slice(0, 10))
  await dialog.getByLabel('블로그 콘텐츠 노출').selectOption('yes')
  await dialog.getByText('캡처 근거 (선택)', { exact: true }).click()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  )
  await dialog
    .getByLabel('검색 화면 캡처')
    .setInputFiles({ name: 'capture.png', mimeType: 'image/png', buffer: png })
  await expect(dialog.getByRole('img')).toBeVisible()
  await dialog.getByRole('button', { name: '경쟁 자료 저장' }).click()
  await page.reload()
  await expect(page.getByRole('region', { name: '통합 발행 판단' })).toContainText('캡처 1장')
  await expect(page.getByRole('region', { name: '통합 발행 판단' })).toContainText(
    '최종 판단: 추가 조사 필요',
  )
  await page.getByRole('button', { name: '경쟁 자료 입력·수정' }).click()
  await dialog.getByText('캡처 근거 (선택)', { exact: true }).click()
  await expect(dialog.getByRole('img')).toBeVisible()
  await dialog.getByRole('button', { name: '이미지 삭제' }).click()
  await dialog.getByRole('button', { name: '경쟁 자료 저장' }).click()
  await page.reload()
  await expect(page.getByRole('region', { name: '통합 발행 판단' })).toContainText('캡처 0장')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('publishing.png'), fullPage: true })
})
test('manual history, three accounts, status edits and duplicate warning', async ({ page }) => {
  await page.getByRole('button', { name: '이 후보 발행 계획 등록' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('블로그 계정').selectOption('nkr09135')
  await dialog.getByLabel('글 제목', { exact: true }).fill('사용방법 안내')
  await dialog.getByRole('button', { name: '발행 이력 저장' }).click()
  await expect(page.getByRole('region', { name: '통합 발행 판단' })).toContainText(
    'nkr09135: 동일 키워드',
  )
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await dialog.getByLabel('발행 상태').selectOption('drafting')
  await dialog.getByRole('button', { name: '발행 이력 저장' }).click()
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: '사용방법 안내' })).toContainText('작성 중')
  for (const account of ['nkr09134', 'nkr09135', 'nkr09136'])
    await page.getByLabel(`${account} 이력 확인 완료`).check()
  await page.reload()
  await expect(page.getByLabel('nkr09136 이력 확인 완료')).toBeChecked()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '발행 자료 JSON 내보내기' }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('prismkit-publishing.json')
})
test('JSON import is validated, merge-safe and restored', async ({ page }) => {
  const data = {
    version: 1,
    publications: [
      {
        id: 'import1',
        account: 'nkr09136',
        keyword: '온누리상품권 환불방법',
        topic: '온누리상품권',
        title: '환불 안내',
        status: 'published',
        date: new Date().toISOString().slice(0, 10),
        blogUrl: 'https://blog.naver.com/nkr09136/123',
        reviewmanUrl: 'https://reviewman.kr/refund',
        ideaId: null,
      },
    ],
  }
  const upload = page.getByLabel('발행 자료 JSON 가져오기')
  await upload.setInputFiles({
    name: 'history.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  })
  await expect(page.getByRole('status')).toContainText('1개 추가')
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: '환불 안내' })).toContainText('발행 완료')
  await expect(page.getByRole('region', { name: '통합 발행 판단' })).toContainText(
    '의도가 다를 수 있어',
  )
  await upload.setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '환불 안내' })).toBeVisible()
})
