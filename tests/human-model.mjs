import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// The third-person angler (src/js/models/human.js): every part builds, and the posed figure has a sane size and stands on its feet.
const ctx = vm.createContext({});
vm.runInContext('const clamp = (v, a, b) => v < a ? a : v > b ? b : v;\n' + ['models/mesh-builder', 'models/human'].map(f => fs.readFileSync(`src/js/${f}.js`, 'utf8')).join('\n')
  + '\nthis.humanParts = humanParts; this.humanPose = humanPose; this.humanPlace = humanPlace; this.VS = VS;', ctx);
const shipped = JSON.parse(fs.readFileSync('src/angler/angler.json', 'utf8')), clothes = JSON.parse(fs.readFileSync('src/angler/clothes.json', 'utf8')).clothes;
const parts = ctx.humanParts(shipped, 'temperate', clothes);   // dressed as shipped, for a temperate island
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
for (let ph = 0; ph < 6.3; ph += 0.7) { const w = bounds(ctx.humanPose({ mode: 'stand', swing: 1, ph })); assert.ok(Math.abs(w.lo[2]) < 0.03, `walking stride ${ph}: feet at ${w.lo[2]}`); }
const sp = ctx.humanPose({ mode: 'swim', ph: 1 }), swim = bounds(sp), hp = sp.parts.find(q => q[0] === 'hips'); assert.ok(Math.abs(sp.head[2] - hp[3]) < 0.05 && sp.head[0] - hp[1] > 0.6, `swimming lies flat, head first: ${sp.head} ${hp}`);
const sit = ctx.humanPose({ mode: 'sit', hipZ: 0.45 }), st = bounds(sit); assert.ok(Math.abs(st.lo[2]) < 0.05 && st.hi[2] < 1.4, 'seated: feet on the floor, head lower');
const rod = ctx.humanPose({ mode: 'stand', rod: true }); assert.ok(rod.hand[0] > 0.2 && rod.hand[1] > 0 && rod.hand[2] > 0.9, `rod hand out in front, on the right: ${rod.hand}`);
// breaststroke: both arms and both legs move together; arms reach past the head on the glide and point down mid-pull; knees draw up before the kick
for (let ph = 0; ph < 6.3; ph += 0.3) { const q = ctx.humanPose({ mode: 'swim', ph }).parts, of = n => q.filter(x => x[0] === n); bounds({ parts: q, hand: [0, 0, 0], head: [0, 0, 0] });
  for (const n of ['upper', 'fore', 'thigh', 'shin', 'foot']) { const [l, r] = of(n); assert.equal(l[4], r[4], `${n} together at ${ph}`); assert.ok(Math.abs(l[2] + r[2]) < 1e-9 && l[5] === -r[5], `${n} mirrored at ${ph}`); } }
{ const q = ctx.humanPose({ mode: 'swim', ph: 1.1 }).parts.filter(x => x[0] === 'fore'), wide = Math.abs(ctx.humanPlace(q[1], 0, 0, -0.3)[1]); assert.ok(wide > 0.3, `hands sweep wide on the pull: ${wide}`); }
// walking: the shoulders turn against the hips, each ankle rolls (toes up to land, down to push off), and the pose is continuous round the stride
{ const at = ph => Object.fromEntries(ctx.humanPose({ mode: 'stand', swing: 0.55, ph }).parts.map(q => [q[0], q])), a = at(Math.PI);   // the right leg just landing, out in front
  assert.ok(a.torso[6] > 0.03 && a.hips[6] < -0.01, 'right leg forward: shoulders turn one way, hips the other');
  const feet = []; for (let ph = 0; ph < 6.3; ph += 0.1) feet.push(ctx.humanPose({ mode: 'stand', swing: 0.55, ph }).parts.filter(q => q[0] === 'foot')[1][4]);
  assert.ok(Math.max(...feet) > 0.1 && Math.min(...feet) < -0.2, `the ankle rolls: ${Math.min(...feet)} .. ${Math.max(...feet)}`);
  let jump = 0, prev = ctx.humanPose({ mode: 'stand', swing: 1, gait: 2, ph: 0 }).parts; for (let ph = 0.02; ph < 6.4; ph += 0.02) { const cur = ctx.humanPose({ mode: 'stand', swing: 1, gait: 2, ph }).parts; cur.forEach((q, n) => { for (let j = 1; j < 7; j++) jump = Math.max(jump, Math.abs(q[j] - prev[n][j])); }); prev = cur; }
  assert.ok(jump < 0.06, `no joint jumps during a running stride: ${jump}`); }
