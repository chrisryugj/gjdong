# 클린광진 9라운드 (2026-09-13) · 출품 재검토 반영

검토서 `docs/dumping-submission-review-2026-09-13.md`(A1~A10·J1~J5)와 독립 대조에서 나온 결함을 정본(비공개 gwangjin-dumping)부터 고쳐 재산출하고 화면에 반영한다. 커밋은 사용자 확인 후.

## 확정 사실 (2026-09-13 실측)

- 지오코딩 폴백: 카카오가 법정동을 못 정한 결과는 전부 한 점(37.5384, 127.0845 = 구 중심)에 놓인다. 캐시에서 `legalDong` null 인 항목은 그 점뿐. 민원 67건·과태료 123건·대장 783동·시설 일부가 격자 963200_1948800(구의1동)에 쌓여 핫스팟 1위·집중관리 1위·회귀 최대 셀(enf 129, unmanaged 1,334)이 됐다.
- 품목: 과태료 전건 `target`+`cid` 보유 → 격자×품목 집계만 만들면 생활쓰레기/차량꽁초 분리 회귀 가능.
- 앱 민원 2026-03 계단(42→146), 제목 서식 동일, 격자 161→440곳 확산. 서울 전체 청소 신고는 같은 달 +22%.
- 신고 유래 과태료 2,711건 중 같은 격자 ±3일 민원 있는 건 235(8.7%).
- viz.json·cell_complaints.json·cell_infra.json 은 생성 스크립트가 없는 고아 파생물. 규칙은 역산으로 확정(격자 = comp|enf|unm>0, 청년비율 = 20~34세/합계).

## 작업 순서

### A. 비공개 저장소
1. `geocode_complaints.py`·`geocode_extra.py`: `legalDong` 없는 결과 = 구 중심 폴백 → 격자 미부여(민원 행은 유지, cid null). `geocode_quality.json` 기록.
2. `build_ledger_layer.py`·`build_kapt_layer.py`: 같은 규칙.
3. 신규 `build_cell_layers.py`: cell_complaints·cell_infra(품목 열 추가)·viz.json 재생성. 먼저 현행 입력으로 돌려 기존 파일과 일치 확인.
4. `waste_category.py` 공용 모듈(품목 규칙 한 곳).
5. `regression_v2.py` itemSplit(생활쓰레기/차량꽁초, v4b 스펙). 낡은 주석 제거.
6. `build_decision_layer.py`: 핫스팟 기준모형 3종 백테스트, 민원↔과태료 연결률.
7. `export_dashboard.py`: 기본 Covariate 계수를 base100으로 덮어쓰기, itemSplit·geocode 품질·기준모형 근거 노드.
8. 재실행 순서: geocode 2종 → ledger → kapt → cell_layers → diagnostics → regression_v2 → audit_stats → known_truth_sim → did 3종 → build_report → decision_layer → export → make_manifest → verify.
9. README 수치·재현 순서·viz 고지 갱신.

### B. gjdong
1. `dumping:encrypt` → 테스트·lint·tsc·build.
2. 카피: 첫 화면 단정 3곳, "원인 쪽", "대부분 앱 보급 효과", 카피 게이트 금지 문구.
3. facts: appStep·complaintLink·geocode 품질·itemSplit 파생. 카드: 착시 해명 보강, 품목 분리, 정정(폴백 제거), 처리 지연.
4. 방법 모달: 지오코딩 품질표, 배치추천 외부 산출물 표기, 기준모형 비교, 재현 문단.
5. 운영 탭 백테스트 표에 기준모형.
6. 문서: contest-review 12절, 해설서 1·2·4·15c, CLAUDE.md, NEEDED_DATA(안전신문고·2026-03 이벤트).

## 완료 기준
- verify.py 해시·수치 통과, gjdong 테스트·lint·tsc·build 통과.
- 핫스팟·상습격자 1위가 폴백 격자가 아님. 회귀 표에 폴백 제외 전후 β 병기.
- 상충 문장 0(카피 게이트).
