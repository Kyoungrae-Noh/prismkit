# Phase 1 완료 보고

작업일: 2026-10-19. 경로: `/Users/kkr/website/prismkit.online`. 브랜치: `rebuild/phase0`.

## 1. Phase 0 보존

변경사항·구조·비밀 파일 추적을 확인한 뒤 타입 검사, 단위/통합 14개, 브라우저 6개 및 빌드를 재실행하여 통과했다. 다음 로컬 커밋으로 보존했다.

- `1dd358953b018c1ffabf436f06d4195d1e47cac3` — `Preserve Prismkit Phase 0 workspace before data source integration`
- 기존 백업 `backup/prismkit-pre-phase0-20261019`는 `836d455444bac1891936d5836012966d1e4c35d9` 그대로다.
- 실제 `.env*`/`.dev.vars*` 비밀 파일 및 네이버 관련 환경변수는 발견되지 않았다. 추적된 비밀 파일은 없고 `.env.example`은 설명만 포함한다.
- Phase 1 변경은 검토할 수 있도록 작업 트리에 남겨 두었다. Phase 0 커밋 이후 추가 커밋·원격 push는 하지 않았다.

## 2~5. 조사한 데이터 소스와 연결 가능성

| 질문                                                      | 확인 결과                                                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1. 월간 PC·모바일 검색량을 실제로 가져올 수 있는가?      | 공식 SearchAd `/keywordstool`이 최근 30일 PC·모바일 검색수를 제공한다. 낮은 값은 `<10`. 기능은 DOCUMENTED지만 인증 키가 없어 실제 호출 성공은 미확인이다.                                                           |
| Q2. 자동완성·연관검색어를 안정적으로 확보할 수 있는가?    | 검색화면 자동완성/연관검색어의 공개 공식 API와 자동 수집 허용을 확인하지 못했다. 안정적 자동 확보를 보장할 수 없어 수동 붙여넣기를 구현했다. SearchAd 연관 광고 키워드는 별도 공식 데이터다.                        |
| Q3. 블로그 결과 수와 경쟁 게시물 정보를 확보할 수 있는가? | 공식 블로그 검색 API에 total·제목·URL·발행일·요약이 문서화되어 있다. 인증 호출은 미실시다. total은 전체 문서 수, API 순서는 통합검색 순위와 동일시하지 않는다. 본문 품질 분석은 별도 근거가 필요하다.               |
| Q4. 인증 정보 없이 무엇이 작동하는가?                     | 기존 글감 CRUD, DEMO 검색/필터/상세, 수동 키워드·관련어·수치·출처·확인 날짜 저장/수정, 글감 연결, 브라우저 영속성, 결측 표시, 보류 판정. 실제 검색 데이터 자동 수집은 없다.                                         |
| Q5. 어떤 키를 발급받아야 하는가?                          | 검색광고 API 라이선스(API Key)·Secret Key·Customer ID. 신규 블로그/데이터랩은 NCP의 NAVER API HUB Application Client ID·Client Secret과 해당 API 사용 설정. NCP IAM 키가 아니며 구 Developers 키와 호환되지 않는다. |

검색광고·데이터랩·블로그는 DOCUMENTED, 자동완성/검색화면 연관검색어는 UNVERIFIED이며 현재 자동 수집은 UNSUPPORTED다. **VERIFIED 0개, 인증 호출 0건**이다. 공식 근거·한도 충돌·접근 실패·정책 미확인은 [데이터 소스 감사](DATA_SOURCE_AUDIT.md)에 기록했다.

## 6. 구현

- 기존 WorkspaceRepository 확장 및 독립된 수동 자료 저장소. 원본 글감 데이터 구조 유지.
- 확장·검색량·추세·블로그 4개 Provider 계약, 수동 어댑터, 미연결 어댑터, 검증 상태/이용 조건 연결 정책.
- 키워드 수동 입력·다중 붙여넣기·글감 연결·저장·수정. 출처·날짜 필수, 수치 선택, 잘못된 날짜/음수/소수 차단.
- 0/결측/`<10` 구별, 정확한 합계 불가 시 확인 불가. 실제 추세/본문 분석 미확보를 명시.
- MANUAL·UNVERIFIED와 DEMO 표시, 데이터 연결 화면에 공식 문서·검증 상태 제공.
- 손상된 수동 저장소를 덮어쓰지 않고 재시도 안내. 글감 기능과 오류 격리.
- VITE 환경변수 및 서버 모듈 import 차단, 가짜 비밀키 빌드 검사.
- SRS, 데이터 소스 감사, 실험용 경쟁 평가 기준, 배포 없는 서버 API 설계.

