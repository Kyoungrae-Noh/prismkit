import type { KeywordExpansionProvider, SearchVolumeProvider } from './contracts'
import type { SearchAdResponse } from './searchad-types'
export interface SearchAdProvider extends KeywordExpansionProvider, SearchVolumeProvider {
  query(keyword: string): Promise<SearchAdResponse>
}
export function createSearchAdProvider(): SearchAdProvider {
  async function query(keyword: string): Promise<SearchAdResponse> {
    let response: Response
    try {
      response = await fetch(`/api/searchad/keyword?keyword=${encodeURIComponent(keyword)}`, {
        headers: { 'X-Prismkit-Request': 'keyword-query' },
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      })
    } catch {
      throw new Error(
        '로컬 API 서버에 연결하지 못했습니다. npm run dev:api 실행 상태를 확인하세요.',
      )
    }
    let body: SearchAdResponse & { error?: { message?: string } }
    try {
      body = await response.json()
    } catch {
      throw new Error('로컬 API 응답을 읽지 못했습니다. 서버 실행 상태를 확인하세요.')
    }
    if (!response.ok) throw new Error(body.error?.message || `조회 실패 (HTTP ${response.status})`)
    if (
      body.volume?.verification !== 'VERIFIED' ||
      body.volume?.source.mode !== 'API' ||
      body.expansion?.verification !== 'VERIFIED' ||
      !Array.isArray(body.rows) ||
      !body.volume.collectedAt
    )
      throw new Error('검증된 검색광고 데이터가 아닙니다.')
    return body
  }
  return {
    query,
    async getVolume(keyword) {
      return (await query(keyword)).volume
    },
    async expand(keyword) {
      return (await query(keyword)).expansion
    },
  }
}
