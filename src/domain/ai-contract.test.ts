import { it, expect } from 'vitest'
import { AI_MODEL, AI_PROVIDER, AI_RESERVE_USD, validateResult, validateItems } from './ai-contract'
import { draftsFromAI, duplicateDrafts, emptyCaptures, validateCaptures } from './captures'
import { createCaptureStore } from '../data/capture-store'
const id = 'a'.repeat(64),
  at = new Date().toISOString()
const item = {
  title: '상품권 신청',
  topic: '신청 안내',
  keywords: ['상품권 신청', '지역 상품권'],
  category: '라이프스타일' as const,
  source: '',
  publishedDate: '',
  summary: '신청 안내',
  intent: '정보 탐색',
  uncertain: '출처·날짜 확인 필요',
  evidence: '상품권 신청',
  sourceEvidence: '',
  dateEvidence: '',
  advertisement: false,
}
const result = {
  imageId: id,
  provider: AI_PROVIDER,
  model: AI_MODEL,
  at,
  items: [item, { ...item }],
  reservedUsd: AI_RESERVE_USD,
}
it('multiple Korean ideas retain original evidence and stay unapproved; cross-image duplicate groups', () => {
  const drafts = draftsFromAI(validateResult(result, id))
  drafts.push(...draftsFromAI({ ...result, imageId: 'b'.repeat(64), items: [item] }))
  expect(drafts).toHaveLength(3)
  expect(
    drafts.every(
      (d) =>
        !d.confirmed &&
        d.ideaId === null &&
        d.source === '' &&
        d.publishedDate === '' &&
        d.mode === 'AI',
    ),
  ).toBe(true)
  expect(duplicateDrafts(drafts)[0]).toHaveLength(3)
  expect(drafts[0].ai?.evidence).toBe(item.evidence)
})
it('rejects unverified dates/sources, numeric hallucinations and forged provenance', () => {
  expect(() => validateItems([{ ...item, source: '추측' }])).toThrow()
  expect(() =>
    validateItems([{ ...item, publishedDate: '2026-02-30', dateEvidence: '날짜' }]),
  ).toThrow()
  expect(() => validateItems([{ ...item, searchVolume: 3000 }])).toThrow()
  expect(() => validateResult({ ...result, model: 'made-up' }, id)).toThrow()
  expect(() => validateResult(result, 'b'.repeat(64))).toThrow()
  expect(() => validateItems([{ ...item, evidence: '' }])).toThrow()
})
it('old capture data stays compatible and AI metadata survives JSON save/reload without changing originals', () => {
  const images = [{ id, name: 'original.png', type: 'image/png', size: 100, addedAt: at }]
  const old = { ...emptyCaptures(), images }
  expect(validateCaptures(structuredClone(old))).toEqual(old)
  const store = createCaptureStore(localStorage)
  store.write(old)
  const next = { ...store.read(), drafts: draftsFromAI(result) }
  next.drafts[0].ai!.edited = true
  next.drafts[0].confirmed = true
  store.write(next)
  expect(store.read()).toEqual(next)
  expect(store.read().images).toEqual(images)
  expect(() =>
    validateCaptures({
      ...next,
      drafts: [{ ...next.drafts[0], ai: { ...next.drafts[0].ai!, extra: 'secret' } as never }],
    }),
  ).toThrow()
})
