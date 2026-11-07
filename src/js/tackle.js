'use strict';

// ======================================================================
//  TACKLE — rods, reels, lines, leaders, hooks, sinkers, floats, baits, lures, and the rigs made from them.
//  Every piece is a small JSON object ("schema": "embercrown-tackle/1", "type": "rod" | "reel" | ... | "rig"; see
//  tackle/README.md). Built-in gear lives in <script type="application/json" data-builtin="tackle"> blocks at the end of this
//  file; more can be dropped onto the game window (kept in this browser) or loaded with Game.loadTackle(urlOrObject).
// ======================================================================
const TACKLE_SCHEMA = 'embercrown-tackle/1';
const TACKLE_TYPES = ['rod', 'reel', 'line', 'leader', 'hook', 'sinker', 'float', 'bait', 'lure', 'rig'];
const RIG_SLOTS = ['rod', 'reel', 'line', 'leader', 'hook', 'sinker', 'float', 'bait', 'lure'];
const TACKLE_DEFAULTS = {
  rod: { length_m: 2.1, power: 'medium', action: 'fast', line_lb: { min: 6, max: 14 }, lure_g: { min: 5, max: 21 }, reel: 'spinning', handle: 'cork', guides: 7,
    colors: { blank: '#2a2f38', handle: '#c9a46a', wraps: '#b8322a' } },
  reel: { kind: 'spinning', max_drag_kg: 6, gear_ratio: 6.2, retrieve_cm: 80, capacity: { line_lb: 8, m: 200 }, colors: { body: '#3a3d44', spool: '#c8ccd2', handle: '#1d1f24' } },
  line: { material: 'mono', strength_lb: 10, diameter_mm: 0.3, stretch: 0.25, visibility: 0.5, colors: { line: '#dfe8e4' } },
  leader: { material: 'fluoro', strength_lb: 20, diameter_mm: 0.4, length_m: 0.9, visibility: 0.2, abrasion: 0.4, colors: { line: '#e6eef0' } },
  hook: { style: 'j', size: '#4', gap_mm: 9, strength_lb: 20, hold: 0.8, weight_g: 0.3 },
  sinker: { shape: 'split_shot', weight_g: 2, grip: 0.1 },
  float: { kind: 'fixed', buoyancy_g: 6, depth_m: 1, size_mm: 30, colors: { top: '#e8322a', bottom: '#f4f4f0' } },
  bait: { food: { worms: 1 }, size_cm: 8, scent: 0.5, wiggle: 0.5, lasts: 2, floats: false, shape: 'worm', weight_g: 3, colors: { body: '#8a4a4a', accent: '#5a2e30' } },
  lure: { style: 'spinner', imitates: { fish: 1 }, size_cm: 6, weight_g: 7, buoyant: false, sink_ms: 0.3, dive_m: 0, lift: 0.4, speed_ms: { min: 0.3, best: 0.6, max: 1.2 },
    action: 0.5, flash: 0.5, noise: 0.2, scent: 0, pause: 0.3, hooks: { kind: 'treble', count: 1, strength_lb: 15, hold: 0.75 },
    colors: { body: '#c0c0c0', back: '#506070', belly: '#f0f0f0', accent: '#e03a2a', blade: '#e8e8f0' } },
  rig: { parts: {}, float_depth_m: null, drag: 0.3, waters: null },   // waters: optional menu categories, e.g. ["lake", "pond"]
};
const TACKLE_ENUMS = {
  'rod.power': ['ultralight', 'light', 'medium_light', 'medium', 'medium_heavy', 'heavy', 'extra_heavy'], 'rod.action': ['slow', 'moderate', 'fast', 'extra_fast'],
  'rod.reel': ['spinning', 'casting', 'conventional'], 'rod.handle': ['cork', 'eva'], 'reel.kind': ['spinning', 'baitcaster', 'conventional'],
  'line.material': ['mono', 'braid', 'fluoro'], 'leader.material': ['mono', 'fluoro', 'wire'], 'hook.style': ['j', 'circle', 'treble'],
  'sinker.shape': ['split_shot', 'egg', 'pyramid', 'bank', 'bullet'], 'float.kind': ['fixed', 'slip'],
  'bait.shape': ['worm', 'cricket', 'minnow', 'shrimp', 'strip', 'kernel', 'dough'],
  'lure.style': ['spinner', 'crankbait', 'popper', 'soft_plastic', 'jig', 'spoon', 'skirt'], 'lure.hooks.kind': ['treble', 'single'],
};
// number fields: [lo, hi] usual range (outside it is a note, not an error)
const TACKLE_NUMS = {
  rod: { length_m: [1, 5], 'line_lb.min': [1, 200], 'line_lb.max': [1, 200], 'lure_g.min': [0.2, 1000], 'lure_g.max': [0.5, 1500], guides: [3, 15] },
  reel: { max_drag_kg: [0.5, 60], gear_ratio: [2, 10], retrieve_cm: [30, 160], 'capacity.line_lb': [1, 200], 'capacity.m': [30, 2000] },
  line: { strength_lb: [1, 200], diameter_mm: [0.05, 2], stretch: [0, 0.5], visibility: [0, 1] },
  leader: { strength_lb: [1, 400], diameter_mm: [0.05, 3], length_m: [0.1, 10], visibility: [0, 1], abrasion: [0, 1] },
  hook: { gap_mm: [2, 60], strength_lb: [2, 400], hold: [0, 1], weight_g: [0.01, 30] },
  sinker: { weight_g: [0.1, 1000], grip: [0, 1] },
  float: { buoyancy_g: [0.5, 200], depth_m: [0.1, 30], size_mm: [5, 150] },
  bait: { size_cm: [0.3, 60], scent: [0, 1], wiggle: [0, 1], lasts: [1, 20], weight_g: [0.05, 500] },
  lure: { size_cm: [1, 60], weight_g: [0.2, 1000], sink_ms: [0, 3], dive_m: [0, 15], lift: [0, 3], 'speed_ms.min': [0, 10], 'speed_ms.best': [0, 12], 'speed_ms.max': [0.05, 15],
    action: [0, 1], flash: [0, 1], noise: [0, 1], scent: [0, 1], pause: [0, 1], 'hooks.count': [1, 4], 'hooks.strength_lb': [2, 400], 'hooks.hold': [0, 1] },
  rig: { drag: [0.05, 1] },
};
const getPath = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
const foodMap = v => typeof v === 'string' ? { [v]: 1 } : v;   // "worms" or { "worms": 1, "crayfish": 0.5 }
function validateTackle(raw) {
  const errors = [], warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { def: null, errors: ['not a JSON object'], warnings };
  const T = raw.type;
  if (!TACKLE_TYPES.includes(T)) return { def: null, errors: [`type is required: ${TACKLE_TYPES.join(', ')}`], warnings };
  const base = Object.assign({ schema: TACKLE_SCHEMA, id: '', type: T, name: '', description: '' }, TACKLE_DEFAULTS[T]);
  for (const k of Object.keys(raw)) if (!(k in base) && !k.startsWith('_')) warnings.push(`unknown field "${k}" (ignored)`);
  const d = fishMerge(base, raw);
  if (T === 'bait' && raw.food !== undefined) d.food = foodMap(raw.food);
  if (T === 'lure' && raw.imitates !== undefined) d.imitates = foodMap(raw.imitates);
  if (T === 'rig' && raw.parts) d.parts = Object.assign({}, raw.parts);
  if (!raw.id || !/^[a-z0-9_\-]+$/.test(raw.id)) errors.push('id is required: lowercase letters, digits, _ or - (e.g. "my_spinner")');
  if (!raw.name) errors.push('name is required');
  if (raw.schema && raw.schema !== TACKLE_SCHEMA) warnings.push(`schema "${raw.schema}" — this engine reads "${TACKLE_SCHEMA}"`);
  for (const [p, [lo, hi]] of Object.entries(TACKLE_NUMS[T] || {})) {
    const v = getPath(d, p); if (v === null && p === 'float_depth_m') continue;
    if (typeof v !== 'number' || !isFinite(v)) errors.push(`${p} must be a number`); else if (v < lo || v > hi) warnings.push(`${p} = ${v} is outside the usual ${lo}..${hi}`);
  }
  for (const [p, list] of Object.entries(TACKLE_ENUMS)) { const [t, ...rest] = p.split('.'); if (t !== T) continue; const v = getPath(d, rest.join('.')); if (!list.includes(v)) errors.push(`${rest.join('.')}: one of ${list.join(', ')}`); }
  for (const [k, v] of Object.entries(d.colors || {})) if (v && !isHex(v)) errors.push(`colors.${k} must be a hex colour like "#c0c0c0"`);
  const foods = T === 'bait' ? d.food : T === 'lure' ? d.imitates : null;
  if (foods) { if (typeof foods !== 'object' || !Object.keys(foods).length) errors.push(`${T === 'bait' ? 'food' : 'imitates'}: a diet word or { "word": weight }`);
    else for (const k of Object.keys(foods)) if (!FISH_FOODS.includes(k)) warnings.push(`${T === 'bait' ? 'food' : 'imitates'}.${k}: not a diet word fish use (${FISH_FOODS.join(', ')})`); }
  if (T === 'rod' && d.line_lb.min > d.line_lb.max) errors.push('line_lb.min is more than line_lb.max');
  if (T === 'rod' && d.lure_g.min > d.lure_g.max) errors.push('lure_g.min is more than lure_g.max');
  if (T === 'lure' && !(d.speed_ms.min <= d.speed_ms.best && d.speed_ms.best <= d.speed_ms.max)) errors.push('speed_ms: min ≤ best ≤ max');
  if (T === 'lure' && d.buoyant && d.sink_ms > 0) warnings.push('a buoyant lure ignores sink_ms (it floats up when you stop)');
  if (T === 'rig') {
    if (!d.parts || typeof d.parts !== 'object') errors.push('parts: { "rod": id, "reel": id, "line": id, ... }');
    else {
      for (const [k, v] of Object.entries(d.parts)) { if (!RIG_SLOTS.includes(k)) warnings.push(`parts.${k}: not a rig slot (${RIG_SLOTS.join(', ')})`); else if (v != null && typeof v !== 'string') errors.push(`parts.${k}: the id of a ${k}`); }
      for (const k of ['rod', 'reel', 'line']) if (!d.parts[k]) errors.push(`parts.${k} is required`);
      if (!d.parts.lure && !(d.parts.hook && d.parts.bait)) errors.push('a rig needs a lure, or a hook with a bait');
      if (d.parts.lure && (d.parts.hook || d.parts.bait)) errors.push('pick a lure, or a hook with bait (not both)');
    }
    if (d.float_depth_m != null && !(typeof d.float_depth_m === 'number' && d.float_depth_m > 0)) errors.push('float_depth_m: metres below the float');
  }
  return { def: errors.length ? null : d, errors, warnings };
}
const TackleDB = {
  list: [], byId: {}, revision: 0,
  register(raw, { save = false, quiet = false } = {}) {
    const r = validateTackle(raw);
    if (!r.def) { if (!quiet) console.warn('Tackle rejected:', raw && raw.id, r.errors); return r; }
    const d = r.def, old = this.byId[d.id];
    if (old) this.list[this.list.indexOf(old)] = d; else this.list.push(d);
    this.byId[d.id] = d; this.revision++; if (save) { d._custom = true; const s = this.saved(); s[d.id] = raw; this.store(s); }
    if (r.warnings.length && !quiet) console.info(`Tackle "${d.id}" notes:`, r.warnings);
    return r;
  },
  saved() { try { return JSON.parse(localStorage.getItem('embercrown-tackle-defs') || '{}'); } catch (e) { return {}; } },
  store(s) { try { localStorage.setItem('embercrown-tackle-defs', JSON.stringify(s)); } catch (e) { /* storage unavailable */ } },
  forget(id) { const s = this.saved(); delete s[id]; this.store(s); },
  ofType(t) { return this.list.filter(d => d.type === t); },
  json(id) { const d = this.byId[id]; if (!d) return null; const o = {}; for (const k in d) if (!k.startsWith('_')) o[k] = d[k]; return JSON.stringify(o, null, 2); },
};
const LB = 0.4536;   // kg in a pound
// what a rig adds up to: how far it casts, its weakest link, drag, how it fishes. { errors, warnings, p: the parts, ... }
function rigStats(rig) {
  const errors = [], warnings = [], p = {};
  if (!rig || rig.type !== 'rig') return { errors: ['not a rig'], warnings, p };
  for (const s of RIG_SLOTS) { const id = rig.parts[s]; if (!id) continue; const g = TackleDB.byId[id]; if (!g) errors.push(`no ${s} called "${id}" in the tackle box`); else if (g.type !== s) errors.push(`"${id}" is a ${g.type}, not a ${s}`); else p[s] = g; }
  const { rod, reel, line, leader, hook, sinker, bait, lure } = p, fl = p.float;
  if (!rod || !reel || !line) { if (!errors.length) errors.push('a rig needs a rod, a reel and a line'); }
  else if (!lure && !(hook && bait)) errors.push('add a lure, or a hook with bait');
  else if (lure && (hook || bait)) errors.push('pick a lure, or a hook with bait (not both)');
  if (errors.length) return { errors, warnings, p };
  const fits = { spinning: ['spinning'], casting: ['baitcaster', 'conventional'], conventional: ['conventional', 'baitcaster'] }[rod.reel];
  if (!fits.includes(reel.kind)) warnings.push(`a ${reel.kind} reel on a ${rod.reel} rod sits wrong: shorter casts`);
  const lmax = rod.line_lb.max * (line.material === 'braid' ? 2 : 1);
  if (line.strength_lb < rod.line_lb.min) warnings.push(`${line.strength_lb} lb line is light for this rod (${rod.line_lb.min}–${rod.line_lb.max} lb): the rod can break it`);
  if (line.strength_lb > lmax) warnings.push(`${line.strength_lb} lb line is heavier than this rod is built for (${rod.line_lb.min}–${rod.line_lb.max} lb): the rod is the weak link`);
  if (line.strength_lb > reel.capacity.line_lb * 4 && line.material !== 'braid') warnings.push('thick line for this reel: not much fits on the spool');
  const castG = lure ? lure.weight_g : hook.weight_g + bait.weight_g + (sinker ? sinker.weight_g : 0) + (fl ? fl.buoyancy_g * 0.25 : 0);
  if (castG < rod.lure_g.min * 0.7) warnings.push(`only ${castG.toFixed(1)} g to throw: light for this rod (${rod.lure_g.min}–${rod.lure_g.max} g), it won't cast far`);
  if (castG > rod.lure_g.max * 1.3) warnings.push(`${castG.toFixed(0)} g is heavy for this rod (${rod.lure_g.min}–${rod.lure_g.max} g)`);
  if (fl && bait.floats && !sinker) warnings.push('a floating bait under a float just lies on the surface: add a split shot');
  if (fl && sinker && sinker.weight_g > fl.buoyancy_g) warnings.push(`the ${sinker.name.toLowerCase()} is heavier than the float holds (${fl.buoyancy_g} g): it sinks the float`);
  if (lure && lure.style === 'skirt') warnings.push('troll it: drive the boat at 2.5–6.5 m/s with the lure out');
  const mid = Math.sqrt(rod.lure_g.min * rod.lure_g.max), wfit = clamp(1 - 0.38 * Math.abs(Math.log(castG / mid)), 0.25, 1);
  const castMax = clamp((8 + 14 * rod.length_m) * wfit * clamp(1.15 - 0.6 * line.diameter_mm, 0.55, 1.1) * (fits.includes(reel.kind) ? 1 : 0.8)
    * (reel.kind === 'conventional' ? 0.75 : reel.kind === 'baitcaster' ? 0.95 : 1) * (fl ? 0.85 : 1) * (castG < 3 ? 0.55 + 0.45 * castG / 3 : 1), 3, 110);
  const links = [['line', line.strength_lb], ['rod', rod.line_lb.max * 2.2], leader && ['leader', leader.strength_lb], hook ? ['hook', hook.strength_lb] : ['hooks', lure.hooks.strength_lb]].filter(Boolean);
  const [weakest, wlb] = links.reduce((a, b) => b[1] < a[1] ? b : a);
  const strengthKg = wlb * LB, dragMaxKg = reel.max_drag_kg;
  const capM = Math.round(clamp(reel.capacity.m * (0.094 * Math.sqrt(reel.capacity.line_lb) / line.diameter_mm) ** 2, 20, 3000));
  const sens = clamp(0.25 + 0.45 * (1 - line.stretch * 3.2) + ({ slow: 0, moderate: 0.1, fast: 0.2, extra_fast: 0.3 }[rod.action]), 0, 1);
  const shock = 1 + 0.45 * (1 - clamp(line.stretch * 4, 0, 1)) * (leader && leader.material === 'mono' && leader.length_m > 2 ? 0.5 : 1);   // no-stretch lines pass every surge straight on
  const visibility = leader ? leader.visibility : line.visibility;
  const abrasion = leader ? leader.abrasion : { mono: 0.1, braid: 0.15, fluoro: 0.25 }[line.material];
  // what a fish has to fit in its mouth: a whole lure, but only the end of a worm or a strip of squid
  const food = lure ? lure.imitates : bait.food, size_cm = lure ? lure.size_cm : bait.size_cm * (bait.shape === 'worm' || bait.shape === 'strip' ? 0.35 : 1);
  const hookKind = lure ? lure.hooks.kind : hook.style, hold = lure ? lure.hooks.hold : hook.hold;
  const sinkW = (hook ? hook.weight_g : 0) + (bait ? bait.weight_g : 0) + (sinker ? sinker.weight_g : 0);
  const sinkMs = lure ? (lure.buoyant ? 0 : lure.sink_ms) : (bait.floats && !sinker ? 0 : clamp(0.06 + 0.02 * sinkW, 0.06, 1.2));
  const floatDepth = fl ? (rig.float_depth_m ?? fl.depth_m) : null;
  if (hook && hook.gap_mm > 15 && bait.size_cm < 3) warnings.push('a big hook for a small bait: small fish will steal it');
  return { errors, warnings, p, rod, reel, line, leader, hook, sinker, float: fl, bait, lure, castG, castMax, strengthKg, weakest, dragMaxKg, capM, sens, shock, visibility, abrasion,
    food, size_cm, hookKind, hold, sinkMs, sinkW, grip: sinker ? sinker.grip : 0, floatDepth, reelMs: reel.retrieve_cm / 100 * 1.5, rodLen: rod.length_m,
    dragKg: Math.min(dragMaxKg, rig.drag * strengthKg) };
}
function gearSummary(d) {
  const f = m => Object.entries(m).map(([k, v]) => v < 1 ? `${k} ${Math.round(v * 100)}%` : k).join(', ');
  switch (d.type) {
    case 'rod': return `${d.length_m.toFixed(2)} m · ${d.power.replace('_', '-')} ${d.action.replace('_', '-')} · ${d.line_lb.min}–${d.line_lb.max} lb · ${d.lure_g.min}–${d.lure_g.max} g`;
    case 'reel': return `${d.kind} · drag ${d.max_drag_kg} kg · ${d.capacity.m} m of ${d.capacity.line_lb} lb`;
    case 'line': case 'leader': return `${d.material} · ${d.strength_lb} lb · ${d.diameter_mm} mm${d.length_m ? ` · ${d.length_m} m` : ''} · ${d.visibility < 0.35 ? 'near invisible' : d.visibility > 0.7 ? 'visible' : 'low-vis'}`;
    case 'hook': return `${d.style === 'j' ? 'J' : d.style} ${d.size} · ${d.strength_lb} lb`;
    case 'sinker': return `${d.shape.replace('_', ' ')} · ${d.weight_g} g`;
    case 'float': return `${d.kind} · holds ${d.buoyancy_g} g · ${d.depth_m} m deep`;
    case 'bait': return `${f(d.food)} · ${d.size_cm} cm`;
    case 'lure': return `${d.style.replace('_', ' ')} · ${d.size_cm} cm ${d.weight_g} g · ${d.buoyant ? (d.dive_m ? `dives ${d.dive_m} m` : 'floats') : 'sinks'} · ${f(d.imitates)}`;
    case 'rig': { const S = rigStats(d); return S.errors.length ? '⚠ ' + S.errors[0] : `${S.lure ? S.lure.name : S.bait.name} · ${(S.strengthKg / LB).toFixed(0)} lb · casts ${S.castMax.toFixed(0)} m`; }
  }
  return '';
}
// can this animal be caught on hook and line? Mammals and turtles aren't fished for; shellfish don't bite.
const fishCatchable = D => !D._air && !D._herp && !['turtle', 'bivalve', 'snail', 'crab', 'lobster', 'shrimp'].includes(D.body.plan);
const baitThief = D => ['crab', 'lobster', 'shrimp', 'snail'].includes(D.body.plan);   // they pick a hook clean

