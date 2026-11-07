'use strict';
// Engine: placing animals, predator strikes, per-frame fish update and GPU batches, the fish finder.
Object.assign(Engine, {
  // put one animal of a species in the water in front of you
  spawnAnimal(id) {
    const D = FishDB.byId[id]; if (!D) return null;
    const P = this.P, ca = Math.cos(P.a), sa = Math.sin(P.a), L = D.size.length_cm.typical / 100, near = Math.max(3, Math.min(14, 2 + L * 2.2));
    let spot = null;
    for (let d = near; d < 60 && !spot; d += 1) for (const off of [0, 1.5, -1.5, 3, -3]) {   // the first water straight ahead that's deep enough for it
      const x = P.x + ca * d - sa * off, y = P.y + sa * d + ca * off; sample(x, y); const dep = SW - hW(SE);
      if (dep > Math.max(0.3, Math.min(L * 0.5, 3))) { spot = { x, y, kd: SK, dep }; break; }
    }
    if (!spot) {
      if (D.behavior.haul_out > 0) { const x = P.x + ca * near, y = P.y + sa * near; sample(x, y); spot = { x, y, kd: SK, dep: SW - hW(SE), land: true }; }   // seals can lie on the shore
      else { this.say(`No water ahead deep enough for a ${D.name.toLowerCase()} — face the water`, 3); return null; }
    }
    const n = 1, made = [], rnd = mulberry32((Date.now() ^ (id.length * 9973)) >>> 0);
    for (let k = 0; k < n; k++) {
      const f = this.makeFish({ si: FishDB.list.indexOf(D), id: `spawn#${this.spawnN = (this.spawnN || 0) + 1}`, hx: spot.x + (k ? (rnd() - 0.5) * 2 : 0), hy: spot.y + (k ? (rnd() - 0.5) * 2 : 0), size: sampleFishSize(D, rnd), lead: k ? 0 : -1, r: rnd() });
      f.a = P.a + Math.PI + (rnd() - 0.5) * 0.8;   // facing you, roughly
      if (spot.land) { sample(f.x, f.y); f.ground = hW(SE); f.z = f.ground + 0.05; f.land = true; f.state = 'haul'; f.tNext = 20; }
      else { f.state = 'rest'; f.tNext = 2 + rnd() * 2; }
      if (k) { f.leader = made[0]; const s = f.len * 1.6 + 0.3; f.ox = (rnd() - 0.7) * s * 2; f.oy = (rnd() - 0.5) * s * 2; f.oz = (rnd() - 0.5) * 0.5; }
      f.spawned = true; made.push(f);
    }
    this.spawned.push(...made); if (this.spawned.length > 60) { for (const f of this.spawned.splice(0, this.spawned.length - 60)) f.dead = true; }
    this.fish.push(...made);
    const W = WATER_KEYS[spot.kd], at = (D.habitat.waters[W] || 0) > 0 ? '' : ` (it doesn't normally live in ${W === 'sea' ? 'the sea' : W + 's'})`;
    this.say(`${n > 1 ? n + ' × ' : ''}${D.name}${at}`, 3); Game.emit('spawn', made);
    return made;
  },
  // a predator reaches its prey: a lunge that may miss (alert prey and open water favour the prey)
  fishStrike(f) {
    const g = f.prey, B = f.def.behavior; f.prey = null;
    if (!g || g.dead) { f.state = 'rest'; f.tNext = 1; return; }
    const p = clamp(0.25 + 0.35 * B.ambush + 0.3 * (1 - g.stress) - 0.15 * g.def.behavior.wariness + 0.15 * (1 - ENV.light), 0.08, 0.9);
    if (Math.random() < p) {
      // Queries and rendering skip dead animals immediately. Compact once in
      // syncFishCells instead of copying/scanning the population on every kill.
      g.dead = true; g.eatenBy = f.id;
      if (g.wl - g.z < 0.8) { this.addRipple(g.x, g.y, 0.5 + f.len); for (let k = 0; k < 6 + f.len * 20; k++) this.spawn(DROP, g.x + this.rnd(-0.2, 0.2), g.y + this.rnd(-0.2, 0.2), g.wl, this.rnd(-1, 1), this.rnd(-1, 1), this.rnd(1.5, 3), this.rnd(0.3, 0.6), 0.035); }
      this.disturb(g.x, g.y, 0.25);
      Game.emit('fishEaten', f, g);
      f.zone = 'mid'; this.fishEat(f, 0.9 + Math.min(1, g.len / f.len));
    } else { g.stress = 1; g.thx = f.x; g.thy = f.y; g.tNext = 0; f.state = 'rest'; f.tNext = 1 + Math.random() * 3; }
  },
  // fish within `r` of (x, y), from an 8 m grid rebuilt each frame: callback per fish (may stop early by returning true)
  fishAround(x, y, r, fn) {
    const G = this.fishGrid; if (!G) return; const c = 8, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) { const a = G.get((gx + 32768) * 65536 + gy + 32768); if (a) for (const f of a) if (!f.dead && (f.x - x) ** 2 + (f.y - y) ** 2 <= r * r && fn(f)) return; }
  },
  updateFish(dt) {
    if ((this.cellT -= dt) <= 0) { this.cellT = 0.4; this.syncFishCells(); }
    { const G = this.fishGrid || (this.fishGrid = new Map()), pool = this.fishBucketPool || (this.fishBucketPool = []);
      for (const bucket of G.values()) { bucket.length = 0; pool.push(bucket); } G.clear();
      for (const f of this.fish) {
        if (f.dead) continue;
        const k = (Math.floor(f.x / 8) + 32768) * 65536 + Math.floor(f.y / 8) + 32768;
        let bucket = G.get(k); if (!bucket) G.set(k, bucket = pool.pop() || []); bucket.push(f);
      }
    }
    // Full-rate interaction near the player/lure; background animals run at
    // 30, 15 or 8 Hz. Real-time intervals retain behaviour on slow frames too.
    const P = this.P, lure = this.ang && this.ang.out && this.ang.lure; this.frameDt = dt;
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i]; if (f.dead || f.hooked) continue;
      f.acc = (f.acc || 0) + dt;
      const st = f.state, busy = st === 'hunt' || st === 'flee' || st === 'lure' || st === 'breathe' || f.leapV !== undefined || (f.chaser && this.time - f.chasedT < 0.5);
      const d2 = (f.x - P.x) ** 2 + (f.y - P.y) ** 2;
      const atLure = lure && (f.x - lure.x) ** 2 + (f.y - lure.y) ** 2 < 12 * 12;
      const interval = busy || atLure || d2 < 20 * 20 ? 0 : d2 < 45 * 45 ? 1 / 30 : d2 < 70 * 70 ? 1 / 15 : 1 / 8;
      f.simWait = (f.simWait ?? (i % 8) / 8 * interval) - dt;
      if (interval && f.simWait > 0) continue;
      this.fishStep(f, Math.min(f.acc, 0.25)); f.acc = 0;
      f.simWait = interval ? Math.max(0, f.simWait + interval) : 0;
    }
    this.noises = this.noises.filter(n => this.time - n.t < 1);
  },
  // Cluster vertices only for animals occupying a few pixels. Keep material
  // boundaries (including animated jaws) and use the detailed mesh up close.
  fishLodMesh(mesh) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < mesh.length; i += VS) { lo = Math.min(lo, mesh[i]); hi = Math.max(hi, mesh[i]); }
    const cell = Math.max(0.001, (hi - lo) / 20), groups = [], byCell = new Map(), ids = [];
    for (let i = 0; i < mesh.length; i += VS) {
      const key = `${Math.round(mesh[i] / cell)},${Math.round(mesh[i + 1] / cell)},${Math.round(mesh[i + 2] / cell)},${mesh[i + 9]}`;
      let id = byCell.get(key);
      if (id === undefined) { id = groups.length; byCell.set(key, id); groups.push({ sum: new Float64Array(VS), n: 0, normal: mesh.slice(i + 3, i + 6) }); }
      const g = groups[id]; g.n++; for (let k = 0; k < VS; k++) g.sum[k] += mesh[i + k]; ids.push(id);
    }
    for (const g of groups) {
      for (let k = 0; k < VS; k++) g.sum[k] /= g.n;
      const n = Math.hypot(g.sum[3], g.sum[4], g.sum[5]);
      for (let k = 3; k < 6; k++) g.sum[k] = n > 1e-6 ? g.sum[k] / n : g.normal[k - 3];
    }
    const out = [];
    for (let i = 0; i < ids.length; i += 3) {
      const a = ids[i], b = ids[i + 1], c = ids[i + 2]; if (a === b || a === c || b === c) continue;
      out.push(...groups[a].sum, ...groups[b].sum, ...groups[c].sum);
    }
    return out.length && out.length < mesh.length ? new Float32Array(out) : mesh;
  },
  fishGpu(si, low = false) {
    const gl = this.gl; let g = FishDB.gpu[si];
    if (!g || g.stale) {
      if (g) for (const old of [g, g.low]) if (old) { gl.deleteVertexArray(old.vao); gl.deleteBuffer(old.ib); gl.deleteBuffer(old.vb); }
      const D = FishDB.list[si], ib = gl.createBuffer(), vb = this.vbo(D._mesh);
      g = FishDB.gpu[si] = { vao: this.litVao(vb, VB, ib, 40), ib, vb, n: D._mesh.length / VS };
    }
    if (low) {
      if (!g.low) {
        const mesh = this.fishLodMesh(FishDB.list[si]._mesh), ib = gl.createBuffer(), vb = this.vbo(mesh);
        g.low = { vao: this.litVao(vb, VB, ib, 40), ib, vb, n: mesh.length / VS };
      }
      return g.low;
    }
    return g;
  },
  // fish finder (G): labels on nearby fish and a census of what's around
  drawFinder(c, Wd, Ht) {
    const P = this.P, fmtW = kg => kg < 1 ? `${(kg * 1000).toFixed(0)} g` : `${kg.toFixed(2)} kg`;
    const near = this.fish.filter(f => !f.dead && Math.hypot(f.x - P.x, f.y - P.y) < 32).sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y)).slice(0, 30);
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; const placed = [];
    const T = this.touchUI; let nLab = 0;
    for (const f of near) {
      const p = this.project(f.x, f.y, f.z + 0.12); if (!p || p[0] < 0 || p[0] > Wd || p[1] < 30 || p[1] > Ht) continue;
      c.fillStyle = f.stress > 0.5 ? '#ff9a7a' : '#cfeeff'; c.beginPath(); c.arc(p[0], p[1], 2.5, 0, 6.3); c.fill();   // a dot for every fish, a short label on the nearest few
      if (nLab >= 5 || placed.some(q => Math.abs(q[0] - p[0]) < 120 && Math.abs(q[1] - p[1]) < 22)) continue; placed.push(p); nLab++;
      const tl = `${f.name} · ${f.lengthCm.toFixed(0)} cm`; c.font = `bold ${T ? 10 : 12}px Georgia, serif`; const w = c.measureText(tl).width + 12;
      c.fillStyle = 'rgba(20,26,20,.72)'; c.fillRect(p[0] - w / 2, p[1] - 22, w, 17); c.fillStyle = f.stress > 0.5 ? '#ff9a7a' : '#f2e9d0'; c.fillText(tl, p[0], p[1] - 13.5);
    }
    c.restore();
  },
});
