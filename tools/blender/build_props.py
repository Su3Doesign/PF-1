"""
Models the forest's hero props in Blender, bakes ambient occlusion with Cycles
and exports GLB files for the site.

    pip install bpy==5.2.2          # Blender as a Python module
    python tools/blender/build_props.py [--only letters,torii,...] [--samples 48]

Outputs to public/assets/3d/: <prop>.glb plus ao_<prop>.png (converted to
WebP by tools/pack_3d.py).  Blender is Z-up; the glTF exporter converts to
Y-up, so every prop is modelled facing -Y (it faces +Z / the camera in three.js).
"""
import argparse
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "assets" / "3d"
OUT.mkdir(parents=True, exist_ok=True)
FONT = Path("/tmp/work/fonts/archivo-exp-black.ttf")

ap = argparse.ArgumentParser()
ap.add_argument("--only", default="")
ap.add_argument("--samples", type=int, default=48)
ARGS = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])


# ── helpers ──────────────────────────────────────────────────────────────────
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = ARGS.samples
    s.render.bake.margin = 6
    w = bpy.data.worlds.new("w")
    s.world = w
    w.light_settings.distance = 0.9
    return s


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def apply_mods(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def to_mesh(obj):
    select_only([obj])
    bpy.ops.object.convert(target="MESH")
    return bpy.context.view_layer.objects.active


def box(name, size, loc=(0, 0, 0), bevel=0.0, segs=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    if bevel:
        m = o.modifiers.new("bev", "BEVEL")
        m.width = bevel
        m.segments = segs
        m.limit_method = "ANGLE"
        apply_mods(o)
    return o


def cyl(name, r1, r2, h, loc=(0, 0, 0), verts=24, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r1, radius2=r2, depth=h)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    if bevel:
        m = o.modifiers.new("bev", "BEVEL")
        m.width = bevel
        m.segments = 2
        m.limit_method = "ANGLE"
        apply_mods(o)
    return o


def ico(name, r, loc, subdiv=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    return o


def boolean(obj, cutter, op="DIFFERENCE"):
    m = obj.modifiers.new("b", "BOOLEAN")
    m.operation = op
    m.object = cutter
    m.solver = "EXACT"
    apply_mods(obj)


def join(objs, name):
    select_only(objs)
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def smooth_shade(obj, angle=35):
    me = obj.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        select_only([obj])
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    except Exception:
        pass


def flat_shade(obj):
    for p in obj.data.polygons:
        p.use_smooth = False


def uv_unwrap(obj, margin=0.006):
    select_only([obj])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake_ao(obj, size, name):
    img = bpy.data.images.new("ao_" + name, size, size, alpha=False)
    mat = bpy.data.materials.new("bake_" + name)
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    select_only([obj])
    bpy.ops.object.bake(type="AO", margin=6, use_clear=True)
    path = OUT / f"ao_{name}.png"
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    print("baked", path.name)


def ground_plane(z=0.0, size=40):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size)
    me = bpy.data.meshes.new("ground")
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new("ground", me))
    o.location.z = z
    return o


def set_origin(obj, where="base"):
    me = obj.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    mw = obj.matrix_world
    if where == "base":
        c = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)))
    else:
        c = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
    me.transform(Matrix.Translation(-c))
    obj.location = mw @ c


def export(objs, name):
    select_only(objs)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / f"{name}.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="NONE",
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
    )
    print("exported", name + ".glb")


def delete(objs):
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)


def cx_of(o):
    return sum((o.matrix_world @ v.co).x for v in o.data.vertices) / max(1, len(o.data.vertices))


def cluster_x(objs, k):
    objs = sorted(objs, key=cx_of)
    xs = [cx_of(o) for o in objs]
    gaps = sorted(range(1, len(xs)), key=lambda i: xs[i] - xs[i - 1], reverse=True)[: k - 1]
    cuts = sorted(gaps)
    out, prev = [], 0
    for c in cuts + [len(objs)]:
        out.append(objs[prev:c])
        prev = c
    return out


def weld(obj, dist=0.0008):
    select_only([obj])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=dist)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def rnd(seed):
    return random.Random(seed)


