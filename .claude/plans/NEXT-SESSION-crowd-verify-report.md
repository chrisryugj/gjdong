# 다음 세션: 인파레이더 검증 + 보고서 출력모드 강화

> 이 파일을 통째로 읽고 시작. 직전 세션(2026-08-07)이 /crowd를 공공 프로젝트로 대개편했다
> (14커밋: 리팩토링 6 + 업무기능 5 + 문서 2 + 핫픽스 1, 프로덕션 배포·스모크 완료).
> 이번 세션의 목표는 두 개다: **① fresh-context 검증**으로 지난 세션 산출물의 구멍을 찾고,
> **② 보고서 출력모드를 간판 기능으로 격상**한다.

## 0. 지난 세션이 만든 것 (읽기 지도)

- 구조: `ADAPTERS` 레지스트리(lib/crowd/adapters.ts, 서버) + `CITY_CAPS`(lib/crowd/cities.ts,
  클라이언트) + 공통 헬퍼(lib/crowd/adapter-kit.ts). 대시보드 546줄 + 훅 9개(components/crowd/hooks/).
  i18n은 barrel(lib/crowd/i18n.ts)+형제 8파일 — **신규 UI 문자열은 i18n-ui-{ko,en,ja,zh} 4곳 모두**.
- 상황실 모드: components/crowd/ops/ 3파일. watchlist(lib/crowd/watchlist.ts, 12곳 상한),
  자치구 매핑(lib/crowd/districts.ts, 231곳 정적), CSV·상황보고(lib/crowd/export.ts, **한국어 고정**),
  붐빔 알림(lib/crowd/alerts.ts — 씨딩/재무장/쿨다운 15분), basis 병기(access/wait), 붐빔 리플.
- 문서: README /crowd 섹션, docs/crowd-methodology.md(등급 산출식), docs/crowd-adoption-guide.md,
  NOTICE 출처 10기관. 평가 답변 시트는 레포 밖 `~/workspace/gjdong-crowd-assessment.md`(비공개 유지).
- 테스트 69건(tests/crowd-*), CI=lint+test+build.

### 하드 제약 (어기면 실사고)
1. **제주 원천 보호**: 15분 캐시·ops 상세 팬아웃 금지(`CITY_CAPS.jeju.opsDetail=levelOnly`)·
   숨김탭 폴링 예외 없음. 2026-08 차단 사고의 재발 방지 — 어떤 신기능도 제주 호출량을 늘리면 안 됨.
2. **어댑터 상단 "데이터 계약 실측" 주석 유실 금지** — 유일한 원천 기술 문서.
3. **Vercel 프로젝트명 = `standard_address_translator`** (gjdong 아님 — `vercel link --project gjdong`은
   빈 프로젝트를 새로 만들어버린다). git push → 자동 배포, 리전 icn1 고정.
4. 이 맥은 npm 작업 중 pnpm이 끼어들어 pnpm-lock.yaml을 부풀린다 — **커밋 전
   `git checkout -- pnpm-lock.yaml`** (lockfile 채워지면 Vercel이 pnpm 빌드로 오인 위험).
5. dev 서버 떠 있는 채 `next build` 금지(dev .next 깨져 500). build 전 `pkill -f "next dev"`.
6. 산출물 한국어 고정 원칙: CSV·상황보고는 행정 문서 — UI 라벨만 4언어.

