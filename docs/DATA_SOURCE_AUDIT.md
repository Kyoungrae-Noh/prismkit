# 네이버 데이터 소스 검증 보고서

확인일: **2026-10-19 (KST)**. 프로젝트: Prismkit Phase 1.

## 검증 방법과 상태

공식 공개 문서·명세·공지·샘플 코드를 읽었다. 문서 GET 성공은 업무 API의 인증 호출 성공이 아니다. 프로젝트 비밀 파일 및 실행 환경의 관련 키 존재를 확인했으며 사용할 네이버 인증 정보를 발견하지 못했다. **인증된 데이터 호출은 0건, VERIFIED 소스는 0개**다. 네이버 검색 화면이나 비공식 엔드포인트를 크롤링하지 않았다.

| 상태        | 의미                                                                              |
| ----------- | --------------------------------------------------------------------------------- |
| VERIFIED    | 공식 문서 및 실제 인증된 데이터 호출로 동작 확인; 별도로 이용 조건 검토도 필요    |
| DOCUMENTED  | 공식 명세에서 기능 확인, 인증 테스트 미실시                                       |
| UNVERIFIED  | 존재·허용 여부·정확한 조건 등을 확인하지 못함                                     |
| UNSUPPORTED | 공식 제공 불가가 확인되었거나 현재 제품에서 사용할 수 없는 기능; 적용 범위를 명시 |

각 소스의 기능 상태와 개별 정책 미확인을 구분한다. DOCUMENTED가 가격·저장·상업 이용까지 승인되었다는 뜻은 아니다.

## 요약

| 소스                            | 종류 / 접근                                       | 인증                            | 비용                                | 문서상 한도                                                             | 실제 연결          | 적용 / 대안                                                |
| ------------------------------- | ------------------------------------------------- | ------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| SearchAd 키워드 도구            | 관련 광고 키워드·최근 30일 PC/모바일 검색수, REST | API 라이선스·Secret·Customer ID | 이번 조사로 별도 API 요금 확정 불가 | hintKeywords 최대 5개; RPS·일 한도 미확인                               | 미실시, DOCUMENTED | 조건 확인 후 서버 연결 후보 / 도구에서 확인한 값 수동 기록 |
| DataLab 검색어 트렌드 (API HUB) | 상대 지수·기간/기기/연령 필터, POST               | HUB Client ID/Secret            | 한시적 무료, 향후 종량제 예고       | 월 50,000회, Key당 50 RPS 안내; 아래 충돌 참고                          | 미실시, DOCUMENTED | 수요 변화 보조 자료 / 현재 추세 확인 불가 표시             |
| 자동완성·검색화면 연관검색어    | 공개 공식 수집 API 미확인                         | 미확인                          | 미확인                              | 미확인                                                                  | 미실시, UNVERIFIED | 자동 수집은 제품에서 UNSUPPORTED / 수동 붙여넣기           |
| 블로그 검색 (API HUB)           | total·제목·URL·요약·발행일, GET                   | HUB Client ID/Secret            | 한시적 무료                         | 검색 카테고리 월 775,000회 공유, Key당 50 RPS 안내; 일 한도 표기와 충돌 | 미실시, DOCUMENTED | 검색 표본 확보 후보 / 수동 결과 수 입력                    |

모든 행의 문서 확인일은 2026-10-19, 인증 테스트 일시는 없음이다. 현재 프런트엔드에서 실제 작동하는 공급자는 **수동 어댑터**이며 외부 API 연결 버튼은 활성화하지 않았다.

## 먼저 확인해야 할 변경: NAVER API HUB 이관

