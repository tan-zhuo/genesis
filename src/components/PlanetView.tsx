// Planet view: the world rendered as a real 3D globe (Three.js).
// Presentation layer — day/night terminator, civilization lights on the dark
// side, atmosphere, stars. Analysis stays on the 2D map; this is the poster.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Universe } from '../state/simulatorStore';
import { MapStatic, Snapshot } from '../simulation/types';
import { buildTerrainCanvas } from './mapDetail';
import { TECH_COUNT } from '../simulation/Technology';
import { useT } from '../i18n';

const TEX_W = 2048;
const TEX_H = 1024;
// The known world occupies one region of the planet; the rest is open ocean.
const MAP_RECT = { x: 0.28, y: 0.18, w: 0.44, h: 0.64 };

function paintBase(ctx: CanvasRenderingContext2D, terrain: HTMLCanvasElement): void {
  // Deep-ocean base with latitude gradient
  const grad = ctx.createLinearGradient(0, 0, 0, TEX_H);
  grad.addColorStop(0, '#0b1a30');
  grad.addColorStop(0.5, '#102540');
  grad.addColorStop(1, '#0b1a30');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // Polar caps
  const cap = ctx.createLinearGradient(0, 0, 0, TEX_H * 0.09);
  cap.addColorStop(0, 'rgba(230, 240, 248, 0.95)');
  cap.addColorStop(1, 'rgba(230, 240, 248, 0)');
  ctx.fillStyle = cap;
  ctx.fillRect(0, 0, TEX_W, TEX_H * 0.09);
  const cap2 = ctx.createLinearGradient(0, TEX_H, 0, TEX_H * 0.91);
  cap2.addColorStop(0, 'rgba(230, 240, 248, 0.95)');
  cap2.addColorStop(1, 'rgba(230, 240, 248, 0)');
  ctx.fillStyle = cap2;
  ctx.fillRect(0, TEX_H * 0.91, TEX_W, TEX_H * 0.09);
  // The known world
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(terrain, MAP_RECT.x * TEX_W, MAP_RECT.y * TEX_H, MAP_RECT.w * TEX_W, MAP_RECT.h * TEX_H);
}

function paintPolitical(ctx: CanvasRenderingContext2D, mapStatic: MapStatic, snapshot: Snapshot): void {
  const c = document.createElement('canvas');
  c.width = mapStatic.width;
  c.height = mapStatic.height;
  const cctx = c.getContext('2d')!;
  const img = cctx.createImageData(mapStatic.width, mapStatic.height);
  const owners = snapshot.owner;
  for (let i = 0; i < owners.length; i++) {
    const o = owners[i];
    if (o < 0) continue;
    const civ = snapshot.civs[o];
    if (!civ) continue;
    const n = parseInt(civ.color.slice(1), 16);
    img.data[i * 4] = (n >> 16) & 255;
    img.data[i * 4 + 1] = (n >> 8) & 255;
    img.data[i * 4 + 2] = n & 255;
    img.data[i * 4 + 3] = 105;
  }
  cctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, MAP_RECT.x * TEX_W, MAP_RECT.y * TEX_H, MAP_RECT.w * TEX_W, MAP_RECT.h * TEX_H);
}

function paintLights(ctx: CanvasRenderingContext2D, mapStatic: MapStatic, snapshot: Snapshot): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  const c = document.createElement('canvas');
  c.width = mapStatic.width;
  c.height = mapStatic.height;
  const cctx = c.getContext('2d')!;
  const img = cctx.createImageData(mapStatic.width, mapStatic.height);
  const pop = snapshot.population;
  const owners = snapshot.owner;
  for (let i = 0; i < pop.length; i++) {
    if (pop[i] < 60) continue;
    const o = owners[i];
    const tech = o >= 0 ? snapshot.civs[o]?.technologyLevel ?? 1 : 1;
    const lum = Math.min(1, Math.log10(pop[i] + 1) / 5);
    const eraT = Math.min(1, tech / TECH_COUNT);
    img.data[i * 4] = 255 * lum;
    img.data[i * 4 + 1] = (150 + eraT * 100) * lum;
    img.data[i * 4 + 2] = (50 + eraT * 205) * lum;
    img.data[i * 4 + 3] = 255 * lum;
  }
  cctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, MAP_RECT.x * TEX_W, MAP_RECT.y * TEX_H, MAP_RECT.w * TEX_W, MAP_RECT.h * TEX_H);
}

