import bpy, sys, os
K = sys.argv[sys.argv.index('--') + 1]
OUT = sys.argv[sys.argv.index('--') + 2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(K, 'Model/characterMedium.fbx'))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
arm.animation_data_create()
baked = []
for name in ['idle', 'run', 'jump']:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(K, f'Animations/{name}.fbx'))
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE')
    act = next(a for a in bpy.data.actions if a.name.lower().endswith(name) and a not in baked)
    src.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    # Copy each bone's world transform from the animated armature, then bake it.
    for pb in arm.pose.bones:
        if pb.name in src.pose.bones:
            c = pb.constraints.new('COPY_TRANSFORMS'); c.target = src; c.subtarget = pb.name
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.selected_objects: o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=f0, frame_end=f1, only_selected=True, visual_keying=True, clear_constraints=True, use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    out = arm.animation_data.action
    out.name = name
    out.use_fake_user = True
    baked.append(out)
    arm.animation_data.action = None
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    print('baked', name, f0, f1)
for a in list(bpy.data.actions):
    if a not in baked: bpy.data.actions.remove(a)
for a in baked:
    tr = arm.animation_data.nla_tracks.new(); tr.name = a.name
    tr.strips.new(a.name, int(a.frame_range[0]), a)
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_nla_strips=True, export_image_format='NONE')
