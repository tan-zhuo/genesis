// Deterministic procedural world generation.
// Value-noise fBm + edge falloff produces natural-looking continents;
// rivers are traced downhill from mountain sources and boost fertility.
import { SeededRandom, subRng, hashString } from './Random';
import { RESOURCE_BIT, TERRAINS, Terrain, WorldMap, WorldConfig } from './types';

const TERRAIN_INDEX: Record<Terrain, number> = {
  ocean: 0,
  plains: 1,
  forest: 2,
  desert: 3,
  mountain: 4,
  tundra: 5,
};
export { TERRAIN_INDEX };

/** 2D lattice hash noise in [0,1), deterministic from seed. */
function latticeValue(seed: number, xi: number, yi: number): number {
  let h = seed ^ Math.imul(xi, 374761393) ^ Math.imul(yi, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smoothstep(x - xi);
  const ty = smoothstep(y - yi);
  const v00 = latticeValue(seed, xi, yi);
  const v10 = latticeValue(seed, xi + 1, yi);
  const v01 = latticeValue(seed, xi, yi + 1);
  const v11 = latticeValue(seed, xi + 1, yi + 1);
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

/** Fractal Brownian motion, output roughly in [0,1]. */
function fbm(seed: number, x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(seed + o * 1013, x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function generateMap(config: WorldConfig): WorldMap {
  const { width, height } = config;
  const n = width * height;
  const seedNum = hashString(`${config.seed}::map`);
  const rng = subRng(config.seed, 'map-extras');

  const terrain = new Uint8Array(n);
  const elevation = new Float32Array(n);
  const temperature = new Float32Array(n);
  const moisture = new Float32Array(n);
  const fertility = new Float32Array(n);
  const resources = new Uint8Array(n);
  const river = new Uint8Array(n);
  const owner = new Int16Array(n).fill(-1);
  const population = new Float32Array(n);
  const city = new Int16Array(n).fill(-1);
  const deposits = new Float32Array(n);

  const scale = 4.5 / Math.max(width, height); // base noise frequency

  // Continent cores: N landmasses kept apart by rejection sampling, so worlds
  // get real oceans between real continents instead of a single pangea.
  const continentCount =
    config.continents && config.continents > 0 ? Math.min(6, Math.round(config.continents)) : rng.nextInt(2, 5);
  // Radius chosen so total land area stays ~30% of the map regardless of count
  // (the steep mask falloff means land only reaches ~0.55 of the blob radius).
  const baseR = 1.75 * Math.sqrt((0.33 * width * height) / (Math.PI * continentCount));
  const minSep = baseR * 1.45; // centers this far apart -> tails rarely bridge
  // Each plate gets a drift vector — collisions raise mountain chains,
  // mid-ocean boundaries raise island arcs (plate-tectonics-lite).
  const blobs: { x: number; y: number; r: number; dx: number; dy: number }[] = [];
  for (let i = 0; i < continentCount; i++) {
    const drift = rng.range(0, Math.PI * 2);
    let placed = false;
    for (let attempt = 0; attempt < 80 && !placed; attempt++) {
      const x = rng.range(0.16, 0.84) * width;
      const y = rng.range(0.16, 0.84) * height;
      let ok = true;
      for (const b of blobs) {
        if (Math.hypot(x - b.x, y - b.y) < minSep) {
          ok = false;
          break;
        }
      }
      if (ok) {
        blobs.push({ x, y, r: baseR * rng.range(0.75, 1.2), dx: Math.cos(drift), dy: Math.sin(drift) });
        placed = true;
      }
    }
    // Crowded map: place anyway (still deterministic), slightly smaller.
    if (!placed) {
      blobs.push({
        x: rng.range(0.2, 0.8) * width,
        y: rng.range(0.2, 0.8) * height,
        r: baseR * 0.6,
        dx: Math.cos(drift),
        dy: Math.sin(drift),
      });
    }
  }

  const seaLevel = config.seaLevel;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // Domain-warped elevation
      const wx = fbm(seedNum + 777, x * scale * 2, y * scale * 2, 3) - 0.5;
      const wy = fbm(seedNum + 1555, x * scale * 2, y * scale * 2, 3) - 0.5;
      let e = fbm(seedNum, (x + wx * 30) * scale, (y + wy * 30) * scale, 5);

      // Blob mask: steep falloff keeps continents from bleeding into bridges
      let mask = 0;
      for (const b of blobs) {
        const dx = (x - b.x) / b.r;
        const dy = (y - b.y) / b.r;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1.4) mask = Math.max(mask, Math.pow(Math.max(0, 1 - d / 1.4), 1.35));
      }
      // Edge falloff keeps oceans at map borders
      const ex = Math.min(x, width - 1 - x) / (width * 0.5);
      const ey = Math.min(y, height - 1 - y) / (height * 0.5);
      const edge = Math.min(1, Math.min(ex, ey) * 3.2);

      e = e * 0.44 + mask * 0.56;
      e *= 0.35 + 0.65 * edge;

      // Plate tectonics-lite: where two plates' influence zones meet and their
      // drift vectors converge, the crust buckles upward — mountain chains on
      // land, island arcs at sea.
      if (blobs.length >= 2) {
        let d1 = Infinity;
        let d2 = Infinity;
        let b1 = blobs[0];
        let b2 = blobs[0];
        for (const b of blobs) {
          const d = Math.hypot(x - b.x, y - b.y) / b.r;
          if (d < d1) {
            d2 = d1;
            b2 = b1;
            d1 = d;
            b1 = b;
          } else if (d < d2) {
            d2 = d;
            b2 = b;
          }
        }
        const boundary = Math.exp(-((d2 - d1) * (d2 - d1)) / 0.045); // 1 at the seam
        if (boundary > 0.05 && b1 !== b2) {
          const nx = b2.x - b1.x;
          const ny = b2.y - b1.y;
          const nl = Math.hypot(nx, ny) || 1;
          const convergence = ((b1.dx - b2.dx) * nx + (b1.dy - b2.dy) * ny) / nl; // >0: colliding
          if (convergence > 0) {
            const ridge = fbm(seedNum + 8181, x * scale * 4, y * scale * 4, 3);
            e += boundary * convergence * 0.34 * (0.55 + ridge * 0.9);
          }
        }
      }
      elevation[i] = Math.min(1.05, e);
    }
  }

  // ---- Atmospheric circulation & precipitation (reduced-order, real bands) ----
  // Insolation temperature: T(°C) = 28 - 42·sin^1.6(|lat|), minus a lapse-rate
  // cooling of ~6.5°C/km for land above sea level (mapped 0..4 km).
  const tempC = new Float32Array(n);
  for (let y = 0; y < height; y++) {
    const latAbs = Math.abs(y / height - 0.5) * 2; // 0 equator .. 1 pole
    const base = 30 - 38 * Math.pow(Math.sin((latAbs * Math.PI) / 2), 1.5);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const kmAbove = (Math.max(0, elevation[i] - seaLevel) / Math.max(0.001, 1 - seaLevel)) * 2.5;
      tempC[i] = base - kmAbove * 6.5 + (fbm(seedNum + 3333, x * scale * 3, y * scale * 3, 3) - 0.5) * 4;
    }
  }

  // Prevailing winds by latitude (trade easterlies <30°, westerlies 30-60°,
  // polar easterlies >60°). March each row along the wind, evaporating over
  // ocean and raining out over land — uphill forcing gives orographic rain
  // and a rain shadow behind mountains.
  const precip = new Float32Array(n); // mm/yr
  for (let y = 0; y < height; y++) {
    const latAbs = Math.abs(y / height - 0.5) * 2;
    const westerly = latAbs > 0.33 && latAbs <= 0.66; // wind blows west->east
    let humidity = 12;
    const xs: number[] = [];
    for (let x = 0; x < width; x++) xs.push(westerly ? x : width - 1 - x);
    for (const x of xs) {
      const i = y * width + x;
      if (elevation[i] < seaLevel) {
        // Evaporation grows with sea-surface temperature.
        humidity = Math.min(60, humidity + Math.max(0.5, 0.11 * (tempC[i] + 14)));
        precip[i] = Math.min(2200, humidity * 22);
      } else {
        const prevX = westerly ? x - 1 : x + 1;
        const prevI = prevX >= 0 && prevX < width ? y * width + prevX : i;
        const uphill = Math.max(0, elevation[i] - elevation[prevI]);
        const rainFrac = Math.min(0.3, 0.055 + uphill * 2.2); // orographic forcing
        const rain = humidity * rainFrac;
        precip[i] = Math.min(2600, rain * 320);
        // Evapotranspiration recycles a share of rainfall back into the air —
        // without it, continental interiors turn to total desert.
        humidity = Math.max(0.5, humidity - rain * 0.62);
      }
    }
  }

  // Normalize temperature/moisture into the 0..1 arrays the engine uses.
  for (let i = 0; i < n; i++) {
    temperature[i] = Math.max(0, Math.min(1, (tempC[i] + 25) / 55)); // -25..30°C -> 0..1
    moisture[i] = Math.max(0, Math.min(1, precip[i] / 1800));
  }

  // Rivers: trace downhill from high-elevation sources; boost moisture along path.
  const riverCount = Math.floor((width * height) / 2200);
  const sources: number[] = [];
  for (let i = 0; i < n; i++) if (elevation[i] > seaLevel + 0.28) sources.push(i);
  for (let r = 0; r < riverCount && sources.length > 0; r++) {
    let idx = sources[rng.nextInt(0, sources.length - 1)];
    for (let step = 0; step < 300; step++) {
      river[idx] = 1;
      moisture[idx] = Math.min(1, moisture[idx] + 0.25);
      const x = idx % width;
      const y = Math.floor(idx / width);
      // Move to the lowest neighbor
      let best = idx;
      let bestE = elevation[idx];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (elevation[ni] < bestE) {
            bestE = elevation[ni];
            best = ni;
          }
        }
      }
      if (best === idx || elevation[best] < seaLevel) break; // reached a pit or the sea
      idx = best;
    }
  }

  // Classify terrain (Whittaker biome diagram: temperature x precipitation)
  // and derive fertility from the Miami NPP model (Lieth 1975):
  //   NPP_T = 3000 / (1 + e^(1.315 - 0.119 T))
  //   NPP_P = 3000 · (1 - e^(-0.000664 P))
  //   NPP   = min(NPP_T, NPP_P)   [g dry matter / m² / yr]
  const rich = config.resourceRichness;
  for (let i = 0; i < n; i++) {
    const e = elevation[i];
    const tC = temperature[i] * 55 - 25; // back to °C
    const pMm = moisture[i] * 1800; // back to mm/yr
    let terr: Terrain;
    if (e < seaLevel) terr = 'ocean';
    else if (e > seaLevel + 0.34) terr = 'mountain';
    else if (tC < -4) terr = 'tundra';
    else if (pMm < 320 && tC > 12) terr = 'desert';
    else if (pMm < 220) terr = tC > 5 ? 'desert' : 'tundra';
    else if (pMm > 780 && tC > 2) terr = 'forest';
    else terr = 'plains';
    terrain[i] = TERRAIN_INDEX[terr];

    // Miami-model NPP -> fertility
    const nppT = 3000 / (1 + Math.exp(1.315 - 0.119 * tC));
    const nppP = 3000 * (1 - Math.exp(-0.000664 * pMm));
    const npp = Math.min(nppT, nppP) / 3000; // 0..1
    let f = Math.pow(npp, 0.8) * (terr === 'mountain' ? 0.35 : terr === 'ocean' ? 0 : 1.05);
    if (river[i] && terr !== 'ocean') f = Math.min(1, f + 0.22); // floodplain silt
    fertility[i] = Math.max(0, Math.min(1, f));

    // Resources — deterministic per tile, no RNG-order dependence.
    const tileRoll = latticeValue(seedNum + 9999, i % width, Math.floor(i / width));
    const tileRoll2 = latticeValue(seedNum + 12345, i % width, Math.floor(i / width));
    let bits = 0;
    const boost = 0.5 + rich * 0.5;
    switch (terr) {
      case 'plains':
        if (tileRoll < 0.55 * boost) bits |= RESOURCE_BIT.food;
        if (tileRoll2 < 0.2 * boost) bits |= RESOURCE_BIT.wood;
        if (tileRoll2 > 1 - 0.06 * boost) bits |= RESOURCE_BIT.stone;
        break;
      case 'forest':
        if (tileRoll < 0.6 * boost) bits |= RESOURCE_BIT.wood;
        if (tileRoll2 < 0.25 * boost) bits |= RESOURCE_BIT.food;
        break;
      case 'mountain':
        if (tileRoll < 0.5 * boost) bits |= RESOURCE_BIT.stone;
        if (tileRoll2 < 0.35 * boost) bits |= RESOURCE_BIT.iron;
        if (tileRoll > 1 - 0.08 * boost) bits |= RESOURCE_BIT.gold;
        break;
      case 'desert':
        if (tileRoll < 0.18 * boost) bits |= RESOURCE_BIT.gold;
        if (tileRoll2 < 0.08 * boost) bits |= RESOURCE_BIT.iron;
        break;
      case 'tundra':
        if (tileRoll < 0.15 * boost) bits |= RESOURCE_BIT.food;
        if (tileRoll2 < 0.12 * boost) bits |= RESOURCE_BIT.iron;
        break;
      case 'ocean':
        if (tileRoll < 0.12 * boost) bits |= RESOURCE_BIT.food; // fisheries
        break;
    }
    resources[i] = bits;
    // Finite reserves: how much a mine holds / how healthy a forest is.
    deposits[i] = 0.7 + latticeValue(seedNum + 5150, i % width, Math.floor(i / width)) * 0.6;
  }

  return { width, height, terrain, elevation, temperature, moisture, fertility, resources, river, owner, population, city, deposits };
}

