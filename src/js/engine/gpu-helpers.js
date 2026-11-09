'use strict';
// Engine: GPU buffer and vertex-array helpers (vbo, vao2d, litVao).
Object.assign(Engine, {
  vbo(data) { const gl = this.gl, b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; },
  meshBuffers(data) {
    const gl = this.gl, m = indexMesh(data), vbo = this.vbo(m.vertices);
    let ebo = null, indexType = 0;
    if (m.indices) {
      ebo = gl.createBuffer(); gl.bindVertexArray(null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      indexType = m.indices.BYTES_PER_ELEMENT === 2 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
    }
    return { vbo, ebo, indexType, n: data.length / VS };
  },
  animalMesh(data, istride = 40) {
    const m = this.meshBuffers(data), ib = this.gl.createBuffer();
    return { ...m, ib, vao: this.litVao(m.vbo, VB, ib, istride, m.ebo) };
  },
  drawMesh(m, count) {
    const gl = this.gl; gl.bindVertexArray(m.vao);
    if (m.indexType) gl.drawElementsInstanced(gl.TRIANGLES, m.n, m.indexType, 0, count);
    else gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, count);
  },
  deleteAnimalMesh(m) {
    const gl = this.gl; gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.ib); gl.deleteBuffer(m.vbo); if (m.ebo) gl.deleteBuffer(m.ebo);
  },
  vao2d(data) { const gl = this.gl, v = gl.createVertexArray(); gl.bindVertexArray(v); this.vbo(data); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null); return v; },
  // VAO for pos3/nrm3/col3 float meshes; optional per-instance buffer (6 floats: x,y,z,scale,rot,tint;
  // with istride 32, two more: water level and murk, for things that live underwater)
  litVao(vbo, stride, inst, istride = 24, ebo = null) {
    const gl = this.gl, v = gl.createVertexArray(); gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, stride, i * 12); }
    if (stride >= 40) { gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 1, gl.FLOAT, false, stride, 36); }
    if (inst) {
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, istride, 0); gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, istride, 16); gl.vertexAttribDivisor(4, 1);
      if (istride >= 32) { gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9, 2, gl.FLOAT, false, istride, 24); gl.vertexAttribDivisor(9, 1); }
      if (istride >= 36) { gl.enableVertexAttribArray(10); gl.vertexAttribPointer(10, 1, gl.FLOAT, false, istride, 32); gl.vertexAttribDivisor(10, 1); } // fish swim phase
      if (istride >= 40) { gl.enableVertexAttribArray(11); gl.vertexAttribPointer(11, 1, gl.FLOAT, false, istride, 36); gl.vertexAttribDivisor(11, 1); } // fish pitch
      if (istride >= 44) { gl.enableVertexAttribArray(12); gl.vertexAttribPointer(12, 1, gl.FLOAT, false, istride, 40); gl.vertexAttribDivisor(12, 1); } // bird roll
    }
    if (ebo) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bindVertexArray(null); return v;
  },
});
