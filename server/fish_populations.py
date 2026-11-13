"""Deterministic world population for the Open Waters multiplayer server.

This is a port of the seeded math in the game's own source (read-only reference copy at
hidden_files/openwaters-repo/src/js/ -- paths below are relative to that):

  - world/worldgen.js        mulberry32, makeNoise, CLIMATES
  - engine/shared.js         hash2
  - world/fish-populations.js   cellFish (per-16m-cell fixed fish population) -- ported FAITHFULLY
  - world/habitat.js         habitatScore, envAt, fishFloor
  - world/water-temp.js      waterTemp, oxygen, seaWarm
  - world/water-plants-grid.js  fitRange, currentFit, coverFit
  - world/seasons-weather.js    ENV (season/weather state machine)
  - creatures/fish.js            FISH_DEFAULTS, WATER_KEYS, ACTIVITY_PRESETS, deepMerge
  - creatures/reptiles-amphibians.js  FishDB.register derived fields (_hid, _herp, _shell, ...)

KNOWN GAP (see README.md "Known gaps" for the full list): the real game's island, lakes and
rivers come from world/island-layout.js + island-water.js, a priority-flood watershed
simulation (carving basins, routing flow, growing rivers) that is itself ~700 lines of tightly
coupled procedural generation and is explicitly called out in multiplayer-server-plan.md
section 5 ("Option A... the biggest job") as the hard part of a server-authoritative port.
That terrain generator is NOT ported here. Instead `SimpleTerrain` below lays out one island,
a handful of lakes and one river/creek system from the seed using the same mulberry32/hash2
primitives, so the layout is deterministic and plausible, but it is NOT the same shape the
JS client draws. Every *formula* that consumes terrain (water temperature, oxygen, habitat
fit, the cellFish algorithm itself) is still a faithful line-for-line port.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from typing import Optional

MASK32 = 0xFFFFFFFF


def to_uint32(x: float) -> int:
    """JS `x >>> 0` on a float: truncate toward zero, then wrap into 32 unsigned bits."""
    return int(math.trunc(x)) & MASK32


def imul(a: int, b: int) -> int:
    """JS Math.imul: 32-bit integer multiply, keeping the low 32 bits."""
    return ((a & MASK32) * (b & MASK32)) & MASK32


def mulberry32(seed: int):
    """Same generator as worldgen.js mulberry32(a). Returns a callable rng() -> float in [0,1)."""
    state = {"a": seed & MASK32}

    def rng() -> float:
        a = (state["a"] + 0x6D2B79F5) & MASK32
        state["a"] = a
        t = imul(a ^ (a >> 15), 1 | a)
        t = (t + imul(t ^ (t >> 7), 61 | t)) ^ t
        t &= MASK32
        return ((t ^ (t >> 14)) & MASK32) / 4294967296.0

    return rng


def hash2(x: int, y: int, s: int) -> float:
    """Same grid hash as engine/shared.js hash2(x, y, s): float in [0,1)."""
    h = (imul(x, 374761393) + imul(y, 668265263) + (s & MASK32)) & MASK32
    h = imul(h ^ (h >> 13), 1274126177)
    return ((h ^ (h >> 16)) & MASK32) / 4294967296.0


def seeded_rng_from_hash(h: float):
    """cellFish's `mulberry32((hash2(...) * 4294967296) >>> 0)` idiom."""
    return mulberry32(to_uint32(h * 4294967296.0))


def make_noise(seed: int):
    """Same seeded 2D gradient ("Perlin-like") noise as worldgen.js makeNoise(seed).
    Self-contained (only needs a seed), so unlike the island shape this ports exactly.
    Output roughly in [-0.7, 0.7]."""
    rng = mulberry32(seed)
    perm = list(range(256))
    for i in range(255, 0, -1):
        j = int(rng() * (i + 1))
        perm[i], perm[j] = perm[j], perm[i]
    p = perm + perm  # 512 entries, p[i & 255] wrapped
    gx = [1, -1, 1, -1, 1, -1, 0, 0]
    gy = [1, 1, -1, -1, 0, 0, 1, -1]

    def noise(x: float, y: float) -> float:
        X = math.floor(x)
        Y = math.floor(y)
        xf = x - X
        yf = y - Y
        xi = X & 255
        yi = Y & 255
        aa = p[p[xi] + yi] & 7
        ab = p[p[xi] + yi + 1] & 7
        ba = p[p[xi + 1] + yi] & 7
        bb = p[p[xi + 1] + yi + 1] & 7
        u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
        v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
        g00 = gx[aa] * xf + gy[aa] * yf
        g10 = gx[ba] * (xf - 1) + gy[ba] * yf
        g01 = gx[ab] * xf + gy[ab] * (yf - 1)
        g11 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1)
        x1 = g00 + u * (g10 - g00)
        x2 = g01 + u * (g11 - g01)
        return x1 + v * (x2 - x1)

    return noise


def clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else hi if v > hi else v


def sstep(a: float, b: float, x: float) -> float:
    t = clamp((x - a) / (b - a), 0.0, 1.0) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)


def gauss(rng) -> float:
    return math.sqrt(-2 * math.log(rng() + 1e-12)) * math.cos(6.2832 * rng())


def poisson(lam: float, rng) -> int:
    if lam <= 0:
        return 0
    if lam > 30:
        return max(0, round(lam + math.sqrt(lam) * gauss(rng)))
    k = 0
    p = 1.0
    L = math.exp(-lam)
    while True:
        k += 1
        p *= rng()
        if p <= L:
            break
    return k - 1


