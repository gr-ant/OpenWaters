'use strict';
// UI_ICONS.lure / .bait / .float — painted tackle pictures (lures and baits 120x80, floats 80x80).
(() => {
  const { OL, ids, svg, col, shade, lg, rg, shadow, gloss, metal, ring, treble, hook1, eye } = ICON_KIT;

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

  Object.assign(UI_ICONS, {
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
  });
})();
