'use strict';
// Release notes, newest first; the first entry is the version this copy of the game is. Add a
// new entry at the top with every update for the testers: an installed copy notices the new
// version when it is next opened or brought back to the front, and offers to restart into it.
// The What's New page on the menu shows them all.
const RELEASES = [
  { v: '2026.10.28.4', date: '28 October 2026', title: 'Separate aircraft queues', groups: [
    ['', [
      'Helicopters and jets have their own build queues: the Helipad and the Airfield each build on their own, so you can build one of each at the same time. The computer does too.',
    ]],
  ] },
  { v: '2026.10.28.3', date: '28 October 2026', title: 'Leaderboard', groups: [
    ['', [
      'A Leaderboard on the menu: wins against the computer, hardest difficulty first, then fastest time.',
      'After a win, the debrief asks for a name for the leaderboard. Your phone remembers it for next time.',
    ]],
    ['Anonymous match data', [
      'The game now reports anonymous match data: each mission\'s side, difficulty, result, length and debrief numbers, with a random id for your device. No account, location or personal details, and nothing else on your phone.',
      'While you play, the game checks in once a minute so we can see how many people are playing.',
      'The name you give after a win is the only thing anyone else can see, on the leaderboard.',
      'Playing offline works exactly as before.',
    ]],
    ['Fixes', [
      'A jet queued while you had no Airfield no longer holds up the helicopters queued behind it (the computer had the same problem).',
      'With more than six aircraft on one pad, they no longer park on top of each other: they spread out below the runway or around the Helipad.',
    ]],
  ] },
  { v: '2026.10.28.2', date: '28 October 2026', title: 'Fighters scramble', groups: [
    ['', [
      'Fighters waiting on the Airfield scramble when enemy jets or helicopters come over your base, and fly back once the sky is clear. The computer does the same on Normal and Hard.',
      'Jets no longer circle over the battlefield with nothing to hit: they fly home after a few seconds, and a fighter out of air-to-air missiles breaks off its chase to rearm. MiGs come home from far more of their sorties.',
    ]],
  ] },
  { v: '2026.10.28.1', date: '28 October 2026', title: 'Air balance', groups: [
    ['', [
      'The Allied Attack Helicopter\'s Hellfires are made for armour: they do half as much to infantry as before, and the helicopter goes after vehicles first.',
      'The Allied computer no longer trains nothing but Rocket Soldiers once it sees enemy aircraft: about 4 in 10 of its infantry, 6 in 10 when you fly, with rifles for the rest.',
      'Fixed MiGs flying without their sight since the last update, so they can pick out targets on their own again.',
    ]],
  ] },
  { v: '2026.10.28', date: '28 October 2026', title: 'Helicopters as in Red Alert', groups: [
    ['', [
      'The Allied Attack Helicopter carries six armour-piercing Hellfire missiles a sortie with a 4-cell reach: deadly to tanks, poor against infantry.',
      'The Soviet Hind carries twelve chain-gun bursts a sortie and reaches 5 cells: it tears through infantry.',
      'MiGs are about 9% faster, so anti-aircraft missiles struggle to catch them from behind.',
      'Kills from bombs, splash damage and shots that land after their shooter is gone now count, in the debrief too.',
    ]],
  ] },
  { v: '2026.10.27.4', date: '27 October 2026', title: 'Mission debrief', groups: [
    ['', [
      'A new end-of-mission debrief. The Battle tab graphs both sides\' military strength, income and buildings through the whole game, with the key moments marked: drag across it for details.',
      'Your most valuable unit gets a medal: the one with the most kills, with what it destroyed and how long it fought.',
      'The Scorecard tab puts your numbers beside the enemy\'s, and shows which of your units did the killing.',
      'Rematch starts again with the same side and difficulty.',
    ]],
  ] },
  { v: '2026.10.27.3', date: '27 October 2026', title: 'More money, as in Red Alert', groups: [
    ['', [
      'You start with $10,000 instead of $5,000, as in Red Alert\'s multiplayer ($12,000 for the computer on Hard).',
      'Ore grows back even while your trucks are mining it.',
      'Ore spreads: every so often a field creeps out onto open ground beside it, so fields left alone slowly get bigger and the map no longer runs dry.',
    ]],
  ] },
  { v: '2026.10.27.2', date: '27 October 2026', title: 'What\'s New', groups: [
    ['', [
      'A What\'s New page on the menu, beside the Field Manual, with the notes for every release so far.',
      'The menu shows which version you are playing.',
    ]],
  ] },
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
