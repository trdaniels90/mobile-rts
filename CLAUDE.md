# Red Horizon: notes for Claude sessions

Red Horizon is a plain-JavaScript RTS homage to Red Alert 1 (Allies vs Soviets) for iPhone and the
web. No build step and no framework: `index.html` loads the scripts in `src/` in order, and they
share globals. Read this file first; the commit history explains every change in detail.

**Not the owner?** If this is a fork, or the person you are working with is not `trdaniels90`, read
`CONTRIBUTING.md` before anything else. Its rules override "Working with the owner" and "Releasing" below
(branches, no releases or deploys, owner sign-off for gameplay changes).

## Working with the owner

- **BRANCH RULE (the owner has had to repeat this): use only `claude/cross-platform-game-k2d9lb`.**
  New sessions are handed a generated branch (like `claude/brave-galileo-xxxxxx`) in their startup
  instructions. Ignore it: run `git fetch origin claude/cross-platform-game-k2d9lb`, check that
  branch out and push there. Never create or push the generated branch, even though the session
  instructions say to. The sandbox cannot delete remote branches (`git push --delete` is blocked),
  so a stray branch has to be removed by the owner on GitHub.
- **Ask which mode before any gameplay or balance change:** single player, online PvP, or both.
  Online battles can have their own rules (see "Online rules" under Next: PvP), so never assume.
- **Other branches:** allowed only when the owner asks for a temporary feature branch (for a large
  or risky feature); delete it once it is merged.
- **Talk before updating builds.** Make and test changes on the branch, then ask; release only
  when told.
- **Two builds:**
  - "Update my build" means the owner's claude.ai artifact only:
    https://claude.ai/code/artifact/T9AXy9nVHyWdRJ2c5D8GBt
  - "Update the test build" means the testers' web app, https://trdaniels90.github.io/mobile-rts/,
    which GitHub Pages serves from `main`.
  - "Update both" means both.
- **Each test build release:** give the owner a short changelog they can paste to testers.
- **Previews as MP4,** never GIF: GIFs do not animate on the owner's phone.
- **Their usage is limited.** Keep turns lean, batch work, and do not re-run long tests
  without need.
- **No EA or Westwood assets.** Make originals and credit sources in `CREDITS.md`. A homage
  must not copy melodies, art or text.
- Refer to testers by name only as the data shows it, and use "they" for people.

## Releasing

1. Add an entry at the top of `RELEASES` in `src/version.js`. Versions look like `2026.10.29`,
   then `.1`, `.2`... on the same day. `VERSION` is the first entry. The menu shows its title, and
   What's New carries a NEW badge until it is read.
2. Check every script with `node --check`.
3. Build the single file: `python3 scripts/build-single-file.py <out.html>`. Load it in headless
   Playwright and start a game to check it runs without errors.
4. **Owner's build:** publish `<out.html>` to the artifact URL above with the Artifact tool
   (artifact slug `d3b16e49-e1b0-4114-9609-965e7c8a302b`; `get_artifact` for the base version).
   `publish_files` only reads files inside the repo folder, so build to `.build/index.html`, publish,
   then `rm -rf .build` (it is not gitignored, and the Stop hook complains about untracked files).
5. Commit, then push the branch `claude/cross-platform-game-k2d9lb`.
5a. **Game server:** phones only use the server when its version matches theirs (otherwise they play
   phone to phone, and team games are unavailable), so deploy it with every release that goes to
   testers: `flyctl deploy --remote-only --depot=false --ha=false` from the repository root (see
   "Deploying the game server" below).
6. **Test build:** check `git merge-base --is-ancestor origin/main HEAD`, then run
   `git push origin HEAD:main`. Poll `https://trdaniels90.github.io/mobile-rts/src/version.js`
   until it shows the new version.
6a. **Windows app:** pushing a new `src/version.js` to `main` runs `.github/workflows/desktop.yml`, which builds
   the installer from `desktop/` (Electron, `electron-updater`) and publishes it as a GitHub Release
   (`RedHorizon-Setup-<ver>.exe`). Installed copies check Releases every 30 minutes and offer a restart. See
   "Windows app" below.
7. **New scripts:** add any new script to `index.html` and to `FILES` in `sw.js`, the offline
   cache. Installed copies notice the new version and offer a restart.

## Code map

| File | What it holds |
|---|---|
| `src/data.js` | Unit and building stats, `WARHEADS`, `POWERS`, `DIFFICULTY` (AI behaviour per difficulty), `CATEGORIES` (build queues: structure, infantry, vehicle, heli, jet) |
| `src/world.js` | The simulation: `G` (game state), `update(dt)`, production, combat, aircraft (`updateAir`), fog, powers, win check |
| `src/ai.js` | The computer opponent: build order, army mix, attack waves (planner), scouting |
| `src/ui.js` | Input (touch and mouse), camera, sidebar, menus |
| `src/maps.js` | The `MAPS` list, `mapCardsHtml` and the skirmish map screen (`MapSelect`). `newWorld(..., mapId)` stores `G.mapId`; the online host picks the map in the lobby and sends it with `start`. A new map needs an entry here and a layout in `genMap` |
| `src/art.js`, `src/models.js`, `src/voxel.js` | Drawing |
| `src/audio.js`, `src/music.js`, `src/sfx.js`, `src/voices.js` | Sound. Music is sequenced in the `SONGS` array in `audio.js` |
| `src/manual.js` | The Field Manual and What's New pages |
| `src/debrief.js` | The end-of-mission debrief |
| `src/report.js` | Match reporting to Supabase and the leaderboard |
| `src/profile.js` | Accounts (email plus a 6-digit code), commander names and the service record |
| `src/save.js` | Save and continue a skirmish: one slot in IndexedDB, the whole of `G` as a graph (references kept, data.js tables by name), the marks of battle in `G.marks` |
| `src/netcore.js` | The host's snapshot engine (per remote player: only what their side sees), event and decal relays, carrying out remote orders. Used by a hosting phone and by the server |
| `src/net.js` | Online play: the game server first, else room codes over Supabase Realtime and WebRTC; the guest's copy and orders; the online page and lobby |
| `server/` | The dedicated game server (Node, `ws`): `headless.js` loads the game scripts without a browser, `server.js` runs rooms and battles. `Dockerfile` and `fly.toml` at the root deploy it to Fly.io |

