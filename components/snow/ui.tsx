"use client"

// /snow 패널 공용 조각(3라운드, dumping 정책 탭 규격). 상자(rounded-xl border)를 두르지 않는다: 헤어라인·번호 인덱스·면 틴트로만 나눈다.
// StatBand = 핵심 수치 4칸(위아래 헤어라인만. 세로선 금지 규칙) · NumRow = 번호·숫자·문장 한 줄 목록 · Table = 열 정렬 표(행 30px)

export function StatBand({ items }: { items: { k: string; v: string; u?: string; accent?: boolean }[] }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-y-1 border-y border-[var(--cp-border)] md:grid-cols-4 md:gap-y-0">
      {items.map((it) => (
        <div key={it.k} className="py-2 pr-2">
          <dt className="dump-kicker text-[9.5px] leading-tight text-[var(--cp-text-dim)]">{it.k}</dt>
          <dd className="mt-0.5 flex items-baseline gap-0.5">
            <span className={`font-mono text-[20px] font-semibold leading-none ${it.accent ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>{it.v}</span>
            {it.u && <span className="text-[12px] text-[var(--cp-text-dim)]">{it.u}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// 번호 · 큰 숫자 · 문장 한 줄(+메타 한 줄 + 보충 한 줄). 발견·판단·점검 후보 목록. 누르면 지도. meta = "부서 · 기한 · 규모"(4라운드 결재 문서화)
export function NumRow({ n, big, unit, title, meta, body, accent = false, active = false, onClick }: { n: number; big?: string; unit?: string; title: string; meta?: string; body?: string; accent?: boolean; active?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <span className="dump-idx mt-[3px] w-5 shrink-0 text-[13px] text-[var(--cp-text-faint)]">{String(n).padStart(2, "0")}</span>
      {big && (
        <span className="w-[62px] shrink-0">
          <span className={`block font-mono text-[19px] font-semibold leading-none ${accent ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>{big}</span>
          {unit && <span className="mt-0.5 block text-[12px] leading-none text-[var(--cp-text-dim)]">{unit}</span>}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold leading-snug text-[var(--cp-text-strong)]">{title}</span>
        {meta && <span className="mt-0.5 block text-[12.5px] leading-snug text-(--dump-accent)">{meta}</span>}
        {body && <span className="mt-0.5 block text-[13px] leading-snug text-[var(--cp-text-muted)]">{body}</span>}
      </span>
    </>
  )
  const cls = `flex w-full items-start gap-2.5 border-t border-[var(--cp-border-faint)] py-2 text-left first:border-t-0 ${active ? "bg-[var(--cp-hover2)]" : ""}`
  return onClick ? (
    <button onClick={onClick} aria-pressed={active} className={`${cls} hover:bg-[var(--cp-hover)]`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

export type Col = { k: string; w?: string; align?: "left" | "right"; dim?: boolean }
// 열 정렬 표. 머리 한 줄(키커) + 행 30px 헤어라인. cells는 col 순서. 행을 누르면 onRow
export function Table<T>({ cols, rows, cell, rowKey, onRow, rowClass }: { cols: Col[]; rows: T[]; cell: (r: T, k: string) => React.ReactNode; rowKey: (r: T) => string; onRow?: (r: T) => void; rowClass?: (r: T) => string }) {
  const grid = cols.map((c) => c.w ?? "1fr").join(" ")
  return (
    <div className="text-[13.5px]">
      <div className="grid items-baseline gap-x-2 border-b border-[var(--cp-border)] pb-1" style={{ gridTemplateColumns: grid }}>
        {cols.map((c) => (
          <span key={c.k} className={`dump-kicker text-[9.5px] text-[var(--cp-text-dim)] ${c.align === "right" ? "text-right" : ""}`}>
            {c.k}
          </span>
        ))}
      </div>
      {rows.map((r) => {
        const inner = cols.map((c) => (
          <span key={c.k} className={`min-w-0 truncate ${c.align === "right" ? "text-right font-mono" : ""} ${c.dim ? "text-[var(--cp-text-dim)]" : "text-[var(--cp-text)]"}`}>
            {cell(r, c.k)}
          </span>
        ))
        const cls = `grid h-[30px] w-full items-center gap-x-2 border-b border-[var(--cp-border-faint)] text-left ${rowClass?.(r) ?? ""}`
        return onRow ? (
          <button key={rowKey(r)} onClick={() => onRow(r)} className={`${cls} hover:bg-[var(--cp-hover)]`} style={{ gridTemplateColumns: grid }}>
            {inner}
          </button>
        ) : (
          <div key={rowKey(r)} className={cls} style={{ gridTemplateColumns: grid }}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}