# ---------------------------------------------------------------------------
# world/worldgen.js CLIMATES (water temperature offsets/swing, sea current/ice flags)
# ---------------------------------------------------------------------------
CLIMATES = {
    "temperate": {"name": "Temperate", "air": (9, 12), "water": (0, 0, 0, 0, 0), "amp": 1.0,
                  "seaCurrent": True, "seaIce": False},
    "arctic": {"name": "Arctic", "air": (-5, 13), "water": (-10, -9.5, -9, -8, -6), "amp": 0.8,
               "seaCurrent": False, "seaIce": True},
    "tropical": {"name": "Tropical", "air": (27, 1.5), "water": (15, 13, 12, 12, 10), "amp": 0.2,
                 "seaCurrent": False, "seaIce": False, "reefsEverywhere": True},
}

OCEAN, LAKE, POND, RIVER, CREEK = 0, 1, 2, 3, 4
WATER_KEYS = ["sea", "lake", "pond", "river", "creek"]
WATER_MURK = [0.05, 0.22, 0.72, 0.14, 0.04]  # world/island-layout.js WATER[].murk
COVER_KEYS = ["rocks", "weeds", "reeds", "lilies", "wood", "coral", "anemone", "open"]
FISH_CELL = 16  # world/fish-populations.js FISH_CELL

CONFIG = {
    "cellMaxAnimals": 60,
    "fishAbundance": 0.6,
    "shellfishAbundance": 0.5,
    "herpAbundance": 0.3,
    "fishRespawnMinutes": 30,
    "daysPerSeason": 5,
    "startHour": 9,
    "startSeason": "spring",
    "startSeasonPart": 0.7,
    "waterTempOffset": 0,
}
WILDLIFE_SCALE = {1: 0.4, 2: 1, 3: 2.2}  # world/fish-populations.js WILDLIFE_SCALE


# ---------------------------------------------------------------------------
# creatures/fish.js FISH_DEFAULTS + deepMerge, creatures/reptiles-amphibians.js derived fields
# ---------------------------------------------------------------------------
FISH_DEFAULTS = {
    "id": "", "name": "",
    "size": {"length_cm": {"min": 10, "typical": 25, "max": 50, "spread": 0.25},
             "weight": {"a": 0.01, "b": 3.0}, "condition_sd": 0.08},
    "body": {"plan": "fish", "parts": {}},
    "habitat": {
        "climates": None,
        "waters": {"lake": 0.5, "pond": 0.5, "river": 0.5, "creek": 0.5},
        "depth_m": {"min": 0.3, "preferred": 2, "max": 10},
        "temperature_c": {"min": 4, "optimal": 18, "max": 28},
        "current_ms": {"preferred": 0, "max": 1},
        "turbidity_max": 0.8,
        "cover": {"rocks": 0.4, "weeds": 0.4, "reeds": 0.3, "lilies": 0.3, "wood": 0.3,
                  "coral": 0, "anemone": 0, "open": 0.4},
        "cover_required": 0,
        "oxygen_min_mgL": 4,
    },
    "population": {"density": 0.6, "school": {"min": 1, "max": 1}, "home_range_m": 15},
    "activity": {"pattern": "crepuscular"},
    "behavior": {"cruise_bl_s": 0.8, "burst_bl_s": 8, "turn_rate": 2.2, "station_holding": 0,
                 "ambush": 0, "depth_zone": {"surface": 0.15, "mid": 0.5, "bottom": 0.35},
                 "wariness": 0.5, "spook_m": 5, "recover_s": 40, "curiosity": 0.4,
                 "rise_per_hour": 1, "breath_hold_s": 0, "surface_s": 5, "leap_per_hour": 0,
                 "haul_out": 0, "blow": 0},
    "diet": {"food": {"insects": 0.3, "worms": 0.3, "fish": 0.2, "nymphs": 0.2},
              "piscivore_from_cm": 0, "feeding_zone": {"surface": 0.2, "mid": 0.4, "bottom": 0.4},
              "meals_per_day": 3},
    "fight": {"strength": 0.5, "stamina": 0.5, "jumps": 0.2, "runs": 0.5, "teeth": 0},
}
FISH_REPLACE = {"waters", "cover", "food", "feeding_zone", "depth_zone", "dorsal", "pattern", "profile"}
HERP_PLANS = {"turtle", "crocodilian", "lizard", "salamander", "snake", "frog"}
BENTHIC_PLANS = {"bivalve", "snail", "crab", "lobster", "octopus"}


def deep_merge(base, over, over_present: bool, replace: set, key: Optional[str] = None):
    """Port of creatures/fish.js deepMerge(base, over, replace, key)."""
    if not over_present:
        return base
    if over is None:
        return None
    is_replace_key = key in replace if key is not None else False
    if isinstance(base, list) or isinstance(over, list) or is_replace_key \
            or not isinstance(base, dict) or not isinstance(over, dict):
        return over
    out = {}
    for k in set(base.keys()) | set(over.keys()):
        out[k] = deep_merge(base.get(k), over.get(k), k in over, replace, k)
    return out


def fnv_hid(species_id: str) -> int:
    """creatures/reptiles-amphibians.js: d._hid, a stable 32-bit per-species seed (FNV-1a-ish)."""
    h = 2166136261
    for ch in species_id:
        h = imul(h ^ ord(ch), 16777619)
    return h & MASK32


@dataclass
class Species:
    si: int
    id: str
    name: str
    data: dict
    hid: int
    herp: bool
    shell: bool
    benthic: bool
    air: bool
    need_cover: Optional[str]
    mu: float
    sig: float

    def get(self, *path, default=None):
        cur = self.data
        for p in path:
            if not isinstance(cur, dict) or p not in cur:
                return default
            cur = cur[p]
        return cur


