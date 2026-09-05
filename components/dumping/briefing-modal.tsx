"use client"

import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { DONG_THRESHOLDS, regressionBetas, summarize } from "@/lib/dumping/facts"
import ModalShell from "./modal-shell"

// 동별 브리핑 — 동장 회의·현장 배포용 원페이저. 인쇄 버튼은 이 모달만 출력한다(globals.css @media print, #dump-brief).

interface BriefingModalProps {
  dong: string | null
  data: DumpingMapData | null
  graph: OntoGraph | null
  onClose: () => void
}

export default function BriefingModal({ dong, data, graph, onClose }: BriefingModalProps) {
  if (!dong || !data) return null
  const row = data.dong.find((d) => d.d === dong)
  if (!row) return null
  const { period } = summarize(data)
  const rankAll = [...data.dong].sort((a, b) => b.er - a.er)
  const rank = rankAll.findIndex((d) => d.d === dong) + 1
  const hotspots = data.decision.hotspots.top.filter((h) => h[5] === dong)
  const candidates = data.cctvCandidates.filter((c) => c[4] === dong)
  // 최강 예측변수 β — 그래프에서 읽고, 없으면 README 정본 수치
  const unmBeta = graph ? regressionBetas(graph).find((b) => b.id === "cov-unmanaged")?.beta : undefined
  const betaText = unmBeta != null ? `${unmBeta > 0 ? "+" : "−"}${Math.abs(unmBeta).toFixed(3)}` : "+0.312"

  // 규칙 기반 권고 — 온톨로지 레버와 동 특성 매칭 (수치 근거를 함께 표기). 문턱은 지도 동 패널과 같은 값.
  const T = DONG_THRESHOLDS
  const recs: { t: string; why: string }[] = []
  if (row.unm >= T.unm)
    recs.push({
      t: "다가구·단독 밀집 구역 공동 배출시설·관리주체 지정 검토",
      why: `무관리주거 ${row.unm}% (최강 예측변수 β ${betaText})`,
    })
  if (row.frn >= T.frn) recs.push({ t: "다국어 배출안내 우선 적용", why: `등록외국인 ${row.frn}%` })
  if (row.one >= T.one) recs.push({ t: "전입·임대차 시점 배출안내(무예산)", why: `1인세대 ${row.one}%` })
  if (row.yth >= T.yth) recs.push({ t: "대학 연계 배출안내 캠페인", why: `청년 20-34 ${row.yth}%` })
  if (candidates.length > 0)
    recs.push({
      t: `이동식 CCTV 재배치 후보 ${candidates.length}곳 (자원 배분 논리, 효과는 사전등록 후 평가)`,
      why: "무발생 지점 장비를 발생이력 격자로",
    })
  recs.push({ t: "수거 시간대 조정 검토(무예산)", why: "배출과 수거의 시차 축소" })

  return (
    <ModalShell
      id="dump-brief"
      size="md"
      onClose={onClose}
      header={
        <>
          <p className="text-[12px] font-medium tracking-wide text-[var(--cp-text-dim)]">
            무단투기 동별 브리핑 · {period.label} · 기준 {data.decision.asof}
          </p>
          <h2 className="mt-0.5 text-xl font-bold text-[var(--cp-text-strong)]">{dong}</h2>
          <p className="mt-1 text-[14px] text-[var(--cp-text-muted)]">
            과태료 발생률(천명당) {data.dong.length}개 동 중{" "}
            <b className={rank <= 3 ? "text-[#a8322a]" : ""}>{rank}위</b>
          </p>
        </>
      }
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-lg bg-[#0c6155] py-2 text-[14px] font-semibold text-white hover:bg-[#0a5449]"
          >
            인쇄 / PDF 저장
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--cp-border)] px-4 py-2 text-[14px] text-[var(--cp-text)] hover:bg-[var(--cp-hover)]"
          >
            닫기
          </button>
        </div>
      }
    >
      <dl className="grid grid-cols-3 gap-x-2 gap-y-2 text-center">
        {[
          { k: "민원", v: row.cr.toFixed(1), u: `천명당 · ${row.comp}건` },
          { k: "과태료", v: row.er.toFixed(1), u: `천명당 · ${row.enf}건` },
          { k: "무관리주거", v: `${row.unm}%`, u: `다가구 ${row.mf.toLocaleString()}가구` },
          { k: "1인세대", v: `${row.one}%`, u: `${row.hh.toLocaleString()}세대 중` },
          { k: "청년 20-34", v: `${row.yth}%`, u: "2025년" },
          { k: "외국인", v: `${row.frn}%`, u: "2025년" },
          ...(row.lp ? [{ k: "생활인구", v: row.lp.toLocaleString(), u: `체류 기준 · 천명당 과태료 ${row.erl ?? "—"}` }] : []),
        ].map((f) => (
          <div key={f.k} className="rounded-lg bg-[var(--cp-hover)] py-1.5">
            <dt className="text-[12px] text-[var(--cp-text-dim)]">{f.k}</dt>
            <dd className="font-mono text-[16px] font-semibold text-[var(--cp-text-strong)]">{f.v}</dd>
            <dd className="text-[11px] text-[var(--cp-text-faint)]">{f.u}</dd>
          </div>
        ))}
      </dl>

      {hotspots.length > 0 && (
        <section className="mt-4">
          <h3 className="text-[13px] font-semibold text-[var(--cp-text-dim)]">
            이 동의 예측 핫스팟 (구 전체 상위 {data.decision.hotspots.top.length} 중 {hotspots.length}곳)
          </h3>
          <ul className="mt-1 flex flex-col gap-1">
            {hotspots.map((h, i) => (
              <li key={i} className="rounded-lg border border-[var(--cp-border-faint)] px-2.5 py-1.5 text-[13px]">
                <span className="font-medium text-[var(--cp-text-strong)]">{h[6] || "(주소 미상)"}</span>
                <span className="ml-1.5 text-[var(--cp-text-dim)]">
                  최근 180일 민원 {h[3]} · 과태료 {h[4]}
                  {h[7] === 0 && " · 이동식 CCTV 없음"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4">
        <h3 className="text-[13px] font-semibold text-[var(--cp-text-dim)]">권고 검토 대책</h3>
        <ul className="mt-1 flex flex-col gap-1">
          {recs.map((r) => (
            <li key={r.t} className="rounded-lg bg-[#0c6155]/8 px-2.5 py-1.5 text-[13px] leading-snug">
              <span className="font-medium text-[#0a4a41]">{r.t}</span>
              <span className="ml-1 text-[12px] text-[var(--cp-text-dim)]">근거: {r.why}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--cp-text-faint)]">
        수치는 조건부 연관이며 인과를 증명한 것은 아닙니다. 무관리주거·1인세대·청년·외국인은 서로 얽혀 있어(상관
        0.85~0.97) 어느 하나를 원인으로 지목할 수 없습니다. 개입은 실행 전에 조치 대장에 사전등록하고 비교 대상을 정한
        뒤 평가해 주세요.
      </p>
    </ModalShell>
  )
}
