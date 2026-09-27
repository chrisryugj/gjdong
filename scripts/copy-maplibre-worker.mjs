// maplibre-gl 6 워커(ESM)를 public/maplibre/ 로 복사한다. Next(Turbopack·webpack 모두)는 워커 옆 maplibre-gl-shared.mjs 를
// 같이 내보내지 않아 지도가 타일을 못 받는다(maplibre 공식 설치 안내). 워커가 shared 를 상대경로로 불러 둘 다 같은 폴더에 둔다.
// 설치된 버전에서 매번 복사하므로 판이 어긋나지 않는다. 쓰는 곳: dumping-map·snow-map 의 setWorkerUrl
import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const dist = path.join(path.dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json")), "dist")
const dest = path.join(process.cwd(), "public", "maplibre")

mkdirSync(dest, { recursive: true })
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(dist, file), path.join(dest, file))
}
