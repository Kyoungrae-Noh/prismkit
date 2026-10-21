import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import {
  AI_MODEL,
  AI_PROVIDER,
  AI_RESERVE_USD,
  disconnectedStatus,
} from '../../src/domain/ai-contract'
const item = {
  title: '상품권 신청 안내',
  topic: '상품권',
  keywords: ['상품권 신청', '지역 상품권'],
  category: '라이프스타일',
  source: '',
  publishedDate: '',
  summary: '신청 방법 안내',
  intent: '정보 탐색',
  uncertain: '작은 날짜 글자 확인 필요',
  evidence: '상품권 신청 안내',
  sourceEvidence: '',
  dateEvidence: '',
  advertisement: false,
}
const connected = {
  ...disconnectedStatus(),
  connected: true,
  used: 0,
  remaining: 30,
  reservedUsd: 0,
  resetsAt: '2026-10-22T00:00:00+09:00',
  message: '모의 AI 연결 (실제 이미지 판독 아님)',
}
test('mock AI separates ideas, requires review, links keyword and restores provenance with original image', async ({
  page,
  browser,
}) => {
  let aiCalls = 0
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/ai/status') return route.fulfill({ json: connected })
    expect(path).toBe('/api/ai/extract')
    aiCalls++
    return route.fulfill({
      json: {
        imageId: route.request().headers()['x-image-id'],
        provider: AI_PROVIDER,
        model: AI_MODEL,
        at: new Date().toISOString(),
        items: [item, { ...item, title: '별도 여행 소식', keywords: ['여행 소식'] }],
        reservedUsd: AI_RESERVE_USD,
      },
    })
  })
  await page.goto('/captures')
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    return c.toDataURL().split(',')[1]
  })
  await page.getByLabel('캡처 이미지 선택').setInputFiles({
    name: 'evidence.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  })
  await expect(page.getByRole('img', { name: 'evidence.png' })).toBeVisible()
  expect(aiCalls).toBe(0)
  await page.getByRole('button', { name: 'AI 연결 상태 확인', exact: true }).click()
  await page.getByRole('checkbox', { name: /선택 이미지의 개인정보/ }).check()
  await page.getByRole('checkbox', { name: 'evidence.png', exact: true }).check()
  await page.getByRole('button', { name: 'AI 글감 추출', exact: true }).click()
  await expect(page.getByRole('status', { name: 'AI 처리 상태' })).toContainText('요청 처리 종료')
  expect(aiCalls).toBe(1)
  const draft = page.getByRole('article', { name: '상품권 신청 안내 추출 글감', exact: true })
  await draft.locator('summary').click()
  await expect(draft.getByRole('button', { name: '업무 글감 저장·연결' })).toBeDisabled()
  await expect(draft).toContainText('출처: 미확인')
  await expect(draft).toContainText('원본 인용: 상품권 신청 안내')
  await draft.getByRole('button', { name: '추출 결과 수정' }).click()
  await page.getByLabel('글감 제목', { exact: true }).fill('검토한 상품권 안내')
  await page.getByRole('button', { name: '추출 글감 저장', exact: true }).click()
  const edited = page.getByRole('article', { name: '검토한 상품권 안내 추출 글감' })
  await expect(edited).toContainText('사용자 수정됨')
  await page.getByRole('checkbox', { name: /현재 모든 추출 글감을 원본과 대조/ }).check()
  await page.getByRole('button', { name: '전체 승인 (제목·키워드·원본 확인)' }).click()
  await edited.getByRole('button', { name: '업무 글감 저장·연결' }).click()
  await edited.getByRole('link', { name: '키워드 분석', exact: true }).click()
  await expect(page.getByLabel('조회할 키워드')).toHaveValue('상품권 신청')
  expect(aiCalls).toBe(1)
  await page.goto('/backup')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '전체 JSON 내보내기', exact: true }).click()
  const path = await (await download).path()
  const backup = JSON.parse(await readFile(path!, 'utf8'))
  expect(backup.captures.drafts[0].ai.provider).toBe('OpenAI')
  expect(backup.captures.images[0].analysis.status).toBe('success')
  const context = await browser.newContext({ viewport: page.viewportSize()! })
  try {
    const target = await context.newPage()
    await target.goto('http://127.0.0.1:4178/backup')
    await target.getByLabel('전체 JSON 가져오기').setInputFiles(path!)
    await target.getByRole('checkbox').check()
    await target.getByRole('button', { name: '확인하고 전체 복원' }).click()
    await expect(target.getByRole('status')).toContainText('무결성')
    await target.goto('http://127.0.0.1:4178/captures')
    await expect(target.getByRole('img', { name: 'evidence.png' }).first()).toBeVisible()
    await expect(
      target.getByRole('article', { name: '검토한 상품권 안내 추출 글감' }),
    ).toContainText(AI_MODEL)
  } finally {
    await context.close()
  }
})
test('mock failure preserves image and requires explicit per-image retry, never auto-calls', async ({
  page,
}) => {
  let calls = 0
  await page.route('**/api/**', async (route) => {
    if (route.request().url().endsWith('/status')) return route.fulfill({ json: connected })
    expect(route.request().url()).toContain('/api/ai/extract')
    calls++
    if (calls === 1) return route.fulfill({ status: 502, json: { error: { code: 'FORMAT' } } })
    expect(route.request().headers()['x-ai-retry']).toBe('true')
    return route.fulfill({
      json: {
        imageId: route.request().headers()['x-image-id'],
        provider: AI_PROVIDER,
        model: AI_MODEL,
        at: new Date().toISOString(),
        items: [item],
        reservedUsd: AI_RESERVE_USD,
      },
    })
  })
  await page.goto('/captures')
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas')
    return c.toDataURL().split(',')[1]
  })
  await page
    .getByLabel('캡처 이미지 선택')
    .setInputFiles({ name: 'retry.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByRole('img', { name: 'retry.png' })).toBeVisible()
  await page.getByRole('button', { name: 'AI 연결 상태 확인', exact: true }).click()
  await page.getByRole('checkbox', { name: /선택 이미지의 개인정보/ }).check()
  await page.getByRole('checkbox', { name: 'retry.png', exact: true }).check()
  await page.getByRole('button', { name: 'AI 글감 추출', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'AI 오류' })).toContainText('형식 오류')
  await expect(page.getByRole('img', { name: 'retry.png' })).toBeVisible()
  expect(calls).toBe(1)
  await page.getByRole('button', { name: '실패 이미지 다시 판독: retry.png' }).click()
  await expect(page.getByRole('article', { name: '상품권 신청 안내 추출 글감' })).toBeVisible()
  expect(calls).toBe(2)
  await page.locator('.capture-list-row summary').click()
  await page.getByRole('button', { name: '원본 대조 후 개별 승인' }).click()
  await expect(page.getByRole('button', { name: '업무 글감 저장·연결' })).toBeEnabled()
})

