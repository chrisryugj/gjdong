# /dumping 모형 보기 광진구청 신청사(26라운드 후속, 2026-10-10 사용자: "구청 렌더 제대로 해볼래" + 사진 2장).
#   blender -b --factory-startup --python scripts/blender/dumping_gucheong.py -- [--out public/dumping/models] [--preview 폴더]
# 지금까지는 건물통합정보에 없어 OSM 발자국 하나(구의회 저층부까지 한 덩어리)를 대장 높이 82.3m 로 통째로 세웠다. 이 모델로 바꾼다.
# 근거(공개 자료만):
#  · 건축물대장(자양동 870 광진구청, 건축HUB): 지상 18층 82.3m, 건축면적 약 3,500㎡(건폐율 6.34% × 대지 55,320.8㎡), 탑 층면적 약 1,235㎡, 3층 3,149㎡
#  · OSM 발자국 way 1436896184(구청사, 저층부 포함)·1436896185(광진구보건소). 축은 정북에서 21.4°(긴 변)·111.2°
#  · 브이월드 위성 z19(지붕: 탑 태양광, 구의회 흰 지붕, 보건소 남쪽 루버 날개. 높은 동은 남쪽으로 높이 × 0.29 밀려 찍혀 대조해 맞춤)
#  · 사용자 사진(서쪽에서 본 정면): 탑은 2개 층마다 가로 보·세로 창 약 20칸 흰 격자 + 두꺼운 왕관 띠 간판, 남북 옆면은 층마다 비스듬한 차양,
#    정면 남쪽 절반 아래는 녹색 유리 커튼월 입구, 구의회는 모서리 둥근 흰 띠 5단 + 남쪽 사다리 버팀대, 보건소는 흰 띠 4단 + 남쪽 끝 루버 날개, 뒤편 옥상 정원
# 좌표: 블렌더 X = u(건물 축 방위 111.2°, 대략 동), Y = v(방위 21.4°, 대략 북), Z = 위(m). 원점 = (127.08770, 37.53625) 땅.
# 런타임(components/dumping/toon-landmark.ts)이 그 점에 놓고 세로축으로 −21.15° 돌린다(glTF +y 위, −Y → +z). 재질 이름이 역할이고 색은 런타임이 다시 칠한다.
# 간판 판(sign_*)만 UV 를 쓴다: 글자는 런타임 캔버스(광진구 표장은 쓰지 않는다).
# 재질 이름 뒤 "@c"(구의회)·"@h"(보건소)는 부분 표시다: 지형 자료의 부지 땅이 고르지 않아(구의회 쪽이 낮고 보건소 쪽이 높다) 런타임이 부분마다 제 땅높이에 앉힌다
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

sys.dont_write_bytecode = True  # 레포에 __pycache__ 를 남기지 않는다
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dumping_assets as A  # noqa: E402  reset·material·link·join_by_material·OUT·PREVIEW

PAL = {
    "frame": "#f2f1ec",
    "glass": "#28323b",
    "curtain": "#2f4b4b",
    "membrane": "#f6f5f1",
    "roof": "#cfccc4",
    "solar": "#2d3b52",
    "green": "#7fa05f",
    "leaf": "#5d8a4a",
    "trunk": "#6e5a48",
    "mech": "#b9b7b0",
    "sign_gc": "#ffffff",
    "sign_council": "#ffffff",
    "sign_health": "#ffffff",
}
BURY = -9.0  # 땅에 닿는 덩어리는 여기까지 묻는다. 지형 자료의 부지 땅이 고르지 않아(구의회 서쪽이 탑보다 과장 뒤 4.8m 낮다) 틈이 안 보이게

# 발자국(u, v, m). 탑 34 × 36.5(1,237㎡, 대장 탑 층면적 1,235㎡와 같다)
TU0, TU1, TV0, TV1 = -1.6, 32.3, -17.5, 19.0
T_CROWN, T_TOP = 74.3, 82.3
CU0, CU1, CV0, CV1, C_TOP = -29.75, TU0, 1.4, 32.4, 24.0  # 구의회(정면 서쪽)
NU0, NU1, NV0, NV1, N_TOP = TU0, TU1, TV1, CV1, 18.0  # 탑 북쪽 저층 띠
HU0, HU1, HV0, HV1, H_TOP = 11.1, 44.9, -56.0, -19.7, 20.0  # 보건소
SLOT_V0, SLOT_V1, SLOT_TOP = -4.6, CV0, 42.3  # 정면 커튼월 입구


