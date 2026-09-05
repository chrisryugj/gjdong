# 클린광진 dumping 페이지 분석·프로덕션 검토보고서

검토일: 2026-09-05  
대상 커밋: `9fc58d53b44028015934cd8aa5365d205ce12b0d` (`main`, origin/main과 동기화됨)  
검토 범위: `/dumping` 화면, dumping API·인증, 공개 대시보드 산출물, 비공개 `chrisryugj/gwangjin-dumping` 저장소의 명세·분석 스크립트·재현 문서  
검토 방식: 읽기 전용 정적 검토, 공개 프로덕션 HTTP 확인, 집계 JSON의 독립 합계 확인, 기존 자동검사 실행  
변경 범위: 애플리케이션 코드·분석 데이터·설정은 수정하지 않음. 이 보고서 파일만 추가함.

## 1. 임원 판단

이 프로젝트의 가장 큰 가치는 “무단투기 발생을 정확히 예측했다”가 아니다. 서로 다른 행정자료를 100m 공간 단위로 연결하고, 신고·적발·처리·예측을 분리하려 하며, 이동식 CCTV의 초기 효과 주장을 철회한 뒤 사전등록 평가 체계로 연결했다는 점이다. 이는 행정 현장에서 예산 확대를 자동 권고하는 도구보다, 근거 수준과 관측 편향을 함께 보여 주는 의사결정 도구에 가깝다.

현재 상태는 시연 가능한 프로토타입으로는 강하지만, 공개 출품물로 바로 제출하기에는 차단 이슈가 있다. 가장 먼저 공개 저장소의 집계·후보지 주소 공개 범위를 결정해야 한다. 그 다음으로 예측 백테스트의 누수, “인구 통제”라는 설명과 실제 회귀식의 불일치, 민원·과태료 기간 분모의 혼용, 질의응답의 근거 추적 부재를 정리해야 한다. 이 네 가지가 해결되지 않으면 심사위원이 수치의 정확성보다 데이터 거버넌스와 과장 해석을 문제 삼을 가능성이 높다.

출품 포지션은 다음 문장이 가장 방어 가능하다.

> 광진구의 이질적인 행정·공공데이터를 공간 단위로 연결하고, 관측 편향과 분석 한계를 드러내며, 근거가 있는 관리대상 선정과 검증 가능한 정책 실험을 지원하는 생활환경 의사결정 시스템.

“AI가 무단투기의 원인을 규명한다”, “CCTV 효과를 입증한다”, “발생량을 예측한다”는 표현은 현재 증거 범위를 넘는다.

## 2. 검토 기준과 대회 적합성