test('mock multi-image batch is sequential, groups duplicates and deletes only reviewed draft records', async ({
  page,
}) => {
  let calls = 0
  await page.route('**/api/**', async (route) => {
    if (route.request().url().endsWith('/status')) return route.fulfill({ json: connected })
    expect(route.request().url()).toContain('/api/ai/extract')
    calls++
    return route.fulfill({
      json: {
        imageId: route.request().headers()['x-image-id'],
        provider: AI_PROVIDER,
        model: AI_MODEL,
        at: new Date().toISOString(),
        items: [item],
        reservedUsd: AI_RESERVE_USD,
      },
    })
  })
  await page.goto('/captures')
  const files = await page.evaluate(() =>
    ['red', 'blue'].map((color) => {
      const c = document.createElement('canvas')
      c.width = c.height = 32
      const ctx = c.getContext('2d')!
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 32, 32)
      return c.toDataURL().split(',')[1]
    }),
  )
  await page.getByLabel('캡처 이미지 선택').setInputFiles(
    files.map((s, i) => ({
      name: `batch-${i}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(s, 'base64'),
    })),
  )
  await expect(page.locator('.capture-card')).toHaveCount(2)
  await page.getByRole('button', { name: 'AI 연결 상태 확인', exact: true }).click()
  await page.getByRole('checkbox', { name: /선택 이미지의 개인정보/ }).check()
  for (const i of [0, 1])
    await page.getByRole('checkbox', { name: `batch-${i}.png`, exact: true }).check()
  await page.clock.install()
  await page.getByRole('button', { name: 'AI 글감 추출', exact: true }).click()
  await expect(page.getByRole('status', { name: 'AI 처리 상태' })).toContainText('10초 대기')
  expect(calls).toBe(1)
  await expect(page.getByRole('button', { name: 'AI 판독 중…' })).toBeDisabled()
  await page.clock.fastForward(11000)
  await expect(page.locator('.capture-draft')).toHaveCount(2)
  await expect(page.getByText(/동일 제목 중복 그룹 1개/)).toBeVisible()
  expect(calls).toBe(2)
  await expect(page.getByRole('status', { name: 'AI 처리 상태' })).toContainText('요청 처리 종료')
  await page.locator('.capture-draft').first().locator('summary').click()
  await page
    .locator('.capture-draft')
    .first()
    .getByRole('button', { name: '추출 글감 삭제', exact: true })
    .click()
  await page.getByRole('button', { name: '추출 글감 삭제 확인', exact: true }).click()
  await expect(page.locator('.capture-draft')).toHaveCount(1)
  await expect(page.locator('.capture-card')).toHaveCount(2)
})
