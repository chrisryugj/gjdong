"use client"

import { LawRef } from "@/components/dumping/law-ref"
import { SNOW_LAW_ASOF, SNOW_LAW_TEXTS, snowLawRefsIn } from "@/lib/snow/law"

// /snow 법령 인용 팝오버(dumping law-ref 이식). 문장 안의 "조례 제5조"·"자연재해대책법 제27조"·"지방자치법 제142조"만 LawRef로 감싼다. 원문은 lib/snow/law.ts
export function linkSnowLawRefs(text: string, up = false): React.ReactNode {
  return snowLawRefsIn(text).map((part, i) =>
    typeof part === "string" ? (
      part
    ) : (
      <LawRef key={i} keys={part.keys} up={up} texts={SNOW_LAW_TEXTS} asof={SNOW_LAW_ASOF}>
        {part.text}
      </LawRef>
    ),
  )
}
