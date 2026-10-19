# 서버 연결 최소 설계 (실행·배포 미구현)

Phase 1은 계약과 수동 어댑터까지 구현한다. 이 디렉터리는 설계 문서만 포함하며 서버가 실행되거나 외부 API를 호출하지 않는다. Wrangler 설정·배포 명령·DB 리소스도 추가하지 않았다.

## 경계

```text
React 화면 → WorkspaceRepository → 브라우저 수동 저장
           → 4개 Provider 계약 → 현재 수동 어댑터 또는 NOT_CONNECTED

향후: 인증된 관리자 → 동일 출처 /api/keyword/* → 서버 인증·검증·쿼터
     → 사용 승인된 공급자 어댑터 → Naver 공식 API
     ← 스키마 검증·출처·누락/오류 정규화 ← 공급자 응답
```

후보는 Cloudflare Workers이다. [공식 Secrets 문서](https://developers.cloudflare.com/workers/configuration/secrets/)에 따라 키는 서버 런타임 secret binding으로만 공급한다. 로컬 검증 시 Git에서 무시되는 `.dev.vars` 등을 사용하고 클라이언트·로그·오류 응답에 키를 전달하지 않는다. 실제 생성/등록/배포는 이번 범위 밖이다.

서버 전용 이름 제안:

- `NAVER_SEARCHAD_API_KEY` (검색광고 API 라이선스)
- `NAVER_SEARCHAD_SECRET_KEY`
- `NAVER_SEARCHAD_CUSTOMER_ID`
- `NAVER_API_HUB_CLIENT_ID`
- `NAVER_API_HUB_CLIENT_SECRET`

API HUB Application의 Client ID/Secret은 NCP IAM Access Key/Secret Key와 다르다. 신규 서비스는 API HUB를 사용한다. 기존 Developers 키가 있다면 이관 여부·유효기간부터 별도로 확인한다. 이 이름들은 현재 앱에서 읽거나 필요로 하지 않는다. 브라우저에서 키를 입력받지 않는다.

## 제안 API와 어댑터

| 내부 라우트 (향후 POST) | 계약                     | 공식 대상                                                   |
| ----------------------- | ------------------------ | ----------------------------------------------------------- |
| `/api/keyword/expand`   | KeywordExpansionProvider | SearchAd `/keywordstool`; `kind=searchad-related`           |
| `/api/keyword/volume`   | SearchVolumeProvider     | SearchAd `/keywordstool`; 최근 30일, `<10` 보존             |
| `/api/keyword/trend`    | TrendProvider            | API HUB `/search-trend/v1/search`; 요청 기간·기기·연령 기록 |
| `/api/keyword/blog`     | BlogCompetitionProvider  | API HUB `/search/v1/blog`; API 순서·정렬·표본 한계 표시     |

자동완성 비공식 엔드포인트는 설계에 포함하지 않는다. 서버는 임의 URL을 받지 않고 허용한 호스트/경로만 호출한다. 관리자 인증·권한, CSRF/Origin 확인, 요청 크기·키워드·날짜 검증이 선행되어야 한다.

## 연결 승인과 증거

`src/providers/catalog.ts`의 `canConnect()`는 문서뿐 아니라 VERIFIED, 인증 테스트 일시, 이용 조건 승인 기록을 요구하는 순수 정책이다. 현재 모든 소스는 비활성이다. UI 플래그는 보안 경계가 아니므로 향후 서버의 배포 설정/감사 기록으로 다시 검사해야 한다. 사용자가 전달한 검증 상태는 신뢰하지 않는다.

먼저 서버 측 제한된 진단 호출로 상태·시각·응답 스키마를 확인한다. 키/전체 응답을 로그에 남기지 않는다. 성공 증거, 호출 한도, 상업 이용·보관 조건이 확인된 소스만 활성화한다. 토큰의 존재나 HTTP 200만으로 결과의 의미·사용권까지 검증했다고 표시하지 않는다.

공급자 응답은 `data`, `source`, `collectedAt`, `checkedDate`, `verification`, `error`, `missing`을 반환한다. 인증/쿼터/네트워크/형식 오류를 분리한다. 미연결이나 실패를 DEMO로 대체하지 않는다. 실제 호출 시각과 데이터 집계 기간은 별개로 기록한다. 수동 어댑터의 수집 시각은 입력 저장 시각이며 화면에도 그렇게 명시한다.

## 향후 구현 시 처리 규칙

- SearchAd: 서버에서 timestamp·HTTP method·URI를 HMAC-SHA256으로 서명한다. API HUB: 서버에서 공식 인증 헤더 두 개를 붙인다. 비밀값을 URL에 넣지 않는다.
- 각 공급자 타임아웃, 제한된 재시도, 429 대기, 요청 중복 방지와 사용자/공급자별 예산 차단을 둔다. 실제 한도는 감사 문서의 상충 항목을 콘솔에서 확인한 뒤 설정한다.
- 외부 응답은 런타임 스키마 검사한다. 검색수 문자열 `<10`은 원형 보존한다. HTML 포함 제목/요약은 안전한 텍스트로 변환하며, URL은 허용된 http/https만 링크로 표시한다.
- API 원문 저장/캐시/재배포는 기본 비활성이다. 공급자 계약에서 허용한 목적·기간·필드만 별도 정책으로 활성화한다. API total이나 순서를 네이버 통합검색 순위로 변환하지 않는다.
- `VITE_` 환경변수는 현재 전부 차단한다. Vite는 `server/` 모듈 import도 차단한다. `npm run test:secrets`로 가짜 서버 키가 빌드 산출물에 없고 VITE 키 주입 빌드가 실패하는지 확인한다. 이는 모든 미래 누출을 보장하는 검사는 아니며 서버 개발 시 추가 검토가 필요하다.

서버 구현·인증 테스트·운영 배포는 별도 사용자 지시 이후 진행한다.
