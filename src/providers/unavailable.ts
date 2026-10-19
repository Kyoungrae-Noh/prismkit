import type {
  BlogCompetitionProvider,
  BlogData,
  ExpansionData,
  KeywordExpansionProvider,
  ProviderResult,
  SearchVolumeProvider,
  TrendData,
  TrendProvider,
  VolumeData,
} from './contracts'
import type { SourceAudit } from './catalog'

/** No external transport exists in Phase 1. No credentials or fabricated fallback data. */
export function createUnavailableProvider(
  source: SourceAudit,
): KeywordExpansionProvider & SearchVolumeProvider & TrendProvider & BlogCompetitionProvider {
  const unavailable = <T>(missing: string[]): ProviderResult<T> => ({
    data: null,
    source: { id: source.id, label: source.name, mode: 'API' },
    collectedAt: null,
    checkedDate: null,
    verification: source.verification,
    error: {
      code: 'NOT_CONNECTED',
      message: '인증 호출과 이용 조건 검증 전에는 연결할 수 없습니다.',
      retryable: false,
    },
    missing,
  })
  return {
    async expand() {
      return unavailable<ExpansionData>(['related'])
    },
    async getVolume() {
      return unavailable<VolumeData>(['pc', 'mobile', 'total'])
    },
    async getTrend() {
      return unavailable<TrendData>(['trend'])
    },
    async getCompetition() {
      return unavailable<BlogData>(['total', 'items', 'quality'])
    },
  }
}
