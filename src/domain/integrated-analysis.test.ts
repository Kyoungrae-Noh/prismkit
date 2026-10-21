import { it, expect, vi } from 'vitest'
import {
  analysisKeyword,
  trendAssessment,
  competitionAnalysis,
  evaluatePublication,
  evaluationWeights,
} from './integrated-analysis'
import { analyzeDiscovery, groupDiscovery, discoveryToCandidate } from './discovery'
import { demoHub } from '../providers/hub-client'
import { cachedQuery } from '../providers/analysis-client'
import { createCandidateStore } from '../data/candidate-store'
import { exportWorkspace, parseBackup, restoreWorkspace, rawSnapshot } from '../data/backup'
import type { SearchAdResponse } from '../providers/searchad-types'
const dates = { startDate: '2026-10-01', endDate: '2026-10-20' }
function volume(keyword: string, total: number | null = 5000): SearchAdResponse {
  const meta = {
    source: { id: 'searchad', label: '검색광고', mode: 'API' as const },
    verification: 'VERIFIED' as const,
    collectedAt: '2026-10-21T12:00:00Z',
    checkedDate: '2026-10-21',
    error: null,
    missing: [],
  }
  return {
    volume: {
      ...meta,
      data: { pc: total === null ? '<10' : 1000, mobile: 4000, total, period: 'recent-30-days' },
    },
    expansion: { ...meta, data: { keywords: ['연관어'], kind: 'searchad-related' } },
    rows: [{ keyword, pc: total === null ? '<10' : 1000, mobile: 4000, total }],
    cached: false,
  }
}
const live = async (r: Parameters<typeof demoHub>[0]) => ({
  ...(await demoHub(r)),
  mode: 'LIVE' as const,
})
it('extracts a core without replacing the title, preserves brands/numbers and supports Korean questions', () => {
  expect(analysisKeyword('카카오뱅크 비상금대출 연장 가능성')).toBe('카카오뱅크 비상금대출')
  expect(analysisKeyword('[질문] 청년월세지원 신청 방법?')).toBe('청년월세지원')
  expect(analysisKeyword('C++ 2026 사용 방법')).toBe('C++ 2026')
  expect(analysisKeyword('신청 방법')).toBe('신청')
  expect(analysisKeyword('AI')).toBe('AI')
})
it('one integrated action resolves exact demand and each HUB result with progress and no extra fallback calls', async () => {
  const query = vi.fn(live),
    search = vi.fn(async (k: string) => volume(k)),
    progress = vi.fn()
  const a = await analyzeDiscovery(
    analysisKeyword('카카오뱅크 비상금대출 연장 가능성'),
    query,
    search,
    dates,
    '',
    { onProgress: progress },
  )
  expect(search).toHaveBeenCalledOnce()
  expect(search).toHaveBeenCalledWith('카카오뱅크 비상금대출')
  expect(query).toHaveBeenCalledTimes(3)
  expect(a.volume?.total).toBe(5000)
  expect(Object.values(a.states!).every((s) => s.state === 'LIVE 확인')).toBe(true)
  expect(
    progress.mock.calls.some(
      ([v]) => v.states.searchad.state === 'LIVE 확인' && v.states.blog.state === '미조회',
    ),
  ).toBe(true)
})
it('related demand is never substituted; <10, missing and measured zero are distinct', async () => {
  const missing = await analyzeDiscovery(
    '정확한키워드',
    live,
    async () => volume('연관어', 99999),
    dates,
  )
  expect(missing.volume).toBeNull()
  expect(missing.states?.searchad?.state).toBe('자료 부족')
  const bounded = await analyzeDiscovery('검색어', live, async (k) => volume(k, null), dates)
  expect(bounded.volume?.pc).toBe('<10')
  expect(bounded.volume?.total).toBeNull()
  expect(bounded.states?.searchad?.state).toBe('자료 부족')
  const zero = await analyzeDiscovery('검색어', live, async (k) => volume(k, 0), dates)
  expect(zero.volume?.total).toBe(0)
  expect(zero.states?.searchad?.state).toBe('LIVE 확인')
})
it('partial failure retains previous successful data with failure/time labels and excludes it from scoring', async () => {
  const previous = await analyzeDiscovery('여행 준비물', live, async (k) => volume(k), dates)
  const failing = vi.fn(async (r: Parameters<typeof demoHub>[0]) => {
    if (r.api === 'blog') throw Error('429 자동 재시도 금지')
    return live(r)
  })
  const a = await analyzeDiscovery(
    '여행 준비물',
    failing,
    async () => {
      throw Error('401')
    },
    dates,
    '',
    { previous },
  )
  expect(failing).toHaveBeenCalledTimes(3)
  expect(a.volume?.total).toBe(5000)
  expect(a.states?.searchad).toMatchObject({
    state: '조회 실패',
    retained: true,
    at: previous.volumeAt,
  })
  expect(a.states?.blog).toMatchObject({ state: '조회 실패', retained: true })
  const [c] = groupDiscovery([await live({ api: 'kin', query: '여행 준비물' })], [])
  expect(evaluatePublication(c, a).components[0].value).toBeNull()
  expect(a.results.find((r) => r.api === 'cafe')?.total).toBe(180)
  a.states!.searchad!.state = '미조회'
  expect(evaluatePublication(c, a).components[0].value).toBeNull()
})
it('trend requires consecutive comparable windows through the requested endpoint', async () => {
  const series = (await live({ api: 'trend', query: '여행', ...dates })).series[0]
  expect(trendAssessment(series, dates.endDate).comparable).toBe(true)
  expect(
    trendAssessment({ ...series, points: series.points.slice(0, 14) }, dates.endDate).comparable,
  ).toBe(false)
  expect(
    trendAssessment({ ...series, points: series.points.filter((_, i) => i !== 12) }, dates.endDate)
      .comparable,
  ).toBe(false)
  expect(
    trendAssessment(
      { ...series, points: series.points.map((p, i) => ({ ...p, ratio: i < 13 ? 0 : 100 })) },
      dates.endDate,
    ).change,
  ).toBeNull()
})
it('competition only analyzes provided titles/snippets; cafe date and missing body remain unknown', async () => {
  const r = await live({ api: 'cafe', query: '대출' })
  const result = competitionAnalysis([r], '대출')
  expect(result.posts[0].terms).toEqual(['대출'])
  expect(result.posts[0].freshness).toContain('미제공')
  expect(result.repeated.some((t) => t.topic === '신청')).toBe(true)
  expect(result.absent).toContain('조건')
  expect(result.outline.join()).toContain('공식 자료 확인 후')
})
it('weights total 100, missing dimensions never become zero or get reweighted, sensitive facts gate recommendation', async () => {
  expect(Object.values(evaluationWeights).reduce((n, x) => n + x, 0)).toBe(100)
  const [c] = groupDiscovery(
    [await live({ api: 'kin', query: '카카오뱅크 비상금대출 연장 가능성' })],
    [],
  )
  const a = await analyzeDiscovery(c.keyword, live, async (k) => volume(k), dates)
  const before = evaluatePublication(c, a)
  expect(before.coverage).toBe(85)
  expect(before.score).toBeNull()
  expect(before.officialRequired).toBe(true)
  a.review = { reviewman: 'fit', note: '경제 분야의 공식 안내 콘텐츠와 연결 가능', official: null }
  expect(evaluatePublication(c, a).coverage).toBe(100)
  expect(evaluatePublication(c, a).status).toBe('추가 조사 필요')
  a.review.official = {
    url: 'https://example.com/official',
    note: '테스트에서 사용자가 공식 원문 조건을 대조했다는 모의 기록',
    checkedAt: '2026-10-21T12:00:00Z',
  }
  const done = evaluatePublication(c, a)
  expect(done.score).toBe(done.components.reduce((n, s) => n + (s.value! * s.weight) / 100, 0))
  expect(done.missing).toEqual([])
  expect(['발행 검토 추천', '롱테일 전환 검토']).toContain(done.status)
  a.review.official.url = 'https://user:password@example.com/official'
  expect(evaluatePublication(c, a).officialChecked).toBe(false)
  expect(evaluatePublication(c, a).status).toBe('추가 조사 필요')
  expect(evaluatePublication({ ...c, mode: 'DEMO' }, a).status).toContain('DEMO')
})
it('transient request cache deduplicates concurrency, expires, and never retries rejected requests', async () => {
  let now = 1000
  const source = vi.fn(async (k: string) => {
    if (k === 'fail') throw Error('429')
    return { cached: false, value: k }
  })
  const query = cachedQuery(
    source,
    (s) => s,
    () => now,
  )
  await Promise.all([query('a'), query('a')])
  expect(source).toHaveBeenCalledTimes(1)
  expect((await query('a')).cached).toBe(true)
  now += 300001
  await query('a')
  expect(source).toHaveBeenCalledTimes(2)
  await expect(query('fail')).rejects.toThrow('429')
  expect(source).toHaveBeenCalledTimes(3)
})
it('updated analysis keeps prior snapshots and round-trips title, evidence and explicit official sources in backup', async () => {
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
    target = memory(),
    store = createCandidateStore(source)
  const [c] = groupDiscovery([await live({ api: 'kin', query: '대출 연장 가능성' })], [])
  const a = await analyzeDiscovery('대출', live, async (k) => volume(k), dates)
  const id = store.saveAnalysis(
    discoveryToCandidate(c, a),
    { topic: c.title, reviewmanTopics: [] },
    null,
  )
  a.review = {
    reviewman: 'fit',
    note: '공식 금융 안내 연결',
    official: {
      url: 'https://example.com/official',
      note: '사용자가 공식 조건과 기준일을 확인한 테스트 기록',
      checkedAt: '2026-10-21T12:00:00Z',
    },
  }
  expect(
    store.saveAnalysis(discoveryToCandidate(c, a), { topic: c.title, reviewmanTopics: [] }, null),
  ).toBe(id)
  expect(store.list()[0].analysisHistory).toHaveLength(1)
  const backup = await exportWorkspace(source)
  await restoreWorkspace(
    target,
    await parseBackup(JSON.stringify(backup)),
    JSON.stringify(rawSnapshot(target)),
  )
  expect(createCandidateStore(target).list()).toEqual(store.list())
  const saved = store.list()[0].candidate
  expect(saved.keyword).toBe('대출')
  expect(saved.discovery?.title).toBe(c.title)
  expect(saved.discovery?.sources[0].kind).toBe('official')
  expect(saved.reasons.join()).toContain('미확인:')
  const bad = structuredClone(backup)
  bad.candidates[0].analysisHistory![0].candidate.discovery!.sources = [
    { ...saved.discovery!.sources[0], url: 'javascript:alert(1)' },
  ]
  await expect(parseBackup(JSON.stringify(bad))).rejects.toThrow()
})
