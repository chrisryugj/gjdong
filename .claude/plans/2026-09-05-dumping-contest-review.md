# /dumping 프로덕션 리뷰 + 경진대회 리팩토링 (2026-09-05)

## 실측으로 잡힌 결함
1. **"과태료도 1.1배" 오류** — map.json 실데이터는 1,578→1,059→555(연환산 0.53배). findings-data·ops-modal·methods-modal·graph 엣지 note 4곳이 거짓 진술. qa-chat 시드는 "줄었다"로 맞음 → 제품 내부 모순.
2. **배율 2.10/2.97/1.10은 2026년 1~8월 연환산** — UI 어디에도 기준 미고지. 동기간 대조는 2.01/2.87/1.05.
3. **DONG_THRESHOLDS SSOT 위반** — facts.ts {unm45,one55,yth35,frn10} vs findings-panel 하드코딩 {50,60,40,13}. 브리핑 권고와 패널 강조가 다른 기준.
4. ops-panel "8월까지" 하드코딩, ops-modal SLA 해설 연도 하드코딩.
5. 온톨로지 형식성 부재 — 스키마·도메인/레인지·역량질문 없음. `lowers` 엣지가 "효과 없음" 판정에도 lowers를 단언. kpi-dump-rate에 격자 β(과태료 건수)와 동 ρ(천명당) 혼재. 철회는 문자열 prop.
6. 결정 레이어 증거(ev-hotspot-backtest·ev-permits) 데이터셋 계보 없음, cls-cell 고아 노드.
7. 서울 열린데이터광장 데이터 0종 (서울시 경진대회 치명).

## 작업
- A 수치 정합: facts.channelGrowth → findings(빌더화)·ops-modal·methods·qa-chat·context 전부 파생 + errata 레이어
- B 온톨로지: schema.ts(클래스/관계 도메인·레인지·검증) + queries.ts(역량질문 7) + 온톨로지 탭 "묻기" 패널 + docs
- C 테스트 4종, CLAUDE.md, 리뷰 문서 docs/dumping-contest-review.md
