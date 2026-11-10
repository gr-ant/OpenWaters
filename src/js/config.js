'use strict';
/* ==========================================================================
   EMBERCROWN ENGINE — a small first-person world engine (WebGL2, one file)
   --------------------------------------------------------------------------
   What you get: endless seeded terrain with biomes, trees that sway, water,
   sun/moon day-night with stars and clouds, procedural surface materials,
   first-person controls (keyboard + mouse, or touch joystick), minimap + map
   with travel, and an item system: 3D pickups, a slot inventory with stacks
   and auto-rendered 3D item icons, saved per seed in the browser.

   Build a game in the GAME section at the bottom using the Game API:
     Game.registerItem('apple', { name: 'Apple', color: '#f44', mesh });
     Game.on('ready', () => Game.spawnPickup('apple', x, y));
     Game.on('pickup', p => Game.say('Yum'));
   Meshes: const b = Game.mesh(); b.mat = Game.MT.WOOD; b.tube(...); b.done()
   Tune anything in CONFIG just below. World seed: add #seed-12345 to the URL.

   WATERS: lakes, ponds, rivers and creeks are carved into the terrain (world()), each point knowing its water
   level and kind. Water surfaces are meshed per chunk with current, foam, depth colour and ripple rings;
   beds get caustics; diving gives underwater fog, light shafts, bubbles, weed beds and ambient fish.
     Game.waterAt(x, y)   -> { kind, name, depth, level, flow: {x, y, speed}, murk, id }
     Game.lookingAt       -> the water under the crosshair (for casting), or null
     Game.findWater('pond') / Game.travelToWater('river'), Game.ripple(x, y), Game.splash(x, y)
     Game.swimming / underwater / wading

   FISH are data: one JSON file per species (fish/README.md describes every field). Built-in species are the
   <script type="application/json" data-builtin="fish"> blocks at the end of this file. To add one: drop its .json onto
   the game (kept in this browser), paste a new block at the end, or Game.loadFish('fish/my_fish.json') when served.
     Game.fish, Game.fishNear(x, y, r), Game.strikeChance(fish, 'insects', { zone: 'surface' }), Game.removeFish(f)
     Game.waterTempAt(x, y, below), Game.coverAt(x, y), Game.habitatScore(id, x, y), Game.on('fishRise' | 'fishFeed', f)
     Game.oxygenAt(x, y, below), Game.foodAt(x, y, 'insects'), Game.on('fishEaten', (predator, prey) => {})

   SEASONS & WEATHER: a short year (CONFIG.daysPerSeason), seasonal air and water temperatures, lakes that layer in
   summer and freeze in winter, oak/maple/birch that leaf out, colour and drop their leaves, snow, rain, fog,
   storms and a barometer the fish feel. Keys Y (next season) and U (next weather); #season-winter, #weather-rain.
     Game.conditions, Game.setSeason('autumn'), Game.setWeather('storm')

   BOATS are data too (boats/README.md): canoes, kayaks, a rowboat, jon boat, bass boat, center console and lobster boat.
   K (Spawn) → Boats to launch one, F / Use to get in and out, W/S throttle or paddle, A/D steer.
     Game.spawnBoat('canoe'), Game.loadBoat(def), Game.boats, Game.boat, Game.on('boardBoat' | 'leaveBoat', b)

   TACKLE & FISHING: every rod, reel, line, leader, hook, sinker, float, bait and lure is a small JSON object, and a
   rig names the pieces it's made of (tackle/README.md). Built-in gear is the <script data-builtin="tackle"> blocks at the end.
   I opens the tackle box (rigs, a rig builder, all your gear, the catch log); Q takes the rod out; hold R or the mouse
   to cast and let go to throw; hold R to reel (Shift faster); strike with R when the float goes under; [ ] set drag.
   From the helm of a powered boat the rod goes in a holder and you troll. E keeps a catch, X lets it go.
     Game.loadTackle(urlOrJson, { save }), Game.tackle, Game.rigStats('bass_crankbait'), Game.equipRig(id), Game.rod(true)
     Game.angler (phase, lure, lineOut, tension, fish...), Game.catches, Game.openTackleBox()
     Game.on('cast' | 'follow' | 'refuse' | 'bite' | 'miss' | 'hooked' | 'lost' | 'landed' | 'catch', ...)
   ========================================================================== */
