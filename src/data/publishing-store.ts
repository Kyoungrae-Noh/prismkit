import { workspaceStorage } from './storage'
import {
  accounts,
  emptyPublishing,
  imageBytes,
  IMAGE_TOTAL,
  validateCompetition,
  validatePublication,
  type PublishingData,
  type Competition,
  type Publication,
  type Account,
} from '../domain/publishing'
export const PUBLISHING_KEY = 'prismkit.publishing.v1'
export const STORAGE_BYTES = 4 * 1024 * 1024
export function validatePublishing(value: unknown): PublishingData {
  if (!value || typeof value !== 'object') throw new Error('발행 자료 형식이 올바르지 않습니다.')
  const data = value as PublishingData
  if (
    data.version !== 1 ||
    !Array.isArray(data.analyses) ||
    !Array.isArray(data.publications) ||
    !data.historyChecked ||
    !accounts.every((account) => typeof data.historyChecked[account] === 'boolean')
  )
    throw new Error('지원하지 않는 발행 자료 스키마입니다(version 1 필요).')
  if (data.analyses.length > 1000 || data.publications.length > 3000)
    throw new Error('자료 개수 제한(분석 1,000개/이력 3,000개)을 초과했습니다.')
  data.analyses.forEach(validateCompetition)
  data.publications.forEach(validatePublication)
  if (
    new Set(data.analyses.map((item) => item.candidateId)).size !== data.analyses.length ||
    new Set(data.publications.map((item) => item.id)).size !== data.publications.length
  )
    throw new Error('중복 ID가 있는 자료는 가져올 수 없습니다.')
  const size = data.analyses.reduce(
    (sum, analysis) => sum + analysis.images.reduce((bytes, image) => bytes + imageBytes(image), 0),
    0,
  )
  if (size > IMAGE_TOTAL)
    throw new Error('전체 캡처 용량 1.5 MiB를 초과했습니다. 기존 자료를 삭제하지 않았습니다.')
  if (JSON.stringify(data).length * 2 > STORAGE_BYTES)
    throw new Error('발행 자료의 저장 예산 4 MiB를 초과했습니다.')
  return data
}
export function parsePublishingImport(raw: string): PublishingData {
  if (raw.length * 2 > STORAGE_BYTES) throw new Error('가져올 자료가 4 MiB를 초과합니다.')
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('올바른 JSON 파일이 아닙니다.')
  }
  if (data && typeof data === 'object') {
    const incoming = data as Partial<PublishingData>
    if (incoming.version !== 1) throw new Error('version 1 자료가 필요합니다.')
    data = { ...emptyPublishing(), ...incoming }
  }
  return validatePublishing(data)
}
export function createPublishingStore(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  storage = workspaceStorage(storage)
  function read(): PublishingData {
    let raw: string | null
    try {
      raw = storage.getItem(PUBLISHING_KEY)
    } catch {
      throw new Error('발행 저장소에 접근할 수 없습니다.')
    }
    if (raw === null) return emptyPublishing()
    try {
      return validatePublishing(JSON.parse(raw))
    } catch {
      throw new Error('발행 저장소를 읽지 못했습니다. 원본은 보존되었습니다.')
    }
  }
  function write(data: PublishingData) {
    validatePublishing(data)
    try {
      storage.setItem(PUBLISHING_KEY, JSON.stringify(data))
    } catch {
      throw new Error(
        '브라우저 저장 공간 부족 또는 접근 차단입니다. 기존 자료와 입력값을 유지합니다.',
      )
    }
  }
  function saveCompetition(record: Competition) {
    const data = read()
    validateCompetition(record)
    write({
      ...data,
      analyses: [
        structuredClone(record),
        ...data.analyses.filter((item) => item.candidateId !== record.candidateId),
      ],
    })
  }
  function savePublication(record: Publication) {
    const data = read()
    validatePublication(record)
    write({
      ...data,
      publications: [
        structuredClone(record),
        ...data.publications.filter((item) => item.id !== record.id),
      ],
    })
  }
  function setHistoryChecked(account: Account, checked: boolean) {
    const data = read()
    write({ ...data, historyChecked: { ...data.historyChecked, [account]: checked } })
  }
  function importData(incoming: PublishingData) {
    validatePublishing(incoming)
    const current = read()
    let added = 0,
      skipped = 0
    function merge<T>(existing: T[], items: T[], key: (item: T) => string) {
      const result = [...existing]
      for (const item of items) {
        const old = result.find((value) => key(value) === key(item))
        if (old) {
          if (JSON.stringify(old) !== JSON.stringify(item))
            throw new Error('같은 ID의 다른 자료가 있습니다. 기존 자료를 덮어쓰지 않았습니다.')
          skipped++
        } else {
          result.push(structuredClone(item))
          added++
        }
      }
      return result
    }
    const analyses = merge(current.analyses, incoming.analyses, (item) => item.candidateId),
      publications = merge(current.publications, incoming.publications, (item) => item.id)
    // Import does not assert that the current three-account history is complete.
    write({ ...current, analyses, publications })
    return { added, skipped }
  }
  return { read, saveCompetition, savePublication, setHistoryChecked, importData }
}
