// Close-up detail layer: procedural buildings, trees, terrain texture, and
// animated "little people". Pure rendering — none of this touches the
// simulation; everything is derived deterministically from world state.
import { MapStatic, Snapshot, TradeRoute } from '../simulation/types';
import {
  arrowSprite,
  blit,
  carSprite,
  civilianSprite,
  explosionSprite,
  fallenSprite,
  firePuff,
  flagSprite,
  muzzleFlash,
  planeSprite,
  powderSmoke,
  smokePuff,
  soldierSprite,
} from './spriteAtlas';

/** Detail-layer pixels per tile: full 8px for normal maps, 4px for huge ones
 * (a 600-tile map at 8px would need a 4800² canvas — too much GPU memory). */
export function detailPxFor(width: number): number {
  return width > 320 ? 4 : 8;
}
export const DETAIL_PX = 8; // layout math base for buildings

export const TERRAIN_RGB: [number, number, number][] = [
  [16, 32, 54], // ocean
  [96, 122, 70], // plains
  [52, 88, 54], // forest
  [172, 146, 92], // desert
  [110, 104, 100], // mountain
  [172, 182, 186], // tundra
];

/** Hillshaded terrain base layer (1px/tile) — shared by map and planet views. */
export function buildTerrainCanvas(map: MapStatic): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = map.width;
  c.height = map.height;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(map.width, map.height);
  const W = map.width;
  const H = map.height;
  const elev = map.elevation;
  // Sea level: everything below it is ocean, so land elevation is measured
  // from the waterline upward for hypsometric tinting.
  let seaLevel = 1;
  for (let i = 0; i < map.terrain.length; i++) {
    if (map.terrain[i] !== 0 && elev[i] < seaLevel) seaLevel = elev[i];
  }
  for (let i = 0; i < map.terrain.length; i++) {
    const t = map.terrain[i];
    let [r, g, b] = TERRAIN_RGB[t];
    const e = elev[i];
    // Hypsometric tint: lowlands keep their biome colour, highlands dry into
    // rock-browns and greys, the highest ridges whiten toward snow.
    if (t !== 0) {
      const h = Math.max(0, Math.min(1, (e - seaLevel) / (1 - seaLevel)));
      if (h > 0.45) {
        const rock = Math.min(1, (h - 0.45) / 0.35);
        r = r + (139 - r) * rock * 0.75;
        g = g + (126 - g) * rock * 0.75;
        b = b + (112 - b) * rock * 0.75;
      }
      if (h > 0.78) {
        const snow = Math.min(1, (h - 0.78) / 0.22);
        r = r + (238 - r) * snow;
        g = g + (242 - g) * snow;
        b = b + (246 - b) * snow;
      }
    }
    let shade = t === 0 ? 0.75 + e * 0.5 : 0.66 + e * 0.62;
    if (t !== 0) {
      const x = i % W;
      const yy = (i / W) | 0;
      const eL = x > 0 ? elev[i - 1] : e;
      const eR = x < W - 1 ? elev[i + 1] : e;
      const eU = yy > 0 ? elev[i - W] : e;
      const eD = yy < H - 1 ? elev[i + W] : e;
      const slope = eL - eR + (eU - eD);
      shade *= Math.max(0.5, Math.min(1.55, 1 + slope * 8.5));
    }
    r = Math.min(255, r * shade);
    g = Math.min(255, g * shade);
    b = Math.min(255, b * shade);
    if (map.river[i] && t !== 0) {
      r = r * 0.55 + 40;
      g = g * 0.6 + 60;
      b = b * 0.4 + 110;
    }
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** One full visual season cycle (spring→winter) in wall-clock milliseconds. */
export const SEASON_YEAR_MS = 48000;

/**
 * Season masks, precomputed once per map:
 * - snow: white, alpha = how readily this tile takes winter snow (cold and/or high)
 * - autumn: amber, alpha on deciduous forest tiles
 * Drawn per-frame with hemisphere-opposed seasonal opacity (visual layer only —
 * the simulation itself ticks in whole years and is untouched).
 */
export function buildSeasonMasks(map: MapStatic): { snow: HTMLCanvasElement; autumn: HTMLCanvasElement } {
  const mk = (): [HTMLCanvasElement, ImageData, CanvasRenderingContext2D] => {
    const c = document.createElement('canvas');
    c.width = map.width;
    c.height = map.height;
    const ctx = c.getContext('2d')!;
    return [c, ctx.createImageData(map.width, map.height), ctx];
  };
  const [snowC, snowImg, snowCtx] = mk();
  const [autC, autImg, autCtx] = mk();
  for (let i = 0; i < map.terrain.length; i++) {
    const t = map.terrain[i];
    if (t === 0) continue;
    // Snow susceptibility: cold latitudes and high ridges whiten first.
    const cold = Math.max(0, 0.52 - map.temperature[i]) * 2.6;
    const high = Math.max(0, map.elevation[i] - 0.72) * 2.2;
    const s = Math.min(1, cold + high);
    if (s > 0.04) {
      snowImg.data[i * 4] = 235;
      snowImg.data[i * 4 + 1] = 240;
      snowImg.data[i * 4 + 2] = 248;
      snowImg.data[i * 4 + 3] = Math.round(s * 235);
    }
    // Deciduous turn: temperate forest goes amber; tropical forest stays green.
    if (t === 2 && map.temperature[i] < 0.72) {
      autImg.data[i * 4] = 205;
      autImg.data[i * 4 + 1] = 132;
      autImg.data[i * 4 + 2] = 48;
      autImg.data[i * 4 + 3] = 215;
    }
  }
  snowCtx.putImageData(snowImg, 0, 0);
  autCtx.putImageData(autImg, 0, 0);
  return { snow: snowC, autumn: autC };
}

/** Cheap deterministic hash -> [0,1) for visual placement. */
function h2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------- Static terrain detail (built once per map) ----------

export function buildDetailCanvas(map: MapStatic): HTMLCanvasElement {
  const P = detailPxFor(map.width);
  const c = document.createElement('canvas');
  c.width = map.width * P;
  c.height = map.height * P;
  const ctx = c.getContext('2d')!;
  if (P !== DETAIL_PX) ctx.scale(P / DETAIL_PX, P / DETAIL_PX);
  const P8 = DETAIL_PX;

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const i = ty * map.width + tx;
      const terr = map.terrain[i];
      const ox = tx * P8;
      const oy = ty * P8;
      const r1 = h2(i, 1);
      const r2 = h2(i, 2);
      const r3 = h2(i, 3);

      if (terr === 2) {
        // Forest: 2-3 little conifers
        const n = 2 + (r3 > 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const x = ox + 1 + h2(i, 10 + k) * (P8 - 3);
          const y = oy + 2 + h2(i, 20 + k) * (P8 - 4);
          const s = 1.6 + h2(i, 30 + k) * 1.3;
          ctx.fillStyle = 'rgba(10, 14, 20, 0.18)';
          ctx.beginPath();
          ctx.ellipse(x + s * 0.35, y + s * 0.75, s * 0.9, s * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = k % 2 ? 'rgba(30, 62, 36, 0.9)' : 'rgba(40, 78, 44, 0.9)';
          ctx.beginPath();
          ctx.moveTo(x, y - s * 1.6);
          ctx.lineTo(x - s, y + s * 0.6);
          ctx.lineTo(x + s, y + s * 0.6);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(58, 42, 26, 0.85)';
          ctx.fillRect(x - 0.4, y + s * 0.6, 0.9, 1.1);
        }
      } else if (terr === 4) {
        // Mountain: peak rises with elevation, casts a base shadow
        const x = ox + P8 / 2 + (r1 - 0.5) * 2;
        const y = oy + P8 / 2 + 1;
        const s = 2.4 + r2 * 1.6 + Math.max(0, map.elevation[i] - 0.75) * 6;
        ctx.fillStyle = 'rgba(10, 14, 20, 0.22)';
        ctx.beginPath();
        ctx.ellipse(x + s * 0.3, y + s * 0.72, s * 1.05, s * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(88, 84, 82, 0.95)';
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x - s, y + s * 0.7);
        ctx.lineTo(x + s, y + s * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(228, 232, 238, 0.9)';
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x - s * 0.32, y - s * 0.35);
        ctx.lineTo(x + s * 0.32, y - s * 0.35);
        ctx.closePath();
        ctx.fill();
      } else if (terr === 1) {
        // Plains: grass flecks
        ctx.strokeStyle = 'rgba(64, 96, 44, 0.5)';
        ctx.lineWidth = 0.6;
        for (let k = 0; k < 3; k++) {
          const x = ox + 1 + h2(i, 40 + k) * (P8 - 2);
          const y = oy + 1 + h2(i, 50 + k) * (P8 - 2);
          ctx.beginPath();
          ctx.moveTo(x, y + 1);
          ctx.lineTo(x + 0.6, y - 0.6);
          ctx.stroke();
        }
      } else if (terr === 3) {
        // Desert: dune arcs
        ctx.strokeStyle = 'rgba(140, 112, 66, 0.4)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(ox + P8 / 2 + (r1 - 0.5) * 3, oy + P8 / 2 + (r2 - 0.5) * 3, 1.6 + r3, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();
      } else if (terr === 5 && r1 > 0.6) {
        // Tundra: sparse white flecks
        ctx.fillStyle = 'rgba(230, 236, 240, 0.5)';
        ctx.fillRect(ox + r2 * (P8 - 1), oy + r3 * (P8 - 1), 1, 1);
      } else if (terr === 0 && r1 > 0.8) {
        // Ocean: faint wave dashes
        ctx.strokeStyle = 'rgba(120, 170, 220, 0.18)';
        ctx.lineWidth = 0.7;
        const x = ox + r2 * (P8 - 3);
        const y = oy + r3 * (P8 - 1);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 1.5, y - 0.8, x + 3, y);
        ctx.stroke();
      }
      // Rivers: ripple line
      if (map.river[i] && terr !== 0) {
        ctx.strokeStyle = 'rgba(90, 150, 220, 0.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(ox + 1, oy + P8 / 2 + (r1 - 0.5) * 2);
        ctx.quadraticCurveTo(ox + P8 / 2, oy + P8 / 2 + (r2 - 0.5) * 3, ox + P8 - 1, oy + P8 / 2 + (r3 - 0.5) * 2);
        ctx.stroke();
      }
    }
  }
  return c;
}

