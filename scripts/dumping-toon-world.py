#!/usr/bin/env python3
# /dumping 입체 지도 건물·나무·지면 정적 자료를 만든다(23라운드 모형 보기, 24라운드 2026-10-09 실사 건물·OSM 신축 보강).
#   - public/dumping/basemap/toon-buildings.bin    : 모형 보기 건물(three, components/dumping/toon-layer.ts). 윤곽 + 층수·높이 + 유형(용도·연대·벽돌) + 지면 고도 + 동 번호(25라운드)
#   - public/dumping/basemap/buildings.pmtiles     : 도면 보기 건물(maplibre 압출). 위와 같은 건물 집합
#   - public/dumping/basemap/context-buildings.pmtiles : 구 밖 OSM 건물(배경). 구 경계 밖 1.5km 안만
#   - public/dumping/basemap/toon-trees.bin · toon-ground.bin : 나무 자리 · 그림자 받이 지면 격자
# 바이트 형식은 lib/dumping/toon-world.ts 머리 주석이 정본이고 이 스크립트가 그 형식으로 쓴다.
#
# 건물 집합 = GIS건물통합정보(광진구 전수) + 검증된 OSM 신축. 24라운드 실측: 통합정보가 재개발지에서 낡았다.
#   자양동 870(광진구청 18층 82.3m · 롯데캐슬 이스트폴 48층 등 13동, 2025-01-23 사용승인)이 통째로 없고 철거된 동부지방법원·검찰청·광진전화국이 남아 있었다.
#   건대입구역자이엘라(20층 99.6m, 2022) 자리엔 1996년 5층, 국립정신건강센터(12층 56.2m, 2016) 자리엔 1961년 병동이 남아 있다.
#   그래서 OSM 건물 중 높이 25m 이상이고 겹치는 대장 건물이 모두 그 절반 아래인 것은 "새 고층 후보"로 보고
#   좌표 → 지번(카카오 coord2address) → 그 필지 건축물대장 표제부(건축HUB) 높이와 맞으면(±max(5m, 15%)) 대장 값으로 세운다.
#   맞는 대장 건물이 없으면 넣지 않는다(공사 중·OSM 오기. 실측: 중곡동 국립정신건강센터 옆 95m는 대장에 없다).
#   세운 고층 윤곽 안에 30% 이상 든 대장 건물, 새 고층 80m 안에서 지금 지번이 그 새 건물 필지인데 그 필지 대장에 맞는 동(층·높이·사용승인 연도)이 없는
#   대장 건물은 철거된 것으로 뺀다. 대장에 없는 낮은 OSM 건물(정수장 덮개 등 150㎡ 이상)은 더하되 고가·지하 구조물(OSM layer ≠ 0: 구의역·뚝섬유원지역)은 뺀다
#   (바닥 높이가 없어 땅에 붙은 덩어리로 서서 길을 막았다). OSM z15 타일 경계에서 잘린 조각은 같은 id끼리 합친다(합친 꼴이 볼록에 가까우면 껍질 하나).
#   대장에 높이·층수가 없는 건물은 덮는 OSM 높이를 빌린다.
#   검증 결과는 scripts/data/dumping-osm-ledger.json 에 캐시(공개 대장 값과 지번뿐). 캐시가 있으면 네트워크 없이 같은 결과가 나온다.
#
# 쓰는 법: python3 -I scripts/dumping-toon-world.py <AL_D010_11_YYYYMMDD 폴더 · zip · shp>
#   자료 받는 곳: 브이월드 데이터마켓 https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?svcCde=NA&dsId=18 (로그인, 서울 전체 SHP. EPSG:5186 · CP949 · A0~A28)
#   쓰는 필드: A1 UFID · A3 법정동코드(광진 11215*) · A9 주용도 · A11 구조 · A13 사용승인일 · A16 높이 · A24 건물명 · A25 동명 · A26 지상층수
#   동명은 숫자 동만 번호로 싣는다("101동"·"제104동"·"6" → 101·104·6). "주건축물제1동"(필지의 주 건물이라는 뜻)·"가동"·"A동"·"상가동"은 0
#   나무·구 밖 건물은 구 경계가 필요하다. 경계는 data/dumping/map.json 의 ring(복호화된 로컬 자료, `npm run dumping:decrypt`)에서 읽기만 하고 출력에는 넣지 않는다.
#   새 고층 검증(캐시에 없는 것만): 환경변수 ARCHHUB_MCP_URL(건축HUB MCP 서버 주소) + .env.local KAKAO_REST_API_KEY. 없으면 캐시만 쓰고 미검증 후보는 건너뛴다.
# 필요한 도구: ogr2ogr(GDAL 3.8+, PMTiles 드라이버) · pmtiles CLI · tippecanoe. 파이썬은 표준 라이브러리만.
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASEMAP = os.path.join(ROOT, "public", "dumping", "basemap")
DEM = os.path.join(BASEMAP, "dem.pmtiles")
OSM = os.path.join(BASEMAP, "gwangjin.pmtiles")
MAP_JSON = os.path.join(ROOT, "data", "dumping", "map.json")
ENV_LOCAL = os.path.join(ROOT, ".env.local")
LEDGER_CACHE = os.path.join(ROOT, "scripts", "data", "dumping-osm-ledger.json")
OUT_BLD = os.path.join(BASEMAP, "toon-buildings.bin")
OUT_PMTILES = os.path.join(BASEMAP, "buildings.pmtiles")
OUT_CONTEXT = os.path.join(BASEMAP, "context-buildings.pmtiles")
OUT_TREE = os.path.join(BASEMAP, "toon-trees.bin")
OUT_GROUND = os.path.join(BASEMAP, "toon-ground.bin")
GROUND_CELL_M = 25  # 그림자 받이 지면 격자 칸. 받이는 그림자만 보이는 면이라 이 정도면 지형을 따라간다
GROUND_MARGIN_M = 800
CONTEXT_MARGIN_M = 1500  # 구 밖 배경 건물은 경계에서 이만큼까지(조망 지평선 너머는 마스크가 덮는다)

