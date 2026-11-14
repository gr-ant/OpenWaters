'use strict';
// Shared simulation, part 5: fish behaviour. Depth zones, decisions (rest, cruise, forage, hunt, hold, flee, haul out),
// prey, eating, swimming, air-breathers surfacing and leaping, and being spooked by people, boats and splashes.
// installBehaviour(world) adds these. Everything that is not simulation comes in through a context `ctx`:
//   ctx.time, ctx.tod, ctx.dtH, ctx.frameDt   clock: seconds, time of day 0..1, game hours this frame, the frame's dt
//   ctx.rng                                   the random stream (the game passes Math.random; a server a seeded one)
//   ctx.players                               [{ x, y, inWater, moving }]: swimmers/waders scare fish within their
//                                             spook range; someone moving on the bank scares shallow fish nearby
//   ctx.noises                                [{ x, y, s, t }]: splashes, boats, casts (see disturb)
//   ctx.fishAround(x, y, r, fn)               the fish near a point (prey)
//   ctx.lureFor(f)                            the lure a 'lure'-state fish follows, while it is still fishable (or null)
//   ctx.lureArrive(f)                         it reached the lure: the game's bite decision (fishing stays client-side)
//   ctx.emit(name, ...args)                   events: fishFeed, fishRise, fishEaten, mammalBlow, mammalLeap
//   ctx.fx.rise(f) / splashdown(f) / blow(f) / leap(f) / kill(f, g)   rings, drops and spray (rendering; optional)
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else { const S = globalThis.OWSim = globalThis.OWSim || {}; Object.assign(S, factory(S)); }
})(function (S) {
  const { clamp, sstep, fitRange, currentFit, coverFit, OCEAN, LAKE, POND, RIVER } = S;
  const NOFX = {};
  // a splash, a boat, a cast: fish within its reach (× its strength) take fright for the next 0.4 s
  function disturb(ctx, x, y, s = 1) { ctx.noises.push({ x, y, s, t: ctx.time }); if (ctx.noises.length > 16) ctx.noises.shift(); }
  // frightened at once, away from (x, y): a diving bird, a missed strike, a fish let go
  function spookFish(f, x, y) { f.stress = 1; f.thx = x; f.thy = y; f.tNext = 0; }

  function installBehaviour(world) {
    const terr = world.terrain, env = () => world.env;
    const sampleAt = (x, y) => terr.sample(x, y, world.scratch);
    function pickZone(ctx, w) { const t = (w.surface || 0) + (w.mid || 0) + (w.bottom || 0); let r = ctx.rng() * (t || 1); if ((r -= w.surface || 0) < 0) return 'surface'; if ((r -= w.mid || 0) < 0) return 'mid'; return 'bottom'; }
    function zoneZ(ctx, f, zone, wl, g, kind) { // a depth for this zone; in stratified water the fish looks for its preferred temperature
      g = world.fishFloor(f.def, wl, g);
      const lo = g + (f.def._jelly && !f.def._benthic ? f.len * 0.2 : Math.max(0.01, -f.def._zmin * f.len)) + 0.01, hi = Math.max(lo, wl - 0.12), dep = wl - g;
      if (f.def._benthic) return lo;
      let z = zone === 'surface' ? hi - 0.1 : zone === 'bottom' ? lo + 0.05 : g + dep * (0.3 + 0.4 * ctx.rng());
      if (((dep > 3 && (kind === LAKE || kind === OCEAN)) || (dep > 1.2 && kind === POND)) && zone !== 'surface') {   // the layer with the right temperature and enough oxygen
        const H = f.def.habitat.temperature_c; let bz = z, bf = -1;
        for (let k = 0; k <= 4; k++) { const zz = lo + (hi - lo) * k / 4, T = world.waterTemp(kind, wl, wl - zz, f.x, f.y), ff = fitRange(T, H.min, H.optimal, H.max) * (0.2 + 0.8 * world.oxyFit(f.def, world.oxygen(kind, T, wl - zz))) - Math.abs(zz - z) * 0.02; if (ff > bf) { bf = ff; bz = zz; } }
        z = bz;
      }
      return clamp(z, lo, hi);
    }
    function fishSpot(ctx, f, cx, cy, radius, n, score) { // best of n random spots of the same water within radius
      let best = null, bs = -1;
      for (let k = 0; k < n; k++) {
        const a = ctx.rng() * 6.2832, r = radius * Math.sqrt(ctx.rng()), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        const s = sampleAt(x, y), SK = s.kind, SW = s.level, dep = SW - s.ground, SR = s.rap; if (SK !== f.kd || dep < Math.max(0.25, f.len * 0.8)) continue;
        const e = { x, y, kind: SK, level: SW, dep, ground: SW - dep, cur: 0, cover: null, rap: SR };
        const sc = score(x, y, e) * (0.85 + 0.3 * ctx.rng()); if (sc > bs) { bs = sc; best = e; best.x = x; best.y = y; }
      }
      return best;
    }
    function fishDecide(ctx, f) {
      const D = f.def, B = D.behavior, H = D.habitat, rnd = ctx.rng, hour = (ctx.tod ?? 0) * 24, ENV = env();
      const s0 = sampleAt(f.x, f.y), rap = s0.rap; f.wl = s0.level; f.ground = s0.ground;
      const fl = terr.flowAt(f.x, f.y, f.kd); f.fx = fl[0]; f.fy = fl[1]; f.cur = f.kd >= RIVER ? fl[2] : 0;
      const below = clamp(f.wl - f.z, 0, f.wl - f.ground);
      f.temp = world.waterTemp(f.kd, f.wl, below, f.x, f.y); f.oxy = world.oxygen(f.kd, f.temp, below, rap);
      f.tfit = fitRange(f.temp, H.temperature_c.min, H.temperature_c.optimal, H.temperature_c.max);
      f.metab = clamp(2 ** ((f.temp - H.temperature_c.optimal) / 10), 0.12, 1.3);   // metabolism follows the water temperature
      const ofit = world.oxyFit(D, f.oxy);
      // weather: a falling barometer ahead of a front turns fish on; the bright, high-pressure day after one turns them off
      const wx = 1 + 0.35 * sstep(0.4, 3, -ENV.trend) - 0.25 * sstep(0.4, 3, ENV.trend) * (1 - ENV.cloud);
      f.act = world.activityAt(D, hour) * (0.12 + 0.88 * f.tfit) * (1 - 0.85 * f.stress) * wx * (0.35 + 0.65 * ofit) * (f.temp < H.temperature_c.min ? 0.5 : 1);
      const go = (state, e, zone, tNext) => { f.state = state; f.zone = zone; if (e) { f.tx = e.x; f.ty = e.y; f.tz = zoneZ(ctx, f, zone, e.level, e.ground, f.kd); } f.tNext = tNext; };
      if (f.stress > 0.5) { // bolt for deeper water and cover, away from the threat
        const P = ctx.players[0] || f, tx = f.thx ?? P.x, ty = f.thy ?? P.y;
        const e = fishSpot(ctx, f, f.x, f.y, 14, 6, (x, y, v) => coverFit(terr.coverAt(x, y, 3), H) * (0.4 + Math.min(1, v.dep / 4)) * (0.3 + Math.min(1, Math.hypot(x - tx, y - ty) / 12)));
        return go('flee', e, 'bottom', 3 + rnd() * 4);
      }
      if (ofit < 0.5 && rnd() < 0.8) { // gasping: find water with more oxygen (moving water, the windward shore, a cooler layer)
        const e = fishSpot(ctx, f, f.x, f.y, Math.max(12, D.population.home_range_m * 1.5), 6, (x, y, v) => { v.cur = v.kind >= RIVER ? terr.flowAt(x, y, v.kind)[2] : 0; return world.habitatScore(D, v); });
        return go('cruise', e, 'mid', 6 + rnd() * 6);
      }
      if (f.leader && !f.leader.dead && f.leader.stress < 0.5) { f.state = 'school'; f.tNext = 1 + rnd() * 2; return; }
      if (rnd() < f.act * f.hunger * 0.9) { // feed: hunt something alive, or work the spot with the most of what it eats
        if (f.hunger > 0.35 && rnd() < 0.75) { const prey = findPrey(ctx, f); if (prey) { f.state = 'hunt'; f.prey = prey; f.zone = 'mid'; f.tNext = 5 + rnd() * 6; return; } }
        const e = B.burst_bl_s <= 0 ? null : fishSpot(ctx, f, f.x, f.y, B.ambush > 0.5 ? 4 : 9, 4, (x, y, v) => { v.cover = terr.coverAt(x, y, 2.5); const fs = world.foodScore(D, v, f.temp); v.fq = fs.q; v.fz = fs.zone; return 0.05 + fs.q; });
        f.mealQ = e ? e.fq : 0.3; f.tries = (f.tries || 0) + 1;
        return go('forage', e || { x: f.x, y: f.y, level: f.wl, ground: f.ground }, e ? e.fz : D._benthic ? 'bottom' : pickZone(ctx, D.diet.feeding_zone), 8);
      }
      f.tries = 0;
      if (f.cur > 0.15 && rnd() < B.station_holding) { // hold a lie in the current, behind cover
        const e = fishSpot(ctx, f, f.homeX, f.homeY, Math.min(D.population.home_range_m, 8), 5, (x, y, v) => currentFit(terr.flowAt(x, y, v.kind)[2], H) * coverFit(terr.coverAt(x, y, 2.5), H) * (0.6 + 0.4 * world.foodScore(D, v, f.temp).q));
        return go('hold', e, pickZone(ctx, B.depth_zone), 10 + rnd() * 20);
      }
      if (B.haul_out > 0) { // seals and sea lions rest ashore, then slip back into the water
        if (f.land) { if (rnd() < 0.65) { f.state = 'haul'; f.tx = f.x; f.ty = f.y; f.tNext = 30 + rnd() * 90; return; }
          const e = fishSpot(ctx, f, f.x, f.y, 16, 10, (x, y, v) => v.dep); if (e) return go('cruise', e, 'mid', 10); }
        else if (rnd() < B.haul_out * (D._herp ? 0.6 + 0.6 * ENV.light : 0.35) * (1 - (D._herp ? 0.5 : 1) * f.hunger)) { /* reptiles and frogs bask, most in sunshine */ const e = shoreSpot(ctx, f, 40); if (e) { f.state = 'haul'; f.zone = 'bottom'; f.tx = e.x; f.ty = e.y; f.tz = e.z; f.tNext = 90 + rnd() * 200; return; } }
      }
      // bright sun drives wary fish down and into cover; grey days, rain and dusk bring them out
      const shy = B.wariness * ENV.light * (1 - 0.6 * ENV.rain);
      if (rnd() < f.act * (1 - 0.7 * B.ambush) * (1 - 0.5 * shy)) { // roam the home range, favouring good habitat
        const toHome = Math.hypot(f.x - f.homeX, f.y - f.homeY) > D.population.home_range_m;
        const e = fishSpot(ctx, f, toHome ? f.homeX : f.x, toHome ? f.homeY : f.y, D.population.home_range_m, 5, (x, y, v) => { v.cur = v.kind >= RIVER ? terr.flowAt(x, y, v.kind)[2] : 0; v.cover = terr.coverAt(x, y, 3); return world.habitatScore(D, v); });
        return go('cruise', e, rnd() < shy * 0.6 ? 'bottom' : pickZone(ctx, B.depth_zone), 6 + rnd() * 10);
      }
      const e = fishSpot(ctx, f, f.x, f.y, 5, 4, (x, y, v) => coverFit(terr.coverAt(x, y, 2.5), H) * (1 + shy) * fitRange(v.dep, H.depth_m.min, H.depth_m.preferred * (1 + shy), H.depth_m.max * 1.5));
      go('rest', e, rnd() < shy ? 'bottom' : pickZone(ctx, B.depth_zone), (6 + rnd() * 14) * (1 + B.ambush) * (f.tfit < 0.2 ? 2 : 1));
    }
    // the best thing to chase nearby: on the menu, small enough to swallow, in the same water
    function findPrey(ctx, f) {
      const D = f.def, F = D.diet.food, gape = f.len * (0.22 + 0.3 * D.body.head.mouth), reach = 5 + 8 * Math.min(1, f.len * 2);
      if (F.fish && D.diet.piscivore_from_cm && f.lengthCm < D.diet.piscivore_from_cm && !F.crayfish && !F.shrimp) return null;
      let best = null, bs = 0;
      ctx.fishAround(f.x, f.y, reach, g => {   // only fish in the grid cells within reach
        if (g === f || g.dead || g.kd !== f.kd || g.len > gape || g.len < f.len * 0.06) return;
        const cat = world.preyFood(g.def); if (!cat || !F[cat]) return;
        if (cat === 'fish' && D.diet.piscivore_from_cm && f.lengthCm < D.diet.piscivore_from_cm) return;
        const d = Math.hypot(g.x - f.x, g.y - f.y); if (d > reach) return;
        const sc = F[cat] / (1 + d * 0.4) * (g.stress < 0.3 ? 1.3 : 1) * (g.def === D ? 0.3 : 1);
        if (sc > bs) { bs = sc; best = g; }
      });
      return best;
    }
    function fishEat(ctx, f, q = f.mealQ ?? 0.5) {
      f.hunger = Math.max(0, f.hunger - 0.1 - 0.5 * q - 0.1 * ctx.rng()); f.gulp = 1; f.tries = 0;
      if (f.zone === 'surface' && world.config.fishRises) { // a rise: rings and a few drops
        if ((ctx.fx || NOFX).rise) ctx.fx.rise(f);
        ctx.emit('fishRise', f);
      }
      ctx.emit('fishFeed', f, f.zone);
      f.state = 'rest'; f.zone = null; f.tNext = 0.5 + ctx.rng() * 2;
    }
    // how frightened f is right now (0..1), and of what (sets f.thx, f.thy): the nearest swimmer or wader, someone moving
    // on the bank above shallow fish, a fresh splash or boat, a predator closing in. Rain on the surface, muddy water
    // and low light hide you; bright calm days don't.
    function fishThreat(ctx, f) {
      const B = f.def.behavior, ENV = env();
      const hide = (1 - 0.35 * ENV.rain) * (f.kd >= RIVER ? 1 - 0.35 * ENV.turb : 1) * (0.7 + 0.3 * ENV.light);
      const sp = B.spook_m * (0.6 + 0.8 * f.sizeRank) * (0.5 + B.wariness) * hide;
      let th = 0;
      for (const P of ctx.players) {
        const d = Math.hypot(f.x - P.x, f.y - P.y); let t = 0;
        if (P.inWater) t = d < sp ? 1 - d / sp : 0;
        else if (P.moving && d < sp * 0.6 && f.wl - f.z < 1.5) t = 0.5 * (1 - d / (sp * 0.6));
        if (t > th) { th = t; f.thx = P.x; f.thy = P.y; }
      }
      for (const n of ctx.noises) { if (ctx.time - n.t > 0.4) continue; const r = sp * n.s, dn = Math.hypot(f.x - n.x, f.y - n.y); if (dn < r && (1 - dn / r) * Math.min(1, n.s) > th) { th = (1 - dn / r) * Math.min(1, n.s); f.thx = n.x; f.thy = n.y; } }
      if (f.chaser && ctx.time - f.chasedT < 0.4 && !f.chaser.dead) { // being hunted: it notices if it's alert and close enough
        const c = f.chaser, dc = Math.hypot(c.x - f.x, c.y - f.y), see = (2 + 4 * B.wariness) * (0.6 + 0.4 * ENV.light);
        if (dc < see && 1 - dc / see > th) { th = (1 - dc / see) * 0.9; f.thx = c.x; f.thy = c.y; }
      }
      return th;
    }
    function fishStep(ctx, f, dt) {
      const D = f.def, B = D.behavior, ENV = env(), rng = ctx.rng;
      // metabolism: hunger grows with the meals it needs a day, much slower in cold water (Q10 ~ 2)
      const dtH = ctx.dtH * dt / Math.max(1e-6, ctx.frameDt || dt);   // game hours in this step (a far fish's step covers several frames)
      const metab = f.metab ?? (f.metab = clamp(2 ** (((f.temp ?? 15) - D.habitat.temperature_c.optimal) / 10), 0.12, 1.3));   // refreshed when it decides
      f.hunger = Math.min(1, f.hunger + dtH * D.diet.meals_per_day / 24 * 0.9 * metab);
      f.stress = Math.max(0, f.stress - dt / B.recover_s);
      const th = fishThreat(ctx, f);
      if (th > 0) { const was = f.stress; f.stress = Math.min(1, f.stress + th * (0.3 + B.wariness) * dt * 5); if (was <= 0.5 && f.stress > 0.5) f.tNext = 0; }
      if ((f.tNext -= dt) <= 0) fishDecide(ctx, f);
      if (!D._benthic && f.state !== 'flee' && f.state !== 'forage' && f.state !== 'hunt' && f.state !== 'lure' && f.wl - f.ground < 8 && !ENV.iced(f.kd, f.wl - f.ground, f.x, f.y)
        && rng() < B.rise_per_hour * f.act * dtH * (0.2 + 1.8 * ENV.hatch) * sstep(5, 12, f.temp ?? 15)) { // takes something off the top (most during a hatch)
        f.mealQ = 0.25 + 0.5 * ENV.hatch;
        f.state = 'forage'; f.zone = 'surface'; f.tx = f.x + (rng() * 3 - 1.5); f.ty = f.y + (rng() * 3 - 1.5); f.tz = f.wl - 0.1; f.tNext = 6;
      }
      if (D._air && mammalStep(ctx, f, dt)) return;   // breathing, and leaping clear of the water
      let tx = f.tx, ty = f.ty, tz = f.tz, L = null;
      if (f.state === 'school' && f.leader) { const Ld = f.leader, c = Math.cos(Ld.a), s = Math.sin(Ld.a); tx = Ld.x + c * f.ox - s * f.oy; ty = Ld.y + s * f.ox + c * f.oy; tz = Ld.z + f.oz; }
      if (f.state === 'hunt') { // stalk, then lunge, leading the prey a little
        const g = f.prey;
        if (!g || g.dead || Math.hypot(g.x - f.x, g.y - f.y) > 18) { f.state = 'rest'; f.prey = null; f.tNext = 1 + rng() * 2; }
        else { const lead = Math.min(1, Math.hypot(g.x - f.x, g.y - f.y) / 3) * 0.4; tx = g.x + Math.cos(g.a) * g.spd * g.len * lead; ty = g.y + Math.sin(g.a) * g.spd * g.len * lead; tz = g.z; g.chaser = f; g.chasedT = ctx.time; }
      }
      if (f.state === 'lure') { // following your lure or bait in (the game's fishing: ctx.lureFor)
        L = ctx.lureFor ? ctx.lureFor(f) : null;
        if (!L) { f.state = 'rest'; f.tNext = 0.5 + rng(); }
        else { tx = L.x; ty = L.y; tz = L.z; }
      }
      const dist = Math.hypot(tx - f.x, ty - f.y);
      let want;   // swimming speed (body lengths a second) for what it's doing; only the current behaviour is worked out
      switch (f.state) {
        case 'rest': want = 0.12; break;
        case 'cruise': want = B.cruise_bl_s * (0.6 + 0.4 * f.act); break;
        case 'hold': want = 0.25; break;
        case 'forage': want = B.ambush > 0.5 && dist < 3 ? B.burst_bl_s : B.cruise_bl_s * 1.8; break;
        case 'flee': want = B.burst_bl_s; break;
        case 'hunt': want = dist < 2.5 + f.len * 3 ? B.burst_bl_s : B.cruise_bl_s * (B.ambush > 0.5 ? 0.6 : 1.6); break;
        case 'breathe': want = B.cruise_bl_s * 1.1; break;
        case 'haul': want = Math.max(B.cruise_bl_s, 0.35 / f.len); break;   // heading for the bank: at least ~0.35 m/s, so a turtle gets there
        case 'lure': want = Math.min(B.burst_bl_s * (L && L.spd > 1.2 ? 1 : 0.5), Math.max(B.cruise_bl_s * 2.5, (dist < 1.2 ? 0.35 : 0.7) / f.len, L ? L.spd * 1.3 / f.len : 0)); break;   // a trolled lure gets run down flat out
        case 'school': want = f.leader ? Math.max(0.2, f.leader.spd * f.leader.len / f.len) + dist * 0.5 / f.len : B.cruise_bl_s; break;
        default: want = 0.5;
      }
      let desired = Math.atan2(ty - f.y, tx - f.x);
      if (B.burst_bl_s <= 0) { want = 0; desired = f.a; }   // sessile (burst_bl_s 0, e.g. giant clam): never moves or turns
      if (dist < Math.max(0.35, f.len * 0.8) && Math.abs(tz - f.z) < 0.4) { // arrived
        if (f.state !== 'school') { want = 0.04; desired = f.a; }
        if (f.state === 'forage') { // did it find anything? richer spots pay off more often
          if (rng() < 0.3 + 0.7 * (f.mealQ ?? 0.5) || (f.tries || 0) > 3) fishEat(ctx, f); else { f.state = 'rest'; f.tNext = 0.3 + rng(); }
        } else if (f.state === 'hunt') fishStrike(ctx, f);
        else if (f.state === 'lure') { if (ctx.lureArrive) ctx.lureArrive(f); else { f.state = 'rest'; f.tNext = 0.5; } }
        else if (f.state === 'cruise') f.tNext = Math.min(f.tNext, 0.5 + rng());
      }
      if (f.state === 'hold' && f.cur > 0.05 && dist < 2) desired = Math.atan2(-f.fy, -f.fx);   // nose into the current
      if (f.land) want = Math.min(want, 0.3);   // seals hump along slowly ashore
      const da = Math.atan2(Math.sin(desired - f.a), Math.cos(desired - f.a)), tr = B.turn_rate * (f.state === 'flee' ? 1.8 : 1);
      f.a += clamp(da, -tr * dt, tr * dt);
      f.spd += (want * (Math.abs(da) > 1.5 ? 0.4 : 1) - f.spd) * Math.min(1, dt * (f.state === 'flee' || f.state === 'forage' ? 6 : 1.8));
      const v = f.spd * f.len; let nx = f.x + Math.cos(f.a) * v * dt, ny = f.y + Math.sin(f.a) * v * dt;
      if (f.cur > 0.05 && f.state !== 'hold') { nx += f.fx * 0.3 * dt; ny += f.fy * 0.3 * dt; }   // the current carries it a little
      const s = sampleAt(nx, ny), SW = s.level, SK = s.kind, gnd = s.ground, dep = SW - gnd;
      // seals and sea lions may cross the shoreline when hauling out (or heading back in): low, gentle ground only
      const amph = B.haul_out > 0 && (f.state === 'haul' || f.land), ok = amph ? (dep > -2.2 && gnd - f.ground < 0.7 && (SK === f.kd || dep < 0)) : dep >= Math.max(0.18, f.len * 0.35) && SK === f.kd;
      if (!ok) { f.a += (rng() < 0.5 ? 1 : -1) * 1.2; f.spd *= 0.3; if (f.state !== 'school') f.tNext = Math.min(f.tNext, 0.3); }
      else { f.x = nx; f.y = ny; f.wl = SW; f.ground = SW - dep;
        if (B.haul_out > 0) { const ic = ENV.iced(SK, dep, nx, ny); f.land = dep < f.len * 0.3 || ic; if (ic) f.ground = SW; } }   // on an ice floe the 'ground' is the ice
      const lo = f.ground + (D._jelly && !D._benthic ? f.len * 0.2 : Math.max(0.01, -f.def._zmin * f.len)) + 0.01, hi = Math.max(lo, f.wl - (f.state === 'breathe' ? f.len * 0.035 : 0.08));   // a breathing whale's back breaks the surface
      const vz = Math.min(0.6, Math.max(0.02, B.burst_bl_s * f.len * 0.5)) * dt, z0 = f.z;   // a clam doesn't bob up and down like a trout
      f.z = D._benthic ? lo : clamp(f.z + clamp(clamp(tz, lo, hi) - f.z, -vz, vz), lo, hi);
      // pitch: nose up when climbing, down when diving (not for things lying on the bottom or ashore)
      const ptg = D._benthic || D._jelly || f.land || D.body.lie ? 0 : clamp(Math.atan2((f.z - z0) / Math.max(dt, 1e-3), Math.max(0.15, v)), -0.6, 0.6);
      f.pitch = (f.pitch || 0) + (ptg - (f.pitch || 0)) * Math.min(1, dt * 3);
      const beat = 1.6 + 2.2 * Math.min(6, f.state === 'hold' ? f.cur / f.len * 0.6 + 0.4 : f.spd);   // tail beats faster when working
      f.ph = (f.ph + dt * beat * 3.1416) % 6.2832;
      // mouth: slow breathing (faster when frightened), wide open closing on food, a snap when it eats
      f.gulp = Math.max(0, (f.gulp || 0) - dt * 3); f.bph = ((f.bph ?? f.tint * 9) + dt * (1.6 + 3 * f.stress)) % 6.2832;
      f.open = typeof f.mouthOpen === 'number' ? clamp(f.mouthOpen, 0, 1)
        : B.burst_bl_s <= 0 ? (f.open ?? 0.8) + ((f.stress > 0.3 ? 0.05 : 0.8) - (f.open ?? 0.8)) * Math.min(1, dt * 0.4)   // sessile: gapes wide, slowly shuts when disturbed
        : Math.max(0.06 + 0.07 * (0.5 + 0.5 * Math.sin(f.bph)), f.state === 'forage' && dist < Math.max(1, f.len * 3) ? 0.75 : 0, Math.sin(Math.min(1, f.gulp) * 3.1416) * 0.9);
    }
    // air breathers: when the breath runs out, swim up and breathe at the surface (whales and dolphins blow), now and
    // then leap clear of the water. Returns true while airborne (it moves itself).
    function mammalStep(ctx, f, dt) {
      const B = f.def.behavior, fx = ctx.fx || NOFX, rng = ctx.rng;
      if (f.leapV !== undefined) {
        const sp = Math.max(f.spd, B.burst_bl_s * 0.5) * f.len, nx = f.x + Math.cos(f.a) * sp * dt, ny = f.y + Math.sin(f.a) * sp * dt;
        { const s = sampleAt(nx, ny); if (s.level - s.ground > f.len * 0.5 && s.kind === f.kd) { f.x = nx; f.y = ny; } else f.a += 2 * dt; }
        f.leapV -= 9.8 * dt; f.z += f.leapV * dt; f.pitch = clamp(Math.atan2(f.leapV, sp), -1.1, 1.1); f.ph = (f.ph + dt * 7) % 6.2832;
        if (f.leapV < 0 && f.z < f.wl - f.len * 0.12) { // splashdown
          disturb(ctx, f.x, f.y, Math.min(2, 0.4 + f.len * 0.3)); if (fx.splashdown) fx.splashdown(f);
          f.leapV = undefined; f.z = f.wl - f.len * 0.25; f.pitch = -0.4;
        }
        return true;
      }
      if (f.land) { f.air = B.breath_hold_s; return false; }
      if (f.state !== 'breathe') { f.air -= dt * (f.state === 'flee' || f.state === 'hunt' ? 1.6 : 1); if (f.air <= 0) { f.state = 'breathe'; f.surfT = 0; f.blew = false; f.tNext = 60; } }
      if (f.state !== 'breathe') return false;
      f.tx = f.x + Math.cos(f.a) * f.len * 3; f.ty = f.y + Math.sin(f.a) * f.len * 3; f.tz = f.wl;
      if (f.wl - f.z > f.len * 0.12 + 0.2) return false;
      if (!f.blew) { // the blow: a burst of spray from the blowhole
        f.blew = true; if (fx.blow) fx.blow(f);
        ctx.emit('mammalBlow', f);
      }
      f.surfT += dt;
      if (B.leap_per_hour > 0 && rng() < B.leap_per_hour * ctx.dtH * dt / Math.max(1e-6, ctx.frameDt || dt)) { // a leap (dolphins often; a whale's breach now and then)
        const h = clamp(f.len * (0.35 + 0.7 * rng()), 0.5, 6); f.leapV = Math.sqrt(2 * 9.8 * h); f.z = f.wl - f.len * 0.1; f.spd = B.burst_bl_s * 0.6;
        if (fx.leap) fx.leap(f); ctx.emit('mammalLeap', f); return true;
      }
      if (f.surfT > B.surface_s) { f.air = B.breath_hold_s * (0.6 + 0.8 * rng()); f.state = 'cruise'; f.tNext = 0; }
      return false;
    }
    // a low, gentle bit of shore near a seal to haul out on (null if none)
    function shoreSpot(ctx, f, R) {
      for (let k = 0; k < 16; k++) {
        const a = ctx.rng() * 6.2832, r = R * Math.sqrt(ctx.rng()), x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r;
        const s = sampleAt(x, y), g = s.ground, SW = s.level, SK = s.kind, dep = SW - g;
        if (dep > -1.1 && dep < -0.12 && Math.abs(terr.groundAt(x + 1.5, y) - terr.groundAt(x - 1.5, y)) < 0.7 && Math.abs(terr.groundAt(x, y + 1.5) - terr.groundAt(x, y - 1.5)) < 0.7) return { x, y, z: g };
        if (SK === f.kd && dep > 0.3 && env().iced(SK, dep, x, y)) return { x, y, z: SW, ice: true };   // an ice floe will do
      }
      return null;
    }
    // a predator reaches its prey: a lunge that may miss (alert prey and open water favour the prey)
    function fishStrike(ctx, f) {
      const g = f.prey, B = f.def.behavior; f.prey = null;
      if (!g || g.dead) { f.state = 'rest'; f.tNext = 1; return; }
      const p = clamp(0.25 + 0.35 * B.ambush + 0.3 * (1 - g.stress) - 0.15 * g.def.behavior.wariness + 0.15 * (1 - env().light), 0.08, 0.9);
      if (ctx.rng() < p) {
        // Queries and rendering skip dead animals immediately; the cells drop them on their next sync.
        g.dead = true; g.eatenBy = f.id;
        if (g.wl - g.z < 0.8 && (ctx.fx || NOFX).kill) ctx.fx.kill(f, g);
        disturb(ctx, g.x, g.y, 0.25);
        ctx.emit('fishEaten', f, g);
        f.zone = 'mid'; fishEat(ctx, f, 0.9 + Math.min(1, g.len / f.len));
      } else { g.stress = 1; g.thx = f.x; g.thy = f.y; g.tNext = 0; f.state = 'rest'; f.tNext = 1 + ctx.rng() * 3; }
    }
    Object.assign(world, { pickZone, zoneZ, fishSpot, fishDecide, findPrey, fishEat, fishThreat, fishStep, mammalStep, shoreSpot, fishStrike });
    return world;
  }

  // A fish grid for prey and spook queries (8 m buckets), rebuilt each tick from the live list.
  function createFishGrid() {
    const G = new Map(), pool = [];
    return {
      rebuild(fish) {
        for (const bucket of G.values()) { bucket.length = 0; pool.push(bucket); } G.clear();
        for (const f of fish) { if (f.dead) continue; const k = (Math.floor(f.x / 8) + 32768) * 65536 + Math.floor(f.y / 8) + 32768; let b = G.get(k); if (!b) G.set(k, b = pool.pop() || []); b.push(f); }
      },
      around(x, y, r, fn) {
        const c = 8, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) { const a = G.get((gx + 32768) * 65536 + gy + 32768); if (a) for (const f of a) if (!f.dead && (f.x - x) ** 2 + (f.y - y) ** 2 <= r * r && fn(f)) return; }
      },
    };
  }

  return { disturb, spookFish, installBehaviour, createFishGrid };
});
