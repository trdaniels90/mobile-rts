# Red Horizon: notes for Claude sessions

Red Horizon is a plain-JavaScript RTS homage to Red Alert 1 (Allies vs Soviets) for iPhone and the
web. No build step and no framework: `index.html` loads the scripts in `src/` in order, and they
share globals. Read this file first; the commit history explains every change in detail.

## Working with the owner

- **Ask which mode before any gameplay or balance change:** single player, online PvP, or both.
  Online battles can have their own rules (see "Online rules" under Next: PvP), so never assume.
- **Branch:** work on `claude/cross-platform-game-k2d9lb`, whatever branch name a new session is
  given. If the session starts on another branch, bring this one in and push here.
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
4. **Owner's build:** publish `<out.html>` to the artifact URL above with the Artifact tool.
5. Commit, then push the branch `claude/cross-platform-game-k2d9lb`.
6. **Test build:** check `git merge-base --is-ancestor origin/main HEAD`, then run
   `git push origin HEAD:main`. Poll `https://trdaniels90.github.io/mobile-rts/src/version.js`
   until it shows the new version.
7. **New scripts:** add any new script to `index.html` and to `FILES` in `sw.js`, the offline
   cache. Installed copies notice the new version and offer a restart.

## Code map

| File | What it holds |
|---|---|
| `src/data.js` | Unit and building stats, `WARHEADS`, `POWERS`, `DIFFICULTY` (AI behaviour per difficulty), `CATEGORIES` (build queues: structure, infantry, vehicle, heli, jet) |
| `src/world.js` | The simulation: `G` (game state), `update(dt)`, production, combat, aircraft (`updateAir`), fog, powers, win check |
| `src/ai.js` | The computer opponent: build order, army mix, attack waves, raids, scouting |
| `src/ui.js` | Input (touch and mouse), camera, sidebar, menus |
| `src/art.js`, `src/models.js`, `src/voxel.js` | Drawing |
| `src/audio.js`, `src/music.js`, `src/sfx.js`, `src/voices.js` | Sound. Music is sequenced in the `SONGS` array in `audio.js` |
| `src/manual.js` | The Field Manual and What's New pages |
| `src/debrief.js` | The end-of-mission debrief |
| `src/report.js` | Match reporting to Supabase and the leaderboard |
| `src/profile.js` | Accounts (email plus a 6-digit code), commander names and the service record |
| `src/save.js` | Save and continue a skirmish: one slot in IndexedDB, the whole of `G` as a graph (references kept, data.js tables by name), the ground as pictures |
| `src/net.js` | Online play: room codes over Supabase Realtime, WebRTC, the host's snapshots, the guest's copy and orders, the online page |

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
