'use strict';
// Game data: map size, factions, units, structures and damage tables.

const CELL = 24;            // world pixels per map cell
const MAP = 88;             // map is MAP x MAP cells
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
};

// cls: inf | veh | air.  cat: which sidebar tab builds it.  speed in px/s, sight in cells.
const UNIT_DEFS = {
  rifle: {
    name: 'Rifle Infantry', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['allies', 'soviets'],
    cost: 100, hp: 50, armor: 'inf', speed: 26, sight: 4, r: 4,
    weapon: { dmg: 14, rof: 0.9, range: 70, wh: 'SA', proj: 'bullet' },
  },
  rocket: {
    name: 'Rocket Soldier', cls: 'inf', cat: 'infantry', producer: 'barracks', factions: ['allies', 'soviets'],
    cost: 300, hp: 45, armor: 'inf', speed: 24, sight: 5, r: 4,
    weapon: { dmg: 45, rof: 2.2, range: 120, wh: 'HE', proj: 'rocket', air: true },
  },
  ranger: {
    name: 'Ranger', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies'], draw: 'jeep',
    cost: 600, hp: 150, armor: 'light', speed: 80, turn: 5, sight: 6, r: 7, size: { len: 15, wid: 10 },
    weapon: { dmg: 14, rof: 0.5, range: 96, wh: 'SA', proj: 'bullet', air: true },
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
  harv: {
    name: 'Ore Truck', cls: 'veh', cat: 'vehicle', producer: 'factory', factions: ['allies', 'soviets'], draw: 'harv',
    cost: 1400, hp: 600, armor: 'heavy', speed: 50, turn: 3, sight: 4, r: 10, size: { len: 24, wid: 15 },
    harvester: true, capacity: 1000,
  },
  heli: {
    name: 'Attack Helicopter', cls: 'air', fly: 'heli', cat: 'aircraft', producer: 'helipad', factions: ['allies'],
    cost: 1200, hp: 220, armor: 'air', speed: 115, sight: 6, r: 9,
    weapon: { dmg: 55, rof: 0.9, range: 120, wh: 'HE', proj: 'rocket', ammo: 8 },
  },
  hind: {
    name: 'Hind Gunship', cls: 'air', fly: 'heli', cat: 'aircraft', producer: 'helipad', factions: ['soviets'],
    cost: 1200, hp: 240, armor: 'air', speed: 105, sight: 6, r: 10,
    weapon: { dmg: 14, rof: 0.25, range: 100, wh: 'SA', proj: 'bullet', ammo: 24 },
  },
  jet: {
    name: 'Strike Jet', cls: 'air', fly: 'jet', cat: 'aircraft', producer: 'airfield', factions: ['allies'],
    cost: 1100, hp: 130, armor: 'air', speed: 210, turn: 2.4, sight: 6, r: 9,
    weapon: { dmg: 90, rof: 0.45, range: 130, wh: 'HE', proj: 'missile', ammo: 2 },
  },
  mig: {
    name: 'MiG Fighter', cls: 'air', fly: 'jet', cat: 'aircraft', producer: 'airfield', factions: ['soviets'],
    cost: 1200, hp: 150, armor: 'air', speed: 225, turn: 2.3, sight: 6, r: 9,
    weapon: { dmg: 80, rof: 0.45, range: 130, wh: 'HE', proj: 'missile', ammo: 3 },
  },
};

// w/h in cells. power: + produces, - consumes. exit: units leave from (or trucks dock at) the cell below the middle.
const BUILD_DEFS = {
  cy:       { name: 'Construction Yard', w: 3, h: 3, hp: 1500, power: 0,   cost: 2500, req: [], factions: [], sight: 6 },
  power:    { name: 'Power Plant',  w: 2, h: 2, hp: 400,  power: 100, cost: 300,  req: ['cy'],       factions: ['allies', 'soviets'] },
  refinery: { name: 'Ore Refinery', w: 3, h: 2, hp: 900,  power: -40, cost: 2000, req: ['power'],    factions: ['allies', 'soviets'], exit: true },
  barracks: { name: 'Barracks',     w: 2, h: 2, hp: 500,  power: -20, cost: 300,  req: ['power'],    factions: ['allies', 'soviets'], exit: true },
  factory:  { name: 'War Factory',  w: 3, h: 2, hp: 1000, power: -30, cost: 2000, req: ['refinery'], factions: ['allies', 'soviets'], exit: true },
  helipad:  { name: 'Helipad',      w: 2, h: 2, hp: 400,  power: -10, cost: 1500, req: ['factory'],  factions: ['allies', 'soviets'] },
  airfield: { name: 'Airfield',     w: 3, h: 2, hp: 500,  power: -30, cost: 1000, req: ['factory'],  factions: ['allies', 'soviets'] },
  turret:   { name: 'Gun Turret',   w: 1, h: 1, hp: 450,  power: -40, cost: 600,  req: ['barracks'], factions: ['allies'], defense: true,
              weapon: { dmg: 40, rof: 1.4, range: 130, wh: 'AP', proj: 'shell' } },
  aagun:    { name: 'AA Gun',       w: 1, h: 1, hp: 400,  power: -50, cost: 800,  req: ['barracks'], factions: ['allies'], defense: true, antiAir: true,
              weapon: { dmg: 22, rof: 0.35, range: 170, wh: 'FLAK', proj: 'flak', air: true, ground: false } },
  tesla:    { name: 'Tesla Coil',   w: 1, h: 2, hp: 450,  power: -100, cost: 1200, req: ['barracks'], factions: ['soviets'], defense: true,
              weapon: { dmg: 100, rof: 2.6, range: 150, wh: 'TESLA', proj: 'tesla', needsPower: true } },
  sam:      { name: 'SAM Site',     w: 2, h: 1, hp: 400,  power: -20, cost: 750,  req: ['barracks'], factions: ['soviets'], defense: true, antiAir: true,
              weapon: { dmg: 50, rof: 1.3, range: 180, wh: 'HE', proj: 'missile', air: true, ground: false } },
};

const DIFFICULTY = {
  easy:   { label: 'Easy',   income: 0.7,  speed: 0.8,  credits: 5000 },
  normal: { label: 'Normal', income: 1.0,  speed: 1.0,  credits: 5000 },
  hard:   { label: 'Hard',   income: 1.35, speed: 1.25, credits: 7000 },
};

const CATEGORIES = ['structure', 'infantry', 'vehicle', 'aircraft'];

function defOf(type) { return UNIT_DEFS[type] || BUILD_DEFS[type]; }
function buildTime(def) { return Math.max(3, def.cost / 1000 * 12); }
function catOf(type) { return UNIT_DEFS[type] ? UNIT_DEFS[type].cat : 'structure'; }

for (const [k, d] of Object.entries(UNIT_DEFS)) d.type = k;
for (const [k, d] of Object.entries(BUILD_DEFS)) d.type = k;
