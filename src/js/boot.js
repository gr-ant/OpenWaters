'use strict';
// built-in fish, boats and tackle: <script type="application/json" data-builtin="fish|boat|tackle"> blocks at the end of this
// file, one per definition; they're parsed at boot, after the loading screen has painted (parsing hundreds of KB of JSON is quick,
// but parsing it as JavaScript object literals before the page could draw was not)
const BUILTIN = { fish: [], boat: [], tackle: [], feature: [] };   // feature: map features (src/features/*.json)
function readBuiltins() {
  for (const el of document.querySelectorAll('script[data-builtin]')) {
    try { BUILTIN[el.dataset.builtin].push(JSON.parse(el.textContent)); } catch (e) { console.error('Bad built-in', el.dataset.builtin, 'JSON:', e.message); }
  }
}
// the island before it's built: stippled from the base terrain alone (cheap), darker ink where the land is higher,
// the valley that gathers its rivers as a dashed line
function sketchIsland(cv) {
  const c = cv.getContext('2d'), W = cv.width, R = CONFIG.islandSize * 0.75, n = 96, s = W / n, L = LAYOUT;
  c.fillStyle = '#0a1418'; c.fillRect(0, 0, W, W);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n * 2 * R - R, y = (j + 0.5) / n * 2 * R - R, h = islandBase(x, y) - WLW; if (h < 0) continue;
    const t = clamp(h / 60, 0, 1), r = s * (0.18 + 0.3 * t);
    c.fillStyle = `rgba(207,230,239,${(0.25 + 0.6 * t).toFixed(2)})`; c.beginPath(); c.arc((i + 0.5) * s, (j + 0.5) * s, r, 0, 6.2832); c.fill();
  }
  const k = W / (2 * R), ox = -L.vy * L.voff, oy = L.vx * L.voff;   // a point on the valley line (world space)
  c.strokeStyle = 'rgba(207,230,239,.55)'; c.lineWidth = 1.5; c.beginPath();
  for (let d = -R; d < R; d += 70) {   // dashes, only over land
    const x = ox + L.vx * d, y = oy + L.vy * d; if (islandBase(x, y) < WLW || islandBase(x + L.vx * 34, y + L.vy * 34) < WLW) continue;
    c.moveTo(W / 2 + x * k, W / 2 + y * k); c.lineTo(W / 2 + (x + L.vx * 34) * k, W / 2 + (y + L.vy * 34) * k);
  }
  c.stroke();
}
// ---- boot ----
window.addEventListener('DOMContentLoaded', () => {
  // generating the island and the first chunks takes a moment: sketch its bones on the loading screen and let that paint first
  { const cv = document.querySelector('#loading canvas'); if (cv) sketchIsland(cv); }
  requestAnimationFrame(() => setTimeout(() => {
    readBuiltins();
    for (const [list, DB, label] of [[BUILTIN.fish, FishDB, 'fish'], [BUILTIN.boat, BoatDB, 'boat'], [BUILTIN.tackle, TackleDB, 'tackle']]) {   // built-ins, then what this browser has imported (same id: the import wins)
      for (const j of list) for (const d of Array.isArray(j) ? j : [j]) { const r = DB.register(d, { quiet: true }); if (!r.def) console.error(`Built-in ${label} rejected:`, d.id, r.errors); }
    }
    for (const d of Object.values(FishDB.saved())) FishDB.register(d, { quiet: true });
    for (const d of Object.values(TackleDB.saved())) { const r = TackleDB.register(d, { quiet: true }); if (r.def) r.def._custom = true; }
    Engine.init();
    Game.emit('ready');
    const ld = document.getElementById('loading'); if (ld) ld.remove();
    // menus are tinted with the average colour on screen, darkened so cream text stays readable
    const tc = document.createElement('canvas'); tc.width = 16; tc.height = 9; const tx = tc.getContext('2d');   // GPU canvas: the full frame is shrunk on the GPU, only 16×9 pixels come back
    tx.imageSmoothingQuality = 'high'; let tintT = -1e9;
    const menuUp = () => document.querySelector('.panel:not([hidden]):not(dialog), dialog.panel[open], #catch:not([hidden])');
    function sceneTint() {
      try { tx.drawImage(Engine.canvas, 0, 0, 16, 9); } catch (e) { return; }
      const d = tx.getImageData(0, 0, 16, 9).data; let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4, y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / n, k = Math.min(1, 46 / Math.max(y, 1));
      document.documentElement.style.setProperty('--tint', `${Math.round(r / n * k)} ${Math.round(g / n * k)} ${Math.round(b / n * k)}`);
    }
    function frame(timestamp) { // also measures what a frame costs without background work, to size the next budget
      const t0 = performance.now(); Engine.update(timestamp); Engine.render();
      if (timestamp - tintT > 500 && menuUp()) { tintT = timestamp; sceneTint(); }   // only while a menu shows; read right after drawing, while the frame is still in the buffer
      const w = performance.now() - t0 - (Engine.bgSpent || 0); Engine.workMs = Engine.workMs == null ? w : Engine.workMs + (w - Engine.workMs) * 0.1;
      requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  }, 0));
});
