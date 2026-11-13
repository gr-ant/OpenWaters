'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = { P: { x: 0, y: 0, z: 0, a: 0, pitch: 0 }, time: 0, ang: { out: false }, boats: [], fish: [], fishCells: new Map(), removeFish() {}, say() {}, buzz() {}, toggleRod() {}, logCatch() {}, boatDeckZ() { return 0; } };
const ctx = vm.createContext({ Engine: E, CONFIG: { showArms: true, skinColor: '#dba985', sleeveColor: '#446644' },
  clamp: (x, a, b) => Math.max(a, Math.min(b, x)), hexRGB: h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255),
  EYE: 1.62, FOV: 1.2, ZERO3: [0, 0, 0], fishHandling: () => ({ hold: 'cradle', lip: true }),
  document: { getElementById: () => null }, localStorage: { getItem: () => null }, Game: { on() {}, onHud() {} } });
for (const f of ['models/mesh-builder', 'fishing/drawing', 'hands']) vm.runInContext(fs.readFileSync(`src/js/${f}.js`, 'utf8'), ctx);
const mesh = (side, curl) => vm.runInContext(`armMesh(${side}, ${curl})`, ctx);
for (const side of [-1, 1]) {
  const open = mesh(side, 0), closed = mesh(side, 1);
  assert.equal(open.length, closed.length, 'morph topology stays fixed');
  assert.equal(open.length % 30, 0, 'lit triangles keep the vertex layout');
  for (const curl of [0, 0.25, 0.5, 0.75, 1]) {
    const m = mesh(side, curl); assert.ok(m.every(Number.isFinite));
    for (let i = 0; i < m.length; i += 10) assert.ok(Math.abs(Math.hypot(m[i + 3], m[i + 4], m[i + 5]) - 1) < 0.001, 'unit lit normals');
  }
  assert.ok(Math.max(...open.filter((_, i) => i % 10 === 0)) > Math.max(...closed.filter((_, i) => i % 10 === 0)) + 0.02, 'fingers open visibly');
}
// Exercise the actual morph upload path, including its intermediate normals.
let uploaded;
E.gl = { ARRAY_BUFFER: 1, bindBuffer() {}, bufferSubData(_, offset, data) { assert.equal(offset, 0); uploaded = data; } };
const gpu = new Map(); E.tackleGpu = (key, build) => { if (!gpu.has(key)) gpu.set(key, { vb: {}, n: build().length / 10 }); return gpu.get(key); };
for (const curl of [0, 0.13, 0.49, 0.87, 1]) {
  vm.runInContext(`posedArm(Engine, 1, ${curl})`, ctx);
  assert.ok(uploaded.every(Number.isFinite));
  for (let i = 0; i < uploaded.length; i += 10) assert.ok(Math.abs(Math.hypot(uploaded[i + 3], uploaded[i + 4], uploaded[i + 5]) - 1) < 0.001);
}
assert.equal(gpu.size, 1, 'curling reuses one GPU mesh');
const fish = weight => ({ x: 0.6, y: 0, z: 0.1, a: -3, pitch: 0, roll: 1, ph: 0, len: 0.4, weightKg: weight, lengthCm: 40, name: 'Fish', def: { body: { height: 0.25 } } });
const step = dt => { E.time += dt; E.carryStep(dt); };
for (const fps of [30, 60, 144]) {
  const f = fish(8); E.carryFish(f); const start = [f.x, f.y, f.z]; step(0);
  assert.deepEqual([f.x, f.y, f.z], start, 'no initial teleport');
  for (let i = 0; i < fps; i++) step(1 / fps);
  assert.ok(f.z > 1 && Number.isFinite(f.pitch), 'fish reaches carrying height');
  const before = [f.x, f.y, f.z, f.pitch]; E.swapGrip(); step(0);
  assert.deepEqual([f.x, f.y, f.z, f.pitch], before, 'grip swap starts continuously');
  for (let i = 0; i < fps / 2; i++) step(1 / fps);
  E.dropFish(); const act = E.carry.action; E.dropFish(); assert.equal(E.carry.action, act, 'repeated release does not restart');
  step(0.15); assert.ok(E.carry, 'fish remains held during release reach'); step(0.2);
  assert.equal(E.carry, null); assert.equal(E.loose.at(-1).f, f, 'release transfers ownership once');
}
const light = fish(1); E.carryFish(light); const lightTime = E.carry.liftTime;
E.carryFish(fish(12)); assert.ok(E.carry.liftTime > lightTime, 'heavy fish takes longer to lift');
E.swim = true; step(0.016); assert.equal(E.carry, null, 'swimming frees hands immediately'); E.swim = false;
const boat = { x: 0, y: 0, z: 0, a: 0, def: {}, _well: { kind: 'bucket', name: 'bucket', cap: 1, lx: 0.3, ly: 0 }, well: [] };
E.boats = [boat]; const f = fish(2); E.carryFish(f); step(1); E.keepCarried();
assert.equal(boat.well.length, 0, 'storage waits for placement'); step(0.35);
assert.equal(boat.well[0], f); assert.equal(E.carry, null);
assert.equal(E.takeFromWell(), true); assert.equal(boat.well.length, 0); const z = f.z; step(0.1);
assert.equal(f.z, z, 'reach into bucket precedes lift'); step(0.7); assert.ok(f.z > z);
console.log('Hand mesh and carry animation checks passed.');

