'use strict';
// Engine: the spawn picker panel (B boats, 1 animals).
Object.assign(Engine, {
  // ---- spawn picker (K, or the Spawn button) ----
  // B: boats; 1 (a secret): fish and wildlife. Both open on the water you're nearest.
  openSpawn(mode) {
    if (this.spawnOpen && this.spawnMode === mode) return this.toggleSpawn(false);
    this.spawnMode = mode; this.spawnTab = mode === 'boats' ? 'boats' : 'fish'; this.spawnSub = this.contextKind(); this.spawnSel = null;
    if (this.spawnOpen) this.buildSpawnList(); else this.toggleSpawn(true);
  },
  toggleSpawn(open = !this.spawnOpen) {
    const el = document.getElementById('spawn'); if (!el) return; this.spawnOpen = open; el.hidden = !open; if (open) this.spawnOpenT = performance.now();
    if (open) { if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); this.keys = {}; this.buildSpawnList(); if (!this.touchUI) setTimeout(() => document.getElementById('spSearch').focus(), 0); }
    else document.activeElement && document.activeElement.blur && document.activeElement.blur();
  },
  setupSpawn() {
    const el = document.getElementById('spawn'); if (!el) return;
    const stop = e => e.stopPropagation();
    for (const ev of ['pointerdown', 'pointerup', 'click', 'wheel', 'touchstart']) el.addEventListener(ev, stop);
    document.getElementById('spClose').onclick = () => this.toggleSpawn(false);
    document.getElementById('spSearch').oninput = () => this.buildSpawnList();
    document.getElementById('spTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { this.spawnTab = b.dataset.tab; this.spawnSel = null; this.buildSpawnList(); } };
    document.getElementById('spSub').onclick = e => { const b = e.target.closest('[data-sub]'); if (b) { this.spawnSub = b.dataset.sub; this.buildSpawnList(); } };
    document.getElementById('spList').onclick = e => { const li = e.target.closest('[data-id]'); if (li) { this.spawnSelect(li.dataset.id); this.spawnPlace(); } };   // a click places it
    this.spawnMode = 'boats'; this.spawnTab = 'boats'; this.spawnSub = 'all';
  },
  // what's in the list for the current tab, filter chip and search
  spawnItems() {
    const t = this.spawnTab, sub = this.spawnSub, q = t === 'boats' ? '' : document.getElementById('spSearch').value.trim().toLowerCase();   // boats: no search
    if (t === 'boats') return BoatDB.list.filter(D => (sub === 'all' || boatWaters(D).includes(sub)) && (!q || (D.name + ' ' + D.propulsion.type).toLowerCase().includes(q)));
    const kindOf = D => D._herp ? 'herp' : D._air ? 'mammal' : D._shell ? 'shell' : 'fish';
    return FishDB.list.filter(D => { const W = D.habitat.waters, k = kindOf(D);
      if (t === 'fish' ? k !== 'fish' : k === 'fish') return false;
      if (sub !== 'all' && !(W[sub] > 0)) return false;
      return !q || (D.name + ' ' + D.scientific + ' ' + Object.keys(W).filter(w => W[w] > 0).join(' ')).toLowerCase().includes(q);
    }).sort((a, b) => a.name.localeCompare(b.name));
  },
  buildSpawnList() {
    const ul = document.getElementById('spList'), esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const boatsMode = this.spawnMode === 'boats', panel = document.getElementById('spawn'), tabs = document.getElementById('spTabs');
    if (panel.dataset.mode !== this.spawnMode) {   // header and search follow the mode
      panel.dataset.mode = this.spawnMode;
      panel.querySelector('.sp-art').innerHTML = uiIcon(boatsMode ? 'dock.boat' : 'dock.spawn');
      panel.querySelector('h2').textContent = boatsMode ? 'Boats' : 'Spawn';
      panel.querySelector('.tk-title i').textContent = boatsMode ? 'Pick a boat for the water.' : 'A little company on the water.';
      document.getElementById('spSearch').placeholder = boatsMode ? 'Find a boat…' : 'Find a creature…';
    }
    tabs.hidden = boatsMode;
    tabs.innerHTML = boatsMode ? '' : [['fish', 'Fish', 'fish'], ['wild', 'Wildlife', 'heron']].map(([k, l, ic]) => `<button data-tab="${k}" class="${k === this.spawnTab ? 'on' : ''}">${uiIcon('ui.' + ic)}${l}</button>`).join('');
    document.getElementById('spSub').innerHTML = catChips(this.spawnSub, 'data-sub');
    const items = this.spawnItems(), boats = this.spawnTab === 'boats';
    if (!items.some(D => D.id === this.spawnSel)) { this.spawnSel = items.length ? items[0].id : null; this.spawnNav = false; }
    ul.classList.toggle('grid', boats);   // boats: picture tiles, the name on hover
    ul.innerHTML = items.map(D => boats
      ? `<li data-id="${esc(D.id)}" class="tile${D.id === this.spawnSel && this.spawnNav ? ' nav' : ''}" title="${esc(D.name)} · ${D.hull.length_m} m">${boatPicHTML(D)}</li>`
      : `<li data-id="${esc(D.id)}" class="card${D.id === this.spawnSel && this.spawnNav ? ' nav' : ''}"><span class="ri wide">${animalPicHTML(D)}</span>`
      + `<span class="tx"><b>${esc(D.name)}</b><small>${D.size.length_cm.typical} cm</small></span><span class="chev">${uiIcon('ui.chevron')}</span></li>`).join('') || '<li class="none">Nothing matches</li>';
  },
  // the card the keyboard is on (outlined); Enter places it
  spawnSelect(id) {
    this.spawnSel = id; this.spawnNav = true;
    for (const li of document.querySelectorAll('#spList [data-id]')) li.classList.toggle('nav', li.dataset.id === id);
  },
  spawnPlace() {
    if (!this.spawnSel || performance.now() - this.spawnOpenT < 450) return;   // ignore the tap that opened the panel
    if (this.spawnTab === 'boats') { if (this.spawnBoat(this.spawnSel)) this.toggleSpawn(false); } else this.spawnAnimal(this.spawnSel);
  },
});
