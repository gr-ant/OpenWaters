// The reel's handle turns only with its own rod's line (hud/reel.js reelAnimStep): with a second rod in a holder both are
// drawn each frame, and neither handle may turn while nothing is wound. node tests/reel-spin.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const c = { Math, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), REEL_PARTS: {}, Controls: { key: () => '' } }; vm.createContext(c);
vm.runInContext('var Engine = { time: 0 };' + fs.readFileSync(__dirname + '/../src/js/hud/reel.js', 'utf8') + ';this.E = Engine;', c);
const E = c.E, held = { lineOut: 12, S: {} }, holder = { lineOut: 30, S: {} };
for (let i = 0; i < 120; i++) { E.time += 0.016; E.ang = held; E.reelAnimStep(); E.ang = holder; E.reelAnimStep(); }
assert.equal(held.reelW.crank, 0, 'the rod in hand: still'); assert.equal(holder.reelW.crank, 0, 'the rod in the holder: still');
held.reeling = true; for (let i = 0; i < 10; i++) { E.time += 0.016; E.ang = held; E.reelAnimStep(); E.ang = holder; E.reelAnimStep(); }
assert.ok(held.reelW.crank > 1 && holder.reelW.crank === 0, 'winding turns only that reel');
console.log('Reel spin checks passed.');
