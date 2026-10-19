import { validateResearch, type KeywordResearch, type ResearchInput } from '../domain/research'
export const RESEARCH_KEY = 'prismkit.keyword-research.v1'
export function createResearchStore(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  function read(): KeywordResearch[] {
    let raw: string | null
    try {
      raw = storage.getItem(RESEARCH_KEY)
    } catch {
      throw new Error('키워드 저장소에 접근할 수 없습니다.')
    }
    if (raw === null) return []
    try {
      const payload = JSON.parse(raw)
      if (payload.version !== 1 || !Array.isArray(payload.records)) throw new Error('schema')
      const records = payload.records as KeywordResearch[]
      for (const record of records) {
        if (
          !record ||
          typeof record.id !== 'string' ||
          !record.id ||
          record.mode !== 'MANUAL' ||
          record.verification !== 'UNVERIFIED' ||
          typeof record.createdAt !== 'string' ||
          typeof record.updatedAt !== 'string' ||
          !Number.isFinite(Date.parse(record.createdAt)) ||
          !Number.isFinite(Date.parse(record.updatedAt))
        )
          throw new Error('record')
        validateResearch(record)
      }
      if (new Set(records.map((record) => record.id)).size !== records.length)
        throw new Error('duplicate')
      return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    } catch {
      throw new Error('저장된 키워드 자료를 읽을 수 없습니다. 원본은 보존되었습니다.')
    }
  }
  return {
    async listResearch() {
      return read()
    },
    async saveResearch(input: ResearchInput, id?: string) {
      const records = read()
      const existing = id ? records.find((record) => record.id === id) : undefined
      if (id && !existing) throw new Error('수정할 키워드 자료가 없습니다.')
      const now = new Date().toISOString()
      const record: KeywordResearch = {
        ...validateResearch(input),
        id: existing?.id ?? crypto.randomUUID(),
        mode: 'MANUAL',
        verification: 'UNVERIFIED',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      try {
        storage.setItem(
          RESEARCH_KEY,
          JSON.stringify({
            version: 1,
            records: [record, ...records.filter((item) => item.id !== record.id)],
          }),
        )
      } catch {
        throw new Error(
          '저장 공간이 부족하거나 브라우저에서 저장을 차단했습니다. 입력값을 유지합니다.',
        )
      }
      return record
    },
  }
}
