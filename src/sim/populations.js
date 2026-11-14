'use strict';
// Shared simulation, part 4: fixed fish populations. Each 16 m cell of water has a fixed population (same seed -> same
// fish in the same places, with the same ids, homes, lengths and weights); makeFish turns a record into a live animal,
// syncCells keeps the cells around the players (or lures) populated under a cap. installPopulations(world) adds these.
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else { const S = globalThis.OWSim = globalThis.OWSim || {}; Object.assign(S, factory(S)); }
})(function (S) {
  const { mulberry32, hash2, poisson, sampleFishSize, fitRange } = S;
  const FISH_CELL = 16;
  const WILDLIFE_SCALE = { 1: 0.4, 2: 1, 3: 2.2 };   // the Settings levels: sparse, standard, abundant

  function installPopulations(world) {
    const terr = world.terrain;
    // The fixed population of cell (cx, cy): records { si, id, hx, hy, size: { cm, kg }, lead, r }.
    function cellFish(cx, cy) {
      const C = world.config, SEED = world.seed, db = world.species;
      const rng = mulberry32((hash2(cx, cy, SEED + 911) * 4294967296) >>> 0), pts = [];
      for (let k = 0; k < 6; k++) { const x = (cx + 0.08 + 0.84 * rng()) * FISH_CELL, y = (cy + 0.08 + 0.84 * rng()) * FISH_CELL, s = terr.sample(x, y, world.scratch); if (s.level - s.ground > 0.3) pts.push([x, y, s.kind]); }
      const out = [];
      for (const kind of new Set(pts.map(p => p[2]))) { // a cell can hold two waters (a creek mouth, say): each gets its own fish
        const here = pts.filter(p => p[2] === kind), area = FISH_CELL * FISH_CELL * here.length / 6, env = world.envAt(here[0][0], here[0][1], true, false);
        for (const [D, si] of db.byKind(kind)) {   // only species that live in this kind of water
          if (out.length >= C.cellMaxAnimals) break;   // later species cannot add a group
          const Ck = D._needCover, req = !!Ck;
          const s = world.habitatScore(D, req ? Object.assign({}, env, { cover: { [Ck]: 1 } }) : env, undefined, false); if (s < 0.02) continue;   // laid out for midsummer: in other seasons fish move rather than vanish
          const Sc = D.population.school, mean = (Sc.min + Sc.max) / 2;
          // each species draws from its own random stream and numbers its own fish, so adding or removing a species
          // never changes (or resurrects) the others
          const rs = mulberry32((hash2(cx * 7 + kind, cy, SEED + D._hid) * 4294967296) >>> 0);
          let groups = poisson(D.population.density * s * area / 100 * WILDLIFE_SCALE[C.wildlife] * (D._shell ? C.shellfishAbundance : D._herp ? C.herpAbundance : C.fishAbundance) / mean, rs);
          if (D._herp) groups = Math.min(groups, 2);   // reptiles and amphibians: two at most per cell
          if (!groups) continue;
          let homes = null;
          if (req) { // e.g. clownfish: each group lives on one anemone (the terrain knows where its cover grows)
            homes = terr.coverHomes ? terr.coverHomes(cx, cy, FISH_CELL, Ck, kind) : [];
            if (!homes.length) continue; groups = Math.min(groups, homes.length);
          }
          for (let g = 0; g < groups && out.length < C.cellMaxAnimals; g++) {
            const n = D._herp ? 1 : Math.round(Sc.min + rs() * (Sc.max - Sc.min)), [hx, hy] = homes ? homes[g] : here[rs() * here.length | 0], lead = out.length;
            for (let k = 0; k < n; k++) out.push({ si, id: `${D.id}@${cx},${cy}.${kind}#${g}.${k}`, hx: hx + (rs() - 0.5) * (homes ? 0.6 : 3), hy: hy + (rs() - 0.5) * (homes ? 0.6 : 3), size: sampleFishSize(D, rs), lead: k ? lead : -1, r: rs() });
          }
        }
      }
      return out;
    }
    // a live animal from a population record (or a spawned one): where it is, its fixed size, and its starting state
    function makeFish(sp) {
      const D = world.species.list[sp.si], s = terr.sample(sp.hx, sp.hy, world.scratch); const wl = s.level, g0 = s.ground, SK = s.kind, g = world.fishFloor(D, wl, g0), Lr = D.size.length_cm, T = world.waterTemp(SK, wl, (wl - g) * 0.5, sp.hx, sp.hy), H = D.habitat.temperature_c, z0 = D._benthic ? g + Math.max(0.01, -D._zmin * sp.size.cm / 100) + 0.01 : g + (wl - g) * 0.5;
      return { temp: T, tfit: fitRange(T, H.min, H.optimal, H.max), id: sp.id, sp: sp.si, def: D, species: D.id, name: D.name, lengthCm: sp.size.cm, weightKg: sp.size.kg, len: sp.size.cm / 100,
        x: sp.hx, y: sp.hy, z: z0, a: sp.r * 6.2832, spd: 0, homeX: sp.hx, homeY: sp.hy, kd: SK, wl, ground: g0,
        state: 'rest', zone: null, tx: sp.hx, ty: sp.hy, tz: z0, tNext: sp.r * 3, hunger: 0.3 + 0.6 * sp.r, stress: 0, act: 0.5, air: D.behavior.breath_hold_s * sp.r, pitch: 0,
        fx: 0, fy: 0, cur: 0, ph: sp.r * 6.28, tint: 0.35 + 0.3 * sp.r, leader: null, lead: sp.lead, ox: 0, oy: 0, oz: 0,
        sizeRank: (sp.size.cm - Lr.min) / Math.max(1, Lr.max - Lr.min) };
    }
    // keep as many whole groups (a school with its leader, or a single fish) as fit in `room`, picked in a fixed
    // pseudo-random order so no species is always the one left out; followers never lose their leader
    function trimCell(fish, room) {
      const members = new Set(fish), groups = new Map(); for (const f of fish) { const k = f.leader && members.has(f.leader) ? f.leader : f; (groups.get(k) || groups.set(k, []).get(k)).push(f); }
      const keep = new Set(); let n = 0;
      for (const [k, g] of [...groups].sort((a, b) => a[0].tint - b[0].tint)) if (n + g.length <= room) { g.forEach(f => keep.add(f)); n += g.length; }
      return fish.filter(f => keep.has(f));
    }
    // Keep the cells around `centres` ([x, y, r] circles: players, a lure far out) populated, nearest first, at most
    // `limit` animals in all and `perCall` new cells a call. cells: Map 'cx,cy' -> { cx, cy, fish }. keepCell(c): hold on
    // to a cell out of range (a fish on someone's line); isGone(id): caught and kept (see sim/ledger.js); rng: the school
    // members' places around their leader (the game passes Math.random, a server its seeded stream).
    function syncCells(cells, { centres, limit, keepCell = () => false, isGone = () => false, rng, perCall = 3 }) {
      const cs = FISH_CELL, far = (x, y) => Math.min(...centres.map(([cx, cy, r]) => Math.hypot(x - cx, y - cy) - r));   // < 0 inside a circle
      for (const [k, c] of cells) if (far((c.cx + 0.5) * cs, (c.cy + 0.5) * cs) > 24 && !keepCell(c)) cells.delete(k);
      const want = [], seen = new Set();
      for (const [x0, y0, r] of centres) { const ccx = Math.floor(x0 / cs), ccy = Math.floor(y0 / cs), rc = Math.ceil(r / cs);
        for (let dy = -rc; dy <= rc; dy++) for (let dx = -rc; dx <= rc; dx++) { const cx = ccx + dx, cy = ccy + dy, k = cx + ',' + cy, d = far((cx + 0.5) * cs, (cy + 0.5) * cs);
          if (d < 0 && !seen.has(k)) { seen.add(k); want.push([d, cx, cy]); } } }
      want.sort((a, b) => a[0] - b[0]);
      let total = 0, added = 0;
      for (const c of cells.values()) { c.fish = c.fish.filter(f => !f.dead); total += c.fish.length; }
      if (total > limit) {
        let room = limit;
        const sorted = [...cells.values()].sort((a, b) => far((a.cx + 0.5) * cs, (a.cy + 0.5) * cs) - far((b.cx + 0.5) * cs, (b.cy + 0.5) * cs));
        for (const c of sorted) { if (c.fish.length > room) c.fish = trimCell(c.fish, room); room -= c.fish.length; }
        total = limit - room;
      }
      for (const [, cx, cy] of want) {
        const key = cx + ',' + cy; if (cells.has(key)) continue;
        if (total >= limit || added >= perCall) break;   // a few cells per tick keeps frames smooth
        const all = cellFish(cx, cy).map(sp => makeFish(sp));
        all.forEach(f => { if (f.lead >= 0) { f.leader = all[f.lead]; const s = f.len * 1.6 + 0.3; f.ox = (rng() - 0.7) * s * 2; f.oy = (rng() - 0.5) * s * 2; f.oz = (rng() - 0.5) * 0.5; } });
        let fish = all.filter(f => !isGone(f.id));
        if (fish.length > limit - total) fish = trimCell(fish, limit - total);   // never past the cap
        cells.set(key, { cx, cy, fish }); total += fish.length; added++;
      }
      return cells;
    }
    Object.assign(world, { FISH_CELL, WILDLIFE_SCALE, cellFish, makeFish, trimCell, syncCells });
    return world;
  }

  return { FISH_CELL, WILDLIFE_SCALE, installPopulations };
});
