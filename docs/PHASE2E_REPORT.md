# Phase 2E 운영 배포 조사 결과 — BLOCKED

확인일: 2026-10-19. 작업 경로 `/Users/kkr/website/prismkit.online`, 브랜치 `rebuild/phase0`.

**신규 업무 도구를 배포하지 않았다.** 관리자 이메일·Access 조직 접근·요금제 확인이 부족하여 사용자가 지정한 배포 전 중단 조건에 따라 멈췄다. 기존 공개 색상 도구는 유지 중이며, 신규 관리자 화면이 운영에 안전하게 배포되었다고 주장하지 않는다.

## 1. Phase 2D 보존과 검사

- 로컬 커밋: `eb089de` — `Preserve Phase 2D manual competition and publication decisions`.
- 기존 119개 모두 재실행 통과: Vitest 72 + 서버 모의 테스트 17 + Playwright 30(1440/390/320px).
- `npm run check`, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`, `npm run test:secrets`, `git diff --check` 통과.
- Git 추적/추적 예정 파일의 실제 로컬 검색광고 인증값 검사: 일치 0건. 클라이언트 산출물 내 실제 API/Secret Key 및 테스트 키 부재, `VITE_` 비밀 변수 빌드 차단 확인.
- 로컬 검색광고 변수 3개 존재. 비밀값 미출력. `.env`는 무시되며 추적되지 않는다.
- 백업 브랜치 `backup/prismkit-pre-phase0-20261019`와 커밋 `836d455444bac1891936d5836012966d1e4c35d9` 유지. 이 커밋은 현재 운영 배포의 소스 커밋과 일치한다.

## 2. Cloudflare 실제 확인 결과

Wrangler 4.105.0의 기존 OAuth 로그인으로 조회했다. 인증값·전체 환경변수 응답·로그인 쿠키는 저장하거나 출력하지 않았다.

| 항목 | 실제 확인 결과 |
| --- | --- |
| 운영 Pages 프로젝트 | **prismkit-git**. 별도 `prismkit` 프로젝트와 혼동하지 않음 |
| GitHub 연결 | `Kyoungrae-Noh/prismkit` |
| 운영 브랜치 | `main` |
| 자동 배포 | 운영 배포 활성. 모든 브랜치 미리보기 활성(`preview_deployment_setting=all`) |
| 기존 빌드 명령/출력/루트 | 모두 빈 문자열(기존 정적 색상 도구 설정) |
| 연결 도메인 | `prismkit.online`, `prismkit-git.pages.dev` |
| 도메인 상태 | Pages domain status/verification/validation 모두 `active` |
| Zone 상태 | `active`; 네임서버 `mona.ns.cloudflare.com`, `rick.ns.cloudflare.com` |
| DNS 레코드 세부 조회 | HTTP 403 / 오류 10000. CNAME 등 상세 레코드는 확인 못함 |
| Pages 환경변수 | production 및 preview 모두 등록 변수 없음. 값을 출력하지 않고 이름/타입만 조회 |
| Pages/Workers 권한 | OAuth에 Pages write, Workers write 권한 표시. Pages 조회·Workers account-settings 조회 HTTP 200. 실제 배포 권한 행사는 미실시 |
| Access 앱 조회 | HTTP 200, 계정 전체 앱 0개(`total_count=0`) |
| Access 조직 조회 | **HTTP 403 / 오류 10000 Authentication error**. 조직 부재라고 단정하지 않음 |
| Workers 설정 | `default_usage_model=standard`. 이 값만으로 가입 요금제/추가 비용을 확정하지 않음 |
| 구독 조회 | **HTTP 403 / 오류 10000**. Workers/Zero Trust 무료 범위 적용 확인 불가 |
| 관리자 이메일 | 사용자 확인 대기. Cloudflare 로그인 이메일을 관리자로 자동 지정하지 않음 |

현재 정상 운영 배포:

- 배포 ID: `f8a20d5f-4331-48d5-94b5-b9246d0917b0`
- 배포 URL: `https://f8a20d5f.prismkit-git.pages.dev`
- 생성: `2026-08-18T10:10:29.390914Z`
- 상태: deploy success
- 소스: `836d455444bac1891936d5836012966d1e4c35d9`

## 3. 배포 전 설계와 중단 범위

[운영 구성 계획](PRODUCTION_PLAN.md)에 기존 Pages 재사용, Access와 서버 JWT 검증, Pages Functions 및 별도 SQLite Durable Object 기반 API/호출 제한안을 정리했다. **설계안이며 구현·배포 완료가 아니다.** 계정 요금제와 Access 전제조건을 확인한 뒤 확정한다.

현재 `server/index.ts`는 로컬 Node 서버이므로 Pages 정적 배포만으로 LIVE API가 실행되지 않는다. 인메모리 캐시/횟수 제한을 서버리스 운영에 그대로 사용하지 않는다.

## 4. 데이터 보존

기존 저장 키를 변경하지 않았다:

- `prismkit.workspace.v1`
- `prismkit.keyword-research.v1`
- `prismkit.candidates.v1`
- `prismkit.publishing.v1`

