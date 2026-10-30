"""Add the S4-style moves to the player's hippo: a cartwheel (side dash) and a long-stride sprint.

Keeps every animation already in the file and adds two new ones. Timing comes from the
user's own S4 League recordings, studied frame by frame (see the project file
design/s4-video-analizi-animasyon-spec.md). The poses are hand-keyed here from scratch:
nothing from S4 is used.

The cartwheel is in place: the game turns the whole body around its forward axis in code
(src/main.ts, cartwheelKeys), this animation only moves the limbs (legs split at the top,
arms tucked, a reaching landing).

Run: python3 tools/hippo_moves_blender.py -- src/assets/hippo.glb src/assets/hippo.glb
(needs Blender or the `bpy` pip package).
"""
import bpy, sys, math
from mathutils import Quaternion, Vector

SRC, OUT = sys.argv[sys.argv.index('--') + 1], sys.argv[sys.argv.index('--') + 2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')

# Keep the file's frame rate so the old animations keep their speed; new keys use fractional frames.
FPS = scene.render.fps
arm.animation_data.action = None
# Armature space: +X = character's left, -Y = forward, +Z = up.
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
pbs = arm.pose.bones
for pb in pbs:
    pb.rotation_mode = 'QUATERNION'


def local(pb, axis, deg):
    """Rotation about an armature-space axis, expressed in the bone's rest frame."""
    B = pb.bone.matrix_local.to_quaternion()
    return B.inverted() @ Quaternion(axis, math.radians(deg)) @ B


def key(frame, spec, hips_z=0.0):
    for pb in pbs:
        q = Quaternion()
        for axis, deg in spec.get(pb.name, []):
            q = q @ local(pb, axis, deg)
        pb.rotation_quaternion = q
        pb.location = (0, 0, 0)
    B = pbs['Hips'].bone.matrix_local.to_3x3()
    pbs['Hips'].location = B.inverted() @ Vector((0, 0, hips_z))
    for pb in pbs:
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)


def merge(*specs):
    out = {}
    for s in specs:
        for k, v in s.items():
            out.setdefault(k, []).extend(v)
    return out


def gun_arm(extra=0):
    """Right arm holds the weapon forward (same stance as the other hippo animations)."""
    return {'RightArm': [(X, -70 + extra), (Z, -12)], 'RightForeArm': [(X, -25)], 'RightHand': [(X, 10)]}


def ms(t):
    return t * FPS / 1000


def make(name, keys):
    arm.animation_data_create()
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for frame, spec, hz in keys:
        key(frame, spec, hz)
    act.use_fake_user = True
    arm.animation_data.action = None
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, int(act.frame_range[0]), act)
    print('action', name, act.frame_range[:])


# ---- Cartwheel: 0.40 s, no wind-up -------------------------------------------------
# Leg spread is a turn about the forward axis (Y): + opens the left leg outward, - the right.
def legs(split, lead_bend=0, trail_bend=0, lead_fwd=0, trail_fwd=0):
    return {
        'LeftUpLeg': [(Y, -split), (X, lead_fwd)], 'RightUpLeg': [(Y, split), (X, trail_fwd)],
        'LeftLeg': [(X, lead_bend)], 'RightLeg': [(X, trail_bend)],
        'LeftFoot': [(X, 20)], 'RightFoot': [(X, 20)],
    }


def tucked_left_arm(open_deg=0):
    # Free arm close to the body, opening a little at the top for balance.
    return {'LeftArm': [(Y, 10 + open_deg), (X, 10)], 'LeftForeArm': [(X, -70)]}


cart = [
    # 0 ms push-off: lean into the dash, one leg straight up and out.
    (ms(0), merge(gun_arm(), tucked_left_arm(), legs(35, 10, 0, -15, 0), {'Spine': [(Y, 12)]}), -0.04),
    # 25 ms take-off: kick leg high, push leg still on the ground.
    (ms(25), merge(gun_arm(), tucked_left_arm(), legs(55, 0, 0, -10, 0), {'Spine': [(Y, 10)]}), 0.0),
    # 75 ms rising: wide V (~120 degrees).
    (ms(75), merge(gun_arm(-5), tucked_left_arm(10), legs(62, 0, 0), {'Spine': [(Y, 4)]}), 0.04),
    # 100 ms upside down: vertical V.
    (ms(100), merge(gun_arm(-5), tucked_left_arm(20), legs(72, 0, 0)), 0.06),
    # 125-175 ms hang at the top: legs nearly flat, a full split (inverted T), held.
    (ms(125), merge(gun_arm(-5), tucked_left_arm(30), legs(84, 0, 0)), 0.07),
    (ms(175), merge(gun_arm(-5), tucked_left_arm(30), legs(86, 0, 0)), 0.07),
    # 200 ms the leading leg starts down.
    (ms(200), merge(gun_arm(), tucked_left_arm(20), legs(75, 10, 0)), 0.05),
    # 250 ms turning and firing: legs closing.
    (ms(250), merge(gun_arm(), tucked_left_arm(10), legs(55, 20, 0)), 0.03),
    # 325 ms recovery: first foot reaches for the ground, back leg stays long (arabesque).
    (ms(325), merge(gun_arm(), tucked_left_arm(), legs(30, 15, 0, -25, 35), {'Spine': [(X, 12)]}), -0.02),
    # 365 ms one-foot touchdown, body forward, back leg still long.
    (ms(365), merge(gun_arm(), tucked_left_arm(), legs(12, 25, 10, -20, 30), {'Spine': [(X, 14)]}), -0.05),
    # 400 ms both feet down, no crouch: straight back into the run.
    (ms(400), merge(gun_arm(10), {'LeftArm': [(X, 10), (Y, 8)], 'LeftForeArm': [(X, -50)]}, legs(4, 15, 25, -15, 10), {'Spine': [(X, 10)]}), -0.03),
]
make('cartwheel', cart)


# ---- Sprint: long, low, bounding strides; 0.40 s per cycle -------------------------
# Gun forward at chest height, the free arm straight back and down, almost no arm swing.
def sprint_pose(phase):
    s = math.sin(2 * math.pi * phase)
    c = math.cos(2 * math.pi * phase)
    flight = max(0.0, abs(s) - 0.6) / 0.4  # both feet off the ground at the ends of each stride
    return merge(gun_arm(15), {
        'Spine': [(X, 8), (Z, 4 * s)], 'Spine1': [(X, 4)], 'Neck': [(X, -8)],
        'LeftArm': [(X, 55 + 4 * s), (Y, 12)], 'LeftForeArm': [(X, -8)],
        'LeftUpLeg': [(X, -60 * s - 8)], 'RightUpLeg': [(X, 60 * s - 8)],
        'LeftLeg': [(X, 85 * max(0, -c) + 8)], 'RightLeg': [(X, 85 * max(0, c) + 8)],
        'LeftFoot': [(X, -20 * s)], 'RightFoot': [(X, 20 * s)],
    }), -0.07 + 0.06 * flight


CYCLE = 0.40
steps = 8
make('sprint', [(i * CYCLE * FPS / steps, *sprint_pose(i / steps)) for i in range(steps + 1)])

# Export every action (old and new) as its own animation.
for o in scene.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=False,
                          export_image_format='JPEG', export_jpeg_quality=82, export_yup=True)
print('done')
