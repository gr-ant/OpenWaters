'use strict';
// Column-major 4x4 matrix helpers.
// ---- matrices (column-major) ----
// a camera's view × projection: at E looking along F, R right, U up; tx, ty the tangents of the half field of view (o: reused, not a or b)
const CAM_V = new Float32Array(16), CAM_P = new Float32Array(16);
function camVP(R, U, F, E, tx, ty, near, far, o) {
  const v = CAM_V, p = CAM_P, d = a => a[0] * E[0] + a[1] * E[1] + a[2] * E[2];
  v[0] = R[0]; v[1] = U[0]; v[2] = -F[0]; v[4] = R[1]; v[5] = U[1]; v[6] = -F[1]; v[8] = R[2]; v[9] = U[2]; v[10] = -F[2]; v[12] = -d(R); v[13] = -d(U); v[14] = d(F); v[15] = 1;
  p[0] = 1 / tx; p[5] = 1 / ty; p[10] = (far + near) / (near - far); p[11] = -1; p[14] = 2 * far * near / (near - far);   // (the rest stay 0)
  return mul4(p, v, o);
}
function mul4(a, b, o = new Float32Array(16)) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
