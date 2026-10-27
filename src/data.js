'use strict';
// Game data: map size, factions, units, structures and damage tables.

const CELL = 24;            // world pixels per map cell
const MAP = 112;            // map is MAP x MAP cells (sized for 2v2, after A Path Beyond)
const WORLD = MAP * CELL;
const NCELLS = MAP * MAP;
const ORE_MAX = 250;        // credits a single ore cell can hold

const FACTIONS = {
  allies: {
    name: 'Allies',
    pal: { main: '#5b7fb0', light: '#97b4da', dark: '#36547c', deep: '#1d2f48' },
  },
  soviets: {
    name: 'Soviets',
    pal: { main: '#ad3128', light: '#dd6c5c', dark: '#781d18', deep: '#45100c' },
  },
};

// Damage multiplier by warhead against armor class.
const WARHEADS = {
  SA:    { inf: 1.0, light: 0.55, heavy: 0.25, bld: 0.3, air: 0.6 },   // small arms
  AP:    { inf: 0.3, light: 0.9,  heavy: 1.0,  bld: 0.7, air: 1.0 },   // tank shells
  HE:    { inf: 0.5, light: 1.0,  heavy: 0.8,  bld: 0.9, air: 1.0 },   // rockets and missiles
  FLAK:  { inf: 0,   light: 0,    heavy: 0,    bld: 0,   air: 1.0 },
  TESLA: { inf: 1.6, light: 1.0,  heavy: 0.9,  bld: 0.6, air: 0 },
  FIRE:  { inf: 1.3, light: 0.6,  heavy: 0.3,  bld: 0.7, air: 0 },   // flame tower
  ART:   { inf: 0.9, light: 0.9,  heavy: 0.85, bld: 0.75, air: 0 },  // artillery shells
};

