# Red Horizon: notes for Claude sessions

Red Horizon is a plain-JavaScript RTS homage to Red Alert 1 (Allies vs Soviets) for iPhone and the
web. No build step and no framework: `index.html` loads the scripts in `src/` in order, and they
share globals. Read this file first (feature notes are in `docs/NOTES.md`); the commit history explains every change in detail.

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
2. Check every script with `node --check`, and that the baked sprites are current: `node tools/bake-sprites.js <repo> --check`
   (if stale, rebake: `node tools/bake-sprites.js <repo>`, see "Baked sprites" in `docs/NOTES.md`), and the baked ground: `node tools/bake-ground.js <repo> --check`.
3. Build the single file: `python3 scripts/build-single-file.py <out.html>`. Load it in headless
   Playwright and start a game to check it runs without errors.
4. **Owner's build:** publish `<out.html>` (and, when they changed, the files in `sprites/` as `sprites/<name>` and in `grounds/` as `grounds/<path>`) to the artifact URL above with the Artifact tool
   (artifact slug `d3b16e49-e1b0-4114-9609-965e7c8a302b`; `get_artifact` for the base version).
   `publish_files` only reads files inside the repo folder, so build to `.build/index.html`, publish,
   then `rm -rf .build` (it is not gitignored, and the Stop hook complains about untracked files).
5. Commit, then push the branch `claude/cross-platform-game-k2d9lb`.
5a. **Game server:** phones only use the server when its version matches theirs (otherwise they play
   phone to phone, and team games are unavailable), so deploy it with every release that goes to
   testers: `flyctl deploy --remote-only --depot=false --ha=false` from the repository root (see
   "Deploying the game server" in `docs/NOTES.md`).
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

## Feature notes (`docs/NOTES.md`)

