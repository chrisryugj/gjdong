"""/dumping 지도 지형(DEM) 만들기 + 청소(25라운드, 2026-10-10 사용자: "일감호는 버그 있는 듯 솟아올라 보임").

AWS Terrain Tiles(Mapzen terrarium, SRTM) 공개 버킷에서 바탕과 같은 사각형(z8~14)을 받아 청소한 뒤 pmtiles 한 장으로 묶는다.
받은 원본은 그 전까지 쓰던 dem.pmtiles 와 바이트까지 같다(z14 타일 대조). 매번 원본에서 다시 만들어 몇 번을 돌려도 결과가 같다.
SRTM 은 땅이 아니라 겉면(건물·나무 꼭대기)을 잰 레이더 고도라
 - 작은 물 위에서 값이 튄다: 일감호 한가운데 104m 봉우리(둘레 땅 25m 안팎) → 과장 1.4배 지형 위에서 호수가 솟아 보였다
 - 큰 건물 자리에 둔덕이 선다: 테크노마트 일대 중앙값 64m(둘레 20m 안팎), 스타시티·워커힐도 +15~40m → 도로가 천막처럼 솟았다
 - 한강 물가에 −1,400~−1,700m 외톨이 화소가 있다(z14 기준 65개)
줌마다 그 줌의 타일을 이어 붙인 모자이크에서 아래를 차례로 한다.
 1. 외톨이 화소: 5×5 중앙값보다 (40m + 화소 크기의 0.3배) 넘게 꺼지면 중앙값으로(깨진 화소는 전부 꺼진 쪽이다. 솟은 쪽은 2·3이 맡는다)
 2. 둔덕 깎기: 회색조 열림(grey opening, 원판). 평면 비탈·오목한 골은 그대로 두고 원판보다 좁은 볼록만 깎는다.
    원판 반경은 건물 밀도로 섞는다. 바탕 OSM 건물 윤곽을 깔아 반경 120m 안 건물 비율이 25% 이상이면 90m, 건물이 없으면 30m(산 능선은 덜 깎이게).
    건물 쪽은 열림이 남긴 원판 무늬를 10m 흐림으로 지운다
 3. 물 평평: 바탕 OSM 물(kind=water. 수영장·분수 제외) 덩어리마다 물가 띠(바깥 15m)의 하위 25% 고도와 안쪽 중앙값 중 낮은 값으로.
    호수·연못(강·하천 제외, 강은 제방이 실제로 있다)은 물가 30m 안을 기울기 0.35 둑으로 눌러 수면과 땅 사이 절벽(톱니)을 없앤다
 4. terrarium 으로 다시 담는다(무손실 PNG, 1/256m 단위)
이어서 모형 지면·건물 바닥도 이 지형으로: python3 scripts/dumping-toon-world.py <GIS건물통합정보 SHP 폴더>

쓰는 법: python3 scripts/dumping-dem-clean.py [출력경로]   기본 public/dumping/basemap/dem.pmtiles
필요: numpy · scipy · Pillow, ogr2ogr(GDAL 3.8+ PMTiles 드라이버) · pmtiles CLI
"""
import io
import json
import math
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import urllib.request

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASEMAP = os.path.join(ROOT, "public", "dumping", "basemap")
DEM = os.path.join(BASEMAP, "dem.pmtiles")
OSM = os.path.join(BASEMAP, "gwangjin.pmtiles")
BBOX = (127.02, 37.49, 127.16, 37.60)  # minLon, minLat, maxLon, maxLat(바탕 gwangjin.pmtiles 와 같은 범위)
ZOOMS = range(8, 15)
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
META = {"name": "terrarium-gwangjin", "type": "baselayer", "version": "1", "format": "png", "attribution": "Mapzen/AWS Terrain Tiles · SRTM", "description": "AWS Terrain Tiles (Mapzen terrarium) extract, cleaned by scripts/dumping-dem-clean.py"}

