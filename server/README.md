# Open Waters multiplayer server (Python, stdlib only)

A server-authoritative multiplayer room server for Open Waters: the server owns fish and
bird simulation near players, time/weather, hook claims, and catches; clients render from
its snapshots. See `../multiplayer-server-plan.md` (and its section 10a addendum, Grant's
Nov 13 2026 decision that the server has to own the simulation) for the design this
implements, and `protocol.md` for the full wire protocol.

Grant asked for Python, not Node. This is pure Python 3 standard library — no `pip install`,
no `requirements.txt`. The WebSocket handshake and frame (de)coding (RFC 6455) are
implemented from scratch on top of `asyncio` in `server.py`.

## Files

- `server.py` — the server: WebSocket handshake/framing, rooms, the fixed-tick simulation
  loop, and every message handler. Run this.
- `fish_populations.py` — the deterministic world model: the ported RNG core (`mulberry32`,
  `hash2`), the `cellFish` population algorithm, habitat/water-temperature/season-weather
  math, the simplified terrain, and the simplified fish movement model. Imported by
  `server.py`; not meant to be run directly.
- `species/*.json` — every species definition copied verbatim from the game's own
  `src/fish/*.json` (182 files: fish, rays, cephalopods, shellfish, reptiles/amphibians,
  jellies — whatever the real `cellFish` would also place in a cell). `fish_populations.py`
  applies the same defaulting (`FISH_DEFAULTS` + `deepMerge`) and derived fields
  (`_hid`, `_herp`, `_shell`, `_benthic`, ...) as the game's `creatures/*.js` at load time, so
  this is live data, not a pre-baked snapshot — if Grant edits a species file in the real
  repo, copy the updated JSON here and the server picks up the new numbers next run.
- `protocol.md` — every message type, direction, and example JSON.
- `test_server.py` — stdlib `unittest`, no network, no extra deps.
- `test_client.py` — a tiny two-client smoke test against a *running* server.

## Running it

```bash
cd multiplayer-python-server
python3 server.py            # listens on ws://0.0.0.0:8765
python3 server.py 9000       # or pick a port
```

No virtualenv, no dependencies. Stop it with Ctrl-C.

## Testing with two clients

1. Start the server in one terminal: `python3 server.py`
2. In another terminal: `python3 test_client.py localhost 8765`

   This connects two WebSocket clients, has one `create` a room and the other `join` it with
   the returned code, moves both, casts a line, prints every message each client receives
   for ~8 seconds (you should see `joined`, two `snapshot`s, periodic `state` broadcasts, the
   chat line echoed to both, and a `hash` resync-trigger message), then asks for a `resync`
   snapshot and leaves. It is a *manual* smoke test — bites and claims are probabilistic and
   timing-dependent, so read the printed output rather than expecting a pass/fail line.

3. To poke at it by hand instead, open two browser tabs to any page and run in the console:
   ```js
   const ws = new WebSocket('ws://localhost:8765');
   ws.onmessage = e => console.log(JSON.parse(e.data));
   ws.onopen = () => ws.send(JSON.stringify({t: 'create', seed: 42, climate: 'temperate'}));
   ```
   then in the second tab, `join` with the `code` the first tab logged.

### Running the unit tests

```bash
python3 -m py_compile server.py fish_populations.py test_server.py test_client.py
python3 -m unittest test_server.py -v
```

(`pytest` works too if installed, but isn't required — the task asked for stdlib
`unittest` and that's what's here.)

## What the game client still needs (`charter.js`)

This server is only half of the plan in `multiplayer-server-plan.md`. Nothing under
`src/js/` was touched (out of scope for this task — read-only), so a browser client still
needs writing. From the plan, section 1 and section 3-4, in order:

1. **A new `src/js/charter.js`**, loaded after `game.js` and before `boot.js` in
   `src/index.html` (next to `two-rods.js`), using only the browser's built-in `WebSocket`
   (no library, keeping the game dependency-free) and the existing `Game` event bus
   (`Game.on('cast'|'hooked'|'lost'|'catch'|'boardBoat'|'leaveBoat', ...)`, `Game.player`,
   `Game.boat`, `Game.angler`, `Game.teleport`, `Game.say`).
2. **Title panel**: a room code box next to the existing `#tiSeed` control (`create`/`join`),
   wired to send this server's `create`/`join` and handle `joined`/`error`.
3. **Reload-to-match-seed**: on `joined`, if `SEED !== seed || CLIMATE.key !== climate`,
   reload to `#seed-<seed>&climate-<climate>&pick&room-<CODE>` (the plan's section 3, item
   2) — and add `room` to `HASH_OPTS` in `world/worldgen.js` (one line) or stash the code in
   `sessionStorage`, or a lost graphics context / "Main menu" / new-island reload drops the
   room (plan section 3, item 3; section 10 risk).
