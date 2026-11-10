'use strict';
// Built-in bird species, as data (Birds.register): the herring gull, the brown pelican, the Atlantic puffin.
// ---------------- species: the herring gull ----------------
// Copy this to add another bird: change the look, flight, habitat and landing tastes (see DEFAULTS in birds/birds.js).
Birds.register({
  id: 'herring_gull', name: 'Herring gull', scale: [0.9, 1.1],
  habitat: { sea: 9, lake: 4, river: 4, pond: 2 },
  night: 'roost',
  flight: { speed: 9.5, flapHz: 2.8, stroke: 0.52, flapTime: [1, 3.5], glideTime: [2, 7], turn: 0.85, alt: [9, 31], radius: [16, 50], soar: true, followBoats: true },
  lands: { water: 0.5, ground: 0.2, prop: 0.25, tree: 0.06, boat: 0.55 },
  landEvery: 50, stay: [20, 100], shy: 9, floatZ: 0.035, space: 0.7, wary: 6,
  flocking: { every: 60, size: [3, 8], time: [20, 50], formation: { cluster: 3, v: 1, line: 1 }, spacing: 2.6, landTogether: 0.75 },
  voice: { pitch: [720, 900], every: [7, 30], volume: 0.07, range: 110,   // "kyow", and now and then the laughing long call
    notes: [1, 2], dur: [0.26, 0.34], gap: 0.12, rise: 1.25, riseAt: 0.25, fall: 0.75, wave: 'sawtooth', rasp: { rate: [38, 48], depth: 35 },
    band: { freq: 1400, q: 0.9 }, highpass: 380, series: { chance: 0.3, notes: [4, 8], first: 0.42, dur: 0.18, gap: 0.07, lift: 1.08 } },
  events: { landed: true },
  forage: { every: 90, from: [3, 25], minDepth: 0.3, lead: 1.5, target: 0.35, speed: [5, 9], accel: 4, tuck: false, twist: 0, splash: 8, ripple: 0.5, scare: 2, under: 0, after: null },   // a dip at the surface
  look: {
    body: [0.16, 0.068, 0.072], head: 0.044, bill: { len: 0.074, base: 0.012, hook: 0.009 },
    tail: { len: 0.14, root: 0.035, end: 0.062 }, wing: { span: 0.62, chord: 1, tipFrom: 0.48 }, legs: { len: 0.2 },
    colors: { mantle: [0.56, 0.6, 0.66], body: [0.93, 0.93, 0.91], head: [0.93, 0.93, 0.91], eye: [0.08, 0.07, 0.05], tail: [0.93, 0.93, 0.91],
      bill: [0.98, 0.8, 0.18], billSpot: [0.85, 0.16, 0.1], legs: [0.9, 0.62, 0.58],
      wingTop: [0.56, 0.6, 0.66], wingEdge: [0.76, 0.79, 0.82], wingTip: [0.07, 0.07, 0.08], mirror: [0.93, 0.93, 0.91],
      wingUnder: [0.93, 0.93, 0.91], wingUnderTip: [0.24, 0.24, 0.26] },
  },
});

