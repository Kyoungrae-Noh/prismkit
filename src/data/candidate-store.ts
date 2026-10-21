import { validDocuments } from '../domain/documents'
import { workspaceStorage } from './storage'
import {
  candidateStatuses,
  intents,
  normalizeKeyword,
  type Candidate,
  type AnalysisContext,
} from '../domain/candidates'
export const CANDIDATE_KEY = 'prismkit.candidates.v1'
export interface SavedCandidate {
  id: string
  candidate: Candidate
  context: AnalysisContext
  ideaId: string | null
  savedAt: string
  ruleVersion: 'rules-v1'
}
function validCount(value: unknown) {
  return (
    value === null ||
    value === '<10' ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
  )
}
function validInput(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const row = value as Candidate
  return (
    typeof row.keyword === 'string' &&
    !!row.keyword.trim() &&
    row.keyword.length <= 200 &&
    ['LIVE', 'MANUAL', 'DEMO'].includes(row.mode) &&
    typeof row.source === 'string' &&
    !!row.source &&
    [row.pc, row.mobile, row.total].every(validCount) &&
    (row.collectedAt === null ||
      (typeof row.collectedAt === 'string' && Number.isFinite(Date.parse(row.collectedAt))))
  )
}
function validCandidate(row: Candidate) {
  return (
    validInput(row) &&
    (row.documents === undefined || validDocuments(row.documents)) &&
    typeof row.key === 'string' &&
    !!row.key &&
    typeof row.group === 'string' &&
    intents.includes(row.intent) &&
    candidateStatuses.includes(row.status) &&
    [row.review, row.conflict, row.related, row.reviewman].every(
      (value) => typeof value === 'boolean',
    ) &&
    Array.isArray(row.originals) &&
    row.originals.length > 0 &&
    row.originals.every(validInput) &&
    Array.isArray(row.reasons) &&
    row.reasons.every((reason) => typeof reason === 'string')
  )
}
export function createCandidateStore(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  storage = workspaceStorage(storage)
  function list(): SavedCandidate[] {
    let raw: string | null
    try {
      raw = storage.getItem(CANDIDATE_KEY)
    } catch {
      throw new Error('후보 저장소에 접근할 수 없습니다.')
    }
    if (raw === null) return []
    try {
      const data = JSON.parse(raw)
      if (data.version !== 1 || !Array.isArray(data.items)) throw new Error()
      const ids = new Set<string>()
      for (const item of data.items as SavedCandidate[]) {
        if (
          !item ||
          typeof item.id !== 'string' ||
          !item.id ||
          ids.has(item.id) ||
          item.ruleVersion !== 'rules-v1' ||
          !validCandidate(item.candidate) ||
          typeof item.savedAt !== 'string' ||
          !Number.isFinite(Date.parse(item.savedAt)) ||
          !(item.ideaId === null || typeof item.ideaId === 'string') ||
          typeof item.context?.topic !== 'string' ||
          !Array.isArray(item.context.reviewmanTopics) ||
          !item.context.reviewmanTopics.every((term) => typeof term === 'string')
        )
          throw new Error()
        ids.add(item.id)
      }
      return data.items
    } catch {
      throw new Error('저장된 후보를 읽을 수 없습니다. 원본 자료는 보존되었습니다.')
    }
  }
  function write(items: SavedCandidate[]) {
    try {
      storage.setItem(CANDIDATE_KEY, JSON.stringify({ version: 1, items }))
    } catch {
      throw new Error('후보를 저장하지 못했습니다. 선택은 유지됩니다. 저장 공간을 확인하세요.')
    }
  }
  function save(candidates: Candidate[], context: AnalysisContext, ideaId: string | null) {
    if (candidates.some((row) => !validCandidate(row)))
      throw new Error('후보 자료 형식을 확인하세요.')
    const items = list(),
      added: SavedCandidate[] = []
    let duplicates = 0
    for (const candidate of candidates) {
      if (
        [...items, ...added].some(
          (item) =>
            item.candidate.mode === candidate.mode &&
            normalizeKeyword(item.candidate.keyword) === normalizeKeyword(candidate.keyword),
        )
      ) {
        duplicates++
        continue
      }
      added.push({
        id: crypto.randomUUID(),
        candidate: structuredClone(candidate),
        context: structuredClone(context),
        ideaId,
        savedAt: new Date().toISOString(),
        ruleVersion: 'rules-v1',
      })
    }
    write([...added, ...items])
    return { added: added.length, duplicates }
  }
  function link(id: string, ideaId: string | null) {
    const items = list()
    const item = items.find((item) => item.id === id)
    if (!item) throw new Error('후보를 찾을 수 없습니다.')
    item.ideaId = ideaId
    write(items)
  }
  return { list, save, link }
}
