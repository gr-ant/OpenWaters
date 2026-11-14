'use strict';
// Shared simulation, part 3: the water fish live in. Seasons and weather (the ENV state machine), water temperature,
// springs, the warm sea current, pack ice, dissolved oxygen, how well a spot suits a species (habitatScore, envAt), food
// and activity curves. installEnvironment(world) adds these to a world made by createWorld (sim/index.js); they read the
// world's seed, climate, config, clock and terrain (world.terrain) instead of the game's globals.
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else { const S = globalThis.OWSim = globalThis.OWSim || {}; Object.assign(S, factory(S)); }
})(function (S) {
  const { mulberry32, clamp, sstep, fitRange, currentFit, coverFit, OCEAN, LAKE, POND, RIVER, CREEK, WATER_KEYS } = S;
  // A short year (config.daysPerSeason game days per season). yf: 0..1 through the year, 0 = first day of spring.
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const WEATHER = { // the look and feel of each kind of weather (blended over about an hour of game time)
    clear:    { cloud: 0.08, rain: 0, wind: 0.2, fog: 0, storm: 0, p: 1023 },
    fair:     { cloud: 0.35, rain: 0, wind: 0.35, fog: 0, storm: 0, p: 1017 },
    overcast: { cloud: 0.88, rain: 0, wind: 0.3, fog: 0.12, storm: 0, p: 1009 },
    drizzle:  { cloud: 0.92, rain: 0.3, wind: 0.25, fog: 0.3, storm: 0, p: 1006 },
    rain:     { cloud: 0.96, rain: 0.75, wind: 0.5, fog: 0.25, storm: 0, p: 1001 },
    storm:    { cloud: 1, rain: 1, wind: 0.95, fog: 0.2, storm: 1, p: 994 },
    fog:      { cloud: 0.55, rain: 0, wind: 0.04, fog: 1, storm: 0, p: 1019 },
  };
  // what tends to follow what (weights), nudged by season below
  const WEATHER_NEXT = {
    clear: { clear: 4, fair: 4, overcast: 1, fog: 1 }, fair: { clear: 2, fair: 3, overcast: 3, drizzle: 1 },
    overcast: { fair: 2, overcast: 2, drizzle: 2, rain: 2, storm: 0.5 }, drizzle: { overcast: 2, drizzle: 1, rain: 2, fair: 1 },
    rain: { overcast: 2, drizzle: 1, rain: 1, storm: 1, fair: 1 }, storm: { rain: 2, overcast: 2, fair: 1 }, fog: { clear: 2, fair: 2, overcast: 1 },
  };

  function installEnvironment(world) {
    const terr = world.terrain, murk = k => (terr.murk ? terr.murk(k) : S.WATER_MURK[k]);
    const todNow = () => world.tod(world.config.startHour / 24);   // time of day 0..1
    // ENV holds the live conditions: air temperature, cloud, rain or snow, wind, fog, pressure and its trend, how wet
    // the land is, snow cover, leaf state, plant growth and ice. Water temperature and oxygen follow from them.
    const ENV = world.env = {
      yf: 0, day: 0, hours: 0, block: -1, blockStart: 0, blockEnd: 0, kind: 'fair', next: 'fair', blockLen: 5,
      cloud: 0.3, rain: 0, wind: 0.3, fog: 0, storm: 0, pressure: 1015, pTarget: 1015, trend: 0, pHist: [],
      airT: 15, airMean: 15, wet: 0, snowCover: 0, flash: 0, flashT: 4, snowing: 0, hatch: 0,
      leaf: 1, autumn: 0, young: 0, dormant: 0, growth: 1, iceLake: 0, icePond: 0, iceSea: 0, turb: 0, light: 1,
      get season() { return SEASONS[Math.floor(this.yf * 4) % 4]; },
      get yearDays() { return world.config.daysPerSeason * 4; },
      label() {
        const s = this.yf * 4 % 1, part = s < 0.34 ? 'Early' : s < 0.67 ? 'Mid' : 'Late', S = this.season;
        const sky = this.snowing > 0.3 ? (this.rain > 0.6 ? 'Heavy snow' : 'Snow') : this.storm > 0.5 ? 'Thunderstorm' : this.rain > 0.55 ? 'Rain' : this.rain > 0.15 ? 'Drizzle'
          : this.fog > 0.6 ? 'Fog' : this.cloud > 0.75 ? 'Overcast' : this.cloud > 0.3 ? 'Partly cloudy' : 'Clear';
        return `${part} ${S[0].toUpperCase() + S.slice(1)} · day ${Math.floor(this.day % this.yearDays) + 1} · ${this.airT.toFixed(0)}°C · ${sky} · wind ${(this.wind * 12).toFixed(0)} m/s`;
      },
      // seasonal mean air temperature (°C): coldest in mid winter, warmest in mid summer
      airMeanAt(yf) { return world.climate.air[0] + world.climate.air[1] * Math.cos(6.2832 * (yf - 0.375)); },
      // start (or jump) to a point in the year; weather restarts from something typical for it
      setDate(yf, hour) {
        this.yf = ((yf % 1) + 1) % 1; const h = hour ?? todNow() * 24;
        this.hours = Math.floor(this.yf * this.yearDays) * 24 + h; this.day = this.hours / 24; this.yf = (this.day / this.yearDays) % 1;
        if (hour !== undefined) world.setTod(hour / 24);
        this.block = -1; this.settle = true; this.wet = 0.2; this.pHist.length = 0; this.forced = 0;   // (the clock may have gone back: old pressure samples and a forced weather would be from the future)
        this.snowCover = world.climate.key === 'tropical' ? 0 : world.climate.key === 'arctic' ? (this.airMeanAt(this.yf - 0.03) < 1 ? 1 : 0.15) : this.yf > 0.78 || this.yf < 0.04 ? 0.8 : 0;
      },
      setWeather(kind) { if (!WEATHER[kind]) return; this.kind = this.next = kind; this.settle = true; this.forced = this.hours + 6; },
      pickNext(rng) {
        const W = Object.assign({}, WEATHER_NEXT[this.kind]), S = this.season;
        if (S === 'summer') { W.clear = (W.clear || 0) * 1.4; W.storm = (W.storm || 0) * 1.8; W.fog = (W.fog || 0) * 0.5; }
        if (S === 'autumn') { W.fog = (W.fog || 0) * 1.8 + 0.5; W.rain = (W.rain || 0) * 1.3; }
        if (S === 'winter') { W.overcast = (W.overcast || 0) * 1.5; W.storm = (W.storm || 0) * 0.3; }
        if (S === 'spring') { W.drizzle = (W.drizzle || 0) * 1.5; W.rain = (W.rain || 0) * 1.3; }
        if (world.climate.key === 'tropical') { W.fog = 0; W.storm = (W.storm || 0) * (S === 'summer' || S === 'autumn' ? 3 : 1); W.rain = (W.rain || 0) * (S === 'summer' ? 2 : 0.6); W.clear = (W.clear || 0) * (S === 'winter' ? 2 : 1); }   // a wet and a dry season
        if (world.climate.key === 'arctic') { W.overcast = (W.overcast || 0) * 1.6; W.fog = (W.fog || 0) * (S === 'summer' ? 2.5 : 0.5); W.storm = (W.storm || 0) * 0.3; }
        let tot = 0; for (const k in W) tot += W[k]; let r = rng() * tot;
        for (const k in W) if ((r -= W[k]) <= 0) return k; return 'fair';
      },
      update(dtH, dt) {
        this.hours += dtH; this.day = this.hours / 24; this.yf = (this.day / this.yearDays) % 1;
        const tod = todNow(), hour = tod * 24, yf = this.yf;
        // weather: a new kind every few hours, chosen from what usually follows; the front's pressure arrives first
        if (this.block < 0 || this.hours >= this.blockEnd) {
          const blk = this.block < 0 ? Math.floor(this.hours / 5) : this.block + 1, rng = mulberry32((world.seed ^ Math.imul(blk + 7919, 2654435761)) >>> 0);
          if (this.block < 0) { if (!(this.forced && this.hours < this.forced)) this.kind = this.pickNext(rng); this.next = this.pickNext(rng); }
          else if (this.forced && this.hours < this.forced) this.next = this.kind;   // a forced weather holds for a few hours
          else { this.kind = this.next; this.next = this.pickNext(rng); }
          this.block = blk; this.blockLen = 3 + 5 * rng(); this.blockStart = this.hours; this.blockEnd = this.hours + this.blockLen;
        }
        const W = WEATHER[this.kind], Wn = WEATHER[this.next], into = clamp((this.hours - this.blockStart) / this.blockLen, 0, 1);
        const lerpK = this.settle ? 1 : Math.min(1, dtH * 0.9);
        const ease = (k, v) => { this[k] += (v - this[k]) * lerpK; };
        ease('cloud', W.cloud); ease('rain', W.rain); ease('wind', W.wind); ease('fog', W.fog * (hour < 4 || hour > 21 || (hour > 4 && hour < 10) ? 1 : 0.35)); ease('storm', W.storm);
        this.pTarget = W.p + (Wn.p - W.p) * sstep(0.4, 1, into);   // the next front's pressure starts to show before it arrives
        this.pressure += (this.pTarget - this.pressure) * (this.settle ? 1 : Math.min(1, dtH * 0.5));
        { const H = this.pHist, last = H.length ? H[H.length - 1][0] : -1e9;   // a sample a game-minute (not a frame): ~180 entries for the 3-hour window
          if (this.hours - last >= 1 / 60 || this.settle) { H.push([this.hours, this.pressure]); let drop = 0; while (H.length - drop > 2 && this.hours - H[drop][0] > 3) drop++; if (drop) H.splice(0, drop); } }
        this.trend = this.pressure - this.pHist[0][1];   // hPa over the last ~3 hours
        // air temperature: season, day/night (less under cloud), and the weather
        this.airMean = this.airMeanAt(yf);
        const sunUp = Math.sin((hour - 6) / 24 * 6.2832);
        this.airT = this.airMean + sunUp * (5.5 - 3.5 * this.cloud) - 2.5 * this.rain + (this.kind === 'clear' && sunUp < 0 ? -2 : 0);
        this.snowing = this.rain > 0.05 && this.airT < 1.2 ? 1 : 0;
        // the land: wet after rain, drying in sun and wind; snow lies when it's cold, melts when it isn't
        this.wet = clamp(this.wet + dtH * (this.rain * (this.snowing ? 0.05 : 0.35) - 0.03 * (1 + 2 * (1 - this.cloud) * Math.max(0, sunUp) + this.wind)), 0, 1);
        this.snowCover = clamp(this.snowCover + dtH * (this.snowing * this.rain * 0.25 - (this.airT > 1 ? 0.012 * (this.airT - 1) * (1 + this.rain) : 0)), 0, 1);
        this.turb = clamp(this.wet * 0.9 + this.rain * 0.3 - 0.15, 0, 1) * (this.snowing ? 0.3 : 1);   // streams run muddy after rain
        // lightning in storms
        this.flash = Math.max(0, this.flash - dt * 6);
        if (this.storm > 0.5 && (this.flashT -= dt) <= 0) { this.flash = 1; this.flashT = 3 + world.fxRng() * 12; }
        // leaves: bud-burst in early spring, autumn colour, then the fall; grass browns over winter
        this.leaf = world.climate.evergreen ? 1 : sstep(0.05, 0.14, yf) * (1 - sstep(0.64, 0.73, yf));
        this.young = world.climate.evergreen ? 0 : sstep(0.03, 0.07, yf) * (1 - sstep(0.16, 0.26, yf));
        this.autumn = world.climate.evergreen ? 0 : sstep(0.53, 0.64, yf) * (yf < 0.9 ? 1 : 0);
        this.dormant = world.climate.evergreen ? 0 : Math.max(sstep(0.6, 0.76, yf), 1 - sstep(0.02, 0.13, yf)) * (yf > 0.4 || yf < 0.15 ? 1 : 0);
        this.growth = world.climate.evergreen ? 1 : sstep(0.08, 0.3, yf) * (1 - sstep(0.62, 0.8, yf));   // water plants: lilies and weed beds
        // ice on still water when its surface is at freezing
        // (they freeze after a spell of frost: lakes a few weeks behind the air, ponds sooner)
        this.iceLake = sstep(-0.6, -2.4, this.airMeanAt(yf - 0.035) - world.config.waterTempOffset); this.icePond = sstep(0.6, -1.4, this.airMeanAt(yf - 0.015) - world.config.waterTempOffset);
        this.iceSea = world.climate.seaIce ? sstep(-3, -14, this.airMeanAt(yf - 0.06) - world.config.waterTempOffset) : 0;   // arctic pack ice: floes in spring and autumn, solid in winter
        this.light = sstep(-0.1, 0.25, sunUp) * (1 - 0.6 * this.cloud) * (1 - 0.3 * this.fog);
        // insect hatches: spring into summer, peaking around dusk (and on mild grey days), not in cold or storms
        const dh = ((hour - 19.5 + 36) % 24) - 12, dusk = Math.exp(-dh * dh / 3) + 0.5 * Math.exp(-((hour - 8) ** 2) / 4);
        this.hatch = sstep(0.06, 0.18, yf) * (1 - sstep(0.5, 0.62, yf)) * Math.min(1, dusk + 0.35 * sstep(0.6, 0.9, this.cloud) * (1 - this.rain)) * sstep(8, 14, this.airT) * (1 - 0.7 * this.storm) * (1 - 0.5 * sstep(0.6, 1, this.wind));
        this.windDir = 0.8 + 1.4 * Math.sin(this.hours / 31) + 0.5 * Math.sin(this.hours / 7.3);
        this.settle = false;
      },
      iced(kind, dep, x, y) {
        if (kind === OCEAN) return this.iceSea > 0 && (x === undefined ? dep < this.iceSea * 16 - 0.2 : floe(x, y) < this.iceSea * 0.95 - 0.12 + 0.18 * (1 - sstep(2, 12, dep)));
        const a = kind === LAKE ? this.iceLake : kind === POND ? this.icePond : 0; return a > 0 && dep < a * 16 - 0.2; },
    };
    // surface water temperature through the year (no weather, no day/night); `raw` can go below freezing (= ice)
    function rawSurfaceT(kind, yf) {
      const k = [[11, 6, 0.45], [12, 11, 0.41], [13, 12, 0.39], [10, 8, 0.4], [9, 4, 0.4]][kind];   // [mean, swing, warmest point of the year]
      return k[0] + world.climate.water[kind] + k[1] * world.climate.amp * Math.cos(6.2832 * (yf - k[2])) + world.config.waterTempOffset;
    }
    // pack ice floes: the same value noise as the water shader's (so what you see is what you can stand on), 0..1
    function h21js(x, y) { x = ((x % 512) + 512) % 512 * 0.1031; y = ((y % 512) + 512) % 512 * 0.1030; x -= Math.floor(x); y -= Math.floor(y); const d = x * (y + 33.33) + y * (x + 33.33); x += d; y += d; const v = (x + y) * x; return v - Math.floor(v); }
    function vnjs(x, y) { const i = Math.floor(x), j = Math.floor(y); let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = h21js(i, j), b = h21js(i + 1, j), c = h21js(i, j + 1), d = h21js(i + 1, j + 1); return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy; }
    const floe = (x, y) => 0.65 * vnjs(x * 0.025, y * 0.025) + 0.35 * vnjs(x * 0.09 + 3, y * 0.09 + 7);
    // A warm current washes the island's south-east shore (coral reefs, clear blue water, tropical fish offshore);
    // the north-west coast gets cold water. 0 = cold side .. 1 = warm side.
    function seaWarm(x, y) { if (world.climate.reefsEverywhere) return 1; if (!world.climate.seaCurrent) return 0; if (x === undefined) return 0.3; const R = world.config.islandSize / 2; return sstep(-0.35, 0.45, (x * 0.35 + y * 0.94) / R + 0.12 * world.noise(x / 2600 + 9, y / 2600 - 4)); }
    // groundwater wells up at springs at a steady ~9 °C: creek water near one stays cool in summer and open in winter
    function springPull(x, y) {
      const springs = terr.springs; if (!springs || x === undefined) return 0; let best = 1e9;
      for (const sp of springs) { const d = Math.abs(sp.x - x) + Math.abs(sp.y - y); if (d < best) best = d; }
      return 1 - sstep(12, 140, best);
    }
    // Water temperature (°C) `below` metres under the surface. live = false gives the reference midsummer noon the
    // populations are laid out for (so fish don't vanish in winter: they move and slow down instead).
    function waterTemp(kind, level, below, x, y, live = true) {
      const yf = live ? world.env.yf : 0.33, surfRaw = rawSurfaceT(kind, yf), Tmin = kind === OCEAN ? -1.8 : 0.2;   // salt water stays liquid to -1.8 °C
      let T = Math.max(Tmin, surfRaw) - Math.max(0, level - terr.seaLevel) * 0.05;
      if (live) {
        T += [0.02, 0.06, 0.25, 0.12, 0.05][kind] * (world.env.airT - world.env.airMean);
        T += [0.3, 1, 1.6, 0.6, 0.5][kind] * (1 - 0.6 * world.env.cloud) * Math.sin((world.tod(world.config.startHour / 24) * 24 - 9) / 24 * 6.2832);
      } else T += [0.3, 1, 1.6, 0.6, 0.5][kind] * 0.5;
      if (kind === CREEK || kind === RIVER) { const s = springPull(x, y) * (kind === CREEK ? 1 : 0.4); T += (9 - T) * s; }
      const w = kind === OCEAN ? seaWarm(x, y) : 0;   // the warm current's mixed layer is deep and stays warm far down
      if (kind === OCEAN && world.climate.seaCurrent) T += 5.5 * w - 2.5;   // a mild current to the south-east (~20 °C in summer), cold water to the north-west
      if (kind === LAKE || kind === OCEAN) {   // layers: warm (or, under ice, cold) water on top, ~4-7 °C below
        const deep = kind === OCEAN ? (world.climate.key === 'arctic' ? Math.max(-1.5, Math.min(T, 1.5)) : Math.min(T, 6 + (world.climate.reefsEverywhere ? 14 : 6) * w)) : T > 4 ? Math.min(T, 4 + 2.5 * sstep(0, 0.3, yf)) : 4;
        const top = kind === OCEAN ? 8 + (world.climate.reefsEverywhere ? 30 : 8) * w : T > 12 ? 3 : 1.5, bot = kind === OCEAN ? 30 + 80 * w : T > 12 ? 9 : 5;
        T += (deep - T) * sstep(top, bot, below);
        if (kind === OCEAN) T += ((world.climate.key === 'arctic' ? 0.5 : 4) - T) * sstep(150, 800, below);   // under the thermocline the deep sea is ~4 °C everywhere, warm current or not
      } else if (kind === POND) T = T > 4 ? T - below * 0.5 : Math.min(4, T + below * 0.9);
      return Math.max(Tmin, T);
    }
    function waterTempAt(x, y, below = 0.5) { const s = terr.sample(x, y, world.scratch); return waterTemp(s.kind, s.level, Math.max(0, Math.min(below, s.level - s.ground)), x, y); }
    // Dissolved oxygen (mg/L): cold water holds more; rapids and wind stir it in; warm still ponds run short (more so at
    // night, when weeds stop making it); a summer lake's deep layer is cut off from the air; ice seals it in.
    function oxygen(kind, T, below = 0.5, rap = 0, live = true) {
      const sat = 14.6 - 0.394 * T + 0.0072 * T * T;
      let f = [0.97, 0.95, 0.82, 1, 1.02][kind];
      if (!live) return sat * f;
      const hour = world.tod(0.4) * 24, photo = Math.sin((hour - 6) / 12 * 3.1416);
      if (kind === POND) f += (photo > 0 ? 0.22 * photo * (1 - 0.6 * world.env.cloud) : 0.18 * photo) * (0.4 + 0.6 * world.env.growth) - 0.3 * sstep(18, 27, T);
      if (kind === LAKE && T > 12) f *= 1 - 0.45 * sstep(4, 11, below);
      if (kind === LAKE || kind === POND) f += 0.08 * world.env.wind;
      if (kind === POND) f *= 1 - 0.55 * world.env.icePond; if (kind === LAKE) f *= 1 - 0.2 * world.env.iceLake;
      if (kind >= RIVER) f = Math.max(f, 1.02 + 0.12 * rap);
      return sat * f;
    }
    const oxyFit = (D, mg) => D._air || D.habitat.oxygen_min_mgL <= 0 ? 1 : sstep(D.habitat.oxygen_min_mgL * 0.7, D.habitat.oxygen_min_mgL * 1.25, mg);   // air breathers don't care
    // how well a spot suits a species (0..1). env: { kind, level, dep, cur, cover }
    // the deepest a fish goes here: the bottom, or for a mid-water fish over deep sea, its own depth limit
    const fishFloor = (D, wl, g) => D._benthic ? g : Math.max(g, wl - D.habitat.depth_m.max);
    function habitatScore(D, env, below, live = true) {
      const H = D.habitat, w = H.waters[WATER_KEYS[env.kind]] || 0; if (!w) return 0;
      const bz = below ?? Math.min(env.dep, Math.max(0.3, H.depth_m.preferred)), T = waterTemp(env.kind, env.level, bz, env.x, env.y, live);
      const tf = fitRange(T, H.temperature_c.min, H.temperature_c.optimal, H.temperature_c.max);   // laying out populations (live = false), a poor growing season counts for more
      // water deeper than the species goes: bottom fish can't use it, mid-water fish just swim above the deep (see fishFloor)
      let df = fitRange(env.dep, H.depth_m.min, H.depth_m.preferred, H.depth_m.max * 1.5);
      if (env.dep > H.depth_m.preferred && !D._benthic) { const Z = D.behavior.depth_zone, zb = (Z.bottom || 0) / ((Z.surface || 0) + (Z.mid || 0) + (Z.bottom || 0) || 1); df += (1 - df) * (1 - zb) ** 2; }
      return w * df * (live ? tf : Math.pow(tf, 2.5))
        * currentFit(env.cur, H) * ((murk(env.kind) + (live && env.kind >= RIVER ? world.env.turb * 0.4 : 0)) > H.turbidity_max ? 0.35 : 1) * (env.cover ? coverFit(env.cover, H) : 1)
        * (0.15 + 0.85 * oxyFit(D, oxygen(env.kind, T, bz, env.rap || 0, live)));
    }
    function envAt(x, y, withCover = true, live = true) {
      const s = terr.sample(x, y, world.scratch), kind = s.kind, level = s.level, dep = s.level - s.ground, rap = s.rap;
      return { x, y, kind, level, dep, rap, ground: level - dep, cur: dep > 0 && kind >= RIVER ? terr.flowAt(x, y, kind)[2] : 0, cover: withCover && dep > 0 ? terr.coverAt(x, y, 3.5, live) : null };
    }
    // ---- food: what there is to eat, where and when (0..1 per food) ----
    // the zones each food is found in: [surface, mid-water, bottom]
    const FOOD_ZONES = { insects: [1, 0.35, 0], nymphs: [0.1, 0.45, 1], worms: [0, 0.15, 1], crayfish: [0, 0, 1], fish: [0.3, 1, 0.45], frogs: [1, 0.1, 0],
      snails: [0, 0.2, 1], shrimp: [0, 0.6, 1], plankton: [0.4, 1, 0.1], plants: [0.2, 0.8, 0.6], eggs: [0, 0.1, 1], leeches: [0, 0.4, 1] };
    // how much of each food each kind of water has, by kind id (insects' sea entry hangs on the wind, so it stays in foodAvail)
    const FOOD_KIND = { nymphs: [0, 0.35, 0.45, 0.9, 1], crayfish: [0, 0.75, 0.8, 1, 0.8], fish: [0.8, 0.7, 0.6, 0.7, 0.5], frogs: [0, 0.5, 1, 0.3, 0.3],
      shrimp: [1, 0.15, 0.1, 0.35, 0.1], plankton: [0.9, 0.8, 0.9, 0.2, 0.05], leeches: [0, 0.6, 1, 0.3, 0.2] };
    const FOOD_COVER = { rocks: 0.2, weeds: 0.2, reeds: 0.1, lilies: 0.1, wood: 0, open: 0.5 };   // when the spot's cover isn't known
    function foodAvail(food, env, T) {
      const k = env.kind, c = env.cover || FOOD_COVER, hour = world.tod(0.4) * 24, yf = world.env.yf;
      const night = 1 - sstep(5, 7, hour) * (1 - sstep(20, 22, hour)), warm = sstep(5, 15, T), shore = 1 - sstep(1, 3.5, env.dep);
      const veg = Math.min(1, c.weeds + c.reeds + c.lilies + c.wood * 0.6), rocks = Math.min(1, c.rocks + c.wood * 0.5), rap = env.rap || 0;
      const iced = world.env.iced(k, env.dep, env.x, env.y) ? 1 : 0;
      switch (food) {
        case 'insects': return clamp([0, 0.45 + 0.5 * world.env.wind, 0.9, 0.85, 1][k] * warm * (0.15 + 0.85 * world.env.hatch + 0.25 * veg * sstep(0.15, 0.4, yf) * (1 - sstep(0.6, 0.7, yf))) * (1 - iced), 0, 1);
        case 'nymphs': return clamp(FOOD_KIND.nymphs[k] * (0.35 + 0.65 * Math.max(rocks, rap)) * (0.4 + 0.6 * warm) * (1 + 0.5 * world.env.hatch), 0, 1);
        case 'worms': return clamp((k === OCEAN ? 0.1 : 1) * shore * (0.2 + 0.8 * world.env.wet) * (0.5 + 0.5 * warm), 0, 1);
        case 'crayfish': return clamp(FOOD_KIND.crayfish[k] * (0.25 + 0.75 * rocks) * (0.3 + 0.7 * night) * warm, 0, 1);
        case 'fish': return clamp(FOOD_KIND.fish[k] * (0.35 + 0.65 * veg) * (env.dep < 4 ? 1 : 0.6) * (0.5 + 0.5 * warm) * (1 + 0.4 * sstep(0.3, 1, 1 - world.env.light)), 0, 1);
        case 'frogs': return clamp(FOOD_KIND.frogs[k] * Math.min(1, c.lilies + c.reeds) * sstep(14, 20, T) * (0.35 + 0.65 * night), 0, 1);
        case 'snails': return clamp((k === OCEAN ? 0.5 : 1) * (0.2 + 0.8 * Math.max(c.weeds, c.lilies)) * (0.3 + 0.7 * world.env.growth), 0, 1);
        case 'shrimp': return FOOD_KIND.shrimp[k] * (0.4 + 0.6 * night);
        case 'plankton': return clamp(FOOD_KIND.plankton[k] * (0.25 + 0.75 * world.env.growth) * (1 - shore * 0.5), 0, 1);
        case 'plants': return clamp(c.weeds + c.lilies * 0.7, 0, 1) * (0.3 + 0.7 * world.env.growth);
        case 'eggs': return clamp(((k === LAKE || k === POND) ? shore * sstep(0.04, 0.1, yf) * (1 - sstep(0.18, 0.26, yf)) : 0) + (k >= RIVER ? rap * sstep(0.55, 0.6, yf) * (1 - sstep(0.7, 0.76, yf)) : 0), 0, 1);
        case 'leeches': return clamp(FOOD_KIND.leeches[k] * (1 - rocks) * warm * (0.5 + 0.5 * night), 0, 1);
      }
      return 0.2;
    }
    // how much of what this species eats is here, and in which zone: { q: 0..1, zone }
    function foodScore(D, env, T) {
      const F = D.diet.food, Z = D.diet.feeding_zone, zm = Math.max(Z.surface || 0, Z.mid || 0, Z.bottom || 0) || 1, tot = [0, 0, 0]; let P = 0;
      for (const k in F) { const p = F[k]; if (!p) continue; P += p; const a = foodAvail(k, env, T); if (!a) continue; const fz = FOOD_ZONES[k] || [0.3, 1, 0.5]; for (let z = 0; z < 3; z++) tot[z] += p * a * fz[z]; }
      const w = D._benthic ? [0, 0, 1] : [(Z.surface || 0) / zm, (Z.mid || 0) / zm, (Z.bottom || 0) / zm];
      let best = 2, q = -1; for (let z = 0; z < 3; z++) { const v = tot[z] * w[z]; if (v > q) { q = v; best = z; } }
      return { q: P ? clamp(q / P * 1.6, 0, 1) : 0, zone: ['surface', 'mid', 'bottom'][best] };
    }
    // what a simulated animal counts as on a predator's menu
    const preyFood = D => D.body.plan === 'frog' || D.body.plan === 'salamander' ? 'frogs' : D._herp ? null : D._air ? 'mammals' : ({ fish: 'fish', squid: 'fish', cuttlefish: 'fish', octopus: 'crayfish', crab: 'crayfish', lobster: 'crayfish', shrimp: 'shrimp', snail: 'snails' })[D.body.plan || 'fish'] || null;   // a bass eats frogs and newts; snakes, lizards, turtles and alligators aren't on anyone's menu here
    const activityAt = (D, hour) => { const a = D._act, h = ((hour % 24) + 24) % 24, i = Math.floor(h), u = h - i; return a[i] + (a[(i + 1) % 24] - a[i]) * u; };
    Object.assign(world, { rawSurfaceT, h21js, vnjs, floe, seaWarm, springPull, waterTemp, waterTempAt, oxygen, oxyFit,
      fishFloor, habitatScore, envAt, FOOD_ZONES, FOOD_KIND, FOOD_COVER, foodAvail, foodScore, preyFood, activityAt });
    return world;
  }

  return { SEASONS, WEATHER, WEATHER_NEXT, installEnvironment };
});
