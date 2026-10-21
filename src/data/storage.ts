/** A single atomic localStorage pointer contains all four datasets after a restore.
 * Legacy keys remain untouched for rollback. Regular writes also update one envelope. */
export const RESTORED_KEY = 'prismkit.restored-workspace.v1'
export const DATA_KEYS = [
  'prismkit.workspace.v1',
  'prismkit.keyword-research.v1',
  'prismkit.candidates.v1',
  'prismkit.publishing.v1',
] as const
export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
export interface RestoreEnvelope {
  version: 1
  datasets: Record<string, string | null>
  previous: Record<string, string | null>
  restoredAt: string
}
export function readEnvelope(storage: StoragePort): RestoreEnvelope | null {
  const raw = storage.getItem(RESTORED_KEY)
  if (raw === null) return null
  const value = JSON.parse(raw) as RestoreEnvelope
  if (
    value.version !== 1 ||
    !value.datasets ||
    !value.previous ||
    !DATA_KEYS.every((key) =>
      [value.datasets[key], value.previous[key]].every((v) => v === null || typeof v === 'string'),
    )
  )
    throw new Error('통합 저장소를 읽을 수 없습니다. 원본을 보존합니다.')
  return value
}
export function workspaceStorage(storage: StoragePort): StoragePort {
  return {
    getItem(key) {
      if (!DATA_KEYS.includes(key as (typeof DATA_KEYS)[number])) return storage.getItem(key)
      const envelope = readEnvelope(storage)
      return envelope ? envelope.datasets[key] : storage.getItem(key)
    },
    setItem(key, value) {
      const envelope = readEnvelope(storage)
      if (!envelope || !DATA_KEYS.includes(key as (typeof DATA_KEYS)[number])) {
        storage.setItem(key, value)
        return
      }
      storage.setItem(
        RESTORED_KEY,
        JSON.stringify({ ...envelope, datasets: { ...envelope.datasets, [key]: value } }),
      )
    },
  }
}
