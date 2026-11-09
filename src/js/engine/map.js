'use strict';
// Engine: the map image: rivers painted on, cached world-aligned tiles at power-of-two scales, drawMap().
Object.assign(Engine, {
  // Rivers and creeks on the map: painted as lines from the island's channel network onto each finished map image
  // (once per rebuild, so it costs nothing per frame), at their real width but at least one map pixel wide, so
  // creeks narrower than a map pixel still show unbroken.
  paintChannels(J) {
    if (!ISL) return;
    const I = ISL, c = J.cv.getContext('2d'), k = 1 / J.scale, step = Math.max(1, Math.floor(J.scale / 3)), NS = I.segK.length;
    const x0 = J.ox - J.W / 2 * J.scale, y0 = J.oy - J.H / 2 * J.scale, x1 = x0 + J.W * J.scale, y1 = y0 + J.H * J.scale;
    c.save(); c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const kind of [CREEK, RIVER]) {
      const col = WATER[kind].map; c.strokeStyle = `rgb(${col.map(v => Math.min(255, v * 255 * 1.1) | 0).join(',')})`;
      for (let s = 0; s < NS; s += step) {
        let e = Math.min(NS - 1, s + step - 1); while (I.segC[e] !== I.segC[s]) e--;   // stay within one chain
        const o = s * 10, oe = e * 10, ax = I.SEG[o], ay = I.SEG[o + 1], bx = I.SEG[oe + 2], by = I.SEG[oe + 3];
        if (I.segK[s] === kind && Math.max(ax, bx) > x0 && Math.min(ax, bx) < x1 && Math.max(ay, by) > y0 && Math.min(ay, by) < y1) {
          c.lineWidth = Math.max(I.SEG[o + 6] + I.SEG[oe + 7], (kind === RIVER ? 1.3 : 0.9) / k);
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        }
        if (e < s + step - 1) s = e + 1 - step;   // the next chain starts right after this one
      }
    }
    if (J.scale < 12) { // springs: a ring where each creek rises
      c.strokeStyle = 'rgba(240,250,255,.95)'; c.fillStyle = `rgb(${WATER[CREEK].map.map(v => v * 255 | 0).join(',')})`; c.lineWidth = 1.2 / k;
      for (const sp of I.springs) { if (sp.x < x0 || sp.x > x1 || sp.y < y0 || sp.y > y1) continue; c.beginPath(); c.arc(sp.x, sp.y, Math.max(3, 3.2 / k), 0, 6.2832); c.fill(); c.stroke(); }
    }
    if (J.scale < 5) { // rapids: broken white water along the channel
      c.strokeStyle = 'rgba(235,245,255,.85)';
      for (let s = 0; s < NS; s += 2) {
        if (I.segR[s] < 0.4) continue; const o = s * 10, ax = I.SEG[o], ay = I.SEG[o + 1];
        if (ax < x0 || ax > x1 || ay < y0 || ay > y1) continue;
        c.lineWidth = Math.max(I.SEG[o + 6] * 0.9, 0.7 / k); c.beginPath(); c.moveTo(ax, ay); c.lineTo(I.SEG[o + 2], I.SEG[o + 3]); c.stroke();
      }
    }
    c.restore();
  },
  // 2D map in the same world coords; box-filtered when zoomed out, memoized until the view shifts by `snap` cells.
  // Map image is built a few rows per frame (no hitches), larger than the view so it can scroll smoothly;
  // the old image keeps showing (re-scaled when zooming) until the new one is finished.
  // cx, cy: the world point at the centre (the player, or wherever the big map has been dragged to). While a drag or
  // pinch is under way (hold) the last finished image is moved and stretched instead of being redrawn every frame.
  // ---- the map image: world-aligned 64 px tiles at power-of-two scales (1 m/px .. 256 m/px), built nearest the
  // view first within the frame's background budget, and kept: panning, zooming, closing and reopening the map never
  // throw work away. Coarser tiles show underneath until the fine ones are done, and the coarse levels of the whole
  // island are made at the start, so the map is never blank. ----
  mapTiles: new Map(), mapJob: null, mapPrefetch: null,
  mapLevel(scale) { return clamp(Math.round(Math.log2(scale)), 0, 8); },
  mapTile(lvl, tx, ty) { const k = `${lvl}:${tx}:${ty}`, t = this.mapTiles.get(k); if (t) { this.mapTiles.delete(k); this.mapTiles.set(k, t); } return t; },   // (refreshed: least recently used go first)
  // work on a tile for up to `budget` ms; true once it's finished and stored
  mapBuild(job, budget) {
    const TS = 64, t0 = performance.now(), ts = 2 ** job.lvl, kk = job.lvl >= 5 ? 2 : 1, d = job.img.data, X = job.tx * TS * ts, Y = job.ty * TS * ts;
    while (job.row < TS && performance.now() - t0 < budget) {
      const j = job.row++, wy = Y + (j + 0.5) * ts;
      for (let i = 0; i < TS; i++) {
        const wx = X + (i + 0.5) * ts;
        let e = 0, wet = 0, wk = 0, wd = 0;
        for (let a = 0; a < kk; a++) for (let b = 0; b < kk; b++) {
          const ee = elev(wx + ((a + 0.5) / kk - 0.5) * ts, wy + ((b + 0.5) / kk - 0.5) * ts), hh = hW(ee); e += ee;
          if (hh < WLEV && !(WK === POND && WOBJ && WOBJ.pond && WOBJ.R < ts * 1.5)) { wet++; wd += WLEV - hh; if (WK) wk = WK; }   // a hollow pond smaller than a couple of map pixels is left off: it would only be a speck
        }
        e /= kk * kk;
        let col, sh;
        if (wk && wet * 2 >= kk * kk) { col = WATER[wk].map; sh = clamp(1.15 - wd / wet * 0.06, 0.6, 1.15); } // lakes, ponds, rivers
        else { col = MATS[material(wet * 2 >= kk * kk ? Math.min(e, WL - 0.01) : Math.max(e, WL), moist(wx, wy), wx, wy)].col; sh = wet * 2 >= kk * kk ? clamp(1.1 - 0.075 * Math.log2(1 + wd / wet), 0.3, 1.1) : clamp(0.55 + (e - WL) * 0.9, 0.35, 1.1); }   // the sea shades darker with depth: reef flats and shelf light, the deep dark
        if (job.snow && wet * 2 < kk * kk && col !== MATS[GLACIER].col) {   // lying snow, patchy, as the season has it
          const sn = sstep(0.15, 0.6, job.snow + 0.25 * nM(wx / 90, wy / 90)) * 0.9; col = col.map((v, q) => v + ([0.9, 0.93, 0.97][q] - v) * sn); }
        const n = (j * TS + i) * 4;
        d[n] = clamp(col[0] * sh, 0, 1) * 255; d[n + 1] = clamp(col[1] * sh, 0, 1) * 255; d[n + 2] = clamp(col[2] * sh, 0, 1) * 255; d[n + 3] = 255;
      }
    }
    if (job.row < TS) return false;
    job.cv.getContext('2d').putImageData(job.img, 0, 0);
    this.paintChannels({ cv: job.cv, ox: X + TS * ts / 2, oy: Y + TS * ts / 2, W: TS, H: TS, scale: ts });
    job.cv.snow = job.snow; this.mapTiles.set(`${job.lvl}:${job.tx}:${job.ty}`, job.cv);
    if (this.mapTiles.size > 1200) this.mapTiles.delete(this.mapTiles.keys().next().value);
    return true;
  },
  // landmarks worth finding, worked out once per island: each sea-stack cluster, the glacier, the summit with its height
  landmarks() {
    if (this._landmarks) return this._landmarks; const out = [], L = LAYOUT;
    for (const k of seaStacks()) { const g = out.find(m => Math.hypot(m.x - k.x, m.y - k.y) < 250);
      if (g) { g.n++; g.x += (k.x - g.x) / g.n; g.y += (k.y - g.y) / g.n; } else out.push({ kind: 'stacks', x: k.x, y: k.y, n: 1, label: 'Sea stacks' }); }
    const GN = { valley: 'Valley glacier', tidewater: 'Tidewater glacier', piedmont: 'Piedmont glacier', cirque: 'Cirque glacier' };
    for (const G of glaciers()) if (G.kind !== 'cap') {   // the ice cap is named with the summit
      const d = G.kind === 'tidewater' ? G.length - 25 : G.kind === 'piedmont' ? G.length : G.length * 0.55;   // the ice front · the lobe · halfway down
      out.push(G.kind === 'cirque' ? { kind: 'glacier', x: G.x, y: G.y, label: GN.cirque } : { kind: 'glacier', x: G.x + G.ux * d, y: G.y + G.uy * d, label: GN[G.kind] }); }
    for (const c of cenotes()) out.push({ kind: 'cenote', x: c.cx, y: c.cy, label: c.name + (c.roof ? ' · cave' : '') });
    let top = -1e9, tx = L.px, ty = L.py;
    for (let i = 0; i < 400; i++) { const a = i * 2.4, r = Math.sqrt(i / 400) * L.pr * 0.6, x = L.px + Math.cos(a) * r, y = L.py + Math.sin(a) * r, h = hW(elev(x, y)); if (h > top) { top = h; tx = x; ty = y; } }   // the highest point round the layout's peak
    out.push({ kind: 'peak', x: tx, y: ty, label: `Summit · ${Math.round(top - WLW)} m` + (glaciers().some(G => G.kind === 'cap') ? ' · ice cap' : '') });
    return this._landmarks = out;
  },
  drawLandmarks(c, toPx, inside, labels) {   // labels: on the big map, for the icon under the pointer
    for (const m of this.landmarks()) {
      const [x, y] = toPx(m.x, m.y); if (!inside(x, y)) continue;
      c.save(); c.translate(x, y); c.lineJoin = 'round'; c.lineWidth = 1.2; c.strokeStyle = '#141a14';
      if (m.kind === 'stacks') for (const [dx, h, w] of [[-5, 9, 4], [0, 13, 5], [5, 7, 4]]) {   // three rock pillars, grass on top
        c.fillStyle = '#8c8379'; c.beginPath(); c.rect(dx - w / 2, 5 - h, w, h); c.fill(); c.stroke(); c.fillStyle = '#6f9a4a'; c.fillRect(dx - w / 2 + 0.6, 5.6 - h, w - 1.2, 2); }
      else if (m.kind === 'cenote') {   // a round pit: rock rim round deep blue water
        c.fillStyle = '#b9ad94'; c.beginPath(); c.arc(0, 0, 7.5, 0, 6.2832); c.fill(); c.stroke(); c.fillStyle = '#1f6fa0'; c.beginPath(); c.arc(0, 0, 4.6, 0, 6.2832); c.fill();
        c.fillStyle = '#7fd0f0'; c.beginPath(); c.arc(-1.3, -1.3, 1.4, 0, 6.2832); c.fill(); }
      else if (m.kind === 'glacier') {   // an ice-blue badge with a snowflake
        c.fillStyle = '#9fd0ec'; c.beginPath(); c.arc(0, 0, 7.5, 0, 6.2832); c.fill(); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1.4; c.beginPath();
        for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3 + Math.PI / 2, ca = Math.cos(a) * 5, sa = Math.sin(a) * 5; c.moveTo(-ca, -sa); c.lineTo(ca, sa); } c.stroke(); }
      else {   // a peak with a snowcap
        c.fillStyle = '#7a5a3a'; c.beginPath(); c.moveTo(-8, 5); c.lineTo(0, -8); c.lineTo(8, 5); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#f4f6f8'; c.beginPath(); c.moveTo(-3.1, -3); c.lineTo(0, -8); c.lineTo(3.1, -3); c.lineTo(1, -4.2); c.lineTo(-1, -2.8); c.closePath(); c.fill(); }
      const M = this.mouseXY; if (labels && M && Math.abs(M[0] - x) < 11 && Math.abs(M[1] - y) < 11) { c.font = 'bold 12px Georgia, serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(10,14,10,.8)'; c.strokeText(m.label, 12, 0); c.fillStyle = '#f2e9d0'; c.fillText(m.label, 12, 0); }
      c.restore();
    }
  },
  mapStart(lvl, tx, ty) { const cv = document.createElement('canvas'); cv.width = cv.height = 64; return { lvl, tx, ty, cv, img: cv.getContext('2d').createImageData(64, 64), row: 0, snow: this.mapSnow() }; },
  mapSnow() { return Math.round((ENV.snowCover || 0) * 4) / 4; },   // snow cover in quarter steps: a tile is redrawn when it moves on a step (the old one shows meanwhile)
  // build the wanted tiles ([lvl, tx, ty], nearest first) within the budget; the tile in hand is finished first
  mapWork(want, budget) {
    const t0 = performance.now(), left = () => budget - (performance.now() - t0);
    const wanted = (j, list) => list.some(([l, x, y]) => l === j.lvl && x === j.tx && y === j.ty);
    if (this.mapJob && !wanted(this.mapJob, want) && this.mapJob.row < 48) this.mapJob = null;   // moved on: drop it unless it's nearly done
    for (;;) {
      if (!this.mapJob) { const sn = this.mapSnow(), nx = want.find(([l, x, y]) => { const t = this.mapTiles.get(`${l}:${x}:${y}`); return !t || t.snow !== sn; }); if (!nx) break; this.mapJob = this.mapStart(...nx); }
      if (left() <= 0) break;
      if (this.mapBuild(this.mapJob, left())) this.mapJob = null;
    }
    this.bgSpend(performance.now() - t0);
  },
  // the whole island at the three coarsest useful scales, made at the start (level 6 right away) and in spare frames
  mapPrefetchList() {
    const list = [], R = CONFIG.islandSize * 0.75;
    for (const lvl of [8, 7, 6, 5, 4]) { const span = 64 * 2 ** lvl, n = Math.ceil(R / span); for (let ty = -n; ty < n; ty++) for (let tx = -n; tx < n; tx++) list.push([lvl, tx, ty, Math.hypot(tx + 0.5, ty + 0.5) * span]); }
    return list.sort((a, b) => a[0] !== b[0] ? b[0] - a[0] : a[3] - b[3]).map(t => t.slice(0, 3));
  },
  drawMap(x0, y0, wPx, hPx, cell, scale, memo, margin, cx = this.P.x, cy = this.P.y, hold = false) {
    const c = this.ctx, P = this.P, w = Math.floor(wPx / cell), h = Math.floor(hPx / cell), TS = 64;
    const lvl = this.mapLevel(scale), toPx = (X, Y) => [x0 + (w / 2 + (X - cx) / scale) * cell, y0 + (h / 2 + (Y - cy) / scale) * cell];
    const X0 = cx - w / 2 * scale, Y0 = cy - h / 2 * scale, X1 = X0 + w * scale, Y1 = Y0 + h * scale;
    const range = l => { const span = TS * 2 ** l; return [Math.floor(X0 / span), Math.floor(Y0 / span), Math.floor(X1 / span), Math.floor(Y1 / span), span]; };
    // what this view needs, nearest the middle first; then build some of it
    const [tx0, ty0, tx1, ty1, span] = range(lvl), want = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) want.push([lvl, tx, ty, Math.hypot((tx + 0.5) * span - cx, (ty + 0.5) * span - cy)]);
    want.sort((a, b) => a[3] - b[3]);
    this.mapWork(want, this.bgTake(this.showMap ? 9 : 6, 2)); this.mapJobDrawn = true;
    c.save(); c.beginPath(); c.rect(x0, y0, w * cell, h * cell); c.clip(); // keep everything inside the map
    { const dc = MATS[DEEP].col; c.fillStyle = `rgb(${dc.map(v => Math.round(v * 0.35 * 255)).join(',')})`; } c.fillRect(x0, y0, w * cell, h * cell);   // deep sea, like the tiles' own
    c.imageSmoothingEnabled = false;
    // whatever is cached stands in where this level is missing: coarser levels (stretched), then finer ones on top of
    // those (sharper), then this level over everything
    const levels = []; for (let l = 8; l > lvl; l--) levels.push(l); for (let l = Math.max(0, lvl - 2); l < lvl; l++) levels.push(l); levels.push(lvl);
    for (const l of levels) {
      const [ax, ay, bx, by, sp] = range(l), k = sp / scale * cell; if ((bx - ax + 1) * (by - ay + 1) > 400) continue;   // too many tiny tiles to be worth it
      for (let ty = ay; ty <= by; ty++) for (let tx = ax; tx <= bx; tx++) { const t = this.mapTile(l, tx, ty); if (!t) continue; const [px, py] = toPx(tx * sp, ty * sp); c.drawImage(t, px, py, k + 0.5, k + 0.5); }
    }
    c.restore();
    memo.view = { x0, y0, w, h, cell, ox: cx, oy: cy, scale };
    { const ox = cx, oy = cy;
    const toPx = (X, Y) => [x0 + (w / 2 + (X - ox) / scale) * cell, y0 + (h / 2 + (Y - oy) / scale) * cell];
    const inside = (px, py) => px >= x0 && px < x0 + w * cell && py >= y0 && py < y0 + h * cell;
    c.save(); c.beginPath(); c.rect(x0, y0, w * cell, h * cell); c.clip(); // keep roads/icons inside the map
    for (const fn of Game._mapHooks) fn(c, toPx, inside, scale); // games draw their own map icons
    this.drawLandmarks(c, toPx, inside, memo === this.bigMemo);
    c.font = 'bold 13px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const b of this.boats) { const [px, py] = toPx(b.x, b.y); if (!inside(px, py)) continue; const L = Math.max(4, b.def.hull.length_m / scale * cell), ca = Math.cos(b.a), sa = Math.sin(b.a);   // boats
      c.beginPath(); c.moveTo(px + ca * L * 0.6, py + sa * L * 0.6); c.lineTo(px - ca * L * 0.5 - sa * L * 0.25, py - sa * L * 0.5 + ca * L * 0.25); c.lineTo(px - ca * L * 0.5 + sa * L * 0.25, py - sa * L * 0.5 - ca * L * 0.25); c.closePath();
      c.fillStyle = b.def.colors.hull; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke(); }
    for (const mk of this.markers) { const [px, py] = toPx(mk.x, mk.y); if (inside(px, py)) { c.fillStyle = '#000'; c.fillText(mk.sym, px + 1, py + 1); c.fillStyle = '#ffd34d'; c.fillText(mk.sym, px, py); } }
    c.textAlign = 'left'; c.restore();
    // player arrow (map x right, y down, same as world)
    const [px, py] = toPx(P.x, P.y);
    if (inside(px, py)) {
      const a = P.a, s = 7;
      c.beginPath(); c.moveTo(px + Math.cos(a) * s, py + Math.sin(a) * s);
      c.lineTo(px + Math.cos(a + 2.5) * s, py + Math.sin(a + 2.5) * s); c.lineTo(px + Math.cos(a - 2.5) * s, py + Math.sin(a - 2.5) * s); c.closePath();
      c.fillStyle = '#ff3b3b'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
    }
    }
  },

});
