'use strict';
// Engine: boats on the water: swell, spawning and mooring, boarding and leaving, driving, touch buttons.
Object.assign(Engine, {
  // ---- boats ----
  // the swell the water surface shows (same formula as the water vertex shader)
  swellAt(x, y, kd) { const amp = WATER[kd].wave * (0.6 + 0.8 * ENV.wind), t = this.time; return amp * (0.07 * Math.sin(x * 0.23 + t * 1.1) + 0.05 * Math.sin(y * 0.31 - t * 1.37 + x * 0.07)) - 0.02; },
  // depth for a boat's hull at a point (negative = dry land), or -1 if it's frozen over
  boatDepth(x, y) { sample(x, y); const dep = SW - hW(SE); return ENV.iced(SK, dep, x, y) ? -1 : dep; },
  spawnBoat(id) {
    const D = BoatDB.byId[id]; if (!D) return null;
    const P = this.P, ca = Math.cos(P.a), sa = Math.sin(P.a), L = D.hull.length_m, need = D.hull.draft_m + 0.15;
    for (let d = 2 + L * 0.6; d < 60; d += 0.5) {
      const x = P.x + ca * d, y = P.y + sa * d; let ok = true;
      for (const u of [-0.5, 0, 0.5]) { const dd = this.boatDepth(x + ca * u * L, y + sa * u * L); if (dd < need) ok = false; }
      if (!ok) continue;
      sample(x, y); const b = { def: D, id: 'boat#' + (this.boatN = (this.boatN || 0) + 1), x, y, a: P.a /* bow pointing out over the water */, v: 0, kd: SK, wl: SW, z: SW, pitch: 0, roll: 0, yaw: 0 };
      this.boats.push(b); while (this.boats.length > 8) { const i = this.boats.findIndex(q => q !== this.boat); this.boats.splice(i, 1); }
      this.say(`${D.name} — walk or swim up to it and press ${this.touchUI ? 'Use' : 'F'} to get in`, 4); Game.emit('boatSpawn', b); return b;
    }
    this.say(`No water ahead deep enough for a ${D.name.toLowerCase()} — face the water`, 3); return null;
  },
  // ---- a boat waits at every water you come to: the kind that suits it, afloat just off the shore near you ----
  BOAT_FOR: { pond: ['canoe', 'rowboat', 'fishing_kayak'], lake: ['bass_boat', 'rowboat', 'canoe'], river: ['jon_boat', 'canoe', 'fishing_kayak'], creek: ['fishing_kayak', 'canoe'], sea: ['center_console', 'lobster_boat', 'touring_kayak'] },
  boatFor(kind) { for (const id of this.BOAT_FOR[kind] || []) if (BoatDB.byId[id]) return BoatDB.byId[id]; return BoatDB.list.find(D => boatWaters(D).includes(kind)) || BoatDB.list[0]; },
  // float a boat beside the shore nearest you (toward the water point w), bow along the shore; null if there's no room
  moorBoat(D, w) {
    const P = this.P, L = D.hull.length_m, need = D.hull.draft_m + 0.2, dx = w.wx - P.x, dy = w.wy - P.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
    for (let d = 1.5; d < 90; d += 0.5) {
      const x = P.x + ux * d + ux * (D.hull.beam_m * 0.6 + 0.6), y = P.y + uy * d + uy * (D.hull.beam_m * 0.6 + 0.6); sample(x, y); if (SK !== w.kd) continue;
      let ok = true; for (const s of [-0.5, 0, 0.5]) if (this.boatDepth(x - uy * s * L, y + ux * s * L) < need) ok = false;   // the whole hull, lying along the shore
      if (!ok) continue;
      sample(x, y); const b = { def: D, id: 'boat#' + (this.boatN = (this.boatN || 0) + 1), x, y, a: Math.atan2(uy, ux) + Math.PI / 2, v: 0, kd: SK, wl: SW, z: SW, pitch: 0, roll: 0, yaw: 0, auto: true };
      this.boats.push(b); while (this.boats.length > 8) { const i = this.boats.findIndex(q => q !== this.boat); this.boats.splice(i, 1); }
      Game.emit('boatSpawn', b); return b;
    }
    return null;
  },
  // every so often: a water within 45 m that hasn't had its boat yet gets one (unless a boat is already about)
  autoBoat() {
    if (this.boat) return; const P = this.P, f = findWater(-1, P.x, P.y, 45); if (!f) return;
    const wi = waterInfo(f.wx, f.wy); if (wi.kindId === CREEK && wi.depth < 0.5) return;
    const B = this.boated || (this.boated = new Set()); if (B.has(wi.id)) return;
    if (this.boats.some(b => Math.hypot(b.x - P.x, b.y - P.y) < 80)) { B.add(wi.id); return; }
    const D = this.boatFor(wi.kind), b = this.moorBoat(D, { wx: f.wx, wy: f.wy, kd: wi.kindId });
    if (b) { B.add(wi.id); this.say(`A ${D.name.toLowerCase()} waits at the shore`, 3); }
  },
  nearBoat() { // a boat you're standing or swimming beside
    const P = this.P; let best = null, bd = 1e9;
    for (const b of this.boats) { const L = b.def.hull.length_m, ca = Math.cos(b.a), sa = Math.sin(b.a), dx = P.x - b.x, dy = P.y - b.y, u = clamp(dx * ca + dy * sa, -L / 2, L / 2);
      const d = Math.hypot(dx - ca * u, dy - sa * u) - b.def.hull.beam_m / 2; if (d < 2.2 && d < bd && Math.abs(P.z + EYE * 0.5 - b.z) < 3) { bd = d; best = b; } }
    return best;
  },
  boardBoat(b) {
    this.boat = b; this.boatMode = 'drive'; this.boatSit = true; this.tuiState = null; this.P.vz = 0;   // the fish radar stays as you left it (key 2): boarding, as travel does, must not switch it on
    const dh = b.a - this.P.a; this.P.a = b.a; this.P.pitch = -0.1; this.seatBoat(b); this.boatKick(b, -1.2, Math.random() < 0.5 ? 0.6 : -0.6);   // stepping in: it dips and wobbles
    this.say(`${b.def.name}: ${this.touchUI ? 'joystick' : 'W/S'} ${['outboard', 'inboard'].includes(b.def.propulsion.type) ? 'throttle' : b.def.propulsion.type === 'oars' ? 'row' : b.def.propulsion.type === 'pedal' ? 'pedal' : 'paddle'}, ${this.touchUI ? 'left/right' : 'A/D'} steer · ${this.touchUI ? 'Jump' : 'Space'} to jump out`, 5);
    Game.emit('boardBoat', b);
  },
  leaveBoat(jump) {
    const b = this.boat; if (!b) return; const P = this.P, D = b.def; this.boat = null; this.boatMode = 'drive'; b.v = 0; b.oarOn = false; this.boatKick(b, jump ? -1.5 : 0.8, jump ? 0.8 : 0.4);
    if (jump) {   // over the side the way you're facing: clear of the hull, then the usual fall (into the water, or onto the bank)
      const ca = Math.cos(P.a), sa = Math.sin(P.a); let d = 0.6; while (d < D.hull.length_m + 1 && this.boatOver(b, P.x + ca * (d - 0.5), P.y + sa * (d - 0.5))) d += 0.2;
      P.x += ca * d; P.y += sa * d; P.vz = CONFIG.jumpSpeed; Game.emit('leaveBoat', b); return;
    }
    // step ashore if there's dry land close by, otherwise slip into the water beside the boat
    let best = null, bd = 1e9;
    for (let r = 1; r <= 7 && !best; r += 0.75) for (let k = 0; k < 16; k++) { const a = k / 16 * 6.2832, x = b.x + Math.cos(a) * (r + D.hull.beam_m / 2), y = b.y + Math.sin(a) * (r + D.hull.beam_m / 2); sample(x, y);
      const g = hW(SE), dep = SW - g; if (dep < 0.4 && g - SW < 1.6) { const d = r; if (d < bd) { bd = d; best = [x, y, Math.max(g, SW - 0.2)]; } } }
    if (best) { P.x = best[0]; P.y = best[1]; P.z = best[2]; this.say('Ashore', 1.5); }
    else { P.x = b.x - Math.sin(b.a) * (D.hull.beam_m / 2 + 0.7); P.y = b.y + Math.cos(b.a) * (D.hull.beam_m / 2 + 0.7); P.z = b.wl - EYE + 0.2; this.splash(P.x, P.y, b.wl, 25); this.say('Into the water', 1.5); }
    P.vz = 0; Game.emit('leaveBoat', b);
  },
  seatBoat(b) { const D = b.def, S = D._shape, t = clamp(D.crew.seat_at, 0, 1), sx = S.x(t), sy = -(D.crew.seat_side || 0) * S.hb(t), P = this.P;
    P.x = b.x + Math.cos(b.a) * sx - Math.sin(b.a) * sy; P.y = b.y + Math.sin(b.a) * sx + Math.cos(b.a) * sy; P.z = b.z + D.hull.floor_m + D.crew.eye_height_m - EYE + Math.sin(b.pitch) * sx; },
  // one frame of driving: throttle / paddle (f) and steering (s); returns the water level under you
  boatStep(dt, f, s, run, seat = true) {
    const b = this.boat, D = b.def, Pr = D.propulsion, Hd = D.handling, H = D.hull, L = H.length_m, motor = ['outboard', 'inboard'].includes(Pr.type);
    sample(b.x, b.y); b.kd = SK; b.wl = SW;
    const rough = WATER[b.kd].wave * (0.6 + 0.8 * ENV.wind), tooRough = rough > Hd.waves_max;
    if (tooRough && performance.now() - (this.roughT || 0) > 6000) { this.roughT = performance.now(); this.say(`Rough water for a ${D.name.toLowerCase()}`, 2); }
    const max = Pr.max_speed_ms * (tooRough ? 0.5 : 1) * (motor && run ? 1 : motor ? 0.6 : run ? 1.2 : 1);   // Shift: full throttle / sprint-paddle
    const troll = motor && seat && this.ang && this.ang.out ? Math.min(max, Math.max(3, Pr.max_speed_ms * 0.3) + (run ? 1.5 : 0)) : max;   // lines out: throttle held to trolling pace
    const target = f >= 0 ? f * troll : f * troll * Pr.reverse;
    b.v += clamp(target - b.v, -Pr.accel_ms2 * 1.5 * dt, Pr.accel_ms2 * dt) - b.v * (motor ? 0.08 : 0.25) * dt * (f === 0 ? 3 : 1) * (seat ? 1 : 2);
    const steerK = motor ? clamp(Math.abs(b.v) / 2, 0.25, 1) * Math.sign(b.v || 1) : 1, dyaw = s * Pr.turn_rate * steerK * dt;
    b.a += dyaw; this.P.a += dyaw;   // the view turns with the boat
    // the current carries it; then move if the hull still floats there (bow and centre)
    const fl = flowAt(b.x, b.y, b.kd), drift = Hd.current_drift * (seat ? 1 : 0.6);
    const nx = b.x + (Math.cos(b.a) * b.v + fl[0] * drift) * dt, ny = b.y + (Math.sin(b.a) * b.v + fl[1] * drift) * dt, dir = Math.sign(b.v || 1);
    let hit = null; const need = H.draft_m + 0.05, bowNow = this.boatDepth(b.x + Math.cos(b.a) * L * 0.48 * dir, b.y + Math.sin(b.a) * L * 0.48 * dir), bowNew = this.boatDepth(nx + Math.cos(b.a) * L * 0.48 * dir, ny + Math.sin(b.a) * L * 0.48 * dir);
    const ok = this.boatDepth(nx, ny) >= need * 0.8 && (bowNew >= need * 0.6 || bowNew > bowNow) && !(hit = this.boatHits(b, nx, ny));   // you can always back off or head for deeper water; boats don't pass through each other
    if (ok && this.pastEdge(nx, ny) && Math.hypot(nx, ny) > Math.hypot(b.x, b.y)) { this.edgeWarn(); b.v *= 0.5; b.v = Math.min(b.v, 0.3); }   // the edge of the sea: no further out
    else if (ok) { b.x = nx; b.y = ny; }
    else if (hit) { hit.x += Math.cos(b.a) * b.v * 0.4 * dt; hit.y += Math.sin(b.a) * b.v * 0.4 * dt; if (Math.abs(b.v) > 1) this.boatKick(b, -0.5, 1); b.v *= -0.3; }   // bumped another boat: nudge it, bounce off
    else { if (Math.abs(b.v) > 1.2 && performance.now() - (this.groundT || 0) > 2500) { this.groundT = performance.now(); this.say('Aground', 1.2); this.addRipple(b.x, b.y, 0.8); } b.v *= -0.15; }
    // ride the swell: height from the middle, pitch and heel from the ends and sides; motorboats lift their bow at speed
    const ca = Math.cos(b.a), sa = Math.sin(b.a), hw = H.beam_m / 2, soft = 1 - 0.6 * clamp(Hd.stability, 0, 1);
    const zb = this.swellAt(b.x + ca * L / 2, b.y + sa * L / 2, b.kd), zs = this.swellAt(b.x - ca * L / 2, b.y - sa * L / 2, b.kd);
    const zl = this.swellAt(b.x - sa * hw, b.y + ca * hw, b.kd), zr = this.swellAt(b.x + sa * hw, b.y - ca * hw, b.kd);
    b.z = SW + (zb + zs + zl + zr) / 4;
    const plane = motor ? sstep(0.25, 0.6, b.v / Pr.max_speed_ms) * (1 - sstep(0.75, 1, b.v / Pr.max_speed_ms) * 0.5) : 0;
    b.sp = (b.sp ?? b.pitch) + (Math.atan2(zb - zs, L) * (0.6 + soft) + 0.07 * plane - (b.sp ?? b.pitch)) * Math.min(1, dt * 4);
    b.sr = (b.sr ?? b.roll) + (Math.atan2(zl - zr, H.beam_m) * soft * 1.4 - dyaw / Math.max(dt, 1e-3) * 0.12 * clamp(b.v / 3, -1, 1) - (b.sr ?? b.roll)) * Math.min(1, dt * 3);
    // oars and paddles: the stroke runs with what you ask of it (each oar on its own, so A/D pulls one and backs the other)
    const O = D._oars, row = seat && O && O.live; b.oarOn = row;
    if (row) { const ph = b.oarPh || (b.oarPh = [0, 0]), rate = 6.2832 * (0.45 + 0.55 * clamp(Math.abs(b.v) / Pr.max_speed_ms, 0, 1));
      for (const i of [0, 1]) { const e = O.kind === 'oars' ? clamp(f - (i ? -1 : 1) * s * 0.6, -1, 1) : f || Math.abs(s) * 0.6; ph[i] += dt * rate * Math.sign(e) * (0.5 + 0.5 * Math.abs(e)); }
      b.oarK = (b.oarK || 0) + ((f || s ? 1 : 0) - (b.oarK || 0)) * Math.min(1, dt * 3); }
    const stroke = row ? (O.kind === 'double' ? -Math.sin(b.oarPh[0]) : O.kind === 'single' ? -sstep(-0.3, 0.3, Math.sin(b.oarPh[0])) : 0) * b.oarK * 0.25 : 0;   // a paddle stroke rolls a light hull toward its side
    this.boatRock(b, dt, seat ? null : this.boatLX, this.boatLY, stroke);
    b.pitch = b.sp + b.rock[1]; b.roll = b.sr + b.rock[0];
    b.z += plane * 0.08 + b.rock[2];
    if (seat) this.seatBoat(b);
    // wake, spray, and the noise that frightens fish
    const sp = Math.abs(b.v);
    if (sp > 0.3 && (this.wakeT = (this.wakeT || 0) - dt) <= 0) { this.wakeT = 0.35; this.addRipple(b.x - ca * L * 0.45, b.y - sa * L * 0.45, clamp(0.25 + sp * 0.12, 0, 1.4)); }
    if (sp > 2.5) this.emitN(sp * 6, dt, () => { const sd = Math.random() < 0.5 ? 1 : -1, bx = b.x + ca * L * 0.38 - sa * sd * hw * 0.8, by = b.y + sa * L * 0.38 + ca * sd * hw * 0.8;
      this.spawn(DROP, bx, by, b.wl + 0.05, -sa * sd * this.rnd(0.5, 1.5) - ca * sp * 0.2, ca * sd * this.rnd(0.5, 1.5) - sa * sp * 0.2, this.rnd(0.8, 1.8), this.rnd(0.4, 0.8), 0.04); });
    if (motor && sp > 0.5) this.emitN(sp * 4, dt, () => this.spawn(MIST, b.x - ca * L * 0.55, b.y - sa * L * 0.55, b.wl + 0.05, -ca * 1.5, -sa * 1.5, 0.3, this.rnd(0.6, 1.2), 0.25));
    // the prop throws water: a fan of spray up and astern and a churn of foam, with the throttle (some even standing still), more with speed
    const thr = motor && seat ? Math.abs(f) * (run ? 1 : 0.7) : 0;
    if (thr > 0.05) { const px = b.x - ca * (L / 2 + 0.15), py = b.y - sa * (L / 2 + 0.15), back = Math.sign(f) * (1.5 + sp * 0.5), big = clamp(Math.log10(D.features.motor ? D.features.motor.hp ?? 25 : 150) / 2.3, 0.4, 1.2);
      this.emitN(thr * big * (30 + 8 * sp), dt, () => { const sd = this.rnd(-1, 1); this.spawn(DROP, px - sa * sd * 0.25, py + ca * sd * 0.25, b.wl + 0.05, -ca * back * this.rnd(0.6, 1.2) - sa * sd * 0.9, -sa * back * this.rnd(0.6, 1.2) + ca * sd * 0.9, this.rnd(1.2, 3.2) * (0.6 + 0.6 * thr) * big, this.rnd(0.4, 0.9), this.rnd(0.03, 0.06)); });
      this.emitN(thr * big * (10 + 2 * sp), dt, () => this.spawn(MIST, px + this.rnd(-0.3, 0.3) - ca * this.rnd(0, 1.5), py + this.rnd(-0.3, 0.3) - sa * this.rnd(0, 1.5), b.wl + 0.04, -ca * back * 0.4, -sa * back * 0.4, 0.05, this.rnd(1.2, 2.2), this.rnd(0.3, 0.55) * big, { g: 0 }));
      if ((this.propT = (this.propT || 0) - dt) <= 0) { this.propT = 0.25; this.addRipple(px, py, 0.3 + 0.5 * thr); } }
    if ((this.boatNoiseT = (this.boatNoiseT || 0) - dt) <= 0) { this.boatNoiseT = 0.3; const n = Pr.noise * (motor ? 0.4 + sp / Pr.max_speed_ms : sp / Math.max(0.5, Pr.max_speed_ms)); if (n > 0.04) this.disturb(b.x, b.y, n * 1.6); }
    b.speed = sp;
    return b.wl;
  },
  // ---- the dive light: a lamp you can switch on once you're a few metres down (or it's dark); it rides just ahead of your eyes ----
  torchDeep() { if (!this.under) return false; sample(this.P.x, this.P.y); const eyeDepth = SW - (this.P.z + EYE); return eyeDepth > 3 || this.tod < 0.24 || this.tod > 0.79 || WATER[SK].murk > 0.5; },
  toggleTorch() {
    if (!this.torchOn && !this.torchDeep()) { this.say(this.under ? 'Bright enough up here' : 'The dive light is for under water', 1.5); return; }
    this.torchOn = !this.torchOn; this.say(this.torchOn ? 'Dive light on' : 'Dive light off', 1.2); this.buzz([25]);
  },
  torchStep() {
    const on = this.torchOn && this.under;
    if (!on) { if (this.torch) { this.torch.intensity = 0; } return; }
    const P = this.P, cp = Math.cos(P.pitch), eye = [P.x, P.y, P.z + EYE], f = [Math.cos(P.a) * cp, Math.sin(P.a) * cp, Math.sin(P.pitch)];
    const l = this.torch || (this.torch = Game.addLight(eye[0], eye[1], eye[2], 0, false));
    l.x = eye[0] + f[0] * 2.4; l.y = eye[1] + f[1] * 2.4; l.z = eye[2] + f[2] * 2.4; l.intensity = 4.5;
  },
  updateTui() { // touch buttons follow what you're doing: Helm/Stand appears in a boat, Dive becomes Sit/Stand on deck, Cast/Reel/Strike while fishing
    if (!this.touchUI) return; const A = this.ang, inH = this.rodInHand(), fp = inH ? A.phase + (A.took ? 't' : '') + (A.bail ? 'b' : '') : A && A.holder ? 'h' : 'x', st = (this.boat ? this.boatMode + (this.boatSit ? 's' : 'u') : '') + fp;
    if (st === this.tuiState) return; this.tuiState = st;
    { const rb = document.getElementById('bRod'), cb = document.getElementById('bCast'), out = inH, ph = out ? A.phase : '';
      if (rb) { rb.querySelector('b').textContent = out ? 'Stow' : 'Rod'; rb.hidden = ph === 'card'; }
      const ub = document.getElementById('bUse'); if (ub) ub.hidden = !!out;   // with the rod out, the big button casts and reels
      if (cb) { cb.hidden = !out || ph === 'card'; cb.textContent = ph === 'water' ? 'Reel' : ph === 'fight' ? 'Reel' : ph === 'bite' ? (A.took ? 'Strike!' : '…') : ph === 'flight' ? 'Stop' : 'Cast'; cb.classList.toggle('lit', ph === 'bite' && !!A.took); cb.classList.toggle('reel', ph === 'water' || ph === 'fight'); }
      for (const id of ['bDrDn', 'bDrUp', 'bBail']) { const b = document.getElementById(id); if (b) b.hidden = !out || ph === 'card'; }
      { const b = document.getElementById('bBail'); if (b) b.classList.toggle('open', !!(out && A.bail)); }
      { const b = document.getElementById('bHold'); if (b) b.hidden = ph !== 'water'; }   // Holder: set the rod down with its line out (fishing/rod-holder.js)
      { const b = document.getElementById('bFast'); if (b) b.hidden = true; } }   // the Reel button pulls down to wind faster instead
    { const tui = document.getElementById('tui'); if (tui) { tui.classList.toggle('rod-out', inH); tui.classList.toggle('aboard', !!this.boat); } }   // fishing: no Jump, and no Dive ashore (CSS)
    const h = document.getElementById('bHelm'), dv = document.querySelector('#tui [data-k="KeyC"]');
    if (h) { h.hidden = !this.boat; h.textContent = this.boatMode === 'deck' ? 'Helm' : (this.boat && !this.boatCanStand(this.boat.def) ? 'Fish' : 'Stand'); }
    if (dv) dv.textContent = this.boat && this.boatMode === 'deck' ? (this.boatSit ? 'Stand' : 'Sit') : 'Dive';
  },
});
