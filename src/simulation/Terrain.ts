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

  // Continent centers: a few seeded blobs pull land together.
  const blobCount = rng.nextInt(2, 4);
  const blobs: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < blobCount; i++) {
    blobs.push({
      x: rng.range(0.22, 0.78) * width,
      y: rng.range(0.22, 0.78) * height,
      r: rng.range(0.28, 0.45) * Math.min(width, height),
    });
  }

  const seaLevel = config.seaLevel;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // Domain-warped elevation
      const wx = fbm(seedNum + 777, x * scale * 2, y * scale * 2, 3) - 0.5;
      const wy = fbm(seedNum + 1555, x * scale * 2, y * scale * 2, 3) - 0.5;
      let e = fbm(seedNum, (x + wx * 30) * scale, (y + wy * 30) * scale, 5);

      // Blob mask: distance to nearest continent center
      let mask = 0;
      for (const b of blobs) {
        const dx = (x - b.x) / b.r;
        const dy = (y - b.y) / b.r;
        const d = Math.sqrt(dx * dx + dy * dy);
        mask = Math.max(mask, 1 - d);
      }
      // Edge falloff keeps oceans at map borders
      const ex = Math.min(x, width - 1 - x) / (width * 0.5);
      const ey = Math.min(y, height - 1 - y) / (height * 0.5);
      const edge = Math.min(1, Math.min(ex, ey) * 3.2);

      e = e * 0.55 + mask * 0.45;
      e *= 0.35 + 0.65 * edge;
      elevation[i] = e;

      // Temperature: latitude bands + elevation cooling + noise
      const lat = Math.abs(y / height - 0.5) * 2; // 0 equator .. 1 pole
      let t = 1 - lat * 1.15;
      t -= Math.max(0, e - seaLevel) * 0.9;
      t += (fbm(seedNum + 3333, x * scale * 3, y * scale * 3, 3) - 0.5) * 0.25;
      temperature[i] = Math.max(0, Math.min(1, t));

      // Moisture
      let m = fbm(seedNum + 4444, x * scale * 2.2, y * scale * 2.2, 4);
      m = m * 0.85 + (1 - Math.abs(lat - 0.35)) * 0.15;
      moisture[i] = Math.max(0, Math.min(1, m));
    }
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

  // Classify terrain + fertility + resources
  const rich = config.resourceRichness;
  for (let i = 0; i < n; i++) {
    const e = elevation[i];
    const t = temperature[i];
    const m = moisture[i];
    let terr: Terrain;
    if (e < seaLevel) terr = 'ocean';
    else if (e > seaLevel + 0.34) terr = 'mountain';
    else if (t < 0.22) terr = 'tundra';
    else if (m < 0.34 && t > 0.55) terr = 'desert';
    else if (m > 0.58) terr = 'forest';
    else terr = 'plains';
    terrain[i] = TERRAIN_INDEX[terr];

    // Fertility
    let f = 0;
    if (terr === 'plains') f = 0.55 + m * 0.4;
    else if (terr === 'forest') f = 0.45 + m * 0.3;
    else if (terr === 'tundra') f = 0.12 + m * 0.1;
    else if (terr === 'desert') f = 0.08 + m * 0.15;
    else if (terr === 'mountain') f = 0.1;
    if (river[i] && terr !== 'ocean') f = Math.min(1, f + 0.25);
    f *= 0.8 + 0.4 * (1 - Math.abs(t - 0.6));
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
