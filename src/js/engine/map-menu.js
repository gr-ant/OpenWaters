'use strict';
// Engine: the map travel menu (right-click / double-click / tap) and the new-island button.
Object.assign(Engine, {
  // ---- map travel menu (shared by right-click, and taps on touch screens) ----
  recentTouch() { return performance.now() - (this.touchT || -1e9) < 800; },
  menuScale() { return this.touchUI ? 1.7 : 1; },
  openMenu(cx, cy) { // true if (cx, cy) is on the visible map and a menu opened
    const v = (this.showMap ? this.bigMemo : this.miniMemo).view;
    if (!v || cx < v.x0 || cx >= v.x0 + v.w * v.cell || cy < v.y0 || cy >= v.y0 + v.h * v.cell) { this.menu = null; return false; }
    const k = this.menuScale(), mw = 120 * k; // menu: one 'Travel here' button
    this.menu = { x: clamp(cx + 10, 4, innerWidth - mw - 4), y: clamp(cy - 14 * k, 24, innerHeight - 30 * k),
      wx: v.ox + ((cx - v.x0) / v.cell - v.w / 2) * v.scale, wy: v.oy + ((cy - v.y0) / v.cell - v.h / 2) * v.scale };
    return true;
  },
  // the map's new-island button: first press arms it, a second within 5 s reloads the page on a random seed
  seedPress() {
    if (!this.showMap) return;
    if (performance.now() - (this.seedArm || -1e9) < 5000) {
      const seed = 1 + Math.floor(Math.random() * 999999998); this.say('Shaping a new island…', 5);
      setTimeout(() => { const h = '#seed-' + seed + (HASH_OPTS ? '&' + HASH_OPTS : '') + '&map&mz=' + this.mapScale.toFixed(2); try { history.replaceState(null, '', h); } catch (e) { location.hash = h.slice(1); } location.reload(); }, 60);   // &map: come back with the map open, &mz: at the same zoom
    } else { this.seedArm = performance.now(); this.menu = null; }
  },
  menuClick(cx, cy) { // true if a menu was open (it closes either way)
    const m = this.menu; if (!m) return false;
    const s = this.menuScale(), lx = (cx - m.x) / s, ly = (cy - m.y) / s;
    if (ly >= 0 && ly < 26 && lx >= 0 && lx < 120) { this.say('Travelling…', 1); setTimeout(() => this.travel(m.wx, m.wy, CONFIG.travelSymbol), 30); }   // let the message show before the new area loads
    this.menu = null; return true;
  },
});
