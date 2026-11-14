'use strict';
// Fish size / weight statistics and the fixed per-cell fish populations (cellFish): the shared simulation's
// (src/sim/core.js, src/sim/populations.js), for the game's world (SIM), under their old global names.
// Each 16 m cell of water has a fixed population (same seed -> same fish in the same places, with the same ids).
const { gauss, poisson, sampleFishSize } = OWSim;
const { FISH_CELL, WILDLIFE_SCALE, cellFish } = SIM;
