import { CAPTURE_FILE_MAX, type CaptureImage } from '../domain/captures'
export interface ImageVault {
  get(id: string): Promise<Blob>
  put(entries: { id: string; blob: Blob }[]): Promise<void>
}
const VAULT_MAX = 64 * 1024 * 1024
function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('prismkit-capture-images', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('images', { keyPath: 'id' })
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(new Error('이미지 저장소에 접근할 수 없습니다.'))
    r.onblocked = () => reject(new Error('다른 Prismkit 탭을 닫고 다시 시도하세요.'))
  })
}
export const imageVault: ImageVault = {
  async get(id) {
    const db = await openVault()
    try {
      return await new Promise<Blob>((resolve, reject) => {
        const r = db.transaction('images').objectStore('images').get(id)
        r.onsuccess = () =>
          r.result?.blob instanceof Blob
            ? resolve(r.result.blob)
            : reject(new Error('원본 이미지가 없습니다. 전체 백업으로 복원하세요.'))
        r.onerror = () => reject(new Error('이미지 읽기 실패'))
      })
    } finally {
      db.close()
    }
  },
  async put(entries) {
    if (!entries.length) return
    const db = await openVault()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('images', 'readwrite'),
          store = tx.objectStore('images')
        let bytes = 0
        const ids = new Set<string>()
        const cursor = store.openCursor()
        cursor.onsuccess = () => {
          const c = cursor.result
          if (c) {
            bytes += c.value.blob.size
            ids.add(c.value.id)
            c.continue()
            return
          }
          for (const e of entries)
            if (!ids.has(e.id)) {
              bytes += e.blob.size
              ids.add(e.id)
              store.add(e)
            }
          if (bytes > VAULT_MAX) tx.abort()
        }
        tx.oncomplete = () => resolve()
        tx.onabort = tx.onerror = () =>
          reject(new Error('이미지 저장 공간 부족 또는 접근 오류입니다. 기존 자료는 보존됩니다.'))
      })
    } finally {
      db.close()
    }
  },
}
export async function digest(blob: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
}
export async function validateCaptureBlob(blob: Blob) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type))
    throw new Error('지원하지 않는 이미지 형식입니다. PNG/JPEG/WebP 파일만 가능합니다.')
  if (blob.size < 1) throw new Error('이미지 파일이 비어 있습니다.')
  if (blob.size > CAPTURE_FILE_MAX) throw new Error('파일 크기 초과: 파일당 4 MiB 이하입니다.')
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer()),
    s = String.fromCharCode(...b)
  if (
    !(blob.type === 'image/png'
      ? s.startsWith('\x89PNG\r\n\x1a\n')
      : blob.type === 'image/jpeg'
        ? s.startsWith('\xff\xd8\xff')
        : s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP')
  )
    throw new Error('이미지 실제 형식이 확장자와 다릅니다.')
}
export async function prepareCapture(file: File): Promise<{ meta: CaptureImage; blob: Blob }> {
  await validateCaptureBlob(file)
  const bitmap = await createImageBitmap(file)
  try {
    if (!bitmap.width || bitmap.width * bitmap.height > 20000000)
      throw new Error('이미지는 최대 2,000만 화소입니다.')
  } finally {
    bitmap.close()
  }
  return {
    meta: {
      id: await digest(file),
      name: file.name.slice(0, 200),
      size: file.size,
      type: file.type,
      addedAt: new Date().toISOString(),
    },
    blob: file,
  }
}
export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('이미지 백업 읽기 실패'))
    r.readAsDataURL(blob)
  })
}
export async function decodeCapture(dataUrl: string, meta: CaptureImage): Promise<Blob> {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || match[2].length > Math.ceil(CAPTURE_FILE_MAX / 3) * 4)
    throw new Error('백업 이미지 형식 오류')
  const binary = atob(match[2])
  const blob = new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], { type: match[1] })
  await validateCaptureBlob(blob)
  if (blob.type !== meta.type || blob.size !== meta.size || (await digest(blob)) !== meta.id)
    throw new Error('백업 이미지 해시 또는 크기가 다릅니다.')
  return blob
}