const sw = ph => Object.fromEntries(ctx.humanPose({ mode: 'swim', ph }).parts.map(q => [q[0], q[4] + Math.PI / 2]));   // angles from the body's line
assert.ok(Math.abs(sw(5.8).upper - Math.PI) < 0.01 && Math.abs(sw(5.8).thigh) < 0.01, 'glide: arms out ahead, legs straight'); assert.ok(sw(2.1).upper < 1.3, 'pull: arms down under the shoulders'); assert.ok(sw(3.7).shin < -0.8 && sw(3.7).thigh > 0.6, 'knees drawn up before the kick');
// trousers: no skin on the hips or legs, standing or mid frog kick (the legs apart)
{ const m = ctx.humanParts(shipped, 'temperate', clothes), skinC = [1, 3, 5].map(i => parseInt(shipped.skin.slice(i, i + 2), 16) / 255);
  for (const pose of [ctx.humanPose({ mode: 'stand' }), ctx.humanPose({ mode: 'swim', ph: 3.6 }), ctx.humanPose({ mode: 'sit', hipZ: 0.45 })]) for (const name of ['hips', 'thigh']) { const v = m[name]; let far = 0, farSkin = 0;
    for (let i = 0; i < v.length; i += ctx.VS) { const r = Math.hypot(v[i], v[i + 1], Math.min(0, v[i + 2] + 0.02) * 0), isSkin = Math.abs(v[i + 6] - skinC[0]) < 0.01 && Math.abs(v[i + 7] - skinC[1]) < 0.01; if (v[i + 2] > -0.05) { if (isSkin) farSkin = Math.max(farSkin, r); else far = Math.max(far, r); } }
    assert.ok(farSkin < far - 0.005, `${name}: cloth stands off the skin (${farSkin} < ${far})`); } }
// every step moves the body the ground it takes: while a foot is flat on the ground it stays at one spot as the body travels on
for (const [gait, stride] of [[0, 0.5], [0, 1.4], [1, 2.4], [2, 3.1]]) for (const leg of [0, 1]) { const spots = [];
  for (let ph = 0; ph < 6.2832; ph += 0.02) { const P = ctx.humanPose({ mode: 'stand', swing: 1, gait, stride, ph }), ft = P.parts.filter(q => q[0] === 'foot')[leg];
    if (Math.abs(ft[4]) < 1e-6 && ft[3] < 0.085) spots.push(ft[1] + ph / 6.2832 * stride); }   // flat and down: where it is on the ground (the body has gone ph / 2pi of a stride)
  assert.ok(spots.length > 5 && Math.max(...spots) - Math.min(...spots) < 0.012, `gait ${gait}, stride ${stride} m, leg ${leg}: planted foot stays put (${spots.length} samples, drift ${Math.max(...spots) - Math.min(...spots)})`); }
// jumping: off the ground legs straight and arms up, knees tucked at the top, legs reaching down to land; then the knees take the landing
{ const J = r => { const P = ctx.humanPose({ mode: 'jump', rise: r }), by = n => P.parts.filter(q => q[0] === n)[1]; return { P, knee: by('thigh')[4] - by('shin')[4], arm: by('upper')[4], out: Math.abs(by('upper')[5]), lo: bounds(P).lo[2] }; }, up = J(1), top = J(0), down = J(-1);
  for (const j of [up, top, down]) assert.ok(Math.abs(j.lo) < 0.03, `jump: feet are the lowest point (${j.lo})`);
  assert.ok(up.knee < 0.5 && top.knee > 1.4 && down.knee < 1, `knees: ${up.knee} ${top.knee} ${down.knee}`); assert.ok(up.arm > 1.6 && down.out > up.out + 0.3, `arms up, then out: ${up.arm} ${up.out} ${down.out}`);
  const hipOf = o => ctx.humanPose(o).parts[0][3]; assert.ok(hipOf({ mode: 'stand', crouch: 1 }) < hipOf({ mode: 'stand' }) - 0.15 && Math.abs(bounds(ctx.humanPose({ mode: 'stand', crouch: 1 })).lo[2]) < 0.03, 'landing: the hips drop, the feet stay down'); }