서울시 2026 빅데이터 활용 경진대회 공고는 분석 부문에 빅데이터캠퍼스 핵심 113종 중 1종 이상과 지정 데이터군 1종 이상을 요구하고, 창업 부문에는 서울 열린데이터광장 데이터 1종 이상과 AI 기술 활용을 요구한다. 부문별 요건과 접수 일정은 [서울시 공식 공고](https://news.seoul.go.kr/gov/archives/576001)의 원문을 기준으로 확인해야 한다. 해당 공고의 2026년 접수 기간은 5월 13일에 종료되었으므로, 이번 출품이 다른 연도·분야·대회라면 필수 데이터와 공개 검증 요건을 새 공고로 다시 대조해야 한다.

이 작품은 서로 다른 분야의 데이터를 연결했다는 점에서 공공데이터 활용성과 데이터 결합 가점에 유리한 구조다. 다만 “서울시 데이터”가 실제 필수 데이터셋으로 인정되는지는 제출 부문과 데이터셋 식별자, 사용 구간, 가공 방법을 별도 표로 증빙해야 한다. 현재 화면의 출처명만으로는 심사자가 필수 요건 충족 여부를 즉시 검증하기 어렵다.

## 3. 확인된 강점

### 데이터 아키텍처

- 민원 3,462건, 과태료 3,247건, 건축물대장 24,520동, 인구·세대·도로·POI를 결합하고, 민원은 접수 시각, 과태료는 위반 시각이라는 시간 의미를 구분한다. 이 구분은 생활환경 행정에서 “발생 시각”과 “발견·단속 시각”을 혼동하지 않게 하는 중요한 설계다. [types.ts:53](/Users/chris_gomdori/workspace/gjdong/lib/dumping/types.ts:53) [context.ts:159](/Users/chris_gomdori/workspace/gjdong/lib/dumping/context.ts:159)
- 100m 격자, 회귀 표본, 지도 표시 표본을 단계로 나누는 원래 분석 명세가 있다. 전체 1,818셀, 회귀 1,062셀, 지도 표시 960셀은 서로 다른 모집단이며, 이 차이를 표준 메타데이터로 노출하면 공간 분석의 투명성이 좋아진다. [MODEL_SPEC.md:15](https://github.com/chrisryugj/gwangjin-dumping/blob/1e8dce6fc6c0f9a2a7b30d517f1a5fbe9d5c3ae9/REPRODUCE/MODEL_SPEC.md#L15-L22)
- 군집성·이분산·과산포·공간 자기상관을 진단하고, wild cluster bootstrap과 음이항 회귀를 병행한 기록이 있다. 잔차 Moran’s I 0.197, 포아송 산포 5.57, R² 약 0.260이라는 불편한 결과를 숨기지 않는 태도는 강점이다. [MODEL_SPEC.md:65](https://github.com/chrisryugj/gwangjin-dumping/blob/1e8dce6fc6c0f9a2a7b30d517f1a5fbe9d5c3ae9/REPRODUCE/MODEL_SPEC.md#L65-L74)
- 행정동 경계 오류와 다가구 판정 누락을 발견하고 보정한 데이터 QA 기록이 있다. 원자료를 무조건 신뢰하지 않고 공간 귀속·분류 규칙을 검증한 점은 데이터 아키텍트 관점에서 높은 점수를 줄 수 있다.

### 분석·거버넌스

- 이동식 CCTV의 초기 감소 효과를 대칭 설계에서 재검토하고, 효과 주장을 철회했다. “효과가 있다”는 결론을 지키기보다 분석 설계를 의심한 사례이며, 심사에서 신뢰를 만드는 차별점이다. 다만 결과는 “효과가 없음이 증명됨”이 아니라 “현재 설계에서 차이를 확인하지 못함”으로 표현해야 한다.
- 품목, 처분 퍼널, SLA, 핫스팟, 수요 전망, 인허가 구조 전망을 하나의 의사결정 레이어로 묶었다. 정책 제안이 단순 지도 시각화에서 끝나지 않고 대상·지표·평가 설계로 이어지는 방향은 좋다.
- 온톨로지 그래프가 데이터셋·증거·주장·변수·KPI·위험·정책수단을 연결하고, 69노드·95엣지·고아 노드 0·중복 0으로 내보내진다. 온톨로지를 장식용 그래프가 아니라 “빠진 대책과 근거의 연결”을 찾는 인터페이스로 사용하려는 방향이 분명하다.
- 질의응답의 차트 수치는 LLM이 생성하지 않고 JSON 집계에서 직접 파생한다. 지도에 반영하는 동작, 데이터·방법 모달, 동 브리핑 인쇄, 모바일 분할 화면 등 행정 실무 사용을 고려한 화면 흐름도 갖췄다. [qa-chart.tsx:1](/Users/chris_gomdori/workspace/gjdong/components/dumping/qa-chart.tsx:1) [modal-shell.tsx:1](/Users/chris_gomdori/workspace/gjdong/components/dumping/modal-shell.tsx:1)

## 4. 출품 차단·최우선 이슈

### P0. 인증 뒤에 둘 데이터가 공개 GitHub에서 직접 내려받아짐

프로덕션 `/api/dumping/data/map`은 비로그인 요청에 401을 반환하고, `/dumping`에는 noindex가 붙어 있다. 그러나 저장소 자체는 공개이며, `https://raw.githubusercontent.com/chrisryugj/gjdong/main/data/dumping/map.json`은 비로그인으로 200을 반환한다. 2026-09-05 확인 시 파일 크기는 약 185KB였고, `cctvCandidates` 20건 모두 대표주소 필드를 포함했다. 인증 라우트의 접근 통제와 저장소·raw CDN의 공개 범위가 서로 다른 상태다.

이 파일이 개인 식별정보를 직접 포함한다고 단정할 수는 없지만, 내부 행정자료에서 파생한 CCTV 재배치 후보와 대표주소·공간 패턴을 공개 출품물에 포함할지에 대한 데이터 거버넌스 판단이 먼저 필요하다. “페이지는 암호로 잠갔다”는 설명만으로는 공개 저장소의 과거 커밋, raw URL, fork·캐시를 회수하지 못한다. [route.ts:1](/Users/chris_gomdori/workspace/gjdong/app/api/dumping/data/[name]/route.ts:1) [map.json](/Users/chris_gomdori/workspace/gjdong/data/dumping/map.json)

완료 기준은 공개용 익명화 산출물과 내부 운영용 산출물의 분리, 모든 공개 파일·Git 이력·배포 아티팩트의 사전 점검, 대표주소·후보지·소규모 셀의 재식별·운영상 민감도 검토, 출품 공고의 공개 검증 범위와의 일치다. 이 판단이 끝나기 전에는 공개 링크를 심사자료에 넣지 않는 것이 안전하다.

## 5. P1. 통계·해석·재현성 이슈

### P1-1. 민원 채널 배율의 기간과 분모가 섞임

현재 집계 JSON의 동일 1~8월 비교는 다음과 같다.

| 지표 | 2024년 1~8월 | 2026년 1~8월 | 비율 |
|---|---:|---:|---:|
| 전체 민원 | 694 | 1,395 | 2.010 |
| 앱 민원 | 366 | 1,050 | 2.869 |
| 120·직접 | 328 | 345 | 1.052 |
| 위반일 기준 과태료 | 1,143 | 555 | 0.486 |

화면의 2.10배·2.97배·1.10배는 2026년 8개월 수치를 12개월로 연환산한 값으로 보이며, 과태료 1.1배 문구는 현재 연도별 집계와 기준기간을 확인할 수 없다. 2026년 데이터도 8월 27일 기준이라 동일 월 비교조차 완결 일수가 다르다. “민원 증가분 대부분은 앱 보급 효과”는 채널 변화 가설로는 의미가 있지만, 앱 이용자 수·중복 신고·채널 이동·단속량이 없으면 발생량 증가를 배제하는 인과 분해가 아니다. [findings-data.ts:70](/Users/chris_gomdori/workspace/gjdong/components/dumping/findings-data.ts:70) [map.json](/Users/chris_gomdori/workspace/gjdong/data/dumping/map.json)

권장 판정은 동일 일수 또는 완결 월을 기준으로 다시 계산하고, “신고 채널 구성 변화가 관찰되었다”와 “발생 증가가 앱 때문이었다”를 분리하는 것이다.

### P1-2. “인구 통제”가 실제 회귀식과 불일치

화면과 방법 모달은 인구를 통제한 뒤의 결과처럼 설명하지만, 실제 10개 회귀변수는 무관리주거, 공동주택 세대, 음식점, 야간업소, 생활도로, 골목비율, 간선 이격거리, 재활용정거장, 고정 CCTV, 이동식 CCTV다. 인구, 생활인구, 가구원수, 순찰 노출량 또는 단속 횟수, offset은 회귀식에 없다. 동별 천명당 지표를 보여 주는 것과 격자 회귀에서 인구를 통제하는 것은 다른 주장이다. [findings-data.ts:20](/Users/chris_gomdori/workspace/gjdong/components/dumping/findings-data.ts:20) [methods-modal.tsx:120](/Users/chris_gomdori/workspace/gjdong/components/dumping/methods-modal.tsx:120) [MODEL_SPEC.md:40](https://github.com/chrisryugj/gwangjin-dumping/blob/1e8dce6fc6c0f9a2a7b30d517f1a5fbe9d5c3ae9/REPRODUCE/MODEL_SPEC.md#L40-L55)

또한 “관리주체 없는 주거”는 실제 관리자의 부재를 관측한 변수가 아니라 건축물대장의 다가구 가구수와 일반단독 동수를 합친 대리변수다. 따라서 “관리 구조가 원인”보다 “관리 취약 주거의 대리변수가 기록된 적발 건수와 연관됨”이 현재 증거에 맞다. 관리자·배출장·수거노선·순찰 노출의 표본 확인이 있어야 기제 설명으로 올라갈 수 있다.

### P1-3. 홀트윈터스 MAPE 18%는 독립 백테스트가 아님

`build_decision_layer.py`는 마지막 8개월의 MAE로 125개 α·β·γ 조합을 고른 뒤, 같은 마지막 8개월의 잔차로 MAPE 18%를 보고한다. 모형 선택구간과 평가구간이 겹치므로 외부 성능 검증으로 부를 수 없다. 초기 추세 상태에도 평가 시작점의 자료가 들어가며, 80% 예측구간은 경험적 포함률을 검증하지 않은 RMSE 근사다. [build_decision_layer.py:238](https://github.com/chrisryugj/gwangjin-dumping/blob/1e8dce6fc6c0f9a2a7b30d517f1a5fbe9d5c3ae9/scripts/build_decision_layer.py#L238-L266) [ops-modal.tsx:230](/Users/chris_gomdori/workspace/gjdong/components/dumping/ops-modal.tsx:230)

시계열은 cutoff 이전 데이터로만 선택·적합한 뒤 1·3·6개월 ahead를 별도 평가해야 한다. naive·seasonal naive·damped trend 같은 기준모형과 MAE/MASE·편향·구간 포함률을 함께 내야 한다. 시계열 교차검증의 기본 원리는 [Forecasting: Principles and Practice](https://otexts.com/fpp3/tscv.html)에 정리돼 있다.

### P1-4. KPI가 “신고편향 제거”라고 설명되지만 모든 민원+과태료를 포함

집중관리 상습격자·핫스팟 KPI는 앱을 포함한 민원과 과태료를 합산한다. 앱 신고가 늘고 실제 투기가 같아도 임계치를 넘는 셀이 늘 수 있다. 민원과 과태료가 같은 사건에서 만들어진 경우 중복도 남는다. 33개 셀은 유용한 관리수요·업무량 지표지만, 신고 편향이 제거된 성과지표는 아니다. [ops-panel.tsx:75](/Users/chris_gomdori/workspace/gjdong/components/dumping/ops-panel.tsx:75) [build_decision_layer.py:128](https://github.com/chrisryugj/gwangjin-dumping/blob/1e8dce6fc6c0f9a2a7b30d517f1a5fbe9d5c3ae9/scripts/build_decision_layer.py#L128-L150)

관찰 지표(신고·적발), 서비스 지표(SLA), 현장 결과 지표(표준 순회조사 쓰레기량·재발률)를 분리하고, 사건 ID 연결·중복 제거·단속 활동량을 명시해야 한다.

### P1-5. 비유의와 음의 계수를 무관·반증으로 번역

공동주택 계수 p=.708을 “아무 관련 없음”, 골목비율·간선 이격의 음의 계수를 “은폐 가설 반증”, CCTV 결과를 “평균회귀로 전부 설명”하는 문장이 발견된다. 비유의는 효과 부재의 증명이 아니며, 같은 점추정에 표준오차만 달리한 OLS·HC3·군집 보정을 독립적인 반복 증거처럼 세면 안 된다. p값은 가설의 진실 확률이나 효과 크기를 뜻하지 않는다는 [미국통계학회 공식 성명](https://www.amstat.org/asa/files/pdfs/p-valuestatement.pdf)과도 맞지 않는다.

허용 표현은 “현재 자료·모형에서 연관을 확인하지 못함”, “대체 설명을 배제하지 못함”, “선택규칙과 대조군 정의에 민감하여 기존 효과 주장을 철회함”으로 통일해야 한다. 효과크기에는 신뢰구간과 실질적 의미를 붙여야 한다. [findings-data.ts:35](/Users/chris_gomdori/workspace/gjdong/components/dumping/findings-data.ts:35) [context.ts:65](/Users/chris_gomdori/workspace/gjdong/lib/dumping/context.ts:65)

### P1-6. 과태료는 신고와 독립적인 실제 발생 측정이 아님

과태료는 발생×발견×단속×신원확인×처분의 결과다. CCTV·순찰을 늘리면 투기가 줄어도 적발은 늘 수 있고, 단속 인력의 근무시간이 시간대·요일 분포에 섞인다. 따라서 과태료를 “신고 편향 없는 실제 발생”으로 부르면 탐지 과정의 변화를 발생 변화로 오인할 수 있다. 독립 현장관찰, CCTV 가동·탐지량, 순찰 노출, 적발경로, 처분 전환율을 함께 관리해야 한다. [context.ts:159](/Users/chris_gomdori/workspace/gjdong/lib/dumping/context.ts:159)

### P1-7. SLA·징수율의 분모가 낙관적일 수 있음

2026년 민원 1,395건 중 SLA 산출 n이 1,346건이면 49건이 분모에서 빠진다. 미종결·날짜 오류·지연건을 제외한 완료건 SLA는 전체 시민 경험보다 낙관적일 수 있다. 징수율 95.4%는 확정 납부·체납 건수 기준이며, 금액 기준과 전체 부과액 대비 납부액은 다르다. “집행력은 정상”보다 “확정 처분 건 중 납부완료 비율”로 제한해야 한다. [build_decision_layer.py:101](https://github.com/chrisryugj/gwangjin-dumping/blob/1e8dce6fc6c0f9a2a7b30d517f1a5fbe9d5c3ae9/scripts/build_decision_layer.py#L101-L125) [ops-modal.tsx:175](/Users/chris_gomdori/workspace/gjdong/components/dumping/ops-modal.tsx:175)

### P1-8. 재현 패키지의 해시 검증과 계산 재현을 구분해야 함

`verify.py`는 해시와 핵심 개수·합계를 대조하지만 회귀계수, 신뢰구간, DID, MAPE, 핫스팟 성능을 재추정하지 않는다. README도 `viz.json` 생성 코드가 보존되지 않아 해시로 고정한다고 명시한다. 따라서 “모든 수치가 재현된다”보다 “고정 산출물의 무결성과 일부 핵심 수치를 확인한다”가 정확하다. 데이터셋·증거·주장 노드에도 source/version/run/as-of/hash가 구조화되어 있지 않다.

출품본에는 핵심 수치별 원천 파일, 변환, 모형, 결과, 문구, 실행시각을 연결한 provenance 표와 깨끗한 환경의 일괄 실행 로그가 필요하다. 온톨로지는 [W3C PROV-O](https://www.w3.org/TR/prov-o/)의 Entity–Activity–Agent 관계 또는 이에 준하는 단순한 구조를 채택하고, 값·단위·시간창·공간단위·집계규칙·공개등급을 필수 속성으로 두는 것이 좋다.

## 6. P1. 질의응답·운영 보안

### 후속 질문의 대화 이력이 보통 길이에서 사라짐

`normalizeHistory`가 출력 길이로 `cut`을 시작하고, 8,000자를 초과할 때만 잘라낸다. 따라서 일반적인 40·7,998·8,000자 수준의 다중 턴 이력은 `slice(length)`가 되어 0턴이 된다. “그 동은 왜?”와 같은 후속 질문이 앞선 질문을 참조하지 못한다. [route.ts:25](/Users/chris_gomdori/workspace/gjdong/app/api/dumping/ask/route.ts:25) [route.ts:40](/Users/chris_gomdori/workspace/gjdong/app/api/dumping/ask/route.ts:40)

질의응답은 그래프 전체를 시스템 프롬프트에 직렬화하고 “근거의 전부”라고 선언하지만, 서버 응답에 evidence ID·데이터 버전·철회 상태를 구조화하지 않고 생성 텍스트를 바로 스트리밍한다. 화면의 “지식그래프와 수치만 근거” 보장을 자동 검증하는 층이 없다. `qa-chat.tsx`와 `context.ts`에 수치·해석·fallback 상수가 중복되어 데이터 갱신 시 낡은 문장이 남을 수 있다. [context.ts:56](/Users/chris_gomdori/workspace/gjdong/lib/dumping/context.ts:56) [ask/route.ts:90](/Users/chris_gomdori/workspace/gjdong/app/api/dumping/ask/route.ts:90) [qa-chat.tsx:350](/Users/chris_gomdori/workspace/gjdong/components/dumping/qa-chat.tsx:350)

출품 전에는 철회된 CCTV 결론, 수치 조작 유도, 인구·외국인·청년 집단의 원인 지목, what-if 감축량, 미확보 데이터 질문을 포함한 고정 평가셋을 두고, 근거 부족 시 유보하는지 확인해야 한다. 이는 생성형 AI 기능의 신뢰성을 보여 주는 더 강한 증거가 된다.

### 서버리스 운영 통제의 한계

로그인 시도 제한은 인스턴스별 메모리 Map이므로 서버리스 인스턴스가 분산·재시작되면 전역 제한이 아니다. HMAC 쿠키의 30일은 브라우저 보관기간이며 서버 측 세션 만료·사용자별 회수·로그아웃이 없다. 내부 단일 비밀번호 운영에는 단순하지만, 공개 시연과 심사 링크를 위한 접근 통제로는 운영 절차가 부족하다. [rate-limiter.ts:1](/Users/chris_gomdori/workspace/gjdong/lib/utils/rate-limiter.ts:1) [auth.ts:15](/Users/chris_gomdori/workspace/gjdong/lib/dumping/auth.ts:15) [auth/route.ts:35](/Users/chris_gomdori/workspace/gjdong/app/api/dumping/auth/route.ts:35)

클라이언트의 “중단”도 잠긴 upstream reader에 `body.cancel()`을 호출해 오류를 삼키고, upstream fetch가 요청 취소 신호에 연결되지 않는다. 화면에서 중단을 눌러도 외부 LLM 비용이 계속될 가능성을 계측해야 한다. [ask/route.ts:101](/Users/chris_gomdori/workspace/gjdong/app/api/dumping/ask/route.ts:101) [ask/route.ts:149](/Users/chris_gomdori/workspace/gjdong/app/api/dumping/ask/route.ts:149)

## 7. P2. 방법론·제품 품질 보강

- 공간 자기상관을 진단했지만 군집 표준오차만으로 공간 누락변수를 제거할 수 없다. 50/100/200m, 격자 원점 이동, 전 1,818셀 대 회귀표본, 공간 블록 교차검증, OSM 누락 민감도를 보고해야 한다. 차량 담배꽁초 912건(28%)과 생활쓰레기를 분리한 결과 없이 전체 과태료 회귀계수로 은폐 가설을 판단하면 기제 혼합 문제가 남는다.
- 핫스팟의 시간 분할은 장점이지만, “4배 높은 적중률”은 포착률 11.5%를 무작위 2.8%와 비교한 약 4.1배이지 precision 65%가 4배라는 뜻이 아니다. 최근 빈도·전년 동분기·정적 상습셀 기준모형과 반감기·적발 가중·K값 민감도를 추가해야 한다. [findings-data.ts:155](/Users/chris_gomdori/workspace/gjdong/components/dumping/findings-data.ts:155)
- CCTV 철회는 신뢰의 자산이지만, 동일 never-treated 셀 반복 사용, 겹치는 창의 상관, 설치월 대입, 미래 결과를 사용한 대조군 선별 가능성을 점검해야 한다. “평균회귀로 전부 설명” 대신 “선택규칙과 대조군 정의에 민감해 기존 효과 주장을 철회”가 안전하다.
- 조치 대장은 현재 예시 1건이고 대상 격자·등록일·실행일이 비어 있다. 설계 원칙은 강점이지만 운영 중인 정책효과 평가 체계의 실증은 아니다. [interventions.json:1](/Users/chris_gomdori/workspace/gjdong/data/dumping/interventions.json)
- 지도 범례가 구간·단위를 충분히 말하지 않고, Canvas 격자에 키보드·스크린리더용 동등한 상세 표가 없다. 선택 셀의 수치·기간·단위 표, 수치 구간 범례, 360px·200% 확대·키보드 전용 검증이 필요하다. 온톨로지 자동 회전에는 재생·정지와 reduced-motion 대응이 필요하다. [map-controls.tsx:180](/Users/chris_gomdori/workspace/gjdong/components/dumping/map-controls.tsx:180) [ontology-graph.tsx:170](/Users/chris_gomdori/workspace/gjdong/components/dumping/ontology-graph.tsx:170)

## 8. 권장 실행 순서

1. 공개 저장소·raw URL·배포물의 데이터 공개등급을 확정하고, 내부용 후보지·대표주소와 공개용 익명화 집계를 분리한다.
2. 제출 부문의 필수 서울시 데이터·지정 데이터군·AI 사용 요건을 데이터셋 ID와 처리 단계로 증빙한다.
3. 민원·앱·120·직접·과태료의 동일 일수/완결월 비교표를 다시 산출하고, 연환산 수치에는 “가정·기간·부분연도”를 항상 붙인다.
4. “인구 통제”, “무관”, “반증”, “실제 발생”, “효과 없음”을 실제 모형과 증거 수준에 맞춰 전수 검토한다.
5. 전망은 cutoff별 파라미터 선택과 독립 평가를 분리하고, 기준모형·다중 horizon·구간 포함률을 추가한다.
6. 근거 레지스트리와 provenance를 만들고, QA가 evidence ID·버전·철회 상태를 반환하며 근거 부족 시 유보하도록 평가한다.
7. 정상 후속 대화, 인증 만료·재로그인, 전역 rate limit, 스트림 취소, 모바일·인쇄·접근성의 dumping 전용 회귀 테스트를 추가한다.
8. 마지막으로 공개 시연본에서 “정책 효과 입증”이 아니라 “검증 가능한 파일럿과 평가 설계”를 시연한다.

## 9. 최종 출품 메시지

내세울 강점은 세 가지다. 첫째, 행정·공공·공간 데이터를 100m 단위로 연결한 데이터 설계다. 둘째, 경계·분류·공간의존·과산포를 점검하고 불편한 CCTV 결과를 철회한 분석 품질관리다. 셋째, 발견→근거→정책수단→사전등록 평가로 이어지는 온톨로지 기반 업무 흐름이다.

반대로 다음 표현은 현재 근거로 사용하지 않는다. “원인을 밝혀냈다”, “CCTV가 효과 없다/있다를 증명했다”, “신고 편향을 제거했다”, “발생량을 예측한다”, “AI 정확도 82%”, “정책 시행 시 몇 건 감소한다”. 이 프로젝트의 설득력은 확정적 예언이 아니라, 어떤 결론을 어디까지 믿어도 되는지와 다음 현장 검증을 어떻게 설계할지를 보여 주는 데 있다.

## 10. 검증 기록

- `git pull --ff-only origin main`: Already up to date.
- `npm test`: 178 passed, 0 failed.
- `npm run lint`: 통과.
- `npx tsc --noEmit --incremental false`: 통과.
- 프로덕션 `/dumping`: HTTP 200, `X-Robots-Tag: noindex, nofollow`.
- 프로덕션 비로그인 `/api/dumping/data/map`: HTTP 401.
- 공개 GitHub raw `data/dumping/map.json`: HTTP 200, 약 185KB, `cctvCandidates` 20건, 대표주소 필드 20건.
- 이 검토에서는 로그인 시도, 실제 LLM 호출, 데이터 수정, 배포·외부 전송을 하지 않았다.

