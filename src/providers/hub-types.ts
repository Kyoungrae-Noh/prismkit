export const hubApis = ['blog', 'cafe', 'kin', 'news', 'trend', 'shopping'] as const
export type HubApi = (typeof hubApis)[number]
export const hubLabels: Record<HubApi, string> = {
  blog: '블로그',
  cafe: '카페',
  kin: '지식iN',
  news: '뉴스',
  trend: '검색어트렌드',
  shopping: '쇼핑인사이트',
}
export interface HubRequest {
  api: HubApi
  query: string
  display?: number
  sort?: 'sim' | 'date'
  startDate?: string
  endDate?: string
  device?: 'all' | 'pc' | 'mo'
  category?: string
  shoppingScope?: 'category' | 'keyword'
  groups?: string[]
}
export interface HubItem {
  title: string
  url: string
  originalUrl: string | null
  description: string
  date: string | null
  dateKind: 'posted' | 'provided' | 'unavailable'
  source: string
  apiPosition: number
}
export interface HubSeries {
  title: string
  points: { date: string; ratio: number }[]
}
export interface HubResult {
  api: HubApi
  mode: 'LIVE' | 'DEMO'
  query: string
  collectedAt: string
  total: number | null
  items: HubItem[]
  series: HubSeries[]
  unit: 'api-results' | 'relative-search-index' | 'relative-shopping-click-index'
  scope: 'api-results-only' | 'requested-period-only'
  startDate: string | null
  endDate: string | null
  device: 'all' | 'pc' | 'mo'
  cached: boolean
}
export interface HubStatus {
  configured: boolean
  apis: {
    api: HubApi
    enabled: boolean
    reason: string
    dailyUsed: number
    monthlyUsed: number
    blocked: boolean
  }[]
  limits: { daily: number; monthly: number; intervalMs: number; cacheSeconds: number }
}
