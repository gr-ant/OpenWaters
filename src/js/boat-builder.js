'use strict';
// ======================================================================
//  BOAT BUILDER — a boat from parts, the way a rig is tied from tackle. A short definition names a size, a build and what's
//  fitted; buildBoat() turns it into the full boat definition (hull, propulsion, handling, seats, features) that boats.js meshes:
//    { "schema": "embercrown-boat/2", "id": "skiff", "name": "Skiff", "size": "small", "build": "skiff",
//      "engines": ["small"], "hull": ["seat"], "deck": ["rod_holders"], "colors": { "hull": "#5a6a4a" } }
//  The parts are data too: src/boats/parts.json (sizes, builds, engines, hull items, deck items). A size gives so many engine,
//  hull and deck spots; every part fitted takes some. No engines: it's paddled or rowed, whichever the build says.
//  BoatDB.register() accepts either kind, so Game.loadBoat(def) and the built-in list take short definitions as they are.
// ======================================================================
const BOAT_SCHEMA2 = 'embercrown-boat/2';
let BOAT_PARTS = null;   // parts.json, set at boot (boot.js) before the boats are registered
const isShortBoat = raw => !!raw && typeof raw === 'object' && (raw.schema === BOAT_SCHEMA2 || (typeof raw.size === 'string' && typeof raw.build === 'string'));
// Returns { def (a full embercrown-boat/1 definition, or null), errors, warnings }.
function buildBoat(raw, parts = BOAT_PARTS) {
  const errors = [], warnings = [], fail = () => ({ def: null, errors, warnings });
  if (!parts) { errors.push('boat parts are not loaded'); return fail(); }
  for (const k of Object.keys(raw)) if (!['schema', 'id', 'name', 'description', 'waters', 'size', 'build', 'engines', 'hull', 'deck', 'colors'].includes(k) && !k.startsWith('_')) warnings.push(`unknown field "${k}" (ignored)`);
  const Z = parts.sizes[raw.size], B = parts.builds[raw.build];
  if (!Z) errors.push(`size: one of ${Object.keys(parts.sizes).join(', ')}`);
  if (!B) errors.push(`build: one of ${Object.keys(parts.builds).join(', ')}`);
  if (errors.length) return fail();
  if (!B.sizes.includes(raw.size)) errors.push(`a ${raw.build} can't be ${raw.size}: ${B.sizes.join(' or ')}`);
  // what's fitted, and whether it fits the spots this size has
  const fitted = (list, table, kind) => { const out = []; if (list !== undefined && !Array.isArray(list)) { errors.push(`${kind}: a list of part names`); return out; }
    for (const id of list || []) { const p = table[id]; if (!p) errors.push(`${kind}: no part called "${id}" (${Object.keys(table).join(', ')})`); else if (p.sizes && !p.sizes.includes(raw.size)) errors.push(`${kind}: a ${id} doesn't go on a ${raw.size} boat`); else out.push(Object.assign({ id }, p)); }
    return out; };
  const engines = fitted(raw.engines, parts.engines, 'engines'), items = fitted(raw.hull, parts.hull_items, 'hull'), gear = fitted(raw.deck, parts.deck_items, 'deck'), used = l => l.reduce((a, p) => a + (p.spots || 1), 0);
  for (const [kind, list, label] of [['engine', engines, 'engines'], ['hull', items, 'hull'], ['deck', gear, 'deck']]) if (used(list) > Z.spots[kind]) errors.push(`${label}: ${used(list)} spots used, a ${raw.size} boat has ${Z.spots[kind]}`);
  if (new Set(gear.map(p => p.id)).size < gear.length) errors.push('deck: each deck item once');
  if (errors.length) return fail();
  const has = id => gear.some(p => p.id === id), console_ = has('console'), cabin = has('cabin');
  if (console_ && cabin) { errors.push('deck: a console or a wheelhouse, not both'); return fail(); }
  // hull: the size's dimensions (a build may stretch or narrow them) in the build's shape
  const hull = Object.assign({}, Z.hull, B.hull); hull.length_m = +(Z.hull.length_m * (B.length || 1)).toFixed(2); hull.beam_m = +(Z.hull.beam_m * (B.beam || 1)).toFixed(2);
  // propulsion: power and control add up from the engines (control is their average: small engines steer best)
  const power = engines.reduce((a, e) => a + e.power, 0), control = engines.length ? engines.reduce((a, e) => a + e.control, 0) / engines.length : 3, hand = { paddle: [1.8, 0.6, 0.85, 0.08], double_paddle: [2.3, 0.8, 1.0, 0.06], oars: [1.6, 0.5, 0.7, 0.1] }[B.by_hand] || [1.6, 0.5, 0.7, 0.1];
  const propulsion = power ? { type: 'outboard', max_speed_ms: +(3 + 6 * power / Math.sqrt(Z.mass)).toFixed(1), accel_ms2: +(1 + 3 * power / Z.mass).toFixed(1), turn_rate: +(Z.turn * (0.6 + 0.15 * control)).toFixed(2), reverse: 0.3, noise: +Math.min(1, 0.45 + 0.15 * power).toFixed(2) }
    : { type: B.by_hand, max_speed_ms: +(hand[0] / Z.mass ** 0.25).toFixed(1), accel_ms2: +(hand[1] / Z.mass ** 0.5).toFixed(2), turn_rate: +(hand[2] * Z.turn).toFixed(2), reverse: 0.6, noise: hand[3] };
  // the helm: a tiller seat aft, or behind a console, or in the wheelhouse; then the hull items in the clear places along the floor
  const Hm = Z.helm || {}, features = { paddle: power ? '' : { paddle: 'single', double_paddle: 'double', oars: 'oars' }[B.by_hand] || '' }, seats = [];
  let crew = { seat_at: B.helm_at ?? 0.12, eye_height_m: Hm.eye_height_m ?? 1.05 };
  if (console_) { features.console = { at: 0.48, height: Hm.console_height ?? 0.9 }; crew = { seat_at: 0.36, eye_height_m: Hm.eye_height_m ?? 1.3 }; seats.push({ type: 'bench', at: 0.34, height: Hm.seat_height ?? 0.5 }); }
  else if (cabin) { features.cabin = { from: 0.45, to: 0.78, height: Hm.cabin_height ?? 1.8 }; crew = { seat_at: 0.5, eye_height_m: Math.max(1.6, Hm.eye_height_m ?? 1.6) }; }
  else seats.push(Object.assign({ type: B.helm_seat || 'bench', at: crew.seat_at }, B.helm_seat === 'bench' || !B.helm_seat ? { height: 0.3 } : {}));
  const casting = has('casting_deck'), places = cabin ? [0.2, 0.32, 0.88] : console_ ? (casting ? [0.16, 0.6, 0.26] : [0.16, 0.68, 0.84]) : casting ? [0.32, 0.46, 0.6] : [0.45, 0.65, 0.82];
  let n = 0; for (const it of items) for (let k = 0; k < (it.spots || 1); k++) if (it.seat) seats.push(Object.assign({ at: places[n++ % places.length] }, it.seat));
  for (const g of gear) Object.assign(features, g.features);
  if (engines.length) { features.motors = engines.map(e => ({ hp: e.hp, color: e.color })); features.motor = { hp: engines.reduce((a, e) => a + e.hp, 0), color: engines[0].color }; }
  const def = { schema: 'embercrown-boat/1', id: raw.id, name: raw.name, description: raw.description || `${Z.name} ${B.name.toLowerCase()}${engines.length ? ', ' + engines.map(e => e.name.toLowerCase()).join(' + ') : ''}`,
    hull, colors: Object.assign({}, B.colors, raw.colors), propulsion, handling: Object.assign({}, Z.handling), crew, seats, features,
    _parts: { size: raw.size, build: raw.build, engines: engines.map(e => e.id), hull: items.map(p => p.id), deck: gear.map(p => p.id), power, control: +control.toFixed(2) } };
  if (raw.waters) def.waters = raw.waters;
  return { def, errors, warnings };
}