/** Darken/lighten a #rrggbb color. */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// ---------- Buildings (rebuilt when the cities change) ----------

interface BuildingStyle {
  wall: string;
  roof: string;
  tall: boolean;
  chimney: boolean;
  timber: boolean; // medieval half-timbered facade
  glass: boolean; // modern curtain-wall facade
}

function eraStyle(tech: number, k: number): BuildingStyle {
  // tech = number of researched technologies (of ~47)
  if (tech <= 10) {
    return { wall: k % 2 ? '#8a6a44' : '#7d5f3c', roof: '#5d4226', tall: false, chimney: false, timber: false, glass: false };
  }
  if (tech <= 22) {
    // medieval: whitewashed plaster crossed with dark oak beams
    return { wall: k % 2 ? '#cbb897' : '#bfab8a', roof: k % 3 ? '#6e4a2e' : '#7d3f34', tall: false, chimney: k % 4 === 0, timber: true, glass: false };
  }
  if (tech <= 30) {
    return { wall: k % 2 ? '#8a6250' : '#7c5847', roof: '#4a4643', tall: false, chimney: true, timber: false, glass: false };
  }
  return { wall: k % 2 ? '#9fb2c8' : '#8fa4bd', roof: '#c8d6e8', tall: true, chimney: false, timber: false, glass: true };
}

export function citySignature(snapshot: Snapshot): string {
  return snapshot.cities
    .map((c) => {
      const owner = snapshot.civs.find((cv) => cv.id === c.ownerId);
      return `${c.id}:${c.level}:${owner?.technologyLevel ?? 0}`;
    })
    .join('|');
}

// Road network of the latest built world, in tile coordinates — cars drive on
// it every frame. Rebuilt together with the buildings canvas.
export interface RoadSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  era: 0 | 1 | 2; // 0 dirt, 1 paved stone, 2 asphalt highway
  civIdx: number;
}
let ROAD_SEGS: RoadSeg[] = [];
export function getRoadSegs(): RoadSeg[] {
  return ROAD_SEGS;
}

/** Fraction of sample points along a segment that are ocean. */
function oceanFrac(map: MapStatic, x1: number, y1: number, x2: number, y2: number): number {
  let sea = 0;
  const N = 24;
  for (let s = 0; s <= N; s++) {
    const x = Math.round(x1 + ((x2 - x1) * s) / N);
    const y = Math.round(y1 + ((y2 - y1) * s) / N);
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 1;
    if (map.terrain[y * map.width + x] === 0) sea++;
  }
  return sea / (N + 1);
}

