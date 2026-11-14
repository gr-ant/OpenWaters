'use strict';
// Birds on the server: only the ones near a player, and only what they need to agree on, which birds sit where and which
// ones a player flushes (direction, and the fish they scare). Flight, flocking and animation stay on the client.
//
// Placement is seeded per 48 m patch (same seed -> same birds, same ids, every time a patch is rolled), from the real
// bird species JSON (src/birds/*.json, the climate's roster, habitat weights by water kind) on the real island. The spook
// rules are the shared ones from src/sim/birds.js (birdSpooked, flightlessSpooked, fleeSpot, birdScatter).
const PATCH = 48;              // m
const NEAR_PATCHES = 2;        // patches either side of a player that get birds
const DROP_DIST = 220;         // m: a patch with no player this close is forgotten (re-rolled identically if revisited)
const KEEP_CLEAR = 25;         // m: a bird is not placed this close to a player (as birds.js keeps free perches)
const SCARE_R = 8;             // m: fish scattered by a bird taking off / splashing away (agreed decision)
const AWAY_S = 45;             // s: a flushed bird is gone this long, then settles back at its spot
const FLY_DIST = 50;           // m: where a flushed flying bird heads (straight away from whoever flushed it)
const KEYS = ['sea', 'lake', 'pond', 'river', 'creek'];   // water kind -> habitat key (OCEAN 0, LAKE 1, POND 2, RIVER 3, CREEK 4)

function createBirds({ S, seed, climate, terrain, species }) {
  const roster = species.filter(sp => !sp.climates || sp.climates.includes(climate));
  const patches = new Map();   // "px,py" -> [bird]
  const o = {};
  const at = (x, y) => terrain.sample(x, y, o) && { kind: o.kind, depth: o.level - o.ground, level: o.level, ground: o.ground };

  function roll(px, py, players) {
    const rng = S.mulberry32((S.hash2(px, py, (seed + 4201) >>> 0) * 4294967296) >>> 0), birds = [];
    if (rng() > 0.5) return birds;   // about half the patches have birds
    const c = at((px + 0.5) * PATCH, (py + 0.5) * PATCH), key = KEYS[c.kind];
    // who lives here: habitat weight for this water (or 'any'); penguins on a sea coast
    const w = roster.map(sp => sp.flightless ? (c.kind === S.OCEAN ? 3 : 0) : (sp.habitat[key] || sp.habitat.any || 0));
    const tot = w.reduce((a, b) => a + b, 0); if (!tot) return birds;
    let r = rng() * tot, sp = roster[0]; for (let i = 0; i < roster.length; i++) { r -= w[i]; if (r <= 0) { sp = roster[i]; break; } }
    const n = 1 + Math.floor(rng() * 3), floats = !sp.flightless && ((sp.lands.water || 0) > 0 || (sp.lands.wade || 0) > 0);
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 12; tries++) {   // a spot of the right sort inside the patch
        const x = (px + rng()) * PATCH, y = (py + rng()) * PATCH, q = at(x, y);
        const ok = floats ? q.depth > 0.3 : q.depth <= 0 && hasWaterNear(x, y);
        if (!ok || players.some(P => Math.hypot(P.x - x, P.y - y) < KEEP_CLEAR)) continue;
        const b = { id: `bird:${px},${py}#${i}`, sp, x, y, z: floats ? q.level : q.ground, hx: x, hy: y, st: floats ? 'float' : 'stand', away: 0 };
        if (sp.flightless) b.sea = seaSpots(x, y);
        birds.push(b); break;
      }
    }
    return birds;
  }
  function hasWaterNear(x, y) { for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; if (at(x + Math.cos(a) * 12, y + Math.sin(a) * 12).depth > 0.3) return true; } return false; }
  function seaSpots(x, y) { const out = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, sx = x + Math.cos(a) * 15, sy = y + Math.sin(a) * 15; if (at(sx, sy).depth > 0.3) out.push([sx, sy]); } return out; }

  // keep the patches round the players loaded, drop the far ones
  function update(players) {
    for (const P of players) {
      const cx = Math.floor(P.x / PATCH), cy = Math.floor(P.y / PATCH);
      for (let j = -NEAR_PATCHES; j <= NEAR_PATCHES; j++) for (let i = -NEAR_PATCHES; i <= NEAR_PATCHES; i++) {
        const k = `${cx + i},${cy + j}`; if (!patches.has(k)) patches.set(k, roll(cx + i, cy + j, players));
      }
    }
    for (const k of patches.keys()) {
      const [px, py] = k.split(',').map(Number), mx = (px + 0.5) * PATCH, my = (py + 0.5) * PATCH;
      if (!players.some(P => Math.hypot(P.x - mx, P.y - my) < DROP_DIST)) patches.delete(k);
    }
  }

  // which birds near a player get flushed this tick. players: [{ id, x, y, z, boatSpeed, swimming }];
  // fish: the sim's live fish (the ones within SCARE_R of a flushed bird are scattered). Returns spook events.
  function spooks(players, fish, now) {
    const out = [];
    for (const list of patches.values()) for (const b of list) {
      if (b.st === 'away') { if (now - b.away > AWAY_S) { b.st = b.home; b.x = b.hx; b.y = b.hy; } continue; }
      let by = null;
      if (b.sp.flightless) { const P = nearest(players, b); if (P && S.flightlessSpooked(b.sp, Math.hypot(b.x - P.x, b.y - P.y))) by = P; }
      else by = players.find(P => S.birdSpooked(b.sp, {}, b, P)) || null;
      if (!by) continue;
      let to = null;
      if (b.sp.flightless) { const s = S.fleeSpot(b.sea, by); if (s) to = [s.x, s.y]; }   // the sea spot furthest from them
      if (!to) { const d = Math.hypot(b.x - by.x, b.y - by.y) || 1, dist = b.sp.flightless ? 15 : FLY_DIST; to = [b.x + (b.x - by.x) / d * dist, b.y + (b.y - by.y) / d * dist]; }
      const scared = fish.filter(f => !f.dead && Math.hypot(f.x - b.x, f.y - b.y) <= SCARE_R).map(f => f.id);
      S.birdScatter(fish, b.x, b.y, SCARE_R);   // the shared Fo.scare: every fish within 8 m bolts away
      out.push({ t: 'spook', id: b.id, species: b.sp.id, x: r2(b.x), y: r2(b.y), flightless: !!b.sp.flightless,
        action: S.birdFlight(b.sp), to: to.map(r2), a: r3(Math.atan2(to[1] - b.y, to[0] - b.x)), by: by.id, scared });
      b.home = b.st; b.st = 'away'; b.away = now;
    }
    return out;
  }
  const nearest = (players, b) => { let best = null, bd = Infinity; for (const P of players) { const d = Math.hypot(P.x - b.x, P.y - b.y); if (d < bd) { bd = d; best = P; } } return best; };

  // birds within r of (x, y), for a client's state message
  function near(x, y, r) {
    const out = [];
    for (const list of patches.values()) for (const b of list) if (Math.hypot(b.x - x, b.y - y) <= r) out.push({ id: b.id, species: b.sp.id, x: r2(b.x), y: r2(b.y), z: r2(b.z), st: b.st });
    return out;
  }
  const count = () => { let n = 0; for (const l of patches.values()) n += l.length; return n; };
  return { update, spooks, near, count, patches };
}
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

module.exports = { createBirds, SCARE_R };
