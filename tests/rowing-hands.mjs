import assert from 'node:assert/strict';
import fs from 'node:fs';

// Third person rowing and paddling the built-in boats: through a whole stroke each hand stays on its grip (engine/third-person.js
// puts them where oarPose in boats.js has the oars or paddle). Run from the repository root: node tests/rowing-hands.mjs
const read = p => fs.readFileSync(p, 'utf8');
const files = ['config', 'world/worldgen', 'models/mesh-builder', 'creatures/fish', 'creatures/cephalopods-shellfish', 'boats', 'boat-builder', 'boat-detail', 'models/human'];
const sim = [...read('src/index.html').matchAll(/<script src="(sim\/[\w-]+\.js)">/g)].map(m => read(`src/${m[1]}`));   // the shared simulation (src/sim/) goes first: the game's scripts build on it
const source = 'var BUILTIN = { fish: [], boat: [], tackle: [], feature: [] }; var Engine = {}; var EYE = 1.62, Game = { speedMultiplier: 1 }, document = { getElementById: () => null, querySelector: () => null }, uiIcon = () => "";\n'
  + sim.concat(files.map(f => read(`src/js/${f}.js`))).join('\n') + '\n' + read('src/js/engine/third-person.js');
const { BoatDB, Engine: E, oarPose, humanPlace, EYE, helmGrip, leverGrip } = new Function('location', 'history', 'matchMedia', 'localStorage', source + '\nBOAT_PARTS = ' + read('src/boats/parts.json') + ';\nreturn { BoatDB, Engine, oarPose, humanPlace, EYE, helmGrip, leverGrip };')(
  { search: '', hash: '' }, { replaceState() {} }, () => ({ matches: false }), { getItem() { return null; } });
for (const [, name] of read('src/index.html').matchAll(/data-builtin="boat" src="([^"]+)"/g)) BoatDB.register(JSON.parse(read(`src/${name}`)), { quiet: true });
const hand = i => E.hPose.w(humanPlace(E.hPose.pose.parts.filter(x => x[0] === 'fore')[i], 0, 0, -0.31));   // in the world
// a point on the boat (its own frame) in the world, as the hull is drawn: heeled (roll), then pitched, turned, placed
const world = (b, q) => { const cr = Math.cos(b.roll), sr = Math.sin(b.roll), cp = Math.cos(b.pitch), sp = Math.sin(b.pitch), y = q[1] * cr - q[2] * sr, z1 = q[1] * sr + q[2] * cr, x = q[0] * cp - z1 * sp, z = q[0] * sp + z1 * cp;
  return [b.x + Math.cos(b.a) * x - Math.sin(b.a) * y, b.y + Math.sin(b.a) * x + Math.cos(b.a) * y, b.z + z]; };
// sit at the helm seat as the game does (seatBoat, engine/boats.js)
const seat = (D, b) => { const S = D._shape, t = Math.max(0, Math.min(1, D.crew.seat_at)), sx = S.x(t), sy = -(D.crew.seat_side || 0) * S.hb(t);
  Object.assign(E, { P: { x: b.x + Math.cos(b.a) * sx - Math.sin(b.a) * sy, y: b.y + Math.sin(b.a) * sx + Math.cos(b.a) * sy, z: b.z + D.hull.floor_m + D.crew.eye_height_m - EYE + Math.sin(b.pitch) * sx, a: b.a, pitch: 0 }, time: 1, ang: { out: false }, boatMode: 'drive', boatSit: true, swim: false, thirdP: true }); };
const TILTS = [[0, 0], [0.08, 0.06], [-0.06, -0.1]];   // [pitch, roll]: level, bow up and heeled to starboard, the other way
const grips = { oars: [[-1, [0, -0.5, 0]], [1, [0, -0.5, 0]]], double: [[1, [0, -0.35, 0]], [1, [0, 0.35, 0]]], single: [[1, [0, 0, 0.45]], [1, [0, 0, 0.15]]] };   // [side, point on the oar] for the left, then the right hand
let n = 0;
for (const D of BoatDB.list) { const O = D._oars; if (!O || !O.live) continue; n++;
  const m = new Float32Array(12);
  for (const [pitch, roll] of TILTS) { const b = E.boat = { x: 3, y: -2, z: 0.1, a: 0.7, pitch, roll, speed: 1, v: 1, oarOn: true, oarK: 1, oarPh: [0, 0], def: D }; seat(D, b); E.hSm = null;
    const at = (ph, sd, q) => { oarPose(D, O, ph, 1, sd, true, m); return world(b, [m[0] * q[0] + m[3] * q[1] + m[6] * q[2] + m[9], m[1] * q[0] + m[4] * q[1] + m[7] * q[2] + m[10], m[2] * q[0] + m[5] * q[1] + m[8] * q[2] + m[11]]); };
    for (let k = 0; k < 16; k++) { const ph = k * Math.PI / 8; b.oarPh = [ph, ph]; for (let j = 0; j < 40; j++) E.humanStep(0.016);   // held at each point of the stroke, so the pose has caught up
      for (const i of [0, 1]) { const h = hand(i), w = at(ph, ...grips[O.kind][i]), d = Math.hypot(h[0] - w[0], h[1] - w[1], h[2] - w[2]);
        assert.ok(d < 0.1, `${D.id} (pitch ${pitch}, roll ${roll}): the ${i ? 'right' : 'left'} hand ${d.toFixed(2)} m off its grip at stroke phase ${ph.toFixed(2)}`); } } } }
assert.ok(n >= 3, 'rowed and paddled boats');
// at the wheel: the left hand on the rim wherever the wheel is turned, the right on the throttle lever wherever it's pushed
let w = 0;
for (const D of BoatDB.list) { if (!D._helm) continue; w++;
  for (const [pitch, roll] of TILTS) for (const [helmS, thrS] of [[0, 0], [1.4, 0.6], [-1.4, 1], [0.7, -0.6]]) {
    const b = E.boat = { x: -4, y: 6, z: 0.2, a: -1.1, pitch, roll, speed: 3, v: 3, helmS, thrS, def: D }; seat(D, b); E.hSm = null; for (let j = 0; j < 40; j++) E.humanStep(0.016);
    const d = (h, q) => Math.hypot(h[0] - q[0], h[1] - q[1], h[2] - q[2]), dl = d(hand(0), world(b, helmGrip(D, helmS, Math.PI - 0.55))), dr = d(hand(1), world(b, leverGrip(D, thrS)));
    assert.ok(dl < 0.08 && dr < 0.03, `${D.id} (pitch ${pitch}, roll ${roll}): wheel at ${helmS}, throttle at ${thrS}: the left hand ${dl.toFixed(2)} m off the rim, the right ${dr.toFixed(2)} m off the lever`); } }
assert.ok(w >= 3, 'boats with a wheel');
console.log(`Rowing hands checks passed (${n} rowed or paddled, ${w} at the wheel).`);
