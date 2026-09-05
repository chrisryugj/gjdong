gjdong `/dumping`(클린광진 상황실) 4라운드: K-apt 실측 세대수 결합 + 출품 공고 대조 + 보안 마무리 + 공간 모형. 3라운드(2026-09-05 밤, gjdong cc65302, 비공개 f5ea1db)까지 끝난 상태에서 시작한다. 추측하지 말고 아래 순서로.

## 0. 시작 전 동기화·기준선
- `cd ~/workspace/gjdong && git pull`, `cd ~/workspace/gwangjin-dumping && git pull`
- `npm run dumping:decrypt`(키 `.env.local` `DUMPING_DATA_KEY`)로 map.json 복원
- 먼저 읽을 것: `docs/dumping-contest-review.md` 7절(3라운드 결과·전수점검·디자인·출품 대조·남은 일), `docs/dumping-stats-explainer.md` 15a·15b·15c, CLAUDE.md 7번 항목 끝 "3라운드" 문단, 메모리 `project-gjdong-dumping-dashboard`
- 기준선: `npm test`(205), `npm run lint`, `npx tsc --noEmit`, `npm run build`, 비공개 `.venv/bin/python REPRODUCE/verify.py`(해시 110·수치 10). 프로덕션 `/dumping` 200, `/api/dumping/data/map` 401, raw map.json 404
- ★`npm run build`의 decrypt가 평문 map.json을 .enc로 덮는다. 재수출 뒤 반드시 `npm run dumping:encrypt` 먼저
- ★순서: 비공개 `make_manifest.py` → `export_dashboard.py` → gjdong encrypt. 반대로 하면 map.meta 해시 수와 테스트 핀(110)이 어긋난다
- ★프로덕션 비번은 `vercel env pull`로 받아 env로 넘기고 파일은 지운다. 로컬 `.env.local` 값과 다르다
- ★3라운드 결론: 겨냥점은 "관리주체 없는 주거"가 아니라 "다가구·단독주택 밀집"(세 갈래 모형 v4b, 다세대·연립 비유의). 화면·프롬프트(규칙 14·15)·문서가 이미 이렇게 돼 있다. 옛 표현으로 되돌리지 말 것

## 1. K-apt 실측 세대수 결합 (비공개 레포)
- 키는 `.env`의 `DATA_GO_KR_KAPT_KEY`(URL 인코딩 그대로, gjdong `DATA_GO_KR_KEY`와 다름). `python scripts/fetch_kapt_basis.py` 재실행. 3라운드에서는 상류가 HTTP_ERROR(04)·타임아웃으로 0/86이었다(토요일 밤). 이번에도 안 되면 요일·시간 바꿔 두 번까지, 그래도 안 되면 data.go.kr 오류 신고 후 대장 조인값으로 간다
- 받으면 `build_kapt_layer.py`에 `kapt_basis.json`이 있을 때 API 세대수(kaptdaCnt)·동수·승강기·난방을 대장 조인값 옆에 싣는다. 세대수 불일치(API vs 대장 hhldCnt 합) 단지 수·비율을 `crossCheck`에 추가. 의무관리 기준(300세대, 150세대+승강기/중앙난방)으로 단지를 분류해 "자발 등록" 단지 수를 센다
- 단지 목록 API(15057332)는 미신청. 신청은 사용자 결정. 신청되면 K-apt 등록 전체(의무+자발)로 `managed_kapt`를 다시 만들고 v4b 재적합
- `regression_v2.py` v4b가 바뀌면 export 주석 레이어(`ev-kapt-proxy` summary)·gjdong 발견 카드 "대리변수 검증"·QA 시드 문구가 자동으로 따라오는지 확인. 수치가 바뀌면 `tests/dumping-facts.test.ts`·`onto-queries.test.ts` 핀을 의도 확인 후 갱신

