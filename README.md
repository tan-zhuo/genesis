# Civilization Simulator · 文明演化模拟器

> **Build the rules. Run the world. Watch history emerge.**
> **制定规则，运转世界，见证历史涌现。**

**English** | [中文说明](#中文说明)

A pure-frontend civilization evolution sandbox with a fully bilingual (English / 中文) interface — even the generated historical events and the world-history narrative are bilingual. You are not a player — you are the observer. Define a world, define a handful of civilizations and simple rules, press start, and watch thousands of years of emergent history: migration, cities, technology, trade, diplomacy, wars, empires, civil wars, extinctions — and new peoples rising from the ruins.

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
- **Play god**: 9 divine intervention tools — hurl meteors, unleash plagues, split the earth, bless or blight the land, will new civilizations into being, spark golden ages, incite wars, force peace. Interventions are recorded into the world's recipe and replay deterministically — branch a universe to compare history *with and without* your meddling
- **Achievements**: 16 observer milestones (witness the first war, an empire's rise, an extinction, reach AI, survive 10,000 years, wield the hand of god…), persisted across worlds
- **Historic-moment banners**: major events (wars, collapses, empires, divine acts) slide in over the map — click to jump there, or enable auto-pause on historic events
- **Faith & the observer**: doctrines crystallize out of each civilization's lived history (harvest cults, storm cults, atheist "Silent Sky" scholars…) and permanently reshape their character; nations **pray to you** when starving, plagued, or losing wars — answer within a generation and devotion soars, stay silent and temples empty; the world's prophets **name you** from your deeds (The Star-Hurler, The Gardener, The Silent One…); fallen nations leave clickable **ruins with epitaphs**, and philosophers ask questions their history taught them to ask
- **Night-lights map & chronicle mode**: a "civilization lights" view where city glow shifts from firelight to electric white as technology advances, crisp political borders, burning war-front pixels, and a cinematic chronicle mode where the camera drifts to wherever history is happening
- **Scenario challenges**: six win/fail scripts — keep every nation alive for 5,000 years without touching anything, set a peaceful world ablaze with only 3 interventions, reach AI before year 3,000, witness an empire rise and fall as a purely silent god…

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
- **Bilingual by design**: UI chrome is translated through a lightweight dictionary (`src/i18n/`), while simulation-generated event text is stored *bilingually inside each event at generation time* — so switching the display language never touches determinism, and a replayed history is identical in both languages.

---

# 中文说明

一个纯前端的文明演化沙盒，界面完整支持**中英双语**（右上角一键切换，包括模拟生成的历史事件与世界史叙事）。你不是玩家，而是观察者：定义一个世界、几个文明和一组简单规则，按下开始，然后看数千年的历史自行涌现 —— 迁徙、城市、科技、贸易、外交、战争、帝国、内战、灭亡，以及废墟之上崛起的新民族。

## 快速开始

```bash
npm install
npm run dev      # 打开 http://localhost:5173
```

其他命令：`npm test`（单元测试）· `npm run build`（类型检查 + 生产构建）· `npm run lint`。

第一次使用：点击**探索示例世界** —— 一个 200×200、5 个文明的世界立即开始模拟。在"运行至"输入 `10000` 并按 ⏩，几秒内快进一万年。

## 你可以做什么

- 创建世界：种子、地图尺寸（120–260）、海洋比例、资源丰富度、灾难频率
- 创建 2–20 个文明，用滑杆定义性格（侵略、贸易、科学、迁徙、扩张、外交、生育率、冒险精神）与初始科技
- 用可视化规则编辑器搭建 IF/THEN 规则（无需写代码），或加载模板（和平、军国、重商、科研、游牧……）
- 控制时间：暂停 / 播放 / 单步 / 1x–10,000x / 运行至指定年份 / 重置
- **重放（Replay）**：从元年重演历史 —— 结果逐比特一致
- **平行宇宙**：分支当前世界（同种子或改规则/种子），并排对比人口、城市、战争、科技
- 检视一切：地块、国家（历史曲线与外交关系）、城市、科技树、事件时间线、世界统计
- 保存/读取（浏览器存储）、导出/导入 JSON 配置、复制分享链接（任何地方打开都能重现同一段历史）
- 阅读自动生成的**世界历史**叙事并导出为文本
- **扮演上帝**：9 种神之手干预工具 —— 掷陨星、放瘟疫、裂大地、赐福/枯萎土地、凭空创生文明、开启黄金时代、挑动战争、强制和平。干预会记入世界配方并确定性重放 —— 分支一个宇宙，对比"有你插手"和"没你插手"的两段历史
- **成就系统**：16 个观察者里程碑（见证第一场战争、帝国崛起、文明灭绝、抵达 AI、模拟一万年、初次动用神之手……），跨世界持久保存
- **历史时刻横幅**：重大事件（战争、灭亡、帝国、神迹）滑入地图上方 —— 点击即可跳转现场，也可开启"历史时刻自动暂停"
- **信仰与观察者**：信条从每个文明亲历的历史中结晶（丰饶之道、风暴崇拜、无神论的"寂空之思"……）并永久重塑其民族性格；国家会在饥荒、瘟疫、战败时**向你祈祷** —— 一代人之内回应则虔诚高涨，保持沉默则神庙冷清；世界的先知会依据你的所作所为**为你命名**（掷星者、播绿者、沉默者……）；亡国留下可点击的**废墟与墓志铭**，思想家会问出被自身历史塑造的问题
- **文明夜灯与编年史模式**：城市光辉随科技从篝火橙演进为电力蓝白的"夜晚地球"视图、清晰国界描边、燃烧的战线像素、镜头自动飘向历史现场的电影化编年史模式
- **剧本挑战**：六个带胜负判定的剧本 —— 零干预守护所有国家活满 5000 年、只用 3 次干预点燃和平世界、3000 年前抵达 AI、以纯粹沉默之神的身份见证帝国兴亡……

## 架构与设计

- **引擎与 React 完全解耦**：`src/simulation/` 是纯 TypeScript，从不 import React；模拟运行在 Web Worker（`src/worker/`）中，主线程只负责 UI、Canvas 与交互。Worker 以约 11Hz 向 UI 发送轻量快照（typed array 传输 + 长序列抽稀），与模拟速度无关。
- **确定性模拟（硬性保证）**：唯一随机源是种子化 PRNG（xmur3 哈希 → sfc32）；ESLint 规则禁止引擎内使用 `Math.random()` / `Date.now()`。每个模拟年派生独立 RNG（`hash(seed::year::N)`），不跨年携带 RNG 状态 —— 因此从任意年份续跑与从头直跑完全一致，重放与宇宙分支天然可靠。`simulateYear()` 内部 16 个阶段的顺序固定不变。
- **规则系统**：规则是数据而非代码。每年对每个文明求值 14 种指标（人口、人均粮食、稳定度、邻国实力、年份、气候……），命中的规则累加为当年的行为倾向修正（迁徙驱动、开战概率、科研倍率、建城阈值……）。规则从不直接决定结果，只改变概率，历史从相互作用中涌现。修改规则后会在新规则下从元年确定性重演。
- **性能模型**：地图为结构化数组（`Uint8Array`/`Float32Array`），非 4 万个对象；文明资源产出增量缓存；人口为宏观聚合模型（每年一次地块归一化保证守恒）。200×200 地图上一万年在 Worker 内约 3–5 秒模拟完成，UI 全程 60 FPS。
- **序列化与分享**：只序列化"配方"（种子 + 世界/文明/规则配置 + 引擎版本，仅几 KB）。存档、JSON 导出与分享链接（`?seed=…&config=<base64url>`）全部通过重新运行确定性模拟来重建世界；导入内容逐字段校验并钳制，损坏输入优雅降级而非崩溃。
- **双语实现**：UI 文案走轻量字典（`src/i18n/`）；模拟生成的事件文本在**生成时同时写入中英两份**存入事件对象 —— 切换显示语言不触碰确定性，重放历史在两种语言下完全一致。

## 测试

`src/simulation/__tests__/` 覆盖：PRNG 确定性、同种子同配置产生逐项一致的世界、重放事件年份完全一致、2000 年人口无 NaN/∞/负数、战争必然结束（硬上限远低于 50 年）、建城与扩张、敌对世界中出现分裂与灭亡、配置导出→导入后模拟结果一致、非法配置校验与钳制、规则可测量地改变历史，外加一个一万年冒烟/性能测试。