PART = ""  # 지금 짓는 부분의 재질 꼬리("" 탑·북쪽 띠, "@c" 구의회, "@h" 보건소)


def mat(role):
    return A.material(role + PART, PAL[role])


def obj(name, bm, role):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    me.materials.append(mat(role))
    return A.link(bpy.data.objects.new(name, me))


def rrect(u0, u1, v0, v1, r=(0, 0, 0, 0), seg=7):
    """모서리 둥근 사각형(반시계, 위에서 볼 때). r = (남서, 남동, 북동, 북서)"""
    pts = []
    corners = [(u0, v0, r[0], 180), (u1, v0, r[1], 270), (u1, v1, r[2], 0), (u0, v1, r[3], 90)]
    for cu, cv, rad, a0 in corners:
        if rad <= 0:
            pts.append((cu, cv))
            continue
        ox = cu + (rad if a0 in (180, 90) else -rad)
        oy = cv + (rad if a0 in (180, 270) else -rad)
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((ox + rad * math.cos(a), oy + rad * math.sin(a)))
    return pts


def inset(u0, u1, v0, v1, r, d, seg=7):
    """안쪽으로 d 만큼. 둥근 모서리는 꼭짓점 수가 바깥과 같게 반지름을 0.5 아래로 안 줄인다(띠의 안팎 짝)"""
    return rrect(u0 + d, u1 - d, v0 + d, v1 - d, tuple(max(0.5, x - d) if x > 0 else 0 for x in r), seg)


def prism(name, pts, z0, z1, role, top=True, bottom=False):
    bm = bmesh.new()
    lo = [bm.verts.new((u, v, z0)) for u, v in pts]
    hi = [bm.verts.new((u, v, z1)) for u, v in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if top:
        bm.faces.new(hi)
    if bottom:
        bm.faces.new(list(reversed(lo)))
    return obj(name, bm, role)


def ring(name, outer, inner, z0, z1, role):
    """띠(바깥 윤곽·안쪽 윤곽 꼭짓점 수 같음): 바깥 벽·안쪽 벽·윗면·아랫면"""
    bm = bmesh.new()
    n = len(outer)
    ob = [bm.verts.new((u, v, z0)) for u, v in outer]
    ot = [bm.verts.new((u, v, z1)) for u, v in outer]
    ib = [bm.verts.new((u, v, z0)) for u, v in inner]
    it = [bm.verts.new((u, v, z1)) for u, v in inner]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
        bm.faces.new((ib[j], ib[i], it[i], it[j]))
        bm.faces.new((ot[i], ot[j], it[j], it[i]))
        bm.faces.new((ob[j], ob[i], ib[i], ib[j]))
    return obj(name, bm, role)


def cube(name, u0, u1, v0, v1, z0, z1, role):
    return prism(name, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], z0, z1, role, bottom=True)


def beam(name, a, b, w, h, role, side=(0.0, 0.0, 1.0)):
    """a→b 를 잇는 각진 보(폭 w 는 side 쪽, 높이 h 는 그 수직 쪽)"""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    s = Vector(side).cross(d)
    if s.length < 1e-6:
        s = Vector((1, 0, 0)).cross(d)
    s.normalize()
    t = d.cross(s).normalized()
    bm = bmesh.new()
    vs = []
    for p in (a, b):
        for su, tv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vs.append(bm.verts.new(p + s * (su * w / 2) + t * (tv * h / 2)))
    q = lambda *k: bm.faces.new([vs[i] for i in k])
    q(0, 1, 2, 3)
    q(7, 6, 5, 4)
    for i in range(4):
        j = (i + 1) % 4
        q(i, 4 + i, 4 + j, j)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, role)


