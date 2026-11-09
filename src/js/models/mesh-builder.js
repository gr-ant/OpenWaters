'use strict';
// Surface material ids (MT), lit vertex layout (VS / VB), meshBuilder() and small vector helpers.
// ---- tiny mesh builder: flat-shaded triangles, interleaved pos3 nrm3 col3 ----
// Surface materials (drawn procedurally in the fragment shader)
const MT = { GEN: 0, PLASTER: 1, WOOD: 2, TILE: 3, STONE: 4, ROCK: 5, LEAF: 6, BARK: 7, CLOTH: 8, GLOW: 9, GLASS: 10, LAMP: 11, METAL: 12, JAW: 13 }; // JAW: fish lower jaw (hinged in the vertex shader)
const VS = 10, VB = 40; // floats / bytes per lit vertex: pos3 nrm3 col3 material1
// Share only bit-identical vertex records. Triangle order, flat normals, material
// boundaries and animation inputs survive unchanged. Hash collisions are compared in full.
function indexMesh(mesh) {
  const words = new Uint32Array(mesh.buffer, mesh.byteOffset, mesh.length), count = mesh.length / VS;
  const heads = new Map(), next = new Int32Array(count), offsets = new Uint32Array(count), ids = new Uint32Array(count);
  let unique = 0;
  for (let i = 0; i < count; i++) {
    const o = i * VS; let h = 2166136261;
    for (let q = 0; q < VS; q++) h = Math.imul(h ^ words[o + q], 16777619);
    const head = heads.get(h) ?? -1; let id = head;
    while (id >= 0) {
      const at = offsets[id]; let q = 0;
      while (q < VS && words[at + q] === words[o + q]) q++;
      if (q === VS) break;
      id = next[id];
    }
    if (id < 0) { id = unique++; offsets[id] = o; next[id] = head; heads.set(h, id); }
    ids[i] = id;
  }
  // WebGL2 reserves the largest index for primitive restart (65535 for Uint16).
  const Index = unique < 65536 ? Uint16Array : Uint32Array;
  if (unique * VB + count * Index.BYTES_PER_ELEMENT >= mesh.byteLength * 0.95) return { vertices: mesh, indices: null };
  const packed = new Uint32Array(unique * VS);
  for (let i = 0; i < unique; i++) packed.set(words.subarray(offsets[i], offsets[i] + VS), i * VS);
  return { vertices: new Float32Array(packed.buffer), indices: new Index(ids) };
}
function meshBuilder(smooth = false) { // smooth: round, smooth-shaded blobs (fish and shellfish); trees keep the faceted look
  const v = [], B = { v, mat: 0 };
  const tri = (a, b, c, col, ctr) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const mx = (a[0] + b[0] + c[0]) / 3 - ctr[0], my = (a[1] + b[1] + c[1]) / 3 - ctr[1], mz = (a[2] + b[2] + c[2]) / 3 - ctr[2];
    const flip = nx * mx + ny * my + nz * mz < 0;   // face away from shape center...
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const q of flip ? [a, c, b] : [a, b, c]) v.push(q[0], q[1], q[2], nx / l, ny / l, nz / l, col[0], col[1], col[2], B.mat);   // ...with matching winding, so back faces can be culled
  };
  const quad = (a, b, c, d, col, ctr) => { tri(a, b, c, col, ctr); tri(a, c, d, col, ctr); };
  // smooth-shaded triangle: its own normal and colour at each corner, blended across the face by the GPU
  const vtx = (q, n, c) => v.push(q[0], q[1], q[2], n[0], n[1], n[2], c[0], c[1], c[2], B.mat);
  const triN = (a, b, c, na, nb, nc, ca, cb, cc) => { vtx(a, na, ca); vtx(b, nb, cb); vtx(c, nc, cc); };
  // tapered n-sided tube from (x,y,z0) radius r0 to (x2,y2,z1) radius r1, optional cap; jit(k,end) perturbs radius
  const tube = (p0, p1, r0, r1, n, col, cap, jit) => {
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(...d) || 1, w = d.map(x => x / L);
    let a = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const X = norm3(cross3(a, w)), Y = cross3(w, X);
    const P = (q, r, k, e) => { const t = k / n * 6.2832, rr = r * (jit ? jit(k % n, e) : 1); return [q[0] + (X[0] * Math.cos(t) + Y[0] * Math.sin(t)) * rr, q[1] + (X[1] * Math.cos(t) + Y[1] * Math.sin(t)) * rr, q[2] + (X[2] * Math.cos(t) + Y[2] * Math.sin(t)) * rr]; };
    const ctr = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    for (let k = 0; k < n; k++) quad(P(p0, r0, k, 0), P(p0, r0, k + 1, 0), P(p1, r1, k + 1, 1), P(p1, r1, k, 1), col, ctr);
    if (cap) for (let k = 0; k < n; k++) tri(P(p1, r1, k, 1), P(p1, r1, k + 1, 1), p1, col, p0);
  };
  // low-poly ellipsoid (rings x segs), radii rx ry rz, optional per-vertex bump(i,j) and color fn
  const blob = (c, rx, ry, rz, rings, segs, col, bump, rot = 0) => {
    const V = (i, j) => { const th = i / rings * Math.PI, ph = j / segs * 6.2832 + rot, b = bump ? bump(i, j % segs) : 1; return [c[0] + Math.sin(th) * Math.cos(ph) * rx * b, c[1] + Math.sin(th) * Math.sin(ph) * ry * b, c[2] + Math.cos(th) * rz * b]; };
    const N = (i, j) => { const q = V(i, j); return norm3([(q[0] - c[0]) / (rx * rx), (q[1] - c[1]) / (ry * ry), (q[2] - c[2]) / (rz * rz)]); };
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const cc = typeof col === 'function' ? col(i, j) : col;
      if (smooth) { const t3 = (a, b, d) => triN(V(...a), V(...b), V(...d), N(...a), N(...b), N(...d), cc, cc, cc);
        if (i === 0) t3([0, j], [1, j + 1], [1, j]); else if (i === rings - 1) t3([i, j], [i, j + 1], [i + 1, j]); else { t3([i, j], [i, j + 1], [i + 1, j + 1]); t3([i, j], [i + 1, j + 1], [i + 1, j]); } continue; }
      if (i === 0) tri(V(0, j), V(1, j + 1), V(1, j), cc, c); else if (i === rings - 1) tri(V(i, j), V(i, j + 1), V(i + 1, j), cc, c);
      else quad(V(i, j), V(i, j + 1), V(i + 1, j + 1), V(i + 1, j), cc, c);
    }
  };
  return Object.assign(B, { tri, quad, tube, blob, vtx, triN });
}
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
