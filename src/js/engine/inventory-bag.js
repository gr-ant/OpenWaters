'use strict';
// Engine: the inventory bag: drawing it, opening it and clicks on it.
Object.assign(Engine, {
  // inventory in the HUD's style: rune-ring slots like the spell bar, lavender glow lines, diamond ornaments; no words
  drawInventory(c, Wd, Ht) {
    const T = this.time, cap = this.invCap(), cols = 5, rows = Math.ceil(cap / cols), LINE = 'rgba(205,190,255,';
    this.invT = Math.min(1, (this.invT || 0) + 0.12); const ap = 1 - (1 - this.invT) ** 3; // quick fade/scale in
    const S0 = 64, G0 = 12, pad0 = 26, top0 = 48, w0 = cols * S0 + (cols - 1) * G0 + pad0 * 2, h0 = rows * S0 + (rows - 1) * G0 + pad0 + top0;
    const k = Math.min(1, (Wd - 20) / w0, (Ht - 150) / h0) * (0.94 + 0.06 * ap), S = S0 * k, G = G0 * k, pad = pad0 * k, top = top0 * k, w = w0 * k, h = h0 * k;
    const x = (Wd - w) / 2, y = Math.max(30, (Ht - h) / 2 - 24 * k);
    const diamond = (dx, dy, r, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(dx, dy - r); c.lineTo(dx + r * 0.7, dy); c.lineTo(dx, dy + r); c.lineTo(dx - r * 0.7, dy); c.closePath(); c.fill(); };
    const box = inset => { c.beginPath(); if (c.roundRect) c.roundRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset, 14 * k); else c.rect(x + inset, y + inset, w - 2 * inset, h - 2 * inset); };
    c.save(); c.globalAlpha = ap; c.lineCap = 'round';
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, Wd, Ht);                                     // dim the world behind
    c.fillStyle = 'rgba(14,10,26,.72)'; box(0); c.fill();
    c.shadowColor = 'rgba(180,160,255,.8)'; c.shadowBlur = 12; c.strokeStyle = LINE + '.55)'; c.lineWidth = 1.4; box(0); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = LINE + '.2)'; c.lineWidth = 0.8; box(5 * k); c.stroke();
    c.shadowColor = 'rgba(200,180,255,.9)'; c.shadowBlur = 8;
    for (const [dx, dy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) diamond(dx, dy, 6 * k, LINE + '.9)'); // corner gems
    // header: a small turning rune circle holding one pip per level, glowing threads either side
    const hx = Wd / 2, hy = y + top * 0.5, R = 12 * k, reach = w / 2 - pad - 26 * k;
    c.strokeStyle = LINE + '.5)'; c.lineWidth = 1;
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(hx + sd * (R + 8 * k), hy); c.lineTo(hx + sd * reach, hy); c.stroke(); diamond(hx + sd * (reach + 4 * k), hy, 3 * k, LINE + '.8)'); }
    c.beginPath(); c.arc(hx, hy, R, 0, 6.3); c.stroke(); c.strokeStyle = LINE + '.3)'; c.beginPath(); c.arc(hx, hy, R - 3 * k, 0, 6.3); c.stroke();
    c.strokeStyle = LINE + '.6)';
    for (let q = 0; q < 12; q++) { const a = q / 12 * 6.283 + T * 0.3; c.beginPath(); c.moveTo(hx + Math.cos(a) * (R - 2.5 * k), hy + Math.sin(a) * (R - 2.5 * k)); c.lineTo(hx + Math.cos(a) * (R + 1.5 * k), hy + Math.sin(a) * (R + 1.5 * k)); c.stroke(); }
    const lv = Game.level; for (let q = 0; q < lv; q++) diamond(hx + (q - (lv - 1) / 2) * 4.5 * k, hy, 2.3 * k, '#fff');
    // slot usage: one short segment per slot under the header
    const used = this.inv.length, sw = (w - 2 * pad) / cap;
    for (let q = 0; q < cap; q++) { c.fillStyle = q < used ? LINE + '.85)' : LINE + '.16)'; c.fillRect(x + pad + sw * q + sw * 0.15, y + top - 10 * k, sw * 0.7, 2 * k); }
    // close rune (top-right): circle with a cross
    const cx = x + w - 20 * k, cy = y + 20 * k, cr = 10 * k;
    c.strokeStyle = LINE + '.75)'; c.lineWidth = 1.3; c.beginPath(); c.arc(cx, cy, cr, 0, 6.3); c.stroke();
    c.beginPath(); c.moveTo(cx - cr * 0.42, cy - cr * 0.42); c.lineTo(cx + cr * 0.42, cy + cr * 0.42); c.moveTo(cx + cr * 0.42, cy - cr * 0.42); c.lineTo(cx - cr * 0.42, cy + cr * 0.42); c.stroke();
    c.shadowBlur = 0;
    // slots: medallions like the spell bar; filled ones glow in the item's colour, full stacks pulse and turn faster
    for (let i = 0; i < cap; i++) {
      const col = i % cols, row = (i / cols) | 0, mx = x + pad + col * (S + G) + S / 2, my = y + top + row * (S + G) + S / 2 - 2 * k, r = S / 2 - 6 * k;
      const sl = this.inv[i], it = sl && ITEMS[sl.id];
      if (!it) {
        c.strokeStyle = LINE + '.22)'; c.lineWidth = 1; c.setLineDash([2 * k, 4 * k]); c.beginPath(); c.arc(mx, my, r, 0, 6.3); c.stroke(); c.setLineDash([]);
        diamond(mx, my, 2.2 * k, LINE + '.2)'); continue;
      }
      const full = sl.n >= CONFIG.stackSize, glow = full ? 0.8 + 0.2 * Math.sin(T * 3 + i) : 0.55;
      c.shadowColor = it.css; c.shadowBlur = 12 * glow; c.strokeStyle = it.css; c.lineWidth = 1.7; c.beginPath(); c.arc(mx, my, r, 0, 6.3); c.stroke();
      c.shadowBlur = 0; c.strokeStyle = LINE + '.35)'; c.lineWidth = 0.7; c.beginPath(); c.arc(mx, my, r - 4 * k, 0, 6.3); c.stroke();
      c.strokeStyle = it.css; c.lineWidth = 1; c.globalAlpha = ap * 0.85;
      for (let q = 0; q < 16; q++) { const a = q / 16 * 6.283 + T * (full ? 0.5 : 0.15), r0 = r - 4 * k, r1 = q % 4 ? r - 2 * k : r + 1.5 * k; c.beginPath(); c.moveTo(mx + Math.cos(a) * r0, my + Math.sin(a) * r0); c.lineTo(mx + Math.cos(a) * r1, my + Math.sin(a) * r1); c.stroke(); }
      c.globalAlpha = ap;
      const ic = this.itemIcon(sl.id), isz = r * 2.35;
      if (ic) { c.shadowColor = it.css; c.shadowBlur = 10; c.drawImage(ic, mx - isz / 2, my - isz / 2, isz, isz); c.shadowBlur = 0; } else this.gemIcon(c, mx, my, 12 * k, it.css);
      c.shadowColor = it.css; c.shadowBlur = 4;
      for (let q = 0; q < sl.n; q++) diamond(mx + (q - (CONFIG.stackSize - 1) / 2) * 4 * k, my + r + 6.5 * k, 1.6 * k, it.css); // one tiny gem per item held
      c.shadowBlur = 0;
    }
    c.restore();
    this.invLayout = { x, y, w, h, cx, cy, cr };
  },
  toggleInventory(open = !this.invOpen) {
    this.invOpen = open; this.invT = 0;
    if (open && document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  },
  // true if the bag is open (the click is consumed); closes on the close rune or anywhere outside the panel
  invClick(x, y) {
    const L = this.invLayout; if (!this.invOpen || !L) return false;
    if (Math.hypot(x - L.cx, y - L.cy) < L.cr + 8 || x < L.x || x > L.x + L.w || y < L.y || y > L.y + L.h) this.toggleInventory(false);
    return true;
  },
});
