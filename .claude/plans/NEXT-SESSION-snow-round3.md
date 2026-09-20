# /snow 3라운드 지시서 · 구간 정확도·3D 핀·색 문법·밀도

작성 2026-09-20 밤(2라운드 d4019f8 배포 직후). 사용자 평가: "구간 이상한 거 많고 슬롭 많이 보임. 정보 핀은 전부 3D여야 하는데 2D가 많음. 취약 층과 열선 색이 비슷해 구분 안 됨. 급경사 추정은 선택해도 표시가 제대로 안 되고 다른 게 안 뜸. 데모용 모듈도 이식해 와야 함. 정보 표시가 정돈이 안 됨. dumping처럼 밀도 있게."
이 파일은 할 일이다. 읽었으면 바로 실행한다. 순서 0 › 1 › 2 › 3 › 4 › 5. 각 절 끝에 게이트.

**실행 완료 2026-09-21 새벽.** 기록 `docs/snow-production-review-2026-09-20.md` 8절(냉독 66, 지적 반영 8-8). 중간 요청 "보고받는 사람 입장 UI/UX 재구성"은 소관 분리·점검 후보·헤더 상태 줄로 5절에 합쳐 반영. ★냉독이 잡은 실사고: 열선 흐름 dasharray 연속 갱신 → LineAtlas 고갈 → 1분 뒤 지도 위 레이어 소실(양자화로 수리).

## 0. 세션 규약

- 레포 `~/workspace/gjdong`, main 직접 푸시 = 배포. npm `/opt/homebrew/bin/npm`, 도구 `node node_modules/.bin/<도구>`. 스크린샷 `pkill -f next-server` › `next dev -p 3000` › Playwright(character-card). 개발 서버에서만 `window.__snowMap`.
- 먼저 읽을 것: CLAUDE.md 7(dumping 규약·함정: icons3d·riseColumns·orbit·flyTour·시연 큐)·8(snow 2라운드), `docs/snow-production-review-2026-09-20.md`, `docs/snow-data-survey.md` 4절, 메모리 `feedback-deck-design-antislop`(★세로 컬러바 전면 금지, 목록 왼쪽 선·blockquote 선 포함. 게이트 `tests/snow-copy.test.ts`), `project-gjdong-dumping-dashboard`(3D 아이콘·순위 배지·청소차 구현 함정).
- dumping 파일 수정 0. 복사해서 snow용으로 고친다.

## 1. 구간 정확도 (2라운드 직후 실측으로 원인 확정. 아래 "반영됨" 항목은 커밋 완료, "남은 일"부터 시작)

실측 2026-09-20 밤:
- **도로망 그래프가 3,953조각으로 끊겨 있었다.** 원인은 z15 타일 경계에서 잘린 긴 선분(교량·간선)의 잘린 끝점 좌표가 양쪽 타일에서 서로 다름(extent 양자화+버퍼). 청담대교 분당수서로가 37.5273에서 285m·401m로 끊겨 한강 남쪽 1,541노드가 섬 → 다익스트라 실패 → **직선 폴백이 한강을 가로질러 그려짐**(사용자 스크린샷). `snow-roads.mjs`에 ①양 끝 타일 밖 조각 버리던 필터 제거 ②노드 키 2m 격자 양자화 ③`stitchTileSeams`(차수 1 끝점끼리 같은 이름·종류·45m 안이면 봉합) 반영 → 1,805조각, a·b 연결. 그래도 램프 연결이 끊긴 곳은 최단 8.6km(6km 상한 초과).
- 결빙구간 9행은 `snapAlongTrunk`(간선 체인 절단, 도로명 별칭 표 `TRUNK_ALIAS`, 우회 2.2배 기각) 폴백 후 그래도 안 되면 **`method: "points"` = 선을 그리지 않고 기점·종점만 벽돌 빈 원**(`iceEndsFC`·`S.iceEnds`)으로. 현재 동부간선도로 2행이 points, 자양로가 강변북로 trunk 144m, 나머지 6행 network.
- 열선 55는 봉합 뒤 named 25·network 14·point 12·straight 4. 취약구간 열선 있음 36→34, 급경사 117→114. 테스트 핀은 cq-seg-gap 19/56·공백 7로 갱신 완료.
- 시점≈종점 취약구간의 point 길이는 총도로길이가 아니라 300m 상한(없으면 60m)으로 제한 완료(아차산로 22번 2km 과장 실사고).
- `scripts/snow-verify.mjs` 신설 완료: 전 구간 물 위·구 밖·우회 검사 → `docs/snow-verify-latest.md`. 현재 109구간 위반 0. **게이트에 넣는다(`npm test` 앞에 실행).**
- 반영됨 상태에서 빌드·lint·테스트 25 통과, 커밋했으나 **프로덕션 스크린샷 미확인**(points 마커·결빙 1·2 라벨 겹침은 남은 일 4).

