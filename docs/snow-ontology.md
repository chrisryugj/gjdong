# 광진 제설 상황판 근거 그래프 설계 노트

`/snow`가 쓰는 지식그래프(`data/snow/graph.json`)가 무엇을 뜻하는지, 왜 그렇게 만들었는지, 어디까지가 검증되는 것인지 적음. 2라운드(2026-09-20) 기준.
정의의 정본은 코드임: 종류·관계·검증은 [lib/snow/schema.ts](../lib/snow/schema.ts), 역량 질문은 [lib/snow/queries.ts](../lib/snow/queries.ts), 한글 표시명은 [lib/snow/labels.ts](../lib/snow/labels.ts), 단계·시한 규칙은 [lib/snow/stage.ts](../lib/snow/stage.ts). 그래프는 [scripts/snow-data.mjs](../scripts/snow-data.mjs) `buildGraph`가 map.json 수치로 생성함(관측·판단 문장 하드코딩 0). 데이터 조사·선형 검증은 [docs/snow-data-survey.md](snow-data-survey.md).

## 1. 무엇을 증명하는가

타입이 붙은 프로퍼티 그래프임. 노드에 `type`·`space`, 엣지에 `rel`과 속성이 있음. 화면에서 "온톨로지"라는 말은 쓰지 않고 "근거 그래프"라 부름. 검증 가능한 것 셋만 주장함.

1. 종류 13·관계 23에 정의·도메인·레인지가 명문화돼 있고 그래프가 규약을 지키는지 자동 검사함(오류 0·주의 0. `tests/snow-schema.test.ts`).
2. 역량 질문 10개가 코드로 고정돼 화면에서 그 자리에서 계산됨. 답이 바뀌면 `tests/snow-queries.test.ts`가 먼저 깨짐.
3. 자원의 효과를 단언하지 않음. `Lever -targets-> Concept`는 "대상으로 한다", `Lever -lowers-> KPI`는 "낮추려 한다"임. 효과 크기·인과는 데이터가 없어 싣지 않음.

## 2. 종류와 영역

| 영역 | 종류 | 수 | 뜻 |
|---|---|---|---|
| subject 주체 | Org, Team | 5+2 | 구청·서울시·행안부·자율방재단·건축물관리자, 도로과·동주민센터 |
| resource 데이터 | Dataset | 14 | 공공데이터 7·서울시 집계 2·나이스·기상청·도로교통공단·도로망·지형·보도자료 |
| evidence 관측 | Evidence | 19 | 데이터셋에서 계산한 사실. `label`(16자 이내 명사형)과 `gist`(합니다체 문장) 분리. `confidence`·`source`·`asof`·`derived_by` |
| concept 취약요인 | Concept | 7 | 급경사·고갯길, 통학로, 이면도로, 간선도로, 다중이용, 야간 결빙, 적설량 예보 |
| concept 취약구간 | **Entity** | 56 | 행안부 적설취약구간 47 + 상습결빙구간 9. 좌표·근접 자원 거리·공백 여부 |
| claim 판단 | Claim | 7 | 관측이 뒷받침하는 판단. 들어오는 supports 없으면 위반 |
| outcome 목표지표 | KPI | 5 | 취약구간 커버리지(구간 단위 측정)·조례 시한 준수(자료 없음)·결빙 교통사고(다발지역 0곳)·제설 민원(자료 없음)·서울시 평가 |
| lever 대응자원 | Lever | 9 | 열선·제설함·염화칼슘함·모래주머니·살포기·장비·인력·민관협력·건축물관리자 의무 |
| policy 법령·단계 | Policy, Stage | 4+4 | 자연재해대책법 27조·광진구 조례·서울시 단계 기준·대책기간, 단계 4 |
| area 행정동·구역 | Area, **Zone** | 15+15 | 행정동 15. 담당 구역(Zone) 15는 동주민센터 운영 단위인데 구간표가 없어 행정동 경계 대용(`proxy: "행정동 경계 대용"`) |

노드 162 · 엣지 538. 그래프 화면은 Entity 56을 그리지 않음(지도가 보여 줌. 72노드에서도 헤어볼이었음). 기본 배치는 층별 흐름, 포커스는 `kpi-coverage`, 이웃만 라벨.

## 3. 관계 설계에서 의도한 것

**커버리지는 구역·구간 단위임.** `Lever -covers-> Zone {count, length_m, bags}`와 `Lever -covers-> Entity {within_m}`. 취약구간마다 60m 안 열선·100m 안 자재를 세고, 둘 다 없으면 `props.gap`. 거리 기준은 이 화면의 가정임(구 지침 확보 시 교체).

**운영 단위는 동주민센터 담당 구역임.** `Team(동주민센터) -assigned-> Zone -within-> Area`, `Entity -within-> Zone`. 구역 정본(담당 구간표)이 오면 `proxy`를 지우고 폴리곤·구간 목록으로 교체함. 동 기준점(기둥·라벨·지오코딩 폴백)은 동주민센터 위치임(`lib/dumping/dong-centers.json`).

