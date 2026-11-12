'use strict';
// Release notes, newest first; the first entry is the version this copy of the game is. Add a
// new entry at the top with every update for the testers: an installed copy notices the new
// version when it is next opened or brought back to the front, and offers to restart into it.
// The What's New page on the menu shows them all.
const RELEASES = [
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