남은 일:
1. `docs/snow-data-survey.md` 4절 표를 `npm run snow:data` 결과로 재생성(지금 표는 봉합 전 수치).
2. 열선 straight 4건·point 12건을 z16 스크린샷으로 전수 확인하고 지도에 없는 보행로(동의초 통학로 보도열선 등)는 툴팁에 "지도에 없는 보행로" 명시. 2025-12 신설 램프 열선 4건은 point가 아니라 **램프 방향으로** 그려지는지 확인(primary_link 위 145~190m).
3. 취약구간 47 중 point 13(기점=종점)·straight 2를 z16으로 전수 확인. 300m 상한은 반영됐으나 능동로 120(기타·시도, 좌표 한 점)이 아차산로 위 300m로 그려지는 게 맞는지 원자료 좌표를 다시 보고, 아니면 60m로.
4. 결빙 1·2 라벨이 끝점에 겹침 → points는 라벨을 기점 하나에만, 번호 배지 대신 "결빙 1·2(선형 미확인)" 하나로.
5. `package.json`에 `snow:verify` 스크립트 추가하고 `snow:data` 뒤에 자동 실행.

**게이트 1**: `snow-verify` 위반 0 유지, z16 스크린샷 4장(중곡4동·구의2동·광장동·자양4동 강변 points 마커) 확인, 테스트 통과.

## 2. 급경사 추정 레이어 (버그 실측: 상태는 정상, 시각이 0. 코드 미반영)

