// 마크: 눈 결정 여섯 가지(획 하나짜리 기하). 헤더·로딩 카드가 같이 쓴다
export default function SnowMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0 rounded-full bg-[var(--dump-ink)] text-[var(--dump-paper)]">
      <g stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" fill="none">
        {[0, 60, 120].map((a) => (
          <g key={a} transform={`rotate(${a} 16 16)`}>
            <path d="M16 6v20M13 9.5 16 12l3-2.5M13 22.5 16 20l3 2.5" />
          </g>
        ))}
      </g>
    </svg>
  )
}
