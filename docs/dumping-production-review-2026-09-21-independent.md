# `/dumping` 프로덕션 리뷰 — 독립 재점검

작성일: 2026-09-21 (KST)  
요청 범위: **리뷰와 문서 작성만. 코드 수정·커밋·배포 없음.**  
대상: <https://gjdong.vercel.app/dumping> 및 로컬 `e67c6c0e85de4f03bbce28a8166ae2b6d0b5f8be`

## 1. 판정과 검증 경계

**기본 정적 검증과 비로그인 접근 차단은 통과했다. 다만 장애 시 답변의 완결성, 세션 만료, 재인증·초기 로딩 복구에 P2 개선 사항 5건이 있다.** 이번 확인 범위에서 P0/P1을 확정하지 않았다. 인증 후 실제 화면을 새로 검증하지 못했으므로 전체 프로덕션 정상 판정이나 시연 승인으로 읽으면 안 된다.

가정: “프로덕션 리뷰”는 현재 배포 접근 상태와 코드의 운영 안정성을 함께 점검하는 요청으로 해석했다. 프로덕션 장애 유발·부하 테스트·실데이터 변경은 수행하지 않았다.

- **실제 배포에서 확인:** 로그인 화면, HTML 응답, 보안·색인 헤더, 인증 없는 데이터 API 4종.
- **로컬에서 확인:** 현재 소스, 관련 기존 테스트, 타입·린트 검사, 외부 통신을 모의한 실패 경로 재현.
- **미확인:** 현재 배포와 로컬 SHA의 동일성, 로그인 이후 데스크톱·모바일 동작, 실제 Gemini/TTS 응답, 마이크·스피커, 실제 GPU 성능, 장시간 메모리 추이.
- 브라우저는 Codex 인앱 브라우저를 사용했다. Chrome 제어 연결은 사용할 수 없었고, 인앱 브라우저는 인증 세션 없이 로그인 화면에 도달했다. 비밀번호 추측이나 인증 우회는 하지 않았다.
- 기존 [같은 날짜 점검 문서](./dumping-production-review-2026-09-21.md)는 과거 근거다. 그 문서의 FPS·인증 후 시연 성공·배포 ID를 이번 실측 결과로 재사용하지 않았다. 기존 문서는 수정하지 않았다.

## 2. 우선순위

P2는 조건부로 발생하는 정상 운영 결함이며 후속 수정 대상이다. 아래 코드 근거는 위 로컬 SHA 기준이다. 배포에서도 같은 결함이 발생한다고 단정하려면 배포 정합 또는 인증 후 재현이 필요하다.

| ID | 우선순위 | 문제 | 증거 수준 |
|---|---|---|---|
| F1 | P2 | AI 응답 중간 장애가 완성 답으로 저장됨 | 실제 로컬 route 함수 + 모의 상류 스트림 재현 |
| F2 | P2 | 30일 쿠키와 달리 서버 인증 토큰은 만료되지 않음 | 로컬 인증 함수 시간 경과 재현 |
| F3 | P2 | 선행 인증·데이터 Promise가 재진입·재로그인에도 재사용됨 | 실제 데이터 모듈 재현 + 호출부 확인 |
| F4 | P2 | 데이터 API 401에서 재로그인으로 복구할 수 없음 | 실제 배포 401 + 클라이언트 제어 흐름 확인 |
| F5 | P2 | 건물 준비 전에도 로딩 100%·완료로 표시 가능 | 이벤트 연결 확인 + 상태 전이 모의 |

## 3. 상세 발견

### F1. 중간에 끊긴 AI 답변을 완성 답으로 재사용

