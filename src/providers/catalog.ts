import type { VerificationStatus } from '../domain/research'
export interface SourceAudit {
  id: string
  name: string
  verification: VerificationStatus
  documentation: string
  checkedDate: string
  authenticatedTestAt: string | null
  usageApproved: boolean
  note: string
}
export const sourceAudits: SourceAudit[] = [
  {
    id: 'searchad',
    name: '네이버 검색광고 키워드 도구',
    verification: 'VERIFIED',
    documentation: 'https://naver.github.io/searchad-apidoc/',
    checkedDate: '2026-10-19',
    authenticatedTestAt: '2026-10-19T10:24:17.896Z',
    usageApproved: false,
    note: '단일 GET 인증 성공(HTTP 200). 로컬 조회 가능. 상업 이용·영구 저장 조건은 미확인.',
  },
  {
    id: 'trend',
    name: '네이버 데이터랩 · API HUB',
    verification: 'DOCUMENTED',
    documentation: 'https://api.ncloud-docs.com/docs/naver-api-hub-search-trend',
    checkedDate: '2026-10-19',
    authenticatedTestAt: null,
    usageApproved: false,
    note: '상대 관심도이며 절대 검색량이 아닙니다. 신규 API HUB Client ID·Secret 필요.',
  },
  {
    id: 'blog',
    name: '네이버 블로그 검색 · API HUB',
    verification: 'DOCUMENTED',
    documentation: 'https://api.ncloud-docs.com/docs/naver-api-hub-search-blog',
    checkedDate: '2026-10-19',
    authenticatedTestAt: null,
    usageApproved: false,
    note: 'API total과 게시물 메타데이터. 통합검색 실제 순위나 전체 문서 수로 단정할 수 없습니다.',
  },
  {
    id: 'autocomplete',
    name: '자동완성·검색화면 연관검색어',
    verification: 'UNVERIFIED',
    documentation: 'https://developers.naver.com/docs/common/openapiguide/apilist.md',
    checkedDate: '2026-10-19',
    authenticatedTestAt: null,
    usageApproved: false,
    note: '공개 공식 수집 API와 자동 접근 허용을 확인하지 못했습니다. 자동 수집 미지원, 수동 붙여넣기 사용.',
  },
]
/** Credential presence alone never enables a provider. Enforce again on the future server. */
export function canConnect(source: SourceAudit) {
  return (
    source.verification === 'VERIFIED' &&
    source.authenticatedTestAt !== null &&
    Number.isFinite(Date.parse(source.authenticatedTestAt)) &&
    source.usageApproved
  )
}