# 모델 원점(components/dumping/icons3d.ts ANCHOR 와 같다). three 좌표: +x 동, +z 남, 단위 m(원점 위도의 메르카토르 축척)
ANCHOR = (127.085, 37.546)
EARTH_R = 6371008.8  # maplibre earthRadius
DEM_Z = 14
TREE_MARGIN_M = 0  # 26라운드 디오라마: 구를 잘라 낸 블록이라 구 안에만 심는다(예전엔 400m 밖까지 심어 탁자 위에 나무가 섰다)

# 건물 유형(toon-buildings.bin 의 유형 바이트 아래 4비트). 정본은 lib/dumping/toon-world.ts BuildingUse.
# 26라운드: VILLA 는 주용도 단독주택 3층 이상(다가구)만, 공동주택 중 아파트가 아닌 것(다세대·연립)은 ROWHOUSE 로 나눴다(모형이 다가구·단독 집만 칠한다)
ANNEX, HOUSE, VILLA, APT, SHOP, OFFICE, SCHOOL, CIVIC, INDUSTRY, ROWHOUSE = range(10)
SHOP_USES = ("판매시설", "숙박시설", "위락시설", "관광휴게시설", "자동차관련시설")
SCHOOL_USES = ("교육연구시설", "노유자시설", "수련시설", "교육연구및복지시설")
CIVIC_USES = ("문화및집회시설", "종교시설", "의료시설", "운동시설", "교정및군사시설")
INDUSTRY_USES = ("공장", "창고시설", "위험물저장및처리시설", "분뇨.쓰레기처리시설", "동.식물 관련시설", "운수시설")
PUBLIC_NAMES = ("구청", "주민센터", "우체국", "경찰", "소방서", "청사")
BRICK_STRUCTS = ("벽돌", "블록", "조적")
# 광진구 법정동 → 건축HUB 법정동코드 뒤 5자리(find_region 실측)
DONG_CODE = {"중곡동": "10100", "능동": "10200", "구의동": "10300", "광장동": "10400", "자양동": "10500", "화양동": "10700", "군자동": "10900"}
NEW_TALL_M = 25  # 이 높이 이상 OSM 건물이 대장 저층 위에 있으면 새 고층 후보
DEFAULT_OSM_H = 9.0  # 높이 없는 OSM 건물(지도 압출 기본값과 같다)


