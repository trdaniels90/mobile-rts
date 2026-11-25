'use strict';
// Game data: map size, factions, units, structures and damage tables.

const CELL = 24;            // world pixels per map cell
// The map is MAP x MAP cells. Each map sets its own size (`size` in MAPS, 144 when not given) with
// setMapSize (world.js) when a battle starts; these are the default. The ground is painted in tiles
// (art.js makeGround), so the size is not limited by what a phone can hold in one picture.
let MAP = 144;
let WORLD = MAP * CELL;
let NCELLS = MAP * MAP;
const ORE_MAX = 250;        // credits a single ore cell grows back to, at most
const ORE_START = 1.5;      // fields start this much richer than they ever grow back

const FACTIONS = {
  allies: {
    name: 'Allies',
    pal: { main: '#5b7fb0', light: '#97b4da', dark: '#36547c', deep: '#1d2f48' },
    alt: { main: '#4f9a5a', light: '#8fd09a', dark: '#2f6a3a', deep: '#173a20' },   // a teammate of the same faction: green
    alt2: { main: '#2f9e9a', light: '#72d2cc', dark: '#1d6b68', deep: '#0e3b39' },  // a third (3 v 3): teal
  },
  soviets: {
    name: 'Soviets',
    pal: { main: '#ad3128', light: '#dd6c5c', dark: '#781d18', deep: '#45100c' },
    alt: { main: '#c98a1e', light: '#efc062', dark: '#8c5c0e', deep: '#4e3206' },   // a teammate of the same faction: amber
    alt2: { main: '#8b4a9c', light: '#c487d2', dark: '#5c2a6a', deep: '#331439' },  // a third (3 v 3): purple
  },
};

// Veterancy, as in OpenRA's Red Alert: a unit is promoted when the cost of what it has destroyed reaches
// `at` times its own cost. Each rank (index 0 = none, 4 = elite) multiplies the damage it deals (`fire`),
// the damage it takes (`armor`), its speed on the ground, its reload time and its weapons' reach (`range`). An elite unit also heals
// `heal` of its health every `healEvery` seconds once it has not been hit for `healWait`.
const VET = {
  at: [2, 4, 8, 16],
  fire: [1, 1.05, 1.1, 1.2, 1.3],
  armor: [1, 0.95, 0.9, 0.85, 0.75],
  speed: [1, 1.05, 1.1, 1.2, 1.4],
  reload: [1, 0.95, 0.9, 0.85, 0.75],
  range: [1, 1.05, 1.1, 1.15, 1.2],
  heal: 0.05, healEvery: 4, healWait: 5,
  names: ['', 'Veteran', 'Veteran II', 'Veteran III', 'Elite'],
};

// Damage multiplier by warhead against armor class.
// Walls and gates: a layer of the map (G.wall, one piece a cell), not structures. Laid in straight lines near your own
// buildings and paid for by the piece (world.js placeWalls). hard: nothing on the ground passes. wire: stops infantry,
// vehicles drive through and flatten it. gate: its own alliance passes, everyone else is stopped. Only ordered fire
// (Attack ground) hurts them, and units on an Auto Attack that find their way walled off shoot a way through.
const WALLS = {
  sandbag:  { id: 1, name: 'Sandbags', cost: 25, hp: 100, factions: ['allies'], req: 'barracks', hard: true },
  wire:     { id: 2, name: 'Barbed Wire', cost: 20, hp: 40, factions: ['soviets'], req: 'barracks', wire: true },
  concrete: { id: 3, name: 'Concrete Wall', cost: 100, hp: 300, factions: ['allies', 'soviets'], req: 'factory', hard: true },
  // The Gate is three cells bought as one: its middle (id 4 lying west-east, 5 north-south, 7 north-west to south-east,
  // 8 north-east to south-west: a diagonal gate fits a diagonal wall, straight across the iso view) and an end either side (6).
  // The cells share one health and fall together (world.js gateCells). `part` kinds are never bought on their own.
  gate:     { id: 4, name: 'Gate', cost: 500, hp: 600, factions: ['allies', 'soviets'], req: 'factory', gate: true },
  gateV:    { id: 5, name: 'Gate', cost: 500, hp: 600, factions: ['allies', 'soviets'], req: 'factory', gate: true, part: true },
  gateEnd:  { id: 6, name: 'Gate', cost: 500, hp: 600, factions: ['allies', 'soviets'], req: 'factory', gate: true, part: true },
  gateD:    { id: 7, name: 'Gate', cost: 500, hp: 600, factions: ['allies', 'soviets'], req: 'factory', gate: true, part: true },
  gateA:    { id: 8, name: 'Gate', cost: 500, hp: 600, factions: ['allies', 'soviets'], req: 'factory', gate: true, part: true },
};
const WALL_BY_ID = [null];
for (const k in WALLS) { WALLS[k].key = k; WALL_BY_ID[WALLS[k].id] = WALLS[k]; }
const WALL_LINE_MAX = 40;   // pieces in one line

