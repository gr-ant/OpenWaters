# src/sim — the shared fish and bird simulation

One simulation module for both the single-file HTML game (`python3 build.py` → `Open Waters.html`) and a Node
multiplayer server. It has no browser globals: no `window`, `document`, `localStorage`, `Engine`, rendering or
`Math.random`. Everything random comes from a stream that is passed in or made from the seed. The species data stays
JSON in `src/fish/*.json`, in the same format.

Each file is a plain script that works both ways. In the game, it is a `<script>` in `src/index.html` that adds to the
`OWSim` namespace (no `import`/`export`, so `build.py` inlines it like any other script). In Node, a
`module.exports` fallback means `require('./src/sim/index.js')` or `import S from './src/sim/index.js'` returns the whole
module.

## Files, and what moved where

| file | what | moved from |
|---|---|---|
| `core.js` | seeded RNG (`mulberry32`, `hash2`, `cellRng`), `gauss`, `poisson`, `sampleFishSize`, `makeNoise`, `clamp`, `sstep`, preference curves (`fitRange`, `currentFit`, `coverFit`), water kinds, `CLIMATES`, `pickClimate` | `world/worldgen.js`, `engine/shared.js`, `world/fish-populations.js`, `world/water-plants-grid.js` |
| `species.js` | `FISH_DEFAULTS` and merge rules, `ACTIVITY_PRESETS`, `deriveSpecies` (the derived `_act`, `_hid`, `_benthic`, … fields), `prepareSpecies`, `speciesByKind`, `createSpeciesDB` | `creatures/fish.js`, `creatures/reptiles-amphibians.js` (FishDB) |
| `environment.js` | seasons and weather (the `ENV` state machine), water temperature, springs, warm current, pack ice, oxygen, `habitatScore`, `envAt`, food, activity | `world/seasons-weather.js`, `world/water-temp.js`, `world/habitat.js` |
| `populations.js` | `cellFish` (the fixed population of each 16 m cell: stable ids, fixed home, length and weight, wildlife scaling, cell cap), `makeFish`, `trimCell`, `syncCells` | `world/fish-populations.js`, `engine/fish-cells.js` |
| `behaviour.js` | fish decisions and movement (rest, cruise, forage, hunt, hold, flee, school, haul out, breathe, leap), prey, strikes, spooking by swimmers, people on the bank, splashes and predators (`fishThreat`), `disturb`, `spookFish`, a fish grid | `engine/fish-behaviour.js`, `engine/fish-update.js` |
| `birds.js` | what scares a bird: `birdSpooked` (flush), `flightlessSpooked` + `fleeSpot` (penguins waddle to the sea, then swim or dive), `birdScatter` (a diving bird scatters the fish below) | `birds/birds.js` |
| `ledger.js` | `createFishLedger`: hook claims (the first claim wins; a second gets `taken`), catches (kept → `fish-gone` for everyone until it respawns; released → it stays) | `engine/fish-cells.js`, `fishing/fight.js` |
| `index.js` | `createWorld` (what the game builds on), `createSim` (a headless sim on a fixed tick, for a server), `createSimpleTerrain` (a stand-in terrain), `DEFAULT_CONFIG` | new |

The code was moved as it was, and the browser now runs the moved code. Solo play is unchanged. Two checks show this.
`tests/performance.mjs` digests terrain, plants, cover and `cellFish` populations for seed 42 in all three climates at
all three wildlife levels, and the digests are identical before and after the move. And the engine's own fish loop
(`updateFish`, run with the same random stream for 3 × 3,600 frames with a swimmer, splashes and kept catches) produced
identical fish positions and states, frame for frame.

## In the HTML game

`src/index.html` loads `sim/core.js` … `sim/index.js` straight after `js/config.js`. The browser side is a thin layer of
adapters, and the old global names stay, so the rest of the game did not change:

- `js/world/seasons-weather.js` is the browser adapter for the world. It builds `SIM = OWSim.createWorld(...)` from
  the game's island (`sample()` and its globals `SE/SW/SK/SR`, `flowAt`, `coverAt`, the plant grid for clownfish
  anemones), the live `CONFIG`, `FishDB` and `Engine.tod`, and sets the start of the year. `ENV` is `SIM.env`.
- `js/world/water-temp.js`, `js/world/habitat.js`, `js/world/fish-populations.js`: aliases (`waterTemp`,
  `habitatScore`, `cellFish`, … are `SIM`'s).
- `js/engine/fish-behaviour.js`: `FISH_CTX` hands the shared behaviour the engine's clock, you (swimming, wading or
  moving), its noises, fish grid, your lure, `Engine.lureArrive` (the bite decision), `Game.emit`, and the effects
  (rise rings, drops, blows, splashdowns). The `Engine.fishStep`, `fishDecide`, … methods delegate to it.
- `js/engine/fish-cells.js`: `syncFishCells` uses `SIM.syncCells`. `isGone` and `removeFish` use a ledger stored in
  localStorage under the same key as before. `js/engine/fish-update.js` `fishStrike` and `js/fishing/fight.js`
  `releaseFish` (`fishLedger.restore`) use the shared code too.