### 검증 하니스 (그대로 재사용)
- playwright: scratchpad에 `npm install playwright` 후
  `executablePath: ~/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
- 지난 스모크 스크립트 패턴: 딥링크→상호작용→localStorage/클립보드/다운로드 실측. 라우트 가로채기로
  붐빔 전환 재현 가능(`page.route("**/api/crowd?city=seoul", ...)`).
- dev HMR 때문에 `networkidle` 대기 금지 — `waitForFunction`으로.

## 1. Phase 검증 — fresh-context로 지난 세션 때리기

verify-work 서브에이전트(또는 /verify)로 편향 없이. 지난 세션이 **안 본 것** 위주로:

- [ ] 전체 게이트 재실행: `npm run lint && npm test && npm run build` + 프로덕션 5개 도시 API
- [ ] **모바일 실치수(390px) 전 화면 순회**: 상황실 툴바 wrap 상태, 드롭다운(핫픽스 직후라 재확인),
      카드 그리드 2열, 지도 분할 핸들과 ops 모드 상호작용, 다크모드 ops 대비
- [ ] **히스토리 매트릭스 미검증 조합**: ops→상세→뒤로→ops→뒤로→시민 풀체인, `?spot=`+`?mode=ops`
      동시 진입, 언어 전환을 ops 안에서 했을 때, 도시 전환 직후 뒤로가기
- [ ] 알림 실환경: 권한 denied 상태 UX, 알림 켠 채 숨김탭 15분 방치(백그라운드 폴링 실동작),
      iOS Safari 폴백(webkit 엔진으로)
- [ ] 번들: build 출력에서 ops 청크가 시민 first-load JS에 미포함인지 실측 (주장만 했고 숫자 확인 안 함)
- [ ] i18n 스윕: en/ja/zh로 ops 전 요소 순회 — 한글 잔존 스크린샷 대조
- [ ] 상황보고 문안을 실제 Excel/한글(HWP)에 붙여넣어 서식 확인
- 발견 결함은 fix 커밋 단위로 즉시 수리 (게이트 통과 후 다음 항목)

## 2. Phase 보고서 출력모드 격상 — "기막히게"

현재: CSV(전 지점 스냅샷)+텍스트 문안 복사. 이걸 **행사 안전 업무의 간판 산출물**로 만든다.
아래는 후보 — 착수 전 유저에게 우선순위 1문항만 확인(AskUserQuestion), 과설계 금지.

### 후보 A. 인쇄용 상황보고서 페이지 (본명: 보고서 출력모드)
- `/crowd/report?city=&spots=&at=` 전용 라우트 — A4 인쇄 최적화(공문서 스타일: 표제·일시·작성
  기준·등급 분포 표·지점별 표·특이사항·출처 각주). `window.print()` → PDF 저장이 곧 결재 첨부물.
- 데이터는 기존 /api/crowd + extra 재사용(신규 서버 0). 등급 색은 인쇄 대비 흑백 안전 패턴 병용.
- 덱 인쇄 함정 참고: 애니메이션 요소는 @media print에서 opacity 강제(리플·마퀴 제외 처리).
- 에디토리얼 미니멀(유저 취향: hairline 보더·숫자 인덱스·그라데이션 금지).

### 후보 B. 행사 타임라인 로그 (상황실 세션 기록)
- 상황실 켜져 있는 동안 폴링 스냅샷을 localStorage에 누적(감시 지점만, 시각+등급+인원) →
  "행사 로그 내보내기" = 시간축 표 CSV + 보고서에 등급 추이 스파크라인.
- 이게 되면 "행사 끝나고 결과보고" 니즈(과거 되짚기 불가 한계)를 로컬에서 해소.
- 용량 상한·도시 전환 시 정책을 명확히 (localStorage 5MB 고려, 지점 12×5분×12h ≈ 소량이라 여유).

### 후보 C. XLSX 서식 내보내기
- 이미 xlsx 라이브러리 있음(주소변환이 사용). CSV → 서식 있는 XLSX(열너비·등급 셀 배경색·머리행
  고정). 단 xlsx 번들이 ops 청크에 실리므로 dynamic import 필수.

### 후보 D. 공유용 요약 카드 이미지
- 카드 그리드 요약을 canvas로 렌더 → PNG 저장(단톡 공유용). 우선순위 낮음 — A·B가 먼저.

권장 순서: **A → B → C** (A가 "기막히게"의 체감 최대, B가 한계 해소, C는 마무리 당의).
각 단계: 순수 함수는 tests/crowd-*에 테스트 추가, playwright로 인쇄 CSS는 `page.pdf()` 실측,
i18n 4언어(라벨만), 커밋 단위 게이트, 완료 후 push(자동 배포)+프로덕션 스모크.

## 3. 마무리 체크
- README·methodology에 신기능 반영 (화면과 문서 어긋나면 기관 인용 불가 원칙)
- ~/workspace/gjdong-crowd-assessment.md의 ③(실물 시연 시나리오)에 보고서 출력 단계 추가
- 메모리 project-gjdong-crowd 갱신