// ---------------- species: the brown pelican ----------------
// Coastal, warm-water: glides in lines just over the waves on a few slow beats, plunge-dives for fish from up to ~15 m,
// floats high to swallow, perches on boats, rocks and stumps, begs when you land a fish. Quiet as an adult.
Birds.register({
  id: 'brown_pelican', name: 'Brown pelican', scale: [0.92, 1.08],
  climates: ['temperate', 'tropical'],
  habitat: { sea: 5 },
  night: 'roost',
  flight: { speed: 11, flapHz: 1.9, stroke: 0.42, flapTime: [0.8, 1.8], glideTime: [3, 9], turn: 0.6, alt: [1.6, 14], radius: [30, 80], soar: false, followBoats: false, clear: 1.3 },
  lands: { water: 0.5, ground: 0.15, prop: 0.4, tree: 0.03, boat: 0.4 },
  landEvery: 70, stay: [30, 150], shy: 11, floatZ: 0.07, space: 1.5, wary: 9,
  flocking: { every: 35, size: [3, 9], time: [25, 70], formation: { line: 4, v: 1, cluster: 0.5 }, spacing: 3.6, landTogether: 0.6 },
  forage: { every: 30, from: [5, 16], minDepth: 0.8, lead: 0.5, target: -0.25, speed: [6, 14], accel: 9, tuck: true, twist: -1.1, splash: 45, ripple: 1.3, scare: 4, under: 1.4, after: [4, 14] },   // a plunge-dive
  voice: null,
  events: { landed: true },
  look: {
    body: [0.3, 0.13, 0.13], head: 0.062, bill: { len: 0.32, base: 0.022, hook: 0.018, taper: 0.7, pouch: 1.25 },
    tail: { len: 0.11, root: 0.06, end: 0.085 }, wing: { span: 1.02, chord: 2.0, tipFrom: 0.55, shape: 'rounded' }, legs: { len: 0.27, feet: 1.9 },
    fly: { neck: [[0.27, 0.07, 0.075]], head: [0.33, 0.12], bill: -0.32 },                                   // head drawn back onto the shoulders
    rest: { neck: [[0.25, 0.07, 0.075], [0.31, 0.14, 0.06], [0.3, 0.21, 0.052], [0.26, 0.27, 0.05]], head: [0.3, 0.33], bill: -1.05 },   // the S-neck, bill down the chest
    colors: { mantle: [0.52, 0.5, 0.46], body: [0.33, 0.32, 0.3], head: [0.96, 0.93, 0.76], neck: [0.93, 0.91, 0.86], eye: [0.85, 0.85, 0.8], tail: [0.4, 0.38, 0.35],
      bill: [0.62, 0.56, 0.5], billTip: [0.86, 0.42, 0.22], pouch: [0.24, 0.25, 0.23], legs: [0.16, 0.16, 0.16],
      wingTop: [0.5, 0.48, 0.44], wingEdge: [0.34, 0.32, 0.3], wingTip: [0.1, 0.09, 0.09], wingUnder: [0.3, 0.29, 0.27], wingUnderTip: [0.12, 0.11, 0.11] },
  },
});

// ---------------- species: the Atlantic puffin ----------------
// Cold northern seas: whirring low and fast over the waves on short wings, rafts on the water, dives from the surface and
// swims down after small fish for 20 s or more, nests in burrows on the grassy tops of sea stacks (colony).
Birds.register({
  id: 'atlantic_puffin', name: 'Atlantic puffin', scale: [0.94, 1.06],
  climates: ['arctic', 'temperate'],
  habitat: { sea: 3 }, colony: 14,
  night: 'roost',
  flight: { speed: 14, flapHz: 7, stroke: 0.55, flapTime: [4, 10], glideTime: [0.2, 0.5], turn: 1.1, alt: [1.5, 9], radius: [18, 55], soar: false, followBoats: false, clear: 1 },
  lands: { water: 0.6, cliff: 0.9, ground: 0.03, prop: 0.12, tree: 0, boat: 0 },
  landEvery: 30, stay: [30, 140], shy: 7, floatZ: 0.03, space: 0.45, wary: 5,
  flocking: { every: 40, size: [3, 10], time: [15, 40], formation: { line: 2, cluster: 2 }, spacing: 1.3, landTogether: 0.8 },
  forage: { every: 25, from: [0.4, 2.5], minDepth: 2, lead: 0.4, target: -1.2, speed: [3, 6], accel: 6, tuck: true, twist: 0, splash: 6, ripple: 0.5, scare: 2, under: 20, after: [6, 20] },   // a surface dive and a long swim down
  voice: null,   // quiet at sea
  look: {
    body: [0.1, 0.055, 0.06], head: 0.038, bill: { len: 0.034, base: 0.021, hook: 0.004 },   // stout, big-headed; the deep triangular bill
    tail: { len: 0.04, root: 0.025, end: 0.03 }, wing: { span: 0.27, chord: 0.85, tipFrom: 0.5 }, legs: { len: 0.07 },
    colors: { mantle: [0.06, 0.06, 0.07], body: [0.95, 0.95, 0.93], head: [0.88, 0.88, 0.86], eye: [0.05, 0.05, 0.05], tail: [0.06, 0.06, 0.07],
      bill: [0.95, 0.45, 0.14], billTip: [0.86, 0.2, 0.1], legs: [0.98, 0.5, 0.15],
      wingTop: [0.07, 0.07, 0.08], wingEdge: [0.1, 0.1, 0.11], wingTip: [0.05, 0.05, 0.06], wingUnder: [0.3, 0.3, 0.32], wingUnderTip: [0.12, 0.12, 0.13] },
  },
});
