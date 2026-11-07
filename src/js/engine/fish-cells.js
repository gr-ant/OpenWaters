'use strict';
// Engine: fish populations per water cell: making, syncing, trimming and removing fish (caught fish stay gone, per seed).
Object.assign(Engine, {
  // ambient fish: spawn in water around you, wander (or hold against the current in rivers), scatter from swimmers
  // ---- fish: fixed populations per 16 m water cell; each fish runs on its species data ----
  spawned: [], boats: [], boat: null, fishCells: new Map(), fishGone: null, noises: [], cellT: 0, dtH: 0, finder: false, fishRev: -1,
  disturb(x, y, s = 1) { this.noises.push({ x, y, s, t: this.time }); if (this.noises.length > 16) this.noises.shift(); },
  goneKey() { return 'engine-fishgone-' + CONFIG.saveName + '-' + SEED; },
  isGone(id) {
    if (!this.fishGone) { try { this.fishGone = JSON.parse(localStorage.getItem(this.goneKey()) || '{}'); } catch (e) { this.fishGone = {}; } }
    const t = this.fishGone[id]; return t && Date.now() - t < CONFIG.fishRespawnMinutes * 60000;
  },
  removeFish(f) {
    if (!f || f.dead) return; f.dead = true; this.isGone(''); this.fishGone[f.id] = Date.now();
    for (const k in this.fishGone) if (Date.now() - this.fishGone[k] > CONFIG.fishRespawnMinutes * 60000) delete this.fishGone[k];
    try { localStorage.setItem(this.goneKey(), JSON.stringify(this.fishGone)); } catch (e) { /* storage unavailable */ }
  },
  makeFish(sp) {
    const D = FishDB.list[sp.si]; sample(sp.hx, sp.hy); const wl = SW, g0 = hW(SE), g = fishFloor(D, wl, g0), Lr = D.size.length_cm, T = waterTemp(SK, wl, (wl - g) * 0.5, sp.hx, sp.hy), H = D.habitat.temperature_c, z0 = D._benthic ? g + Math.max(0.01, -D._zmin * sp.size.cm / 100) + 0.01 : g + (wl - g) * 0.5;
    return { temp: T, tfit: fitRange(T, H.min, H.optimal, H.max), id: sp.id, sp: sp.si, def: D, species: D.id, name: D.name, lengthCm: sp.size.cm, weightKg: sp.size.kg, len: sp.size.cm / 100,
      x: sp.hx, y: sp.hy, z: z0, a: sp.r * 6.2832, spd: 0, homeX: sp.hx, homeY: sp.hy, kd: SK, wl, ground: g0,
      state: 'rest', zone: null, tx: sp.hx, ty: sp.hy, tz: z0, tNext: sp.r * 3, hunger: 0.3 + 0.6 * sp.r, stress: 0, act: 0.5, air: D.behavior.breath_hold_s * sp.r, pitch: 0,
      fx: 0, fy: 0, cur: 0, ph: sp.r * 6.28, tint: 0.35 + 0.3 * sp.r, leader: null, lead: sp.lead, ox: 0, oy: 0, oz: 0,
      sizeRank: (sp.size.cm - Lr.min) / Math.max(1, Lr.max - Lr.min) };
  },
  syncFishCells() {
    const limit = this.touchUI ? Math.min(CONFIG.maxFish, CONFIG.maxFishTouch) : CONFIG.maxFish;
    const P = this.P, R = 72, cs = FISH_CELL;
    // populate around you, and around your lure or bait once it's out in the water (a long cast into deep water would
    // otherwise land beyond every fish); distance counts from whichever is nearer
    const L = this.ang && this.ang.out && this.ang.lure, centres = [[P.x, P.y, R]];
    if (L && L.kd >= 0 && !L.land && Math.hypot(L.x - P.x, L.y - P.y) > 24) centres.push([L.x, L.y, 40]);
    const far = (x, y) => Math.min(...centres.map(([cx, cy, r]) => Math.hypot(x - cx, y - cy) - r));   // < 0 inside a circle
    if (this.fishRev !== FishDB.revision) { this.fishCells.clear(); this.fishRev = FishDB.revision; }
    for (const [k, c] of this.fishCells) if (far((c.cx + 0.5) * cs, (c.cy + 0.5) * cs) > 24 && !c.fish.some(f => f === (this.ang && this.ang.fish))) this.fishCells.delete(k);
    const want = [], seen = new Set();
    for (const [x0, y0, r] of centres) { const ccx = Math.floor(x0 / cs), ccy = Math.floor(y0 / cs), rc = Math.ceil(r / cs);
      for (let dy = -rc; dy <= rc; dy++) for (let dx = -rc; dx <= rc; dx++) { const cx = ccx + dx, cy = ccy + dy, k = cx + ',' + cy, d = far((cx + 0.5) * cs, (cy + 0.5) * cs);
        if (d < 0 && !seen.has(k)) { seen.add(k); want.push([d, cx, cy]); } } }
    want.sort((a, b) => a[0] - b[0]);
    let total = 0, added = 0;
    for (const c of this.fishCells.values()) { c.fish = c.fish.filter(f => !f.dead); total += c.fish.length; }
    if (total > limit) {
      let room = limit;
      const cells = [...this.fishCells.values()].sort((a, b) => far((a.cx + 0.5) * cs, (a.cy + 0.5) * cs) - far((b.cx + 0.5) * cs, (b.cy + 0.5) * cs));
      for (const c of cells) { if (c.fish.length > room) c.fish = this.trimCell(c.fish, room); room -= c.fish.length; }
      total = limit - room;
    }
    for (const [, cx, cy] of want) {
      const key = cx + ',' + cy; if (this.fishCells.has(key)) continue;
      if (total >= limit || added >= 3) break;   // a few cells per tick keeps frames smooth
      const all = cellFish(cx, cy).map(sp => this.makeFish(sp));
      all.forEach(f => { if (f.lead >= 0) { f.leader = all[f.lead]; const s = f.len * 1.6 + 0.3; f.ox = (Math.random() - 0.7) * s * 2; f.oy = (Math.random() - 0.5) * s * 2; f.oz = (Math.random() - 0.5) * 0.5; } });
      let fish = all.filter(f => !this.isGone(f.id));
      if (fish.length > limit - total) fish = this.trimCell(fish, limit - total);   // never past the cap
      this.fishCells.set(key, { cx, cy, fish }); total += fish.length; added++;
    }
    this.fish = []; for (const c of this.fishCells.values()) for (const f of c.fish) if (!f.dead) this.fish.push(f);
    this.spawned = this.spawned.filter(f => !f.dead && Math.hypot(f.x - P.x, f.y - P.y) < 250); for (const f of this.spawned) this.fish.push(f);   // ones you spawned stay until you're far away
    const hk = this.ang && this.ang.fish; if (hk && !hk.dead && !this.fish.includes(hk)) this.fish.push(hk);   // the fish on your line stays, however far it runs
  },
  // keep as many whole groups (a school with its leader, or a single fish) as fit in `room`, picked in a fixed
  // pseudo-random order so no species is always the one left out; followers never lose their leader
  trimCell(fish, room) {
    const members = new Set(fish), groups = new Map(); for (const f of fish) { const k = f.leader && members.has(f.leader) ? f.leader : f; (groups.get(k) || groups.set(k, []).get(k)).push(f); }
    const keep = new Set(); let n = 0;
    for (const [k, g] of [...groups].sort((a, b) => a[0].tint - b[0].tint)) if (n + g.length <= room) { g.forEach(f => keep.add(f)); n += g.length; }
    return fish.filter(f => keep.has(f));
  },
});
