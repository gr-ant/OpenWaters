'use strict';
// Engine: projecting to the screen, travel to a map point (with a boat if it's water), map zoom and pan.
Object.assign(Engine, {
  project(x, y, z) { const m = this.vp; if (!m) return null; const w = m[3] * x + m[7] * y + m[11] * z + m[15]; if (w <= 0.1) return null;
    return [((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * innerWidth, (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5) * innerHeight]; },

  travel(x, y, sym) {
    { const E = CONFIG.worldEdge - 5; x = clamp(x, -E, E); y = clamp(y, -E, E); }
    if (this.ang && this.ang.out) this.toggleRod(false);   // the line can't stay cast where you were
    if (this.boat) this.leaveBoat();
    const P = this.P; P.x = x; P.y = y; P.vz = 0; P.z = standZ(x, y); this.fish = []; this.fishCells.clear(); this.cellT = 0;
    if (sym) this.markers.push({ x, y, sym }); this.showMap = false;
    this.streamChunks(1e9, 2); // land under you appears immediately
    const w = waterInfo(x, y); if (w.depth > 0.15) this.boatHere(x, y, w);   // onto the water: straight into a boat that suits it (found nearby if it's shallow right here)
  },
  // a boat under you at (x, y), boarded: the kind that suits the water, or failing room for that one, the shallowest
  // boat that fits (a gently shelving beach may be too thin for a big hull for a long way out)
  boatHere(x, y, w) {
    const first = this.boatFor(w.kind), tries = [first, ...BoatDB.list.filter(D => D !== first).sort((p, q) => p.hull.draft_m - q.hull.draft_m)];
    const a = this.P.a, ca = Math.cos(a), sa = Math.sin(a);
    for (const D of tries) {
      const L = D.hull.length_m, need = D.hull.draft_m + 0.2;
      for (let r = 0, k = 0; r < 150; k++, r = Math.sqrt(k) * 4) {   // a spiral out to 150 m, denser near the spot
        const ang = k * 2.4, bx = x + Math.cos(ang) * r, by = y + Math.sin(ang) * r; sample(bx, by); if (SK !== w.kindId) continue;
        let ok = true; for (const s of [-0.5, 0, 0.5]) if (this.boatDepth(bx + ca * s * L, by + sa * s * L) < need) ok = false;
        if (!ok) continue;
        sample(bx, by); const b = { def: D, id: 'boat#' + (this.boatN = (this.boatN || 0) + 1), x: bx, y: by, a, v: 0, kd: SK, wl: SW, z: SW, pitch: 0, roll: 0, yaw: 0, auto: true };
        this.boats.push(b); while (this.boats.length > 8) { const i = this.boats.findIndex(q => q !== this.boat && q !== b); this.boats.splice(i, 1); }
        (this.boated || (this.boated = new Set())).add(w.id); this.boardBoat(b); Game.emit('boatSpawn', b);
        if (D !== first) this.say(`Too shallow here for a ${first.name.toLowerCase()}: a ${D.name.toLowerCase()} instead`, 3);
        return b;
      }
    }
    this.say('Too shallow for any boat here', 3); return null;
  },
  zoom(f) { if (this.showMap) this.mapScale = clamp(this.mapScale * f, 1, 256); else this.miniScale = clamp(this.miniScale * f, 0.5, 64); },
  // big map: zoom by f keeping the world point under screen point (sx, sy) where it is; pan by screen pixels
  mapZoomAt(f, sx, sy) { const v = this.bigMemo.view; if (!v) return this.zoom(f); const ns = clamp(this.mapScale * f, 1, 256), u = (sx - v.x0) / v.cell - v.w / 2, w = (sy - v.y0) / v.cell - v.h / 2;
    this.mapCX += u * (this.mapScale - ns); this.mapCY += w * (this.mapScale - ns); this.mapScale = ns; this.mapClamp(); },
  mapPan(dx, dy) { const v = this.bigMemo.view, cell = v ? v.cell : 4; this.mapCX -= dx / cell * this.mapScale; this.mapCY -= dy / cell * this.mapScale; this.mapHoldT = performance.now(); this.mapClamp(); },
  mapClamp() { const E = CONFIG.worldEdge; this.mapCX = clamp(this.mapCX, -E, E); this.mapCY = clamp(this.mapCY, -E, E); },
  pastEdge(x, y) { const E = CONFIG.worldEdge; return Math.abs(x) > E || Math.abs(y) > E; },
  edgeWarn() { if (performance.now() - (this.edgeT || 0) > 4000) { this.edgeT = performance.now(); this.say('Open sea, as far as the eye can see. Turn back toward the island.', 3); } },
});
