# 클린광진 온톨로지 설계 노트

`/dumping`이 쓰는 지식그래프(`data/dumping/graph.json`)가 무엇을 뜻하는지, 왜 그렇게 만들었는지, 어디까지가 온톨로지이고 어디부터가 아닌지를 적는다.
정의의 정본은 코드다: 클래스·관계·검증은 [lib/dumping/schema.ts](../lib/dumping/schema.ts), 역량 질문은 [lib/dumping/queries.ts](../lib/dumping/queries.ts), 한글 표시명은 [lib/dumping/labels.ts](../lib/dumping/labels.ts). 이 문서는 그 셋을 읽는 안내서다.

## 1. 정직한 분류

이 그래프는 **타입이 붙은 프로퍼티 그래프**다. 노드에 `type`과 `space`, 엣지에 `rel`과 속성이 있다. OWL 공리도, SHACL 제약도, SPARQL 종단점도 없다.
"온톨로지"라고 부를 수 있는 근거는 세 가지뿐이다.

1. 클래스 14종과 관계 22종에 정의·도메인·레인지가 명문화돼 있고(schema.ts), 그래프가 그 규약을 지키는지 자동 검증한다(오류 0·주의 1이 현재 상태).
2. 역량 질문 7개가 코드로 고정돼 있고, 화면에서 그 자리에서 계산된다. "표로는 못 던지는 질문"이 실제로 답을 낸다.
3. 철회·판정·계보를 데이터 구조로 다룬다. 문장이 아니라 속성과 엣지로.

RDF·OWL로 옮기는 일은 어렵지 않다(클래스와 관계가 이미 닫힌 목록이다). 안 한 이유는 이 규모(69노드)에서 추론기가 줄 것이 없어서다. 심사에서 "온톨로지냐"고 물으면 위 세 가지를 답하고, 형식 온톨로지가 아니라고 먼저 말한다.

## 2. 클래스와 영역

영역(space) 8개가 상위 분류이고 그래프 색·범례 단위다. 클래스는 그 아래 14종.

| 영역 | 클래스 | 뜻 |
|---|---|---|
| subject 주체 | Org, Team | 데이터를 관리하고 개입을 집행하는 곳 |
| resource 데이터 | Dataset | 원자료 한 벌. 행 수·기간 |
| evidence 증거 | Evidence | 데이터셋에서 계산한 관측 사실. `confidence`, 철회 시 `retracted`+`confidence 0` |
| concept 요인 | Class, Concept, Entity, Topic | 분석 단위·요인·실체·이론 |
| claim 주장 | Claim, Covariate | 증거가 뒷받침하는 주장 · 회귀/상관 변수 기록(격자 β는 `coefficient`, 행정동 상관은 `rho`) |
| outcome 결과 | KPI, Risk | 요인이 예측하고 개입이 겨냥하는 지표 |
| lever 개입 | Lever | 보유·제안 개입수단. 판정은 노드가 아니라 엣지에 |
| policy 법령·절차 | Policy | 조례·법령·개입 사전등록 원칙 |

## 3. 관계 설계에서 의도한 것

**개입의 효과를 그래프가 단언하지 않는다.** `Lever -lowers-> KPI`는 "낮추려는 수단"이지 "낮춘다"가 아니다. 판정(제안·미검증·효과없음·측정불가·효과 확인 안 됨(철회))은 엣지 속성 `status`에 있고, 검증기는 `status` 없는 판정 엣지를 오류로 잡는다. 이동식 CCTV 엣지가 `status: 효과 확인 안 됨(철회)`인 채로 `lowers`를 유지하는 이유다.

**철회는 지우지 않는다.** `ev-did-cctv`, `claim-cctv-conditional`, `cov-did-cctv`는 `retracted` 사유와 `confidence 0`을 달고 남아 있고, 이들로 들어오던 `supports` 엣지도 그대로다. 역량 질문 CQ3가 "철회된 근거가 철회되지 않은 노드로 이어지는가"를 감시한다. 현재 이어지는 곳은 `lev-cctv-mobile` 하나이고 그 판정 엣지가 철회 상태라 공백 0.

