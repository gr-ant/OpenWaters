'use strict';
// FISHING: drawing the rod and end tackle in 3D, the line on the overlay, and the fishing HUD hooks.
Object.assign(Engine, {
  // ---- drawing: the rod and the end tackle in 3D, the line on the overlay ----
  tackleGpu(key, build) {
    const gl = this.gl, M = this._tgpu || (this._tgpu = new Map()); let g = M.get(key);
    if (!g) { const m = build(), ib = gl.createBuffer(), vb = this.vbo(m); g = { vao: this.litVao(vb, VB, ib, 40), ib, vb, n: m.length / VS }; M.set(key, g);
      if (M.size > 80) { const [k0, g0] = M.entries().next().value; gl.deleteVertexArray(g0.vao); gl.deleteBuffer(g0.ib); gl.deleteBuffer(g0.vb); M.delete(k0); } }
    return g;
  },
  drawTackle(gl, Lp, E) {
    const A = this.ang; if (!A || !A.out || !A.S || this.showMap) return;
    const S = A.S, rv = TackleDB.revision;
    gl.uniform1f(Lp.u.fsh, 1); gl.uniform1f(Lp.u.wig, 0); gl.uniform1f(Lp.u.swm, 0); gl.uniform3fv(Lp.u.jawP, [0, 0, 0]); gl.uniform1f(Lp.u.roll, 0);
    const one = (g, x, y, z, s, rot, wl, mk, pitch) => { this.upInst(g, [x, y, z, s, rot, 0.5, wl, mk, 0, pitch]); gl.bindVertexArray(g.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, g.n, 1); };
    const lvl = rodBendLevel(A.bend), rk = `rod:${A.rigId}:${rv}:${lvl}`;
    const held = !this.thirdP && this.boat && this.boatMode === 'deck';   // in your hands on deck: drawn over the boat, so it can't poke through the hull
    if (held) gl.depthRange(0, 0.1);
    one(this.tackleGpu(rk, () => rodMesh(S, lvl / (ROD_BEND_STEPS - 1)).mesh), A.hand[0], A.hand[1], A.hand[2], 1, A.yaw, -1e4, 0, A.pitch); this.drawReelParts(one, rv);
    if (held) gl.depthRange(0, 1);
    if (A.phase === 'card') return;
    const endKey = S.lure ? `lure:${S.lure.id}:${rv}` : `bait:${S.bait.id}:${S.hook.id}:${rv}`, endMesh = () => S.lure ? lureMesh(S.lure) : baitMesh(S);
    const sc = (x, y, z, k = 6) => clamp(Math.hypot(x - E[0], y - E[1], z - E[2]) / k, 1, 9);   // a touch bigger far away, so you can follow it
    const L = A.lure, T = A.tip;
    if (!L) { // dangling under the rod tip, swinging
      const D = A.dangle || { x: T[0], y: T[1], z: T[2] - 0.3 }, u = k => [T[0] + (D.x - T[0]) * k, T[1] + (D.y - T[1]) * k, T[2] + (D.z - T[2]) * k];
      if (S.float) { const q = u(0.45); one(this.tackleGpu(`float:${S.float.id}:${rv}`, () => floatMesh(S.float)), q[0], q[1], q[2], 1, A.yaw, -1e4, 0, 0); }
      if (S.sinker) { const q = u(0.75); one(this.tackleGpu(`sinker:${S.sinker.id}:${rv}`, () => sinkerMesh(S.sinker)), q[0], q[1], q[2], 1, A.yaw, -1e4, 0, 0); }
      one(this.tackleGpu(endKey, endMesh), D.x, D.y, D.z, 1, A.yaw + Math.PI / 2, -1e4, 0, 0);
      return;
    }
    const mk = L.kd >= 0 ? WATER[L.kd].murk : 0, wl = L.kd >= 0 ? L.wl : -1e4;
    const s = sc(L.x, L.y, L.z), rot = A.phase === 'fight' || A.phase === 'bite' ? (A.fish ? A.fish.a + Math.PI : L.dir) : L.dir + Math.PI;
    one(this.tackleGpu(endKey, endMesh), L.x, L.y, L.z, s, rot, wl, mk, S.lure && S.lure.style === 'skirt' ? 0 : 0);
    if (S.sinker) { const F = A.float, d = Math.hypot(T[0] - L.x, T[1] - L.y, T[2] - L.z) || 1;   // a split shot just above the bait, or the sinker a hand up the line
      const q = F ? [L.x + (F.x - L.x) * 0.3, L.y + (F.y - L.y) * 0.3, L.z + (F.z - L.z) * 0.3] : [L.x + (T[0] - L.x) / d * 0.12, L.y + (T[1] - L.y) / d * 0.12, L.z + (T[2] - L.z) / d * 0.12];
      one(this.tackleGpu(`sinker:${S.sinker.id}:${rv}`, () => sinkerMesh(S.sinker)), q[0], q[1], q[2], s, 0, wl, mk, 0); }
    if (A.float) { const F = A.float, fs = A.phase === 'fight' ? 0.4 : F.spd || 0;   // towed along, it leans back and turns to face the pull
      one(this.tackleGpu(`float:${S.float.id}:${rv}`, () => floatMesh(S.float)), F.x, F.y, F.z, sc(F.x, F.y, F.z, 4.5), F.rot || 0, wl, mk, -clamp(fs * 1.2, 0, 0.45)); }
  },
  // the fishing line: rod tip → (float) → lure, sagging when slack; dimmer under water
  drawLine(c) {
    const A = this.ang; if (!A || !A.out || !A.S || this.showMap || A.phase === 'card') return;
    const T = A.tip, L = A.lure, col = A.S.line.colors.line, rgb = hexRGB(col).map(v => v * 255 | 0);
    const seg = (a, b, sag, alpha, w) => {
      const pa = this.project(...a), pb = this.project(...b); if (!pa || !pb) return;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 - sag], pm = this.project(...m);
      c.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`; c.lineWidth = w; c.beginPath(); c.moveTo(pa[0], pa[1]);
      if (pm && sag > 0.01) c.quadraticCurveTo(2 * pm[0] - (pa[0] + pb[0]) / 2, 2 * pm[1] - (pa[1] + pb[1]) / 2, pb[0], pb[1]); else c.lineTo(pb[0], pb[1]); c.stroke();
    };
    const w = A.S.line.material === 'braid' ? 1.5 : 1.1, P = this.P, E = this.thirdP && this.camE ? this.camE : [P.x, P.y, P.z + EYE];
    const px = (x, y, z) => clamp(w * 0.9 / Math.max(0.3, Math.hypot(x - E[0], y - E[1], z - E[2])), 0.5, w);   // thinner with distance
    c.save(); c.lineCap = 'butt'; c.lineJoin = 'round';
    const R = A.rope; if (!R) { c.restore(); return; }
    // the simulated line as one smooth curve (midpoint to midpoint through each point): a faint dark edge, then the line itself
    const n = R.p.length / 3, Q = [], wet = [];
    for (let k = 0; k < n; k++) { Q.push(this.project(R.p[k * 3], R.p[k * 3 + 1], R.p[k * 3 + 2])); wet.push(R.p[k * 3 + 2] < R.wl[k] - 0.01); }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // aboard: the same curve in short straight bits, leaving out those the hull hides
    const bt = this.boat, be = bt && this.boatLocal(bt, ...E);
    const bez = (k, u) => { const a = Math.max(k - 1, 0) * 3, q = k * 3, b = Math.min(k + 1, n - 1) * 3, w0 = (1 - u) * (1 - u) / 2, w2 = u * u / 2, w1 = 1 - w0 - w2; return [0, 1, 2].map(i => R.p[a + i] * w0 + R.p[q + i] * w1 + R.p[b + i] * w2); };
    const bits = bt && Q.map((_, k) => { const out = []; let a = this.project(...bez(k, 0));
      for (let i = 1; i <= 4; i++) { const b = this.project(...bez(k, i / 4)); if (a && b && !this.boatHides(bt, be, ...bez(k, (i - 0.5) / 4))) out.push(a, b); a = b; } return out; });
    for (const pass of [0, 1]) for (let k = 0; k < n; k++) {   // piece k: from halfway to the previous point, bending through point k, to halfway to the next
      const q = Q[k], qa = k > 0 ? Q[k - 1] : q, qb = k < n - 1 ? Q[k + 1] : q; if (!q || !qa || !qb) continue;
      const from = mid(qa, q), to = mid(q, qb), under = wet[k], lw = under ? 0.5 : px(R.p[k * 3], R.p[k * 3 + 1], R.p[k * 3 + 2]);
      c.strokeStyle = pass ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${under ? 0.025 : 0.7})` : `rgba(0,0,0,${under ? 0 : 0.18})`;
      c.lineWidth = pass ? lw : lw + 1.2; c.beginPath();
      if (bits) for (let i = 0; i < bits[k].length; i += 2) { c.moveTo(bits[k][i][0], bits[k][i][1]); c.lineTo(bits[k][i + 1][0], bits[k][i + 1][1]); }
      else { c.moveTo(from[0], from[1]); c.quadraticCurveTo(q[0], q[1], to[0], to[1]); }
      c.stroke();
    }
    if (!L && A.dangle) {   // hanging under the tip: float → sinker → bait, straight because the weight pulls it tight
      const D = A.dangle, T0 = R.p.slice((n - 1) * 3), b = [D.x, D.y, D.z + 0.02];
      if (Math.hypot(b[0] - T0[0], b[1] - T0[1], b[2] - T0[2]) > 0.03) seg(T0, b, 0, 0.55, px(...b));
    }
    if (L && A.float) seg([A.float.x, A.float.y, A.float.z], [L.x, L.y, L.z], 0, 0.025, 0.5);   // barely visible leader from float down to bait
    c.restore();
  },
  drawFishingHud(c, Wd, Ht) {
    const A = this.ang; if (!A || !A.out || !A.S || this.showMap) return;
    this.drawLine(c);
    if (A.phase === 'card') return;
    const S = A.S, k = this.touchUI ? 0.92 : 1;   // the status panel itself is HTML now (fishingStatus in js/hud/status-keys.js)
    if (A.phase === 'bite' && A.took && S.hookKind !== 'circle') { const a = 0.6 + 0.4 * Math.sin(this.time * 20); c.font = `bold ${30 * k}px Georgia, serif`; c.textAlign = 'center'; c.fillStyle = `rgba(255,208,64,${a})`; c.fillText('STRIKE!', Wd / 2, Ht / 2 - 60); c.textAlign = 'left'; }
  },
});
