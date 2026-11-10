'use strict';
// ======================================================================
//  BOAT DETAIL — the fittings and trim that make a hull read as a boat: rub rails, keel and chine strakes, a boot stripe,
//  cleats, a bow eye, navigation lights, ribs, bench fronts and cushions, a spoked wheel and console fittings, outboard
//  brackets, tillers and a fuel tank, wheelhouse roof gear, deck hatches, an anchor, kayak deck lines.
//  boatMesh() (boats.js) builds the hull, seats and features, then calls boatDetail() to add these on top; everything is placed
//  from the hull's own shape (S), so it follows any size or build. X: { inner, P, fz, decked, motors: [[x, y, scale, gunwale, colour, hp]] }.
// ======================================================================
function boatDetail(D, S, M, C, X) {
  const H = D.hull, F = D.features, L = H.length_m, k = clamp(L / 5, 0.7, 1.8), NT = 22, { inner, P, fz, decked, motors } = X;
  const steel = [0.78, 0.79, 0.81], dark = [0.13, 0.13, 0.14], rope = [0.82, 0.76, 0.58], powered = ['outboard', 'inboard'].includes(D.propulsion.type), kayak = !!H.cockpit, tr = H.stern === 'transom', blunt = H.bow === 'blunt';
  const crown = 0.04 + 0.03 * H.beam_m, deckZ = (t, y = 0) => S.gun(t) + crown * Math.min(1, S.hb(t) * 4) * (1 - Math.min(1, Math.abs(y) / Math.max(0.05, S.hb(t)))) + 0.006;   // the top of a crowned deck
  const rod = (a, b, r, col, n = 4) => M.tube(a, b, r, r, n, col, false);
  // a closed box (no bottom): top and four sides
  const box = (x0, x1, y0, y1, z0, z1, col) => { const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]; M.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, [c[0], c[1], z0 - 9]);
    for (const [p, q] of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]]) M.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], col, c); };
  // a ring of rod: centre c, radius r, in the plane spanned by unit vectors u and v
  const ring = (c, r, u, v, th, col, n = 12) => { for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, at = a => [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r]; rod(at(a0), at(a1), th, col); } };
  // where the waterline meets the hull at station t (s along the section, 0 keel .. 1 gunwale)
  const sAt = (t, z) => { let lo = 0, hi = 1; for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (S.sec(t, m)[1] < z) lo = m; else hi = m; } return (lo + hi) / 2; };

  // ---- the hull's lines ----
  M.mat = MT.PLASTER;
  { const r = 0.016 * k, col = C.accent, out = (t, sd) => { const p = P(t, 1, sd); return [p[0], p[1] + sd * r * 0.6, p[2] - r * 0.7]; };   // rub rail: a bead right round, just under the gunwale
    for (let i = 0; i < NT; i++) for (const sd of [1, -1]) rod(out(i / NT, sd), out((i + 1) / NT, sd), r, col);
    if (tr) rod(out(0, 1), out(0, -1), r, col); if (blunt) rod(out(1, 1), out(1, -1), r, col); }
  { const r = 0.014 * k, col = V3.mul(C.bottom && C.bottom.length ? C.bottom : C.hull, 0.8), t1 = blunt ? 0.97 : 0.9;   // a keel strip along the bottom, turning up into the stem
    for (let i = 0; i < NT; i++) { const a = i / NT, b = (i + 1) / NT; if (b <= t1 + 1e-6) rod([S.x(a), 0, -S.keel(a) - r * 0.5], [S.x(b), 0, -S.keel(b) - r * 0.5], r, col); }
    if (!blunt) rod([S.x(0.9), 0, -S.keel(0.9) - r * 0.5], [S.x(1) - 0.01, 0, S.gun(1) * 0.55], r, col); }
  if (H.bottom !== 'round') { const s = H.bottom === 'vee' ? 0.55 : 0.45, r = 0.012 * k, col = V3.mul(C.bottom && C.bottom.length ? C.bottom : C.hull, 0.85);   // chine strake: the hard corner where bottom meets side
    for (let i = 0; i < NT - 1; i++) for (const sd of [1, -1]) rod(P(i / NT, s, sd), P((i + 1) / NT, s, sd), r, col); }
  if (D.colors.bottom && L > 4) { const r = 0.011 * k, col = C.accent, at = (t, sd) => P(t, sAt(t, 0.07 * k), sd);   // boot stripe: a painted line just above the waterline
    for (let i = 0; i < NT - 1; i++) for (const sd of [1, -1]) rod(at(i / NT, sd), at((i + 1) / NT, sd), r, col); }

  // ---- inside ----
  if (H.bottom === 'round' && !kayak && L < 6) { const col = C.trim, r = 0.009;   // steam-bent ribs up the inside of a canoe or rowboat
    for (let t = 0.14; t < 0.88; t += 0.35 / L) { if (decked(t)) continue; const g = S.gun(t) - 0.02;
      for (const sd of [1, -1]) for (let j = 0; j < 5; j++) rod(inner(t, sd, fz + (g - fz) * j / 5), inner(t, sd, fz + (g - fz) * (j + 1) / 5), r, col, 3);
      rod(inner(t, 1, fz), inner(t, -1, fz), r, col, 3); } }
  if (H.bottom === 'flat' && !kayak && !F.casting_decks) { const col = V3.mul(C.interior, 0.82);   // pressed ribs across an aluminium floor
    for (let t = 0.2; t < 0.9; t += 0.45 / L) { if (decked(t) || D.seats.some(s => Math.abs(s.at - t) < 0.3 / L)) continue; const a = inner(t, 1, fz), b = inner(t, -1, fz); box(a[0] - 0.025, a[0] + 0.025, b[1], a[1], fz, fz + 0.03, col); } }
  for (const st of D.seats) { const t = clamp(st.at, 0.02, 0.98), x = S.x(t), w = Math.max(0.05, S.hb(t) - H.thickness_m) * 0.8, z = fz + (st.height ?? 0.32);
    if (st.type === 'bench') { M.mat = MT.PLASTER; M.quad([x + 0.18, -w, fz], [x + 0.18, w, fz], [x + 0.18, w, z], [x + 0.18, -w, z], V3.mul(C.deck, 0.8), [x - 1, 0, 0]);   // the bench's forward face (it only had an aft one)
      for (const dx of [-0.18, 0.18]) rod([x + dx, -w, z], [x + dx, w, z], 0.012, C.trim);   // rolled edges
      if ((st.height ?? 0.32) >= 0.5) { M.mat = MT.CLOTH; box(x - 0.16, x + 0.16, -w * 0.9, w * 0.9, z, z + 0.05, C.accent); box(x - 0.2, x - 0.14, -w * 0.9, w * 0.9, z, z + 0.38, C.accent); } }   // a helm seat: cushion and backrest
    if (st.type === 'locker') { M.mat = MT.METAL; for (const sy of [-0.5, 0.5]) box(x + 0.26, x + 0.275, sy * w - 0.03, sy * w + 0.03, z - 0.06, z + 0.02, steel); } }   // latches

  // ---- deck hardware ----
  M.mat = MT.METAL;
  if (!kayak && L >= 4) for (const t of [0.07, 0.86]) for (const sd of [1, -1]) { const p = inner(t, sd, S.gun(t)), x = p[0], y = p[1] + sd * 0.01, z = p[2] + 0.004;   // cleats, fore and aft
      rod([x - 0.07 * k, y, z + 0.035], [x + 0.07 * k, y, z + 0.035], 0.011 * k, steel); for (const dx of [-0.025, 0.025]) rod([x + dx * k, y, z], [x + dx * k, y, z + 0.035], 0.012 * k, steel); }
  if (!blunt && !kayak && L >= 3.5) M.blob([S.x(1) + 0.01, 0, S.gun(1) * 0.5], 0.035 * k, 0.02 * k, 0.03 * k, 3, 6, steel);   // bow eye
  if (powered) { M.mat = MT.GLOW;   // navigation lights: red to port, green to starboard, a white all-round light on a pole aft
    for (const [sd, col] of [[1, [1.5, 0.12, 0.1]], [-1, [0.1, 1.4, 0.25]]]) { const p = P(0.9, 1, sd); M.blob([p[0], p[1] - sd * 0.04, p[2] + 0.03], 0.03, 0.02, 0.022, 3, 6, col); }
    if (L >= 5 && !F.cabin) { const p = inner(0.03, -1, S.gun(0.03)); M.mat = MT.METAL; rod([p[0], p[1], p[2]], [p[0], p[1], p[2] + 0.9], 0.012, steel); M.mat = MT.GLOW; M.blob([p[0], p[1], p[2] + 0.93], 0.03, 0.03, 0.035, 3, 6, [1.5, 1.5, 1.4]); } }
  if (!kayak && (H.decks.bow || 0) > 0.05 && L >= 4) { const t = 1 - H.decks.bow * 0.55, x = S.x(t), z = deckZ(t);   // on the foredeck: a coil of rope and a small anchor
    M.mat = MT.CLOTH; for (let i = 0; i < 3; i++) ring([x, 0.02, z + 0.012 + i * 0.016], 0.085 * k - i * 0.012, [1, 0, 0], [0, 1, 0], 0.011, rope, 10);
    if (L >= 5) { M.mat = MT.METAL; const ax = x - 0.3 * k; rod([ax, -0.1, z + 0.02], [ax + 0.24, -0.1, z + 0.02], 0.012, dark); rod([ax + 0.24, -0.2, z + 0.02], [ax + 0.24, 0, z + 0.02], 0.012, dark); rod([ax + 0.03, -0.16, z + 0.02], [ax + 0.03, -0.04, z + 0.02], 0.009, dark); } }
  if (F.casting_decks) { M.mat = MT.PLASTER; const col = V3.mul(C.deck, 0.8);   // hatch lids let into the casting decks
    for (const [t, half] of [[0.8, 0.5], [0.1, 0.45]]) { const x = S.x(t), w = S.hb(t) * half, z = S.gun(t) - 0.12 + 0.008; M.quad([x - 0.22, -w, z], [x + 0.22, -w, z], [x + 0.22, w, z], [x - 0.22, w, z], col, [x, 0, -9]); M.mat = MT.METAL; rod([x + 0.2, -0.05, z + 0.012], [x + 0.2, 0.05, z + 0.012], 0.009, steel); M.mat = MT.PLASTER; } }
  if (F.livewell) { const t = 0.24, x = S.x(t), w = Math.max(0.1, S.hb(t) - 0.12), y0 = w * 0.25; M.mat = MT.PLASTER; box(x - 0.24, x + 0.24, y0, y0 + Math.min(0.5, w * 0.7), fz, fz + 0.34, C.deck);   // a livewell: a tank with a blue lid
    box(x - 0.25, x + 0.25, y0 - 0.01, y0 + Math.min(0.5, w * 0.7) + 0.01, fz + 0.34, fz + 0.37, [0.2, 0.42, 0.62]); }
  if (kayak) { M.mat = MT.CLOTH; const c1 = H.cockpit[1], c0 = H.cockpit[0];   // a kayak's deck lines, a hatch behind the seat, carry toggles
    for (const [ta, tb] of [[c1 + 0.06, c1 + 0.17], [c1 + 0.17, c1 + 0.06]]) { const wa = S.hb(c1 + 0.06) * 0.6, wb = S.hb(c1 + 0.17) * 0.6; rod([S.x(ta), ta < tb ? -wa : wa, deckZ(ta, wa) + 0.006], [S.x(tb), ta < tb ? wb : -wb, deckZ(tb, wb) + 0.006], 0.006, dark, 3); }
    if (c0 > 0.2) { const t = c0 * 0.55; M.mat = MT.PLASTER; M.blob([S.x(t), 0, deckZ(t) + 0.004], 0.16, Math.min(0.14, S.hb(t) * 0.6), 0.014, 3, 10, dark); }
    M.mat = MT.CLOTH; for (const t of [0.015, 0.985]) rod([S.x(t), -0.05, S.gun(t) + 0.02], [S.x(t), 0.05, S.gun(t) + 0.02], 0.012, dark); }

  // ---- the helm ----
  if (F.console) { const cs = F.console, t = cs.at ?? 0.45, x = S.x(t), oy = -(cs.side ?? 0) * S.hb(t), w = Math.min(0.35, S.hb(t) * (cs.side ? 0.25 : 0.45)), h = cs.height ?? 0.95, top = fz + h, scr = cs.screen ?? 0.3;
    M.mat = MT.METAL; const wc = [x - 0.2, oy, top - 0.1], u = [0, 1, 0], v = [-0.42, 0, 0.91];   // a spoked wheel, raked back on the aft face
    ring(wc, 0.15, u, v, 0.012, dark, 12); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; rod(wc, [wc[0] + v[0] * Math.sin(a) * 0.15, wc[1] + Math.cos(a) * 0.15, wc[2] + v[2] * Math.sin(a) * 0.15], 0.009, steel, 3); }
    rod([x - 0.3, oy, top - 0.14], wc, 0.02, steel);
    rod([x - 0.05, oy + w * 0.75, top], [x - 0.12, oy + w * 0.75, top + 0.15], 0.012, steel); M.blob([x - 0.125, oy + w * 0.75, top + 0.165], 0.022, 0.022, 0.025, 3, 6, dark);   // throttle lever
    M.mat = MT.PLASTER; for (const sy of [-0.45, 0.1]) M.blob([x + 0.02, oy + sy * w, top + 0.008], 0.045, 0.045, 0.008, 2, 8, dark);   // gauges
    M.mat = MT.METAL; const a = [x + 0.25, oy - w, top], b = [x + 0.25 + scr * 0.25, oy - w, top + scr], c = [x + 0.25 + scr * 0.25, oy + w, top + scr], e = [x + 0.25, oy + w, top];   // windscreen frame and a grab rail over it
    rod(a, b, 0.011, steel); rod(b, c, 0.011, steel); rod(c, e, 0.011, steel);
    if (h >= 0.8) { for (const sy of [-1, 1]) rod([x - 0.3, oy + sy * w, top], [x - 0.3, oy + sy * w, top + scr + 0.1], 0.013, steel); rod([x - 0.3, oy - w, top + scr + 0.1], [x - 0.3, oy + w, top + scr + 0.1], 0.013, steel); }
    if (L >= 7 && !cs.side) { const zt = fz + 2.05, px = [x - 0.34, x + 0.3], pw = w + 0.06;   // a T-top over a big centre console: four legs and a canopy
      for (const xx of px) for (const sy of [-1, 1]) rod([xx, oy + sy * pw, fz], [xx + (xx < x ? -0.2 : 0.15), oy + sy * pw * 1.25, zt], 0.02, steel, 5);
      M.mat = MT.CLOTH; box(x - 0.85, x + 0.7, oy - pw * 1.7, oy + pw * 1.7, zt, zt + 0.05, C.accent); M.quad([x - 0.85, oy - pw * 1.7, zt], [x - 0.85, oy + pw * 1.7, zt], [x + 0.7, oy + pw * 1.7, zt], [x + 0.7, oy - pw * 1.7, zt], V3.mul(C.accent, 0.8), [x, oy, zt + 9]); } }
  if (F.cabin) { const cb = F.cabin, t0 = cb.from ?? 0.45, t1 = cb.to ?? 0.8, x0 = S.x(t0), x1 = S.x(t1), w = Math.min(S.hb(t0), S.hb(t1)) * 0.85, z1 = fz + (cb.height ?? 1.1), zs = z1 - 0.95, zt = z1 - 0.15;
    M.mat = MT.METAL; for (const sy of [-1, 1]) { rod([x0 + 0.1, sy * (w - 0.08), z1 + 0.09], [x1 - 0.1, sy * (w - 0.08), z1 + 0.09], 0.014, steel); for (const xx of [x0 + 0.1, (x0 + x1) / 2, x1 - 0.1]) rod([xx, sy * (w - 0.08), z1], [xx, sy * (w - 0.08), z1 + 0.09], 0.012, steel); }   // roof rails
    const mx = x0 + 0.25; rod([mx, 0, z1], [mx, 0, z1 + 0.85], 0.022, steel, 5); rod([mx, -0.3, z1 + 0.6], [mx, 0.3, z1 + 0.6], 0.012, steel);   // a mast with a crosstree, the masthead light, a radar dome
    M.mat = MT.GLOW; M.blob([mx, 0, z1 + 0.89], 0.035, 0.035, 0.04, 3, 6, [1.5, 1.5, 1.4]);
    M.mat = MT.PLASTER; M.blob([(x0 + x1) / 2 + 0.15, 0, z1 + 0.13], 0.24, 0.24, 0.09, 3, 10, [0.92, 0.92, 0.9]); rod([(x0 + x1) / 2 + 0.15, 0, z1], [(x0 + x1) / 2 + 0.15, 0, z1 + 0.06], 0.05, steel, 6);
    for (const sy of [-1, 1]) for (const zz of [zs, zt]) rod([x0, sy * (w + 0.012), zz], [x1, sy * (w + 0.012), zz], 0.014, C.trim);   // trim along the window sills and heads
    for (const xx of [x0 - 0.012, x1 + 0.012]) for (const zz of [zs, zt]) rod([xx, -w, zz], [xx, w, zz], 0.014, C.trim);
    M.mat = MT.CLOTH; ring([(x0 + x1) / 2, w + 0.04, zs - 0.32], 0.2, [1, 0, 0], [0, 0, 1], 0.045, [1.0, 0.42, 0.1], 10);   // a life ring on the port side
    M.mat = MT.METAL; const ex = x0 + 0.12, ey = -(w - 0.14); rod([ex, ey, z1], [ex, ey, z1 + 0.55], 0.04, dark, 6); }   // exhaust stack

  // ---- engines ----
  for (const [x, y, sc, g, col, hp] of motors || []) { M.mat = MT.METAL;
    box(x + 0.04 * sc, x + 0.14 * sc, y - 0.09 * sc, y + 0.09 * sc, g - 0.2 * sc, g + 0.03 * sc, dark);   // the clamp bracket over the transom
    M.blob([x - 0.03 * sc, y, -S.keel(0) - 0.13 * sc], 0.2 * sc, 0.1 * sc, 0.012 * sc, 2, 8, V3.mul(col, 0.8));   // anti-ventilation plate above the propeller
    M.tri([x - 0.06 * sc, y, -S.keel(0) - 0.29 * sc], [x + 0.08 * sc, y, -S.keel(0) - 0.29 * sc], [x - 0.04 * sc, y, -S.keel(0) - 0.47 * sc], V3.mul(col, 0.75), [x, y + 1, 0]);   // skeg (seen from both sides)
    M.tri([x - 0.06 * sc, y, -S.keel(0) - 0.29 * sc], [x + 0.08 * sc, y, -S.keel(0) - 0.29 * sc], [x - 0.04 * sc, y, -S.keel(0) - 0.47 * sc], V3.mul(col, 0.75), [x, y - 1, 0]);
    M.blob([x - 0.08 * sc, y, g + 0.11 * sc], 0.225 * sc, 0.175 * sc, 0.02 * sc, 2, 10, [0.85, 0.85, 0.86]);   // a bright band round the cowling
    if (!F.console && !F.cabin && hp <= 40) { rod([x + 0.1 * sc, y, g + 0.2 * sc], [x + 0.62, y + 0.06, g + 0.3 * sc], 0.016, dark, 5); M.mat = MT.CLOTH; rod([x + 0.5, y + 0.05, g + 0.28 * sc], [x + 0.64, y + 0.062, g + 0.302 * sc], 0.024, dark, 6); } }   // a tiller with a twist grip
  if (motors && motors.length && !F.cabin && L < 6.5) { const t = 0.2, x = S.x(t), w = Math.max(0.1, S.hb(t) - 0.14), y = -w * 0.55; M.mat = MT.PLASTER;   // a portable fuel tank on the floor, starboard side aft
    box(x - 0.2, x + 0.2, y - 0.14, y + 0.14, fz, fz + 0.2, [0.72, 0.1, 0.08]); M.mat = MT.METAL; M.blob([x + 0.1, y, fz + 0.21], 0.035, 0.035, 0.015, 2, 6, dark); rod([x - 0.12, y, fz + 0.2], [x - 0.12, y, fz + 0.26], 0.01, dark); rod([x - 0.12, y, fz + 0.26], [x + 0.02, y, fz + 0.26], 0.01, dark); }
}
