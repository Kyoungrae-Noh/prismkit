import { normalizeKeyword, classifyIntent } from './candidates'
import type { SavedCandidate } from '../data/candidate-store'
import type { Idea } from './models'
import { validDocuments, type DocumentEvidence } from './documents'
import { totalVolume, type KeywordResearch } from './research'
import {
  accountSuggestion,
  duplicateWarnings,
  evaluateCompetition,
  accounts,
  type PublishingData,
} from './publishing'
import type { CaptureData, RankingSettings } from './captures'

export const rankingStatuses = [
  '발행 검토 추천',
  '롱테일 전환 추천',
  '경쟁 추가 조사 필요',
  '데이터 부족',
  '발행 보류',
  '발행 제외',
] as const
export type RankingStatus = (typeof rankingStatuses)[number]
export const rankingPresets = {
  opportunity: { label: '수요·경쟁 실험', min: '3000', documentsMax: '1000' },
  low: { label: '저경쟁 실험', min: '', documentsMax: '300' },
  low500: { label: '저경쟁 500개', min: '', documentsMax: '500' },
  demand: { label: '월 3,000회 이상', min: '3000', documentsMax: '' },
  broad: { label: '전체 근거 검토', min: '', documentsMax: '' },
} as const
export const defaultRanking: RankingSettings = {
  min: '',
  documentsMax: '',
  category: 'all',
  sort: 'priority',
}
export function rankCandidates(
  saved: SavedCandidate[],
  ideas: Idea[],
  research: KeywordResearch[],
  publishing: PublishingData,
  captures: CaptureData,
  settings: RankingSettings,
  now = Date.now(),
) {
  if (
    ![settings.min, settings.documentsMax, settings.max ?? '', settings.documentsMin ?? ''].every(
      (v) => v === '' || (/^\d+$/.test(v) && Number.isSafeInteger(Number(v))),
    )
  )
    throw new Error('필터는 0 이상의 정수로 입력하세요.')
  if (
    (settings.min && settings.max && Number(settings.min) > Number(settings.max)) ||
    (settings.documentsMin &&
      settings.documentsMax &&
      Number(settings.documentsMin) > Number(settings.documentsMax))
  )
    throw new Error('최솟값은 최댓값보다 클 수 없습니다.')
  const age = (time: string | null) => (time ? (now - Date.parse(time)) / 86400000 : Infinity)
  const grouped = new Map<string, SavedCandidate[]>()
  for (const item of saved.filter((s) => s.candidate.mode !== 'DEMO')) {
    const k = normalizeKeyword(item.candidate.keyword)
    grouped.set(k, [...(grouped.get(k) ?? []), item])
  }
  const rows = [...grouped.values()]
    .map((group) => {
      // Prefer explicitly sourced LIVE evidence. Keep every original saved record untouched.
      const item = [...group].sort(
        (a, b) =>
          Number(b.candidate.mode === 'LIVE') - Number(a.candidate.mode === 'LIVE') ||
          b.savedAt.localeCompare(a.savedAt),
      )[0]
      const c = item.candidate,
        idea = ideas.find((i) => i.id === item.ideaId)
      const draft = captures.drafts.find(
        (d) => d.ideaId === item.ideaId && d.confirmed && item.ideaId !== null,
      )
      const competition = publishing.analyses.find(
        (a) =>
          a.candidateId === item.id && normalizeKeyword(a.keyword) === normalizeKeyword(c.keyword),
      )
      const assessment = evaluateCompetition(competition),
        intent = classifyIntent(c.keyword)
      const matches = research.filter(
        (r) =>
          normalizeKeyword(r.keyword) === normalizeKeyword(c.keyword) &&
          validDocuments({
            count: r.blogTotal,
            source: r.source,
            checkedDate: r.checkedDate,
            scope: r.documentScope ?? '',
          }),
      )
      let documents: DocumentEvidence | undefined = validDocuments(c.documents)
        ? c.documents
        : undefined
      if (matches.length === 1)
        documents = {
          count: matches[0].blogTotal,
          source: matches[0].source,
          checkedDate: matches[0].checkedDate,
          scope: matches[0].documentScope!,
        }
      if (
        competition?.documentSource &&
        competition.documentScope &&
        competition.searchUrl &&
        validDocuments({
          count: competition.total,
          source: competition.documentSource,
          checkedDate: competition.checkedDate,
          scope: competition.documentScope,
        })
      ) {
        const recorded = {
          count: competition.total,
          source: competition.documentSource,
          checkedDate: competition.checkedDate,
          scope: competition.documentScope,
        }
        documents =
          documents && (documents.count !== recorded.count || documents.scope !== recorded.scope)
            ? undefined
            : recorded
      }
      if (matches.length > 1) documents = undefined

      const volumeKnown =
        typeof c.total === 'number' &&
        c.total === totalVolume(c.pc, c.mobile) &&
        !c.conflict &&
        !!c.source.trim() &&
        age(c.collectedAt) >= 0 &&
        age(c.collectedAt) <= 30
      const documentKnown =
        !!documents &&
        validDocuments(documents) &&
        age(documents.checkedDate) >= 0 &&
        age(documents.checkedDate) <= 30
      const duplicates = duplicateWarnings(
        c.keyword,
        item.context.topic,
        competition?.reviewmanUrl ?? '',
        publishing.publications,
      )
      const duplicate = duplicates.some((w) => w.blocking)
      const history = accounts.every((a) => publishing.historyChecked[a])
      const reviewman = competition?.reviewmanUrl || draft?.reviewman || ''
      const missing: string[] = []
      if (!volumeKnown)
        missing.push('검색량 미확인·충돌 또는 30일 초과: LIVE/출처 있는 수동 자료 재확인')
      if (!documentKnown)
        missing.push('경쟁 문서 수 미확인·다중 근거 또는 30일 초과: 출처·날짜·검색 범위 필요')
      if (!history) missing.push('블로그 3개 계정의 발행 이력 확인')
      if (intent.review) missing.push('검색 의도 사용자 확인')
      if (!reviewman) missing.push('Reviewman 연결 대상·근거 확인')
      if (duplicate) missing.push('기존 기획/발행과 중복 가능성 검토')
      missing.push(...assessment.missing)
      const reasons = [
        `검색량 출처: ${c.mode} · ${c.source} · ${c.collectedAt ?? '확인 시각 없음'}`,
        ...assessment.reasons,
      ]
      if (documents)
        reasons.push(`문서 수: ${documents.source} · ${documents.checkedDate} · ${documents.scope}`)
      if (draft?.timeliness) reasons.push(`시의성 사용자 근거: ${draft.timeliness}`)
      if (reviewman) reasons.push(`Reviewman 사용자 근거: ${reviewman}`)
      if (draft?.monetization)
        reasons.push(`수익화 사용자 가설(수익 보장 아님): ${draft.monetization}`)
      reasons.push(...duplicates.map((d) => d.message))
      let status: RankingStatus = '경쟁 추가 조사 필요'
      if (assessment.status === '발행 제외' || c.status === '제외 후보') status = '발행 제외'
      else if (duplicate) status = '발행 보류'
      else if (!volumeKnown || !documentKnown) status = '데이터 부족'
      else if (
        assessment.status === '진입 검토 가능' &&
        !missing.length &&
        typeof c.total === 'number' &&
        c.total > 0
      )
        status = '발행 검토 추천'
      else if (assessment.status === '롱테일 전환 추천' && !duplicate && history)
        status = '롱테일 전환 추천'
      const score =
        (volumeKnown ? Math.min(25, Math.round(((c.total as number) / 5000) * 25)) : 0) +
        (assessment.status === '진입 검토 가능' ? 20 : 0) +
        (!intent.review ? 10 : 0) +
        (reviewman ? 10 : 0) +
        (draft?.timeliness ? 5 : 0) +
        (draft?.monetization ? 5 : 0) +
        (documentKnown ? 5 : 0) -
        (duplicate ? 30 : 0)
      const account =
        status === '발행 검토 추천'
          ? accountSuggestion(c.keyword, item.context.topic, publishing)
          : { account: null, reason: '발행 검토 근거가 충분하지 않아 계정을 확정하지 않습니다.' }
      return {
        id: item.id,
        item,
        title: idea?.title ?? c.keyword,
        category: idea?.category ?? '미분류',
        intent: intent.intent,
        status,
        score,
        reasons,
        missing,
        documents: documentKnown ? documents : undefined,
        volumeKnown,
        reviewman,
        timeliness: draft?.timeliness ?? '미확인',
        account,
        competition: assessment.status,
      }
    })
    .filter(
      (r) =>
        (settings.category === 'all' || r.category === settings.category) &&
        (!settings.min ||
          (r.volumeKnown && (r.item.candidate.total as number) >= Number(settings.min))) &&
        (!settings.max ||
          (r.volumeKnown && (r.item.candidate.total as number) <= Number(settings.max))) &&
        (!settings.documentsMin ||
          (!!r.documents && r.documents.count! >= Number(settings.documentsMin))) &&
        (!settings.documentsMax ||
          (!!r.documents && r.documents.count! <= Number(settings.documentsMax))),
    )
  return rows.sort(
    (a, b) =>
      (settings.sort === 'priority'
        ? rankingStatuses.indexOf(a.status) - rankingStatuses.indexOf(b.status) || b.score - a.score
        : 0) ||
      (b.volumeKnown ? (b.item.candidate.total as number) : -1) -
        (a.volumeKnown ? (a.item.candidate.total as number) : -1) ||
      a.id.localeCompare(b.id),
  )
}
