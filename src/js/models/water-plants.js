'use strict';
// Water plants, stones, coral and icebergs: PLANT_DRAW draw table and waterMeshes().
// how each water plant is drawn: [mesh, instance stride (bytes), wind sway, view distance (m)]
const CULL_SIDE = 1028; // gl.FRONT: the view is mirrored (to match the north-up map), so outward faces wind clockwise on screen
const PLANT_DRAW = [['reed', 24, 1.6, 260], ['lily', 24, 0, 280], ['lilyF', 24, 0, 280], ['weed', 32, 2.4, 170], ['kelp', 32, 1.2, 220], ['rock', 32, 0, 340], ['log', 32, 0, 320], ['stump', 32, 0, 300], ['coralA', 32, 0, 150], ['coralB', 32, 0, 150], ['anemone', 32, 1.4, 110], ['berg', 32, 0, 1300],
  ['seafan', 32, 1.0, 120], ['sponge', 32, 0, 130], ['coralC', 32, 0, 150], ['urchin', 32, 0, 90], ['star', 32, 0, 90], ['eelgrass', 32, 2.0, 160], ['bullkelp', 32, 1.0, 260], ['rockweed', 32, 0.5, 120], ['slab', 32, 0, 300], ['rubble', 32, 0, 200], ['shells', 32, 0, 80],
  // land cover (Engine.groundGen, CONFIG.groundCover): 6 floats [x, y, z, scale, rot, shade], made per chunk near the player and drawn per 16 m tile, thinned with distance
  ['grass', 24, 2.0, 60], ['flowerA', 24, 1.8, 55], ['flowerB', 24, 1.8, 55], ['fern', 24, 0.8, 85], ['heath', 24, 0, 75], ['moss', 24, 0, 55], ['bush', 24, 0.3, 150]];
