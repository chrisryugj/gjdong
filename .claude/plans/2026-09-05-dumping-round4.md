# /dumping 4라운드 계획 (2026-09-05 저녁)

인계 프롬프트: NEXT-SESSION-dumping-round4.md. 기준선 확인 완료(테스트 205·lint·tsc·verify.py 해시 110·수치 10, 프로덕션 200/401/404).

## 순서
1. K-apt 기본정보 API 결합 (비공개) — 86/86 수신 완료. build_kapt_layer.py에 API 세대수·동수·승강기·난방 병기, crossCheck에 불일치 단지 수·비율, 의무관리 분류(자발 등록 수). make_manifest → export → gjdong encrypt. 핀 갱신
2. 출품 공고 대조 — 공고 원문이 이 세션에 없음. 사용자에게 링크·파일 요청, 받기 전까지 7.5절은 그대로
3. 보안 — DUMPING_PASSWORD·DUMPING_COOKIE_SECRET 교체는 시연 일정 확인 필요(쿠키 전부 무효). 사용자 결정 항목으로 보고
4. 통계 — spreg 설치 가능하면 SAR·SEM(v3 변수) → audit_stats 항목 7·해설서 15c 한 줄. 200m apt_hh 원점 이동 4방향
5. 화면 — Playwright 3해상도, QA 7문항
6. 문서·메모리·커밋

## 함정 (이 세션 실측)
- rtk 훅이 `npm run lint`를 pnpm으로 리라이트 → node_modules/.ignored 40개·pnpm-workspace.yaml 생성. 복구=git checkout pnpm-lock.yaml, rm pnpm-workspace.yaml, `/opt/homebrew/bin/npm ci`. gjdong에서 npm은 항상 절대경로
- K-apt API는 지난밤 장애가 일시적. 응답 0.1초
