// Two Node clients against the server: create/join the same room, move, cast, hook, catch. Checks that a kept catch's
// fish_gone reaches the OTHER client, a bird spook reaches the other client, hash/resync recovers a corrupted client
// view, and a second hook claim on an already-hooked fish is rejected (first claim wins). Plus release, lost, chat, leave.
//   node test_two_clients.mjs                      (starts its own server on a spare port)
//   SERVER_URL=ws://localhost:8790 node test_two_clients.mjs   (uses a server you started)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); return ok; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// the client side of the state hash (README "hash"): sha1 of sorted "id:round(x):round(y):state" joined by "|", 12 hex
const fishHash = list => createHash('sha1').update([...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .map(f => `${f.id}:${Math.round(f.x)}:${Math.round(f.y)}:${f.state}`).join('|')).digest('hex').slice(0, 12);

let url = process.env.SERVER_URL, child = null;
if (!url) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  child = spawn(process.execPath, [path.join(here, 'server.js'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { child.stdout.on('data', d => { process.stdout.write('  [server] ' + d); if (String(d).includes('Open Waters server on')) res(); }); child.on('exit', rej); });
  url = `ws://localhost:${port}`;
}
const httpUrl = url.replace(/^ws/, 'http');

function client(name) {
  const ws = new WebSocket(url), inbox = [], waiters = [];
  const c = { name, ws, inbox, lastState: null, corrupt: false,
    send: m => ws.send(JSON.stringify(m)),
    // resolve with the first message (already received or future) that matches; consume it
    wait(pred, ms = 8000, what = 'message') {
      const i = inbox.findIndex(pred); if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((res, rej) => { const w = { pred, res }; waiters.push(w);
        setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); rej(new Error(`${name}: timed out waiting for ${what}`)); } }, ms); });
    },
    drop(t) { for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].t === t) inbox.splice(i, 1); },
  };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'state') { if (c.corrupt) m.fish.push({ id: 'bogus@0,0.0#0.0', x: 1, y: 1, state: 'rest' }); c.lastState = m; }
    const k = waiters.findIndex(w => w.pred(m)); if (k >= 0) waiters.splice(k, 1)[0].res(m); else { inbox.push(m); if (inbox.length > 500) inbox.shift(); }
  };
  c.opened = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return c;
}

