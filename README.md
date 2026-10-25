# Pocket Siege

A small real-time strategy game that runs in any modern browser: iPhone and iPad (Safari), Android, and desktop. It is plain HTML, CSS and JavaScript on a canvas, with no build step and no dependencies.

Mine gold, build Houses, Barracks and Towers, train Soldiers and Archers, and destroy the red Town Hall before the enemy AI destroys yours. Choose Easy, Normal or Hard on the start screen.

## Play

- **Locally:** open `index.html` in a browser, or serve the folder (`python3 -m http.server`) and visit `http://localhost:8000`.
- **On iPhone:** host the folder anywhere with HTTPS (GitHub Pages works: *Settings → Pages → Deploy from branch*), open it in Safari, then *Share → Add to Home Screen*. It launches full screen like an app and works offline after the first visit.

## Controls

| Action | Touch | Mouse / keyboard |
| --- | --- | --- |
| Select unit or building | Tap | Left click |
| Select all of one kind on screen | Double-tap | Double click |
| Select a group | Hold, then drag (or toggle ⬚ and drag) | Drag a box |
| Move / attack / mine / help build | Tap the ground, an enemy, a gold mine or a building site | Right click |
| Attack-move | Attack button, then tap | Q, then click |
| Scroll the map | Drag | WASD / arrow keys, or middle-drag |
| Zoom | Pinch | Mouse wheel |
| Jump the camera | Tap the minimap | Click the minimap |
| Stop / home / cancel | Buttons | X / H / Esc |

The 👷 button selects idle workers in turn; ⚔️ selects your whole army.

## Files

- `index.html`: page and HUD markup, iOS home-screen meta tags
- `style.css`: HUD styling, safe-area handling for notched phones
- `game.js`: game simulation, enemy AI, input and rendering
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and home-screen install
- `scripts/build-single-file.py`: bundles everything into one HTML file
