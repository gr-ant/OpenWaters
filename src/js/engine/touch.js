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
    const look = (dx, dy, k) => { k *= this.mouseSensitivity || 1; P.a += dx * k; P.pitch = clamp(P.pitch - dy * k, -1.4, 1.4); };   // the Settings slider scales touch look too
    ov.addEventListener('pointerdown', e => {
      if (this.pauseOpen || (this.ang && this.ang.phase === 'card')) return;
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
      if (x < innerWidth * 0.45 && !this.joy) this.joy = { id: e.pointerId, ox: x, oy: y, x, y };
      else if (!this.tlook) this.tlook = { id: e.pointerId, x, y, t: e.timeStamp, moved: 0 };
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
      if (this.joy && e.pointerId === this.joy.id) this.joy = null;
      const l = this.tlook;
      if (l && e.pointerId === l.id) {
        this.tlook = null;
        if (tap && l.moved < 16 && e.timeStamp - l.t < CONFIG.tapMaxMs && !this.openMenu(x, y) && !(this.ang && this.ang.out)) this.action(); // tap the minimap = travel menu (a stray tap while fishing does nothing)
      }
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
