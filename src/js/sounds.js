'use strict';
// ======================================================================
//  SOUNDS — sound effects synthesized with Web Audio, each one defined as data (like the bird voices).
//  A sound is a few layers played together; every layer is a tone or a noise burst with a pitch sweep and an envelope:
//    { volume, range: m (silent beyond), near: m (full volume inside), jitter: [semitones, semitones] random pitch per play,
//      layers: [ { wave: 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise', gain,
//                  freq: [Hz start, Hz end], sweep: s to reach the end pitch (exponential),
//                  filter: { type: 'lowpass' | 'highpass' | 'bandpass', freq: [Hz start, Hz end], q },   // optional; noise is shaped by it
//                  delay: s, attack: s, decay: s (fades to silence) } ] }
//  Play one:  Game.sound('plop', { x, y, z, volume, pitch })   (no position: plays flat, at full volume)
//  Add one:   Game.registerSound('ding', def)   ·   Game.soundsOn = false mutes them all
//  Sound starts after your first click or key press (browsers require it).
//  Music:     Sounds.setMusic(true) loops src/music/open-waters.urchin (Settings → Music; off by default)
// ======================================================================
const Sounds = globalThis.Sounds = (() => {
  let ac = null, noise = null;
  let song = null, music = null, musicOn = false;
  // music: the Urchin song rendered once and looped; the note tails that run past its end are wrapped onto the start, so the seam is silent.
  // shortcut: renders on the main thread (~1 s on a phone, once); move it to a Worker if that hitch shows up in play
  const musicGo = () => {
    if (!musicOn || music || !ac || ac.state !== 'running' || !globalThis.Urchin) return;
    if (!song) { const text = Urchin.song('open-waters'), sc = Urchin.compile(text), a = Urchin.render(text, { sampleRate: 22050, volume: 0.5 });
      const L = Math.round(sc.duration * a.sampleRate), d = a.samples.slice(0, L); for (let i = L; i < a.samples.length; i++) d[i % L] += a.samples[i];
      song = ac.createBuffer(1, L, a.sampleRate); song.copyToChannel(d, 0); }
    const g = ac.createGain(); g.gain.value = 0.6; music = ac.createBufferSource(); music.buffer = song; music.loop = true; music.connect(g); g.connect(ac.destination); music.start();
  };
  const wake = () => { try { if (!ac) { const A = globalThis.AudioContext || globalThis.webkitAudioContext; if (A) ac = new A(); } if (ac && ac.state !== 'running') ac.resume().then(musicGo, () => {}); else musicGo(); } catch (e) { /* no audio */ } };
  addEventListener('pointerdown', wake, true); addEventListener('keydown', wake, true);
  const noiseBuf = c => { if (noise && noise.sampleRate === c.sampleRate) return noise; const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return noise = b; };
  const defs = {};
  // build one sound into any audio context (live or offline); returns when it ends
  function voice(c, dest, D, k = 1, t0 = c.currentTime + 0.005) {
    let end = t0;
    for (const L of D.layers) {
      const t = t0 + (L.delay || 0), a = Math.max(0.001, L.attack ?? 0.003), dur = a + (L.decay ?? 0.1), env = c.createGain();
      env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(L.gain ?? 1, t + a); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let src;
      if (L.wave === 'noise') { src = c.createBufferSource(); src.buffer = noiseBuf(c); src.loop = true; }
      else { src = c.createOscillator(); src.type = L.wave || 'sine';
        const [f0, f1 = f0] = L.freq; src.frequency.setValueAtTime(f0 * k, t); if (f1 !== f0) src.frequency.exponentialRampToValueAtTime(f1 * k, t + (L.sweep ?? dur)); }
      let node = src;
      if (L.filter) { const F = L.filter, f = c.createBiquadFilter(), [g0, g1 = g0] = F.freq; f.type = F.type || 'lowpass'; f.Q.value = F.q ?? 1;
        f.frequency.setValueAtTime(g0 * k, t); if (g1 !== g0) f.frequency.exponentialRampToValueAtTime(g1 * k, t + (F.sweep ?? L.sweep ?? dur)); node.connect(f); node = f; }
      node.connect(env); env.connect(dest); src.start(t); src.stop(t + dur + 0.02); end = Math.max(end, t + dur + 0.02);
    }
    return end;
  }
  const S = {
    defs, voice,
    get context() { return ac; },
    get musicOn() { return musicOn; },
    setMusic(on) { musicOn = !!on; if (on) musicGo(); else if (music) { music.stop(); music.disconnect(); music = null; } },
    ready: () => !!ac && ac.state === 'running' && !document.hidden,
    register(name, def) { return defs[name] = Object.assign({ volume: 0.5, range: 80, near: 4, jitter: [0, 0], layers: [] }, def); },
    play(name, at = null) {
      const D = defs[name]; if (!D) { console.warn(`No sound "${name}"`); return null; }
      if (!Game.soundsOn || !this.ready() || Engine.pauseOpen) return null;
      const P = Engine.P; let gain = D.volume * (at?.volume ?? 1), pan = 0;
      if (at && at.x !== undefined) {   // quieter with distance, panned toward where it happened, muffled underwater
        const dx = at.x - P.x, dy = at.y - P.y, dz = (at.z ?? surfAt(at.x, at.y)) - P.z - CONFIG.eyeHeight, d = Math.hypot(dx, dy, dz);
        if (d > D.range) return null;
        gain *= Math.min(1, D.near / Math.max(d, 0.01)) * (1 - d / D.range) * (Engine.uw ? 0.3 : 1);
        pan = clamp(-Math.sin(Math.atan2(dy, dx) - P.a), -1, 1) * 0.8;
      }
      const semis = (at?.pitch ?? 0) + D.jitter[0] + Math.random() * (D.jitter[1] - D.jitter[0]), out = ac.createGain(); out.gain.value = gain;
      let last = out; if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; out.connect(p); last = p; }
      last.connect(ac.destination);
      const end = voice(ac, out, D, 2 ** (semis / 12));
      setTimeout(() => { try { last.disconnect(); out.disconnect(); } catch (e) { /* */ } }, (end - ac.currentTime + 0.3) * 1000);
      return end;
    },
  };
  return S;
})();

// ---------------- sounds ----------------
// A drop or small object into water: the trapped air bubble rings and its pitch climbs fast (the classic "bloop"),
// over a short hiss of splash, with a low knock of the impact under both.
Sounds.register('plop', {
  volume: 0.6, range: 60, near: 5, jitter: [-3, 3],
  layers: [
    { wave: 'sine', gain: 1, freq: [420, 1350], sweep: 0.055, attack: 0.002, decay: 0.11 },                                      // the bubble
    { wave: 'noise', gain: 0.35, filter: { type: 'bandpass', freq: [3200, 1800], q: 0.9 }, attack: 0.001, decay: 0.05 },         // the splash hiss
    { wave: 'sine', gain: 0.4, freq: [190, 120], sweep: 0.04, attack: 0.001, decay: 0.045 },                                     // the knock
  ],
});

Game.soundsOn = true;
Game.sound = (name, at) => Sounds.play(name, at);
Game.registerSound = (name, def) => Sounds.register(name, def);
