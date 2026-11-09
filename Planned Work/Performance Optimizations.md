# Performance Optimizations

Audit date: November 9, 2026

Goal: improve frame rate and reduce stutter while preserving the game's current visuals, animal populations, and gameplay behavior.

These are proposed changes, not implemented optimizations. Measurements came from code inspection and isolated browser workloads using software rendering. They identify opportunities but do not predict FPS gains on a hardware GPU.

## 1. Keep full terrain generation out of animal updates

**Priority: high — reduce frame-time spikes.**

When a fish samples uncached terrain, `getChunk()` synchronously generates an entire 65 × 65 lattice: 4,225 terrain points. This bypasses the terrain streamer's time budget. The CPU profile traced terrain generation through `fishSpot()` during an animal decision.

- Warmed animal-update workloads typically took approximately 0.5–0.6 ms per simulated frame.
- Cold workloads produced approximately 48–89 ms spikes.
- Individual uncached ocean-grid builds took approximately 11–13 ms.
- These were isolated simulation measurements, not end-to-end gameplay frame times.

Prepare upcoming grids through the budgeted streamer, or generate only the exact lattice points needed on a cache miss and complete the grid in the background. Preserve the original sampling calculations and Float32 storage so terrain heights, water boundaries, and animal decisions remain consistent. Avoid postponing decisions or spawns merely because terrain is unavailable.

Validate sampled results against the current implementation and measure frame-time spikes during movement, travel, long casts, and animal roaming.

Relevant code: [terrain cache](../src/js/world/island.js), [terrain streaming](../src/js/engine/update.js), [animal decisions](../src/js/engine/fish-behaviour.js).

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

## 5. Investigate the lure-camera canvas copy

**Priority: conditional — relevant when the lure camera is enabled.**

The lure camera renders a second scene into the main WebGL canvas, then copies it into a 2D canvas at up to 30 Hz. Rendering into a texture and compositing within WebGL could avoid that cross-canvas copy.

Preserve the inset's resolution, refresh rate, framing, lighting, controls, and placement. This would remove a potential transfer cost; it would not eliminate the second scene render. Profile the copy first to establish whether it is significant on target hardware.

Relevant code: [lure camera](../src/js/fishing/lure-camera.js), [rendering](../src/js/engine/render.js).

## 6. Batch bird rendering

**Priority: lower — likely more useful with larger flocks.**

Birds currently upload instance data and draw individually. Grouping by species and animation frame could reduce uploads and draw calls. Individual roll is currently a uniform, so batching requires preserving each bird's tilt through per-instance data or another equivalent arrangement.

The sampled scene had only four birds, so this was not a major cost there. Validate flight, swimming, perching, and moving-boat poses, and benchmark larger flocks before prioritizing it.

Relevant code: [bird rendering](../src/js/birds.js), [lit vertex shader](../src/js/shaders/lit.js).

## Existing optimizations to preserve

- Instanced vegetation and fish rendering.
- Cached vegetation batches when visible sets remain unchanged.
- Spatial queries for nearby fish.
- Distance-based animal update intervals, with faster updates near interactions.
- Budgeted terrain streaming and cached map tiles.

Start with terrain-generation stalls and indexed meshes, then profile shader changes on a hardware GPU. Keep animal counts, spawn distributions, AI timing, draw distances, resolution, and visible effects unchanged. Validate each change independently so its benefit and any regressions are clear.
