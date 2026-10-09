"""/dumping 모형 건물 위성 색(25라운드, 2026-10-10 사용자: "건물색 거의 지금 비슷한데 이것도 좀 현실감 있게").

브이월드 위성영상(WMTS Satellite z18, 화소 약 0.47m)에서 동마다 지붕색·외벽색·박공 여부를 뽑아 toon-buildings.bin 과 같은 순서로 담는다.
영상은 정사영상이라 높은 건물은 지붕이 촬영 중심 반대쪽으로 높이에 비례해 밀려 찍힌다(광장동 아파트 실측: 높이의 0.2배 북쪽).
 1. 밀림 추정: 높이 14m 이상 동마다 윤곽을 (높이 × 밀림률)만큼 옮겨 가며 윤곽선 위 밝기 경사(법선 방향)가 가장 센 곳을 찾는다(밀림률 ±0.5, 0.04 → 0.01 간격)
 2. 밀림 지도: 동마다 반경 350m(모자라면 900m) 안 추정값의 가중 중앙값. 높은 동은 자기 추정이 지도와 0.08 안이면 자기 값
 3. 지붕: 윤곽 + 높이 × 밀림률 자리(안쪽 1~2화소 깎음)의 그늘·반사 뺀 화소에서 가장 많은 색 묶음(13단계 색 상자)의 평균
    외벽: 밀림이 2.5m 넘고 보이는 벽(촬영 중심 쪽, 해 드는 남쪽)이면 바닥 윤곽과 밀린 지붕 사이 띠(나무 초록·그늘 뺌). 나머지는 사진에 벽이 안 보여 비운다
    (지붕 테두리 띠는 벽돌조도 붉은 띠가 4%뿐이라 외벽 근거가 못 된다: 실측 후 뺐다)
 4. 박공: 1~2층 직사각에 가까운 동(toon-geom roofPlan 의 꼴 조건)만. 긴 축으로 지붕을 반 갈라 두 쪽 밝기 차가 16% 넘고 초록 방수 도장이 아니면 박공
결과는 색 숫자뿐이고 영상은 저장소에 넣지 않는다(내려받은 타일은 ~/.cache/gjdong/vworld-sat 에만). 화면 출처에 "건물 색 브이월드 영상"을 적는다.

toon-sat.bin "TNS1" · u32 동 수 · u32 toon-buildings.bin 의 CRC32(다르면 런타임이 버린다), 이어서 동마다 8바이트
  u8×3 지붕 sRGB · u8×3 외벽 sRGB · u8 표시(1 지붕 · 2 외벽 · 8 박공 판정 있음 · 16 박공) · u8 지붕 확신(0~255)
쓰는 법: VWORLD_KEY=... python3 scripts/dumping-toon-sat.py   (키가 없으면 .env.local 의 VWORLD_KEY. 캐시가 다 있으면 키 없이도 돈다)
필요: numpy · scipy · Pillow
"""
import concurrent.futures as cf
import io
import math
import os
import re
import struct
import sys
import time
import urllib.request
import zlib

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage, spatial

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASEMAP = os.path.join(ROOT, "public", "dumping", "basemap")
BLD = os.path.join(BASEMAP, "toon-buildings.bin")
OUT = os.path.join(BASEMAP, "toon-sat.bin")
CACHE = os.path.expanduser("~/.cache/gjdong/vworld-sat")
URL = "https://api.vworld.kr/req/wmts/1.0.0/{key}/Satellite/{z}/{y}/{x}.jpeg"
Z = 18
ANCHOR = (127.085, 37.546)  # toon-world.ts TOON_ANCHOR
EARTH_R = 6371008.8
CHUNK_M = 512
MARGIN_M = 70  # 밀린 지붕(높이 100m × 0.5)이 덩어리 밖으로 나가도 영상 안에 들게
STOREY_M = 3.2
LEAN_MIN_H = 14.0
LEAN_R_M = (350.0, 900.0)
FACADE_MIN_M = 2.5

M_PER_UNIT = 2 * math.pi * EARTH_R * math.cos(math.radians(ANCHOR[1]))
N = 2**Z * 256
MPP = M_PER_UNIT / N  # 화소 하나(m)


def merc(lng, lat):
    return (lng + 180) / 360, (1 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi) / 2


AX, AY = merc(*ANCHOR)


