# Phase 2E 최종 결과: DEPLOYED

검증일: 2026-10-19. 운영 주소: https://prismkit.online

## 배포 및 보안

- 운영 커밋: `82c0a6c520bca7b82af67bafae7da12345595673`. GitHub `Kyoungrae-Noh/prismkit`의 `main`에 정상 push했다. Force push 없음.
- Pages: 기존 `prismkit-git`, 운영 배포 `ce13abbc-b1df-4d94-9e6c-1fd5f9f73f03`, 상태 success 및 canonical 확인.
- Worker: `prismkit-searchad`, 버전 `0cd0f759-0034-4123-8515-b67bcd62981c`. 공개 workers.dev 및 preview URL 비활성화, 공개 route 없음.
- 기존 Cloudflare 토큰이 active이며 변경된 Edit 권한으로 보호 앱 생성이 성공했다. 새 토큰은 요구하지 않았다. `.env.cloudflare`은 Git 제외, 토큰값 출력 없음.
- 기존 `Prismkit Admin` / `Prismkit Admin Only` 정책은 관리자 이메일 한 개만 Allow한다. Everyone·Bypass 없음. 기존 다른 Access 앱은 수정하지 않았다.
- 새 `Prismkit Pages Guard` 앱은 `prismkit-git.pages.dev`와 `*.prismkit-git.pages.dev`만 보호하며 같은 관리자 한 명만 허용한다.
- 최초 조사 14개 호스트와 배포 후 신규 주소를 포함한 총 16개 호스트의 화면/API 경로에서 비인증 요청이 Access 로그인으로 이동했다. 최종 HTTP 200은 앱 콘텐츠가 아닌 Cloudflare 로그인 페이지임을 확인했다.
- 운영·미리보기 모두 fail-closed. Git 브랜치 자동 미리보기 배포는 비활성화했다. DNS 변경과 유료 서비스 신청 없음. Workers Free / Zero Trust Free는 사용자가 확인한 계정을 사용했다.

## Secrets 및 API

- Worker의 secret_text 바인딩으로 `NAVER_SEARCHAD_API_KEY`, `NAVER_SEARCHAD_SECRET_KEY`, `NAVER_SEARCHAD_CUSTOMER_ID` 등록 확인.
- Pages에 `ADMIN_EMAIL` Secret, 확인된 issuer/audience와 DO 바인딩 적용.
- `CLOUDFLARE_API_TOKEN`은 런타임에 등록하지 않았다. 로컬 원본 `.env`를 유지했다.
- JWT 서명·issuer·audience·만료·승인 이메일 검증, 5분 영속 캐시, 10초 간격, 총 10회 영속 예산, 401/403/429 이후 자동 재시도 차단을 기존 코드로 유지했다.
- 실제 브라우저에서 관리자 인증 후 신규 앱의 HTTP 200 접근을 확인했다. 인증 없는 위조 JWT 요청은 Access에서 로그인으로 보냈다. 별도 비관리자 이메일의 OTP 발송/로그인 시도는 하지 않았으며, 다른 이메일 배제는 실제 정책과 JWT 음성 테스트로 확인했다.
- 인증 후 `/.env`는 404, API POST는 405, 외부 Origin API 요청은 403. 이 요청들은 네이버 호출 없이 거부됐다.
- 실제 배포 JS·CSS와 Git 대상 파일에서 로컬 검색광고 인증값 및 Cloudflare 관리 토큰이 없는지 확인했다.

## 네이버 실제 조회

관리자 브라우저의 조회 버튼으로 **1회** 수행했다. 자동 반복·실패 재시도 없음.

| 항목             | 실제 응답               |
| ---------------- | ----------------------- |
| 키워드           | 온누리상품권            |
| HTTP             | 200                     |
| PC 최근 30일     | 38,100                  |
| 모바일 최근 30일 | 152,400                 |
| 합계             | 190,500                 |
| 연관 키워드      | 514개                   |
| 전체 행          | 515개                   |
| 조회 시각        | 2026-10-19 22:01:12 KST |
| 캐시 응답 여부   | false                   |

검색광고 도구의 연관 키워드이며 네이버 검색창 자동완성 결과로 표시하지 않는다.

## 검증 결과

- 기존 **144개 전체 통과**: 프런트엔드 72 + 로컬 서버 17 + Edge 23 + workerd 2 + Chrome E2E 30.
- 프런트엔드 및 Edge 타입 검사, Vite 프로덕션 빌드, Worker dry-run, Pages Functions 빌드 통과.
- 실제 운영에서 `/`, `/keywords`, `/publishing` 및 새로고침 정상. 기존 색상 도구가 신규 업무 도구로 교체됨.
- 글감 생성·수정·삭제, LIVE 후보 저장·복원, 수동 경쟁 자료 저장, 3개 계정 표시와 계획 등록, 중복 경고, 발행 자료 JSON 왕복 확인.
- 390px / 320px 화면 가로 넘침 없음. 페이지 런타임 예외 없음.
- 검증 자료는 별도 검증용 Chrome 프로필의 브라우저 저장소에만 생성했다. 실제 발행 이력을 만들거나 네이버 글을 발행하지 않았다.

## 배포 중 처리한 문제

Git 파일 권한 제한으로 운영 설정 커밋이 처음 실패했는데 이전 준비 커밋 `1233537`이 먼저 push되어 배포되었다. 즉시 기존 정상 배포 `f8a20d5f-4331-48d5-94b5-b9246d0917b0`로 롤백하고 canonical 복구를 확인했다. 이후 실제 Git 커밋에 issuer/audience가 포함된 것을 확인한 `82c0a6c`를 정상 push하여 최종 배포했다. Access 보호는 전 과정에서 유지했다.

자산 검사에서는 모든 script URL이 같은 origin이라는 검증 가정 때문에 Cloudflare 자동 삽입 분석 비콘에서 멈췄다. Prismkit JS·CSS의 비밀값 부재를 확인하고, 외부 비콘은 기존 CSP `script-src 'self'`로 차단됨을 별도 확인했다. 보안 정책을 완화하지 않았다.

## 남은 제약과 복구

- 기능을 막는 미해결 배포 문제 없음. Cloudflare 자동 삽입 분석 비콘의 CSP 차단 메시지는 남을 수 있으며 분석 수집을 허용하지 않았다.
- 호출 예산은 총 10회이며 자동 초기화되지 않는다. 소진 시 별도 관리자 검토가 필요하다.
- 데이터는 브라우저·origin별 저장소다. localhost나 다른 기기의 자료가 자동 이전되지는 않는다. 기존 전체 글감·후보 JSON 복원 기능을 추가하지 않았다.
- 기존 색상 도구 백업 브랜치와 커밋 `836d455444bac1891936d5836012966d1e4c35d9`, 정상 배포 `f8a20d5f-4331-48d5-94b5-b9246d0917b0`를 보존했다.
- 이 최종 검증 보고서는 추가 배포를 발생시키지 않도록 로컬에 보존한다. 운영 코드와 설정은 원격 main에 반영되어 있다.

추가 Phase 기능 개발은 수행하지 않았다.