4. **Lock T/Y/U** (time/season/weather keys) while in a charter room — the server is now the
   authority (`snapshot`/`state` carry `yf`/`tod`/`weather`; call `ENV.setDate`/`setWeather`
   from them, same calls `Engine.init()` already makes for Continue).
5. **Send** `player_state` at ~2-4 Hz from `Game.on('update', dt)`, `cast`/`hooked`/`lost`/
   `catch` from their matching `Game.on(...)` events (this server's claim/fish_gone flow
   needs the real fish `id`, i.e. `f.id` from the event payloads — the plan's section 5 "v1.5"
   `fishId` addition), `boat` from `Game.on('boardBoat'|'leaveBoat', b)` plus a position tick.
6. **Render** `state`/`spook` messages: proxy boats and name tags per plan section 4 ("Showing
   other players" — the `on-board.js`/`engine/boats.js`/`inventory-save.js` tweaks it lists
   so remote boats don't drift, get evicted, or get saved locally), nearby-fish markers from
   the `fish` list (species, id, x/y/z, heading, state, cm, kg — this server already sends
   exactly those fields), and bird spook animations from `spook` (`flightless` picks
   waddle/dive vs. takeoff).
7. **Resync**: if a client's own simulation disagrees with the periodic `hash` message for
   more than a tick or two, send `resync` and apply the returned `snapshot` wholesale.

None of this was written or tested here — it needs a running browser, which is out of this
task's scope (write-only to this folder).

## Limits

- 8 players per room (`MAX_PLAYERS_PER_ROOM`).
- 32 KB per WebSocket message (`MAX_MESSAGE_BYTES`); oversized frames close the connection
  with WS code 1009.
- `create`/`join` are rate-limited per source IP: 8 attempts per 10 seconds
  (`JOIN_RATE_WINDOW_S` / `JOIN_RATE_MAX`).
- Empty rooms (everyone left) are deleted after 10 minutes (`EMPTY_ROOM_TTL_S`), swept once
  a minute.
- Chat is plain text, capped at 240 characters (`CHAT_MAX_LEN`), relayed as-is (no markup,
  no links parsed).
- Room codes are 6 characters from an alphabet with no `0/O`, `1/I/l` (`ROOM_CODE_ALPHABET`)
  — there are no passwords; the code is the only login, matching
  `multiplayer-server-plan.md` section 7.
- `Origin` is not checked — the plan's section 7 correction explicitly calls for allowing
  the Electron build's `file://`/null origin and the itch.io iframe, and checking a
  same-site-only allowlist would lock both out; the room code is already the only gate.

## Host leaves

The **server**, not any player, is the time/weather authority and the only place fish and
bird state live — so when the player who happened to create the room disconnects, nothing
about the room changes except who holds the **display**-host flag (`host_changed`, used
for map/HUD labelling only, per the plan's section 10 "Host leaves"). Room state, fish,
claims and the gone-fish list are untouched. An empty room (zero players) is kept for 10
minutes in case everyone reconnects, then swept.

## Known gaps / simplifications (read this before trusting any specific number)

Ported **faithfully** (same algorithm, same RNG streams, same output given the same input —
verified by `test_server.py`'s determinism tests, not just "looks similar"):

- `mulberry32`, `hash2`, `gauss`, `poisson`, `sampleFishSize` — the exact seeded-RNG core
  from `world/fish-populations.js` and `engine/shared.js`.
- `cellFish` itself: the per-16m-cell population algorithm — same per-species RNG stream
  (`hash2(cx*7+kind, cy, SEED+D._hid)`), same stable fish IDs
  (`species@cx,cy.kind#group.index`), same fixed home/length/weight sampling, same
  `CONFIG.cellMaxAnimals` cap (60) and wildlife scaling (`{1: 0.4, 2: 1, 3: 2.2}`), same
  species-type abundance split (fish/shellfish/herp).
- `habitatScore`, `fitRange`, `currentFit`, `coverFit`, `oxyFit`, `waterTemp`, `oxygen`,
  `seaWarm`'s warm/cold-current split, and the full `seasons-weather.js` `ENV` state
  machine (weather transition weights, pressure, air temperature, ice thresholds) — these
  are self-contained math, so they're ported line-for-line.
- `makeNoise` (the client's seeded Perlin-like noise) — also self-contained and ported
  exactly, used for the simplified terrain's coastline/hill texture.
- Species data itself: `species/*.json` are the real files, merged with the real defaults.

**Deliberately simplified** (the task brief explicitly allows this, and asks that it be
documented rather than silently approximated — here it is):

1. **Terrain / island shape — the biggest gap.** The real game's island, lakes and rivers
   come from `world/island-layout.js` + `world/island-water.js`: a priority-flood watershed
   simulation that floods basins to their spill points, accumulates flow, and grows rivers
   and lakes from that. It's `multiplayer-server-plan.md` section 5's own "Option A... the
   biggest job" for a reason — porting it faithfully means porting the island's terrain
   grid, lake siting, river/creek chain-building and meander/rapids logic as one more
   tightly-coupled ~700-line system, on top of everything above. `SimpleTerrain` in
   `fish_populations.py` instead lays out **one island, a spawn lake near the origin (so a
   joining player at (0, 0) actually has fish nearby) plus three more lakes, two ponds and one
   river/creek system** from the seed using the same `mulberry32`/noise primitives, so it's
   deterministic and climate-appropriate species still find a sea, a lake, a river and a
   creek to live in — but it is a different, much simpler shape than the real client draws,
   and a room's seed will **not** reproduce the real game's island. Positions sent to
   clients are the server's own; a real integration needs the client to either (a) ignore
   the server's world geometry and just trust fish x/y/z blindly (they'll still land in
   *some* body of water matching their species, just not the client's rendered one), or
   (b) this terrain model gets replaced with a real port before shipping — see the plan's
   own "fishing mechanic honed first before building v2" sequencing note.
2. **Water-plant / cover placement isn't ported** (`world/water-plants-grid.js`'s
   `registerPlants`/`plantAt`/`coverAt`). `env.cover` is always empty, so `coverFit` always
   returns its cover-factor-1 branch, and any species needing a specific cover
   (`cover_required >= 0.5`, e.g. a clownfish's anemone) is skipped entirely rather than
   guessing at a distribution — see `cell_fish`'s explicit `continue` for `sp.need_cover`.
3. **Fish movement is intentionally simple**, per the task brief itself ("a simple,
   deterministic, seeded behaviour model... keep it simple and document the simplification"):
   `step_cruise` loops a fish around its home point within `population.home_range_m`, at a
   depth picked from its preferred zone, turning at a bounded rate. There is no hunting,
   schooling, fleeing-from-a-specific-threat, feeding, breathing/surfacing or fight physics
   state machine (`engine/fish-behaviour.js` `fishDecide`/`fishStep`/`mammalStep` and
   `fishing/fight.js` in full). Only fish within ~20 m of a player or a lure are simulated at
   all each tick; farther fish stay parked at their home point (never synced, per the plan's
   addendum: "never sync all ~1200 fish").
4. **Bites/strikes are a coin-flip**, not the real `fishing/bites.js` (presentation, rig
   match, line visibility, nibbles). `maybe_bite` only checks species + water-kind match and
   a `behavior.curiosity`-scaled probability. The fight itself (tension, drag, jumps, line
   breaking) stays entirely client-side by design — the server only arbitrates *who* has a
   fish hooked and what happens to the fish id when the fight ends (kept/released/lost).
5. **Birds are a small synthetic roster** (`BIRD_SPECIES` in `server.py`: five made-up
   labels with plausible `shy_m` values), not the real bird JSON definitions or flight model
   in `birds/birds.js`. The *mechanics* the task asked for are real: `FEAR = 2`, the
   boat-speed-over-1.5 distance multiplier, flightless birds fleeing away from the player
   (our stand-in for "the far side"), and the `Fo.scare` hook (a spook scares fish within 8m).
6. `ENV.turb` (rain-runoff turbidity, used by `habitatScore`'s live-only turbidity penalty)
   and `springPull` (creek/river cooling near a spring) are both kept at a constant 0 — both
   need state this server doesn't track (land wetness; a real river network's spring sites).
7. Fish respawn at their fixed home point (matching the real game's "same id, same stats"
   guarantee), but a **caught-and-released** fish is left wherever it was released rather
   than filed back into a specific cell's list — functionally identical for this server
   (there's no cell-population cap to respect at runtime, unlike `CONFIG.cellMaxAnimals` at
   layout time), just noted for completeness.

## Biggest open questions

- **Does the client even want the server's fish positions as absolute truth**, given the
  terrain mismatch above? Probably not until a real terrain port exists — in the meantime a
  client could use the server for the *shared* parts that don't need matching terrain
  (claims, catches, fish_gone, chat, boats, bird spooks near players) and keep ambient fish
  fully client-local, which is close to the plan's "v1.5" middle step.
- **How much of `fish-behaviour.js`'s richer model (hunting, schooling, feeding, fleeing a
  specific threat) is worth porting once the terrain exists?** This server's `step_cruise`
  is deliberately minimal; the task brief invites that, but "keep it simple" and "grounded
  in fish-behaviour.js" are in some tension once real players start noticing fish don't
  school or flee a boat.
- **Claim/bite timing feel**: `maybe_bite`'s flat probability-per-tick isn't tuned against
  real play. The real `bites.js`/`fight.js` are explicitly still being tuned client-side
  (plan section 5: "waiting until the fishing mechanic is settled still stands"), so this
  will need revisiting together, not independently.