Playwright 실측(2026-09-20 밤, `scratchpad/slope-bug.mjs`): 토글하면 `snow-slope` visible/116 렌더되고 다른 레이어는 그대로다. 즉 "선택해도 표시 안 됨"은 **1~2.2px 벽돌 점선이 구 전체 줌에서 안 보이고 취약구간과 같은 색이라 구분도 안 되는** 시각 문제. 고칠 것:
- 급경사 추정은 **별도 색·별도 형태**: 취약구간(벽돌)과 분리해 보라 계열(#b48ee8 다크 / #6d4fb3 라이트) 점선, 줌 12에서 2.5px·15에서 4px, 켤 때 `line-gap-width`나 밝은 심선으로 강조. 켜면 카메라를 급경사 밀집(중곡4동 용마산로) 쪽으로 옮기지 말고 대신 상단 칩 "급경사 추정 114구간 · 열선 없음 n"을 지도 위에 띄운다(지금 보는 곳 칩과 같은 자리).
- 켠 상태에서 열선 있는 급경사(heat=1)는 흐리게(0.35), 없는 것만 진하게. 툴팁 첫 줄에 "추정".
- 레이어 패널의 급경사 행에 "지형 추정" 대신 수치 "114구간 · 열선 없음 n".

**게이트 2**: 토글 전후 스크린샷에서 변화가 보임(픽셀 diff > 3%), 취약구간과 색이 다름.

## 3. 색 문법 (취약 층 vs 열선 구분)

지금 열선 #f0a04b(주황)와 취약·결빙 #e0705a(산호 벽돌)가 다크에서 같은 난색 계열이라 구분이 안 된다(사용자 지적). 결정(추천안, 확답 없이 진행):
- 열선 = **노랑빛 호박 #ffb703**(글로우 #ffd166, 흐름 심선 #fff4d6). 더 밝고 노란 쪽.
- 취약구간·결빙구간 = **진홍 #e5484d**(라이트 #b3261e), 선 바깥에 어두운 케이싱(line 2겹: 아래 #0b1216 폭+2, 위 진홍)으로 도로 위에서 뜨게.
- 급경사 추정 = 보라 점선(2절).
- 자재 청회·청빙·모래색, 학교 흰 원 유지. `lib/snow/labels.ts` RESOURCES·RISK가 정본, `applyTheme`·범례·레이어 패널·시연 캡션 스와치 전부 그 값을 읽는지 확인.
- 검증: 다크 배경 위 열선·취약 색 대비를 CIEDE2000 또는 hue 차 ≥ 40°로 `tests/snow-copy.test.ts`에 박는다(색 두 개의 hue를 계산해 단언).

## 4. 3D 핀 (dumping icons3d 이식. 지시서 2라운드 3-3에서 하기로 했으나 미이행)

dumping `components/dumping/icons3d.ts`(442줄, Three.js 커스텀 레이어, InstancedMesh, 화면 최소 높이, `transform.getMatrixForModel`, Lambert+emissive, 입체 숫자 `makeDigit`+`digit-font.json`)를 `components/snow/icons3d.ts`로 복사해 모델만 바꾼다:
- 제설함 = 각진 상자(뚜껑 경사) 청회 · 염화칼슘보관함 = 원통(뚜껑) 청빙 · 모래주머니 = 납작한 포대 2단(모래색) · 초등학교 = 작은 깃대+깃발(흰) · 열선 없는 취약구간 배지 = 구간 중점 위 **입체 숫자**(진홍) · 결빙구간 = 입체 "결빙 n" 대신 숫자만 · 동별 기둥 1~3위 입체 숫자(dumping 방식).
- 평면(tilt off)에서는 지금 원, 입체에서는 3D 모델(`FLAT_ONLY`/`TILT_ONLY` visibility 스위치, dumping 18라운드 규약). 툴팁은 같은 자리의 **투명 fill-extrusion**이 받는다(커스텀 레이어는 queryRenderedFeatures 불가. dumping `S.infraPosts` 방식).
- 테마 교체 시 커스텀 레이어는 복사 목록에서 빼고 style.load에서 재추가. `idle`마다 `refreshElevation`은 지형을 안 켜니 생략.
- 성능: 자재 383 + 학교 21 + 배지 ~30 InstancedMesh. 1440에서 60fps, 390에서 30fps 이상(Playwright `requestAnimationFrame` 카운트로 실측).

**게이트 4**: 입체 뷰 스크린샷에 원형 2D 점이 0개(학교·자재 전부 모델), 평면 뷰는 원 유지, 툴팁 동작.

## 5. 정보 밀도·슬롭 제거 (dumping 정책 탭 규격)

사용자 지적 "정보 표시가 정돈 하나도 안 돼 보임, dumping처럼 밀도 있게". dumping 정책 탭 규격 = 결론 머리기사(고운바탕) + 부제 한 줄 + 핵심 수치 4칸(헤어라인 구분, 상자 없음) + **행 목록**(번호·이름·값 열이 정렬된 표 형태, `ProposalRow`) + 접힌 02~04. 카드마다 둥근 테두리 상자를 두르지 않는다.
- 공백 탭: 3개 타일 상자 → 헤어라인 수치 띠 4칸(열선 없음 19/56 · 열선·자재 없음 7 · 열선 없는 동 4 · 초등학교 15/21). 구간 목록 → **표**(열: 번호 | 구간 | 유형 | 동 | 열선 거리 | 자재), 행 높이 30px, 헤어라인, 공백 행은 번호 색만 진홍. 발견 카드 6장 → 번호 행 목록(번호·숫자·문장 한 줄, 클릭 시 지도). 상자 0.
- 대응 단계 탭: 단계 5칸은 유지하되 상자 → 밑줄 탭 형태. 동원 자원 목록은 표(번호 | 자원 | 수량 | 출처).
- 자원 현황 탭: 4종 상자 → 표 4행. 동별 배치는 지금 막대 목록 유지(dumping 동일 규격).
- 근거 그래프 탭: 판단 7 상자 → 번호 행. 질문 아코디언 유지.
- 법령 탭: 조례 6항 표(조 | 항목 | 요지). 인용은 면 틴트 유지(세로선 금지).
- 데이터·방법 모달: 지금 표 형태 유지.
- 공통: 상자(`rounded-xl border`) 사용을 타일·모달 밖에서 0으로. `tests/snow-copy.test.ts`에 패널 파일의 `rounded-xl border border-[var(--cp-border)]` 개수 상한(탭당 2) 게이트.
- 슬롭 점검 목록(냉독이 잡을 것): 균일한 둥근 카드 그리드, 같은 길이 문장 3연속, 22px 큰 숫자 남발(한 화면 4개 이하), 이모지 0, 그라데이션 0, 세로 컬러바 0.

## 6. 데모용 모듈 이식 (dumping 시연 규격)

dumping 18라운드 시연: 장면마다 `cameraCue`(bounds·pitch·bearingDelta·duration, easeTo) › 도착 즈음 `riseColumns`(기둥 높이 배율 RAF) › `orbit`(4도/초, `isEasing` 중엔 setBearing 안 함, 만지면 `onOrbitStop`) · 초점 고리 `S.focusRing` RAF 맥동 · 캡션 카드(월별 띠 위). snow에 없는 것:
- **orbit**: 장면 1(공백)·장면 4(열선 없는 동)에서 자동 회전. 사용자가 지도를 만지면 멈춤.
- **riseColumns**: 자원 탭·장면 2에서 기둥이 솟아오르는 애니메이션(지금은 즉시 등장).
- **focusRing**: 구간 클릭·발견 카드 클릭 시 땅 위 맥동 고리(지금은 카메라만 이동).
- **장면 캡션 진행바 + 남은 시간**: 장면 3의 자동 격상(2.4s 간격)이 진행 중임을 보이는 얇은 진행선.
- **시연 중 왼쪽 카드 접기**(냉독 S2-10): 시연 켜면 카드를 최소화(제목만), 끝나면 복원.
- 3D 핀이 들어오면 장면 2에 자재 핀 점등(InstancedMesh scale 0→1 RAF).

**게이트 6**: 시연 5장면 각 2장(시작·도착) 스크린샷, RAF 누수 0(장면 전환 뒤 `cancelAnimationFrame` 확인), Esc로 복원.

## 7. 테마 저장 키

/snow는 다크 기본이어야 하는데 `dump-theme`에 light가 저장돼 있으면(사용자가 /dumping을 라이트로 쓴 경우) 라이트로 뜬다(사용자 스크린샷이 라이트). `snow-theme` 키를 따로: `app/snow/page.tsx` 초기 스크립트는 `snow-theme`을 읽고(없으면 dark), 대시보드에서 `data-theme` 변화를 MutationObserver로 감시해 `snow-theme`에 저장. dumping ThemeSwitch는 수정 0.

## 8. 배포·기록

- `npm run build` › `npm run lint` 0 › `npm test` › main 푸시 › 프로덕션 curl 3종 › `open`.
- `docs/snow-production-review-2026-09-20.md`에 3라운드 절 추가(또는 `-r3.md`), CLAUDE.md 8번 갱신(그래프 수치·색 정본·3D 아이콘 파일), 메모리 `project-gjdong-snow-ontology` 갱신, `docs/snow-data-survey.md` 4절 재생성.
- 냉독(shower) 재실행: 목표 75+.
