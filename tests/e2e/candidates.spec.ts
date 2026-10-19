import { expect, test } from '@playwright/test'
const meta = {
  source: { id: 'searchad', label: '모의 검색광고', mode: 'API' },
  verification: 'VERIFIED',
  collectedAt: '2026-10-19T10:24:17.896Z',
  checkedDate: '2026-10-19',
  error: null,
  missing: [],
}
const rows = [
  ...Array.from({ length: 510 }, (_, i) => ({
    keyword: `온누리상품권 ${i} 신청`,
    pc: i,
    mobile: 0,
    total: i,
  })),
  { keyword: '온누리 상품권 0 신청', pc: 0, mobile: 0, total: 0 },
  { keyword: '온누리상품권 지역 조회', pc: '<10', mobile: 5, total: null },
  { keyword: '온누리상품권 사용처', pc: null, mobile: null, total: null },
  { keyword: '온누리상품권 신청 취소', pc: 100, mobile: 0, total: 100 },
  { keyword: '다른주제 비교', pc: 500, mobile: 100, total: 600 },
]
test('analyzes 515 rows, filters, groups, saves and restores without more API calls', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/searchad/keyword?*', async (route) => {
    requests++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        volume: { ...meta, data: null },
        expansion: {
          ...meta,
          data: { keywords: rows.map((row) => row.keyword), kind: 'searchad-related' },
        },
        rows,
        cached: false,
      }),
    })
  })
  await page.goto('/keywords')
  const live = page.getByRole('region', { name: '검색광고 실시간 조회' }),
    panel = page.getByRole('region', { name: '키워드 후보 선정' })
  await live.getByLabel('조회할 키워드').fill('온누리상품권')
  await live.getByRole('button', { name: '검색량 조회', exact: true }).click()
  await expect(live.getByText('LIVE · VERIFIED')).toBeVisible()
  await panel.getByLabel('후보 분석 데이터').selectOption('LIVE')
  await expect(panel.getByLabel('후보 분석 요약')).toContainText(
    '전체 수집 515개 → 중복 제거 후 514개',
  )
  await panel.getByRole('button', { name: '다음 후보', exact: true }).click()
  await expect(panel.getByText('2 / 11 페이지 · 페이지당 50개')).toBeVisible()
  await panel.getByLabel('전체 검색량 최소', { exact: true }).fill('500')
  await panel.getByLabel('전체 검색량 최대', { exact: true }).fill('509')
  await expect(panel.getByLabel('후보 분석 요약')).toContainText('현재 필터 적용: 12개')
  await panel.getByLabel('범위값', { exact: false }).uncheck()
  await expect(panel.getByLabel('후보 분석 요약')).toContainText('현재 필터 적용: 10개')
  await panel.getByLabel('Reviewman 연결 가능 주제').fill('온누리상품권')
  await expect(panel.getByLabel('후보 분석 요약')).toContainText('1차 검토 추천 10개')
  await panel.getByLabel('후보 정렬').selectOption('total-asc')
  await expect(panel.locator('tbody tr').first()).toContainText('온누리상품권 500 신청')
  await panel.getByRole('button', { name: '필터 결과 전체 선택 (10)', exact: true }).click()
  await panel.getByLabel('저장할 후보의 글감 연결').selectOption({ index: 1 })
  await panel.getByRole('button', { name: '선택 후보 저장 (10)', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('10개 저장')
  await panel.getByRole('button', { name: '필터 결과 전체 선택 (10)', exact: true }).click()
  await panel.getByRole('button', { name: '선택 후보 저장 (10)', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('중복 후보 10개')
  expect(requests).toBe(1)
  const downloadPromise = page.waitForEvent('download')
  await panel.getByRole('button', { name: '후보 JSON 내보내기' }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('prismkit-candidates.json')
  await page.reload()
  await expect(panel.getByRole('heading', { name: '저장한 후보 (10)', exact: true })).toBeVisible()
  const saved = panel.getByRole('article', { name: '온누리상품권 500 신청 저장 후보' })
  await expect(saved).toContainText('LIVE')
  await expect(saved).toContainText('모의 검색광고')
  expect(await saved.getByRole('combobox').inputValue()).not.toBe('')
  await saved.getByRole('combobox').selectOption('')
  await page.reload()
  await expect(saved.getByRole('combobox')).toHaveValue('')
  expect(requests).toBe(1)
})
test('manual provenance and low-volume candidates survive filtering; damaged storage is preserved', async ({
  page,
}, testInfo) => {
  await page.goto('/keywords')
  await page.evaluate(() =>
    localStorage.setItem(
      'prismkit.keyword-research.v1',
      JSON.stringify({
        version: 1,
        records: [
          {
            id: 'manual-1',
            keyword: '지역 상품권 신청',
            related: [],
            intent: '정보 탐색',
            ideaId: null,
            pc: 0,
            mobile: 1,
            blogTotal: null,
            source: '사용자 직접 조사',
            checkedDate: '2026-10-19',
            mode: 'MANUAL',
            verification: 'UNVERIFIED',
            createdAt: '2026-10-19T00:00:00Z',
            updatedAt: '2026-10-19T00:00:00Z',
          },
        ],
      }),
    ),
  )
  const panel = page.getByRole('region', { name: '키워드 후보 선정' })
  await panel.getByLabel('후보 분석 데이터').selectOption('MANUAL')
  await panel.getByLabel('후보 핵심 주제').fill('지역 상품권')
  await expect(panel.locator('tbody')).toContainText('롱테일 후보')
  await panel.getByLabel('전체 검색량 최소', { exact: true }).fill('100')
  await expect(panel.getByLabel('후보 분석 요약')).toContainText('현재 필터 적용: 0개')
  await panel.getByRole('button', { name: '후보 필터 초기화' }).click()
  await expect(panel.locator('tbody')).toContainText('지역 상품권 신청')
  await panel.getByLabel('지역 상품권 신청 후보 선택').check()
  await panel.getByRole('button', { name: '선택 해제', exact: true }).click()
  await expect(panel.getByLabel('지역 상품권 신청 후보 선택')).not.toBeChecked()
  await panel.getByLabel('지역 상품권 신청 후보 선택').check()
  await panel.getByRole('button', { name: '선택 후보 저장 (1)', exact: true }).click()
  await expect(panel.getByRole('article', { name: '지역 상품권 신청 저장 후보' })).toContainText(
    'MANUAL',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    testInfo.project.use.viewport!.width,
  )
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('candidates.png'), fullPage: true })
  await page.evaluate(() => localStorage.setItem('prismkit.candidates.v1', 'broken-original'))
  await page.reload()
  await expect(panel.getByRole('alert')).toContainText('원본 자료는 보존')
  expect(await page.evaluate(() => localStorage.getItem('prismkit.candidates.v1'))).toBe(
    'broken-original',
  )
  await expect(page.getByRole('button', { name: '수동 자료 추가', exact: true })).toBeEnabled()
})