export function buildBuildingsCanvas(map: MapStatic, snapshot: Snapshot): HTMLCanvasElement {
  // Buildings are drawn at 2x supersampling so facades stay crisp at
  // street-level zoom; layout math stays in DETAIL_PX coordinates.
  const ss = map.width > 320 ? 1 : 2; // supersample small maps only
  const px = detailPxFor(map.width);
  const c = document.createElement('canvas');
  c.width = map.width * px * ss;
  c.height = map.height * px * ss;
  const ctx = c.getContext('2d')!;
  ctx.scale((px * ss) / DETAIL_PX, (px * ss) / DETAIL_PX);
  const P = DETAIL_PX;

  // ---- Roads: each nation links its cities once it knows how ----
  ROAD_SEGS = [];
  for (let ci = 0; ci < snapshot.civs.length; ci++) {
    const civ = snapshot.civs[ci];
    if (!civ.alive) continue;
    const techs = civ.researchedTechs;
    const hasWheel = techs.includes('wheel');
    if (!hasWheel) continue;
    const era: 0 | 1 | 2 = techs.includes('internal-combustion') ? 2 : techs.includes('roads') ? 1 : 0;
    const cities = snapshot.cities.filter((ct) => ct.ownerId === civ.id);
    if (cities.length < 2) continue;
    // Chain each city to its nearest already-linked city (tiny spanning tree).
    const linked = [cities[0]];
    for (let k = 1; k < cities.length; k++) {
      const next = cities[k];
      let best = linked[0];
      let bd = Infinity;
      for (const L of linked) {
        const d = (L.x - next.x) ** 2 + (L.y - next.y) ** 2;
        if (d < bd) {
          bd = d;
          best = L;
        }
      }
      linked.push(next);
      if (bd > 70 * 70) continue; // don't span half the world
      if (oceanFrac(map, best.x, best.y, next.x, next.y) > 0.12) continue;
      ROAD_SEGS.push({ x1: best.x + 0.5, y1: best.y + 0.5, x2: next.x + 0.5, y2: next.y + 0.5, era, civIdx: ci });
    }
  }
  // Paint the roads under the buildings.
  for (const seg of ROAD_SEGS) {
    const x1 = seg.x1 * P;
    const y1 = seg.y1 * P;
    const x2 = seg.x2 * P;
    const y2 = seg.y2 * P;
    if (seg.era === 2) {
      ctx.strokeStyle = 'rgba(52, 56, 62, 0.9)';
      ctx.lineWidth = 1.7;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(235, 220, 130, 0.75)'; // painted center line
      ctx.lineWidth = 0.25;
      ctx.setLineDash([1.4, 1.4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (seg.era === 1) {
      ctx.strokeStyle = 'rgba(148, 138, 120, 0.8)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(128, 104, 74, 0.7)';
      ctx.lineWidth = 0.9;
      ctx.setLineDash([2.2, 1.6]); // rutted dirt track
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ---- Farmland: tilled fields ring every settlement on fertile ground ----
  for (const city of snapshot.cities) {
    const owner = snapshot.civs.find((cv) => cv.id === city.ownerId);
    if (!owner?.alive || !owner.researchedTechs.includes('agriculture')) continue;
    const seed = parseInt(city.id.slice(5), 10) * 11 + 5;
    const R = city.level === 'capital' || city.level === 'city' ? 4 : 3;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const r2 = dx * dx + dy * dy;
        if (r2 < 4 || r2 > R * R) continue; // ring outside the buildings
        const tx = city.x + dx;
        const ty = city.y + dy;
        if (tx < 1 || ty < 1 || tx >= map.width - 1 || ty >= map.height - 1) continue;
        const ti = ty * map.width + tx;
        if (map.terrain[ti] !== 1 || map.fertility[ti] < 0.42) continue;
        if (h2(seed, ti) > 0.55) continue; // patchwork, not carpet
        const fx = tx * P;
        const fy = ty * P;
        // field base: a warm tilled tone over the terrain
        const warm = h2(seed, ti + 1);
        ctx.fillStyle = `rgba(${150 + warm * 40 | 0}, ${125 + warm * 30 | 0}, 62, 0.5)`;
        ctx.fillRect(fx + 0.5, fy + 0.5, P - 1, P - 1);
        // furrows: parallel plough lines, orientation varies per field
        ctx.strokeStyle = 'rgba(96, 78, 44, 0.55)';
        ctx.lineWidth = 0.3;
        const vertical = h2(seed, ti + 2) > 0.5;
        ctx.beginPath();
        for (let f = 1; f < 5; f++) {
          const o = (f / 5) * (P - 1);
          if (vertical) {
            ctx.moveTo(fx + 0.5 + o, fy + 0.7);
            ctx.lineTo(fx + 0.5 + o, fy + P - 0.7);
          } else {
            ctx.moveTo(fx + 0.7, fy + 0.5 + o);
            ctx.lineTo(fx + P - 0.7, fy + 0.5 + o);
          }
        }
        ctx.stroke();
        // the odd haystack
        if (h2(seed, ti + 3) < 0.18) {
          ctx.fillStyle = '#c9a648';
          ctx.beginPath();
          ctx.arc(fx + P * (0.25 + h2(seed, ti + 4) * 0.5), fy + P * (0.3 + h2(seed, ti + 5) * 0.4), 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  for (const city of snapshot.cities) {
    const owner = snapshot.civs.find((cv) => cv.id === city.ownerId);
    if (!owner?.alive) continue;
    const tech = owner.technologyLevel;
    const cx = (city.x + 0.5) * P;
    const cy = (city.y + 0.5) * P;
    const count = city.level === 'capital' ? 16 : city.level === 'city' ? 13 : city.level === 'town' ? 8 : 4;
    const spread = city.level === 'capital' ? 2.2 : city.level === 'city' ? 1.9 : city.level === 'town' ? 1.4 : 0.9;
    const seed = parseInt(city.id.slice(5), 10) * 7 + 13;

    // Walls for major settlements (pre-industrial look for old eras, ring road later)
    if (city.level === 'capital' || city.level === 'city') {
      ctx.strokeStyle = tech <= 26 ? 'rgba(120, 110, 96, 0.85)' : 'rgba(140, 155, 175, 0.6)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, spread * P * 0.95, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Buildings ring the center — collected first, then painted back-to-front
    // (y-sorted) in 2.5D cabinet projection: front face + darker side + roof.
    const plots: { bx: number; by: number; k: number }[] = [];
    for (let k = 0; k < count; k++) {
      const ang = h2(seed, k) * Math.PI * 2;
      const dist = (0.25 + h2(seed, 100 + k) * 0.75) * spread * P * 0.8;
      plots.push({ bx: cx + Math.cos(ang) * dist, by: cy + Math.sin(ang) * dist, k });
    }
    plots.sort((a, b) => a.by - b.by);
    for (const { bx, by, k } of plots) {
      const st = eraStyle(tech, k);
      const w = st.tall ? 2.2 + h2(seed, 200 + k) * 1.4 : 2.6 + h2(seed, 200 + k) * 2;
      const hgt = st.tall ? 4.5 + h2(seed, 300 + k) * 5 : 2.2 + h2(seed, 300 + k) * 1.6;
      const d = Math.min(1.5, w * 0.42); // extrusion depth toward upper-right

      // Ground shadow
      ctx.fillStyle = 'rgba(10, 14, 20, 0.28)';
      ctx.beginPath();
      ctx.ellipse(bx + w * 0.18, by + 0.5, w * 0.78, w * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Side face (right, in shadow)
      ctx.fillStyle = shade(st.wall, 0.62);
      ctx.beginPath();
      ctx.moveTo(bx + w / 2, by);
      ctx.lineTo(bx + w / 2 + d, by - d * 0.6);
      ctx.lineTo(bx + w / 2 + d, by - hgt - d * 0.6);
      ctx.lineTo(bx + w / 2, by - hgt);
      ctx.closePath();
      ctx.fill();

      // Front face
      ctx.fillStyle = st.wall;
      ctx.fillRect(bx - w / 2, by - hgt, w, hgt);

      // Medieval half-timbering: dark oak beams over the plaster.
      if (st.timber) {
        ctx.strokeStyle = 'rgba(74, 56, 36, 0.85)';
        ctx.lineWidth = 0.28;
        ctx.beginPath();
        ctx.moveTo(bx - w / 2, by - hgt * 0.55);
        ctx.lineTo(bx + w / 2, by - hgt * 0.55); // jetty beam
        ctx.moveTo(bx - w / 2 + 0.2, by - hgt);
        ctx.lineTo(bx - w / 2 + 0.2, by);
        ctx.moveTo(bx + w / 2 - 0.2, by - hgt);
        ctx.lineTo(bx + w / 2 - 0.2, by);
        ctx.moveTo(bx - w / 2, by); // diagonal brace
        ctx.lineTo(bx + w / 2, by - hgt * 0.55);
        ctx.stroke();
      }

      if (st.tall) {
        // Flat rooftop (lit top face)
        ctx.fillStyle = shade(st.roof, 1.12);
        ctx.beginPath();
        ctx.moveTo(bx - w / 2, by - hgt);
        ctx.lineTo(bx + w / 2, by - hgt);
        ctx.lineTo(bx + w / 2 + d, by - hgt - d * 0.6);
        ctx.lineTo(bx - w / 2 + d, by - hgt - d * 0.6);
        ctx.closePath();
        ctx.fill();
        if (st.glass) {
          // Curtain wall: a cool glass sheen, then a full window grid —
          // most windows lit, some dark, so towers stop looking painted-on.
          ctx.fillStyle = 'rgba(150, 190, 225, 0.3)';
          ctx.fillRect(bx - w / 2 + 0.15, by - hgt + 0.15, w - 0.3, hgt - 0.3);
          for (let wy = by - hgt + 0.7; wy < by - 0.8; wy += 1.1) {
            for (let wx = bx - w / 2 + 0.35; wx < bx + w / 2 - 0.5; wx += 0.95) {
              const lit = h2(Math.round(wx * 7), Math.round(wy * 7)) < 0.62;
              ctx.fillStyle = lit ? 'rgba(255, 236, 160, 0.9)' : 'rgba(24, 32, 44, 0.75)';
              ctx.fillRect(wx, wy, 0.6, 0.7);
            }
          }
          // rooftop water tank or AC block on some towers
          if (k % 3 === 0) {
            ctx.fillStyle = '#78828e';
            ctx.fillRect(bx - 0.9, by - hgt - d * 0.6 - 0.9, 1.3, 0.9);
          }
        } else {
          ctx.fillStyle = 'rgba(255, 236, 160, 0.85)';
          for (let wy = by - hgt + 1; wy < by - 1; wy += 1.6) {
            ctx.fillRect(bx - w / 2 + 0.5, wy, 0.7, 0.7);
            ctx.fillRect(bx - w / 2 + 1.6, wy, 0.7, 0.7);
          }
        }
        // Antenna
        ctx.strokeStyle = 'rgba(200, 214, 232, 0.8)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(bx + d * 0.5, by - hgt - d * 0.6);
        ctx.lineTo(bx + d * 0.5, by - hgt - d * 0.6 - 1.6);
        ctx.stroke();
      } else {
        // Masonry courses / plank lines give the facade material grain.
        ctx.strokeStyle = 'rgba(30, 24, 18, 0.16)';
        ctx.lineWidth = 0.16;
        ctx.beginPath();
        for (let ly = by - hgt + 0.7; ly < by - 0.4; ly += 0.66) {
          ctx.moveTo(bx - w / 2 + 0.14, ly);
          ctx.lineTo(bx + w / 2 - 0.14, ly);
        }
        ctx.stroke();
        // door + two framed, lamplit windows
        ctx.fillStyle = 'rgba(40, 28, 18, 0.92)';
        ctx.fillRect(bx - 0.55, by - 1.7, 1.1, 1.7);
        for (const wxo of [-w * 0.27, w * 0.27]) {
          ctx.fillStyle = '#2b2018';
          ctx.fillRect(bx + wxo - 0.55, by - hgt * 0.64 - 0.55, 1.1, 1.1);
          ctx.fillStyle = 'rgba(255, 220, 130, 0.85)';
          ctx.fillRect(bx + wxo - 0.38, by - hgt * 0.64 - 0.38, 0.76, 0.76);
        }
        // Pitched roof: lit front slope + shadowed side slope
        ctx.fillStyle = st.roof;
        ctx.beginPath();
        ctx.moveTo(bx - w / 2 - 0.4, by - hgt);
        ctx.lineTo(bx + w / 2 + 0.4, by - hgt);
        ctx.lineTo(bx, by - hgt - 1.8);
        ctx.closePath();
        ctx.fill();
        // roof tile courses running up the slope
        ctx.strokeStyle = 'rgba(24, 16, 12, 0.28)';
        ctx.lineWidth = 0.16;
        ctx.beginPath();
        for (let rr2 = 1; rr2 <= 2; rr2++) {
          const f2 = rr2 / 3;
          ctx.moveTo(bx - (w / 2 + 0.4) * (1 - f2), by - hgt - 1.8 * f2);
          ctx.lineTo(bx + (w / 2 + 0.4) * (1 - f2), by - hgt - 1.8 * f2);
        }
        ctx.stroke();
        ctx.fillStyle = shade(st.roof, 0.7);
        ctx.beginPath();
        ctx.moveTo(bx + w / 2 + 0.4, by - hgt);
        ctx.lineTo(bx + w / 2 + 0.4 + d * 0.8, by - hgt - d * 0.5);
        ctx.lineTo(bx + d * 0.8, by - hgt - 1.8 - d * 0.5);
        ctx.lineTo(bx, by - hgt - 1.8);
        ctx.closePath();
        ctx.fill();
        if (st.chimney) {
          ctx.fillStyle = '#3c3a38';
          ctx.fillRect(bx + w / 2 - 0.8, by - hgt - 2.6, 0.9, 2.6);
          ctx.fillStyle = '#55504c';
          ctx.fillRect(bx + w / 2 - 0.95, by - hgt - 2.9, 1.2, 0.45);
        }
      }
    }

    // Medieval towns raise a church: stone tower, steep spire, a cross.
    if (tech > 10 && tech <= 22 && city.level !== 'village') {
      const chx = cx + (h2(seed, 900) - 0.5) * spread * P * 0.7;
      const chy = cy + (h2(seed, 901) - 0.5) * spread * P * 0.7;
      ctx.fillStyle = 'rgba(10, 14, 20, 0.3)';
      ctx.beginPath();
      ctx.ellipse(chx + 0.4, chy + 0.5, 2.6, 1, 0, 0, Math.PI * 2);
      ctx.fill();
      // nave
      ctx.fillStyle = '#a99f8e';
      ctx.fillRect(chx - 2.2, chy - 2.6, 3.4, 2.6);
      ctx.fillStyle = '#6e4a2e';
      ctx.beginPath();
      ctx.moveTo(chx - 2.5, chy - 2.6);
      ctx.lineTo(chx + 1.5, chy - 2.6);
      ctx.lineTo(chx - 0.5, chy - 3.8);
      ctx.closePath();
      ctx.fill();
      // bell tower + spire
      ctx.fillStyle = '#b5ab99';
      ctx.fillRect(chx + 1.3, chy - 4.6, 1.6, 4.6);
      ctx.fillStyle = shade('#b5ab99', 0.62);
      ctx.fillRect(chx + 2.9, chy - 4.6, 0.5, 4.6);
      ctx.fillStyle = '#54687d';
      ctx.beginPath();
      ctx.moveTo(chx + 1.0, chy - 4.6);
      ctx.lineTo(chx + 3.6, chy - 4.6);
      ctx.lineTo(chx + 2.15, chy - 7.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e8c25a';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(chx + 2.15, chy - 7.4);
      ctx.lineTo(chx + 2.15, chy - 8.3);
      ctx.moveTo(chx + 1.75, chy - 7.95);
      ctx.lineTo(chx + 2.55, chy - 7.95);
      ctx.stroke();
      // arched doorway + lancet window
      ctx.fillStyle = 'rgba(40, 32, 24, 0.9)';
      ctx.fillRect(chx - 0.9, chy - 1.1, 0.8, 1.1);
      ctx.fillStyle = 'rgba(255, 220, 130, 0.75)';
      ctx.fillRect(chx + 1.85, chy - 3.6, 0.5, 0.9);
    }

    // Central landmark for capitals: golden-roofed hall + banner
    if (city.level === 'capital') {
      ctx.fillStyle = 'rgba(10, 14, 20, 0.3)';
      ctx.beginPath();
      ctx.ellipse(cx + 0.8, cy + 0.6, 4.4, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      const hallWall = tech > 9 ? '#b8c9de' : '#a08a5c';
      ctx.fillStyle = shade(hallWall, 0.6);
      ctx.beginPath();
      ctx.moveTo(cx + 2.6, cy);
      ctx.lineTo(cx + 4.0, cy - 0.9);
      ctx.lineTo(cx + 4.0, cy - 5.3);
      ctx.lineTo(cx + 2.6, cy - 4.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = hallWall;
      ctx.fillRect(cx - 2.6, cy - 4.4, 5.2, 4.4);
      ctx.fillStyle = '#e8c25a';
      ctx.beginPath();
      ctx.moveTo(cx - 3.2, cy - 4.4);
      ctx.lineTo(cx + 3.2, cy - 4.4);
      ctx.lineTo(cx, cy - 7.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = owner.color;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7.2);
      ctx.lineTo(cx, cy - 9.4);
      ctx.stroke();
      ctx.fillStyle = owner.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 9.4);
      ctx.lineTo(cx + 2.4, cy - 8.7);
      ctx.lineTo(cx, cy - 8);
      ctx.closePath();
      ctx.fill();
    }
  }
  return c;
}

// ---------- Little people (drawn every frame at close zoom) ----------

interface View {
  x: number;
  y: number;
  scale: number;
}

export function drawWalkers(
  ctx: CanvasRenderingContext2D,
  v: View,
  rectW: number,
  rectH: number,
  snapshot: Snapshot,
  map: MapStatic,
  timeMs: number,
): void {
  const t = timeMs / 1000;
  const minTx = Math.max(0, Math.floor(-v.x / v.scale));
  const minTy = Math.max(0, Math.floor(-v.y / v.scale));
  const maxTx = Math.min(map.width - 1, Math.ceil((rectW - v.x) / v.scale));
  const maxTy = Math.min(map.height - 1, Math.ceil((rectH - v.y) / v.scale));
  const span = (maxTx - minTx + 1) * (maxTy - minTy + 1);
  const stride = span > 2400 ? Math.ceil(Math.sqrt(span / 2400)) : 1;
  let drawn = 0;

  for (let ty = minTy; ty <= maxTy && drawn < 420; ty += stride) {
    for (let tx = minTx; tx <= maxTx && drawn < 420; tx += stride) {
      const i = ty * map.width + tx;
      const pop = snapshot.population[i];
      if (pop < 150) continue;
      const owner = snapshot.owner[i];
      const color = owner >= 0 ? snapshot.civs[owner]?.color ?? '#ddd' : '#bbb';
      const n = pop > 4000 ? 3 : pop > 900 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const ph = h2(i, k) * 10;
        // People walk purposeful straight lanes (streets), not drifting orbits:
        // each figure patrols between two points, pausing briefly at the ends.
        const horiz = h2(i, k + 23) > 0.5;
        const laneOff = 0.22 + h2(i, k + 29) * 0.56;
        const span = 0.5 + h2(i, k + 31) * 0.36;
        const speed = 0.055 + h2(i, k + 7) * 0.06; // lane cycles per second
        const idle = h2(i, k + 47) < 0.22; // some folk just stand and talk
        const cyc = (t * speed + ph) % 1;
        let m = cyc < 0.5 ? cyc * 2 : (1 - cyc) * 2;
        m = Math.min(1, Math.max(0, m * 1.3 - 0.15)); // flat spots = pauses at each end
        if (idle) m = 0.5 + Math.sin(t * 0.7 + ph * 3) * 0.015; // sway in place
        const moving = !idle && m > 0.015 && m < 0.985;
        const dir = cyc < 0.5 ? 1 : -1;
        const along = 0.5 - span / 2 + span * m;
        const wx = horiz ? along : laneOff;
        const wy = horiz ? laneOff : along;
        // Pre-rendered citizen sprite: role, walk frame, garments in the
        // nation's dye. Detail was paid at atlas build time.
        const roleR = h2(i, k + 41);
        const role = roleR < 0.14 ? 3 : roleR < 0.3 ? 1 : roleR < 0.45 ? 2 : 0;
        const hpx = Math.min(22, Math.max(4.5, v.scale * 0.52)) * (0.9 + h2(i, k + 43) * 0.24);
        const frame = moving ? Math.floor((t * 5.4 + ph * 11) % 4) : 0;
        const px = v.x + (tx + wx) * v.scale;
        const py = v.y + (ty + wy) * v.scale;
        const flip = horiz ? dir < 0 : h2(i, k + 61) < 0.5;
        ctx.fillStyle = 'rgba(8, 10, 16, 0.3)';
        ctx.beginPath();
        ctx.ellipse(px + hpx * 0.05, py + hpx * 0.05, hpx * 0.24, hpx * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        blit(ctx, civilianSprite(role, frame, color), px, py, hpx, { flip });
        drawn++;
      }
    }
  }
}

export function drawCaravans(
  ctx: CanvasRenderingContext2D,
  v: View,
  routes: TradeRoute[],
  civs: Snapshot['civs'],
  map: MapStatic,
  timeMs: number,
): void {
  const t = timeMs / 1000;
  let idx = 0;
  for (const route of routes.slice(0, 24)) {
    idx++;
    const a = civs.find((c) => c.id === route.fromId);
    const b = civs.find((c) => c.id === route.toId);
    if (!a?.alive || !b?.alive) continue;
    for (let k = 0; k < 2; k++) {
      const f = (t * 0.045 + idx * 0.37 + k * 0.5) % 1;
      const fx = a.cx + (b.cx - a.cx) * f;
      const fy = a.cy + (b.cy - a.cy) * f;
      const px = v.x + fx * v.scale;
      const py = v.y + fy * v.scale;
      // Heading of travel (ships and carts face where they're going).
      const heading = Math.atan2(b.cy - a.cy, b.cx - a.cx);
      const tx = Math.max(0, Math.min(map.width - 1, Math.round(fx)));
      const ty = Math.max(0, Math.min(map.height - 1, Math.round(fy)));
      const atSea = map.terrain[ty * map.width + tx] === 0;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(heading);
      if (atSea) {
        // Top-down square-rigger: pointed hull, deck, two yards with sails, wake.
        const s = Math.max(2.6, v.scale * 0.26);
        // Wake: two diverging trails + stern foam
        ctx.strokeStyle = 'rgba(190, 220, 248, 0.28)';
        ctx.lineWidth = Math.max(0.8, s * 0.14);
        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0);
        ctx.lineTo(-s * 3.4, -s * 0.55);
        ctx.moveTo(-s * 1.1, 0);
        ctx.lineTo(-s * 3.4, s * 0.55);
        ctx.stroke();
        // Hull: leaf shape with bow at +x
        ctx.fillStyle = '#5d4226';
        ctx.beginPath();
        ctx.moveTo(s * 1.3, 0);
        ctx.quadraticCurveTo(s * 0.5, -s * 0.5, -s * 1.05, -s * 0.34);
        ctx.quadraticCurveTo(-s * 1.3, 0, -s * 1.05, s * 0.34);
        ctx.quadraticCurveTo(s * 0.5, s * 0.5, s * 1.3, 0);
        ctx.closePath();
        ctx.fill();
        // Deck stripe
        ctx.fillStyle = '#8a6a44';
        ctx.beginPath();
        ctx.moveTo(s * 1.0, 0);
        ctx.quadraticCurveTo(s * 0.4, -s * 0.3, -s * 0.85, -s * 0.2);
        ctx.quadraticCurveTo(-s * 1.02, 0, -s * 0.85, s * 0.2);
        ctx.quadraticCurveTo(s * 0.4, s * 0.3, s * 1.0, 0);
        ctx.closePath();
        ctx.fill();
        // Two square sails (billowed toward the stern) on yard lines
        for (const mx of [s * 0.45, -s * 0.35]) {
          ctx.strokeStyle = 'rgba(60, 44, 26, 0.9)';
          ctx.lineWidth = Math.max(0.6, s * 0.08);
          ctx.beginPath();
          ctx.moveTo(mx, -s * 0.62);
          ctx.lineTo(mx, s * 0.62);
          ctx.stroke();
          ctx.fillStyle = 'rgba(240, 238, 228, 0.96)';
          ctx.beginPath();
          ctx.moveTo(mx, -s * 0.58);
          ctx.quadraticCurveTo(mx - s * 0.42, 0, mx, s * 0.58);
          ctx.quadraticCurveTo(mx - s * 0.18, 0, mx, -s * 0.58);
          ctx.closePath();
          ctx.fill();
        }
        // Bow foam
        ctx.fillStyle = 'rgba(210, 232, 250, 0.5)';
        ctx.beginPath();
        ctx.arc(s * 1.35, 0, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Land caravan: covered wagon with wheels and a draft animal.
        const s2 = Math.max(1.8, v.scale * 0.18);
        ctx.fillStyle = 'rgba(30, 24, 16, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, s2 * 0.5, s2 * 1.3, s2 * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        // wheels
        ctx.fillStyle = '#3c2f1e';
        ctx.beginPath();
        ctx.arc(-s2 * 0.55, -s2 * 0.5, s2 * 0.28, 0, Math.PI * 2);
        ctx.arc(-s2 * 0.55, s2 * 0.5, s2 * 0.28, 0, Math.PI * 2);
        ctx.fill();
        // wagon body + canvas cover
        ctx.fillStyle = '#7a5a34';
        ctx.fillRect(-s2 * 1.1, -s2 * 0.42, s2 * 1.4, s2 * 0.84);
        ctx.fillStyle = 'rgba(238, 232, 214, 0.95)';
        ctx.fillRect(-s2 * 0.95, -s2 * 0.34, s2 * 1.05, s2 * 0.68);
        // draft animal
        ctx.fillStyle = '#6e5136';
        ctx.beginPath();
        ctx.ellipse(s2 * 0.85, 0, s2 * 0.34, s2 * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/** Skirmishing soldiers along burning war fronts. */
/** Cars drive the asphalt highways of motorized nations, every frame. */
export function drawCars(
  ctx: CanvasRenderingContext2D,
  v: View,
  rectW: number,
  rectH: number,
  civs: Snapshot['civs'],
  timeMs: number,
): void {
  const t = timeMs / 1000;
  const segs = ROAD_SEGS;
  let drawn = 0;
  const size = Math.min(3.6, Math.max(1.6, v.scale * 0.22));
  for (let si = 0; si < segs.length && drawn < 44; si++) {
    const seg = segs[si];
    if (seg.era !== 2) continue;
    if (!civs[seg.civIdx]?.alive) continue;
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    if (len < 2) continue;
    const heading = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
    const nCars = Math.min(3, 1 + Math.floor(len / 14));
    for (let k = 0; k < nCars * 2 && drawn < 44; k++) {
      const dirBack = k % 2 === 1; // both directions of traffic
      const speed = 0.05 + h2(si, k + 3) * 0.03;
      let u = (t * speed + h2(si, k) * 7) % 1;
      if (dirBack) u = 1 - u;
      // offset each direction to its own lane
      const laneOff = (dirBack ? -1 : 1) * 0.09;
      const px = v.x + (seg.x1 + (seg.x2 - seg.x1) * u + Math.cos(heading + Math.PI / 2) * laneOff) * v.scale;
      const py = v.y + (seg.y1 + (seg.y2 - seg.y1) * u + Math.sin(heading + Math.PI / 2) * laneOff) * v.scale;
      if (px < -8 || py < -8 || px > rectW + 8 || py > rectH + 8) continue;
      blit(ctx, carSprite(Math.floor(h2(si, k + 11) * 5)), px, py, size * 1.15, {
        rot: heading + (dirBack ? Math.PI : 0),
      });
      drawn++;
    }
  }
}

/** Aircraft cruise between the cities of nations that have learned to fly. */
export function drawPlanes(
  ctx: CanvasRenderingContext2D,
  v: View,
  rectW: number,
  rectH: number,
  snapshot: Snapshot,
  timeMs: number,
): void {
  const t = timeMs / 1000;
  let drawn = 0;
  for (let ci = 0; ci < snapshot.civs.length && drawn < 10; ci++) {
    const civ = snapshot.civs[ci];
    if (!civ.alive || !civ.researchedTechs.includes('flight')) continue;
    const cities = snapshot.cities.filter((ct) => ct.ownerId === civ.id);
    if (cities.length < 2) continue;
    const nRoutes = Math.min(2, cities.length - 1);
    for (let r = 0; r < nRoutes && drawn < 10; r++) {
      const a = cities[r];
      const b = cities[(r + 1) % cities.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 8) continue;
      const u = (t * 0.022 + h2(ci, r) * 5) % 1;
      const fx = a.x + (b.x - a.x) * u + 0.5;
      const fy = a.y + (b.y - a.y) * u + 0.5;
      const px = v.x + fx * v.scale;
      const py = v.y + fy * v.scale;
      if (px < -30 || py < -30 || px > rectW + 30 || py > rectH + 30) continue;
      const heading = Math.atan2(b.y - a.y, b.x - a.x);
      const hpx = Math.min(30, Math.max(10, v.scale * 0.85));
      // ground shadow, offset by "altitude"
      ctx.save();
      ctx.translate(px + hpx * 0.55, py + hpx * 0.8);
      ctx.rotate(heading);
      ctx.fillStyle = 'rgba(8, 10, 14, 0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 0, hpx * 0.4, hpx * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // twin engine contrails
      const perpX = -Math.sin(heading);
      const perpY = Math.cos(heading);
      for (const sside of [-1, 1]) {
        const ox = perpX * sside * hpx * 0.17;
        const oy = perpY * sside * hpx * 0.17;
        for (let ci = 1; ci <= 5; ci++) {
          const back = hpx * (0.45 + ci * 0.34);
          blit(ctx, powderSmoke(), px - Math.cos(heading) * back + ox, py - Math.sin(heading) * back + oy, hpx * (0.16 + ci * 0.07), { alpha: 0.4 * (1 - ci / 6) });
        }
      }
      blit(ctx, planeSprite(civ.color), px, py, hpx, { rot: heading });
      drawn++;
    }
  }
}

export function drawFrontFighters(
  ctx: CanvasRenderingContext2D,
  v: View,
  rectW: number,
  rectH: number,
  frontTiles: number[],
  map: MapStatic,
  snapshot: Snapshot,
  timeMs: number,
): void {
  const t = timeMs / 1000;
  const hpx = Math.min(26, Math.max(7, v.scale * 0.58)); // soldier sprite height
  const W = map.width;
  let drawn = 0;
  const step = Math.max(1, Math.floor(frontTiles.length / 48));
  ctx.save();
  ctx.imageSmoothingEnabled = true;

  for (let f = 0; f < frontTiles.length && drawn < 48; f += step) {
    const i = frontTiles[f];
    const tx = i % W;
    const ty = Math.floor(i / W);
    const px = v.x + (tx + 0.5) * v.scale;
    const py = v.y + (ty + 0.5) * v.scale;
    if (px < -20 || py < -20 || px > rectW + 20 || py > rectH + 20) continue;
    const o = snapshot.owner[i];
    if (o < 0) continue;
    let ndx = 1;
    let ndy = 0;
    let enemy = -1;
    const neigh: [number, number, number][] = [
      [tx < W - 1 ? snapshot.owner[i + 1] : -1, 1, 0],
      [ty < map.height - 1 ? snapshot.owner[i + W] : -1, 0, 1],
      [tx > 0 ? snapshot.owner[i - 1] : -1, -1, 0],
      [ty > 0 ? snapshot.owner[i - W] : -1, 0, -1],
    ];
    for (const [other, dx, dy] of neigh) {
      if (other >= 0 && other !== o) {
        enemy = other;
        ndx = dx;
        ndy = dy;
        break;
      }
    }
    const cA = snapshot.civs[o]?.color ?? '#e5484d';
    const cB = enemy >= 0 ? snapshot.civs[enemy]?.color ?? '#8a8a8a' : '#8a8a8a';
    const techA = snapshot.civs[o]?.researchedTechs.length ?? 0;
    const techB = enemy >= 0 ? snapshot.civs[enemy]?.researchedTechs.length ?? 0 : 0;
    const era = Math.max(techA, techB) >= 27 ? 2 : Math.max(techA, techB) >= 16 ? 1 : 0;
    const ph = h2(i, 3) * 10;
    const sc = v.scale;

    // --- Scorched ground + guttering fires ---
    ctx.fillStyle = 'rgba(20, 12, 8, 0.32)';
    ctx.beginPath();
    ctx.ellipse(px, py, sc * 0.44, sc * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let fi = 0; fi < 2; fi++) {
      const flick = 0.75 + Math.sin(t * 9 + ph * 7 + fi * 2.6) * 0.25;
      blit(ctx, firePuff(),
        px + (h2(i, 11 + fi) - 0.5) * sc * 0.6,
        py + (h2(i, 13 + fi) - 0.5) * sc * 0.45,
        hpx * 0.55 * flick, { alpha: 0.8 });
    }

    // --- The fallen ---
    if (h2(i, 17) < 0.45) {
      blit(ctx, fallenSprite(h2(i, 18) < 0.5 ? cA : cB),
        px + (h2(i, 19) - 0.5) * sc * 0.5,
        py + sc * 0.2,
        hpx * 0.34, { rot: (h2(i, 20) - 0.5) * 0.9, alpha: 0.92 });
    }

    // --- Two ranks face each other across the line ---
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1; // side 0 = this tile's owner
      const col = side === 0 ? cA : cB;
      const baseX = px + ndx * sgn * sc * 0.3;
      const baseY = py + ndy * sgn * sc * 0.3;
      for (let j = 0; j < 2; j++) {
        const jx = baseX + -ndy * (j - 0.5) * sc * 0.42 + (h2(i, 23 + side * 4 + j) - 0.5) * sc * 0.1;
        const jy = baseY + ndx * (j - 0.5) * sc * 0.42 + (h2(i, 27 + side * 4 + j) - 0.5) * sc * 0.1;
        const cyc = (t * 1.35 + h2(i, 31 + side * 3 + j) * 3 + side * 0.7) % 1;
        const frame = cyc < 0.55 ? 0 : cyc < 0.78 ? 1 : 2;
        const enemyX = px + ndx * -sgn * sc * 0.3;
        const flip = enemyX < jx - 0.01 || (Math.abs(ndx) < 0.01 && side === 1);
        const lungeK = frame === 1 ? sc * 0.06 : 0;
        const sx2 = jx + ndx * -sgn * lungeK;
        const sy2 = jy + ndy * -sgn * lungeK + hpx * 0.5;
        ctx.fillStyle = 'rgba(8, 10, 16, 0.32)';
        ctx.beginPath();
        ctx.ellipse(sx2, sy2 + 1, hpx * 0.26, hpx * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        blit(ctx, soldierSprite(era, frame, col), sx2, sy2, hpx, { flip });
        // Firearms: muzzle flash on the attack frame, then drifting smoke.
        if (era >= 1) {
          const fire = (t * 0.5 + h2(i, 37 + side * 3 + j)) % 1;
          const mx = sx2 + (flip ? -1 : 1) * hpx * 0.62;
          const my = sy2 - hpx * (era === 2 ? 0.28 : 0.4);
          if (fire < 0.05) {
            blit(ctx, muzzleFlash(), mx, my, hpx * 0.5, { flip });
          } else if (fire < 0.55) {
            const age = (fire - 0.05) / 0.5;
            blit(ctx, powderSmoke(),
              mx + (flip ? -1 : 1) * age * hpx * 0.4,
              my - age * hpx * 0.8,
              hpx * (0.3 + age * 0.55), { alpha: 0.55 * (1 - age) });
          }
        }
      }
    }

    // --- Era projectiles ---
    if (era === 0) {
      for (let a = 0; a < 2; a++) {
        const u = (t * 0.65 + h2(i, 41 + a) + a * 0.5) % 1;
        const from = a % 2 === 0 ? -1 : 1;
        const ax = px + ndx * from * sc * (0.34 - 0.68 * u) + -ndy * (h2(i, 43 + a) - 0.5) * sc * 0.3;
        const ay = py + ndy * from * sc * (0.34 - 0.68 * u) + ndx * (h2(i, 45 + a) - 0.5) * sc * 0.3
          - Math.sin(Math.PI * u) * sc * 0.34 - hpx * 0.3;
        const vx = ndx * -from;
        const vy = ndy * -from - Math.cos(Math.PI * u) * 0.9;
        blit(ctx, arrowSprite(), ax, ay, hpx * 0.16, { rot: Math.atan2(vy, vx) });
      }
    } else if (era === 2) {
      for (let a = 0; a < 2; a++) {
        const u = (t * 2.6 + h2(i, 47 + a)) % 1;
        const from = a % 2 === 0 ? -1 : 1;
        const ax = px + ndx * from * sc * (0.3 - 0.6 * u);
        const ay = py + ndy * from * sc * (0.3 - 0.6 * u) - hpx * 0.2;
        ctx.strokeStyle = `rgba(255, 210, 120, ${0.85 - u * 0.4})`;
        ctx.lineWidth = Math.max(0.7, hpx * 0.05);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - ndx * from * hpx * 0.5, ay - ndy * from * hpx * 0.5);
        ctx.stroke();
      }
      const boom = (t * 0.3 + h2(i, 49)) % 1;
      if (boom < 0.3) {
        const bframe = boom < 0.06 ? 0 : boom < 0.18 ? 1 : 2;
        blit(ctx, explosionSprite(bframe),
          px + (h2(i, 51) - 0.5) * sc * 0.6,
          py + (h2(i, 52) - 0.5) * sc * 0.4 - hpx * 0.2,
          hpx * (0.9 + boom * 1.6), { alpha: 1 - boom * 2.2 });
      }
    }

    // --- Smoke column off the burning line ---
    for (let p = 0; p < 3; p++) {
      const age = (t * 0.15 + p / 3 + ph) % 1;
      blit(ctx, smokePuff(),
        px + (h2(i, 53 + p) - 0.5) * sc * 0.5 + Math.sin(t * 0.8 + p * 2.1 + ph) * sc * 0.06 * age,
        py - age * sc * 0.95 - hpx * 0.3,
        hpx * (0.35 + age * 0.85), { alpha: 0.5 * (1 - age) });
    }

    // --- A battle standard every few scenes ---
    if (h2(i, 59) < 0.3) {
      const fframe = Math.floor((t * 2.2 + ph) % 3);
      blit(ctx, flagSprite(cA, fframe),
        px - ndy * sc * 0.4 - ndx * sc * 0.36,
        py + ndx * sc * 0.4 - ndy * sc * 0.36 + hpx * 0.5,
        hpx * 1.35);
    }

    drawn++;
  }
  ctx.restore();
}
