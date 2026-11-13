# Open Waters multiplayer wire protocol

JSON over WebSocket (`ws://`). One JSON object per WebSocket text frame, always with a `t`
field naming the message type. No binary frames. No authentication beyond the room code
(see README.md "Limits").

- **Tick rate:** the server simulates fish/birds at **10 Hz** (`SIM_DT = 0.1s`) and
  broadcasts world `state` to each client at **2 Hz** (every 5th tick). Clients should send
  their own `player_state` at roughly the same ~2 Hz (2-4/sec is fine, see
  multiplayer-server-plan.md section 4).
- **Direction** below is `C→S` (client to server), `S→C` (server to client), or both.
- All coordinates are world metres, same axes as the game (`x`, `y` horizontal, `z` up).
  Angles (`a`) are radians, as in `Engine.P.a` / fish heading.
- Every server→client payload that includes fish also includes `species`, the stable `id`,
  `x`/`y`/`z`, heading `a`, `state`, `cm` (length) and `kg` (weight) — see `state` below.

## Connection lifecycle

1. Client opens the WebSocket, sends `create` or `join`.
2. Server replies `joined` (room info + time/weather authority) then immediately `snapshot`
   (full state the new/late joiner needs).
3. Client sends `player_state` at ~2-4 Hz; server broadcasts `state` at 2 Hz back.
4. Either side may send `ping`/expect `pong` for keepalive (WebSocket ping/pong frames are
   also answered transparently at the framing layer, but an app-level `ping` is provided
   too since some browser WebSocket APIs don't expose control frames to JS).
5. Client sends `leave`, or just closes the socket.

## Resync flow

Every `STATE_HASH_EVERY_S` (4s) the server sends each client a `hash` message: a short hash
of that client's nearby fish (ids + rounded positions + state), computed the same way a
`snapshot`'s fish list would be. If the client's own locally-predicted/interpolated view
disagrees for more than a tick or two (or the client just reconnected), it sends `resync`
and the server answers with a fresh `snapshot` — the same message a brand-new joiner gets,
scoped to that client's current position. This never needs the client to say *what* looks
wrong; it just asks for ground truth again.

---

## Message types

### `create` (C→S)
Create a room. The sender becomes its first player and time/weather authority holder (the
room itself, not the player, stays authoritative — see "Host leaves" in README.md).

```json
{"t": "create", "seed": 1234567890, "climate": "temperate", "wildlife": 2, "name": "Sam"}
```
- `seed`: 32-bit int (matches `worldgen.js` `SEED`, `>>> 0`-wrapped server-side).
- `climate`: `"arctic" | "tropical" | "temperate"`.
- `wildlife`: `1 | 2 | 3` (sparse/standard/abundant — `CONFIG.wildlife`), default `2`.
- `name`: optional display name, truncated to 24 chars.

### `join` (C→S)
```json
{"t": "join", "code": "KT4R9M", "name": "Alex"}
```

### `joined` (S→C)
Reply to `create`/`join`. The room's seed/climate/wildlife are fixed for its life; `tod` is
hours/24 (fraction of a day), `yf` is the year fraction (0 = first day of spring), matching
`ENV.setDate(yf, tod*24)` on the client.
```json
{"t": "joined", "pid": "a1b2c3d4e5f6", "code": "KT4R9M", "seed": 1234567890,
 "climate": "temperate", "wildlife": 2, "hostPid": "a1b2c3d4e5f6", "isHost": true,
 "protocol": 1, "yf": 0.1825, "tod": 0.4512, "weather": "fair", "season": "spring"}
```
On error (bad room code, room full, bad request) the server sends `error` instead.

### `snapshot` (S→C)
Full state for a new/late joiner: room config, time/weather, nearby fish, players, boats,
and the gone-fish list (ids currently caught-and-kept, so a client doesn't have to wait to
find out they're missing).
```json
{"t": "snapshot",
 "room": {"code": "KT4R9M", "seed": 1234567890, "climate": "temperate", "wildlife": 2, "hostPid": "a1b2c3d4e5f6"},
 "env": {"yf": 0.1825, "tod": 0.4512, "weather": "fair", "season": "spring"},
 "fish": [{"id": "striped_bass@0,-2.0#0.0", "species": "striped_bass", "x": 3.1, "y": -31.8,
            "z": -0.6, "a": 1.2, "state": "cruising", "cm": 54.2, "kg": 1.9}],
 "players": [{"id": "a1b2c3d4e5f6", "name": "Sam", "x": 0, "y": 0, "a": 0}],
 "boats": [],
 "gone": []}
```

### `player_state` (C→S, ~2-4 Hz)
The sender's own on-foot/swimming position only (see `boat` for boat state — kept separate
so one never clobbers the other).
```json
{"t": "player_state", "x": 12.4, "y": -30.1, "a": 1.57}
```

### `state` (S→C, 2 Hz)
World state scoped to *this* client: fish within ~12 m of them or their lure/line (see
README.md "Known gaps" for why 12 m and not the client's full render distance), other
players' positions, other players' boats, and the live time/weather (so a client's clock
never has to be trusted between snapshots).
```json
{"t": "state", "tick": 184,
 "fish": [{"id": "striped_bass@0,-2.0#0.0", "species": "striped_bass", "x": 3.3, "y": -31.6,
            "z": -0.58, "a": 1.3, "state": "cruising", "cm": 54.2, "kg": 1.9}],
 "boats": [{"id": "boat#1", "x": 40.2, "y": 10.5, "a": 0.2, "v": 1.1}],
 "players": [{"id": "f6e5d4c3b2a1", "name": "Alex", "x": 41.0, "y": 11.0, "a": 0.2}],
 "yf": 0.1826, "tod": 0.4513, "weather": "fair", "season": "spring"}
```

### `hash` (S→C, every 4s)
Resync trigger. See "Resync flow" above.
```json
{"t": "hash", "tick": 220, "hash": "9f2a0c1d4e77", "x": 12.4, "y": -30.1}
```

### `resync` (C→S)
No fields needed beyond `t`; the server answers with a fresh `snapshot`.
```json
{"t": "resync"}
```

### `cast` (C→S, then relayed S→C)
A lure landing in the water. The server records it as that player's active lure (used for
bite checks and interest management) and relays it to everyone else in the room for the
splash/visual.
```json
{"t": "cast", "x": 5.2, "y": -28.0, "rig": "bass_crankbait"}
```
Relayed to others as:
```json
{"t": "cast", "by": "a1b2c3d4e5f6", "x": 5.2, "y": -28.0, "rig": "bass_crankbait"}
```

### `bite` (S→C, to one player)
The server decided a fish near that player's lure struck. Only the player whose lure it was
gets this message (see fish_populations.py's simplified strike check vs. the much richer
`fishing/bites.js`).
```json
{"t": "bite", "id": "striped_bass@0,-2.0#0.0", "species": "striped_bass"}
```

### `hooked` (C→S)
A claim attempt: "I struck at this bite." First-claim wins per fish id.
```json
{"t": "hooked", "id": "striped_bass@0,-2.0#0.0"}
```

### `claim` (S→C, broadcast)
Granted: everyone in the room is told who now has this fish hooked (so they see it as
`state: "hooked"` and can render the other player's fight).
```json
{"t": "claim", "id": "striped_bass@0,-2.0#0.0", "by": "a1b2c3d4e5f6"}
```

### `taken` (S→C, to the loser only)
Sent instead of `claim` to a player whose `hooked` lost the race (the fish wasn't in
`biting` state for them, or someone else already claimed it) — "the fish throws the hook"
from that player's point of view.
```json
{"t": "taken", "id": "striped_bass@0,-2.0#0.0"}
```

### `lost` (C→S, then broadcast)
The fight ended without a catch (snapped line, thrown hook, eaten, dropped). `why` is
free-form but mirrors the client's own `fight.js` reasons (`"snap" | "thrown" | "eaten" | "drop"`).
```json
{"t": "lost", "id": "striped_bass@0,-2.0#0.0", "why": "thrown"}
```
Broadcast unchanged (plus it's only honoured if the sender is the fish's current claim owner).

### `catch` (C→S, then broadcast)
Landed, kept or released.
```json
{"t": "catch", "id": "striped_bass@0,-2.0#0.0", "kept": true, "cm": 54.2, "kg": 1.9}
```
Broadcast to the room as a catch record (for a toast / chat line):
```json
{"t": "catch", "species": "striped_bass", "by": "a1b2c3d4e5f6", "name": "Sam",
 "cm": 54.2, "kg": 1.9, "kept": true}
```

### `fish_gone` (S→C, broadcast)
Sent in addition to `catch` whenever `kept: true` — the fish is removed for *everyone*
until it respawns.
```json
{"t": "fish_gone", "id": "striped_bass@0,-2.0#0.0", "respawnAt": 1781234567.89}
```
`respawnAt` is a Unix timestamp (seconds); `CONFIG.fishRespawnMinutes` = 30.

### `boat` (C→S, then relayed S→C)
Boat position/speed, or boarding/leaving.
```json
{"t": "boat", "onBoat": true, "id": "boat#1", "x": 40.2, "y": 10.5, "a": 0.2, "v": 1.1}
```
Leaving a boat:
```json
{"t": "boat", "onBoat": false}
```

### `chat` (C→S, then broadcast)
Plain text only, capped at 240 characters (`CHAT_MAX_LEN`).
```json
{"t": "chat", "text": "nice one!"}
```
Broadcast as:
```json
{"t": "chat", "by": "a1b2c3d4e5f6", "name": "Sam", "text": "nice one!"}
```

### `spook` (S→C, broadcast)
The server decided a bird (or flock member) flushes. `to` is where it's headed (a short
flight for a flighted bird, a waddle/dive to open water for a flightless one — `flightless`
tells the client which animation to play). `scared` lists any fish ids the splash/takeoff
startled (the `Fo.scare` hook — see `fishing-behaviour`/`birds.js` cross-reference in
fish_populations.py).
```json
{"t": "spook", "id": "flock:3,5#0", "species": "gull", "x": 128.4, "y": -44.1,
 "flightless": false, "to": [184.2, -92.6], "scared": ["striped_bass@0,-2.0#0.0"]}
```

### `player_joined` / `leave` / `host_changed` (S→C, broadcast)
```json
{"t": "player_joined", "id": "f6e5d4c3b2a1", "name": "Alex"}
{"t": "leave", "id": "f6e5d4c3b2a1"}
{"t": "host_changed", "hostPid": "f6e5d4c3b2a1"}
```
`host_changed` only ever changes who holds the *display* host flag (map/HUD labelling); the
server keeps owning the simulation and the room's time/weather regardless of who the display
host is — see README.md "Host leaves".

### `ping` / `pong` (either direction)
```json
{"t": "ping", "ts": 1781234567890}
{"t": "pong", "ts": 1781234567890}
```

### `error` (S→C)
```json
{"t": "error", "code": "room_full", "message": "room is full (max 8)"}
```
Codes used: `bad_request`, `bad_json`, `no_such_room`, `room_full`, `rate_limited`,
`not_in_room`, `unknown_type`.

### `leave` (C→S)
No fields needed; the server removes the player and closes the connection.
```json
{"t": "leave"}
```
