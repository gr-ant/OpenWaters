'use strict';
// FISHING: the tackle box panel (T): rigs, the rig builder, gear and the catch log.
Object.assign(Engine, {
  // ---- the tackle box (T): rigs, the rig builder, all your gear, and the catch log ----
  toggleTackle(open = !this.tackleOpen) {
    const el = document.getElementById('tackle'); if (!el) return;
    this.tackleOpen = open; el.hidden = !open; if (open) { this.toggleJournal(false); this.rigCat = this.contextKind(); if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); this.tackleOpenT = performance.now(); this.tackleRender(); this.menuFocus = { panel: 'tackle', r: 0, c: -1 }; if (!this.touchUI) this.menuMark('tackle'); }   // the keyboard starts on the top row
  },
  tackleTab: 'rigs',
  tackleRender() {
    const body = document.getElementById('tkBody'), tabs = document.getElementById('tkTabs'); if (!body) return;
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const tabOn = this.tackleTab === 'build' ? 'rigs' : this.tackleTab, foot = document.getElementById('tkFoot');
    tabs.innerHTML = [['rigs', 'Rigs', 'hook'], ['gear', 'Gear', 'gear'], ['traps', 'Nets', 'net']].map(([t, l, ic]) => `<button data-tab="${t}" class="${t === tabOn ? 'on' : ''}">${uiIcon('ui.' + ic)}${l}</button>`).join('');
    const A = this.ang, T = this.tackleTab; foot.innerHTML = ''; foot.hidden = true;
    if (T === 'rigs') {
      // one card per rig: picture, name, what's on the end, line strength and cast; the tied-on one is highlighted
      const cat = this.rigCat || 'all', rigs = TackleDB.ofType('rig').filter(r => { if (cat === 'all') return true; const S = rigStats(r); return !S.errors.length && rigWaters(r, S).includes(cat); });
      let h = `<div class="subtabs">${catChips(cat, 'data-cat')}</div><ul class="cards">`;
      for (const r of rigs) { const S = rigStats(r), bad = S.errors.length, on = A && A.rigId === r.id;
        h += `<li data-rig="${esc(r.id)}" class="card${on ? ' on' : ''}${bad ? ' bad' : ''}">${rigIconHTML(S, r)}<span class="tx"><b>${esc(r.name)}</b>`
          + `<small>${bad ? '⚠' : `${S.line.strength_lb} lb · ${S.castMax.toFixed(0)} m`}</small></span>${on ? '<em class="badge">Equipped</em>' : ''}`
          + `${r._custom ? `<i data-forget="${esc(r.id)}" title="Remove">✕</i>` : ''}<span class="chev">${uiIcon('ui.chevron')}</span></li>`; }
      body.innerHTML = h + (rigs.length ? '' : '<li class="none">No rigs for this water yet</li>') + '</ul>';
      foot.innerHTML = `<button id="tkBuild" class="big">${uiIcon('ui.wrench')}Build a rig</button>`; foot.hidden = false;
    } else if (T === 'build') {
      const B = this.tkBuild || (this.tkBuild = Object.assign({ name: '', float_depth_m: null, drag: 0.3 }, JSON.parse(JSON.stringify((A && A.rig) ? { parts: A.rig.parts, float_depth_m: A.rig.float_depth_m, drag: A.rig.drag } : { parts: {} }))));
      const rig = { type: 'rig', id: 'draft', name: B.name || 'New rig', parts: Object.fromEntries(Object.entries(B.parts).filter(([, v]) => v)), float_depth_m: B.float_depth_m, drag: B.drag }, S = rigStats(rig);
      const P = B.parts, lureEnd = B.end === 'lure' || (!B.end && !!P.lure), steps = rigSteps(lureEnd), g = slot => P[slot] && TackleDB.byId[P[slot]];
      const pic = (slot, d) => slot === 'line' ? spoolSVG(d) : slot === 'leader' ? leaderSVG(d) : d ? gearIconHTML(d) : '';
      let h = `<button id="tkBack" class="back">${uiIcon('ui.chevron')}Rigs</button>`;
      if (this.tkPick) {   // choosing a part: every option for that slot, then on down the line
        const slot = this.tkPick, k = steps.indexOf(slot), L = TackleDB.ofType(slot), opt = RIG_PARTS[slot];
        h += `<div class="rb-pick-head"><b>Choose a ${opt.label.toLowerCase()}</b><i>${opt.tip}</i></div><ul class="rb-opts">`;
        if (opt.optional) h += `<li data-choose="" class="card slim${P[slot] ? '' : ' on'}"><span class="ri rb-none">—</span><span class="tx"><b>None</b><small>${opt.none}</small></span></li>`;
        const card = (d, why) => `<li ${why ? 'aria-disabled="true"' : `data-choose="${esc(d.id)}"`} class="card slim${P[slot] === d.id ? ' on' : ''}${why ? ' nofit' : ''}" title="${esc(d.description || '')}">${slot === 'line' || slot === 'leader' ? `<span class="ri">${pic(slot, d)}</span>` : gearIconHTML(d)}<span class="tx"><b>${esc(d.name)}</b><small>${esc(why || gearSummary(d))}</small></span></li>`;
        const fit = L.map(d => [d, rigFit(slot, d, P)]);   // only what suits the parts above it on the line can be chosen
        h += fit.filter(f => !f[1]).map(f => card(f[0])).join('');
        const no = fit.filter(f => f[1]); if (no.length) h += `<li class="rb-nofit-head">Doesn't suit this rig</li>` + no.map(f => card(f[0], f[1])).join('');
        h += `</ul><button class="rb-done" data-pick="">Back to the rig</button>`;
        body.innerHTML = h; return;
      }
      // the rig, top to bottom: rod and reel, then each part on the line down to the hook and bait, or the lure
      const node = (slot, side) => { const d = g(slot), o = RIG_PARTS[slot];
        return `<div class="rb-node ${side}${d ? '' : ' empty'}" data-pick="${slot}"><span class="rb-lab"><small>${o.label}</small>${d ? esc(d.name) : 'Choose…'}</span><span class="rb-ic">${pic(slot, d)}</span></div>`; };
      h += `<div class="rb-head"><b>Build a rig</b><i>Tap a part to change it</i></div>`;
      { const d = g('rod'), r = g('reel');   // the rod across the top with the reel on its seat; the line drops from the tip
        h += `<div class="rb-rod${d ? '' : ' empty'}" data-pick="rod" role="button" tabindex="0">${d ? gearIconHTML(d) : ''}<span class="rb-lab"><small>Rod</small>${d ? esc(d.name) : 'Choose…'}</span>`
          + `<button class="rb-reel${r ? '' : ' empty'}" data-pick="reel">${r ? gearIconHTML(r) : '+'}<span class="rb-lab"><small>Reel</small>${r ? esc(r.name) : 'Choose…'}</span></button><i class="rb-tipline"></i></div>`; }
      h += '<div class="rb-chain">';
      let side = 'l'; const adds = [];
      for (const slot of steps.slice(2)) { if (RIG_PARTS[slot].optional && !g(slot)) { adds.push(slot); continue; } h += node(slot, 'l'); }   // labels to the left of the line
      h += `</div><div class="rb-end" role="radiogroup" aria-label="The end of the line"><button data-end="bait" aria-checked="${!lureEnd}" role="radio">Hook &amp; bait</button><button data-end="lure" aria-checked="${lureEnd}" role="radio">Lure</button></div>`;
      if (adds.length) h += `<div class="rb-adds">${adds.map(slot => `<button data-pick="${slot}">+ ${RIG_PARTS[slot].label}</button>`).join('')}</div>`;
      h += '<div class="tkform">';
      if (P.float) { const dv = B.float_depth_m ?? (TackleDB.byId[P.float] || {}).depth_m ?? 1; h += `<label class="rb-depth">Float depth <output id="tkDepthV">${(+dv).toFixed(1)} m</output><input id="tkDepth" type="range" min="0.2" max="8" step="0.1" value="${dv}"></label>`; }   // how far below the float the bait hangs
      h += `<label class="rb-name">Name<input id="tkName" type="text" maxlength="40" value="${esc(B.nameSet ? B.name : rigAutoName(P))}"></label></div>`;   // named from its parts until you type your own
      if (S.errors.length) h += `<div class="tkstats bad">${S.errors.map(esc).join('<br>')}</div>`;
      else { h += `<div class="chips"><span>🎯 ${S.castMax.toFixed(0)} m</span><span>💪 ${S.strengthKg.toFixed(1)} kg</span><span>🧵 ${S.capM} m</span><span>⚖ ${S.castG.toFixed(0)} g</span></div>`;
        if (S.warnings.length) h += `<div class="tkwarn">${S.warnings.map(w => '⚠ ' + esc(w)).join('<br>')}</div>`; }
      h += `<div class="tkbtns"><button id="tkUse" ${S.errors.length ? 'disabled' : ''}>Tie on</button><button id="tkExport" ${S.errors.length ? 'disabled' : ''}>Export</button></div>`;
      body.innerHTML = h;
    } else if (T === 'gear') {
      let h = '';
      for (const t of TACKLE_TYPES.filter(t => t !== 'rig')) { const L = TackleDB.ofType(t); if (!L.length) continue; h += `<h4>${{ rod: 'Rods', reel: 'Reels', line: 'Lines', leader: 'Leaders', hook: 'Hooks', sinker: 'Sinkers', float: 'Floats', bait: 'Baits', lure: 'Lures' }[t]}</h4><ul>`;
        for (const g of L) h += `<li data-gear="${esc(g.id)}" class="card slim" title="${esc(g.description)}">${gearIconHTML(g)}<span><b>${esc(g.name)}</b><br><small>${esc(gearSummary(g))}</small></span>${g._custom ? `<i data-forget="${esc(g.id)}" title="Remove">✕</i>` : ''}</li>`;
        h += '</ul>'; }
      body.innerHTML = h + '<footer><label class="tklink">Import gear (.json)<input id="tkFile" type="file" accept=".json,application/json" multiple hidden></label></footer><pre id="tkJson" hidden></pre>';
    } else if (T === 'traps') body.innerHTML = this.trapsHTML();   // the cast net, crab pots and lobster cages (fishing/nets-traps.js)
  },
  setupTackle() {
    const el = document.getElementById('tackle'); if (!el) return;
    const body = document.getElementById('tkBody');
    document.getElementById('tkClose').onclick = () => this.toggleTackle(false);
    document.getElementById('tkFoot').addEventListener('click', e => { if (e.target.closest('#tkBuild')) { this.tackleTab = 'build'; this.tkBuild = null; this.tkPick = null; this.tackleRender(); } });
    document.getElementById('tkTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { this.tackleTab = b.dataset.tab; if (b.dataset.tab === 'build') this.tkBuild = null; this.tackleRender(); } });
    body.addEventListener('click', e => {
      if (performance.now() - (this.tackleOpenT || 0) < 350) return;   // the tap that opened the box
      const fg = e.target.closest('[data-forget]');
      if (fg) { e.stopPropagation(); const id = fg.dataset.forget; TackleDB.forget(id); const d = TackleDB.byId[id]; if (d) { TackleDB.list.splice(TackleDB.list.indexOf(d), 1); delete TackleDB.byId[id]; TackleDB.revision++; } this.say('Removed (built-in gear comes back on reload)', 2); this.tackleRender(); return; }
      const ct = e.target.closest('[data-cat]'); if (ct) { this.rigCat = ct.dataset.cat; this.tkNav = null; this.tackleRender(); return; }
      if (e.target.closest('#tkBack')) { this.tackleTab = 'rigs'; this.tackleRender(); return; }
      if (this.tackleTab === 'build') {   // the rig builder: a part tapped, an option chosen, the end of the line switched
        const B = this.tkBuild, P = B.parts, ch = e.target.closest('[data-choose]'), pk = e.target.closest('[data-pick]'), en = e.target.closest('[data-end]');
        if (ch) { const slot = this.tkPick, v = ch.dataset.choose || undefined; P[slot] = v;
          if (slot === 'lure' && v) P.hook = P.bait = undefined; if ((slot === 'bait' || slot === 'hook') && v) P.lure = undefined; if (slot === 'float') B.float_depth_m = null;
          { const steps = rigSteps(B.end === 'lure' || (!B.end && !!P.lure)), gone = [];   // anything further down the line that no longer suits it comes off
            for (const s2 of steps.slice(steps.indexOf(slot) + 1)) { const d = P[s2] && TackleDB.byId[P[s2]]; if (d && rigFit(s2, d, P)) { gone.push(d.name.toLowerCase()); P[s2] = undefined; } }
            if (gone.length) this.say(`Took off the ${gone.join(', ')}: ${gone.length > 1 ? "they don't" : "it doesn't"} suit the new ${RIG_PARTS[slot].label.toLowerCase()}`, 3.5); }
          this.tkPick = null; this.tackleRender(); body.scrollTop = 0; return; }   // back to the whole rig
        if (pk) { this.tkPick = pk.dataset.pick || null; this.tackleRender(); body.scrollTop = 0; return; }
        if (en) { B.end = en.dataset.end; if (B.end === 'lure') P.hook = P.bait = undefined; else P.lure = undefined; this.tackleRender(); return; }
      }
      const r = e.target.closest('[data-rig]'); if (r) { this.equipRig(r.dataset.rig); this.tackleRender(); return; }
      const g = e.target.closest('[data-gear]'); if (g) { const pre = document.getElementById('tkJson'); pre.textContent = TackleDB.json(g.dataset.gear); pre.hidden = false; pre.scrollIntoView({ block: 'nearest' }); return; }
      if (e.target.id === 'tkUse' || e.target.id === 'tkExport') {
        const B = this.tkBuild, nm = ((B.nameSet && B.name) || rigAutoName(B.parts)).trim(), id = 'my_' + (nm.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'rig');
        const rig = { schema: TACKLE_SCHEMA, id, type: 'rig', name: nm, description: 'Built in the tackle box', parts: Object.fromEntries(Object.entries(B.parts).filter(([, v]) => v)), drag: B.drag };
        if (B.parts.float && B.float_depth_m) rig.float_depth_m = B.float_depth_m;
        if (e.target.id === 'tkUse') { const res = TackleDB.register(rig, { save: true }); if (res.def) { const was = this.ang.phase; if (was !== 'stowed' && was !== 'ready') this.say('Saved · reel in to tie it on', 2.5); else this.equipRig(id); this.tackleTab = 'rigs'; this.tackleRender(); } else this.say(res.errors[0], 3); }
        else { // export: copied to the clipboard (a hosted page can't start a download); a download too, where the browser allows it
          const text = JSON.stringify(rig, null, 2);
          (async () => { let copied = false; try { await navigator.clipboard.writeText(text); copied = true; } catch (er) { /* no clipboard here */ }
            try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = id + '.json'; document.body.appendChild(a); a.click(); a.remove(); } catch (er) { /* blocked */ }
            this.say(copied ? `${id}.json copied to the clipboard` : 'Could not copy or download here', 2.5); })(); }
      }
    });
    body.addEventListener('input', e => { if (e.target.id === 'tkDepth') { const o = document.getElementById('tkDepthV'); if (o) o.textContent = (+e.target.value).toFixed(1) + ' m'; } });   // the slider's reading as you drag
    body.addEventListener('change', async e => {
      const t = e.target;
      if (t.dataset && t.dataset.slot) { this.tkBuild.parts[t.dataset.slot] = t.value || undefined; if (t.dataset.slot === 'lure' && t.value) { this.tkBuild.parts.hook = this.tkBuild.parts.bait = undefined; } if ((t.dataset.slot === 'bait' || t.dataset.slot === 'hook') && t.value) this.tkBuild.parts.lure = undefined; if (t.dataset.slot === 'float') this.tkBuild.float_depth_m = null; this.tackleRender(); }
      else if (t.id === 'tkDepth') { this.tkBuild.float_depth_m = clamp(+t.value || 1, 0.1, 30); this.tackleRender(); }
      else if (t.id === 'tkName') { this.tkBuild.name = t.value; this.tkBuild.nameSet = !!t.value.trim(); }
      else if (t.id === 'tkFile') { const msgs = []; for (const file of t.files) { try { for (const r of await Game.loadTackle(JSON.parse(await file.text()), { save: true })) msgs.push(r.def ? `✓ ${r.def.name}` : `✗ ${r.errors[0]}`); } catch (er) { msgs.push(`✗ ${file.name}: ${er.message}`); } } this.say(msgs.join('   '), 6); this.tackleRender(); }
    });
    document.getElementById('ccKeep').onclick = () => this.finishCatch(true);
    document.getElementById('ccRel').onclick = () => this.finishCatch(false);
    this.ov.addEventListener('mousedown', e => { if (e.button === 0 && document.pointerLockElement === this.ov && this.rodInHand()) this.keys.Mouse0 = true; });
    addEventListener('mouseup', e => { if (e.button === 0) this.keys.Mouse0 = false; });
  },
});
