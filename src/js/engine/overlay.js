'use strict';
// Engine: drawOverlay(): the 2D canvas over the 3D view (vignette, minimap, line, finder, menus).
Object.assign(Engine, {
  drawOverlay() {
    const c = this.ctx, Wd = innerWidth, Ht = innerHeight, P = this.P;
    c.clearRect(0, 0, Wd, Ht);
    if (this.uw && !this.showMap) { // underwater: soft dark vignette in the water's colour
      const fc = this.fogColor.map(v => clamp(v * 120, 0, 60) | 0), g = c.createRadialGradient(Wd / 2, Ht / 2, Math.min(Wd, Ht) * 0.22, Wd / 2, Ht / 2, Math.hypot(Wd, Ht) * 0.55);
      g.addColorStop(0, `rgba(${fc},0)`); g.addColorStop(1, `rgba(${fc},.6)`); c.fillStyle = g; c.fillRect(0, 0, Wd, Ht);
    }
    if (this.showMap) this.drawMap(0, 0, Wd, Ht, 4, this.mapScale, this.bigMemo, 0.2, this.mapCX, this.mapCY, this.mapPtrs.size > 0 || this.mapDrag || performance.now() - this.mapHoldT < 200);
    else { const r = this.hudMapRect(); if (r) {   // the minimap, inside the HUD's rounded frame (#hMap)
      c.save(); c.beginPath(); if (c.roundRect) c.roundRect(r.x, r.y, r.w, r.h, 14); else c.rect(r.x, r.y, r.w, r.h); c.clip(); this.drawMap(r.x, r.y, r.w, r.h, 2, this.miniScale, this.miniMemo, 0.35); c.restore(); } }
    c.font = '13px monospace'; c.textBaseline = 'middle';
    if (this.touchUI && !this.showMap) { // joystick: faint ring where the thumb usually rests, live stick while held
      const j = this.joy, R = CONFIG.joystickRadius, ox = j ? j.ox : 34 + R, oy = j ? j.oy : Ht - 40 - R;
      c.globalAlpha = j ? 0.9 : 0.4; c.strokeStyle = 'rgba(232,208,146,.85)'; c.lineWidth = 2; c.fillStyle = 'rgba(24,34,25,.35)';
      c.beginPath(); c.arc(ox, oy, R, 0, 6.3); c.fill(); c.stroke();
      c.setLineDash([3, 5]); c.beginPath(); c.arc(ox, oy, R * 1.6, 0, 6.3); c.stroke(); c.setLineDash([]); // run ring
      let kx = 0, ky = 0; if (j) { const dx = j.x - ox, dy = j.y - oy, d = Math.hypot(dx, dy), m = Math.min(d, R * 1.6); if (d > 0) { kx = dx / d * m; ky = dy / d * m; } }
      c.fillStyle = 'rgba(246,238,214,.85)'; c.beginPath(); c.arc(ox + kx, oy + ky, 20, 0, 6.3); c.fill(); c.globalAlpha = 1;
    }
    const tg = !this.showMap && this.tgt;
    if (tg) { // pickup prompt under the crosshair
      const it = ITEMS[tg.item], t = (this.touchUI ? 'Take ' : 'F: collect ') + it.name;
      c.font = 'bold 14px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; const tw = c.measureText(t).width;
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(Wd / 2 - tw / 2 - 10, Ht / 2 + 22, tw + 20, 24); c.fillStyle = it.css; c.fillText(t, Wd / 2, Ht / 2 + 34); c.textAlign = 'left';
    }
    const cb = this.useBtn || (this.useBtn = document.getElementById('bUse')), pk = !tg && this.holderByUse && this.holderByUse(), tl = !tg && !pk && this.trapUseLabel && this.trapUseLabel(), mode = tg ? 'take' : pk ? 'pick' : tl || 'use'; // touch button label follows what F would do (Pick up: the rod in its holder; Throw / Set / Haul: fishing/nets-traps.js)
    if (this.touchUI && cb.dataset.mode !== mode) { cb.dataset.mode = mode; cb.textContent = tg ? 'Take' : pk ? 'Pick up' : tl || 'Use'; }
    if (this.touchUI) { const hb = this.holdBtn || (this.holdBtn = document.getElementById('bHold')), A = this.ang, hm = this.rodInHand() && A.phase === 'water' ? 'set' : this.holderNear && this.holderNear() && !this.holderByUse() ? 'pick' : '';   // Holder: set the rod down; beside or in a boat, also how you pick it up (Use is for the boat)
      if (hb && hb.dataset.mode !== hm) { hb.dataset.mode = hm; hb.hidden = !hm; hb.textContent = hm === 'pick' ? 'Pick up' : 'Holder'; } }
    if (!this.showMap && !this.photo) { // crosshair: dot + four ticks, dark outline so it reads on any background (not in screenshots: electron/shots.js)
      const X = Wd / 2, Y = Ht / 2, tick = (w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(X + dx * 5, Y + dy * 5); c.lineTo(X + dx * 11, Y + dy * 11); } c.stroke(); };
      tick(3.5, 'rgba(0,0,0,.55)'); tick(1.6, 'rgba(255,255,255,.95)');
    }
    if (this.finder && !this.showMap) this.drawFinder(c, Wd, Ht);
    this.drawFishingHud(c, Wd, Ht);
    for (const fn of Game._hudHooks) fn(c, Wd, Ht); // games draw their own HUD here
    if (this.dropHint) { c.fillStyle = 'rgba(4,14,22,.7)'; c.fillRect(0, 0, Wd, Ht); c.fillStyle = '#cfeeff'; c.font = 'bold 22px Georgia, serif'; c.textAlign = 'center'; c.fillText('Drop fish or tackle .json files to add them', Wd / 2, Ht / 2); c.textAlign = 'left'; }
    this.updateHud();   // the HTML HUD (js/hud/hud.js): place, weather, map frame, fishing status, messages
    if (this.invOpen) this.drawInventory(c, Wd, Ht);
    if (this.showMap) { const my = this.touchUI ? 70 : 30, hint = this.touchUI ? 'drag to move · pinch to zoom' : 'arrows move · W/S zoom · Enter: travel to the crosshair · M close'; c.font = '13px monospace'; const tw = c.measureText(hint).width + 12;
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(8, my, tw, 22); c.fillStyle = '#ffe9b0'; c.fillText(hint, 14, my + 11);
      // the crosshair in the middle of the map (the arrows move the map under it): the same as the one you walk with
      const X = Wd / 2, Y = Ht / 2, tick = (lw, col) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(X + dx * 6, Y + dy * 6); c.lineTo(X + dx * 16, Y + dy * 16); } c.stroke(); };
      tick(4, 'rgba(0,0,0,.6)'); tick(1.8, 'rgba(255,255,255,.95)'); c.beginPath(); c.arc(X, Y, 2, 0, 6.3); c.fillStyle = '#fff'; c.fill();
      const wi = waterInfo(this.mapCX, this.mapCY), lab = `${wi.depth > 0 ? wi.name : (wi.kind === 'sea' ? 'Land' : 'Land by ' + wi.name)} · ${this.mapCX | 0}, ${this.mapCY | 0}`;
      c.font = 'bold 13px Georgia, serif'; c.textAlign = 'center'; const lw2 = c.measureText(lab).width + 14; c.fillStyle = 'rgba(20,26,20,.75)'; c.fillRect(X - lw2 / 2, Y + 20, lw2, 20); c.fillStyle = '#f2e9d0'; c.fillText(lab, X, Y + 30); c.textAlign = 'left'; }
    // travel menu
    const m = this.menu;
    if (m) {
      const s = this.menuScale(); c.save(); c.translate(m.x, m.y); c.scale(s, s); c.lineWidth = 1;
      c.fillStyle = 'rgba(0,0,0,.85)'; c.fillRect(0, 0, 120, 26);
      c.strokeStyle = '#ffd34d'; c.strokeRect(0.5, 0.5, 119, 25);
      c.font = 'bold 13px Georgia, serif'; c.textBaseline = 'middle'; c.fillStyle = '#ffd34d'; c.fillText(CONFIG.travelSymbol + '  Travel here', 10, 13);
      c.restore();
    }
    if (this.showMap && this.touchUI) { c.font = '13px monospace'; c.fillStyle = 'rgba(255,233,176,.85)'; c.fillText('tap the map, then Travel here', 14, 106); }
  },
});
