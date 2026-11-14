'use strict';
// Shared simulation, the front door. Loaded last of the src/sim/ files: in the game it completes the OWSim namespace (the
// other parts are <script>s before it, see index.html); in Node require('./src/sim/index.js') (or import it) gives the
// whole module. createWorld(...) is what the game builds on (its terrain, clock, CONFIG and FishDB passed in);
// createSim(...) is a headless simulation for a server: a world, its fish cells, the ledger and a fixed tick.
// See src/sim/README.md for what lives where.
(function (factory) {
  if (typeof module === 'object' && module.exports) {
    const parts = [require('./core.js'), require('./species.js'), require('./environment.js'), require('./behaviour.js'), require('./populations.js'), require('./ledger.js'), require('./birds.js')];
    const S = Object.assign({}, ...parts); module.exports = Object.assign(S, factory(S));   // the whole module, as OWSim in the game
  } else { const S = globalThis.OWSim = globalThis.OWSim || {}; Object.assign(S, factory(S)); }
})(function (S) {
  const { mulberry32, hash2, clamp, makeNoise, pickClimate, createSpeciesDB, installEnvironment, installBehaviour, installPopulations,
    createFishGrid, createFishLedger, disturb, spookFish, SEASONS, LAKE } = S;

  // the CONFIG values the simulation reads (the game's src/js/config.js defaults)
  const DEFAULT_CONFIG = {
    startHour: 9, dayLengthSeconds: 2400, daysPerSeason: 5, startSeason: 'spring', startSeasonPart: 0.7, islandSize: 6000,
    maxFish: 1200, fishAbundance: 0.6, shellfishAbundance: 0.5, herpAbundance: 0.3, wildlife: 2, cellMaxAnimals: 60,
    fishRises: true, fishRespawnMinutes: 30, waterTempOffset: 0,
  };

  // A world: seed, climate, config, terrain, species and clock, with the environment, behaviour and populations installed.
  //   seed      island number (as the game's SEED)
  //   climate   'temperate' | 'arctic' | 'tropical' | a climate object | undefined (the seed decides, as in the game)
  //   config    an object with the DEFAULT_CONFIG keys (the game passes its live CONFIG, so Settings apply at once)
  //   terrain   { sample(x, y, out) -> out { level, ground, kind, rap }, flowAt(x, y, kind) -> [fx, fy, speed],
  //               coverAt(x, y, r, live) -> { rocks, weeds, reeds, lilies, wood, coral, anemone, open }, groundAt(x, y),
  //               seaLevel, springs?: [{ x, y }], coverHomes?(cx, cy, cell, cover, kind) -> [[x, y]], murk?(kind) }
  //   species   a species list ({ list, byId, revision, byKind(kind) }: the game's FishDB, or createSpeciesDB), or a
  //             function returning it (the game's FishDB is made by a later script)
  //   tod       (fallback) -> time of day 0..1 (the game: Engine.tod); setTod(t); fxRng: a stream for lightning timing
  function createWorld(o = {}) {
    const seed = o.seed >>> 0, clock = { tod: undefined };
    const climate = o.climate && typeof o.climate === 'object' ? o.climate : pickClimate(seed, o.climate);
    const world = {
      seed, climate, config: o.config || Object.assign({}, DEFAULT_CONFIG), terrain: o.terrain,
      scratch: { level: 0, ground: 0, kind: 0, rap: 0 },   // terrain.sample writes here (read it before sampling again)
      noise: o.noise || makeNoise(seed),                 // the game's nE: the warm current's wobble
      tod: o.tod || (fallback => clock.tod ?? fallback),
      setTod: o.setTod || (t => { clock.tod = t; }),
      fxRng: o.fxRng || mulberry32((seed ^ 0x5f3759df) >>> 0),
    };
    if (typeof o.species === 'function') Object.defineProperty(world, 'species', { get: o.species, enumerable: true });
    else world.species = o.species || createSpeciesDB(climate.key);
    installEnvironment(world); installBehaviour(world); installPopulations(world);
    return world;
  }

  // A stand-in terrain for headless use and tests: NOT the game's island (world/island-*.js is not ported; see README).
  // One round basin of water of the given kind (default a lake) centred on (0, 0), `radius` metres across to the shore and
  // `depth` metres at the middle, a gently rising shore beyond, still water, and seeded patches of rocks and weeds.
  function createSimpleTerrain({ seed = 1, kind = LAKE, radius = 120, depth = 6, seaLevel = 0 } = {}) {
    const nz = makeNoise((seed ^ 0x7e11a) >>> 0);
    const groundAt = (x, y) => { const r = Math.hypot(x, y) / radius;
      return r < 1 ? seaLevel - depth * (1 - r * r) * (0.85 + 0.3 * (nz(x / 40, y / 40) + 0.5)) : seaLevel + (r - 1) * radius * 0.05 + 0.05; };
    return {
      seaLevel, springs: [], kind,
      sample(x, y, o = {}) { o.level = seaLevel; o.ground = groundAt(x, y); o.kind = kind; o.rap = 0; return o; },
      groundAt,
      flowAt() { return [0, 0, 0]; },
      coverAt(x, y, r = 4) {
        const a = nz(x / 25 + 3, y / 25 - 7) + 0.5, b = nz(x / 18 - 5, y / 18 + 2) + 0.5, sh = 1 - clamp(Math.hypot(x, y) / radius, 0, 1);
        const c = { rocks: clamp(a * 0.8 - 0.2, 0, 1), weeds: clamp((b - 0.35) * 1.4, 0, 1) * (0.4 + 0.6 * (1 - sh)), reeds: 0, lilies: 0, wood: hash2(Math.floor(x / 8), Math.floor(y / 8), seed) < 0.05 ? 1 : 0, coral: 0, anemone: 0 };
        c.open = Math.max(0, 1 - c.rocks - c.weeds - c.reeds - c.lilies - c.wood - c.coral);
        return c;
      },
      coverHomes() { return []; },   // no anemones here: species that need one (clownfish) don't appear
    };
  }

  // A headless simulation for a server (or a test): a world from a seed and climate, the fish cells around the players,
  // fish behaviour on a fixed tick, hook claims, catches and the fish-gone ledger. Everything random comes from the seed.
  //   species   raw species JSON objects (src/fish/*.json, in the game's load order), or a ready species list
  //   terrain   see createWorld (default: createSimpleTerrain, a stand-in)
  //   now       () -> ms for the ledger (default: the sim's own clock, so the fish-gone respawn runs on sim time)
  function createSim(o = {}) {
    const seed = o.seed >>> 0, config = Object.assign({}, DEFAULT_CONFIG, o.config);
    const climate = o.climate && typeof o.climate === 'object' ? o.climate : pickClimate(seed, o.climate);
    let db = o.species;
    if (!db || Array.isArray(db)) { const raws = db || []; db = createSpeciesDB(climate.key); for (const r of raws) db.register(r); }
    const clock = { time: 0, tod: config.startHour / 24, dtH: 0, frameDt: 0 };
    const world = createWorld({ seed, climate, config, species: db, terrain: o.terrain || createSimpleTerrain({ seed }),
      tod: fallback => clock.tod ?? fallback, setTod: t => { clock.tod = t; } });
    const rng = mulberry32((hash2(seed, 0x51, 0x5eed) * 4294967296) >>> 0);   // fish decisions and school places
    const events = [], cells = new Map(), grid = createFishGrid();
    let fish = [], players = [], noises = [], cellT = 0;
    const ledger = createFishLedger({ now: o.now || (() => clock.time * 1000), respawnMinutes: () => config.fishRespawnMinutes, onEvent: e => events.push(e) });
    const ctx = {
      get time() { return clock.time; }, get tod() { return clock.tod; }, get dtH() { return clock.dtH; }, get frameDt() { return clock.frameDt; },
      rng, get players() { return players; }, get noises() { return noises; },
      fishAround: (x, y, r, fn) => grid.around(x, y, r, fn),
      lureFor: () => null,                                    // fishing (lures, bites, the fight) stays client-side
      lureArrive(f) { f.state = 'rest'; f.tNext = 0.5; },
      emit(type, f, g) { events.push(g ? { type, id: f && f.id, prey: g.id } : { type, id: f && f.id }); },
    };
    // start of the year as the game does (CONFIG.startSeason, CONFIG.startSeasonPart)
    world.env.setDate((Math.max(0, SEASONS.indexOf(o.season || config.startSeason)) + (o.season ? 0.45 : config.startSeasonPart)) / 4);
    if (o.weather) world.env.setWeather(o.weather);

    const byId = id => fish.find(f => f.id === id) || null;
    const dropFromCells = f => { for (const c of cells.values()) { const i = c.fish.indexOf(f); if (i >= 0) { c.fish.splice(i, 1); return; } } };
    // fish whose fish-gone time is over come back to a cell that is still loaded (the game rebuilds the cell instead,
    // once you've been away); they come back from the same fixed record: same id, home, length and weight
    function respawn() {
      for (const c of cells.values()) {
        if (!c.gone || !c.gone.size) continue;
        const back = [...c.gone].filter(id => !ledger.isGone(id)); if (!back.length) continue;
        const recs = world.cellFish(c.cx, c.cy);
        for (const id of back) {
          c.gone.delete(id); const i = recs.findIndex(r => r.id === id); if (i < 0) continue;
          const f = world.makeFish(recs[i]);
          if (recs[i].lead >= 0) { const L = c.fish.find(q => q.id === recs[recs[i].lead].id); if (L) { f.leader = L; const s = f.len * 1.6 + 0.3; f.ox = (rng() - 0.7) * s * 2; f.oy = (rng() - 0.5) * s * 2; f.oz = (rng() - 0.5) * 0.5; } }
          c.fish.push(f); events.push({ type: 'fish-respawn', id });
        }
      }
    }
    function sync() {
      const centres = players.map(P => [P.x, P.y, P.r ?? 72]);
      if (!centres.length) return;
      const before = new Set(cells.keys());
      world.syncCells(cells, { centres, limit: config.maxFish, rng, isGone: id => ledger.isGone(id), keepCell: c => c.fish.some(f => f.hooked) });
      for (const [k, c] of cells) if (!before.has(k)) {   // remember which of a new cell's fish were gone, to bring them back in time
        const have = new Set(c.fish.map(f => f.id)); c.gone = new Set(world.cellFish(c.cx, c.cy).map(r => r.id).filter(id => !have.has(id) && ledger.isGone(id)));
      }
      respawn();
      fish = []; for (const c of cells.values()) for (const f of c.fish) if (!f.dead) fish.push(f);
    }

    const sim = {
      world, env: world.env, ledger, cells, config, seed, climate, species: db, events, ctx,
      get fish() { return fish; }, get time() { return clock.time; }, get tod() { return clock.tod; },
      // players: [{ id, x, y, inWater, moving, r? }] (r: how far round them fish are simulated, default 72 m)
      setPlayers(list) { players = list.map(p => Object.assign({}, p)); },
      // one fixed tick: the clock, seasons and weather, the fish cells (every 0.4 s), then every fish (no level of detail:
      // a server steps every fish at the full tick)
      step(dt) {
        clock.time += dt; clock.frameDt = dt;
        clock.tod = (clock.tod + dt / config.dayLengthSeconds) % 1;
        clock.dtH = dt / config.dayLengthSeconds * 24;
        world.env.update(clock.dtH, dt);
        if ((cellT -= dt) <= 0) { cellT = 0.4; sync(); }
        grid.rebuild(fish);
        for (const f of fish) if (!f.dead && !f.hooked) world.fishStep(ctx, f, dt);
        noises = noises.filter(n => clock.time - n.t < 1);
        return sim;
      },
      run(seconds, dt = 0.05) { for (let t = 0; t < seconds - 1e-9; t += dt) sim.step(dt); return sim; },
      // a splash, a cast, a boat: fish within its reach (× strength) take fright
      disturb(x, y, s = 1) { disturb(ctx, x, y, s); },
      // frightened at once, away from (x, y), within r metres (a missed strike, a bird hitting the water)
      spook(x, y, r) { let n = 0; for (const f of fish) if (!f.dead && Math.hypot(f.x - x, f.y - y) <= r) { spookFish(f, x, y); n++; } return n; },
      fishById: byId,
      // a hook claim: the first player wins, a second gets { ok: false, reason: 'taken' }
      hook(id, by) {
        const f = byId(id); if (!f || f.dead) return { ok: false, reason: 'gone' };
        const r = ledger.claim(id, by); if (r.ok) { f.hooked = by; f.state = 'hooked'; } return r;
      },
      // off the hook without being landed (it got away, the line broke): free for anyone, and frightened
      unhook(id, by) { const f = byId(id); if (!ledger.unclaim(id, by)) return false; if (f) { f.hooked = false; spookFish(f, f.x, f.y); } return true; },
      // landed: keep -> gone for everyone until it respawns (fish-gone); release -> back in the water, frightened
      land(id, by, keep) {
        const f = byId(id); if (!f) return { ok: false, reason: 'gone' };
        const r = ledger.land(f, by, keep); if (!r.ok) return r;
        if (keep) { dropFromCells(f); fish = fish.filter(q => q !== f); for (const q of fish) if (q.leader === f) q.leader = null;
          const m = /@(-?\d+),(-?\d+)\./.exec(f.id), c = m && cells.get(m[1] + ',' + m[2]); if (c) (c.gone || (c.gone = new Set())).add(f.id); }   // ids: species@cx,cy.kind#group.member
        else { f.hooked = false; spookFish(f, f.x, f.y); }
        return r;
      },
      // what a server would broadcast each tick
      snapshot() { return fish.filter(f => !f.dead).map(f => ({ id: f.id, species: f.species, x: f.x, y: f.y, z: f.z, a: f.a, spd: f.spd, state: f.state, stress: f.stress, hooked: f.hooked || false })); },
      drainEvents() { return events.splice(0); },
    };
    return sim;
  }

  return { DEFAULT_CONFIG, createWorld, createSimpleTerrain, createSim };
});