def load_species(species_dir: str) -> list[Species]:
    """Load every species JSON in `species_dir` (the game's src/fish/*.json, copied verbatim
    into this project's species/ folder -- see README "Species data") and apply the same
    defaulting + derived fields as creatures/*.js FishDB.register."""
    out: list[Species] = []
    filenames = sorted(f for f in os.listdir(species_dir) if f.endswith(".json"))
    for si, fn in enumerate(filenames):
        with open(os.path.join(species_dir, fn), "r", encoding="utf-8") as fh:
            raw = json.load(fh)
        d = deep_merge(FISH_DEFAULTS, raw, True, FISH_REPLACE)
        plan = d["body"].get("plan") or "fish"
        herp = plan in HERP_PLANS
        shell = bool(plan) and plan not in ("fish", "ray", "pinniped") and not herp
        air = d["behavior"].get("breath_hold_s", 0) > 0
        cover_required = d["habitat"].get("cover_required") or 0
        need_cover = None
        if cover_required >= 0.5:
            cov = {k: v for k, v in d["habitat"]["cover"].items() if k != "open"}
            if cov:
                need_cover = max(cov, key=lambda k: cov[k])
        length = d["size"]["length_cm"]
        out.append(Species(
            si=si, id=d["id"], name=d["name"], data=d, hid=fnv_hid(d["id"]),
            herp=herp, shell=shell,
            benthic=plan in BENTHIC_PLANS,
            air=air, need_cover=need_cover,
            mu=math.log(length["typical"]), sig=length["spread"],
        ))
    return out


def species_by_kind(species: list[Species], climate_key: str) -> list[list[Species]]:
    """creatures/reptiles-amphibians.js FishDB.byKind: species that can live in each kind of
    water on this climate, fish first then herps then shellfish (so cells fill the same way
    regardless of species list order -- see cellFish)."""
    by_kind: list[list[Species]] = []
    for key in WATER_KEYS:
        group = [sp for sp in species
                  if (sp.get("habitat", "waters", key, default=0) or 0) > 0
                  and (not sp.get("habitat", "climates") or climate_key in sp.get("habitat", "climates"))]
        group.sort(key=lambda sp: (2 if sp.shell else 1 if sp.herp else 0))
        by_kind.append(group)
    return by_kind


def sample_fish_size(sp: Species, rng) -> tuple[float, float]:
    """world/fish-populations.js sampleFishSize: log-normal length truncated to [min, max],
    weight from W = a * L^b with lognormal condition noise."""
    L = sp.get("size", "length_cm")
    cm = L["typical"]
    for _ in range(6):
        cm = math.exp(sp.mu + sp.sig * gauss(rng))
        if L["min"] <= cm <= L["max"]:
            break
    cm = clamp(cm, L["min"], L["max"])
    w = sp.get("size", "weight")
    kg = w["a"] * cm ** w["b"] * math.exp(sp.get("size", "condition_sd", default=0.08) * gauss(rng)) / 1000.0
    return cm, kg


# ---------------------------------------------------------------------------
# world/seasons-weather.js ENV -- the server's time/weather authority (ported faithfully;
# self-contained, no terrain dependency)
# ---------------------------------------------------------------------------
SEASONS = ["spring", "summer", "autumn", "winter"]
WEATHER = {
    "clear": {"cloud": 0.08, "rain": 0, "wind": 0.2, "fog": 0, "storm": 0, "p": 1023},
    "fair": {"cloud": 0.35, "rain": 0, "wind": 0.35, "fog": 0, "storm": 0, "p": 1017},
    "overcast": {"cloud": 0.88, "rain": 0, "wind": 0.3, "fog": 0.12, "storm": 0, "p": 1009},
    "drizzle": {"cloud": 0.92, "rain": 0.3, "wind": 0.25, "fog": 0.3, "storm": 0, "p": 1006},
    "rain": {"cloud": 0.96, "rain": 0.75, "wind": 0.5, "fog": 0.25, "storm": 0, "p": 1001},
    "storm": {"cloud": 1, "rain": 1, "wind": 0.95, "fog": 0.2, "storm": 1, "p": 994},
    "fog": {"cloud": 0.55, "rain": 0, "wind": 0.04, "fog": 1, "storm": 0, "p": 1019},
}
WEATHER_NEXT = {
    "clear": {"clear": 4, "fair": 4, "overcast": 1, "fog": 1},
    "fair": {"clear": 2, "fair": 3, "overcast": 3, "drizzle": 1},
    "overcast": {"fair": 2, "overcast": 2, "drizzle": 2, "rain": 2, "storm": 0.5},
    "drizzle": {"overcast": 2, "drizzle": 1, "rain": 2, "fair": 1},
    "rain": {"overcast": 2, "drizzle": 1, "rain": 1, "storm": 1, "fair": 1},
    "storm": {"rain": 2, "overcast": 2, "fair": 1},
    "fog": {"clear": 2, "fair": 2, "overcast": 1},
}


