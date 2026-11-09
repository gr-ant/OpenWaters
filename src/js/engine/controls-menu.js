'use strict';
// Engine: the Controls section of the pause menu (presets and rebinding, see js/controls.js) and the controls card.
Object.assign(Engine, {
  setupKeySettings() {
    const sel = document.getElementById('ksPreset'), list = document.getElementById('ksList');
    sel.onchange = () => { if (CONTROL_PRESETS[sel.value]) { Controls.usePreset(sel.value); this.keySettingsRender(); } };
    document.getElementById('ksReset').onclick = () => { Controls.usePreset(CONTROL_PRESETS[Controls.preset] ? Controls.preset : 'guppy'); this.keySettingsRender(); };
    list.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (!b) return;
      this.keySettingsCancel(); this.ksCap = { id: b.dataset.act, slot: +b.dataset.slot, btn: b }; b.textContent = 'Press…'; b.classList.add('wait'); });
    // while waiting for a key, the next key / side or middle button / wheel notch is the new binding (Esc cancels, Backspace clears)
    const take = (e, code) => { const C = this.ksCap; if (!C) return false; e.preventDefault(); e.stopImmediatePropagation();
      if (code !== null) Controls.bind(C.id, C.slot, code || null); this.ksCap = null; this.keySettingsRender(); return true; };
    addEventListener('keydown', e => { if (!this.ksCap) return; take(e, e.code === 'Escape' ? null : e.code === 'Backspace' || e.code === 'Delete' ? '' : e.code); }, true);
    addEventListener('mousedown', e => { if (!this.ksCap) return; if (e.button === 0 || e.button === 2) { if (!e.target.closest('button[data-act]')) take(e, null); return; } take(e, ['', 'Mouse1', '', 'Mouse3', 'Mouse4'][e.button] || null); }, true);
    addEventListener('auxclick', e => { if (this.ksCap || (e.button >= 3 && Controls.bound(['', 'Mouse1', '', 'Mouse3', 'Mouse4'][e.button]))) e.preventDefault(); }, true);
    addEventListener('mouseup', e => { if (e.button >= 3 && this.pauseOpen) e.preventDefault(); }, true);   // no browser back / forward while setting a side button
    list.addEventListener('wheel', e => { if (this.ksCap && e.deltaY) take(e, e.deltaY < 0 ? 'WheelUp' : 'WheelDown'); }, { passive: false });
    this.keySettingsRender(); this.setupPauseMenu();
  },
  // the pause menu's pages: main (resume, settings, controls, card), settings, controls
  setupPauseMenu() {
    const D = this.pauseDialog, rk = document.getElementById('setReelKeys');
    try { this.showReelKeys = JSON.parse(localStorage.getItem('embercrown-hud') || '{}').reelKeys !== false; } catch (_) { this.showReelKeys = true; }
    rk.checked = this.showReelKeys;
    rk.onchange = () => { this.showReelKeys = rk.checked; try { localStorage.setItem('embercrown-hud', JSON.stringify({ reelKeys: rk.checked })); } catch (_) { /* session only */ } };
    { // music and animal sounds: both off unless turned on here; kept in this browser
      const mu = document.getElementById('setMusic'), an = document.getElementById('setAnimals');
      let s = {}; try { s = JSON.parse(localStorage.getItem('embercrown-audio') || '{}'); } catch (_) { /* defaults */ }
      mu.checked = s.music === true; an.checked = s.animals === true; Sounds.setMusic(mu.checked); Game.birdCalls = an.checked;
      mu.onchange = an.onchange = () => { Sounds.setMusic(mu.checked); Game.birdCalls = an.checked;
        try { localStorage.setItem('embercrown-audio', JSON.stringify({ music: mu.checked, animals: an.checked })); } catch (_) { /* session only */ } };
    }
    { // wildlife density: three levels, kept in this browser, applied at once by letting the fish cells repopulate
      const opts = [...D.querySelectorAll('[data-wild]')];
      try { const v = +localStorage.getItem('embercrown-wildlife'); if (v >= 1 && v <= 3) CONFIG.wildlife = v; } catch (_) { /* default */ }
      const show = () => { for (const b of opts) b.setAttribute('aria-checked', +b.dataset.wild === CONFIG.wildlife ? 'true' : 'false'); };
      for (const b of opts) b.onclick = () => { const v = +b.dataset.wild; if (v === CONFIG.wildlife) return; CONFIG.wildlife = v; show();
        try { localStorage.setItem('embercrown-wildlife', String(v)); } catch (_) { /* session only */ }
        this.fishCells.clear(); this.fish = this.fish.filter(f => f === (this.ang && this.ang.fish)); this.cellT = 0; };
      show(); }
    { // ground cover: off / light / full, kept in this browser; chunks near you regrow it at the new level (Engine.groundGen)
      const opts = [...D.querySelectorAll('[data-ground]')];
      try { const v = localStorage.getItem('embercrown-groundcover'); if (v !== null && +v >= 0 && +v <= 2) CONFIG.groundCover = +v; } catch (_) { /* default */ }
      const show = () => { for (const b of opts) b.setAttribute('aria-checked', +b.dataset.ground === CONFIG.groundCover ? 'true' : 'false'); };
      for (const b of opts) b.onclick = () => { CONFIG.groundCover = +b.dataset.ground; show(); try { localStorage.setItem('embercrown-groundcover', b.dataset.ground); } catch (_) { /* session only */ } };
      show(); }
    D.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) this.pauseShow(b.dataset.go); });
    D.addEventListener('keydown', e => {   // ↑ ↓ move between the menu's buttons
      if (this.ksCap || (e.code !== 'ArrowUp' && e.code !== 'ArrowDown')) return;
      const L = [...D.querySelectorAll('.pm-page:not([hidden]) .pm-menu button')]; if (!L.length) return;
      e.preventDefault(); const i = L.indexOf(document.activeElement); L[(i + (e.code === 'ArrowDown' ? 1 : -1) + L.length) % L.length].focus();
    });
  },
  pauseShow(page) {
    const D = this.pauseDialog; this.keySettingsCancel(); this.pausePage = page; D.dataset.page = page;
    for (const s of D.querySelectorAll('.pm-page')) s.hidden = s.dataset.page !== page;
    if (page === 'main') {
      const loc = document.getElementById('hLocName'), sub = document.getElementById('hLocSub');
      document.getElementById('pmWhere').textContent = [loc && loc.textContent, sub && sub.textContent].filter(Boolean).join(' · ');
      document.getElementById('pmFoot').textContent = `seed ${SEED} · ${CLIMATE.name}`;
    }
    const f = D.querySelector(`.pm-page[data-page="${page}"] ${page === 'main' ? '#resumeGame' : '.pm-back'}`); if (f) f.focus();
  },
  keySettingsCancel() { if (this.ksCap) { this.ksCap = null; this.keySettingsRender(); } },
  keySettingsRender() {
    const sel = document.getElementById('ksPreset'), list = document.getElementById('ksList'), B = Controls.binds;
    sel.value = Controls.preset; sel.querySelector('option[value="custom"]').hidden = Controls.preset !== 'custom';
    const uses = new Map(); for (const a of CONTROL_ACTIONS) for (const c of B[a.id]) uses.set(c, [...(uses.get(c) || []), a.label]);
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const groups = [];   // groups go into two columns, each to the shorter one
    for (const a of CONTROL_ACTIONS) { if (!groups.length || groups[groups.length - 1].name !== a.group) groups.push({ name: a.group, rows: [] }); groups[groups.length - 1].rows.push(a); }
    const cols = [[], []], n = [0, 0];
    for (const G of groups) { const c = n[0] <= n[1] ? 0 : 1; cols[c].push(G); n[c] += G.rows.length + 1.5; }
    let h = '';
    for (const col of cols) { h += '<div class="ks-col">'; for (const G of col) { h += `<div class="ks-group"><h3>${G.name}</h3>`; for (const a of G.rows) {
      const btn = slot => { const c = B[a.id][slot], also = c ? uses.get(c).filter(l => l !== a.label) : [];
        return `<button type="button" data-act="${a.id}" data-slot="${slot}" class="${c ? '' : 'empty'}${also.length ? ' dup' : ''}"${also.length ? ` title="Also: ${esc(also.join(', '))}"` : ''}>${c ? esc(Controls.name(c)) : '+'}</button>`; };
      h += `<div class="ks-row"><span>${esc(a.label)}</span>${btn(0)}${B[a.id][0] ? btn(1) : ''}</div>`;
    } h += '</div>'; } h += '</div>'; }
    list.innerHTML = h;
    this.renderHelpCard();
  },
  // the ? card and the dock's key badges show the keys as they're bound now
  renderHelpCard() {
    for (const [dock, id] of [['tackle', 'tackle'], ['journal', 'journal'], ['boats', 'boats'], ['rod', 'rod'], ['map', 'map']]) {
      const k = document.querySelector(`[data-dock="${dock}"] kbd`); if (k) k.textContent = Controls.key(id); }
    const dl = document.querySelector('#hHelp dl'); if (!dl) return;
    const K = id => `<b>${Controls.keys(id).replace(/</g, '&lt;')}</b>`, rows = [
      [`${Controls.key('forward')} ${Controls.key('left')} ${Controls.key('back')} ${Controls.key('right')}`, `move · ${K('run')} run · ${K('jump')} jump / up · ${K('dive')} dive · ${K('use')} use`],
      [Controls.keys('water'), 'walk to the nearest water (again for the next kind)'],
      [Controls.keys('rod'), 'rod out / away'], [`${Controls.keys('cast')} / mouse`, `cast (hold, let go) · reel (${K('run')} faster) · strike`],
      [Controls.keys('bail'), 'open / close the bail (reeling closes it) · before a cast: drop it straight down'], [`${Controls.keys('dragDown')} · ${Controls.keys('dragUp')}`, 'drag down · up'],
      [`${Controls.keys('keep')} · ${Controls.keys('release')}`, 'keep · release a catch'],
      [`${Controls.keys('tackle')} · ${Controls.keys('journal')} · ${Controls.keys('boats')}`, 'tackle box · journal · boats'],
      ['↑ ↓ · ← → · Tab', 'in a menu: move · category · tab · Enter chooses'],
      [Controls.keys('helm'), `in a boat: helm / deck · ${K('dive')} sit`],

      [Controls.keys('map'), `map · arrows move · ${K('forward')}/${K('back')} zoom · Enter travels to the crosshair`],
      [Controls.keys('fastTime'), `hold for fast time · ${K('season')} season · ${K('weather')} weather`],
      ['Esc', 'pause · settings · change controls'],
      [`${Controls.keys('spawn')} · ${Controls.keys('radar')} · ${Controls.keys('lureCam')}`, 'extras: spawn menu · fish radar · live lure camera'], [Controls.keys('help'), 'this card'],
    ];
    dl.innerHTML = rows.map(([k, v]) => `<dt>${k.replace(/</g, '&lt;')}</dt><dd>${v}</dd>`).join('');
  },
});
