# Test scripts (`tools/sim/`)

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

| `aa-avoid.js` | Headless: aircraft on Auto Attack steer round anti-air their side has found, still attack when everything is covered, ignore undiscovered anti-air. `<repo> [seed]` |
| `ai-starved.js` | Headless: a computer with no ore near its refineries buys a Mobile Outpost first and holds army production until it is out |
| `ai-timing.js` | Headless 1 v 1 of two computers: when each side sends waves, how many squads retreat or turn home. `<repo> [games] [minutes] [difficulty] [map]` |
| `ally-defend.js` | Headless 3 v 3: Defend ally goes to the picked ally, switches, answers raiders at its base and just outside. `<repo> [map]` |
| `manual-override.js` | Headless: a direct order (move, guard, attack) takes a unit out of Auto Attack and base defence until Stop |
| `ore-econ.js` | Headless team game of computers: ore left on the map and each side's income every 5 minutes. `<repo> [sides 4\|6] [minutes] [map] [seed]` |
| `pop-cap.js` | Headless 2 v 2 of computers: each army against its cap, once a minute. `<repo> [minutes] [difficulty] [map] [seed]` |
| `rebuild.js` | Headless: a broke Normal computer that lost its War Factory or refinery sells buildings to rebuild. `<repo> [diff] [factory\|refinery\|both]` |
| `stuck.js` | Finds computer units sitting still with an order, and Ore Trucks not mining or unloading. `<repo> [minutes] [map] [1v1\|2v2] [seed]` |
| `truck-queue.js` | Headless: 8 full trucks sent to one refinery queue at the dock; how long until all are unloaded. `<repo> [trucks]` |
| `wipe-out.js` | A defeated side in a team game loses everything it has left |
