import {
  evaluatePublication,
  trendAssessment,
  type AnalysisApi,
  type ApiAssessment,
  type EditorialReview,
} from './integrated-analysis'
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
  keyword?: string
  states?: Partial<Record<AnalysisApi, ApiAssessment>>
  review?: EditorialReview
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
  options: { previous?: DiscoveryAnalysis; onProgress?: (value: DiscoveryAnalysis) => void } = {},
): Promise<DiscoveryAnalysis> {
  const previous = options.previous?.keyword === keyword ? options.previous : undefined
  const result: DiscoveryAnalysis = {
    keyword,
    results:
      previous?.results.filter(
        (r) =>
          r.query === keyword &&
          (!['trend', 'shopping'].includes(r.api) ||
            (r.startDate === period.startDate &&
              r.endDate === period.endDate &&
              r.device === (period.device ?? 'all'))),
      ) ?? [],
    volume: previous?.volume ?? null,
    volumeAt: previous?.volumeAt ?? null,
    related: previous?.related ?? [],
    errors: [],
    review: previous?.review,
    states: Object.fromEntries(
      ['searchad', 'blog', 'cafe', 'trend', ...(category ? ['shopping'] : [])].map((api) => [
        api,
        { state: '미조회', at: null, message: '조회 대기' },
      ]),
    ),
  }
  const report = () => options.onProgress?.(structuredClone(result))
  report()
  const volume = async () => {
    try {
      const response = await searchad(keyword)
      result.volume =
        response.rows.find((r) => normalizeKeyword(r.keyword) === normalizeKeyword(keyword)) ?? null
      result.volumeAt = response.volume.collectedAt
      result.related = response.rows
        .filter((r) => normalizeKeyword(r.keyword) !== normalizeKeyword(keyword))
        .slice(0, 10)
        .map((r) => r.keyword)
      const missing = !result.volume
        ? '응답에 핵심 키워드의 정확한 검색량 없음; 연관어 검색량을 대신 쓰지 않습니다.'
        : typeof result.volume.total !== 'number'
          ? 'PC/모바일 중 미제공 또는 <10 값이 있어 정확한 합계 산정 불가'
          : ''
      result.states!.searchad = {
        state: missing ? '자료 부족' : response.cached ? '캐시' : 'LIVE 확인',
        cached: response.cached,
        at: result.volumeAt,
        message: missing || '최근 30일 PC+모바일 검색량',
      }
      if (missing) result.errors.push(`검색량: ${missing}`)
    } catch (e) {
      const message = (e as Error).message
      result.errors.push(`검색량: ${message}`)
      result.states!.searchad = {
        state: '조회 실패',
        at: result.volumeAt,
        message,
        retained: !!result.volume,
      }
    }
    report()
  }
  const hub = async (api: 'blog' | 'cafe' | 'trend' | 'shopping') => {
    try {
      const r = await query({
        api,
        query: keyword,
        ...period,
        ...(api === 'shopping' ? { category } : {}),
      })
      result.results = [...result.results.filter((old) => old.api !== api), r]
      const t = api === 'trend' ? trendAssessment(r.series[0], r.endDate) : null
      const missing =
        t && !t.comparable
          ? t.message
          : api === 'shopping' && !r.series.some((s) => s.points.length)
            ? '기간 내 지표 없음'
            : ''
      result.states![api] = {
        state: missing ? '자료 부족' : r.cached ? '캐시' : 'LIVE 확인',
        cached: r.cached,
        at: r.collectedAt,
        message:
          missing ||
          (r.unit === 'api-results'
            ? '해당 API 결과 수·상위 표본'
            : '상대 관심도; 실제 검색량 아님'),
      }
    } catch (e) {
      const message = (e as Error).message,
        old = result.results.find((r) => r.api === api)
      result.errors.push(`${api}: ${message}`)
      result.states![api] = {
        state: '조회 실패',
        at: old?.collectedAt ?? null,
        message,
        retained: !!old,
      }
    }
    report()
  }
  await Promise.allSettled([
    volume(),
    ...(['blog', 'cafe', 'trend', ...(category ? ['shopping'] : [])] as const).map((api) =>
      hub(api as 'blog' | 'cafe' | 'trend' | 'shopping'),
    ),
  ])
  result.results.sort(
    (a, b) =>
      ['blog', 'cafe', 'trend', 'shopping'].indexOf(a.api) -
      ['blog', 'cafe', 'trend', 'shopping'].indexOf(b.api),
  )
  return result
}
export function discoveryRecommendation(c: DiscoveryCandidate, a?: DiscoveryAnalysis) {
  const evaluation = evaluatePublication(c, a)
  const blog = a?.results.find((r) => r.api === 'blog' && r.mode === c.mode)?.total
  const cafe = a?.results.find((r) => r.api === 'cafe' && r.mode === c.mode)?.total
  return {
    ...evaluation,
    reasons: [
      ...c.reasons,
      `원본 제목: ${c.title}; 분석 키워드: ${a?.keyword ?? c.keyword}`,
      `이번 수집 내 유사 질문·기사 ${c.occurrences}건; 전체 반복 빈도 아님`,
      `API 결과 수: 블로그 ${blog ?? '미확인'} / 카페 ${cafe ?? '미확인'}; 통합검색 전체 문서 수·노출 순위 아님`,
      `검색 의도 (규칙 추론): ${evaluation.intent}`,
      `검색 추이: ${evaluation.trend.message}; 비교 기간 ${evaluation.trend.start ?? '미확인'}~${evaluation.trend.end ?? '미확인'}; 상대 지표이며 실제 검색량 아님`,
      `초기 실험 평가 v1: ${evaluation.score ?? '종합 점수 보류'}; 확인 가중치 ${evaluation.coverage}%; 확인 항목 기여 ${evaluation.points}점; 결측값을 0으로 대체하거나 가중치를 재배분하지 않음`,
      ...evaluation.components.map(
        (s) =>
          `${s.label} ${s.weight}%: ${s.value ?? '미확인'}; 출처 ${s.source}; ${s.explanation}`,
      ),
      'API 제목·요약만 분석; 본문 내용·실제 순위·상위 노출·수익 보장 없음',
    ],
  }
}
export function discoveryToCandidate(c: DiscoveryCandidate, a?: DiscoveryAnalysis): Candidate {
  const recommendation = discoveryRecommendation(c, a)
  const candidate = analyzeCandidates(
    [
      {
        keyword: a?.keyword ?? c.keyword,
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
    discovery: {
      title: c.title,
      intent: recommendation.intent,
      sources:
        a?.review?.official && recommendation.officialChecked
          ? [
              {
                id: 'discovery-official',
                title: '사용자가 확인한 공식 원문',
                url: a.review.official.url,
                excerpt: a.review.official.note,
                checkedDate: a.review.official.checkedAt.slice(0, 10),
                kind: 'official',
              },
            ]
          : [],
    },
    status: '추가 검증 필요',
    intent: classifyIntent(c.title).intent,
    reasons: [
      recommendation.status,
      ...recommendation.reasons.slice(0, 8),
      `미확인: ${recommendation.missing.join(', ')}`,
      ...(a?.review?.official
        ? [
            `사용자 공식 사실 확인: ${a.review.official.url}; ${a.review.official.note}; 확인 ${a.review.official.checkedAt}`,
          ]
        : []),
      ...(a?.review?.note
        ? [`Reviewman 적합성 사용자 확인: ${a.review.reviewman}; ${a.review.note}`]
        : []),
      ...Object.entries(a?.states ?? {}).map(
        ([api, s]) =>
          `조회 상태 ${api}: ${s.state}; ${s.at ?? '미조회'}; ${s.message}; 이전 자료 보존 ${!!s.retained}`,
      ),
      ...recommendation.competition.outline.map((s) => `차별화 구성 후보 (로컬 추론): ${s}`),
      ...c.sources
        .slice(0, 5)
        .map(
          (s) =>
            `발굴 출처 ${s.api}: ${s.url || '분야 비교 주제 제안'}; 제공 날짜 ${s.date ?? '미제공'}; 조회 ${s.collectedAt}`,
        ),
      ...(a?.results ?? []).map(
        (r) =>
          `상세 분석 ${r.api} (${r.mode}): ${r.query}; 조회 ${r.collectedAt}; ${r.startDate ?? '기간 제한 없음'}~${r.endDate ?? ''}; 기기 ${r.device}; ${r.unit}`,
      ),
      ...(a?.results ?? []).flatMap((r) =>
        r.items
          .slice(0, 3)
          .map(
            (i) =>
              `상위 API 출처 ${r.api}: ${i.title}; ${i.url}; 제공일 ${i.date ?? '미제공'}; 조회 ${r.collectedAt}`,
          ),
      ),
      ...(a?.related.length ? [`검색광고 관련 키워드: ${a.related.join(', ')}`] : []),
      ...recommendation.reasons.slice(8),
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
