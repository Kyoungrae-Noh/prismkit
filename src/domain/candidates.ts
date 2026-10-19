import type { Count } from './research'
export const intents = [
  '정보 확인형',
  '신청·접수형',
  '조회·확인형',
  '예약·예매형',
  '비교·선택형',
  '구매·전환형',
  '기타·불명확',
] as const
export type Intent = (typeof intents)[number]
export const candidateStatuses = [
  '1차 검토 추천',
  '롱테일 후보',
  '추가 검증 필요',
  '제외 후보',
] as const
export type CandidateStatus = (typeof candidateStatuses)[number]
export type DataMode = 'DEMO' | 'MANUAL' | 'LIVE'
export interface CandidateInput {
  keyword: string
  pc: Count
  mobile: Count
  total: Count
  collectedAt: string | null
  source: string
  mode: DataMode
}
export interface IntentResult {
  intent: Intent
  review: boolean
  evidence: string[]
}
/** Future extension only. No AI calls in Phase 2C. */
export interface IntentClassifier {
  classify(keyword: string): Promise<IntentResult>
}
export interface Candidate extends CandidateInput {
  key: string
  originals: CandidateInput[]
  intent: Intent
  review: boolean
  group: string
  conflict: boolean
  related: boolean
  reviewman: boolean
  status: CandidateStatus
  reasons: string[]
}
export interface AnalysisContext {
  topic: string
  reviewmanTopics: string[]
}
export function normalizeKeyword(value: string) {
  // Preserve semantic symbols (+, #, %, /) and numeric ranges; only remove presentation punctuation.
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s.,·ㆍ_()[\]{}!?"'“”‘’]+/gu, '')
    .replace(/(?<=[가-힣])-(?=[가-힣])/g, '')
}
const rules: [Intent, RegExp][] = [
  ['신청·접수형', /신청|접수|등록/],
  ['조회·확인형', /조회|확인|잔액|조회방법/],
  ['예약·예매형', /예약|예매/],
  ['비교·선택형', /비교|추천|차이|선택/],
  ['구매·전환형', /구매|구입|가격|할인|주문/],
]
export function classifyIntent(keyword: string): IntentResult {
  const text = normalizeKeyword(keyword),
    matched = rules.filter(([, pattern]) => pattern.test(text))
  const sensitive = /취소|환불|불가|제외|안되는|않는/.test(text)
  if (matched.length !== 1 || sensitive) {
    if (
      matched.length === 0 &&
      !sensitive &&
      /방법|하는법|뜻|대상|조건|기간|일정|사용처|자격|준비물/.test(text)
    )
      return { intent: '정보 확인형', review: false, evidence: ['정보 탐색 표현 일치'] }
    return {
      intent: '기타·불명확',
      review: true,
      evidence: [
        sensitive
          ? '취소·부정·제외 맥락은 별도 검토'
          : matched.length > 1
            ? '복수 행동 의도 일치'
            : '판별 표현 부족',
      ],
    }
  }
  return { intent: matched[0][0], review: false, evidence: [`규칙 표현: ${matched[0][0]}`] }
}
function identity(input: CandidateInput) {
  return `${input.mode}:${input.source}:${normalizeKeyword(input.keyword)}`
}
function groupExpression(keyword: string) {
  return normalizeKeyword(keyword)
    .replace(/하는방법|하는법|방법/g, '방법')
    .replace(/신청|접수/g, '신청')
    .replace(/구매|구입/g, '구매')
    .replace(/예약|예매/g, '예약')
}
export function analyzeCandidates(inputs: CandidateInput[], context: AnalysisContext): Candidate[] {
  const groups = new Map<string, CandidateInput[]>()
  for (const input of inputs) {
    const key = identity(input)
    groups.set(key, [...(groups.get(key) ?? []), input])
  }
  const analyzed: Candidate[] = [...groups].map(([key, originals]) => {
    const first = originals[0],
      conflict = originals.some(
        (row) => row.pc !== first.pc || row.mobile !== first.mobile || row.total !== first.total,
      )
    const row = { ...first, ...(conflict ? { pc: null, mobile: null, total: null } : {}) }
    const classification = classifyIntent(row.keyword),
      normalized = normalizeKeyword(row.keyword),
      topic = normalizeKeyword(context.topic)
    const related = !!topic && normalized.includes(topic)
    const reviewman = context.reviewmanTopics.some(
      (term) => !!normalizeKeyword(term) && normalized.includes(normalizeKeyword(term)),
    )
    const specific = related && normalized.length >= topic.length + 2 && !classification.review
    let status: CandidateStatus = '추가 검증 필요'
    const reasons = [...classification.evidence]
    if (conflict) reasons.push('같은 표기의 수치가 충돌하여 수치 확인 필요')
    else if (classification.review) reasons.push('검색 의도 검토 필요')
    else if (!related)
      reasons.push(
        topic ? '핵심 주제와 명시적 문자열 일치 없음; 의미 검토 필요' : '핵심 주제 미설정',
      )
    else if (reviewman && typeof row.total === 'number' && row.total > 0) {
      status = '1차 검토 추천'
      reasons.push('주제·사용자 지정 Reviewman 연결어 일치 및 검색량 확인')
    } else if (specific) {
      status = '롱테일 후보'
      reasons.push('핵심 주제에 구체적 의도 표현 추가; 검색량과 무관하게 보존')
    } else reasons.push('차별화·연결 가능성 추가 확인 필요')
    if (!reviewman) reasons.push('Reviewman 연결 가능성은 사용자 확인 필요')
    if (typeof row.total !== 'number') reasons.push('정확한 전체 검색량 확인 불가')
    if (originals.length > 1) reasons.push(`${originals.length}개 동일 표기 통합; 원문 보존`)
    return {
      ...row,
      key,
      originals: structuredClone(originals),
      intent: classification.intent,
      review: classification.review || conflict,
      group: classification.review
        ? key
        : `${row.mode}:${row.source}:${classification.intent}:${groupExpression(row.keyword)}`,
      conflict,
      related,
      reviewman,
      status,
      reasons,
    }
  })
  const sizes = new Map<string, number>()
  for (const row of analyzed) sizes.set(row.group, (sizes.get(row.group) ?? 0) + 1)
  return analyzed.map((row) =>
    (sizes.get(row.group) ?? 0) > 1
      ? {
          ...row,
          review: true,
          status: row.status === '1차 검토 추천' ? '추가 검증 필요' : row.status,
          reasons: [...row.reasons, '유사 표현 중복 가능성; 의미는 확정하지 않으며 함께 검토'],
        }
      : row,
  )
}
export interface CandidateFilters {
  min: string
  max: string
  pcMin: string
  pcMax: string
  mobileMin: string
  mobileMax: string
  intent: string
  include: string
  exclude: string
  status: string
  keepUnknown: boolean
}
export const emptyFilters: CandidateFilters = {
  min: '',
  max: '',
  pcMin: '',
  pcMax: '',
  mobileMin: '',
  mobileMax: '',
  intent: 'all',
  include: '',
  exclude: '',
  status: 'all',
  keepUnknown: true,
}
export function validateFilters(filters: CandidateFilters) {
  for (const [min, max] of [
    [filters.min, filters.max],
    [filters.pcMin, filters.pcMax],
    [filters.mobileMin, filters.mobileMax],
  ]) {
    for (const value of [min, max])
      if (value !== '' && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))))
        throw new Error('검색량 범위는 0 이상의 정수로 입력하세요.')
    if (min !== '' && max !== '' && Number(min) > Number(max))
      throw new Error('최소 검색량은 최대 검색량보다 클 수 없습니다.')
  }
}
export function applyCandidateFilters(rows: Candidate[], filters: CandidateFilters): Candidate[] {
  validateFilters(filters)
  const include = normalizeKeyword(filters.include),
    excluded = filters.exclude
      .split(/[,\n]+/)
      .map(normalizeKeyword)
      .filter(Boolean)
  function range(count: Count, min: string, max: string) {
    if (min === '' && max === '') return true
    if (typeof count !== 'number') return filters.keepUnknown
    return (min === '' || count >= Number(min)) && (max === '' || count <= Number(max))
  }
  return rows
    .map((row) =>
      excluded.some((term) => normalizeKeyword(row.keyword).includes(term))
        ? {
            ...row,
            status: '제외 후보' as const,
            reasons: [...row.reasons, '사용자가 지정한 제외어 일치; 삭제하지 않음'],
          }
        : row,
    )
    .filter(
      (row) =>
        (row.status !== '제외 후보' || filters.status === '제외 후보') &&
        range(row.total, filters.min, filters.max) &&
        range(row.pc, filters.pcMin, filters.pcMax) &&
        range(row.mobile, filters.mobileMin, filters.mobileMax) &&
        (filters.intent === 'all' || row.intent === filters.intent) &&
        (!include || normalizeKeyword(row.keyword).includes(include)) &&
        (filters.status === 'all' || row.status === filters.status),
    )
}
export type CandidateSort =
  'total-desc' | 'total-asc' | 'pc-desc' | 'mobile-desc' | 'name' | 'priority'