class Env:
    """Port of world/seasons-weather.js ENV. One per room; the server owns it and clients'
    T/Y/U keys are disabled in a charter room (see multiplayer-server-plan.md section 10)."""

    def __init__(self, seed: int, climate_key: str):
        self.seed = seed
        self.climate = CLIMATES[climate_key]
        self.climate_key = climate_key
        self.yf = 0.0
        self.hours = 0.0
        self.day = 0.0
        self.block = -1
        self.block_start = 0.0
        self.block_end = 0.0
        self.block_len = 5.0
        self.kind = "fair"
        self.next = "fair"
        self.cloud = 0.3
        self.rain = 0.0
        self.wind = 0.3
        self.fog = 0.0
        self.storm = 0.0
        self.pressure = 1015.0
        self.p_target = 1015.0
        self.trend = 0.0
        self.p_hist: list[tuple[float, float]] = []
        self.air_t = 15.0
        self.air_mean = 15.0
        self.growth = 1.0
        self.ice_lake = 0.0
        self.ice_pond = 0.0
        self.ice_sea = 0.0
        self.turb = 0.0
        self.forced = 0.0
        self.settle = True
        i = max(0, SEASONS.index(CONFIG["startSeason"]))
        self.set_date((i + CONFIG["startSeasonPart"]) / 4, CONFIG["startHour"])

    @property
    def season(self) -> str:
        return SEASONS[int(self.yf * 4) % 4]

    @property
    def year_days(self) -> float:
        return CONFIG["daysPerSeason"] * 4

    def air_mean_at(self, yf: float) -> float:
        air0, air1 = self.climate["air"]
        return air0 + air1 * math.cos(6.2832 * (yf - 0.375))

    def set_date(self, yf: float, hour: Optional[float] = None):
        self.yf = ((yf % 1) + 1) % 1
        h = hour if hour is not None else (self.hours % 24 if self.hours else CONFIG["startHour"])
        self.hours = math.floor(self.yf * self.year_days) * 24 + h
        self.day = self.hours / 24
        self.yf = (self.day / self.year_days) % 1
        self.block = -1
        self.settle = True
        self.p_hist = []
        self.forced = 0

    def set_weather(self, kind: str):
        if kind not in WEATHER:
            return
        self.kind = self.next = kind
        self.settle = True
        self.forced = self.hours + 6

    def pick_next(self, rng) -> str:
        w = dict(WEATHER_NEXT.get(self.kind, {}))
        s = self.season
        if s == "summer":
            w["clear"] = w.get("clear", 0) * 1.4
            w["storm"] = w.get("storm", 0) * 1.8
            w["fog"] = w.get("fog", 0) * 0.5
        if s == "autumn":
            w["fog"] = w.get("fog", 0) * 1.8 + 0.5
            w["rain"] = w.get("rain", 0) * 1.3
        if s == "winter":
            w["overcast"] = w.get("overcast", 0) * 1.5
            w["storm"] = w.get("storm", 0) * 0.3
        if s == "spring":
            w["drizzle"] = w.get("drizzle", 0) * 1.5
            w["rain"] = w.get("rain", 0) * 1.3
        if self.climate_key == "tropical":
            w["fog"] = 0
            w["storm"] = w.get("storm", 0) * (3 if s in ("summer", "autumn") else 1)
            w["rain"] = w.get("rain", 0) * (2 if s == "summer" else 0.6)
            w["clear"] = w.get("clear", 0) * (2 if s == "winter" else 1)
        if self.climate_key == "arctic":
            w["overcast"] = w.get("overcast", 0) * 1.6
            w["fog"] = w.get("fog", 0) * (2.5 if s == "summer" else 0.5)
            w["storm"] = w.get("storm", 0) * 0.3
        total = sum(w.values())
        r = rng() * total
        for k, v in w.items():
            r -= v
            if r <= 0:
                return k
        return "fair"

    def update(self, dt_hours: float):
        self.hours += dt_hours
        self.day = self.hours / 24
        self.yf = (self.day / self.year_days) % 1
        hour = (self.hours % 24)
        if self.block < 0 or self.hours >= self.block_end:
            blk = math.floor(self.hours / 5) if self.block < 0 else self.block + 1
            rng = mulberry32((self.seed ^ imul(blk + 7919, 2654435761)) & MASK32)
            if self.block < 0:
                if not (self.forced and self.hours < self.forced):
                    self.kind = self.pick_next(rng)
                self.next = self.pick_next(rng)
            elif self.forced and self.hours < self.forced:
                self.next = self.kind
            else:
                self.kind = self.next
                self.next = self.pick_next(rng)
            self.block = blk
            self.block_len = 3 + 5 * rng()
            self.block_start = self.hours
            self.block_end = self.hours + self.block_len
        w = WEATHER[self.kind]
        wn = WEATHER[self.next]
        into = clamp((self.hours - self.block_start) / self.block_len, 0, 1)
        lerp_k = 1.0 if self.settle else min(1.0, dt_hours * 0.9)

        def ease(cur, target):
            return cur + (target - cur) * lerp_k

        self.cloud = ease(self.cloud, w["cloud"])
        self.rain = ease(self.rain, w["rain"])
        self.wind = ease(self.wind, w["wind"])
        fog_night = 1 if (hour < 4 or hour > 21 or (4 < hour < 10)) else 0.35
        self.fog = ease(self.fog, w["fog"] * fog_night)
        self.storm = ease(self.storm, w["storm"])
        self.p_target = w["p"] + (wn["p"] - w["p"]) * sstep(0.4, 1, into)
        self.pressure += (self.p_target - self.pressure) * (1.0 if self.settle else min(1.0, dt_hours * 0.5))
        last = self.p_hist[-1][0] if self.p_hist else -1e9
        if self.hours - last >= 1 / 60 or self.settle:
            self.p_hist.append((self.hours, self.pressure))
            drop = 0
            while len(self.p_hist) - drop > 2 and self.hours - self.p_hist[drop][0] > 3:
                drop += 1
            if drop:
                self.p_hist = self.p_hist[drop:]
        self.trend = self.pressure - self.p_hist[0][1]
        self.air_mean = self.air_mean_at(self.yf)
        sun_up = math.sin((hour - 6) / 24 * 6.2832)
        self.air_t = self.air_mean + sun_up * (5.5 - 3.5 * self.cloud) - 2.5 * self.rain \
            + (-2 if self.kind == "clear" and sun_up < 0 else 0)
        yf = self.yf
        self.growth = 1.0 if self.climate.get("evergreen") else sstep(0.08, 0.3, yf) * (1 - sstep(0.62, 0.8, yf))
        self.ice_lake = sstep(-0.6, -2.4, self.air_mean_at(yf - 0.035) - CONFIG["waterTempOffset"])
        self.ice_pond = sstep(0.6, -1.4, self.air_mean_at(yf - 0.015) - CONFIG["waterTempOffset"])
        self.ice_sea = sstep(-3, -14, self.air_mean_at(yf - 0.06) - CONFIG["waterTempOffset"]) \
            if self.climate.get("seaIce") else 0.0
        self.turb = clamp(0.0, 0.0, 1.0)  # KNOWN GAP: real ENV.wet/rain-runoff turbidity needs land-wetness state we don't track; kept at 0
        self.settle = False

    def iced(self, kind: int, dep: float) -> bool:
        if kind == OCEAN:
            return self.ice_sea > 0 and dep < self.ice_sea * 16 - 0.2
        a = self.ice_lake if kind == LAKE else self.ice_pond if kind == POND else 0
        return a > 0 and dep < a * 16 - 0.2

    def to_wire(self) -> dict:
        return {"yf": round(self.yf, 5), "tod": round((self.hours % 24) / 24, 5), "weather": self.kind,
                "season": self.season}


