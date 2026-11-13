// Screenshots of the game for the store page and README, taken in Electron (no browser needed):
//   python3 build.py --shots      (builds, then runs this)      or      cd electron && npx electron shots.js [name ...]
// Each shot loads the built game ("Open Waters.html") fresh on its own island, sets the scene through the game's own
// Engine / Game objects, waits for the world around it to stream in, and saves a PNG to Screenshots/auto/ (SHOTS_DIR to change).
const { app, BrowserWindow } = require('electron'), path = require('path'), fs = require('fs');
const GAME = path.join(__dirname, '..', 'Open Waters.html'), OUT = process.env.SHOTS_DIR || path.join(__dirname, '..', 'Screenshots', 'auto'), W = 1920, H = 1080;
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// page-side helpers, run before each scene: a clean frame, a fixed time of day, an optional depth to hold under water
const PREP = `(() => {
  if (Engine.showMap) Engine.toggleBigMap(); Engine.photo = true; Game.setWeather('clear');
  window.shot = {
    hold(o) { shot.o = Object.assign(shot.o || {}, o); },   // { tod, z, a, pitch }: put back every frame (after the game's own update)
    wait: ms => new Promise(r => setTimeout(r, ms)),
    face(x, y) { Engine.P.a = Math.atan2(y - Engine.P.y, x - Engine.P.x); },
    out(a, d) { return [Engine.P.x + Math.cos(a) * d, Engine.P.y + Math.sin(a) * d]; },
  };
  Game.on('update', () => { const o = shot.o, P = Engine.P; if (!o) return; if (o.tod !== undefined) Engine.tod = o.tod;
    if (o.z !== undefined) { P.z = o.z; P.vz = 0; } if (o.a !== undefined) P.a = o.a; if (o.pitch !== undefined) P.pitch = o.pitch; });
})()`;

