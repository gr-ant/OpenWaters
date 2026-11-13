// Smoke test for fishing/nets-traps.js in a stubbed engine: node tests/nets-traps.cjs
const fs = require('fs'), vm = require('vm'), R = __dirname + '/../src/js/';
const store = {}, said = [], listeners = {}, hud = [], map = [], cards = [];
const ctx = { console, Math, JSON, Date, performance, isFinite, Object, Float32Array, Uint32Array, Uint16Array, Int32Array, Map, Set,
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  document: { getElementById: () => ({ addEventListener() {} }), createElement: () => ({ hidden: false, innerHTML: '', addEventListener(n, f) { this.onclick = f; } }), body: { appendChild(e) { cards.push(e); } } }, cards, sample() {}, hW: () => -2.2, SE: 0, SW: -0.2,
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)), CONFIG: { saveName: 't', saveProgress: true }, SEED: 5, CLIMATE: { key: 'temperate' }, WATER_KEYS: ['sea', 'lake', 'pond', 'river', 'creek'], FISH_CELL: 16,
  Controls: { key: () => 'F' }, uiIcon: n => `<svg ${n}/>`, esc: String, fmtKg: kg => `${kg} kg`,
  FishDB: { list: [{ id: 'blue_crab', name: 'Blue crab', body: { plan: 'crab' }, size: { length_cm: { typical: 15 } } }, { id: 'american_lobster', name: 'American lobster', body: { plan: 'lobster' }, size: { length_cm: { typical: 25 } } }] },
  cellFish: (cx, cy) => [0, 1, 0, 1].map((si, k) => ({ si, id: `x@${cx},${cy}.0#0.${k}`, hx: cx * 16 + 4 + k, hy: cy * 16 + 8, size: { cm: 14 + k, kg: 0.2 } })),
};
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R + 'models/mesh-builder.js', 'utf8'), ctx);
vm.runInContext(`
var Engine = { time: 0, dtH: 0, props: [], fish: [], fishCells: new Map(), meshData: {}, gone: {}, ang: { out: false, phase: 'stowed' }, boat: null, tackleOpen: false,
  action() { this.based = true; }, toggleRod() {}, contextKeys() { return [['Q', 'x']]; }, catchLog() { return JSON.parse(localStorage.getItem('c') || '[]'); }, catchKey() { return 'c'; }, logCatches(recs) { localStorage.setItem('c', JSON.stringify(this.catchLog().concat(recs))); },
  isGone(id) { return !!this.gone[id]; }, removeFish(f) { f.dead = true; this.gone[f.id] = 1; }, toggleTackle() {}, tackleRender() {}, journalRender() {} };
var Game = { MT, player: { x: 0, y: 0, z: 0, a: 0 }, lookingAt: null, swimming: false,
  mesh() { const b = meshBuilder(); b.done = () => new Float32Array(b.v); return b; },
  registerMesh(n, d) { if (!d.length || d.some(v => !isFinite(v))) throw new Error('bad mesh ' + n); Engine.meshData[n] = d; },
  addProp(mesh, x, y, o) { if (!Engine.meshData[mesh]) throw new Error('no mesh ' + mesh); const p = Object.assign({ mesh, x, y }, o); Engine.props.push(p); return p; },
  on(n, f) { (L[n] = L[n] || []).push(f); }, emit(n, ...a) { for (const f of L[n] || []) f(...a); }, onHud(f) { hud.push(f); }, onMap(f) { map.push(f); },
  say(t) { said.push(t); }, sound() {}, splash() {}, ripple() {}, disturb() {},
  isWater: (x, y) => x > 3, groundAt: x => x > 3 ? -2.2 : 0, waterAt: (x, y) => ({ level: -0.2, ground: -2.2, depth: x > 3 ? 2 : 0, kindId: 0, iced: false }),
  fishNear: (x, y, r) => Engine.fish.filter(f => Math.hypot(f.x - x, f.y - y) <= r) };
`, Object.assign(ctx, { L: listeners, hud, map, said }));
vm.runInContext(fs.readFileSync(R + 'fishing/nets-traps.js', 'utf8'), ctx);
vm.runInContext(`
const A = (c, m) => { if (!c) throw new Error('FAIL ' + m); }, T = Engine.traps, step = (dt, h = 0) => { Engine.time += dt; Engine.dtH = h; Game.emit('update', dt); };
const run = (sec, h = 0) => { for (let t = 0; t < sec - 1e-9; t += 0.05) step(0.05, h * 0.05 / sec); }, R = () => Game.emit('key', 'KeyR'), pose = n => Engine.props.find(p => p.mesh === n);
Game.emit('ready');
A(Object.keys(Engine.meshData).length === 5, 'five meshes');
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
const key = k => Game.emit('key', k), card = () => cards[0];
T.set[0].h = 0; R(); A(T.set.length === 1 && T.set[0].pull && /Hauling/.test(said.at(-1)), 'R starts the haul'); run(0.5); A(T.set[0].props[0].z > -2.2 && T.act && T.act.pull !== undefined, 'coming up, arms pulling');
run(1.2); A(/give it longer/.test(said.at(-1)) && !T.set.length && !Engine.props.length && !T.act && !T.card, 'empty when hauled at once: ' + said.at(-1));
// after a soak there's a catch, and a card to keep it or let it go; nothing is logged or taken until you choose
T.hand = 'crab_pot'; Engine.action(); T.hand = null; run(3, 12); R(); run(1.7);
A(T.card && T.card.gear === 'Crab pot' && T.card.items.length >= 1 && T.card.items.length <= 6 && T.card.items.some(i => i.name === 'Blue crab'), 'a card with the catch'); A(card() && !card().hidden && /Keep all/.test(card().innerHTML) && /Blue crab/.test(card().innerHTML), 'card shown');
A(!Engine.catchLog().length && !Object.keys(Engine.gone).length, 'nothing decided yet'); Engine.based = false; Engine.action(); R(); A(!Engine.based && T.card, 'the card waits for an answer');
const n1 = T.card.items.length; card().onclick({ target: { closest: () => ({ dataset: { i: '0' } }) } }); A(!T.card.items[0].kept && (n1 === 1 ? /Let them go/ : /Keep \\d+, let 1 go/).test(card().innerHTML), 'tap one to let it go: ' + card().innerHTML.match(/<button id="haulKeep">[^<]*/)[0]);
key('KeyE'); A(!T.card && card().hidden, 'E decides'); const log = Engine.catchLog(); A(log.length === n1 && log.filter(r => !r.kept).length === 1 && log.every(r => r.rig === 'Crab pot' && r.water === 'sea' && r.cm > 0), 'journal: kept and released');
A(Object.keys(Engine.gone).length === n1 - 1, 'only the kept ones leave the water'); A(n1 === 1 ? /Let it go/.test(said.at(-1)) : /In the creel: .* · let 1 go/.test(said.at(-1)), 'said: ' + said.at(-1));
// X lets the lot go
T.hand = 'crab_pot'; Engine.action(); T.hand = null; run(3, 12); R(); run(1.7); const before = Object.keys(Engine.gone).length; A(T.card, 'another catch'); key('KeyX'); A(!T.card && Object.keys(Engine.gone).length === before && /Let (it|all \\d+) go/.test(said.at(-1)), 'X releases all: ' + said.at(-1));
// with the rod out, R is the rod's: it doesn't haul
T.hand = 'crab_pot'; Engine.action(); T.hand = null; run(3); Engine.ang.out = true; R(); A(!T.set[0].pull, 'rod out: R is for the rod'); Engine.ang.out = false; R(); run(1.7); A(!T.set.length, 'hauled once the rod is away'); if (T.card) key('KeyX');
// lobster cages under buoys from a boat; two at most; Use works for hauling too (the touch button)
Engine.boat = {}; Game.player.x = 40; for (let k = 0; k < 2; k++) { T.hand = 'lobster_cage'; Engine.action(); run(1.2); }
A(T.set.length === 2 && T.set.every(t => t.ax === null) && T.hand === null && /none left/.test(said.at(-1)), 'two cages under buoys: ' + said.at(-1));
T.hand = 'lobster_cage'; Engine.action(); A(/All 2 are out/.test(said.at(-1)), 'no third');
T.hand = null; run(3); Engine.action(); A(T.set.some(t => t.pull), 'Use hauls at a buoy'); run(1.7); A(T.set.length === 1, 'one up'); if (T.card) key('KeyE');
A(JSON.parse(localStorage.getItem('engine-traps-t-5')).set.length === 1, 'saved one');
// cast net: a soft thing. In your hand it hangs gathered and swings; thrown, it spins open; it settles on the bed and stays until R; it trails closed as it comes in
Engine.boat = null; Game.player.x = 0; const small = { id: 'm1', x: 5.5, y: 0.3, z: -1, lengthCm: 8, weightKg: 0.01, species: 'mummichog', name: 'Mummichog', def: { body: {} } };
Engine.fish = [small, { id: 'big', x: 5.4, y: 0, z: -1, lengthCm: 80, weightKg: 4, species: 'pike', name: 'Pike', def: { body: {} } }];
const spread = () => Math.max(...T.cn.p.map(p => Math.hypot(p[0] - T.cn.hub[0], p[1] - T.cn.hub[1], p[2] - T.cn.hub[2]))), flat = () => Math.max(...T.cn.p.map(p => Math.hypot(p[0] - T.cn.hub[0], p[1] - T.cn.hub[1]))), finite = () => T.cn.p.every(p => p.every(Number.isFinite)) && T.cn.hub.every(Number.isFinite);
T.hand = 'cast_net'; run(1.5); A(T.cn && finite() && spread() <= 0.46 && T.cn.p.every(p => p[2] < T.cn.hub[2] - 0.2), 'in hand: gathered, hanging below the hand: ' + spread());
const x0 = T.cn.p[0][0]; Game.player.x = 0.6; step(0.05); A(Math.abs(T.cn.p[0][0] - x0) < 0.55, 'the weights lag as you move: it swings'); Game.player.x = 0; run(1);
const lines = []; Game.project = (x, y, z) => [x, z]; const pen = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() { lines.push(1); }, quadraticCurveTo() { lines.push('rope'); }, stroke() {}, arc() { lines.push('lead'); }, fill() {} };
hud.forEach(f => f(pen)); A(lines.filter(l => l === 1).length === 40 && lines.filter(l => l === 'lead').length === 10 && !lines.includes('rope'), 'drawn: spokes, mesh rings and weights; no hand line until it is thrown');
const r0 = Math.random; Math.random = () => 0.1; Engine.based = false; Engine.action(); A(!T.net && Engine.based, 'F never throws the net'); R(); A(T.net && T.net.stage === 'fly', 'thrown: ' + said.at(-1));
run(0.5); A(finite() && flat() > 1 && T.cn.hub[2] > -0.2 && T.act && T.act.toss > 0, 'spinning open in the air: ' + flat()); lines.length = 0; hud.forEach(f => f(pen)); A(lines.filter(l => l === 'rope').length === 2, 'the hand line runs out to it');
run(0.4); A(T.net.stage === 'down' && small.hooked === 'net' && Engine.fish.length === 2, 'down over the small fish, which is held under it');
Math.random = r0; run(5); A(T.net && T.net.stage === 'down' && finite() && T.cn.hub[2] < -1 && T.cn.p.every(p => p[2] <= -2.1 && p[2] >= -2.2), 'it stays down until you pull, the weights on the bed'); A(Engine.contextKeys()[0][1] === 'Haul net' && Engine.trapUseLabel() === 'Haul', 'haul hints');
hud.forEach(f => f()); A(/pull it in/.test(Engine.hudDetail), 'hud says how');
R(); run(0.5); A(T.net && T.net.stage === 'haul' && T.cn.k < 1 && T.act && T.act.pull !== undefined && Math.abs(small.x - T.cn.hub[0]) < 0.3, 'coming in, closing, the catch with it');
run(0.6); A(!T.net && T.card && T.card.gear === 'Cast net' && T.card.items.length === 1, 'net up: a card for the catch'); run(0.5); A(T.cn && spread() <= 0.6, 'gathered in your hand again');
key('KeyX'); A(!T.card && small.hooked === false && small.state === 'flee' && Math.abs(small.x - 5.4) < 1e-9 && Engine.fish.length === 2 && /Let it go/.test(said.at(-1)), 'let go: back in the water where the net came down: ' + said.at(-1));
run(0.5); Math.random = () => 0.1; small.x = 5.5; small.y = 0.3; R(); A(T.net, 'R throws the net too'); run(1); R(); run(1.6); Math.random = r0; A(T.card, 'caught again'); key('KeyE');
A(Engine.fish.length === 1 && /In the creel: 1 × Mummichog/.test(said.at(-1)) && Engine.catchLog().at(-1).kept === true && Engine.catchLog().at(-1).rig === 'Cast net', 'kept: ' + said.at(-1));
// putting the net away while it's down brings it in
run(0.5); R(); run(1); A(T.net && T.net.stage === 'down', 'down again'); T.hand = null; run(1.2); A(!T.net && /empty/.test(said.at(-1)), 'put away: it came in'); step(0.05); A(!T.cn, 'and it is gone from your hand');
// with nothing in hand and nothing to haul, R takes the rod out (and that press doesn't also start a cast)
let rodOn = null; Engine.toggleRod = on => { rodOn = on; }; Engine.keys = { KeyR: true }; Game.player.x = 100; R(); A(rodOn === true && !Engine.keys.KeyR, 'R: rod out');
rodOn = null; T.hand = 'crab_pot'; R(); A(rodOn === null, 'not with a pot in hand'); T.hand = null;
console.log('ok:', said.slice(-3).join(' | '));
`, ctx);
