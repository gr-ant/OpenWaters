import assert from 'node:assert/strict';
import fs from 'node:fs';

// Third person rowing and paddling the built-in boats: through a whole stroke each hand stays on its grip (engine/third-person.js
// puts them where oarPose in boats.js has the oars or paddle). Run from the repository root: node tests/rowing-hands.mjs
const read = p => fs.readFileSync(p, 'utf8');
const files = ['config', 'world/worldgen', 'models/mesh-builder', 'creatures/fish', 'creatures/cephalopods-shellfish', 'boats', 'boat-builder', 'boat-detail', 'models/human'];
const source = 'var BUILTIN = { fish: [], boat: [], tackle: [], feature: [] }; var Engine = {}; var EYE = 1.62, Game = { speedMultiplier: 1 }, document = { getElementById: () => null, querySelector: () => null }, uiIcon = () => "";\n'
  + files.map(f => read(`src/js/${f}.js`)).join('\n') + '\n' + read('src/js/engine/third-person.js');
const { BoatDB, Engine: E, oarPose, humanPlace, EYE, helmGrip, leverGrip } = new Function('location', 'history', 'matchMedia', 'localStorage', source + '\nBOAT_PARTS = ' + read('src/boats/parts.json') + ';\nreturn { BoatDB, Engine, oarPose, humanPlace, EYE, helmGrip, leverGrip };')(
  { search: '', hash: '' }, { replaceState() {} }, () => ({ matches: false }), { getItem() { return null; } });
for (const [, name] of read('src/index.html').matchAll(/data-builtin="boat" src="([^"]+)"/g)) BoatDB.register(JSON.parse(read(`src/${name}`)), { quiet: true });
const hand = i => humanPlace(E.hPose.pose.parts.filter(x => x[0] === 'fore')[i], 0, 0, -0.31);
const grips = { oars: [[-1, [0, -0.5, 0]], [1, [0, -0.5, 0]]], double: [[1, [0, -0.35, 0]], [1, [0, 0.35, 0]]], single: [[1, [0, 0, 0.45]], [1, [0, 0, 0.15]]] };   // [side, point on the oar] for the left, then the right hand
let n = 0;
for (const D of BoatDB.list) { const O = D._oars; if (!O || !O.live) continue; n++;
  const S = D._shape, st = Math.max(0, Math.min(1, D.crew.seat_at)), sx = S.x(st), sy = -(D.crew.seat_side || 0) * S.hb(st), m = new Float32Array(12);
  Object.assign(E, { P: { x: 0, y: 0, z: D.hull.floor_m + D.crew.eye_height_m - EYE, a: 0, pitch: 0 }, time: 1, ang: { out: false }, boatMode: 'drive', boatSit: true, swim: false, thirdP: true, hSm: null });
  E.boat = { x: 0, y: 0, z: 0, a: 0, speed: 1, v: 1, oarOn: true, oarK: 1, oarPh: [0, 0], def: D };
  const at = (ph, sd, q) => { oarPose(D, O, ph, 1, sd, true, m); return [m[0] * q[0] + m[3] * q[1] + m[6] * q[2] + m[9] - sx, m[1] * q[0] + m[4] * q[1] + m[7] * q[2] + m[10] - sy, m[2] * q[0] + m[5] * q[1] + m[8] * q[2] + m[11] - D.hull.floor_m]; };
  for (let k = 0; k < 16; k++) { const ph = k * Math.PI / 8; E.boat.oarPh = [ph, ph]; for (let j = 0; j < 40; j++) E.humanStep(0.016);   // held at each point of the stroke, so the pose has caught up
    for (const i of [0, 1]) { const h = hand(i), w = at(ph, ...grips[O.kind][i]), d = Math.hypot(h[0] - w[0], h[1] - w[1], h[2] - w[2]);
      assert.ok(d < 0.1, `${D.id}: the ${i ? 'right' : 'left'} hand ${d.toFixed(2)} m off its grip at stroke phase ${ph.toFixed(2)}`); } } }
assert.ok(n >= 3, 'rowed and paddled boats');
// at the wheel: the left hand on the rim wherever the wheel is turned, the right on the throttle lever wherever it's pushed
let w = 0;
for (const D of BoatDB.list) { if (!D._helm) continue; w++;
  const S = D._shape, st = Math.max(0, Math.min(1, D.crew.seat_at)), sx = S.x(st), sy = -(D.crew.seat_side || 0) * S.hb(st);
  Object.assign(E, { P: { x: 0, y: 0, z: D.hull.floor_m + D.crew.eye_height_m - EYE, a: 0, pitch: 0 }, time: 1, ang: { out: false }, boatMode: 'drive', boatSit: true, swim: false, thirdP: true, hSm: null });
  for (const [helmS, thrS] of [[0, 0], [1.4, 0.6], [-1.4, 1], [0.7, -0.6]]) {
    E.boat = { x: 0, y: 0, z: 0, a: 0, speed: 3, v: 3, helmS, thrS, def: D }; for (let j = 0; j < 40; j++) E.humanStep(0.016);
    const rel = q => [q[0] - sx, q[1] - sy, q[2] - D.hull.floor_m], d = (h, q) => Math.hypot(h[0] - q[0], h[1] - q[1], h[2] - q[2]);
    const dl = d(hand(0), rel(helmGrip(D, helmS, Math.PI - 0.55))), dr = d(hand(1), rel(leverGrip(D, thrS)));
    assert.ok(dl < 0.1 && dr < 0.1, `${D.id}: wheel at ${helmS}, throttle at ${thrS}: the left hand ${dl.toFixed(2)} m off the rim, the right ${dr.toFixed(2)} m off the lever`); } }
assert.ok(w >= 3, 'boats with a wheel');
console.log(`Rowing hands checks passed (${n} rowed or paddled, ${w} at the wheel).`);