- **Sides:** `PLAYER = 0`, `ENEMY = 1` are just the two slots. `G.me` is the side this device
  shows and commands; either side can be "you" (`newWorld(..., me)`, `?side=1` in the address,
  `setViewer(side)`). The announcer (`notify`) speaks only for `G.me`.
- **Map knowledge:** `G.fog[side]` is what each side has uncovered; `G.seen` is `G.fog[G.me]`,
  the one drawn. Both sides only target enemy buildings they know about (`knownTo`,
  `targetable`).

- **Saved games:** a skirmish autosaves when the menu opens (also on phone lock), and every 2
  minutes; Continue on the menu loads it, and a win, loss or quit clears it. Anything new kept in
  `G` is saved automatically if it is plain data, a typed array or a reference to an entity or a
  data.js table. Canvases, Maps and functions are not: rebuild them in `SaveGame.load`.

- **Saved games and match reports:** a save remembers its match id and Continue calls
  `Report.resume`, so one game is one `matches` row however often it is saved and continued (play
  time counts once). Saves made before 2026.10.30 have no id and start a new match when continued.

## Soundtrack (separate files since 2026.11.03.9)

- Four recorded tracks, shuffled: Industry, War, Smash, Rain. Each is an MP3 in `music/<name>.mp3`, listed in `SONGS`
  in `audio.js` with `rec: '<name>'`. `Music.loadRec` fetches the file (`music/<id>.mp3`) and decodes it on demand;
  if the fetch or decode fails the song is skipped (`recFailed`). `Music.nextSong` deals a shuffled deck (no immediate
  repeat), `Music.newMatch` (called from `startMission` and the online start in ui.js) opens a match on a random
  track. Only the playing track is kept decoded (about 60 to 100 MB).
- **Adding a track:** put `music/<name>.mp3` in the repo, add it to `SONGS` in `audio.js` and to `TRACKS` in `sw.js`
  (the service worker downloads the tracks in the background after install, so the soundtrack works offline), credit
  it in `CREDITS.md`.
- **The single-file build no longer contains the music.** For the owner's artifact, build to `.build/index.html`,
  copy `music/` to `.build/music/`, and publish with the Artifact tool's `files` map
  (`"music/<name>.mp3": ".build/music/<name>.mp3"`) alongside the page, so the page's relative `music/...` URLs work.
  Each file may be up to 16 MB; the page is now about 2.5 MB. Later releases only need to resend the page
  (files left out are kept). Remove `.build` afterwards.
- The owner supplies the tracks (credited in `CREDITS.md`). Convert with ffmpeg: `loudnorm=I=-16:TP=-1.5`,
  a 2.5 s fade out, 44.1 kHz stereo, 96 kbps.
- Volume sliders (`musicVol`, `sfxVol` in `Sound.settings`, `setVolume`) scale the buses; full is the original mix.

## Recent mechanics (2026.10.31 and .31.1)

- **Defending jets** (`defendBase`, `pickRaider`, `updateAir`): each defending jet takes a raider
  no other defender has, makes one pass (a missile at an aircraft, or the bomb run, sets
  `u.rearming`), flies home, rearms fully and goes out again. Raider ids are in `team.raiders`.
  A jet whose raider dies picks the next free one.
- **Anti-air missiles** (`fireWeapon`, `updateProjectiles`): missiles and rockets fired at aircraft
  have fuel of `AA_FUEL` (1.5) times the weapon's range, `SAM_FUEL` (3) for SAM Sites, and burn out
  if the target lands. Missiles at ground targets are unchanged.
- **Infantry lanes** (`assignLane`, `laneOffsetPath`): infantry on a hunt or attack order march
  in their own lane off the route, and a loose wave gets a speed spread (`paceMul`). Each wave rolls
  once; `TIGHT_CHANCE` (0.3) of waves stay tight so V2 blasts still kill big groups.
  Ground vehicles (not Ore Trucks or deployables) get lanes too since 2026.11.03: wider
  (`LANE_VEH_LOOSE` 100, `LANE_VEH_TIGHT` 50) and a pace spread that only slows them. Measure with
  `node tools/sim/infantry-spread.js <repo> <runs> mtank`.
- **Computer on Normal and Hard** (`pincer`, `counter` in `DIFFICULTY`): two-pronged attacks
  (`aiPincerStart` / `aiPincer`: a wave splits, gathers 13 cells off either flank of the target, then
  closes in together) and counter-building (`aiCounter`: `team.counter` = inf / armor / turtle).
  Normal now targets 'weak' and holds bombs for big pushes too.
- **PvP guest must never create entities.** The guest runs effects, and anything an effect spawns
  with `addUnit` takes a low id that clashes with the host's, then `applySnapshot` crashes. Guard
  such spawns with `G.remote` (as `ejectPilot` does).
- **Damaged structures** (`damageModel`, `damagedSprite`, `damageSpots` in models.js;
  `structureDamageFx` in world.js): below 60% and 30% health every structure is drawn from a
  damaged copy of its own voxel model (holes, char, embers, rubble; heads char too), built one at
  a time in the background. Fire, smoke and falling pieces come out of the holes. They run in the
  effects pass, so the PvP guest works them out from the health it is sent and nothing extra goes
  over the network (their timers are in net.js `SKIP`).
- **App icon** is AI-generated (ChatGPT) art; credited in `CREDITS.md`.

## Map "Three Crossings" (after 2026.11.02.1, not released yet)

- `MAPS.river` in maps.js: a fixed layout traced from the owner's design `maps/designs/river.png` by
  `tools/map-from-image.py` (run-length `rows` plus `spawns`). Any map with `rows` is laid out by
  `genLayoutMap` (world.js) instead of the procedural `genMap`: ore fields come from touching ore
  cells, bridges from runs of bridge cells. Same map every game.
