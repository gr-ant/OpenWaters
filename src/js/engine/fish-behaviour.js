'use strict';
// Engine: fish behaviour (depth zones, decisions, prey, eating, swimming, air-breathers surfacing and hauling out) is the
// shared simulation's (src/sim/behaviour.js). This is its browser side: FISH_CTX hands it the engine's clock, you, the
// noises, the fish grid, your lure, the game's events, and the rings, drops and spray it leaves (rendering), and the
// Engine methods keep their old names for the rest of the game.
const FISH_PLAYER = { x: 0, y: 0, inWater: false, moving: false }, FISH_PLAYERS = [FISH_PLAYER];
const FISH_CTX = {
  get time() { return Engine.time; }, get tod() { return Engine.tod; }, get dtH() { return Engine.dtH; }, get frameDt() { return Engine.frameDt; },
  rng: Math.random,   // fish decisions in the browser are not shared state (a server passes its seeded stream)
  get noises() { return Engine.noises; },
  // you: swimming or wading scares fish within their spook range; moving on the bank scares shallow fish nearby
  get players() { const E = Engine, o = FISH_PLAYER; o.x = E.P.x; o.y = E.P.y; o.inWater = !!(E.swim || E.wade > 0.05); o.moving = !!E.moving; return FISH_PLAYERS; },
  fishAround: (x, y, r, fn) => Engine.fishAround(x, y, r, fn),
  // the lure a following fish is after: the rod whose bait it noticed (fishing/two-rods.js), while that bait is still fishing
  lureFor(f) { const E = Engine, A = f.rod && f.rod === E.ang2 ? f.rod : E.ang, L = A && A.lure; return !L || A.phase !== 'water' || A.fish || L.land ? null : L; },
  lureArrive: f => Engine.lureArrive(f),   // the bite decision: fishing/bites.js (looked up each time: two-rods.js wraps it)
  emit: (name, ...args) => Game.emit(name, ...args),
  fx: {
    rise(f) { const E = Engine; E.addRipple(f.x, f.y, 0.3 + 0.6 * Math.min(1, f.len * 1.6));   // a rise: rings and a few drops
      for (let k = 0; k < 4 + f.len * 12; k++) E.spawn(DROP, f.x + E.rnd(-0.1, 0.1), f.y + E.rnd(-0.1, 0.1), f.wl, E.rnd(-0.5, 0.5), E.rnd(-0.5, 0.5), E.rnd(1, 2.2), E.rnd(0.3, 0.5), 0.03); },
    kill(f, g) { const E = Engine; E.addRipple(g.x, g.y, 0.5 + f.len);   // a strike at the surface
      for (let k = 0; k < 6 + f.len * 20; k++) E.spawn(DROP, g.x + E.rnd(-0.2, 0.2), g.y + E.rnd(-0.2, 0.2), g.wl, E.rnd(-1, 1), E.rnd(-1, 1), E.rnd(1.5, 3), E.rnd(0.3, 0.6), 0.035); },
    splashdown(f) { const E = Engine; E.addRipple(f.x, f.y, 0.6 + Math.min(2, f.len));   // a leaping dolphin comes down
      for (let k = 0; k < 10 + Math.min(80, f.len * 25); k++) E.spawn(DROP, f.x + E.rnd(-0.4, 0.4) * f.len * 0.3, f.y + E.rnd(-0.4, 0.4) * f.len * 0.3, f.wl, E.rnd(-2, 2), E.rnd(-2, 2), E.rnd(2, 4 + f.len), E.rnd(0.5, 1.2), 0.05); },
    blow(f) { const E = Engine, B = f.def.behavior; E.addRipple(f.x, f.y, 0.3 + Math.min(1.5, f.len * 0.3));   // the blow: a burst of spray from the blowhole
      if (B.blow > 0) for (let k = 0; k < 6 + 40 * B.blow; k++) E.spawn(STEAM, f.x + Math.cos(f.a) * f.len * 0.3 + E.rnd(-0.15, 0.15), f.y + Math.sin(f.a) * f.len * 0.3 + E.rnd(-0.15, 0.15), f.wl + 0.1, E.rnd(-0.4, 0.4), E.rnd(-0.4, 0.4), E.rnd(1.5, 2.5 + 6 * B.blow), E.rnd(1, 2.4), 0.1 + 0.6 * B.blow); },
    leap(f) { Engine.addRipple(f.x, f.y, 0.5 + Math.min(1.5, f.len * 0.3)); },
  },
};
Object.assign(Engine, {
  pickZone(w) { return SIM.pickZone(FISH_CTX, w); },
  zoneZ(f, zone, wl, g, kind) { return SIM.zoneZ(FISH_CTX, f, zone, wl, g, kind); },
  fishSpot(f, cx, cy, radius, n, score) { return SIM.fishSpot(FISH_CTX, f, cx, cy, radius, n, score); },
  fishDecide(f) { SIM.fishDecide(FISH_CTX, f); },
  findPrey(f) { return SIM.findPrey(FISH_CTX, f); },
  fishEat(f, q) { SIM.fishEat(FISH_CTX, f, q); },
  fishStep(f, dt) { SIM.fishStep(FISH_CTX, f, dt); },
  mammalStep(f, dt) { return SIM.mammalStep(FISH_CTX, f, dt); },
  shoreSpot(f, R) { return SIM.shoreSpot(FISH_CTX, f, R); },
});