// ---- tackle meshes (model units are metres; x points along the rod / the way the lure faces) ----
// the rod's bent shape in its own plane: points [x, z] from the butt to the tip
const ROD_BEND_STEPS = 32;
const rodBendLevel = bend => Math.round(clamp(bend, 0, 1) * (ROD_BEND_STEPS - 1));
function rodCurve(L, bend, n = 12, action = 'fast') {
  const h = 0.42, pts = [[-0.3, 0]]; let x = -0.3, z = 0, th = 0, s = 0; const ds = L / n;
  for (let i = 1; i <= n; i++) { s = i * ds; const u = clamp((s - h) / (L - h), 0, 1); th = -bend * 1.25 * u ** ({ slow: 0.75, moderate: 1.1, fast: 1.5, extra_fast: 2.1 }[action] || 1.5); x += Math.cos(th) * ds; z += Math.sin(th) * ds; pts.push([x, z]); }
  return pts;
}
// The same bend sample and tip-guide centre are used by the mesh and the line.
function rodLineAnchor(S, bend) {
  const pts = rodCurve(S.rodLen, rodBendLevel(bend) / (ROD_BEND_STEPS - 1), 12, S.rod.action);
  const a = pts[pts.length - 2], b = pts[pts.length - 1], dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz);
  const side = S.rod.reel === 'spinning' ? -1 : 1, offset = 0.022 * 0.4 + 0.006 + 0.01 * 0.3 + 0.0028;
  return [b[0] - dz / d * side * offset, b[1] + dx / d * side * offset];
}
function rodMesh(S, bend) {
  const B = meshBuilder(), R = S.rod, RL = S.reel, L = R.length_m, pts = rodCurve(L, bend, 12, R.action), n = pts.length - 1, top = R.reel !== 'spinning';
  const c = k => hexRGB(R.colors[k]), cr = k => hexRGB(RL.colors[k]), P3 = q => [q[0], 0, q[1]];
  const rad = i => 0.0125 * (1 - i / n) ** 0.9 + 0.0018 * (L > 3 ? 1.4 : 1);
  B.mat = MT.CLOTH; B.tube([-0.3, 0, 0], [-0.04, 0, 0], 0.016, 0.014, 7, c('handle'), true);          // rear grip
  B.tube([0.07, 0, 0], [0.24, 0, 0], 0.013, 0.012, 7, c('handle'), true);                           // fore grip
  B.mat = MT.METAL; B.tube([-0.05, 0, 0], [0.08, 0, 0], 0.011, 0.011, 7, [0.25, 0.26, 0.28], false);  // reel seat
  B.mat = MT.GEN;
  for (let i = 0; i < n; i++) B.tube(P3(pts[i]), P3(pts[i + 1]), rad(i), rad(i + 1), 6, c('blank'), i === n - 1);
  B.mat = MT.METAL; const ng = R.guides, sg = top ? 1 : -1;
  for (let g = 0; g < ng; g++) { // guides: rings on little feet, shrinking toward the tip
    const t = 0.18 + 0.82 * (g / (ng - 1)) ** 1.15, fi = t * n, i = Math.min(n - 1, fi | 0), u = fi - i, q = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], dl = Math.hypot(dx, dz), nx = -dz / dl * sg, nz = dx / dl * sg, hgt = 0.022 * (1 - 0.6 * t) + 0.006, rr = 0.01 * (1 - 0.7 * t) + 0.0028;
    B.tube([q[0], 0, q[1]], [q[0] + nx * hgt, 0, q[1] + nz * hgt], 0.0016, 0.0016, 4, [0.7, 0.72, 0.75], false);
    const cx = q[0] + nx * (hgt + rr), cz = q[1] + nz * (hgt + rr);
    for (let k = 0; k < 6; k++) { const a0 = k / 6 * 6.2832, a1 = (k + 1) / 6 * 6.2832; B.tube([cx + nx * Math.cos(a0) * rr, Math.sin(a0) * rr, cz + nz * Math.cos(a0) * rr], [cx + nx * Math.cos(a1) * rr, Math.sin(a1) * rr, cz + nz * Math.cos(a1) * rr], 0.0014, 0.0014, 3, [0.75, 0.77, 0.8], false); }
  }
  B.mat = MT.CLOTH; for (let g = 0; g < ng; g++) { const t = 0.18 + 0.82 * (g / (ng - 1)) ** 1.15, i = Math.min(n - 1, t * n | 0); B.tube(P3(pts[i]), P3(pts[i + 1 > n ? n : i + 1]).map((v, k) => P3(pts[i])[k] + (v - P3(pts[i])[k]) * 0.15), rad(i) * 1.25, rad(i) * 1.25, 6, c('wraps'), false); }
  // the reel's frame; its moving parts (handle, bail, line on the spool, drag) are drawn on their own
  // (reelPartMesh) so they can turn and change as you fish
  B.mat = MT.METAL;
  if (RL.kind === 'spinning') {
    B.tube([0.01, 0, 0], [0.01, 0, -0.07 * 1], 0.006, 0.006, 5, cr('body'), false);                // stem
    B.blob([0.0, 0, -0.085], 0.04, 0.026, 0.026, 5, 8, cr('body'));                                    // gearbox
    B.tube([0.035, 0, -0.085], [0.04, 0, -0.085], 0.031, 0.031, 12, cr('spool'), true);               // spool: back flange,
    B.tube([0.038, 0, -0.085], [0.074, 0, -0.085], 0.015, 0.015, 10, cr('spool'), false);             // arbor,
    B.tube([0.072, 0, -0.085], [0.076, 0, -0.085], 0.031, 0.031, 12, cr('spool'), true);              // front lip
    B.tube([0.0, 0.02, -0.085], [0.0, 0.03, -0.085], 0.009, 0.009, 6, cr('body'), true);              // handle boss
  } else if (RL.kind === 'baitcaster') {
    B.blob([0.0, -0.03, 0.032], 0.035, 0.009, 0.026, 4, 8, cr('body'));                                // side plates
    B.blob([0.0, 0.03, 0.032], 0.035, 0.009, 0.026, 4, 8, cr('body'));
    B.tube([0.0, -0.025, 0.032], [0.0, 0.025, 0.032], 0.006, 0.006, 8, cr('spool'), false);            // arbor
    B.tube([-0.03, -0.024, 0.016], [-0.03, 0.024, 0.016], 0.004, 0.004, 5, cr('body'), false);         // thumb bar rail
  } else { // conventional / lever drag: a drum across the rod
    B.tube([0.0, -0.05, 0.05], [0.0, -0.044, 0.05], 0.05, 0.05, 14, cr('body'), true);                 // side plates
    B.tube([0.0, 0.044, 0.05], [0.0, 0.05, 0.05], 0.05, 0.05, 14, cr('body'), true);
    B.tube([0.0, -0.044, 0.05], [0.0, 0.044, 0.05], 0.018, 0.018, 10, cr('spool'), false);              // arbor
    B.tube([-0.045, -0.044, 0.02], [-0.045, 0.044, 0.02], 0.005, 0.005, 5, cr('body'), false);          // pillars
    B.tube([0.045, -0.044, 0.02], [0.045, 0.044, 0.02], 0.005, 0.005, 5, cr('body'), false);
    B.tube([-0.02, 0, 0.0], [0.02, 0, 0.0], 0.012, 0.012, 6, cr('body'), false);
  }
  // the line from the spool up through the guides to the tip
  if (S.line) { B.mat = MT.CLOTH; const lc = hexRGB(S.line.colors.line), path = rodLinePath(S, bend); path.push([pts[n][0], 0, pts[n][1]]);
    for (let i = 0; i < path.length - 1; i++) B.tube(path[i], path[i + 1], 0.0011, 0.0011, 3, lc, false); }
  const tip = pts[n]; return { mesh: new Float32Array(B.v), tip: [tip[0] + sg * 0.004, tip[1]] };
}
// the line's path along the rod in rod-local metres: out of the reel, through every guide, to the tip (same guide
// placement as rodMesh), so the line can be drawn running up the blank
function rodLinePath(S, bend) {
  const R = S.rod, L = R.length_m, pts = rodCurve(L, bend, 12, R.action), n = pts.length - 1, sg = R.reel !== 'spinning' ? 1 : -1, ng = R.guides, out = [];
  const k = S.reel && S.reel.kind;
  out.push(k === 'baitcaster' ? [0.01, 0, 0.044] : k === 'conventional' ? [0.02, 0, 0.09] : [0.08, 0, -0.085]);   // where the line leaves the spool
  for (let g = 0; g < ng; g++) {
    const t = 0.18 + 0.82 * (g / (ng - 1)) ** 1.15, fi = t * n, i = Math.min(n - 1, fi | 0), u = fi - i, q = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], dl = Math.hypot(dx, dz), nx = -dz / dl * sg, nz = dx / dl * sg, hgt = 0.022 * (1 - 0.6 * t) + 0.006, rr = 0.01 * (1 - 0.7 * t) + 0.0028;
    out.push([q[0] + nx * (hgt + rr), 0, q[1] + nz * (hgt + rr)]);
  }
  return out;
}
// where the reel's moving parts sit on the rod (rod-local metres) and what turns them: the handle turns about its axle
// (across the rod), the spinning bail flips over the spool
const REEL_PARTS = {
  spinning: { handle: [0, 0.03, -0.085], bail: [0.06, 0, -0.085], reel: [0.03, 0, -0.085] },
  baitcaster: { handle: [0, 0.045, 0.032], free: [-0.03, 0, 0.016], reel: [0, 0, 0.032] },
  conventional: { handle: [0, 0.056, 0.05], free: [0.02, -0.056, 0.07], reel: [0, 0, 0.05] },
};
// a moving part of the reel, built around its pivot. part: handle | bail | free | line (q = how full, 0..1) | drag (q = setting 0..1)
function reelPartMesh(S, part, q = 0) {
  const B = meshBuilder(), RL = S.reel, k = REEL_PARTS[RL.kind] ? RL.kind : 'spinning', cr = c => hexRGB(RL.colors[c]), gold = [0.92, 0.72, 0.25], wire = [0.85, 0.87, 0.9];
  B.mat = MT.METAL;
  if (part === 'handle') {   // axle stub, arm across it, a knob sticking out sideways at the end (two on a baitcaster)
    const arm = k === 'conventional' ? 0.065 : k === 'baitcaster' ? 0.035 : 0.05, kn = k === 'conventional' ? 0.013 : 0.009;
    B.tube([0, 0, 0], [0, 0.01, 0], 0.005, 0.005, 6, cr('handle'), false);
    for (const sg of k === 'baitcaster' ? [1, -1] : [1]) { B.tube([0, 0.01, 0], [0, 0.01, sg * arm], 0.004, 0.004, 5, cr('handle'), false);
      B.mat = MT.CLOTH; B.blob([0, 0.022, sg * arm], kn, 0.013, kn, 4, 7, cr('handle')); B.mat = MT.METAL; }
  } else if (part === 'bail') {   // the wire hoop round the front of the spool (closed: hanging below it)
    const r = 0.034, n = 10; for (let i = 0; i < n; i++) { const a0 = Math.PI + i / n * Math.PI, a1 = Math.PI + (i + 1) / n * Math.PI;
      B.tube([0, Math.cos(a0) * r, Math.sin(a0) * r], [0, Math.cos(a1) * r, Math.sin(a1) * r], 0.0022, 0.0022, 4, wire, false); }
    B.tube([-0.025, -r, 0], [0, -r, 0], 0.0025, 0.0025, 4, wire, false); B.tube([-0.025, r, 0], [0, r, 0], 0.0025, 0.0025, 4, wire, false);
    B.blob([0, r, 0], 0.005, 0.005, 0.005, 3, 6, gold);   // line roller
  } else if (part === 'free') {   // baitcaster thumb bar / conventional free-spool lever (pressed / flipped by the pitch it's drawn at)
    if (k === 'baitcaster') B.tube([0, -0.022, 0], [0, 0.022, 0], 0.006, 0.006, 6, [0.9, 0.86, 0.78], true);
    else { B.tube([0, 0, 0], [-0.03, 0, 0.012], 0.004, 0.004, 5, wire, false); B.blob([-0.03, 0, 0.012], 0.006, 0.006, 0.006, 3, 6, [0.2, 0.2, 0.22]); }
  } else if (part === 'line') {   // the line on the spool: thicker the fuller it is
    const lc = S.line.material === 'braid' ? [0.37, 0.54, 0.35] : S.line.material === 'fluoro' ? [0.8, 0.88, 0.9] : [0.92, 0.89, 0.78];
    B.mat = MT.CLOTH;
    if (k === 'spinning') B.tube([0.04, 0, -0.085], [0.072, 0, -0.085], 0.016 + 0.013 * q, 0.016 + 0.013 * q, 12, lc, false);
    else if (k === 'baitcaster') B.tube([0, -0.024, 0.032], [0, 0.024, 0.032], 0.007 + 0.011 * q, 0.007 + 0.011 * q, 10, lc, false);
    else B.tube([0, -0.043, 0.05], [0, 0.043, 0.05], 0.019 + 0.027 * q, 0.019 + 0.027 * q, 12, lc, false);
  } else if (part === 'drag') {   // the drag: front knob with a pointer (spinning), star wheel (baitcaster), red lever (conventional)
    const a = -2.4 + 4.8 * q;
    if (k === 'spinning') { B.tube([0.076, 0, -0.085], [0.086, 0, -0.085], 0.012, 0.011, 8, cr('body'), true);
      B.tube([0.087, 0, -0.085], [0.087, Math.sin(a) * 0.011, -0.085 + Math.cos(a) * 0.011], 0.0022, 0.0022, 3, gold, false); }
    else if (k === 'baitcaster') { const c = [0, 0.04, 0.032]; for (let i = 0; i < 5; i++) { const b = a + i * 1.2566; B.tube(c, [c[0] + Math.cos(b) * 0.02, c[1], c[2] + Math.sin(b) * 0.02], 0.004, 0.002, 4, wire, false); } }
    else { const c = [0, 0.053, 0.05]; B.tube(c, [c[0] + Math.cos(a * 0.5 + 1.2) * 0.04, c[1], c[2] + Math.sin(a * 0.5 + 1.2) * 0.04], 0.004, 0.004, 5, [0.85, 0.2, 0.18], false); }
  }
  return new Float32Array(B.v);
}
// treble or single hook, hanging from (x, 0, z), size in metres
function hookShape(B, x, z, sz, kind) {
  const mc = [0.62, 0.64, 0.68]; B.mat = MT.METAL;
  const one = (a) => { const ca = Math.cos(a), sa = Math.sin(a), p = (u, w) => [x + u * sz * 0.25, w * sz * ca, z + w * sz * sa - u * sz];
    B.tube(p(0, 0), p(0.6, 0.1), sz * 0.05, sz * 0.05, 3, mc, false); B.tube(p(0.6, 0.1), p(1, 0.5), sz * 0.05, sz * 0.05, 3, mc, false); B.tube(p(1, 0.5), p(0.5, 0.8), sz * 0.05, sz * 0.03, 3, mc, false); };
  B.tube([x, 0, z + sz * 0.25], [x, 0, z], sz * 0.05, sz * 0.05, 3, mc, false);
  if (kind === 'treble') for (let k = 0; k < 3; k++) one(k * 2.094 + 1.57); else one(1.57);
}
function lureMesh(d) {
  const B = meshBuilder(true), C = k => hexRGB(d.colors[k]), Lm = d.size_cm / 100, st = d.style;
  if (st === 'spinner') {
    B.mat = MT.METAL; B.tube([-Lm * 0.5, 0, 0], [Lm * 0.5, 0, 0], Lm * 0.012, Lm * 0.012, 4, [0.7, 0.7, 0.72], false);
    B.blob([-Lm * 0.05, 0, 0], Lm * 0.2, Lm * 0.08, Lm * 0.08, 5, 8, C('body'));
    B.blob([Lm * 0.15, 0, 0], Lm * 0.05, Lm * 0.05, Lm * 0.05, 4, 6, C('accent'));
    B.blob([Lm * 0.05, Lm * 0.09, 0], Lm * 0.2, Lm * 0.11, Lm * 0.015, 5, 8, C('blade'));   // the blade, flashing out to the side
    hookShape(B, -Lm * 0.45, 0, Lm * 0.28, 'treble');
  } else if (st === 'crankbait' || st === 'popper') {
    const segs = 10, cb = C('back'), cv = C('body'), cl = C('belly');
    B.mat = MT.GEN; const rx = Lm * 0.5, ry = Lm * 0.12, rz = Lm * (st === 'popper' ? 0.15 : 0.16);
    for (let i = 0; i < 8; i++) for (let j = 0; j < segs; j++) { // body of revolution along x
      const V = (ii, jj) => { const t = ii / 8, xx = (t - 0.5) * 2 * rx, r = Math.sin(t * Math.PI) ** (st === 'popper' ? 0.45 : 0.6) * (1 - (st === 'popper' ? 0 : 0.15 * t)), a = jj / segs * 6.2832; return [xx, Math.cos(a) * ry * r, Math.sin(a) * rz * r]; };
      const col = (jj) => { const s = Math.sin(jj / segs * 6.2832); return s > 0.45 ? cb : s < -0.45 ? cl : cv; };
      const p00 = V(i, j), p01 = V(i, j + 1), p11 = V(i + 1, j + 1), p10 = V(i + 1, j), cc = col(j + 0.5);
      B.quad(p00, p01, p11, p10, cc, [p00[0], 0, 0]);
    }
    B.blob([rx * 0.72, ry * 0.75, rz * 0.25], Lm * 0.035, Lm * 0.02, Lm * 0.035, 3, 6, [0.95, 0.85, 0.2]); B.blob([rx * 0.72, -ry * 0.75, rz * 0.25], Lm * 0.035, Lm * 0.02, Lm * 0.035, 3, 6, [0.95, 0.85, 0.2]);
    if (st === 'crankbait') { B.mat = MT.GLASS; B.quad([rx * 0.92, -ry * 0.7, -rz * 0.1], [rx * 0.92, ry * 0.7, -rz * 0.1], [rx * 1.35, ry * 0.8, -rz * 0.9], [rx * 1.35, -ry * 0.8, -rz * 0.9], [0.85, 0.9, 0.92], [rx, 0, 0]); }
    else { B.mat = MT.GEN; B.blob([rx * 0.98, 0, 0], Lm * 0.02, ry * 0.8, rz * 0.8, 3, 8, C('accent')); }
    hookShape(B, -rx * 0.2, -rz * 0.9, Lm * 0.22, 'treble'); hookShape(B, -rx * 0.95, 0, Lm * 0.22, 'treble');
  } else if (st === 'soft_plastic') {
    B.mat = MT.GEN; const n = 10; let prev = null;
    for (let i = 0; i <= n; i++) { const t = i / n, x = (0.5 - t) * Lm, y = Math.sin(t * 7) * Lm * 0.05 * t, r = Lm * 0.035 * (1 - 0.75 * t ** 2); const q = [x, y, 0]; if (prev) B.tube(prev[0], q, prev[1], r, 6, i < 2 ? C('accent') : C('body'), i === n); prev = [q, r]; }
    hookShape(B, Lm * 0.3, Lm * 0.03, Lm * 0.16, 'single');
  } else if (st === 'jig' || st === 'skirt') {
    const hd = st === 'jig' ? Lm * 0.14 : Lm * 0.12;
    B.mat = st === 'jig' ? MT.METAL : MT.GLASS; B.blob([Lm * 0.36, 0, 0], hd * (st === 'skirt' ? 1.5 : 1), hd, hd, 5, 8, st === 'jig' ? C('accent') : C('back'));
    B.blob([Lm * 0.36 + hd * 0.4, hd * 0.7, hd * 0.3], hd * 0.22, hd * 0.12, hd * 0.22, 3, 5, [0.95, 0.9, 0.2]); B.blob([Lm * 0.36 + hd * 0.4, -hd * 0.7, hd * 0.3], hd * 0.22, hd * 0.12, hd * 0.22, 3, 5, [0.95, 0.9, 0.2]);
    B.mat = MT.CLOTH; const ns = st === 'jig' ? 14 : 12;
    for (let k = 0; k < ns; k++) { const a = k / ns * 6.2832, r = hd * 0.8, L2 = Lm * (0.62 + 0.12 * Math.sin(k * 2.3)), col = st === 'skirt' && k % 3 === 1 ? C('accent') : st === 'skirt' && k % 3 === 2 ? C('belly') : C('body');
      B.tube([Lm * 0.3, Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7], [Lm * 0.3 - L2, Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6], Lm * 0.012, Lm * 0.004, 3, col, false); }
    hookShape(B, -Lm * 0.2, 0, Lm * (st === 'jig' ? 0.3 : 0.18), 'single');
  } else { // spoon: a curved, polished slab
    B.mat = MT.METAL; const n = 7, m = 5, cc = C('body'), ca = C('accent');
    const V = (i, j) => { const t = i / n, u = j / m - 0.5, w = Math.sin(t * Math.PI) ** 0.7 * (0.55 + 0.45 * t), x = (t - 0.5) * Lm, y = u * Lm * 0.36 * w; return [x, y, -(Math.abs(u) ** 2) * Lm * 0.25 * w + Lm * 0.03]; };
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = V(i, j), b = V(i, j + 1), c2 = V(i + 1, j + 1), e = V(i + 1, j); B.quad(a, b, c2, e, i === 0 && j % 2 ? ca : cc, [a[0], 0, Lm]); B.quad(a, e, c2, b, cc, [a[0], 0, -Lm]); }
    hookShape(B, -Lm * 0.5, 0, Lm * 0.3, 'treble');
  }
  return new Float32Array(B.v);
}
function baitMesh(S) {
  const B = meshBuilder(true), d = S.bait, h = S.hook, C = k => hexRGB(d.colors[k]), Lm = d.size_cm / 100, hs = clamp(h.gap_mm / 1000 * 1.6, 0.008, 0.05);
  hookShape(B, 0, 0, hs, h.style === 'treble' ? 'treble' : 'single'); B.mat = MT.GEN;
  if (d.shape === 'worm') { let prev = null; for (let i = 0; i <= 10; i++) { const t = i / 10, q = [Math.sin(t * 5) * Lm * 0.12, Math.cos(t * 4) * Lm * 0.1, -t * Lm * 0.7 + Lm * 0.1], r = Lm * 0.04 * (0.6 + 0.4 * Math.sin(t * 3.1)); if (prev) B.tube(prev[0], q, prev[1], r, 6, i === 3 ? C('accent') : C('body'), i === 10); prev = [q, r]; } }
  else if (d.shape === 'cricket') { B.blob([0, 0, -hs * 0.5], Lm * 0.5, Lm * 0.2, Lm * 0.2, 4, 6, C('body')); for (const s of [-1, 1]) B.tube([-Lm * 0.1, s * Lm * 0.15, -hs * 0.5], [-Lm * 0.45, s * Lm * 0.3, -hs * 0.5 + Lm * 0.3], Lm * 0.04, Lm * 0.02, 3, C('accent'), false); }
  else if (d.shape === 'minnow' || d.shape === 'strip') { const fl = d.shape === 'strip'; B.blob([-Lm * 0.3, 0, -hs * 0.3], Lm * 0.5, fl ? Lm * 0.14 : Lm * 0.08, fl ? Lm * 0.02 : Lm * 0.11, 5, 8, (i) => i < 2 ? C('accent') : C('body')); if (!fl) B.quad([-Lm * 0.75, 0, -hs * 0.3], [-Lm * 0.95, 0, -hs * 0.3 + Lm * 0.12], [-Lm * 0.95, 0, -hs * 0.3 - Lm * 0.12], [-Lm * 0.75, 0, -hs * 0.3], C('accent'), [-Lm, 0.01, 0]); }
  else if (d.shape === 'shrimp') { let prev = null; for (let i = 0; i <= 7; i++) { const a = i / 7 * 2.6, q = [Math.cos(a) * Lm * 0.3, 0, -Math.sin(a) * Lm * 0.3 - hs * 0.2], r = Lm * 0.09 * (1 - 0.6 * i / 7); if (prev) B.tube(prev[0], q, prev[1], r, 6, i > 5 ? C('accent') : C('body'), i === 7); prev = [q, r]; } }
  else for (let k = 0; k < 3; k++) B.blob([0, (k - 1) * Lm * 0.6, -hs * 0.4 - k * 0.002], Lm * 0.5, Lm * 0.45, Lm * 0.4, 3, 6, C('body'));
  return new Float32Array(B.v);
}
function floatMesh(d) {
  const B = meshBuilder(true), r = d.size_mm / 2000, top = hexRGB(d.colors.top), bot = hexRGB(d.colors.bottom); B.mat = MT.GEN;
  if (d.kind === 'fixed') B.blob([0, 0, 0], r, r, r, 6, 10, i => i < 3 ? top : bot);
  else { B.blob([0, 0, -r * 1.6], r, r, r * 3.2, 7, 10, i => i < 2 ? top : bot); B.tube([0, 0, 0], [0, 0, r * 3.5], r * 0.25, r * 0.2, 5, top, true); }
  B.mat = MT.METAL; B.tube([0, 0, d.kind === 'fixed' ? r : r * 3.5], [0, 0, (d.kind === 'fixed' ? r : r * 3.5) + 0.006], 0.0015, 0.0015, 3, [0.7, 0.7, 0.7], false);
  return new Float32Array(B.v);
}
function sinkerMesh(d) { const B = meshBuilder(true), r = clamp(Math.cbrt(d.weight_g / 11.3 / 4.19) / 100, 0.002, 0.04); B.mat = MT.METAL;
  if (d.shape === 'pyramid') { const a = [0, 0, r * 1.2], c = [[r, r, -r], [-r, r, -r], [-r, -r, -r], [r, -r, -r]].map(q => q.map(v => v * 1.1)), g = [0.45, 0.46, 0.48]; for (let k = 0; k < 4; k++) B.tri(a, c[k], c[(k + 1) % 4], g, [0, 0, 0]); B.quad(...c, g, [0, 0, 0]); }
  else B.blob([0, 0, 0], d.shape === 'egg' ? r * 0.8 : r, d.shape === 'egg' ? r * 0.8 : r, d.shape === 'egg' ? r * 1.3 : r, 5, 7, [0.42, 0.43, 0.46]);
  return new Float32Array(B.v); }

