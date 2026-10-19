# Phase 2A — 인증 준비 및 종료 보고

확인일: 2026-10-19. 경로: `/Users/kkr/website/prismkit.online`.

## Phase 1 보존 결과

- 브랜치: `rebuild/phase0`.
- 로컬 커밋: `7787be7` — `Preserve Phase 1 data source audit and manual keyword research`.
- 기존 백업 브랜치 `backup/prismkit-pre-phase0-20261019`는 `836d455444bac1891936d5836012966d1e4c35d9` 그대로 유지.
- `npm run check`: 단위·통합 테스트 21개, 타입 검사, 프로덕션 빌드 통과.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 12개 통과. 합계 33개, 삭제·건너뛰기 없음.
- `npm run test:secrets`: 서버 전용 가짜 검사값이 번들에 없으며 VITE_ 주입 빌드는 차단됨. 이 검사값은 API 인증에 사용하지 않았음.
- 커밋 대상 파일명 및 비밀 할당/개인키 패턴 검사에서 의심 항목 없음. 이는 패턴 검사 범위의 결과이며 모든 비밀 형식을 탐지한다는 보장은 아님.

## 인증 준비 상태와 실제 검증 결과

실행 환경의 관련 변수 이름 및 프로젝트 내 로컬 `.env*`/`.dev.vars*` 파일 존재를 검사했다. 비밀값을 출력하지 않았다. 현재 템플릿을 제외한 비밀 파일과 관련 인증 변수는 모두 없었다.

| 대상 | 필요한 변수 | 준비 | 실제 호출 / HTTP 상태 | 응답 검증 |
| --- | --- | --- | --- | --- |
| 검색광고 | NAVER_SEARCHAD_API_KEY, NAVER_SEARCHAD_SECRET_KEY, NAVER_SEARCHAD_CUSTOMER_ID | 모두 없음 | 미실시 / 해당 없음 | 없음 |
| API HUB 블로그 | NAVER_API_HUB_CLIENT_ID, NAVER_API_HUB_CLIENT_SECRET | 모두 없음 | 미실시 / 해당 없음 | 없음 |
| API HUB 검색어 트렌드 | 같은 HUB 키 및 해당 API 사용 설정 | 키 없음, 계정 권한 미확인 | 미실시 / 해당 없음 | 없음 |

공식 문서 열람은 인증 성공으로 집계하지 않는다. 데이터 소스 상태는 DOCUMENTED를 유지하며 VERIFIED로 승격하지 않았다. 실제 응답으로 검증한 필드는 없다. 문서상 검증 후보는 SearchAd의 `relKeyword`, `monthlyPcQcCnt`, `monthlyMobileQcCnt`와 `<10`, 블로그의 `total`, `items[].title/link/postdate/description`, 데이터랩의 기간별 상대 `ratio`다. 실제 타입·빈 결과·오류 응답·429 처리는 키 준비 후 확인해야 한다.

이번에는 Provider를 추가하지 않았다. Phase 1의 4개 계약과 수동/미연결 어댑터만 유지한다. 사용자의 “키가 없으면 발급 안내까지만 진행하고 종료” 지시에 따라 서버 호출 코드와 실제 데이터 연동을 진행하지 않았다.

## 사용자가 준비할 인증 정보

### 검색광고

[공식 API 안내](https://naver.github.io/searchad-apidoc/)에 따라 검색광고 광고주센터에 로그인하고 광고 시스템의 **도구 → API 사용 관리**에서 API 서비스를 신청한다. API 라이선스(API Key), Secret Key, 조회할 광고주 Customer ID를 준비한다. Customer ID는 네이버 로그인 아이디와 구별한다.

공식 동적 문서의 본문을 웹 도구로 읽지 못해 [공식 안내 JSON](https://naver.github.io/searchad-apidoc/assets/i18n/markdown-ko-KR.json)을 HTTP GET으로 확인했다. 문서의 예제 인증값은 복사하거나 호출에 사용하지 않았다. 이번에는 계정 로그인·API 신청을 대신 수행하지 않았다.

### API HUB: 블로그 및 데이터랩

[공식 Application 가이드](https://guide.ncloud-docs.com/docs/apihub-application)에 따라 NCP 콘솔에서 **All Services → Application Services → NAVER API HUB**로 이동한다. 이용 신청 및 약관 확인 후 Application을 등록하고 **블로그 검색과 검색어 트렌드**를 선택한다. Application에서 발급한 Client ID와 Client Secret을 준비한다. NCP IAM Access Key/Secret Key를 대신 사용하지 않는다.

[블로그 API 명세](https://api.ncloud-docs.com/docs/naver-api-hub-search-blog)와 [검색어 트렌드 명세](https://api.ncloud-docs.com/docs/naver-api-hub-search-trend)를 확인했다. 데이터랩 API는 공식 제공되지만 현재 계정에서 사용 가능한지 인증 테스트로 확인하지 못했다. 데이터랩은 상대 지수이며 월간 절대 검색량이 아니다.

### 로컬 보관

`.env.example`에는 위 변수 이름과 빈 값만 작성했다. 현재 앱이 이 파일로 자동 인증하거나 외부 호출을 수행하지는 않는다.

프로젝트에서 사용자가 직접 다음 명령으로 **기존 파일을 덮어쓰지 않는** 로컬 파일을 준비할 수 있다.

```sh
cp -n .env.example .env
chmod 600 .env
```

로컬 편집기에서 `.env`의 빈 값에 발급 정보를 입력한다. 또는 다음 검증 작업이 실행될 프로세스에 서버 전용 환경변수로 제공한다. 실제 값을 채팅·소스코드·로그·셸 명령 인자에 붙여넣지 않는다. `VITE_` 접두사는 사용하지 않는다. `.env`는 기존 `.gitignore`에 의해 추적에서 제외된다. 템플릿을 수정해 비밀값을 넣지 않는다.

키를 준비한 뒤 **“Phase 2A 실제 인증 검증을 이어서 진행해 주세요”**라는 별도 명령을 내리면 된다. 이번 작업에서 실제 `.env` 파일 생성이나 비밀값 저장은 하지 않았다.

## 호출 한도와 비용

[HUB 공통 안내](https://guide.ncloud-docs.com/docs/apihub-overview)는 검색 카테고리 월 775,000회, 검색어 트렌드 월 50,000회, Key당 50 RPS를 설명한다. 블로그 상세 문서의 25,000회/일 표기와 차이가 있어 실제 적용 한도는 콘솔에서 확인해야 한다. 이번에 호출 제한을 부하 테스트하거나 초과 요청하지 않았다.

[요금 안내](https://guide.ncloud-docs.com/docs/apihub-spec)는 현재 한시적 무료와 향후 유료 전환 사전 공지를 설명한다. 검색광고 API의 별도 비용·호출 제한과 두 서비스의 저장/재사용 조건은 미확인 항목을 유지한다. 계정 신청 시 조건을 확인해야 한다. 이번에는 유료 신청·결제·인증 호출·운영 리소스 생성을 하지 않았다.

## 종료 상태

Phase 1 커밋 이후 변경은 변수명 템플릿과 이 안내 문서뿐이며 미커밋 상태로 남긴다. 기존 [Phase 1 보고서](phase1-report.md)의 “미커밋” 표기는 당시 완료 시점의 기록으로, 현재 보존 상태는 위 커밋이 기준이다.

**Phase 2B 진행은 보류한다.** 인증키 준비 후 별도 명령으로 Phase 2A 실제 호출 검증을 먼저 완료해야 한다. 원격 push, 운영 배포, DNS 변경, 기존 백업 브랜치 변경은 하지 않았다.
