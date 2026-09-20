# 광진 제설 온톨로지 설계 노트

`/snow`가 쓰는 지식그래프(`data/snow/graph.json`)가 무엇을 뜻하는지, 왜 그렇게 만들었는지, 어디까지가 온톨로지이고 어디부터가 아닌지를 적는다.
정의의 정본은 코드다: 클래스·관계·검증은 [lib/snow/schema.ts](../lib/snow/schema.ts), 역량 질문은 [lib/snow/queries.ts](../lib/snow/queries.ts), 한글 표시명은 [lib/snow/labels.ts](../lib/snow/labels.ts), 단계·시한 규칙은 [lib/snow/stage.ts](../lib/snow/stage.ts). 그래프 자체는 [scripts/snow-data.mjs](../scripts/snow-data.mjs) `buildGraph`가 map.json 수치로 생성한다.

## 1. 정직한 분류

타입이 붙은 프로퍼티 그래프다. 노드에 `type`과 `space`, 엣지에 `rel`과 속성이 있다. OWL 공리도, 추론기도, SPARQL 종단점도 없다. /dumping 온톨로지와 같은 형식이고 도메인만 다르다.
"온톨로지"라고 부를 근거는 셋이다.

1. 클래스 11종과 관계 20종에 정의·도메인·레인지가 명문화돼 있고(schema.ts), 그래프가 그 규약을 지키는지 자동 검증한다(오류 0·주의 0이 현재 상태. `tests/snow-schema.test.ts`).
2. 역량 질문 9개가 코드로 고정돼 있고 화면 온톨로지 탭에서 그 자리에서 계산된다. 답이 바뀌면 `tests/snow-queries.test.ts`가 먼저 깨진다.
3. 자원의 효과를 단언하지 않는다. `Lever -targets-> Concept`는 "겨냥한다"이고 `Lever -lowers-> KPI`는 "낮추려 한다"다. 효과 크기·인과는 데이터가 없어 싣지 않는다.

## 2. 클래스와 영역

영역(space) 9개가 상위 분류이고 그래프 색·범례 단위다.

| 영역 | 클래스 | 뜻 |
|---|---|---|
| subject 주체 | Org, Team | 총괄·의무·운영 주체(구청·도로과·동주민센터·서울시·건축물관리자·자율방재단) |
| resource 데이터 | Dataset | 원자료 6벌(공공데이터 4·서울시 열선 집계 1·보도자료 1) |
| evidence 관측 | Evidence | 데이터셋에서 계산한 사실 12건. `confidence`·`source`·`asof`·`derived_by` |
| concept 취약요인 | Concept | 급경사·통학로·이면도로·간선도로·다중이용·야간 결빙·적설 예보 |
| claim 판단 | Claim | 관측이 뒷받침하는 판단 5건. 들어오는 supports 없으면 위반 |
| outcome 목표지표 | KPI | 취약지점 커버리지·조례 시한 준수·결빙 사고·민원·서울시 평가. `measurable`이 "데이터 없음"이면 지금 잴 수 없다 |
| lever 대응자원 | Lever | 열선·제설함·염화칼슘함·모래주머니·살포기·장비·인력·민관협력·건축물관리자 의무 |
| policy 법령·단계 | Policy, Stage | 자연재해대책법 27조·광진구 조례·서울시 단계 기준·대책기간 + 단계 4개(보강·1·2·3) |
| area 행정동 | Area | 15개 동. 자원별 개소 수 속성 |

## 3. 관계 설계에서 의도한 것

**동원은 누적이다.** `Stage -mobilizes-> Lever`는 상위 단계가 하위 단계 자원을 전부 포함해야 한다. 역량 질문 cq-stage가 누락을 잡는다. 대응 단계 탭의 지도 강조(동원 자원 진하게·대기 자원 흐리게)는 이 엣지를 읽는다.

**법령은 의무 주체와 자원 근거로 나뉜다.** `Policy -obligates-> Org`(조례 → 건축물관리자), `Policy -basis-> Lever`(조례 → 자율 제설, 대책기간 → 인력·장비). 열선·제설함 등 시설의 설치 근거 규정은 아직 못 찾아 `basis`가 없고 cq-basis가 6종을 공백으로 보고한다. 위법이 아니라 그래프의 공백이다.