# ── 1. monumental letters: SUMANTH ───────────────────────────────────────────
def build_letters():
    reset()
    R = rnd(7)
    font = bpy.data.fonts.load(str(FONT))
    size, ext, bev = 4.4, 0.34, 0.04

    def make_text(name):
        cu = bpy.data.curves.new(name, "FONT")
        cu.body = "SUMANTH"
        cu.font = font
        cu.size = size
        cu.align_x = "CENTER"
        cu.space_character = 1.06
        o = link(bpy.data.objects.new(name, cu))
        return o

    t = make_text("word")
    t.data.extrude = ext
    t.data.bevel_depth = bev
    t.data.bevel_resolution = 2
    word = to_mesh(t)
    word.rotation_euler = (math.radians(90), 0, 0)
    select_only([word])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    select_only([word])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.startswith("word")]
    letters = []
    for gi, g in enumerate(cluster_x(parts, 7)):
        L = join(g, f"L{gi}") if len(g) > 1 else g[0]
        weld(L)
        letters.append(L)
    zmin = min(v.co.z for o in letters for v in o.data.vertices)
    zmax = max(v.co.z for o in letters for v in o.data.vertices)
    xmin = min(v.co.x for o in letters for v in o.data.vertices)
    xmax = max(v.co.x for o in letters for v in o.data.vertices)
    print(f"word bounds x {xmin:.2f}..{xmax:.2f}  z {zmin:.2f}..{zmax:.2f}")

    # weathering: bite chunks out of the top edges and corners
    for i, L in enumerate(letters):
        bb = [v.co for v in L.data.vertices]
        lx0, lx1 = min(v.x for v in bb), max(v.x for v in bb)
        lz1 = max(v.z for v in bb)
        for k in range(R.randint(2, 5)):
            c = ico("cut", R.uniform(0.3, 0.68),
                    (R.uniform(lx0, lx1), R.uniform(-0.45, 0.45), lz1 - R.uniform(-0.1, 0.25)), subdiv=1)
            c.scale = (1, R.uniform(0.8, 1.4), R.uniform(0.6, 1.0))
            c.rotation_euler = (R.random() * 3, R.random() * 3, R.random() * 3)
            boolean(L, c)
            delete([c])
        # a crack notch low on one side
        if R.random() < 0.6:
            c = box("cut", (0.08, 1.4, 0.5), (R.uniform(lx0, lx1), 0, R.uniform(zmin + 0.3, zmax - 0.6)))
            c.rotation_euler = (0, R.uniform(-0.6, 0.6), 0)
            boolean(L, c)
            delete([c])
        L.name = f"letter_{i}"
        L.data.name = L.name
        flat_shade(L)

    # neon outlines (front face, inset)
    n = make_text("neon")
    n.data.offset = -0.075
    n.data.fill_mode = "NONE"
    n.data.extrude = 0
    n.data.bevel_depth = 0.028
    n.data.bevel_resolution = 2
    n.data.resolution_u = 5
    neon = to_mesh(n)
    neon.rotation_euler = (math.radians(90), 0, 0)
    neon.location = (0, -(ext + bev + 0.035), 0)
    select_only([neon])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
    select_only([neon])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    nparts = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.startswith("neon")]
    groups = {i: [] for i in range(7)}
    centers = [sum(v.co.x for v in L.data.vertices) / len(L.data.vertices) for L in letters]
    for p in nparts:
        cx = sum(v.co.x for v in p.data.vertices) / len(p.data.vertices)
        i = min(range(7), key=lambda k: abs(centers[k] - cx))
        groups[i].append(p)
    neons = []
    for i, g in groups.items():
        o = join(g, f"neon_{i}") if len(g) > 1 else g[0]
        o.name = f"neon_{i}"
        o.data.name = o.name
        neons.append(o)

    # bake AO: join letters into one atlas, with a water plane for contact shadow
    gp = ground_plane(zmin + 0.55)
    atlas = join(letters, "letters_atlas")
    uv_unwrap(atlas, 0.004)
    bake_ao(atlas, 2048, "letters")
    delete([gp])
    select_only([atlas])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.startswith("letters_atlas")]
    parts.sort(key=lambda o: sum(v.co.x for v in o.data.vertices) / len(o.data.vertices))
    # boolean bites can split a glyph into islands: regroup by nearest letter centre
    lg = {i: [] for i in range(7)}
    for p in parts:
        cx = sum(v.co.x for v in p.data.vertices) / len(p.data.vertices)
        lg[min(range(7), key=lambda k: abs(centers[k] - cx))].append(p)
    final = []
    for i in range(7):
        o = join(lg[i], f"letter_{i}") if len(lg[i]) > 1 else lg[i][0]
        o.name = f"letter_{i}"
        o.data.name = o.name
        o.data.materials.clear()
        set_origin(o, "base")
        final.append(o)
    for i, nobj in enumerate(neons):
        # parent neon to its letter (identity local transform) so tilting the letter carries the tube
        off = final[i].location.copy()
        nobj.data.transform(Matrix.Translation(-off))
        nobj.location = (0, 0, 0)
        nobj.parent = final[i]
        nobj.matrix_parent_inverse = Matrix.Identity(4)
    export(final + neons, "letters")


