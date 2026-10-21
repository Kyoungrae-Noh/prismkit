import { it, expect } from 'vitest'
import { analyzeCandidates } from './candidates'
import { rankCandidates, defaultRanking } from './ranking'
import { emptyCaptures } from './captures'
import { blankCompetition, emptyPublishing, naverSearch, type PublishingData } from './publishing'
import { today } from './research'
import type { SavedCandidate } from '../data/candidate-store'
function seed(): { item: SavedCandidate; publishing: PublishingData } {
  const context = { topic: '상품권', reviewmanTopics: ['상품권'] }
  const c = analyzeCandidates(
    [
      {
        keyword: '상품권 신청',
        mode: 'LIVE',
        source: '네이버 검색광고',
        pc: 1000,
        mobile: 3000,
        total: 4000,
        collectedAt: new Date().toISOString(),
        documents: {
          count: 200,
          source: '직접 검색',
          scope: '네이버 블로그 탭',
          checkedDate: today(),
        },
      },
    ],
    context,
  )[0]
  const item: SavedCandidate = {
    id: 'candidate',
    candidate: c,
    context,
    ideaId: null,
    savedAt: new Date().toISOString(),
    ruleVersion: 'rules-v1',
  }
  const a = blankCompetition(item)
  Object.assign(a, {
    searchUrl: naverSearch(c.keyword),
    checkedDate: today(),
    blog: 'yes',
    dominant: 'no',
    position: 'middle',
    serp: 'information',
    missingInfo: '공식 신청 절차 누락',
    reviewmanUrl: 'https://reviewman.kr/guide',
    posts: [
      {
        title: '신청',
        url: 'https://example.com/post',
        date: today(),
        summary: '구버전 안내',
        features: '신규 절차 부족',
      },
    ],
    quality: {
      fresh: 'no',
      intentMatch: 'yes',
      specific: 'no',
      official: 'no',
      solves: 'no',
      intentGap: 'yes',
      officialEdge: 'yes',
      longtail: 'yes',
      better: 'yes',
    },
  })
  return {
    item,
    publishing: {
      ...emptyPublishing(),
      analyses: [a],
      historyChecked: { nkr09134: true, nkr09135: true, nkr09136: true },
    },
  }
}
const run = (s: ReturnType<typeof seed>, settings = defaultRanking) =>
  rankCandidates([s.item], [], [], s.publishing, emptyCaptures(), settings)
it('recommends only when real volume, scoped documents, quality and history support it', () => {
  const s = seed()
  const r = run(s)[0]
  expect(r.status).toBe('발행 검토 추천')
  expect(r.reasons.join(' ')).toContain('직접 검색')
  expect(r.account.account).toBeNull()
})
it('missing or conflicting counts never become low competition', () => {
  for (const mutate of [
    (s: ReturnType<typeof seed>) => {
      s.item.candidate.documents = undefined
    },
    (s: ReturnType<typeof seed>) => {
      s.item.candidate.total = null
    },
    (s: ReturnType<typeof seed>) => {
      s.item.candidate.conflict = true
    },
  ]) {
    const s = seed()
    mutate(s)
    expect(run(s)[0].status).toBe('데이터 부족')
    expect(run(s, { ...defaultRanking, min: '3000', documentsMax: '500' })).toHaveLength(0)
  }
})
it('count alone never replaces competition review and missing history prevents recommendations', () => {
  const s = seed()
  s.publishing.analyses = []
  expect(run(s)[0].status).toBe('경쟁 추가 조사 필요')
  const t = seed()
  t.publishing.historyChecked.nkr09134 = false
  expect(run(t)[0].status).not.toBe('발행 검토 추천')
})
it('keeps low volume with filters cleared, excludes DEMO and stale evidence', () => {
  const s = seed()
  s.item.candidate.pc = 100
  s.item.candidate.mobile = 200
  s.item.candidate.total = 300
  expect(run(s)).toHaveLength(1)
  expect(run(s, { ...defaultRanking, min: '3000' })).toHaveLength(0)
  s.item.candidate.mode = 'DEMO'
  expect(run(s)).toHaveLength(0)
  s.item.candidate.mode = 'LIVE'
  s.item.candidate.collectedAt = '2000-01-01'
  expect(run(s)[0].status).toBe('데이터 부족')
})
it('exclusion and duplicate planning override favorable demand', () => {
  const s = seed()
  s.publishing.analyses[0].excludeReason = '권리 확인 필요'
  expect(run(s)[0].status).toBe('발행 제외')
  const t = seed()
  t.publishing.publications.push({
    id: 'p',
    account: 'nkr09134',
    keyword: t.item.candidate.keyword,
    topic: '상품권',
    title: '기존 기획',
    status: 'planned',
    date: '',
    blogUrl: '',
    reviewmanUrl: '',
    ideaId: null,
  })
  expect(run(t)[0].status).not.toBe('발행 검토 추천')
})