def merc(lng, lat):
    x = (lng + 180) / 360
    y = (1 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi) / 2
    return x, y


AX, AY = merc(*ANCHOR)
M_PER_UNIT = 2 * math.pi * EARTH_R * math.cos(math.radians(ANCHOR[1]))  # 메르카토르 1 단위 = 원점 위도에서 이만큼 m


def local(lng, lat):
    x, y = merc(lng, lat)
    return (x - AX) * M_PER_UNIT, (y - AY) * M_PER_UNIT


def lnglat(x, z):
    lng = (x / M_PER_UNIT + AX) * 360 - 180
    lat = math.degrees(2 * math.atan(math.exp(math.pi * (1 - 2 * (z / M_PER_UNIT + AY)))) - math.pi / 2)
    return lng, lat


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


def bbox(r):
    xs = [q[0] for q in r]
    zs = [q[1] for q in r]
    return min(xs), min(zs), max(xs), max(zs)


def centroid(r):
    return sum(q[0] for q in r) / len(r), sum(q[1] for q in r) / len(r)


def samples(r, step):
    """윤곽 안 격자 표본점(겹침 비율 재기). 너무 작으면 가운데 한 점"""
    x0, z0, x1, z1 = bbox(r)
    pts = []
    x = x0 + step / 2
    while x < x1:
        z = z0 + step / 2
        while z < z1:
            if point_in_ring(x, z, r):
                pts.append((x, z))
            z += step
        x += step
    return pts or [centroid(r)]


def convex_hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


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


# ─── 건물 유형 ───
def use_class(use, floors, name):
    u = use or ""
    nm = name or ""
    if u.startswith("업무") and any(k in nm for k in PUBLIC_NAMES):
        return CIVIC
    if u.startswith("단독") or u == "다가구주택":
        return HOUSE if floors <= 2 else VILLA
    if u.startswith("공동"):
        return APT if floors >= 6 or "아파트" in nm else ROWHOUSE
    if "근린생활" in u or u in SHOP_USES:
        return OFFICE if floors >= 8 else SHOP
    if u in ("업무시설", "방송통신시설"):
        return OFFICE
    if u in SCHOOL_USES:
        return SCHOOL
    if u in CIVIC_USES:
        return CIVIC
    if u in INDUSTRY_USES:
        return INDUSTRY
    return ANNEX if floors <= 2 else ROWHOUSE


def dong_label(name):
    """동명 → 측벽 동 번호(숫자 동만, 1~9999). 없으면 0"""
    m = re.fullmatch(r"제?(\d{1,4})동?", (name or "").strip())
    return int(m.group(1)) if m and int(m.group(1)) > 0 else 0


