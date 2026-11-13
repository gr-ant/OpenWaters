'use strict';
// Water plants, stones, coral, icebergs and ground cover: the shapes (PLANT_BUILDERS) and waterMeshes(), which builds every
// mesh the plants in src/plants/*.json name. A plant's mesh: { builder, ...its numbers and colours, shade }. Colours may be
// given per climate: { "temperate": [r, g, b], "arctic": …, "tropical": … }; "ground" is the climate's grass colour.
const CULL_SIDE = 1028; // gl.FRONT: the view is mirrored (to match the north-up map), so outward faces wind clockwise on screen
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const PLANT_BUILDERS = {
  // reeds: a clump of thin leaning blades with a few cattails
  reeds(B, m) {
    for (let k = 0; k < m.blades; k++) {
      const a = k * 2.4, r = 0.025 + 0.035 * hash2(k, 1, 31), group = k % 3 * 2.4, bx = Math.cos(group) * 0.09 + Math.cos(a) * r, by = Math.sin(group) * 0.09 + Math.sin(a) * r;
      const lean = 0.08 + 0.14 * hash2(k, 2, 31), la = 0.8 + (hash2(k, 3, 31) - 0.5) * 1.7, top = 0.7 + 0.32 * hash2(k, 4, 31), g = 0.8 + 0.35 * hash2(k, 5, 31), c = m.color;
      B.mat = MT.LEAF; B.tube([bx, by, -0.05], [bx + Math.cos(la) * lean, by + Math.sin(la) * lean, top], 0.016, 0.002, 3, [c[0] * g, c[1] * g, c[2] * g]);
    }
    for (let k = 0; k < m.cattails; k++) {
      const a = k * 2.1 + 0.5, b = [Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.05], tp = [b[0] + Math.cos(a) * 0.07, b[1] + Math.sin(a) * 0.07, 1.0 + 0.1 * k];
      B.mat = MT.LEAF; B.tube(b, tp, 0.008, 0.005, 3, m.stalk);
      B.mat = MT.CLOTH; B.tube(lerp3(b, tp, 0.8), lerp3(b, tp, 0.9), 0.016, 0.015, 6, m.head, true);
    }
  },
  // lily pads: notched discs floating flat [x, y, radius, notch, colour]; flower: a water lily on the first pad
  lilypads(B, m) {
    const pad = (cx, cy, r, notch, col) => {
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
    B.mat = MT.LEAF; for (const [x, y, r, notch, col] of m.pads) pad(x, y, r, notch, col);
    const F = m.flower; if (!F) return;
    const [fx, fy] = F.at; B.mat = MT.CLOTH;
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * 6.2832 + (k % 2) * 0.3, rr = k % 2 ? 0.13 : 0.18, tip = [fx + Math.cos(a) * rr, fy + Math.sin(a) * rr, k % 2 ? 0.16 : 0.1];
      B.tri([fx, fy, 0.03], [fx + Math.cos(a + 0.4) * 0.06, fy + Math.sin(a + 0.4) * 0.06, 0.05], tip, F.petals[0], [fx, fy, -0.5]);
      B.tri([fx, fy, 0.03], [fx + Math.cos(a - 0.4) * 0.06, fy + Math.sin(a - 0.4) * 0.06, 0.05], tip, F.petals[1], [fx, fy, -0.5]);
    }
    B.blob([fx, fy, 0.07], 0.04, 0.04, 0.03, 3, 6, F.centre);
  },
  // weed beds and kelp: wavy ribbons (count, width, colour, seed)
  ribbons(B, m) {
    const col = m.color, wid = m.width, seed = m.seed; B.mat = MT.LEAF;
    for (let k = 0; k < m.count; k++) {
      const a = k * 1.9, r = 0.05 + 0.12 * hash2(k, 7, seed), top = 0.55 + 0.45 * hash2(k, 8, seed), g = 0.75 + 0.45 * hash2(k, 9, seed);
      let px = Math.cos(a) * r, py = Math.sin(a) * r, z = -0.05;
      for (let s = 0; s < 6; s++) {
        const t = (s + 1) / 6, z1 = t * top, bend = t * t * (0.18 + 0.1 * hash2(k, 3, seed)), nx = Math.cos(a) * r + bend + Math.sin(t * 5 + k) * 0.025 * t, ny = Math.sin(a) * r + bend * 0.4 + Math.cos(t * 5 + k) * 0.025 * t;
        B.tube([px, py, z], [nx, ny, z1], wid * (1 - s / 7), wid * (1 - (s + 1) / 7), 3, [col[0] * g, col[1] * g, col[2] * g]);
        px = nx; py = ny; z = z1;
      }
    }
  },
  // a boulder: a clipped, sheared block (broad fracture planes, not independent bumps on every vertex); colors: [mossy side, bare]
  boulder(B, m) {
    B.mat = MT.ROCK;
    const rings = [[0.72, 0.22], [0.61, 0.77], [0.39, 1], [0.12, 0.92], [-0.10, 0.62], [-0.14, 0.12]];
    const point = (i, j) => {
      const [z, r] = rings[i], a = (j % 8) / 8 * Math.PI * 2 + 0.16;
      const edge = 0.94 + 0.1 * Math.cos(a * 3);
      return [Math.cos(a) * r * 0.6 * edge + z * 0.16, Math.sin(a) * r * 0.5 * edge, z + 0.045 * Math.cos(a) * r];
    };
    for (let i = 0; i < 5; i++) for (let j = 0; j < 8; j++) {
      const col = (i < 2 && j > 3 ? m.colors[0] : m.colors[1]).map(v => v * (0.96 + 0.05 * Math.cos(j * 1.7)));
      if (i === 0) B.tri([0.115, 0, 0.72], point(1, j + 1), point(1, j), col, [0, 0, 0.25]);
      else if (i === 4) B.tri(point(i, j), point(i, j + 1), [0, 0, -0.14], col, [0, 0, 0.25]);
      else B.quad(point(i, j), point(i, j + 1), point(i + 1, j + 1), point(i + 1, j), col, [0, 0, 0.25]);
    }
  },
  // a fallen tree: root plate on the bank, trunk sloping down into the water, broken-off limbs (1 long along +x)
  fallenLog(B, m) {
    const C = m.color; B.mat = MT.BARK;
    B.tube([0, 0, 0.07], [1, 0.02, -0.12], 0.05, 0.03, 7, C, true, (k, e) => e ? 0.78 + 0.38 * hash2(k, 1, 61) : 1);
    // Reuse the existing cap triangles for exposed wood; no added end discs.
    for (let v = 7 * 6 * VS; v < B.v.length; v += VS) { B.v[v + 6] = m.wood[0]; B.v[v + 7] = m.wood[1]; B.v[v + 8] = m.wood[2]; B.v[v + 9] = MT.GEN; }
    B.blob([-0.02, 0, 0.08], 0.03, 0.13, 0.12, 3, 7, (i, j) => m.roots.map(v => v * (0.8 + 0.3 * hash2(i, j, 61))), (i, j) => 0.6 + 0.6 * hash2(i, j, 62));
    [[0.3, 1, 0.22], [0.52, -1, 0.18], [0.7, 1, 0.14], [0.85, -1, 0.1]].forEach(([t, sd, l]) => { const p0 = [t, 0.01, 0.07 - 0.19 * t + 0.02]; B.tube(p0, [t + l * 0.5, sd * l, p0[2] + l * 0.35 * (t < 0.6 ? 1 : -0.4)], 0.016, 0.006, 4, C); });
  },
  // a drowned stump: a short broken trunk with a flare of roots
  stump(B, m) {
    B.mat = MT.BARK;
    B.tube([0, 0, -0.1], [0.01, 0, 0.5], 0.12, 0.085, 7, m.color, false, (k, e) => e ? 0.8 + 0.4 * hash2(k, 3, 63) : 1);
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.2832 + 0.3; B.tube([Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.08], [Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.08], 0.05, 0.02, 4, m.roots); }
  },
  // staghorn coral: branching, each branch one of colors
  staghorn(B, m) {
    B.mat = MT.GEN;
    const branch = (p, d, len, r, depth, k) => {
      const q = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len], c = m.colors[k % m.colors.length];
      B.tube(p, q, r, r * 0.7, 4, c.map(v => v * (0.85 + 0.15 * depth)), depth >= 1);
      if (depth < 1) for (let i = 0; i < 3; i++) { const a = i * 2.1 + depth + k, el = 0.5 + 0.25 * hash2(i, depth, k); branch(q, norm3([Math.cos(a) * Math.sin(el) + d[0] * 0.5, Math.sin(a) * Math.sin(el) + d[1] * 0.5, Math.cos(el)]), len * 0.7, r * 0.7, depth + 1, k + i); }
    };
    for (let k = 0; k < 4; k++) { const a = k * 1.6; branch([Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.05], norm3([Math.cos(a) * 0.4, Math.sin(a) * 0.4, 1]), 0.36, 0.045, 0, k); }
  },
  // a brain coral (ridged in two colours) with a plate of table coral on a stalk and a small round one
  brainTable(B, m) {
    B.mat = MT.GEN;
    B.blob([0, 0, 0.12], 0.32, 0.28, 0.22, 5, 10, (i, j) => (j % 2 ? m.brain[0] : m.brain[1]), (i, j) => 0.9 + 0.12 * Math.sin(j * 2.3 + i * 1.7));
    B.tube([0.3, 0.1, -0.05], [0.33, 0.12, 0.25], 0.04, 0.03, 5, m.stalk);
    B.blob([0.33, 0.12, 0.28], 0.3, 0.27, 0.035, 2, 12, m.table);
    B.blob([-0.25, -0.22, 0.06], 0.13, 0.12, 0.11, 4, 9, m.small);
  },
  // sea anemone: a stubby column with a crown of swaying tentacles (sway is set high in its JSON)
  anemone(B, m) {
    B.mat = MT.GEN;
    B.tube([0, 0, -0.05], [0, 0, 0.25], 0.22, 0.24, 9, m.column);
    for (let k = 0; k < m.tentacles; k++) { const a = k * 2.399, r = 0.06 + 0.17 * Math.sqrt((k + 0.5) / m.tentacles), bx = Math.cos(a) * r, by = Math.sin(a) * r, tl = 0.32 + 0.18 * hash2(k, 1, 71);
      B.tube([bx, by, 0.24], [bx * 1.8, by * 1.8, 0.24 + tl], 0.04, 0.014, 3, k % 3 ? m.tips[0] : m.tips[1], true); }
  },
  // an iceberg: a craggy white block, most of it under water (the instance sits it low); colors: top, middle, under water
  iceberg(B, m) {
    B.mat = MT.GEN;
    B.blob([0, 0, 0.35], 0.62, 0.48, 0.75, 6, 10, (i, j) => (i < 2 ? m.colors[0] : i < 4 ? m.colors[1] : m.colors[2]).map(v => v * (0.92 + 0.1 * hash2(i, j, 81))), (i, j) => 0.7 + 0.5 * hash2(i, j, 82));
    B.blob([0.25, 0.15, 0.85], 0.28, 0.24, 0.32, 4, 8, m.peak, (i, j) => 0.75 + 0.4 * hash2(i, j, 83));
  },
  // a sea fan: a flat branching fan of fine twigs, one plane, standing on a short stalk (sways)
  seafan(B, m) {
    B.mat = MT.GEN;
    const fc = m.color, twig = (p, d, len, r, depth, k) => {
      const q = [p[0] + d[0] * len, p[1], p[2] + d[2] * len]; B.tube(p, q, r, r * 0.75, 3, mul(fc, 0.85 + 0.2 * hash2(k, depth, 91)));
      if (depth < 2) for (let i = -1; i <= 1; i += 2) { const a = Math.atan2(d[2], d[0]) + i * (0.5 + 0.15 * hash2(k + i, depth, 92)); twig(q, [Math.cos(a), 0, Math.sin(a)], len * 0.75, r * 0.72, depth + 1, k * 2 + (i > 0)); } };
    B.tube([0, 0, -0.05], [0, 0, 0.1], 0.03, 0.025, 4, m.stalk);
    for (let k = 0; k < 5; k++) { const a = 0.45 + k * 0.56; twig([0, 0, 0.1], [Math.cos(a), 0, Math.sin(a)], 0.3, 0.02, 0, k); }
  },
  // sponges: a barrel sponge (hollow top) with tube sponges [x, y, height] beside it
  sponge(B, m) {
    B.mat = MT.GEN;
    B.tube([0, 0, -0.05], [0, 0, 0.45], 0.2, 0.26, 9, m.barrel, false, (k, e) => 0.9 + 0.2 * hash2(k, e, 93));
    B.tube([0, 0, 0.45], [0, 0, 0.3], 0.22, 0.17, 9, m.hollow, true);   // the dark hollow
    for (const [ox, oy, h] of m.tubes) { B.tube([ox, oy, -0.05], [ox * 1.1, oy * 1.1, h], 0.06, 0.055, 6, m.tube, false); B.tube([ox * 1.1, oy * 1.1, h], [ox * 1.1, oy * 1.1, h - 0.03], 0.05, 0.03, 6, m.tubeHollow, true); }
  },
  // plate coral: broad flat tables on stalks [x, y, height, radius, colour], over a brain-coral dome
  plateCoral(B, m) {
    B.mat = MT.GEN;
    B.blob([0, 0, 0.1], 0.26, 0.24, 0.2, 4, 9, (i, j) => (j % 2 ? m.dome[0] : m.dome[1]), (i, j) => 0.92 + 0.1 * Math.sin(j * 3.1 + i * 2.3));
    for (const [ox, oy, h, r, c] of m.plates) {
      B.tube([ox, oy, -0.05], [ox, oy, h], 0.05, 0.04, 5, mul(c, 0.6));
      B.blob([ox, oy, h + 0.01], r, r * 0.9, 0.03, 2, 12, (i, j) => mul(c, 0.9 + 0.15 * (j % 2)), (i, j) => 0.9 + 0.15 * hash2(i, j, 94)); }
  },
  // sea urchins: a cluster of spiny balls [x, y, radius]
  urchins(B, m) {
    B.mat = MT.GEN;
    for (const [ox, oy, r] of m.balls) {
      B.blob([ox, oy, r * 0.8], r, r, r * 0.8, 3, 7, m.body);
      for (let k = 0; k < 8; k++) { const a = k * 2.399, el = 0.25 + 0.9 * hash2(k, 1, 95), d = [Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), Math.sin(el)]; B.tube([ox + d[0] * r * 0.8, oy + d[1] * r * 0.8, r * 0.8 + d[2] * r * 0.7], [ox + d[0] * r * 2.1, oy + d[1] * r * 2.1, r * 0.8 + d[2] * r * 2], 0.012, 0.003, 3, m.spines); } }
  },
  // starfish: five-armed stars lying flat [x, y, radius, colour, turn]
  starfish(B, m) {
    B.mat = MT.GEN;
    for (const [cx, cy, R, c, rot] of m.stars) for (let k = 0; k < 5; k++) { const a = rot + k / 5 * 6.2832, b = a + 0.6283, tip = [cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0.02], mid = [cx + Math.cos(b) * R * 0.38, cy + Math.sin(b) * R * 0.38, 0.05], mid0 = [cx + Math.cos(a - 0.6283) * R * 0.38, cy + Math.sin(a - 0.6283) * R * 0.38, 0.05];
      B.tri([cx, cy, 0.09], tip, mid, c, [cx, cy, -1]); B.tri([cx, cy, 0.09], mid0, tip, c, [cx, cy, -1]); B.tri([cx, cy, 0.09], mid, mid0, mul(c, 1.1), [cx, cy, -1]); }
  },
  // seagrass: a meadow tuft of many thin straight blades (sways)
  blades(B, m) {
    B.mat = MT.LEAF; const c = m.color, n = m.count;
    for (let k = 0; k < n; k++) { const a = k * 2.399, r = 0.05 + 0.2 * Math.sqrt(k / n), bx = Math.cos(a) * r, by = Math.sin(a) * r, lean = 0.12 + 0.2 * hash2(k, 2, 96), la = hash2(k, 3, 96) * 6.2832, top = 0.6 + 0.4 * hash2(k, 4, 96), g = 0.8 + 0.4 * hash2(k, 5, 96);
      B.tube([bx, by, -0.05], [bx + Math.cos(la) * lean, by + Math.sin(la) * lean, top], 0.014, 0.004, 3, [c[0] * g, c[1] * g, c[2] * g]); }
  },
  // bull kelp: a long stipe up to a gas float, with a tassel of blades hanging from it (sways, tall)
  bullkelp(B, m) {
    B.mat = MT.LEAF;
    let p = [0, 0, -0.05]; for (let sg = 0; sg < 6; sg++) { const t = (sg + 1) / 6, q = [0.04 * Math.sin(t * 4), 0.04 * Math.cos(t * 3), t * 0.88]; B.tube(p, q, 0.012, 0.011, 4, m.stipe); p = q; }
    B.blob([p[0], p[1], 0.9], 0.045, 0.045, 0.05, 3, 7, m.float);
    for (let k = 0; k < m.blades; k++) { const a = k * 0.9, L0 = 0.3 + 0.2 * hash2(k, 6, 97); B.tube([p[0], p[1], 0.92], [p[0] + Math.cos(a) * 0.14, p[1] + Math.sin(a) * 0.14, 0.92 - L0], 0.03, 0.008, 3, m.blade); }
  },
  // rockweed: a low clump of forked fronds on an intertidal rock
  rockweed(B, m) {
    B.mat = MT.LEAF;
    for (let k = 0; k < m.fronds; k++) { const a = k * 2.399, r = 0.06 + 0.1 * hash2(k, 7, 98), bx = Math.cos(a) * r, by = Math.sin(a) * r, L0 = 0.22 + 0.16 * hash2(k, 8, 98), c = m.color;
      const q = [bx + Math.cos(a) * L0 * 0.5, by + Math.sin(a) * L0 * 0.5, 0.1 + 0.08 * hash2(k, 9, 98)]; B.tube([bx, by, -0.02], q, 0.02, 0.016, 3, c);
      for (let i = -1; i <= 1; i += 2) B.tube(q, [q[0] + Math.cos(a + i * 0.5) * L0 * 0.5, q[1] + Math.sin(a + i * 0.5) * L0 * 0.5, q[2] + 0.04], 0.016, 0.004, 3, mul(c, 1.1)); }
  },
  // a slab: a low flat rock with an algae-dark top (colors: top, sides) and a smaller stone beside it
  slab(B, m) {
    B.mat = MT.ROCK;
    B.blob([0, 0, 0.02], 0.55, 0.38, 0.14, 4, 9, (i, j) => (i < 2 ? m.colors[0] : m.colors[1]), (i, j) => 0.85 + 0.25 * hash2(i, j, 99), 0.4);
    B.blob([0.3, -0.3, 0.0], 0.22, 0.16, 0.09, 3, 7, m.stone, (i, j) => 0.85 + 0.25 * hash2(i, j, 100));
  },
  // rubble: a scatter of small stones
  rubble(B, m) {
    B.mat = MT.ROCK;
    for (let k = 0; k < m.stones; k++) { const a = k * 2.399, r = 0.1 + 0.32 * Math.sqrt(k / m.stones), sc = 0.06 + 0.08 * hash2(k, 1, 101); B.blob([Math.cos(a) * r, Math.sin(a) * r, sc * 0.5], sc * 1.3, sc, sc * 0.8, 3, 6, mul(m.color, 0.85 + 0.3 * hash2(k, 2, 101)), (i, j) => 0.85 + 0.3 * hash2(i + k, j, 102)); }
  },
  // shells on the sand: clam shells [x, y, radius, colour, turn] and a sand dollar
  shells(B, m) {
    B.mat = MT.GEN;
    for (const [ox, oy, r, c, rot] of m.clams) B.blob([ox, oy, 0.015], r, r * 0.85, 0.035, 2, 9, (i, j) => mul(c, 0.9 + 0.12 * (j % 2)), null, rot);
    B.blob([0.05, -0.32, 0.01], 0.09, 0.09, 0.012, 2, 10, m.dollar);
  },
  // ---- land cover (triangles: grass 30, flowers 36, fern 40, bush 80, heath 48, moss 16), coloured for the climate ----
  // grass tuft: single-triangle blades, shorter toward the rim
  grass(B, m, C) {
    B.mat = MT.LEAF; const GC = C.ground, n = m.blades;
    for (let k = 0; k < n; k++) { const a = k * 2.399 + hash2(k, 1, 111), r = 0.02 + 0.3 * Math.sqrt((k + 0.5) / n), g = 0.85 + 0.3 * hash2(k, 2, 111), y = hash2(k, 3, 111) * 0.1;
      blade(B, Math.cos(a) * r, Math.sin(a) * r, a + (hash2(k, 4, 111) - 0.5) * 0.9, 0.06 + 0.18 * hash2(k, 5, 111) + r * 0.5, (0.3 + 0.32 * hash2(k, 6, 111)) * (1.1 - r), 0.024 + 0.014 * hash2(k, 7, 111), [GC[0] * g + y, GC[1] * g + y * 0.6, GC[2] * g]); }
  },
  // flowers: a few leaves, four stems, five-petal blossoms with a centre, in the given colours
  flowers(B, m, C) {
    const GC = C.ground, cols = C.pick(m.colors), seed = m.seed; B.mat = MT.LEAF;
    for (let k = 0; k < 8; k++) { const a = k * 2.399, r = 0.03 + 0.1 * hash2(k, 1, seed); blade(B, Math.cos(a) * r, Math.sin(a) * r, a, 0.12, 0.12 + 0.12 * hash2(k, 2, seed), 0.035, mul(GC, 0.8)); }
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + 0.4, r = 0.05 + 0.13 * hash2(k, 3, seed), x = Math.cos(a) * r, y = Math.sin(a) * r, z = 0.3 + 0.22 * hash2(k, 4, seed), c = cols[k % cols.length], pr = 0.13 + 0.05 * hash2(k, 5, seed);
      B.mat = MT.LEAF; B.tri([x - 0.01, y, -0.02], [x + 0.01, y, -0.02], [x, y, z], mul(GC, 0.7), [x, y + 1, 0]);
      B.mat = MT.CLOTH; for (let p = 0; p < 5; p++) { const q = p * 1.2566 + a; B.tri([x, y, z], [x + Math.cos(q - 0.38) * pr, y + Math.sin(q - 0.38) * pr, z + 0.06], [x + Math.cos(q + 0.38) * pr, y + Math.sin(q + 0.38) * pr, z + 0.06], c, [x, y, z - 1]); }   // a shallow cup: seen from the side too
      B.tri([x - 0.025, y - 0.018, z + 0.035], [x + 0.025, y - 0.018, z + 0.035], [x, y + 0.028, z + 0.035], c[2] > 0.8 && c[1] > 0.9 ? [1, 0.8, 0.15] : [0.95, 0.6, 0.1], [x, y, z - 1]);
    }
  },
  // fern: arching fronds, each a tapering strip of four segments
  fern(B, m, C) {
    B.mat = MT.LEAF; const FC = C.pick(m.color);
    for (let k = 0; k < m.fronds; k++) { const a = k * 1.2566 + 0.4 * hash2(k, 1, 113), L0 = 0.75 + 0.3 * hash2(k, 2, 113), ca = Math.cos(a), sa = Math.sin(a), H0 = 0.5 + 0.2 * hash2(k, 4, 113), col = mul(FC, 0.85 + 0.3 * hash2(k, 3, 113));
      const P = t => [ca * L0 * t, sa * L0 * t, H0 * Math.sin(t * 2.5)], W = t => 0.02 + 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.05));
      for (let s = 0; s < 4; s++) { const p0 = P(s / 4), p1 = P((s + 1) / 4), w0 = W(s / 4), w1 = W((s + 1) / 4);
        B.quad([p0[0] - sa * w0, p0[1] + ca * w0, p0[2]], [p0[0] + sa * w0, p0[1] - ca * w0, p0[2]], [p1[0] + sa * w1, p1[1] - ca * w1, p1[2]], [p1[0] - sa * w1, p1[1] + ca * w1, p1[2]], col, [p0[0], p0[1], p0[2] - 1]); } }
  },
  // bush: leafy lumps [x, y, z, radius]
  bush(B, m, C) {
    B.mat = MT.LEAF; const BC = C.pick(m.color);
    const bcol = s => (i, j) => mul(BC, 0.75 + 0.45 * hash2(i + s, j, 116)), lump = s => (i, j) => 0.7 + 0.5 * hash2(i + s, j, 115);
    m.lumps.forEach(([x, y, z, r], k) => B.blob([x, y, z], r, r * 0.95, r * 0.85, 3, 5, bcol(k * 3), lump(k * 4), k));
  },
  // heath: a low leafy cushion with small tufts of flowers (or berries) dotted over its top
  heath(B, m, C) {
    B.mat = MT.LEAF; const HC = C.pick(m.color), HF = C.pick(m.tops), rx = 0.5, ry = 0.44, rz = 0.24;
    B.blob([0, 0, 0.02], rx, ry, rz, 4, 8, (i, j) => mul(HC, 0.8 + 0.35 * hash2(i, j, 117)), (i, j) => 0.9 + 0.2 * hash2(i, j, 118));
    B.mat = MT.CLOTH;
    for (let k = 0; k < 16; k++) {   // small blooms scattered over the top, each one triangle at its own turn and size, just proud of the leaves
      const a = k * 2.399 + hash2(k, 1, 121), s = 0.08 + 0.6 * Math.sqrt((k + 0.5) / 16), x = Math.cos(a) * s * rx, y = Math.sin(a) * s * ry, w = hash2(k, 4, 121) * 6.2832;
      const z = 0.02 + rz * Math.sqrt(1 - s * s) * 1.08 + 0.008, r = 0.022 + 0.022 * hash2(k, 2, 121), c = mul(HF, 0.8 + 0.35 * hash2(k, 3, 121));
      B.tri(...[0, 1, 2].map(q => [x + Math.cos(w + q * 2.0944) * r, y + Math.sin(w + q * 2.0944) * r, z]), c, [x, y, z - 1]);
    }
  },
  // moss: a flat lumpy cushion, half sunk into the ground
  moss(B, m, C) {
    B.mat = MT.LEAF; const MC = C.pick(m.color);
    B.blob([0, 0, 0], 0.55, 0.45, 0.13, 2, 8, (i, j) => mul(MC, 0.85 + 0.3 * hash2(i, j, 119)), (i, j) => 0.75 + 0.4 * hash2(i, j, 120));
  },
};
// one triangle leaning out along a (grass blades, flower leaves)
function blade(B, bx, by, a, lean, top, w, col) { const px = -Math.sin(a) * w, py = Math.cos(a) * w;
  B.tri([bx - px, by - py, -0.03], [bx + px, by + py, -0.03], [bx + Math.cos(a) * lean, by + Math.sin(a) * lean, top], col, [bx - Math.cos(a), by - Math.sin(a), 0]); }