def sign(name, face_u, va, vb, z0, z1, role, out=-1):
    """간판 판(UV 0~1, 글자는 왼쪽→오른쪽). out=−1 은 서쪽(−u)을 보는 면: 보는 사람 왼쪽이 북이라 va(북) > vb(남)로 준다.
    out=+1 은 동쪽을 보는 면: 왼쪽이 남"""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    u = face_u + 0.04 * out
    a, b = (va, vb) if out < 0 else (vb, va)
    vs = [bm.verts.new((u, a, z0)), bm.verts.new((u, b, z0)), bm.verts.new((u, b, z1)), bm.verts.new((u, a, z1))]
    f = bm.faces.new(vs)
    for loop, c in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop[uv].uv = c
    return obj(name, bm, role)


def tree(name, u, v, z, s=1.0):
    r = 0.2 * s
    prism(f"{name}t", [(u + r * math.cos(a), v + r * math.sin(a)) for a in (k * math.pi / 3 for k in range(6))], z - 0.2, z + 2.3 * s, "trunk")
    A.ico(f"{name}c", 1.7 * s, (u, v, z + 3.0 * s), "leaf" + PART, sub=1, scale=(1, 1, 0.9), color=PAL["leaf"])


# ─── 탑 ──────────────────────────────────────────────────────────────────


