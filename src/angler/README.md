# The angler's look

`angler.json` is how you look in third-person view (H). The model is built from it once, at start (`src/js/models/human.js`).

| Field | Values |
|---|---|
| `build` | `"male"` or `"female"`: shoulder, waist and hip widths, and how thick the limbs are |
| `skin` | a colour, `"#rrggbb"` |
| `hair.style` | `"short"`, `"long"`, `"ponytail"` or `"none"` |
| `hair.color` | a colour |
| `outfit.cap` | cap colour, or `null` for no cap |
| `outfit.shirt` | the hooded shirt: sleeves, hood and collar |
| `outfit.vest` | fishing vest colour, or `null` for no vest |
| `outfit.trim` | vest shoulders and tabs, cuffs, the cap's button and strap, the boot stripe |
| `outfit.trousers`, `outfit.patches` | trousers and their knee patches |
| `outfit.boots`, `outfit.boot_band` | wellingtons and the band round their tops |

Anything left out falls back to the default in `human.js` (`ANGLER_LOOK`).
