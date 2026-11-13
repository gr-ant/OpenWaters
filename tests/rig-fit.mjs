import assert from 'node:assert/strict';
import fs from 'node:fs';

// The rig builder only offers parts that fit what's above them on the line (tackle.js rigFit). Every built-in rig must pass
// its own rules, and every rod must have reels, lines and an end (bait or lure) to choose from. Run from the repository root: node tests/rig-fit.mjs
const read = p => fs.readFileSync(p, 'utf8');
const files = ['config', 'world/worldgen', 'models/mesh-builder', 'creatures/fish', 'tackle'];
const { TackleDB: T, rigFit: fit, rigSteps: steps, rigAutoName: name, rigStats: stats } = new Function('location', 'history', 'matchMedia', 'localStorage', 'var BUILTIN = { fish: [], boat: [], tackle: [], feature: [] }; var Engine = {};\n' + files.map(f => read(`src/js/${f}.js`)).join('\n') + '\nreturn { TackleDB, rigFit, rigSteps, rigAutoName, rigStats };')(
  { search: '', hash: '' }, { replaceState() {} }, () => ({ matches: false }), { getItem() { return null; }, setItem() {} });
const all = [...read('src/index.html').matchAll(/data-builtin="tackle" src="([^"]+)"/g)].map(m => JSON.parse(read(`src/${m[1]}`)));
for (const d of [...all.filter(d => d.type !== 'rig'), ...all.filter(d => d.type === 'rig')]) assert.ok(T.register(d, { quiet: true }).def, d.id);
const bad = [];
for (const r of T.ofType('rig')) for (const slot of steps(!!r.parts.lure)) { const id = r.parts[slot]; if (!id) continue; const why = fit(slot, T.byId[id], r.parts); if (why) bad.push(`${r.id}: ${slot} ${id} — ${why}`); }
assert.deepEqual(bad, [], 'built-in rigs that break the fit rules:\n' + bad.join('\n'));
for (const rod of T.ofType('rod')) { const P = { rod: rod.id }, ok = t => T.ofType(t).filter(d => !fit(t, d, P));
  assert.ok(ok('reel').length && ok('line').length && (ok('lure').length || ok('bait').length), `${rod.id}: nothing fits it`); }
assert.ok(fit('reel', T.byId.baitcaster, { rod: T.ofType('rod').find(r => r.reel === 'spinning').id }), 'a baitcaster does not go on a spinning rod');
const lureRig = T.ofType('rig').find(r => r.parts.lure);   // a lure under a float has no bait: must not throw
assert.deepEqual(stats({ ...lureRig, parts: { ...lureRig.parts, float: T.ofType('float')[0].id } }).errors, []);
console.log(`Rig fit checks passed (${T.ofType('rig').length} rigs). e.g. "${name(T.ofType('rig')[0].parts)}"`);
