import { DRAFT_KEY, validateManuscripts, type Manuscript } from '../domain/manuscripts'
import { workspaceStorage, type StoragePort } from './storage'
export function createManuscriptStore(storage: StoragePort) {
  const port = workspaceStorage(storage)
  function read() {
    const raw = port.getItem(DRAFT_KEY)
    try {
      return raw === null ? [] : validateManuscripts(JSON.parse(raw))
    } catch {
      throw Error('원고 저장소를 읽지 못했습니다. 원본은 보존되었습니다.')
    }
  }
  function save(m: Manuscript, expected?: string) {
    const data = read(),
      old = data.find((x) => x.id === m.id)
    if (expected !== undefined && JSON.stringify(old) !== expected)
      throw Error('다른 탭에서 원고가 바뀌었습니다. 입력을 복사한 뒤 다시 여세요.')
    // Keep checkpoint history without recording every IME keystroke. Never discard prior checkpoints.
    const revisions = m.revisions ?? old?.revisions ?? []
    const changed = old && JSON.stringify(old.content) !== JSON.stringify(m.content)
    const checkpoint =
      changed &&
      (!revisions.length ||
        Date.now() - Date.parse(revisions[revisions.length - 1].savedAt) >= 30000)
    const saved = {
      ...m,
      ...(checkpoint
        ? {
            revisions: [
              ...revisions,
              { savedAt: new Date().toISOString(), content: structuredClone(old.content) },
            ],
          }
        : revisions.length
          ? { revisions }
          : {}),
    }
    const next = [saved, ...data.filter((x) => x.id !== m.id)]
    validateManuscripts(next)
    try {
      port.setItem(DRAFT_KEY, JSON.stringify(next))
    } catch {
      throw Error('원고 저장 공간 부족입니다. 화면의 원고를 내보낸 뒤 저장을 재시도하세요.')
    }
    return next
  }
  return { read, save }
}
