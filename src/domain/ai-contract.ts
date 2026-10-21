// Public protocol only; no credentials or provider HTTP calls belong in this module.
export const AI_MODEL = 'gpt-4.1-mini-2025-04-14'
export const AI_PROVIDER = 'OpenAI'
export const AI_RESERVE_USD = 0.02
export const AI_LIMIT = 30
export const AI_CATEGORIES = ['라이프스타일', '테크·AI', '비즈니스', '여행'] as const
export interface ExtractedItem {
  title: string
  topic: string
  keywords: string[]
  category: (typeof AI_CATEGORIES)[number]
  source: string
  publishedDate: string
  summary: string
  intent: string
  uncertain: string
  evidence: string
  sourceEvidence: string
  dateEvidence: string
  advertisement: boolean
}
export interface AIResult {
  imageId: string
  provider: string
  model: string
  at: string
  items: ExtractedItem[]
  reservedUsd: number
}
export interface AIStatus {
  connected: boolean
  provider: string
  model: string
  used: number | null
  remaining: number | null
  reservedUsd: number | null
  resetsAt: string | null
  blocked: boolean
  perImageUsd: number
  message: string
}
export function objectKeys(v: unknown, keys: string): asserts v is Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.split(' ').includes(k))
  )
    throw new Error('AI 응답 형식 오류')
}
export function boundedText(v: unknown, max: number): asserts v is string {
  if (typeof v !== 'string' || v.length > max) throw new Error('AI 텍스트 형식 오류')
}
export function validateItems(value: unknown): ExtractedItem[] {
  if (!Array.isArray(value) || value.length > 20)
    throw new Error('AI 결과는 이미지당 최대 20개입니다.')
  return value.map((raw) => {
    objectKeys(
      raw,
      'title topic keywords category source publishedDate summary intent uncertain evidence sourceEvidence dateEvidence advertisement',
    )
    for (const key of ['title', 'topic', 'intent']) boundedText(raw[key], 120)
    for (const key of ['source', 'uncertain', 'evidence', 'sourceEvidence', 'dateEvidence'])
      boundedText(raw[key], 500)
    boundedText(raw.summary, 2000)
    boundedText(raw.publishedDate, 10)
    if (
      !AI_CATEGORIES.includes(raw.category as (typeof AI_CATEGORIES)[number]) ||
      typeof raw.advertisement !== 'boolean' ||
      !Array.isArray(raw.keywords) ||
      raw.keywords.length > 10 ||
      raw.keywords.some((k) => typeof k !== 'string' || !k.trim() || k.length > 60)
    )
      throw new Error('AI 분류 형식 오류')
    const item = raw as unknown as ExtractedItem
    if (
      item.publishedDate &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(item.publishedDate) ||
        !Number.isFinite(Date.parse(item.publishedDate)) ||
        new Date(item.publishedDate).toISOString().slice(0, 10) !== item.publishedDate ||
        item.publishedDate > new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10))
    )
      throw new Error('AI 날짜 형식 오류')
    if (
      (item.source && !item.sourceEvidence.trim()) ||
      (item.publishedDate && !item.dateEvidence.trim()) ||
      (item.title.trim() && !item.evidence.trim())
    )
      throw new Error('AI 원본 근거 누락')
    return item
  })
}
export function validateResult(value: unknown, imageId: string): AIResult {
  objectKeys(value, 'imageId provider model at items reservedUsd')
  if (
    value.imageId !== imageId ||
    value.provider !== AI_PROVIDER ||
    value.model !== AI_MODEL ||
    typeof value.at !== 'string' ||
    !Number.isFinite(Date.parse(value.at)) ||
    value.reservedUsd !== AI_RESERVE_USD
  )
    throw new Error('AI 응답 원본·모델 형식 오류')
  return {
    imageId,
    provider: AI_PROVIDER,
    model: AI_MODEL,
    at: value.at,
    items: validateItems(value.items),
    reservedUsd: AI_RESERVE_USD,
  }
}
export const disconnectedStatus = (): AIStatus => ({
  connected: false,
  provider: AI_PROVIDER,
  model: AI_MODEL,
  used: null,
  remaining: null,
  reservedUsd: null,
  resetsAt: null,
  blocked: false,
  perImageUsd: AI_RESERVE_USD,
  message: 'AI 판독 미연결: 전용 인증정보·비용 승인·서버 활성화가 필요합니다.',
})
