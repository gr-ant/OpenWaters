'use strict';
// The journal popup (J): personal bests with pictures and recent catches.
Object.assign(Engine, {
  // ---- the journal (J): its own popup. Personal bests with a picture of each fish, then the recent catches ----
  toggleJournal(open = !this.journalOpen) {
    const el = document.getElementById('journal'); if (!el) return;
    this.journalOpen = open; el.hidden = !open;
    if (open) { this.toggleTackle(false); if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); this.journalRender(); }
  },
  journalRender() {
    const body = document.getElementById('jnBody'), esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const log = this.catchLog().slice().reverse(), best = {}, fw = kg => kg < 1 ? `${(kg * 1000).toFixed(0)} g` : `${kg.toFixed(2)} kg`;
    for (const c of log) if (!best[c.species] || c.kg > best[c.species].kg) best[c.species] = c;
    const pic = c => { const D = FishDB.byId[c.species]; return D ? `<span class="ri wide">${animalPicHTML(D)}</span>` : ''; };
    if (!log.length) { body.innerHTML = `<div class="jn-empty">${uiIcon('dock.journal')}<p>Nothing caught yet.</p></div>`; return; }
    body.innerHTML = `<div class="chips"><span>🐟 ${log.length}</span><span>📖 ${Object.keys(best).length} species</span><span>🧺 ${log.filter(c => c.kept).length} kept</span></div>`
      + '<h4>Personal bests</h4><ul>' + Object.values(best).sort((a, b) => b.kg - a.kg).map(c => `<li class="card">${pic(c)}<span class="tx"><b>${esc(c.name)}</b><small>${c.cm} cm · ${fw(c.kg)}</small></span></li>`).join('') + '</ul>'
      + '<h4>Recent</h4><ul>' + log.slice(0, 60).map(c => `<li class="slim-row"><span>${esc(c.name)}</span><small>${c.cm} cm · ${fw(c.kg)} · ${c.kept ? 'kept' : 'released'}</small></li>`).join('') + '</ul>'
      + '<div class="tkbtns"><button id="jnClear">Clear the journal</button></div>';
  },
});
