'use strict';
// Particle kinds (FIRE, SMOKE, ...), their physics tables and partLook(): colour and size over a particle's life.
// ---- particles (point sprites) ----
const [FIRE, SMOKE, EMBER, DROP, MIST, FROST, WIND, DUST, CHIP, SPARK, STEAM, BUBBLE, MOTE, FLY, LEAFP] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const PADD = [1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0], PGRAV = [3.5, 1.4, 1.0, -11, 0.3, -0.3, 0.6, 0.4, -14, 1.0, 2.2, 4, 0.02, 0.15, -0.9], PDRAG = [1.6, 0.9, 0.6, 0.15, 2.5, 2.5, 0, 2.2, 0.2, 1.2, 1.5, 2.6, 1.2, 0.6, 1.4];
// color [r,g,b,a] and size for a particle at age t (0..1); colors > 1 glow under additive blending. Written into o (reused: no garbage a frame)
const look5 = (o, r, g, b, a, s) => { o[0] = r; o[1] = g; o[2] = b; o[3] = a; o[4] = s; return o; };
function partLook(q, t, T, o = [0, 0, 0, 0, 0]) {
  const tw = 0.6 + 0.4 * Math.sin(T * 28 + q.seed), sn = Math.sin(Math.PI * t);
  switch (q.k) {
    case FIRE: { const c = t < 0.25 ? lerp3([1.7, 1.45, 0.9], [1.5, 0.6, 0.12], t / 0.25) : lerp3([1.5, 0.6, 0.12], [0.55, 0.09, 0.03], (t - 0.25) / 0.75);
      return look5(o, c[0], c[1] * 0.9, c[2] * 0.8, Math.min(1, 1.1 * (1 - t) ** 1.1), q.s * (0.55 + 0.8 * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.15)))); }
    case SMOKE: return look5(o, 0.12, 0.11, 0.1, 0.42 * sn, q.s * (0.8 + 2.6 * t));
    case EMBER: return look5(o, 1.7, 0.75, 0.2, (1 - t) * tw, q.s);
    case DROP: return look5(o, 0.55, 0.82, 1.35, 0.85 * (1 - t * t), q.s);
    case MIST: return look5(o, 0.78, 0.9, 1, 0.28 * sn, q.s * (1 + 2 * t));
    case FROST: return look5(o, 1.0, 1.25, 1.6, (1 - t) * tw, q.s);
    case WIND: return look5(o, 1, 1.02, 1.1, 0.22 * sn, q.s * (1 + t));
    case DUST: return look5(o, 0.5, 0.42, 0.32, 0.45 * sn, q.s * (1 + 2.2 * t));
    case CHIP: return look5(o, 0.42, 0.34, 0.25, t < 0.85 ? 1 : (1 - t) / 0.15, q.s);
    case SPARK: { const c = q.col ? q.col : q.seed % 1 > 0.6 ? [1.6, 1.4, 0.5] : [0.5, 1.7, 0.6]; return look5(o, c[0], c[1], c[2], (1 - t) * tw, q.s); }
    case BUBBLE: return look5(o, 0.7, 0.9, 1.05, 0.5 * (1 - t * t) * (0.75 + 0.25 * tw), q.s * (1 + 0.4 * t));
    case MOTE: return q.col ? look5(o, q.col[0], q.col[1], q.col[2], 0.3 * sn, q.s) : look5(o, 0.75, 0.85, 0.75, 0.22 * sn, q.s);
    case FLY: return look5(o, 0.16, 0.14, 0.11, 0.85 * Math.min(1, sn * 3), q.s * (0.8 + 0.4 * tw));   // hatching insects
    case LEAFP: return look5(o, q.col[0] * (0.75 + 0.25 * tw), q.col[1] * (0.75 + 0.25 * tw), q.col[2], Math.min(1, (1 - t) * 4), q.s);
    default: return look5(o, 0.92, 0.94, 0.97, 0.35 * sn, q.s * (1 + 2.5 * t)); // STEAM
  }
}
