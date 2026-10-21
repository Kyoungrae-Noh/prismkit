import { expect, test } from '@playwright/test'
const at = '2026-10-21T01:00:00.000Z'
const meta = {
  source: { id: 'searchad', label: '모의 네이버 검색광고', mode: 'API' },
  verification: 'VERIFIED',
  collectedAt: at,
  checkedDate: '2026-10-21',
  error: null,
  missing: [],
}
const response = {
  volume: { ...meta, data: { pc: 100, mobile: 500, total: 600, period: 'recent-30-days' } },
  expansion: { ...meta, data: { keywords: [], kind: 'searchad-related' } },
  rows: [{ keyword: '상품권 신청', pc: 100, mobile: 500, total: 600 }],
  cached: false,
  usage: {
    used: 1,
    remaining: 29,
    limit: 30,
    day: '2026-10-21',
    resetsAt: '2026-10-21T15:00:00Z',
    lastQueryAt: at,
    blocked: false,
    migration: false,
  },
}
test('idea to LIVE analysis, strict document preset, linked save and competition', async ({
  page,
}) => {
  let calls = 0
  await page.route('**/api/**', (route) => {
    if (route.request().url().includes('/usage')) return route.fulfill({ json: response.usage })
    calls++
    return route.fulfill({ json: response })
  })
  await page.goto('/ideas')
  await page.getByRole('button', { name: '새 글감 추가' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('제목', { exact: false }).fill('Phase 3 실사용 글감')
  await dialog.getByLabel('핵심 키워드', { exact: false }).fill('상품권 신청')
  await dialog.getByRole('button', { name: '글감 추가', exact: true }).click()
  await page.getByRole('link', { name: 'Phase 3 실사용 글감 키워드 분석' }).click()
  await expect(page.getByLabel('조회할 키워드')).toHaveValue('상품권 신청')
  expect(calls).toBe(0)
  await expect(page.getByLabel('DEMO 예시 영역')).not.toHaveAttribute('open')
  await page.getByRole('button', { name: '검색량 조회', exact: true }).click()
  const panel = page.getByRole('region', { name: '키워드 후보 선정' })
  await expect(panel.getByLabel('후보 분석 데이터')).toHaveValue('LIVE')
  await expect(page.getByRole('region', { name: 'API 사용량' })).toContainText('남은 호출: 29')
  await panel.getByText('필터·분류 설정', { exact: true }).click()
  await panel.getByLabel('실험용 프리셋').selectOption('beginner')
  await expect(panel.getByLabel('후보 분석 요약')).toContainText('현재 필터 적용: 0개')
  await page.getByRole('button', { name: '수동 자료 추가' }).click()
  await dialog.getByLabel('핵심 키워드', { exact: true }).fill('상품권 신청')
  await dialog.getByLabel('블로그 검색 결과 수').fill('200')
  await dialog.getByLabel('문서 수 검색 범위').fill('네이버 블로그 탭 전체 기간')
  await dialog.getByLabel('데이터 출처').fill('직접 검색 확인')
  await dialog.getByRole('button', { name: '수동 자료 저장', exact: true }).click()
  await panel.getByRole('button', { name: '문서 수 자료 다시 읽기' }).click()
  await expect(panel.getByLabel('후보 분석 요약')).toContainText('현재 필터 적용: 1개')
  await expect(panel.locator('tbody')).toContainText('직접 검색 확인')
  await panel.getByRole('button', { name: '필터 결과 전체 선택 (1)', exact: true }).click()
  await panel.getByRole('button', { name: '선택 후보 저장 (1)', exact: true }).click()
  const saved = panel.getByRole('article', { name: '상품권 신청 저장 후보' })
  await expect(saved.getByRole('combobox')).not.toHaveValue('')
  await saved.getByRole('link', { name: '경쟁 분석' }).click()
  await expect(page.getByRole('region', { name: '통합 발행 판단' })).toContainText('상품권 신청')
  await page.goBack()
  await expect(page.getByLabel('조회할 키워드')).toHaveValue('상품권 신청')
  await expect(panel.getByLabel('실험용 프리셋')).toHaveValue('beginner')
  expect(calls).toBe(1)
})

test('whole workspace preview, confirmed restore in a different browser and continued editing', async ({
  page,
  browser,
}) => {
  await page.route('**/api/**', () => {
    throw new Error('Unexpected API call')
  })
  await page.goto('/ideas')
  await page.getByRole('button', { name: '새 글감 추가' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('제목', { exact: false }).fill('다른 브라우저 복원 글감')
  await dialog.getByLabel('핵심 키워드', { exact: false }).fill('복원 테스트')
  await dialog.getByRole('button', { name: '글감 추가', exact: true }).click()
  await page.goto('/backup')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '전체 JSON 내보내기', exact: true }).click()
  const download = await pending
  const path = await download.path()
  expect(path).toBeTruthy()
  const context = await browser.newContext({ viewport: page.viewportSize()! })
  try {
    const target = await context.newPage()
    await target.route('**/api/**', () => {
      throw new Error('Unexpected API call')
    })
    await target.goto('http://127.0.0.1:4178/backup')
    await target.getByLabel('전체 JSON 가져오기').setInputFiles(path!)
    await expect(target.getByRole('heading', { name: '복원 전 비교' })).toBeVisible()
    const restore = target.getByRole('button', { name: '확인하고 전체 복원' })
    await expect(restore).toBeDisabled()
    expect(
      await target.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)
    await target.getByRole('checkbox').check()
    await restore.click()
    await expect(target.getByRole('status')).toContainText('무결성 검사가 완료')
    await target.reload()
    await target.goto('http://127.0.0.1:4178/ideas')
    await target.getByRole('button', { name: '다른 브라우저 복원 글감 수정' }).click()
    await target.getByRole('dialog').getByLabel('제목', { exact: false }).fill('복원 후 편집 성공')
    await target.getByRole('button', { name: '변경사항 저장' }).click()
    await target.reload()
    await expect(target.getByRole('button', { name: '복원 후 편집 성공 수정' })).toBeVisible()
    await target.goto('http://127.0.0.1:4178/backup')
    await target.getByLabel('전체 JSON 가져오기').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{'),
    })
    await expect(target.getByRole('alert')).toContainText('JSON')
    await expect(target.getByRole('button', { name: '확인하고 전체 복원' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})