// A bridge span that can be destroyed (maps with `breakable` in MAPS; world.js addSpan): neutral, never fired on unless
// ordered (Attack ground), armoured like a structure. Down, an Engineer rebuilds it (the computer trains one for it: ai.js aiBridges).
// SPOT: a point on the ground units were told to fire at (commandAttackGround).
const SPOT = { name: 'Ground', armor: 'bld', r: 0 };
const SPAN = { name: 'Bridge', hp: 6000, armor: 'bld', r: 20 };
// A village house (maps with `village`; world.js genVillage): neutral, hurt by blasts near it and by an ordered attack.
const HOUSE = { name: 'House', armor: 'bld', r: 20 };
const INF_SCALE = 0.65;   // soldiers are drawn at this share of their voxel models' size (owner's pick after a Red Alert comparison): sprites, muzzles, aim heights, bodies. Looks only
const BUILD_UP = 2.5;   // seconds a structure takes to go up once placed (world.js updateBuilding; art.js drawBuildUp); both modes, the server must match
const WARHEADS = {
  SA:    { inf: 1.0, light: 0.55, heavy: 0.25, bld: 0.3, air: 0.6 },   // small arms
  AP:    { inf: 0.3, light: 0.9,  heavy: 1.0,  bld: 0.7, air: 1.0 },   // tank shells
  HE:    { inf: 0.5, light: 1.0,  heavy: 0.8,  bld: 0.9, air: 1.0 },   // rockets and missiles
  FLAK:  { inf: 0,   light: 0,    heavy: 0,    bld: 0,   air: 1.0 },
  TESLA: { inf: 1.6, light: 1.2,  heavy: 1.3,  bld: 0.6, air: 0 },   // Tesla Coil and Tesla Tank (vehicles 1.0 / 0.9 until 2026.11.17.12, owner: more against tanks)
  FIRE:  { inf: 1.3, light: 0.6,  heavy: 0.3,  bld: 0.7, air: 0 },   // flame tower
  ART:   { inf: 0.9, light: 0.9,  heavy: 0.25, bld: 0.75, air: 0 },   // artillery shells: only the tank figure is OpenRA's 155mm (2026.11.15)
  RF:    { inf: 1.0, light: 0.27, heavy: 0.07, bld: 0.07, air: 0.6 }, // rifles: OpenRA's M1Carbine, with infantry kept at 1
  GR:    { inf: 0.6, light: 0.25, heavy: 0.25, bld: 1.0, air: 1.0 },  // grenades: OpenRA's Grenade
  AT:    { inf: 0.3, light: 0.75, heavy: 1.0,  bld: 0.6, air: 1.0 },   // Rocket Soldier: Red Alert's AP
  HF:    { inf: 0.15, light: 0.9, heavy: 1.0,  bld: 0.7, air: 1.0 },   // Hellfire: a tank killer, wasted on infantry
  CG:    { inf: 1.0, light: 0.8,  heavy: 0.2,  bld: 0.25, air: 0.6 },  // the Comanche's 20 mm chain gun: infantry and light vehicles, little against tanks
  SN:    { inf: 1.0, light: 0.1,  heavy: 0.03, bld: 0.03, air: 0 },    // the Sniper's rifle: one man at a time, next to nothing against armour
  TD:    { inf: 0.2, light: 0.9,  heavy: 1.0,  bld: 0.4, air: 0 },     // the Tank Destroyer's high-velocity gun: armour piercing, wasted on soldiers and walls
};

