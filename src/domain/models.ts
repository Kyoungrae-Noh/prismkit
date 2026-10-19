import type { KeywordResearch, ResearchInput } from './research'
export const statuses = ['inbox', 'planned', 'drafting', 'published'] as const
export type IdeaStatus = (typeof statuses)[number]
export const statusLabels: Record<IdeaStatus, string> = {
  inbox: '아이디어',
  planned: '작성 예정',
  drafting: '작성 중',
  published: '발행 완료',
}
export const categories = ['라이프스타일', '테크·AI', '비즈니스', '여행'] as const
export type Category = (typeof categories)[number]
export interface IdeaInput {
  title: string
  keyword: string
  category: Category
  status: IdeaStatus
  memo: string
}
export interface Idea extends IdeaInput {
  id: string
  createdAt: string
  updatedAt: string
}
export interface Keyword {
  id: string
  term: string
  category: Category
  monthlySearches: number
  growth: number
  competition: 'low' | 'medium' | 'high'
  opportunity: number
  intent: string
  trend: number[]
  related: string[]
  source: 'sample'
}
export interface Connection {
  id: string
  name: string
  description: string
  kind: 'search' | 'analytics' | 'ai'
  status: 'planned'
}

/** Implement a server-backed adapter against this contract in the next phase. */
export interface WorkspaceRepository {
  listResearch(): Promise<KeywordResearch[]>
  saveResearch(input: ResearchInput, id?: string): Promise<KeywordResearch>
  listIdeas(): Promise<Idea[]>
  createIdea(input: IdeaInput): Promise<Idea>
  updateIdea(id: string, input: IdeaInput): Promise<Idea>
  deleteIdea(id: string): Promise<void>
  listKeywords(): Promise<Keyword[]>
  listConnections(): Promise<Connection[]>
}
/** Contracts only: no provider calls, collection jobs, or generation in Phase 0. */
export interface KeywordAnalysisGateway {
  analyze(input: { keyword: string; locale: 'ko-KR' }): Promise<Keyword[]>
}
export interface ContentGenerationGateway {
  generateOutline(input: {
    ideaId: string
    keyword: string
  }): Promise<{ title: string; sections: string[] }>
}

export function validateIdea(input: IdeaInput): IdeaInput {
  const cleaned = {
    ...input,
    title: input.title.trim(),
    keyword: input.keyword.trim(),
    memo: input.memo.trim(),
  }
  if (!cleaned.title || cleaned.title.length > 120)
    throw new Error('제목은 1~120자로 입력해 주세요.')
  if (!cleaned.keyword || cleaned.keyword.length > 60)
    throw new Error('키워드는 1~60자로 입력해 주세요.')
  if (cleaned.memo.length > 2000) throw new Error('메모는 2,000자 이내로 입력해 주세요.')
  if (!categories.includes(cleaned.category) || !statuses.includes(cleaned.status))
    throw new Error('올바른 카테고리와 상태를 선택해 주세요.')
  return cleaned
}
