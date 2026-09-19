// 탭 공용 항목 제목. 번호(Manrope)와 큰 제목, 필요하면 한 줄 부제. 12라운드: 결재선이 훑는 항목 이름은 본문보다 확실히 커야 한다.
// 정책·발견·운영·물어보기 탭이 같은 위계를 쓴다. 접힌 항목(details)은 Folded.
// 2026-09-18 지도 전면: 카드 폭이 440px로 좁아져 제목 20px·번호 15px. 부제 문자열은 nb()로 괄호 줄바꿈 방지
import { nb } from "@/lib/dumping/nobreak"

export function SectionHead({ n, children, sub, first = false }: { n: string; children: React.ReactNode; sub?: React.ReactNode; first?: boolean }) {
  return (
    <div className={first ? "mb-3" : "mb-3 border-t border-[var(--cp-border)] pt-5"}>
      <h3 className="flex items-baseline gap-2.5 text-[20px] font-bold leading-tight text-[var(--cp-text-strong)]">
        <span className="dump-idx text-[15px] text-(--dump-accent)">{n}</span>
        <span>{children}</span>
      </h3>
      {sub && <p className="mt-1.5 pl-8 text-[13.5px] leading-relaxed text-[var(--cp-text-dim)]">{typeof sub === "string" ? nb(sub) : sub}</p>}
    </div>
  )
}

export function Folded({ n, title, sub, children, defaultOpen = false }: { n: string; title: string; sub?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group border-t border-[var(--cp-border)] pt-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-baseline gap-2.5 text-[17px] font-bold text-[var(--cp-text-strong)] [&::-webkit-details-marker]:hidden">
        <span className="dump-idx text-[14px] text-(--dump-accent)">{n}</span>
        <span className="flex-1">{title}</span>
        <span className="text-[13px] font-medium text-(--dump-accent) group-open:hidden">펼치기</span>
        <span className="hidden text-[13px] font-medium text-[var(--cp-text-dim)] group-open:inline">접기</span>
      </summary>
      {sub && <p className="mt-0.5 pl-8 text-[13.5px] text-[var(--cp-text-dim)]">{nb(sub)}</p>}
      <div className="mt-3">{children}</div>
    </details>
  )
}
