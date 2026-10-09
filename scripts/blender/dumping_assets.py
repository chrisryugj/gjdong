# /dumping 모형 보기 3D 에셋(23라운드, 2026-10-09). 블렌더 bpy 로 로우폴리 모델을 만들어 glb 로 내보낸다.
#   blender -b --factory-startup --python scripts/blender/dumping_assets.py -- [--out public/dumping/models] [--preview 폴더]
# 블렌더 MCP 가 하는 일(Claude 가 bpy 코드를 블렌더에 보낸다)을 스크립트로 남긴 것. 다시 돌리면 같은 파일이 나온다.
# 재질 이름이 곧 역할이다(body·body2·body3·ink·paper·glass·metal·light·tire·leaf·trunk·cloud). 화면 색은 런타임
# (components/dumping/toon-assets.ts)이 역할마다 다시 칠한다: body 는 시설 종류 색(INFRA_STYLE), 나머지는 테마 팔레트. 여기 색은 미리보기용.
# 크기: 시설은 지금 지도 아이콘과 같은 "아이콘 미터"(이동식 CCTV 12.6 · 고정 11.5 · 의류수거함 11 · 정거장 8 · 쓰레기통 8 · 청소차 길이 7, 앞이 +x),
# 나무·구름은 실제 미터. 원점은 바닥 가운데. 블렌더 +z 위 → glTF +y 위.
import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.abspath(arg("--out", os.path.join(ROOT, "public", "dumping", "models")))
PREVIEW = arg("--preview")
os.makedirs(OUT, exist_ok=True)

# 미리보기 색(sRGB hex). 런타임은 이름으로 다시 칠한다
PAL = {
    "body": "#7c3aed",
    "body2": "#9f73f1",
    "body3": "#5b21b6",
    "ink": "#2a2722",
    "paper": "#f6f2e8",
    "glass": "#5d7a8c",
    "metal": "#a7a49c",
    "light": "#ffd27a",
    "tire": "#33312d",
    "leaf": "#7fae6e",
    "trunk": "#8b6a4f",
    "cloud": "#ffffff",
}


