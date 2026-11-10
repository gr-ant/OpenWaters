'use strict';
// UI_ICONS.dock — the big painted 96x72 pictures on the shortcut dock and panel headers.
UI_ICONS.dock = (() => {
  const { OL, ids, svg, lg, rg, shadow } = ICON_KIT;
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
    // the same island, tropical: turquoise shallows, pale sand and a leaning palm
    islandTropical: (() => { const P = ids(), frond = (x, y, a, L) => `<path d="M${x} ${y}q${Math.cos(a) * L * .5} ${Math.sin(a) * L * .5 - 6} ${Math.cos(a) * L} ${Math.sin(a) * L}q${-Math.cos(a) * L * .45} ${-Math.sin(a) * L * .2 + 2} ${-Math.cos(a) * L} ${-Math.sin(a) * L}Z" fill="#5aa63e" stroke="${OL}" stroke-width="1.1" stroke-linejoin="round"/>`;
      return svg('0 0 96 72', `<defs>${rg(P('w'), [[0, '#9ff0e6'], [.5, '#3fc0c8'], [1, '#1a6f9c']], .5, .55, .6)}${lg(P('g'), [[0, '#a8d86a'], [1, '#4e8a3a']])}${shadow(P('s'))}</defs>
<ellipse cx="48" cy="44" rx="44" ry="22" fill="url(#${P('w')})" stroke="${OL}" stroke-width="2"/><path d="M12 48C22 46 30 50 40 48M58 54C66 52 76 56 86 52" fill="none" stroke="#f0fffc" stroke-width="1.4" stroke-linecap="round" opacity=".85"/>
<g filter="url(#${P('s')})"><path d="M16 46C22 36 36 32 48 34C62 36 76 36 82 46C72 53 22 53 16 46Z" fill="#f4e6b8" stroke="${OL}" stroke-width="1.8"/>
<path d="M34 44C38 38 48 36 56 38C62 40 66 42 66 44C58 47 40 47 34 44Z" fill="url(#${P('g')})" stroke="${OL}" stroke-width="1.3"/>
<path d="M46 42C46 32 49 22 55 14" fill="none" stroke="${OL}" stroke-width="4" stroke-linecap="round"/><path d="M46 42C46 32 49 22 55 14" fill="none" stroke="#a07a4a" stroke-width="2.2" stroke-linecap="round"/>
${frond(55, 14, -2.6, 16)}${frond(55, 14, -0.4, 16)}${frond(55, 14, 0.5, 13)}${frond(55, 14, -1.6, 12)}${frond(55, 14, 2.4, 13)}<circle cx="53.5" cy="17" r="2" fill="#7a5a2a" stroke="${OL}" stroke-width=".8"/></g>`); })(),
    // the same island, arctic: dark cold water, a snowy hump with a dark pine, an iceberg alongside
    islandArctic: (() => { const P = ids(); return svg('0 0 96 72', `<defs>${rg(P('w'), [[0, '#a8c8dc'], [.6, '#4a7494'], [1, '#1e3a56']], .5, .55, .6)}${lg(P('i'), [[0, '#ffffff'], [1, '#c4dcec']])}${lg(P('b'), [[0, '#eaf8ff'], [1, '#8cc4e4']], 1, 1)}${shadow(P('s'))}</defs>
<ellipse cx="48" cy="44" rx="44" ry="22" fill="url(#${P('w')})" stroke="${OL}" stroke-width="2"/><path d="M12 48C22 46 30 50 40 48M58 56C66 54 76 58 86 54" fill="none" stroke="#e6f4ff" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>
<g filter="url(#${P('s')})"><path d="M14 46C20 34 32 28 44 30C58 32 68 36 72 46C62 52 22 52 14 46Z" fill="#8a8a86" stroke="${OL}" stroke-width="1.8"/>
<path d="M20 43C26 33 36 29 46 31C56 33 64 37 66 43C56 47 30 47 20 43Z" fill="url(#${P('i')})" stroke="${OL}" stroke-width="1.3"/>${pine(34, 40, 14)}<path d="M34 28.5L37 35H31Z" fill="#fff" opacity=".85"/>
<path d="M70 52L74 40L80 36L86 44L88 52Z" fill="url(#${P('b')})" stroke="${OL}" stroke-width="1.5" stroke-linejoin="round"/><path d="M75 40L78 49" stroke="#9cc8e2" stroke-width="1.2" stroke-linecap="round"/></g>`); })(),
    // a trail map held by a red pushpin
    pin: (() => { const P = ids(); return svg('0 0 96 72', `<defs>${lg(P('p'), [[0, '#f6e8c4'], [1, '#d9c08c']], 1, 1)}${rg(P('l'), [[0, '#9fd6ee'], [.6, '#4a92c0'], [1, '#235a86']], .45, .4, .6)}${lg(P('h'), [[0, '#ff7a6a'], [1, '#b8261c']])}${shadow(P('s'))}</defs>
<g filter="url(#${P('s')})"><path d="M14 14L82 10L84 60L16 64Z" fill="url(#${P('p')})" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>
<path d="M30 38C30 30 40 26 50 30C60 34 64 42 56 48C46 54 30 48 30 38Z" fill="url(#${P('l')})" stroke="${OL}" stroke-width="1.2"/><path d="M22 54C32 50 40 52 50 50C60 48 68 44 78 44" fill="none" stroke="#b8503a" stroke-width="1.4" stroke-dasharray="3 2.5"/>
${pine(68, 30, 10)}${pine(24, 26, 9)}<path d="M48 12V32" stroke="${OL}" stroke-width="3"/><path d="M48 12V32" stroke="#c0c8b0" stroke-width="1.2"/>
<path d="M39 10H57L54 3H42Z" fill="url(#${P('h')})" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="48" cy="10" rx="9" ry="2.4" fill="#e04a3a" stroke="${OL}" stroke-width="1.2"/></g>`); })(),
    gear: (() => { const G = ids(); let d = ''; for (let i = 0; i < 16; i++) { const r = i % 2 ? 19 : 26; for (const a of [i * 22.5 - 6, i * 22.5 + 6]) d += `${d ? 'L' : 'M'}${(48 + r * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(36 + r * Math.sin(a * Math.PI / 180)).toFixed(1)}`; }
      return svg('0 0 96 72', `<defs>${lg(G('m'), [[0, '#eef1f4'], [.5, '#a2a9b0'], [1, '#565c64']])}${shadow(G('s'))}</defs><g filter="url(#${G('s')})" stroke-linejoin="round">
<path d="${d}Z" fill="url(#${G('m')})" stroke="${OL}" stroke-width="2.2"/><circle cx="48" cy="36" r="14" fill="none" stroke="#fff" stroke-width="1.4" opacity=".5"/>
<circle cx="48" cy="36" r="8" fill="#22302a" stroke="${OL}" stroke-width="2.2"/></g>`); })(),
    // a fish finder: a green scope with its sweep and a fish on it
    radar: (() => { const G = ids(); return svg('0 0 96 72', `<defs>${rg(G('g'), [[0, '#4c9a68'], [1, '#12301f']], .5, .5, .6)}${lg(G('w'), [[0, '#c8ffd8', .7], [1, '#c8ffd8', 0]], 1, 1)}${shadow(G('s'))}</defs><g filter="url(#${G('s')})">
<circle cx="48" cy="36" r="30" fill="#c8a45a" stroke="${OL}" stroke-width="2"/><circle cx="48" cy="36" r="25.5" fill="url(#${G('g')})" stroke="${OL}" stroke-width="1.8"/></g>
<path d="M48 36V10.5A25.5 25.5 0 0 1 73.5 36Z" fill="url(#${G('w')})"/><g fill="none" stroke="#9fe8b4" stroke-width="1.2" opacity=".65"><circle cx="48" cy="36" r="8.5"/><circle cx="48" cy="36" r="17"/><path d="M48 10.5V61.5M22.5 36H73.5"/></g>
<path d="M27 46C30 42 36 41 40 44L43 41.5V50.5L40 48C36 51 30 50 27 46Z" fill="#f6e08a" stroke="${OL}" stroke-width="1.3" stroke-linejoin="round"/><circle cx="59" cy="26" r="2.4" fill="#f6e08a" stroke="${OL}" stroke-width="1"/>`); })(),
    // the view you're in: through your own eyes, or over the angler's shoulder (a figure from behind inside a camera's frame)
    view1: (() => { const G = ids(); return svg('0 0 96 72', `<defs>${rg(G('i'), [[0, '#8fd0c0'], [.6, '#3f8a7c'], [1, '#1d4f48']], .5, .5, .6)}${shadow(G('s'))}</defs><g filter="url(#${G('s')})" stroke-linejoin="round">
<path d="M7 36C20 17 34 11 48 11C62 11 76 17 89 36C76 55 62 61 48 61C34 61 20 55 7 36Z" fill="#f6eed6" stroke="${OL}" stroke-width="2.4"/>
<circle cx="48" cy="36" r="16" fill="url(#${G('i')})" stroke="${OL}" stroke-width="2"/><circle cx="48" cy="36" r="7.5" fill="#14201a"/></g><circle cx="54" cy="30" r="3.4" fill="#fff" opacity=".85"/>`); })(),
    view3: (() => { const G = ids(); return svg('0 0 96 72', `<defs>${lg(G('t'), [[0, '#c0503c'], [1, '#7a2a20']])}${lg(G('c'), [[0, '#9ab07e'], [1, '#5f7a4a']])}${shadow(G('s'))}</defs>
<path d="M9 22V9H23M73 9H87V22M87 50V63H73M23 63H9V50" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 22V9H23M73 9H87V22M87 50V63H73M23 63H9V50" fill="none" stroke="#f6e08a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<g filter="url(#${G('s')})" stroke-linejoin="round"><path d="M25 66C25 49 35 41 48 41C61 41 71 49 71 66Z" fill="url(#${G('t')})" stroke="${OL}" stroke-width="2.2"/>
<rect x="43" y="33" width="10" height="10" fill="#dba985" stroke="${OL}" stroke-width="1.8"/><circle cx="48" cy="25" r="11.5" fill="#573826" stroke="${OL}" stroke-width="2.2"/>
<path d="M36.5 24A11.5 11.5 0 0 1 59.5 24Z" fill="url(#${G('c')})" stroke="${OL}" stroke-width="2"/></g>`); })(),
    spawn: boatArt(S, 'translate(4 13) scale(.72)', lg(S('ct'), [[0, '#9a5a2e'], [.5, '#6a3a1c'], [1, '#3e200e']], 1, 0),
      `<g>${cattail(78, 60, 40, 3)}${cattail(86, 62, 30, 4)}</g><path d="M71 62C72 50 74 42 70 30M92 62C92 52 94 46 96 40" fill="none" stroke="#6a8a44" stroke-width="1.6" stroke-linecap="round"/>`,
      `${cattail(73, 63, 30, -2)}<path d="M77 63C77 56 79 50 83 46" fill="none" stroke="#6a8a44" stroke-width="1.6" stroke-linecap="round"/>`),
  };
})();
