'use strict';
// UI_ICONS — inline SVG icon set for the storybook-styled HUD (no external assets): the shared
// object and drawing helpers. icons-ui.js adds ui.*, icons-dock.js dock.*, icons-tackle.js lure/bait/float.
// ui.*: 24x24 currentColor line icons (pines/sprig/reeds are decorative); dock.*: 96x72
// illustrated app icons; lure()/bait() 120x80, float() 80x80. Each call to lure/bait/float
// gets fresh gradient ids so many copies can share a page.
const UI_ICONS = {};
const ICON_KIT = (() => {
  const OL = '#2a2018';
  let seq = 0;
  const ids = () => { const k = ++seq; return s => `ui${k}${s}`; };
  const svg = (vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
  const col = (c, d) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ? c : d;
  // t>0 mixes toward white, t<0 toward black
  const shade = (h, t) => {
    const n = parseInt(h.slice(1), 16);
    const f = v => Math.max(0, Math.min(255, Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t)));
    return '#' + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
  };
  const stops = s => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('');
  const lg = (id, s, x2 = 0, y2 = 1, x1 = 0, y1 = 0) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
  const rg = (id, s, cx = .5, cy = .5, r = .5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;
  const shadow = id => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.3" flood-color="#140e08" flood-opacity=".45"/></filter>`;
  const gloss = id => rg(id, [[0, '#fff', .75], [1, '#fff', 0]]);
  const metal = d => `<path d="${d}" fill="none" stroke="${OL}" stroke-width="3.2" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#9aa0a6" stroke-width="1.7" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#eef1f4" stroke-width=".6" stroke-linecap="round" opacity=".8"/>`;
  const ring = (x, y, r) => metal(`M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`);
  // treble hook: eye at origin, pointing down (+y) before rotation
  const treble = (x, y, a = 0, s = 1) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">${ring(0, 0, 2.3)}${metal('M0 2.3V14C0 21 9 21 9 12l-2 2.6M0 14C0 21-9 21-9 12l2 2.6M0 14C0 18 3 20 4 18')}</g>`;
  // single hook: eye at origin, shank length L downward, point curls back up on +x side
  const hook1 = (x, y, a = 0, L = 20, s = 1) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">${ring(0, 0, 2.4)}${metal(`M0 2.4V${L}C0 ${L + 11} 14 ${L + 11} 14 ${L - 3}l-2.6 3`)}</g>`;
  const eye = (x, y, r, iris = '#f3d36a') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${iris}" stroke="${OL}" stroke-width="1.4"/><circle cx="${x + r * .1}" cy="${y + r * .05}" r="${r * .52}" fill="#1a1410"/><circle cx="${x - r * .25}" cy="${y - r * .3}" r="${r * .22}" fill="#fff"/>`;
  return { OL, ids, svg, col, shade, lg, rg, shadow, gloss, metal, ring, treble, hook1, eye };
})();
