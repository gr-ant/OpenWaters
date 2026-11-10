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
var Game = { MT, player: { x: 0, y: 0, a: 0 }, lookingAt: null, swimming: false,
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
Game.emit('ready');
A(Object.keys(Engine.meshData).length === 6, 'six meshes');
Engine.action(); A(Engine.based, 'plain Use falls through');
// crab pot from the bank
T.hand = 'crab_pot'; Engine.action(); A(T.set.length === 1 && T.set[0].ax === 0 && Engine.props.length === 3, 'pot set with a stake: ' + said.at(-1));
A(Engine.contextKeys()[0][1] === 'Set', 'key hint while in hand');
T.hand = null; A(Engine.trapUseLabel() === null, 'no haul in the first moment'); step(2); A(Engine.trapUseLabel() === 'Haul', 'haul label at the stake'); hud.forEach(f => f()); A(/haul/.test(Engine.hudDetail), 'hud line');
map.forEach(f => f({ beginPath() {}, arc() {}, fill() {}, stroke() {} }, (x, y) => [x, y], () => true));
A(/Crab pot/.test(Engine.trapsHTML()) && /Out now/.test(Engine.trapsHTML()), 'tab html');
step(21, 0); A(/"kind":"crab_pot"/.test(localStorage.getItem('engine-traps-t-5')), 'saved');
Engine.action(); A(/give it longer/.test(said.at(-1)) && !T.set.length && !Engine.props.length, 'empty when hauled at once: ' + said.at(-1));
T.hand = 'crab_pot'; Engine.action(); T.hand = null; step(2, 12); Engine.action();
A(/Crab pot: \\d × Blue crab/.test(said.at(-1)), 'catches crabs after a soak: ' + said.at(-1));
const log = Engine.catchLog(); A(log.length >= 1 && log.length <= 6 && log.every(r => r.rig === 'Crab pot' && r.kept && r.water === 'sea' && r.cm > 0), 'journal records');
A(Object.keys(Engine.gone).length === log.length, 'caught animals stay gone');
// lobster cage under a buoy from a boat; max 4
Engine.boat = {}; T.hand = 'lobster_cage'; Game.player.x = 40; Engine.based = false; for (let k = 0; k < 5; k++) Engine.action();
A(T.set.length === 4 && T.set.every(t => t.ax === null) && T.hand === null && Engine.based && /none left/.test(said.at(-1)), 'four cages under buoys: ' + said.at(-1));
// reload: they come back
const saved = localStorage.getItem('engine-traps-t-5'); A(JSON.parse(saved).set.length === 4, 'saved four');
// cast net
Engine.boat = null; Game.player.x = 0; Engine.fish = [{ id: 'm1', x: 5.5, y: 0.3, z: -1, lengthCm: 8, weightKg: 0.01, species: 'mummichog', name: 'Mummichog', def: { body: {} } }, { id: 'big', x: 5.4, y: 0, z: -1, lengthCm: 80, weightKg: 4, species: 'pike', name: 'Pike', def: { body: {} } }];
const r0 = Math.random; Math.random = () => 0.1; T.hand = 'cast_net'; Engine.action(); A(T.net, 'net thrown: ' + said.at(-1)); step(0.6); A(Engine.props.some(p => p.mesh === 'cast_net'), 'net on the water'); step(2);
Math.random = r0; A(!T.net && /Cast net: 1 × Mummichog/.test(said.at(-1)) && Engine.fish.length === 1 && !Engine.props.some(p => p.mesh === 'cast_net'), 'net catch: ' + said.at(-1));
console.log('ok:', said.slice(-3).join(' | '));
`, ctx);
