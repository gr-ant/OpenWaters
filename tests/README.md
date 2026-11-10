# Performance regression checks

Run from the repository root with Node.js 22 or newer and Python 3. There are no package dependencies.

```sh
node tests/performance.mjs
python3 build.py
```

The CPU checks compare terrain sampling with direct full-grid Float32 calculations, interleave sampling and mesh generation, exercise bounded-cache eviction, and compare plant/cover/spawn records with fixtures from commit `89d60b1` (rivers past ponds keep their own level). They use seed 42 in all three climates and the game's species load order. Mesh checks reconstruct the original vertex stream bit for bit and cover the 16-bit index restart boundary.

To deliberately regenerate fixtures from a reviewed baseline revision:

```sh
node tests/performance.mjs <baseline-revision>
```

Do not regenerate fixtures simply to make a failing comparison pass. Intentional species or world-generation changes may require a new baseline.

## Boat checks

`node tests/boats.mjs` loads the boat definitions and the on-board engine code in Node and checks the oar / paddle stroke (blade in the water on the drive, sweeping aft), the hull heeling toward your weight and settling, and hulls being solid to swimmers and to other boats.

`node tests/rowing-hands.mjs` rows and paddles every built-in boat that has oars or a paddle, in third person, and checks each hand stays on its grip all the way through the stroke; and at every wheel, the left hand stays on the rim as it turns and the right on the throttle lever; with the boat level, pitched and heeled.

`node tests/human-model.mjs` checks the third-person angler (src/js/models/human.js): every part builds with finite vertices, standing it is 1.7–1.8 m tall with its feet at z = 0, and the stride, swim, seated and rod-holding poses stay sane.

## Browser image comparisons

Start an isolated headless Chrome instance in a separate terminal:

```sh
google-chrome --headless --no-sandbox --disable-dev-shm-usage \
  --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --remote-debugging-port=9337 --user-data-dir=/tmp/openwaters-performance-browser about:blank
```

Then run:

```sh
python3 build.py
node tests/performance-browser.mjs
```

The test creates a fresh browser tab, fixes the random stream, and suppresses the normal animation loop. It skips menu-thumbnail precomputation and map prefetch to focus on scene rendering. It compares the new shaders/indexed meshes/bird batches with the shaders and unindexed meshes of the commit the branch was cut from (`7214cd2`) in the same frozen scene. It also checks stale animal-mesh replacement, cached batch reuse, GL errors, and a 12-bird/two-pose draw count. Test tabs remain open for inspection; close the dedicated Chrome process when finished.

The image assertions permit at most one channel-value step and less than 0.01 mean channel difference to accommodate shader arithmetic differences. Output reports the actual differences. Set `PERFORMANCE_BASELINE=<revision>` to compare against another shader/bird-rendering baseline after intentional visual changes.

Software rendering verifies this renderer's output, not hardware GPU speed or every possible scene. Compare on target hardware before claiming an FPS improvement.

## CPU microbenchmarks

Run these sequentially without another benchmark competing for CPU time:

```sh
node tests/performance-benchmark.mjs 64405b7d43decedafa461ed925ead3e522892a23
node tests/performance-benchmark.mjs
```

These measure cold ocean sampling and repeated plant queries. They exclude rendering and are not end-to-end game frame times. Timing varies with JIT compilation, garbage collection, hardware, and other processes; the regression tests separately verify the reduction in terrain work and output equivalence.
