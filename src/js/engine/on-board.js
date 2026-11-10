'use strict';
// Engine: on board but not at the helm: walking the deck, sitting or standing, idle boats drifting.
Object.assign(Engine, {
  // ---- on board but not at the helm: move about the deck, sit or stand (to fish) ----
  boatWalkable(D) { return !D.hull.cockpit; },                                      // kayaks: you stay in the cockpit
  boatCanStand(D) { return D.handling.stability >= 0.5; },                          // a canoe or touring kayak is too tippy to stand in
  boatSpotOK(D, x, y) { // somewhere you can stand: inside the hull, clear of the wheelhouse and the console
    const H = D.hull, S = D._shape, t = x / H.length_m + 0.5; if (t < 0.05 || t > 0.95) return false; if (Math.abs(y) > Math.max(0.05, S.hb(t) - 0.28)) return false;
    const C = D.features.cabin; if (C && t > (C.from ?? 0.45) - 0.02 && t < (C.to ?? 0.8) + 0.02) return false;
    const cs = D.features.console; if (cs && Math.abs(x - S.x(cs.at ?? 0.45)) < 0.42 && Math.abs(y + (cs.side ?? 0) * S.hb(t)) < 0.5) return false;
    return true;
  },
  // height of what you stand on at a spot (boat model: x along, y across)
  boatDeckZ(D, x, y) {
    const H = D.hull, S = D._shape, t = clamp(x / H.length_m + 0.5, 0, 1), F = D.features;
    if (F.casting_decks && (t > 0.68 || t < 0.2)) return S.gun(t) - 0.12;
    const decked = (H.decks && (t > 1 - (H.decks.bow || 0) || t < (H.decks.stern || 0))) || (H.cockpit && (t < H.cockpit[0] || t > H.cockpit[1]));
    return decked ? S.gun(t) + 0.04 : H.floor_m;
  },
  // a world point in the boat's frame: along, across, up, and t (0 the stern .. 1 the bow)
  boatLocal(b, x, y, z = 0, o = []) { const dx = x - b.x, dy = y - b.y, ca = Math.cos(b.a), sa = Math.sin(b.a), lx = ca * dx + sa * dy, ly = ca * dy - sa * dx;
    o[0] = lx; o[1] = ly; o[2] = z - b.z - Math.sin(b.pitch) * lx - Math.sin(b.roll) * ly; o[3] = lx / b.def.hull.length_m + 0.5; return o; },   // + roll lifts the starboard (+y) side, as the hull is drawn
  // ---- the hull answers your weight: heels and trims toward where you stand, dips at each step; a canoe a lot, a lobster boat barely ----
  boatTip(D) { const H = D.hull; return (1.15 - clamp(D.handling.stability, 0, 1)) / (0.6 + H.length_m * H.beam_m * H.depth_m); },
  // springs for heel, trim and heave (b.rock: the three and their speeds), toward your weight at (lx, ly) in the boat's frame (lx null: nobody aboard) plus a paddle's roll
  boatRock(b, dt, lx, ly, roll = 0) {
    const k = this.boatTip(b.def), R = b.rock || (b.rock = [0, 0, 0, 0, 0, 0]), on = lx != null;
    const tg = [clamp((on ? -k * ly : 0) + k * roll, -0.3, 0.3), on ? clamp(-k * 0.15 * lx, -0.12, 0.12) : 0, on ? -0.04 * k : 0];
    for (let i = 0; i < 3; i++) { const w = 4.5 + i * 0.8; R[i + 3] += ((tg[i] - R[i]) * w * w - 0.5 * w * R[i + 3]) * dt; R[i] += R[i + 3] * dt; }
  },
  boatKick(b, heave, roll) { const k = this.boatTip(b.def), R = b.rock || (b.rock = [0, 0, 0, 0, 0, 0]); R[5] += heave * 0.5 * k; R[3] += roll * k; },   // a step, a jump in or out
  // another boat a hull at (x, y) would run into (bow, stern and both sides at the middle), or null
  boatHits(b, x, y) {
    const L = b.def.hull.length_m, ca = Math.cos(b.a), sa = Math.sin(b.a), hw = b.def.hull.beam_m / 2;
    for (const o of this.boats) { if (o === b || Math.hypot(o.x - x, o.y - y) > (L + o.def.hull.length_m) / 2 + 1) continue;
      for (const [u, v] of [[0.48, 0], [-0.48, 0], [0, 1], [0, -1], [0.25, 0.7], [0.25, -0.7], [-0.25, 0.7], [-0.25, -0.7]]) if (this.boatOver(o, x + ca * u * L - sa * v * hw, y + sa * u * L + ca * v * hw)) return o; }
    return null;
  },
  // a hull someone in the water or on the bank at (x, y), feet at z, would be inside (with a body's width to spare), or null; you can dive under one
  boatBlocks(x, y, z) {
    for (const b of this.boats) { const L = b.def.hull.length_m; if (Math.abs(x - b.x) > L || Math.abs(y - b.y) > L) continue;
      const S = b.def._shape, q = this.boatLocal(b, x, y, z, this._bb || (this._bb = [])), t = clamp(q[3], 0, 1);
      if (Math.abs(q[0]) < L / 2 + 0.25 && Math.abs(q[1]) < S.hb(t) + 0.25 && q[2] < S.gun(t) && q[2] + 1.8 > -S.keel(t)) return b; }
    return null;
  },
  boatOver(b, x, y) { const q = this.boatLocal(b, x, y); return q[3] > 0 && q[3] < 1 && Math.abs(q[1]) < b.def._shape.hb(q[3]); },
  // push a point of the fishing line (p[j..j+2], and its last position in o) out of the hull: over the gunwale, round the side or under the keel,
  // whichever is nearest. True if it was inside
  boatLineOut(b, p, j, o) {
    if (Math.abs(p[j] - b.x) > b.def.hull.length_m || Math.abs(p[j + 1] - b.y) > b.def.hull.length_m) return false;
    const q = this.boatLocal(b, p[j], p[j + 1], p[j + 2], this._bq || (this._bq = [])), t = q[3]; if (t <= 0 || t >= 1) return false;
    const S = b.def._shape, side = S.hb(t) - Math.abs(q[1]) + 0.02, up = S.gun(t) + 0.02 - q[2], down = q[2] + S.keel(t) + 0.02; if (side <= 0.02 || up <= 0.02 || down <= 0.02) return false;
    const k = q[1] < 0 ? -side : side, d = up <= side && up <= down ? [0, 0, up] : down <= side ? [0, 0, -down] : [-Math.sin(b.a) * k, Math.cos(b.a) * k, 0];
    for (let c = 0; c < 3; c++) { p[j + c] += d[c]; if (o) o[j + c] += d[c]; }   // moved, not thrown: no speed added
    return true;
  },
  // does the hull hide a point from an eye on board (e: the eye in the boat's frame)? For the line, which is drawn on the overlay with no depth test.
  // shortcut: knows the hull, floor and decks, not a console or wheelhouse; draw the line in GL if it shows across those
  boatHides(b, e, x, y, z) {
    const D = b.def, S = D._shape, L = D.hull.length_m, q = this.boatLocal(b, x, y, z, this._bq || (this._bq = []));
    const over = (lx, ly) => { const t = lx / L + 0.5; return t > 0 && t < 1 && Math.abs(ly) < S.hb(t); };
    if (over(q[0], q[1])) return q[2] < this.boatDeckZ(D, q[0], q[1]);   // under your feet
    let lo = 0, hi = 1; for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (over(e[0] + (q[0] - e[0]) * m, e[1] + (q[1] - e[1]) * m)) lo = m; else hi = m; }   // where the sight line crosses the side
    return e[2] + (q[2] - e[2]) * hi < S.gun(clamp((e[0] + (q[0] - e[0]) * hi) / L + 0.5, 0, 1));   // below the gunwale there: behind the hull
  },
  toggleBoatMode() {
    const b = this.boat; if (!b) return; const D = b.def, S = D._shape, t = clamp(D.crew.seat_at, 0, 1);
    if (this.boatMode === 'deck') { this.boatMode = 'drive'; this.seatBoat(b); this.say('At the helm', 1.5); this.updateTui(); return; }
    else { this.boatMode = 'deck'; this.boatLX = S.x(t); this.boatLY = -(D.crew.seat_side || 0) * S.hb(t); this.boatSit = !this.boatCanStand(D);
      if (this.boatWalkable(D) && !this.boatSpotOK(D, this.boatLX, this.boatLY)) {   // the helm seat is boxed in (a console, a wheelhouse): step to the nearest clear spot
        let best = null; for (let k = 0; k < 60 && !best; k++) for (const sg of [-1, 1]) { const x = this.boatLX + sg * k * 0.1; for (const y of [0, 0.3, -0.3, this.boatLY]) if (!best && this.boatSpotOK(D, x, y)) best = [x, y]; }
        if (best) [this.boatLX, this.boatLY] = best; }
      this.updateTui(); this.say(this.boatWalkable(D) ? (this.touchUI ? `Off the helm · joystick to move about` : `Off the helm · WASD to move about · C to ${this.boatSit ? 'stand' : 'sit'} · V to drive`) : `Fishing from the ${D.name.toLowerCase()} · ${this.touchUI ? 'Helm' : 'V'} to paddle`, 4); }
  },
  toggleBoatSit() { const D = this.boat.def; this.boatKick(this.boat, -0.6, 0); if (!this.boatSit) this.boatSit = true; else if (this.boatCanStand(D)) this.boatSit = false; else { this.say(`Too tippy to stand in a ${D.name.toLowerCase()}`, 2); return; } this.say(this.boatSit ? 'Sitting' : 'Standing', 1); this.updateTui(); },
  boatDeckStep(dt, f, s) {
    const b = this.boat, D = b.def, H = D.hull, S = D._shape, P = this.P;
    const wl = this.boatStep(dt, 0, 0, false, false);   // the boat drifts to a stop on its own
    if (this.boatWalkable(D) && !this.boatSit && (f || s)) {   // walk about, relative to where you're looking
      const rel = P.a - b.a, sp = 1.4 * dt, dx = (Math.cos(rel) * f - Math.sin(rel) * s) * sp, dy = (Math.sin(rel) * f + Math.cos(rel) * s) * sp;
      const ok = (x, y) => this.boatSpotOK(D, x, y) && Math.abs(this.boatDeckZ(D, x, y) - this.boatDeckZ(D, this.boatLX, this.boatLY)) < 0.7;   // step up onto a casting deck, not over a console
      const x0 = this.boatLX, y0 = this.boatLY; if (ok(this.boatLX + dx, this.boatLY)) this.boatLX += dx; if (ok(this.boatLX, this.boatLY + dy)) this.boatLY += dy;
      if ((this.stepAcc = (this.stepAcc || 0) + Math.hypot(this.boatLX - x0, this.boatLY - y0)) > 0.6) { this.stepAcc = 0; this.boatKick(b, -0.6, (this.stepFoot = -(this.stepFoot || 1)) * 0.3); }   // each footfall
    }
    const lx = this.boatLX, ly = this.boatLY, ca = Math.cos(b.a), sa = Math.sin(b.a), eye = this.boatSit ? (H.cockpit ? D.crew.eye_height_m : 0.95) : 1.62;
    P.x = b.x + ca * lx - sa * ly; P.y = b.y + sa * lx + ca * ly;
    P.z = b.z + this.boatDeckZ(D, lx, ly) + eye - EYE + Math.sin(b.pitch) * lx + Math.sin(b.roll) * ly; P.vz = 0;
    return wl;
  },
  updateIdleBoats(dt) { // boats nobody's in: drift on the current, ride the swell
    for (const b of this.boats) { if (b === this.boat) continue; sample(b.x, b.y); b.kd = SK; b.wl = SW; const fl = flowAt(b.x, b.y, b.kd), nx = b.x + fl[0] * 0.6 * dt, ny = b.y + fl[1] * 0.6 * dt;
      if (this.boatDepth(nx, ny) > b.def.hull.draft_m + 0.05) { b.x = nx; b.y = ny; }
      const L = b.def.hull.length_m, ca = Math.cos(b.a), sa = Math.sin(b.a), zb = this.swellAt(b.x + ca * L / 2, b.y + sa * L / 2, b.kd), zs = this.swellAt(b.x - ca * L / 2, b.y - sa * L / 2, b.kd);
      b.z = b.wl + (zb + zs) / 2; b.pitch = Math.atan2(zb - zs, L) * 0.8; b.roll = 0.04 * Math.sin(this.time * 0.9 + b.x) * (1 - b.def.handling.stability);
      if (b.rock) { this.boatRock(b, dt, null); b.pitch += b.rock[1]; b.roll += b.rock[0]; b.z += b.rock[2]; b.sp = b.sr = undefined; } }   // still rocking after you've stepped off
  },
});
