# Phase 2E 재개 결과 — BLOCKED

확인일: 2026-10-19. 운영 배포 전 접근 제어와 요금제 확인에서 중단했다. 아래 구현 및 테스트는 **로컬 결과**이며, 운영 적용 완료를 의미하지 않는다. 이전 `PHASE2E_REPORT.md`, `PRODUCTION_PLAN.md`는 당시 조사 기록으로 보존했다.

## Git 및 복구

- 저장소: `Kyoungrae-Noh/prismkit`, 현재 브랜치 `rebuild/phase0`.
- Phase 2D 커밋 `eb089de` 확인. 기존 119개 테스트를 삭제하거나 제외하지 않았다.
- `git fetch origin main` 이후 원격 전용 커밋 0개, 로컬 전용 커밋 5개였으며 원격 main은 로컬 HEAD의 조상이다. 배포 재개 직전에 다시 확인해야 한다.
- 기존 색상 도구 커밋: `836d455444bac1891936d5836012966d1e4c35d9`.
- 백업 브랜치 `backup/prismkit-pre-phase0-20261019` 유지.
- 기존 운영 배포: `f8a20d5f-4331-48d5-94b5-b9246d0917b0`. 롤백 대상 식별만 했으며 실제 롤백 실행은 하지 않았다.
- 원격 push, 배포, DNS 변경, Cloudflare 설정 변경은 하지 않았다.

## Cloudflare 확인 결과

| 항목                          | 실제 확인                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------ |
| 기존 Pages                    | `prismkit-git`, GitHub 저장소 일치, 운영 브랜치 `main`                         |
| 기존 빌드 설정                | build command / output / root가 비어 있는 기존 정적 사이트 설정                |
| 사용자 지정 도메인            | `prismkit.online`, Pages 도메인 상태 active                                    |
| 운영·미리보기 env_vars        | 모두 비어 있음. 검색광고 운영 Secrets 미등록                                   |
| Git 미리보기                  | 모든 브랜치 허용 상태                                                          |
| Functions 한도 소진 동작      | 운영·미리보기 `fail_open: true`; 신규 서비스 배포 전 false로 변경 및 확인 필요 |
| 비로그인 운영 도메인          | HTTP 302, Cloudflare Access 로그인 호스트로 이동                               |
| `prismkit-git.pages.dev`      | HTTP 200, 기존 사이트 공개                                                     |
| 기존 배포 고유 URL            | HTTP 200, 기존 사이트 공개                                                     |
| `main.prismkit-git.pages.dev` | HTTP 404                                                                       |
| Access 정책 조회              | 계정 앱 목록은 200이지만 앱 0개, zone 앱 조회 403 (10000)                      |
| Access 조직 / 구독 조회       | 403. 실제 Workers 요금제 미확인                                                |

운영 도메인의 로그인 리다이렉트만으로 관리자 한 명의 Allow 정책, Everyone 부재, 다른 이메일 차단, 실제 앱 audience를 검증했다고 판단하지 않았다. 사용자가 보고한 관리자 로그인 성공과 이번 도구에서 직접 검증한 결과를 구분한다. 기존 Access 정책을 변경하지 않았다.

현재 공개 경로에는 **기존 색상 도구**가 표시된다. 신규 업무 도구를 배포하기 전에 기존 배포 고유 URL까지 포함한 pages.dev 보호를 확인해야 한다. 새 코드의 호스트 차단만으로 옛 배포까지 보호되지는 않는다.

## 로컬 운영 아키텍처

`브라우저 → Access → Pages 전역 middleware → SQLite Durable Object Worker → 검색광고 GET /keywordstool`

