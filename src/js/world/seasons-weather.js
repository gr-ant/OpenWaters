'use strict';
// Seasons and weather: SEASONS, WEATHER kinds and transitions, the live ENV conditions object, and the start-of-year setup from CONFIG / #season- / #weather- in the address.
// A short year (CONFIG.daysPerSeason game days per season). yf: 0..1 through the year, 0 = first day of spring.
// ENV holds the live conditions: air temperature, cloud, rain or snow, wind, fog, pressure and its trend, how wet
// the land is, snow cover, leaf state, plant growth and ice. Water temperature and oxygen follow from them.
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
function todNow() { try { return Engine.tod ?? CONFIG.startHour / 24; } catch (e) { return CONFIG.startHour / 24; } }   // time of day 0..1, safe before the engine exists
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
const ENV = {
  yf: 0, day: 0, hours: 0, block: -1, blockStart: 0, blockEnd: 0, kind: 'fair', next: 'fair', blockLen: 5,
  cloud: 0.3, rain: 0, wind: 0.3, fog: 0, storm: 0, pressure: 1015, pTarget: 1015, trend: 0, pHist: [],
  airT: 15, airMean: 15, wet: 0, snowCover: 0, flash: 0, flashT: 4, snowing: 0, hatch: 0,
  leaf: 1, autumn: 0, young: 0, dormant: 0, growth: 1, iceLake: 0, icePond: 0, iceSea: 0, turb: 0, light: 1,
  get season() { return SEASONS[Math.floor(this.yf * 4) % 4]; },
  get yearDays() { return CONFIG.daysPerSeason * 4; },
  label() {
    const s = this.yf * 4 % 1, part = s < 0.34 ? 'Early' : s < 0.67 ? 'Mid' : 'Late', S = this.season;
    const sky = this.snowing > 0.3 ? (this.rain > 0.6 ? 'Heavy snow' : 'Snow') : this.storm > 0.5 ? 'Thunderstorm' : this.rain > 0.55 ? 'Rain' : this.rain > 0.15 ? 'Drizzle'
      : this.fog > 0.6 ? 'Fog' : this.cloud > 0.75 ? 'Overcast' : this.cloud > 0.3 ? 'Partly cloudy' : 'Clear';
    return `${part} ${S[0].toUpperCase() + S.slice(1)} · day ${Math.floor(this.day % this.yearDays) + 1} · ${this.airT.toFixed(0)}°C · ${sky} · wind ${(this.wind * 12).toFixed(0)} m/s`;
  },
  // seasonal mean air temperature (°C): coldest in mid winter, warmest in mid summer
  airMeanAt(yf) { return CLIMATE.air[0] + CLIMATE.air[1] * Math.cos(6.2832 * (yf - 0.375)); },
  // start (or jump) to a point in the year; weather restarts from something typical for it
  setDate(yf, hour) {
    this.yf = ((yf % 1) + 1) % 1; const h = hour ?? todNow() * 24;
    this.hours = Math.floor(this.yf * this.yearDays) * 24 + h; this.day = this.hours / 24; this.yf = (this.day / this.yearDays) % 1;
    if (hour !== undefined) try { Engine.tod = hour / 24; } catch (e) { /* not started yet */ }
    this.block = -1; this.settle = true; this.wet = 0.2;
    this.snowCover = CLIMATE.key === 'tropical' ? 0 : CLIMATE.key === 'arctic' ? (this.airMeanAt(this.yf - 0.03) < 1 ? 1 : 0.15) : this.yf > 0.78 || this.yf < 0.04 ? 0.8 : 0;
  },
  setWeather(kind) { if (!WEATHER[kind]) return; this.kind = this.next = kind; this.settle = true; this.forced = this.hours + 6; },
  pickNext(rng) {
    const W = Object.assign({}, WEATHER_NEXT[this.kind]), S = this.season;
    if (S === 'summer') { W.clear = (W.clear || 0) * 1.4; W.storm = (W.storm || 0) * 1.8; W.fog = (W.fog || 0) * 0.5; }
    if (S === 'autumn') { W.fog = (W.fog || 0) * 1.8 + 0.5; W.rain = (W.rain || 0) * 1.3; }
    if (S === 'winter') { W.overcast = (W.overcast || 0) * 1.5; W.storm = (W.storm || 0) * 0.3; }
    if (S === 'spring') { W.drizzle = (W.drizzle || 0) * 1.5; W.rain = (W.rain || 0) * 1.3; }
    if (CLIMATE.key === 'tropical') { W.fog = 0; W.storm = (W.storm || 0) * (S === 'summer' || S === 'autumn' ? 3 : 1); W.rain = (W.rain || 0) * (S === 'summer' ? 2 : 0.6); W.clear = (W.clear || 0) * (S === 'winter' ? 2 : 1); }   // a wet and a dry season
    if (CLIMATE.key === 'arctic') { W.overcast = (W.overcast || 0) * 1.6; W.fog = (W.fog || 0) * (S === 'summer' ? 2.5 : 0.5); W.storm = (W.storm || 0) * 0.3; }
    let tot = 0; for (const k in W) tot += W[k]; let r = rng() * tot;
    for (const k in W) if ((r -= W[k]) <= 0) return k; return 'fair';
  },
  update(dtH, dt) {
    this.hours += dtH; this.day = this.hours / 24; this.yf = (this.day / this.yearDays) % 1;
    const tod = todNow(), hour = tod * 24, yf = this.yf;
    // weather: a new kind every few hours, chosen from what usually follows; the front's pressure arrives first
    if (this.block < 0 || this.hours >= this.blockEnd) {
      const blk = this.block < 0 ? Math.floor(this.hours / 5) : this.block + 1, rng = mulberry32((SEED ^ Math.imul(blk + 7919, 2654435761)) >>> 0);
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
    if (this.storm > 0.5 && (this.flashT -= dt) <= 0) { this.flash = 1; this.flashT = 3 + Math.random() * 12; }
    // leaves: bud-burst in early spring, autumn colour, then the fall; grass browns over winter
    this.leaf = CLIMATE.evergreen ? 1 : sstep(0.05, 0.14, yf) * (1 - sstep(0.64, 0.73, yf));
    this.young = CLIMATE.evergreen ? 0 : sstep(0.03, 0.07, yf) * (1 - sstep(0.16, 0.26, yf));
    this.autumn = CLIMATE.evergreen ? 0 : sstep(0.53, 0.64, yf) * (yf < 0.9 ? 1 : 0);
    this.dormant = CLIMATE.evergreen ? 0 : Math.max(sstep(0.6, 0.76, yf), 1 - sstep(0.02, 0.13, yf)) * (yf > 0.4 || yf < 0.15 ? 1 : 0);
    this.growth = CLIMATE.evergreen ? 1 : sstep(0.08, 0.3, yf) * (1 - sstep(0.62, 0.8, yf));   // water plants: lilies and weed beds
    // ice on still water when its surface is at freezing
    // (they freeze after a spell of frost: lakes a few weeks behind the air, ponds sooner)
    this.iceLake = sstep(-0.6, -2.4, this.airMeanAt(yf - 0.035) - CONFIG.waterTempOffset); this.icePond = sstep(0.6, -1.4, this.airMeanAt(yf - 0.015) - CONFIG.waterTempOffset);
    this.iceSea = CLIMATE.seaIce ? sstep(-3, -14, this.airMeanAt(yf - 0.06) - CONFIG.waterTempOffset) : 0;   // arctic pack ice: floes in spring and autumn, solid in winter
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
{ // start of the year: CONFIG.startSeason, or #season-autumn (and #weather-rain) in the address
  const hs = (HASH.match(/season-(spring|summer|autumn|fall|winter)/) || [])[1], hw = (HASH.match(/weather-(\w+)/) || [])[1];
  const S = (hs === 'fall' ? 'autumn' : hs) || CONFIG.startSeason;
  ENV.setDate((Math.max(0, SEASONS.indexOf(S)) + (hs ? 0.45 : CONFIG.startSeasonPart)) / 4);
  if (hw) ENV.setWeather(hw);
}
