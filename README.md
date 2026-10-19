# Prismkit

키워드 탐색과 콘텐츠 기획을 위한 개인 워크스페이스. 기존 색상 도구 서비스를 전면 교체한 **Phase 1 데이터 소스 검증·수동 분석 프로토타입**입니다.

## 실행

Node.js 22.12 이상이 필요하며 `.nvmrc`는 Node.js 24 LTS를 지정합니다.

```sh
npm ci
npm run dev
```

기본 주소: `http://127.0.0.1:5173`. API 키 없이 실행됩니다.

```sh
npm run check        # TypeScript + 단위/통합 테스트 + 프로덕션 빌드
npm run preview      # dist 로컬 미리보기
npm run test:secrets # 서버 키 빌드 제외 및 VITE_ 키 주입 차단 검사
npm run test:watch
npm run format
```

브라우저 검증:

```sh
npx playwright install chromium
npm run test:e2e
```

이미 설치된 Google Chrome을 사용할 경우 브라우저 다운로드 없이 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`를 실행할 수 있습니다. 테스트가 로컬 서버를 실행하고 종료합니다. 1440px, 390px, 320px 화면과 브라우저 저장·새로고침 흐름을 검사하고 `test-results/`에 화면 캡처를 남깁니다.

## 구현 범위

| 화면           | 동작                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `/`            | 글감 현황, 샘플 관심도 차트, 키워드 기회, 최근 글감                       |
| `/ideas`       | 추가·수정·삭제, 제목·키워드·메모 검색, 카테고리·상태 필터, 목록·보드 보기 |
| `/keywords`    | DEMO 탐색 + 수동 키워드·관련어·검색량·출처·확인 날짜 저장/수정, 결측 표시 |
| `/connections` | 공식 소스 DOCUMENTED/UNVERIFIED 상태, 인증 미실시 안내, 로컬 저장 상태    |

수동 자료는 키워드 분석 화면의 **나의 키워드 자료 → 수동 자료 추가**에서 기록합니다. 필수 항목은 핵심 키워드·데이터 출처·확인 날짜입니다. 수치는 비워둘 수 있고 검색량은 `<10`도 보존합니다. 수동 자료는 `prismkit.keyword-research.v1`에 MANUAL·UNVERIFIED로 저장하며 DEMO와 섞지 않습니다. 경쟁 분석은 근거 부족으로 보류, 추세는 확인 불가로 표시합니다.

초기 샘플은 글감 8개, 키워드 10개입니다. 검색량·관심도·점수는 모두 예시이며 실제 데이터가 아닙니다. 글감은 브라우저 `localStorage`의 `prismkit.workspace.v1`에 저장됩니다. 사이트 주소/포트 또는 브라우저가 다르면 별도 저장소이며 기기 간 동기화되지 않습니다.

실제 수집, AI 분석·생성, 콘텐츠 발행, 로그인, 서버 저장, API 자격증명 등록, 운영 배포는 구현 범위에 포함되지 않습니다. 브라우저 데이터 삭제 시 로컬 글감과 수동 키워드 자료도 삭제됩니다. 실제 API 호출은 0건이며, 인증 키가 없어 외부 연결은 비활성입니다.

## 구조

```text
src/
  app/           # 라우트, 공통 프레임, 워크스페이스 상태
  components/    # 다이얼로그, 입력 폼, 상태 표시, 차트
  domain/        # 모델, 입력 검증, 데이터·분석·생성 인터페이스
  data/          # 샘플과 로컬 저장 어댑터
  providers/     # 4개 공급자 계약, 수동 어댑터, 소스 검증 상태
  pages/         # 대시보드, 글감, 키워드, 데이터 연결
  test/          # 테스트 환경
server/         # 향후 서버 API·비밀키 경계 설계 문서 (실행 코드 없음)
scripts/        # 클라이언트 비밀키 경계 검사
tests/e2e/       # 실제 브라우저 흐름 및 반응형 검증
public/         # 새 정적 자산, 향후 Pages용 헤더와 라우트 폴백
ops/legacy/     # 기존 배포 관련 파일 보존본, 새 빌드에 포함되지 않음
docs/           # 구축 결과, 아키텍처와 복구 안내
```

[요구사항](docs/SRS.md) · [데이터 소스 감사](docs/DATA_SOURCE_AUDIT.md) · [경쟁 평가](docs/COMPETITION_SCORING.md) · [Phase 1 결과](docs/phase1-report.md) · [서버 설계](server/README.md)

[Phase 0 아키텍처](docs/architecture.md) · [Phase 0 결과 및 기존 환경 조사](docs/phase0-report.md)

## 기존 서비스 복구 지점

- 백업 브랜치: `backup/prismkit-pre-phase0-20261019`
- 기존 커밋: `836d455444bac1891936d5836012966d1e4c35d9`
- Phase 0 보존 커밋: `1dd358953b018c1ffabf436f06d4195d1e47cac3`
- 새 작업 브랜치: `rebuild/phase0`
- 기존 `main`과 원격 저장소는 변경하지 않았습니다.

원본 확인은 `git show backup/prismkit-pre-phase0-20261019:index.html`로 가능합니다. 복구 전 새 작업을 로컬 커밋하거나 `git stash push --include-untracked`로 보관한 뒤 백업 브랜치로 전환하세요. 무시되는 `.env` 파일은 Git에 넣지 말고 별도로 보존해야 합니다. 실제 파일 복구나 운영 배포는 이번 작업에서 실행하지 않았습니다.

## 환경변수와 배포

Phase 1 로컬 실행에 필요한 환경변수는 없습니다. `.env.example`만 추적하며 `.env*`, `.dev.vars*`, 비밀 키 파일과 `.wrangler/`는 무시합니다. `VITE_*` 값은 프런트엔드 노출 위험이 있어 현재 Vite 설정에서 전부 거부합니다. 향후 서버 키 이름과 인증 방식은 서버 설계를 참고하세요. 키를 이 README나 클라이언트에 입력하지 마세요.

향후 Cloudflare Pages 빌드 명령은 `npm run build`, 결과 폴더는 `dist`입니다. [Cloudflare 공식 빌드 설정](https://developers.cloudflare.com/pages/configuration/build-configuration/)에 따른 로컬 준비만 했으며, 기존 Pages 프로젝트의 원격 빌드 설정·도메인·환경변수는 변경하지 않았습니다. 저장소에는 배포 명령이나 배포 CI가 없습니다.

현재 로그인과 접근 제어가 없는 로컬 프로토타입입니다. 실제 운영 관리자 시스템으로 배포하기 전 다음 Phase에서 인증·권한·서버 저장을 설계해야 합니다. `noindex` 설정은 검색 노출 제한이며 접근 제어가 아닙니다.
