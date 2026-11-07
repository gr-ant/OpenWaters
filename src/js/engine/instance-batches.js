'use strict';
// Engine: instance batches: one GPU buffer refilled each frame from many sources, drawn in one call.
Object.assign(Engine, {
  // ---- instance batches: one GPU buffer refilled each frame from many sources, drawn with a single call ----
  // A batch is { ib, vao, data: Float32Array, n (floats used), cap (floats allocated on the GPU) }.
  batches: {},
  batch(key, mesh, istride) { // mesh: { vbo, n }
    let b = this.batches[key];
    if (!b) { const ib = this.gl.createBuffer(); b = this.batches[key] = { ib, vao: this.litVao(mesh.vbo, VB, ib, istride), verts: mesh.n, stride: istride / 4, data: new Float32Array(4096), n: 0, cap: 0 }; }
    return b;
  },
  bAppend(b, arr) { // arr: typed or plain array of floats
    const need = b.n + arr.length;
    if (need > b.data.length) { let c = b.data.length; while (c < need) c *= 2; const d = new Float32Array(c); d.set(b.data.subarray(0, b.n)); b.data = d; }
    b.data.set(arr, b.n); b.n = need;
  },
  upInst(m, arr) { // copy a (reused) JS array into the mesh's persistent typed buffer and upload it without reallocating
    const gl = this.gl; if (!m.data || m.data.length < arr.length) { let c = (m.data && m.data.length) || 1024; while (c < arr.length) c *= 2; m.data = new Float32Array(c); m.cap = 0; }
    m.data.set(arr, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.ib); if (m.cap < m.data.length) { gl.bufferData(gl.ARRAY_BUFFER, m.data.byteLength, gl.DYNAMIC_DRAW); m.cap = m.data.length; }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.data, 0, arr.length);
  },
  bDraw(b) { // upload what was appended this frame and draw it; leaves the batch empty
    if (!b.n) return; const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.ib);
    if (b.cap < b.data.length) { gl.bufferData(gl.ARRAY_BUFFER, b.data.byteLength, gl.DYNAMIC_DRAW); b.cap = b.data.length; }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, b.n);
    gl.bindVertexArray(b.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, b.verts, b.n / b.stride); b.last = b.n; b.n = 0;
  },
  bRedraw(b) { if (b.last) { const gl = this.gl; gl.bindVertexArray(b.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, b.verts, b.last / b.stride); } },  // same data as last frame
});
