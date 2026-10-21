import { describe, expect, it, vi } from 'vitest'
import { createResearchStore, RESEARCH_KEY } from './research-store'
import {
  assessResearch,
  parseCount,
  splitKeywords,
  totalVolume,
  validateResearch,
  type ResearchInput,
} from '../domain/research'
import { createManualProviders } from '../providers/manual'
import { canConnect, sourceAudits } from '../providers/catalog'
import { createUnavailableProvider } from '../providers/unavailable'

const input: ResearchInput = {
  keyword: '캠핑',
  related: ['가을 캠핑'],
  intent: '정보 탐색',
  ideaId: null,
  pc: 0,
  mobile: 100,
  blogTotal: null,
  source: '사용자가 확인한 도구',
  checkedDate: '2026-01-01',
}
describe('manual research integrity', () => {
  it('preserves zero, missing and bounded counts without inventing an exact sum', () => {
    expect(parseCount('')).toBeNull()
    expect(parseCount('0')).toBe(0)
    expect(parseCount('< 10')).toBe('<10')
    expect(totalVolume('<10', 100)).toBeNull()
    expect(totalVolume(null, 100)).toBeNull()
    expect(totalVolume(0, 100)).toBe(100)
    for (const value of ['-1', '1.5', '1e4', 'NaN', '99999999999999999999'])
      expect(() => parseCount(value)).toThrow()
    expect(() => parseCount('<10', false)).toThrow()
  })
  it('normalizes pasted keywords and rejects invalid provenance and dates', () => {
    expect(splitKeywords('캠핑, 가을 캠핑\n캠핑;텐트\t장비')).toEqual([
      '캠핑',
      '가을 캠핑',
      '텐트',
      '장비',
    ])
    expect(validateResearch({ ...input, related: ['캠핑', '가을 캠핑'] }).related).toEqual([
      '가을 캠핑',
    ])
    for (const checkedDate of ['2026-02-30', '2999-01-01', 'yesterday'])
      expect(() => validateResearch({ ...input, checkedDate })).toThrow()
    expect(() => validateResearch({ ...input, source: ' ' })).toThrow()
    expect(() => splitKeywords('x'.repeat(61))).toThrow()
  })
  it('persists and edits provenance, dates, and missing values independently of ideas', async () => {
    const store = createResearchStore(localStorage)
    const created = await store.saveResearch(input)
    await store.saveResearch(
      { ...input, pc: '<10', source: '다른 출처', checkedDate: '2026-02-01' },
      created.id,
    )
    const records = await createResearchStore(localStorage).listResearch()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      pc: '<10',
      blogTotal: null,
      source: '다른 출처',
      checkedDate: '2026-02-01',
      mode: 'MANUAL',
      verification: 'UNVERIFIED',
      createdAt: created.createdAt,
    })
    await expect(store.saveResearch(input, 'missing')).rejects.toThrow()
  })
  it('does not overwrite corrupt or falsely verified saved records', async () => {
    for (const raw of [
      'broken',
      JSON.stringify({
        version: 1,
        records: [{ ...input, mode: 'API', verification: 'VERIFIED' }],
      }),
    ]) {
      localStorage.setItem(RESEARCH_KEY, raw)
      await expect(createResearchStore(localStorage).saveResearch(input)).rejects.toThrow(
        '원본은 보존',
      )
      expect(localStorage.getItem(RESEARCH_KEY)).toBe(raw)
    }
  })
  it('reports quota errors without discarding stored records', async () => {
    const store = createResearchStore(localStorage)
    await store.saveResearch(input)
    const original = localStorage.getItem(RESEARCH_KEY)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota')
    })
    await expect(store.saveResearch(input)).rejects.toThrow('입력값을 유지')
    expect(localStorage.getItem(RESEARCH_KEY)).toBe(original)
  })
  it('returns provenance and missing fields through each provider without network requests', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const record = await createResearchStore(localStorage).saveResearch(input)
    const provider = createManualProviders(record)
    expect(await provider.expand('캠핑')).toMatchObject({
      data: { keywords: ['가을 캠핑'], kind: 'manual' },
      source: { mode: 'MANUAL' },
      verification: 'UNVERIFIED',
      checkedDate: '2026-01-01',
    })
    expect((await provider.getVolume('캠핑')).data?.total).toBe(100)
    expect(await provider.getTrend('캠핑')).toMatchObject({
      data: null,
      error: { code: 'MISSING_DATA' },
      missing: ['trend'],
    })
    expect((await provider.getCompetition('캠핑')).missing).toContain('quality')
    expect((await provider.getVolume('다른 키워드')).data).toBeNull()
    expect(assessResearch().recommendation).toBe('보류')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('blocks documented, untested or unapproved sources and never substitutes demo results', async () => {
    for (const source of sourceAudits) {
      expect(canConnect(source)).toBe(source.usageApproved)
      expect(await createUnavailableProvider(source).getVolume('캠핑')).toMatchObject({
        data: null,
        collectedAt: null,
        error: { code: 'NOT_CONNECTED' },
      })
    }
    expect(
      canConnect({
        ...sourceAudits[0],
        verification: 'VERIFIED',
        authenticatedTestAt: '2026-10-19T00:00:00Z',
      }),
    ).toBe(false)
    expect(
      canConnect({
        ...sourceAudits[0],
        verification: 'VERIFIED',
        authenticatedTestAt: '2026-10-19T00:00:00Z',
        usageApproved: true,
      }),
    ).toBe(true)
  })
})
