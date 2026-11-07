'use strict';
// Engine: item meshes and icons framing, pickups in reach and the use action (F).
Object.assign(Engine, {
  // ---- meshes, items, pickups ----
  instMesh(data) { const gl = this.gl, ib = gl.createBuffer(), vbo = this.vbo(data); return { vao: this.litVao(vbo, VB, ib), ib, vbo, n: data.length / VS }; },
  itemMesh(id) { return this.itemMeshes[id] || (ITEMS[id] && ITEMS[id].mesh ? (this.itemMeshes[id] = this.instMesh(ITEMS[id].mesh)) : null); },
  autoIconView(it) { // frame the item's mesh: target its bounding-box centre, back off to fit
    const v = it.mesh; let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < v.length; i += VS) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[i + k]); hi[k] = Math.max(hi[k], v[i + k]); }
    const c = lo.map((l, k) => (l + hi[k]) / 2), r = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
    return { yaw: 2.6, pitch: -0.35, dist: r / Math.sin(15 * Math.PI / 180) * 1.05, target: c, fov: 30 };
  },
  collectTarget() { // the pickup you'd take: within reach, preferring the one closest to where you look
    const P = this.P; let best = null, bs = 1e9;
    for (const q of this.pickups) {
      if (q.taken || Math.abs(q.x - P.x) > CONFIG.collectRange || Math.abs(q.y - P.y) > CONFIG.collectRange) continue;
      const d = Math.hypot(q.x - P.x, q.y - P.y); if (d > CONFIG.collectRange || Math.abs(q.z - P.z) > 3) continue;
      const ang = Math.atan2(q.y - P.y, q.x - P.x) - P.a, da = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
      const sc = d * 0.5 + da * 2 - (d < 1.2 ? 2 : 0);
      if ((da < 1.3 || d < 1.2) && sc < bs) { bs = sc; best = q; }
    }
    return best;
  },
  action() { // F / click / tap: take the pickup in reach, otherwise hand the action to the game
    if (this.boat) { this.leaveBoat(); return; }
    { const bt = this.nearBoat(); if (bt) { this.boardBoat(bt); return; } }
    const q = this.collectTarget();
    if (!q) { Game.emit('action'); return; }
    const it = ITEMS[q.item];
    if (Game.emit('beforePickup', q) === false) return;
    if (this.addItem(q.item, q.count) < q.count) { this.say(`Inventory full (${this.invCap()} slots)`); Game.emit('inventoryFull', q); return; }
    q.taken = true; if (q.id) { this.taken.add(q.id); this.saveGame(); }
    const col = it.particle || [1.6, 1.4, 0.6];
    for (let k = 0; k < 36; k++) this.spawn(SPARK, q.x + this.rnd(-0.3, 0.3), q.y + this.rnd(-0.3, 0.3), q.z + this.rnd(0.2, 1.2), this.rnd(-1, 1), this.rnd(-1, 1), this.rnd(0.5, 2), this.rnd(0.5, 1), 0.06, { col });
    this.say(`+${q.count} ${it.name} (${this.countItem(q.item)})`);
    Game.emit('pickup', q);
  },
});
