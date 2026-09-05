# 새 세션용 프롬프트 — /dumping 프로덕션 리뷰 + 공모전 대비 리팩토링 2라운드

아래 블록을 그대로 새 세션 첫 메시지로 붙여 넣는다.

---

gjdong `/dumping`(클린광진 상황실)을 서울시 데이터 경진대회 출품 기준으로 한 번 더 프로덕션 리뷰하고 리팩토링하자. 30년차 시니어 데이터 아키텍트이자 온톨로지 전문가가 심사위원 자리에 앉았다고 생각하고, 부족한 것·개선할 것·강점으로 내세울 것을 전부 찾아서 코드와 문서에 반영해. 분석 없이 바로 추측하지 말고, 반드시 아래 순서로 실측부터.

## 0. 시작 전 동기화
- `cd ~/workspace/gjdong && git pull` (1라운드에서 이력을 `git filter-repo`로 재작성했다. 로컬이 갈라져 있으면 `git checkout -B main origin/main`, 로컬 작업 브랜치는 백업 후)
- `cd ~/workspace/gwangjin-dumping && git pull` (비공개 분석 레포, 데이터·분석 SSOT. `.venv/bin/python`에 statsmodels)
- `data/dumping/map.json`은 레포에 없다. `npm run dumping:decrypt`(키는 `.env.local`의 `DUMPING_DATA_KEY`)로 평문 복원 후 작업
- 이전 라운드 산출물부터 읽을 것: `docs/dumping-contest-review.md`, `docs/dumping-ontology.md`, `docs/dumping-production-review-2026-09-05.md`(코덱스 정적 리뷰), CLAUDE.md 7번 항목, 메모리 `project-gjdong-dumping-dashboard`

## 1. 전수 읽기 (건너뛰기 금지)
- `components/dumping/*`, `lib/dumping/*`, `app/api/dumping/**`, `tests/dumping-*.test.ts`, `tests/onto-*.test.ts`, `data/dumping/{graph,interventions}.json` + 복호화한 map.json
- 비공개 레포 `scripts/{export_dashboard,build_decision_layer,build_seoul_layers,regression_v2,diagnostics}.py`, `README.md`, `REPRODUCE/MODEL_SPEC.md`, `docs/NEEDED_DATA.md`
- 파일이 크면 offset/limit로 끝까지. 일부만 읽고 판단하지 말 것

## 2. 실측 게이트 (리뷰 전에 돌려서 기준선 확보)
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`
- 화면의 모든 숫자를 map.json·graph.json에서 node 스크립트로 재계산해 대조. 1라운드에서 "과태료 1.1배"가 데이터와 반대였던 전례가 있다. 정적 문자열에 박힌 수치는 전부 의심
- 프로덕션 `https://gjdong.vercel.app/dumping` 200, `/api/dumping/data/map` 비로그인 401, `raw.githubusercontent.com/chrisryugj/gjdong/main/data/dumping/map.json` 404 확인
- 비공개 레포 `python REPRODUCE/verify.py` 통과 확인

## 3. 리뷰 관점 (각 항목마다 결함/개선/강점을 분리해서)
- 데이터 아키텍처: 자료별 해상도와 격자 배정 방식, 시간 의미(접수 vs 위반 vs 발견), 분모(등록인구 vs 생활인구), 연환산·부분연도 표기, 정본(SSOT) 중복
- 통계·해석: 인과 표현, 비유의를 "무관"으로 번역하는 문장, 백테스트 누수, KPI의 신고편향, 표본 선택 대칭성, 격자 크기 민감도. 허용 표현은 "현재 자료·모형에서 연관을 확인하지 못함"류
- 온톨로지: `lib/dumping/schema.ts` 검증 오류·주의 0 유지, 역량 질문(`queries.ts`) 7개가 실제 공백을 드러내는지, 관계 의미 중복(`constrains`), KPI 노드 정의 혼재(격자 β vs 동 ρ), PROV 속성(source·asof·derived_by) 커버리지
- 제품·보안: 인증 게이트와 rate limit(인스턴스 메모리), 스트림 취소, 접근성(reduced-motion·키보드), 모바일, 인쇄, 질의응답이 프롬프트 규칙을 실제로 지키는지(철회 결론·what-if·집단 지목 질문 5종으로 직접 호출해 확인)
- 공모전: 서울 열린데이터광장 원천 사용 증빙(데이터셋 ID·구간·가공), 25개 구 일반화 가능성, 심사 예상 질문과 답, 쓰면 안 되는 과장 표현 목록

## 4. 반영 원칙
- 숫자는 `lib/dumping/facts.ts`류 파생 함수 한 곳에서. 문장에 숫자 박지 말 것
- 그래프 결함은 gjdong 정오표(`lib/dumping/errata.ts`)가 아니라 비공개 레포 `export_dashboard.py` 주석 레이어에서 고치고 재수출. `ontology.db`는 해시 잠금이라 불변
- 재수출 절차: `build_seoul_layers.py` → `.venv/bin/python regression_v2.py` → `build_decision_layer.py` → `export_dashboard.py` → gjdong `npm run dumping:encrypt` → 테스트 핀 갱신 → 커밋. 비공개 레포는 `make_manifest.py` + `verify.py` 통과 후 커밋
- 테스트가 답을 핀으로 박는다(`tests/onto-queries.test.ts` 등). 답이 바뀌면 의도인지 확인하고 테스트를 같이 고친다
- 한국어 산출물(문서·덱 카피·UI 문장)에 줄표(—) 금지. 존댓말은 화면, 반말은 코드 주석
- 커밋·푸시는 main 직접. `git push --force`는 훅이 막는다(필요하면 `+main`)
- 주요 판단은 계획 파일 `.claude/plans/YYYY-MM-DD-dumping-round2.md`에 먼저 적고 시작

## 5. 산출물
1. `docs/dumping-contest-review.md` 갱신(2라운드 절 추가: 발견한 결함·고친 것·남은 일·심사 문답)
2. 코드 수정 + 테스트(추가한 기능마다 테스트) + 빌드·린트 초록
3. CLAUDE.md 7번 항목·메모리 갱신
4. 마지막 보고: 실측으로 잡은 결함 목록, 강점 서사 순서, 네가 결정해야 할 것(데이터 공개 등급·비밀번호 교체 등)만 짧게

## 6. 이미 끝난 것 (다시 하지 말 것)
- 배율 연환산 일원화, "과태료 1.1배" 정정, 발견 카드 파생화, 표현 과장 전수 교정, QA 이력 컷 버그·스트림 취소
- 온톨로지 schema/queries/역량질문 UI, "기존 해석 vs 이 분석" 대비 보드
- 서울 데이터 6종 결합(생활인구 행정동·250m, 의류수거함, 목적별 CCTV, 스마트불편신고, 가로쓰레기통), v2 회귀·200m 민감도, KPI 앱제외판, 홀트윈터스 롤링 백테스트
- map.json 암호화 + 이력 정리

## 7. 알려진 잔여 (여기서부터 보면 됨)
- 생활쓰레기 계열만 회귀(담배꽁초 차량 28% 분리) — 격자별 품목 집계 필요
- 온톨로지 결함 1·2(KPI 노드 분리, `constrains` 의미 분리), 기존 59노드 PROV 속성
- 질의응답 고정 평가셋 자동화, rate limit 전역화(Upstash/KV), 조치 대장 실등록 0건, 지도 캔버스 격자 대체 표
- `DUMPING_PASSWORD` 4자리 숫자 → 긴 문구 교체 권고, GitHub 옛 SHA GC 요청
- 공모전 공고 원문 대조(필수 데이터군·제출 형식)
