'use strict';
// FISHING: the fight, losing or landing the fish, the catch card and the catch log.
Object.assign(Engine, {
  startFight(f) {
    const A = this.ang, S = A.S, Fi = f.def.fight, W = f.weightKg;
    A.phase = 'fight'; f.hooked = 'fight'; A.energy = 1; A.fdist = Math.max(1, Math.hypot(f.x - A.tip[0], f.y - A.tip[1], f.z - A.tip[2])); A.lineOut = Math.max(A.lineOut, A.fdist);
    A.Fmax = clamp(W ** 0.85 * (0.45 + 1.1 * Fi.strength), 0.03, 400); A.Tfight = 4 + 32 * Fi.stamina * (1 + 0.55 * Math.log10(1 + W)); A.th = Math.atan2(f.y - A.tip[1], f.x - A.tip[0]);
    A.runT = 0.6 + 1.5 * Math.random() * Fi.runs; A.runDir = A.th + (Math.random() - 0.5) * 0.8; A.chargeT = 0; A.slackT = 0; A.jump = null; A.sv = 0; A.dragBuzz = 0; A.tension = 0; A.hookedAt = this.time;
    A.lastTip = A.tip.slice(); A.away = 0;
    A.fz = f.z; this.buzz([70, 40, 140]); this.say(`Fish on! ${this.touchUI ? 'Hold Reel' : 'Hold ' + Controls.key('cast')} when it stops pulling, ease off when it runs`, 3); Game.emit('hooked', f);
  },
  fightStep(dt, btn, press, fast) {
    const A = this.ang, S = A.S, f = A.fish, T = A.tip;
    if (!f || f.dead) { this.loseFish(f && f.eatenBy ? 'Something bigger ate your fish!' : 'Gone', 'eaten'); return; }
    const D = f.def, Fi = D.fight, B = D.behavior, W = f.weightKg, rnd = Math.random;
    // what the fish does: runs, swims at you (slack!), jumps, head-shakes; less of everything as it tires
    if (A.runT > 0) A.runT -= dt;
    else if (A.energy > 0.2 && rnd() < dt * (0.05 + 0.3 * Fi.runs) * A.energy) { A.runT = 0.6 + 3 * rnd() * (0.3 + Fi.runs) * A.energy; A.runDir = A.th + (rnd() - 0.5) * 1.4; this.buzz(60); }
    if (A.chargeT > 0) A.chargeT -= dt; else if (A.runT <= 0 && A.energy > 0.25 && rnd() < dt * 0.05 * (0.2 + Fi.runs)) A.chargeT = 0.8 + 1.4 * rnd();
    if (!A.jump && A.energy > 0.25 && Fi.jumps > 0 && !D._benthic && rnd() < dt * 0.09 * Fi.jumps * A.energy) { const h = clamp(0.25 + f.len * (0.3 + 0.8 * rnd()), 0.25, 3.5); A.jump = { vz: Math.sqrt(2 * 9.8 * h), z: f.wl - f.len * 0.2, peak: false }; this.buzz([30, 30, 30]); }
    let pull = A.Fmax * (0.1 + 0.9 * A.energy) * (A.runT > 0 ? 1 : 0.4) * (1 + 0.18 * Math.sin(this.time * (8 + 6 * Fi.strength)) * (0.5 + A.energy));
    if (A.chargeT > 0) pull = 0;
    { // a moving boat (or you walking off) tows the fish: that loads the line too
      const lt = A.lastTip || T, vx = (T[0] - lt[0]) / Math.max(dt, 1e-3), vy = (T[1] - lt[1]) / Math.max(dt, 1e-3), dx = T[0] - f.x, dy = T[1] - f.y, dl = Math.hypot(dx, dy) || 1;
      A.lastTip = T.slice(); const away = Math.max(0, (vx * dx + vy * dy) / dl); A.away = A.away == null ? away : A.away + (away - A.away) * Math.min(1, dt * 6); if (away > 0.15) { pull += A.Fmax * 0.4 * Math.min(3, away) + 0.05 * away; A.chargeT = 0; } }
    const vr = S.reelMs * (0.85 + 0.4 * fast), reel = btn, swimV = (A.runT > 0 ? B.burst_bl_s * 0.45 : B.cruise_bl_s * 1.5) * f.len + 0.2;
    let Tn, slipping = false;
    const lag = Math.max(0, Math.hypot(f.x - T[0], f.y - T[1], f.z - T[2]) - A.lineOut - 0.25);   // the rod pulled faster than the fish can be moved
    if (A.chargeT > 0) { // swimming at you: the line goes slack unless you reel it in
      A.fdist = Math.max(0.8, A.fdist - swimV * 0.8 * dt); if (reel) { A.lineOut = Math.max(A.fdist, A.lineOut - vr * 1.4 * dt); A.reeling = true; }
      Tn = A.lineOut - A.fdist < 0.25 ? A.Fmax * 0.15 : 0;
    } else if (pull > A.dragKg) { // it out-pulls the drag: line peels off
      const vout = Math.min(B.burst_bl_s * f.len * 0.8 + 0.3, Math.sqrt((pull - A.dragKg) / Math.max(0.1, W)) * 3.2);
      A.lineOut += vout * dt; A.fdist = A.lineOut; Tn = A.dragKg * (reel ? 1.12 : 1); slipping = true;
    } else {
      if (A.fdist < A.lineOut) A.fdist = Math.min(A.lineOut, A.fdist + swimV * dt);   // swimming away takes up the slack
      if (reel) { A.reeling = true; const u = (1 - pull / A.dragKg) ** 0.7, gain = vr * u; A.lineOut = Math.max(0.5, A.lineOut - gain * dt); A.fdist = Math.min(A.fdist, A.lineOut); Tn = Math.min(A.dragKg, pull + A.Fmax * 0.35 * u + 0.02); }   // dragging it through the water
      else Tn = pull * 0.85;
      if (A.lineOut - A.fdist > 0.3) Tn = 0;
    }
    if (A.jump) { // airborne: a tight line on a jump is how hooks get thrown
      const J = A.jump; J.vz -= 9.8 * dt; J.z += J.vz * dt; Tn = reel ? Tn * 1.5 : Tn * 0.4;
      if (!J.peak && J.vz < 0) { J.peak = true; if (rnd() < (1 - S.hold) * (reel ? 1.3 : 0.3)) { this.loseFish('It jumped and threw the hook!', 'thrown'); return; } }
      if (J.vz < 0 && J.z < f.wl - f.len * 0.2) { this.splash(f.x, f.y, f.wl, 10 + Math.min(40, W * 4)); this.addRipple(f.x, f.y, 0.4 + f.len); A.jump = null; this.buzz(40); }
    }
    Tn *= 1 + (S.shock - 1) * (A.runT > 0 || A.jump ? 1 : 0.25);
    Tn += lag * (A.Fmax * 0.6 + 0.3) * (1.6 - Math.min(1, S.line.stretch * 4) * 0.6);   // a sharp sweep shock-loads the line (stretchy mono forgives more)
    A.tension += (Tn - A.tension) * (1 - Math.exp(-dt * 12));
    if (slipping && (A.dragBuzz -= dt) <= 0) { A.dragBuzz = 0.12; this.buzz(10); }
    // what can go wrong
    if (A.tension > S.strengthKg) { this.loseFish(S.weakest === 'rod' ? 'Crack! The rod broke' : `Snap! The ${S.weakest} broke`, 'snap'); return; }
    if (A.lineOut > S.capM) { this.loseFish('Spooled! It took every metre of line', 'snap'); return; }
    if ((Fi.teeth || 0) > 0 && rnd() < dt * Fi.teeth * 0.03 * (1 - S.abrasion)) { this.loseFish(`Bitten off! ${S.leader && S.leader.material === 'wire' ? '' : 'A wire leader stops that'}`, 'snap'); return; }
    if (A.tension < A.Fmax * 0.04 + 0.02) A.slackT += dt; else A.slackT = Math.max(0, A.slackT - dt * 2);
    if ((A.slackT > 1 && rnd() < dt * (1 - S.hold) * 1.6) || rnd() < dt * (1 - S.hold) * 0.012) { this.loseFish(A.slackT > 1 ? 'Slack line: the hook fell out' : 'The hook pulled free', 'thrown'); return; }
    // tiring: working against the line wears it down; a slack line lets it rest
    A.energy = clamp(A.energy - dt / A.Tfight * 1.5 * (A.tension / A.Fmax + 0.5 * pull / A.Fmax * (A.runT > 0 ? 1 : 0.4)) + (A.tension < 0.15 * A.Fmax && A.runT <= 0 ? dt * 0.012 : 0), 0, 1);
    // where it is: on the end of the line, swinging round the rod tip
    A.sv += ((rnd() - 0.5) * 2.5 - A.sv * 0.6) * dt; if (A.runT > 0) A.sv += Math.atan2(Math.sin(A.runDir - A.th), Math.cos(A.runDir - A.th)) * dt * 0.8;
    const side = clamp(A.sv, -1, 1) * swimV, oth = A.th; A.th += side / Math.max(2, A.fdist) * dt;
    const bot = fishFloor(D, f.wl, f.ground) + Math.max(0.02, -D._zmin * f.len) + 0.02, top = f.wl - 0.08;
    let tz = A.runT > 0 && (B.depth_zone.bottom || 0) > 0.3 ? bot : A.energy < 0.3 ? top - 0.1 : (f.z + (f.ground + f.wl) / 2) / 2;
    if (A.jump) A.fz = A.jump.z; else A.fz = clamp(A.fz + clamp(tz - A.fz, -0.8 * dt, 0.8 * dt), bot, Math.max(bot, top));
    const place = th => { const ph = Math.sqrt(Math.max(0, A.fdist * A.fdist - (T[2] - A.fz) ** 2)); return [T[0] + Math.cos(th) * ph, T[1] + Math.sin(th) * ph]; };
    let [nx, ny] = place(A.th); sample(nx, ny);
    const wet = (x, y) => { sample(x, y); return SK === f.kd && SW - hW(SE) > Math.max(0.12, f.len * 0.25); };
    if (A.lineOut > 2.5 && !wet(nx, ny)) { // the shore's in the way: it swims round, along the bank
      let ok = false; for (const o of [0.2, -0.2, 0.45, -0.45, 0.8, -0.8, 1.2, -1.2]) { const q = place(oth + o); if (wet(q[0], q[1])) { A.th = oth + o; [nx, ny] = q; ok = true; break; } }
      if (!ok) {
        A.th = oth; A.sv = -A.sv;
        if (Math.hypot(f.x - T[0], f.y - T[1], f.z - T[2]) > A.fdist + 0.3) { [nx, ny] = place(oth); A.dragged = true; }   // you're walking off: the line drags it through the shallows
        else { nx = f.x; ny = f.y; A.fdist = Math.min(A.lineOut, Math.max(1, Math.hypot(f.x - T[0], f.y - T[1], f.z - T[2]))); }
      }
      sample(nx, ny);
      if (A.dragged && (SK !== f.kd || SW - hW(SE) < Math.max(0.05, f.len * 0.12))) { f.x = nx; f.y = ny; f.z = Math.max(hW(SE), f.z); f.wl = SW; this.say('Dragged it up the bank!', 2); this.landFish(); return; }
    }
    { // it gets there swimming (or towed) at a pace, not instantly
      const towed = !!A.dragged, mx = nx - f.x, my = ny - f.y, ml = Math.hypot(mx, my), cap = (swimV * 1.6 + 0.8 + (towed ? 2 : 0) + (A.runT > 0 ? 0 : (A.away || 0) * 1.3)) * dt;   // towed along when you walk off (unless it's running against the drag)
      if (ml > cap) { nx = f.x + mx / ml * cap; ny = f.y + my / ml * cap; sample(nx, ny); if (SK !== f.kd && !towed) { nx = f.x; ny = f.y; sample(nx, ny); } } }
    A.dragged = false;
    const mv = Math.hypot(nx - f.x, ny - f.y); if (mv > 1e-3) f.a = Math.atan2(ny - f.y, nx - f.x) * 0.3 + (A.th + (A.chargeT > 0 ? Math.PI : 0)) * 0.7;
    f.x = nx; f.y = ny; f.wl = SW; f.ground = Math.min(hW(SE), SW - 0.05); f.z = A.jump ? A.jump.z : A.fz; f.spd = 2 + 4 * A.energy; f.ph = (f.ph + dt * (6 + 10 * A.energy * (A.runT > 0 ? 1.5 : 1))) % 6.2832;
    f.pitch = A.jump ? clamp(Math.atan2(A.jump.vz, 3), -1, 1) : 0; f.open = 0.3; f.land = false;
    const L = A.lure; L.x = f.x + Math.cos(f.a) * f.len * 0.48; L.y = f.y + Math.sin(f.a) * f.len * 0.48; L.z = f.z; L.wl = f.wl;
    if (A.float) { A.float.x = L.x; A.float.y = L.y; A.float.z = Math.max(f.z, f.wl - 0.05); }
    // landing it: once it's close and beaten
    const landD = clamp(S.rodLen * 0.5 + 0.9, 1.3, 3.2);
    if (A.lineOut < landD) {
      if (A.energy < 0.3 || W < 0.15) { this.landFish(); return; }
      A.lineOut = landD + 0.6; A.fdist = A.lineOut; A.runT = 0.8 + 2 * A.energy; A.runDir = A.th; this.buzz(80); this.say('Not done yet!', 1.2);
    }
  },
  loseFish(msg, why) {
    const A = this.ang, f = A.fish;
    if (f && !f.dead) { f.hooked = false; f.state = 'flee'; f.stress = 1; f.thx = A.tip[0]; f.thy = A.tip[1]; f.tNext = 0; f.lureCool = this.time + 120; f.land = false; f.pitch = 0; f.roll = 0;
      if (f.z > f.wl - 0.05) f.z = f.wl - Math.max(0.1, f.len * 0.3); }
    if (A.land) { A.land = null; const el = document.getElementById('catch'); if (el) el.hidden = true; }   // it was already landed (the rod put away with the fish still on the bank)
    A.fish = null; A.jump = null; A.tension = 0; this.buzz(why === 'snap' ? [120] : [30, 60, 30]);
    if (why === 'snap' || why === 'eaten' || !A.lure || why === 'drop') { A.phase = A.out ? 'ready' : 'stowed'; A.lure = null; A.float = null; A.lineOut = 0; if (why === 'snap' && A.out) msg += ' · tied on a new one'; }
    else { A.phase = 'water'; A.lineOut = Math.hypot(A.lure.x - A.tip[0], A.lure.y - A.tip[1], A.lure.z - A.tip[2]) + 0.2; if (A.S.bait) A.baitLeft = 0; if (A.float) A.float.vx = A.float.vy = 0; }
    this.say(msg, 3); Game.emit('lost', f, why);
  },
  // Landed: no menu. The fish comes in on the line, swung up onto the bank or the deck in front of you (one too big to
  // lift stays in the water alongside); Use unhooks it, and then it is in your hands (hands.js: Engine.carry) to walk
  // about with, lip or hold as its definition allows, drop, or keep. A.land: { st: 'swing' | 'down' | 'unhook' | 'free' }
  landFish() {
    const A = this.ang, f = A.fish, P = this.P;
    A.phase = 'card'; f.hooked = 'card'; f.held = true; this.keys = {}; this.joy = this.tlook = null; this.resetMouseLook(); A.landed = { x: f.x, y: f.y, kd: f.kd };
    A.lure = null; A.float = null; A.lineOut = 0; A.tension = 0; this.buzz([50, 50, 50]);
    const best = this.catchLog().filter(c => c.species === f.species).reduce((m, c) => Math.max(m, c.kg), 0);
    A.card = { pb: f.weightKg > best, first: best === 0 };
    const hd = fishHandling(f.def), big = hd.hold === 'none';
    // where it comes down: dry ground (or the deck) within reach, in front if there is any, else to a side, else at your feet in the shallows
    let spot = null, boatSpot = null;
    if (big) spot = [f.x, f.y, f.z];
    else if (this.boat) {   // on the deck at your feet, inside the gunwales; kept in the boat's own frame so it rides with her
      const b = this.boat, D = b.def, S = D._shape, L = D.hull.length_m, cb = Math.cos(b.a), sb = Math.sin(b.a), wx = P.x + Math.cos(P.a) * 0.5 - b.x, wy = P.y + Math.sin(P.a) * 0.5 - b.y;
      const lx = clamp(cb * wx + sb * wy, -L * 0.42, L * 0.42), hb = S.hb(lx / L + 0.5) * 0.6, ly = clamp(-sb * wx + cb * wy, -hb, hb);
      boatSpot = { b, lx, ly }; spot = [b.x + cb * lx - sb * ly, b.y + sb * lx + cb * ly, b.z + this.boatDeckZ(D, lx, ly)]; }
    else { const d = clamp(0.5 + f.len * 0.25, 0.55, 0.85);
      for (const o of [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2, Math.PI]) { const x = P.x + Math.cos(P.a + o) * d, y = P.y + Math.sin(P.a + o) * d; sample(x, y); const g = hW(SE);
        if (SW <= g + 0.03 && Math.abs(g - P.z) < 0.7) { spot = [x, y, g]; break; } }
      if (!spot) { const x = P.x + Math.cos(P.a) * 0.6, y = P.y + Math.sin(P.a) * 0.6; sample(x, y); spot = [x, y, Math.max(hW(SE), SW - 0.04)]; } }
    A.land = { st: 'swing', t: 0, from: [f.x, f.y, f.z], spot, boatSpot, big, hooked: true, pitch0: P.pitch, side: Math.random() < 0.5 ? 1 : -1, hop: 0 };
    f.land = !big;
    const kg = f.weightKg, wt = kg < 1 ? `${(kg * 1000).toFixed(0)} g` : `${kg.toFixed(2)} kg`;
    this.say(`${f.name} · ${f.lengthCm.toFixed(1)} cm · ${wt}${A.card.first ? ' · first of its kind!' : A.card.pb ? ' · personal best!' : ''}`, 4);
    Game.emit('landed', f);
  },
  unhookFish() { const H = this.ang && this.ang.land; if (!H || H.st !== 'down') return; H.st = 'unhook'; H.t = 0; },
  // bend down to something on the ground: the eye goes forward and down to about half a metre from it (u: 0 standing .. 1 down).
  // Held only while it keeps being called; let go, you straighten up again (hands.js).
  crouchTo(t, u) { const P = this.P, dx = t[0] - P.x, dy = t[1] - P.y, d = Math.hypot(dx, dy) || 1, k = Math.max(0, d - 0.4) / d;
    this.eyeOff = [clamp(dx * k, -1.3, 1.3) * u, clamp(dy * k, -1.3, 1.3) * u, clamp(t[2] + 0.5 - (P.z + EYE), -1.3, 0) * u]; this.eyeHold = this.time + 0.12; },
  // where the hook is: the tip of the snout, wherever the fish is pointing
  fishMouth(f) { const cp = Math.cos(f.pitch || 0), k = f.len * 0.49; return [f.x + Math.cos(f.a) * cp * k, f.y + Math.sin(f.a) * cp * k, f.z + Math.sin(f.pitch || 0) * k]; },
  // how much of a fish lying on its side is under its midline, and which way up it lies
  fishLie(f, side = 1) { const B = f.def.body, flat = !!B.lie; return { half: f.len * (flat ? B.height * 0.12 : B.width * 0.5) * 0.9, roll: flat ? 0 : side * Math.PI / 2 }; },
  // flopping where it lies: a burst of tail-beats and a hop, then still, gills going. o: { hop } kept between frames; k: how lively (0..1)
  fishFlop(f, o, dt, k = 1) { const beat = Math.max(0, Math.sin(this.time * 2.1 + f.len * 9)) ** 6 * k;
    o.hop = Math.max(0, (o.hop || 0) + (beat * 0.07 - (o.hop || 0)) * Math.min(1, dt * 14)); f.pitch = 0.12 * beat * Math.sin(this.time * 31);
    f.ph = (f.ph + dt * (1.5 + 26 * beat)) % 6.2832; f.open = 0.35 + 0.3 * Math.abs(Math.sin(this.time * 3.2)); return o.hop; },
  cardStep(dt) {
    const A = this.ang, f = A.fish, P = this.P, H = A.land; if (!f || !H) { A.phase = A.out ? 'ready' : 'stowed'; A.land = null; return; }
    const B = f.def.body, ez = u => u * u * (3 - 2 * u), lie = this.fishLie(f, H.side), half = lie.half;
    if (H.boatSpot) { const q = H.boatSpot, b = q.b, cb = Math.cos(b.a), sb = Math.sin(b.a); H.spot = [b.x + cb * q.lx - sb * q.ly, b.y + sb * q.lx + cb * q.ly, b.z + this.boatDeckZ(b.def, q.lx, q.ly) + Math.sin(b.pitch || 0) * q.lx]; }   // the deck moves
    const E = this.thirdP && this.camE ? this.camE : [P.x, P.y, P.z + EYE];
    H.t += dt; let look = null;   // the point the view turns to
    if (H.st === 'swing') {   // up out of the water on the line and down in front of you
      const u = Math.min(1, H.t / (H.big ? 0.5 : 1.05)), e = ez(u), S0 = H.from, S1 = H.spot;
      if (H.big) { f.z = S0[2]; f.ph = (f.ph + dt * 5) % 6.2832; }
      else { f.x = S0[0] + (S1[0] - S0[0]) * e; f.y = S0[1] + (S1[1] - S0[1]) * e; f.z = S0[2] + (S1[2] + half - S0[2]) * e + Math.sin(Math.PI * u) * (H.boatSpot ? 0.85 : 0.65);
        const lift = ez(clamp(u / 0.3, 0, 1)), over = ez(clamp((u - 0.3) / 0.7, 0, 1));   // head up on the line first, then one turn tail-over-head as it comes in
        f.pitch = u >= 1 ? 0 : 1.15 * lift + 6.2832 * over - 1.15 * over; f.roll = lie.roll * ez(clamp((u - 0.7) / 0.3, 0, 1)); f.a = P.a + Math.PI / 2 * e; f.ph = (f.ph + dt * 18) % 6.2832; }
      f.open = 0.5; look = [f.x, f.y, f.z];
      if (u >= 1) { H.st = 'down'; H.t = 0; if (!H.big) this.buzz(30); }
    } else {   // 'down' | 'unhook' | 'free'
      if (H.st === 'unhook' && !H.big) {   // down to it where it lies: the rod is laid aside, one hand pins the fish, the other works the hook out (drawArms)
        const hop = this.fishFlop(f, H, dt, 0.12); f.x = H.spot[0]; f.y = H.spot[1]; f.z = H.spot[2] + half + hop * 0.3; f.roll = lie.roll; f.open = 0.6;
        this.crouchTo([f.x, f.y, H.spot[2]], ez(Math.min(1, H.t / 0.7))); H.hooked = H.t < 1.95; look = [f.x, f.y, f.z];
      } else if (H.big) {   // alongside, held at the surface on a short line
        f.z += (f.wl - Math.max(0.06, f.len * B.height * 0.3) - f.z) * Math.min(1, dt * 3); f.ph = (f.ph + dt * (2 + 2 * Math.max(0, Math.sin(this.time * 1.3)))) % 6.2832; f.open = 0.3 + 0.15 * Math.sin(this.time * 2.5);
        look = [f.x, f.y, f.z];
      } else { const hop = this.fishFlop(f, H, dt); f.x = H.spot[0]; f.y = H.spot[1]; f.z = H.spot[2] + half + hop; f.roll = lie.roll; look = [f.x, f.y, f.z]; }
      if (H.st === 'unhook' && H.t > (H.big ? 0.6 : 2.25)) {
        H.hooked = false; this.buzz(20);
        if (H.big) { H.st = 'free'; this.finishCatch(false); return; }   // too big to lift or to keep: the hook out, and away it goes
        else {   // off the hook and in your hands: fishing is over for this one, and you can walk off with it
          const meta = { rig: A.rig.name, kd: f.kd, landed: A.landed, t: Date.now() };
          A.fish = null; A.phase = 'ready'; A.land = null; A.card = null; this.carryFish(f, meta); return; }
      }
    }
    if (look && !this.thirdP) {   // the view follows it down to where it lies
      const eo = this.eyeOff || ZERO3, dx = look[0] - P.x, dy = look[1] - P.y, wa = Math.atan2(dy, dx), wp = clamp(Math.atan2(look[2] - (P.z + EYE + eo[2]), Math.max(0.3, Math.hypot(dx - eo[0], dy - eo[1]))), -1.25, 0.3), k = Math.min(1, dt * 3.5);
      P.a += Math.atan2(Math.sin(wa - P.a), Math.cos(wa - P.a)) * k; P.pitch += (wp - P.pitch) * k;
    }
  },
  catchKey() { return 'embercrown-catches'; },
  catchLog() { try { const L = JSON.parse(localStorage.getItem(this.catchKey()) || '[]'); return Array.isArray(L) ? L : []; } catch (e) { return []; } },
  logCatches(recs) { const log = this.catchLog(); log.push(...recs); try { localStorage.setItem(this.catchKey(), JSON.stringify(log.slice(-500))); } catch (e) { /* */ } },   // the newest 500 are kept
  // the journal entry for a fish whose fate is settled (kept, or gone back); meta: { rig, kd } from when it was landed
  logCatch(f, meta, keep) {
    const rec = { species: f.species, name: f.name, cm: +f.lengthCm.toFixed(1), kg: +f.weightKg.toFixed(3), t: (meta && meta.t) || Date.now(), rig: (meta && meta.rig) || '', kept: keep, water: WATER_KEYS[(meta && meta.kd) ?? f.kd], climate: CLIMATE.key, seed: SEED };
    this.logCatches([rec]);
    Game.emit('catch', rec, f); if (this.tackleOpen) this.tackleRender(); if (this.journalOpen) this.journalRender(); return rec;
  },
  // out of the world for good (the creel)
  creelFish(f) { f.held = f.stored = false; this.removeFish(f); this.fish = this.fish.filter(q => q !== f); for (const c of this.fishCells.values()) { const i = c.fish.indexOf(f); if (i >= 0) { c.fish.splice(i, 1); break; } } },
  // back into the water at (x, y), and off it goes
  releaseFish(f, x, y) {
    sample(x, y); f.x = x; f.y = y; f.kd = SK; f.wl = SW; f.ground = hW(SE); f.z = Math.max(f.ground + 0.05, SW - Math.max(0.15, f.len * 0.4)); f.roll = 0; f.pitch = 0; f.land = false; f.hooked = false; f.held = f.stored = false;
    f.state = 'flee'; f.stress = 1; f.thx = this.P.x; f.thy = this.P.y; f.tNext = 0; f.lureCool = this.time + 300; this.splash(f.x, f.y, f.wl, 8);
    // back among the water's own fish: in the list of the cell it went in at, and no longer marked as taken
    if (this.fishGone && this.fishGone[f.id]) { delete this.fishGone[f.id]; try { localStorage.setItem(this.goneKey(), JSON.stringify(this.fishGone)); } catch (e) { /* */ } }
    for (const c of this.fishCells.values()) { const i = c.fish.indexOf(f); if (i >= 0) c.fish.splice(i, 1); }
    { const c = this.fishCells.get(Math.floor(x / FISH_CELL) + ',' + Math.floor(y / FISH_CELL)) || this.fishCells.values().next().value; if (c) c.fish.push(f); if (!this.fish.includes(f)) this.fish.push(f); }
  },
  finishCatch(keep) {   // only for the ones too big to lift: decided alongside, once the hook is out
    const A = this.ang, f = A.fish, H = A.land; if (!f || A.phase !== 'card' || !H || H.st !== 'free') return;
    this.logCatch(f, { rig: A.rig.name, kd: f.kd }, keep); if (!this.thirdP) this.P.pitch = H.pitch0; A.land = null;
    if (keep) { this.creelFish(f); this.say(`${f.name} in the creel`, 2); }
    else { this.releaseFish(f, A.landed.x, A.landed.y); this.say(`Unhooked · ${f.name.toLowerCase()} swims off`, 2.5); }
    A.fish = null; A.phase = 'ready'; A.card = null;
  },
});
