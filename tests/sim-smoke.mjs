import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import S from '../src/sim/index.js';

// The shared simulation (src/sim/) in plain Node, as a multiplayer server would use it: no window, no document, no
// Math.random. A sim from a fixed seed and climate steps on a fixed tick and comes out the same every time; swimmers and
// splashes scare fish, birds flush and penguins waddle off; the first hook claim wins, and a kept catch is gone for
// everyone until it respawns as the same fish. Run from the repository root: node tests/sim-smoke.mjs
const read = p => fs.readFileSync(p, 'utf8'), html = read('src/index.html');
const species = [...html.matchAll(/data-builtin="fish" src="([^"]+)"/g)].map(m => JSON.parse(read(`src/${m[1]}`)));   // the game's load order
const simFiles = [...html.matchAll(/<script src="(sim\/[\w-]+\.js)">/g)].map(m => `src/${m[1]}`);
let checks = 0; const ok = (v, msg) => { assert.ok(v, msg); checks++; }, eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// ---- no browser needed ----
eq(typeof window + typeof document + typeof localStorage, 'undefinedundefinedundefined', 'plain Node: no browser globals');
for (const f of simFiles) {   // the code (comments aside) never names a browser global, the game's Engine, or Math.random
  const code = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/\b(window|document|localStorage|navigator|Engine|requestAnimationFrame|WebGL\w*)\b|Math\.random/.test(code), `${f}: no browser globals, Engine or Math.random`);
}
eq(simFiles.length, 8, 'index.html loads the eight src/sim/ files');
ok(['createSim', 'createWorld', 'createSimpleTerrain', 'mulberry32', 'hash2', 'gauss', 'poisson', 'sampleFishSize', 'prepareSpecies', 'createFishLedger',
  'installEnvironment', 'installBehaviour', 'installPopulations', 'spookFish', 'birdSpooked', 'fleeSpot'].every(k => typeof S[k] === 'function'), 'the module exports its API');

// the same files as plain scripts in a bare context whose Math.random throws: the browser build's path, without a browser
{ const ctx = vm.createContext({ console }); vm.runInContext('Math.random = () => { throw new Error("Math.random called"); };', ctx);
  for (const f of simFiles) vm.runInContext(read(f), ctx, { filename: f });
  ctx.species = species;
  const n = vm.runInContext(`const s = OWSim.createSim({ seed: 7, climate: 'temperate', species }); s.setPlayers([{ id: 'p', x: 0, y: 0, inWater: true }]); s.run(5); s.fish.length`, ctx);
  ok(n > 50, `script build: a sim runs with Math.random disabled (${n} fish)`); }

// ---- same seed, same fish ----
const make = (seed = 42, config) => { const s = S.createSim({ seed, climate: 'temperate', species, config }); s.setPlayers([{ id: 'a', x: 0, y: 0 }]); return s; };
const A = make().run(10), B = make().run(10);
const view = s => s.snapshot().map(f => [f.id, f.x, f.y, f.z, f.a, f.state]);
ok(A.fish.length > 100, `a lake full of fish (${A.fish.length})`);
eq(view(A), view(B), 'same seed: the same fish, ids and positions after 200 ticks');
ok(JSON.stringify(view(make(43).run(10))) !== JSON.stringify(view(A)), 'another seed: other fish');
ok(A.snapshot().some(f => Math.hypot(f.x - A.fishById(f.id).homeX, f.y - A.fishById(f.id).homeY) > 0.5), 'fish move about');
// stable ids, homes and sizes: every live fish is one of its cell's fixed records (species@cx,cy.kind#group.member)
for (const f of A.fish) {
  const m = /@(-?\d+),(-?\d+)\.(\d)#\d+\.\d+$/.exec(f.id); ok(m, `id ${f.id}`);
  const r = A.world.cellFish(+m[1], +m[2]).find(q => q.id === f.id);
  ok(r && r.hx === f.homeX && r.hy === f.homeY && r.size.cm === f.lengthCm && r.size.kg === f.weightKg, `${f.id}: fixed home, length and weight`);
}
ok(new Set(A.fish.map(f => f.id)).size === A.fish.length, 'ids are unique');
ok(A.fish.every(f => f.lengthCm >= f.def.size.length_cm.min && f.lengthCm <= f.def.size.length_cm.max), 'lengths within each species\' range');
{ const count = w => { const s = make(42, { wildlife: w }); let n = 0; for (let cy = -5; cy < 5; cy++) for (let cx = -5; cx < 5; cx++) n += s.world.cellFish(cx, cy).length; return n; };
  const [sparse, std, rich] = [1, 2, 3].map(count); ok(sparse < std && std < rich, `wildlife scales the cells' numbers (${sparse} < ${std} < ${rich})`); }
