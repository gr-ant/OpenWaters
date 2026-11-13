// Smoke test for fishing/two-rods.js (a second rod while one stands in a holder) in a stubbed engine: node tests/two-rods.cjs
const fs = require('fs'), vm = require('vm'), R = __dirname + '/../src/js/';
const said = [], sounds = [], listeners = {}, map = [], els = [];
const ctx = { console, Math, JSON, Object, Float32Array, isFinite,
  Controls: { key: id => ({ use: 'F', holder: 'H' })[id] || '?' }, EYE: 1.7, MT: { METAL: 1 },
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)), baitThief: () => false, rodLineAnchor: () => [2, 0], sample() {}, hW: () => -3, SK: 0, SW: 0, SE: 0,
  meshBuilder: () => ({ v: [], tube() { this.v.push(0); } }),
  Sounds: { defs: {}, register(n, d) { this.defs[n] = d; } },
  document: { createElement: () => { const e = { hidden: false, textContent: '', setAttribute() {} }; els.push(e); return e; }, body: { appendChild() {} } },
  localStorage: { getItem: () => null, setItem() {} },
};
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(`
var Engine = { P: { x: 0, y: 0, z: 0, a: 0 }, time: 0, keys: {}, touchUI: false, boat: null, boatMode: 'deck', fights: 0, lost: [],
  say(t) { said.push(t); }, buzz() {}, addRipple() {}, updateTui() {}, keyPress(code) { this.keys[code] = true; if (code === 'KeyQ') this.toggleRod(); },
  action() { this.based = true; }, nearBoat: () => null, steps: [], draws: [], angStep() { this.steps.push(this.ang); }, drawTackle() { this.draws.push(this.ang); }, lureArrive(f) { f.cameTo = this.ang; }, travel() { this.travelled = true; }, contextKeys() { return [['R', 'Reel']]; }, fishingStatus() { return { title: 'in hand' }; },
  rodAim: () => [0, 0.3], handForReel: () => [0, 0, 1.2],
  startFight(f) { this.fights++; this.ang.phase = 'fight'; f.hooked = 'fight'; },
  loseFish(msg, why) { this.lost.push(why); this.ang.fish = null; this.ang.phase = 'water'; this.say(msg); },
  boatLocal(b, x, y) { const dx = x - b.x, dy = y - b.y, c = Math.cos(b.a), s = Math.sin(b.a), lx = c * dx + s * dy; return [lx, c * dy - s * dx, 0, lx / b.def.hull.length_m + 0.5]; } };
var Game = { on(n, f) { (L[n] = L[n] || []).push(f); }, emit(n, ...a) { for (const f of L[n] || []) f(...a); }, onMap(f) { map.push(f); },
  sound(n, at) { sounds.push([n, at]); }, isWater: x => x > 3, groundAt: () => 0.2 };
`, Object.assign(ctx, { L: listeners, map, said, sounds, els }));
for (const f of ['fishing/angler.js', 'fishing/bites.js', 'fishing/rod-holder.js']) vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx);
vm.runInContext('Engine.lureArrive = function (f) { f.cameTo = this.ang; };', ctx);   // (bites.js's own needs the whole world)
vm.runInContext(fs.readFileSync(R + 'fishing/two-rods.js', 'utf8'), ctx);
vm.runInContext(`
const A = (c, m) => { if (!c) throw new Error('FAIL ' + m); }, E = Engine, key = c => Game.emit('key', c), step = (dt, n = 1) => { for (let i = 0; i < n; i++) { E.time += dt; E.angStep(dt); Game.emit('update', dt); } };
const rod = () => ({ out: false, phase: 'stowed', lure: null, float: null, tip: [1, 0, 2], hand: [0, 0, 1], lineOut: 0, fish: null, baitLeft: 3, t: 0, rig: { name: 'Bobber' }, S: { bait: { lasts: 3 }, hookKind: 'circle', sens: 0.5, hold: 0.9, size_cm: 2 } });
const cast = R => { R.out = true; R.phase = 'water'; R.lure = { x: 10, y: 0, z: -1, kd: 0, land: false }; };
const fish = () => ({ x: 10, y: 0, z: -1, a: 0, len: 0.4, lengthCm: 40, ph: 0, kd: 0, name: 'Carp', def: { behavior: { cruise_bl_s: 1 }, body: { head: { mouth: 0.5 } } } });
E.angLoad = function () { this.ang = rod(); }; const stow = E.toggleRod;
// (the stubbed engine's own rod-out: the real one is angler.js's toggleRod, wrapped by the holder and then by two-rods)
E.ang = rod(); const one = E.ang; cast(one);
key('KeyH'); A(one.holder && !E.ang2, 'first rod in its holder');
A(E.contextKeys()[0][1] === 'Pick up rod', 'at the holder: pick-up hint'); E.P.x = -30; A(E.contextKeys()[0][1] === 'Second rod', 'away from it: second-rod hint');
// Q: a second rod in your hands, the first still fishing
E.keyPress('KeyQ', {}, false); const two = E.ang; A(two !== one && E.ang2 === one && two.out && !two.holder && E.rodInHand(), 'second rod in hand: ' + said.at(-1)); A(/Second rod/.test(said.at(-1)), 'said so');
E.steps.length = 0; E.draws.length = 0; step(0.016); E.drawTackle(); A(E.steps.length === 2 && E.steps[0] === two && E.steps[1] === one && E.ang === two, 'both rods step, focus unchanged'); A(E.draws.length === 2 && E.draws[1] === one, 'both rods drawn');
A(E.rods().length === 2, 'rods()'); const dots = []; map.forEach(f => f({ beginPath() {}, arc(x) { dots.push(x); }, fill() {}, stroke() {} }, (x, y) => [x, y])); A(dots.length === 1, 'the holder rod on the map');
// a fish that noticed the first rod's bait arrives at the first rod
const f1 = fish(); f1.rod = one; E.lureArrive(f1); A(f1.cameTo === one && E.ang === two, 'fish goes to the rod it noticed'); const f2 = fish(); f2.rod = two; E.lureArrive(f2); A(f2.cameTo === two, 'and to the one in hand');
// the first rod gets a bite while you hold the second: bell and notice, though it isn't the rod in focus
Math.random = () => 0; { const me = E.ang; E.ang = one; E.ang2 = me; E.fishTake(fish()); E.ang2 = one; E.ang = me; } A(one.phase === 'bite', 'bite on the holder rod');
const n0 = sounds.length; step(0.016); A(sounds.length > n0 && sounds.at(-1)[0] === 'bell', 'bell for the other rod'); A(els[0] && !els[0].hidden && /Bite at the rod holder/.test(els[0].textContent), 'notice up: ' + (els[0] && els[0].textContent));
// a third rod is refused; the second goes in a holder of its own; then both are out and Q says so
cast(two); E.P.x = 0; E.P.y = 40; key('KeyH'); A(two.holder && one.holder && E.ang === two && E.ang2 === one, 'second rod in a holder too');
E.keyPress('KeyQ', {}, false); A(/Both rods are out/.test(said.at(-1)) && E.ang === two && E.ang2 === one, 'no third rod: ' + said.at(-1));
map.forEach(f => f({ beginPath() {}, arc(x) { dots.push(x); }, fill() {}, stroke() {} }, (x, y) => [x, y])); A(dots.length === 3, 'both holders on the map');
// walk to the first rod and Use: it becomes the rod in your hands (fish on: straight into the fight); the second stays in its holder
E.P.x = one.holder.x; E.P.y = one.holder.y; A(E.holderNear(), 'near the first rod'); one.holder.on = true; one.fish = one.fish || fish();
E.action(); A(E.ang === one && one.holder.reachT === 0, 'reaching for selected rod'); step(0.35); A(E.ang === one && !one.holder && E.ang2 === two && two.holder && E.fights === 1, 'picked up the first, fighting: ' + said.at(-1));
// with a rod in your hands and its line out, Use at the other holder sets yours down here and takes that one
one.phase = 'water'; one.fish = null; one.lure = { x: 10, y: 40, z: -1, kd: 0, land: false }; E.P.x = two.holder.x; E.P.y = two.holder.y; E.action(); step(0.35);
A(E.ang === two && !two.holder && E.ang2 === one && one.holder, 'swapped rods at the second holder: ' + said.at(-1));
// put the one in your hands away: the rod in the holder is the one you have out; travel takes them all
two.phase = 'ready'; two.lure = null; E.keyPress('KeyQ', {}, false); A(E.ang === one && !E.ang2 && one.out && one.holder, 'stowed the hand rod, the holder rod remains');
E.keyPress('KeyQ', {}, false); A(E.ang2 === one && E.ang.out, 'a second again'); E.travel(5, 5); A(!E.ang2 && E.travelled, 'travel drops the second rod');
// a second rod that leaves its holder some other way (stowed by the game) is forgotten
E.ang2 = Object.assign(rod(), { out: false }); step(0.016); A(!E.ang2, 'cleaned up');
console.log('ok:', said.slice(-3).join(' | '));
`, ctx);
