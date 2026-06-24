"use client"

import { markerSvg, MARKER_COLORS, MARKER_SHAPES, SHAPE_LABELS, type CategoryStyle, type MarkerShape } from "@/lib/facility-markers"

// 모양 미리보기 (지도 divIcon과 동일 SVG 사용)
export function ShapeIcon({ shape, color, size = 16 }: { shape: MarkerShape; color: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{ width: size, height: size, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: markerSvg(shape, color, size) }}
    />
  )
}

// 모양 + 색상 선택 패널
export default function MarkerStylePicker({
  value,
  onChange,
}: {
  value: CategoryStyle
  onChange: (s: CategoryStyle) => void
}) {
  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
      <div>
        <p className="mb-1 text-[10px] font-semibold text-gray-400">모양</p>
        <div className="flex flex-wrap gap-1">
          {MARKER_SHAPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ ...value, shape: s })}
              title={SHAPE_LABELS[s]}
              className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                value.shape === s ? "border-gray-900 bg-white" : "border-gray-200 bg-white hover:border-gray-400"
              }`}
            >
              <ShapeIcon shape={s} color={value.color} size={18} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold text-gray-400">색상</p>
        <div className="flex flex-wrap gap-1">
          {MARKER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...value, color: c })}
              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                value.color === c ? "border-gray-900" : "border-white"
              }`}
              style={{ backgroundColor: c, boxShadow: "0 0 0 1px rgba(0,0,0,0.1)" }}
              aria-label={c}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
