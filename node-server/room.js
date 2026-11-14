'use strict';
// One room: one shared-sim world (createSim) on the real island for the room's seed + climate, its players, its birds,
// and the per-client messages (interest-managed state, hashes, snapshots). The server owns fish movement; clients only
// render and interpolate what they are sent.
const crypto = require('crypto');
const S = require('../src-sim/index.js');   // the shared simulation, from its real location (not copied)
const { createBirds } = require('./room-birds.js');

const TICK_HZ = 20, DT = 1 / TICK_HZ;     // fixed sim tick
const STATE_EVERY = TICK_HZ / 2;          // state broadcast at 2 Hz
const HASH_EVERY = TICK_HZ * 4;           // hash every 4 s (on a state tick)
const BIRD_EVERY = TICK_HZ / 5;           // bird spook checks at 5 Hz
const SIM_RADIUS = 72;                    // m round each player whose fish cells are simulated (the game's 72 m)
const INTEREST_R = 12;                    // m: fish sent to a client are this close to them or their lure, or on a line
const BIRD_VIEW_R = 60;                   // m: birds listed in a client's state
const CLAIM_RANGE = 100;                  // m: a hook claim must be for a fish this close to the claimer or their lure

const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const wireFish = f => ({ id: f.id, species: f.species, x: r2(f.x), y: r2(f.y), z: r2(f.z), a: r3(f.a), state: f.state,
  cm: r2(f.lengthCm), kg: r3(f.weightKg), ...(f.hooked ? { hooked: f.hooked } : {}) });