// casting: wound back, the rod hand is up, back and out to the right; following through, it's out in front and lower
{ const hand = o => ctx.humanPose(Object.assign({ mode: 'stand', rod: true }, o)).hand, rest = hand({}), back = hand({ castW: 1 }), thru = hand({ castF: 1 });
  assert.ok(back[2] > rest[2] + 0.25 && back[0] < rest[0] - 0.1 && back[1] > rest[1] + 0.05, `wound back: ${back} from ${rest}`); assert.ok(thru[0] > rest[0] + 0.05 && thru[2] < back[2], `follow-through: ${thru}`); bounds(ctx.humanPose({ mode: 'stand', rod: true, castW: 1 })); }
// both hands: casting or winding, the left hand comes across to the rod by the right one (and goes round with the reel handle)
{ const left = o => { const P = ctx.humanPose(Object.assign({ mode: 'stand', rod: true }, o)), q = P.parts.filter(x => x[0] === 'fore')[0]; bounds(P); return [ctx.humanPlace(q, 0, 0, -0.31), P.hand]; }, gap = ([l, r]) => Math.hypot(l[0] - r[0], l[1] - r[1], l[2] - r[2]);
  assert.ok(gap(left({})) > 0.35, `one-handed: the left hand hangs by the side (${gap(left({}))})`);
  for (const o of [{ hands2: true }, { hands2: true, castW: 1 }, { hands2: true, castF: 1 }, { hands2: true, crank: 1 }, { hands2: true, crank: 4, mode: 'sit', hipZ: 0.45 }]) assert.ok(gap(left(o)) < 0.2, `both hands ${JSON.stringify(o)}: ${gap(left(o))}`);
  const a = left({ hands2: true, crank: 0 })[0], b = left({ hands2: true, crank: Math.PI })[0]; assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) > 0.04, 'the winding hand goes round'); }
// hands put on something (a wheel, a throttle): each hand ends on its point when it's within reach
{ const hands = o => { const P = ctx.humanPose(Object.assign({ mode: 'sit', hipZ: 0.45 }, o)), F = P.parts.filter(x => x[0] === 'fore'); bounds(P); return F.map(q => ctx.humanPlace(q, 0, 0, -0.31)); }, near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const L = [0.4, -0.13, 0.85], R = [0.4, 0.13, 0.85], [l, r] = hands({ reachL: L, reachR: R }); assert.ok(near(l, L) < 0.03 && near(r, R) < 0.03, `hands on the wheel: ${near(l, L)} ${near(r, R)}`);
  const T = [0.45, 0.4, 1.0], [, r2] = hands({ reachL: L, reachR: T }); assert.ok(near(r2, T) < 0.03, 'right hand to the throttle'); const [l0] = hands({}); assert.ok(near(l0, L) > 0.2, 'not without being asked'); }
// three gaits: a walker's arms hang long and a foot is always down; a jogger's elbows are bent; a runner lifts the knee highest and leaves the ground
{ const G = g => { let elbow = 0, knee = -9, air = 0; for (let ph = 0; ph < 6.3; ph += 0.05) { const P = ctx.humanPose({ mode: 'stand', swing: 1, gait: g, ph }), by = n => P.parts.filter(q => q[0] === n);
    elbow = Math.max(elbow, by('fore')[0][4] - by('upper')[0][4]); knee = Math.max(knee, by('thigh')[1][4]); air = Math.max(air, bounds(P).lo[2]); } return { elbow, knee, air }; }, w = G(0), j = G(1), r = G(2);
  assert.ok(w.air < 0.03 && j.air > w.air + 0.02 && r.air > j.air + 0.02,   // (a boot's rounded sole sits a little above the flat one the pose stands on)
    `walkers stay down, joggers and runners fly: ${w.air} ${j.air} ${r.air}`);
  assert.ok(w.elbow < 0.7 && j.elbow > 1.3 && r.elbow > 1.5, `elbows: ${w.elbow} ${j.elbow} ${r.elbow}`); assert.ok(w.knee < j.knee - 0.1 && j.knee < r.knee - 0.25, `knee lift: ${w.knee} ${j.knee} ${r.knee}`); }
