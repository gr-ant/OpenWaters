'use strict';
// Engine: inventory slots and stacks, and the save game in localStorage (keyed by CONFIG.saveName and SEED).
Object.assign(Engine, {
  // ---- inventory: slots = Game.level x CONFIG.inventorySlotsPerLevel; stacks of CONFIG.stackSize (or the item's own) ----
  invCap() { return Game.level * CONFIG.inventorySlotsPerLevel; },
  stackOf(id) { return (ITEMS[id] && ITEMS[id].stack) || CONFIG.stackSize; },
  addItem(id, n = 1) { // returns how many fitted
    let left = n; const S = this.stackOf(id);
    for (const sl of this.inv) if (left && sl.id === id && sl.n < S) { const k = Math.min(left, S - sl.n); sl.n += k; left -= k; }
    while (left && this.inv.length < this.invCap()) { const k = Math.min(left, S); this.inv.push({ id, n: k }); left -= k; }
    if (left < n) this.saveGame();
    return n - left;
  },
  removeItem(id, n = 1) { // returns how many were removed
    let left = n;
    for (let i = this.inv.length - 1; i >= 0 && left; i--) { const sl = this.inv[i]; if (sl.id !== id) continue; const k = Math.min(left, sl.n); sl.n -= k; left -= k; if (!sl.n) this.inv.splice(i, 1); }
    if (left < n) this.saveGame();
    return n - left;
  },
  countItem(id) { return this.inv.reduce((a, sl) => a + (sl.id === id ? sl.n : 0), 0); },
  saveKey() { return 'engine-save-' + CONFIG.saveName + '-' + SEED; },
  // Every visit can be a new seed, so old worlds' saves are pruned: the newest few are kept.
  pruneSaves(keep = 6) {
    try {
      const seeds = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i), m = /^engine-(?:save|fishgone|traps)-(.+)-(\d+)$/.exec(k || ''); if (!m) continue;
        let t = 0; try { const d = JSON.parse(localStorage.getItem(k)); t = d.t || Math.max(0, ...Object.values(d).filter(v => typeof v === 'number')); } catch (e) { /* unreadable: oldest */ }
        const id = m[1] + '-' + m[2]; (seeds[id] = seeds[id] || { t: 0, keys: [] }).keys.push(k); seeds[id].t = Math.max(seeds[id].t, t);
      }
      const cur = CONFIG.saveName + '-' + SEED, list = Object.entries(seeds).filter(([id]) => id !== cur).sort((a, b) => b[1].t - a[1].t);
      for (const [, v] of list.slice(keep - 1)) for (const k of v.keys) localStorage.removeItem(k);
    } catch (e) { /* storage unavailable */ }
  },
  loadSave() {
    this.pruneSaves();
    if (!CONFIG.saveProgress) return;
    try { const d = JSON.parse(localStorage.getItem(this.saveKey()) || 'null'); if (d) { this.inv = d.inv || []; this.taken = new Set(d.taken || []); this.savedState = d.st && typeof d.st === 'object' ? d.st : null; } } catch (e) { /* storage unavailable */ }
  },
  // where you are and when: position and heading, the hour, the day of the year, the weather, your boat and the boats left
  // about. null while the start menu is up (its view is not your place), so the last real state is kept instead.
  stateNow() {
    if (!this.live || this.titleOpen || this.glLost) return null;
    const P = this.P, b = this.boat, r = v => Math.round(v * 100) / 100, boat = q => ({ id: q.def.id, x: r(q.x), y: r(q.y), a: r(q.a), well: q.well && q.well.length ? q.well.map(f => ({ s: f.species, cm: f.lengthCm, kg: f.weightKg })) : undefined });
    return { x: r(P.x), y: r(P.y), a: r(P.a), pitch: r(P.pitch), tod: this.tod ?? CONFIG.startHour / 24, yf: ENV.yf, weather: ENV.kind,
      boat: b ? boat(b) : null, boats: this.boats.filter(q => q !== b).slice(-7).map(boat) };
  },
  saveGame() {
    if (!CONFIG.saveProgress) return;
    const st = this.stateNow(); if (st) this.savedState = st;
    try { localStorage.setItem(this.saveKey(), JSON.stringify({ inv: this.inv, taken: [...this.taken], st: this.savedState || undefined, t: Date.now() })); } catch (e) { /* storage unavailable */ }
    if (st) try { localStorage.setItem('embercrown-last', JSON.stringify({ save: CONFIG.saveName, seed: SEED, opts: HASH_OPTS, climate: CLIMATE.name, t: Date.now() })); } catch (e) { /* storage unavailable */ }   // the start menu's Continue
  },
  // reload this island: into play where you are (or to the start menu, if that's where you were)
  resumeReload() {
    try { this.saveGame(); } catch (e) { /* reload anyway */ }
    const h = '#seed-' + SEED + (HASH_OPTS ? '&' + HASH_OPTS : '') + (this.titleOpen || !this.live ? '&pick' : '&go');
    try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) { location.hash = h.slice(1); }
    location.reload();
  },
});