// the scenes: island (seed, climate), then what to do there; each returns when it's ready to shoot
const SHOTS = [
  // one species held broadside in open water (top: seen from above), framed to its length
  ...['monkfish', 'oarfish', 'monkfish:top'].map(k => { const [id, top] = k.split(':'); return { name: 'fish-' + id + (top ? '-top' : ''), seed: 42, climate: 'temperate', run: `
    const p = Game.findWater('sea', 0, 0, 6000); Engine.travel(p.x, p.y); await shot.wait(1500);
    let d = 120; for (; d < 1500; d += 40) { const q = shot.out(p.a, d); if (Game.waterAt(q[0], q[1]).depth > 30) break; }
    const [x, y] = shot.out(p.a, d); Engine.P.x = x; Engine.P.y = y; const w = Game.waterAt(x, y);
    const [f] = Game.spawn('${id}') || []; if (!f) throw new Error('no ${id}'); const L = f.len || 1, top = ${!!top};
    shot.hold({ tod: 0.5, z: w.level - 6 - EYE, a: p.a, pitch: top ? -1.2 : 0 }); await shot.wait(2500);
    const [fx, fy] = shot.out(p.a, (top ? 0.5 : 1.3) * L); Game.on('update', () => Object.assign(f, { x: fx, y: fy, z: w.level - 6 - (top ? 1.1 * L : 0), a: p.a + Math.PI / 2, state: 'hold', vx: 0, vy: 0 }));
    await shot.wait(1500);` }; }),
  { name: 'cooler-pick', seed: 42, climate: 'temperate', run: `   // the cooler's contents: every fish floating, one chosen
    const R = CONFIG.islandSize / 2, p = Game.findWater('sea', -R, 0, 6000); Engine.travel(p.x, p.y); await shot.wait(1500);
    Game.spawnBoat('center_console'); await shot.wait(500); const B = Engine.boats[Engine.boats.length - 1]; Engine.boardBoat(B); await shot.wait(800);
    const w = Engine.boatWell(B); for (const sp of ['largemouth_bass', 'rainbow_trout', 'bluegill', 'striped_bass', 'atlantic_mackerel', 'yellow_perch', 'summer_flounder']) { const [f] = Game.spawn(sp) || []; if (!f) continue; f.stored = true; f.held = true; f.meta = { logged: true }; w.list.push(f); }
    Engine.P.x = w.pos[0] + 0.6; Engine.P.y = w.pos[1]; await shot.wait(500); const ok = Engine.openWell(); if (!ok) throw new Error('openWell failed: ' + JSON.stringify(w.pos)); Engine.wellPick.i = 2; Engine.keyPress('ArrowRight', {}, false); await shot.wait(2500);` },
  { name: 'tp-rod', seed: 42, climate: 'temperate', run: `   // third person, rod in hand (from behind and to the side)
    const p = Game.findWater('lake', 0, 0, 4000); Engine.travel(p.x - Math.cos(p.a) * 4, p.y - Math.sin(p.a) * 4); Engine.thirdP = true; Engine.camBack = 1.6;
    Game.rod(true); shot.hold({ tod: 0.45, a: p.a + 0.9, pitch: -0.35 }); await shot.wait(3500);` },
  { name: 'tp-lip', seed: 42, climate: 'temperate', run: `   // third person, a fish held (lip)
    const p = Game.findWater('lake', 0, 0, 4000) || Game.findWater('sea', 0, 0, 6000); Engine.travel(p.x - Math.cos(p.a) * 6, p.y - Math.sin(p.a) * 6); Engine.thirdP = true; Engine.camBack = 2.6;
    shot.hold({ tod: 0.45, a: p.a, pitch: -0.5 }); await shot.wait(2000);
    const [f] = Game.spawn('largemouth_bass') || []; f.x = Engine.P.x + Math.cos(p.a) * 0.8; f.y = Engine.P.y + Math.sin(p.a) * 0.8; f.z = Engine.P.z;
    Engine.carryFish(f, { logged: true }); if (Engine.carry.grips.includes('lip')) Engine.carry.grip = 'lip'; Engine.hFace = p.a + Math.PI - 0.7; await shot.wait(2500);` },
  { name: 'tp-cradle', seed: 42, climate: 'temperate', run: `   // third person, a fish held (cradle)
    const p = Game.findWater('lake', 0, 0, 4000) || Game.findWater('sea', 0, 0, 6000); Engine.travel(p.x - Math.cos(p.a) * 6, p.y - Math.sin(p.a) * 6); Engine.thirdP = true; Engine.camBack = 2.6;
    shot.hold({ tod: 0.45, a: p.a, pitch: -0.5 }); await shot.wait(2000);
    const [f] = Game.spawn('rainbow_trout') || []; f.x = Engine.P.x + Math.cos(p.a) * 0.8; f.y = Engine.P.y + Math.sin(p.a) * 0.8; f.z = Engine.P.z;
    Engine.carryFish(f, { logged: true }); if (Engine.carry.grips.includes('cradle')) Engine.carry.grip = 'cradle'; Engine.hFace = p.a + Math.PI - 0.7; await shot.wait(2500);` },
  { name: 'tp-hand', seed: 42, climate: 'arctic', run: `   // third person, a fish held (hand)
    const p = Game.findWater('lake', 0, 0, 4000) || Game.findWater('sea', 0, 0, 6000); Engine.travel(p.x - Math.cos(p.a) * 6, p.y - Math.sin(p.a) * 6); Engine.thirdP = true; Engine.camBack = 2.6;
    shot.hold({ tod: 0.45, a: p.a, pitch: -0.5 }); await shot.wait(2000);
    const [f] = Game.spawn('arctic_cod') || []; f.x = Engine.P.x + Math.cos(p.a) * 0.8; f.y = Engine.P.y + Math.sin(p.a) * 0.8; f.z = Engine.P.z;
    Engine.carryFish(f, { logged: true }); if (Engine.carry.grips.includes('hand')) Engine.carry.grip = 'hand'; Engine.hFace = p.a + Math.PI - 0.7; await shot.wait(2500);` },
  { name: 'face-walk', seed: 42, climate: 'temperate', run: `   // third person: walk each way, check he turns to face the way he's going
    const p = Game.findWater('lake', 0, 0, 4000); Engine.travel(p.x - Math.cos(p.a) * 25, p.y - Math.sin(p.a) * 25); Engine.thirdP = true; Game.rod(true); await shot.wait(1500); Engine.P.a = p.a; Engine.ang.charge = 0.6; Engine.castLure(); await shot.wait(3000);
    const out = { phase: Engine.ang.phase, reeling: Engine.ang.reeling, reelS: Engine.ang.reelS };
    for (const k of ['KeyW', 'KeyD', 'KeyA', 'KeyS']) { const x0 = Engine.P.x, y0 = Engine.P.y; Engine.keys[k] = true; await shot.wait(1200);
      out[k] = { look: +Engine.P.a.toFixed(2), move: +Math.atan2(Engine.P.y - y0, Engine.P.x - x0).toFixed(2), face: +(((Engine.hFace % 6.2832) + 6.2832) % 6.2832).toFixed(2), rot: +(((Engine.hPose.rot % 6.2832) + 6.2832) % 6.2832).toFixed(2), d: +Math.hypot(Engine.P.x - x0, Engine.P.y - y0).toFixed(1) };
      Engine.keys[k] = false; await shot.wait(300); }
    throw new Error(JSON.stringify(out));` },
  { name: 'angler-temperate', seed: 42, climate: 'temperate', run: `   // the angler in third person, standing on the bank
    const p = Game.findWater('sea', 0, 0, 6000); Engine.travel(p.x - Math.cos(p.a) * 5, p.y - Math.sin(p.a) * 5);
    Engine.thirdP = true; Engine.camBack = 4.2; shot.hold({ tod: 0.45, a: p.a + 2.4, pitch: -0.2 }); await shot.wait(1500); Engine.hFace = p.a + 2.4 + Math.PI - 0.6; await shot.wait(2500);` },
  { name: 'angler-arctic', seed: 42, climate: 'arctic', run: `   // the angler in third person, standing on the bank
    const p = Game.findWater('sea', 0, 0, 6000); Engine.travel(p.x - Math.cos(p.a) * 5, p.y - Math.sin(p.a) * 5);
    Engine.thirdP = true; Engine.camBack = 4.2; shot.hold({ tod: 0.45, a: p.a + 2.4, pitch: -0.2 }); await shot.wait(1500); Engine.hFace = p.a + 2.4 + Math.PI - 0.6; await shot.wait(2500);` },
  { name: 'angler-tropical', seed: 42, climate: 'tropical', run: `   // the angler in third person, standing on the bank
    const p = Game.findWater('sea', 0, 0, 6000); Engine.travel(p.x - Math.cos(p.a) * 5, p.y - Math.sin(p.a) * 5);
    Engine.thirdP = true; Engine.camBack = 4.2; shot.hold({ tod: 0.45, a: p.a + 2.4, pitch: -0.2 }); await shot.wait(1500); Engine.hFace = p.a + 2.4 + Math.PI - 0.6; await shot.wait(2500);` },
  { name: 'hands-small', seed: 42, climate: 'arctic', run: `   // a small fish (arctic cod) in one hand, first person
    const p = Game.findWater('sea', 0, 0, 6000); Engine.travel(p.x, p.y);
    shot.hold({ tod: 0.42, a: p.a, pitch: -0.1 }); await shot.wait(3000);
    const [f] = Game.spawn('arctic_cod') || []; f.x = Engine.P.x + Math.cos(p.a) * 0.8; f.y = Engine.P.y + Math.sin(p.a) * 0.8; f.z = Engine.P.z;
    Engine.carryFish(f, { logged: true }); Engine.carry.grip = 'hand'; await shot.wait(2000);` },
  { name: 'boat-aboard-3p', seed: 42, climate: 'arctic', run: `   // at the helm, seen in third person
    const R = CONFIG.islandSize / 2, p = Game.findWater('sea', -R, 0, 6000); Engine.travel(p.x, p.y); await shot.wait(1500);
    Game.spawnBoat('center_console'); await shot.wait(500); const B = Engine.boats[Engine.boats.length - 1];
    Engine.boardBoat(B); Engine.thirdP = true; await shot.wait(1500); Engine.P.a = B.a + Math.PI / 2; shot.hold({ tod: 0.5, pitch: -0.5 }); await shot.wait(2000);` },
  { name: 'boat-side', seed: 42, climate: 'arctic', run: `   // a boat from the side, a few metres off (hull paint, z-fighting)
    const R = CONFIG.islandSize / 2, p = Game.findWater('sea', -R, 0, 6000); Engine.travel(p.x, p.y); await shot.wait(1500);
    const b = Game.spawnBoat('center_console'); await shot.wait(500); const B = b || Engine.boats[Engine.boats.length - 1];
    const a = B.a + Math.PI / 2; Engine.P.x = B.x + Math.cos(a) * 9; Engine.P.y = B.y + Math.sin(a) * 9;
    shot.hold({ tod: 0.5, a: a + Math.PI, pitch: -0.12 }); await shot.wait(2500);` },
  { name: 'heath-close', seed: 42, climate: 'tropical', run: `   // a heath cushion up close (models/water-plants.js heath)
    Engine.travel(0, 0); await shot.wait(4000); let best = null;
    for (const k in Engine) { const v = Engine[k]; if (!(v instanceof Map)) continue;
      for (const ch of v.values()) { const g = ch && ch.ground && ch.ground.heath; if (!g) continue;
        for (let q = g.o[0]; q < g.o[g.o.length - 1]; q++) { const x = g.d[q * 6], y = g.d[q * 6 + 1], dd = Math.hypot(x - Engine.P.x, y - Engine.P.y); if (!best || dd < best.dd) best = { x, y, dd }; } } }
    if (!best) throw new Error('no heath nearby');
    Engine.travel(best.x - 1.5, best.y); await shot.wait(2500); shot.hold({ tod: 0.45, a: Math.atan2(best.y - Engine.P.y, best.x - Engine.P.x), pitch: -0.75 }); await shot.wait(1500);` },
  { name: 'hands-lip', seed: 42, climate: 'temperate', run: `   // in your hands, first person (js/hands.js)
    const p = Game.findWater('pond', 0, 0, 3500) || Game.findWater('lake', 0, 0, 3500); Engine.travel(p.x, p.y);
    shot.hold({ tod: 0.42, a: p.a, pitch: -0.15 }); await shot.wait(3000);
    const [f] = Game.spawn('largemouth_bass') || []; f.x = Engine.P.x + Math.cos(p.a) * 0.8; f.y = Engine.P.y + Math.sin(p.a) * 0.8; f.z = Engine.P.z;
    Engine.carryFish(f, { logged: true }); if (Engine.carry.grips.includes('lip')) Engine.carry.grip = 'lip'; await shot.wait(2000);` },
  { name: 'hands-cradle', seed: 42, climate: 'temperate', run: `   // in your hands, first person (js/hands.js)
    const p = Game.findWater('pond', 0, 0, 3500) || Game.findWater('lake', 0, 0, 3500); Engine.travel(p.x, p.y);
    shot.hold({ tod: 0.42, a: p.a, pitch: -0.15 }); await shot.wait(3000);
    const [f] = Game.spawn('rainbow_trout') || []; f.x = Engine.P.x + Math.cos(p.a) * 0.8; f.y = Engine.P.y + Math.sin(p.a) * 0.8; f.z = Engine.P.z;
    Engine.carryFish(f, { logged: true }); if (Engine.carry.grips.includes('cradle')) Engine.carry.grip = 'cradle'; await shot.wait(2000);` },
  { name: 'hands-mid-lift', seed: 42, climate: 'temperate', run: `   // in your hands, first person (js/hands.js)
    const p = Game.findWater('pond', 0, 0, 3500) || Game.findWater('lake', 0, 0, 3500); Engine.travel(p.x, p.y);
    shot.hold({ tod: 0.42, a: p.a, pitch: -0.15 }); await shot.wait(3000);
    const [f] = Game.spawn('largemouth_bass') || []; f.x = Engine.P.x + Math.cos(p.a) * 0.8; f.y = Engine.P.y + Math.sin(p.a) * 0.8; f.z = Engine.P.z;
    Engine.carryFish(f, { logged: true }); if (Engine.carry.grips.includes('hand')) Engine.carry.grip = 'hand'; await shot.wait(200);` },
  { name: '1-pond-rod-in-hand', seed: 42, climate: 'temperate', run: `
    const p = Game.findWater('pond', 0, 0, 3500) || Game.findWater('lake', 0, 0, 3500); Engine.travel(p.x, p.y);
    shot.hold({ tod: 0.38, a: p.a, pitch: -0.2 }); Game.rod(true); await shot.wait(5000);` },
  { name: '2-ocean-sunset', seed: 42, climate: 'temperate', run: `
    const R = CONFIG.islandSize / 2, p = Game.findWater('sea', -R, 0, 6000); Engine.travel(p.x, p.y);   // the west coast, where the sun goes down over the sea
    shot.hold({ tod: 0.742, a: Math.PI, pitch: 0.02 }); await shot.wait(6000);` },
  { name: '3-coral-reef', seed: 42, climate: 'tropical', run: `
    const R = CONFIG.islandSize / 2; let best = null;   // round the coast: the thickest coral 4 to 9 m down
    for (let k = 0; k < 16; k++) { const g = k / 16 * 6.2832, p = Game.findWater('sea', Math.cos(g) * R * 0.7, Math.sin(g) * R * 0.7, 3000); if (!p) continue;
      for (let d = 6; d < 120; d += 8) { const x = p.x + Math.cos(p.a) * d, y = p.y + Math.sin(p.a) * d, w = Game.waterAt(x, y); if (w.kind !== 'sea' || w.depth < 4 || w.depth > 9) continue;
        const c = coverAt(x, y, 6, false).coral; if (c > 0.9) { best = { x, y, a: p.a, c, w }; break; } if (!best || c > best.c) best = { x, y, a: p.a, c, w }; } if (best && best.c > 0.9) break; }   // (dense enough: stop looking)
    window.shot.best = { c: best.c, d: best.w.depth, x: best.x, y: best.y }; Engine.travel(best.x - Math.cos(best.a) * 60, best.y - Math.sin(best.a) * 60); await shot.wait(1000);   // ashore nearby, so the land around streams in
    const bx = best.x - Math.cos(best.a) * 4, by = best.y - Math.sin(best.a) * 4; Engine.P.x = bx; Engine.P.y = by; const w = Game.waterAt(bx, by);   // a few metres back from it, looking out over it
    shot.hold({ tod: 0.5, z: Math.max(w.ground + 1.5, w.level - 1) - EYE, a: best.a + 0.5, pitch: -0.55 }); await shot.wait(4000);
    const [oc] = Game.spawn('common_octopus') || [], ox = bx + Math.cos(best.a + 0.5) * 3.2, oy = by + Math.sin(best.a + 0.5) * 3.2, og = Game.waterAt(ox, oy).ground;   // an octopus on the coral in front of you
    if (oc) Game.on('update', () => Object.assign(oc, { x: ox, y: oy, z: og + 0.25, a: best.a + 2.4 }));
    await shot.wait(2000);` },
  { name: '4-whale-deep-ocean', seed: 42, climate: 'tropical', run: `
    const p = Game.findWater('sea', 0, 0, 6000); Engine.travel(p.x, p.y); await shot.wait(1500);
    let d = 120; for (; d < 1500; d += 40) { const q = shot.out(p.a, d), w = Game.waterAt(q[0], q[1]); if (w.depth > 60) break; }   // out over deep water
    const [x, y] = shot.out(p.a, d); Engine.P.x = x; Engine.P.y = y; const w = Game.waterAt(x, y);
    shot.hold({ tod: 0.5, z: w.level - 2.5 - EYE, a: p.a, pitch: -0.12 }); await shot.wait(3000);
    const [wh] = Game.spawn('humpback_whale') || []; const [wx, wy] = shot.out(p.a, 20);   // broadside, near the surface, in the sunlit water
    if (wh) { wh.state = 'cruise'; window.shot.whale = wh; Game.on('update', () => { Object.assign(wh, { x: wx, y: wy, z: w.level - 5, a: p.a + Math.PI / 2 }); }); }
    await shot.wait(1500);` },
  { name: '5-arctic-river', seed: 42, climate: 'arctic', run: `
    Game.setSeason('summer'); const p = Game.findWater('river', 0, 0, 4000); Engine.travel(p.x, p.y);
    shot.hold({ tod: 0.45, a: p.a, pitch: -0.12 }); Game.rod(true); await shot.wait(3500);
    Engine.keys.KeyR = true; await shot.wait(700); Engine.keys.KeyR = false; await shot.wait(3500);` },   // a cast, and the line out on the water
];
// REVIEW-BIRDS: flamingos wading and flying (tropical), the penguin colony on its islet (arctic)
const VIEW = `shot.view = (tx, ty, tz, d, side, wet = -0.05) => {   // a dry spot d m from (tx, ty) with a clear line of sight to tz, side-on to heading side if it can
    let best = null; for (let k = 0; k < 36; k++) { const a = (side ?? 0) + k / 36 * 6.2832, x = tx + Math.cos(a) * d, y = ty + Math.sin(a) * d, g = Game.groundAt(x, y);
      const deep = Game.waterAt(x, y).depth > wet, eye = Math.max(g, Game.waterAt(x, y).level - 1.2) + 1.7; let clear = true;
      for (let u = 0.15; u < 0.95; u += 0.1) if (Game.groundAt(x + (tx - x) * u, y + (ty - y) * u) > eye + (tz - eye) * u - 0.15) clear = false;
      const sc = (clear ? 0 : 100) + (deep ? 50 : 0) + Math.abs(Math.cos(a - (side ?? 0))) * -3 + Math.max(0, g - tz) * 0.5; if (!best || sc < best.sc) best = { x, y, g: eye - 1.7, sc }; }
    return best; };`;
