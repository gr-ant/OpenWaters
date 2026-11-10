'use strict';
// ======================================================================
//  GAME — a water-explorer starter. Replace this section with your fishing game.
// ======================================================================
(() => {
  const { MT } = Game;
  // a lantern post on the bank where you arrive, with a real light
  const post = Game.mesh(); post.mat = MT.WOOD; post.tube([0, 0, -0.2], [0, 0, 2.4], 0.08, 0.07, 6, [0.4, 0.28, 0.16], true);
  post.mat = MT.METAL; post.tube([0, 0, 2.4], [0, 0, 2.48], 0.2, 0.2, 6, [0.2, 0.19, 0.18], true);
  post.mat = MT.LAMP; post.tube([0, 0, 2.05], [0, 0, 2.4], 0.14, 0.14, 6, [1.7, 1.3, 0.7], true);
  Game.registerMesh('lantern', post.done());

  Game.on('key', code => {
    if (code === 'Digit2') { Game.fishFinder = !Game.fishFinder; Game.say(Game.fishFinder ? 'Fish radar on' : 'Fish radar off', 1);
      const b = document.querySelector('#tui [data-k="Digit2"]'); if (b) b.classList.toggle('lit', Game.fishFinder); }   // the touch button stays lit while it's on
    if (code === 'KeyY') { const S = Game.setSeason(SEASONS[(Math.floor(ENV.yf * 4) + 1) % 4]); Game.say(`It's ${S} now`, 2); }
    if (code === 'KeyU') { const K = Object.keys(WEATHER), k = K[(K.indexOf(ENV.kind) + 1) % K.length]; Game.setWeather(k); Game.say(`Weather: ${k}`, 2); }
  });

  Game.on('ready', () => {
    const P = Game.player, x = P.x - Math.cos(P.a) * 2.5 - Math.sin(P.a) * 2, y = P.y - Math.sin(P.a) * 2.5 + Math.cos(P.a) * 2;
    const lp = Game.addProp('lantern', x, y, { z: Game.groundAt(x, y) }); Game.addLight(lp.x, lp.y, lp.z + 2.2, 2.5, true);
    Game.addSolid((px, py) => Math.hypot(px - lp.x, py - lp.y) < 0.3);
    Game.say(`${CLIMATE.name} island`, 3);
  });

  // HUD: the water you're in, or the water under the crosshair (depth, current, distance), shown under the place name
  Game.onHud(() => {
    const P = Game.player, eye = P.z + Game.config.eyeHeight;
    let t = null;
    const bt = Engine.boat;
    if (bt) { const w = Game.waterAt(P.x, P.y), deck = Engine.boatMode === 'deck', T = Engine.touchUI;
      t = T ? `${bt.def.name}  ·  ${deck ? (Engine.boatSit ? 'sitting' : 'standing') : (bt.speed * 1.944).toFixed(1) + ' kn'}  ·  ${w.depth.toFixed(1)} m deep`
        : deck ? `${bt.def.name}  ·  ${Engine.boatSit ? 'sitting' : 'standing'}  ·  ${w.name}  ·  ${w.depth.toFixed(1)} m deep  ·  ${Controls.key('helm')} to drive  ·  ${Controls.key('jump')} to jump out`
        : `${bt.def.name}  ·  ${(bt.speed * 1.944).toFixed(1)} kn  ·  ${w.name}  ·  ${w.depth.toFixed(1)} m deep  ·  ${Controls.key('helm')} to leave the helm  ·  ${Controls.key('jump')} to jump out`; }
    else if (Engine.nearBoat()) t = `${Engine.nearBoat().def.name}  ·  ${Engine.touchUI ? 'Use' : 'F'} to get in`;
    if (t) {} else
    if (Game.underwater) { const w = Game.waterAt(P.x, P.y); t = `${w.name}  ·  ${(w.level - eye).toFixed(1)} m down  ·  bottom ${w.depth.toFixed(1)} m`; }
    else if (Game.swimming || Game.wading) { const w = Game.waterAt(P.x, P.y); t = `${Game.swimming ? 'Swimming' : 'Wading'} in ${w.name}${w.spring ? ' spring' : w.rapids > 0.4 ? ' rapids' : ''}  ·  ${w.depth.toFixed(1)} m deep${w.flow.speed > 0.2 ? `  ·  current ${w.flow.speed.toFixed(1)} m/s` : ''}`; }
    else { const l = Game.lookingAt; if (l) t = `${l.name}${l.spring ? ' spring' : l.rapids > 0.4 ? ' rapids' : ''}${l.iced ? ' (frozen)' : ''}  ·  ${l.temp.toFixed(0)}°C  ·  ${l.depth.toFixed(1)} m deep${l.flow.speed > 0.2 ? `  ·  current ${l.flow.speed.toFixed(1)} m/s` : ''}  ·  ${l.dist.toFixed(0)} m`; }
    Engine.hudDetail = t || '';
  });
  // ---- the edge of the world, drawn on the map as a dashed line out at sea ----
  Game.onMap((c, toPx) => {
    const E = CONFIG.worldEdge, [ax, ay] = toPx(-E, -E), [bx, by] = toPx(E, E);
    c.save(); c.setLineDash([8, 6]); c.lineWidth = 2; c.strokeStyle = 'rgba(232,208,146,.75)'; c.strokeRect(ax, ay, bx - ax, by - ay);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5); c.rect(ax, ay, bx - ax, by - ay); c.fill('evenodd'); c.restore();
  });

  // ---- start menu: the world runs behind it (a fresh island, a canoe on a pond); input is held until Start ----
  const T = document.getElementById('title'), start = document.getElementById('tiStart');
  const startGame = () => {
    if (!Engine.titleOpen) return;
    Engine.titleOpen = false; Engine.keys = {}; T.classList.add('leaving'); document.body.classList.remove('title-on');
    setTimeout(() => { T.hidden = true; }, 650);
    Engine.ov.focus({ preventScroll: true }); Engine.requestMouseLook();
    if (Engine.ang && Engine.ang.S && !Engine.ang.out && !Engine.swim && !Engine.boat) Engine.toggleRod(true);   // straight to fishing: the rod in your hand
    Game.say(`Welcome to Open Waters · ${CLIMATE.name} island`, 4);
  };
  start.onclick = startGame;
  document.getElementById('tiSettings').onclick = () => { Engine.titleSettings = true; Engine.togglePause(true); Engine.pauseShow('settings'); };
  // New island: choose temperate, tropical or arctic, then straight to the loading screen (the page reloads on a random seed in that climate, back to this menu)
  const menu = T.querySelector('.ti-menu'), bio = document.getElementById('tiBiomes');
  const biomes = on => { menu.hidden = on; bio.hidden = !on; (on ? bio.querySelector('.ti-bio') : document.getElementById('tiNew')).focus({ preventScroll: true }); };
  document.getElementById('tiNew').onclick = () => biomes(true);
  document.getElementById('tiBioBack').onclick = () => biomes(false);
  bio.onclick = e => { const b = e.target.closest('[data-climate]'); if (!b) return;
    T.hidden = true; document.body.classList.remove('title-on'); Engine.titleOpen = false;
    try { history.replaceState(null, '', location.pathname + location.search + '#climate-' + b.dataset.climate); } catch (e) { location.hash = 'climate-' + b.dataset.climate; }
    location.reload(); };
  // from the start menu, Settings is a single page: Back (or Esc) closes it and returns to the menu
  const pauseShow = Engine.pauseShow;
  Engine.pauseShow = function (page) {
    if (page === 'main' && this.titleSettings && this.pausePage === 'settings') { this.titleSettings = false; this.togglePause(false); return; }
    return pauseShow.call(this, page);
  };
  document.getElementById('pauseMenu').addEventListener('close', () => { Engine.titleSettings = false; if (Engine.titleOpen) start.focus({ preventScroll: true }); });
  // while the menu is up the game hears no keys (the menu's own buttons still work: Enter / Space / arrows)
  const hold = e => {
    if (!Engine.titleOpen || Engine.pauseOpen) return;
    e.stopPropagation();
    if (e.type === 'keydown' && e.code === 'Escape' && !bio.hidden) { e.preventDefault(); biomes(false); }   // out of the island choice, back to the menu
    else if (e.type === 'keydown' && /^Arrow(Down|Up|Left|Right)$/.test(e.code)) {   // the menu's items, or the island choice (its three, then Back)
      e.preventDefault(); const L = [...T.querySelectorAll(bio.hidden ? '.ti-menu button.ti-item' : '#tiBiomes button')], i = L.indexOf(document.activeElement);
      L[(i + (e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : -1) + L.length) % L.length].focus();
    } else if (e.type === 'keydown' && e.code === 'Enter' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#title button'))) { e.preventDefault(); startGame(); }
  };
  addEventListener('keydown', hold, true); addEventListener('keyup', hold, true);
  Game.on('ready', () => {
    if (!TITLE) return;
    Engine.titleOpen = true; T.hidden = false; document.body.classList.add('title-on');
    if (innerWidth > 700 && Engine.titleA !== undefined) Engine.titleA -= 0.3;   // look a little left of the canoe so it sits clear of the menu card
    const w = Game.waterAt(Engine.P.x + Math.cos(Engine.P.a) * 8, Engine.P.y + Math.sin(Engine.P.a) * 8);
    document.getElementById('tiSub').textContent = `${CLIMATE.name} Island${w && w.depth > 0 ? ' · ' + w.name : ''}`;
    document.getElementById('tiFoot').textContent = `Island no. ${SEED}`;
    setTimeout(() => start.focus({ preventScroll: true }), 50);
  });
  Game.on('update', () => {   // a slow look around while the menu is up
    if (!Engine.titleOpen || Engine.pauseOpen || Engine.titleA === undefined || REDUCED_MOTION) return;
    const P = Engine.P; P.a = Engine.titleA + 0.07 * Math.sin(Engine.time * 0.11); P.pitch = -0.2 + 0.025 * Math.sin(Engine.time * 0.17);
  });

  Game.on('action', () => { const l = Game.lookingAt; if (l) { Game.splash(l.x, l.y, 20); Game.sound('plop', { x: l.x, y: l.y }); Game.say(`Plop. ${l.name}`, 1); } else Game.say('Nothing to use here', 1); });
})();

