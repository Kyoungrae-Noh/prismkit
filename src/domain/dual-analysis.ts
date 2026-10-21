import { analysisKeyword, plainText } from './integrated-analysis'
import { normalizeKeyword } from './candidates'
import {
  discoveryKeyword,
  discoveryRecommendation,
  type DiscoveryAnalysis,
  type DiscoveryCandidate,
} from './discovery'

export function dualKeywords(title: string) {
  const main = analysisKeyword(title)
  const detail =
    discoveryKeyword(plainText(title))
      .normalize('NFKC')
      .replace(/\s+(?:가능성|가능 여부|가능한가요|알려주세요|궁금합니다)[.\s]*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || main
  return { main, detail, method: '원본 제목 기반 규칙 추론 · AI 생성 아님' }
}
export const metricKey = (mode: string, keyword: string) => `${mode}:${normalizeKeyword(keyword)}`
export type Metrics = Record<string, DiscoveryAnalysis>
export const metricFor = (c: DiscoveryCandidate, keyword: string, metrics: Metrics) =>
  metrics[metricKey(c.mode, keyword)]
export function uniqueKeywords(rows: DiscoveryCandidate[]) {
  const entries = new Map<string, { mode: 'LIVE' | 'DEMO'; keyword: string }>()
  for (const c of rows)
    for (const keyword of Object.values(dualKeywords(c.title)).slice(0, 2))
      entries.set(metricKey(c.mode, keyword), { mode: c.mode, keyword })
  return [...entries.values()]
}
export function quickPlan(rows: DiscoveryCandidate[], metrics: Metrics) {
  const words = uniqueKeywords(rows)
  const missing = (mode: string, keyword: string, api: 'searchad' | 'blog') => {
    const s = metrics[metricKey(mode, keyword)]?.states?.[api]
    return !s || s.state === '미조회'
  }
  return {
    words,
    searchad: words.filter((w) => w.mode === 'LIVE' && missing(w.mode, w.keyword, 'searchad'))
      .length,
    blog: words.filter((w) => w.mode === 'LIVE' && missing(w.mode, w.keyword, 'blog')).length,
  }
}
export function measured(a: DiscoveryAnalysis | undefined, api: 'searchad' | 'blog') {
  if (!a || a.states?.[api]?.state === '조회 실패' || a.states?.[api]?.state === '미조회')
    return null
  const value =
    api === 'searchad' ? a.volume?.total : a.results.find((r) => r.api === 'blog')?.total
  return typeof value === 'number' ? value : null
}
export function demandRatio(a?: DiscoveryAnalysis) {
  const demand = measured(a, 'searchad'),
    blog = measured(a, 'blog')
  return demand !== null && blog !== null && blog > 0 ? demand / blog : null
}
export const dualSorts = {
  recommendation: '종합 추천순',
  volume: '세부 키워드 검색량순',
  blog: '블로그 결과 수 적은 순',
  ratio: '검색 수요 대비 경쟁 결과 수',
  newest: '최신 발굴순',
} as const
export type DualSort = keyof typeof dualSorts
export function sortDiscovery(
  rows: DiscoveryCandidate[],
  metrics: Metrics,
  analyses: Record<string, DiscoveryAnalysis>,
  sort: DualSort,
) {
  const data = (c: DiscoveryCandidate) => metricFor(c, dualKeywords(c.title).detail, metrics)
  const rec = (c: DiscoveryCandidate) =>
    discoveryRecommendation(
      c,
      analyses[c.key] ?? data(c),
      metricFor(c, dualKeywords(c.title).main, metrics),
    )
  const compare = (a: number | null, b: number | null, asc = false) =>
    a === null ? (b === null ? 0 : 1) : b === null ? -1 : asc ? a - b : b - a
  return [...rows].sort((a, b) => {
    if (sort === 'volume')
      return compare(measured(data(a), 'searchad'), measured(data(b), 'searchad'))
    if (sort === 'blog') return compare(measured(data(a), 'blog'), measured(data(b), 'blog'), true)
    if (sort === 'ratio') return compare(demandRatio(data(a)), demandRatio(data(b)))
    if (sort === 'newest')
      return (
        Math.max(...b.sources.map((s) => Date.parse(s.collectedAt)), 0) -
        Math.max(...a.sources.map((s) => Date.parse(s.collectedAt)), 0)
      )
    const x = rec(a),
      y = rec(b)
    return (
      Number(a.duplicate) - Number(b.duplicate) ||
      Number(y.status === '발행 검토 추천') - Number(x.status === '발행 검토 추천') ||
      y.coverage - x.coverage ||
      y.points - x.points
    )
  })
}