- `js/creatures/fish.js` and `js/creatures/reptiles-amphibians.js`: `FISH_DEFAULTS`, the merge rules and
  `deriveSpecies` / `speciesByKind` are the shared ones. Meshes and body-plan validation stay in the game.
- `js/world/worldgen.js` and `js/engine/shared.js`: `mulberry32`, `makeNoise`, `hash2`, `CLIMATES` and `pickClimate`
  are the shared ones.
- `js/birds/birds.js`: flush, waddle-off and dive-scatter decisions call `OWSim.birdSpooked`, `flightlessSpooked`,
  `fleeSpot` and `birdScatter`.

In the browser, fish decisions use `Math.random`, as they always did. The browser adapter passes it in, and populations
are seeded either way. A server passes a seeded stream instead.

## In Node

```js
import S from './src/sim/index.js';            // or require('./src/sim/index.js')
const species = [/* src/fish/*.json objects, in index.html order */];
const sim = S.createSim({ seed: 42, climate: 'temperate', species /*, terrain, config: { wildlife: 2 }, now */ });
sim.setPlayers([{ id: 'ann', x: 0, y: 0, inWater: false, moving: true }]);
setInterval(() => { sim.step(0.05); broadcast(sim.snapshot(), sim.drainEvents()); }, 50);   // 20 Hz
sim.hook(fishId, 'ann');                  // { ok: true } or { ok: false, reason: 'taken' | 'gone' }
sim.land(fishId, 'ann', true);            // kept: fish-gone for everyone until config.fishRespawnMinutes pass
sim.land(fishId, 'ann', false);           // released: stays in the water
sim.unhook(fishId, 'ann');                // got away: anyone may hook it
sim.disturb(x, y, 1); sim.spook(x, y, r); // splashes and scares
```

`tests/sim-smoke.mjs` runs all of this in plain Node: `node tests/sim-smoke.mjs`.

## What stays in the browser

Rendering (meshes, GPU batches, LOD meshes, the fish finder), input, the camera and Engine state, particles and ripples
(passed in as `ctx.fx`), sounds, the HUD, and the whole fishing mechanic: casting, lures following and bites
(`lureFor` / `lureArrive`), the fight physics, landing, hands, nets and traps, and the rod holder. The server only needs
the hook claim and the fish's state; the fight can stay client-side. Bird flight, perches, flocks and colonies also stay
in the browser (only the spook decisions are shared), as do admin-spawned and tutorial fish, the journal and saves.

## What is still simplified

- **Terrain: not ported.** The real island generator (`js/world/island-layout.js`, `island-water.js` and the other
  `island-*.js` stages, plus `water-plants-grid.js` for cover) is not in `src/sim/`. The simulation takes a terrain
  interface instead (see `createWorld` in `index.js`). `createSimpleTerrain` is a stand-in: one round lake, no rivers,
  sea, currents, springs or anemones. Fish on it are *not* the game's fish. This is the same gap as the Python
  server's `SimpleTerrain`. A server must use the real island, or its fish ids, homes and positions will not match the
  clients', and hook claims would point at fish that don't exist. The practical route today is to load the
  `island-*.js` scripts headless, the way `tests/performance.mjs` and `tests/birds.mjs` already do (stubbed
  `location` / `history` / `matchMedia` / `localStorage`, then `buildIsland(true)`, about 2 s for seed 42), and wrap
  `sample` / `flowAt` / `coverAt` / `plantAt` the way `SIM_TERRAIN` in `js/world/seasons-weather.js` does. Turning that
  into a proper module (the generator reads `CONFIG`, `SEED` and `CLIMATE` as script globals) is the next step.
- `createSim` steps every fish at the full tick. There is no level of detail like the game's 30/15/8 Hz for far fish.
- On the server, a hooked fish holds still (`state: 'hooked'`), and nothing follows lures (`lureFor` returns null).
- Respawn: the game brings a gone fish back when its cell is rebuilt after you've been away (real minutes,
  `Date.now`). `createSim` also returns it to a cell that is still loaded, with the same id and record, and its clock
  is sim time unless you pass `now`.
- In solo play, the browser adapter does not call hook claims. With one angler there is nothing to contest.

## Still to decide (Grant)

1. Terrain for the server: load the real island scripts headless (recommended, works today in the tests), or port
   `island-*.js` into `src/sim/`.
2. Who owns fish movement in multiplayer: the server, broadcasting positions (as `createSim` is built for), or each
   client simulating with a shared seeded stream and syncing only events.
3. Respawn semantics for multiplayer (real time or sim time, and whether a fish should reappear in a loaded cell).
4. When a room code is present, where `bites.js` / `fight.js` should call `hook`, `land` and `unhook`. That touches the
   fishing mechanic, so it is left for after the mechanic is settled.
5. Whether birds should be simulated on the server, or only their spook decisions shared.