const A = client('Ann'), B = client('Bob');
try {
  await Promise.all([A.opened, B.opened]);
  // ---- create / join ----
  let t0 = Date.now();
  A.send({ t: 'create', seed: 42, climate: 'temperate', wildlife: 2, name: 'Ann' });
  const ja = await A.wait(m => m.t === 'joined', 30000, 'joined');
  console.log(`  room ${ja.code} created in ${Date.now() - t0} ms (includes the headless island build)`);
  const sa = await A.wait(m => m.t === 'snapshot');
  check(ja.code && ja.code.length === 6 && ja.seed === 42 && ja.climate === 'temperate' && ja.isHost, 'A creates a room (6-char code, seed 42, temperate, host)');
  check(Array.isArray(sa.fish) && typeof sa.hash === 'string' && fishHash(sa.fish) === sa.hash, `A gets a snapshot whose hash matches its fish (${sa.fish.length} fish)`);
  B.send({ t: 'join', code: ja.code.toLowerCase(), name: 'Bob' });
  const jb = await B.wait(m => m.t === 'joined');
  await B.wait(m => m.t === 'snapshot');
  check(jb.code === ja.code && jb.seed === ja.seed && jb.climate === ja.climate && !jb.isHost, 'B joins the same room with the same seed and climate');
  check(!!(await A.wait(m => m.t === 'player_joined' && m.id === jb.pid)), 'A is told B joined');
  B.send({ t: 'join', code: 'ZZZZZZ' }); check((await B.wait(m => m.t === 'error')).code === 'bad_request', 'a second join on the same socket is refused');

  // ---- move ----
  const st = ja.start, at = (p, x, y, extra = {}) => p.send({ t: 'player_state', x, y, a: 0, swim: false, wade: false, ...extra });
  at(A, st.x, st.y); at(B, st.x + 3, st.y + 2);
  const sb = await B.wait(m => m.t === 'state' && m.players.some(q => q.id === ja.pid && Math.abs(q.x - st.x) < 0.01));
  check(true, `B sees A's position in state (tick ${sb.tick})`);

  // ---- cast, near a fish ----
  A.drop('state');
  let target = null;
  for (let k = 0; k < 6 && !target; k++) {   // fish near A (or a little way along the shore)
    const s = await A.wait(m => m.t === 'state', 3000, 'state');
    target = s.fish.find(f => !f.hooked);
    if (!target) at(A, st.x + Math.cos(st.a) * 6 * (k + 1), st.y + Math.sin(st.a) * 6 * (k + 1));   // wade out towards the water
  }
  if (!check(!!target, 'A has fish nearby to cast at')) throw new Error('no fish near the start: cannot continue');
  A.send({ t: 'cast', x: target.x, y: target.y, rig: 'bass_crankbait' });
  const cast = await B.wait(m => m.t === 'cast');
  check(cast.by === ja.pid && Math.abs(cast.x - target.x) < 0.01 && cast.rig === 'bass_crankbait', 'B sees A\'s cast relayed');
  at(A, st.x, st.y, { lure: { x: target.x, y: target.y } });

  // ---- hook: first claim wins (d) ----
  A.send({ t: 'hooked', id: target.id });
  const claimA = await A.wait(m => m.t === 'claim' && m.id === target.id), claimB = await B.wait(m => m.t === 'claim' && m.id === target.id);
  check(claimA.by === ja.pid && claimB.by === ja.pid, 'A\'s hook claim is granted and broadcast to both');
  B.send({ t: 'hooked', id: target.id });
  const tk = await B.wait(m => m.t === 'taken' && m.id === target.id);
  check(tk.reason === 'taken' && tk.by === ja.pid, `(d) B's claim on the already-hooked fish is rejected (taken, by A)`);
  B.drop('state'); const hs = await B.wait(m => m.t === 'state' && m.fish.some(f => f.id === target.id));
  check(hs.fish.find(f => f.id === target.id).hooked === ja.pid, 'B sees the fish on A\'s line in state (hooked: A)');
  B.send({ t: 'catch', id: target.id, kept: true });
  check((await B.wait(m => m.t === 'taken' && m.id === target.id)).reason === 'not_yours', 'B cannot land A\'s fish');

  // ---- catch, kept: fish_gone to the OTHER client (a) ----
  const before = Date.now() / 1000;
  A.send({ t: 'catch', id: target.id, kept: true, cm: target.cm, kg: target.kg });
  const gone = await B.wait(m => m.t === 'fish_gone' && m.id === target.id);
  const dt = gone.respawnAt - before;
  check(dt > 1795 && dt < 1805, `(a) B gets fish_gone for A's kept fish, respawnAt in ${(dt / 60).toFixed(2)} min (wall clock)`);
  const rec = await B.wait(m => m.t === 'catch' && m.id === target.id);
  check(rec.by === ja.pid && rec.kept === true && rec.species === target.species, `B gets the catch record (${rec.species}, ${rec.cm} cm)`);
  B.drop('state'); const after = await B.wait(m => m.t === 'state');
  check(!after.fish.some(f => f.id === target.id), 'the kept fish is no longer in B\'s state');
  B.send({ t: 'hooked', id: target.id }); check((await B.wait(m => m.t === 'taken' && m.id === target.id)).reason === 'gone', 'nobody can hook a gone fish');
  B.send({ t: 'resync' }); const sg = await B.wait(m => m.t === 'snapshot');
  check(sg.gone.includes(target.id) && Math.abs(sg.respawnAt[target.id] - gone.respawnAt) < 0.01, 'a fresh snapshot lists it as gone with the same respawnAt');

  // ---- released and lost ----
  A.drop('state');
  const s2 = await A.wait(m => m.t === 'state' && m.fish.some(f => !f.hooked), 6000, 'state with fish');
  const rel = s2.fish.find(f => !f.hooked);
  A.send({ t: 'hooked', id: rel.id }); await A.wait(m => m.t === 'claim' && m.id === rel.id);
  A.send({ t: 'catch', id: rel.id, kept: false });
  await B.wait(m => m.t === 'catch' && m.id === rel.id && m.kept === false);
  await sleep(300);
  check(!B.inbox.some(m => m.t === 'fish_gone' && m.id === rel.id), 'a released fish: catch record, but no fish_gone');
  B.drop('claim'); B.send({ t: 'hooked', id: rel.id });
  check((await B.wait(m => (m.t === 'claim' || m.t === 'taken') && m.id === rel.id)).by === jb.pid, 'and anyone can hook it again (B now has it)');
  B.send({ t: 'lost', id: rel.id, why: 'snap' });
  const lost = await A.wait(m => m.t === 'lost' && m.id === rel.id);
  check(lost.by === jb.pid && lost.why === 'snap', 'B loses it (snap): A is told');
  A.send({ t: 'hooked', id: rel.id }); check((await A.wait(m => (m.t === 'claim' || m.t === 'taken') && m.id === rel.id)).t === 'claim', 'after lost the fish is free: A can hook it');
  A.send({ t: 'lost', id: rel.id, why: 'thrown' }); await B.wait(m => m.t === 'lost' && m.id === rel.id);

  // ---- bird spook reaches the other client (b) ----
  // look about for a bird; prefer one on the water (fish below it to scare), else take any
  let bird = null, any = null;
  const tries = [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60], [120, 0], [-120, 0], [0, 120], [0, -120], [90, 90], [-90, -90], [90, -90], [-90, 90]];
  for (const [dx, dy] of tries) {
    at(A, st.x + dx, st.y + dy); A.drop('state');
    await A.wait(m => m.t === 'state'); const s = await A.wait(m => m.t === 'state');
    bird = s.birds.find(b => b.st === 'float'); any = any || s.birds.find(b => b.st !== 'away'); if (bird) break;
  }
  bird = bird || any;
  if (check(!!bird, bird ? `A finds a bird nearby (${bird.species} ${bird.st} at ${bird.x}, ${bird.y})` : 'A finds a bird nearby')) {
    at(A, bird.x + 1, bird.y + 1, { moving: true });
    const sp = await B.wait(m => m.t === 'spook' && m.id === bird.id, 5000, 'spook');
    check(sp.by === ja.pid && Array.isArray(sp.to) && sp.to.length === 2 && Array.isArray(sp.scared) && typeof sp.flightless === 'boolean',
      `(b) B gets the spook A caused: ${sp.species} ${sp.action} toward (${sp.to}), heading ${sp.a}, ${sp.scared.length} fish scared within 8 m`);
  }
  at(A, st.x, st.y);

  // ---- hash / resync (c) ----
  // B puts its lure among the fish (the released one's spot), so its state has fish in it to hash
  at(B, st.x + 3, st.y + 2, { lure: { x: rel.x, y: rel.y } });
  B.corrupt = false; B.drop('hash');
  let h = await B.wait(m => m.t === 'hash', 10000, 'hash');
  check(B.lastState && B.lastState.tick === h.tick && B.lastState.fish.length > 0 && fishHash(B.lastState.fish) === h.hash,
    `B's own hash of its state matches the server's (tick ${h.tick}, ${h.hash}, ${B.lastState.fish.length} fish)`);
  B.corrupt = true;   // from now on B's copy of each state has a stray fish in it: a stale / corrupted client view
  h = await B.wait(m => m.t === 'hash', 10000, 'hash');
  const bad = fishHash(B.lastState.fish);
  check(B.lastState.tick === h.tick && bad !== h.hash, `(c) the corrupted view is detected: client ${bad} vs server ${h.hash}`);
  B.corrupt = false; B.drop('snapshot'); B.send({ t: 'resync' });
  const snap = await B.wait(m => m.t === 'snapshot');
  check(!snap.fish.some(f => f.id.startsWith('bogus')) && fishHash(snap.fish) === snap.hash, `(c) resync sends a fresh snapshot that matches its hash (${snap.fish.length} fish)`);
  h = await B.wait(m => m.t === 'hash', 10000, 'hash');
  check(B.lastState.tick === h.tick && fishHash(B.lastState.fish) === h.hash, '(c) after resync the next hash matches again');

  // ---- chat, interest numbers, leave ----
  A.send({ t: 'chat', text: 'nice one!' }); const ch = await B.wait(m => m.t === 'chat');
  check(ch.by === ja.pid && ch.name === 'Ann' && ch.text === 'nice one!', 'chat reaches B');
  const stats = (await (await fetch(httpUrl + '/stats')).json()).rooms.find(r => r.code === ja.code);
  console.log(`  interest management: ${stats.fishSimulated} fish simulated in the room (${stats.cells} cells), sent per client: last ${JSON.stringify(stats.sentPerClientLast)}, max ${stats.sentPerClientMax}, avg ${stats.sentPerClientAvg}; ${stats.birds} birds loaded`);
  check(stats.fishSimulated > stats.sentPerClientMax, 'each state carries only a fraction of the room\'s fish');
  A.send({ t: 'leave' });
  check((await B.wait(m => m.t === 'leave' && m.id === ja.pid)).id === ja.pid, 'B is told A left');
  check((await B.wait(m => m.t === 'host_changed')).hostPid === jb.pid, 'B becomes the display host');
} catch (e) {
  check(false, `test aborted: ${e.message}`);
} finally {
  try { A.ws.close(); B.ws.close(); } catch (e) { /* closed */ }
  if (child) child.kill();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
