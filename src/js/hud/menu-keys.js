'use strict';
// Keyboard navigation in the menus: arrow keys, Tab, Enter, and the card outline.
Object.assign(Engine, {
  // keyboard in the menus: ↑ ↓ move through the cards, ← → change category, Tab changes tab, Enter chooses. True if the key was used.
  menuNav(e) {
    const panel = this.spawnOpen ? 'spawn' : this.tackleOpen ? 'tackle' : null, k = e.code;   // (the journal has nothing to choose)
    if (!panel || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter', 'Tab'].includes(k)) return false;
    const t = e.target, typing = t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    if (typing && t.id !== 'spSearch') return false;   // the rig builder's fields keep their own keys
    if (typing && (k === 'ArrowLeft' || k === 'ArrowRight') && t.value) return false;   // moving the caret in the search
    const step = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0, side = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0;
    if (panel === 'spawn') {
      if (side) { const C = ['all', ...WATER_CATS.map(c => c[0])]; this.spawnSub = C[(C.indexOf(this.spawnSub) + side + C.length) % C.length]; this.spawnSel = null; this.buildSpawnList(); }
      else if (k === 'Tab') { if (this.spawnMode === 'spawn') { const T = SPAWN_TYPES.map(c => c[0]); this.spawnTab = T[(T.indexOf(this.spawnTab) + (e.shiftKey ? -1 : 1) + T.length) % T.length]; this.spawnSel = null; this.buildSpawnList(); } }
      else if (step) { const L = [...document.querySelectorAll('#spList [data-id]')]; if (!L.length) return true;
        const i = clamp((this.spawnNav ? L.findIndex(li => li.dataset.id === this.spawnSel) : step > 0 ? -1 : 1) + step, 0, L.length - 1); this.spawnSelect(L[i].dataset.id); L[i].scrollIntoView({ block: 'nearest' }); }
      else if (this.spawnNav || (typing && this.spawnSel)) this.spawnPlace();   // from the search box, Enter takes the top match
      return true;
    }
    if (k === 'Tab') { const T = ['rigs', 'gear'], cur = this.tackleTab === 'build' ? 'rigs' : this.tackleTab; this.tackleTab = T[(T.indexOf(cur) + (e.shiftKey ? -1 : 1) + T.length) % T.length]; this.tkNav = null; this.tackleRender(); this.navMark(); return true; }
    if (side) { if (this.tackleTab === 'rigs') { const C = ['all', ...WATER_CATS.map(c => c[0])]; this.rigCat = C[(C.indexOf(this.rigCat) + side + C.length) % C.length]; this.tkNav = null; this.tackleRender(); } return true; }
    const L = [...document.querySelectorAll('#tkBody [data-rig], #tkBody [data-gear]')]; if (!L.length) return true;
    let i = L.findIndex(li => (li.dataset.rig || li.dataset.gear) === this.tkNav);
    if (step) { if (i < 0) i = Math.max(0, L.findIndex(li => li.classList.contains('on'))) - (step > 0 ? 1 : 0); i = clamp(i + step, 0, L.length - 1); this.tkNav = L[i].dataset.rig || L[i].dataset.gear; }
    else if (i >= 0) { this.tackleOpenT = 0; L[i].click(); }   // Enter: tie on the rig / show the gear
    this.navMark(); return true;
  },
  // outline the card the keyboard is on in the tackle box (lists are rebuilt often, so re-applied after each move)
  navMark() {
    for (const li of document.querySelectorAll('#tkBody .nav')) li.classList.remove('nav');
    const el = this.tkNav && [...document.querySelectorAll('#tkBody [data-rig], #tkBody [data-gear]')].find(li => (li.dataset.rig || li.dataset.gear) === this.tkNav);
    if (el) { el.classList.add('nav'); el.scrollIntoView({ block: 'nearest' }); }
  },
});
