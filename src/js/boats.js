'use strict';
// ======================================================================
//  BOATS — data too. Each is a JSON definition (see boats/README.md): hull shape and size, colours, how it's driven
//  (paddle, oars, outboard), handling (draft, stability, how rough a water it takes), seats and fittings. The hull is
//  built procedurally from the numbers. Model: metres, +x forward, waterline at z = 0.
// ======================================================================
const BOAT_SCHEMA = 'embercrown-boat/1';
const BOAT_DEFAULTS = {
  schema: BOAT_SCHEMA, id: '', name: '', description: '', waters: null,   // waters: optional menu categories, e.g. ["sea"]
  hull: { length_m: 4.5, beam_m: 0.9, depth_m: 0.4, draft_m: 0.12, bottom: 'round', deadrise_deg: 15, bow: 'pointed', stern: 'pointed', transom_width: 0.8,
    fullness: 0.5, sheer_bow_m: 0.15, sheer_stern_m: 0.15, floor_m: 0.06, decks: { bow: 0.12, stern: 0.12 }, cockpit: null, thickness_m: 0.03 },
  colors: { hull: '#b03a2e', bottom: '', deck: '#d8d0c0', trim: '#3a2a1a', interior: '#c8b896', accent: '#202020' },
  propulsion: { type: 'paddle', max_speed_ms: 1.8, accel_ms2: 0.6, turn_rate: 0.9, reverse: 0.5, noise: 0.1 },
  handling: { stability: 0.5, waves_max: 0.5, current_drift: 1, beach: true },
  crew: { seat_at: 0.25, seat_side: 0, eye_height_m: 0.95 },
  seats: [],
  features: { motor: null, trolling_motor: false, console: null, casting_decks: false, rod_holders: 0, paddle: '', fish_finder: false, livewell: false, cabin: null },
};
const BOAT_REPLACE = new Set(['seats', 'decks', 'cockpit', 'motor', 'console', 'cabin']);
const boatMerge = (a, b) => deepMerge(a, b, BOAT_REPLACE);
function validateBoat(raw) {
  const errors = [], warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { def: null, errors: ['not a JSON object'], warnings };
  for (const k of Object.keys(raw)) if (!(k in BOAT_DEFAULTS) && !k.startsWith('_')) warnings.push(`unknown field "${k}" (ignored)`);
  const d = boatMerge(BOAT_DEFAULTS, raw), H = d.hull, Pr = d.propulsion;
  const num = (v, path, lo, hi) => { if (typeof v !== 'number' || !isFinite(v)) errors.push(`${path} must be a number`); else if (v < lo || v > hi) warnings.push(`${path} = ${v} is outside the usual ${lo}..${hi}`); };
  if (!raw.id || !/^[a-z0-9_\-]+$/.test(raw.id)) errors.push('id is required: lowercase letters, digits, _ or -');
  if (!raw.name) errors.push('name is required');
  num(H.length_m, 'hull.length_m', 2, 15); num(H.beam_m, 'hull.beam_m', 0.5, 5); num(H.depth_m, 'hull.depth_m', 0.2, 2.5); num(H.draft_m, 'hull.draft_m', 0.05, 1.5);
  if (H.draft_m >= H.depth_m) errors.push('hull.draft_m must be less than hull.depth_m (the gunwale has to stay above the water)');
  if (!['round', 'flat', 'vee'].includes(H.bottom)) errors.push('hull.bottom: round, flat or vee');
  if (!['pointed', 'blunt'].includes(H.bow)) errors.push('hull.bow: pointed or blunt (a jon boat\'s squared-off bow)');
  if (!['pointed', 'transom'].includes(H.stern)) errors.push('hull.stern: pointed or transom');
  if (H.cockpit && !(Array.isArray(H.cockpit) && H.cockpit.length === 2 && H.cockpit[0] < H.cockpit[1])) errors.push('hull.cockpit: [from, to] along the length (0 stern .. 1 bow), or null for an open boat');
  if (!['paddle', 'double_paddle', 'oars', 'pedal', 'outboard', 'inboard'].includes(Pr.type)) errors.push('propulsion.type: paddle, double_paddle, oars, pedal, outboard or inboard');
  num(Pr.max_speed_ms, 'propulsion.max_speed_ms', 0.5, 30);
  for (const [k, v] of Object.entries(d.colors)) if (v && !isHex(v)) errors.push(`colors.${k} must be a hex colour`);
  if (!Array.isArray(d.seats)) errors.push('seats must be a list');
  else for (const [i, s] of d.seats.entries()) if (!['thwart', 'bench', 'kayak', 'pedestal'].includes(s.type)) errors.push(`seats[${i}].type: thwart, bench, kayak or pedestal`);
  return { def: errors.length ? null : d, errors, warnings };
}
// the hull's shape: half-beam at the gunwale, keel depth and gunwale height along the length (t: 0 stern .. 1 bow)
function hullShape(H) {
  const L = H.length_m, B = H.beam_m / 2, fl = clamp(H.fullness, 0, 1), tr = H.stern === 'transom', tw = clamp(H.transom_width, 0.2, 1), blunt = H.bow === 'blunt';
  const hb = t => {
    const bowT = blunt ? 0.75 : 0.5 - 0.2 * fl;   // where the bow taper starts
    let w = 1;
    if (t > bowT) { const u = (t - bowT) / (1 - bowT); w = blunt ? 1 - 0.35 * u * u : Math.pow(Math.max(0, 1 - u * u), 0.5 + 0.4 * fl); }
    const sternT = 0.5 - 0.25 * fl - (tr ? 0.1 : 0);
    if (t < sternT) { const u = (sternT - t) / sternT; w *= tr ? 1 - (1 - tw) * u * u : Math.pow(Math.max(0, 1 - u * u), 0.5 + 0.4 * fl); }
    return B * Math.max(w, 0.004);
  };
  const keel = t => { const d = H.draft_m; let k = 1;   // how deep the keel sits: rises toward a pointed bow and stern
    if (!blunt && t > 0.7) k = 1 - 0.75 * sstep(0.7, 1, t); else if (blunt && t > 0.8) k = 1 - 0.8 * sstep(0.8, 1, t);
    if (!tr && t < 0.3) k *= 1 - 0.75 * sstep(0.3, 0, t);
    return d * k; };
  const gun = t => H.depth_m - H.draft_m + H.sheer_bow_m * Math.pow(Math.max(0, t - 0.55) / 0.45, 2) + (tr ? 0 : H.sheer_stern_m * Math.pow(Math.max(0, 0.45 - t) / 0.45, 2));
  // a point on one side of the cross-section: s 0 (keel) .. 1 (gunwale)
  const sec = (t, s) => { const b = hb(t), k = keel(t), g = gun(t);
    if (H.bottom === 'flat') { const yb = b * (blunt && t > 0.8 ? 0.95 : 0.88); return s < 0.45 ? [yb * s / 0.45, -k] : [yb + (b - yb) * (s - 0.45) / 0.55, -k + (g + k) * (s - 0.45) / 0.55]; }
    if (H.bottom === 'vee') { const dr = Math.tan(clamp(H.deadrise_deg, 0, 35) * Math.PI / 180), yc = b * 0.82, zc = -k + yc * dr;
      return s < 0.55 ? [yc * s / 0.55, -k + yc * s / 0.55 * dr] : [yc + (b - yc) * (s - 0.55) / 0.45, zc + (g - zc) * Math.pow((s - 0.55) / 0.45, 0.9)]; }
    return [b * Math.sin(s * Math.PI / 2), -k + (g + k) * (1 - Math.cos(s * Math.PI / 2))]; };
  return { L, hb, keel, gun, sec, x: t => (t - 0.5) * L };
}
function boatMesh(D) {
  const H = D.hull, S = hullShape(H), M = meshBuilder(), C = {}; for (const k in BOAT_DEFAULTS.colors) C[k] = hexRGB(D.colors[k] || D.colors.hull || BOAT_DEFAULTS.colors[k]);
  const NT = 22, NS = 8, th = H.thickness_m, fz = H.floor_m, wl = 0.01, below = C.bottom ? C.bottom : C.hull;
  const decked = t => (H.decks && (t > 1 - (H.decks.bow || 0) || t < (H.decks.stern || 0))) || (H.cockpit && (t < H.cockpit[0] || t > H.cockpit[1]));
  const P = (t, s, sd) => { const [y, z] = S.sec(t, s); return [S.x(t), sd * y, z]; };
  // outer skin (antifouling below the waterline)
  M.mat = MT.GEN;
  // each panel is cut along the waterline, so the antifouling meets the topsides in a clean line, not a staircase of whole panels
  const sWl = t => { let lo = 0, hi = 1; for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (S.sec(t, m)[1] < wl) lo = m; else hi = m; } return (lo + hi) / 2; };
  for (let i = 0; i < NT; i++) { const t0 = i / NT, t1 = (i + 1) / NT, w0 = sWl(t0), w1 = sWl(t1);
    for (let j = 0; j < NS; j++) for (const sd of [1, -1]) {
      const s0 = j / NS, s1 = (j + 1) / NS, m0 = clamp(w0, s0, s1), m1 = clamp(w1, s0, s1);
      if (m0 > s0 || m1 > s0) M.quad(P(t0, s0, sd), P(t1, s0, sd), P(t1, m1, sd), P(t0, m0, sd), below, [S.x(t0), 0, 0.3]);
      if (m0 < s1 || m1 < s1) M.quad(P(t0, m0, sd), P(t1, m1, sd), P(t1, s1, sd), P(t0, s1, sd), C.hull, [S.x(t0), 0, 0.3]);
    } }
  // inside: walls down to the floor, the floor, and the rim along the gunwale
  const inner = (t, sd, z) => { let y = 0; for (let k = 0; k <= 20; k++) { const [yy, zz] = S.sec(t, k / 20); if (zz >= z) { y = yy; break; } y = yy; } return [S.x(t), sd * Math.max(0, y - th), z]; };
  for (let i = 0; i < NT; i++) {
    const t0 = i / NT, t1 = (i + 1) / NT, tm = (t0 + t1) / 2;
    for (const sd of [1, -1]) {
      const g0 = S.gun(t0), g1 = S.gun(t1), o0 = P(t0, 1, sd), o1 = P(t1, 1, sd), in0 = inner(t0, sd, g0 - 0.005), in1 = inner(t1, sd, g1 - 0.005);
      M.mat = MT.WOOD; M.quad(o0, o1, in1, in0, C.trim, [o0[0], 0, -1]);   // gunwale rim
      if (!decked(tm)) { const f0 = inner(t0, sd, fz), f1 = inner(t1, sd, fz); M.mat = MT.GEN; M.quad(in0, in1, f1, f0, C.interior, [o0[0], sd * 2, (g0 + fz) / 2]); }
    }
    if (!decked(tm)) { const a = inner(t0, 1, fz), b = inner(t1, 1, fz), c = inner(t1, -1, fz), e = inner(t0, -1, fz); M.mat = MT.WOOD; M.quad(a, b, c, e, V3.mul(C.interior, 0.9), [a[0], 0, -1]); }
    else { // a deck, crowned a little in the middle, from gunwale to gunwale
      const crown = 0.04 + 0.03 * H.beam_m, D0 = sd => inner(t0, sd, S.gun(t0) - 0.005), D1 = sd => inner(t1, sd, S.gun(t1) - 0.005);
      const m0 = [S.x(t0), 0, S.gun(t0) + crown * Math.min(1, S.hb(t0) * 4)], m1 = [S.x(t1), 0, S.gun(t1) + crown * Math.min(1, S.hb(t1) * 4)];
      M.mat = MT.GEN; for (const sd of [1, -1]) M.quad(D0(sd), D1(sd), m1, m0, C.deck, [m0[0], 0, -1]);
    }
  }
  // closing walls where an open cockpit meets a deck (bulkheads), and the transom
  const bulk = t => { const g = S.gun(t), n = 10; for (const sd of [1, -1]) for (let k = 0; k < n; k++) { const z0 = fz + (g - fz) * k / n, z1 = fz + (g - fz) * (k + 1) / n; M.quad(inner(t, sd, z0), inner(t, sd, z1), [S.x(t), 0, z1], [S.x(t), 0, z0], C.interior, [S.x(t) + 1, 0, 0]); } };
  M.mat = MT.GEN;
  for (let i = 1; i < NT; i++) { const t = i / NT, a = decked(t - 0.5 / NT), b = decked(t + 0.5 / NT); if (a !== b) bulk(t); }
  if (H.stern === 'transom') { M.mat = MT.GEN; for (let j = 0; j < NS; j++) for (const sd of [1, -1]) { const a = P(0, j / NS, sd), b = P(0, (j + 1) / NS, sd); M.tri([S.x(0), 0, S.gun(0) * 0.3 - S.keel(0) * 0.7], a, b, (a[2] + b[2]) / 2 < wl ? below : C.hull, [S.x(0) + 1, 0, 0]); }
    M.tri([S.x(0), 0, S.gun(0)], P(0, 1, 1), P(0, 1, -1), C.hull, [S.x(0) + 1, 0, 0]); if (!decked(0.02)) bulk(0.001); }
  if (H.bow === 'blunt') { const t = 1, n = NS; for (let j = 0; j < n; j++) for (const sd of [1, -1]) M.tri([S.x(t), 0, S.gun(t) * 0.5 - S.keel(t) * 0.5], P(t, j / n, sd), P(t, (j + 1) / n, sd), C.hull, [S.x(t) - 1, 0, 0]); if (!decked(0.98)) bulk(0.999); }
  if (H.cockpit) { const [c0, c1] = H.cockpit, n = 18; M.mat = MT.GEN;   // a coaming lip round the cockpit
    for (let k = 0; k < n; k++) { const a0 = k / n * TAU, a1 = (k + 1) / n * TAU, cx = S.x((c0 + c1) / 2), rx = (c1 - c0) / 2 * S.L, ry = S.hb((c0 + c1) / 2) * 0.82, z = S.gun((c0 + c1) / 2) + 0.05;
      M.tube([cx + Math.cos(a0) * rx, Math.sin(a0) * ry, z], [cx + Math.cos(a1) * rx, Math.sin(a1) * ry, z], 0.018, 0.018, 4, C.trim); } }
  // seats
  for (const st of D.seats) {
    const t = clamp(st.at, 0.02, 0.98), x = S.x(t), w = Math.max(0.05, S.hb(t) - th) * (st.type === 'thwart' ? 1 : 0.8), g = S.gun(t);
    if (st.type === 'thwart') { M.mat = MT.WOOD; M.quad([x - 0.1, -w, g - 0.06], [x + 0.1, -w, g - 0.06], [x + 0.1, w, g - 0.06], [x - 0.1, w, g - 0.06], C.trim, [x, 0, -1]); M.quad([x - 0.1, -w, g - 0.09], [x - 0.1, w, g - 0.09], [x + 0.1, w, g - 0.09], [x + 0.1, -w, g - 0.09], C.trim, [x, 0, 1]); }
    else if (st.type === 'bench') { M.mat = MT.WOOD; const z = fz + (st.height ?? 0.32); M.quad([x - 0.18, -w, z], [x + 0.18, -w, z], [x + 0.18, w, z], [x - 0.18, w, z], C.deck, [x, 0, -1]); M.quad([x - 0.18, -w, fz], [x - 0.18, -w, z], [x - 0.18, w, z], [x - 0.18, w, fz], V3.mul(C.deck, 0.8), [x + 1, 0, 0]); }
    else if (st.type === 'kayak') { M.mat = MT.CLOTH; M.blob([x, 0, fz + 0.04], 0.22, 0.2, 0.04, 3, 8, C.accent); M.quad([x - 0.2, -0.17, fz + 0.06], [x - 0.24, -0.17, fz + 0.38], [x - 0.24, 0.17, fz + 0.38], [x - 0.2, 0.17, fz + 0.06], C.accent, [x + 1, 0, 0.2]); }
    else if (st.type === 'pedestal') { const z = fz + (st.height ?? 0.6); M.mat = MT.METAL; M.tube([x, 0, fz], [x, 0, z - 0.05], 0.03, 0.03, 6, [0.7, 0.7, 0.72]); M.mat = MT.CLOTH; M.blob([x, 0, z], 0.22, 0.22, 0.06, 3, 10, C.accent); M.quad([x - 0.2, -0.18, z], [x - 0.22, -0.18, z + 0.32], [x - 0.22, 0.18, z + 0.32], [x - 0.2, 0.18, z], C.accent, [x + 1, 0, 0.2]); }
  }
  const F = D.features;
  if (F.casting_decks) { M.mat = MT.CLOTH;   // carpeted platforms fore and aft, nearly at the gunwale
    for (const [ta, tb] of [[0.68, 0.97], [0.02, 0.2]]) for (let i = 0; i < 6; i++) { const t0 = ta + (tb - ta) * i / 6, t1 = ta + (tb - ta) * (i + 1) / 6, z0 = S.gun(t0) - 0.12, z1 = S.gun(t1) - 0.12;
      const a = inner(t0, 1, z0), b = inner(t1, 1, z1), c = inner(t1, -1, z1), e = inner(t0, -1, z0); M.quad(a, b, c, e, C.deck, [a[0], 0, -1]); } }
  if (F.console) { const t = F.console.at ?? 0.45, x = S.x(t), oy = -(F.console.side ?? 0) * S.hb(t), w = Math.min(0.35, S.hb(t) * (F.console.side ? 0.25 : 0.45)), h = F.console.height ?? 0.95, z0 = fz;   // helm console with a windscreen (side: off to starboard, as on a bass boat)
    M.mat = MT.GEN; const box = (x0, x1, ya, yb, za, zb, col) => { const y0 = ya + oy, y1 = yb + oy; M.quad([x0, y0, zb], [x1, y0, zb], [x1, y1, zb], [x0, y1, zb], col, [x0, 0, -9]);
      for (const [p, q] of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]]) M.quad([p[0], p[1], za], [q[0], q[1], za], [q[0], q[1], zb], [p[0], p[1], zb], col, [(x0 + x1) / 2, (y0 + y1) / 2, (za + zb) / 2]); };
    const scr = F.console.screen ?? 0.3; box(x - 0.3, x + 0.25, -w, w, z0, z0 + h, C.deck); M.mat = MT.GLASS; M.quad([x + 0.25, oy - w, z0 + h], [x + 0.25 + scr * 0.25, oy - w, z0 + h + scr], [x + 0.25 + scr * 0.25, oy + w, z0 + h + scr], [x + 0.25, oy + w, z0 + h], [0.6, 0.75, 0.85], [x - 1, 0, 0]);
    M.mat = MT.METAL; M.tube([x - 0.05, oy, z0 + h + 0.02], [x - 0.15, oy, z0 + h + 0.12], 0.012, 0.012, 5, [0.2, 0.2, 0.22]); M.blob([x - 0.16, oy, z0 + h + 0.13], 0.11, 0.11, 0.015, 2, 10, [0.15, 0.15, 0.16]);   // wheel
    if (F.fish_finder) { const fw = Math.min(0.09, w * 0.5); M.mat = MT.GLOW; M.quad([x + 0.12, oy - fw, z0 + h + 0.01], [x + 0.12, oy + fw, z0 + h + 0.01], [x + 0.16, oy + fw, z0 + h + 0.11], [x + 0.16, oy - fw, z0 + h + 0.11], [0.25, 0.75, 0.9], [x - 1, 0, 0]); } }
  else if (F.fish_finder) { const t = clamp(D.crew.seat_at + 0.1, 0, 0.95), x = S.x(t), g = S.gun(t); M.mat = MT.GLOW; M.quad([x, -0.08, g + 0.04], [x, 0.08, g + 0.04], [x + 0.03, 0.08, g + 0.16], [x + 0.03, -0.08, g + 0.16], [0.3, 0.9, 1.1], [x - 1, 0, 0]); }
  if (F.motor) { const hp = clamp(F.motor.hp ?? 25, 2, 450), sc = 0.55 + 0.35 * Math.log10(hp), x = S.x(0) - 0.12 * sc, g = S.gun(0), col = hexRGB(F.motor.color || '#202020');   // an outboard on the transom
    M.mat = MT.METAL; M.blob([x - 0.08 * sc, 0, g + 0.22 * sc], 0.22 * sc, 0.17 * sc, 0.25 * sc, 4, 10, col);
    M.tube([x, 0, g], [x, 0, -S.keel(0) - 0.25 * sc], 0.06 * sc, 0.045 * sc, 6, V3.mul(col, 0.85));
    M.blob([x + 0.02, 0, -S.keel(0) - 0.25 * sc], 0.14 * sc, 0.05 * sc, 0.05 * sc, 3, 8, V3.mul(col, 0.8));
    for (let k = 0; k < 3; k++) { const a = k * 2.09; M.blob([x - 0.12 * sc, Math.cos(a) * 0.07 * sc, -S.keel(0) - 0.25 * sc + Math.sin(a) * 0.07 * sc], 0.01, 0.06 * sc, 0.03 * sc, 2, 6, [0.6, 0.6, 0.62]); } }
  if (F.trolling_motor) { const x = S.x(0.97), g = S.gun(0.97); M.mat = MT.METAL; M.tube([x, 0, g + 0.15], [x + 0.05, 0, -0.4], 0.015, 0.015, 5, [0.2, 0.2, 0.22]); M.blob([x + 0.05, 0, -0.42], 0.1, 0.04, 0.04, 3, 8, [0.15, 0.15, 0.17]); M.blob([x, 0, g + 0.17], 0.08, 0.06, 0.05, 3, 8, [0.15, 0.15, 0.17]); }
  for (let k = 0; k < (F.rod_holders | 0); k++) { const t = 0.15 + 0.12 * (k >> 1), sd = k % 2 ? 1 : -1, x = S.x(t), y = sd * (S.hb(t) - 0.03), g = S.gun(t); M.mat = MT.METAL; M.tube([x, y, g - 0.08], [x - 0.04, y + sd * 0.02, g + 0.06], 0.02, 0.02, 5, [0.8, 0.8, 0.82], true); }
  if (F.cabin) { const t0 = F.cabin.from ?? 0.45, t1 = F.cabin.to ?? 0.8, h = F.cabin.height ?? 1.1; M.mat = MT.GEN;   // a small wheelhouse
    const x0 = S.x(t0), x1 = S.x(t1), w = Math.min(S.hb(t0), S.hb(t1)) * 0.85, z0 = fz, z1 = fz + h;
    // each wall is a sill, a header and two posts round an open window, so you can see out from the helm inside
    const zs = z1 - 0.95, zt = z1 - 0.15, L = (p, q, u, z) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, z];
    for (const [p, q] of [[[x0, -w], [x1, -w]], [[x1, w], [x0, w]], [[x1, -w], [x1, w]], [[x0, w], [x0, -w]]])
      for (const [u0, u1, za, zb] of [[0, 1, z0, zs], [0, 1, zt, z1], [0, 0.1, zs, zt], [0.9, 1, zs, zt]])
        M.quad(L(p, q, u0, za), L(p, q, u1, za), L(p, q, u1, zb), L(p, q, u0, zb), C.deck, [(x0 + x1) / 2, 0, (z0 + z1) / 2]);
    M.quad([x0 - 0.05, -w - 0.05, z1], [x1 + 0.05, -w - 0.05, z1], [x1 + 0.05, w + 0.05, z1], [x0 - 0.05, w + 0.05, z1], C.trim, [x0, 0, 0]); }
  D._hullN = M.v.length / VS;   // the hull's own vertices; the oars / paddle (at rest) follow, for the menu picture
  const O = D._oars = boatOars(D, S, C); if (O) { const m = new Float32Array(O.mesh.length); for (const sd of O.kind === 'oars' ? [1, -1] : [1]) { oarPose(D, O, 0, 0, sd, false, O.m); oarXform(O.mesh, O.m, m); for (const v of m) M.v.push(v); } }
  return new Float32Array(M.v);
}
// ---- oars and paddles: one small mesh about its pivot (a rowlock, the paddler's lower hand, the middle of a kayak paddle), posed every frame ----
function boatOars(D, S, C) {
  const F = D.features, kind = F.paddle === 'oars' ? 'oars' : F.paddle === 'double' ? 'double' : F.paddle ? 'single' : ''; if (!kind) return null;
  const M = meshBuilder(); M.mat = MT.WOOD;
  if (kind === 'oars') { M.tube([0, -0.55, 0], [0, 1.3, 0], 0.02, 0.018, 5, C.trim); M.blob([0, 1.47, 0], 0.012, 0.24, 0.07, 3, 8, C.accent); }   // shaft out along +y, handle inboard
  else if (kind === 'double') { M.tube([0, -1.1, 0], [0, 1.1, 0], 0.015, 0.015, 5, C.trim); for (const sd of [1, -1]) M.blob([0, sd * 1.12, 0], 0.012, 0.22, 0.08, 3, 8, C.accent); }
  else { M.tube([0, 0, -0.45], [0, 0, 0.75], 0.015, 0.015, 5, C.trim); M.blob([0, 0, 0.78], 0.02, 0.06, 0.02, 2, 6, C.trim); M.blob([0, 0, -0.62], 0.012, 0.09, 0.2, 3, 8, C.accent); }   // grip up, blade down
  return { kind, mesh: new Float32Array(M.v), live: ['paddle', 'double_paddle', 'oars'].includes(D.propulsion.type), m: new Float32Array(12) };   // live: worked from the helm (a pedal kayak's paddle stays stowed)
}
// pose of one oar / paddle in the boat's frame (out: 3x3 rotation, column-major, then the pivot): ph the stroke phase, k how hard you're
// pulling (0..1), sd the side (oars: +1 starboard, -1 port), live false: stowed. Blade in the water while sin(ph) > 0, sweeping aft.
function oarPose(D, O, ph, k, sd, live, out) {
  const S = D._shape || hullShape(D.hull), H = D.hull, ts = clamp(D.crew.seat_at, 0, 1), dr = sstep(-0.3, 0.3, Math.sin(ph)), c = Math.cos(ph);
  const rx = a => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)], ry = a => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)], rz = a => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1];
  const mm = (A, B) => { const R = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) R[j * 3 + i] = A[i] * B[j * 3] + A[3 + i] * B[j * 3 + 1] + A[6 + i] * B[j * 3 + 2]; return R; };
  let R, T;
  if (O.kind === 'oars') { const t = clamp(ts + 0.08, 0, 0.9), g = S.gun(t), din = Math.asin(clamp((g + 0.12) / 1.47, 0, 0.9));   // dipped just enough to bury the blade
    const th = live ? 0.65 * k * c : -1.1, dip = live ? din - 0.25 + 0.25 * dr * Math.min(1, k * 2) : 0.12;   // stowed: trailing aft along the hull
    R = mm(rz(-th), rx(-dip)); T = [S.x(t), S.hb(t), g + 0.05]; }
  else if (O.kind === 'double') { const t = clamp(ts + (live ? 0 : 0.15), 0, 0.9), g = S.gun(t);
    R = live ? mm(rz(-0.5 * k * c), rx(-0.62 * k * Math.sin(ph))) : ry(Math.PI / 2); T = live ? [S.x(t) + 0.45, 0, g + 0.22] : [S.x(t), 0, g + 0.08]; }
  else { const t = clamp(ts + (live ? 0 : 0.15), 0, 0.9), g = S.gun(t);   // single blade on the starboard side: reach forward, pull aft, lift and feather out
    R = live ? mm(rx(0.15 + 0.5 * (1 - dr * k)), ry(-0.35 * k * c)) : ry(Math.PI / 2);
    T = live ? [S.x(t) + 0.3 + 0.32 * k * c, S.hb(t) + 0.07, g + 0.12 + 0.3 * (1 - dr * k)] : [S.x(t), 0.12, H.floor_m + 0.04]; }
  for (let i = 0; i < 9; i++) out[i] = R[i] * (i % 3 === 1 ? sd : 1); out[9] = T[0]; out[10] = sd * T[1]; out[11] = T[2];   // the port side is the mirror image
  return out;
}
// the oar mesh (src) posed by m into dst: positions and normals
function oarXform(src, m, dst) {
  for (let o = 0; o < src.length; o += VS) { const x = src[o], y = src[o + 1], z = src[o + 2], nx = src[o + 3], ny = src[o + 4], nz = src[o + 5];
    dst[o] = m[0] * x + m[3] * y + m[6] * z + m[9]; dst[o + 1] = m[1] * x + m[4] * y + m[7] * z + m[10]; dst[o + 2] = m[2] * x + m[5] * y + m[8] * z + m[11];
    dst[o + 3] = m[0] * nx + m[3] * ny + m[6] * nz; dst[o + 4] = m[1] * nx + m[4] * ny + m[7] * nz; dst[o + 5] = m[2] * nx + m[5] * ny + m[8] * nz;
    for (let q = 6; q < VS; q++) dst[o + q] = src[o + q]; }
  return dst;
}
// where the water must not show: the hull's half-beam at the waterline and at the gunwale, 12 stations stern to bow (for the water shader)
function hullWaterTable(H, S) {
  const tab = new Float32Array(24);
  for (let i = 0; i < 12; i++) { const t = i / 11; let lo = 0, hi = 1; for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (S.sec(t, m)[1] < 0) lo = m; else hi = m; }
    tab[i] = S.sec(t, lo)[0]; tab[12 + i] = S.hb(t); }
  return tab;
}
const BoatDB = {
  list: [], byId: {}, gpu: [],
  register(raw, { quiet = false } = {}) {
    const r = validateBoat(raw);
    if (!r.def) { if (!quiet) console.warn('Boat rejected:', raw && raw.id, r.errors); return r; }
    const d = r.def; d._shape = hullShape(d.hull); d._mesh = boatMesh(d); d._wtab = hullWaterTable(d.hull, d._shape); d._fb = (d._shape.gun(0.25) + d._shape.gun(0.5) + d._shape.gun(0.75)) / 3;
    const old = this.byId[d.id]; if (old) { const i = this.list.indexOf(old); this.list[i] = d; if (this.gpu[i]) this.gpu[i].stale = true; } else this.list.push(d);
    this.byId[d.id] = d; if (r.warnings.length && !quiet) console.info(`Boat "${d.id}" notes:`, r.warnings); return r;
  },
};
