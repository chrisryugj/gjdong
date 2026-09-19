#!/usr/bin/env node
// /dumping 지도의 건물 입체를 OSM 대신 국가공간정보포털 "GIS건물통합정보"(광진구)로 바꾸는 변환기(17라운드, 2026-09-19).
// OSM은 구의·자양 일부 다가구 골목이 비어 있어 "저층 다가구 vs 아파트" 대비가 끊긴다. 건축물대장 연계 건물 윤곽·층수·높이는 전수라 그 공백이 메워진다.
//
// 자료 받기(로그인 필요, 무료 회원): 브이월드 데이터마켓 https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?svcCde=NA&dsId=18
//   (국가공간정보포털 nsdi.go.kr은 2024-01 폐쇄·브이월드로 이관) → 시·도 서울특별시 → 전체데이터 SHP(서울 전체 AL_D010_11_YYYYMMDD, 695,754동·dbf 1.2GB)
//   좌표계 EPSG:5186(기준일 2023-08-08 이후), 속성 CP949, 필드는 A0~A28(컬럼 정의서):
//   A1 UFID · A2 PNU · A3 법정동코드(광진 11215*) · A4 법정동명 · A16 높이(m, 0=미기재) · A24 건물명 · A26 지상층수 · A27 지하층수
//   여기서 광진구만(A3 LIKE '11215%') 잘라 쓴다
//
// 쓰는 법: node scripts/dumping-buildings.mjs <zip 또는 shp 경로>
//   → public/dumping/basemap/buildings.pmtiles (z13~16, 광진구만). 이어서 lib/dumping/basemap-style.ts HAS_NSDI_BUILDINGS를 true로 바꾸고 커밋
// 필요한 도구: brew install gdal tippecanoe (ogr2ogr·tippecanoe). 임시 파일은 시스템 임시 폴더에
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const input = process.argv[2]
if (!input || !existsSync(input)) {
  console.error("사용법: node scripts/dumping-buildings.mjs <GIS건물통합정보 zip 또는 shp>")
  process.exit(1)
}
for (const tool of ["ogr2ogr", "tippecanoe"]) {
  try {
    execFileSync("which", [tool], { stdio: "ignore" })
  } catch {
    console.error(`${tool} 없음. brew install gdal tippecanoe`)
    process.exit(1)
  }
}

const work = mkdtempSync(path.join(tmpdir(), "dump-bld-"))
let shp = input
if (input.toLowerCase().endsWith(".zip")) {
  execFileSync("unzip", ["-o", "-q", input, "-d", work])
  const found = readdirSync(work, { recursive: true }).find((f) => String(f).toLowerCase().endsWith(".shp"))
  if (!found) {
    console.error("zip 안에 .shp가 없음")
    process.exit(1)
  }
  shp = path.join(work, String(found))
}

// 1) SHP → GeoJSON(WGS84). 층수·높이만 남기고 속성 이름을 짧게. 높이 0은 층수×3.2m(아래 스타일 식이 처리)
const geojson = path.join(work, "buildings.geojson")
execFileSync(
  "ogr2ogr",
  [
    "-f", "GeoJSON", geojson, shp,
    "-t_srs", "EPSG:4326",
    "-nlt", "PROMOTE_TO_MULTI",
    "-sql", `SELECT A26 AS flr, A16 AS h, A24 AS nm, A1 AS id, A4 AS dong FROM "${path.basename(shp, ".shp")}" WHERE A3 LIKE '11215%'`,
    "--config", "SHAPE_ENCODING", "CP949",
    "-lco", "RFC7946=YES",
  ],
  { stdio: "inherit" },
)

// 2) GeoJSON → PMTiles. z13~16(구 전체 보기 13.4에서도 덩어리로 보이게), 작은 건물도 떨어뜨리지 않는다
const out = path.resolve("public/dumping/basemap/buildings.pmtiles")
execFileSync(
  "tippecanoe",
  ["-o", out, "--force", "-l", "buildings", "-Z", "13", "-z", "16", "--no-feature-limit", "--no-tile-size-limit", "--detect-shared-borders", "--simplification=4", geojson],
  { stdio: "inherit" },
)
rmSync(work, { recursive: true, force: true })
console.log(`완료: ${out}\n다음: lib/dumping/basemap-style.ts HAS_NSDI_BUILDINGS = true → npm run build → 커밋(.pmtiles 포함)`)
