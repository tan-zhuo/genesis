// Close-up detail layer: procedural buildings, trees, terrain texture, and
// animated "little people". Pure rendering — none of this touches the
// simulation; everything is derived deterministically from world state.
import { MapStatic, Snapshot, TradeRoute } from '../simulation/types';

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
  for (let i = 0; i < map.terrain.length; i++) {
    const t = map.terrain[i];
    let [r, g, b] = TERRAIN_RGB[t];
    const e = elev[i];
    let shade = t === 0 ? 0.75 + e * 0.5 : 0.72 + e * 0.55;
    if (t !== 0) {
      const x = i % W;
      const yy = (i / W) | 0;
      const eL = x > 0 ? elev[i - 1] : e;
      const eR = x < W - 1 ? elev[i + 1] : e;
      const eU = yy > 0 ? elev[i - W] : e;
      const eD = yy < H - 1 ? elev[i + W] : e;
      const slope = eL - eR + (eU - eD);
      shade *= Math.max(0.62, Math.min(1.38, 1 + slope * 5.5));
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
}

function eraStyle(tech: number, k: number): BuildingStyle {
  // tech = number of researched technologies (of ~37)
  if (tech <= 10) {
    return { wall: k % 2 ? '#8a6a44' : '#7d5f3c', roof: '#5d4226', tall: false, chimney: false };
  }
  if (tech <= 22) {
    return { wall: k % 2 ? '#9a938a' : '#8b847a', roof: '#6e4a34', tall: false, chimney: false };
  }
  if (tech <= 30) {
    return { wall: k % 2 ? '#7a7570' : '#6b6560', roof: '#4a4643', tall: false, chimney: true };
  }
  return { wall: k % 2 ? '#9fb2c8' : '#8fa4bd', roof: '#c8d6e8', tall: true, chimney: false };
}

export function citySignature(snapshot: Snapshot): string {
  return snapshot.cities
    .map((c) => {
      const owner = snapshot.civs.find((cv) => cv.id === c.ownerId);
      return `${c.id}:${c.level}:${owner?.technologyLevel ?? 0}`;
    })
    .join('|');
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
        // Windows
        ctx.fillStyle = 'rgba(255, 236, 160, 0.85)';
        for (let wy = by - hgt + 1; wy < by - 1; wy += 1.6) {
          ctx.fillRect(bx - w / 2 + 0.5, wy, 0.7, 0.7);
          ctx.fillRect(bx - w / 2 + 1.6, wy, 0.7, 0.7);
        }
        // Antenna
        ctx.strokeStyle = 'rgba(200, 214, 232, 0.8)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(bx + d * 0.5, by - hgt - d * 0.6);
        ctx.lineTo(bx + d * 0.5, by - hgt - d * 0.6 - 1.6);
        ctx.stroke();
      } else {
        // Pitched roof: lit front slope + shadowed side slope
        ctx.fillStyle = st.roof;
        ctx.beginPath();
        ctx.moveTo(bx - w / 2 - 0.4, by - hgt);
        ctx.lineTo(bx + w / 2 + 0.4, by - hgt);
        ctx.lineTo(bx, by - hgt - 1.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = shade(st.roof, 0.7);
        ctx.beginPath();
        ctx.moveTo(bx + w / 2 + 0.4, by - hgt);
        ctx.lineTo(bx + w / 2 + 0.4 + d * 0.8, by - hgt - d * 0.5);
        ctx.lineTo(bx + d * 0.8, by - hgt - 1.8 - d * 0.5);
        ctx.lineTo(bx, by - hgt - 1.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 220, 130, 0.8)';
        ctx.fillRect(bx - 0.5, by - hgt / 2 - 0.5, 1, 1);
        if (st.chimney) {
          ctx.fillStyle = '#3c3a38';
          ctx.fillRect(bx + w / 2 - 0.8, by - hgt - 2.6, 0.9, 2.6);
        }
      }
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
  const size = Math.min(4.2, v.scale * 0.3);

  for (let ty = minTy; ty <= maxTy && drawn < 420; ty += stride) {
    for (let tx = minTx; tx <= maxTx && drawn < 420; tx += stride) {
      const i = ty * map.width + tx;
      const pop = snapshot.population[i];
      if (pop < 150) continue;
      const owner = snapshot.owner[i];
      const color = owner >= 0 ? snapshot.civs[owner]?.color ?? '#ddd' : '#bbb';
      const n = pop > 4000 ? 3 : pop > 900 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const phase = h2(i, k) * Math.PI * 2;
        const speed = 0.25 + h2(i, k + 7) * 0.35;
        const rx = 0.28 + h2(i, k + 13) * 0.16;
        const ry = 0.22 + h2(i, k + 17) * 0.16;
        const px = v.x + (tx + 0.5 + Math.sin(t * speed + phase) * rx) * v.scale;
        const py = v.y + (ty + 0.5 + Math.cos(t * speed * 0.8 + phase * 1.7) * ry) * v.scale;
        // ground shadow
        ctx.fillStyle = 'rgba(8, 10, 16, 0.3)';
        ctx.beginPath();
        ctx.ellipse(px + size * 0.1, py + size * 0.55, size * 0.42, size * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        // body
        ctx.fillStyle = color;
        ctx.fillRect(px - size * 0.28, py - size * 0.5, size * 0.56, size);
        // head
        ctx.fillStyle = '#e8d3b5';
        ctx.beginPath();
        ctx.arc(px, py - size * 0.75, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
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
  const size = Math.min(4.4, v.scale * 0.32);
  let drawn = 0;
  for (let f = 0; f < frontTiles.length && drawn < 80; f += Math.max(1, Math.floor(frontTiles.length / 80))) {
    const i = frontTiles[f];
    const tx = i % map.width;
    const ty = Math.floor(i / map.width);
    const px = v.x + (tx + 0.5) * v.scale;
    const py = v.y + (ty + 0.5) * v.scale;
    if (px < -10 || py < -10 || px > rectW + 10 || py > rectH + 10) continue;
    const owner = snapshot.owner[i];
    const color = owner >= 0 ? snapshot.civs[owner]?.color ?? '#e5484d' : '#e5484d';
    const lunge = Math.sin(t * 6 + i) * 0.12 * v.scale;
    // two clashing soldiers
    ctx.fillStyle = color;
    ctx.fillRect(px - v.scale * 0.22 + lunge - size * 0.3, py - size * 0.5, size * 0.55, size);
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(px + v.scale * 0.22 - lunge - size * 0.3, py - size * 0.5, size * 0.55, size);
    // clash sparkle
    if (Math.sin(t * 6 + i) > 0.86) {
      ctx.fillStyle = 'rgba(255, 245, 200, 0.95)';
      ctx.beginPath();
      ctx.arc(px, py - size * 0.3, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    drawn++;
  }
}