## 7. 검증 결과

| 실행                                         | 결과                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run check`                              | TypeScript, 단위·통합 21개, 프로덕션 빌드 통과                                                           |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | 12개 통과: 1440px·390px·320px에서 기존 흐름, 저장·새로고침·수정, 출처·날짜·누락·범위값, 손상 저장소 격리 |
| `npm run test:secrets`                       | 서버 가짜 키가 산출물에 없는 것과 VITE 키 주입 빌드 실패 확인                                            |
| 화면 점검                                    | 브라우저 캡처로 데스크톱 결과 및 320px 입력 폼 확인                                                      |

기존 20개 테스트를 삭제하거나 무시하지 않았다. 추가 13개를 포함해 총 33개 기능 테스트가 통과했다. 키 경계 검사는 별도 실행이다. 실 API 인증 테스트는 포함하지 않는다. Chrome 사용 시 NO_COLOR/FORCE_COLOR 안내만 발생했으며 기능 실패는 없었다. `test-results/` 캡처와 빌드 산출물은 Git에서 제외한다.

## 8. 변경 파일

- 문서: `docs/SRS.md`, `docs/DATA_SOURCE_AUDIT.md`, `docs/COMPETITION_SCORING.md`, `docs/phase1-report.md`, `server/README.md`, `README.md`, `.env.example`
- 모델/저장: `src/domain/research.ts`, `src/domain/models.ts`, `src/data/research-store.ts`, `src/data/local-repository.ts`
- 공급자: `src/providers/contracts.ts`, `manual.ts`, `catalog.ts`, `unavailable.ts`
- UI: `src/components/research-panel.tsx`, `src/app/workspace.tsx`, `src/app/app.tsx`, `src/pages/keywords.tsx`, `connections.tsx`, `dashboard.tsx`, `src/styles.css`
- 테스트/개발: `src/data/research-store.test.ts`, `tests/e2e/research.spec.ts`, `scripts/check-client-secrets.mjs`, `vite.config.ts`, `package.json`, `package-lock.json`

새 의존성은 추가하지 않았다. 버전 표시는 0.2.0으로 변경했다. 기존 배포 보존본 `ops/legacy/`, 백업 브랜치, 다른 프로젝트는 수정하지 않았다.

## 9. 비용 및 한계

유료 신청·결제·외부 데이터 호출·인프라 배포를 하지 않았다. API HUB는 확인일 기준 한시적 무료 안내가 있으나 향후 유료 전환 가능성이 있다. SearchAd의 별도 API 요금/쿼터·상업적 저장 허용은 이번 자료만으로 확정하지 못했다. 추후 서버 운영에도 비용이 생길 수 있으므로 계약·요금·한도를 확인해야 한다. 현재 Cloudflare 원격 Pages 설정의 인증 문제는 해결하거나 변경하지 않았다.

## 10. Phase 2 후보 — 별도 지시 필요

사용자 발급 인증 정보를 서버에 보관하고, 적용 약관·쿼터를 확인한 뒤 최소 인증 호출로 소스를 검증한다. 승인된 어댑터만 연결하고 결과 스키마·오류·요청 제한·본문 제외 정책을 검사한다. 관리자 인증 및 API 데이터 저장 허용 범위를 설계하고, 경쟁 평가에는 허용된 표본과 사람의 검토 근거를 추가한다. 원고/이미지/자동 발행은 이번에 구현하지 않았다.

Phase 1에서 작업을 종료한다. 운영 배포, DNS 변경, 원격 push, Reviewman 수정, 무단 크롤링을 수행하지 않았다.
