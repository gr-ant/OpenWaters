'use strict';
// FISHING: the per-frame phase step, the dangling rig and rope, casting, the lure in flight and in the water.
Object.assign(Engine, {
  angStep(dt) {
    const A = this.ang; if (!A) return;
    const H = A.holder, bt = this.boat, helm = bt && this.boatMode !== 'deck' && !H;   // H: the rod stands in a rod holder (fishing/rod-holder.js)
    if (A.out && !H && (this.swim || (helm && !this.boatTrolls(bt.def)))) this.toggleRod(false);
    if (!A.out || !A.S) return;
    const K = this.keys, P = this.P, S = A.S, ca = Math.cos(P.a), sa = Math.sin(P.a);
    const btn = !H && !!(K.KeyR || K.Mouse0) && !this.showMap && !this.tackleOpen && !this.journalOpen && A.phase !== 'card', press = btn && !A.btnWas, release = !btn && A.btnWas; A.btnWas = btn;
    const fast = K.ShiftLeft || K.ShiftRight ? 1 : this.reelPull || 0;   // 0..1: Shift is flat out; on touch, how far the Reel button is pulled down
    const eye = [P.x, P.y, P.z + EYE]; A.hand = H ? this.holderHand(H) : this.handForReel(A, eye);   // right hand, placed so the butt stays planted below the bottom-right corner (the reel sits in the bottom-right of the view
    if (this.thirdP && !helm && !H && this.hPose) A.hand = this.hPose.hand;   // third person: in the angler's right hand
    if (helm) { const cb = Math.cos(bt.a), sb = Math.sin(bt.a), Lh = bt.def.hull.length_m; A.hand = [bt.x - cb * Lh * 0.4 - sb * 0.35, bt.y - sb * Lh * 0.4 + cb * 0.35, bt.z + bt.def.hull.depth_m * 0.75]; }   // at the helm the rod sits in a holder at the stern
    A.t = (A.t || 0) + dt; A.reeling = false;
    if (A.bail && (press || (A.phase !== 'water' && A.phase !== 'bite' && A.phase !== 'flight'))) { A.bail = false; if (A.lure) this.say('Bail closed', 1); }   // turning the handle flips the bail shut
    let tp = 0.36 + 0.3 * P.pitch, ty = P.a - 0.38, tb = 0, dp = 0, dyw = 0;   // where the rod wants to point (up and across the view), how much it bends, and small moves on top of the aim (the cast's follow-through, the rhythm of reeling)
    const L = A.lure;
    if (A.phase === 'ready') {
      if (A.baitLeft <= 0 && S.bait) { A.baitLeft = S.bait.lasts; this.say(`Fresh ${S.bait.name.toLowerCase()} on the hook`, 1.5); }
      if (press && !this.showMap) { A.phase = 'charge'; A.charge = 0; A.stroke = null; }
    } else if (A.phase === 'charge') {
      const c = A.charge * A.charge * (3 - 2 * A.charge), back = 1.15 + 0.5 * c, side = P.a - 0.38 - 0.5 * c;   // the rod drawn back and well out to the right (a three-quarter cast), further the longer you hold
      if (A.stroke == null) { A.charge = Math.min(1, A.charge + dt / 1.05); tp = back; ty = side; tb = 0.1 + 0.22 * A.charge;   // wind-up: the tip loaded by the lure hanging behind
        if (release) A.stroke = 0; }
      else { A.stroke += dt; const u = Math.min(1, A.stroke / 0.26), e = u * u * u * (u * (u * 6 - 15) + 10);   // the forward stroke, eased in and out: one sweep from back-right round to the front
        tp = back + (0.8 - back) * e; ty = side + (P.a - 0.2 - side) * e; tb = 0.3 + 0.5 * A.charge * Math.sin(Math.PI * Math.min(1, u * 1.1));   // bent deep against the lure, which goes as the rod comes past upright
        if (u >= 1) { A.stroke = null; this.castLure(); } }
    } else if (A.phase === 'flight') {
      const ft = A.t - A.castAt; tp = 0.15 + 0.2 * P.pitch; dp = -0.45 * Math.exp(-ft * 3.2); dyw = -0.1 * Math.exp(-ft * 3.2); tb = 0.16 * Math.exp(-ft * 7) * Math.abs(Math.sin(ft * 34));   // follow-through: the tip carries on down toward the water and quivers as it unloads
      this.lureFlight(dt, press);
    } else if (A.phase === 'water' || A.phase === 'bite') {
      const ah = Math.atan2(L.y - A.hand[1], L.x - A.hand[0]); ty = P.a + clamp(Math.atan2(Math.sin(ah - P.a), Math.cos(ah - P.a)) - 0.15, -0.5, 0.4);
      tp = 0.2 + 0.2 * P.pitch; tb = A.phase === 'bite' ? 0.15 + 0.1 * Math.sin(A.t * 30) * (A.nibT > 0 ? 1 : 0) : clamp(0.02 + (btn ? 0.05 : 0) + (A.overS || 0) * 1.2 + (A.flow || 0) * 0.08, 0, 0.45);
      this.lureWater(dt, btn, fast);
      // the line load jumps about frame to frame (current, swell, a boat under you): the blank answers to its average, not every flicker
      A.overS = (A.overS || 0) + ((A.over || 0) - (A.overS || 0)) * (1 - Math.exp(-dt * 3));
      // What bends the rod with no fish on is only what the line is dragging: the lure through the water (winding, a current, the boat
      // towing it) and how hard you're winding. A lure sinking in deep water on a tight line hangs nearly dead weight, so the rod stays easy.
      A.reelS = (A.reelS || 0) + ((btn ? 0.5 + 0.5 * fast : 0) - (A.reelS || 0)) * (1 - Math.exp(-dt * 6));
      const drag = clamp((L.spd || 0) / 2.5, 0, 1), most = 0.04 + 0.2 * drag + 0.14 * A.reelS + (A.flow || 0) * 0.03;
      if (A.phase === 'water') { tb = Math.min(most, Math.max(A.overS * 1.2, 0.5 * most * A.reelS)) + (S.lure ? 0.025 * S.lure.action * drag * Math.sin(A.t * 42) : 0);   // (a working lure throbs in the tip)
        if (btn) { A.crank = (A.crank || 0) + dt * (7 + 9 * fast); dp = 0.014 * Math.sin(A.crank); dyw = 0.008 * Math.cos(A.crank); }   // the rod rocks a touch with each turn of the handle…
        dp -= 0.05 * A.reelS; }   // …and dips toward the line while you wind
      if (A.phase === 'bite') { if (!(H && H.on)) this.biteStep(dt, press, btn); }   // a fish that set itself on the holder rod is held by rod-holder.js
      else if ((A.scanT = (A.scanT || 0) - dt) <= 0) { A.scanT = 0.25; this.lureScan(); }
    } else if (A.phase === 'fight') {
      const f = A.fish, ah = Math.atan2(f.y - A.hand[1], f.x - A.hand[0]); ty = P.a + clamp(Math.atan2(Math.sin(ah - P.a), Math.cos(ah - P.a)) - 0.1, -0.6, 0.5);
      tp = 0.42 + 0.2 * P.pitch; this.fightStep(dt, btn, press, fast); if (A.phase === 'fight') { tb = clamp(A.tension / Math.max(0.1, S.rod.line_lb.max * LB * 0.45), 0, 1); if (btn) { A.crank = (A.crank || 0) + dt * (5 + 6 * fast); dp = 0.05 * Math.sin(A.crank * 0.6); } }   // pump and wind: the rod lifts and drops as you gain line
    } else if (A.phase === 'card') { tp = 0.2; this.cardStep(dt); }
    if (H) { ty = H.yaw; tp = HOLDER_PITCH; if (A.phase === 'bite') tb = 0.2 + 0.12 * Math.sin(A.t * (H.on ? 9 : 16)); }   // standing in the holder; the tip nods while something has the bait
    else if (!helm && A.phase !== 'charge') { const aim = this.thirdP ? [P.a - 0.08, clamp(0.55 + 0.35 * P.pitch, 0.15, 1.1)] : this.rodAim(eye); ty = aim[0]; tp = aim[1]; }   // the rod points up the middle of the view, 75% of the way up (the wind-up swings it back)
    if (helm) { ty = bt.a + Math.PI - 0.25; tp = A.phase === 'fight' ? 0.75 : 0.55; if (A.phase === 'charge') tb = 0; }
    tp += dp; ty += dyw;
    const k = 1 - Math.exp(-dt * (A.phase === 'charge' && A.stroke != null ? 24 : A.phase === 'flight' && A.t - A.castAt < 0.5 ? 10 : 7));
    A.pitch += (tp - A.pitch) * k; A.yaw += Math.atan2(Math.sin(ty - A.yaw), Math.cos(ty - A.yaw)) * k;
    this.rodFlexStep(dt, tb);
    A.tip = this.rodTip(A);
    this.dangleStep(dt); this.ropeStep(dt);
  },
  // Where the hand goes: the rod's butt is planted just past the bottom-right corner of the view (whatever you look at
  // or the window shape) and the rod swings about it, so the bottom of the rod never rises into view while the reel
  // and the rest of the rod stay in frame.
  // the butt's planted spot in the world (low right, out of view) and the yaw / pitch that aim the rod from it into
  // the exact middle of the view
  rodButt(eye) {
    const P = this.P, cp = Math.cos(P.pitch), sp = Math.sin(P.pitch), ca = Math.cos(P.a), sa = Math.sin(P.a);
    const F = [ca * cp, sa * cp, sp], R = [-sa, ca, 0], U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
    // low on the right, well below the bottom of the view and close in, so you never see the end of the grip
    const W = this.canvas ? this.canvas.width : 16, H = this.canvas ? this.canvas.height : 9, tx = Math.tan(FOV / 2), ty = tx * H / W, d = 0.42, sx = 0.85, sy = -1.35;
    return { butt: [0, 1, 2].map(k => eye[k] + F[k] * d + R[k] * sx * tx * d + U[k] * sy * ty * d), F, U, ty };
  },
  rodAim(eye) {
    const { butt, F, U, ty } = this.rodButt(eye), D = 3, up = 0.5 * ty * D, v = [0, 1, 2].map(k => eye[k] + F[k] * D + U[k] * up - butt[k]);   // aim 75% of the way up the screen (halfway from centre to top)
    return [Math.atan2(v[1], v[0]), Math.atan2(v[2], Math.hypot(v[0], v[1]))];
  },
  handForReel(A, eye) {
    const { butt } = this.rodButt(eye), off = this.rodPoint(A, [-0.3, 0, 0], ZERO3), out = [butt[0] - off[0], butt[1] - off[1], butt[2] - off[2]];
    return out.every(Number.isFinite) ? out : [eye[0], eye[1], eye[2] - 0.5];
  },
  // A damped elastic blank: load bends it, release lets it recover with a small rebound.
  rodFlexStep(dt, target) {
    const A = this.ang, rate = { slow: 12, moderate: 15, fast: 19, extra_fast: 22 }[A.S.rod.action] || 18;
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    A.bendV = A.bendV || 0;
    for (let i = 0; i < steps; i++) {
      A.bendV += ((target - A.bend) * rate * rate - 1.5 * rate * A.bendV) * h;
      A.bend += A.bendV * h;
      if (A.bend < 0 || A.bend > 1) { A.bend = clamp(A.bend, 0, 1); A.bendV = 0; }
    }
  },
  // A constrained pendulum with explicit velocity, not displacement left over
  // from the previous render frame. The anchor follows the rod through substeps.
  dangleStep(dt) {
    const A = this.ang, T = A.tip;
    if (A.lure || A.phase === 'card') { A.dangle = null; return; }
    const hang = A.S.float ? 0.45 : 0.3, heavy = clamp(A.S.castG / 15, 0, 1);
    let D = A.dangle;
    if (!D || Math.hypot(D.x - T[0], D.y - T[1], D.z - T[2]) > 2) {
      D = A.dangle = { x: T[0], y: T[1], z: T[2] - hang, vx: 0, vy: 0, vz: 0, tip: T.slice() };
    }
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps, anchor = T.map((v, k) => D.tip[k] + (v - D.tip[k]) * t);
      const damping = Math.exp(-(8 + heavy * 2) * h);
      D.vx *= damping; D.vy *= damping; D.vz = D.vz * damping - 9.8 * h;
      D.x += D.vx * h; D.y += D.vy * h; D.z += D.vz * h;
      const dx = D.x - anchor[0], dy = D.y - anchor[1], dz = D.z - anchor[2], len = Math.hypot(dx, dy, dz) || 1;
      const n = [dx / len, dy / len, dz / len], av = T.map((v, k) => (v - D.tip[k]) / Math.max(dt, 1e-6));
      D.x = anchor[0] + n[0] * hang; D.y = anchor[1] + n[1] * hang; D.z = anchor[2] + n[2] * hang;
      const radial = (D.vx - av[0]) * n[0] + (D.vy - av[1]) * n[1] + (D.vz - av[2]) * n[2];
      D.vx -= radial * n[0]; D.vy -= radial * n[1]; D.vz -= radial * n[2];
    }
    D.tip = T.slice();
  },
  ropeStep(dt) {
    const A = this.ang, T = A.tip, L = A.lure, S = A.S;
    if (A.phase === 'card') { A.rope = null; return; }
    let end;
    if (!L && A.dangle) {
      const D = A.dangle, k = S.float ? 0.45 : 0.93;
      end = [T[0] + (D.x - T[0]) * k, T[1] + (D.y - T[1]) * k, T[2] + (D.z - T[2]) * k];
    } else if (L) { const Q = A.float || L; end = [Q.x, Q.y, Q.z]; }
    if (!end) { A.rope = null; return; }
    const N = 22, e = (N - 1) * 3, h = 1 / 120;
    let R = A.rope;
    // Reset only for a new cast or a teleport, not ordinary rod movement.
    if (!R || R.lure !== L || Math.hypot(...T.map((v, k) => v - R.tip[k])) > 8 || Math.hypot(...end.map((v, k) => v - R.end[k])) > 8) {
      R = A.rope = { p: new Float32Array(N * 3), o: new Float32Array(N * 3), wl: new Float32Array(N), g: new Float32Array(N), fx: new Float32Array(N), fy: new Float32Array(N), sx: new Float32Array(N).fill(Infinity), sy: new Float32Array(N), tip: T.slice(), end: end.slice(), lure: L, carry: 0, t: 0 };
      for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) R.p[i * 3 + k] = R.o[i * 3 + k] = T[k] + (end[k] - T[k]) * i / (N - 1);
    }
    const p = R.p, o = R.o;
    // lineOut measures the main line to the float; its hanging leader is separate.
    const chord = Math.hypot(end[0] - T[0], end[1] - T[1], end[2] - T[2]), len = L ? Math.max(chord, A.lineOut) : chord;
    R.length = len;
    if (!L) {   // nothing cast: a straight run from the tip to the dangle, no rope physics needed
      for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) p[i * 3 + k] = o[i * 3 + k] = T[k] + (end[k] - T[k]) * i / (N - 1);
      R.tip[0] = T[0]; R.tip[1] = T[1]; R.tip[2] = T[2]; R.end[0] = end[0]; R.end[1] = end[1]; R.end[2] = end[2]; R.carry = 0; return;
    }
    R.carry += Math.min(Math.max(dt, 0), 0.1);
    const steps = Math.floor((R.carry + 1e-9) / h); R.carry -= steps * h;
    const floats = S.line.material !== 'fluoro', wind = ENV.wind * 0.3, wa = ENV.windDir ?? 0.8;
    const hull = this.boat && !this.boatLineOut(this.boat, end.slice(), 0) ? this.boat : null;   // the line can't pass through your boat (a lure brought in under the hull: leave its line be)
    for (let st = 0; st < steps; st++) {
      const t = (st + 1) / steps, tip = T.map((v, k) => R.tip[k] + (v - R.tip[k]) * t), tail = end.map((v, k) => R.end[k] + (v - R.end[k]) * t);
      const seg = Math.max(len, Math.hypot(...tail.map((v, k) => v - tip[k]))) / (N - 1);
      const hx = tail[0] - tip[0], hy = tail[1] - tip[1], horizontal = Math.hypot(hx, hy);
      const sideX = horizontal > 1e-5 ? -hy / horizontal : 1, sideY = horizontal > 1e-5 ? hx / horizontal : 0;
      const sideDamping = Math.exp(-8 * h);
      R.t -= h;
      for (let i = 0; i < N; i++) {
        const j = i * 3, x = p[j], y = p[j + 1];
        if (R.t <= 0 || Math.hypot(x - R.sx[i], y - R.sy[i]) > 0.5) {
          sample(x, y); R.sx[i] = x; R.sy[i] = y; R.g[i] = hW(SE); R.wl[i] = SW > R.g[i] + 0.02 ? SW : -1e9;
          const flow = R.wl[i] > -1e8 ? flowAt(x, y, SK) : [0, 0]; R.fx[i] = flow[0]; R.fy[i] = flow[1];
        }
        if (i === 0 || i === N - 1) continue;
        const z = p[j + 2], wet = z < R.wl[i], speed = Math.hypot(x - o[j], y - o[j + 1], z - o[j + 2]) / h;
        const damping = Math.exp(-(wet ? 14 : 6 + 1.2 * Math.min(speed, 20)) * h);
        // Remove lingering sideways momentum without straightening away real
        // slack or fighting the downward sag and water-current forces.
        const sideways = ((x - o[j]) * sideX + (y - o[j + 1]) * sideY) * (1 - sideDamping);
        p[j] += (x - o[j] - sideways * sideX) * damping + (wet ? R.fx[i] * h * (1 - damping) : Math.cos(wa) * wind * h * h);
        p[j + 1] += (y - o[j + 1] - sideways * sideY) * damping + (wet ? R.fy[i] * h * (1 - damping) : Math.sin(wa) * wind * h * h);
        p[j + 2] += (z - o[j + 2]) * damping + (wet ? (floats ? 1.2 : -0.7) : -9.8) * h * h;
        if (wet && floats) p[j + 2] = Math.min(p[j + 2], R.wl[i] - 0.004);
        o[j] = x; o[j + 1] = y; o[j + 2] = z;
      }
      if (R.t <= 0) R.t = 0.1;
      p.set(tip, 0); p.set(tail, e);
      for (let it = 0; it < 40; it++) {
        for (let q = 0; q < N - 1; q++) {
          const i = it & 1 ? N - 2 - q : q, a = i * 3, b = a + 3;
          const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], d = Math.hypot(dx, dy, dz);
          if (d <= seg || d < 1e-6) continue;
          const wa2 = i === 0 ? 0 : 1, wb = i === N - 2 ? 0 : 1, correction = (d - seg) / (d * (wa2 + wb));
          if (wa2) { p[a] += dx * correction; p[a + 1] += dy * correction; p[a + 2] += dz * correction; }
          if (wb) { p[b] -= dx * correction; p[b + 1] -= dy * correction; p[b + 2] -= dz * correction; }
        }
        // Project collisions after constraints too: tightening must not push the
        // line back through the ground, and contact must not create bounce energy.
        for (let i = 1; i < N - 1; i++) { if (hull && (it & 3) === 3) this.boatLineOut(hull, p, i * 3, o); p[i * 3 + 2] = Math.max(p[i * 3 + 2], R.g[i] + 0.01); }
      }
      for (let i = 1; i < N - 1; i++) if (p[i * 3 + 2] <= R.g[i] + 0.011) {
        const j = i * 3; o[j] = p[j] - (p[j] - o[j]) * 0.7; o[j + 1] = p[j + 1] - (p[j + 1] - o[j + 1]) * 0.7; o[j + 2] = p[j + 2];
      }
    }
    if (steps) { R.tip = T.slice(); R.end = end.slice(); }
    p.set(T, 0); p.set(end, e);
  },
  castLure() {
    const A = this.ang, S = A.S, P = this.P, tip = this.rodTip(A);
    const helm = this.boat && this.boatMode !== 'deck', D = helm ? 10 + 30 * A.charge : S.castMax * (0.12 + 0.88 * A.charge ** 0.85), th = helm ? 0.45 : clamp(P.pitch + 0.42, 0.15, 0.95), spread = (Math.random() - 0.5) * 0.06 * (1 - S.sens * 0.5);
    // launch speed that carries it D metres, counting the drop from the rod tip down to the water
    const h = Math.max(0, tip[2] - P.z), ct = Math.cos(th), st = Math.sin(th), range = v => v * ct * (v * st + Math.sqrt(v * v * st * st + 2 * 9.8 * h)) / 9.8;
    let v = Math.sqrt(9.8 * D / Math.sin(2 * th)); for (let k = 0; k < 5; k++) v *= Math.sqrt(D / Math.max(0.1, range(v)));
    const a = (helm ? this.boat.a + Math.PI : P.a) + spread;   // from the helm you set the lure out behind the boat
    A.lure = { x: tip[0], y: tip[1], z: tip[2], vx: Math.cos(a) * Math.cos(th) * v, vy: Math.sin(a) * Math.cos(th) * v, vz: Math.sin(th) * v, kd: -1, wl: -1e4, spd: 0, dir: a, bottom: false, land: false };
    A.phase = 'flight'; A.castAt = A.t; A.lineOut = 0; A.float = null; A.bail = false; this.buzz(12);
    Game.emit('cast', { distance: D, rig: A.rig });
  },
  lureFlight(dt, press) {
    // Resolve the arc and surface impact in small steps so a slow frame cannot
    // skip over the shore or change the landing distance substantially.
    const steps = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < steps && this.ang.phase === 'flight'; i++) this.lureFlightStep(dt / steps, press && i === 0);
  },
  lureFlightStep(dt, press) {
    const A = this.ang, S = A.S, L = A.lure;
    if (press) { L.vx *= 0.25; L.vy *= 0.25; this.say('Feathered the cast', 1); }   // thumb the spool: drop it short
    const dr = Math.exp(-dt * 0.06), W = ENV.wind * 12, wa = ENV.windDir ?? 0.8, wk = 0.5 / Math.max(2, S.castG);   // a light bait blows about in the wind, a heavy lure barely
    L.vx = L.vx * dr + Math.cos(wa) * W * wk * dt; L.vy = L.vy * dr + Math.sin(wa) * W * wk * dt; L.vz -= 9.8 * dt; L.x += L.vx * dt; L.y += L.vy * dt; L.z += L.vz * dt; L.dir = Math.atan2(L.vy, L.vx);
    A.lineOut = Math.max(A.lineOut, Math.hypot(L.x - A.tip[0], L.y - A.tip[1], L.z - A.tip[2]));
    sample(L.x, L.y); const g = hW(SE), wl = SW, wet = wl > g + 0.04;
    if (wet && L.z <= wl) { // splashdown
      L.z = wl - 0.02; L.kd = SK; L.wl = wl; L.vx *= 0.12; L.vy *= 0.12; L.vz = 0; A.phase = 'water'; L.t = 0;   // it skids on a little
      const w = S.castG; this.addRipple(L.x, L.y, clamp(0.15 + w / 60, 0.15, 1)); this.disturb(L.x, L.y, clamp(w / 80, 0.06, 0.8));
      for (let k = 0; k < 4 + Math.min(20, w / 4); k++) this.spawn(DROP, L.x + this.rnd(-0.05, 0.05), L.y + this.rnd(-0.05, 0.05), wl, this.rnd(-0.5, 0.5), this.rnd(-0.5, 0.5), this.rnd(0.8, 1.8), this.rnd(0.3, 0.5), 0.025);
      if (S.float) { A.float = { x: L.x, y: L.y, z: wl, dip: 0, vx: L.vx, vy: L.vy, rot: L.dir }; L.vx = L.vy = 0; }
      A.lineOut = Math.hypot(L.x - A.tip[0], L.y - A.tip[1], L.z - A.tip[2]) + 0.3;
      this.say(`${Math.hypot(L.x - this.P.x, L.y - this.P.y).toFixed(0)} m${S.lure && S.lure.style === 'skirt' && this.boat && this.boatTrolls(this.boat.def) ? ' · now drive the boat to troll it' : S.float ? '' : S.sinkMs > 0 ? ' · let it sink, then reel' : ' · reel to work it'}`, 1.6);
    } else if (L.z <= g) { L.z = g + 0.01; L.vx = L.vy = L.vz = 0; L.land = true; L.kd = -1; L.t = 0; A.phase = 'water'; this.say('On the bank: reel it back', 1.5); }
  },
  // The lure (or bait) in the water: reeled, sinking, floating, diving, drifting in the current and the wind.
  // With a float the line is tied to the float: that's what the line pulls and the current carries; the bait hangs
  // under it and trails along behind.
  lureWater(dt, btn, fast) {   // fast 0..1: wind in up to 4x
    const A = this.ang, S = A.S, L = A.lure, T = A.tip, F = A.float, Q = F || L, ox = L.x, oy = L.y;
    if (A.phase === 'bite' && A.fish) return;
    if (btn) { const v = S.reelMs * (0.5 + 1.5 * fast); A.lineOut = Math.max(0, A.lineOut - v * dt); A.reeling = true; }
    if (A.bail) A.lineOut = Math.max(A.lineOut, Math.hypot(Q.x - T[0], Q.y - T[1], Q.z - T[2]) + 0.2);   // bail open: line peels off the spool, nothing holds the lure back
    sample(L.x, L.y); let g = hW(SE), wl = SW; const wet = !L.land && SK === L.kd && wl > g + 0.03;
    // A tight line pulls toward the rod tip; the water (or the ground) resists, so it comes with a lag and keeps a
    // little way on when the pull stops. Sideways only: depth is the lure's own business.
    const dz = Q.z - T[2], dx = Q.x - T[0], dy = Q.y - T[1], dh = Math.hypot(dx, dy), allow = Math.sqrt(Math.max(0, A.lineOut * A.lineOut - dz * dz)), over = dh - allow;
    const pulled = over > 0.02; A.over = Math.max(0, over);   // how hard the line is loaded (bends the rod)
    Q.vx = Q.vx || 0; Q.vy = Q.vy || 0;
    if (over > 0 && dh > 1e-4) { const k = 30 * over; Q.vx -= dx / dh * k * dt; Q.vy -= dy / dh * k * dt; }
    if (wet && (F || (S.lure && S.lure.buoyant && L.surface)) && L.kd !== RIVER && L.kd !== CREEK) {   // the wind pushes whatever floats across still water (about 2.5% of its speed)
      const W = ENV.wind * 12, wa = ENV.windDir ?? 0.8, acc = 3.2 * 0.025 * W; Q.vx += Math.cos(wa) * acc * dt; Q.vy += Math.sin(wa) * acc * dt; }
    { const e = Math.exp(-(wet ? 3.2 : 7) * dt); Q.vx *= e; Q.vy *= e; Q.x += Q.vx * dt; Q.y += Q.vy * dt; }
    { // the line only stretches so far (mono more than braid): past that, it has to come
      const ex = Q.x - T[0], ey = Q.y - T[1], ed = Math.hypot(ex, ey), mx = allow + 0.12 + A.lineOut * 0.04 * Math.min(1, S.line.stretch * 4);
      if (ed > mx && ed > 1e-4) { const s2 = mx / ed; Q.x = T[0] + ex * s2; Q.y = T[1] + ey * s2; const vr = (Q.vx * ex + Q.vy * ey) / ed; if (vr > 0) { Q.vx -= vr * ex / ed; Q.vy -= vr * ey / ed; } } }
    // current: a drifting float, bait or lure moves with the water unless the sinker grips the bottom
    A.flow = 0;
    if (wet && (L.kd >= RIVER || L.kd === OCEAN)) { const fl = flowAt(Q.x, Q.y, L.kd), hold = L.bottom && !F ? S.grip : 0; A.flow = fl[2] * (1 - hold);
      if (fl[2] > 0.03 && hold < fl[2]) { Q.x += fl[0] * (1 - hold) * dt * 0.8; Q.y += fl[1] * (1 - hold) * dt * 0.8; } }
    if (F) { const k = Math.min(1, dt * 3.5); L.x += (F.x - L.x) * k; L.y += (F.y - L.y) * k; }   // the bait swings along under the float
    if (!wet) { // on land or in the shallows at your feet: comes straight back
      if (Math.hypot(Q.x - T[0], Q.y - T[1]) < Math.max(1.5, S.rodLen * 0.7) || A.lineOut < S.rodLen * 0.5 + 1) { this.lureHome(); return; }
      L.z = Math.max(g + 0.01, Math.min(L.z, wl)); L.kd = SK; L.wl = wl; L.ground = g; L.land = !(wl > g + 0.03); if (F) { F.z = Math.max(L.z, wl); } return;
    }
    const spd = Math.hypot(L.x - ox, L.y - oy) / Math.max(dt, 1e-3); L.spd += (spd - L.spd) * Math.min(1, dt * 4); if (spd > 0.02) L.dir = Math.atan2(L.y - oy, L.x - ox);
    sample(L.x, L.y); g = hW(SE); wl = SW; L.wl = wl; L.ground = g;
    if (SK !== L.kd || wl < g + 0.03) { if (A.reeling || pulled) { L.land = true; L.z = Math.max(g + 0.01, L.z); return; } L.x = ox; L.y = oy; if (F) { F.x = ox; F.y = oy; F.vx = F.vy = 0; } sample(ox, oy); g = hW(SE); wl = SW; }   // dragged up onto the bank by the line; the current alone can't push it ashore
    // depth
    const lo = g + 0.03, hi = wl - 0.015, lu = S.lure;
    // the line pulls along itself, so up as well as in: the steeper it climbs to the rod tip, the less a lip can dig
    // and the more a reeled lure is lifted (a crankbait comes up as it nears you instead of skating in deep)
    const upL = T[2] - L.z, steep = !F && pulled ? Math.max(0, upL / (Math.hypot(L.x - T[0], L.y - T[1], upL) || 1)) : 0;
    let vz;
    if (F) { const want = Math.max(lo, wl - S.floatDepth); vz = clamp((want - L.z) * 3 + L.spd * 0.6, -Math.max(0.15, S.sinkMs * 1.5), 0.6); }   // towed along, the bait swings up
    else if (lu) {
      if (lu.buoyant) vz = lu.dive_m > 0 && L.spd > 0.08 ? clamp(((wl - lu.dive_m * Math.min(1, L.spd / lu.speed_ms.best) * (1 - steep)) - L.z) * 2.5, -0.9, 0.5) : 0.25;
      else vz = -lu.sink_ms + lu.lift * L.spd;
      if (lu.style === 'jig' && A.reeling && Math.sin(A.t * 6) > 0.4) vz += 0.6;   // hop, hop
    } else vz = S.sinkMs > 0 ? -S.sinkMs : 0.2;
    vz += steep * L.spd * 1.6;
    L.z = clamp(L.z + vz * dt, lo, hi); L.bottom = L.z <= lo + 0.005; L.surface = L.z >= hi - 0.005;
    if (F) { // the float rides the surface: bobbing on the chop, sitting lower the more weight hangs from it (too much sinks it), dipped by a bite
      F.dip = Math.max(0, F.dip - dt * 2);
      const r = S.float.size_mm / 2000, load = clamp(S.sinkW / S.float.buoyancy_g, 0, 1.6), wav = WATER[L.kd].wave * (0.55 + 1.1 * ENV.wind), t = this.time;
      const bob = (0.004 + 0.03 * wav * wav) * Math.sin(t * 2.1 + F.x * 0.7) + 0.012 * wav * Math.sin(t * 3.4 + F.y * 1.3 + F.x * 0.4);
      F.z = wl + r * (S.float.kind === 'fixed' ? 0.3 - 1.1 * load : 0.6 - 1.4 * load) - F.dip * 0.05 + bob;
      F.spd = Math.hypot(F.vx, F.vy); if (F.spd > 0.05) F.rot = Math.atan2(F.vy, F.vx);
      if (F.spd > 0.25 && (F.wakeT = (F.wakeT || 0) - dt) <= 0) { F.wakeT = 0.35; this.addRipple(F.x, F.y, 0.12); }   // a little wake when it's pulled along
    }
    // Current and sinking happen after the horizontal retrieve solver. Enforce
    // paid-out length here too, so they cannot silently create extra line (unless the bail is open: then they do).
    if (A.bail) A.lineOut = Math.max(A.lineOut, Math.hypot(Q.x - T[0], Q.y - T[1], Q.z - T[2]) + 0.2);
    else A.lineOut = Math.min(A.lineOut, Math.hypot(Q.x - T[0], Q.y - T[1], Q.z - T[2]) + 0.3);   // bail shut: a float the wind blows (or you walk) toward you leaves no pile of slack
    this.limitLineReach(Q);
    // a popper spits, a skirt smokes, a spinner thumps: surface commotion now and then
    if (lu && L.surface && L.spd > 0.12 && lu.noise > 0.3 && (L.popT = (L.popT || 0) - dt) <= 0) {
      L.popT = lu.style === 'skirt' ? 0.15 : 0.55; L.noisy = this.time; this.addRipple(L.x, L.y, 0.2 + 0.2 * lu.noise);
      for (let k = 0; k < 5; k++) this.spawn(DROP, L.x + this.rnd(-0.05, 0.05), L.y + this.rnd(-0.05, 0.05), wl + 0.01, Math.cos(L.dir) * 0.6 + this.rnd(-0.4, 0.4), Math.sin(L.dir) * 0.6 + this.rnd(-0.4, 0.4), this.rnd(0.5, 1.3), this.rnd(0.25, 0.45), 0.02);
    }
    L.t += dt;
    if (A.reeling && (Math.hypot(Q.x - T[0], Q.y - T[1], Math.max(0, T[2] - Q.z - 2.5)) < Math.max(1.2, S.rodLen * 0.6) || A.lineOut < S.rodLen * 0.5 + 1)) this.lureHome();   // a lure hanging deep under the tip still has to be wound up
  },
  limitLineReach(Q) {
    const A = this.ang, T = A.tip, dx = Q.x - T[0], dy = Q.y - T[1], dz = Q.z - T[2], d = Math.hypot(dx, dy, dz);
    const max = Math.max(0.05, A.lineOut) * (1 + A.S.line.stretch * 0.12) + 0.06;
    A.over = Math.max(A.over || 0, d - A.lineOut);
    if (d <= max) return;
    if (Q === A.float) {
      const horizontal = Math.hypot(dx, dy), allowed = Math.sqrt(Math.max(0, max * max - dz * dz));
      if (horizontal > 1e-6) { Q.x = T[0] + dx * allowed / horizontal; Q.y = T[1] + dy * allowed / horizontal; }
    } else { const k = max / d; Q.x = T[0] + dx * k; Q.y = T[1] + dy * k; Q.z = T[2] + dz * k; }
    const radial = ((Q.vx || 0) * dx + (Q.vy || 0) * dy) / (Math.hypot(dx, dy) || 1);
    if (radial > 0) { const horizontal = Math.hypot(dx, dy) || 1; Q.vx -= radial * dx / horizontal; Q.vy -= radial * dy / horizontal; }
  },
  // G: open or close the bail once the lure is in the water, so it sinks straight down (to the bottom of deep water) instead of swinging back on a fixed length of line
  toggleBail() { const A = this.ang; if (!A || !A.out) return;
    if (A.phase === 'ready' && !A.lure && !(this.boat && this.boatMode !== 'deck')) return this.dropLure();
    if (!A.lure || (A.phase !== 'water' && A.phase !== 'bite')) return;
    A.bail = !A.bail; this.say(A.bail ? 'Bail open: line pays out (reel to close it)' : 'Bail closed', 1.5); },
  // open the bail with the rig hanging: it drops straight down from the rod tip (counts as a cast), line paying out
  dropLure() {
    const A = this.ang, tip = this.rodTip(A);
    A.lure = { x: tip[0], y: tip[1], z: tip[2] - 0.05, vx: 0, vy: 0, vz: 0, kd: -1, wl: -1e4, spd: 0, dir: this.P.a, bottom: false, land: false };
    A.phase = 'flight'; A.castAt = A.t; A.lineOut = 0; A.float = null; A.bail = true; A.dangle = null;
    this.say('Bail open: dropping it straight down', 1.5); Game.emit('cast', { distance: 0, rig: A.rig, drop: true });
  },
  lureHome() { const A = this.ang; A.phase = 'ready'; A.lure = null; A.float = null; A.lineOut = 0; A.bail = false;
    for (const f of this.fish) if (f.state === 'lure') { f.state = 'rest'; f.tNext = 0.5; f.lureCool = this.time + 10; } },
  lureZone(L) { const dep = L.wl - L.ground; return L.wl - L.z < Math.min(0.35, dep * 0.3) ? 'surface' : L.z - L.ground < Math.min(0.35, dep * 0.3) ? 'bottom' : 'mid'; },
});