## 2. 출품 공고 대조
- 사용자가 준 공고(9월 시작·10월까지 접수)를 원문으로 읽고 `docs/dumping-contest-review.md` 7.5절을 교체: 대회명·주최·접수 마감·필수 데이터군·제출 형식(보고서/발표/코드/시연 링크)·공개 검증 범위·심사 기준. 각 요건에 지금 산출물이 무엇으로 답하는지 표로. 없는 것은 "없음"이라고 쓴다
- 제출물이 문서라면 `docs/dumping-stats-explainer.md`와 검토서 강점 서사(6.3)를 바탕으로 초안. 줄표 금지, 금지 문구 목록(검토서·해설서 "쓰지 않을 말") 그대로 적용
- 심사에 코드 공개가 있으면 비공개 레포의 개인정보 전처리(`scripts/sanitize.py`) 범위와 `data/public` 재생성 여부 확인

## 3. 보안·운영 마무리
- `DUMPING_PASSWORD` 긴 문구로 교체 + `DUMPING_COOKIE_SECRET` 설정(Vercel production, 현재 둘 다 짧거나 비어 있음). 바꾸면 발급 쿠키 전부 무효. 시연 일정 확인 후 실행하고 `scripts/dumping-qa-eval.mjs`로 로그인 재확인
- rate limit이 인스턴스 로컬이라 전역화(Upstash) 여부는 사용자 결정. 하지 않으면 검토서에 한계로 유지
- 조치 대장 실등록: 구청과 협의된 개입이 있으면 `data/dumping/interventions.json`에 1건 등록(registeredAt 채움)

## 4. 통계 보강 (시간 남으면)
- 공간 시차·오차 모형: `.venv`에 `spreg`(pysal) 설치 가능한지 확인 후 v3 변수로 SAR·SEM 적합. 무관리주거 β 부호·유의 유지 여부만 본다. 결과는 `audit_stats.py`에 항목 7로 추가, 해설서 15c 표에 한 줄
- 200m에서만 apt_hh가 유의한 현상(p=0.033)을 격자 원점 이동(50m 오프셋 4방향)으로 재확인. 한 원점에서만 나오면 우연으로 확정
- 생활쓰레기 계열만 회귀(담배꽁초 차량 제외)는 격자별 품목 집계가 필요. `build_decision_layer.py` 품목 분류를 셀 단위로 내보낼 수 있는지 확인 후 판단

## 5. 화면 재확인
- 프로덕션을 1440·1024·390에서 Playwright로 찍는다(스크립트: 스크래치패드 `shots.mjs` 방식, `character-card/node_modules/playwright`, 로컬은 `next start -p 3000`만 로그인됨). 확인할 것: 정책 탭 결론 히어로 수치가 facts와 같은지, 레이어 토글이 xl 미만에서만 보이는지, β 차트 13변수가 넘치지 않는지, 발견 카드 14장 순서, 인쇄(동 브리핑) A4 한 장
- QA 평가셋 7문항 재실행. ★답이 짧게 끊기면 `app/api/dumping/ask/route.ts`의 `maxOutputTokens`(현재 8192)부터 본다. 사고 토큰이 한도를 같이 쓴다

## 6. 반영 원칙 (변함없음)
- 숫자는 `lib/dumping/facts.ts` 파생. 문장에 박지 말 것
- 그래프 결함은 비공개 `export_dashboard.py` 주석 레이어. `ontology.db` 불변
- 한국어 산출물 줄표(—) 금지. 존댓말은 화면, 반말은 코드 주석. 윤문 신경 쓸 것(사람 글처럼)
- 금지 문구: "신고와 무관한 실측", "인구를 통제했다", "등록인구는 넣지 않았다", "관리주체가 없어서 생긴다", "반증", "낙관 편향 없음", "모든 수치 재현", "원인 규명", "효과 입증"
- 커밋·푸시 main 직접. 계획은 `.claude/plans/2026-MM-DD-dumping-round4.md`에 먼저

## 7. 산출물
1. 비공개 레포: kapt_basis 결합·crossCheck 확장·(가능하면) 공간 모형·manifest·verify 통과
2. gjdong: 카드·시드·테스트 갱신, 공고 대조 절, 보안 설정, 배포 확인, QA 7/7
3. 마지막 보고: API 세대수 vs 대장 불일치 표, 공고 요건 대조표, 네가 결정할 것만 짧게
