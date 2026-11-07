'use strict';
// How well a spot suits a species (habitatScore, envAt), what food is where (foodAvail, foodScore), prey and activity curves.
// how well a spot suits a species (0..1). env: { kind, level, dep, cur, cover }
// the deepest a fish goes here: the bottom, or for a mid-water fish over deep sea, its own depth limit
const fishFloor = (D, wl, g) => D._benthic ? g : Math.max(g, wl - D.habitat.depth_m.max);
function habitatScore(D, env, below, live = true) {
  const H = D.habitat, w = H.waters[WATER_KEYS[env.kind]] || 0; if (!w) return 0;
  const bz = below ?? Math.min(env.dep, Math.max(0.3, H.depth_m.preferred)), T = waterTemp(env.kind, env.level, bz, env.x, env.y, live);
  const tf = fitRange(T, H.temperature_c.min, H.temperature_c.optimal, H.temperature_c.max);   // laying out populations (live = false), a poor growing season counts for more
  // water deeper than the species goes: bottom fish can't use it, mid-water fish just swim above the deep (see fishFloor)
  let df = fitRange(env.dep, H.depth_m.min, H.depth_m.preferred, H.depth_m.max * 1.5);
  if (env.dep > H.depth_m.preferred && !D._benthic) { const Z = D.behavior.depth_zone, zb = (Z.bottom || 0) / ((Z.surface || 0) + (Z.mid || 0) + (Z.bottom || 0) || 1); df += (1 - df) * (1 - zb) ** 2; }
  return w * df * (live ? tf : Math.pow(tf, 2.5))
    * currentFit(env.cur, H) * ((WATER[env.kind].murk + (live && env.kind >= RIVER ? ENV.turb * 0.4 : 0)) > H.turbidity_max ? 0.35 : 1) * (env.cover ? coverFit(env.cover, H) : 1)
    * (0.15 + 0.85 * oxyFit(D, oxygen(env.kind, T, bz, env.rap || 0, live)));
}
function envAt(x, y, withCover = true, live = true) {
  sample(x, y); const kind = SK, level = SW, dep = SW - hW(SE), rap = SR;
  return { x, y, kind, level, dep, rap, ground: level - dep, cur: dep > 0 && kind >= RIVER ? flowAt(x, y, kind)[2] : 0, cover: withCover && dep > 0 ? coverAt(x, y, 3.5, live) : null };
}
// ---- food: what there is to eat, where and when (0..1 per food) ----
// the zones each food is found in: [surface, mid-water, bottom]
const FOOD_ZONES = { insects: [1, 0.35, 0], nymphs: [0.1, 0.45, 1], worms: [0, 0.15, 1], crayfish: [0, 0, 1], fish: [0.3, 1, 0.45], frogs: [1, 0.1, 0],
  snails: [0, 0.2, 1], shrimp: [0, 0.6, 1], plankton: [0.4, 1, 0.1], plants: [0.2, 0.8, 0.6], eggs: [0, 0.1, 1], leeches: [0, 0.4, 1] };
