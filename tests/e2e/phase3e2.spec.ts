import { test, expect, type Locator, type Page } from '@playwright/test'
import { manuscript } from '../fixtures/manuscript'
import { analyzeCandidates } from '../../src/domain/candidates'

async function compose(page: Page, field: Locator) {
  await field.focus()
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Input.imeSetComposition', {
      text: 'ㅎ',
      selectionStart: 1,
      selectionEnd: 1,
    })
    await session.send('Input.imeSetComposition', {
      text: '한글',
      selectionStart: 2,
      selectionEnd: 2,
    })
    await session.send('Input.insertText', { text: '한글' })
  } finally {
    await session.detach()
  }
}

test('Korean composition works in capture, research, competition and publication forms', async ({
  page,
}) => {
  await page.route('**/api/**', () => {
    throw Error('Forms must not query APIs')
  })
  const exercise = async (container: Locator) => {
    for (const field of await container
      .locator('input:not([type]), input[type="text"], textarea')
      .all()) {
      if (!(await field.isVisible()) || (await field.isDisabled())) continue
      await field.fill('')
      await compose(page, field)
      await expect(field).toHaveValue('한글')
    }
  }
  await page.goto('/captures')
  await page.getByRole('button', { name: '수동 글감 입력', exact: true }).click()
  await exercise(page.getByRole('dialog'))
  await page.keyboard.press('Escape')
  await page.goto('/keywords')
  await page.getByRole('button', { name: '수동 자료 추가', exact: true }).click()
  await exercise(page.getByRole('dialog'))
  await page.keyboard.press('Escape')
  const candidate = {
    id: 'ime-candidate',
    candidate: analyzeCandidates(
      [
        {
          keyword: '여행 준비',
          mode: 'MANUAL',
          source: '직접 확인',
          pc: 1000,
          mobile: 2000,
          total: 3000,
          collectedAt: new Date().toISOString(),
        },
      ],
      { topic: '여행 준비', reviewmanTopics: [] },
    )[0],
    context: { topic: '여행 준비', reviewmanTopics: [] },
    ideaId: null,
    savedAt: new Date().toISOString(),
    ruleVersion: 'rules-v1',
  }
  await page.evaluate(
    (c) =>
      localStorage.setItem('prismkit.candidates.v1', JSON.stringify({ version: 1, items: [c] })),
    candidate,
  )
  await page.goto('/publishing?candidate=ime-candidate')
  await page.getByRole('button', { name: '경쟁 자료 입력·수정', exact: true }).click()
  await exercise(page.getByRole('dialog'))
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '발행 이력 추가', exact: true }).click()
  await exercise(page.getByRole('dialog'))
  await page.keyboard.press('Escape')
})

test('native Korean composition survives keyword, modal, manuscript and advanced text fields without API calls', async ({
  page,
}) => {
  let calls = 0
  await page.route('**/api/**', (route) => {
    calls++
    return route.abort()
  })
  await page.goto('/keywords')
  await compose(page, page.getByLabel('조회할 키워드'))
  await expect(page.getByLabel('조회할 키워드')).toHaveValue('한글')
  await expect(page).toHaveURL(/\/keywords$/)
  await page.getByText('필터·분류 설정', { exact: true }).click()
  for (const name of ['후보 핵심 주제', 'Reviewman 연결 가능 주제', '포함 키워드', '제외 키워드']) {
    const field = page.getByLabel(name, { exact: true })
    if (await field.count()) {
      await compose(page, field)
      await expect(field).toHaveValue('한글')
    }
  }
  await page.goto('/ideas')
  await page.getByRole('button', { name: '새 글감 추가' }).click()
  const dialog = page.getByRole('dialog')
  for (const field of await dialog
    .locator('input[type="text"], input:not([type]), textarea')
    .all()) {
    await compose(page, field)
    await expect(field).toHaveValue('한글')
  }
  const title = dialog.getByLabel('제목', { exact: false })
  await title.dispatchEvent('compositionstart')
  await title.press('Enter')
  await title.press('Escape')
  await expect(dialog).toBeVisible()
  await title.dispatchEvent('compositionend')
  await dialog.getByRole('button', { name: '글감 추가', exact: true }).click()
  await page.goto('/manuscripts')
  await page.evaluate(
    (m) => localStorage.setItem('prismkit.manuscripts.v1', JSON.stringify([m])),
    manuscript(),
  )
  await page.reload()
  await page.getByRole('button', { name: /여행 준비 체크리스트 · nkr09134/ }).click()
  const editor = page.getByRole('article', { name: '통합 원고 편집' })
  for (const field of await editor.getByRole('textbox').all()) {
    await field.fill('')
    await compose(page, field)
    await expect(field).toHaveText('한글')
  }
  if ((await page.locator('.manuscript-setup').getAttribute('open')) === null)
    await page.locator('.manuscript-setup > summary').click()
  await page.getByText('작성 근거·대상 독자 편집', { exact: true }).click()
  for (const name of [
    '주제',
    '검색 의도',
    '계정별 독자·차별화 방향',
    '확인된 자료와 미확인 사항',
  ]) {
    const field = page.getByLabel(name, { exact: true })
    await compose(page, field)
    await expect(field).toHaveValue('한글')
  }
  await page.reload()
  await page.getByRole('button', { name: /한글 · nkr09134/ }).click()
  await expect(page.getByLabel('본문 1', { exact: true })).toHaveText('한글')
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('prismkit.manuscripts.v1')!)[0],
  )
  expect(stored.generated.title).toBe('여행 준비 체크리스트')
  expect(stored.revisions.length).toBeGreaterThan(0)
  const history = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: /^수정 이력/ }) })
    .last()
  await history.locator(':scope > summary').click()
  await history.locator('details').first().locator('summary').click()
  await history.getByRole('button', { name: '이 버전으로 복원' }).first().click()
  await expect(page.getByLabel('원고 제목', { exact: true })).toHaveText('여행 준비 체크리스트')
  const restored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('prismkit.manuscripts.v1')!)[0],
  )
  expect(restored.revisions.length).toBeGreaterThan(stored.revisions.length)
  expect(restored.generated.title).toBe('여행 준비 체크리스트')
  expect(calls).toBe(0)
})