// cls: inf | veh | air.  cat: which sidebar tab builds it.  speed in px/s, sight in cells.
const UNIT_DEFS = {
  rifle: {
    name: 'Rifle Infantry', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['allies', 'soviets'],
    cost: 100, hp: 50, armor: 'inf', speed: 26, sight: 4, r: 5,
    weapon: { dmg: 7, rof: 1.3, range: 70, wh: 'SA', proj: 'bullet', burst: 3, gap: 0.11 },
  },
  grenadier: {
    name: 'Grenadier', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['soviets'],
    cost: 160, hp: 50, armor: 'inf', speed: 24, sight: 5, r: 5,
    weapon: { dmg: 42, rof: 2.0, range: 100, wh: 'HE', proj: 'grenade', splash: 22 },
  },
  // Bails out of a downed aircraft. Cannot be built.
  pilot: {
    name: 'Pilot', cls: 'inf', cat: 'infantry', factions: [], cost: 0, hp: 35, armor: 'inf', speed: 27, sight: 4, r: 5,
    weapon: { dmg: 5, rof: 1.1, range: 60, wh: 'SA', proj: 'bullet' },
  },
  rocket: {
    name: 'Rocket Soldier', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['allies', 'soviets'],
    cost: 300, hp: 45, armor: 'inf', speed: 24, sight: 5, r: 5,
    weapon: { dmg: 45, rof: 2.2, range: 120, wh: 'HE', proj: 'rocket', air: true },
  },
  ranger: {
    name: 'Ranger', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies'], draw: 'jeep',
    cost: 600, hp: 150, armor: 'light', speed: 80, turn: 5, sight: 6, r: 7, size: { len: 15, wid: 10 },
    weapon: { dmg: 6, rof: 0.9, range: 96, wh: 'SA', proj: 'bullet', air: true, burst: 4, gap: 0.08 },
  },
  ltank: {
    name: 'Light Tank', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies'], draw: 'tank',
    cost: 700, hp: 300, armor: 'heavy', speed: 56, turn: 3.2, sight: 5, r: 8, size: { len: 17, wid: 13, tur: 4.5, barrel: 10 },
    weapon: { dmg: 30, rof: 1.3, range: 108, wh: 'AP', proj: 'shell' },
  },
  mtank: {
    name: 'Medium Tank', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies'], draw: 'tank',
    cost: 800, hp: 400, armor: 'heavy', speed: 48, turn: 2.8, sight: 5, r: 9, size: { len: 20, wid: 15, tur: 5.5, barrel: 12 },
    weapon: { dmg: 40, rof: 1.5, range: 114, wh: 'AP', proj: 'shell' },
  },
  htank: {
    name: 'Heavy Tank', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['soviets'], draw: 'tank',
    cost: 950, hp: 550, armor: 'heavy', speed: 42, turn: 2.5, sight: 5, r: 10, size: { len: 22, wid: 16, tur: 6, barrel: 12, twin: true },
    weapon: { dmg: 30, rof: 1.7, range: 114, wh: 'AP', proj: 'shell', twin: true },
  },
  mammoth: {
    name: 'Mammoth Tank', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['soviets'], draw: 'tank',
    cost: 1700, hp: 950, armor: 'heavy', speed: 30, turn: 2, sight: 6, r: 12, size: { len: 26, wid: 20, tur: 7.5, barrel: 14, twin: true, pods: true },
    weapon: { dmg: 45, rof: 1.9, range: 118, wh: 'AP', proj: 'shell', twin: true },
    weapon2: { dmg: 35, rof: 2.6, range: 140, wh: 'HE', proj: 'rocket', air: true },
  },
  // Long-range support, built once a Radar Dome stands. Neither has a turret: the whole vehicle
  // turns to aim, and both lob their rounds in a high arc, so they can miss a moving target.
  arty: {
    name: 'Artillery', cls: 'veh', cat: 'vehicle', producer: 'factory', req: ['dome'], factions: ['allies'], draw: 'arty', fixed: true,
    cost: 600, hp: 120, armor: 'light', speed: 36, turn: 2, sight: 5, r: 9, size: { len: 20, wid: 13, tur: 0, barrel: 15 },
    weapon: { dmg: 110, rof: 4, range: 288, wh: 'ART', proj: 'artyshell', splash: 22, spread: 16 },
  },
  v2rl: {
    name: 'V2 Rocket Launcher', cls: 'veh', cat: 'vehicle', producer: 'factory', req: ['dome'], factions: ['soviets'], draw: 'v2', fixed: true,
    cost: 800, hp: 150, armor: 'light', speed: 40, turn: 2, sight: 5, r: 10, size: { len: 22, wid: 12, tur: 0, barrel: 12 },
    weapon: { dmg: 240, rof: 7, range: 312, wh: 'HE', proj: 'v2', splash: 30, spread: 12 },
  },
  harv: {
    name: 'Ore Truck', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies', 'soviets'], draw: 'harv',
    cost: 1400, hp: 600, armor: 'heavy', speed: 50, turn: 3, sight: 4, r: 10, size: { len: 24, wid: 15 },
    harvester: true, capacity: 1000,
  },
  // Drives out to a distant ore field and deploys into an Outpost, which lets its side build there.
  fob: {
    name: 'Mobile Outpost', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies', 'soviets'], draw: 'fob',
    cost: 1000, hp: 500, armor: 'heavy', speed: 40, turn: 2.5, sight: 5, r: 10, size: { len: 22, wid: 14 }, deploys: 'outpost',
  },
  heli: {
    name: 'Attack Helicopter', cls: 'air', fly: 'heli', cat: 'aircraft', producer: 'helipad', factions: ['allies'],
    cost: 1200, hp: 220, armor: 'air', speed: 115, sight: 6, r: 9,
    weapon: { dmg: 55, rof: 0.9, range: 120, wh: 'HE', proj: 'rocket', ammo: 8 },
  },
  hind: {
    name: 'Hind Gunship', cls: 'air', fly: 'heli', cat: 'aircraft', producer: 'helipad', factions: ['soviets'],
    cost: 1200, hp: 240, armor: 'air', speed: 105, sight: 6, r: 10,
    weapon: { dmg: 13, rof: 1.0, range: 100, wh: 'SA', proj: 'bullet', ammo: 6, burst: 5, gap: 0.07 },
  },
  // Jets carry ground-attack missiles (weapon), air-to-air missiles (weapon2) and bombs, and
  // drop flares that can pull incoming missiles and rockets off course.
  jet: {
    name: 'Strike Jet', cls: 'air', fly: 'jet', cat: 'aircraft', producer: 'airfield', factions: ['allies'],
    cost: 1100, hp: 140, armor: 'air', speed: 210, turn: 2.4, sight: 6, r: 9,
    weapon: { dmg: 80, rof: 0.45, range: 130, wh: 'HE', proj: 'missile', ammo: 2 },
    weapon2: { dmg: 60, rof: 0.5, range: 200, wh: 'HE', proj: 'missile', air: true, ground: false, ammo: 2 },
    bombs: 4, bomb: { dmg: 55, wh: 'HE', splash: 20 }, flares: 2,
  },
  // Support aircraft called in from the Airfield (see POWERS); they fly a set route and cannot be ordered.
  spyplane: { name: 'Spy Plane', cls: 'air', fly: 'jet', scripted: true, factions: [], cost: 0, hp: 150, armor: 'air', speed: 300, sight: 8, r: 9 },
  transport: { name: 'Transport', cls: 'air', fly: 'jet', draw: 'cargo', scripted: true, factions: [], cost: 0, hp: 420, armor: 'air', speed: 190, sight: 5, r: 14 },
  bomber: { name: 'Bomber', cls: 'air', fly: 'jet', draw: 'cargo', scripted: true, factions: [], cost: 0, hp: 480, armor: 'air', speed: 200, sight: 5, r: 14 },
  mig: {
    name: 'MiG Fighter', cls: 'air', fly: 'jet', cat: 'aircraft', producer: 'airfield', factions: ['soviets'],
    cost: 1200, hp: 170, armor: 'air', speed: 225, turn: 2.3, sight: 6, r: 9,
    weapon: { dmg: 75, rof: 0.45, range: 130, wh: 'HE', proj: 'missile', ammo: 2 },
    weapon2: { dmg: 60, rof: 0.5, range: 160, wh: 'HE', proj: 'missile', air: true, ground: false, ammo: 2 },
    bombs: 4, bomb: { dmg: 60, wh: 'HE', splash: 20 }, flares: 2,
  },
};

