// 시설 현황 보고서 — 독립 HTML 문서 생성 (새 탭에서 인쇄/PDF 저장)
import type { Facility } from "@/lib/facility-storage"
import { resolveStyle, type CategoryStyle } from "@/lib/facility-markers"

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function buildReportHtml(opts: {
  facilities: Facility[]
  styles: Record<string, CategoryStyle>
  mapImage: string | null
  generatedAt: string
  title?: string
}): string {
  const { facilities, styles, mapImage, generatedAt } = opts
  const title = opts.title || "시설 현황 보고서"

  // 분류별 집계
  const counts = new Map<string, number>()
  for (const f of facilities) {
    const k = f.category?.trim() || "미분류"
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const catRows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => {
      const color = resolveStyle(cat === "미분류" ? undefined : cat, styles).color
      return `<tr><td><span class="dot" style="background:${color}"></span>${esc(cat)}</td><td class="num">${n}</td></tr>`
    })
    .join("")

  const listRows = facilities
    .map((f, i) => {
      const color = resolveStyle(f.category, styles).color
      return `<tr>
        <td class="num">${i + 1}</td>
        <td><span class="dot" style="background:${color}"></span>${esc(f.name)}</td>
        <td>${esc(f.category || "-")}</td>
        <td>${esc(f.address || f.originalInput)}</td>
        <td>${esc(f.adminDong || "-")}</td>
        <td>${esc(f.memo || "")}</td>
      </tr>`
    })
    .join("")

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #1f2937; margin: 0; padding: 32px; background: #f3f4f6; }
  .sheet { max-width: 900px; margin: 0 auto; background: #fff; padding: 40px; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  h2 { font-size: 15px; border-left: 4px solid #2563eb; padding-left: 8px; margin: 28px 0 12px; }
  .summary { display: flex; gap: 16px; margin-bottom: 8px; }
  .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; }
  .card .big { font-size: 28px; font-weight: 800; }
  .card .lbl { font-size: 12px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f9fafb; font-weight: 700; font-size: 12px; color: #374151; }
  td.num, th.num { text-align: center; width: 48px; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .mapwrap { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
  .mapwrap img { width: 100%; display: block; }
  .toolbar { max-width: 900px; margin: 0 auto 16px; display: flex; justify-content: flex-end; gap: 8px; }
  .btn { background: #111827; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  .foot { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; max-width: none; padding: 0; }
    .toolbar { display: none; }
    h2 { break-after: avoid; }
    tr { break-inside: avoid; }
  }
</style></head>
<body>
  <div class="toolbar"><button class="btn" onclick="window.print()">🖨 인쇄 / PDF 저장</button></div>
  <div class="sheet">
    <h1>${esc(title)}</h1>
    <div class="meta">생성일: ${esc(generatedAt)}</div>

    <h2>총괄</h2>
    <div class="summary">
      <div class="card"><div class="big">${facilities.length}</div><div class="lbl">전체 시설</div></div>
      <div class="card"><div class="big">${counts.size}</div><div class="lbl">분류 수</div></div>
    </div>
    <table>
      <thead><tr><th>분류</th><th class="num">개수</th></tr></thead>
      <tbody>${catRows || '<tr><td colspan="2">데이터 없음</td></tr>'}</tbody>
    </table>

    ${mapImage ? `<h2>위치도</h2><div class="mapwrap"><img src="${mapImage}" alt="시설 위치도"/></div>` : ""}

    <h2>시설 목록 (${facilities.length})</h2>
    <table>
      <thead><tr><th class="num">#</th><th>시설명</th><th>분류</th><th>표준주소</th><th>행정동</th><th>메모</th></tr></thead>
      <tbody>${listRows || '<tr><td colspan="6">등록된 시설이 없습니다</td></tr>'}</tbody>
    </table>

    <div class="foot">표준주소실록 · 시설관리 대시보드에서 생성 · 데이터는 작성자 브라우저에 저장됨</div>
  </div>
</body></html>`
}
