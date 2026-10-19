# Prismkit 운영 구성

대상: `prismkit.online` / Pages `prismkit-git` / GitHub `Kyoungrae-Noh/prismkit`의 `main`.

## 접근 및 서버

- `Prismkit Admin` Access 앱이 운영 도메인을 보호한다. 허용 정책은 관리자 이메일 한 개다.
- 별도 `Prismkit Pages Guard` 앱은 `prismkit-git.pages.dev`, `*.prismkit-git.pages.dev`를 같은 관리자에게만 허용한다. 배포 고유 URL과 브랜치 주소도 포함한다.
- Pages middleware는 서명·issuer·audience·만료·관리자 이메일을 검증한다. 신규 코드의 pages.dev 호스트 요청은 인증되었어도 거부한다. 실제 사용은 운영 도메인으로 한다.
- Pages는 모든 경로에 Functions를 적용하고 운영·미리보기 모두 fail-closed로 설정한다. Git 미리보기 자동 배포는 비활성화한다.
- 검색광고 서버는 `prismkit-searchad` Worker의 SQLite Durable Object다. 공개 workers.dev, preview URL, route는 사용하지 않으며 Pages의 서버 바인딩만 연결한다.

## 비밀값

Worker Secrets: `NAVER_SEARCHAD_API_KEY`, `NAVER_SEARCHAD_SECRET_KEY`, `NAVER_SEARCHAD_CUSTOMER_ID`.

Pages Secret: `ADMIN_EMAIL`. 공개 설정: `ACCESS_ISSUER`, `ACCESS_AUD`, `NODE_VERSION`.

Cloudflare 관리 토큰은 Git 제외 `.env.cloudflare`에만 보관한다. 런타임 Secret이나 클라이언트 변수에 등록하지 않는다. CLI 호출 시 비밀값을 명령행 인자로 전달하거나 출력하지 않는다. 로컬 `.env`도 Git 제외이며 원격에 파일 자체를 올리지 않는다.

## 호출 제한

사용자 조회 버튼으로만 실행한다. 5분 캐시, 최소 10초 간격, 영속 **총 10회** 호출 예산을 적용한다. 재배포·재시작으로 초기화되지 않는다. 401/403/429 뒤에는 외부 호출을 차단하고 자동 재시도하지 않는다. 예산을 재설정하는 UI/API는 없으므로 소진 시 관리자 검토가 필요하다.

## 검증과 배포

```sh
PLAYWRIGHT_CHANNEL=chrome npm run check:all
```

144개 테스트, 타입·클라이언트 및 서버리스 빌드, 비밀정보 검사를 포함한다. Chrome이 없으면 Playwright Chromium을 준비하고 `PLAYWRIGHT_CHANNEL` 지정 없이 실행한다. 테스트는 모의 네이버 데이터와 모의 JWT를 사용한다.

Git push 전에 원격 main과 충돌 여부, Access 우회 보호, Secrets, 영속 제한, fail-closed를 확인한다. Pages 빌드는 `npm run build`, 출력 `dist`, Node 24다. Worker 코드 변경은 별도 Worker 배포가 필요하다. 로컬 Node API 서버는 운영에서 실행하지 않는다.

운영 검증 시 관리자 실제 로그인 후 화면·저장·새로고침 및 검색광고 실제 호출 1회를 확인한다. 브라우저 저장은 기기와 origin별이며 localhost의 자료는 자동 이전되지 않는다. 기존 색상 도구의 저장 데이터를 삭제하지 않는다.

## 복구

색상 도구 백업: `backup/prismkit-pre-phase0-20261019`, 커밋 `836d455444bac1891936d5836012966d1e4c35d9`.

기존 정상 Pages 배포 ID: `f8a20d5f-4331-48d5-94b5-b9246d0917b0`. 실패 시 추가 변경을 멈추고 이 배포로 복구한다. 배포 롤백은 Access 앱이나 프로젝트 설정을 되돌리지 않으므로 보호 상태를 별도로 확인한다. 인증을 해제하여 문제를 해결하지 않는다. 이전 조사 보고서는 당시 상태를 기록한 역사 자료다.
