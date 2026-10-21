import { it, expect } from 'vitest'
import { manuscript } from '../../tests/fixtures/manuscript'
import { createManuscriptStore } from './manuscript-store'
import { exportWorkspace, parseBackup, restoreWorkspace, rawSnapshot } from './backup'
import { DRAFT_KEY } from '../domain/manuscripts'
import { RESTORED_KEY, workspaceStorage } from './storage'
function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v)
    },
  }
}
it('preserves edits, detects concurrent writes and never overwrites corrupted originals', () => {
  const s = storage(),
    store = createManuscriptStore(s),
    m = manuscript()
  store.save(m)
  const before = JSON.stringify(m)
  store.save({ ...m, content: { ...m.content, title: '수정' } }, before)
  expect(createManuscriptStore(s).read()[0].content.title).toBe('수정')
  expect(() => store.save(m, before)).toThrow('다른 탭')
  s.setItem(DRAFT_KEY, 'broken')
  expect(() => store.save(m)).toThrow('보존')
  expect(s.getItem(DRAFT_KEY)).toBe('broken')
})
it('round trips manuscripts in whole backup and preserves them when restoring a legacy backup', async () => {
  const s = storage()
  createManuscriptStore(s).save(manuscript())
  const b = await exportWorkspace(s)
  const parsed = await parseBackup(JSON.stringify(b))
  expect(parsed.manuscripts).toHaveLength(1)
  const t = storage()
  await restoreWorkspace(t, parsed, JSON.stringify(rawSnapshot(t)))
  expect(createManuscriptStore(t).read()[0].generated.title).toBe(manuscript().generated.title)
  delete b.manuscripts
  await restoreWorkspace(t, b, JSON.stringify(rawSnapshot(t)))
  expect(createManuscriptStore(t).read()).toHaveLength(1)
  const malicious = { ...parsed, manuscripts: [{ ...manuscript(), apiKey: 'not-allowed' }] }
  await expect(parseBackup(JSON.stringify(malicious))).rejects.toThrow()
})
it('reads old restore envelopes without rewriting them and fails atomically on quota errors', () => {
  const s = storage(),
    old = { version: 1, datasets: {}, previous: {}, restoredAt: new Date().toISOString() }
  for (const k of [
    'prismkit.workspace.v1',
    'prismkit.keyword-research.v1',
    'prismkit.candidates.v1',
    'prismkit.publishing.v1',
  ]) {
    Object.assign(old.datasets, { [k]: null })
    Object.assign(old.previous, { [k]: null })
  }
  const raw = JSON.stringify(old)
  s.setItem(RESTORED_KEY, raw)
  expect(workspaceStorage(s).getItem(DRAFT_KEY)).toBeNull()
  expect(s.getItem(RESTORED_KEY)).toBe(raw)
  expect(() =>
    createManuscriptStore({
      getItem: s.getItem,
      setItem: () => {
        throw Error('quota')
      },
    }).save(manuscript()),
  ).toThrow('공간')
  expect(s.getItem(RESTORED_KEY)).toBe(raw)
})
