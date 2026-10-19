# Phase 2B 로컬 검색광고 서버

실행 환경은 Node.js 22.12 이상(권장 24)이다. 의존성 추가 없이 Node HTTP·crypto·fetch를 사용한다. 운영 서버나 Cloudflare 배포 구성은 포함하지 않는다.

## 실행

프로젝트 `.env`에 다음 서버 전용 변수 세 개를 준비한다. 실제 값을 소스·로그·채팅에 넣지 않는다.

- `NAVER_SEARCHAD_API_KEY`
- `NAVER_SEARCHAD_SECRET_KEY`
- `NAVER_SEARCHAD_CUSTOMER_ID`

터미널 1: `npm run dev:api` (127.0.0.1:4179)

터미널 2: `npm run dev` (127.0.0.1:5173)

브라우저에서 `http://127.0.0.1:5173/keywords`에 접속한다. `localhost` 별칭이나 다른 포트는 현재 Origin 허용 목록에 포함하지 않는다. `npm run build`/preview는 API 서버를 배포하거나 자동 실행하지 않는다.

## 흐름

`조회 버튼 → /api/searchad/keyword?keyword=... → Vite 프록시 → 로컬 HTTP 서버 → GET https://api.searchad.naver.com/keywordstool`

서명은 공식 명세의 `timestamp.GET./keywordstool` 문자열에 비밀키로 HMAC-SHA256을 적용한 Base64다. query string은 서명 URI에 포함하지 않는다. X-Timestamp, X-API-KEY, X-Customer, X-Signature를 서버에서만 설정한다. 인증값이나 원시 오류 응답은 클라이언트로 전달하지 않는다.

공식 근거: [API 문서](https://naver.github.io/searchad-apidoc/), [서명 샘플](https://github.com/naver/searchad-apidoc/blob/master/python-sample/examples/signaturehelper.py), [호출 제한 FAQ](https://github.com/naver/searchad-apidoc/wiki/FAQ).

## 안전장치

- GET 키워드 조회만 지원. 임의 upstream URL, 광고 변경, API HUB 경로 없음.
- 한 번에 키워드 하나, 60자 이내. 공백은 검색광고 요청에 맞게 제거.
- 명시적인 조회 버튼으로만 요청. 자동 재시도·주기 작업·백그라운드 수집 없음.
- 서버 프로세스당 외부 요청 최대 10회, 최소 10초 간격, 동시 외부 요청 1개. 실패 요청도 예산에 포함. 이는 Prismkit의 보수적인 제한이며 네이버의 보장 한도가 아니다.
- 같은 키워드의 성공 응답은 5분 동안 서버 메모리에서 재사용. 캐시는 원래 조회 시각을 유지하고 UI에 캐시 여부 표시. 파일/DB/localStorage에 API 결과를 기록하지 않음. 최대 호출 수가 10이므로 메모리 항목 수도 최대 10개.
- HTTP 401/403/429 발생 후 해당 프로세스의 외부 호출 중단. 자동 해제나 재시도 없음. 키 또는 제한 상태를 확인한 뒤 사용자가 서버를 재시작해야 함. 재시작 시 예산/캐시/차단 상태 초기화; 재시작을 제한 우회 목적으로 반복하지 않음.
- 외부 요청 10초 타임아웃, 리다이렉트 금지. 네트워크·인증·쿼터·형식 오류는 고정 메시지로 변환.
- HTTP 서버는 loopback에만 바인딩하고 정적 파일을 제공하지 않음. Host 확인, 고정 요청 헤더 필수, Origin이 있으면 지정된 로컬 UI만 허용. CORS 개방 없음. 이는 로컬 개발 경계이며 운영 사용자 인증을 대체하지 않음.
- `VITE_` 값 주입과 클라이언트의 server 모듈 import 차단. Vite의 `.env` HTTP 접근 차단을 브라우저 테스트로 확인.

## 데이터와 검증

숫자·숫자 문자열·`<10`·결측을 구별한다. `<10`이나 결측이 포함된 정확한 합계는 null이다. 일치하는 핵심 키워드가 없으면 다른 행을 대입하지 않는다. 검색광고 연관어는 자동완성/검색화면 연관검색어와 구별한다. 최초 성공 응답은 계약의 `mode: API`, `verification: VERIFIED`로 반환하고 UI가 LIVE로 표시한다. 실패에는 LIVE 결과를 남기지 않는다.

`SourceAudit.usageApproved`와 기존 `canConnect`는 향후 일반 운영/재사용 승인 정책이며 false를 유지한다. 이번 로컬 경로는 사용자의 별도 단건 검증 및 명시적 버튼 조회 승인 범위다. 인증 성공이 상업적 재배포·영구 저장 권한을 검증한 것은 아니다.

## 테스트 및 진단

`npm run test:server`는 모든 외부 통신을 모의 응답으로 대체한다. `npm run check`에 타입 검사·기존 테스트·서버 테스트·빌드가 포함된다. 브라우저 테스트의 LIVE 수치는 모의 데이터다.

`server/probe.ts`는 이번 승인된 키워드의 최초 1회 진단에만 사용했다. dev/build/test에서 실행되지 않는다. 이미 성공했으므로 자동으로 다시 실행하지 않는다. 이후 실제 조회는 UI 버튼을 이용한다.

비용 조건은 여전히 미확정이다. 이전 중단 이후 사용자가 최소 1회 읽기 전용 호출을 명시적으로 승인했다. 결제·광고 집행·계정 설정 변경은 하지 않았다. 운영 배포·영구 저장·API HUB는 범위 밖이다.

## Phase 2C 클라이언트 후보 분석

서버 API·캐시·간격·총량·오류 차단은 변경하지 않았다. 이미 수신한 전체 키워드를 브라우저에서 분석하며 필터·정렬·저장은 서버 요청을 만들지 않는다. 사용자가 명시적으로 저장한 후보는 클라이언트의 `prismkit.candidates.v1`에 별도 스냅샷으로 보관한다. 이는 서버의 5분 캐시나 원시 응답 전체 저장과 다르다. Phase 2C 작업 중 실제 API 호출은 0회다.