def tower():
    # 유리 몸통(격자 안쪽 0.9m) · 네 모서리 기둥 · 왕관 띠 · 지붕
    cube("t_core", TU0 + 0.9, TU1 - 0.9, TV0 + 0.9, TV1 - 0.9, BURY, T_CROWN, "glass")
    for cu, cv in ((TU0, TV0), (TU1 - 1.6, TV0), (TU1 - 1.6, TV1 - 1.6), (TU0, TV1 - 1.6)):
        cube(f"t_col{cu}{cv}", cu, cu + 1.6, cv, cv + 1.6, BURY, T_CROWN, "frame")
    outer = [(TU0, TV0), (TU1, TV0), (TU1, TV1), (TU0, TV1)]
    inner = [(TU0 + 1.2, TV0 + 1.2), (TU1 - 1.2, TV0 + 1.2), (TU1 - 1.2, TV1 - 1.2), (TU0 + 1.2, TV1 - 1.2)]
    # 왕관: 서·동·북은 막힌 띠, 남쪽은 큰 창 셋이 뚫린 틀(사진 오른쪽 옆면 꼭대기)
    ring("t_crown_low", outer, inner, T_CROWN, T_CROWN + 0.9, "frame")
    ring("t_crown_top", outer, inner, T_TOP - 1.5, T_TOP, "frame")
    cube("t_crown_w", TU0, TU0 + 1.2, TV0 + 1.2, TV1 - 1.2, T_CROWN + 0.9, T_TOP - 1.5, "frame")
    cube("t_crown_e", TU1 - 1.2, TU1, TV0 + 1.2, TV1 - 1.2, T_CROWN + 0.9, T_TOP - 1.5, "frame")
    cube("t_crown_n", TU0, TU1, TV1 - 1.2, TV1, T_CROWN + 0.9, T_TOP - 1.5, "frame")
    for k, cu in enumerate((TU0, TU0 + 10.6, TU0 + 21.2, TU1 - 1.4)):
        cube(f"t_crown_post{k}", cu, cu + 1.4, TV0, TV0 + 1.2, T_CROWN + 0.9, T_TOP - 1.5, "frame")
    cube("t_roof", TU0 + 1.2, TU1 - 1.2, TV0 + 1.2, TV1 - 1.2, T_CROWN - 0.2, T_CROWN + 1.1, "roof")
    # 태양광(위성 z19: 지붕 대부분) + 기계실
    for i in range(3):
        for j in range(4):
            u0 = TU0 + 3.0 + i * 9.6
            v0 = TV0 + 3.0 + j * 7.9
            if i == 2 and j == 0:
                continue
            cube(f"t_pv{i}{j}", u0, u0 + 8.6, v0, v0 + 6.7, T_CROWN + 1.1, T_CROWN + 1.5, "solar")
    cube("t_mech", TU0 + 22.6, TU1 - 3.0, TV0 + 3.0, TV0 + 9.7, T_CROWN + 1.1, T_CROWN + 4.2, "mech")

    rows = [10.3 + 8.0 * k for k in range(8)]  # 2개 층마다 가로 보(정면 사진: 칸 하나가 두 층)
    win = 19  # 정면·뒷면 세로 창 수
    pitch = (TV1 - TV0 - 3.2) / win

    def grid_face(u_out, sgn, name):
        """서(sgn −1)·동(+1) 면: 세로 지느러미 · 2개 층마다 가로 보 · 층 사이 가는 띠. 바깥면이 발자국 선"""
        ua, ub = (u_out, u_out + 0.9) if sgn < 0 else (u_out - 0.9, u_out)
        ta, tb = (u_out + 0.55, u_out + 0.9) if sgn < 0 else (u_out - 0.9, u_out - 0.55)
        west = sgn < 0
        for k in range(1, win):
            v = TV0 + 1.6 + k * pitch
            if west and SLOT_V0 - 0.3 < v < SLOT_V1 + 0.3:
                z0 = SLOT_TOP
            elif west and v > SLOT_V1:
                z0 = C_TOP
            elif west:
                z0 = rows[0]
            else:
                z0 = BURY
            cube(f"{name}_fin{k}", ua, ub, v - 0.31, v + 0.31, z0, T_CROWN, "frame")
        for zi, z in enumerate(rows):
            spans = [(TV0, TV1)]
            if west and z < SLOT_TOP:
                spans = [(TV0, SLOT_V0)] + ([(SLOT_V1, TV1)] if z > C_TOP else [])
            for si, (v0, v1) in enumerate(spans):
                cube(f"{name}_beam{zi}{si}", ua, ub, v0, v1, z - 0.45, z + 0.45, "frame")
                cube(f"{name}_tr{zi}{si}", ta, tb, v0, v1, z + 3.9, z + 4.12, "frame")

    grid_face(TU0, -1, "tw")
    grid_face(TU1, 1, "te")

    def louver_face(v_out, sgn, name, z_from):
        """남(sgn −1)·북(+1) 면: 세로 지느러미 + 층마다 비스듬한 차양(사진 오른쪽 옆면). 바깥면이 발자국 선"""
        va, vb = (v_out, v_out + 1.2) if sgn < 0 else (v_out - 1.2, v_out)
        n = 10
        p = (TU1 - TU0 - 3.2) / n
        for k in range(1, n):
            u = TU0 + 1.6 + k * p
            z0 = z_from(u)
            cube(f"{name}_fin{k}", u - 0.25, u + 0.25, va, vb, z0, T_CROWN, "frame")
        lowest = min(z_from(TU0 + 2), z_from(TU1 - 2))
        for zi, z in enumerate(rows):
            if z >= lowest:
                cube(f"{name}_beam{zi}", TU0, TU1, va, vb, z - 0.45, z + 0.45, "frame")
        edge = v_out + sgn * 0.15
        for k in range(16):
            z = rows[0] + 4.0 * k + 2.0
            if z > T_CROWN - 1:
                break
            if z < lowest:
                continue
            # 비스듬한 차양: 면에서 바깥쪽 아래로(사진 오른쪽 옆면의 "\ \ \")
            beam(f"{name}_sh{k}", (TU0 + 1.6, edge, z + 0.35), (TU1 - 1.6, edge, z + 0.35), 1.15, 0.16, "frame", side=(0, 0.423, sgn * 0.906))

    louver_face(TV0, -1, "ts", lambda u: H_TOP if u > HU0 + 0.5 else rows[0])
    louver_face(TV1, 1, "tn", lambda u: N_TOP)

    # 정면 커튼월 입구(남쪽 절반 아래): 녹색 유리 + 가는 멀리언
    cube("t_slot", TU0 + 0.25, TU0 + 0.45, SLOT_V0, SLOT_V1, BURY, SLOT_TOP - 0.45, "curtain")
    for k in range(1, 4):
        v = SLOT_V0 + k * (SLOT_V1 - SLOT_V0) / 4
        cube(f"t_slot_m{k}", TU0 + 0.15, TU0 + 0.3, v - 0.06, v + 0.06, 0, SLOT_TOP - 0.45, "frame")
    for k in range(1, 10):
        z = 4.2 * k + 0.5
        if z > SLOT_TOP - 1:
            break
        cube(f"t_slot_h{k}", TU0 + 0.15, TU0 + 0.3, SLOT_V0, SLOT_V1, z - 0.07, z + 0.07, "frame")
    # 1층 로비(정면 남쪽): 유리 + 차양
    cube("t_lobby", TU0 + 0.9, TU0 + 1.1, TV0 + 1.6, SLOT_V0, BURY, rows[0] - 0.45, "curtain")
    cube("t_canopy", TU0 - 2.6, TU0 + 0.9, TV0 + 1.6, SLOT_V0 - 0.2, 6.2, 6.7, "frame")
    # 간판(왕관 서·동면, 남쪽 쪽에 치우침)
    sign("t_sign_w", TU0, -0.4, -12.6, T_CROWN + 2.6, T_CROWN + 5.9, "sign_gc", out=-1)
    sign("t_sign_e", TU1, -0.4, -12.6, T_CROWN + 2.6, T_CROWN + 5.9, "sign_gc", out=1)
    # 북쪽 왕관에도(남쪽은 뚫린 틀). 북면은 v 가 아니라 u 를 따라 선다: 보는 사람(북쪽, −v 를 봄) 왼쪽이 동(+u)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    vn = TV1 + 0.04
    ua, ub = TU1 - 9.0, TU1 - 21.2
    vs = [bm.verts.new((ua, vn, T_CROWN + 2.6)), bm.verts.new((ub, vn, T_CROWN + 2.6)), bm.verts.new((ub, vn, T_CROWN + 5.9)), bm.verts.new((ua, vn, T_CROWN + 5.9))]
    f = bm.faces.new(vs)
    for loop, c in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop[uvl].uv = c
    obj("t_sign_n", bm, "sign_gc")


