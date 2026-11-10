'use strict';
// Engine: ripples, splashes, looking at water, and seasonal life (insect hatches, falling leaves).
Object.assign(Engine, {
  // ---- water life & effects ----
  addRipple(x, y, s = 0.6) { this.ripples.push({ x, y, t: this.time, s }); if (this.ripples.length > 32) this.ripples.shift(); },
  splash(x, y, z, n = 30) {
    this.disturb(x, y, Math.min(2, n / 30));
    for (let k = 0; k < n; k++) { const a = Math.random() * 6.2832, v = this.rnd(0.5, 2.5); this.spawn(DROP, x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3, z + 0.05, Math.cos(a) * v, Math.sin(a) * v, this.rnd(2, 5), this.rnd(0.4, 0.9), this.rnd(0.03, 0.07)); }
    for (let k = 0; k < n / 3; k++) this.spawn(MIST, x + this.rnd(-0.5, 0.5), y + this.rnd(-0.5, 0.5), z + 0.2, 0, 0, this.rnd(0.3, 1), this.rnd(0.6, 1.2), 0.4);
  },
  // first water surface along the view ray within 70 m (null if the ground is hit first)
  lookWater() {
    if (this.uw) return null;
    const P = this.P, cp = Math.cos(P.pitch), F = [Math.cos(P.a) * cp, Math.sin(P.a) * cp, Math.sin(P.pitch)], E = this.thirdP && this.camE ? this.camE : [P.x, P.y, P.z + EYE];   // third person: along the camera's ray, so the crosshair means what it shows
    for (let s = 0.5; s < 70; s += s < 12 ? 0.4 : 1) {
      const x = E[0] + F[0] * s, y = E[1] + F[1] * s, z = E[2] + F[2] * s; sample(x, y); const g = hW(SE);
      if (z < SW && g < SW) return { x, y, dist: s };
      if (z < g) return null;
    }
    return null;
  },
  // seasonal life around you: insects hatching over the water, leaves coming down in autumn
  seasonLife(dt, P) {
    if (ENV.hatch > 0.12 && !this.uw) this.emitN(60 * ENV.hatch, dt, () => {
      const a = Math.random() * 6.2832, r = 2 + Math.random() * 16, x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
      sample(x, y); if (SW - hW(SE) < 0.15 || SK === OCEAN || ENV.iced(SK, SW - hW(SE), x, y)) return;
      this.spawn(FLY, x, y, SW + 0.15 + Math.random() * 1.6, this.rnd(-0.6, 0.6), this.rnd(-0.6, 0.6), this.rnd(-0.1, 0.4), this.rnd(1.5, 4), this.rnd(0.022, 0.04));
    });
    const fall = ENV.autumn * ENV.leaf > 0.05 ? ENV.autumn * (0.25 + ENV.leaf) * (0.4 + 1.2 * ENV.wind) : 0;
    if (fall > 0 && (this.leafT = (this.leafT || 0) - dt) <= 0) {
      this.leafT = 0.5;
      const near = []; for (const ch of this.chunks.values()) if (Math.abs((ch.cx + 0.5) * CHW - P.x) < CHW && Math.abs((ch.cy + 0.5) * CHW - P.y) < CHW) near.push(ch);
      const wa = ENV.windDir ?? 0.8, wv = ENV.wind * 2.5;
      for (let n = 0; n < 14 * fall; n++) {
        const ch = near[Math.random() * near.length | 0]; if (!ch) break;
        const ki = 1 + (Math.random() * 3 | 0), td = ch.treeData[ki]; if (!td) continue;
        const i = (Math.random() * td.length / 6 | 0) * 6, x = td[i], y = td[i + 1]; if (Math.abs(x - P.x) > 40 || Math.abs(y - P.y) > 40) continue;
        const sc = td[i + 3], a = Math.random() * 6.2832, r = sc * 0.3 * Math.random(), tint = td[i + 5];
        const col = ki === 1 ? [[0.66, 0.4, 0.14], [0.55, 0.32, 0.12]][(tint * 7 | 0) % 2] : [[0.86, 0.18, 0.07], [0.93, 0.5, 0.1]][(tint * 3.7 % 1) < 0.5 ? 0 : 1];
        const lx = x + Math.cos(a) * r + Math.cos(wa) * wv * 3, ly = y + Math.sin(a) * r + Math.sin(wa) * wv * 3;
        this.spawn(LEAFP, x + Math.cos(a) * r, y + Math.sin(a) * r, td[i + 2] + sc * (0.55 + 0.35 * Math.random()), Math.cos(wa) * wv + this.rnd(-0.5, 0.5), Math.sin(wa) * wv + this.rnd(-0.5, 0.5), 0, this.rnd(9, 14), this.rnd(0.06, 0.1), { col: ki === 3 ? [0.92, 0.8, 0.25] : col, floor: surfAt(lx, ly) + 0.02 });
      }
    }
  },
});
