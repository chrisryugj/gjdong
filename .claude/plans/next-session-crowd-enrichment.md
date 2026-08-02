# 인파레이더 2차 보강 — 완료 기록 + 잔여 (2026-08-02 갱신)

2차 보강 배포 완료 (main c69557c + 후속 lint 커밋). 아래는 결과 요약과 다음에 할 것.

## 완료 (2026-08-02 저녁)

- **히트맵 백필 탐사 종결**: `heatmap_api` 파라미터 규명함(`hotspotNm, baseDate(YYYYMMDD), timeCd(HHMM), minX/minY/maxX/maxY, width, height`, 세션쿠키 필요). 그러나 응답은 **공간밀집 PNG(base64)+popMax뿐, 혼잡레벨 없음, 보존 7일** → 요일×시간 히트맵 백필로는 기각
- **대체안 채택**: `ppltn_congest`가 직전 12시간 실측 레벨을 줌 → `scripts/collect-crowd-heatmap.mjs`를 12h 룩백+전역 `lastSlot`(YYYYMMDDHH) 중복방지로 재작성, cron 3시간 간격(`7 */3 * * *`). GH cron 스킵돼도 자가치유. `FRESH=1`로 초기화 재수집 가능. 로컬 1회 실행으로 오늘 06~17시 121곳×12표본 백필해 data 브랜치 반영됨
- **상세 패널 부가정보 6종**: `fetchSpotExtra`(acc·parking·event·road·bike 병렬, 개별 실패 무시) + `/api/crowd/extra?spot=` 지연 로드 분리. UI 순서: 사고통제 경고(있을 때만, 헤드라인 아래·해소예상 날짜 처리) → 주차 여유(실시간 제공 주차장만, 잔여율 색) → 진행 중 문화행사(오늘 포함 기간만, 무료 우선·무료 뱃지) → 도로소통 한 줄(지수·안내문·평균속도) → 따릉이(합계+명소 중심 가까운 대여소 4곳)
- **재난문자**: `/api/crowd` 목록 응답에 오늘분 동봉 → 대시보드 헤더 아래 앰버 배너(탭하면 전체 펼침)
- eslint flat config에 `scripts/**/*.mjs` node globals 블록 추가 (수집기 lint clean)

## 확인된 사실 (다음 세션 참고)

- SeoulRtd 좌표축: **acc·bike·event·parking은 x(또는 lng)=경도** — hotspot-category(x=lat)와 반대
- `disaster-message/today/{name}`은 경로 파라미터, 내용은 사실상 서울 공통
- 명소 121곳은 서울시가 정한 목록(우리가 확장 불가). 수집·표시는 50×3페이지=150까지 자동 흡수
- CI(ci.yml)는 `npm run lint`에서 **이 세션 이전부터 계속 실패** — 잔여 부채 72건(deck-stage.js 58, address-generator 7, crowd-sw 5, use-toast 2). crowd 신규 코드는 0건
- 로컬 검증 시 :3000에 옛 next 서버 떠있을 수 있음 → 3100 등 다른 포트 사용

## 잔여 (우선순위순) — 2026-08-03 갱신

1. **히트맵 표본 누적 관찰**: 3시간 cron이 12h씩 채우니 1주면 7×24 풀커버 (`gh run list --workflow "Crowd Heatmap"`)
2. ~~컴포넌트 분리~~ → **완료(b1316ff)**: dashboard 629줄 + crowd-header/nearest-panel/spot-list-panel/shared, spot-detail 307줄 + spot-chart/spot-heatmap/spot-cctv/spot-extras
3. 미도입 엔드포인트: `/roadGraph`(24h 차트에 도로속도 겹치기), `/charger`, `/consumption` 5종 — 가치 낮아 보류
4. ~~린트 부채 72건~~ → **완료(c31a6ea, 72→0)**

## 3차 UX 개편 (2026-08-03, b1316ff 배포완료)

- PC 패널 440px(xl 500px) + 전반 타이포 +1px, PC 필터 칩 줄바꿈(스크롤에 숨던 혼잡도 칩 해소)
- 라이트테마 소형 텍스트 대비: `textColor()` (seoul-rtd.ts, 라이트에서만 진한 변형색)
- 모바일 뒤로가기=상세 닫기 (pushState/popstate, 상세→상세 replace, 딥링크 pushed:false)
- 히트맵 셀 탭 상세 표시(터치 title 툴팁 보완), 상세 실패 재시도 버튼, aria-pressed/expanded