# ─── 구의회(정면 북서쪽, 모서리 둥근 흰 띠 5단) ──────────────────────────────

C_R = (6.5, 0, 0, 6.5)
BANDS_C = [(5.6, 6.9), (10.1, 11.1), (14.3, 15.3), (18.5, 19.5), (21.7, C_TOP)]


def banded(prefix, u0, u1, v0, v1, r, bands, top, ground):
    """띠 건물: 1층 유리(안쪽 2m) · 흰 띠(바깥면이 발자국 선, 안쪽 1.6m) · 띠 사이 유리(안쪽 1m)"""
    outer = rrect(u0, u1, v0, v1, r)
    inner = inset(u0, u1, v0, v1, r, 1.6)
    prism(f"{prefix}_g", inset(u0, u1, v0, v1, r, 2.0), BURY, bands[0][0], ground, top=False)
    for i, (z0, z1) in enumerate(bands):
        ring(f"{prefix}_band{i}", outer, inner, z0, z1, "frame")
        if i + 1 < len(bands):
            prism(f"{prefix}_win{i}", inset(u0, u1, v0, v1, r, 1.0), z1, bands[i + 1][0], "glass", top=False)
    return outer, inner


def council():
    global PART
    PART = "@c"
    outer, inner = banded("c", CU0, CU1, CV0, CV1, C_R, BANDS_C, C_TOP, "curtain")
    prism("c_roof", inner, C_TOP - 0.5, C_TOP - 0.05, "membrane")
    # 흰 지붕(위성: 밝은 막 지붕) 가운데 솟은 판
    prism("c_roof_up", inset(CU0, CU1, CV0, CV1, C_R, 4.5), C_TOP - 0.05, C_TOP + 1.1, "membrane")
    # 남쪽 사다리 버팀대: 지붕 남동 모서리에서 입구 광장으로 비스듬히(정면과 나란한 판)
    uc = TU0 - 1.5
    top_a, top_b = (CV0, C_TOP + 0.4), (CV0 - 3.0, C_TOP + 0.4)
    bot_a, bot_b = (CV0 - 7.6, BURY), (CV0 - 10.6, BURY)
    for k, ((va, za), (vb, zb)) in enumerate(((top_a, bot_a), (top_b, bot_b))):
        beam(f"c_strut{k}", (uc, va, za), (uc, vb, zb), 0.9, 0.8, "frame", side=(1, 0, 0))
    for k in range(1, 7):
        f = k / 7
        z = C_TOP + 0.4 - f * (C_TOP + 0.4)
        va = top_a[0] + (bot_a[0] - top_a[0]) * f
        vb = top_b[0] + (bot_b[0] - top_b[0]) * f
        beam(f"c_rung{k}", (uc, va, z), (uc, vb, z), 0.9, 0.55, "frame", side=(1, 0, 0))
    cube("c_strut_cap", uc - 0.45, uc + 0.45, top_b[0], CV0, C_TOP - 0.2, C_TOP + 0.9, "frame")
    sign("c_sign", CU0, 25.0, 14.6, 22.15, 23.55, "sign_council", out=-1)
    PART = ""


