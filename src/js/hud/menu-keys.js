'use strict';
// Keyboard navigation in the menus: arrow keys, Tab, Enter, and the card outline.
Object.assign(Engine, {
  // keyboard in the menus: it starts on the top row (the tabs); ↑ ↓ move from row to row and down through the cards, ← → move along a row, Tab changes tab, Enter chooses. True if the key was used.
  menuNav(e) {
    const panel = this.spawnOpen ? 'spawn' : this.tackleOpen ? 'tackle' : null, k = e.code;   // (the journal has nothing to choose)
    if (!panel || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter', 'Tab'].includes(k)) return false;
    const t = e.target, typing = t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    if (typing && t.id !== 'spSearch') return false;   // the rig builder's fields keep their own keys
    if (typing && (k === 'ArrowLeft' || k === 'ArrowRight') && t.value) return false;   // moving the caret in the search
    const step = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0, side = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0;
    const rows = this.menuRows(panel); if (!rows.length) return true;
    const F = this.menuFocus && this.menuFocus.panel === panel ? this.menuFocus : (this.menuFocus = { panel, r: 0, c: -1 }), on = row => Math.max(0, row.findIndex(b => b.classList.contains('on')));
    F.r = clamp(F.r, 0, rows.length - 1); if (F.c < 0 || F.c >= rows[F.r].length) F.c = F.r < rows.head ? on(rows[F.r]) : 0;
    const press = el => { this.tackleOpenT = 0; this.spawnOpenT = 0; el.click(); };   // (the panels ignore clicks for a moment after opening: not these)
    if (k === 'Tab') { F.r = 0; const n = rows[0].length; F.c = (on(rows[0]) + (e.shiftKey ? -1 : 1) + n) % n; press(rows[0][F.c]); }   // Tab: the next tab, from anywhere
    else if (step) { const nr = clamp(F.r + step, 0, rows.length - 1);   // up / down: the next row. Into a row of tabs or chips you land on the chosen one; into the list, on its first card
      if (nr !== F.r) { F.c = nr < rows.head ? on(rows[nr]) : Math.min(F.r >= rows.head ? F.c : 0, rows[nr].length - 1); F.r = nr; } }
    else if (side) { const row = rows[F.r], nc = F.r < rows.head ? (F.c + side + row.length) % row.length : clamp(F.c + side, 0, row.length - 1);   // sideways: along the row; a tab or chip is chosen as you reach it
      if (nc !== F.c) { F.c = nc; if (F.r < rows.head) press(row[nc]); } }
    else if (typing && panel === 'spawn' && F.r < rows.head) { if (this.spawnSel) { this.spawnOpenT = 0; this.spawnPlace(); } }   // Enter from the search box takes the top match
    else press(rows[F.r][F.c]);   // Enter: choose it
    this.menuMark(panel); return true;
  },
  // What the keyboard can be on, top to bottom: rows of buttons (tabs, then each row of filter chips), then the list (one card a row,
  // or two for the boats' picture grid), then a button under it. rows.head: how many rows come before the list.
  menuRows(panel) {
    const all = sel => [...document.querySelectorAll(sel)], rows = [];
    if (panel === 'spawn') { for (const id of ['spTabs', 'spKind', 'spBiome', 'spSub']) { const el = document.getElementById(id), B = el && !el.hidden ? [...el.querySelectorAll('button')] : []; if (B.length) rows.push(B); }
      rows.head = rows.length; const L = all('#spList [data-id]'), per = document.getElementById('spList').classList.contains('grid') ? 2 : 1; for (let i = 0; i < L.length; i += per) rows.push(L.slice(i, i + per)); }
    else { for (const sel of ['#tkTabs button', '#tkBody .subtabs button']) { const B = all(sel); if (B.length) rows.push(B); }
      rows.head = rows.length; for (const li of all('#tkBody [data-rig], #tkBody [data-gear], #tkBody [data-trap], #tkBack, #tkBody [data-pick], #tkBody [data-choose], #tkBody [data-end], #tkBody .tkbtns button')) {   // the builder too: its side-by-side buttons share a row
        const par = li.parentElement, last = rows[rows.length - 1]; if (par && par.matches && par.matches('.rb-end, .rb-adds, .tkbtns') && rows.length > rows.head && last[0].parentElement === par) last.push(li); else rows.push([li]); } const foot = all('#tkFoot:not([hidden]) button'); if (foot.length) rows.push(foot); }
    return rows;
  },
  // outline what the keyboard is on (the panels rebuild their insides often, so this is re-applied after each move). A panel opens with it on the top row.
  menuMark(panel = this.spawnOpen ? 'spawn' : this.tackleOpen ? 'tackle' : null) {
    for (const el of document.querySelectorAll('#spawn .nav, #tackle .nav')) el.classList.remove('nav');
    const F = this.menuFocus; if (!panel || !F || F.panel !== panel) return; const rows = this.menuRows(panel); if (!rows.length) return;
    F.r = clamp(F.r, 0, rows.length - 1); if (F.c < 0) F.c = F.r < rows.head ? Math.max(0, rows[F.r].findIndex(b => b.classList.contains('on'))) : 0; F.c = clamp(F.c, 0, rows[F.r].length - 1);
    const el = rows[F.r][F.c], inList = F.r >= rows.head; el.classList.add('nav'); el.scrollIntoView({ block: 'nearest' });
    if (panel === 'spawn') { this.spawnNav = inList && !!el.dataset.id; if (this.spawnNav) this.spawnSel = el.dataset.id; } else this.tkNav = inList ? el.dataset.rig || el.dataset.gear || el.dataset.trap || null : null;
  },
});