// Real screenshot species: check that contact is on the skin, not the old inflated clearance shell.
const trout = JSON.parse(fs.readFileSync('src/fish/rainbow_trout.json', 'utf8'));
const bass = JSON.parse(fs.readFileSync('src/fish/largemouth_bass.json', 'utf8'));
ctx.reviewFish = { ...fish(1), len: 0.35, a: 1.1, pitch: 0.12, roll: 0, def: trout };
for (const side of [-1, 1]) {
  ctx.reviewSide = side;
  const pose = vm.runInContext("fishHandPose(reviewFish, 'cradle', reviewSide, [0, 1, 0])", ctx);
  const hand = vm.runInContext("armMesh(reviewSide, 0.18, 'fish', 'hand')", ctx);
  let gap = Infinity;
  for (let i = 0; i < hand.length; i += 10) gap = Math.min(gap, Math.hypot(...pose.anchor.map((v, k) => hand[i + k] - v)));
  assert.ok(gap < 0.008, `support surface within 8 mm of belly (${gap})`);
  const frame = vm.runInContext('fishHandFrame(reviewFish)', ctx);
  assert.ok(pose.basis[2].reduce((n, v, k) => n + v * frame[2][k], 0) < -0.999, 'palms lie flat against belly');
}
ctx.reviewFish = { ...ctx.reviewFish, def: bass, pitch: 1.5, open: 0.85 };
{
  const pose = vm.runInContext("fishHandPose(reviewFish, 'lip', 1, [0, 1, 0])", ctx);
  const hand = vm.runInContext("armMesh(1, 1, 'lip', 'hand')", ctx);
  const frame = vm.runInContext('fishHandFrame(reviewFish)', ctx);
  assert.ok(pose.basis[2].reduce((n, v, k) => n + v * frame[1][k], 0) > 0.999, 'back of hand faces the near flank / player');
  // Inspect the actual mesh silhouette, not just a hardcoded fingertip location.
  // No knuckle or curled finger may form a loop above the thumb's jaw contact.
  let highest = -Infinity;
  for (let i = 0; i < hand.length; i += 10) {
    const local = pose.anchor.map((v, k) => hand[i + k] - v);
    const world = frame[0].map((_, k) => pose.basis.reduce((n, axis, j) => n + axis[k] * local[j], 0));
    highest = Math.max(highest, world.reduce((n, v, k) => n + v * frame[0][k], 0));
    assert.ok(Math.abs(Math.hypot(hand[i + 3], hand[i + 4], hand[i + 5]) - 1) < 0.001, 'lip normals remain unit length');
  }
  assert.ok(highest < 0.015, `hand stays below jaw contact apart from thumb pad (${highest})`);
  const support = vm.runInContext("armMesh(1, 1, 'fish', 'hand')", ctx);
  assert.equal(hand.length, support.length, 'lip/support morph topology matches');
  for (let i = 0; i < hand.length; i += 10) for (let k = 6; k < 9; k++) assert.equal(hand[i + k], support[i + k], 'same skin colour in both poses');

  let tipGap = Infinity;
  for (let i = 0; i < hand.length; i += 10) tipGap = Math.min(tipGap, Math.hypot(...pose.anchor.map((v, k) => hand[i + k] - v)));
  assert.ok(tipGap < 0.01, 'thumb geometry surrounds its jaw contact');
}