def north_strip():
    banded("n", NU0, NU1, NV0, NV1, (0, 0, 0, 0), [(5.6, 6.9), (10.1, 11.1), (14.3, 15.3), (16.4, N_TOP)], N_TOP, "curtain")
    prism("n_green", inset(NU0, NU1, NV0, NV1, (0, 0, 0, 0), 1.6), N_TOP - 0.5, N_TOP - 0.1, "green")
    for k, (u, v) in enumerate(((3.0, 27.5), (9.0, 29.0), (16.0, 26.6), (24.0, 28.6), (29.0, 25.5))):
        tree(f"n_tree{k}", u, v, N_TOP - 0.1, 0.85)


# ─── 보건소(남쪽, 흰 띠 4단 + 남쪽 끝 루버 날개) ─────────────────────────────

H_R = (8.0, 8.0, 0, 0)
BANDS_H = [(5.4, 6.4), (9.6, 10.6), (13.8, 14.8), (17.4, H_TOP)]
WING_V0, WING_Z1 = -44.0, 27.2


def health():
    global PART
    PART = "@h"
    outer, inner = banded("h", HU0, HU1, HV0, HV1, H_R, BANDS_H, H_TOP, "curtain")
    # 탑과 잇는 유리 통로(OSM 연결 조각)
    cube("h_link", HU0 + 0.5, TU1, HV1 - 0.2, TV0 + 0.4, BURY, H_TOP - 0.4, "curtain")
    cube("h_link_band", HU0 + 0.5, TU1, HV1 - 0.2, TV0 + 0.4, H_TOP - 0.4, H_TOP, "frame")
    # 옥상: 북쪽 정원, 남쪽 날개 밑 데크
    prism("h_green", inset(HU0, HU1, WING_V0 + 1.0, HV1, (0, 0, 0, 0), 1.6), H_TOP - 0.55, H_TOP - 0.1, "green")
    prism("h_deck", inset(HU0, HU1, HV0, WING_V0 + 1.0, (H_R[0], H_R[1], 0, 0), 1.6), H_TOP - 0.55, H_TOP - 0.15, "roof")
    for k, (u, v) in enumerate(((16.5, -24.5), (23.0, -27.0), (30.5, -24.0), (38.0, -26.5), (19.0, -35.5), (35.0, -37.0))):
        tree(f"h_tree{k}", u, v, H_TOP - 0.1, 0.8)
    cube("h_play", 26.0, 31.0, -40.5, -36.5, H_TOP - 0.1, H_TOP + 0.6, "mech")
    # 루버 날개: 남쪽 끝에서 솟는 경사면. 갈비(경사 방향) + 양쪽 틀
    span = WING_Z1 - H_TOP
    um = (HU0 + HU1) / 2
    beam("h_wing_slab", (um, WING_V0, H_TOP - 0.1), (um, HV0 + 1.2, WING_Z1 - 0.2), 0.3, HU1 - HU0 - 1.6, "roof", side=(1, 0, 0))
    for k in range(int((HU1 - HU0 - 2.0) / 0.9)):
        u = HU0 + 1.4 + k * 0.9
        beam(f"h_rib{k}", (u, WING_V0, H_TOP + 0.2), (u, HV0 + 1.2, WING_Z1), 0.55, 0.2, "frame", side=(1, 0, 0))
    for u in (HU0 + 0.6, HU1 - 0.6):
        beam(f"h_wing_side{u}", (u, WING_V0 - 1.0, H_TOP - 0.2), (u, HV0 + 0.6, WING_Z1 + 0.4), 1.2, 0.9, "frame", side=(1, 0, 0))
    cube("h_wing_end", HU0 + 0.6, HU1 - 0.6, HV0 + 0.4, HV0 + 1.8, H_TOP, WING_Z1 + 0.4, "frame")
    cube("h_wing_under", HU0 + 1.2, HU1 - 1.2, HV0 + 1.8, HV0 + 3.0, H_TOP, H_TOP + span * 0.75, "glass")
    # 광장 쪽 흰 띠: 구의회 버팀대 발치에서 보건소 북서 모서리로 오르는 곡선(사진: 두 저층부를 잇는 흰 틀)
    # 평면은 2차 베지어(탑 남서 모서리를 바깥으로 돌아간다), 높이는 보건소 쪽으로 갈수록 가파르게
    p0, c, p2 = (TU0 - 1.6, CV0 - 10.6), (TU0 - 4.0, TV0 - 6.0), (HU0 - 0.6, HV1 - 0.3)
    pts = []
    for k in range(9):
        f = k / 8
        u = (1 - f) ** 2 * p0[0] + 2 * f * (1 - f) * c[0] + f * f * p2[0]
        v = (1 - f) ** 2 * p0[1] + 2 * f * (1 - f) * c[1] + f * f * p2[1]
        # 보건소가 런타임에 제 땅높이로 올라가도 발치가 광장에 묻히게 땅 아래에서 시작
        pts.append((u, v, -2.6 + (BANDS_H[1][1] + 2.6) * f ** 1.6))
    for k in range(8):
        beam(f"h_sweep{k}", pts[k], pts[k + 1], 1.1, 1.0, "frame", side=(0, 0, 1))
    sign("h_sign", HU0, -21.6, -32.6, 17.85, 19.55, "sign_health", out=-1)
    PART = ""


