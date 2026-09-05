gjdong `/dumping`(클린광진 상황실, https://gjdong.vercel.app/dumping) 5라운드: 두 독자(공모전 평가자, 광진구 정책 결재선)가 각자 5분 안에 판단을 끝낼 수 있게 화면 구조와 카피를 리팩토링한다. 4라운드(2026-09-05 저녁, gjdong a95dbad, 비공개 0d07b5d)까지 통계·데이터는 끝났다. 이번 라운드는 숫자와 모형을 건드리지 않는다. 그래프 노드의 한글 라벨과 문장은 바꾸므로 재수출은 수정이 끝난 뒤 한 번 한다(4절 첫 단계, 절차는 0절). 추측하지 말고 아래 순서로.

## 0. 시작 전 동기화·기준선
- `cd ~/workspace/gjdong && git pull`, `cd ~/workspace/gwangjin-dumping && git pull`
- gjdong에서 `/opt/homebrew/bin/npm run dumping:decrypt`(키 `.env.local` `DUMPING_DATA_KEY`)로 `data/dumping/map.json` 복원. 평문은 gitignore, 커밋되는 것은 `.enc`
- 먼저 읽을 것: gjdong `docs/dumping-contest-review.md` 7·8절, `docs/dumping-stats-explainer.md` "쓰지 않을 말", gjdong `CLAUDE.md` 7번 항목(`/dumping` 문단), 메모리 `project-gjdong-dumping-dashboard`
- 기준선: `/opt/homebrew/bin/npm test`(206), `/opt/homebrew/bin/npm run lint`, `npx tsc --noEmit`, `/opt/homebrew/bin/npm run build`. 프로덕션 `https://gjdong.vercel.app/dumping` 200, `/api/dumping/data/map` 401, `/data/dumping/map.json` 404
- 탭 5개: 정책 제안, 물어보기, 발견, 운영·전망, 온톨로지. 헤더 오른쪽에 "데이터·방법" 버튼(모달). 발견 탭에서 동을 고르면 "동 브리핑 인쇄" 버튼이 나오고 모달(`#dump-brief`) 안 "인쇄 / PDF 저장"이 `window.print()`다
- ★gjdong에서 npm은 항상 `/opt/homebrew/bin/npm` 절대경로. rtk 훅이 `npm run`을 pnpm으로 바꿔 node_modules를 부순 실사고가 있다. 부서지면 `git checkout pnpm-lock.yaml && rm -f pnpm-workspace.yaml && rm -rf node_modules/.ignored && /opt/homebrew/bin/npm ci`
- ★재수출 절차(실행 시점은 4절 첫 단계. 비공개 레포 `~/workspace/gwangjin-dumping`, 파이썬은 `.venv/bin/python`): `scripts/make_manifest.py`(코드 해시 포함, 스크립트를 고쳤으니 필수) → `scripts/export_dashboard.py`(gjdong `data/dumping/map.json`·`graph.json`에 쓴다) → `REPRODUCE/verify.py`(해시·수치 10개 통과) → gjdong `/opt/homebrew/bin/npm run dumping:encrypt`. 주의: gjdong `npm run build`는 시작할 때 `.enc`를 평문 `map.json` 위에 다시 풀어 쓴다. 그래서 재수출한 평문을 encrypt로 `.enc`에 먼저 넣지 않고 build부터 돌리면 재수출 결과가 사라진다. 해시 핀은 `tests/dumping-facts.test.ts`의 `reproduce.hashes` 113이고 파일 개수 핀이지 해시 값 핀이 아니다. 코드 해시 값이 바뀌는 것은 verify.py가 새 매니페스트로 대조하니 문제없고, 파일 수가 늘지 않으면 113 그대로다. 재수출 전후로 수치가 같은지는 `map.json`의 `decision.regressionV2.proxyCheck.split`·`kpi`·`fines.byRoute` 값을 직접 찍어 비교한다
- ★프로덕션 비번은 gjdong 디렉토리(Vercel 프로젝트 standard_address_translator에 링크됨)에서 `vercel env pull --environment=production <파일>`로 받아 `DUMPING_PASSWORD`를 env로 넘기고 파일은 지운다. 로컬 `.env.local` 값과 다르다. `/dev/stdout`은 안 된다
- ★Playwright 스크립트는 스크래치패드에 다시 쓴다(`createRequire("/Users/chris_gomdori/workspace/character-card/node_modules/playwright/package.json")`, 로그인은 `ctx.request.post(BASE + "/api/dumping/auth", {data: {password}, headers: {origin: BASE}})`). 로컬은 `next start -p 3000`만 로그인된다(다른 포트는 `proxy.ts` ALLOWED_ORIGINS 밖). QA 평가셋은 `node scripts/dumping-qa-eval.mjs http://localhost:3000`처럼 URL 인자를 받는다

## 1. 두 독자 냉독 (고치기 전에 진단만)
프로덕션을 1440·1024·390에서 탭 5개, 모달(데이터·방법, 발견 카드 상세, 제안 이유 보기, 동 브리핑), 인쇄 PDF(`page.emulateMedia({media:"print"})` 뒤 `page.pdf({format:"A4"})`)까지 찍는다. 캡처와 각 화면 innerText만 주고 컨텍스트 없는 서브에이전트 둘에게 각각 읽힌다. `shower` 스킬 방식. 질문은 이 둘뿐.

- 공모전 평가자: "이 분석이 무엇을 밝혔고, 근거가 어디 있고, 다른 구에서 재현 가능한가를 5분 안에 알 수 있나. 첫 화면에서 데이터 출처, 방법, 결론, 한계로 가는 길이 보이나. 못 찾은 것, 헷갈린 용어, 신뢰가 깎인 지점을 화면 위치와 함께 적어라."
- 정책 결재선(과장, 국장, 부구청장, 구청장): "무엇을 결정해 달라는 건지, 돈이 얼마 드는지, 누가 하는지, 안 하면 어떻게 되는지를 한 장에서 읽을 수 있나. 통계 용어 없이 이해되나. 인쇄해서 결재판에 끼울 수 있나. 막힌 지점을 적어라."

진단 결과는 `docs/dumping-ux-audit-2026-09-05-r5.md`(같은 날이면 `-r5`, 다른 날이면 날짜만)에 두 독자 표로 남긴다(지적, 화면 위치, 증거 캡처, 조치). 캡처는 스크래치패드에서 찍고, 감사 문서가 인용하는 것만 `docs/dumping-ux-audit/` 폴더에 PNG로 커밋한다(1440 기준 전후 합쳐 10장 이내, 장당 500KB 이하). 나머지 캡처는 세션과 함께 사라져도 된다. 아래 "이 세션에서 본 것" 8건은 냉독 결과와 무관하게 고친다. 냉독이 그중 몇 개를 다시 찾는지는 냉독의 신뢰도 참고이고, 냉독이 새로 찾은 것은 근거 캡처가 있을 때만 2절에 추가한다. 진단이 끝나면 그때 `.claude/plans/2026-09-05-dumping-round5.md`에 계획을 쓰고 시작한다.

이 세션에서 본 것(4라운드 캡처 기준, 전부 고친다):
1. 헤더 "지식 102 · 연결 155"는 결재선에게 뜻이 없다. 탭 이름 "온톨로지"도 마찬가지
2. 발견 탭은 "기존 해석 vs 이 분석" 12칸이 먼저 오고 카드 14장이 그 아래다. 평가자는 카드가 먼저 보여야 한다. 결재선은 발견 탭에 오지 않고 정책 제안 탭에서 끝나야 한다
3. 변수 이름이 둘이다. 지도 범례, β 차트, 브리핑, 방법 모달, 레버 라벨은 "무관리주거(관리주체 없는 주거단위)"이고 결론과 카드는 "다가구·단독주택 밀집"이다. 같은 계산 변수다(`unmanaged_units` = 건축물대장 다가구 가구수 + 일반단독 동수, 비공개 `build_ledger_layer.py` 머리 주석과 해설서 15b). 3라운드에서 결론만 옮기고 변수명은 남겼다. 이름은 "다가구·단독 밀집"으로 확정한다(프롬프트 규칙 15와 발견 카드가 이미 이 이름). 정의 "(건축물대장 다가구 가구+일반단독 동)"는 방법 모달의 변수 설명 한 곳과 지도 범례 도움말 한 곳에만 붙인다. "무관리", "관리주체 없는 주거"는 그 두 정의 문장 안에서도 쓰지 않는다. 남는 예외는 발견 카드 "대리변수 검증"과 해설서·검토서에서 3라운드 결론을 설명하는 "관리주체가 없어서가 아니라" 구문뿐이다
4. 동 브리핑 핫스팟 목록에 "(주소 미상)" 행이 그대로 찍힌다(`briefing-modal.tsx` 107행, 지오코딩 안 된 격자). 중곡1동 캡처에서 확인
5. 물어보기 탭 시드 14개 중 앞 3개가 기본 펼침(`DEFAULT_OPEN = 3`). 시드 답 첫 문장에 "좋은 질문이고, 이번에 확인한 내용입니다" 같은 챗봇 말투가 있다
6. 정책 탭 제안 6건은 "제안 이유 보기"를 눌러야 담당·검증이 보인다. 예산 등급(무예산·저비용·예산 필요)은 그래프 레버 노드의 `cost` 속성에서 오고 `policy-board.tsx`가 그 순서로 정렬한다. 담당·검증 문구도 레버 노드에 있다. 결재선은 그 넷을 표 한 장으로 필요하다. 새 판단을 쓰는 게 아니라 있는 속성을 표로 펼치는 일이다
7. 데이터·방법 모달과 재현 패키지는 헤더 버튼 하나 뒤에 있다. 평가자가 첫 화면에서 그 길을 못 본다
8. 390px에서 지도가 위 절반을 고정 점유하고 결론은 스크롤 뒤에 있다

## 2. 정보구조 리팩토링
원칙: 새 데이터 없음, 새 페이지 없음, 기존 컴포넌트를 옮기고 줄이고 이름을 바꾼다. 컴포넌트 신설은 기존 것으로 정말 안 될 때만.

- 첫 화면(정책 제안 탭)에 두 독자의 진입점을 나눈다. 결재선은 "결론 한 줄 + 수치 3(지금 히어로에 있는 다가구·단독 β, 순찰 적발 배율, 상습격자 앱 제외. 전부 `facts.ts` 파생) + 제안 표 + 인쇄". 평가자는 "데이터 → 방법 → 결론 → 한계 → 재현"으로 가는 링크 줄 하나(데이터·방법 모달의 두 섹션, 발견 탭, 해설서 링크, REPRODUCE). 둘 다 1440에서 스크롤 없이 첫 화면 안에서 시작해야 한다
- 제안 6건을 표로: 제안, 예산 등급, 담당, 검증(사전등록 후 무엇으로 판정), 근거 카드(기존 "제안 이유 보기" 모달을 여는 버튼이면 된다). 카드는 유지하되 표가 먼저. 결재선용 인쇄는 이 표와 결론 한 줄이 A4 한 장에 들어가야 한다. 동 브리핑 모달을 재사용할 수 없으면 정책 탭 인쇄용 id 하나를 새로 두고 같은 `body:has(#id) #id *` 특이성 패턴을 쓴다. 이것은 허용되는 신설이다
- 발견 탭: 카드 14장을 먼저, "기존 해석 vs 이 분석"은 접힌 절로. 카드 순서는 태그 기준으로 결론(최강 예측변수, 대리변수 검증) → 근거(채널 분해, 순찰 적발, 노출 통제, 격자 민감도, 백테스트) → 한계·철회(CCTV DID, 우측 절단, 구조 전망)로 세션이 정하고 그 근거를 감사 문서에 적는다. 바꾸는 것은 `findings-data.ts`의 push 순서뿐
- 탭 이름과 헤더: "온톨로지"는 "근거 그래프" 같은 우리말로. 헤더에는 지금도 기간, 민원 3,462건, 과태료 3,247건이 facts 파생으로 떠 있다. 그 셋만 남기고 그래프 규모(노드·엣지 수)는 근거 그래프 탭 안으로
- 변수명 통일(1절 3번 결정대로). 바꾸는 곳: `map-controls.tsx` 범례·바탕 설명, `qa-chart.tsx` β 차트 라벨, `briefing-modal.tsx`, `methods-modal.tsx`, `lever-view.ts` 라벨, `contrast-panel.tsx`, `ops-panel.tsx`, `findings-data.ts`, `qa-chat.tsx`, `lib/dumping/context.ts`, 그리고 비공개 `export_dashboard.py`의 Covariate 한글 라벨(`COV_KO`)과 노드 이름·요약 문자열. `grep -rn "무관리\|관리주체 없는" components/dumping lib/dumping data/dumping/graph.json data/dumping/map.json`이 0이어야 한다("관리주체가 없어서가 아니라"는 패턴에 걸리지 않는다). `scripts/dumping-qa-eval.mjs`의 must 패턴도 새 이름을 받게 고친다
- 동 브리핑: "(주소 미상)" 행은 빼거나 "주소 없음(격자 id)"로. A4 한 장은 유지. 인쇄 CSS `body:has(#dump-brief) #dump-brief *`는 4라운드에서 백지를 고친 것이니 특이성을 낮추지 않는다
- 390px: 결론이 지도보다 먼저 보이게 한다. 방법은 순서 교체가 먼저, 안 되면 지도를 접힌 상태로 시작. 지도 기능은 줄이지 않는다

## 3. 카피 윤문과 슬롭 제거 (측정 가능한 게이트)
- 줄표(—) 0. 지금 실측: UI 문자열 약 51곳(주석 제외), 프롬프트 `context.ts` 25곳, 내보낸 `graph.json` 15곳·`map.json` 1곳(대부분 비공개 `export_dashboard.py` 문자열. 출처가 `ontology.db` 노드 텍스트인 것은 db를 두고 export에서 치환한다), 결측 표시 `?? "—"` 20여 곳, 코드 주석과 `app/globals.css` 주석에 그 이상. 결측 표시는 "미산출" 하나로 통일. 주석의 줄표도 이번에 같이 없앤다(이 문서가 인접 코드 수정 금지의 예외로 허용한다. 주석 줄표 치환 커밋은 따로 만든다). 검사 범위와 명령: `grep -rn "—" components/dumping lib/dumping app/dumping app/globals.css data/dumping/graph.json data/dumping/map.json scripts/dumping-qa-eval.mjs tests | wc -l`이 0(복호화된 map.json 기준)
- 화면 문장은 존댓말, 코드 주석은 반말, 프롬프트 `context.ts`는 지금처럼 반말 지시문 유지. 범례·표 머리·배지 같은 명사형 라벨은 존댓말 규칙 밖. 한 칸에 한 문장, 한 문장에 숫자 하나
- 금지 문구(검토서·해설서 "쓰지 않을 말") 그대로: "신고와 무관한 실측", "인구를 통제했다", "등록인구는 넣지 않았다", "관리주체가 없어서 생긴다", "반증", "낙관 편향 없음", "모든 수치 재현", "원인 규명", "효과 입증", "AI가 답한다"
- 챗봇 말투 제거: "좋은 질문", "살펴보겠습니다", "주의하세요", "~것으로 보입니다", "다음과 같습니다". 도입부 없이 답부터
- 윤문 검증은 `humanize` 스킬 `--strict`(5인 파이프라인). 입력은 코드 파일이 아니라 문장이다. 대상 파일(`findings-data.ts`, `qa-chat.tsx` 시드, `policy-board.tsx`, `briefing-modal.tsx`, `contrast-panel.tsx`, `methods-modal.tsx`, `ops-panel.tsx`, `ops-modal.tsx`, `lever-modal.tsx`)에서 한국어 문자열을 뽑아 md로 만들어 돌리고, `${...}` 표현식은 자리표(`〔1〕` 같은)로 바꿔 넣었다가 되붙인다. 추출·되붙임 스크립트는 스크래치패드에 두고 되붙인 뒤 `tsc`와 `npm test`가 통과해야 한다. 문구 테스트(`dumping-facts.test.ts`, `onto-queries.test.ts`)가 깨지면 문구를 먼저 의심하고, 핀은 그 테스트가 지키려던 의도(테스트 이름과 검토서 기록)를 확인한 뒤에만 바꾼다. 사용자에게 묻지 않고 바꾼 이유를 검토서 9절에 적는다
- 윤문 결과를 humanize의 자체 보고로 믿지 말고 `mandela` 스킬로 한 번 더 본다(PAX 기여 때 humanize 자체보고가 틀렸던 실사고). 시드 데이터를 `qa-seeds.ts`로 빼는 것은 이때 해도 된다
- 프롬프트 `context.ts`도 줄표 0과 금지 문구 기준은 같다. 모델이 프롬프트 문체를 따라 한다

## 4. 재수출, 검증, 배포 순서
- 수정이 끝나면 0절 절차대로 재수출 한 번(manifest → export → verify → encrypt). 3절의 `graph.json`·`map.json` 줄표 게이트는 이 뒤에 잰다
- 푸시는 곧 프로덕션 배포다. 그래서 검증은 로컬에서 끝내고 푸시는 한 번만 한다. 로컬: `/opt/homebrew/bin/npm run build && npx next start -p 3000`, 비번은 로컬 `.env.local`
- 로컬에서 확인: 테스트·lint·tsc·build 통과. 바꾼 결정적 문구(결론 한 줄, 변수명 통일, 탭 이름)는 테스트 하나 더. Playwright 3해상도 재촬영. 확인 항목: 첫 화면에 두 진입점, 제안 표, 변수명 한 이름, 발견 카드 14장 순서, 레이어 칩 줄이 xl(1280px) 미만에서만 "레이어 n/7" 토글 뒤로 숨음(`map-controls.tsx`), β 차트(`qa-chart.tsx` kind "beta", 13변수)가 부모 박스를 넘치지 않음, 브리핑 PDF가 A4 1장이고 `pdftoppm -r 60 -png`로 찍은 픽셀 최소값이 255가 아님(4라운드 백지 사고의 검사법), 콘솔 오류 0
- 로컬에서 QA 평가셋 7문항(`DUMPING_PASSWORD=<로컬> node scripts/dumping-qa-eval.mjs http://localhost:3000`). 결과는 `docs/dumping-qa-eval-2026-09-05-r5.md`(날짜가 다르면 날짜만). 이전 결과 파일은 그대로 둔다
- 1절 냉독을 같은 두 질문으로 새 서브에이전트에 로컬 캡처를 주어 다시 돌려 "막힌 지점"이 줄었는지 전후 표로. 줄지 않은 항목은 못 고쳤다고 쓴다
- 푸시 뒤 프로덕션에서 1440 정책 탭·발견 탭·브리핑 PDF만 다시 찍어 로컬과 같은지 확인. QA 평가셋도 프로덕션으로 한 번 더(사고형 모델 답 잘림은 `app/api/dumping/ask/route.ts` `maxOutputTokens` 8192부터 본다. 이 값은 모형이 아니라 운영 설정이니 올려도 된다)
- 마지막에 `sip` 게이트: 검토서 9절과 6라운드 인계 프롬프트를 `shower`로 냉독해 남이 이것만 보고 이해되는지. 판정이 "손봐야 함"이면 고치고 다시 읽힌다

## 5. 반영 원칙 (변함없음)
- 숫자는 `lib/dumping/facts.ts` 파생. 문장에 박지 말 것
- 그래프 결함과 노드 라벨은 비공개 `export_dashboard.py`. `ontology.db` 불변
- 한국어 산출물 줄표 금지. 존댓말은 화면, 반말은 코드 주석
- 파일 500줄 넘으면 분리 검토. 지금 `dumping-map.tsx` 582, `qa-chat.tsx` 563. 시드를 `qa-seeds.ts`로 빼는 정도까지. 그 이상의 구조 변경은 하지 않는다
- 인접 코드 개선 금지(3절 주석 줄표만 예외). 바꾼 줄이 전부 이 요청에 닿아야 한다
- 커밋·푸시 main 직접. 계획은 1절 진단 뒤 `.claude/plans/2026-09-05-dumping-round5.md`(날짜는 그날)에 먼저

## 6. 산출물
1. `docs/dumping-ux-audit-2026-09-05-r5.md`: 두 독자 냉독 전후 표
2. 화면: 첫 화면 두 진입점, 제안 표, 변수명 통일, 발견 탭 순서, 탭 이름·헤더, 브리핑 정리, 390 순서. 줄표 0, 챗봇 말투 0, 금지 문구 0
3. 검토서 `docs/dumping-contest-review.md` 9절: 무엇을 왜 바꿨는지, 냉독 전후, 못 고친 것. gjdong `CLAUDE.md` 7번 항목과 메모리 `project-gjdong-dumping-dashboard`에 5라운드 문단
4. `.claude/plans/NEXT-SESSION-dumping-round6.md`: 남은 일(출품 공고 대조, 비번·쿠키 시크릿 교체, 조치 대장 실등록)만 짧게. 이 둘은 사용자가 보류시킨 것이니 5라운드 보고에서 묻지 않는다
5. 마지막 보고: 냉독 전후 표, 줄표·금지 문구·변수명 grep 결과(명령과 숫자), 네가 결정할 것만 짧게