Detailed notes on every feature (mechanics, constants, measurements, owner's picks) are in `docs/NOTES.md`, one `##` section each. **Before changing a feature, read its section there** (`grep -n '^## ' docs/NOTES.md`, then read that range). Add notes for new work there, not here; keep this file to rules every session needs.
Often needed for releases: "Dedicated server and team battles" (deploying the game server), "The ground in tiles" (baked sprites and ground), "Mac app". Sections:

- Iso view
- Spy Planes: Soviet Beriev A-50, Allied SR-71
- Recent mechanics
- Map "Three Crossings"
- Jets: gun runs instead of bombs
- Computer air strikes spaced out
- OpenRA pace
- Flame Tower jet burns
- Units gather at their own base, rally points, primary buildings
- More Airfields and Helicopter Bases build faster
- Units spread out in a fight
- Soldiers drawn at 65%, front rank fires first
- Saved online co-op battles
- Recent mechanics
- Released in 2026.11.02
- Camouflaged Pillbox
- Errors and ping in a match
- Dedicated server and team battles
- Beaten in a team game
- Map "Crossroads Village" and village houses
- Map "Frostlight Valley", a 3 v 3 winter map with five villages
- Crossroads Village: day and night, rain
- Map "Twin Lakes"
- Attack ground, bridges that can be destroyed, Engineers
- Walls and gates
- Map "Snowbound", the first 3 v 3 map
- Computer refinery cap
- Map "Lakeside", a 3 v 3 map
- The ground in tiles, and the marks of battle
- 3 v 3 and 3 v AI: the foundation
- Computer attacks, direct orders, team economy
- Auto Attack target picker
- Giving credits to an ally
- Mac app
- Claude token tracker
- Next: PvP
- Defend ally: pick the ally, answer units outside the base
- Tech Center
- Tech Center upgrades and the Comanche
- Transport helicopters and Air Assault
- APCs
- Unit veterancy
- Computer waves, Soviet tank costs, OpenRA armour multipliers
- Artillery 200 health, rifle splash
- Trees sway in the wind and burn
- Soviet radar dish turns, new build-up for every structure
- Construction Yard crane
- Flags fly in the wind
- Rain on Lakeside, lightning
- Stuck trucks and Outposts, defeated sides blow up
- Stuck-unit diagnostics
- Stall recovery and squad leaders
- Path churn: the computer keeps its route
- MG Team: heavy machine gun infantry
- Computer personalities
- Computer allies spread out, then gang up together
- Turtles attack when stalled, more guns, ring their second base; computer army cap 100
- Turtles: bigger army, better defended; Tesla hits vehicles harder
- Computer base rings, breaching a long way round
- Computer second bases
- Rusher forward base
- Computer allies answer calls later and from nearer
- Defenders kept waiting for routes
- Defenders running back and forth
- Units sent to one spot get a cell each
- V2 rocket raised to fire
- War Factory door opens
- Bigger paratrooper drops, Airborne division, upgrades lost with the Tech Center
- Close Air Support: A-10 Warthog / Su-25 Frogfoot
- Computer comeback: sells off to rebuild its Ore Refinery and War Factory
- Turtles: a late big push and help for allies; refinery cap +1
- Defences build in their own slot

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
| `give-credits.js` | Giving credits to an ally: the rule headless, the GIVE card in a 2 v 2 skirmish, online co-op through the server and forged orders |
| `server-coop-mate.js` | Co-op with a computer teammate: two players in a 3 v AI, the leader adds the computer, the battle starts with it on the players' team |
| `server-coop-save.js` | Saved co-op battles on the server: Save and leave, listing by player, loading with another leader and a missing player, autosave, saved when everyone leaves, deleted when the battle ends |
| `coop-save-ui.js` | Saved co-op battles in two browser pages: Save and leave from the pause menu, the note, the lobby's list, Continue battle |
| `bunching.js` | Headless staged fight: how many friends stand inside one V2 blast of each fighting unit, attack and defence, and how the fight went. `<repo> [runs] [seconds]` |
| `veterancy.js` | Headless: ranks at 2, 4, 8, 16 times own cost destroyed, firepower, armour, speed, reload, elite self-heal, no ranks for Ore Trucks or structures, a staged fight |
| `bridges.js` | Headless: attack ground, destroyable bridge spans on Twin Lakes (hurt only by an ordered attack, collapse, routes go round), Engineers rebuilding a span and repairing a structure, online snapshot and orders, the computer training and sending an Engineer |
| `walls.js` | Headless: walls and gates: laying a line (rules, prices), what each kind stops, gates and alliances, wire under tracks, ordered fire only, selling, Auto Attack units shooting a way through, online snapshot and orders |
| `rally.js` | Headless: units from an Outpost Barracks stay there, PRIMARY picks the Barracks, a rally point gathers new units, fallback when the primary is lost |
| `village.js` | Headless: Crossroads Village houses: seeded layout, blocking, blast and ordered damage, collapse, online snapshot, a computer 2 v 2 |
| `mg-team.js` | Headless: the MG Team sets up before firing, packs before moving, is dug in once set up, and a staged fight against riflemen |
| `tesla-tank.js` | Headless: the Tesla Tank's upgrade, bolt, damage, and no shots at aircraft |
| `comanche.js` | Headless: Tech Center research (cost, refund, kept, one at a time), the Comanche's pads, bays, lock-on, missiles for tanks only, gun after, stand-off, staged fights |
| `ai-lift.js` | Headless: a Normal 1 v 1 per personality (first air assault, how many, kind, soldiers landed and alive 60 s later), and a turtle reinforcing an outlying refinery |
| `transport.js` | Headless: transport helicopters (board, drop, park, UNLOAD HERE), Air Assault's balanced pick, shot down with troops aboard, a forged online order, the computer's air assault |
| `cas.js` | Headless: Close Air Support tiers (needs Tech Center, Airfield, the tier before), the power, strikes by 1-3 planes on a tank column |
| `apc.js` | Headless: APCs: boarding (5 of 6), unloading, a forged online order, about half escape a destroyed APC at half health; Engineer capture; a computer 1 v 1 with APCs and Engineer raids |
| `pvp-hardening.js` | A dropped connection (hold, reconnect, resync), a phone going to sleep, surrender, rematch, and an opponent who never returns |

