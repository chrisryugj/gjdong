#!/usr/bin/env python3
# /dumping 모형 보기(23라운드, 2026-10-09)의 정적 자료를 만든다. three.js 툰 렌더(components/dumping/toon-layer.ts)가 이 두 파일을 그린다.
#   - public/dumping/basemap/toon-buildings.bin : GIS건물통합정보(광진구) 윤곽 + 지상층수·높이 + 지면 고도(dem.pmtiles z14)
#   - public/dumping/basemap/toon-trees.bin     : 바탕 타일 landuse(숲·공원·정원) 안의 나무 자리. 건물·도로·물·운동장은 비운다
# 형식(바이트 배치)은 lib/dumping/toon-world.ts 머리 주석이 정본이고 이 스크립트가 그 형식으로 쓴다.
#
# 쓰는 법: python3 scripts/dumping-toon-world.py <AL_D010_11_YYYYMMDD 폴더 · zip · shp>
#   자료 받는 곳은 scripts/dumping-buildings.mjs 머리 주석(브이월드 데이터마켓, 로그인 필요). 같은 SHP 를 쓴다.
#   나무는 구 경계 + 400m 안만 심는다. 경계는 data/dumping/map.json 의 ring(복호화된 로컬 자료, `npm run dumping:decrypt`)에서 읽고
#   출력에는 경계도 원자료도 들어가지 않는다(나무 좌표뿐).
# 필요한 도구: ogr2ogr(GDAL 3.8+, PMTiles 드라이버) · pmtiles CLI. 파이썬은 표준 라이브러리만.
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASEMAP = os.path.join(ROOT, "public", "dumping", "basemap")
DEM = os.path.join(BASEMAP, "dem.pmtiles")
OSM = os.path.join(BASEMAP, "gwangjin.pmtiles")
MAP_JSON = os.path.join(ROOT, "data", "dumping", "map.json")
OUT_BLD = os.path.join(BASEMAP, "toon-buildings.bin")
OUT_TREE = os.path.join(BASEMAP, "toon-trees.bin")
OUT_GROUND = os.path.join(BASEMAP, "toon-ground.bin")
GROUND_CELL_M = 25  # 그림자 받이 지면 격자 칸. 받이는 그림자만 보이는 면이라 이 정도면 지형을 따라간다
GROUND_MARGIN_M = 800

# 모델 원점(components/dumping/icons3d.ts ANCHOR 와 같다). three 좌표: +x 동, +z 남, 단위 m(원점 위도의 메르카토르 축척)
ANCHOR = (127.085, 37.546)
EARTH_R = 6371008.8  # maplibre earthRadius
DEM_Z = 14
TREE_MARGIN_M = 400  # 구 경계 밖으로 이만큼까지 나무를 심는다(아차산 능선이 경계라 반대편 비탈도 조금)


def merc(lng, lat):
    x = (lng + 180) / 360
    y = (1 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi) / 2
    return x, y


AX, AY = merc(*ANCHOR)
M_PER_UNIT = 2 * math.pi * EARTH_R * math.cos(math.radians(ANCHOR[1]))  # 메르카토르 1 단위 = 원점 위도에서 이만큼 m


def local(lng, lat):
    x, y = merc(lng, lat)
    return (x - AX) * M_PER_UNIT, (y - AY) * M_PER_UNIT


# ─── PNG(terrarium) 해독. 8비트 RGB/RGBA, 비인터레이스만 ───
def png_pixels(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "PNG 아님"
    pos, idat, w, h, bpp = 8, b"", 0, 0, 3
    while pos < len(data):
        (ln,) = struct.unpack(">I", data[pos : pos + 4])
        typ = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + ln]
        pos += 12 + ln
        if typ == b"IHDR":
            w, h, depth, ctype, _, _, inter = struct.unpack(">IIBBBBB", body)
            assert depth == 8 and inter == 0 and ctype in (2, 6), f"지원 안 하는 PNG {depth} {ctype} {inter}"
            bpp = 3 if ctype == 2 else 4
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
    raw = zlib.decompress(idat)
    stride = w * bpp
    out = bytearray(h * stride)
    prev = bytearray(stride)
    i = 0
    for y in range(h):
        f = raw[i]
        i += 1
        line = bytearray(raw[i : i + stride])
        i += stride
        if f == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                left = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out[y * stride : (y + 1) * stride] = line
        prev = line
    return w, h, bpp, out