# ── 2. torii ─────────────────────────────────────────────────────────────────
def build_torii():
    reset()
    parts = []
    lean = math.radians(1.6)
    for s in (-1, 1):
        p = cyl(f"hashira_{s}", 0.34, 0.29, 6.6, (s * 2.7, 0, 2.7), 28, 0.0)
        p.rotation_euler = (0, -s * lean, 0)
        parts.append(p)
        b = cyl(f"kamebara_{s}", 0.46, 0.40, 0.7, (s * 2.72, 0, -0.35), 28, 0.03)
        parts.append(b)

    def beam(name, L, h, d, z, sori=0.0, segs=48, bevel=0.02):
        o = box(name, (L, d, h), (0, 0, z))
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > 0.5],
                                  cuts=segs, use_grid_fill=True)
        for v in bm.verts:
            t = abs(v.co.x) / (L / 2)
            v.co.z += sori * t ** 3.2
            if t > 0.92:
                v.co.z += (t - 0.92) * 1.6 * sori
        bm.to_mesh(o.data)
        bm.free()
        if bevel:
            m = o.modifiers.new("bev", "BEVEL")
            m.width = bevel
            m.segments = 2
            m.limit_method = "ANGLE"
            apply_mods(o)
        return o

    kasagi = beam("kasagi", 9.0, 0.34, 0.66, 6.05, sori=0.42)
    shimaki = beam("shimaki", 8.4, 0.30, 0.52, 5.72, sori=0.30)
    nuki = beam("nuki", 7.2, 0.34, 0.26, 4.75, sori=0.0, segs=8)
    gaku = box("gakuzuka", (0.34, 0.24, 0.72), (0, 0, 5.2), 0.015)
    parts += [shimaki, nuki, gaku]
    body = join(parts, "torii_body")
    gp = ground_plane(0.0)
    for o in (body, kasagi):
        smooth_shade(o, 40)
        uv_unwrap(o, 0.006)
    bake_ao(body, 1024, "torii_body")
    bake_ao(kasagi, 512, "torii_kasagi")
    delete([gp])
    body.data.materials.clear()
    kasagi.data.materials.clear()
    kasagi.name = "torii_kasagi"
    export([body, kasagi], "torii")


# ── 3. stone lantern (tōrō) ──────────────────────────────────────────────────
def build_toro():
    reset()
    parts = []
    parts.append(cyl("kiso", 0.46, 0.40, 0.16, (0, 0, 0.08), 6, 0.02))
    parts.append(cyl("kiso2", 0.34, 0.28, 0.12, (0, 0, 0.22), 6, 0.015))
    parts.append(cyl("sao", 0.13, 0.12, 0.95, (0, 0, 0.75), 16, 0.01))
    parts.append(cyl("sao_ring", 0.16, 0.16, 0.06, (0, 0, 0.78), 16, 0.01))
    parts.append(cyl("chudai", 0.26, 0.38, 0.18, (0, 0, 1.30), 6, 0.015))
    fire = cyl("hibukuro", 0.27, 0.27, 0.40, (0, 0, 1.59), 6, 0.012)
    for k in range(3):
        a = k * math.pi * 2 / 3
        c = box("win", (0.22, 0.8, 0.24), (math.cos(a) * 0.3, math.sin(a) * 0.3, 1.60))
        c.rotation_euler = (0, 0, a + math.pi / 2)
        boolean(fire, c)
        delete([c])
    hollow = cyl("hollow", 0.2, 0.2, 0.3, (0, 0, 1.6), 6)
    boolean(fire, hollow)
    delete([hollow])
    parts.append(fire)
    kasa = cyl("kasa", 0.58, 0.10, 0.34, (0, 0, 1.96), 6)
    bm = bmesh.new()
    bm.from_mesh(kasa.data)
    for v in bm.verts:
        rr = math.hypot(v.co.x, v.co.y)
        if rr > 0.45:
            v.co.z += 0.10
    bm.to_mesh(kasa.data)
    bm.free()
    m = kasa.modifiers.new("bev", "BEVEL")
    m.width = 0.02
    m.segments = 2
    m.limit_method = "ANGLE"
    apply_mods(kasa)
    parts.append(kasa)
    parts.append(cyl("hoju_base", 0.10, 0.07, 0.07, (0, 0, 2.16), 12))
    h = ico("hoju", 0.09, (0, 0, 2.26), 2)
    h.scale = (1, 1, 1.25)
    parts.append(h)
    toro = join(parts, "toro")
    smooth_shade(toro, 35)
    gp = ground_plane(0.0)
    uv_unwrap(toro, 0.008)
    bake_ao(toro, 1024, "toro")
    delete([gp])
    toro.data.materials.clear()
    # emissive paper insert, lit in three.js
    glow = cyl("toro_light", 0.19, 0.19, 0.30, (0, 0, 1.6), 6)
    export([toro, glow], "toro")