- 기존 Vite UI와 Provider 계약을 유지했다. Pages가 로컬 Node 서버를 실행한다고 가정하지 않는다.
- `functions/_middleware.ts`가 모든 정적 파일과 API 요청을 보호한다. `public/_routes.json`은 모든 경로를 포함하고 제외 경로를 두지 않는다.
- 허용 호스트는 HTTPS `prismkit.online` 하나다. pages.dev, 미리보기, 다른 사용자 지정 도메인은 JWT가 있어도 거부한다.
- `jose`로 Access JWT의 RS256 서명, issuer, audience, 만료, 필수 claim, 앱 토큰 유형, 승인 이메일 일치를 검증한다. 미설정·검증 실패는 차단한다.
- API는 인증된 같은 origin의 명시적 조회 GET만 허용한다. 사용자 정의 헤더는 인증 대체 수단이 아니다. 위조 헤더만으로 접근할 수 없다.
- API가 아닌 `/`, `/keywords`, `/publishing`은 인증 후 기존 SPA로 전달한다. API 오류가 SPA HTML로 우회하지 않도록 했다.
- 검색광고 HMAC 서명·응답 정규화는 기존 서버 모듈을 재사용한다. 인증값을 응답이나 로그로 반환하지 않는다.
- Worker 공개 routes가 없고 `workers_dev`, `preview_urls`를 비활성화했다. Worker HTTP fetch도 403을 반환한다. Pages의 서버 바인딩으로만 DO RPC를 사용한다.
- 캐시·호출 예산은 계정별 고정 DO 하나의 SQLite에 저장한다. 단순 메모리 Map이나 KV로 전역 제한을 가정하지 않는다.
- 5분 캐시, 최소 10초, 동시 요청 예약, **운영 총 10회** 예산을 적용한다. 재시작·재배포·시간 경과로 자동 초기화하지 않는다. 예산 재설정 UI/API는 제공하지 않는다. 10회 소진 후에는 관리자 운영 절차를 별도로 확정해야 한다.
- upstream 401/403/429 이후 영속 차단, 자동 재시도 없음. 요청 10초 timeout, 응답 1MiB 제한, 안전한 오류 메시지, no-store 및 CSP를 적용했다.
- workerd에서는 fetch `redirect: 'error'`를 지원하지 않는 것을 실제 런타임 테스트에서 확인했다. `manual`로 받고 3xx를 실패 처리하여 인증 헤더가 다른 호스트로 전달되지 않게 수정했다.

## Secrets와 배포 설정

- 로컬 `.env`의 검색광고 인증 변수 3개 존재 확인. 값은 출력하지 않았다.
- `.env`, `.env.cloudflare`, `.dev.vars*`는 Git 제외. 추적되는 환경 파일은 빈 변수 이름만 있는 `.env.example`이다.
- 검색광고 변수 3개는 향후 **별도 Worker의 Secrets**에 등록한다. Pages에는 `ADMIN_EMAIL` Secret과 공개 설정 `ACCESS_ISSUER`, `ACCESS_AUD`가 필요하다.
- 현재 `wrangler.jsonc`의 issuer/audience는 고의로 비워 두었다. 실제 Access 앱을 확인하기 전에는 채우거나 배포하지 않는다.
- Vite 브라우저 import 경계에 `server/`, `edge/`, `worker/`, `functions/`를 포함했다. 모든 VITE_ 환경변수를 거부하는 기존 방식을 유지했다.
- 실제 로컬 API Key·Secret Key·Customer ID와 시험용 canary가 클라이언트 빌드에 없는지 검사했다. VITE_ 비밀값 주입 시 빌드가 실패하는 것도 확인했다.

## 테스트

| 검증                                  | 결과                                        |
| ------------------------------------- | ------------------------------------------- |
| 기존 프런트엔드 단위 테스트           | 72 통과                                     |
| 기존 로컬 API 테스트                  | 17 통과                                     |
| 기존 브라우저 테스트                  | 30 통과 (설치된 Chrome, 1440 / 390 / 320px) |
| 신규 JWT·호스트·API·캐시·제한 테스트  | 23 통과                                     |
| 신규 workerd 실제 런타임 테스트       | 2 통과                                      |
| 합계                                  | **144 통과 = 기존 119 + 신규 25**           |
| 프런트엔드·서버리스 타입 검사         | 통과                                        |
| Vite 프로덕션 빌드                    | 통과                                        |
| Worker dry-run / Pages Functions 빌드 | 통과, 업로드 없음                           |
| 비밀값 빌드 노출 검사                 | 통과                                        |
| 실제 운영 관리자 로그인 / LIVE 조회   | 미실시                                      |

