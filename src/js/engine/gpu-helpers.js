'use strict';
// Engine: GPU buffer and vertex-array helpers (vbo, vao2d, litVao).
Object.assign(Engine, {
  vbo(data) { const gl = this.gl, b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; },
  vao2d(data) { const gl = this.gl, v = gl.createVertexArray(); gl.bindVertexArray(v); this.vbo(data); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null); return v; },
  // VAO for pos3/nrm3/col3 float meshes; optional per-instance buffer (6 floats: x,y,z,scale,rot,tint;
  // with istride 32, two more: water level and murk, for things that live underwater)
  litVao(vbo, stride, inst, istride = 24) {
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
    }
    gl.bindVertexArray(null); return v;
  },
});