# ── 4. monolith screen (worlds) ──────────────────────────────────────────────
def build_monolith():
    reset()
    R = rnd(11)
    body = box("monolith", (3.5, 0.6, 2.6), (0, 0, 1.55), 0.035)
    plinth = box("plinth", (3.9, 1.0, 0.3), (0, 0, 0.15), 0.03)
    recess = box("recess", (3.06, 0.3, 1.96), (0, -0.33, 1.6))
    boolean(body, recess)
    delete([recess])
    for k in range(6):
        g = box("vent", (0.9, 0.05, 0.05), (0, 0.31, 0.7 + k * 0.28))
        boolean(body, g)
        delete([g])
    for k in range(3):
        c = ico("cut", R.uniform(0.25, 0.45), (R.uniform(0.9, 1.9) * (1 if k % 2 else -1), R.uniform(-0.3, 0.3), 2.85), 1)
        boolean(body, c)
        delete([c])
    cables = []
    for k in range(4):
        cu = bpy.data.curves.new(f"cable{k}", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.035 + 0.02 * R.random()
        cu.bevel_resolution = 2
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(2)
        x0 = R.uniform(-1.4, 1.4)
        pts = [(x0, 0.32, R.uniform(1.2, 2.3)), (x0 + R.uniform(-0.4, 0.4), 0.9, 0.5), (x0 + R.uniform(-1.2, 1.2), 1.8 + R.random(), 0.02)]
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        o = link(bpy.data.objects.new(f"cable{k}", cu))
        cables.append(to_mesh(o))
    mono = join([body, plinth] + cables, "monolith")
    smooth_shade(mono, 35)
    gp = ground_plane(0.0)
    uv_unwrap(mono, 0.006)
    bake_ao(mono, 1024, "monolith")
    delete([gp])
    mono.data.materials.clear()
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    me = bpy.data.meshes.new("monolith_screen")
    bm.to_mesh(me)
    bm.free()
    scr = link(bpy.data.objects.new("monolith_screen", me))
    scr.scale = (3.0, 1.87, 1)
    scr.rotation_euler = (math.radians(90), 0, 0)
    scr.location = (0, -0.20, 1.6)
    select_only([scr])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    export([mono, scr], "monolith")


# ── 5. CRT monitors in a rack (clients) + a single CRT (contact desk) ────────
def crt(name, loc, rot_z=0.0):
    front = box(name + "_f", (0.66, 0.10, 0.54), (0, -0.25, 0), 0.02)
    back = box(name + "_b", (0.62, 0.46, 0.50), (0, 0.03, 0))
    bm = bmesh.new()
    bm.from_mesh(back.data)
    for v in bm.verts:
        if v.co.y > 0:
            v.co.x *= 0.62
            v.co.z *= 0.68
    bm.to_mesh(back.data)
    bm.free()
    rec = box("rec", (0.56, 0.2, 0.44), (0, -0.33, 0.01))
    boolean(front, rec)
    delete([rec])
    o = join([front, back], name)
    o.location = loc
    o.rotation_euler = (0, 0, rot_z)
    select_only([o])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
    return o


def screen_plane(name, w, h, loc, rot_z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.scale = (w, h, 1)
    o.rotation_euler = (math.radians(90), 0, rot_z)
    o.location = loc
    select_only([o])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o


def build_rack():
    reset()
    R = rnd(21)
    parts, screens = [], []
    cw, ch = 0.78, 0.66
    x0 = -1.5 * cw
    for k in range(5):
        parts.append(box(f"shelf{k}", (4 * cw + 0.2, 0.7, 0.05), (0, 0.02, 0.3 + k * ch - ch / 2 + 0.01), 0.01))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box("post", (0.07, 0.07, 4 * ch + 0.5), (sx * (2 * cw + 0.08), sy * 0.32, 0.3 + 2 * ch - ch / 2 + 0.15), 0.008))
    idx = 0
    for row in range(4):
        for col in range(4):
            rz = R.uniform(-0.09, 0.09)
            ox = R.uniform(-0.03, 0.03)
            cx, cz = x0 + col * cw + ox, 0.3 + (3 - row) * ch - ch / 2 + 0.3
            parts.append(crt(f"crt{idx}", (cx, 0, cz), rz))
            sp = screen_plane(f"screen_{idx:02d}", 0.54, 0.41, (0, 0, 0), 0)
            sp.location = (cx + math.sin(rz) * 0.27, -0.27 - (0 if abs(rz) < 1e-3 else 0) , cz + 0.01)
            sp.rotation_euler = (0, 0, rz)
            screens.append(sp)
            idx += 1
    # hanging cables across the front
    for k in range(5):
        cu = bpy.data.curves.new(f"cab{k}", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.02 + 0.015 * R.random()
        cu.bevel_resolution = 2
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(2)
        xa, xb = R.uniform(-1.6, 0), R.uniform(0, 1.6)
        z = R.uniform(1.0, 2.8)
        pts = [(xa, -0.36, z), ((xa + xb) / 2, -0.42, z - R.uniform(0.3, 0.8)), (xb, -0.36, z + R.uniform(-0.2, 0.2))]
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        parts.append(to_mesh(link(bpy.data.objects.new(f"cab{k}", cu))))
    rack = join(parts, "rack")
    smooth_shade(rack, 35)
    gp = ground_plane(-0.02)
    uv_unwrap(rack, 0.004)
    bake_ao(rack, 2048, "rack")
    delete([gp])
    rack.data.materials.clear()
    export([rack] + screens, "rack")

    # single CRT for the writing desk
    reset()
    m = crt("desk_crt", (0, 0, 0.27))
    smooth_shade(m, 35)
    gp = ground_plane(0.0)
    uv_unwrap(m, 0.008)
    bake_ao(m, 512, "desk_crt")
    delete([gp])
    m.data.materials.clear()
    s = screen_plane("desk_screen", 0.54, 0.41, (0, -0.27, 0.28))
    export([m, s], "desk_crt")


# ── 6. rocks ─────────────────────────────────────────────────────────────────
def build_rocks():
    reset()
    R = rnd(31)
    rocks = []
    for i in range(4):
        o = ico(f"rock_{i}", 1.0, (i * 3.0, 0, 0), 4)
        tex = bpy.data.textures.new(f"rt{i}", "CLOUDS")
        tex.noise_scale = 0.55 + 0.2 * R.random()
        tex.noise_depth = 4
        d = o.modifiers.new("disp", "DISPLACE")
        d.texture = tex
        d.strength = 0.55
        d.texture_coords = "OBJECT"
        apply_mods(o)
        tex2 = bpy.data.textures.new(f"rv{i}", "VORONOI")
        tex2.noise_scale = 0.35
        d2 = o.modifiers.new("disp2", "DISPLACE")
        d2.texture = tex2
        d2.strength = 0.18
        apply_mods(o)
        o.scale = (1.0 + 0.4 * R.random(), 0.8 + 0.4 * R.random(), 0.55 + 0.3 * R.random())
        select_only([o])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        zmin = min(v.co.z for v in bm.verts)
        for v in bm.verts:
            if v.co.z < zmin + 0.25:
                v.co.z = zmin + 0.25 - (zmin + 0.25 - v.co.z) * 0.2
        bm.to_mesh(o.data)
        bm.free()
        dec = o.modifiers.new("dec", "DECIMATE")
        dec.ratio = 0.22
        apply_mods(o)
        smooth_shade(o, 50)
        set_origin(o, "base")
        o.location = (i * 3.0, 0, 0)
        rocks.append(o)
    atlas = join([r for r in rocks], "rocks_atlas")
    gp = ground_plane(0.12)
    uv_unwrap(atlas, 0.01)
    bake_ao(atlas, 1024, "rocks")
    delete([gp])
    select_only([atlas])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.startswith("rocks_atlas")]
    parts.sort(key=lambda o: sum(v.co.x for v in o.data.vertices) / len(o.data.vertices))
    out = []
    groups = {}
    for p in parts:
        cx = sum(v.co.x for v in p.data.vertices) / len(p.data.vertices)
        groups.setdefault(round(cx / 3.0), []).append(p)
    for i, (k, g) in enumerate(sorted(groups.items())):
        o = join(g, f"rock_{i}") if len(g) > 1 else g[0]
        o.name = f"rock_{i}"
        o.data.materials.clear()
        set_origin(o, "base")
        o.location = (0, 0, 0)
        out.append(o)
    export(out, "rocks")


BUILDERS = {
    "letters": build_letters,
    "torii": build_torii,
    "toro": build_toro,
    "monolith": build_monolith,
    "rack": build_rack,
    "rocks": build_rocks,
}

if __name__ == "__main__":
    only = [s for s in ARGS.only.split(",") if s]
    for k, fn in BUILDERS.items():
        if only and k not in only:
            continue
        print("──", k)
        fn()