// cls: inf | veh | air.  cat: which sidebar tab builds it.  speed in px/s, sight in cells.
// Speeds match OpenRA's Red Alert at normal speed (its Speed x 25 ticks / 1024 per cell x CELL; 2026.11.13).
const UNIT_DEFS = {
  rifle: {
    name: 'Rifle Infantry', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['allies', 'soviets'],
    cost: 100, hp: 50, armor: 'inf', speed: 32, sight: 4, r: 5,
    weapon: { dmg: 7, rof: 1.3, range: 120, wh: 'RF', proj: 'bullet', burst: 3, gap: 0.11, splash: 14 },
  },
  grenadier: {
    name: 'Grenadier', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['soviets'],
    cost: 160, hp: 50, armor: 'inf', speed: 40, sight: 5, r: 5,
    weapon: { dmg: 42, rof: 2.0, range: 100, wh: 'GR', proj: 'grenade', splash: 14 },
  },
  // Heavy machine gun team: two men, a gunner and a loader, with a crew-served gun (Allies an M2 .50 cal on a tripod,
  // Soviets a DShK 12.7 mm on its wheeled carriage with a shield). Carried while walking; must stop and set it up
  // (`setup` s) before it can fire, and pack it up (`pack` s) before moving again (world.js hmgReady). Set up, the
  // team is dug in (takes PRONE_COVER of the damage) and is not shoved aside; standing still it sets up on its own.
  // Staged (tools/sim/mg-team.js): 2 set-up teams beat 8 riflemen (equal cost) 6 of 8 times, killing 7.5 on average. Shreds infantry, hurts light vehicles,
  // reaches helicopters (not jets), weak against tanks and buildings.
  hmg: {
    name: 'MG Team', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['allies', 'soviets'],
    cost: 400, hp: 150, armor: 'inf', speed: 26, sight: 7, r: 7, setup: 1.5, pack: 1.0,
    weapon: { dmg: 12, rof: 1.4, range: 150, wh: 'SA', proj: 'bullet', burst: 6, gap: 0.09, splash: 10, air: true, heliOnly: true, sound: 'hmg' },
  },
  // Sniper (Allies, after the Tech Center upgrade `sniper`): a long scoped rifle that kills most soldiers with one shot from
  // further than anything else on foot can reach, but slowly and one at a time, and does next to nothing to vehicles or
  // buildings. `max`: no more than this many alive at once per side (world.js unitCap; queued ones count).
  sniper: {
    name: 'Sniper', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['allies'], upgrade: 'sniper', max: 5,
    cost: 700, hp: 60, armor: 'inf', speed: 30, sight: 9, r: 5,
    weapon: { dmg: 125, rof: 3.0, range: 230, wh: 'SN', proj: 'bullet', sound: 'sniper' },
  },
  // Flamethrower (Soviets, needs a Tech Center): a short jet of fire that burns infantry and splashes groups. Its fuel
  // tanks can go up when he dies (`explodes`: the chance): a fireball that hurts everything round it, friend or foe, and
  // sets the soldiers in it on fire (world.js flamerBlast, burning).
  flamer: {
    name: 'Flamethrower', cls: 'inf', cat: 'infantry', producer: 'barracks', req: ['tech'], factions: ['soviets'],
    cost: 400, hp: 70, armor: 'inf', speed: 30, sight: 5, r: 5, explodes: 1 / 3,
    weapon: { dmg: 30, rof: 1.4, range: 80, wh: 'FIRE', proj: 'fireball', splash: 16 },
  },
  // Specialist (both sides, needs a Tech Center, at most 2 at a time): a commando. An assault rifle (better than the Rifle
  // Infantry's: more rounds a burst, more reach); explosives for structures (`demo`): sent at an enemy structure, or picking one
  // up himself, he walks up to it, plants a charge (SPEC_PLANT s) and moves off; SPEC_FUSE s later it blows and the structure is
  // destroyed whatever its health (world.js demolish, c4Blast). Under fire, he may throw a smoke grenade (`smoke`: world.js
  // throwSmoke): a cloud between him and the shooter that no direct fire passes through for SMOKE_LIFE s.
  spec: {
    name: 'Specialist', cls: 'inf', cat: 'infantry', producer: 'barracks', req: ['tech'], factions: ['allies', 'soviets'], max: 2,
    cost: 1200, hp: 150, armor: 'inf', speed: 36, sight: 6, r: 5, demo: true, smoke: true,
    weapon: { dmg: 9, rof: 0.9, range: 140, wh: 'RF', proj: 'bullet', burst: 4, gap: 0.08, splash: 8 },
  },
  // Unarmed. Walks into an enemy structure and captures it at once (Construction Yards too), into a destroyed bridge span
  // and it is rebuilt, or into a damaged friendly structure and it is repaired in full; either way the Engineer is used up
  // (world.js commandEngineer, captureBuilding). Cost, health, speed and sight
  // as Red Alert's (its speed 4 is the Rifle Infantry's).
  engineer: {
    name: 'Engineer', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['allies', 'soviets'],
    cost: 500, hp: 25, armor: 'inf', speed: 32, sight: 4, r: 5, engineer: true,
  },
  // Bails out of a downed aircraft. Cannot be built.
  pilot: {
    name: 'Pilot', cls: 'inf', cat: 'infantry', factions: [], cost: 0, hp: 35, armor: 'inf', speed: 32, sight: 4, r: 5,
    weapon: { dmg: 5, rof: 1.1, range: 60, wh: 'SA', proj: 'bullet' },
  },
  // A Technician: a civilian worker from a structure, with a pistol. Comes out of a structure that is sold or destroyed
  // (world.js escapeSurvivors); cannot be built.
  technician: {
    name: 'Technician', cls: 'inf', cat: 'infantry', factions: [], cost: 0, hp: 25, armor: 'inf', speed: 32, sight: 4, r: 5,
    weapon: { dmg: 4, rof: 1.2, range: 60, wh: 'SA', proj: 'bullet' },
  },
  // A Dragon rocket for armour and a RedEye missile, with more reach, for aircraft. Both fire as often
  // as a Medium Tank's gun. Both sides train it; the Soviet one is drawn with an olive RPG-style launcher.
  rocket: {
    name: 'Rocket Soldier', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['allies', 'soviets'],
    cost: 300, hp: 45, armor: 'inf', speed: 32, sight: 5, r: 5,
    weapon: { dmg: 35, rof: 1.5, range: 120, wh: 'AT', proj: 'rocket' },
    weapon2: { dmg: 50, rof: 1.5, range: 180, wh: 'AT', proj: 'rocket', air: true, ground: false, fuel: 1.7, sound: 'redeye' },   // chases a little further than AA_FUEL
  },
  ranger: {
    name: 'Ranger', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies'], draw: 'jeep',
    cost: 600, hp: 150, armor: 'light', speed: 96, turn: 5, sight: 6, r: 7, size: { len: 15, wid: 10 },
    weapon: { dmg: 6, rof: 1.3, range: 96, wh: 'SA', proj: 'bullet', air: true, heliOnly: true, burst: 4, gap: 0.08 },   // heliOnly: shoots helicopters but not jets
  },
  ltank: {
    name: 'Light Tank', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies'], draw: 'tank',
    cost: 700, hp: 300, armor: 'heavy', speed: 66, turn: 3.2, sight: 5, r: 8, size: { len: 17, wid: 13, tur: 4.5, barrel: 10, light: true, tz: 5 },
    weapon: { dmg: 30, rof: 1.3, range: 108, wh: 'AP', proj: 'shell', sound: 'cannonLight' },   // its own lighter gun sound
  },
  mtank: {
    name: 'Medium Tank', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies'], draw: 'tank',
    cost: 800, hp: 400, armor: 'heavy', speed: 42, turn: 2.8, sight: 5, r: 9, size: { len: 24, wid: 16, tur: 5.5, barrel: 14, grizzly: true, tz: 5 },
    weapon: { dmg: 40, rof: 1.5, range: 114, wh: 'AP', proj: 'shell' },
  },
  htank: {
    name: 'Heavy Tank', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['soviets'], draw: 'tank',
    cost: 1150, hp: 550, armor: 'heavy', speed: 38, turn: 2.5, sight: 5, r: 10, size: { len: 22, wid: 16, tur: 6, barrel: 8, twin: true, heavy: true, tz: 6 },
    weapon: { dmg: 30, rof: 1.7, range: 114, wh: 'AP', proj: 'shell', twin: true, stagger: 0.25, sound: 'cannonTwin' },   // stagger: the second barrel fires this much later
  },
  // Tesla Tank (Soviets, after the Tech Center upgrade `teslatank`): a mobile Tesla Coil, after OpenRA's Red Alert TTNK (cost, health,
  // light armour, speed). Its bolt is shorter-ranged and lighter than the Coil's, hits ground targets only and needs no power.
  ttank: {
    name: 'Tesla Tank', cls: 'veh', cat: 'vehicle', producer: 'factory', upgrade: 'teslatank', factions: ['soviets'], draw: 'tank',
    cost: 1350, hp: 450, armor: 'light', speed: 50, turn: 3, sight: 6, r: 9, size: { len: 21, wid: 15, tur: 5, barrel: 0, tesla: true, tz: 5 },
    weapon: { dmg: 75, rof: 2.4, range: 140, wh: 'TESLA', proj: 'tesla' },
  },
  // Tank Destroyer (Allies, War Factory with a Tech Center; owner's pick for both modes): a turretless tank hunter. No turret, so
  // the whole vehicle turns to aim (`fixed`, like the Artillery); its long gun out-ranges every tank (150 against 114-118).
  tdest: {
    name: 'Tank Destroyer', cls: 'veh', cat: 'vehicle', producer: 'factory', req: ['tech'], factions: ['allies'], draw: 'tank', fixed: true,
    cost: 1100, hp: 400, armor: 'heavy', speed: 50, turn: 2.6, sight: 6, r: 9, size: { len: 22, wid: 15, tur: 4, barrel: 14, td: true, tz: 5 },
    weapon: { dmg: 90, rof: 2.2, range: 150, wh: 'TD', proj: 'shell' },
  },
  // Mobile SAM (Soviets, War Factory; owner's pick for both modes): drawn after the SA-13 Gopher (models.js msamHull, samTurret), the
  // SAM Site on tracks (the Soviets fight aircraft with missiles, the Allies with flak). Air only, needs no power.
  msam: {
    name: 'Mobile SAM', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['soviets'], draw: 'tank',
    cost: 800, hp: 250, armor: 'light', speed: 60, turn: 3, sight: 7, r: 9, size: { len: 22, wid: 14, tur: 4, barrel: 8, sam: true, tz: 6 },
    weapon: { dmg: 45, rof: 1.4, range: 190, wh: 'HE', proj: 'missile', air: true, ground: false },
  },
  mammoth: {
    name: 'Mammoth Tank', cls: 'veh', cat: 'vehicle', producer: 'factory', req: ['tech'], factions: ['soviets'], draw: 'tank',
    cost: 2000, hp: 950, armor: 'heavy', speed: 25, turn: 2, sight: 6, r: 12, size: { len: 24, wid: 22, tur: 7.5, barrel: 14, twin: true, pods: true, mammoth: true, tz: 4 },
    weapon: { dmg: 45, rof: 1.9, range: 118, wh: 'AP', proj: 'shell', twin: true, sound: 'cannonMammoth' },
    weapon2: { dmg: 35, rof: 2.6, range: 140, wh: 'HE', proj: 'rocket', air: true },
  },
  // Long-range support, built once a Radar Dome stands. Neither has a turret: the whole vehicle
  // turns to aim, and both lob their rounds in a high arc, so they can miss a moving target.
  arty: {
    name: 'Artillery', cls: 'veh', cat: 'vehicle', producer: 'factory', req: ['dome', 'tech'], factions: ['allies'], draw: 'arty', fixed: true,
    cost: 600, hp: 190, armor: 'light', speed: 42, turn: 2, sight: 5, r: 9, size: { len: 20, wid: 13, tur: 0, barrel: 15 },
    weapon: { dmg: 110, rof: 4, range: 288, wh: 'ART', proj: 'artyshell', splash: 22, spread: 16 },
  },
  v2rl: {
    name: 'V2 Rocket Launcher', cls: 'veh', cat: 'vehicle', producer: 'factory', req: ['dome'], factions: ['soviets'], draw: 'v2', fixed: true, setup: 1.5, pack: 1,   // the rocket lies flat on the bed: raised (setup s) before it fires, lowered (pack s) before it drives
    cost: 800, hp: 150, armor: 'light', speed: 42, turn: 2, sight: 5, r: 10, size: { len: 22, wid: 12, tur: 0, barrel: 12 },
    weapon: { dmg: 240, rof: 7, range: 340, wh: 'HE', proj: 'v2', splash: 30, spread: 12 },
  },
  harv: {
    name: 'Ore Truck', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies', 'soviets'], draw: 'harv',
    cost: 1400, hp: 600, armor: 'heavy', speed: 42, turn: 3, sight: 4, r: 10, size: { len: 24, wid: 15 },
    harvester: true, capacity: 1000,
  },
  // Drives out to a distant ore field and deploys into an Outpost, which lets its side build there.
  fob: {
    name: 'Mobile Outpost', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies', 'soviets'], draw: 'fob',
    cost: 1000, hp: 500, armor: 'heavy', speed: 35, turn: 2.5, sight: 5, r: 10, size: { len: 22, wid: 14 }, deploys: 'outpost',
  },
  // Armoured personnel carriers (OpenRA's APC: $850, 300 health, heavy armour, Speed 142, 5 aboard). Infantry selected, tap
  // the APC: they walk to it and climb in (`carry`); UNLOAD HERE lets them out where it stands. Destroyed with soldiers
  // aboard, each has APC_ESCAPE (world.js) chance to get out of the wreck, hurt. A heavy machine gun on top for infantry and
  // helicopters (Allies: a gunner at an M2 in the hatch; Soviets: a small turret). `apc` / `btr`: one type per side so their
  // wrecks (which are drawn from the type alone) look right.
  apc: {
    name: 'APC', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies'], draw: 'apc', apc: true, carry: 5,
    cost: 850, hp: 300, armor: 'heavy', speed: 83, turn: 3.2, sight: 5, r: 9, size: { len: 22, wid: 14, tur: 2, barrel: 9, tz: 11 },
    weapon: { dmg: 7, rof: 1.2, range: 100, wh: 'SA', proj: 'bullet', air: true, heliOnly: true, burst: 5, gap: 0.08, sound: 'hmg' },
  },
  btr: {
    name: 'APC', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['soviets'], draw: 'apc', apc: true, carry: 5,
    cost: 850, hp: 300, armor: 'heavy', speed: 83, turn: 3.2, sight: 5, r: 9, size: { len: 25, wid: 13, tur: 2, barrel: 10, tz: 10 },
    weapon: { dmg: 7, rof: 1.2, range: 100, wh: 'SA', proj: 'bullet', air: true, heliOnly: true, burst: 5, gap: 0.08, sound: 'hmg' },
  },
  // Unpacks into a Construction Yard anywhere on the map. Needs a Service Depot.
  mcv: {
    name: 'Mobile Construction Yard', cls: 'veh', cat: 'vehicle', producer: 'factory', req: ['depot'], factions: ['allies', 'soviets'], draw: 'mcv',
    cost: 2500, hp: 1200, armor: 'heavy', speed: 35, turn: 2, sight: 5, r: 12, size: { len: 28, wid: 16 }, deploys: 'cy',
  },
  // Closer to the original Red Alert: the Allied helicopter's Hellfires are anti-armour (6 a sortie,
  // 4 cells), the Hind's chain gun shreds infantry (12 bursts a sortie, 5 cells).
  heli: {
    name: 'Attack Helicopter', cls: 'air', fly: 'heli', cat: 'heli', producer: 'helipad', req: ['tech'], factions: ['allies'],
    cost: 1200, hp: 220, armor: 'air', speed: 87, sight: 6, r: 9,
    weapon: { dmg: 55, rof: 0.9, range: 96, wh: 'HF', proj: 'rocket', ammo: 6, prefersArmor: true },
  },
  // RAH-66 Comanche (Allies, after the Tech Center upgrade `comanche`): a stealthy stand-off helicopter. It hangs back at the
  // edge of its reach: the chain gun for infantry and light vehicles (tanks only once its missiles are spent: `spareTanks`), and
  // four missiles for tanks and Ore Trucks alone (`tanksOnly`, world.js missileMark), fired from bays in its sides after holding a lock (`lock` s).
  // The gun outranges the MG Team (150) and the Rocket Soldier (180): it holds at 0.92 of 190 and backs off inside 0.8.
  comanche: {
    name: 'Comanche', cls: 'air', fly: 'heli', cat: 'heli', producer: 'helipad', upgrade: 'comanche', factions: ['allies'], standoff: true,
    cost: 2000, hp: 180, armor: 'air', speed: 100, sight: 8, r: 9,
    weapon: { dmg: 11, rof: 1.0, range: 190, wh: 'CG', proj: 'bullet', ammo: 15, burst: 4, gap: 0.08, splash: 8, spareTanks: true, sound: 'mg' },
    weapon2: { dmg: 120, rof: 1.2, range: 210, wh: 'HF', proj: 'missile', ammo: 4, tanksOnly: true, lock: 1.0, bay: true },
  },
  hind: {
    name: 'Hind Gunship', cls: 'air', fly: 'heli', cat: 'heli', producer: 'helipad', factions: ['soviets'],
    cost: 1200, hp: 240, armor: 'air', speed: 66, sight: 6, r: 10,
    weapon: { dmg: 13, rof: 1.0, range: 120, wh: 'SA', proj: 'bullet', ammo: 12, burst: 5, gap: 0.07 },
  },
  // Transport helicopters (unarmed): carry up to `carry` infantry. Board: infantry selected, tap the transport (it lands by
  // them). Drop: transport selected, tap the ground (it flies there, lands, unloads, goes home). Air Assault (sidebar, world.js
  // commandAirAssault): an idle transport fetches up to `carry` idle infantry from beside a Barracks and lands them where tapped.
  chinook: {
    name: 'Chinook', cls: 'air', fly: 'heli', cat: 'heli', producer: 'helipad', factions: ['allies'], lift: true,
    cost: 1000, hp: 320, armor: 'air', speed: 75, sight: 5, r: 13, carry: 8,
  },
  halo: {
    name: 'Halo Transport', cls: 'air', fly: 'heli', cat: 'heli', producer: 'helipad', factions: ['soviets'], lift: true,
    cost: 1000, hp: 360, armor: 'air', speed: 70, sight: 5, r: 14, carry: 8,
  },
  // Jets carry ground-attack missiles (weapon), air-to-air missiles (weapon2, also fired at ground
  // targets once the ground-attack ones are spent) and a cannon for
  // gun runs (gun: `runs` strafing passes a sortie, each `rounds` shells walked along the flight
  // line through the target, each hurting what is within `splash`), and drop flares that can pull incoming missiles and rockets off course.
  jet: {
    name: 'Strike Jet', cls: 'air', fly: 'jet', cat: 'jet', producer: 'airfield', factions: ['allies'],
    cost: 1100, hp: 140, armor: 'air', speed: 130, turn: 2.4, sight: 6, r: 9,
    weapon: { dmg: 80, rof: 0.45, range: 130, wh: 'HE', proj: 'missile', ammo: 2 },
    weapon2: { dmg: 60, rof: 0.5, range: 200, wh: 'HE', proj: 'missile', air: true, ammo: 2 },
    gun: { dmg: 12, wh: 'SA', range: 110, runs: 3, rounds: 14, gap: 0.045, splash: 9, walk: 70 }, flares: 2,
  },
  // Support aircraft called in from the Airfield (see POWERS); they fly a set route and cannot be ordered.
  spyplane: { name: 'Spy Plane', cls: 'air', fly: 'jet', scripted: true, factions: [], cost: 0, hp: 150, armor: 'air', speed: 343, sight: 8, r: 9 },
  transport: { name: 'Transport', cls: 'air', fly: 'jet', draw: 'cargo', scripted: true, factions: [], cost: 0, hp: 420, armor: 'air', speed: 105, sight: 5, r: 14 },
  // Close air support planes (POWERS.cas): `gun` an anti-tank cannon walked along the flight line (tickStrafe), `msl` homing air-to-ground missiles
  // (fired at vehicles first, then defences and buildings in the area), `perPass` of them each pass. `atgm`: a long-range guided anti-tank
  // missile (AGM-65 Maverick / Kh-29L), not a rocket: dropped from a wing pylon, climbs and dives onto the target, fast, long contrail, big blast.
  a10:  { name: 'A-10 Warthog', cls: 'air', fly: 'jet', scripted: true, factions: [], cost: 0, hp: 520, armor: 'air', speed: 118, turn: 1.6, sight: 6, r: 11,
          gun: { dmg: 30, wh: 'AT', range: 170, rounds: 26, gap: 0.035, splash: 11, walk: 96 },
          msl: { dmg: 160, rof: 0.5, range: 560, wh: 'HF', proj: 'missile', atgm: true, speed: 540, splash: 26, ammo: 4, perPass: 2, sound: 'missile', name: 'AGM-65 Maverick' } },
  su25: { name: 'Su-25 Frogfoot', cls: 'air', fly: 'jet', scripted: true, factions: [], cost: 0, hp: 480, armor: 'air', speed: 125, turn: 1.7, sight: 6, r: 11,
          gun: { dmg: 28, wh: 'AT', range: 170, rounds: 26, gap: 0.035, splash: 11, walk: 96 },
          msl: { dmg: 165, rof: 0.5, range: 560, wh: 'HF', proj: 'missile', atgm: true, speed: 540, splash: 26, ammo: 4, perPass: 2, sound: 'missile', name: 'Kh-29L' } },
  bomber: { name: 'Bomber', cls: 'air', fly: 'jet', draw: 'cargo', scripted: true, factions: [], cost: 0, hp: 480, armor: 'air', speed: 164, sight: 5, r: 14 },
  mig: {
    name: 'MiG Fighter', cls: 'air', fly: 'jet', cat: 'jet', producer: 'airfield', factions: ['soviets'],
    cost: 1200, hp: 170, armor: 'air', speed: 164, turn: 2.3, sight: 6, r: 9,
    weapon: { dmg: 75, rof: 0.45, range: 130, wh: 'HE', proj: 'missile', ammo: 2 },
    weapon2: { dmg: 60, rof: 0.5, range: 160, wh: 'HE', proj: 'missile', air: true, ammo: 2 },
    gun: { dmg: 12, wh: 'SA', range: 110, runs: 3, rounds: 14, gap: 0.045, splash: 9, walk: 70 }, flares: 2,
  },
};