function foodAvail(food, env, T) {
  const k = env.kind, c = env.cover || { rocks: 0.2, weeds: 0.2, reeds: 0.1, lilies: 0.1, wood: 0, open: 0.5 }, hour = (Engine.tod ?? 0.4) * 24, yf = ENV.yf;
  const night = 1 - sstep(5, 7, hour) * (1 - sstep(20, 22, hour)), warm = sstep(5, 15, T), shore = 1 - sstep(1, 3.5, env.dep);
  const veg = Math.min(1, c.weeds + c.reeds + c.lilies + c.wood * 0.6), rocks = Math.min(1, c.rocks + c.wood * 0.5), rap = env.rap || 0;
  const iced = ENV.iced(k, env.dep, env.x, env.y) ? 1 : 0;
  switch (food) {
    case 'insects': return clamp([0, 0.45 + 0.5 * ENV.wind, 0.9, 0.85, 1][k] * warm * (0.15 + 0.85 * ENV.hatch + 0.25 * veg * sstep(0.15, 0.4, yf) * (1 - sstep(0.6, 0.7, yf))) * (1 - iced), 0, 1);
    case 'nymphs': return clamp([0, 0.35, 0.45, 0.9, 1][k] * (0.35 + 0.65 * Math.max(rocks, rap)) * (0.4 + 0.6 * warm) * (1 + 0.5 * ENV.hatch), 0, 1);
    case 'worms': return clamp((k === OCEAN ? 0.1 : 1) * shore * (0.2 + 0.8 * ENV.wet) * (0.5 + 0.5 * warm), 0, 1);
    case 'crayfish': return clamp([0, 0.75, 0.8, 1, 0.8][k] * (0.25 + 0.75 * rocks) * (0.3 + 0.7 * night) * warm, 0, 1);
    case 'fish': return clamp([0.8, 0.7, 0.6, 0.7, 0.5][k] * (0.35 + 0.65 * veg) * (env.dep < 4 ? 1 : 0.6) * (0.5 + 0.5 * warm) * (1 + 0.4 * sstep(0.3, 1, 1 - ENV.light)), 0, 1);
    case 'frogs': return clamp([0, 0.5, 1, 0.3, 0.3][k] * Math.min(1, c.lilies + c.reeds) * sstep(14, 20, T) * (0.35 + 0.65 * night), 0, 1);
    case 'snails': return clamp((k === OCEAN ? 0.5 : 1) * (0.2 + 0.8 * Math.max(c.weeds, c.lilies)) * (0.3 + 0.7 * ENV.growth), 0, 1);
    case 'shrimp': return [1, 0.15, 0.1, 0.35, 0.1][k] * (0.4 + 0.6 * night);
    case 'plankton': return clamp([0.9, 0.8, 0.9, 0.2, 0.05][k] * (0.25 + 0.75 * ENV.growth) * (1 - shore * 0.5), 0, 1);
    case 'plants': return clamp(c.weeds + c.lilies * 0.7, 0, 1) * (0.3 + 0.7 * ENV.growth);
    case 'eggs': return clamp(((k === LAKE || k === POND) ? shore * sstep(0.04, 0.1, yf) * (1 - sstep(0.18, 0.26, yf)) : 0) + (k >= RIVER ? rap * sstep(0.55, 0.6, yf) * (1 - sstep(0.7, 0.76, yf)) : 0), 0, 1);
    case 'leeches': return clamp([0, 0.6, 1, 0.3, 0.2][k] * (1 - rocks) * warm * (0.5 + 0.5 * night), 0, 1);
  }
  return 0.2;
}
// how much of what this species eats is here, and in which zone: { q: 0..1, zone }
function foodScore(D, env, T) {
  const F = D.diet.food, Z = D.diet.feeding_zone, zm = Math.max(Z.surface || 0, Z.mid || 0, Z.bottom || 0) || 1, tot = [0, 0, 0]; let P = 0;
  for (const k in F) { const p = F[k]; if (!p) continue; P += p; const a = foodAvail(k, env, T); if (!a) continue; const fz = FOOD_ZONES[k] || [0.3, 1, 0.5]; for (let z = 0; z < 3; z++) tot[z] += p * a * fz[z]; }
  const w = D._benthic ? [0, 0, 1] : [(Z.surface || 0) / zm, (Z.mid || 0) / zm, (Z.bottom || 0) / zm];
  let best = 2, q = -1; for (let z = 0; z < 3; z++) { const v = tot[z] * w[z]; if (v > q) { q = v; best = z; } }
  return { q: P ? clamp(q / P * 1.6, 0, 1) : 0, zone: ['surface', 'mid', 'bottom'][best] };
}
// what a simulated animal counts as on a predator's menu
const preyFood = D => D.body.plan === 'frog' || D.body.plan === 'salamander' ? 'frogs' : D._herp ? null : D._air ? 'mammals' : ({ fish: 'fish', squid: 'fish', cuttlefish: 'fish', octopus: 'crayfish', crab: 'crayfish', lobster: 'crayfish', shrimp: 'shrimp', snail: 'snails' })[D.body.plan || 'fish'] || null;   // a bass eats frogs and newts; snakes, lizards, turtles and alligators aren't on anyone's menu here
const activityAt = (D, hour) => { const a = D._act, h = ((hour % 24) + 24) % 24, i = Math.floor(h), u = h - i; return a[i] + (a[(i + 1) % 24] - a[i]) * u; };
