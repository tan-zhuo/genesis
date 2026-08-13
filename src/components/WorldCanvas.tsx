// The world map: Canvas 2D rendering with pan/zoom, map modes, hover,
// selection, and lightweight animations for wars, trade, and events.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapMode, Universe, useSimulatorStore } from '../state/simulatorStore';
import { MapStatic, Snapshot, WorldEvent } from '../simulation/types';
import { TERRAINS } from '../simulation/types';
import { useT } from '../i18n';
import { Landmark, ZoomIn } from 'lucide-react';
import { GOD_TOOLS } from './GodToolbar';
import {
  buildBuildingsCanvas,
  buildDetailCanvas,
  citySignature,
  drawCaravans,
  drawFrontFighters,
  drawWalkers,
} from './mapDetail';

const TERRAIN_COLORS: [number, number, number][] = [
  [16, 32, 54], // ocean
  [96, 122, 70], // plains
  [52, 88, 54], // forest
  [172, 146, 92], // desert
  [110, 104, 100], // mountain
  [172, 182, 186], // tundra
];

const RESOURCE_COLORS: Record<number, [number, number, number]> = {
  1: [120, 200, 90], // food
  2: [160, 116, 60], // wood
  4: [150, 150, 160], // stone
  8: [200, 120, 120], // iron
  16: [240, 200, 70], // gold
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface ViewTransform {
  x: number; // pan offset in screen px
  y: number;
  scale: number; // screen px per tile
}

interface Props {
  universe: Universe;
}

export function WorldCanvas({ universe }: Props): JSX.Element {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const warFrontCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lightsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const buildingsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const buildingsSigRef = useRef<string>('');
  const warFrontTilesRef = useRef<number[]>([]);
  const targetViewRef = useRef<ViewTransform | null>(null);
  const viewRef = useRef<ViewTransform>({ x: 0, y: 0, scale: 3 });
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean; pointerId: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const eventAnimRef = useRef<{ event: WorldEvent; bornAt: number }[]>([]);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const mapMode = useSimulatorStore((s) => s.mapMode);
  const selectedCivId = useSimulatorStore((s) => s.selectedCivId);
  const selectedTile = useSimulatorStore((s) => s.selectedTile);
  const focusTile = useSimulatorStore((s) => s.focusTile);
  const selectCiv = useSimulatorStore((s) => s.selectCiv);
  const selectCity = useSimulatorStore((s) => s.selectCity);
  const selectTile = useSimulatorStore((s) => s.selectTile);
  const setInspectorTab = useSimulatorStore((s) => s.setInspectorTab);
  const godTool = useSimulatorStore((s) => s.godTool);
  const intervene = useSimulatorStore((s) => s.intervene);
  const cinema = useSimulatorStore((s) => s.cinema);
  const cinemaRef = useRef(cinema);
  useEffect(() => {
    cinemaRef.current = cinema;
  }, [cinema]);
  const godToolRef = useRef(godTool);
  const hoverTileRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    godToolRef.current = godTool;
  }, [godTool]);

  const { mapStatic, snapshot } = universe;

  // --- Terrain base layer: rendered once per map ---
  useEffect(() => {
    if (!mapStatic) return;
    const c = document.createElement('canvas');
    c.width = mapStatic.width;
    c.height = mapStatic.height;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(mapStatic.width, mapStatic.height);
    const W = mapStatic.width;
    const H = mapStatic.height;
    const elev = mapStatic.elevation;
    for (let i = 0; i < mapStatic.terrain.length; i++) {
      const t = mapStatic.terrain[i];
      let [r, g, b] = TERRAIN_COLORS[t];
      // Shade by elevation for relief
      const e = elev[i];
      let shade = t === 0 ? 0.75 + e * 0.5 : 0.72 + e * 0.55;
      // Hillshading: light from the northwest — slopes facing the light
      // brighten, slopes falling away darken. This is what makes the
      // terrain read as 3D at every zoom level.
      if (t !== 0) {
        const x = i % W;
        const yy = (i / W) | 0;
        const eL = x > 0 ? elev[i - 1] : e;
        const eR = x < W - 1 ? elev[i + 1] : e;
        const eU = yy > 0 ? elev[i - W] : e;
        const eD = yy < H - 1 ? elev[i + W] : e;
        const slope = (eL - eR) + (eU - eD); // + = facing NW light
        shade *= Math.max(0.62, Math.min(1.38, 1 + slope * 5.5));
      }
      r = Math.min(255, r * shade);
      g = Math.min(255, g * shade);
      b = Math.min(255, b * shade);
      if (mapStatic.river[i] && t !== 0) {
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
    terrainCanvasRef.current = c;
    detailCanvasRef.current = buildDetailCanvas(mapStatic);
    buildingsCanvasRef.current = null;
    buildingsSigRef.current = '';
    // Center map on first load
    if (!initializedRef.current && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      const scale = Math.min(rect.width / mapStatic.width, rect.height / mapStatic.height) * 0.95;
      viewRef.current = {
        scale,
        x: (rect.width - mapStatic.width * scale) / 2,
        y: (rect.height - mapStatic.height * scale) / 2,
      };
      initializedRef.current = true;
    }
  }, [mapStatic]);

  // --- Track new events for animations ---
  useEffect(() => {
    if (!snapshot) return;
    const now = performance.now();
    for (const ev of snapshot.events) {
      if (ev.x === undefined || seenEventsRef.current.has(ev.id)) continue;
      seenEventsRef.current.add(ev.id);
      if (ev.importance >= 4) {
        eventAnimRef.current.push({ event: ev, bornAt: now });
      }
    }
    if (eventAnimRef.current.length > 60) {
      eventAnimRef.current.splice(0, eventAnimRef.current.length - 60);
    }
    if (seenEventsRef.current.size > 4000) seenEventsRef.current.clear();
  }, [snapshot]);

  // --- Buildings layer: rebuilt only when cities/eras change ---
  useEffect(() => {
    if (!mapStatic || !snapshot) return;
    const sig = citySignature(snapshot);
    if (sig !== buildingsSigRef.current) {
      buildingsSigRef.current = sig;
      buildingsCanvasRef.current = buildBuildingsCanvas(mapStatic, snapshot);
    }
  }, [mapStatic, snapshot]);

  // --- Overlay layer per snapshot + mode ---
  const civColors = useMemo(() => {
    if (!snapshot) return [] as [number, number, number][];
    return snapshot.civs.map((c) => hexToRgb(c.color));
  }, [snapshot]);

  useEffect(() => {
    if (!mapStatic || !snapshot) return;
    let c = overlayCanvasRef.current;
    if (!c || c.width !== mapStatic.width) {
      c = document.createElement('canvas');
      c.width = mapStatic.width;
      c.height = mapStatic.height;
      overlayCanvasRef.current = c;
    }
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(mapStatic.width, mapStatic.height);
    const data = img.data;
    const owner = snapshot.owner;
    const pop = snapshot.population;
    const n = mapStatic.terrain.length;

    const civValue = (metric: MapMode): number[] => {
      return snapshot.civs.map((civ) => {
        switch (metric) {
          case 'technology':
            return civ.technologyLevel / 13;
          case 'economy':
            return civ.economy / 100;
          case 'military':
            return Math.min(1, civ.military / 150);
          case 'culture':
            return civ.culture / 100;
          default:
            return 0;
        }
      });
    };

    // War-front layer (rebuilt alongside the political overlay)
    let wf = warFrontCanvasRef.current;
    if (!wf || wf.width !== mapStatic.width) {
      wf = document.createElement('canvas');
      wf.width = mapStatic.width;
      wf.height = mapStatic.height;
      warFrontCanvasRef.current = wf;
    }
    const wfCtx = wf.getContext('2d')!;
    wfCtx.clearRect(0, 0, wf.width, wf.height);
    const frontTiles: number[] = [];

    if (mapMode === 'political' || mapMode === 'night') {
      const W = mapStatic.width;
      const H = mapStatic.height;
      const warPairs = new Set<string>();
      for (const w of snapshot.wars) {
        if (w.endYear !== null) continue;
        const a = parseInt(w.attackerId.slice(4), 10);
        const b = parseInt(w.defenderId.slice(4), 10);
        warPairs.add(a < b ? `${a}-${b}` : `${b}-${a}`);
      }
      const wfImg = wfCtx.createImageData(W, H);
      const night = mapMode === 'night';
      for (let i = 0; i < n; i++) {
        const o = owner[i];
        if (o < 0 || !civColors[o]) continue;
        const x = i % W;
        const yy = (i / W) | 0;
        const right = x < W - 1 ? owner[i + 1] : -2;
        const down = yy < H - 1 ? owner[i + W] : -2;
        const isBorder = (right !== -2 && right !== o) || (down !== -2 && down !== o);
        const sel = selectedCivId !== null && snapshot.civs[o]?.id === selectedCivId;
        const [r, g, b] = civColors[o];
        if (!night) {
          data[i * 4] = r;
          data[i * 4 + 1] = g;
          data[i * 4 + 2] = b;
          data[i * 4 + 3] = isBorder ? 255 : sel ? 200 : 110;
        } else if (isBorder) {
          data[i * 4] = r;
          data[i * 4 + 1] = g;
          data[i * 4 + 2] = b;
          data[i * 4 + 3] = 130;
        }
        // Burning front between two civs at war
        if (isBorder) {
          const others = [right, down].filter((v) => v >= 0 && v !== o);
          for (const other of others) {
            const key = o < other ? `${o}-${other}` : `${other}-${o}`;
            if (warPairs.has(key)) {
              wfImg.data[i * 4] = 255;
              wfImg.data[i * 4 + 1] = 90;
              wfImg.data[i * 4 + 2] = 40;
              wfImg.data[i * 4 + 3] = 255;
              frontTiles.push(i);
            }
          }
        }
      }
      wfCtx.putImageData(wfImg, 0, 0);
      warFrontTilesRef.current = frontTiles;

      // Night lights layer: brightness from population, hue from tech era.
      if (night) {
        let lc = lightsCanvasRef.current;
        if (!lc || lc.width !== W) {
          lc = document.createElement('canvas');
          lc.width = W;
          lc.height = H;
          lightsCanvasRef.current = lc;
        }
        const lcCtx = lc.getContext('2d')!;
        const lImg = lcCtx.createImageData(W, H);
        for (let i = 0; i < n; i++) {
          const p = pop[i];
          if (p < 40) continue;
          const o = owner[i];
          const tech = o >= 0 ? snapshot.civs[o]?.technologyLevel ?? 1 : 1;
          const lum = Math.min(1, Math.log10(p + 1) / 5.2);
          const eraT = Math.min(1, tech / 11); // 0 firelight -> 1 electric
          lImg.data[i * 4] = 255 * lum;
          lImg.data[i * 4 + 1] = (140 + eraT * 110) * lum;
          lImg.data[i * 4 + 2] = (40 + eraT * 215) * lum;
          lImg.data[i * 4 + 3] = 255 * lum;
        }
        lcCtx.putImageData(lImg, 0, 0);
      }
    } else if (mapMode === 'population') {
      let max = 100;
      for (let i = 0; i < n; i++) if (pop[i] > max) max = pop[i];
      const logMax = Math.log10(max + 1);
      for (let i = 0; i < n; i++) {
        if (pop[i] > 1) {
          const v = Math.log10(pop[i] + 1) / logMax;
          data[i * 4] = 255;
          data[i * 4 + 1] = 200 - v * 130;
          data[i * 4 + 2] = 40;
          data[i * 4 + 3] = 30 + v * 210;
        }
      }
    } else if (mapMode === 'resources') {
      for (let i = 0; i < n; i++) {
        const bits = mapStatic.resources[i];
        if (bits && mapStatic.terrain[i] !== 0) {
          // Show the highest-value resource on the tile.
          for (const bit of [16, 8, 4, 2, 1]) {
            if (bits & bit) {
              const [r, g, b] = RESOURCE_COLORS[bit];
              data[i * 4] = r;
              data[i * 4 + 1] = g;
              data[i * 4 + 2] = b;
              data[i * 4 + 3] = 190;
              break;
            }
          }
        }
      }
    } else if (mapMode === 'technology' || mapMode === 'economy' || mapMode === 'military' || mapMode === 'culture') {
      const values = civValue(mapMode);
      for (let i = 0; i < n; i++) {
        const o = owner[i];
        if (o >= 0) {
          const v = values[o] ?? 0;
          data[i * 4] = 40 + v * 60;
          data[i * 4 + 1] = 120 + v * 135;
          data[i * 4 + 2] = 220;
          data[i * 4 + 3] = 40 + v * 190;
        }
      }
    }
    // 'terrain' mode: no overlay
    ctx.putImageData(img, 0, 0);
  }, [mapStatic, snapshot, mapMode, civColors, selectedCivId]);

  // --- Focus animation: smooth glide to the target tile ---
  useEffect(() => {
    if (!focusTile || !wrapRef.current || !mapStatic) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const v = viewRef.current;
    const targetScale = Math.max(v.scale, 12);
    targetViewRef.current = {
      scale: targetScale,
      x: rect.width / 2 - focusTile.x * targetScale,
      y: rect.height / 2 - focusTile.y * targetScale,
    };
  }, [focusTile, mapStatic]);

  // --- Main render loop (60fps, decoupled from simulation) ---
  useEffect(() => {
    let raf = 0;
    const render = (): void => {
      raf = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#070a10';
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Camera glide (focus jumps + cinematic drift)
      const target = targetViewRef.current;
      if (target) {
        const v0 = viewRef.current;
        viewRef.current = {
          x: v0.x + (target.x - v0.x) * 0.08,
          y: v0.y + (target.y - v0.y) * 0.08,
          scale: v0.scale + (target.scale - v0.scale) * 0.08,
        };
        if (Math.abs(target.x - v0.x) < 0.5 && Math.abs(target.y - v0.y) < 0.5 && Math.abs(target.scale - v0.scale) < 0.01) {
          targetViewRef.current = null;
        }
      } else if (cinemaRef.current) {
        const tt = performance.now() / 1000;
        viewRef.current = {
          ...viewRef.current,
          x: viewRef.current.x + Math.sin(tt * 0.11) * 0.12,
          y: viewRef.current.y + Math.cos(tt * 0.07) * 0.09,
        };
      }

      const v = viewRef.current;
      ctx.imageSmoothingEnabled = v.scale < 2.5;
      const night = mapMode === 'night';
      const terrain = terrainCanvasRef.current;
      if (terrain) {
        ctx.drawImage(terrain, v.x, v.y, terrain.width * v.scale, terrain.height * v.scale);
        if (night) {
          ctx.fillStyle = 'rgba(3, 5, 12, 0.86)';
          ctx.fillRect(v.x, v.y, terrain.width * v.scale, terrain.height * v.scale);
        }
      }
      const overlay = overlayCanvasRef.current;
      if (overlay && mapMode !== 'terrain') {
        // At street-level zoom the political wash fades so the living ground
        // (terrain detail, buildings, people) becomes the protagonist.
        ctx.save();
        if (!night && v.scale > 5) ctx.globalAlpha = Math.max(0.3, 1 - (v.scale - 5) * 0.09);
        ctx.drawImage(overlay, v.x, v.y, overlay.width * v.scale, overlay.height * v.scale);
        ctx.restore();
      }
      // Night lights: soft halo pass + sharp core pass, additively blended.
      const lights = lightsCanvasRef.current;
      if (night && lights && terrain) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.imageSmoothingEnabled = true;
        const flicker = 0.9 + 0.1 * Math.sin(performance.now() / 700);
        ctx.globalAlpha = 0.55 * flicker;
        ctx.filter = 'blur(6px)';
        ctx.drawImage(lights, v.x, v.y, terrain.width * v.scale, terrain.height * v.scale);
        ctx.filter = 'none';
        ctx.globalAlpha = 0.95;
        ctx.drawImage(lights, v.x, v.y, terrain.width * v.scale, terrain.height * v.scale);
        ctx.restore();
      }
      // Close-up detail: terrain texture fades in, then buildings.
      const detail = detailCanvasRef.current;
      if (detail && terrain && v.scale >= 4 && !night) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = Math.min(1, (v.scale - 4) / 3) * (mapMode === 'terrain' ? 1 : 0.85);
        ctx.drawImage(detail, v.x, v.y, terrain.width * v.scale, terrain.height * v.scale);
        ctx.restore();
      }
      const buildings = buildingsCanvasRef.current;
      if (buildings && terrain && v.scale >= 3.2 && mapMode !== 'terrain') {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = Math.min(1, (v.scale - 3.2) / 2.5);
        ctx.drawImage(buildings, v.x, v.y, terrain.width * v.scale, terrain.height * v.scale);
        ctx.restore();
      }

      // Burning war fronts
      const wfLayer = warFrontCanvasRef.current;
      if (wfLayer && terrain && (mapMode === 'political' || night)) {
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(performance.now() / 220);
        ctx.drawImage(wfLayer, v.x, v.y, terrain.width * v.scale, terrain.height * v.scale);
        ctx.restore();
      }

      const snap = universe.snapshot;
      if (snap) {
        // Trade routes: subtle animated dashes between civ centroids.
        if (snap.tradeRoutes.length > 0 && (mapMode === 'political' || mapMode === 'economy')) {
          ctx.save();
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.lineDashOffset = -(performance.now() / 60) % 10;
          for (const route of snap.tradeRoutes.slice(0, 40)) {
            const a = snap.civs.find((cv) => cv.id === route.fromId);
            const b = snap.civs.find((cv) => cv.id === route.toId);
            if (!a?.alive || !b?.alive) continue;
            ctx.strokeStyle = 'rgba(240, 200, 90, 0.45)';
            ctx.beginPath();
            ctx.moveTo(v.x + a.cx * v.scale, v.y + a.cy * v.scale);
            ctx.lineTo(v.x + b.cx * v.scale, v.y + b.cy * v.scale);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Active wars: pulsing red front line between centroids.
        const activeWars = snap.wars.filter((w) => w.endYear === null);
        if (activeWars.length > 0) {
          const pulse = 0.35 + 0.3 * Math.sin(performance.now() / 250);
          ctx.save();
          for (const war of activeWars) {
            const a = snap.civs.find((cv) => cv.id === war.attackerId);
            const b = snap.civs.find((cv) => cv.id === war.defenderId);
            if (!a?.alive || !b?.alive) continue;
            ctx.strokeStyle = `rgba(230, 70, 70, ${pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(v.x + a.cx * v.scale, v.y + a.cy * v.scale);
            ctx.lineTo(v.x + b.cx * v.scale, v.y + b.cy * v.scale);
            ctx.stroke();
            const mx = v.x + ((a.cx + b.cx) / 2) * v.scale;
            const my = v.y + ((a.cy + b.cy) / 2) * v.scale;
            // Crossed-blades marker, drawn (no emoji): halo + red X
            ctx.beginPath();
            ctx.arc(mx, my, 8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(10, 12, 18, 0.72)';
            ctx.fill();
            ctx.strokeStyle = `rgba(240, 90, 80, ${0.55 + pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(mx - 4, my - 4);
            ctx.lineTo(mx + 4, my + 4);
            ctx.moveTo(mx + 4, my - 4);
            ctx.lineTo(mx - 4, my + 4);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Ruins of fallen civilizations
        if (snap.epitaphs.length > 0 && mapMode !== 'terrain') {
          ctx.save();
          for (const ep of snap.epitaphs) {
            const sx = v.x + (ep.x + 0.5) * v.scale;
            const sy = v.y + (ep.y + 0.5) * v.scale;
            if (sx < -20 || sy < -20 || sx > rect.width + 20 || sy > rect.height + 20) continue;
            const h = Math.max(4, v.scale * 1.4);
            // Ascension monuments glow gold; graves stay grey.
            ctx.strokeStyle = ep.ascended ? 'rgba(245, 200, 90, 0.9)' : 'rgba(170, 178, 194, 0.75)';
            ctx.lineWidth = Math.max(1, v.scale * 0.3);
            ctx.beginPath();
            ctx.moveTo(sx, sy + h * 0.4);
            ctx.lineTo(sx, sy - h * 0.6);
            ctx.moveTo(sx - h * 0.32, sy - h * 0.25);
            ctx.lineTo(sx + h * 0.32, sy - h * 0.25);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Cities: circles sized by population.
        ctx.save();
        for (const city of snap.cities) {
          const owner = snap.civs.find((cv) => cv.id === city.ownerId);
          if (!owner?.alive) continue;
          const sx = v.x + (city.x + 0.5) * v.scale;
          const sy = v.y + (city.y + 0.5) * v.scale;
          if (sx < -20 || sy < -20 || sx > rect.width + 20 || sy > rect.height + 20) continue;
          const r = city.level === 'capital' ? 5 : city.level === 'city' ? 4 : city.level === 'town' ? 3 : 2;
          const rr = Math.max(2, r * Math.min(1.6, v.scale / 3));
          if (v.scale < 6.5) {
            ctx.beginPath();
            ctx.arc(sx, sy, rr, 0, Math.PI * 2);
            ctx.fillStyle = '#f2f4f8';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = owner.color;
            ctx.stroke();
            if (city.level === 'capital') {
              ctx.beginPath();
              ctx.arc(sx, sy, rr + 2.5, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(242,244,248,0.6)';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
          if (v.scale >= 4 && (city.level === 'city' || city.level === 'capital')) {
            ctx.font = '10px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(240, 243, 248, 0.9)';
            ctx.fillText(city.name, sx, sy - rr - 3);
          }
        }
        ctx.restore();

        // Living world: walkers, caravans, front-line fighters at close zoom.
        if (mapStatic && v.scale >= 7.5 && mapMode !== 'terrain') {
          drawWalkers(ctx, v, rect.width, rect.height, snap, mapStatic, performance.now());
        }
        if (v.scale >= 5 && (mapMode === 'political' || mapMode === 'night')) {
          drawCaravans(ctx, v, snap.tradeRoutes, snap.civs, performance.now());
          if (mapStatic && v.scale >= 6.5 && warFrontTilesRef.current.length > 0) {
            drawFrontFighters(ctx, v, rect.width, rect.height, warFrontTilesRef.current, mapStatic, snap, performance.now());
          }
        }

        // Event pings: fading rings + glyphs at event location.
        const now = performance.now();
        eventAnimRef.current = eventAnimRef.current.filter((e) => now - e.bornAt < 4000);
        for (const anim of eventAnimRef.current) {
          const { event } = anim;
          if (event.x === undefined || event.y === undefined) continue;
          const age = (now - anim.bornAt) / 4000;
          const sx = v.x + (event.x + 0.5) * v.scale;
          const sy = v.y + (event.y + 0.5) * v.scale;
          const alpha = 1 - age;
          const radius = 4 + age * 26;
          let color = 'rgba(240, 200, 90,';
          if (event.type === 'war' || event.type === 'city-captured') color = 'rgba(230, 70, 70,';
          else if (event.type === 'disaster' || event.type === 'divine') color = 'rgba(250, 140, 40,';
          else if (event.type === 'split' || event.type === 'extinction') color = 'rgba(200, 90, 230,';
          else if (event.type === 'city-founded') color = 'rgba(110, 220, 160,';
          // Meteor strikes get a full falling-star + blast animation.
          const isMeteor = event.title.includes('star') || event.titleZh?.includes('陨星');
          if (isMeteor && age < 0.28) {
            const fall = age / 0.28;
            const startX = sx + 220;
            const startY = sy - 340;
            const mx = startX + (sx - startX) * fall;
            const my = startY + (sy - startY) * fall;
            ctx.strokeStyle = `rgba(255, 210, 120, ${0.9 - fall * 0.3})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(mx + 26, my - 40);
            ctx.lineTo(mx, my);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 240, 200, 1)';
            ctx.beginPath();
            ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (isMeteor && age < 0.45) {
            const flash = 1 - (age - 0.28) / 0.17;
            ctx.fillStyle = `rgba(255, 240, 200, ${flash * 0.9})`;
            ctx.beginPath();
            ctx.arc(sx, sy, 14 + (1 - flash) * 30, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(sx, sy, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `${color}${alpha * 0.8})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Selection highlight
        if (selectedTile) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(v.x + selectedTile.x * v.scale, v.y + selectedTile.y * v.scale, v.scale, v.scale);
        }

        // God-tool aim preview
        const tool = godToolRef.current;
        const aim = hoverTileRef.current;
        if (tool && aim) {
          const def = GOD_TOOLS.find((g) => g.id === tool);
          const radius = Math.max(0.5, def?.radius ?? 1);
          const gx = v.x + (aim.x + 0.5) * v.scale;
          const gy = v.y + (aim.y + 0.5) * v.scale;
          const pulse = 0.55 + 0.25 * Math.sin(performance.now() / 200);
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = `rgba(245, 200, 90, ${pulse})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(gx, gy, radius * v.scale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(gx - 6, gy);
          ctx.lineTo(gx + 6, gy);
          ctx.moveTo(gx, gy - 6);
          ctx.lineTo(gx, gy + 6);
          ctx.stroke();
          ctx.restore();
        }
      }
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [universe, mapMode, selectedTile]);

  // --- Interaction ---
  const screenToTile = useCallback(
    (sx: number, sy: number): { x: number; y: number } | null => {
      if (!mapStatic || !wrapRef.current) return null;
      const rect = wrapRef.current.getBoundingClientRect();
      const v = viewRef.current;
      const x = Math.floor((sx - rect.left - v.x) / v.scale);
      const y = Math.floor((sy - rect.top - v.y) / v.scale);
      if (x < 0 || y < 0 || x >= mapStatic.width || y >= mapStatic.height) return null;
      return { x, y };
    },
    [mapStatic],
  );

  const onWheel = useCallback((e: React.WheelEvent): void => {
    if (!wrapRef.current) return;
    targetViewRef.current = null;
    const rect = wrapRef.current.getBoundingClientRect();
    const v = viewRef.current;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.max(0.8, Math.min(24, v.scale * factor));
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    viewRef.current = {
      scale: newScale,
      x: mx - ((mx - v.x) / v.scale) * newScale,
      y: my - ((my - v.y) / v.scale) * newScale,
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent): void => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), scale: viewRef.current.scale };
      dragRef.current = null;
      return;
    }
    targetViewRef.current = null;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: viewRef.current.x,
      panY: viewRef.current.y,
      moved: false,
      pointerId: e.pointerId,
    };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent): void => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pinchRef.current && pointersRef.current.size === 2) {
        const pts = [...pointersRef.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const v = viewRef.current;
        const newScale = Math.max(0.8, Math.min(24, pinchRef.current.scale * (dist / pinchRef.current.dist)));
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;
        const rect = wrapRef.current!.getBoundingClientRect();
        const mx = cx - rect.left;
        const my = cy - rect.top;
        viewRef.current = {
          scale: newScale,
          x: mx - ((mx - v.x) / v.scale) * newScale,
          y: my - ((my - v.y) / v.scale) * newScale,
        };
        return;
      }
      const drag = dragRef.current;
      if (drag && drag.pointerId === e.pointerId) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        viewRef.current = { ...viewRef.current, x: drag.panX + dx, y: drag.panY + dy };
      }
      const tile = screenToTile(e.clientX, e.clientY);
      hoverTileRef.current = tile;
      if (tile && wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setHoverTile({ ...tile, sx: e.clientX - rect.left, sy: e.clientY - rect.top });
      } else {
        setHoverTile(null);
      }
    },
    [screenToTile],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent): void => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || drag.moved || !snapshot) return;
      // A click: select city > civ+tile.
      const tile = screenToTile(e.clientX, e.clientY);
      if (!tile) return;
      if (godToolRef.current) {
        intervene(godToolRef.current, tile.x, tile.y);
        return;
      }
      const v = viewRef.current;
      const clickRadius = Math.max(6, v.scale);
      const rect = wrapRef.current!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      let cityHit: string | null = null;
      for (const city of snapshot.cities) {
        const sx = v.x + (city.x + 0.5) * v.scale;
        const sy = v.y + (city.y + 0.5) * v.scale;
        if (Math.hypot(sx - px, sy - py) < clickRadius) {
          cityHit = city.id;
          break;
        }
      }
      selectTile(tile);
      if (cityHit) {
        selectCity(cityHit);
        const city = snapshot.cities.find((c) => c.id === cityHit);
        if (city) selectCiv(city.ownerId);
        setInspectorTab('cities');
        return;
      }
      const ownerIdx = snapshot.owner[tile.y * (mapStatic?.width ?? 0) + tile.x];
      if (ownerIdx >= 0 && snapshot.civs[ownerIdx]) {
        selectCiv(snapshot.civs[ownerIdx].id);
        setInspectorTab('nations');
      } else {
        selectCiv(null);
        setInspectorTab('overview');
      }
    },
    [snapshot, mapStatic, screenToTile, selectCiv, selectCity, selectTile, setInspectorTab, intervene],
  );

  const hoverInfo = useMemo(() => {
    if (!hoverTile || !mapStatic || !snapshot) return null;
    const i = hoverTile.y * mapStatic.width + hoverTile.x;
    const terrain = TERRAINS[mapStatic.terrain[i]];
    const ownerIdx = snapshot.owner[i];
    const owner = ownerIdx >= 0 ? snapshot.civs[ownerIdx] : null;
    const pop = snapshot.population[i];
    const city = snapshot.cities.find((c) => c.x === hoverTile.x && c.y === hoverTile.y);
    const bits = mapStatic.resources[i];
    const res: string[] = [];
    if (bits & 1) res.push('food');
    if (bits & 2) res.push('wood');
    if (bits & 4) res.push('stone');
    if (bits & 8) res.push('iron');
    if (bits & 16) res.push('gold');
    return { terrain, owner, pop, city, res, fertility: mapStatic.fertility[i] };
  }, [hoverTile, mapStatic, snapshot]);

  return (
    <div
      ref={wrapRef}
      className={`canvas-wrap ${godTool ? 'canvas-godmode' : ''}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHoverTile(null)}
    >
      <canvas ref={canvasRef} className="world-canvas" />
      {hoverInfo && hoverTile && (
        <div
          className="tile-tooltip"
          style={{
            left: Math.min(hoverTile.sx + 14, (wrapRef.current?.clientWidth ?? 300) - 190),
            top: Math.min(hoverTile.sy + 14, (wrapRef.current?.clientHeight ?? 200) - 120),
          }}
        >
          <div className="tt-row tt-head">
            <span className="tt-terrain">{t(`terrain.${hoverInfo.terrain}`)}</span>
            <span className="muted">({hoverTile.x}, {hoverTile.y})</span>
          </div>
          {hoverInfo.city && <div className="tt-row"><Landmark size={11} className="inline-icon" /> {hoverInfo.city.name}（{t(`level.${hoverInfo.city.level}`)}）</div>}
          {hoverInfo.owner && (
            <div className="tt-row">
              <span className="dot" style={{ background: hoverInfo.owner.color }} /> {hoverInfo.owner.name}
            </div>
          )}
          <div className="tt-row muted">{t('tile.fertility')} {Math.round(hoverInfo.fertility * 100)}%</div>
          {hoverInfo.pop >= 1 && <div className="tt-row muted">{t('tile.population')} {Math.round(hoverInfo.pop).toLocaleString('en-US')}</div>}
          {hoverInfo.res.length > 0 && <div className="tt-row muted">{t('tile.resources')}: {hoverInfo.res.map((r) => t(`res.${r}`)).join(', ')}</div>}
        </div>
      )}
      <MapLegend mode={mapMode} snapshot={snapshot} mapStatic={mapStatic} />
    </div>
  );
}

function MapLegend({ mode, snapshot }: { mode: MapMode; snapshot: Snapshot | null; mapStatic: MapStatic | null }): JSX.Element {
  const t = useT();
  return (
    <div className="map-legend">
      <div className="legend-title">{t(`mode.${mode}`)}</div>
      <div className="legend-zoom-hint"><ZoomIn size={10} className="inline-icon" /> {t('legend.zoomHint')}</div>
      {(mode === 'political' || mode === 'night') && snapshot && (
        <div className="legend-items">
          {snapshot.civs.filter((c) => c.alive).slice(0, 12).map((c) => (
            <div className="legend-item" key={c.id}>
              <span className="dot" style={{ background: c.color }} /> {c.name}
            </div>
          ))}
        </div>
      )}
      {mode === 'terrain' && (
        <div className="legend-items">
          {TERRAINS.map((terr, i) => (
            <div className="legend-item" key={terr}>
              <span className="dot" style={{ background: `rgb(${TERRAIN_COLORS[i].join(',')})` }} /> {t(`terrain.${terr}`)}
            </div>
          ))}
        </div>
      )}
      {mode === 'population' && (
        <div className="legend-items">
          <div className="legend-item"><span className="dot" style={{ background: 'rgba(255,190,40,0.35)' }} /> {t('legend.sparse')}</div>
          <div className="legend-item"><span className="dot" style={{ background: 'rgb(255,80,40)' }} /> {t('legend.dense')}</div>
        </div>
      )}
      {mode === 'resources' && (
        <div className="legend-items">
          <div className="legend-item"><span className="dot" style={{ background: 'rgb(120,200,90)' }} /> {t('res.food')}</div>
          <div className="legend-item"><span className="dot" style={{ background: 'rgb(160,116,60)' }} /> {t('res.wood')}</div>
          <div className="legend-item"><span className="dot" style={{ background: 'rgb(150,150,160)' }} /> {t('res.stone')}</div>
          <div className="legend-item"><span className="dot" style={{ background: 'rgb(200,120,120)' }} /> {t('res.iron')}</div>
          <div className="legend-item"><span className="dot" style={{ background: 'rgb(240,200,70)' }} /> {t('res.gold')}</div>
        </div>
      )}
      {(mode === 'technology' || mode === 'economy' || mode === 'military' || mode === 'culture') && (
        <div className="legend-items">
          <div className="legend-item"><span className="dot" style={{ background: 'rgba(60,140,220,0.35)' }} /> {t('legend.low')}</div>
          <div className="legend-item"><span className="dot" style={{ background: 'rgb(100,255,220)' }} /> {t('legend.high')}</div>
        </div>
      )}
    </div>
  );
}