// w/h in cells. power: + produces, - consumes. exit: units leave from (or trucks dock at) the cell below the middle.
const BUILD_DEFS = {
  cy:       { name: 'Construction Yard', w: 3, h: 3, hp: 2500, power: 0,   cost: 2500, req: [], factions: [], sight: 6 },
  power:    { name: 'Power Plant',  w: 2, h: 2, hp: 400,  power: 100, cost: 300,  req: ['cy'],       factions: ['allies', 'soviets'] },
  apower:   { name: 'Advanced Power Plant', w: 3, h: 3, hp: 700, power: 200, cost: 500, req: ['factory'], factions: ['allies', 'soviets'] },
  // Deployed from a Mobile Outpost; cannot be built from the sidebar. Lets its side build further around it.
  outpost:  { name: 'Outpost', w: 2, h: 2, hp: 600, power: 0, cost: 1000, req: [], factions: [], sight: 6, buildRadius: 8 },
  refinery: { name: 'Ore Refinery', w: 3, h: 2, hp: 900,  power: -40, cost: 2000, req: ['power'],    factions: ['allies', 'soviets'], exit: true },
  barracks: { name: 'Barracks',     w: 2, h: 2, hp: 500,  power: -20, cost: 300,  req: ['power'],    factions: ['allies', 'soviets'], exit: true },
  factory:  { name: 'War Factory',  w: 3, h: 2, hp: 1000, power: -30, cost: 2000, req: ['refinery'], factions: ['allies', 'soviets'], exit: true },
  // Four landing pads in one base (the type stays 'helipad' so the computer and saves keep working).
  helipad:  { name: 'Helicopter Base', w: 4, h: 4, hp: 800, power: -20, cost: 3000, req: ['factory'], factions: ['allies', 'soviets'] },
  // Repairs ground vehicles one at a time on its pad, the open cell in front of it, for credits.
  depot:    { name: 'Service Depot', w: 3, h: 2, hp: 800, power: -30, cost: 1200, req: ['factory'], factions: ['allies', 'soviets'], exit: true, depot: true },
  dome:     { name: 'Radar Dome',   w: 2, h: 2, hp: 1000, power: -40, cost: 1000, req: ['refinery'], factions: ['allies', 'soviets'], sight: 10 },
  airfield: { name: 'Airfield',     w: 4, h: 3, hp: 500,  power: -30, cost: 1000, req: ['dome'],     factions: ['allies', 'soviets'] },
  // Unlocks each side's top-tier units: the Mammoth Tank (Soviets), Artillery and the Attack Helicopter (Allies),
  // and researches UPGRADES (below).
  tech:     { name: 'Tech Center',  w: 3, h: 3, hp: 1000, power: -100, cost: 1500, req: ['dome'],    factions: ['allies', 'soviets'], sight: 5 },
  turret:   { name: 'Gun Turret',   w: 1, h: 1, hp: 450,  power: -40, cost: 600,  req: ['barracks'], factions: ['allies'], defense: true,
              weapon: { dmg: 40, rof: 1.4, range: 165, wh: 'AP', proj: 'shell', needsPower: true } },
  aagun:    { name: 'AA Gun',       w: 1, h: 1, hp: 400,  power: -50, cost: 800,  req: ['barracks'], factions: ['allies'], defense: true, antiAir: true,
              weapon: { dmg: 22, rof: 0.35, range: 195, wh: 'FLAK', proj: 'flak', air: true, ground: false, needsPower: true } },
  tesla:    { name: 'Tesla Coil',   w: 1, h: 2, hp: 450,  power: -100, cost: 1200, req: ['barracks'], factions: ['soviets'], defense: true,
              weapon: { dmg: 100, rof: 2.6, range: 190, wh: 'TESLA', proj: 'tesla', needsPower: true } },
  pillbox:  { name: 'Pillbox',      w: 1, h: 1, hp: 400,  power: -15, cost: 400,  req: ['barracks'], factions: ['allies'], defense: true, camo: true,
              weapon: { dmg: 9, rof: 1.2, range: 145, wh: 'SA', proj: 'bullet', burst: 5, gap: 0.08, sound: 'pillbox' } },   // its own gun sound
  ftur:     { name: 'Flame Tower',  w: 1, h: 1, hp: 400,  power: -20, cost: 600,  req: ['barracks'], factions: ['soviets'], defense: true,
              weapon: { dmg: 40, rof: 2.0, range: 130, wh: 'FIRE', proj: 'fireball', burst: 2, gap: 0.3, splash: 18,
                        jet: { dps: 10, width: 7 } } },   // jet: the stream of fire burns what stands in it between shots (world.js flameBurn)
  sam:      { name: 'SAM Site',     w: 2, h: 1, hp: 400,  power: -20, cost: 750,  req: ['barracks'], factions: ['soviets'], defense: true, antiAir: true,
              weapon: { dmg: 50, rof: 1.3, range: 195, wh: 'HE', proj: 'missile', air: true, ground: false, needsPower: true } },
};

