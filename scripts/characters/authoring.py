"""Project-local, reproducible Blender/MPFB authoring environment.

Run with Blender's --background --factory-startup --python option. All tool
preferences, downloads and intermediate files stay in the ignored project cache.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache' / 'character-authoring'
ASSETS = CACHE / 'assets'
MPFB_SOURCE = CACHE / 'tools' / 'mpfb2-2.0.17' / 'src'


def initialize():
    import bpy
    sys.path.insert(0, str(MPFB_SOURCE))
    # Source checkouts are imported as `mpfb`, outside Blender's bl_ext registry.
    # Keep the extension's user data in this project when using it headlessly.
    original_path = bpy.utils.extension_path_user
    def extension_path(package, *args, **kwargs):
        if package == 'mpfb':
            folder = CACHE / 'mpfb-user'
            folder.mkdir(exist_ok=True)
            return str(folder)
        return original_path(package, *args, **kwargs)
    bpy.utils.extension_path_user = extension_path
    import mpfb
    original_preference = mpfb.get_preference
    def preference(name):
        if name == 'mpfb_user_data':
            return str(CACHE / 'mpfb-user')
        return original_preference(name)
    mpfb.get_preference = preference
    bpy.context.preferences.addons.new().module = 'mpfb'
    mpfb.register()
    from mpfb.services import LocationService
    LocationService._user_data = str(ASSETS)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    return bpy


if __name__ == '__main__':
    bpy = initialize()
    from mpfb.services import HumanService
    body = HumanService.create_human()
    rig = HumanService.add_builtin_rig(body, 'mixamo')
    print('AUTHORING_READY', len(body.data.vertices), list(rig.pose.bones.keys()))
