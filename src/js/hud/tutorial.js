'use strict';
// ======================================================================
//  TUTORIAL — the start menu's "Tutorial": a guided first catch on the pond where you arrive.
//  You're kept to the pond until you've caught a fish; only the bobber & worm rig; controls appear as each step needs them,
//  and the one to use next glows. Steps: boats → board → paddle → paddle down → rod → cast → strike → reel → keep → journal →
//  map → new island (the finish: a fresh island loads with its map open).
//  Arctic islands (and frozen ponds) don't suit: the tutorial reloads on a temperate or tropical island first.
// ======================================================================
const Tutorial = globalThis.Tutorial = (() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const PADDLE_M = 15;
  // the on-screen controls each feature brings (desktop dock and touch buttons)
  const FEAT = {
    boats: ['#hDock [data-dock="boats"]', '#tui [data-k="KeyB"]'], use: ['#bUse'], helm: ['#bHelm'], rod: ['#hDock [data-dock="rod"]', '#bRod'],
    cast: ['#bCast'], drag: ['#bDrDn', '#bDrUp'], journal: ['#hDock [data-dock="journal"]', '#tui [data-k="KeyJ"]'],
    map: ['#hDock [data-dock="map"]', '#tui [data-k="KeyM"]'], newIsland: ['#hSeed'],
  };
  // never needed in the tutorial
  const ALWAYS_HIDDEN = ['#hDock [data-dock="tackle"]', '#tui [data-k="KeyI"]', '#tui .a-dive', '#tui [data-k^="Digit"]', '#hPin', '#ccRel'];
  // the game's keys (their original codes) that only work once a feature is unlocked; the rest of these never do here
  const KEY_FEAT = { KeyB: 'boats', KeyQ: 'rod', KeyR: 'cast', KeyM: 'map', KeyJ: 'journal', KeyN: 'newIsland', KeyV: 'helm', BracketLeft: 'drag', BracketRight: 'drag' };
  const KEY_NEVER = new Set(['KeyI', 'KeyX', 'KeyP', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad4', 'KeyY', 'KeyU', 'Enter', 'NumpadEnter']);
  const T = {
    active: false, i: 0, lock: null, paddled: 0, last: null, flags: {}, waitT: 0, helped: false, nudgeT: 0, shown: -1,
    get A() { return Engine.ang; },
    touch: () => !!Engine.touchUI,
    key: (id, glow = true) => `<kbd${glow ? ' class="glow"' : ''}>${Controls.key(id)}</kbd>`,
    btn: name => `<b>${name}</b>`,
    canoe: () => (Engine.boats || []).find(b => b.def.id === 'canoe' && T.inLock(b.x, b.y, 10)),
    inLock(x, y, extra = 0) { const L = T.lock; return !L || Math.hypot(x - L.x, y - L.y) <= L.r + extra; },
  };

  // ---- the steps: what's unlocked, what glows, what to say, when it's done ----
  // done(): true once the step is complete; latched steps stay done (their flag), the rest follow what you're doing now
  const STEPS = [
    { id: 'boats', title: 'Get a boat', feats: ['boats'], glow: ['boats'],
      text: () => T.touch() ? `Tap ${T.btn('Boats')} and choose the ${T.btn('Canoe')}.` : `Open the Boats menu (${T.key('boats')}) and choose the ${T.btn('Canoe')}. Face the water first.`,
      done: () => !!T.canoe() },
    { id: 'board', title: 'Climb aboard', feats: ['boats', 'use'], glow: ['use'],
      text: () => T.touch() ? `Walk up to the canoe and tap ${T.btn('Use')} to get in.` : `Walk up to the canoe (${T.key('forward', false)}${T.key('left', false)}${T.key('back', false)}${T.key('right', false)}) and press ${T.key('use')} to get in.`,
      done: () => !!(Engine.boat && Engine.boat.def.id === 'canoe') },
    { id: 'paddle', title: 'Paddle out', feats: ['boats', 'use'], glow: [], bar: () => Math.min(1, T.paddled / PADDLE_M),
      text: () => T.touch() ? `Push the joystick forward to paddle, left and right to steer. Paddle ${PADDLE_M} m out onto the pond.`
        : `Hold ${T.key('forward')} to paddle, ${T.key('left', false)} ${T.key('right', false)} to steer. Paddle ${PADDLE_M} m out onto the pond.`,
      latch: 'paddled', done: () => T.paddled >= PADDLE_M },
    { id: 'deck', title: 'Put the paddle down', feats: ['boats', 'use', 'helm'], glow: ['helm'],
      text: () => T.touch() ? `Tap ${T.btn('Stand')} to put the paddle down so you can fish.` : `Press ${T.key('helm')} to put the paddle down so you can fish.`,
      done: () => !!(Engine.boat && Engine.boatMode === 'deck') },
    { id: 'rod', title: 'Take out your rod', feats: ['boats', 'use', 'helm', 'rod'], glow: ['rod'],
      text: () => T.touch() ? `Tap ${T.btn('Rod')}. It's rigged with a worm under a bobber.` : `Press ${T.key('rod')} to take out your rod. It's rigged with a worm under a bobber.`,
      done: () => !!(T.A && T.A.out) },
    { id: 'cast', title: 'Cast', feats: ['boats', 'use', 'helm', 'rod', 'cast'], glow: ['cast'],
      text: () => T.touch() ? `Aim at open water, hold ${T.btn('Cast')} to wind up, and let go to cast.` : `Aim at open water. Hold ${T.key('cast')} (or the mouse button) to wind up, let go to cast.`,
      latch: 'cast', done: () => !!T.flags.cast },
    { id: 'bite', title: 'Wait for a bite, then strike', feats: ['boats', 'use', 'helm', 'rod', 'cast'], glow: ['cast'],
      text: () => `Watch the bobber. When it dips under, strike: ${T.touch() ? `tap ${T.btn('Strike')}` : `press ${T.key('cast')} or click`} right away.`,
      latch: 'hooked', done: () => !!T.flags.hooked },
    { id: 'reel', title: 'Reel it in', feats: ['boats', 'use', 'helm', 'rod', 'cast', 'drag'], glow: ['cast'],
      text: () => `Fish on! ${T.touch() ? `Hold ${T.btn('Reel')}` : `Hold ${T.key('cast')}`} to reel while it rests; ease off when it runs so the line doesn't snap.`,
      latch: 'landed', done: () => !!T.flags.landed },
    { id: 'keep', title: 'Keep your catch', feats: ['boats', 'use', 'helm', 'rod', 'cast', 'drag'], glow: [], glowSel: ['#ccUnhook', '#ccKeep'],
      text: () => T.touch() ? `Nice one! Tap ${T.btn('Unhook')} beside it, then carry it to your boat's bucket and tap ${T.btn('Bucket')}.` : `Nice one! Press ${T.key('use')} to unhook it, then carry it to your boat's bucket and press ${T.key('keep')}.`,
      latch: 'kept', done: () => !!T.flags.kept },
    { id: 'journal', title: 'Your journal', feats: ['boats', 'use', 'helm', 'rod', 'cast', 'drag', 'journal'], glow: ['journal'],
      text: () => T.touch() ? `Tap ${T.btn('Journal')} to see your fish written up.` : `Press ${T.key('journal')} to open your journal and see your fish written up.`,
      latch: 'journal', done: () => !!T.flags.journal },
    { id: 'map', title: 'The map', feats: ['boats', 'use', 'helm', 'rod', 'cast', 'drag', 'journal', 'map'], glow: ['map'],
      text: () => T.touch() ? (Engine.journalOpen ? `Close the journal (${T.btn('✕')}), then tap ${T.btn('Map')}.` : `Tap ${T.btn('Map')} to open the map.`) : `Press ${T.key('map')} to open the map${Engine.journalOpen ? ' (it closes the journal)' : ''}.`,
      latch: 'map', done: () => !!T.flags.map },
    { id: 'newIsland', title: 'A whole new island', feats: ['boats', 'use', 'helm', 'rod', 'cast', 'drag', 'journal', 'map', 'newIsland'], glow: ['newIsland'],
      text: () => `That's the pond done. ${T.touch() ? `Tap ${T.btn('New island')}` : `Press <kbd class="glow">N</kbd> (or the island button)`}, pick a biome, and a fresh island loads with its whole map open. It's yours to explore.`,
      done: () => false },
  ];
  // a latched step counts as done for everything before it, so leaving the canoe after the catch doesn't send you back
  function current() {
    let floor = 0; STEPS.forEach((s, k) => { if (s.latch && s.done()) floor = k + 1; });
    for (let k = floor; k < STEPS.length; k++) if (!STEPS[k].done()) return k;
    return STEPS.length - 1;
  }

  // ---- showing and hiding controls, the card, the glow ----
  // the card's parts, made once
  let C = null;
  function card() {
    if (C) return C;
    const el = document.createElement('div'); el.id = 'tutCard'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="tut-top"><span class="tut-step"></span><span class="tut-dots"></span></div><h3></h3><p></p><div class="tut-bar" hidden><i></i></div><div class="tut-note"></div>';
    document.body.appendChild(el);
    const q = s => el.querySelector(s);
    return C = { el, step: q('.tut-step'), dots: q('.tut-dots'), h: q('h3'), p: q('p'), bar: q('.tut-bar'), fill: q('.tut-bar i'), note: q('.tut-note'), text: '', pct: -1 };
  }
  // the controls a step shows and lights: applied once per step (the engine's own hidden flags still apply underneath)
  function controls(S) {
    const on = new Set(S.feats), glow = [...(S.glow || []).flatMap(f => FEAT[f]), ...(S.glowSel || [])];
    for (const [f, sels] of Object.entries(FEAT)) for (const sel of sels) for (const b of $$(sel)) b.classList.toggle('tut-hide', !on.has(f));
    for (const sel of ALWAYS_HIDDEN) for (const b of $$(sel)) b.classList.add('tut-hide');
    for (const b of $$('.tut-glow')) b.classList.remove('tut-glow');
    for (const sel of glow) for (const b of $$(sel)) b.classList.add('tut-glow');
  }
  // keep clear of an open panel's close button: beside the panel when the screen has room for both, else at the bottom
  function place(c) {
    const side = Engine.journalOpen ? ['#journal', 'beside-r'] : Engine.spawnOpen ? ['#spawn', 'beside-l'] : null;
    let mode = '', w = 0;
    if (side) { const r = $(side[0]).getBoundingClientRect(), free = side[1] === 'beside-r' ? innerWidth - r.right : r.left;
      w = Math.min(420, free - 32); mode = w >= 260 ? side[1] : 'low'; }
    if (mode === c.mode && w === c.w) return; c.mode = mode; c.w = w;
    c.el.classList.remove('beside-r', 'beside-l', 'low'); if (mode) c.el.classList.add(mode);
    c.el.style.setProperty('--tut-w', w + 'px');
  }
  // a new step rebuilds the card and the controls; between steps only the text (it can name a different button) and
  // the progress bar are refreshed, a few times a second, and only written when they change
  function render(force) {
    const c = card(), S = STEPS[T.i], fresh = force || T.shown !== T.i;
    c.el.hidden = !T.active;
    if (fresh) {
      T.shown = T.i; c.el.classList.remove('pop'); void c.el.offsetWidth; c.el.classList.add('pop'); c.note.textContent = '';
      c.step.textContent = `Tutorial · step ${T.i + 1} of ${STEPS.length}`;
      c.dots.innerHTML = STEPS.map((s, k) => `<i class="${k < T.i ? 'on' : k === T.i ? 'now' : ''}"></i>`).join('');
      c.h.textContent = S.title; c.bar.hidden = !S.bar; c.text = ''; c.pct = -1;
      controls(S);
    }
    place(c);
    const text = S.text(); if (text !== c.text) { c.text = text; c.p.innerHTML = text; }
    if (S.bar) { const pct = Math.round(S.bar() * 100); if (pct !== c.pct) { c.pct = pct; c.fill.style.width = pct + '%'; } }
  }
  function note(msg) { const n = card().note; n.textContent = msg; clearTimeout(T.noteT); T.noteT = setTimeout(() => { n.textContent = ''; }, 3500); }
  function clearUi() {
    for (const b of $$('.tut-hide')) b.classList.remove('tut-hide'); for (const b of $$('.tut-glow')) b.classList.remove('tut-glow');
    if (C) C.el.hidden = true; document.body.classList.remove('tut');
  }

  // ---- the pond you're kept to: a circle round the water you start beside, plus its banks ----
  function measureLock() {
    const P = Engine.P, near = findWater(-1, P.x, P.y, 120), ahead = near ? [near.wx, near.wy] : [P.x + Math.cos(P.a) * 8, P.y + Math.sin(P.a) * 8];   // the water you arrived beside
    const w0 = Game.waterAt(ahead[0], ahead[1]);
    const pts = []; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2;
      for (let r = 0; r < 220; r += 3) { const x = ahead[0] + Math.cos(a) * r, y = ahead[1] + Math.sin(a) * r, w = Game.waterAt(x, y); if (w.depth > 0 && w.id === w0.id) pts.push([x, y, w.depth]); else if (r > 6) break; } }
    if (!pts.length) return { x: P.x, y: P.y, r: 60, water: w0.id, kd: w0.kindId, deep: [] };
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const far = Math.max(...pts.map(p => Math.hypot(p[0] - cx, p[1] - cy)));
    return { x: cx, y: cy, r: clamp(Math.max(far, Math.hypot(P.x - cx, P.y - cy)) + 22, 40, 240), water: w0.id, kd: w0.kindId,
      deep: (d => d.length ? d : pts.filter(p => p[2] > 0.3))(pts.filter(p => p[2] > 0.6)) };   // the deeper water, else whatever's swimmable
  }
  // a small pond can hold only a fish or two: stock it up for the lesson with the species that really live in it,
  // in their usual small groups, spread round the deeper water
  function stockPond(target = 14) {
    const L = T.lock, spots = L.deep && L.deep.length ? L.deep : null; if (!spots) return 0;
    const here = (Engine.fish || []).filter(f => !f.dead && f.def && !f.def._herp && !f.def._shell && Game.waterAt(f.x, f.y).id === L.water).length;   // real fish only: crayfish and frogs don't count
    const env = envAt(spots[0][0], spots[0][1], true, false);
    const kinds = FishDB.byKind(L.kd).filter(([D]) => !D._herp && !D._shell && !D.behavior.haul_out).map(([D, si]) => ({ D, si, w: habitatScore(D, env, undefined, false) * D.population.density })).filter(k => k.w > 0);
    if (!kinds.length) return 0;
    const tot = kinds.reduce((t, k) => t + k.w, 0), made = [], rnd = Math.random;
    while (here + made.length < target) {
      let r = rnd() * tot, K = kinds[0]; for (const k of kinds) { r -= k.w; if (r <= 0) { K = k; break; } }
      const Sc = K.D.population.school, n = clamp(Math.round(Sc.min + rnd() * (Sc.max - Sc.min)), 1, Math.min(4, target - here - made.length)), [hx, hy] = spots[rnd() * spots.length | 0], g = [];
      for (let k = 0; k < n; k++) {
        const f = Engine.makeFish({ si: K.si, id: `tutorial#${Engine.spawnN = (Engine.spawnN || 0) + 1}`, hx: hx + (rnd() - 0.5) * 3, hy: hy + (rnd() - 0.5) * 3, size: sampleFishSize(K.D, rnd), lead: k ? 0 : -1, r: rnd() });
        f.state = 'rest'; f.tNext = 1 + rnd() * 3; f.spawned = true;
        if (k) { f.leader = g[0]; const s = f.len * 1.6 + 0.3; f.ox = (rnd() - 0.7) * s * 2; f.oy = (rnd() - 0.5) * s * 2; f.oz = (rnd() - 0.5) * 0.5; }
        g.push(f);
      }
      made.push(...g);
    }
    Engine.spawned.push(...made); Engine.fish.push(...made);
    return made.length;
  }
  function keepIn() {
    const L = T.lock, P = Engine.P, b = Engine.boat;
    const pull = o => { const dx = o.x - L.x, dy = o.y - L.y, d = Math.hypot(dx, dy); if (d <= L.r) return false; o.x = L.x + dx / d * L.r; o.y = L.y + dy / d * L.r; return true; };
    let out = false;
    if (b) { if (pull(b)) { b.v = Math.min(b.v || 0, 0) * 0.5; out = true; } } else if (pull(P)) out = true;
    if (out && Engine.time - T.nudgeT > 3) { T.nudgeT = Engine.time; note('Stay by the pond until you\'ve caught your first fish.'); }
  }

  // ---- start, stop ----
  function suitable() {
    if (CLIMATE.key === 'arctic') return false;
    const P = Engine.P, f = findWater(-1, P.x, P.y, 120), w = f && Game.waterAt(f.wx, f.wy);
    return !!w && w.depth > 0.4;
  }
  function begin() {
    const P = Engine.P;
    T.lock = measureLock();
    const w = Game.waterAt(T.lock.x, T.lock.y);
    if (w.iced || ENV.iced?.(w.kindId, w.depth, T.lock.x, T.lock.y)) Game.setSeason('summer');   // a frozen pond is no place to learn
    if (Game.hour < 7 || Game.hour > 18.5) Game.hour = 9;                                        // daylight
    Game.setWeather('clear');
    Engine.boats = (Engine.boats || []).filter(b => Math.hypot(b.x - P.x, b.y - P.y) > 250);    // the canoe you get is the one you spawn
    if (Engine.ang && Engine.ang.out) Engine.toggleRod(false);
    Engine.equipRig('bobber_worm', true);
    T.stocked = stockPond();
    T.active = true; T.flags = {}; T.paddled = 0; T.last = null; T.i = 0; T.shown = -1; T.waitT = 0; T.helped = false;
    document.body.classList.add('tut'); render(true);
    Game.say('Tutorial: your first fish', 3);
  }
  function finish() { T.active = false; clearUi(); }
  // the start menu's button: here if this island suits, else a reload onto a temperate or tropical one
  function start() {
    if (!Engine.titleOpen) return;
    if (!suitable()) {
      try { sessionStorage.setItem('ow-tutorial', '1'); } catch (e) { /* */ }
      const tl = $('#title'); tl.classList.add('busy'); $('#tiSub').textContent = 'Finding a good pond for the tutorial…';
      const k = Math.random() < 0.5 ? 'temperate' : 'tropical';
      setTimeout(() => { try { history.replaceState(null, '', location.pathname + location.search + '#climate-' + k); } catch (e) { /* */ } location.reload(); }, 150);
      return;
    }
    leaveTitle(); begin();
  }
  function leaveTitle() {
    const tl = $('#title'); Engine.titleOpen = false; Engine.keys = {}; tl.classList.add('leaving'); document.body.classList.remove('title-on');
    setTimeout(() => { tl.hidden = true; }, 650); Engine.ov.focus({ preventScroll: true }); Engine.requestMouseLook && Engine.requestMouseLook();
  }

  // ---- what's allowed while it runs ----
  const keyPress = Engine.keyPress;
  Engine.keyPress = function (code, e, card) {
    if (T.active) {
      const f = KEY_FEAT[code], S = STEPS[T.i];
      const blocked = KEY_NEVER.has(code) || (f && !S.feats.includes(f)) || (code === 'KeyC' && !this.boat);
      if (blocked) { this.keys[code] = false; if (!e.repeat && code !== 'Enter') note(f ? 'Not yet: follow the steps above.' : "Not in the tutorial."); return; }
    }
    return keyPress.call(this, code, e, card);
  };
  const toggleRod = Engine.toggleRod;
  Engine.toggleRod = function (on = !this.ang.out) {
    if (T.active && on && !STEPS[T.i].feats.includes('rod')) { note('Paddle out first, then put the paddle down.'); return; }
    return toggleRod.call(this, on);
  };
  const equipRig = Engine.equipRig;
  Engine.equipRig = function (id, quiet) { if (T.active && id !== 'bobber_worm') { note('The tutorial uses the bobber & worm.'); return false; } return equipRig.call(this, id, quiet); };
  const finishCatch = Engine.finishCatch;
  Engine.finishCatch = function (keep) { if (T.active && !keep) { note('Keep this one: it goes in your journal.'); return; } return finishCatch.call(this, keep); };
  const spawnItems = Engine.spawnItems;
  Engine.spawnItems = function () { const L = spawnItems.call(this); return T.active && this.spawnTab === 'boats' ? L.filter(D => D.id === 'canoe') : L; };
  const spawnBoat = Engine.spawnBoat;
  Engine.spawnBoat = function (id) {
    if (T.active && id !== 'canoe') { note('The tutorial uses the canoe.'); return null; }
    if (T.active && T.canoe()) { note('Your canoe is already on the water.'); return null; }
    return spawnBoat.call(this, id);
  };
  const travel = Engine.travel;
  Engine.travel = function (...a) { if (T.active) { note('No travelling until you\'ve caught a fish.'); return; } return travel.apply(this, a); };
  const seedPress = Engine.seedPress;
  Engine.seedPress = function () {
    if (T.active && STEPS[T.i].id !== 'newIsland') { note('Not yet: follow the steps above.'); return; }
    if (T.active) note('Pick a biome for the new island.');
    return seedPress.call(this);
  };
  const newIsland = Engine.newIsland;
  Engine.newIsland = function (k) { if (T.active) { try { sessionStorage.setItem('ow-tutorial-done', '1'); } catch (e) { /* */ } } return newIsland.call(this, k); };

  // ---- following along ----
  Game.on('cast', () => { if (T.active) { T.flags.cast = true; T.waitT = 0; T.helped = false; } });
  Game.on('miss', () => { if (T.active && !T.flags.hooked) note('Missed it! Strike the moment the bobber goes under. Wait for the next bite.'); });
  Game.on('hooked', () => { if (T.active) T.flags.hooked = true; });
  Game.on('lost', () => { if (T.active && !T.flags.landed) { T.flags.hooked = false; T.flags.cast = false; note('It got away. Cast again: reel gently while it pulls.'); } });
  Game.on('landed', () => { if (T.active) T.flags.landed = true; });
  Game.on('catch', rec => { if (T.active && rec.kept) T.flags.kept = true; });
  Game.on('update', dt => {
    if (!T.active) return;
    const P = Engine.P, b = Engine.boat, A = T.A;
    keepIn();
    if (b && Engine.boatMode !== 'deck') { if (T.last) T.paddled += Math.hypot(b.x - T.last[0], b.y - T.last[1]); T.last = [b.x, b.y]; } else T.last = null;
    // back to casting when the bobber comes in empty or the rod goes away before a fish is on
    if (T.flags.cast && !T.flags.hooked && A && (!A.out || A.phase === 'ready' || A.phase === 'stowed')) { T.flags.cast = false; if (A.out) note('Cast again.'); }
    if (Engine.journalOpen && STEPS[T.i].id === 'journal') T.flags.journal = true;
    if (Engine.showMap && STEPS[T.i].id === 'map') { T.flags.map = true; if (Engine.journalOpen) Engine.toggleJournal(false); }
    // a slow pond: after a while with no bite, a hungry fish comes over to the bobber
    if (STEPS[T.i].id === 'bite' && A && (A.phase === 'water') && !T.helped && (T.waitT += dt) > 40) { T.helped = true; helper(); }
    const pan = !!Engine.journalOpen + 2 * !!Engine.spawnOpen; if (pan !== T.pan) { T.pan = pan; T.uiT = 0; }
    const k = current(); if (k !== T.i) { T.i = k; render(); T.uiT = 0; }
    else if ((T.uiT = (T.uiT || 0) - dt) <= 0) { T.uiT = 0.2; render(); }
  });
  function helper() {
    const P = Engine.P, near = (Engine.fish || []).filter(f => !f.hooked && Math.hypot(f.x - P.x, f.y - P.y) < (T.lock ? T.lock.r : 80)).map(f => f.species);
    const id = near.length ? near[Math.random() * near.length | 0] : ['bluegill', 'pumpkinseed', 'yellow_perch', 'tilapia'].find(s => FishDB.byId[s]);
    if (id) { Engine.spawnAnimal(id); note('Something\'s moving near your bobber…'); }
  }
  // the map: the pond's boundary while the tutorial runs
  Game.onMap((c, toPx) => {
    if (!T.active || !T.lock) return; const L = T.lock, [x, y] = toPx(L.x, L.y), [x2] = toPx(L.x + L.r, L.y), r = Math.abs(x2 - x);
    c.save(); c.setLineDash([6, 5]); c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,217,140,.9)'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5); c.arc(x, y, r, 0, Math.PI * 2); c.fill('evenodd'); c.restore();
  });

  // ---- the start menu button, and arriving after a reload ----
  const btn = $('#tiTut'); if (btn) btn.onclick = start;
  Game.on('ready', () => {
    let go = false, done = false;
    try { go = sessionStorage.getItem('ow-tutorial') === '1'; sessionStorage.removeItem('ow-tutorial'); done = sessionStorage.getItem('ow-tutorial-done') === '1'; sessionStorage.removeItem('ow-tutorial-done'); } catch (e) { /* */ }
    if (go) setTimeout(() => { if (Engine.titleOpen) { leaveTitle(); begin(); } }, 60);
    if (done) setTimeout(() => Game.say('Tutorial complete! This island is all yours: explore, and catch everything.', 7), 400);
  });
  return Object.assign(T, { STEPS, start, begin, finish, render });
})();
