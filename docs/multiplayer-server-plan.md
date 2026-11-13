# Open Waters multiplayer server plan (grounded in the code)

Updated Nov 13, 2026 by Claude Code. This replaces the earlier draft, which was written without repo access.

**Source read:** the local copy of the public repo `gr-ant/OpenWaters` (main, commit `4864601774937ddb8e597358b27c7c7132509a0a`) at `hidden_files/openwaters-repo`. Nothing was cloned or fetched by Claude Code, the zip was downloaded by Nikki via curl because direct git clone fails on TLS from this box. No game code was changed, nothing was committed, and no hosting was set up. The game and its tests were not run; everything below comes from reading the code.

**Companion doc:** `multiplayer-charter-v1-plan.md` (the idea and Grant's decisions). This file covers how it would actually plug into the code.

---

## 0. Short version

- **The shared map seed already works.** Islands are fully generated from one 32-bit `SEED`, and the start menu already has an "island number" box. A charter only has to share **seed + climate** and reload into it. The old draft's "main open question" is answered: yes.
- **There is already an event bus to hook into.** `Game.on(...)` in `src/js/game-api.js` already fires `cast`, `bite`, `hooked`, `lost`, `landed`, `catch`, `boardBoat`, `leaveBoat`, `update` and more. A WebSocket client can be one new file that uses only `Game.on` / `Game.player` / `Game.boat`, plus a few small engine tweaks so remote boats display properly.
- **Fish are not random per player, which corrects the charter doc.** Each 16 m water cell's fish come from the seed and get stable IDs (`fishPopulations.cellFish`). Two players on the same seed, with the same Wildlife setting, start with the *same* fish in the same cells. What differs is how they move afterwards (`Math.random` in their behaviour) and which ones each player has caught (stored locally). That makes a cheap middle step possible (section 5, "v1.5"), and makes v2 smaller than the old draft assumed.
- **Correction to "no rebuild":** any join box or networking means editing `src/` and running `python3 build.py`, which produces a new `Open Waters.html`. The change can be additive, and solo play is untouched when there's no room code. But the single file *does* change.
- **Fish count:** the repo has **182** species files. **128** of them are true fish (including 2 rays), and **133** are catchable (those fish plus 5 squid/octopus/cuttlefish). The README's "119 fish species" is out of date. The itch page's "over 160" matches the 182 total creature files (which includes 13 mammals, 13 reptiles/amphibians, 16 shellfish and 7 jellies) rather than fish alone.

---

## 1. How the game is built and loaded

| Piece | What the code does |
|---|---|
| `build.py` | Reads `src/index.html` line by line and inlines every `<script src>` and `<link rel="stylesheet">` in order, writing `Open Waters.html`. It refuses files containing `</script>`, and warns about `src/` files that aren't listed. Needs only Python 3. |
| `src/index.html` | Markup, then 182 `<script type="application/json" data-builtin="fish">` data blocks plus boats, tackle and so on, then the code scripts in load order (lines ~193-287). Everything shares **one global scope**, so order matters. |
| Load order (abridged) | `config.js` → `controls.js` → **`world/worldgen.js`** (computes `SEED`, `CLIMATE`, the noise) → `world/island-layout.js` … `island-sample.js` … `island-cache.js` → shaders/models → `creatures/*.js` → `world/seasons-weather.js`, `water-temp.js`, `water-plants-grid.js`, **`habitat.js`**, **`fish-populations.js`** → boats → `engine/engine.js` and the `engine/*.js` mixins (`fish-cells`, `fish-behaviour`, `boats`, `on-board`, `fish-update`, `projection-travel`, **`update`**, …, `render`, **`third-person`**, `map`) → `tackle.js` → **`fishing/casting.js`, `bites.js`, `fight.js`** … → **`game-api.js`** → `hud/*` → `birds/*` → **`game.js`** → `fishing/nets-traps.js`, `rod-holder.js`, `two-rods.js` → `hud/tutorial.js` → `urchin.js` (module) → `hands.js` → **`boot.js`** (last). |
| `src/js/boot.js` | On `DOMContentLoaded`: `sketchIsland()` draws the loading screen. Then `readBuiltins()` parses the JSON blocks, registers fish/boats/tackle/birds (plus any species imported into this browser via `FishDB.saved()`), then calls `Engine.init()` and `Game.emit('ready')`. After that the `frame()` loop calls `Engine.update(ts)` (up to 3 substeps of ≤50 ms) and then `Engine.render()` every animation frame. |
| `src/js/game-api.js` | The public `Game` object: an event bus (`on`/`emit`), `player`, `boat`, `angler`, `fish`, `fishNear`, `removeFish`, `teleport`, `onHud`, `onMap`, `project`, `say`, `catches`, `conditions`, `setWeather`, `setSeason`, `hour`. |
| `electron/` | `main.js` opens one `BrowserWindow` (`contextIsolation: true, sandbox: true`, no preload) and calls `win.loadFile('game/index.html')`. `npm run game` copies `../Open Waters.html` to `game/index.html`. Navigation away from `file:` is blocked and links go to the system browser. **There is no Content-Security-Policy** in `main.js` or `index.html`. Desktop releases are built by GitHub Actions when `main` is pushed to the `desktop` branch. |

**Where a WebSocket client goes:** a new file, e.g. `src/js/charter.js`, listed in `src/index.html` **after `game.js` and before `boot.js`** (next to `two-rods.js`). At that point `Game`, `Engine`, `SEED`, `CLIMATE`, `ENV` and `BoatDB` all exist, and it can subscribe to `Game.on('ready')` before boot fires it. It uses the browser's built-in `WebSocket` only, so the game stays dependency-free. A small `#charter` panel in the title screen markup (`#title` in `index.html`, wired up in `game.js` next to the existing `tiSeed` box), plus a CSS file, completes the client.

---

## 2. What is local-only today

Every one of these lives in one browser and nothing is shared:

| State | Where | Matters for charter? |
|---|---|---|
| `SEED` | `worldgen.js` line 10: `?seed=` query, or `#seed-N` in the hash (only honoured with `&pick`, `&go` or `&map`; a plain load opens the title on a **random** seed). It is a top-level `const`, so changing it means **reloading the page**. | Yes: must match |
| `CLIMATE` | `worldgen.js`: comes from the seed, *unless* `#climate-…` overrides it. The title's "New island → Arctic/Tropical/Temperate" uses a random seed **plus** a forced climate, so **the seed alone does not always reproduce the island**. | Yes: must match |
| Island geometry, water, names, start spot | All deterministic from `SEED` via `mulberry32` and `makeNoise` (`island-layout.js` `LAYOUT`, `island-water.js` `buildIsland`, `island-sample.js`, `island-features.js`, `island-glaciers.js`). `Engine.init()` puts you at `findWater(LAKE, 0, 0, …)`, so every player on a seed spawns at the same lake. | Already shared once seed and climate match |
| Time of day `Engine.tod`, season `ENV.yf` | Start at `CONFIG.startHour` and advance locally. The T key speeds time up, the Y key changes season (`game.js`). | Should sync at join (`ENV.setDate`). Lock T and Y in a charter. |
| Weather `ENV.kind` | Seeded per 5-game-hour block from `SEED` (`seasons-weather.js` line 63), so it matches if clocks match. The U key forces it locally. | Sync at join. Lock U. |
| Player `Engine.P` `{x,y,z,vz,a,pitch}` | `engine.js` line 3; moved in `Engine.update()` (`update.js`: on foot / swimming, lines 70-112) | v1 sync |
| Boats `Engine.boats[]`, `Engine.boat` | `engine/boats.js`: `addBoat` (local id `boat#N`, **max 8, oldest evicted**), `boatStep` (driving), `autoBoat`/`moorBoat` (a boat waits at each water); `on-board.js`: `boatDeckStep`, `updateIdleBoats` (drifts **every boat that isn't yours**) | v1 sync (see changes below) |
| Angler `Engine.ang` (phase `stowed/ready/charge/flight/water/bite/fight/card`, lure x/y) | `fishing/casting.js` `castLure()`, `bites.js`, `fight.js` | v1 sync of cast/phase |
| Fish sim `Engine.fish`, `Engine.fishCells` | `engine/fish-cells.js` `syncFishCells()` every 0.4 s, within 72 m of you (and 40 m round a far lure); up to `CONFIG.maxFish` 1200 (600 on touch); `engine/fish-behaviour.js` `fishStep`; `engine/fish-update.js` `updateFish` (8-60 Hz by distance) | v2 |
| Caught-fish list | `fish-cells.js` `removeFish` → localStorage `engine-fishgone-<saveName>-<SEED>`, gone for `CONFIG.fishRespawnMinutes` (30) | v1.5 |
| Catch log | localStorage `embercrown-catches` (last 500), via `fight.js` `logCatch()` | Stays personal |
| Inventory, save, boats left about | localStorage `engine-save-<saveName>-<SEED>`, `inventory-save.js` `saveGame()` / `stateNow()` | Stays personal; exclude remote boats |
| Wildlife level | `CONFIG.wildlife` 1/2/3, saved in localStorage `embercrown-wildlife` (`controls-menu.js`). It scales `cellFish` counts. | Must match for v1.5/v2 |
| Imported species / tackle | `FishDB.saved()`, `TackleDB.saved()` | Can change populations; flag or ignore |
| Admin spawns | Key 1 → `openSpawn` / `Engine.spawnAnimal` (ids `spawn#N`) | Local only; ignore |
| Birds, particles, ripples | `birds/birds.js`, `messages-particles.js` | Cosmetic; leave local |

---

## 3. Change (1): shared map seed

What exists: `game.js` already has the title's island-number box `#tiSeed`, which reloads to `#seed-N[&climate-C]&pick`. `?seed=N` also works on any load (`params.get('seed')` wins over the hash), but the code notes that on hosts like itch, query strings may not pass through, so **use the hash**.

To add:
1. **Create charter** (title panel): send `{t:'create', seed: SEED, climate: CLIMATE.key}`. The server returns a room code. The host stays on their current island.
2. **Join**: send `{t:'join', code}` and get back `{seed, climate, tod, yf, weather}`. If `SEED !== seed || CLIMATE.key !== climate`, reload to `#seed-<seed>&climate-<climate>&pick&room-<CODE>`. On the next load, `charter.js` reads `room-` from `location.hash`, reconnects, and then calls `ENV.setDate(yf, tod*24)` and `ENV.setWeather(weather)` (both already used by `Engine.init()` for Continue).
3. **Keep the room through reloads.** `HASH_OPTS` (`worldgen.js` line 11) only keeps `climate|season|weather`. `resumeReload()` (after a lost graphics context), the pause menu's "Main menu", and the map's new-island button all rebuild the hash from `SEED + HASH_OPTS`, so `&room-…` would be **dropped**. Either add `room` to that regex (one-line change) or keep the code in `sessionStorage`.
4. Optional **"Go to crew" button**: `Game.teleport(x, y)` (`Engine.travel`) next to the host's last position, because everyone spawns at the first lake, not out at sea.
5. Keep the Wildlife setting the same for everyone (send it at join and set `CONFIG.wildlife`), so v1.5's fish IDs line up.

No seeded RNG work is needed. That is already done.

---

## 4. Change (2): v1 sync: boat position, cast, catch, chat at 2/sec

### Client hooks (all in the new `charter.js`)

| Message | Hook | Payload (about 60-120 bytes JSON) |
|---|---|---|
| `state` every 500 ms | `Game.on('update', dt)`: add up `dt`, send when ≥ 0.5 (one constant, so 250 ms is a one-line change) | `{x,y,a}` from `Game.player`; if `Game.boat`: `{boatId: def.id, bx, by, ba, v}`; `Engine.boatMode`; `Game.angler.phase`; lure `{x,y}` when `ang.out && ang.lure` |
| `cast` (at once) | `Game.on('cast', ({distance, rig}))` (`casting.js` `castLure` line 209; drop-cast at line 324) | `{distance, rig: rig.name}` |
| `hooked` / `lost` (at once, optional) | `Game.on('hooked', f)` (`fight.js` line 10), `Game.on('lost', (f, why))` (line 101) | `{species: f.species, cm}` / `{why}` |
| `catch` (at once) | `Game.on('catch', (rec, f))`, fired in `fight.js` `logCatch()` once a fish is kept or released (also by `nets-traps.js` with `f = null`) | `rec` is already `{species, name, cm, kg, kept, water, climate, seed}`; add `fishId: f && f.id` for v1.5 |
| `board` / `leave` | `Game.on('boardBoat', b)`, `Game.on('leaveBoat', b)` (`engine/boats.js`) | `{boatId}` |
| `chat` | New input box; must stop keys reaching `Engine.keyPress` while typing | `{text}` (cap length, plain text only) |

### Showing other players

- **Remote boats:** create proxy boats `{def: BoatDB.byId[boatId], id: 'peer:'+peerId, remote: true, x, y, a, …}` in `Engine.boats`. The renderer (`render.js` lines ~151 and 225) then draws them with hull, swell and rocking for free. **Engine changes needed** (a few lines each):
  - `on-board.js` `updateIdleBoats`: skip `b.remote`, or they drift on the current away from their real spot.
  - `engine/boats.js` `addBoat`: don't let remote boats count toward or get evicted by the 8-boat cap.
  - `inventory-save.js` `stateNow`: exclude `remote` boats from the save.
  - `boatHits` / `boatBlocks` (`on-board.js`): decide whether peers' hulls are solid. Probably yes, so you bump rather than pass through.
- **Smoothing:** at 2 updates/sec a boat at speed jumps several metres per update. Render peers about 500 ms behind and interpolate between the last two snapshots, extrapolating with `v` and `a` if one is late. Without this, 2/sec looks jerky. This matters more to the "feel" choice than 2/sec vs 4/sec does.
- **Anglers on foot:** `third-person.js` `drawHuman` only draws *you* (it reads `Engine.hPose` and `Engine.P`). v1 should show a name tag and a dot via `Game.onHud` + `Game.project(x, y, z)`, and map dots via `Game.onMap`. A full remote human model means making `humanStep`/`drawHuman` work for any player: v1.5 or later.
- **Lure:** a small marker at the peer's lure x/y via `Game.onHud`. Drawing their actual line is later.
- **Casts/catches/chat:** `Game.say(...)` toasts ("Sam landed a 62 cm striped bass"), plus a short scrolling chat log.

### What v1 does NOT share
Fish movement, fights, inventory, catch logs, birds. Each player's fight is entirely local.

### Bandwidth
One `state` message is roughly 100 bytes. With 6 players at 2/sec, each client receives about 10 msgs/sec, around 1 KB/s. At 4/sec it's about 2 KB/s. Either way it's trivial for a tiny server, so the update rate is a feel choice, not a cost choice. That confirms the charter doc.

### Server (v1)
A Node relay, about 150-250 lines: rooms in a `Map`, `create`/`join`/`state`/`cast`/`catch`/`chat`/`ping`, relaying to the rest of the room, plus throttling and a size cap per message. **Correction:** the *browser* side uses the built-in `WebSocket` with no libraries, but Node has no built-in WebSocket *server*, so the server would use the small `ws` package (one dependency). Room info returned at join: `{seed, climate, wildlife, tod, yf, weather, peers}`, taken from the creator and refreshed from the host's `state`.

---

## 5. Change (3): fish (v1.5, then v2)

### What the code already gives us
`world/fish-populations.js` `cellFish(cx, cy)`: each 16 m cell's population is drawn from `mulberry32(hash2(cx, cy, SEED + 911))`, and each species from its own stream. Fish get **stable IDs** like `striped_bass@12,-40.0#1.3`, with fixed home spot, length and weight. `engine/fish-cells.js` `syncFishCells()` builds cells around you (and your lure), filters out `isGone(id)`, and `makeFish()` turns them into live fish. After that, motion is local: `fish-behaviour.js` `fishStep` and `fish-update.js` use `Math.random` (also follower offsets in `syncFishCells` and predator strikes in `fishStrike`), and the simulation detail depends on your distance.

So the charter doc's "two players in the same spot see different fish" is **half right**. They see the same fish (species, size, home) but in different places after a while. And if one player keeps a fish, it's still swimming in the other player's water.

### v1.5: shared "that fish is gone" (small, recommended before v2)
- On `catch` with `rec.kept` (the fish went into the creel via `fight.js` `creelFish` → `removeFish`), send `{t:'fishGone', id: f.id}`. Peers mark it in `Engine.fishGone` (the same localStorage store that `removeFish` writes, whose ids it skips when filling cells) and drop the live copy from `Engine.fish` / `Engine.fishCells`. `nets-traps.js` already does this kind of removal by id (`Engine.removeFish({ id })`), so the pattern exists.
- On `hooked`, send `{t:'claim', id}`. The server grants the first claim per id. If a second player hooks the same fish at the same moment, they get `taken` and the fish "throws the hook" (`lost` with `'thrown'`). Release (`releaseFish`) sends `unclaim`.
- The server keeps only a per-room `Map(id → expiry)`, matching `CONFIG.fishRespawnMinutes` (30 min). That's a few dozen lines of server code.
- Requires the same seed, climate and Wildlife setting. Imported custom species can add groups and change the 60-per-cell cap (`CONFIG.cellMaxAnimals`), so ignore ids that aren't found locally.

### v2: server-owned fish positions
To have everyone see the *same fish in the same place*, something has to own each fish's movement:
- **Option A: server simulates.** The server would need `sample()` terrain, water kinds and flow, `habitatScore`, `waterTemp`, `FishDB` and `fishStep`. That is most of `src/js/world/*`, `creatures/*` and `engine/fish-*.js`, which are browser-global scripts that read `location`, `history`, `CONFIG` and `Engine`. It's possible with shims in Node, but it's the biggest job, and the island has to be built per room in memory.
- **Option B: a player owns each cell (recommended).** The first player to load a cell owns its fish and sends `{id, x, y, z, a, state}` for fish **near any lure or hooked** at 2-4/sec. Everyone else's copies of those fish follow those updates. When the owner leaves, ownership passes on. This reuses the game's own fish code unchanged and keeps the server a relay with an ownership table.
- Bandwidth: never sync all ~1200 simulated fish. Only sync fish within ~12 m of a lure (the same radius `updateFish` already uses for full-rate simulation) and fish on a line.
- Still about 2-4 times the work of v1, as the old draft said. Waiting until the fishing mechanic is settled still stands, because `bites.js` and `fight.js` are exactly what's being tuned.

---

## 6. Hosting (kept from the previous draft; prices not re-checked)

- **Game itself:** Cloudflare Pages, free, optionally on a custom domain. itch.io stays as is. Note: itch runs the game inside an iframe, so join links should use the `#…` hash, as the code already does for seeds.
- **Sync server**, rough prices **to check before choosing** (not verified in this pass, and the two docs disagree slightly):
  - Fly.io: about $2-5 a month
  - Railway: about $5 a month
  - Render: free but sleeps when idle (the first join after idle is slow), or about $7 always-on
- Charter doc summary: $5-7 a month for always-on. This is still new spend against Grant's Nov 7 "no extra spend" position, and that decision is unchanged.

## 7. Auth (kept, one correction)

- The room code alone is enough for v1. Make it long (e.g. 6-8 characters, no lookalike letters), let the server expire empty rooms, and rate-limit `join`.
- Cloudflare Access stays optional. It protects the game site, but not a server on another host without extra setup (unchanged).
- Solo play needs no login, and with no room code, `charter.js` does nothing.
- **Correction (server side):** check the `Origin` header but allow the desktop build. Electron loads `file://`, so its WebSocket Origin is `file://` (or `null`). An allowlist of only the Pages domain and itch would lock out the desktop app.

## 8. Electron (corrected)

- The old draft guessed a content-security rule would need changing. **There is no CSP** in `electron/main.js` or `src/index.html`, so a `wss://` connection from the `file://` page should just work. The `will-navigate` block only stops page navigation, not WebSockets.
- `main.js` doesn't need to change. But the desktop app copies the *built* `Open Waters.html`, so the next push to the `desktop` branch would ship the charter code to desktop users too. "Electron untouched" means `main.js` untouched, not "desktop has no multiplayer". Decide whether that's wanted, or keep the charter panel hidden unless a flag is set.

---

## 9. First steps (if Grant says go)

1. Write the Node relay (`ws`) and run it locally. No hosting needed to start.
2. Add `src/js/charter.js` + the title panel. Do the seed/climate/time join first (section 3), and test with two browser tabs on one machine.
3. Add the 2/sec `state` + `cast`/`catch`/`chat` messages, then remote boat proxies with interpolation (section 4), including the 3-4 small engine tweaks.
4. Try it with 2-3 friends on Render's free tier (accepting the sleep delay) before paying for always-on.
5. Then v1.5 shared "fish gone" + hook claims. v2 fish positions only after the fishing mechanic is settled.

## 10. Risks / open questions

- **Clock drift:** time of day and season tick locally (and the T/Y/U keys change them). Bite rates depend on hour and season, so periodic re-sync from the host is needed, and those keys should be disabled in a charter.
- **Reloads drop the room** unless `room-` is added to `HASH_OPTS` or kept in sessionStorage (section 3).
- **Chat typing vs game keys:** `Engine.keyPress` gets every key; the chat box must stop them reaching it.
- **Players per room:** the 2/sec relay is cheap well past 6. The limit is likely the `Game.onHud` labels and boat proxies, not bandwidth. Suggest 8 max for v1.
- **Host leaves:** promote the next peer to supply time/weather. The seed and climate are already fixed in the room.
- **Fish count wording** for the itch page and README: "128 fish species (133 catchable, 182 creatures in all)" would be accurate as of this commit.
- Nothing here was run. The interpolation needs and the itch iframe behaviour should be confirmed in a two-tab test before friends try it.
