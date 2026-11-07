'use strict';
// A small second camera follows the real end tackle; it never moves the player.
Object.assign(Engine, {
  lureViewEnabled: false,
  toggleLureView() {
    this.lureViewEnabled = !this.lureViewEnabled;
    if (!this.lureViewEnabled) {
      this.releaseLureControls();
      if (this.lureView) this.lureView.root.hidden = true;
    }
    if (this.lureView) this.lureView.next = 0;
    this.say(`Lure camera ${this.lureViewEnabled ? 'on' : 'off'}`, 1.5);
  },
  setupLureView() {
    const root = document.createElement('section');
    root.id = 'lureView'; root.hidden = true; root.setAttribute('aria-label', 'Live lure view and fishing controls');
    root.innerHTML = `<div class="lure-caption"><span>LIVE · LURE</span><small></small></div>
      <canvas width="384" height="384" aria-label="Live view of the hook or lure"></canvas>
      <button class="lure-drag-less" aria-label="Decrease reel drag" title="Decrease drag ([)">−<small>Drag [</small></button>
      <button class="lure-drag-more" aria-label="Increase reel drag" title="Increase drag (])">+<small>Drag ]</small></button>
      <button class="lure-reel" title="Hold to reel; press to strike (R)"><b>Reel</b><small>Hold · R</small></button>
      <button class="lure-fast" title="Hold for faster retrieve (Shift + R)">Faster<small>Hold · ⇧ R</small></button>
      <div class="lure-drag-value"></div>`;
    document.body.appendChild(root);
    const canvas = root.querySelector('canvas'), buttons = [...root.querySelectorAll('button')];
    this.lureView = { root, canvas, ctx: canvas.getContext('2d'), caption: root.querySelector('.lure-caption small'), drag: root.querySelector('.lure-drag-value'), reel: root.querySelector('.lure-reel b'), next: 0, buttons };
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'touchstart']) root.addEventListener(type, e => e.stopPropagation());
    root.addEventListener('contextmenu', e => e.preventDefault());
    const hold = (selector, field) => {
      const button = root.querySelector(selector);
      const release = () => { this[field] = false; button.classList.remove('held'); };
      button.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); button.setPointerCapture(e.pointerId); this[field] = true; button.classList.add('held');
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(type, release);
      button.addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); this[field] = true; button.classList.add('held'); } });
      button.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); release(); } });
    };
    hold('.lure-reel', 'lureReel'); hold('.lure-fast', 'lureFast');
    root.querySelector('.lure-drag-less').onclick = () => this.setDrag(this.ang.dragKg / 1.15);
    root.querySelector('.lure-drag-more').onclick = () => this.setDrag(this.ang.dragKg * 1.15);
    addEventListener('blur', () => this.releaseLureControls());
  },
  releaseLureControls() {
    this.lureReel = this.lureFast = false;
    if (this.lureView) for (const button of this.lureView.buttons) button.classList.remove('held');
  },
  updateLureView() {
    if (!this.lureView) this.setupLureView();
    const V = this.lureView, A = this.ang, L = A && A.lure;
    const active = this.lureViewEnabled && A && A.out && L && ['flight', 'water', 'bite', 'fight'].includes(A.phase) &&
      !this.pauseOpen && !this.showMap && !this.tackleOpen && !this.journalOpen && !this.spawnOpen && !this.invOpen && !(this.hud && !this.hud.hHelp.hidden);
    if (V.root.hidden !== !active) V.root.hidden = !active;
    if (!active) { this.releaseLureControls(); V.next = 0; V.cast = null; return; }
    const now = performance.now();
    if (now < V.next) return;
    V.next = now + 1000 / 30; // modest resolution and refresh rate keep the main view responsive
    { // the labels, only when they change (a DOM write a frame is not free)
      const M = V.memo || (V.memo = {}), set = (k, v) => { if (M[k] !== v) { M[k] = v; V[k].textContent = v; } };
      set('caption', L.kd >= 0 && !L.land ? `${Math.max(0, L.wl - L.z).toFixed(1)} m deep` : A.phase === 'flight' ? 'Casting' : 'On shore');
      set('drag', `Drag ${A.dragKg.toFixed(1)} kg`);
      set('reel', A.phase === 'bite' && A.took && A.S.hookKind !== 'circle' ? 'Strike' : A.phase === 'flight' ? 'Stop' : 'Reel');
      const bite = A.phase === 'bite' && A.took; if (M.bite !== bite) { M.bite = bite; V.root.classList.toggle('bite', bite); } }
    if (V.cast !== L) { V.cast = L; V.bearing = Math.atan2(L.y - this.P.y, L.x - this.P.x) + Math.PI / 2; }
    // Stay six inches from the hook, including during a bite or fight. Look at
    // the mouth from the front quarter so the fish's body doesn't hide the take.
    let visitor = A.fish, nearest = 2;
    if (!visitor) for (const fish of this.fish) {
      if (fish.dead || fish.state !== 'lure') continue;
      const d = Math.hypot(fish.x - L.x, fish.y - L.y, fish.z - L.z);
      if (d < nearest) { visitor = fish; nearest = d; }
    }
    if (visitor) {
      const desired = visitor.a - Math.PI * 2 / 3;
      V.bearing += Math.atan2(Math.sin(desired - V.bearing), Math.cos(desired - V.bearing)) * 0.18;
    }
    const range = 0.1524;
    const x = L.x - Math.cos(V.bearing) * range, y = L.y - Math.sin(V.bearing) * range;
    // Keep the camera above the bed, and underwater when the lure is submerged.
    const ground = hW(world(x, y));
    let z = L.z + range * 0.22;
    if (L.kd >= 0 && !L.land && L.z < L.wl - 0.03) z = Math.min(z, L.wl - 0.015);
    z = Math.max(ground + 0.015, z);
    const camera = { x, y, z: z - EYE, a: V.bearing, pitch: Math.atan2(L.z - z, range) };
    const size = Math.min(V.canvas.width, this.canvas.width, this.canvas.height);
    // Render into the lower-left corner and copy it before the normal scene overwrites it.
    this.render(camera, size);
    V.ctx.clearRect(0, 0, V.canvas.width, V.canvas.height);
    V.ctx.drawImage(this.canvas, 0, this.canvas.height - size, size, size, 0, 0, V.canvas.width, V.canvas.height);
  },
});
