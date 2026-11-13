'use strict';
// The island's water system, built once at load (buildIsland): the terrain grid, basins filled to their spill points, flow
// accumulation, dug lakes, lakes and ponds, creek and river chains with levels, widths, pools and rapids; bil/inGrid read the grid.
let ISL = null;
function buildIsland(diagnostics = false) {
  const t0 = performance.now(), C = 12, half = Math.ceil(CONFIG.islandSize * 0.75 / C) * C, N = Math.round(half * 2 / C) + 1, NN = N * N, ox = -half, oy = -half;
  const H = new Float32Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ox + i * C, y = oy + j * C, base = islandBase(x, y);
    const g = glacierAt(x, y); let h = base + g * (base > WLW - 2 ? 6 : 0);
    if (GLAC_TIDE && base <= WLW - 2) h = Math.max(h, base + (WLW + GLAC_TIDE - base) * sstep(0.5, 0.8, g));   // tidewater: ice standing out of the sea, ending in a cliff
    H[j * N + i] = h;
  }
  const D8 = [-1, 1, -N, N, -N - 1, -N + 1, N - 1, N + 1];
  // priority flood from the map edge (the open sea): fills every basin to its spill point and records, for each
  // cell, the cell it drains into. Then flow accumulation in reverse order: how much land drains through each cell.
  const drain = () => {
    const F = new Float32Array(NN), rec = new Int32Array(NN).fill(-1), order = new Int32Array(NN), done = new Uint8Array(NN), heap = new Int32Array(NN);
    let hn = 0, n = 0;
    const push = c => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (F[heap[p]] <= F[c]) break; heap[k] = heap[p]; k = p; } heap[k] = c; };
    const pop = () => { const top = heap[0], last = heap[--hn]; let k = 0; for (;;) { let l = 2 * k + 1; if (l >= hn) break; if (l + 1 < hn && F[heap[l + 1]] < F[heap[l]]) l++; if (F[heap[l]] >= F[last]) break; heap[k] = heap[l]; k = l; } if (hn) heap[k] = last; return top; };
    for (let i = 0; i < N; i++) for (const c of [i, (N - 1) * N + i, i * N, i * N + N - 1]) if (!done[c]) { done[c] = 1; F[c] = H[c]; push(c); }
    while (hn) {
      const c = pop(), ci = c % N; order[n++] = c;
      for (const d of D8) { const m = c + d; if (m < 0 || m >= NN || done[m] || Math.abs(m % N - ci) > 1) continue; done[m] = 1; F[m] = Math.max(H[m], F[c] + 1e-4); rec[m] = c; push(m); }
    }
    // Flooding establishes spill elevations; route actual runoff down the steepest
    // slope, rather than along whichever neighbour the heap happened to visit first.
    for (let c = 0; c < NN; c++) {
      const ci = c % N; let slope = 0;
      for (let k = 0; k < D8.length; k++) {
        const m = c + D8[k];
        if (m < 0 || m >= NN || Math.abs(m % N - ci) > 1) continue;
        const drop = (F[c] - F[m]) / (k < 4 ? 1 : Math.SQRT2);
        if (drop > slope) { slope = drop; rec[c] = m; }
      }
    }
    const acc = new Float32Array(NN);
    for (let c = 0; c < NN; c++) acc[c] = H[c] > WLW ? 1 : 0;
    for (let k = n - 1; k > 0; k--) { const c = order[k]; if (rec[c] >= 0) acc[rec[c]] += acc[c]; }
    return { F, rec, acc };
  };
  const cellKm2 = C * C / 1e6, Ac = CONFIG.creekAreaKm2 / cellKm2, Ar = CONFIG.riverAreaKm2 * LAYOUT.riverK / cellKm2, rng = mulberry32((SEED ^ 0x1a4e5) >>> 0);
  // Choose springs in a real summit catchment. Their routes already follow the
  // terrain and merge downstream; never draw straight cuts towards invented joins.
  const L = LAYOUT;
  let R = drain(), summit = 0;
  for (let c = 0; c < NN; c++) if (H[c] > H[summit]) summit = c;
  const px = ox + summit % N * C, py = oy + Math.floor(summit / N) * C;
  const headwaterCount = 3 + Math.floor(rng() * 4);
  const headwaters = drainage => {
    const groups = new Map(), { rec, F } = drainage;
    const radius = Math.ceil(L.pr * 0.8 / C), sx = summit % N, sy = Math.floor(summit / N);
    for (let y = Math.max(1, sy - radius); y < Math.min(N - 1, sy + radius); y += 4) {
      for (let x = Math.max(1, sx - radius); x < Math.min(N - 1, sx + radius); x += 4) {
        const c = y * N + x, d = Math.hypot(x - sx, y - sy) * C;
        if (d < L.pr * 0.14 || d > L.pr * 0.8 || H[c] < WLW + (H[summit] - WLW) * 0.38 || F[c] - H[c] > 0.3) continue;
        const path = []; let m = c;
        while (m >= 0 && F[m] > WLW + 0.05) { path.push(m); m = rec[m]; }
        if (path.length < 20) continue;
        const outlet = path[path.length - 1];
        if (!groups.has(outlet)) groups.set(outlet, []);
        groups.get(outlet).push({ c, path, score: H[c] + 5 * hash2(x, y, SEED + 831) });
      }
    }
    let best = [], bestScore = -Infinity;
    for (const candidates of groups.values()) {
      candidates.sort((a, b) => b.score - a.score);
      const chosen = [], occupied = new Set();
      for (const candidate of candidates) {
        if (chosen.length >= headwaterCount) break;
        if (chosen.some(p => Math.hypot(p.c % N - candidate.c % N, Math.floor(p.c / N) - Math.floor(candidate.c / N)) * C < 130)) continue;
        // Leave a meaningful independent reach before each tributary joins.
        const join = candidate.path.findIndex(c => occupied.has(c));
        if (join >= 0 && join * C < 120 || chosen.some(p => candidate.path.includes(p.c))) continue;
        chosen.push(candidate); for (const c of candidate.path) occupied.add(c);
      }
      const score = (chosen.length >= 3 ? 1000 : 0) + (chosen[0]?.score ?? 0) + chosen.length * 4;
      if (score > bestScore) { best = chosen; bestScore = score; }
    }
    return best;
  };
  const initialHeads = headwaters(R);
  // Spread lake basins across inland lowlands, including hollows off the main river.
  const cand = [];
  for (let c = 0; c < NN; c++) if (H[c] > WLW + 8 && H[c] < hW(0.62) && R.acc[c] < Ar * 2) {
    const x = c % N, y = (c / N) | 0, reach = Math.ceil(300 * LAYOUT.lakeK / C);
    if (x < reach || y < reach || x >= N - reach || y >= N - reach) continue;
    // A lake needs a broad, gentle site, not a dam cut across a steep hillside.
    let lo = H[c], hi = H[c];
    for (const [dx, dy] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
      const h = H[c + dy * N + dx]; lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (lo > WLW + 3 && hi - lo < 14 && Math.hypot(ox + x * C - px, oy + y * C - py) > L.pr * 1.3) cand.push(c);
  }
  for (let k = cand.length - 1; k > 0; k--) { const j = rng() * (k + 1) | 0; [cand[k], cand[j]] = [cand[j], cand[k]]; }
  const glacialSites = CLIMATE.key === 'arctic' ? initialHeads.filter((_, i) => i === 0 || i === initialHeads.length - 1).map(({ path }) => path[Math.min(path.length - 1, Math.floor(L.pr * 0.3 / C))]) : [];
  const sites = [];
  for (const c of [...glacialSites, ...cand]) {
    if (sites.length >= CONFIG.lakes) break;
    const glacial = glacialSites.includes(c);
    const x = c % N, y = (c / N) | 0; if (sites.some(s => Math.hypot(s[0] - x, s[1] - y) * C < (glacial ? 240 : 950))) continue;
    sites.push([x, y]);
    const r = (glacial ? 85 + 25 * rng() : (55 + 95 * rng()) * LAYOUT.lakeK) / C, depth = 5 + 5 * rng(), hc = H[c], reach = Math.ceil(r * 1.5);
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const m = yy * N + xx, d = Math.hypot(dx, dy) * (1 + 0.3 * nW(xx * 1.6 / r + c % 977, yy * 1.6 / r));   // irregular shore: a few lobes, whatever the size
      H[m] += (hc - H[m]) * sstep(r * 1.45, r * 0.6, d);              // a level valley floor (with a natural dam downstream)
      const u = Math.max(0, 1 - (d / r) ** 2); H[m] -= depth * u * u;   // and the bowl
    }
  }
  R = drain();
  const { F, rec, acc } = R;
  const heads = headwaters(R), sources = heads.map(h => h.c);
  // Perennial springs (meltwater on arctic maps) need no large catchment at the summit.
  for (const source of sources) for (let c = source; c >= 0 && F[c] > WLW; c = rec[c]) acc[c] += Ac;

  // lakes and ponds: every basin the flood filled, if big and deep enough; beds are deepened a little
  const lakeId = new Int16Array(NN).fill(-1), lakes = [], seen = new Uint8Array(NN);
  for (let c0 = 0; c0 < NN; c0++) {
    if (seen[c0] || F[c0] - H[c0] < 0.35 || F[c0] < WLW + 0.3) continue;
    const comp = [c0]; seen[c0] = 1;
    for (let q = 0; q < comp.length; q++) { const c = comp[q], ci = c % N; for (const d of [-1, 1, -N, N]) { const m = c + d; if (m < 0 || m >= NN || seen[m] || Math.abs(m % N - ci) > 1 || F[m] - H[m] < 0.35 || Math.abs(F[m] - F[c0]) > 0.08) continue; seen[m] = 1; comp.push(m); } }
    let lev = 0, maxD = 0, sx = 0, sy = 0; for (const c of comp) { lev = Math.max(lev, F[c]); maxD = Math.max(maxD, F[c] - H[c]); sx += c % N; sy += (c / N) | 0; }
    if (comp.length < 5 || maxD < 0.8) continue;
    // big accidental basins (not dug as lakes) silt up instead: a flat valley floor the river runs across
    if (comp.length * C * C > CONFIG.maxNaturalLakeM2 && !comp.some(c => sites.some(s => Math.abs(s[0] - c % N) + Math.abs(s[1] - ((c / N) | 0)) < 3))) { for (const c of comp) H[c] = F[c] - 0.05; continue; }
    const id = lakes.length, pond = comp.length * C * C < CONFIG.pondMaxM2, hh = hash2(id, comp.length, SEED + 41);
    const glacial = CLIMATE.key === 'arctic' && comp.some(c => glacialSites.includes(c));
    const L = { glacial, id: 'lake' + id, idx: id, kind: pond ? POND : LAKE, pond, lev, area: comp.length * C * C, cx: ox + sx / comp.length * C, cy: oy + sy / comp.length * C,
      name: pond ? pick(POND_NAMES, hh) + ' Pond' : hh < 0.5 ? 'Lake ' + pick(LAKE_NAMES, hash2(id, 7, SEED)) : pick(LAKE_NAMES, hash2(id, 7, SEED)) + ' Lake' };
    if (glacial) L.name = pick(LAKE_NAMES, hh) + ' Glacier Lake';
    lakes.push(L);
    for (const c of comp) { lakeId[c] = id; H[c] = lev - clamp((lev - H[c]) * (pond ? 1.2 : 1.45), 0.6, pond ? 3 : 12); }   // deepen beds a little, to at most 12 m (ponds 3 m)
  }
  const lakeNear = new Int16Array(NN).fill(-1);   // lakes grown by one cell: the whole shore belongs to the lake
  for (let c = 0; c < NN; c++) if (lakeId[c] >= 0) { const ci = c % N; lakeNear[c] = lakeId[c]; for (const d of D8) { const m = c + d; if (m >= 0 && m < NN && Math.abs(m % N - ci) <= 1 && lakeNear[m] < 0) lakeNear[m] = lakeId[c]; } }
  // channels: wherever enough land drains through a cell (outside lakes and the sea)
  const chan = new Uint8Array(NN), isSea = c => F[c] < WLW + 0.05;
  // hollows that didn't become lakes silt up to just above their flood level: otherwise water standing a few centimetres
  // deep outside a lake's one-cell shore ring has no level of its own, and the lake's surface stops at a hard grid edge
  for (let c = 0; c < NN; c++) if (lakeId[c] < 0 && !isSea(c) && H[c] < F[c] + 0.05) H[c] = F[c] + 0.05;
  const floor = new Float32Array(NN); for (let c = 0; c < NN; c++) floor[c] = lakeId[c] >= 0 || isSea(c) ? H[c] : F[c] + 0.05;   // and the fine bumps may not dig below it either (landH)
  for (let c = 0; c < NN; c++) if (acc[c] >= Ac && lakeId[c] < 0 && !isSea(c) && CONFIG.creeks || (acc[c] >= Ar && lakeId[c] < 0 && !isSea(c) && CONFIG.rivers)) chan[c] = 1;
  const nDon = new Int32Array(NN + 1);
  for (let c = 0; c < NN; c++) if (rec[c] >= 0 && (chan[c] || lakeId[c] >= 0)) nDon[rec[c] + 1]++;
  for (let c = 0; c < NN; c++) nDon[c + 1] += nDon[c];
  const don = new Int32Array(nDon[NN]), fill = nDon.slice(0, NN);
  for (let c = 0; c < NN; c++) if (rec[c] >= 0 && (chan[c] || lakeId[c] >= 0)) don[fill[rec[c]]++] = c;
  // chains: from each outlet walk upstream along the biggest branch (the main stem); side branches become their own
  // chains that end where they join. Each chain is a list of cells, head first.
  const chains = [], work = [];
  // every cell's biggest upstream neighbour, for running a creek's head back up to its spring
  const upBest = new Int32Array(NN).fill(-1);
  for (let c = 0; c < NN; c++) { const r = rec[c]; if (r >= 0 && (upBest[r] < 0 || acc[c] > acc[upBest[r]])) upBest[r] = c; }
  const springWet = [];
  for (let c = 0; c < NN; c++) if (chan[c] && (rec[c] < 0 || !chan[rec[c]])) work.push({ c, end: rec[c], parent: -1, sys: c });
  while (work.length) {
    const wk = work.pop(), cells = [wk.c], id = chains.length; let cur = wk.c, src = -1;
    for (;;) {
      let best = -1, ba = -1;
      for (let k = nDon[cur]; k < nDon[cur + 1]; k++) { const m = don[k]; if (chan[m] && acc[m] > ba) { ba = acc[m]; best = m; } else if (!chan[m] && lakeId[m] >= 0) src = m; }
      for (let k = nDon[cur]; k < nDon[cur + 1]; k++) { const m = don[k]; if (chan[m] && m !== best) work.push({ c: m, end: cur, parent: id, sys: wk.sys }); }
      if (best < 0) break; cells.push(best); cur = best; src = -1;
    }
    // a creek doesn't start full-size: follow the head up its gully, narrowing, to a spring (lake outlets excepted)
    let ext = 0;
    if (src < 0) for (let m = upBest[cur]; m >= 0 && ext < 14 && acc[m] >= Ac * 0.15 && lakeId[m] < 0 && !chan[m]; m = upBest[m]) { cells.push(m); springWet.push(m); ext++; }
    cells.reverse(); if (src >= 0) cells.unshift(src); if (wk.end >= 0) cells.push(wk.end);   // starts in a lake (outlet) or a spring, ends at a junction, lake or the sea
    chains.push({ id, cells, parent: wk.parent, sys: wk.sys, ext });
  }
  // chain geometry: smoothed polylines carrying water level (never rising downstream), half-width and depth
  const seg = [], segK = [], segC = [], segR = [], chainName = [], sysRiver = new Set(), cellLev = new Float32Array(NN).fill(NaN), springs = [];
  const junctions = new Set(chains.filter(ch => ch.parent >= 0).map(ch => ch.cells[ch.cells.length - 1]));
  for (const ch of chains) if (ch.cells.some(c => acc[c] >= Ar)) sysRiver.add(ch.sys);
  for (const ch of chains) {
    let P = ch.cells.map(c => {
      const km2 = acc[c] * cellKm2, inLake = lakeId[c] >= 0, sea = isSea(c);
      const rk = sstep(Ar, Ar * 2.5, acc[c]), cw = clamp(1.2 + 3.8 * Math.sqrt(km2), 1.2, 15), rw = clamp(5 + 6 * Math.sqrt(km2), 5, 24);   // half-widths: a creek's, a river's (a kayak needs room)
      return [ox + (c % N) * C, oy + ((c / N) | 0) * C, inLake ? lakes[lakeId[c]].lev : sea ? WLW : F[c] - 0.35, cw + (rw - cw) * rk, acc[c] >= Ar ? Math.min(4.5, 2 + 1.3 * Math.sqrt(km2)) : 0.45 + 0.6 * Math.sqrt(km2), acc[c] >= Ar ? 1 : 0];
    });
    // the spring end: a small seep pool, then a trickle widening to where the creek proper begins
    const ext = ch.ext || (sources.includes(ch.cells[0]) ? Math.min(8, P.length - 1) : 0), hd = P[ext] || P[0];
    for (let i = 0; i < ext; i++) { const t = (i + 1) / (ext + 1); P[i][2] = F[ch.cells[i]] - 0.08 - 0.27 * t; P[i][3] = 0.7 + (hd[3] - 0.7) * t * t; P[i][4] = 0.16 + (hd[4] - 0.16) * t; P[i][5] = 0; }
    if (ext) { P[0][3] = 2.6; P[0][4] = 0.95; P[1][3] = Math.max(P[1][3], 2.1); P[1][4] = Math.max(P[1][4], 0.7); }
    const last = ch.cells[ch.cells.length - 1]; if (!isNaN(cellLev[last]) && lakeId[last] < 0) P[P.length - 1][2] = cellLev[last];   // meet the (stepped) parent stream at its own level
    for (let i = 1; i < P.length; i++) { P[i][2] = Math.max(WLW, Math.min(P[i][2], P[i - 1][2])); if (lakeId[ch.cells[i]] >= 0 || isSea(ch.cells[i])) { P[i][3] = P[i - 1][3]; P[i][4] = P[i - 1][4]; P[i][5] = P[i - 1][5]; } }
    // pools and riffles: on a falling stretch the surface holds level through a pool, then drops all at once in a
    // short rapid (levels only ever go down, so the water stays inside its carved banks)
    { const n = P.length, i0 = lakeId[ch.cells[0]] >= 0 ? 1 : 0, i1 = n - 1;
      let a = i0;
      while (a < i1) {
        const Lc = clamp(P[a][3] * 16, 48, 130); let e = a, d = 0;
        while (e + 1 < i1 && d < Lc && P[a][2] - P[e + 1][2] < 2.2) { d += Math.hypot(P[e + 1][0] - P[e][0], P[e + 1][1] - P[e][1]); e++; }
        if (P[a][2] - P[e][2] > 0.3) for (let i = a; i <= e; i++) P[i][2] = P[e][2];
        a = e + 1;
      }
      for (let i = 0; i < n; i++) if (lakeId[ch.cells[i]] < 0 && !isSea(ch.cells[i])) cellLev[ch.cells[i]] = P[i][2];
    }
    const anchors = P.filter((p, i) => i === 0 || i === P.length - 1 || junctions.has(ch.cells[i]));
    const fixed = new Set(anchors);
    for (let it = 0; it < 3; it++) { // Preserve confluences as well as the ends.
      const Q = [P[0]];
      for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; Q.push(a.map((v, k) => v * 0.75 + b[k] * 0.25), a.map((v, k) => v * 0.25 + b[k] * 0.75));
        if (i + 1 < P.length - 1 && fixed.has(b)) Q.push(b); }
      Q.push(P[P.length - 1]); P = Q;
    }
    const smooth = P.map(p => p.slice());
    for (let i = 1; i < P.length - 1; i++) { // a meander, and a width that narrows and widens along the way (both in step with the stream's size)
      const a = smooth[i - 1], b = smooth[i + 1], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1, w = P[i][3], o = nW(P[i][0] / (60 + w * 6), P[i][1] / (60 + w * 6)) * (C * 0.45 + w * 1.2);
      let taper = 1;
      for (const anchor of anchors) taper = Math.min(taper, sstep(0, 80, Math.hypot(smooth[i][0] - anchor[0], smooth[i][1] - anchor[1])));
      P[i][0] += -ty / l * o * taper; P[i][1] += tx / l * o * taper; P[i][3] = w * (0.85 + 0.45 * (nW(P[i][0] / (40 + w * 5) + 3.3, P[i][1] / (40 + w * 5) - 1.1) + 0.5));
    }
    // rapids: where the surface drops steeply; whitewater carries on a little way below the drop
    const raw = [], R = [];
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; raw.push(sstep(0.06, 0.18, (a[2] - b[2]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-3))); }
    for (let i = 0; i < raw.length; i++) { let m = 0; for (let j = Math.max(0, i - 7); j <= Math.min(raw.length - 1, i + 2); j++) m = Math.max(m, raw[j] * (j > i ? 0.7 : 1 - (i - j) * 0.07)); R.push(m); }
    for (let i = 1; i < P.length - 1; i++) P[i][4] *= 1 - 0.35 * Math.max(R[i - 1], R[i]);   // rapids run shallow over a rocky bed
    if (ext) { const dx = P[0][0] - P[1][0], dy = P[0][1] - P[1][1], l = Math.hypot(dx, dy) || 1; springs.push({ x: P[0][0], y: P[0][1], ux: dx / l, uy: dy / l, h: hash2(ch.id, 17, SEED), chain: ch.id }); }
    const river = P.some(p => p[5] > 0.5);
    chainName[ch.id] = river ? 'River ' + pick(RIVER_NAMES, hash2(ch.sys % 9973, (ch.sys / 9973) | 0, SEED + 5)) : pick(CREEK_NAMES, hash2(ch.id, 3, SEED + 6)) + ' Creek';
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; seg.push(a[0], a[1], b[0], b[1], a[2], b[2], a[3], b[3], a[4], b[4]); segK.push(b[5] > 0.5 ? RIVER : CREEK); segC.push(ch.id); segR.push(R[i]); }
  }
  const SEG = new Float32Array(seg), NS = segK.length, B = 48, buckets = new Map();
  for (let s = 0; s < NS; s++) {
    const o = s * 10, reach = Math.max(SEG[o + 6], SEG[o + 7]) + 46;
    for (let by = Math.floor((Math.min(SEG[o + 1], SEG[o + 3]) - reach) / B); by <= Math.floor((Math.max(SEG[o + 1], SEG[o + 3]) + reach) / B); by++)
      for (let bx = Math.floor((Math.min(SEG[o], SEG[o + 2]) - reach) / B); bx <= Math.floor((Math.max(SEG[o], SEG[o + 2]) + reach) / B); bx++) {
        const k = bx * 100003 + by; let l = buckets.get(k); if (!l) buckets.set(k, l = []); l.push(s);
      }
  }
  // "wetness": 1 on water, fading over ~40 m — keeps small terrain bumps off the shores
  const wet = new Float32Array(NN);
  for (let c = 0; c < NN; c++) if (lakeId[c] >= 0 || chan[c]) wet[c] = 1;
  for (const c of springWet) wet[c] = 1;
  for (let pass = 0; pass < 4; pass++) { const was = wet.slice(); for (let c = 0; c < NN; c++) { const ci = c % N; let m = was[c]; for (const d of [-1, 1, -N, N]) { const q = c + d; if (q >= 0 && q < NN && Math.abs(q % N - ci) <= 1) m = Math.max(m, was[q] * 0.65); } wet[c] = m; } }   // read last pass's values: spreads the same way on every side
  ISL = { N, C, ox, oy, H, floor, lakeId, lakeNear, lakes, wet, SEG, segK: Uint8Array.from(segK), segC: Int32Array.from(segC), segR: Float32Array.from(segR), springs, chains, chainName, buckets, B, sources, summit,
    stats: { ms: Math.round(performance.now() - t0), lakes: lakes.filter(l => !l.pond).length, ponds: lakes.filter(l => l.pond).length, chains: chains.length,
      rivers: new Set(chains.filter((c, i) => chainName[i].startsWith('River')).map(c => c.sys)).size, creeks: chainName.filter(n => n.endsWith('Creek')).length, segments: NS, rapidsM: Math.round(segR.reduce((a, r, s) => a + (r > 0.4 ? Math.hypot(SEG[s * 10 + 2] - SEG[s * 10], SEG[s * 10 + 3] - SEG[s * 10 + 1]) : 0), 0)) } };
  if (diagnostics) ISL.drainage = { F, rec, acc, sites, sourcePaths: heads.map(h => h.path) };
  return ISL;
}
const bil = (A, x, y) => { const I = ISL, gx = (x - I.ox) / I.C, gy = (y - I.oy) / I.C, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, k = j * I.N + i;
  return (A[k] * (1 - fx) + A[k + 1] * fx) * (1 - fy) + (A[k + I.N] * (1 - fx) + A[k + I.N + 1] * fx) * fy; };
const inGrid = (x, y) => { const I = ISL, gx = (x - I.ox) / I.C, gy = (y - I.oy) / I.C; return gx >= 0 && gy >= 0 && gx < I.N - 1 && gy < I.N - 1; };
