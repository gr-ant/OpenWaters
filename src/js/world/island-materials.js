'use strict';
// Ground materials (MATS, recoloured by the climate) and material(): which one a point of terrain gets.
// Materials: chars ordered dark -> bright
const DEEP = 0, SHALLOW = 1, SAND = 2, PLAIN = 3, FOREST = 4, ROCK = 5, ALPINE = 6, SNOW = 7, GLACIER = 8, BRIDGE = 9;
const MATS = [
  { ch: '.,~~', col: [0.05, 0.16, 0.45], map: '~' },
  { ch: '.~~=', col: [0.10, 0.42, 0.62], map: '~' },
  { ch: '.:;;', col: [0.86, 0.78, 0.50], map: '.' },
  { ch: '.,"i', col: [0.45, 0.70, 0.25], map: '"' },
  { ch: '.,;"', col: [0.16, 0.42, 0.16], map: 'T' },
  { ch: '.nM#', col: [0.52, 0.47, 0.42], map: 'n' },
  { ch: '.,;"', col: [0.26, 0.42, 0.32], map: '^' },
  { ch: '.-^A', col: [0.95, 0.95, 1.00], map: 'A' },
  { ch: ':=^A', col: [0.70, 0.86, 1.00], map: 'A' },
  { ch: '=##', col: [0.60, 0.38, 0.20], map: '#' },
];
if (CLIMATE.mats) for (const k in CLIMATE.mats) MATS[k].col = CLIMATE.mats[k];   // the climate recolours the land
function material(e, m, x, y) {
  if (e >= WL) { const s = stackS(x, y); if (s > 0.02) return s > 0.97 ? PLAIN : ROCK; }   // sea stacks: rock faces, grass on top
  if (e >= WL && inGrid(x, y) && cenoteAt(x, y)) { const r = cenoteRamp(x, y); if (!r || r.b > r.c.rw) return ROCK; }   // cenote walls and their rocky lip (not the ramp's floor)
  if (e >= WL && glacierAt(x, y) > 0.3) return GLACIER;
  if (e < 0.2) return DEEP;
  if (e < WL) return SHALLOW;
  if (e < 0.6) return e < 0.32 ? SAND : m < 0.18 ? SAND : m < 0.52 ? PLAIN : FOREST;
  if (e < 0.85) return m < 0.5 ? ROCK : ALPINE;
  return m < 0.5 ? SNOW : GLACIER;
}