// Airfield support powers: each recharges (in seconds) while its side owns an Airfield,
// at half speed on low power, then waits until it is called in on a target.
const POWERS = {
  spy:  { name: 'Spy Plane',    charge: 60,  ready: 'Spy plane ready',   reveal: 10 },
  para: { name: 'Paratroopers', charge: 150, ready: 'Paratroopers ready',
          squad: { allies: ['rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rocket', 'rocket', 'rocket'],
                   soviets: ['rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'grenadier', 'grenadier', 'grenadier', 'rocket', 'rocket'] } },
  bomb: { name: 'Bombing Run',  charge: 200, ready: 'Bombing run ready', bomb: { dmg: 90, wh: 'HE', splash: 26 }, bombs: 10 },
  // Close air support (Tech Center upgrade cas1, then cas2 / cas3 for 2 or 3 planes): A-10 Warthogs (Allies) or Su-25 Frogfoots (Soviets) fly in,
  // fire homing missiles at vehicles in the area (r px round the target), then make gun runs with their anti-tank cannon; `passes` runs each.
  cas:  { name: 'Close Air Support', charge: 240, ready: 'Air support ready', upgrade: 'cas1', r: 225, passes: 2 },
};
// The power's plane by faction, and how many fly in (the highest close air support tier researched).
const CAS_PLANE = { allies: 'a10', soviets: 'su25' };

// `ai`: how the computer attacks and defends.
//   wave / big: size ranges of a normal wave and of a big push, bigChance: share of big pushes
//   firstWave / bigFrom / waveGap: seconds before the first attack wave and the first big push, and the
//   least time between waves
//   targets: 'cy' (the Construction Yard), 'mixed' or 'weak' (least-defended valuable buildings)
//   strike: Airfield powers held back for big pushes; defMax: ground defences; aa / aaMax: AA
//   sites at first and once the enemy flies aircraft; guard: also defends Outposts / outlying refineries
//   (outpostGuns: guns it keeps at each Outpost)
//   adapt: answers enemy aircraft (more anti-air units, fighters, AA beside its economy), with
//   homeGuard anti-air soldiers kept at home and interceptors (fighters kept back to defend)
//   queue: units it keeps queued per Barracks / War Factory
//   approach: share of planner waves that first gather at a point off the target on a randomly chosen side
//   (aiApproachSpots: reachable, out of gun range, avoiding the sides used lately), then close in
//   gap: the planner's random wait between attacks (seconds): mostly `short`, a `long` lull with `chance`
//   planner: squad planner (Normal and Hard): after it has found the enemy base (and firstWave has passed)
//   each attack comes at a random time, AI_GAP seconds from the last; squads that are clearly losing pull
//   back, and squads on the home half no longer get recalled by defendBase but join a defence the planner
//   judges short-handed (aiSquads)
//   pincer: share of waves (6 units or more) that split in two, gather on either side of the target
//   and close in together (aiPincer); counter: builds against what it has seen of the enemy army and
//   defences (aiCounter: anti-armour, anti-infantry, more artillery against a fortified base)
//   econ: fast opening (a second refinery straight after the Barracks), how many refineries and
//   Ore Trucks it aims for, and whether a missing truck is paid for before more army
//   expand: Mobile Outposts only go to ore fields at least this many cells from its start (past its
//   own base fields) and deploy at the field's edge; 0 keeps the old rule (any field 15 cells from
//   its buildings, deployed a few cells short)
const DIFFICULTY = {
  easy:   { label: 'Easy',   income: 0.7,  speed: 0.8,  credits: 10000,
    ai: { wave: [4, 7], big: null, bigChance: 0,
      firstWave: 720, bigFrom: 0, waveGap: 90, targets: 'cy', strike: [], defMax: 4, aa: 1, aaMax: 1, guard: [], expand: 0, armyWorth: 28000,
      pincer: 0, counter: false, adapt: false, homeGuard: 0, interceptors: 0, queue: 2, planner: false,
      econ: { fast: false, refineries: 3, trucks: 5, truckFirst: false } } },
  normal: { label: 'Normal', income: 1.0,  speed: 1.0,  credits: 10000,
    ai: { wave: [10, 16], big: [16, 22], bigChance: 0.3,
      firstWave: 720, bigFrom: 720, waveGap: 270, targets: 'weak', strike: ['para', 'bomb'], defMax: 6, aa: 1, aaMax: 3, guard: ['outpost'], outpostGuns: 1, expand: 24, armyWorth: 45000, armyUnits: 100,
      pincer: 0.5, counter: true, adapt: true, homeGuard: 3, interceptors: 1, queue: 3, planner: true, approach: 1, gap: { short: [90, 450], long: [450, 900], chance: 0.2 },
      econ: { fast: true, refineries: 3, trucks: 6, truckFirst: true } } },
  hard:   { label: 'Hard',   income: 1.35, speed: 1.25, credits: 12000,
    ai: { wave: [6, 12], big: [12, 16], bigChance: 0.35,
      firstWave: 540, bigFrom: 0, waveGap: 0, targets: 'weak', strike: ['para', 'bomb'], defMax: 8, aa: 2, aaMax: 5, guard: ['outpost', 'refinery'], outpostGuns: 2, expand: 24, armyWorth: 28000,
      pincer: 0.6, counter: true, adapt: true, homeGuard: 5, interceptors: 2, queue: 3, planner: true, approach: 1, gap: { short: [70, 270], long: [270, 540], chance: 0.2 },
      econ: { fast: true, refineries: 5, trucks: 10, truckFirst: true } } },
};

// Build queues: one each for structures, infantry, vehicles, helicopters (Helipad) and jets (Airfield).
const CATEGORIES = ['structure', 'defense', 'infantry', 'vehicle', 'heli', 'jet'];

// Air Assault (sidebar, with a transport helicopter): see world.js commandAirAssault.
const ASSAULT = { name: 'Air Assault' };
// Transport helicopters ON HOLD (owner, 2026-11-17): off, the Chinook and Halo cannot be built by anyone (so no Air Assault either),
// the computer flies no air assaults (ai.js aiOf drops `lift`) and the Field Manual leaves them out. setTransports(true) turns
// them back on (the tests transport.js and ai-lift.js do); to release them, make the line below setTransports(true).
let TRANSPORTS = false;
function setTransports(on) {
  TRANSPORTS = !!on;
  UNIT_DEFS.chinook.factions = TRANSPORTS ? ['allies'] : [];
  UNIT_DEFS.halo.factions = TRANSPORTS ? ['soviets'] : [];
}
setTransports(false);
function defOf(type) { return UNIT_DEFS[type] || BUILD_DEFS[type]; }
// Tech Center upgrades: researched at a Tech Center (UPGRADES on its selection bar), one at a time per side, paid for as the
// research goes like production. Kept for the rest of the battle once finished, even if every Tech Center is lost; research
// under way when the side's last Tech Center goes is cancelled and its money given back. An upgrade either unlocks a unit (that
// unit's `upgrade` names it) or, later, changes existing units' stats.
const UPGRADES = {
  comanche: { name: 'Comanche program', unlocks: 'comanche', cost: 1500, time: 60, factions: ['allies'],
              desc: 'Unlocks the Comanche at the Helicopter Base: a stand-off helicopter with a chain gun for infantry and light vehicles, and four anti-tank missiles fired from its side bays.' },
  teslatank: { name: 'Tesla program', unlocks: 'ttank', cost: 1500, time: 60, factions: ['soviets'],
               desc: 'Unlocks the Tesla Tank at the War Factory: a tank carrying a Tesla coil. Its bolt kills infantry outright and hurts vehicles badly at short range; it cannot hit aircraft.' },
  sniper: { name: 'Sniper program', unlocks: 'sniper', cost: 1500, time: 60, factions: ['allies'],
            desc: 'Unlocks the Sniper at the Barracks: a long scoped rifle that kills most soldiers with one shot from further than any other infantry can reach. Useless against vehicles and buildings. No more than 5 at a time.' },
  para2: { name: 'Airborne division', cost: 1500, time: 60, factions: ['allies', 'soviets'],
           desc: 'Paratroopers come in two transport planes instead of one: twenty soldiers a drop.' },
  // Close air support, three tiers in order (`needs` the tier before, `req` a finished building besides the Tech Center).
  cas1: { name: 'Close air support I', cost: 2000, time: 60, factions: ['allies', 'soviets'], req: 'airfield',
          desc: { allies: 'Adds the Close Air Support power at the Airfield: an A-10 Warthog flies in on the area you pick, fires homing missiles at vehicles there and strafes them with its 30 mm anti-tank cannon. Recharges in 240 s.',
                  soviets: 'Adds the Close Air Support power at the Airfield: an Su-25 Frogfoot flies in on the area you pick, fires homing missiles at vehicles there and strafes them with its 30 mm anti-tank cannon. Recharges in 240 s.' } },
  cas2: { name: 'Close air support II', cost: 3000, time: 90, factions: ['allies', 'soviets'], req: 'airfield', needs: 'cas1',
          desc: 'Close Air Support sends two planes together.' },
  cas3: { name: 'Close air support III', cost: 4000, time: 120, factions: ['allies', 'soviets'], req: 'airfield', needs: 'cas2',
          desc: 'Close Air Support sends three planes together.' },
};
for (const k in UPGRADES) UPGRADES[k].id = k;

function buildTime(def) { return Math.max(3, def.cost / 1000 * 24); }
// Defensive structures build in their own slot ('defense'), beside the main structure queue, like walls: a power plant and a Pillbox can go up together.
function catOf(type) { return UNIT_DEFS[type] ? UNIT_DEFS[type].cat : BUILD_DEFS[type] && BUILD_DEFS[type].defense ? 'defense' : 'structure'; }
const isBuildCat = (cat) => cat === 'structure' || cat === 'defense';

for (const [k, d] of Object.entries(UNIT_DEFS)) d.type = k;
for (const [k, d] of Object.entries(BUILD_DEFS)) d.type = k;
