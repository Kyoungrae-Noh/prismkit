import { describe, it, expect, vi } from 'vitest'
import {
  analyzeCandidates,
  applyCandidateFilters,
  classifyIntent,
  emptyFilters,
  normalizeKeyword,
  sortCandidates,
  summarizeCandidates,
  type CandidateInput,
} from './candidates'
const row = (keyword: string, total: number | null = 100): CandidateInput => ({
  keyword,
  total,
  pc: total,
  mobile: total === null ? null : 0,
  collectedAt: '2026-10-19T00:00:00Z',
  source: '모의 검색광고',
  mode: 'LIVE',
})
const context = { topic: '온누리상품권', reviewmanTopics: [] }
describe('local candidate rules', () => {
  it('processes 515 received rows without network access', () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const result = analyzeCandidates(
      Array.from({ length: 515 }, (_, i) => row(`온누리상품권 ${i} 신청`, i)),
      context,
    )
    expect(result).toHaveLength(515)
    expect(fetch).not.toHaveBeenCalled()
    expect(summarizeCandidates(result).known).toBe(515)
  })
  it('classifies each explicit intent and requires review for ambiguity', () => {
    for (const [keyword, intent] of [
      ['상품권 사용처', '정보 확인형'],
      ['상품권 신청', '신청·접수형'],
      ['상품권 잔액 조회', '조회·확인형'],
      ['여행 예매', '예약·예매형'],
      ['상품권 비교', '비교·선택형'],
      ['상품권 구매', '구매·전환형'],
      ['상품권', '기타·불명확'],
    ])
      expect(classifyIntent(keyword).intent).toBe(intent)
    expect(classifyIntent('상품권 신청 조회').review).toBe(true)
  })
  it('does not merge cancellation or negative meanings into positive actions', () => {
    const result = analyzeCandidates(
      [row('온누리상품권 신청'), row('온누리상품권 신청 취소'), row('온누리상품권 신청 불가')],
      context,
    )
    expect(new Set(result.map((item) => item.group)).size).toBe(3)
    expect(result[1].review).toBe(true)
  })
  it('deduplicates presentation variants while retaining all originals', () => {
    const result = analyzeCandidates(
      [
        row('온누리 상품권 신청'),
        row('온누리상품권·신청'),
        row('온누리상품권-신청'),
        row('온누리상품권신청'),
      ],
      context,
    )
    expect(result).toHaveLength(1)
    expect(result[0].originals).toHaveLength(4)
    expect(result[0].total).toBe(100)
  })
  it('preserves meaningful symbols and numeric ranges', () => {
    expect(normalizeKeyword('C++')).not.toBe(normalizeKeyword('C#'))
    expect(normalizeKeyword('10-20 할인')).not.toBe(normalizeKeyword('1020 할인'))
    expect(normalizeKeyword('유료')).not.toBe(normalizeKeyword('무료'))
  })
  it('retains conflicting duplicate evidence instead of summing or picking higher volume', () => {
    const result = analyzeCandidates(
      [row('온누리상품권 신청', 100), row('온누리 상품권 신청', 200)],
      context,
    )
    expect(result[0]).toMatchObject({ conflict: true, total: null, status: '추가 검증 필요' })
    expect(result[0].originals).toHaveLength(2)
  })
  it('groups similar expressions tentatively but never removes separate candidates', () => {
    const result = analyzeCandidates(
      [row('온누리상품권 신청 방법'), row('온누리상품권 접수 방법'), row('온누리상품권 신청 대상')],
      { ...context, reviewmanTopics: ['온누리상품권'] },
    )
    expect(result).toHaveLength(3)
    expect(result[0].group).toBe(result[1].group)
    expect(result[0].group).not.toBe(result[2].group)
    expect(result[0].status).toBe('추가 검증 필요')
  })
  it('preserves low volume, zero, missing and bounded longtail candidates', () => {
    const result = analyzeCandidates(
      [
        row('온누리상품권 신청', 1),
        row('온누리상품권 조회', 0),
        { ...row('온누리상품권 예약', null), pc: '<10', mobile: 20 },
      ],
      context,
    )
    expect(result.map((item) => item.status)).toEqual(['롱테일 후보', '롱테일 후보', '롱테일 후보'])
    expect(result[2].pc).toBe('<10')
    expect(result[2].total).toBeNull()
  })
  it('only suggests primary review with explicit intent, topic, user link context and known demand', () => {
    const input = [row('온누리상품권 신청', 1)]
    expect(
      analyzeCandidates(input, { ...context, reviewmanTopics: ['온누리상품권'] })[0].status,
    ).toBe('1차 검토 추천')
    expect(
      analyzeCandidates(input, { topic: '다른 주제', reviewmanTopics: ['온누리상품권'] })[0].status,
    ).toBe('추가 검증 필요')
    expect(analyzeCandidates([row('온누리상품권', 100000)], context)[0].status).toBe(
      '추가 검증 필요',
    )
  })
  it('filters inclusive total and per-device ranges without treating missing as zero', () => {
    const data = analyzeCandidates(
      [row('a', 100), row('b', 500), row('c', null), { ...row('d', null), pc: '<10' }],
      context,
    )
    const filters = {
      ...emptyFilters,
      min: '100',
      max: '500',
      pcMin: '100',
      mobileMax: '0',
      keepUnknown: false,
    }
    expect(applyCandidateFilters(data, filters).map((item) => item.keyword)).toEqual(['a', 'b'])
    expect(applyCandidateFilters(data, { ...filters, keepUnknown: true })).toHaveLength(4)
  })
  it('rejects malformed and reversed ranges', () => {
    for (const filters of [
      { min: '-1' },
      { max: '1.5' },
      { min: '500', max: '100' },
      { pcMin: '1e3' },
    ])
      expect(() => applyCandidateFilters([], { ...emptyFilters, ...filters })).toThrow()
  })
  it('excludes matching terms from active results but allows explicit excluded-candidate review', () => {
    const data = analyzeCandidates([row('온누리상품권 신청'), row('온누리상품권 취소')], context)
    expect(applyCandidateFilters(data, { ...emptyFilters, exclude: '취소' })).toHaveLength(1)
    const excluded = applyCandidateFilters(data, {
      ...emptyFilters,
      exclude: '취소',
      status: '제외 후보',
    })
    expect(excluded[0].keyword).toContain('취소')
    expect(data).toHaveLength(2)
  })
  it('filters by inclusion and intent', () => {
    const data = analyzeCandidates(
      [row('온누리상품권 신청'), row('온누리상품권 조회'), row('여행 신청')],
      context,
    )
    expect(
      applyCandidateFilters(data, { ...emptyFilters, include: '온누리', intent: '신청·접수형' }),
    ).toHaveLength(1)
  })
  it('sorts all numeric directions with unknown values always last', () => {
    const data = analyzeCandidates([row('a', null), row('b', 500), row('c', 0)], context)
    expect(sortCandidates(data, 'total-asc').map((row) => row.keyword)).toEqual(['c', 'b', 'a'])
    for (const sort of ['total-desc', 'pc-desc', 'priority'] as const)
      expect(sortCandidates(data, sort).at(-1)?.keyword).toBe('a')
    expect(sortCandidates(data, 'name')[0].keyword).toBe('a')
  })
  it('keeps DEMO, MANUAL and LIVE provenance separate', () => {
    const input = row('온누리상품권')
    const data = analyzeCandidates(
      [input, { ...input, mode: 'DEMO' }, { ...input, mode: 'MANUAL' }],
      context,
    )
    expect(data).toHaveLength(3)
    expect(new Set(data.map((row) => row.mode)).size).toBe(3)
  })
  it('summaries count actual filtered records without guessing missing volumes', () => {
    const data = analyzeCandidates(
      [row('온누리상품권 신청'), row('온누리상품권 조회', null)],
      context,
    )
    expect(summarizeCandidates(data)).toMatchObject({ count: 2, known: 1, longtail: 2 })
    expect(
      summarizeCandidates(
        applyCandidateFilters(data, { ...emptyFilters, min: '500', keepUnknown: false }),
      ).count,
    ).toBe(0)
  })
})
