// 클린광진 상황실 마크. 100m 격자(가는 선) 위에 채운 칸 하나(적발 기록이 몰린 칸)와 원 하나(과태료 원 오버레이).
// 화면이 하는 일(격자로 나눠 어디에 몰리는지 본다)을 그대로 그린 자체 마크. 광진구 공식 표장은 쓰지 않는다.
export default function DumpMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className={className} aria-hidden="true">
      <rect x="0.5" y="0.5" width="35" height="35" rx="7" fill="var(--dump-paper-white)" stroke="var(--cp-border-strong)" />
      <g stroke="var(--cp-border-strong)" strokeWidth="0.9">
        <path d="M12 3.5v29M24 3.5v29M3.5 12h29M3.5 24h29" />
      </g>
      <rect x="12" y="12" width="12" height="12" fill="#0c6155" />
      <circle cx="24" cy="24" r="6.2" fill="none" stroke="#0c6155" strokeWidth="1.9" />
      <circle cx="24" cy="24" r="6.2" fill="#0c6155" fillOpacity="0.14" />
    </svg>
  )
}
