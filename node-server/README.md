# Open Waters multiplayer server (Node, v1)

A small WebSocket server for a charter room of up to ~5 players (cap 8). It is server-authoritative: the server runs the
fish (and the bird spook decisions) on the **shared simulation** (`../src/sim/` in the same repo checkout, required
from where it lives, not copied) on the **real island**, loaded headless from the game's own scripts. Clients only render and interpolate what
they are sent. Everything is in memory for the life of a room, with no auth and no persistence.

Built Nov 14, 2026 by Claude Code (Opus 5.5). Local only: nothing pushed, nothing hosted. No game code was changed
(`src/js`, `bites.js`, `fight.js` untouched), and the shared sim, the Python server and the built HTML were not touched.

## Files

| file | what |
|---|---|
| `server.js` | entry point: HTTP + WebSocket, room codes, create/join/leave, message dispatch, the fixed tick loop |
| `room.js` | one room: a `createSim` world on the real island, players, interest management, state/hash/snapshot, hook/land/unhook |
| `room-birds.js` | server birds: seeded placement near players from the real bird JSON, spook decisions via the shared `birdSpooked` / `flightlessSpooked` / `fleeSpot` / `birdScatter` |
| `island.js` | loads the real island headless (the game's `src/sim/*`, `config.js`, `worldgen.js`, every `world/island-*.js` …, in `index.html` order) and returns the game's own `SIM_TERRAIN` adapter, `waterInfo`, `cellFish` |
| `ws.js` | a minimal RFC 6455 WebSocket server on Node's `http` upgrade (text frames, ping/pong, close) |
| `test_two_clients.mjs` | the two-client test |
| `verify_real_water.mjs` | the real-water check |
| `package.json` | scripts only, **no dependencies** |

## Running it

Needs Node 22 or newer (tested on v24.22.1). **No `npm install` and no dependencies.** The WebSocket server is
`ws.js` (stdlib only), and the tests use Node's built-in `WebSocket` client and `fetch`.

Run it from a repo checkout (the `multiplayer` branch), from the repo root:

```sh
cd OpenWaters                    # the repo root
node node-server/server.js       # ws://localhost:8790  (or: node node-server/server.js 9000, or PORT=9000 ...)
```

The shared sim now comes from `src/sim/` in the same checkout (`require('../src/sim/index.js')`); there is no
separate `src-sim/` copy. The server also needs the game source for the island, species and bird JSON. It finds it
like this: `OPENWATERS_REPO` if set; otherwise the parent of `node-server/` if it looks like a repo root (has
`src/index.html` and `src/sim/index.js`), which is the normal case in a checkout; otherwise the old local working copy
`../../../hidden_files/openwaters-repo`. `OPENWATERS_REPO=/path/to/OpenWaters` is optional and only needed to point
the island at a different checkout. HTTP `GET /stats` returns per-room numbers (fish simulated, fish sent per client, birds), and
`GET /health` returns `ok`.

The first room on a seed + climate builds the island (about 2.3 to 2.7 s for seed 42). Later rooms on the same island reuse it.

### Tests

From the repo root:

```sh
node tests/sim-smoke.mjs                                       # the shared sim's smoke test
node node-server/test_two_clients.mjs                          # starts its own server on a spare port
SERVER_URL=ws://localhost:8790 node node-server/test_two_clients.mjs   # or against one you started
node node-server/verify_real_water.mjs 42 temperate 100        # seed, climate, minimum number of fish to check
```

The smoke test imports `../src/sim/index.js` and reads `src/index.html`, so it needs the repo root as the working
directory. The server scripts resolve their paths from their own folder, so they work from any working directory.

## How it works

- **Rooms:** `create` makes a room with a 6-character code (no 0/O/1/I), the seed, the climate and the wildlife level,
  with one `createSim` world per room. `join` by code. Same seed + climate for everyone, fixed for the room's life. An
  empty room closes after 60 s.
- **Terrain:** the real island, via `island.js`. The terrain handed to `createSim` is the game's own `SIM_TERRAIN`
  object (`src/js/world/seasons-weather.js`), the same object the browser hands to the shared sim. Nothing was ported
  into `src/sim`. Each tick, the island's own `ENV` (lake wind drift, plant growth for cover) is set from the room's
  clock and weather.
- **Tick:** fixed **20 Hz** (`dt = 0.05 s`). `state` goes out at **2 Hz** (every 10th tick). `hash` goes out every
  **4 s**. Bird spook checks run at 5 Hz. Fish cells are simulated within 72 m of each player (the game's radius).
  Measured: 5 players at the sea, 652 fish simulated, **3.4 ms per tick** (the 20 Hz budget is 50 ms).
- **Interest management:** each client's `state` and `snapshot` carry only the fish **within 12 m of that player**,
  **within 12 m of their lure**, or **on anyone's line**. The room never sends all its fish.
- **Hook / land / unhook:** the shared sim's ledger (`sim.hook`, `sim.land`, `sim.unhook`). The first claim wins. A
  kept catch is gone for everyone (`fish_gone`). A released fish stays and bolts. A lost fish is freed for anyone. Only
  the claim holder can land or lose a fish. A player who leaves lets go of whatever they had on the line.
- **Respawn:** wall-clock. The ledger's clock is `Date.now()`, so a kept fish is gone for `fishRespawnMinutes` (30
  minutes) from the catch. It then returns from its fixed cell record (same id, home point, length and weight) and the
  room gets `fish_back`.
- **Birds:** placed from the real `src/birds/*.json` roster for the climate (habitat weights by water kind, penguins on
  sea coasts), seeded per 48 m patch, only within ~2 patches of a player, and never within 25 m of one. Each check, the
  shared rules decide which birds a player flushes: `birdSpooked` (shy × FEAR, closer for swimmers, further for a fast
  boat), or `flightlessSpooked` plus `fleeSpot` for penguins. A flushed bird is broadcast as `spook` with where it heads
  and the fish within **8 m** that it scattered (`birdScatter`, which really spooks them in the sim). It comes back to
  its spot after 45 s. Flight animation stays on the client.
- **Hash / resync:** see `hash` below.

## Protocol

JSON over WebSocket, one object per text frame, each with a `t` field. Units and axes are as in the Python server's
`protocol.md`: world metres, `x`/`y` horizontal, `z` up, angles in radians. The message types and field names follow
`protocol.md`, so a future `charter.js` can talk to either server. **Every difference is listed in the next section.**

### Client → server

| t | fields | notes |
|---|---|---|
| `create` | `seed` (int, `>>> 0`), `climate` (`temperate`/`arctic`/`tropical`, default `temperate`), `wildlife` (1/2/3, default 2), `name` | → `joined` + `snapshot` |
| `join` | `code` (case-insensitive), `name` | → `joined` + `snapshot`; others get `player_joined` |
| `player_state` | `x`, `y`, `a`; optional `z`, `swim`, `wade`, `moving`, `lure` (`{x, y}` while the lure is out, `null` when reeled in) | ~2-4 Hz. `moving` is worked out from the position change if omitted |
| `cast` | `x`, `y`, `rig` | sets the lure, makes a splash in the sim (`sim.disturb`), relayed to others as `{t:'cast', by, x, y, rig}` |
| `hooked` | `id` | hook claim (from `Game.on('hooked')`) → `claim` to the whole room, or `taken` to the sender |
| `lost` | `id`, `why` (`snap`/`thrown`/`eaten`/`drop`) | claim holder only → `lost` broadcast; the fish is freed and bolts |
| `catch` | `id`, `kept`, `cm`, `kg` | claim holder only → `catch` broadcast; kept → also `fish_gone` |
| `boat` | `onBoat`, `id`, `x`, `y`, `a`, `v` | relayed as `{t:'boat', by, …}`; `v` also counts for bird spooking (fast boat) |
| `chat` | `text` (≤ 240 chars) | broadcast `{t:'chat', by, name, text}` |
| `resync` | none | → a fresh `snapshot` |
| `ping` | `ts` | → `{t:'pong', ts}` |
| `leave` | none | the server removes the player and closes the socket |

### Server → client

| t | fields |
|---|---|
| `joined` | `pid`, `code`, `seed`, `climate`, `wildlife`, `hostPid`, `isHost`, `protocol: 1`, `tickHz`, `start {x, y, a}` (the lake spawn every client gets from `Engine.init`), `yf`, `tod`, `weather`, `season` |
| `snapshot` | `tick`, `hash`, `room {code, seed, climate, wildlife, hostPid}`, `env {yf, tod, weather, season}`, `fish [...]`, `birds [...]`, `players [{id, name, x, y, a}]`, `boats [...]`, `gone [ids]`, `respawnAt {id: unix seconds}` |
| `state` (2 Hz) | `tick`, `fish [...]`, `birds [...]`, `players [{id, name, x, y, a, swim, wade, lure}]` (others only), `boats [{id, by, x, y, a, v}]`, `yf`, `tod`, `weather`, `season` |
| `hash` (every 4 s) | `tick` (the `state` it covers, sent just before it), `hash`, `x`, `y` |
| `claim` | `id`, `by` |
| `taken` | `id`, `reason` (`taken`/`gone`/`too_far`/`not_yours`), `by` (when `taken`) |
| `lost` | `id`, `by`, `why` |
| `catch` | `id`, `species`, `by`, `name`, `cm`, `kg`, `kept` |
| `fish_gone` | `id`, `respawnAt` (unix seconds; catch time + 30 min) |
| `fish_back` | `id` (respawned at its home point) |
| `spook` | `id`, `species`, `x`, `y`, `flightless`, `action` (`takeoff`/`waddle`), `to [x, y]`, `a` (heading), `by` (who flushed it), `scared [fish ids within 8 m]` |
| `cast`, `boat`, `chat` | relays, see above |
| `player_joined` / `leave` / `host_changed` | `{id, name}` / `{id}` / `{hostPid}` |
| `pong` | `ts` |
| `error` | `code` (`bad_request`, `bad_json`, `no_such_room`, `room_full`, `rate_limited`, `not_in_room`, `unknown_type`), `message` |

A fish on the wire is `{id, species, x, y, z, a, state, cm, kg, hooked?}`. `id` is the game's stable id
(`species@cx,cy.kind#group.member`, from `cellFish`). `hooked` is the pid holding it, present only while it is on a
line. A bird on the wire is `{id, species, x, y, z, st}`, with `st` one of `float`, `stand` or `away`.

**Hash recipe** (the same as the Python server's, so one client function works for both): sort the fish by `id`, then
build `id:round(x):round(y):state` for each and join them with `|`. Take the SHA-1 and keep the first 12 hex digits. The
server hashes **exactly the fish list it sent in the `state` with the same `tick`**, using the wire values, and sends the
`hash` right after that `state`. A client hashes its own copy of that state's fish. If the two differ, it sends `resync`
and gets a `snapshot`, which carries its own `hash` for an immediate check.

## Differences from the Python server's `protocol.md`, and why

1. **No `bite` message; claims come from the client.** Bites stay in the client's `bites.js` (agreed decision 4: the
   server wraps the ledger and does not touch `bites.js`/`fight.js`; the shared sim's `lureFor` is null on a server).
   The future `charter.js` sends `hooked` from `Game.on('hooked')`. The Python server only accepted claims on fish its
   own stand-in bite check had put into `biting`. This server accepts a claim on any live fish within 100 m of the
   claimer or their lure, and otherwise answers `taken` with `reason: 'too_far'`.
2. **`taken` carries `reason` (and `by`).** This lets the client tell "someone else has it" from "it's gone" or
   "too far". It is also sent when a `catch` or a claim is refused, where Python stayed silent, so the client is never
   left waiting.
3. **`player_state` has optional `z`, `swim`, `wade`, `moving` and `lure`.** The shared sim needs `inWater` (swimmers
   and waders scare fish) and `moving`. Interest management needs the lure. Bird spooking needs `swim`. Python had
   only `x`, `y`, `a` plus a separately cast lure. All the extra fields are optional, so a Python-style client still
   works.
4. **Fish `state` values are the shared sim's names** (`rest`, `cruise`, `forage`, `hunt`, `hold`, `flee`, `haul`,
   `breathe`, `hooked`, …), not the Python stand-in's (`cruising`, `biting`, `fleeing`). These are the game's own
   behaviour states, so a client can use them directly. There is also a `hooked: pid` field.
5. **Interest set:** within 12 m of the player, **or of their lure, or on any line** (the agreed rule). The Python
   `state` added fish near the lure, but its `snapshot` and `hash` used only the 12 m round the player.
6. **`hash` covers exactly the fish in the `state` of the same `tick`**, hashed on the rounded wire values with
   `Math.round` (half up). The Python server hashed its live fish round the player at a moment unrelated to any `state`.
   Python's `round()` is also half-to-even, so a client could not reliably reproduce it. The recipe string is otherwise
   identical.
7. **`snapshot` adds `tick`, `hash`, `birds` and `respawnAt`.** `hash` makes a resync verifiable at once. `respawnAt`
   gives the expiry for each `gone` id, so a late joiner knows when each fish comes back.
8. **New `fish_back` message.** It is sent when a gone fish respawns, so clients don't have to run their own 30-minute
   timers. `fish_gone` is unchanged.
9. **`spook` uses real birds and adds fields.** Ids look like `bird:px,py#i` and `species` is the real bird id
   (`herring_gull`, `gentoo_penguin`, …) instead of the Python stand-in labels (`gull`). It adds `action`, `a` (heading)
   and `by`. Who flushes is decided with the shared `birdSpooked`/`flightlessSpooked` rules, and the target is
   `fleeSpot` for penguins.
10. **`state` adds `birds`, and its `players` entries add `swim`, `wade` and `lure`.** Clients need the server's birds
    to show the same birds that get spooked, and peers' lures to draw markers. `boats` entries add `by`.
11. **`joined` adds `tickHz` and `start`. `catch` adds `id`. `lost` adds `by`.** These are additive.
12. **Tick 20 Hz instead of 10 Hz.** This matches the shared sim's documented server tick and gives smoother fish
    physics. It is internal: `state` is still 2 Hz and `hash` is still every 4 s.
13. **A `cast` always sets the lure and makes a splash** (`sim.disturb`). Python dropped the lure if its stand-in
    terrain said "not water". Here the client's real terrain decided, and it is the same island.
14. **Extras outside the protocol:** `GET /stats` and `GET /health`, and the default port 8790.

## Verification (run Nov 14, 2026, Node v24.22.1)

- **Shared sim smoke test:** `node tests/sim-smoke.mjs` with the repo root as the working directory: **PASS, 1388 checks**.
- **Two-client test** (`node test_two_clients.mjs`): **31 passed, 0 failed.** (a) B gets `fish_gone` for A's kept fish
  with `respawnAt` 30.00 min ahead. (b) B gets the `spook` A caused (a herring gull, takeoff, 24 fish scared within 8 m).
  (c) B's own hash matches the server's (3 fish). A corrupted view is detected (`139875d7bc34` vs `6be159974380`),
  `resync` returns a snapshot that matches its hash, and the next hash matches again. (d) B's claim on A's hooked fish
  gets `taken` (by A). Also covered: release (no `fish_gone`, re-hookable), lost (freed), only the holder can land,
  gone fish can't be hooked, chat, leave, host change.
- **Real-water check** (`node verify_real_water.mjs`): the server's broadcast fish positions at the start lake, the sea,
  a lake, a pond, a river and a creek, checked with the game's own exact water test `waterInfo(x, y).wet` on an island
  built separately in the test process:

  | seed 42 | fish checked | in water (exact) | on land (exact) | of those: hauled out / water in the game's cached `sample()` lattice / unexplained | ids in the game's own `cellFish` | stand-in lake says water | result |
  |---|---|---|---|---|---|---|---|
  | temperate | 469 | 467 | 2 | 1 / 1 / 0 | 469/469 | 45 | PASS |
  | arctic | 108 | 108 | 0 | 0 / 0 / 0 | 108/108 | 8 | PASS |
  | tropical | 332 | 331 | 1 | 0 / 1 / 0 | 332/332 | 34 | PASS |

  The 3 "on land" fish are a red-eared slider hauled out on the bank by design (state `haul`, 3 mm past the waterline),
  and two animals within 0.15 m of the shore, where the exact terrain is a hair dry but the game's cached 2 m `sample()`
  lattice has 0.43-0.46 m of water. The game's own fish movement steers by that same lattice in the browser, so a client
  would place those fish in the same spot. Every fish id, with its length, is one of the game's own `cellFish` records
  for that cell (the population a client builds). Only 45 of 469 positions would even be water in the stand-in round
  lake. The sea site is about 1,300 m from it.
- **Headless island load time, seed 42:** 2.3 to 2.7 s per build (2,282 to 2,699 ms in every logged build, all three climates).
- **Interest management:** the start lake had 223-240 fish simulated in the room and 0-4 sent per client per `state`
  (average 2.3). Across all the sites: up to 619 fish simulated (temperate; 515 tropical, 184 arctic), and the largest
  single `state` carried 118 fish (a dense sea school round the lure). The 1,200 cap (`maxFish`) was never reached.

## Still missing

- **`charter.js`, the game-side client** (not built, by instruction). It needs to: join and reload into the room's seed
  and climate; send `player_state` and `cast`; call `hooked`/`catch`/`lost` from `Game.on('hooked'/'catch'/'lost')`;
  render and interpolate the server's fish instead of its own near players; apply `fish_gone`/`fish_back`; and show the
  server's birds and play `spook` takeoffs. The game's `birds.js` today spawns its own random birds round the local
  player, so without that adapter they would not match the server's.
- **Hosting, TLS (`wss://`), auth, Origin checks, persistence:** none. Use a TLS reverse proxy when hosting.
  Rooms live only in memory. The room code is the only key, and only `create`/`join` are rate-limited.
- **Known v1 limits:**
  - The first island build per seed + climate blocks the process for ~2.5 s (a worker thread could fix this).
  - Rooms on the same island share its `ENV` for wind and cover.
  - The server steps every fish within 72 m at the full rate (no level of detail).
  - A hooked fish holds still on the server while the fight runs on the client.
  - Nothing follows lures on the server.
  - `ws.js` has no compression.
