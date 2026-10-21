import { CAPTURE_KEY, emptyCaptures, validateCaptures, type CaptureData } from '../domain/captures'
import { workspaceStorage, type StoragePort } from './storage'
import { commitDatasets, DATA_KEYS } from './storage'
import { createLocalRepository, STORAGE_KEY } from './local-repository'
import { validateIdea } from '../domain/models'
export function createCaptureStore(storage: StoragePort) {
  const port = workspaceStorage(storage)
  return {
    read(): CaptureData {
      const raw = port.getItem(CAPTURE_KEY)
      return raw === null ? emptyCaptures() : validateCaptures(JSON.parse(raw))
    },
    write(data: CaptureData) {
      validateCaptures(data)
      try {
        port.setItem(CAPTURE_KEY, JSON.stringify(data))
      } catch {
        throw new Error('캡처 정보를 저장하지 못했습니다. 기존 자료와 입력은 유지됩니다.')
      }
    },
  }
}
export async function linkCaptureIdea(storage: StoragePort, draftId: string) {
  const port = workspaceStorage(storage),
    snapshot = Object.fromEntries(DATA_KEYS.map((k) => [k, port.getItem(k)])),
    expected = JSON.stringify(snapshot)
  const data = createCaptureStore(storage).read(),
    draft = data.drafts.find((d) => d.id === draftId)
  if (!draft || draft.excluded || !draft.confirmed)
    throw new Error('원본 대조 및 불명확한 정보 확인 후 저장하세요.')
  const ideas = await createLocalRepository({
    getItem: (k) => snapshot[k] ?? null,
    setItem: () => {
      throw new Error('Read only')
    },
  }).listIdeas()
  const input = validateIdea({
    title: draft.title,
    keyword: draft.keyword,
    category: draft.category,
    status: 'inbox',
    memo: [
      draft.summary,
      draft.source ? `출처: ${draft.source}` : '출처 미확인',
      draft.publishedDate ? `게시 날짜: ${draft.publishedDate}` : '날짜 미확인',
      draft.uncertain ? `추가 확인: ${draft.uncertain}` : '',
    ].join('\n'),
  })
  let idea =
    ideas.find((i) => i.id === draft.ideaId) ||
    ideas.find((i) => i.title === input.title && i.keyword === input.keyword)
  if (!idea) {
    const now = new Date().toISOString()
    idea = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
    ideas.unshift(idea)
  } else if (idea.keyword !== input.keyword || idea.title !== input.title)
    throw new Error(
      '연결 글감과 다릅니다. 기존 글감 관리에서 수정하거나 연결을 해제해 새 글감으로 저장하세요.',
    )
  draft.ideaId = idea.id
  commitDatasets(
    storage,
    {
      [STORAGE_KEY]: JSON.stringify({ version: 1, ideas }),
      [CAPTURE_KEY]: JSON.stringify(validateCaptures(data)),
    },
    expected,
  )
  return idea
}