[공식 이관 공지](https://developers.naver.com/notice/article/32530)는 2026-07-31부터 검색·검색어 트렌드 신규 신청을 API HUB로 안내한다. 이전 신청자는 2027-06-30까지 Developers 지원을 받을 수 있다. 따라서 이번 신규 연결에는 NCP 계정과 API HUB Application을 준비해야 한다. SearchAd는 별도 서비스다.

[API HUB 공통 명세](https://api.ncloud-docs.com/docs/naver-api-hub-overview)와 [이관 가이드](https://guide.ncloud-docs.com/docs/apihub-migration)의 인증 헤더는 `X-NCP-APIGW-API-KEY-ID`, `X-NCP-APIGW-API-KEY`다. Application에서 발급하는 Client ID/Secret을 사용하며 이전 Developers 키나 NCP IAM 키와 혼용하지 않는다. 키를 발급하거나 유료 상품을 신청하지 않았다.

## A. 네이버 검색광고 API

공식 자료:

- [API 문서](https://naver.github.io/searchad-apidoc/)
- [공식 keywordstool JSON 명세](https://naver.github.io/searchad-apidoc/assets/json/ncc-keywordstool.json)
- [공식 인증 안내 데이터](https://naver.github.io/searchad-apidoc/assets/i18n/markdown-ko-KR.json)
- [네이버 공식 서명 샘플](https://github.com/naver/searchad-apidoc/blob/master/python-sample/examples/signaturehelper.py)
- [공식 FAQ](https://github.com/naver/searchad-apidoc/wiki/FAQ)

확인된 기능: `GET https://api.searchad.naver.com/keywordstool`. `hintKeywords`에 최대 5개의 힌트 키워드, `showDetail`로 상세 여부를 요청한다. `relKeyword`, `monthlyPcQcCnt`, `monthlyMobileQcCnt`가 있다. 검색수는 **최근 30일**이며 낮은 값은 문자열 `<10`으로 반환될 수 있다. 달력상의 특정 월을 조회하는 기능으로 단정하지 않는다. `<10`을 0·5·9로 치환하거나 정확한 합계를 만들지 않는다.

연관어는 광고 키워드 도구의 확장 결과이며 자동완성이나 검색화면 연관검색어 목록과 동일하다고 볼 수 없다. 완전한 목록이나 고정 반환 개수도 보장하지 않는다. `compIdx`는 PC 광고 경쟁 지표이므로 유기적 블로그 경쟁도와 구별한다.

이용 자격·인증: 검색광고 계정의 API 사용 신청과 라이선스·비밀키·광고주 Customer ID가 필요하다. 공식 안내는 timestamp, method, URI를 HMAC-SHA256으로 서명하고 `X-Timestamp`, `X-API-KEY`, `X-Customer`, `X-Signature`를 보내도록 한다. 광고 집행액·계정 심사 등 추가 자격 조건은 이번 공개 자료만으로 확정하지 못했다.

**미확인:** 구체적 호출 속도/일일 쿼터, 별도 API 과금 여부, 상업적 분석 서비스 이용 및 장기 보관·재배포 허용 범위. 무료/무제한 또는 상업적 저장 허용이라고 추정하지 않는다. 계정 콘솔·적용 약관·공식 지원 답변을 확인한 후 연결 승인한다.

실제 테스트: 공식 명세와 서명 코드 열람만 수행. 인증 데이터 호출 없음, 상태 DOCUMENTED. 대안은 사용자가 적법하게 확인한 키워드 도구 결과를 출처·날짜와 함께 수동 입력하는 방식이다.

## B. 데이터랩 검색어 트렌드

공식 자료: [API HUB 검색어 트렌드](https://api.ncloud-docs.com/docs/naver-api-hub-search-trend), [기존 Developers 명세](https://developers.naver.com/docs/serviceapi/datalab/search/search.md).

현재 신규 경로는 `POST https://naverapihub.apigw.ntruss.com/search-trend/v1/search`. 기간·일/주/월 단위·키워드 그룹과 기기(pc/mo/전체), 성별, 연령 코드 필터를 지원한다. 2016-01-01 이후 범위를 안내한다. 연령 코드 1~11은 0~12세부터 60세 이상까지의 범주이며 정확한 연령별 절대 검색자 수가 아니다. 필요한 조건별 별도 조회가 필요하다.

반환 `ratio`는 조회 범위에서 최댓값을 100으로 둔 **상대 관심도**다. 월간 절대 검색수로 환산하지 않는다. 독립적으로 정규화된 서로 다른 요청의 지수를 그대로 합산·비교하여 인구/기기 비중을 추정하지 않는다.

명세에는 최대 5개 그룹·그룹당 키워드 20개, 공통 FAQ에는 그룹당 5개라고 적혀 있어 차이가 있다. 인증 테스트 전에는 더 작은 값으로 요청을 설계하고 실제 허용 범위를 콘솔/지원으로 확인해야 한다. 기존 Developers의 1,000회/일 정책을 신규 HUB에 그대로 적용하지 않는다.

API HUB Application의 해당 API 선택과 인증 키가 필요하다. 비용·쿼터·이용 조건은 아래 공통 절을 따른다. 실제 호출 미실시, DOCUMENTED. 현재 UI는 추세를 확인 불가로 표시한다. 추세 수치 수동 입력·차트 생성은 구현하지 않았다.

## C. 자동완성·검색화면 연관검색어

공식 조사 범위: [Developers API 목록](https://developers.naver.com/docs/common/openapiguide/apilist.md), [API HUB 제공 API](https://guide.ncloud-docs.com/docs/apihub-overview), [네이버 개인정보 보호 기능 안내](https://privacy.naver.com/protection/feature/privacy-protection).

자동완성은 입력 중 질의에 대한 제안이고, 검색화면 연관검색어는 검색 후 관련 탐색어다. 검색광고 도구의 `relKeyword`는 별도 자료다. 이를 같은 출처 이름으로 합치지 않는다.

공개 공식 수집 API와 자동 접근 허용 조건을 확인하지 못했다. 따라서 전 세계적으로 API가 없다고 확언하지 않으며 **UNVERIFIED**로 기록한다. 현재 Prismkit의 자동 수집 기능은 **UNSUPPORTED**다. 비공식 엔드포인트·HTML 파싱·차단 우회·자동 크롤러를 구현하거나 시험하지 않았다. 실시간 수집의 안정성, 쿼터, 비용, 저장 권한도 미확인이다. 노출은 정책/시점에 따라 달라질 수 있어 수동 기록도 당시 관찰값이다.

대안: 사용자가 확인한 관련어를 줄바꿈·쉼표·세미콜론·탭으로 붙여넣고 출처와 날짜를 기록한다. 중복을 제거하며 MANUAL·UNVERIFIED로 저장한다. 수동 입력 기능이 원본 서비스의 모든 재사용 권리를 부여하는 것은 아니다. 별도 자료에 허용된 범위만 사용한다.

## D. 네이버 블로그 검색과 경쟁 분석

공식 자료: [API HUB 블로그 검색](https://api.ncloud-docs.com/docs/naver-api-hub-search-blog), [기존 Developers 블로그 검색](https://developers.naver.com/docs/serviceapi/search/blog/blog.md).

`GET https://naverapihub.apigw.ntruss.com/search/v1/blog`에서 `query`, `display`(1~100), `start`(1~1000), `sort`(sim/date)를 지정한다. `total`, `lastBuildDate`, `items`의 title/link/description/bloggername/bloggerlink/postdate를 문서로 확인했다. JSON/XML 형식을 지원한다. 인증 테스트가 없어 실제 응답이나 표본을 확보한 것은 아니다.

`total`은 해당 질의에 대한 API 응답의 검색 결과 수이며 실제 전체 블로그 문서 수와 동일하다고 보장하지 않는다. API 결과의 순서를 네이버 통합검색 실제 노출 순위라고 표시하지 않는다. start 상한이 있으므로 total 전체를 조회할 수 있다는 뜻도 아니다.

제목·URL·발행일·요약을 활용한 표본의 최신성/도메인 분포 검토는 후보 기능이다. 본문 전체, 품질, 의도 충족, 통합검색 화면 점유율은 이 API만으로 확보·검증되지 않는다. 응답 제목/요약의 HTML 강조 태그는 안전하게 텍스트화해야 한다. 원문 게시물 무단 수집은 하지 않는다.

Application 키 필요, 실제 호출 미실시, DOCUMENTED. 대안은 사용자가 관찰한 결과 수와 출처·날짜를 수동 저장하는 것. 게시물 목록 수동 편집이나 본문 분석은 이번 단계에 구현하지 않았다.

## 공통 호출 한도·비용·저장 조건

[HUB 개요 FAQ](https://guide.ncloud-docs.com/docs/apihub-overview)는 검색 카테고리 통합 월 775,000건, 검색어 트렌드 월 50,000건, Key당 50 RPS를 안내한다. 한편 **블로그 상세 명세에는 25,000회/일**이라고 기재되어 있다. 일 한도가 없다는 공통 FAQ와 충돌하므로 어느 쪽이 실제 계정에 적용되는지 아직 검증하지 못했다. 무료 기간 한도 증액 불가 안내도 있다. 이 수치를 앱의 보장된 사용량으로 표시하거나 하드코딩한 자동 호출을 하지 않는다.

[사용 준비/요금 안내](https://guide.ncloud-docs.com/docs/apihub-spec)는 한시적 무료와 향후 유료 전환 별도 공지를 설명한다. [상품 페이지](https://www.ncloud.com/product/applicationService/naverApiHub)에서 이번 조사로 확정된 미래 유료 단가는 확보하지 못했다. 영구 무료로 간주하지 않는다. 이번 작업은 결제·상품 신청·인증 API 호출·운영 인프라 생성이 없어 새 유료 자원을 만들지 않았다.

[Developers API 이용약관](https://developers.naver.com/products/terms/)에는 허용 범위를 벗어난 저장·가공·재배포 등의 제한이 있다. 이 약관을 HUB의 개별 계약과 같다고 단정하지 않는다. **HUB/검색광고별 상업 이용, 광고 결합, 캐시·장기 저장·재사용 기간의 구체적 허용 범위는 미확인**이다. NCP 신청 시 적용 계약/개별 정책과 필요시 공급자 답변을 확인해야 한다. 이번 앱은 원시 API 결과를 저장하지 않으며 실제 API 어댑터 활성화 전 이용 조건 확인을 요구한다.

## 접근 실패와 증거 한계

일부 이전 문서 경로와 웹 도구에서 SearchAd 동적 페이지/JSON 본문을 읽지 못했다. 공식 GitHub Pages JSON과 GitHub 샘플을 별도 HTTP GET으로 열람해 명세·인증 내용을 확인했다. Developers 데이터랩의 이전 별칭 경로는 접근 실패했으나 위에 연결한 서비스 명세 경로는 읽었다. 계정 콘솔, 비공개 약관 동의 화면, 실제 응답·쿼터는 확인하지 못했다. 실패를 연결 성공으로 집계하지 않았다.

## 연결 승격 조건

1. 사용자 발급 키를 서버 전용 비밀 저장소에 보관한다.
2. 적용 상업 이용·보관 정책과 계정 쿼터를 확인한다.
3. 사용자가 허용한 최소 인증 호출로 상태/응답 스키마/빈 결과/오류를 확인한다.
4. 키나 원문을 노출하지 않은 테스트 일시·소스·결과를 기록한다.
5. VERIFIED와 이용 조건 승인 상태가 모두 충족된 소스만 서버에서 활성화한다.

현재는 위 승격을 실행하지 않았다. 세부 경계는 [서버 설계](../server/README.md), 판정 기준은 [경쟁 평가](COMPETITION_SCORING.md)를 따른다.