**통계 연관은 인과가 아니다.** `predicts`·`contributes_to`·`constrains`는 β 또는 ρ를 싣는 조건부 연관이다. 정의 문장에 "인과를 뜻하지 않는다"를 박아 두었고 질의응답 프롬프트 규칙 1이 같은 말을 한다.

**계보는 엣지로.** `Dataset -contains/derived_from-> Evidence -supports-> Claim`. CQ6가 이 사슬이 끊긴 증거를 찾는다(현재 2건: 핫스팟 백테스트·인허가 파이프라인. 내보내기 시 데이터셋 노드를 보강해야 한다). 상세 카드의 "근거 계보"는 `lineageOf`로 이 사슬을 거꾸로 오른다.

## 4. 알려진 결함 (다음 내보내기에서 고칠 것)

| # | 결함 | 왜 문제인가 | 고칠 곳 |
|---|---|---|---|
| 1 | `kpi-dump-rate` 하나에 격자 회귀 β(종속=과태료 건수)와 행정동 상관 ρ(종속=과태료/천명)가 같이 들어온다 | 이름은 "천명당 발생률"인데 β의 종속변수는 건수다. 지표 정의가 둘이다 | export 주석 레이어에서 `kpi-dump-count-cell`을 분리하고 β 엣지를 그쪽으로 |
| 2 | `constrains`가 "β<0 요인"과 "지표 운용 규칙(claim-two-phenomena)"에 같이 쓰인다 | 관계 하나에 뜻이 둘 | 규칙 쪽은 `governs`류로 분리 |
| 3 | `ev-hotspot-backtest`·`ev-permits`에 출처 데이터셋이 없다 | 재현 해시와 안 맞물린다 | `ds-decision-layer`·`ds-archhub-permits` 노드 추가 |
| 4 | 사전등록 원칙 `restricts`가 제안 6건 중 1건에만 연결 | 정책 화면은 "전 제안 적용"이라 말한다 | 제안 전부에 `restricts` |
| 5 | `cls-cell`이 고아 노드 | 분석 단위가 아무것에도 연결되지 않는다 | `ds-grid -describes-> cls-cell` 또는 제거 |
| 6 | `ev-fines -supports-> claim-bias` note "과태료는 1.1배" | 데이터는 0.53배(연환산). 대시보드가 정오표(errata.ts ERR-001)로 덮어쓰는 중 | `build_ontology.py` 원문 대신 export 시 실측으로 생성 |
| 7 | `team-cleaning size 0`, `kpi-dump-rate target_ms 0` 같은 자리표시 속성 | 의미 없는 값이 "0"으로 읽힌다 | 속성 제거 |
| 8 | 노드에 `source/version/asof/hash`가 없다 | REPRODUCE manifest와 연결이 문서로만 존재 | PROV-O 최소형(`wasDerivedFrom`, `generatedAtTime`, `wasAttributedTo`) 속성 3개 |

## 5. 역량 질문 목록

코드: `runCompetencyQuestions(graph)`. 화면: 온톨로지 탭 "온톨로지에 묻기".

| id | 질문 | 현재 답 |
|---|---|---|
| cq-untargeted | 연관 요인 중 겨냥하는 개입이 없는 것 | 상권 밀집(β +0.086) 1건 공백. 도로 형태 둘은 구조 변수 |
| cq-unsupported | 증거 없는 주장 | 0 |
| cq-retracted | 철회된 근거가 아직 연결된 항목 | 이동식 CCTV 1(판정 엣지 철회 상태, 공백 0) |
| cq-verdict | 개입별 검증 상태 | 제안 6 · 철회 1 · 효과없음 1 · 측정불가 1 · 미검증 1 |
| cq-basis | 실행 근거 조례 없는 개입 | 4 |
| cq-lineage | 출처 데이터셋 끊긴 증거 | 2 |
| cq-prereg | 사전등록 원칙이 연결된 제안 | 6 중 1 |

답이 바뀌면 [tests/onto-queries.test.ts](../tests/onto-queries.test.ts)가 먼저 깨진다. 의도한 변화면 테스트를 같이 고친다.
