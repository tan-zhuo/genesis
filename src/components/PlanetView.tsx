// Planet view: the world rendered as a real 3D globe (Three.js).
// Presentation layer — day/night terminator, civilization lights on the dark
// side, atmosphere, stars. Analysis stays on the 2D map; this is the poster.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Universe } from '../state/simulatorStore';
import { MapStatic, Snapshot } from '../simulation/types';
import { buildTerrainCanvas } from './mapDetail';
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
    const eraT = Math.min(1, tech / 13);
    img.data[i * 4] = 255 * lum;
    img.data[i * 4 + 1] = (150 + eraT * 100) * lum;
    img.data[i * 4 + 2] = (50 + eraT * 205) * lum;
    img.data[i * 4 + 3] = 255 * lum;
  }
  cctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, MAP_RECT.x * TEX_W, MAP_RECT.y * TEX_H, MAP_RECT.w * TEX_W, MAP_RECT.h * TEX_H);
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
    camera.position.set(0, 0.7, 3.1);
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

    // --- Controls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.5;
    controls.maxDistance = 6;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    let raf = 0;
    const animate = (): void => {
      raf = requestAnimationFrame(animate);
      controls.update();
      globe.rotation.y += 0.0006; // the planet itself turns beneath the sun
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
