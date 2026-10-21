import { expect, it, vi } from 'vitest'
import { dualKeywords, metricKey, quickPlan, sortDiscovery, demandRatio } from './dual-analysis'
import {
  analyzeDiscovery,
  collectDiscovery,
  discoveryToCandidate,
  groupDiscovery,
} from './discovery'
import { demoHub } from '../providers/hub-client'
import { cachedQuery } from '../providers/analysis-client'
import { analysisSession } from '../providers/analysis-session'
import {
  createDiscoveryStore,
  emptyDiscovery,
  validateDiscovery,
  DISCOVERY_KEY,
} from '../data/discovery-store'
import { createCandidateStore } from '../data/candidate-store'
import { exportWorkspace, parseBackup, restoreWorkspace, rawSnapshot } from '../data/backup'
import type { SearchAdResponse } from '../providers/searchad-types'
import type { HubRequest, HubStatus, HubResult } from '../providers/hub-types'
import type { Usage } from '../../server/searchad/budget'
const period = { startDate: '2026-10-01', endDate: '2026-10-20' }
const live = async (r: HubRequest): Promise<HubResult> => ({
  ...(await demoHub(r)),
  mode: 'LIVE' as const,
})
const volume = (keyword: string, total: number | null = 1200): SearchAdResponse => {
  const meta = {
    source: { id: 'searchad', label: 'mock', mode: 'API' as const },
    verification: 'VERIFIED' as const,
    collectedAt: '2026-10-21T00:00:00Z',
    checkedDate: null,
    error: null,
    missing: [],
  }
  return {
    cached: false,
    rows: [{ keyword, pc: total === null ? '<10' : total, mobile: 0, total }],
    volume: { ...meta, data: { pc: total, mobile: 0, total, period: 'recent-30-days' } },
    expansion: { ...meta, data: { keywords: [], kind: 'searchad-related' } },
  }
}
const memory = () => {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v)
    },
  }
}
const usage = (): Usage => ({
  used: 0,
  remaining: 30,
  limit: 30,
  day: '2026-10-21',
  resetsAt: '2026-10-22T00:00:00Z',
  lastQueryAt: null,
  blocked: false,
  migration: false,
})
const status = (): HubStatus => ({
  configured: true,
  limits: { daily: 30, monthly: 300, intervalMs: 1000, cacheSeconds: 300 },
  apis: ['blog', 'cafe', 'kin', 'news', 'trend', 'shopping'].map((api) => ({
    api: api as HubRequest['api'],
    enabled: true,
    reason: 'mock',
    dailyUsed: 0,
    monthlyUsed: 0,
    blocked: false,
  })),
})
it('preserves longtail intent, brands and original title without invented AI terms', () => {
  expect(dualKeywords('카카오뱅크 비상금대출 연장 가능성')).toMatchObject({
    main: '카카오뱅크 비상금대출',
    detail: '카카오뱅크 비상금대출 연장',
  })
  expect(dualKeywords('[질문] 청년월세지원 신청 방법?')).toMatchObject({
    main: '청년월세지원',
    detail: '청년월세지원 신청 방법',
  })
  expect(dualKeywords('카카오뱅크 비상금대출 해지 방법').detail).toContain('해지')
  expect(dualKeywords('C++ 2026 사용 방법').detail).toBe('C++ 2026 사용 방법')
})
it('selected candidates deduplicate shared main keywords and merge discovery sources', async () => {
  const kin = await live({ api: 'kin', query: '카카오뱅크 비상금대출' })
  kin.items[0].title = '카카오뱅크 비상금대출 연장 가능성'
  kin.items[1].title = '카카오뱅크 비상금대출 해지 방법'
  const rows = groupDiscovery([kin, { ...kin, api: 'news' }], [])
  expect(rows).toHaveLength(2)
  expect(rows[0].sources).toHaveLength(2)
  expect(quickPlan(rows, {}).words).toHaveLength(3)
  expect(quickPlan([rows[0]], {})).toMatchObject({ searchad: 2, blog: 2 })
  expect(quickPlan([], {}).words).toEqual([])
})
it('saved quick data supplies only its exact keyword and detailed analysis fetches only missing APIs', async () => {
  const quick = await analyzeDiscovery(
    '비상금대출 연장',
    live,
    async (k) => volume(k, 123),
    period,
    '',
    { apis: ['blog'] },
  )
  const query = vi.fn(live),
    search = vi.fn(async (k) => volume(k, 9999))
  const detail = await analyzeDiscovery('비상금대출 연장', query, search, period, '', {
    previous: quick,
    reuse: true,
  })
  expect(search).not.toHaveBeenCalled()
  expect(query.mock.calls.map(([r]) => r.api)).toEqual(['cafe', 'trend'])
  expect(detail.volume?.total).toBe(123)
  expect(detail.states?.searchad?.state).toBe('캐시')
  const missing = await analyzeDiscovery(
    '다른 키워드',
    live,
    async () => volume('메인', 9999),
    period,
    '',
    { apis: ['blog'] },
  )
  expect(missing.volume).toBeNull()
})
it('prior errors are preserved without automatic retry, but explicit reanalysis can retry', async () => {
  const fail = vi.fn(async () => {
    throw Error('429')
  })
  const before = await analyzeDiscovery('여행', live, fail, period, '', { apis: ['blog'] })
  const next = await analyzeDiscovery('여행', live, fail, period, '', {
    previous: before,
    reuse: true,
    apis: ['blog'],
  })
  expect(fail).toHaveBeenCalledTimes(1)
  expect(next.states?.searchad?.state).toBe('조회 실패')
  await analyzeDiscovery('여행', live, fail, period, '', { previous: next, apis: ['blog'] })
  expect(fail).toHaveBeenCalledTimes(2)
})
it('user collection amount changes display without pagination loops or budget increases', async () => {
  const query = vi.fn(live)
  await collectDiscovery(['금융'], query, period, '', 60)
  expect(query).toHaveBeenCalledTimes(2)
  expect(query.mock.calls[0][0].display).toBe(30)
  await expect(collectDiscovery(['금융'], query, period, '', 101)).rejects.toThrow('1~100')
  expect(query).toHaveBeenCalledTimes(2)
})
it('sorts measured detail values, never treating missing or zero denominator as an opportunity', async () => {
  const r = await live({ api: 'kin', query: '여행' })
  r.items[0].title = '여행 준비물'
  r.items[1].title = '여행 예약 방법'
  const rows = groupDiscovery([r], []),
    metrics: Record<string, Awaited<ReturnType<typeof analyzeDiscovery>>> = {}
  for (const [i, c] of rows.entries()) {
    const k = dualKeywords(c.title).detail
    const a = await analyzeDiscovery(
      k,
      live,
      async (key) => volume(key, i ? null : 0),
      period,
      '',
      { apis: ['blog'] },
    )
    metrics[metricKey('LIVE', k)] = a
  }
  expect(sortDiscovery(rows, metrics, {}, 'volume')[0].key).toBe(rows[0].key)
  const a = metrics[metricKey('LIVE', dualKeywords(rows[0].title).detail)]
  expect(demandRatio(a)).toBe(0)
  a.results[0].total = 0
  expect(demandRatio(a)).toBeNull()
})
it('separate API budgets reserve attempts and enforce spacing; cache and measured related rows reuse without more calls', async () => {
  let now = Date.parse('2026-10-21T12:00:00Z')
  const fetchVolume = vi.fn(async (k: string) => ({
    ...volume(k),
    rows: [...volume(k).rows, { keyword: '세부', pc: 2, mobile: 3, total: 5 }],
  }))
  const search = cachedQuery(
      fetchVolume,
      (k) => k,
      () => now,
    ),
    hub = cachedQuery(
      live,
      (r) => JSON.stringify(r),
      () => now,
    )
  const wait = vi.fn(async (ms: number) => {
      now += ms
    }),
    budget = usage()
  budget.remaining = 2
  budget.used = 28
  const notify = vi.fn(),
    session = analysisSession(budget, status(), new AbortController().signal, notify, {
      volume: search,
      hub,
      now: () => now,
      wait,
    })
  await session.volume('메인')
  expect((await session.volume('세부')).rows.find((r) => r.keyword === '세부')?.total).toBe(5)
  await session.volume('다른 메인')
  expect(fetchVolume).toHaveBeenCalledTimes(2)
  expect(wait).toHaveBeenCalledWith(10100, expect.any(AbortSignal))
  await expect(session.volume('예산 초과')).rejects.toThrow('예산 부족')
  expect(fetchVolume).toHaveBeenCalledTimes(2)
  await session.hub({ api: 'blog', query: '메인' })
  expect(session.remaining.hub.blog).toBe(29)
})
it('authentication/429 errors halt a batch and cancellation never starts another request', async () => {
  const now = () => Date.parse('2026-10-21T12:00:00Z'),
    failure = vi.fn(async (k: string): Promise<SearchAdResponse> => {
      throw Error(`${k}: 429`)
    })
  const search = cachedQuery(failure, (k) => k, now),
    hub = cachedQuery(live, (r) => JSON.stringify(r), now),
    abort = new AbortController()
  const s = analysisSession(usage(), status(), abort.signal, () => {}, {
    volume: search,
    hub,
    now,
    wait: async () => {},
  })
  await expect(s.volume('first')).rejects.toThrow('429')
  await expect(s.volume('second')).rejects.toThrow('중단')
  expect(failure).toHaveBeenCalledTimes(1)
  abort.abort()
  await expect(s.hub({ api: 'blog', query: 'cancel' })).rejects.toThrow('중단')
})
it('persistent analyses and dual manuscript metadata round-trip in backups; legacy restore and concurrent edits preserve data', async () => {
  const port = memory(),
    store = createDiscoveryStore(port),
    w = emptyDiscovery()
  const [c] = groupDiscovery([await live({ api: 'kin', query: '비상금대출' })], [])
  w.rows = [c]
  w.settings = {
    custom: '금융',
    interests: [],
    target: '60',
    mode: 'LIVE',
    category: '',
    device: 'all',
    dates: period,
  }
  const keys = dualKeywords(c.title)
  const main = await analyzeDiscovery(keys.main, live, async (k) => volume(k, 9000), period, '', {
    apis: ['blog'],
  })
  const detail = await analyzeDiscovery(keys.detail, live, async (k) => volume(k, 25), period, '', {
    apis: ['blog'],
  })
  w.metrics[metricKey('LIVE', keys.main)] = main
  w.metrics[metricKey('LIVE', keys.detail)] = detail
  w.analyses[c.key] = detail
  store.save(w)
  const candidate = discoveryToCandidate(c, detail, main)
  expect(candidate.keyword).toBe(keys.detail)
  expect(candidate.discovery?.mainKeyword).toBe(keys.main)
  createCandidateStore(port).saveAnalysis(candidate, { topic: c.title, reviewmanTopics: [] }, null)
  const backup = await parseBackup(JSON.stringify(await exportWorkspace(port))),
    target = memory()
  await restoreWorkspace(target, backup, JSON.stringify(rawSnapshot(target)))
  expect(createDiscoveryStore(target).read()).toEqual(w)
  const legacy = { ...backup }
  delete legacy.discovery
  await restoreWorkspace(target, legacy, JSON.stringify(rawSnapshot(target)))
  expect(createDiscoveryStore(target).read()).toEqual(w)
  expect(() => validateDiscovery({ ...w, secret: 'not allowed' })).toThrow()
  const tampered = structuredClone(w)
  tampered.rows[0].sources[0].url = 'javascript:alert(1)'
  expect(() => validateDiscovery(tampered)).toThrow()
  const other = createDiscoveryStore(port)
  other.read()
  store.save({ ...w, rows: [] })
  expect(() => other.save(w)).toThrow('다른 탭')
  expect(port.getItem(DISCOVERY_KEY)).toContain('"rows":[]')
})
