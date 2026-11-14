// Real-water check: are the fish positions the server broadcasts in the real island's water, the water the clients
// render for the same seed + climate? Not the stand-in round lake (createSimpleTerrain)?
//   node verify_real_water.mjs [seed=42] [climate=temperate] [min samples=100]
// It starts its own server, joins a room, walks a player (with a lure out) to the sea, a lake, a pond, a river and a creek
// of that island, collects fish positions from the server's state messages, and checks each one with the game's own water
// test, waterInfo(x, y).wet (src/js/world/island-water-queries.js: depth > 0 at the exact terrain height), on an island
// built separately in this process from the game's scripts. It also checks every fish id against the game's own
// cellFish (what a client would populate), and counts how many of the positions the stand-in lake would call water.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url), here = path.dirname(fileURLToPath(import.meta.url));
const S = require('../src-sim/index.js'), { loadIsland, speciesJson } = require('./island.js');
const seed = +(process.argv[2] || 42), climate = process.argv[3] || 'temperate', want = +(process.argv[4] || 100);

// ---- the client's island, built here independently of the server process ----
const isl = loadIsland(seed, climate);
console.log(`headless island, seed ${seed} ${climate}: loaded in ${isl.loadMs} ms (this process)`);
let t = Date.now(); for (const r of speciesJson()) isl.FishDB.register(r, { quiet: true });   // as boot.js does: the game's own FishDB
console.log(`game FishDB: ${isl.FishDB.list.length} species registered in ${Date.now() - t} ms`);
const stand = S.createSimpleTerrain({ seed }), so = {};
const standInWater = (x, y) => { stand.sample(x, y, so); return so.level - so.ground > 0; };

// ---- the server ----
const port = 20000 + Math.floor(Math.random() * 20000);
const child = spawn(process.execPath, [path.join(here, 'server.js'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res, rej) => { child.stdout.on('data', d => { const s = String(d); if (/island|server on/.test(s)) process.stdout.write('  [server] ' + s); if (s.includes('server on')) res(); }); child.on('exit', rej); });
const ws = new WebSocket(`ws://localhost:${port}`), inbox = [], waiters = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data); const k = waiters.findIndex(w => w.p(m)); if (k >= 0) waiters.splice(k, 1)[0].r(m); else inbox.push(m); };
const wait = (p, ms = 10000) => { const i = inbox.findIndex(p); if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
  return new Promise((r, j) => { const w = { p, r }; waiters.push(w); setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); j(new Error('timeout')); } }, ms); }); };
await new Promise(r => { ws.onopen = r; });
ws.send(JSON.stringify({ t: 'create', seed, climate, name: 'checker' }));
const joined = await wait(m => m.t === 'joined', 30000);

// ---- walk to each kind of water and collect what the server sends ----
const seen = new Map(), kinds = ['sea', 'lake', 'pond', 'river', 'creek'], perKind = {};
const sites = [{ kind: 'start lake', x: joined.start.x, y: joined.start.y, wx: joined.start.x + Math.cos(joined.start.a) * 20, wy: joined.start.y + Math.sin(joined.start.a) * 20 }];
for (let k = 0; k < kinds.length; k++) { const p = isl.findWater(k, 0, 0, 2500); if (p) sites.push({ kind: kinds[k], ...p }); }
let maxSent = 0, simulated = 0;
for (const s of sites) {
  let got = 0;
  for (const r of [0, 10, 20, 30]) for (let i = 0; i < (r ? 6 : 1); i++) {
    const a = i / 6 * Math.PI * 2, lure = { x: s.wx + Math.cos(a) * r, y: s.wy + Math.sin(a) * r };
    ws.send(JSON.stringify({ t: 'player_state', x: s.x, y: s.y, a: 0, lure }));
    inbox.length = 0; await wait(m => m.t === 'state'); const st = await wait(m => m.t === 'state');
    maxSent = Math.max(maxSent, st.fish.length);
    for (const f of st.fish) if (!seen.has(f.id)) { seen.set(f.id, { ...f, site: s.kind }); got++; }
  }
  perKind[s.kind] = got;
  const stats = await (await fetch(`http://localhost:${port}/stats`)).json(); simulated = Math.max(simulated, stats.rooms[0].fishSimulated);
}
ws.close(); child.kill();

// ---- check every collected position against the game's water ----
const fish = [...seen.values()];   // every one collected, from every site
// A fish the exact test calls dry is still explained if (a) it is hauled out on purpose (turtles, seals: state 'haul',
// shared behaviour.js), or (b) the game's cached sample() terrain (a 2 m lattice, which the game's own fish movement
// steers by, in the browser as on the server) has water there: a client would put that fish in the same place.
let wet = 0, dry = 0, hauled = 0, latticeWet = 0, unexplained = 0, inColumn = 0, idOk = 0, standWet = 0; const bad = [];
const recCache = new Map();
for (const f of fish) {
  const w = isl.waterInfo(f.x, f.y);
  if (w.wet) wet++;
  else { dry++; const q = isl.SIM_TERRAIN.sample(f.x, f.y, {}), qd = q.level - q.ground;
    const why = f.state === 'haul' ? (hauled++, 'hauled out (by design)') : qd > 0 ? (latticeWet++, 'water in the game\'s cached sample() lattice') : (unexplained++, 'UNEXPLAINED');
    bad.push(`${f.id} at (${f.x}, ${f.y}) state ${f.state}, exact depth ${w.depth.toFixed(3)}, cached sample() depth ${qd.toFixed(3)}: ${why}`); }
  if (f.z <= w.level + 0.05 && f.z >= w.ground - 0.05) inColumn++;
  const m = /@(-?\d+),(-?\d+)\./.exec(f.id), key = m[1] + ',' + m[2];
  if (!recCache.has(key)) recCache.set(key, isl.cellFish(+m[1], +m[2]));
  const rec = recCache.get(key).find(r => r.id === f.id);
  if (rec && Math.abs(rec.size.cm - f.cm) < 0.01) idOk++;
  if (standInWater(f.x, f.y)) standWet++;
}
console.log(`\nsites visited: ${sites.map(s => `${s.kind} (${s.wx.toFixed(0)}, ${s.wy.toFixed(0)}): ${perKind[s.kind]} fish`).join('; ')}`);
console.log(`checked ${fish.length} server fish positions (unique ids from state broadcasts)`);
console.log(`  in the real island's water (exact waterInfo().wet): ${wet}   on land: ${dry} (hauled out ${hauled}, water in the cached lattice ${latticeWet}, unexplained ${unexplained})`);
console.log(`  z between the real ground and the water surface: ${inColumn} / ${fish.length}`);
console.log(`  id, length found in the game's own cellFish (client population): ${idOk} / ${fish.length}`);
console.log(`  in water according to the stand-in round lake instead: ${standWet} / ${fish.length}`);
console.log(`interest management: up to ${simulated} fish simulated in the room, at most ${maxSent} sent in one state message`);
if (bad.length) console.log('on land by the exact test:\n  ' + bad.slice(0, 20).join('\n  '));
const ok = fish.length >= want && unexplained === 0 && idOk === fish.length;
console.log(`\nREAL-WATER CHECK: ${ok ? 'PASS' : 'FAIL'}`);
process.exitCode = ok ? 0 : 1;
