'use strict';
// ======================================================================
//  FISH — species are data. Each is a JSON definition (see fish/README.md): size statistics, body shape and
//  colours, habitat & temperature preferences, activity by hour, behaviour, diet and fight. Built-in species
//  live in <script type="application/json" data-builtin="fish"> blocks at the end of this file; more can be dropped onto
//  the game window (saved in this browser) or loaded with Game.loadFish(urlOrObject).
// ======================================================================
// Mesh detail for fish and shellfish in the game (the Fish Studio builds at FISH_SUB 6 / PLAN_Q 1 for close-ups)
const FISH_SUB = 2, PLAN_Q = 0.5;
const ZERO3 = [0, 0, 0];
const FISH_SCHEMA = 'embercrown-fish/1';
const WATER_KEYS = ['sea', 'lake', 'pond', 'river', 'creek'];
const FISH_DEFAULTS = {
  schema: FISH_SCHEMA, id: '', name: '', scientific: '', description: '',
  size: { length_cm: { min: 10, typical: 25, max: 50, spread: 0.25 }, weight: { a: 0.01, b: 3.0 }, condition_sd: 0.08 },
  body: {
    profile: [0.5, 0.82, 0.97, 1, 0.92, 0.72, 0.46, 0.28], height: 0.2, width: 0.11, flex: 1,
    head: { length: 0.24, snout: 0.5, mouth: 0.5, jaw: 'terminal', bill: 0, bill_kind: 'spear' },
    tail: { shape: 'forked', size: 0.18, fork: 0.25 },
    fins: { dorsal: [{ at: 0.42, length: 0.14, height: 0.1, spiny: false }], adipose: false, anal: { at: 0.72, length: 0.1, height: 0.07 }, pectoral: 0.1, pelvic: 0.07 },
    barbels: 0, plan: 'fish', parts: {},
    lie: '', swim: 'auto',   // lie: 'left' / 'right' = a flatfish lying on that side (eyes on the other); swim: how the body moves
    colors: { back: '#4a4a30', flank: '#a09060', belly: '#eee4c8', fins: '#7a6a48', eye: '#101010', mouth: '#5a1e1a' },
    pattern: [],
  },
  habitat: {
    climates: null,                     // island climates it lives in, e.g. ["temperate", "arctic"]; null = any (water temperature decides)
    waters: { lake: 0.5, pond: 0.5, river: 0.5, creek: 0.5 },
    depth_m: { min: 0.3, preferred: 2, max: 10 },
    temperature_c: { min: 4, optimal: 18, max: 28 },
    current_ms: { preferred: 0, max: 1 },
    turbidity_max: 0.8,
    cover: { rocks: 0.4, weeds: 0.4, reeds: 0.3, lilies: 0.3, wood: 0.3, coral: 0, anemone: 0, open: 0.4 },
    cover_required: 0,                  // 0..1: 1 = only found where its favourite cover is (a clownfish and its anemone)
    oxygen_min_mgL: 4,                  // below this (dissolved oxygen) the fish is stressed and leaves
  },
  population: { density: 0.6, school: { min: 1, max: 1 }, home_range_m: 15 },
  activity: { pattern: 'crepuscular' },
  behavior: { cruise_bl_s: 0.8, burst_bl_s: 8, turn_rate: 2.2, station_holding: 0, ambush: 0,
    depth_zone: { surface: 0.15, mid: 0.5, bottom: 0.35 }, wariness: 0.5, spook_m: 5, recover_s: 40, curiosity: 0.4, rise_per_hour: 1,
    // air breathers (marine mammals): seconds between breaths, seconds at the surface, leaps an hour, how much it hauls
    // out on shore to rest (0..1), and how big a blow it shows when it surfaces (0 none .. 1 a whale's spout)
    breath_hold_s: 0, surface_s: 5, leap_per_hour: 0, haul_out: 0, blow: 0 },
  diet: { food: { insects: 0.3, worms: 0.3, fish: 0.2, nymphs: 0.2 }, piscivore_from_cm: 0, feeding_zone: { surface: 0.2, mid: 0.4, bottom: 0.4 }, meals_per_day: 3 },
  fight: { strength: 0.5, stamina: 0.5, jumps: 0.2, runs: 0.5, teeth: 0 },   // teeth 0..1: how easily it bites through line (a wire leader stops it)
};
// weight maps and lists are replaced whole (a species listing waters {creek:1} means no other waters)
const FISH_REPLACE = new Set(['waters', 'cover', 'food', 'feeding_zone', 'depth_zone', 'dorsal', 'pattern', 'profile']);
const ACTIVITY_PRESETS = { // relative activity for each hour 0..23
  diurnal: [.15, .12, .1, .1, .12, .25, .5, .75, .9, 1, 1, .95, .9, .9, .95, 1, 1, .95, .85, .6, .4, .3, .22, .18],
  crepuscular: [.3, .25, .22, .25, .45, .85, 1, .95, .7, .5, .4, .35, .32, .35, .4, .5, .65, .85, 1, 1, .8, .55, .42, .35],
  nocturnal: [.95, 1, 1, .95, .85, .7, .45, .3, .2, .15, .12, .12, .12, .12, .15, .2, .3, .45, .7, .9, 1, 1, 1, 1],
  cathemeral: [.5, .48, .45, .45, .5, .65, .75, .75, .7, .65, .6, .6, .6, .6, .62, .65, .7, .75, .8, .75, .65, .58, .55, .52],
};
const FISH_FOODS = ['insects', 'nymphs', 'worms', 'crayfish', 'fish', 'frogs', 'snails', 'shrimp', 'plankton', 'plants', 'eggs', 'leeches', 'mammals'];
const hexRGB = h => { let s = String(h).replace('#', ''); if (s.length === 3) s = s.split('').map(c => c + c).join(''); const n = parseInt(s, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const isHex = h => typeof h === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h);
// defaults under a definition: objects merge key by key, anything else (and any key in `replace`) is taken whole
function deepMerge(base, over, replace, key) {
  if (over === undefined) return base;
  if (Array.isArray(base) || Array.isArray(over) || (replace && replace.has(key)) || typeof base !== 'object' || base === null || typeof over !== 'object' || over === null) return over;
  const o = {}; for (const k of new Set([...Object.keys(base), ...Object.keys(over)])) o[k] = deepMerge(base[k], over[k], replace, k); return o;
}
const fishMerge = (base, over) => deepMerge(base, over, FISH_REPLACE);
// Fill defaults and check a definition. Returns { def, errors, warnings }; errors mean it can't be used.
function validateFish(raw) {
  const errors = [], warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { def: null, errors: ['not a JSON object'], warnings };
  for (const k of Object.keys(raw)) if (!(k in FISH_DEFAULTS) && !k.startsWith('_')) warnings.push(`unknown field "${k}" (ignored)`);
  const d = fishMerge(FISH_DEFAULTS, raw);
  const num = (v, path, lo, hi) => { if (typeof v !== 'number' || !isFinite(v)) errors.push(`${path} must be a number`); else if (v < lo || v > hi) warnings.push(`${path} = ${v} is outside the usual ${lo}..${hi}`); };
  if (!raw.id || !/^[a-z0-9_\-]+$/.test(raw.id)) errors.push('id is required: lowercase letters, digits, _ or - (e.g. "brown_trout")');
  if (!raw.name) errors.push('name is required');
  if (raw.schema && raw.schema !== FISH_SCHEMA) warnings.push(`schema "${raw.schema}" — this engine reads "${FISH_SCHEMA}"`);
  const L = d.size.length_cm; num(L.min, 'size.length_cm.min', 1, 2000); num(L.typical, 'size.length_cm.typical', 1, 2500); num(L.max, 'size.length_cm.max', 1, 3000); num(L.spread, 'size.length_cm.spread', 0.02, 1);   // up to a blue whale
  if (!(L.min <= L.typical && L.typical <= L.max)) errors.push('size.length_cm needs min <= typical <= max');
  const plan = d.body.plan || 'fish', PI_ = PLAN_INFO[plan];
  if (!PI_) errors.push(`body.plan "${plan}" unknown; use ${Object.keys(PLAN_INFO).join(', ')}`);
  else if (plan !== 'fish') {
    const rb = raw.body || {}, rp = (rb.parts && typeof rb.parts === 'object') ? rb.parts : {};
    const hw = plan === 'bivalve' ? (SHELL_SHAPES[rp.shell || 'clam'] || PI_) : PI_;
    if (rb.height === undefined) d.body.height = hw.height; if (rb.width === undefined) d.body.width = hw.width;
    d.body.parts = { ...PI_.parts, ...rp };
    for (const k of Object.keys(rp)) if (!(k in PI_.parts)) warnings.push(`body.parts.${k} is not used by the ${plan} plan (it uses ${Object.keys(PI_.parts).join(', ')})`);
    for (const [k, v] of Object.entries(d.body.parts)) if (typeof PI_.parts[k] === 'number' && (typeof v !== 'number' || !isFinite(v)) && !(plan === 'turtle' && k === 'flippers' && typeof v === 'boolean')) errors.push(`body.parts.${k} must be a number`);   // turtles: flippers is a size (sea turtle) or true/false (legged builder)
    if (plan === 'bivalve' && !SHELL_SHAPES[d.body.parts.shell]) errors.push(`body.parts.shell: ${Object.keys(SHELL_SHAPES).join(', ')}`);
    if (plan === 'squid' && !['rhomboid', 'round'].includes(d.body.parts.fin_shape)) errors.push('body.parts.fin_shape: rhomboid or round');
    if (plan === 'ray' && !['manta', 'diamond', 'round'].includes(d.body.parts.shape)) errors.push('body.parts.shape: manta, diamond or round');
    if (plan === 'ray' && !['front', 'under'].includes(d.body.parts.mouth)) errors.push('body.parts.mouth: front (mantas) or under (stingrays, skates)');
    if (plan === 'pinniped' && !['flippers', 'paddle', 'tail'].includes(d.body.parts.rear)) errors.push('body.parts.rear: flippers (seals, sea lions), paddle (manatees) or tail (otters)');
    if (plan === 'frog' && !['sit', 'swim'].includes(d.body.parts.pose)) errors.push('body.parts.pose: sit or swim');
    if (plan === 'jelly' && !JELLY_SHAPES.includes(d.body.parts.shape)) errors.push(`body.parts.shape: ${JELLY_SHAPES.join(', ')}`);
    for (const [k, v] of Object.entries(d.body.parts)) if (typeof PI_.parts[k] === 'boolean' && typeof v !== 'boolean') errors.push(`body.parts.${k} must be true or false`);
  } else d.body.parts = {};
  num(d.size.weight.a, 'size.weight.a', (PI_ && PI_.amin) || 0.0005, (PI_ && PI_.amax) || (['bivalve', 'snail'].includes(plan) ? 0.6 : 0.1)); num(d.size.weight.b, 'size.weight.b', 2.5, 3.6);
  const T = d.habitat.temperature_c; if (!(T.min < T.optimal && T.optimal < T.max)) errors.push('habitat.temperature_c needs min < optimal < max');
  const Dp = d.habitat.depth_m; if (!(Dp.min <= Dp.preferred && Dp.preferred <= Dp.max)) errors.push('habitat.depth_m needs min <= preferred <= max');
  for (const k of Object.keys(d.habitat.waters)) if (!WATER_KEYS.includes(k)) warnings.push(`habitat.waters.${k}: unknown water (use ${WATER_KEYS.join(', ')})`);
  const Cl = d.habitat.climates; if (Cl != null && (!Array.isArray(Cl) || !Cl.length || Cl.some(c => !CLIMATES[c]))) errors.push(`habitat.climates: null or a list of ${Object.keys(CLIMATES).join(', ')}`);
  if (!WATER_KEYS.some(k => d.habitat.waters[k] > 0)) errors.push('habitat.waters must give at least one water a weight above 0');
  const A = d.activity.pattern;
  if (typeof A === 'string' ? !ACTIVITY_PRESETS[A] : !(Array.isArray(A) && A.length === 24 && A.every(v => typeof v === 'number')))
    errors.push(`activity.pattern must be one of ${Object.keys(ACTIVITY_PRESETS).join(', ')} or an array of 24 numbers (hours 0-23)`);
  for (const [k, v] of Object.entries(d.body.colors)) if (!isHex(v)) errors.push(`body.colors.${k} must be a hex colour like "#a08050"`);
  for (const [i, p] of (d.body.pattern || []).entries()) {
    if (!['spots', 'bars', 'stripe', 'mottled', 'lateral_line', 'spot', 'scales'].includes(p.type)) errors.push(`body.pattern[${i}].type "${p.type}" unknown`);
    if (p.color && !isHex(p.color)) errors.push(`body.pattern[${i}].color must be a hex colour`);
  }
  if (!['forked', 'square', 'rounded', 'lunate', 'emarginate', 'pointed', 'flukes', 'heterocercal'].includes(d.body.tail.shape)) errors.push('body.tail.shape: forked, square, rounded, lunate, emarginate, pointed, flukes or heterocercal');
  if (!['', 'left', 'right'].includes(d.body.lie || '')) errors.push('body.lie: "left" or "right" for a flatfish (the side it lies on), or leave it out');
  if (!SWIM_MODES.hasOwnProperty(d.body.swim)) errors.push(`body.swim: ${Object.keys(SWIM_MODES).join(', ')}`);
  if (!['spear', 'beak'].includes(d.body.head.bill_kind)) errors.push('body.head.bill_kind: spear (marlin, swordfish) or beak (gar, needlefish)');
  num(d.body.head.bill, 'body.head.bill', 0, 0.45);
  if (!Array.isArray(d.body.profile) || d.body.profile.length < 3) errors.push('body.profile must be an array of 3+ numbers');
  for (const k of Object.keys(d.diet.food)) if (!FISH_FOODS.includes(k)) warnings.push(`diet.food.${k}: not a standard food (${FISH_FOODS.join(', ')}) — fine, but baits must use the same word`);
  if (d.population.school.min > d.population.school.max) errors.push('population.school needs min <= max');
  return { def: errors.length ? null : d, errors, warnings };
}

// ---- procedural fish body from the definition (model: 1 long along +x, nose at +0.5, centred) ----
const nPat = makeNoise(4242);
// a whale's or dolphin's flipper: a smooth, flattened paddle swept down and back from the root, tapering to a point;
// bumpy: the knobs (tubercles) along a humpback's leading edge
function cetaceanFlipper(M, root, s, len, col, bumpy) {
  const L = len * 0.95; cetaceanBlade(M, root, norm3([-0.5, s * 0.62, -0.6]), L, u => L * 0.21 * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, u * 1.3 + 0.2))) * (1 - u ** 1.6 * 0.82), col, bumpy, 0.14);   // broad well out toward the tip, then a quick taper
}
// a solid blade (flipper, fluke) from root along dir for L, chordAt(u) its half-width (0 root .. 1 tip), thin: thickness / width
function cetaceanBlade(M, root, dir, L, chordAt, col, bumpy, thin) {
  const N = 7;
  const fore = norm3([1 - dir[0] * dir[0], -dir[0] * dir[1], -dir[0] * dir[2]]);   // the chord's forward direction, square to the flipper's length
  const smooth = M.smoothTube; M.smoothTube = true;
  for (let k = 0; k < N; k++) { const u0 = k / N, u1 = (k + 1) / N, p0 = root.map((v, i) => v + dir[i] * L * u0), p1 = root.map((v, i) => v + dir[i] * L * u1), n = 12;
    const a = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], Xb = norm3(cross3(a, dir)), Yb = cross3(dir, Xb), phi = Math.atan2(fore[0] * Yb[0] + fore[1] * Yb[1] + fore[2] * Yb[2], fore[0] * Xb[0] + fore[1] * Xb[1] + fore[2] * Xb[2]);   // (the tube's own cross-section axes)
    M.tube(p0, p1, chordAt(u0), Math.max(chordAt(u1), L * 0.004), n, col, k === N - 1, kk => { const t = kk / n * 6.2832 - phi; return 1 / Math.hypot(Math.cos(t), Math.sin(t) / thin); });   // flattened, but solid
    if (bumpy) { const c = chordAt(u0 + 0.5 / N); M.blob(p0.map((v, i) => v + dir[i] * L * 0.5 / N + fore[i] * c * 0.82), c * 0.2, c * 0.2, c * 0.2, 4, 8, col); } }
  M.smoothTube = smooth;
}
function fishMesh(D) {
  if (D.body.plan && D.body.plan !== 'fish') return planMesh(D);
  D._wave = 1;
  const B = D.body, C = {}, lie = B.lie === 'left' ? 1 : B.lie === 'right' ? -1 : 0;   // a flatfish: its eyed side (+y or -y) ends up on top
  D._swim = SWIM_MODES[B.swim] >= 0 ? SWIM_MODES[B.swim] : lie ? 4 : 0;
  // 'up' for colouring (back above, belly below); on a flatfish it's the eyed side
  const upness = fj => lie ? lie * Math.sin(fj / 16 * 6.2832) : Math.cos(fj / 16 * 6.2832);
  for (const k in FISH_DEFAULTS.body.colors) C[k] = hexRGB(B.colors[k] || FISH_DEFAULTS.body.colors[k]);
  const pats = (B.pattern || []).map(p => Object.assign({ alpha: 1, region: 'upper_flank' }, p, { rgb: hexRGB(p.color || '#000000') }));
  const M = meshBuilder(true), mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const tl = clamp(B.tail.size, 0.05, 0.35), x0 = 0.5, x1 = -0.5 + tl * 0.85, bl = x0 - x1;
  // body depth along the length: a smooth (Catmull-Rom) curve through the profile points, so the flank has no ripples
  const prof = t => { const p = B.profile, n = p.length, f = clamp(t, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(f)), u = f - i, P = k => p[clamp(k, 0, n - 1)];
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    return Math.max(0.03, b + 0.5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a)))); };
  const NR = 18, NS = 16, X = t => x0 - t * bl;
  // the snout rounds over the first ring (same size at ring 0 and ring 1 as before, eased in between)
  const f0 = 0.2 + 0.5 * B.head.snout, snF = t => t >= 1 / NR ? 1 : f0 + (1 - f0) * (1 - (1 - Math.max(0, t) * NR) ** 2);
  const HH = t => B.height / 2 * prof(t) * snF(t), HW = t => B.width / 2 * Math.pow(prof(t), 0.9) * snF(t);
  const V = (i, j) => { const t = i / NR, a = j / NS * 6.2832; return [X(t), Math.sin(a) * HW(t), Math.cos(a) * HH(t)]; };
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const inRegion = (r, v) => r === 'upper' ? v > 0.15 : r === 'flank' ? v > -0.4 && v < 0.75 : r === 'lower' ? v < -0.2 : r === 'all' ? true : v > -0.4;
  // mouth: the lower jaw is the front of the head below the mouth line, back to a hinge set by head.mouth.
  // The line sits high for an upturned (superior) jaw, at mid-height for terminal, low for underslung (inferior).
  const gape = clamp(B.head.length * (0.2 + 0.75 * B.head.mouth), 0.04, 0.42), ih = clamp(Math.round(gape / bl * NR), 1, NR - 4);
  const jb = Math.round({ superior: 0.45, terminal: 0.52, inferior: 0.62 }[B.head.jaw] * NS / 2), ja = jb / NS * 6.2832;  // mouth line: segment boundary jb from the top
  const below = j => { const m = Math.min(j, NS - 1 - j); return m >= jb; };   // quad j is under the mouth line (either side)
  const th = ih / NR, hx = X(th), hz = Math.cos(ja) * HH(th);
  D._jaw = [hx, hz, 0.3 + 0.55 * B.head.mouth];
  // the jaw is rigid in front of the hinge; behind it the throat skin stretches over R, long enough (vs the depth below
  // the hinge and the widest gape) that it never folds over itself
  const R = Math.max(gape * 0.3, 1.6 * D._jaw[2] * (hz + HH(th))), ihT = clamp(ih + Math.ceil(R / bl * NR), ih, NR - 2);
  // Body skin. Logic (jaw, patterns, spot placement) still works on the NR x NS grid of patches, but the skin is drawn
  // SUB times finer with normals taken from the smooth body surface and colours worked out at every vertex, so
  // light and pattern edges blend instead of stepping patch by patch.
  const SUB = FISH_SUB, GI = NR * SUB, GJ = NS * SUB;
  const Vc = (fi, fj) => { const t = fi / NR, a = fj / NS * 6.2832; return [X(t), Math.sin(a) * HW(t), Math.cos(a) * HH(t)]; };
  const Nc = (fi, fj) => {
    const t = fi / NR, a = fj / NS * 6.2832, sa = Math.sin(a), ca = Math.cos(a), t0 = Math.max(0, t - 0.002), t1 = Math.min(1, t + 0.002);
    const dt = [-bl, sa * (HW(t1) - HW(t0)) / (t1 - t0), ca * (HH(t1) - HH(t0)) / (t1 - t0)], da = [0, ca * HW(t), -sa * HH(t)];
    let n = norm3(cross3(dt, da)); if (n[1] * sa + n[2] * ca < 0) n = n.map(x => -x); return n;
  };
  const softRegion = (r, v) => r === 'upper' ? sm(0.08, 0.22, v) : r === 'flank' ? sm(-0.47, -0.33, v) * (1 - sm(0.68, 0.82, v)) : r === 'lower' ? 1 - sm(-0.27, -0.13, v) : r === 'all' ? 1 : sm(-0.47, -0.33, v);
  const ringLen = bl / NR, ellP = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const spotCell = (p, pi, ci, cj) => {   // same placement rule as the patch grid always used
    if (ci < 0 || ci >= NR) return false; cj = ((cj % NS) + NS) % NS;
    const tc = (ci + 0.5) / NR, vc = upness(cj + 0.5);
    if (!inRegion(p.region, vc) || tc < (p.from ?? 0.06) || tc > (p.to ?? 1)) return false;
    const s = Math.max(1, Math.round(p.size || 1)), side = Math.min(cj, NS - 1 - cj);
    return hash2(Math.floor(ci / s), Math.floor(side / s) + (cj < NS / 2 ? 0 : 50), 31 + pi) < (p.density ?? 0.3);
  };
  const colorAt = (fi, fj) => {
    const t = fi / NR, v = upness(fj), sideC = Math.min(fj, NS - fj) - 0.5;
    let c = v >= 0 ? mix(C.flank, C.back, sm(0.1, 0.8, v)) : mix(C.flank, C.belly, sm(-0.05, -0.6, v));
    const r = clamp(ellP(HW(t), HH(t)) / NS / ringLen, 0.5, 2);
    pats.forEach((p, pi) => {
      let k = 0;
      if (p.type === 'spots') {
        for (let ci = Math.floor(fi) - 1; ci <= Math.floor(fi) + 1; ci++) for (let cj = Math.floor(fj) - 2; cj <= Math.floor(fj) + 2; cj++)
          if (spotCell(p, pi, ci, cj)) k = Math.max(k, 1 - sm(0.47, 0.67, Math.hypot(fi - ci - 0.5, (fj - cj - 0.5) * r)));
      } else {
        const from = p.from ?? 0.06, to = p.to ?? 1, w = softRegion(p.region, v) * sm(from - 0.015, from + 0.015, t) * (to >= 1 ? 1 : 1 - sm(to - 0.015, to + 0.015, t));
        if (w <= 0) return;
        if (p.type === 'bars') { const bw = p.width ?? 0.4, f = (t + (p.wavy || 0) * 0.04 * Math.sin(v * 9)) * (p.count || 6), dd = Math.abs(((f - bw / 2) % 1 + 1.5) % 1 - 0.5); k = bw >= 1 ? 1 : 1 - sm(bw / 2 - 0.06, bw / 2 + 0.06, dd); }
        else if (p.type === 'stripe') { const sw = p.width ?? 0.15; k = 1 - sm(sw - 0.05, sw + 0.05, Math.abs(v - (p.v ?? 0))); }
        else if (p.type === 'mottled') { const th0 = 0.3 - (p.amount ?? 0.4) * 0.6; k = sm(th0 - 0.05, th0 + 0.05, nPat(t * (p.scale || 6), sideC / NS * (p.scale || 6) * 0.7 + pi * 3)); }
        else if (p.type === 'lateral_line') k = 1 - sm(0.06, 0.1, Math.abs(v - (p.v ?? 0)));
        else if (p.type === 'spot') { const sz = p.size ?? 0.06; k = 1 - sm(sz * 0.75, sz * 1.1, Math.hypot(t - (p.at ?? 0.25), (v - (p.v ?? 0.3)) * 0.5)); }
        else if (p.type === 'scales') k = 0.5 * (0.5 + 0.5 * Math.sin(Math.PI * fi) * Math.sin(Math.PI * fj));
        k *= w;
      }
      if (k > 0) c = mix(c, p.rgb, k * p.alpha);
    });
    // darker lips trace the gape
    const lw = (1 - sm(ih - 0.5, ih, fi)) * (1 - sm(0.5, 1.1, Math.abs(Math.min(fj, NS - fj) - jb)));
    if (lw > 0) c = mix(c, [0.12, 0.1, 0.08], (0.35 + 0.25 * (1 - Math.min(fi, ih) / ih)) * lw);
    return c;
  };
  const GP = [], GN = [], GC = [], gk = (a, b) => a * (GJ + 1) + b;
  for (let a = 0; a <= GI; a++) for (let b = 0; b <= GJ; b++) { const fi = a / SUB, fj = b / SUB, k = gk(a, b); GP[k] = Vc(fi, fj); GN[k] = Nc(fi, fj); GC[k] = colorAt(fi, fj); }
  for (let a = 0; a < GI; a++) for (let b = 0; b < GJ; b++) {
    const i = Math.floor(a / SUB), j = Math.floor(b / SUB);
    M.mat = i < ihT && below(j) ? MT.JAW : MT.CLOTH;
    const q = [gk(a, b), gk(a, b + 1), gk(a + 1, b + 1), gk(a + 1, b)], T = (x, y, z) => M.triN(GP[x], GP[y], GP[z], GN[x], GN[y], GN[z], GC[x], GC[y], GC[z]);
    T(q[0], q[1], q[2]); T(q[0], q[2], q[3]);
  }
  M.mat = MT.CLOTH;
  // snout: cone to the lip tip (raised for a superior jaw, lowered for inferior); the lower half belongs to the jaw
  const jz = B.head.jaw === 'superior' ? 0.35 : B.head.jaw === 'inferior' ? -0.4 : 0, tip = [x0 + 0.015, 0, jz * HH(0) * 2];
  const tipN = norm3([1, 0, jz * 0.6]);
  for (let b = 0; b < GJ; b++) {
    const j = Math.floor(b / SUB), k0 = gk(0, b), k1 = gk(0, b + 1), tc = mix(C.back, C.belly, below(j) ? 0.75 : 0.1);
    M.mat = below(j) ? MT.JAW : MT.CLOTH;
    M.triN(GP[k0], GP[k1], tip, norm3(GN[k0].map((x, n) => x + tipN[n] * 0.6)), norm3(GN[k1].map((x, n) => x + tipN[n] * 0.6)), tipN, GC[k0], GC[k1], mix(tc, mix(GC[k0], GC[k1], 0.5), 0.5));
  }
  // inside of the mouth (hidden while closed): roof and throat stay put, the floor moves with the jaw
  const Cm = hexRGB(B.colors.mouth || '#5a1e1a'), edge = (i, sg) => { const t = i / NR; return [X(t), sg * Math.sin(ja) * HW(t) * 0.97, Math.cos(ja) * HH(t)]; };
  for (let i = 0; i < ih; i++) {
    const a0 = edge(i, 1), a1 = edge(i + 1, 1), b0 = edge(i, -1), b1 = edge(i + 1, -1), up = v => [v[0], v[1], v[2] + 0.002], dn = v => [v[0], v[1], v[2] - 0.002];
    M.mat = MT.CLOTH; M.quad(up(a0), up(a1), up(b1), up(b0), mix(Cm, [0, 0, 0], 0.25), [a0[0], 0, a0[2] + 1]);
    M.mat = MT.JAW; M.quad(dn(a0), dn(a1), dn(b1), dn(b0), Cm, [a0[0], 0, a0[2] - 1]);
  }
  // inner wall down the middle: flat while closed, stretched open with the jaw so you can't see through the mouth
  M.mat = 98;
  for (let i = 0; i < ih; i++) { const a = edge(i, 0), b = edge(i + 1, 0); M.quad([a[0], 0, a[2] + 0.002], [b[0], 0, b[2] + 0.002], [b[0], 0, b[2] - 0.004], [a[0], 0, a[2] - 0.004], mix(Cm, [0, 0, 0], 0.55), [a[0], 1, a[2]]); }
  M.mat = MT.CLOTH;
  { const e1 = edge(ih, 1), e2 = edge(ih, -1); M.tri(e1, e2, [hx, 0, hz - HH(th) * 0.6], mix(Cm, [0, 0, 0], 0.7), [hx - 1, 0, hz]); M.tri(e1, e2, [hx, 0, hz + HH(th) * 0.3], mix(Cm, [0, 0, 0], 0.7), [hx - 1, 0, hz]); }
  const hl = clamp(B.head.length, 0.1, 0.4) / bl;
  // eyes
  const te = hl * 0.42, er = 0.012 + 0.006 * (B.height / 0.2);
  if (lie) { M.blob([X(te), lie * HW(te) * 0.9, HH(te) * 0.42], er * 0.7, er, er * 0.8, 6, 12, C.eye); M.blob([X(te * 1.3), lie * HW(te * 1.3) * 0.95, HH(te * 1.3) * 0.02], er * 0.7, er, er * 0.8, 6, 12, C.eye); }   // both eyes on top
  else for (const s of [1, -1]) M.blob([X(te), s * HW(te) * 0.85, HH(te) * 0.35], er * 0.7, er * 0.6, er, 6, 12, C.eye);
  // fins are double-sided flat shapes in the fin colour
  M.mat = MT.GEN;
  const fin = C.fins, ctrSide = x => [x, 1, 0];
  const hr = HH(1), T = Math.max(B.height * 0.45, hr * 2.2) * (0.7 + tl * 2) * 0.75, xe = -0.5, fk = clamp(B.tail.fork ?? 0.25, 0, 0.7);
  let poly;
  if (B.tail.shape === 'square') poly = [[xe, T], [xe, 0], [xe, -T]];
  else if (B.tail.shape === 'heterocercal') poly = [[x1 - (x1 - xe) * 0.25, T * 0.75], [xe, T * 1.15], [x1 - (x1 - xe) * 0.7, T * 0.1], [x1 - (x1 - xe) * 0.55, -T * 0.55], [x1 - (x1 - xe) * 0.25, -T * 0.25]];   // sharks: long upper lobe
  else if (B.tail.shape === 'pointed') poly = [[x1 - (x1 - xe) * 0.35, T * 0.45], [xe, 0], [x1 - (x1 - xe) * 0.35, -T * 0.45]];   // eels: one fin round the tail
  else if (B.tail.shape === 'rounded') { poly = []; for (let k = 0; k <= 8; k++) { const a = -1.4 + k / 8 * 2.8; poly.push([x1 - (x1 - xe) * Math.cos(a * 0.9), T * 0.9 * Math.sin(a) / Math.sin(1.4)]); } }
  else { const f = B.tail.shape === 'emarginate' ? Math.min(fk, 0.2) : B.tail.shape === 'lunate' ? Math.max(fk, 0.45) : fk, sw = B.tail.shape === 'lunate' ? 0.15 : 0; poly = [[xe + sw * tl, T * (1 + sw)], [xe + f * (x1 - xe), 0], [xe + sw * tl, -T * (1 + sw)]]; }
  if (B.tail.shape === 'flukes') { // a whale's tail: two horizontal blades, swept back to pointed tips, notched in the middle
    const L = (x1 - xe) * 1.15, sp = 0.1 + 0.5 * tl, N = 8, fc = mix(C.back, C.flank, 0.3);   // half-span ~ 1/6 of the length; dark like the back
    M.blob([x1 - L * 0.06, 0, 0], L * 0.16, hr * 1.25, hr * 0.8, 6, 10, fc);   // the tail stock flattens into the flukes and closes the body's open end
    for (const sd of [1, -1]) {   // each blade: solid, broad at the root, swept back to a pointed tip, thinning toward it
      const tip = [x1 - L * 0.62, sd * sp, 0], root = [x1 + 0.005, sd * hr * 0.3, 0], d = tip.map((v, k) => v - root[k]), len = Math.hypot(...d), cw = Math.min(L * 0.3, len * 0.45);
      cetaceanBlade(M, root, d.map(v => v / len), len, u => cw * (1 - u) ** 0.7 * (0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, u + 0.3))) + len * 0.01, fc, false, 0.16);
    }
  } else {
  const tp = [[x1, hr], ...poly, [x1, -hr]];
  for (let k = 0; k < tp.length - 1; k++) M.tri([x1 + 0.01, 0, 0], [tp[k][0], 0, tp[k][1]], [tp[k + 1][0], 0, tp[k + 1][1]], fin, ctrSide(x1));
  }
  const finOn = (f, up, idx) => { // dorsal (up) or anal fin along the back/belly; spiny ones get a ragged edge
    const ta = clamp(f.at, 0, 0.95), tb = clamp(f.at + f.length / bl, 0, 1), sgn = up ? 1 : -1, h = f.height, n = Math.max(f.spiny ? 5 : 2, Math.ceil((tb - ta) * 24));   // enough pieces along a long fin (eels) to follow the body's swimming wave
    const base = t => [X(t), 0, sgn * HH(t) * 0.92];
    for (let k = 0; k < n; k++) {
      const u0 = k / n, u1 = (k + 1) / n, t0 = ta + (tb - ta) * u0, t1 = ta + (tb - ta) * u1;
      const hgt = u => h * (u < 0.25 ? 0.7 + u * 1.2 : 1 - (u - 0.25) * 0.75), top0 = [X(t0) - h * 0.15, 0, sgn * (HH(t0) * 0.92 + hgt(u0))], top1 = [X(t1) - h * 0.15, 0, sgn * (HH(t1) * 0.92 + hgt(u1) * (f.spiny ? 0.65 : 1))];
      M.quad(base(t0), top0, top1, base(t1), fin, ctrSide(X(t0)));
    }
  };
  if (B.swim === 'cetacean') (B.fins.dorsal || []).forEach(f => { const ta = clamp(f.at, 0, 0.95), tb = clamp(f.at + f.length / bl, 0, 1), tm = (ta + tb) / 2, h = f.height;   // a whale's dorsal: a solid hump on the back
    M.blob([X(tm) - h * 0.2, 0, HH(tm) * 0.9 + h * 0.3], Math.max((X(ta) - X(tb)) * 0.55, h * 0.6), Math.max(h * 0.32, HW(tm) * 0.12), h * 0.8, 5, 10, mix(C.back, C.flank, 0.2)); });
  else { (B.fins.dorsal || []).forEach((f, i) => finOn(f, true, i)); if (B.fins.anal) finOn(B.fins.anal, false, 0); }
  if (B.fins.adipose) { const ta = 0.86; M.blob([X(ta), 0, HH(ta) * 0.95 + 0.012], 0.025, 0.006, 0.014, 5, 10, fin); }
  for (const s of [1, -1]) {
    const tpc = hl * 1.05, pc = B.fins.pectoral, pv = clamp(0.5, 0, 1) * B.fins.pelvic;
    if (B.swim === 'cetacean') cetaceanFlipper(M, [X(tpc), s * HW(tpc) * 0.8, -HH(tpc) * 0.45], s, pc, mix(fin, C.back, 0.75), B.tail.shape === 'flukes' && pc > 0.2);
    else M.tri([X(tpc), s * HW(tpc) * 0.95, -HH(tpc) * 0.3], [X(tpc) - pc * 0.9, s * (HW(tpc) + pc * 0.55), -HH(tpc) * 0.55], [X(tpc) - pc * 0.4, s * HW(tpc) * 0.95, -HH(tpc) * 0.55], fin, [X(tpc), 0, 0]);
    M.tri([X(0.5), s * HW(0.5) * 0.6, -HH(0.5) * 0.85], [X(0.5) - pv * 1.1, s * (HW(0.5) * 0.6 + pv * 0.4), -HH(0.5) - pv * 0.5], [X(0.5) - pv * 0.5, s * HW(0.5) * 0.4, -HH(0.5) * 0.95], fin, [X(0.5), 0, 0]);
  }
  for (let k = 0; k < (B.barbels | 0); k++) { // whiskers fan out from around the mouth
    const s = k % 2 ? 1 : -1, r = (k >> 1), len = hl * bl * (r === 0 ? 0.9 : 0.45), a = 0.5 + r * 0.45, zz = tip[2] + (r % 2 ? -1 : 1) * HH(0.03) * 0.5;
    M.tube([x0 - 0.01, s * HW(0.04) * 0.7, zz], [x0 - len * 0.5, s * (HW(0.04) + len * Math.sin(a)), zz - len * 0.35], 0.004, 0.0015, 3, mix(C.back, [0.1, 0.1, 0.1], 0.4));
  }
  // jaw weights: 1 for the whole jaw in front of the hinge (it swings as one piece); behind it the throat fades out with
  // distance, and toward the mouth line, which stays shut behind the corner so the skin doesn't tear there.
  // Stored in the material channel as 13 + weight (the vertex shader reads it).
  const v = M.v, span0 = Math.PI - ja;
  for (let k = 0; k < v.length; k += VS) {
    if (v[k + 9] === 98) { const t = clamp((x0 - v[k]) / bl, 0, 1); v[k + 9] = v[k + 2] > Math.cos(ja) * HH(t) - 0.001 ? MT.CLOTH : MT.JAW + 0.98; continue; }
    if (v[k + 9] !== MT.JAW) continue;
    const x = v[k + 0], y = v[k + 1], z = v[k + 2], t = clamp((x0 - x) / bl, 0, 1);
    const phi = Math.atan2(Math.abs(y) / Math.max(HW(t), 1e-4), z / Math.max(HH(t), 1e-4)), b = hx - x;
    const w = b <= 0 ? 1 : (1 - sm(0, R, b)) * sm(0, span0 * 0.5, phi - ja);
    v[k + 9] = MT.JAW + w * 0.98;
  }
  // a bill: the body is squeezed back to make room, then a spear (marlin) or long toothy jaws (gar) out front
  const bill = clamp(B.head.bill || 0, 0, 0.45);
  if (bill > 0) {
    const k = 1 - bill; for (let i = 0; i < v.length; i += VS) v[i] = -0.5 + (v[i] + 0.5) * k;
    D._jaw[0] = -0.5 + (D._jaw[0] + 0.5) * k;
    const xb = -0.5 + (x0 + 0.5) * k, rb = Math.min(HH(0.02), HW(0.02)) * 0.75, dark = mix(C.back, [0.08, 0.08, 0.1], 0.35);
    if (B.head.bill_kind === 'beak') {   // upper and lower jaws; the lower one opens with the mouth
      const zm = Math.cos(ja) * HH(0.03); M.mat = MT.CLOTH;
      M.tube([xb - 0.01, 0, zm + rb * 0.45], [x0, 0, zm + rb * 0.12], rb * 0.85, 0.0025, 5, dark, true);
      M.mat = MT.JAW + 0.98; M.tube([xb - 0.01, 0, zm - rb * 0.45], [x0 - 0.008, 0, zm - rb * 0.1], rb * 0.75, 0.0025, 5, mix(C.belly, dark, 0.5), true);
    } else { M.mat = MT.CLOTH; M.tube([xb - 0.01, 0, HH(0.02) * 0.2], [x0, 0, HH(0.02) * 0.12], rb, 0.0015, 6, dark, true); }
    M.mat = MT.CLOTH;
  }
  if (lie) { // turn the flatfish onto its side: the eyed side faces up; no jaw swing (it opens sideways on a real one)
    for (let i = 0; i < v.length; i += VS) { const y = v[i + 1], z = v[i + 2], ny = v[i + 4], nz = v[i + 5]; v[i + 1] = -lie * z; v[i + 2] = lie * y; v[i + 4] = -lie * nz; v[i + 5] = lie * ny; }
    D._jaw = [D._jaw[0], 0, 0];
  }
  return new Float32Array(M.v);
}