SHOTS.push(
  { name: 'birds-flamingo', seed: 42, climate: 'tropical', run: VIEW + `   // flamingos wading in the shallows off a beach (shy turned down so we can stand close)
    const sp = Birds.species.american_flamingo; sp.shy = 0.3; let p = null;
    for (let k = 0; k < 16 && !p; k++) { const g = k / 16 * 6.2832, q = Game.findWater('sea', Math.cos(g) * 2000, Math.sin(g) * 2000, 3000); if (!q) continue;
      for (let d = 0; d < 60; d += 2) { const w = Game.waterAt(q.x + Math.cos(q.a) * d, q.y + Math.sin(q.a) * d); if (w.kind === 'sea' && w.depth > 0.15 && w.depth < 0.5) { p = q; break; } } }
    Engine.travel(p.x, p.y); await shot.wait(1500); Birds.populate(); await shot.wait(3000);
    for (let t = 0; t < 60 && !Game.birdsOf('american_flamingo').some(b => b.st === 'stand'); t++) await shot.wait(500);
    const fl = Game.birdsOf('american_flamingo').filter(b => b.st === 'stand'), c = fl.reduce((t, b) => [t[0] + b.x / fl.length, t[1] + b.y / fl.length], [0, 0]);
    const f = fl.sort((a, b) => Math.hypot(a.x - c[0], a.y - c[1]) - Math.hypot(b.x - c[0], b.y - c[1]))[0];   // the middle of the flock, side-on from the beach
    fl.forEach((b, i) => Object.assign(b, { feeding: i % 3 === 1, one: i % 3 === 2, feedT: 99 }));   // all three poses: head up, feeding, on one leg
    const v = shot.view(f.x, f.y, f.z, 6, f.a + Math.PI / 2, 0.5); Engine.P.x = v.x; Engine.P.y = v.y;
    shot.hold({ tod: 0.42, z: v.g, a: Math.atan2(f.y - v.y, f.x - v.x), pitch: -0.12 }); await shot.wait(4000);` },
  { name: 'birds-flamingo-fly', seed: 42, climate: 'tropical', run: `   // flamingos in the air: necks out ahead, legs trailing
    const p = Game.findWater('sea', 0, 0, 6000); Engine.travel(p.x, p.y); await shot.wait(1500);
    const bs = []; for (let i = 0; i < 5; i++) bs.push(Game.spawnBird('american_flamingo', p.x, p.y));
    Game.on('update', () => bs.forEach((b, i) => { const d = 9 + (i % 2) * 2.5, s = (i - 2) * 2.6; Object.assign(b, { st: 'fly', target: null, a: p.a + Math.PI / 2 + 0.35, x: p.x + Math.cos(p.a) * d - Math.sin(p.a) * s, y: p.y + Math.sin(p.a) * d + Math.cos(p.a) * s, z: Engine.P.z + 3.2 + (i % 3) * 0.5, pitch: 0, roll: 0 }); }));
    shot.hold({ tod: 0.42, a: p.a, pitch: 0.2 }); await shot.wait(3000);` },
  { name: 'birds-penguin', seed: 42, climate: 'arctic', run: VIEW + `   // the penguin colony on its islet
    Game.setSeason('summer'); const sp = Birds.species.gentoo_penguin, S = Birds.home(sp); sp.shy = 0.5;
    Engine.travel(S.x - Math.cos(S.a) * 14, S.y - Math.sin(S.a) * 14); await shot.wait(1500); Birds.populate(); await shot.wait(6000);
    const pg = Game.birdsOf('gentoo_penguin').filter(b => b.st === 'stand'), c = pg.reduce((t, b) => [t[0] + b.x / pg.length, t[1] + b.y / pg.length, t[2] + b.z / pg.length], [0, 0, 0]);
    const v = shot.view(c[0], c[1], c[2], 8, S.a); Engine.P.x = v.x; Engine.P.y = v.y;
    shot.hold({ tod: 0.45, z: v.g, a: Math.atan2(c[1] - v.y, c[0] - v.x), pitch: Math.atan2(c[2] - v.g - 1.7, 8) }); await shot.wait(3000);
    shot.best = { pg: Game.birdsOf('gentoo_penguin').map(b => b.st) };` },
  { name: 'birds-penguin-swim', seed: 42, climate: 'arctic', run: `   // penguins swimming off the islet, one porpoising
    Game.setSeason('summer'); const sp = Birds.species.gentoo_penguin, S = Birds.home(sp); sp.shy = 0.5;
    Engine.travel(S.x - Math.cos(S.a) * 14, S.y - Math.sin(S.a) * 14); await shot.wait(1500);
    const q = S.sea[0], w = Game.waterAt(q[0], q[1]), bs = []; for (let i = 0; i < 4; i++) bs.push(Game.spawnBird('gentoo_penguin', q[0], q[1]));
    Engine.P.x = q[0] - 7; Engine.P.y = q[1]; shot.hold({ tod: 0.45, z: w.level - 1.2, a: 0, pitch: -0.05 });
    Game.on('update', () => bs.forEach((b, i) => { Object.assign(b, { x: q[0] + (i % 2) * 1.5, y: q[1] + (i - 1.5) * 1.6, a: Math.PI / 2, tgt: null, idle: 99 }); if (i === 1) { b.leap = 0.35; } }));
    await shot.wait(3000);` });
