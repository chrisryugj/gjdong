gjdong `/dumping`(클린광진 상황실) 3라운드: 데이터 보강 2종 결합 + 디자인 개선 + 출품 마무리. 2라운드(2026-09-05 저녁, gjdong 95a9af1·c4086d5, 비공개 4fca6eb)까지 끝난 상태에서 시작한다. 분석 없이 추측하지 말고 아래 순서로.

## 0. 시작 전 동기화·기준선
- `cd ~/workspace/gjdong && git pull`, `cd ~/workspace/gwangjin-dumping && git pull`
- `npm run dumping:decrypt`(키 `.env.local` `DUMPING_DATA_KEY`)로 map.json 복원
- 먼저 읽을 것: `docs/dumping-contest-review.md` 6절(2라운드 결함·새 데이터 조사·남은 일), `docs/dumping-stats-explainer.md`, `docs/dumping-ontology.md`, CLAUDE.md 7번 항목 끝의 "2라운드" 문단, 메모리 `project-gjdong-dumping-dashboard`
- 기준선: `npm test`(205), `npm run lint`, `npx tsc --noEmit`, `npm run build`, 비공개 `python REPRODUCE/verify.py`(해시 102·수치 10). 프로덕션 `/dumping` 200, `/api/dumping/data/map` 401, raw map.json 404
- ★`npm run build`의 decrypt가 평문 map.json을 .enc로 덮는다. 재수출 뒤 반드시 `npm run dumping:encrypt` 먼저
- ★로컬 `.env.local`의 `DUMPING_PASSWORD`는 프로덕션과 다르다. 프로덕션 호출은 `vercel env pull`로 받은 값을 env로 넘긴다(파일은 쓰고 지울 것)

## 1. 데이터 보강 (비공개 레포에서, 재수출 절차 준수)

### 1-1. SGIS 100m 격자 인구 (1순위)
- 공공데이터포털 15141768 "국가데이터처_SGIS 격자 통계 및 경계"(csv·shp, 반기 갱신, 이용허락 제한 없음). 다운로드 경로·파일 구성·격자 코드 체계를 실측하고 `scripts/build_seoul_layers.py` docstring 방식으로 기록. 서울 250m 격자 코드가 "다사XXXXYYYY" EPSG:5179 (900000,1900000) 원점 10m 오프셋이었던 것처럼 100m도 원점·오프셋을 SHP로 확증한 뒤 조인
- `regression_v2.py`에 `resident_pop`(등록인구 100m) 추가. 생활인구와 등록인구를 각각·동시에 넣은 세 모형 비교. 판정 유지 여부, 200m 민감도, VIF(생활인구와 등록인구 공선성)까지
- 결과는 export 주석 레이어로 `ds-sgis-grid100`·`ev-resident-exposure`·`cov-resident-pop` 노드(PROV 3키 필수), 발견 카드 "노출 통제"에 한 문단 추가, 방법 모달 "직접 수집"에 1종 추가, 프롬프트 규칙 13 갱신, `regressionV2` 타입 확장
- 답이 바뀌면 `tests/onto-queries.test.ts`·`dumping-facts.test.ts` 핀을 의도 확인 후 같이 고친다

### 1-2. K-apt 공동주택 단지 목록 (2순위)
- 공공데이터포털 15057332(단지 목록 API)·15098979(관리비 공개 의무단지 파일). 광진구 단지 주소를 지오코딩(gjdong `/api/resolve-address-batch`, `Origin: https://gjdong.vercel.app` 필수, 분당 30콜)해 격자에 배정
- 목적: "관리주체 없는 주거"가 건축물대장 대리변수라는 한계(2라운드 심사 문답)에 대한 직접 답. 격자별 `managed_units`(K-apt 등록 단지 세대수)를 만들어 `unmanaged_units`와 교차검증. 대리변수와 실측이 얼마나 겹치는지(상관·불일치 격자 수)를 발견 카드 "대리변수 검증"으로
- 의무관리 기준(300세대, 150세대+승강기·중앙난방)이 현 "150세대 미만=관리 취약" 정의와 어긋나는지 확인하고 permits 문구를 맞춘다

### 1-3. 선택: 정비사업 구역 폴리곤
- 공공데이터포털 15082965(의제처리구역 shp)·열린데이터광장 OA-2253. 격자별 정비구역 포함 여부를 통제변수로. 시간 남으면

### 1-4. 절차
- `build_seoul_layers.py`(또는 새 `build_sgis_layer.py`) → `.venv/bin/python regression_v2.py` → `build_decision_layer.py` → `export_dashboard.py` → gjdong `npm run dumping:encrypt` → 테스트 핀 → 비공개 `make_manifest.py` + `verify.py` → 양쪽 커밋(main 직접). 대용량 원본 zip·shp는 gitignore, docstring에 재다운로드 경로
- 원자료는 커밋 전 `scripts/sanitize.py` 기준 개인정보 스캔

