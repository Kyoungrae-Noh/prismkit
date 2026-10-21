import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { analyzeCandidates } from '../../src/domain/candidates'
import { content } from '../fixtures/manuscript'
import { DRAFT_MODEL } from '../../src/domain/manuscripts'
const status = {
  connected: true,
  blocked: false,
  used: 0,
  monthUsed: 0,
  remaining: 5,
  reservedUsd: 0,
  estimatedUsd: 0,
}
const seed = () => ({
  id: 'candidate',
  candidate: analyzeCandidates(
    [
      {
        keyword: '여행 준비',
        mode: 'MANUAL',
        source: '사용자 확인',
        pc: 1000,
        mobile: 2500,
        total: 3500,
        collectedAt: new Date().toISOString(),
      },
    ],
    { topic: '여행 준비', reviewmanTopics: [] },
  )[0],
  context: { topic: '여행 준비', reviewmanTopics: [] },
  ideaId: null,
  savedAt: new Date().toISOString(),
  ruleVersion: 'rules-v1',
})
test('status button shows loading, disabled approval, local errors and exhausted budgets without generating', async ({
  page,
}) => {
  let calls = 0
  let respond!: () => void
  await page.route('**/api/**', async (route) => {
    expect(route.request().method()).toBe('GET')
    expect(route.request().url()).toContain('/drafts/status')
    calls++
    await new Promise<void>((resolve) => {
      respond = resolve
    })
    if (calls === 1)
      return route.fulfill({
        json: {
          connected: false,
          blocked: false,
          used: null,
          monthUsed: null,
          remaining: null,
          reservedUsd: null,
          estimatedUsd: null,
        },
      })
    if (calls === 2)
      return route.fulfill({ status: 401, contentType: 'text/html', body: '<html>login</html>' })
    return route.fulfill({ json: { ...status, used: 5, remaining: 0 } })
  })
  await page.goto('/manuscripts')
  await page.evaluate(
    (c) =>
      localStorage.setItem('prismkit.candidates.v1', JSON.stringify({ version: 1, items: [c] })),
    seed(),
  )
  await page.reload()
  await page.getByLabel('발행 후보', { exact: true }).selectOption('candidate')
  await page.getByRole('checkbox', { name: /개인정보를 확인했으며/ }).check()
  expect(calls).toBe(0)
  const section = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: '2. 원고 생성', exact: true }) })
  for (let i = 1; i <= 3; i++) {
    await section.getByRole('button', { name: '원고 연결 상태 확인' }).click()
    await expect(section.getByRole('button', { name: '원고 상태 조회 중…' })).toBeDisabled()
    await expect(section.getByRole('button', { name: 'AI 원고 생성', exact: true })).toBeDisabled()
    await expect.poll(() => calls).toBe(i)
    respond()
    if (i === 1) {
      await expect(section.getByText('조회 완료 · 서버 응답 정상 · 원고 생성 비활성')).toBeVisible()
      await expect(section.getByText(/원고 생성은 별도 비용 승인/)).toBeVisible()
    } else if (i === 2) {
      await expect(section.getByRole('alert')).toContainText('관리자 로그인')
      await expect(section.getByText('원고 상태 조회 실패', { exact: true })).toBeVisible()
    } else {
      await expect(section.getByText(/조회 완료 · 원고 일일 또는 월간 한도 소진/)).toBeVisible()
      await expect(section.getByRole('alert')).toHaveCount(0)
    }
    await expect(section.getByRole('button', { name: 'AI 원고 생성', exact: true })).toBeDisabled()
  }
  expect(calls).toBe(3)
})
test('three Naver accounts and separate Reviewman drafts edit, persist, export and restore with mock AI only', async ({
  page,
  browser,
}, testInfo) => {
  let calls = 0
  await page.route('**/api/**', async (route) => {
    if (route.request().url().endsWith('/drafts/status')) return route.fulfill({ json: status })
    expect(route.request().url()).toContain('/drafts/generate')
    calls++
    const { brief, id } = route.request().postDataJSON()
    const c = {
      ...content,
      title: `${brief.type}-${brief.account} 여행 준비`,
      sourceIds: [],
      sections: content.sections.map((s) => ({ ...s, sourceIds: [] })),
      faq: content.faq.map((s) => ({ ...s, sourceIds: [] })),
    }
    return route.fulfill({
      json: {
        id,
        brief,
        content: c,
        generated: c,
        model: DRAFT_MODEL,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usage: { inputTokens: 4000, outputTokens: 6000, estimatedUsd: 0.0112, reservedUsd: 0.03 },
        review: {},
      },
    })
  })
  await page.goto('/manuscripts')
  await page.evaluate(
    (c) =>
      localStorage.setItem('prismkit.candidates.v1', JSON.stringify({ version: 1, items: [c] })),
    seed(),
  )
  await page.reload()
  await page.getByLabel('발행 후보', { exact: true }).selectOption('candidate')
  await expect(page.getByText('데이터 부족', { exact: true })).toBeVisible()
  expect(calls).toBe(0)
  await page.getByRole('button', { name: '원고 연결 상태 확인' }).click()
  await expect(page.getByText(/생성 가능 5회 · 오늘 0 \/ 5/)).toBeVisible()
  await page.getByRole('checkbox', { name: /개인정보를 확인했으며/ }).check()
  for (const account of ['nkr09134', 'nkr09135', 'nkr09136']) {
    await page.getByLabel('블로그 계정', { exact: true }).selectOption(account)
    await page.getByRole('button', { name: 'AI 원고 생성', exact: true }).click()
    await expect(page.getByLabel('원고 제목', { exact: true })).toHaveValue(
      `naver-${account} 여행 준비`,
    )
  }
  await page.getByLabel('원고 유형', { exact: true }).selectOption('reviewman')
  await page.getByLabel('Reviewman 카테고리', { exact: true }).selectOption('travel')
  await page.getByRole('button', { name: 'AI 원고 생성', exact: true }).click()
  await expect(page.getByLabel('Meta description', { exact: true })).toBeVisible()
  await page.getByLabel('원고 제목', { exact: true }).fill('검토한 여행 원고')
  await page.getByLabel('본문 1', { exact: true }).fill('준비물과 일정은 원문을 확인하세요.')
  await page.getByLabel('FAQ 답변 1', { exact: true }).fill('공식 안내를 확인하세요.')
  await page.getByLabel('소제목 1', { exact: true }).fill('준비 점검')
  await expect(page.getByRole('status')).toContainText('자동 저장')
  expect(calls).toBe(4)
  await page.reload()
  await page.getByRole('button', { name: /검토한 여행 원고 · Reviewman/ }).click()
  await expect(page.getByLabel('본문 1', { exact: true })).toHaveValue(
    '준비물과 일정은 원문을 확인하세요.',
  )
  await expect(page.getByRole('listitem').filter({ hasText: /^공식 근거 없음:/ })).toBeVisible()
  for (const [name, expected] of [
    ['Markdown 내보내기', '## FAQ'],
    ['HTML 내보내기', '<meta name="description"'],
  ] as const) {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name, exact: true }).click()
    const file = await (await download).path()
    const text = await readFile(file!, 'utf8')
    expect(text).toContain('검토한 여행 원고')
    expect(text).toContain(expected)
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
  await page
    .locator('.manuscript-preview')
    .screenshot({ path: testInfo.outputPath('manuscript-preview.png') })
  await page.goto('/backup')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '전체 JSON 내보내기', exact: true }).click()
  const file = await (await download).path()
  const b = JSON.parse(await readFile(file!, 'utf8'))
  expect(b.manuscripts).toHaveLength(4)
  expect(
    new Set(
      b.manuscripts
        .filter((m: { brief: { type: string } }) => m.brief.type === 'naver')
        .map((m: { brief: { account: string } }) => m.brief.account),
    ).size,
  ).toBe(3)
  const ctx = await browser.newContext({ viewport: page.viewportSize()! })
  try {
    const p = await ctx.newPage()
    await p.route('**/api/**', () => {
      throw Error('Restore must not call AI')
    })
    await p.goto('http://127.0.0.1:4178/backup')
    await p.getByLabel('전체 JSON 가져오기').setInputFiles(file!)
    await p.getByRole('checkbox').check()
    await p.getByRole('button', { name: '확인하고 전체 복원' }).click()
    await expect(p.getByRole('status')).toContainText('무결성')
    await p.goto('http://127.0.0.1:4178/manuscripts')
    await p.getByRole('button', { name: /검토한 여행 원고 · Reviewman/ }).click()
    await expect(p.getByLabel('소제목 1', { exact: true })).toHaveValue('준비 점검')
  } finally {
    await ctx.close()
  }
  expect(calls).toBe(4)
})
test('generation errors do not retry or destroy the brief and approval gate stays closed', async ({
  page,
}) => {
  let calls = 0
  await page.route('**/api/**', (route) => {
    if (route.request().url().endsWith('/status')) return route.fulfill({ json: status })
    calls++
    return route.fulfill({ status: 429, json: { error: { code: 'BLOCKED' } } })
  })
  await page.goto('/manuscripts')
  await page.evaluate(
    (c) =>
      localStorage.setItem('prismkit.candidates.v1', JSON.stringify({ version: 1, items: [c] })),
    seed(),
  )
  await page.reload()
  await page.getByLabel('발행 후보', { exact: true }).selectOption('candidate')
  await page.getByLabel('계정별 독자·차별화 방향').fill('초보 여행자에게 맞춤 안내')
  await expect(page.getByRole('button', { name: 'AI 원고 생성', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '원고 연결 상태 확인' }).click()
  await page.getByRole('checkbox', { name: /개인정보를 확인했으며/ }).check()
  await page.getByRole('button', { name: 'AI 원고 생성', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('차단')
  expect(calls).toBe(1)
  await page.reload()
  await expect(page.getByLabel('계정별 독자·차별화 방향')).toHaveValue('초보 여행자에게 맞춤 안내')
  expect(calls).toBe(1)
})
