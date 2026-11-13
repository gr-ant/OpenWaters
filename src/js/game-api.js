'use strict';
// ======================================================================
//  PUBLIC API — build a game on top of the engine with these calls
// ======================================================================
const Game = {
  config: CONFIG, seed: SEED, climate: CLIMATE.key, level: 1, speedMultiplier: 1,
  _ev: {}, _hudHooks: [], _mapHooks: [], _solids: [], _noTrees: [],
  /** Fishing events: 'cast' ({distance, rig}), 'follow' (fish), 'refuse' (fish), 'bite' (fish), 'miss' (fish), 'hooked' (fish),
   *  'lost' (fish, why: 'snap' | 'thrown' | 'eaten' | 'drop'), 'landed' (fish), 'catch' (record, fish).
   *  Subscribe to an event: 'ready', 'update' (dt), 'action' (F/click/tap with nothing to pick up), 'pickup' (pickup),
   *  'beforePickup' (pickup; return false to refuse), 'inventoryFull' (pickup), 'key' (code, event). Returns an unsubscribe function. */
  on(name, fn) { (this._ev[name] = this._ev[name] || []).push(fn); return () => this._ev[name] = this._ev[name].filter(f => f !== fn); },
  emit(name, ...a) { let r; for (const fn of this._ev[name] || []) { const v = fn(...a); if (v !== undefined) r = v; } return r; },

  // ---- building meshes ----
  /** Low-poly mesh builder: b.quad/tri/tube/blob; set b.mat = Game.MT.X before adding faces. Finish with b.done(). Colours may exceed 1 for glow. */
  mesh() { const b = meshBuilder(); b.done = () => new Float32Array(b.v); return b; },
  MT, // surface materials: GEN PLASTER WOOD TILE STONE ROCK LEAF BARK CLOTH GLOW GLASS LAMP METAL

  // ---- items & pickups ----
  /** Register an item. def: { name, color: css colour, mesh: Float32Array (from Game.mesh().done(), model ~1 unit tall, base at z=0),
   *  stack?: max per slot, worldScale?: size when lying in the world, icon?: {yaw,pitch,dist,target,fov}, particle?: [r,g,b] } */
  registerItem(id, def) { ITEMS[id] = Object.assign({ css: def.color || '#ffd34d' }, def); return id; },
  /** Put an item in the world. opts: { id (persistent: stays gone once taken), z, count, scale, rot, float, spin }. Returns the pickup. */
  spawnPickup(item, x, y, opts = {}) {
    if (opts.id && Engine.taken.has(opts.id)) return null;
    const q = Object.assign({ item, x, y, count: 1, scale: 1, rot: Math.random() * 6.28, float: false, spin: false, phase: Math.random() * 6.28 }, opts);
    if (opts.z === undefined) q.z = surfAt(x, y);
    Engine.pickups.push(q); return q;
  },
  removePickup(q) { q.taken = true; Engine.pickups = Engine.pickups.filter(p => p !== q); },
  get pickups() { return Engine.pickups; },

  // ---- inventory ----
  addItem: (id, n) => Engine.addItem(id, n), removeItem: (id, n) => Engine.removeItem(id, n), countItem: id => Engine.countItem(id),
  get inventory() { return Engine.inv.map(s => ({ ...s })); },
  openInventory(open = true) { Engine.toggleInventory(open); },
  /** Player level (sets inventory size). */
  setLevel(n) { this.level = Math.max(1, n | 0); },

  // ---- world ----
  heightAt: (x, y) => surfAt(x, y),                       // ground (or water surface) height
  groundAt: (x, y) => groundAt(x, y),                     // ground height, even under water

  // ---- water ----
  /** Is there water at (x, y)? */
  isWater: (x, y) => { sample(x, y); return hW(SE) < SW; },
  /** Everything about the water at a point: { kind: 'sea'|'lake'|'pond'|'river'|'creek', name, id, level, ground, depth, wet, murk, flow: {x,y,speed} } */
  waterAt: (x, y) => waterInfo(x, y),
  /** Nearest bank of a kind of water ('lake','pond','river','creek','sea', or 'any'): { x, y, a (faces the water), wx, wy } or null */
  findWater(kind = 'any', x = Engine.P.x, y = Engine.P.y, maxR = 4000) { const k = WATER.findIndex(w => w.key === kind); return findWater(k, x, y, maxR); },
  /** Walk to the bank of the nearest water of a kind, facing it. Returns the spot or null. */
  travelToWater(kind = 'any') { const p = this.findWater(kind); if (p) { Engine.travel(p.x, p.y); Engine.P.a = p.a; Engine.P.pitch = -0.15; } return p; },
  /** The water under the crosshair (waterAt() plus x, y, dist), or null. Handy for casting. */
  get lookingAt() { return Engine.look; },
  get swimming() { return Engine.swim; }, get underwater() { return Engine.uw; }, get wading() { return Engine.wade > 0.05; },
  /** Rings on the water (strength ~0.3 small .. 1.5 big), and a splash of droplets. */
  ripple(x, y, strength = 0.6) { Engine.addRipple(x, y, strength); },
  splash(x, y, n = 30) { Engine.addRipple(x, y, 1); Engine.splash(x, y, surfAt(x, y), n); },
  /** Ambient fish near the player: { species, x, y, z, a, len, kd, scare } (live objects; read-only is safest). */

  // ---- fish ----
  /** Add or replace a species from a JSON definition (see fish/README.md). opts.save keeps it in this browser.
   *  Returns { def, errors, warnings }; def is null when errors stop it. Live populations rebuild automatically. */
  registerFish(json, opts = {}) { return FishDB.register(json, opts); },
  /** Load species from a URL (a species file, an array, or { "fish": [ files or definitions ] }), an object, or an array. */
  async loadFish(src, { save = false, base = location.href } = {}) {
    let j = src, here = base;
    if (typeof src === 'string') { here = new URL(src, base).href; j = await (await fetch(here)).json(); }
    const arr = Array.isArray(j) ? j : Array.isArray(j.fish) ? j.fish : [j], out = [];
    for (const d of arr) out.push(...(typeof d === 'string' ? await this.loadFish(d, { save, base: here }) : [FishDB.register(d, { save })]));
    return out;
  },
  // ---- tackle & fishing ----
  /** Load tackle (rods, reels, lines, leaders, hooks, sinkers, floats, baits, lures, rigs; see tackle/README.md) from a URL,
   *  an object, an array, or { "tackle": [ files or definitions ] }. opts.save keeps it in this browser. Returns [{ def, errors, warnings }]. */
  async loadTackle(src, { save = false, base = location.href } = {}) {
    let j = src, here = base;
    if (typeof src === 'string') { here = new URL(src, base).href; j = await (await fetch(here)).json(); }
    const arr = Array.isArray(j) ? j : Array.isArray(j.tackle) ? j.tackle : [j], out = [];
    for (const d of arr) out.push(...(typeof d === 'string' ? await this.loadTackle(d, { save, base: here }) : [TackleDB.register(d, { save })]));
    return out;
  },
  get tackle() { return TackleDB.list; }, tackleDef: id => TackleDB.byId[id],
  /** What a rig adds up to: cast distance, breaking strain and weakest link, drag, how it fishes, warnings. Pass a rig id or object. */
  rigStats: rig => rigStats(typeof rig === 'string' ? TackleDB.byId[rig] : rig),
  /** Tie on a rig by id (when the line is in). */ equipRig(id) { return Engine.equipRig(id); },
  get rig() { return Engine.ang && Engine.ang.rig; },
  /** The angler: { out, phase: 'stowed'|'ready'|'charge'|'flight'|'water'|'bite'|'fight'|'card', lure, lineOut, tension, fish, ... } */
  get angler() { return Engine.ang; },
  rod(out = true) { Engine.toggleRod(out); }, openTackleBox(open = true) { Engine.toggleTackle(open); },
  /** Everything you've landed: [{ species, name, cm, kg, t, rig, kept, water, climate, seed }] */
  get catches() { return Engine.catchLog(); },
  /** Forget a species imported into this browser (built-in ones come back on reload). */
  forgetFish(id) { FishDB.forget(id); },
  get fishSpecies() { return FishDB.list; },
  fishDef: id => FishDB.byId[id],
  /** A species back as JSON text (defaults filled in) — handy as a starting point for a new one. */
  exportFish(id) { const d = FishDB.byId[id]; return d ? defJSON(d) : null; },
  /** Live fish near the player: { id, species, name, lengthCm, weightKg, x, y, z, state, zone, hunger, stress, act, temp, ... } */
  get fish() { return Engine.fish.filter(f => !f.dead); },
  fishNear(x, y, r = 10) {   // live fish within r metres, nearest first (not the dead, nor one on your line)
    const E = Engine, G = E.fishGrid, r2 = r * r, hit = [], take = f => { if (f.dead || f.hooked) return; const d = (f.x - x) ** 2 + (f.y - y) ** 2; if (d <= r2) hit.push([d, f]); };
    if (G && E.fishGridFor === E.fish && r <= 96) {   // this frame's 8 m grid (updateFish): only the cells the circle touches, and one more for what has swum since
      for (let i = Math.floor((x - r) / 8) - 1, i1 = Math.floor((x + r) / 8) + 1; i <= i1; i++) for (let j = Math.floor((y - r) / 8) - 1, j1 = Math.floor((y + r) / 8) + 1; j <= j1; j++) {
        const cell = G.get((i + 32768) * 65536 + j + 32768); if (cell) for (const f of cell) take(f); }
    } else for (const f of E.fish) take(f);
    return hit.sort((a, b) => a[0] - b[0]).map(p => p[1]);
  },
  /** Chance (0..1) this fish takes an offering presented right now. food: a diet word ('insects', 'worms', 'fish', ...);
   *  opts: { zone: 'surface'|'mid'|'bottom', size_cm, presentation: 0..1 }. Uses diet, activity, hunger, fear, curiosity, gape. */
  strikeChance(f, food, o = {}) {
    if (!f || f.dead) return 0; const D = f.def, F = D.diet.food; let pref = F[food] || 0; if (!pref) return 0;
    if (food === 'fish' && D.diet.piscivore_from_cm) pref *= f.lengthCm >= D.diet.piscivore_from_cm ? 1.4 : 0.35;
    let p = Math.min(1, pref / Math.max(...Object.values(F))) * f.act * (0.25 + 0.75 * f.hunger) * (1 - f.stress) * (0.6 + 0.4 * D.behavior.curiosity);
    p *= 0.7 + 0.6 * foodAvail(food, envAt(f.x, f.y, false), f.temp ?? 15);   // "match the hatch": what's about right now looks right
    if (o.zone) { const Z = D.diet.feeding_zone, zm = Math.max(Z.surface || 0, Z.mid || 0, Z.bottom || 0) || 1; p *= 0.2 + 0.8 * (Z[o.zone] || 0) / zm; }
    if (o.size_cm) { const gape = f.lengthCm * (0.12 + 0.3 * D.body.head.mouth); if (o.size_cm > gape) p *= Math.max(0.05, 1 - (o.size_cm - gape) / gape); }
    if (o.presentation !== undefined) p *= clamp(o.presentation, 0, 1);
    return clamp(p, 0, 1);
  },
  /** Take a fish out of the world (caught, eaten...). It stays gone for CONFIG.fishRespawnMinutes, even across reloads. */
  removeFish(f) { Engine.removeFish(f); },
  /** Spook fish around a point (strength 1 = a splash). */
  disturb(x, y, strength = 1) { Engine.disturb(x, y, strength); },
  waterTempAt: (x, y, below = 0.5) => waterTempAt(x, y, below),   // °C, `below` metres under the surface
  /** Jump to a season ('spring' | 'summer' | 'autumn' | 'winter'), part 0..1 of the way through it. Returns its name. */
  setSeason(name, part = 0.45) { const i = Math.max(0, SEASONS.indexOf(name === 'fall' ? 'autumn' : name)); ENV.setDate((i + part) / 4); Engine.fishCells.clear(); return SEASONS[i]; },
  /** Launch a boat (by id) in the water in front of you; walk or swim to it and press F / Use to get in. */
  spawnBoat(id) { return Engine.spawnBoat(id); },
  /** Add a boat definition (an object in the boats/README.md format). */
  loadBoat(def) { return BoatDB.register(def); },
  get boats() { return BoatDB.list; }, get boat() { return Engine.boat; },
  /** Spawn one animal in the water in front of you. Returns [the new animal], or null. */
  spawn(id) { return Engine.spawnAnimal(id); },
  /** Force the weather for a few hours: clear, fair, overcast, drizzle, rain, storm, fog. */
  setWeather(kind) { ENV.setWeather(kind); },
  /** Live conditions: season, day, air temperature, cloud, rain, wind, pressure and its 3-hour trend, hatch, ice... */
  get conditions() { const E = ENV; return { season: E.season, yearFraction: E.yf, day: Math.floor(E.day % E.yearDays) + 1, weather: E.kind, airT: E.airT, cloud: E.cloud, rain: E.rain, snowing: !!E.snowing, wind: E.wind * 12, fog: E.fog, pressure: E.pressure, pressureTrend: E.trend, wet: E.wet, snowCover: E.snowCover, hatch: E.hatch, leaves: E.leaf, iceLake: E.iceLake, icePond: E.icePond, label: E.label() }; },
  foodAt(x, y, food) { const e = envAt(x, y); return foodAvail(food, e, waterTemp(e.kind, e.level, 0.5, x, y)); },   // 0..1 natural food of a kind here, now
  oxygenAt(x, y, below = 0.5) { const e = envAt(x, y, false), T = waterTemp(e.kind, e.level, below, x, y); return oxygen(e.kind, T, below, e.rap); },   // mg/L
  coverAt: (x, y, r = 4) => coverAt(x, y, r),                     // { rocks, weeds, reeds, lilies, open } 0..1
  habitatScore(id, x, y) { const D = FishDB.byId[id]; return D ? habitatScore(D, envAt(x, y)) : 0; }, // 0..1 how well a spot suits a species
  get fishFinder() { return Engine.finder; }, set fishFinder(v) { Engine.finder = !!v; },
  biomeAt(x, y) { sample(x, y); return ['deep water', 'shallow water', 'sand', 'plains', 'forest', 'rock', 'alpine', 'snow', 'glacier'][material(SE, SM, x, y)]; },
  /** Static decoration: registerMesh(name, Float32Array) once, then addProp(name, x, y, { z, rot, scale }). */
  registerMesh(name, data) { Engine.meshData[name] = data; delete Engine.meshes[name]; }, // uploaded to the GPU on first use
  addProp(mesh, x, y, opts = {}) { const p = Object.assign({ mesh, x, y, rot: 0, scale: 1 }, opts); if (opts.z === undefined) p.z = surfAt(x, y); Engine.props.push(p); return p; },
  /** Warm point light (up to 8 nearest are used). Returns the light; change .intensity or remove with removeLight. */
  addLight(x, y, z, intensity = 2, flicker = false) { const l = { x, y, z, intensity, flicker }; Engine.lights.push(l); return l; },
  removeLight(l) { Engine.lights = Engine.lights.filter(q => q !== l); },
  /** Block movement where fn(x, y, z) returns true. */
  addSolid(fn) { this._solids.push(fn); },
  /** Keep trees out where fn(x, y) returns true (applies to terrain chunks built afterwards). */
  addNoTrees(fn) { this._noTrees.push(fn); },
  noTreesAt(x, y) { return this._noTrees.some(fn => fn(x, y)); },
  sparkle(x, y, z, col = [1.6, 1.4, 0.6], n = 30) { for (let k = 0; k < n; k++) Engine.spawn(SPARK, x + Engine.rnd(-0.3, 0.3), y + Engine.rnd(-0.3, 0.3), z + Engine.rnd(0, 1), Engine.rnd(-1, 1), Engine.rnd(-1, 1), Engine.rnd(0.5, 2), Engine.rnd(0.5, 1), 0.06, { col }); },

  // ---- player, time, HUD ----
  get player() { return Engine.P; },                     // { x, y, z, a (heading), pitch }
  teleport(x, y) { Engine.travel(x, y); },
  get hour() { return (Engine.tod ?? CONFIG.startHour / 24) * 24; }, set hour(h) { Engine.tod = ((h % 24) + 24) % 24 / 24; },
  say(text, secs) { Engine.say(text, secs); },
  /** Draw on the HUD each frame: fn(ctx, width, height). project(x,y,z) gives screen coords or null. */
  onHud(fn) { this._hudHooks.push(fn); }, project: (x, y, z) => Engine.project(x, y, z),
  /** Draw on the minimap / map: fn(ctx, toPx(x,y) -> [px,py], inside(px,py), unitsPerCell). */
  onMap(fn) { this._mapHooks.push(fn); },
};

