# /dumping 7라운드 (2026-09-06) · UI/UX 가독성 개편

사용자 지적 8건(글자 작음·빽빽함, 첫 5초 이해 불가, 지도 과대, 칩·모달 겹침, 빈 격자의 뜻, 결재란 제거+이유, "(" 줄바꿈, 슬롭)을 한 라운드로. 결과와 근거는 `docs/dumping-contest-review.md` 11절이 정본.

- 폰트 한 단계 상향(스크래치 `bump.mjs` 매핑: 11→12.5, 12→13.5, 13→14.5, 14→15.5, 15→16), 모달 폭 확대
- `map-controls.tsx` → `MapToolbar`(지도 위쪽 띠) + `MapOverlays`(범례 카드·후보 목록). 기본 export 없음
- `use-sidebar-width.ts` 데스크톱 패널 폭 드래그(기본 40%, 420~640)
- `dumping-map.tsx` 값 0 칸 옅게(`ZERO_CELL`), 핫스팟 배지 줌 임계 13.5
- `policy-board.tsx` 첫 화면 축소(04·05 접힘), 표 제거. `policy-table.tsx` 결재란 제거 + 제안별 이유
- `lever-view.ts` `splitParen`/`joinParen`
- 확인 스크립트는 스크래치패드(shoot.mjs·shoot2.mjs·shoot3.mjs). 로그인은 `ctx.request.post(/api/dumping/auth, {origin})`, 서버는 `next start -p 3000`
- 미커밋. 커밋·푸시는 사용자 지시 후(main 직접 = 배포)
