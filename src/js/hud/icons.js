'use strict';
// UI_ICONS — inline SVG icon set for the storybook-styled HUD (no external assets).
// ui.*: 24x24 currentColor line icons (pines/sprig/reeds are decorative); dock.*: 96x72
// illustrated app icons; lure()/bait() 120x80, float() 80x80. Each call to lure/bait/float
// gets fresh gradient ids so many copies can share a page.
const UI_ICONS = (() => {
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

  // ---------- lures ----------
  const LURE_DEF = { body: '#c9d3b0', back: '#2c5d3a', belly: '#f2eedd', accent: '#d84a2a', blade: '#d8dde0' };

  function minnowLure(c, I, lip) {
    const B = 'M18 40C18 27 44 20 72 23C90 25 101 33 104 40C101 47 90 54 72 56C44 59 18 53 18 40Z';
    return `<defs>${lg(I('f'), [[0, c.back], [.42, c.body], [.72, c.belly], [1, shade(c.belly, -.2)]])}${gloss(I('g'))}${shadow(I('s'))}
<clipPath id="${I('c')}"><path d="${B}"/></clipPath>
<pattern id="${I('p')}" width="6" height="5" patternUnits="userSpaceOnUse"><path d="M0 5a3 3 0 0 1 6 0" fill="none" stroke="${shade(c.body, -.45)}" stroke-width=".7" opacity=".35"/></pattern></defs>
<g filter="url(#${I('s')})">${treble(48, 55)}${treble(84, 52)}${lip ? '' : ring(15, 40, 2.6)}
<path d="M98 38L112 30L110 50L98 42Z" fill="${shade(c.back, .15)}" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round" opacity="${lip ? 0 : 1}"/>
<path d="${B}" fill="url(#${I('f')})"/>
<g clip-path="url(#${I('c')})"><rect x="0" y="0" width="120" height="80" fill="url(#${I('p')})"/>${[44, 58, 72, 86].map(x => `<path d="M${x} 18l4 0-3 22-4 0z" fill="${c.back}" opacity=".35"/>`).join('')}
<path d="M18 45C40 50 80 49 104 41V60H18Z" fill="${shade(c.belly, -.25)}" opacity=".35"/></g>
<path d="M36 28C41 35 41 46 35 53" fill="none" stroke="${shade(c.body, -.5)}" stroke-width="1.4" opacity=".55"/>
<ellipse cx="62" cy="29" rx="30" ry="4.5" fill="url(#${I('g')})"/>
<path d="${B}" fill="none" stroke="${OL}" stroke-width="2"/>
${eye(28, 36, 6.5)}
${lip ? `<path d="M22 45L6 59C3 63 7 66 11 64L31 51Z" fill="#d6e8ee" fill-opacity=".9" stroke="${OL}" stroke-width="1.5" stroke-linejoin="round"/><path d="M20 49L9 59" stroke="#fff" stroke-width="1.4" opacity=".8" stroke-linecap="round"/>${ring(12, 58, 2.4)}` : ''}</g>`;
  }

  function spoonLure(c, I) {
    const S = 'M10 38C13 28 40 22 66 25C82 27 86 45 72 51C46 60 14 52 10 38Z';
    const b = c.body;
    const dots = [[22, 36], [30, 32], [40, 29], [52, 28], [64, 30], [74, 35], [28, 43], [40, 40], [52, 38], [64, 40], [74, 44], [36, 49], [50, 48], [62, 48]]
      .map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="2.4" fill="${i % 2 ? '#fff' : shade(b, -.6)}" opacity="${i % 2 ? .35 : .18}"/>`).join('');
    const tag = [-5, -2, 1, 4].map((d, i) => `<path d="M90 41C98 ${41 + d} 104 ${41 + d * 1.6} 112 ${41 + d * 2.2}" stroke="${i % 2 ? shade(c.accent, .25) : c.accent}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`).join('');
    return `<defs>${lg(I('m'), [[0, shade(b, .6)], [.3, b], [.55, shade(b, -.38)], [.78, shade(b, .25)], [1, shade(b, -.3)]])}${shadow(I('s'))}<clipPath id="${I('c')}"><path d="${S}"/></clipPath></defs>
<g filter="url(#${I('s')})" transform="rotate(-12 60 40) translate(4 0)">${ring(84, 40, 3)}${tag}${treble(87, 41, -90)}${ring(8, 38, 3.2)}
<path d="${S}" fill="url(#${I('m')})"/><g clip-path="url(#${I('c')})">${dots}<path d="M10 46C30 56 60 56 86 44V60H10Z" fill="${shade(b, -.6)}" opacity=".25"/></g>
<path d="M22 33C36 27 56 25 74 28" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".75"/>
<path d="${S}" fill="none" stroke="${OL}" stroke-width="2"/><path d="M14 39C30 46 56 47 78 43" fill="none" stroke="${shade(b, -.5)}" stroke-width="1" opacity=".5"/></g>`;
  }

  function spinnerLure(c, I) {
    const bl = c.blade;
    const tuft = [-6, -3, 0, 3, 6].map((d, i) => `<path d="M90 40C98 ${40 + d * .6} 104 ${40 + d} 113 ${40 + d * 1.5}" stroke="${i % 2 ? c.accent : c.body}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`).join('');
    return `<defs>${rg(I('b'), [[0, shade(bl, .8)], [.45, bl], [1, shade(bl, -.45)]], .38, .35, .7)}${lg(I('f'), [[0, shade(c.body, .45)], [.5, c.body], [1, shade(c.body, -.4)]])}${shadow(I('s'))}</defs>
<g filter="url(#${I('s')})">${metal('M9 40H92')}${ring(7, 40, 3)}${tuft}${treble(89, 40, -90)}
${metal('M18 40C18 34 22 33 24 36')}
<ellipse cx="32" cy="29" rx="17" ry="9.5" transform="rotate(-18 32 29)" fill="url(#${I('b')})" stroke="${OL}" stroke-width="1.8"/>
<ellipse cx="33" cy="29" rx="10" ry="5" transform="rotate(-18 33 29)" fill="${shade(bl, -.5)}" opacity=".18"/>
<path d="M20 31C24 25 32 22 40 22" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/>
<circle cx="44" cy="40" r="3.4" fill="${shade(c.accent, .1)}" stroke="${OL}" stroke-width="1.2"/><circle cx="50.5" cy="40" r="3.8" fill="${c.accent}" stroke="${OL}" stroke-width="1.2"/><circle cx="49.4" cy="38.6" r="1" fill="#fff" opacity=".8"/>
<path d="M55 40C55 33 63 31 71 33C79 35 81 38 81 40C81 42 79 45 71 47C63 49 55 47 55 40Z" fill="url(#${I('f')})" stroke="${OL}" stroke-width="1.6"/>
<path d="M64 33V47M72 33.6V46.4" stroke="${c.accent}" stroke-width="1.8" opacity=".9"/><path d="M58 37C64 34 72 34 78 37" stroke="#fff" stroke-width="1.3" fill="none" opacity=".7" stroke-linecap="round"/></g>`;
  }

  function jigLure(c, I) {
    const skirt = [];
    for (let i = 0; i < 11; i++) {
      const d = i - 5, y0 = 38 + d * 1.5, y1 = 41 + d * 2.6, w = (i % 3) - 1;
      skirt.push([`M38 ${y0}C58 ${y0 + d * .8 + w * 3} 74 ${y1 - w * 3} 94 ${y1}`, [c.body, c.back, shade(c.body, .3)][i % 3]]);
    }
    return `<defs>${rg(I('h'), [[0, shade(c.accent, .55)], [.55, c.accent], [1, shade(c.accent, -.45)]], .38, .32, .7)}${shadow(I('s'))}</defs>
<g filter="url(#${I('s')})">${hook1(30, 38, -90, 64)}${ring(31, 24, 2.8)}
${skirt.map(([d]) => `<path d="${d}" stroke="${shade(c.back, -.55)}" stroke-width="4" stroke-linecap="round" fill="none"/>`).join('')}
${skirt.map(([d, k]) => `<path d="${d}" stroke="${k}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`).join('')}
<rect x="37" y="31" width="6" height="15" rx="2" fill="${shade(c.body, -.15)}" stroke="${OL}" stroke-width="1.4"/>
<circle cx="29" cy="38" r="12" fill="url(#${I('h')})" stroke="${OL}" stroke-width="2"/>
<path d="M21 32C23 28 28 27 31 27.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".75"/>
${eye(25, 38, 4.6)}</g>`;
  }

  function softPlastic(c, I) {
    const b = c.body;
    const P = 'M18 40C32 32 52 33 70 39';
    const T = 'M70 39C86 45 104 44 104 32C104 22 90 21 88 30';
    return `<defs>${shadow(I('s'))}</defs><g filter="url(#${I('s')})">${ring(11, 36, 2.6)}
<path d="${P}" stroke="${OL}" stroke-width="15" stroke-linecap="round" fill="none"/><path d="${T}" stroke="${OL}" stroke-width="8" stroke-linecap="round" fill="none"/>
<path d="${T}" stroke="${b}" stroke-width="5" stroke-linecap="round" fill="none"/>
<path d="${P}" stroke="${b}" stroke-width="12" stroke-linecap="round" fill="none"/>
<path d="${P}" stroke="${shade(b, -.4)}" stroke-width="12" stroke-dasharray="1.2 3.6" fill="none" opacity=".45"/>
<path d="M19 37C33 30 52 31 68 36" stroke="${shade(b, .55)}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".7"/>
<path d="M76 40C88 44 100 42 101 32" stroke="${shade(b, .5)}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".6"/>
${metal('M42 42C41 58 60 58 60 44l-3 2.6')}${metal('M13 36H24')}
<circle cx="46" cy="36" r="1.1" fill="${shade(c.accent, .2)}" opacity=".9"/><circle cx="56" cy="37" r="1.1" fill="${shade(c.accent, .2)}" opacity=".9"/></g>`;
  }

  function popperLure(c, I) {
    const B = 'M22 27C50 21 84 25 99 37C101 39 101 42 99 44C84 56 50 59 22 53Z';
    const tuft = [-6, -2, 2, 6].map((d, i) => `<path d="M100 41C106 ${41 + d * .6} 110 ${41 + d} 116 ${41 + d * 1.5}" stroke="${i % 2 ? c.accent : '#f4f0e4'}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`).join('');
    return `<defs>${lg(I('f'), [[0, c.back], [.45, c.body], [.75, c.belly], [1, shade(c.belly, -.2)]])}${gloss(I('g'))}${rg(I('m'), [[0, shade(c.back, -.6)], [.7, shade(c.back, -.2)], [1, shade(c.body, .2)]], .55, .5, .6)}${shadow(I('s'))}</defs>
<g filter="url(#${I('s')})">${tuft}${treble(99, 41, -90, .9)}${treble(54, 56)}
<path d="${B}" fill="url(#${I('f')})" stroke="${OL}" stroke-width="2"/>
<path d="M30 46C50 52 80 52 98 43" stroke="${shade(c.belly, -.3)}" stroke-width="1.2" fill="none" opacity=".5"/>
<ellipse cx="60" cy="30" rx="30" ry="4" fill="url(#${I('g')})"/>
<ellipse cx="22" cy="40" rx="5" ry="13" fill="url(#${I('m')})" stroke="${OL}" stroke-width="1.8"/>
<path d="M20 31C18 36 18 44 20 49" stroke="#fff" stroke-width="1" opacity=".5" fill="none"/>
${ring(15, 41, 2.4)}${eye(34, 36, 5.5)}</g>`;
  }

  function skirtLure(c, I) {
    const strands = [];
    for (let i = 0; i < 13; i++) {
      const d = i - 6, y0 = 40 + d * 1.6, y1 = 40 + d * 3.4, w = i % 2 ? 3 : -3;
      strands.push([`M34 ${y0}C54 ${y0 + d * .6 + w} 76 ${y1 - w} 98 ${y1}`, i % 3 === 1 ? c.accent : i % 3 ? shade(c.body, .25) : c.body]);
    }
    return `<defs>${lg(I('h'), [[0, shade(c.body, .55)], [.45, c.body], [1, shade(c.body, -.5)]])}${gloss(I('g'))}${shadow(I('s'))}</defs>
<g filter="url(#${I('s')})">${metal('M2 40H12')}${hook1(40, 40, -90, 68, 1.05)}
${strands.map(([d]) => `<path d="${d}" stroke="${shade(c.body, -.6)}" stroke-width="4" stroke-linecap="round" fill="none"/>`).join('')}
${strands.map(([d, k]) => `<path d="${d}" stroke="${k}" stroke-width="2.5" stroke-linecap="round" fill="none"/>`).join('')}
<path d="M10 40C10 31 20 28 37 29V51C20 52 10 49 10 40Z" fill="url(#${I('h')})" stroke="${OL}" stroke-width="2"/>
<ellipse cx="23" cy="33" rx="10" ry="2.6" fill="url(#${I('g')})"/>
<rect x="34" y="28" width="5" height="24" rx="2" fill="${shade(c.accent, -.1)}" stroke="${OL}" stroke-width="1.4"/>
${eye(21, 40, 4.6)}</g>`;
  }

  // ---------- baits ----------
  function worm(c, I) {
    const P = 'M12 46C22 24 40 24 50 40S74 58 84 42S100 26 110 34';
    return `<defs>${shadow(I('s'))}</defs><g filter="url(#${I('s')})">
<path d="${P}" stroke="${OL}" stroke-width="12" stroke-linecap="round" fill="none"/>
<path d="${P}" stroke="${c.body}" stroke-width="9" stroke-linecap="round" fill="none"/>
<path d="${P}" stroke="${c.accent}" stroke-width="9" stroke-dasharray="1 3.4" fill="none" opacity=".45"/>
<path d="${P}" pathLength="100" stroke="${shade(c.accent, .15)}" stroke-width="10" stroke-dasharray="0 70 9 100" fill="none"/>
<path d="${P}" transform="translate(-.6 -2.4)" stroke="${shade(c.body, .55)}" stroke-width="2" stroke-linecap="round" fill="none" opacity=".55"/>
${hook1(58, 18, 0, 22, .9)}</g>`;
  }

  function minnow(c, I) {
    const B = 'M14 40C26 27 56 26 80 34L102 22C98 34 98 46 102 58L80 46C56 54 26 53 14 40Z';
    return `<defs>${lg(I('f'), [[0, c.accent], [.38, c.body], [.62, shade(c.body, .6)], [1, shade(c.body, .2)]])}${gloss(I('g'))}${shadow(I('s'))}</defs>
<g filter="url(#${I('s')})"><path d="M50 30C56 20 64 22 68 31Z" fill="${shade(c.accent, -.1)}" stroke="${OL}" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M54 49L60 57L66 48Z" fill="${shade(c.body, -.15)}" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/>
<path d="${B}" fill="url(#${I('f')})" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>
<path d="M24 41C44 39 64 39 84 40" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".7" fill="none"/>
<path d="M88 34L98 28M88 46L98 52M88 40H99" stroke="${shade(c.accent, -.2)}" stroke-width=".9" opacity=".6"/>
<path d="M30 31C34 36 34 44 30 49" stroke="${shade(c.accent, -.3)}" stroke-width="1.3" fill="none" opacity=".6"/>
<ellipse cx="50" cy="33" rx="18" ry="2.6" fill="url(#${I('g')})"/>${eye(23, 37, 3.8, '#e8e2cc')}${hook1(14, 26, 0, 12, .7)}</g>`;
  }

  function cricket(c, I) {
    const b = c.body, a = c.accent;
    return `<defs>${lg(I('f'), [[0, shade(b, .5)], [1, shade(b, -.4)]])}${lg(I('l'), [[0, shade(a, .35)], [1, shade(a, -.3)]])}${shadow(I('s'))}</defs>
<g filter="url(#${I('s')})" stroke="${OL}" stroke-linejoin="round" stroke-linecap="round">
<path d="M22 39C30 14 70 9 112 14M24 38C38 20 66 18 104 26" fill="none" stroke-width="1.2"/>
<path d="M38 52L30 62L24 64M46 54L48 64L55 66M56 54L58 64L64 66" fill="none" stroke-width="2"/>
<path d="M96 48L112 44M96 50L110 54" fill="none" stroke-width="1.4"/>
<ellipse cx="74" cy="48" rx="24" ry="10.5" fill="url(#${I('f')})" stroke-width="1.8"/>
<path d="M60 52C64 40 84 22 96 24C100 27 88 40 70 54Z" fill="url(#${I('l')})" stroke-width="1.6"/>
<path d="M72 44C80 36 88 30 94 27" fill="none" stroke="${shade(a, .5)}" stroke-width="1" opacity=".6"/>
<path d="M95 25L106 58L111 59" fill="none" stroke-width="2.2"/>
<path d="M44 40C60 34 86 37 99 45C86 50 62 50 44 46Z" fill="${shade(b, .15)}" stroke-width="1.5"/>
<path d="M50 42C66 40 82 41 94 45M52 45C66 44 80 45 92 46" fill="none" stroke="${shade(b, .5)}" stroke-width=".8" opacity=".6"/>
<ellipse cx="42" cy="46" rx="10" ry="9" fill="url(#${I('f')})" stroke-width="1.6"/>
<circle cx="28" cy="46" r="10" fill="url(#${I('f')})" stroke-width="1.8"/>
<path d="M22 42C25 38 31 37 35 39" fill="none" stroke="#fff" stroke-width="1.2" opacity=".5"/></g>${eye(24, 44, 2.6, '#3a2a1a')}`;
  }

  function shrimp(c, I) {
    const b = c.body, a = c.accent, cx = 60, cy = 40, R = 21;
    const segs = [];
    for (let i = 0; i < 7; i++) {
      const t = (165 - i * 35) * Math.PI / 180, r = 13 - i * 1.1;
      segs.push([cx + R * Math.cos(t), cy - R * Math.sin(t), r, t]);
    }
    const legs = segs.slice(0, 5).map(([x, y, , t]) => `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l${(-Math.cos(t) * 15).toFixed(1)} ${(Math.sin(t) * 15).toFixed(1)}" stroke="${shade(a, -.2)}" stroke-width="1.4" stroke-linecap="round"/>`).join('');
    const [tx, ty] = segs[6];
    return `<defs>${rg(I('f'), [[0, shade(b, .55)], [.6, b], [1, shade(a, -.15)]], .4, .35, .65)}${shadow(I('s'))}</defs>
<g filter="url(#${I('s')})">${legs}
<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(-60)"><path d="M0 0L-12 10L-4 13ZM0 0L-2 15L4 15ZM0 0L8 13L13 6Z" fill="${shade(b, .2)}" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/></g>
${segs.slice().reverse().map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${I('f')})" stroke="${OL}" stroke-width="1.6"/>`).join('')}
<path d="M43 30C30 26 18 30 12 38C22 44 34 48 44 46Z" fill="url(#${I('f')})" stroke="${OL}" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M14 36L4 33" stroke="${OL}" stroke-width="1.8" stroke-linecap="round"/>
<path d="M14 38C6 30 6 14 20 6M16 38C4 40 2 56 8 66" stroke="${shade(a, -.3)}" stroke-width="1" fill="none"/>
<path d="M22 33C28 30 36 30 42 32" stroke="#fff" stroke-width="1.4" fill="none" opacity=".6" stroke-linecap="round"/>
${eye(20, 35, 2.6, '#2a1a12')}</g>`;
  }

  function strip(c, I) {
    const S = 'M16 34C40 28 64 40 88 34L110 26L99 40L112 52L88 46C64 52 40 42 16 48C12 44 12 38 16 34Z';
    const spots = [[30, 37], [42, 39], [54, 41], [66, 42], [78, 40], [36, 43], [60, 45], [72, 38]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1.4 : 2}" fill="${c.accent}" opacity=".6"/>`).join('');
    return `<defs>${lg(I('f'), [[0, shade(c.body, .5)], [.6, c.body], [1, shade(c.body, -.2)]])}${shadow(I('s'))}</defs>
<g filter="url(#${I('s')})"><path d="${S}" fill="url(#${I('f')})" stroke="${OL}" stroke-width="1.8" stroke-linejoin="round"/>${spots}
<path d="M20 36C40 31 62 41 86 36" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7" stroke-linecap="round"/>${hook1(22, 18, 0, 22, .9)}</g>`;
  }

  function kernel(c, I) {
    const K = 'M0-11C7-11 10-4 9 4C8 10-8 10-9 4C-10-4-7-11 0-11Z';
    const k = (x, y, a) => `<g transform="translate(${x} ${y}) rotate(${a})"><path d="${K}" fill="url(#${I('k')})" stroke="${OL}" stroke-width="1.6"/><path d="M-5 7C-2 9 2 9 5 7" stroke="${shade(c.body, .7)}" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="-3" cy="-5" rx="2.4" ry="3.4" fill="#fff" opacity=".55"/></g>`;
    return `<defs>${rg(I('k'), [[0, shade(c.body, .55)], [.6, c.body], [1, c.accent]], .4, .35, .7)}${shadow(I('s'))}</defs>
<g filter="url(#${I('s')})" transform="translate(4 0)">${hook1(54, 12, 0, 46, 1)}${k(46, 30, -20)}${k(62, 34, 25)}${k(48, 50, 5)}${k(66, 54, -35)}</g>`;
  }

  return {
    ui: (() => {
      const L = body => svg('0 0 24 24', `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</g>`);
      const cog = (() => { let d = ''; for (let i = 0; i < 16; i++) { const a = (i * 22.5 - 5.6) * Math.PI / 180, r = i % 2 ? 7 : 9.4, a2 = a + 11.25 * Math.PI / 180; d += `${i ? 'L' : 'M'}${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}L${(12 + r * Math.cos(a2)).toFixed(2)} ${(12 + r * Math.sin(a2)).toFixed(2)}`; } return d + 'Z'; })();
      const cloudD = 'M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 0 9Z';
      const I = ids();
      const tree = (x, b, h, w) => {
        let r = '', l = '';
        for (let i = 0; i < 3; i++) { const y = b - h * .18 - (2 - i) * h * .24, hw = w / 2 * (.55 + .225 * i); r += `L${(x + hw).toFixed(1)} ${y.toFixed(1)}L${(x + hw * .4).toFixed(1)} ${(y - h * .07).toFixed(1)}`; l = `L${(x - hw * .4).toFixed(1)} ${(y - h * .07).toFixed(1)}L${(x - hw).toFixed(1)} ${y.toFixed(1)}` + l; }
        const top = b - h, ty = b - h * .18;
        return `<rect x="${x - 2}" y="${ty - 2}" width="4" height="${h * .18 + 2}" fill="#5a3a22" stroke="${OL}" stroke-width="1.2"/><path d="M${x} ${top}${r.replace(/L[^L]*$/, '')}${l.replace(/^L[^L]*/, '')}Z" fill="url(#${I('t')})" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/>`;
      };
      const needles = []; for (let t = .08; t < .95; t += .055) { const x = 8 + 50 * t, y = 58 - 50 * t; needles.push(`M${x.toFixed(1)} ${y.toFixed(1)}l${(-3 + 12 * (1 - t * .3)).toFixed(1)} ${(-5 + 4).toFixed(1)}M${x.toFixed(1)} ${y.toFixed(1)}l${-5} ${(-11 * (1 - t * .3)).toFixed(1)}`); }
      return {
        hook: L('<circle cx="15" cy="3.6" r="1.7"/><path d="M15 5.3V15a5 5 0 0 1-10 0v-3l3 2.6"/>'),
        gear: L(`<path d="${cog}"/><circle cx="12" cy="12" r="2.8"/>`),
        book: L('<path d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5ZM12 6.5V19"/>'),
        close: L('<path d="M6 6l12 12M18 6L6 18"/>'),
        cast: L('<path d="M3 21L13 7"/><path d="M13 7c4-2 7 .5 6.5 4.5"/><path d="M19.5 11.5V16a2.2 2.2 0 0 1-4.4 0"/><path d="M11 9.5l2-2.5"/>'),
        reel: L('<circle cx="11" cy="13" r="5.5"/><circle cx="11" cy="13" r="1.4"/><path d="M11 7.5V4h6"/><path d="M15 16.5l4 3"/>'),
        bite: L('<path d="M12 5v4"/><path d="M8.5 9h7l-1.2 4.5a2.5 2.5 0 0 1-4.6 0Z"/><path d="M3 17c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0"/><path d="M5 21c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0"/>'),
        chevron: L('<path d="M9 5l7 7-7 7"/>'),
        wrench: L('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8Z"/>'),
        moon: L('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'),
        sun: L('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>'),
        cloud: L(`<path d="${cloudD}"/>`),
        rain: L(`<path d="${cloudD}" transform="translate(0 -4)"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>`),
        windArrow: L('<path d="M12 20.5V4M6 10l6-6 6 6"/>'),
        compass: svg('0 0 24 24', '<path d="M9 10V2.5l6 7.5V2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 12.5l-3.6 9 3.6-2.6 3.6 2.6Z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'),
        pines: svg('0 0 64 48', `<defs>${lg(I('t'), [[0, '#5f8a4c'], [.5, '#33583a'], [1, '#1c3424']], 1, 0)}${shadow(I('s'))}</defs><ellipse cx="32" cy="44" rx="28" ry="3" fill="#1c3424" opacity=".45"/><g filter="url(#${I('s')})">${tree(15, 44, 30, 20)}${tree(49, 44, 32, 21)}${tree(32, 45, 42, 27)}</g>`),
        sprig: svg('0 0 64 64', `<defs>${rg(I('c'), [[0, '#b07a48'], [.6, '#7a4a26'], [1, '#4a2a16']], .4, .35, .7)}${shadow(I('s'))}</defs><g filter="url(#${I('s')})" stroke-linecap="round">
<path d="M6 60L60 6" stroke="${OL}" stroke-width="4"/><path d="M6 60L60 6" stroke="#7a4e2c" stroke-width="2.2"/>
<path d="${needles.join('')}" stroke="#1f3a26" stroke-width="2.4" fill="none"/><path d="${needles.join('')}" stroke="#4f7d48" stroke-width="1.2" fill="none" transform="translate(.4 -.4)"/>
<path d="M27 39L24 44" stroke="#5a3a22" stroke-width="2"/>
<g transform="rotate(25 20 50)"><ellipse cx="20" cy="50" rx="9.5" ry="13" fill="url(#${I('c')})" stroke="${OL}" stroke-width="1.6"/>
<path d="M13 45q3.5 3 7 0q3.5 3 7 0M12.5 50q3.75 3 7.5 0q3.75 3 7.5 0M13 55q3.5 3 7 0q3.5 3 7 0M15 59.5q2.5 2 5 0q2.5 2 5 0" stroke="#3a2010" stroke-width="1.1" fill="none"/>
<path d="M16 43q2-2 4-1.5" stroke="#e0b080" stroke-width="1" fill="none" opacity=".7"/></g></g>`),
        search: L('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3L20.5 20.5"/>'),
        waves: L('<path d="M2.5 7.5c2-1.6 3.8-1.6 5.8 0s3.8 1.6 5.8 0 3.8-1.6 5.8 0M2.5 12.5c2-1.6 3.8-1.6 5.8 0s3.8 1.6 5.8 0 3.8-1.6 5.8 0M2.5 17.5c2-1.6 3.8-1.6 5.8 0s3.8 1.6 5.8 0 3.8-1.6 5.8 0"/>'),
        fish: L('<path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/>'),
        wild1: svg('0 0 36 24', '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(6 0)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><path d="M3 21c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0 4 1.4 6 0" opacity=".5"/></g>'),
        wild2: svg('0 0 36 24', '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(1 -1) scale(.72)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><g transform="translate(16 7) scale(.72)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><path d="M3 22c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0 4 1.4 6 0" opacity=".5"/></g>'),
        wild3: svg('0 0 36 24', '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(0 0) scale(.55)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><g transform="translate(14 -1) scale(.55)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><g transform="translate(5 8) scale(.55)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><g transform="translate(20 8) scale(.55)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><path d="M3 22c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0 4 1.4 6 0" opacity=".5"/></g>'),
        heron: L('<path d="M2.5 5.4L8 4.6"/><circle cx="9.4" cy="4.8" r="1.4" fill="currentColor"/><path d="M10.4 5.8C11.2 7.4 9.6 9 9.4 10.6 9.2 12 10 12.8 11 13"/><path d="M11 13c1.6-1.4 5-1.6 7.2-.2l2.6 2.4c-2.6.6-5.4.6-7.8-.4-1-.4-1.6-1-2-1.8Z"/><path d="M14.4 15.6l-1 6.4M16.4 15.6l1.2 6.4M12 22h2.6M16.4 22h2.6"/>'),
        check: svg('0 0 24 24', '<path d="M4.5 12.5l5 5L19.5 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
        reeds: svg('0 0 48 64', '<g fill="none" stroke="currentColor" stroke-linecap="round" opacity=".55"><path d="M10 64C10 46 8 30 3 16" stroke-width="1.6"/><path d="M19 64C19 44 21 26 26 10" stroke-width="1.8"/><path d="M30 64C30 50 34 38 44 28" stroke-width="1.4"/><path d="M14 64C16 52 22 44 31 40C25 48 21 55 20 64Z" fill="currentColor" stroke-width=".8"/><path d="M38 64C37 56 39 50 45 44" stroke-width="1.2"/></g><rect x="23.6" y="4" width="5" height="13" rx="2.5" transform="rotate(14 26 10)" fill="currentColor" opacity=".55"/>'),
      };
    })(),

    dock: (() => {
      const I = ids();
      const S = ids();
      const boatArt = (J, tf = '', defs = '', back = '', front = '') => svg('0 0 96 72', `<defs>${lg(J('w'), [[0, '#e0965a'], [.5, '#b8642e'], [1, '#7a3c1a']])}${lg(J('i'), [[0, '#5a3016'], [1, '#8a4e26']])}${lg(J('h2o'), [[0, '#6aa8c8'], [1, '#2a5a7a']])}${shadow(J('s'))}${defs}</defs>
<ellipse cx="48" cy="58" rx="45" ry="10" fill="url(#${J('h2o')})" opacity=".9"/>${back}<g filter="url(#${J('s')})" stroke-linejoin="round" stroke-linecap="round" transform="${tf}">
<path d="M58 14L36 50" stroke="${OL}" stroke-width="4"/><path d="M58 14L36 50" stroke="#c88a50" stroke-width="2"/>
<path d="M6 32C30 27 64 24 90 24C66 36 30 38 6 32Z" fill="url(#${J('i')})" stroke="${OL}" stroke-width="1.6"/>
<path d="M30 33L34 29M56 31L58 27" stroke="#3a1e0c" stroke-width="2.4"/>
<path d="M6 32C30 38 64 37 90 24C86 42 76 53 58 56H30C16 54 9 45 6 32Z" fill="url(#${J('w')})" stroke="${OL}" stroke-width="2"/>
<path d="M9 40C32 45 64 43 86 34M14 48C34 51 62 50 80 43" fill="none" stroke="#6a3416" stroke-width="1.2" opacity=".7"/>
<path d="M8 34C30 39 62 38 88 27" fill="none" stroke="#f4c08a" stroke-width="1.4" opacity=".7"/>
<path d="M36 50L30 60L35 62L40 52Z" fill="#c88a50" stroke="${OL}" stroke-width="1.4"/></g>
<path d="M10 56C20 53 30 59 40 56S60 53 70 56S84 59 90 56C88 64 70 68 48 68S8 64 10 56Z" fill="#3f7a9a" opacity=".85"/>
<path d="M16 60C24 58 30 61 38 59M56 61C64 59 70 62 78 60" fill="none" stroke="#cfe8f4" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>${front}`);
      const cattail = (x, b, h, lean) => `<path d="M${x} ${b}Q${x} ${b - h * .6} ${x + lean} ${b - h}" fill="none" stroke="#4e6a32" stroke-width="1.6" stroke-linecap="round"/><rect x="${x + lean * .75 - 2.2}" y="${b - h * .82 - 6}" width="4.4" height="12" rx="2.2" transform="rotate(${lean * 2} ${x + lean * .75} ${b - h * .82})" fill="url(#${S('ct')})" stroke="${OL}" stroke-width="1.2"/>`;
      const lures = (x, y, n, w) => { const cs = ['#d84a2a', '#e8c040', '#4a8ac0', '#f08a30', '#c0d8a0', '#b04a8a']; let s = ''; for (let i = 0; i < n; i++) { const cx = x + w / n * (i + .5); s += `<ellipse cx="${cx.toFixed(1)}" cy="${y}" rx="${(w / n * .32).toFixed(1)}" ry="2.6" transform="rotate(${i % 2 ? -18 : 14} ${cx.toFixed(1)} ${y})" fill="${cs[(i + n) % cs.length]}" stroke="${OL}" stroke-width=".9"/><circle cx="${(cx - w / n * .16).toFixed(1)}" cy="${y - .4}" r=".7" fill="${OL}"/>`; } return s; };
      const tray = (x, y, w, n) => `<rect x="${x}" y="${y}" width="${w}" height="9" rx="1.5" fill="#173022" stroke="${OL}" stroke-width="1.4"/>${lures(x + 1, y + 4.6, n, w - 2)}<rect x="${x}" y="${y + 6}" width="${w}" height="6.5" rx="1.5" fill="url(#${I('g')})" stroke="${OL}" stroke-width="1.6"/>${Array.from({ length: n - 1 }, (_, i) => `<path d="M${(x + w / n * (i + 1)).toFixed(1)} ${y + 1}v5" stroke="#3f6a46" stroke-width="1"/>`).join('')}<path d="M${x + 2} ${y + 7.6}H${x + w - 2}" stroke="#a8d090" stroke-width="1" opacity=".5"/>`;
      const fern = []; for (let i = 0; i < 7; i++) { const t = i / 7, x = 70 - t * 4 + t * t * 6, y = 52 - t * 30, l = 7 - i * .7; fern.push(`<ellipse cx="${(x - l * .7).toFixed(1)}" cy="${(y - 1).toFixed(1)}" rx="${(l * .6).toFixed(1)}" ry="1.6" transform="rotate(-25 ${(x - l * .7).toFixed(1)} ${(y - 1).toFixed(1)})"/><ellipse cx="${(x + l * .7).toFixed(1)}" cy="${(y - 1).toFixed(1)}" rx="${(l * .6).toFixed(1)}" ry="1.6" transform="rotate(25 ${(x + l * .7).toFixed(1)} ${(y - 1).toFixed(1)})"/>`); }
      const R = ids(), M = ids();
      const pine = (x, b, h) => `<path d="M${x} ${b - h}L${x + h * .42} ${b - h * .2}H${x - h * .42}Z" fill="#4e7a3a" stroke="${OL}" stroke-width="1.1"/><path d="M${x} ${b - h * .2}V${b}" stroke="${OL}" stroke-width="1.4"/>`;
      return {
        rod: svg('0 0 96 72', `<defs>${lg(R('k'), [[0, '#f0d29a'], [.5, '#c8945a'], [1, '#8a5a30']])}${lg(R('b'), [[0, '#6a8ab0'], [.45, '#2c4a70'], [1, '#14243a']])}${lg(R('r'), [[0, '#d8dde2'], [.5, '#8a929a'], [1, '#4a5056']])}${shadow(R('s'))}</defs>
<ellipse cx="78" cy="62" rx="12" ry="3" fill="#6aa8c8" opacity=".5"/><path d="M70 62C74 60 82 60 86 62" fill="none" stroke="#cfe8f4" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>
<path d="M80.5 12V52" stroke="#eef1f4" stroke-width=".9" opacity=".9"/>
<g filter="url(#${R('s')})" stroke-linejoin="round" stroke-linecap="round"><g transform="translate(6 64) rotate(-35) scale(1.05 1.35)">
<path d="M44-2.4L87-.7V.7L44 2.4Z" fill="url(#${R('b')})" stroke="${OL}" stroke-width="1.4"/>
${[[54, 4.2, 2.2], [68, 3.2, 1.7], [80, 2.4, 1.3]].map(([x, h, r]) => `<path d="M${x} 1.5L${x} ${h + 1}" stroke="${OL}" stroke-width="1.6"/><circle cx="${x}" cy="${h + 1 + r}" r="${r}" fill="none" stroke="${OL}" stroke-width="1.5"/><circle cx="${x}" cy="${h + 1 + r}" r="${r}" fill="none" stroke="#c8cdd2" stroke-width=".6"/>`).join('')}
<path d="M30 9L54 ${4.2 + 1 + 2.2}" stroke="#eef1f4" stroke-width=".6" opacity=".8"/>
<rect x="-1" y="-4.2" width="5" height="8.4" rx="2" fill="#3a2a1e" stroke="${OL}" stroke-width="1.5"/>
<rect x="4" y="-4" width="22" height="8" rx="3" fill="url(#${R('k')})" stroke="${OL}" stroke-width="1.6"/>
<rect x="26" y="-3" width="10" height="6" rx="1" fill="url(#${R('r')})" stroke="${OL}" stroke-width="1.4"/>
<rect x="36" y="-3.2" width="9" height="6.4" rx="2.4" fill="url(#${R('k')})" stroke="${OL}" stroke-width="1.5"/>
<path d="M7-2H23M38-1.8H43" stroke="#fff" stroke-width="1" opacity=".45"/>
<g fill="#7a5228" opacity=".5"><circle cx="9" cy="1" r=".6"/><circle cx="14" cy="-.6" r=".6"/><circle cx="19" cy="1.4" r=".6"/><circle cx="23" cy="-1" r=".5"/><circle cx="40" cy="1" r=".5"/></g>
<path d="M31 3V7" stroke="${OL}" stroke-width="3.4"/><path d="M31 3V7" stroke="#9aa0a6" stroke-width="1.6"/>
<path d="M23 8H37L36 15H24Z" fill="url(#${R('r')})" stroke="${OL}" stroke-width="1.6"/><rect x="25" y="15" width="10" height="4" rx="1.2" fill="#b83a2a" stroke="${OL}" stroke-width="1.3"/>
<path d="M25 10.5H35" stroke="#fff" stroke-width="1" opacity=".55"/>
<path d="M23 12L18 13L17 18" fill="none" stroke="${OL}" stroke-width="2.6"/><path d="M23 12L18 13L17 18" fill="none" stroke="#c8cdd2" stroke-width="1.1"/><ellipse cx="17" cy="19.5" rx="2" ry="2.6" fill="#3a2a1e" stroke="${OL}" stroke-width="1.1"/></g>
<g transform="translate(80.5 54) scale(1.15)"><path d="M0-12V-6" stroke="${OL}" stroke-width="2.6"/><path d="M0-12V-6" stroke="#f4f4f0" stroke-width="1.2"/>
<path d="M-6 0A6 6 0 0 1 6 0Z" fill="#e8322a" stroke="${OL}" stroke-width="1.6"/><path d="M-6 0A6 6 0 0 0 6 0Z" fill="#f4f4f0" stroke="${OL}" stroke-width="1.6"/><path d="M-6 0H6" stroke="${OL}" stroke-width="1"/><ellipse cx="-2.4" cy="-3" rx="1.8" ry="1" transform="rotate(-30 -2.4 -3)" fill="#fff" opacity=".75"/></g></g>`),
        // a folded trail map: aged parchment in three panels (the middle one in the fold's shadow), a deep blue lake
        // fed by a winding river, woods, a dashed trail looping the shore, a compass rose and a red X
        torch: (() => { const T = ids(); return svg('0 0 96 72', `<defs>${lg(T('b'), [[0, '#ffe066'], [.5, '#f2b632'], [1, '#a86d12']])}${lg(T('g'), [[0, '#3a3a40'], [1, '#121216']])}${lg(T('beam'), [[0, '#fff6c0', .85], [1, '#fff6c0', 0]], 1, 0)}${shadow(T('s'))}</defs>
<path d="M60 26L96 8V64L60 46Z" fill="url(#${T('beam')})"/>
<g filter="url(#${T('s')})"><rect x="6" y="28" width="26" height="16" rx="6" fill="url(#${T('g')})" stroke="${OL}" stroke-width="2"/>
<path d="M30 24H50C56 24 58 27 58 30V42C58 45 56 48 50 48H30Z" fill="url(#${T('b')})" stroke="${OL}" stroke-width="2"/>
<path d="M34 28H48" stroke="#fff5c8" stroke-width="2" stroke-linecap="round" opacity=".7"/><path d="M14 33H24" stroke="#8a8a94" stroke-width="2" stroke-linecap="round" opacity=".8"/>
<ellipse cx="59" cy="36" rx="4" ry="12" fill="#d9f2ff" stroke="${OL}" stroke-width="2"/><ellipse cx="59" cy="36" rx="1.6" ry="6" fill="#fff"/></g>`); })(),
        map: svg('0 0 96 72', `<defs>${lg(M('p1'), [[0, '#f3e4bf'], [1, '#dcc290']], 1, 1)}${lg(M('p2'), [[0, '#d9c08c'], [1, '#b99c66']], 1, 0)}${lg(M('p3'), [[0, '#fbf1d6'], [1, '#e6d2a2']], 1, 1)}
${rg(M('w'), [[0, '#9fd6ee'], [.55, '#4a92c0'], [1, '#235a86']], .42, .4, .62)}${rg(M('age'), [[0, '#fff', 0], [.7, '#8a5a24', 0], [1, '#6a4014', .45]], .5, .5, .72)}
<clipPath id="${M('c')}"><path d="M5 17L34 10L62 17L91 10V59L62 66L34 59L5 66Z"/></clipPath>${shadow(M('s'))}</defs>
<ellipse cx="48" cy="67" rx="43" ry="4" fill="#000" opacity=".3"/><g filter="url(#${M('s')})" stroke-linejoin="round" stroke-linecap="round">
<path d="M5 17L34 10V59L5 66Z" fill="url(#${M('p1')})"/><path d="M34 10L62 17V66L34 59Z" fill="url(#${M('p2')})"/><path d="M62 17L91 10V59L62 66Z" fill="url(#${M('p3')})"/>
<g clip-path="url(#${M('c')})">
<path d="M3 44C10 38 20 40 24 48C28 56 18 66 3 66Z" fill="#6f9a4c" opacity=".55"/><path d="M93 12C84 12 74 16 76 24C78 30 88 30 93 28Z" fill="#6f9a4c" opacity=".55"/>
<path d="M66 50C72 46 84 47 92 52V62H64Z" fill="#6f9a4c" opacity=".5"/>
<path d="M93 46C86 44 82 50 76 46C70 42 62 50 52 46" fill="none" stroke="#2c5a7e" stroke-width="3"/><path d="M93 46C86 44 82 50 76 46C70 42 62 50 52 46" fill="none" stroke="#6fb4dc" stroke-width="1.6"/>
<path d="M30 46C30 41 34 37 40 37C47 37 52 40 52 45C52 50 46 53 40 53C34 53 30 51 30 46Z" fill="#e8d49a" stroke="#c9ad6a" stroke-width="2.6"/>
<path d="M30 46C30 41 34 37 40 37C47 37 52 40 52 45C52 50 46 53 40 53C34 53 30 51 30 46Z" fill="url(#${M('w')})" stroke="#1f4766" stroke-width="1.4"/>
<path d="M34 42C36 40 40 39 43 39.5" fill="none" stroke="#f2fbff" stroke-width="1.3" opacity=".85"/>
<path d="M66 40C66 37 69 35 72 35C75 35 77 37 77 39.5C77 42 74 44 71 44C68 44 66 42.5 66 40Z" fill="url(#${M('w')})" stroke="#1f4766" stroke-width="1.2"/>
<path d="M40 23L45 15L50 23Z" fill="#b8a07a" stroke="#6a4a2a" stroke-width="1"/><path d="M47 23L53 13L59 23Z" fill="#c8b08a" stroke="#6a4a2a" stroke-width="1"/><path d="M51.6 15.6L53 13L54.6 15.8Z" fill="#fff"/>
<path d="M22 30C28 26 36 27 40 31M60 46C64 50 70 52 76 50M44 58C50 60 56 60 60 57" fill="none" stroke="#a88a5a" stroke-width=".8" opacity=".7"/>
<path d="M20 36C24 33 30 33 33 36" fill="none" stroke="#a88a5a" stroke-width=".8" opacity=".6"/>
<path d="M14 60C18 50 22 44 28 42M53 47C58 44 62 42 66 41M77 41C82 36 82 30 76 26C70 22 60 24 52 24M40 37C40 32 36 30 30 32" fill="none" stroke="#fff5dc" stroke-width="3" opacity=".45"/>
<path d="M14 60C18 50 22 44 28 42M53 47C58 44 62 42 66 41M77 41C82 36 82 30 76 26C70 22 60 24 52 24M40 37C40 32 36 30 30 32" fill="none" stroke="#7a3a14" stroke-width="1.8" stroke-dasharray="2.8 2.2"/>
${pine(12, 48, 9)}${pine(19, 52, 7)}${pine(24, 22, 7)}${pine(83, 22, 8)}${pine(78, 52, 9)}${pine(86, 56, 7)}${pine(60, 34, 6)}
<g transform="translate(14 26)"><circle r="6" fill="#f6ead0" stroke="#5a3a1c" stroke-width="1.1"/><path d="M0 -5L1.6 0L0 5L-1.6 0Z" fill="#5a3a1c"/><path d="M0 -5L1.6 0H-1.6Z" fill="#c8322a"/><path d="M-5 0L0 1.3L5 0L0 -1.3Z" fill="#8a6a44" opacity=".8"/></g>
<path d="M80 26L85 31M85 26L80 31" stroke="${OL}" stroke-width="4"/><path d="M80 26L85 31M85 26L80 31" stroke="#e03a28" stroke-width="2.4"/>
<rect x="0" y="0" width="96" height="72" fill="url(#${M('age')})"/>
<path d="M34 10L62 17V66L34 59Z" fill="#3a2410" opacity=".1"/>
</g>
<path d="M34 10V59" stroke="#fff6dc" stroke-width="1.4" opacity=".7"/><path d="M62 17V66" stroke="#4a3018" stroke-width="1.4" opacity=".55"/>
<path d="M5 17L34 10L62 17L91 10V59L62 66L34 59L5 66Z" fill="none" stroke="${OL}" stroke-width="2.3"/>
<path d="M8 19L32 13.5M64 19L88 13.5" stroke="#fff" stroke-width="1.2" opacity=".55"/></g>`),
        tackleBox: svg('0 0 96 72', `<defs>${lg(I('g'), [[0, '#78a65c'], [.45, '#4c7a44'], [1, '#26442c']])}${lg(I('l'), [[0, '#2e5236'], [1, '#1c3424']])}${lg(I('b'), [[0, '#6e9a54'], [.4, '#467340'], [1, '#22402a']])}${shadow(I('s'))}</defs>
<ellipse cx="48" cy="66" rx="40" ry="4" fill="#000" opacity=".25"/><g filter="url(#${I('s')})" stroke-linejoin="round">
<path d="M40 7C40 2 56 2 56 7" fill="none" stroke="${OL}" stroke-width="3.4"/><path d="M40 7C40 2 56 2 56 7" fill="none" stroke="#9aa0a6" stroke-width="1.6"/>
<path d="M18 40L23 7H73L78 40Z" fill="url(#${I('l')})" stroke="${OL}" stroke-width="2"/><path d="M24 36L27 11H69L72 36Z" fill="#14281a" opacity=".6"/>
<path d="M22 42L14 30M74 42L82 28" stroke="#8a9096" stroke-width="2" stroke-linecap="round"/>
${tray(4, 26, 42, 4)}${tray(50, 22, 42, 4)}${tray(24, 34, 48, 5)}
<rect x="16" y="44" width="64" height="22" rx="3" fill="url(#${I('b')})" stroke="${OL}" stroke-width="2"/>
<path d="M19 48H77" stroke="#b8e09a" stroke-width="1.2" opacity=".45" stroke-linecap="round"/><path d="M16 52H80" stroke="${OL}" stroke-width="1" opacity=".4"/>
<rect x="43" y="47" width="10" height="9" rx="1.5" fill="#d8b04a" stroke="${OL}" stroke-width="1.4"/><circle cx="48" cy="51.5" r="1.4" fill="${OL}"/>
<circle cx="21" cy="61" r="1.2" fill="#c0c8b0"/><circle cx="75" cy="61" r="1.2" fill="#c0c8b0"/></g>`),
        journal: svg('0 0 96 72', `<defs>${lg(I('pl'), [[0, '#f6eed6'], [.75, '#eadbb4'], [1, '#c9b48a']], 1, 0)}${lg(I('pr'), [[0, '#c9b48a'], [.25, '#eadbb4'], [1, '#f6eed6']], 1, 0)}${lg(I('c'), [[0, '#7a4a2a'], [1, '#4a2a16']])}${shadow(I('s'))}</defs>
<ellipse cx="48" cy="66" rx="42" ry="4" fill="#000" opacity=".25"/><g filter="url(#${I('s')})" stroke-linejoin="round">
<path d="M4 20C22 13 38 14 48 20C58 14 74 13 92 20V63C74 57 58 58 48 64C38 58 22 57 4 63Z" fill="url(#${I('c')})" stroke="${OL}" stroke-width="2"/>
<path d="M8 16C24 10 38 11 48 18V59C38 53 24 52 8 57Z" fill="url(#${I('pl')})" stroke="${OL}" stroke-width="1.6"/>
<path d="M88 16C72 10 58 11 48 18V59C58 53 72 52 88 57Z" fill="url(#${I('pr')})" stroke="${OL}" stroke-width="1.6"/>
<path d="M14 24C24 21 34 21 42 25M14 30C24 27 34 27 42 31M14 36C24 33 34 33 42 37M14 42C22 39 30 39 36 42" fill="none" stroke="#8a7458" stroke-width="1.2" stroke-linecap="round" opacity=".75"/>
<path d="M70 54C66 44 66 32 72 20" fill="none" stroke="#4e6a32" stroke-width="1.4" stroke-linecap="round"/><g fill="#6a8a44" stroke="#3e5a2a" stroke-width=".5" opacity=".95">${fern.join('')}</g>
<path d="M50 18V66L53 62L56 66V20" fill="#b83a2a" stroke="${OL}" stroke-width="1.2"/></g>`),
        boat: boatArt(I),
        // a small island in a blue sea: sand, a grassy hump and two pines
        island: (() => { const P = ids(); return svg('0 0 96 72', `<defs>${rg(P('w'), [[0, '#8fd0ee'], [.6, '#3f88b8'], [1, '#1d4f7c']], .5, .55, .6)}${lg(P('g'), [[0, '#8cc45e'], [1, '#3d6e34']])}${shadow(P('s'))}</defs>
<ellipse cx="48" cy="44" rx="44" ry="22" fill="url(#${P('w')})" stroke="${OL}" stroke-width="2"/><path d="M12 48C22 46 30 50 40 48M58 54C66 52 76 56 86 52" fill="none" stroke="#dff3ff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>
<g filter="url(#${P('s')})"><path d="M18 46C24 36 36 32 48 34C62 36 74 36 80 46C72 52 24 52 18 46Z" fill="#e8d6a2" stroke="${OL}" stroke-width="1.8"/>
<path d="M26 44C32 34 44 30 54 33C64 36 70 40 72 44C62 48 36 48 26 44Z" fill="url(#${P('g')})" stroke="${OL}" stroke-width="1.4"/>${pine(40, 36, 20)}${pine(56, 38, 15)}</g>`); })(),
        // a trail map held by a red pushpin
        pin: (() => { const P = ids(); return svg('0 0 96 72', `<defs>${lg(P('p'), [[0, '#f6e8c4'], [1, '#d9c08c']], 1, 1)}${rg(P('l'), [[0, '#9fd6ee'], [.6, '#4a92c0'], [1, '#235a86']], .45, .4, .6)}${lg(P('h'), [[0, '#ff7a6a'], [1, '#b8261c']])}${shadow(P('s'))}</defs>
<g filter="url(#${P('s')})"><path d="M14 14L82 10L84 60L16 64Z" fill="url(#${P('p')})" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>
<path d="M30 38C30 30 40 26 50 30C60 34 64 42 56 48C46 54 30 48 30 38Z" fill="url(#${P('l')})" stroke="${OL}" stroke-width="1.2"/><path d="M22 54C32 50 40 52 50 50C60 48 68 44 78 44" fill="none" stroke="#b8503a" stroke-width="1.4" stroke-dasharray="3 2.5"/>
${pine(68, 30, 10)}${pine(24, 26, 9)}<path d="M48 12V32" stroke="${OL}" stroke-width="3"/><path d="M48 12V32" stroke="#c0c8b0" stroke-width="1.2"/>
<path d="M39 10H57L54 3H42Z" fill="url(#${P('h')})" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="48" cy="10" rx="9" ry="2.4" fill="#e04a3a" stroke="${OL}" stroke-width="1.2"/></g>`); })(),
        spawn: boatArt(S, 'translate(4 13) scale(.72)', lg(S('ct'), [[0, '#9a5a2e'], [.5, '#6a3a1c'], [1, '#3e200e']], 1, 0),
          `<g>${cattail(78, 60, 40, 3)}${cattail(86, 62, 30, 4)}</g><path d="M71 62C72 50 74 42 70 30M92 62C92 52 94 46 96 40" fill="none" stroke="#6a8a44" stroke-width="1.6" stroke-linecap="round"/>`,
          `${cattail(73, 63, 30, -2)}<path d="M77 63C77 56 79 50 83 46" fill="none" stroke="#6a8a44" stroke-width="1.6" stroke-linecap="round"/>`),
      };
    })(),

    lure(style, colors) {
      const c = colors || {}, k = {}, I = ids();
      for (const n in LURE_DEF) k[n] = col(c[n], LURE_DEF[n]);
      const f = { crankbait: () => minnowLure(k, I, true), spoon: () => spoonLure(k, I), spinner: () => spinnerLure(k, I), jig: () => jigLure(k, I), soft_plastic: () => softPlastic(k, I), popper: () => popperLure(k, I), skirt: () => skirtLure(k, I) }[style];
      return svg('0 0 120 80', f ? f() : minnowLure(k, I, false));
    },

    bait(shape, colors) {
      const c = colors || {}, I = ids();
      const D = { worm: ['#9a5650', '#6a3436'], minnow: ['#c8ccc4', '#5a6a5a'], cricket: ['#4a3624', '#7a5432'], shrimp: ['#e9a58a', '#c0604a'], strip: ['#f0e4da', '#9a4a7a'], kernel: ['#f4d040', '#e0b020'] };
      const fn = { worm, minnow, cricket, shrimp, strip, kernel }[shape] || worm;
      const d = D[shape] || D.worm;
      return svg('0 0 120 80', fn({ body: col(c.body, d[0]), accent: col(c.accent, d[1]) }, I));
    },

    float(kind, colors) {
      const c = colors || {}, I = ids();
      if (kind === 'slip') {
        const t = col(c.top, '#f08020'), b = col(c.bottom, '#2f4a3a');
        const cyl = (id, k) => lg(id, [[0, shade(k, -.35)], [.35, shade(k, .45)], [1, shade(k, -.5)]], 1, 0);
        return svg('0 0 80 80', `<defs>${cyl(I('t'), t)}${cyl(I('b'), b)}${shadow(I('s'))}</defs><g filter="url(#${I('s')})" transform="rotate(18 40 40)">${metal('M40 69V75')}${ring(40, 76.5, 1.8)}
<path d="M40 22C47 30 48 48 44 62L40 70L36 62C32 48 33 30 40 22Z" fill="url(#${I('b')})" stroke="${OL}" stroke-width="1.8" stroke-linejoin="round"/>
<rect x="37" y="4" width="6" height="22" rx="3" fill="url(#${I('t')})" stroke="${OL}" stroke-width="1.6"/>
<rect x="36.5" y="23" width="7" height="3" rx="1" fill="#d8b04a" stroke="${OL}" stroke-width="1"/><path d="M38.6 7V20M37.6 32C37 40 37 50 38.4 58" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".6"/></g>`);
      }
      const t = col(c.top, '#e8322a'), b = col(c.bottom, '#f4f4f0');
      return svg('0 0 80 80', `<defs>${rg(I('h'), [[0, '#fff', .7], [.35, '#fff', 0], [.75, '#000', 0], [1, '#000', .4]], .36, .3, .72)}<clipPath id="${I('c')}"><circle cx="40" cy="44" r="23"/></clipPath>${shadow(I('s'))}</defs>
<g filter="url(#${I('s')})">${metal('M40 66V73')}${ring(40, 74.6, 1.8)}
<rect x="36.5" y="10" width="7" height="12" rx="2" fill="${shade(t, -.25)}" stroke="${OL}" stroke-width="1.6"/><rect x="34" y="8" width="12" height="4" rx="2" fill="${shade(t, .1)}" stroke="${OL}" stroke-width="1.4"/>
<g clip-path="url(#${I('c')})"><rect x="0" y="0" width="80" height="44" fill="${t}"/><rect x="0" y="44" width="80" height="40" fill="${b}"/><path d="M14 43C24 49 56 49 66 43V46C56 52 24 52 14 46Z" fill="${shade(b, -.35)}" opacity=".6"/><circle cx="40" cy="44" r="23" fill="url(#${I('h')})"/></g>
<circle cx="40" cy="44" r="23" fill="none" stroke="${OL}" stroke-width="2"/><ellipse cx="31" cy="33" rx="6" ry="3.5" transform="rotate(-35 31 33)" fill="#fff" opacity=".7"/></g>`);
    },
  };
})();