// w/h in cells. power: + produces, - consumes. exit: units leave from (or trucks dock at) the cell below the middle.
const BUILD_DEFS = {
  cy:       { name: 'Construction Yard', w: 3, h: 3, hp: 1500, power: 0,   cost: 2500, req: [], factions: [], sight: 6 },
  power:    { name: 'Power Plant',  w: 2, h: 2, hp: 400,  power: 100, cost: 300,  req: ['cy'],       factions: ['allies', 'soviets'] },
  apower:   { name: 'Advanced Power Plant', w: 3, h: 3, hp: 700, power: 200, cost: 500, req: ['factory'], factions: ['allies', 'soviets'] },
  // Deployed from a Mobile Outpost; cannot be built from the sidebar. Lets its side build further around it.
  outpost:  { name: 'Outpost', w: 2, h: 2, hp: 600, power: 0, cost: 1000, req: [], factions: [], sight: 6, buildRadius: 8 },
  refinery: { name: 'Ore Refinery', w: 3, h: 2, hp: 900,  power: -40, cost: 2000, req: ['power'],    factions: ['allies', 'soviets'], exit: true },
  barracks: { name: 'Barracks',     w: 2, h: 2, hp: 500,  power: -20, cost: 300,  req: ['power'],    factions: ['allies', 'soviets'], exit: true },
  factory:  { name: 'War Factory',  w: 3, h: 2, hp: 1000, power: -30, cost: 2000, req: ['refinery'], factions: ['allies', 'soviets'], exit: true },
  helipad:  { name: 'Helipad',      w: 2, h: 2, hp: 400,  power: -10, cost: 1500, req: ['factory'],  factions: ['allies', 'soviets'] },
  dome:     { name: 'Radar Dome',   w: 2, h: 2, hp: 1000, power: -40, cost: 1000, req: ['refinery'], factions: ['allies', 'soviets'], sight: 10 },
  airfield: { name: 'Airfield',     w: 3, h: 2, hp: 500,  power: -30, cost: 1000, req: ['factory'],  factions: ['allies', 'soviets'] },
  turret:   { name: 'Gun Turret',   w: 1, h: 1, hp: 450,  power: -40, cost: 600,  req: ['barracks'], factions: ['allies'], defense: true,
              weapon: { dmg: 40, rof: 1.4, range: 130, wh: 'AP', proj: 'shell' } },
  aagun:    { name: 'AA Gun',       w: 1, h: 1, hp: 400,  power: -50, cost: 800,  req: ['barracks'], factions: ['allies'], defense: true, antiAir: true,
              weapon: { dmg: 22, rof: 0.35, range: 170, wh: 'FLAK', proj: 'flak', air: true, ground: false } },
  tesla:    { name: 'Tesla Coil',   w: 1, h: 2, hp: 450,  power: -100, cost: 1200, req: ['barracks'], factions: ['soviets'], defense: true,
              weapon: { dmg: 100, rof: 2.6, range: 150, wh: 'TESLA', proj: 'tesla', needsPower: true } },
  pillbox:  { name: 'Pillbox',      w: 1, h: 1, hp: 400,  power: -15, cost: 400,  req: ['barracks'], factions: ['allies'], defense: true,
              weapon: { dmg: 9, rof: 1.2, range: 115, wh: 'SA', proj: 'bullet', burst: 5, gap: 0.08 } },
  ftur:     { name: 'Flame Tower',  w: 1, h: 1, hp: 400,  power: -20, cost: 600,  req: ['barracks'], factions: ['soviets'], defense: true,
              weapon: { dmg: 40, rof: 2.0, range: 105, wh: 'FIRE', proj: 'fireball', burst: 2, gap: 0.3, splash: 18 } },
  sam:      { name: 'SAM Site',     w: 2, h: 1, hp: 400,  power: -20, cost: 750,  req: ['barracks'], factions: ['soviets'], defense: true, antiAir: true,
              weapon: { dmg: 50, rof: 1.3, range: 180, wh: 'HE', proj: 'missile', air: true, ground: false } },
};

