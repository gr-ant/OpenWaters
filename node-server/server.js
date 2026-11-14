'use strict';
// Open Waters multiplayer server (v1, Node). Server-authoritative fish and bird spooks on the shared sim (src-sim/),
// on the real island loaded headless. JSON over WebSocket, message types as the Python server's protocol.md (see README
// for the differences). No npm dependencies: node server.js [port]   (PORT env also works; default 8790)
const http = require('http');
const crypto = require('crypto');
const { attach } = require('./ws.js');
const { loadIsland, speciesJson, birdJson } = require('./island.js');
const { Room, TICK_HZ } = require('./room.js');
const S = require('../src-sim/index.js');

const PORT = +(process.argv[2] || process.env.PORT || 8790);
const PROTOCOL_VERSION = 1;
const MAX_PLAYERS = 8, CHAT_MAX = 240, NAME_MAX = 24;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', CODE_LEN = 6;   // no 0/O, 1/I/l (as the Python server)
const JOIN_WINDOW_MS = 10000, JOIN_MAX = 8;                                // create/join attempts per IP per window
const EMPTY_ROOM_MS = 60000;                                               // an empty room is closed after this
const CLIMATES = ['temperate', 'arctic', 'tropical'];

const rooms = new Map(), islands = new Map(), joinsByIp = new Map();
let species = null, birdSpecies = null;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// one island per seed + climate, shared by rooms on the same island (it is read-only terrain)
function islandFor(seed, climate) {
  const k = `${seed}|${climate}`;
  if (!islands.has(k)) {
    const isl = loadIsland(seed, climate);
    const spot = isl.findWater(S.LAKE, 0, 0, 1800) || { x: 0, y: 0 };   // where every client spawns (Engine.init)
    isl.start = { x: spot.x, y: spot.y, a: spot.a || 0 };
    islands.set(k, isl);
    log(`island seed ${seed} ${climate} loaded headless in ${isl.loadMs} ms, start (${isl.start.x.toFixed(1)}, ${isl.start.y.toFixed(1)})`);
  }
  return islands.get(k);
}
function newCode() { let c; do { c = Array.from({ length: CODE_LEN }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join(''); } while (rooms.has(c)); return c; }
function rateLimited(ip) {
  const now = Date.now(), h = (joinsByIp.get(ip) || []).filter(t => now - t < JOIN_WINDOW_MS);
  joinsByIp.set(ip, h); if (h.length >= JOIN_MAX) return true; h.push(now); return false;
}
const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
const err = (c, code, message) => c.ws.send(JSON.stringify({ t: 'error', code, message }));

function joinRoom(c, room, msg) {
  const p = { id: crypto.randomBytes(6).toString('hex'), name: String(msg.name || 'Angler').slice(0, NAME_MAX), ws: c.ws,
    x: room.island.start.x, y: room.island.start.y, z: 0, a: room.island.start.a, swim: false, wade: false, moving: false,
    lure: null, boat: null, boatSpeed: 0 };
  c.player = p; c.room = room; room.players.set(p.id, p); room.emptySince = null;
  if (!room.hostPid) room.hostPid = p.id;
  room.send(p, { t: 'joined', pid: p.id, code: room.code, seed: room.seed, climate: room.climate, wildlife: room.wildlife,
    hostPid: room.hostPid, isHost: p.id === room.hostPid, protocol: PROTOCOL_VERSION, tickHz: TICK_HZ,
    start: room.island.start, ...room.env });
  room.send(p, room.snapshot(p));
  room.broadcast({ t: 'player_joined', id: p.id, name: p.name }, p.id);
  log(`room ${room.code}: ${p.name} (${p.id}) joined, ${room.players.size} player(s)`);
}
function leaveRoom(c) {
  const room = c.room, p = c.player; if (!room || !p) return;
  c.room = c.player = null;
  room.release(p); room.players.delete(p.id);
  room.broadcast({ t: 'leave', id: p.id });
  if (room.hostPid === p.id) { room.hostPid = room.players.keys().next().value || null; if (room.hostPid) room.broadcast({ t: 'host_changed', hostPid: room.hostPid }); }
  if (!room.players.size) room.emptySince = Date.now();
  log(`room ${room.code}: ${p.name} left, ${room.players.size} player(s)`);
}

const HANDLERS = {
  create(c, m) {
    const seed = Number.isInteger(+m.seed) && m.seed !== null && m.seed !== '' ? +m.seed >>> 0 : null;
    if (seed === null) return err(c, 'bad_request', 'create needs an integer seed');
    const climate = m.climate || 'temperate';
    if (!CLIMATES.includes(climate)) return err(c, 'bad_request', 'climate must be arctic, tropical or temperate');
    const wildlife = [1, 2, 3].includes(+m.wildlife) ? +m.wildlife : 2;
    const room = new Room({ code: newCode(), seed, climate, wildlife, island: islandFor(seed, climate), species, birdSpecies });
    rooms.set(room.code, room); log(`room ${room.code} created: seed ${seed}, ${climate}, wildlife ${wildlife}`);
    joinRoom(c, room, m);
  },
  join(c, m) {
    const room = rooms.get(String(m.code || '').trim().toUpperCase());
    if (!room) return err(c, 'no_such_room', `no room ${m.code}`);
    if (room.players.size >= MAX_PLAYERS) return err(c, 'room_full', `room is full (max ${MAX_PLAYERS})`);
    joinRoom(c, room, m);
  },
  // position, facing, swimming / wading, and the lure while it is out ({x, y} or null)
  player_state(c, m) {
    const p = c.player, x = num(m.x, p.x), y = num(m.y, p.y);
    p.moving = m.moving !== undefined ? !!m.moving : Math.hypot(x - p.x, y - p.y) > 0.2;
    p.x = x; p.y = y; p.z = num(m.z, p.z); p.a = num(m.a, p.a);
    if (m.swim !== undefined) p.swim = !!m.swim;
    if (m.wade !== undefined) p.wade = !!m.wade;
    if (m.lure !== undefined) p.lure = m.lure && Number.isFinite(+m.lure.x) && Number.isFinite(+m.lure.y) ? { x: +m.lure.x, y: +m.lure.y } : null;
  },
  cast(c, m, room) {
    const p = c.player, x = num(m.x, NaN), y = num(m.y, NaN); if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    p.lure = { x, y }; room.sim.disturb(x, y, 1);   // the splash, as the game's cast does
    room.broadcast({ t: 'cast', by: p.id, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, rig: String(m.rig || '').slice(0, 40) }, p.id);
  },
  hooked(c, m, room) { room.hooked(c.player, String(m.id || '')); },
  lost(c, m, room) { room.lost(c.player, String(m.id || ''), m.why); },
  catch(c, m, room) { room.catch(c.player, String(m.id || ''), m.kept, m.cm, m.kg); },
  boat(c, m, room) {
    const p = c.player;
    if (m.onBoat === false || m.id == null) { p.boat = null; p.boatSpeed = 0; return room.broadcast({ t: 'boat', by: p.id, onBoat: false }, p.id); }
    p.boat = { id: String(m.id).slice(0, 40), x: num(m.x, p.x), y: num(m.y, p.y), a: num(m.a, 0), v: num(m.v, 0) }; p.boatSpeed = p.boat.v;
    room.broadcast({ t: 'boat', by: p.id, onBoat: true, ...p.boat }, p.id);
  },
  chat(c, m, room) { const text = String(m.text || '').slice(0, CHAT_MAX); if (text.trim()) room.broadcast({ t: 'chat', by: c.player.id, name: c.player.name, text }); },
  resync(c, m, room) { room.send(c.player, room.snapshot(c.player)); },
  leave(c) { leaveRoom(c); c.ws.close(1000, 'bye'); },
};

const server = http.createServer((req, res) => {
  if (req.url === '/stats') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ rooms: [...rooms.values()].map(r => r.info()) }, null, 1)); }
  if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(426, { 'content-type': 'text/plain' }); res.end('Open Waters multiplayer server: connect with a WebSocket\n');
});
attach(server, ws => {
  const c = { ws, room: null, player: null };
  ws.on('message', text => {
    let m; try { m = JSON.parse(text); } catch (e) { return err(c, 'bad_json', 'messages are JSON objects'); }
    if (!m || typeof m.t !== 'string') return err(c, 'bad_request', 'every message needs a "t" field');
    if (m.t === 'ping') return ws.send(JSON.stringify({ t: 'pong', ts: m.ts }));
    if (m.t === 'create' || m.t === 'join') {
      if (c.room) return err(c, 'bad_request', 'already in a room');
      if (rateLimited(ws.ip)) return err(c, 'rate_limited', 'too many attempts, slow down');
    } else if (m.t !== 'leave' && !c.room) return err(c, 'not_in_room', 'create or join a room first');
    const h = HANDLERS[m.t]; if (!h) return err(c, 'unknown_type', `unknown message type ${m.t}`);
    try { h(c, m, c.room); } catch (e) { log('handler error', m.t, e.stack); err(c, 'bad_request', 'could not handle that message'); }
  });
  ws.on('close', () => leaveRoom(c));
});

