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
  toggleBoatMode() {
    const b = this.boat; if (!b) return; const D = b.def, S = D._shape, t = clamp(D.crew.seat_at, 0, 1);
    if (this.boatMode === 'deck') { this.boatMode = 'drive'; this.seatBoat(b); this.say('At the helm', 1.5); this.updateTui(); return; }
    else { this.boatMode = 'deck'; this.boatLX = S.x(t); this.boatLY = -(D.crew.seat_side || 0) * S.hb(t); this.boatSit = !this.boatCanStand(D);
      if (this.boatWalkable(D) && !this.boatSpotOK(D, this.boatLX, this.boatLY)) {   // the helm seat is boxed in (a console, a wheelhouse): step to the nearest clear spot
        let best = null; for (let k = 0; k < 60 && !best; k++) for (const sg of [-1, 1]) { const x = this.boatLX + sg * k * 0.1; for (const y of [0, 0.3, -0.3, this.boatLY]) if (!best && this.boatSpotOK(D, x, y)) best = [x, y]; }
        if (best) [this.boatLX, this.boatLY] = best; }
      this.updateTui(); this.say(this.boatWalkable(D) ? (this.touchUI ? `Off the helm · joystick to move about` : `Off the helm · WASD to move about · C to ${this.boatSit ? 'stand' : 'sit'} · V to drive`) : `Fishing from the ${D.name.toLowerCase()} · ${this.touchUI ? 'Helm' : 'V'} to paddle`, 4); }
  },
  toggleBoatSit() { const D = this.boat.def; if (!this.boatSit) this.boatSit = true; else if (this.boatCanStand(D)) this.boatSit = false; else { this.say(`Too tippy to stand in a ${D.name.toLowerCase()}`, 2); return; } this.say(this.boatSit ? 'Sitting' : 'Standing', 1); this.updateTui(); },
  boatDeckStep(dt, f, s) {
    const b = this.boat, D = b.def, H = D.hull, S = D._shape, P = this.P;
    const wl = this.boatStep(dt, 0, 0, false, false);   // the boat drifts to a stop on its own
    if (this.boatWalkable(D) && !this.boatSit && (f || s)) {   // walk about, relative to where you're looking
      const rel = P.a - b.a, sp = 1.4 * dt, dx = (Math.cos(rel) * f - Math.sin(rel) * s) * sp, dy = (Math.sin(rel) * f + Math.cos(rel) * s) * sp;
      const ok = (x, y) => this.boatSpotOK(D, x, y) && Math.abs(this.boatDeckZ(D, x, y) - this.boatDeckZ(D, this.boatLX, this.boatLY)) < 0.7;   // step up onto a casting deck, not over a console
      if (ok(this.boatLX + dx, this.boatLY)) this.boatLX += dx; if (ok(this.boatLX, this.boatLY + dy)) this.boatLY += dy;
    }
    const lx = this.boatLX, ly = this.boatLY, ca = Math.cos(b.a), sa = Math.sin(b.a), eye = this.boatSit ? (H.cockpit ? D.crew.eye_height_m : 0.95) : 1.62;
    P.x = b.x + ca * lx - sa * ly; P.y = b.y + sa * lx + ca * ly;
    P.z = b.z + this.boatDeckZ(D, lx, ly) + eye - EYE + Math.sin(b.pitch) * lx - Math.sin(b.roll) * ly; P.vz = 0;
    return wl;
  },
  updateIdleBoats(dt) { // boats nobody's in: drift on the current, ride the swell
    for (const b of this.boats) { if (b === this.boat) continue; sample(b.x, b.y); b.kd = SK; b.wl = SW; const fl = flowAt(b.x, b.y, b.kd), nx = b.x + fl[0] * 0.6 * dt, ny = b.y + fl[1] * 0.6 * dt;
      if (this.boatDepth(nx, ny) > b.def.hull.draft_m + 0.05) { b.x = nx; b.y = ny; }
      const L = b.def.hull.length_m, ca = Math.cos(b.a), sa = Math.sin(b.a), zb = this.swellAt(b.x + ca * L / 2, b.y + sa * L / 2, b.kd), zs = this.swellAt(b.x - ca * L / 2, b.y - sa * L / 2, b.kd);
      b.z = b.wl + (zb + zs) / 2; b.pitch = Math.atan2(zb - zs, L) * 0.8; b.roll = 0.04 * Math.sin(this.time * 0.9 + b.x) * (1 - b.def.handling.stability); }
  },
});
