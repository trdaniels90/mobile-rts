'use strict';
// The maps, and the map picker used by the skirmish screen and the online lobby.
// To add a map: give it an entry here, then make `genMap` (world.js) lay it out when `G.mapId` is its id.

const MAPS = {
  bridge: {
    name: 'A Bridge Too Far',
    blurb: 'An island split by two long lakes. Fight over the central road, the timber bridges or round the lake ends.',
    info: '2v2 sized · 8 start positions',
  },
};
const DEFAULT_MAP = 'bridge';
const MAP_LIST = Object.keys(MAPS);
const validMap = (id) => (MAPS[id] ? id : DEFAULT_MAP);

// Buttons for every map, the chosen one pressed (data-map holds the id). `cls` styles the group.
function mapCardsHtml(selected, cls = '') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<div class="pick maps ${cls}" role="group" aria-label="Map">${MAP_LIST.map((id) =>
    `<button type="button" data-map="${id}" aria-pressed="${id === selected}">${esc(MAPS[id].name)}<small>${esc(MAPS[id].info)}. ${esc(MAPS[id].blurb)}</small></button>`).join('')}</div>`;
}

// The skirmish map screen: MapSelect.open(selectedId, (id) => start the game).
const MapSelect = (() => {
  let root = null, chosen = DEFAULT_MAP, go = null;
  function render() {
    root.querySelector('.map-body').innerHTML = mapCardsHtml(chosen) +
      '<div class="on-btns"><button type="button" class="pf-btn on-go" data-map-go>Start skirmish</button></div>';
  }
  function build() {
    root = document.createElement('div');
    root.id = 'maps';
    root.hidden = true;
    root.innerHTML = `<div class="fm-book" role="dialog" aria-modal="true" aria-labelledby="mapTitle">
      <header class="fm-top"><span class="fm-brand">Skirmish</span><div class="fm-tabs"></div>
        <button type="button" class="fm-close" aria-label="Close">✕</button></header>
      <div class="fm-page"><h2 id="mapTitle">Choose a map</h2><div class="map-body"></div></div>
    </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
      if (e.target.closest('.fm-close') || e.target === root) { close(); return; }
      const card = e.target.closest('[data-map]');
      if (card) { chosen = validMap(card.dataset.map); render(); return; }
      if (e.target.closest('[data-map-go]')) { const f = go; close(); if (f) f(chosen); }
    });
  }
  function open(selected, onGo) {
    if (!root) build();
    chosen = validMap(selected); go = onGo;
    render();
    root.hidden = false;
  }
  function close() { if (root) root.hidden = true; }
  return { open, close };
})();
