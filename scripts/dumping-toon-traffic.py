"""/dumping 모형 보기 도로 위 차·사람 경로(25라운드, 2026-10-10 사용자: "도로에 차와 사람들도 구현하면 좋겠어").

바탕 OSM 도로(gwangjin.pmtiles roads, z15)를 같은 길끼리 이어 긴 사슬로 만든 뒤 차로·주차 줄·보행 줄마다 옆으로 옮긴 경로를 쓴다.
런타임(components/dumping/toon-traffic.ts)이 경로를 텍스처에 올려 차·사람을 셰이더 안에서 경로 따라 움직인다(같은 차로는 같은 속도라 겹치지 않는다).
 - 차로: 일방(큰길은 상하행이 따로 그려진 일방 두 줄)은 선 둘레에 차로 수만큼, 양방은 선 오른쪽(우측통행)에 방향마다. 터널은 뺀다(차가 땅 밑에 숨는다)
 - 주차 줄: 골목(residential·living_street·unclassified)은 양쪽 가장자리, service 는 한쪽. 런타임이 6.2m 칸마다 일부를 채운다
 - 보행 줄: 간선·보조·국지 도로는 바깥 보도(차로 끝 + 1.8m), 골목은 양쪽 가장자리, OSM 보도·보행로는 그 선. 붐빔은 경로 60m 안 가게(식당·카페·술집·편의점 등) 수와
   지하철역 250m 안이면 더 키운다(건대입구 맛의거리가 붐비고 주택가 골목은 한산하게)
26라운드(디오라마): 경로는 구 경계 안쪽만 남긴다(구 밖은 탁자라 차가 허공을 달렸다). 공원·학교 운동장·광장·대학 캠퍼스에는 사람이 모여 거니는 자리(spot)를
  격자로 흩어 둔다(건물 윤곽 안 자리는 뺀다. toon-buildings.bin). 사용자: "학교나 공원 같은 유동인구 많을 곳엔 사람이 있어야지"
높이는 dem.pmtiles z14(지도 지형과 같은 원자료, 과장 전). 바이트 형식 정본은 lib/dumping/toon-world.ts(TNR2).

쓰는 법: python3 -I scripts/dumping-toon-traffic.py   (data/dumping/map.json 의 구 경계를 읽는다)
필요: ogr2ogr(GDAL 3.8+ PMTiles) · pmtiles CLI. 파이썬 표준 라이브러리만(모형 자료 스크립트의 도우미를 불러 쓴다)
"""
import importlib.util
import json
import math
import os
import struct
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # 모형 자료 스크립트를 불러와도 scripts/__pycache__ 를 남기지 않는다
spec = importlib.util.spec_from_file_location("toon_world", os.path.join(HERE, "dumping-toon-world.py"))
W = importlib.util.module_from_spec(spec)
spec.loader.exec_module(W)

OUT = os.path.join(W.BASEMAP, "toon-traffic.bin")
NEAR_M = 150  # 구 경계 밖으로 이만큼까지
STEP_M = 25.0  # 경로 꼭짓점 간격 상한(원래 꺾임점은 두고 긴 변만 나눠 지면 높이를 잰다. 청소한 지형은 도심이 완만하다)
MIN_LEN_M = 25.0

# 도로 등급: (등급 번호, 일방일 때 차로 수, 양방일 때 방향마다 차로 수, 차로 폭 m)
CLASS = {
    "motorway": (0, 3, 3, 3.5), "trunk": (0, 3, 3, 3.4),
    "primary": (1, 3, 2, 3.2), "secondary": (2, 2, 2, 3.1), "tertiary": (3, 1, 1, 3.0),
    "motorway_link": (4, 1, 1, 3.3), "trunk_link": (4, 1, 1, 3.3), "primary_link": (4, 1, 1, 3.2), "secondary_link": (4, 1, 1, 3.1), "tertiary_link": (4, 1, 1, 3.0),
    "residential": (5, 1, 1, 2.6), "living_street": (5, 1, 1, 2.3), "unclassified": (5, 1, 1, 2.8), "road": (5, 1, 1, 2.8),
    "service": (6, 1, 1, 2.4),
}
WALK = {"footway": 8, "pedestrian": 8, "sidewalk": 7, "path": 8, "crossing": 8}
SHOPS = {"restaurant", "cafe", "bar", "pub", "fast_food", "convenience", "beauty", "hairdresser", "bank", "pharmacy", "supermarket", "bakery", "clothes", "ice_cream", "mobile_phone", "cosmetics"}
KIND_LANE, KIND_PARK, KIND_WALK = 0, 1, 2
# 모임 자리: landuse kind → (등급 9 공원 · 10 학교·놀이터·운동장 · 11 광장 · 12 캠퍼스, 격자 간격 m, 남길 확률, 반지름 m 범위)
SPOT = {
    "park": (9, 26, 0.45, (3, 9)), "garden": (9, 26, 0.45, (3, 8)), "recreation_ground": (9, 24, 0.5, (3, 9)),
    "school": (10, 16, 0.6, (4, 10)), "kindergarten": (10, 12, 0.6, (3, 6)), "playground": (10, 10, 0.85, (2, 5)), "pitch": (10, 14, 0.7, (4, 10)),
    "pedestrian": (11, 12, 0.7, (3, 6)),
    "university": (12, 22, 0.5, (3, 9)), "college": (12, 22, 0.5, (3, 9)),
}


