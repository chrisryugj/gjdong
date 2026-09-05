# /dumping 출품 검토 2라운드 (2026-09-05)

## 실측 기준선
- npm test 200/200 · lint · tsc · verify.py(해시 102·수치 10) 전부 통과
- 프로덕션 /dumping 200 · /api/dumping/data/map 401 · raw map.json 404 · map.json.enc 200(암호문)
- 화면 수치 재계산: 배율 2.10/2.97/1.11/0.53, 품목 28%, 징수율 95.4, 백테스트 65/11.5/2.8, MAPE 26/43.2 전부 일치

## 실측으로 잡은 결함 (우선순위)
1. **과태료 적발경로**: enforcement.json `route` = 신고 2,711(83%) · 수시 536(17%). "신고 성향과 무관한 단속 실측"이 화면·프롬프트·그래프(ev-fines 라벨) 전부에 박혀 있는데 데이터가 반대. 신고 경로 과태료(2024 1,330)가 민원 접수(998)보다 많으니 민원 데이터셋과 다른 신고 채널. 정직한 근거 = 순찰(수시) 적발도 연환산 0.49배.
2. **우측 절단**: 2026-07 수시 3건·08 0건 → 최근 월 과태료는 부과 처리 지연으로 과소 집계. 어디에도 주의 없음.
3. 정적 수치 낡음: "해시 83개"(실제 102, 3곳), 전망 "직전 8개월"(실제 6개월, context.ts), README 요약표 MAPE 18%·보고 구 12개(실제 11)
4. 문장 박힌 수치: 24,520동·1,062칸·0.85~0.97·64개 위치·12개월 10건·반감기 90일·구의·자양·중곡·72개소·276대·2026년 7월 → facts/map/graph 파생으로
5. 과장: "낙관 편향이 없습니다"(6개월 표본), "모든 수치 해시로 재현 고정", "4개 모형 모두 비유의"(같은 점추정에 SE만 다름)
6. 온톨로지 결함 1·2: kpi-dump-rate에 β(격자 건수)와 ρ(동 천명당) 혼재 → `kpi-dump-count-cell` 분리 + `operationalizes`; claim→KPI `constrains` → `governs`
7. PROV: 기존 59노드 중 Dataset·Evidence에 source/asof/derived_by 없음 → export 주석 레이어 PROV_BASE로 부착, CQ8 + 검증 경고 신설
8. SLA 분모 49건 제외 미표기, 지도 격자 대체 표 없음, QA 평가셋 없음

## 반영 원칙 (계획 파일 4절 준수)
- 그래프 결함은 export_dashboard.py 주석 레이어에서. ontology.db 불변
- 숫자는 facts.ts 파생. 문장에 박지 않음
- 재수출 → encrypt → 테스트 핀 갱신 → 커밋 main
- 한국어 산출물 줄표 금지

## 결정 사항(내가)
- kpi 분리는 UI 의존이 크지만 심사 핵심 지적이라 진행. OUTCOMES 집합으로 queries/lever-view/ontology-graph 동시 갱신
- QA 평가셋은 프로덕션 API에 5문항 직접 호출(scripts/dumping-qa-eval.mjs) + 결과를 docs에 기록
- 새 데이터 조사·통계 해설(유저 추가 요청)은 docs/dumping-stats-explainer.md + review 문서 절로

## 유저 결정 필요
- DUMPING_PASSWORD 교체(4자리), rate limit 전역화(Upstash 계정), GitHub GC 요청, 공모전 공고 원문