// ======================================================================
//  SETTINGS — everything that's easy to tweak lives here
// ======================================================================
const CONFIG = {
  // movement (world units are roughly metres; per second)
  walkSpeed: 2.2, jogSpeed: 3.8, runSpeed: 5.5, swimFactor: 0.5,   // a person's pace: a brisk walk; holding Run you jog, and after a moment build up to a run
  jumpSpeed: 5.5, boatJumpFactor: 0.55, gravity: 28, eyeHeight: 1.7,   // a jump of about half a metre; off a boat it's a hop over the side (jumpSpeed x boatJumpFactor)
  // looking around
  mouseSensitivity: 0.0025, touchLookSensitivity: 0.0065, mouseDragSensitivity: 0.004, arrowKeyTurnSpeed: 1.8,
  fieldOfView: 75,                    // degrees
  // touch controls
  joystickRadius: 46, tapMaxMs: 600,
  // world & view distance
  viewDistance: 1400,                 // fog / far plane
  terrainChunkRadius: 11, treeChunkRadius: 7, treeSpacing: 6,
  treeDetailDistance: 260,            // full-detail trees within this range, simpler ones beyond
  heightScale: 180, waterLevel: 0.3,  // changing these reshapes every world
  // day / night
  dayLengthSeconds: 2400,             // one full day-night cycle (40 real minutes)
  startHour: 9,                       // 0-24
  fastTimeMultiplier: 30,             // hold T to speed time up
  stars: true, clouds: true,
  // graphics
  maxPixelRatio: 2, maxPixelRatioTouch: 1.5,
  windSway: 1,                        // tree sway strength, 0 = still
  groundCover: (() => { try { return matchMedia('(pointer: coarse)').matches ? 1 : 2; } catch (e) { return 2; } })(),   // grass, flowers, ferns, bushes, moss on land: 0 off · 1 light (touch default) · 2 full
  lanternAtNight: true,               // soft light around the player after dark
  // inventory & pickups
  inventorySlotsPerLevel: 5, stackSize: 10, collectRange: 3,
  saveProgress: true,                 // remember inventory and taken pickups in this browser (per seed)
  saveName: 'waters',                 // change per game so saves don't mix
  // map travel marker
  travelSymbol: '✦',
  // the island and its water (changing these reshapes every world)
  islandSize: 6000,                   // metres across
  worldEdge: 8960,                    // the edge of the playable sea: you can't walk, swim, sail or scroll the map past ±this (m)
  lakes: 7,                           // distributed inland basins, including glacial lakes in arctic worlds
  creekAreaKm2: 0.25,                 // land that must drain through a spot for a creek to form there
  riverAreaKm2: 0.8,                  // ... and for it to be a river
  pondMaxM2: 15000,                   // basins smaller than this (1.5 ha) are ponds
  maxNaturalLakeM2: 80000,            // bigger natural basins become flat valley floors (dug lakes are always kept)
  pondChance: 0.25,                   // share of 170 m cells that try to hold a pond in a hollow (moist lowland only)
  rivers: true, creeks: true,
  // swimming
  swimSpeed: 1.1, swimSprint: 1.8, diveSpeed: 1.5,
  // water life & atmosphere
  maxFish: 1200,                      // most fish simulated at once (nearest water cells first)
  maxFishTouch: 600,                  // lower ambient population cap on touch devices
  fishAbundance: 0.6,                 // scales every species' population density (1 = the JSON's real-world densities: crowded)
  shellfishAbundance: 0.5,            // the same for shellfish and cephalopods (their real beds are very dense: 1 would be a carpet of mussels)
  herpAbundance: 0.3,                 // the same for reptiles and amphibians (at most two to a cell, so fish stay the main animal)
  wildlife: 2,                        // 1 sparse · 2 standard · 3 abundant: scales fish, shellfish and reptile/amphibian numbers (Settings)
  cellMaxAnimals: 60,                 // most animals in one 16 m fish cell: fish are placed first, then reptiles and amphibians, then shellfish
  fishRises: true,                    // feeding fish dimple the surface
  fishRespawnMinutes: 30,             // a fish you remove (catch) comes back after this many real minutes
  waterTempOffset: 0,                 // °C added to all water (the seasons already warm and cool it)
  // seasons & weather
  daysPerSeason: 5,                   // game days per season (a day is dayLengthSeconds long)
  startSeason: 'spring', startSeasonPart: 0.7,   // where the year starts (0..1 through that season); or #season-winter in the address
  weather: true,                      // false = always fair
  climate: 'auto',                    // 'auto' (the seed decides), 'temperate', 'arctic' or 'tropical'; or #climate-arctic
  underwaterRays: true,               // light shafts when diving
  waterPlants: true,                  // reeds, lily pads, weed beds, river boulders
  trolling: false,                    // fish from the helm of a powered boat (the rod goes in a holder and the lure trails behind); off until it's tuned
};
