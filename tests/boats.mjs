import assert from 'node:assert/strict';
import fs from 'node:fs';

// Boat logic without a browser: the built-in boats, the oar / paddle stroke, the hull rocking under your weight, hulls being solid.
// Run from the repository root: node tests/boats.mjs
const read = p => fs.readFileSync(p, 'utf8');
const files = ['config', 'world/worldgen', 'models/mesh-builder', 'creatures/fish', 'creatures/cephalopods-shellfish', 'boats', 'boat-builder', 'boat-detail'];
const source = 'var BUILTIN = { fish: [], boat: [], tackle: [], feature: [] }; var Engine = {};\n' + files.map(f => read(`src/js/${f}.js`)).join('\n') + '\n' + read('src/js/engine/on-board.js');
const api = new Function('location', 'history', 'matchMedia', 'localStorage', source + '\nBOAT_PARTS = ' + read('src/boats/parts.json') + ';\nreturn { BoatDB, Engine, oarPose, oarXform, VS, buildBoat, MT, helmPose };')(
  { search: '', hash: '' }, { replaceState() {} }, () => ({ matches: false }), { getItem() { return null; } });
const { BoatDB, Engine: E, oarPose, oarXform, VS, buildBoat, MT, helmPose } = api;
for (const [, name] of read('src/index.html').matchAll(/data-builtin="boat" src="([^"]+)"/g)) assert.ok(BoatDB.register(JSON.parse(read(`src/${name}`)), { quiet: true }).def, name);
assert.ok(BoatDB.list.length >= 13);
// Every JSON boat is covered, including definitions added without a menu entry.
for (const name of fs.readdirSync('src/boats').filter(n => n.endsWith('.json') && n !== 'parts.json')) {
  const raw = JSON.parse(read(`src/boats/${name}`));
  if (!BoatDB.byId[raw.id]) assert.ok(BoatDB.register(raw, { quiet: true }).def, name);
}
// Measure against the rendered triangles, not the smooth hull formula. Also check
// triangle centres/edge midpoints: clear vertices alone can hide crossing panels.
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const face = (m, i) => {
  const a = [...m.slice(i, i + 3)], b = [...m.slice(i + VS, i + VS + 3)], c = [...m.slice(i + 2*VS, i + 2*VS + 3)];
  const ab = sub(b, a), ac = sub(c, a), n = cross(ab, ac), len = Math.hypot(...n);
  return { a, b, c, ab, ac, n: n.map(x => x / len), lo: a.map((v, j) => Math.min(v, b[j], c[j])), hi: a.map((v, j) => Math.max(v, b[j], c[j])) };
};
function distanceToFace(p, f) {
  const { a, b, c, ab, ac, n } = f, ap = sub(p, a), signed = dot(ap, n);
  const d00 = dot(ab, ab), d01 = dot(ab, ac), d11 = dot(ac, ac), d20 = dot(ap, ab), d21 = dot(ap, ac), den = d00*d11-d01*d01;
  const v = (d11*d20-d01*d21)/den, w = (d00*d21-d01*d20)/den;
  if (v >= 0 && w >= 0 && v + w <= 1) return { distance: Math.abs(signed), signed };
  const edge = (a, b) => { const e = sub(b, a), q = sub(p, a), t = Math.max(0, Math.min(1, dot(q, e)/dot(e, e))); return Math.hypot(...q.map((x, i) => x - t*e[i])); };
  return { distance: Math.min(edge(a, b), edge(b, c), edge(c, a)), signed };
}
for (const D of BoatDB.list) {
  const m = D._mesh, start = D._shellStart * VS, skinEnd = start + D._skinN * VS, wallEnd = skinEnd + D._wallN * VS;
  assert.equal(D._shellStart + D._shellN, D._hullN, `${D.id}: shell draw range`);
  assert.ok(D._skinN > 0 && D._wallN > 0, `${D.id}: both skin and liner`);
  const skin = [];
  for (let i = start; i < skinEnd; i += 3*VS) {
    const f = face(m, i); skin.push(f);
    assert.ok(dot(f.n, [...m.slice(i + 3, i + 6)]) > 0, `${D.id}: outward skin winding`);
  }
  // End caps have opposite outward/inward winding and a real thickness too.
  for (let i = wallEnd; i < (D._shellStart + D._shellN) * VS; i += 3*VS) {
    const f = face(m, i), endDistance = D.hull.length_m/2 - Math.abs(f.a[0]);
    assert.ok(Math.abs(f.n[0]) > 0.999, `${D.id}: planar end cap`);
    if (endDistance < 1e-5) assert.ok(f.n[0] * f.a[0] > 0, `${D.id}: outward end cap`);
    else {
      assert.ok(endDistance >= 0.003, `${D.id}: end liner clearance`);
      assert.ok(f.n[0] * f.a[0] < 0, `${D.id}: inward end liner`);
    }
  }
  const samples = new Map();
  for (let i = skinEnd; i < wallEnd; i += 3*VS) {
    const f = face(m, i), { a, b, c } = f;
    assert.ok(f.n[1] * (a[1] + b[1] + c[1]) < 0, `${D.id}: inward liner winding`);
    for (const p of [a, b, c, a.map((v, j) => (v+b[j]+c[j])/3), ...[[a,b], [b,c], [c,a]].map(([a,b]) => a.map((v,j) => (v+b[j])/2))]) samples.set(p.join(','), p);
  }
  for (const p of samples.values()) {
    const bound = f => Math.max(0, f.lo[0]-p[0], p[0]-f.hi[0], f.lo[1]-p[1], p[1]-f.hi[1], f.lo[2]-p[2], p[2]-f.hi[2]);
    let closestBox = skin[0], lower = Infinity;
    for (const f of skin) { const d = bound(f); if (d < lower) { lower = d; closestBox = f; } }
    let nearest = distanceToFace(p, closestBox);
    for (const f of skin) {
      if (bound(f) > nearest.distance) continue;
      const d = distanceToFace(p, f); if (d.distance < nearest.distance) nearest = d;
    }
    assert.ok(nearest.distance >= 0.003 && nearest.signed < 0, `${D.id}: liner clearance at ${p}: ${JSON.stringify(nearest)}`);
  }
}

