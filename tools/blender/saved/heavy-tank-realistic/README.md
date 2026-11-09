# Heavy Tank, realistic stills (a test of the realism direction; not in the game)

A detailed, weathered Heavy Tank rendered in Blender (Cycles), kept separate from the game on purpose so it can be picked up again.

- `real_3q.jpg`, `real_side.jpg`, `real_rear.jpg`: the stills (1400 px wide).
- `at_game_size.png`: the same tank shrunk to 24, 48, 96 and 200 px wide (each shown 4x). Realism only reads from about 96 px up, so going
  this way means larger units on screen (a bigger zoom or cell size), not just new art.
- `htank_real.blend`: the Blender scene. The script that builds and renders it is `../../htank_real.py`
  (`python3 -I tools/blender/htank_real.py <out_dir> [width=1400] [samples=128]`; needs `pip install bpy pillow numpy`; about 8 minutes at 1400 px / 96 samples).

Things noted for next time: the guns are still the short thick game proportions (stubby when real); a deeper red would look more military;
the mud on the tracks reads a little like beige plaster; more panel lines and stowage; a farther, higher camera. The paint, wear and ground
materials are procedural (see `weathered()` in the script).
Related saved work: `../README.md` (the voxel Heavy Tank and the scrapped pre-rendered sprite pilot).
