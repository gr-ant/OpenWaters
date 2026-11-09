'use strict';
// The reel on the 3D rod comes alive while you fish: the handle turns as you wind (or the line pays out), the spinning
// bail flips open, a baitcaster's thumb bar sinks / a conventional's free-spool lever flips while line runs free, the
// line on the spool thins as it goes out, and the drag knob / star / lever turns with the setting. Meshes come from reelPartMesh (js/tackle.js).
Object.assign(Engine, {
  // a point on the rod (rod-local metres) in the world: the rod mesh's own transform, pitch then yaw, from the hand
  rodPoint(A, p, hand = A.hand) {
    const cp = Math.cos(A.pitch || 0), sp = Math.sin(A.pitch || 0), xr = p[0] * cp - p[2] * sp, zr = p[0] * sp + p[2] * cp, cy = Math.cos(A.yaw || 0), sy = Math.sin(A.yaw || 0);
    return [hand[0] + cy * xr - sy * p[1], hand[1] + sy * xr + cy * p[1], hand[2] + zr];
  },
  reelAnimStep() {
    const A = this.ang, S = A.S, R = this.reelW || (this.reelW = { crank: 0, last: A.lineOut || 0, tm: this.time, free: 0 });
    const dt = clamp(this.time - R.tm, 0, 0.1); R.tm = this.time;
    const dl = (A.lineOut || 0) - R.last; R.last = A.lineOut || 0;
    if (A.reeling) R.crank += dt * 9.4 * (1 + 0.8 * (this.reelPull || 0)); else if (dl < 0) R.crank += -dl * 0.7;   // radians: about 1.5 turns a second wound, or with the line
    R.free += ((A.bail ? 1 : 0) - R.free) * Math.min(1, dt * 14);   // the bail / bar / lever moves over, not jumps
    return R;
  },
  // key chips pinned to the reel's parts on screen: the handle (reel), the bail / thumb bar / free-spool lever (free
  // line) and the drag knob / star / lever (drag down / up). They follow the 3D parts every frame.
  reelKeysHud() {
    const el = this.rkEl || (this.rkEl = document.getElementById('hReelKeys')), A = this.ang;
    const on = !!(el && this.showReelKeys !== false && A && A.out && A.S && A.hand && !this.showMap && !this.pauseOpen && !['card', 'charge', 'flight'].includes(A.phase) && !(this.boat && this.boatMode !== 'deck'));
    if (!el) return; if (el.hidden === on) el.hidden = !on; if (!on) return;
    const k = REEL_PARTS[A.S.reel.kind] ? A.S.reel.kind : 'spinning', Pp = REEL_PARTS[k];
    if (!this.rkChips || this.rkKind !== k) { this.rkKind = k;
      el.innerHTML = ['reel', 'free', 'drag'].map(c => `<span class="rk rk-${c}"><kbd></kbd><b></b></span>`).join('');
      this.rkChips = Object.fromEntries(['reel', 'free', 'drag'].map(c => { const s = el.querySelector(`.rk-${c}`); return [c, { s, k: s.firstChild, b: s.lastChild, txt: '' }]; })); }
    const drag = { spinning: [0.09, 0, -0.085], baitcaster: [0, 0.04, 0.032], conventional: [0, 0.056, 0.05] }[k];
    const spots = { reel: [Pp.handle[0], Pp.handle[1] + 0.035, Pp.handle[2]], free: Pp.bail ? [Pp.bail[0], 0, Pp.bail[2] - 0.04] : Pp.free, drag };
    const words = { reel: [Controls.key('cast'), 'Reel'], free: [Controls.key('bail'), k === 'spinning' ? (A.bail ? 'Close bail' : 'Open bail') : A.bail ? 'Lock spool' : 'Free spool'],
      drag: [`${Controls.key('dragDown')} ${Controls.key('dragUp')}`, `Drag ${A.dragKg.toFixed(1)} kg`] };
    const nudge = { reel: [26, -10], free: [-30, 22], drag: [24, 24] };   // a little off each part so it isn't hidden
    for (const c in spots) { const C = this.rkChips[c], p = this.project(...this.rodPoint(A, spots[c]));
      if (!p) { C.s.style.display = 'none'; continue; } C.s.style.display = '';
      C.s.style.transform = `translate(${(p[0] + nudge[c][0]).toFixed(1)}px, ${(p[1] + nudge[c][1]).toFixed(1)}px) translate(-50%, -50%)`;
      const t = words[c].join('|'); if (t !== C.txt) { C.txt = t; C.k.textContent = words[c][0]; C.b.textContent = words[c][1]; } }
  },
  // draw the moving parts; one(g, x, y, z, scale, yaw, wl, murk, pitch) draws a cached mesh
  drawReelParts(one, rv) {
    const A = this.ang, S = A.S, k = REEL_PARTS[S.reel.kind] ? S.reel.kind : 'spinning', Pp = REEL_PARTS[k], R = this.reelAnimStep(), id = `${A.rigId}:${rv}`;
    const g = (part, q = 0) => this.tackleGpu(`reel:${part}:${id}:${q}`, () => reelPartMesh(S, part, q));
    const put = (mesh, p, extraPitch = 0) => { const w = this.rodPoint(A, p); one(mesh, w[0], w[1], w[2], 1, A.yaw, -1e4, 0, (A.pitch || 0) + extraPitch); };
    const fill = Math.round(clamp(1 - (A.lineOut || 0) / Math.max(20, S.capM || 200), 0, 1) * 8) / 8, drag = Math.round(clamp(A.dragKg / Math.max(0.1, S.dragMaxKg), 0, 1) * 10) / 10;
    put(g('line', fill), [0, 0, 0]); put(g('drag', drag), [0, 0, 0]);
    put(g('handle'), Pp.handle, R.crank);
    if (Pp.bail) put(g('bail'), Pp.bail, R.free * 2.8);                                    // flips up over the spool
    if (Pp.free) k === 'baitcaster' ? put(g('free'), [Pp.free[0], Pp.free[1], Pp.free[2] - 0.007 * R.free]) : put(g('free'), Pp.free, -R.free * 1.1);   // the thumb bar sinks, the lever flips
  },
});
