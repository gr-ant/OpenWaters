'use strict';
// Depth (m) of the open sea `off` metres from the coast. The coast's distance is one influence: it sets the broad profile by
// climate (temperate: a shelf to ~130 m, then the continental slope past 1,500 m; arctic: a broad shallow shelf; tropical: a
// reef flat, a wall, a fore-reef terrace, then the deep). On top of that the floor has its own shape that doesn't follow the
// coastline: the shelf edge wanders in and out and is sometimes a cliff, sometimes a long ramp; broad swells and hollows;
// offshore sandbars; rocky banks and ridges running with the island's grain; channels cut across the shelf; the odd sharp
// drop-off step; canyons down the slope. These are what make one stretch of sea a different place to fish from the next.
function seaDepth(x, y, off) {
  const L = LAYOUT, gx = L.vx, gy = L.vy, u = x * gx + y * gy, v = -x * gy + y * gx;   // along / across the island's grain
  const n1 = fbm(nE, x / 1400 + 31, y / 1400 - 17, 4);                                  // broad relief: shelf width, general depth
  const n2 = fbm(nM, x / 600 - 23, y / 600 + 11, 3);                                    // medium relief, independent of the coast
  const ridge = 1 - Math.abs(nR(u / 1600 - 13, v / 380 + 29));                         // long banks and ridges along the grain
  const chan = Math.pow(Math.max(0, 1 - Math.abs(nM(u / 2200 + 41, v / 520 - 7)) * 5), 2);   // narrow channels across the shelf
  const canyon = Math.pow(Math.max(0, 1 - Math.abs(nM(x / 900 + 41, y / 900 - 7)) * 4), 2);  // submarine canyons on the slope
  const widthK = 0.55 + 0.9 * (0.5 + 0.5 * n1);                                         // the shelf edge: pinched here, far out there
  const steep = sstep(0.15, 0.45, nE(x / 2600 - 57, y / 2600 + 19));                    // the slope beyond it: 0 a long ramp, 1 a drop-off
  let d;
  if (CLIMATE.reefsEverywhere) {
    const flat = (260 + 200 * n1) * widthK, wallW = 30 + 120 * (1 - steep), terrace = 500 + 900 * (1 - steep);
    d = off < flat ? 1.2 + 2.5 * sstep(0, flat, off) + 1.5 * ridge * sstep(0.4 * flat, flat, off) + 2 * Math.max(0, n2) * sstep(0.3 * flat, flat, off)   // the reef flat: patch reefs and sand channels
      : 4 + 26 * sstep(flat, flat + wallW, off) + 50 * sstep(flat + wallW, flat + terrace, off) + 1300 * sstep(flat + terrace, flat + terrace + 2300, off);   // wall, fore-reef terrace, then the deep
  } else if (CLIMATE.key === 'arctic') {
    const brk = (4000 + 1500 * n1) * widthK, slopeW = 800 + 2700 * (1 - steep);
    d = 2 + 56 * Math.pow(Math.min(off, brk) / brk, 0.9) + 650 * sstep(brk, brk + slopeW, off);
  } else {
    const brk = (2500 + 900 * n1) * widthK, slopeW = 250 + 2250 * (1 - steep);
    d = 3 + 125 * Math.pow(Math.min(off, brk) / brk, 1.15) + 1500 * sstep(brk, brk + slopeW, off);
  }
  d *= 1 + 0.35 * n2 + 0.15 * n1;   // swells and hollows in the floor that owe nothing to the coast (about a third either way)
  if (!CLIMATE.reefsEverywhere) {   // offshore sandbars: a shoal a few hundred metres out, roughly parallel to the shore, on some coasts
    const barAt = 180 + 320 * (0.5 + 0.5 * nE(x / 900 + 71, y / 900 - 43)), barW = 45 + 40 * (0.5 + 0.5 * n2), bars = sstep(0.05, 0.45, nE(x / 1500 - 83, y / 1500 + 67));
    d -= 0.7 * d * bars * Math.exp(-(((off - barAt) / barW) ** 2));   // the bar rises to about a third of the depth around it
  }
  const shelf = 1 - sstep(80, 250, d);   // 1 on the shelf, fading out down the slope
  d -= 8 * ridge * ridge * shelf * sstep(6, 25, d);                                      // rocky banks: the structure fish hold on
  d += (10 + 25 * sstep(20, 80, d)) * chan * shelf * sstep(8, 30, d);                     // channels: deeper water cutting across the shelf
  d += 20 * sstep(0.42, 0.48, nE(x / 1100 + 17, y / 1100 - 61)) * shelf * sstep(10, 40, d);   // a sharp drop-off step along a line here and there
  d += 400 * canyon * sstep(100, 400, d);                                                 // canyons cut into the slope
  return Math.max(1, d);
}
