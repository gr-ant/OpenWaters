'use strict';
// One mouse-look path for pointer lock and drag fallback. Pending angles, not
// absolute headings, also work when a boat or keyboard turns the camera.
Object.assign(Engine, {
  mouseLookBlocked() {
    // the catch card counts too: it releases the cursor itself, which must not read as an Escape press
    return this.pauseOpen || (this.ang && this.ang.phase === 'card') || this.showMap || this.menu || this.invOpen || this.spawnOpen || this.tackleOpen || this.journalOpen || (this.hud && !this.hud.hHelp.hidden);
  },
  resetMouseLook() {
    this.lookDX = this.lookDY = 0;
    this.mdrag = this.mapDrag = null;
    this.dragged = false;
  },
  queueMouseLook(dx, dy) {
    if (this.mouseLookBlocked() || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    // Reject pointer-warp events, not ordinary fast turns. Entry/exit events
    // are separately discarded when the browser changes pointer lock.
    if (Math.abs(dx) > 2048 || Math.abs(dy) > 2048) return;
    const gain = CONFIG.mouseSensitivity * (this.mouseSensitivity ?? 1);
    this.lookDX = (this.lookDX || 0) + dx * gain;
    this.lookDY = (this.lookDY || 0) - dy * gain;
    // Do not bank vertical motion behind the pitch limit.
    this.lookDY = clamp(this.P.pitch + this.lookDY, -1.4, 1.4) - this.P.pitch;
  },
  stepMouseLook() {
    if (this.mouseLookBlocked()) { this.lookDX = this.lookDY = 0; return; }
    // Consume input in the next frame: smoothing leaves the view trailing the mouse.
    const dx = this.lookDX || 0, dy = this.lookDY || 0;
    this.P.a += dx; this.P.pitch = clamp(this.P.pitch + dy, -1.4, 1.4);
    this.lookDX = this.lookDY = 0;
  },
  requestMouseLook() {
    if (this.mouseLookBlocked() || this.recentTouch() || !this.ov.requestPointerLock) return;
    this.resetMouseLook();
    try { const result = this.ov.requestPointerLock(); if (result && result.catch) result.catch(() => {}); } catch (_) { /* drag fallback stays available */ }
  },
  setMouseSensitivity(value, save = true) {
    const n = Number(value);
    this.mouseSensitivity = Number.isFinite(n) ? clamp(n, 0.25, 3) : 1;
    this.lookDX = this.lookDY = 0;
    const slider = document.getElementById('mouseSensitivity'), label = document.getElementById('mouseSensitivityValue');
    slider.value = Math.round(this.mouseSensitivity * 100);
    label.textContent = `${Math.round(this.mouseSensitivity * 100)}%`;
    slider.setAttribute('aria-valuetext', label.textContent);
    if (save) try { localStorage.setItem('embercrown-controls', JSON.stringify({ mouseSensitivity: this.mouseSensitivity })); } catch (_) { /* session setting still works */ }
  },
  setupMouseLook() {
    this.resetMouseLook();
    let gain = 1;
    try { const saved = JSON.parse(localStorage.getItem('embercrown-controls')); if (saved && typeof saved.mouseSensitivity === 'number') gain = saved.mouseSensitivity; } catch (_) { /* use defaults */ }
    this.setMouseSensitivity(gain, false);
    const dialog = this.pauseDialog = document.getElementById('pauseMenu');
    document.getElementById('mouseSensitivity').addEventListener('input', e => this.setMouseSensitivity(Number(e.target.value) / 100));
    document.getElementById('resetMouseSensitivity').onclick = () => this.setMouseSensitivity(1);
    document.getElementById('resumeGame').onclick = () => this.togglePause(false, true);
    { const more = on => { document.body.classList.toggle('more', on); document.getElementById('hSettings').setAttribute('aria-expanded', document.body.classList.contains('more')); };
      document.getElementById('hSettings').onclick = () => this.touchUI ? more() : this.togglePause(true);   // touch: it fans out Settings and the dev tools (#tui .tui-more) instead
      document.getElementById('bSet').onclick = () => { more(false); this.togglePause(true); this.titleSettings = true; this.pauseShow('settings'); };   // straight to Settings; Back closes it (as from the start menu)
      document.querySelector('.tui-more [data-k="Digit1"]').addEventListener('click', () => more(false)); }   // the spawn panel covers them
    dialog.addEventListener('cancel', e => { e.preventDefault(); if (this.pausePage && this.pausePage !== 'main') this.pauseShow('main'); else this.togglePause(false); });   // Esc: back a page, then resume
    dialog.addEventListener('close', () => { if (this.pauseOpen) this.togglePause(false); });
    let wasLocked = document.pointerLockElement === this.ov;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.ov, lost = wasLocked && !locked;
      wasLocked = locked; this.resetMouseLook(); this.skipMouseEvent = locked; this.keys.Mouse0 = false;
      // Escape can be consumed by the browser while unlocking the cursor.
      // Other game panels set their open flag before voluntarily unlocking.
      if (lost && !this.mouseLookBlocked()) this.togglePause(true);
    });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.ov) { this.mouseXY = [e.clientX, e.clientY]; return; }   // the pointer, for hovering map icons
      if (this.skipMouseEvent) { this.skipMouseEvent = false; return; }
      this.queueMouseLook(e.movementX, e.movementY);
    });
  },
  togglePause(open = !this.pauseOpen, captureMouse = false) {
    if (open === !!this.pauseOpen) return;
    this.pauseOpen = open;
    this.resetMouseLook(); this.keys = {}; this.joy = this.tlook = this.tapStart = null;
    this.mapPtrs.clear(); this.keySettingsCancel();
    const A = this.ang;
    if (A) { A.btnWas = false; A.reeling = false; if (A.phase === 'charge') { A.phase = 'ready'; A.charge = 0; } }
    if (open) {
      this.menu = null; this.showMap = false;
      this.toggleInventory(false); this.toggleSpawn(false); this.toggleTackle(false); this.toggleJournal(false); this.toggleHelp(false);
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      { const D = this.pauseDialog; try { D.showModal(); } catch (e) { D.setAttribute('open', ''); D.classList.add('fallback'); } }   // older mobile browsers: no modal dialogs, so open it plainly
      this.pauseShow('main');
    } else {
      { const D = this.pauseDialog; try { D.close(); } catch (e) { /* */ } D.removeAttribute('open'); if (D.classList.contains('fallback')) { D.classList.remove('fallback'); D.dispatchEvent(new Event('close')); } } this.last = performance.now();
      this.ov.focus({ preventScroll: true });
      if (captureMouse) this.requestMouseLook();
    }
  },
});