def lines(geom):
    if not geom:
        return []
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def chain(segs):
    """같은 길(종류·일방·이름) 조각을 끝점으로 잇는다. 일방은 끝→시작만, 양방은 뒤집어서도. 끝점 0.6m 안이면 같은 점"""
    cell = 2.0
    ends = {}

    def key(p):
        return (math.floor(p[0] / cell), math.floor(p[1] / cell))

    def near(p):
        kx, kz = key(p)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for item in ends.get((kx + dx, kz + dz), ()):
                    yield item

    for i, (pts, oneway) in enumerate(segs):
        ends.setdefault(key(pts[0]), []).append((i, 0))
        ends.setdefault(key(pts[-1]), []).append((i, 1))
    used = [False] * len(segs)
    out = []

    def take(p, oneway, want_start):
        for j, which in near(p):
            if used[j]:
                continue
            q = segs[j][0][0 if which == 0 else -1]
            if math.hypot(q[0] - p[0], q[1] - p[1]) > 0.6:
                continue
            if oneway and which != (0 if want_start else 1):
                continue
            return j, which
        return None

    for i, (pts, oneway) in enumerate(segs):
        if used[i]:
            continue
        used[i] = True
        cur = list(pts)
        while True:  # 앞으로
            hit = take(cur[-1], oneway, True)
            if not hit:
                break
            j, which = hit
            used[j] = True
            nxt = segs[j][0] if which == 0 else segs[j][0][::-1]
            cur.extend(nxt[1:])
        while True:  # 뒤로
            hit = take(cur[0], oneway, False)
            if not hit:
                break
            j, which = hit
            used[j] = True
            prv = segs[j][0] if which == 1 else segs[j][0][::-1]
            cur = prv[:-1] + cur
        out.append((cur, oneway))
    return out


def resample(pts, step):
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if d < 1e-6:
            continue
        n = max(1, math.ceil(d / step))
        for k in range(1, n + 1):
            out.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return out


def offset(pts, d):
    """진행 방향 오른쪽(+z 남, +x 동 좌표에서 (−dz, dx))으로 d m. 꺾인 곳은 두 변 법선의 평균(뾰족하면 1.8배까지)"""
    n = len(pts)
    out = []
    for k in range(n):
        a = pts[max(0, k - 1)]
        b = pts[min(n - 1, k + 1)]
        if k > 0 and k < n - 1:
            p, c, q = pts[k - 1], pts[k], pts[k + 1]
            l1 = math.hypot(c[0] - p[0], c[1] - p[1]) or 1
            l2 = math.hypot(q[0] - c[0], q[1] - c[1]) or 1
            n1 = (-(c[1] - p[1]) / l1, (c[0] - p[0]) / l1)
            n2 = (-(q[1] - c[1]) / l2, (q[0] - c[0]) / l2)
            mx, mz = n1[0] + n2[0], n1[1] + n2[1]
            ml = math.hypot(mx, mz)
            if ml < 1e-6:
                mx, mz = n1
            else:
                mx, mz = mx / ml, mz / ml
            k_len = min(1.8, 1 / max(0.3, mx * n1[0] + mz * n1[1]))
            out.append((pts[k][0] + mx * d * k_len, pts[k][1] + mz * d * k_len))
        else:
            dx, dz = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(dx, dz) or 1
            out.append((pts[k][0] - dz / ln * d, pts[k][1] + dx / ln * d))
    return out


def clip_inside(pts, inside):
    """경로를 구 안쪽 구간들로 자른다(경계를 넘나드는 길은 여러 토막)"""
    runs, cur = [], []
    for p in pts:
        if inside(*p):
            cur.append(p)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= 2 and length(r) >= MIN_LEN_M]


