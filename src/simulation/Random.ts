// Deterministic seeded PRNG. Math.random() is forbidden inside the simulation.
//
// Implementation: xmur3 string hash -> sfc32 generator.
// A fresh SeededRandom derived from (worldSeed, year) is used for each simulated
// year, so any snapshot resumed at year N continues identically to a full run.

export function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class SeededRandom {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | string) {
    const s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    // Expand one 32-bit seed into four state words via splitmix-ish scrambling.
    this.a = s ^ 0x9e3779b9;
    this.b = (s ^ 0x85ebca6b) >>> 0;
    this.c = (s ^ 0xc2b2ae35) >>> 0;
    this.d = (s ^ 0x27d4eb2f) >>> 0;
    // Warm up so poor seeds decorrelate.
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    const t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    const r = (t + this.d) | 0;
    this.c = (this.c + r) | 0;
    return (r >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Deterministic in-place shuffle. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }
}

/** RNG for a specific simulated year of a world — the backbone of determinism. */
export function yearRng(seed: string, year: number): SeededRandom {
  return new SeededRandom(`${seed}::year::${year}`);
}

/** RNG for a named subsystem (map generation, naming, ...). */
export function subRng(seed: string, label: string): SeededRandom {
  return new SeededRandom(`${seed}::${label}`);
}
