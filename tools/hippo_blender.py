"""Hippo character: decimate, limit weights, shrink textures, and write simple animations on the user's skeleton."""
import bpy, sys, math
from mathutils import Quaternion, Vector

SRC, OUT = sys.argv[sys.argv.index('--') + 1], sys.argv[sys.argv.index('--') + 2]
RATIO = float(sys.argv[sys.argv.index('--') + 3]) if len(sys.argv) > sys.argv.index('--') + 3 else 0.04
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
for o in list(scene.objects):
    if o.type == 'MESH' and o.name == 'Icosphere':
        bpy.data.objects.remove(o, do_unlink=True)
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
mesh = next(o for o in scene.objects if o.type == 'MESH')

# ---- Decimate (before the armature modifier) and clean weights ----
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
print('verts before', len(mesh.data.vertices))
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.object.mode_set(mode='OBJECT')
print('verts welded', len(mesh.data.vertices))
dec = mesh.modifiers.new('dec', 'DECIMATE')
dec.ratio = RATIO
dec.use_collapse_triangulate = True
while mesh.modifiers[0].name != 'dec':
    bpy.ops.object.modifier_move_up(modifier='dec')
bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')
print('tris after', sum(len(p.vertices) - 2 for p in mesh.data.polygons), 'verts', len(mesh.data.vertices))

# ---- Textures to 1024 ----
for img in bpy.data.images:
    if img.size[0] > 1024:
        img.scale(1024, 1024)

# ---- Animations ----
# Armature space: +X = character's left, -Y = forward, +Z = up.
FPS = 30
scene.render.fps = FPS
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
pbs = arm.pose.bones
for pb in pbs:
    pb.rotation_mode = 'QUATERNION'

def local(pb, axis, deg):
    """Rotation about an armature-space axis, expressed in the bone's rest frame."""
    B = pb.bone.matrix_local.to_quaternion()
    R = Quaternion(axis, math.radians(deg))
    return B.inverted() @ R @ B

def pose(spec):
    """spec: {bone: [(axis, deg), ...]} -> set rotations; other bones rest."""
    for pb in pbs:
        q = Quaternion()
        for axis, deg in spec.get(pb.name, []):
            q = q @ local(pb, axis, deg)
        pb.rotation_quaternion = q
        pb.location = (0, 0, 0)

def key(frame, spec, hips_z=0.0, hips_y=0.0):
    pose(spec)
    pbs['Hips'].location = Vector((0, 0, 0))
    # Hips location is in bone space; move along armature Z/Y via the rest frame.
    B = pbs['Hips'].bone.matrix_local.to_3x3()
    pbs['Hips'].location = B.inverted() @ Vector((0, hips_y, hips_z))
    for pb in pbs:
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)

# Right arm holds the weapon forward in every pose (TPS stance).
def gun_arm(extra=0):
    return {
        'RightArm': [(X, -70 + extra), (Z, -12)],
        'RightForeArm': [(X, -25)],
        'RightHand': [(X, 10)],
    }

def merge(*specs):
    out = {}
    for s in specs:
        for k, v in s.items():
            out.setdefault(k, []).extend(v)
    return out

actions = []
def make(name, frames, fn, loop=True):
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for f in frames:
        spec, hz, hy = fn(f)
        key(f, spec, hz, hy)
    act.use_fake_user = True
    actions.append(act)
    arm.animation_data.action = None
    print('action', name, frames[0], frames[-1])

def cyc(f, period):
    return math.sin(2 * math.pi * f / period)

# Idle: slow breathing, small sway (60 frames = 2 s).
def idle(f):
    b = cyc(f, 60)
    return merge(gun_arm(), {
        'Spine1': [(X, 2 * b)], 'Spine2': [(X, 1.5 * b)], 'Neck': [(Z, 3 * cyc(f + 10, 60))],
        'LeftArm': [(X, 4 * b), (Y, 4)], 'LeftForeArm': [(X, -8)],
        'LeftUpLeg': [(X, 0)], 'RightUpLeg': [(X, 0)],
    }), -0.01 * (1 - b) * 0.5, 0
make('idle', list(range(0, 61, 5)), idle)

# Walk: 30 frames per cycle.
def walk(f):
    s = cyc(f, 30)
    c = math.cos(2 * math.pi * f / 30)
    return merge(gun_arm(), {
        'LeftUpLeg': [(X, -25 * s)], 'RightUpLeg': [(X, 25 * s)],
        'LeftLeg': [(X, 30 * max(0, -c))], 'RightLeg': [(X, 30 * max(0, c))],
        'LeftFoot': [(X, -10 * s)], 'RightFoot': [(X, 10 * s)],
        'LeftArm': [(X, 18 * s), (Y, 4)], 'LeftForeArm': [(X, -15)],
        'Spine': [(Z, 4 * s)], 'Spine1': [(X, 3)],
    }), -0.03 * abs(c), 0
make('walk', list(range(0, 31, 3)), walk)

# Run: 20 frames per cycle, forward lean, big swings.
def run(f):
    s = cyc(f, 20)
    c = math.cos(2 * math.pi * f / 20)
    return merge(gun_arm(10), {
        'Spine': [(X, 10), (Z, 6 * s)], 'Spine1': [(X, 4)],
        'LeftUpLeg': [(X, -45 * s - 10)], 'RightUpLeg': [(X, 45 * s - 10)],
        'LeftLeg': [(X, 70 * max(0, -c) + 10)], 'RightLeg': [(X, 70 * max(0, c) + 10)],
        'LeftFoot': [(X, -15 * s)], 'RightFoot': [(X, 15 * s)],
        'LeftArm': [(X, 40 * s), (Y, 8)], 'LeftForeArm': [(X, -60)],
    }), -0.06 * abs(c) + 0.02, 0