test('one save action transfers a real candidate, idea memo and evidence into a preserved manuscript brief', async ({
  page,
}) => {
  await page.route('**/api/**', () => {
    throw Error('No external API request allowed')
  })
  await page.goto('/ideas')
  await page.getByRole('button', { name: '새 글감 추가' }).click()
  await page.getByRole('dialog').getByLabel('제목', { exact: false }).fill('연결된 여행 안내')
  await page.getByRole('dialog').getByLabel('핵심 키워드', { exact: false }).fill('여행 준비')
  await page
    .getByRole('dialog')
    .getByLabel('메모', { exact: false })
    .fill('사용자가 확인한 여행 준비 메모')
  await page.getByRole('dialog').getByRole('button', { name: '글감 추가', exact: true }).click()
  const idea = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('prismkit.workspace.v1')!).ideas.find(
      (i: { title: string }) => i.title === '연결된 여행 안내',
    ),
  )
  await page.evaluate((idea) => {
    const base = {
      imageIds: [],
      title: '승인 캡처 제목',
      topic: '여행 안내',
      keyword: '여행 준비',
      source: '사용자 확인 캡처',
      publishedDate: '',
      summary: '승인한 캡처의 준비 안내',
      intent: '캡처 준비 의도',
      category: '여행',
      uncertain: '공식 기간 재확인',
      confirmed: true,
      mode: 'MANUAL',
      ideaId: idea.id,
      timeliness: '',
      reviewman: '',
      monetization: '',
    }
    localStorage.setItem(
      'prismkit.captures.v1',
      JSON.stringify({
        version: 1,
        images: [],
        report: null,
        drafts: [
          { ...base, id: 'excluded', excluded: true, summary: '제외된 캡처 정보' },
          { ...base, id: 'approved' },
        ],
      }),
    )
  }, idea)
  // Existing manually recorded research is retained, no live search is needed.
  const now = new Date().toISOString()
  await page.evaluate(
    ({ idea, now }) =>
      localStorage.setItem(
        'prismkit.keyword-research.v1',
        JSON.stringify({
          version: 1,
          records: [
            {
              id: 'research-e2',
              keyword: '여행 준비',
              related: [],
              intent: '준비 방법',
              ideaId: idea.id,
              pc: 1000,
              mobile: 2500,
              blogTotal: null,
              source: '사용자 확인',
              checkedDate: now.slice(0, 10),
              mode: 'MANUAL',
              verification: 'UNVERIFIED',
              createdAt: now,
              updatedAt: now,
            },
          ],
        }),
      ),
    { idea, now },
  )
  await page.goto(`/keywords?idea=${idea.id}`)
  const panel = page.getByRole('region', { name: '키워드 후보 선정' })
  await panel.getByLabel('후보 분석 데이터').selectOption('MANUAL')
  await panel.getByLabel('여행 준비 후보 선택').check()
  await panel.getByRole('button', { name: '저장하고 원고 제작', exact: true }).click()
  await expect(page).toHaveURL(/manuscripts\?candidate=/)
  if ((await page.locator('.manuscript-setup').getAttribute('open')) === null)
    await page.locator('.manuscript-setup > summary').click()
  await page.getByText('작성 근거·대상 독자 편집', { exact: true }).click()
  await expect(page.getByLabel('주제', { exact: true })).toHaveValue('연결된 여행 안내')
  await expect(page.getByLabel('확인된 자료와 미확인 사항')).toHaveValue(
    /사용자가 확인한 여행 준비 메모/,
  )
  await expect(page.getByLabel('확인된 자료와 미확인 사항')).toHaveValue(/승인한 캡처의 준비 안내/)
  await expect(page.getByLabel('확인된 자료와 미확인 사항')).not.toHaveValue(/제외된 캡처 정보/)
  await page.getByLabel('계정별 독자·차별화 방향').fill('초보자를 위한 구체적 설명')
  await page.reload()
  if ((await page.locator('.manuscript-setup').getAttribute('open')) === null)
    await page.locator('.manuscript-setup > summary').click()
  await page.getByText('작성 근거·대상 독자 편집', { exact: true }).click()
  await expect(page.getByLabel('계정별 독자·차별화 방향')).toHaveValue('초보자를 위한 구체적 설명')
  await expect(page.getByText(/공식 원문 링크·인용 내용·확인 날짜/)).toBeVisible()
})
