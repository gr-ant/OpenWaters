'use strict';
// HUD: the on-screen interface as HTML over the game (markup in index.html, look in css/). Setup, icons, minimap frame, pin / big map / help toggles and the per-frame updateHud.
// an icon from UI_ICONS by path ('ui.close', 'dock.boat'); empty if the icon set isn't loaded
// every copy gets its own gradient / filter ids, so two icons on the page never borrow each other's
let iconN = 0;
const uiIcon = path => { try { const v = path.split('.').reduce((o, k) => o[k], UI_ICONS); if (typeof v !== 'string') return ''; const n = ++iconN;
  return v.replace(/id="([^"]+)"/g, `id="$1_${n}"`).replace(/url\(#([^)]+)\)/g, `url(#$1_${n})`).replace(/href="#([^"]+)"/g, `href="#$1_${n}"`); } catch (e) { return ''; } };

Object.assign(Engine, {
  // the kind of water you're at or nearest (for which category a menu opens on)
  contextKind() { return this.hudKind || 'lake'; },
  setupHud() {
    const $ = id => document.getElementById(id);
    this.hud = { root: $('hud'), map: $('hMap'), memo: {} };
    for (const id of ['hLocName', 'hLocSub', 'hTime', 'hSky', 'hTemp', 'hWindArrow', 'hWindV', 'hMapName', 'hScale', 'hMsg', 'hStatus', 'hDepth', 'hDepthLine', 'hDepthMark', 'hDepthV', 'hDepthB', 'hStIcon', 'hStTitle', 'hStSub', 'hStBar', 'hStKey', 'hStAct', 'hHelp', 'hDebug', 'hKeys', 'hSeedInfo']) this.hud[id] = $(id);
    for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = uiIcon(el.dataset.icon);
    for (const b of document.querySelectorAll('#hDock [data-dock]')) b.onclick = () => this.ang && this.ang.phase === 'card' ? null : ({ tackle: () => this.toggleTackle(), journal: () => this.openJournal(), boats: () => this.openSpawn('boats'), rod: () => this.toggleRod(), map: () => this.toggleBigMap(), torch: () => this.toggleTorch() })[b.dataset.dock]();
    document.querySelector('[data-help-close]').onclick = () => this.toggleHelp(false);
    document.getElementById('hHint').onclick = () => this.toggleHelp();
    document.getElementById('jnClose').onclick = () => this.toggleJournal(false);
    document.getElementById('jnBody').addEventListener('click', e => { if (e.target.id !== 'jnClear') return;
      if (e.target.dataset.arm) { try { localStorage.removeItem(this.catchKey()); } catch (er) { /* */ } this.journalRender(); } else { e.target.dataset.arm = 1; e.target.textContent = 'Tap again to clear'; } });
    for (const ev of ['pointerdown', 'pointerup', 'click', 'wheel', 'touchstart']) document.getElementById('journal').addEventListener(ev, e => e.stopPropagation());
    // the small map stays hidden unless pinned (from the big map); remembered in this browser
    try { this.miniPinned = localStorage.getItem('embercrown-minimap') === '1'; } catch (e) { this.miniPinned = false; }
    document.getElementById('hPin').onclick = e => { e.stopPropagation(); this.togglePin(); };
    document.getElementById('hSeed').onclick = e => { e.stopPropagation(); this.seedPress(); };
    document.getElementById('hMapBack').onclick = e => { e.stopPropagation(); if (this.showMap) this.toggleBigMap(); };   // leave the map
    document.getElementById('hBiomes').onclick = e => { e.stopPropagation(); const b = e.target.closest('[data-climate]'); if (b) this.newIsland(b.dataset.climate); };
    for (const id of ['hPin', 'hSeed', 'hBiomes', 'hMapBack']) for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart']) document.getElementById(id).addEventListener(ev, e => e.stopPropagation());
  },
  openJournal() { this.toggleJournal(); },
  // the address keeps the seed and other switches as they were, plus at=x,y,heading
  urlSave() {
    const P = this.P, h = location.hash.replace(/[&#]?at=[^&#]*/g, '').replace(/^#?&?/, ''), at = `at=${P.x.toFixed(1)},${P.y.toFixed(1)},${P.a.toFixed(2)}`;
    try { history.replaceState(null, '', '#' + (h ? h + '&' : '') + at); } catch (e) { /* sandboxed: fine */ }
  },
  togglePin() { this.miniPinned = !this.miniPinned; try { localStorage.setItem('embercrown-minimap', this.miniPinned ? '1' : '0'); } catch (er) { /* */ } },
  toggleBigMap() {   // M or the dock: the map opens centred on you
    this.showMap = !this.showMap; this.menu = null; this.mapCX = this.P.x; this.mapCY = this.P.y; this.mapPtrs.clear(); if (this.showMap && document.exitPointerLock) document.exitPointerLock();
  },
  toggleHelp(open = this.hud.hHelp.hidden) { this.hud.hHelp.hidden = !open; },

  // where the minimap goes: the #hMap frame's box (null while it's hidden)
  hudMapRect() {   // measured only when something that moves the frame has changed (a layout read every frame would force a reflow)
    const el = this.hud && this.hud.map; if (!el || this.showMap) return null;
    const key = innerWidth + 'x' + innerHeight + ':' + (this.miniPinned ? 1 : 0) + (this.touchUI ? 1 : 0) + (this.spawnOpen ? 1 : 0) + (this.pauseOpen ? 1 : 0);
    if (this.mapRectKey !== key) { const r = el.getBoundingClientRect(); this.mapRect = r.width > 20 ? { x: r.left + 3, y: r.top + 3, w: r.width - 6, h: r.height - 6 } : null; if (this.mapRect) this.mapRectKey = key; }   // a hidden frame is measured again next frame (it may be about to show)
    return this.mapRect;
  },

  // called every frame from drawOverlay; only touches the page when a value actually changes
  updateHud() {
    const H = this.hud; if (!H || this.pauseOpen) return;
    this.snapPump();
    if (!(this.boatT > this.time)) { this.boatT = this.time + 0.7; this.autoBoat(); }   // a boat for each water you come to
    if (!(this.urlT > this.time)) { this.urlT = this.time + 5; this.urlSave(); }   // where you are, in the address bar (copy it to come back here)
    const memo = H.memo, set = (k, v, prop = 'textContent') => { if (memo[k] !== v) { memo[k] = v; if (prop === 'html') H[k].innerHTML = v; else H[k][prop] = v; } };
    const cls = (el, name, on) => { if (el.classList.contains(name) !== on) el.classList.toggle(name, on); };
    cls(H.root, 'off', this.showMap); cls(document.body, 'map-open', !!this.showMap);
    { const deep = this.torchDeep() || this.torchOn; for (const id of ['hTorch', 'bTorch']) { const b = document.getElementById(id); if (b) { if (b.hidden === deep) b.hidden = !deep; cls(b, 'lit', !!this.torchOn); } } } cls(document.body, 'touch', !!this.touchUI); cls(document.body, 'spawn-open', !!this.spawnOpen); cls(document.body, 'tackle-open', !!this.tackleOpen); cls(document.body, 'journal-open', !!this.journalOpen); cls(document.body, 'mini-on', !!this.miniPinned);
    { const pick = !!(this.showMap && this.biomePick), bp = document.getElementById('hBiomes'); if (bp.hidden === pick) { bp.hidden = !pick; for (const b of bp.children) cls(b, 'on', b.dataset.climate === CLIMATE.key); } if (!this.showMap) this.biomePick = false; }
    if (this.showMap) { const armed = !!this.biomePick; cls(document.getElementById('hPin'), 'on', this.miniPinned); cls(document.getElementById('hSeed'), 'armed', armed);
      set('hSeedInfo', armed ? 'pick a biome for the new island' : `seed ${SEED} · ${CLIMATE.name}`); }
    if (this.showMap) return;
    const P = this.P;
    // where you are: the water you're in or looking at, else the nearest one (looked up twice a second)
    if (!(this.hudLocT > this.time)) {
      this.hudLocT = this.time + 0.5;
      let w = null; const here = Game.waterAt(P.x, P.y);
      if (here && here.depth > 0 && here.name) w = here; else if (Game.lookingAt) w = Game.lookingAt;
      else { const f = Game.findWater('any', P.x, P.y, 250); if (f) w = Game.waterAt(f.wx, f.wy); }
      this.hudPlace = w ? w.name : `${CLIMATE.name} island`; if (w) this.hudKind = w.kind;
    }
    const S = ENV.season, s = ENV.yf * 4 % 1, part = s < 0.34 ? 'Early' : s < 0.67 ? 'Mid' : 'Late';
    set('hLocName', this.hudPlace); set('hLocSub', `${part} ${S} · Day ${Math.floor(ENV.day % ENV.yearDays) + 1}`);     // time and weather
    const night = this.tod < 0.26 || this.tod > 0.77, sky = ENV.snowing > 0.3 || ENV.rain > 0.15 ? 'rain' : ENV.cloud > 0.75 || ENV.fog > 0.6 ? 'cloud' : night ? 'moon' : 'sun';
    set('hTime', this.clock()); set('hSky', uiIcon('ui.' + sky), 'html'); set('hTemp', `${ENV.airT.toFixed(0)}°C`); set('hWindV', `${(ENV.wind * 12).toFixed(0)} m/s`);
    const wa = ENV.windDir ?? 0.8, deg = Math.round(Math.atan2(Math.cos(wa), -Math.sin(wa)) * 180 / Math.PI);   // the way it blows, on the map (north up)
    if (memo.wd !== deg) { memo.wd = deg; H.hWindArrow.style.transform = `rotate(${deg}deg)`; }
    // minimap frame: name and a scale bar about a quarter of its width
    set('hMapName', this.hudPlace);
    const r = this.hudMapRect();
    if (r) { const mPerPx = this.miniScale / 2, want = r.w * 0.25 * mPerPx, nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000].reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
      if (memo.sc !== nice) { memo.sc = nice; H.hScale.querySelector('i').style.width = `${nice / mPerPx}px`; H.hScale.querySelector('b').textContent = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`; } }
    // messages from say()
    set('hMsg', this.msgT > 0 ? this.msg : ''); const op = this.msgT > 0 ? Math.min(1, this.msgT / 0.5).toFixed(2) : '0';
    if (memo.mop !== op) { memo.mop = op; H.hMsg.style.opacity = op; }
    // the depth gauge: where the hook or lure hangs between the surface and the bottom, while it's in the water
    { const A = this.ang, L = A && A.out && A.lure, on = !!(L && ['water', 'bite', 'fight'].includes(A.phase) && !L.land && L.kd >= 0 && L.wl - L.ground > 0.05);
      if (H.hDepth.hidden === on) H.hDepth.hidden = !on;
      if (on) { const dep = L.wl - L.ground, d = clamp(L.wl - L.z, 0, dep), k = (d / dep * 100).toFixed(1) + '%';
        if (memo.dgk !== k) { memo.dgk = k; H.hDepthMark.style.top = k; H.hDepthLine.style.height = k; }
        set('hDepthV', `${d.toFixed(1)} m`); set('hDepthB', `${dep.toFixed(1)} m`); } }
    // fishing status
    const st = this.fishingStatus();
    H.hStatus.hidden = !st;
    if (st) {
      const ai = /Cast|Let go|Stop/.test(st.act || '') ? 'cast' : st.act ? 'reel' : '';   // the action's little icon
      set('hStTitle', st.title); set('hStSub', st.sub || ''); set('hStKey', st.key || ''); set('hStAct', st.act ? `<i class="ai">${uiIcon('ui.' + ai)}</i>${st.act}` : '', 'html');
      cls(H.hStatus, 'alert', !!st.alert); cls(H.hStatus, 'nokey', !st.key); cls(H.hStatus, 'bite', st.bite === 'strike'); cls(H.hStatus, 'nibble', st.bite === 'nibble');
      if (st.bite) { if (memo.icon !== 'bite') { memo.icon = 'bite'; H.hStIcon.innerHTML = uiIcon('ui.bite'); } }   // a bite: the float going under, in place of the gear
      else { const A = this.ang, sg = A.S.float || A.S.lure || A.S.bait, ik = gearKey(sg);   // the float, or the lure / bait
        if (memo.icon !== ik || !H.hStIcon.firstChild || H.hStIcon.firstChild.dataset.snap) { memo.icon = ik; H.hStIcon.innerHTML = snapHTML(ik, () => gearMesh(sg)); } }
      const bar = H.hStBar, b = st.bar; bar.hidden = !b;
      if (b) { const i = bar.firstChild; i.style.width = `${(clamp(b.f, 0, 1) * 100).toFixed(1)}%`; i.style.background = b.col; if (memo.mk !== b.mark) { memo.mk = b.mark; bar.style.setProperty('--mark', b.mark == null ? '-10%' : `${(b.mark * 100).toFixed(1)}%`); } }
    }
    this.reelKeysHud();
    if (!(this.hudKeysT > this.time)) { this.hudKeysT = this.time + 0.2;   // 5 times a second is plenty
      set('hKeys', this.contextKeys().map(([k, w]) => `<span class="hk"><kbd>${k}</kbd>${w}</span>`).join(''), 'html'); }
    if (!H.hHelp.hidden) set('hDebug', `X ${P.x | 0}  Y ${P.y | 0}  ·  ${this.fps | 0} FPS  ·  seed ${SEED}`);
  },

});