// the state hash: the same recipe as the Python server (sha1 of "id:x:y:state" joined by "|", sorted by id, first 12 hex),
// taken over the wire values of exactly the fish list a client was sent, so the client can compute it too
function fishHash(list) {
  const parts = [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(f => `${f.id}:${Math.round(f.x)}:${Math.round(f.y)}:${f.state}`);
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

class Room {
  constructor({ code, seed, climate, wildlife, island, species, birdSpecies }) {
    Object.assign(this, { code, seed, climate, wildlife, island });
    this.sim = S.createSim({ seed, climate, species, terrain: island.SIM_TERRAIN, config: { wildlife }, now: () => Date.now() });
    this.birds = createBirds({ S, seed, climate, terrain: island.SIM_TERRAIN, species: birdSpecies });
    this.players = new Map(); this.hostPid = null; this.tick = 0; this.emptySince = null; this.acc = 0;
    this.stats = { sentLast: {}, sentMax: 0, sentSum: 0, sentN: 0 };
  }
  get env() { const e = this.sim.env; return { yf: r3(e.yf), tod: r3(this.sim.tod), weather: e.kind, season: e.season }; }

  send(p, msg) { p.ws.send(JSON.stringify(msg)); }
  broadcast(msg, exceptPid) { const s = JSON.stringify(msg); for (const p of this.players.values()) if (p.id !== exceptPid) p.ws.send(s); }

  // ---- one fixed tick ----
  step() {
    const sim = this.sim, list = [...this.players.values()];
    sim.setPlayers(list.map(p => ({ id: p.id, x: p.x, y: p.y, inWater: p.swim || p.wade, moving: p.moving, r: SIM_RADIUS })));
    // the island's own ENV (its lake wind drift, plant growth for cover) follows the room's clock and weather
    const E = this.island.ENV, e = sim.env; for (const k of ['wind', 'windDir', 'growth', 'dormant', 'leaf']) if (e[k] !== undefined) E[k] = e[k];
    sim.step(DT); this.tick++;
    if (this.tick % BIRD_EVERY === 0 && list.length) {
      const who = list.map(p => ({ id: p.id, x: p.x, y: p.y, z: p.z, boatSpeed: p.boatSpeed, swimming: p.swim }));
      this.birds.update(who);
      for (const ev of this.birds.spooks(who, sim.fish, sim.time)) this.broadcast(ev);
    }
    this.flushEvents();
    if (this.tick % STATE_EVERY === 0) for (const p of list) this.sendState(p, this.tick % HASH_EVERY === 0);
  }
  // events drained from the sim: kept catches (fish_gone, with the wall-clock respawn time) and fish coming back
  flushEvents() {
    for (const e of this.sim.drainEvents()) {
      if (e.type === 'fish-gone') this.broadcast({ t: 'fish_gone', id: e.id, respawnAt: e.until / 1000 });
      else if (e.type === 'fish-respawn') this.broadcast({ t: 'fish_back', id: e.id });
    }
  }

  // interest management: fish near this player, near their lure, or on anyone's line. Never the whole room.
  fishFor(p) {
    const out = [];
    for (const f of this.sim.fish) {
      if (f.dead) continue;
      if (f.hooked || Math.hypot(f.x - p.x, f.y - p.y) <= INTEREST_R || (p.lure && Math.hypot(f.x - p.lure.x, f.y - p.lure.y) <= INTEREST_R)) out.push(wireFish(f));
    }
    return out;
  }
  others(p) { return [...this.players.values()].filter(q => q !== p).map(q => ({ id: q.id, name: q.name, x: r2(q.x), y: r2(q.y), a: r3(q.a), swim: q.swim, wade: q.wade, lure: q.lure })); }
  boats() { return [...this.players.values()].filter(q => q.boat).map(q => ({ id: q.boat.id, by: q.id, x: r2(q.boat.x), y: r2(q.boat.y), a: r3(q.boat.a), v: r2(q.boat.v) })); }
  sendState(p, withHash) {
    const fish = this.fishFor(p);
    this.send(p, { t: 'state', tick: this.tick, fish, birds: this.birds.near(p.x, p.y, BIRD_VIEW_R), players: this.others(p), boats: this.boats(), ...this.env });
    if (withHash) this.send(p, { t: 'hash', tick: this.tick, hash: fishHash(fish), x: r2(p.x), y: r2(p.y) });
    const s = this.stats; s.sentLast[p.id] = fish.length; s.sentMax = Math.max(s.sentMax, fish.length); s.sentSum += fish.length; s.sentN++;
  }
  snapshot(p) {
    const fish = this.fishFor(p), L = this.sim.ledger, gone = Object.keys(L.load()).filter(id => L.isGone(id));
    return { t: 'snapshot', tick: this.tick, hash: fishHash(fish),
      room: { code: this.code, seed: this.seed, climate: this.climate, wildlife: this.wildlife, hostPid: this.hostPid },
      env: this.env, fish, birds: this.birds.near(p.x, p.y, BIRD_VIEW_R),
      players: [...this.players.values()].map(q => ({ id: q.id, name: q.name, x: r2(q.x), y: r2(q.y), a: r3(q.a) })),
      boats: this.boats(), gone, respawnAt: Object.fromEntries(gone.map(id => [id, (L.gone[id] + this.sim.config.fishRespawnMinutes * 60000) / 1000])) };
  }

  // ---- hook / land / unhook: the shared sim's ledger, first claim wins ----
  hooked(p, id) {
    const f = this.sim.fishById(id);
    if (f && !f.dead && Math.hypot(f.x - p.x, f.y - p.y) > CLAIM_RANGE && !(p.lure && Math.hypot(f.x - p.lure.x, f.y - p.lure.y) <= CLAIM_RANGE))
      return this.send(p, { t: 'taken', id, reason: 'too_far' });
    const r = this.sim.hook(id, p.id);
    if (r.ok) this.broadcast({ t: 'claim', id, by: p.id });
    else this.send(p, { t: 'taken', id, reason: r.reason, ...(r.by ? { by: r.by } : {}) });
    this.flushEvents();
  }
  lost(p, id, why) {
    if (this.sim.unhook(id, p.id)) this.broadcast({ t: 'lost', id, by: p.id, why: String(why || 'thrown').slice(0, 16) });
    this.flushEvents();
  }
  catch(p, id, kept, cm, kg) {
    const f = this.sim.fishById(id);
    if (!f || this.sim.ledger.claimOf(id) !== p.id) return this.send(p, { t: 'taken', id, reason: f ? 'not_yours' : 'gone' });
    const rec = { t: 'catch', id, species: f.species, by: p.id, name: p.name, cm: r2(+cm || f.lengthCm), kg: r3(+kg || f.weightKg), kept: !!kept };
    const r = this.sim.land(id, p.id, !!kept);
    if (!r.ok) return this.send(p, { t: 'taken', id, reason: r.reason });
    this.flushEvents();   // kept -> fish_gone to the whole room (wall-clock respawnAt, 30 min)
    this.broadcast(rec);
  }
  // a player leaving lets go of anything they had on the line
  release(p) { for (const f of this.sim.fish) if (f.hooked === p.id) this.sim.unhook(f.id, p.id); this.flushEvents(); }

  info() {
    const s = this.stats;
    return { code: this.code, seed: this.seed, climate: this.climate, wildlife: this.wildlife, players: this.players.size, tick: this.tick,
      fishSimulated: this.sim.fish.length, cells: this.sim.cells.size, birds: this.birds.count(),
      sentPerClientLast: s.sentLast, sentPerClientMax: s.sentMax, sentPerClientAvg: s.sentN ? r2(s.sentSum / s.sentN) : 0 };
  }
}

module.exports = { Room, fishHash, TICK_HZ, DT, INTEREST_R };
