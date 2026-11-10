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
// breaststroke: both arms and both legs move together; arms reach past the head on the glide and point down mid-pull; knees draw up before the kick
for (let ph = 0; ph < 6.3; ph += 0.3) { const q = ctx.humanPose({ mode: 'swim', ph }).parts, of = n => q.filter(x => x[0] === n); bounds({ parts: q, hand: [0, 0, 0], head: [0, 0, 0] });
  for (const n of ['upper', 'fore', 'thigh', 'shin']) { const [l, r] = of(n); assert.equal(l[4], r[4], `${n} together at ${ph}`); assert.equal(l[2], -r[2], `${n} mirrored at ${ph}`); } }
const sw = ph => Object.fromEntries(ctx.humanPose({ mode: 'swim', ph }).parts.map(q => [q[0], q[4] + Math.PI / 2]));   // angles from the body's line
assert.ok(Math.abs(sw(5.8).upper - Math.PI) < 0.01 && Math.abs(sw(5.8).thigh) < 0.01, 'glide: arms out ahead, legs straight'); assert.ok(sw(2.1).upper < 1.3, 'pull: arms down under the shoulders'); assert.ok(sw(3.7).shin < -0.8 && sw(3.7).thigh > 0.6, 'knees drawn up before the kick');
// the look is data (src/angler/angler.json): an outfit per climate, and other skin, hair and colours, all still build
const shipped = JSON.parse(fs.readFileSync('src/angler/angler.json', 'utf8')), count = m => Object.values(m).reduce((a, p) => a + p.length, 0), ok = (m, why) => { for (const [name, v] of Object.entries(m)) assert.ok(v.length > 0 && v.every(Number.isFinite), `${why}: ${name}`); };
const colours = m => new Set(Object.values(m).flatMap(v => { const out = []; for (let i = 0; i < v.length; i += ctx.VS) out.push([v[i + 6], v[i + 7], v[i + 8]].map(x => Math.round(x * 255)).join()); return out; }));
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(), has = (m, h) => colours(m).has(hex(h)), wear = {};
for (const climate of ['temperate', 'arctic', 'tropical']) { const m = wear[climate] = ctx.humanParts(shipped, climate), O = shipped.outfits[climate]; ok(m, climate);
  for (const k of ['hat', 'top', 'bottom', 'feet']) assert.ok(has(m, O.colors[k]), `${climate}: ${k} colour on the model`); }
const mesh = (m, part) => { const v = m[part], s = new Set(); for (let i = 0; i < v.length; i += ctx.VS) s.add([v[i + 6], v[i + 7], v[i + 8]].map(x => Math.round(x * 255)).join()); return s; };
assert.ok(mesh(wear.tropical, 'upper').has(hex(shipped.skin)) && mesh(wear.tropical, 'upper').size === 1, 'tank top: bare arms'); assert.ok(mesh(wear.tropical, 'shin').has(hex(shipped.skin)), 'shorts: bare shins');
assert.ok(!mesh(wear.arctic, 'fore').has(hex(shipped.skin)), 'jacket: gloves, no bare hands'); assert.ok(mesh(wear.temperate, 'torso').size >= 3, 'flannel: two colours and the vest');
for (const look of [{ skin: '#8d5a3c', hair: { style: 'ponytail', color: '#111111' }, outfits: { temperate: { hat: null, colors: { top: '#aa3344' } } } }, { hair: { style: 'long' } }, { hair: { style: 'none' }, skin: 'nonsense' }, undefined]) ok(ctx.humanParts(look), JSON.stringify(look));
assert.ok(count(ctx.humanParts({ outfits: { temperate: { hat: null } } })) < count(ctx.humanParts()), 'no hat: fewer triangles');
assert.ok(has(ctx.humanParts({ hair: { color: '#ff0000' } }), '#ff0000'), 'hair colour reaches the mesh');
console.log('Human model checks passed.');