// the wheel and throttle lever stand clear of the console and its dash however they're turned or pushed
let consoles = 0;
for (const D of BoatDB.list) { const cs = D.features.console; if (!cs || !D._helm) continue; consoles++;
  const S = D._shape, t = cs.at ?? 0.45, x = S.x(t), oy = -(cs.side ?? 0) * S.hb(t), w = Math.min(0.35, S.hb(t) * (cs.side ? 0.25 : 0.45)), top = D.hull.floor_m + (cs.height ?? 0.95);
  const out = new Float32Array(D._helm.wheel.length + D._helm.lever.length);
  for (const [ang, thr] of [[0, 0], [0.8, 1], [-1.4, -1]]) { helmPose(D, ang, thr, out); for (let i = 0; i < out.length; i += VS) {
    const X = out[i], inBox = X > x - 0.3 && X < x + 0.25 && out[i + 2] < top, inDash = X > x - 0.3 && X < x - 0.05 && out[i + 2] < top + (X - (x - 0.3)) - 0.03;   // the console, and the 45 degree dash on its aft end
    assert.ok(Math.abs(out[i + 1] - oy) >= w || !(inBox || inDash), `${D.id}: the ${i < D._helm.wheel.length ? 'wheel' : 'throttle lever'} (wheel ${ang}, throttle ${thr}) is sunk into the console at ${[...out.slice(i, i + 3)].map(v => v.toFixed(2))}`); } } }
assert.ok(consoles >= 3, 'boats with a console');

