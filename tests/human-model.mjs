import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// The third-person angler (src/js/models/human.js): every part builds, and the posed figure has a sane size and stands on its feet.
const ctx = vm.createContext({});
vm.runInContext('const clamp = (v, a, b) => v < a ? a : v > b ? b : v;\n' + ['models/mesh-builder', 'models/human'].map(f => fs.readFileSync(`src/js/${f}.js`, 'utf8')).join('\n')
  + '\nthis.humanParts = humanParts; this.humanPose = humanPose; this.humanPlace = humanPlace; this.VS = VS;', ctx);
const parts = ctx.humanParts();
for (const [name, m] of Object.entries(parts)) { assert.ok(m.length > 0 && m.length % (ctx.VS * 3) === 0, name); assert.ok(m.every(Number.isFinite), `${name}: finite`); }
const bounds = pose => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const q of pose.parts) { const m = parts[q[0]]; assert.ok(m, q[0]);
    for (let i = 0; i < m.length; i += ctx.VS) { const p = ctx.humanPlace(q, m[i], m[i + 1], m[i + 2]); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } } }
  assert.ok([...lo, ...hi, ...pose.hand, ...pose.head].every(Number.isFinite)); return { lo, hi }; };
const stand = ctx.humanPose({ mode: 'stand' }), s = bounds(stand);
console.log({ stand: s, parts: stand.parts.length });
assert.ok(s.hi[2] >= 1.7 && s.hi[2] <= 1.8, `height ${s.hi[2]}`);
assert.ok(Math.abs(s.lo[2]) < 0.01, `feet at ${s.lo[2]}`);
assert.ok(s.hi[1] - s.lo[1] < 0.7 && s.hi[0] - s.lo[0] < 0.45, 'about a person wide and deep');
for (let ph = 0; ph < 6.3; ph += 0.7) { const w = bounds(ctx.humanPose({ mode: 'stand', swing: 1, ph })); assert.ok(Math.abs(w.lo[2]) < 0.03, `running stride ${ph}: feet at ${w.lo[2]}`); }
const sp = ctx.humanPose({ mode: 'swim', ph: 1 }), swim = bounds(sp), hp = sp.parts.find(q => q[0] === 'hips'); assert.ok(Math.abs(sp.head[2] - hp[3]) < 0.05 && sp.head[0] - hp[1] > 0.6, `swimming lies flat, head first: ${sp.head} ${hp}`);
const sit = ctx.humanPose({ mode: 'sit', hipZ: 0.45 }), st = bounds(sit); assert.ok(Math.abs(st.lo[2]) < 0.05 && st.hi[2] < 1.4, 'seated: feet on the floor, head lower');
const rod = ctx.humanPose({ mode: 'stand', rod: true }); assert.ok(rod.hand[0] > 0.2 && rod.hand[1] > 0 && rod.hand[2] > 0.9, `rod hand out in front, on the right: ${rod.hand}`);
// the look is data (src/angler/angler.json): the shipped file, and a different build, hair and outfit, all still build
const shipped = JSON.parse(fs.readFileSync('src/angler/angler.json', 'utf8')), count = m => Object.values(m).reduce((a, p) => a + p.length, 0);
for (const look of [shipped, { build: 'female', skin: '#8d5a3c', hair: { style: 'ponytail', color: '#111111' }, outfit: { cap: null, vest: null, shirt: '#aa3344' } }, { hair: { style: 'long' } }, { hair: { style: 'none' }, skin: 'nonsense' }]) {
  const m = ctx.humanParts(look); for (const [name, v] of Object.entries(m)) assert.ok(v.length > 0 && v.every(Number.isFinite), `${JSON.stringify(look)}: ${name}`); }
assert.ok(count(ctx.humanParts({ outfit: { cap: null, vest: null } })) < count(ctx.humanParts(shipped)), 'no cap or vest: fewer triangles');
vm.runInContext(`this.red = (() => { const m = humanParts({ outfit: { shirt: '#ff0000' } }).upper; return [m[6], m[7], m[8]]; })()`, ctx); assert.deepEqual([...ctx.red], [1, 0, 0], 'outfit colours reach the mesh');
ctx.humanParts(shipped);   // back to the shipped build's widths
console.log('Human model checks passed.');
