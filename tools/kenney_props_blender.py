import bpy, sys, os
args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, names = args[0], args[1], args[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
for name in names:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    empty = bpy.data.objects.new('prop-' + name, None)
    bpy.context.scene.collection.objects.link(empty)
    for o in new:
        if o.parent is None:
            o.parent = empty
for img in bpy.data.images:
    print('img', img.name, img.size[:])
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='AUTO', export_animations=False)
