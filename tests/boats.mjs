import assert from 'node:assert/strict';
import fs from 'node:fs';

// Boat logic without a browser: the built-in boats, the oar / paddle stroke, the hull rocking under your weight, hulls being solid.
// Run from the repository root: node tests/boats.mjs
const read = p => fs.readFileSync(p, 'utf8');
const files = ['config', 'world/worldgen', 'models/mesh-builder', 'creatures/fish', 'creatures/cephalopods-shellfish', 'boats'];
const source = 'var BUILTIN = { fish: [], boat: [], tackle: [], feature: [] }; var Engine = {};\n' + files.map(f => read(`src/js/${f}.js`)).join('\n') + '\n' + read('src/js/engine/on-board.js');
const api = new Function('location', 'history', 'matchMedia', 'localStorage', source + '\nreturn { BoatDB, Engine, oarPose, oarXform, VS };')(
  { search: '', hash: '' }, { replaceState() {} }, () => ({ matches: false }), { getItem() { return null; } });
const { BoatDB, Engine: E, oarPose, oarXform, VS } = api;
for (const [, name] of read('src/index.html').matchAll(/data-builtin="boat" src="([^"]+)"/g)) assert.ok(BoatDB.register(JSON.parse(read(`src/${name}`)), { quiet: true }).def, name);
assert.ok(BoatDB.list.length >= 8);

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
