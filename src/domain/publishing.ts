import { normalizeKeyword, classifyIntent } from './candidates'
import type { SavedCandidate } from '../data/candidate-store'
import { today } from './research'
export const accounts = ['nkr09134', 'nkr09135', 'nkr09136'] as const
export type Account = (typeof accounts)[number]
export type Answer = 'unknown' | 'yes' | 'no'
export const qualityLabels = {
  fresh: '상위 게시물이 최신인가',
  intentMatch: '제목이 검색 의도와 맞는가',
  specific: '정보가 구체적인가',
  official: '공식 자료를 활용하는가',
  solves: '실제 문제를 해결하는가',
  intentGap: '검색 의도를 충족하는 콘텐츠가 부족한가',
  officialEdge: '최신 공식 자료로 차별화할 수 있는가',
  longtail: '구체적인 롱테일 질문이 있는가',
  better: '더 명확한 해결 방법을 제공할 수 있는가',
} as const
export type Quality = Record<keyof typeof qualityLabels, Answer>
export interface Evidence {
  id: string
  name: string
  dataUrl: string
  addedAt: string
}
export interface Competitor {
  title: string
  url: string
  date: string
  summary: string
  features: string
}
export interface Competition {
  candidateId: string
  keyword: string
  searchUrl: string
  checkedDate: string
  blog: Answer
  dominant: Answer
  position: 'unknown' | 'top' | 'middle' | 'bottom' | 'absent'
  serp: 'unknown' | 'information' | 'commercial' | 'mixed'
  total: number | null
  reviewmanUrl: string
  posts: Competitor[]
  quality: Quality
  missingInfo: string
  excludeReason: string
  images: Evidence[]
  updatedAt: string
}
export const publicationStates = ['planned', 'drafting', 'published'] as const
export const publicationLabels = {
  planned: '발행 예정',
  drafting: '작성 중',
  published: '발행 완료',
}
export interface Publication {
  id: string
  account: Account
  keyword: string
  topic: string
  title: string
  status: (typeof publicationStates)[number]
  date: string
  blogUrl: string
  reviewmanUrl: string
  ideaId: string | null
}
export interface PublishingData {
  version: 1
  analyses: Competition[]
  publications: Publication[]
  historyChecked: Record<Account, boolean>
}
export function emptyPublishing(): PublishingData {
  return {
    version: 1,
    analyses: [],
    publications: [],
    historyChecked: { nkr09134: false, nkr09135: false, nkr09136: false },
  }
}
export function blankCompetition(candidate: SavedCandidate): Competition {
  return {
    candidateId: candidate.id,
    keyword: candidate.candidate.keyword,
    searchUrl: '',
    checkedDate: '',
    blog: 'unknown',
    dominant: 'unknown',
    position: 'unknown',
    serp: 'unknown',
    total: null,
    reviewmanUrl: '',
    posts: [],
    quality: Object.fromEntries(
      Object.keys(qualityLabels).map((key) => [key, 'unknown']),
    ) as Quality,
    missingInfo: '',
    excludeReason: '',
    images: [],
    updatedAt: new Date().toISOString(),
  }
}
export function naverSearch(keyword: string) {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`
}
function text(value: unknown, max = 2000): asserts value is string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error('텍스트 형식 또는 길이를 확인하세요.')
}
function date(value: unknown, required = false) {
  text(value, 10)
  if (!value && !required) return
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value ||
    value > today()
  )
    throw new Error('날짜는 오늘까지의 유효한 날짜여야 합니다.')
}
export function safeUrl(value: string, hosts?: string[]) {
  text(value, 2000)
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    (hosts && !hosts.includes(url.hostname))
  )
    throw new Error('허용된 HTTPS URL을 입력하세요.')
  return url
}
export function validateSearchUrl(value: string, keyword: string) {
  const url = safeUrl(value, ['search.naver.com', 'm.search.naver.com'])
  if (
    url.pathname !== '/search.naver' ||
    normalizeKeyword(url.searchParams.get('query') ?? '') !== normalizeKeyword(keyword)
  )
    throw new Error('후보 키워드와 같은 네이버 검색 결과 URL을 입력하세요.')
}
export function canonicalPage(value: string) {
  if (!value) return ''
  const url = safeUrl(value)
  url.hash = ''
  for (const key of [...url.searchParams.keys()])
    if (/^utm_/i.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()
  url.hostname = url.hostname.replace(/^www\./, '')
  url.pathname = url.pathname.replace(/\/$/, '') || '/'
  return url.toString()
}
export const IMAGE_MAX = 512 * 1024,
  IMAGE_TOTAL = 1536 * 1024
export function imageBytes(image: Evidence) {
  text(image.id, 100)
  text(image.name, 200)
  text(image.addedAt, 40)
  if (!image.id || !Number.isFinite(Date.parse(image.addedAt)) || typeof image.dataUrl !== 'string')
    throw new Error('이미지 메타데이터 오류입니다.')
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.dataUrl)
  if (!match || match[2].length > Math.ceil(IMAGE_MAX / 3) * 4)
    throw new Error('이미지는 PNG/JPEG/WebP, 파일당 512 KiB 이하여야 합니다.')
  let bytes: string
  try {
    bytes = atob(match[2])
  } catch {
    throw new Error('이미지 인코딩 오류입니다.')
  }
  const valid =
    match[1] === 'png'
      ? bytes.startsWith('\x89PNG\r\n\x1a\n')
      : match[1] === 'jpeg'
        ? bytes.startsWith('\xff\xd8\xff')
        : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP'
  if (!valid || bytes.length > IMAGE_MAX)
    throw new Error('이미지 실제 형식이나 크기가 올바르지 않습니다.')
  return bytes.length
}
export function validateCompetition(value: Competition) {
  text(value.candidateId, 100)
  text(value.keyword, 200)
  if (!value.candidateId || !value.keyword.trim())
    throw new Error('연결 후보와 키워드가 필요합니다.')
  text(value.searchUrl)
  if (value.searchUrl) validateSearchUrl(value.searchUrl, value.keyword)
  date(value.checkedDate)
  for (const answer of [
    value.blog,
    value.dominant,
    ...Object.keys(qualityLabels).map((key) => value.quality?.[key as keyof Quality]),
  ])
    if (!['unknown', 'yes', 'no'].includes(answer)) throw new Error('평가 선택값을 확인하세요.')
  if (
    !['unknown', 'top', 'middle', 'bottom', 'absent'].includes(value.position) ||
    !['unknown', 'information', 'commercial', 'mixed'].includes(value.serp)
  )
    throw new Error('검색 환경 형식을 확인하세요.')
  if (value.total !== null && (!Number.isSafeInteger(value.total) || value.total < 0))
    throw new Error('검색 결과 수는 0 이상의 정수여야 합니다.')
  if (!Array.isArray(value.posts) || value.posts.length > 10)
    throw new Error('경쟁 게시물은 최대 10개입니다.')
  for (const post of value.posts) {
    text(post.title, 300)
    text(post.url)
    if (post.url) safeUrl(post.url)
    date(post.date)
    text(post.summary)
    text(post.features)
  }
  text(value.reviewmanUrl)
  if (value.reviewmanUrl) safeUrl(value.reviewmanUrl, ['reviewman.kr', 'www.reviewman.kr'])
  text(value.missingInfo)
  text(value.excludeReason)
  text(value.updatedAt, 40)
  if (!Number.isFinite(Date.parse(value.updatedAt))) throw new Error('자료 저장 시각 오류입니다.')
  if (
    !Array.isArray(value.images) ||
    value.images.length > 3 ||
    new Set(value.images.map((image) => image.id)).size !== value.images.length
  )
    throw new Error('후보별 이미지는 중복 없이 최대 3장입니다.')
  value.images.forEach(imageBytes)
  return value
}
export function validatePublication(value: Publication) {
  text(value.id, 100)
  text(value.keyword, 200)
  text(value.topic, 200)
  text(value.title, 300)
  if (
    !value.id ||
    !value.keyword.trim() ||
    !value.title.trim() ||
    !accounts.includes(value.account) ||
    !publicationStates.includes(value.status)
  )
    throw new Error('계정·키워드·제목·발행 상태를 확인하세요.')
  date(value.date, value.status === 'published')
  text(value.blogUrl)
  text(value.reviewmanUrl)
  if (value.status === 'published' && !value.blogUrl)
    throw new Error('발행 완료에는 글 URL이 필요합니다.')
  if (value.blogUrl) {
    const url = safeUrl(value.blogUrl, ['blog.naver.com', 'm.blog.naver.com'])
    const parts = url.pathname.split('/').filter(Boolean)
    const owner = url.searchParams.get('blogId') ?? parts[0]
    if (owner !== value.account || !(url.searchParams.get('logNo') || parts[1]))
      throw new Error('선택한 계정의 네이버 블로그 글 URL을 입력하세요.')
  }
  if (value.reviewmanUrl) safeUrl(value.reviewmanUrl, ['reviewman.kr', 'www.reviewman.kr'])
  if (value.ideaId !== null && typeof value.ideaId !== 'string')
    throw new Error('글감 연결 형식을 확인하세요.')
  return value
}
export type CompetitionStatus =
  '진입 검토 가능' | '롱테일 전환 추천' | '경쟁 강함' | '데이터 부족' | '발행 제외'
export function evaluateCompetition(record: Competition | undefined): {
  status: CompetitionStatus
  reasons: string[]
  missing: string[]
} {
  if (!record)
    return {
      status: '데이터 부족',
      reasons: ['수동 경쟁 자료가 없습니다.'],
      missing: ['검색 환경과 경쟁 게시물 확인'],
    }
  if (record.excludeReason.trim())
    return {
      status: '발행 제외',
      reasons: [`사용자 제외 근거: ${record.excludeReason}`],
      missing: [],
    }
  const missing: string[] = []
  if (!record.searchUrl) missing.push('검색 결과 URL')
  if (!record.checkedDate) missing.push('검색 확인 날짜')
  if (record.checkedDate && Date.parse(today()) - Date.parse(record.checkedDate) > 30 * 86400000)
    missing.push('30일이 지난 검색 환경 재확인(실험 기준)')
  if (record.blog === 'unknown') missing.push('블로그 노출 여부')
  if (
    (record.blog === 'yes' && record.position === 'absent') ||
    (record.blog === 'no' && !['absent', 'unknown'].includes(record.position))
  )
    missing.push('블로그 노출 여부와 위치의 모순 확인')
  if (record.dominant === 'unknown') missing.push('공식 기관·대형 매체 점유')
  if (record.position === 'unknown') missing.push('블로그 위치')
  if (record.serp === 'unknown') missing.push('정보형·상업형 구분')
  if (
    !record.posts.some(
      (post) =>
        post.title.trim() && post.url && post.date && post.summary.trim() && post.features.trim(),
    )
  )
    missing.push('제목·URL·발행일·요약·특징을 확인한 경쟁 게시물 1개')
  for (const key of Object.keys(qualityLabels) as (keyof Quality)[])
    if (record.quality[key] === 'unknown') missing.push(qualityLabels[key])
  if (missing.length)
    return {
      status: '데이터 부족',
      reasons: ['캡처나 결과 수만으로 경쟁을 평가하지 않습니다.'],
      missing,
    }
  const q = record.quality
  if (
    record.dominant === 'yes' &&
    q.fresh === 'yes' &&
    q.intentMatch === 'yes' &&
    q.specific === 'yes' &&
    q.solves === 'yes'
  )
    return {
      status: q.longtail === 'yes' ? '롱테일 전환 추천' : '경쟁 강함',
      reasons: [
        '공식·대형 콘텐츠 점유와 최신성·의도 일치·구체성·문제 해결을 사용자가 확인했습니다.',
        ...(q.longtail === 'yes' ? ['더 구체적인 질문으로 범위를 좁힐 여지가 있습니다.'] : []),
      ],
      missing: [],
    }
  if (
    record.blog === 'yes' &&
    q.intentGap === 'yes' &&
    q.officialEdge === 'yes' &&
    q.better === 'yes' &&
    record.missingInfo.trim()
  )
    return {
      status: '진입 검토 가능',
      reasons: [
        '블로그 노출과 의도 충족의 빈틈을 수동 확인했습니다.',
        '최신 공식 자료와 더 명확한 해결 방법으로 차별화 가능하다는 사용자 평가입니다.',
        `보완할 정보: ${record.missingInfo}`,
      ],
      missing: [],
    }
  if (q.longtail === 'yes')
    return {
      status: '롱테일 전환 추천',
      reasons: ['구체적인 질문을 공략할 여지는 있으나 현재 주제의 진입 근거는 충분하지 않습니다.'],
      missing: [],
    }
  return {
    status: '경쟁 강함',
    reasons: [
      '확인한 표본에서 명확한 차별화 근거가 부족합니다. 실제 계정 노출 성과를 예측한 결과는 아닙니다.',
    ],
    missing: [],
  }
}
export function topicOf(keyword: string) {
  return normalizeKeyword(keyword).replace(
    /(사용방법|사용법|환불방법|환불|사용처|신청방법|신청|접수|조회방법|조회|예약|예매|비교|추천|구매|구입)$/,
    '',
  )
}
export function intentFacet(keyword: string) {
  const text = normalizeKeyword(keyword)
  if (/환불|취소/.test(text)) return '환불·취소'
  if (/사용처|가맹점/.test(text)) return '사용처'
  if (/사용방법|사용법/.test(text)) return '사용방법'
  return classifyIntent(keyword).intent
}
export interface DuplicateWarning {
  publicationId: string
  account: Account
  kind: 'exact' | 'normalized' | 'intent' | 'topic' | 'reviewman'
  message: string
  blocking: boolean
}
export function duplicateWarnings(
  keyword: string,
  topic: string,
  reviewmanUrl: string,
  history: Publication[],
): DuplicateWarning[] {
  const result: DuplicateWarning[] = [],
    key = normalizeKeyword(keyword),
    root = normalizeKeyword(topic) || topicOf(keyword),
    facet = intentFacet(keyword)
  for (const post of history) {
    const other = normalizeKeyword(post.keyword),
      sameTopic = root === (normalizeKeyword(post.topic) || topicOf(post.keyword))
    let warning: Omit<DuplicateWarning, 'publicationId' | 'account'> | null = null
    if (post.keyword === keyword)
      warning = { kind: 'exact', message: '동일 키워드 기획/발행 이력', blocking: true }
    else if (key === other)
      warning = { kind: 'normalized', message: '공백·기호 표기만 다른 키워드', blocking: true }
    else if (sameTopic && facet === intentFacet(post.keyword) && facet !== '기타·불명확')
      warning = {
        kind: 'intent',
        message: '같은 주제·유사 의도 추정: 사용자 중복 검토 필요',
        blocking: true,
      }
    else if (sameTopic)
      warning = {
        kind: 'topic',
        message: '같은 주제이나 의도가 다를 수 있어 별도 콘텐츠 검토 가능',
        blocking: false,
      }
    if (warning) result.push({ ...warning, publicationId: post.id, account: post.account })
    if (
      reviewmanUrl &&
      post.reviewmanUrl &&
      canonicalPage(reviewmanUrl) === canonicalPage(post.reviewmanUrl)
    )
      result.push({
        publicationId: post.id,
        account: post.account,
        kind: 'reviewman',
        message: '동일 Reviewman 페이지 연결: 역할 차이 검토',
        blocking: false,
      })
  }
  return result
}
export function accountSuggestion(
  keyword: string,
  topic: string,
  data: PublishingData,
): { account: Account | null; reason: string } {
  if (!accounts.every((account) => data.historyChecked[account]))
    return { account: null, reason: '3개 계정의 이력 확인 완료 여부가 부족합니다.' }
  const root = normalizeKeyword(topic) || topicOf(keyword)
  const ranked = accounts
    .map((account) => ({
      account,
      related: data.publications.filter(
        (post) =>
          post.account === account &&
          post.status === 'published' &&
          (normalizeKeyword(post.topic) || topicOf(post.keyword)) === root &&
          !duplicateWarnings(keyword, topic, '', [post]).some((w) => w.blocking),
      ).length,
      duplicate: duplicateWarnings(
        keyword,
        topic,
        '',
        data.publications.filter((post) => post.account === account),
      ).some((w) => w.blocking),
    }))
    .filter((item) => !item.duplicate && item.related > 0)
    .sort((a, b) => b.related - a.related)
  if (!ranked.length || ranked[1]?.related === ranked[0].related)
    return {
      account: null,
      reason: '주제 이력이 없거나 계정 간 근거가 동률이어서 추천 계정을 확정하지 않습니다.',
    }
  return {
    account: ranked[0].account,
    reason: `확인된 관련 주제 이력 ${ranked[0].related}개, 동일/유사 의도 중복 없음. 방문자·블로그 지수 추정은 사용하지 않았습니다.`,
  }
}
export function publishingDecision(
  candidate: SavedCandidate,
  record: Competition | undefined,
  data: PublishingData,
  reviewmanUrl: string,
) {
  const matchedRecord =
    record?.candidateId === candidate.id &&
    normalizeKeyword(record.keyword) === normalizeKeyword(candidate.candidate.keyword)
      ? record
      : undefined
  const competition = evaluateCompetition(matchedRecord),
    duplicates = duplicateWarnings(
      candidate.candidate.keyword,
      candidate.context.topic,
      reviewmanUrl,
      data.publications,
    ),
    account =
      competition.status === '데이터 부족' || candidate.candidate.mode === 'DEMO'
        ? { account: null, reason: '경쟁 근거 또는 실제 후보 자료가 부족합니다.' }
        : accountSuggestion(candidate.candidate.keyword, candidate.context.topic, data)
  let status = '추가 조사 필요',
    reasons = [...competition.reasons]
  if (competition.status === '발행 제외') {
    status = '발행 제외'
  } else if (competition.status === '데이터 부족') {
    reasons.push(...competition.missing)
  } else if (duplicates.some((w) => w.blocking)) {
    status = '발행 보류'
    reasons.push('세 계정의 동일 키워드·유사 의도 이력을 먼저 검토하세요.')
  } else if (competition.status === '경쟁 강함') {
    status = '발행 보류'
  } else if (competition.status === '롱테일 전환 추천') {
    status = '롱테일로 변경'
  } else if (
    candidate.candidate.mode === 'DEMO' ||
    candidate.candidate.review ||
    candidate.candidate.conflict ||
    candidate.candidate.status === '제외 후보' ||
    !candidate.candidate.related ||
    typeof candidate.candidate.total !== 'number' ||
    candidate.candidate.total === 0 ||
    !reviewmanUrl ||
    !account.account
  ) {
    reasons.push('실제/수동 수요·명확한 의도·Reviewman 연결 페이지·계정 근거를 추가 확인하세요.')
  } else {
    status = '발행 검토 추천'
    reasons.push(
      '수요·수동 경쟁 평가·연결 페이지·계정 주제 근거를 함께 검토할 후보입니다. 수익성이나 노출을 보장하지 않습니다.',
    )
  }
  return { status, reasons, competition, duplicates, account }
}