def preview(name, direction, target, dist, size=1280):
    """워크벤치 미리보기(검수용, 레포에 안 넣는다). direction 은 표적에서 카메라로"""
    os.makedirs(A.PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    cam = bpy.data.objects.new(f"cam_{name}", bpy.data.cameras.new(f"cam_{name}"))
    sc.collection.objects.link(cam)
    t = Vector(target)
    cam.location = t + Vector(direction).normalized() * dist
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    cam.data.clip_end = 2000
    sc.camera = cam
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_object_outline = True
    sc.display.shading.show_cavity = True
    sc.display.shading.show_shadows = True
    sc.render.resolution_x = size
    sc.render.resolution_y = int(size * 0.75)
    sc.render.filepath = os.path.join(A.PREVIEW, f"gucheong-{name}.png")
    bpy.ops.render.render(write_still=True)


def build():
    A.reset()
    tower()
    council()
    north_strip()
    health()
    A.join_by_material()
    path = os.path.join(A.OUT, "gucheong.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=True,
        export_cameras=False,
        use_selection=False,
    )
    obs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    tris = sum(len(p.vertices) - 2 for o in obs for p in o.data.polygons)
    print(f"ASSET gucheong.glb  parts={len(obs)}  tris={tris}  {os.path.getsize(path) / 1024:.1f}KB")
    if A.PREVIEW:
        # 사진 1(서남서 높은 곳)·사진 2(서쪽 정면)·위에서
        preview("photo1", (-1.0, -0.42, 0.62), (8, -6, 30), 230)
        preview("photo2", (-1.0, -0.05, 0.2), (8, -10, 30), 260)
        preview("aerial", (-0.25, -0.35, 1.0), (8, -10, 10), 260)


if __name__ == "__main__":
    build()
    print("GUCHEONG_DONE", A.OUT)