- One bridge in the middle; the north and south crossings are shallow fords (`'f'`, `--ford` in the tool):
  terrain 5 like a bridge (walkable) with `G.ford` set, painted in `paintTerrain` as a rocky bed under
  shallow water (`fordStone` lays out lit, rounded stones; a few boulder stamps; ragged edges). No speed penalty. Ford ends with no river up or down stream become bank.
- Gem fields (`gems` in `MAPS.river`, `[x, y, radius]`): one beside each start position, then ten in pairs
  (one per bank) by the bridge, the fords, the flanks and mid-bank. Placed only on open ground.
- Made for 2 v 2 (`teams`: west bank starts 0-3 against east bank 4-7); 2 v 2 itself is not built.
  A 1 v 1 puts one player on each bank (`newWorld` picks from opposite halves of `G.spawns`).
  The layout is not mirrored, so the banks are not exactly equal.
- Its rock (`'#'`) is painted into the ground as brown rocky ridges (`G.cliff` mask, `paintCliffs` in art.js:
  a height field from the cliff cells, shaded by slope, cached per cell). They only block; the game has no
  height or high-ground bonus.

## Recent mechanics (2026.10.31.2)

- **Map:** "A Bridge Too Far" (`MAPS.bridge`, `src/maps.js`), 144 x 144 cells (`MAP` in data.js). The
  layout scales from an 88-cell design (`K`, `S96`, `FR` in world.js). Ore fields grow with the map
  (`FR` = MAP / 112, inner edge unchanged so building ground is kept); gem fields stay small. Four gem
  fields (two per side, the second out by the lake ends). Pictures in `maps/*.png` come from
  `node tools/make-map-previews.js <repo>`; rerun it after any layout change. The sims tap Skirmish,
  then Start on the map screen (`#maps [data-map-go]`).
- **Saves** record `size: MAP`; a save from another map size is ignored (Continue hidden).
- **Rangers:** `heliOnly` weapon flag (can hit helicopters, not jets, see `canHit`), fire every 1.3 s. The
  computer's home guard (`aiHomeGuard`) no longer counts them as anti-air.
- **Pilots** that come down on water drown (`landChute`).
- **Decided to leave:** helicopters answer base-defence calls only for raiders within 32 cells
  (`bd` in `defendBase`) while jets have no limit; the owner likes distant bases calling jets.
- **Possible follow-ups:** move the second gem fields further from start positions 2 and 6; push ore
  fields about 2 cells clear of the 14-cell building circles; record the map in match reports; check
  performance on a real phone and a long `pvp-air-inf.js` run on the 144 map; per-map `MAP` size
  once a second map exists.

## Released in 2026.11.02 (also damaged structures and the SAM pit)

- **Service Depot** (`depot` in `BUILD_DEFS`, `commandRepair` / `updateRepairOrder` in world.js): 1200
  credits, needs a War Factory, both modes. Ground vehicles drive onto its pad (the `exitCell`, drawn by
  `padDecal`) one at a time (`depot.svc`) and are repaired at the aircraft-pad rate and price; others
  wait beside it. REPAIR button for damaged vehicles, or tap the depot. Out of money, Ore Trucks leave
  at once and the computer's vehicles after 8 s. The computer builds one on every difficulty and sends
  damaged vehicles (only while it has over 400 credits, at most 4 queued per depot).
- **Win rule:** a side loses when it has no production building (`PRODUCTION`: cy, barracks, factory,
  helipad, airfield) and no Mobile Construction Yard (`mcvsOf`) left (`inTheFight`, `checkWin`). Once a
  side has no production building, the enemy is told where its Mobile Construction Yards are
  (`lastStand`, also in `enemyBaseKnown` and `aiWaveTarget`). Sims end games by destroying every
  production building.
- **Mobile Construction Yard** (`mcv` in `UNIT_DEFS`, `deploys: 'cy'`, `mcvModel`): 2500, needs a Service
  Depot, deploys anywhere with the Mobile Outpost's `deployFob`. The computer builds one only to replace
  a lost yard (`aiDriveMcv`: drives home, tries further out if it cannot unpack).
- **Computer outposts** (Normal and Hard): `ai.expand`, `ai.outpostGuns`, 1 to 3 refineries per
  Outpost (`o.refWant`, `o.refineries`), `defMax` up by 3.

## Camouflaged Pillbox (after 2026.11.02.1, both modes)

- The Allied Pillbox has `camo: true` in data.js. `camoHidden(b, viewer)` (world.js) is true for an enemy
  structure that is not `exposed`. Hidden means: not drawn, picked or shown on the minimap
  (`visibleToPlayer` in ui.js), not chosen by `acquire` or `targetable` (so the computer's attack logic
  ignores it), and the host never sends it to an online guest until it is exposed (`shown` in net.js).
- Exposed for `CAMO_REVEAL` (4 s) after an enemy ground unit comes within `CAMO_DETECT` (3 cells), after it
  fires, or after it takes damage. Always exposed while under construction. `exposed` is synced;
  `revealT` is a host timer (in net.js `SKIP`).
- It leaves no dirt pad (`addBuilding` skips `bibDecal` for `camo`). Its roof takes the colour of the
  ground (`groundColour` in art.js, `camoPal` in models.js): grass, dirt or a mix, in quarter steps.
- Tested with throwaway scripts: hidden/exposed/hidden again, and an online host/guest pair (the guest
  has no entry for a hidden host Pillbox, gets it when exposed, keeps `exposed` current afterwards).

## Errors and ping in a match (2026.11.04.1)

- The main loop (`frame` in ui.js) runs each part (update or `guestStep`, `hostTick`, draw, sidebar,
  radar) inside `guard`, and asks for the next frame first, so an error no longer freezes the game.
  Errors go to `Report.oops(where, e)`, with uncaught `error` and `unhandledrejection` events too: up to 6
  distinct ones per match, with a repeat count, end up in the match's `stats.errors` (sent with the
  heartbeat and the result). Find them with `select id, stats->'errors' from matches where stats ? 'errors'`.
