'use strict';
// FISHING: rod holders. With the line out in the water, H (touch: Holder) stands the rod in a holder: a spike planted
// just in front of you on the bank, or a holder on the gunwale of the boat you're in (it rides with the boat). The rod
// keeps fishing on its own while you walk off (it's still Engine.ang, so its bait keeps its fish cells alive), and a
// bite rings a bell at the rod, nods the tip and puts up a notice that stays (over menus too) until you come back.
// Use (F) or H at the holder picks it up: a fish that's on is straight into the fight, otherwise the line is still out.
// Nobody comes: the take lasts 4x longer than in hand (the fish runs off with the bait against the holder), then it
// sets itself with the usual chance for the hook (circle 90%, treble 40%, J 12%, times the rig's hold) or drops the
// bait. A fish that set itself stays on, the bell ringing, for HOLD_S seconds, then throws the hook (bait gone).
//   Engine.ang.holder -> { boat, lx, ly, lz, ya (on a boat, in its frame) | x, y, z, yaw (bank), up, on, onT, alert }
const HOLDER_PITCH = 0.8;   // how steeply a rod stands in a holder (rad)
function holderMesh(drop) {   // origin at the reel seat, the rod along +x tilted up by HOLDER_PITCH: a bright steel tube for the butt with an orange band at its mouth, on a stem down `drop` m
  const B = meshBuilder(true), c = Math.cos(HOLDER_PITCH), s = Math.sin(HOLDER_PITCH), at = k => [k * c, 0, k * s], g = [0.8, 0.81, 0.84], o = [0.98, 0.42, 0.08], q = at(-0.38); B.mat = MT.METAL;
  B.tube(at(-0.42), at(-0.1), 0.036, 0.034, 12, g, true); B.tube(at(-0.1), at(-0.05), 0.04, 0.04, 12, o, false);   // the tube the butt drops into, and its band
  B.tube(q, [q[0], 0, -drop], 0.022, 0.018, 10, g, true); B.blob([q[0], 0, q[2]], 0.03, 0.03, 0.03, 4, 10, g);   // the stem (a spike in the bank, or the post down to the gunwale clamp)
  B.tube([q[0] - 0.07, 0, -drop + 0.04], [q[0] + 0.07, 0, -drop + 0.04], 0.025, 0.025, 10, o, true);   // the clamp / the spike's foot bar, orange so it's easy to find
  return new Float32Array(B.v);
}
(() => {
  const HOLD_S = 45, REACH = 2.5;   // how long a self-hooked fish stays on; how close you must be to pick the rod up (m)
  const E = Engine, useKey = () => E.touchUI ? 'Use' : Controls.key('use');
  Sounds.register('bell', {   // a bite-alarm bell: three quick strikes, a bright inharmonic ring each
    volume: 0.55, range: 140, near: 6, jitter: [-0.5, 0.5],
    layers: [0, 0.11, 0.24].flatMap((d, i) => [
      { wave: 'sine', gain: 0.8 - i * 0.15, freq: [1960], delay: d, attack: 0.002, decay: 0.7 },
      { wave: 'sine', gain: 0.3, freq: [5300], delay: d, attack: 0.001, decay: 0.25 },
      { wave: 'triangle', gain: 0.18, freq: [3150], delay: d, attack: 0.001, decay: 0.4 }]),
  });
  const ring = H => { const [x, y, z] = E.holderHand(H); Game.sound('bell', { x, y, z }); H.ringT = 1.4 + Math.random() * 1.6; };
  const away = H => Math.round(Math.hypot(H.x - E.P.x, H.y - E.P.y));

  Object.assign(Engine, {
    // where the reel seat sits: the holder's top, following the boat it's clamped to
    // on a boat it's fixed to the hull: placed as the hull is drawn (heeled, then pitched, turned: the lit shader), and tilted with it
    holderHand(H) { const b = H.boat;
      if (b) { const r = b.roll || 0, p = b.pitch || 0, cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p), ca = Math.cos(b.a), sa = Math.sin(b.a);
        const at = (x0, y0, z0) => { const y = y0 * cr - z0 * sr, z1 = y0 * sr + z0 * cr, x = x0 * cp - z1 * sp; return [b.x + ca * x - sa * y, b.y + sa * x + ca * y, b.z + x0 * sp + z1 * cp]; };
        [H.x, H.y, H.z] = at(H.lx, H.ly, H.lz); H.yaw = b.a + H.ya; const s = at(H.lx, H.ly, H.lz + H.up);
        const c = Math.cos(H.ya), q = Math.sin(H.ya); H.roll = r * c - p * q; H.tilt = r * q + p * c;   // the boat's heel and trim, about the holder's own axes
        return s; }
      return [H.x, H.y, H.z + H.up]; },
    holderNear() { const A = this.ang, H = A && A.holder, P = this.P; return !!H && Math.hypot(H.x - P.x, H.y - P.y) < REACH && Math.abs(H.z - P.z) < 2.5; },
    setHolder() {
      const A = this.ang, P = this.P, L = A.lure, b = this.boat;
      if (A.phase !== 'water' || !L || L.land || L.kd < 0) return this.say('Cast first: the holder takes a rod with its line in the water', 2.5);
      if (b && this.boatMode !== 'deck') return this.say('At the helm the rod is already in a holder', 2);
      let H;
      if (b) { const D = b.def, S = D._shape, q = this.boatLocal(b, P.x, P.y), t = clamp(q[3], 0.15, 0.85), side = this.boatLocal(b, L.x, L.y)[1] >= 0 ? 1 : -1;   // the gunwale beside you, on the side the line is
        H = { boat: b, lx: (t - 0.5) * D.hull.length_m, ly: side * S.hb(t) * 0.92, lz: S.gun(t), ya: 0, up: 0.3 }; this.holderHand(H); H.ya = Math.atan2(L.y - H.y, L.x - H.x) - b.a; }
      else { const a = Math.atan2(L.y - P.y, L.x - P.x), x = P.x + Math.cos(a) * 0.6, y = P.y + Math.sin(a) * 0.6, dry = !Game.isWater(x, y);   // a step toward the water, or at your feet at the edge
        H = { boat: null, x: dry ? x : P.x, y: dry ? y : P.y, z: dry ? Game.groundAt(x, y) : P.z, yaw: a, up: 0.75 }; }
      H.on = false; H.onT = 0; H.ringT = 0; H.alert = ''; H.was = 'water'; H.born = this.time;
      A.holder = H; A.bail = false; A.btnWas = false; this.keys.KeyR = this.keys.Mouse0 = false;
      this.say(`Rod in the holder · walk off and listen for the bell · ${pickKey()} at the holder to take it back`, 3.5);
      this.tuiState = null; this.updateTui();
    },
    pickUpHolder() {
      const A = this.ang, H = A.holder, P = this.P; if (!H) return;
      A.holder = null; A.btnWas = false;
      const eye = [P.x, P.y, P.z + EYE], aim = this.rodAim(eye); A.yaw = aim[0]; A.pitch = aim[1]; A.hand = this.handForReel(A, eye); A.tip = this.rodTip(A);   // in your hands now, so the fight starts from here
      if (A.phase === 'bite' && H.on && A.fish) this.startFight(A.fish);
      else this.say(A.phase === 'bite' ? (A.S.hookKind === 'circle' ? 'Bite! Just reel…' : 'Strike!') : A.lure ? 'Rod in hand · line still out' : 'Rod in hand', 1.5);
      this.tuiState = null; this.updateTui();
    },
  });

  // the take lasts longer off a holder; a fish that sets itself waits for you instead of fighting an empty rod
  const baseTake = E.fishTake; E.fishTake = function (f) { baseTake.call(this, f); if (this.ang.holder && this.ang.fish === f) this.ang.window *= 4; };
  const baseFight = E.startFight; E.startFight = function (f) { const H = this.ang.holder;
    if (!H) return baseFight.call(this, f);
    H.on = true; H.onT = 0; f.hooked = 'bite'; f.state = 'hooked'; ring(H); this.buzz([70, 40, 140]);
    H.alert = 'Fish on at the rod holder!'; this.say(`${H.alert} ${away(H)} m away · get there before it throws the hook`, 4); };
  // Q while the rod is in a holder: you have to go and get it. Anything else that puts the rod away (travel) takes the holder too.
  const baseKey = E.keyPress; E.keyPress = function (code, e, card) {
    if (!card && code === 'KeyQ' && this.ang && this.ang.holder) { this.keys[code] = true; if (!e.repeat) this.say(`Your rod is in its holder ${away(this.ang.holder)} m away: ${pickKey()} there to pick it up`, 2.5); return; }
    return baseKey.call(this, code, e, card); };
  const baseRod = E.toggleRod; E.toggleRod = function (on = !this.ang.out) { if (!on && this.ang && this.ang.holder) this.ang.holder = null; return baseRod.call(this, on); };
  // Use picks the rod up from a holder, unless there's a boat to board or leave: then Use is for the boat, and H picks the rod up
  E.holderByUse = function () { return !this.boat && !this.nearBoat() && this.holderNear(); };
  const pickKey = () => E.touchUI ? 'Pick up' : E.holderByUse() ? useKey() : Controls.key('holder');
  const baseAction = E.action; E.action = function () { if (this.holderByUse()) return this.pickUpHolder(); return baseAction.call(this); };
  Game.on('key', code => { if (code !== 'KeyH') return; const A = E.ang;
    if (A && A.holder) return E.holderNear() ? E.pickUpHolder() : E.say(`Your rod is in its holder ${away(A.holder)} m away`, 2);
    if (E.rodInHand()) return E.setHolder();
    E.say('Take the rod out and cast first', 2); });

  // the panel and the key hints
  const baseKeys = E.contextKeys; E.contextKeys = function () { const out = baseKeys.call(this), A = this.ang;
    if (A && A.holder) return this.holderNear() ? [[this.holderByUse() ? Controls.key('use') : Controls.key('holder'), 'Pick up rod'], ...out].slice(0, 4) : out;
    return this.rodInHand() && A.phase === 'water' ? [[Controls.key('holder'), 'Rod holder'], ...out].slice(0, 4) : out; };
  const baseStatus = E.fishingStatus; E.fishingStatus = function () { const A = this.ang, H = A && A.holder; if (!H) return baseStatus.call(this);
    const near = this.holderNear(), key = near && !this.touchUI ? (this.holderByUse() ? Controls.key('use') : Controls.key('holder')) : '', act = near ? 'Pick up' : '', sub = near ? 'right here' : `${away(H)} m away`;
    if (A.phase === 'bite') return H.on ? { title: 'Fish on at the holder!', sub: `${sub} · ${Math.max(0, HOLD_S - H.onT).toFixed(0)} s`, key, act, bite: 'strike', alert: true } : { title: 'Bite at the holder!', sub, key, act, bite: 'strike' };
    return { title: 'Rod in the holder', sub: H.alert ? `${sub} · ${H.alert.toLowerCase()}` : sub, key, act }; };

  // the notice that stays up (above menus and the map) from a bite until you're back at the rod
  let chip = null;
  const showChip = t => { if (!chip) { chip = document.createElement('div'); chip.id = 'holderChip'; chip.setAttribute('role', 'status'); chip.setAttribute('aria-live', 'polite'); document.body.appendChild(chip); }
    if (chip.textContent !== t) chip.textContent = t; chip.hidden = !t; };
  E.holderTick = function (dt) {   // one rod's holder for a frame; returns what the notice should say about it ('' for nothing)
    const A = E.ang, H = A && A.holder;
    if (!H || !A.out) { if (A && H) A.holder = null; return ''; }
    const st = A.phase === 'bite' ? (H.on ? 'on' : 'bite') : A.phase;
    if (st === 'bite' && H.was !== 'bite') { ring(H); H.alert = 'Bite at the rod holder!'; E.say(`Bell! ${H.alert} ${away(H)} m away`, 4); }
    else if (st !== 'bite' && st !== 'on' && (H.was === 'bite' || H.was === 'on')) H.alert = H.was === 'on' ? 'The fish at the holder threw the hook' : 'Missed a bite at the holder';
    H.was = st;
    if (st === 'bite' && (H.ringT -= dt) <= 0) ring(H);
    if (st === 'on') { // the fish on the holder rod: thrashing where it took, the bell going, until it throws the hook
      const f = A.fish, L = A.lure; H.onT += dt;
      if (!f || f.dead) { A.fish = null; A.phase = 'water'; H.on = false; }
      else if (H.onT > HOLD_S) { H.on = false; E.loseFish('The fish at your rod holder threw the hook', 'thrown'); }
      else { f.ph = (f.ph + dt * 14) % 6.2832; f.open = 0.5; f.a += Math.sin(E.time * 5) * dt * 2; f.x = L.x - Math.cos(f.a) * f.len * 0.5; f.y = L.y - Math.sin(f.a) * f.len * 0.5; f.z = L.z;
        if (A.float) A.float.dip = Math.max(A.float.dip, 3 + 2 * Math.sin(E.time * 7));
        if ((H.ringT -= dt) <= 0) { ring(H); E.addRipple(L.x, L.y, 0.2 + f.len * 0.5); } }
    }
    const t = H.alert && (st === 'bite' || st === 'on' ? H.alert : `${H.alert} · rod still in the holder`);
    return t ? `${t} ${away(H)} m away${st === 'on' ? ` · ${Math.max(0, HOLD_S - H.onT).toFixed(0)} s` : ''}` : '';
  };
  Game.on('update', dt => { const a = E.holderTick(dt); let b = '';
    if (E.ang2) { const one = E.ang; E.ang = E.ang2; E.ang2 = one; try { b = E.holderTick(dt); } finally { E.ang2 = E.ang; E.ang = one; } }   // the second rod (fishing/two-rods.js)
    const t = [a, b].filter(Boolean).join('   ·   '); if (t || (chip && !chip.hidden)) showChip(t); });
  // on the map: a dot where the rod stands
  Game.onMap((c, toPx) => { for (const A of [E.ang, E.ang2]) { const H = A && A.holder; if (!H) continue; const [px, py] = toPx(H.x, H.y);
    c.beginPath(); c.arc(px, py, 4.5, 0, 6.2832); c.fillStyle = H.on || (A.phase === 'bite') ? '#ffd040' : '#e9cf8e'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#1c1608'; c.stroke(); } });
})();
