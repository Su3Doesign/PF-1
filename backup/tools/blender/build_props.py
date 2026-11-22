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


def fix_caps(obj):
    """Text caps come out as separate flat shells, and normals_make_consistent can
    turn some of them inward. Point every cap away from the letter's mid-plane."""
    me = obj.data
    cy = sum(v.co.y for v in me.vertices) / len(me.vertices)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    flip = []
    for f in bm.faces:
        n = f.normal
        if abs(n.y) > 0.6:
            c = f.calc_center_median()
            if (c.y - cy) * n.y < 0:
                flip.append(f)
    if flip:
        bmesh.ops.reverse_faces(bm, faces=flip)
    bm.to_mesh(me)
    bm.free()
    print(f"  {obj.name}: flipped {len(flip)} cap faces")


def tag(obj, k):
    me = obj.data
    a = me.attributes.get("part") or me.attributes.new("part", "INT", "FACE")
    for i in range(len(me.polygons)):
        a.data[i].value = k
    return obj


def split_parts(atlas, names):
    """Split a baked atlas back into its tagged parts, keeping the shared UVs."""
    out = {}
    for k, name in enumerate(names):
        dup = atlas.copy()
        dup.data = atlas.data.copy()
        link(dup)
        bm = bmesh.new()
        bm.from_mesh(dup.data)
        layer = bm.faces.layers.int.get("part")
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[layer] != k], context="FACES")
        bm.to_mesh(dup.data)
        bm.free()
        if "part" in dup.data.attributes:
            dup.data.attributes.remove(dup.data.attributes["part"])
        dup.name = name
        dup.data.name = name
        dup.data.materials.clear()
        out[name] = dup
    delete([atlas])
    return out


