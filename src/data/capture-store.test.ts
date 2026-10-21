import { it, expect, vi } from 'vitest'
import { createCaptureStore, linkCaptureIdea } from './capture-store'
import { CAPTURE_KEY, emptyCaptures, newDraft } from '../domain/captures'
import { RESTORED_KEY, DATA_KEYS, readEnvelope } from './storage'
import { createLocalRepository, STORAGE_KEY } from './local-repository'
import { exportWorkspace, parseBackup, restoreWorkspace, rawSnapshot } from './backup'
it('reads a Phase 3A four-key envelope without modifying any bytes', () => {
  const datasets = Object.fromEntries(
    DATA_KEYS.filter((k) => k !== CAPTURE_KEY).map((k) => [k, null]),
  )
  const raw = JSON.stringify({
    version: 1,
    datasets,
    previous: datasets,
    restoredAt: new Date().toISOString(),
  })
  localStorage.setItem(RESTORED_KEY, raw)
  expect(createCaptureStore(localStorage).read()).toEqual(emptyCaptures())
  expect(readEnvelope(localStorage)?.datasets[CAPTURE_KEY]).toBeNull()
  expect(localStorage.getItem(RESTORED_KEY)).toBe(raw)
})
it('atomically links confirmed drafts, reuses same idea and preserves all legacy keys', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ideas: [] }))
  const legacy = localStorage.getItem(STORAGE_KEY)
  const draft = { ...newDraft(), title: '확인한 글감', keyword: '신청 방법', confirmed: true }
  createCaptureStore(localStorage).write({ ...emptyCaptures(), drafts: [draft] })
  const first = await linkCaptureIdea(localStorage, draft.id)
  const again = await linkCaptureIdea(localStorage, draft.id)
  expect(again.id).toBe(first.id)
  expect(await createLocalRepository(localStorage).listIdeas()).toHaveLength(1)
  expect(localStorage.getItem(STORAGE_KEY)).toBe(legacy)
  expect(createCaptureStore(localStorage).read().drafts[0].ideaId).toBe(first.id)
})
it('quota error cannot create an idea without its capture link', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ideas: [] }))
  const d = { ...newDraft(), title: '실패 테스트', keyword: '테스트', confirmed: true }
  createCaptureStore(localStorage).write({ ...emptyCaptures(), drafts: [d] })
  const before = rawSnapshot(localStorage)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceeded')
  })
  await expect(linkCaptureIdea(localStorage, d.id)).rejects.toThrow()
  expect(rawSnapshot(localStorage)).toEqual(before)
})
it('unconfirmed drafts cannot be promoted, and v2 backup preserves capture records', async () => {
  const d = { ...newDraft(), title: '미확인', keyword: '키워드' }
  createCaptureStore(localStorage).write({ ...emptyCaptures(), drafts: [d] })
  await expect(linkCaptureIdea(localStorage, d.id)).rejects.toThrow('확인')
  const b = await exportWorkspace(localStorage)
  expect((await parseBackup(JSON.stringify(b))).captures?.drafts).toEqual([d])
})
it('imports legacy backups without deleting current capture drafts', async () => {
  const b = await exportWorkspace(localStorage)
  const legacy = { ...b, version: 1 }
  delete legacy.captures
  delete legacy.captureFiles
  const d = { ...newDraft(), title: '보존할 캡처' }
  createCaptureStore(localStorage).write({ ...emptyCaptures(), drafts: [d] })
  await restoreWorkspace(
    localStorage,
    await parseBackup(JSON.stringify(legacy)),
    JSON.stringify(rawSnapshot(localStorage)),
  )
  expect(createCaptureStore(localStorage).read().drafts).toEqual([d])
})
it('does not switch the workspace when image storage fails', async () => {
  const b = await exportWorkspace(localStorage),
    before = rawSnapshot(localStorage)
  await expect(
    restoreWorkspace(localStorage, b, JSON.stringify(before), {
      get: async () => new Blob(),
      put: async () => {
        throw new Error('IDB quota')
      },
    }),
  ).rejects.toThrow('quota')
  expect(rawSnapshot(localStorage)).toEqual(before)
})
