# Performance Optimizations

Audit date: November 9, 2026

Goal: improve frame rate and reduce stutter while preserving the game's current visuals, animal populations, and gameplay behavior.

Implementation branch: `codex/performance-optimizations`.

Implemented: bounded incremental terrain sampling, indexed animal/tree meshes, zero-contribution shader guards, a bounded plant cache, spawn early-outs, and bird batching with independent tilt. The lure camera (item 5) was removed outright at the user's request instead of being rewritten. No draw distances, population settings, AI update intervals, or effect resolutions were reduced.

Validation and reproduction commands are in [tests/README.md](../tests/README.md). The original findings below remain as context. Measurements use isolated CPU workloads and a software-rendered browser; they do not predict FPS gains on a hardware GPU.

### Implementation results

- A cold terrain sample evaluates four lattice points instead of 4,225. Complete grids are still available to mesh builders; unfinished grids are bounded to 64 entries and can be completed by the existing yielding streamer.
- Terrain outputs match direct full-grid Float32 calculations, including negative coordinates and chunk boundaries. Interleaved sampling/building and eviction of a partially built grid are covered.
- Baseline checks match terrain, plant outputs, seasonal cover, and 4,925 animal records across 1,575 cell evaluations in three climates and three wildlife settings. Species load order matches the game.
- Exact vertex-stream reconstruction passes for 160 animal meshes and 10 tree meshes. Their combined vertex/index payload falls from 47,360,640 to 12,060,480 bytes (about 74.5%). This is mesh-buffer storage, not total application memory or an FPS percentage. Meshes with less than 5% storage savings keep their original layout.
- Index tests cover the 16-bit primitive-restart boundary; meshes needing index 65,535 use 32-bit indices.
- A synthetic 12-bird flock with two animation poses takes two draw calls, retaining individual roll and pitch.
- Frozen-scene browser comparisons check the original shaders and unindexed geometry against the new paths, including weather, underwater fish, birds, and cached batches. See the test output for pixel differences on the tested renderer.
- The full-grid fallback remains available to explicit `getChunk()` callers. The change specifically removes it from ordinary terrain sampling, including animal decisions; it does not eliminate startup island generation or all possible loading stalls.

## 1. Keep full terrain generation out of animal updates

**Priority: high — reduce frame-time spikes.**

When a fish samples uncached terrain, `getChunk()` synchronously generates an entire 65 × 65 lattice: 4,225 terrain points. This bypasses the terrain streamer's time budget. The CPU profile traced terrain generation through `fishSpot()` during an animal decision.

- Warmed animal-update workloads typically took approximately 0.5–0.6 ms per simulated frame.
- Cold workloads produced approximately 48–89 ms spikes.
- Individual uncached ocean-grid builds took approximately 11–13 ms.
- These were isolated simulation measurements, not end-to-end gameplay frame times.

Prepare upcoming grids through the budgeted streamer, or generate only the exact lattice points needed on a cache miss and complete the grid in the background. Preserve the original sampling calculations and Float32 storage so terrain heights, water boundaries, and animal decisions remain consistent. Avoid postponing decisions or spawns merely because terrain is unavailable.

Validate sampled results against the current implementation and measure frame-time spikes during movement, travel, long casts, and animal roaming.

Relevant code: [terrain cache](../src/js/world/island-cache.js), [terrain streaming](../src/js/engine/update.js), [animal decisions](../src/js/engine/fish-behaviour.js).

## 2. Use indexed meshes for animals and broadleaf trees

**Priority: high — reduce mesh storage, memory traffic, and repeated vertex processing.**

Many meshes store identical vertex records repeatedly and render with `drawArraysInstanced()`. Indexing identical records can preserve every triangle, normal, color, material, and animation input.

| Mesh | Existing vertex records | Unique vertex records | Estimated mesh-buffer reduction, including indices |
| --- | ---: | ---: | ---: |
| Rainbow trout | 8,076 | 1,577 | 75% |
| Oak | 3,330 | 1,075 | 63% |

The audit compared all vertex attributes using their exact Float32 bit representations. Many animal meshes had approximately 80% duplicate records; detailed oak, maple, and birch meshes had approximately 68% duplicates. Some meshes benefit little: the detailed pine would use slightly more storage after adding indices, so indexing should be selective.

