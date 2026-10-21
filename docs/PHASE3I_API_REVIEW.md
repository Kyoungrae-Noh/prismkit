> 후속 상태: 사용자 활용 허용 확인 및 실제 인증 결과는 [Phase 3I LIVE 재개 기록](PHASE3I_LIVE_REPORT.md)을 참조한다. 아래는 활성화 전 조사·구현 당시의 기록이다.

# Phase 3I — NAVER API HUB 조사 및 활성화 조건

확인일: 2026-10-21 (KST). 기존 운영 HEAD: `92fc199b5290e2a7fdd1c2093a18f384d5e4c822`.

## 결론

6종의 서버 어댑터·응답 검증·호출 제한과 모의 발굴 흐름을 구현한다. **현재 배포용 정책은 6종 모두 LIVE 보류**다. 이는 인증 실패 결과가 아니라, 사용자 요청의 “이용 범위 불확실 시 모의 구현 및 LIVE 보류” 조건을 적용한 것이다. 인증정보는 값 출력 없이 존재만 확인했다. 실제 인증 호출은 0회이며 정상 연결로 보고하지 않는다.

검색 4종은 2026-09-20 시행 특약상 검색결과 표시 목적, 원본 출처·링크 및 순서 보존이 요구된다. 저장·파생물·AI 입력·수익화에 대한 제한이 요청된 자동 발굴→원고 활용과 충돌한다. NAVER의 해당 용도 별도 허가 전에는 활성화하지 않는다. 2026-10-07 후속 개정은 명칭·책임·통지 조항 변경이며 검색 특약 제한 해제 근거가 아니다.