const GROUND_KINDS = ['grass', 'flowerA', 'flowerB', 'fern', 'bush', 'heath', 'moss'], GROUND_SET = new Set(GROUND_KINDS), GROUND_TILE = 16;   // never seen by coverAt (fish cover is plantAt only)
// Water plants and stones (model units ~1 tall, scaled per instance)
function waterMeshes() {
  const L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // reeds: a clump of thin leaning blades with a few cattails
  const reed = meshBuilder();
  for (let k = 0; k < 10; k++) {
    const a = k * 2.4, r = 0.025 + 0.035 * hash2(k, 1, 31), group = k % 3 * 2.4, bx = Math.cos(group) * 0.09 + Math.cos(a) * r, by = Math.sin(group) * 0.09 + Math.sin(a) * r;
    const lean = 0.08 + 0.14 * hash2(k, 2, 31), la = 0.8 + (hash2(k, 3, 31) - 0.5) * 1.7, top = 0.7 + 0.32 * hash2(k, 4, 31), g = 0.8 + 0.35 * hash2(k, 5, 31);
    reed.mat = MT.LEAF; reed.tube([bx, by, -0.05], [bx + Math.cos(la) * lean, by + Math.sin(la) * lean, top], 0.016, 0.002, 3, [0.3 * g, 0.47 * g, 0.17 * g]);
  }
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.5, b = [Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.05], tp = [b[0] + Math.cos(a) * 0.07, b[1] + Math.sin(a) * 0.07, 1.0 + 0.1 * k];
    reed.mat = MT.LEAF; reed.tube(b, tp, 0.008, 0.005, 3, [0.36, 0.44, 0.2]);
    reed.mat = MT.CLOTH; reed.tube(L(b, tp, 0.8), L(b, tp, 0.9), 0.016, 0.015, 6, [0.34, 0.2, 0.11], true);
  }
  // lily pads: notched discs floating flat, one version with a flower
  const pad = (B, cx, cy, r, notch, col) => {
    const n = 14, edge = k => {
      const a = notch + 0.25 + k / n * 5.78, rr = r * (0.97 + 0.035 * Math.sin(a * 5 + notch));
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.87, 0.012 * Math.sin(k / n * Math.PI)];
    };
    for (let k = 0; k < n; k++) {
      const start = B.v.length;
      B.tri([cx, cy, 0], edge(k), edge(k + 1), col, [cx, cy, -1]);
      for (let v = start; v < B.v.length; v += VS) {
        const rim = Math.hypot(B.v[v] - cx, B.v[v + 1] - cy) / r;
        B.v[v + 6] *= 0.76 + 0.30 * rim; B.v[v + 7] *= 0.82 + 0.18 * rim;
      }
    }
  };
  const pads = B => { B.mat = MT.LEAF; pad(B, 0, 0, 0.5, 0, [0.17, 0.4, 0.13]); pad(B, 0.66, 0.38, 0.3, 2.2, [0.2, 0.45, 0.15]); pad(B, -0.5, 0.55, 0.24, 4.1, [0.15, 0.37, 0.13]); pad(B, 0.2, -0.7, 0.2, 1.1, [0.22, 0.42, 0.16]); };
  const lily = meshBuilder(); pads(lily);
  const lilyF = meshBuilder(); pads(lilyF); lilyF.mat = MT.CLOTH;
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * 6.2832 + (k % 2) * 0.3, rr = k % 2 ? 0.13 : 0.18, tip = [0.66 + Math.cos(a) * rr, 0.38 + Math.sin(a) * rr, k % 2 ? 0.16 : 0.1];
    lilyF.tri([0.66, 0.38, 0.03], [0.66 + Math.cos(a + 0.4) * 0.06, 0.38 + Math.sin(a + 0.4) * 0.06, 0.05], tip, [1.0, 0.8, 0.88], [0.66, 0.38, -0.5]);
    lilyF.tri([0.66, 0.38, 0.03], [0.66 + Math.cos(a - 0.4) * 0.06, 0.38 + Math.sin(a - 0.4) * 0.06, 0.05], tip, [1.0, 0.86, 0.92], [0.66, 0.38, -0.5]);
  }
  lilyF.blob([0.66, 0.38, 0.07], 0.04, 0.04, 0.03, 3, 6, [1.3, 1.05, 0.3]);
  // weed beds: wavy ribbons; kelp is taller, browner and leafier
  const ribbons = (n, wid, col, seed) => {
    const B = meshBuilder(); B.mat = MT.LEAF;
    for (let k = 0; k < n; k++) {
      const a = k * 1.9, r = 0.05 + 0.12 * hash2(k, 7, seed), top = 0.55 + 0.45 * hash2(k, 8, seed), g = 0.75 + 0.45 * hash2(k, 9, seed);
      let px = Math.cos(a) * r, py = Math.sin(a) * r, z = -0.05;
      for (let s = 0; s < 6; s++) {
        const t = (s + 1) / 6, z1 = t * top, bend = t * t * (0.18 + 0.1 * hash2(k, 3, seed)), nx = Math.cos(a) * r + bend + Math.sin(t * 5 + k) * 0.025 * t, ny = Math.sin(a) * r + bend * 0.4 + Math.cos(t * 5 + k) * 0.025 * t;
        B.tube([px, py, z], [nx, ny, z1], wid * (1 - s / 7), wid * (1 - (s + 1) / 7), 3, [col[0] * g, col[1] * g, col[2] * g]);
        px = nx; py = ny; z = z1;
      }
    }
    return B;
  };
  const weed = ribbons(7, 0.022, [0.12, 0.36, 0.12], 41), kelp = ribbons(5, 0.045, [0.34, 0.31, 0.1], 43);
  // boulder
  const rock = meshBuilder(); rock.mat = MT.ROCK;
  // A clipped, sheared block: broad fracture planes, not independent bumps
  // on every vertex. Same 64 triangles as the old ellipsoid.
  const rockRings = [[0.72, 0.22], [0.61, 0.77], [0.39, 1], [0.12, 0.92], [-0.10, 0.62], [-0.14, 0.12]];
  const rockPoint = (i, j) => {
    const [z, r] = rockRings[i], a = (j % 8) / 8 * Math.PI * 2 + 0.16;
    const edge = 0.94 + 0.1 * Math.cos(a * 3);
    return [Math.cos(a) * r * 0.6 * edge + z * 0.16, Math.sin(a) * r * 0.5 * edge, z + 0.045 * Math.cos(a) * r];
  };
  for (let i = 0; i < 5; i++) for (let j = 0; j < 8; j++) {
    const col = (i < 2 && j > 3 ? [0.40, 0.44, 0.34] : [0.49, 0.48, 0.44]).map(v => v * (0.96 + 0.05 * Math.cos(j * 1.7)));
    if (i === 0) rock.tri([0.115, 0, 0.72], rockPoint(1, j + 1), rockPoint(1, j), col, [0, 0, 0.25]);
    else if (i === 4) rock.tri(rockPoint(i, j), rockPoint(i, j + 1), [0, 0, -0.14], col, [0, 0, 0.25]);
    else rock.quad(rockPoint(i, j), rockPoint(i, j + 1), rockPoint(i + 1, j + 1), rockPoint(i + 1, j), col, [0, 0, 0.25]);
  }
  // a fallen tree: root plate on the bank, trunk sloping down into the water, broken-off limbs (1 long along +x)
  const log = meshBuilder(), LOGC = [0.36, 0.31, 0.25]; log.mat = MT.BARK;
  log.tube([0, 0, 0.07], [1, 0.02, -0.12], 0.05, 0.03, 7, LOGC, true, (k, e) => e ? 0.78 + 0.38 * hash2(k, 1, 61) : 1);
  // Reuse the existing cap triangles for exposed wood; no added end discs.
  for (let v = 7 * 6 * VS; v < log.v.length; v += VS) { log.v[v + 6] = 0.66; log.v[v + 7] = 0.51; log.v[v + 8] = 0.31; log.v[v + 9] = MT.GEN; }
  log.blob([-0.02, 0, 0.08], 0.03, 0.13, 0.12, 3, 7, (i, j) => [0.3, 0.25, 0.19].map(v => v * (0.8 + 0.3 * hash2(i, j, 61))), (i, j) => 0.6 + 0.6 * hash2(i, j, 62));
  [[0.3, 1, 0.22], [0.52, -1, 0.18], [0.7, 1, 0.14], [0.85, -1, 0.1]].forEach(([t, sd, l]) => { const p0 = [t, 0.01, 0.07 - 0.19 * t + 0.02]; log.tube(p0, [t + l * 0.5, sd * l, p0[2] + l * 0.35 * (t < 0.6 ? 1 : -0.4)], 0.016, 0.006, 4, LOGC); });
  // a drowned stump: a short broken trunk with a flare of roots
  const stump = meshBuilder(); stump.mat = MT.BARK;
  stump.tube([0, 0, -0.1], [0.01, 0, 0.5], 0.12, 0.085, 7, [0.32, 0.28, 0.23], false, (k, e) => e ? 0.8 + 0.4 * hash2(k, 3, 63) : 1);
  for (let k = 0; k < 5; k++) { const a = k / 5 * 6.2832 + 0.3; stump.tube([Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.08], [Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.08], 0.05, 0.02, 4, [0.3, 0.26, 0.21]); }
  // coral: branching staghorn in pinks and purples; a brain coral with a plate of table coral in yellows and greens
  const coralA = meshBuilder(); coralA.mat = MT.GEN;
  const branch = (p, d, len, r, depth, k) => {
    const q = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len], c = [[1, 0.42, 0.68], [0.68, 0.38, 1], [1, 0.62, 0.42]][k % 3];
    coralA.tube(p, q, r, r * 0.7, 4, c.map(v => v * (0.85 + 0.15 * depth)), depth >= 1);
    if (depth < 1) for (let i = 0; i < 3; i++) { const a = i * 2.1 + depth + k, el = 0.5 + 0.25 * hash2(i, depth, k); branch(q, norm3([Math.cos(a) * Math.sin(el) + d[0] * 0.5, Math.sin(a) * Math.sin(el) + d[1] * 0.5, Math.cos(el)]), len * 0.7, r * 0.7, depth + 1, k + i); }
  };
  for (let k = 0; k < 4; k++) { const a = k * 1.6; branch([Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.05], norm3([Math.cos(a) * 0.4, Math.sin(a) * 0.4, 1]), 0.36, 0.045, 0, k); }
  const coralB = meshBuilder(); coralB.mat = MT.GEN;
  coralB.blob([0, 0, 0.12], 0.32, 0.28, 0.22, 5, 10, (i, j) => (j % 2 ? [1, 0.88, 0.38] : [0.8, 0.7, 0.3]), (i, j) => 0.9 + 0.12 * Math.sin(j * 2.3 + i * 1.7));
  coralB.tube([0.3, 0.1, -0.05], [0.33, 0.12, 0.25], 0.04, 0.03, 5, [0.5, 0.62, 0.42]);
  coralB.blob([0.33, 0.12, 0.28], 0.3, 0.27, 0.035, 2, 12, [0.4, 0.85, 0.6]);
  coralB.blob([-0.25, -0.22, 0.06], 0.13, 0.12, 0.11, 4, 9, [1, 0.5, 0.2]);
  // sea anemone: a stubby column with a crown of swaying tentacles (sway is set high in PLANT_DRAW)
  const anemone = meshBuilder(); anemone.mat = MT.GEN;
  anemone.tube([0, 0, -0.05], [0, 0, 0.25], 0.22, 0.24, 9, [0.62, 0.22, 0.32]);
  for (let k = 0; k < 20; k++) { const a = k * 2.399, r = 0.06 + 0.17 * Math.sqrt((k + 0.5) / 20), bx = Math.cos(a) * r, by = Math.sin(a) * r, tl = 0.32 + 0.18 * hash2(k, 1, 71);
    anemone.tube([bx, by, 0.24], [bx * 1.8, by * 1.8, 0.24 + tl], 0.04, 0.014, 3, k % 3 ? [0.92, 0.72, 0.55] : [0.75, 0.88, 0.5], true); }
  // an iceberg: a craggy white block, most of it under water (the instance sits it low)
  const berg = meshBuilder(); berg.mat = MT.GEN;
  berg.blob([0, 0, 0.35], 0.62, 0.48, 0.75, 6, 10, (i, j) => (i < 2 ? [0.95, 0.97, 1] : i < 4 ? [0.82, 0.9, 0.96] : [0.6, 0.78, 0.9]).map(v => v * (0.92 + 0.1 * hash2(i, j, 81))), (i, j) => 0.7 + 0.5 * hash2(i, j, 82));
  berg.blob([0.25, 0.15, 0.85], 0.28, 0.24, 0.32, 4, 8, [0.96, 0.98, 1], (i, j) => 0.75 + 0.4 * hash2(i, j, 83));
  for (const B of [reed, lily, lilyF, weed, kelp, rock, log, stump]) for (let v = 0; v < B.v.length; v += VS) {
    const z = B.v[v + 2], mat = B.v[v + 9];
    let shade = 1;
    if (B === rock) shade = 0.68 + 0.32 * clamp((z + 0.10) / 0.5, 0, 1);
    else if (B === log || B === stump) shade = 0.74 + 0.26 * clamp(B.v[v + 5] * 0.5 + 0.5, 0, 1);
    else if (B === lily || B === lilyF) shade = mat === MT.LEAF ? 0.88 + 0.12 * Math.max(0, B.v[v + 5]) : 1;
    else shade = 0.64 + 0.40 * clamp(z, 0, 1);
    for (let q = 6; q < 9; q++) B.v[v + q] *= shade;
    // BARK + .1 selects local x as the grain axis (fallen timber only).
    if (B === log && mat === MT.BARK) B.v[v + 9] = MT.BARK + 0.1;
  }
  // ---- more of the sea floor: sea fans, sponges, plate and brain coral, urchins, starfish, seagrass, bull kelp, rockweed, slabs and rubble, shells ----
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  // a sea fan: a flat branching fan of fine purple (or orange) twigs, one plane, standing on a short stalk (sways)
  const seafan = meshBuilder(); seafan.mat = MT.GEN;
  { const fc = [0.55, 0.3, 0.75], twig = (p, d, len, r, depth, k) => {
      const q = [p[0] + d[0] * len, p[1], p[2] + d[2] * len]; seafan.tube(p, q, r, r * 0.75, 3, mul(fc, 0.85 + 0.2 * hash2(k, depth, 91)));
      if (depth < 2) for (let i = -1; i <= 1; i += 2) { const a = Math.atan2(d[2], d[0]) + i * (0.5 + 0.15 * hash2(k + i, depth, 92)); twig(q, [Math.cos(a), 0, Math.sin(a)], len * 0.75, r * 0.72, depth + 1, k * 2 + (i > 0)); } };
    seafan.tube([0, 0, -0.05], [0, 0, 0.1], 0.03, 0.025, 4, [0.35, 0.2, 0.3]);
    for (let k = 0; k < 5; k++) { const a = 0.45 + k * 0.56; twig([0, 0, 0.1], [Math.cos(a), 0, Math.sin(a)], 0.3, 0.02, 0, k); } }
  // sponges: a barrel sponge (orange-brown, hollow top) with two tube sponges (purple) beside it
  const sponge = meshBuilder(); sponge.mat = MT.GEN;
  sponge.tube([0, 0, -0.05], [0, 0, 0.45], 0.2, 0.26, 9, [0.72, 0.36, 0.18], false, (k, e) => 0.9 + 0.2 * hash2(k, e, 93));
  sponge.tube([0, 0, 0.45], [0, 0, 0.3], 0.22, 0.17, 9, [0.3, 0.12, 0.08], true);   // the dark hollow
  for (const [ox, oy, h] of [[0.3, 0.12, 0.55], [0.36, 0.26, 0.4], [-0.3, 0.22, 0.35]]) { sponge.tube([ox, oy, -0.05], [ox * 1.1, oy * 1.1, h], 0.06, 0.055, 6, [0.5, 0.28, 0.62], false); sponge.tube([ox * 1.1, oy * 1.1, h], [ox * 1.1, oy * 1.1, h - 0.03], 0.05, 0.03, 6, [0.2, 0.1, 0.25], true); }
  // plate coral: broad flat tables on stalks, over a brain-coral dome
  const coralC = meshBuilder(); coralC.mat = MT.GEN;
  coralC.blob([0, 0, 0.1], 0.26, 0.24, 0.2, 4, 9, (i, j) => (j % 2 ? [0.78, 0.6, 0.36] : [0.62, 0.48, 0.3]), (i, j) => 0.92 + 0.1 * Math.sin(j * 3.1 + i * 2.3));
  for (const [ox, oy, h, r, c] of [[0.42, -0.1, 0.34, 0.34, [0.42, 0.62, 0.52]], [-0.32, 0.3, 0.26, 0.26, [0.72, 0.55, 0.3]], [0.05, 0.42, 0.42, 0.22, [0.35, 0.55, 0.62]]]) {
    coralC.tube([ox, oy, -0.05], [ox, oy, h], 0.05, 0.04, 5, mul(c, 0.6));
    coralC.blob([ox, oy, h + 0.01], r, r * 0.9, 0.03, 2, 12, (i, j) => mul(c, 0.9 + 0.15 * (j % 2)), (i, j) => 0.9 + 0.15 * hash2(i, j, 94)); }
  // sea urchins: a cluster of dark spiny balls
  const urchin = meshBuilder(); urchin.mat = MT.GEN;
  for (const [ox, oy, r] of [[0, 0, 0.12], [0.26, 0.1, 0.09], [-0.2, 0.22, 0.1]]) {
    urchin.blob([ox, oy, r * 0.8], r, r, r * 0.8, 3, 7, [0.12, 0.08, 0.16]);
    for (let k = 0; k < 8; k++) { const a = k * 2.399, el = 0.25 + 0.9 * hash2(k, 1, 95), d = [Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), Math.sin(el)]; urchin.tube([ox + d[0] * r * 0.8, oy + d[1] * r * 0.8, r * 0.8 + d[2] * r * 0.7], [ox + d[0] * r * 2.1, oy + d[1] * r * 2.1, r * 0.8 + d[2] * r * 2], 0.012, 0.003, 3, [0.2, 0.14, 0.26]); } }
  // starfish: a five-armed star lying flat, orange or purple, and a smaller one beside it
  const star = meshBuilder(); star.mat = MT.GEN;
  const starAt = (cx, cy, R, c, rot) => { for (let k = 0; k < 5; k++) { const a = rot + k / 5 * 6.2832, b = a + 0.6283, tip = [cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0.02], mid = [cx + Math.cos(b) * R * 0.38, cy + Math.sin(b) * R * 0.38, 0.05], mid0 = [cx + Math.cos(a - 0.6283) * R * 0.38, cy + Math.sin(a - 0.6283) * R * 0.38, 0.05];
      star.tri([cx, cy, 0.09], tip, mid, c, [cx, cy, -1]); star.tri([cx, cy, 0.09], mid0, tip, c, [cx, cy, -1]); star.tri([cx, cy, 0.09], mid, mid0, mul(c, 1.1), [cx, cy, -1]); } };
  starAt(0, 0, 0.26, [0.9, 0.42, 0.18], 0.3); starAt(0.42, 0.3, 0.14, [0.5, 0.3, 0.6], 1.4);
  // seagrass: a meadow tuft of many thin straight blades (sways)
  const eelgrass = meshBuilder(); eelgrass.mat = MT.LEAF;
  for (let k = 0; k < 16; k++) { const a = k * 2.399, r = 0.05 + 0.2 * Math.sqrt(k / 16), bx = Math.cos(a) * r, by = Math.sin(a) * r, lean = 0.12 + 0.2 * hash2(k, 2, 96), la = hash2(k, 3, 96) * 6.2832, top = 0.6 + 0.4 * hash2(k, 4, 96), g = 0.8 + 0.4 * hash2(k, 5, 96);
    eelgrass.tube([bx, by, -0.05], [bx + Math.cos(la) * lean, by + Math.sin(la) * lean, top], 0.014, 0.004, 3, [0.16 * g, 0.42 * g, 0.14 * g]); }
  // bull kelp: a long stipe up to a gas float, with a tassel of blades hanging from it (sways, tall)
  const bullkelp = meshBuilder(); bullkelp.mat = MT.LEAF;
  { let p = [0, 0, -0.05]; for (let sg = 0; sg < 6; sg++) { const t = (sg + 1) / 6, q = [0.04 * Math.sin(t * 4), 0.04 * Math.cos(t * 3), t * 0.88]; bullkelp.tube(p, q, 0.012, 0.011, 4, [0.3, 0.26, 0.1]); p = q; }
    bullkelp.blob([p[0], p[1], 0.9], 0.045, 0.045, 0.05, 3, 7, [0.42, 0.36, 0.14]);
    for (let k = 0; k < 7; k++) { const a = k * 0.9, L0 = 0.3 + 0.2 * hash2(k, 6, 97); bullkelp.tube([p[0], p[1], 0.92], [p[0] + Math.cos(a) * 0.14, p[1] + Math.sin(a) * 0.14, 0.92 - L0], 0.03, 0.008, 3, [0.34, 0.3, 0.1]); } }
  // rockweed: a low olive-brown clump of forked fronds on an intertidal rock
  const rockweed = meshBuilder(); rockweed.mat = MT.LEAF;
  for (let k = 0; k < 9; k++) { const a = k * 2.399, r = 0.06 + 0.1 * hash2(k, 7, 98), bx = Math.cos(a) * r, by = Math.sin(a) * r, L0 = 0.22 + 0.16 * hash2(k, 8, 98), c = [0.36, 0.32, 0.12];
    const m = [bx + Math.cos(a) * L0 * 0.5, by + Math.sin(a) * L0 * 0.5, 0.1 + 0.08 * hash2(k, 9, 98)]; rockweed.tube([bx, by, -0.02], m, 0.02, 0.016, 3, c);
    for (let i = -1; i <= 1; i += 2) rockweed.tube(m, [m[0] + Math.cos(a + i * 0.5) * L0 * 0.5, m[1] + Math.sin(a + i * 0.5) * L0 * 0.5, m[2] + 0.04], 0.016, 0.004, 3, mul(c, 1.1)); }
  // a slab: a low flat rock with an algae-dark top, and rubble: a scatter of small stones
  const slab = meshBuilder(); slab.mat = MT.ROCK;
  slab.blob([0, 0, 0.02], 0.55, 0.38, 0.14, 4, 9, (i, j) => (i < 2 ? [0.32, 0.36, 0.28] : [0.46, 0.44, 0.4]), (i, j) => 0.85 + 0.25 * hash2(i, j, 99), 0.4);
  slab.blob([0.3, -0.3, 0.0], 0.22, 0.16, 0.09, 3, 7, [0.44, 0.42, 0.38], (i, j) => 0.85 + 0.25 * hash2(i, j, 100));
  const rubble = meshBuilder(); rubble.mat = MT.ROCK;
  for (let k = 0; k < 6; k++) { const a = k * 2.399, r = 0.1 + 0.32 * Math.sqrt(k / 6), sc = 0.06 + 0.08 * hash2(k, 1, 101); rubble.blob([Math.cos(a) * r, Math.sin(a) * r, sc * 0.5], sc * 1.3, sc, sc * 0.8, 3, 6, mul([0.5, 0.47, 0.42], 0.85 + 0.3 * hash2(k, 2, 101)), (i, j) => 0.85 + 0.3 * hash2(i + k, j, 102)); }
  // shells on the sand: a few clam shells and a sand dollar
  const shells = meshBuilder(); shells.mat = MT.GEN;
  for (const [ox, oy, r, c, rot] of [[0, 0, 0.1, [0.9, 0.84, 0.7], 0.3], [0.3, 0.2, 0.08, [0.85, 0.7, 0.6], 1.9], [-0.28, 0.18, 0.07, [0.95, 0.92, 0.85], 4]]) shells.blob([ox, oy, 0.015], r, r * 0.85, 0.035, 2, 9, (i, j) => mul(c, 0.9 + 0.12 * (j % 2)), null, rot);
  shells.blob([0.05, -0.32, 0.01], 0.09, 0.09, 0.012, 2, 10, [0.75, 0.72, 0.62]);
  for (const B of [seafan, sponge, coralC, urchin, star, eelgrass, bullkelp, rockweed, slab, rubble, shells]) for (let v = 0; v < B.v.length; v += VS) {   // the same gentle ground-shadowing the older kinds get
    const z = B.v[v + 2], shade = B === slab || B === rubble ? 0.7 + 0.3 * clamp((z + 0.1) / 0.3, 0, 1) : 0.7 + 0.3 * clamp(z + 0.1, 0, 1);
    for (let q = 6; q < 9; q++) B.v[v + q] *= shade;
  }
  // ---- land cover (triangles: grass 30, flowers 36, fern 40, bush 80, heath 32, moss 16), coloured for the climate ----
  const GC = MATS[PLAIN].col, AR = CLIMATE.key === 'arctic', TR = CLIMATE.key === 'tropical';
  const blade = (B, bx, by, a, lean, top, w, col) => { const px = -Math.sin(a) * w, py = Math.cos(a) * w;   // one triangle leaning out along a
    B.tri([bx - px, by - py, -0.03], [bx + px, by + py, -0.03], [bx + Math.cos(a) * lean, by + Math.sin(a) * lean, top], col, [bx - Math.cos(a), by - Math.sin(a), 0]); };
  // grass tuft: 30 single-triangle blades, shorter toward the rim
  const grass = meshBuilder(); grass.mat = MT.LEAF;
  for (let k = 0; k < 30; k++) { const a = k * 2.399 + hash2(k, 1, 111), r = 0.02 + 0.3 * Math.sqrt((k + 0.5) / 30), g = 0.85 + 0.3 * hash2(k, 2, 111), y = hash2(k, 3, 111) * 0.1;
    blade(grass, Math.cos(a) * r, Math.sin(a) * r, a + (hash2(k, 4, 111) - 0.5) * 0.9, 0.06 + 0.18 * hash2(k, 5, 111) + r * 0.5, (0.3 + 0.32 * hash2(k, 6, 111)) * (1.1 - r), 0.024 + 0.014 * hash2(k, 7, 111), [GC[0] * g + y, GC[1] * g + y * 0.6, GC[2] * g]); }
  // flowers: a few leaves, four stems, five-petal blossoms with a centre (A: whites and yellows, B: pinks, purples, reds)
  const FA = TR ? [[1, 0.85, 0.1], [1, 0.55, 0.12], [1, 0.97, 0.9]] : [[1, 0.98, 0.92], [1, 0.84, 0.15]];
  const FB = TR ? [[1, 0.18, 0.3], [0.95, 0.3, 0.9], [1, 0.42, 0.15]] : AR ? [[0.92, 0.5, 0.82], [0.75, 0.45, 0.9]] : [[0.62, 0.36, 0.92], [0.98, 0.45, 0.72], [0.4, 0.5, 1]];
  const flowers = (cols, seed) => { const B = meshBuilder(); B.mat = MT.LEAF;
    for (let k = 0; k < 8; k++) { const a = k * 2.399, r = 0.03 + 0.1 * hash2(k, 1, seed); blade(B, Math.cos(a) * r, Math.sin(a) * r, a, 0.12, 0.12 + 0.12 * hash2(k, 2, seed), 0.035, mul(GC, 0.8)); }
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + 0.4, r = 0.05 + 0.13 * hash2(k, 3, seed), x = Math.cos(a) * r, y = Math.sin(a) * r, z = 0.3 + 0.22 * hash2(k, 4, seed), c = cols[k % cols.length], pr = 0.13 + 0.05 * hash2(k, 5, seed);
      B.mat = MT.LEAF; B.tri([x - 0.01, y, -0.02], [x + 0.01, y, -0.02], [x, y, z], mul(GC, 0.7), [x, y + 1, 0]);
      B.mat = MT.CLOTH; for (let p = 0; p < 5; p++) { const q = p * 1.2566 + a; B.tri([x, y, z], [x + Math.cos(q - 0.38) * pr, y + Math.sin(q - 0.38) * pr, z + 0.06], [x + Math.cos(q + 0.38) * pr, y + Math.sin(q + 0.38) * pr, z + 0.06], c, [x, y, z - 1]); }   // a shallow cup: seen from the side too
      B.tri([x - 0.025, y - 0.018, z + 0.035], [x + 0.025, y - 0.018, z + 0.035], [x, y + 0.028, z + 0.035], c[2] > 0.8 && c[1] > 0.9 ? [1, 0.8, 0.15] : [0.95, 0.6, 0.1], [x, y, z - 1]);
    }
    return B; };
  const flowerA = flowers(FA, 112), flowerB = flowers(FB, 114);
  // fern: five arching fronds, each a tapering strip of four segments
  const fern = meshBuilder(); fern.mat = MT.LEAF; const FC = TR ? [0.2, 0.5, 0.14] : [0.23, 0.43, 0.13];
  for (let k = 0; k < 5; k++) { const a = k * 1.2566 + 0.4 * hash2(k, 1, 113), L0 = 0.75 + 0.3 * hash2(k, 2, 113), ca = Math.cos(a), sa = Math.sin(a), H0 = 0.5 + 0.2 * hash2(k, 4, 113), col = mul(FC, 0.85 + 0.3 * hash2(k, 3, 113));
    const P = t => [ca * L0 * t, sa * L0 * t, H0 * Math.sin(t * 2.5)], W = t => 0.02 + 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.05));
    for (let s = 0; s < 4; s++) { const p0 = P(s / 4), p1 = P((s + 1) / 4), w0 = W(s / 4), w1 = W((s + 1) / 4);
      fern.quad([p0[0] - sa * w0, p0[1] + ca * w0, p0[2]], [p0[0] + sa * w0, p0[1] - ca * w0, p0[2]], [p1[0] + sa * w1, p1[1] - ca * w1, p1[2]], [p1[0] - sa * w1, p1[1] + ca * w1, p1[2]], col, [p0[0], p0[1], p0[2] - 1]); } }
  // bush: three leafy lumps
  const bush = meshBuilder(); bush.mat = MT.LEAF; const BC = TR ? [0.18, 0.46, 0.15] : AR ? [0.36, 0.4, 0.21] : [0.29, 0.47, 0.17];
  const bcol = s => (i, j) => mul(BC, 0.75 + 0.45 * hash2(i + s, j, 116)), lump = s => (i, j) => 0.7 + 0.5 * hash2(i + s, j, 115);
  [[0, 0, 0.42, 0.36], [0.3, 0.12, 0.28, 0.3], [-0.25, 0.24, 0.26, 0.29], [-0.06, -0.3, 0.22, 0.27]].forEach(([x, y, z, r], k) => bush.blob([x, y, z], r, r * 0.95, r * 0.85, 3, 5, bcol(k * 3), lump(k * 4), k));   // four leafy clusters
  // heath: a low cushion; heather-purple tops (arctic: crowberry and reddening bearberry, tropical: a yellow-flowered cushion)
  const heath = meshBuilder(); heath.mat = MT.LEAF; const HC = AR ? [0.26, 0.31, 0.15] : [0.3, 0.33, 0.17], HF = AR ? [0.42, 0.26, 0.16] : TR ? [0.95, 0.8, 0.2] : [0.6, 0.32, 0.62];
  heath.blob([0, 0, 0.04], 0.5, 0.44, 0.28, 3, 8, (i, j) => i < 2 && (j + i) % 2 ? HF : mul(HC, 0.85 + 0.3 * hash2(i, j, 117)), (i, j) => 0.8 + 0.35 * hash2(i, j, 118));
  // moss: a flat lumpy cushion, half sunk into the ground (grey-green lichen in the arctic)
  const moss = meshBuilder(); moss.mat = MT.LEAF; const MC = AR ? [0.46, 0.48, 0.32] : TR ? [0.2, 0.45, 0.12] : [0.27, 0.42, 0.12];
  moss.blob([0, 0, 0], 0.55, 0.45, 0.13, 2, 8, (i, j) => mul(MC, 0.85 + 0.3 * hash2(i, j, 119)), (i, j) => 0.75 + 0.4 * hash2(i, j, 120));
  for (const [B, top, up] of [[grass, 0.6, 0.7], [flowerA, 0.4, 0.6], [flowerB, 0.4, 0.6], [fern, 0.6, 0.55], [bush, 0.7, 0.5], [heath, 0.3, 0.3], [moss, 0.12, 0.3]]) for (let v = 0; v < B.v.length; v += VS) {   // darker at the roots; normals tipped up so thin blades light like the ground
    if (B.v[v + 9] === MT.LEAF) { const s = (B === bush ? 0.75 : 0.58) + (B === bush ? 0.35 : 0.47) * clamp(B.v[v + 2] / top, 0, 1); for (let q = 6; q < 9; q++) B.v[v + q] *= s; }
    const nx = B.v[v + 3] * (1 - up), ny = B.v[v + 4] * (1 - up), nz = Math.abs(B.v[v + 5]) * (1 - up) + up, l = Math.hypot(nx, ny, nz) || 1; B.v[v + 3] = nx / l; B.v[v + 4] = ny / l; B.v[v + 5] = nz / l;
  }
  const f = M => new Float32Array(M.v);
  return { reed: f(reed), lily: f(lily), lilyF: f(lilyF), weed: f(weed), kelp: f(kelp), rock: f(rock), log: f(log), stump: f(stump), coralA: f(coralA), coralB: f(coralB), anemone: f(anemone), berg: f(berg),
    seafan: f(seafan), sponge: f(sponge), coralC: f(coralC), urchin: f(urchin), star: f(star), eelgrass: f(eelgrass), bullkelp: f(bullkelp), rockweed: f(rockweed), slab: f(slab), rubble: f(rubble), shells: f(shells),
    grass: f(grass), flowerA: f(flowerA), flowerB: f(flowerB), fern: f(fern), bush: f(bush), heath: f(heath), moss: f(moss) };
}