def decode(buf):
    tag = buf[:4]
    assert tag in (b"TNB2", b"TNB3"), tag
    head = 20 if tag == b"TNB3" else 18
    (count,) = struct.unpack_from("<I", buf, 4)
    o, out = 24, []
    for _ in range(count):
        n, flr, style, h = struct.unpack_from("<HBBH", buf, o)
        x, z = struct.unpack_from("<ii", buf, o + head - 8)
        o += head
        ring = [(x / 10, z / 10)]
        for _ in range(n - 1):
            dx, dz = struct.unpack_from("<hh", buf, o)
            o += 4
            x += dx
            z += dz
            ring.append((x / 10, z / 10))
        r = np.array(ring, dtype=np.float64)
        a = 0.5 * np.sum(r[:, 0] * np.roll(r[:, 1], -1) - np.roll(r[:, 0], -1) * r[:, 1])
        if a < 0:
            r = r[::-1].copy()
        out.append({"ring": r, "flr": flr, "style": style, "h": h / 10 if h else max(2, flr) * STOREY_M, "area": abs(a)})
    assert o == len(buf)
    return out


def read_key():
    k = os.environ.get("VWORLD_KEY")
    if k:
        return k
    env = os.path.join(ROOT, ".env.local")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            m = re.match(r"\s*VWORLD_KEY\s*=\s*(.*)\s*$", line)
            if m:
                return m.group(1).strip().strip("\"'")
    return None


KEY = read_key()
fetched = 0


