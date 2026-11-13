import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Birds without a browser: the flamingo wades only in tropical shallow salt water, the penguins never fly and keep to one
// islet of an arctic island, and the older species build exactly the meshes they always did.
// Run from the repository root: node tests/birds.mjs
const read = p => fs.readFileSync(p, 'utf8'), html = read('src/index.html');
const island = [...html.matchAll(/js\/(world\/island[\w-]*)\.js/g)].map(m => m[1]);
const files = ['config', 'world/worldgen', ...island, 'engine/shared', 'world/seasons-weather', 'world/water-temp', 'models/mesh-builder', 'creatures/fish', 'birds/birds'];
const features = [...html.matchAll(/data-builtin="feature" src="([^"]+)"/g)].map(m => read(`src/${m[1]}`));
const defs = [...html.matchAll(/data-builtin="bird" src="([^"]+)"/g)].map(m => JSON.parse(read(`src/${m[1]}`)));
const source = `var BUILTIN = { fish: [], boat: [], tackle: [], feature: [${features.join(',')}], plant: [] }; var TREE_KINDS = [];\n` + files.map(f => read(`src/js/${f}.js`)).join('\n')
  + '\nreturn { Birds, CONFIG, CLIMATE, ENV, LAYOUT, WLW, islandBase, buildIsland, findWater, waterInfo, groundAt };';
var loaded = {};
function load(climate, seed) {
  if (loaded[climate + seed]) return loaded[climate + seed];
  const Engine = { tod: 0.45, time: 0, P: { x: 0, y: 0, z: 0, a: 0 }, chunks: new Map(), boats: [], treeMesh: {}, swellAt: () => 0 };
  const Game = { ripple() {}, splash() {}, emit() {}, on() {}, fishNear: () => [], birdCalls: false };
  const api = new Function('location', 'history', 'matchMedia', 'localStorage', 'Engine', 'Game', 'addEventListener', source)(
    { search: '', hash: `#seed-${seed}&map&climate-${climate}` }, { replaceState() {} }, () => ({ matches: false }), { getItem() { return null; } }, Engine, Game, () => {});
  api.buildIsland(true); Game.waterAt = api.waterInfo; Game.groundAt = api.groundAt;
  for (const d of defs) api.Birds.register(d);
  return loaded[climate + seed] = { ...api, Engine, Game };
}
const run = (W, x, y, secs, each) => { const E = W.Engine; E.P.x = x; E.P.y = y; W.Birds.lastP = null; for (let t = 0; t < secs; t += 0.25) { E.time += 0.25; W.Birds.update(0.25); each && each(); } };
const of = (W, id) => W.Birds.list.filter(b => b.sp.id === id);

// the older species: bit-for-bit the same meshes as before flamingos and penguins came along
const BEFORE = { herring_gull: '7ff2fcce14f7f0aa', brown_pelican: 'c7839a14c64d4793', atlantic_puffin: '31152bb92a85bde5', eastern_bluebird: 'dda125550c8b38db' };
{ const W = load('temperate', 42);
  for (const [id, h] of Object.entries(BEFORE)) { const d = createHash('sha256'); W.Birds.species[id].meshes.forEach(m => d.update(Buffer.from(m.buffer))); assert.equal(d.digest('hex').slice(0, 16), h, `${id}: mesh changed`); assert.equal(W.Birds.species[id].meshes.length, 17); }
  for (const id of ['american_flamingo', 'gentoo_penguin']) for (const m of W.Birds.species[id].meshes.filter(Boolean)) assert.ok(m.length && m.every(Number.isFinite), `${id}: mesh`);
  assert.equal(W.Birds.species.american_flamingo.meshes.length, 19, 'flamingo: feeding and one-legged frames');
  // no flamingos or penguins on a temperate island
  const seen = new Set(['sea', 'lake', 'river', 'pond', 'creek']); W.Engine.P.x = 0; W.Engine.P.y = 0;
  for (const id of ['american_flamingo', 'gentoo_penguin']) assert.equal(W.Birds.census(W.Birds.species[id], seen), 0, `${id} on a temperate island`);
}

