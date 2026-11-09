'use strict';
const Engine = {
  P: { x: 0, y: 0, z: 0, vz: 0, a: 0, pitch: 0 },
  keys: {}, showMap: false, miniScale: 4, mapScale: 16, mapCX: 0, mapCY: 0, mapPtrs: new Map(), mapHoldT: 0, time: 0, last: 0, fps: 60, msg: '', msgT: 0,
  parts: [], chunks: new Map(), inv: [], taken: new Set(), miniMemo: { key: '' }, bigMemo: { key: '' }, menu: null, markers: [],
  pickups: [], props: [], lights: [], meshes: {}, meshData: {}, itemMeshes: {},
  fish: [], ripples: [], uw: false, swim: false, wade: 0, riseT: 2, rippleT: 0, bubbleT: 0, look: null, lookT: 0,
  propMesh(name) { return this.meshes[name] || (this.meshData[name] ? (this.meshes[name] = this.instMesh(this.meshData[name])) : null); },

  // one press of a game key (its original code), from the keyboard, a bound mouse button or wheel, or a touch button
  keyPress(code, e, card) {
    if (card) { if ((code === 'KeyE' || code === 'KeyX') && !e.repeat) this.finishCatch(code === 'KeyE'); return; }   // the catch card is modal: keep or release first
    this.keys[code] = true;
    if (code === 'KeyV' && !e.repeat && this.boat) this.toggleBoatMode();                       // take the helm / leave it to move about the boat
    if (code === 'KeyC' && !e.repeat && this.boat && this.boatMode === 'deck') this.toggleBoatSit();   // sit down / stand up
    if (code === 'KeyM' && !e.repeat) this.toggleBigMap();
    if (code === 'KeyN' && !e.repeat && this.showMap) this.seedPress();                       // the map screen's icons: a new island (twice), pin the minimap
    if (code === 'KeyP' && !e.repeat && this.showMap) this.togglePin();
    if ((code === 'Enter' || code === 'NumpadEnter') && !e.repeat && this.showMap) { this.menu = null; this.say('Travelling…', 1); setTimeout(() => this.travel(this.mapCX, this.mapCY, CONFIG.travelSymbol), 30); }   // to the crosshair
    if (code === 'KeyI' && !e.repeat) this.toggleTackle();                                       // the tackle box
    if (code === 'KeyJ' && !e.repeat) this.openJournal();                                        // the catch journal
    if (code === 'KeyB' && !e.repeat) this.openSpawn('boats');
    if (code === 'Digit1' && !e.repeat) this.openSpawn('spawn');                                  // (secret) spawn fish and wildlife
    if (code === 'Slash' && !e.repeat) this.toggleHelp();                                         // controls card
    if (code === 'KeyQ' && !e.repeat) this.toggleRod();                                          // rod out / away
    if ((code === 'Digit4' || code === 'Numpad4') && !e.repeat) this.toggleLureView();             // live lure camera
    if ((code === 'BracketLeft' || code === 'BracketRight') && this.ang && this.ang.S) this.setDrag(this.ang.dragKg * (code === 'BracketRight' ? 1.15 : 1 / 1.15));
    if (code === 'KeyF' && !e.repeat) this.action();
    if (code === 'KeyL' && !e.repeat) this.toggleTorch();                                        // the dive light, when you're deep
    if (code === 'KeyG' && !e.repeat) this.toggleBail();                                          // open / close the reel's bail
    if (code === 'Equal' || code === 'NumpadAdd') this.zoom(0.5);
    if (code === 'Minus' || code === 'NumpadSubtract') this.zoom(2);
    if ((code.startsWith('Arrow') || code === 'Space') && e.preventDefault) e.preventDefault();
    if (!e.repeat) Game.emit('key', code, e);   // holding a key fires once (zoom keys above still repeat)
  },
  init() {
    const cv = this.canvas = document.getElementById('canvas3d'), ov = this.ov = document.getElementById('overlay');
    const gl = this.gl = cv.getContext('webgl2', { antialias: true });
    if (!gl) { document.body.textContent = 'WebGL2 is required.'; throw new Error('no webgl2'); }
    this.ctx = ov.getContext('2d');
    const prog = (vs, fs) => {
      const p = gl.createProgram();
      for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
      return { p, u };
    };
    this.lit = prog(LIT_VS, LIT_FS); this.partP = prog(PART_VS, PART_FS); this.water = prog(WATER_VS, WATER_FS); this.sky = prog(SKY_VS, SKY_FS); this.rays = prog(SKY_VS, RAYS_FS);
    // shared terrain index buffer (65x65 grid)
    const N = CHK + 1, idx = new Uint16Array(CHK * CHK * 6);
    for (let j = 0, k = 0; j < CHK; j++) for (let i = 0; i < CHK; i++) { const a = j * N + i; idx.set([a, a + 1, a + N, a + 1, a + N + 1, a + N], k); k += 6; }
    this.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.fsVao = this.vao2d(new Float32Array([-1, -1, 3, -1, -1, 3]));                       // fullscreen triangle (sky)
    { // precipitation: 7000 drops, each a two-ended streak
      const n = 7000, d = new Float32Array(n * 8); for (let i = 0; i < n; i++) { const x = Math.random(), y = Math.random(), z = Math.random(); d.set([x, y, z, 0, x, y, z, 1], i * 8); }
      this.precip = prog(PRECIP_VS, PRECIP_FS); this.precipN = n; const vb = this.vbo(d); this.precipVao = gl.createVertexArray();
      gl.bindVertexArray(this.precipVao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.bindVertexArray(null);
    }
    const tm = treeMeshes();
    this.treeKinds = TREE_KINDS.map(k => ({ hi: this.vbo(tm[k]), hiN: tm[k].length / VS, lo: this.vbo(tm[k + 'L']), loN: tm[k + 'L'].length / VS }));
    const wm = waterMeshes(); this.plantKinds = {};
    for (const k in wm) this.plantKinds[k] = { vbo: this.vbo(wm[k]), n: wm[k].length / VS };
    gl.vertexAttrib1f(6, 0); // terrain has no material attribute: generic surface
    gl.vertexAttrib1f(7, -1e4); gl.vertexAttrib1f(8, 0); gl.vertexAttrib2f(9, -1e4, 0); gl.vertexAttrib1f(10, 0); // not underwater unless a mesh says so
    this.partVbo = gl.createBuffer(); this.partVao = gl.createVertexArray(); gl.bindVertexArray(this.partVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.partVbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28); gl.bindVertexArray(null);
    this.maxPx = Math.min(256, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]);
    this.loadSave();
    this.resize(); addEventListener('resize', () => this.resize());
    addEventListener('keydown', e => {
      if (e.code === 'Escape') { e.preventDefault(); if (!e.repeat) { if (this.pauseOpen && this.pausePage && this.pausePage !== 'main') this.pauseShow('main'); else this.togglePause(); } return; }   // in a settings page Esc goes back first
      if (this.pauseOpen) return;
      if (this.menuNav(e)) { e.preventDefault(); return; }   // arrows and Enter inside an open menu
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;   // typing in the spawn search or the tackle box
      // rebindable controls (js/controls.js): a physical key acts as the original key of each action bound to it;
      // synthetic presses from the touch buttons already carry those original codes
      const codes = e.isTrusted ? Controls.codesFor(e.code) : [e.code], card = !!(this.ang && this.ang.phase === 'card');
      if (e.isTrusted && Controls.bound(e.code)) e.preventDefault();   // Tab, / … belong to the game when bound
      for (const code of codes) this.keyPress(code, e, card);
    });
    addEventListener('keyup', e => { for (const code of e.isTrusted ? Controls.codesFor(e.code) : [e.code]) this.keys[code] = false; });
    // side mouse buttons and the wheel can be bound too (the browser's back / forward is held off while they are)
    const mouseCode = b => ['Mouse0', 'Mouse1', 'Mouse2', 'Mouse3', 'Mouse4'][b];
    addEventListener('mousedown', e => { const c = mouseCode(e.button); if (e.button === 0 || e.button === 2 || !Controls.bound(c)) return; e.preventDefault();
      if (this.pauseOpen) return; const card = !!(this.ang && this.ang.phase === 'card'); for (const code of Controls.codesFor(c)) this.keyPress(code, { repeat: false }, card); });
    addEventListener('mouseup', e => { const c = mouseCode(e.button); if (e.button === 0 || e.button === 2 || !Controls.bound(c)) return; e.preventDefault(); for (const code of Controls.codesFor(c)) this.keys[code] = false; });
    addEventListener('auxclick', e => { if (Controls.bound(mouseCode(e.button))) e.preventDefault(); });
    addEventListener('blur', () => { this.keys = {}; this.joy = null; this.tlook = null; this.resetMouseLook(); });   // alt-tab while holding W doesn't keep you walking
    ov.addEventListener('wheel', e => { // scroll to zoom the big map around the cursor
      if (!this.showMap) { // off the map the wheel can be bound (Pike: drag); one press per notch, trackpads throttled
        const c = e.deltaY < 0 ? 'WheelUp' : e.deltaY > 0 ? 'WheelDown' : null; if (!c || !Controls.bound(c) || this.pauseOpen || this.mouseLookBlocked()) return;
        e.preventDefault(); const now = performance.now(); if (now - (this.wheelT || 0) < 60) return; this.wheelT = now;
        for (const code of Controls.codesFor(c)) { this.keyPress(code, { repeat: false }, !!(this.ang && this.ang.phase === 'card')); this.keys[code] = false; } return; }
      e.preventDefault(); this.mapZoomAt(Math.exp(clamp(e.deltaY, -200, 200) * 0.0025), e.clientX, e.clientY); this.mapHoldT = performance.now();
    }, { passive: false });
    ov.addEventListener('contextmenu', e => { // right-click the map -> travel menu
      e.preventDefault();
      if (document.pointerLockElement === ov || this.recentTouch()) return;
      this.openMenu(e.clientX, e.clientY);
    });
    ov.addEventListener('click', e => {
      if (this.pauseOpen || this.recentTouch()) return; // touches are handled in setupTouch
      if (this.invClick(e.clientX, e.clientY)) return;
      if (this.menuClick(e.clientX, e.clientY)) return;
      if (document.pointerLockElement === ov) { if (!(this.ang && this.ang.out)) this.action(); return; }   // with the rod out the mouse casts and reels
      if (this.dragged) { this.dragged = false; return; } // end of a mouse-drag look
      this.requestMouseLook();
    });
    this.setupTouch(); this.setupSpawn(); this.setupTackle(); this.setupHud(); this.angLoad(); this.setupMouseLook(); this.setupKeySettings();
    // drop fish .json files anywhere on the game to add (or update) species; they're kept in this browser
    addEventListener('dragover', e => { e.preventDefault(); this.dropHint = 1; });
    addEventListener('dragleave', e => { if (!e.relatedTarget) this.dropHint = 0; });
    addEventListener('drop', async e => {
      e.preventDefault(); this.dropHint = 0; const msgs = [];
      for (const file of e.dataTransfer.files) {
        try { const j = JSON.parse(await file.text()), arr = Array.isArray(j) ? j : [j];
          if (arr.some(d => d && (TACKLE_TYPES.includes(d.type) || String(d.schema || '').startsWith('embercrown-tackle')))) { for (const r of await Game.loadTackle(j, { save: true })) msgs.push(r.def ? `✓ ${r.def.name}` + (r.warnings.length ? ` (${r.warnings.length} note${r.warnings.length > 1 ? 's' : ''})` : '') : `✗ ${file.name}: ${r.errors[0]}`); if (this.tackleOpen) this.tackleRender(); continue; }
          for (const r of await Game.loadFish(j, { save: true })) msgs.push(r.def ? `✓ ${r.def.name}` + (r.warnings.length ? ` (${r.warnings.length} note${r.warnings.length > 1 ? 's' : ''})` : '') : `✗ ${file.name}: ${r.errors[0]}`); }
        catch (err) { msgs.push(`✗ ${file.name}: ${err.message}`); }
      }
      this.say(msgs.join('   '), 7); console.log('Fish import:', msgs.join('\n'));
    });
    // spawn on the shore of the nearest lake (else pond, river, any water), facing the water
    const P = this.P;
    const spot = findWater(LAKE, 0, 0, 2500) || findWater(POND, 0, 0, 2500) || findWater(RIVER, 0, 0, 3000) || findWater(-1, 0, 0, 6000);
    if (spot) { P.x = spot.x; P.y = spot.y; P.a = spot.a; P.pitch = -0.12; }
    else for (let i = 0; i < 20000; i++) {
      const r = i * 3, a = i * 0.7, x = Math.cos(a) * r, y = Math.sin(a) * r, e = elev(x, y);
      if (e > 0.33 && e < 0.5) { P.x = x; P.y = y; break; }
    }
    { const at = !TITLE && location.hash.match(/at=(-?[\d.]+),(-?[\d.]+)(?:,(-?[\d.]+))?/);   // #seed-123&at=x,y,heading: start exactly there
      if (at) { P.x = +at[1]; P.y = +at[2]; if (at[3]) P.a = +at[3]; } }
    if (TITLE) {   // the start menu's view: standing on the bank of a pond (else a lake), a canoe moored in front of you
      const pond = findWater(POND, 0, 0, 3500) || findWater(LAKE, 0, 0, 3500) || spot;
      if (pond) {
        P.x = pond.x; P.y = pond.y; P.a = pond.a; P.pitch = -0.14;
        const wi = waterInfo(pond.wx, pond.wy), b = this.moorBoat(BoatDB.byId.canoe || this.boatFor('pond'), { wx: pond.wx, wy: pond.wy, kd: wi.kindId });
        if (b) { (this.boated || (this.boated = new Set())).add(wi.id);
          const dx = b.x - P.x, dy = b.y - P.y, d = Math.hypot(dx, dy) || 1, bx = P.x - dx / d * 2.5, by = P.y - dy / d * 2.5;   // a step back up the bank so the whole canoe is in view
          sample(bx, by); if (SW - hW(SE) < 0.05) { P.x = bx; P.y = by; }
          P.a = Math.atan2(b.y - P.y, b.x - P.x); P.pitch = -0.2; }
      }
      this.titleA = P.a;
    }
    P.z = standZ(P.x, P.y);
    { const w = findWater(-1, P.x, P.y, 80); if (w) this.hudKind = waterInfo(w.wx, w.wy).kind; }   // the HUD's context (which gear, which hints) before the first update
    // start afloat, in the boat that suits the water: moored off the shore spot on a fresh spawn, or right here when
    // the address's at= (kept up to date while you play) has you over water, as after a reload from a boat
    sample(P.x, P.y);
    const f = TITLE ? null : SW - hW(SE) > 0.5 ? { wx: P.x, wy: P.y } : spot && Math.hypot(P.x - spot.x, P.y - spot.y) < 1 ? spot : null;
    if (f) { const wi = waterInfo(f.wx, f.wy), b = this.moorBoat(this.boatFor(wi.kind), { wx: f.wx, wy: f.wy, kd: wi.kindId }); if (b) { (this.boated || (this.boated = new Set())).add(wi.id); this.boardBoat(b); } }
    if (/[#&]map(?=&|$)/.test(location.hash)) {   // rolled a new island from the map screen: open it again, and drop the flag so a plain reload doesn't
      const mz = parseFloat((location.hash.match(/[#&]mz=([\d.]+)/) || [])[1]); if (mz > 0) this.mapScale = clamp(mz, 1, 256);   // the zoom you had
      this.toggleBigMap(); try { history.replaceState(null, '', location.hash.replace(/&map(?=&|$)/, '').replace(/&mz=[\d.]+/, '')); } catch (e) { /* sandboxed: fine */ } }
    this.offsets = []; // chunk offsets sorted nearest-first for streaming
    for (let j = -VIEW; j <= VIEW; j++) for (let i = -VIEW; i <= VIEW; i++) if (i * i + j * j <= VIEW * VIEW) this.offsets.push([i, j]);
    this.offsets.sort((a, b) => (a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2));
    this.streamChunks(1e9, 2); // build the nearest ring synchronously
  },

};
