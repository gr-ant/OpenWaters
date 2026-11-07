'use strict';
// Engine: building one terrain chunk (ground, water surface, water plants, trees), a few rows per frame.
Object.assign(Engine, {
  // Ground cover for one chunk, made only when the player comes near (render) and dropped again far away: one hashed
  // candidate per 2 m lattice cell, its kind from the cell's material, moisture and climate. Per kind: { d: 6 floats an
  // instance, o: start of each 16 m tile }, shuffled within a tile so drawing its first part thins it evenly.
  groundGen(ch) {
    const lv = CONFIG.groundCover, out = {}; ch.groundLv = lv; if (!lv || !ch.gmat) return out;
    const AR = CLIMATE.key === 'arctic', TR = CLIMATE.key === 'tropical', TN = CHW / GROUND_TILE, TT = TN * TN;
    if (!this._gTab) { // weights by material, [grass, flowerA, flowerB, fern, bush, heath, moss] (flowers: _gFl x drift noise); +70: steep ground
      const T = this._gTab = new Float32Array(140), set = (mt, a) => { for (let q = 0; q < 7; q++) { T[mt * 7 + q] = a[q]; T[70 + mt * 7 + q] = a[q] * [0.3, 0, 0, 0.5, 0.3, 0.5, 1.3][q]; } };
      set(SAND, [0.06, 0, 0, 0, TR ? 0.015 : 0, 0, 0]); set(PLAIN, [AR ? 0.42 : TR ? 0.7 : 0.62, 0, 0, TR ? 0.04 : 0, AR ? 0.03 : 0.015, AR ? 0.1 : 0, AR ? 0.15 : 0]);
      set(FOREST, [0.22, 0, 0, TR ? 0.32 : AR ? 0.05 : 0.22, TR ? 0.07 : 0.05, AR ? 0.08 : 0.01, AR ? 0.15 : 0.06]); set(ROCK, [0.06, 0, 0, 0, 0.01, 0.03, AR ? 0.2 : 0.14]); set(ALPINE, [0.35, 0, 0, 0, 0.02, TR ? 0.05 : 0.2, 0.1]);
      this._gFl = [0, 0, 0, AR ? 0.1 : 0.42, 0.03, 0, 0.12, 0, 0, 0];
      this._gS0 = [AR ? 0.45 : TR ? 0.75 : 0.65, 0.75, 0.75, TR ? 0.9 : 0.7, TR ? 1 : AR ? 0.5 : 0.8, 0.6, 0.6]; this._gS1 = [AR ? 0.4 : 0.5, 0.5, 0.5, TR ? 0.7 : 0.6, AR ? 0.4 : 0.75, 0.6, 0.9];   // size: base + range
      this._gZ = [0.03, 0.02, 0.02, 0.03, 0.08, 0.04, 0.02];   // sunk into the ground (bush, heath: times their size)
      this._gBuf = new Float32Array(CHK * CHK * 18); this._gKt = new Uint16Array(CHK * CHK * 3);
    }
    const c = getChunk(ch.cx, ch.cy), N = CHK + 1, x0 = ch.cx * CHW, y0 = ch.cy * CHW, gm = ch.gmat, T = this._gTab, FL = this._gFl, S0 = this._gS0, S1 = this._gS1, Z = this._gZ, buf = this._gBuf, kt = this._gKt;
    const zf = new Float32Array(17 * 17), zc = new Float32Array(17 * 17);   // flower drifts and colour, sampled every 8 m
    for (let q = 0; q < 289; q++) { const x = x0 + (q % 17) * 8, y = y0 + (q / 17 | 0) * 8; zf[q] = sstep(0, 0.3, nM(x / 14 + 31, y / 14 - 7)); zc[q] = nR(x / 40, y / 40); }
    const OX = [0, 0.69, 0.23, 0.57], OY = [0, 0.62, 0.07, 0.79], cnt = new Int32Array(7 * TT), dens = lv >= 2 ? 1 : 0.45, nt = Game._noTrees.length > 0; let n = 0;   // light: fewer candidates
    for (let j = 0; j < CHK; j++) for (let i = 0; i < CHK; i++) {
      const gx = ch.cx * CHK + i, gy = ch.cy * CHK + j, hh = hash2(gx, gy, SEED + 701) * 4294967296, u = (hh >>> 16) / 65536 / dens; if (u >= 0.97) continue;   // no material's weights add up past this
      const fx = (hh & 255) / 256 + 0.002, fy = (hh >>> 8 & 255) / 256 + 0.002, k0 = j * N + i, g = gm[k0 + (fy < 0.5 ? 0 : N) + (fx < 0.5 ? 0 : 1)], mt = g & 15;
      if (mt < SAND || mt > ALPINE) continue;
      const o = (g & 16 ? 70 : 0) + mt * 7, patch = (g >> 5) / 7, x = x0 + (i + fx) * SP, y = y0 + (j + fy) * SP;
      let kd = -1, s = 0;
      for (let q = 0; q < 7; q++) { if (q === 1) q = 3;   // litter patches thin the grass, the forest's moist hollows grow ferns and moss
        s += q === 0 ? T[o] * (mt === PLAIN ? 1 - 0.45 * patch : mt === FOREST ? 1 - patch : 1) : mt === FOREST ? (q === 3 ? T[o + 3] * (0.6 + 0.6 * c[k0 * LS + 1]) : q === 6 ? T[o + 6] + 0.06 * patch : T[o + q]) : T[o + q];
        if (u < s) { kd = q; break; } }
      if (kd < 0 && FL[mt] && !(g & 16)) { // flowers in drifts, two colour families side by side (noise on an 8 m grid, bilinear)
        const bx = i / 4, by = j / 4, ix = bx | 0, iy = by | 0, ax = bx - ix, ay = by - iy, q = iy * 17 + ix, zn = (zf[q] * (1 - ax) + zf[q + 1] * ax) * (1 - ay) + (zf[q + 17] * (1 - ax) + zf[q + 18] * ax) * ay;
        s += FL[mt] * zn + 0.006; if (u < s) kd = (zc[q] * (1 - ax) + zc[q + 1] * ax) * (1 - ay) + (zc[q + 17] * (1 - ax) + zc[q + 18] * ax) * ay + (fx - 0.5) * 0.3 > (AR ? -0.25 : 0) ? 1 : 2; }
      if (kd < 0) continue;
      const a = k0 * LS, b = a + LS, cc = a + N * LS, dd = cc + LS, h00 = hW(c[a]), h10 = hW(c[b]), h01 = hW(c[cc]), h11 = hW(c[dd]), wl = Math.max(c[a + 2], c[b + 2], c[cc + 2], c[dd + 2]) + 0.1;
      const h2 = hash2(gx, gy, SEED + 705) * 4294967296, r = (h2 & 1023) / 1024, rot = (h2 >>> 10 & 1023) / 163, shade = (h2 >>> 20 & 1023) / 1024, reps = kd === 1 || kd === 2 ? 2 : kd ? 1 : mt === PLAIN ? (AR ? 2 : r > 0.5 ? 3 : 4) : mt === ALPINE ? 2 : r < 0.5 ? 2 : 1;   // grass comes in clusters of tufts
      for (let rep = 0; rep < reps; rep++) {
        let px = fx + OX[rep], py = fy + OY[rep]; if (px >= 1) px -= 1; if (py >= 1) py -= 1; const x = x0 + (i + px) * SP, y = y0 + (j + py) * SP;
        const h = px + py <= 1 ? h00 + (h10 - h00) * px + (h01 - h00) * py : h11 + (h01 - h11) * (1 - px) + (h10 - h11) * (1 - py);   // on the terrain's own triangles
        if (h < wl || (nt && Game.noTreesAt(x, y))) continue;   // out of the water, off clearings and buildings
        const sc = S0[kd] + S1[kd] * (r + OX[rep] < 1 ? r + OX[rep] : r + OX[rep] - 1), t = kd * TT + Math.min(TN - 1, (x - x0) / GROUND_TILE | 0) + Math.min(TN - 1, (y - y0) / GROUND_TILE | 0) * TN, e = n * 6;
        buf[e] = x; buf[e + 1] = y; buf[e + 2] = h - Z[kd] * (kd === 4 || kd === 5 ? sc : 1); buf[e + 3] = sc; buf[e + 4] = rot + rep * 2.3; buf[e + 5] = ((shade + rep * 0.53) % 1) * (mt === FOREST ? 0.6 : 1);
        kt[n++] = t; cnt[t]++;
      }
    }
    const d = new Float32Array(n * 6), o = new Int32Array(7 * TT + 1), at = new Int32Array(7 * TT);   // counting sort into kind x tile, all kinds in one array
    for (let t = 0, s = 0; t < 7 * TT; t++) { o[t] = at[t] = s; s += cnt[t]; } o[7 * TT] = n;
    for (let q = 0; q < n; q++) { const w = at[kt[q]]++ * 6, r = q * 6; for (let s = 0; s < 6; s++) d[w + s] = buf[r + s]; }
    let rs = (ch.cx * 7919 ^ ch.cy * 104729 ^ SEED) | 1;   // xorshift for the shuffle
    for (let t = 0; t < 7 * TT; t++) for (let q = o[t + 1] - 1; q > o[t]; q--) { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; const r = (o[t] + ((rs >>> 0) * (q - o[t] + 1) / 4294967296 | 0)) * 6, w = q * 6; for (let s = 0; s < 6; s++) { const v = d[w + s]; d[w + s] = d[r + s]; d[r + s] = v; } }   // shuffle each tile: any first part of it thins it evenly
    for (let kd = 0; kd < 7; kd++) if (o[kd * TT + TT] > o[kd * TT]) out[GROUND_KINDS[kd]] = { d, o: o.subarray(kd * TT, kd * TT + TT + 1) };   // o: absolute instance offsets per tile
    return out;
  },
  *buildChunkGen(cx, cy) {
    yield* latticeGen(cx, cy);
    const gl = this.gl, c = getChunk(cx, cy), N = CHK + 1, x0 = cx * CHW, y0 = cy * CHW;
    const H = (i, j) => { // heights for normals; just past the edge, borrow the neighbour's lattice when it's already computed
      if (i >= 0 && i < N && j >= 0 && j < N) return hW(c[(j * N + i) * LS]);
      const ncx = cx + Math.floor(i / CHK), ncy = cy + Math.floor(j / CHK), nb = cache.get((ncx + 1e6) * 2e6 + (ncy + 1e6));
      if (nb) { const li = i - (ncx - cx) * CHK, lj = j - (ncy - cy) * CHK; return hW(nb[(lj * N + li) * LS]); }
      return hW(elev(x0 + i * SP, y0 + j * SP));
    };
    const sprN = ISL ? ISL.springs.filter(sp => sp.x > x0 - 12 && sp.y > y0 - 12 && sp.x < x0 + CHW + 12 && sp.y < y0 + CHW + 12) : [];
    // terrain vertex (24 bytes): pos 3f | normal 3b + pad | colour 3ub + murk ub | water level f
    const buf = new ArrayBuffer(N * N * 24), f = new Float32Array(buf), b8 = new Int8Array(buf), u8 = new Uint8Array(buf);
    const ROCKC = [0.46, 0.43, 0.39], BED = [0.16, 0.24, 0.28], gm = new Uint8Array(N * N);
    // lake / pond / river / creek beds [shallow, deep, depth where it's fully deep] and their banks
    const BEDS = [null, [[0.62, 0.56, 0.4], [0.2, 0.21, 0.16], 5], [[0.36, 0.31, 0.2], [0.13, 0.14, 0.08], 2], [[0.5, 0.46, 0.38], [0.3, 0.3, 0.27], 3], [[0.56, 0.51, 0.43], [0.38, 0.36, 0.32], 1.5]];
    const BANKS = [null, [0.6, 0.54, 0.38], [0.3, 0.26, 0.16], [0.52, 0.48, 0.4], [0.53, 0.5, 0.43]];
    yield;
    for (let j = 0; j < N; j++) { if ((j & 3) === 3) yield; for (let i = 0; i < N; i++) {
      const k = j * N + i, e = c[k * LS], m = c[k * LS + 1], wl = c[k * LS + 2], kd = c[k * LS + 3] | 0, h = hW(e);
      const hx = (H(i + 1, j) - H(i - 1, j)) / (2 * SP), hy = (H(i, j + 1) - H(i, j - 1)) / (2 * SP), nl = 1 / Math.hypot(hx, hy, 1);
      f[k * 6] = x0 + i * SP; f[k * 6 + 1] = y0 + j * SP; f[k * 6 + 2] = h; f[k * 6 + 5] = wl;
      b8[k * 24 + 12] = -hx * nl * 127; b8[k * 24 + 13] = -hy * nl * 127; b8[k * 24 + 14] = nl * 127; u8[k * 24 + 19] = WATER[kd].murk * 255;
      const jit = 0.975 + 0.05 * hash2(cx * CHK + i, cy * CHK + j, SEED + 9), wx = x0 + i * SP, wy = y0 + j * SP;
      // blend biomes across a band with wavy edges, so boundaries aren't straight contour lines
      const wob = nR(wx / 70, wy / 70) * 0.05 + nM(wx / 15, wy / 15) * 0.015;
      // Broad grass/litter patches are baked into the existing vertex colours.
      // World coordinates keep neighbouring chunks continuous; climate palettes survive.
      const patch = sstep(-0.32, 0.38, nM(wx / 11 + 17, wy / 11 - 9)), drySand = sstep(0.2, 2.8, h - wl) * 0.09;
      let col = [0, 0, 0], snow = 0;
      for (const d of [-0.045, -0.015, 0.015, 0.045]) {
        const mt = material(Math.max(WL, e + wob + d), m + wob + d * 2, wx, wy), cc = MATS[mt].col;
        if (d === 0.015) gm[k] = mt | (nl < 0.78 ? 16 : 0) | Math.min(7, patch * 8 | 0) << 5;   // for groundGen: material, steep, litter patch
        const grass = mt === PLAIN || mt === FOREST || mt === ALPINE;
        const litter = grass ? (mt === FOREST ? 0.12 + 0.28 * patch : 0.07 + 0.19 * patch) : 0;
        const shade = grass ? 1 - 0.09 * patch : 1;
        // Dry upper beach is pale; the waterline shader supplies the wet band.
        const dry = mt === SAND ? drySand : 0, base = (1 - litter) * shade * (1 - dry) / 4, soil = litter * shade * (1 - dry) / 4;
        col[0] += cc[0] * base + 0.34 * soil + dry / 4;
        col[1] += cc[1] * base + 0.30 * soil + dry / 4;
        col[2] += cc[2] * base + 0.19 * soil + dry / 4;
        if (mt === SNOW || mt === GLACIER) snow += 0.25;
      }
      if (kd !== OCEAN && h < wl) { // inland bed: sand/mud/gravel at the edge, dark silt in the deeps; river gravel is speckled
        const B = BEDS[kd], t = Math.sqrt(clamp((wl - h) / B[2], 0, 1)), pj = kd >= RIVER ? 0.72 + 0.56 * hash2(cx * CHK + i, cy * CHK + j, SEED + 19) : 1;
        col = [(B[0][0] + (B[1][0] - B[0][0]) * t) * pj, (B[0][1] + (B[1][1] - B[0][1]) * t) * pj, (B[0][2] + (B[1][2] - B[0][2]) * t) * pj];
      } else if (e < WL) { const t = clamp((WL - e) / 0.08, 0, 1), s = MATS[SAND].col, w = CLIMATE.reefsEverywhere ? 1 : 0, bd = [BED[0] + (0.62 - BED[0]) * w, BED[1] + (0.6 - BED[1]) * w, BED[2] + (0.5 - BED[2]) * w];   // pale coral sand on the warm side
        col = [s[0] + (bd[0] - s[0]) * t * (1 - 0.5 * w), s[1] + (bd[1] - s[1]) * t * (1 - 0.5 * w), s[2] + (bd[2] - s[2]) * t * (1 - 0.5 * w)]; }
      else {
        const t = clamp((0.8 - nl) / 0.14, 0, 1) * (1 - snow); for (let q = 0; q < 3; q++) col[q] += (ROCKC[q] - col[q]) * t; // steep -> rock, gradually
        if (kd !== OCEAN && h < wl + 1.4) { const b = BANKS[kd], s = (1 - (h - wl) / 1.4) ** 1.5 * 0.85; for (let q = 0; q < 3; q++) col[q] += (b[q] - col[q]) * s; } // banks
      }
      for (const sp of sprN) { // a spring: pale welling sand in the pool, a ring of bright moss around it
        const d = Math.hypot(wx - sp.x, wy - sp.y); if (d > 7) continue;
        const sand = 1 - sstep(1.6, 2.6, d), moss = sstep(2.2, 3, d) * (1 - sstep(5, 7, d)) * (h > wl - 0.05 ? 1 : 0);
        for (let q = 0; q < 3; q++) col[q] += ([0.95, 0.9, 0.7][q] - col[q]) * sand + ([0.2, 0.42, 0.13][q] - col[q]) * moss * 0.75;
      }
      u8[k * 24 + 16] = clamp(col[0] * jit, 0, 1) * 255; u8[k * 24 + 17] = clamp(col[1] * jit, 0, 1) * 255; u8[k * 24 + 18] = clamp(col[2] * jit, 0, 1) * 255;
    } }
    const ibo = this.ibo, count = CHK * CHK * 6;
    const vbo = gl.createBuffer(), vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.BYTE, true, 24, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.UNSIGNED_BYTE, true, 24, 16);
    gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 1, gl.UNSIGNED_BYTE, true, 24, 19);
    gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 1, gl.FLOAT, false, 24, 20);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bindVertexArray(null);
    const ch = { cx, cy, vao, count, bufs: [vbo], vaos: [], treeData: [], plantData: {}, water: null, gmat: gm, ground: null };
    // ---- water surface over every cell with a corner under water, each vertex at its own level ----
    yield;
    const wet = new Uint8Array(N * N); let anyWet = false;
    for (let k = 0; k < N * N; k++) if (hW(c[k * LS]) < c[k * LS + 2] - 0.01) { wet[k] = 1; anyWet = true; }
    if (anyWet) {
      const used = new Uint8Array(N * N), idx = [];
      for (let j = 0; j < CHK; j++) for (let i = 0; i < CHK; i++) {
        const a = j * N + i;
        if (wet[a] | wet[a + 1] | wet[a + N] | wet[a + N + 1]) used[a] = used[a + 1] = used[a + N] = used[a + N + 1] = 1;
      }
      const wv = new Float32Array(N * N * 10); // pos 3 | flow 2 | depth, foam, murk, wave | kind
      for (let j = 0; j < N; j++) { if ((j & 7) === 7) yield; for (let i = 0; i < N; i++) {
        const k = j * N + i; if (!used[k]) continue;
        const h = hW(c[k * LS]), x = x0 + i * SP, y = y0 + j * SP;
        let wl = c[k * LS + 2], kd = c[k * LS + 3] | 0, foam = 0, rap = c[k * LS + 4];
        if (!wet[k]) { // dry corner: take the level of wet neighbours so the surface runs flat into the bank
          let bl = -1e9;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
            const n = jj * N + ii; if (wet[n] && c[n * LS + 2] > bl) { bl = c[n * LS + 2]; kd = c[n * LS + 3] | 0; rap = c[n * LS + 4]; }
          }
          if (bl > -1e9) wl = bl;
        } else { // rapids: foam where the surface steps between neighbours
          let g = 0;
          for (const n of [i > 0 ? k - 1 : -1, i < N - 1 ? k + 1 : -1, k - N, k + N]) if (n >= 0 && n < N * N && wet[n] && (c[n * LS + 3] | 0) === kd) g = Math.max(g, Math.abs(c[n * LS + 2] - wl));   // same water only: a pond beside the sea isn't rapids
          foam = clamp((g / SP - 0.05) * 5, 0, 1);
        }
        const fl = flowAt(x, y, kd);
        if (fl[2] > 1.6) foam = Math.max(foam, Math.min(0.6, (fl[2] - 1.6) * 0.5));
        foam = Math.max(foam, (kd === RIVER ? 0.75 : 0.55) * rap);
        let clear = 0;   // spring water: gin-clear and turquoise over its pale sand (negative murk pushes the shader past clear)
        for (const sp of sprN) { const d = Math.hypot(x - sp.x, y - sp.y); if (d < 2.2) foam = Math.max(foam, 0.9 * (1 - (d / 2.2) ** 2)); clear = Math.max(clear, 1 - sstep(2.5, 5, d)); }   // whitewater through the rapids
        const o = k * 10; wv[o] = x; wv[o + 1] = y; wv[o + 2] = wl; wv[o + 3] = fl[0]; wv[o + 4] = fl[1]; wv[o + 9] = kd;
        wv[o + 5] = wl - h; wv[o + 6] = foam; wv[o + 7] = WATER[kd].murk - 0.55 * clear; wv[o + 8] = Math.max(WATER[kd].wave, 0.75 * rap);
      } }
      // the triangles: a quad whose corners sit on different waters (a pond perched above the shore, say) would make a
      // sloped sheet between the two levels, so those are left out and the bank shows through instead
      for (let j = 0; j < CHK; j++) for (let i = 0; i < CHK; i++) {
        const a = j * N + i; if (!(wet[a] | wet[a + 1] | wet[a + N] | wet[a + N + 1])) continue;
        const l0 = wv[a * 10 + 2], l1 = wv[(a + 1) * 10 + 2], l2 = wv[(a + N) * 10 + 2], l3 = wv[(a + N + 1) * 10 + 2];
        if (Math.max(l0, l1, l2, l3) - Math.min(l0, l1, l2, l3) > 1.2) continue;
        idx.push(a, a + 1, a + N, a + 1, a + N + 1, a + N);
      }
      if (idx.length) {
      const wvbo = this.vbo(wv), wib = gl.createBuffer(), wvao = gl.createVertexArray();
      gl.bindVertexArray(wvao); gl.bindBuffer(gl.ARRAY_BUFFER, wvbo);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      ch.water = { vao: wvao, count: idx.length }; ch.bufs.push(wvbo, wib); ch.vaos.push(wvao);
      }
    }
    // ---- water plants and stones on a hashed grid ----
    if (CONFIG.waterPlants && anyWet) {
      const reeds = [], lilies = [], liliesF = [], weeds = [], kelps = [], rocks = [], logs = [], stumps = [], coralA = [], coralB = [], anemones = [], bergs = [], G = 2.5;
      const extra = { seafan: [], sponge: [], coralC: [], urchin: [], star: [], eelgrass: [], bullkelp: [], rockweed: [], slab: [], rubble: [], shells: [] }, EXTRA_KIND = { 12: 'seafan', 13: 'sponge', 14: 'coralC', 15: 'urchin', 16: 'star', 17: 'eelgrass', 18: 'bullkelp', 19: 'rockweed', 20: 'slab', 21: 'rubble', 22: 'shells' };
      for (let gy = Math.ceil(y0 / G); gy * G < y0 + CHW; gy++) { if (gy % 4 === 0) yield; for (let gx = Math.ceil(x0 / G); gx * G < x0 + CHW; gx++) {
        const t = plantAt(gx, gy); if (!t) continue; // same grid fish use to find cover
        const { x, y, h, wl, kd, dep, r1 } = PL, rot = r1 * 6.2832, mk = WATER[kd].murk;
        if (t === 1) reeds.push(x, y, h, 1.4 + r1 * 1.1, rot, r1);
        else if (t < 4) (t === 3 ? liliesF : lilies).push(x, y, wl + 0.015, 0.8 + 0.7 * hash2(gx, gy, SEED + 305), rot, r1);
        else if (t === 5) kelps.push(x, y, h - 0.1, Math.min(dep * (0.5 + 0.4 * r1), 9), rot, r1, wl, mk);
        else if (t === 4) weeds.push(x, y, h - 0.1, Math.min(dep * (0.35 + 0.45 * r1), 2.6), rot, r1, wl, mk);
        else if (t === 7) { // point the fallen trunk down the bank, into the water
          const gx_ = groundAt(x + 2, y) - groundAt(x - 2, y), gy_ = groundAt(x, y + 2) - groundAt(x, y - 2);
          logs.push(x, y, h - 0.15, 4.5 + 4 * r1, Math.atan2(-gy_, -gx_) + (r1 - 0.5) * 0.8, r1, wl, mk);
        }
        else if (t === 8) stumps.push(x, y, h - 0.05, 1.6 + 1.6 * r1, rot, r1, wl, mk);
        else if (t === 9) (r1 < 0.55 ? coralA : coralB).push(x, y, h - 0.1, 0.9 + 1.4 * hash2(gx, gy, SEED + 306), rot, r1, wl, mk);
        else if (t === 10) anemones.push(x, y, h - 0.03, 0.45 + 0.3 * r1, rot, r1, wl, mk);
        else if (t === 11) { const sc = 5 + 10 * r1; bergs.push(x, y, wl - sc * 0.45, sc, rot, r1, wl, mk); }
        else if (t >= 12) { // the newer sea-floor kinds: size by kind, bull kelp and seagrass reach toward the surface
          const sc = t === 12 ? 0.8 + 0.8 * r1 : t === 13 ? 0.6 + 0.9 * r1 : t === 14 ? 1.0 + 1.3 * r1 : t === 15 ? 0.5 + 0.4 * r1 : t === 16 ? 0.35 + 0.35 * r1
            : t === 17 ? Math.min(dep * (0.45 + 0.35 * r1), 1.6) : t === 18 ? Math.min(dep * 0.95, 18) : t === 19 ? 0.7 + 0.6 * r1 : t === 20 ? 1.2 + 1.6 * r1 : t === 21 ? 1.0 + 1.2 * r1 : 0.5 + 0.4 * r1;
          extra[EXTRA_KIND[t]].push(x, y, h - (t === 20 || t === 21 ? 0.06 * sc : 0.03), sc, rot, r1, wl, mk);
        }
        else { const sc = (kd === CREEK ? 0.45 + 0.8 * r1 : 0.6 + 1.4 * r1) * (1 + 0.7 * PL.rap); rocks.push(x, y, h - 0.22 * sc, sc, rot, r1, wl, mk); }
      } }
      if (ISL) for (const sp of ISL.springs) { // mossy stones heaped where a creek wells up
        if (sp.x < x0 - 4 || sp.y < y0 - 4 || sp.x >= x0 + CHW + 4 || sp.y >= y0 + CHW + 4) continue;
        for (let q = 0; q < 6; q++) {
          const r = hash2(q, 3, sp.h * 1e4), side = (q / 5 - 0.5) * 6.5 + (r - 0.5), back = 2.2 + 1.2 * hash2(q, 4, sp.h * 1e4) - Math.abs(side) * 0.2;
          const x = sp.x + sp.ux * back - sp.uy * side, y = sp.y + sp.uy * back + sp.ux * side, sc = 1.1 + 1.1 * hash2(q, 5, sp.h * 1e4);
          if (x < x0 || y < y0 || x >= x0 + CHW || y >= y0 + CHW) continue;
          sample(x, y); rocks.push(x, y, hW(SE) - 0.25 * sc, sc, r * 6.2832, r, SW, WATER[CREEK].murk);
        }
        for (let q = 0; q < 9; q++) { // rushes crowd the pool's sides
          const a = Math.atan2(sp.uy, sp.ux) + (q % 2 ? 1 : -1) * (1.2 + 0.25 * (q >> 1)) + (hash2(q, 6, sp.h * 1e4) - 0.5) * 0.4, rr = 4 + 1.2 * hash2(q, 7, sp.h * 1e4);
          const x = sp.x + Math.cos(a) * rr, y = sp.y + Math.sin(a) * rr, r1 = hash2(q, 8, sp.h * 1e4);
          if (x < x0 || y < y0 || x >= x0 + CHW || y >= y0 + CHW) continue;
          sample(x, y); if (SW - hW(SE) < 0.15 && SW - hW(SE) > -0.12) reeds.push(x, y, hW(SE), 1.2 + r1 * 1.1, r1 * 6.2832, r1);
        }
      }
      const D = { reed: reeds, lily: lilies, lilyF: liliesF, weed: weeds, kelp: kelps, rock: rocks, log: logs, stump: stumps, coralA, coralB, anemone: anemones, berg: bergs, ...extra };
      for (const k in D) if (D[k].length) ch.plantData[k] = new Float32Array(D[k]);   // drawn merged across chunks
    }
    // trees: one hashed candidate per grid cell owned by this chunk
    const pine = [], oak = [], maple = [], birch = [], palm = [];
    const contact = new Float32Array(N * N);
    const shadeTreeBase = (x, y, z) => {
      const radius = 3.5;
      for (let j = Math.max(0, Math.ceil((y - radius - y0) / SP)); j <= Math.min(CHK, Math.floor((y + radius - y0) / SP)); j++) {
        for (let i = Math.max(0, Math.ceil((x - radius - x0) / SP)); i <= Math.min(CHK, Math.floor((x + radius - x0) / SP)); i++) {
          const k = j * N + i, d2 = ((x0 + i * SP - x) ** 2 + (y0 + j * SP - y) ** 2) / (radius * radius);
          if (d2 < 1 && Math.abs(f[k * 6 + 2] - z) < 2) contact[k] = Math.max(contact[k], 0.22 * (1 - d2) ** 2);
        }
      }
    };
    yield;
    for (let gy = Math.ceil(y0 / TREE_GRID) - 1; gy * TREE_GRID < y0 + CHW + TREE_GRID; gy++) { if (gy % 3 === 0) yield; for (let gx = Math.ceil(x0 / TREE_GRID) - 1; gx * TREE_GRID < x0 + CHW + TREE_GRID; gx++) {
      const x = (gx + 0.15 + 0.7 * hash2(gx, gy, SEED + 1)) * TREE_GRID, y = (gy + 0.15 + 0.7 * hash2(gx, gy, SEED + 2)) * TREE_GRID;
      // Reject impossible candidates before sampling terrain (also avoids
      // building a neighbouring lattice just for a distant contact stamp).
      const owned = gx >= Math.ceil(x0 / TREE_GRID) && gy >= Math.ceil(y0 / TREE_GRID) && gx * TREE_GRID < x0 + CHW && gy * TREE_GRID < y0 + CHW;
      if (hash2(gx, gy, SEED) >= 0.35 * CLIMATE.trees || (!owned && (x < x0 - 3.5 || y < y0 - 3.5 || x > x0 + CHW + 3.5 || y > y0 + CHW + 3.5))) continue;
      sample(x, y);
      const mat = material(SE, SM, x, y), dens = (mat === FOREST ? 0.35 : mat === ALPINE ? 0.3 : mat === PLAIN ? 0.04 : mat === SAND && CLIMATE.palms && SE < 0.42 ? 0.06 : 0) * CLIMATE.trees;
      if (hash2(gx, gy, SEED) >= dens || hW(SE) < SW + 0.7 || Game.noTreesAt(x, y)) continue;
      shadeTreeBase(x, y, hW(SE));
      // Include neighbouring trees in the bake, but keep the original cell ownership.
      if (!owned) continue;
      const sz = hash2(gx, gy, SEED + 3), rot = hash2(gx, gy, SEED + 4) * 6.28, tint = hash2(gx, gy, SEED + 5);
      const kind = hash2(gx, gy, SEED + 6), z = hW(SE);
      // lowland forest is mostly broadleaf (oak, maple, birch by the water), conifers take over with height
      const broad = (mat === PLAIN ? 1 : mat === FOREST ? 0.65 * (1 - sstep(0.46, 0.59, SE)) + 0.25 : mat === ALPINE ? 0.4 * (1 - sstep(0.6, 0.7, SE)) : 0) * CLIMATE.broad;
      if (CLIMATE.palms && (mat === SAND || (SE < 0.45 && kind < 0.55))) palm.push(x, y, z, 7 + sz * 6, rot, tint);   // palms along tropical shores and lowlands
      else if (CLIMATE.palms && mat === FOREST) (kind < 0.5 ? oak : maple).push(x, y, z, 9 + sz * 7, rot, tint);   // evergreen jungle
      else if (kind < broad) { const b = kind / broad, wetSpot = SM > 0.6 || mat === ALPINE;   // birch by water and up the slopes
        if (b < (wetSpot ? 0.45 : 0.2)) birch.push(x, y, z, 9 + sz * 5, rot, tint);
        else if (b < 0.62) oak.push(x, y, z, 8 + sz * 6, rot, tint);
        else maple.push(x, y, z, 8 + sz * 5, rot, tint);
      } else pine.push(x, y, z, (9 + sz * 9) * (CLIMATE.key === 'arctic' ? 0.65 : 1), rot, tint);   // stunted spruce in the arctic
    } }
    ch.treeData = [pine, oak, maple, birch, palm].map(arr => arr.length ? new Float32Array(arr) : null);   // drawn merged across chunks
    for (let k = 0; k < N * N; k++) if (contact[k]) for (let q = 16; q < 19; q++) u8[k * 24 + q] = Math.round(u8[k * 24 + q] * (1 - contact[k]));
    // Upload once after the generation-only contact bake; no additional render pass.
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
    return ch;
  },
});
