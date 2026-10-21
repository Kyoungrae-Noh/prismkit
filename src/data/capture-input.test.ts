import { describe, expect, it } from 'vitest'
import { pastedImages, transferFiles } from './capture-input'
import { validateCaptureBlob } from './capture-images'

function transfer(files: File[], types: string[] = ['Files'], items = true) {
  return {
    items: items ? files.map((file) => ({ kind: 'file', getAsFile: () => file })) : [],
    files,
    types,
  } as unknown as DataTransfer
}
const png = () => new File(['image'], 'capture.png', { type: 'image/png' })
function event(data: DataTransfer | null, target: EventTarget = document.body) {
  return { clipboardData: data, target, defaultPrevented: false } as ClipboardEvent
}
describe('browser supplied capture input', () => {
  it('normalizes items once, without duplicating the files list', () => {
    const file = png()
    expect(transferFiles(transfer([file]))).toEqual([file])
  })
  it('accepts files fallback and safely ignores non-file/promised thumbnail data', () => {
    const file = png()
    expect(transferFiles(transfer([file], ['Files'], false))).toEqual([file])
    expect(
      transferFiles({
        items: [{ kind: 'file', getAsFile: () => null }],
        files: [],
      } as unknown as DataTransfer),
    ).toEqual([])
    expect(transferFiles(null)).toEqual([])
  })
  it.each(['Windows Ctrl+V', 'Mac Cmd+V'])('%s uses the same image MIME path', () => {
    const files = [
      png(),
      new File(['jpeg'], 'image.jpg', { type: 'image/jpeg' }),
      new File(['webp'], 'image.webp', { type: 'image/webp' }),
    ]
    expect(pastedImages(event(transfer(files)))).toEqual(files)
  })
  it('preserves plain text, absent clipboard and non-image files', () => {
    expect(pastedImages(event(null))).toEqual([])
    expect(pastedImages(event(transfer([], ['text/plain'])))).toEqual([])
    expect(
      pastedImages(event(transfer([new File(['text'], 'notes.txt', { type: 'text/plain' })]))),
    ).toEqual([])
  })
  it.each(['input', 'textarea'])('prioritizes mixed text/image editing in %s', (tag) => {
    const target = document.createElement(tag)
    expect(pastedImages(event(transfer([png()], ['Files', 'text/plain']), target))).toEqual([])
    expect(pastedImages(event(transfer([png()]), target))).toHaveLength(1)
  })
  it('does not steal an already handled paste', () => {
    expect(pastedImages({ ...event(transfer([png()])), defaultPrevented: true })).toEqual([])
  })
  it('passes unsupported image MIME to the common validator for clear feedback', async () => {
    const file = new File(['gif'], 'capture.gif', { type: 'image/gif' })
    expect(pastedImages(event(transfer([file])))).toEqual([file])
    await expect(validateCaptureBlob(file)).rejects.toThrow('지원하지 않는 이미지 형식')
    await expect(validateCaptureBlob(new Blob([], { type: 'image/png' }))).rejects.toThrow('비어')
    await expect(
      validateCaptureBlob(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: 'image/png' })),
    ).rejects.toThrow('파일 크기 초과')
  })
})