// seasons, weather, water temperature
ok(A.env.season === 'spring' && A.env.airT > -40 && A.env.airT < 50 && A.env.label().includes('Spring'), `ENV runs: ${A.env.label()}`);
{ const T = A.world.waterTemp(S.LAKE, 0, 0.5, 0, 0), deep = A.world.waterTemp(S.LAKE, 0, 6, 0, 0); ok(T > 0 && T < 30 && deep <= T + 1e-9, `lake ${T.toFixed(1)} °C at the top, ${deep.toFixed(1)} °C at 6 m`); }

// ---- spooking: a swimmer, a splash ----
{ const s = make().run(5), calm = s.fish.find(f => f.stress === 0 && !f.def._benthic && f.def.behavior.burst_bl_s > 0 && Math.hypot(f.x, f.y) < 80);
  ok(calm, 'a calm fish to swim at');
  s.setPlayers([{ id: 'a', x: calm.x + 0.3, y: calm.y, inWater: true, moving: true }]);   // (a small, unwary fish only minds you inside ~1.5 m)
  s.run(1.5);
  ok(calm.stress > 0.5, `a swimmer on top of it frightens it (stress ${calm.stress.toFixed(2)})`);
  ok(calm.thx === s.ctx.players[0].x && calm.thy === s.ctx.players[0].y && calm.state === 'flee', `it flees from the swimmer (${calm.state})`);
  const far = s.fish.filter(f => Math.hypot(f.x - calm.x, f.y - calm.y) > 60); ok(far.length && far.every(f => f.thx !== s.ctx.players[0].x || f.stress < 0.5), 'fish far away are not');
  const P = s.ctx.players[0], g = s.fish.find(f => f.stress === 0 && !f.def._benthic && Math.hypot(f.x - P.x, f.y - P.y) > 15);
  s.disturb(g.x + 0.3, g.y, 2); s.run(0.4);   // a splash beside it (a noise counts for 0.4 s)
  ok(g.stress > 0.3, `a splash beside a fish frightens it (stress ${g.stress.toFixed(2)})`);
  const n = s.spook(calm.x, calm.y, 5); ok(n >= 1 && calm.stress === 1, `spook(): ${n} fish bolt`);
  s.run(1); ok(['flee', 'breathe'].includes(calm.state) || calm.stress > 0.5, `it bolts (${calm.state})`); }

// ---- birds: flush, waddle, scatter ----
{ const gull = JSON.parse(read('src/birds/herring_gull.json')), peng = JSON.parse(read('src/birds/gentoo_penguin.json'));
  const me = { x: 0, y: 0, z: 0, boatSpeed: 0, swimming: false };
  ok(S.birdSpooked(gull, {}, { x: 10, y: 0, z: 0 }, me) && !S.birdSpooked(gull, {}, { x: 30, y: 0, z: 0 }, me), 'a gull on the water flushes inside its shy distance (× FEAR)');
  ok(S.birdSpooked(gull, {}, { x: 30, y: 0, z: 0 }, { ...me, boatSpeed: 3 }), 'a fast boat flushes it from further off');
  ok(!S.birdSpooked(gull, {}, { x: 15, y: 0, z: 0 }, { ...me, swimming: true }) && S.birdSpooked(gull, {}, { x: 15, y: 0, z: 0 }, me), 'a swimmer gets closer');
  ok(!S.birdSpooked(gull, { bold: true }, { x: 3, y: 0, z: 1 }, me), 'a bold bird on a boat lets you near');
  ok(S.birdSpookedByAny(gull, {}, { x: 10, y: 0, z: 0 }, [{ ...me, x: 500 }, me]), 'any of several players');
  eq([S.birdFlight(gull), S.birdFlight(peng)], ['takeoff', 'waddle'], 'flying birds take off, penguins waddle');
  ok(S.flightlessSpooked(peng, 5) && !S.flightlessSpooked(peng, 20), 'a penguin minds you inside its shy distance');
  eq(S.fleeSpot([[5, 0], [-40, 3], [10, 10]], me), { x: -40, y: 3 }, 'and heads for the sea spot furthest from you');
  const s = make().run(3), f = s.fish.find(q => q.stress === 0); const n = S.birdScatter(s.fish, f.x, f.y, 3);
  ok(n >= 1 && f.stress === 1 && f.tNext === 0, `a diving bird scatters ${n} fish below it`); }

