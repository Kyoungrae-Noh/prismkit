import { it, expect } from 'vitest'
import {
  analyzeCandidates,
  applyCandidateFilters,
  presetFilters,
  emptyFilters,
  type CandidateInput,
} from './candidates'
const doc = {
  count: 300,
  source: '수동 검색',
  checkedDate: '2026-01-01',
  scope: '네이버 블로그 탭 전체 기간',
}
function rows(changes: Partial<CandidateInput> = {}) {
  return analyzeCandidates(
    [
      {
        keyword: '상품권 신청',
        pc: 100,
        mobile: 500,
        total: 600,
        source: '테스트',
        mode: 'LIVE',
        collectedAt: '2026-01-01',
        documents: doc,
        ...changes,
      },
    ],
    { topic: '상품권', reviewmanTopics: [] },
  )
}
it('experimental presets apply documented inclusive bounds and preserve originals', () => {
  const original = rows()
  expect(applyCandidateFilters(original, presetFilters('beginner'))).toHaveLength(1)
  expect(applyCandidateFilters(original, presetFilters('demand'))).toHaveLength(0)
  expect(applyCandidateFilters(original, presetFilters('longtail'))).toHaveLength(1)
  expect(original).toHaveLength(1)
  expect(applyCandidateFilters(original, emptyFilters)).toHaveLength(1)
})
it('missing counts, provenance, scope, date and DEMO evidence never pass a document condition', () => {
  for (const changes of [
    { documents: undefined },
    { documents: { ...doc, count: null } },
    { documents: { ...doc, scope: '' } },
    { documents: { ...doc, source: '' } },
    { documents: { ...doc, checkedDate: '2099-01-01' } },
    { mode: 'DEMO' as const },
  ])
    expect(
      applyCandidateFilters(rows(changes), { ...presetFilters('beginner'), keepUnknown: true }),
    ).toHaveLength(0)
})
it('presets exclude unconfirmed volume even with complete document evidence', () => {
  for (const total of [null, '<10'] as const)
    expect(applyCandidateFilters(rows({ total }), presetFilters('beginner'))).toHaveLength(0)
  expect(applyCandidateFilters(rows({ total: 3000 }), presetFilters('demand'))).toHaveLength(1)
})
it('rejects malformed custom document thresholds', () => {
  for (const value of ['-1', '1.5', 'abc', '999999999999999999'])
    expect(() => applyCandidateFilters(rows(), { ...emptyFilters, documentsMax: value })).toThrow()
})