# ---------------------------------------------------------------------------
# world/water-temp.js -- waterTemp, oxygen (self-contained given an Env; faithful port)
# ---------------------------------------------------------------------------
def sea_warm(climate: dict, x: float, y: float, island_r: float) -> float:
    """world/water-temp.js seaWarm, simplified: the noise wiggle term is dropped because it
    reads the real island's `nE` noise field at world coordinates tied to the real coastline;
    the sstep envelope (the actual warm/cold-current split) is kept exactly."""
    if climate.get("reefsEverywhere"):
        return 1.0
    if not climate.get("seaCurrent"):
        return 0.0
    base = sstep(-0.35, 0.45, (x * 0.35 + y * 0.94) / island_r + 0.12)
    return base


def raw_surface_t(kind: int, climate: dict, yf: float) -> float:
    k = [(11, 6, 0.45), (12, 11, 0.41), (13, 12, 0.39), (10, 8, 0.4), (9, 4, 0.4)][kind]
    return k[0] + climate["water"][kind] + k[1] * climate["amp"] * math.cos(6.2832 * (yf - k[2])) + CONFIG["waterTempOffset"]


def water_temp(kind: int, level: float, below: float, x: float, y: float, env: Env,
               island_r: float, live: bool = True) -> float:
    yf = env.yf if live else 0.33
    surf_raw = raw_surface_t(kind, env.climate, yf)
    t_min = -1.8 if kind == OCEAN else 0.2
    t = max(t_min, surf_raw) - max(0.0, level) * 0.05
    if live:
        t += [0.02, 0.06, 0.25, 0.12, 0.05][kind] * (env.air_t - env.air_mean)
        hour = env.hours % 24
        t += [0.3, 1, 1.6, 0.6, 0.5][kind] * (1 - 0.6 * env.cloud) * math.sin((hour - 9) / 24 * 6.2832)
    else:
        t += [0.3, 1, 1.6, 0.6, 0.5][kind] * 0.5
    # KNOWN GAP: springPull (creek/river cooling near a spring) needs the ported river network's
    # spring list; we don't site real springs, so this term is always 0 (skipped).
    w = sea_warm(env.climate, x, y, island_r) if kind == OCEAN else 0.0
    if kind == OCEAN and env.climate.get("seaCurrent"):
        t += 5.5 * w - 2.5
    if kind in (LAKE, OCEAN):
        if kind == OCEAN:
            deep = max(-1.5, min(t, 1.5)) if env.climate_key == "arctic" else min(t, 6 + (30 if env.climate.get("reefsEverywhere") else 6) * w)
            top = 8 + (30 if env.climate.get("reefsEverywhere") else 8) * w
            bot = 30 + 80 * w
        else:
            deep = min(t, 4 + 2.5 * sstep(0, 0.3, yf)) if t > 4 else 4
            top = 3 if t > 12 else 1.5
            bot = 9 if t > 12 else 5
        t += (deep - t) * sstep(top, bot, below)
        if kind == OCEAN:
            t += ((0.5 if env.climate_key == "arctic" else 4) - t) * sstep(150, 800, below)
    elif kind == POND:
        t = t - below * 0.5 if t > 4 else min(4.0, t + below * 0.9)
    return max(t_min, t)


def oxygen(kind: int, t: float, below: float, env: Env, rap: float = 0.0, live: bool = True) -> float:
    sat = 14.6 - 0.394 * t + 0.0072 * t * t
    f = [0.97, 0.95, 0.82, 1, 1.02][kind]
    if not live:
        return sat * f
    hour = env.hours % 24
    photo = math.sin((hour - 6) / 12 * 3.1416)
    if kind == POND:
        f += (0.22 * photo * (1 - 0.6 * env.cloud) if photo > 0 else 0.18 * photo) * (0.4 + 0.6 * env.growth) - 0.3 * sstep(18, 27, t)
    if kind == LAKE and t > 12:
        f *= 1 - 0.45 * sstep(4, 11, below)
    if kind in (LAKE, POND):
        f += 0.08 * env.wind
    if kind == POND:
        f *= 1 - 0.55 * env.ice_pond
    if kind == LAKE:
        f *= 1 - 0.2 * env.ice_lake
    if kind >= RIVER:
        f = max(f, 1.02 + 0.12 * rap)
    return sat * f


def oxy_fit(sp: Species, mg: float) -> float:
    omin = sp.get("habitat", "oxygen_min_mgL", default=4)
    if sp.air or omin <= 0:
        return 1.0
    return sstep(omin * 0.7, omin * 1.25, mg)


def fit_range(v: float, lo: float, opt: float, hi: float) -> float:
    """world/water-plants-grid.js fitRange."""
    if v < lo or v > hi:
        return 0.0
    span = max(1e-3, (opt - lo) if v < opt else (hi - opt))
    return 1 - 0.88 * ((v - opt) / span) ** 2