// ---- hook claims, catches, fish-gone and respawn ----
{ const s = make(42, { fishRespawnMinutes: 0.1 }).run(3), f = s.fish.find(q => !q.def._benthic), id = f.id, rec = { x: f.homeX, y: f.homeY, cm: f.lengthCm, kg: f.weightKg };
  eq(s.hook(id, 'alice'), { ok: true }, 'first claim wins');
  eq(s.hook(id, 'bob'), { ok: false, reason: 'taken', by: 'alice' }, 'second gets "taken"');
  eq(s.land(f.id, 'bob', true), { ok: false, reason: 'taken', by: 'alice' }, 'only the one who hooked it can land it');
  s.run(1); ok(f.hooked === 'alice' && s.fish.includes(f), 'a hooked fish holds still for the client-side fight');
  const r = s.land(id, 'alice', true);
  ok(r.ok && r.kept && r.event.type === 'fish-gone' && r.event.id === id, 'kept: a fish-gone event');
  ok(!s.fish.includes(f) && !s.snapshot().some(q => q.id === id) && s.ledger.isGone(id), 'gone for everyone');
  ok(s.drainEvents().some(e => e.type === 'fish-gone' && e.id === id), 'the event is queued for broadcast');
  eq(s.hook(id, 'carol'), { ok: false, reason: 'gone' }, 'nobody can hook a gone fish');
  s.run(2); ok(!s.fish.some(q => q.id === id), 'cell re-syncs do not bring it back early');
  { const fresh = s.world.syncCells(new Map(), { centres: [[f.homeX, f.homeY, 8]], limit: 1e4, rng: S.mulberry32(1), isGone: q => s.ledger.isGone(q), perCall: 99 });   // a cell made while it is gone
    ok(fresh.size && ![...fresh.values()].some(c => c.fish.some(q => q.id === id)), 'a cell populated while it is gone leaves it out'); }
  s.run(5); const back = s.fish.find(q => q.id === id);
  ok(back && back !== f && !s.ledger.isGone(id), 'after the respawn time it is back');
  eq({ x: back.homeX, y: back.homeY, cm: back.lengthCm, kg: back.weightKg }, rec, 'the same fish: same id, home, length and weight');
  ok(s.drainEvents().some(e => e.type === 'fish-respawn' && e.id === id), 'with a fish-respawn event');
  // released: stays in the world, free to be caught again
  const g = s.fish.find(q => q !== back && !q.hooked); eq(s.hook(g.id, 'bob'), { ok: true }, 'bob hooks another');
  const rr = s.land(g.id, 'bob', false); ok(rr.ok && !rr.kept && s.fish.includes(g) && !g.dead && !g.hooked && !s.ledger.isGone(g.id) && g.stress === 1, 'released: stays (and bolts)');
  eq(s.hook(g.id, 'alice'), { ok: true }, 'and anyone can hook it again');
  ok(s.unhook(g.id, 'alice') && !g.hooked && s.ledger.claimOf(g.id) === undefined, 'it gets away: the claim is freed'); }

console.log(`Shared simulation smoke test passed (${checks} checks).`);