// the look is data: angler.json (skin, hair, what's worn per climate and its colours) and clothes.json (every garment's shapes)
const count = m => Object.values(m).reduce((a, p) => a + p.length, 0), ok = (m, why) => { for (const [name, v] of Object.entries(m)) assert.ok(v.length > 0 && v.every(Number.isFinite), `${why}: ${name}`); };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(), wear = {};
const mesh = (m, part) => { const s = new Set(); for (const v of part ? [m[part]] : Object.values(m)) for (let i = 0; i < v.length; i += ctx.VS) s.add([v[i + 6], v[i + 7], v[i + 8]].map(x => Math.round(x * 255)).join()); return s; };
const bare = ctx.humanParts(shipped, 'nowhere', clothes); ok(bare, 'bare'); assert.deepEqual([...mesh(bare)].sort(), [hex(shipped.skin), hex(shipped.hair.color)].sort(), 'no outfit: just skin and hair');
for (const climate of ['temperate', 'arctic', 'tropical']) { const m = wear[climate] = ctx.humanParts(shipped, climate, clothes), O = shipped.outfits[climate]; ok(m, climate);
  for (const id of O.wear) assert.ok(clothes.some(g => g.id === id), `${climate}: ${id} is in clothes.json`);
  for (const [k, c] of Object.entries(O.colors)) assert.ok(mesh(m).has(hex(c)), `${climate}: ${k} colour on the model`);
  assert.ok(!mesh(m).has('128,128,128'), `${climate}: every shape found its colour`); assert.ok(count(m) > count(bare), `${climate}: dressed`); }
for (const g of clothes) for (const [name, list] of Object.entries(g.parts)) { assert.ok(name in bare, `${g.id}: part ${name}`); for (const q of list) assert.ok(['blob', 'tube', 'oval', 'wrap'].filter(k => q[k]).length === 1 && q.color, `${g.id}.${name}: ${JSON.stringify(q)}`); }
assert.ok(mesh(wear.tropical, 'upper').has(hex(shipped.outfits.tropical.colors.top)) && mesh(wear.tropical, 'fore').has(hex(shipped.outfits.tropical.colors.top)), 'sun shirt: long sleeves'); assert.deepEqual([...mesh(bare, 'upper')], [hex(shipped.skin)], 'nothing on: bare arms');
assert.ok(mesh(wear.arctic, 'fore').has(hex(shipped.outfits.arctic.colors.gloves)), 'jacket: gloves'); assert.equal(mesh(wear.temperate, 'torso').size, 3, 'plain colours: skin, flannel, vest');
// a garment made up on the spot, bad shapes skipped, unknown garments ignored
const odd = ctx.humanParts({ hair: { style: 'ponytail', color: '#ff0000' }, outfits: { x: { wear: ['scarf', 'missing'], colors: { wool: '#00ff00' } } } }, 'x', [{ id: 'scarf', parts: { torso: [{ oval: [0.05, 0.09, 0.09, -0.02, 0.11, 0.11], color: 'wool' }, { blob: ['a'], color: 'wool' }, { tube: [0, 1], color: 'wool' }, null] } }]);
ok(odd, 'scarf'); assert.ok(mesh(odd, 'torso').has('0,255,0') && mesh(odd, 'head').has('255,0,0'), 'a new garment and hair colour reach the mesh');
for (const look of [{ hair: { style: 'long' } }, { hair: { style: 'none' }, skin: 'nonsense' }, undefined]) ok(ctx.humanParts(look), JSON.stringify(look));
console.log('Human model checks passed.');
