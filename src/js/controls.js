'use strict';
// ======================================================================
//  CONTROLS — rebindable keys. Every action has a "canonical" key code: the key the game itself listens for (the
//  original layout). Pressing a physical key/button looks up the actions bound to it and acts as their canonical
//  keys, so the rest of the game never needs to know about rebinding. Presets: "guppy" (the original layout) and
//  "pike". Bindings are KeyboardEvent.code values, plus Mouse1 (middle), Mouse3 / Mouse4 (side buttons 4 and 5),
//  WheelUp and WheelDown. Left mouse (cast / reel / look), right-click (travel menu), Esc, the arrow keys, Enter,
//  Tab inside a menu, and N / P on the map stay fixed.
// ======================================================================
const CONTROL_ACTIONS = [   // [id, canonical code, group, label]
  ['forward', 'KeyW', 'Moving', 'Walk / swim forward · throttle up'], ['back', 'KeyS', 'Moving', 'Walk / swim back · throttle down'],
  ['left', 'KeyA', 'Moving', 'Step left · steer left'], ['right', 'KeyD', 'Moving', 'Step right · steer right'],
  ['run', 'ShiftLeft', 'Moving', 'Run · reel faster · boat power'], ['jump', 'Space', 'Moving', 'Jump · swim up'],
  ['dive', 'KeyC', 'Moving', 'Dive · sit / stand on deck'], ['use', 'KeyF', 'Moving', 'Use · board / leave a boat'],
  ['torch', 'KeyL', 'Moving', 'Dive light (deep water)'],
  ['rod', 'KeyQ', 'Fishing', 'Rod out / away'], ['cast', 'KeyR', 'Fishing', 'Cast · reel · strike (left mouse too)'],
  ['bail', 'KeyG', 'Fishing', 'Open / close the bail'], ['dragDown', 'BracketLeft', 'Fishing', 'Drag down'], ['dragUp', 'BracketRight', 'Fishing', 'Drag up'],
  ['keep', 'KeyE', 'Fishing', 'Keep a catch'], ['release', 'KeyX', 'Fishing', 'Release a catch'],
  ['boats', 'KeyB', 'Boats', 'Boats menu'], ['helm', 'KeyV', 'Boats', 'Take / leave the helm'],
  ['map', 'KeyM', 'Map', 'Big map'], ['zoomIn', 'Equal', 'Map', 'Zoom in'], ['zoomOut', 'Minus', 'Map', 'Zoom out'],
  ['tackle', 'KeyI', 'Menus', 'Tackle box'], ['journal', 'KeyJ', 'Menus', 'Catch journal'], ['help', 'Slash', 'Menus', 'Controls card'],
  ['fastTime', 'KeyT', 'Time & weather', 'Fast time (hold)'], ['season', 'KeyY', 'Time & weather', 'Next season'], ['weather', 'KeyU', 'Time & weather', 'Next weather'],
  ['spawn', 'Digit1', 'Extras (admin)', 'Spawn fish and wildlife'], ['radar', 'Digit2', 'Extras (admin)', 'Fish radar'],
].map(([id, canon, group, label]) => ({ id, canon, group, label }));
const CONTROL_FIXED = new Set(['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Enter', 'NumpadEnter', 'Tab', 'KeyN', 'KeyP']);
const GUPPY = Object.fromEntries(CONTROL_ACTIONS.map(a => [a.id, [a.canon]]));
Object.assign(GUPPY, { run: ['ShiftLeft', 'ShiftRight'], zoomIn: ['Equal', 'NumpadAdd'], zoomOut: ['Minus', 'NumpadSubtract'] });
const CONTROL_PRESETS = {
  guppy: { name: 'Guppy', binds: GUPPY },
  pike: { name: 'Pike', binds: { ...GUPPY, bail: ['KeyG', 'Mouse3'], dragDown: ['BracketLeft', 'WheelDown'], dragUp: ['BracketRight', 'WheelUp'],
    radar: ['Digit2', 'Mouse4'], boats: ['KeyX'], tackle: ['KeyI', 'Tab'] } },
};
const Controls = {
  KEY: 'embercrown-keys',
  preset: 'guppy', binds: null, phys: null,
  load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(this.KEY)); } catch (_) { /* defaults */ }
    if (s && s.binds && typeof s.binds === 'object') this.set(s.binds, CONTROL_PRESETS[s.preset] ? s.preset : 'custom', false);
    else this.usePreset('guppy', false);
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify({ preset: this.preset, binds: this.binds })); } catch (_) { /* session only */ } },
  usePreset(p, save = true) { this.set(CONTROL_PRESETS[p].binds, p, save); },
  set(binds, preset, save = true) {
    this.binds = {}; for (const a of CONTROL_ACTIONS) this.binds[a.id] = Array.isArray(binds[a.id]) ? binds[a.id].filter(c => typeof c === 'string').slice(0, 2) : [...GUPPY[a.id]];
    this.preset = preset; this.phys = new Map();
    for (const a of CONTROL_ACTIONS) for (const c of this.binds[a.id]) { if (!this.phys.has(c)) this.phys.set(c, []); this.phys.get(c).push(a.canon); }
    if (save) this.save();
  },
  // bind slot (0 or 1) of an action to a code (null clears it); any change makes the layout "custom"
  bind(id, slot, code) { const b = { ...this.binds, [id]: [...this.binds[id]] }; if (code) b[id][slot] = code; else b[id].splice(slot, 1); b[id] = b[id].filter(Boolean); this.set(b, 'custom'); },
  // the canonical codes a physical key/button stands for right now ([] = it does nothing)
  codesFor(code) {
    const c = this.phys.get(code) || [];
    if (CONTROL_FIXED.has(code) && !c.includes(code)) return [...c, code];
    if (c.length) return c;
    return CONTROL_ACTIONS.some(a => a.canon === code || GUPPY[a.id].includes(code)) ? [] : [code];   // an action's own key, rebound away, goes quiet
  },
  bound(code) { return this.phys.has(code); },
  // labels for the HUD: "G", "Mouse 4", "Wheel ↑" …
  name(code) {
    const N = { ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt', Space: 'Space', BracketLeft: '[', BracketRight: ']',
      Slash: '/', Backslash: '\\', Equal: '+', Minus: '−', Comma: ',', Period: '.', Semicolon: ';', Quote: "'", Backquote: '`', NumpadAdd: 'Num +', NumpadSubtract: 'Num −',
      Mouse1: 'Middle mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', WheelUp: 'Wheel ↑', WheelDown: 'Wheel ↓', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Caps' };
    return N[code] || code.replace(/^(Key|Digit)/, '').replace(/^Numpad/, 'Num ');
  },
  key(id) { const b = this.binds[id]; return b && b.length ? this.name(b[0]) : '—'; },   // the first key of an action, for hints
  keys(id) { const b = this.binds[id]; return b && b.length ? b.map(c => this.name(c)).join(' / ') : '—'; },
};
Controls.load();
