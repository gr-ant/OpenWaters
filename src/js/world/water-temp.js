'use strict';
// Water temperature, springs, warm sea current, pack-ice floe noise and dissolved oxygen.
// surface water temperature through the year (no weather, no day/night); `raw` can go below freezing (= ice)
function rawSurfaceT(kind, yf) {
  const k = [[11, 6, 0.45], [12, 11, 0.41], [13, 12, 0.39], [10, 8, 0.4], [9, 4, 0.4]][kind];   // [mean, swing, warmest point of the year]
  return k[0] + CLIMATE.water[kind] + k[1] * CLIMATE.amp * Math.cos(6.2832 * (yf - k[2])) + CONFIG.waterTempOffset;
}
// pack ice floes: the same value noise as the water shader's (so what you see is what you can stand on), 0..1
function h21js(x, y) { x = ((x % 512) + 512) % 512 * 0.1031; y = ((y % 512) + 512) % 512 * 0.1030; x -= Math.floor(x); y -= Math.floor(y); const d = x * (y + 33.33) + y * (x + 33.33); x += d; y += d; const v = (x + y) * x; return v - Math.floor(v); }
function vnjs(x, y) { const i = Math.floor(x), j = Math.floor(y); let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = h21js(i, j), b = h21js(i + 1, j), c = h21js(i, j + 1), d = h21js(i + 1, j + 1); return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy; }
const floe = (x, y) => 0.65 * vnjs(x * 0.025, y * 0.025) + 0.35 * vnjs(x * 0.09 + 3, y * 0.09 + 7);
// A warm current washes the island's south-east shore (coral reefs, clear blue water, tropical fish offshore);
// the north-west coast gets cold water. 0 = cold side .. 1 = warm side.
function seaWarm(x, y) { if (CLIMATE.reefsEverywhere) return 1; if (!CLIMATE.seaCurrent) return 0; if (x === undefined) return 0.3; const R = CONFIG.islandSize / 2; return sstep(-0.35, 0.45, (x * 0.35 + y * 0.94) / R + 0.12 * nE(x / 2600 + 9, y / 2600 - 4)); }
// groundwater wells up at springs at a steady ~9 °C: creek water near one stays cool in summer and open in winter
function springPull(x, y) {
  if (!ISL || x === undefined) return 0; let best = 1e9;
  for (const sp of ISL.springs) { const d = Math.abs(sp.x - x) + Math.abs(sp.y - y); if (d < best) best = d; }
  return 1 - sstep(12, 140, best);
}
// Water temperature (°C) `below` metres under the surface. live = false gives the reference midsummer noon the
// populations are laid out for (so fish don't vanish in winter: they move and slow down instead).
function waterTemp(kind, level, below, x, y, live = true) {
  const yf = live ? ENV.yf : 0.33, surfRaw = rawSurfaceT(kind, yf), Tmin = kind === OCEAN ? -1.8 : 0.2;   // salt water stays liquid to -1.8 °C
  let T = Math.max(Tmin, surfRaw) - Math.max(0, level - WLW) * 0.05;
  if (live) {
    T += [0.02, 0.06, 0.25, 0.12, 0.05][kind] * (ENV.airT - ENV.airMean);
    T += [0.3, 1, 1.6, 0.6, 0.5][kind] * (1 - 0.6 * ENV.cloud) * Math.sin(((Engine.tod ?? CONFIG.startHour / 24) * 24 - 9) / 24 * 6.2832);
  } else T += [0.3, 1, 1.6, 0.6, 0.5][kind] * 0.5;
  if (kind === CREEK || kind === RIVER) { const s = springPull(x, y) * (kind === CREEK ? 1 : 0.4); T += (9 - T) * s; }
  if (kind === OCEAN && CLIMATE.seaCurrent) { const w = seaWarm(x, y); T += 5.5 * w - 2.5; }   // a mild current to the south-east (~20 °C in summer), cold water to the north-west
  if (kind === LAKE || kind === OCEAN) {   // layers: warm (or, under ice, cold) water on top, ~4-7 °C below
    const w = kind === OCEAN ? seaWarm(x, y) : 0;   // the warm current's mixed layer is deep and stays warm far down
    const deep = kind === OCEAN ? (CLIMATE.key === 'arctic' ? Math.max(-1.5, Math.min(T, 1.5)) : Math.min(T, 6 + (CLIMATE.reefsEverywhere ? 14 : 6) * w)) : T > 4 ? Math.min(T, 4 + 2.5 * sstep(0, 0.3, yf)) : 4;
    const top = kind === OCEAN ? 8 + (CLIMATE.reefsEverywhere ? 30 : 8) * w : T > 12 ? 3 : 1.5, bot = kind === OCEAN ? 30 + 80 * w : T > 12 ? 9 : 5;
    T += (deep - T) * sstep(top, bot, below);
    if (kind === OCEAN) T += ((CLIMATE.key === 'arctic' ? 0.5 : 4) - T) * sstep(150, 800, below);   // under the thermocline the deep sea is ~4 °C everywhere, warm current or not
  } else if (kind === POND) T = T > 4 ? T - below * 0.5 : Math.min(4, T + below * 0.9);
  return Math.max(Tmin, T);
}
function waterTempAt(x, y, below = 0.5) { sample(x, y); return waterTemp(SK, SW, Math.max(0, Math.min(below, SW - hW(SE))), x, y); }
// Dissolved oxygen (mg/L): cold water holds more; rapids and wind stir it in; warm still ponds run short (more so at
// night, when weeds stop making it); a summer lake's deep layer is cut off from the air; ice seals it in.
function oxygen(kind, T, below = 0.5, rap = 0, live = true) {
  const sat = 14.6 - 0.394 * T + 0.0072 * T * T;
  let f = [0.97, 0.95, 0.82, 1, 1.02][kind];
  if (!live) return sat * f;
  const hour = (Engine.tod ?? 0.4) * 24, photo = Math.sin((hour - 6) / 12 * 3.1416);
  if (kind === POND) f += (photo > 0 ? 0.22 * photo * (1 - 0.6 * ENV.cloud) : 0.18 * photo) * (0.4 + 0.6 * ENV.growth) - 0.3 * sstep(18, 27, T);
  if (kind === LAKE && T > 12) f *= 1 - 0.45 * sstep(4, 11, below);
  if (kind === LAKE || kind === POND) f += 0.08 * ENV.wind;
  if (kind === POND) f *= 1 - 0.55 * ENV.icePond; if (kind === LAKE) f *= 1 - 0.2 * ENV.iceLake;
  if (kind >= RIVER) f = Math.max(f, 1.02 + 0.12 * rap);
  return sat * f;
}
const oxyFit = (D, mg) => D._air || D.habitat.oxygen_min_mgL <= 0 ? 1 : sstep(D.habitat.oxygen_min_mgL * 0.7, D.habitat.oxygen_min_mgL * 1.25, mg);   // air breathers don't care
