import { imageBytes, IMAGE_MAX, type Evidence } from '../domain/publishing'
export async function validateImagePreview(image: Evidence) {
  imageBytes(image)
  await new Promise<void>((resolve, reject) => {
    const preview = new Image()
    preview.onload = () => {
      if (!preview.naturalWidth || preview.naturalWidth * preview.naturalHeight > 20000000)
        reject(new Error('이미지 해상도는 최대 2,000만 화소입니다.'))
      else resolve()
    }
    preview.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'))
    preview.src = image.dataUrl
  })
}
export async function readEvidence(file: File): Promise<Evidence> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > IMAGE_MAX)
    throw new Error('PNG/JPEG/WebP 파일만 가능하며 파일당 최대 512 KiB입니다.')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
  const image = {
    id: crypto.randomUUID(),
    name: file.name.slice(0, 200),
    dataUrl,
    addedAt: new Date().toISOString(),
  }
  await validateImagePreview(image)
  return image
}
