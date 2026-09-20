"use client"

import { useState } from "react"
import type { OntoGraph, SnowMapData } from "@/lib/snow/types"
import { CLASSES, RELATIONS, validateGraph } from "@/lib/snow/schema"
import { relLabel, typeLabel } from "@/lib/snow/labels"
import { fmt } from "@/lib/snow/facts"
import { COST } from "@/lib/snow/costs"
import ModalShell from "@/components/dumping/modal-shell"

// 데이터·방법 모달. 심사·검증용 한 곳: 쓰인 데이터(기준일·행 수·이용허락) › 못 구한 데이터(정보공개청구 대상) › 가공(도로 스냅·거리 기준·경사 추정·지오코딩) › 그래프 규약 › 한계
// 화면 카드에 흩어져 있던 한계 고지를 전부 여기로 옮겼다

interface Props {
  data: SnowMapData
  graph: OntoGraph | null
  onClose: () => void
  initial?: SectionId
}
type SectionId = "data" | "missing" | "method" | "graph" | "limits"
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "data", label: "쓰인 데이터" },
  { id: "missing", label: "못 구한 데이터" },
  { id: "method", label: "가공 방법" },
  { id: "graph", label: "그래프 규약" },
  { id: "limits", label: "한계" },
]

// 이용허락은 공공데이터포털 페이지 실측(2026-09-20). 서울 열린데이터광장·기상청은 공공저작물 출처표시
const LICENSE: Record<string, string> = {
  heat: "출처표시(서울 열린데이터광장)",
  heatGu: "제한 없음",
  salt: "제한 없음",
  cacl: "제한 없음",
  sand: "제한 없음",
  seoul: "출처표시(서울 열린데이터광장)",
  weak: "자유이용(제0유형)",
  ice: "제한 없음",
  schools: "나이스 개방 API",
  freeze: "출처표시(제1유형)",
  accidents: "제한 없음",
  roads: "ODbL(OSM) · Protomaps",
  dem: "Mapzen · AWS 공개 타일",
}
const ROWS: Record<string, (d: SnowMapData) => string> = {
  heat: (d) => `${d.heat.length}행`,
  heatGu: (d) => `${d.meta.heatJoin.guRows}행`,
  salt: (d) => `${d.salt.length}행`,
  cacl: (d) => `${d.cacl.length}행`,
  sand: (d) => `${d.sand.length}행`,
  seoul: (d) => `${fmt(d.seoul.reduce((s, g) => s + g.n, 0))}행(25개 구)`,
  weak: (d) => `${d.weak.length}행(전국 2,775)`,
  ice: (d) => `${d.ice.length}행(전국 3,358)`,
  schools: (d) => `${d.schools.length}교`,
  freeze: (d) => `${d.climate.freezeDays.length}년`,
  accidents: (d) => (d.accidents ? `${d.accidents.years.length}개 연도` : "미수신"),
  roads: () => "벡터타일 z15 72장",
  dem: () => "지형타일 z14",
}