// Shading baked into a mesh's colours (mesh.shade): height (darker low down: base + range * (z - from) / over), facing (lit
// side up), leafUp (leaves facing the sky), ground (land cover: darker at the roots, normals tipped up so thin blades light
// like the ground); grain: fallen timber's bark runs along the log.
function shadePlant(B, S) {
  for (let v = 0; v < B.v.length; v += VS) {
    const z = B.v[v + 2], mat = B.v[v + 9];
    if (S.by === 'ground') {
      if (mat === MT.LEAF) { const s = S.root[0] + S.root[1] * clamp(z / S.top, 0, 1); for (let q = 6; q < 9; q++) B.v[v + q] *= s; }
      const up = S.up, nx = B.v[v + 3] * (1 - up), ny = B.v[v + 4] * (1 - up), nz = Math.abs(B.v[v + 5]) * (1 - up) + up, l = Math.hypot(nx, ny, nz) || 1; B.v[v + 3] = nx / l; B.v[v + 4] = ny / l; B.v[v + 5] = nz / l;
      continue;
    }
    const shade = S.by === 'height' ? S.base + S.range * clamp((z - (S.from || 0)) / (S.over || 1), 0, 1) : S.by === 'facing' ? S.base + S.range * clamp(B.v[v + 5] * 0.5 + 0.5, 0, 1)
      : S.by === 'leafUp' ? (mat === MT.LEAF ? S.base + S.range * Math.max(0, B.v[v + 5]) : 1) : 1;
    for (let q = 6; q < 9; q++) B.v[v + q] *= shade;
    if (S.grain && mat === MT.BARK) B.v[v + 9] = MT.BARK + 0.1;   // BARK + .1 selects local x as the grain axis (fallen timber only)
  }
}
// every plant mesh, by name, for this climate: { reed: Float32Array, … }
function waterMeshes() {
  const C = { ground: MATS[PLAIN].col, pick: c => c && !Array.isArray(c) ? c[CLIMATE.key] : c }, out = {};
  for (const P of Object.values(PLANTS)) {
    const M = P.mesh, B = meshBuilder(), m = {};
    for (const k in M) m[k] = M[k] === 'ground' ? C.ground : M[k];
    PLANT_BUILDERS[M.builder](B, m, C);
    if (M.shade) shadePlant(B, M.shade);
    out[P.id] = new Float32Array(B.v);
  }
  return out;
}
