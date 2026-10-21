import { describe, it, expect } from 'vitest'
import { analyzeCandidates } from './candidates'
import { today } from './research'
import {
  blankCompetition,
  emptyPublishing,
  naverSearch,
  evaluateCompetition,
  duplicateWarnings,
  accountSuggestion,
  publishingDecision,
  validateCompetition,
  validatePublication,
  imageBytes,
  type Publication,
  type Competition,
} from './publishing'
import type { SavedCandidate } from '../data/candidate-store'
import {
  createPublishingStore,
  parsePublishingImport,
  PUBLISHING_KEY,
} from '../data/publishing-store'
const context = { topic: '온누리상품권', reviewmanTopics: ['온누리상품권'] }
const input = {
  keyword: '온누리상품권 사용방법',
  pc: 100,
  mobile: 200,
  total: 300,
  collectedAt: new Date().toISOString(),
  source: '수동 확인',
  mode: 'MANUAL' as const,
}
export const candidate: SavedCandidate = {
  id: 'candidate-1',
  candidate: analyzeCandidates([input], context)[0],
  context,
  ideaId: null,
  savedAt: new Date().toISOString(),
  ruleVersion: 'rules-v1',
}
function complete(): Competition {
  return {
    ...blankCompetition(candidate),
    searchUrl: naverSearch(input.keyword),
    checkedDate: today(),
    blog: 'yes',
    dominant: 'no',
    position: 'middle',
    serp: 'information',
    posts: [
      {
        title: '사용 안내',
        url: 'https://blog.naver.com/example/123',
        date: today(),
        summary: '기존 방법',
        features: '세부 과정 부족',
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
    missingInfo: '최신 공식 사용 절차 안내',
    reviewmanUrl: 'https://reviewman.kr/guide',
  }
}
function publication(keyword = '온누리상품권 환불방법'): Publication {
  return {
    id: 'p1',
    account: 'nkr09134',
    keyword,
    topic: '온누리상품권',
    title: '환불 안내',
    status: 'planned',
    date: '',
    blogUrl: '',
    reviewmanUrl: '',
    ideaId: null,
  }
}
function memory() {
  const rows = new Map<string, string>()
  return {
    getItem: (key = PUBLISHING_KEY) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value)
    },
  }
}
describe('manual competition and publishing decisions', () => {
  it('requires evidence rather than a small result count or screenshot', () => {
    const a = blankCompetition(candidate)
    a.total = 1
    expect(evaluateCompetition(a).status).toBe('데이터 부족')
    expect(publishingDecision(candidate, a, emptyPublishing(), '').status).toBe('추가 조사 필요')
  })
  it('accepts complete evidence with explicit reasons', () => {
    const a = complete()
    expect(validateCompetition(a)).toEqual(a)
    expect(evaluateCompetition(a).status).toBe('진입 검토 가능')
    expect(evaluateCompetition(a).reasons.join()).toContain('사용자 평가')
  })
  it('requires stale search observations to be checked again', () => {
    const a = complete()
    a.checkedDate = '2020-01-01'
    expect(evaluateCompetition(a).missing.join()).toContain('재확인')
  })
  it('distinguishes strong competition and longtail change', () => {
    const a = complete()
    a.dominant = 'yes'
    a.quality = {
      ...a.quality,
      fresh: 'yes',
      intentMatch: 'yes',
      specific: 'yes',
      solves: 'yes',
      longtail: 'no',
    }
    expect(evaluateCompetition(a).status).toBe('경쟁 강함')
    a.quality.longtail = 'yes'
    expect(evaluateCompetition(a).status).toBe('롱테일 전환 추천')
  })
  it('requires an explicit exclusion reason', () => {
    const a = blankCompetition(candidate)
    a.excludeReason = '사업 범위 밖'
    expect(evaluateCompetition(a).status).toBe('발행 제외')
  })
  it('rejects foreign, unsafe and mismatched search URLs', () => {
    for (const url of [
      'https://example.com/search.naver?query=온누리상품권',
      'javascript:alert(1)',
      naverSearch('다른 키워드'),
    ])
      expect(() => validateCompetition({ ...complete(), searchUrl: url })).toThrow()
  })
  it('rejects future and invalid dates and negative totals', () => {
    for (const checkedDate of ['2026-02-30', '2999-01-01'])
      expect(() => validateCompetition({ ...complete(), checkedDate })).toThrow()
    expect(() => validateCompetition({ ...complete(), total: -1 })).toThrow()
  })
  it('finds exact and presentation-only duplicates', () => {
    expect(
      duplicateWarnings(input.keyword, context.topic, '', [publication(input.keyword)])[0].kind,
    ).toBe('exact')
    expect(
      duplicateWarnings(input.keyword, context.topic, '', [
        publication('온누리 상품권 사용방법'),
      ])[0].kind,
    ).toBe('normalized')
  })
  it('preserves usage, refund and places as distinct intent facets', () => {
    for (const keyword of ['온누리상품권 환불방법', '온누리상품권 사용처'])
      expect(
        duplicateWarnings(input.keyword, context.topic, '', [publication(keyword)]).some(
          (w) => w.blocking,
        ),
      ).toBe(false)
  })
  it('flags similar intent without removing a record', () => {
    const rows = [publication('온누리상품권 사용법')]
    expect(duplicateWarnings(input.keyword, context.topic, '', rows)[0].kind).toBe('intent')
    expect(rows).toHaveLength(1)
  })
  it('compares Reviewman URLs while ignoring UTM', () => {
    const p = publication()
    p.reviewmanUrl = 'https://reviewman.kr/guide?utm_source=blog'
    expect(
      duplicateWarnings(input.keyword, context.topic, 'https://reviewman.kr/guide', [p]).some(
        (w) => w.kind === 'reviewman',
      ),
    ).toBe(true)
  })
  it('requires checked history and topic evidence for an account', () => {
    const d = emptyPublishing()
    expect(accountSuggestion(input.keyword, context.topic, d).account).toBeNull()
    d.historyChecked = { nkr09134: true, nkr09135: true, nkr09136: true }
    expect(accountSuggestion(input.keyword, context.topic, d).account).toBeNull()
    d.publications = [
      {
        ...publication(),
        status: 'published',
        date: today(),
        blogUrl: 'https://blog.naver.com/nkr09134/123',
      },
    ]
    expect(accountSuggestion(input.keyword, context.topic, d).account).toBe('nkr09134')
    d.publications.push({
      ...publication(),
      id: 'p2',
      account: 'nkr09135',
      status: 'published',
      date: today(),
      blogUrl: 'https://blog.naver.com/nkr09135/123',
    })
    expect(accountSuggestion(input.keyword, context.topic, d).account).toBeNull()
  })
  it('does not recommend DEMO, unknown demand, or missing account evidence', () => {
    const d = emptyPublishing()
    d.historyChecked = { nkr09134: true, nkr09135: true, nkr09136: true }
    d.publications = [
      {
        ...publication(),
        status: 'published',
        date: today(),
        blogUrl: 'https://blog.naver.com/nkr09134/123',
      },
    ]
    for (const total of [null, '<10', 0] as const)
      expect(
        publishingDecision(
          { ...candidate, candidate: { ...candidate.candidate, total } },
          complete(),
          d,
          'https://reviewman.kr/guide',
        ).status,
      ).toBe('추가 조사 필요')
    expect(
      publishingDecision(
        { ...candidate, candidate: { ...candidate.candidate, mode: 'DEMO' } },
        complete(),
        d,
        'https://reviewman.kr/guide',
      ).status,
    ).toBe('추가 조사 필요')
  })
  it('recommends only review when demand, competition, linkage and history agree', () => {
    const d = emptyPublishing()
    d.historyChecked = { nkr09134: true, nkr09135: true, nkr09136: true }
    d.publications = [
      {
        ...publication(),
        status: 'published',
        date: today(),
        blogUrl: 'https://blog.naver.com/nkr09134/123',
      },
    ]
    const c = { ...candidate, candidate: { ...candidate.candidate, review: false } }
    expect(publishingDecision(c, complete(), d, 'https://reviewman.kr/guide').status).toBe(
      '발행 검토 추천',
    )
    d.publications.push({ ...publication(input.keyword), id: 'p2', account: 'nkr09136' })
    expect(publishingDecision(c, complete(), d, 'https://reviewman.kr/guide').status).toBe(
      '발행 보류',
    )
  })
  it('validates three accounts and published article ownership', () => {
    expect(() =>
      validatePublication({ ...publication(), account: 'other' } as unknown as Publication),
    ).toThrow()
    expect(() => validatePublication({ ...publication(), status: 'published' })).toThrow()
    expect(() =>
      validatePublication({
        ...publication(),
        status: 'published',
        date: today(),
        blogUrl: 'https://blog.naver.com/nkr09135/123',
      }),
    ).toThrow()
    expect(
      validatePublication({
        ...publication(),
        status: 'published',
        date: today(),
        blogUrl: 'https://blog.naver.com/nkr09134/123',
      }).status,
    ).toBe('published')
  })
  it('rejects SVG, fake and oversize image encodings', () => {
    for (const dataUrl of [
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png;base64,YWJj',
      'data:image/png;base64,' + 'A'.repeat(800000),
    ])
      expect(() =>
        imageBytes({ id: 'img', name: 'test', addedAt: new Date().toISOString(), dataUrl }),
      ).toThrow()
  })
})
describe('versioned local evidence storage', () => {
  it('starts empty without generating history', () =>
    expect(createPublishingStore(memory()).read()).toEqual(emptyPublishing()))
  it('restores competition linked to candidate and updates publication status', () => {
    const m = memory(),
      s = createPublishingStore(m)
    s.saveCompetition(complete())
    s.savePublication(publication())
    s.savePublication({ ...publication(), status: 'drafting' })
    const restored = createPublishingStore(m).read()
    expect(restored.analyses[0].candidateId).toBe(candidate.id)
    expect(restored.publications[0].status).toBe('drafting')
    expect(restored.publications).toHaveLength(1)
  })
  it('roundtrips JSON and merges without overwriting history coverage', () => {
    const s = createPublishingStore(memory())
    s.saveCompetition(complete())
    s.savePublication(publication())
    s.setHistoryChecked('nkr09134', true)
    const target = createPublishingStore(memory())
    expect(target.importData(parsePublishingImport(JSON.stringify(s.read()))).added).toBe(2)
    expect(target.read().historyChecked.nkr09134).toBe(false)
    expect(target.importData(s.read()).skipped).toBe(2)
  })
  it('rejects conflicting IDs atomically', () => {
    const s = createPublishingStore(memory())
    s.savePublication(publication())
    const incoming = emptyPublishing()
    incoming.publications = [
      { ...publication(), id: 'p2' },
      { ...publication(), title: '충돌' },
    ]
    expect(() => s.importData(incoming)).toThrow()
    expect(s.read().publications).toHaveLength(1)
  })
  it('rejects unknown schemas and malformed JSON', () => {
    for (const raw of ['{', '{}', '{"version":2}', '{"version":1,"publications":[{}]}'])
      expect(() => parsePublishingImport(raw)).toThrow()
  })
  it('keeps corrupt original bytes and refuses writes', () => {
    const m = memory()
    m.setItem(PUBLISHING_KEY, 'broken')
    const s = createPublishingStore(m)
    expect(() => s.savePublication(publication())).toThrow()
    expect(m.getItem()).toBe('broken')
  })
  it('reports quota failure and leaves prior data intact', () => {
    const m = memory(),
      s = createPublishingStore(m)
    s.savePublication(publication())
    const failing = createPublishingStore({
      getItem: m.getItem,
      setItem: () => {
        throw new Error('QuotaExceeded')
      },
    })
    expect(() => failing.saveCompetition(complete())).toThrow('저장 공간')
    expect(s.read().publications).toHaveLength(1)
    expect(s.read().analyses).toHaveLength(0)
  })
  it('accepts manual history-only imports with explicit version', () => {
    const d = parsePublishingImport(JSON.stringify({ version: 1, publications: [publication()] }))
    expect(d.analyses).toEqual([])
    expect(d.publications).toHaveLength(1)
  })
})