// trim and fittings (boat-detail.js): every boat gets some, and nothing is flung far off the hull
for (const D of BoatDB.list) { const m = D._mesh, H = D.hull, tall = (D.features.cabin ? (D.features.cabin.height ?? 1.1) + 1.2 : D.features.console ? 2.6 : 1.4) + H.depth_m; let n = 0;
  for (let i = 0; i < D._hullN * VS; i += VS) { n++; assert.ok(m[i] > -H.length_m / 2 - 1.3 && m[i] < H.length_m / 2 + 0.4 && Math.abs(m[i + 1]) < H.beam_m / 2 + 0.25 && m[i + 2] > -H.draft_m - 1.2 && m[i + 2] < tall, `${D.id}: a vertex at ${[m[i], m[i + 1], m[i + 2]].map(v => v.toFixed(2))}`); }
  assert.ok(n > 1500, `${D.id}: ${n} vertices`); }
// boats built from parts (boat-builder.js, boats/parts.json): a short definition becomes a whole boat
{ const B = id => BoatDB.byId[id], short = { id: 't', name: 'T', size: 'medium', build: 'vee' }, why = d => buildBoat(Object.assign({}, short, d)).errors.join('; ');
  assert.equal(B('pack_canoe').propulsion.type, 'paddle'); assert.equal(B('pack_canoe').features.motor, null);
  assert.equal(B('skiff').propulsion.type, 'outboard'); assert.equal(B('skiff').features.motors.length, 1); assert.equal(B('skiff').seats.length, 2); assert.equal(B('skiff').features.rod_holders, 4);
  assert.equal(B('twin_skiff').features.motors.length, 2); assert.equal(B('twin_skiff')._parts.power, B('bay_boat')._parts.power);   // two small engines push as hard as one medium…
  assert.ok(B('twin_skiff').propulsion.turn_rate > B('bay_boat').propulsion.turn_rate, '…and steer better');
  assert.ok(B('bay_boat').features.console && B('bay_boat').features.casting_decks && B('bay_boat').seats.some(s => s.type === 'locker'));
  assert.ok(B('trawler').features.cabin && B('trawler').hull.length_m > B('bay_boat').hull.length_m && B('bay_boat').hull.length_m > B('skiff').hull.length_m);
  assert.ok(B('bay_boat').propulsion.max_speed_ms > buildBoat(Object.assign({}, short, { engines: ['small'] })).def.propulsion.max_speed_ms, 'more power, more speed');
  assert.equal(buildBoat(short).def.propulsion.type, 'oars', 'no engine: rowed');
  assert.match(why({ engines: ['large'] }), /3 spots used, a medium boat has 2/); assert.match(why({ engines: ['small', 'medium'] }), /spots used/); assert.match(why({ hull: ['seat', 'seat', 'seat'] }), /hull: 3 spots/);
  assert.match(why({ deck: ['cabin', 'rod_holders'] }), /deck: 3 spots/); assert.match(why({ size: 'personal' }), /can't be personal/); assert.match(why({ build: 'raft' }), /build: one of/); assert.match(why({ engines: ['huge'] }), /no part called "huge"/);
  assert.match(why({ deck: ['console', 'console'] }), /once/); assert.match(buildBoat({ id: 'k', name: 'K', size: 'personal', build: 'kayak', engines: ['small'] }).errors.join(), /1 spots used, a personal boat has 0/);
  for (const D of BoatDB.list) { const m = D._mesh; let lined = 0; for (let i = 9; i < m.length; i += VS) if (m[i] === MT.GEN || m[i] === MT.WOOD) lined++; assert.equal(lined, 0, `${D.id}: plain surfaces, no grain or strata`); assert.ok(m.every(Number.isFinite), D.id); } }

for (const D of BoatDB.list) {
  // the water shader's table: the waterline beam is inside the gunwale beam everywhere
  for (let i = 0; i < 12; i++) assert.ok(D._wtab[i] >= 0 && D._wtab[i] <= D._wtab[12 + i] + 1e-6, `${D.id} station ${i}`);
  assert.ok(D._hullN > 0 && D._hullN <= D._mesh.length / VS);
}

// a blade's centre in the boat's frame for a stroke phase
const blade = (D, ph, k, sd = 1, live = true) => {
  const O = D._oars, m = oarPose(D, O, ph, k, sd, live, new Float32Array(12));
  const c = O.kind === 'oars' ? [0, 1.47, 0] : O.kind === 'double' ? [0, 1.12, 0] : [0, 0, -0.62], v = new Float32Array(VS); v.set(c);
  return oarXform(v, m, new Float32Array(VS));
};
for (const id of ['rowboat', 'canoe', 'touring_kayak']) {
  const D = BoatDB.byId[id]; assert.ok(D._oars && D._oars.live, id);
  const drive = blade(D, Math.PI / 2, 1), recover = blade(D, Math.PI * 1.5, 1);
  assert.ok(drive[2] < 0, `${id}: blade in the water on the drive (${drive[2]})`);
  assert.ok(recover[2] > drive[2] + 0.2, `${id}: blade lifted on the recovery`);
  assert.ok(blade(D, Math.PI / 2 - 0.4, 1)[0] > blade(D, Math.PI / 2 + 0.4, 1)[0], `${id}: blade sweeps aft while it's in the water`);
}
{ const D = BoatDB.byId.rowboat, p = blade(D, Math.PI / 2, 1, -1); assert.ok(p[1] < -D.hull.beam_m / 2 && p[2] < 0, 'port oar out on the port side'); }
{ const D = BoatDB.byId.touring_kayak, p = blade(D, -Math.PI / 2, 1); assert.ok(p[2] > 0.2, 'kayak: starboard blade up while the port one pulls'); }
assert.ok(!BoatDB.byId.fishing_kayak._oars.live, 'a pedal kayak keeps its paddle stowed');

// rocking: weight to starboard heels the boat to starboard (that side lower, as the hull is drawn); a canoe tips more than a lobster boat
assert.ok(E.boatTip(BoatDB.byId.canoe) > 10 * E.boatTip(BoatDB.byId.lobster_boat));
const boat = (id, x = 0, y = 0) => ({ def: BoatDB.byId[id], x, y, a: 0, z: 0, pitch: 0, roll: 0 });
{ const b = boat('rowboat'); for (let i = 0; i < 300; i++) E.boatRock(b, 1 / 60, 1, 0.4);
  b.roll = b.rock[0]; b.pitch = b.rock[1];
  assert.ok(b.roll < -0.02, `heel toward the weight (${b.roll})`); assert.ok(b.pitch < 0, 'bow down with weight forward');
  assert.ok(E.boatLocal(b, 0, 0.5, 0)[2] > E.boatLocal(b, 0, -0.5, 0)[2], 'the starboard deck sits lower in boatLocal too');
  for (let i = 0; i < 600; i++) E.boatRock(b, 1 / 60, null); assert.ok(Math.abs(b.rock[0]) < 1e-3, 'settles when you step off'); }
{ const b = boat('canoe'); E.boatKick(b, -1.2, 0.6); let lo = 0, hi = 0; for (let i = 0; i < 120; i++) { E.boatRock(b, 1 / 60, null); lo = Math.min(lo, b.rock[2]); hi = Math.max(hi, b.rock[0]); }
  assert.ok(lo < -0.02 && hi > 0.02, 'stepping in dips and wobbles a canoe'); }

// hulls are solid: you can't wade through one, can dive under it; boats bump into each other
E.boats = [boat('jon_boat')];
assert.ok(E.boatBlocks(0, 0, -0.5) && E.boatBlocks(1.5, 0.3, -1));
assert.ok(!E.boatBlocks(0, 3, -0.5) && !E.boatBlocks(0, 0, -4));
const other = boat('canoe', 0, 1.0); E.boats.push(other);
assert.equal(E.boatHits(E.boats[0], 0, 0), other); assert.equal(E.boatHits(E.boats[0], 0, -3), null);
console.log('Boat checks passed.');
