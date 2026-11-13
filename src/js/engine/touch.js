'use strict';
Object.assign(Engine, {
  // ---- touch: floating joystick on the left, drag-to-look on the right, tap right = use, on-screen buttons ----
  // Also: mouse drag-to-look when pointer lock is unavailable (e.g. sandboxed frames).
  setupTouch() {
    const ov = this.ov, ui = document.getElementById('tui'), P = this.P;
    const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
    this.joy = null; this.tlook = null; this.tapStart = null;
    // touch controls for phones and tablets; a touchscreen laptop gets them only once it's actually touched
    const touchOn = () => { if (this.touchUI) return; this.touchUI = true; ui.hidden = false;
      { const l = document.querySelector('label[for="mouseSensitivity"]'), h = document.getElementById('mouseSensitivityHint'); if (l) l.textContent = 'Look sensitivity'; if (h) h.textContent = 'How fast the view turns when you drag to look. Saved automatically.'; } this.resize(); this.say('Left thumb: move  ·  right: look  ·  tap: use'); this.msgT = 7; };
    this.touchUI = false; if (matchMedia('(pointer: coarse)').matches) touchOn();
    for (const b of ui.querySelectorAll('button')) {
      const code = b.dataset.k, hold = b.dataset.hold;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation(); this.touchT = performance.now(); b.classList.add('on');
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        key(code, true); if (!hold) key(code, false);
      });
      const up = () => { b.classList.remove('on'); if (hold) key(code, false); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    }
    { const rb = document.getElementById('bCast'); let y0 = null;   // press Reel and pull down to wind faster (this.reelPull 0..1, read by angStep)
      rb.addEventListener('pointerdown', e => { y0 = e.clientY; this.reelPull = 0; });
      rb.addEventListener('pointermove', e => { if (y0 === null) return; this.reelPull = clamp((e.clientY - y0) / 80, 0, 1); rb.style.setProperty('--pull', this.reelPull.toFixed(2)); });
      const end = () => { y0 = null; this.reelPull = 0; rb.style.setProperty('--pull', '0'); };
      rb.addEventListener('pointerup', end); rb.addEventListener('pointercancel', end); rb.addEventListener('lostpointercapture', end); }
    const look = (dx, dy, k) => { k *= this.mouseSensitivity || 1; P.a += dx * k; P.pitch = clamp(P.pitch - dy * k, -1.4, 1.4); };   // the Settings slider scales touch look too
    // the catch card: drag across the screen to turn the fish over (sideways spins it, up and down tilts it), as A/D and W/S do
    ov.addEventListener('pointerdown', e => { const A = this.ang; if (this.pauseOpen || !A || A.phase !== 'card') return;
      e.preventDefault(); this.cardDrag = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { ov.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } });
    ov.addEventListener('pointermove', e => { const D = this.cardDrag, A = this.ang; if (!D || D.id !== e.pointerId || !A || A.phase !== 'card') return;
      A.cardYaw = (A.cardYaw || 0) + (e.clientX - D.x) * 0.012; A.cardTilt = clamp((A.cardTilt || 0) - (e.clientY - D.y) * 0.01, -1.4, 1.4); D.x = e.clientX; D.y = e.clientY; });
    for (const ev of ['pointerup', 'pointercancel']) ov.addEventListener(ev, e => { if (this.cardDrag && this.cardDrag.id === e.pointerId) this.cardDrag = null; });
    ov.addEventListener('pointerdown', e => {
      if (this.pauseOpen) return;
      if (this.ang && this.ang.phase === 'card') { if (e.pointerType !== 'mouse') { const x = e.clientX, y = e.clientY, lt = this.lastTap, dbl = !!lt && e.timeStamp - lt.t < CONFIG.doubleTapMs && Math.hypot(x - lt.x, y - lt.y) < 48; this.lastTap = null;
          this.tapDn = { id: e.pointerId, x, y, t: e.timeStamp, dbl, tgt: dbl && this.tapTarget ? this.tapTarget(x, y) : null }; } return; }
      const x = e.clientX, y = e.clientY;
      if (e.pointerType === 'mouse') {
        if (e.button === 0 && this.showMap && !this.menu) { this.mapDrag = { x, y, moved: 0 }; return; }   // drag the big map
        if (e.button === 0 && document.pointerLockElement !== ov && !this.mouseLookBlocked()) this.mdrag = { x, y, moved: 0 }; return; }
      e.preventDefault(); this.touchT = performance.now(); touchOn();
      if (this.invClick(x, y)) return;
      try { ov.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      if (this.menu) { this.tapStart = { id: e.pointerId, x, y }; return; }
      if (this.showMap) { // one finger drags the map, two pinch-zoom it; a still tap opens the travel menu
        this.mapPtrs.set(e.pointerId, { x, y, sx: x, sy: y }); this.mapMoved = this.mapPtrs.size > 1 ? 99 : 0;
        if (this.mapPtrs.size === 2) { const [a, b] = [...this.mapPtrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: this.mapScale, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
        return;
      }
      // A quick double tap acts on what it lands on (hands.js: tapTarget): a fish, a boat, a bucket or cooler, the corners of the
      // screen. On nothing in particular, with the rod out, it is the left mouse button, held for as long as the second tap is
      // (click: cast / strike; hold: charge the cast, reel; slide the finger down while holding: reel fast).
      { const lt = this.lastTap, dbl = !!lt && e.timeStamp - lt.t < CONFIG.doubleTapMs && Math.hypot(x - lt.x, y - lt.y) < 48; this.lastTap = null;
        const tgt = dbl && this.tapTarget ? this.tapTarget(x, y) : null; this.tapDn = { id: e.pointerId, x, y, t: e.timeStamp, dbl, tgt };
        if (dbl && !tgt && this.rodInHand()) { this.keys.Mouse0 = true; this.dtapId = e.pointerId; this.dtapT = performance.now(); this.dtapY = y; return; } }   // (this finger reels: it neither walks nor looks)
      if (x < innerWidth * 0.45 && !this.joy) this.joy = { id: e.pointerId, ox: x, oy: y, x, y };
      else if (!this.tlook) this.tlook = { id: e.pointerId, x, y, t: e.timeStamp, moved: 0, sx: x, sy: y, a0: this.P.a, p0: this.P.pitch };
    });
    ov.addEventListener('pointermove', e => {
      if (this.pauseOpen) return;
      if (e.pointerType === 'mouse') {
        const md = this.mapDrag;
        if (md && this.showMap && (e.buttons & 1)) { const dx = e.clientX - md.x, dy = e.clientY - md.y; md.x = e.clientX; md.y = e.clientY; md.moved += Math.abs(dx) + Math.abs(dy); this.mapPan(dx, dy); return; }
        if (document.pointerLockElement === ov || this.mouseLookBlocked()) { this.mdrag = null; return; }
        const d = this.mdrag; if (!d || !(e.buttons & 1)) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
        if (d.moved > 4) { this.dragged = true; this.queueMouseLook(dx, dy); }
        return;
      }
      const mp = this.mapPtrs.get(e.pointerId);
      if (mp && this.showMap) {
        const dx = e.clientX - mp.x, dy = e.clientY - mp.y; mp.x = e.clientX; mp.y = e.clientY;
        if (this.mapPtrs.size === 1) { this.mapMoved += Math.abs(dx) + Math.abs(dy); if (this.mapMoved > 8) this.mapPan(dx, dy); }
        else if (this.pinch) { // pinch: zoom about the midpoint, and follow the midpoint as it moves
          const [a, b] = [...this.mapPtrs.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y) || 1, pc = this.pinch;
          this.mapPan(mx - pc.mx, my - pc.my); pc.mx = mx; pc.my = my;
          this.mapZoomAt(clamp(pc.s * pc.d / d, 1, 256) / this.mapScale, mx, my);
        }
        return;
      }
      if (this.dtapId === e.pointerId) { this.keys.ShiftLeft = e.clientY - this.dtapY > 34; return; }   // reeling on a held double tap: finger slid down = faster
      const j = this.joy, l = this.tlook;
      if (j && e.pointerId === j.id) { j.x = e.clientX; j.y = e.clientY; }
      else if (l && e.pointerId === l.id) { const dx = e.clientX - l.x, dy = e.clientY - l.y; l.x = e.clientX; l.y = e.clientY; l.moved += Math.abs(dx) + Math.abs(dy); look(dx, dy, CONFIG.touchLookSensitivity); }
    });
    const end = e => {
      if (e.pointerType === 'mouse') { if (this.mapDrag && this.mapDrag.moved > 4) this.dragged = true; this.mapDrag = null; this.mdrag = null; return; }
      this.touchT = performance.now();
      const x = e.clientX, y = e.clientY, tap = e.type === 'pointerup', ts = this.tapStart;
      if (this.mapPtrs.has(e.pointerId)) {
        const still = this.mapPtrs.size === 1 && this.mapMoved <= 8; this.mapPtrs.delete(e.pointerId); this.mapHoldT = performance.now();
        if (this.mapPtrs.size < 2) this.pinch = null;
        if (this.mapPtrs.size === 1) this.mapMoved = 99;   // the other finger lifting after a pinch isn't a tap
        if (tap && still && this.showMap && !this.menuClick(x, y)) this.openMenu(x, y);
        return;
      }
      if (ts && ts.id === e.pointerId) { this.tapStart = null; if (tap && Math.hypot(x - ts.x, y - ts.y) < 16 && !this.menuClick(x, y)) this.openMenu(x, y); return; }
      const dn = this.tapDn && this.tapDn.id === e.pointerId ? this.tapDn : null; if (dn) this.tapDn = null;
      const quick = !!dn && tap && Math.hypot(x - dn.x, y - dn.y) < 16 && e.timeStamp - dn.t < CONFIG.doubleTapMs;
      let clicked = false;
      if (this.dtapId === e.pointerId) {   // the double tap's finger lifts: the mouse button comes up (held at least a few frames, so the shortest tap still registers as a click)
        this.dtapId = null; clicked = true; this.keys.ShiftLeft = false; const wait = 70 - (performance.now() - this.dtapT);
        if (wait > 0) setTimeout(() => { if (this.dtapId == null) this.keys.Mouse0 = false; }, wait); else this.keys.Mouse0 = false;
      }
      if (this.joy && e.pointerId === this.joy.id) this.joy = null;
      const l = this.tlook;
      if (l && e.pointerId === l.id) { this.tlook = null; if (tap && l.moved < 16 && e.timeStamp - l.t < CONFIG.tapMaxMs) this.openMenu(x, y);   // a tap on the minimap = the travel menu
        // a fast swipe: up = jump (off the boat too, as the Jump button does), down = put the rod away. The view goes back to where it was looking.
        const sdx = x - l.sx, sdy = y - l.sy;
        if (tap && e.timeStamp - l.t < CONFIG.swipeMs && Math.abs(sdy) > CONFIG.swipePx && Math.abs(sdy) > 2 * Math.abs(sdx) && !this.showMap && !this.menu) {
          const jump = sdy < 0, stow = !jump && this.rodInHand();
          if (jump || stow) { this.P.a = l.a0; this.P.pitch = l.p0; }
          if (jump) { this.keyPress('Space', { repeat: false }, false); setTimeout(() => { this.keys.Space = false; }, 180); }
          else if (stow) this.toggleRod(false);
        } }
      if (quick && dn.dbl && !clicked && !this.menu) { if (dn.tgt) dn.tgt(); else if (!this.rodInHand() && !this.boat && !(this.ang && this.ang.phase === 'card')) this.action(); }   // on nothing in particular, ashore: Use
      if (quick && !dn.dbl) this.lastTap = { x, y, t: e.timeStamp };   // (a third tap starts afresh)
    };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
  },
  joyInput() { // -> [forward, strafe, run]
    const j = this.joy; if (!j) return [0, 0, false];
    const R = CONFIG.joystickRadius; let dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy);
    if (d > R * 2.2) { j.ox = j.x - dx / d * R * 2.2; j.oy = j.y - dy / d * R * 2.2; dx = j.x - j.ox; dy = j.y - j.oy; d = R * 2.2; } // base follows the thumb
    if (d < 6) return [0, 0, false];
    const m = Math.min(1, d / R);
    return [-dy / d * m, dx / d * m, d > R * 1.6]; // push past the ring to run
  },

});
