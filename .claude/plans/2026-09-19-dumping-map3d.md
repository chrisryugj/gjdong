# 2026-09-19 /dumping 지도 입체화 (16라운드)

레퍼런스: 서울 3D Atlas v5.4(Three.js 미니어처, 지형+OSM 건물+연출). 유저 결정(2026-09-19): A 엔진 교체·PMTiles 자체 호스팅·15라운드 선커밋(9746f21).

## 가져올 것 / 버릴 것
- 가져옴: 기울인 시점, 격자 기둥·상습격자·핫스팟 진짜 입체(fill-extrusion), OSM 건물 3D(저층 다가구 vs 아파트 대비), 아차산 지형, 평면/입체 토글, 자동 회전(시연)
- 버림: 낮/노을/야경·비/눈·나무·배·차(시간대 데이터 없음, 장식)

## 구현
1. 정적 자산 `public/dumping/basemap/` = `gwangjin.pmtiles`(Protomaps 20260918, bbox 127.02,37.49,127.16,37.60 z≤15, 10.2MB) · `dem.pmtiles`(AWS terrarium z8~14, 6.4MB) · `fonts/`(Noto Sans Regular·Medium·Italic 0-511 글리프 0.6MB). 한글 글리프는 `localIdeographFontFamily`(SUIT)
2. 의존성: `maplibre-gl` `pmtiles` `@protomaps/basemaps`. Leaflet은 crowd·facility 유지
3. `dumping-map.tsx` 재작성: 스타일 = @protomaps/basemaps light 플레이버 + 종이 톤 덮어쓰기 + 아이콘 레이어 제거 + 구 안 OSM 동 라벨 숨김(`within`). 레이어 13종 이식(바탕4·원2·날씨·시설5·후보·배치추천·핫스팟·상습격자·노선·동막대·포커스·마스크·링·동 라벨)
4. `MapView`에 `tilt`(입체 보기, 기본 켬)·`orbit`(자동 회전) 추가. 격자 기둥 켜면 입체 자동
5. CSS: leaflet 규칙 → maplibre(popup·ctrl), 동 막대 SVG 애니메이션 유지
6. 검증: tsc·eslint·254 테스트·빌드·Playwright(데스크톱 5탭·1024·모바일)·Range 요청(next start)
7. 문서: CLAUDE.md 7번 "16라운드", 데이터·방법 모달 바탕 출처

## 결과(2026-09-19)
- 1~7 완료. tsc·eslint·261 테스트·빌드·Playwright(1440 5상태·1024·390) 통과. 정본 설명 CLAUDE.md 7번 "16라운드"
- 실측 함정: 옵션 padding은 기울기와 어긋남 → map.setPadding, `maxZoom: undefined` → NaN, 훅 순서 React #310, attribution 첫 화면 펼침이 줌 버튼을 가림

## 함정 후보(계획 시점)
- `public/` pmtiles는 HTTP Range 필수. `next start` 로컬 확인
- fitBounds는 pitch를 모른다 → cameraForBounds 뒤 easeTo(pitch)
- fill-extrusion은 pitch 0에서 높이가 안 보인다 → 기둥 토글이 입체를 강제
- OSM 건물 커버리지가 구의·자양 일부에서 비어 있음(후속: NSDI GIS건물통합정보)