// Run the draw path as well as the simulation: the screenshot regression was invisible hands at 0.2s.
E.boats = []; E._handPoses = null; E.P.pitch = -0.15;
E.tanX = Math.tan(75 * Math.PI / 360); E.tanY = E.tanX * 1080 / 1920;
let roll = 0, draws = [];
Object.assign(E.gl, { uniform1f(name, v) { if (name === 'roll') roll = v; }, uniform3fv() {}, bindVertexArray() {}, drawArraysInstanced() {} });
E.upInst = (g, values) => { assert.ok(values.every(Number.isFinite)); draws.push({ key: g.key, values, roll }); };
E.tackleGpu = (key, build) => { if (!gpu.has(key)) gpu.set(key, { key, vb: {}, n: build().length / 10 }); return gpu.get(key); };
const Lp = { u: { roll: 'roll' } };
const inView = p => {
  const delta = [p[0], p[1], p[2] - 1.62], cp = Math.cos(E.P.pitch), sp = Math.sin(E.P.pitch);
  const depth = delta[0] * cp + delta[2] * sp, up = -delta[0] * sp + delta[2] * cp;
  return depth > 0.18 && Math.abs(up / depth) < E.tanY && Math.abs(delta[1] / depth) < E.tanX;
};
for (const len of [0.18, 0.35, 0.7]) for (const fps of [30, 60, 144]) {
  const f = { ...fish(2), def: bass, len, x: 0.8, y: 0, z: 0, roll: 0 };
  E.carryFish(f); E.carry.grip = 'hand'; E._handPoses = null;
  for (let n = 0; n < Math.ceil(fps * 0.2); n++) { step(1 / fps); draws = []; E.drawArms(E.gl, Lp); }
  assert.ok(inView([f.x, f.y, f.z]), `fish in frame by 0.2s, ${len}m at ${fps}fps`);
  const palm = draws.find(d => d.key && d.key.includes(':body:hand:'));
  assert.ok(palm && inView(palm.values.slice(0, 3)), `palm in frame by 0.2s, ${len}m at ${fps}fps`);
}
console.log('Fish contact and lift framing checks passed.');

// A 10–40 cm Arctic cod must be enclosed by a hand, not presented in front of an open palm.
const cod = JSON.parse(fs.readFileSync('src/fish/arctic_cod.json', 'utf8'));
for (const len of [0.1, 0.15, 0.18, 0.25, 0.4]) {
  ctx.reviewFish = { ...fish(1), def: cod, len, a: Math.PI / 2, pitch: 0, roll: 0 };
  const pose = vm.runInContext("fishHandPose(reviewFish, 'hand', 1, [0, 1, 0])", ctx);
  ctx.bodyFit = pose.bodyFit;
  const hand = vm.runInContext("armMesh(1, 1, 'body', 'hand', bodyFit)", ctx);
  assert.ok(hand.every(Number.isFinite));
  assert.ok(pose.basis[2][0] < -0.99, 'back of hand faces camera; palm faces fish');
  assert.ok(pose.origin[1] > 0 && pose.origin[2] < ctx.reviewFish.z, 'hand approaches behind head from below-right');
  const [cx, , cz] = pose.bodyFit.center;
  const nearest = target => { let best = Infinity; for (let i = 0; i < hand.length; i += 10) best = Math.min(best, Math.hypot(...target.map((v, k) => hand[i + k] - v))); return best; };
  assert.ok(nearest(pose.anchor) < 0.008, 'palm touches near flank');
  const [height, width] = pose.bodyFit.radii[1];
  const dorsal = [cx + height, -0.00825, cz].map(v => v * 0.84);
  assert.ok(nearest(dorsal) < 0.012, `fingers touch over the back of ${len}m fish`);
  if (len <= 0.25) {
    const far = [cx, -0.00825, cz - width].map(v => v * 0.84);
    assert.ok(nearest(far) < 0.012, `fingers return down opposite flank of ${len}m fish`);
  }
  const top = Math.max(...hand.filter((_, i) => i % 10 === 0)) / 0.84;
  assert.ok(top < cx + Math.max(...pose.bodyFit.radii.map(r => r[0])) + 0.027, 'no straight fingers sticking up above fish');
  // The fitted upload shares the ordinary vertex layout, with finite, unit normals.
  vm.runInContext("posedArm(Engine, 1, 1, 'body', 'hand', 0, bodyFit)", ctx);
  for (let i = 0; i < uploaded.length; i += 10) assert.ok(Math.abs(Math.hypot(uploaded[i + 3], uploaded[i + 4], uploaded[i + 5]) - 1) < 0.001);
  const f = { ...fish(1), def: cod, len, x: 0.8, y: 0, z: 0 };
  E.carryFish(f); E.carry.grip = 'hand'; E._handPoses = null;
  for (let n = 0; n < 60; n++) step(1 / 60);
  const depth = f.x * Math.cos(E.P.pitch) + (f.z - 1.62) * Math.sin(E.P.pitch);
  assert.ok(depth > 0.47, 'small fish held farther away, without scaling its hand');
  assert.ok(inView([f.x, f.y, f.z]), 'fish stays framed');
}
console.log('Small fish body-grip checks passed.');