def current_fit(c: float, habitat: dict) -> float:
    p = habitat["current_ms"]["preferred"]
    m = habitat["current_ms"]["max"]
    if c > m:
        return 0.0
    if c < p:
        return 1 - 0.6 * ((p - c) / max(p, 0.3)) ** 2
    return 1 - 0.85 * ((c - p) / max(1e-3, m - p)) ** 2


def cover_fit(cover: dict, habitat: dict) -> float:
    """Ported from water-plants-grid.js but effectively unused: our simplified terrain never
    produces an env.cover dict (no water-plant placement system), so habitat_score always
    takes the `cover factor = 1` branch, same as the real envAt(..., withCover=false)."""
    p = habitat["cover"]
    s = 0.0
    m = 0.0
    for k in COVER_KEYS:
        s += (p.get(k) or 0) * (cover.get(k) or 0)
        m = max(m, p.get(k) or 0)
    fl = 0.25 * (1 - clamp(habitat.get("cover_required") or 0, 0, 1))
    return fl + (1 - fl) * min(1, s / (m or 1))


def fish_floor(sp: Species, water_level: float, ground: float) -> float:
    """world/habitat.js fishFloor."""
    if sp.benthic:
        return ground
    depth_max = sp.get("habitat", "depth_m", "max", default=10)
    return max(ground, water_level - depth_max)


def habitat_score(sp: Species, env: dict, below: Optional[float], island_r: float,
                   room_env: Env, live: bool = True) -> float:
    """world/habitat.js habitatScore, ported faithfully. `env` is a dict with keys
    kind, level, dep, cur, cover (None in this server), x, y, rap."""
    habitat = sp.data["habitat"]
    w = habitat["waters"].get(WATER_KEYS[env["kind"]], 0) or 0
    if not w:
        return 0.0
    bz = below if below is not None else min(env["dep"], max(0.3, habitat["depth_m"]["preferred"]))
    t = water_temp(env["kind"], env["level"], bz, env["x"], env["y"], room_env, island_r, live)
    tf = fit_range(t, habitat["temperature_c"]["min"], habitat["temperature_c"]["optimal"], habitat["temperature_c"]["max"])
    df = fit_range(env["dep"], habitat["depth_m"]["min"], habitat["depth_m"]["preferred"], habitat["depth_m"]["max"] * 1.5)
    if env["dep"] > habitat["depth_m"]["preferred"] and not sp.benthic:
        zone = sp.data["behavior"]["depth_zone"]
        total_z = (zone.get("surface") or 0) + (zone.get("mid") or 0) + (zone.get("bottom") or 0)
        zb = (zone.get("bottom") or 0) / (total_z or 1)
        df += (1 - df) * (1 - zb) ** 2
    cur_f = current_fit(env.get("cur", 0.0), habitat)
    # ENV.turb (rain-runoff turbidity) is kept at 0 -- see Env.update KNOWN GAP -- so the
    # live-only turbidity boost from habitat.js habitatScore is always a no-op here.
    murk = WATER_MURK[env["kind"]]
    turb_pen = 0.35 if murk > habitat["turbidity_max"] else 1.0
    cov = cover_fit(env["cover"], habitat) if env.get("cover") else 1.0
    oxy = oxygen(env["kind"], t, bz, room_env, env.get("rap", 0.0), live)
    return w * df * (tf if live else tf ** 2.5) * cur_f * turb_pen * cov * (0.15 + 0.85 * oxy_fit(sp, oxy))


