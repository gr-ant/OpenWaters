'use strict';
// Engine: fish populations per water cell: making, syncing, trimming and removing fish (caught fish stay gone, per seed).
Object.assign(Engine, {
  // ambient fish: spawn in water around you, wander (or hold against the current in rivers), scatter from swimmers
  // ---- fish: fixed populations per 16 m water cell; each fish runs on its species data ----
  spawned: [], boats: [], boat: null, fishCells: new Map(), noises: [], cellT: 0, dtH: 0, finder: false, fishRev: -1,
  disturb(x, y, s = 1) { OWSim.disturb(this, x, y, s); },   // a splash, a boat, a cast: fish nearby take fright (src/sim/behaviour.js)
  // caught and kept fish stay gone for CONFIG.fishRespawnMinutes (real minutes), per island, saved in this browser; hook
  // claims and fish-gone events are the shared ledger's (src/sim/ledger.js)
  fishLedger: OWSim.createFishLedger({ now: () => Date.now(), respawnMinutes: () => CONFIG.fishRespawnMinutes,
    store: { load: () => JSON.parse(localStorage.getItem(Engine.goneKey()) || '{}'), save: g => localStorage.setItem(Engine.goneKey(), JSON.stringify(g)) } }),
  goneKey() { return 'engine-fishgone-' + CONFIG.saveName + '-' + SEED; },
  isGone(id) { return this.fishLedger.isGone(id); },
  removeFish(f) { this.fishLedger.remove(f); },
  makeFish(sp) { return SIM.makeFish(sp); },   // a live animal from a population record (src/sim/populations.js)
  syncFishCells() {
    const limit = this.touchUI ? Math.min(CONFIG.maxFish, CONFIG.maxFishTouch) : CONFIG.maxFish;
    const P = this.P, R = 72;
    // populate around you, and around your lure or bait once it's out in the water (a long cast into deep water would
    // otherwise land beyond every fish); distance counts from whichever is nearer
    const centres = [[P.x, P.y, R]], rods = [this.ang, this.ang2].filter(Boolean);   // (a second rod may stand in a holder: fishing/two-rods.js)
    for (const A of rods) { const L = A.out && A.lure; if (L && L.kd >= 0 && !L.land && Math.hypot(L.x - P.x, L.y - P.y) > 24) centres.push([L.x, L.y, 40]); }
    if (this.fishRev !== FishDB.revision) { this.fishCells.clear(); this.fishRev = FishDB.revision; }
    // the cells around those centres, nearest first, under the cap; a cell with a fish on your line or in your hands stays
    SIM.syncCells(this.fishCells, { centres, limit, rng: Math.random, isGone: id => this.isGone(id), keepCell: c => c.fish.some(f => f.held || rods.some(A => f === A.fish)) });
    this.fish = []; for (const c of this.fishCells.values()) for (const f of c.fish) if (!f.dead) this.fish.push(f);
    this.spawned = this.spawned.filter(f => !f.dead && Math.hypot(f.x - P.x, f.y - P.y) < 250); for (const f of this.spawned) this.fish.push(f);   // ones you spawned stay until you're far away
    for (const A of rods) { const hk = A.fish; if (hk && !hk.dead && !this.fish.includes(hk)) this.fish.push(hk); }   // the fish on your line stays, however far it runs
  },
  trimCell(fish, room) { return SIM.trimCell(fish, room); },   // whole groups only, in a fixed order (src/sim/populations.js)
});
