'use strict';
// Tree models (pine, oak, maple, birch, palm) and TREE_KINDS.
// Trees (model units: ~1 tall, scaled per instance). Leaves use the foliage material, trunks bark; tops sway in the wind.
function treeMeshes() {
  const jc = (c, k, a) => { const t = 1 + (hash2(k, a, 77) - 0.5) * 0.10; return [c[0] * t, c[1] * t, c[2] * t]; };
  // pine: tapered trunk + six drooping tiers with ragged rims
  const pine = meshBuilder();
  pine.mat = MT.BARK; pine.tube([0, 0, -0.05], [0, 0, 0.6], 0.042, 0.018, 6, [0.36, 0.24, 0.14]);
  pine.mat = MT.LEAF;
  for (let t = 0; t < 6; t++) {
    const z0 = 0.16 + t * 0.13, z1 = t === 5 ? 1.03 : z0 + 0.3, r = 0.31 * (1 - t / 6.6) + 0.035, n = 10, ph = t * 0.7;
    const col = [0.10 + 0.014 * t, 0.25 + 0.022 * t, 0.15 + 0.012 * t], ox = 0.028 * Math.sin(t * 1.7), oy = 0.022 * Math.cos(t * 2.3);
    const rim = k => { const j = k % n, a = j / n * Math.PI * 2 + ph, rr = r * (j % 2 ? 0.58 : 1.06) * (0.78 + 0.35 * hash2(t, j, 5)); return [ox + Math.cos(a) * rr, oy + Math.sin(a) * rr, z0 - (j % 2 ? 0 : 0.035 + 0.04 * hash2(j, t, 8))]; };
    for (let k = 0; k < n; k++) {
      pine.tri(rim(k), rim(k + 1), [ox * 0.5, oy * 0.5, z1], jc(col, t * 20 + k, 1), [0, 0, z0 - 0.1]);
      pine.tri(rim(k), rim(k + 1), [0, 0, z0 + 0.06], jc(col.map(c => c * 0.6), t * 20 + k, 2), [0, 0, z1]);
    }
  }
  // Deciduous trees grow as branching structures: a trunk forks into limbs, branches and twigs, with a clump of leaves
  // on each twig. Leaves use material 17 (oak), 18 (maple) or 19 (birch) plus cluster/25: the shader colours them by
  // season and drops them clump by clump in autumn, leaving the bare branches for winter.
  const tilt = (d, el, az) => { const a = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], X = norm3(cross3(a, d)), Y = cross3(d, X), ce = Math.cos(el), se = Math.sin(el);
    return [d[0] * ce + (X[0] * Math.cos(az) + Y[0] * Math.sin(az)) * se, d[1] * ce + (X[1] * Math.cos(az) + Y[1] * Math.sin(az)) * se, d[2] * ce + (X[2] * Math.cos(az) + Y[2] * Math.sin(az)) * se]; };
  const SPECIES = {
    oak:   { mat: 17, seed: 101, trunk: 0.3, rad: 0.05, limbs: 3, fork: 2, depth: 3, angle: [0.95, 0.75, 0.65], up: 0.12, shrink: 0.66, len: 0.3, cl: 0.12, bark: [0.33, 0.27, 0.2], leaf: [0.2, 0.42, 0.13] },
    maple: { mat: 18, seed: 202, trunk: 0.34, rad: 0.042, limbs: 3, fork: 2, depth: 3, angle: [0.6, 0.6, 0.55], up: 0.25, shrink: 0.68, len: 0.28, cl: 0.115, bark: [0.4, 0.36, 0.31], leaf: [0.24, 0.48, 0.15] },
    birch: { mat: 19, seed: 303, trunk: 0.5, rad: 0.026, limbs: 3, fork: 2, depth: 3, angle: [0.45, 0.55, 0.7], up: -0.05, shrink: 0.62, len: 0.22, cl: 0.085, bark: [0.88, 0.86, 0.8], leaf: [0.4, 0.6, 0.2] },
  };
  const decid = (sp, lod) => {
    const B = meshBuilder(true); let nc = 0;   // smooth: leaf clumps shade as rounded masses, not flat-sided blocks
    // Both detail levels follow the same skeleton. Distant clumps enclose the
    // actual twig crowns instead of growing an unrelated, shorter tree.
    const skeleton = (p, dir, len, rad, depth, key) => {
      const q = p.map((v, i) => v + dir[i] * len), node = { p, q, dir, len, rad, depth, key, children: [] };
      if (depth < sp.depth) for (let k = 0, n = depth === 0 ? sp.limbs : sp.fork; k < n; k++) {
        const az = (k / n + hash2(key, k, sp.seed) * 0.25) * Math.PI * 2 + depth * 1.3;
        const d = tilt(dir, sp.angle[depth] * (0.8 + 0.4 * hash2(key, k, sp.seed + 1)), az);
        d[2] += sp.up * (depth + 1) * 0.5 - (sp.mat === 19 ? depth * 0.18 : 0);
        node.children.push(skeleton(q, norm3(d), (depth === 0 ? sp.len : len * sp.shrink) * (0.85 + 0.3 * hash2(key, k, sp.seed + 2)), rad * 0.6, depth + 1, key * 3 + k + 1));
      }
      node.r = sp.cl * (0.85 + 0.35 * hash2(key, 9, sp.seed));
      return node;
    };
    // a clump of leaves: near trees get three smaller, lumpy, offset puffs (a broken, leafy outline with gaps and
    // shade between them) instead of one ball; distant ones keep a single rounded mass
    const leaves = (p, rx, ry = rx, rz = rx * 0.8) => {
      const k = nc++, start = B.v.length; B.mat = sp.mat + (k % 24) * 0.04;
      const puff = (c, a, b, d, rings, segs, n) => B.blob(c, a, b, d, rings, segs, sp.leaf,
        (i, j) => i === 0 || i === rings ? 1 : 0.8 + 0.32 * hash2(k * 7 + i + n * 31, j, sp.seed) + 0.1 * Math.sin(j * 2.1 + k + n), hash2(k + n * 13, 3, sp.seed) * 6.2832);
      if (lod) puff(p, rx, ry, rz, 3, 4, 0);
      else for (let n = 0; n < 3; n++) {   // three puffs round the clump's centre, the top one a little higher, each its own size
        const a = (n / 3 + hash2(k, n, sp.seed + 5) * 0.2) * 6.2832, o = 0.42 + 0.12 * hash2(k, n, sp.seed + 6), sc = 0.62 + 0.14 * hash2(k, n, sp.seed + 7);
        puff([p[0] + Math.cos(a) * rx * o, p[1] + Math.sin(a) * ry * o, p[2] + rz * (n === 0 ? 0.35 : -0.12 + 0.2 * hash2(k, n, sp.seed + 8))], rx * sc, ry * sc, rz * sc * 1.05, 3, 5, n);
      }
      for (let v = start; v < B.v.length; v += VS) {
        const top = clamp((B.v[v + 2] - p[2]) / rz * 0.5 + 0.5, 0, 1);
        const outer = clamp(Math.hypot(B.v[v], B.v[v + 1]) / 0.5, 0, 1);
        const inner = clamp(Math.hypot(B.v[v] - p[0], B.v[v + 1] - p[1], B.v[v + 2] - p[2]) / Math.max(rx, rz), 0, 1);   // the puffs' facing sides, deep in the clump, sit in shade
        const light = (0.62 + 0.26 * top + 0.12 * outer) * (0.82 + 0.22 * inner);
        B.v[v + 6] *= light * (0.94 + 0.10 * top); B.v[v + 7] *= light; B.v[v + 8] *= light * 1.06;
      }
    };
    const grow = node => {
      const {p, q, rad, depth} = node, last = depth >= (lod ? 1 : sp.depth);
      B.mat = MT.BARK; B.tube(p, q, rad, rad * (last ? 0.45 : 0.72), lod ? (depth === 0 ? 4 : 3) : depth === 0 ? 6 : depth === 1 ? 5 : 3, sp.bark.map(v => v * (sp.mat === 19 && depth > 1 ? 0.55 : 1)));
      if (last) {
        if (!lod) leaves(q, node.r);
        else {
          const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
          const bounds = n => { if (n.children.length) n.children.forEach(bounds); else for (let i = 0; i < 3; i++) {
            const r = n.r * (i === 2 ? 0.8 : 1); lo[i] = Math.min(lo[i], n.q[i] - r); hi[i] = Math.max(hi[i], n.q[i] + r);
          } }; bounds(node);
          leaves(lo.map((v, i) => (v + hi[i]) * 0.5), (hi[0] - lo[0]) * 0.54, (hi[1] - lo[1]) * 0.54, (hi[2] - lo[2]) * 0.54);
        }
        return;
      }
      node.children.forEach(grow);
      if (depth === 1) leaves(p.map((v, i) => v + (q[i] - v) * 0.8 + (i === 2 ? 0.03 : 0)), sp.cl * 1.15);
    };
    grow(skeleton([0, 0, -0.05], norm3([0.045, -0.025, 1]), sp.trunk, sp.rad, 0, 1));
    if (sp.mat !== 19) leaves([0.015, -0.008, sp.trunk + sp.len * 0.95], sp.cl * 1.5);
    // Base occlusion is baked once, including the exposed winter branches.
    for (let v = 0; v < B.v.length; v += VS) if (B.v[v + 9] === MT.BARK) {
      const shade = 0.68 + 0.32 * clamp(B.v[v + 2] / 0.25, 0, 1);
      for (let q = 6; q < 9; q++) B.v[v + q] *= shade;
    }
    return B;
  };
  const oak = decid(SPECIES.oak), maple = decid(SPECIES.maple), birch = decid(SPECIES.birch);
  // palm: a leaning, curving ringed trunk with a crown of drooping fronds and a few coconuts (tropical islands)
  const palmMesh = lod => {
    const B = meshBuilder(); let p = [0, 0, -0.05], d = [0.12, 0, 1]; const segs = lod ? 4 : 8;
    B.mat = MT.BARK;
    for (let k = 0; k < segs; k++) { const t = k / segs, q = [p[0] + d[0] * 0.95 / segs, p[1], p[2] + d[2] * 0.95 / segs]; B.tube(p, q, 0.035 * (1 - 0.35 * t), 0.035 * (1 - 0.35 * (t + 1 / segs)), lod ? 5 : 6, [0.5, 0.42, 0.3].map(v => v * (k % 2 ? 0.92 : 1.05))); p = q; d = norm3([d[0] + 0.06, 0, d[2]]); }
    B.mat = MT.LEAF; const nf = lod ? 6 : 9;
    for (let k = 0; k < nf; k++) {
      const a = k / nf * 6.2832 + 0.3, ca = Math.cos(a), sa = Math.sin(a), L = 0.42 + 0.08 * hash2(k, 1, 91), n = lod ? 3 : 6;
      let prev = null;
      for (let s2 = 0; s2 <= n; s2++) { const t = s2 / n, r = L * t, z = p[2] + 0.12 * Math.sin(t * 2.6) - 0.25 * t * t, w = 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.004;
        const c = [p[0] + ca * r, p[1] + sa * r, z], l = [c[0] - sa * w, c[1] + ca * w, c[2] - 0.02], rr = [c[0] + sa * w, c[1] - ca * w, c[2] - 0.02], col = [0.2, 0.5 - 0.1 * t, 0.15];
        if (prev) { const up = [c[0], c[1], c[2] - 1], dn = [c[0], c[1], c[2] + 1], under = col.map(v => v * 0.8);   // both faces: trees are drawn with back faces culled, and a frond is open (seen from above and from below)
          B.quad(prev[0], prev[1], c, l, col, up); B.quad(prev[1], prev[2], rr, c, col, up); B.quad(prev[0], prev[1], c, l, under, dn); B.quad(prev[1], prev[2], rr, c, under, dn); }
        prev = [l, c, rr]; }
    }
    if (!lod) { B.mat = MT.GEN; for (let k = 0; k < 3; k++) B.blob([p[0] + Math.cos(k * 2.1) * 0.04, p[1] + Math.sin(k * 2.1) * 0.04, p[2] - 0.05], 0.03, 0.03, 0.034, 4, 6, [0.42, 0.32, 0.16]); }
    return B;
  };
  const palm = palmMesh(false), palmL = palmMesh(true);
  const oakL = decid(SPECIES.oak, true), mapleL = decid(SPECIES.maple, true), birchL = decid(SPECIES.birch, true);
  // distant versions: same silhouettes, a fraction of the triangles
  const pineL = meshBuilder(); pineL.mat = MT.BARK; pineL.tube([0, 0, -0.05], [0, 0, 0.5], 0.04, 0.02, 4, [0.36, 0.24, 0.14]); pineL.mat = MT.LEAF;
  for (let t = 0; t < 3; t++) { const z0 = 0.18 + t * 0.26, z1 = t === 2 ? 1.03 : z0 + 0.45, r = 0.3 * (1 - t / 3.4) + 0.04; pineL.tube([0, 0, z0 - 0.04], [0, 0, z1], r, 0.01, 7, [0.10 + 0.028 * t, 0.25 + 0.044 * t, 0.15 + 0.024 * t], true); }
  const f = M => new Float32Array(M.v);
  return { pine: f(pine), oak: f(oak), maple: f(maple), birch: f(birch), palm: f(palm), pineL: f(pineL), oakL: f(oakL), mapleL: f(mapleL), birchL: f(birchL), palmL: f(palmL) };
}
const TREE_KINDS = ['pine', 'oak', 'maple', 'birch', 'palm'];   // treeData order (deciduous after the pine; palms last)
