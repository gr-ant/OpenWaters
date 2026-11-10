// Smoke test for fishing/rod-holder.js in a stubbed engine (with the real angler.js and bites.js): node tests/rod-holder.cjs
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
  action() { this.based = true; }, contextKeys() { return [['R', 'Reel']]; }, fishingStatus() { return { title: 'in hand' }; },
  rodAim: () => [0, 0.3], handForReel: () => [0, 0, 1.2],
  startFight(f) { this.fights++; this.ang.phase = 'fight'; f.hooked = 'fight'; },
  loseFish(msg, why) { this.lost.push(why); this.ang.fish = null; this.ang.phase = 'water'; this.say(msg); },
  boatLocal(b, x, y) { const dx = x - b.x, dy = y - b.y, c = Math.cos(b.a), s = Math.sin(b.a), lx = c * dx + s * dy; return [lx, c * dy - s * dx, 0, lx / b.def.hull.length_m + 0.5]; } };
var Game = { on(n, f) { (L[n] = L[n] || []).push(f); }, emit(n, ...a) { for (const f of L[n] || []) f(...a); }, onMap(f) { map.push(f); },
  sound(n, at) { sounds.push([n, at]); }, isWater: x => x > 3, groundAt: () => 0.2 };
`, Object.assign(ctx, { L: listeners, map, said, sounds, els }));
for (const f of ['fishing/angler.js', 'fishing/bites.js', 'fishing/rod-holder.js']) vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx);
vm.runInContext(`
const A = (c, m) => { if (!c) throw new Error('FAIL ' + m); }, E = Engine, key = c => Game.emit('key', c), step = (dt, n = 1) => { for (let i = 0; i < n; i++) { E.time += dt; Game.emit('update', dt); } };
const r0 = Math.random, fresh = () => ({ x: 10, y: 0, z: -1, kd: 0, land: false });
const fish = () => ({ x: 10, y: 0, z: -1, a: 0, len: 0.4, lengthCm: 40, ph: 0, kd: 0, name: 'Carp', def: { behavior: { cruise_bl_s: 1 }, body: { head: { mouth: 0.5 } } } });
E.ang = { out: true, phase: 'water', lure: fresh(), float: null, tip: [1, 0, 2], hand: [0, 0, 1], lineOut: 10, fish: null, baitLeft: 3, t: 0,
  S: { bait: { lasts: 3 }, hookKind: 'circle', sens: 0.5, hold: 0.9, size_cm: 2 } };
