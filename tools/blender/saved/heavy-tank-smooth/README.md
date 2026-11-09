# Heavy Tank, pre-rendered sprite version (pilot)

`htank_smooth.blend` is the smooth Blender model behind `art/htank/{hull,turret,shadow}.png`. Regenerate the sheets with
`python3 -I tools/blender/htank_sprite.py <out_dir> 32` (needs `pip install bpy pillow`) and copy the three PNGs to `art/htank/`.
The game draws them (art.js `hiSprite`, `blit`) for the Soviet Heavy Tank once they have loaded; `?smooth=off` in the address
turns this off (and the supersampled world drawing in ui.js `draw`).
To go back to the voxel Heavy Tank only: delete the two `hiSprite('htank', ...)` lines in `hullSprite` / `turretSprite` (models.js).
The voxel version is also kept in `../heavy-tank-voxel/` and at git tag `heavy-tank-voxel-v1`.
