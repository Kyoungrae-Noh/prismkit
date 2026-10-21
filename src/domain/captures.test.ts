import { it, expect } from 'vitest'
import {
  emptyCaptures,
  newDraft,
  validateCaptures,
  parseExtraction,
  duplicateDrafts,
} from './captures'
import { extractionProvider } from '../providers/extraction'
const image = {
  id: 'a'.repeat(64),
  name: 'capture.png',
  size: 100,
  type: 'image/png',
  addedAt: new Date().toISOString(),
}
it('accepts several independently editable items in one image and groups exact title duplicates', () => {
  const a = { ...newDraft([image.id]), title: '상품권 신청' },
    b = { ...newDraft([image.id]), title: '상품권  신청' }
  expect(
    validateCaptures({ ...emptyCaptures(), images: [image], drafts: [a, b] }).drafts,
  ).toHaveLength(2)
  expect(duplicateDrafts([a, b])).toEqual([[a.id, b.id]])
})
it('rejects missing images, duplicate IDs, oversized image sets and invalid dates', () => {
  expect(() => validateCaptures({ ...emptyCaptures(), drafts: [newDraft(['missing'])] })).toThrow()
  expect(() => validateCaptures({ ...emptyCaptures(), images: [image, image] })).toThrow()
  expect(() => validateCaptures({ ...emptyCaptures(), images: Array(21).fill(image) })).toThrow()
  expect(() =>
    validateCaptures({
      ...emptyCaptures(),
      drafts: [{ ...newDraft(), publishedDate: '2026-02-30' }],
    }),
  ).toThrow()
})
it('requires extraction schema and original references; no invented numeric evidence or dates', () => {
  const row = {
    imageIds: [image.id],
    title: '보이는 제목',
    keyword: '제목',
    topic: '',
    source: '',
    publishedDate: '',
    summary: '',
    intent: '',
    category: '라이프스타일',
    uncertain: '작은 글자 확인 필요',
  }
  const parsed = parseExtraction([row], [image.id])[0]
  expect(parsed).toMatchObject({
    mode: 'AI',
    confirmed: false,
    source: '',
    publishedDate: '',
    uncertain: row.uncertain,
  })
  expect(() => parseExtraction([{ ...row, monthlySearches: 9999 }], [image.id])).toThrow()
  expect(() => parseExtraction([{ ...row, confirmed: true }], [image.id])).toThrow()
  expect(() => parseExtraction([row], [])).toThrow()
})
it('unconnected AI explicitly rejects without declaring completion', async () => {
  expect(extractionProvider.connected).toBe(false)
  await expect(extractionProvider.extract([])).rejects.toThrow('미연결')
})
