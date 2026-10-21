import { it, expect, vi } from 'vitest'
import {
  analyzeDiscovery,
  collectDiscovery,
  discoverySeeds,
  discoveryKeyword,
  groupDiscovery,
  trendDirection,
  discoveryRecommendation,
  discoveryToCandidate,
} from './discovery'
import { demoHub } from '../providers/hub-client'
import { createCandidateStore } from '../data/candidate-store'
import { createLocalRepository } from '../data/local-repository'
import { exportWorkspace, parseBackup, restoreWorkspace, rawSnapshot } from '../data/backup'
import type { HubResult } from '../providers/hub-types'
const dates = { startDate: '2026-10-01', endDate: '2026-10-14' }
it('derives bounded seeds from custom interests and existing user ideas, not fixed seed words', () => {
  expect(discoverySeeds([], [], [])).toEqual([])
  expect(discoverySeeds(['별 관측'], [], [])).toEqual(['별 관측'])
  expect(
    discoverySeeds(
      ['여행'],
      [{ title: '제주 여행', keyword: '제주 예약', category: '여행' }],
      ['새 키워드'],
    ),
  ).toEqual(['제주 예약', '여행'])
  expect(discoverySeeds(['a', 'a', 'b', 'c'], [], [])).toEqual(['a', 'b'])
})
it('extracts question intent conservatively and groups similar news across sources without duplicating URLs', async () => {
  expect(discoveryKeyword('[질문] 여행 신청 방법 알려주세요?')).toBe('여행 신청 방법')
  const a = await demoHub({ api: 'kin', query: '여행' }),
    b = await demoHub({ api: 'news', query: '여행' })
  const rows = groupDiscovery([a, b, b], ['여행 신청 방법'])
  expect(rows).toHaveLength(1)
  expect(rows[0].occurrences).toBe(4)
  expect(rows[0].duplicate).toBe(true)
  expect(rows[0].intent).toBe('신청·접수형')
  expect(rows[0].sources.every((s) => s.date === null)).toBe(true)
})
it('caps initial discovery at two seeds and five calls, retains other sources on a failure', async () => {
  const query = vi.fn(async (r) => {
    if (r.api === 'kin') throw Error('권한 없음')
    return demoHub(r)
  })
  const r = await collectDiscovery(['여행', '생활', '추가'], query, dates, '50000000')
  expect(query).toHaveBeenCalledTimes(5)
  expect(r.errors).toHaveLength(2)
  expect(r.results).toHaveLength(3)
  expect(query.mock.calls.some(([r]) => ['blog', 'cafe', 'trend'].includes(r.api))).toBe(false)
})
it('selected detailed analysis runs SearchAd once and does not fabricate missing volume on error', async () => {
  const volume = vi.fn(async () => {
      throw Error('검색광고 한도 도달')
    }),
    query = vi.fn(demoHub)
  const a = await analyzeDiscovery('신청', query, volume, dates)
  expect(volume).toHaveBeenCalledTimes(1)
  expect(query).toHaveBeenCalledTimes(3)
  expect(a.volume).toBeNull()
  expect(a.errors).toContain('검색량: 검색광고 한도 도달')
})
it('trend uses equal continuous windows; sparse or zero baseline data is never an invented growth rate', async () => {
  const s = (await demoHub({ api: 'trend', query: '여행', ...dates })).series[0]
  expect(trendDirection(s)).toContain('직전 7일 대비')
  expect(trendDirection({ ...s, points: s.points.slice(0, 5) })).toContain('보류')
  expect(
    trendDirection({
      ...s,
      points: s.points.map((p, i) => (i === 6 ? { ...p, date: '2026-09-01' } : p)),
    }),
  ).toContain('누락')
  expect(
    trendDirection({ ...s, points: s.points.map((p, i) => ({ ...p, ratio: i < 7 ? 0 : 100 })) }),
  ).toContain('산정 불가')
})
it('DEMO never recommends publication; unavailable demand and API totals remain unknown', async () => {
  const [c] = groupDiscovery([await demoHub({ api: 'news', query: '여행' })], [])
  expect(discoveryRecommendation(c).status).toContain('DEMO')
  const rec = discoveryRecommendation({ ...c, mode: 'LIVE' })
  expect(rec.status).toBe('추가 조사 필요')
  expect(rec.missing).toContain('실제 검색량')
  expect(rec.reasons.join()).toContain('블로그 미확인')
})
it('measured demand plus limited API counts supports review only, duplicates defer and low demand survives', async () => {
  const [demo] = groupDiscovery([await demoHub({ api: 'news', query: '여행' })], []),
    c = { ...demo, mode: 'LIVE' as const }
  const results = await Promise.all(
    ['blog', 'cafe'].map(async (api) => ({
      ...(await demoHub({ api: api as HubResult['api'], query: c.keyword })),
      mode: 'LIVE' as const,
    })),
  )
  const a = {
    results,
    volume: { keyword: c.keyword, pc: 1000, mobile: 2000, total: 3000 },
    volumeAt: '2026-10-21',
    errors: [],
    related: [],
  }
  expect(discoveryRecommendation(c, a).status).toBe('추가 조사 필요')
  expect(discoveryRecommendation(c, a).missing).toContain('시의성·트렌드')
  expect(discoveryRecommendation(c, a).score).toBeNull()
  expect(discoveryRecommendation({ ...c, duplicate: true }, a).status).toContain('보류')
  expect(
    discoveryRecommendation(c, { ...a, volume: { ...a.volume, total: 1 } }).components[0].value,
  ).toBe(25)
  expect(discoveryToCandidate(c).total).toBeNull()
})
it('shopping produces category-based hypotheses, not invented trending products or sales', async () => {
  const r = await demoHub({ api: 'shopping', query: '생활', ...dates })
  const [c] = groupDiscovery([r], [])
  expect(r.unit).toBe('relative-shopping-click-index')
  expect(r.total).toBeNull()
  expect(c.reasons.join()).toContain('인기 상품 신규 발견·판매량 아님')
})
it('saved discovery provenance and DEMO marker round-trip existing backup without a migration', async () => {
  const memory = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => {
        m.set(k, v)
      },
    }
  }
  const source = memory(),
    target = memory()
  const idea = await createLocalRepository(source).createIdea({
    title: '기존 글감',
    keyword: '보존',
    category: '여행',
    status: 'inbox',
    memo: '기존 자료',
  })
  const [c] = groupDiscovery([await demoHub({ api: 'news', query: '여행' })], [])
  const candidate = discoveryToCandidate(c),
    store = createCandidateStore(source)
  store.save([candidate], { topic: c.title, reviewmanTopics: [] }, idea.id)
  const backup = await exportWorkspace(source)
  await restoreWorkspace(
    target,
    await parseBackup(JSON.stringify(backup)),
    JSON.stringify(rawSnapshot(target)),
  )
  expect(createCandidateStore(target).list()[0].candidate).toEqual(candidate)
  expect((await createLocalRepository(target).listIdeas())[0].memo).toBe('기존 자료')
  expect(store.save([candidate], { topic: c.title, reviewmanTopics: [] }, idea.id).duplicates).toBe(
    1,
  )
})