class Dem:
    """dem.pmtiles z14 terrarium 을 쌍선형으로 읽는다(타일 경계는 옆 타일을 받아 잇는다)"""

    def __init__(self, path):
        self.path = path
        self.tiles = {}

    def tile(self, tx, ty):
        key = (tx, ty)
        if key not in self.tiles:
            r = subprocess.run(["pmtiles", "tile", self.path, str(DEM_Z), str(tx), str(ty)], capture_output=True)
            if r.returncode != 0 or not r.stdout:
                self.tiles[key] = None
            else:
                w, h, bpp, px = png_pixels(r.stdout)
                el = [0.0] * (w * h)
                for k in range(w * h):
                    o = k * bpp
                    el[k] = px[o] * 256 + px[o + 1] + px[o + 2] / 256 - 32768
                self.tiles[key] = (w, el)
        return self.tiles[key]

    def at_px(self, gx, gy):
        tx, ty = int(gx // 256), int(gy // 256)
        t = self.tile(tx, ty)
        if t is None:
            return 0.0
        w, el = t
        return el[int(gy - ty * 256) * w + int(gx - tx * 256)]

    def elevation(self, lng, lat):
        n = 2**DEM_Z * 256
        x, y = merc(lng, lat)
        gx, gy = x * n - 0.5, y * n - 0.5  # 픽셀 중심 기준
        x0, y0 = math.floor(gx), math.floor(gy)
        fx, fy = gx - x0, gy - y0
        e00, e10 = self.at_px(x0, y0), self.at_px(x0 + 1, y0)
        e01, e11 = self.at_px(x0, y0 + 1), self.at_px(x0 + 1, y0 + 1)
        return (e00 * (1 - fx) + e10 * fx) * (1 - fy) + (e01 * (1 - fx) + e11 * fx) * fy


def find_shp(arg, work):
    if os.path.isdir(arg):
        for f in sorted(os.listdir(arg)):
            if f.lower().endswith(".shp"):
                return os.path.join(arg, f)
    if arg.lower().endswith(".zip"):
        subprocess.run(["unzip", "-o", "-q", arg, "-d", work], check=True)
        for dp, _, fs in os.walk(work):
            for f in fs:
                if f.lower().endswith(".shp"):
                    return os.path.join(dp, f)
    if arg.lower().endswith(".shp"):
        return arg
    sys.exit(f"SHP 를 못 찾음: {arg}")


def ogr_geojson(src, out, layer_args):
    subprocess.run(["ogr2ogr", "-f", "GeoJSON", out, src, *layer_args], check=True, capture_output=True)
    with open(out, encoding="utf-8") as fp:
        return json.load(fp)["features"]


def polygons(geom):
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def signed_area(r):
    a = 0.0
    for i in range(len(r)):
        x0, z0 = r[i]
        x1, z1 = r[(i + 1) % len(r)]
        a += x0 * z1 - x1 * z0
    return a / 2


def clean_ring(pts):
    """닫는 점·0.05m 안 겹친 점·거의 일직선(0.08m 안)인 점을 뺀다"""
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    out = []
    for p in pts:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 0.05:
            out.append(p)
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= 0.05:
        out.pop()
    changed = True
    while changed and len(out) > 3:
        changed = False
        for i in range(len(out)):
            a, b, c = out[i - 1], out[i], out[(i + 1) % len(out)]
            ab = math.hypot(c[0] - a[0], c[1] - a[1])
            if ab < 1e-6:
                continue
            dev = abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / ab
            if dev < 0.08:
                out.pop(i)
                changed = True
                break
    return out


def point_in_ring(x, z, r):
    inside = False
    j = len(r) - 1
    for i in range(len(r)):
        xi, zi = r[i]
        xj, zj = r[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def seg_dist(px, pz, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dz * dz
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - a[0]) * dx + (pz - a[1]) * dz) / L))
    return math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz))


