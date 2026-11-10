'use strict';
// UI_ICONS.ui — 24x24 currentColor line icons for menus and the HUD (pines/sprig/reeds are decorative).
UI_ICONS.ui = (() => {
  const { OL, ids, svg, lg, rg, shadow } = ICON_KIT;
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
    pad: L('<path d="M7 7h10a4.5 4.5 0 0 1 4.4 5.4l-.9 4.4a2.4 2.4 0 0 1-4.1 1.1L14 15.5h-4l-2.4 2.4a2.4 2.4 0 0 1-4.1-1.1l-.9-4.4A4.5 4.5 0 0 1 7 7Z"/><path d="M8 10v3M6.5 11.5h3"/><circle cx="15.5" cy="10.8" r=".5" fill="currentColor"/><circle cx="17" cy="12.6" r=".5" fill="currentColor"/>'),
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
    // biomes and habitats (spawn filters)
    globe: L('<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M4.5 7.5h15M4.5 16.5h15"/>'),
    pine: L('<path d="M12 3L8 8h2.5L7 13h3l-4 5h12l-4-5h3l-3.5-5H16Z"/><path d="M12 18v3"/>'),
    peaks: L('<path d="M2.5 19l6-10 3.5 5 3-4 6.5 9"/><path d="M6.6 12.2l1.9 1 1.4-1.6"/>'),
    palm: L('<path d="M12 21c0-4.5.4-8.5 1-12"/><path d="M13 9C11 6 8 5.5 4.5 7c3 0 5.5 1 8.5 2Z"/><path d="M13 9c2-3 5-3.5 8.5-2-3 0-5.5 1-8.5 2Z"/><path d="M13 9c-.6-3 .4-5 2.4-6.5M13 9c-3-.6-5.6 1.2-6.8 4.2M13 9c3-.3 5.4 1.6 6 4.6"/>'),
    shell: L('<path d="M12 20L4 10a8 8 0 0 1 16 0Z"/><path d="M12 20L8 5.5M12 20V4.5M12 20l4-14.5"/><path d="M10 20h4v1.5h-4Z"/>'),
    jelly: L('<path d="M4 12a8 7 0 0 1 16 0Z"/><path d="M7 12c0 3-1 5 0 8M10.5 12c0 3 1 5 0 8M13.5 12c0 3-1 5 0 8M17 12c0 3 1 5 0 8"/>'),
    whale: L('<path d="M2.5 13C2.5 9.5 5.5 7.5 10 7.5c4.5 0 7 3 8.8 5.1L20.5 9l1 4.5 1 1.5-3.5-.4C16.5 17 13 18 9.5 18 5 18 2.5 16 2.5 13Z"/><path d="M3 14.2h4.5M9.5 16.5l1.5 2.5M8 5.5c0-1.5-1-2.5-2-3M8 5.5c0-1.5 1-2.5 2-3"/><circle cx="6" cy="11.6" r=".5" fill="currentColor"/>'),
    frog: L('<circle cx="8.5" cy="7.5" r="2.2"/><circle cx="15.5" cy="7.5" r="2.2"/><path d="M6.5 9.5C4.5 11 4 14 6 16.5c3.5 2 8.5 2 12 0 2-2.5 1.5-5.5-.5-7"/><path d="M9.5 13c1.5 1 3.5 1 5 0"/><path d="M6 16.5L3 19.5M18 16.5l3 3"/>'),
    infinity: L('<path d="M12 12c-2-3-4-4.5-6-4.5a4.5 4.5 0 0 0 0 9c2 0 4-1.5 6-4.5s4-4.5 6-4.5a4.5 4.5 0 0 1 0 9c-2 0-4-1.5-6-4.5Z"/>'),
    pond: L('<path d="M3 19.5c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0"/><path d="M10 16V8M12.5 16V4.5M15 16V9M7.5 16c0-3-1-5-3-6M16.5 16c0-3 1-5 3-6"/>'),
    river: L('<path d="M3 5c7 0 10 2.5 6.5 6S10 18 17 19.5"/><path d="M8.5 4c6 0 8.5 3 5.2 7s-1.2 7 7.3 8"/>'),
    creek: L('<ellipse cx="7.5" cy="16.5" rx="4" ry="3"/><ellipse cx="16.5" cy="16.5" rx="4" ry="3"/><circle cx="8" cy="7.5" r="2.6"/><ellipse cx="15.5" cy="8" rx="3.5" ry="2.6"/>'),
    sea: L('<path d="M3 17c2-6 7-10 12-10 3 0 5 2 5 4-1.5-1-3.5-1-4.5.5S15 15 17 16"/><path d="M3 20.5c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/>'),
    fish: L('<path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/>'),
    wild1: svg('0 0 36 24', '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(6 0)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><path d="M3 21c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0 4 1.4 6 0" opacity=".5"/></g>'),
    wild2: svg('0 0 36 24', '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(1 -1) scale(.72)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><g transform="translate(16 7) scale(.72)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><path d="M3 22c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0 4 1.4 6 0" opacity=".5"/></g>'),
    wild3: svg('0 0 36 24', '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(0 0) scale(.55)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><g transform="translate(14 -1) scale(.55)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><g transform="translate(5 8) scale(.55)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><g transform="translate(20 8) scale(.55)"><path d="M3 12c3-4.5 9.5-6 14-1.8L21 7v10l-4-3.2C12.5 18 6 16.5 3 12Z"/><circle cx="7.4" cy="11" r=".6" fill="currentColor"/><path d="M11 9.2c.8 1.8.8 3.8 0 5.6"/></g><path d="M3 22c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0 4 1.4 6 0" opacity=".5"/></g>'),
    // nets and traps (tackle box)
    net: L('<path d="M12 2.5V6"/><path d="M4 18.5C4 12 7.5 7 12 6c4.5 1 8 6 8 12.5Z"/><path d="M8.2 18.5c0-5 1.3-9 3.8-12.5 2.5 3.5 3.8 7.5 3.8 12.5M5 14h14M7.2 10h9.6"/>'),
    pot: L('<rect x="3.5" y="9" width="17" height="10" rx="1.5"/><path d="M3.5 14h17M9.2 9v10M14.8 9v10"/><path d="M8 9c0-4 8-4 8 0"/>'),
    cage: L('<path d="M3 18.5V13a9 7.5 0 0 1 18 0v5.5Z"/><path d="M7.5 7V18.5M12 5.5v13M16.5 7V18.5M3.3 12.5h17.4"/>'),
    heron: L('<path d="M2.5 5.4L8 4.6"/><circle cx="9.4" cy="4.8" r="1.4" fill="currentColor"/><path d="M10.4 5.8C11.2 7.4 9.6 9 9.4 10.6 9.2 12 10 12.8 11 13"/><path d="M11 13c1.6-1.4 5-1.6 7.2-.2l2.6 2.4c-2.6.6-5.4.6-7.8-.4-1-.4-1.6-1-2-1.8Z"/><path d="M14.4 15.6l-1 6.4M16.4 15.6l1.2 6.4M12 22h2.6M16.4 22h2.6"/>'),
    check: svg('0 0 24 24', '<path d="M4.5 12.5l5 5L19.5 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
    reeds: svg('0 0 48 64', '<g fill="none" stroke="currentColor" stroke-linecap="round" opacity=".55"><path d="M10 64C10 46 8 30 3 16" stroke-width="1.6"/><path d="M19 64C19 44 21 26 26 10" stroke-width="1.8"/><path d="M30 64C30 50 34 38 44 28" stroke-width="1.4"/><path d="M14 64C16 52 22 44 31 40C25 48 21 55 20 64Z" fill="currentColor" stroke-width=".8"/><path d="M38 64C37 56 39 50 45 44" stroke-width="1.2"/></g><rect x="23.6" y="4" width="5" height="13" rx="2.5" transform="rotate(14 26 10)" fill="currentColor" opacity=".55"/>'),
  };
})();
