'use strict';
// ======================================================================
//  BIRDS — a reusable system for flying, landing, perching, swimming birds. Species are data; the herring gull is the first.
//
//  PERCHES: every place a bird can come down is a "spot" from a perch provider. Built in: open water (float), ice, dry ground
//  near water, the tops of boulders / stumps / icebergs, the tops of trees (they sway with the tree) and boats (bow, transom
//  and gunwales; the bird heels and pitches with the hull). A spot is { kind, x, y, z (feet), pose: 'float' | 'stand',
//  key (one bird per key), high?, water?: { kd, lev }, at()?: live position { x, y, z, yaw?, roll?, pitch?, gone? },
//  flushSpeed? }. Add your own (a dock, a post, a roof):
//     Game.addPerchProvider('posts', (x, y, R, bird) => [ { kind: 'post', x, y, z, pose: 'stand', key: 'post:1' } ])
//     Game.perchesNear(x, y, 60, ['tree', 'rock'])   -> spots
//
//  SPECIES: Game.registerBird(def) — see DEFAULTS below and the gull and pelican in src/birds/*.json for every field. Look (colours, proportions), flight (speed, wingbeat,
//  glide / flap bouts, turn rate, altitude, circling radius), habitat (flock size by water kind), landing preferences by
//  perch kind, shyness, time on a perch, night roosting, voice. The mesh is built from the look with prebuilt wing poses.
//     Game.birds (live list), Game.spawnBird('herring_gull', x, y, { state: 'fly' | 'float' }), Game.birdCalls = false to hush
//     Game.on('birdLand' | 'birdTakeoff', (bird, spot) => {}), Game.on('birdDive', (bird, x, y) => {})
//  Files: birds/birds.js (this: the model, voices, perches, species defaults, behaviour, drawing), src/birds/*.json (the
//  built-in species, one file each, read at boot), birds/game-api.js (the Game hooks).
// ======================================================================
const Birds = globalThis.Birds = (() => {
  const TAU = Math.PI * 2, rnd = Math.random, wrap = a => { a = (a + Math.PI) % TAU; return a < 0 ? a + Math.PI : a - Math.PI; };
  const rr = r => r[0] + rnd() * (r[1] - r[0]);
  const NF = 12, F_GLIDE = NF, F_SOAR = NF + 1, F_DIVE = NF + 2, F_SIT = NF + 3, F_STAND = NF + 4;

  // =================== the model: +x forward, +y left, z up, metres; built from a species' look ===================
  const SU0 = [0, 0.1, 0.2, 0.3, 0.4, 0.48, 0.55, 0.62], XL0 = [0.07, 0.075, 0.075, 0.07, 0.04, 0.01, -0.03, -0.08];
  const XT0 = [-0.1, -0.11, -0.11, -0.1, -0.11, -0.11, -0.1, -0.088], TH0 = [0.018, 0.016, 0.013, 0.011, 0.008, 0.006, 0.004, 0.0015];
  const XLR = [0.07, 0.075, 0.075, 0.072, 0.066, 0.056, 0.04, 0.004], XTR = [-0.1, -0.115, -0.12, -0.12, -0.115, -0.105, -0.085, -0.042];   // broad, blunt-tipped wings (a preset; or give look.wing.planform { lead, trail })
  function buildBird(K, o) {   // K: look, o: pose { t1, t2, sweep, shrink } or { fold, legs }
    const B = meshBuilder(true), C = K.colors, [bx, by, bz] = K.body, hr = K.head, bl = K.bill, sh = bx / 0.16;
    B.mat = MT.CLOTH;
    B.blob([0, 0, 0], bx, by, bz, 7, 12, i => i < 2 ? C.mantle : C.body);
    // neck and head: where they sit in flight and at rest (look.fly / look.rest; long-necked birds can tuck the head back to fly)
    const HP = (o.fold ? K.rest : K.fly) || { neck: [[0.11 * sh, 0.025 * sh, 0]], head: [0.185 * sh, 0.05 * sh], bill: -0.117 };
    const NK = [];   // a long neck is a chain of overlapping blobs, densified so it reads as one smooth S
    HP.neck.forEach((q, i) => { const p = HP.neck[i - 1]; if (p && p[2] && q[2]) { const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (Math.min(p[2], q[2]) * 0.45));
      for (let j = 1; j < n; j++) { const t = j / n; NK.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]); } } NK.push(q); });
    if (NK.length > 1) { const L = NK[NK.length - 1], h = [...(HP.head)], n = Math.ceil(Math.hypot(h[0] - L[0], h[1] - L[1]) / (L[2] * 0.45));
      for (let j = 1; j < n; j++) { const t = j / n; NK.push([L[0] + (h[0] - L[0]) * t, L[1] + (h[1] - L[1]) * t, L[2] + (hr - L[2]) * t]); } }
    for (const [nx, nz, nr] of NK) B.blob([nx, 0, nz], nr ? nr * 1.1 : 0.07 * sh, nr || by * 0.76, nr || bz * 0.8, 6, 10, C.neck || C.head);
    const [hx, hz] = HP.head; B.blob([hx, 0, hz], hr * 1.15, hr, hr * 1.05, 6, 10, C.head);
    B.mat = MT.GEN;
    const er = Math.max(0.007, hr * 0.15); for (const s of [1, -1]) B.blob([hx + hr * 0.45, s * hr * 0.82, hz + hr * 0.27], er, er * 0.57, er, 3, 6, C.eye);
    const bp = HP.bill, dx = Math.cos(bp), dz = Math.sin(bp), dn = [dz, 0, -dx];   // bill direction, and "down" across it
    const at = (p, a, d = 0) => [p[0] + dx * a + dn[0] * d, 0, p[2] + dz * a + dn[2] * d];
    const b0 = [hx + hr * 0.95 * dx, 0, hz - hr * 0.07 + hr * 0.95 * dz], b1 = at(b0, bl.len * 0.85);
    B.tube(b0, b1, bl.base, bl.base * (bl.taper ?? 0.55), 6, C.bill);
    B.tube(b1, at(b1, bl.len * 0.17, bl.hook), bl.base * (bl.taper ?? 0.55), bl.base * 0.25, 5, C.billTip || C.bill, true);
    if (C.billSpot) B.blob(at(b1, -bl.len * 0.12, bl.base * 0.6), 0.007, 0.006, 0.005, 3, 6, C.billSpot);
    if (bl.pouch) B.tube(at(b0, -bl.base * 0.5, bl.base * 0.7), at(b0, bl.len * 0.8, bl.base * 0.55), bl.base * bl.pouch, bl.base * 0.45, 8, C.pouch || C.bill, true);   // the throat pouch
    B.mat = MT.CLOTH;   // tail: a thin fan, two faces a few mm apart so it reads from above and below
    const T = K.tail, x0 = -bx * 0.82, x1 = x0 - T.len, tz = o.fold ? 0.03 : 0.012, fk = T.fork || 0;
    const tl = [[x0, T.root], [x0, -T.root], [x1 + fk, -T.end], [x1, -T.end * 0.6], [x1, T.end * 0.6], [x1 + fk, T.end]];
    for (const [dz, c] of [[0.004, -1], [-0.004, 1]]) { const P = tl.map(([x, y]) => [x, y, tz + dz]), ctr = [x0, 0, tz + c];
      B.quad(P[0], P[1], P[2], P[5], C.tail, ctr); B.quad(P[2], P[3], P[4], P[5], C.tail, ctr); }
    if (o.fold) {   // wings folded along the back, primaries crossed over the tail
      for (const s of [1, -1]) {
        B.blob([-0.03 * sh, s * by * 0.85, bz * 0.42], bx * 0.94, by * 0.38, bz * 0.67, 5, 10, C.wingTop);
        B.mat = MT.GEN; B.tube([-0.12 * sh, s * by * 0.66, bz * 0.62], [x0 - T.len * 0.3, s * 0.018, 0.05], 0.024 * sh, 0.005, 6, C.wingTip, true);
        if (C.mirror) B.blob([x0 - T.len * 0.25, s * 0.022, 0.053], 0.012, 0.006, 0.006, 3, 6, C.mirror); B.mat = MT.CLOTH;
      }
    } else wings(B, K, o);
    B.mat = MT.GEN;
    const LG = K.legs;
    if (o.legs) for (const s of [1, -1]) {
      const ft = LG.feet ?? 1, ly = by * 0.5;
      B.tube([0, s * ly, -bz * 0.7], [0, s * (ly + 0.005), -LG.len + 0.005], 0.009 * ft, 0.007 * ft, 5, C.legs);
      for (const d of [-1, 0, 1]) B.tube([0, s * (ly + 0.005), -LG.len + 0.004], [0.05 * ft, s * (ly + 0.005) + d * 0.022 * ft, -LG.len + 0.002], 0.005 * ft, 0.003 * ft, 4, C.legs, true);
    } else if (!o.fold) for (const s of [1, -1]) B.blob([x0 + 0.01, s * 0.018, -0.032], 0.025, 0.01, 0.01, 3, 6, C.legs);   // feet tucked under the tail
    return new Float32Array(B.v);
  }
  function wings(B, K, o) {
    const C = K.colors, k = K.wing.span / 0.62, c = K.wing.chord, R = K.wing.shape === 'rounded', SU = SU0.map(u => u * k), w3 = 0.3 * k, tipU = (K.wing.tipFrom ?? 0.48) * k;
    const PF = K.wing.planform, XL = (PF?.lead || (R ? XLR : XL0)).map(x => x * c), XT = (PF?.trail || (R ? XTR : XT0)).map(x => x * c), TH = TH0.map(t => t * Math.max(1, c * 0.8));
    const c1 = Math.cos(o.t1), s1 = Math.sin(o.t1), c2 = Math.cos(o.t2), s2 = Math.sin(o.t2), y0 = K.body[1] * 0.74, z0 = K.body[2] * 0.35;
    const wy = y0 + w3 * c1, wz = z0 + w3 * s1;   // the wrist
    for (const s of [1, -1]) {
      const P = (j, x, off) => { const u = SU[j], hand = u > w3, uu = hand ? w3 + (u - w3) * (1 - o.shrink) : u;
        const y = hand ? wy + (uu - w3) * c2 : y0 + uu * c1, z = hand ? wz + (uu - w3) * s2 : z0 + uu * s1;
        const ny = -(hand ? s2 : s1), nz = hand ? c2 : c1, xs = hand ? x - o.sweep * k * (u - w3) / (0.32 * k) : x;
        return [xs, s * (y + off * ny), z + off * nz]; };
      for (let j = 0; j < SU.length - 1; j++) {
        const st = q => { const xm = XL[q] + 0.3 * (XT[q] - XL[q]); return { L: P(q, XL[q], 0), Mt: P(q, xm, TH[q]), Mb: P(q, xm, -TH[q] * 0.5), T: P(q, XT[q], 0) }; };
        const a = st(j), b = st(j + 1), hand = SU[j] > w3, n = hand ? [0, -s * s2, c2] : [0, -s * s1, c1];
        const mid = [(a.Mt[0] + b.Mt[0]) / 2, (a.Mt[1] + b.Mt[1]) / 2, (a.Mt[2] + b.Mt[2]) / 2], below = mid.map((v, i) => v - n[i]), above = mid.map((v, i) => v + n[i]);
        const tip = SU[j] >= tipU - 1e-6, last = j === SU.length - 2;
        B.quad(a.L, b.L, b.Mt, a.Mt, tip ? C.wingTip : C.wingTop, below);
        B.quad(a.Mt, b.Mt, b.T, a.T, last && C.mirror ? C.mirror : tip ? C.wingTip : C.wingEdge || C.wingTop, below);
        B.quad(a.L, b.L, b.Mb, a.Mb, tip ? C.wingUnderTip || C.wingTip : C.wingUnder, above);
        B.quad(a.Mb, b.Mb, b.T, a.T, tip ? C.wingUnderTip || C.wingTip : C.wingUnder, above);
      }
    }
  }
  function posesFor(F) {   // wing poses: NF flap frames (the hand folds in on the upstroke), glide, soar, dive, sitting, standing
    const A = F.stroke ?? 0.52, P = [];
    for (let j = 0; j < NF; j++) { const f = j / NF * TAU, up = Math.max(0, Math.cos(f)), t1 = 0.12 + A * Math.sin(f);
      P.push({ t1, t2: t1 + A * 0.62 * Math.sin(f - 1), sweep: 0.07 * up, shrink: 0.18 * up }); }
    P.push({ t1: 0.1, t2: -0.06, sweep: 0.02, shrink: 0 }, { t1: 0.22, t2: -0.2, sweep: 0.05, shrink: 0.06 }, { t1: 0.35, t2: -0.35, sweep: 0.12, shrink: 0.25 },
      { fold: true }, { fold: true, legs: true });
    return P;
  }

  // =================== voices (Web Audio, synthesized; audio starts after your first click or key) ===================
  let ac = null, lastCall = 0;
  const wake = () => { ac = Sounds.context || Sounds.wake(); };   // the game's one AudioContext (sound.js): started, resumed and put to sleep there
  addEventListener('pointerdown', wake, true); addEventListener('keydown', wake, true);
  // one call synthesizer, shaped by the species' voice numbers: a few notes (or now and then a longer series), each a swept,
  // raspy tone through a band-pass. voice: { pitch: [Hz, Hz], notes: [n, n], dur: [s, s], gap, rise (× at riseAt), fall (×),
  //   rasp: { rate: [Hz, Hz], depth: Hz }, wave, band: { freq, q }, highpass, series: { chance, notes: [n, n], first, dur, gap, lift } }
  function synth(ac, dest, bird, V) {
    const bp = ac.createBiquadFilter(), hp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = V.band?.freq ?? 1900; bp.Q.value = V.band?.q ?? 1.1;
    hp.type = 'highpass'; hp.frequency.value = V.highpass ?? 400; bp.connect(hp); hp.connect(dest);
    const S = V.series, long = S && rnd() < S.chance, n = Math.round(rr(long ? S.notes : V.notes || [1, 2])), f0 = (bird.voice || 1000) * (0.95 + 0.1 * rnd());
    let t = ac.currentTime + 0.02;
    for (let i = 0; i < n; i++) {
      const dur = long ? (i === 0 ? S.first : S.dur * (1 + 0.15 * rnd())) : rr(V.dur || [0.2, 0.3]), f = f0 * (long && i > 0 ? S.lift ?? 1 : 1);
      const o = ac.createOscillator(), env = ac.createGain();
      o.type = V.wave || 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (V.rise ?? 1.2), t + dur * (V.riseAt ?? 0.25)); o.frequency.exponentialRampToValueAtTime(f * (V.fall ?? 0.8), t + dur);
      if (V.rasp) { const lfo = ac.createOscillator(), ld = ac.createGain(); lfo.frequency.value = rr(V.rasp.rate); ld.gain.value = V.rasp.depth; lfo.connect(ld); ld.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.02); }
      env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(1, t + 0.025); env.gain.setValueAtTime(1, t + dur * 0.55); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(env); env.connect(bp); o.start(t); o.stop(t + dur + 0.02);
      t += dur + (long ? S.gap : V.gap ?? 0.12);
    }
    return t;
  }
  function call(b) {
    const V = b.sp.voice; if (!V || !Game.birdCalls || !ac || ac.state !== 'running' || document.hidden || Engine.pauseOpen) return;
    const P = Engine.P, dx = b.x - P.x, dy = b.y - P.y, d = Math.hypot(dx, dy, b.z - P.z - CONFIG.eyeHeight);
    if (d > (V.range ?? 110) || Engine.time - lastCall < 0.7) return; lastCall = Engine.time;
    const out = ac.createGain(), pan = ac.createStereoPanner ? ac.createStereoPanner() : null, rel = Math.atan2(dy, dx) - P.a;
    out.gain.value = (V.volume ?? 0.07) * Math.min(1, 14 / Math.max(d, 1)) * (Engine.uw ? 0.15 : 1);
    if (pan) { pan.pan.value = clamp(-Math.sin(rel), -1, 1) * 0.8; out.connect(pan); pan.connect(ac.destination); } else out.connect(ac.destination);
    const end = (typeof V.synth === 'function' ? V.synth : synth)(ac, out, b, V);   // a definition may bring its own synth function
    setTimeout(() => { try { out.disconnect(); } catch (e) { /* */ } }, ((end || ac.currentTime + 3) - ac.currentTime + 0.5) * 1000);
  }

  // =================== perches ===================
  const providers = new Map();
  const FEAR = 2;   // scales every species' shy (and, × 0.9, wary) distance: birds keep well clear of you
  let boatIds = 0;
  const boatId = b => b._birdId || (b._birdId = ++boatIds);
  function boatPerches(b) {   // the bow, the transom (beside an outboard), the gunwales fore and aft, clear of where you sit
    if (b._perch) return b._perch;
    const D = b.def, S = D._shape || hullShape(D.hull), seat = S.x(clamp(D.crew?.seat_at ?? 0.5, 0, 1)), out = [];
    const add = (t, side, yaw) => { const x = S.x(t), y = side * Math.max(0, S.hb(t) - 0.03); if (side && Math.abs(x - seat) < 0.9) return; out.push({ x, y, z: S.gun(t), yaw }); };
    add(0.94, 0, 0);
    if (D.features?.motor) { add(0.03, 1, Math.PI); add(0.03, -1, Math.PI); } else add(0.03, 0, Math.PI);
    if (S.L > 3.5) for (const t of [0.72, 0.25]) { add(t, 1, 0); add(t, -1, Math.PI); }
    return b._perch = out;
  }
  function boatPt(b, p) {   // a point in the boat's frame (heeled by roll, then pitched, then turned) to the world
    const cr = Math.cos(b.roll || 0), sr = Math.sin(b.roll || 0), cp = Math.cos(b.pitch || 0), sp = Math.sin(b.pitch || 0), ca = Math.cos(b.a), sa = Math.sin(b.a);
    const y1 = p[1] * cr - p[2] * sr, z1 = p[1] * sr + p[2] * cr, x2 = p[0] * cp - z1 * sp, z2 = p[0] * sp + z1 * cp;
    return [b.x + ca * x2 - sa * y1, b.y + sa * x2 + ca * y1, b.z + z2];
  }
  const nearChunks = (x, y, R) => { const out = []; for (const ch of Engine.chunks.values()) if (Math.abs((ch.cx + 0.5) * CHW - x) < R + CHW && Math.abs((ch.cy + 0.5) * CHW - y) < R + CHW) out.push(ch); return out; };
  function treeNear(x, y, r) {
    for (const ch of nearChunks(x, y, r)) for (const td of ch.treeData || []) if (td) for (let i = 0; i < td.length; i += 6) if (Math.abs(td[i] - x) < r && Math.abs(td[i + 1] - y) < r) return true;
    return false;
  }
  // per tree kind, the highest point in the model: a conifer or palm's tip; a broadleaf's top leaf clump in full leaf, its top twig when bare
  let TOPS = null;
  const treeTops = () => { if (!TOPS) { const tm = Engine.treeMesh || treeMeshes(), top = (v, ok) => { let best = null; for (let i = 0; i < v.length; i += VS) if (ok(v[i + 9]) && (!best || v[i + 2] > best[2])) best = [v[i], v[i + 1], v[i + 2]]; return best; };
      TOPS = TREE_KINDS.map(k => { const v = tm[k], ever = k === 'pine' || k === 'palm', leaf = top(v, () => true), bare = ever ? leaf : top(v, m => m < 16.5);
        if (leaf) leaf[2] -= ever ? 0.02 : 0.01; if (bare && bare !== leaf) bare[2] -= 0.005; return { leaf, bare }; }); }
    const full = (ENV.leaf ?? 1) > 0.9; return TOPS.map(t => full ? t.leaf : t.bare); };
  const treeSway = (s, T) => {   // the tree shader's wind sway at the perch's height, so the bird rides the moving tip
    const t = s.tree, ph = t.bx * 0.13 + t.by * 0.17, sw = CONFIG.windSway * (0.45 + 1.4 * (ENV.wind || 0)) * 0.035 * t.h * t.h * (1 + 0.5 * Math.sin(T * 2.7 + ph * 2));
    const ox = sw * Math.sin(T * 1.3 + ph), oy = sw * Math.cos(T * 1.05 + ph * 1.3), c = Math.cos(t.rot), si = Math.sin(t.rot);
    return [s.x + (c * ox - si * oy) * t.sc, s.y + (si * ox + c * oy) * t.sc]; };
  const PROP_TOP = { rock: [0.115, 0, 0.7, 0.7], stump: [0.01, 0, 0.5, 0], berg: [0.25, 0.15, 1.15, 0] };   // model-space top, min scale
  const BUILTIN = {
    water(x, y, R) { const out = [];
      for (let k = 0; k < 16; k++) { const r = Math.sqrt(rnd()) * R, a = rnd() * TAU, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, w = Game.waterAt(px, py);
        if (w.depth > 0.4) out.push(w.iced ? { kind: 'ice', x: px, y: py, z: w.level, pose: 'stand', key: `g:${px | 0}:${py | 0}` }
          : { kind: 'water', x: px, y: py, z: w.level, pose: 'float', water: { kd: w.kindId, lev: w.level }, key: `w:${px | 0}:${py | 0}` }); }
      return out; },
    ground(x, y, R) { const out = [];   // dry, fairly flat ground within sight of water and clear of trees: beaches, banks, points
      for (let k = 0; k < 14 && out.length < 3; k++) { const r = Math.min(10, R * 0.2) + rnd() * R, a = rnd() * TAU, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, w = Game.waterAt(px, py);
        if (w.depth > -0.1) continue;
        const z = Game.groundAt(px, py), g = (u, v) => Game.groundAt(px + u, py + v), sl = Math.abs(g(0.6, 0) - g(-0.6, 0)) + Math.abs(g(0, 0.6) - g(0, -0.6));
        if (sl > 0.5 || z > w.level + 6) continue;
        let wet = false; for (let j = 0; j < 6 && !wet; j++) { const b = j / 6 * TAU; wet = Game.waterAt(px + Math.cos(b) * 18, py + Math.sin(b) * 18).depth > 0.2; }
        if (wet && !treeNear(px, py, 4)) out.push({ kind: 'ground', x: px, y: py, z, pose: 'stand', walk: true, key: `g:${px | 0}:${py | 0}` }); }
      return out; },
    prop(x, y, R) { const out = [];   // the tops of boulders, stumps and icebergs standing clear of the water
      for (const ch of nearChunks(x, y, R)) for (const k in PROP_TOP) { const d = ch.plantData && ch.plantData[k]; if (!d) continue; const t = PROP_TOP[k];
        for (let i = 0; i < d.length; i += 8) { const sc = d[i + 3], ro = d[i + 4], z = d[i + 2] + t[2] * sc; if (z < d[i + 6] + 0.15 || sc < t[3]) continue;
          const px = d[i] + (Math.cos(ro) * t[0] - Math.sin(ro) * t[1]) * sc, py = d[i + 1] + (Math.sin(ro) * t[0] + Math.cos(ro) * t[1]) * sc;
          if (Math.hypot(px - x, py - y) < R) out.push({ kind: k, x: px, y: py, z, pose: 'stand', high: k === 'berg', key: `${k}:${px.toFixed(1)}:${py.toFixed(1)}` }); } }
      return out; },
    tree(x, y, R) { const out = [], tops = treeTops();
      for (const ch of nearChunks(x, y, R)) for (let ki = 0; ki < (ch.treeData || []).length; ki++) { const d = ch.treeData[ki], t = tops[ki]; if (!d || !t) continue;
        for (let i = 0; i < d.length; i += 6) { const sc = d[i + 3], ro = d[i + 4], px = d[i] + (Math.cos(ro) * t[0] - Math.sin(ro) * t[1]) * sc, py = d[i + 1] + (Math.sin(ro) * t[0] + Math.cos(ro) * t[1]) * sc;
          if (Math.hypot(px - x, py - y) > R) continue;
          const s = { kind: 'tree', x: px, y: py, z: d[i + 2] + t[2] * sc, pose: 'stand', high: true, key: `t:${d[i].toFixed(1)}:${d[i + 1].toFixed(1)}`, tree: { bx: d[i], by: d[i + 1], sc, rot: ro, h: t[2] } };
          s.at = T => { const p = treeSway(s, T); return { x: p[0], y: p[1], z: s.z }; }; out.push(s); } }
      return out; },
    cliff(x, y, R) { const out = [];   // the grassy rims of sea stacks, a few steps in from the drop
      for (const k of seaStacks()) { if (Math.hypot(k.x - x, k.y - y) > R + k.r) continue;
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + k.ph, px = k.x + Math.cos(a) * k.rin, py = k.y + Math.sin(a) * k.rin, z = Game.groundAt(px, py);
          if (z > WLW + 5) out.push({ kind: 'cliff', x: px, y: py, z, pose: 'stand', high: true, key: `c:${px | 0}:${py | 0}` }); } }
      return out; },
    boat(x, y, R) { const out = [];   // slow boats only; birds ride along until the boat really gets going
      for (const b of Engine.boats || []) { if (Math.abs(b.speed || 0) > 3 || Math.hypot(b.x - x, b.y - y) > R) continue;
        boatPerches(b).forEach((p, i) => { const s = { kind: 'boat', boat: b, x: b.x, y: b.y, z: b.z, pose: 'stand', bold: true, flushSpeed: 6.5, mine: Engine.boat === b, key: `b:${boatId(b)}:${i}` };
          s.at = () => { if (!(Engine.boats || []).includes(b)) return { gone: true }; const w = boatPt(b, [p.x, p.y, p.z]);
            return { x: w[0], y: w[1], z: w[2], yaw: b.a + p.yaw, roll: (p.yaw ? -1 : 1) * (b.roll || 0), pitch: (p.yaw ? -1 : 1) * (b.pitch || 0), speed: Math.abs(b.speed || 0) }; };
          out.push(s); }); }
      return out; },
  };
  for (const k in BUILTIN) providers.set(k, BUILTIN[k]);
  const Perches = {
    providers,
    add(name, fn) { providers.set(name, fn); },
    near(x, y, R = 60, kinds = null, bird = null) { const out = [];
      for (const [name, fn] of providers) if (!kinds || kinds.includes(name)) { try { for (const s of fn(x, y, R, bird) || []) if (!kinds || kinds.includes(name) || kinds.includes(s.kind)) { s.provider = name; out.push(s); } } catch (e) { console.warn('perch provider', name, e); } }
      return out; },
    // a spot is someone's once a bird is on it or on its way to it
    taken: (key, self = null) => G.list.some(b => b !== self && ((b.spot && b.spot.key === key) || (b.target && b.target.key === key))),
    // ... and nobody lands on top of anybody: keep clear of birds already down and of spots others are heading for
    free(s, bird = null) {
      if (this.taken(s.key, bird)) return false;
      if (s.kind === 'boat') return true;   // boat perches are already spaced apart
      const p = this.at(s), need = (bird ? bird.sp.space : 0.7) * (s.pose === 'float' ? 1.4 : 1);
      for (const o of G.list) { if (o === bird) continue;
        const q = o.spot ? (o.st === 'float' ? o : this.at(o.spot)) : o.target ? this.at(o.target) : null; if (!q) continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) < need + o.sp.space * 0.5 && Math.abs((q.z ?? p.z) - p.z) < 1.5) return false; }
      return true; },
    // where a spot is right now (moving perches update live)
    at(s) { return s.at ? s.at(Engine.time) : { x: s.x, y: s.y, z: s.z }; },
  };

  // =================== species ===================
  const DEFAULTS = {
    name: 'Bird', scale: [0.9, 1.1],
    habitat: {},                    // flock size near each kind of water: { sea, lake, river, creek, pond, any }
    night: 'roost',                 // 'roost': settle at dusk and stay till dawn · 'active'
    climates: null,                 // null = any island; or e.g. ['temperate', 'tropical']
    colony: 0,                      // > 0: nests on sea stacks; within 500 m of one the flock is this big and stays round them
    flight: { speed: 9, flapHz: 3, stroke: 0.52, flapTime: [1, 3], glideTime: [2, 6], turn: 0.85, alt: [8, 25], radius: [15, 45], soar: true, followBoats: false,
      clear: 5 },                   // least height over water while circling (low for wave-skimmers)
    // fishing on the wing: one strike behaviour, shaped entirely by these numbers (null = never)
    //   every: mean s between tries · from: [m, m] height over the water to start · minDepth: m of water needed
    //   lead: how far ahead it aims, × its height (small = steep) · target: m from the surface it aims for (< 0 goes under)
    //   speed: [m/s, m/s] · accel: m/s² · tuck: wings swept back in a straight-line fall (else a flapping swoop)
    //   twist: roll at the bottom (rad) · splash: droplets · ripple: strength · scare: m, fish scatter
    //   under: s below the surface · after: [s, s] floating afterwards (null: climbs straight away)
    forage: null,
    lands: { water: 0.4, ground: 0.2, prop: 0.2, tree: 0.2, boat: 0 },   // how much it likes each perch provider
    landEvery: 50,                  // mean seconds of flight before it looks for a spot (stormy weather or night: much sooner)
    stay: [20, 90], shy: 9,         // seconds on a spot; how close you can come (m)
    floatZ: 0.035,                  // body centre above the water when floating (at scale 1)
    space: 0.7,                     // personal space when down (m): nobody lands closer than this
    wary: 6,                        // how far it keeps from you in the air (m): headed your way inside ~2.5× this it turns off and climbs over
    flocking: { every: 70, size: [3, 8], time: [20, 50], formation: { cluster: 1, v: 0 }, spacing: 2.4, landTogether: 0.7 },   // like fish schools: a leader and followers holding slots
    voice: null,                    // the call (see synth above), plus every: [s, s], volume, range (m); synth: fn(ac, dest, bird, voice) to replace it
    look: {
      body: [0.16, 0.068, 0.072], head: 0.044, bill: { len: 0.074, base: 0.012, hook: 0.009 },
      tail: { len: 0.14, root: 0.035, end: 0.062, fork: 0 }, wing: { span: 0.62, chord: 1, tipFrom: 0.48 }, legs: { len: 0.2 },
      colors: { mantle: [0.6, 0.55, 0.5], body: [0.8, 0.78, 0.74], head: [0.8, 0.78, 0.74], eye: [0.08, 0.07, 0.05], bill: [0.3, 0.3, 0.3], tail: [0.6, 0.55, 0.5],
        wingTop: [0.6, 0.55, 0.5], wingTip: [0.3, 0.28, 0.26], wingUnder: [0.8, 0.78, 0.74], legs: [0.4, 0.35, 0.3] },
    },
    events: {},                     // { landed: true } — flock to you when you land a fish
  };
  const species = {};
  function register(def) {
    const sp = deepMerge(DEFAULTS, def); sp.id = def.id; sp.poses = posesFor(sp.flight); sp.meshes = sp.poses.map(p => buildBird(sp.look, p)); sp.gpu = [];
    sp.flock = { x: 0, y: 0, lev: 0, ax: 0, ay: 0, at: 0 }; sp.want = 0;
    species[sp.id] = sp; return sp;
  }

  // =================== behaviour (any species) ===================
  const G = {
    list: [], species, Perches, register, synth, tick: 0, lastP: null,   // synth: for previewing a voice offline
    night() { const h = (Engine.tod ?? 0.4) * 24; return h > 20.6 || h < 5.4; },
    make(sp, x, y, st = 'fly') {
      if (typeof sp === 'string') sp = species[sp]; const F = sp.flight;
      const b = { sp, x, y, z: 0, a: rnd() * TAU, v: F.speed * (0.95 + rnd() * 0.15), vz: 0, st, lt: 0, ph: rnd() * TAU, hz: F.flapHz * (0.9 + rnd() * 0.2), flap: true, want: true, flapT: rnd() * 3,
        roll: 0, pitch: 0, dir: rnd() < 0.5 ? 1 : -1, R0: rr(F.radius), alt: rr(F.alt), ox: (rnd() - 0.5) * 30, oy: (rnd() - 0.5) * 30, sc: rr(sp.scale),
        tint: 0.42 + rnd() * 0.16, wob: rnd() * 100, callT: 3 + rnd() * 20, voice: sp.voice ? rr(sp.voice.pitch || [1000, 1100]) : 0, gzT: 0, gzv: 0, stay: 0, frame: 0, spot: null };
      b.gzv = surfAt(x, y); b.z = Math.max(sp.flock.lev, b.gzv) + b.alt;
      if (st !== 'fly') { const s = Perches.near(x, y, 4, [st === 'float' ? 'water' : 'ground'])[0]; if (s) this.settle(b, s, true); }
      this.list.push(b); return b;
    },
    bodyZ(b, s, p) { return s.pose === 'float' ? s.water.lev + Engine.swellAt(p.x, p.y, s.water.kd) + b.sp.floatZ * b.sc : p.z + b.sp.look.legs.len * b.sc; },
    settle(b, s, quiet) {
      if (b.group) b.group.end = Engine.time + 4;   // give the followers a moment to see where the leader came down (school() disbands after)
      b.st = s.pose === 'float' ? 'float' : 'stand'; b.spot = s; b.v = b.vz = 0; b.lt = 0; b.roll = 0;
      b.stay = this.night() && b.sp.night === 'roost' ? 1e9 : rr(b.sp.stay) * (s.kind === 'boat' ? 0.5 : 1); b.callT = 4 + rnd() * 25;
      if (!quiet && s.pose === 'float') Game.ripple(b.x, b.y, 0.45);
      if (!quiet) Game.emit('birdLand', b, s);
    },
    takeoff(b) {
      const s = b.spot; b.v = s && s.pose !== 'float' ? 3 : 1.2; b.vz = s && s.pose !== 'float' ? 1.5 : 0;
      b.st = 'takeoff'; b.lt = 0; b.spot = null; b.flap = b.want = true; b.alt = rr(b.sp.flight.alt); if (rnd() < 0.5) b.callT = 0.3 + rnd();
      Game.emit('birdTakeoff', b, s);
    },
    // choose somewhere to come down, by the species' taste for each kind of perch; your own boat is the favourite
    pickSpot(b) {
      const sp = b.sp, fl = sp.flock, P = Engine.P, Ls = sp.lands, kinds = Object.keys(Ls).filter(k => Ls[k] > 0 && providers.has(k));
      const free = s => (s.bold || Math.hypot(s.x - P.x, s.y - P.y) > 25) && Perches.free(s, b);
      if (Ls.boat > 0 && Engine.boat && rnd() < Math.min(0.1, Ls.boat * 0.175)) { const c = Perches.near(b.x, b.y, 160, ['boat'], b).filter(s => s.mine && free(s)); if (c.length) return c[rnd() * c.length | 0]; }
      for (let tries = 0; tries < 3; tries++) {
        const wt = q => Ls[q] * (q === 'boat' ? 0.5 : 1); let r = rnd() * kinds.reduce((t, q) => t + wt(q), 0), k = kinds[0]; for (const q of kinds) { r -= wt(q); if (r <= 0) { k = q; break; } }   // (boats count half: they were landing on yours too often)
        const c = Perches.near(k === 'boat' ? b.x : fl.x, k === 'boat' ? b.y : fl.y, k === 'boat' ? 160 : 70, [k], b).filter(free);
        if (c.length) return c[rnd() * c.length | 0];
      }
      return null;
    },
    waterSeen() {   // the kinds of water around you (world() alone: what Game.waterAt's kind and depth come from)
      const P = Engine.P, seen = new Set();
      for (const r of [0, 20, 50, 120, 300]) for (let k = 0; k < (r ? 8 : 1); k++) { const a = k / 8 * TAU, h = hW(world(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r)); if (WLEV - h > 0.3) seen.add(WATER[WK].key); }
      return seen;
    },
    census(sp, seen = this.waterSeen()) {   // how many of a species this place gets, by the water around you
      const P = Engine.P;
      if (sp.climates && !sp.climates.includes(CLIMATE.key)) return 0;
      let n = sp.habitat.any || 0; for (const k of seen) n = Math.max(n, sp.habitat[k] || 0);
      if (sp.colony && this.colonyNear(P)) n = Math.max(n, sp.colony);
      return Math.round(n * [0, 0.5, 1, 1.6][clamp(CONFIG.wildlife | 0, 0, 3)]);
    },
    colonyNear(P) { let best = null, bd = 500; for (const k of seaStacks()) { const d = Math.hypot(k.x - P.x, k.y - P.y); if (d < bd) { bd = d; best = k; } } return best; },
    anchor(sp) {   // where a flock hangs about: over water near you (round the stacks, for colony birds); in your wake when you're under way (if it follows boats)
      const P = Engine.P, fl = sp.flock, bt = Engine.boat, home = sp.colony && this.colonyNear(P);
      if (home) { const a = rnd() * TAU, r = home.r + 10 + rnd() * 60; fl.ax = home.x + Math.cos(a) * r; fl.ay = home.y + Math.sin(a) * r; fl.lev = WLW; return; }
      if (sp.flight.followBoats && bt && Math.abs(bt.speed || 0) > 1.5 && rnd() < 0.5) { const d = 36 + rnd() * 40; fl.ax = bt.x - Math.cos(bt.a) * d; fl.ay = bt.y - Math.sin(bt.a) * d; return; }
      for (let k = 0; k < 12; k++) { const r = 50 + rnd() * 110, a = rnd() * TAU, x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r, w = Game.waterAt(x, y);
        if (w.depth > 0.5) { fl.ax = x; fl.ay = y; fl.lev = w.level; return; } }
      fl.ax = P.x + (rnd() - 0.5) * 60; fl.ay = P.y + (rnd() - 0.5) * 60; fl.lev = Math.max(fl.lev, surfAt(P.x, P.y) - 5);
    },
    populate() {   // straight away (start, or after travelling): some already down, the rest circling
      this.list.length = 0; const seen = this.waterSeen();
      for (const sp of Object.values(species)) {
        sp.want = this.census(sp, seen); this.anchor(sp); Object.assign(sp.flock, { x: sp.flock.ax, y: sp.flock.ay });
        for (let i = 0; i < sp.want; i++) {
          const b = this.make(sp, sp.flock.x + (rnd() - 0.5) * 60, sp.flock.y + (rnd() - 0.5) * 60, 'fly');
          if (i % 2 === 0) { const s = this.pickSpot(b); if (s && s.kind !== 'boat') { const p = Perches.at(s); b.x = p.x; b.y = p.y; this.settle(b, s, true); } }
        }
      }
    },
    // flocking, the way fish school: a leader flies a wide sweep, followers hold slots around and behind it in its frame
    school(sp, mine) {
      const Fk = sp.flocking, lead = mine.find(b => b.group);
      if (lead) { const g = lead.group; if (g.end ? Engine.time >= g.end : lead.st !== 'fly' || (g.t -= 2.5) <= 0) this.disband(lead); return; }
      if (!Fk || rnd() > 2.5 / Fk.every) return;
      const flying = mine.filter(b => b.st === 'fly' && !b.leader); if (flying.length < 2) return;
      const L = flying[rnd() * flying.length | 0], fol = flying.filter(b => b !== L).sort((p, q) => Math.hypot(p.x - L.x, p.y - L.y) - Math.hypot(q.x - L.x, q.y - L.y)).slice(0, Math.round(rr(Fk.size)) - 1);
      if (!fol.length) return;
      let r = rnd() * Object.values(Fk.formation).reduce((t, v) => t + v, 0), form = 'cluster'; for (const k in Fk.formation) { r -= Fk.formation[k]; if (r <= 0) { form = k; break; } }
      L.group = { t: rr(Fk.time), form, R0: L.R0 }; L.R0 = Math.max(L.R0 * 2, 60); L.want = true; L.flapT = 2;   // the leader swings wider, the rest fall in
      fol.forEach((b, i) => { const sd = i % 2 ? 1 : -1, rk = (i >> 1) + 1, S = Fk.spacing;
        b.leader = L; b.slot = form === 'v' ? [-rk * S * 0.85, sd * rk * S * 0.95, rk * 0.15] : form === 'line' ? [-(i + 1) * S, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.6]
          : [-1.5 - rnd() * S * 2.5, (rnd() - 0.5) * S * 3, (rnd() - 0.5) * 2.5]; });
    },
    disband(L) { if (L.group) { L.R0 = L.group.R0; L.group = null; } for (const b of this.list) if (b.leader === L) { b.leader = null; b.slot = null; } },
    excite() {   // a fish landed: flocks that care come over and shout about it
      const P = Engine.P;
      for (const sp of Object.values(species)) { if (!sp.events.landed) continue; sp.flock.ax = P.x; sp.flock.ay = P.y; sp.flock.at = 12; }
      for (const b of this.list) if (b.sp.events.landed && Math.hypot(b.x - P.x, b.y - P.y) < 150) { b.callT = Math.min(b.callT, 0.2 + rnd() * 2.5); if (b.st === 'fly') b.alt = 5 + rnd() * 8; }
    },

    update(dt) {
      if (!dt || !Engine.P) return;
      const P = Engine.P, night = this.night();
      this.tick -= dt;
      if (this.tick <= 0) {   // every couple of seconds: travel, census, flock anchors, arrivals and departures
        this.tick = 2.5;
        if (!this.lastP || Math.hypot(P.x - this.lastP[0], P.y - this.lastP[1]) > 300) this.populate();
        this.lastP = [P.x, P.y]; const seen = this.waterSeen();
        for (const sp of Object.values(species)) {
          sp.want = this.census(sp, seen); const fl = sp.flock;
          if ((fl.at -= 2.5) <= 0) { this.anchor(sp); fl.at = 8 + rnd() * 6; }
          const mine = this.list.filter(b => b.sp === sp && !b.spawned), flying = mine.filter(b => b.st === 'fly');
          this.school(sp, mine);
          if (mine.length < sp.want) { const a = rnd() * TAU, r = 170 + rnd() * 60, b = this.make(sp, P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, 'fly'); b.a = a + Math.PI; }
          else if (mine.length > sp.want + 1 && flying.length) flying[rnd() * flying.length | 0].st = 'leave';
        }
      }
      const bf = Engine.boat && Math.abs(Engine.boat.speed || 0) > 1.5;
      for (const sp of Object.values(species)) { const fl = sp.flock, k = Math.min(1, dt * (bf && sp.flight.followBoats ? 0.7 : 0.08)); fl.x += (fl.ax - fl.x) * k; fl.y += (fl.ay - fl.y) * k; }
      const wd = ENV.windDir ?? 0.8, ws = ENV.wind || 0, T = Engine.time;
      for (let i = this.list.length - 1; i >= 0; i--) {
        const b = this.list[i]; b.lt += dt;
        if (Math.hypot(b.x - P.x, b.y - P.y) > (b.st === 'leave' ? 420 : 650)) { this.disband(b); this.list.splice(i, 1); continue; }
        if ((b.callT -= dt) <= 0) { const V = b.sp.voice; b.callT = rr(V?.every || [8, 30]) * (b.st === 'fly' ? 1 : 2); if (!night || rnd() < 0.2) call(b); }
        if ((b.gzT -= dt) <= 0) { b.gzT = 0.4; b.gzv = surfAt(b.x, b.y); }
        if (b.st === 'float' || b.st === 'stand') this.perched(b, dt, night);
        else this.fly(b, dt, night, wd, ws, T);
        if (b.flap) { b.ph += dt * b.hz * TAU * (b.st === 'takeoff' ? 1.35 : b.st === 'land' ? 1 + 0.9 * (b.flare || 0) : 1); if (b.ph >= TAU) { b.ph -= TAU; if (!b.want) b.flap = false; } }   // finish the stroke before gliding
        else if (b.want) b.flap = true;
        b.frame = b.st === 'float' || b.st === 'under' ? F_SIT : b.st === 'stand' ? F_STAND : b.st === 'dive' && b.sp.forage?.tuck ? F_DIVE : b.flap ? Math.floor(b.ph / TAU * NF) % NF
          : b.vz < -2.2 ? F_DIVE : b.sp.flight.soar && (ws > 0.55 || b.roll * b.roll > 0.12) ? F_SOAR : F_GLIDE;
      }
    },
    fly(b, dt, night, wd, ws, T) {
      const sp = b.sp, F = sp.flight, fl = sp.flock, P = Engine.P;
      let tx, ty, tz, turn = F.turn, vT = F.speed + (b.flap ? 0.6 : 0);
      if (b.st === 'dive' || b.st === 'under') { this.forage(b, dt); return; }
      if (b.st === 'leave') { const a = Math.atan2(b.y - P.y, b.x - P.x); tx = b.x + Math.cos(a) * 50; ty = b.y + Math.sin(a) * 50; tz = Math.max(fl.lev, b.gzv) + 45; }
      else if (b.st === 'land') {
        const s = b.target, p = Perches.at(s);
        if (p.gone || (p.speed || 0) > (s.flushSpeed ?? 1e9) * 0.6 || Perches.taken(s.key, b)) { b.st = 'fly'; b.target = null; return; }
        const lx = p.x, ly = p.y, lz = this.bodyZ(b, s, p), d = Math.hypot(lx - b.x, ly - b.y); b.flare = 0;
        tx = lx; ty = ly; tz = lz + Math.min(d * 0.32, 30); turn = d < 25 ? 2.2 : 1.2; vT = clamp(d * 0.35, 3.5, F.speed);
        b.want = d < 7 || b.vz > 0.8;   // a few beats to flare and brake at the end
        if (d < 9) {   // the last few metres: lined up, wings flared, dropping straight onto the spot
          const step = Math.min(d, clamp(d * 0.9, 1.2, 6) * dt); if (d > 0.01) { b.x += (lx - b.x) / d * step; b.y += (ly - b.y) / d * step; b.a += wrap(Math.atan2(ly - b.y, lx - b.x) - b.a) * Math.min(1, dt * 4); }
          b.z += (lz - b.z) * Math.min(1, dt * 2.5); b.v = step / Math.max(dt, 1e-3);
          { const hx = b.x - P.x, hy = b.y - P.y, hz = b.z - P.z - CONFIG.eyeHeight, hd = Math.hypot(hx, hy, hz); if (hd < 0.9 && d > 0.5) b.z += (0.9 - hd) * Math.min(1, dt * 6); }   // over your head, not through it
          b.flare = clamp(1 - d / 9, 0, 1); b.vz = 0; b.roll *= 0.9; b.pitch += (0.3 + 0.55 * b.flare - b.pitch) * Math.min(1, dt * 5); b.want = true;   // the flare: body tipped well back, tail down, wings beating fast to brake (b.flare 0..1 as it closes)
          if (d < 0.3 && Math.abs(b.z - lz) < 0.3) { b.target = null; this.settle(b, s); }
          return;
        }
        if (b.lt > 45) { b.st = 'fly'; b.target = null; }   // couldn't make the approach: go round
      } else {
        if (b.st === 'takeoff' && b.lt > 2.2) b.st = 'fly';
        const R = b.R0 * (1 + 0.3 * Math.sin(T * 0.05 + b.wob)), cx = fl.x + b.ox, cy = fl.y + b.oy, dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) || 1;
        const hd = Math.atan2(dy, dx) + b.dir * (Math.PI / 2 + clamp((d - R) / R, -0.6, 1.4) * 0.8);   // circle the flock's centre
        tx = b.x + Math.cos(hd) * 20; ty = b.y + Math.sin(hd) * 20;
        tz = Math.max(fl.lev + b.alt + Math.min(3, b.alt * 0.3) * Math.sin(T * 0.13 + b.wob), b.gzv + (b.gzv > fl.lev + 0.5 ? 22 : F.clear));
        const Ld = b.leader;
        if (Ld && b.st === 'fly') {
          if (!this.list.includes(Ld) || Ld.st === 'leave' || Ld.st === 'takeoff') { b.leader = null; b.slot = null; }
          else if (Ld.st === 'land' || Ld.st === 'float' || Ld.st === 'stand') {   // the leader's coming down: so do we, nearby, on the same sort of perch
            const sp0 = Ld.target || Ld.spot; b.leader = null; b.slot = null;
            if (sp0 && rnd() < sp.flocking.landTogether) { const c = Perches.near(sp0.x, sp0.y, 25, [sp0.provider || 'water'], b).filter(q => Perches.free(q, b) && (q.bold || Math.hypot(q.x - P.x, q.y - P.y) > 25));
              if (c.length) { c.sort((p, q) => Math.hypot(p.x - sp0.x, p.y - sp0.y) - Math.hypot(q.x - sp0.x, q.y - sp0.y)); b.st = 'land'; b.target = c[Math.min(c.length - 1, rnd() * 3 | 0)]; b.lt = 0; return; } }
          } else {   // hold the slot (it breathes a little), matching the leader's speed and catching up when behind
            const c = Math.cos(Ld.a), si = Math.sin(Ld.a), w = 0.6 * Math.sin(T * 0.3 + b.wob), o = b.slot;
            const sx = Ld.x + c * (o[0] + w) - si * (o[1] + w * 0.5), sy = Ld.y + si * (o[0] + w) + c * (o[1] + w * 0.5), ex = sx - b.x, ey = sy - b.y, along = ex * c + ey * si;
            tx = sx + c * 6; ty = sy + si * 6; tz = Ld.z + o[2]; turn = 1.8;
            vT = Ld.v + clamp(along * 0.6, -2.5, 5); b.want = Ld.flap || along > 3 || b.z < tz - 1;
          }
        }
        if (F.followBoats && Engine.boat && Math.abs(Engine.boat.speed || 0) > 1.5) vT += Math.abs(Engine.boat.speed) * 0.7;   // keeping up with your wake
        if (b.st === 'fly') {
          if (!b.leader && (b.flapT -= dt) <= 0) { b.want = !b.want; b.flapT = b.want ? rr(F.flapTime) : rr(F.glideTime) * (F.soar ? 1 + ws : 1); }
          const roost = night && sp.night === 'roost';
          if (!b.leader && b.lt > 15 && rnd() < dt / (roost || ENV.storm > 0.5 ? 5 : sp.landEvery * (b.group ? 2 : 1))) { const s = this.pickSpot(b); if (s) { b.st = 'land'; b.target = s; b.lt = 0; } }
          const Fo = sp.forage;   // fishing on the wing: look ahead and below for water to strike at
          if (Fo && !roost && !b.group && b.lt > 8 && rnd() < dt / Fo.every) {
            const h = b.z - fl.lev, ahead = clamp(h, 3, 20) * Fo.lead, x = b.x + Math.cos(b.a) * ahead, y = b.y + Math.sin(b.a) * ahead, w = Game.waterAt(x, y);
            if (w.depth > Fo.minDepth && !w.iced && b.z - w.level > Fo.from[0] * 0.6 && b.z - w.level < Fo.from[1] * 1.6 && Math.hypot(x - P.x, y - P.y) > 6
              && !this.list.some(o => o !== b && o.st === 'float' && Math.hypot(o.x - x, o.y - y) < 3)) {
              if (b.leader) { b.leader = null; b.slot = null; }
              b.st = 'dive'; b.lt = 0; b.fo = { x, y, lev: w.level, kd: w.kindId, z0: b.z }; return;
            }
          }
        }
      }
      if (b.st === 'takeoff') { b.want = true; vT = F.speed; tz = Math.max(tz, b.z + 3); }
      // keep clear of you: headed your way and getting close, it turns off and climbs over (a bird landing on your boat is the exception)
      const W = sp.wary * FEAR * 0.9, eyeZ = P.z + CONFIG.eyeHeight, ex = b.x - P.x, ey = b.y - P.y, dh = Math.hypot(ex, ey), bold = b.st === 'land' && b.target && b.target.bold;
      if (!bold && dh < W * 2.5) {
        if (Math.cos(b.a) * ex + Math.sin(b.a) * ey < 0) { const away = Math.atan2(ey, ex) + (b.dir || 1) * 0.6; tx = b.x + Math.cos(away) * 20; ty = b.y + Math.sin(away) * 20; turn = Math.max(turn, 2.2); }
        tz = Math.max(tz, eyeZ + W * (1.2 - dh / (W * 2.5))); b.want = true;
      }
      const diff = wrap(Math.atan2(ty - b.y, tx - b.x) - b.a), tr = clamp(diff * 1.3, -turn, turn);   // steer, bank into the turn, climb or sink
      b.a += tr * dt; b.roll += (clamp(-tr * 0.65, -0.65, 0.65) - b.roll) * Math.min(1, dt * 3);
      const tvz = clamp((tz - b.z) * (b.st === 'land' ? 0.9 : 0.4), b.st === 'land' ? -4 : -2.5, b.st === 'takeoff' ? 2.8 : 3);
      b.vz += (tvz - b.vz) * Math.min(1, dt * (b.st === 'takeoff' ? 3 : 1.5)); if (b.st !== 'land' && b.vz > 1.1) b.want = true;
      b.v += (vT - b.v) * Math.min(1, dt * (b.st === 'takeoff' ? 0.9 : 0.6));
      b.x += (Math.cos(b.a) * b.v + Math.cos(wd) * ws * 0.4) * dt; b.y += (Math.sin(b.a) * b.v + Math.sin(wd) * ws * 0.4) * dt; b.z += b.vz * dt;
      b.z = Math.max(b.z, b.gzv + 0.3);
      { const ez = b.z - eyeZ, rx = b.x - P.x, ry = b.y - P.y, d3 = Math.hypot(rx, ry, ez), R = bold ? 1.2 : W;   // never inside that radius: pushed up and out
        if (d3 < R) { const k = (R - d3) / Math.max(d3, 0.3) * Math.min(1, dt * 4); b.x += rx * k; b.y += ry * k; b.z += (Math.abs(ez) + 0.5) * k; } }
      if (b.st !== 'land') for (const o of this.list) { if (o === b || o.spot || o.st === 'land' || o.st === 'dive' || o.st === 'under') continue;   // keep a wingspan apart in the air
        const dx = b.x - o.x, dy = b.y - o.y, dz = b.z - o.z, d = Math.hypot(dx, dy, dz), need = 1.6 * (b.sp.look.wing.span + o.sp.look.wing.span) * b.sc;
        if (d < need && d > 1e-4) { const k = (need - d) / d * Math.min(1, dt * 2); b.x += dx * k; b.y += dy * k; b.z += dz * k * 0.5; } }
      b.pitch += (clamp(b.vz / Math.max(b.v, 2), -0.5, 0.5) * 0.8 + (b.st === 'land' && b.want ? 0.45 : 0) - b.pitch) * Math.min(1, dt * 3);
      if (b.st === 'takeoff' && b.lt < 1.2 && (b.ripT = (b.ripT || 0) - dt) <= 0 && b.z < b.gzv + 0.8 && Game.waterAt(b.x, b.y).depth > 0.2) { b.ripT = 0.22; Game.ripple(b.x, b.y, 0.25); }   // pattering off the water
    },
    forage(b, dt) {   // the strike: every number comes from the species' forage block
      const Fo = b.sp.forage, f = b.fo, sc = b.sc, aim = f.lev + Fo.target * sc;
      const after = () => {   // float a while if the species does, otherwise climb away
        if (Fo.after) { const s = { kind: 'water', x: b.x, y: b.y, z: f.lev, pose: 'float', water: { kd: f.kd, lev: f.lev }, key: `w:${b.x | 0}:${b.y | 0}:${rnd()}` };
          this.settle(b, s, true); b.stay = rr(Fo.after); b.pitch = 0.2; }
        else { b.st = 'takeoff'; b.lt = 0.6; b.vz = 2; b.v = Math.max(b.v, Fo.speed[0]); }
        b.fo = null; };
      if (b.st === 'under') { b.z = aim; b.pitch = -0.4; if (b.lt > Fo.under) { Game.ripple(b.x, b.y, Fo.ripple * 0.5); after(); } return; }
      const dx = f.x - b.x, dy = f.y - b.y, dz = aim - b.z, dh = Math.hypot(dx, dy);
      b.a += wrap(Math.atan2(dy, dx) - b.a) * Math.min(1, dt * 3);
      let hit;
      if (Fo.tuck) {   // wings swept back: a straight fall onto the spot, gathering speed
        const d = Math.hypot(dh, dz) || 1; b.v = Math.min(Fo.speed[1], Math.max(b.v, Fo.speed[0]) + dt * Fo.accel); b.want = false;
        const step = Math.min(d, b.v * dt); b.x += dx / d * step; b.y += dy / d * step; b.z += dz / d * step; b.vz = dz / d * b.v;
        b.pitch += (Math.atan2(dz, dh) * 0.95 - b.pitch) * Math.min(1, dt * 5);
        const late = 1 - clamp((b.z - aim) / Math.max(2, f.z0 - aim), 0, 1); b.roll = Fo.twist * late * late;
        hit = b.z <= Math.max(aim, f.lev) + 0.15;
      } else {   // a flapping swoop down to the surface
        b.v = clamp(b.v + (clamp(dh * 0.6, Fo.speed[0], Fo.speed[1]) - b.v) * Math.min(1, dt * Fo.accel * 0.4), Fo.speed[0], Fo.speed[1]); b.want = dh < 4;
        const step = Math.min(dh, b.v * dt); if (dh > 1e-3) { b.x += dx / dh * step; b.y += dy / dh * step; }
        b.vz = clamp(dz / Math.max(0.3, dh / b.v), -6, 2); b.z += b.vz * dt; b.pitch = clamp(b.vz / Math.max(b.v, 2), -0.6, 0.3) + (dh < 4 ? 0.4 : 0);
        b.roll += (Fo.twist * clamp(1 - dh / 6, 0, 1) - b.roll) * Math.min(1, dt * 3);
        hit = dh < 1;
      }
      if (hit) {
        Game.splash(b.x, b.y, Fo.splash); Game.ripple(b.x, b.y, Fo.ripple);
        if (Fo.scare) for (const fi of Game.fishNear(b.x, b.y, Fo.scare)) { fi.stress = 1; fi.thx = b.x; fi.thy = b.y; fi.tNext = 0; }   // the fish below scatter
        Game.emit('birdDive', b, b.x, b.y); b.roll = 0;
        if (Fo.under > 0) { b.st = 'under'; b.lt = 0; b.v = b.vz = 0; } else after();
        return;
      }
      if (b.lt > 20) { b.st = 'fly'; b.fo = null; }
    },
    perched(b, dt, night) {   // floating, or standing on whatever it came down on (riding it if it moves)
      const s = b.spot, P = Engine.P, bt = Engine.boat, p = Perches.at(s);
      if (p.gone) { this.takeoff(b); return; }
      const near = Math.hypot(b.x - P.x, b.y - P.y), d3 = Math.hypot(near, b.z - P.z - 1), roost = b.sp.night === 'roost';
      const sh = b.sp.shy * FEAR, shy = s.bold ? d3 < 2.5 : s.high ? d3 < sh * 0.75 : near < (bt && Math.abs(bt.speed || 0) > 1.5 ? sh * 2.2 : Engine.swim ? sh * 0.65 : sh);
      if (shy || (p.speed || 0) > (s.flushSpeed ?? 1e9) || ((!night || !roost) && b.lt > b.stay) || (!night && b.stay > 1e8 && rnd() < dt / 40)) { this.takeoff(b); return; }   // at dawn they drift off one by one
      if (s.pose === 'float') {
        const wa = (ENV.windDir ?? 0.8) + Math.PI; b.a += wrap(wa + 0.6 * Math.sin(b.wob + Engine.time * 0.03) - b.a) * Math.min(1, dt * 0.2);   // head to wind
        b.x += Math.cos(b.a) * 0.12 * dt; b.y += Math.sin(b.a) * 0.12 * dt;   // paddling about, keeping a little room from the others
        for (const o of this.list) if (o !== b && o.st === 'float') { const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy), need = b.sp.space * 1.4;
          if (d < need && d > 1e-4) { const k = (need - d) / d * Math.min(1, dt * 0.8); b.x += dx * k; b.y += dy * k; } }
        s.x = b.x; s.y = b.y;
        const W = s.water, sw = Engine.swellAt(b.x, b.y, W.kd), sw2 = Engine.swellAt(b.x + Math.cos(b.a) * 0.3, b.y + Math.sin(b.a) * 0.3, W.kd);
        b.z = this.bodyZ(b, s, b); b.pitch = -0.08 + clamp((sw2 - sw) * 2, -0.3, 0.3); b.roll = 0.05 * Math.sin(Engine.time * 1.3 + b.wob);
        if (b.gzT > 0.39 && Game.groundAt(b.x, b.y) > W.lev - 0.05) this.takeoff(b);   // drifted ashore
        return;
      }
      b.x = p.x; b.y = p.y; b.z = this.bodyZ(b, s, p);
      if (p.yaw !== undefined) {   // a moving perch sets the heading and the tilt; now and then it looks about
        b.a = p.yaw + 0.35 * Math.sin(Engine.time * 0.4 + b.wob) * (Math.sin(Engine.time * 0.11 + b.wob) > 0.6 ? 1 : 0.15); b.roll = p.roll || 0; b.pitch = (p.pitch || 0) + 0.08;
      } else { const wa = (ENV.windDir ?? 0.8) + Math.PI; b.a += wrap(wa + 0.6 * Math.sin(b.wob + Engine.time * 0.03) - b.a) * Math.min(1, dt * 0.2); b.pitch = 0.1; b.roll = 0; }
      if (s.walk && b.lt > 4 && rnd() < dt / 12) { const a = b.a + (rnd() - 0.5) * 2, st = 0.4 + rnd() * 0.8, nx = s.x + Math.cos(a) * st, ny = s.y + Math.sin(a) * st;   // a few steps along the beach
        if (Game.waterAt(nx, ny).depth < -0.05 && !this.list.some(o => o !== b && o.spot && Math.hypot(o.x - nx, o.y - ny) < b.sp.space * 1.2)) { s.x = nx; s.y = ny; s.z = Game.groundAt(nx, ny); b.a = a; } }
    },

    draw(R, gl, L, E) {
      if (!this.list.length) return;
      gl.uniform1f(L.u.fsh, 1); gl.uniform1f(L.u.wig, 0); gl.uniform1f(L.u.swm, 0); gl.uniform3fv(L.u.jawP, [0, 0, 0]);
      gl.uniform1f(L.u.roll, 0);
      const groups = this.drawGroups || (this.drawGroups = []);
      for (const m of groups) m.instances.length = 0;
      groups.length = 0;
      for (const b of this.list) {
        if (Math.abs(b.x - E[0]) > 700 || Math.abs(b.y - E[1]) > 700) continue;
        const sp = b.sp; let m = sp.gpu[b.frame];
        if (!m) { m = sp.gpu[b.frame] = R.animalMesh(sp.meshes[b.frame], 44); m.instances = []; }
        if (!m.instances.length) groups.push(m);
        const W = b.st === 'float' ? b.spot.water : b.st === 'under' && b.fo ? { kd: b.fo.kd, lev: b.fo.lev } : null;
        m.instances.push(b.x, b.y, b.z, b.sc, b.a, b.tint, W ? W.lev + Engine.swellAt(b.x, b.y, W.kd) : -1e4, W ? WATER[W.kd].murk : 0, 0, b.pitch || 0, b.roll || 0);
      }
      for (const m of groups) { R.upInst(m, m.instances); R.drawMesh(m, m.instances.length / 11); }
      gl.uniform1f(L.u.roll, 0); gl.uniform1f(L.u.fsh, 0);
    },
  };
  return G;
})();
