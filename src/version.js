'use strict';
// Release notes, newest first; the first entry is the version this copy of the game is. Add a
// new entry at the top with every update for the testers: an installed copy notices the new
// version when it is next opened or brought back to the front, and offers to restart into it.
// The What's New page on the menu shows them all.
const RELEASES = [
  { v: '2026.11.26.1', date: '26 November 2026', title: 'AA Gun barrels recoil', groups: [
    ['Improved', [
      'The AA Gun\'s twin barrels now fire in turn, and each one kicks back when it fires.',
    ]],
  ] },
  { v: '2026.11.26', date: '26 November 2026', title: 'Headlights, sharper HD battle debris', groups: [
    ['New', [
      'Ore Trucks switch on their headlights after dark, lighting the ground ahead of them: all night on night maps, and as dusk falls on maps with day and night.',
      'Attack move now sends your armed aircraft too.',
      'Windows app: a Full screen option in Settings, remembered between runs (F11 still works).',
    ]],
    ['Improved', [
      'HD graphics: thrown wheels, armour plates and falling soldiers are drawn in finer detail.',
      'Mobile SAMs keep to the back of the army instead of leading the charge.',
      'The AA Gun\'s muzzle flash and shells now come from the ends of its barrels.',
    ]],
  ] },
  { v: '2026.11.25.4', date: '25 November 2026', title: 'Vehicles come apart, attack move', groups: [
    ['New', [
      'Vehicles come apart when destroyed: wheels are blown off and go tumbling, bounce and roll away before toppling over; tanks throw road wheels and lengths of track, and plates of armour fly.',
      'Crews die too: a Ranger\'s driver and gunner are thrown out of it, and truck drivers and tank commanders are sometimes flung clear.',
      'More ways for soldiers to fall: a sniper\'s shot drops a man where he stands, others sink to their knees and pitch forward or are spun round, and blasts send arms and legs flailing.',
      'Attack move: tap AUTO and pick Attack move, then tap the map. Your whole army goes there, fighting whatever it meets on the way, then holds the spot.',
    ]],
    ['Improved', [
      'Jets and planes fly level above the hills instead of following the ground.',
      'Smoother big battles on computers: the game sorts and draws hundreds of units faster.',
      'Map Editor: changes are quicker, as only the ground that changed is redrawn.',
    ]],
    ['Fixed', [
      'The radar no longer flashes black during busy battles.',
    ]],
  ] },
  { v: '2026.11.25.3', date: '25 November 2026', title: 'Water in the rain, waterfalls, survivors', groups: [
    ['New', [
      'Rain water: the rain now runs downhill, soaks the ground darker and gathers in pools that follow the lie of the land, with rain rings on them and water running down the slopes. Dug craters fill and tank tracks hold water.',
      'Waterfalls: rain pools on top of plateaus, and when the pond is big enough it pours over the cliffs. On every map that gets rain or storms.',
      'Puddles react: tanks and soldiers splash through them, blasts send ripples across them, and fire glows in the water.',
      'Survivors: when a structure is destroyed there is a chance some of its staff escape, hurt; when you sell one they walk out unhurt. About one in three is a Technician, a civilian with a pistol.',
    ]],
    ['Improved', [
      'Rain runs off defences as a thin trickle of drops instead of a solid stream.',
    ]],
  ] },
  { v: '2026.11.25.2', date: '25 November 2026', title: 'HD ground, wrecks back', groups: [
    ['New', [
      'HD ground: with HD graphics on, the ground and cliffs are drawn at twice the detail, and wrecks and fallen soldiers are as sharp as the units. On by default on computers. On phones it is off for now: turn it on in Options, Graphics, to try it (it uses four times the memory for the ground; if the game reloads mid-battle, turn it off).',
    ]],
    ['Fixed', [
      'Wrecks and fallen soldiers stay on the battlefield again: the new craters were drawn over them.',
    ]],
    ['Improved', [
      'Heavy and Mammoth Tanks have their own deeper gun sounds.',
      'Map Editor: zoom in and out on a computer too, and + / − zoom buttons.',
      'Storms now soak the ground: puddles, rivulets and water running off roofs while the storm rains.',
      'Walls built at a slant run in two straight lines instead of a saw-tooth, and gates join walls on any side.',
    ]],
  ] },
  { v: '2026.11.25.1', date: '25 November 2026', title: 'HD graphics, Map Editor', groups: [
    ['New', [
      'HD graphics (Options, Graphics): sharp, smooth units and buildings instead of pixels. Models are rebuilt at four times the detail, the battle is drawn at twice the resolution, and shadows are soft. Off unless you turn it on. Uses more graphics power, and downloads about 24 MB the first time.',
      'Map Editor (main menu): paint grass, cliffs, water and ore, place starting spots, plateaus and villages, then play your map in a skirmish. You edit over the real battlefield, so you see the map as it will play.',
    ]],
    ['Improved', [
      'PC: the mouse wheel zooms out at most two steps from fully zoomed in. Phones keep the full pinch range.',
      'The Light Tank now has its own lighter, quieter gun sound.',
      'Rain no longer pours from the tops of chimneys and towers.',
    ]],
  ] },
  { v: '2026.11.25', date: '25 November 2026', title: 'Mobile SAM, Lakeside high ground', groups: [
    ['New', [
      'Soviet Mobile SAM: a tracked missile launcher built at the War Factory ($800). It fires missiles at aircraft only, out-ranging most air defence, and needs no power.',
      'Lakeside: the rock ring in the middle of the north ore field is now a plateau with trees on top, cliffs all round and a ramp up the back. Its ore sits round the foot.',
      'Options: Play over my music. Turn it on to keep your own music app playing while you play (game sounds then follow the silent switch).',
    ]],
    ['Improved', [
      'Rain: water now runs off building roofs in steady streams with drips and splashes, and the falling rain shows again on devices using the faster renderer.',
      "The computer's base walls now go round ore, trees and rock instead of leaving gaps.",
      'Main menu: "Welcome back, Commander."',
    ]],
    ['Changed', [
      'The soundtrack has been removed. Sound effects and voices stay.',
    ]],
  ] },
  { v: '2026.11.24.1', date: '24 November 2026', title: 'Tank Destroyer, new main menu, smoother on PC', groups: [
    ['New', [
      'Allied Tank Destroyer: built at the War Factory once you have a Tech Center ($1100). No turret, so the whole vehicle turns to aim, but its long gun out-ranges every tank and hits armour hard. Weak against soldiers and buildings, and it cannot shoot at aircraft.',
      'Explore a map: from the map screen, walk over any battlefield with no bases, no enemies and no fog of war, to learn the ground.',
      'A new main menu on a screen of its own. Side and difficulty are now picked on the skirmish screen, where the maps sit under 1v1, 2v2 and 3v3 tabs.',
    ]],
    ['Improved', [
      'Smoother on computers, especially zoomed out and late in big battles: water, rain, puddles, night searchlights and cliffs all cost far less to draw.',
      'Paratrooper drops no longer slow the game down while the parachutes are in the air.',
    ]],
    ['Changed', [
      'Lakeside: the bridges are narrower, about 4 cells wide.',
    ]],
    ['Fixed', [
      'Water ripples and foam move again (they were frozen), and stray white wave lines no longer drift over the grass.',
    ]],
  ] },
  { v: '2026.11.24', date: '24 November 2026', title: 'Planes break apart, Heron Fen at night', groups: [
    ['Improved', [
      'A jet that hits the ground and bounces now breaks apart: wings, tail, body sections and burning engines tumble on with its speed, and the wreck burns where it hit.',
      'Smoother in big battles: when frames start to slow down, the lighting switches to a lighter version for a while (it looks almost the same), then back to full once things are smooth again.',
    ]],
    ['Changed', [
      'Heron Fen is now always night instead of early morning: much darker, with the lamps, windows and fires lighting the fen.',
    ]],
    ['Fixed', [
      'Ore Trucks you send to a field now keep working that field until it is completely empty, instead of moving to another field when it runs low.',
    ]],
  ] },
  { v: '2026.11.23.1', date: '23 November 2026', title: 'Specialist, aircraft crashes in 3D', groups: [
    ['New', [
      'Specialist, for both sides: a commando trained at the Barracks once you have a Tech Center ($1200, up to 2 at a time). He carries an assault rifle. Send him at an enemy building and he plants a charge, moves off, and 5 seconds later the building is destroyed. The building flashes red while the charge counts down.',
      'Under fire, the Specialist may throw a smoke grenade: a thick cloud that nothing can shoot through for 12 seconds.',
    ]],
    ['Improved', [
      'Aircraft crashes in 3D: shot-down planes tip, roll and dive nose-first, then bury themselves, cartwheel off a wing tip or skid along the ground. Helicopters spin, wobble down as the rotor freewheels and roll onto their side. Wrecks land on hillsides properly.',
    ]],
  ] },
  { v: '2026.11.23', date: '23 November 2026', title: 'Heron Fen, Sniper and Flamethrower, real rain', groups: [
    ['New', [
      'New 2 v 2 map, Heron Fen: every base on a high plateau ringed by cliffs, with ramps down into a misty fen. A deep channel splits west from east, and the only way across is a little fishing village on an island in the middle, with jetties, rowboats and nets drying. Always first light, always fog in the low ground, and now and then a soft rain with no lightning.',
      'Allied Sniper: research the Sniper program at the Tech Center, then train up to 5 at a time. Kills most soldiers with one shot from long range, but barely scratches vehicles and buildings.',
      'Soviet Flamethrower: needs a Tech Center. A short-range stream of fire. When killed he may explode, setting any soldiers nearby on fire, friend or foe.',
    ]],
    ['Improved', [
      'Rain looks real: drops fall onto the ground, blown by the wind, and splash where they land, with rings on water. Gusts of heavier rain sweep across, instead of a dark filter over the screen.',
      'In the rain, water drips off the edges of roofs, puddles form and some keep growing, and small streams run down the hills and ramps into pools.',
    ]],
    ['Changed', [
      'Veterancy: each rank now also adds weapon range (+5%, +10%, +15%, +20%).',
    ]],
  ] },
  { v: '2026.11.22.2', date: '22 November 2026', title: 'Smoother zoomed out, loading screen', groups: [
    ['New', [
      'A loading screen when the game starts, so the menu is ready the moment you see it.',
    ]],
    ['Improved', [
      'Big battles draw much faster zoomed out, especially with lots of walls, villages and explosions on screen.',
      'The start menu answers taps and scrolling straight away instead of hanging for a moment.',
      'The Soviet Advanced Power Plant\'s two cooling towers are now open at the top, with steam rising out of them.',
    ]],
    ['Changed', [
      'Close Air Support: if every plane in a strike is shot down, the power takes 6 minutes to recharge instead of 4.',
      'The computer is more careful with Close Air Support: it only calls it in where it knows of no anti-air covering the target or the way in.',
    ]],
    ['Fixed', [
      'Tank tracks are drawn on the ground again.',
      'The screen no longer jumps on its own while zoomed in.',
      'Aircraft lights stay on the aircraft when flying over hills.',
      'Vehicles in craters no longer lose their lower half.',
      'Small gold dots no longer float beside the Soviet Advanced Power Plant.',
    ]],
  ] },
  { v: '2026.11.22.1', date: '22 November 2026', title: 'Cooler phones, open cooling towers', groups: [
    ['Improved', [
      'Phones run cooler: the game draws 30 frames a second while you watch and goes straight back to 60 as soon as you touch the screen. Turn on Always 60 fps in the menu to keep it at 60.',
      'The Soviet Power Plant\'s cooling tower is now open at the top, with steam rising out of it.',
    ]],
    ['Changed', [
      'The new WebGL graphics are now always used; the WebGL graphics switch has been removed from the menu.',
    ]],
    ['Fixed', [
      'A stray flame no longer burns on the roof of the Soviet Ore Refinery. Its flare stack burns at the top again, with a single flame.',
      'A small gold dot no longer floats beside the Soviet Power Plant.',
    ]],
  ] },
  { v: '2026.11.22', date: '22 November 2026', title: 'Clearer minimap, longer-range artillery', groups: [
    ['Improved', [
      'Units are easier to see on the minimap: bigger dots in brighter colours with a dark edge, so they stand out on snow, sand and grass.',
      'Big battles draw faster, especially zoomed out.',
    ]],
    ['Changed', [
      'Artillery and V2 Rockets now fire at enemies anywhere in their range that your side can see, not only within their own short sight.',
      'Computer opponents build tidier bases: room to grow inside their walls, no buildings on the wall line, and second bases that keep clear of their teammates.',
    ]],
    ['Fixed', [
      'Computer raiding parties no longer train Engineers endlessly.',
    ]],
  ] },
  { v: '2026.11.21.9', date: '21 November 2026', title: 'Smoother on computers', groups: [
    ['Improved', [
      'On computers the whole battlefield ground is now loaded at the start of a battle too, so it no longer pops in when you zoom all the way out on a big screen, and big battles run smoother.',
      'If a battle runs slowly on a computer, the game now lowers its drawing resolution a little until it runs smoothly again, as phones already do.',
    ]],
  ] },
  { v: '2026.11.21.8', date: '21 November 2026', title: 'Lighter on phones, no ground loading in', groups: [
    ['Improved', [
      'On phones the whole battlefield ground is now loaded at the start of a battle, so it never loads in as you scroll or jump around the map. Loading takes a few seconds longer.',
      'Phones use much less memory in big battles, which should stop the game restarting during long 3 v 3 battles.',
    ]],
  ] },
  { v: '2026.11.21.7', date: '21 November 2026', title: 'No more cliffs popping in', groups: [
    ['Improved', [
      'Cliffs are now loaded at the start of a battle instead of being built while you play, so they no longer pop in when you scroll, jump or zoom around the map.',
      'The ground no longer changes as it loads in: its rocks, bushes and patches are there from the start, and only sharpen.',
      'The Deploying forces card is now called Loading and has a progress bar.',
    ]],
    ['Fixed', [
      'Village and Frostlight could stop drawing on devices without WebGL.',
    ]],
  ] },
  { v: '2026.11.21.6', date: '21 November 2026', title: 'Map tools for tuning maps', groups: [
    ['Behind the scenes', [
      'New tools to watch the computers fight and see the whole map, so maps can be tuned. Nothing changes in your games.',
    ]],
  ] },
  { v: '2026.11.21.5', date: '21 November 2026', title: 'Brighter days, fewer street lamps', groups: [
    ['Changed', [
      'On maps with day and night, daytime is now clearly brighter, so it is easy to tell day from night.',
      'Street lamps now stand only along roads and in villages: the lamps round every base are gone.',
    ]],
  ] },
  { v: '2026.11.21.4', date: '21 November 2026', title: 'Invisible units fixed', groups: [
    ['Fixed', [
      'After the last update, some players\' own units could be invisible (still selectable) because an old copy of the unit pictures was used with the new layout. Pictures are now always matched to the right version.',
    ]],
    ['Changed', [
      'Phones now lower the battle\'s drawing resolution by themselves when the game starts to struggle, and raise it again once it runs smoothly: less heat, and less of the map popping in late in big battles.',
    ]],
  ] },
  { v: '2026.11.21.3', date: '21 November 2026', title: 'Cliffs block fire, steadier phones', groups: [
    ['Changed', [
      'Cliffs now block direct fire: tanks, soldiers and defences can no longer shoot through a cliff ridge. Units that spotted an enemy behind one look for another target; units ordered to attack it drive round for a clear shot. Artillery, V2 rockets and grenades still lob over, and aircraft are not blocked.',
    ]],
    ['Fixed', [
      'Phones could crash after a long, big battle (such as a 3 v 3): the game now keeps much less in memory on phones, and frees graphics memory it no longer needs.',
      'Less of the ground and cliffs popping in when you jump round the map.',
      'The Soviet Ore Refinery no longer has a stray flame burning on its roof.',
      'If the game crashed and switched WebGL off, you can switch it back on in the menu.',
    ]],
  ] },
  { v: '2026.11.21.2', date: '21 November 2026', title: 'Quicker menus', groups: [
    ['Fixed', [
      'Menus could be slow to respond on phones: the battle behind them was redrawn all the time even though it was paused. It is now drawn once while the menu is open, which also saves battery.',
    ]],
  ] },
  { v: '2026.11.21.1', date: '21 November 2026', title: 'Smoother battle starts', groups: [
    ['Fixed', [
      'On some phones the screen could freeze for a few seconds at the start of a battle, then jump about. The Deploying forces card now stays up until the battle runs smoothly, and the game notes where the freezes come from so they can be fixed.',
    ]],
  ] },
  { v: '2026.11.21', date: '21 November 2026', title: 'WebGL crash fixed', groups: [
    ['Fixed', [
      'The game crashed (a black screen, or back to the menu with WebGL switched off) about a minute into battles, mostly on PCs with big screens: with WebGL on, it used more and more memory every frame. It now stays steady. If WebGL was switched off after a crash, switch it back on in the menu.',
      'WebGL should also run a little smoother.',
    ]],
  ] },
  { v: '2026.11.20.4', date: '20 November 2026', title: 'Crash reports', groups: [
    ['Fixed', [
      'If the game crashes, it now remembers its last moments and sends them when it is next opened, so the cause can be found and fixed.',
    ]],
  ] },
  { v: '2026.11.20.3', date: '20 November 2026', title: 'No more black screens on PC', groups: [
    ['Fixed', [
      'The Windows app could go black and silent a minute into a battle on some new graphics cards. The app now runs on a much newer engine, and if the game ever crashes it reloads by itself instead of leaving a black window.',
      'If the game crashes while drawing with WebGL, it starts the next time with the older 2D drawing and tells you why on the menu.',
    ]],
    ['New', [
      'WebGL graphics on/off in the menu, under the sound settings. Switch it off if the game crashes or the screen goes black. The change applies the next time the game starts.',
    ]],
  ] },
  { v: '2026.11.20.2', date: '20 November 2026', title: 'Quicker starts', groups: [
    ['Fixed', [
      'The game no longer freezes for a second or two when it opens or when a battle starts: the battlefield is now prepared in the background while the Deploying forces card is shown.',
    ]],
  ] },
  { v: '2026.11.20.1', date: '20 November 2026', title: 'Flat bases, cooler phones', groups: [
    ['Changed', [
      'Every starting base is on level ground, big enough for a whole base and its walls, so the computer no longer builds walls across hills. On Crossroads Village every base sits on a broad hilltop.',
      'Phones draw the battlefield at a slightly lower resolution, so they run cooler and save battery, with hardly any visible difference.',
    ]],
    ['Fixed', [
      'Match reports now record freezes, including at the start of a battle, so they can be tracked down.',
    ]],
  ] },
  { v: '2026.11.20', date: '20 November 2026', title: 'A new look: hills, light and weather', groups: [
    ['New', [
      'Hills on every map. High ground matters: units on a hilltop see further, fire from high ground reaches further and up a hill a little less, and vehicles slow down going uphill. Hills hide what is behind them.',
      'Light and shadow: a low sun, cloud shadows drifting over the battlefield, and every map with its own mood. On the maps with day and night, the sun moves across the sky through the day, and lit windows, beacons and lamp posts glow after dark.',
      'Lights from fires, explosions and lamps fall on the side of units, buildings and hills that faces them.',
      'Passing storms: the sky darkens, rain or snow gets heavier, and lightning flashes. Now and then a bolt strikes the ground and starts a fire.',
      'Fog rolls in over the low ground on some calm nights and lifts in the morning.',
      'Heavy blasts leave craters in the ground, and vehicles drive down into them.',
      'Rebuilt structures: heavier, weathered buildings with concrete, steel and team-colour stripes, worn ground round them, beacons on their roofs and searchlights on the Allied AA Gun at night.',
      'Bigger smoke columns and fires from damaged buildings, bolder explosions with flying debris, rippling water with foam on the shore, and tank tracks that fade.',
    ]],
    ['Changed', [
      'The battlefield is now drawn by your graphics chip (WebGL), which makes big battles and zooming out much smoother, especially on phones.',
      'Rocky ridges stand up as tall cliffs, and the rock always matches where units can and cannot go.',
    ]],
  ] },
  { v: '2026.11.19.2', date: '19 November 2026', title: 'Steadier tanks, smarter expansions', groups: [
    ['Fixed', [
      'Tank turrets no longer wobble on their hulls, and tanks glide instead of jolting as they drive.',
      'Computer opponents only build a second base, or rebuild with an escaping Mobile Construction Yard, on open ground their army can reach.',
      'Jets without an Airfield, and Close Air Support planes near the edge of the map, no longer circle endlessly.',
      'The Ally button\'s picker shows up again in team games with two or more allies.',
    ]],
  ] },
  { v: '2026.11.19.1', date: '19 November 2026', title: 'Escape MCVs, smoother big fights', groups: [
    ['New', [
      'In team games, a computer about to lose its base can send a Mobile Construction Yard to an ally\'s base to rebuild there. It happens once a battle, and some computer opponents do it more readily than others.',
    ]],
    ['Changed', [
      'Big battles run smoother: the game keeps a steady pace on fast screens, and trees are drawn faster after a long jump across the map.',
      'Computer APCs unload their soldiers sooner when they are badly hurt.',
      'Close Air Support covers a wider area.',
      'The Allied Barracks flag flies in the wind like the others.',
    ]],
    ['Fixed', [
      'A structure captured by an ally is no longer attacked by your units.',
      'A Mobile Construction Yard or Mobile Outpost that deploys keeps the damage it had.',
    ]],
  ] },
  { v: '2026.11.19', date: '19 November 2026', title: 'APCs and captures', groups: [
    ['New', [
      'APCs for both sides, built at the War Factory: carry 5 soldiers, with a heavy machine gun that can hit helicopters. Select infantry and tap your APC to board; if it is destroyed, about half of those aboard escape.',
      'Engineers can now capture enemy structures. Most are taken at once; a Construction Yard takes 8 seconds, and its owner hears "Construction Yard under capture". Kill the Engineer or drive him off to stop it.',
      'The computer uses APCs too, and some computer opponents send Engineers in APCs to capture your buildings.',
      'Online co-op battles (2 v AI and 3 v AI) can be saved and continued later, scorch marks and wrecks included. Use Save and leave on the pause menu; the battle is also saved every 2 minutes.',
    ]],
    ['Changed', [
      'Soldiers are drawn smaller, closer to Red Alert proportions, and those at the front of a crowd open fire straight away.',
      'Close Air Support now fires long-range guided missiles.',
      'New looks: the Soviet Spy Plane is a Beriev A-50 with its radar dome, the Allied one an SR-71 Blackbird, and Rocket Soldiers carry new launchers.',
    ]],
    ['Fixed', [
      'The fog of war no longer shows unexplored ground as revealed near the edges of the map.',
      'Wrecks, bodies and blown-off turrets on the ground now look as they did standing.',
    ]],
  ] },
  { v: '2026.11.17.19', date: '17 November 2026', title: 'No more piles', groups: [
    ['Fixed', [
      'Units no longer heap up in one big pile at home after a fight. Defenders going back, squads pulling back and waves gathering before an attack now each take their own spot, instead of all crowding onto one point and shoving each other round.',
      'In team games, computer opponents now keep scouting until they have found every enemy base, so they no longer all go after the one player they found first.',
    ]],
  ] },
  { v: '2026.11.17.18', date: '17 November 2026', title: 'Close air support, tougher turtles', groups: [
    ['New', [
      'Close Air Support: three new Tech Center upgrades (need an Airfield). The first adds an Airfield power that calls in an A-10 Warthog (Allies) or Su-25 Frogfoot (Soviets) over an area you choose: missiles at vehicles on the way in, then an anti-tank cannon run, two passes. The second and third upgrades send two and three planes. The computer uses it too.',
    ]],
    ['Changed', [
      'Defensive computer opponents no longer sit at home all game: at least every 8 minutes they come out with a big push of everything they have gathered, then dig in again.',
      'Defensive computer opponents now come to their allies\' aid from anywhere on the map, sooner and in greater strength.',
      'Computer opponents may build one more Ore Refinery than you have, so they no longer fall far behind on ore.',
    ]],
  ] },
  { v: '2026.11.17.17', date: '17 November 2026', title: 'Defences build separately', groups: [
    ['Changed', [
      'Defensive structures (Pillbox, Gun Turret, AA Gun, Tesla Coil, Flame Tower, SAM Site) now build in their own queue, like walls, so you can build a power plant and a defence at the same time. The computer does too.',
    ]],
  ] },
  { v: '2026.11.17.16', date: '17 November 2026', title: 'Random personalities', groups: [
    ['Changed', [
      'Computer opponents now pick their personality completely at random. Two computer allies can now share the same one, though it is rare.',
    ]],
  ] },
  { v: '2026.11.17.15', date: '17 November 2026', title: 'Frostlight Valley', groups: [
    ['New', [
      'A new 3 v 3 winter map, Frostlight Valley: three bases in the west against three in the east, with three roads between them. A market town sits in the middle, a village on the north and south roads and two hamlets on the roads between, all snowed in. The houses are different every battle.',
      'Street lamps light the village lanes and the main roads, so the routes glow at night. Day turns to night and it often snows.',
      'Wooded hills ringed by cliffs squeeze the middle road into a pass, and frozen lakes lie between the routes.',
    ]],
    ['Changed', [
      'Village houses on winter maps have snow on their roofs.',
    ]],
  ] },
  { v: '2026.11.17.14', date: '17 November 2026', title: 'Forward bases and fortresses', groups: [
    ['Changed', [
      'Units shooting a way through a wall now fight the defences, buildings and units in reach first, and fire back when shot at. Before, they drove past guns that were shooting them to reach the wall.',
      'Defensive computer opponents keep a bigger army: an extra 30 units stay at home to defend while the rest attack. They also build more ground defences and anti-air.',
      'Aggressive computer opponents now build a forward base near you once they have found your base, with a Barracks and a War Factory, so their units arrive sooner.',
      'Computer opponents that lose their Ore Refinery or War Factory sell other buildings to rebuild it.',
      'Tesla Coils and Tesla Tanks do more damage to vehicles: 130 a bolt to tanks (it was 90).',
      'The V2 Rocket Launcher reaches a little further, to make up for the time it takes to raise its rocket.',
    ]],
  ] },
  { v: '2026.11.17.13', date: '17 November 2026', title: 'Bigger paratrooper drops', groups: [
    ['New', [
      'Airborne division, a Tech Center upgrade for both sides: Paratroopers come in two planes, twenty soldiers a drop.',
    ]],
    ['Changed', [
      'A Paratroopers drop is now ten soldiers (it was seven). Soviet squads now bring Rocket Soldiers too.',
      'Lose your last Tech Center and you lose every upgrade: research them again once you rebuild. Units you already have stay.',
    ]],
  ] },
  { v: '2026.11.17.12', date: '17 November 2026', title: 'Sandbag cover', groups: [
    ['Changed', [
      'Infantry right behind your side\'s Sandbags take a third less damage from fire coming over them.',
      'When your base is attacked, defending infantry run to spots behind any Sandbags in reach of the attackers and fight from there. The computer\'s infantry do the same.',
      'Sandbags are drawn lower and slimmer, with darker sides and sacks in slightly different shades, so they read as light cover next to a Concrete Wall.',
    ]],
  ] },
  { v: '2026.11.17.11', date: '17 November 2026', title: 'Longer build queues', groups: [
    ['Changed', [
      'You can now queue up to 20 units at a time in each production queue (it was 9).',
    ]],
  ] },
  { v: '2026.11.17.10', date: '17 November 2026', title: 'Tougher turtles, faster yards', groups: [
    ['Changed', [
      'More Construction Yards build structures faster: 1.5x with two, 2x with three, up to 2.5x with four. This works for the computer too.',
      'Defensive computer opponents no longer sit at home for good: if a wave is overdue by four minutes, they attack with what they have. They also build more defences and anti-air, and wall in their second base as well as their main one.',
      'Computer opponents can field up to 100 units on every difficulty.',
      'The Comanche now costs 2000. SAM Sites and AA Guns reach a little further.',
    ]],
  ] },
  { v: '2026.11.17.9', date: '17 November 2026', title: 'Diagonal gates', groups: [
    ['Changed', [
      'Gates can now lie diagonally, so they line up with diagonal walls. Placed on or across a gap in your wall, a Gate turns to follow it; tap it again to turn it through all four ways.',
      'Walls now run right up to a gate\'s end posts, with no gap.',
    ]],
  ] },
  { v: '2026.11.17.8', date: '17 November 2026', title: 'Smoother zoomed-out view', groups: [
    ['Changed', [
      'Zoomed far out (with many trees on screen, as on a large PC screen), the woods are drawn as still pictures instead of tree by tree, so the game runs much smoother. The trees stop swaying at that distance and sway again when you zoom in.',
    ]],
    ['Fixed', [
      'The paratrooper transports no longer show a jet flame behind them: they have propellers.',
    ]],
  ] },
  { v: '2026.11.17.7', date: '17 November 2026', title: 'Comanche and wall fixes', groups: [
    ['Changed', [
      'Comanches no longer hover for good over a target they cannot hit: they use their missiles on what they can, or fly home to rearm. Comanches waiting on a target spread out instead of stacking on one spot.',
      'Landed helicopters that are rearming or repairing join the base defence once they have half their health and half a load.',
      'A wall laid on a slant now steps diagonally, uses half the pieces and is drawn as one straight wall. Units can no longer slip between two pieces that touch at a corner.',
      'Match reports now record where drawing time goes, to track down the remaining slowdowns in big battles.',
    ]],
    ['Fixed', [
      'Paratrooper transport lights at night now sit on its wingtips, fin and spine.',
    ]],
  ] },
  { v: '2026.11.17.6', date: '17 November 2026', title: 'Smoother big battles, steadier defenders', groups: [
    ['Changed', [
      'Big battles draw faster, most of all on large screens zoomed out: trees, units and effects that are off the screen are no longer drawn, and the map-edge haze is only drawn when the edge is in view. The picture is unchanged.',
      'Defenders keep after the raider they were sent to instead of turning back and forth every second.',
      'Units stuck behind friends squeeze past them, and new units no longer wait in narrow gaps between woods.',
    ]],
  ] },
  { v: '2026.11.17.5', date: '17 November 2026', title: 'Comanche fixes, wider breaches', groups: [
    ['Changed', [
      'The Comanche\'s chain gun reaches further (190, was 150), past the MG Team and the Rocket Soldier, and it backs away sooner from anything that closes in.',
      'The Comanche\'s missiles now lock on to Ore Trucks as well as tanks.',
      'On Auto Attack the Comanche attacks every unit it meets on the way, and flies home to rearm once its gun is empty instead of hovering over the enemy base.',
      'Units on Auto Attack (and the computer\'s waves) no longer all squeeze through one gap in a wall: a big group sends its tanks and heavier units to knock down the wall beside the gap while the rest go through.',
    ]],
    ['Fixed', [
      'A stray black bar under parked Comanches and other aircraft (the ammunition gauge).',
      'Bomber lights at night now sit on its wingtips, fin and spine instead of floating beside it.',
    ]],
  ] },
  { v: '2026.11.17.4', date: '17 November 2026', title: 'The map edge: woods fading into haze', groups: [
    ['New', [
      'The edge of the map no longer shows endless flat green. A band of woods (snowy pines on winter maps) runs round the map and fades into a soft haze with slow drifting mist. Where the edge is water, the water fades out instead.',
      'The camera keeps a little further inside the map, so less of the haze shows.',
    ]],
  ] },
  { v: '2026.11.17.3', date: '17 November 2026', title: 'Yard crane, aircraft lights at night', groups: [
    ['New', [
      'The Construction Yard\'s crane swings round to each structure you place, works its hook while it goes up, then swings back.',
      'Aircraft lights at night (Crossroads Village): planes show red and green wingtip lights, a white tail strobe and a red beacon; helicopters a red beacon and a white tail light.',
    ]],
    ['Fixed', [
      'A double tap or double click on your own wall no longer sells it: tap once, then tap again a moment later.',
      'The glow behind a jet\'s engine no longer shows in front of the jet.',
    ]],
  ] },
  { v: '2026.11.17.2', date: '17 November 2026', title: 'Tech Center upgrades: Comanche and Tesla Tank', groups: [
    ['New', [
      'Tech Center upgrades: select a finished Tech Center and tap UPGRADES. One upgrade researches at a time and is paid for as it goes. A finished upgrade stays for the rest of the battle even if you lose the Tech Center; research still running when your last Tech Center falls is refunded.',
      'Allies: the Comanche ($1,500 upgrade, then $1,500 at the Helicopter Base, which needs a free pad). A stealthy helicopter that hangs back at the edge of its reach. Its chain gun cuts down infantry and light vehicles; its four anti-tank missiles lock on to tanks from long range and drop from bays in its sides. Once the missiles are spent the gun takes on tanks too, for little damage. Rocket Soldiers are its counter.',
      'Soviets: the Tesla Tank ($1,500 upgrade, then $1,350 at the War Factory). A tank with a Tesla dome whose bolt kills infantry outright and hurts vehicles badly at short range. It needs no power and cannot hit aircraft.',
      'The computer researches upgrades on Normal and Hard and fields Comanches and Tesla Tanks.',
    ]],
    ['Changed', [
      'Computer allies now spread out: each picks a different player to attack at first. After a few waves they choose one enemy to gang up on together, more often the strongest, and leave a side alone for a while after it loses a Construction Yard.',
      'Low power: Gun Turrets, AA Guns and SAM Sites stop firing. Pillboxes and Flame Towers keep firing.',
    ]],
    ['Fixed', [
      'Some fire effects could fail to draw near the map edge.',
    ]],
  ] },
  { v: '2026.11.17.1', date: '17 November 2026', title: 'Sidebar build progress fixed', groups: [
    ['Fixed', [
      'The build progress on the sidebar pictures no longer slides off their left edge.',
    ]],
  ] },
  { v: '2026.11.17', date: '17 November 2026', title: 'Computer personalities, new build-up, War Factory doors', groups: [
    ['New', [
      'Computer personalities (Normal and Hard): each computer side plays a style for the whole battle: rusher, turtle, raider or balanced. Computer allies never share a style, so they no longer all attack at the same moment.',
      'Turtle and balanced computers wall their main base in concrete with a gate on each side. Units hunting an enemy now also shoot through walls when the way round is much longer.',
      'Computer second bases: from about minute 10 a computer sends a Mobile Construction Yard to a rich ore field on its half and builds a small base there.',
      'Structures rise in layers inside a scaffold with sparks while they build (2.5 seconds). The Soviet radar dish turns.',
      'War Factory: the front door rolls up before a vehicle rolls out, then rolls down again (a vehicle now appears half a second after it is built). Thanks to JGFortanelli.',
      'A battle clock sits in the middle of the top strip.',
    ]],
    ['Changed', [
      'Trees, flags and banners sway more slowly in the wind.',
      'The Options tab has a bigger touch area on phones.',
      'Night on Crossroads Village is lighter on phones, so it runs smoother.',
    ]],
  ] },
  { v: '2026.11.16.5', date: '16 November 2026', title: 'V2 raises its rocket, fewer traffic jams', groups: [
    ['New', [
      'V2 Rocket Launcher: the rocket now lies flat on the truck. When ordered to attack, it raises on its rail (about 1.5 seconds) before it fires, stays up while it reloads, and lowers again a few seconds after the fight (or before the truck drives off).',
    ]],
    ['Changed', [
      'Units marching in a crowd no longer pile up at the corners of their route: they take the corner from a little further away, so columns keep flowing.',
      'Units sent to defend an ally, or leaving the base on Auto Attack, keep their route instead of stopping to wait for a new one.',
    ]],
    ['Fixed', [
      'V2 rockets in flight pointed sideways or upside down in the new camera view. They now point along their flight.',
    ]],
  ] },
  { v: '2026.11.16.4', date: '16 November 2026', title: 'A new camera angle', groups: [
    ['New', [
      'The battlefield is now seen at an angle, turned 45 degrees: the map is laid out in diamonds and you look down on units and buildings from the side, so walls, roofs and tanks stand out in 3D. Every unit and building has been redrawn from the new angle.',
      'Walls and gates are now solid: concrete walls with your colour along the top, two layers of sandbags, barbed wire on posts, and gates with lamps and a barrier that sinks into the ground to open.',
      'Past the edge of the map the land carries on and fades into haze instead of black.',
    ]],
    ['Changed', [
      'Smoke, fire, debris, shots, tracers and muzzle flashes rise and fly straight up the screen, at the height of the gun and the target.',
      'Units next to a building are drawn in front of it or behind it depending on which side they stand. Trees are drawn in order with units, so a tank in front of a wood is in front of it.',
      'Older saved games still continue, with the camera on the same spot.',
    ]],
  ] },
  { v: '2026.11.16.3', date: '16 November 2026', title: 'Fights in the village, smoother zoom', groups: [
    ['Changed', [
      'Crossroads Village: the north and south lakes now run down to the village, so armies can no longer slip along the grass beside it. The computer\'s attacks now meet at the village gates and in its streets, and the houses see real fighting.',
      'Zooming right out on a big screen is much smoother on maps with a lot of woods: far-away trees are drawn from cached blocks instead of one by one, and rain splashes are capped with the view.',
    ]],
  ] },
  { v: '2026.11.16.2', date: '16 November 2026', title: 'MG Team', groups: [
    ['New', [
      'MG Team: a two-man heavy machine gun team for both sides, trained at the Barracks for $400. The Allies carry an M2 .50 cal on a tripod, the Soviets a DShK 12.7 mm on a wheeled carriage behind a shield. It cannot fire on the move: it takes 1.5 seconds to set the gun up and a second to pack it, and it digs in whenever it stands still. Set up it outranges rifles, cuts down infantry in long bursts, hits light vehicles and helicopters, and takes half damage. Weak against tanks. Each gun has its own deep sound, and the barrel smokes.',
    ]],
    ['Changed', [
      'Soldiers in a house now fire from the windows facing the enemy, and fire full bursts.',
    ]],
    ['Fixed', [
      'Held houses fell far too fast: one grenade or shell hurt the house once for every soldier inside, and every rifle round hurt the whole garrison. A house now takes each blast once and its walls stop bullet splash. Grenadiers, artillery and ATTACK GROUND are the way to clear a held house.',
    ]],
  ] },
  { v: '2026.11.16.1', date: '16 November 2026', title: 'Crossroads Village', groups: [
    ['New', [
      'New 2 v 2 map, Crossroads Village: farmland with a village where the roads meet, west against east. The village is different every battle, with houses, a church and a fountain in the square.',
      'Houses block the way like buildings. Shells, rockets and blasts beside them wear them down, ATTACK GROUND brings one down on purpose, and a fallen house leaves rubble anyone can cross.',
      'Garrisons: select infantry and tap a house to send them in (3 to 6 soldiers, 10 in the church). They fire from the windows a little further than usual and the house takes the hits. Sandbags, barbed wire and the side\'s flag mark a held house. Tap a house you hold to select its soldiers; EXIT or any other order brings them out. The computer holds houses too on Normal and Hard.',
      'The village is alive: villagers walk the streets and run indoors when fighting comes near, pigeons and hens scatter, washing hangs out, lamps glow, chimneys smoke, the church bell rings.',
      'Day and night on Crossroads Village: dusk, a dark night lit by lamps, windows and fires, then dawn. Some battles there are fought in the rain, with lightning.',
      'You can place a Gate straight onto your own wall: it replaces those pieces and gives back half their price.',
    ]],
    ['Changed', [
      'Flags and the Soviet banners now flutter and sway in the wind.',
    ]],
  ] },
  { v: '2026.11.16', date: '16 November 2026', title: 'Wider gates, slower ally help', groups: [
    ['Changed', [
      'The Gate (by JGFortanelli) is now three cells wide and bought as one for $500 with 600 health. Tap where its middle goes; it turns to fit a gap in your wall, and tapping the same spot again turns it. Its barrier sinks into the ground when your own side is beside it. Taking it down gives back $250. Gates already standing in a saved game stay as they were.',
      'Sandbags are redrawn as two staggered courses of single sacks.',
      'In team games the computer\'s ally no longer rushes to help the instant you hit one base: it answers only after the base has been under attack for 10 seconds, and only with units within 35 cells of the raiders (was 70). Single player and online.',
    ]],
  ] },
  { v: '2026.11.15.7', date: '15 November 2026', title: 'Walls and gates, storms, smarter squads', groups: [
    ['New', [
      'Walls and gates (by JGFortanelli): Sandbags (Allies) and Barbed Wire (Soviets) from a Barracks, Concrete Wall and Gate from a War Factory. Tap a piece at the end of the structures strip, tap where the line starts and ends, then BUILD. Sandbags and Concrete stop everything on the ground, wire stops only infantry (vehicles flatten it), and a gate lets your own side through. Nothing shoots a wall unless you order it (tap it with units selected, or ATTACK GROUND); units on Auto Attack shoot a way through a wall that shuts them out. Tap your own piece twice with nothing selected to take it down for half its price. The computer lays short lines of walls in front of its defences.',
      'Storms: rain on Lakeside now comes with lightning and thunder, and some bolts land on a random spot anywhere on the map. A bolt sets trees alight and burns for a few seconds, and a building or bridge it hits loses a tenth of its health. Single player and online.',
      'Trees sway in the wind, harder in rain and snow, and burn when caught in explosions or struck by lightning. Fire can spread a little from tree to tree and leaves burnt trunks and a scorch mark.',
    ]],
    ['Changed', [
      'The computer\'s attack squads now keep together on the march: the slowest unit leads, and faster units that get far ahead wait for it, until the fighting starts.',
      'A computer unit that gets stuck now picks its target and route again, then goes home to rejoin the next wave.',
    ]],
    ['Fixed', [
      'In big fights the computer\'s units no longer stand waiting for a route: they keep walking the route they have while their target barely moves.',
    ]],
  ] },
  { v: '2026.11.15.6', date: '15 November 2026', title: 'Stuck trucks and a clean defeat', groups: [
    ['Changed', [
      'When a side is defeated, all of its remaining units and buildings now blow up, one after another over a few seconds.',
    ]],
    ['Fixed', [
      'Ore Trucks no longer jam in a queue at a refinery for minutes when the truck at the front cannot reach the dock.',
      'Units ordered onto water or rock now stop at the nearest open ground instead of pushing at the shore for ever (the computer\'s Mobile Outposts could get stuck this way).',
    ]],
  ] },
  { v: '2026.11.15.5', date: '15 November 2026', title: 'Attack Ground fix', groups: [
    ['Fixed', [
      'Attack Ground on open ground no longer breaks the game: units now walk up and shell the spot you tap.',
    ]],
  ] },
  { v: '2026.11.15.4', date: '15 November 2026', title: 'Infantry balance', groups: [
    ['Balance', [
      'Rifle Infantry (both sides) now shoot 5 cells, up from 3, and their bullets splash a little on enemy soldiers standing next to the target.',
      'Grenadier blasts are smaller (about two thirds of the old radius), so a grenade hits fewer soldiers at once.',
      'Artillery has 190 health, up from 120.',
    ]],
  ] },
  { v: '2026.11.15.3', date: '15 November 2026', title: 'Tech Center', groups: [
    ['New', [
      'Tech Center for both sides (1500 credits, needs a Radar Dome, uses 100 power). It unlocks the top-tier units: the Mammoth Tank for the Soviets, Artillery and the Attack Helicopter for the Allies. Lose it and you cannot build them until you rebuild it.',
      'Each side has its own look: a glass research campus with a glass dome for the Allies, and a grand domed institute with a monument out front for the Soviets.',
      'The computer builds one too, after its Service Depot.',
    ]],
    ['Changed', [
      'A new Allied Helicopter Base gives its free helicopter only once a Tech Center stands.',
    ]],
  ] },
  { v: '2026.11.15.2', date: '15 November 2026', title: 'Artillery fix', groups: [
    ['Balance', [
      'Artillery hits infantry and structures as hard as before again. Only its damage to tanks stays at OpenRA\'s low figure.',
    ]],
  ] },
  { v: '2026.11.15.1', date: '15 November 2026', title: 'Promotions announced, tank balance', groups: [
    ['New', [
      'The announcer now says "Unit promoted" when one of your units ranks up, and "Unit promoted to elite" at the top rank.',
    ]],
    ['Balance', [
      'Heavy Tank 950 to 1150 credits, Mammoth Tank 1700 to 2000 (OpenRA\'s prices).',
      'Rifles, Grenadiers and artillery now use OpenRA\'s damage tables: rifles barely scratch tanks and structures, grenades are strong against structures but weak against vehicles, and artillery does much less to tanks.',
      'Computer on Normal and Hard (since 2026.11.15): fewer base defences, and it waits until its army is half its cap, then attacks with every waiting unit.',
    ]],
  ] },
  { v: '2026.11.15', date: '15 November 2026', title: 'Veterancy, destroyable bridges and Engineers', groups: [
    ['New', [
      'Unit veterancy, as in OpenRA\'s Red Alert: a unit is promoted when it has destroyed 2, 4, 8 and 16 times its own cost. Each rank hits harder, takes less damage, reloads faster and moves faster on the ground; the fourth rank, Elite, also repairs itself out of the fight. Gold chevrons show a unit\'s rank, and the selection bar names it.',
      'Attack ground: tap ATTACK GROUND, then a spot, and the selected units fire there until given another order.',
      'Bridges can be destroyed on Twin Lakes (by an ordered ATTACK GROUND on a span). Units on a falling span are lost and routes go round.',
      'Engineer (Barracks, 500 credits): rebuilds a destroyed bridge span or fully repairs a damaged structure of your side, and is used up doing it. The computer trains Engineers to rebuild spans.',
    ]],
    ['Changed', [
      'The Allied Ore Refinery has a new look: banded stacks, a process tank on a gantry and a front hall. Design by JGFortanelli.',
    ]],
  ] },
  { v: '2026.11.14.12', date: '14 November 2026', title: 'Debrief kills fix', groups: [
    ['Fixes', [
      'The debrief\'s kills list counted kills made by the enemy\'s fallen units too, so it could show units your faction cannot build. It now lists only your own units, and is titled "Kills made by your units".',
    ]],
  ] },
  { v: '2026.11.14.11', date: '14 November 2026', title: 'Normal computer army cap', groups: [
    ['Changed', [
      'On Normal, the computer\'s army cap is now 90 units (it was 100, then briefly 80). Its armies fill a little faster than the 80 cap and attack waves are slightly bigger.',
    ]],
  ] },
  { v: '2026.11.14.10', date: '14 November 2026', title: 'Twin Lakes bridge fix', groups: [
    ['Fixes', [
      'Twin Lakes: the lower span of the south-east bridge was drawn sideways. It now runs the same way as the other three. Fix by JGFortanelli.',
    ]],
  ] },
  { v: '2026.11.14.9', date: '14 November 2026', title: 'Defend ally: you pick the ally', groups: [
    ['Changed', [
      'With more than one ally (3 v 3 and larger maps), the ALLY button now lets you pick which ally to defend. Your units go to that ally, and picking another sends them over.',
      'Units sent to help an ally now also go after enemies attacking that ally\'s units just outside its base, not only raiders at the base itself.',
    ]],
  ] },
  { v: '2026.11.14.8', date: '14 November 2026', title: 'Faster aircraft, no more truck jams', groups: [
    ['Changed', [
      'Spy Planes, Bombers, Strike Jets and MiGs fly 25% faster.',
      'On Normal, the computer now fields at most 80 units (was 100), so its attack waves come a little sooner and its armies are smaller.',
    ]],
    ['Fixes', [
      'Ore Trucks no longer jam at the Refinery. They take turns at the dock and wait in a ring around it, so trucks (yours and the computer\'s) keep unloading instead of circling.',
    ]],
  ] },
  { v: '2026.11.14.7', date: '14 November 2026', title: 'A new map: Twin Lakes', groups: [
    ['New', [
      'Twin Lakes, a new map for 1 v 1, 2 v 2 and 2 v computer. Two long lakes cut the island from corner to corner: the north-east fights the south-west over a neck of ore-rich land in the middle and a long concrete bridge at either end. Map design by JGFortanelli.',
    ]],
  ] },
  { v: '2026.11.14.6', date: '14 November 2026', title: 'Fairer ore', groups: [
    ['Changed', [
      'The computer no longer out-mines you. In games with a computer opponent or ally, its Ore Refineries stop at about the number the human players have (never fewer than 2, plus one extra at an Outpost), so more of the ore is left for you.',
    ]],
  ] },
  { v: '2026.11.14.5', date: '14 November 2026', title: 'Lakeside is bigger', groups: [
    ['Changed', [
      'Lakeside is now twice as wide, 192 x 192 cells, with about four times the ore. Every base has far more ore to work and the fields last the whole battle, so sides no longer run dry. Same layout, bridges and gems, but everything is further apart, so the first fights come later.',
      'A Lakeside game you had saved on the old, smaller map cannot be continued.',
    ]],
  ] },
  { v: '2026.11.14.4', date: '14 November 2026', title: 'Rally points', groups: [
    ['New', [
      'Rally points: select a Barracks or War Factory, tap RALLY, then tap the map. New units from it go to that spot. NO RALLY clears it.',
      'Primary building: with two or more Barracks (or War Factories), double-tap one or tap PRIMARY to choose which one trains. It shows a PRIMARY tag.',
    ]],
    ['Fixes', [
      'Units made at an Outpost now wait at that Outpost instead of walking back to your main base.',
    ]],
  ] },
  { v: '2026.11.14.3', date: '14 November 2026', title: 'A new map: Lakeside', groups: [
    ['New', [
      'Lakeside, a small 3 v 3 map: three bases in the north against three in the south, round a group of lakes in the middle. Four concrete bridges cross the lakes. Every base has ore of its own with gems behind it, and the richest fields lie by the middle bridges. Map design by C. Gibke.',
    ]],
  ] },
  { v: '2026.11.14.2', date: '14 November 2026', title: 'More Airfields, faster jets', groups: [
    ['Changes', [
      'Extra Airfields and Helicopter Bases now speed up building, like Barracks and War Factories: 1.5x with two, 2x with three, up to 2.5x with four. This works for the computer too.',
      'The Field Manual now explains this speed-up for all four buildings. (It wrongly said more Barracks did not train faster.)',
    ]],
  ] },
  { v: '2026.11.14.1', date: '14 November 2026', title: 'The Flame Tower burns', groups: [
    ['Changes', [
      'The Flame Tower\'s jet of fire now burns whatever stands in it, not just the target, so enemies caught in the stream take steady damage between its shots. Deadly to infantry, weak against tanks.',
    ]],
  ] },
  { v: '2026.11.14', date: '14 November 2026', title: 'A new Flame Tower', groups: [
    ['Changes', [
      'The Soviet Flame Tower has a new look: a six-sided brick and stone tower with a flamethrower head that turns to follow its target. Its fire is now a steady jet that stays on as it sweeps from one enemy to the next. It plays exactly as before.',
      'The Spy Plane and the Bomber fly a quarter faster. The Bomber\'s carpet of bombs is a little longer, so a Bombing Run does more damage.',
    ]],
  ] },
  { v: '2026.11.13.6', date: '13 November 2026', title: 'Long battles keep their stats', groups: [
    ['Fixes', [
      'Very long battles (about an hour) could lose all their numbers on the stats page and leaderboard because the report was too big. The report is now trimmed to fit, keeping the most important figures.',
    ]],
  ] },
  { v: '2026.11.13.5', date: '13 November 2026', title: 'A new look for the Light Tank', groups: [
    ['Changes', [
      'The Allied Light Tank has a new look: road wheels under drooping fenders, a sloped nose and a round dome turret with a single gun. It plays exactly as before.',
    ]],
  ] },
  { v: '2026.11.13.4', date: '13 November 2026', title: 'A slower, steadier battle', groups: [
    ['Changes', [
      'Everything takes twice as long to build, so bases and armies come together at a steadier pace, closer to the classic games.',
      'Unit speeds have been retuned: infantry move a little faster, tanks a little slower (the Mammoth is the slowest of all), and aircraft fly about half as fast as before, so you have more time to react to air raids.',
      'The computer gives you more time to build up: its first attack comes about 12 minutes in on Easy and Normal (9 on Hard), with longer lulls between attacks and air strikes.',
    ]],
  ] },
  { v: '2026.11.13.3', date: '13 November 2026', title: 'Jets get guns, fewer air raids', groups: [
    ['Changes', [
      'Strike Jets and MiGs no longer carry bombs. Instead they make cannon gun runs (three a sortie): a burst of shells along their flight path that shreds infantry and hurts light vehicles, but barely scratches tanks and buildings.',
      'Jets now fire their air-to-air missiles at ground targets too, once their ground-attack missiles are spent. They still save them for enemy aircraft on the way home.',
      'The computer sends its aircraft out much less often: no air attacks before its first ground attack, then at least 3 minutes between jet strikes and between helicopter strikes. Its jets still scramble when you raid its base.',
    ]],
  ] },
  { v: '2026.11.13.2', date: '13 November 2026', title: 'Ready-made ground, no more pop-in', groups: [
    ['Improvements', [
      'Snowbound and Three Crossings now come with their ground ready-made, so the game no longer paints it while you play: the map appears sooner and stays sharp as you scroll. Their ground looks the same in every game now.',
    ]],
  ] },
  { v: '2026.11.13.1', date: '13 November 2026', title: 'Units spread out in a fight', groups: [
    ['Changes', [
      'Units no longer ball up when they attack or defend. Each one closes in from its own spot round the target, so a group fans out into an arc across the front instead of piling onto one point. Infantry may take a moment to step into place before they open fire.',
      'Units keep a little more room between them, and a group spreads its fire: they stop piling every gun onto an enemy that is already as good as dead and shoot the next one.',
      'Splash weapons (V2 rockets, artillery, grenades, Tesla Coils) catch fewer units at once, on both sides.',
      'On computers the ground no longer pops in as you scroll around: the whole map is kept once it has been painted, and new ground fades in on every device.',
    ]],
  ] },
  { v: '2026.11.13', date: '13 November 2026', title: 'Computer teammates in co-op, and jets defend again', groups: [
    ['New', [
      'Online co-op (2 v AI and 3 v AI): short a friend? The room leader can tap Add computer on an open place on your team to fill it with a computer teammate, and Open for a friend to give it back. A co-op with a computer teammate does not count for the co-op leaderboard.',
    ]],
    ['Fixes', [
      'Jets defend the base again. After scrambling against enemy aircraft, jets were treated as if you had sent them somewhere yourself, and stopped answering raids on the base.',
      'Jets no longer circle raiders close to their Airfield without firing: they fly out, come round and make a proper attack run.',
    ]],
  ] },
  { v: '2026.11.12.8', date: '12 November 2026', title: 'Give credits to an ally', groups: [
    ['New', [
      'Team battles (2 v 2, co-op and 3 v 3, skirmish and online) have a GIVE button next to ALLY: send 500, 1000 or 2500 credits to an ally still in the battle, or type another amount. More than you have sends everything you have. Both of you hear it. Thanks to JGFortanelli for building it.',
    ]],
  ] },
  { v: '2026.11.12.7', date: '12 November 2026', title: 'Ready-made unit pictures, and a short deploy screen', groups: [
    ['Changes', [
      'Units, buildings and wrecks now come as ready-made pictures loaded with the game, instead of being drawn from their 3D models in the middle of a battle. Big battles should hitch much less, on phones most of all. (About 1.5 MB more to download once, and more for team colours in team battles.)',
      'A battle now starts behind a short "Deploying forces" screen (a few seconds at most) while its pictures and the ground around you get ready, so the first seconds no longer stutter. A skirmish waits for it; an online battle carries on.',
    ]],
  ] },
  { v: '2026.11.12.6', date: '12 November 2026', title: 'Smoother ground when you jump around the map', groups: [
    ['Changes', [
      'Ground that is still loading now shows as a slightly blurred picture of the real ground instead of flat coloured blocks, so jumping or zooming around the map looks much smoother.',
      'Fewer hitches on iPhones while new ground comes into view in big battles: wrecks are drawn much more cheaply, and the game reuses memory instead of asking for more.',
      'Match reports record more detail about any remaining hitches, so they can be tracked down.',
    ]],
  ] },
  { v: '2026.11.12.5', date: '12 November 2026', title: 'Fewer pauses in big battles', groups: [
    ['Changes', [
      'Big battles (3 v 3 most of all) no longer pause for a moment while the computer plans a flanking attack, and computer sides take turns doing their thinking instead of all at once.',
      'Units are drawn ahead of time in the background, so a big fight coming into view no longer makes the game hitch.',
      'Units work out their routes faster, so the game runs more smoothly overall, and online and co-op battles on the game server run more smoothly too.',
    ]],
  ] },
  { v: '2026.11.12.4', date: '12 November 2026', title: 'Smoother big battles, and a calmer opening', groups: [
    ['Changes', [
      'The computer waits 2 minutes longer before its first attack: 8 minutes on Easy and Normal, 6 on Hard.',
      'Smoother scrolling in big battles, on phones most of all: units and the sidebar no longer freeze the game for a moment when they first come into view.',
      'A building you finished stays ready to place if you lose a building it needs (an Ore Refinery after its Power Plant, say). One still being built waits, marked ON HOLD, until you rebuild it, and units queued at a lost factory wait the same way; hold to cancel. Before, it vanished and blocked all building.',
      'Match reports now record what the game was doing during any stutter, so slowdowns can be tracked down.',
    ]],
  ] },
  { v: '2026.11.12.3', date: '12 November 2026', title: 'Return calls your aircraft home', groups: [
    ['Changes', [
      'Team battles: RETURN now also calls home every jet and helicopter out attacking. They land and wait on their pad (Auto Attack goes off, as before). Aircraft defending your base keep fighting.',
    ]],
  ] },
  { v: '2026.11.12.2', date: '12 November 2026', title: 'Smoother scrolling, and helicopters that pick their targets', groups: [
    ['Changes', [
      'Jumping around the map (a tap on the radar, or scrolling fast) no longer makes the game stutter while the ground comes into view: the ground is now painted in the background, and big battlefields full of craters and wrecks fill in smoothly.',
      'Helicopters go for the targets their weapon is made for: Hind Gunships for infantry, Allied Attack Helicopters for tanks and vehicles. They only hit other targets, buildings included, when none of those is in reach, and switch as soon as one turns up.',
      'Jets on Auto Attack fly one strike, then wait on their pad until you switch Auto Attack on again (or pick a new enemy side). Jets built meanwhile wait too. The computer\'s jets are unchanged.',
      'The game now notes how smoothly each battle runs on your device (frames per second, stutters), so slowdowns you report can be tracked down.',
    ]],
  ] },
  { v: '2026.11.12.1', date: '12 November 2026', title: 'Smarter enemy attacks, and orders that stick', groups: [
    ['New', [
      'Normal and Hard: the computer attacks at random times instead of on a steady rhythm, and attacks at once when its army at home grows big. Hard attacks more often than Normal.',
      'Normal and Hard: attack waves flank. A wave gathers just out of range of your guns on a side it has not used lately, then charges in; big waves split into two or three groups that hit from different sides at once.',
      'Normal and Hard: a big attack that is clearly losing pulls back instead of dying to the last unit, and the computer brings attackers home only when its own base needs them.',
      'Team battles: Auto Attack asks which enemy side to go after (any side whose base you have found, or simply the nearest), and its colour shows on the button. Computer teams pick a target too and gang up on it.',
      'Units you give an order (move, guard, attack) stay out of Auto Attack and base defence until you press Stop. Units you sent to attack rejoin by themselves after 3 minutes standing idle once their target is gone.',
      'Aircraft on Auto Attack steer round anti-air you have found (SAM Sites, AA Guns, and anti-air soldiers and vehicles on ground you have uncovered) and go for a building it does not cover. Anti-air you have not found can still catch them.',
    ]],
    ['Changes', [
      'Team battles (2 v 2, 3 v 3, co-op): ore grows back faster, more so the more sides there are, and a stripped field recovers in a couple of minutes, so the economy no longer dries up for everyone mid-game.',
      'Snowbound: a new ore field near the north-west start position, which had none of its own.',
      'The computer no longer sends small raids at Ore Trucks and outlying sites. When the ore near its refineries runs out, it buys a Mobile Outpost before more tanks.',
      'In team battles, a computer that has not found its chosen enemy yet attacks another enemy it has found instead of waiting.',
    ]],
  ] },
  { v: '2026.11.12', date: '12 November 2026', title: 'Rain and snow, concrete bridges, faster battle starts', groups: [
    ['New', [
      'Weather: some battles on Three Crossings are fought in the rain, and on Snowbound it sometimes snows. It comes and goes during the battle, from a drizzle to a downpour. It only changes the look: sight, movement and combat are the same, in single player and online.',
      'Snowbound\'s three bridges are now concrete, with parapets and snow banked along the sides.',
    ]],
    ['Changes', [
      'The ground is now painted a piece at a time as you look at it, instead of all at once. Battles start much faster (on Snowbound most of all) and the game uses far less memory, so phones should cope better with the big maps.',
      'Every battle scar stays: scorch marks, craters, wrecks, blown-off turrets and fallen soldiers are kept and redrawn exactly, also after Save and Continue. Games saved before this update continue with their scars too.',
      'Trees, bushes and rocks sit in slightly different spots on every map.',
    ]],
  ] },
  { v: '2026.11.11.2', date: '11 November 2026', title: 'Snowbound: the first 3 v 3 map', groups: [
    ['New', [
      'New map: Snowbound, a big winter map (168 × 168 cells) made for 3 v 3. The north fights the south across the snow: a long lake with three bridges and a line of creeks lie between them.',
      '3 v 3 is now playable on Snowbound: in skirmish (you and two computer allies against three computers) and online, plus three friends against the computer online.',
    ]],
    ['Fixes', [
      'Three Crossings: from the top-left start you could not place buildings near your base, because the placement bar at the top of the screen covered the ground. While placing, you can now scroll the view past the top edge of the map.',
    ]],
  ] },
  { v: '2026.11.11.1', date: '11 November 2026', title: 'Groundwork for 3 v 3', groups: [
    ['New', [
      'Groundwork for bigger team battles: 3 v 3 (skirmish and online) and three friends against the computer online. They will be playable once a map made for them arrives.',
      'A third teammate of the same faction gets its own colours: teal for the Allies, purple for the Soviets.',
    ]],
  ] },
  { v: '2026.11.11', date: '11 November 2026', title: 'Infantry that fight like Red Alert, and new gunfire', groups: [
    ['New', [
      'Infantry under fire drop prone, shoot from the ground and crawl, then get back up a few seconds after the shooting stops.',
      'Soldiers walk with a four-pose stride, bring the rifle to the shoulder to shoot, and kick back with each shot.',
      'New gunfire: Allied riflemen fire an M16, Soviet riflemen an AK-style rifle, and the Pillbox has a deep, fast MG42-style rip. The Ranger and Hind have a punchier machine gun.',
      'New look for the Soviet Power Plant and Advanced Power Plant, with cooling tower steam, refinery chimney smoke and Allied refinery vapour.',
    ]],
    ['Changes', [
      'Balance, single player and online: prone infantry take half damage whether still or moving (before, 35% less and only while still), crawl at 60% of walking speed, and the random crouch is gone. Infantry are tougher in a firefight.',
    ]],
  ] },
  { v: '2026.11.10', date: '10 November 2026', title: 'Quieter music', groups: [
    ['Changes', [
      'The soundtrack is about 4 dB quieter, so effects and voices stand out more. The music volume slider still works as before.',
    ]],
  ] },
  { v: '2026.11.09', date: '9 November 2026', title: 'New looks for the AA Gun, Ranger, tanks and Tesla Coil, and real grass', groups: [
    ['New', [
      'New look for the Allied AA Gun: a twin-barrel gun on a swivel inside a ring of sandbags, with ammo crates beside it.',
      'The Ranger is now a Humvee: a wide, boxy 4x4 with big tyres, a spare wheel and a machine gun on the roof hatch.',
      'New look for the Allied Light Tank: a low, skirted hull with a sloped nose and a wide domed turret with a long thin gun.',
      'New look for the Soviet Heavy Tank: a long, low red hull with dark treads, a big faceted turret with two black oval hatches, twin thick guns and a white aerial with a red tip.',
      'New look for the Soviet Tesla Coil: a cone of white rings on a pole, topped with a blue-silver ball, standing on an industrial base with red capacitor drums and warning lamps.',
      'The grass is now drawn blade by blade, so open ground reads as grass instead of smooth green patches.',
    ]],
    ['Changes', [
      'These are all new art only: costs, health, speed, damage and range are unchanged, in single player and online. Gun muzzles on the Heavy Tank sit a little closer to the turret.',
    ]],
  ] },
  { v: '2026.11.08', date: '8 November 2026', title: 'New Ore Truck and Rifle Infantry', groups: [
    ['New', [
      'New look for the Ore Truck: an armoured four-wheeler with a hood, a boxy cab and a domed ore bin that shows the ore it carries.',
      'New look for Rifle Infantry: a long coat, high collar, shoulder plates, knee pads, a hip satchel and a rifle with a wooden handguard. Art by a friend of the game; other infantry are unchanged.',
    ]],
  ] },
  { v: '2026.11.07.1', date: '7 November 2026', title: 'Red Horizon for Windows', groups: [
    ['New', [
      'Red Horizon is now a Windows app. Download the installer from the GitHub Releases page; it updates itself when a new version comes out. Phones keep playing in the browser or from the Home Screen as before.',
      'On PC, F11 switches full screen and Ctrl + / Ctrl - / Ctrl 0 change the size of the interface (handy on a 4K monitor).',
    ]],
  ] },
  { v: '2026.11.07', date: '7 November 2026', title: 'New support planes, smarter aircraft', groups: [
    ['New', [
      'New support planes: Allied Paratroopers arrive in a C-130 Hercules and Soviet ones in an Il-76. The Allied bombing run is a B-1 Lancer and the Soviet one a Tu-22M Backfire.',
    ]],
    ['Changes', [
      'Team battles: the Return button now also brings back units that are out attacking, not only those sent to an ally, and turns Auto attack off so they stay home.',
      'Defending jets make one pass, then fly home, rearm and repair fully before going out again. Damaged defenders no longer go back out half repaired.',
    ]],
    ['Fixes', [
      'Helicopters and jets no longer hover or circle where a base defence ended: they fly home to their pads.',
      'The computer (enemy or ally) no longer builds a Refinery whose exit is walled in by trees, rocks or buildings, which left its Ore Trucks stuck.',
    ]],
  ] },
  { v: '2026.11.06', date: '6 November 2026', title: 'A tougher Normal', groups: [
    ['Changes', [
      'Normal is tougher: the computer can now field up to 100 units (was 80) worth up to 45,000 credits (was 28,000), so its army keeps growing through the middle of the game. Single player and online co-op. Easy and Hard are unchanged.',
    ]],
  ] },
  { v: '2026.11.05.5', date: '5 November 2026', title: 'New looks for Soviet bases, aircraft and power plants', groups: [
    ['New', [
      'Soviet buildings have a Cold War look: concrete panel blocks, flat roofs with big red stars, banners and striped smokestacks.',
      'The Soviet Power Plants are now nuclear stations, with reactor blocks and a tall vent stack in a steel frame. The Allied Power Plants are coal-fired, with brick boiler houses, coal heaps and chimneys that pour out dark smoke.',
      'New aircraft: the MiG is now a MiG-23, the Allied attack helicopter is a Longbow Apache with its radar dome, and the Hind is a Hind-D.',
      'The Airfield is bigger (4 x 3), with four marked parking stands for its jets.',
      'Tank turrets and the Gun Turret kick back when they fire. Heavy Tanks fire their two barrels one after the other.',
    ]],
    ['Fixes', [
      'Online and team battles: tank shells fly smoothly and every muzzle flash shows (before, shells jumped along and some flashes were missed).',
      'Mammoth Tank rockets and helicopter missiles no longer leave a white box where they hit, and they do their blast damage around the target again.',
      'In team battles, a teammate in the second colour now sees their whole sidebar in their own colour.',
    ]],
  ] },
  { v: '2026.11.05.4', date: '5 November 2026', title: 'Co-op leaderboard', groups: [
    ['New', [
      'Co-op leaderboard: win an online co-op battle and enter your name in the debrief. The new Co-op tab on the leaderboard shows the five best teams at each difficulty, with both teammates\' names.',
      'A co-op team scores together: both players\' kills, buildings destroyed and ore add up, plus the speed bonus, times the difficulty. If only one of you enters a name, your teammate\'s name is added for you.',
    ]],
  ] },
  { v: '2026.11.05.3', date: '5 November 2026', title: 'Richer team battles, smoother server', groups: [
    ['Changes', [
      '2 v 2 and co-op: ore fields start 50% richer and grow back twice as fast, so long team battles no longer run dry by minute 15 to 20.',
      'V2 rockets do less damage away from the point of impact. A direct hit is as deadly as before.',
      'Enemy units that fire on you from ground you have not explored (like a V2 out of sight) are now revealed, so you can see what hit you.',
    ]],
    ['Fixes', [
      'Big online battles no longer stutter: fixed the game server stalls (up to half a second) in large fights.',
    ]],
  ] },
  { v: '2026.11.05.2', date: '5 November 2026', title: 'Stats after a lost connection', groups: [
    ['Fixes', [
      'If you lose connection in an online battle and cannot get back in, your debrief and stats now still show the graphs.',
    ]],
  ] },
  { v: '2026.11.05.1', date: '5 November 2026', title: 'Beaten, not stuck; smarter Ore Trucks', groups: [
    ['New', [
      'Team battles: if your side is beaten while your ally fights on, choose Keep watching (the whole map is shown, and if your ally wins, you win too) or Debrief to end your game now as a loss. Before, the battle just carried on with nothing to command.',
      'Send an Ore Truck to an ore or gem field and it keeps going back there until the field is empty.',
    ]],
    ['Fixes', [
      'Ore Trucks now mine the fields near your base down to bare ground before driving anywhere else, and prefer fields on your own side of the map, so they no longer wander into enemy territory.',
      'A player who surrenders in a team battle now gets the full graphs in their debrief.',
    ]],
  ] },
  { v: '2026.11.05', date: '5 November 2026', title: 'Smoother online battles', groups: [
    ['Fixes', [
      'Online battles on the game server no longer slow to a slideshow as the armies grow: the server now has a full processor to itself.',
      'If every player leaves an online battle, it now ends with no winner, rather than handing a win to one team.',
    ]],
  ] },
  { v: '2026.11.04.5', date: '4 November 2026', title: 'Ally button and team colours', groups: [
    ['New', [
      'Team battles: an ALLY button next to Auto Attack sends your idle ground units to guard an ally\'s base, and new units follow. They fight raiders there. Press ALLY again to stop sending units; RETURN brings them home.',
      'Pressing ALLY again stops new units going; the ones already there keep defending. A RETURN button brings them all home.',
      'A computer ally now helps defend your base (and its own ally\'s) when it is attacked, on Normal and Hard.',
      'Teammates on the same faction now get different colours: the second is green (Allies) or amber (Soviets).',
      'The announcer now says "Ally defeated" and "Enemy defeated" aloud, and speaks when you send units to help an ally.',
    ]],
    ['Changes', [
      'The debrief in team battles compares your whole team with the whole enemy team.',
      'The BASE button is gone to make room for RETURN (tap the minimap to jump the view).',
    ]],
  ] },
  { v: '2026.11.04.4', date: '4 November 2026', title: 'Team battles and a game server', groups: [
    ['New', [
      '2 v 2 skirmish: on the map screen, pick 2 v 2 to fight two computer sides with a computer ally.',
      'Online team battles for up to four players: 1 v 1, 2 v 2, or two of you against the computer (2 v AI, with its difficulty). The room leader picks the mode and map; everyone picks a faction and can switch team.',
      'In a team battle, a player who surrenders or does not come back is handed to the computer. A team with no players left loses.',
      'A Team Battles page in the Field Manual.',
    ]],
    ['Changes', [
      'Online battles now run on a game server, with both phones as players. If the server cannot be reached, a 1 v 1 goes phone to phone as before. Team battles need the server.',
      'Big battles run faster, so four computer sides on Hard keep up on a phone. Both modes.',
    ]],
  ] },
  { v: '2026.11.04.3', date: '4 November 2026', title: 'Helicopter Base and Soviet Rocket Soldiers', groups: [
    ['New', [
      'The Helipad is now a Helicopter Base with four landing pads, each side with its own look: a bright open apron for the Allies and a sandbagged concrete fortress for the Soviets. It costs 3000 and has 800 health (the old Helipad was 1500 and 400). Both modes.',
      'Each Helicopter Base holds four helicopters. For more, build another base. Both modes.',
      'The Soviets can train Rocket Soldiers again, drawn with an olive RPG-style launcher. The computer\'s Soviets use them too. Both modes.',
      'Rocket Soldiers raise a long, slim RedEye launcher and play a different launch sound when they fire at aircraft. Both sides.',
    ]],
    ['Changes', [
      'A skirmish saved before this update can no longer be continued, because the old Helipad no longer exists. Start a new one.',
    ]],
  ] },
  { v: '2026.11.04.2', date: '4 November 2026', title: 'Easier online joining', groups: [
    ['Fixes', [
      'Online: if a friend\'s first try at joining fails, the host\'s room now stays open for another try. Before, the host had to start a new game, and the retry could say "That game already has two players".',
      'Online: connection details that arrived early are no longer thrown away, which helps joining work the first time.',
    ]],
  ] },
  { v: '2026.11.04.1', date: '4 November 2026', title: 'No more frozen battles', groups: [
    ['Fixes', [
      'An error in the game no longer freezes the battle: the game carries on instead of the picture getting stuck. This could stop an online battle on both phones at once. Both modes.',
    ]],
    ['Changes', [
      'Matches now record any errors, and online battles record the ping and how smoothly each phone ran, so problems testers report can be tracked down.',
    ]],
  ] },
  { v: '2026.11.04', date: '4 November 2026', title: 'Smooth battle sound on iPhone', groups: [
    ['Fixes', [
      'Battle sound no longer crackles, skips or cuts out on iPhone during long, heavy fights. Every battle sound now goes through one mixer instead of building new audio pieces for each shot, so phones keep up and play as many sounds as a computer does.',
    ]],
  ] },
  { v: '2026.11.03.10', date: '3 November 2026', title: 'Two new songs, bigger Normal waves', groups: [
    ['New', [
      'Two new songs in the soundtrack: Airstrike and Roll.',
    ]],
    ['Changes', [
      'Normal computer: attack waves are bigger (10 to 16 units, big pushes 16 to 22) and come at least 3 minutes apart. Single player.',
      'The computer now sends its helicopters together and its jets together, not one at a time. A lone aircraft waits up to 2.5 minutes for company. All difficulties, single player.',
      'The music is now loaded as separate files, so the game page is much smaller and loads faster. Installed copies download the songs in the background so they still play offline.',
    ]],
  ] },
  { v: '2026.11.03.9', date: '3 November 2026', title: 'Smarter Ore Trucks, calmer music', groups: [
    ['Changes', [
      'Ore Trucks now work the field closest to their refinery until it is down to 1/8 of its ore, then move to the next closest. A field they have left is not used again until it has regrown to 6/8. There is no limit on trucks per field any more. Single player and online.',
      'Music no longer rattles or distorts phone speakers: the deep bass that phones cannot play is filtered out of the recorded tracks, and loud explosions squash the music less.',
    ]],
  ] },
  { v: '2026.11.03.8', date: '3 November 2026', title: 'Airfield and depot fixes', groups: [
    ['Fixes', [
      'Jets no longer get stuck when an Airfield is built next to the edge or corner of the map. They now land from the side that has room.',
      'When a Service Depot is destroyed or sold, its repair pad (the plus sign) no longer stays on the ground.',
    ]],
    ['Changes', [
      'The end-of-mission screen button that starts over is now called Main Menu.',
    ]],
  ] },
  { v: '2026.11.03.7', date: '3 November 2026', title: 'Fuller battle sound', groups: [
    ['Changes', [
      'Big battles no longer lose sounds. Twice as many effects can play at once, and when the sound gets crowded the important ones (explosions, collapses, big guns) win over rifle fire and deaths instead of being skipped. Gunfire is also denser. Single player and online.',
    ]],
  ] },
  { v: '2026.11.03.6', date: '3 November 2026', title: 'Volume sliders, new soundtrack', groups: [
    ['New', [
      'Two volume sliders on the menu: Music, and Game sound (effects and voices together). They are remembered on your device. Full is the mix the game had before, so the sliders only turn it down.',
    ]],
    ['Changes', [
      'The soundtrack is now just four recorded tracks, Industry, War, Smash and Rain, while a new one is being made. They are shuffled: every track plays once in a random order before any repeats, and each new match opens with a random one.',
    ]],
  ] },
  { v: '2026.11.03.5', date: '3 November 2026', title: 'A fifth soundtrack piece', groups: [
    ['New', [
      'A new soundtrack piece, Industry (about 3 minutes), joins the rotation after Cold Front. Tap the track name in the menu to skip to it.',
    ]],
  ] },
  { v: '2026.11.03.4', date: '3 November 2026', title: 'New map: Three Crossings', groups: [
    ['New', [
      'A new map, Three Crossings, built for 2 v 2 (team games are coming; for now it plays 1 v 1, one player on each bank). A winding river splits west from east. A timber bridge crosses it in the middle, and rocky shallow fords cross it in the far north and the south. Creeks and rocky cliffs make chokepoints. Eight start positions, four on each bank. Ore lies on both banks, with gem fields beside every base and out by the crossings. Pick it on the Skirmish map screen.',
    ]],
    ['Changes', [
      'Rocket Soldier anti-air missiles chase a little further before burning out: 1.7 times their range, up from 1.5. Single player and online.',
    ]],
  ] },
  { v: '2026.11.03.3', date: '3 November 2026', title: 'A tougher Normal and tanks that spread out', groups: [
    ['Computer opponent', [
      'Normal attack waves are bigger: 6 to 11 units (was 5 to 10), and big pushes of 11 to 14 (was 10 to 13). Big pushes come a little more often and can come at any time, not only after 9 minutes.',
      'On Normal the computer now goes for your least-defended valuable buildings, as it does on Hard, instead of a mix.',
      'On Normal it now saves its Bombing Run as well as its Paratroopers to land together with a big push.',
      'Two-pronged attacks (Normal and Hard): many waves split in two, gather on both sides of their target out of range of your guns, then close in together.',
      'The computer now builds against your army (Normal and Hard). Against tanks it builds more anti-armour, against infantry more anti-infantry, and against a heavily fortified base more Artillery or V2 Rockets.',
    ]],
    ['Changes', [
      'Tanks and other ground vehicles on an attack now spread out like infantry, each in its own lane and at a slightly different pace, instead of rolling in as one big blob. This applies to both sides, single player and online.',
    ]],
  ] },
  { v: '2026.11.03.2', date: '3 November 2026', title: 'Jets land properly, surviving crews and a new Medium Tank', groups: [
    ['New', [
      'A destroyed ground vehicle that does not cook off can now leave one surviving rifleman, about one time in three. He stands guard where the wreck fell. It works the same online.',
    ]],
    ['Changes', [
      'Jets now land like real planes. They line up with the runway, come down on a glide path at landing speed, touch down, brake along the ground and taxi onto their parking spot, instead of slowing to a hover and dropping. Strike Jets and MiGs, both sides, single player and online.',
      'The computer opponent can now field up to 80 units (it was 60). Reaching the limit stops it building more army only: it keeps using its Paratroopers and Bombing Run and repairing its buildings.',
    ]],
    ['Look', [
      'The Allied Medium Tank has a new look: a pale silver hull with striped skirt panels, a small blue-lilac turret with two round hatches, a longer gun and a short aerial.',
    ]],
  ] },
  { v: '2026.11.03.1', date: '3 November 2026', title: 'New Heavy Tank and Mammoth Tank', groups: [
    ['Look', [
      'The Soviet Heavy Tank has a new look: a low bright red hull, a wide flat turret with two dark hatches, a white aerial and two long black guns side by side.',
      'The Soviet Mammoth Tank is redrawn: two big rounded track pods, an orange front plate, a turret with a flat silver hatch and side missile boxes, two tall white aerials and slim twin guns.',
    ]],
  ] },
  { v: '2026.11.03', date: '3 November 2026', title: 'Camouflaged Pillbox, longer defences and a new look', groups: [
    ['New', [
      'The Allied Pillbox is now camouflaged. The enemy cannot see it, pick it or aim at it until one of their ground units comes within 3 cells of it, or until it opens fire or is hit. It stays visible for 4 seconds after that, then hides again. It is always visible while it is being built, and you always see your own. It works the same online.',
      'Its roof takes the colour of the ground it is built on, so it blends in on grass, dirt and the places between.',
    ]],
    ['Balance', [
      'Ground defences reach 25% further: Pillbox 115 to 145, Flame Tower 105 to 130, Gun Turret 130 to 165, Tesla Coil 150 to 190. Every tank is now outranged by every ground defence. Artillery and V2 launchers still outrange all of them. The AA Gun and SAM Site are unchanged.',
    ]],
    ['Look', [
      'New infantry: stockier soldiers in their side\u2019s colour with bigger helmets, a pack and rolled blanket, and a clearer rifle. The Rocket Soldier carries a big pale launcher tube on the shoulder.',
      'The Gun Turret has a new arrowhead top, pointed at the front with sloping armour.',
      'The Pillbox is now a low hexagonal bunker with a turf roof, concrete corner buttresses and firing slits. Its muzzle flash comes out of the slit it is aiming through.',
      'The Gun Turret and the Pillbox give off smoke when they fire. The turret\u2019s hangs in a thick cloud around the barrel for a few seconds.',
      'There is now a wind. It blows all the smoke in the game one way and changes to a new random direction every 50 seconds or so, so firing turrets trail plumes and burning buildings lean over. Online, both players see the same wind.',
    ]],
  ] },
  { v: '2026.11.02.1', date: '2 November 2026', title: 'Testing pass', groups: [
    ['Fixes', [
      'Checked a full round of single player and online battles after the recent updates, including building the Mobile Construction Yard for both sides. No problems found.',
    ]],
  ] },
  { v: '2026.11.02', date: '2 November 2026', title: 'Battle damage, a Service Depot and a new way to win', groups: [
    ['New', [
      'Service Depot (both sides, 1200, needs a War Factory): select damaged vehicles and tap REPAIR, or tap the depot. Vehicles drive onto its pad one at a time; a full repair costs half the vehicle\u2019s price.',
      'Mobile Construction Yard (2500, built at the War Factory once you have a Service Depot): drive it anywhere and DEPLOY it into a full Construction Yard.',
    ]],
    ['How to win', [
      'Losing your Construction Yard no longer ends the game. A side is beaten once it has no Construction Yard, Barracks, War Factory, Helipad or Airfield left and no Mobile Construction Yard on the move.',
      'Once a side has no production buildings left, the enemy is shown where its Mobile Construction Yards are, so one can\u2019t be hidden to drag the battle out.',
    ]],
    ['Look', [
      'Damaged buildings and defences now show it: below 60% health they get shell holes, scorch marks and soot, and below 30% bigger holes, a caved-in corner, glowing embers and rubble. Bigger fires and thick smoke come out of the holes, and pieces fall off. Repairs put it all right.',
      'The Soviet SAM Site now hides its launcher underground. When enemy aircraft come near, its steel doors slide open and the launcher rises; it goes back down once they are gone. It fires exactly as before.',
    ]],
    ['Aircraft', [
      'Each Airfield parks at most 4 jets, all on the runway. With every Airfield full, building another jet is refused.',
      'If an Airfield is lost and the others have no room, its spare jets fly off the map into reserve and come back when there is room. Jets parked on an Airfield that is destroyed are destroyed with it.',
      'Jets coming in to land slow down instead of circling their spot.',
    ]],
    ['Computer', [
      'On Normal and Hard the computer sends Mobile Outposts to real expansions further out, builds 1 to 3 refineries at each, and guards each with 2 guns (3 on Hard). It can build 3 more defences in all.',
      'The computer builds a Service Depot and repairs its vehicles, and builds a Mobile Construction Yard if it loses its Construction Yard.',
      'Computer attackers now turn aside to destroy Outposts and far-off refineries they pass.',
    ]],
  ] },
  { v: '2026.10.31.2', date: '31 October 2026', title: 'A Bridge Too Far: a bigger map', groups: [
    ['Map', [
      'The map is now called A Bridge Too Far, and it is bigger: 144 by 144 cells, about 65% more ground.',
      'There is a map screen when you start a skirmish, and online the host picks the map in the lobby. For now there is one map.',
      'Ore fields are wider, with about two thirds more ore in total, and each side has a second rare gem field out near the far end of the lakes.',
      'A skirmish saved on the old, smaller map cannot be continued.',
    ]],
    ['Combat', [
      'Rangers now fire more slowly, and can no longer shoot jets. They can still shoot helicopters.',
      'A pilot who ejects over water now drowns instead of turning up on the nearest land.',
    ]],
  ] },
  { v: '2026.10.31.1', date: '31 October 2026', title: 'Missiles, spread-out infantry and a new icon', groups: [
    ['Combat', [
      'Anti-air missiles now run out of fuel: a missile fired at an aircraft can only fly about 1.5 times its weapon\u2019s range, so a jet or helicopter that keeps flying away escapes it, and a missile gives up if its target lands. SAM Sites have a longer burn, 3 times their range.',
      'Infantry sent to attack, by an attack order or Auto Attack, now march spread out instead of in one ball, so a V2 or artillery shell kills fewer at once. Some waves still bunch up, so big blasts can still happen. Tanks are not affected.',
    ]],
    ['Online', [
      'Fixed a crash in long online battles that left ghost and missing units on the guest\u2019s screen after an aircraft was shot down.',
    ]],
    ['Look', [
      'New app icon. Home-screen icons are cached by your phone, so you may need to delete the app and add it again to see it.',
    ]],
  ] },
  { v: '2026.10.31', date: '31 October 2026', title: 'Smarter jet defence', groups: [
    ['', [
      'MiGs defending your base now each pick a different raider instead of all chasing the same one.',
      'After one attack pass a MiG flies home to rearm, then goes out again while raiders are still near.',
      'If a MiG’s raider is destroyed on the way, it switches to the next one nobody else is after.',
    ]],
  ] },
  { v: '2026.10.30', date: '30 October 2026', title: 'One game, one record', groups: [
    ['', [
      'A skirmish you save and continue now counts as one game in your service record, instead of being counted again each time you continue it.',
      'Games saved before this update will still count their earlier play time twice when continued.',
    ]],
  ] },
  { v: '2026.10.29.3', date: '29 October 2026', title: 'Continue your skirmish', groups: [
    ['', [
      'Your skirmish now saves itself: whenever you open the menu, when your phone locks or you switch apps, and every 2 minutes.',
      'Continue on the menu picks it up exactly where you left off, with your units, buildings, money, map and even the scorch marks.',
      'One saved game per phone: the most recent skirmish. Winning, losing or quitting clears it. Online battles are not saved.',
    ]],
  ] },
  { v: '2026.10.29.2', date: '29 October 2026', title: 'Leaderboard scores', groups: [
    ['', [
      'The leaderboard now ranks wins by score instead of time. A win scores 10 points a kill, 50 a building destroyed and 1 per 100 ore, plus a speed bonus of up to 5,000 that shrinks the longer the battle runs. Hard counts 1.5 times, Easy half.',
      'Each commander appears once per difficulty, with their best score.',
      'Wins already on the board have been scored too.',
      'After a win, the debrief shows your score above the name box.',
    ]],
  ] },
  { v: '2026.10.29.1', date: '29 October 2026', title: 'Online battles', groups: [
    ['Play a friend', [
      'Play online on the menu: battle a friend, phone to phone. One of you taps Host a game and gets a 4-letter code; the other taps Join and types it in.',
      'In the lobby the host picks who plays Allies and who plays Soviets, then starts the battle. The host\'s phone runs the battle, so the stronger phone should host.',
      'Your commander name (from your Profile) shows to your opponent. Their name and your connection speed show at the top of the screen.',
      'If a phone locks or the connection drops, the battle pauses for both of you and picks up again when you reconnect. Anyone not back within 2 minutes loses.',
      'Quit mission in an online battle surrenders. Rematch takes you both back to the lobby, no new code needed.',
      'Online battles count towards your service record.',
    ]],
    ['Also', [
      'Start mission is now called Skirmish.',
    ]],
  ] },
  { v: '2026.10.29', date: '29 October 2026', title: 'Your service record', groups: [
    ['Profiles', [
      'A Profile button on the menu. Sign in with your email address and a 6-digit code we email you: no password to remember.',
      'Choose a commander name of your own. It goes on the leaderboard for you, and will be your name in online battles.',
      'Your service record shows your total play time, your lifetime kills and the most ore you have gathered in one game, plus missions won and lost.',
      'Games you have already played on your phone count towards your record when you first sign in.',
      'You can sign out or delete your account at any time. Playing without signing in works just as before.',
    ]],
  ] },
  { v: '2026.10.28.11', date: '28 October 2026', title: 'Never miss an update', groups: [
    ['', [
      'After an update, What\'s New on the menu wears a NEW badge and glows until you have read the notes.',
      'The menu names the latest update under the version number: tap it to read what changed.',
    ]],
  ] },
  { v: '2026.10.28.10', date: '28 October 2026', title: 'The computer has to find you', groups: [
    ['', [
      'The computer now knows only what it has seen, just like you. When its first-attack time comes it scouts for your base, with its Spy Plane, a helicopter or its fastest unit, and only attacks once it has found you.',
      'Hard waits 4 minutes before its first attack, and its raids wait until it has found you, so there is time to set up. After that it plays as hard as before.',
      'Firing at the computer\'s Spy Plane, Paratroopers transport or bomber gives away where your shooters stand, as it already did the other way round.',
    ]],
  ] },
  { v: '2026.10.28.9', date: '28 October 2026', title: 'Touch controls fix', groups: [
    ['', [
      'Fixed the map getting stuck zooming in and out whenever you dragged it, with taps doing nothing and buildings impossible to place, even in a new game, until the app was restarted. It could happen after a notification, an alert or a swipe from the edge of the screen in the middle of a touch.',
    ]],
  ] },
  { v: '2026.10.28.8', date: '28 October 2026', title: 'No more jet rushes', groups: [
    ['', [
      'The Airfield now needs a Radar Dome.',
      'Jets take about 20 seconds to rearm on the Airfield, up from 9.',
      'On Normal and Hard the computer builds an anti-air site beside its Construction Yard early in the game, and a second as soon as it sees your aircraft.',
    ]],
  ] },
  { v: '2026.10.28.7', date: '28 October 2026', title: 'A top five for every difficulty', groups: [
    ['Leaderboard', [
      'The leaderboard now shows the five fastest wins at each difficulty, each under its own heading. Every win counts, so the same commander can hold several places.',
    ]],
  ] },
  { v: '2026.10.28.6', date: '28 October 2026', title: 'Guard orders, a later first wave and a calmer announcer', groups: [
    ['Announcer', [
      'She says "Training" or "Building" when a queue starts, not for every unit you add to it, and repeated taps no longer make her repeat herself.',
      '"Insufficient funds" at most every 30 seconds, and "Unit ready" no longer for every unit of a batch.',
      'A new tip: "More ore trucks needed" when you have fewer than two Ore Trucks per refinery, a War Factory and the money for one, at most every 90 seconds. The computer keeps two per refinery, and that is most of why its economy pulls ahead.',
    ]],
    ['Orders', [
      'A new GUARD button: tap it, then tap the area to hold. The units guard it until you give them another order: auto attack and base defence leave them where they are, and aircraft go home only to rearm or for repairs, then fly straight back.',
      'The ring shown while you pick the area is how far the units will go after enemies: about 6 to 10 cells, depending on the unit. Artillery and the V2 on guard fire at anything in view within their full range (12 and 13 cells), not just what they can see themselves.',
      'ATTACK sends aircraft on one strike: they hit what they find, fly home once their weapons are spent (or if badly damaged) and stay there. Ground units hunt as before.',
      'Attacking only goes after enemy buildings you have uncovered: AUTO and ATTACK no longer lead your units to an enemy base you have not found. Until you have seen an enemy building they stay off ("Enemy base not located"), so scout first, with any unit or the Spy Plane. Auto attack starts each mission off.',
      'STOP drops every order: units go back to what they do when first built. Ground units wait around the base and aircraft on their pad, both ready for auto attack, and Ore Trucks go back to harvesting.',
    ]],
    ['Defence', [
      'Jets and helicopters are the first to answer when your base or an Ore Truck is attacked, and come from further away to help a truck. Only as many go as the fight needs, counting each aircraft as a quarter of its price (one helicopter is no match for a squad of infantry); ground units make up the rest if there are not enough aircraft around.',
      'Aircraft shoot back: one that is shot at turns on the shooter, and one parked on its pad takes off to fight instead of sitting there, even half-rearmed or waiting on repairs. Once the fight is over they fly home.',
    ]],
    ['Support planes', [
      'As in Red Alert, the Spy Plane, the Paratroopers transport and the Bombing Run bomber no longer uncover the map along their flight path. The Spy Plane uncovers its target area, paratroopers see around them once they land, and anything that fires at any of the three on the way shows up in a small patch, which gives away where the enemy keeps its anti-aircraft.',
    ]],
    ['Paratroopers', [
      'A drop is now seven soldiers instead of five: five riflemen and two Rocket Soldiers for the Allies, four riflemen and three Grenadiers for the Soviets.',
      'Fixed base defence ignoring paratroopers once they had landed: nobody was sent after them, so they could walk up to parked helicopters unopposed. Your own landed paratroopers (and rescued pilots) now join in base defence and can be picked with select-all too.',
    ]],
    ['Fixes', [
      'Fixed the game freezing when a unit shot at another while its own target, an aircraft, had just taken off out of its reach.',
    ]],
    ['The computer', [
      'More time to build up: on Easy and Normal the first attack wave comes at 6:00 instead of 4:30. On Normal, raids on your Ore Trucks start around 6:30 and big pushes from 9:00; on Easy, raids start around 7:00.',
    ]],
    ['Match data', [
      'The match data now records each side\'s refineries and Ore Trucks through the game.',
    ]],
    ['Field Manual', [
      'Updated for this release: the new orders and controls, how defence and aircraft behave, support planes, the computer\'s new timings, and new field tips.',
    ]],
  ] },
  { v: '2026.10.28.5', date: '28 October 2026', title: 'Quit mission', groups: [
    ['', [
      'A Quit mission button on the pause menu: tap it twice to leave a mission and go back to the main menu.',
      'A mission you quit, or leave for a new one, now reports how far it got (the debrief numbers so far), so it counts in the match data instead of showing as abandoned.',
      'If the app is closed in the middle of a mission, the match data keeps its numbers up to the last minute: the game now sends them once a minute and as you leave the app.',
    ]],
  ] },
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
