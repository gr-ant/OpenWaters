'use strict';
// Engine: sun, moon, sky colours and light for the time of day, and the clock text.
Object.assign(Engine, {
  // the graphics look chosen in Settings (CONFIG.look), one of src/looks/*.json; the first one if that's missing
  gfxLook() { const c = this._look; if (c && c.id === CONFIG.look) return c; const L = BUILTIN.look; return this._look = L.find(l => l.id === CONFIG.look) || L[0]; },
  // each of the look's effects strengths (0..1) goes to the shader uniform lk_<name>, where that shader uses it (the names it has, found once per look)
  lookUniforms(gl, u) { const lk = this.gfxLook(), E = lk.effects;
    if (u._lkFor !== lk) { u._lkFor = lk; u._lk = []; for (const k in E) if (u['lk_' + k]) u._lk.push(u['lk_' + k], k); }
    for (let i = 0; i < u._lk.length; i += 2) gl.uniform1f(u._lk[i], E[u._lk[i + 1]]); },
  // sun, moon, sky colours and light for the current time of day (tod: 0..1, 0.5 = noon)
  skyState() {
    const ang = (this.tod - 0.25) * 6.2832, sun = norm3([Math.cos(ang), -0.45 * Math.sin(ang) - 0.25, 0.92 * Math.sin(ang)]);
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const day = sm(-0.06, 0.2, sun[2]), night = 1 - sm(-0.18, 0.02, sun[2]), sset = clamp(1 - Math.abs(sun[2] - 0.03) / 0.24, 0, 1);
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const K = this.gfxLook().sky;   // the look's colours: overhead, low down, at sunset
    let zen = mix([0.012, 0.018, 0.045], K.zenith, day), hor = mix([0.035, 0.05, 0.095], K.horizon, day);
    zen = mix(zen, K.sunsetZenith, sset * K.sunsetZenithMix); hor = mix(hor, K.sunsetHorizon, sset * K.sunsetHorizonMix);
    const sunUp = sun[2] > -0.02, key = sunUp ? sun : norm3([-sun[0], -sun[1], -sun[2]]);
    let lcol = sunUp ? mix(K.sunlight, [1.0, 0.55, 0.3], sset * 0.8).map(c => c * day) : [0.17 * night, 0.19 * night, 0.3 * night];
    let amb = mix(mix([0.075, 0.085, 0.14], K.shade, day), K.sunsetShade, sset * K.sunsetShadeMix * day);
    // weather: cloud dims the sun and greys the sky; fog and rain wash the colour out
    const cv = ENV.cloud, grey = [0.5, 0.53, 0.57].map(v => v * (0.15 + 0.85 * day) * (1 - 0.35 * ENV.rain));
    zen = mix(zen, grey.map(v => v * 0.85), sstep(0.3, 1, cv) * 0.9); hor = mix(hor, grey, sstep(0.3, 1, cv) * 0.8);
    if (ENV.fog > 0.01) { const fg = [0.74, 0.77, 0.8].map(v => v * (0.12 + 0.88 * day)); hor = mix(hor, fg, ENV.fog * 0.9); zen = mix(zen, fg, ENV.fog * 0.5); }
    const dim = 1 - 0.68 * sstep(0.35, 1, cv); lcol = lcol.map(c => c * dim);
    amb = mix(amb, grey.map(v => v * 0.62), sstep(0.4, 1, cv) * 0.5 * day);
    if (ENV.flash > 0) { amb = amb.map(v => v + ENV.flash * 0.35); }
    return { sun, key, zen, hor, lcol, amb, night, sset, day, sunc: K.sunsetGlow };
  },
  clock() { const h = (this.tod * 24) % 24; return `${String(h | 0).padStart(2, '0')}:${String((h % 1) * 60 | 0).padStart(2, '0')}`; },
});