**취약구간은 취약요인의 실체임.** `Entity -exemplifies-> Concept`(고갯길·급경사 › 급경사, 결빙구간 › 야간 결빙·간선도로).

**동원은 누적임.** `Stage -mobilizes-> Lever`. cq-stage가 누락을 잡음(누락 0).

**근거는 제설대책기간이 받침.** 열선·제설함·자재·살포기·인력·장비의 `basis`는 `pol-period`(대책기간 운영 계획, 보도자료) 하나뿐임. 개별 시설 설치 근거 규정은 미확인이라 엣지 note에 그렇게 적음. 민관협력만 근거 미연결(cq-basis 1).

**보도자료는 따로 표시함.** 살포기 52대·장비·인력 1,075명은 `ds-press`에서 온 `ev-press`(confidence 0.6)만이 서술함. cq-press-only 4.

**계보는 엣지로.** `Dataset -contains/derived_from-> Evidence -supports-> Claim`. 상세 카드의 "근거 계보"가 관측·데이터·주체 세 단으로 보임. cq-lineage 0.

## 4. 데이터와 한계

데이터 목록·기준일·행 수·이용허락·채택 이유·못 구한 것은 [snow-data-survey.md](snow-data-survey.md)가 정본임. 요점만.

- 열선 정본은 서울시 집계(2026-05) 광진 55행. 구 파일(2025-01) 41행은 지번 조인으로 노선명·차로수 보충(39행 일치). 선형은 로컬 pmtiles 도로망 스냅(named 25·network 12·point 13·straight 5). 물리 길이 = 1차로 기준 연장 ÷ 차로수.
- 취약구간 실체는 행안부 적설취약구간 47(고갯길 37·급경사 8·기타 2)과 상습결빙구간 9(전부 간선·자동차전용도로, 광진구 관리 3). 결빙구간 파일은 총길이·방위각이 두 점과 안 맞고 도로명도 OSM과 달라 두 점만 씀.
- 급경사 추정(DEM terrarium z14 × 이름 있는 이면도로, 100m 창 8~20%, 고가 120m 안 제외) 117구간 16.2km. 행안부 취약구간 47 중 30이 40m 안. 추정치로 표기.
- 단계는 기상청 단기예보(nx 62·ny 126) 24시간 신적설 합 + 특보 현황(서울 109) 대설주의보·경보 중 높은 단계. 대책기간(11/15~3/15) 밖에서는 슬라이더 시나리오가 기본이고 헤드라인에 "시나리오:"를 붙임.
- 결빙 교통사고 다발지역(도로교통공단, 반경 200m 3건 이상)은 2017~2025 광진 0곳. 조례 시한 준수·민원은 공개 데이터 없음(정보공개청구 대상).
- 조례 제5조의 주간·야간 시각은 조례에 없어 07~19시를 주간으로 가정.

## 5. 역량 질문 목록

| id | 질문 | 현재 답 | 기본 노출 |
|---|---|---|---|
| cq-seg-gap | 취약구간 중 열선 없는 곳, 자재까지 없는 곳 | 17/56 · 공백 5(능동로 120 + 결빙구간 4) | 예 |
| cq-heat-gap | 열선이 한 구간도 없는 동 | 중곡1동·자양3동·자양4동·군자동 4 | 예 |
| cq-uncovered | 자원 4종이 모두 없는 동 | 0 | |
| cq-untargeted | 대상 자원 없는 취약요인 | 0(적설량 예보는 기준의 입력이라 제외) | |
| cq-basis | 근거 미연결 자원 | 민관협력 1 | 예 |
| cq-kpi-unmeasured | 측정 자료 없는 지표 | 조례 시한 준수·제설 민원 2 | 예 |
| cq-stage | 단계별 동원 자원·누락 | 2·6·8·9종, 누락 0 | |
| cq-lineage | 출처 끊긴 관측 | 0 | |
| cq-press-only | 보도자료만으로 서술되는 항목 | 살포기·장비·인력·서울시 평가 4 | 예 |
| cq-stale | 데이터셋 기준일 격차 | 2022~2026 | 예 |

## 6. 갱신

```bash
# 원본을 data/snow/raw/에 UTF-8로 두고(파일명은 스크립트 FILES) 재생성. 새 주소만 카카오 조회, 나머지는 geocode-cache.json.
# DATA_GO_KR_KEY가 있으면 결빙 교통사고 다발지역 API를 갱신해 raw/koroad-ice-accident-zones-seoul.json에 캐시
npm run snow:data
npm test        # snow-schema · snow-queries · snow-stage · snow-copy(카피 게이트: 비유 동사·줄표·화살표·반말·12px 미만 0)
```

동 경계(`data/snow/geo.json`)는 /dumping map.json의 `ring`·`dongOutlines` 사본임. 동주민센터 좌표는 `lib/dumping/dong-centers.json`을 읽기만 함.
