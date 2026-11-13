"""Stdlib unittest for the Open Waters multiplayer server. No extra deps, no network --
these exercise fish_populations.py and server.py's room/handler logic directly.

Run: python3 -m unittest test_server.py -v
"""
import asyncio
import unittest

import fish_populations as fp
import server


class FakeWriter:
    """Stands in for asyncio.StreamWriter: records frames instead of touching a socket."""
    def __init__(self):
        self.closed = False

    def write(self, data):
        pass

    async def drain(self):
        pass

    def close(self):
        self.closed = True

    def get_extra_info(self, name):
        return None


def make_player(pid="p1") -> server.Player:
    return server.Player(pid=pid, writer=FakeWriter())


class DeterminismTests(unittest.TestCase):
    """"same seed gives same initial fish across two server instances" -- cell_fish is a
    pure function of (seed, climate, wildlife, cell), so two independent Room objects (the
    closest thing to "two server instances" without actually opening sockets) must agree."""

    def test_same_seed_same_cells(self):
        seed, climate, wildlife = 123456789, "temperate", 2
        species = fp.load_species(server.SPECIES_DIR)
        by_kind = fp.species_by_kind(species, climate)

        def spawn_at(cx, cy):
            terrain = fp.SimpleTerrain(seed)
            env = fp.Env(seed, climate)
            return fp.cell_fish(cx, cy, seed, wildlife, by_kind, terrain, env)

        for cx, cy in [(0, 0), (1, -2), (5, 5), (-3, 7)]:
            a = spawn_at(cx, cy)
            b = spawn_at(cx, cy)
            self.assertEqual([f.id for f in a], [f.id for f in b])
            for fa, fb in zip(a, b):
                self.assertEqual(fa.species_id, fb.species_id)
                self.assertAlmostEqual(fa.hx, fb.hx, places=9)
                self.assertAlmostEqual(fa.hy, fb.hy, places=9)
                self.assertAlmostEqual(fa.cm, fb.cm, places=9)
                self.assertAlmostEqual(fa.kg, fb.kg, places=9)

    def test_different_seed_usually_differs(self):
        species = fp.load_species(server.SPECIES_DIR)
        by_kind1 = fp.species_by_kind(species, "temperate")
        t1, e1 = fp.SimpleTerrain(1), fp.Env(1, "temperate")
        t2, e2 = fp.SimpleTerrain(2), fp.Env(2, "temperate")
        ids_seen = set()
        differs = False
        for cx in range(-5, 5):
            for cy in range(-5, 5):
                a = fp.cell_fish(cx, cy, 1, 2, by_kind1, t1, e1)
                b = fp.cell_fish(cx, cy, 2, 2, by_kind1, t2, e2)
                if [f.id for f in a] != [f.id for f in b]:
                    differs = True
                ids_seen.update(f.id for f in a)
        self.assertTrue(differs, "two different seeds produced identical fish everywhere sampled")

    def test_stable_id_format(self):
        species = fp.load_species(server.SPECIES_DIR)
        by_kind = fp.species_by_kind(species, "temperate")
        terrain = fp.SimpleTerrain(42)
        env = fp.Env(42, "temperate")
        found_any = False
        for cx in range(-10, 10):
            for cy in range(-10, 10):
                for f in fp.cell_fish(cx, cy, 42, 2, by_kind, terrain, env):
                    found_any = True
                    # species@cx,cy.kind#group.index
                    self.assertRegex(f.id, r"^[a-z0-9_\-]+@-?\d+,-?\d+\.\d+#\d+\.\d+$")
        self.assertTrue(found_any, "no fish spawned anywhere in a 20x20 cell sweep")