// Airfield support powers: each recharges (in seconds) while its side owns an Airfield,
// at half speed on low power, then waits until it is called in on a target.
const POWERS = {
  spy:  { name: 'Spy Plane',    charge: 60,  ready: 'Spy plane ready',   reveal: 10 },
  para: { name: 'Paratroopers', charge: 150, ready: 'Paratroopers ready',
          squad: { allies: ['rifle', 'rifle', 'rifle', 'rifle', 'rocket'], soviets: ['rifle', 'rifle', 'rifle', 'grenadier', 'grenadier'] } },
  bomb: { name: 'Bombing Run',  charge: 200, ready: 'Bombing run ready', bomb: { dmg: 90, wh: 'HE', splash: 26 }, bombs: 10 },
};

// `ai`: how the computer attacks and defends.
//   wave / big: size ranges of a normal wave and of a big push, bigChance: share of big pushes
//   raidFrom / raidGap: seconds before the first raid on Ore Trucks or outlying sites, and between raids
//   firstWave / bigFrom / waveGap: seconds before the first attack wave and the first big push, and the
//   least time between waves
//   targets: 'cy' (the Construction Yard), 'mixed' or 'weak' (least-defended valuable buildings)
//   strike: Airfield powers held back for big pushes; defMax: ground defences; aa / aaMax: AA
//   sites at first and once the enemy flies aircraft; guard: also defends Outposts / outlying refineries
//   adapt: answers enemy aircraft (more anti-air units, fighters, AA beside its economy), with
//   homeGuard anti-air soldiers kept at home and interceptors (fighters kept back to defend)
//   queue: units it keeps queued per Barracks / War Factory
//   econ: fast opening (a second refinery straight after the Barracks), how many refineries and
//   Ore Trucks it aims for, and whether a missing truck is paid for before more army
const DIFFICULTY = {
  easy:   { label: 'Easy',   income: 0.7,  speed: 0.8,  credits: 5000,
    ai: { wave: [4, 7], big: null, bigChance: 0,
      raidFrom: 360, raidGap: [200, 320], firstWave: 270, bigFrom: 0, waveGap: 60, targets: 'cy', strike: [], defMax: 4, aa: 1, aaMax: 1, guard: [],
      adapt: false, homeGuard: 0, interceptors: 0, queue: 2,
      econ: { fast: false, refineries: 3, trucks: 5, truckFirst: false } } },
  normal: { label: 'Normal', income: 1.0,  speed: 1.0,  credits: 5000,
    ai: { wave: [5, 10], big: [10, 13], bigChance: 0.25,
      raidFrom: 360, raidGap: [120, 200], firstWave: 210, bigFrom: 480, waveGap: 45, targets: 'mixed', strike: ['para'], defMax: 8, aa: 1, aaMax: 3, guard: ['outpost'],
      adapt: true, homeGuard: 3, interceptors: 1, queue: 3,
      econ: { fast: false, refineries: 3, trucks: 6, truckFirst: true } } },
  hard:   { label: 'Hard',   income: 1.35, speed: 1.25, credits: 7000,
    ai: { wave: [6, 12], big: [12, 16], bigChance: 0.35,
      raidFrom: 180, raidGap: [75, 130], firstWave: 0, bigFrom: 0, waveGap: 0, targets: 'weak', strike: ['para', 'bomb'], defMax: 12, aa: 2, aaMax: 5, guard: ['outpost', 'refinery'],
      adapt: true, homeGuard: 5, interceptors: 2, queue: 3,
      econ: { fast: true, refineries: 5, trucks: 10, truckFirst: true } } },
};

const CATEGORIES = ['structure', 'infantry', 'vehicle', 'aircraft'];

function defOf(type) { return UNIT_DEFS[type] || BUILD_DEFS[type]; }
function buildTime(def) { return Math.max(3, def.cost / 1000 * 12); }
function catOf(type) { return UNIT_DEFS[type] ? UNIT_DEFS[type].cat : 'structure'; }

for (const [k, d] of Object.entries(UNIT_DEFS)) d.type = k;
for (const [k, d] of Object.entries(BUILD_DEFS)) d.type = k;
