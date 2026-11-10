'use strict';
// FISHING: nets and traps: a small cast net, crab pots and lobster cages (tackle box → Nets).
// Take one in hand from the tackle box, then Use (F). The net is thrown over the water in front of you and hauled
// straight back with whatever small fish and shrimp were under it. A pot or cage thrown from the bank is tied to a
// stake at your feet; dropped from a boat (or while swimming) it hangs under a buoy. Use again at the stake or the
// buoy hauls it. Pots catch from the animals that really live around them (cellFish), more the longer they soak,
// and what's set stays out between visits (saved per island).
//   Engine.traps -> { hand: kind in hand or null, set: [{ kind, x, y, ax, ay (stake; null = buoy), kd, h (game hours soaked) }] }
(() => {
  const { MT } = Game;
  const KINDS = {
    cast_net: { name: 'Cast net', icon: 'net', use: 'Throw', blurb: 'Thrown by hand over small fish and shrimp, up to 9 m out.' },
    crab_pot: { name: 'Crab pot', icon: 'pot', use: 'Set', max: 4, holds: 6, blurb: 'Crabs, and crayfish in fresh water.', buoy: [1.5, 0.55, 0.12],
      takes: D => D.body.plan === 'crab' ? 1 : D.body.plan === 'lobster' ? (D.size.length_cm.typical <= 15 ? 1 : 0.2) : 0 },
    lobster_cage: { name: 'Lobster cage', icon: 'cage', use: 'Set', max: 4, holds: 4, blurb: 'Lobsters, and the odd crab.', buoy: [1.3, 0.12, 0.1],
      takes: D => D.body.plan === 'lobster' ? (D.size.length_cm.typical <= 15 ? 0.3 : 1) : D.body.plan === 'crab' ? 0.3 : 0 },
  };
  const T = Engine.traps = { hand: null, set: [], net: null, busy: 0, saveT: 0 };
  const NET_R = 1.8, POT_R = 26, SOAK_H = 1.5;   // net radius (m); how far a pot draws from (m); game hours for a pot to do ~63% of its work
  const useKey = () => Engine.touchUI ? 'Use' : Controls.key('use');
  const say = (t, s = 2.5) => Game.say(t, s);

  // ---- meshes (metres, base at z = 0) ----
  const WIRE = [0.15, 0.3, 0.24], ROPE = [0.8, 0.72, 0.5], LATH = [0.55, 0.4, 0.24], LEAD = [0.4, 0.42, 0.45];
  { // crab pot: a square wire cage with a bait jar
    const b = Game.mesh(), s = 0.32, h = 0.26, w = (p, q, r = 0.012) => b.tube(p, q, r, r, 4, WIRE, false); b.mat = MT.METAL;
    const C = [[-s, -s], [s, -s], [s, s], [-s, s]];
    for (let i = 0; i < 4; i++) { const [x0, y0] = C[i], [x1, y1] = C[(i + 1) % 4];
      w([x0, y0, 0.02], [x1, y1, 0.02]); w([x0, y0, h], [x1, y1, h]); w([x0, y0, 0.02], [x0, y0, h]); w([x0, y0, h / 2], [x1, y1, h / 2], 0.006);
      for (const k of [1 / 3, 2 / 3]) { const mx = x0 + (x1 - x0) * k, my = y0 + (y1 - y0) * k; w([mx, my, 0.02], [mx, my, h], 0.006); } }
    for (const k of [-s / 3, s / 3]) for (const z of [0.02, h]) { w([k, -s, z], [k, s, z], 0.006); w([-s, k, z], [s, k, z], 0.006); }
    b.mat = MT.GEN; b.tube([0, 0, 0.03], [0, 0, 0.15], 0.05, 0.05, 6, [0.9, 0.5, 0.15], true);
    Game.registerMesh('trap_crab_pot', b.done());
  }
  { // lobster cage: a half-round lath trap on a slatted base
    const b = Game.mesh(), L = 0.45, W = 0.26, H = 0.3, n = 6; b.mat = MT.WOOD;
    const hoop = k => [Math.cos(Math.PI * k / n) * W, 0.03 + Math.sin(Math.PI * k / n) * H];
    for (const x of [-L, 0, L]) for (let k = 0; k < n; k++) { const [y0, z0] = hoop(k), [y1, z1] = hoop(k + 1); b.tube([x, y0, z0], [x, y1, z1], 0.016, 0.016, 4, LATH, false); }
    for (let k = 0; k <= n; k++) { const [y, z] = hoop(k); b.tube([-L, y, z], [L, y, z], 0.011, 0.011, 4, LATH, false); }
    for (const y of [-W * 0.5, 0, W * 0.5]) b.tube([-L, y, 0.03], [L, y, 0.03], 0.014, 0.014, 4, LATH, false);
    for (const x of [-L, L]) b.tube([x, -W, 0.03], [x, W, 0.03], 0.016, 0.016, 4, LATH, false);
    Game.registerMesh('trap_lobster_cage', b.done());
  }
  { // the stake a bank-set pot is tied to
    const b = Game.mesh(); b.mat = MT.WOOD; b.tube([0, 0, -0.3], [0, 0, 1], 0.04, 0.033, 6, [0.45, 0.32, 0.18], true);
    b.mat = MT.CLOTH; b.tube([0, 0, 0.8], [0, 0, 0.92], 0.052, 0.052, 6, ROPE, false);
    Game.registerMesh('trap_stake', b.done());
  }
  for (const [kind, K] of Object.entries(KINDS)) if (K.buoy) { // buoys: orange for crab pots, red for lobster cages, white below
    const b = Game.mesh(); b.mat = MT.WOOD; b.tube([0, 0, -0.2], [0, 0, 0.6], 0.014, 0.014, 4, [0.3, 0.22, 0.14], true);
    b.mat = MT.PLASTER; b.blob([0, 0, 0.06], 0.13, 0.13, 0.2, 6, 8, i => i < 3 ? K.buoy : [0.92, 0.92, 0.88]);
    Game.registerMesh('trap_buoy_' + kind, b.done());
  }
  { // the cast net, open on the water: spokes, rings and a lead line round the rim
    const b = Game.mesh(), n = 10, col = [0.86, 0.87, 0.8], at = (k, r) => [Math.cos(k / n * 6.2832) * r, Math.sin(k / n * 6.2832) * r, 0]; b.mat = MT.CLOTH;
    for (let k = 0; k < n; k++) { b.tube([0, 0, 0], at(k, NET_R), 0.008, 0.008, 3, col, false);
      for (const r of [NET_R / 3, NET_R * 2 / 3, NET_R]) b.tube(at(k, r), at(k + 1, r), 0.008, 0.008, 3, col, false); }
    b.mat = MT.METAL; for (let k = 0; k < n; k++) b.blob(at(k + 0.5, NET_R * 0.98), 0.03, 0.03, 0.03, 3, 4, LEAD);
    Game.registerMesh('cast_net', b.done());
  }

  // ---- what's set out: props in the world, saved per island ----
  const key = () => 'engine-traps-' + CONFIG.saveName + '-' + SEED;
  const save = () => { if (!CONFIG.saveProgress) return;
    try { localStorage.setItem(key(), JSON.stringify({ t: Date.now(), set: T.set.map(({ kind, x, y, ax, ay, kd, h }) => ({ kind, x, y, ax, ay, kd, h })) })); } catch (e) { /* storage unavailable */ } };
  let ropeN = 0;
  const place = tr => {   // the pot on the bed, its stake or buoy, and the rope between them
    const w = Game.waterAt(tr.x, tr.y), gz = w.ground, staked = tr.ax != null, ox = staked ? tr.ax : tr.x, oy = staked ? tr.ay : tr.y, oz = staked ? Game.groundAt(ox, oy) : w.level;
    const b = Game.mesh(), pot = [tr.x - ox, tr.y - oy, gz - oz + 0.25], rope = (p, q) => b.tube(p, q, 0.012, 0.012, 4, ROPE, false); b.mat = MT.CLOTH;
    if (staked) { const mid = [pot[0] * 0.55, pot[1] * 0.55, Math.min(0.5, w.level - oz - 0.05)]; rope([0, 0, 0.86], mid); rope(mid, pot); } else rope([0, 0, -0.1], pot);
    tr.rope = 'trap_rope_' + (++ropeN); Game.registerMesh(tr.rope, b.done());   // shortcut: rope meshes of hauled pots stay on the GPU until reload (a few hundred bytes each); free them if pots ever get set by the hundred
    tr.props = [Game.addProp('trap_' + tr.kind, tr.x, tr.y, { z: gz, rot: (tr.x * 7.3 + tr.y * 3.1) % 6.2832 }), Game.addProp(tr.rope, ox, oy, { z: oz }),
      staked ? Game.addProp('trap_stake', ox, oy, { z: oz }) : Game.addProp('trap_buoy_' + tr.kind, ox, oy, { z: oz })];
    Engine.propKey = null;
  };
  const unplace = props => { Engine.props = Engine.props.filter(p => !props.includes(p)); Engine.propKey = null; };
  const anchor = tr => tr.ax != null ? [tr.ax, tr.ay, 3] : [tr.x, tr.y, Engine.boat ? 7 : 4];   // where you haul from, and how close you must be
  const nearTrap = () => { const P = Game.player; let best = null, bd = 1e9;
    for (const tr of T.set) { const [x, y, r] = anchor(tr), d = Math.hypot(x - P.x, y - P.y); if (d <= r && d < bd && Engine.time - (tr.born ?? -9) > 1.5) { bd = d; best = tr; } }   // not the one you set a moment ago (a second press)
    return best; };
  const soaked = h => h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toFixed(1)} h`;

  // ---- catches go straight in the creel and the journal ----
  const bank = (gear, kd, list) => {   // list: [{ species, name, lengthCm, weightKg }]; returns "2 × Blue crab · 1 × …"
    if (!list.length) return '';
    const recs = list.map(f => ({ species: f.species, name: f.name, cm: +f.lengthCm.toFixed(1), kg: +f.weightKg.toFixed(3), t: Date.now(), rig: gear, kept: true, water: WATER_KEYS[kd], climate: CLIMATE.key, seed: SEED }));
    const log = Engine.catchLog(); log.push(...recs); try { localStorage.setItem(Engine.catchKey(), JSON.stringify(log.slice(-500))); } catch (e) { /* */ }
    for (const r of recs) Game.emit('catch', r, null);
    if (Engine.journalOpen) Engine.journalRender();
    const n = {}; for (const f of list) n[f.name] = (n[f.name] || 0) + 1;
    return Object.entries(n).map(([name, k]) => `${k} × ${name}`).join(' · ');
  };
  const takeLive = f => { Engine.removeFish(f); Engine.fish = Engine.fish.filter(q => q !== f); for (const c of Engine.fishCells.values()) { const i = c.fish.indexOf(f); if (i >= 0) { c.fish.splice(i, 1); break; } } };

  // ---- the water in front of you: under the crosshair when that's in reach, else a few metres ahead ----
  const aim = maxD => { const P = Game.player, l = Game.lookingAt;
    if (l && l.dist <= maxD) return { x: l.x, y: l.y };
    for (const d of [maxD * 0.6, maxD * 0.35, maxD]) { const x = P.x + Math.cos(P.a) * d, y = P.y + Math.sin(P.a) * d; if (Game.isWater(x, y)) return { x, y }; }
    return null; };

  // ---- the cast net ----
  const throwNet = () => {
    if (T.net || Engine.time < T.busy) return;
    if (Game.swimming) return say("You can't throw a net while swimming", 2);
    const p = aim(9); if (!p) return say('Face the water: the net reaches about 9 m');
    if (Game.waterAt(p.x, p.y).iced) return say("It's frozen over there", 2);
    T.net = { x: p.x, y: p.y, t0: Engine.time, prop: null }; say('Net away…', 1);
  };
  const netStep = () => { const N = T.net; if (!N) return; const t = Engine.time - N.t0;
    if (!N.prop && t > 0.5) { const w = Game.waterAt(N.x, N.y); N.kd = w.kindId; N.wl = w.level;   // it lands open and sinks
      N.prop = Game.addProp('cast_net', N.x, N.y, { z: w.level - 0.05, rot: Math.random() * 6.28 }); Engine.propKey = null; Game.splash(N.x, N.y, 24); Game.sound('plop', { x: N.x, y: N.y }); }
    if (N.prop && t > 2.2) {   // hauled: small fish and shrimp that were under it, down to 3.5 m
      const got = Game.fishNear(N.x, N.y, NET_R).filter(f => !f.hooked && f.lengthCm <= 40 && ['fish', 'shrimp'].includes(f.def.body.plan || 'fish') && f.z > N.wl - 3.5 && Math.random() < 0.8).slice(0, 12);
      got.forEach(takeLive); unplace([N.prop]); T.net = null; T.busy = Engine.time + 0.8; Game.ripple(N.x, N.y, 1); Game.disturb(N.x, N.y, 1.5);
      const sum = bank('Cast net', N.kd, got); say(sum ? `Cast net: ${sum}` : 'The net came up empty', sum ? 5 : 2.5);
    } };

  // ---- pots and cages ----
  const setPot = kind => { const K = KINDS[kind], P = Game.player;
    if (T.set.filter(t => t.kind === kind).length >= K.max) return say(`All ${K.max} are out: haul one first`);
    const afloat = !!Engine.boat || Game.swimming; let p;
    if (afloat) { const x = P.x + Math.cos(P.a) * 2.5, y = P.y + Math.sin(P.a) * 2.5; p = Game.isWater(x, y) ? { x, y } : { x: P.x, y: P.y }; } else p = aim(10);
    if (!p || !Game.isWater(p.x, p.y)) return say('Face the water: you can throw it about 10 m');
    const w = Game.waterAt(p.x, p.y);
    if (w.iced) return say("It's frozen over there", 2);
    if (w.depth < 0.4) return say('Too shallow there');
    const tr = { kind, x: p.x, y: p.y, ax: afloat ? null : P.x, ay: afloat ? null : P.y, kd: w.kindId, h: 0, born: Engine.time };
    T.set.push(tr); place(tr); save(); Game.splash(p.x, p.y, 20); Game.sound('plop', { x: p.x, y: p.y });
    const left = K.max - T.set.filter(t => t.kind === kind).length; if (!left) T.hand = null;
    say(`${K.name} ${afloat ? 'down under a buoy' : 'out, tied to a stake'} · ${w.depth.toFixed(1)} m deep · ${left ? left + ' left' : 'none left in the box'}`, 3.5);
    if (Engine.tackleOpen) Engine.tackleRender();
  };
  // the animals living within reach of a pot that it can take, nearest first: [{ sp (cellFish entry), D, d }]
  const candidates = tr => { const K = KINDS[tr.kind], cs = FISH_CELL, out = [];
    for (let cy = Math.floor((tr.y - POT_R) / cs); cy <= Math.floor((tr.y + POT_R) / cs); cy++) for (let cx = Math.floor((tr.x - POT_R) / cs); cx <= Math.floor((tr.x + POT_R) / cs); cx++)
      for (const sp of cellFish(cx, cy)) { const D = FishDB.list[sp.si], w = K.takes(D), d = Math.hypot(sp.hx - tr.x, sp.hy - tr.y);
        if (w && d <= POT_R && +(/\.(\d+)#/.exec(sp.id) || [])[1] === tr.kd && !Engine.isGone(sp.id)) out.push({ sp, D, d, w }); }   // same water as the pot, and not caught already
    return out.sort((a, b) => a.d - b.d); };
  const haul = tr => { const K = KINDS[tr.kind], C = candidates(tr), work = 1 - Math.exp(-tr.h / SOAK_H), got = [];
    for (const c of C) { if (got.length >= K.holds) break; if (Math.random() < c.w * work * Math.sqrt(1 - c.d / POT_R)) got.push(c); }
    for (const { sp } of got) { const live = Engine.fish.find(f => f.id === sp.id); if (live) takeLive(live); else Engine.removeFish({ id: sp.id }); }
    T.set = T.set.filter(t => t !== tr); unplace(tr.props); save(); Game.splash(tr.x, tr.y, 14);
    const sum = bank(K.name, tr.kd, got.map(({ sp, D }) => ({ species: D.id, name: D.name, lengthCm: sp.size.cm, weightKg: sp.size.kg })));
    say(sum ? `${K.name}: ${sum}` : `${K.name} came up empty: ${!C.length ? 'nothing for it lives round here' : tr.h < 0.5 ? 'give it longer' : 'no luck this time'}`, sum ? 5 : 3.5);
    if (Engine.tackleOpen) Engine.tackleRender();
  };

  // ---- in hand, and what Use does ----
  const take = kind => { const A = Engine.ang;
    if (kind && A && A.out) { if (A.phase !== 'ready') return say('Reel in first', 2); Engine.toggleRod(false); }
    T.hand = kind; if (!kind) return say('Put away', 1.5);
    const K = KINDS[kind]; say(`${K.name} in hand · ${useKey()} to ${kind === 'cast_net' ? 'throw it' : 'set it'}`, 3.5); Engine.toggleTackle(false);
  };
  const useLabel = () => { const A = Engine.ang; if (A && A.phase === 'card') return null; return T.hand ? KINDS[T.hand].use : nearTrap() ? 'Haul' : null; };
  Engine.trapUseLabel = useLabel;   // the touch Use button's word (overlay.js)
  const baseAction = Engine.action;
  Engine.action = function () { const near = !T.hand && nearTrap();
    if (T.hand) return T.hand === 'cast_net' ? throwNet() : setPot(T.hand);
    if (near) return haul(near);
    return baseAction.call(this); };
  const baseRod = Engine.toggleRod;
  Engine.toggleRod = function (on = !this.ang.out) { if (on) T.hand = null; return baseRod.call(this, on); };   // the rod out puts the net or pot away
  const baseKeys = Engine.contextKeys;
  Engine.contextKeys = function () { const out = baseKeys.call(this), l = useLabel(); return l ? [[Controls.key('use'), l], ...out].slice(0, 4) : out; };

  Game.on('update', () => {
    for (const tr of T.set) tr.h += Engine.dtH || 0;
    netStep();
    if (T.set.length && Engine.time - T.saveT > 20) { T.saveT = Engine.time; save(); }   // soak time survives a reload
  });
  Game.on('ready', () => { if (!CONFIG.saveProgress) return;
    try { const d = JSON.parse(localStorage.getItem(key()) || 'null');
      for (const s of (d && d.set) || []) if (KINDS[s.kind] && KINDS[s.kind].max && isFinite(s.x) && isFinite(s.y) && Game.isWater(s.x, s.y)) { const tr = { kind: s.kind, x: s.x, y: s.y, ax: isFinite(s.ax) && s.ax != null ? s.ax : null, ay: isFinite(s.ay) && s.ay != null ? s.ay : null, kd: s.kd | 0, h: +s.h || 0 }; if (tr.ay == null) tr.ax = null; T.set.push(tr); place(tr); }
    } catch (e) { /* storage unavailable */ } });
  // under the place name: the pot you're standing at, or what's in your hand
  Game.onHud(() => { const A = Engine.ang; if (A && A.phase === 'card') return; const tr = !T.hand && nearTrap();
    if (tr) Engine.hudDetail = `${KINDS[tr.kind].name}  ·  set ${soaked(tr.h)} ago  ·  ${useKey()} to haul`;
    else if (T.hand) Engine.hudDetail = `${KINDS[T.hand].name} in hand  ·  ${useKey()} to ${T.hand === 'cast_net' ? 'throw' : Engine.boat || Game.swimming ? 'drop under a buoy' : 'set from the bank'}`; });
  // on the map: a dot where each pot is hauled from
  Game.onMap((c, toPx, inside) => { for (const tr of T.set) { const [x, y] = anchor(tr), [px, py] = toPx(x, y); if (inside && !inside(px, py)) continue;
    const [r, g, b] = KINDS[tr.kind].buoy; c.beginPath(); c.arc(px, py, 4, 0, 6.2832); c.fillStyle = `rgb(${Math.min(255, r * 170) | 0},${Math.min(255, g * 170) | 0},${Math.min(255, b * 170) | 0})`; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.stroke(); } });

  // ---- the tackle box's Nets tab ----
  Engine.trapsHTML = function () { const P = Game.player;
    let h = '<ul class="cards">';
    for (const [kind, K] of Object.entries(KINDS)) { const out = T.set.filter(t => t.kind === kind).length, on = T.hand === kind, none = K.max && out >= K.max;
      h += `<li data-trap="${kind}" class="card${on ? ' on' : ''}${none ? ' bad' : ''}"><span class="ri">${uiIcon('ui.' + K.icon)}</span><span class="tx"><b>${K.name}</b><small>${K.blurb}</small>`
        + `${K.max ? `<small class="end">${K.max - out} of ${K.max} in the box</small>` : ''}</span>${on ? '<em class="badge">In hand</em>' : ''}</li>`; }
    h += '</ul>';
    if (T.set.length) { h += '<h4>Out now</h4><ul>';
      for (const tr of T.set) { const [x, y] = anchor(tr); h += `<li class="card slim" style="cursor:default"><span><b>${KINDS[tr.kind].name}</b><br><small>${WATER_KEYS[tr.kd]} · ${tr.ax != null ? 'stake' : 'buoy'} · set ${soaked(tr.h)} ago · ${Math.round(Math.hypot(x - P.x, y - P.y))} m away</small></span></li>`; }
      h += '</ul>'; }
    return h + `<footer>Pick one, then ${useKey()}. From the bank a pot is tied to a stake; from a boat it hangs under a buoy. ${useKey()} at the stake or buoy hauls it. Pots fill slowly: leave them an hour or two of game time. They show on the map.</footer>`;
  };
  document.getElementById('tkBody').addEventListener('click', e => { const li = e.target.closest('[data-trap]'); if (!li || performance.now() - (Engine.tackleOpenT || 0) < 350) return;
    const kind = li.dataset.trap, K = KINDS[kind];
    if (T.hand === kind) { take(null); Engine.tackleRender(); return; }
    if (K.max && T.set.filter(t => t.kind === kind).length >= K.max) return say(`All ${K.max} are out: haul one first`);
    take(kind); });
})();
