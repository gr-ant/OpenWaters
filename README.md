# Open Waters

A first-person fishing and exploration game that runs in the browser. It's built with WebGL2 and plain JavaScript, with no dependencies. The whole game ships as one file: **`Open Waters.html`**. Open it in a browser to play.

## Editing

Edit the files in `src/`, then rebuild the single file:

```sh
python3 build.py
```

That writes `Open Waters.html`. It needs Python 3 and nothing else. Don't edit `Open Waters.html` by hand, because the next build overwrites it.

## Layout

```
build.py              inlines src/ into "Open Waters.html"
src/
  index.html          page markup, plus the list of every script and data file, in load order
  css/style.css       all styles
  js/
    config.js         engine overview and CONFIG (tuning knobs)
    controls.js       rebindable keys and presets
    world/            island generation, seasons and weather, water temperature, habitat, fish populations
    shaders/          GLSL for the lit world, water, particles and sky
    models/           mesh builder, trees, water plants, particle kinds
    creatures/        fish, cephalopods and shellfish, reptiles and amphibians
    engine/           the Engine object: loop, rendering, chunks, map, inventory, boats, fish behaviour, touch
    boats.js          boat definitions to hull meshes
    tackle.js         rods, reels, lines, lures, rigs
    fishing/          casting, bites, the fight, tackle box, lure camera
    game-api.js       the public Game API
    hud/              on-screen interface, icons, journal, menu keyboard navigation
    game.js           game-specific setup on top of the API
    boot.js           reads the built-in data and starts the game
  fish/*.json         one file per species   (schema "embercrown-fish/1")
  boats/*.json        one file per boat      (schema "embercrown-boat/1")
  tackle/*.json       one file per piece of gear or rig (schema "embercrown-tackle/1")
```

The scripts share one global scope and run in the order `src/index.html` lists them. Later files use names defined by earlier ones, so keep that order when you move things around.

## Adding a fish, boat or tackle item

1. Copy a similar `.json` file in `src/fish/`, `src/boats/` or `src/tackle/` and change it. Give it a new `id`, and use that id as the file name.
2. Add a matching line to `src/index.html` next to its siblings. For example:
   ```html
   <script type="application/json" data-builtin="fish" src="fish/my_fish.json"></script>
   ```
   A rig must come after the parts it uses.
3. Run `python3 build.py`. It warns you about any file in `src/` that `index.html` doesn't list.

## Playing options

You can add these to the URL: `#seed-12345` picks a fixed world, and `#climate-…`, `#season-…` and `#weather-…` set the starting conditions.
