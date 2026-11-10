'use strict';
// FISHING: the angler: rod out or away (Q), rig and drag (saved in this browser), rod tip position.
Object.assign(Engine, {
  ang: null,
  angLoad() {
    let st = {}; try { st = JSON.parse(localStorage.getItem('embercrown-angler') || '{}'); } catch (e) { /* */ }
    this.ang = { out: false, phase: 'stowed', rigId: null, charge: 0, pitch: -0.6, yaw: this.P.a, bend: 0, tip: [0, 0, 0], hand: [0, 0, 0], lure: null, lineOut: 0, tension: 0, fish: null, baitLeft: 0, btnWas: false };
    if (!this.equipRig(st.rig, true) && !this.equipRig('bobber_worm', true)) { const r = TackleDB.ofType('rig').find(r => !rigStats(r).errors.length); if (r) this.equipRig(r.id, true); }
    if (st.dragF && this.ang.S) this.setDrag(st.dragF * this.ang.S.strengthKg, true);
  },
  angSave() { const A = this.ang; try { localStorage.setItem('embercrown-angler', JSON.stringify({ rig: A.rigId, dragF: A.S ? A.dragKg / A.S.strengthKg : 0.3 })); } catch (e) { /* */ } },
  equipRig(id, quiet = false) {
    const r = TackleDB.byId[id], A = this.ang; if (!r || r.type !== 'rig' || !A) return false;
    const S = rigStats(r); if (S.errors.length) { if (!quiet) this.say(`${r.name}: ${S.errors[0]}`, 4); return false; }
    if (A.phase !== 'stowed' && A.phase !== 'ready') { if (!quiet) this.say('Reel in first', 2); return false; }
    A.rigId = id; A.rig = r; A.S = S; A.dragKg = S.dragKg; A.baitLeft = S.bait ? S.bait.lasts : 1; A.mesh = {};
    this.angSave(); if (!quiet) this.say(r.name, 2);
    if (this.tackleOpen) this.tackleRender(); return true;
  },
  setDrag(kg, quiet) { const A = this.ang, S = A.S; if (!S) return; A.dragKg = clamp(kg, 0.05, S.dragMaxKg); this.angSave(); if (!quiet) this.say(`Drag ${A.dragKg.toFixed(1)} kg (${Math.round(A.dragKg / S.strengthKg * 100)}% of the ${S.weakest})`, 1.5); },
  buzz(p) {
    try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* */ }
    try { const ms = Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p; for (const g of navigator.getGamepads ? navigator.getGamepads() : []) if (g && g.vibrationActuator) g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, ms / 150), weakMagnitude: 0.8 }).catch(() => {}); } catch (e) { /* */ }
  },
  rodInHand() { const A = this.ang; return !!(A && A.out && !A.holder); },   // out and not standing in a rod holder
  boatTrolls(D) { return CONFIG.trolling && ['outboard', 'inboard'].includes(D.propulsion.type); },
  toggleRod(on = !this.ang.out) {
    const A = this.ang; if (!A) return;
    if (on) {
      if (this.boat && this.boatMode !== 'deck' && !this.boatTrolls(this.boat.def)) { this.say(this.touchUI ? 'Tap Stand / Fish to leave the helm first' : `Leave the helm (${Controls.key('helm')}) to fish`, 2.5); return; }
      if (this.swim) { this.say("You can't fish while swimming", 2); return; }
      if (!A.S) { this.say('No rig: open the tackle box (I) and build one', 3); return; }
      A.out = true; A.phase = 'ready'; A.bendV = 0; A.rope = null; A.dangle = null; A.pitch = -0.9; A.lure = null; A.fish = null;
      if (this.boat && this.boatMode !== 'deck') this.say('Trolling', 2); else this.say(A.rig.name, 1.5);
    } else {
      if (A.fish) this.loseFish('You put the rod down and the fish is gone', 'drop');
      A.out = false; A.phase = 'stowed'; A.lure = null; A.float = null;
    }
    this.tuiState = null; this.updateTui();
  },
  // the hand, and the rod tip at the end of the (bent) rod, in the world
  rodTip(A) {
    const S = A.S, t = rodLineAnchor(S, A.bend), cp = Math.cos(A.pitch), sp = Math.sin(A.pitch);
    const x = t[0] * cp - t[1] * sp, z = t[0] * sp + t[1] * cp;
    return [A.hand[0] + Math.cos(A.yaw) * x, A.hand[1] + Math.sin(A.yaw) * x, A.hand[2] + z];
  },
});