const Ang = E.ang;
A(Sounds.defs.bell && Sounds.defs.bell.layers.length === 9, 'bell registered');
A(E.contextKeys()[0][0] === 'H', 'H hint with the line out');
// place on the bank: a step toward the lure (dry land), standing up the bank
key('KeyH'); const H = Ang.holder; A(H && !H.boat && Math.abs(H.x - 0.6) < 1e-9 && H.z === 0.2 && H.yaw === 0, 'spike planted: ' + said.at(-1));
A(!E.rodInHand() && Ang.out, 'rod out but not in hand'); A(E.holderNear(), 'near it'); A(E.contextKeys()[0][1] === 'Pick up rod', 'pick-up hint');
// walk away; Q can't stow it from here
E.P.x = -40; A(!E.holderNear(), 'far'); E.keyPress('KeyQ', {}, false); A(Ang.holder && Ang.out && /holder 41 m away/.test(said.at(-1)), 'Q refused: ' + said.at(-1));
E.action(); A(E.based, 'Use away from the holder falls through');
// a bite: longer take, bell at the rod, notice up
Math.random = () => 0; E.fishTake(fish()); A(Ang.phase === 'bite' && Ang.took, 'took it');
A(Math.abs(Ang.window - (1 + 1.6 * 0.5) * 1.6 * 4) < 1e-9, 'take lasts 4x: ' + Ang.window);
const n0 = sounds.length; step(0.016); A(sounds.length === n0 + 1 && sounds.at(-1)[0] === 'bell' && sounds.at(-1)[1].x === H.x && sounds.at(-1)[1].z === H.z + H.up, 'bell rang at the rod');
A(/^Bell! Bite at the rod holder! 41 m away/.test(said.at(-1)), 'say: ' + said.at(-1)); A(els[0] && !els[0].hidden && /Bite at the rod holder/.test(els[0].textContent), 'chip up');
A(E.fishingStatus().bite === 'strike', 'status shows the bite');
// nobody comes: the circle hook sets itself, the fish is held, the bell keeps going
for (let t = 0; t < 12 && !H.on; t += 0.1) E.biteStep(0.1, false, false);
A(H.on && Ang.phase === 'bite' && E.fights === 0, 'self-hooked and held (no fight yet)');
step(0.5, 10); A(sounds.filter(s => s[0] === 'bell').length >= 3, 'bell keeps ringing'); A(/Fish on at the rod holder/.test(els[0].textContent), 'chip: ' + els[0].textContent);
A(E.fishingStatus().alert && /Fish on/.test(E.fishingStatus().title), 'status: fish on');
// walk back and pick it up: straight into the fight, notice gone
E.P.x = 0.2; A(E.holderNear(), 'back at it'); E.based = false; E.action();
A(!Ang.holder && E.fights === 1 && Ang.phase === 'fight' && !E.based && E.rodInHand(), 'picked up into the fight'); step(0.016); A(els[0].hidden, 'chip cleared');
// again, and leave it: after HOLD_S the fish throws the hook, the notice stays until you come back
Ang.phase = 'water'; Ang.fish = null; Ang.lure = fresh(); key('KeyH'); E.P.x = -30; E.fishTake(fish()); step(0.016);
for (let t = 0; t < 12 && !Ang.holder.on; t += 0.1) E.biteStep(0.1, false, false); step(0.5, 95);
A(E.lost.at(-1) === 'thrown' && Ang.phase === 'water' && /threw the hook/.test(els[0].textContent) && !els[0].hidden, 'thrown after a while: ' + els[0].textContent);
E.P.x = 0; key('KeyH'); step(0.016); A(!Ang.holder && Ang.phase === 'water' && /line still out/.test(said.at(-1)) && els[0].hidden, 'H at the holder picks it up: ' + said.at(-1));
// a J hook left alone mostly drops it: random 0.99 fails the 12% self-set
Ang.S.hookKind = 'J'; key('KeyH'); E.P.x = -20; Math.random = () => 0; E.fishTake(fish()); Math.random = () => 0.99; step(0.016);
for (let t = 0; t < 30 && Ang.phase === 'bite'; t += 0.1) E.biteStep(0.1, false, false); step(0.016);
A(Ang.phase === 'water' && !Ang.holder.on && /Missed a bite/.test(els[0].textContent), 'J hook: dropped it: ' + els[0].textContent);
// travelling (or anything else that puts the rod away) takes the holder too
E.toggleRod(false); A(!Ang.holder && !Ang.out, 'stowed with the holder'); step(0.016); A(els[0].hidden, 'chip gone');
// on a boat: on the gunwale, on the lure's side, and it rides with the boat
Math.random = r0; Ang.out = true; Ang.phase = 'water'; Ang.lure = { x: 0, y: 8, z: -1, kd: 0, land: false }; E.P.x = 0.3; E.P.y = 0;
const b = E.boat = { x: 0, y: 0, z: 0.1, a: 0, pitch: 0, roll: 0, def: { hull: { length_m: 5 }, _shape: { hb: () => 0.7, gun: () => 0.5 } } };
key('KeyH'); const B = Ang.holder; A(B.boat === b && B.ly > 0 && Math.abs(B.ly - 0.644) < 1e-9 && B.lz === 0.5 && B.up === 0.3, 'gunwale holder on the lure side');
b.x = 20; b.a = Math.PI / 2; const h = E.holderHand(B); A(Math.abs(h[0] - (20 - B.ly)) < 1e-9 && Math.abs(B.yaw - (Math.PI / 2 + B.ya)) < 1e-9, 'moves and turns with the boat');
// aboard, Use is for the boat (leaving it); H picks the rod up; leave the boat and the rod keeps fishing from its holder, the bell and all
E.P.x = 20; E.P.y = 0.3; E.based = false; A(E.holderNear() && E.contextKeys()[0][0] === 'H', 'aboard: H to pick up'); E.action(); A(E.based && Ang.holder === B, 'Use aboard leaves the boat, the rod stays in its holder');
E.boat = null; E.P.x = 24; step(0.016); A(Ang.out && Ang.holder === B && !E.rodInHand(), 'ashore: still in the holder');
Math.random = () => 0; E.fishTake(fish()); step(0.016); A(/Bite at the rod holder/.test(els[0].textContent), 'it still rings from the boat: ' + els[0].textContent); Math.random = r0;
b.x = 26; E.holderHand(B); A(Math.abs(B.x - (26 - B.ly)) < 1e-9, 'and drifts with it');
E.P.x = 25.5; E.P.y = 0; A(E.holderNear(), 'swum back to it'); E.based = false; E.action(); A(!Ang.holder && Ang.out, 'Use from the water picks it up');
E.boat = b; E.boatMode = 'drive'; Ang.holder = null; Ang.phase = 'water'; key('KeyH'); A(!Ang.holder && /helm/.test(said.at(-1)), 'not from the helm');
map.forEach(f => f({ beginPath() {}, arc() {}, fill() {}, stroke() {} }, (x, y) => [x, y]));
console.log('ok:', said.slice(-4).join(' | '));
`, ctx);