class CellBorderTests(unittest.TestCase):
    """A fish crossing a 16 m cell border must stay a single, consistent record: never
    duplicated across two cell buckets, never missing from room.fish, and its recorded
    cell always matches floor(x/16), floor(y/16)."""

    def _make_room(self):
        room = server.Room("TEST01", 777, "temperate", 2)
        return room

    def test_border_crossing_keeps_single_record(self):
        room = self._make_room()
        sp = room.species[0]
        spawn = fp.FishSpawn(si=sp.si, species_id=sp.id, id="test@border#0.0", hx=15.5, hy=0.0,
                               cm=30.0, kg=0.5, lead=-1, r=0.3, kind=fp.LAKE)
        f = fp.make_fish_state(spawn, sp, room.terrain)
        room.fish[f.id] = f
        room.cell_index.setdefault(f.cell, set()).add(f.id)
        self.assertEqual(f.cell, (0, 0))

        # force it straight across x=16 (the cell border) over many small steps
        f.tx, f.ty, f.tz = 20.0, 0.0, f.z
        f.leg_until = 1e9  # don't let step_cruise pick a new random leg mid-test
        f.a = 0.0
        for _ in range(200):
            old_cell = f.cell
            f.x += 0.05
            f.cell = fp.fish_cell(f.x, f.y)
            room.move_fish_cell(f, old_cell)
            # invariants that must hold after every single step
            self.assertEqual(len(room.fish), 1)
            self.assertEqual(f.cell, fp.fish_cell(f.x, f.y))
            owners = [cell for cell, ids in room.cell_index.items() if f.id in ids]
            self.assertEqual(len(owners), 1, f"fish present in {len(owners)} cell buckets at x={f.x}")
            self.assertEqual(owners[0], f.cell)
        self.assertEqual(f.cell, (1, 0))  # confirms it actually crossed from cell 0 to cell 1


class CatchTests(unittest.TestCase):
    def _room_with_one_fish(self):
        room = server.Room("TEST02", 555, "temperate", 2)
        sp = room.species[0]
        spawn = fp.FishSpawn(si=sp.si, species_id=sp.id, id="test@catch#0.0", hx=5.0, hy=5.0,
                               cm=40.0, kg=1.2, lead=-1, r=0.1, kind=fp.LAKE)
        f = fp.make_fish_state(spawn, sp, room.terrain)
        room.fish[f.id] = f
        room.cell_index.setdefault(f.cell, set()).add(f.id)
        return room, f

    def test_kept_catch_removes_fish_for_everyone(self):
        async def run():
            room, f = self._room_with_one_fish()
            owner = make_player("owner")
            other = make_player("other")
            room.players = {owner.pid: owner, other.pid: other}
            f.state = "biting"
            await server.handle_hooked(owner, room, {"id": f.id})
            self.assertEqual(f.state, "hooked")
            self.assertEqual(f.claim_owner, owner.pid)

            self.assertIn(f, room.fish_near(5.0, 5.0, 1.0))
            await server.handle_catch(owner, room, {"id": f.id, "kept": True, "cm": 41.0, "kg": 1.25})
            self.assertEqual(f.state, "gone")
            self.assertIn(f.id, room.gone)
            # gone for the OTHER client too, not just the catcher
            self.assertNotIn(f, room.fish_near(5.0, 5.0, 1.0))
        asyncio.run(run())

    def test_released_catch_stays_available(self):
        async def run():
            room, f = self._room_with_one_fish()
            owner = make_player("owner")
            room.players = {owner.pid: owner}
            f.state = "biting"
            await server.handle_hooked(owner, room, {"id": f.id})
            await server.handle_catch(owner, room, {"id": f.id, "kept": False, "cm": 41.0, "kg": 1.25})
            self.assertNotEqual(f.state, "gone")
            self.assertNotIn(f.id, room.gone)
        asyncio.run(run())


class ClaimTests(unittest.TestCase):
    def test_first_claim_wins_second_gets_taken(self):
        async def run():
            room = server.Room("TEST03", 321, "temperate", 2)
            sp = room.species[0]
            spawn = fp.FishSpawn(si=sp.si, species_id=sp.id, id="test@claim#0.0", hx=1.0, hy=1.0,
                                   cm=25.0, kg=0.4, lead=-1, r=0.2, kind=fp.LAKE)
            f = fp.make_fish_state(spawn, sp, room.terrain)
            f.state = "biting"
            room.fish[f.id] = f

            alice = make_player("alice")
            bob = make_player("bob")
            room.players = {alice.pid: alice, bob.pid: bob}

            alice_sent, bob_sent = [], []
            alice.send = lambda obj: alice_sent.append(obj) or asyncio.sleep(0)
            bob.send = lambda obj: bob_sent.append(obj) or asyncio.sleep(0)

            await server.handle_hooked(alice, room, {"id": f.id})
            await server.handle_hooked(bob, room, {"id": f.id})

            self.assertEqual(f.claim_owner, "alice")
            self.assertTrue(any(m.get("t") == "taken" and m.get("id") == f.id for m in bob_sent))
            self.assertFalse(any(m.get("t") == "taken" for m in alice_sent))
        asyncio.run(run())

    def test_cannot_claim_a_fish_that_never_bit(self):
        async def run():
            room = server.Room("TEST04", 111, "temperate", 2)
            sp = room.species[0]
            spawn = fp.FishSpawn(si=sp.si, species_id=sp.id, id="test@nobite#0.0", hx=1.0, hy=1.0,
                                   cm=25.0, kg=0.4, lead=-1, r=0.2, kind=fp.LAKE)
            f = fp.make_fish_state(spawn, sp, room.terrain)  # state defaults to "cruising"
            room.fish[f.id] = f
            p = make_player("p")
            room.players = {p.pid: p}
            sent = []
            p.send = lambda obj: sent.append(obj) or asyncio.sleep(0)
            await server.handle_hooked(p, room, {"id": f.id})
            self.assertIsNone(f.claim_owner)
            self.assertTrue(any(m.get("t") == "taken" for m in sent))
        asyncio.run(run())


