import { describe, it, expect, vi } from 'vitest'
import { createCandidateStore, CANDIDATE_KEY } from './candidate-store'
import { analyzeCandidates, type CandidateInput } from '../domain/candidates'
const input: CandidateInput = {
  keyword: '온누리상품권 신청',
  pc: '<10',
  mobile: 100,
  total: null,
  collectedAt: '2026-10-19T00:00:00Z',
  source: '모의 API',
  mode: 'LIVE',
}
const context = { topic: '온누리상품권', reviewmanTopics: [] }
const candidates = () => analyzeCandidates([input], context)
describe('saved candidates', () => {
  it('saves and restores source, time, bounds, reasons, rule version and linked idea', () => {
    const store = createCandidateStore(localStorage)
    store.save(candidates(), context, 'idea-1')
    const restored = createCandidateStore(localStorage).list()
    expect(restored[0]).toMatchObject({
      candidate: {
        keyword: input.keyword,
        pc: '<10',
        total: null,
        source: input.source,
        collectedAt: input.collectedAt,
        mode: 'LIVE',
      },
      ideaId: 'idea-1',
      context,
      ruleVersion: 'rules-v1',
    })
    expect(restored[0].candidate.reasons.length).toBeGreaterThan(0)
  })
  it('deduplicates batch and later saves without overwriting original evidence', () => {
    const store = createCandidateStore(localStorage),
      rows = candidates()
    expect(store.save([...rows, ...rows], context, null)).toEqual({ added: 1, duplicates: 1 })
    expect(store.save(rows, context, 'other')).toEqual({ added: 0, duplicates: 1 })
    expect(store.list()[0].ideaId).toBeNull()
  })
  it('preserves source modes when same keyword exists as DEMO and LIVE', () => {
    const store = createCandidateStore(localStorage)
    store.save(candidates(), context, null)
    store.save(analyzeCandidates([{ ...input, mode: 'DEMO' }], context), context, null)
    expect(store.list().map((item) => item.candidate.mode)).toEqual(['DEMO', 'LIVE'])
  })
  it('links and unlinks existing ideas without altering keyword data', () => {
    const store = createCandidateStore(localStorage)
    store.save(candidates(), context, null)
    const item = store.list()[0]
    store.link(item.id, 'idea-2')
    expect(store.list()[0].ideaId).toBe('idea-2')
    store.link(item.id, null)
    expect(store.list()[0].candidate).toEqual(item.candidate)
    expect(() => store.link('missing', null)).toThrow()
  })
  it('preserves corrupt storage and rejects writes over it', () => {
    localStorage.setItem(CANDIDATE_KEY, 'corrupt')
    const store = createCandidateStore(localStorage)
    expect(() => store.list()).toThrow('원본')
    expect(() => store.save(candidates(), context, null)).toThrow()
    expect(localStorage.getItem(CANDIDATE_KEY)).toBe('corrupt')
  })
  it('rejects invalid saved modes and counts', () => {
    const store = createCandidateStore(localStorage)
    store.save(candidates(), context, null)
    const payload = JSON.parse(localStorage.getItem(CANDIDATE_KEY)!)
    payload.items[0].candidate.pc = -1
    localStorage.setItem(CANDIDATE_KEY, JSON.stringify(payload))
    expect(() => store.list()).toThrow()
  })
  it('reports quota failure without overwriting existing candidates', () => {
    const store = createCandidateStore(localStorage)
    store.save(candidates(), context, null)
    const before = localStorage.getItem(CANDIDATE_KEY)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => store.save(candidates(), context, null)).toThrow('선택은 유지')
    expect(localStorage.getItem(CANDIDATE_KEY)).toBe(before)
  })
})
