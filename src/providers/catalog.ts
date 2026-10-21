import type { VerificationStatus } from '../domain/research'
import { hubApis, hubLabels } from './hub-types'
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
  ...hubApis.map((api): SourceAudit => ({
    id: api,
    name: `네이버 ${hubLabels[api]} · API HUB`,
    verification: 'DOCUMENTED',
    documentation: `https://api.ncloud-docs.com/docs/naver-api-hub-${api === 'shopping' ? 'shopping-insight-keywords' : `search-${api === 'cafe' ? 'cafearticle' : api}`}.md`,
    checkedDate: '2026-10-21',
    authenticatedTestAt: null,
    usageApproved: false,
    note:
      api === 'trend' || api === 'shopping'
        ? '상대 관심도 어댑터·모의 검증 완료. 저장·상업 활용 조건 확인 전 LIVE 보류; 실제 인증 호출 미실시.'
        : '어댑터·모의 검증 완료. 검색 결과 저장·가공·AI·수익화 활용은 NAVER 별도 허가 확인 전 LIVE 보류.',
  })),
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