def building_hash(path):
    """toon-buildings.bin(TNB2·TNB3) 윤곽을 칸 해시로. 모임 자리가 건물 안에 서지 않게"""
    with open(path, "rb") as fp:
        b = fp.read()
    head = 20 if b[:4] == b"TNB3" else 18
    (count,) = struct.unpack_from("<I", b, 4)
    o = 24
    h = W.Hash(30)
    for _ in range(count):
        (n,) = struct.unpack_from("<H", b, o)
        x, z = struct.unpack_from("<ii", b, o + head - 8)
        o += head
        ring = [(x / 10, z / 10)]
        for _ in range(n - 1):
            dx, dz = struct.unpack_from("<hh", b, o)
            o += 4
            x += dx
            z += dz
            ring.append((x / 10, z / 10))
        x0, z0, x1, z1 = W.bbox(ring)
        h.add(x0, z0, x1, z1, ring)
    return h


def length(pts):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))


def main():
    if not os.path.exists(W.MAP_JSON):
        sys.exit("data/dumping/map.json 없음(구 경계가 필요하다). npm run dumping:decrypt 뒤 다시")
    with open(W.MAP_JSON, encoding="utf-8") as fp:
        gu = [W.local(lng, lat) for lat, lng in json.load(fp)["ring"]]
    gx0, gz0, gx1, gz1 = W.bbox(gu)

    def near_gu(x, z):
        if not (gx0 - NEAR_M <= x <= gx1 + NEAR_M and gz0 - NEAR_M <= z <= gz1 + NEAR_M):
            return False
        return W.point_in_ring(x, z, gu) or any(W.seg_dist(x, z, gu[i - 1], gu[i]) < NEAR_M for i in range(len(gu)))

    work = tempfile.mkdtemp(prefix="dump-traffic-")
    dem = W.Dem(W.DEM)
    roads = W.ogr_geojson(W.OSM, os.path.join(work, "roads.geojson"), ["roads", "-oo", "ZOOM_LEVEL=15", "-t_srs", "EPSG:4326"])
    pois = W.ogr_geojson(W.OSM, os.path.join(work, "pois.geojson"), ["pois", "-oo", "ZOOM_LEVEL=15", "-t_srs", "EPSG:4326"])
    shops = W.Hash(60)
    n_shop = 0
    stations = []
    for f in pois:
        p = f["properties"]
        g = f["geometry"]
        if not g or g["type"] != "Point":
            continue
        x, z = W.local(*g["coordinates"])
        if p.get("kind") in SHOPS:
            shops.add(x - 60, z - 60, x + 60, z + 60, (x, z))  # 반경 60m 안 칸마다(near 는 한 칸만 본다)
            n_shop += 1
        elif p.get("kind") == "station":
            stations.append((x, z))
    groups = {}
    walks = []
    for f in roads:
        p = f["properties"]
        if p.get("is_tunnel"):
            continue
        kd = p.get("kind_detail") or ""
        for ln in lines(f["geometry"]):
            pts = [W.local(lng, lat) for lng, lat in ln]
            if len(pts) < 2 or not any(near_gu(x, z) for x, z in pts[:: max(1, len(pts) // 6)] + [pts[-1]]):
                continue
            if kd in CLASS:
                oneway = p.get("oneway") == "yes"
                groups.setdefault((kd, oneway, p.get("name") or ""), []).append((pts, oneway))
            elif p.get("kind") == "path" and kd in WALK:
                walks.append(pts)
    print(f"도로 조각 {sum(len(v) for v in groups.values()):,} · 보행로 조각 {len(walks):,} · 가게 {n_shop:,} · 역 {len(stations)}")

    paths = []  # (점들, 종류, 등급)
    for (kd, oneway, _name), segs in groups.items():
        cls, lanes_one, lanes_two, lane_w = CLASS[kd]
        for pts, ow in chain(segs):
            if length(pts) < MIN_LEN_M:
                continue
            pts = resample(pts, STEP_M)
            if ow:
                half = lanes_one * lane_w / 2
                for k in range(lanes_one):
                    paths.append((offset(pts, (k + 0.5) * lane_w - half), KIND_LANE, cls))
                if cls <= 3:
                    paths.append((offset(pts, half + 1.8), KIND_WALK, 7))
            else:
                med = 0.3 if cls <= 4 else 0.0
                half = lanes_two * lane_w + med
                for d_pts in (pts, pts[::-1]):
                    for k in range(lanes_two):
                        paths.append((offset(d_pts, med + (k + 0.5) * lane_w), KIND_LANE, cls))
                    if cls <= 3:
                        paths.append((offset(d_pts, half + 1.8), KIND_WALK, 7))
                    elif cls == 5:
                        paths.append((offset(d_pts, half + 1.1), KIND_PARK, cls))
                        paths.append((offset(d_pts, half + 2.0), KIND_WALK, 5))
                    elif cls == 6 and d_pts is pts:
                        paths.append((offset(d_pts, half + 1.0), KIND_PARK, cls))
    for pts, ow in chain([(w, False) for w in walks]):
        if length(pts) >= MIN_LEN_M:
            paths.append((resample(pts, STEP_M), KIND_WALK, 8))

    # 붐빔: 보행 줄 60m 안 가게 수(100m당) · 역 250m 안
    def boost(pts):
        if not pts:
            return 1.0
        seen = set()
        for x, z in pts[::2]:
            for sx, sz in shops.near(x, z):
                if (sx, sz) not in seen and math.hypot(sx - x, sz - z) < 60:
                    seen.add((sx, sz))
        per100 = len(seen) / max(1.0, length(pts) / 100)
        b = 1 + 0.25 * per100
        mx, mz = pts[len(pts) // 2]
        if any(math.hypot(sx - mx, sz - mz) < 250 for sx, sz in stations):
            b *= 1.6
        return min(6.0, b)

    inside = lambda x, z: W.point_in_ring(x, z, gu)
    clipped = [(run, kind, cls) for pts, kind, cls in paths for run in clip_inside(pts, inside)]
    out_paths = bytearray()
    out_verts = bytearray()
    nv = 0
    kinds = [0, 0, 0]
    total_len = [0.0, 0.0, 0.0]
    for pts, kind, cls in clipped:
        if len(pts) < 2 or len(pts) > 65535:
            continue
        b = boost(pts) if kind == KIND_WALK else 1.0
        out_paths += struct.pack("<IHBBB", nv, len(pts), kind, cls, min(255, round(b * 10)))
        for x, z in pts:
            y = dem.elevation(*W.lnglat(x, z))
            out_verts += struct.pack("<iih", round(x * 10), round(z * 10), round(y * 10))
        nv += len(pts)
        kinds[kind] += 1
        total_len[kind] += length(pts)
    # 모임 자리: 공원·학교·광장·캠퍼스 다각형 안 격자점(건물 윤곽 밖), 자리마다 거니는 원 반지름
    blds = building_hash(os.path.join(W.BASEMAP, "toon-buildings.bin"))
    in_building = lambda x, z: any(W.point_in_ring(x, z, r) for r in blds.near(x, z))
    landuse = W.ogr_geojson(W.OSM, os.path.join(work, "landuse.geojson"), ["landuse", "-oo", "ZOOM_LEVEL=15", "-t_srs", "EPSG:4326"])
    out_spots = bytearray()
    spot_n = {9: 0, 10: 0, 11: 0, 12: 0}
    taken = set()
    for f in landuse:
        spec_ = SPOT.get(f["properties"].get("kind"))
        if not spec_:
            continue
        cls, step, keep, (r0, r1) = spec_
        for poly in W.polygons(f["geometry"]):
            outer = [W.local(lng, lat) for lng, lat in poly[0]]
            holes = [[W.local(lng, lat) for lng, lat in h] for h in poly[1:]]
            x0, z0, x1, z1 = W.bbox(outer)
            gx = math.floor(x0 / step) * step + step / 2
            while gx < x1:
                gz = math.floor(z0 / step) * step + step / 2
                while gz < z1:
                    key = (round(gx), round(gz))
                    if key not in taken and W.point_in_ring(gx, gz, outer) and not any(W.point_in_ring(gx, gz, h) for h in holes) and inside(gx, gz) and W.h32("spot", *key) < keep and not in_building(gx, gz):
                        taken.add(key)
                        jx = (W.h32("jx", *key) - 0.5) * step * 0.6
                        jz = (W.h32("jz", *key) - 0.5) * step * 0.6
                        r = r0 + (r1 - r0) * W.h32("r", *key)
                        y = dem.elevation(*W.lnglat(gx + jx, gz + jz))
                        out_spots += struct.pack("<iihBB", round((gx + jx) * 10), round((gz + jz) * 10), round(y * 10), cls, min(255, round(r * 10)))
                        spot_n[cls] += 1
                    gz += step
                gx += step
    ns = sum(spot_n.values())
    n = sum(kinds)
    out = bytearray(b"TNR2") + struct.pack("<III", n, nv, ns) + out_paths + out_verts + out_spots
    with open(OUT, "wb") as fp:
        fp.write(out)
    print(f"차로 {kinds[0]:,}줄 {total_len[0] / 1000:.0f}km · 주차 줄 {kinds[1]:,}줄 {total_len[1] / 1000:.0f}km · 보행 줄 {kinds[2]:,}줄 {total_len[2] / 1000:.0f}km · 꼭짓점 {nv:,}")
    print(f"모임 자리 공원 {spot_n[9]:,} · 학교·놀이터·운동장 {spot_n[10]:,} · 광장 {spot_n[11]:,} · 캠퍼스 {spot_n[12]:,}")
    print(f"→ {os.path.relpath(OUT, W.ROOT)} ({len(out) / 1024:.0f}KB)")


if __name__ == "__main__":
    main()