# ---------------------------------------------------------------------------
# Simplified terrain: one island + a few lakes + one river/creek system, deterministic
# from SEED. NOT a port of island-layout.js/island-water.js -- see module docstring.
# ---------------------------------------------------------------------------
class SimpleTerrain:
    def __init__(self, seed: int, island_size: float = 6000):
        self.seed = seed
        self.island_r = island_size / 2
        self.coast_noise = make_noise((seed ^ 0x51ed2701) & MASK32)
        self.hill_noise = make_noise(seed & MASK32)
        rng = mulberry32((seed ^ 0x1A4E5) & MASK32)
        self.lakes = []
        # Spawn lake near the origin, mirroring the game: Engine.init() spawns the
        # player at findWater(LAKE, 0, 0, ...), so the first lake has to be near
        # (0, 0). Without this, cells around the origin are dry land, a joining
        # player at (0, 0) sees zero fish, and the determinism tests that sweep
        # cells around the origin find nothing. (Fix applied by Nikki, Nov 13, 2026:
        # the first version placed all lakes 400+ m from the origin.)
        a0 = rng() * 6.2832
        d0 = 40 + 60 * rng()
        r0 = 45 + 25 * rng()
        self.lakes.append({"x": math.cos(a0) * d0, "y": math.sin(a0) * d0, "r": r0,
                            "level": 0.6 + 1.2 * rng(), "depth": 3 + 3 * rng()})
        for i in range(3):
            a = rng() * 6.2832
            d = self.island_r * (0.15 + 0.5 * rng())
            r = 20 + 50 * rng()
            self.lakes.append({"x": math.cos(a) * d, "y": math.sin(a) * d, "r": r,
                                "level": 0.4 + 1.5 * rng(), "depth": 2 + 4 * rng()})
        for i in range(2):
            a = rng() * 6.2832
            d = self.island_r * (0.1 + 0.4 * rng())
            r = 6 + 10 * rng()
            self.lakes.append({"x": math.cos(a) * d, "y": math.sin(a) * d, "r": r,
                                "level": 0.3 + 0.6 * rng(), "depth": 0.8 + 1.0 * rng(),
                                "pond": True})
        # one river: wanders from near the centre out to the coastline in a few waypoints
        src_a = rng() * 6.2832
        n_pts = 6
        pts = []
        for k in range(n_pts + 1):
            t = k / n_pts
            r = self.island_r * (0.1 + 0.85 * t)
            wiggle = (rng() - 0.5) * self.island_r * 0.12
            a = src_a + wiggle / max(r, 1)
            pts.append((math.cos(a) * r, math.sin(a) * r))
        self.river_pts = pts
        self.river_creek_until = int(n_pts * 0.4)

    def coast_radius(self, theta: float) -> float:
        n = self.coast_noise(math.cos(theta) * 2 + 4, math.sin(theta) * 2 - 4)
        return self.island_r * (1 + 0.22 * n)

    def _nearest_river_seg(self, x: float, y: float):
        best_d = 1e18
        best = None
        pts = self.river_pts
        for i in range(len(pts) - 1):
            ax, ay = pts[i]
            bx, by = pts[i + 1]
            dx, dy = bx - ax, by - ay
            l2 = dx * dx + dy * dy or 1.0
            tt = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0.0, 1.0)
            px, py = ax + dx * tt, ay + dy * tt
            d = math.hypot(x - px, y - py)
            if d < best_d:
                best_d = d
                best = (i, tt)
        return best_d, best

    def sample(self, x: float, y: float) -> dict:
        """Returns {kind, level, ground, dep, rap} -- the simplified analogue of island-sample.js
        world(x, y) + island-cache.js sample(x, y)."""
        theta = math.atan2(y, x)
        dist = math.hypot(x, y)
        coast_r = self.coast_radius(theta)
        hills = self.hill_noise(x / 300, y / 300) * 6
        land_h = max(0.0, (1 - dist / coast_r)) * 20 + hills if dist < coast_r else 0.0
        # lakes/ponds win over plain land/sea if within radius
        for lk in self.lakes:
            d = math.hypot(x - lk["x"], y - lk["y"])
            if d < lk["r"]:
                ground = lk["level"] - lk["depth"] * (1 - (d / lk["r"]) ** 2)
                return {"kind": POND if lk.get("pond") else LAKE, "level": lk["level"],
                        "ground": ground, "dep": lk["level"] - ground, "rap": 0.0}
        # river/creek band
        d, seg = self._nearest_river_seg(x, y)
        river_half_width = 10.0
        if d < river_half_width and seg is not None:
            i, tt = seg
            is_creek = i < self.river_creek_until
            width = (2.0 if is_creek else 6.0)
            if d < width:
                level = 0.3  # KNOWN GAP: real rivers slope downhill (carveBasin); ours is flat
                depth = (0.6 if is_creek else 1.8) * (1 - (d / width) ** 2) + 0.15
                rap = 0.0
                return {"kind": CREEK if is_creek else RIVER, "level": level,
                        "ground": level - depth, "dep": depth, "rap": rap}
        if dist >= coast_r:
            depth = min(400.0, (dist - coast_r) * 0.08 + 1.0)
            return {"kind": OCEAN, "level": 0.0, "ground": -depth, "dep": depth, "rap": 0.0}
        # dry land
        return {"kind": OCEAN, "level": 0.0, "ground": land_h, "dep": -land_h, "rap": 0.0}

    def env_at(self, x: float, y: float) -> dict:
        s = self.sample(x, y)
        return {"x": x, "y": y, "kind": s["kind"], "level": s["level"], "dep": s["dep"],
                "ground": s["ground"], "cur": 0.0, "cover": None, "rap": s["rap"]}


# ---------------------------------------------------------------------------
# world/fish-populations.js cellFish -- ported FAITHFULLY (same RNG streams, same stable
# IDs, same cap/scaling). This is the heart of "same seed -> same fish".
# ---------------------------------------------------------------------------
@dataclass
class FishSpawn:
    si: int
    species_id: str
    id: str
    hx: float
    hy: float
    cm: float
    kg: float
    lead: int
    r: float
    kind: int


def cell_fish(cx: int, cy: int, seed: int, wildlife: int, by_kind: list[list[Species]],
              terrain: SimpleTerrain, room_env: Env) -> list[FishSpawn]:
    rng = seeded_rng_from_hash(hash2(cx, cy, (seed + 911) & MASK32))
    pts = []
    for _ in range(6):
        x = (cx + 0.08 + 0.84 * rng()) * FISH_CELL
        y = (cy + 0.08 + 0.84 * rng()) * FISH_CELL
        s = terrain.sample(x, y)
        if s["dep"] > 0.3:
            pts.append((x, y, s["kind"]))
    out: list[FishSpawn] = []
    seen_kinds = sorted(set(p[2] for p in pts))
    wildlife_scale = WILDLIFE_SCALE[wildlife]
    for kind in seen_kinds:
        here = [p for p in pts if p[2] == kind]
        area = FISH_CELL * FISH_CELL * len(here) / 6.0
        env = terrain.env_at(here[0][0], here[0][1])
        for sp in by_kind[kind]:
            if len(out) >= CONFIG["cellMaxAnimals"]:
                break
            if sp.need_cover:
                continue  # KNOWN GAP: no water-plant/cover placement system -- see module docstring
            score = habitat_score(sp, env, None, terrain.island_r, room_env, live=False)
            if score < 0.02:
                continue
            school = sp.get("population", "school")
            mean = (school["min"] + school["max"]) / 2.0
            rs = seeded_rng_from_hash(hash2(cx * 7 + kind, cy, (seed + sp.hid) & MASK32))
            abundance = CONFIG["shellfishAbundance"] if sp.shell else CONFIG["herpAbundance"] if sp.herp else CONFIG["fishAbundance"]
            lam = sp.get("population", "density", default=0.6) * score * area / 100.0 * wildlife_scale * abundance / mean
            groups = poisson(lam, rs)
            if sp.herp:
                groups = min(groups, 2)
            if not groups:
                continue
            for g in range(groups):
                if len(out) >= CONFIG["cellMaxAnimals"]:
                    break
                n = 1 if sp.herp else round(school["min"] + rs() * (school["max"] - school["min"]))
                px, py = here[int(rs() * len(here)) % len(here)][:2]
                lead = len(out)
                for k in range(n):
                    hx = px + (rs() - 0.5) * 3
                    hy = py + (rs() - 0.5) * 3
                    cm, kg = sample_fish_size(sp, rs)
                    fish_id = f"{sp.id}@{cx},{cy}.{kind}#{g}.{k}"
                    out.append(FishSpawn(si=sp.si, species_id=sp.id, id=fish_id, hx=hx, hy=hy,
                                          cm=cm, kg=kg, lead=(lead if k else -1), r=rs(), kind=kind))
    return out


