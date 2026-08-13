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

    // --- Globe ---
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 96),
      new THREE.MeshStandardMaterial({
        map: dayTex,
        emissiveMap: lightsTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 1.5,
        roughness: 0.9,
        metalness: 0,
      }),
    );
    // Face the known world toward the camera, terminator crossing it.
    globe.rotation.y = -Math.PI * 0.5;
    scene.add(globe);

    // Atmosphere rim
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.045, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x5aa2e8,
        transparent: true,
        opacity: 0.14,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(atmosphere);

    // Sun + fill
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
    sun.position.set(2.6, 1.1, 3.4);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x223044, 0.55));

    // Starfield (decorative — Math.random is fine outside the simulation)
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(1200 * 3);
    for (let i = 0; i < 1200; i++) {
      const r = 30 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xdde6f5, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.8 }),
    );
    scene.add(stars);

    // ---- The rest of the universe ----
    // Sun: visible disc + glow at the light's direction.
    const sunPos = new THREE.Vector3(2.6, 1.1, 3.4).normalize().multiplyScalar(26);
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc }),
    );
    sunDisc.position.copy(sunPos);
    scene.add(sunDisc);
    const sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    sunGlow.scale.set(9, 9, 1);
    sunGlow.position.copy(sunPos);
    scene.add(sunGlow);

    // The moon.
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 1 }),
    );
    scene.add(moon);

    // Sister planets of this system (deterministic from the world seed).
    const seedHash = universeRef.current.config.seed.split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const sisterColors = [0xc06a4a, 0x7a9ac8, 0xb8a06a];
    const sisters: { mesh: THREE.Mesh; r: number; speed: number; phase: number }[] = [];
    for (let i = 0; i < 2 + (seedHash % 2); i++) {
      const size = 0.28 + ((seedHash >> (i * 3)) % 10) / 28;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 24, 24),
        new THREE.MeshStandardMaterial({ color: sisterColors[i % 3], roughness: 0.95 }),
      );
      if (i === 1) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(size * 1.5, size * 2.3, 48),
          new THREE.MeshBasicMaterial({ color: 0xcbb98a, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }),
        );
        ring.rotation.x = Math.PI / 2.4;
        mesh.add(ring);
      }
      scene.add(mesh);
      sisters.push({ mesh, r: 9 + i * 5.5, speed: 0.02 / (i + 1), phase: (seedHash >> (i * 5)) % 628 / 100 });
    }

    // ---- Technology made visible: satellites, ships, missiles, the Gate ----
    const orbitGroup = new THREE.Group(); // satellites (world space, own spin)
    scene.add(orbitGroup);
    const surfaceGroup = new THREE.Group(); // attached to the globe (rotates with it)
    globe.add(surfaceGroup);
    const satellites: { mesh: THREE.Mesh; r: number; incl: number; speed: number; phase: number }[] = [];
    const ships: { mesh: THREE.Mesh; phase: number }[] = [];
    let missiles: { mesh: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3; phase: number }[] = [];
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
        const s = satellites.pop()!;
        orbitGroup.remove(s.mesh);
      }
      while (satellites.length < wantSats) {
        const i = satellites.length;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.02, 0.05),
          new THREE.MeshBasicMaterial({ color: 0xd8e6ff }),
        );
        orbitGroup.add(mesh);
        satellites.push({ mesh, r: 1.14 + (i % 4) * 0.055, incl: (i * 0.7) % 1.4 - 0.7, speed: 0.5 + (i % 3) * 0.17, phase: i * 1.33 });
      }

      // Ships: shuttles running to the moon once spaceflight exists.
      const wantShips = spacefarers.length > 0 ? 2 : 0;
      while (ships.length > wantShips) {
        const sh = ships.pop()!;
        scene.remove(sh.mesh);
      }
      while (ships.length < wantShips) {
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.025, 0.08, 8),
          new THREE.MeshBasicMaterial({ color: 0xaFe0ff }),
        );
        scene.add(mesh);
        ships.push({ mesh, phase: ships.length * 0.5 });
      }

      // Missiles: ballistic arcs over active fronts, once flight is known.
      for (const mm of missiles) surfaceGroup.remove(mm.mesh);
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
          new THREE.SphereGeometry(0.018, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff6a50 }),
        );
        surfaceGroup.add(mesh);
        missiles.push({ mesh, a: pa, b: pb, phase: missiles.length * 1.4 });
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
      const tt = performance.now() / 1000;

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
      }
      for (const sh of ships) {
        const f = (tt * 0.06 + sh.phase) % 1;
        const from = new THREE.Vector3(0.9, 0.5, 0.6).normalize().multiplyScalar(1.05);
        const to = moon.position.clone();
        const pos = from.clone().lerp(to, f);
        pos.y += Math.sin(f * Math.PI) * 0.35;
        sh.mesh.position.copy(pos);
        sh.mesh.lookAt(to);
        sh.mesh.rotateX(Math.PI / 2);
      }
      for (const mm of missiles) {
        const f = (tt * 0.28 + mm.phase) % 1.6;
        if (f < 1) {
          mm.mesh.visible = true;
          const pos = mm.a.clone().lerp(mm.b, f);
          const lift = 1 + Math.sin(f * Math.PI) * 0.25;
          mm.mesh.position.copy(pos.normalize().multiplyScalar(lift));
          const heat = 0.018 * (1 + Math.sin(f * Math.PI));
          mm.mesh.scale.setScalar(f > 0.93 ? 4.5 : heat / 0.018); // impact flash
        } else {
          mm.mesh.visible = false;
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
