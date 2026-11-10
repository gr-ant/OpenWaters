'use strict';
// FISHING: a second rod. Engine.ang stays "the rod in focus" (in your hands, at the helm, or the one you last set down), and
// all the fishing code goes on working on it. Engine.ang2 is another rod standing in a holder: each frame the two are swapped
// for a moment so the same code steps, draws and rings the bell for it too. So: cast, H to put the rod in a holder, Q for a
// second rod; fish that one by hand, troll it from the helm, or put it in a holder as well. Use at a holder picks that rod up.
//   Engine.ang2 -> the other rod (an angler object like Engine.ang, always in a holder), or null
(() => {
  const E = Engine; E.ang2 = null;
  const swap = () => { const a = E.ang; E.ang = E.ang2; E.ang2 = a; };
  const other = fn => { if (!E.ang2) return undefined; swap(); try { return fn(); } finally { swap(); } };   // run something as the other rod
  E.rods = function () { return [this.ang, this.ang2].filter(Boolean); };
  const say = (t, s = 2) => E.say(t, s);

  // every frame: both rods fish; a second rod that's no longer standing in a holder isn't one
  const baseStep = E.angStep; E.angStep = function (dt) { baseStep.call(this, dt); other(() => baseStep.call(E, dt)); if (this.ang2 && (!this.ang2.out || !this.ang2.holder)) this.ang2 = null; };
  const baseDraw = E.drawTackle; E.drawTackle = function (...a) { baseDraw.apply(this, a); other(() => { if (E.ang.out) baseDraw.apply(E, a); }); };
  // a fish that came to the other rod's bait takes that one
  const baseArrive = E.lureArrive; E.lureArrive = function (f) { return f.rod && f.rod === this.ang2 ? other(() => baseArrive.call(E, f)) : baseArrive.call(this, f); };

  // Q with the rod in a holder: a second rod in your hands (the same rig; tie on another in the tackle box)
  const second = () => { const first = E.ang;
    if (E.ang2) return say('Both rods are out: pick one up from its holder');
    E.ang2 = first; E.angLoad(); baseRod.call(E, true);
    if (!E.ang.out) { E.ang = first; E.ang2 = null; return; }   // couldn't take one out here (swimming, at a helm that doesn't troll): as you were
    say(`Second rod · ${E.ang.rig.name}`, 2); };
  const baseRod = E.toggleRod; E.toggleRod = function (on) {
    if (on === undefined && this.ang && this.ang.holder) return second();
    baseRod.call(this, on === undefined ? !this.ang.out : on);
    if (this.ang && !this.ang.out && this.ang2) { this.ang = this.ang2; this.ang2 = null; this.tuiState = null; this.updateTui(); } };   // the one in your hands put away: the rod in the holder is the one you have out
  const baseKey = E.keyPress; E.keyPress = function (code, e, card) {
    if (!card && code === 'KeyQ' && this.ang && this.ang.holder) { this.keys[code] = true; if (!e || !e.repeat) second(); return; }
    return baseKey.call(this, code, e, card); };
  const baseTravel = E.travel; E.travel = function (...a) { this.ang2 = null; return baseTravel.apply(this, a); };   // travelling takes every rod with you

  // picking up: whichever holder you're at. Hands must be free for the other rod: an idle rod goes away, one with its line out goes into a holder right here
  const nearMine = E.holderNear, nearOther = () => !!other(() => nearMine.call(E));
  E.holderNear = function () { return nearMine.call(this) || nearOther(); };
  const basePick = E.pickUpHolder; E.pickUpHolder = function () { const A = this.ang, here = nearMine.call(this), there = nearOther(), biting = R => R && R.phase === 'bite';
    if (here && !(there && biting(this.ang2) && !biting(A))) return basePick.call(this);   // (at both: the one with a fish on first)
    if (!there) return;
    if (A.out && !A.holder) { if (A.phase === 'ready') baseRod.call(this, false); else if (A.phase === 'water') { this.setHolder(); if (!this.ang.holder) return; } else return say('Finish with the rod in your hands first'); }
    swap(); if (this.ang2 && !this.ang2.out) this.ang2 = null;
    return basePick.call(this); };
  const baseKeys = E.contextKeys; E.contextKeys = function () { const out = baseKeys.call(this), A = this.ang;
    if (A && A.holder && !this.ang2 && !nearMine.call(this)) return [[Controls.key('rod'), 'Second rod'], ...out].slice(0, 4);
    return A && !A.holder && nearOther() ? [[this.boat ? Controls.key('holder') : Controls.key('use'), 'Pick up rod'], ...out].slice(0, 4) : out; };
})();