- **Ping** (net.js `notePing`, `noteFrame`, `netStats`): each phone records its ping over the battle
  (average, worst, share over 250 and 500 ms) and per minute of battle (ping, worst, this phone's real
  frames per second, frames over 100 ms, units alive) in `stats.net`. High ping with low host fps in big
  fights means the host phone is overloaded; high ping at any battle size means the route between phones.
- **Frame rate in every battle** (after 2026.11.12.1, skirmish and online): `Report.noteFrame` (called from ui.js `frame`)
  keeps per-minute figures in `G.perf` (saved with the game), sent as `stats.frames`: `cores`, `w`, `h`, `dpr`, and per
  minute `fps`, `slow` (frames over 50 ms), `long` (over 100 ms), `worst` (ms), `upd` / `drw` (average ms a frame spends in
  the simulation and in `draw`), `jumps` (camera moved over half a screen in one frame, e.g. a minimap tap), `wait` (frames
  with ground tiles still painting on screen) and `units`; since 2026.11.12.4 also the worst of each part (`wu` simulation,
  `wd` draw, `wg` the ground's update, `wo` sidebar and radar, ms), `gnd` (average ms in the ground), `tiles` (finished)
  and `lx` (frames over 100 ms mostly spent outside the game's code: the browser collecting memory or compositing). Query:
  `select m->>'m' min, m->>'fps' fps, m->>'long' long, m->>'worst' worst, m->>'upd' upd, m->>'drw' drw, m->>'jumps' jumps, m->>'wait' wait, m->>'units' units from matches, jsonb_array_elements(stats->'frames'->'minutes') m where id::text like '<id>%'`.
- **Joining** (net.js `listen`, `knock`, `dropAttempt`, `retryable`; 2026.11.04.2):
  a connection attempt that fails before the lobby connects no longer kills the host's room. The host drops
  it and keeps listening, and a new hello replaces a stale attempt (before, the retry got "already has two
  players", so the host had to start a new room). The guest also keeps host ICE candidates that arrive
  before the offer. `tools/sim`-style check: a ghost guest that never answers, then a real guest.
  Still open: only STUN is configured, so some mobile networks may need a TURN relay.
- Added after PvP match 67484441 froze at about 22 minutes on both phones (stuck picture, no message,
  shortly after a big Auto Attack). Its cause is still unknown: look at `stats.errors` after the next one.

## Dedicated server and team battles (branch `claude/dedicated-server-2v2`, not released yet)

- **Server** (`server/server.js`, run in Node by `headless.js`: the game scripts in a `vm` context with stub
  canvases; their `const`/`let` names are read with `ctx.get('G')`). One context per room. Rooms by 4-letter
  code, up to 4 seats; seat 0 leads (picks battle, map, co-op difficulty). Battle runs at 30 steps a second,
  snapshots 10 a second per player (`NetCore.snapshots`). Holds while a player is away; after `WAIT_LIMIT`
  a 1 v 1 is lost, and in a team game the computer takes over the side (`handOver`, also on surrender); an
  alliance with no players left loses; if every player is gone when the wait runs out, the room just closes with no winner (`tick`). The server sets `G.me = -1` so every side's announcer lines go out.
- **Phones:** `net.js` tries `SERVER` (`wss://red-horizon-rts.fly.dev`, `?server=<url>` to override,
  `?server=off`) for 7 s on Host or Join; failing that, or on a version mismatch, 1 v 1 goes phone to phone
  as before. On the server both phones are guests (`role === 'guest'`), `lobby.via === 'server'`.
- **Machine size:** `performance-1x` (dedicated CPU, 2 GB) since 2026-11-05. On `shared-cpu-1x` a co-op battle
  (match 81ea382d, ~470 units) became a slideshow: a shared CPU is held to 6.25% of a core once its burst balance
  (5 s at each wake) is spent, and a 4-sided battle needs about a third of a core by mid-game. Billed only while
  awake. The beat and each battle's `perf` report CPU use (`cpu_pct`, `cpu_peak_pct`, machine in `CPU_KIND`).
- **Fly.io:** app `red-horizon-rts` (change it in `fly.toml` and `SERVER` together if taken), one machine
  (rooms are in memory), sleeps when idle and wakes on the next connection. Health: `GET /` returns the
  version and room count.
- **Deploying the game server:** the environment's setup script installs `flyctl` (in `~/.fly/bin`) and
  `FLY_API_TOKEN` is set in sessions. From the repository root: `flyctl deploy --remote-only --depot=false
  --ha=false`. `--depot=false` because Fly's default builder (Depot) rejects the session proxy's certificate;
  `--ha=false` keeps one machine. Then check `curl https://red-horizon-rts.fly.dev/` shows the new version.
  The app was created (personal org, `dfw`) and first deployed on 2026-11-04 from this branch.
- **Stats page reports** (`rpc`, `beat`, `reportBattle`, `noteError` in server.js; tables and functions in
  `supabase/server.sql`): with the `SERVER_TOKEN` Fly secret set, the server sends a status beat every minute
  (`server_status`: version, rooms, battles, players, memory, step time) and a `server_battles` row when a battle
  starts and when it ends (mode, map, players, winner, `how` incl. `abandoned`, up to 6 errors, `perf`: step ms,
  slow steps over 33 ms, peak units, snapshot KB/s per player, time held). Supabase keeps only the token's SHA-256
  (`server_secret`); the functions refuse any other token, and the tables are not readable through the API. Without
  the secret (tests, local runs) nothing is sent. The owner's stats page shows them in its "Game server" section.
- **Teams in the simulation:** `newWorld(..., sides)` takes up to four `{ faction, ally, ai, name }`. Sides
  with the same `ally` are a team: `hostile(a, b)` is the enemy test everywhere (never compare `team`
  directly for enemies), `alliedSides`, `foesOf`, `enemyUnitsOf`, `enemyBuildingsOf`. Allies share one fog
  array (`G.fog[a] === G.fog[b]`; save.js joins them up again on load). `enemyOf(team)` is the enemy side
  the AI fights now (nearest still in the fight, kept 20 s). A side with nothing left is `out`; the battle
  ends when one alliance is left, and `G.over.winner` is an **alliance** number (in a 1 v 1 the same as
  the side). In a 1 v 1 each side is its own alliance (`ally = id`), so old behaviour is unchanged.
- **Modes:** skirmish 1 v 1 or 2 v 2 (you and a computer ally; the map screen's `data-mode`); online
  `1v1`, `2v2` (four players) and `coop` (two players against two computer sides, reported as `pve` with
  its difficulty). Team games need the server. A 2 v 2 skirmish never offers the leaderboard.
- **Performance** (found with 4 sides): `G.grid` buckets entities every step (`buildGrid`, `nearBuckets`)
  so `acquire` only looks nearby; a unit with a second weapon and nothing in reach waits 0.3 s before
  looking again (it searched every frame). A 2 v 2 of four Hard computers peaks around 440 units and
  8 s of CPU per game minute on the dev container.
- **Team extras (2026.11.04.5):** teammates of the same faction get a second colour (`team.variant`, `FACTIONS[f].alt`, `drawVar` in models.js, set per draw in art.js); "Ally defeated"/"Enemy defeated" have voice clips (rendered with `scripts/make_voices.py`'s pipeline, Kokoro model from the kokoro-onnx releases); the debrief compares your whole alliance with all foes; the ALLY button (`setAssist`, `defendAllies` in world.js, `team.assist`, `u.garrison`/`u.assisting`) garrisons an ally's base, and computer allies help defend (Normal and Hard, ground units only).

## Beaten in a team game (after 2026.11.05, both modes)

- A side with no production left is `out`, but the battle goes on while an ally is in it. The phone then shows a card
  (`beaten` in ui.js): **Keep watching** (`G.watching`; `G.seen` becomes this device's own all-revealed array, the
  shared ally fog is untouched; online `Net.watch()` sends `watch`, and the server's peer gets `watch`, so `snapshot`
  in netcore.js sends the whole map) and the alliance's result counts; or **Debrief**: a loss now with `how = 'out'`
  (online `Net.surrender('out')`, the server's `handOver(.., 'out')`).
- The server sends a player it hands over (surrender or beaten) an `end` with the battle's log, so their debrief and
  match report have graphs (before, match a858b156 had none).
- Snapshots also carry the debrief log as it grows (`s.log` in netcore.js `snapshot`, applied in net.js `applySnapshot`),
  so a phone that ends a battle on its own (it could not reconnect) still has its graphs.

## Map "Snowbound", the first 3 v 3 map (a winter map), and per-map sizes (2026.11.11.2; bridges, weather 2026.11.12)

- `MAPS.snowbound` in maps.js: traced from the owner's design `maps/designs/snowbound.png` (126 cells, a lavender-ground palette:
  `tools/map-from-image.py` detects it; its light grey roads become dirt tracks) at **210 x 210** cells (5/3 of the design;
  168 until 2026.11.12, so older Snowbound saves no longer continue), `teamSize: 3`,
  three bridges over the long lake (`--bridge` boxes in the comment), 16 gem fields placed in twins by the half turn, and an
  ore field added in code for the north-west start (`ore` in MAPS, from `claude/ai-squads`). After a re-trace, rescale the
  `gems` and `ore` positions (x 210/168 last time) and snap them to open ground.
  **Winter look:** `theme: 'snow'` in MAPS (`mapTheme`, `snowy()` in art.js): paintTerrain's snow, slush, ice and cold water
  palettes, snowy rock in `paintCliffs`, snowy pines only (`scenery.snowPines`, `treeModel(.., snow)`), and the minimap
  (`terrainMini`), base pads (`bibDecal`) and Pillbox camouflage (`groundColour`). Saves repaint with the theme.
  **Concrete bridges:** `bridge: 'concrete'` in MAPS (`concreteBridge` in art.js; timber when not given).
  **Weather (looks only, both modes):** `weather: { kind, chance }` in MAPS (Snowbound snow, Three Crossings rain, each
  0.5). `rollWeather` in newWorld sets `G.weather` from the seed (both online phones agree; saved); `weatherLevel(w, G.t)`
  comes and goes in spells, 0.2 to 1; `drawWeather` (art.js) draws drops, splashes or flakes and a haze over the screen
  canvas after the view (ui.js `draw`). Nothing in the simulation reads it.
  North (starts 0-3) against south (4-7): the starts are listed north first, not in the tool's west-first order.
- **Each map has its own size:** `size` in `MAPS` (default 144, `mapSize(id)`). `MAP`, `WORLD`, `NCELLS` are `let` now and
  `setMapSize(n)` (world.js) sets them, the pathfinder's arrays and `GRID_N`; `newWorld` calls it, and `SaveGame.load`
  (saves record `map` and `size`). ui.js remakes its one-pixel-per-cell pictures (`mapPictures`). Anything new sized by the
  map must be made after `setMapSize`, never once at load. genMap's constants (`K`, `MID`, `FR`...) are for 144 only.
- **No size limit from the ground** since it is painted in tiles (below). Bigger maps cost CPU (paths, the server) and
  game length, not memory. A 240-cell test map started and scrolled like Snowbound.
- `node tools/sim/teams.js <repo> 1 8 snowbound 3v3`: at 210 cells (with the ai-squads computer) about 750 units by minute 6
  and 150 s of CPU for 8 game minutes here (111 s on the 168 map with the same computer): watch the server's `cpu_pct`.

## The ground in tiles, and the marks of battle (2026.11.12)

- Before: the ground and the wrecks layer were each one WORLD x WORLD canvas (130 MB at 168 cells; iOS refuses canvases
  over 4096 px a side, so maps stopped at 170 cells), painted whole at battle start (21 s on Snowbound at 4x CPU throttle).
- Now (`makeGround`, `groundPainter` in art.js): `G.ground` paints `GROUND_TILE` (256 px) tiles as they come into view,
  32 rows at a time (`update(view, 6 ms, 3 ms ahead)` from ui.js `draw`; the ring round the view is painted ahead, so
  scrolling finds tiles ready; a tile not ready shows the minimap colours). Up to `max(140, 3 x on screen)` tiles are kept,
  least recently seen let go. Battle start: about 1.5 s at 4x throttle.
- **Marks:** `scorch`, `crater`, `rubble`, `bibDecal`, `padDecal`, `bakeWreck`, `bakeTurret`, `bakeRagdoll` (`MARK_FNS`)
  given `G.tctx` / `G.dctx` (now layer tokens, not canvases) record `[layer, name, args, box]` in `G.marks` and are drawn on
  the tiles there are; a tile painted later draws its marks again, in order. Each mark is drawn once into a scratch picture
  and copied onto tiles, so it is the same on either side of a tile edge. A wreck keeps its char seed; effects are copied
  (`markArgs`). Every pixel of the painter depends only on its position (`speck` hash, not a running random), so tiles
  match; bridges are drawn once each into their own picture; road ruts are worked out per pixel (`paintRuts`).
- **Ground workers** (after 2026.11.12.1, both modes): a tile's pixels (`groundPixels`, about 90% of the cost) are worked
  out in Web Workers (`groundWorkers`, 1 to 3, made from the functions' own source as a Blob, so no extra file); the main
  thread only puts them in a canvas, draws bridges and scenery (`decorate`) and then the marks a few at a time
  (`finishing`, `finishSome`; a busy battlefield tile can hold hundreds). A tile is shown only once all its marks are on.
  Anything `groundPixels` uses must be listed in `groundWorkers`. Without workers (game server, old browsers) the old
  main-thread strips are used. Jumping the camera on a 3 v 3 Snowbound at 1920 x 1080 and 4x CPU throttle: worst frame
  238 ms before, about 15 ms after. `bibDecal` now builds its pixels in one picture (it was a fillRect per pixel).
- **Stutters while scrolling a big battle (2026.11.12.4, match 8f2b3d32 on a phone):** unit sprites are made the first time
  each model and facing is drawn (`sprite` in models.js), and a 3 v 3 has six colours, so scrolling into a big fight made
  dozens in one frame. Now held to `SPRITE_BUDGET` (5 ms) a frame (`spriteSpend`, reset in ui.js `draw`); past it the same
  model at another facing stands in (`spriteAny`). Marks are exempt (`drawMark`), or a stand-in would be baked into the
  ground. Sidebar cameos are drawn a few at a time early in the battle (`warmCameos` in ui.js; a new building unlocking
  several items stalled a frame by 0.4 s). Tile canvases are reused (`spare`), `bibDecal` keeps one picture (`bibPic`).
  Phone-sized 3 v 3 at 4x throttle while tapping the radar: worst frame 317 to 133 ms, worst draw 230 to 75 ms.
- **Anything new drawn onto the ground** must be a function in `MARK_FNS` (deterministic from its arguments, with a box in
  `markBox`), never a draw on a canvas kept in G. The game server records no marks (`HEADLESS`).
- **Saves** keep `G.marks` (no pictures). An old save's two pictures are used as the ground (`legacy`, `G.legacyGround`,
  kept while that game goes on).
- `node tools/sim/ground-tiles.js <repo> [maps] [old checkout]`: a staged battle; live tiles = repainted tiles and 256 =
  512 px tiles (pixel for pixel), the whole map in one picture differs by blending rounding only (at most 3/255 on the
  ground); save and continue identical; an old save continues with the same scars.

## 3 v 3 and 3 v AI: the foundation (after 2026.11.11, not released)

- **Battles** are one table, `BATTLES` in maps.js (`size` = sides per alliance, `coop` = the other alliance is the
  computer's, `players` online): `1v1`, `2v2`, `coop` (2 v AI), `3v3`, `coop3` (3 v AI). The server reads it too
  (`MODES`, slots, room size, Switch team). Sides alternate between alliances: side i is in alliance i % 2.
- **Maps say what they are made for:** `teamSize` in `MAPS` (largest alliance; both maps are 2). `battleFits(map, mode)`
  gates the skirmish map screen's battles, the online lobby's battles and maps (cards that do not fit are disabled), and
  the server's `setup`. An alliance can never be larger than half the map's start positions. **To enable 3 v 3 on a map,
  give it `teamSize: 3`** (and at least 3 start positions per half). Snowbound is the first.
- **Testing on today's maps:** `?battles=all` in the address offers every battle that physically fits; the server takes
  `ANY_BATTLE=1`. `node tools/sim/teams.js <repo> 1 12 river 3v3` runs a computer-only 3 v 3 headless (on the dev
  container about 680 units and 16 s of CPU per game minute by minute 6, double a 2 v 2: watch the server's `cpu_pct`).
- **Skirmish 3 v 3:** you and two computer allies against three computers (`teamSides(f, size)` in ui.js).
- **Colours:** a third same-faction teammate is `variant` 2 with `FACTIONS[f].alt2` (Allies teal, Soviets purple).
- **Reports:** 3 v AI is `pve` like co-op, and team battles record `stats.size` (sides per alliance). Only 2-player co-op
  offers the co-op leaderboard (`online.coop === 'board'`); a 3-player board needs `get_leaderboard` to split by size.
- Not done yet: the leaderboard split, and phones with six players for real (server load and the
  lobby on a small screen).

## Computer attacks, direct orders, team economy (2026.11.12.1, both modes)

- **Planner** (`planner: true` in `DIFFICULTY` Normal and Hard; Easy keeps fixed waves): after the base is found and
  `firstWave` has passed, each attack comes after `aiGap()` (`ai.gap`: mostly `short`, a `long` lull with `chance`, never over
  600 s), or at once when the units waiting reach `ARMY_FULL` (60%) of the army cap (at least `AI_GAP_MIN` after the last). A
  wave takes three quarters of what waits; from 12 units it splits into 2 squads, from 20 into 3 half the time.
- **Flanking** (`aiApproachSpots`, `aiGather`, `aiPincer`): each squad gathers 13-17 cells off the target on a side that is
  reachable, out of range of known guns, rarely straight ahead and not one of the last 4 used (`team.apHist`, bearings round the
  target's side's Construction Yard), then all close in together. `ai.approach` is the share that flank first (1 on both).
- **aiSquads:** a squad that started with 8+ units and is down to 35% of its worth against twice its strength pulls back; squads
  near home answer a defence `defendBase` reports as short (`team.defShort`). `defendBase` no longer recalls planner waves itself.
- **Raids were removed** on every difficulty (they almost never destroyed their target). `aiWaveTarget` attacks another found
  enemy when its chosen one (`enemyOf`) has not been found (team games).
- **Starved economy** (`aiStarved`: under `STARVED` 2,500 ore within 14 cells of its refineries and Outposts): the computer buys a
  Mobile Outpost with 250 credits (a third if need be) at the front of the queue and holds army production until it is out.
- **Aircraft avoid known anti-air** (`knownAA`, `aaCover`, `airPick` in world.js): hunting aircraft pick a building no detected AA
  covers (finished SAM/AA Gun on explored ground, AA units there; Rangers only count against helicopters), else the least
  covered; with an open target they also skip covered targets on the way (`airTarget`).
- **Direct orders** (`takeOver`, `u.manual`, `u.manualFrom`): move, guard, attack and the Attack button keep a player's unit out of
  Auto Attack, base defence, scrambles and the Ally button until Stop (`commandStop`). After an attack order, `releaseIdle` sends
  it home to rejoin once it has stood idle `MANUAL_IDLE` (180 s). Never set for the computer.
- **Team-game ore** (`growOre`): `ORE_REGROW_PER_SIDE` cells per field per tick for each side, and cells under a third full grow
  twice as fast. Maps can add ore fields in code: `ore: [[x, y, r]]` in `MAPS` (Snowbound has one by the north-west start).
- Sims: `ai-timing.js` (wave times, how waves went in), `teams.js` (prints `how`), `ore-econ.js` (ore and income every 5 min),
  `aa-avoid.js`, `manual-override.js`, `ai-starved.js`. 2 v 2 of Hard computers: no winner in 35 min, as with the old AI.

## Auto Attack target picker (2026.11.12.1, both modes)

- In a battle with more than one enemy side, AUTO opens a picker (`autoPicker` in ui.js): each enemy side by name, faction
  and colour name, disabled until its base is scouted (`enemyBaseKnown(tid, side)`) or once beaten; plus Nearest enemy, Auto
  attack off and Cancel. A 1 v 1 keeps the plain toggle. The picked side's colour shows as a stripe on the button (`.aimed`).
- `setAuto(team, on, side)` sets `team.focusSide` (synced in netcore `TEAM`; the guest's order passes the number). `chosenFoe(team)`
  is that side while it is in the fight and known; `enemyOf` returns it first, and `nearestEnemyBuilding` keeps hunters to its
  buildings (others are still fought on the way). Units already hunting another side drop their raid focus.
- Computer (`aiPickFoe` in ai.js, every 30 s): Easy nearest (`focusSide = null`); Normal and Hard score each scouted foe by
  distance, seen strength (army plus known guns) against its own, allies already on it (+0.5 each, so allies gang up) and
  stickiness. A 3 v 3 of Hard computers on Snowbound: each alliance on one foe, the first side out at 9.7 min, then all moved on.

## Windows app (`desktop/`)

- `main.js` serves the game from `app://game/` (not `file://`, so match reports work and `fetch` of the music works;
  no service worker, since `ui.js` only registers it on http). `scripts/prep.js` copies the game into `desktop/game`
  (gitignored) and sets the app version from `src/version.js` as `YEAR.MMDD.N` (semver cannot hold `2026.11.07`).
- Local test: `cd desktop && npm install && npm start`. Installer: `npm run dist` (Windows). CI does the release.
- The installer is unsigned, so Windows SmartScreen warns on first run until a code-signing certificate is added.
- The app's game version equals the web version, so it matches the game server.

## Supabase

- **Project:** `yorrgemlhoxbxvyvzcwe`. The Supabase MCP tools work in these sessions.
- **Setup files:** `supabase/schema.sql` covers matches and the leaderboard, `supabase/profiles.sql`
  covers profiles, and `supabase/stats.sql` holds the queries behind the owner's stats page.
- **`matches` table:** one row per mission, with debrief numbers in `stats` jsonb and an optional
  `user_id`.
- **Profiles:** each profile is linked to an `auth.users` row.
- **Sign-in email:** codes are sent through a Gmail account over custom SMTP. The Magic Link and
  Confirm signup templates both carry `{{ .Token }}`.
- **Owner's stats page:** a dashboard artifact, https://claude.ai/artifact/M6HpucTzaWMnQvx5g59BH9.
  Its queries live in the artifact's datasets.

## Testing

`tools/sim/` holds headless Playwright scripts, all run as `node tools/sim/<script> <repo path> ...`.
They load `index.html` from disk and drive `update()` directly. File copies never report to
Supabase.

| Script | What it does |
|---|---|
| `air-and-army.js` | Computer-vs-computer games. Counts MiG losses, helicopter kills and army mix |
| `production.js` | Builds every unit from every producer for one faction, plus stress cases |
| `scouting.js` | When the computer finds the player and first attacks |
| `jet-rush.js` | Three jets against the Soviet Construction Yard |
| `lost-touch.js` | Regression check for the stuck-pinch touch bug |
| `profile-ui.js` | The sign-in flow, with Supabase faked |
| `either-side.js` | Plays as side 1 against the computer, swaps the view, checks the win and debrief |
| `pvp.js` | Two pages meet with a room code (real Supabase Realtime) and play over WebRTC. `node tools/sim/pvp.js <repo> 30 50` adds a 50-second full-battle stress test with snapshot sizes |
| `save-load.js` | Plays a while, saves, reloads the page, continues and checks the battle is identical and carries on |
| `save-match.js` | A skirmish saved and continued twice stays one match on the stats page (fake Supabase, game served from a fake website so it reports) |
| `jet-defense.js` | MiGs defending a Soviet base against a raid with anti-air (`<repo> <seeds>`). Counts MiG losses and raiders killed; logs each MiG's state every 10 s |
| `aa-missiles.js` | A Rocket Soldier's missile against a MiG flying away or landing: how far it chases, and whether it hits |
| `infantry-spread.js` | How bunched a marching infantry wave is (most units inside one V2 blast). `<repo> <runs>` |
| `pvp-air-inf.js` | Online battle with MiGs, SAMs, rocket soldiers and infantry waves on the host, run fast. `<repo> <seconds>`: use 180 for a long one. Checks the guest's copy follows the host (nothing missing or extra, no errors). Expect up to about 100 px offset on moving units |
| `server.js` | The dedicated server in-process: two pages host and join through it, play, one drops and comes back, the battle ends; and the fallback to phone to phone |
| `server-teams.js` | Four pages play a 2 v 2 through the server (own side, shared sight, a surrender handed to the computer, the right winners), then two pages play co-op |
| `teams.js` | Headless (no browser): the computer plays every side of a 2 v 2 (`<repo> <games> <minutes> <map> [1v1]`), with CPU time per game minute |
| `team-beaten.js` | A beaten side in a team game: the defeat card, Keep watching and Debrief, in a 2 v 2 skirmish and online co-op |
| `server-3v3.js` | Raw WebSocket players on the server: 3 v AI refused on a 2 v 2 map; with `ANY_BATTLE=1`, 3 v AI and 3 v 3 start with six sides. Needs `npm install` in `server/` |
| `ground-tiles.js` | The ground in tiles: every kind of mark in a staged battle, live vs repainted tiles and tile sizes pixel for pixel, save and continue, an old save's scars. `<repo> [maps] [old checkout]` |
| `pvp-hardening.js` | A dropped connection (hold, reconnect, resync), a phone going to sleep, surrender, rematch, and an opponent who never returns |

## Next: PvP

Agreed with the owner, built in stages. Profiles shipped in 2026.10.29; stages 1 to 3 shipped in
2026.10.29.1 (online battles). Later releases: 2026.10.29.2 leaderboard scores (best score per
commander per difficulty, `match_score`), 2026.10.29.3 save and continue a skirmish.

1. **Either side can be "you".** Done. Replaced the "human is side 0" assumptions with a local viewer
   side. That covers the camera, fog (`G.seen` vs `G.aiSeen`), selection, the sidebar, notices,
   sounds and the debrief. Test it on one device before any networking.
2. **Online play.** Done, in `src/net.js`. How it works:
   - The host plays side 0 and the guest side 1. Both build the map from the same seed. The guest's
     copy has `G.remote` set: it never simulates, and `damage()` does nothing there.
   - About 10 snapshots a second carry only the entity fields that changed (host timers are left
     out), new effects, fog and ore changes, team state, and events (sounds, shakes, ground marks,
     the guest's announcer lines). Things set off inside `updateEffects` (`G.inFx`) are left out,
     because the guest runs the effects itself. Nothing is sent about the host's side, or about
     effects, shots and sounds, in ground the guest has not uncovered. A big battle costs about 15 KB/s.
   - The guest's orders: `net.js` wraps the order functions (`commandMove`, `startProduction`,
     `placeStructure`, `setAuto` and the rest) and sends them to the host. The host only accepts
     them for the guest's own units.
   - `matches.opponent` holds the other player's name; the game may now insert that column.
   Original plan:
   - The host's device runs the battle and the guest's device sends orders.
   - The host sends state snapshots several times a second.
   - The connection is phone to phone over WebRTC, with Supabase Realtime only for introductions
     (signalling). Supabase's free plan caps relayed messages at about 2 million a month, so it
     cannot carry whole matches.
   - Players meet with a 4-letter room code, then pick sides in a lobby.
   - Each match records to `matches` with `mode = 'pvp'`.
3. **Hardening.** Done:
   - A heartbeat every second (the ping shows at the top, next to the opponent's name). After 6
     seconds of silence, or when the channel closes, both phones hold the battle (`G.hold`) and
     show "Waiting for your opponent". The guest knocks on the room code again, the host listens,
     and on reconnecting the host sends a full snapshot (`full`).
   - A phone going to sleep sends `away`, so the other side holds at once.
   - After 2 minutes of waiting, whoever stayed wins (`G.over.how = 'left'`). A phone that was
     asleep that long loses when it wakes.
   - Quitting an online battle is surrendering (`how = 'quit'`). Rematch returns both players to
     the lobby on the same connection.
   - Still to do: real phones over cellular, and a relay (TURN) only if direct connections fail.
   Original plan:
   - Pause with "waiting for opponent" when a phone locks or a connection drops, and resume on
     reconnect.
   - Rematch and quitting.
   - Real phones over cellular. Add a relay server (TURN, such as Cloudflare's free tier) only if
     direct connections fail.
4. **Later:** ranked play, matchmaking and a PvP leaderboard.

**Online rules (agreed, not built yet):** balance can differ between single player and online.
Plan: an "online rules" table in `src/data.js` listing only the stats that differ. It is applied
to the unit, structure and power stats in place when an online battle starts and restored when
it ends, so net.js keeps matching rules by identity. Behaviour changes check the battle's
online flag. The Field Manual notes any stat that differs online. Build it with the first
online-only change.

Lockstep (both devices simulating) was rejected. The simulation uses `Math.random` and
frame-time maths everywhere, so it is not deterministic.
