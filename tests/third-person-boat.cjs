// Third person at the helm (engine/third-person.js humanStep) in a stubbed engine: every kind of boat poses without error,
// the right hand on a tiller. (Hands on a real wheel and throttle, oars and paddles: tests/rowing-hands.mjs.) node tests/third-person-boat.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert'), R = __dirname + '/../src/js/';
const c = { Math, console, Object, CONFIG: { walkSpeed: 2.2, runSpeed: 5.5, jumpSpeed: 5.5 }, EYE: 1.7, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), Game: { speedMultiplier: 1 }, document: { getElementById: () => null, querySelector: () => null }, uiIcon: () => '' };
vm.createContext(c); vm.runInContext(fs.readFileSync(R + 'models/mesh-builder.js', 'utf8') + fs.readFileSync(R + 'models/human.js', 'utf8') + 'var Engine = {};' + fs.readFileSync(R + 'engine/third-person.js', 'utf8') + ';this.E = Engine; this.place = humanPlace;', c);
const E = c.E, hand = i => { const q = E.hPose.pose.parts.filter(x => x[0] === 'fore')[i]; return c.place(q, 0, 0, -0.31); };
for (const [name, features, type] of [['console', { console: { at: 0.48, height: 0.95 }, motor: { hp: 70 } }, 'outboard'], ['cabin', { cabin: {} }, 'inboard'], ['tiller', { motor: { hp: 15 } }, 'outboard'], ['canoe', {}, 'paddle']]) {
  Object.assign(E, { P: { x: 0, y: 0, z: 0.5, a: 0, pitch: 0 }, time: 1, ang: { out: false }, boatMode: 'drive', boatSit: true, swim: false, thirdP: true, hSm: null, hThr: 0, hBoatV: undefined });
  E.boat = { x: 0, y: 0, z: 0, a: 0, speed: 2, def: { propulsion: { type }, crew: { seat_at: 0.36, eye_height_m: 1.3 }, hull: { floor_m: 0.1, cockpit: null }, features, _shape: { x: t => (t - 0.5) * 6, hb: () => 1 } } };
  for (let k = 0; k < 40; k++) E.humanStep(0.016);   // steady speed: settled on the wheel
  assert.ok(E.hPose.pose.parts.every(q => q.slice(1).every(Number.isFinite)), name); const r = hand(1);
  if (name === 'tiller') assert.ok(r[1] > 0.15 && r[0] < 0.2, `tiller: the right hand at your side: ${r}`);
  if (name === 'tiller') { for (let k = 0; k < 40; k++) { E.boat.speed += 0.05; E.humanStep(0.016); } assert.ok(E.hThr > 0, 'tiller: speeding up'); }
}
console.log('Third-person helm checks passed.');
