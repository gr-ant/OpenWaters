'use strict';
// Shared simulation, part 7: what scares a bird. A perched or floating bird flushes when someone comes too close (closer
// still on a swimmer, further off from a fast boat); a flightless one (penguins) doesn't take off: it waddles off to the
// sea, to the spot furthest from you, and swims or dives. A diving bird scatters the fish below it. The flight itself,
// the perches and the meshes stay in the game (birds/birds.js); these are the decisions a server needs to agree on.
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./behaviour.js'));
  else { const S = globalThis.OWSim = globalThis.OWSim || {}; Object.assign(S, factory(S)); }
})(function (S) {
  const FEAR = 2;   // scales every species' shy (and, × 0.9, wary) distance: birds keep well clear of you
  // does person P ({ x, y, z, boatSpeed, swimming }) flush bird b, sitting on `spot` (bold: lands on boats; high: up a tree)?
  function birdSpooked(sp, spot, b, P) {
    const near = Math.hypot(b.x - P.x, b.y - P.y), d3 = Math.hypot(near, b.z - P.z - 1), sh = sp.shy * FEAR;
    return spot.bold ? d3 < 2.5 : spot.high ? d3 < sh * 0.75 : near < (Math.abs(P.boatSpeed || 0) > 1.5 ? sh * 2.2 : P.swimming ? sh * 0.65 : sh);
  }
  // any of several people (a server's players)
  const birdSpookedByAny = (sp, spot, b, players) => players.some(P => birdSpooked(sp, spot, b, P));
  // what a frightened bird does: flying birds take off; flightless ones waddle to the water (and swim or dive off it)
  const birdFlight = sp => sp.flightless ? 'waddle' : 'takeoff';
  // a flightless bird ashore, `near` metres from you: too close?
  const flightlessSpooked = (sp, near) => near < sp.shy * FEAR;
  // where it heads: the colony's sea spot furthest from you ([x, y] list -> { x, y } or null)
  function fleeSpot(spots, P) { let best = -1, out = null; for (const q of spots || []) { const d = Math.hypot(q[0] - P.x, q[1] - P.y); if (d > best) { best = d; out = { x: q[0], y: q[1] }; } } return out; }
  // a bird hits the water: every fish within `r` (the species' forage.scare) bolts away from it
  function birdScatter(fish, x, y, r) { let n = 0; for (const f of fish) if (!f.dead && (f.x - x) ** 2 + (f.y - y) ** 2 <= r * r) { S.spookFish(f, x, y); n++; } return n; }
  return { FEAR, birdSpooked, birdSpookedByAny, birdFlight, flightlessSpooked, fleeSpot, birdScatter };
});