def tile(x, y):
    global fetched
    p = os.path.join(CACHE, str(Z), str(x), f"{y}.jpg")
    if not os.path.exists(p):
        if not KEY:
            raise SystemExit("VWORLD_KEY 없음(캐시에 없는 타일을 받아야 한다)")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        req = urllib.request.Request(URL.format(key=KEY, z=Z, x=x, y=y), headers={"User-Agent": "gjdong-dumping-sat"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = r.read()
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 + attempt * 3)
        if data[:2] != b"\xff\xd8":
            return None  # 영상 없는 칸(한강 일부 등)
        with open(p + ".part", "wb") as f:
            f.write(data)
        os.replace(p + ".part", p)
        fetched += 1
    return np.asarray(Image.open(p).convert("RGB"))


class Mosaic:
    """덩어리 하나를 덮는 영상. 로컬 m ↔ 화소는 선형(원점 위도 메르카토르 축척)"""

    def __init__(self, x0, z0, x1, z1):
        mx0, my0 = x0 / M_PER_UNIT + AX, z0 / M_PER_UNIT + AY
        mx1, my1 = x1 / M_PER_UNIT + AX, z1 / M_PER_UNIT + AY
        n = 2**Z
        self.tx0, self.ty0 = int(mx0 * n), int(my0 * n)
        tx1, ty1 = int(mx1 * n), int(my1 * n)
        jobs = [(x, y) for x in range(self.tx0, tx1 + 1) for y in range(self.ty0, ty1 + 1)]
        with cf.ThreadPoolExecutor(6) as ex:
            tiles = dict(zip(jobs, ex.map(lambda t: tile(*t), jobs)))
        self.img = np.zeros(((ty1 - self.ty0 + 1) * 256, (tx1 - self.tx0 + 1) * 256, 3), np.uint8)
        self.have = np.zeros(self.img.shape[:2], bool)
        for (x, y), im in tiles.items():
            if im is not None:
                sl = (slice((y - self.ty0) * 256, (y - self.ty0 + 1) * 256), slice((x - self.tx0) * 256, (x - self.tx0 + 1) * 256))
                self.img[sl] = im
                self.have[sl] = True
        self.lum = self.img.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
        self.ox = AX * N - self.tx0 * 256
        self.oy = AY * N - self.ty0 * 256
        self._grad = None

    def px(self, xz):
        return np.stack([xz[..., 0] / MPP + self.ox, xz[..., 1] / MPP + self.oy], axis=-1)

    def grad(self):
        if self._grad is None:
            s = ndimage.gaussian_filter(self.lum, 0.8)
            self._grad = (ndimage.sobel(s, 1), ndimage.sobel(s, 0))
        return self._grad


def outline(ring, step=0.5):
    pts, nrm = [], []
    for k in range(len(ring)):
        a, b = ring[k], ring[(k + 1) % len(ring)]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if d < 1e-6:
            continue
        m = max(1, int(d / step))
        u = (b - a) / d
        f = (np.arange(m) + 0.5) / m
        pts.append(a + (b - a) * f[:, None])
        nrm.append(np.repeat([[u[1], -u[0]]], m, axis=0))
    return np.concatenate(pts), np.concatenate(nrm)


def lean_search(mos, ring, h):
    """윤곽을 옮겨 가며 법선 방향 밝기 경사가 가장 센 밀림률. (lx, lz, 세기, 두드러짐)"""
    gx, gy = mos.grad()
    hgt, wid = gx.shape
    pts, nrm = outline(ring)

    def score(cands):
        P = mos.px(pts[None, :, :] + cands[:, None, :] * h)
        xi = np.clip(P[..., 0].astype(np.int32), 0, wid - 1)
        yi = np.clip(P[..., 1].astype(np.int32), 0, hgt - 1)
        g = gx[yi, xi] * nrm[None, :, 0] + gy[yi, xi] * nrm[None, :, 1]
        return np.abs(g).mean(axis=1)

    grid = np.arange(-0.5, 0.5001, 0.04)
    cands = np.array([(a, b) for a in grid for b in grid])
    s = score(cands)
    k = int(np.argmax(s))
    fine = np.arange(-0.04, 0.0401, 0.01)
    c2 = np.array([(cands[k, 0] + a, cands[k, 1] + b) for a in fine for b in fine])
    s2 = score(c2)
    k2 = int(np.argmax(s2))
    return c2[k2, 0], c2[k2, 1], float(s2[k2]), float(s2[k2] / max(1e-6, np.median(s)))


class Window:
    """한 동 둘레 화소 창. 다각형(로컬 m)을 창 격자에 0/1 로 깐다"""

    def __init__(self, mos, xz, pad=3):
        p = mos.px(xz)
        hgt, wid = mos.lum.shape
        self.x0 = max(0, int(math.floor(p[:, 0].min())) - pad)
        self.y0 = max(0, int(math.floor(p[:, 1].min())) - pad)
        self.x1 = min(wid, int(math.ceil(p[:, 0].max())) + pad)
        self.y1 = min(hgt, int(math.ceil(p[:, 1].max())) + pad)
        self.ok = self.x1 - self.x0 >= 3 and self.y1 - self.y0 >= 3
        self.sl = (slice(self.y0, self.y1), slice(self.x0, self.x1))
        self.mos = mos

    def mask(self, polys):
        im = Image.new("L", (self.x1 - self.x0, self.y1 - self.y0), 0)
        dr = ImageDraw.Draw(im)
        for xz in polys:
            p = self.mos.px(xz)
            dr.polygon([(float(a - self.x0), float(b - self.y0)) for a, b in p], fill=1)
        return np.asarray(im, bool)


def dominant(pix):
    """가장 많은 색 묶음(13단계 색 상자, 이웃 상자까지)의 평균과 그 비율"""
    if len(pix) < 8:
        return None, 0.0
    q = np.minimum(pix // 20, 12).astype(np.int32)
    hist = np.bincount(q[:, 0] * 169 + q[:, 1] * 13 + q[:, 2], minlength=13**3).reshape(13, 13, 13).astype(np.float64)
    b = np.unravel_index(np.argmax(ndimage.uniform_filter(hist, 3, mode="constant")), hist.shape)
    near = (np.abs(q[:, 0] - b[0]) <= 1) & (np.abs(q[:, 1] - b[1]) <= 1) & (np.abs(q[:, 2] - b[2]) <= 1)
    return pix[near].mean(axis=0), float(near.mean())


def hsv(c):
    r, g, b = (v / 255 for v in c)
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d < 1e-6:
        h = 0.0
    elif mx == r:
        h = 60 * (((g - b) / d) % 6)
    elif mx == g:
        h = 60 * ((b - r) / d + 2)
    else:
        h = 60 * ((r - g) / d + 4)
    return h, (d / mx if mx > 0 else 0.0), mx


def green_paint(c):
    h, s, _ = hsv(c)
    return 115 <= h <= 195 and s > 0.16


def min_rect(r):
    """toon-geom minRect 와 같은 규칙: 변 방향 후보 중 넓이 최소. (가운데, 긴 축 u, 긴 반길이, 짧은 반길이)"""
    best = None
    for k in range(len(r)):
        d = r[(k + 1) % len(r)] - r[k]
        ln = math.hypot(*d)
        if ln < 1e-6:
            continue
        u = d / ln
        a = r @ u
        b = r @ np.array([-u[1], u[0]])
        area = (a.max() - a.min()) * (b.max() - b.min())
        if best is None or area < best[0]:
            ca, cb = (a.max() + a.min()) / 2, (b.max() + b.min()) / 2
            c = ca * u + cb * np.array([-u[1], u[0]])
            la, lb = (a.max() - a.min()) / 2, (b.max() - b.min()) / 2
            best = (area, c, u, la, lb) if la >= lb else (area, c, np.array([-u[1], u[0]]), lb, la)
    return best[1:]


def gable_shape(b):
    """toon-geom roofPlan 의 박공 꼴 조건(층수·짧은 변·장단비·직사각 정도)"""
    # 반올림은 JS Math.round 와 같게(파이썬 round 는 2.5 → 2 라 높이 8m 미기재 동이 2층·3층으로 갈렸다)
    flr = b["flr"] if b["flr"] > 0 else max(1, math.floor(b["h"] / STOREY_M + 0.5))
    c, u, lo, sh = min_rect(b["ring"])
    return flr <= 2 and 2.5 <= sh * 2 <= 11 and lo / max(sh, 0.1) <= 4 and b["area"] / (lo * sh * 4) > 0.82, (c, u)


def sample(mos, b, lean):
    """한 동의 지붕·외벽·박공. 못 구한 것은 None"""
    h = b["h"]
    off = np.array(lean) * h
    roof = b["ring"] + off
    res = {"roof": None, "conf": 0.0, "wall": None, "wall_src": 0, "pitched": None}
    win = Window(mos, np.concatenate([b["ring"], roof]))
    if not win.ok:
        return res
    m = win.mask([roof])
    have = mos.have[win.sl]
    if not m.any() or not have[m].all():
        return res
    img, lum = mos.img[win.sl], mos.lum[win.sl]
    core = ndimage.binary_erosion(m, iterations=2 if m.sum() > 900 else 1)
    if core.sum() < 8:
        core = m
    ok = core & (lum > 50) & (lum < 248)
    roof_c, conf = dominant(img[ok].astype(np.float32))
    if roof_c is None:
        return res
    res["roof"], res["conf"] = roof_c, conf
    # 외벽 띠: 밀림이 충분하고 보이는 벽(밀림 반대쪽을 보는 변)이 해 드는 남쪽(+z)을 보면
    shift = float(np.hypot(*off))
    if shift >= FACADE_MIN_M:
        ld = off / shift
        r = b["ring"]
        quads, nz = [], 0.0
        for k in range(len(r)):
            a, c = r[k], r[(k + 1) % len(r)]
            d = c - a
            ln = math.hypot(*d)
            if ln < 3:
                continue
            n = np.array([d[1], -d[0]]) / ln
            if n @ -ld > 0.35:
                quads.append(np.array([a, c, c + off, a + off]))
                nz += n[1] * ln
        if quads and nz > 0:
            fm = win.mask(quads) & ~ndimage.binary_dilation(m, iterations=1) & have
            pix = img[fm].astype(np.float32)
            lf = lum[fm]
            keep = (lf > 45) & (lf < 248) & ~((pix[:, 1] > pix[:, 0] * 1.08) & (pix[:, 1] > pix[:, 2] * 1.04))
            if keep.sum() >= 30:
                wc, wconf = dominant(pix[keep])
                if wc is not None and wconf > 0.25:
                    res["wall"], res["wall_src"] = wc, 2
    # 박공: 꼴이 되는 1~2층만. 긴 축으로 반 갈라 두 쪽 밝기 차
    shape, (c, u) = gable_shape(b)
    if shape:
        ys, xs = np.nonzero(core & (lum > 30))
        if len(xs) >= 12:
            p = np.stack([xs + win.x0, ys + win.y0], axis=-1).astype(np.float64)
            cp = mos.px((c + off)[None, :])[0]
            side = (p - cp) @ np.array([-u[1], u[0]])
            l = lum[ys, xs]
            a, bb = l[side > 0.6], l[side < -0.6]
            if len(a) >= 5 and len(bb) >= 5:
                contrast = abs(a.mean() - bb.mean()) / max(1.0, (a.mean() + bb.mean()) / 2)
                res["pitched"] = bool(contrast > 0.16 and not green_paint(roof_c))
    return res


def main():
    with open(BLD, "rb") as f:
        raw = f.read()
    crc = zlib.crc32(raw) & 0xFFFFFFFF
    bs = decode(raw)
    print(f"건물 {len(bs):,}동 · CRC32 {crc:08x}")
    cen = np.array([b["ring"].mean(axis=0) for b in bs])
    groups = {}
    for i, c in enumerate(cen):
        groups.setdefault((math.floor(c[0] / CHUNK_M), math.floor(c[1] / CHUNK_M)), []).append(i)

    def chunk_mosaic(ids):
        lo = np.min([bs[i]["ring"].min(axis=0) for i in ids], axis=0) - MARGIN_M
        hi = np.max([bs[i]["ring"].max(axis=0) for i in ids], axis=0) + MARGIN_M
        return Mosaic(lo[0], lo[1], hi[0], hi[1])

    t0 = time.time()
    leans = {}
    for gi, (key, ids) in enumerate(sorted(groups.items())):
        tall = [i for i in ids if bs[i]["h"] >= LEAN_MIN_H and len(bs[i]["ring"]) >= 3]
        if not tall:
            continue
        mos = chunk_mosaic(ids)
        for i in tall:
            lx, lz, s, prom = lean_search(mos, bs[i]["ring"], bs[i]["h"])
            leans[i] = (lx, lz, s, prom)
        print(f"  밀림 {gi + 1}/{len(groups)} 덩어리 · 높은 동 {len(tall)} · 받은 타일 {fetched} · {time.time() - t0:.0f}s")
    idx = np.array(sorted(leans))
    val = np.array([leans[i] for i in idx])
    w = np.clip(val[:, 3] - 1.0, 0.05, 2.0)
    tree = spatial.cKDTree(cen[idx])
    print(f"밀림 추정 {len(idx):,}동 · 밀림률 중앙값 ({np.median(val[:, 0]):+.3f}, {np.median(val[:, 1]):+.3f})")

    def wmedian(v, wt):
        o = np.argsort(v)
        c = np.cumsum(wt[o])
        return float(v[o][np.searchsorted(c, c[-1] / 2)])

    field = np.zeros((len(bs), 2))
    for i, c in enumerate(cen):
        for r in LEAN_R_M:
            near = tree.query_ball_point(c, r)
            if len(near) >= 3:
                field[i] = (wmedian(val[near, 0], w[near]), wmedian(val[near, 1], w[near]))
                break
        own = leans.get(i)
        if own and math.hypot(own[0] - field[i, 0], own[1] - field[i, 1]) <= 0.08:
            field[i] = own[:2]

    out = bytearray(b"TNS1")
    out += struct.pack("<II", len(bs), crc)
    rec = np.zeros((len(bs), 8), np.uint8)
    n_roof = n_wall = n_pitch_known = n_pitch = 0
    for gi, (key, ids) in enumerate(sorted(groups.items())):
        mos = chunk_mosaic(ids)
        for i in ids:
            r = sample(mos, bs[i], field[i])
            flags = 0
            if r["roof"] is not None:
                rec[i, 0:3] = np.clip(np.round(r["roof"]), 0, 255)
                rec[i, 7] = min(255, round(r["conf"] * 255))
                flags |= 1
                n_roof += 1
            if r["wall"] is not None:
                rec[i, 3:6] = np.clip(np.round(r["wall"]), 0, 255)
                flags |= r["wall_src"]
                n_wall += 1
            if r["pitched"] is not None:
                flags |= 8 | (16 if r["pitched"] else 0)
                n_pitch_known += 1
                n_pitch += bool(r["pitched"])
            rec[i, 6] = flags
        if (gi + 1) % 10 == 0:
            print(f"  색 {gi + 1}/{len(groups)} 덩어리 · {time.time() - t0:.0f}s")
    out += rec.tobytes()
    with open(OUT, "wb") as f:
        f.write(out)
    n = len(bs)
    print(f"지붕 {n_roof:,}/{n:,} · 외벽 {n_wall:,} · 박공 {n_pitch:,}/{n_pitch_known:,}(판정한 꼴) · 받은 타일 {fetched}")
    print(f"→ {os.path.relpath(OUT, ROOT)} ({len(out) / 1024:.0f}KB) · {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
