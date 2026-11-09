'use strict';
// Engine: resize, chunk streaming, the shared background-work budget and update(): the per-frame loop.
Object.assign(Engine, {
  resize() {
    this.pauseRedraw = true;
    const dpr = Math.min(devicePixelRatio || 1, this.touchUI ? CONFIG.maxPixelRatioTouch : CONFIG.maxPixelRatio);
    this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
    this.ov.width = innerWidth * dpr; this.ov.height = innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.miniMemo.key = this.bigMemo.key = '';
  },

  streamChunks(budgetMs, maxRing = VIEW) {
    const gl = this.gl, pcx = Math.floor(this.P.x / CHW), pcy = Math.floor(this.P.y / CHW), t0 = performance.now();
    for (const [k, ch] of this.chunks) if (Math.max(Math.abs(ch.cx - pcx), Math.abs(ch.cy - pcy)) > VIEW + 2) {
      gl.deleteVertexArray(ch.vao); ch.vaos.forEach(v => gl.deleteVertexArray(v));
      ch.bufs.forEach(b => gl.deleteBuffer(b)); this.chunks.delete(k);
    }
    while (performance.now() - t0 < budgetMs) {
      if (!this.job) {
        for (const [i, j] of this.offsets) {
          if (i * i + j * j > maxRing * maxRing) break;
          const cx = pcx + i, cy = pcy + j, key = (cx + 1e6) * 2e6 + (cy + 1e6);
          if (!this.chunks.has(key)) { this.job = { key, gen: this.buildChunkGen(cx, cy) }; break; }
        }
        if (!this.job) return;
      }
      const r = this.job.gen.next();
      if (r.done) { this.chunks.set(this.job.key, r.value); this.job = null; }
    }
  },

  // Background work (terrain chunks, map images) shares ONE budget a frame, sized to what the frame itself costs, so
  // together they never push a frame past ~16 ms at 60 FPS. A nearly empty world gets more so it fills in quickly.
  bgStart() {
    const empty = this.chunks.size < 60, work = this.workMs ?? 8;
    this.bgLeft = empty ? 14 : clamp(1000 / 60 - 1.5 - work, this.touchUI ? 1 : 1.5, this.touchUI ? 5 : 8); this.bgSpent = 0;
  },
  bgTake(cap, floor = 0) { return Math.max(floor, Math.min(cap, this.bgLeft)); },   // floor: always make a little progress
  bgSpend(ms) { this.bgLeft -= ms; this.bgSpent += ms; },
  update(ts) {
    if (this.pauseOpen) { this.last = ts; return; }
    const dt = clamp((ts - (this.last || ts)) / 1000, 0, 0.05); this.last = ts; this.time += dt; this.bgStart();
    this.tod = ((this.tod ?? CONFIG.startHour / 24) + dt / CONFIG.dayLengthSeconds * (this.keys.KeyT ? CONFIG.fastTimeMultiplier : 1)) % 1;
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05; this.msgT -= dt;
    this.stepMouseLook(dt);
    const P = this.P, K = this.keys;
    if (P.a > 64 || P.a < -64) P.a %= 6.283185307179586;   // keep the heading from growing without bound
    if (this.showMap) { // the map open: arrows (and A/D) pan it, about half a screen a second (Shift: faster); W/S zoom
      const sp = 520 * dt * (K.ShiftLeft || K.ShiftRight ? 2.5 : 1), dx = (K.ArrowRight || K.KeyD ? 1 : 0) - (K.ArrowLeft || K.KeyA ? 1 : 0), dy = (K.ArrowDown ? 1 : 0) - (K.ArrowUp ? 1 : 0);
      if (dx || dy) this.mapPan(-dx * sp, -dy * sp);
      if (K.KeyW) this.mapScale = clamp(this.mapScale * Math.exp(-1.6 * dt), 1, 256); if (K.KeyS) this.mapScale = clamp(this.mapScale * Math.exp(1.6 * dt), 1, 256);
    } else {
      if (K.ArrowLeft) P.a -= CONFIG.arrowKeyTurnSpeed * dt; if (K.ArrowRight) P.a += CONFIG.arrowKeyTurnSpeed * dt;
      if (K.ArrowUp || K.PageUp) P.pitch = Math.min(1.4, P.pitch + 1.2 * dt); if (K.ArrowDown || K.PageDown) P.pitch = Math.max(-1.4, P.pitch - 1.2 * dt);
    }
    const [jf, js, jrun] = this.joyInput();
    const f = this.showMap ? 0 : clamp((K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0) + jf, -1, 1), s = this.showMap ? 0 : clamp((K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + js, -1, 1);   // the keys belong to the map while it's open
    // water under you: wading slows you down; past chest depth you float and swim (C dives, Space rises, or swim where you look)
    let oSwim = false, oUnder = false, oWade = 0, oWl = 0;
    if (this.boat) oWl = this.boatMode === 'deck' ? this.boatDeckStep(dt, f, s) : this.boatStep(dt, f, s, K.ShiftLeft || K.ShiftRight || jrun);   // driving a boat, or moving about on it
    else {
    sample(P.x, P.y);
    const iced = ENV.iced(SK, SW - hW(SE), P.x, P.y);   // frozen ponds, lakes and pack ice bear your weight
    const run = K.ShiftLeft || K.ShiftRight || jrun, g0 = iced ? SW : hW(SE), wl0 = SW, floatZ = wl0 - EYE + 0.28;
    const swim = g0 < floatZ - 0.02 && P.z < floatZ + 0.5;
    const under = swim && P.z + EYE < wl0 - 0.05;
    const wade = swim ? 0 : clamp((wl0 - Math.max(P.z, g0)) / 1.4, 0, 1);
    const swimSp = (run ? CONFIG.swimSprint : CONFIG.swimSpeed) * Game.speedMultiplier;
    const diving = swim && f !== 0 && (under || P.pitch < -0.45);
    const fwd = diving ? f * Math.cos(P.pitch) : f;
    const sp = (swim ? swimSp : (run ? CONFIG.runSpeed : CONFIG.walkSpeed) * (1 - 0.55 * wade) * Game.speedMultiplier) * dt;
    const ca = Math.cos(P.a), sa = Math.sin(P.a), mx = (ca * fwd - sa * s) * sp, my = (sa * fwd + ca * s) * sp;
    const feet = swim ? Math.max(P.z, wl0 - 0.5) : P.z;   // swimming: climb out from the surface, so beaches still let you wade ashore
    const blocked = (x, y, d) => groundAt(x, y) - feet > 0.5 + d * 1.7 || Game._solids.some(fn => fn(x, y, P.z)); // no walking up cliffs (over ~60°, beyond a half-metre step); games can add solid areas
    if (!blocked(P.x + mx, P.y, Math.abs(mx))) { if (this.pastEdge(P.x + mx, P.y) && Math.abs(P.x + mx) > Math.abs(P.x)) this.edgeWarn(); else P.x += mx; }   // per axis, so you slide along obstacles (and the world's edge)
    if (!blocked(P.x, P.y + my, Math.abs(my))) { if (this.pastEdge(P.x, P.y + my) && Math.abs(P.y + my) > Math.abs(P.y)) this.edgeWarn(); else P.y += my; }
    const roof = caveRoofAt(P.x, P.y), floor = Math.max(groundAt(P.x, P.y), iced ? wl0 : -1e9, roof && P.z > roof.under - 0.3 ? roof.top : -1e9);   // a cave cenote's roof bears you; its opening doesn't
    if (swim) {
      const up = K.Space, dn = K.KeyC;
      let vt = (up ? CONFIG.diveSpeed : 0) - (dn ? CONFIG.diveSpeed : 0) + (diving ? Math.sin(P.pitch) * f * swimSp : 0);
      if (!up && !dn && !diving) vt = clamp((floatZ - P.z) * 1.4, -1.5, 1);   // buoyancy brings you back up
      if (P.z > floatZ + 0.04 && !up) P.vz -= CONFIG.gravity * dt;          // bobbed above the surface: fall back
      else P.vz += (vt - P.vz) * Math.min(1, dt * 3.5);
      P.z += P.vz * dt;
      if (up && P.z > floatZ + 0.15) { P.z = floatZ + 0.15; P.vz = 0; }       // treading water
    } else {
      if (K.Space && P.z <= floor + 0.05) P.vz = CONFIG.jumpSpeed * (1 - 0.5 * wade);
      P.vz -= CONFIG.gravity * dt; P.z += P.vz * dt;
    }
    if (P.z <= floor) { P.z = floor; if (P.vz < 0) P.vz = 0; }
    oSwim = swim; oUnder = under; oWade = wade; oWl = wl0;
    }
    const swim = oSwim, under = oUnder, wade = oWade, wl0 = oWl, ca = Math.cos(P.a), sa = Math.sin(P.a);
    // water effects: entry splash, wake ripples and spray, bubbles when under
    const moving = !this.boat && Math.abs(f) + Math.abs(s) > 0.1;
    if (swim && !this.swim && P.vz < -3) { this.splash(P.x, P.y, wl0, 45); this.addRipple(P.x, P.y, 1.2); }
    this.swim = swim; this.under = under; this.wade = wade; this.moving = moving;
    this.dtH = dt / CONFIG.dayLengthSeconds * 24 * (this.keys.KeyT ? CONFIG.fastTimeMultiplier : 1); // game hours this frame
    if (!CONFIG.weather && ENV.kind !== 'fair') ENV.setWeather('fair');
    ENV.update(this.dtH, dt);
    this.seasonLife(dt, P);
    if (((swim && !under) || wade > 0.08) && moving) {
      if ((this.rippleT -= dt) <= 0) { this.rippleT = 0.4; this.addRipple(P.x + ca * 0.4, P.y + sa * 0.4, swim ? 0.55 : 0.35); }
      this.emitN(swim ? 10 : 6, dt, () => this.spawn(DROP, P.x + ca * 0.5 + this.rnd(-0.4, 0.4), P.y + sa * 0.5 + this.rnd(-0.4, 0.4), wl0 + 0.02, this.rnd(-0.6, 0.6) + ca, this.rnd(-0.6, 0.6) + sa, this.rnd(1, 2.4), this.rnd(0.3, 0.6), 0.035));
    }
    if (under) this.emitN(moving ? 5 : 1.2, dt, () => this.spawn(BUBBLE, P.x + ca * 0.5 + this.rnd(-0.15, 0.15), P.y + sa * 0.5 + this.rnd(-0.15, 0.15), P.z + EYE - 0.35, this.rnd(-0.2, 0.2), this.rnd(-0.2, 0.2), 0.5, this.rnd(2, 4), this.rnd(0.025, 0.06), { top: wl0 - 0.03 }));
    if (ISL && (this.springT = (this.springT || 0) - dt) <= 0) { // springs well up: rings boil on the surface, bubbles rise from the sand
      this.springT = 0.22;
      for (const sp of ISL.springs) {
        if (Math.abs(sp.x - P.x) > 60 || Math.abs(sp.y - P.y) > 60) continue;
        const a = Math.random() * 6.2832, r = Math.random() * 0.9, x = sp.x + Math.cos(a) * r, y = sp.y + Math.sin(a) * r;
        if (Math.random() < 0.6) this.addRipple(x, y, 0.35 + 0.3 * Math.random());
        sample(x, y); const g = hW(SE), top = SW;
        if (top > g + 0.1) for (let q = 0; q < 3; q++) this.spawn(BUBBLE, x + this.rnd(-0.2, 0.2), y + this.rnd(-0.2, 0.2), g + 0.05, this.rnd(-0.05, 0.05), this.rnd(-0.05, 0.05), 0.35, this.rnd(1.5, 3), this.rnd(0.02, 0.045), { top: top - 0.03 });
      }
    }
    if (this.uw) { // drifting specks give the water body volume
      const mk = WATER[SK].murk;
      this.emitN(26 + 30 * mk, dt, () => { const a = Math.random() * 6.2832, r = this.rnd(0.8, 8); this.spawn(MOTE, P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, P.z + EYE + this.rnd(-3, 3), this.rnd(-0.08, 0.08), this.rnd(-0.08, 0.08), 0, this.rnd(2.5, 5), this.rnd(0.02, 0.045), { top: wl0 - 0.05, col: mk > 0.5 ? [0.55, 0.6, 0.35] : null }); });
    }
    this.torchStep();
    this.updateFish(dt); this.updateIdleBoats(dt); this.angStep(dt);
    this.updateTui();
    // what water is under the crosshair (for the HUD and games)
    if ((this.lookT -= dt) <= 0) { this.lookT = 0.12; const h = this.lookWater(); this.look = h ? Object.assign(waterInfo(h.x, h.y), { x: h.x, y: h.y, dist: h.dist }) : null; }
    // particles
    for (const q of this.parts) {
      q.life -= dt;
      const g = q.g !== undefined ? q.g : PGRAV[q.k], dr = Math.max(0, 1 - (q.drag !== undefined ? q.drag : PDRAG[q.k]) * dt);
      q.vz += g * dt; q.vx *= dr; q.vy *= dr; q.vz *= dr; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.top !== undefined && q.z > q.top) q.life = 0; // bubbles pop at the surface
      if (q.floor !== undefined) { // leaves flutter down and settle on the ground or the water
        if (q.g !== 0) { q.vx += Math.sin(this.time * 3.1 + q.seed) * dt * 2; q.vy += Math.cos(this.time * 2.3 + q.seed * 1.7) * dt * 2; }
        if (q.z < q.floor) { q.z = q.floor; q.vx = q.vy = q.vz = 0; q.g = 0; }
      }
    }
    { const ps = this.parts; let n = 0; for (let i = 0; i < ps.length; i++) if (ps[i].life > 0) ps[n++] = ps[i]; ps.length = n; }   // drop dead particles in place (no new array each frame)
    this.tgt = this.collectTarget();   // the pickup you'd take, worked out once per frame
    Game.emit('update', dt);
    { // terrain streaming takes its share of the frame's background budget, leaving some for a map image that's being drawn
      const mapWaiting = !!this.mapJob, t0 = performance.now();
      this.streamChunks(this.bgTake(this.bgLeft * (mapWaiting ? 0.55 : 1), 0.5)); this.bgSpend(performance.now() - t0); }
    if (this.mapPrefetch && this.mapPrefetch.length && !this.mapJobDrawn) { this.mapWork(this.mapPrefetch, this.bgTake(4, 0)); this.mapPrefetch = this.mapPrefetch.filter(([l, x, y]) => !this.mapTiles.has(`${l}:${x}:${y}`)); }   // the island's coarse map, in spare time
    this.mapJobDrawn = false;
  },
});