## 2. 디자인 개선 (chris-gomdori 안티슬롭 기준)
취향: 에디토리얼 미니멀. hairline 보더·숫자 인덱스·솔리드 타이포·단일 액센트(현 `#0c6155`). 컬러바·3D 이모지·큰 그림자·그라데이션 떡칠·둥근 카드 남발 금지. `frontend-design` 스킬 참고하되 기존 `crowd-light` 토큰 체계 안에서.
- 먼저 실측: 프로덕션을 1440·1024·390px에서 스크린샷(puppeteer, headless=new) 찍어 탭 5개·모달 7개를 전부 보고 문제를 목록화한 뒤 고친다. 추측으로 고치지 말 것
- 확인할 것: 카드 라운드·그림자 과다(`rounded-xl`·`shadow-md` 남발), 배지 색 난립(상태·비용·태그·KPI 4계열), 폰트 크기 종류(11~19px 14종), 발견 카드의 `takeaway` 하이라이트 박스 반복, 운영 탭 섹션 8개가 같은 높이로 늘어선 단조로움, 대비 보드 취소선 가독성, 지도 칩 줄 2단 겹침, 격자 대체 표 `details`가 범례와 겹치는지, 인쇄(동 브리핑) A4 한 장 수렴 여부
- 방향: 섹션 번호(01·02)와 hairline 구분선으로 위계, 카드 그림자 제거하고 보더로, 배지는 색 2종(액센트·경고)+회색으로 축소, 숫자는 tabular-nums·font-mono 통일, 첫 화면(정책 제안) 상단에 결론 한 줄과 핵심 수치 3개만 크게
- 접근성: 포커스 링, 탭 키보드 순회, 대비 4.5:1, reduced-motion(온톨로지 회전은 이미 존중)
- 변경 후 같은 3폭 스크린샷으로 전후 대조. 스크린샷은 `docs/dumping-screens/`에 두지 말고 스크래치패드에

## 3. 출품 마무리
- 공모전 공고 원문 대조. 2026 빅데이터 활용 경진대회는 5월 마감·7월 시상 종료였다. 지금 내려는 대회의 필수 데이터군·제출 형식·공개 검증 범위를 확인해 `docs/dumping-contest-review.md`에 절 추가
- 단속 인력·근무시간 자료 확보 여부 확인. 없으면 화면·프롬프트의 "순찰 적발 0.49배"에 "단속 축소인지 발생 감소인지 가르지 못함" 주의가 남아 있는지 재확인
- `DUMPING_PASSWORD` 긴 문구 교체 + `DUMPING_COOKIE_SECRET` 설정(Vercel, 현재 비어 있음). 바꾸면 발급 쿠키 전부 무효라 시연 직전은 피할 것
- QA 평가셋 재실행(`node scripts/dumping-qa-eval.mjs`, 프로덕션 env 비번). 새 데이터 문항 1개 추가(등록인구 vs 생활인구)
- 조치 대장 실등록 1건이라도(구청과 협의된 게 있으면)

## 4. 반영 원칙 (변함없음)
- 숫자는 `lib/dumping/facts.ts` 파생 함수에서. 문장에 박지 말 것
- 그래프 결함은 gjdong errata가 아니라 비공개 `export_dashboard.py` 주석 레이어. `ontology.db` 불변
- 한국어 산출물 줄표(—) 금지. 존댓말은 화면, 반말은 코드 주석
- 금지 문구: "신고와 무관한 실측", "인구를 통제했다", "반증", "낙관 편향 없음", "모든 수치 재현", "원인 규명", "효과 입증"
- 커밋·푸시 main 직접. `git push --force`는 훅이 막는다
- 계획은 `.claude/plans/2026-MM-DD-dumping-round3.md`에 먼저

## 5. 산출물
1. 비공개 레포: 새 레이어 스크립트·regression_v2 확장·export 주석·README 표 갱신·manifest·verify 통과
2. gjdong: 타입·facts·발견 카드·방법 모달·프롬프트·테스트(추가 기능마다)·디자인 전후 대조·빌드 초록·배포 확인
3. `docs/dumping-contest-review.md` 7절(3라운드), `docs/dumping-stats-explainer.md`에 "등록인구 vs 생활인구" 항목, CLAUDE.md 7번·메모리 갱신
4. 마지막 보고: 등록인구 추가 후 β 변화표, 대리변수 검증 결과, 디자인 전후 스크린샷 경로, 네가 결정할 것만 짧게
