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
    crab_pot: { name: 'Crab pot', icon: 'pot', use: 'Set', max: 2, holds: 6, blurb: 'Crabs, and crayfish in fresh water.', buoy: [1.5, 0.55, 0.12],
      takes: D => D.body.plan === 'crab' ? 1 : D.body.plan === 'lobster' ? (D.size.length_cm.typical <= 15 ? 1 : 0.2) : 0 },
    lobster_cage: { name: 'Lobster cage', icon: 'cage', use: 'Set', max: 2, holds: 4, blurb: 'Lobsters, and the odd crab.', buoy: [1.3, 0.12, 0.1],
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
    for (const tr of T.set) { const [x, y, r] = anchor(tr), d = Math.hypot(x - P.x, y - P.y); if (d <= r && d < bd && !tr.pull && Engine.time - (tr.born ?? -9) > 1.5) { bd = d; best = tr; } }   // not the one you set a moment ago (a second press)
    return best; };
  const soaked = h => h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toFixed(1)} h`;

  // ---- catches go straight in the creel and the journal ----
  const record = (gear, kd, list) => {   // list: [{ species, name, lengthCm, weightKg, kept }], into the journal
    if (!list.length) return;
    const recs = list.map(f => ({ species: f.species, name: f.name, cm: +f.lengthCm.toFixed(1), kg: +f.weightKg.toFixed(3), t: Date.now(), rig: gear, kept: !!f.kept, water: WATER_KEYS[kd], climate: CLIMATE.key, seed: SEED }));
    const log = Engine.catchLog(); log.push(...recs); try { localStorage.setItem(Engine.catchKey(), JSON.stringify(log.slice(-500))); } catch (e) { /* */ }
    for (const r of recs) Game.emit('catch', r, null);
    if (Engine.journalOpen) Engine.journalRender();
  };
  const tally = list => { const n = {}; for (const f of list) n[f.name] = (n[f.name] || 0) + 1; return Object.entries(n).map(([name, k]) => `${k} × ${name}`).join(' · '); };   // "2 × Blue crab · 1 × …"
  // ---- what came up: keep it or let it go, one by one or all at once (E keeps what's marked, X lets the lot go) ----
  // items: [{ species, name, lengthCm, weightKg, keep(), free() }]: keep() takes the animal out of the world, free() puts it back
  let cardEl = null;
  const cardDraw = () => { const Cd = T.card; if (!cardEl) { cardEl = document.createElement('div'); cardEl.id = 'haul'; cardEl.className = 'panel'; document.body.appendChild(cardEl);
      cardEl.addEventListener('click', e => { const t = e.target, row = t.closest && t.closest('[data-i]'); if (!T.card) return; if (t.id === 'haulKeep') return decide(false); if (t.id === 'haulFree') return decide(true); if (row) { const it = T.card.items[+row.dataset.i]; it.kept = !it.kept; cardDraw(); } }); }
    cardEl.hidden = !Cd; if (!Cd) return; const esc = v => String(v).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])), kg = w => w < 1 ? `${(w * 1000).toFixed(0)} g` : `${w.toFixed(2)} kg`, n = Cd.items.filter(i => i.kept).length;
    cardEl.innerHTML = `<b>${esc(Cd.gear)}</b><i>${esc(tally(Cd.items))}</i><ul>${Cd.items.map((it, i) => `<li data-i="${i}" class="${it.kept ? 'on' : ''}"><span>${esc(it.name)}</span><small>${it.lengthCm.toFixed(1)} cm · ${kg(it.weightKg)}</small><em>${it.kept ? 'Keep' : 'Let go'}</em></li>`).join('')}</ul>`
      + `<div class="haul-btns"><button id="haulKeep">${n === Cd.items.length ? 'Keep all' : n ? `Keep ${n}, let ${Cd.items.length - n} go` : 'Let them go'}${Engine.touchUI ? '' : ` (${Controls.key('keep')})`}</button><button id="haulFree">Let them all go${Engine.touchUI ? '' : ` (${Controls.key('release')})`}</button></div><small>Tap one to change it</small>`; };
  const offer = (gear, kd, items) => { if (!items.length) return false; for (const it of items) it.kept = true; T.card = { gear, kd, items };
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); cardDraw(); return true; };
  const decide = freeAll => { const Cd = T.card; if (!Cd) return; T.card = null; cardDraw();
    for (const it of Cd.items) { if (freeAll) it.kept = false; if (it.kept) it.keep(); else it.free(); }
    record(Cd.gear, Cd.kd, Cd.items); const k = Cd.items.filter(i => i.kept), g = Cd.items.length - k.length;
    say(k.length ? `In the creel: ${tally(k)}${g ? ` · let ${g} go` : ''}` : `Let ${g === 1 ? 'it' : `all ${g}`} go`, k.length ? 4 : 2.5); if (Engine.tackleOpen) Engine.tackleRender(); };
  Game.on('key', code => { if (!T.card) return; if (code === 'KeyE') decide(false); else if (code === 'KeyX') decide(true); });
  const takeLive = f => { Engine.removeFish(f); Engine.fish = Engine.fish.filter(q => q !== f); for (const c of Engine.fishCells.values()) { const i = c.fish.indexOf(f); if (i >= 0) { c.fish.splice(i, 1); break; } } };

  // ---- the water in front of you: under the crosshair when that's in reach, else a few metres ahead ----
  const aim = maxD => { const P = Game.player, l = Game.lookingAt;
    if (l && l.dist <= maxD) return { x: l.x, y: l.y };
    for (const d of [maxD * 0.6, maxD * 0.35, maxD]) { const x = P.x + Math.cos(P.a) * d, y = P.y + Math.sin(P.a) * d; if (Game.isWater(x, y)) return { x, y }; }
    return null; };

  // ---- throwing and hauling are seen: things fly out in an arc, sink, and come back hand over hand ----
  // (props are drawn from buffers that only refill when the set changes, so anything moving asks for a refill each frame: Engine.propKey = null)
  const ease = u => u * u * (3 - 2 * u), lerp = (a, b, u) => a + (b - a) * u, hands = () => { const P = Game.player, c = Math.cos(P.a), q = Math.sin(P.a); if (Engine.thirdP && Engine.hPose && Engine.hPose.hand) return Engine.hPose.hand.slice(); return [P.x + c * 0.55 - q * 0.22, P.y + q * 0.55 + c * 0.22, P.z + 1.2]; };   // in front and a little to the right (turning right is +angle); the figure's right hand in third person
  const haulKey = () => Engine.touchUI ? 'Use' : Controls.key('cast');
  T.act = null;   // what your arms are doing, for the third-person figure: { toss: 0..1 } or { pull: radians }

  // ---- the cast net: thrown out spinning open, it sinks over whatever was under it and stays down until you pull it in (R) ----
  const throwNet = () => {
    if (T.net || Engine.time < T.busy) return;
    if (Game.swimming) return say("You can't throw a net while swimming", 2);
    const p = aim(9); if (!p) return say('Face the water: the net reaches about 9 m');
    if (Game.waterAt(p.x, p.y).iced) return say("It's frozen over there", 2);
    const h = hands(), prop = T.held || Game.addProp('cast_net', h[0], h[1], { z: h[2], scale: 0.2, rot: 0 }); T.held = null; T.net = { x: p.x, y: p.y, from: h, t0: Engine.time, stage: 'fly', got: [], prop }; say('Net away…', 1);   // the bundle in your hand is what flies
  };
  const haulNet = () => { const N = T.net; if (!N || N.stage !== 'down') return false; N.stage = 'haul'; N.t0 = Engine.time; N.back = [N.prop.x, N.prop.y, N.prop.z]; Game.ripple(N.x, N.y, 1); return true; };
  const netStep = dt => { const N = T.net; if (!N) return; const t = Engine.time - N.t0, pr = N.prop; if (N.stage !== 'down' || t < 1.4) Engine.propKey = null;   // (moving: redraw; lying on the bed it needn't)
    if (N.stage === 'fly') { const u = Math.min(1, t / 0.7), w = Game.waterAt(N.x, N.y); T.act = { toss: Math.min(1, t / 0.5) };   // out in an arc, opening as it spins
      pr.x = lerp(N.from[0], N.x, u); pr.y = lerp(N.from[1], N.y, u); pr.z = lerp(N.from[2], w.level, u) + 1.5 * Math.sin(Math.PI * u); pr.scale = 0.2 + 0.8 * ease(u); pr.rot += dt * 7;
      if (u >= 1) { N.stage = 'down'; N.t0 = Engine.time; N.kd = w.kindId; N.wl = w.level; N.bed = Math.max(w.ground + 0.06, w.level - 1.4); Game.splash(N.x, N.y, 24); Game.sound('plop', { x: N.x, y: N.y });
        N.got = Game.fishNear(N.x, N.y, NET_R).filter(f => !f.hooked && f.lengthCm <= 40 && ['fish', 'shrimp'].includes(f.def.body.plan || 'fish') && f.z > N.wl - 3.5 && Math.random() < 0.8).slice(0, 12);   // small fish and shrimp under it, down to 3.5 m
        for (const f of N.got) f.hooked = 'net'; Game.disturb(N.x, N.y, 1.5); say(`Net down · ${haulKey()} to pull it in`, 2.5); } }   // held under it (still in the world until you decide)
    else if (N.stage === 'down') { pr.z = lerp(N.wl - 0.05, N.bed, ease(Math.min(1, t / 1.2))); T.act = null;   // sinking, then lying there
      if (!T.hand || Math.hypot(N.x - Game.player.x, N.y - Game.player.y) > 25) haulNet(); }   // put away or walked off: it comes in
    else { const u = Math.min(1, t / 0.9), h = hands(); T.act = { pull: Engine.time * 9 };   // gathered up and drawn back to your hands
      pr.x = lerp(N.back[0], h[0], ease(u)); pr.y = lerp(N.back[1], h[1], ease(u)); pr.z = lerp(N.back[2], h[2], ease(u)); pr.scale = 1 - 0.75 * ease(u);
      N.got.forEach((f, i) => { f.x = pr.x + Math.cos(i * 2.4) * 0.25 * pr.scale; f.y = pr.y + Math.sin(i * 2.4) * 0.25 * pr.scale; f.z = pr.z - 0.1; });   // the catch comes in with it
      if (u >= 1) { unplace([pr]); T.net = null; T.act = null; T.busy = Engine.time + 0.4;
        const back = f => { sample(N.x, N.y); f.hooked = false; f.x = N.x; f.y = N.y; f.z = Math.max(hW(SE) + 0.05, SW - 0.4); f.state = 'flee'; f.stress = 1; f.thx = Game.player.x; f.thy = Game.player.y; f.tNext = 0; };   // back where the net came down, and off it goes
        if (!offer('Cast net', N.kd, N.got.map(f => ({ species: f.species, name: f.name, lengthCm: f.lengthCm, weightKg: f.weightKg, keep: () => { f.hooked = false; takeLive(f); }, free: () => back(f) })))) say('The net came up empty', 2.5); } } };

  // ---- pots and cages: thrown (or dropped) in an arc, they sink to the bed; at the stake or buoy, R pulls one up ----
  T.fly = [];   // pots in the air: { tr, prop, from, t0, dur }
  const setPot = kind => { const K = KINDS[kind], P = Game.player, out = T.set.filter(t => t.kind === kind).length + T.fly.filter(q => q.tr.kind === kind).length;
    if (out >= K.max) return say(`All ${K.max} are out: haul one first`);
    if (T.fly.length) return;
    const afloat = !!Engine.boat || Game.swimming; let p;
    if (afloat) { const x = P.x + Math.cos(P.a) * 2.5, y = P.y + Math.sin(P.a) * 2.5; p = Game.isWater(x, y) ? { x, y } : { x: P.x, y: P.y }; } else p = aim(10);
    if (!p || !Game.isWater(p.x, p.y)) return say('Face the water: you can throw it about 10 m');
    const w = Game.waterAt(p.x, p.y);
    if (w.iced) return say("It's frozen over there", 2);
    if (w.depth < 0.4) return say('Too shallow there');
    const tr = { kind, x: p.x, y: p.y, ax: afloat ? null : P.x, ay: afloat ? null : P.y, kd: w.kindId, h: 0 }, h = hands();
    T.fly.push({ tr, from: h, t0: Engine.time, dur: 0.35 + 0.05 * Math.hypot(p.x - h[0], p.y - h[1]), afloat, depth: w.depth, prop: Game.addProp('trap_' + kind, h[0], h[1], { z: h[2], rot: 0 }) });
    if (out + 1 >= K.max) T.hand = null;
  };
  const potStep = dt => {
    for (const q of T.fly) { const u = Math.min(1, (Engine.time - q.t0) / q.dur), tr = q.tr, w = Game.waterAt(tr.x, tr.y), pr = q.prop; Engine.propKey = null; T.act = { toss: Math.min(1, (Engine.time - q.t0) / 0.5) };   // through the air, tumbling
      pr.x = lerp(q.from[0], tr.x, u); pr.y = lerp(q.from[1], tr.y, u); pr.z = lerp(q.from[2], w.level, u) + (0.4 + 0.12 * Math.hypot(tr.x - q.from[0], tr.y - q.from[1])) * Math.sin(Math.PI * u); pr.rot += dt * 5;
      if (u >= 1) { unplace([pr]); T.fly = T.fly.filter(x => x !== q); T.act = null; tr.born = Engine.time; T.set.push(tr); place(tr); tr.sink = { t0: Engine.time, from: w.level - 0.1, to: tr.props[0].z }; tr.props[0].z = tr.sink.from; save();
        Game.splash(tr.x, tr.y, 20); Game.sound('plop', { x: tr.x, y: tr.y }); const K = KINDS[tr.kind], left = K.max - T.set.filter(t => t.kind === tr.kind).length;
        say(`${K.name} ${q.afloat ? 'down under a buoy' : 'out, tied to a stake'} · ${q.depth.toFixed(1)} m deep · ${left ? left + ' left' : 'none left in the box'}`, 3.5); if (Engine.tackleOpen) Engine.tackleRender(); } }
    for (const tr of T.set) {
      if (tr.sink) { const u = Math.min(1, (Engine.time - tr.sink.t0) / 1.6); tr.props[0].z = lerp(tr.sink.from, tr.sink.to, ease(u)); Engine.propKey = null; if (u >= 1) tr.sink = null; }   // going down to the bed
      if (tr.pull) { const u = Math.min(1, (Engine.time - tr.pull.t0) / 1.5), [ax, ay] = anchor(tr), pr = tr.props[0], top = Game.waterAt(tr.x, tr.y).level + (tr.ax != null ? 0.2 : 0.1); Engine.propKey = null; T.act = { pull: Engine.time * 9 };   // coming up, drawn in toward the stake or buoy
        pr.x = lerp(tr.x, lerp(tr.x, ax, 0.85), ease(u)); pr.y = lerp(tr.y, lerp(tr.y, ay, 0.85), ease(u)); pr.z = lerp(tr.pull.from, top, ease(u));
        if (u >= 1) { T.act = null; landPot(tr); } } } };
  // the animals living within reach of a pot that it can take, nearest first: [{ sp (cellFish entry), D, d }]
  const candidates = tr => { const K = KINDS[tr.kind], cs = FISH_CELL, out = [];
    for (let cy = Math.floor((tr.y - POT_R) / cs); cy <= Math.floor((tr.y + POT_R) / cs); cy++) for (let cx = Math.floor((tr.x - POT_R) / cs); cx <= Math.floor((tr.x + POT_R) / cs); cx++)
      for (const sp of cellFish(cx, cy)) { const D = FishDB.list[sp.si], w = K.takes(D), d = Math.hypot(sp.hx - tr.x, sp.hy - tr.y);
        if (w && d <= POT_R && +(/\.(\d+)#/.exec(sp.id) || [])[1] === tr.kd && !Engine.isGone(sp.id)) out.push({ sp, D, d, w }); }   // same water as the pot, and not caught already
    return out.sort((a, b) => a.d - b.d); };
  const haul = tr => { if (tr.pull || tr.sink) return; tr.pull = { t0: Engine.time, from: tr.props[0].z }; Game.ripple(tr.x, tr.y, 0.8); say(`Hauling the ${KINDS[tr.kind].name.toLowerCase()}…`, 1.5); };
  const landPot = tr => { const K = KINDS[tr.kind], C = candidates(tr), work = 1 - Math.exp(-tr.h / SOAK_H), got = [];   // it's up: what's in it?
    for (const c of C) { if (got.length >= K.holds) break; if (Math.random() < c.w * work * Math.sqrt(1 - c.d / POT_R)) got.push(c); }
    T.set = T.set.filter(t => t !== tr); unplace(tr.props); save(); Game.splash(tr.x, tr.y, 14);
    const gone = sp => { const live = Engine.fish.find(f => f.id === sp.id); if (live) takeLive(live); else Engine.removeFish({ id: sp.id }); };   // kept: out of the world for a while; let go: it never left
    if (!offer(K.name, tr.kd, got.map(({ sp, D }) => ({ species: D.id, name: D.name, lengthCm: sp.size.cm, weightKg: sp.size.kg, keep: () => gone(sp), free: () => {} }))))
      say(`${K.name} came up empty: ${!C.length ? 'nothing for it lives round here' : tr.h < 0.5 ? 'give it longer' : 'no luck this time'}`, 3.5);
    if (Engine.tackleOpen) Engine.tackleRender();
  };

  // ---- in hand, and what Use does ----
  const take = kind => { const A = Engine.ang;
    if (kind && A && A.out) { if (A.phase !== 'ready') return say('Reel in first', 2); Engine.toggleRod(false); }
    T.hand = kind; if (!kind) return say('Put away', 1.5);
    const K = KINDS[kind]; say(`${K.name} in hand · ${useKey()} to ${kind === 'cast_net' ? 'throw it' : 'set it'}`, 3.5); Engine.toggleTackle(false);
  };
  const netDown = () => !!(T.net && T.net.stage === 'down'), rodAway = () => !(Engine.ang && Engine.ang.out);
  const useLabel = () => { const A = Engine.ang; if (A && A.phase === 'card') return null; return netDown() ? 'Haul' : T.net ? null : T.hand ? KINDS[T.hand].use : nearTrap() ? 'Haul' : null; };
  Engine.trapUseLabel = useLabel;   // the touch Use button's word (overlay.js)
  const baseAction = Engine.action;
  Engine.action = function () { const near = !T.hand && nearTrap();
    if (T.card) return;   // decide about what came up first (E / X, or its buttons)
    if (T.net) { haulNet(); return; }   // the net's out: Use pulls it in too (the touch button)
    if (T.hand) return T.hand === 'cast_net' ? throwNet() : setPot(T.hand);
    if (near) return haul(near);
    return baseAction.call(this); };
  // R (the cast / reel key) pulls things in: the net that's down, or the pot whose stake or buoy you're at
  Game.on('key', code => { if (code !== 'KeyR' || !rodAway() || T.card) return; if (netDown()) { haulNet(); return; } const near = !T.hand && nearTrap(); if (near) haul(near); });
  const baseRod = Engine.toggleRod;
  Engine.toggleRod = function (on = !this.ang.out) { if (on) T.hand = null; return baseRod.call(this, on); };   // the rod out puts the net or pot away
  const baseKeys = Engine.contextKeys;
  Engine.contextKeys = function () { const out = baseKeys.call(this), l = useLabel(); return l ? [[l === 'Haul' ? Controls.key('cast') : Controls.key('use'), netDown() ? 'Haul net' : l], ...out].slice(0, 4) : out; };

  Game.on('update', dt => {
    for (const tr of T.set) tr.h += Engine.dtH || 0;
    T.act = null; netStep(dt || 0); potStep(dt || 0);
    const hold = T.hand === 'cast_net' && !T.net && !T.card && !Game.swimming;   // the net bundled in your hand, ready to throw
    if (hold) { const h = hands(); if (!T.held) T.held = Game.addProp('cast_net', h[0], h[1], { z: h[2], scale: 0.2, rot: 0 }); T.held.x = h[0]; T.held.y = h[1]; T.held.z = h[2] - 0.12; T.held.rot = Game.player.a; Engine.propKey = null; }
    else if (T.held) { unplace([T.held]); T.held = null; }
    if (T.set.length && Engine.time - T.saveT > 20) { T.saveT = Engine.time; save(); }   // soak time survives a reload
  });
  Game.on('ready', () => { if (!CONFIG.saveProgress) return;
    try { const d = JSON.parse(localStorage.getItem(key()) || 'null');
      for (const s of (d && d.set) || []) if (KINDS[s.kind] && KINDS[s.kind].max && isFinite(s.x) && isFinite(s.y) && Game.isWater(s.x, s.y)) { const tr = { kind: s.kind, x: s.x, y: s.y, ax: isFinite(s.ax) && s.ax != null ? s.ax : null, ay: isFinite(s.ay) && s.ay != null ? s.ay : null, kd: s.kd | 0, h: +s.h || 0 }; if (tr.ay == null) tr.ax = null; T.set.push(tr); place(tr); }
    } catch (e) { /* storage unavailable */ } });
  // under the place name: the pot you're standing at, or what's in your hand
  Game.onHud(() => { const A = Engine.ang; if (A && A.phase === 'card') return; const tr = !T.hand && nearTrap();
    if (netDown()) Engine.hudDetail = `Cast net out  ·  ${haulKey()} to pull it in`;
    else if (tr) Engine.hudDetail = `${KINDS[tr.kind].name}  ·  set ${soaked(tr.h)} ago  ·  ${haulKey()} to haul`;
    else if (T.hand) Engine.hudDetail = `${KINDS[T.hand].name} in hand  ·  ${useKey()} to ${T.hand === 'cast_net' ? 'throw' : Engine.boat || Game.swimming ? 'drop under a buoy' : 'set from the bank'}`; });
  // the net's hand line: from your hand out to the net, paying out as it flies, slack while it lies, coming in as you haul
  Game.onHud(c => { const N = T.net; if (!N || !c || Engine.showMap) return; const h = hands(), pr = N.prop, a = Game.project(h[0], h[1], h[2] - 0.05), b = Game.project(pr.x, pr.y, pr.z + 0.05); if (!a || !b) return;
    const d = Math.hypot(pr.x - h[0], pr.y - h[1]), sag = N.stage === 'down' ? 0.25 + 0.05 * d : 0.06 * d, m = Game.project((h[0] + pr.x) / 2, (h[1] + pr.y) / 2, (h[2] + pr.z) / 2 - sag);
    c.save(); c.lineCap = 'round'; for (const [w, col] of [[3.2, 'rgba(40,30,16,.55)'], [1.8, 'rgba(226,208,150,.95)']]) { c.lineWidth = w; c.strokeStyle = col; c.beginPath(); c.moveTo(a[0], a[1]); if (m) c.quadraticCurveTo(2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2, b[0], b[1]); else c.lineTo(b[0], b[1]); c.stroke(); } c.restore(); });
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
    return h + `<footer>Pick one, then ${useKey()}. The net stays down until you pull it in with ${haulKey()}. From the bank a pot is tied to a stake; from a boat it hangs under a buoy. ${haulKey()} at the stake or buoy hauls it. Pots fill slowly: leave them an hour or two of game time. They show on the map.</footer>`;
  };
  document.getElementById('tkBody').addEventListener('click', e => { const li = e.target.closest('[data-trap]'); if (!li || performance.now() - (Engine.tackleOpenT || 0) < 350) return;
    const kind = li.dataset.trap, K = KINDS[kind];
    if (T.hand === kind) { take(null); Engine.tackleRender(); return; }
    if (K.max && T.set.filter(t => t.kind === kind).length >= K.max) return say(`All ${K.max} are out: haul one first`);
    take(kind); });
})();
