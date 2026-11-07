'use strict';
// Pictures rendered from the game's own 3D models (rigs, gear, boats, animals): offscreen snapshot, the queue that fills <img data-snap> placeholders, and the snap-everything pass at load.
// ---- pictures rendered from the game's own 3D models, so custom gear, boats and animals get theirs too ----
// meshes are flat arrays of VS floats per vertex, position first
const meshBox = m => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < m.length; i += VS) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m[i + k]); hi[k] = Math.max(hi[k], m[i + k]); } return { lo, hi, size: Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) }; };
const meshMove = (m, d) => { const o = new Float32Array(m); for (let i = 0; i < o.length; i += VS) { o[i] += d[0]; o[i + 1] += d[1]; o[i + 2] += d[2]; } return o; };
const meshJoin = parts => { const o = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
const DEFAULT_HOOK = { style: 'j', gap_mm: 9 };
// every definition object gets a number when first seen, so a re-imported boat / fish / piece of gear (a new object) gets a new picture
const STAMPS = new WeakMap(); let stampN = 0;
const stamp = d => d ? (STAMPS.get(d) || (STAMPS.set(d, ++stampN), stampN)) : 0;
// keep only whole triangles whose corners all lie within x0..x1 (a close-up of a long model)
const meshCropX = (m, x0, x1) => { const o = [], T = VS * 3; for (let i = 0; i < m.length; i += T) { let ok = true; for (let k = 0; k < 3; k++) { const x = m[i + k * VS]; if (x < x0 || x > x1) ok = false; } if (ok) o.push(m.subarray(i, i + T)); } return meshJoin(o); };

// a rig laid out left to right: float, sinker, then the bait on its hook (or just the lure), joined by the line
function rigMesh(S) {
  if (S.lure) return lureMesh(S.lure);
  const parts = [S.float && floatMesh(S.float), S.sinker && sinkerMesh(S.sinker), baitMesh(S)].filter(Boolean);
  const size = Math.max(...parts.map(m => meshBox(m).size)), gap = size * 0.35, out = [], ends = [];
  let x = 0;
  parts.forEach((m, i) => { const b = meshBox(m), w = b.hi[0] - b.lo[0], cz = i ? -size * 0.25 : 0, top = b.hi[2] - (b.hi[2] + b.lo[2]) / 2 + cz;
    out.push(meshMove(m, [x - b.lo[0], -(b.lo[1] + b.hi[1]) / 2, cz - (b.lo[2] + b.hi[2]) / 2])); ends.push([x, top * (i ? 0.6 : 0)], [x + w, top * (i ? 0.6 : 0)]); x += w + gap; });
  if (parts.length > 1) { const B = meshBuilder(), col = hexRGB(S.line.colors.line), r = size * 0.008; B.mat = MT.GEN;
    for (let i = 1; i < parts.length; i++) { const a = ends[i * 2 - 1], c = ends[i * 2]; B.tube([a[0] - gap * 0.1, 0, a[1]], [c[0] + gap * 0.1, 0, c[1]], r, r, 4, col, false); }
    out.push(new Float32Array(B.v)); }
  return meshJoin(out);
}
// one piece of gear on its own (reels, lines and leaders have no model of their own: null)
function gearMesh(g) {
  switch (g.type) {
    case 'lure': return lureMesh(g);
    case 'bait': return baitMesh({ bait: g, hook: DEFAULT_HOOK });
    case 'float': return floatMesh(g);
    case 'sinker': return sinkerMesh(g);
    case 'hook': { const B = meshBuilder(true); hookShape(B, 0, 0, clamp(g.gap_mm / 1000 * 1.6, 0.008, 0.05), g.style === 'treble' ? 'treble' : 'single'); return new Float32Array(B.v); }
    case 'rod': { const reel = TackleDB.ofType('reel')[0]; return reel ? meshCropX(rodMesh({ rod: g, reel }, 0).mesh, -0.32, 0.55) : null; }   // grip, reel seat and first guides
    case 'reel': { const rod = TackleDB.ofType('rod').find(r => (r.reel === 'spinning') === (g.kind === 'spinning')) || TackleDB.ofType('rod')[0]; return rod ? meshCropX(rodMesh({ rod, reel: g }, 0).mesh, -0.2, 0.2) : null; }
  }
  return null;
}
// an <img> of a model; drawn a few per frame (see snapPump), so long lists open at once and fill in
function snapHTML(key, build, cls = '', view) {
  const E = Engine, url = E.snaps && E.snaps.get(key);
  if (E.snaps && E.snaps.has(key) && !url) return `<img class="snap ${cls}" data-snap="${key.replace(/"/g, '')}" alt="">`;   // still encoding
  if (url) return `<img class="snap ${cls}" src="${url}" alt="">`;
  (E.snapQ || (E.snapQ = new Map())).set(key, { build, view }); (E.snapNow || (E.snapNow = new Set())).add(key);   // on screen: draw it first
  return `<img class="snap ${cls}" data-snap="${key.replace(/"/g, '')}" alt="">`;
}
const swatch = col => `<span class="sw" style="background:${col}"></span>`;
const rigKey = (r, S) => `rig:${r.id}:${stamp(r)}:${[S.float, S.sinker, S.bait, S.lure, S.hook, S.line].map(stamp).join('.')}`;
const gearKey = g => `gear:${g.id}:${stamp(g)}`;
function rigIconHTML(S, rig) {
  if (!S || !S.rod || (!S.lure && !S.bait)) return swatch('#888');
  return `<span class="ri">${snapHTML(rig ? rigKey(rig, S) : `rigS:${[S.float, S.sinker, S.bait, S.lure, S.hook, S.line].map(stamp).join('.')}`, () => rigMesh(S))}</span>`;
}
function gearIconHTML(g) {
  if (!['lure', 'bait', 'float', 'sinker', 'hook', 'rod', 'reel'].includes(g.type)) return swatch(g.colors ? Object.values(g.colors)[0] : '#9aa0a8');   // lines and leaders have no model
  return `<span class="ri">${snapHTML(gearKey(g), () => gearMesh(g))}</span>`;
}
const boatKey = D => `boat:${D.id}:${stamp(D)}`, animalKey = D => `fish:${D.id}:${stamp(D)}`;
const boatPicHTML = D => snapHTML(boatKey(D), () => D._mesh), animalPicHTML = D => snapHTML(animalKey(D), () => D._mesh);
// all pictures are made while the loading screen is up (later imports are picked up by snapPump)
Game.on('ready', () => { Engine.snapAll(); Engine.snapPump(1e9); const pf = Engine.mapPrefetchList(); Engine.mapWork(pf.filter(t => t[0] >= 6), 1e9); Engine.mapPrefetch = pf.filter(t => t[0] < 6); });

Object.assign(Engine, {
  // render a mesh offscreen to a picture (data URL): orthographic, seen from the side and a little above, framed to fit
  snapshot(mesh, { w = 232, h = 144, dir = [0.3, -1, 0.45] } = {}) {
    const gl = this.gl; if (!gl || !mesh || !mesh.length) return '';
    const W = w * 2, H = h * 2, fk = `${W}x${H}`, fbs = this.snapFb || (this.snapFb = {});
    if (!fbs[fk]) { const fb = gl.createFramebuffer(), tex = gl.createTexture(), rb = gl.createRenderbuffer();
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb); fbs[fk] = fb; }
    // camera axes, then the model's extent across and up the picture
    const B = meshBox(mesh), D = norm3(dir), F = D.map(v => -v), R = norm3(cross3(F, [0, 0, 1])), U = cross3(R, F), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let r0 = 1e9, r1 = -1e9, u0 = 1e9, u1 = -1e9;
    for (let i = 0; i < mesh.length; i += VS) { const p = [mesh[i], mesh[i + 1], mesh[i + 2]], r = dot(p, R), u = dot(p, U); r0 = Math.min(r0, r); r1 = Math.max(r1, r); u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
    const aspect = W / H, hh = Math.max((r1 - r0) / aspect, u1 - u0) / 2 * 1.08 || 1, hw = hh * aspect, ctr = [(B.lo[0] + B.hi[0]) / 2, (B.lo[1] + B.hi[1]) / 2, (B.lo[2] + B.hi[2]) / 2];
    const T = ctr.map((c, k) => c + R[k] * ((r0 + r1) / 2 - dot(ctr, R)) + U[k] * ((u0 + u1) / 2 - dot(ctr, U))), dist = B.size * 3 + 1e-3, E = T.map((t, k) => t + D[k] * dist), n = dist * 0.05, f = dist * 3;
    const view = new Float32Array([R[0], U[0], -F[0], 0, R[1], U[1], -F[1], 0, R[2], U[2], -F[2], 0, -dot(R, E), -dot(U, E), dot(F, E), 1]);
    const proj = new Float32Array([1 / hw, 0, 0, 0, 0, 1 / hh, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]);
    const L = this.lit, vb = this.vbo(mesh), ib = gl.createBuffer(), vao = this.litVao(vb, VB, ib);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[fk]); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.useProgram(L.p);
    gl.uniformMatrix4fv(L.u.vp, false, mul4(proj, view)); gl.uniform3fv(L.u.cam, E); gl.uniform3fv(L.u.sun, norm3([D[0] + 0.3, D[1] - 0.4, 1.2]));
    gl.uniform3fv(L.u.fogc, [0, 0, 0]); gl.uniform1f(L.u.far, 1e7); gl.uniform3fv(L.u.lcol, [0.95, 0.92, 0.85]); gl.uniform3fv(L.u.amb, [0.5, 0.5, 0.55]);
    gl.uniform1f(L.u.night, 0); gl.uniform1f(L.u.emk, 0.5); gl.uniform1i(L.u.nfl, 0); gl.uniform1f(L.u.inst, 1); gl.uniform1f(L.u.sway, 0);
    gl.uniform1f(L.u.fsh, 0); gl.uniform1f(L.u.wig, 0); gl.uniform1f(L.u.pscale, 1); gl.uniform1f(L.u.dry, 0); gl.uniform1f(L.u.roll, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 0, 0.5]), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.length / VS, 1); gl.bindVertexArray(null);
    const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.uniform1f(L.u.emk, 1);
    gl.deleteVertexArray(vao); gl.deleteBuffer(vb); gl.deleteBuffer(ib);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'), img = cx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);   // GL rows run bottom-up
    cx.putImageData(img, 0, 0);
    return cv;
  },
  // queue a picture of everything there is (skipping ones already made); run at start and whenever something is imported
  snapAll() {
    const want = (key, build) => { if (!(this.snaps && this.snaps.has(key))) (this.snapQ || (this.snapQ = new Map())).set(key, { build }); };
    for (const r of TackleDB.ofType('rig')) { const S = rigStats(r); if (!S.errors.length) want(rigKey(r, S), () => rigMesh(S)); }
    for (const g of TackleDB.list) if (g.type !== 'rig' && ['lure', 'bait', 'float', 'sinker', 'hook', 'rod', 'reel'].includes(g.type)) want(gearKey(g), () => gearMesh(g));
    for (const D of BoatDB.list) want(boatKey(D), () => D._mesh);
    for (const D of FishDB.list) want(animalKey(D), () => D._mesh);
  },
  // draw a few queued pictures per frame and drop them into their <img data-snap> placeholders
  snapPump(ms = 6) {   // ms: time allowed per frame (at least one picture is always drawn)
    if (!(this.snapCheckT > this.time)) {   // once a second: has anything been added or replaced?
      this.snapCheckT = this.time + 1;
      const sig = [...TackleDB.list, ...BoatDB.list, ...FishDB.list].map(stamp).join(',');
      if (sig !== this.snapSig) { this.snapSig = sig; this.snapAll(); }
    }
    const Q = this.snapQ; if (!Q || !Q.size) return;
    const S = this.snaps || (this.snaps = new Map()), now = this.snapNow || (this.snapNow = new Set());
    const fill = (key, url) => { for (const img of document.querySelectorAll(`img[data-snap="${key.replace(/"/g, '')}"]`)) { img.removeAttribute('data-snap'); if (url) img.src = url; } };
    const order = [...now].filter(k => Q.has(k)).concat([...Q.keys()]), t0 = performance.now();
    for (const key of order) { const job = Q.get(key); if (!job) continue; if (performance.now() - t0 > ms && key !== order[0]) break; Q.delete(key); now.delete(key);
      let cv = null; try { cv = this.snapshot(job.build(), job.view); } catch (e) { console.warn('picture failed', key, e); }
      if (!cv) { S.set(key, ''); fill(key, ''); continue; }
      S.set(key, '');   // placeholder while the PNG is encoded off the main thread
      cv.toBlob(b => { const url = b ? URL.createObjectURL(b) : ''; S.set(key, url); fill(key, url); }); }
  },

});
