#!/usr/bin/env node
// /dumping 입체 순위 숫자용 서체(18라운드 후속, 2026-09-20). SUIT Bold(OFL)에서 숫자 0~9 윤곽만 뽑아 three.js 타입페이스 JSON으로.
// three는 examples/fonts를 더 이상 싣지 않고, 전체 서체 JSON은 수백 KB라 숫자만(약 4KB). 결과는 components/dumping/digit-font.json(커밋).
// 쓰는 법: node scripts/dumping-digit-font.mjs [otf 경로]   (기본 ~/Library/Fonts/SUIT-Bold.otf)
// three FontLoader 규약: glyph.o = "m x y | l x y | q x y cx cy | b x y c1x c1y c2x c2y | z" (끝점 먼저, 제어점 뒤). 단위는 resolution(unitsPerEm)
import { readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import opentype from "opentype.js"

const src = process.argv[2] ?? path.join(homedir(), "Library/Fonts/SUIT-Bold.otf")
const font = opentype.parse(readFileSync(src).buffer.slice(0))
const upem = font.unitsPerEm
const glyphs = {}
for (const ch of "0123456789") {
  const g = font.charToGlyph(ch)
  const cmds = g.getPath(0, 0, upem).commands // getPath(x,y,fontSize): fontSize=upem이면 단위 그대로
  const out = []
  for (const c of cmds) {
    if (c.type === "M") out.push("m", r(c.x), r(-c.y))
    else if (c.type === "L") out.push("l", r(c.x), r(-c.y))
    else if (c.type === "Q") out.push("q", r(c.x), r(-c.y), r(c.x1), r(-c.y1))
    else if (c.type === "C") out.push("b", r(c.x), r(-c.y), r(c.x1), r(-c.y1), r(c.x2), r(-c.y2))
    else if (c.type === "Z") out.push("z")
  }
  glyphs[ch] = { ha: Math.round(g.advanceWidth), x_min: Math.round(g.xMin ?? 0), x_max: Math.round(g.xMax ?? g.advanceWidth), o: out.join(" ") }
}
// getPath는 y가 아래로 커지는 화면 좌표라 부호를 뒤집는다
function r(v) {
  return Math.round(v)
}
const json = {
  familyName: "SUIT",
  styleName: "Bold",
  resolution: upem,
  boundingBox: { xMin: 0, yMin: font.descender, xMax: upem, yMax: font.ascender },
  ascender: font.ascender,
  descender: font.descender,
  underlineThickness: 50,
  glyphs,
}
const out = path.resolve("components/dumping/digit-font.json")
writeFileSync(out, JSON.stringify(json))
console.log(`완료: ${out} (${Object.keys(glyphs).length}자, ${(readFileSync(out).length / 1024).toFixed(1)}KB, 원본 ${src})`)