**커버리지는 동 단위다.** `Lever -covers-> Area {count, length_m, bags}`. 취약지점 89개소(보도)는 위치가 공개돼 있지 않아 지점 단위 커버리지는 잴 수 없고, 동 단위 4종 유무만 센다(`kpi-coverage`가 `kpi-ice-incident`를 `operationalizes`).

**보도자료는 따로 표시한다.** 살포기 52대·장비·인력 1,075명은 `ds-press`에서 온 `ev-press`(confidence 0.6)만이 서술한다. cq-press-only가 "공공데이터 없이 보도 수치로만 서술되는 항목"으로 자동 열거한다.

**계보는 엣지로.** `Dataset -contains/derived_from-> Evidence -supports-> Claim`. 상세 카드의 "근거 계보"가 `lineageOf`로 거꾸로 오른다. cq-lineage = 0.

## 4. 데이터와 한계

| 데이터 | 기준일 | 행 | 처리 |
|---|---|---|---|
| 광진구 도로열선 설치 현황(15142397) | 2025-01-31 | 41 | 기점·종점 지번 카카오 지오코딩 → 직선. 실패 1구간은 노선명 근사 |
| 광진구 제설함 위치정보(15066599) | 2026-08-20 | 110 | 좌표 그대로. 동은 경계 판정(경계선 위 2개소 미판정) |
| 광진구 염화칼슘보관함(15041574) | 2026-09-04 | 228 | 열 이름은 GRS80TM이지만 값은 WGS84 위경도(실측) |
| 광진구 모래주머니 배치현황(15041576) | 2022-01-19 | 45 | 주소 지오코딩. 실패 2지점은 동 중심 근사 |
| 서울시 자치구별 도로열선(OA-22584) | 2026-05-31 | 993 | 구별 합계만. 설치위치 칸에 줄바꿈·쉼표가 있어 따옴표 파서 필요 |

- 서울시 집계는 광진 55개소 6,066m, 구 공개 데이터는 41구간 4,519m. 2025년 설치분이 구 데이터에 없다(`claim-update-gap`). 지도는 구 데이터 기준.
- 대응 단계는 적설 예보만으로 판정한다. 기상특보(주의보·경보)는 받지 않는다.
- 예보는 Open-Meteo `best_match`. `kma_seamless`(기상청 재배포)는 이 좌표에서 전부 null로 온다(2026-09-20 실측).
- 조례 제5조의 주간·야간 시각은 조례에 없다. 07~19시를 주간으로 둔다(`stage.ts DAY_START/DAY_END`).
- 결과 지표(사고·민원·시한 준수)는 공개 데이터가 없다. 대책 평가가 투입 지표에 머무는 이유를 그래프가 스스로 말한다(cq-kpi-unmeasured).

## 5. 역량 질문 목록

| id | 질문 | 현재 답 |
|---|---|---|
| cq-heat-gap | 도로열선이 한 구간도 없는 동 | 중곡1동·자양3동·자양4동·군자동 4 |
| cq-uncovered | 자원 4종이 모두 없는 동 | 0 |
| cq-untargeted | 겨냥 자원 없는 취약요인 | 적설량 예보 1(기준의 입력이라 의도한 공백) |
| cq-basis | 근거 규정 미연결 자원 | 6 |
| cq-kpi-unmeasured | 잴 수 없는 지표 | 조례 시한 준수·결빙 사고·민원 2 |
| cq-stage | 단계별 동원 자원·누락 | 2·6·8·9종, 누락 0 |
| cq-lineage | 출처 끊긴 관측 | 0 |
| cq-press-only | 보도자료만으로 서술되는 항목 | 살포기·장비·인력·서울시 평가 4 |
| cq-stale | 데이터셋 기준일 격차 | 2022-01-19 ~ 2026-09-04 |

## 6. 갱신

```bash
# 원본 CSV를 data/snow/raw/에 UTF-8로 두고(파일명은 스크립트 FILES) 재생성. 새 주소만 카카오 조회, 나머지는 geocode-cache.json
npm run snow:data
npm test        # snow-schema · snow-queries · snow-stage
```

동 경계(`data/snow/geo.json`)는 /dumping map.json의 `ring`·`dongOutlines` 사본이다. 공개 경계라 평문.
