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
const fishCatchable = D => !D._air && !D._herp && !['turtle', 'bivalve', 'snail', 'crab', 'lobster', 'shrimp', 'jelly'].includes(D.body.plan);
const baitThief = D => ['crab', 'lobster', 'shrimp', 'snail'].includes(D.body.plan);   // they pick a hook clean
