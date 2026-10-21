import {
  CAPTURE_LIMIT,
  CAPTURE_TOTAL_MAX,
  type CaptureData,
  type CaptureImage,
} from '../domain/captures'
import { imageVault, prepareCapture, type ImageVault } from './capture-images'

interface QueueOptions {
  store: { read(): CaptureData; write(data: CaptureData): void }
  progress(pending: number): void
  saved(data: CaptureData): void
  complete(result: { added: number; failed: File[]; notes: string[] }): void
  prepare?: typeof prepareCapture
  vault?: ImageVault
}

function checkAddition(data: CaptureData, image: CaptureImage) {
  if (data.images.some((i) => i.id === image.id)) return false
  if (data.images.length >= CAPTURE_LIMIT) throw new Error('이미지 개수 초과: 최대 20장입니다.')
  if (data.images.reduce((sum, i) => sum + i.size, 0) + image.size > CAPTURE_TOTAL_MAX)
    throw new Error('전체 저장 용량 초과: 현재 보관 이미지는 총 20 MiB까지 가능합니다.')
  return true
}

// One queue per mounted inbox, shared by every input source. No schema change.
export function createCaptureQueue(options: QueueOptions) {
  const prepare = options.prepare ?? prepareCapture,
    vault = options.vault ?? imageVault
  const pending: File[] = []
  let running = false,
    closed = false,
    inFlight = 0
  async function drain() {
    running = true
    let added = 0
    const failed: File[] = [],
      notes: string[] = []
    try {
      while (pending.length && !closed) {
        const file = pending.shift()!
        inFlight = 1
        options.progress(pending.length + 1)
        try {
          const { meta, blob } = await prepare(file)
          if (closed) break
          if (!checkAddition(options.store.read(), meta)) {
            notes.push(`${file.name}: 동일 원본 중복 제외`)
            continue
          }
          await vault.put([{ id: meta.id, blob }])
          if (closed) break
          // Re-read after asynchronous work; preserve intervening draft edits and images.
          // Immutable blobs may remain for retry/backup if metadata cannot be committed.
          const current = options.store.read()
          if (!checkAddition(current, meta)) {
            notes.push(`${file.name}: 동일 원본 중복 제외`)
            continue
          }
          current.images.push(meta)
          options.store.write(current)
          added++
          options.saved(current)
        } catch (e) {
          failed.push(file)
          notes.push(`${file.name}: ${e instanceof Error ? e.message : '이미지 저장 실패'}`)
        } finally {
          inFlight = 0
        }
      }
    } finally {
      running = false
      if (!closed) options.complete({ added, failed, notes })
    }
  }
  return {
    enqueue(files: File[]) {
      if (closed || !files.length) return false
      if (files.length > CAPTURE_LIMIT) throw new Error('한 번에 최대 20장을 선택하세요.')
      if (pending.length + inFlight + files.length > CAPTURE_LIMIT)
        throw new Error('처리 대기 이미지 개수 초과: 최대 20장입니다. 처리 후 다시 추가하세요.')
      pending.push(...files)
      if (!running) void drain()
      return true
    },
    close() {
      closed = true
      pending.length = 0
    },
  }
}