// the fixed tick: every room steps at TICK_HZ (catching up if the process was busy, at most 5 ticks at a time)
let last = process.hrtime.bigint();
setInterval(() => {
  const now = process.hrtime.bigint(), dt = Number(now - last) / 1e9; last = now;
  for (const [code, room] of rooms) {
    if (room.emptySince && Date.now() - room.emptySince > EMPTY_ROOM_MS) { rooms.delete(code); log(`room ${code} closed (empty)`); continue; }
    if (!room.players.size) continue;
    room.acc = Math.min(room.acc + dt, 5 / TICK_HZ);
    while (room.acc >= 1 / TICK_HZ) { room.acc -= 1 / TICK_HZ; room.step(); }
  }
}, 1000 / TICK_HZ);
setInterval(() => { for (const r of rooms.values()) if (r.players.size) { const i = r.info(); log(`room ${i.code}: ${i.fishSimulated} fish simulated, ${i.birds} birds, sent per client last ${JSON.stringify(i.sentPerClientLast)}`); } }, 10000);

species = speciesJson(); birdSpecies = birdJson();
server.listen(PORT, () => log(`Open Waters server on ws://localhost:${PORT} (${TICK_HZ} Hz tick, state 2 Hz), ${species.length} species, ${birdSpecies.length} birds`));