async function take(win, s) {
  const T0 = Date.now(), lap = w => process.env.SHOTS_TIME && console.log(`    ${w}: ${((Date.now() - T0) / 1000).toFixed(1)} s`);
  await win.loadFile(GAME, { query: { shot: s.name }, hash: `seed-${s.seed}&climate-${s.climate}&map` });   // (a new query each time: a changed #hash alone wouldn't reload the page)
  lap('loaded');
  for (let t = 0; t < 600; t++) { if (await win.webContents.executeJavaScript(`typeof Engine !== 'undefined' && !document.getElementById('loading')`)) break; await new Promise(r => setTimeout(r, 100)); }   // the island is built (the loading screen goes); the map it opens on is closed below
  lap('island ready');
  await win.webContents.insertCSS('#hud, #tui, #holderChip, #title, #pauseMenu { display: none !important; }');
  await win.webContents.executeJavaScript(PREP);
  await win.webContents.executeJavaScript(`(async () => { ${s.run} })()`);
  if (process.env.SHOTS_DEBUG) console.log(await win.webContents.executeJavaScript(`JSON.stringify({ best: shot.best, pitch: Engine.P.pitch, t0: Engine.time, climate: CLIMATE.key, hash: location.hash, P: [Engine.P.x, Engine.P.y, Engine.P.z].map(v => +v.toFixed(1)), water: Game.waterAt(Engine.P.x, Engine.P.y).kind, uw: Engine.uw, boat: !!Engine.boat, rod: Engine.ang && Engine.ang.out, phase: Engine.ang && Engine.ang.phase, rig: !!(Engine.ang && Engine.ang.S), msg: Engine.msg })`));
  lap('scene set');
  const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, s.name + '.png'), img.toPNG());
  lap('saved'); console.log('  ' + s.name + '.png');
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const want = process.argv.slice(2).filter(a => !a.startsWith('-') && !a.endsWith('.js')), list = want.length ? SHOTS.filter(s => want.some(w => s.name.includes(w))) : SHOTS;
  // a few at once, each in its own window drawn off screen at full speed (a plain hidden window gets only a few frames a second); SHOTS_AT_ONCE to change
  const queue = [...list], at = Math.max(1, +process.env.SHOTS_AT_ONCE || 3); let failed = 0;
  console.log(`Screenshots to ${OUT}:`);
  await Promise.all(Array.from({ length: Math.min(at, queue.length) }, async () => {
    const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } }); win.webContents.setFrameRate(60);
    for (let s; (s = queue.shift());) { try { await take(win, s); } catch (e) { failed++; console.error('  ' + s.name + ' failed: ' + e.message); } }
    win.destroy(); }));
  app.exit(failed ? 1 : 0);
});
