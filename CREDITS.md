# Credits

Red Horizon's code, art, music compositions and interface sounds are original. The recorded
sound effects, instrument samples, voices and fonts below come from freely licensed sources.
Sounds are trimmed, pitched, mixed, filtered and level-matched for the game by
`scripts/make_sfx.py`, `scripts/make_music.py` and `scripts/make_voices.py`.

## Sound effects (OpenGameArt.org unless noted)

| Used for | Sound | Author | Licence |
|---|---|---|---|
| Machine guns | [Gunshots!](https://opengameart.org/content/gunshots-0) | dklon | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Rocket and missile launches | [Rocket Launch Pack](https://opengameart.org/content/rocket-launch-pack) | dklon | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Missile hits, vehicle explosions | [2 High Quality Explosions](https://opengameart.org/content/2-high-quality-explosions) | qubodup | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Vehicle and building explosions | [Big Explosion](https://opengameart.org/content/big-explosion) | Lamoot | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Infantry deaths | [11 male human pain/death sounds](https://opengameart.org/content/11-male-human-paindeath-sounds) | Michel Baradari | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Tesla Coil | [Tesla coil powered death ray sound](https://opengameart.org/content/tesla-coil-powered-death-ray-sound) | Varkalandar | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Allied rifles | [M16 Assault Rifle](https://soundbible.com/1376-M16-Assault-Rifle.html) (SoundBible) | snottyboi | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Soviet rifles | [Gunshot Sounds](https://opengameart.org/content/gunshot-sounds) (SKS) | Vincent Sevedge (Tabasco) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Tank guns, shell hits, AA guns | [25 CC0 bang / firework SFX](https://opengameart.org/content/25-cc0-bang-firework-sfx) | rubberduck | CC0 |
| Shell hits, construction clanks, collapsing buildings | [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx) | rubberduck | CC0 |
| Tank guns, turret, hits, building explosions | [Cannon fire](https://opengameart.org/content/cannon-fire), [Cannon hit](https://opengameart.org/content/cannon-hit), [Battle at sea](https://opengameart.org/content/battle-at-sea) | thimras | CC0 |
| Flame Tower | [Catching fire](https://opengameart.org/content/catching-fire) | themightyglider | CC0 |
| Flame Tower | [Fire Crackling](https://opengameart.org/content/fire-crackling) | Antum Deluge | CC0 |

## Recorded track

"Industry", "War", "Smash", "Rain", "Airstrike" and "Roll" (`music/*.mp3`) are recorded pieces supplied by the owner, converted to a
96 kbps MP3 and level-matched with ffmpeg. They are currently the whole soundtrack.

## Music instruments

The sequenced soundtrack pieces were original (all removed for now, the instruments stay in the code for a new soundtrack). They were played on these recorded instruments,
cut into single notes, power chords, brass stabs, string chords and drum hits:

| Used for | Sample library | Author | Licence |
|---|---|---|---|
| Drums: kick, snare, hi-hats, crash, china, toms, marching boots | [MuldjordKit](https://github.com/freepats/muldjordkit) (FreePats version) | Lars Muldjord; FreePats edition by Roberto (zenvoid.org) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Rhythm guitars | [Electric Guitar FSBS dist1](https://github.com/freepats/electric-guitar-FSBS-dist1) | FreePats (Roberto, zenvoid.org) | CC0 |
| Bass | [Picked Bass YR](https://github.com/freepats/electric-bass-YR) | Andrea Biasior; edited for FreePats by Roberto (zenvoid.org) | CC0 |
| Brass lead, brass stabs, string pads | [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE): trumpet, French horn, tenor trombone, cello and viola sections | Versilian Studios (Samuel Gossner) | CC0 |
| Anvil, brake drum, timpani | [Versilian Community Sample Library](https://github.com/sgossner/VCSL) | Versilian Studios (Samuel Gossner) | CC0 |

Changes to the MuldjordKit samples: single hits were chosen, trimmed, mixed to mono and
re-encoded; the marching boots mix a soft kick with a dampened snare.

## Voices

EVA announcements, unit replies and the soundtrack's gang shouts are generated with
[Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (Apache-2.0).

## Fonts

Loaded from Google Fonts under the [SIL Open Font License 1.1](https://openfontlicense.org/):

| Font | Designer |
|---|---|
| [Black Ops One](https://fonts.google.com/specimen/Black+Ops+One) | James Grieshaber, Eben Sorkin |
| [VT323](https://fonts.google.com/specimen/VT323) | Peter Hull |
| [Archivo Narrow](https://fonts.google.com/specimen/Archivo+Narrow) | Omnibus-Type |

## Maps

The layout of "Three Crossings" is traced from a pixel map design supplied by the owner
(`maps/designs/river.png`) with `tools/map-from-image.py`.

## App icon

The app icon (`icons/`) is AI-generated artwork made with ChatGPT for this project: a Soviet
twin-barrel tank in a forest.

## Unit designs

The new Ore Truck and Rifle Infantry looks are hand-built voxel models (`src/models.js`) that take
their general design from 3D reference models generated with Tripo Studio. No Tripo geometry,
textures or video frames are used in the game.