describe('additional evidence boundaries', () => {
  it('does not derive account suitability from unpublished plans', () => {
    const d = emptyPublishing()
    d.historyChecked = { nkr09134: true, nkr09135: true, nkr09136: true }
    d.publications = [publication()]
    expect(accountSuggestion(input.keyword, context.topic, d).account).toBeNull()
  })
  it('rejects evidence linked to a different keyword or candidate', () => {
    for (const record of [
      { ...complete(), candidateId: 'other' },
      { ...complete(), keyword: '다른 주제' },
    ])
      expect(publishingDecision(candidate, record, emptyPublishing(), '').competition.status).toBe(
        '데이터 부족',
      )
  })
  it('retains captures on quota rejection and persists explicit removal', () => {
    const s = createPublishingStore(memory())
    const dataUrl = 'data:image/png;base64,' + btoa('\x89PNG\r\n\x1a\n' + 'x'.repeat(400000))
    const a = complete()
    a.images = Array.from({ length: 3 }, (_, i) => ({
      id: `img-${i}`,
      name: 'capture.png',
      addedAt: new Date().toISOString(),
      dataUrl,
    }))
    s.saveCompetition(a)
    expect(() =>
      s.saveCompetition({
        ...a,
        candidateId: 'second',
        images: [{ ...a.images[0], id: 'fourth' }],
      }),
    ).toThrow('1.5 MiB')
    expect(s.read().analyses).toHaveLength(1)
    s.saveCompetition({ ...a, images: [] })
    expect(s.read().analyses[0].images).toHaveLength(0)
  })
})
it('does not recommend on contradictory blog visibility observations', () => {
  for (const patch of [
    { blog: 'yes', position: 'absent' },
    { blog: 'no', position: 'top' },
  ] as const) {
    const result = evaluateCompetition({ ...complete(), ...patch })
    expect(result.status).toBe('데이터 부족')
    expect(result.missing.join()).toContain('모순')
  }
})
