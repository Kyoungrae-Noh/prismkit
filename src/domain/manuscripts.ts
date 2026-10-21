import { boundedText, objectKeys } from './ai-contract.ts'
export const DRAFT_MODEL = 'gpt-4.1-mini-2025-04-14'
export const DRAFT_RESERVE = 0.03
export const DRAFT_KEY = 'prismkit.manuscripts.v1'
export const draftAccounts = ['nkr09134', 'nkr09135', 'nkr09136'] as const
export const reviewCategories = [
  'events',
  'economy',
  'lifestyle',
  'tech',
  'entertainment',
  'travel',
] as const
export interface DraftSource {
  id: string
  title: string
  url: string
  excerpt: string
  checkedDate: string
  kind: 'official' | 'internal'
}
export interface DraftBrief {
  candidateId: string
  ideaId: string | null
  keyword: string
  topic: string
  intent: string
  type: 'naver' | 'reviewman'
  account: string
  category: string
  angle: string
  evidence: string
  sources: DraftSource[]
}
export interface DraftContent {
  title: string
  meta: string
  h1: string
  introduction: string
  sections: { heading: string; body: string; sourceIds: string[] }[]
  faq: { question: string; answer: string; sourceIds: string[] }[]
  checklist: string[]
  conclusion: string
  imageNotes: string[]
  sourceIds: string[]
  internalIds: string[]
  cta: string
  monetization: string
  checks: string[]
}
export interface DraftUsage {
  inputTokens: number
  outputTokens: number
  estimatedUsd: number
  reservedUsd: number
}
export interface Manuscript {
  id: string
  brief: DraftBrief
  content: DraftContent
  generated: DraftContent
  model: string
  createdAt: string
  updatedAt: string
  usage: DraftUsage | null
  review: Record<string, boolean>
}
export interface DraftStatus {
  connected: boolean
  blocked: boolean
  used: number | null
  monthUsed: number | null
  remaining: number | null
  estimatedUsd: number | null
  reservedUsd: number | null
}
export const draftReviewLabels = {
  intent: '검색 의도·제목·본문 일치',
  facts: '날짜·금액·정책·조건 원문 대조',
  completeness: '핵심 정보·FAQ 누락 확인',
  freshness: '최신 정보 확인',
  sources: '공식 출처 링크 직접 열어 유효성 확인',
  difference: '경쟁 콘텐츠와 차별화 확인',
  duplicate: '다른 계정·원고와 중복 검토',
  ads: 'CTA·광고·제휴 표시 적절성 확인',
}
function str(v: unknown, max: number, required = false): asserts v is string {
  boundedText(v, max)
  if (required && !v.trim()) throw Error('필수 원고 항목이 비어 있습니다.')
}
export function sourceUrl(v: string) {
  if (/[\s<>"`]/.test(v)) throw Error('출처 URL의 공백·특수문자를 확인하세요.')
  const u = new URL(v)
  if (u.protocol !== 'https:' || u.username || u.password || u.port)
    throw Error('출처는 HTTPS URL이어야 합니다.')
  return u
}
export function validateBrief(v: unknown): DraftBrief {
  objectKeys(
    v,
    'candidateId ideaId keyword topic intent type account category angle evidence sources',
  )
  for (const k of ['candidateId', 'keyword', 'topic', 'intent']) str(v[k], 300, true)
  if (v.ideaId !== null) str(v.ideaId, 100, true)
  str(v.angle, 2000)
  str(v.evidence, 5000)
  if (
    !['naver', 'reviewman'].includes(String(v.type)) ||
    !draftAccounts.includes(v.account as (typeof draftAccounts)[number]) ||
    !reviewCategories.includes(v.category as (typeof reviewCategories)[number])
  )
    throw Error('원고 유형·계정·카테고리 오류')
  if (!Array.isArray(v.sources) || v.sources.length > 10) throw Error('근거는 최대 10개입니다.')
  for (const s of v.sources) {
    objectKeys(s, 'id title url excerpt checkedDate kind')
    str(s.id, 60, true)
    str(s.title, 200, true)
    str(s.url, 1000, true)
    str(s.excerpt, 2000, true)
    str(s.checkedDate, 10, true)
    const u = sourceUrl(s.url)
    if (
      !['official', 'internal'].includes(String(s.kind)) ||
      (s.kind === 'internal' && !['reviewman.kr', 'www.reviewman.kr'].includes(u.hostname))
    )
      throw Error('출처 유형·내부 링크 오류')
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(s.checkedDate) ||
      !Number.isFinite(Date.parse(s.checkedDate)) ||
      new Date(s.checkedDate).toISOString().slice(0, 10) !== s.checkedDate ||
      s.checkedDate > new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
    )
      throw Error('근거 확인 날짜 오류')
  }
  if (
    new Set(v.sources.map((s) => s.id)).size !== v.sources.length ||
    new TextEncoder().encode(JSON.stringify(v)).length > 16000
  )
    throw Error('근거 중복 또는 입력 16,000바이트 초과')
  return v as unknown as DraftBrief
}
export function validateContent(v: unknown, brief: DraftBrief, editable = false): DraftContent {
  objectKeys(
    v,
    'title meta h1 introduction sections faq checklist conclusion imageNotes sourceIds internalIds cta monetization checks',
  )
  for (const k of ['title', 'h1']) str(v[k], 300, !editable)
  str(v.meta, 500)
  str(v.introduction, 5000)
  str(v.conclusion, 5000)
  str(v.cta, 1000)
  str(v.monetization, 1000)
  const ids = (xs: unknown, kind?: string) => {
    if (
      !Array.isArray(xs) ||
      xs.length > 10 ||
      xs.some((id) => !brief.sources.some((s) => s.id === id && (!kind || s.kind === kind)))
    )
      throw Error('확인되지 않은 출처 참조')
  }
  if (
    !Array.isArray(v.sections) ||
    !v.sections.length ||
    v.sections.length > 12 ||
    !Array.isArray(v.faq) ||
    !v.faq.length ||
    v.faq.length > 8
  )
    throw Error('본문·FAQ 형식 오류')
  for (const s of v.sections) {
    objectKeys(s, 'heading body sourceIds')
    str(s.heading, 300, !editable)
    str(s.body, 8000, !editable)
    ids(s.sourceIds)
  }
  for (const s of v.faq) {
    objectKeys(s, 'question answer sourceIds')
    str(s.question, 500, !editable)
    str(s.answer, 3000, !editable)
    ids(s.sourceIds)
  }
  for (const k of ['checklist', 'imageNotes', 'checks']) {
    if (!Array.isArray(v[k]) || v[k].length > 20) throw Error('원고 목록 형식 오류')
    for (const x of v[k]) str(x, 1000)
  }
  if (brief.type === 'naver' && (v.imageNotes as string[]).length !== 5)
    throw Error('네이버 원고 이미지 위치는 5개여야 합니다.')
  if (!editable && brief.type === 'reviewman' && (!(v.checklist as string[]).length || !v.meta))
    throw Error('Reviewman 체크리스트·메타 설명이 필요합니다.')
  ids(v.sourceIds, 'official')
  ids(v.internalIds, 'internal')
  // Links are rendered exclusively from the user's checked source list, never model prose.
  const prose = JSON.stringify({ ...v, sourceIds: [], internalIds: [] })
  if (/https?:\/\/|www\./i.test(prose))
    throw Error('본문의 임의 URL은 허용하지 않습니다. 확인된 출처 목록을 사용하세요.')
  if (prose.length > 55000) throw Error('원고 길이 제한 초과')
  return v as unknown as DraftContent
}
export function qualityIssues(
  m: Pick<Manuscript, 'brief' | 'content'>,
  others: Manuscript[] = [],
  now = Date.now(),
) {
  const { brief: b, content: c } = m
  const issues = ['AI 원고는 미검증 초안입니다. 모든 사실·조건을 원문과 대조하세요.', ...c.checks]
  if (
    !c.title.trim() ||
    !c.introduction.trim() ||
    !c.conclusion.trim() ||
    c.sections.some((s) => !s.heading.trim() || !s.body.trim()) ||
    c.faq.some((f) => !f.question.trim() || !f.answer.trim())
  )
    issues.push('제목·본문·FAQ에 비어 있는 편집 항목이 있습니다.')
  if (!b.sources.some((s) => s.kind === 'official'))
    issues.push('공식 근거 없음: 날짜·금액·정책·신청 조건을 발행 전에 확인해야 합니다.')
  for (const s of c.sections) if (!s.sourceIds.length) issues.push(`근거 부족 문단: ${s.heading}`)
  for (const f of c.faq) if (!f.sourceIds.length) issues.push(`근거 부족 FAQ: ${f.question}`)
  for (const s of b.sources)
    if (now - Date.parse(s.checkedDate) > 30 * 86400000)
      issues.push(`30일 초과 근거 재확인: ${s.title}`)
  if (b.type === 'reviewman' && !c.internalIds.length) issues.push('관련 콘텐츠 내부 링크 미확인')
  const body = [
    c.introduction,
    ...c.sections.map((s) => s.body),
    ...c.faq.map((f) => f.answer),
    c.conclusion,
  ].join('\n')
  for (const sentence of body
    .split(/[\n.!?。]+/)
    .filter((s) => /\d|신청|자격|정책|보장|무료|최저|확정/.test(s)))
    issues.push(`사실 확인 문장: ${sentence.trim().slice(0, 200)}`)
  if (body.split(b.keyword).length - 1 > 12) issues.push('핵심 키워드 반복이 많습니다.')
  if (
    others.some(
      (o) =>
        o.content.title === c.title ||
        o.content.sections.some(
          (s) => s.body.length > 60 && c.sections.some((t) => t.body.includes(s.body)),
        ),
    )
  )
    issues.push('다른 계정·유형 원고와 제목 또는 본문 중복 가능성')
  return [...new Set(issues)]
}
export function validateManuscripts(v: unknown): Manuscript[] {
  if (!Array.isArray(v) || v.length > 100 || JSON.stringify(v).length * 2 > 3 * 1024 * 1024)
    throw Error('원고 저장 한도(100개/3 MiB) 또는 형식 오류')
  for (const m of v) {
    objectKeys(m, 'id brief content generated model createdAt updatedAt usage review')
    str(m.id, 100, true)
    if (m.model !== DRAFT_MODEL) throw Error('원고 모델 오류')
    for (const k of ['createdAt', 'updatedAt']) {
      str(m[k], 40)
      if (!Number.isFinite(Date.parse(m[k] as string))) throw Error('원고 시각 오류')
    }
    const b = validateBrief(m.brief)
    validateContent(m.content, b, true)
    validateContent(m.generated, b)
    objectKeys(m.review, Object.keys(draftReviewLabels).join(' '))
    if (Object.values(m.review).some((x) => typeof x !== 'boolean')) throw Error('검토 상태 오류')
    if (m.usage !== null) {
      objectKeys(m.usage, 'inputTokens outputTokens estimatedUsd reservedUsd')
      if (
        !Object.values(m.usage).every(
          (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0,
        ) ||
        m.usage.reservedUsd !== DRAFT_RESERVE
      )
        throw Error('원고 사용량 오류')
    }
  }
  if (new Set(v.map((m) => m.id)).size !== v.length) throw Error('중복 원고 ID')
  return v as Manuscript[]
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export function draftMarkdown(m: Manuscript) {
  const md = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/([\\`*_{}\[\]()])/g, '\\$1')
  const c: DraftContent = JSON.parse(
      JSON.stringify(m.content, (_key, v) => (typeof v === 'string' ? md(v) : v)),
    ),
    n = m.brief.type === 'naver'
  return (
    `# ${c.title}\n\n${n ? '' : `Meta description: ${c.meta}\n\n# ${c.h1}\n\n`}${c.introduction}\n\n` +
    c.sections
      .map(
        (s, i) =>
          `## ${n ? '│ ' : ''}${s.heading}\n\n${s.body}${n && c.imageNotes[i] ? `\n\n[이미지 ${i + 1}: ${c.imageNotes[i]}]` : ''}`,
      )
      .join('\n\n') +
    (n
      ? c.imageNotes
          .slice(c.sections.length)
          .map((x, i) => `\n\n[이미지 ${c.sections.length + i + 1}: ${x}]`)
          .join('')
      : '') +
    `\n\n## 체크리스트\n${c.checklist.map((x) => `- ${x}`).join('\n')}\n\n## ${n ? '│ ' : ''}FAQ\n\n` +
    c.faq.map((f) => `### ${f.question}\n\n${f.answer}`).join('\n\n') +
    `\n\n${c.conclusion}\n\n## 공식 출처·관련 콘텐츠\n` +
    m.brief.sources
      .filter((s) => [...m.content.sourceIds, ...m.content.internalIds].includes(s.id))
      .map((s) => `- ${md(s.title)}: <${s.url}> (확인 ${s.checkedDate})`)
      .join('\n') +
    `\n\n## 편집 검토 메모 (발행 전 제거)\nCTA 제안: ${c.cta}\n수익화 가설: ${c.monetization}\n` +
    qualityIssues(m)
      .map((x) => `- ${md(x)}`)
      .join('\n')
  )
}
export function draftHTML(m: Manuscript) {
  const c = m.content,
    n = m.brief.type === 'naver',
    p = (s: string) => `<p>${escape(s).replace(/\n/g, '<br>')}</p>`,
    h = (s: string) =>
      `<h2${n ? ' style="font-size:30pt;font-weight:700"' : ''}>${n ? '│ ' : ''}${escape(s)}</h2>`
  return (
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escape(c.title)}</title><meta name="description" content="${escape(c.meta)}"></head><body><article${n ? ' style="font-size:19pt;line-height:1.7"' : ''}><h1>${escape(n ? c.title : c.h1)}</h1>${p(c.introduction)}` +
    c.sections
      .map(
        (s, i) =>
          h(s.heading) +
          p(s.body) +
          (n && c.imageNotes[i] ? p(`[이미지 ${i + 1}: ${c.imageNotes[i]}]`) : ''),
      )
      .join('') +
    (n
      ? c.imageNotes
          .slice(c.sections.length)
          .map((x, i) => p(`[이미지 ${c.sections.length + i + 1}: ${x}]`))
          .join('')
      : '') +
    h('체크리스트') +
    `<ul>${c.checklist.map((s) => `<li>${escape(s)}</li>`).join('')}</ul>` +
    h('FAQ') +
    c.faq.map((f) => h(f.question) + p(f.answer)).join('') +
    p(c.conclusion) +
    h('공식 출처·관련 콘텐츠') +
    m.brief.sources
      .filter((s) => [...c.sourceIds, ...c.internalIds].includes(s.id))
      .map(
        (s) =>
          `<p><a href="${escape(s.url)}" rel="noreferrer">${escape(s.title)}</a> · 확인 ${escape(s.checkedDate)}</p>`,
      )
      .join('') +
    `</article><aside>${h('편집 검토 메모 (발행 전 제거)')}${p('CTA 제안: ' + c.cta)}${p('수익화 가설: ' + c.monetization)}${qualityIssues(m).map(p).join('')}</aside></body></html>`
  )
}