Build indexed vertex/index buffers once and use `drawElementsInstanced()` where beneficial. Preserve triangle order and winding, material boundaries, normals, and animation attributes. Do not merge vertices based only on position.

Validate that expanding the indexed mesh reproduces the original vertex stream exactly, then compare rendered animations and measure GPU time. Buffer reductions do not imply equivalent FPS improvements.

Relevant code: [mesh builder](../src/js/models/mesh-builder.js), [tree meshes](../src/js/models/trees.js), [animal GPU meshes](../src/js/engine/fish-update.js), [instance batches](../src/js/engine/instance-batches.js), [rendering](../src/js/engine/render.js).

## 3. Skip shader work whose contribution is exactly zero

**Priority: medium to high — potential pixel-shading savings; GPU validation required.**

The water shader evaluates expensive noise gradients even where their distance-fade multiplier is zero. The lit shader evaluates snow noise even when snow cover is zero.

Guard these calculations when their contribution is exactly zero. Preserve the existing calculations wherever they contribute to the image; avoid approximate cutoffs, lower resolution, or reduced effects.

Compare fixed-camera images across distances, climates, weather, seasons, and underwater views. Measure actual GPU time because shader compilers and branching behavior can affect the benefit.

Relevant code: [water shader](../src/js/shaders/water.js), [lit shader](../src/js/shaders/lit.js).

## 4. Cache static plant information used by habitat and spawn queries

**Priority: medium — reduce repeated procedural calculations.**

`coverAt()` repeatedly calls `plantAt()` for deterministic grid positions. One isolated test repeated 2,245 of 3,258 plant queries. This was a secondary cost in the tested scene, not the dominant bottleneck.

Cache static plant placement and type by grid coordinate. Continue applying exact query distances and current seasonal growth/dormancy when evaluating cover. Bound cache memory and preserve the shared output state that callers rely on (`PL` and terrain-sampling outputs).

Validate habitat scores and seeded spawn records against the current implementation, including mixed-water cells, cover-dependent species, and seasonal changes.

An additional spawn candidate is skipping cover searches when a species has zero groups to spawn and stopping species processing once the cell cap prevents further groups. A temporary in-memory test produced identical records for 1,038 animals across 162 cells, but measured only a small timing difference (143.3 ms versus 140.3 ms over repeated runs). Treat this as a minor cleanup unless broader profiling shows otherwise.

Relevant code: [plant and cover queries](../src/js/world/water-plants-grid.js), [population generation](../src/js/world/fish-populations.js), [cell synchronization](../src/js/engine/fish-cells.js).

## 5. Lure-camera canvas copy — removed

**Resolved by removing the feature.** The inset rendered the whole scene a second time at 384 × 384 up to 30 Hz and copied it into a DOM canvas. Profiled in headless Chrome on an Intel UHD 620 (Vulkan), the copy added roughly 0.6 ms to a lure refresh that already cost about 1 ms of GPU-complete render time, so the second scene render dominated, and compositing the inset inside WebGL would have put it beneath the 2D overlay (vignette, line, minimap) and the HUD. The user chose to drop the feature: the inset, its rim controls, the `4` key, the `lureCam` fill light in the lit shader and the `camera` parameter of `Engine.render()` are gone. Saved key bindings that still name `lureCam` are ignored on load.

## 6. Batch bird rendering

**Priority: lower — likely more useful with larger flocks.**

Birds currently upload instance data and draw individually. Grouping by species and animation frame could reduce uploads and draw calls. Individual roll is currently a uniform, so batching requires preserving each bird's tilt through per-instance data or another equivalent arrangement.

The sampled scene had only four birds, so this was not a major cost there. Validate flight, swimming, perching, and moving-boat poses, and benchmark larger flocks before prioritizing it.

Relevant code: [bird rendering](../src/js/birds/birds.js), [lit vertex shader](../src/js/shaders/lit.js).

## Existing optimizations to preserve

- Instanced vegetation and fish rendering.
- Cached vegetation batches when visible sets remain unchanged.
- Spatial queries for nearby fish.
- Distance-based animal update intervals, with faster updates near interactions.
- Budgeted terrain streaming and cached map tiles.

Start with terrain-generation stalls and indexed meshes, then profile shader changes on a hardware GPU. Keep animal counts, spawn distributions, AI timing, draw distances, resolution, and visible effects unchanged. Validate each change independently so its benefit and any regressions are clear.
