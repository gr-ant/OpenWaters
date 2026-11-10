// Smoke test for fishing/nets-traps.js in a stubbed engine: node tests/nets-traps.cjs
const fs = require('fs'), vm = require('vm'), R = __dirname + '/../src/js/';
const store = {}, said = [], listeners = {}, hud = [], map = [];
const ctx = { console, Math, JSON, Date, performance, isFinite, Object, Float32Array, Uint32Array, Uint16Array, Int32Array, Map, Set,
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  document: { getElementById: () => ({ addEventListener() {} }) },
  CONFIG: { saveName: 't', saveProgress: true }, SEED: 5, CLIMATE: { key: 'temperate' }, WATER_KEYS: ['sea', 'lake', 'pond', 'river', 'creek'], FISH_CELL: 16,
  Controls: { key: () => 'F' }, uiIcon: n => `<svg ${n}/>`,
  FishDB: { list: [{ id: 'blue_crab', name: 'Blue crab', body: { plan: 'crab' }, size: { length_cm: { typical: 15 } } }, { id: 'american_lobster', name: 'American lobster', body: { plan: 'lobster' }, size: { length_cm: { typical: 25 } } }] },
  cellFish: (cx, cy) => [0, 1, 0, 1].map((si, k) => ({ si, id: `x@${cx},${cy}.0#0.${k}`, hx: cx * 16 + 4 + k, hy: cy * 16 + 8, size: { cm: 14 + k, kg: 0.2 } })),
};
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R + 'models/mesh-builder.js', 'utf8'), ctx);
vm.runInContext(`
var Engine = { time: 0, dtH: 0, props: [], fish: [], fishCells: new Map(), meshData: {}, gone: {}, ang: { out: false, phase: 'stowed' }, boat: null, tackleOpen: false,
  action() { this.based = true; }, toggleRod() {}, contextKeys() { return [['Q', 'x']]; }, catchLog() { return JSON.parse(localStorage.getItem('c') || '[]'); }, catchKey() { return 'c'; },
  isGone(id) { return !!this.gone[id]; }, removeFish(f) { f.dead = true; this.gone[f.id] = 1; }, toggleTackle() {}, tackleRender() {}, journalRender() {} };
var Game = { MT, player: { x: 0, y: 0, z: 0, a: 0 }, lookingAt: null, swimming: false,
  mesh() { const b = meshBuilder(); b.done = () => new Float32Array(b.v); return b; },
  registerMesh(n, d) { if (!d.length || d.some(v => !isFinite(v))) throw new Error('bad mesh ' + n); Engine.meshData[n] = d; },
  addProp(mesh, x, y, o) { if (!Engine.meshData[mesh]) throw new Error('no mesh ' + mesh); const p = Object.assign({ mesh, x, y }, o); Engine.props.push(p); return p; },
  on(n, f) { (L[n] = L[n] || []).push(f); }, emit(n, ...a) { for (const f of L[n] || []) f(...a); }, onHud(f) { hud.push(f); }, onMap(f) { map.push(f); },
  say(t) { said.push(t); }, sound() {}, splash() {}, ripple() {}, disturb() {},
  isWater: (x, y) => x > 3, groundAt: () => 0, waterAt: (x, y) => ({ level: -0.2, ground: -2.2, depth: x > 3 ? 2 : 0, kindId: 0, iced: false }),
  fishNear: (x, y, r) => Engine.fish.filter(f => Math.hypot(f.x - x, f.y - y) <= r) };
`, Object.assign(ctx, { L: listeners, hud, map, said }));
vm.runInContext(fs.readFileSync(R + 'fishing/nets-traps.js', 'utf8'), ctx);
vm.runInContext(`
const A = (c, m) => { if (!c) throw new Error('FAIL ' + m); }, T = Engine.traps, step = (dt, h = 0) => { Engine.time += dt; Engine.dtH = h; Game.emit('update', dt); };
const run = (sec, h = 0) => { for (let t = 0; t < sec - 1e-9; t += 0.05) step(0.05, h * 0.05 / sec); }, R = () => Game.emit('key', 'KeyR'), pose = n => Engine.props.find(p => p.mesh === n);
Game.emit('ready');
A(Object.keys(Engine.meshData).length === 6, 'six meshes');
Engine.action(); A(Engine.based, 'plain Use falls through');
// crab pot from the bank: it flies out in an arc, lands, then sinks to the bed on its rope
T.hand = 'crab_pot'; Engine.action(); A(T.fly.length === 1 && !T.set.length && Engine.props.length === 1, 'pot in the air');
step(0.05); const z1 = pose('trap_crab_pot').z; run(0.2); A(pose('trap_crab_pot').z > z1 - 0.5 && T.act && T.act.toss > 0, 'arcing out, arms throwing');
run(1.2); A(T.set.length === 1 && !T.fly.length && T.set[0].ax === 0 && Engine.props.length === 3, 'landed with a stake: ' + said.at(-1)); A(/tied to a stake/.test(said.at(-1)), 'said so');
const pz = T.set[0].props[0].z; A(pz > -2.2 && pz <= -0.2, 'sinking: ' + pz); run(2); A(Math.abs(T.set[0].props[0].z + 2.2) < 1e-6 && !T.set[0].sink, 'on the bed');
A(Engine.contextKeys()[0][1] === 'Set', 'key hint while in hand');
T.hand = null; A(Engine.trapUseLabel() === 'Haul', 'haul label at the stake'); hud.forEach(f => f()); A(/haul/.test(Engine.hudDetail), 'hud line');
map.forEach(f => f({ beginPath() {}, arc() {}, fill() {}, stroke() {} }, (x, y) => [x, y], () => true));
A(/Crab pot/.test(Engine.trapsHTML()) && /Out now/.test(Engine.trapsHTML()), 'tab html');
run(21); A(/"kind":"crab_pot"/.test(localStorage.getItem('engine-traps-t-5')), 'saved');
// R at the stake: it comes up over a moment (arms hauling), then you see what's in it
T.set[0].h = 0; R(); A(T.set.length === 1 && T.set[0].pull && /Hauling/.test(said.at(-1)), 'R starts the haul'); run(0.5); A(T.set[0].props[0].z > -2.2 && T.act && T.act.pull !== undefined, 'coming up, arms pulling');
run(1.2); A(/give it longer/.test(said.at(-1)) && !T.set.length && !Engine.props.length && !T.act, 'empty when hauled at once: ' + said.at(-1));
T.hand = 'crab_pot'; Engine.action(); T.hand = null; run(3, 12); R(); run(1.7);
A(/Crab pot: .*\\d × Blue crab/.test(said.at(-1)), 'catches crabs after a soak: ' + said.at(-1));   // (a lobster or two may be listed first)
const log = Engine.catchLog(); A(log.length >= 1 && log.length <= 6 && log.every(r => r.rig === 'Crab pot' && r.kept && r.water === 'sea' && r.cm > 0), 'journal records');
A(Object.keys(Engine.gone).length === log.length, 'caught animals stay gone');
// with the rod out, R is the rod's: it doesn't haul
T.hand = 'crab_pot'; Engine.action(); T.hand = null; run(3); Engine.ang.out = true; R(); A(!T.set[0].pull, 'rod out: R is for the rod'); Engine.ang.out = false; R(); run(1.7); A(!T.set.length, 'hauled once the rod is away');
// lobster cages under buoys from a boat; four at most; Use works for hauling too (the touch button)
Engine.boat = {}; Game.player.x = 40; for (let k = 0; k < 4; k++) { T.hand = 'lobster_cage'; Engine.action(); run(1.2); }
A(T.set.length === 4 && T.set.every(t => t.ax === null) && T.hand === null && /none left/.test(said.at(-1)), 'four cages under buoys: ' + said.at(-1));
T.hand = 'lobster_cage'; Engine.action(); A(/All 4 are out/.test(said.at(-1)), 'no fifth');
T.hand = null; run(3); Engine.action(); A(T.set.some(t => t.pull), 'Use hauls at a buoy'); run(1.7); A(T.set.length === 3, 'one up');
A(JSON.parse(localStorage.getItem('engine-traps-t-5')).set.length === 3, 'saved three');
// cast net: thrown out spinning open, it stays down until R; the catch is what was under it
Engine.boat = null; Game.player.x = 0; Engine.fish = [{ id: 'm1', x: 5.5, y: 0.3, z: -1, lengthCm: 8, weightKg: 0.01, species: 'mummichog', name: 'Mummichog', def: { body: {} } }, { id: 'big', x: 5.4, y: 0, z: -1, lengthCm: 80, weightKg: 4, species: 'pike', name: 'Pike', def: { body: {} } }];
const r0 = Math.random; Math.random = () => 0.1; T.hand = 'cast_net'; Engine.action(); A(T.net && T.net.stage === 'fly' && pose('cast_net').scale < 0.3, 'net thrown, still bunched: ' + said.at(-1));
run(0.4); A(pose('cast_net').scale > 0.5 && pose('cast_net').z > -0.2 && T.act && T.act.toss > 0, 'opening in the air'); run(0.5); A(T.net.stage === 'down' && Engine.fish.length === 1, 'down over the small fish');
Math.random = r0; run(5); A(T.net && T.net.stage === 'down' && pose('cast_net').z < -1, 'it stays down, on the bottom, until you pull'); A(Engine.contextKeys()[0][1] === 'Haul net' && Engine.trapUseLabel() === 'Haul', 'haul hints');
hud.forEach(f => f()); A(/pull it in/.test(Engine.hudDetail), 'hud says how'); Engine.action(); A(T.net.stage === 'down' || T.net.stage === 'haul', 'Use pulls too');
T.net.stage === 'down' && R(); run(0.5); A(T.net && T.net.stage === 'haul' && pose('cast_net').scale < 1 && T.act && T.act.pull !== undefined, 'coming in, gathered up');
run(0.6); A(!T.net && /Cast net: 1 × Mummichog/.test(said.at(-1)) && !pose('cast_net'), 'net catch: ' + said.at(-1));
// putting the net away while it's down brings it in
T.hand = 'cast_net'; run(0.5); Engine.action(); run(1); A(T.net && T.net.stage === 'down', 'down again'); T.hand = null; run(1.2); A(!T.net && /empty/.test(said.at(-1)), 'put away: it came in');
console.log('ok:', said.slice(-3).join(' | '));
`, ctx);
