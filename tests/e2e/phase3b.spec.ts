import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { analyzeCandidates } from '../../src/domain/candidates'
import { blankCompetition, emptyPublishing, naverSearch } from '../../src/domain/publishing'
import type { SavedCandidate } from '../../src/data/candidate-store'
test('twenty local images, duplicate detection, reorder, deletion and manual idea link without API', async ({
  page,
}) => {
  let apiCalls = 0
  await page.route('**/api/**', (route) => {
    apiCalls++
    return route.abort()
  })
  await page.goto('/captures')
  await expect(page.getByRole('button', { name: 'AI 글감 추출 (미연결)' })).toBeDisabled()
  const images = await page.evaluate(() =>
    Array.from({ length: 20 }, (_, i) => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const c = canvas.getContext('2d')!
      c.fillStyle = `rgb(${i * 10},20,30)`
      c.fillRect(0, 0, 64, 64)
      return canvas.toDataURL('image/png').split(',')[1]
    }),
  )
  const files = images.map((s, i) => ({
    name: `capture-${i}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(s, 'base64'),
  }))
  await page.getByLabel('캡처 이미지 선택').setInputFiles(files)
  await expect(page.getByRole('status')).toContainText('로컬 보관 완료: 20장')
  await expect(page.locator('.capture-card')).toHaveCount(20)
  await page.getByLabel('캡처 이미지 선택').setInputFiles(files[0])
  await expect(page.getByRole('status')).toContainText('동일 원본 중복 제외')
  const first = page.locator('.capture-card').first()
  await first.getByRole('button', { name: '아래로', exact: true }).click()
  await expect(page.locator('.capture-card').first()).toContainText('capture-1.png')
  await page
    .locator('.capture-card')
    .first()
    .getByRole('button', { name: '이 이미지에서 글감 입력' })
    .click()
  await page.getByLabel('글감 제목', { exact: true }).fill('캡처 기반 신청 안내')
  await page.getByLabel('핵심 키워드', { exact: true }).fill('상품권 신청')
  await page.getByLabel('불명확한 글자·추가 확인 사항').fill('출처 작은 글자 재확인')
  await page
    .getByRole('checkbox', {
      name: '원본과 대조했고, 미확인 정보는 비워두거나 확인 사항에 기록했습니다.',
    })
    .check()
  await page.getByRole('button', { name: '추출 글감 저장', exact: true }).click()
  await page.getByRole('button', { name: '업무 글감 저장·연결' }).click()
  await expect(page.getByRole('status')).toContainText('업무 글감 연결 완료')
  await page.getByRole('link', { name: '키워드 분석', exact: true }).last().click()
  await expect(page.getByLabel('조회할 키워드')).toHaveValue('상품권 신청')
  expect(apiCalls).toBe(0)
  await page.goto('/captures')
  await expect(page.getByRole('article', { name: '캡처 기반 신청 안내 추출 글감' })).toContainText(
    '출처: 미확인',
  )
  await page
    .locator('.capture-card')
    .first()
    .getByRole('button', { name: '이미지 삭제', exact: true })
    .click()
  await page.getByRole('button', { name: '이미지 삭제 확인' }).click()
  await expect(page.locator('.capture-card')).toHaveCount(19)
  await expect(page.getByRole('article', { name: '캡처 기반 신청 안내 추출 글감' })).toContainText(
    '확인 필요',
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
  expect(apiCalls).toBe(0)
})
test('image validation and full backup restores originals in an isolated browser', async ({
  page,
  browser,
}) => {
  await page.route('**/api/**', () => {
    throw new Error('Unexpected API call')
  })
  await page.goto('/captures')
  const input = page.getByLabel('캡처 이미지 선택')
  await input.setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  })
  await expect(page.getByRole('status')).toContainText('실제 형식')
  await expect(page.getByRole('button', { name: '실패한 파일 다시 시도 (1)' })).toBeVisible()
  await input.setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
  })
  await expect(page.getByRole('status')).toContainText('4 MiB')
  const encoded = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 40
    c.height = 40
    return c.toDataURL('image/webp').split(',')[1]
  })
  await input.setInputFiles({
    name: 'original.webp',
    mimeType: 'image/webp',
    buffer: Buffer.from(encoded, 'base64'),
  })
  await expect(page.getByRole('status')).toContainText('로컬 보관 완료: 1장')
  await page.goto('/backup')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '전체 JSON 내보내기', exact: true }).click()
  const path = await (await download).path()
  const json = JSON.parse(await readFile(path!, 'utf8'))
  expect(json.version).toBe(2)
  expect(Object.keys(json.captureFiles)).toHaveLength(1)
  const context = await browser.newContext({ viewport: page.viewportSize()! })
  try {
    const target = await context.newPage()
    await target.route('**/api/**', () => {
      throw new Error('Unexpected API call')
    })
    await target.goto('http://127.0.0.1:4178/backup')
    await target.getByLabel('전체 JSON 가져오기').setInputFiles(path!)
    await target.getByRole('checkbox').check()
    await target.getByRole('button', { name: '확인하고 전체 복원' }).click()
    await expect(target.getByRole('status')).toContainText('무결성')
    await target.goto('http://127.0.0.1:4178/captures')
    await expect(target.getByRole('img', { name: 'original.webp' })).toBeVisible()
    await target.reload()
    await expect(target.getByRole('img', { name: 'original.webp' })).toBeVisible()
  } finally {
    await context.close()
  }
})
test('budget failure feedback and explicit retry do not invoke keyword API', async ({ page }) => {
  let calls = 0
  await page.route('**/api/**', (route) => {
    expect(route.request().url()).toContain('/usage')
    calls++
    return calls === 1
      ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } })
      : route.fulfill({
          json: {
            used: 2,
            remaining: 8,
            limit: 10,
            day: new Date().toISOString().slice(0, 10),
            resetsAt: new Date(Date.now() + 86400000).toISOString(),
            lastQueryAt: null,
            blocked: false,
            migration: true,
          },
        })
  })
  await page.goto('/keywords')
  await page.getByRole('button', { name: '호출 예산 확인' }).click()
  await expect(page.getByRole('alert')).toContainText('서버 오류')
  expect(calls).toBe(1)
  await page.getByRole('button', { name: '호출 예산 확인' }).click()
  await expect(page.getByRole('status')).toContainText('예산 조회 성공')
  await expect(page.getByRole('region', { name: 'API 사용량' })).toContainText('남은 호출: 8')
  expect(calls).toBe(2)
})

test('only three supported recommendations, comparison and snapshot survive reload and backup', async ({
  page,
}) => {
  await page.route('**/api/**', () => {
    throw new Error('Unexpected API call')
  })
  const now = new Date().toISOString(),
    date = now.slice(0, 10),
    context = { topic: '상품권', reviewmanTopics: ['상품권'] }
  const items: SavedCandidate[] = [
    '문화상품권 신청',
    '온누리상품권 신청',
    '지역상품권 신청',
    '미확인상품권 신청',
  ].map((keyword, i) => ({
    id: `rank-${i}`,
    candidate: analyzeCandidates(
      [
        {
          keyword,
          mode: 'LIVE',
          source: '모의 API 데이터',
          pc: i === 3 ? null : 1000,
          mobile: 3000,
          total: i === 3 ? null : 4000,
          collectedAt: now,
          documents: {
            count: 200,
            source: '수동 검색 확인',
            scope: '네이버 블로그 탭',
            checkedDate: date,
          },
        },
      ],
      context,
    )[0],
    context,
    ideaId: null,
    savedAt: now,
    ruleVersion: 'rules-v1',
  }))
  const publishing = {
    ...emptyPublishing(),
    historyChecked: { nkr09134: true, nkr09135: true, nkr09136: true },
    analyses: items
      .slice(0, 3)
      .map((item) => ({
        ...blankCompetition(item),
        searchUrl: naverSearch(item.candidate.keyword),
        checkedDate: date,
        blog: 'yes' as const,
        dominant: 'no' as const,
        position: 'middle' as const,
        serp: 'information' as const,
        missingInfo: '최신 공식 신청 절차',
        reviewmanUrl: 'https://reviewman.kr/guide',
        posts: [
          {
            title: '신청 안내',
            url: 'https://example.com/post',
            date,
            summary: '기존 안내',
            features: '신규 절차 누락',
          },
        ],
        quality: {
          fresh: 'no' as const,
          intentMatch: 'yes' as const,
          specific: 'no' as const,
          official: 'no' as const,
          solves: 'no' as const,
          intentGap: 'yes' as const,
          officialEdge: 'yes' as const,
          longtail: 'yes' as const,
          better: 'yes' as const,
        },
      })),
  }
  await page.goto('/recommendations')
  await page.evaluate(
    ({ items, publishing }) => {
      localStorage.setItem('prismkit.candidates.v1', JSON.stringify({ version: 1, items }))
      localStorage.setItem('prismkit.publishing.v1', JSON.stringify(publishing))
    },
    { items, publishing },
  )
  await page.reload()
  const top = page.getByRole('region', { name: '추천 TOP 10' })
  await expect(top).toContainText('후보 3개 / 최대 10개')
  await expect(page.getByRole('region', { name: '조사 대기 후보' })).toContainText('데이터 부족')
  await top.getByRole('checkbox').first().check()
  await expect(page.getByRole('region', { name: '후보 비교' })).toContainText('수동 검색 확인')
  await page.getByRole('button', { name: '추천 목록 저장' }).click()
  await expect(page.getByRole('status')).toContainText('저장했습니다')
  await page.reload()
  await page.getByText('저장 당시 추천 결과 펼치기').click()
  await expect(page.getByRole('region', { name: '저장 당시 추천 결과' })).toContainText(
    '모의 API 데이터',
  )
  await page.getByLabel('최대 경쟁 문서 수').fill('100')
  await expect(top).toContainText('후보 0개')
  await page.getByLabel('최대 경쟁 문서 수').fill('500')
  await expect(top).toContainText('후보 3개')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
  await page.goto('/backup')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '전체 JSON 내보내기', exact: true }).click()
  const path = await (await pending).path()
  const backup = JSON.parse(await readFile(path!, 'utf8'))
  expect(backup.captures.report.entries).toHaveLength(3)
})

test('JPEG drag and drop works and oversized batches are rejected', async ({ page }) => {
  await page.route('**/api/**', () => {
    throw new Error('Unexpected API call')
  })
  await page.goto('/captures')
  const dataTransfer = await page.evaluateHandle(() => {
    const c = document.createElement('canvas')
    c.width = 32
    c.height = 32
    const bytes = Uint8Array.from(atob(c.toDataURL('image/jpeg').split(',')[1]), (x) =>
      x.charCodeAt(0),
    )
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'dropped.jpg', { type: 'image/jpeg' }))
    return dt
  })
  await page.locator('.capture-drop').dispatchEvent('drop', { dataTransfer })
  await expect(page.getByRole('img', { name: 'dropped.jpg' })).toBeVisible()
  await page
    .getByLabel('캡처 이미지 선택')
    .setInputFiles(
      Array.from({ length: 21 }, (_, i) => ({
        name: `too-many-${i}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from('invalid'),
      })),
    )
  await expect(page.getByRole('alert')).toContainText('최대 20장')
  await expect(page.locator('.capture-card')).toHaveCount(1)
})
