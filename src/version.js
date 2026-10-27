'use strict';
// Release notes, newest first; the first entry is the version this copy of the game is. Add a
// new entry at the top with every update for the testers: an installed copy notices the new
// version when it is next opened or brought back to the front, and offers to restart into it.
// The What's New page on the menu shows them all.
const RELEASES = [
  { v: '2026.10.27', date: '27 October 2026', title: 'Rocket Soldiers, ore and an installable app', groups: [
    ['Units', [
      'Rocket Soldiers are Allied only, as in the original Red Alert, with two weapons: Dragon rockets for tanks (full damage to armour, little to infantry) and RedEye missiles with longer reach for aircraft.',
    ]],
    ['Economy', [
      'Ore Trucks work the field nearest their refinery until every last bit of it is gone, then move on to the next nearest. At most three trucks share a field.',
      'Ore fields start 50% richer, and grow back slowly and only while no truck is working them.',
    ]],
    ['Phones held upright', [
      'The Field Manual fits the screen, with a tidier header and footer, and the current chapter\'s tab stays in view.',
      'Menu and console buttons no longer overflow.',
    ]],
    ['The app', [
      'Add the game to your home screen and it updates itself: when a new version is out, the menu offers a restart into it.',
      'The menu shows the version and what\'s new.',
    ]],
  ] },
  { v: '2026.10.27-c', date: '27 October 2026', title: 'Trucks and base defence', groups: [
    ['', [
      'Ore Trucks mine the ore near your base first instead of driving across the map, and avoid the enemy side.',
      'When raiders hit your base, only as many of your units as are needed go after them; the rest stay where they are.',
    ]],
  ] },
  { v: '2026.10.27-b', date: '27 October 2026', title: 'No more endless stalemates', groups: [
    ['Stalemates', [
      'Repairs are much slower: about a minute to fully fix a building, and only a quarter of that speed while it is under fire.',
      'The computer no longer repairs buildings that are being shot at, and no longer pulls its whole army home at the first sign of trouble.',
      'Construction Yards are tougher (2500 health, from 1500).',
    ]],
    ['Attacking', [
      'Switching on Auto Attack sends every idle unit at once; after that new units go out in groups of 10.',
      'Units head out at their own full speed instead of crawling along at the slowest one\'s pace, and so do the computer\'s waves.',
      'On Normal the computer\'s first wave arrives a minute later.',
    ]],
    ['Economy', [
      'Extra Barracks and War Factories speed up building: 1.5 times as fast with two, twice with three, up to 2.5 times.',
      'Ore grows back much more slowly, as in the original: you will need to expand.',
      'Ore Trucks pick fields by the real drive round the lakes, and only a few nearby units rush to help a truck under fire.',
      'On Normal the computer builds its second refinery much earlier.',
    ]],
    ['Other', [
      'The computer can field bigger armies, up to 60 units. The Allied Strike Jet is tougher. About 30% fewer trees.',
    ]],
  ] },
  { v: '2026.10.27-a', date: '27 October 2026', title: 'Bigger battlefield, smarter units, crashes', groups: [
    ['The battlefield', [
      'The map is about 25% larger, with much roomier starting areas, and every ore and gem field can be reached.',
      'Fewer traffic jams: units stop at the edge of a crowd instead of shoving into it.',
    ]],
    ['Your army', [
      'New units spread out around your base instead of piling onto one rally point. Auto Attack starts off.',
      'Units fire back when shot, even at artillery or turrets out of their sight. Attack waves stop to fight what they run into, defences first.',
      'Ore Trucks retreat to base when shot at and go back to mining once it is safe.',
    ]],
    ['Units and powers', [
      'Allied Artillery and the Soviet V2 shoot further, and Artillery hits tanks harder.',
      'Paratroopers attack the nearest enemy building once they land, then the next.',
      'Shot-down pilots run home: get them back to any of your buildings for $100.',
    ]],
    ['Crashes', [
      'Jet pilots eject: the canopy blows, the seat rockets out and the parachute opens.',
      'Downed aircraft spin, roll and shed burning debris; jets bounce and skid before exploding, helicopters lose their rotor blades, and wrecks splash into water.',
      'Helicopter rotors look much faster in flight.',
    ]],
    ['Difficulty', [
      'Normal is easier: the computer starts slower, builds a smaller economy and sends steadier waves.',
    ]],
  ] },
  { v: '2026.10.26', date: '26 October 2026', title: 'Red Horizon: the first test build', groups: [
    ['', [
      'The game is renamed Red Horizon, with a new app icon, and has a Field Manual on the menu.',
      'A real computer opponent: planned waves and big pushes, raids on Ore Trucks and outposts, more defences, and answers to your aircraft, by difficulty.',
      'Radar Dome, Allied Artillery and the Soviet V2 Rocket Launcher; the Allied jet is now a Strike Eagle with flares.',
      'The map is laid out after the classic A Path Beyond, sized for 2 against 2, with forests, random start positions and rare gem fields.',
      'Deployable Mobile Outposts, the Advanced Power Plant, and Spy Plane, Paratrooper and Bombing Run powers from the Airfield.',
      'Infantry fidget while they wait, take cover under fire and fall as ragdolls; tanks can cook off; wrecks, craters and bodies stay on the battlefield.',
      'Smarter Ore Trucks that move on from crowded fields and favour gems.',
    ]],
  ] },
  { v: '2026.10.25', date: '25 October 2026', title: 'First playable', groups: [
    ['', [
      'Allies against Soviets with pre-rendered 3D pixel art in the style of the classic.',
      'Recorded battle sounds, an announcer and unit voices, and an original soundtrack.',
      'Pillboxes and Flame Towers, base defence against raids, and auto attack.',
      'Win by destroying the enemy Construction Yard.',
    ]],
  ] },
];
const VERSION = RELEASES[0].v;