/** Map tile -> position on the unit sphere (globe-local space). */
function tileToLocal(x: number, y: number, mapW: number, mapH: number, r: number): THREE.Vector3 {
  const u = MAP_RECT.x + (x / mapW) * MAP_RECT.w;
  const v = MAP_RECT.y + (y / mapH) * MAP_RECT.h;
  const phi = u * Math.PI * 2;
  const theta = v * Math.PI;
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function noise2(seed: number, x: number, y: number): number {
  let h = (seed ^ (x * 374761393) ^ (y * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fbm2(seed: number, x: number, y: number, oct: number): number {
  let a = 1;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    const xi = Math.floor(x * f);
    const yi = Math.floor(y * f);
    const tx = x * f - xi;
    const ty = y * f - yi;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const v00 = noise2(seed + o * 999, xi, yi);
    const v10 = noise2(seed + o * 999, xi + 1, yi);
    const v01 = noise2(seed + o * 999, xi, yi + 1);
    const v11 = noise2(seed + o * 999, xi + 1, yi + 1);
    sum += a * (v00 + (v10 - v00) * sx + ((v01 + (v11 - v01) * sx) - (v00 + (v10 - v00) * sx)) * sy);
    norm += a;
    a *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Wispy cloud layer, seeded per world. */
function cloudTexture(seed: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm2(seed, (x / W) * 14, (y / H) * 7, 4);
      const streak = fbm2(seed + 71, (x / W) * 5 + n, (y / H) * 22, 2);
      let a = Math.max(0, (n * 0.72 + streak * 0.28) - 0.52) * 3.2;
      a = Math.min(1, a) * 200;
      const i = (y * W + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Banded gas-giant / mottled rocky texture for sister planets. */
function sisterTexture(seed: number, banded: boolean, baseHue: number): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v: number;
      if (banded) {
        const wob = fbm2(seed, (x / W) * 6, (y / H) * 3, 3) * 0.35;
        v = 0.5 + 0.5 * Math.sin((y / H + wob) * Math.PI * 9);
        v = 0.55 + v * 0.35;
      } else {
        v = 0.4 + fbm2(seed, (x / W) * 10, (y / H) * 5, 4) * 0.6;
      }
      const hueShift = fbm2(seed + 5, (x / W) * 3, (y / H) * 3, 2) * 30 - 15;
      const hue = baseHue + hueShift;
      // HSL-ish to RGB (simple)
      const l = v * 0.62;
      const q = l < 0.5 ? l * 1.35 : l + 0.22 - l * 0.22;
      const pp = 2 * l - q;
      const h = (((hue % 360) + 360) % 360) / 360;
      const t = [h + 1 / 3, h, h - 1 / 3].map((tc) => {
        let t2 = tc;
        if (t2 < 0) t2 += 1;
        if (t2 > 1) t2 -= 1;
        if (t2 < 1 / 6) return pp + (q - pp) * 6 * t2;
        if (t2 < 1 / 2) return q;
        if (t2 < 2 / 3) return pp + (q - pp) * (2 / 3 - t2) * 6;
        return pp;
      });
      const i = (y * W + x) * 4;
      img.data[i] = t[0] * 255;
      img.data[i + 1] = t[1] * 255;
      img.data[i + 2] = t[2] * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cratered moon surface. */
function moonTexture(seed: number): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8f939c';
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 90; k++) {
    const x = noise2(seed, k, 1) * W;
    const y = noise2(seed, k, 2) * H;
    const r = 1 + noise2(seed, k, 3) * 7;
    const shade = 0.75 + noise2(seed, k, 4) * 0.2;
    g.fillStyle = `rgba(${Math.round(120 * shade)}, ${Math.round(124 * shade)}, ${Math.round(133 * shade)}, 0.85)`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(200, 204, 212, 0.35)';
    g.beginPath();
    g.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial nebula blob. */
function nebulaTexture(r: number, gcol: number, b: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, `rgba(${r}, ${gcol}, ${b}, 0.55)`);
  grad.addColorStop(0.5, `rgba(${r}, ${gcol}, ${b}, 0.18)`);
  grad.addColorStop(1, `rgba(${r}, ${gcol}, ${b}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 240, 210, 1)');
  grad.addColorStop(0.35, 'rgba(255, 220, 150, 0.55)');
  grad.addColorStop(1, 'rgba(255, 200, 120, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export default function PlanetView({ universe }: { universe: Universe }): JSX.Element {
  const t = useT();
  const mountRef = useRef<HTMLDivElement>(null);
  const universeRef = useRef(universe);
  useEffect(() => {
    universeRef.current = universe;
  }, [universe]);

  useEffect(() => {
    const mount = mountRef.current;
    const { mapStatic } = universeRef.current;
    if (!mount || !mapStatic) return;

    // --- Scene ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 0.9, 4.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x04060c);
    mount.appendChild(renderer.domElement);

    // --- Textures painted from world state ---
    const dayCanvas = document.createElement('canvas');
    dayCanvas.width = TEX_W;
    dayCanvas.height = TEX_H;
    const dayCtx = dayCanvas.getContext('2d')!;
    const lightsCanvas = document.createElement('canvas');
    lightsCanvas.width = TEX_W;
    lightsCanvas.height = TEX_H;
    const lightsCtx = lightsCanvas.getContext('2d')!;

    let terrainLayer = buildTerrainCanvas(mapStatic);
    let lastMapStatic = mapStatic;
    const dayTex = new THREE.CanvasTexture(dayCanvas);
    dayTex.colorSpace = THREE.SRGBColorSpace;
    const lightsTex = new THREE.CanvasTexture(lightsCanvas);
    lightsTex.colorSpace = THREE.SRGBColorSpace;

    const repaint = (): void => {
      const u = universeRef.current;
      if (!u.mapStatic || !u.snapshot) return;
      if (u.mapStatic !== lastMapStatic) {
        terrainLayer = buildTerrainCanvas(u.mapStatic);
        lastMapStatic = u.mapStatic;
      }
      paintBase(dayCtx, terrainLayer);
      paintPolitical(dayCtx, u.mapStatic, u.snapshot);
      paintLights(lightsCtx, u.mapStatic, u.snapshot);
      dayTex.needsUpdate = true;
      lightsTex.needsUpdate = true;
    };
    repaint();
    const repaintTimer = setInterval(repaint, 1200);

    // --- Globe: bump relief, glossy oceans, city lights ---
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = TEX_W;
    bumpCanvas.height = TEX_H;
    const bumpCtx = bumpCanvas.getContext('2d')!;
    const specCanvas = document.createElement('canvas');
    specCanvas.width = TEX_W;
    specCanvas.height = TEX_H;
    const specCtx = specCanvas.getContext('2d')!;
    const paintBumpSpec = (ms: MapStatic): void => {
      bumpCtx.fillStyle = '#606060';
      bumpCtx.fillRect(0, 0, TEX_W, TEX_H);
      specCtx.fillStyle = '#e8e8e8'; // open ocean: shiny
      specCtx.fillRect(0, 0, TEX_W, TEX_H);
      const w = ms.width;
      const h = ms.height;
      const bimg = bumpCtx.createImageData(w, h);
      const simg = specCtx.createImageData(w, h);
      for (let i = 0; i < ms.terrain.length; i++) {
        const land = ms.terrain[i] !== 0;
        const e = Math.round(Math.min(1, ms.elevation[i]) * 255);
        bimg.data[i * 4] = e;
        bimg.data[i * 4 + 1] = e;
        bimg.data[i * 4 + 2] = e;
        bimg.data[i * 4 + 3] = 255;
        const sp = land ? 20 : 235;
        simg.data[i * 4] = sp;
        simg.data[i * 4 + 1] = sp;
        simg.data[i * 4 + 2] = sp;
        simg.data[i * 4 + 3] = 255;
      }
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      tmp.getContext('2d')!.putImageData(bimg, 0, 0);
      bumpCtx.imageSmoothingEnabled = true;
      bumpCtx.drawImage(tmp, MAP_RECT.x * TEX_W, MAP_RECT.y * TEX_H, MAP_RECT.w * TEX_W, MAP_RECT.h * TEX_H);
      const tmp2 = document.createElement('canvas');
      tmp2.width = w;
      tmp2.height = h;
      tmp2.getContext('2d')!.putImageData(simg, 0, 0);
      specCtx.imageSmoothingEnabled = true;
      specCtx.drawImage(tmp2, MAP_RECT.x * TEX_W, MAP_RECT.y * TEX_H, MAP_RECT.w * TEX_W, MAP_RECT.h * TEX_H);
    };
    paintBumpSpec(mapStatic);
    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    const specTex = new THREE.CanvasTexture(specCanvas);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 128),
      new THREE.MeshPhongMaterial({
        map: dayTex,
        bumpMap: bumpTex,
        bumpScale: 1.4,
        specularMap: specTex,
        specular: new THREE.Color(0x88aacc),
        shininess: 18,
        emissiveMap: lightsTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 1.5,
      }),
    );
    // Face the known world toward the camera, terminator crossing it.
    globe.rotation.y = -Math.PI * 0.5;
    scene.add(globe);

    // Cloud layer: slowly drifting, seeded per world.
    const seedNum = universeRef.current.config.seed.split('').reduce((a2, ch) => (a2 * 33 + ch.charCodeAt(0)) >>> 0, 5381);
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.018, 96, 96),
      new THREE.MeshLambertMaterial({ map: cloudTexture(seedNum), transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    scene.add(clouds);

    // Atmosphere: fresnel rim shader — bright limb, invisible face-on.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 96, 96),
      new THREE.ShaderMaterial({
        uniforms: { glowColor: { value: new THREE.Color(0x6ab0f0) } },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 glowColor;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float rim = pow(0.78 - abs(dot(vNormal, vView)) * 0.72, 2.6);
            gl_FragColor = vec4(glowColor, 1.0) * rim * 1.8;
          }`,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    scene.add(atmosphere);

    // Sun + fill
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
    sun.position.set(2.6, 1.1, 3.4);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x223044, 0.55));

    // Starfield: colored magnitudes + a tilted Milky Way band + soft nebulae.
    const starGeo = new THREE.BufferGeometry();
    const N_STARS = 2600;
    const starPos = new Float32Array(N_STARS * 3);
    const starCol = new Float32Array(N_STARS * 3);
    const palette = [
      [0.75, 0.83, 1.0], // blue-white
      [1.0, 0.97, 0.88], // warm white
      [1.0, 0.85, 0.65], // amber
      [1.0, 0.7, 0.62], // red dwarf
      [0.9, 0.95, 1.0],
    ];
    const bandAxis = new THREE.Vector3(0.4, 1, 0.25).normalize();
    for (let i = 0; i < N_STARS; i++) {
      const inBand = i > N_STARS * 0.45; // over half concentrate into the galaxy band
      const r = 30 + Math.random() * 40;
      let v: THREE.Vector3;
      if (inBand) {
        const ang = Math.random() * Math.PI * 2;
        const spread = (Math.random() - 0.5) * 0.35 * (Math.random() < 0.7 ? 1 : 2.5);
        const inPlane = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
        inPlane.applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.acos(bandAxis.y));
        v = inPlane.add(bandAxis.clone().multiplyScalar(spread)).normalize().multiplyScalar(r);
      } else {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        v = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)).multiplyScalar(r);
      }
      starPos[i * 3] = v.x;
      starPos[i * 3 + 1] = v.y;
      starPos[i * 3 + 2] = v.z;
      const c = palette[Math.floor(Math.random() * palette.length)];
      const dim = inBand ? 0.5 + Math.random() * 0.5 : 0.7 + Math.random() * 0.3;
      starCol[i * 3] = c[0] * dim;
      starCol[i * 3 + 1] = c[1] * dim;
      starCol[i * 3 + 2] = c[2] * dim;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ vertexColors: true, size: 0.11, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    scene.add(stars);

    // Nebulae: vast, faint, additive color clouds.
    const nebulaSpecs: [number, number, number, number[]][] = [
      [96, 60, 160, [-30, 12, -38]],
      [40, 90, 150, [34, -8, -42]],
      [140, 60, 110, [12, 26, -46]],
    ];
    for (const [nr, ng2, nb, pos] of nebulaSpecs) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: nebulaTexture(nr, ng2, nb), blending: THREE.AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false }),
      );
      sp.position.set(pos[0], pos[1], pos[2]);
      sp.scale.set(46, 46, 1);
      scene.add(sp);
    }

    // ---- The rest of the universe ----
    // Sun: visible disc + glow at the light's direction.
    const sunPos = new THREE.Vector3(2.6, 1.1, 3.4).normalize().multiplyScalar(26);
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc }),
    );
    sunDisc.position.copy(sunPos);
    scene.add(sunDisc);
    const glowTex = glowTexture();
    const sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    sunGlow.scale.set(9, 9, 1);
    sunGlow.position.copy(sunPos);
    scene.add(sunGlow);
    const sunHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }),
    );
    sunHalo.scale.set(20, 20, 1);
    sunHalo.position.copy(sunPos);
    scene.add(sunHalo);

    // The moon.
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 32, 32),
      new THREE.MeshStandardMaterial({ map: moonTexture(seedNum + 9), roughness: 1 }),
    );
    scene.add(moon);

    // Sister planets of this system (deterministic from the world seed).
    const seedHash = universeRef.current.config.seed.split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const sisters: { mesh: THREE.Mesh; r: number; speed: number; phase: number }[] = [];
    for (let i = 0; i < 2 + (seedHash % 2); i++) {
      const size = 0.28 + ((seedHash >> (i * 3)) % 10) / 28;
      const hues = [18, 205, 45];
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 48, 48),
        new THREE.MeshStandardMaterial({
          map: sisterTexture(seedHash + i * 77, i !== 0, hues[i % 3]),
          roughness: 0.95,
        }),
      );
      mesh.rotation.z = 0.2 + i * 0.15; // axial tilt
      if (i === 1) {
        // Gradient ring with soft inner/outer edges.
        const ringC = document.createElement('canvas');
        ringC.width = 128;
        ringC.height = 8;
        const rg = ringC.getContext('2d')!;
        const grad = rg.createLinearGradient(0, 0, 128, 0);
        grad.addColorStop(0, 'rgba(200, 180, 140, 0)');
        grad.addColorStop(0.15, 'rgba(210, 190, 150, 0.75)');
        grad.addColorStop(0.4, 'rgba(160, 140, 110, 0.3)');
        grad.addColorStop(0.55, 'rgba(220, 200, 160, 0.8)');
        grad.addColorStop(0.8, 'rgba(180, 160, 125, 0.45)');
        grad.addColorStop(1, 'rgba(200, 180, 140, 0)');
        rg.fillStyle = grad;
        rg.fillRect(0, 0, 128, 8);
        const ringTex = new THREE.CanvasTexture(ringC);
        const ringGeo = new THREE.RingGeometry(size * 1.4, size * 2.5, 96);
        // Map ring UVs radially so the gradient runs across the ring.
        const uv = ringGeo.attributes.uv as THREE.BufferAttribute;
        const posA = ringGeo.attributes.position as THREE.BufferAttribute;
        for (let vi = 0; vi < uv.count; vi++) {
          const vx = posA.getX(vi);
          const vy = posA.getY(vi);
          const rr = (Math.hypot(vx, vy) - size * 1.4) / (size * 1.1);
          uv.setXY(vi, rr, 0.5);
        }
        const ring = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({ map: ringTex, side: THREE.DoubleSide, transparent: true, depthWrite: false }),
        );
        ring.rotation.x = Math.PI / 2.4;
        mesh.add(ring);
      }
      scene.add(mesh);
      sisters.push({ mesh, r: 9 + i * 5.5, speed: 0.02 / (i + 1), phase: (seedHash >> (i * 5)) % 628 / 100 });
    }

    // Detailed craft builders (procedural, no assets).
    const makeSatellite = (): { group: THREE.Group; beacon: THREE.Mesh } => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.02, 0.042),
        new THREE.MeshStandardMaterial({ color: 0xd0d8e6, metalness: 0.7, roughness: 0.35 }),
      );
      g.add(body);
      const panelMat = new THREE.MeshStandardMaterial({
        color: 0x1c3f9e,
        emissive: 0x12307e,
        emissiveIntensity: 0.55,
        side: THREE.DoubleSide,
        metalness: 0.4,
        roughness: 0.4,
      });
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.0016, 0.026), panelMat);
        panel.position.x = side * 0.056;
        g.add(panel);
        const strut = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.0014, 0.004),
          new THREE.MeshStandardMaterial({ color: 0x8a94a6 }),
        );
        strut.position.x = side * 0.018;
        g.add(strut);
      }
      const dish = new THREE.Mesh(
        new THREE.ConeGeometry(0.011, 0.008, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xe8ecf4, side: THREE.DoubleSide }),
      );
      dish.position.z = 0.028;
      dish.rotation.x = Math.PI / 2;
      g.add(dish);
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.0045, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff5544 }),
      );
      beacon.position.y = 0.016;
      g.add(beacon);
      return { group: g, beacon };
    };

    const makeShip = (): { group: THREE.Group; engine: THREE.Sprite } => {
      const g = new THREE.Group();
      const hullMat = new THREE.MeshStandardMaterial({ color: 0xdde4ee, metalness: 0.5, roughness: 0.35 });
      const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 12), hullMat);
      fuselage.rotation.x = Math.PI / 2;
      g.add(fuselage);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.024, 12), hullMat);
      nose.rotation.x = Math.PI / 2;
      nose.position.z = 0.042;
      g.add(nose);
      const finMat = new THREE.MeshStandardMaterial({ color: 0x8fb4dd, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide });
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.002, 0.018), finMat);
        wing.position.set(side * 0.02, 0, -0.012);
        g.add(wing);
      }
      const engine = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, color: 0x9fd8ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      );
      engine.scale.set(0.05, 0.05, 1);
      engine.position.z = -0.042;
      g.add(engine);
      return { group: g, engine };
    };

    // ---- Technology made visible: satellites, ships, missiles, the Gate ----
    const orbitGroup = new THREE.Group(); // satellites (world space, own spin)
    scene.add(orbitGroup);
    const surfaceGroup = new THREE.Group(); // attached to the globe (rotates with it)
    globe.add(surfaceGroup);
    const satellites: { mesh: THREE.Group; beacon: THREE.Mesh; r: number; incl: number; speed: number; phase: number }[] = [];
    const ships: { mesh: THREE.Group; engine: THREE.Sprite; phase: number }[] = [];
    let missiles: { mesh: THREE.Mesh; trails: THREE.Sprite[]; a: THREE.Vector3; b: THREE.Vector3; phase: number }[] = [];
    const orbitRings: THREE.Line[] = [];
    let portal: THREE.Mesh | null = null;
    let beam: THREE.Mesh | null = null;

    const rebuildSpaceAssets = (): void => {
      const u = universeRef.current;
      const snap = u.snapshot;
      if (!snap || !u.mapStatic) return;
      const alive = snap.civs.filter((c) => c.alive);
      const spacefarers = alive.filter((c) => c.researchedTechs.includes('spaceflight'));
      const flightCivs = new Set(alive.filter((c) => c.researchedTechs.includes('flight')).map((c) => c.id));
      const transcendent = alive.find((c) => c.researchedTechs.includes('transcendence'));

      // Satellites: constellation size scales with spacefaring nations.
      const wantSats = Math.min(14, spacefarers.length * 5);
      while (satellites.length > wantSats) {
        const sPop = satellites.pop()!;
        orbitGroup.remove(sPop.mesh);
      }
      while (satellites.length < wantSats) {
        const i = satellites.length;
        const { group, beacon } = makeSatellite();
        group.scale.setScalar(1.35);
        orbitGroup.add(group);
        const r = 1.14 + (i % 4) * 0.055;
        const incl = ((i * 0.7) % 1.4) - 0.7;
        satellites.push({ mesh: group, beacon, r, incl, speed: 0.5 + (i % 3) * 0.17, phase: i * 1.33 });
        // Faint orbit ring for legibility (one per unique orbit).
        if (i < 4) {
          const pts: THREE.Vector3[] = [];
          for (let k = 0; k <= 72; k++) {
            const ang = (k / 72) * Math.PI * 2;
            const pv = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
            pv.applyAxisAngle(new THREE.Vector3(1, 0, 0), incl);
            pts.push(pv);
          }
          const ring = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x88a8d8, transparent: true, opacity: 0.14 }),
          );
          orbitGroup.add(ring);
          orbitRings.push(ring);
        }
      }

      // Ships: shuttles running to the moon once spaceflight exists.
      const wantShips = spacefarers.length > 0 ? 2 : 0;
      while (ships.length > wantShips) {
        const sh = ships.pop()!;
        scene.remove(sh.mesh);
      }
      while (ships.length < wantShips) {
        const { group, engine } = makeShip();
        scene.add(group);
        ships.push({ mesh: group, engine, phase: ships.length * 0.5 });
      }

      // Missiles: ballistic arcs over active fronts, once flight is known.
      for (const mm of missiles) {
        surfaceGroup.remove(mm.mesh);
        for (const tr of mm.trails) surfaceGroup.remove(tr);
      }
      missiles = [];
      const activeWars = snap.wars.filter((w) => w.endYear === null).slice(0, 3);
      for (const war of activeWars) {
        if (!flightCivs.has(war.attackerId) && !flightCivs.has(war.defenderId)) continue;
        const a = snap.civs.find((c) => c.id === war.attackerId);
        const b = snap.civs.find((c) => c.id === war.defenderId);
        if (!a?.alive || !b?.alive) continue;
        const pa = tileToLocal(a.cx, a.cy, u.mapStatic.width, u.mapStatic.height, 1.01);
        const pb = tileToLocal(b.cx, b.cy, u.mapStatic.width, u.mapStatic.height, 1.01);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.016, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffd0a0 }),
        );
        // A staged exhaust plume: bright at the nozzle, cooling down the arc.
        const trailSpecs: [number, number][] = [[0xffc080, 0.07], [0xff7040, 0.055], [0x99584a, 0.04]];
        const trails = trailSpecs.map(([col, sz]) => {
          const tr = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
          );
          tr.scale.set(sz, sz, 1);
          surfaceGroup.add(tr);
          return tr;
        });
        surfaceGroup.add(mesh);
        missiles.push({ mesh, trails, a: pa, b: pb, phase: missiles.length * 1.4 });
      }

      // The Gate: a transcendent nation opens a shimmering ring above its land.
      if (transcendent && !portal) {
        portal = new THREE.Mesh(
          new THREE.TorusGeometry(0.16, 0.02, 12, 48),
          new THREE.MeshBasicMaterial({ color: 0xc9a2ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
        );
        beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.05, 0.6, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xb28aff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        surfaceGroup.add(portal);
        surfaceGroup.add(beam);
      }
      if (transcendent && portal && beam && u.mapStatic) {
        const base = tileToLocal(transcendent.cx, transcendent.cy, u.mapStatic.width, u.mapStatic.height, 1.0);
        const dir = base.clone().normalize();
        portal.position.copy(dir.clone().multiplyScalar(1.6));
        portal.lookAt(dir.clone().multiplyScalar(3));
        beam.position.copy(dir.clone().multiplyScalar(1.3));
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      }
      if (!transcendent && portal && beam) {
        surfaceGroup.remove(portal);
        surfaceGroup.remove(beam);
        portal = null;
        beam = null;
      }
    };
    rebuildSpaceAssets();
    const assetsTimer = setInterval(rebuildSpaceAssets, 1500);

    // --- Controls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.5;
    controls.maxDistance = 24;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    let raf = 0;
    const animate = (): void => {
      raf = requestAnimationFrame(animate);
      controls.update();
      globe.rotation.y += 0.0006; // the planet itself turns beneath the sun
      clouds.rotation.y += 0.00085;
      const tt = performance.now() / 1000;
      sunGlow.material.opacity = 0.85 + Math.sin(tt * 0.8) * 0.12;

      moon.position.set(Math.cos(tt * 0.12) * 2.4, 0.5, Math.sin(tt * 0.12) * 2.4);
      for (const p of sisters) {
        p.mesh.position.set(Math.cos(tt * p.speed + p.phase) * p.r, Math.sin(p.phase) * 1.6, Math.sin(tt * p.speed + p.phase) * p.r);
        p.mesh.rotation.y += 0.002;
      }
      for (const sat of satellites) {
        const a = tt * sat.speed + sat.phase;
        const pos = new THREE.Vector3(Math.cos(a) * sat.r, 0, Math.sin(a) * sat.r);
        pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), sat.incl);
        sat.mesh.position.copy(pos);
        sat.mesh.lookAt(0, 0, 0);
        sat.beacon.visible = Math.sin(tt * 5 + sat.phase * 3) > 0.55;
      }
      for (const sh of ships) {
        const f = (tt * 0.06 + sh.phase) % 1;
        const from = new THREE.Vector3(0.9, 0.5, 0.6).normalize().multiplyScalar(1.05);
        const to = moon.position.clone();
        const pos = from.clone().lerp(to, f);
        pos.y += Math.sin(f * Math.PI) * 0.35;
        sh.mesh.position.copy(pos);
        sh.mesh.lookAt(to);
        (sh.engine.material as THREE.SpriteMaterial).opacity = 0.65 + Math.sin(tt * 9 + sh.phase * 7) * 0.3;
      }
      for (const mm of missiles) {
        const f = (tt * 0.28 + mm.phase) % 1.6;
        if (f < 1) {
          mm.mesh.visible = true;
          const pos = mm.a.clone().lerp(mm.b, f);
          const lift = 1 + Math.sin(f * Math.PI) * 0.25;
          mm.mesh.position.copy(pos.normalize().multiplyScalar(lift));
          mm.trails.forEach((tr, ti) => {
            const fT = Math.max(0, f - 0.04 * (ti + 1));
            tr.visible = f > 0.04 * (ti + 1);
            const posT = mm.a.clone().lerp(mm.b, fT);
            const liftT = 1 + Math.sin(fT * Math.PI) * 0.25;
            tr.position.copy(posT.normalize().multiplyScalar(liftT));
            (tr.material as THREE.SpriteMaterial).opacity = (0.6 - ti * 0.16) * (0.6 + Math.sin(f * Math.PI) * 0.4);
          });
          mm.mesh.scale.setScalar(f > 0.93 ? 4.5 : 1 + Math.sin(f * Math.PI) * 0.5); // impact flash
        } else {
          mm.mesh.visible = false;
          for (const tr of mm.trails) tr.visible = false;
        }
      }
      if (portal) {
        portal.rotation.z += 0.02;
        (portal.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(tt * 2.2) * 0.3;
      }

      renderer.render(scene, camera);
    };
    animate();

    const onResize = (): void => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(repaintTimer);
      clearInterval(assetsTimer);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      globe.geometry.dispose();
      (globe.material as THREE.Material).dispose();
      dayTex.dispose();
      lightsTex.dispose();
      starGeo.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="planet-view">
      <div ref={mountRef} className="planet-mount" />
      <div className="planet-hint">{t('planet.hint')}</div>
    </div>
  );
}
