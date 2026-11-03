'use strict';
// The maps, and the map picker used by the skirmish screen and the online lobby.
// To add a map: give it an entry here, then make `genMap` (world.js) lay it out when `G.mapId` is its id.
// A map with `rows` is a fixed layout (`genLayoutMap`); make one from a picture with tools/map-from-image.py.

const MAPS = {
  bridge: {
    name: 'A Bridge Too Far',
    img: 'maps/bridge.png',   // from tools/make-map-previews.js
    blurb: 'An island split by two long lakes. Fight over the central road, the timber bridges or round the lake ends.',
    info: '144 × 144 cells · 8 start positions',
  },
  river: {
    name: 'Three Bridges',
    img: 'maps/river.png',
    blurb: 'A winding river splits west from east. Three bridges cross it: in the far north, the middle and the south. Creeks and cliffs make chokepoints, and ore lies on both banks.',
    info: '144 × 144 cells · 8 start positions · made for 2 v 2',
    // Built for 2 v 2 (not playable as teams yet): the west bank (start positions 0-3) against the east (4-7).
    // A 1 v 1 starts one player on each bank. Not mirrored, so the banks differ a little.
    teams: [[0, 1, 2, 3], [4, 5, 6, 7]],
    // A fixed layout, traced from the owner's design (maps/designs/river.png) by
    // python3 tools/map-from-image.py maps/designs/river.png 126 144 --bridge 50,0,60,2 --bridge 65,50,78,52 --bridge 72,111,83,113
    // Start positions in cells; rows run-length coded: '.' grass, ',' dirt, 'T' woods, '#' rock, '~' water, '=' bridge, 'o' ore.
    spawns: [[9,8],[36,47],[37,90],[36,130],[130,12],[108,42],[106,89],[112,125]],
    rows: [
      '59.8=18.3T2.#6.16o17.T13.',
      '30.8o5.4T10.13=13.6T.#5.19o15.3T11.',
      '29.11o3.5T11.8=6.2T8.6T.#5.21o27.',
      '27.14o4.4T10.2,6~6.5T3.T8.3#2.22o27.',
      '27.14o4.4T10.2,6~6.5T3.T8.3#2.22o27.',
      '27.8o2T4o4.4T10.2,6~2,5.5T2.2T7.#4.oT20o27.',
      '25.14o.o5.3T12.,5~2,4.5T12.#4.22o27.',
      '19.3T.2T.14o22.,6~#,2.4T12.2#4.20o29.',
      '21.5T14o22.,7~,18.2#4.15o2T.4T27.',
      '21.5T14o3.2T17.,7~,15.3#.#4.14o.7T27.',
      '21.3T2.11o6.3T16.,6~2,15.#.#.#4.14o2.6T27.',
      '21.3T2.9o2.3#22.,6~,20.#4.12o4.3T30.',
      '21.3T2.9o2.3#22.,6~,20.#4.12o4.3T30.',
      '2T24.6oT4o25.,6~,16.4#5.o.4oT5o4.2T31.',
      '5T21.12o24.,6~,17.#6T2.o.7o.o3.T33.',
      '5T8.#5.3#3.13o12.4#9.2,4~,17.#5T10.2o5.2T32.',
      '5T13.4#3.13o12.#2.#10.,4~,16.2#.5T44.#5.',
      '.5T12.3#6.11o26.,5~,15.2#2.4T50.',
      '.5T11.4#6.2o.8o25.,6~,16.#38.T3.4T10.',
      '3#7.8#11.9o24.#7~,16.#13.#24.2T2.6T8.',
      '3#7.8#11.9o24.#7~,16.#13.#24.2T2.6T8.',
      '17#15.6o24.,7~,16.#29.3#11.6T7.',
      '3.7#51.,8~,16.#29.#.#11.4T9.',
      '43.4T14.,7~2,16.2#42.4T7.#.',
      '43.5T14.8~,.#14.#45.3T6.2~',
      '38.#.2#3.4T12.,15~#9.#45.2T2.#5~#',
      '37.4#2.5T11.2,8~,4~#4~#5.2#8.#41.4~2#.',
      '13.2T.2T4.T14.3#3.3T4.#2.3#.12~,2.#4.#4~5#.3#2.~.3#8.4#26.#~#5.',
      '13.2T.2T4.T14.3#3.3T4.#2.3#.12~,2.#4.#4~5#.3#2.~.3#8.4#26.#~#5.',
      '13.6T3.2T14.#8.#2.3#16~,10.~6#8~2#2~2#4.2#11.#9.T7.#~#5.',
      '.#12.4T20.#8.3~3#~2#3.2,9~,10.5#3~2#4.#.#5~4#2.#8.7#3.2T3.4#2~3#2.',
      '14.4T21.3#3.3~#.#8.2,10~,8.#14.#5.12~#4.2#.4#8.9#2.',
      '14.3T22.4#3~2#2.#8.2,11~,7.#21.4#5~#3~2#.2#2.3#14.3#2.',
      '33.4#.2~5#14.2,12~2,5.2#19.#7.#3.#4~2#3.2#16.2#.',
      '31.#.7~5#16.2,14~4.5#15.#15.2~#7.2T10.4#.',
      '17.#3.#4.#4.3~3#5.3#17.,14~#2,6.#3.#27.2#2.3#2.6T3.5#3.',
      '17.#3.#4.#4.3~3#5.3#17.,14~#2,6.#3.#27.2#2.3#2.6T3.5#3.',
      '14.#2.2#6~.3#3~#10.2#3.T13.,16~,6.4#13.2T13.2#.4#3.6T2.3#5.',
      '14.3~2#4~#2~3#~2#11.2#2.3T13.,16~6.4#13.2T13.4#6.5T11.',
      '9.#5~#.#3.#4.#20.4T14.,14~,8.#28.3#9.4T10.',
      '9.4~2#2.#8.#20.6T13.3,~,9~,7.2#54.',
      '8.#~#10.2T26.4T18.2,8~#,5.2#54.',
      '8.#~#10.4T25.3T20.,8~,6.#54.',
      '5.4#2~3#8.4T24.3T21.,8~2,4.#54.',
      '5.4#2~3#8.4T24.3T21.,8~2,4.#54.',
      '5.9#8.5T48.2,.,4~2,4.#3T30.3T.2T15.',
      '11.3#8.5T51.,4~2,4.#5T28.7T14.',
      '13.2#63.,6~,3.#.5T23.2T4.4T15.',
      '11.4#10.#22.3,2~4,21.,6~,3.T#6T22.2T4.4T15.',
      '8.5#12.2T21.,8~2,4.3,13.2,4~,3.2T4#2T28.3T16.',
      '8.3#37.,12~.,2~,14.,4~,3.5T.#2.#4.2#21.2T16.',
      '48.,12~#3~,14.,5~,3.6T14#34.',
      '48.,12~#3~,14.,5~,3.6T14#34.',
      '48.,16~,13.,6~,3.7T22.#24.',
      '48.,16~,12.#7~,57.',
      '48.,16~,12.,8~,24.13o.2o16.',
      '14.#33.,8~2,3#3,12.,9~,23.19o14.',
      '14.7#27.,6~2,.#2.2#3.T10.11=22.21o13.',
      '14.2#.4#10.2T15.,5~,11.5T3.16=20.15oT5o13.',
      '.4#9.2#2.3#3.T2.3T.2T16.4,~,12.5T5.11=22.3oT19o11.',
      '.4#9.2#2.3#3.T2.3T.2T16.4,~,12.5T5.11=22.3oT19o11.',
      '.#.2#9.2#3.2#3.6T23.2,11.6T2.#2,10~,22.23o11.',
      '14.2#9.5T2.o.o4.8o3.5o11.3T5.#11~,23.23o11.',
      '14.2#2.3#4.4T.29o12.,11~3,8.2#9.5T.23o10.',
      '14.2#.4#4.5T21o2T8o9.,11~,11.2#6.2T.6T4.19o2.3T5.',
      '14.4#7.5T31o8.,9~2,~,10.2#7.2T2.6T6.o.11o2.o2.7T.',
      '3T11.3#8.2T2.3oT26o7.,10~2,2.2,10.2#11.4T5.3#.15o3.7T',
      '3T26.17o2#9o4.#3.,9~2,#15.3#18.4#.10oT3o4.5T2.',
      '3T26.17o2#9o4.#3.,9~2,#15.3#18.4#.10oT3o4.5T2.',
      '5T24.16o3#8o5.#,2#8~2,4.T14.2#.2#15.3#2.17o2.3T3.',
      '6T24.15o2#2.6o2.,13~2,5.3T13.10#9.4#3.18o6.',
      '6T24.12o.4#2.5o.2,12~2,6.5T12.3#2.15#5.19o6.',
      '2.3T21.4#2.3o2.8#4.2o4.,11~2,8.5T22.9#7.18o6.',
      '26.17#12.,8~2,~2,8.2T42.21o2.',
      '5.T24.7#19.6~2,2.3,52.20o3.',
      '5.2T48.,3~3,21.2T18.2T8.2T6.21o2.',
      '5.2T48.,3~3,21.2T18.2T8.2T6.21o2.',
      '39.2T13.,3~,10.#13.3T17.2T7.6T4.6o3.4oT5o3.',
      '38.3T13.,2~,54.7T3.6o6.7o.o.',
      '37.4T12.,3~,33.4T18.5T7.2o2.2T3.9o.',
      '11.3#T.3T18.5T9.2#4~,33.5T17.4T12.2T2.8o3.',
      '11.3#5T18.4T10.2,5~,30.2#5T18.4T15.6o5.',
      '10.3#2.4T19.5T7.,7~,29.T#.2#2T19.3T16.5o6.',
      '10.3#.5T22.2T7.,8~2,26.3T3#2T49.',
      '10.3#.5T22.2T7.,8~2,26.3T3#2T49.',
      '10.4#4T32.,10~,8.2T15.6T10.3#38.',
      '11.3#.2#34.2,8~,8.2T15.3T13.#.#13.9#16.',
      '11.12#6.#23.,7~,9.3T13.3T29.9#16.',
      '2.4o5.4#2.6#30.,8~,8.4T51.2#16.',
      '2.6o10.#2.2#31.,8~,7.4T52.2#15.',
      '.15o2.5#32.2,7~5,4.2T51.3#15.',
      '5oT11o.#38.,11~2,42.2T7.5#8.#8.',
      '5oT11o.#38.,11~2,42.2T7.5#8.#8.',
      '17o.#39.,13~41.2T7.4#18.',
      '18o41.2,.,9~#2,12.2T26.5T24.',
      '18o45.2,~3,6~2,10.3T24.5T25.',
      '19o48.2,8~2,9.5T21.5T25.',
      '.17o.2o3.2T44.,8~,9.5T21.5T24.',
      '.18o5.5T42.2,8~2,6.5T21.5T24.',
      '.10o2T8o4.5T43.,8~,7.3T51.',
      '.10o2T8o4.5T43.,8~,7.3T51.',
      '.16o.3o3.7T30.#.4#7.,2~,5~32.3T12.5,9.',
      '5.12o.o5.7T30.6#8.2,.,4~2,44.,5~,8.',
      '9.4o.2o10.T7.#26.6#11.,4~2,27.2#12.2,8~5,3.',
      '26.3T25.3,4.4#13.,6~#,25.2#12.,12~2,3.',
      '5.2T46.,2~,21.,7~,8.3#15.2#2.#.3#.16~2,3.',
      '.2T2.2T6.4,31.2,3#3~,22.2,6~,7.9#9.#~2.2#19~,5.',
      '.7T5.,3~,27.#.,8~,23.,6~,10.6#9.#3~2#~2#4.,9~2,6.',
      '.7T5.,3~,27.#.,8~,23.,6~,10.6#9.#3~2#~2#4.,9~2,6.',
      '2.6T5.,4~3,24.#10~,23.,6~,11.2#.2#9.2#2.#8.,8~,8.',
      '2.4T7.,7~,19.,14~,23.,7~,10.4~#9.2#2.#9.3,#3,~,8.',
      '2.4T8.,9~5,2~2,6.2,7~2,3#3,25.,7~,.4#.5~4#7.3#14.#4.2,8.',
      '2.3T10.,16~,6.,6~2,.#.3#28.,15~3#T11#31.',
      '15.,16~,6.,5~,13.3T20.,5~,4~2#3.5T2.7#32.',
      ',14.,15~,8.3,2~,12.7T16.,6~,9.3T43.',
      '~5,9.,13~2,12.3,12.3T.4T14.,7~,9.3T43.',
      '~5,9.,13~2,12.3,12.3T.4T14.,7~,9.3T43.',
      '5~,10.2,8~3,29.#2T#3T15.,8~,43.T10.',
      '5~,11.,6~2,31.8T15.,9~43.3T8.',
      '3~2,12.,5~,33.4T.2T17.,8~,39.6T8.',
      '~2,15.4,~,11.3T19.5T20.,7~,38.6T9.',
      ',21.2,11.5T17.5T20.,8~2#,3.#31.5T10.',
      ',36.4T20.T20.,10~,37.4T9.',
      ',7.3#26.5T19.2T14.T4.,10~,36.T2.2T9.',
      ',7.3#26.5T19.2T14.T4.,10~,36.T2.2T9.',
      '8.#.#26.3T37.2T4.3,7~,26.#.5#3.3T11.',
      '3.3T24.T25.7o.o4.2o14.,7~,26.7#17.',
      '2.4T24.2T24.16o13.9=26.7#17.',
      '2.6T16.3#28.17o10.14=24.5#19.',
      '3.6T15.#.#28.4o2T11o13.9=36.4o4.4#2.',
      '3.5T47.17o5.2T6.,7~,35.7o2.#2.#2.',
      '5.3T47.17o2.4T.2T2.2,6~3,34.14o2.',
      '5.3T47.17o2.4T.2T2.2,6~3,34.14o2.',
      '6.2T45.2T.15o3.5T3.,8~2,35.15o.',
      '27.3T23.2T.15o2.5T4.,8~2,10.T11.2T6.2T2.16o.',
      '27.3T21.4T2.14o2.4T6.8~2,10.2T9.4T5.3T.6oT9o.',
      '16.T10.4T15.T4.5T.14o.2T8.,6~2,4.2T17.7T6.16o.',
      '16.2T9.5T14.2T5.4T.13o10.,6~2,3.6T7.#10.5T4.18o',
      '6.2T21.4T20.4T4.4oT5o10.,6~,4.4T20.4T5.18o',
      '6.2T21.3T23.3T3.10o9.,7~,4.5T20.3T4.13oT5o',
      '6.2T21.3T23.3T3.10o9.,7~,4.5T20.3T4.13oT5o',
      '29.2T24.2T5.8o9.#6~2,31.2T4.19o',
      '62.8o9.,6~,40.16o.',
      '78.,7~,44.13o',
    ],
  },
};
const DEFAULT_MAP = 'bridge';
const MAP_LIST = Object.keys(MAPS);
const validMap = (id) => (MAPS[id] ? id : DEFAULT_MAP);

// Buttons for every map, the chosen one pressed (data-map holds the id). `cls` styles the group.
function mapCardsHtml(selected, cls = '') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<div class="pick maps ${cls}" role="group" aria-label="Map">${MAP_LIST.map((id) =>
    `<button type="button" data-map="${id}" aria-pressed="${id === selected}">${MAPS[id].img ? `<img class="map-img" src="${MAPS[id].img}" alt="" width="224" height="224">` : ''}<span>${esc(MAPS[id].name)}</span><small>${esc(MAPS[id].info)}. ${esc(MAPS[id].blurb)}</small></button>`).join('')}</div>`;
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