def srgb(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(role, color=None):
    m = bpy.data.materials.get(role)
    if m:
        return m
    m = bpy.data.materials.new(role)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    col = srgb(color or PAL[role])
    bsdf.inputs["Base Color"].default_value = col
    bsdf.inputs["Roughness"].default_value = 0.8
    m.diffuse_color = col
    if role == "light":
        bsdf.inputs["Emission Color"].default_value = col
        bsdf.inputs["Emission Strength"].default_value = 1.5
    return m


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, bm, role, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, color=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    me.materials.append(material(role, color))
    ob = link(bpy.data.objects.new(name, me))
    ob.location = loc
    ob.rotation_euler = rot
    if bevel > 0:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return ob


def box(name, size, loc, role, bevel=0.0, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    return mesh_obj(name, bm, role, loc, rot, bevel)


def cyl(name, r, h, loc, role, seg=12, r2=None, bevel=0.0, rot=(0, 0, 0), caps=True, smooth=False):
    """바닥이 loc 에 닿는 원기둥(r2 면 위쪽 반지름)"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=bm.verts)
    return mesh_obj(name, bm, role, loc, rot, bevel, smooth=smooth)


def ico(name, r, loc, role, sub=1, scale=(1, 1, 1), jitter=0.0, seed=0, flat_bottom=None, color=None, smooth=False):
    """구. jitter 로 꼭짓점을 흔들어 덩어리 느낌. flat_bottom 은 그 높이(구 반지름 비율) 아래를 납작하게. smooth 면 매끈한 면(법선 평균)"""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    rng = random.Random(seed)
    for v in bm.verts:
        if jitter:
            v.co += Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * jitter * r
        if flat_bottom is not None and v.co.z < -flat_bottom * r:
            v.co.z = -flat_bottom * r
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    return mesh_obj(name, bm, role, loc, color=color, smooth=smooth)


def wedge(name, w, d, h0, h1, loc, role, bevel=0.0):
    """앞(−y) 높이 h0, 뒤(+y) 높이 h1 인 경사 지붕 덩어리. 폭 w(x)·깊이 d(y)"""
    bm = bmesh.new()
    xs, ys = (-w / 2, w / 2), (-d / 2, d / 2)
    vs = {}
    for x in xs:
        for y in ys:
            top = h0 if y < 0 else h1
            vs[(x, y, 0)] = bm.verts.new((x, y, 0))
            vs[(x, y, 1)] = bm.verts.new((x, y, top))
    f = lambda *k: bm.faces.new([vs[q] for q in k])
    a, b = xs
    c, d2 = ys
    f((a, c, 0), (b, c, 0), (b, c, 1), (a, c, 1))
    f((b, d2, 0), (a, d2, 0), (a, d2, 1), (b, d2, 1))
    f((a, d2, 0), (a, c, 0), (a, c, 1), (a, d2, 1))
    f((b, c, 0), (b, d2, 0), (b, d2, 1), (b, c, 1))
    f((a, c, 1), (b, c, 1), (b, d2, 1), (a, d2, 1))
    f((a, d2, 0), (b, d2, 0), (b, c, 0), (a, c, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, role, loc, bevel=bevel)


def join_by_material():
    """같은 재질(역할) 물체를 하나로 합친다. 런타임은 역할마다 InstancedMesh 하나라 그리기 호출이 줄어든다"""
    groups = {}
    for ob in list(bpy.context.scene.objects):
        if ob.type == "MESH":
            groups.setdefault(ob.data.materials[0].name, []).append(ob)
    for role, obs in groups.items():
        for ob in obs:
            # 모디파이어(베벨)는 합치기 전에 적용
            with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
                for mod in list(ob.modifiers):
                    bpy.ops.object.modifier_apply(modifier=mod.name)
        if len(obs) > 1:
            with bpy.context.temp_override(active_object=obs[0], object=obs[0], selected_objects=obs, selected_editable_objects=obs):
                bpy.ops.object.join()
        obs[0].name = role
        obs[0].data.name = role


def export(name, cam_dist=None, cam_target=None):
    join_by_material()
    path = os.path.join(OUT, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=False,
        export_cameras=False,
        use_selection=False,
    )
    tris = sum(len(p.vertices) - 2 for ob in bpy.context.scene.objects if ob.type == "MESH" for p in ob.data.polygons)
    print(f"ASSET {name}.glb  parts={len([o for o in bpy.context.scene.objects if o.type == 'MESH'])}  tris={tris}  {os.path.getsize(path) / 1024:.1f}KB")
    if PREVIEW:
        preview(name, cam_dist, cam_target)


def preview(name, dist=None, target=None):
    """워크벤치로 3/4 시점 미리보기 PNG(검수용, 레포에 안 넣는다)"""
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    obs = [o for o in sc.objects if o.type == "MESH"]
    lo = Vector((min(v[0] for o in obs for v in o.bound_box), min(v[1] for o in obs for v in o.bound_box), min(v[2] for o in obs for v in o.bound_box)))
    hi = Vector((max(v[0] for o in obs for v in o.bound_box), max(v[1] for o in obs for v in o.bound_box), max(v[2] for o in obs for v in o.bound_box)))
    c = target or (lo + hi) / 2
    size = (hi - lo).length
    d = dist or size * 1.6
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    direction = Vector((1.0, -1.25, 0.95)).normalized()
    cam.location = Vector(c) + direction * d
    cam.rotation_euler = (Vector(c) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    sc.camera = cam
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_object_outline = True
    sc.display.shading.show_cavity = True
    sc.render.film_transparent = False
    sc.render.resolution_x = sc.render.resolution_y = 480
    sc.render.filepath = os.path.join(PREVIEW, f"{name}.png")
    bpy.ops.render.render(write_still=True)


# ─── 시설 ────────────────────────────────────────────────────────────────


def cctv_mobile():
    """이동식 CCTV: 무게추 받침 · 기둥 · 경고판 · 태양광판 · 앞으로 숙인 카메라 머리(렌즈·차양·불빛). 높이 12.6"""
    reset()
    box("base", (2.8, 2.8, 0.9), (0, 0, 0.45), "metal", bevel=0.18)
    box("foot", (2.0, 2.0, 0.35), (0, 0, 1.05), "ink", bevel=0.08)
    cyl("pole", 0.34, 10.0, (0, 0, 1.1), "body", seg=10, r2=0.28)
    box("sign", (2.1, 0.16, 1.5), (0, -0.4, 5.2), "paper", bevel=0.05)
    box("sign_band", (2.1, 0.18, 0.32), (0, -0.41, 5.75), "body2")
    box("panel", (2.5, 1.6, 0.14), (0, 0.55, 10.35), "glass", rot=(math.radians(32), 0, 0), bevel=0.04)
    box("head", (1.5, 2.6, 1.25), (0, -0.55, 11.55), "body", rot=(math.radians(-14), 0, 0), bevel=0.14)
    box("visor", (1.7, 1.2, 0.18), (0, -1.55, 12.3), "body3", rot=(math.radians(-14), 0, 0))
    cyl("lens", 0.4, 0.5, (0, -1.85, 11.25), "ink", seg=12, rot=(math.radians(90 - 14), 0, 0))
    ico("led", 0.2, (0.55, -1.7, 11.95), "light", sub=1)
    export("cctv-mobile")


def cctv_fixed():
    """고정 CCTV: 받침 · 가늘어지는 기둥 · 팔 · 돔 카메라 2개 · 꼭대기 모자. 높이 11.5"""
    reset()
    cyl("plate", 1.25, 0.35, (0, 0, 0), "metal", seg=14, bevel=0.06)
    cyl("pole", 0.42, 10.0, (0, 0, 0.35), "body", seg=12, r2=0.3)
    box("arm", (3.0, 0.42, 0.42), (1.2, 0, 9.6), "body", bevel=0.06)
    cyl("cap", 0.45, 0.45, (0, 0, 10.35), "body3", seg=12, r2=0.15)
    for x, s in ((2.45, 1.0), (-0.1, 0.0)):
        if s:
            cyl("mount", 0.55, 0.3, (x, 0, 9.05), "body3", seg=12)
            ico("dome", 0.75, (x, 0, 8.85), "ink", sub=2, flat_bottom=None, scale=(1, 1, 0.85))
    box("box", (0.8, 0.5, 1.4), (0, -0.45, 3.0), "body3", bevel=0.06)
    export("cctv-fixed")


def cloth_bin():
    """의류수거함: 철제 상자 · 경사 지붕 · 투입구 덮개 · 손잡이 · 안내판 · 받침발. 높이 11"""
    reset()
    box("feet", (4.6, 3.4, 0.5), (0, 0, 0.25), "ink", bevel=0.05)
    box("body", (5.0, 3.8, 7.6), (0, 0, 4.3), "body", bevel=0.16)
    wedge("roof", 5.5, 4.3, 1.5, 2.6, (0, 0, 8.1), "body3", bevel=0.1)
    box("hatch", (3.2, 0.3, 1.9), (0, -1.95, 6.2), "ink", bevel=0.08)
    box("hatch_lip", (3.4, 0.5, 0.25), (0, -2.0, 7.25), "body2")
    box("handle", (1.4, 0.35, 0.22), (0, -2.15, 5.45), "metal")
    box("label", (2.6, 0.12, 1.6), (0, -1.94, 3.1), "paper", bevel=0.04)
    box("label_dot", (0.7, 0.14, 0.7), (0, -1.96, 3.1), "body2")
    export("cloth-bin")


def recycling():
    """재활용정거장: 받침 · 기둥 4개 · 차양 지붕 · 안내판 · 분리수거 통 3개(뚜껑). 높이 8"""
    reset()
    box("deck", (11.0, 6.6, 0.55), (0, 0, 0.27), "metal", bevel=0.12)
    for x in (-5.0, 5.0):
        for y in (-2.7, 2.7):
            cyl(f"post{x}{y}", 0.22, 6.6, (x, y, 0.55), "ink", seg=8)
    wedge("roof", 11.8, 7.4, 0.55, 0.95, (0, 0, 7.05), "body", bevel=0.1)
    box("board", (5.2, 0.18, 1.2), (0, -3.25, 6.2), "paper", bevel=0.04)
    for i, (x, role) in enumerate(((-3.3, "body2"), (0.0, "body"), (3.3, "body3"))):
        cyl(f"bin{i}", 1.35, 4.0, (x, 0.3, 0.55), role, seg=12, r2=1.45, bevel=0.05)
        cyl(f"lid{i}", 1.55, 0.35, (x, 0.3, 4.55), "ink", seg=12, r2=1.3)
        box(f"slot{i}", (1.0, 0.12, 0.35), (x, -1.15, 3.7), "ink")
    export("recycling")


def street_bin():
    """가로쓰레기통: 일반·재활용 두 칸 한 몸 · 투입구 · 뚜껑 · 받침. 높이 8"""
    reset()
    box("plinth", (5.0, 2.9, 0.45), (0, 0, 0.22), "ink", bevel=0.06)
    box("left", (2.3, 2.5, 5.8), (-1.2, 0, 3.35), "body", bevel=0.18)
    box("right", (2.3, 2.5, 5.8), (1.2, 0, 3.35), "body2", bevel=0.18)
    box("top", (5.0, 2.9, 0.7), (0, 0, 6.6), "body3", bevel=0.14)
    wedge("lid", 4.8, 2.7, 0.55, 0.95, (0, 0, 6.95), "body", bevel=0.08)
    for x in (-1.2, 1.2):
        box(f"mouth{x}", (1.5, 0.2, 0.8), (x, -1.28, 5.4), "ink", bevel=0.04)
        box(f"tag{x}", (1.2, 0.14, 0.9), (x, -1.27, 3.2), "paper", bevel=0.03)
    export("street-bin")


def truck():
    """청소차(압축 진개차): 흰 운전석 · 앞유리 · 경광등 · 앰버 적재함(뒤 호퍼) · 줄무늬 · 바퀴 6. 길이 7, 앞 +x"""
    reset()
    box("chassis", (6.7, 2.0, 0.55), (0.0, 0, 0.95), "ink", bevel=0.05)
    box("cab", (1.75, 2.3, 2.0), (2.55, 0, 2.15), "paper", bevel=0.22)
    box("cab_roof", (1.4, 2.0, 0.25), (2.4, 0, 3.25), "paper", bevel=0.08)
    box("windshield", (0.12, 2.0, 0.95), (3.43, 0, 2.55), "glass", rot=(0, math.radians(-8), 0))
    for y in (-1.16, 1.16):
        box(f"sidewin{y}", (0.9, 0.08, 0.7), (2.65, y, 2.6), "glass")
    box("bumper", (0.3, 2.3, 0.45), (3.45, 0, 1.15), "ink", bevel=0.05)
    box("lightbar", (0.55, 1.5, 0.28), (2.35, 0, 3.5), "light", bevel=0.05)
    box("body", (4.3, 2.35, 2.55), (-0.55, 0, 2.5), "body", bevel=0.2)
    box("stripe", (4.32, 2.38, 0.36), (-0.55, 0, 1.75), "paper")
    wedge("hopper", 1.3, 2.35, 2.9, 2.2, (-3.05, 0, 1.2), "body3", bevel=0.12)
    # 원기둥을 x축으로 90° 눕히면 축이 −y 로 뻗는다: 바퀴 가운데가 y 에 오게 높이 절반만큼 +y 에서 시작
    for x in (2.3, -1.3, -2.45):
        for y in (-1.05, 1.05):
            cyl(f"wheel{x}{y}", 0.6, 0.42, (x, y + 0.21, 0.6), "tire", seg=12, rot=(math.radians(90), 0, 0))
            cyl(f"hub{x}{y}", 0.26, 0.46, (x, y + 0.23, 0.6), "metal", seg=8, rot=(math.radians(90), 0, 0))
    export("truck")


# ─── 장식(실제 지목·경로 자리에 놓는다) ────────────────────────────────────


def tree_broad():
    """활엽수(24라운드 실사): 가는 줄기 + 둥글게 뭉친 수관 넷(매끈한 면, 꼭짓점을 흔들어 잎 덩어리처럼). 높이 약 8.5m"""
    reset()
    cyl("trunk", 0.28, 3.6, (0, 0, 0), "trunk", seg=7, r2=0.18, caps=False, smooth=True)
    rng = random.Random(3)
    for i, (x, y, z, r) in enumerate([(0, 0, 5.5, 2.6), (1.25, 0.55, 4.7, 1.85), (-1.15, -0.7, 4.85, 1.9), (0.2, -1.1, 6.25, 1.6)]):
        ico(f"crown{i}", r, (x, y, z), "leaf", sub=2, jitter=0.09, seed=rng.randint(0, 999), scale=(1, 1, 0.9), smooth=True)
    export("tree-broad")


def tree_pine():
    """침엽수(24라운드 실사): 줄기 + 원뿔 세 겹(매끈한 면, 아래가 넓다). 높이 약 10.5m"""
    reset()
    cyl("trunk", 0.25, 2.6, (0, 0, 0), "trunk", seg=7, r2=0.18, caps=False, smooth=True)
    for r, h, z in ((2.9, 4.2, 1.8), (2.25, 3.8, 4.1), (1.5, 3.4, 6.5)):
        cyl(f"tier{z}", r, h, (0, 0, z), "leaf", seg=9, r2=0.05, caps=False, smooth=True)
    export("tree-pine")


CLOUDS = {
    # 이름: 덩어리 (x, y, z, 반지름). 바닥은 납작, 위는 둥글게 솟는다. 폭 80~110m
    "cloud": [(0, 0, 0, 20), (19, 3, -3, 15), (-19, -2, -4, 15), (8, -9, 6, 14), (-7, 8, 7, 13), (31, -2, -8, 10), (-30, 4, -9, 10), (2, 6, 12, 11)],
    "cloud-b": [(0, 0, 0, 17), (16, -4, -2, 14), (30, 0, -6, 10), (-14, 3, -3, 13), (-26, -1, -7, 9), (6, 7, 8, 11), (-6, -6, 6, 10)],
    "cloud-c": [(0, 0, 0, 22), (22, 2, -4, 16), (-21, 0, -5, 16), (40, -1, -10, 10), (-38, 2, -10, 9), (10, -8, 9, 14), (-10, 8, 10, 13), (0, 0, 16, 12)],
}


def cloud(name):
    """뭉게구름(24라운드: 매끈한 면). 납작한 바닥 + 둥근 덩어리. 런타임이 바람 따라 흘리고 땅에 그림자를 드리운다"""
    reset()
    rng = random.Random(len(name) * 7 + 11)
    for i, (x, y, z, r) in enumerate(CLOUDS[name]):
        ico(f"puff{i}", r, (x, y, z), "cloud", sub=3, jitter=0.02, seed=rng.randint(0, 999), flat_bottom=0.38, scale=(1.12, 1.0, 0.86), smooth=True)
    export(name)


if __name__ == "__main__":
    builds = {
        "cctv-mobile": cctv_mobile, "cctv-fixed": cctv_fixed, "cloth-bin": cloth_bin, "recycling": recycling, "street-bin": street_bin, "truck": truck,
        "tree-broad": tree_broad, "tree-pine": tree_pine, **{k: (lambda k=k: cloud(k)) for k in CLOUDS},
    }
    # --only 이름,이름 이면 그것만(나머지 glb 는 그대로)
    only = arg("--only")
    for name, build in builds.items():
        if not only or name in only.split(","):
            build()
    print("ASSETS_DONE", OUT)
