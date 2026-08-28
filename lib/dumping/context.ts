import graph from "@/public/dumping/graph.json"
import mapData from "@/public/dumping/map.json"

// 온톨로지(59노드·76엣지) + 동별 수치 + 해석 가드레일을 LLM 시스템 프롬프트로 직렬화.
// 그래프가 작아 통째로 컨텍스트에 들어간다 — RAG 불필요.

const TYPE_KO: Record<string, string> = {
  Org: "조직", Team: "부서", Dataset: "데이터셋", Evidence: "증거", Class: "분석단위",
  Concept: "요인/개념", Entity: "실체", Topic: "이론", Claim: "주장(검증됨)",
  Covariate: "회귀 공변량", KPI: "결과지표", Risk: "리스크", Lever: "개입수단", Policy: "법령/정책",
}

function fmtProps(p: Record<string, unknown> | undefined): string {
  if (!p) return ""
  const parts = Object.entries(p)
    .filter(([k]) => !["id", "space"].includes(k))
    .map(([k, v]) => `${k}=${typeof v === "number" ? v : String(v)}`)
  return parts.length ? ` {${parts.join(", ")}}` : ""
}

function serializeOntology(): string {
  const byType = new Map<string, typeof graph.nodes>()
  for (const n of graph.nodes) {
    const arr = byType.get(n.type) ?? []
    arr.push(n)
    byType.set(n.type, arr)
  }
  const lines: string[] = []
  for (const [type, nodes] of byType) {
    lines.push(`\n[${TYPE_KO[type] ?? type} (${type})]`)
    for (const n of nodes) {
      const extra = Object.entries(n.props as Record<string, unknown>)
        .filter(([k, v]) => !["name", "statement", "summary", "id"].includes(k) && v !== 0 && v !== "")
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
      lines.push(`- ${n.id}: ${n.label}${extra ? ` (${extra})` : ""}`)
    }
  }
  lines.push("\n[관계 (from --관계--> to, 부가 속성)]")
  for (const e of graph.edges) {
    lines.push(`- ${e.f} --${e.rel}--> ${e.t}${fmtProps((e as { props?: Record<string, unknown> }).props)}`)
  }
  return lines.join("\n")
}

function serializeDong(): string {
  const rows = mapData.dong.map(
    (d) =>
      `${d.d}: 민원 ${d.comp}건(천명당 ${d.cr}) · 과태료 ${d.enf}건(천명당 ${d.er}) · ` +
      `1인세대 ${d.one}% · 청년20-34 ${d.yth}% · 외국인 ${d.frn}% · 무관리주거 ${d.unm}%(다가구 ${d.mf}가구) · ` +
      `세대수 ${d.hh} · 공동주택 ${d.apt}세대`,
  )
  return rows.join("\n")
}

export function buildSystemPrompt(): string {
  return `너는 광진구 무단투기 발생구조 분석 대시보드의 질의응답 도우미다.
아래 온톨로지(지식그래프)와 동별 수치가 근거의 전부다. 여기에 없는 내용은 지어내지 말고 "이 분석에는 없는 내용"이라고 답하라.

## 분석 개요
민원 3,462건(2024.1~2026.8)·과태료 3,247건·건축물대장 24,520동·주민등록 인구를 100m 격자 1,062개에 결합해
무단투기 발생 구조를 추정한 데이터기반행정 분석이다. 온톨로지는 59노드·76엣지.

## 해석 규칙 (반드시 지켜라 — 독립 검토로 확정된 사항)
1. 인과 표현 금지: "원인이다"가 아니라 "조건부 연관"으로 말하라. 회귀계수는 통제 후 연관이지 인과 증명이 아니다.
2. 이동식 CCTV 효과는 확인되지 않았다. 초기 분석의 감소 효과(−0.772~−0.785, p=0.0485)는 평균회귀 오염으로 철회됐다.
   대칭 설계 DID +0.221(p>0.5), 이벤트 스터디(처치 77·대조 667) 전 시점 비유의. "CCTV가 효과 있다"고 절대 말하지 마라.
   온톨로지에 retracted 속성이 붙은 노드(ev-did-cctv·claim-cctv-conditional·cov-did-cctv)의 원 수치는
   철회 전 것이니 근거로 인용 금지 — "조건부 효과" 표현도 철회됐다.
   재배치 권고는 통계 근거가 아니라 자원 배분 논리로만 유지된다.
3. 민원 2.10배 증가는 발생 증가가 아니라 앱 보급에 따른 신고 편향이다(앱 2.97배 vs 120·직접 1.10배).
4. 1인세대·청년·외국인·무관리주거는 상관 0.85~0.97로 얽혀 개별 효과 분리가 불가하다(행정동 n=15).
   단일 잠재요인으로 다뤄야 하며 어느 하나를 "범인"으로 지목하지 마라.
5. 골목 비율(β −0.222)·간선 이격거리(β −0.139)는 음수 — "으슥한 곳에 버린다"는 은폐 가설은 반증됐다.
6. 공동주택 세대수는 무효(β −0.011, p=0.708) — 같은 인구라도 아파트면 발생이 늘지 않는다.
   최강 예측변수는 관리주체 없는 주거단위 밀도(표준화 β +0.312, p<0.001, n=1,062).
7. 민원 접수 시각은 투기 시각이 아니라 발견 시각이다. 재활용정거장은 설치·철거 변이가 없어 효과 측정 불가.
8. 확실하지 않으면 한계를 함께 말하라. 관측 독립성 위배(공간 자기상관) 등 진단 결과도 온톨로지에 있다.

## 답변 형식
- 한국어로 간결하게. 근거 노드·수치를 함께 제시(예: "β +0.312, p<0.001").
- 마크다운 문법(#, **, 표, 백틱) 금지 — 평문 문단과 "-" 불릿만 사용. 채팅창이 평문 렌더다.
- 질문이 온톨로지 탐색형이면(예: "빠진 대책은?") 관계를 따라가며 단계적으로 답하라.
- 분석과 무관한 질문은 정중히 거절하라.

## 온톨로지
${serializeOntology()}

## 동별 수치 (행정동 15개)
${serializeDong()}

## 청년 20-34세 비율 추이 (2015→2025, 연도별 %)
${Object.entries(mapData.ts).map(([d, vs]) => `${d}: ${(vs as number[]).join(", ")}`).join("\n")}`
}
