# Pocket Siege

A Cold War real-time strategy game of Allies versus Soviets, in the pre-rendered 3D pixel-art style of the mid-90s classics. It runs in any modern browser: iPhone and iPad (Safari), Android and desktop. It is plain HTML, CSS and JavaScript on a canvas, with no build step and no dependencies. All art is generated in code: every unit, structure, tree and ore pile is a small voxel model rendered with one sun, shading, metal and glass highlights and a cast shadow, then drawn as pixel art. No original game assets are used.

## How it plays

- Start with a Construction Yard and $5000. Build from the sidebar: **Power Plant → Ore Refinery → Barracks → War Factory → Helipad / Airfield**, plus defences.
- **Ore is automatic.** Every refinery comes with an Ore Truck that finds ore, harvests it and brings it home by itself. Ore fields slowly regrow.
- **Units attack on their own.** With *Auto Attack* on (the default), every infantry squad, tank, helicopter and jet attack-moves to the enemy base as soon as it rolls out, fighting anything it meets on the way. Turn it off to keep new units home on guard. Helicopters and jets fly back to their Helipad or Airfield to rearm, then rejoin the attack.
- Keep power above demand, or production slows and Tesla Coils go dark.
- Destroy every enemy structure to win.

## Sound

Everything you hear is synthesised live with the Web Audio API; there are no audio files. Weapons, impacts and explosions are positioned by the camera (louder on screen, panned left or right). Announcements and unit acknowledgements use the device's speech voice. The soundtrack is three original pieces in a 90s industrial-metal style, written as a homage to classic RTS scores: *Iron Fist March*, *Grind Protocol* and *Cold Front*. Music, effects and voice can be switched off in Options. On iPhone the game asks for playback audio, so it plays even with the silent switch on.

| | Allies | Soviets |
| --- | --- | --- |
| Infantry | Rifle Infantry, Rocket Soldier | Rifle Infantry, Rocket Soldier |
| Vehicles | Ranger, Light Tank, Medium Tank, Ore Truck | Heavy Tank, Mammoth Tank, Ore Truck |
| Aircraft | Attack Helicopter, Strike Jet | Hind Gunship, MiG Fighter |
| Defences | Gun Turret, AA Gun | Tesla Coil, SAM Site |

## Controls

| Action | Touch | Mouse / keyboard |
| --- | --- | --- |
| Select | Tap a unit; double-tap for all of that type on screen | Click; double click |
| Select a group | Hold, then drag (or toggle ⬚ and drag) | Drag a box |
| Move / attack | Tap the ground / an enemy | Click the ground / an enemy |
| Deselect | ✕ button | Right click, Esc |
| Build | Tap a sidebar icon; when READY, tap the map to drop a ghost, tap it again to build | Click the icon, then click the map |
| Cancel production | Hold the icon | Right click the icon |
| Scroll / zoom | Drag / pinch, or tap the radar | Arrow keys or WASD, mouse wheel, click the radar |

## Play

- **Locally:** serve the folder (`python3 -m http.server`) and open `http://localhost:8000`.
- **On iPhone:** host the folder anywhere with HTTPS (GitHub Pages works: *Settings → Pages → Deploy from branch*), open it in Safari, then *Share → Add to Home Screen*. It launches full screen and works offline after the first visit. Landscape gives the biggest battlefield; portrait moves the sidebar to the bottom.

## Files

- `src/data.js`: unit, structure, faction and damage tables
- `src/voxel.js`: the voxel renderer (lighting, ambient occlusion, shadows, supersampling)
- `src/models.js`: voxel models for every unit, structure, tree, rock and ore pile
- `src/art.js`: terrain painting, sprite drawing, explosions, smoke and sidebar icons
- `src/world.js`: map generation, pathfinding, combat, harvesting, production, shroud
- `src/ai.js`: the computer opponent
- `src/audio.js`: synthesised sound effects, voice and the music sequencer
- `src/ui.js`: rendering, touch and mouse input, sidebar and menus
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and home-screen install
- `scripts/build-single-file.py`: bundles everything into one HTML file