// penguins: one colony, on one islet of an arctic island; they walk and swim but never fly
let colonies = 0;
for (const seed of [42, 1234]) {
  const W = load('arctic', seed), B = W.Birds, sp = B.species.gentoo_penguin, t0 = performance.now(), S = B.home(sp), ms = performance.now() - t0;
  assert.ok(ms < 1500, `seed ${seed}: finding the islet took ${ms | 0} ms`);
  if (!S) { console.log(`  seed ${seed}: no islet with a beach (no penguins)`); continue; }
  colonies++;
  const I = S.islet; assert.ok(I.r < 600, `seed ${seed}: islet radius ${I.r}`);
  assert.ok(B.home(sp) === S, 'the same site every time');
  const main = W.LAYOUT.blobs[0]; assert.ok(Math.hypot(I.x - main.cx, I.y - main.cy) > main.rx * 0.5, 'not the main island');
  for (const [x, y] of S.land) assert.ok(W.waterInfo(x, y).depth < 0, 'colony spot ashore');
  for (const [x, y] of S.sea) assert.ok(W.waterInfo(x, y).depth > 0.5, 'swimming spot in the sea');
  // away from the islet: none (on the main island, or out on the far side of the sea)
  const seen = new Set(['sea', 'lake']);
  for (const [x, y] of [[main.cx, main.cy], [S.x + 1500, S.y], [-S.x, -S.y]]) { W.Engine.P.x = x; W.Engine.P.y = y; if (Math.hypot(x - S.x, y - S.y) > 600 + S.r) assert.equal(B.census(sp, seen), 0, `seed ${seed}: penguins at ${x | 0},${y | 0}`); }
  // at the islet: a colony, every bird near it, and over a few minutes they come and go between the shore and the sea
  run(W, S.x + Math.cos(S.a + 0.8) * 60, S.y + Math.sin(S.a + 0.8) * 60, 0.2);
  const P = of(W, 'gentoo_penguin'); assert.ok(P.length >= 8, `seed ${seed}: ${P.length} penguins`);
  const states = new Set(); let far = 0;
  run(W, W.Engine.P.x, W.Engine.P.y, 400, () => { for (const b of of(W, 'gentoo_penguin')) { states.add(b.st);
    const w = W.waterInfo(b.x, b.y);
    assert.ok(['stand', 'float', 'under'].includes(b.st), `penguin ${b.st}`);
    if (b.st === 'stand') assert.ok(w.depth < 0.3 && Math.abs(b.z - w.ground - sp.look.legs.len * b.sc) < 0.01, 'standing on land');
    else assert.ok(b.z < w.level + 0.7 && b.z > w.level - 2, `swimming at z ${b.z.toFixed(2)} (level ${w.level.toFixed(2)})`);
    far = Math.max(far, Math.hypot(b.x - S.x, b.y - S.y)); } });
  assert.ok(states.has('stand') && states.has('float'), `seed ${seed}: ashore and swimming (${[...states]})`);
  assert.ok(far < 140, `seed ${seed}: a penguin wandered ${far | 0} m from the colony`);
  // one spawned elsewhere (the spawn panel: "flying" in) is put down where it is and stays flightless
  const b = B.make(sp, W.Engine.P.x + 3, W.Engine.P.y, 'fly'); b.spawned = true; B.update(0.1); assert.ok(['stand', 'float'].includes(b.st));
}
assert.ok(colonies >= 1, 'at least one of the seeds has a penguin colony');
{ const W = load('tropical', 42); W.Engine.P.x = 0; W.Engine.P.y = 0; assert.equal(W.Birds.census(W.Birds.species.gentoo_penguin, new Set(['sea'])), 0, 'penguins in the tropics'); }

// flamingos: tropical, standing only in shallow sea water
{ const W = load('tropical', 42), B = W.Birds, sp = B.species.american_flamingo;
  let p = null; for (let k = 0; k < 16 && !p; k++) { const g = k / 16 * 6.2832, q = W.findWater(0, Math.cos(g) * 2000, Math.sin(g) * 2000, 3000); if (!q) continue;
    for (let d = 0; d < 120; d += 3) { const w = W.waterInfo(q.wx + Math.cos(q.a) * d, q.wy + Math.sin(q.a) * d); if (w.kind === 'sea' && w.depth > 0.15 && w.depth < 0.5) { p = q; break; } } }
  assert.ok(p, 'a tropical beach with shallows');
  run(W, p.x, p.y, 0.2);
  assert.ok(of(W, 'american_flamingo').length >= 6, 'a flock of flamingos');
  let stood = 0, onOne = 0, fed = 0;
  run(W, p.x, p.y, 300, () => { for (const b of of(W, 'american_flamingo')) if (b.st === 'stand') { stood++; onOne += !!b.one; fed += !!b.feeding;
    assert.ok(b.spot.wade, 'flamingos stand only in the water'); const w = W.waterInfo(b.spot.x, b.spot.y);
    assert.ok(w.kind === 'sea' && w.depth >= sp.wade.depth[0] && w.depth <= sp.wade.depth[1], `standing in ${w.kind} ${w.depth.toFixed(2)} m deep`);
    assert.ok(Math.abs(b.z - (b.spot.z + sp.look.legs.len * b.sc)) < 0.3, 'feet on the bottom (a step on, the spot moves a frame before the body)'); } else assert.ok(b.st !== 'float', 'flamingos never swim'); });
  assert.ok(stood > 0 && onOne > 0 && fed > 0, `standing ${stood}, on one leg ${onOne}, feeding ${fed}`);
  for (const c of ['arctic', 'temperate']) { const V = load(c, 42); V.Engine.P.x = p.x; V.Engine.P.y = p.y; V.Birds.anchor(V.Birds.species.american_flamingo); assert.equal(V.Birds.census(V.Birds.species.american_flamingo, new Set(['sea'])), 0, `flamingos on a ${c} island`); }
  // the older birds never take a wading spot
  for (const b of B.list) if (b.sp.id !== 'american_flamingo' && b.spot) assert.ok(!b.spot.wade, `${b.sp.id} wading`);
}
console.log('birds ok');
