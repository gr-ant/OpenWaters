'use strict';
// built-in fish, boats and tackle: <script type="application/json" data-builtin="fish|boat|tackle"> blocks at the end of this
// file, one per definition; they're parsed at boot, after the loading screen has painted (parsing hundreds of KB of JSON is quick,
// but parsing it as JavaScript object literals before the page could draw was not)
const BUILTIN = { fish: [], boat: [], tackle: [], feature: [], boatparts: [], angler: [], clothes: [], look: [], bird: [], plant: [] };   // bird: src/birds/*.json; plant: src/plants/*.json; feature: map features (src/features/*.json); boatparts: boats/parts.json; angler, clothes: your look in third person (src/angler/*.json); look: graphics looks (src/looks/*.json)
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
    readBuiltins(); registerPlants(BUILTIN.plant); BOAT_PARTS = BUILTIN.boatparts[0] || null;   // sizes, builds, engines and fittings (boats/parts.json), before the boats that name them
    for (const [list, DB, label] of [[BUILTIN.fish, FishDB, 'fish'], [BUILTIN.boat, BoatDB, 'boat'], [BUILTIN.tackle, TackleDB, 'tackle']]) {   // built-ins, then what this browser has imported (same id: the import wins)
      for (const j of list) for (const d of Array.isArray(j) ? j : [j]) { const r = DB.register(d, { quiet: true }); if (!r.def) console.error(`Built-in ${label} rejected:`, d.id, r.errors); }
    }
    for (const d of BUILTIN.bird) Birds.register(d);   // (before Engine.init: the birds are placed on 'ready')
    for (const d of Object.values(FishDB.saved())) FishDB.register(d, { quiet: true });
    for (const d of Object.values(TackleDB.saved())) { const r = TackleDB.register(d, { quiet: true }); if (r.def) r.def._custom = true; }
    Engine.init();
    Game.emit('ready');
    const ld = document.getElementById('loading'); if (ld) ld.remove();
    // menus are tinted with the average colour on screen, darkened so cream text stays readable
    const tc = document.createElement('canvas'); tc.width = 16; tc.height = 9; const tx = tc.getContext('2d');   // GPU canvas: the full frame is shrunk on the GPU, only 16×9 pixels come back
    tx.imageSmoothingQuality = 'high'; let tintT = -1e9, tintEl = null;
    const menuUp = () => document.querySelector('.panel:not([hidden]):not(dialog), dialog.panel[open], #catch:not([hidden])');
    function sceneTint() {   // from the sky's horizon colour the renderer already has: no reading pixels back from the GPU
      const c = Engine.fogColor; if (!c) return;
      const r = clamp(c[0], 0, 1) * 255, g = clamp(c[1], 0, 1) * 255, b = clamp(c[2], 0, 1) * 255;
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b, k = Math.min(1, 46 / Math.max(y, 1));
      document.documentElement.style.setProperty('--tint', `${Math.round(r * k)} ${Math.round(g * k)} ${Math.round(b * k)}`);
    }
    // a note over everything, for the rare things the game can't put right by itself
    function sysNote(text, reload) {
      let n = document.getElementById('sysNote');
      if (!n) { n = document.createElement('div'); n.id = 'sysNote'; n.setAttribute('role', 'alert'); document.body.appendChild(n);
        n.style.cssText = 'position:fixed;z-index:99;left:50%;top:18px;transform:translateX(-50%);width:max-content;max-width:min(440px,calc(100vw - 32px));padding:12px 16px;border-radius:14px;background:rgba(24,34,25,.96);border:2px solid #c4a86c;color:#f2e9d0;font:600 14px/1.45 system-ui,sans-serif;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.5);visibility:visible'; }
      n.textContent = text; n.hidden = !text;
      if (text && reload) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Reload'; b.onclick = () => Engine.resumeReload();
        b.style.cssText = 'display:block;margin:8px auto 0;padding:7px 18px;border-radius:999px;border:1.5px solid #c4a86c;background:#2a5a3e;color:#f6ecd2;font:inherit;cursor:pointer'; n.appendChild(b); }
    }
    // The browser can take the graphics context away (a phone putting the tab aside, a driver reset). Everything on the GPU
    // goes with it, so: hold the loop, save, and when the context comes back reload into this island where you stood.
    Engine.canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();   // without this the context is never given back
      try { Engine.saveGame(); } catch (er) { /* */ }
      Engine.glLost = true; Engine.keys = {}; sysNote('The browser paused the graphics. Restoring…', true);
    });
    Engine.canvas.addEventListener('webglcontextrestored', () => {
      let recent = false; try { recent = Date.now() - +sessionStorage.getItem('ow-gl-reload') < 20000; sessionStorage.setItem('ow-gl-reload', String(Date.now())); } catch (er) { /* */ }
      if (recent) sysNote('The graphics keep dropping out. Close other tabs or apps, then reload.', true);   // twice in 20 s: don't loop
      else Engine.resumeReload();
    });
    // Adaptive resolution: the 3D view's pixel count follows what the device can draw. Judged on the real time between
    // frames (the GPU's cost never shows in script time), every 2 s. Down a step when under ~45 FPS; back up a step after a
    // calm spell. A step that doesn't help is undone and held off: the frame rate is capped elsewhere (low-power mode).
    const AR = { ft: 16.7, last: 0, t: 0, calm: 0, upWait: 20, lock: 0, lockLen: 60000, probe: null };
    function adaptRes(ts) {
      const d = ts - AR.last; AR.last = ts;
      if (!CONFIG.adaptiveResolution || !(d > 0) || d > 250 || Engine.pauseOpen || Engine.showMap || document.hidden || Engine.chunks.size < 60 || Engine.time < 6) { AR.t = 0; return; }
      AR.ft += (d - AR.ft) * 0.05; AR.t += d / 1000; if (AR.t < 2) return;
      AR.t = 0; const s = Engine.resScale || 1, ft = AR.ft, P = AR.probe; AR.probe = null;
      if (P && P.dir < 0 && ft > P.ft * 0.93) { Engine.setResScale(P.from); AR.lock = ts + AR.lockLen; AR.lockLen = Math.min(600000, AR.lockLen * 2); return; }   // no faster for it
      if (P && P.dir > 0 && ft > 20) { Engine.setResScale(P.from); AR.upWait = Math.min(120, AR.upWait * 2); AR.calm = 0; return; }   // too much: back down, wait longer next time
      if (ts < AR.lock) return;
      if (ft > 22 && s > CONFIG.minResolutionScale + 0.001) { AR.probe = { dir: -1, from: s, ft }; AR.calm = 0; Engine.setResScale(s * 0.85); }
      else if (ft < 17.6 && s < 1) { if ((AR.calm += 2) >= AR.upWait) { AR.probe = { dir: 1, from: s, ft }; AR.calm = 0; Engine.setResScale(s * 1.12); } }
      else AR.calm = 0;
    }
    let frameErrs = 0, fpsLast = 0, updMs = 0;
    function frame(timestamp) { // also measures what a frame costs without background work, to size the next budget
      requestAnimationFrame(frame);   // first: whatever happens below, the loop goes on
      if (Engine.glLost) return;
      try {
        { const rd = timestamp - fpsLast; fpsLast = timestamp; if (rd > 0 && rd < 4000) Engine.fps += (1000 / rd - Engine.fps) * Math.min(1, rd / 600); }   // from the real time between frames, not the clamped step
        adaptRes(timestamp);   // before drawing: resizing the canvas clears it
        const t0 = performance.now();
        // a slow frame is simulated in up to three steps of at most 50 ms, so the game keeps real time down to about 7 fps instead of slowing below 20;
        // extra steps are only taken while a step is cheap next to the frame, so they can't drag the frame rate down further
        const gap = timestamp - (Engine.last || timestamp), room = updMs > 0.01 ? Math.floor(gap * 0.25 / updMs) : 2;
        const n = Engine.pauseOpen ? 1 : clamp(Math.min(Math.ceil(gap / 50), 1 + room), 1, 3), from = timestamp - Math.min(gap, n * 50); let bg = 0;
        for (let i = 1; i <= n; i++) { Engine.subStep = i < n; const u0 = performance.now(); Engine.update(from + (timestamp - from) * i / n); const sp = Engine.bgSpent || 0; bg += sp; updMs += (performance.now() - u0 - sp - updMs) * 0.1; }
        Engine.subStep = false; Engine.bgSpent = bg; Engine.render();
        { const m = menuUp(); if (m && (m !== tintEl || timestamp - tintT > 4000)) { tintT = timestamp; sceneTint(); } tintEl = m; }   // when a menu opens, then every 4 s (each read stalls the GPU); right after drawing, while the frame is in the buffer
        const w = performance.now() - t0 - (Engine.bgSpent || 0); Engine.workMs = Engine.workMs == null ? w : Engine.workMs + (w - Engine.workMs) * 0.1;
        if (frameErrs) { frameErrs = 0; sysNote(''); }
      } catch (e) {   // one bad frame is skipped; the same failure for two seconds running gets a note and a way out
        if (++frameErrs <= 3) console.error('Frame failed:', e);
        if (frameErrs === 120) { try { Engine.saveGame(); } catch (er) { /* */ } sysNote('Something went wrong and the game has stalled. Your progress is saved.', true); }
      }
    }
    requestAnimationFrame(frame);
  }, 0));
});
