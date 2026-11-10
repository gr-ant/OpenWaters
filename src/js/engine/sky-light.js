'use strict';
// Engine: sun, moon, sky colours and light for the time of day, and the clock text.
Object.assign(Engine, {
  // sun, moon, sky colours and light for the current time of day (tod: 0..1, 0.5 = noon)
  skyState() {
    const ang = (this.tod - 0.25) * 6.2832, sun = norm3([Math.cos(ang), -0.45 * Math.sin(ang) - 0.25, 0.92 * Math.sin(ang)]);
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const day = sm(-0.06, 0.2, sun[2]), night = 1 - sm(-0.18, 0.02, sun[2]), sset = clamp(1 - Math.abs(sun[2] - 0.03) / 0.24, 0, 1);
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const T = CONFIG.toon;   // painted look: a richer blue overhead, a lavender haze low down, a pink-orange horizon under a purple sky at sunset
    let zen = mix([0.012, 0.018, 0.045], T ? [0.19, 0.4, 0.78] : [0.16, 0.34, 0.68], day), hor = mix([0.035, 0.05, 0.095], T ? [0.72, 0.76, 0.94] : [0.66, 0.79, 0.92], day);
    zen = mix(zen, T ? [0.42, 0.3, 0.6] : [0.2, 0.22, 0.42], sset * (T ? 0.7 : 0.5)); hor = mix(hor, T ? [1.0, 0.6, 0.46] : [0.98, 0.56, 0.32], sset * (T ? 0.85 : 0.7));
    const sunUp = sun[2] > -0.02, key = sunUp ? sun : norm3([-sun[0], -sun[1], -sun[2]]);
    let lcol = sunUp ? mix(T ? [0.88, 0.8, 0.66] : [0.8, 0.78, 0.72], [1.0, 0.55, 0.3], sset * 0.8).map(c => c * day) : [0.17 * night, 0.19 * night, 0.3 * night];
    let amb = mix(mix([0.075, 0.085, 0.14], T ? [0.27, 0.28, 0.38] : [0.3, 0.31, 0.34], day), T ? [0.3, 0.22, 0.36] : [0.32, 0.24, 0.24], sset * (T ? 0.4 : 0.25) * day);   // toon: shadows go cool and purple, not grey
    // weather: cloud dims the sun and greys the sky; fog and rain wash the colour out
    const cv = ENV.cloud, grey = [0.5, 0.53, 0.57].map(v => v * (0.15 + 0.85 * day) * (1 - 0.35 * ENV.rain));
    zen = mix(zen, grey.map(v => v * 0.85), sstep(0.3, 1, cv) * 0.9); hor = mix(hor, grey, sstep(0.3, 1, cv) * 0.8);
    if (ENV.fog > 0.01) { const fg = [0.74, 0.77, 0.8].map(v => v * (0.12 + 0.88 * day)); hor = mix(hor, fg, ENV.fog * 0.9); zen = mix(zen, fg, ENV.fog * 0.5); }
    const dim = 1 - 0.68 * sstep(0.35, 1, cv); lcol = lcol.map(c => c * dim);
    amb = mix(amb, grey.map(v => v * 0.62), sstep(0.4, 1, cv) * 0.5 * day);
    if (ENV.flash > 0) { amb = amb.map(v => v + ENV.flash * 0.35); }
    return { sun, key, zen, hor, lcol, amb, night, sset, day, sunc: T ? [1.0, 0.55, 0.42] : [1.0, 0.5, 0.25] };
  },
  clock() { const h = (this.tod * 24) % 24; return `${String(h | 0).padStart(2, '0')}:${String((h % 1) * 60 | 0).padStart(2, '0')}`; },
});
