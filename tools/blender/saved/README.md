# Saved art experiments

The sandbox cannot push git tags, so these are recorded by commit hash (all are on branch `claude/cross-platform-game-k2d9lb`).

- **Heavy Tank, voxel version** (the one the owner likes): in the game at commit `aa3a6b5` and after; the script, generated code and `.blend`
  files are in `heavy-tank-voxel/`. To restore the game code: `git show aa3a6b5:src/models.js` (the `BLENDER:htank` block) and
  `heavy-tank-voxel/README.md`.
- **Heavy Tank, pre-rendered Blender sprites (pilot, scrapped as too cartoony)**: the whole thing in the game is commit `25ce749`
  (`git show 25ce749`; it added `art/htank/*.png`, `hiSprite`/`blit` in art.js, the supersampled drawing in ui.js and the cache entries in
  sw.js). It was taken out of the game again in the commit after it. The Blender script (`../htank_sprite.py`) and model
  (`heavy-tank-smooth/htank_smooth.blend`) are kept here; the sprite sheets come back with `git checkout 25ce749 -- art`.
