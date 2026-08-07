# 인파레이더 이식 가이드 — 다른 지자체·기관이 가져다 쓰려면

이 문서는 인수인계 문서를 겸한다. 코드는 MIT(자유 사용), 데이터는 각 원천 기관의 조건을
따른다(NOTICE 참조).

## 1. 그대로 배포하기 (10분)

```bash
git clone https://github.com/chrisryugj/gjdong.git
cd gjdong && npm install
cp .env.example .env.local   # 키 채우기 (아래 표)
npm run dev                  # http://localhost:3000/crowd
```

| 환경변수 | 필요 기능 | 발급처 | 없으면 |
|---|---|---|---|
| `KAKAO_REST_API_KEY` | 주소 검색·자치구 매핑 스크립트 | developers.kakao.com (무료) | 주소 검색만 비활성 |
| `DATA_GO_KR_KEY` | 강원(강릉 ITS) | data.go.kr 활용신청 (무료, 즉시) | 강원 전 지점 "정보 없음" |
| `GEONET_PROXY` | 제주 (선택) | 자체 프록시 | 직결·스냅샷 폴백으로 동작 |

서울·부산·인천공항은 **인증키가 필요 없다.** 배포는 Vercel 기준이며 `vercel.json`의
`regions: ["icn1"]`(서울 리전 고정)이 중요하다 — 해외 리전에서는 국내 관공서 원천 일부가
빈 응답을 준다.

제주만 특수하다: 원천이 데이터센터 IP 대역을 거르므로 국내 일반 회선에서
`scripts/collect-jeju.ts`를 15분 주기로 돌려 스냅샷 브랜치(`data-jeju`)에 발행해야 한다
(맥미니 1대·라즈베리파이면 충분). 없으면 제주 탭만 빠진다.

## 2. 우리 지역 추가하기 — 어댑터 작성법

도시 하나 = 파일 세 곳. 라우트·UI 컴포넌트는 건드리지 않는다.

### 2-1. 어댑터 (`lib/crowd/{도시}.ts`)

세 함수를 구현한다. 기존 부산(`busan.ts`, 주차·도로 프록시형)이나 인천(`incheon.ts`,
대기시간형)을 복사해 시작하는 것을 권장.

```ts
export async function fetch{도시}Spots(): Promise<CrowdSpot[]>       // 목록 (필수)
export async function fetch{도시}Detail(name: string): Promise<CrowdDetail>  // 상세 (필수)
export async function fetch{도시}Extra(name: string): Promise<CrowdExtra>    // 부가정보 (선택)
```

- 지점 정의(이름·좌표·카테고리)는 파일 상단에 정적 배열로 둔다.
- 등급 원천이 없으면 만들어내지 말 것 — 주차·도로 프록시를 쓰면 `basis: "access"`를
  붙여 화면에 근거가 병기되게 한다 (부산·강원 전례).
- 공통 헬퍼는 `lib/crowd/adapter-kit.ts`에 있다: 재차율 임계(`parkRatioLv`), 도로 평균
  (`meanRoadLv`), Open-Meteo 날씨(`fetchMeteo12h`), 스냅샷 캐시(`createSnapshot`) 등.
- 관공서 API는 TLS 체인이 깨진 곳이 많다 — `krgovJson`(검증 완화 fetch)을 쓴다.
- **파일 상단에 "데이터 계약 실측" 주석을 남겨라.** 엔드포인트·응답 형태·함정(좌표축
  뒤집힘, 빈 응답의 의미)을 날짜와 함께. 이 주석이 이 프로젝트의 실질 기술 문서다.

### 2-2. 레지스트리 등록 (파일 2곳, 각 한 항목)

```ts
// lib/crowd/cities.ts — 도시 정보 + capability (클라이언트가 UI 분기에 사용)
CITY_IDS에 id 추가, CITIES에 {center, zoom, sourceUrl}, CITY_CAPS에 능력치
// lib/crowd/adapters.ts — 서버 라우팅
ADAPTERS에 { id, cacheHeaders, fetchSpots, fetchDetail, fetchExtra? }
```

CITY_CAPS의 각 필드(시계열·예보·히트맵·extra·자치구...)는 어댑터가 실제 주는 것만 true로.
정합은 `tests/crowd-registry.test.ts`가 검사한다.

### 2-3. 다국어·자치구 (선택이지만 권장)

- 지점명 번역: `lib/crowd/i18n-spots.ts`에 [en, ja, zh] 추가. 카테고리가 새 것이면
  `i18n-terms.ts`의 CATEGORY_T에도.
- 자치구 매핑: `.env.local`에 Kakao 키를 넣고
  `npx tsx scripts/generate-crowd-districts.ts > lib/crowd/districts.ts` 재실행.
- 헤더 부제·푸터 출처: `i18n-ui-{ko,en,ja,zh}.ts`의 subtitle*/footerData* 패턴.

### 2-4. 검증

```bash
npm run lint && npm test && npm run build   # CI와 동일 게이트
curl "localhost:3000/api/crowd?city={도시}" | jq '.spots | length'
```

## 3. 운영에서 알아둘 것

- **원천 보호가 1원칙.** 캐시 헤더(어댑터의 `cacheHeaders`)와 클라이언트 폴링 주기
  (`CITY_CAPS.pollMinutes`)를 원천 갱신 주기보다 짧게 잡지 말 것. 제주 원천이 과호출로
  차단을 강화한 실사고(2026-08)가 있다.
- 서울 히트맵(요일×시간)은 GitHub Actions(`.github/workflows/crowd-heatmap.yml`)가 3시간
  주기로 수집해 `data` 브랜치에 쌓는다. 포크하면 Actions를 켜야 히트맵이 자란다.
- 등급 산출 로직을 바꾸면 `docs/crowd-methodology.md`를 같이 고쳐라 — 화면과 문서가
  어긋나는 순간 기관은 인용할 수 없게 된다.
- 문의·기여: GitHub Issues (https://github.com/chrisryugj/gjdong/issues)
