import { createLocalRepository, STORAGE_KEY } from './local-repository'
import { createResearchStore, RESEARCH_KEY } from './research-store'
import { createCandidateStore, CANDIDATE_KEY, type SavedCandidate } from './candidate-store'
import { createPublishingStore, PUBLISHING_KEY, validatePublishing } from './publishing-store'
import {
  DATA_KEYS,
  RESTORED_KEY,
  workspaceStorage,
  readEnvelope,
  type StoragePort,
} from './storage'
import type { Idea } from '../domain/models'
import type { KeywordResearch } from '../domain/research'
import type { PublishingData } from '../domain/publishing'
import { normalizeKeyword } from '../domain/candidates'
import { CAPTURE_KEY, emptyCaptures, validateCaptures, type CaptureData } from '../domain/captures'
import { createCaptureStore } from './capture-store'
import { imageVault, blobDataUrl, decodeCapture, type ImageVault } from './capture-images'
export const BACKUP_MAX = 64 * 1024 * 1024
export interface Backup {
  format: 'prismkit-workspace'
  version: 1 | 2
  exportedAt: string
  ideas: Idea[]
  research: KeywordResearch[]
  candidates: SavedCandidate[]
  publishing: PublishingData
  captures?: CaptureData
  captureFiles?: Record<string, string>
}
function fields(value: unknown, allowed: string) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.split(' ').includes(key))
  )
    throw new Error(
      '알 수 없는 필드가 있는 백업입니다. 인증정보나 다른 앱 자료는 가져오지 않습니다.',
    )
}
function shapes(b: Backup) {
  fields(b, 'format version exportedAt ideas research candidates publishing captures captureFiles')
  if (b.version === 1 && (b.captures !== undefined || b.captureFiles !== undefined))
    throw new Error('캡처는 version 2 백업이 필요합니다.')
  for (const x of b.ideas) fields(x, 'id title keyword category status memo createdAt updatedAt')
  for (const x of b.research)
    fields(
      x,
      'id keyword related intent ideaId pc mobile blogTotal source checkedDate documentScope mode verification createdAt updatedAt',
    )
  function input(x: SavedCandidate['candidate'], full: boolean) {
    fields(
      x,
      'keyword pc mobile total collectedAt source mode documents' +
        (full
          ? ' key originals intent review group conflict related reviewman status reasons'
          : ''),
    )
    if (x.documents) fields(x.documents, 'count source checkedDate scope')
  }
  for (const x of b.candidates) {
    fields(x, 'id candidate context ideaId savedAt ruleVersion')
    fields(x.context, 'topic reviewmanTopics')
    input(x.candidate, true)
    for (const original of x.candidate.originals)
      input(original as SavedCandidate['candidate'], false)
  }
  fields(b.publishing, 'version analyses publications historyChecked')
  fields(b.publishing.historyChecked, 'nkr09134 nkr09135 nkr09136')
  for (const x of b.publishing.analyses) {
    fields(
      x,
      'candidateId keyword searchUrl checkedDate blog dominant position serp total reviewmanUrl posts quality missingInfo excludeReason images updatedAt',
    )
    fields(
      x.quality,
      'fresh intentMatch specific official solves intentGap officialEdge longtail better',
    )
    for (const p of x.posts) fields(p, 'title url date summary features')
    for (const p of x.images) fields(p, 'id name dataUrl addedAt')
  }
  for (const x of b.publishing.publications)
    fields(x, 'id account keyword topic title status date blogUrl reviewmanUrl ideaId')
}
export function rawSnapshot(storage: StoragePort) {
  const port = workspaceStorage(storage)
  return Object.fromEntries(DATA_KEYS.map((key) => [key, port.getItem(key)]))
}
function datasets(b: Backup) {
  return {
    [STORAGE_KEY]: JSON.stringify({ version: 1, ideas: b.ideas }),
    [RESEARCH_KEY]: JSON.stringify({ version: 1, records: b.research }),
    [CANDIDATE_KEY]: JSON.stringify({ version: 1, items: b.candidates }),
    [PUBLISHING_KEY]: JSON.stringify(b.publishing),
    [CAPTURE_KEY]: b.captures ? JSON.stringify(b.captures) : null,
  }
}
function memory(raw: Record<string, string | null>): StoragePort {
  return {
    getItem: (key) => raw[key] ?? null,
    setItem: () => {
      throw new Error('Read only')
    },
  }
}
export async function exportWorkspace(
  storage: StoragePort,
  vault: ImageVault = imageVault,
): Promise<Backup> {
  const port = memory(rawSnapshot(storage))
  const b: Backup = {
    format: 'prismkit-workspace',
    version: 2,
    exportedAt: new Date().toISOString(),
    ideas: await createLocalRepository(port).listIdeas(),
    research: await createResearchStore(port).listResearch(),
    candidates: createCandidateStore(port).list(),
    publishing: createPublishingStore(port).read(),
    captures: createCaptureStore(port).read(),
    captureFiles: {},
  }
  for (const meta of b.captures!.images)
    b.captureFiles![meta.id] = await blobDataUrl(await vault.get(meta.id))
  shapes(b)
  return b
}
export function referenceIssues(b: Backup): string[] {
  const ideas = new Set(b.ideas.map((x) => x.id)),
    candidates = new Map(b.candidates.map((x) => [x.id, x]))
  const issues: string[] = []
  for (const x of [...b.research, ...b.candidates, ...b.publishing.publications])
    if (x.ideaId !== null && !ideas.has(x.ideaId)) issues.push(`없는 글감 참조: ${x.ideaId}`)
  for (const x of b.publishing.analyses) {
    const c = candidates.get(x.candidateId)
    if (!c || normalizeKeyword(c.candidate.keyword) !== normalizeKeyword(x.keyword))
      issues.push(`경쟁 자료의 후보 연결 불일치: ${x.candidateId}`)
  }
  for (const d of b.captures?.drafts ?? [])
    if (d.ideaId !== null && !ideas.has(d.ideaId)) issues.push(`캡처 글감 연결 없음: ${d.ideaId}`)
  for (const id of b.captures?.report?.candidateIds ?? [])
    if (!candidates.has(id)) issues.push(`추천 기록 후보 없음: ${id}`)
  return [...new Set(issues)]
}
export async function parseBackup(raw: string): Promise<Backup> {
  if (raw.length * 2 > BACKUP_MAX) throw new Error('백업 용량 제한 64 MiB를 초과했습니다.')
  let b: Backup
  try {
    b = JSON.parse(raw)
  } catch {
    throw new Error('올바른 JSON 파일이 아닙니다.')
  }
  if (
    !b ||
    b.format !== 'prismkit-workspace' ||
    ![1, 2].includes(b.version) ||
    typeof b.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(b.exportedAt)) ||
    !Array.isArray(b.ideas) ||
    !Array.isArray(b.research) ||
    !Array.isArray(b.candidates)
  )
    throw new Error('지원하지 않는 전체 백업 형식입니다.')
  // Reuse every store's validators before any destination write.
  const port = memory(datasets(b))
  await createLocalRepository(port).listIdeas()
  await createResearchStore(port).listResearch()
  createCandidateStore(port).list()
  validatePublishing(b.publishing)
  shapes(b)
  if (b.version === 2) {
    validateCaptures(b.captures!)
    if (
      !b.captureFiles ||
      typeof b.captureFiles !== 'object' ||
      Array.isArray(b.captureFiles) ||
      Object.keys(b.captureFiles).length !== b.captures!.images.length
    )
      throw new Error('캡처 원본 백업이 누락되었습니다.')
    for (const meta of b.captures!.images) {
      if (typeof b.captureFiles[meta.id] !== 'string') throw new Error('캡처 원본 누락')
      await decodeCapture(b.captureFiles[meta.id], meta)
    }
  }
  const issues = referenceIssues(b)
  if (issues.length) throw new Error(`연결 무결성 검사 실패: ${issues.join(', ')}`)
  return b
}
export function backupCounts(b: Backup) {
  return {
    글감: b.ideas.length,
    수동자료: b.research.length,
    후보: b.candidates.length,
    경쟁분석: b.publishing.analyses.length,
    발행이력: b.publishing.publications.length,
    캡처: b.publishing.analyses.reduce((n, x) => n + x.images.length, 0),
    글감캡처: b.captures?.images.length ?? 0,
    추출글감: b.captures?.drafts.length ?? 0,
    추천기록: b.captures?.report?.candidateIds.length ?? 0,
  }
}
export function compareBackups(current: Backup, incoming: Backup) {
  let same = 0,
    changed = 0,
    added = 0,
    removed = 0
  const pairs = [
    [current.ideas, incoming.ideas],
    [current.research, incoming.research],
    [current.candidates, incoming.candidates],
    [current.publishing.analyses, incoming.publishing.analyses],
    [current.publishing.publications, incoming.publishing.publications],
    [current.captures?.images ?? [], incoming.captures?.images ?? []],
    [current.captures?.drafts ?? [], incoming.captures?.drafts ?? []],
    [
      current.captures?.report ? [{ id: 'recommendations', ...current.captures.report }] : [],
      incoming.captures?.report ? [{ id: 'recommendations', ...incoming.captures.report }] : [],
    ],
  ] as const
  for (const [old, next] of pairs) {
    const key = (x: { id?: string; candidateId?: string }) => x.id ?? x.candidateId!
    const before = new Map(old.map((x) => [key(x), JSON.stringify(x)]))
    for (const x of next) {
      const prior = before.get(key(x))
      if (!prior) added++
      else if (prior === JSON.stringify(x)) same++
      else changed++
    }
    const after = new Set(next.map(key))
    removed += old.filter((x) => !after.has(key(x))).length
  }
  return { same, changed, added, removed }
}
export async function restoreWorkspace(
  storage: StoragePort,
  incoming: Backup,
  expected: string,
  vault: ImageVault = imageVault,
) {
  const checked = await parseBackup(JSON.stringify(incoming))
  const previous = rawSnapshot(storage)
  if (JSON.stringify(previous) !== expected)
    throw new Error('미리보기 이후 자료가 변경되었습니다. 파일을 다시 선택해 비교하세요.')
  // Stage immutable, content-addressed images first. Failed commits leave only safe, unreferenced blobs.
  const entries = []
  for (const meta of checked.captures?.images ?? [])
    entries.push({ id: meta.id, blob: await decodeCapture(checked.captureFiles![meta.id], meta) })
  await vault.put(entries)
  if (JSON.stringify(rawSnapshot(storage)) !== expected)
    throw new Error('미리보기 이후 자료가 변경되었습니다. 다시 비교하세요.')
  const next = datasets(checked)
  if (checked.version === 1) {
    const kept = previous[CAPTURE_KEY]
    const legacy = kept ? validateCaptures(JSON.parse(kept)) : emptyCaptures()
    const issues = referenceIssues({ ...checked, captures: legacy })
    if (issues.length)
      throw new Error('구버전 백업이 현재 캡처 연결을 끊습니다. 전체 version 2 백업을 사용하세요.')
    next[CAPTURE_KEY] = kept
  }
  const envelope = {
    version: 1,
    datasets: next,
    previous,
    restoredAt: new Date().toISOString(),
  }
  // A single setItem is atomic even on quota errors. Old keys + previous snapshot remain intact.
  try {
    storage.setItem(RESTORED_KEY, JSON.stringify(envelope))
  } catch {
    throw new Error('저장 공간 부족 또는 접근 차단입니다. 기존 자료는 변경되지 않았습니다.')
  }
}
export async function previousBackup(storage: StoragePort) {
  const envelope = readEnvelope(storage)
  if (!envelope) throw new Error('복원 전 자동 백업이 없습니다.')
  return exportWorkspace(memory(envelope.previous))
}
