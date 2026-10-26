# Pocket Siege

A Cold War real-time strategy game of Allies versus Soviets, in the pre-rendered 3D pixel-art style of the mid-90s classics. It runs in any modern browser: iPhone and iPad (Safari), Android and desktop. It is plain HTML, CSS and JavaScript on a canvas, with no build step and no dependencies. All art is generated in code: every unit, structure, tree and ore pile is a small voxel model rendered with one sun, shading, metal and glass highlights and a cast shadow, then drawn as pixel art. No original game assets are used.

## How it plays

- Start with a Construction Yard and $5000. Build from the sidebar: **Power Plant → Ore Refinery → Barracks → War Factory → Helipad / Airfield**, plus defences.
- **Ore is automatic.** Every refinery comes with an Ore Truck that finds ore, harvests it and brings it home by itself. Ore fields slowly regrow.
- **The map** takes its layout from the classic Red Alert map *A Path Beyond*: an island where two long lakes cut across the middle between the bases. Armies cross over the land gap in the centre (the main road), over a timber bridge across either lake, or round the far ends of the lakes along the edges of the map. Ore fields lie beside each base, on the lake shores between the crossings and beside the flank routes, all clear of the attack routes. Woods, rocks and shorelines vary each game; the layout is mirrored so both sides are equal. It is sized for 1v1 (72 x 72 cells); the layout scales with the map size.
- **Units attack in groups.** New units gather at a rally point in front of the base. With *Auto Attack* on (the default), they move out together once 8 have gathered, marching in formation (tanks spread across the front, infantry behind) at the pace of the slowest, and head for the enemy Construction Yard, fighting anything they meet on the way. The AUTO button shows how many are waiting. Turn it off to keep new units home on guard. A new Helipad comes with a free helicopter and a new Airfield with a free jet. Helicopters and jets do not wait for a group: each one takes off on its own as soon as it is built, and flies back to its Helipad or Airfield to rearm before rejoining the attack.
- **Base and Ore Truck defence.** Idle units waiting near a base attack any enemy ground units that get near or inside it, or that shoot at an Ore Truck nearby, with Auto Attack on or off. Each goes for the nearest raider it can hit, and they stay on it until the area has been quiet for a few seconds before returning to where they were (attack waves never pull defenders away mid-fight). Units you have sent somewhere stay on their orders. The computer also recalls attack groups still on their way out.
- **Aircraft on the ground and shot down.** Helicopters and jets park on their Helipad or Airfield, each in its own slot, with ammunition pips filling up as they rearm. With Auto Attack off they wait there until ordered or until the base is attacked. When one is shot down its pilot bails out and parachutes down to fight on as infantry, and the aircraft falls trailing smoke, crashes and leaves a burning wreck.
- **A battlefield that remembers.** Destroyed vehicles and downed aircraft leave blackened wrecks that smoulder for a while and stay for the rest of the game, and shells, rockets, grenades and bombs leave craters. Both are painted into the ground, so a long battle costs no extra performance.
- **Airfield support powers.** Owning an Airfield charges three powers at the top of the left sidebar column: a **Spy Plane** (60 s) that reveals a wide area, **Paratroopers** (150 s) that drop a squad of five infantry, and a **Bombing Run** (200 s) that carpet-bombs a strip of ground. They charge at half speed on low power. Tap one when it shows READY, tap the target (tap again or press LAUNCH to confirm on touch screens), and a plane flies in from behind your base. AA guns and SAM sites can shoot the planes down. The computer uses Paratroopers and Bombing Runs too.
- Keep power above demand, or production slows and Tesla Coils go dark.
- Destroy the enemy Construction Yard to win; lose yours and the mission is over. Construction Yards cannot be sold.

## Sound

Battle sound effects are freely licensed recordings (CC0 and CC-BY, credited in [CREDITS.md](CREDITS.md) and the in-game Credits), processed by `scripts/make_sfx.py`; interface sounds are synthesised live with the Web Audio API. Weapons, impacts and explosions are positioned by the camera (louder on screen, panned left or right). Fighting anywhere else on the map stays faintly audible as a muffled rumble from its direction, with its own share of sound channels so a big fight on screen never silences it. Announcements (a female EVA-style voice) and unit replies (men's voices: riflemen on a field radio, tank crews over a muffled intercom, pilots on an aircraft radio) are pre-recorded with the open-source [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) neural voice (Apache-2.0), processed with ffmpeg and embedded in `src/voices.js`. `scripts/make_voices.py` regenerates them. The soundtrack is four original pieces in a 90s industrial-metal style, written as a homage to classic RTS scores: *Night Sortie* (a slow, smooth half-time groove with strings and a brass melody), *Iron Fist March*, *Grind Protocol* and *Cold Front*, all slow and smooth. The sequencer plays them on recorded instruments (a real drum kit, double-tracked distorted guitars, picked bass, trumpet and horn leads, trombone stabs, string sections, anvil and timpani; all CC0 or CC-BY and credited), rendered into `src/music.js` by `scripts/make_music.py`. Music, effects and voice can be switched off in Options. On iPhone the game asks for playback audio, so it plays even with the silent switch on.

| | Allies | Soviets |
| --- | --- | --- |
| Infantry | Rifle Infantry, Rocket Soldier | Rifle Infantry, Grenadier, Rocket Soldier |
| Vehicles | Ranger, Light Tank, Medium Tank, Ore Truck | Heavy Tank, Mammoth Tank, Ore Truck |
| Aircraft | Attack Helicopter, Strike Jet | Hind Gunship, MiG Fighter |
| Defences | Pillbox, Gun Turret, AA Gun | Flame Tower, Tesla Coil, SAM Site |

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
- `src/audio.js`: sound effect, voice and instrument playback, and the music sequencer
- `src/sfx.js`: the recorded battle sound effects (generated by `scripts/make_sfx.py`)
- `src/music.js`: the recorded soundtrack instruments (generated by `scripts/make_music.py`)
- `src/voices.js`: the pre-recorded voice lines (generated by `scripts/make_voices.py`)
- `src/ui.js`: rendering, touch and mouse input, sidebar and menus
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and home-screen install
- `scripts/build-single-file.py`: bundles everything into one HTML file
