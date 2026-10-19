export type VerificationStatus = 'VERIFIED' | 'DOCUMENTED' | 'UNVERIFIED' | 'UNSUPPORTED'
export type Count = number | '<10' | null
export interface ResearchInput {
  keyword: string
  related: string[]
  intent: string
  ideaId: string | null
  pc: Count
  mobile: Count
  blogTotal: number | null
  source: string
  checkedDate: string
}
export interface KeywordResearch extends ResearchInput {
  id: string
  mode: 'MANUAL'
  verification: 'UNVERIFIED'
  createdAt: string
  updatedAt: string
}
export const recommendations = ['발행 추천', '롱테일 전환', '보류', '발행 제외'] as const
export type Recommendation = (typeof recommendations)[number]
export function assessResearch(): { recommendation: Recommendation; reason: string } {
  return {
    recommendation: '보류',
    reason:
      '상위 콘텐츠 품질·검색 의도·차별화 근거가 부족합니다. 수동 입력만으로 발행을 추천하지 않습니다.',
  }
}
export function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function parseCount(value: string, allowBound = true): Count {
  const text = value.trim()
  if (!text) return null
  if (allowBound && /^<\s*10$/.test(text)) return '<10'
  if (
    !/^\d+$/.test(text) ||
    !Number.isSafeInteger(Number(text)) ||
    Number(text) > Number.MAX_SAFE_INTEGER / 2
  )
    throw new Error('검색수는 0 이상의 정수로 입력하세요. 검색량은 <10도 입력할 수 있습니다.')
  return Number(text)
}
export function displayCount(value: Count) {
  return value === null
    ? '확인 불가'
    : typeof value === 'number'
      ? value.toLocaleString('ko-KR')
      : value
}
export function totalVolume(pc: Count, mobile: Count): Count {
  return typeof pc === 'number' && typeof mobile === 'number' ? pc + mobile : null
}
export function splitKeywords(value: string): string[] {
  const unique = [
    ...new Set(
      value
        .split(/[\n,;\t]+/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ]
  if (unique.length > 100 || unique.some((term) => term.length > 60))
    throw new Error('관련 키워드는 각 60자, 최대 100개까지 입력하세요.')
  return unique
}
export function validateResearch(input: ResearchInput): ResearchInput {
  if (
    typeof input.keyword !== 'string' ||
    !input.keyword.trim() ||
    input.keyword.trim().length > 60
  )
    throw new Error('핵심 키워드는 1~60자로 입력하세요.')
  if (typeof input.source !== 'string' || !input.source.trim() || input.source.trim().length > 500)
    throw new Error('데이터 출처는 1~500자로 입력하세요.')
  if (typeof input.intent !== 'string' || input.intent.length > 120)
    throw new Error('검색 의도는 120자 이내로 입력하세요.')
  if (!Array.isArray(input.related) || !input.related.every((term) => typeof term === 'string'))
    throw new Error('관련 키워드 형식을 확인하세요.')
  if (input.ideaId !== null && (typeof input.ideaId !== 'string' || !input.ideaId))
    throw new Error('글감 연결 형식을 확인하세요.')
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.checkedDate) ||
    !Number.isFinite(Date.parse(input.checkedDate)) ||
    new Date(input.checkedDate).toISOString().slice(0, 10) !== input.checkedDate ||
    input.checkedDate > today()
  )
    throw new Error('확인 날짜는 오늘까지의 유효한 날짜를 입력하세요.')
  for (const count of [input.pc, input.mobile])
    if (
      count !== null &&
      count !== '<10' &&
      (typeof count !== 'number' || parseCount(String(count)) !== count)
    )
      throw new Error('검색량 형식을 확인하세요.')
  if (
    input.blogTotal !== null &&
    (typeof input.blogTotal !== 'number' ||
      parseCount(String(input.blogTotal), false) !== input.blogTotal)
  )
    throw new Error('블로그 검색 결과 수를 확인하세요.')
  return {
    keyword: input.keyword.trim(),
    related: splitKeywords(input.related.join('\n')).filter(
      (term) => term !== input.keyword.trim(),
    ),
    intent: input.intent.trim(),
    ideaId: input.ideaId,
    pc: input.pc,
    mobile: input.mobile,
    blogTotal: input.blogTotal,
    source: input.source.trim(),
    checkedDate: input.checkedDate,
  }
}
