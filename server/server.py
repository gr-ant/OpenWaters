#!/usr/bin/env python3
"""Open Waters multiplayer server: server-authoritative rooms for shared fish, birds, boats,
casts/catches and chat. Stdlib only -- implements the WebSocket handshake and framing itself
on asyncio, so `python3 server.py` just works with no pip install. See README.md to run it
and protocol.md for the full wire protocol.

Usage: python3 server.py [port]   (default port 8765)
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import secrets
import struct
import sys
import time
from dataclasses import dataclass, field
from typing import Optional

import fish_populations as fp

# ---------------------------------------------------------------------------
# Limits (see README.md "Limits")
# ---------------------------------------------------------------------------
MAX_PLAYERS_PER_ROOM = 8
MAX_MESSAGE_BYTES = 32 * 1024
CHAT_MAX_LEN = 240
EMPTY_ROOM_TTL_S = 10 * 60
JOIN_RATE_WINDOW_S = 10.0
JOIN_RATE_MAX = 8
ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/l
ROOM_CODE_LEN = 6

SIM_HZ = 10.0
SIM_DT = 1.0 / SIM_HZ
BROADCAST_EVERY_N_TICKS = 5  # 10 Hz sim / 5 = 2 Hz broadcast
STATE_HASH_EVERY_S = 4.0
GAME_DAY_SECONDS = 2400.0  # config.js CONFIG.dayLengthSeconds

FISH_SIM_RADIUS = 20.0      # a fish within this of a player/lure gets stepped each tick
FISH_VISIBLE_RADIUS = 12.0  # "near that player / near a lure / on a line" (see task brief)

PROTOCOL_VERSION = 1

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


# ---------------------------------------------------------------------------
# WebSocket handshake + framing (RFC 6455), stdlib only.
# ---------------------------------------------------------------------------
class ConnectionClosed(Exception):
    pass


async def ws_handshake(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> dict:
    """Read the HTTP upgrade request and reply with 101 Switching Protocols. Returns the
    parsed request headers (lowercased keys), or raises ConnectionClosed if it isn't a
    websocket upgrade. Allows any Origin (including `file://` / null for the Electron
    build and the `#…` hash-only itch.io iframe case) -- see multiplayer-server-plan.md
    section 7 "Correction (server side)"."""
    line = await reader.readline()
    if not line:
        raise ConnectionClosed("no request line")
    headers: dict[str, str] = {}
    while True:
        line = await reader.readline()
        if line in (b"\r\n", b"\n", b""):
            break
        if b":" not in line:
            continue
        k, _, v = line.decode("latin-1").partition(":")
        headers[k.strip().lower()] = v.strip()
    key = headers.get("sec-websocket-key")
    if not key or headers.get("upgrade", "").lower() != "websocket":
        writer.write(b"HTTP/1.1 400 Bad Request\r\n\r\n")
        await writer.drain()
        raise ConnectionClosed("not a websocket upgrade")
    accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
    resp = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
    )
    writer.write(resp.encode())
    await writer.drain()
    return headers


OP_CONT, OP_TEXT, OP_BINARY, OP_CLOSE, OP_PING, OP_PONG = 0x0, 0x1, 0x2, 0x8, 0x9, 0xA


def encode_frame(opcode: int, payload: bytes) -> bytes:
    """Server -> client frames are never masked (RFC 6455 5.1: only client frames must be)."""
    out = bytearray()
    out.append(0x80 | opcode)  # FIN=1, no fragmentation needed: our messages are small JSON
    n = len(payload)
    if n < 126:
        out.append(n)
    elif n < 65536:
        out.append(126)
        out += struct.pack(">H", n)
    else:
        out.append(127)
        out += struct.pack(">Q", n)
    out += payload
    return bytes(out)


async def _read_exact(reader: asyncio.StreamReader, n: int) -> bytes:
    data = await reader.readexactly(n)
    return data


async def read_message(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> Optional[str]:
    """Read one complete (possibly fragmented) text message, answering pings/closes
    transparently. Returns None when the peer closes the connection."""
    parts: list[bytes] = []
    message_opcode: Optional[int] = None
    while True:
        try:
            b1, b2 = await _read_exact(reader, 2)
        except (asyncio.IncompleteReadError, ConnectionResetError):
            return None
        fin = (b1 >> 7) & 1
        opcode = b1 & 0x0F
        masked = (b2 >> 7) & 1
        length = b2 & 0x7F
        if length == 126:
            (length,) = struct.unpack(">H", await _read_exact(reader, 2))
        elif length == 127:
            (length,) = struct.unpack(">Q", await _read_exact(reader, 8))
        if length > MAX_MESSAGE_BYTES:
            await send_close(writer, 1009, "message too big")
            raise ConnectionClosed("oversized frame")
        mask_key = await _read_exact(reader, 4) if masked else b""
        payload = await _read_exact(reader, length) if length else b""
        if masked:
            payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
        if opcode == OP_CLOSE:
            writer.write(encode_frame(OP_CLOSE, payload[:2]))
            await writer.drain()
            return None
        if opcode == OP_PING:
            writer.write(encode_frame(OP_PONG, payload))
            await writer.drain()
            continue
        if opcode == OP_PONG:
            continue
        if opcode != OP_CONT:
            message_opcode = opcode
        parts.append(payload)
        if fin:
            break
    if message_opcode != OP_TEXT:
        return ""  # ignore binary frames; caller treats empty string as a no-op message
    return b"".join(parts).decode("utf-8", errors="replace")


async def send_close(writer: asyncio.StreamWriter, code: int, reason: str = ""):
    try:
        writer.write(encode_frame(OP_CLOSE, struct.pack(">H", code) + reason.encode()[:120]))
        await writer.drain()
    except (ConnectionResetError, BrokenPipeError):
        pass


# ---------------------------------------------------------------------------
# Room / player state
# ---------------------------------------------------------------------------
@dataclass
class Player:
    pid: str
    writer: asyncio.StreamWriter
    name: str = "Angler"
    room_code: str = ""
    x: float = 0.0
    y: float = 0.0
    a: float = 0.0
    boat_id: Optional[str] = None
    bx: float = 0.0
    by: float = 0.0
    ba: float = 0.0
    boat_speed: float = 0.0
    lure: Optional[tuple] = None  # (x, y, kind) while a cast is in the water
    is_host_display: bool = False
    last_seen: float = field(default_factory=time.time)

    async def send(self, obj: dict):
        try:
            payload = json.dumps(obj, separators=(",", ":")).encode("utf-8")
            self.writer.write(encode_frame(OP_TEXT, payload))
            await self.writer.drain()
        except (ConnectionResetError, BrokenPipeError, RuntimeError):
            pass


@dataclass
class Bird:
    id: str
    species: str
    x: float
    y: float
    flightless: bool
    shy_m: float
    state: str = "perched"  # perched | flying | fleeing
    home_x: float = 0.0
    home_y: float = 0.0
    fled_at: float = -1e9


class Room:
    def __init__(self, code: str, seed: int, climate: str, wildlife: int):
        self.code = code
        self.seed = seed
        self.climate = climate
        self.wildlife = wildlife
        self.created_at = time.time()
        self.empty_since: Optional[float] = time.time()
        self.players: dict[str, Player] = {}
        self.host_pid: Optional[str] = None

        self.env = fp.Env(seed, climate)
        self.terrain = fp.SimpleTerrain(seed)
        self.species = all_species()
        self.by_kind = fp.species_by_kind(self.species, climate)
        self.species_by_id = {sp.id: sp for sp in self.species}

        self.fish: dict[str, fp.FishState] = {}
        self.cell_index: dict[tuple, set] = {}
        self.loaded_cells: set = set()
        self.gone: dict[str, float] = {}  # fish id -> expiry epoch
        self.birds: dict[str, Bird] = {}
        self.visited_bird_patches: set = set()

        self.tick = 0
        self.sim_time = 0.0
        self.last_hash_t = 0.0

    # -- fish cell loading / indexing -----------------------------------
    def ensure_cells_near(self, x: float, y: float, radius: float):
        cx0, cy0 = fp.fish_cell(x - radius, y - radius)
        cx1, cy1 = fp.fish_cell(x + radius, y + radius)
        for cx in range(cx0, cx1 + 1):
            for cy in range(cy0, cy1 + 1):
                key = (cx, cy)
                if key in self.loaded_cells:
                    continue
                self.loaded_cells.add(key)
                for spawn in fp.cell_fish(cx, cy, self.seed, self.wildlife, self.by_kind,
                                            self.terrain, self.env):
                    if spawn.id in self.gone:
                        continue
                    sp = self.species_by_id.get(spawn.species_id)
                    if not sp:
                        continue
                    fstate = fp.make_fish_state(spawn, sp, self.terrain)
                    self.fish[fstate.id] = fstate
                    self.cell_index.setdefault(fstate.cell, set()).add(fstate.id)

    def move_fish_cell(self, f: fp.FishState, old_cell: tuple):
        """Keep the fish's cell bucket in sync with its position atomically: it is removed
        from the old bucket and added to the new one in the same step, and `room.fish` (the
        single canonical record per id) is never touched here -- so a fish can never be
        duplicated or lost at a 16 m cell border. See test_server.py
        CellBorderTests for the regression test."""
        if f.cell == old_cell:
            return
        bucket = self.cell_index.get(old_cell)
        if bucket is not None:
            bucket.discard(f.id)
            if not bucket:
                del self.cell_index[old_cell]
        self.cell_index.setdefault(f.cell, set()).add(f.id)

    def fish_near(self, x: float, y: float, radius: float) -> list:
        cx0, cy0 = fp.fish_cell(x - radius, y - radius)
        cx1, cy1 = fp.fish_cell(x + radius, y + radius)
        out = []
        r2 = radius * radius
        for cx in range(cx0, cx1 + 1):
            for cy in range(cy0, cy1 + 1):
                for fid in self.cell_index.get((cx, cy), ()):
                    f = self.fish.get(fid)
                    if f and f.state != "gone" and (f.x - x) ** 2 + (f.y - y) ** 2 <= r2:
                        out.append(f)
        return out

    def expire_gone(self):
        now = time.time()
        expired = [fid for fid, exp in self.gone.items() if now >= exp]
        for fid in expired:
            del self.gone[fid]
            f = self.fish.get(fid)
            if f:
                # Respawn at its fixed home spot (cellFish's hx/hy), same as the real game:
                # a caught-and-kept fish's id is simply excluded while gone, then reappears
                # unchanged once CONFIG.fishRespawnMinutes has passed (fish-cells.js isGone).
                old_cell = f.cell
                f.x, f.y = f.home_x, f.home_y
                f.cell = fp.fish_cell(f.x, f.y)
                self.move_fish_cell(f, old_cell)
                f.state = "cruising"
                f.gone_until = None

    def to_wire_fish(self, f: fp.FishState) -> dict:
        return {"id": f.id, "species": f.species_id, "x": round(f.x, 2), "y": round(f.y, 2),
                "z": round(f.z, 2), "a": round(f.a, 3), "state": f.state,
                "cm": round(f.length_cm, 1), "kg": round(f.weight_kg, 3)}


# Species data: use the local species/ copy when present (standalone checkout),
# otherwise fall back to the game's own src/fish/ in this repo, so the server
# folder does not need 182 duplicate JSON files.
_HERE = os.path.dirname(os.path.abspath(__file__))
_LOCAL = os.path.join(_HERE, "species")
SPECIES_DIR = _LOCAL if os.path.isdir(_LOCAL) else os.path.join(_HERE, "..", "src", "fish")
_ALL_SPECIES: Optional[list] = None


def all_species() -> list:
    """Species JSON only needs parsing once per process -- every room reuses the same list
    (species_by_kind, which does depend on the room's climate, is still computed per room)."""
    global _ALL_SPECIES
    if _ALL_SPECIES is None:
        _ALL_SPECIES = fp.load_species(SPECIES_DIR)
    return _ALL_SPECIES


class RoomManager:
    def __init__(self):
        self.rooms: dict[str, Room] = {}
        self.join_attempts: dict[str, list] = {}

    def rate_limited(self, ip: str) -> bool:
        now = time.time()
        hist = self.join_attempts.setdefault(ip, [])
        hist[:] = [t for t in hist if now - t < JOIN_RATE_WINDOW_S]
        if len(hist) >= JOIN_RATE_MAX:
            return True
        hist.append(now)
        return False

    def new_code(self) -> str:
        while True:
            code = "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(ROOM_CODE_LEN))
            if code not in self.rooms:
                return code

    def sweep_empty(self):
        now = time.time()
        dead = [c for c, r in self.rooms.items()
                if r.empty_since is not None and now - r.empty_since > EMPTY_ROOM_TTL_S]
        for c in dead:
            del self.rooms[c]


ROOMS = RoomManager()


# ---------------------------------------------------------------------------
# Bird spook model -- simplified per multiplayer-server-plan.md section 10a addendum.
# Birds are generated lazily near players and dropped when no player is close (birds far
# from any player are never simulated, per the addendum). FEAR = birds/birds.js line 162.
# ---------------------------------------------------------------------------
FEAR = 2.0
BIRD_SPECIES = [
    # (label, shy_m, flightless) -- a tiny stand-in roster, not the real bird species JSONs
    ("gull", 9.0, False), ("tern", 11.0, False), ("heron", 14.0, False),
    ("cormorant", 10.0, False), ("penguin", 8.0, True),
]


def ensure_birds_near(room: Room, x: float, y: float):
    """Lazily place bird flocks on a 40 m patch grid, like a coarser cousin of the fish
    cell loader -- each patch is rolled exactly once per room (room.visited_bird_patches),
    so an already-placed flock is never re-rolled and re-reset mid-flight."""
    cx, cy = int(x // 40), int(y // 40)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            patch = (cx + dx, cy + dy)
            if patch in room.visited_bird_patches:
                continue
            room.visited_bird_patches.add(patch)
            key = f"flock:{patch[0]},{patch[1]}"
            h = fp.hash2(patch[0], patch[1], (room.seed + 4201) & fp.MASK32)
            if h < 0.55:
                continue  # most 40m patches have no bird flock
            n = 1 + int(h * 5) % 3
            for i in range(n):
                rng = fp.seeded_rng_from_hash(fp.hash2(patch[0] * 13 + i, patch[1], (room.seed + 4201) & fp.MASK32))
                label, shy_m, flightless = BIRD_SPECIES[int(rng() * len(BIRD_SPECIES))]
                bx = (patch[0] + 0.5) * 40 + (rng() - 0.5) * 30
                by = (patch[1] + 0.5) * 40 + (rng() - 0.5) * 30
                bid = f"{key}#{i}"
                room.birds[bid] = Bird(id=bid, species=label, x=bx, y=by, flightless=flightless,
                                        shy_m=shy_m, home_x=bx, home_y=by)


BIRD_RECOVER_S = 45.0  # how long a flushed bird stays away before settling again


def step_birds(room: Room) -> list[dict]:
    """Returns a list of spook events to broadcast this tick (empty most ticks)."""
    events = []
    players = list(room.players.values())
    if not players:
        return events
    for p in players:
        ensure_birds_near(room, p.x, p.y)
    for b in list(room.birds.values()):
        if b.state == "fleeing":
            if room.sim_time - b.fled_at > BIRD_RECOVER_S:
                b.state = "perched"
                b.x, b.y = b.home_x, b.home_y
            continue
        nearest = min(players, key=lambda p: (p.x - b.x) ** 2 + (p.y - b.y) ** 2)
        near = ((nearest.x - b.x) ** 2 + (nearest.y - b.y) ** 2) ** 0.5
        boat_fast = nearest.boat_id is not None and abs(nearest.boat_speed) > 1.5
        sh = b.shy_m * FEAR
        threshold = sh * 2.2 if boat_fast else sh
        if near < threshold:
            b.state = "fleeing"
            b.fled_at = room.sim_time
            # Flee straight away from the nearest player -- our stand-in for "the far side
            # from the player" (addendum, waddle()) and for a flighted takeoff alike, just
            # at different distances: a penguin waddles/dives a short way to open water, a
            # flighted bird puts real distance between itself and the player.
            away_x = (b.x - nearest.x) / max(near, 1e-3)
            away_y = (b.y - nearest.y) / max(near, 1e-3)
            flee_dist = 25.0 if b.flightless else 60.0
            flee_x = b.x + away_x * flee_dist
            flee_y = b.y + away_y * flee_dist
            scared = room.fish_near(b.x, b.y, 8.0)  # Fo.scare hook: a splash/takeoff scares fish below
            for f in scared:
                if f.state == "cruising":
                    f.state = "fleeing"
                    f.leg_until = room.sim_time + 3.0
            events.append({"id": b.id, "species": b.species, "x": round(b.x, 2), "y": round(b.y, 2),
                            "flightless": b.flightless, "to": [round(flee_x, 2), round(flee_y, 2)],
                            "scared": [f.id for f in scared]})
    return events


# ---------------------------------------------------------------------------
# Simulation tick
# ---------------------------------------------------------------------------
async def room_tick_loop(room: Room):
    try:
        while room.code in ROOMS.rooms:
            await asyncio.sleep(SIM_DT)
            if not room.players:
                continue
            room.tick += 1
            room.sim_time += SIM_DT
            room.env.update(SIM_DT * (24.0 / GAME_DAY_SECONDS))
            room.expire_gone()

            active_fish = []
            for p in room.players.values():
                room.ensure_cells_near(p.x, p.y, FISH_SIM_RADIUS + fp.FISH_CELL)
                active_fish.extend(room.fish_near(p.x, p.y, FISH_SIM_RADIUS))
                if p.lure:
                    room.ensure_cells_near(p.lure[0], p.lure[1], FISH_SIM_RADIUS)
                    active_fish.extend(room.fish_near(p.lure[0], p.lure[1], FISH_SIM_RADIUS))
            seen_ids = set()
            for f in active_fish:
                if f.id in seen_ids:
                    continue
                seen_ids.add(f.id)
                sp = room.species_by_id.get(f.species_id)
                if not sp:
                    continue
                old_cell = f.cell
                fp.step_cruise(f, sp, room.terrain, SIM_DT, room.sim_time, room.seed)
                room.move_fish_cell(f, old_cell)
                maybe_bite(room, f, sp)

            spooks = step_birds(room)
            for ev in spooks:
                await broadcast(room, {"t": "spook", **ev})

            if room.tick % BROADCAST_EVERY_N_TICKS == 0:
                await broadcast_state(room)
            if room.sim_time - room.last_hash_t >= STATE_HASH_EVERY_S:
                room.last_hash_t = room.sim_time
                await broadcast_state_hash(room)
    except asyncio.CancelledError:
        pass


def maybe_bite(room: Room, f: fp.FishState, sp: fp.Species):
    """Server-decided bite: a simplified strike check against any player's lure sitting
    within FISH_VISIBLE_RADIUS, using the species' own diet/activity data so pickiness still
    varies by species -- see fishing/bites.js rigStrike / Game.strikeChance for the much
    richer real version (presentation, rig match, line visibility) this intentionally skips."""
    if f.state != "cruising":
        return
    for p in room.players.values():
        if not p.lure:
            continue
        lx, ly, lkind = p.lure
        if lkind != f.kind:
            continue
        if (f.x - lx) ** 2 + (f.y - ly) ** 2 > FISH_VISIBLE_RADIUS ** 2:
            continue
        rng = fp.leg_rng(f.id, int(room.sim_time * 2), room.seed)  # ~2 checks/sec per fish
        activity = sp.get("behavior", "curiosity", default=0.4)
        if rng() < activity * 0.03:
            f.state = "biting"
            f.leg_until = room.sim_time + 6.0
            asyncio.ensure_future(p.send({"t": "bite", "id": f.id, "species": f.species_id}))
            return


async def broadcast(room: Room, obj: dict, exclude: Optional[str] = None):
    for pid, p in list(room.players.items()):
        if pid == exclude:
            continue
        await p.send(obj)


async def broadcast_state(room: Room):
    for p in room.players.values():
        nearby = room.fish_near(p.x, p.y, FISH_VISIBLE_RADIUS)
        if p.lure:
            nearby += [f for f in room.fish_near(p.lure[0], p.lure[1], FISH_VISIBLE_RADIUS) if f not in nearby]
        boats = [{"id": q.boat_id, "x": round(q.bx, 2), "y": round(q.by, 2), "a": round(q.ba, 3),
                   "v": round(q.boat_speed, 2)} for q in room.players.values()
                 if q.boat_id and q.pid != p.pid]
        players_payload = [{"id": q.pid, "name": q.name, "x": round(q.x, 2), "y": round(q.y, 2),
                              "a": round(q.a, 3)} for q in room.players.values() if q.pid != p.pid]
        await p.send({"t": "state", "tick": room.tick, "fish": [room.to_wire_fish(f) for f in nearby],
                       "boats": boats, "players": players_payload, **room.env.to_wire()})


def room_state_hash(room: Room, x: float, y: float, radius: float) -> str:
    nearby = sorted(room.fish_near(x, y, radius), key=lambda f: f.id)
    parts = [f"{f.id}:{round(f.x)}:{round(f.y)}:{f.state}" for f in nearby]
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:12]


async def broadcast_state_hash(room: Room):
    for p in room.players.values():
        h = room_state_hash(room, p.x, p.y, FISH_VISIBLE_RADIUS)
        await p.send({"t": "hash", "tick": room.tick, "hash": h, "x": round(p.x, 1), "y": round(p.y, 1)})


def snapshot_for(room: Room, p: Player) -> dict:
    nearby = room.fish_near(p.x, p.y, FISH_VISIBLE_RADIUS)
    return {
        "t": "snapshot",
        "room": {"code": room.code, "seed": room.seed, "climate": room.climate,
                   "wildlife": room.wildlife, "hostPid": room.host_pid},
        "env": room.env.to_wire(),
        "fish": [room.to_wire_fish(f) for f in nearby],
        "players": [{"id": q.pid, "name": q.name, "x": q.x, "y": q.y, "a": q.a}
                     for q in room.players.values()],
        "boats": [{"id": q.boat_id, "x": q.bx, "y": q.by, "a": q.ba} for q in room.players.values() if q.boat_id],
        "gone": list(room.gone.keys()),
    }


# ---------------------------------------------------------------------------
# Message handlers
# ---------------------------------------------------------------------------
def make_player_id() -> str:
    return secrets.token_hex(6)


async def handle_create(p: Player, msg: dict):
    try:
        seed = int(msg["seed"]) & 0xFFFFFFFF
    except (KeyError, ValueError, TypeError):
        return await p.send({"t": "error", "code": "bad_request", "message": "create needs an integer seed"})
    climate = msg.get("climate", "temperate")
    if climate not in fp.CLIMATES:
        return await p.send({"t": "error", "code": "bad_request", "message": "climate must be arctic, tropical or temperate"})
    wildlife = int(msg.get("wildlife", 2))
    if wildlife not in (1, 2, 3):
        wildlife = 2
    code = ROOMS.new_code()
    room = Room(code, seed, climate, wildlife)
    ROOMS.rooms[code] = room
    asyncio.ensure_future(room_tick_loop(room))
    await join_room(p, room, msg)


async def handle_join(p: Player, msg: dict):
    code = str(msg.get("code", "")).strip().upper()
    room = ROOMS.rooms.get(code)
    if not room:
        return await p.send({"t": "error", "code": "no_such_room", "message": f"no room {code}"})
    if len(room.players) >= MAX_PLAYERS_PER_ROOM:
        return await p.send({"t": "error", "code": "room_full", "message": "room is full (max 8)"})
    await join_room(p, room, msg)


async def join_room(p: Player, room: Room, msg: dict):
    p.room_code = room.code
    p.name = str(msg.get("name") or "Angler")[:24]
    room.players[p.pid] = p
    room.empty_since = None
    if room.host_pid is None:
        room.host_pid = p.pid
        p.is_host_display = True
    # Pre-warm cells near the world origin so the first snapshot isn't empty: every player
    # starts at (0, 0) until their first player_state arrives, same convention as the real
    # client's Engine.init() spawn at findWater(LAKE, 0, 0, ...).
    room.ensure_cells_near(0.0, 0.0, fp.FISH_CELL * 2)
    await p.send({"t": "joined", "pid": p.pid, "code": room.code, "seed": room.seed,
                   "climate": room.climate, "wildlife": room.wildlife,
                   "hostPid": room.host_pid, "isHost": p.pid == room.host_pid,
                   "protocol": PROTOCOL_VERSION, **room.env.to_wire()})
    await p.send(snapshot_for(room, p))
    await broadcast(room, {"t": "player_joined", "id": p.pid, "name": p.name}, exclude=p.pid)


async def handle_player_state(p: Player, room: Room, msg: dict):
    """Only the player's own on-foot/swimming position -- see handle_boat for boat state,
    kept as a separate message so a `player_state` update never clobbers boat info."""
    p.x = float(msg.get("x", p.x))
    p.y = float(msg.get("y", p.y))
    p.a = float(msg.get("a", p.a))
    p.last_seen = time.time()


async def handle_cast(p: Player, room: Room, msg: dict):
    try:
        x, y = float(msg["x"]), float(msg["y"])
    except (KeyError, ValueError, TypeError):
        return
    env = room.terrain.sample(x, y)
    p.lure = (x, y, env["kind"]) if env["dep"] > 0 else None
    await broadcast(room, {"t": "cast", "by": p.pid, "x": round(x, 2), "y": round(y, 2),
                             "rig": msg.get("rig", "")}, exclude=p.pid)


async def handle_hooked(p: Player, room: Room, msg: dict):
    """First-claim wins: only a fish the server itself put into 'biting' state for this
    player can be claimed, and only while nobody else already holds it."""
    fid = msg.get("id")
    f = room.fish.get(fid) if fid else None
    already_mine = f and f.state == "hooked" and f.claim_owner == p.pid
    if not f or not (f.state == "biting" or already_mine):
        return await p.send({"t": "taken", "id": fid})
    f.state = "hooked"
    f.claim_owner = p.pid
    await broadcast(room, {"t": "claim", "id": fid, "by": p.pid})


async def handle_lost(p: Player, room: Room, msg: dict):
    fid = msg.get("id")
    f = room.fish.get(fid) if fid else None
    if not f or f.claim_owner != p.pid:
        return
    f.claim_owner = None
    f.state = "fleeing"
    f.leg_until = room.sim_time + 2.0
    await broadcast(room, {"t": "lost", "id": fid, "why": msg.get("why", "thrown")})


async def handle_catch(p: Player, room: Room, msg: dict):
    fid = msg.get("id")
    f = room.fish.get(fid) if fid else None
    if not f or f.claim_owner != p.pid:
        return
    kept = bool(msg.get("kept"))
    rec = {"species": f.species_id, "by": p.pid, "name": p.name,
            "cm": round(float(msg.get("cm", f.length_cm)), 1),
            "kg": round(float(msg.get("kg", f.weight_kg)), 3), "kept": kept}
    f.claim_owner = None
    if kept:
        expiry = time.time() + fp.CONFIG["fishRespawnMinutes"] * 60
        room.gone[fid] = expiry
        f.state = "gone"
        await broadcast(room, {"t": "fish_gone", "id": fid, "respawnAt": expiry})
    else:
        f.state = "fleeing"
        f.leg_until = room.sim_time + 2.0
    await broadcast(room, {"t": "catch", **rec})


async def handle_boat(p: Player, room: Room, msg: dict):
    if msg.get("onBoat") is False or msg.get("id") is None:
        p.boat_id = None
        p.boat_speed = 0.0
        return await broadcast(room, {"t": "boat", "by": p.pid, "onBoat": False}, exclude=p.pid)
    p.boat_id = str(msg.get("id", p.boat_id or "boat"))
    p.bx = float(msg.get("x", p.bx))
    p.by = float(msg.get("y", p.by))
    p.ba = float(msg.get("a", p.ba))
    p.boat_speed = float(msg.get("v", 0.0))
    await broadcast(room, {"t": "boat", "by": p.pid, "onBoat": True, "id": p.boat_id,
                             "x": round(p.bx, 2), "y": round(p.by, 2),
                             "a": round(p.ba, 3), "v": round(p.boat_speed, 2)}, exclude=p.pid)


async def handle_chat(p: Player, room: Room, msg: dict):
    text = str(msg.get("text", ""))[:CHAT_MAX_LEN]
    if not text.strip():
        return
    await broadcast(room, {"t": "chat", "by": p.pid, "name": p.name, "text": text})


async def handle_resync(p: Player, room: Room, msg: dict):
    await p.send(snapshot_for(room, p))


HANDLERS = {
    "player_state": handle_player_state,
    "cast": handle_cast,
    "hooked": handle_hooked,
    "lost": handle_lost,
    "catch": handle_catch,
    "boat": handle_boat,
    "chat": handle_chat,
    "resync": handle_resync,
}


async def leave_room(p: Player):
    room = ROOMS.rooms.get(p.room_code)
    if not room or p.pid not in room.players:
        return
    del room.players[p.pid]
    await broadcast(room, {"t": "leave", "id": p.pid})
    if room.host_pid == p.pid:
        # Host leaving: the room and its time/weather authority stay with the server; the
        # next remaining peer is promoted as a *display* host only (see multiplayer-server-plan.md
        # section 10 "Host leaves" and the task brief's "never lose room state").
        room.host_pid = next(iter(room.players), None)
        if room.host_pid:
            room.players[room.host_pid].is_host_display = True
            await broadcast(room, {"t": "host_changed", "hostPid": room.host_pid})
    if not room.players:
        room.empty_since = time.time()


# ---------------------------------------------------------------------------
# Connection handling
# ---------------------------------------------------------------------------
async def handle_connection(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = writer.get_extra_info("peername")
    ip = peer[0] if peer else "?"
    try:
        await ws_handshake(reader, writer)
    except ConnectionClosed:
        writer.close()
        return

    p = Player(pid=make_player_id(), writer=writer)
    try:
        while True:
            raw = await read_message(reader, writer)
            if raw is None:
                break
            if not raw:
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await p.send({"t": "error", "code": "bad_json", "message": "not valid JSON"})
                continue
            t = msg.get("t")
            if t == "ping":
                await p.send({"t": "pong", "ts": msg.get("ts")})
                continue
            if t == "create":
                if ROOMS.rate_limited(ip):
                    await p.send({"t": "error", "code": "rate_limited", "message": "too many attempts, slow down"})
                    continue
                if p.room_code:
                    await leave_room(p)
                await handle_create(p, msg)
                continue
            if t == "join":
                if ROOMS.rate_limited(ip):
                    await p.send({"t": "error", "code": "rate_limited", "message": "too many attempts, slow down"})
                    continue
                if p.room_code:
                    await leave_room(p)
                await handle_join(p, msg)
                continue
            if t == "leave":
                break
            room = ROOMS.rooms.get(p.room_code)
            if not room or p.pid not in room.players:
                await p.send({"t": "error", "code": "not_in_room", "message": "join or create a room first"})
                continue
            handler = HANDLERS.get(t)
            if not handler:
                await p.send({"t": "error", "code": "unknown_type", "message": f"unknown message type {t!r}"})
                continue
            try:
                await handler(p, room, msg)
            except (KeyError, ValueError, TypeError) as e:
                await p.send({"t": "error", "code": "bad_request", "message": str(e)})
    except ConnectionClosed:
        pass
    except (ConnectionResetError, asyncio.IncompleteReadError):
        pass
    finally:
        await leave_room(p)
        try:
            writer.close()
        except Exception:
            pass


async def sweep_loop():
    while True:
        await asyncio.sleep(60)
        ROOMS.sweep_empty()


async def main_async(port: int):
    server = await asyncio.start_server(handle_connection, "0.0.0.0", port)
    asyncio.ensure_future(sweep_loop())
    addrs = ", ".join(str(s.getsockname()) for s in server.sockets)
    print(f"Open Waters multiplayer server listening on {addrs} (ws://host:{port})")
    async with server:
        await server.serve_forever()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    try:
        asyncio.run(main_async(port))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
