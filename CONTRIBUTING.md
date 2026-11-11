# Contributing to Red Horizon

This file is for anyone who is not the owner (`trdaniels90`): friends and testers who work from a
fork. If you use Claude Code, it is read automatically through `CLAUDE.md`. **Where it differs from
`CLAUDE.md`, this file wins for contributors.** The owner's own sessions follow `CLAUDE.md` as
written.

## How to contribute

1. Fork `trdaniels90/mobile-rts` on GitHub and press **Sync fork** before you start, so your `main`
   matches the owner's.
2. Work on a branch in your fork, named `friend/<feature-name>`, created from your fork's `main`.
   Never push to `main`, and never to `claude/cross-platform-game-k2d9lb` (the owner's working branch).
3. Test it (see below), then describe what you changed and how you tested it.
4. Show the owner before opening a pull request.
5. Open the pull request on GitHub: from your fork's branch into `trdaniels90/mobile-rts`, base `main`.
   Check that the **base repository** says `trdaniels90/mobile-rts`. A session attached only to your fork
   cannot open a PR on the owner's repository, so use the website (for example
   `https://github.com/trdaniels90/mobile-rts/compare/main...<you>:mobile-rts:<branch>`).
6. Keep pull requests small, one idea each. A PR that touches only `src/models.js` and `CREDITS.md`
   is easy to review; one that rewrites half the game is not.

## Rules for Claude (and for you)

- **No releasing or deploying.** No `flyctl` or Fly deploys, no publishing to the owner's artifact, no
  pushes to `main` or the test build, no new entries in `RELEASES` and no edits to `VERSION` in
  `src/version.js`, and nothing in Supabase (data or schema). If a release is needed, say so in the PR;
  the owner does it.
- **Gameplay and balance need the owner's OK first.** That means unit or building stats and costs, AI
  behaviour, powers, win rules, or anything else that changes how the game plays. Ask which mode it is
  for: single player, online PvP, or both. Online battles can have their own rules.
- **No approval needed** for bug fixes, UI, art, sound and tooling that leave gameplay unchanged. Still
  describe them in the PR.
- **Credits.** No EA or Westwood assets. Make originals, and credit any outside source (including
  AI-generated references) in `CREDITS.md`.

## Code and testing

- Plain JavaScript, no build step and no framework. The scripts in `src/` are loaded in order by
  `index.html` and share globals.
- A new script must be added to `index.html` and to `FILES` in `sw.js` (the offline cache).
- Run `node --check` on every script you change.
- Run the `tools/sim` script for the area you touched: `node tools/sim/<script> <repo path> ...`
  (the table in `CLAUDE.md` lists them). For example `production.js` after changing units.
- To try the game, open `index.html` in a browser (from a file it never reports to Supabase), or run
  `python3 -m http.server` in the repository folder.
- If you host a copy on a website (such as GitHub Pages on your fork), test matches may be reported to
  the owner's stats. Ask first. Online play against the game server only works when your version matches
  the server's, so it falls back to phone to phone.
