# Heavy Tank, voxel version (saved)

The Soviet Heavy Tank as built in Blender and voxelized for the game, following the owner's reference views
(faceted shield turret, two black oval hatches, short thick twin guns, white rod with a red tip, long low red hull).
Saved on request so it can be restored if the pre-rendered sprite pilot does not work out.

- `htank.py`: the Blender script (needs `pip install bpy`; run `python3 -I htank.py <out_dir>`; uses `../../voxlib.py`, so copy it to
  `tools/blender/htank.py` to run from there)
- `htank.js`: the generated `heavyHull` / `heavyTurret` builders (these sit between the `BLENDER:htank` markers in `src/models.js`)
- `htank_hull.blend`, `htank_turret.blend`: the Blender scenes (flat colours)
- Needs `size: { ..., barrel: 8, tz: 6 }` for the Heavy Tank in `src/data.js` (muzzles at x 14).
- See ../README.md for the commit where this model is in the game.
