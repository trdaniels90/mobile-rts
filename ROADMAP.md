# Roadmap

Planned work, not started yet. Nothing here is in the game today.

## 1. Leaderboard (stats for friends)

Each finished game records the player's nickname, side, difficulty, win or loss, game length,
kills, losses and ore harvested, tagged with the build it was played on. The Options menu shows
overall standings and each player's record. Testing-phase results can be shown separately,
kept as a "beta testers" board at launch, or cleared.

Honour system: results come from each player's own device, which is fine among friends but not
for a public competitive ladder.

**Where results are stored.** Pages published on claude.ai have a built-in shared database, but
only the page's owner (and, on Team or Enterprise plans, members of the organization) can write
to it. Friends opening a public link can only read it. So a shared board needs our own server
(see section 3). Until then, possible stopgaps:

- **Per-device stats:** each tester sees their own history, saved on their phone.
- **Hand-collected board:** a "Copy my results" button gives a short code that testers send to
  the owner, who adds it to a shared board on the claude.ai page.

## 2. Multiplayer with friends (not competitive)

- **1v1 PvP:** one player hosts and their device runs the battle; the other joins with a short
  code and plays over the connection.
- **2v2 PvE:** two friends team up against two computer opponents on a four-base version of the
  map (needs four start positions and ore for each).

Host-runs-the-battle keeps the game as it is built today. Downsides: the host's phone does all
the work, the guest sees a little delay, and a dropped host ends the game. iPhones pause web
pages when switching apps or locking the screen, so reconnecting has to be handled.

**Later, only if wanted (hard):** proper RTS lockstep, where both devices run identical copies
of the battle and send only orders. Needed for larger games or serious competitive play. It
means making the simulation fully deterministic: seeded randomness everywhere, a fixed time
step, and protection against small maths differences between browsers.

## 3. Hosting (needed for 1 and 2)

- **Website** for the game (for example GitHub Pages, free) with two addresses: a main address
  for releases and a test address for new builds.
- **Small server** (for example a free or low-cost Cloudflare plan) that stores leaderboard
  results and connects players for multiplayer.
- Both the release and test builds save results and show the leaderboard in game; no claude.ai
  account is needed to play.
- The claude.ai links can stay up as backups. Published claude.ai pages are locked down and
  probably cannot reach an outside server, so a build left there likely could not save results
  or join multiplayer. Check this first before relying on it.

The owner creates the hosting accounts; the code and setup steps can be written for them.

## Suggested order

1. Leaderboard (with the stopgap until hosting exists).
2. Set up the website and server, then move the leaderboard onto it.
3. 2-player co-op against the computer (more forgiving of delay), then 1v1 PvP.
4. Lockstep rework, only if larger or competitive games are wanted.