새로고침·글감 CRUD·후보·경쟁 자료/캡처·3개 계정 이력·JSON 가져오기/내보내기 테스트 통과. 원본 색상 도구 백업의 JS/HTML에서 localStorage 참조는 발견하지 못했지만 사용자의 운영 브라우저 저장값을 직접 열거나 삭제하지 않았다.

**localhost와 https://prismkit.online은 서로 다른 origin**이므로 로컬 개발 브라우저 데이터가 배포 후 자동 이전되지 않는다. 기기/브라우저 간 동기화도 없다. 현재 후보 JSON 가져오기와 전체 글감/후보 일괄 복원은 미구현이다. 경쟁·발행 JSON만 가져올 경우 후보 ID가 없는 분석은 원본을 보존하지만 자동 연결되지 않는다. 따라서 기존 로컬 브라우저 데이터를 유지하고 내보내기 가능한 자료를 먼저 백업해야 한다. 이번 작업에서 데이터나 저장소를 초기화하지 않았다.

## 5. 운영 URL 읽기 전용 확인

인증/쿠키 없이 HTTPS GET(리다이렉트 자동 추적 없음)으로 조회했다.

| 경로 | HTTP | 현재 화면 제목 | Access 로그인 리다이렉트 |
| --- | --- | --- | --- |
| `/` | 200 | Prism Kit — Free Color Tools for Designers & Developers | 없음 |
| `/keywords` | 200 | 동일 기존 색상 도구 제목 | 없음 |
| `/publishing` | 200 | 동일 기존 색상 도구 제목 | 없음 |

새 업무 도구 화면, 관리자 로그인 성공, 운영 LIVE API, 운영 브라우저 콘솔/저장 흐름은 검증하지 않았다. 현재의 HTTP 200을 신규 배포 성공으로 계산하지 않는다. 실제 네이버 API 호출은 **0회**다.

## 6. 완료 보고 항목

| 항목 | 결과 |
| --- | --- |
| Phase 2D 로컬 커밋 | `eb089de` 완료 |
| 기존 Cloudflare 프로젝트 | `prismkit-git` 확인 |
| 배포 아키텍처 | 기존 Pages + Access + 서버 측 JWT + Functions/SQLite DO 설계안, 미구현 |
| 서버 API 배포 | 미실시 |
| 운영 비밀값 등록 | 미실시. 로컬 3개 변수는 보존 |
| 관리자 인증 | 미적용. 관리자 이메일/조직 권한 필요 |
| GitHub push | 미실시. 현재 자동 미리보기 공개 배포 위험을 피하기 위해 보류 |
| Pages 신규 배포 | 미실시. 기존 색상 사이트 유지 |
| 운영 URL 검증 | 기존 색상 도구 HTTP 200만 확인 |
| 네이버 실제 호출 | 0회 |
| 테스트/빌드 | 기존 119개, 타입 검사, 프로덕션 빌드, 비밀정보 검사 통과 |
| 최종 상태 | **BLOCKED — 인증·권한·요금제 확인 부족** |

## 7. 사용자가 준비할 사항

1. Prismkit 접속을 허용할 **정확한 관리자 이메일**.
2. Zero Trust 팀 도메인(`...cloudflareaccess.com`)과 현재 **Workers/Zero Trust 요금제**. 무료 사용이 확인되기 전 유료 플랜이나 추가 사용량 과금을 활성화하지 않는다.
3. Access 조직/IdP 설정을 확인하고 구성할 권한. 필요한 경우 현재 계정으로 범위를 제한한 API 토큰을 로컬의 Git 무시 파일 `.env.cloudflare`에 `CLOUDFLARE_API_TOKEN`으로 안전하게 등록한다. 토큰/OTP/네이버 키를 채팅이나 Git에 넣지 않는다.
   - Access: Apps and Policies Edit
   - Access: Organizations, Identity Providers, and Groups Edit
   - DNS 상세 확인이 필요하면 prismkit.online Zone에 한정한 DNS Read
   - 나머지 Pages/Workers 작업은 기존 OAuth 권한과 실제 계정 상태를 재검증한다. 새 토큰에 불필요한 타 프로젝트 권한을 추가하지 않는다.
4. 무료 범위에서 조직/OTP를 설정할 수 없거나 과금이 필요하면 별도 승인 전 중단한다. 관리자 본인 로그인은 최종 운영 검증 때 직접 수행해야 한다.

권한 이름은 [Cloudflare 공식 권한 목록](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)을 기준으로 한다. [조직 시작 안내](https://developers.cloudflare.com/cloudflare-one/setup/), [OTP 안내](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)를 참고한다. 대시보드에서 직접 설정하는 경우에는 팀 도메인과 적용한 Prismkit 앱 정보만 공유하고 비밀값은 공유하지 않는다.

추가 원격 변경·push·배포·Secrets 등록·DNS 수정·플랜 변경을 수행하지 않았다. 스킬이 별도 승인 절차를 강제한 것이 아니라, 사용자가 정한 관리자 정보/안전한 인증/비용 확인 전 중단 조건을 적용했다.