**근거:** [ask/route.ts:191](../app/api/dumping/ask/route.ts#L191), [qa-chat.tsx:325](../components/dumping/qa-chat.tsx#L325), 같은 파일의 `askFree` 내 캐시 검색.

상류 응답을 읽다가 연결이 끊기거나 55초 타임아웃이 발생하면 서버는 예외를 기록한 뒤 `controller.close()`로 스트림을 정상 종료한다. 이 경로에서는 `ASK_ERR`를 보내지 않는다. 클라이언트는 받은 본문이 한 글자라도 있으면 `pending: false, aborted: false`로 저장한다. 이후 같은 질문은 기존 답을 재사용한다.

**재현:** 실제 POST 핸들러에 시험용 인증·키를 주고 외부 `fetch`만 모의했다. 정상 SSE 텍스트 `partial answer`를 보낸 다음 `reader.read()`가 실패하도록 구성했다. 결과는 HTTP 200, 본문 `ASK_ACCEPT + partial answer`, 오류 표식 없음이었다. 실제 Gemini 호출·과금은 없다.

**영향:** 결론만 도착하고 근거·한계가 잘린 답이 완성된 분석처럼 남는다. 현재 코멘트가 설명하는 “빈 응답 방지”로는 본문 일부가 도착한 장애를 막지 못한다.

**관련 프로토콜 결함:** 클라이언트는 `ASK_ERR`를 각 네트워크 청크 안에서만 찾는다([qa-chat.tsx:314](../components/dumping/qa-chat.tsx#L314)). 표식을 `\u0000E` / `RR:retry`로 나눠 같은 탐지 로직에 넣으면 `detected: false`다. 앞단의 정상 오류 통보조차 청크 경계에 따라 본문으로 처리될 수 있다. 이는 합성 청크 재현이며 실제 배포 네트워크에서 관측한 현상은 아니다.

**권고:** 서버가 완료·실패를 구별하는 프레임을 보내고, 클라이언트가 청크 사이 버퍼를 유지하며 해석하도록 한다. 사용자 취소와 상류 장애도 구별한다. 완료 확인 없는 답은 재사용하지 않는다.

**수정 후 통과 조건:** 첫 문장 이후 단절·타임아웃, 표식의 모든 분할 위치를 시험해 오류/미완료로 표시하고 같은 질문 재요청 시 모델 호출이 다시 발생해야 한다.

### F2. 쿠키를 확보하면 30일 뒤에도 서버에서 재사용 가능

**근거:** [auth.ts:13](../lib/dumping/auth.ts#L13), [auth.ts:32](../lib/dumping/auth.ts#L32), [auth/route.ts:39](../app/api/dumping/auth/route.ts#L39).

쿠키에는 30일 `maxAge`가 있지만 값은 비밀번호와 서명 키로 만든 고정 HMAC이다. 서버 검증에는 발급 시각·만료 시각이 없다. 브라우저의 쿠키 자동 삭제와 서버의 자격 증명 만료는 다른 동작이다.

**재현:** 시험용 환경변수로 토큰을 발급하고 현재 시각을 366일 뒤로 바꾼 로컬 요청에서도 `verifyRequest`가 `true`를 반환했다. 실제 운영 쿠키는 사용하지 않았다.

**영향:** 한 번 확보한 쿠키를 수동 재전송하면 비밀번호 또는 서명 키가 바뀔 때까지 인증된다. 정상 브라우저에서 쿠키가 30일 뒤 자동으로 남는다는 뜻은 아니며, 쿠키를 새로 탈취할 경로를 이번에 발견했다는 뜻도 아니다.

**권고:** 서명 대상에 만료 시각을 넣고 서버가 검증하거나 만료 가능한 세션 저장소를 사용한다. 현재 키 회전은 전체 토큰 무효화 수단으로 유지할 수 있다.

**수정 후 통과 조건:** 만료 직전 요청은 성공, 만료 후 동일 쿠키의 수동 재전송은 401. 변조·누락·키 회전도 함께 검증한다.

### F3. 선행 로딩 캐시가 세션·페이지 재진입보다 오래 유지됨

**근거:** [data-early.ts:35](../components/dumping/data-early.ts#L35), [dumping-dashboard.tsx:165](../components/dumping/dumping-dashboard.tsx#L165), [dumping-dashboard.tsx:175](../components/dumping/dumping-dashboard.tsx#L175).

`started`는 모듈 전역에 저장되며 초기화·무효화 경로가 없다. 대시보드가 같은 문서 안에서 다시 마운트되면 인증을 새로 확인하지 않고 이전 `auth` Promise를 받는다. 데이터도 `loadSeq === 0`이면 이전 Promise를 받는다. 재로그인 성공은 `setAuth("open")`만 실행하므로 주석의 “재로그인은 새로 받는다”와 실제 구현이 다르다.

**재현:** 실제 `startDumpingData` 모듈에서 `fetch`만 모의했다. 첫 인증은 성공시킨 후 다음 인증 응답이 실패하도록 바꾸고 다시 호출했다.

```json
{"firstAuth":true,"afterExpiryAuth":true,"sameBundle":true,"authRequests":1,"totalRequests":5}
```

**영향:** 같은 JS 문서에서 재진입하면 만료된 인증 판정과 이전 데이터가 남을 수 있다. 반대로 최초 판정이 실패이면 로그인 후 재진입해도 이전 실패 판정을 재사용할 수 있다. 전체 새로고침은 모듈을 초기화하므로 조건이 다르다. 서버 API 인증 우회나 미열람 데이터 유출로 판정하지 않는다.

**권고:** 선행 로딩은 최초 마운트에서 한 번 소비하는 용도로 제한하거나, 로그인·인증 만료·재진입 때 인증과 번들을 명시적으로 무효화한다.

**수정 후 통과 조건:** 로그인 전후 재진입, 쿠키 만료 후 재진입, 재로그인 후 데이터 갱신에서 필요한 인증·데이터 요청이 실제로 다시 발생해야 한다.

### F4. 자료 조회 중 인증이 만료되면 ‘다시 시도’만 반복

**근거:** [data-early.ts:8](../components/dumping/data-early.ts#L8), [dumping-dashboard.tsx:188](../components/dumping/dumping-dashboard.tsx#L188), [dumping-dashboard.tsx:672](../components/dumping/dumping-dashboard.tsx#L672). 비교: `QaChat`은 401 시 `onAuthExpired`를 호출한다.

선행 인증 확인 뒤 자료 요청 전에 쿠키가 만료되거나 운영 키가 회전하면 `map`/`graph`가 401을 반환한다. 자료 로더는 상태를 일반 Error 문자열로 넘기고 대시보드는 모든 오류를 `load="error"`로 처리한다. 사용자에게는 네트워크 확인과 재시도만 제시된다. 재시도는 `loadSeq`만 늘려 같은 만료 쿠키로 다시 조회한다.

**영향:** 실제 원인이 인증인데 로그인 화면으로 돌아갈 수 없어 재시도로 회복되지 않는다. 전체 새로고침으로 인증을 다시 확인하는 우회가 필요하다. 이번 프로덕션에서 4개 자료 API의 비인증 401을 확인했고, 그 이후 UI 분기는 코드로 확인했다. 실세션 만료를 배포에서 유도하지 않았다.

**권고:** 자료 요청의 401은 인증 만료로 분리하고 F3의 캐시도 함께 무효화한다. 일반 네트워크·5xx 오류에는 현재 재시도 경로를 유지한다.

**수정 후 통과 조건:** `auth` 성공 이후 `map`에 401을 주면 로그인으로 전환되고, 다시 로그인하면 새 번들로 복구된다.

### F5. 아이콘 준비가 건물 준비를 완료로 덮어씀

**근거:** [dumping-map.tsx:321](../components/dumping/dumping-map.tsx#L321), [dumping-map.tsx:392](../components/dumping/dumping-map.tsx#L392), [dumping-dashboard.tsx:219](../components/dumping/dumping-dashboard.tsx#L219), [dumping-dashboard.tsx:233](../components/dumping/dumping-dashboard.tsx#L233).

`load` 핸들러는 별도 동적 import 후 즉시 `icons`를 통지한다. 건물 결합을 확인하는 `idle` 이벤트와 완료 순서가 묶여 있지 않다. 부모는 `icons`를 단계 4로 간주하고 `Math.max`로 저장한다. 따라서 `idle`을 아직 받지 않았더라도 모든 이전 단계를 완료 표시하고 커튼을 걷는다.

**상태 전이 재현:** 자료 완료 단계 1에서 이벤트를 `map → icons` 순서로 넣으면 `stage=4`, `idleReceived=false`, `dismiss=true`가 된다. 이는 현재 상태 전이식 재현이며, 프로덕션에서 이 이벤트 순서가 실제 발생하는 빈도를 측정한 것은 아니다.

**영향:** “건물 24,520동 입체 결합”이 실제 완료 확인 전 체크되고 100%로 표시될 수 있다. 타일 오류도 성공과 같은 완료 수에 더해진다. 25초 제한으로 커튼을 걷는 정책 자체보다는 정상 준비 완료와 제한시간 종료를 구분하지 못하는 점이 문제다.

**권고:** 자료·지도·건물·아이콘 준비를 독립 상태로 기록하고 필요한 조건을 모두 만족할 때 정상 완료로 표시한다. 타임아웃·타일 실패는 저하 상태로 구분한다.

**수정 후 통과 조건:** `map → icons → idle`, `map → idle → icons`, 타일 실패, 25초 초과 각각에서 표시가 실제 준비 상태와 일치해야 한다.

## 4. 이번에 통과한 확인

| 확인 | 결과 |
|---|---|
| `GET /dumping` | HTTP 200, 로그인 화면 표시, `x-vercel-cache: HIT` |
| `GET /api/dumping/auth` (쿠키 없음) | HTTP 200, `{"ok":false}` |
| `GET /api/dumping/data/{map,graph,interventions,bin-recos}` (쿠키 없음) | 모두 HTTP 401, `{"error":"unauthorized"}` |
| `/dumping` 색인 헤더 | `X-Robots-Tag: noindex, nofollow` |
| `/dumping` 마이크 정책 | `camera=(), microphone=(self), geolocation=(self)` |
| `/dumping` CSP | `frame-ancestors 'none'; object-src 'none'; base-uri 'self'` |
| dumping·onto 관련 테스트 | **90/90 통과** |
| TypeScript | `tsc --noEmit --incremental false` 성공 |
| 대상 경로 ESLint | `components/dumping lib/dumping app/dumping app/api/dumping` 성공 |

테스트 명령:

```sh
node_modules/.bin/tsx --test tests/dumping-*.test.ts tests/onto-*.test.ts
node_modules/.bin/tsc --noEmit --incremental false
node_modules/.bin/eslint components/dumping lib/dumping app/dumping app/api/dumping
```

통과한 기존 테스트가 F1~F5의 실패 경로를 보장하는 것은 아니다. 이번에는 코드·테스트 파일을 새로 만들거나 고치지 않았으며, 재현은 프로세스 내 모의 응답으로 수행했다. `next build`는 복호화·`.next` 산출물 변경을 동반하므로 실행하지 않았다. 따라서 빌드 성공을 이번 결과로 주장하지 않는다.

## 5. 후속 검증과 운영상 한계

1. 배포 SHA를 확인해 이번 로컬 발견의 적용 여부부터 대조한다.
2. 인증된 실제 브라우저에서 탭 5개, 정책 지도 반영·해제, 후보 초점, 모달 키보드, 시연 시작·종료를 확인한다. 모바일과 시연 화면 폭을 각각 확인한다.
3. F1을 먼저 보완해 불완전 답을 완성된 분석으로 취급하지 않도록 한다. F3·F4는 재로그인과 자료 복구 시나리오로 함께 검증한다.
4. 세션 만료를 서버에서 강제할지 운영 정책을 확정하고 F2를 처리한다. 분산 환경의 로그인 한도는 인스턴스별 메모리 제한만으로 보장되는지 별도 확인한다. 이번에는 실제 우회나 공격을 시도하지 않았다.
5. F5를 느린 네트워크와 타일 장애 조건에서 검증한다. 실제 성능·음성 품질은 기존 기록 대신 최종 시연 장비에서 다시 확인한다.

변경 결과: 이 리뷰 문서만 추가했다. 시작 시 존재하던 `.codex/` 미추적 내용과 `docs/dumping-ux-audit/r19-prod-scene5-candidates.png`는 보존했다.

## 6. 반영 (2026-09-21 밤)

F1~F5 전부 코드 반영. 호출어 "김주임" → "지니"·"지니야"(사용자 지시) 동시 처리.

| ID | 반영 | 근거 파일 | 검증 |
|---|---|---|---|
| F1 | 서버가 상류 완료 시에만 `ASK_DONE`(NUL+`DONE`), 단절·55초 타임아웃·`finishReason≠STOP`은 본문 뒤 `ASK_ERR`. 클라이언트는 `feedAsk`/`endAsk`가 첫 NUL 이후를 모아 표식이 청크 경계에서 잘려도 해석. 완료 표식 없는 답은 `aborted:"cut"`("끊김 · 다시 묻기")으로 재사용 제외, 사용자 중단은 `"user"` | [ask/route.ts](../app/api/dumping/ask/route.ts), [answer-parts.ts](../lib/dumping/answer-parts.ts), [qa-chat.tsx](../components/dumping/qa-chat.tsx) | 3절 재현 재실행: 정상 `<ACCEPT>…<DONE>`, 단절 `<ACCEPT>partial answer<ERR>답변이 중간에 끊겼습니다…`, MAX_TOKENS `<ERR>답이 끝까지 오지 않았습니다…`. 표식 5글자 모든 분할 위치 단위 테스트. 브라우저: 끊긴 답 재질문 시 모델 호출 다시(1→2), 완성 답은 재사용(4→4) |
| F2 | 토큰 v3 = `만료초.HMAC(키, 만료초\|비밀번호)`, `verifyToken(token, now)`이 만료·서명 검증. `AUTH_TTL_S` 하나가 쿠키 maxAge와 서버 만료 | [auth.ts](../lib/dumping/auth.ts), [auth/route.ts](../app/api/dumping/auth/route.ts) | 만료 직전 통과·만료 뒤 366일 재전송 거부·만료 늘린 변조·서명 변조·키 회전 단위 테스트. 브라우저: 변조 쿠키 `auth ok:false`·`data 401` |
| F3 | 대시보드가 마운트 때 선행 약속을 ref로 받아 첫 로드에 한 번만 쓰고 비움, 내려갈 때 `resetDumpingData()`. 재시도·재로그인은 `fetchBundle()` | [data-early.ts](../components/dumping/data-early.ts), [dumping-dashboard.tsx](../components/dumping/dumping-dashboard.tsx) | 단위 테스트: 비운 뒤 재시작이 인증 요청 다시·실패 판정이면 자료 요청 없음. dev StrictMode는 이중 마운트로 요청이 한 번 더 감(프로덕션 무관) |
| F4 | `fetchJson` 401은 `AUTH_EXPIRED`, 대시보드가 이 오류만 `setAuth("locked")`. 그 밖은 기존 "다시 시도" 띠 | [data-early.ts](../components/dumping/data-early.ts), [dumping-dashboard.tsx](../components/dumping/dumping-dashboard.tsx) | 브라우저: `auth` 통과 뒤 `map` 401 → 로그인 화면(띠 없음) → 재로그인 → 새 번들로 복구(map 요청 3) |
| F5 | 4단계를 독립 플래그로 받고 앞에서부터 연속 완료 수가 진행 단계(`loadStageOf`). 단계 표시는 제 플래그, 진행률·커튼 걷힘은 연속 단계. 타일 실패는 도착 수에서 분리해 "실패 n" 병기 | [load-stage.ts](../lib/dumping/load-stage.ts), [dumping-dashboard.tsx](../components/dumping/dumping-dashboard.tsx), [dumping-map.tsx](../components/dumping/dumping-map.tsx) | 단위 테스트: map→icons→idle은 2에서 4로(icons 먼저 와도 03 미완), map→idle→icons는 3→4, 자료 전엔 0. 25초 상한은 그대로(걷힐 때 표시는 실제 상태) |

호출어: [wake.ts](../lib/dumping/wake.ts) `WAKE_WORD`="지니"(버튼), `WAKE_CALL`="지니야"(안내). 변형 지니야·지니님·지니아·진이야·찌니야·찌니·지니. "지니"는 "많아지니까"·"빠지니"처럼 서술어 끝에 흔해 앞뒤가 문장 처음·끝·띄어쓰기·문장부호일 때만 호출어(단위 테스트: "민원이 많아지니까 어떻게 해"·"사진이야"는 무시). 카드 바닥 지름길 "지니에게 물어보기".

검증 명령과 결과: `tsx --test tests/*.test.ts` 335/335(dumping·onto 106), `tsc --noEmit` 통과, `eslint components/dumping lib/dumping app/dumping app/api/dumping` 통과, Playwright 실측 23/23(dev 3001, 로그인은 컨텍스트 요청 Origin 3000).

운영 영향: 토큰 형식이 바뀌어 배포 시점에 발급된 쿠키가 전부 무효(한 번 재로그인). 프로덕션 시연 전 재로그인 필요.

미반영·후속: 5절 1·2·5(배포 SHA 대조, 인증 후 데스크톱·모바일 전수, 느린 네트워크·타일 장애 조건의 F5)는 배포 뒤 실측 대상. `/snow` 물어보기(`/api/snow/ask`·`ask-panel.tsx`)는 같은 스트림 규약을 쓰지만 이번 범위 밖이라 완료 표식 미적용(같은 F1 결함 잠복).