export default function MethodsModal({ data, graph, onClose, initial = "data" }: Props) {
  const [sec, setSec] = useState<SectionId>(initial)
  const issues = graph ? validateGraph(graph) : []
  const keys = Object.keys(data.source) as (keyof typeof data.source)[]
  const snap = data.meta.snap
  const sl = data.meta.slope
  return (
    <ModalShell onClose={onClose} title="데이터·방법" sub={`빌드 ${data.meta.built} · 자원 4종 기준일 ${data.asof.sand}부터 ${data.asof.cacl}까지`} size="xl" zIndex={2400}>
      <div className="mb-3 flex flex-wrap gap-1">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => setSec(s.id)} aria-pressed={sec === s.id} className={`rounded-full border px-3 py-1 text-[13px] ${sec === s.id ? "border-(--dump-accent) bg-(--dump-accent)/10 font-semibold text-(--dump-accent)" : "border-[var(--cp-border)] text-[var(--cp-text-muted)]"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {sec === "data" && (
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-[12px] text-[var(--cp-text-dim)]">
              <th className="py-1 pr-2 font-medium">기준일</th>
              <th className="py-1 pr-2 font-medium">데이터</th>
              <th className="py-1 pr-2 font-medium">행</th>
              <th className="py-1 font-medium">이용허락</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-t border-[var(--cp-border-faint)] align-top">
                <td className="whitespace-nowrap py-1.5 pr-2 font-mono text-[12.5px] text-[var(--cp-text-dim)]">{data.asof[k]}</td>
                <td className="py-1.5 pr-2 text-[var(--cp-text)]">{data.source[k]}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 font-mono text-[12.5px] text-[var(--cp-text-muted)]">{ROWS[k]?.(data) ?? ""}</td>
                <td className="py-1.5 text-[12.5px] text-[var(--cp-text-dim)]">{LICENSE[k] ?? ""}</td>
              </tr>
            ))}
            <tr className="border-t border-[var(--cp-border-faint)] align-top">
              <td className="py-1.5 pr-2 font-mono text-[12.5px] text-[var(--cp-text-dim)]">2026-02-12</td>
              <td className="py-1.5 pr-2 text-[var(--cp-text)]">{data.ops.source}</td>
              <td className="py-1.5 pr-2 font-mono text-[12.5px] text-[var(--cp-text-muted)]">2건</td>
              <td className="py-1.5 text-[12.5px] text-[var(--cp-text-dim)]">보도 인용</td>
            </tr>
            <tr className="border-t border-[var(--cp-border-faint)] align-top">
              <td className="py-1.5 pr-2 font-mono text-[12.5px] text-[var(--cp-text-dim)]">2024-02-20</td>
              <td className="py-1.5 pr-2 text-[var(--cp-text)]">
                개략 단가 · 도로열선 <a href={COST.heatSourceUrl} target="_blank" rel="noreferrer" className="text-(--dump-accent) underline-offset-2 hover:underline">{COST.heatSource}</a>
              </td>
              <td className="py-1.5 pr-2 font-mono text-[12.5px] text-[var(--cp-text-muted)]">1건</td>
              <td className="py-1.5 text-[12.5px] text-[var(--cp-text-dim)]">보도 인용 · 조달 단가 아님</td>
            </tr>
            <tr className="border-t border-[var(--cp-border-faint)] align-top">
              <td className="py-1.5 pr-2 font-mono text-[12.5px] text-[var(--cp-text-dim)]">2026-09-21</td>
              <td className="py-1.5 pr-2 text-[var(--cp-text)]">
                개략 단가 · 제설함 <a href={COST.saltBoxSourceUrl} target="_blank" rel="noreferrer" className="text-(--dump-accent) underline-offset-2 hover:underline">{COST.saltBoxSource}</a>
              </td>
              <td className="py-1.5 pr-2 font-mono text-[12.5px] text-[var(--cp-text-muted)]">1건</td>
              <td className="py-1.5 text-[12.5px] text-[var(--cp-text-dim)]">소매가 조회 · 조달 단가 아님</td>
            </tr>
          </tbody>
        </table>
      )}

      {sec === "missing" && (
        <div className="space-y-3 text-[14px] leading-relaxed text-[var(--cp-text)]">
          <p className="text-[13.5px] text-[var(--cp-text-muted)]">공개 데이터에서 찾지 못한 것입니다. 있으면 화면의 판단이 바뀌는 순서로 적었습니다.</p>
          <ul className="space-y-2">
            <Missing t="동주민센터별 제설 담당 구역(구간표·구역도)" w="지금은 행정동 경계를 담당 구역으로 대용합니다(그래프 담당 구역 노드의 구역 정본 속성에 표시). 실제 운영 단위가 오면 커버리지 단위를 교체합니다" how="광진구 제설대책 추진계획 첨부 · 정보공개청구" />
            <Missing t="제설취약지점 89개소 목록(보도자료 수치)" w="행안부 적설취약구간 47곳으로 대신합니다. 구 내부 목록과 다를 수 있습니다" how="도로과 · 정보공개청구" />
            <Missing t="자동원격액상살포기 52대 위치" w="살포기는 수치만 있고 지도에 없습니다" how="도로과 · 정보공개청구" />
            <Missing t="조례 시한 준수·제설 민원 건수" w="결과 지표를 측정할 수 없어 대책 평가가 투입 지표까지만 가능합니다" how="정보공개청구(민원은 120 다산콜·구 민원 통계)" />
            <Missing t="열선 가동 이력(온도·시각)" w="상시 설비의 실제 가동 여부를 확인할 수 없습니다" how="도로과" />
            <Missing t="열선·자재 조달 단가(계약 단가표·실시설계)" w="개략 비용은 언론 보도 단가(서울시 관계자, 열선 1차로 100m당 1억)와 제설함 소매가로 산정했습니다. 취약구간 차로수도 파일에 없어 1~2차로 범위로 보입니다. 조달 단가가 오면 교체합니다" how="도로과 · 계약 단가표 · 정보공개청구" />
            <Missing t="초등학교 통학로 제설 소관" w="점검 후보의 학교 항목은 담당 부서를 내부 확인으로 비웠습니다" how="교육지원청 · 학교 행정실" />
          </ul>
          <p className="text-[13px] text-[var(--cp-text-dim)]">확인한 것: 도로교통공단 결빙 교통사고 다발지역(반경 200m 3건 이상)은 {data.accidents ? `${data.accidents.years[0].year}년부터 ${data.accidents.years[data.accidents.years.length - 1].year}년까지 광진구 0곳` : "미수신"}입니다. 한국도로공사 결빙취약구간은 고속도로만이라 광진구 해당 없음, 서울시 제설제 사용량은 구별 값이 없습니다.</p>
        </div>
      )}

      {sec === "method" && (
        <div className="space-y-4 text-[14px] leading-relaxed text-[var(--cp-text)]">
          <Block t="열선 정본과 조인">
            서울시 자치구별 도로열선(2026-05-31) 광진 {data.heat.length}행을 정본으로 씁니다. 구 공개 파일(2025-01-31) {data.meta.heatJoin.guRows}행과 시점·종점 지번으로 조인해 {data.meta.heatJoin.guMatched}행에 노선명·차로수를 보충했습니다. 구 파일에서 조인되지 않은 행은 {data.meta.heatJoin.guUnmatched.join("·") || "없음"}번(서울 파일이 같은 위치 두 행을 한 행으로 합친 것)입니다.
          </Block>
          <Block t="도로 선형(스냅)">
            {snap.rule}. 열선 {data.heat.length}구간 결과: 노선명 도로 {snap.heat.named ?? 0} · 다른 도로 {snap.heat.network ?? 0} · 한 점 연장 {snap.heat.point ?? 0} · 직선 {snap.heat.straight ?? 0}. 근사(approx) 표기 {snap.heatApprox}구간. 물리 길이는 1차로 기준 연장을 차로수로 나눈 값입니다(2차로 278m 구간의 도로 경로 163m 실측). 도로망은 타일 경계에서 끊긴 조각을 같은 이름·종류의 끝점끼리 45m 안이면 이어 붙였습니다(봉합 전에는 한강 남쪽 도로가 섬이 되어 결빙구간이 강을 가로지르는 직선으로 그려졌습니다). 직선으로 둔 열선은 지도에 없는 보행로(동의초 통학로 보도열선 등)입니다. 취약구간 중 좌표가 한 점뿐이고 노선명 도로에 붙지 않는 행은 가장 가까운 도로에 60m만 표시합니다(능동로 120). 모든 선형은 물 위·구 밖·우회 검사를 통과합니다(scripts/snow-verify.mjs).
          </Block>
          <Block t="공백 판정 거리">
            취약구간(행안부 적설취약구간 {data.weak.length}·상습결빙구간 {data.ice.length})마다 도로 스냅 선형 사이 최근접 거리를 잽니다. {data.gaps.heatNearM}m 안에 열선이 있으면 열선 있음, {data.gaps.materialNearM}m 안에 제설함·염화칼슘함·모래주머니가 있으면 자재 있음, 둘 다 없으면 공백입니다. 초등학교는 {data.gaps.schoolNearM}m입니다. 거리 기준은 이 화면의 가정이고 구 지침이 아닙니다.
          </Block>
          <Block t="급경사 추정">
            {sl.rule}. 결과 {sl.count}구간 {sl.km}km. 후보 {sl.count + sl.dropped}구간 중 {sl.dropped}구간을 고가·제방 인접 오탐으로 제외했습니다. 행안부 취약구간 {data.weak.length}곳 중 {sl.weakOnSlope}곳이 추정 구간 40m 안에 있습니다. 짧은 취약구간(20~50m)은 100m 창에 잡히지 않습니다.
          </Block>
          <Block t="상습결빙구간 좌표">
            행안부 파일의 기점·종점 두 점만 씁니다. 총길이(km)와 방위각은 두 점과 맞지 않고(1.4km인데 두 점 거리 307m, 방위각이 정반대인 행) 도로명도 지도와 다릅니다(동부간선도로 좌표가 강변북로 램프 위). 자동차전용도로 램프 위 좌표는 간선 체인을 두 점 사이에서 잘라 그리고({snap.ice.trunk ?? 0}곳), 그래도 선형을 확정할 수 없는 {snap.ice.points ?? 0}곳(동부간선도로)은 선을 그리지 않고 기점·종점만 빈 원으로 표시합니다.
          </Block>
          <Block t="지오코딩과 동 기준점">
            {data.meta.geocode.rule}. 열선 기점·종점 지오코딩 실패 {data.meta.geocode.heatGeoFail}건, 모래주머니 동주민센터 대체 {data.meta.geocode.sandApprox}지점, 제설함 구 경계선 위 동 미판정 {data.meta.saltNoDong}개소. 동별 기둥·라벨은 동주민센터 위치입니다.
          </Block>
          <Block t="우선순위와 예산 역산">
            열선 없는 취약구간의 순서는 점수입니다: {data.gaps.materialNearM}m 안 자재도 없음 3점, 지형 추정 최대 경사(%)의 10분의 1, {data.gaps.schoolNearM}m 안 초등학교 1교당 1.5점, 행안부 유형 급경사 1점·고갯길 0.5점, 구 소관 0.5점. 가중치는 이 화면의 가정이고 근거 항목은 표 둘째 줄에 그대로 적습니다. 열선 예산 역산은 구 관리 열선 없는 구간을 이 순서로 신설한다고 보고 구간 물리 길이 × 2차로 × 1차로 100m당 1억원으로 셉니다.
          </Block>
          <Block t="단계 판정">
            기상청 단기예보(광진구 격자 nx 62·ny 126)의 24시간 신적설 합과 기상특보 현황(서울 109)의 대설주의보·경보로 서울시 기준 단계를 정합니다. 둘 중 높은 단계입니다. 대책기간(11월 15일부터 3월 15일까지) 밖에서는 슬라이더 시나리오가 기본입니다.
          </Block>
        </div>
      )}

      {sec === "graph" && graph && (
        <div className="space-y-3 text-[14px] leading-relaxed text-[var(--cp-text)]">
          <p className="text-[13.5px] text-[var(--cp-text-muted)]">
            노드 {graph.nodes.length} · 관계 {graph.edges.length} · 종류 {CLASSES.length} · 관계 종류 {RELATIONS.length} · 자동 검사 오류 {issues.filter((i) => i.level === "error").length} · 주의 {issues.filter((i) => i.level === "warn").length}. 검사 항목: 종류 없음 · 영역 불일치 · 관계 없음 · 출발·도착 종류 위반 · 없는 노드 참조 · 뒷받침 없는 판단 · 고아 노드 · 출처 누락 · 상태 없는 낮추려 함.
          </p>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-[var(--cp-text-dim)]"><th className="py-1 pr-2 font-medium">종류</th><th className="py-1 pr-2 font-medium">수</th><th className="py-1 font-medium">뜻</th></tr>
            </thead>
            <tbody>
              {CLASSES.map((c) => (
                <tr key={c.type} className="border-t border-[var(--cp-border-faint)] align-top">
                  <td className="whitespace-nowrap py-1 pr-2 font-semibold text-[var(--cp-text-strong)]">{typeLabel(c.type)}</td>
                  <td className="py-1 pr-2 font-mono text-[12.5px] text-[var(--cp-text-muted)]">{graph.nodes.filter((n) => n.type === c.type).length}</td>
                  <td className="py-1 text-[var(--cp-text-muted)]">{c.def}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary className="cursor-pointer text-[13.5px] text-[var(--cp-text-muted)]">관계 {RELATIONS.length}종</summary>
            <ul className="mt-1.5 space-y-1 text-[13px]">
              {RELATIONS.map((r) => (
                <li key={r.rel} className="text-[var(--cp-text-dim)]">
                  <b className="text-[var(--cp-text)]">{relLabel(r.rel)}</b> · {r.domain.map(typeLabel).join("·")} › {r.range.map(typeLabel).join("·")} · {r.def}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {sec === "limits" && (
        <ul className="space-y-2 text-[14px] leading-relaxed text-[var(--cp-text)]">
          <li>자원 위치는 공공데이터 4종이고 기준일이 {data.asof.sand.slice(0, 7)}(모래주머니)부터 {data.asof.cacl.slice(0, 7)}(염화칼슘보관함)까지 다릅니다. 한 지도에 올리지만 같은 시점이 아닙니다.</li>
          <li>열선 선형은 OSM 도로망에 붙인 근사입니다. 노선명과 다른 도로로 이어졌거나 한 점에서 연장만큼 그린 구간은 툴팁에 그렇게 적혀 있습니다.</li>
          <li>급경사는 지형 타일(약 7.6m 격자) 고도로 계산한 추정치이고 실측 경사가 아닙니다. 고가 옆 도로는 제외했지만 오탐이 남아 있을 수 있습니다.</li>
          <li>공백 판정의 거리 기준({data.gaps.heatNearM}m·{data.gaps.materialNearM}m)은 이 화면의 가정입니다. 구 지침의 기준이 있으면 그 값으로 바꿉니다.</li>
          <li>담당 구역은 행정동 경계를 대용합니다. 동주민센터 담당 구간표가 오면 커버리지 단위를 교체합니다.</li>
          <li>인력·장비·살포기 수치는 보도자료이고 위치가 없습니다. 조례 시한 준수와 민원은 측정 자료가 없습니다.</li>
          <li>조례 제5조의 주간·야간 시각은 조례에 없어 07시부터 19시까지를 주간으로 가정합니다.</li>
        </ul>
      )}
    </ModalShell>
  )
}

function Block({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="dump-kicker mb-0.5 text-[10px] text-[var(--cp-text-dim)]">{t}</div>
      <p>{children}</p>
    </div>
  )
}
function Missing({ t, w, how }: { t: string; w: string; how: string }) {
  return (
    <li className="rounded-xl border border-[var(--cp-border)] px-3 py-2">
      <div className="text-[14.5px] font-semibold text-[var(--cp-text-strong)]">{t}</div>
      <div className="mt-0.5 text-[13.5px] text-[var(--cp-text-muted)]">{w}</div>
      <div className="mt-0.5 text-[12.5px] text-[var(--cp-text-dim)]">확보 방법: {how}</div>
    </li>
  )
}
