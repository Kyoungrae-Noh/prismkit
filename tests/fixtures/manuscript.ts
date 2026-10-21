import {
  DRAFT_MODEL,
  type DraftBrief,
  type DraftContent,
  type Manuscript,
} from '../../src/domain/manuscripts.ts'
export const brief: DraftBrief = {
  candidateId: 'candidate',
  ideaId: null,
  keyword: '여행 준비',
  topic: '여행 준비 체크리스트',
  intent: '여행 준비 방법',
  type: 'naver',
  account: 'nkr09134',
  category: 'travel',
  angle: '초보 여행자',
  evidence: '소지품을 출발 전에 점검한다.',
  sources: [
    {
      id: 'source',
      title: '공식 안내',
      url: 'https://example.org/guide',
      excerpt: '출발 전에 준비물을 확인하세요.',
      checkedDate: '2026-10-20',
      kind: 'official',
    },
  ],
}
export const content: DraftContent = {
  title: '여행 준비 체크리스트',
  meta: '여행 준비를 확인하는 체크리스트',
  h1: '여행 준비',
  introduction: '준비물을 먼저 살펴보세요.',
  sections: [
    {
      heading: '출발 전 점검',
      body: '준비물을 점검하세요. [사실 확인 필요] 일정은 원문 확인이 필요합니다.',
      sourceIds: ['source'],
    },
  ],
  faq: [
    {
      question: '무엇을 확인하나요?',
      answer: '출발 전에 준비물을 확인합니다.',
      sourceIds: ['source'],
    },
  ],
  checklist: ['준비물 확인'],
  conclusion: '확인한 내용을 바탕으로 준비하세요.',
  imageNotes: ['준비물', '체크리스트', '짐', '일정', '마무리'],
  sourceIds: ['source'],
  internalIds: [],
  cta: '공식 안내 확인',
  monetization: '여행용품 제휴 검토 · 광고 표시 필요',
  checks: ['최신 공식 안내 확인'],
}
export const manuscript = (): Manuscript => ({
  id: 'generated-manuscript-001',
  brief: structuredClone(brief),
  content: structuredClone(content),
  generated: structuredClone(content),
  model: DRAFT_MODEL,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  usage: { inputTokens: 4000, outputTokens: 6000, estimatedUsd: 0.0112, reservedUsd: 0.03 },
  review: {},
})