make('run', list(range(0, 21, 2)), run)

# Jump: crouch, tuck, hold (15 frames, no loop).
def jump(f):
    t = min(1, f / 8)
    return merge(gun_arm(-10 * t), {
        'Spine': [(X, 8 * t)],
        'LeftUpLeg': [(X, -45 * t)], 'RightUpLeg': [(X, -20 * t)],
        'LeftLeg': [(X, 70 * t)], 'RightLeg': [(X, 50 * t)],
        'LeftArm': [(X, -30 * t), (Y, 35 * t)], 'LeftForeArm': [(X, -30 * t)],
    }), 0.05 * t, 0
make('jump', list(range(0, 16, 3)), jump, loop=False)

# Dash: low forward lunge with arms swept back (10 frames).
def dash(f):
    t = min(1, f / 4)
    return merge({
        'Spine': [(X, 28 * t)], 'Spine1': [(X, 8 * t)], 'Neck': [(X, -20 * t)],
        'LeftUpLeg': [(X, -50 * t)], 'RightUpLeg': [(X, 35 * t)],
        'LeftLeg': [(X, 40 * t)], 'RightLeg': [(X, 25 * t)],
        'LeftArm': [(X, 50 * t), (Y, 20 * t)], 'RightArm': [(X, 45 * t), (Y, -20 * t)],
        'LeftForeArm': [(X, -20 * t)], 'RightForeArm': [(X, -20 * t)],
    }), -0.12 * t, 0
make('dash', list(range(0, 11, 2)), dash, loop=False)

# Class dashes (user, 2026-10-29: every class gets its own dash). "dash" above is the Rogue's low lunge.
# Mage: a blink. Rises upright, arms flung open, legs together like floating.
def dash_mage(f):
    t = min(1, f / 3)
    return {
        'Spine': [(X, -8 * t)], 'Spine1': [(X, -4 * t)], 'Neck': [(X, 10 * t)],
        'LeftArm': [(Y, 70 * t), (X, -20 * t)], 'RightArm': [(Y, -70 * t), (X, -20 * t)],
        'LeftForeArm': [(Y, 20 * t)], 'RightForeArm': [(Y, -20 * t)],
        'LeftHand': [(X, -30 * t)], 'RightHand': [(X, -30 * t)],
        'LeftUpLeg': [(X, 8 * t), (Y, -4 * t)], 'RightUpLeg': [(X, 8 * t), (Y, 4 * t)],
        'LeftLeg': [(X, 15 * t)], 'RightLeg': [(X, 15 * t)],
        'LeftFoot': [(X, 35 * t)], 'RightFoot': [(X, 35 * t)],
    }, 0.12 * t, 0
make('dash_mage', list(range(0, 11, 2)), dash_mage, loop=False)

# Fighter: a jet-driven shoulder charge. Left shoulder and guard arm lead, sword arm back.
def dash_fighter(f):
    t = min(1, f / 3)
    return {
        'Spine': [(X, 32 * t), (Z, 30 * t)], 'Spine1': [(X, 8 * t), (Z, 12 * t)], 'Neck': [(Z, -30 * t), (X, -22 * t)],
        'LeftArm': [(X, -95 * t), (Z, 25 * t)], 'LeftForeArm': [(X, -85 * t)],
        'RightArm': [(X, 55 * t), (Y, -30 * t)], 'RightForeArm': [(X, -20 * t)],
        'LeftUpLeg': [(X, -65 * t)], 'RightUpLeg': [(X, 40 * t)],
        'LeftLeg': [(X, 55 * t)], 'RightLeg': [(X, 20 * t)],
        'RightFoot': [(X, 25 * t)],
    }, -0.08 * t, 0
make('dash_fighter', list(range(0, 11, 2)), dash_fighter, loop=False)

# Scout: a feral pounce. Curls forward, both claws reach out, legs kick back.
def dash_scout(f):
    t = min(1, f / 3)
    return {
        'Spine': [(X, 35 * t)], 'Spine1': [(X, 15 * t)], 'Spine2': [(X, 8 * t)], 'Neck': [(X, -35 * t)],
        'LeftArm': [(X, -95 * t), (Y, 10 * t)], 'RightArm': [(X, -95 * t), (Y, -10 * t)],
        'LeftForeArm': [(X, -10 * t)], 'RightForeArm': [(X, -10 * t)],
        'LeftHand': [(X, 25 * t)], 'RightHand': [(X, 25 * t)],
        'LeftUpLeg': [(X, 35 * t)], 'RightUpLeg': [(X, 45 * t)],
        'LeftLeg': [(X, 70 * t)], 'RightLeg': [(X, 80 * t)],
        'LeftFoot': [(X, 30 * t)], 'RightFoot': [(X, 30 * t)],
    }, 0.05 * t, 0
make('dash_scout', list(range(0, 11, 2)), dash_scout, loop=False)

for a in actions:
    tr = arm.animation_data.nla_tracks.new()
    tr.name = a.name
    tr.strips.new(a.name, int(a.frame_range[0]), a)
arm.animation_data.action = None
pose({})
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_nla_strips=True,
                          export_image_format='JPEG', export_jpeg_quality=82, export_yup=True)
print('done')
