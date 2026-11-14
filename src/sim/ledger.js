'use strict';
// Shared simulation, part 6: who has which fish. Hook claims (the first claim wins, a second gets "taken"), and the
// fish that are gone: a kept catch is out of the world for everyone for config.fishRespawnMinutes (fish-gone), a released
// one never left. The game keeps the gone list in localStorage per island (store), a server in memory.
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { const S = globalThis.OWSim = globalThis.OWSim || {}; Object.assign(S, factory(S)); }
})(function () {
  // now(): ms (the game: Date.now, real minutes); respawnMinutes: a number or a function (the live Settings value);
  // store: { load() -> { id: ms } | null, save(gone) } (optional); onEvent(e): fish-gone / fish-back / claimed events
  function createFishLedger({ now, respawnMinutes = 30, store = null, onEvent = null } = {}) {
    const mins = typeof respawnMinutes === 'function' ? respawnMinutes : () => respawnMinutes;
    const claims = new Map();   // fish id -> who has it on the line
    const L = {
      gone: null,
      load() { if (!this.gone) { let g = null; try { g = store && store.load(); } catch (e) { g = null; } this.gone = g && typeof g === 'object' ? g : {}; } return this.gone; },
      save() { try { if (store) store.save(this.gone); } catch (e) { /* storage unavailable */ } },
      // caught and kept, and not back yet
      isGone(id) { const t = this.load()[id]; return t && now() - t < mins() * 60000; },
      // a kept catch: gone for everyone until it respawns (f: the live fish, or { id })
      remove(f) {
        if (!f || f.dead) return null; f.dead = true; const g = this.load(), t = now(); g[f.id] = t;
        for (const k in g) if (t - g[k] > mins() * 60000) delete g[k];
        this.save(); claims.delete(f.id);
        const e = { type: 'fish-gone', id: f.id, until: t + mins() * 60000 }; if (onEvent) onEvent(e); return e;
      },
      // let go (or taken back out of a keep net): it never left
      restore(id) { const g = this.load(); claims.delete(id); if (g[id]) { delete g[id]; this.save(); if (onEvent) onEvent({ type: 'fish-back', id }); } },
      // a hook claim: the first one wins; a second player gets "taken" (and a fish that's gone can't be hooked)
      claim(id, by) {
        if (this.isGone(id)) return { ok: false, reason: 'gone' };
        const c = claims.get(id); if (c !== undefined && c !== by) return { ok: false, reason: 'taken', by: c };
        claims.set(id, by); if (onEvent && c === undefined) onEvent({ type: 'claimed', id, by }); return { ok: true };
      },
      claimOf(id) { return claims.get(id); },
      // off the hook without being landed (it got away, the line broke): free for anyone again
      unclaim(id, by) { if (claims.get(id) === by) { claims.delete(id); if (onEvent) onEvent({ type: 'unclaimed', id, by }); return true; } return false; },
      // landed by whoever holds the claim: kept -> gone for everyone; released -> back in the water, still there
      land(f, by, keep) {
        const c = claims.get(f.id); if (c !== undefined && c !== by) return { ok: false, reason: 'taken', by: c };
        if (keep) return { ok: true, kept: true, event: this.remove(f) };
        this.restore(f.id); return { ok: true, kept: false };
      },
    };
    return L;
  }
  return { createFishLedger };
});
