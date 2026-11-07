'use strict';
// Particle kinds (FIRE, SMOKE, ...), their physics tables and partLook(): colour and size over a particle's life.
// ---- particles (point sprites) ----
const [FIRE, SMOKE, EMBER, DROP, MIST, FROST, WIND, DUST, CHIP, SPARK, STEAM, BUBBLE, MOTE, FLY, LEAFP] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const PADD = [1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0], PGRAV = [3.5, 1.4, 1.0, -11, 0.3, -0.3, 0.6, 0.4, -14, 1.0, 2.2, 4, 0.02, 0.15, -0.9], PDRAG = [1.6, 0.9, 0.6, 0.15, 2.5, 2.5, 0, 2.2, 0.2, 1.2, 1.5, 2.6, 1.2, 0.6, 1.4];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// color [r,g,b,a] and size for a particle at age t (0..1); colors > 1 glow under additive blending
function partLook(q, t, T) {
  const tw = 0.6 + 0.4 * Math.sin(T * 28 + q.seed), sn = Math.sin(Math.PI * t);
  switch (q.k) {
    case FIRE: { const c = t < 0.25 ? lerp3([1.7, 1.45, 0.9], [1.5, 0.6, 0.12], t / 0.25) : lerp3([1.5, 0.6, 0.12], [0.55, 0.09, 0.03], (t - 0.25) / 0.75);
      return [c[0], c[1] * 0.9, c[2] * 0.8, Math.min(1, 1.1 * (1 - t) ** 1.1), q.s * (0.55 + 0.8 * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.15)))]; }
    case SMOKE: return [0.12, 0.11, 0.1, 0.42 * sn, q.s * (0.8 + 2.6 * t)];
    case EMBER: return [1.7, 0.75, 0.2, (1 - t) * tw, q.s];
    case DROP: return [0.55, 0.82, 1.35, 0.85 * (1 - t * t), q.s];
    case MIST: return [0.78, 0.9, 1, 0.28 * sn, q.s * (1 + 2 * t)];
    case FROST: return [1.0, 1.25, 1.6, (1 - t) * tw, q.s];
    case WIND: return [1, 1.02, 1.1, 0.22 * sn, q.s * (1 + t)];
    case DUST: return [0.5, 0.42, 0.32, 0.45 * sn, q.s * (1 + 2.2 * t)];
    case CHIP: return [0.42, 0.34, 0.25, t < 0.85 ? 1 : (1 - t) / 0.15, q.s];
    case SPARK: { const c = q.col ? q.col : q.seed % 1 > 0.6 ? [1.6, 1.4, 0.5] : [0.5, 1.7, 0.6]; return [c[0], c[1], c[2], (1 - t) * tw, q.s]; }
    case BUBBLE: return [0.7, 0.9, 1.05, 0.5 * (1 - t * t) * (0.75 + 0.25 * tw), q.s * (1 + 0.4 * t)];
    case MOTE: return q.col ? [q.col[0], q.col[1], q.col[2], 0.3 * sn, q.s] : [0.75, 0.85, 0.75, 0.22 * sn, q.s];
    case FLY: return [0.16, 0.14, 0.11, 0.85 * Math.min(1, sn * 3), q.s * (0.8 + 0.4 * tw)];   // hatching insects
    case LEAFP: return [q.col[0] * (0.75 + 0.25 * tw), q.col[1] * (0.75 + 0.25 * tw), q.col[2], Math.min(1, (1 - t) * 4), q.s];
    default: return [0.92, 0.94, 0.97, 0.35 * sn, q.s * (1 + 2.5 * t)]; // STEAM
  }
}
