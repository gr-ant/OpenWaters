'use strict';
// The game's world for the shared simulation (src/sim/): the browser adapter. Seasons and weather (the ENV state
// machine), water temperature, habitat, food and the fixed fish populations now live in src/sim/; this builds the world
// they run in from the game's own pieces (the island's sample() and its globals, the plant grid, CONFIG, FishDB, the
// engine's clock) and keeps the old global names (ENV, SEASONS, WEATHER, ...) for the rest of the game. Then the start of
// the year, from CONFIG / #season- / #weather- in the address.
// the island, as the simulation sees it: sample() leaves its answers in globals (SE, SW, SK, SR); the simulation wants them
// in an object it passes in
const SIM_TERRAIN = {
  sample(x, y, o) { sample(x, y); o.level = SW; o.ground = hW(SE); o.kind = SK; o.rap = SR; return o; },
  flowAt: (x, y, kind) => flowAt(x, y, kind),
  coverAt: (x, y, r, live) => coverAt(x, y, r, live),
  groundAt: (x, y) => groundAt(x, y),
  murk: k => WATER[k].murk,
  get seaLevel() { return WLW; },
  get springs() { return ISL ? ISL.springs : null; },
  // where a species that needs one kind of cover can live in cell (cx, cy): the plants giving it, in that water (a clownfish's anemones)
  coverHomes(cx, cy, cell, Ck, kind) {
    const want = COVER_PLANT[Ck] || [], homes = [];
    for (let gy = Math.ceil(cy * cell / 2.5); gy * 2.5 < (cy + 1) * cell; gy++) for (let gx = Math.ceil(cx * cell / 2.5); gx * 2.5 < (cx + 1) * cell; gx++) if (want.includes(plantAt(gx, gy)) && PL.kd === kind) homes.push([PL.x, PL.y]);
    return homes;
  },
};
const engineTod = fallback => { try { return Engine.tod ?? fallback; } catch (e) { return fallback; } };   // safe before the engine exists
const SIM = OWSim.createWorld({
  seed: SEED, climate: CLIMATE, config: CONFIG, terrain: SIM_TERRAIN, noise: nE,
  species: () => FishDB,   // (made by creatures/reptiles-amphibians.js)
  tod: engineTod, setTod: t => { try { Engine.tod = t; } catch (e) { /* not started yet */ } },
  fxRng: Math.random,      // lightning timing: not part of the shared state
});
const { SEASONS, WEATHER, WEATHER_NEXT } = OWSim;
const ENV = SIM.env;
const todNow = () => engineTod(CONFIG.startHour / 24);   // time of day 0..1
{ // start of the year: CONFIG.startSeason, or #season-autumn (and #weather-rain) in the address
  const hs = (HASH.match(/season-(spring|summer|autumn|fall|winter)/) || [])[1], hw = (HASH.match(/weather-(\w+)/) || [])[1];
  const S = (hs === 'fall' ? 'autumn' : hs) || CONFIG.startSeason;
  ENV.setDate((Math.max(0, SEASONS.indexOf(S)) + (hs ? 0.45 : CONFIG.startSeasonPart)) / 4);
  if (hw) ENV.setWeather(hw);
}
