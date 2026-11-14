'use strict';
// A minimal WebSocket server (RFC 6455) on Node's http 'upgrade' event, so the server needs no npm packages. Text frames
// only (the protocol is JSON text), fragmented messages are reassembled, ping is answered with pong, close is echoed.
// Not supported (not needed here): extensions such as permessage-deflate, binary messages, subprotocols.
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 64 * 1024;   // a client message is a few hundred bytes; anything this big is a mistake or abuse

function frame(opcode, payload) {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | opcode, n])
    : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255])
    : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
  return Buffer.concat([head, payload]);
}

class Socket extends EventEmitter {
  constructor(sock, req) {
    super();
    this.sock = sock; this.ip = req.socket.remoteAddress; this.open = true;
    this.buf = Buffer.alloc(0); this.parts = []; this.partsLen = 0;
    sock.setNoDelay(true);
    sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    sock.on('close', () => this.closed());
    sock.on('error', () => this.closed());
  }
  send(text) { if (this.open) this.sock.write(frame(1, Buffer.from(text))); }
  close(code = 1000, reason = '') {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code);
    this.sock.write(frame(8, Buffer.concat([p, Buffer.from(reason).subarray(0, 120)])));
    this.sock.end(); this.closed();
  }
  closed() { if (this.open) { this.open = false; this.emit('close'); } }
  parse() {
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (!masked) return this.close(1002, 'client frames must be masked');
      if (len > MAX_MESSAGE) return this.close(1009, 'message too big');
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 8) return this.close();
      if (op === 9) { this.sock.write(frame(10, data)); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 0) {
        this.parts.push(data); this.partsLen += data.length;
        if (this.partsLen > MAX_MESSAGE) return this.close(1009, 'message too big');
        if (fin) { const text = Buffer.concat(this.parts).toString('utf8'); this.parts = []; this.partsLen = 0; this.emit('message', text); }
        continue;
      }
      return this.close(1003, 'text frames only');
    }
  }
}

// attach to an http.Server; onConnection(socket) for every accepted WebSocket
function attach(server, onConnection) {
  server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    onConnection(new Socket(sock, req));
  });
}

module.exports = { attach };