PIT_JUMP_M = 40.0
R_URBAN_M = 90.0
R_OPEN_M = 30.0
DENSITY_R_M = 120.0
DENSITY_FULL = 0.25
URBAN_BLUR_M = 10.0
SHORE_M = 15.0
BANK_M = 30.0
BANK_SLOPE = 0.35
FLOWING = ("river", "stream", "canal", "ditch", "drain")


def merc(lng, lat):
    return (lng + 180) / 360, (1 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi) / 2


def tile_range(z):
    n = 2**z
    x0, y0 = merc(BBOX[0], BBOX[3])
    x1, y1 = merc(BBOX[2], BBOX[1])
    return int(x0 * n), int(x1 * n), int(y0 * n), int(y1 * n)


def fetch(z, x, y):
    req = urllib.request.Request(URL.format(z=z, x=x, y=y), headers={"User-Agent": "gjdong-dumping-dem"})
    with urllib.request.urlopen(req, timeout=30) as r:
        a = np.asarray(Image.open(io.BytesIO(r.read())).convert("RGB")).astype(np.float64)
    assert a.shape == (256, 256, 3), f"타일 크기 {a.shape}"
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def encode(e):
    v = np.clip(e + 32768, 0, 65535.996)
    whole = np.floor(v)
    rgb = np.stack([np.floor(whole / 256), np.mod(whole, 256), np.floor((v - whole) * 256)], axis=-1).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgb, "RGB").save(buf, "PNG", optimize=True)
    return buf.getvalue()


def ogr(layer, out):
    subprocess.run(["ogr2ogr", "-f", "GeoJSON", out, OSM, layer, "-oo", "ZOOM_LEVEL=15", "-t_srs", "EPSG:4326"], check=True, capture_output=True)
    with open(out, encoding="utf-8") as f:
        return json.load(f)["features"]


def polygons(geom):
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def raster(polys, z, x0, y0, w, h):
    """경위도 다각형(구멍 포함)을 모자이크 화소 격자에 0/1 로"""
    img = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(img)
    n = 2**z * 256
    for poly in polys:
        for k, ring in enumerate(poly):
            pts = []
            for lng, lat in ring:
                mx, my = merc(lng, lat)
                pts.append((mx * n - x0 * 256, my * n - y0 * 256))
            if len(pts) >= 3:
                draw.polygon(pts, fill=0 if k else 1)
    return np.asarray(img, dtype=bool)


def disk(r):
    k = max(1, int(round(r)))
    yy, xx = np.ogrid[-k : k + 1, -k : k + 1]
    return xx * xx + yy * yy <= r * r + 0.25