- [검색 API 특약 개정, 2026-09-20](https://www.ncloud.com/support/notice/all/2243)
- [후속 개정, 2026-10-07](https://www.ncloud.com/support/notice/all/2271)

Data Lab 두 종류는 검색 4종의 특약이 그대로 적용된다고 단정하지 않는다. 공개 API 규격과 한시 무료 안내는 확인했지만, 이 프로젝트의 저장·AI 원고·상업 활용에 적용할 별도 조건을 확정할 수 없어 각각 보류한다. 콘솔에서 동의한 현행 HUB 전체 약관 또는 NAVER의 해당 활용 안내를 확인한 뒤 별도로 판단한다. 외부 문의를 대신 발송하지 않았다.

## 공통 인증·요금·한도

- 기본 URL: `https://naverapihub.apigw.ntruss.com`.
- 인증: 서버 헤더 `X-NCP-APIGW-API-KEY-ID`, `X-NCP-APIGW-API-KEY`. 과거 Developers의 `X-Naver-*` 헤더를 사용하지 않는다.
- 공식 개요는 한시적 무료이며 유료 전환 시 별도 공지를 안내한다. 영구 무료 또는 자동 비용 승인으로 해석하지 않는다. 이 작업은 유료 호출·새 서비스 가입·비용 한도 확대를 승인하지 않는다.
- 공식 사용 가이드 FAQ: 검색 카테고리 월 775,000건 통합, 검색어트렌드 월 50,000건, 쇼핑인사이트 월 50,000건, 키당 50 RPS. 동일 키 사용량은 합산된다.
- 주의: 개별 검색 API 규격에는 일 25,000회라는 설명도 남아 있어 월 기준 FAQ와 일 기준 규격에 차이가 있다. 실제 Application 콘솔 한도가 우선이며 여기서 계정별 한도를 조회하거나 변경하지 않았다. Data Lab의 별도 일 한도는 확정하지 않았다.
- Prismkit 내부 안전 한도는 API별 KST 일 30회·월 300회, 최소 1초 간격, 같은 API 동시 요청 1개, 실패도 1회 소비. 기존 SearchAd·이미지·원고 예산은 변경하지 않는다. 이는 NAVER가 보장한 무료 할당량이나 과금 승인 설정이 아니다.
- 캐시는 API별 최근 요청 1개·최대 5분으로 구현했으나 LIVE 보류 상태에서는 저장하지 않는다. 새 질의 시 앞선 캐시를 제거하고 DO alarm으로 만료 자료를 지운다. 검색 특약의 임시 보관 예외를 자동 발굴의 영구 저장 허가로 해석하지 않는다.
- 401/403은 해당 API의 지속 차단, 429는 해당 KST 일 차단. 재시도 루프 없음. 12초 upstream 타임아웃·128 KiB 응답 상한·3 KiB 요청 상한. 오류 본문은 전달하지 않는다.

근거: [사용 가이드·한도 FAQ](https://guide.ncloud-docs.com/docs/apihub-overview), [Application·한도 설정](https://guide.ncloud-docs.com/docs/apihub-application), [공통 API 규격·인증·오류](https://api.ncloud-docs.com/docs/naver-api-hub-overview.md).

## API별 규격과 현재 상태

| API          | 메서드·경로                                                      | 요청 / 응답 요점                                                                                    | LIVE                          |
| ------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| 블로그       | GET `/search/v1/blog`                                            | query, display, start, sort, format / total, items(title, link, description, bloggername, postdate) | 용도 별도 허가 필요           |
| 카페         | GET `/search/v1/cafearticle`                                     | 공통 검색 요청 / total, items, cafename, cafeurl; 개별 작성일 미제공                                | 용도 별도 허가 필요           |
| 지식iN       | GET `/search/v1/kin`                                             | 검색어 필수, sort=date 지원 / total, title, link, description; 개별 작성일 미제공                   | 용도 별도 허가 필요           |
| 뉴스         | GET `/search/v1/news`                                            | 공통 검색 요청 / total, items, originallink, pubDate(제공 시각)                                     | 용도 별도 허가 필요           |
| 검색어트렌드 | POST `/search-trend/v1/search`                                   | startDate/endDate/timeUnit/keywordGroups, device / results[].data[].period·ratio                    | 저장·상업 활용 조건 확인 필요 |
| 쇼핑인사이트 | POST `/shopping/v1/categories`, `/shopping/v1/category/keywords` | 날짜·분야 코드·기기; 키워드 모드는 keyword 그룹 / 기간별 상대 클릭 ratio                            | 저장·상업 활용 조건 확인 필요 |

검색 요청은 첫 10개, API 순서를 보존한다. `total`은 해당 API 검색 결과 수이고 통합검색 문서 수나 노출 경쟁도·실제 순위가 아니다. 뉴스는 기사 원문을 수집하지 않는다.

트렌드는 일별 0–100 상대 지표이며 실제 월 검색량과 분리한다. 검색어트렌드 그룹 수는 최대 5개, Prismkit은 그룹당 키워드 1개를 사용한다(문서 간 그룹당 최대 수 차이를 피함). 쇼핑 키워드도 그룹당 1개, 분야 모드는 사용자 지정 분야 1개다. 쇼핑 분야 코드가 없으면 호출하지 않는다. 알려지지 않은 인기 키워드를 쇼핑 API가 자동 제공한다고 가정하지 않는다.

규격: [블로그](https://api.ncloud-docs.com/docs/naver-api-hub-search-blog.md), [카페](https://api.ncloud-docs.com/docs/naver-api-hub-search-cafearticle.md), [지식iN](https://api.ncloud-docs.com/docs/naver-api-hub-search-kin.md), [뉴스](https://api.ncloud-docs.com/docs/naver-api-hub-search-news.md), [검색어트렌드](https://api.ncloud-docs.com/docs/naver-api-hub-search-trend.md), [쇼핑 분야](https://api.ncloud-docs.com/docs/naver-api-hub-shopping-insight-categories.md), [쇼핑 키워드](https://api.ncloud-docs.com/docs/naver-api-hub-shopping-insight-keywords.md).

## 개발 경계와 재개 순서

1. 해당 용도에 적용되는 NAVER 약관/별도 허가 확인. 특히 검색 결과·파생물 저장과 외부 AI 전달 권한을 구분한다. 일반적인 사용자 비용 승인은 NAVER의 데이터 이용 허가를 대신하지 않는다.
2. API별로 허가된 범위를 `edge/hub.ts` 정책에 반영하고 보관·원고 전달 범위를 다시 검토한다. 브라우저 설정이나 Secret 등록만으로 LIVE 제한이 해제되지 않는다.
3. 당시 무료/과금 조건 및 Application 일·월 한도 재확인 후 허용된 API만 최소 1회 인증·규격 확인. 현재 0회이므로 인증 성공으로 간주하지 않는다.
4. 기존 4개 Secret을 유지한 채 새로운 HUB Secret 2개만 등록. 현재 이 Phase에서는 운영 Secret을 등록하지 않았다.
5. 모의 회귀 테스트와 비밀정보 검사 후 Worker→Pages 순서로 배포하고 Access 보호 및 승인된 API 상태 확인. 인증된 운영 브라우저로 명시적 호출 흐름 확인.

복구 지점: `backup/prismkit-before-phase3i-92fc199`; Pages `d3a3e68e-3d6b-457e-a12b-6178a8a07f62`; Worker `75abb6a8-dc44-4aa6-8b3f-a0ceaa269d4a`.

기존 원고 계정·예산·키·Access·데이터 스키마를 변경하지 않았다. 후보는 기존 v1 후보 구조의 이유·출처에 자료를 보존하며 기존 전체 백업에 포함된다. DEMO는 명시 표시하고 원고 후보 목록에서 제외한다. 새 외부 데이터의 허가 확인 없이 운영 main push 또는 배포하지 않는다.