class Hash:
    """칸 크기 cell(m) 버킷. 항목은 (bbox, 값)"""

    def __init__(self, cell):
        self.cell = cell
        self.b = {}

    def add(self, x0, z0, x1, z1, v):
        c = self.cell
        for i in range(int(math.floor(x0 / c)), int(math.floor(x1 / c)) + 1):
            for j in range(int(math.floor(z0 / c)), int(math.floor(z1 / c)) + 1):
                self.b.setdefault((i, j), []).append(v)

    def near(self, x, z):
        return self.b.get((int(math.floor(x / self.cell)), int(math.floor(z / self.cell))), ())


def h32(*vals):
    """결정적 해시(0~1). 같은 칸은 늘 같은 나무"""
    n = 2166136261
    for v in vals:
        for ch in str(v):
            n = ((n ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    n ^= n >> 15
    n = (n * 2246822519) & 0xFFFFFFFF
    n ^= n >> 13
    return n / 4294967296


def main():
    if len(sys.argv) < 2:
        sys.exit("사용법: python3 scripts/dumping-toon-world.py <GIS건물통합정보 폴더·zip·shp>")
    for tool in ("ogr2ogr", "pmtiles"):
        if shutil.which(tool) is None:
            sys.exit(f"{tool} 없음(brew install gdal pmtiles)")
    work = tempfile.mkdtemp(prefix="dump-toon-")
    try:
        shp = find_shp(sys.argv[1], work)
        dem = Dem(DEM)

        # ─── 건물 ───
        layer = os.path.splitext(os.path.basename(shp))[0]
        feats = ogr_geojson(
            shp,
            os.path.join(work, "bld.geojson"),
            ["-t_srs", "EPSG:4326", "-sql", f'SELECT A26 AS flr, A16 AS h FROM "{layer}" WHERE A3 LIKE \'11215%\'', "--config", "SHAPE_ENCODING", "CP949"],
        )
        blds = []
        for f in feats:
            p = f["properties"]
            for poly in polygons(f["geometry"]):
                ring = clean_ring([local(lng, lat) for lng, lat in poly[0]])
                if len(ring) < 3 or abs(signed_area(ring)) < 4:
                    continue
                lls = [(lng, lat) for lng, lat in poly[0][:-1]]
                step = max(1, len(lls) // 8)
                g = [dem.elevation(*lls[i]) for i in range(0, len(lls), step)]
                clng = sum(q[0] for q in lls) / len(lls)
                clat = sum(q[1] for q in lls) / len(lls)
                blds.append({"ring": ring, "flr": int(p.get("flr") or 0), "h": float(p.get("h") or 0), "gmin": min(g), "gc": dem.elevation(clng, clat)})
        # 512m 덩어리 순으로(런타임 덩어리 나누기와 같은 순서라 메모리 접근이 모인다)
        blds.sort(key=lambda b: (math.floor(b["ring"][0][1] / 512), math.floor(b["ring"][0][0] / 512)))
        out = bytearray(b"TNB1")
        out += struct.pack("<Idd", len(blds), *ANCHOR)
        nverts = 0
        for b in blds:
            r = [(round(x * 10), round(z * 10)) for x, z in b["ring"]]
            out += struct.pack("<HBBHhhii", len(r), min(255, max(0, b["flr"])), 0, min(65535, round(b["h"] * 10)), round(b["gmin"] * 10), round(b["gc"] * 10), r[0][0], r[0][1])
            for k in range(1, len(r)):
                out += struct.pack("<hh", r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1])
            nverts += len(r)
        with open(OUT_BLD, "wb") as fp:
            fp.write(out)
        print(f"건물 {len(blds):,}동 · 꼭짓점 {nverts:,} · {len(out) / 1024:.0f}KB → {os.path.relpath(OUT_BLD, ROOT)}")

        # ─── 나무 ───
        if not os.path.exists(MAP_JSON):
            sys.exit("data/dumping/map.json 없음(나무는 구 경계 안만 심는다). npm run dumping:decrypt 뒤 다시")
        with open(MAP_JSON, encoding="utf-8") as fp:
            ring_ll = json.load(fp)["ring"]  # [lat, lng]
        gu = [local(lng, lat) for lat, lng in ring_ll]
        GX0, GZ0 = min(q[0] for q in gu) - TREE_MARGIN_M, min(q[1] for q in gu) - TREE_MARGIN_M
        GX1, GZ1 = max(q[0] for q in gu) + TREE_MARGIN_M, max(q[1] for q in gu) + TREE_MARGIN_M

        def near_gu(x, z):
            if not (GX0 <= x <= GX1 and GZ0 <= z <= GZ1):
                return False
            if point_in_ring(x, z, gu):
                return True
            return any(seg_dist(x, z, gu[i - 1], gu[i]) < TREE_MARGIN_M for i in range(len(gu)))

        osm = lambda name: ogr_geojson(OSM, os.path.join(work, f"{name}.geojson"), [name, "-oo", "ZOOM_LEVEL=15", "-t_srs", "EPSG:4326"])
        landuse = osm("landuse")
        water = osm("water")
        roads = osm("roads")

        def local_polys(f):
            return [[[local(lng, lat) for lng, lat in r] for r in poly] for poly in polygons(f["geometry"])]

        def bbox(r):
            xs = [q[0] for q in r]
            zs = [q[1] for q in r]
            return min(xs), min(zs), max(xs), max(zs)

        # 비울 곳: 건물(1.5m 여유), 물, 운동장·놀이터·광장·철도·주차, 도로(반폭 + 1m)
        blocks = Hash(25)
        for b in blds:
            x0, z0, x1, z1 = bbox(b["ring"])
            blocks.add(x0 - 2, z0 - 2, x1 + 2, z1 + 2, ("ring", b["ring"], 1.5))
        for f in water:
            for poly in local_polys(f):
                x0, z0, x1, z1 = bbox(poly[0])
                blocks.add(x0, z0, x1, z1, ("poly", poly, 0))
        NO_TREE = {"pitch", "playground", "pedestrian", "platform", "railway", "parking", "school", "kindergarten", "university", "residential", "commercial", "industrial", "hospital"}
        for f in landuse:
            if f["properties"].get("kind") in NO_TREE:
                for poly in local_polys(f):
                    x0, z0, x1, z1 = bbox(poly[0])
                    blocks.add(x0, z0, x1, z1, ("poly", poly, 0))
        ROAD_HALF = {"highway": 12, "major_road": 8, "minor_road": 4, "path": 1.5, "rail": 4, "other": 3}
        for f in roads:
            g = f["geometry"]
            half = ROAD_HALF.get(f["properties"].get("kind"), 3)
            lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"] if g["type"] == "MultiLineString" else []
            for ln in lines:
                pts = [local(lng, lat) for lng, lat in ln]
                for i in range(1, len(pts)):
                    a, b = pts[i - 1], pts[i]
                    blocks.add(min(a[0], b[0]) - half - 1, min(a[1], b[1]) - half - 1, max(a[0], b[0]) + half + 1, max(a[1], b[1]) + half + 1, ("seg", (a, b), half + 1))

        def blocked(x, z):
            for kind, geo, m in blocks.near(x, z):
                if kind == "seg":
                    if seg_dist(x, z, geo[0], geo[1]) < m:
                        return True
                elif kind == "ring":
                    if point_in_ring(x, z, geo) or (m and any(seg_dist(x, z, geo[i - 1], geo[i]) < m for i in range(len(geo)))):
                        return True
                elif point_in_ring(x, z, geo[0]) and not any(point_in_ring(x, z, hole) for hole in geo[1:]):
                    return True
            return False

        # 종류별 간격(m)·채택률·나무 꼴(0 활엽 둥근 · 1 침엽 · 2 작은 관목)·침엽 비율
        TREE_KIND = {
            "wood": (8.5, 0.82, 0.5),
            "forest": (8.5, 0.82, 0.5),
            "park": (12.0, 0.55, 0.12),
            "garden": (11.0, 0.5, 0.1),
            "cemetery": (13.0, 0.5, 0.4),
            "golf_course": (16.0, 0.35, 0.3),
            "recreation_ground": (14.0, 0.4, 0.1),
            "scrub": (7.0, 0.55, -1),
        }
        taken = Hash(6)
        trees = []
        for f in landuse:
            kind = f["properties"].get("kind")
            if kind not in TREE_KIND:
                continue
            sp, accept, conifer = TREE_KIND[kind]
            for poly in local_polys(f):
                x0, z0, x1, z1 = bbox(poly[0])
                if x1 < GX0 or x0 > GX1 or z1 < GZ0 or z0 > GZ1:
                    continue
                for i in range(int(math.floor(max(x0, GX0) / sp)), int(math.floor(min(x1, GX1) / sp)) + 1):
                    for j in range(int(math.floor(max(z0, GZ0) / sp)), int(math.floor(min(z1, GZ1) / sp)) + 1):
                        if h32(kind, i, j, "a") > accept:
                            continue
                        x = (i + 0.15 + 0.7 * h32(kind, i, j, "x")) * sp
                        z = (j + 0.15 + 0.7 * h32(kind, i, j, "z")) * sp
                        # 싼 검사부터: 구 근처 → 이 면 안 → 이웃 나무 → 비울 곳
                        if not near_gu(x, z):
                            continue
                        if not point_in_ring(x, z, poly[0]) or any(point_in_ring(x, z, hole) for hole in poly[1:]):
                            continue
                        if any(math.hypot(x - tx, z - tz) < 4.5 for tx, tz in taken.near(x, z)):
                            continue
                        if blocked(x, z):
                            continue
                        taken.add(x - 4.5, z - 4.5, x + 4.5, z + 4.5, (x, z))
                        lng = (x / M_PER_UNIT + AX) * 360 - 180
                        lat = math.degrees(2 * math.atan(math.exp(math.pi * (1 - 2 * (z / M_PER_UNIT + AY)))) - math.pi / 2)
                        form = 2 if conifer < 0 else 1 if h32(kind, i, j, "c") < conifer else 0
                        trees.append((x, z, dem.elevation(lng, lat), form, h32(kind, i, j, "s")))
        out = bytearray(b"TNT1")
        out += struct.pack("<I", len(trees))
        for x, z, g, form, s in trees:
            out += struct.pack("<hhhBB", round(x * 2), round(z * 2), round(g * 10), form, min(255, round(s * 255)))
        with open(OUT_TREE, "wb") as fp:
            fp.write(out)
        forms = [sum(1 for t in trees if t[3] == k) for k in range(3)]
        print(f"나무 {len(trees):,}그루(활엽 {forms[0]:,} · 침엽 {forms[1]:,} · 관목 {forms[2]:,}) · {len(out) / 1024:.0f}KB → {os.path.relpath(OUT_TREE, ROOT)}")

        # ─── 지면 격자(그림자 받이). 건물·나무가 선 범위 + 800m ───
        xs = [q[0] for b in blds for q in b["ring"]] + [t[0] for t in trees]
        zs = [q[1] for b in blds for q in b["ring"]] + [t[1] for t in trees]
        x0 = math.floor((min(xs) - GROUND_MARGIN_M) / GROUND_CELL_M) * GROUND_CELL_M
        z0 = math.floor((min(zs) - GROUND_MARGIN_M) / GROUND_CELL_M) * GROUND_CELL_M
        nx = int(math.ceil((max(xs) + GROUND_MARGIN_M - x0) / GROUND_CELL_M)) + 1
        nz = int(math.ceil((max(zs) + GROUND_MARGIN_M - z0) / GROUND_CELL_M)) + 1
        out = bytearray(b"TNG1")
        out += struct.pack("<HHfff", nx, nz, x0, z0, GROUND_CELL_M)
        for j in range(nz):
            for i in range(nx):
                x, z = x0 + i * GROUND_CELL_M, z0 + j * GROUND_CELL_M
                lng = (x / M_PER_UNIT + AX) * 360 - 180
                lat = math.degrees(2 * math.atan(math.exp(math.pi * (1 - 2 * (z / M_PER_UNIT + AY)))) - math.pi / 2)
                out += struct.pack("<h", round(dem.elevation(lng, lat) * 10))
        with open(OUT_GROUND, "wb") as fp:
            fp.write(out)
        print(f"지면 격자 {nx}×{nz}({GROUND_CELL_M}m) · {len(out) / 1024:.0f}KB → {os.path.relpath(OUT_GROUND, ROOT)}")
        print(f"DEM z{DEM_Z} 타일 {sum(1 for v in dem.tiles.values() if v)}장")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
