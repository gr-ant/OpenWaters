// Keyboard navigation in the menus (hud/menu-keys.js) against a tiny stand-in for the page: node tests/menu-keys.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const el = (name, extra = {}) => { const c = new Set(extra.on ? ['on'] : []); return Object.assign({ name, clicks: 0, dataset: {}, hidden: false, classList: { contains: k => c.has(k), add: k => c.add(k), remove: k => c.delete(k) }, click() { this.clicks++; (extra.pick || (() => {}))(this); }, scrollIntoView() {} }, extra.props); };
const pickIn = row => me => { for (const b of row()) b.classList.remove('on'); me.classList.add('on'); };
let tabs, cats, list, foot, spTabs, spSub, spList, grid = false;
tabs = ['rigs', 'gear', 'traps'].map((n, i) => el(n, { on: i === 0, pick: pickIn(() => tabs) }));
cats = ['all', 'lake', 'pond', 'river'].map((n, i) => el(n, { on: i === 0, pick: pickIn(() => cats) }));
list = ['a', 'b', 'c'].map((n, i) => el(n, { on: i === 1, props: { dataset: { rig: n } } })); foot = [el('build')];
spTabs = ['fish', 'wild'].map((n, i) => el(n, { on: i === 0, pick: pickIn(() => spTabs) })); spSub = ['all', 'lake', 'sea'].map((n, i) => el(n, { on: i === 2, pick: pickIn(() => spSub) }));
spList = ['x1', 'x2', 'x3', 'x4', 'x5'].map(n => el(n, { props: { dataset: { id: n } } }));
const marked = () => [...tabs, ...cats, ...list, ...foot, ...spTabs, ...spSub, ...spList].filter(e => e.classList.contains('nav')).map(e => e.name);
const group = (id, row) => ({ hidden: !row.length, querySelectorAll: () => row, classList: { contains: k => k === 'grid' && grid } });
const ctx = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), WATER_CATS: [], Math, Object,
  document: { getElementById: id => ({ spTabs: group(id, spTabs), spKind: group(id, []), spBiome: group(id, []), spSub: group(id, spSub), spList: group(id, spList) })[id],
    querySelectorAll: s => s === '#tkTabs button' ? tabs : s === '#tkBody .subtabs button' ? cats : s.startsWith('#tkBody [data-rig]') ? list : s.startsWith('#tkFoot') ? foot : s === '#spList [data-id]' ? spList : s.includes('.nav') ? [...tabs, ...cats, ...list, ...foot, ...spTabs, ...spSub, ...spList].filter(e => e.classList.contains('nav')) : [] } };
ctx.Engine = { tackleOpen: true, spawnOpen: false, spawnPlace() { this.placed = this.spawnSel; } };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/../src/js/hud/menu-keys.js', 'utf8').replace('Object.assign(Engine,', 'Object.assign(Engine,'), ctx);
const E = ctx.Engine, key = (code, more = {}) => E.menuNav(Object.assign({ code, target: {} }, more));
// the tackle box opens with the keyboard on the top row, on the tab that's showing
E.menuFocus = { panel: 'tackle', r: 0, c: -1 }; E.menuMark('tackle'); assert.deepEqual(marked(), ['rigs'], 'starts on the top row');
key('ArrowRight'); assert.deepEqual(marked(), ['gear']); assert.equal(tabs[1].clicks, 1, 'moving along the tabs chooses the tab');
key('ArrowLeft'); key('ArrowLeft'); assert.deepEqual(marked(), ['traps'], 'wraps round'); key('ArrowRight'); assert.deepEqual(marked(), ['rigs']);
key('ArrowDown'); assert.deepEqual(marked(), ['all'], 'down to the filter chips, on the chosen one'); key('ArrowRight'); key('ArrowRight'); assert.deepEqual(marked(), ['pond']); assert.equal(cats[2].clicks, 1);
key('ArrowDown'); assert.deepEqual(marked(), ['a'], 'down into the list at its first card'); assert.equal(E.tkNav, 'a');
key('ArrowDown'); key('ArrowDown'); assert.deepEqual(marked(), ['c']); key('ArrowRight'); assert.deepEqual(marked(), ['c'], 'no sideways in a one-column list'); assert.equal(list[2].clicks, 0);
key('Enter'); assert.equal(list[2].clicks, 1, 'Enter chooses the card'); key('ArrowDown'); assert.deepEqual(marked(), ['build'], 'then the button under the list'); key('ArrowDown'); assert.deepEqual(marked(), ['build'], 'stops at the bottom');
key('ArrowUp'); key('ArrowUp'); key('ArrowUp'); key('ArrowUp'); assert.deepEqual(marked(), ['pond'], 'back up to the chips, on the chosen one'); key('ArrowUp'); assert.deepEqual(marked(), ['rigs']); key('ArrowUp'); assert.deepEqual(marked(), ['rigs'], 'stops at the top');
key('ArrowDown'); key('ArrowDown'); key('Tab'); assert.deepEqual(marked(), ['gear'], 'Tab: the next tab, from anywhere');
assert.equal(key('KeyA'), false, 'other keys are left alone'); assert.equal(key('ArrowDown', { target: { tagName: 'SELECT', id: 'x' } }), false, 'the rig builder keeps its own keys');
// the boats grid: two cards a row, sideways moves between them
E.tackleOpen = false; E.spawnOpen = true; spTabs.length = 0; grid = true; E.menuFocus = { panel: 'spawn', r: 0, c: -1 }; E.menuMark('spawn'); assert.deepEqual(marked(), ['sea'], 'boats: starts on the water chips, on the chosen one');
key('ArrowDown'); assert.deepEqual(marked(), ['x1']); key('ArrowRight'); assert.deepEqual(marked(), ['x2']); key('ArrowDown'); assert.deepEqual(marked(), ['x4'], 'down keeps the column'); key('ArrowDown'); assert.deepEqual(marked(), ['x5'], 'a short last row');
assert.equal(E.spawnSel, 'x5'); assert.equal(E.spawnNav, true); key('Enter'); assert.equal(spList[4].clicks, 1); key('ArrowUp'); key('ArrowUp'); key('ArrowUp'); assert.deepEqual(marked(), ['sea']); assert.equal(E.spawnNav, false);
console.log('Menu key checks passed.');
