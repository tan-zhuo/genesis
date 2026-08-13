# Civilization Simulator

> **Build the rules. Run the world. Watch history emerge.**

A pure-frontend civilization evolution sandbox. You are not a player — you are the observer. Define a world, define a handful of civilizations and simple rules, press start, and watch thousands of years of emergent history: migration, cities, technology, trade, diplomacy, wars, empires, civil wars, extinctions — and new peoples rising from the ruins.

![screenshot](docs/screenshot.png)

## Quick start

```bash
npm install
npm run dev      # open http://localhost:5173
```

Other commands:

```bash
npm test         # vitest unit tests (determinism, replay, war termination, serialization…)
npm run build    # typecheck + production build
npm run lint     # eslint (bans Math.random / Date.now inside the engine)
npm run preview  # serve the production build
```

First run: click **Explore Example World** — a 200×200 world with 5 civilizations starts simulating immediately. Type `10000` into "Run to" and press ⏩ to fast-forward ten thousand years in a few seconds.

## What you can do

- Create worlds: seed, map size (120–260), ocean level, resource richness, disaster frequency
- Create 2–20 civilizations with personality sliders (Aggression, Trade, Science, Migration, Expansion, Diplomacy, Birth Rate, Risk Taking) and starting technologies
- Build IF/THEN rules with a visual Rule Builder (no code), or load templates (Peaceful, Militaristic, Merchant, Scientific, Nomadic, …)
- Control time: pause / play / step / 1x–10,000x / run-to-year / reset
- **Replay**: re-run history from Year 0 — the result is bit-for-bit identical
- **Parallel universes**: branch the current world (same or different seed / rules), run both, and compare populations, cities, wars, and tech side by side
- Inspect everything: tiles, nations (with history charts and relations), cities, the tech tree, an event timeline, and world statistics
- Save/load (browser storage), export/import JSON configs, and share a URL that reconstructs the identical world anywhere
- Read the auto-generated **World History** narrative and export it as text

## Architecture

```
src/
  simulation/          Pure TypeScript engine — no React, no DOM
    types.ts           All shared types (Tile, Civilization, City, WorldEvent, WorldConfig…)
    Random.ts          SeededRandom (xmur3 + sfc32) — the only source of randomness
    Terrain.ts         Deterministic map generation (fBm value noise, continents, rivers, resources)
    World.ts           World creation + core mutations (claim/transfer tiles, events, yields cache)
    Population.ts      Macro population model (logistic growth, famine, carrying capacity)
    Migration.ts       Population flows toward better land; border crossings
    City.ts            Urbanization, city founding and growth (village→town→city→capital)
    Economy.ts         Economy/happiness/stability/culture/military, research, expansion
    Technology.ts      Linear 11-tech tree with multiplicative effects
    Diplomacy.ts       Relations (−100…+100), alliances, trade routes
    Warfare.ts         War declaration, yearly resolution, conquest, peace, extinction
    Collapse.ts        Empires, civil wars/splits, wilderness rebirth
    Events.ts          Seeded natural disasters (drought, plague, meteor…)
    Rules.ts           The rule engine (metrics → conditions → behavioral modifiers)
    engine.ts          simulateYear(): the fixed phase order
    snapshot.ts        Builds the render payload sent to the UI
    presets.ts         Rule templates + world presets
  worker/
    simulation.worker.ts  Owns WorldState; runs the tick loop off the main thread
    protocol.ts           Typed messages between UI and worker
  state/
    simulatorStore.ts  Zustand store: universes, snapshots, selection, view state
  components/          React UI (landing, setup wizard, canvas, inspector, charts…)
  utils/               serialization (config JSON + share URLs), history narrative, formatting
```

**The engine never imports React.** React talks to a Web Worker through a small message protocol; the worker owns the entire `WorldState` and posts lightweight `Snapshot`s (typed arrays transferred, long series decimated) at ~11 Hz regardless of simulation speed. The main thread only does UI, canvas rendering, and interaction.

### Deterministic simulation

Determinism is a hard guarantee, enforced three ways:

1. **A single seeded PRNG** (`SeededRandom`: xmur3 string hash → sfc32). `Math.random()` and `Date.now()` are banned from `src/simulation/**` and `src/worker/**` by an ESLint rule. (The landing page's decorative particle background uses `Math.random` — it never touches the simulation.)
2. **A fresh RNG per simulated year**, derived as `hash(seed + "::year::" + year)`. No RNG state is carried across years, so a world resumed at year N continues exactly like a world run straight through — which is what makes Replay and universe branching trivially consistent.
3. **A fixed phase order** in `simulateYear()`: rules → disasters → food → population → migration → cities → research → economy → trade → diplomacy → war declarations → war resolution → expansion → empire/collapse → extinction/rebirth → statistics. Iteration order over civilizations is always index order; no object-key iteration is relied on.

Same seed + same config + same engine version ⇒ identical history, verified by unit tests and by the in-app Replay button.

### The rule system

A rule is data, not code:

```
IF   Food Per Capita < 0.5
AND  Population Density > 80
THEN Increase Migration +30       (for all civilizations, or one)
```

Every simulated year, each enabled rule is evaluated per civilization against 14 metrics (population, food per capita, stability, neighbor strength, year, climate, …). Matching rules accumulate into that year's `RuleModifiers` — probability and weight nudges (migration drive, war probability, research multiplier, city-founding threshold…). Rules **never** dictate outcomes directly; they tilt the odds, and history emerges from the interaction. Editing rules mid-run deterministically re-simulates history from Year 0 under the new rules and fast-forwards to the current year.

### Performance model

- Map storage is structure-of-arrays (`Uint8Array`/`Float32Array`/`Int16Array`), not 40,000 objects.
- Per-civ resource yields are cached and updated incrementally when tiles change hands; the only O(tiles) work per year is one population pass.
- Population is a macro model (aggregate per civ, distributed per tile with a yearly renormalization that keeps map and aggregate consistent) — no per-person agents.
- 10,000 years on a 200×200 map with 5+ civilizations simulates in **~3–5 seconds** inside the worker; the UI stays at 60 FPS throughout.
- Snapshots transfer `ArrayBuffer`s and decimate all time series before posting.

### Serialization & sharing

Only the *recipe* is ever serialized: seed + world config + civilization configs + rules + engine version (~a few KB). Saves, JSON exports, and share URLs (`?seed=…&config=<base64url>`) all reconstruct the world by re-running the deterministic simulation — imported configs are validated and clamped field-by-field, so corrupt input degrades gracefully instead of crashing.

## Tests

`src/simulation/__tests__/` covers: PRNG determinism, identical worlds from identical configs, seed divergence, exact replay equality (including event years), population sanity over 2,000 years (no NaN/∞/negatives), war termination (hard cap well under 50 years), city founding/expansion, splits & extinctions occurring in hostile worlds, config round-tripping to identical simulations, config validation/clamping, and rules measurably changing history. Plus a 10,000-year smoke/performance run.

## Notes

- First version intentionally avoids WebGPU, backends, LLMs, and per-agent simulation — the point is *simple rules, deterministic simulation, emergent history, and a readable map*.
- The event log is capped (~8,000 entries) by dropping low-importance old events; major history is always kept.
- If all civilizations die, the world keeps simulating — scattered survivors in the wilderness can found new nations ("dark age → rebirth"), so deep time stays interesting.
