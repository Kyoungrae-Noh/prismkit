import { totalVolume, type KeywordResearch } from '../domain/research'
import type {
  KeywordExpansionProvider,
  SearchVolumeProvider,
  TrendProvider,
  BlogCompetitionProvider,
  ProviderResult,
  TrendData,
} from './contracts'
export function createManualProviders(
  record: KeywordResearch,
): KeywordExpansionProvider & SearchVolumeProvider & TrendProvider & BlogCompetitionProvider {
  function result<T>(keyword: string, data: T | null, missing: string[]): ProviderResult<T> {
    const matches = keyword.trim() === record.keyword
    return {
      data: matches ? data : null,
      source: { id: 'manual', label: record.source, mode: 'MANUAL' },
      collectedAt: record.updatedAt,
      checkedDate: record.checkedDate,
      verification: 'UNVERIFIED',
      missing: matches ? missing : ['keyword'],
      error:
        !matches || data === null
          ? { code: 'MISSING_DATA', message: '확인 불가: 해당 자료가 없습니다.', retryable: false }
          : null,
    }
  }
  return {
    async expand(keyword) {
      return result(
        keyword,
        { keywords: record.related, kind: 'manual' as const },
        record.related.length ? [] : ['related'],
      )
    },
    async getVolume(keyword) {
      const total = totalVolume(record.pc, record.mobile)
      return result(
        keyword,
        { pc: record.pc, mobile: record.mobile, total, period: 'user-reported' as const },
        [
          ...(record.pc === null ? ['pc'] : []),
          ...(record.mobile === null ? ['mobile'] : []),
          ...(total === null ? ['total'] : []),
        ],
      )
    },
    async getTrend(keyword) {
      return result<TrendData>(keyword, null, ['trend'])
    },
    async getCompetition(keyword) {
      return result(
        keyword,
        {
          total: record.blogTotal,
          items: [],
          sort: null,
          rankingScope: 'api-results-only' as const,
          analysisStatus: 'NOT_ANALYZED' as const,
        },
        [...(record.blogTotal === null ? ['total'] : []), 'items', 'quality', 'intentMatch'],
      )
    },
  }
}
