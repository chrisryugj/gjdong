gjdong `/dumping`(광진구 무단투기 분석 대시보드 "클린광진 상황실") 6라운드 인계. 5라운드(2026-09-05)까지 통계·데이터·정보구조·카피 작업을 마쳤고, 냉독 판정은 공모전 평가자 "일부 가능"·정책 결재선 "불가능 → 일부 가능"이다(남은 막힘은 자료가 없는 것들). 검토서 `docs/dumping-contest-review.md` 9절과 감사 `docs/dumping-ux-audit-2026-09-05-r5.md`(냉독 전후 표, 카드 순서 근거)가 5라운드 정본이고, 아래 이월 목록이 검토서 9.4보다 우선한다. 데이터·분석 스크립트는 비공개 레포 `~/workspace/gwangjin-dumping`(원자료에 건별 기록이 있어 공개 레포에 없다)에 있고, gjdong의 `data/dumping/map.json`은 암호문(.enc)만 커밋돼 `npm run dumping:decrypt`로 푼다. 남은 일은 셋뿐이고 전부 사용자 결정이 먼저다. 6라운드(2026-09-05)는 자료 없이 되는 작은 것 4건만 고쳤다(아래).

## 남은 일
1. 출품 공고 원문 대조. 어느 대회에 내는지 공고 링크나 파일을 받으면 요건 대조표를 검토서에 절로 더한다(7.5절이 후보만 적어 둔 상태)
2. `DUMPING_PASSWORD` 긴 문구 교체와 `DUMPING_COOKIE_SECRET` 설정. 지금은 시크릿이 비어 있어 `lib/dumping/auth.ts`가 비밀번호를 HMAC 키로 대신 쓴다(의도된 폴백, 코드 수정 없이 Vercel env만 넣으면 된다). 바꾸면 발급된 쿠키가 전부 무효라 시연 직전은 피한다. Vercel 프로젝트는 standard_address_translator
3. 조치 대장(개입 사전등록부, 대책을 시행하기 전에 대상 격자·기간·비교 대상·판정 지표를 적어 두는 장부) 실등록 0건. `data/dumping/interventions.json`에 항목을 넣는 것은 구청 협의 사항(파일 안 예시 항목이 스키마)

## 5라운드 냉독이 찾았지만 자료가 없어 못 고친 것 (사용자가 자료를 주면 고친다)
- 결재용 한 장의 "안 하면 어떻게 되나"와 예산 필요 제안(다가구 공동배출시설)의 금액. 둘 다 추정 자료가 없다
- 결재용 한 장의 시행 시기·시범 동·평가 보고 시점(냉독 2회차 지적, 자료 없음)
- 재배치 후보 20 vs 예측 핫스팟 20의 관계 설명은 운영 탭에만 있다

## 6라운드(2026-09-05)에서 고친 것 (검토서 10절)
- 연도별 차트 범례 "과태료(단속 실측)" → "과태료(신고 유래 83%)"(`qa-chart.tsx`, 비율은 facts 파생. 5라운드가 "β 차트"라 적은 것은 위치 오기)
- 첫 화면 "33→12곳" → "12곳" + 꼬리표 "앱 신고를 빼고 센 수(넣으면 33곳)"(`policy-board.tsx`)
- "순찰 적발 0.49배" 꼬리표에 "최근 2~3개월은 부과 지연으로 과소집계"
- 방법 모달 자료 표 가로쓰레기통 "128개 · 64개 위치, 한 위치에 통 두 개씩"(`methods-modal.tsx`). 지도 레이어 칩 128은 그대로

## 사용자 결정이 남은 문장
- 헤드라인 "늘어난 것은 발생이 아니라 신고 창구입니다"가 물어보기 첫 답의 유보("발생 증가를 배제하지는 못합니다")보다 세다. 결론 문장을 바꿀지는 사용자 결정

## 시작 전 확인
- `cd ~/workspace/gjdong && git pull`, `/opt/homebrew/bin/npm run dumping:decrypt`, `/opt/homebrew/bin/npm test`(전체 스위트 211)
- 3해상도 캡처 Playwright 스크립트와 문장 추출 스크립트는 세션 임시물이라 남아 있지 않다. 캡처는 `character-card/node_modules` playwright + `ctx.request.post(BASE + "/api/dumping/auth", {data:{password}, headers:{origin: BASE}})` 로그인으로 다시 쓴다(로컬은 `next start -p 3000`만 로그인됨). QA 평가셋은 `DUMPING_PASSWORD=<비번> node scripts/dumping-qa-eval.mjs http://localhost:3000`
- npm은 항상 `/opt/homebrew/bin/npm` 절대경로(rtk 훅이 pnpm으로 바꿔 node_modules를 부순 사고)
- 카피 게이트는 `tests/dumping-copy.test.ts`가 지킨다(변수명 하나·줄표 0·챗봇 말투 0·금지 문구 0·카드 순서). 문장을 고치면 이 테스트부터
