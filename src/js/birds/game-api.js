'use strict';
// The birds' Game API: the live list, registering and spawning birds, perch providers, and the game events that drive them.
// ---------------- Game API ----------------
Game.birdCalls = false;   // Settings → Animal sounds turns them on
Object.defineProperty(Game, 'birds', { get: () => Birds.list });
Game.birdsOf = id => Birds.list.filter(b => b.sp.id === id);
Game.registerBird = def => Birds.register(def);
Game.spawnBird = (id, x = Engine.P.x, y = Engine.P.y, { state = 'fly' } = {}) => Birds.make(id, x, y, state);
Game.addPerchProvider = (name, fn) => Birds.Perches.add(name, fn);
Game.perchesNear = (x, y, R = 60, kinds = null) => Birds.Perches.near(x, y, R, kinds);
Game.on('update', dt => Birds.update(dt));
Game.on('ready', () => Birds.populate());
Game.on('landed', () => Birds.excite());
Game.on('catch', () => Birds.excite());
