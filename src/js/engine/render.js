'use strict';
// Engine: render(): one frame of the 3D scene.
Object.assign(Engine, {
  render(camera = null, size = 0) {
    if (this.pauseOpen && !this.pauseRedraw) return;
    this.pauseRedraw = false;
    if (!camera && this.updateLureView) this.updateLureView();
    // The full-screen map covers the scene. Keep its UI live without drawing
    // the entire terrain, wildlife and water underneath it.
    if (!camera && this.showMap) { this.drawOverlay(); return; }
    const viewKey = camera ? 'lure:' : '';
    const gl = this.gl, P = camera || this.P, W = size || this.canvas.width, Hh = size || this.canvas.height;
    gl.viewport(0, 0, W, Hh);
    // camera basis; right = (-sin a, cos a) keeps the 3D view consistent with the north-up map (y down)
    const cp = Math.cos(P.pitch), F = [Math.cos(P.a) * cp, Math.sin(P.a) * cp, Math.sin(P.pitch)];
    const R = [-Math.sin(P.a), Math.cos(P.a), 0];
    const U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
    const E = [P.x, P.y, P.z + EYE], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const tx = Math.tan(FOV / 2), ty = tx * Hh / W, near = camera ? 0.005 : 0.1; this.tanX = tx; this.tanY = ty;
    const view = new Float32Array([R[0], U[0], -F[0], 0, R[1], U[1], -F[1], 0, R[2], U[2], -F[2], 0, -dot(R, E), -dot(U, E), dot(F, E), 1]);
    const proj = new Float32Array([1 / tx, 0, 0, 0, 0, 1 / ty, 0, 0, 0, 0, (FAR + near) / (near - FAR), -1, 0, 0, 2 * FAR * near / (near - FAR), 0]);
    const vp = this.vp = mul4(proj, view);

    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    const S = this.sky_ = this.skyState(), SUN = S.key;
    // is the camera underwater? then the world fades into the water's own colour instead of the sky
    sample(E[0], E[1]);
    const camWl = SW, uw = this.uw = E[2] < camWl - 0.03 && hW(SE) < camWl, wk = WATER[SK];
    let HORZ = S.hor, FOGD = FAR * (1 - 0.88 * ENV.fog) * (1 - 0.4 * ENV.rain);
    if (uw) {
      const mk = wk.murk, dk = Math.exp(-(camWl - E[2]) * 0.05), lit = [0, 1, 2].map(i => S.amb[i] * 1.25 + S.lcol[i] * 0.75);
      const sw = SK === OCEAN && CLIMATE.reefsEverywhere ? 1 : 0;   // tropical sea water is a clear blue
      const base = [0.04 + 0.07 * mk - 0.02 * sw, 0.25 - 0.08 * mk + 0.02 * sw, 0.3 - 0.23 * mk + 0.14 * sw];
      HORZ = base.map((b, i) => b * lit[i] * dk + [0.006, 0.016, 0.02][i] * S.night); // a little moonlight so night dives aren't pitch black
      FOGD = wk.vis * (0.55 + 0.45 * S.day) * (SK >= RIVER ? 1 - 0.65 * ENV.turb : 1) * (ENV.iced(SK, camWl - hW(SE), E[0], E[1]) ? 0.6 : 1);
      gl.clearColor(HORZ[0], HORZ[1], HORZ[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    } else { // sky
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      const sk = this.sky; gl.useProgram(sk.p);
      gl.uniform3fv(sk.u.R, R); gl.uniform3fv(sk.u.U, U); gl.uniform3fv(sk.u.F, F); gl.uniform2f(sk.u.tn, tx, ty);
      gl.uniform3fv(sk.u.sun, S.sun); gl.uniform3fv(sk.u.zen, S.zen); gl.uniform3fv(sk.u.hor, S.hor); gl.uniform3fv(sk.u.sunc, S.sunc);
      gl.uniform1f(sk.u.night, S.night); gl.uniform1f(sk.u.sset, S.sset); gl.uniform1f(sk.u.t, this.time);
      gl.uniform1f(sk.u.stars, CONFIG.stars ? 1 : 0); gl.uniform1f(sk.u.clouds, CONFIG.clouds ? 1 : 0);
      gl.uniform4f(sk.u.wsky, ENV.cloud, ENV.flash, ENV.wind, ENV.fog);
      gl.bindVertexArray(this.fsVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    this.fogColor = HORZ;

    // terrain, bridges, trees
    const L = this.lit; gl.useProgram(L.p);
    gl.uniformMatrix4fv(L.u.vp, false, vp); gl.uniform3fv(L.u.cam, E); gl.uniform3fv(L.u.sun, SUN); gl.uniform3fv(L.u.fogc, HORZ); gl.uniform1f(L.u.far, FOGD); gl.uniform1f(L.u.uwf, uw ? 1 : 0);
    gl.uniform3fv(L.u.lcol, S.lcol); gl.uniform3fv(L.u.amb, S.amb); gl.uniform1f(L.u.night, S.night); gl.uniform1f(L.u.emk, 1);
    gl.uniform1f(L.u.lureCam, camera ? 1 : 0);
    gl.uniform1f(L.u.time, this.time); gl.uniform1f(L.u.sway, 0); gl.uniform1f(L.u.wig, 0); gl.uniform1f(L.u.fsh, 0);
    gl.uniform1f(L.u.inst, 0); gl.uniform1f(L.u.pscale, 1); gl.uniform1f(L.u.dry, 0);
    gl.uniform4f(L.u.seasA, ENV.leaf, ENV.autumn, ENV.young, ENV.dormant); gl.uniform4f(L.u.seasB, ENV.snowCover, ENV.wet, ENV.flash * 0.8, 0);
    { // 8 nearest fire lights, flickering
      const T = this.time, ls = [];
      for (const l of this.lights) ls.push([l.x, l.y, l.z, l.intensity * (l.flicker ? 0.85 + 0.1 * Math.sin(T * 17 + l.x) + 0.05 * Math.sin(T * 31 + l.y) : 1)]);
      if (S.night > 0.05) { // street lamps and a lantern you carry light the night
        if (CONFIG.lanternAtNight) ls.push([E[0], E[1], E[2] + 0.4, 1.1 * S.night]);
      }
      if (ls.length > 8) ls.sort((a, b) => ((a[0] - E[0]) ** 2 + (a[1] - E[1]) ** 2) - ((b[0] - E[0]) ** 2 + (b[1] - E[1]) ** 2));
      const fl = this.lightUni || (this.lightUni = new Float32Array(32)); fl.fill(0); for (let i = 0; i < Math.min(8, ls.length); i++) fl.set(ls[i], i * 4); gl.uniform1i(L.u.nfl, Math.min(8, ls.length));
      gl.uniform4fv(L.u['fl[0]'], fl);
    }
    gl.enable(gl.CULL_FACE); gl.cullFace(CULL_SIDE);   // terrain: only its upper side is ever seen
    const fx = Math.cos(P.a), fy = Math.sin(P.a), visible = this._visible || (this._visible = []); visible.length = 0;
    for (const ch of this.chunks.values()) {
      const rx = (ch.cx + 0.5) * CHW - P.x, ry = (ch.cy + 0.5) * CHW - P.y, d = Math.hypot(rx, ry);
      if (ch.ground && d > 600 && !camera) ch.ground = null;   // ground cover is only kept near the player
      if (d > (camera ? CHW * 1.5 : FAR + CHW) || (d > CHW && (rx * fx + ry * fy) / d < Math.cos(FOV / 2 + 0.35) - 0.3)) continue; // rough frustum cull
      visible.push(ch, d);
      gl.bindVertexArray(ch.vao); gl.drawElements(gl.TRIANGLES, ch.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(L.u.inst, 1);
    gl.uniform1f(L.u.sway, CONFIG.windSway * (0.45 + 1.4 * ENV.wind));
    // trees: every visible chunk's instances merged into one draw per kind and detail level (closed meshes, so back faces are culled)
    gl.enable(gl.CULL_FACE); gl.cullFace(CULL_SIDE);
    const TB = this.treeKinds.map((K, ki) => [this.batch(viewKey + 'tree' + ki, { vbo: K.hi, n: K.hiN }, 24), this.batch(viewKey + 'treeL' + ki, { vbo: K.lo, n: K.loN }, 24)]);
    // refill the batches only when the set of chunks (or their detail level) changed since last frame
    let sig = 17;
    for (let i = 0; i < visible.length; i += 2) if (visible[i + 1] < TREE_VIEW * CHW) { const ch = visible[i]; sig = Math.imul(sig ^ (ch.cx * 73856093 ^ ch.cy * 19349663 ^ (visible[i + 1] < CONFIG.treeDetailDistance ? 1 : 2)), 16777619); }
    const signatures = this.treeSignatures || (this.treeSignatures = {});
    if (sig !== signatures[viewKey]) {
      signatures[viewKey] = sig;
      for (let i = 0; i < visible.length; i += 2) if (visible[i + 1] < TREE_VIEW * CHW) {
        const lod = visible[i + 1] < CONFIG.treeDetailDistance ? 0 : 1, td = visible[i].treeData;
        for (let ki = 0; ki < TB.length; ki++) if (td[ki]) this.bAppend(TB[ki][lod], td[ki]);
      }
      for (const pair of TB) { pair[0].last = pair[1].last = 0; this.bDraw(pair[0]); this.bDraw(pair[1]); }
    } else for (const pair of TB) { this.bRedraw(pair[0]); this.bRedraw(pair[1]); }
    gl.disable(gl.CULL_FACE);
    // reeds, lily pads, weed beds, boulders: one draw per kind
    const flowering = sstep(0.22, 0.28, ENV.yf) * (1 - sstep(0.5, 0.56, ENV.yf));
    const pscale = { lily: ENV.growth, lilyF: ENV.growth * flowering, weed: 0.35 + 0.65 * ENV.growth,
      grass: (0.5 + 0.5 * ENV.growth) * (1 - 0.5 * ENV.snowCover), flowerA: ENV.growth * (1 - ENV.snowCover), flowerB: ENV.growth * (1 - ENV.snowCover), fern: (0.45 + 0.55 * ENV.growth) * (1 - 0.4 * ENV.snowCover) };   // meadows grow in spring, sink under snow
    const DRY = { reed: 0.85, grass: 0.85, flowerA: 0.85, flowerB: 0.85, fern: 0.7, bush: 0.3, heath: 0.25 };   // straw-brown when dormant
    // land cover: made for chunks near the player (two a frame at most), then every 16 m tile within reach and roughly in view
    const GT = this._gTiles || (this._gTiles = []), TN = CHW / GROUND_TILE; GT.length = 0;
    if (!camera && CONFIG.groundCover) { const g0 = performance.now(); let made = 0;
      for (let i = 0; i < visible.length; i += 2) { const ch = visible[i]; if (visible[i + 1] > 161 + CHW * 0.71) continue;
        if ((!ch.ground || ch.groundLv !== CONFIG.groundCover) && (!made || performance.now() - g0 < 0.7)) { made++; ch.ground = this.groundGen(ch); }
        if (!ch.ground) continue;
        for (let t = 0; t < TN * TN; t++) { const rx = ch.cx * CHW + (t % TN + 0.5) * GROUND_TILE - E[0], ry = ch.cy * CHW + ((t / TN | 0) + 0.5) * GROUND_TILE - E[1], d = Math.hypot(rx, ry);
          if (d < 161 && (d < 24 || (rx * fx + ry * fy) / d > Math.cos(Math.min(3.1, FOV / 2 + 0.15 + 12 / d)))) GT.push(ch, t, d); } }
      if (made) this.bgSpend(performance.now() - g0); }   // generating counts as background work, like chunk building
    const span = this._gSpan || (this._gSpan = []);
    for (const [name, istride, sway, maxD] of PLANT_DRAW) {
      const ps = pscale[name] ?? 1; if (ps < 0.03) continue;   // lilies are gone in winter, flowers only bloom in summer
      gl.uniform1f(L.u.pscale, ps); gl.uniform1f(L.u.dry, (DRY[name] || 0) * ENV.dormant);
      const b = this.batch(viewKey + 'plant_' + name, this.plantKinds[name], istride);
      if (GROUND_SET.has(name)) { // per tile: all of it near, thinned to 3/4 then 1/2 toward the edge of its range
        if (camera) continue; let sg = 17; span.length = 0;
        for (let i = 0; i < GT.length; i += 3) { const ch = GT[i], g = ch.ground[name], t = GT[i + 1], dt = GT[i + 2]; if (!g || dt > maxD + 11) continue;
          const n = g.o[t + 1] - g.o[t]; if (!n) continue; const q = dt < maxD * 0.4 ? 4 : Math.max(2, Math.ceil(4 - 4 * (dt - maxD * 0.4) / maxD));
          sg = Math.imul(sg ^ (ch.cx * 73856093 ^ ch.cy * 19349663 ^ (t * 4 + q) * 83492791 ^ ch.groundLv), 16777619); span.push(g.d, g.o[t] * 6, (g.o[t] + Math.ceil(n * q / 4)) * 6); }
        gl.uniform1f(L.u.sway, sway * CONFIG.windSway);
        if (sg !== b.sig) { b.sig = sg; b.last = 0; for (let i = 0; i < span.length; i += 3) this.bAppend(b, span[i].subarray(span[i + 1], span[i + 2])); this.bDraw(b); }
        else this.bRedraw(b);
        continue;
      }
      let sg = 17; for (let i = 0; i < visible.length; i += 2) { const ch = visible[i]; if (ch.plantData[name] && visible[i + 1] < maxD + CHW * 0.7) sg = Math.imul(sg ^ (ch.cx * 73856093 ^ ch.cy * 19349663), 16777619); }
      gl.uniform1f(L.u.sway, sway * CONFIG.windSway + (sway > 2 ? 1 : 0));
      if (sg !== b.sig) { b.sig = sg; b.last = 0; for (let i = 0; i < visible.length; i += 2) { const d = visible[i].plantData[name]; if (d && visible[i + 1] < maxD + CHW * 0.7) this.bAppend(b, d); } this.bDraw(b); }
      else this.bRedraw(b);
    }
    gl.uniform1f(L.u.sway, 0); gl.uniform1f(L.u.pscale, 1); gl.uniform1f(L.u.dry, 0);
    // fish (instanced per species; the body wave is done in the vertex shader)
    if (this.fish.length) {
      const per = this._fishArr || (this._fishArr = []), act = this._fishAct || (this._fishAct = []); while (per.length < FishDB.list.length * 2) per.push([]);
      for (const si of act) per[si].length = 0; act.length = 0;   // touch only the species that had fish in view
      const pxK = Hh * 0.5 / ty, inView = f => { // in front of the camera, inside the view (with a margin), and more than a pixel long
        const dx = f.x - E[0], dy = f.y - E[1], dz = f.z - E[2], z = dx * F[0] + dy * F[1] + dz * F[2], r = f.len * 0.6 + 0.3;
        if (z < -r) return false; if (Math.abs(dx * R[0] + dy * R[1]) > z * tx + r * 1.5) return false; if (Math.abs(dx * U[0] + dy * U[1] + dz * U[2]) > z * ty + r * 1.5) return false;
        return z < 2 || f.len / z * pxK > 0.6; };
      for (const f of this.fish) if (!f.dead && Math.abs(f.x - E[0]) < (uw ? Math.min(75, FOGD * 1.7 + f.len) : 75) && Math.abs(f.y - E[1]) < (uw ? Math.min(75, FOGD * 1.7 + f.len) : 75) && inView(f)) {
        const distance = Math.hypot(f.x - E[0], f.y - E[1], f.z - E[2]);
        const low = !camera && !f.hooked && f.state !== 'lure' && f.len * pxK / Math.max(0.1, distance) < 18;
        const key = f.sp * 2 + (low ? 1 : 0);
        (per[key].length ? per[key] : (act.push(key), per[key])).push(f.x, f.y, f.z, f.len, f.a, f.tint, f.land ? -1e4 : f.wl, WATER[f.kd].murk, f.ph + 8 * Math.round(clamp(f.open || 0, 0, 1) * 12), f.pitch || 0);
      }
      for (const key of act) { const si = key >> 1, arr = per[key], m = this.fishGpu(si, !!(key & 1)), D = FishDB.list[si]; gl.uniform1f(L.u.fsh, 1); gl.uniform1f(L.u.wig, D.body.flex * (D._wave ?? 1)); gl.uniform1f(L.u.swm, D._swim || 0); gl.uniform3fv(L.u.jawP, D._jaw); this.upInst(m, arr); gl.bindVertexArray(m.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, arr.length / 10); }
      gl.uniform1f(L.u.wig, 0); gl.uniform1f(L.u.fsh, 0);
    }
    if (this.boats.length) { // boats: one draw each (they pitch and heel on their own)
      gl.uniform1f(L.u.fsh, 1); gl.uniform1f(L.u.wig, 0); gl.uniform1f(L.u.swm, 0); gl.uniform3fv(L.u.jawP, [0, 0, 0]);
      for (const b of this.boats) {
        if (Math.abs(b.x - E[0]) > 900 || Math.abs(b.y - E[1]) > 900) continue;
        const i = BoatDB.list.indexOf(b.def); let g = BoatDB.gpu[i];
        if (!g || g.stale) { if (g) { gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.ib); gl.deleteBuffer(g.vb); } const ib = gl.createBuffer(), vb = this.vbo(b.def._mesh); g = BoatDB.gpu[i] = { vao: this.litVao(vb, VB, ib, 40), ib, vb, n: b.def._mesh.length / VS }; }
        gl.uniform1f(L.u.roll, b.roll || 0);
        this.upInst(g, [b.x, b.y, b.z, 1, b.a, 0.5, b.wl, WATER[b.kd || 0].murk, 0, b.pitch || 0]); gl.bindVertexArray(g.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, g.n, 1);
      }
      gl.uniform1f(L.u.roll, 0); gl.uniform1f(L.u.fsh, 0);
    }
    if (globalThis.Birds) Birds.draw(this, gl, L, E);   // birds: in the air, on the water, on perches and boats
    if (this.ang && this.ang.out) { this.drawTackle(gl, L, E, !!camera); gl.uniform1f(L.u.fsh, 0); }   // the rod in your hands, the lure, the float
    // props (static decorations) and pickups, instanced per mesh; the pickup you'd collect pulses
    const drawInst = (m, arr) => { if (!arr.length) return; this.upInst(m, arr); gl.bindVertexArray(m.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, arr.length / 6); };
    { // props are static: their instance buffers are rebuilt only when the set changes or you've moved a good way
      const pk = this.props.length + ':' + Math.round(P.x / 150) + ':' + Math.round(P.y / 150), PK = this.propKeys || (this.propKeys = {}), PU = this.propUsed || (this.propUsed = {});
      if (PK[viewKey] !== pk) {
        PK[viewKey] = pk; const used = new Set();
        for (const pr of this.props) if (Math.abs(pr.x - P.x) < FAR + 150 && Math.abs(pr.y - P.y) < FAR + 150) { const m = this.propMesh(pr.mesh); if (!m) continue; const b = this.batch(viewKey + 'prop:' + pr.mesh, m, 24); used.add(b); this.bAppend(b, [pr.x, pr.y, pr.z, pr.scale, pr.rot, 0.5]); }
        for (const b of PU[viewKey] || []) if (!used.has(b)) b.last = 0;
        PU[viewKey] = [...used]; for (const b of used) this.bDraw(b);
      } else for (const b of PU[viewKey] || []) this.bRedraw(b);
    }
    const groups = new Map(), add = (m, ...v) => { let a = groups.get(m); if (!a) groups.set(m, a = []); a.push(...v); };
    const tgt = this.tgt;
    for (const q of this.pickups) if (!q.taken && Math.abs(q.x - P.x) < 300 && Math.abs(q.y - P.y) < 300) {
      const it = ITEMS[q.item], bob = q.float ? 0.15 + 0.12 * Math.sin(this.time * 2 + q.phase) : 0, rot = q.spin ? q.rot + this.time * 0.8 : q.rot;
      add(this.itemMesh(q.item), q.x, q.y, q.z + bob, q.scale * (it.worldScale || 1), rot, q === tgt ? 0.5 + 0.25 * (1 + Math.sin(this.time * 8)) : 0.5);
    }
    for (const [m, arr] of groups) drawInst(m, arr);
    // water surfaces (blended, no depth write), with the 8 nearest live ripples
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    this.drawParticles(vp, Hh, ty, E, 0);   // particles beyond the surface (droplets under it, seen from above) go before it
    const Wt = this.water; gl.useProgram(Wt.p);
    gl.uniformMatrix4fv(Wt.u.vp, false, vp); gl.uniform1f(Wt.u.far, FOGD); gl.uniform1f(Wt.u.uwf, uw ? 1 : 0);
    gl.uniform3fv(Wt.u.cam, E); gl.uniform3fv(Wt.u.sun, S.sun[2] > -0.05 ? S.sun : SUN); gl.uniform3fv(Wt.u.fogc, HORZ); gl.uniform1f(Wt.u.t, this.time);
    gl.uniform3fv(Wt.u.lcol, S.lcol); gl.uniform3fv(Wt.u.amb, S.amb); gl.uniform3fv(Wt.u.zen, S.zen); gl.uniform3fv(Wt.u.hor, S.hor);
    gl.uniform1f(Wt.u.wnd, ENV.wind); gl.uniform4f(Wt.u.wx, ENV.snowing ? 0 : ENV.rain, ENV.wind, ENV.turb, ENV.flash * 0.8);
    gl.uniform4f(Wt.u.ice, ENV.iceLake, ENV.icePond, ENV.snowCover, ENV.iceSea);
    { const rp = this.ripUni || (this.ripUni = new Float32Array(32)), T = this.time, R = this.ripples;   // the 8 nearest live ripples, no per-frame arrays
      let n = 0; for (let i = 0; i < R.length; i++) if (T - R[i].t < 5) R[n++] = R[i]; R.length = n;   // drop the faded ones in place
      for (const r of R) r.d2 = (r.x - E[0]) ** 2 + (r.y - E[1]) ** 2;
      if (R.length > 8) R.sort((a, b) => a.d2 - b.d2);
      rp.fill(0); for (let i = 0; i < Math.min(8, R.length); i++) { const r = R[i]; rp[i * 4] = r.x; rp[i * 4 + 1] = r.y; rp[i * 4 + 2] = r.t; rp[i * 4 + 3] = r.s; }
      gl.uniform4fv(Wt.u['rip[0]'], rp); }
    for (let i = 0; i < visible.length; i += 2) { const w = visible[i].water; if (w) { gl.bindVertexArray(w.vao); gl.drawElements(gl.TRIANGLES, w.count, gl.UNSIGNED_SHORT, 0); } }
    this.drawParticles(vp, Hh, ty, E, 1);   // particles on the camera's side of the water surface go on top of it
    if (!uw && ENV.rain > 0.03) { // rain or snow falling around you
      const Pp = this.precip, sn = ENV.snowing, box = sn ? 30 : 34, wa = ENV.windDir ?? 0.8, wv = ENV.wind * (sn ? 3 : 6);
      gl.useProgram(Pp.p); gl.uniformMatrix4fv(Pp.u.vp, false, vp); gl.uniform3fv(Pp.u.cam, E); gl.uniform1f(Pp.u.t, this.time % 1000);
      gl.uniform1f(Pp.u.fall, sn ? 1.3 : 9); gl.uniform1f(Pp.u.box, box); gl.uniform1f(Pp.u.snow, sn); gl.uniform2f(Pp.u.wind, Math.cos(wa) * wv, Math.sin(wa) * wv);
      const lit = 0.35 + 0.65 * S.day + ENV.flash;
      gl.uniform4f(Pp.u.pc, (sn ? 0.95 : 0.72) * lit, (sn ? 0.96 : 0.76) * lit, (sn ? 1 : 0.82) * lit, sn ? 0.9 : 0.32);
      gl.bindVertexArray(this.precipVao);
      const cnt = Math.floor(this.precipN * Math.min(1, ENV.rain * 1.2));
      if (sn) gl.drawArrays(gl.POINTS, 0, cnt); else gl.drawArrays(gl.LINES, 0, cnt * 2);
    }
    if (uw && CONFIG.underwaterRays && S.day > 0.05) { // light shafts through the water
      const Rp = this.rays; gl.useProgram(Rp.p); gl.disable(gl.DEPTH_TEST); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform3fv(Rp.u.R, R); gl.uniform3fv(Rp.u.U, U); gl.uniform3fv(Rp.u.F, F); gl.uniform2f(Rp.u.tn, tx, ty);
      gl.uniform3fv(Rp.u.sun, S.sun); gl.uniform1f(Rp.u.t, this.time);
      const k = S.day * (1 - wk.murk * 0.7) * Math.exp(-(camWl - E[2]) * 0.08);
      gl.uniform3fv(Rp.u.col, [0.55, 0.8, 0.85].map(c => c * 0.5)); gl.uniform1f(Rp.u.k, k);
      gl.bindVertexArray(this.fsVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.enable(gl.DEPTH_TEST);
    }
    gl.depthMask(true); gl.bindVertexArray(null);

    if (!camera) this.drawOverlay();
  },

});