런타임 테스트는 실제 workerd에서 RPC, SQLite 캐시·호출 간격의 프로세스 재시작 후 보존, 직접 HTTP 차단을 검사한다. Pages 번들을 실행하여 실제 암호 서명한 모의 JWT와 모의 JWKS로 화면·자산·API 보호 및 SPA 전달을 검사한다. 네이버 및 인증 서버의 실제 데이터는 호출하지 않는다.

처음 브라우저 테스트는 Playwright 전용 브라우저 미설치로 시작하지 못했다. 설치된 Chrome으로 동일 테스트를 다시 실행했다. 실패 테스트를 삭제하거나 건너뛰지 않았다.

## 기존 데이터와 화면

기존 브라우저 저장 스키마와 키를 변경하지 않았다. 글감 CRUD, 수동 키워드, 515개 모의 LIVE 자료 필터링·후보 저장, 경쟁 분석·캡처 추가/삭제, 3개 계정 이력, 중복 경고, 경쟁/발행 JSON 가져오기·내보내기, 새로고침 유지 흐름은 기존 테스트로 검증했다. 색상 도구 저장값을 삭제하지 않았다.

브라우저 데이터는 기기·origin 간 자동 동기화되지 않는다. localhost 자료는 운영 도메인으로 자동 이전되지 않는다. 기존 JSON 가져오기 범위는 경쟁/발행 자료이며 글감·후보 전체 복원은 제공하지 않는다. 이번 작업에서 데이터 이전 완료로 표시하지 않는다.

## 재개에 필요한 사용자 조치와 남은 작업

1. **Workers 실제 요금제 확인**: Zero Trust Free와 Workers Free는 별개다. Workers Free 여부 확인 전 리소스를 생성하지 않는다.
2. **Access 조회 권한**: 해당 계정 및 zone에 Access: Apps and Policies Read 권한이 있는 토큰을 Git 제외 `.env.cloudflare`에 `CLOUDFLARE_API_TOKEN`으로 저장하고 준비되었다고 알려준다. 토큰·관리자 이메일·인증 토큰을 채팅이나 로그로 출력하지 않는다. 새 토큰은 정책 조회에만 사용하고, 기존 배포 OAuth와 분리할 수 있다.
3. 실제 정책을 조회하여 관리자 한 명, 앱 issuer/audience, 광범위 Allow 부재를 검증한다. pages.dev 루트 및 모든 기존·신규 고유/브랜치 URL에 대한 보호와 필요한 변경 권한도 확인한다. Pages 기본 미리보기 보호만으로 production pages.dev까지 보호됐다고 가정하지 않는다.
4. 필요한 안전장치가 확인되면 fail-closed, Pages build `npm run build` / output `dist`, 불필요한 미리보기 차단, Worker 및 Secrets·바인딩을 설정한다. 설정 전 백업과 변경 후 read-back 검증을 수행한다.
5. 원격 변경 재확인 후 정상 push 및 기존 Pages 배포. 강제 push, 프로젝트 삭제, 불필요한 DNS 변경 금지.
6. 관리자 실제 로그인, 비관리자 차단, 모든 우회 경로, 화면 저장·새로고침, 최소 1회 실제 검색량 조회를 검증해야 DEPLOYED로 전환할 수 있다.

현재 운영 Secrets 등록, Worker/Pages 배포, GitHub push, 실제 운영 네이버 API 호출 횟수는 **모두 0**이다. 운영 실패나 신규 코드 노출은 발생하지 않았으며 기존 배포를 유지했다.

## 공식 근거

- [Durable Objects 요금](https://developers.cloudflare.com/durable-objects/platform/pricing/): SQLite DO는 Workers Free 지원, 무료 한도 초과 시 해당 작업 실패. Paid의 과금 가능성이 있으므로 계정 요금제 확인 필요.
- [Pages의 DO 바인딩](https://developers.cloudflare.com/pages/functions/bindings/#durable-objects): 별도 Worker에서 DO를 배포한 뒤 Pages에 바인딩.
- [Access JWT 검증](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/): 서버에서 서명과 앱 audience 등을 검증.
- [Pages 미리보기 보호](https://developers.cloudflare.com/pages/configuration/preview-deployments/): 미리보기 Access 기능과 보호 범위 확인.
- [Pages Functions 라우팅](https://developers.cloudflare.com/pages/functions/routing/): 전체 경로와 실패 시 차단 설정을 함께 검증.
