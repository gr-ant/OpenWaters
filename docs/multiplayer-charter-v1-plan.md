# Open Waters multiplayer: charter v1 plan

Written up from Grant's voice call on Fri Nov 13, 2026, so he can decide without rehashing it. No decision to build this was made in that call.

## The idea in his words

A few friends fish the same area together, like a charter. Everyone types in a shared room code and lands in the same ocean. No passwords, just share the code with the crew.

## What stays the same

- Keep the single HTML file exactly as it is. No rebuild.
- Solo play stays free and open, in the browser on itch.io as now.
- The Electron build is untouched for now; v1 is browser first.

## Charter v1: boats and catches only

- One tiny server that just passes messages between players. It does not run the fishing.
- Everyone uses the same map seed, so everyone is on the same reef.
- The server syncs: boat position, when someone casts, what they catch, and a little chat.
- Update rate: about twice a second (every half second) is smooth enough for a chill fishing game. Every quarter second looks smoother but sends about four times the messages. For a few friends it is still cheap, so this is a feel choice, not a blocker.
- Joining: someone creates a charter and gets a big room code. Everyone types that code in, the server checks it, and they are in the same ocean.
- Auth: the room code is the auth for v1. Cloudflare Access (free for friends, sign in with Google or email) is an optional extra door in front of the site, not required. Solo play needs no login.

## Hosting

- Game itself: free static host, Cloudflare Pages, on a own domain like openwatersgame.com if he wants it. itch.io stays as a backup.
- Sync server: Fly.io, Railway, or Render, around $5 to $7 a month for a tiny always-on Node server.

## What v1 does NOT do: shared fish

Right now each player's browser spawns its own fish near them, so two players in the same spot see different fish. Truly shared fish needs server-owned fish logic, and that is v2, not v1:

- The server keeps each fish's ID, position, and orientation.
- When someone reels one in, the server tells everyone else that fish is gone, so it vanishes from every player's water at the same time.
- That is the classic server-authoritative setup most games use, and it is more work. V1 can ship with just shared boats and catches, and add the shared fish brain later.

## Decisions for Grant

1. **Spend?** The $5 to $7 a month server is new spend. On Nov 7 he said he does not want to spend money on the game beyond what he already spends on Claude and ChatGPT. So this is a real tradeoff to say yes or no to, not a free add-on.
2. **When?** On Nov 11 he agreed to hone the fishing mechanic first, since that is the main part of the game. Multiplayer could wait until that feels right, or be a small side experiment alongside it.
3. **Who gets a code?** Just a few friends to start, or open it wider once v1 works.

## If he says go, the first steps

1. Pick a host for the tiny server (Fly.io, Railway, or Render).
2. Add a room-code join box and a shared map seed to the game, without touching the fishing logic.
3. Sync boat position and catches at twice a second, then try a charter with two or three friends.
4. Leave server-owned fish for v2.
