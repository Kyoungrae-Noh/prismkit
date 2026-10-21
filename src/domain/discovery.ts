import { analyzeCandidates, classifyIntent, normalizeKeyword, type Candidate } from './candidates'
import type { Idea } from './models'
import type { HubRequest, HubResult, HubSeries } from '../providers/hub-types'
import type { SearchAdResponse, SearchAdRow } from '../providers/searchad-types'
export interface DiscoveryCandidate {
  key: string
  title: string
  keyword: string
  mode: 'LIVE' | 'DEMO'
  sources: { api: string; url: string; date: string | null; collectedAt: string }[]
  occurrences: number
  duplicate: boolean
  intent: string
  reasons: string[]
}
export interface DiscoveryAnalysis {
  results: HubResult[]
  volume: SearchAdRow | null
  volumeAt: string | null
  related: string[]
  errors: string[]
}
export type HubQuery = (r: HubRequest) => Promise<HubResult>
export function discoverySeeds(
  interests: string[],
  ideas: Pick<Idea, 'keyword' | 'title' | 'category'>[],
  keywords: string[],
) {
  const clean = (s: string) => s.trim().slice(0, 60)
  const selected = interests.map(clean).filter(Boolean)
  const relevant = ideas.filter((i) =>
    selected.some((s) => `${i.title} ${i.keyword} ${i.category}`.includes(s)),
  )
  const ordered = [
    ...relevant.map((i) => i.keyword),
    ...selected,
    ...(selected.length ? [] : [...ideas.map((i) => i.keyword), ...keywords]),
  ]
  const seen = new Set<string>()
  return ordered
    .map(clean)
    .filter((s) => {
      const k = normalizeKeyword(s)
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, 2)
}
function plain(s: string) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}
export function discoveryKeyword(title: string) {
  return plain(title)
    .replace(/^\[[^\]]{1,20}\]\s*/, '')
    .replace(/[?？!！]+/g, '')
    .replace(/(궁금합니다|알려주세요|어떻게 하나요|할 수 있나요)[.\s]*$/g, '방법')
    .replace(/방법(?:\s+방법)+/g, '방법')
    .trim()
    .slice(0, 60)
}
function tokens(s: string) {
  return new Set(discoveryKeyword(s).split(/\s+/).map(normalizeKeyword).filter(Boolean))
}
function similar(a: string, b: string) {
  if (normalizeKeyword(a) === normalizeKeyword(b)) return true
  const x = tokens(a),
    y = tokens(b),
    common = [...x].filter((t) => y.has(t)).length
  return x.size >= 3 && y.size >= 3 && common / new Set([...x, ...y]).size >= 0.75
}
export function groupDiscovery(results: HubResult[], existing: string[]): DiscoveryCandidate[] {
  const groups: DiscoveryCandidate[] = []
  for (const r of results) {
    // Shopping series names are requested category/keyword hypotheses, never newly discovered popular terms.
    const titles =
      r.api === 'shopping'
        ? r.series.map((s) => ({ title: `${s.title} 비교`, url: '', date: null }))
        : r.items
    for (const item of titles) {
      const keyword = discoveryKeyword(item.title)
      if (!keyword) continue
      const found = groups.find((g) => g.mode === r.mode && similar(g.keyword, keyword))
      const source = { api: r.api, url: item.url, date: item.date, collectedAt: r.collectedAt }
      if (found) {
        if (!found.sources.some((s) => s.api === source.api && s.url === source.url)) {
          found.occurrences++
          found.sources.push(source)
        }
        continue
      }
      const intent = classifyIntent(keyword)
      groups.push({
        key: `${r.mode}:${normalizeKeyword(keyword)}`,
        title: plain(item.title).slice(0, 120),
        keyword,
        mode: r.mode,
        sources: [source],
        occurrences: 1,
        duplicate: existing.some((s) => similar(s, keyword)),
        intent: intent.intent,
        reasons: [
          r.mode === 'DEMO' ? '모의 자료 — 실제 발행 판단 불가' : '측정: API에서 제공한 결과',
          '규칙 추론: 제목 표현으로 검색 의도·유사 주제 분류',
          ...(r.api === 'shopping'
            ? ['사용자 지정 분야 기반 비교 주제 제안; 인기 상품 신규 발견·판매량 아님']
            : []),
          '공식 사실·원문 내용 미확인',
        ],
      })
    }
  }
  return groups
}
export function trendDirection(series?: HubSeries) {
  const points = series?.points ?? []
  // Compare equal adjacent seven-day windows only when daily coverage is complete.
  if (points.length < 14) return '추이 판단 보류: 연속 14일 자료 필요'
  const last = points.slice(-14)
  if (last.some((p, i) => i > 0 && Date.parse(p.date) - Date.parse(last[i - 1].date) !== 86400000))
    return '추이 판단 보류: 기간 누락'
  const mean = (xs: typeof points) => xs.reduce((sum, p) => sum + p.ratio, 0) / xs.length
  const before = mean(last.slice(0, 7)),
    after = mean(last.slice(7))
  if (before === 0) return after === 0 ? '상대 관심도 변화 없음' : '기준 기간 0: 변화율 산정 불가'
  const change = (after / before - 1) * 100
  return `최근 7일 상대 관심도 ${change >= 0 ? '+' : ''}${change.toFixed(1)}% (직전 7일 대비; 실제 검색량 아님)`
}
export async function collectDiscovery(
  seeds: string[],
  query: HubQuery,
  period: Pick<HubRequest, 'startDate' | 'endDate'>,
  category = '',
) {
  const results: HubResult[] = [],
    errors: string[] = []
  for (const seed of seeds.slice(0, 2))
    for (const api of ['kin', 'news'] as const) {
      try {
        results.push(await query({ api, query: seed, sort: 'date' }))
      } catch (e) {
        errors.push(`${api}: ${(e as Error).message}`)
      }
    }
  if (category && seeds[0])
    try {
      results.push(
        await query({
          api: 'shopping',
          query: seeds[0],
          category,
          shoppingScope: 'category',
          ...period,
        }),
      )
    } catch (e) {
      errors.push(`shopping: ${(e as Error).message}`)
    }
  return { results, errors }
}
export async function analyzeDiscovery(
  keyword: string,
  query: HubQuery,
  searchad: (keyword: string) => Promise<SearchAdResponse>,
  period: Pick<HubRequest, 'startDate' | 'endDate' | 'device'>,
  category = '',
): Promise<DiscoveryAnalysis> {
  const result: DiscoveryAnalysis = {
    results: [],
    volume: null,
    volumeAt: null,
    related: [],
    errors: [],
  }
  try {
    const response = await searchad(keyword)
    result.volume =
      response.rows.find((r) => normalizeKeyword(r.keyword) === normalizeKeyword(keyword)) ?? null
    result.volumeAt = response.volume.collectedAt
    result.related = response.rows
      .filter((r) => normalizeKeyword(r.keyword) !== normalizeKeyword(keyword))
      .slice(0, 10)
      .map((r) => r.keyword)
    if (!result.volume) result.errors.push('검색광고 응답에 선택 키워드의 정확한 검색량 없음')
  } catch (e) {
    result.errors.push(`검색량: ${(e as Error).message}`)
  }
  for (const api of [
    'blog',
    'cafe',
    'trend',
    ...(category ? ['shopping' as const] : []),
  ] as const) {
    try {
      result.results.push(
        await query({
          api,
          query: keyword,
          ...period,
          ...(api === 'shopping' ? { category } : {}),
        }),
      )
    } catch (e) {
      result.errors.push(`${api}: ${(e as Error).message}`)
    }
  }
  return result
}
export function discoveryRecommendation(c: DiscoveryCandidate, a?: DiscoveryAnalysis) {
  const blog = a?.results.find((r) => r.api === 'blog' && r.mode === c.mode)?.total
  const cafe = a?.results.find((r) => r.api === 'cafe' && r.mode === c.mode)?.total
  const missing = [
    '상위 콘텐츠 품질·차별화',
    '계정별 적합성',
    'Reviewman 내부 연결',
    '공식 사실 근거',
  ]
  if (typeof a?.volume?.total !== 'number') missing.push('실제 검색량')
  if (typeof blog !== 'number' || typeof cafe !== 'number') missing.push('블로그·카페 API 결과 수')
  if (!a?.results.some((r) => r.api === 'trend' && r.series.some((s) => s.points.length >= 14)))
    missing.push('검색 추이')
  let status = '추가 조사 필요'
  if (c.mode === 'DEMO') status = 'DEMO — 발행 판단 보류'
  else if (c.duplicate) status = '발행 보류 — 기존 주제 중복 검토'
  else if (
    typeof a?.volume?.total === 'number' &&
    typeof blog === 'number' &&
    typeof cafe === 'number'
  )
    status = a.volume.total >= 3000 && blog <= 1000 ? '발행 검토 추천' : '롱테일 전환 검토'
  return {
    status,
    missing,
    reasons: [
      ...c.reasons,
      `이번 수집 내 유사 질문·기사 ${c.occurrences}건; 전체 반복 빈도 아님`,
      `API 결과 수: 블로그 ${blog ?? '미확인'} / 카페 ${cafe ?? '미확인'}; 통합검색 전체 문서 수·노출 순위 아님`,
      `규칙 추론: ${c.intent}; 광고·제휴 ${/구매|비교/.test(c.intent) ? '관련성 검토 가능, 실제 상품·조건 확인 필요' : '적합성 미확인'}`,
      trendDirection(a?.results.find((r) => r.api === 'trend')?.series[0]),
      '검색량이 낮아도 보존; 상위 노출·수익 보장 없음',
    ],
  }
}
export function discoveryToCandidate(c: DiscoveryCandidate, a?: DiscoveryAnalysis): Candidate {
  const recommendation = discoveryRecommendation(c, a)
  const candidate = analyzeCandidates(
    [
      {
        keyword: c.keyword,
        pc: a?.volume?.pc ?? null,
        mobile: a?.volume?.mobile ?? null,
        total: a?.volume?.total ?? null,
        mode: c.mode,
        source: 'NAVER API HUB 발굴',
        collectedAt: a?.volumeAt ?? null,
      },
    ],
    { topic: c.keyword, reviewmanTopics: [] },
  )[0]
  return {
    ...candidate,
    status: '추가 검증 필요',
    reasons: [
      recommendation.status,
      ...recommendation.reasons,
      `미확인: ${recommendation.missing.join(', ')}`,
      ...c.sources.map(
        (s) =>
          `발굴 출처 ${s.api}: ${s.url || '분야 비교 주제 제안'}; 제공 날짜 ${s.date ?? '미제공'}; 조회 ${s.collectedAt}`,
      ),
      ...(a?.results ?? []).map(
        (r) =>
          `상세 분석 ${r.api} (${r.mode}): ${r.query}; 조회 ${r.collectedAt}; ${r.startDate ?? '기간 제한 없음'}~${r.endDate ?? ''}; 기기 ${r.device}; ${r.unit}`,
      ),
      ...(a?.related.length ? [`검색광고 관련 키워드: ${a.related.join(', ')}`] : []),
    ],
  }
}

export function prioritizeDiscovery(
  rows: DiscoveryCandidate[],
  analyses: Record<string, DiscoveryAnalysis>,
) {
  function priority(c: DiscoveryCandidate) {
    const status = discoveryRecommendation(c, analyses[c.key]).status
    if (status === '발행 검토 추천') return 0
    if (status === '롱테일 전환 검토') return 1
    if (status === '추가 조사 필요') return 2
    return 3
  }
  return [...rows].sort(
    (a, b) =>
      priority(a) - priority(b) ||
      Number(a.duplicate) - Number(b.duplicate) ||
      b.occurrences - a.occurrences,
  )
}
