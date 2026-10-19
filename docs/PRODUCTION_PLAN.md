# Prismkit 운영 구성 계획 (미구현 / 배포 차단)

2026-10-19. 현재 상태와 권한 차단은 [Phase 2E 조사 보고서](PHASE2E_REPORT.md)에 기록했다. 아래는 구현·검증할 설계이며 배포 가능한 코드가 아니다.

## 선택 방향

기존 `prismkit-git` Pages와 `prismkit.online` 연결을 재사용한다. 빌드는 `npm run build`, 출력은 `dist`. Pages Functions가 웹/API 인증 경계를 담당하고, 같은 origin의 `/api/searchad/keyword`를 기존 Provider 계약으로 유지한다. 로컬 Node HTTP 서버를 Pages가 실행한다고 가정하지 않는다. 검색광고 요청·서명·정규화는 서버에 한정한다.

5분 캐시 및 최소 10초 간격/최대 10회 호출 예산은 별도 SQLite Durable Object Worker의 영속 상태로 관리하는 방안을 우선한다. 이 Worker는 공개 route/workers.dev를 열지 않고 Pages 바인딩으로만 접근한다. 공식 문서상 Pages는 별도 Worker의 DO를 바인딩할 수 있으며 Pages 프로젝트 자체에서 DO를 배포하지 않는다. [Pages 바인딩](https://developers.cloudflare.com/pages/functions/bindings/)

SQLite DO는 Workers Free에서 지원하지만 이 계정의 실제 요금제는 아직 확인하지 못했다. 추가 비용 가능성을 확인하고 승인 없이 유료 활성화하지 않는다. [DO 요금](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## 인증 경계

- 사용자 지정 이메일 한 개에 대한 Access Allow 정책과 확인된 로그인 수단(OTP 또는 승인된 IdP).
- `prismkit.online` 전체 경로와 `prismkit-git.pages.dev`, 모든 미리보기 주소의 보호/차단을 함께 검증. 도메인 하나만 보호해 Pages 주소가 우회 경로가 되지 않게 한다.
- Pages 전역 middleware에서 JWT 서명·issuer·audience·만료·승인 이메일을 검증한 후 정적 파일/API로 전달. 클라이언트가 보내는 이메일 헤더만 신뢰하지 않는다.
- 보호 설정이 없거나 JWT 검증이 실패하면 인증 필요 또는 서비스 준비 안 됨을 반환. 예외 시 정적 파일로 통과시키지 않는다.
- 모든 경로를 Functions 경계에 포함할 경우 `_routes.json` 제외 목록 없이 설정하고, 무료 한도 소진 시 **Fail closed**를 실제 프로젝트에서 확인한다. Access 또한 별도 외곽 경계로 유지한다.
- Git 자동 미리보기 배포를 만들기 전에 미리보기 차단과 fail-closed 구성을 확인한다. 현재 모든 브랜치 미리보기가 켜져 있어 먼저 push하지 않는다.

[JWT 검증](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Pages 라우팅/Fail closed](https://developers.cloudflare.com/pages/functions/routing/), [Pages 미리보기 Access 제약](https://developers.cloudflare.com/pages/platform/known-issues/).

## API 및 영속 호출 제한

- 세 검색광고 변수는 서명·호출을 수행하는 서버의 Secrets에만 저장한다. 값은 stdin 등 비노출 경로로 등록하고 명령행 인자/로그/클라이언트 산출물/응답에 포함하지 않는다.
- 동일 origin GET, 고정 경로, 사용자 버튼의 `X-Prismkit-Request`, Host/Origin 및 인증 검증. 외부 origin에 CORS 허용하지 않는다. OPTIONS/잘못된 method로 인증을 우회하지 못하게 한다.
- 단일 계정에 고정된 DO ID를 사용해 전 세계 요청을 같은 제한 상태로 직렬화한다. 메모리 Map, CDN Cache, KV eventual consistency만으로 전역 횟수를 보장하지 않는다.
- 외부 호출 예약 전에 영속 트랜잭션에서 `lastCallAt`, `callsUsed`, 회로 차단 여부를 확인·기록한다. 동시 호출/재시작/재배포로 예산이 초기화되지 않도록 한다.
- 로컬의 프로세스당 10회는 운영에서 **관리자가 명시적으로 재설정할 때까지 총 10회**의 보수적 예산으로 대응하는 안이다. 시간 경과나 재배포에 따른 자동 리셋은 하지 않는다. 리셋 경로와 운영 절차도 인증/테스트 대상이다.
- 성공 응답만 5분 보관. `<10`과 누락은 그대로 유지하고 기존 SearchAdResponse 형태를 반환한다.
- upstream 401/403/429는 영속 회로를 차단하고 재시도하지 않는다. 시간 제한과 응답 크기 제한, 고정 오류 메시지, `Cache-Control: no-store`를 적용한다. 네이버 원시 오류나 헤더는 노출하지 않는다.
- 캐시 적중/한도 초과/동시성/재시작 후 상태/인증 실패/429를 모의 응답으로 검증하고, 운영 실제 호출은 관리자 인증 후 최소 1회로 제한한다.

## 배포 순서와 복구

1. 관리자 이메일·Access 조직·요금제·권한을 확정한다.
2. 인증/DO API/배포 설정을 로컬 구현하고 기존 119개 및 새 보안·상태 영속 테스트를 통과시킨다.
3. 기존 배포 ID·도메인·빌드/환경·라우팅 설정을 비밀값 없이 보존한다. 기존 main/백업과 현재 로컬 작업을 유지한다.
4. 보호된 환경에만 서버 리소스/Secrets를 설정하고 Pages 전체/미리보기 인증 및 fail-closed를 검증한다. 신규 유료 서비스는 활성화하지 않는다.
5. 인증 없는 `/`, `/keywords`, `/publishing`, `/api/searchad/keyword`, 정적 자산 및 우회 호스트 차단을 검증한다. 안전하게 보호된 미리보기에서 관리자 로그인과 화면/저장/JSON/API 흐름을 검증한다.
6. 조건 충족 후에만 Prismkit 원격 push와 기존 Pages 운영 배포를 수행한다. 필요 이상의 DNS 변경이나 프로젝트 삭제/생성은 하지 않는다.
7. 관리자 직접 로그인, 최소 실제 검색량 요청, 콘솔/반응형/새로고침/저장 검증을 완료해야 DEPLOYED로 보고한다.
8. 실패 시 추가 변경을 멈추고 이전 성공 배포 `f8a20d5f-4331-48d5-94b5-b9246d0917b0`로의 롤백 가능성을 확인한다. 코드 롤백과 별개로 Access 정책/Secrets/바인딩/빌드 설정 복구가 필요한지 검토한다. 보호 해제는 비공개 업무 도구가 더 이상 노출되지 않음을 확인한 뒤에만 검토한다.

## 데이터와 origin

기존 `prismkit.*.v1` 키를 그대로 사용하고 운영 브라우저의 기존 값을 삭제하지 않는다. localStorage는 origin·브라우저별이며 localhost 데이터가 운영으로 자동 이동하지 않는다. 현재 JSON 복원 범위는 경쟁/발행 자료이며 전체 글감·후보의 기기 이전을 완료한 것으로 표시하지 않는다. 운영 사용 시작 전에 사용자 백업/이전 범위를 확인한다.
