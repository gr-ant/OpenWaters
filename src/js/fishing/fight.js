'use strict';
// FISHING: the fight, losing or landing the fish, the catch card and the catch log.
Object.assign(Engine, {
  startFight(f) {
    const A = this.ang, S = A.S, Fi = f.def.fight, W = f.weightKg;
    A.phase = 'fight'; f.hooked = 'fight'; A.energy = 1; A.fdist = Math.max(1, Math.hypot(f.x - A.tip[0], f.y - A.tip[1], f.z - A.tip[2])); A.lineOut = Math.max(A.lineOut, A.fdist);
    A.Fmax = clamp(W ** 0.85 * (0.45 + 1.1 * Fi.strength), 0.03, 400); A.Tfight = 4 + 32 * Fi.stamina * (1 + 0.55 * Math.log10(1 + W)); A.th = Math.atan2(f.y - A.tip[1], f.x - A.tip[0]);
    A.runT = 0.6 + 1.5 * Math.random() * Fi.runs; A.runDir = A.th + (Math.random() - 0.5) * 0.8; A.chargeT = 0; A.slackT = 0; A.jump = null; A.sv = 0; A.dragBuzz = 0; A.tension = 0; A.hookedAt = this.time;
    A.lastTip = A.tip.slice(); A.away = 0;
    A.fz = f.z; this.buzz([70, 40, 140]); this.say(`Fish on! ${this.touchUI ? 'Hold Reel' : 'Hold R'} when it stops pulling, ease off when it runs`, 3); Game.emit('hooked', f);
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
    const vr = S.reelMs * (fast ? 1.25 : 0.85), reel = btn, swimV = (A.runT > 0 ? B.burst_bl_s * 0.45 : B.cruise_bl_s * 1.5) * f.len + 0.2;
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
    if (f && !f.dead) { f.hooked = false; f.state = 'flee'; f.stress = 1; f.thx = A.tip[0]; f.thy = A.tip[1]; f.tNext = 0; f.lureCool = this.time + 120; f.land = false; f.pitch = 0;
      if (f.z > f.wl - 0.05) f.z = f.wl - Math.max(0.1, f.len * 0.3); }
    A.fish = null; A.jump = null; A.tension = 0; this.buzz(why === 'snap' ? [120] : [30, 60, 30]);
    if (why === 'snap' || why === 'eaten' || !A.lure || why === 'drop') { A.phase = A.out ? 'ready' : 'stowed'; A.lure = null; A.float = null; A.lineOut = 0; if (why === 'snap' && A.out) msg += ' · tied on a new one'; }
    else { A.phase = 'water'; A.lineOut = Math.hypot(A.lure.x - A.tip[0], A.lure.y - A.tip[1], A.lure.z - A.tip[2]) + 0.2; if (A.S.bait) A.baitLeft = 0; if (A.float) A.float.vx = A.float.vy = 0; }
    this.say(msg, 3); Game.emit('lost', f, why);
  },
  landFish() {
    const A = this.ang, f = A.fish, P = this.P;
    A.phase = 'card'; f.hooked = 'card'; f.land = true; this.keys = {}; this.joy = this.tlook = null; this.resetMouseLook(); A.landed = { x: f.x, y: f.y, kd: f.kd };
    A.lure = null; A.float = null; A.lineOut = 0; A.tension = 0; this.buzz([50, 50, 50]);
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
    const best = this.catchLog().filter(c => c.species === f.species).reduce((m, c) => Math.max(m, c.kg), 0);
    A.card = { pb: f.weightKg > best, first: best === 0 };
    const el = document.getElementById('catch');
    if (el) { el.hidden = false; document.getElementById('ccName').textContent = f.name; document.getElementById('ccSci').textContent = f.def.scientific || '';
      const kg = f.weightKg, wt = kg < 1 ? `${(kg * 1000).toFixed(0)} g` : `${kg.toFixed(2)} kg`, lb = kg / LB;
      document.getElementById('ccSize').textContent = `${f.lengthCm.toFixed(1)} cm · ${wt} (${lb < 1 ? (lb * 16).toFixed(1) + ' oz' : lb.toFixed(1) + ' lb'})`;
      document.getElementById('ccNote').textContent = (A.card.first ? 'First of its kind! ' : A.card.pb ? 'Personal best! ' : '') + `On the ${A.rig.name.toLowerCase()} · ${((this.time - A.hookedAt)).toFixed(0)} s fight`; }
    Game.emit('landed', f);
  },
  cardStep(dt) { // hold the fish up in front of you while you decide
    const A = this.ang, f = A.fish, P = this.P; if (!f) { A.phase = 'ready'; return; }
    const d = 0.32 + f.len * 0.75, cp = Math.cos(P.pitch * 0.5);
    f.x = P.x + Math.cos(P.a) * d * cp; f.y = P.y + Math.sin(P.a) * d * cp; f.z = P.z + EYE - 0.12 - f.len * 0.12 + Math.sin(P.pitch * 0.5) * d; f.a = P.a + Math.PI / 2; f.pitch = 0;
    f.ph = (f.ph + dt * (2 + 3 * Math.max(0, Math.sin(this.time * 1.7)))) % 6.2832; f.open = 0.25 + 0.2 * Math.sin(this.time * 3);
  },
  catchKey() { return 'embercrown-catches'; },
  catchLog() { try { return JSON.parse(localStorage.getItem(this.catchKey()) || '[]'); } catch (e) { return []; } },
  finishCatch(keep) {
    const A = this.ang, f = A.fish; if (!f || A.phase !== 'card') return;
    const rec = { species: f.species, name: f.name, cm: +f.lengthCm.toFixed(1), kg: +f.weightKg.toFixed(3), t: Date.now(), rig: A.rig.name, kept: keep, water: WATER_KEYS[f.kd], climate: CLIMATE.key, seed: SEED };
    const log = this.catchLog(); log.push(rec); try { localStorage.setItem(this.catchKey(), JSON.stringify(log.slice(-500))); } catch (e) { /* */ }
    document.getElementById('catch').hidden = true; f.land = false; f.hooked = false;
    if (keep) { this.removeFish(f); this.fish = this.fish.filter(q => q !== f); for (const c of this.fishCells.values()) { const i = c.fish.indexOf(f); if (i >= 0) { c.fish.splice(i, 1); break; } } this.say(`${f.name} in the creel`, 2); }
    else { // back in the water where it came in, and off it goes
      const Lp = A.landed; sample(Lp.x, Lp.y); f.x = Lp.x; f.y = Lp.y; f.wl = SW; f.ground = hW(SE); f.z = Math.max(f.ground + 0.05, SW - Math.max(0.15, f.len * 0.4)); f.state = 'flee'; f.stress = 1; f.thx = this.P.x; f.thy = this.P.y; f.tNext = 0; f.lureCool = this.time + 300;
      this.splash(f.x, f.y, f.wl, 8); this.say(`Released · ${f.name.toLowerCase()} swims off`, 2); }
    A.fish = null; A.phase = 'ready'; A.card = null; Game.emit('catch', rec, f);
    if (this.tackleOpen) this.tackleRender(); if (this.journalOpen) this.journalRender();
  },
});
