'use strict';
// Fish size / weight statistics and the fixed per-cell fish populations (cellFish).
// statistics: individual length (log-normal around the typical size, truncated) and weight (W = a·L^b, with condition noise)
function gauss(rng) { return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(6.2832 * rng()); }
function sampleFishSize(D, rng) {
  const L = D.size.length_cm; let cm = L.typical;
  for (let k = 0; k < 6; k++) { cm = Math.exp(D._mu + D._sig * gauss(rng)); if (cm >= L.min && cm <= L.max) break; }
  cm = clamp(cm, L.min, L.max);
  return { cm, kg: D.size.weight.a * cm ** D.size.weight.b * Math.exp(D.size.condition_sd * gauss(rng)) / 1000 };
}
function poisson(lam, rng) { if (lam <= 0) return 0; if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss(rng))); let k = 0, p = 1; const L = Math.exp(-lam); do { k++; p *= rng(); } while (p > L); return k - 1; }
// Each 16 m cell of water has a fixed population (same seed -> same fish in the same places).
const FISH_CELL = 16;
const WILDLIFE_SCALE = { 1: 0.4, 2: 1, 3: 2.2 };   // the Settings levels: sparse, standard, abundant
function cellFish(cx, cy) {
  const rng = mulberry32((hash2(cx, cy, SEED + 911) * 4294967296) >>> 0), pts = [];
  for (let k = 0; k < 6; k++) { const x = (cx + 0.08 + 0.84 * rng()) * FISH_CELL, y = (cy + 0.08 + 0.84 * rng()) * FISH_CELL; sample(x, y); if (SW - hW(SE) > 0.3) pts.push([x, y, SK]); }
  const out = [];
  for (const kind of new Set(pts.map(p => p[2]))) { // a cell can hold two waters (a creek mouth, say): each gets its own fish
    const here = pts.filter(p => p[2] === kind), area = FISH_CELL * FISH_CELL * here.length / 6, env = envAt(here[0][0], here[0][1], true, false);
    for (const [D, si] of FishDB.byKind(kind)) {   // only species that live in this kind of water
      if (out.length >= CONFIG.cellMaxAnimals) break;   // later species cannot add a group
      const Ck = D._needCover, req = !!Ck;
      const s = habitatScore(D, req ? Object.assign({}, env, { cover: { [Ck]: 1 } }) : env, undefined, false); if (s < 0.02) continue;   // laid out for midsummer: in other seasons fish move rather than vanish
      const Sc = D.population.school, mean = (Sc.min + Sc.max) / 2;
      // each species draws from its own random stream and numbers its own fish, so adding or removing a species
      // never changes (or resurrects) the others
      const rs = mulberry32((hash2(cx * 7 + kind, cy, SEED + D._hid) * 4294967296) >>> 0);
      let groups = poisson(D.population.density * s * area / 100 * WILDLIFE_SCALE[CONFIG.wildlife] * (D._shell ? CONFIG.shellfishAbundance : D._herp ? CONFIG.herpAbundance : CONFIG.fishAbundance) / mean, rs);
      if (D._herp) groups = Math.min(groups, 2);   // reptiles and amphibians: two at most per cell
      if (!groups) continue;
      let homes = null;
      if (req) { // e.g. clownfish: each group lives on one anemone
        const want = COVER_PLANT[Ck] || [];
        homes = []; for (let gy = Math.ceil(cy * FISH_CELL / 2.5); gy * 2.5 < (cy + 1) * FISH_CELL; gy++) for (let gx = Math.ceil(cx * FISH_CELL / 2.5); gx * 2.5 < (cx + 1) * FISH_CELL; gx++) if (want.includes(plantAt(gx, gy)) && PL.kd === kind) homes.push([PL.x, PL.y]);
        if (!homes.length) continue; groups = Math.min(groups, homes.length);
      }
      for (let g = 0; g < groups && out.length < CONFIG.cellMaxAnimals; g++) {
        const n = D._herp ? 1 : Math.round(Sc.min + rs() * (Sc.max - Sc.min)), [hx, hy] = homes ? homes[g] : here[rs() * here.length | 0], lead = out.length;
        for (let k = 0; k < n; k++) out.push({ si, id: `${D.id}@${cx},${cy}.${kind}#${g}.${k}`, hx: hx + (rs() - 0.5) * (homes ? 0.6 : 3), hy: hy + (rs() - 0.5) * (homes ? 0.6 : 3), size: sampleFishSize(D, rs), lead: k ? lead : -1, r: rs() });
      }
    }
  }
  return out;
}
