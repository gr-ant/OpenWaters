#!/usr/bin/env python3
"""Manual two-client smoke test for the Open Waters multiplayer server.

Connects two WebSocket clients (stdlib only -- same from-scratch handshake/framing approach
as server.py, so this needs no `pip install` either), has one create a room and the other
join it, moves both around, casts a line, and prints everything each client received. Not
an automated test (bites/claims are probabilistic and timing-dependent) -- read the output.

Usage:
    python3 server.py 8765 &
    python3 test_client.py localhost 8765
"""
import asyncio
import base64
import json
import secrets
import struct
import sys

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class WsClient:
    def __init__(self, label: str):
        self.label = label
        self.reader = None
        self.writer = None

    async def connect(self, host: str, port: int, path: str = "/"):
        self.reader, self.writer = await asyncio.open_connection(host, port)
        key = base64.b64encode(secrets.token_bytes(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.writer.write(req.encode())
        await self.writer.drain()
        status = await self.reader.readline()
        if b"101" not in status:
            raise RuntimeError(f"[{self.label}] handshake failed: {status!r}")
        while True:
            line = await self.reader.readline()
            if line in (b"\r\n", b"\n", b""):
                break

    async def send(self, obj: dict):
        payload = json.dumps(obj).encode("utf-8")
        mask = secrets.token_bytes(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        frame = bytearray([0x81])  # FIN + text
        n = len(masked)
        if n < 126:
            frame.append(0x80 | n)
        elif n < 65536:
            frame.append(0x80 | 126)
            frame += struct.pack(">H", n)
        else:
            frame.append(0x80 | 127)
            frame += struct.pack(">Q", n)
        frame += mask
        frame += masked
        self.writer.write(bytes(frame))
        await self.writer.drain()

    async def recv(self):
        b1, b2 = await self.reader.readexactly(2)
        opcode = b1 & 0x0F
        length = b2 & 0x7F
        if length == 126:
            (length,) = struct.unpack(">H", await self.reader.readexactly(2))
        elif length == 127:
            (length,) = struct.unpack(">Q", await self.reader.readexactly(8))
        payload = await self.reader.readexactly(length) if length else b""
        if opcode == 0x8:
            return None
        if opcode == 0x9:  # ping -> pong
            self.writer.write(bytes([0x8A, len(payload)]) + payload)
            await self.writer.drain()
            return await self.recv()
        return json.loads(payload.decode("utf-8")) if payload else {}

    async def listen_for(self, seconds: float):
        # Absolute deadline, NOT a per-message timeout: wait_for() restarts its
        # timer on every received message, and the server broadcasts state every
        # 0.5 s, so a per-message timeout would never fire and this would listen
        # forever. (Fixed by Nikki, Nov 13, 2026 -- the first version of this
        # script never returned from listen_for(8.0) for exactly that reason.)
        loop = asyncio.get_event_loop()
        end = loop.time() + seconds
        while True:
            remaining = end - loop.time()
            if remaining <= 0:
                return
            try:
                msg = await asyncio.wait_for(self.recv(), timeout=remaining)
            except asyncio.TimeoutError:
                return
            if msg is None:
                print(f"[{self.label}] connection closed by server")
                return
            print(f"[{self.label}] <- {msg}")

    async def close(self):
        self.writer.close()


async def main():
    host = sys.argv[1] if len(sys.argv) > 1 else "localhost"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765

    a = WsClient("A")
    b = WsClient("B")
    await a.connect(host, port)
    await b.connect(host, port)
    print(f"Connected two clients to ws://{host}:{port}")

    await a.send({"t": "create", "seed": 20261113, "climate": "temperate", "wildlife": 3, "name": "Alice"})
    joined = await a.recv()
    print(f"[A] <- {joined}")
    code = joined["code"]
    snap = await a.recv()
    print(f"[A] <- snapshot: {len(snap.get('fish', []))} fish nearby")

    await b.send({"t": "join", "code": code, "name": "Bob"})
    joined_b = await b.recv()
    print(f"[B] <- {joined_b}")
    snap_b = await b.recv()
    print(f"[B] <- snapshot: {len(snap_b.get('fish', []))} fish nearby")

    await a.listen_for(0.5)  # A should see player_joined for B

    # Move INTO the spawn lake, not just near the origin: the server only sends
    # fish within 12 m of a player/lure, and for this seed the spawn lake is
    # centred ~72 m from the origin, so standing at (2, -2) sees no fish at
    # all. The test knows the seed, so it can compute the lake from the same
    # terrain code the server uses. (Fixed by Nikki, Nov 13, 2026.)
    import fish_populations as fp
    lake = fp.SimpleTerrain(20261113).lakes[0]
    lx, ly = lake["x"], lake["y"]
    print(f"\n-- moving both players into the spawn lake at ({lx:.1f}, {ly:.1f}) and casting --")
    await a.send({"t": "player_state", "x": lx, "y": ly, "a": 0.0})
    await b.send({"t": "player_state", "x": lx + 3.0, "y": ly - 3.0, "a": 0.0})
    await a.send({"t": "cast", "x": lx + 4.0, "y": ly - 4.0, "rig": "bass_crankbait"})
    await b.send({"t": "chat", "text": "anything biting?"})

    print("\n-- listening for ~8 seconds (state broadcasts, bites, spooks, chat) --")
    await asyncio.gather(a.listen_for(8.0), b.listen_for(8.0))

    print("\n-- requesting a resync snapshot on A --")
    await a.send({"t": "resync"})
    print(f"[A] <- {await a.recv()}")

    await a.send({"t": "leave"})
    await b.send({"t": "leave"})
    await a.close()
    await b.close()
    print("\nDone. If you saw a `joined`, two `snapshot`s, `state` broadcasts and the chat "
          "line echoed to both clients, the server is working.")


if __name__ == "__main__":
    asyncio.run(main())
