'use strict';
// FISHING: presentation, which fish notice the lure, follows, takes and the bite / strike timing.
Object.assign(Engine, {
  // how good it looks to a fish right now (0..1): lures want the right speed, baits want to sit still
  presentation() {
    const A = this.ang, S = A.S, L = A.lure; if (!L || L.land) return 0;
    if (S.bait) { if (A.baitLeft <= 0) return 0.03; const v = L.spd; return clamp(v < 0.12 ? 1 : 1 - (v - 0.12) * 2.2, 0.15, 1) * (0.75 + 0.25 * S.bait.wiggle); }
    const lu = S.lure, R = lu.speed_ms, v = L.spd;
    if (v < Math.max(0.04, R.min * 0.5)) return lu.pause * (L.t < 6 ? 1 : 0.7);   // stopped (a falling jig or a resting popper still gets hit)
    if (v < R.min) return 0.25 + 0.5 * v / R.min;
    if (v > R.max) return clamp(0.6 * R.max / v, 0.1, 0.6);
    return clamp(1 - 0.45 * Math.abs(v - R.best) / Math.max(0.05, R.max - R.min), 0.5, 1);
  },
  // best strike chance over everything this rig might look like (a lure can imitate several foods)
  rigStrike(f, pres, zone) {
    const S = this.ang.S; let best = 0;
    for (const [food, w] of Object.entries(S.food)) best = Math.max(best, w * Game.strikeChance(f, food, { zone, size_cm: S.size_cm, presentation: pres }));
    return best;
  },
  lureScan() {
    const A = this.ang, S = A.S, L = A.lure; if (!L || L.land || A.fish || L.kd < 0) return;
    const zone = this.lureZone(L), mk = WATER[L.kd].murk, clar = (1 - 0.6 * mk) * (0.35 + 0.65 * ENV.light), lineVis = S.visibility * (1 - 0.7 * mk) * (0.4 + 0.6 * ENV.light);
    const pres = this.presentation() * (1 - 0.45 * lineVis), lu = S.lure;
    // how far away fish notice it: flash and wobble by sight, rattles and pops by sound, scent spreading the longer a bait soaks
    const R = lu ? 3 + (4 * lu.action + 4 * lu.flash * ENV.light) * clar * (L.spd > 0.05 ? 1 : 0.4) + 6 * lu.noise * (this.time - (L.noisy || -9) < 1.5 ? 1 : 0.3) + 4 * lu.scent
                 : 3 + (3 + 3 * Math.min(1, L.t / 30)) * S.bait.scent * (A.baitLeft > 0 ? 1 : 0.1) + 3 * S.bait.wiggle * clar;
    this.fishAround(L.x, L.y, R * 1.3, f => {
      if (f.dead || f.hooked || f.state === 'lure' || f.state === 'flee' || (f.lureCool || 0) > this.time || f.kd !== L.kd) return;
      const D = f.def, thief = baitThief(D); if (!fishCatchable(D) && !(thief && S.bait)) return;
      const r = R * (0.7 + 0.6 * f.sizeRank), dh = Math.hypot(f.x - L.x, f.y - L.y); if (dh > r || Math.abs(f.z - L.z) > 1.2 + r * 0.35) return;
      const p = this.rigStrike(f, pres, zone) * (thief ? 0.5 : 1);
      if (Math.random() < p * 0.6) { f.state = 'lure'; f.zone = zone; f.tNext = 10 + 8 * Math.random(); Game.emit('follow', f); }
    });
  },
  // a fish following the lure gets to it: take it, or turn away
  lureArrive(f) {
    const A = this.ang, L = A.lure;
    if (!L || A.phase !== 'water' || A.fish) { f.state = 'rest'; f.tNext = 0.5; return; }
    const p = this.rigStrike(f, this.presentation() * (1 - 0.3 * A.S.visibility * (1 - WATER[L.kd].murk)), this.lureZone(L));
    if (Math.random() < clamp(0.3 + 2 * p, 0, 0.95)) this.fishTake(f);
    else { f.state = 'rest'; f.tNext = 0.4 + Math.random(); f.lureCool = this.time + 20 + 30 * Math.random(); f.stress = Math.min(1, f.stress + 0.12); Game.emit('refuse', f); }
  },
  fishTake(f) {
    const A = this.ang, S = A.S, small = f.lengthCm < S.size_cm * 2.5;
    A.fish = f; f.hooked = 'bite'; f.state = 'hooked'; A.phase = 'bite'; A.biteT = 0; A.took = false; A.struck = false;
    A.nibbles = S.bait ? Math.floor(Math.random() * (small ? 4 : 2.2)) : 0; A.nibT = A.nibbles ? 0.3 + Math.random() * 0.5 : 0; A.nibGap = 0;
    A.window = (S.bait ? 1.0 + 1.6 * S.sens : 0.45 + 0.6 * S.sens) * (S.hookKind === 'circle' ? 1.6 : 1);
    A.runA = Math.atan2(f.y - A.tip[1], f.x - A.tip[0]) + (Math.random() - 0.5) * 1.2;
    if (!A.nibbles) this.takeNow();
    Game.emit('bite', f);
  },
  takeNow() { const A = this.ang; A.took = true; A.biteT = 0; if (A.float) A.float.dip = 6; this.buzz([40, 30, 70]); if (A.lure) this.addRipple(A.lure.x, A.lure.y, 0.3 + A.fish.len); this.say(A.S.hookKind === 'circle' ? 'Bite! Just reel…' : 'Strike!', 1); },
  biteStep(dt, press, btn) {
    const A = this.ang, S = A.S, f = A.fish, L = A.lure;
    if (!f || f.dead) { A.fish = null; A.phase = 'water'; return; }
    f.ph = (f.ph + dt * 9) % 6.2832; f.open = 0.5;
    if (!A.took) { // nibbles: the float bobs, the rod tip taps. Strike now and you pull it away.
      A.nibGap -= dt;
      if (A.nibGap <= 0) { A.nibGap = 0.5 + Math.random() * 0.9; if (A.float) A.float.dip = 1.5; this.buzz(15); A.nibbles--; if (L) this.addRipple(L.x, L.y, 0.08); A.nibT = 0.25; }
      A.nibT -= dt;
      if (press) return this.missBite('Too early: it was only nibbling', true);
      if (A.nibbles < 0) this.takeNow();
      f.x += (L.x - Math.cos(f.a) * f.len * 0.5 - f.x) * Math.min(1, dt * 4); f.y += (L.y - Math.sin(f.a) * f.len * 0.5 - f.y) * Math.min(1, dt * 4); f.z += (L.z - f.z) * Math.min(1, dt * 4);
      return;
    }
    // it has it and swims off with it
    A.biteT += dt; const v = Math.min(0.6, f.def.behavior.cruise_bl_s * f.len * 1.5) + 0.1;
    f.a = A.runA; let nx = f.x + Math.cos(f.a) * v * dt, ny = f.y + Math.sin(f.a) * v * dt; sample(nx, ny);
    if (SK === f.kd && SW - hW(SE) > f.len * 0.4) { f.x = nx; f.y = ny; } else A.runA += 1.5 * dt;
    L.x = f.x + Math.cos(f.a) * f.len * 0.5; L.y = f.y + Math.sin(f.a) * f.len * 0.5; L.z = f.z;
    if (A.float) { A.float.x = L.x; A.float.y = L.y; A.float.dip = Math.max(A.float.dip, 4); }
    A.lineOut = Math.max(A.lineOut, Math.hypot(L.x - A.tip[0], L.y - A.tip[1], L.z - A.tip[2]));
    const thief = baitThief(f.def);
    if (press && !thief) { // the hookset
      const t = A.biteT / A.window, timing = S.hookKind === 'circle' ? 0.8 : clamp(1.15 - Math.abs(t - 0.35) * 0.9, 0.5, 1);
      const gape = f.lengthCm * 10 * (0.12 + 0.3 * f.def.body.head.mouth), gapFit = S.hook ? clamp(gape / (S.hook.gap_mm * 1.2), 0.3, 1) : 1;
      if (Math.random() < S.hold * timing * gapFit * (S.hookKind === 'treble' ? 0.95 : 1)) return this.startFight(f);
      return this.missBite('Missed it!', false);
    }
    if (A.biteT > A.window) {
      if (thief) { A.baitLeft = 0; return this.missBite(`${/^[aeiou]/i.test(f.name) ? 'An' : 'A'} ${f.name.toLowerCase()} picked your hook clean`, false, true); }
      const self = S.hookKind === 'circle' ? 0.9 : S.hookKind === 'treble' ? 0.4 : 0.12;
      if (Math.random() < self * S.hold) return this.startFight(f);
      this.missBite(S.bait ? 'It dropped the bait' : 'It spat the lure', false);
    }
  },
  missBite(msg, early, stolen) {
    const A = this.ang, S = A.S, f = A.fish;
    if (S.bait && (stolen || Math.random() < (early ? 0.35 : 0.6))) A.baitLeft--;
    if (f) { f.hooked = false; f.state = 'flee'; f.stress = 1; f.thx = A.tip[0]; f.thy = A.tip[1]; f.tNext = 0; f.lureCool = this.time + 60; }
    A.fish = null; A.phase = 'water'; if (A.float) { A.float.dip = 0; A.float.vx = A.float.vy = 0; }
    this.say(msg + (S.bait && A.baitLeft <= 0 ? ' · bare hook: reel in' : ''), 2); Game.emit('miss', f);
  },
});
