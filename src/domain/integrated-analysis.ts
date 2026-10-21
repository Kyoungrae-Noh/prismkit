import { classifyIntent, normalizeKeyword } from './candidates'
import type { DiscoveryAnalysis, DiscoveryCandidate } from './discovery'
import type { HubResult, HubSeries } from '../providers/hub-types'

export type AnalysisApi = 'searchad' | 'blog' | 'cafe' | 'trend' | 'shopping'
export type DataState = 'LIVE 확인' | '캐시' | '자료 부족' | '조회 실패' | '미조회'
export interface ApiAssessment {
  state: DataState
  at: string | null
  message: string
  cached?: boolean
  retained?: boolean
}
export interface EditorialReview {
  reviewman: 'unknown' | 'fit' | 'unfit'
  note: string
  official: { url: string; note: string; checkedAt: string } | null
}
export const emptyReview: EditorialReview = { reviewman: 'unknown', note: '', official: null }
export function plainText(text: string) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}
/** Conservative, visible rule suggestion. Original title and intent are kept separately. */
export function analysisKeyword(title: string) {
  const original = plainText(title)
    .normalize('NFKC')
    .replace(/^\[[^\]]{1,20}\]\s*/, '')
    .replace(/[?!？！]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const core = original
    .replace(/\s+(?:알려주세요|궁금합니다|어떻게 하나요|할 수 있나요)[.\s]*$/, '')
    .replace(
      /\s+(?:(?:연장|신청|가입|예약|이용|사용|구매|수령|해지)\s+)?(?:가능성|가능 여부|가능한가요|방법|하는 법|조건|준비물|후기|비교|추천)[.\s]*$/,
      '',
    )
    .trim()
  return (core.length >= 2 ? core : original).slice(0, 60)
}
export function trendAssessment(series?: HubSeries, endDate?: string | null) {
  const points = [...(series?.points ?? [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-14)
  const unavailable = (message: string) => ({
    comparable: false,
    change: null,
    direction: '판단 보류',
    message,
    start: null,
    end: null,
  })
  if (points.length < 14) return unavailable('연속 14일 자료 필요')
  if (
    points.some(
      (p, i) =>
        !Number.isFinite(p.ratio) ||
        p.ratio < 0 ||
        p.ratio > 100 ||
        (i > 0 && Date.parse(p.date) - Date.parse(points[i - 1].date) !== 86400000),
    )
  )
    return unavailable('비교 기간 누락 또는 유효하지 않은 상대 지표')
  if (endDate && points[13].date !== endDate) return unavailable('요청 종료일까지의 최근 자료 부족')
  const before = points.slice(0, 7).reduce((n, p) => n + p.ratio, 0) / 7
  const after = points.slice(7).reduce((n, p) => n + p.ratio, 0) / 7
  if (!before && after) return unavailable('기준 기간 0: 변화율 산정 불가')
  const change = before ? (after / before - 1) * 100 : 0
  return {
    comparable: true,
    change,
    direction: change > 5 ? '상승' : change < -5 ? '하락' : '유사',
    message: `최근 7일 평균 ${change >= 0 ? '+' : ''}${change.toFixed(1)}% · 직전 7일 대비 상대 관심도`,
    start: points[0].date,
    end: points[13].date,
  }
}
const topics = [
  '대상',
  '조건',
  '기간',
  '신청',
  '연장',
  '금리',
  '한도',
  '수수료',
  '서류',
  '비교',
  '주의',
  '취소',
  '환불',
  '가격',
  '예약',
  '준비물',
]
export function competitionAnalysis(results: HubResult[], keyword: string) {
  const sources = results.filter((r) => ['blog', 'cafe'].includes(r.api))
  const terms = keyword.split(/\s+/).filter(Boolean)
  const posts = sources.flatMap((r) =>
    r.items.map((i) => {
      const title = plainText(i.title),
        summary = plainText(i.description)
      const age = i.date
        ? Math.floor((Date.parse(r.collectedAt) - Date.parse(i.date)) / 86400000)
        : null
      return {
        ...i,
        title,
        description: summary,
        api: r.api,
        collectedAt: r.collectedAt,
        terms: terms.filter((t) => normalizeKeyword(title).includes(normalizeKeyword(t))),
        intent: classifyIntent(title).intent,
        freshness:
          age === null || !Number.isFinite(age) || age < 0
            ? '작성일 미제공/판단 불가'
            : `${age}일 전 게시 (API 제공일 기준)`,
        topics: topics.filter((t) => `${title} ${summary}`.includes(t)),
      }
    }),
  )
  const repeated = topics
    .map((topic) => ({ topic, count: posts.filter((p) => p.topics.includes(topic)).length }))
    .filter((t) => t.count >= 2)
  const absent = posts.length
    ? topics.filter((t) => !posts.some((p) => p.topics.includes(t))).slice(0, 4)
    : []
  const exactTitles = posts.filter((p) =>
    normalizeKeyword(p.title).includes(normalizeKeyword(keyword)),
  ).length
  return {
    posts,
    repeated,
    absent,
    exactTitles,
    outline: [
      '원본 질문과 핵심 답변 범위 정하기',
      ...repeated.slice(0, 3).map((t) => `${t.topic}: API 제목·요약에 반복된 주제 정리`),
      ...absent.slice(0, 2).map((t) => `${t}: 공식 자료 확인 후 보완할 수 있는지 검토`),
      '조건·예외·확인 날짜와 출처 구분',
    ],
  }
}
export const evaluationWeights = {
  demand: 25,
  competition: 25,
  intent: 20,
  trend: 15,
  reviewman: 15,
} as const
export function evaluatePublication(c: DiscoveryCandidate, a?: DiscoveryAnalysis) {
  const keyword = a?.keyword ?? c.keyword
  const live =
    a?.results.filter(
      (r) => r.mode === c.mode && normalizeKeyword(r.query) === normalizeKeyword(keyword),
    ) ?? []
  const competition = competitionAnalysis(live, keyword)
  const trend = live.find((r) => r.api === 'trend')
  const trendInfo = trendAssessment(trend?.series[0], trend?.endDate)
  const review = a?.review ?? emptyReview
  const failed = (api: AnalysisApi) =>
    ['조회 실패', '미조회'].includes(a?.states?.[api]?.state ?? '')
  const volume =
    !failed('searchad') &&
    a?.volume &&
    normalizeKeyword(a.volume.keyword) === normalizeKeyword(keyword)
      ? a.volume.total
      : null
  const intent = classifyIntent(c.title)
  const intentKnown = !intent.review || /연장|가능성|자격|조건|방법/.test(c.title)
  const officialRequired =
    /정책|지원금|지원사업|보조금|복지|급여|연금|금융|은행|대출|비상금|금리|예금|적금|투자|주식|세금|보험|부동산|주택|아파트|청약|전세|월세|임대/.test(
      `${c.title} ${keyword}`,
    )
  let officialUrlValid = false
  try {
    const url = new URL(review.official?.url ?? '')
    officialUrlValid =
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.href.length <= 1000
  } catch {
    /* Missing or invalid confirmation remains unverified. */
  }
  const officialChecked =
    !!review.official &&
    officialUrlValid &&
    review.official.note.trim().length >= 10 &&
    review.official.note.trim().length <= 1000 &&
    Number.isFinite(Date.parse(review.official.checkedAt))
  const components = [
    {
      id: 'demand',
      label: '검색 수요',
      weight: evaluationWeights.demand,
      value:
        typeof volume === 'number'
          ? volume >= 3000
            ? 100
            : volume >= 1000
              ? 75
              : volume >= 100
                ? 50
                : volume > 0
                  ? 25
                  : 0
          : null,
      source: '네이버 검색광고 · 최근 30일 PC+모바일',
      explanation: '0/1/100/1,000/3,000회 구간의 초기 수요 점수',
    },
    {
      id: 'competition',
      label: '경쟁 환경',
      weight: evaluationWeights.competition,
      value:
        !failed('blog') &&
        !failed('cafe') &&
        live.some((r) => r.api === 'blog') &&
        live.some((r) => r.api === 'cafe') &&
        competition.posts.length
          ? Math.round(100 * (1 - competition.exactTitles / competition.posts.length))
          : null,
      source: '블로그·카페 API 제목 표본',
      explanation:
        '100 × (1 − 제목의 핵심 키워드 전체 포함 비율). 차별화 검토 가설이며 실제 경쟁 난이도 아님; total은 점수에 사용하지 않음',
    },
    {
      id: 'intent',
      label: '검색 의도',
      weight: evaluationWeights.intent,
      value: intentKnown ? 100 : null,
      source: '원본 제목의 표현 규칙 · 로컬 추론',
      explanation: intentKnown
        ? intent.intent === '기타·불명확'
          ? '정보 확인형 (질문 표현 기반 가설)'
          : intent.intent
        : '제목만으로 의도를 확정하기 어려움',
    },
    {
      id: 'trend',
      label: '시의성·트렌드',
      weight: evaluationWeights.trend,
      value:
        !failed('trend') && trendInfo.comparable
          ? trendInfo.direction === '상승'
            ? 100
            : trendInfo.direction === '하락'
              ? 25
              : 50
          : null,
      source: '검색어트렌드 · 인접한 7일 평균',
      explanation: '상승/유사/하락 = 100/50/25; ±5%는 유사, 상대 지표이며 미래 예측 아님',
    },
    {
      id: 'reviewman',
      label: 'Reviewman 적합성',
      weight: evaluationWeights.reviewman,
      value:
        review.reviewman !== 'unknown' && review.note.trim()
          ? review.reviewman === 'fit'
            ? 100
            : 0
          : null,
      source: '사용자 확인 · 로컬 입력',
      explanation: '구체적 연결·활용 근거가 입력된 적합/비적합만 반영; 자동 수익 예측 없음',
    },
  ]
  const coverage = components.filter((s) => s.value !== null).reduce((n, s) => n + s.weight, 0)
  const points =
    Math.round(
      components.reduce((n, s) => n + (s.value === null ? 0 : (s.value * s.weight) / 100), 0) * 10,
    ) / 10
  const missing = components
    .filter((s) => s.value === null)
    .map((s) => (s.label === '검색 수요' ? '실제 검색량' : s.label))
  for (const api of ['blog', 'cafe'] as const)
    if (!live.some((r) => r.api === api && typeof r.total === 'number') || failed(api))
      missing.push(`${api === 'blog' ? '블로그' : '카페'} API 결과 수`)
  if (officialRequired && !officialChecked)
    missing.push('공식 사실 확인 필수 (공식 출처·확인 내용 입력)')
  let status = missing.length
    ? '추가 조사 필요'
    : points >= 65
      ? '발행 검토 추천'
      : '롱테일 전환 검토'
  if (c.mode === 'DEMO') status = 'DEMO — 발행 판단 보류'
  else if (c.duplicate) status = '발행 보류 — 기존 주제 중복 검토'
  return {
    status,
    missing,
    components,
    coverage,
    points,
    score: coverage === 100 ? points : null,
    officialRequired,
    officialChecked,
    trend: trendInfo,
    competition,
    intent: components[2].explanation,
  }
}