export function sortCandidates(rows: Candidate[], sort: CandidateSort): Candidate[] {
  return [...rows].sort((a, b) => {
    if (sort === 'name') return a.keyword.localeCompare(b.keyword, 'ko')
    if (sort === 'priority') {
      const delta = candidateStatuses.indexOf(a.status) - candidateStatuses.indexOf(b.status)
      if (delta) return delta
    }
    const field = sort === 'pc-desc' ? 'pc' : sort === 'mobile-desc' ? 'mobile' : 'total',
      av = a[field],
      bv = b[field]
    if (typeof av !== 'number' && typeof bv === 'number') return 1
    if (typeof av === 'number' && typeof bv !== 'number') return -1
    if (typeof av === 'number' && typeof bv === 'number' && av !== bv)
      return sort === 'total-asc' ? av - bv : bv - av
    return a.keyword.localeCompare(b.keyword, 'ko')
  })
}
export function summarizeCandidates(rows: Candidate[]) {
  return {
    count: rows.length,
    known: rows.filter((row) => typeof row.total === 'number').length,
    primary: rows.filter((row) => row.status === '1차 검토 추천').length,
    longtail: rows.filter((row) => row.status === '롱테일 후보').length,
    review: rows.filter((row) => row.status === '추가 검증 필요').length,
    excluded: rows.filter((row) => row.status === '제외 후보').length,
  }
}
