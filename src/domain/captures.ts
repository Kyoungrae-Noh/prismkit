import { categories, type Category } from './models'
import { normalizeKeyword } from './candidates'
import type { Count } from './research'
import { validDocuments, type DocumentEvidence } from './documents'

export const CAPTURE_KEY = 'prismkit.captures.v1'
export const CAPTURE_LIMIT = 20
export const CAPTURE_FILE_MAX = 4 * 1024 * 1024
export const CAPTURE_TOTAL_MAX = 20 * 1024 * 1024
export interface CaptureImage {
  id: string
  name: string
  type: string
  size: number
  addedAt: string
}
export interface CaptureDraft {
  id: string
  imageIds: string[]
  title: string
  topic: string
  keyword: string
  source: string
  publishedDate: string
  summary: string
  intent: string
  category: Category
  uncertain: string
  confirmed: boolean
  mode: 'MANUAL' | 'AI'
  ideaId: string | null
  timeliness: string
  reviewman: string
  monetization: string
}
export interface RankingSettings {
  min: string
  documentsMax: string
  category: string
  sort: 'priority' | 'volume'
}
export interface CaptureData {
  version: 1
  images: CaptureImage[]
  drafts: CaptureDraft[]
  report: {
    at: string
    settings: RankingSettings
    candidateIds: string[]
    entries: ReportEntry[]
  } | null
}
export interface ReportEntry {
  id: string
  title: string
  keyword: string
  mode: 'LIVE' | 'MANUAL'
  status: string
  score: number
  pc: Count
  mobile: Count
  total: Count
  source: string
  collectedAt: string | null
  documents: DocumentEvidence | null
  reasons: string[]
  missing: string[]
}
export const emptyCaptures = (): CaptureData => ({
  version: 1,
  images: [],
  drafts: [],
  report: null,
})
export function newDraft(imageIds: string[] = []): CaptureDraft {
  return {
    id: crypto.randomUUID(),
    imageIds,
    title: '',
    topic: '',
    keyword: '',
    source: '',
    publishedDate: '',
    summary: '',
    intent: '',
    category: '라이프스타일',
    uncertain: '',
    confirmed: false,
    mode: 'MANUAL',
    ideaId: null,
    timeliness: '',
    reviewman: '',
    monetization: '',
  }
}
function fields(value: unknown, keys: string) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.split(' ').includes(k))
  )
    throw new Error('지원하지 않는 캡처 자료 형식입니다.')
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || value.length > max)
    throw new Error('캡처 텍스트 길이 또는 형식을 확인하세요.')
}
export function validateDraft(d: CaptureDraft) {
  fields(
    d,
    'id imageIds title topic keyword source publishedDate summary intent category uncertain confirmed mode ideaId timeliness reviewman monetization',
  )
  text(d.id, 100)
  if (!d.id) throw new Error('글감 ID가 필요합니다.')
  for (const key of ['title', 'topic', 'intent'] as const) text(d[key], 120)
  text(d.keyword, 60)
  text(d.source, 500)
  text(d.summary, 2000)
  for (const key of ['uncertain', 'timeliness', 'reviewman', 'monetization'] as const)
    text(d[key], 500)
  if (
    !categories.includes(d.category) ||
    !['MANUAL', 'AI'].includes(d.mode) ||
    typeof d.confirmed !== 'boolean' ||
    !(d.ideaId === null || (typeof d.ideaId === 'string' && !!d.ideaId))
  )
    throw new Error('글감 분류 또는 연결 형식 오류입니다.')
  if (
    !Array.isArray(d.imageIds) ||
    d.imageIds.length > 20 ||
    d.imageIds.some((x) => typeof x !== 'string') ||
    new Set(d.imageIds).size !== d.imageIds.length
  )
    throw new Error('원본 이미지 연결 오류입니다.')
  text(d.publishedDate, 10)
  if (
    d.publishedDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(d.publishedDate) ||
      !Number.isFinite(Date.parse(d.publishedDate)) ||
      new Date(d.publishedDate).toISOString().slice(0, 10) !== d.publishedDate ||
      d.publishedDate > new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10))
  )
    throw new Error('확인 가능한 게시 날짜만 입력하세요.')
  return d
}
export function validateCaptures(d: CaptureData): CaptureData {
  fields(d, 'version images drafts report')
  if (
    d.version !== 1 ||
    !Array.isArray(d.images) ||
    d.images.length > CAPTURE_LIMIT ||
    !Array.isArray(d.drafts) ||
    d.drafts.length > 200
  )
    throw new Error('캡처는 최대 20장, 글감은 최대 200개입니다.')
  for (const i of d.images) {
    fields(i, 'id name type size addedAt')
    text(i.name, 200)
    if (
      !/^[a-f0-9]{64}$/.test(i.id) ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(i.type) ||
      !Number.isSafeInteger(i.size) ||
      i.size < 1 ||
      i.size > CAPTURE_FILE_MAX ||
      !Number.isFinite(Date.parse(i.addedAt))
    )
      throw new Error('이미지 메타데이터 오류입니다.')
  }
  if (
    new Set(d.images.map((i) => i.id)).size !== d.images.length ||
    new Set(d.drafts.map((i) => i.id)).size !== d.drafts.length ||
    d.images.reduce((n, i) => n + i.size, 0) > CAPTURE_TOTAL_MAX
  )
    throw new Error('중복 ID 또는 캡처 전체 용량 초과입니다.')
  d.drafts.forEach(validateDraft)
  if (d.drafts.some((x) => x.imageIds.some((id) => !d.images.some((i) => i.id === id))))
    throw new Error('없는 원본 이미지를 참조합니다.')
  if (d.report !== null) {
    fields(d.report, 'at settings candidateIds entries')
    fields(d.report.settings, 'min documentsMax category sort')
    const s = d.report.settings
    if (
      !Number.isFinite(Date.parse(d.report.at)) ||
      !['priority', 'volume'].includes(s.sort) ||
      !['all', ...categories].includes(s.category) ||
      ![s.min, s.documentsMax].every(
        (v) =>
          typeof v === 'string' &&
          (v === '' || (/^\d+$/.test(v) && Number.isSafeInteger(Number(v)))),
      ) ||
      !Array.isArray(d.report.candidateIds) ||
      d.report.candidateIds.length > 10 ||
      !d.report.candidateIds.every((x) => typeof x === 'string') ||
      new Set(d.report.candidateIds).size !== d.report.candidateIds.length
    )
      throw new Error('추천 기록 형식 오류입니다.')
    if (
      !Array.isArray(d.report.entries) ||
      d.report.entries.length !== d.report.candidateIds.length
    )
      throw new Error('추천 스냅샷 누락')
    for (const [index, r] of d.report.entries.entries()) {
      fields(
        r,
        'id title keyword mode status score pc mobile total source collectedAt documents reasons missing',
      )
      text(r.title, 120)
      text(r.keyword, 60)
      text(r.source, 500)
      if (
        r.id !== d.report.candidateIds[index] ||
        !['LIVE', 'MANUAL'].includes(r.mode) ||
        !['발행 검토 추천', '롱테일 전환 추천'].includes(r.status) ||
        !Number.isFinite(r.score) ||
        !r.collectedAt ||
        !Number.isFinite(Date.parse(r.collectedAt)) ||
        ![r.pc, r.mobile, r.total].every(
          (x) => x === null || x === '<10' || (Number.isSafeInteger(x) && Number(x) >= 0),
        ) ||
        ![r.reasons, r.missing].every(
          (a) =>
            Array.isArray(a) &&
            a.length <= 100 &&
            a.every((s) => typeof s === 'string' && s.length <= 4000),
        )
      )
        throw new Error('추천 스냅샷 형식 오류')
      if (r.documents) {
        fields(r.documents, 'count source checkedDate scope')
        if (!validDocuments(r.documents)) throw new Error('추천 문서 근거 오류')
      }
    }
  }
  if (JSON.stringify(d).length * 2 > 1024 * 1024)
    throw new Error('캡처 글감 저장 예산 1 MiB를 초과했습니다.')
  return d
}
export function duplicateDrafts(drafts: CaptureDraft[]) {
  const groups = new Map<string, string[]>()
  for (const d of drafts) {
    const key = normalizeKeyword(d.title)
    if (key) groups.set(key, [...(groups.get(key) ?? []), d.id])
  }
  return [...groups.values()].filter((ids) => ids.length > 1)
}
/** AI results remain unconfirmed until a person compares each field with the image. */
export function parseExtraction(value: unknown, imageIds: string[]): CaptureDraft[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('AI 추출 결과 형식 오류입니다.')
  return value.map((raw) => {
    fields(
      raw,
      'imageIds title topic keyword source publishedDate summary intent category uncertain',
    )
    const d = validateDraft({ ...newDraft(), ...raw, mode: 'AI', confirmed: false, ideaId: null })
    if (!d.imageIds.length || d.imageIds.some((id) => !imageIds.includes(id)))
      throw new Error('AI 결과의 원본 연결을 확인하세요.')
    return d
  })
}