class BirdSpookTests(unittest.TestCase):
    def test_close_player_spooks_bird_and_scares_fish_below(self):
        room = server.Room("TEST05", 999, "temperate", 2)
        bird = server.Bird(id="b1", species="gull", x=0.0, y=0.0, flightless=False, shy_m=9.0,
                             home_x=0.0, home_y=0.0)
        room.birds[bird.id] = bird
        room.visited_bird_patches.add((0, 0))  # pretend this patch was already placed

        sp = room.species[0]
        spawn = fp.FishSpawn(si=sp.si, species_id=sp.id, id="test@scare#0.0", hx=1.0, hy=0.0,
                               cm=20.0, kg=0.2, lead=-1, r=0.1, kind=fp.LAKE)
        f = fp.make_fish_state(spawn, sp, room.terrain)
        f.state = "cruising"
        room.fish[f.id] = f
        room.cell_index.setdefault(f.cell, set()).add(f.id)

        p = make_player("p")
        p.x, p.y = 1.0, 0.0  # well inside shy_m * FEAR (= 18m)
        room.players = {p.pid: p}

        events = server.step_birds(room)
        # other incidental flocks may also roll into existence (and even spook) in the
        # patches surrounding the player on this first approach -- what matters here is b1
        by_id = {ev["id"]: ev for ev in events}
        self.assertIn("b1", by_id)
        self.assertIn(f.id, by_id["b1"]["scared"])
        self.assertEqual(f.state, "fleeing")
        self.assertEqual(bird.state, "fleeing")

    def test_distant_player_does_not_spook(self):
        room = server.Room("TEST06", 999, "temperate", 2)
        bird = server.Bird(id="b1", species="gull", x=0.0, y=0.0, flightless=False, shy_m=9.0,
                             home_x=0.0, home_y=0.0)
        room.birds[bird.id] = bird
        room.visited_bird_patches.add((0, 0))
        p = make_player("p")
        p.x, p.y = 500.0, 500.0
        room.players = {p.pid: p}
        events = server.step_birds(room)
        # the player is nowhere near b1, so b1 specifically must not be among the spooked
        # birds (some other, freshly-placed flock near the player's own position might
        # legitimately flush on first approach -- that's not what this test checks)
        self.assertNotIn("b1", [ev["id"] for ev in events])
        self.assertEqual(bird.state, "perched")


class RngPortTests(unittest.TestCase):
    """Sanity checks on the ported RNG primitives themselves (fish_populations.py), since
    everything else's determinism depends on these matching the JS semantics exactly."""

    def test_mulberry32_is_deterministic_and_bounded(self):
        rng1 = fp.mulberry32(42)
        rng2 = fp.mulberry32(42)
        vals1 = [rng1() for _ in range(50)]
        vals2 = [rng2() for _ in range(50)]
        self.assertEqual(vals1, vals2)
        self.assertTrue(all(0.0 <= v < 1.0 for v in vals1))

    def test_hash2_is_deterministic_and_bounded(self):
        for x, y, s in [(0, 0, 0), (-5, 12, 999), (1000000, -1000000, 42)]:
            h1 = fp.hash2(x, y, s)
            h2 = fp.hash2(x, y, s)
            self.assertEqual(h1, h2)
            self.assertTrue(0.0 <= h1 < 1.0)

    def test_poisson_zero_for_nonpositive_lambda(self):
        rng = fp.mulberry32(1)
        self.assertEqual(fp.poisson(0, rng), 0)
        self.assertEqual(fp.poisson(-1, rng), 0)


if __name__ == "__main__":
    unittest.main()