# ---------------------------------------------------------------------------
# Fixed-tick movement: a SIMPLIFIED, deterministic stand-in for
# engine/fish-behaviour.js fishStep + engine/fish-update.js updateFish.
#
# Simplification (documented, not silent -- see README "Known gaps" and the task brief,
# which explicitly asks for "a simple, deterministic, seeded behaviour model... cruise near
# home, depth band, speed by species size; keep it simple"): there is no hunting, fleeing,
# schooling, feeding, breathing or fighting state machine here. A fish cruises in a slow
# loop around its home point, staying within population.home_range_m, at a depth picked
# once per leg inside its species' preferred depth band (clamped to the local water depth),
# and turns at a bounded rate. Every random choice comes from a per-fish, per-leg seeded
# stream (hash2 of the fish's stable id and the leg number), so replaying the same seed and
# tick history reproduces the same path -- there is no reliance on Python's global `random`.
# ---------------------------------------------------------------------------
@dataclass
class FishState:
    id: str
    si: int
    species_id: str
    x: float
    y: float
    z: float
    a: float  # heading, radians
    home_x: float
    home_y: float
    length_cm: float
    weight_kg: float
    kind: int
    cell: tuple[int, int]
    state: str = "cruising"  # cruising | biting | hooked | fleeing | gone
    leg: int = 0
    leg_until: float = 0.0
    tx: float = 0.0
    ty: float = 0.0
    tz: float = 0.0
    claim_owner: Optional[str] = None
    gone_until: Optional[float] = None


def fish_cell(x: float, y: float) -> tuple[int, int]:
    return (math.floor(x / FISH_CELL), math.floor(y / FISH_CELL))


def make_fish_state(spawn: FishSpawn, species: Species, terrain: SimpleTerrain) -> FishState:
    env = terrain.sample(spawn.hx, spawn.hy)
    ground = fish_floor(species, env["level"], env["ground"])
    z = ground + max(0.05, (env["level"] - ground) * 0.5)
    return FishState(id=spawn.id, si=spawn.si, species_id=spawn.species_id, x=spawn.hx, y=spawn.hy,
                      z=z, a=spawn.r * 6.2832, home_x=spawn.hx, home_y=spawn.hy,
                      length_cm=spawn.cm, weight_kg=spawn.kg, kind=spawn.kind,
                      cell=fish_cell(spawn.hx, spawn.hy))


def leg_rng(fish_id: str, leg: int, seed: int):
    return seeded_rng_from_hash(hash2(fnv_hid(fish_id), leg, (seed + 97) & MASK32))


def step_cruise(fish: FishState, sp: Species, terrain: SimpleTerrain, dt: float,
                 sim_time: float, seed: int) -> None:
    """Advance one fish by `dt` seconds. Only called for fish within simulation range of a
    player or lure (see server.py); far fish stay parked at their home point."""
    if fish.state in ("hooked", "gone"):
        return
    if sim_time >= fish.leg_until:
        fish.leg += 1
        rng = leg_rng(fish.id, fish.leg, seed)
        home_range = sp.get("population", "home_range_m", default=15)
        ang = rng() * 6.2832
        dist = rng() * min(home_range, 25)
        fish.tx = fish.home_x + math.cos(ang) * dist
        fish.ty = fish.home_y + math.sin(ang) * dist
        env = terrain.sample(fish.tx, fish.ty)
        ground = fish_floor(sp, env["level"], env["ground"])
        depth_zone = sp.get("behavior", "depth_zone", default={"surface": 0.15, "mid": 0.5, "bottom": 0.35})
        zone = max(depth_zone, key=lambda k: depth_zone.get(k, 0)) if depth_zone else "mid"
        lo = ground + 0.05
        hi = max(lo, env["level"] - 0.1)
        fish.tz = lo + (hi - lo) * (0.85 if zone == "bottom" else 0.15 if zone == "surface" else 0.5)
        fish.leg_until = sim_time + 8 + rng() * 14
    cruise_bl_s = sp.get("behavior", "cruise_bl_s", default=0.8)
    length_m = max(0.05, fish.length_cm / 100.0)
    speed = cruise_bl_s * length_m
    dx, dy = fish.tx - fish.x, fish.ty - fish.y
    dist = math.hypot(dx, dy)
    if dist > 1e-3:
        desired = math.atan2(dy, dx)
        turn_rate = sp.get("behavior", "turn_rate", default=2.2)
        da = math.atan2(math.sin(desired - fish.a), math.cos(desired - fish.a))
        fish.a += clamp(da, -turn_rate * dt, turn_rate * dt)
    step = min(dist, speed * dt)
    fish.x += math.cos(fish.a) * step
    fish.y += math.sin(fish.a) * step
    fish.z += clamp(fish.tz - fish.z, -0.3 * dt, 0.3 * dt)
    fish.cell = fish_cell(fish.x, fish.y)
