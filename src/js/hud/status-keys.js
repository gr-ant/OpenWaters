'use strict';
// HUD context keys beside the dock and the fishing status panel text.
Object.assign(Engine, {
  // the few controls that matter right now (beside the dock): [key, word]
  contextKeys() {
    const A = this.ang, b = this.boat, out = [], K = id => Controls.key(id), drag = `${K('dragDown')} ${K('dragUp')}`;   // keys as currently bound
    if (A && A.out && A.phase === 'card') return [];   // the catch card has its own Keep and Release buttons (with their keys): not twice
    if (this.rodInHand()) { const onReel = !this.touchUI && this.showReelKeys !== false && !(b && this.boatMode !== 'deck');   // the bail and drag keys are already shown on the reel itself (hud/reel.js): not twice
      if (A.phase === 'ready') { if (!onReel) out.push([drag, 'Drag']); }
      else if (A.phase === 'water') { out.push([K('run'), 'Reel faster']); if (!onReel) out.push([K('bail'), A.bail ? 'Close bail' : A.S.reel && A.S.reel.kind !== 'spinning' ? 'Free spool' : 'Open bail']); }
      else if (A.phase === 'fight') { out.push([K('run'), 'Reel harder']); if (!onReel) out.push([drag, 'Drag']); }
    }
    if (b) {
      if (this.boatMode === 'deck') out.push([K('helm'), 'Helm'], [K('dive'), this.boatSit ? 'Stand' : 'Sit']);
      else out.push([`${K('forward')} ${K('back')}`, 'Throttle'], [`${K('left')} ${K('right')}`, 'Steer'], [K('helm'), 'Stand']);
      out.push([K('jump'), 'Jump out']);
    } else if (this.nearBoat()) out.push([K('use'), 'Board']);
    else if (this.swim || this.uw) out.push([K('jump'), 'Up'], [K('dive'), 'Dive']);
    return out.slice(0, 4);
  },
  // what the status panel says for the angler's current phase (null when the rod is away)
  fishingStatus() {
    const A = this.ang; if (!A || !A.out || !A.S || A.phase === 'card') return null;
    const S = A.S, L = A.lure, T = this.touchUI, R = T ? '' : Controls.key('cast'), m = v => v < 10 ? v.toFixed(1) : v.toFixed(0);
    switch (A.phase) {
      case 'ready': return { title: A.rig.name, sub: `${S.castMax.toFixed(0)} m`, key: R, act: 'Cast' };
      case 'charge': return { title: 'Casting…', sub: `${Math.round(A.charge * S.castMax)} m`, key: R, act: 'Let go', bar: { f: A.charge, col: '#e9cf8e' } };
      case 'flight': return { title: 'Casting…', sub: `${m(A.lineOut)} m`, key: R, act: 'Stop' };
      case 'water': {
        const dep = L.kd >= 0 && !L.land ? L.wl - L.z : 0, z = L.kd >= 0 && !L.land ? this.lureZone(L) : '';
        if (S.bait) return A.baitLeft <= 0 ? { title: 'Bait\'s gone', sub: '', key: R, act: 'Reel in' }
          : { title: 'Waiting for a nibble…', sub: `Bait ${dep.toFixed(1)} m deep`, key: R, act: 'Reel in' };
        return { title: L.spd > 0.05 ? 'Retrieving' : S.lure.buoyant ? 'Rising' : 'Sinking', sub: `Lure ${dep.toFixed(1)} m deep`, key: R, act: 'Reel' };
      }
      case 'bite': return A.took ? { title: S.hookKind === 'circle' ? 'Fish on!' : 'Strike!', sub: '', key: R, act: S.hookKind === 'circle' ? 'Reel' : 'Strike', bite: 'strike' }
        : { title: 'A nibble…', sub: '', key: '', act: '', bite: 'nibble' };
      case 'fight': {
        const fr = A.tension / S.strengthKg, col = fr < 0.6 ? '#6fcf8f' : fr < 0.85 ? '#e8c04a' : '#e4573f';
        const title = A.chargeT > 0 ? 'Reel fast!' : A.jump ? 'Jump!' : A.tension >= A.dragKg * 0.98 ? 'Running…' : 'Fish on!';
        return { title, sub: `${m(A.lineOut)} m`, key: R, act: 'Reel', bar: { f: fr, col, mark: A.dragKg / S.strengthKg }, alert: fr > 0.85 };
      }
    }
    return null;
  },
});
