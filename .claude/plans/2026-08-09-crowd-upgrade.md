# 인파레이더 업그레이드 — 2026-08-09

유저 선택: 시민체감(지금vs평소·대기질·행사·지하철) + 공공활용(특보+재난문자 전국·보고서 고도화·행사 연동 상황실) + UI(정보 위계·모바일, 톤 유지).

## 키 실측 결과
- 기상특보(15000415)·긴급재난문자(15134001)·에어코리아(15073861)·TourAPI(15101578): **활용신청 필요** (유저 진행 중). 미승인 동안 어댑터는 빈 값 폴백.
- 서울RTD `subway?hotspotNm=`: **무키 실측 성공** — 호선·역명·좌표·실시간 도착(arvlMsg2). `bus`는 전 지점 빈 배열 → 미채택.
- 재난문자 엔드포인트는 `www.safetydata.go.kr/V2/api/DSSP-IF-00247` (신청은 data.go.kr).

## 구현 설계
1. **lib/crowd/safety.ts** (서버): 기상특보 getPwnStatus(도시별 stnId 109/159/105/184) + 행안부 재난문자(rgnNm 필터, 당일). createSnapshot 10분. CrowdDisaster 형태로 병합 → 기존 배너·보고서 그대로 탄다. CITY_CAPS.disaster 전 도시 true. 서울 = RTD재난문자 + 특보(행안부는 중복이라 제외).
2. **lib/crowd/air.ts** + `/api/crowd/air?city=&spot=`: 시도별 실시간(getCtprvnRltmMesureDnsty) 스냅샷 15분 → 지점→자치구→측정소 정적 매핑(서울=구명 동일, 나머지 큐레이션) + 도시 폴백. 상세 패널 대기질 섹션.
3. **지하철**: seoul fetchSpotExtra에 subway 추가 → CrowdExtra.subway. SpotExtras 섹션 + JumpChip.
4. **lib/crowd/events.ts** + `/api/crowd/events?city=`: TourAPI searchFestival2(areaCode 1/6/32/39/2, 120일 룩백 → 진행중+예정 필터), 캐시 6h. 지점 반경 매칭(제주 r, 기본 1200m). 상세 "주변 행사"(비서울) + 상황실 행사 패널(감시목록 추가). caps.tourEvents.
5. **지금 vs 평소**: heatmap-client에 baseline 유틸 + use-baseline 훅(서울·제주). 목록 행·상세 헤드라인 배지.
6. **보고서**: 특보는 disaster 병합으로 자동 편입. 행사 부록 테이블 추가.
7. **i18n**: 신규 UI 문자열 4개 파일 동시(UIStrings 강제). 특보 용어 DISASTER_T 확장.
8. **테스트**: safety 파서·air 리졸버·events 매칭·subway 파서·caps 일관성.

## 함정 메모
- i18n 4언어 대칭 빌드 강제. 서울RTD 좌표축 반전 주의. 제주 원천보호 유지(이번 작업은 제주 원천 콜 추가 없음 — 행사·특보는 별도 원천).
- 미승인 키 → 조용히 빈 값 (배너/섹션 미노출). 승인 후 라이브 실측으로 파서 확정할 것.