export function terrainName(index: number): Terrain {
  return TERRAINS[index];
}

/** Find deterministic, mutually-distant, livable starting tiles for civs. */
export function findStartLocations(map: WorldMap, count: number, rng: SeededRandom): number[] {
  const { width, height, terrain, fertility } = map;
  const n = width * height;
  const candidates: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = terrain[i];
    if ((t === TERRAIN_INDEX.plains || t === TERRAIN_INDEX.forest) && fertility[i] > 0.5) {
      candidates.push(i);
    }
  }
  // Relax if the world is harsh
  if (candidates.length < count * 10) {
    for (let i = 0; i < n; i++) {
      if (terrain[i] !== TERRAIN_INDEX.ocean && fertility[i] > 0.2 && !candidates.includes(i)) candidates.push(i);
    }
  }
  rng.shuffle(candidates);

  const picked: number[] = [];
  const minDist = Math.max(8, Math.floor(Math.min(width, height) / (count * 0.55)));
  for (const c of candidates) {
    if (picked.length >= count) break;
    const cx = c % width;
    const cy = Math.floor(c / width);
    let ok = true;
    for (const p of picked) {
      const px = p % width;
      const py = Math.floor(p / width);
      const d = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
      if (d < minDist) {
        ok = false;
        break;
      }
    }
    if (ok) picked.push(c);
  }
  // Fill remaining without distance requirement (extreme seeds)
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}
