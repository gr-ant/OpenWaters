'use strict';
// The game's real island, loaded headless in Node. The same script files the browser runs (src/sim/*, config.js,
// worldgen.js, every world/island-*.js stage, seasons-weather.js and the rest), in index.html order, inside one function
// scope with stubbed location / history / matchMedia / localStorage / Engine. This is how the repo's own
// tests/performance.mjs builds the island; nothing is ported or copied. What comes out is the game's SIM_TERRAIN adapter
// (src/js/world/seasons-weather.js), which is exactly the terrain the browser hands to the shared sim, plus the game's
// own water test (waterInfo) and population function (cellFish) for checking the server against.
const fs = require('fs');
const path = require('path');

// the game source: OPENWATERS_REPO, or the local working copy next to this folder
const REPO = process.env.OPENWATERS_REPO
  || path.resolve(__dirname, '../../../hidden_files/openwaters-repo');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

let source = null;
function buildSource() {
  if (source) return source;
  const html = read('src/index.html');
  const island = [...html.matchAll(/js\/(world\/island[\w-]*)\.js/g)].map(m => m[1]);
  const files = ['config', 'world/worldgen', ...island, 'engine/shared', 'shaders/lit', 'world/seasons-weather', 'world/water-temp',
    'world/water-plants-grid', 'world/habitat', 'world/fish-populations', 'models/mesh-builder', 'models/trees', 'creatures/fish',
    'creatures/cephalopods-shellfish', 'creatures/jellies', 'creatures/reptiles-amphibians'];
  const sim = [...html.matchAll(/<script src="(sim\/[\w-]+\.js)">/g)].map(m => read(`src/${m[1]}`));
  const builtins = kind => [...html.matchAll(new RegExp(`data-builtin="${kind}" src="([^"]+)"`, 'g'))].map(m => read(`src/${m[1]}`));
  source = `var BUILTIN = { fish: [], boat: [], tackle: [], feature: [${builtins('feature').join(',')}], plant: [${builtins('plant').join(',')}] };\n`
    + sim.concat(files.map(f => read(`src/js/${f}.js`))).join('\n')
    + `\nif (typeof registerPlants === 'function') registerPlants(BUILTIN.plant);`
    + `\nreturn { CONFIG, SEED, CLIMATE, ENV, SIM, SIM_TERRAIN, FishDB, buildIsland, sample, waterInfo, findWater, cellFish, WATER,
         state: () => ({ SE, SW, SK, SR }) };`;
  return source;
}

// species and birds, as the game registers them at boot (index.html order)
function speciesJson() {
  const html = read('src/index.html');
  return [...html.matchAll(/data-builtin="fish" src="([^"]+)"/g)].map(m => JSON.parse(read(`src/${m[1]}`)));
}
function birdJson() {
  const html = read('src/index.html');
  return [...html.matchAll(/data-builtin="bird" src="([^"]+)"/g)].map(m => JSON.parse(read(`src/${m[1]}`)));
}

// build the island for a seed and climate (what a client gets from #seed-N&climate-C). Returns the game's terrain
// adapter and the game's own queries. ~seconds, so the server caches one per seed + climate.
function loadIsland(seed, climate) {
  const t0 = Date.now();
  const hash = `#seed-${seed >>> 0}&map` + (climate ? `&climate-${climate}` : '');
  // (module / exports are shadowed so the src/sim UMD wrappers take their browser path, as plain scripts)
  const api = new Function('location', 'history', 'matchMedia', 'localStorage', 'Engine', 'module', 'exports', buildSource())(
    { search: `?seed=${seed >>> 0}`, hash }, { replaceState() {} }, () => ({ matches: false }),
    { getItem() { return null; }, setItem() {} }, { tod: 0.4 }, undefined, undefined);
  api.buildIsland(true);
  api.loadMs = Date.now() - t0;
  // the game's water test: waterInfo(x, y).wet is "depth > 0" at the exact (uncached) terrain height
  api.isWater = (x, y) => api.waterInfo(x, y).wet;
  return api;
}

module.exports = { REPO, loadIsland, speciesJson, birdJson };
