import type { Count, VerificationStatus } from '../domain/research'
export interface ProviderResult<T> {
  data: T | null
  source: { id: string; label: string; mode: 'MANUAL' | 'DEMO' | 'API' }
  collectedAt: string | null
  checkedDate: string | null
  verification: VerificationStatus
  error: {
    code: 'NOT_CONNECTED' | 'MISSING_DATA' | 'AUTH' | 'RATE_LIMIT' | 'NETWORK' | 'INVALID_RESPONSE'
    message: string
    retryable: boolean
  } | null
  missing: string[]
}
export interface ExpansionData {
  keywords: string[]
  kind: 'manual' | 'searchad-related' | 'autocomplete' | 'serp-related'
}
export interface VolumeData {
  pc: Count
  mobile: Count
  total: Count
  period: 'recent-30-days' | 'user-reported'
}
export interface TrendData {
  points: { date: string; ratio: number }[]
  unit: 'relative-index'
  startDate: string
  endDate: string
  device: 'all' | 'pc' | 'mo'
  ages: string[]
}
export interface BlogData {
  total: number | null
  items: {
    title: string
    url: string
    postDate: string | null
    description: string
    apiPosition: number
  }[]
  sort: 'sim' | 'date' | null
  rankingScope: 'api-results-only'
  analysisStatus: 'NOT_ANALYZED'
}
export interface KeywordExpansionProvider {
  expand(keyword: string): Promise<ProviderResult<ExpansionData>>
}
export interface SearchVolumeProvider {
  getVolume(keyword: string): Promise<ProviderResult<VolumeData>>
}
export interface TrendProvider {
  getTrend(keyword: string): Promise<ProviderResult<TrendData>>
}
export interface BlogCompetitionProvider {
  getCompetition(keyword: string): Promise<ProviderResult<BlogData>>
}