def rod(name, p0, p1, r0, r1, verts=12):
    """Tapered cylinder between two points."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    o = cyl(name, r0, r1, d.length, (0, 0, 0), verts)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    o.location = (p0 + p1) / 2
    select_only([o])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def ribbon(name, pts, width, axis=(1, 0, 0)):
    """Flat strip through points, `width` wide along `axis` (film, straps)."""
    ax = Vector(axis).normalized() * (width / 2)
    verts, faces = [], []
    for i, p in enumerate(pts):
        p = Vector(p)
        verts += [p - ax, p + ax]
        if i:
            a = (i - 1) * 2
            faces.append((a, a + 1, a + 3, a + 2))
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    o = link(bpy.data.objects.new(name, me))
    sol = o.modifiers.new("sol", "SOLIDIFY")
    sol.thickness = 0.0015
    apply_mods(o)
    return o


def subsurf(obj, levels=2):
    m = obj.modifiers.new("sub", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    apply_mods(obj)


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
        fix_caps(L)
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


# ── 7. broken television (facts) ─────────────────────────────────────────────
def build_tv():
    reset()
    W, D, H, LEG = 0.74, 0.5, 0.56, 0.07
    zc = LEG + H / 2
    wood = box("tv_cab", (W, D, H), (0, 0, zc), 0.02, 3)
    rec = box("rec", (W - 0.06, 0.08, H - 0.06), (0, -D / 2, zc))
    boolean(wood, rec)
    delete([rec])
    # the CRT's rear hump
    hump = box("hump", (0.5, 0.26, 0.4), (-0.06, D / 2 + 0.1, zc + 0.02), 0.03, 3)
    bm = bmesh.new()
    bm.from_mesh(hump.data)
    for v in bm.verts:
        if v.co.y > 0:
            v.co.x *= 0.62
            v.co.z *= 0.62
    bm.to_mesh(hump.data)
    bm.free()
    legs = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            legs.append(rod(f"leg{sx}{sy}", (sx * (W / 2 - 0.07), sy * (D / 2 - 0.07), LEG + 0.01), (sx * (W / 2 - 0.04), sy * (D / 2 - 0.04), 0.0), 0.022, 0.013, 10))
    wood = join([wood, hump] + legs, "tv_wood")
    smooth_shade(wood, 30)
    tag(wood, 0)

    # dark bezel with a rounded CRT opening, and the control column
    fy = -D / 2 + 0.03
    bez = box("tv_bezel", (0.52, 0.03, H - 0.08), (-0.09, fy, zc), 0.006, 2)
    hole = box("hole", (0.44, 0.2, 0.34), (-0.09, fy, zc + 0.01), 0.04, 6)
    boolean(bez, hole)
    delete([hole])
    panel = box("tv_panel", (0.15, 0.03, H - 0.08), (0.26, fy, zc), 0.006, 2)
    for k in range(9):
        slot = box("slot", (0.11, 0.1, 0.006), (0.26, fy - 0.02, zc - 0.2 + k * 0.016))
        boolean(panel, slot)
        delete([slot])
    trim = [bez, panel]
    for z, r in ((zc + 0.17, 0.03), (zc + 0.06, 0.026)):
        knob = cyl("knob", r, r * 0.9, 0.035, (0.26, fy - 0.03, z), 28, 0.004)
        bm = bmesh.new()
        bm.from_mesh(knob.data)
        for i, v in enumerate(bm.verts):
            if math.hypot(v.co.x, v.co.y) > r * 0.8 and i % 2:
                v.co.x *= 0.93
                v.co.y *= 0.93
        bm.to_mesh(knob.data)
        bm.free()
        knob.rotation_euler = (math.radians(90), 0, 0)
        trim.append(knob)
    for k in range(3):
        trim.append(box("btn", (0.028, 0.02, 0.014), (0.225 + k * 0.035, fy - 0.02, zc - 0.03), 0.003))
    # rabbit-ear antenna, one ear bent
    base_z = LEG + H
    trim.append(cyl("ant_base", 0.055, 0.045, 0.028, (-0.14, 0.05, base_z + 0.014), 24, 0.004))
    trim.append(rod("ear_l", (-0.15, 0.05, base_z + 0.02), (-0.36, 0.1, base_z + 0.5), 0.0045, 0.0025, 8))
    trim.append(rod("ear_r1", (-0.13, 0.05, base_z + 0.02), (0.02, 0.06, base_z + 0.3), 0.0045, 0.0035, 8))
    trim.append(rod("ear_r2", (0.02, 0.06, base_z + 0.3), (0.2, 0.14, base_z + 0.33), 0.0035, 0.0025, 8))
    # mains cable trailing off the back
    pts = [(0.2, D / 2 + 0.05, LEG + 0.12), (0.26, D / 2 + 0.25, LEG + 0.04), (0.2, D / 2 + 0.6, 0.02), (0.35, D / 2 + 1.0, 0.015)]
    from mathutils import geometry as _g  # noqa: F401
    cable = bpy.data.curves.new("cable", "CURVE")
    cable.dimensions = "3D"
    cable.bevel_depth = 0.006
    cable.bevel_resolution = 2
    spl = cable.splines.new("POLY")
    spl.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        spl.points[i].co = (*p, 1)
    co = link(bpy.data.objects.new("cable", cable))
    trim.append(to_mesh(co))
    trim = join(trim, "tv_trim")
    smooth_shade(trim, 35)
    tag(trim, 1)

    atlas = join([wood, trim], "tv_atlas")
    gp = ground_plane(0.0)
    uv_unwrap(atlas, 0.006)
    bake_ao(atlas, 1024, "tv")
    delete([gp])
    parts = split_parts(atlas, ["tv_wood", "tv_trim"])

    # the tube's bulged glass, planar UVs for the picture
    nx, nz = 24, 18
    gw, gh = 0.44, 0.34
    verts, faces, uvs = [], [], []
    for j in range(nz + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / nz
            x, z = (u - 0.5) * gw, (v - 0.5) * gh
            bulge = 0.028 * (1 - (2 * u - 1) ** 2) * (1 - (2 * v - 1) ** 2)
            verts.append((x - 0.09, fy + 0.012 - bulge, zc + 0.01 + z))
            uvs.append((u, v))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + nx + 1, a + nx + 2, a + 1))
    me = bpy.data.meshes.new("tv_screen")
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    me.update()
    screen = link(bpy.data.objects.new("tv_screen", me))
    smooth_shade(screen, 80)
    export([parts["tv_wood"], parts["tv_trim"], screen], "tv")


# ── 8. 16mm film projector on a tripod ───────────────────────────────────────
def build_projector():
    reset()
    Z = 1.18
    body = box("body", (0.17, 0.36, 0.25), (0, 0, Z), 0.014, 3)
    for sx in (-1, 1):
        plate = box("plate", (0.012, 0.3, 0.2), (sx * 0.09, 0, Z), 0.004)
        body = join([body, plate], "body")
    lamp = box("lamp", (0.11, 0.13, 0.15), (0, 0.13, Z + 0.17), 0.012, 3)
    for k in range(6):
        v = box("vent", (0.2, 0.012, 0.012), (0, 0.08 + k * 0.018, Z + 0.21))
        boolean(lamp, v)
        delete([v])
    barrel = cyl("barrel", 0.032, 0.03, 0.13, (0, -0.24, Z - 0.02), 32, 0.004)
    barrel.rotation_euler = (math.radians(90), 0, 0)
    ring = cyl("ring", 0.038, 0.038, 0.022, (0, -0.3, Z - 0.02), 32, 0.004)
    ring.rotation_euler = (math.radians(90), 0, 0)
    focus = cyl("focus", 0.036, 0.036, 0.03, (0, -0.2, Z - 0.02), 32, 0.003)
    focus.rotation_euler = (math.radians(90), 0, 0)
    arm_f = rod("arm_f", (0.1, -0.1, Z + 0.1), (0.1, -0.22, Z + 0.34), 0.012, 0.01, 8)
    arm_r = rod("arm_r", (0.1, 0.08, Z + 0.1), (0.1, 0.24, Z + 0.32), 0.012, 0.01, 8)
    knobs = [cyl("k", 0.018, 0.018, 0.02, (-0.1, y, Z + z), 20, 0.003) for y, z in ((-0.08, -0.05), (0.02, -0.07), (0.1, -0.02))]
    for k in knobs:
        k.rotation_euler = (0, math.radians(90), 0)
    # the film: out of the feed reel, through the gate, round the sprockets, up to the take-up
    rf, rr = Vector((0.1, -0.22, Z + 0.34)), Vector((0.1, 0.24, Z + 0.32))
    film_pts = [rf + Vector((0, 0.06, -0.12)), (0.1, -0.12, Z + 0.1), (0.1, -0.1, Z + 0.02), (0.1, -0.06, Z - 0.07),
                (0.1, 0.04, Z - 0.1), (0.1, 0.12, Z - 0.02), (0.1, 0.14, Z + 0.1), rr + Vector((0, -0.07, -0.12))]
    film = ribbon("film", [tuple(p) for p in film_pts], 0.016, (1, 0, 0))
    # tripod
    tri = [cyl("head", 0.05, 0.06, 0.05, (0, 0, Z - 0.15), 24, 0.005), rod("col", (0, 0, Z - 0.17), (0, 0, 0.72), 0.014, 0.014, 12),
           cyl("hub", 0.04, 0.04, 0.05, (0, 0, 0.72), 24, 0.004)]
    for k in range(3):
        a = k * math.pi * 2 / 3 + 0.4
        foot = (math.cos(a) * 0.48, math.sin(a) * 0.48, 0.0)
        tri.append(rod(f"leg{k}", (math.cos(a) * 0.03, math.sin(a) * 0.03, 0.74), foot, 0.013, 0.009, 10))
        tri.append(rod(f"brace{k}", (0, 0, 0.5), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.28), 0.005, 0.005, 6))
        tri.append(cyl(f"foot{k}", 0.016, 0.02, 0.02, foot, 12))
    proj = join([body, lamp, barrel, ring, focus, arm_f, arm_r, film] + knobs + tri, "projector")
    smooth_shade(proj, 35)
    tag(proj, 0)

    def reel(name, c):
        disc = cyl(name, 0.15, 0.15, 0.012, (0, 0, 0), 64, 0.002)
        for k in range(3):
            a = k * math.pi * 2 / 3
            h = cyl("h", 0.052, 0.052, 0.1, (math.cos(a) * 0.085, math.sin(a) * 0.085, 0), 32)
            boolean(disc, h)
            delete([h])
        spool = cyl("spool", 0.07 + 0.03 * (name == "reel_front"), 0.07 + 0.03 * (name == "reel_front"), 0.018, (0, 0, 0), 48)
        hub = cyl("hub", 0.02, 0.02, 0.03, (0, 0, 0), 16)
        r = join([disc, spool, hub], name)
        r.rotation_euler = (0, math.radians(90), 0)
        r.location = c
        select_only([r])
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
        smooth_shade(r, 35)
        return r
    front = tag(reel("reel_front", rf + Vector((0.035, 0, 0))), 1)
    rear = tag(reel("reel_rear", rr + Vector((0.035, 0, 0))), 2)
    atlas = join([proj, front, rear], "proj_atlas")
    gp = ground_plane(0.0)
    uv_unwrap(atlas, 0.006)
    bake_ao(atlas, 1024, "projector")
    delete([gp])
    parts = split_parts(atlas, ["projector", "reel_front", "reel_rear"])
    for n in ("reel_front", "reel_rear"):
        set_origin(parts[n], "center")
    lens = cyl("proj_lens", 0.027, 0.027, 0.004, (0, -0.313, Z - 0.02), 32)
    lens.rotation_euler = (math.radians(90), 0, 0)
    export([parts["projector"], parts["reel_front"], parts["reel_rear"], lens], "projector")


# ── 9. floating paper lantern (tōrō nagashi) ─────────────────────────────────
def build_lantern():
    reset()
    S, Hh = 0.3, 0.32
    parts = [box("tray", (S, S, 0.03), (0, 0, 0.015), 0.004)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box("post", (0.016, 0.016, Hh), (sx * (S / 2 - 0.012), sy * (S / 2 - 0.012), 0.03 + Hh / 2), 0.002))
    for k in range(4):
        a = k * math.pi / 2
        bar = box("bar", (S, 0.016, 0.016), (math.sin(a) * (S / 2 - 0.012), math.cos(a) * (S / 2 - 0.012), 0.03 + Hh), 0.002)
        bar.rotation_euler = (0, 0, a)
        parts.append(bar)
        mid = box("mid", (S, 0.01, 0.01), (math.sin(a) * (S / 2 - 0.012), math.cos(a) * (S / 2 - 0.012), 0.03 + Hh * 0.52), 0.001)
        mid.rotation_euler = (0, 0, a)
        parts.append(mid)
    frame = join(parts, "lantern_frame")
    smooth_shade(frame, 30)
    gp = ground_plane(0.0)
    uv_unwrap(frame, 0.01)
    bake_ao(frame, 512, "lantern")
    delete([gp])
    frame.data.materials.clear()
    # four paper walls, each with its own 0..1 UVs
    verts, faces, uvs = [], [], []
    h0, h1 = 0.03, 0.03 + Hh
    r = S / 2 - 0.014
    corners = [(-r, -r), (r, -r), (r, r), (-r, r)]
    for k in range(4):
        (x0, y0), (x1, y1) = corners[k], corners[(k + 1) % 4]
        b = len(verts)
        verts += [(x0, y0, h0), (x1, y1, h0), (x1, y1, h1), (x0, y0, h1)]
        uvs += [(0, 0), (1, 0), (1, 1), (0, 1)]
        faces.append((b, b + 1, b + 2, b + 3))
    me = bpy.data.meshes.new("lantern_paper")
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    me.update()
    paper = link(bpy.data.objects.new("lantern_paper", me))
    candle = cyl("lantern_candle", 0.02, 0.02, 0.06, (0, 0, 0.06), 16)
    export([frame, paper, candle], "lantern")


# ── 10. kodama: the small tree spirits hiding in the forest ──────────────────
def build_kodama():
    reset()
    R = rnd(41)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=0.1)
    for v in bm.verts:
        n = 1 + 0.035 * math.sin(v.co.x * 40 + 1) * math.sin(v.co.z * 30)
        v.co = Vector((v.co.x * 1.02 * n, v.co.y * 0.92 * n, v.co.z * 1.14 * n))
    me = bpy.data.meshes.new("kodama_head")
    bm.to_mesh(me)
    bm.free()
    head = link(bpy.data.objects.new("kodama_head", me))
    for (x, z, r, d) in ((-0.036, 0.018, 0.016, 0.06), (0.034, 0.014, 0.014, 0.06), (0.004, -0.042, 0.011, 0.05)):
        c = ico("eye", r, (x, -0.1, z), 3)
        c.scale = (1, d / r, 1.15)
        boolean(head, c)
        delete([c])
    smooth_shade(head, 60)
    head.location = (0, 0, 0.26)
    select_only([head])
    bpy.ops.object.transform_apply(location=True)
    parts = []
    torso = cyl("torso", 0.028, 0.042, 0.13, (0, 0, 0.1), 24)
    parts.append(torso)
    for sx in (-1, 1):
        parts.append(rod("arm", (sx * 0.03, 0, 0.14), (sx * 0.06, -0.01, 0.07), 0.012, 0.009, 10))
        parts.append(rod("leg", (sx * 0.018, 0, 0.04), (sx * 0.024, 0.0, 0.0), 0.012, 0.011, 10))
    body = join(parts, "kodama_body")
    subsurf(body, 2)
    smooth_shade(body, 80)
    set_origin(head, "base")
    export([head, body], "kodama")


# ── 11. the forest spirit: a deer of light, grown from a skin skeleton ───────
def skin_creature(name, verts, edges, radii, root=0, levels=2):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, edges, [])
    me.update()
    o = link(bpy.data.objects.new(name, me))
    sk = o.modifiers.new("skin", "SKIN")
    sk.use_smooth_shade = True
    for i, r in enumerate(radii):
        o.data.skin_vertices[0].data[i].radius = r if isinstance(r, tuple) else (r, r)
        o.data.skin_vertices[0].data[i].use_root = (i == root)
    apply_mods(o)
    subsurf(o, levels)
    smooth_shade(o, 80)
    return o


def build_deer():
    reset()
    # a red deer stag, front toward -Y: slim legs, deep chest, neck raised
    V = [
        (0, 0.0, 1.0),                                     # 0 mid back (root)
        (0, -0.42, 1.04), (0, 0.45, 1.02), (0, 0.6, 1.02), # 1 withers 2 rump 3 tail root
        (0, 0.66, 1.06),                                   # 4 tail tip
        (0, -0.4, 0.78),                                   # 5 brisket
        (0, -0.56, 1.2), (0, -0.66, 1.38),                 # 6 7 neck
        (0, -0.72, 1.46),                                  # 8 poll (head)
        (0, -0.94, 1.36),                                  # 9 muzzle
        (-0.07, -0.72, 1.55), (0.07, -0.72, 1.55),         # 10 11 ear roots
        (-0.16, -0.69, 1.61), (0.16, -0.69, 1.61),         # 12 13 ear tips
        (-0.11, -0.38, 0.72), (0.11, -0.38, 0.72),         # 14 15 elbows
        (-0.11, -0.4, 0.4), (0.11, -0.36, 0.42),           # 16 17 front knees
        (-0.11, -0.42, 0.02), (0.11, -0.34, 0.03),         # 18 19 front hooves
        (-0.12, 0.42, 0.78), (0.12, 0.42, 0.78),           # 20 21 stifles
        (-0.11, 0.56, 0.46), (0.11, 0.56, 0.46),           # 22 23 hocks
        (-0.11, 0.48, 0.02), (0.11, 0.5, 0.02),            # 24 25 hind hooves
    ]
    E = [(0, 1), (0, 2), (2, 3), (3, 4), (1, 5), (1, 6), (6, 7), (7, 8), (8, 9), (8, 10), (8, 11), (10, 12), (11, 13),
         (5, 14), (5, 15), (14, 16), (15, 17), (16, 18), (17, 19),
         (2, 20), (2, 21), (20, 22), (21, 23), (22, 24), (23, 25)]
    Rr = [(0.17, 0.2), (0.14, 0.17), (0.16, 0.18), 0.06, 0.03, (0.13, 0.12),
          (0.09, 0.1), (0.07, 0.075), (0.06, 0.07), (0.028, 0.034), 0.02, 0.02, (0.03, 0.006), (0.03, 0.006),
          0.045, 0.045, 0.024, 0.024, 0.018, 0.018,
          0.07, 0.07, 0.028, 0.028, 0.018, 0.018]
    body = skin_creature("deer_body", V, E, Rr, 0, 2)
    # antlers: a main beam sweeping up and back, with tines rising off it
    tines = []
    for sx in (-1, 1):
        beam = [(sx * 0.04, -0.7, 1.55), (sx * 0.14, -0.64, 1.72), (sx * 0.24, -0.56, 1.9), (sx * 0.26, -0.6, 2.08), (sx * 0.2, -0.7, 2.22)]
        for i in range(len(beam) - 1):
            r0 = 0.022 - i * 0.004
            tines.append(rod("beam", beam[i], beam[i + 1], r0, r0 - 0.004, 10))
        for i, (dx, dy, dz, L) in enumerate(((0.02, -0.16, 0.08, 0.2), (0.05, -0.12, 0.2, 0.22), (0.08, -0.06, 0.2, 0.2), (0.0, -0.1, 0.16, 0.16))):
            p0 = Vector(beam[i + 1])
            d = Vector((sx * dx, dy, dz)).normalized()
            tines.append(rod("tine", tuple(p0), tuple(p0 + d * L), 0.012, 0.004, 8))
    antlers = join(tines, "deer_antlers")
    smooth_shade(antlers, 60)
    export([body, antlers], "deer")


# ── 12. a whale made of light, for the dawn sky over the sea ─────────────────
def build_whale():
    reset()
    # a humpback: broad head, deep chest, long tapering tail stock; front toward -Y
    V = [(0, -6.2, 0.35), (0, -4.8, 0.2), (0, -3.0, 0.0), (0, -1.0, -0.05), (0, 1.0, 0.05), (0, 2.8, 0.2), (0, 4.2, 0.3), (0, 5.3, 0.35), (0, 6.0, 0.35)]
    E = [(i, i + 1) for i in range(len(V) - 1)]
    Rr = [(0.75, 0.45), (1.2, 0.85), (1.55, 1.2), (1.5, 1.25), (1.2, 1.05), (0.8, 0.75), (0.45, 0.48), (0.24, 0.3), (0.14, 0.12)]
    body = skin_creature("whale_body", V, E, Rr, 3, 2)
    fins = []
    for sx in (-1, 1):
        f = ico("fin", 1.0, (sx * 2.7, -2.1, -0.75), 3)
        f.scale = (2.4, 0.42, 0.07)
        f.rotation_euler = (0, sx * 0.3, sx * 0.55)
        fins.append(f)
        fl = ico("fluke", 1.0, (sx * 1.05, 6.35, 0.35), 3)
        fl.scale = (1.25, 0.5, 0.05)
        fl.rotation_euler = (0, 0, sx * 0.4)
        fins.append(fl)
    dorsal = ico("dorsal", 1.0, (0, 2.6, 1.05), 3)
    dorsal.scale = (0.06, 0.45, 0.28)
    dorsal.rotation_euler = (math.radians(-25), 0, 0)
    fins.append(dorsal)
    for f in fins:
        select_only([f])
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    whale = join([body] + fins, "whale")
    smooth_shade(whale, 80)
    export([whale], "whale")


BUILDERS = {
    "letters": build_letters,
    "torii": build_torii,
    "toro": build_toro,
    "monolith": build_monolith,
    "rack": build_rack,
    "rocks": build_rocks,
    "tv": build_tv,
    "projector": build_projector,
    "lantern": build_lantern,
    "kodama": build_kodama,
    "deer": build_deer,
    "whale": build_whale,
}

if __name__ == "__main__":
    only = [s for s in ARGS.only.split(",") if s]
    for k, fn in BUILDERS.items():
        if only and k not in only:
            continue
        print("──", k)
        fn()
