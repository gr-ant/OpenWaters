'use strict';
// Shared simulation, part 2: species. Species are data (src/fish/*.json, format unchanged): this fills a definition's
// defaults (FISH_DEFAULTS, merged the way the game always has) and works out the fields the simulation reads (_mu, _sig,
// _hid, _act, _herp, _shell, _air, _benthic, _jelly, _needCover). The game's FishDB (creatures/reptiles-amphibians.js)
// adds the body-plan checks and the meshes on top; a server can use prepareSpecies / createSpeciesDB on their own.
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else { const S = globalThis.OWSim = globalThis.OWSim || {}; Object.assign(S, factory(S)); }
})(function (S) {
  const { clamp, WATER_KEYS } = S;
  const FISH_SCHEMA = 'embercrown-fish/1';
  const FISH_DEFAULTS = {
    schema: FISH_SCHEMA, id: '', name: '', scientific: '', description: '',
    size: { length_cm: { min: 10, typical: 25, max: 50, spread: 0.25 }, weight: { a: 0.01, b: 3.0 }, condition_sd: 0.08 },
    body: {
      profile: [0.5, 0.82, 0.97, 1, 0.92, 0.72, 0.46, 0.28], height: 0.2, width: 0.11, flex: 1,
      head: { length: 0.24, snout: 0.5, mouth: 0.5, jaw: 'terminal', bill: 0, bill_kind: 'spear' },
      tail: { shape: 'forked', size: 0.18, fork: 0.25 },
      fins: { dorsal: [{ at: 0.42, length: 0.14, height: 0.1, spiny: false }], adipose: false, anal: { at: 0.72, length: 0.1, height: 0.07 }, pectoral: 0.1, pelvic: 0.07 },
      barbels: 0, plan: 'fish', parts: {},
      lie: '', swim: 'auto',   // lie: 'left' / 'right' = a flatfish lying on that side (eyes on the other); swim: how the body moves
      colors: { back: '#4a4a30', flank: '#a09060', belly: '#eee4c8', fins: '#7a6a48', eye: '#101010', mouth: '#5a1e1a' },
      pattern: [],
    },
    habitat: {
      climates: null,                     // island climates it lives in, e.g. ["temperate", "arctic"]; null = any (water temperature decides)
      waters: { lake: 0.5, pond: 0.5, river: 0.5, creek: 0.5 },
      depth_m: { min: 0.3, preferred: 2, max: 10 },
      temperature_c: { min: 4, optimal: 18, max: 28 },
      current_ms: { preferred: 0, max: 1 },
      turbidity_max: 0.8,
      cover: { rocks: 0.4, weeds: 0.4, reeds: 0.3, lilies: 0.3, wood: 0.3, coral: 0, anemone: 0, open: 0.4 },
      cover_required: 0,                  // 0..1: 1 = only found where its favourite cover is (a clownfish and its anemone)
      oxygen_min_mgL: 4,                  // below this (dissolved oxygen) the fish is stressed and leaves
    },
    population: { density: 0.6, school: { min: 1, max: 1 }, home_range_m: 15 },
    activity: { pattern: 'crepuscular' },
    behavior: { cruise_bl_s: 0.8, burst_bl_s: 8, turn_rate: 2.2, station_holding: 0, ambush: 0,
      depth_zone: { surface: 0.15, mid: 0.5, bottom: 0.35 }, wariness: 0.5, spook_m: 5, recover_s: 40, curiosity: 0.4, rise_per_hour: 1,
      // air breathers (marine mammals): seconds between breaths, seconds at the surface, leaps an hour, how much it hauls
      // out on shore to rest (0..1), and how big a blow it shows when it surfaces (0 none .. 1 a whale's spout)
      breath_hold_s: 0, surface_s: 5, leap_per_hour: 0, haul_out: 0, blow: 0 },
    diet: { food: { insects: 0.3, worms: 0.3, fish: 0.2, nymphs: 0.2 }, piscivore_from_cm: 0, feeding_zone: { surface: 0.2, mid: 0.4, bottom: 0.4 }, meals_per_day: 3 },
    fight: { strength: 0.5, stamina: 0.5, jumps: 0.2, runs: 0.5, teeth: 0 },   // teeth 0..1: how easily it bites through line (a wire leader stops it)
    // once it's unhooked. lip: true = can be held by the lower jaw (bass, crappie, trout), false = not (teeth, a small or
    // underslung mouth, a bill). hold: 'hand' (one hand round it), 'cradle' (two hands under the belly) or 'none' (too big or
    // too dangerous to lift: it is unhooked in the water, alongside). 'auto' works either out from the body (fishHandling).
    handling: { lip: 'auto', hold: 'auto' },
  };
  const FISH_REPLACE = new Set(['waters', 'cover', 'food', 'feeding_zone', 'depth_zone', 'dorsal', 'pattern', 'profile']);
  const ACTIVITY_PRESETS = { // relative activity for each hour 0..23
    diurnal: [.15, .12, .1, .1, .12, .25, .5, .75, .9, 1, 1, .95, .9, .9, .95, 1, 1, .95, .85, .6, .4, .3, .22, .18],
    crepuscular: [.3, .25, .22, .25, .45, .85, 1, .95, .7, .5, .4, .35, .32, .35, .4, .5, .65, .85, 1, 1, .8, .55, .42, .35],
    nocturnal: [.95, 1, 1, .95, .85, .7, .45, .3, .2, .15, .12, .12, .12, .12, .15, .2, .3, .45, .7, .9, 1, 1, 1, 1],
    cathemeral: [.5, .48, .45, .45, .5, .65, .75, .75, .7, .65, .6, .6, .6, .6, .62, .65, .7, .75, .8, .75, .65, .58, .55, .52],
  };
  const FISH_FOODS = ['insects', 'nymphs', 'worms', 'crayfish', 'fish', 'frogs', 'snails', 'shrimp', 'plankton', 'plants', 'eggs', 'leeches', 'mammals'];
  // defaults under a definition: objects merge key by key, anything else (and any key in `replace`) is taken whole
  function deepMerge(base, over, replace, key) {
    if (over === undefined) return base;
    if (Array.isArray(base) || Array.isArray(over) || (replace && replace.has(key)) || typeof base !== 'object' || base === null || typeof over !== 'object' || over === null) return over;
    const o = {}; for (const k of new Set([...Object.keys(base), ...Object.keys(over)])) o[k] = deepMerge(base[k], over[k], replace, k); return o;
  }
  const fishMerge = (base, over) => deepMerge(base, over, FISH_REPLACE);
  const HERP_PLANS = ['turtle', 'crocodilian', 'lizard', 'salamander', 'snake', 'frog'];
  // the fields the simulation reads, worked out once when a species is registered (the same in the game and on a server)
  function deriveSpecies(d) {
    d._act = typeof d.activity.pattern === 'string' ? ACTIVITY_PRESETS[d.activity.pattern] : d.activity.pattern.map(v => clamp(v, 0, 1));
    d._herp = HERP_PLANS.includes(d.body.plan);   // reptiles and amphibians
    d._shell = !!d.body.plan && !['fish', 'ray', 'pinniped'].includes(d.body.plan) && !d._herp;   // rays and mammals count with fishAbundance, herps with herpAbundance
    d._air = d.behavior.breath_hold_s > 0;   // breathes air: surfaces to blow, may leap, may haul out
    d._hid = [...d.id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;   // stable per-species seed (all 32 bits: 16 gave two species the same one)
    d._needCover = (d.habitat.cover_required || 0) >= 0.5 ? Object.keys(d.habitat.cover).filter(k => k !== 'open').sort((a, b) => d.habitat.cover[b] - d.habitat.cover[a])[0] : null;   // e.g. a clownfish's anemone
    d._jelly = d.body.plan === 'jelly';   // drawn see-through in their own pass; may sting
    d._benthic = ['bivalve', 'snail', 'crab', 'lobster', 'octopus'].includes(d.body.plan) || (['ray', 'jelly'].includes(d.body.plan) && d.body.parts.bottom >= 0.5);   // crawlers, sessile animals and stingrays live on the bed
    const L = d.size.length_cm; d._mu = Math.log(L.typical); d._sig = L.spread;
    return d;
  }
  // defaults and derived fields without the game's body-plan checks and meshes (enough to simulate it: a server).
  // The game registers through FishDB, which validates the body as well; the simulation fields come out the same.
  function prepareSpecies(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.id) return null;
    const d = fishMerge(FISH_DEFAULTS, raw);
    if (d.body === FISH_DEFAULTS.body) d.body = Object.assign({}, d.body);   // (never write into the shared defaults)
    d.body.parts = Object.assign({}, raw.body && raw.body.parts);   // only 'bottom' matters to the simulation (unset = 0, as in the game's plans)
    if (!('_zmin' in d)) d._zmin = 0;   // the game reads the lowest point of the mesh; without meshes, animals rest on the bed at its surface
    return deriveSpecies(d);
  }
  // species that can live in each kind of water on this island's climate, in list order (so cells come out the same as
  // scoring every species); fish first, then reptiles and amphibians, then shellfish: a cell fills in this order
  function speciesByKind(db, kind, climateKey) {
    if (db._kindRev !== db.revision || db._kindClimate !== climateKey) { db._kindRev = db.revision; db._kindClimate = climateKey; db._kind = WATER_KEYS.map(W => db.list.map((D, si) => [D, si]).filter(([D]) => (D.habitat.waters[W] || 0) > 0 && (!D.habitat.climates || D.habitat.climates.includes(climateKey))).sort((a, b) => (a[0]._shell ? 2 : a[0]._herp ? 1 : 0) - (b[0]._shell ? 2 : b[0]._herp ? 1 : 0))); }
    return db._kind[kind] || [];
  }
  // a species list for a server (the game has FishDB): register(raw) in the game's load order (index.html), then byKind
  function createSpeciesDB(climateKey) {
    const db = {
      list: [], byId: {}, revision: 0,
      register(raw) { const d = prepareSpecies(raw); if (!d) return null; const old = this.byId[d.id];
        if (old) this.list[this.list.indexOf(old)] = d; else this.list.push(d); this.byId[d.id] = d; this.revision++; return d; },
      byKind(kind) { return speciesByKind(this, kind, climateKey); },
    };
    return db;
  }

  return { FISH_SCHEMA, FISH_DEFAULTS, FISH_REPLACE, ACTIVITY_PRESETS, FISH_FOODS, deepMerge, fishMerge, HERP_PLANS, deriveSpecies, prepareSpecies, speciesByKind, createSpeciesDB };
});