def decade_of(ymd):
    """사용승인 연대: 0 1960년대 이전 · 1 70 · 2 80 · 3 90 · 4 2000 · 5 2010 · 6 2020 · 7 모름"""
    m = re.match(r"(\d{4})", ymd or "")
    if not m:
        return 7
    y = int(m.group(1))
    if y < 1900 or y > 2100:
        return 7
    return max(0, min(6, (y - 1960) // 10))


def style_byte(use, floors, struct_name, ymd, name):
    brick = 1 if any(k in (struct_name or "") for k in BRICK_STRUCTS) else 0
    return use_class(use, floors, name) | (decade_of(ymd) << 4) | (brick << 7)


# ─── 새 고층 검증: 좌표 → 지번(카카오) → 건축물대장 표제부(건축HUB MCP) ───
def read_env(path):
    out = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fp:
            for line in fp:
                m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
                if m:
                    out[m.group(1)] = m.group(2).strip().strip("\"'")
    return out


class Ledger:
    """검증 캐시. points: "위도,경도" → "동 본번-부번" · parcels: "동 본번-부번" → 대장 건물 목록"""

    def __init__(self, path):
        self.path = path
        self.data = {"points": {}, "parcels": {}}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fp:
                self.data = json.load(fp)
        env = read_env(ENV_LOCAL)
        self.kakao = env.get("KAKAO_REST_API_KEY")
        self.mcp = os.environ.get("ARCHHUB_MCP_URL")
        self.calls = 0

    def save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as fp:
            json.dump(self.data, fp, ensure_ascii=False, indent=1, sort_keys=True)
            fp.write("\n")

    def parcel_at(self, lng, lat):
        key = f"{lat:.5f},{lng:.5f}"
        if key in self.data["points"]:
            return self.data["points"][key]
        if not self.kakao:
            return None
        q = urllib.parse.urlencode({"x": f"{lng:.6f}", "y": f"{lat:.6f}"})
        req = urllib.request.Request(f"https://dapi.kakao.com/v2/local/geo/coord2address.json?{q}", headers={"Authorization": f"KakaoAK {self.kakao}"})
        with urllib.request.urlopen(req, timeout=15) as r:
            docs = json.load(r).get("documents") or []
        a = (docs[0].get("address") or {}) if docs else {}
        dong = a.get("region_3depth_name") or ""
        parcel = None
        if dong in DONG_CODE and a.get("main_address_no") and a.get("mountain_yn") != "Y":
            parcel = f"{dong} {a['main_address_no']}-{a.get('sub_address_no') or '0'}"
        self.data["points"][key] = parcel
        return parcel

    def buildings(self, parcel):
        if parcel in self.data["parcels"]:
            return self.data["parcels"][parcel]
        if not self.mcp:
            return None
        dong, num = parcel.split(" ")
        bun, ji = num.split("-")
        args = {"sigungu_code": "11215", "bdong_code": DONG_CODE[dong], "bun": bun, "max_buildings": 60}
        if ji != "0":
            args["ji"] = ji
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "building_profile", "arguments": args}}).encode()
        req = urllib.request.Request(self.mcp, data=body, headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream"})
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf-8")
        self.calls += 1
        time.sleep(0.25)
        payload = raw.split("data: ", 1)[1] if "data: " in raw else raw
        text = json.loads(payload)["result"]["content"][0]["text"]
        rows = []
        for block in text.split("■ ")[1:]:
            name = block.split("\n", 1)[0].strip()
            use = re.search(r"용도: (\S+)", block)
            st = re.search(r"구조: (\S+)", block)
            fl = re.search(r"지상(\d+)/지하(\d+)층", block)
            hh = re.search(r"높이 ([\d.]+)m", block)
            ap = re.search(r"사용승인 (\d{4}-\d{2}-\d{2})", block)
            rows.append({
                "name": name,
                "use": use.group(1) if use else "",
                "struct": st.group(1) if st else "",
                "floors": int(fl.group(1)) if fl else 0,
                "height": float(hh.group(1)) if hh else 0.0,
                "approved": ap.group(1) if ap else "",
            })
        self.data["parcels"][parcel] = rows
        return rows


def match_ledger(rows, h):
    """OSM 높이 h 와 가장 가까운 대장 건물(높이 ±max(5m, 15%), 높이 미기재면 층수×3.3 ±25%)"""
    best, gap = None, None
    for b in rows:
        if b["height"] > 0:
            d = abs(b["height"] - h)
            ok = d <= max(5.0, 0.15 * h)
        elif b["floors"] > 0:
            d = abs(b["floors"] * 3.3 - h)
            ok = d <= 0.25 * h
        else:
            continue
        if ok and (gap is None or d < gap):
            best, gap = b, d
    return best


def main():
    if len(sys.argv) < 2:
        sys.exit("사용법: python3 -I scripts/dumping-toon-world.py <GIS건물통합정보 폴더·zip·shp>")
    for tool in ("ogr2ogr", "pmtiles", "tippecanoe"):
        if shutil.which(tool) is None:
            sys.exit(f"{tool} 없음(brew install gdal pmtiles tippecanoe)")
    if not os.path.exists(MAP_JSON):
        sys.exit("data/dumping/map.json 없음(나무·구 밖 건물은 구 경계가 필요하다). npm run dumping:decrypt 뒤 다시")
    with open(MAP_JSON, encoding="utf-8") as fp:
        ring_ll = json.load(fp)["ring"]  # [lat, lng]
    gu = [local(lng, lat) for lat, lng in ring_ll]
    work = tempfile.mkdtemp(prefix="dump-toon-")
    try:
        shp = find_shp(sys.argv[1], work)
        dem = Dem(DEM)

        # ─── 건물: 대장(GIS건물통합정보) ───
        layer = os.path.splitext(os.path.basename(shp))[0]
        feats = ogr_geojson(
            shp,
            os.path.join(work, "bld.geojson"),
            [
                "-t_srs", "EPSG:4326",
                "-sql", f'SELECT A1 AS id, A26 AS flr, A16 AS h, A9 AS use, A11 AS st, A13 AS ymd, A24 AS nm, A25 AS dn FROM "{layer}" WHERE A3 LIKE \'11215%\'',
                "--config", "SHAPE_ENCODING", "CP949",
            ],
        )
        blds = []
        for f in feats:
            p = f["properties"]
            for poly in polygons(f["geometry"]):
                ll = poly[0]
                ring = clean_ring([local(lng, lat) for lng, lat in ll])
                if len(ring) < 3 or abs(signed_area(ring)) < 4:
                    continue
                flr = int(p.get("flr") or 0)
                blds.append({
                    "ring": ring, "ll": ll, "id": p.get("id") or "", "flr": flr, "h": float(p.get("h") or 0),
                    "use": p.get("use") or "", "st": p.get("st") or "", "ymd": p.get("ymd") or "", "nm": p.get("nm") or "", "dn": dong_label(p.get("dn")), "src": "nsdi",
                })
        n_nsdi = len(blds)
        print(f"대장 건물 {n_nsdi:,}동")
        idx = Hash(30)
        for k, b in enumerate(blds):
            x0, z0, x1, z1 = bbox(b["ring"])
            idx.add(x0, z0, x1, z1, k)

        def nsdi_at(x, z):
            for k in idx.near(x, z):
                if point_in_ring(x, z, blds[k]["ring"]):
                    return k
            return -1

        def eff_h(b):
            return b["h"] if b["h"] > 0 else max(2, b["flr"]) * 3.2

        # ─── OSM 건물: 구 안은 보강 후보, 구 밖은 배경 ───
        osm_all = ogr_geojson(OSM, os.path.join(work, "osm-bld.geojson"), ["buildings", "-oo", "ZOOM_LEVEL=15", "-t_srs", "EPSG:4326"])
        gx0, gz0, gx1, gz1 = bbox(gu)
        osm_in, context = [], []
        for f in osm_all:
            p = f["properties"]
            if p.get("kind") != "building":
                continue
            for poly in polygons(f["geometry"]):
                ll = poly[0]
                ring = clean_ring([local(lng, lat) for lng, lat in ll])
                if len(ring) < 3 or abs(signed_area(ring)) < 4:
                    continue
                cx, cz = centroid(ring)
                h = float(p.get("height") or 0)
                if point_in_ring(cx, cz, gu):
                    osm_in.append({"ring": ring, "ll": ll, "h": h, "mvt": p.get("mvt_id"), "c": (cx, cz), "layer": float(p.get("layer") or 0)})
                elif gx0 - CONTEXT_MARGIN_M <= cx <= gx1 + CONTEXT_MARGIN_M and gz0 - CONTEXT_MARGIN_M <= cz <= gz1 + CONTEXT_MARGIN_M:
                    if any(seg_dist(cx, cz, gu[i - 1], gu[i]) < CONTEXT_MARGIN_M for i in range(len(gu))):
                        context.append({"ll": ll, "h": h, "b": float(p.get("min_height") or 0)})

        # 타일 경계 조각 합치기: 같은 OSM id 조각들의 볼록 껍질이 넓이 합의 1.08배 안이면 껍질 하나로(직사각 고층이 두 프리즘으로 갈려 지붕에 이음매·옥탑 중복이 생겼다)
        by_mvt = {}
        for o in osm_in:
            by_mvt.setdefault(o["mvt"], []).append(o)
        merged = []
        for mvt, parts in by_mvt.items():
            if mvt is None or len(parts) < 2:
                merged.extend(parts)
                continue
            hull = convex_hull([q for o in parts for q in o["ring"]])
            if len(hull) >= 3 and abs(signed_area(hull)) <= 1.08 * sum(abs(signed_area(o["ring"])) for o in parts):
                ll = [lnglat(x, z) for x, z in hull]
                merged.append({**parts[0], "ring": hull, "ll": ll + [ll[0]], "h": max(o["h"] for o in parts), "c": centroid(hull)})
            else:
                merged.extend(parts)
        print(f"OSM 구 안 {len(osm_in):,}조각 → {len(merged):,}동(타일 경계 조각 합침)")
        osm_in = merged

        ledger = Ledger(LEDGER_CACHE)
        added, drop, filled, rejected = [], set(), 0, []
        by_parcel = {}
        for o in osm_in:
            pts = samples(o["ring"], 2.0)
            hits = {}
            for x, z in pts:
                k = nsdi_at(x, z)
                if k >= 0:
                    hits[k] = hits.get(k, 0) + 1
            cov = sum(hits.values()) / len(pts)
            h = o["h"]
            if h >= NEW_TALL_M and all(eff_h(blds[k]) < 0.5 * h for k in hits):
                lng, lat = lnglat(*o["c"])
                try:
                    parcel = ledger.parcel_at(lng, lat)
                    rows = ledger.buildings(parcel) if parcel else None
                except Exception as e:  # 네트워크 실패는 이번 실행에서 미검증으로
                    print(f"  검증 실패 {lat:.5f},{lng:.5f}: {e}")
                    parcel, rows = None, None
                hit = match_ledger(rows, h) if rows else None
                if not hit:
                    rejected.append((round(h), f"{lat:.5f},{lng:.5f}", parcel or "지번 없음", "대장 없음" if rows is None else f"대장 {len(rows)}동 높이 불일치"))
                    continue
                for k, cnt in hits.items():
                    inner = samples(blds[k]["ring"], 1.5)
                    if sum(1 for x, z in inner if point_in_ring(x, z, o["ring"])) / len(inner) >= 0.3:
                        drop.add(k)
                b = {
                    "ring": o["ring"], "ll": o["ll"], "id": f"OSM{o['mvt']}", "flr": hit["floors"], "h": hit["height"] or h,
                    "use": hit["use"], "st": hit["struct"], "ymd": hit["approved"], "nm": hit["name"], "src": "osm", "tall": True,
                }
                added.append(b)
                by_parcel.setdefault(parcel, []).append(b)
            elif cov < 0.1 and abs(signed_area(o["ring"])) >= 150 and h < NEW_TALL_M and o["layer"] == 0:
                b = {"ring": o["ring"], "ll": o["ll"], "id": f"OSM{o['mvt']}", "flr": 0, "h": h or DEFAULT_OSM_H, "use": "", "st": "", "ymd": "", "nm": "", "src": "osm"}
                # 높이는 OSM(없으면 9m), 유형은 그 필지 대장의 가장 높은 동을 빌린다(구청 옆 보건소 동처럼 단지 안 저층부)
                try:
                    parcel = ledger.parcel_at(*lnglat(*o["c"]))
                    rows = ledger.buildings(parcel) if parcel else None
                except Exception as e:
                    print(f"  저층 지번 조회 실패: {e}")
                    rows = None
                if rows:
                    main_row = max(rows, key=lambda r: r["height"])
                    b.update(use=main_row["use"], st=main_row["struct"], ymd=main_row["approved"], nm=main_row["name"])
                added.append(b)
            elif h > 0 and o["layer"] == 0:
                # 대장에 높이·층수가 없는 건물(placeholder)은 덮는 OSM 높이를 빌린다(고가·지하 구조물 높이는 빌리지 않는다)
                for k, cnt in hits.items():
                    b = blds[k]
                    if b["h"] <= 0 and b["flr"] <= 0 and cnt / len(pts) > 0.3 and h > b.get("h_fill", 0):
                        b["h_fill"] = h
        # 새 고층 80m 안 대장 건물: 지금 지번이 그 새 건물 필지인데 그 필지 대장에 맞는 동이 없으면 철거된 것으로 본다
        # (자양동 870 실측: 동부지방법원·검찰청 일부가 구청 옆·탑 사이에 남아 있었다. 건국대처럼 옛 건물이 대장에 그대로인 필지는 남는다)
        near_new = Hash(40)
        for b in added:
            if b.get("tall"):
                x0, z0, x1, z1 = bbox(b["ring"])
                near_new.add(x0 - 80, z0 - 80, x1 + 80, z1 + 80, 1)

        def same_building(b, row):
            if b["flr"] <= 0 and b["h"] <= 0:
                return False
            # 사용승인 연도가 3년 넘게 다르면 다른 건물(자양동 870 실측: 1972년 2층 구치감이 2025년 1층 저층부와 층·높이로는 맞았다)
            y0, y1 = re.match(r"(\d{4})", b["ymd"] or ""), re.match(r"(\d{4})", row["approved"] or "")
            if y0 and y1 and abs(int(y0.group(1)) - int(y1.group(1))) > 3:
                return False
            if b["flr"] > 0 and row["floors"] > 0 and abs(b["flr"] - row["floors"]) > 1:
                return False
            return b["h"] <= 0 or row["height"] <= 0 or abs(b["h"] - row["height"]) <= max(3.0, 0.25 * row["height"])

        for k, b in enumerate(blds):
            if k in drop:
                continue
            cx, cz = centroid(b["ring"])
            if not near_new.near(cx, cz):
                continue
            lng, lat = lnglat(cx, cz)
            try:
                parcel = ledger.parcel_at(lng, lat)
            except Exception as e:
                print(f"  지번 조회 실패 {lat:.5f},{lng:.5f}: {e}")
                continue
            if parcel in by_parcel and not any(same_building(b, row) for row in ledger.data["parcels"][parcel]):
                drop.add(k)
        ledger.save()
        for b in blds:
            if b.get("h_fill"):
                b["h"] = b.pop("h_fill")
                filled += 1
        blds = [b for k, b in enumerate(blds) if k not in drop] + added
        n_tall = sum(1 for b in added if b.get("tall"))
        print(f"OSM 보강: 새 고층 {n_tall}동(대장 대조) · 대장에 없는 저층 {len(added) - n_tall}동 · 낡은 대장 건물 {len(drop)}동 제외 · 높이 빌림 {filled}동 · 대장 호출 {ledger.calls}회")
        for r in sorted(rejected, key=lambda t: -t[0])[:20]:
            print(f"  넣지 않음 {r[0]}m {r[1]} {r[2]} ({r[3]})")
        if len(rejected) > 20:
            print(f"  … 외 {len(rejected) - 20}건")

        for b in blds:
            lls = [(lng, lat) for lng, lat in b["ll"][:-1]] or b["ll"]
            step = max(1, len(lls) // 8)
            g = [dem.elevation(*lls[i]) for i in range(0, len(lls), step)]
            clng = sum(q[0] for q in lls) / len(lls)
            clat = sum(q[1] for q in lls) / len(lls)
            b["gmin"] = min(g)
            b["gc"] = dem.elevation(clng, clat)
            # 용도 모르는 OSM 보강(필지 대장도 없음)은 부속동 유형: 층수로 짐작하면 9m 기본값이 3층 빌라 창 무늬가 됐다
            unknown_osm = b["src"] == "osm" and not b["use"]
            b["style"] = style_byte(b["use"], 0 if unknown_osm else b["flr"] or (round(b["h"] / 3.2) if b["h"] else 0), b["st"], b["ymd"], b["nm"])
        # 512m 덩어리 순으로(런타임 덩어리 나누기와 같은 순서라 메모리 접근이 모인다)
        blds.sort(key=lambda b: (math.floor(b["ring"][0][1] / 512), math.floor(b["ring"][0][0] / 512)))
        out = bytearray(b"TNB3")
        out += struct.pack("<Idd", len(blds), *ANCHOR)
        nverts = 0
        for b in blds:
            r = [(round(x * 10), round(z * 10)) for x, z in b["ring"]]
            out += struct.pack("<HBBHhhHii", len(r), min(255, max(0, b["flr"])), b["style"], min(65535, round(b["h"] * 10)), round(b["gmin"] * 10), round(b["gc"] * 10), b.get("dn", 0), r[0][0], r[0][1])
            for k in range(1, len(r)):
                out += struct.pack("<hh", r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1])
            nverts += len(r)
        with open(OUT_BLD, "wb") as fp:
            fp.write(out)
        uses = {}
        for b in blds:
            uses[b["style"] & 15] = uses.get(b["style"] & 15, 0) + 1
        print(f"건물 {len(blds):,}동 · 꼭짓점 {nverts:,} · {len(out) / 1024:.0f}KB → {os.path.relpath(OUT_BLD, ROOT)}")
        print("  유형 " + " · ".join(f"{['기타', '단독', '다가구', '아파트', '상가', '업무', '학교', '공공', '공장', '다세대·연립'][k]} {v:,}" for k, v in sorted(uses.items())))

        # ─── 도면 보기 건물 타일(같은 건물 집합). 속성은 지도 압출 식이 쓰는 층수·높이·UFID 만 ───
        def write_fc(path, items):
            with open(path, "w", encoding="utf-8") as fp:
                json.dump({"type": "FeatureCollection", "features": items}, fp, ensure_ascii=False)

        bld_fc = os.path.join(work, "merged.geojson")
        write_fc(bld_fc, [{"type": "Feature", "properties": {"id": b["id"], "flr": b["flr"], "h": round(b["h"], 2)}, "geometry": {"type": "Polygon", "coordinates": [b["ll"]]}} for b in blds])
        subprocess.run(["tippecanoe", "-o", OUT_PMTILES, "--force", "-q", "-l", "buildings", "-Z", "13", "-z", "16", "--no-feature-limit", "--no-tile-size-limit", "--detect-shared-borders", "--simplification=4", bld_fc], check=True)
        print(f"도면 건물 타일 {os.path.getsize(OUT_PMTILES) / 1024 / 1024:.1f}MB → {os.path.relpath(OUT_PMTILES, ROOT)}")
        ctx_fc = os.path.join(work, "context.geojson")
        write_fc(ctx_fc, [{"type": "Feature", "properties": {"h": round(c["h"] or DEFAULT_OSM_H, 1), "b": round(c["b"], 1)}, "geometry": {"type": "Polygon", "coordinates": [c["ll"]]}} for c in context])
        subprocess.run(["tippecanoe", "-o", OUT_CONTEXT, "--force", "-q", "-l", "buildings", "-Z", "12", "-z", "15", "--no-feature-limit", "--no-tile-size-limit", "--simplification=6", ctx_fc], check=True)
        print(f"구 밖 배경 건물 {len(context):,}동 · {os.path.getsize(OUT_CONTEXT) / 1024 / 1024:.1f}MB → {os.path.relpath(OUT_CONTEXT, ROOT)}")

        # ─── 나무 ───
        GX0, GZ0 = gx0 - TREE_MARGIN_M, gz0 - TREE_MARGIN_M
        GX1, GZ1 = gx1 + TREE_MARGIN_M, gz1 + TREE_MARGIN_M

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
                        lng, lat = lnglat(x, z)
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
                lng, lat = lnglat(x0 + i * GROUND_CELL_M, z0 + j * GROUND_CELL_M)
                out += struct.pack("<h", round(dem.elevation(lng, lat) * 10))
        with open(OUT_GROUND, "wb") as fp:
            fp.write(out)
        print(f"지면 격자 {nx}×{nz}({GROUND_CELL_M}m) · {len(out) / 1024:.0f}KB → {os.path.relpath(OUT_GROUND, ROOT)}")
        print(f"DEM z{DEM_Z} 타일 {sum(1 for v in dem.tiles.values() if v)}장")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
