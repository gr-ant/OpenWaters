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
  { name: '1-pond-rod-in-hand', seed: 42, climate: 'temperate', run: `
    const p = Game.findWater('pond', 0, 0, 3500) || Game.findWater('lake', 0, 0, 3500); Engine.travel(p.x, p.y);
    shot.hold({ tod: 0.38, a: p.a, pitch: -0.2 }); Game.rod(true); await shot.wait(5000);` },
  { name: '2-ocean-sunset', seed: 42, climate: 'temperate', run: `
    const R = CONFIG.islandSize / 2, p = Game.findWater('sea', -R, 0, 6000); Engine.travel(p.x, p.y);   // the west coast, where the sun goes down over the sea
    shot.hold({ tod: 0.742, a: Math.PI, pitch: 0.02 }); await shot.wait(6000);` },
  { name: '3-coral-reef', seed: 42, climate: 'tropical', run: `
    const R = CONFIG.islandSize / 2; let best = null;   // round the coast: the thickest coral 4 to 9 m down
    for (let k = 0; k < 32; k++) { const g = k / 32 * 6.2832, p = Game.findWater('sea', Math.cos(g) * R * 0.7, Math.sin(g) * R * 0.7, 3000); if (!p) continue;
      for (let d = 6; d < 120; d += 5) { const x = p.x + Math.cos(p.a) * d, y = p.y + Math.sin(p.a) * d, w = Game.waterAt(x, y); if (w.kind !== 'sea' || w.depth < 4 || w.depth > 9) continue;
        const c = coverAt(x, y, 8, false).coral; if (!best || c > best.c) best = { x, y, a: p.a, c, w }; } }
    window.shot.best = { c: best.c, d: best.w.depth, x: best.x, y: best.y }; Engine.travel(best.x - Math.cos(best.a) * 60, best.y - Math.sin(best.a) * 60); await shot.wait(1000);   // ashore nearby, so the land around streams in
    const bx = best.x - Math.cos(best.a) * 4, by = best.y - Math.sin(best.a) * 4; Engine.P.x = bx; Engine.P.y = by; const w = Game.waterAt(bx, by);   // a few metres back from it, looking out over it
    shot.hold({ tod: 0.5, z: Math.max(w.ground + 1.5, w.level - 1) - EYE, a: best.a + 0.5, pitch: -0.55 }); await shot.wait(6000);` },
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

async function take(win, s) {
  await win.loadFile(GAME, { query: { shot: s.name }, hash: `seed-${s.seed}&climate-${s.climate}&map` });   // (a new query each time: a changed #hash alone wouldn't reload the page)
  for (let t = 0; t < 600; t++) { if (await win.webContents.executeJavaScript(`typeof Engine !== 'undefined' && !!Engine.vp && !document.getElementById('loading')`)) break; await new Promise(r => setTimeout(r, 100)); }
  await win.webContents.insertCSS('#hud, #tui, #holderChip, #title, #pauseMenu { display: none !important; }');
  await win.webContents.executeJavaScript(PREP);
  await win.webContents.executeJavaScript(`(async () => { ${s.run} })()`);
  if (process.env.SHOTS_DEBUG) console.log(await win.webContents.executeJavaScript(`JSON.stringify({ best: shot.best, pitch: Engine.P.pitch, t0: Engine.time, climate: CLIMATE.key, hash: location.hash, P: [Engine.P.x, Engine.P.y, Engine.P.z].map(v => +v.toFixed(1)), water: Game.waterAt(Engine.P.x, Engine.P.y).kind, uw: Engine.uw, boat: !!Engine.boat, rod: Engine.ang && Engine.ang.out, phase: Engine.ang && Engine.ang.phase, rig: !!(Engine.ang && Engine.ang.S), msg: Engine.msg })`));
  const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, s.name + '.png'), img.toPNG());
  console.log('  ' + s.name + '.png');
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const want = process.argv.slice(2).filter(a => !a.startsWith('-') && !a.endsWith('.js')), list = want.length ? SHOTS.filter(s => want.some(w => s.name.includes(w))) : SHOTS;
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });   // drawn off screen at full speed (a plain hidden window gets only a few frames a second)
  win.webContents.setFrameRate(60);
  console.log(`Screenshots to ${OUT}:`); let failed = 0;
  for (const s of list) { try { await take(win, s); } catch (e) { failed++; console.error('  ' + s.name + ' failed: ' + e.message); } }
  app.exit(failed ? 1 : 0);
});