def clean(e, px_m, bld, water, still):
    """한 줌 모자이크를 청소한다. 바뀐 화소 통계를 같이 돌려준다"""
    raw = e.copy()
    med = ndimage.median_filter(e, size=5, mode="nearest")
    pit = med - e > PIT_JUMP_M + 0.3 * px_m
    e = np.where(pit, med, e)
    r_small, r_big = R_OPEN_M / px_m, R_URBAN_M / px_m
    if r_big >= 1:
        o_big = ndimage.grey_opening(e, footprint=disk(r_big), mode="nearest")
        o_small = ndimage.grey_opening(e, footprint=disk(r_small), mode="nearest") if r_small >= 1 else e
        dens = ndimage.uniform_filter(bld.astype(np.float64), size=max(1, int(round(2 * DENSITY_R_M / px_m))), mode="nearest")
        w = np.clip(dens / DENSITY_FULL, 0, 1)
        if URBAN_BLUR_M / px_m >= 0.5:
            o_big = ndimage.gaussian_filter(o_big, URBAN_BLUR_M / px_m, mode="nearest")
        e = w * o_big + (1 - w) * o_small
    lab, _ = ndimage.label(water)
    k = max(1, int(round(SHORE_M / px_m)))
    kb = max(1, int(math.ceil(BANK_M / px_m)))
    for i, sl in enumerate(ndimage.find_objects(lab)):
        pad = tuple(slice(max(0, s.start - kb - 1), s.stop + kb + 1) for s in sl)
        comp = lab[pad] == i + 1
        sub = e[pad]
        ring = ndimage.binary_dilation(comp, iterations=k) & ~water[pad]
        level = float(np.median(sub[comp]))
        if ring.any():
            level = min(level, float(np.percentile(sub[ring], 25)))
        sub[comp] = level
        if still[pad][comp].mean() > 0.5:
            dist = ndimage.distance_transform_edt(~comp) * px_m
            bank = (dist <= BANK_M) & ~water[pad]
            sub[bank] = np.minimum(sub[bank], level + dist[bank] * BANK_SLOPE)
    return e, {"pits": int(pit.sum()), "cut_max": float((raw - e).max()), "cut_gt5": int(((raw - e) > 5).sum())}


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else DEM
    for tool in ("ogr2ogr", "pmtiles"):
        if subprocess.run(["which", tool], capture_output=True).returncode:
            sys.exit(f"{tool} 없음(brew install gdal pmtiles)")
    lat = (BBOX[1] + BBOX[3]) / 2
    with tempfile.TemporaryDirectory() as work:
        blds = [p for f in ogr("buildings", os.path.join(work, "bld.geojson")) for p in polygons(f["geometry"])]
        waters = [(f["properties"].get("kind_detail") in FLOWING, p) for f in ogr("water", os.path.join(work, "water.geojson")) if f["properties"].get("kind") == "water" for p in polygons(f["geometry"])]
        print(f"OSM 건물 윤곽 {len(blds):,} · 물 {len(waters):,}")
        tiles = []
        for z in ZOOMS:
            x0, x1, y0, y1 = tile_range(z)
            w, h = (x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256
            e = np.zeros((h, w))
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    e[(y - y0) * 256 : (y - y0 + 1) * 256, (x - x0) * 256 : (x - x0 + 1) * 256] = fetch(z, x, y)
            px_m = 156543.03392 * math.cos(math.radians(lat)) / 2**z
            water = raster([p for _, p in waters], z, x0, y0, w, h)
            still = raster([p for flowing, p in waters if not flowing], z, x0, y0, w, h)
            e, st = clean(e, px_m, raster(blds, z, x0, y0, w, h), water, still)
            print(f"z{z}: 타일 {(x1 - x0 + 1) * (y1 - y0 + 1)} · 외톨이 {st['pits']} · 깎은 최대 {st['cut_max']:.1f}m · 5m 넘게 깎은 화소 {st['cut_gt5']:,}")
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    tiles.append((z, x, y, encode(e[(y - y0) * 256 : (y - y0 + 1) * 256, (x - x0) * 256 : (x - x0 + 1) * 256])))
        mb = os.path.join(work, "dem.mbtiles")
        db = sqlite3.connect(mb)
        db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
        db.execute("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
        meta = {**META, "minzoom": str(ZOOMS[0]), "maxzoom": str(ZOOMS[-1]), "bounds": ",".join(str(v) for v in BBOX), "center": f"{(BBOX[0] + BBOX[2]) / 2},{lat},12"}
        db.executemany("INSERT INTO metadata VALUES (?, ?)", list(meta.items()))
        db.executemany("INSERT INTO tiles VALUES (?, ?, ?, ?)", [(z, x, 2**z - 1 - y, sqlite3.Binary(d)) for z, x, y, d in tiles])
        db.commit()
        db.close()
        tmp = os.path.join(work, "dem.pmtiles")
        subprocess.run(["pmtiles", "convert", "-q", mb, tmp], check=True)
        shutil.copyfile(tmp, out)
    print(f"→ {out} ({os.path.getsize(out) / 1e6:.1f}MB)")


if __name__ == "__main__":
    main()
