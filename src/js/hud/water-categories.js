'use strict';
// Menu categories by kind of water: which waters a boat or rig suits, and the filter chips.
// ---- categories: everything is sorted by the kind of water it suits; menus open on the water you're nearest ----
const WATER_CATS = [['lake', 'Lakes'], ['pond', 'Ponds'], ['river', 'Rivers'], ['creek', 'Creeks'], ['sea', 'Sea']];
const listedWaters = d => { const w = Array.isArray(d.waters) ? d.waters.filter(k => WATER_CATS.some(c => c[0] === k)) : []; return w.length ? w : null; };
// a definition may list its own "waters"; otherwise boats go by size, draft and the waves they take
function boatWaters(D) {
  const own = listedWaters(D); if (own) return own;
  const L = D.hull.length_m, dr = D.hull.draft_m, wv = D.handling.waves_max, out = [];
  if (wv >= 0.95) out.push('sea'); if (wv >= 0.4 && L <= 8) out.push('lake'); if (L <= 5 && dr <= 0.2) out.push('pond');
  if (L <= 7 && dr <= 0.25) out.push('river'); if (L <= 5 && dr <= 0.12) out.push('creek');
  return out;
}
// ... and rigs go where some catchable fish lives that likes what's on the hook and can get it in its mouth
const rigWaterMemo = new Map();
function rigWaters(r, S, fk = FishDB.list.map(stamp).join('.')) {   // fk: the fish list's key, passed in when checking many rigs
  const own = listedWaters(r); if (own) return own;
  const key = rigKey(r, S) + ':' + fk; if (rigWaterMemo.has(key)) return rigWaterMemo.get(key);
  const out = WATER_CATS.map(c => c[0]).filter(W => FishDB.list.some(D => {
    const h = D.habitat.waters[W] || 0; if (h < 0.4 || !fishCatchable(D)) return false;   // really lives there
    const Lc = D.size.length_cm.typical, kg = D.size.weight.a * Lc ** D.size.weight.b / 1000, ratio = S.strengthKg / Math.max(0.01, kg);
    if ((ratio > 15 && S.strengthKg > 6) || ratio > 60 || ratio < 0.25) return false;   // tackle far too heavy (light lines get leeway: panfish) or too light
    if (S.size_cm > Lc * (0.12 + 0.3 * D.body.head.mouth) * 1.2) return false;   // too big a mouthful
    const F = D.diet.food, mx = Math.max(...Object.values(F)) || 1; let m = 0;
    for (const [f, w] of Object.entries(S.food)) m = Math.max(m, w * (F[f] || 0) / mx);
    return m >= 0.4; }));
  rigWaterMemo.set(key, out); return out;
}
const WATER_ICONS = { all: 'infinity', lake: 'waves', pond: 'pond', river: 'river', creek: 'creek', sea: 'sea' };
const catChips = (cur, attr, icons) => [['all', 'All'], ...WATER_CATS].map(([k, l]) => `<button ${attr}="${k}" class="${k === cur ? 'on' : ''}">${icons ? uiIcon('ui.' + WATER_ICONS[k]) : ''}${l}</button>`).join('');
