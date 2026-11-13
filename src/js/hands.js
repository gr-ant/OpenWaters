'use strict';
// HANDS (hands.js): a fish in your hands, a fish on the ground, and the bucket / cooler / livewell aboard a boat.
//   Engine.carry -> { f, grip: 'cradle' | 'hand' | 'lip', grips, meta } or null. You walk and look about as usual; the
//                   rod is put away while your hands are full and comes back out when they're free.
//   Use (F): swap grips (when the fish's "handling" allows both), or pick up a fish lying near you.
//   Release (X): drop it. Over water it swims off; on the ground or the deck it lies there (Engine.loose) until you
//                pick it up again or walk away from it.
//   A fish in a bucket or a livewell lies there in view; a cooler's lid is shut. Clear view (the Clear button beside Radar, or Z)
//   hides everything on screen but the menu button.
//   Keep (E): only into something: carry it to the bucket / cooler / livewell of a boat (boat.well), aboard or reaching in
//             from beside it, and put it in; with empty hands, E there takes the last one back out.
// On a touch screen the same things are small buttons beside the fish (#fishChips); with keys they're in the key hints.
(() => {
  const E = Engine, $ = id => document.getElementById(id), TAU = Math.PI * 2;
  const kgTxt = kg => kg < 1 ? `${(kg * 1000).toFixed(0)} g` : `${kg.toFixed(2)} kg`, busy = () => E.pauseOpen || E.showMap || E.tackleOpen || E.journalOpen || E.invOpen || E.spawnOpen || E.titleOpen || E.menu;
  E.carry = null; E.loose = [];
  const view = () => { const P = E.P, eo = E.eyeOff || ZERO3, eye = E.thirdP && E.hPose && E.hPose.hand ? null : [P.x + eo[0], P.y + eo[1], P.z + EYE + eo[2]], cp = Math.cos(P.pitch);
    const F = [Math.cos(P.a) * cp, Math.sin(P.a) * cp, Math.sin(P.pitch)], R = [-Math.sin(P.a), Math.cos(P.a), 0], U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
    return { eye, F, R, U, at: (d, r, u) => [0, 1, 2].map(k => eye[k] + F[k] * d + R[k] * r + U[k] * u) }; };

  // ---- in your hands ----
  E.carryFish = function (f, meta) {
    const hd = fishHandling(f.def), grips = [hd.hold === 'none' ? 'cradle' : hd.hold].concat(hd.lip ? ['lip'] : []), A = this.ang, hadRod = !!(A && A.out);
    f.hooked = 'card'; f.held = true; f.stored = false; f.land = true; f.dead = false;
    // it is yours now, not the lake's: out of the water's own lists and marked as taken, so the lake neither thins it out with the far-off fish
    // nor puts another copy of it back where it lived while you have it (releaseFish undoes both)
    for (const c of this.fishCells.values()) { const i = c.fish.indexOf(f); if (i >= 0) { c.fish.splice(i, 1); break; } }
    this.removeFish(f); f.dead = false; for (const q of this.fish) if (q.leader === f) q.leader = null;   // and its shoal stops following it
    if (this.traps) this.traps.hand = null;
    this.carry = { f, meta: meta || {}, grips, grip: grips[0], phi: 0, om: 0, hp: null, hv: 0, t: 0, hadRod };
    if (hadRod && !A.fish) this.toggleRod(false);
    this.say(`${f.name} · ${f.lengthCm.toFixed(1)} cm · ${kgTxt(f.weightKg)}`, 2.5);
  };
  const freeHands = () => { const c = E.carry; E.carry = null; if (c && c.hadRod && E.ang && !E.ang.out && !E.swim) E.toggleRod(true); return c; };
  E.swapGrip = function () { const c = this.carry; if (!c || c.grips.length < 2) return; c.grip = c.grips[(c.grips.indexOf(c.grip) + 1) % c.grips.length]; c.t = 0; c.phi = 0; c.om = 0; this.buzz(15); };
  E.carryStep = function (dt) {
    const c = this.carry; if (!c) return; const f = c.f, P = this.P, B = f.def.body;
    if (this.swim) { this.dropFish(); return; }   // both hands needed to swim
    c.t += dt; const V = view(), e = Math.min(1, dt * 12) * Math.min(1, c.t / 0.25 + 0.2), tx = this.tanX || Math.tan(FOV / 2), ty = this.tanY || tx * 0.56;
    let ctr, pitch, yaw = P.a + Math.PI / 2;
    if (!V.eye) {   // third person: at the figure's hand
      const h = this.hPose.hand; pitch = c.grip === 'lip' ? Math.PI / 2 - 0.1 : 0;
      ctr = c.grip === 'lip' ? [h[0], h[1], h[2] - f.len * 0.49] : [h[0] + Math.cos(P.a) * 0.15, h[1] + Math.sin(P.a) * 0.15, h[2] + 0.05];
    } else if (c.grip === 'lip') {   // hanging from your hand by its jaw. Your hand stays where you hold it; the fish swings under it as you turn and walk
      const d = clamp(f.len * 0.95, 0.42, 0.56), m = V.at(d, Math.min(0.14, d * 0.22), Math.min(0.12, f.len * 0.35));
      if (c.hp && dt > 1e-4) { const v = ((m[0] - c.hp[0]) * V.R[0] + (m[1] - c.hp[1]) * V.R[1]) / dt, a = clamp((v - c.hv) / dt, -40, 40), Lp = Math.max(0.12, f.len * 0.6);
        for (let n = 0, h = Math.min(dt, 0.05) / 2; n < 2; n++) { c.om += (-(9.8 / Lp) * Math.sin(c.phi) - 2.6 * c.om - a / Lp * Math.cos(c.phi)) * h; c.phi = clamp(c.phi + c.om * h, -1.1, 1.1); }
        c.hv = v; }
      c.hp = m; pitch = Math.PI / 2 - c.phi + 0.03 * Math.sin(this.time * 2.1);   // phi: the tail swung toward your right
      ctr = [m[0] - Math.cos(yaw) * Math.cos(pitch) * f.len * 0.49, m[1] - Math.sin(yaw) * Math.cos(pitch) * f.len * 0.49, m[2] - Math.sin(pitch) * f.len * 0.49]; f.open = 0.85;
    } else {   // across your hands, side on
      const d = clamp(Math.max(f.len / (0.95 * tx), f.len * B.height / (0.9 * ty)), c.grip === 'hand' ? 0.36 : 0.44, 0.56); ctr = V.at(d, 0, -Math.min(0.12, d * 0.2));
      pitch = 0.04 * Math.sin(this.time * 2.3); f.open = 0.25 + 0.2 * Math.sin(this.time * 3); c.hp = null;
    }
    f.x += (ctr[0] - f.x) * e; f.y += (ctr[1] - f.y) * e; f.z += (ctr[2] - f.z) * e; f.a = yaw; f.pitch = (f.pitch || 0) + (pitch - (f.pitch || 0)) * e; f.roll = (f.roll || 0) * (1 - e);
    f.ph = (f.ph + dt * (2 + 3 * Math.max(0, Math.sin(this.time * 1.7)))) % TAU; f.land = true;
  };

  // ---- dropped ----
  // the deck under a point, if it is over a boat: { b, lx, ly, z }
  const deckAt = (x, y) => { for (const b of E.boats) { const D = b.def, S = D._shape, L = D.hull.length_m, dx = x - b.x, dy = y - b.y, cb = Math.cos(b.a), sb = Math.sin(b.a), lx = cb * dx + sb * dy, ly = -sb * dx + cb * dy, t = lx / L + 0.5;
      if (t > 0.03 && t < 0.97 && Math.abs(ly) < S.hb(t) * 0.92) return { b, lx, ly, z: b.z + E.boatDeckZ(D, lx, ly) + Math.sin(b.pitch || 0) * lx }; } return null; };
  E.dropFish = function () {
    const c = freeHands(); if (!c) return; const f = c.f, P = this.P;
    this.loose.push({ f, meta: c.meta, st: 'fall', vx: Math.cos(P.a) * 0.9, vy: Math.sin(P.a) * 0.9, vz: 0.4, hop: 0, side: Math.random() < 0.5 ? 1 : -1, t: 0 });
  };
  E.looseStep = function (dt) {
    if (!this.loose.length) return; const P = this.P;
    for (const l of this.loose.slice()) { const f = l.f, lie = this.fishLie(f, l.side), gone = () => { this.loose = this.loose.filter(q => q !== l); }; l.t += dt;
      if (l.st === 'fall') {
        l.vz -= 9.8 * dt; f.x += l.vx * dt; f.y += l.vy * dt; f.z += l.vz * dt; f.pitch = (f.pitch || 0) * (1 - Math.min(1, dt * 6)); f.roll = (f.roll || 0) + (lie.roll - (f.roll || 0)) * Math.min(1, dt * 8); f.ph = (f.ph + dt * 18) % TAU;
        const dk = deckAt(f.x, f.y); sample(f.x, f.y); const g = hW(SE), wl = SW;
        if (dk && f.z <= dk.z + lie.half) { l.st = 'flop'; l.boat = dk.b; l.lx = dk.lx; l.ly = dk.ly; this.buzz(25); }
        else if (!dk && wl - g > Math.max(0.1, f.len * 0.2) && f.z <= wl) {   // into the water: away it goes
          gone(); if (!l.meta.logged) this.logCatch(f, l.meta, false); this.releaseFish(f, f.x, f.y); this.say(`${f.name} swims off`, 2); }
        else if (!dk && f.z <= g + lie.half) { l.st = 'flop'; l.spot = [f.x, f.y, Math.max(g, wl - 0.03)]; this.buzz(25); }
      } else {
        const hop = this.fishFlop(f, l, dt, Math.max(0.25, 1 - l.t / 90)); f.roll = lie.roll; f.land = true;
        if (l.boat) { const b = l.boat, cb = Math.cos(b.a), sb = Math.sin(b.a); f.x = b.x + cb * l.lx - sb * l.ly; f.y = b.y + sb * l.lx + cb * l.ly; f.z = b.z + this.boatDeckZ(b.def, l.lx, l.ly) + Math.sin(b.pitch || 0) * l.lx + lie.half + hop; f.a = b.a + 1.2; }
        else { f.x = l.spot[0]; f.y = l.spot[1]; f.z = l.spot[2] + lie.half + hop; }
        if (Math.hypot(f.x - P.x, f.y - P.y) > 45) { gone(); if (!l.meta.logged) this.logCatch(f, l.meta, false); f.roll = 0; this.creelFish(f); }   // left behind
      }
    }
  };
  const nearLoose = () => { if (E.carry || !E.loose.length) return null; const P = E.P; let best = null, bd = 1.9;
    for (const l of E.loose) { if (l.st !== 'flop') continue; const d = Math.hypot(l.f.x - P.x, l.f.y - P.y); if (d < bd && Math.abs(l.f.z - P.z) < 1.6) { bd = d; best = l; } } return best; };
  // picking one up: bend down to it, both hands on it, then up with it
  E.grab = null;
  E.pickUpFish = function (l) { if (!this.grab && !this.carry) this.grab = { l, t: 0 }; };
  const grabStep = dt => { const g = E.grab; if (!g) return; const f = g.l.f, P = E.P; g.t += dt;
    if (!E.loose.includes(g.l) || E.carry || Math.hypot(f.x - P.x, f.y - P.y) > 2.4) { E.grab = null; return; }
    if (!E.thirdP) E.crouchTo([f.x, f.y, f.z - E.fishLie(f).half], Math.min(1, g.t / 0.45) ** 2 * (3 - 2 * Math.min(1, g.t / 0.45)));
    if (g.t > 0.95) { E.grab = null; E.loose = E.loose.filter(q => q !== g.l); E.carryFish(f, g.l.meta); } };
  // straightening up again once nothing is holding you down
  const standStep = dt => { const o = E.eyeOff; if (!o || E.eyeHold > E.time) return; const k = 1 - Math.min(1, dt * 3.2); o[0] *= k; o[1] *= k; o[2] *= k; if (Math.hypot(o[0], o[1], o[2]) < 0.004) E.eyeOff = null; };

  // ---- the bucket / cooler / livewell aboard ----
  const wellOf = b => { let w = b._well; const D = b.def;
    if (!w) { const S = D._shape, L = D.hull.length_m, s = clamp(D.crew.seat_at, 0, 1), t = clamp(s + (s > 0.5 ? -0.22 : 0.22), 0.14, 0.86), lx = S.x(t), ly = S.hb(t) * 0.34;
      const kind = !['outboard', 'inboard'].includes(D.propulsion.type) || L < 3.6 ? 'bucket' : L < 6.6 ? 'cooler' : 'livewell'; w = b._well = { kind, name: kind, cap: kind === 'bucket' ? 3 : kind === 'cooler' ? 6 : 10, lx, ly }; }
    if (!b.well) b.well = []; const cb = Math.cos(b.a), sb = Math.sin(b.a);
    w.pos = [b.x + cb * w.lx - sb * w.ly, b.y + sb * w.lx + cb * w.ly, b.z + E.boatDeckZ(D, w.lx, w.ly) + Math.sin(b.pitch || 0) * w.lx]; w.list = b.well; return w; };
  const wellNear = () => { const P = E.P; let best = null, bd = 1.7; for (const b of E.boats) { if (Math.hypot(b.x - P.x, b.y - P.y) > 30) continue; const w = wellOf(b), d = Math.hypot(w.pos[0] - P.x, w.pos[1] - P.y); if (d < bd && Math.abs(w.pos[2] - P.z) < 1.8) { bd = d; best = w; } } return best; };   // aboard, or reaching in from the bank or the water beside it
  E.boatWell = b => wellOf(b);
  E.keepCarried = function () {
    const c = this.carry; if (!c) return; const f = c.f, w = wellNear();
    if (!w) { const b = this.boat || this.boats.slice().sort((p, q) => Math.hypot(p.x - this.P.x, p.y - this.P.y) - Math.hypot(q.x - this.P.x, q.y - this.P.y))[0], wb = b && wellOf(b);
      return this.say(wb ? `Nothing to keep it in here: carry it to the ${wb.name} in the ${b.def.name.toLowerCase()} (${Math.hypot(wb.pos[0] - this.P.x, wb.pos[1] - this.P.y).toFixed(0)} m)` : 'Nothing to keep it in: you need a boat with a bucket or a cooler', 3); }
    if (w.list.length >= w.cap) return this.say(`The ${w.name} is full (${w.cap})`, 2.5);
    freeHands(); if (!c.meta.logged) { this.logCatch(f, c.meta, true); c.meta.logged = true; }
    f.stored = true; f.held = true; f.meta = c.meta; w.list.push(f); this.buzz(20); this.say(`${f.name} in the ${w.name} (${w.list.length}/${w.cap})`, 2.5);
  };
  E.takeFromWell = function () { const w = !this.carry && wellNear(); if (!w || !w.list.length) return false; const f = w.list.pop(); f.stored = false; f.x = w.pos[0]; f.y = w.pos[1]; f.z = w.pos[2] + 0.3; this.carryFish(f, f.meta || { logged: true }); return true; };
  const box = (B, x0, x1, y0, y1, z0, z1, col) => { const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], q = (a, b, cc, d) => B.quad(a, b, cc, d, col, c);
    q([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]); q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]); q([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]); q([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]); };
  const wellMesh = kind => { const B = meshBuilder(); B.mat = MT.PLASTER;
    if (kind === 'bucket') { B.tube([0, 0, 0], [0, 0, 0.27], 0.115, 0.145, 10, [0.85, 0.86, 0.82], true); B.blob([0, 0, 0.268], 0.132, 0.132, 0.006, 3, 10, [0.2, 0.42, 0.5]); B.mat = MT.METAL; B.tube([0, -0.15, 0.25], [0, 0.15, 0.25], 0.006, 0.006, 4, [0.6, 0.62, 0.65], false); }
    else if (kind === 'cooler') { box(B, -0.31, 0.31, -0.19, 0.19, 0, 0.3, [0.9, 0.92, 0.94]); box(B, -0.325, 0.325, -0.205, 0.205, 0.3, 0.37, [0.18, 0.42, 0.72]); B.mat = MT.METAL; box(B, -0.36, -0.31, -0.07, 0.07, 0.2, 0.23, [0.25, 0.27, 0.3]); box(B, 0.31, 0.36, -0.07, 0.07, 0.2, 0.23, [0.25, 0.27, 0.3]); }
    else { box(B, -0.45, 0.45, -0.27, 0.27, 0, 0.36, [0.82, 0.84, 0.86]); box(B, -0.41, 0.41, -0.23, 0.23, 0.33, 0.364, [0.16, 0.4, 0.52]); B.mat = MT.METAL; box(B, -0.47, 0.47, -0.29, 0.29, 0.34, 0.37, [0.55, 0.57, 0.6]); box(B, -0.41, 0.41, -0.23, 0.23, 0.345, 0.366, [0.16, 0.4, 0.52]); }
    return new Float32Array(B.v); };
  const baseArms = E.drawArms;
  E.drawArms = function (gl, Lp) {   // every boat's bucket / cooler / livewell, then your arms
    if (this.boats.length && !this.showMap) { gl.uniform1f(Lp.u.fsh, 1); gl.uniform1f(Lp.u.wig, 0); gl.uniform1f(Lp.u.swm, 0); gl.uniform3fv(Lp.u.jawP, [0, 0, 0]);
      for (const b of this.boats) { if (Math.hypot(b.x - this.P.x, b.y - this.P.y) > 120) continue; const w = wellOf(b), g = this.tackleGpu('well:' + w.kind, () => wellMesh(w.kind));
        gl.uniform1f(Lp.u.roll, b.roll || 0); this.upInst(g, [w.pos[0], w.pos[1], w.pos[2], 1, b.a, 0.5, -1e4, 0, 0, b.pitch || 0]); gl.bindVertexArray(g.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, g.n, 1); }
      gl.uniform1f(Lp.u.roll, 0); }
    return baseArms.call(this, gl, Lp);
  };

  // ---- keys, taps, hints, and the buttons beside the fish ----
  // ---- double taps (touch) ----
  // What a double tap at (x, y) on the screen means, as a function to run, or null for "nothing in particular" (then the rod casts
  // or reels, or it is Use). In order: the landed fish (unhook); with a fish in your hands, a bucket / cooler (put it in); a fish on
  // the ground (pick it up); a bucket / cooler with fish in it (take one out); a boat in reach (board); the bottom-left corner
  // (tackle box); the bottom-right corner with empty hands (the rod); aboard without the rod, anywhere off the boat (step off), or on
  // your own boat (from the helm: stand on the deck; sitting: stand up; standing: take the helm and drive).
  E.tapTarget = function (x, y) {
    if (busy() || this.swim) return null; const P = this.P, A = this.ang, rod = this.rodInHand(), c = this.carry, W = innerWidth, H = innerHeight;
    const segD = (p, q) => { if (!p || !q) return 1e9; const vx = q[0] - p[0], vy = q[1] - p[1], t = clamp(((x - p[0]) * vx + (y - p[1]) * vy) / (vx * vx + vy * vy || 1), 0, 1); return Math.hypot(x - p[0] - vx * t, y - p[1] - vy * t); };
    const onFish = f => { const cp = Math.cos(f.pitch || 0), k = f.len * 0.5, ax = [Math.cos(f.a) * cp * k, Math.sin(f.a) * cp * k, Math.sin(f.pitch || 0) * k]; return segD(this.project(f.x + ax[0], f.y + ax[1], f.z + ax[2]), this.project(f.x - ax[0], f.y - ax[1], f.z - ax[2])) < 46; };
    const onPt = (q, r) => { const p = this.project(q[0], q[1], q[2]); return !!p && Math.hypot(p[0] - x, p[1] - y) < r; };
    // where the tap's line of sight meets a level plane at height z, in a boat's own frame: is that inside her gunwales?
    const eo = this.eyeOff || ZERO3, eye = this.camE && !this.thirdP ? this.camE : [P.x + eo[0], P.y + eo[1], P.z + EYE + eo[2]], cp = Math.cos(P.pitch), F = [Math.cos(P.a) * cp, Math.sin(P.a) * cp, Math.sin(P.pitch)], R = [-Math.sin(P.a), Math.cos(P.a), 0], U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
    const nx = (x / W * 2 - 1) * (this.tanX || 0.6), ny = (1 - y / H * 2) * (this.tanY || 0.4), dir = [0, 1, 2].map(k => F[k] + R[k] * nx + U[k] * ny);
    const onBoat = b => { const D = b.def, S = D._shape, L = D.hull.length_m, z = b.z + this.boatDeckZ(D, 0, 0) + 0.15; if (dir[2] > -0.02) return false; const t = (z - eye[2]) / dir[2]; if (t < 0 || t > 14) return false;
      const wx = eye[0] + dir[0] * t - b.x, wy = eye[1] + dir[1] * t - b.y, cb = Math.cos(b.a), sb = Math.sin(b.a), lx = cb * wx + sb * wy, ly = -sb * wx + cb * wy, u = lx / L + 0.5; return u > 0 && u < 1 && Math.abs(ly) < S.hb(u) * 1.12 + 0.05; };
    if (A && A.phase === 'card') { const Hd = A.land; return Hd && Hd.st === 'down' && A.fish && onFish(A.fish) ? () => this.unhookFish() : null; }
    const wells = this.boats.filter(b => Math.hypot(b.x - P.x, b.y - P.y) < 12).map(b => wellOf(b)), wellAt = wells.find(w => onPt([w.pos[0], w.pos[1], w.pos[2] + 0.18], 62));
    if (c && wellAt) return () => this.keepCarried();
    if (!c) { const l = this.loose.find(q => q.st === 'flop' && Math.hypot(q.f.x - P.x, q.f.y - P.y) < 3.2 && onFish(q.f)); if (l) return () => { if (Math.hypot(l.f.x - P.x, l.f.y - P.y) < 1.9) this.pickUpFish(l); else this.say('Get closer to pick it up', 1.5); };
      if (wellAt && wellAt.list.length && !rod) return () => { if (!this.takeFromWell()) this.say(`Get closer to the ${wellAt.name}`, 1.5); }; }
    if (!this.boat && !rod) { const nb = this.nearBoat && this.nearBoat(); if (nb && onBoat(nb)) return () => this.boardBoat(nb); }
    if (y > H * 0.7 && x < W * 0.3) return () => this.toggleTackle();
    if (y > H * 0.7 && x > W * 0.7 && !rod && !c && A && !A.out) return () => this.toggleRod(true);
    if (this.boat && !rod && !c && !onBoat(this.boat)) return () => this.leaveBoat();   // (not with a fish in your hands: too easy to do by accident)
    if (this.boat && !rod) return () => {   // on your own boat: from the helm, up onto the deck; sitting, stand up; standing, back to the helm to drive
      if (this.boatMode !== 'deck') this.toggleBoatMode(); else if (this.boatSit && this.boatCanStand(this.boat.def)) this.toggleBoatSit(); else if (!c) this.toggleBoatMode(); };   // (a boat too tippy to stand in: straight back to the helm)
    return null;
  };
  // clear view: the Clear button beside Radar, or Z
  const bClear = $('bClear'), setClear = on => { E.hudClear = !!on; document.body.classList.toggle('hudclear', !!on); if (bClear) { bClear.setAttribute('aria-pressed', String(!!on)); bClear.querySelector('b').textContent = on ? 'Show' : 'Clear'; }
    if (on) { document.body.classList.remove('more'); const hs = $('hSettings'); if (hs) hs.setAttribute('aria-expanded', 'false'); }
    try { localStorage.setItem('embercrown-hudclear', on ? '1' : ''); } catch (e) { /* */ } E.pauseRedraw = true; };
  E.setHudClear = setClear; if (bClear) bClear.onclick = () => setClear(!E.hudClear);
  try { if (localStorage.getItem('embercrown-hudclear') === '1') setClear(true); } catch (e) { /* */ }
  const baseKey = E.keyPress;
  E.keyPress = function (code, e, card) {
    if (code === 'KeyZ' && !(e && e.repeat) && !card && !this.pauseOpen && !this.titleOpen) { setClear(!this.hudClear); if (!this.hudClear) this.say('HUD back', 2); return; }
    if (card || (e && e.repeat) || busy() || !['KeyF', 'KeyE', 'KeyX'].includes(code)) return baseKey.call(this, code, e, card);
    if (this.carry) { if (code === 'KeyX') return this.dropFish(); if (code === 'KeyE') return this.keepCarried(); if (this.carry.grips.length > 1) return this.swapGrip(); return baseKey.call(this, code, e, card); }
    if (code === 'KeyF') { const l = nearLoose(); if (l) return this.pickUpFish(l); }
    if (code === 'KeyE' && this.takeFromWell()) return;
    return baseKey.call(this, code, e, card);
  };
  const baseAct = E.action;
  E.action = function () { if (this.carry && this.carry.grips.length > 1) return this.swapGrip(); const l = nearLoose(); if (l) return this.pickUpFish(l); return baseAct.call(this); };
  const baseRod = E.toggleRod;
  E.toggleRod = function (on = !this.ang.out) { if (on && this.carry) { this.say('Your hands are full: drop the fish or put it away first', 2.5); return; } return baseRod.call(this, on); };
  const baseKeys = E.contextKeys;
  E.contextKeys = function () { const K = id => Controls.key(id), A = this.ang, H = A && A.phase === 'card' && A.land, c = this.carry, out = [];
    if (H) { if (H.st === 'down') out.push([K('use'), 'Unhook']); return out; }
    if (c) { if (c.grips.length > 1) out.push([K('use'), c.grip === 'lip' ? 'Hold it' : 'Lip it']); out.push([K('release'), 'Drop']);
      const w = wellNear(); if (w) out.push([K('keep'), `Put in ${w.name}`]); return out; }
    const base = baseKeys.call(this) || []; if (nearLoose()) base.unshift([K('use'), 'Pick up']); const w = wellNear(); if (w && w.list.length) base.unshift([K('keep'), `Take from ${w.name}`]); return base;
  };
  const chips = $('fishChips'), CH = { ccUnhook: () => E.unhookFish(), ccPick: () => { const l = nearLoose(); if (l) E.pickUpFish(l); }, ccGrip: () => E.swapGrip(), ccRel: () => E.carry ? E.dropFish() : E.finishCatch(false),
    ccKeep: () => E.carry ? E.keepCarried() : E.finishCatch(true), ccTake: () => E.takeFromWell() };
  for (const id in CH) { const b = $(id); if (b) b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); if (!E.pauseOpen) CH[id](); }; }
  // what's in each boat's bucket or livewell lies there to be seen: head down in the bucket, tails out; side by side in the well. A cooler's lid is shut.
  const wellStep = dt => { for (const b of E.boats) { if (!b.well || !b.well.length) continue; const w = wellOf(b);
      b.well.forEach((f, i) => { f.held = true; f.hooked = 'card'; if (w.kind === 'cooler') { f.stored = true; return; }
        f.stored = false; f.land = true; f.roll = 0; f.open = 0.3; f.ph = (f.ph + 0.9 * dt) % TAU;
        if (w.kind === 'bucket') { const a = b.a + i * 2.1; f.a = a; f.pitch = -1.3; f.x = w.pos[0] + Math.cos(a) * 0.035; f.y = w.pos[1] + Math.sin(a) * 0.035; f.z = w.pos[2] + 0.03 + f.len * 0.47; }
        else { const k = ((i % 3) - 1) * 0.15; f.a = b.a + (i % 2 ? Math.PI : 0) + 0.12; f.pitch = 0; f.x = w.pos[0] - Math.sin(b.a) * k; f.y = w.pos[1] + Math.cos(b.a) * k; f.z = w.pos[2] + 0.31 + (i > 2 ? 0.05 : 0); } }); } };
  // a fish you are holding, have put down or have stored is never thinned out of the world with the far-off ones (the fish list is rebuilt as you move)
  const keepHeld = () => { const need = f => { if (f && !E.fish.includes(f)) { f.dead = false; E.fish.push(f); } }; if (E.carry) need(E.carry.f); for (const l of E.loose) need(l.f); for (const b of E.boats) if (b.well) for (const f of b.well) need(f); };
  Game.on('update', dt => { keepHeld(); grabStep(dt || 0); standStep(dt || 0); E.carryStep(dt || 0); E.looseStep(dt || 0); wellStep(dt || 0); });
  Game.onHud(() => {
    const A = E.ang, H = A && A.phase === 'card' && A.land, c = E.carry, show = {}, set = (id, txt) => { show[id] = txt; }; let anchor = null;
    if (busy()) { if (chips) chips.hidden = true; return; }
    if (H && A.fish) { anchor = A.fish; if (H.st === 'down') set('ccUnhook', 'Unhook'); }
    else if (c) { anchor = c.f; if (c.grips.length > 1) set('ccGrip', c.grip === 'lip' ? 'Hold' : 'Lip'); set('ccRel', 'Drop'); const near = wellNear(), w = near || (E.boat && wellOf(E.boat));
      if (near) set('ccKeep', near.kind === 'livewell' ? 'Well' : near.kind === 'bucket' ? 'Bucket' : 'Cooler');
      E.hudDetail = `${c.f.name}  ·  ${c.f.lengthCm.toFixed(1)} cm  ·  ${kgTxt(c.f.weightKg)}${w && !near ? `  ·  ${w.name} ${Math.hypot(w.pos[0] - E.P.x, w.pos[1] - E.P.y).toFixed(1)} m` : ''}`; }
    else if (E.grab) { /* on your way down to it */ }
    else { const l = nearLoose(), w = wellNear(); if (l) { anchor = l.f; set('ccPick', 'Pick up'); } else if (w && w.list.length) { anchor = { x: w.pos[0], y: w.pos[1], z: w.pos[2] + 0.35 }; set('ccTake', 'Take out'); }
      if (w && !E.hudDetail) E.hudDetail = w.list.length ? `${w.name[0].toUpperCase() + w.name.slice(1)} (${w.list.length}/${w.cap})  ·  ${w.list.map(f => `${f.name} ${f.lengthCm.toFixed(0)} cm`).join(', ')}` : `${w.name[0].toUpperCase() + w.name.slice(1)}: empty`; }
    if (!chips) return; const any = Object.keys(show).length > 0 && E.touchUI; chips.hidden = !any; if (!any) return;
    for (const b of chips.children) { const t = show[b.id]; b.hidden = !t; if (t && b.textContent !== t) b.textContent = t; }
    // the fish's box on screen (snout, tail, back, belly), and the row centred under it; above it if that would run into the controls
    const w = chips.offsetWidth || 200, h = chips.offsetHeight || 40; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, got = false;
    if (anchor) { const pts = [[anchor.x, anchor.y, anchor.z]];
      if (anchor.len) { const cp = Math.cos(anchor.pitch || 0), ax = [Math.cos(anchor.a) * cp, Math.sin(anchor.a) * cp, Math.sin(anchor.pitch || 0)], hh = anchor.len * anchor.def.body.height * 0.5, k = anchor.len * 0.5;
        const B = anchor.def.body, rr = anchor.len * Math.max(B.height, B.width) * 0.5, sx = -Math.sin(anchor.a) * rr, sy = Math.cos(anchor.a) * rr;   // its depth and its breadth: a flatfish is broad where others are deep
        pts.push([anchor.x + ax[0] * k, anchor.y + ax[1] * k, anchor.z + ax[2] * k], [anchor.x - ax[0] * k, anchor.y - ax[1] * k, anchor.z - ax[2] * k], [anchor.x, anchor.y, anchor.z + hh], [anchor.x, anchor.y, anchor.z - hh], [anchor.x + sx, anchor.y + sy, anchor.z], [anchor.x - sx, anchor.y - sy, anchor.z]); }
      for (const q of pts) { const p = E.project(q[0], q[1], q[2]); if (p) { got = true; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } } }
    const floor = innerHeight - h - 170, roof = E.hudClear && !document.body.classList.contains('more') ? 70 : 150; let x = got ? (x0 + x1) / 2 - w / 2 : innerWidth / 2 - w / 2, y = got ? y0 - h - 26 : innerHeight * 0.6;
    if (got && y < roof) y = Math.min(floor, y1 + 26);   // no room above it: under it
    chips.style.left = clamp(x, 8, Math.max(8, innerWidth - w - 8)) + 'px'; chips.style.top = clamp(y, 70, Math.max(70, innerHeight - h - 20)) + 'px';
  });
})();
