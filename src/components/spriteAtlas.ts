// Pre-rendered sprite atlas. Every unit is painted ONCE at high resolution —
// dark outlines, two-tone shading, animation frames, garments dyed in the
// nation's colour — and then only blitted at runtime. Detail is paid for at
// build time, so the per-frame cost stays a single drawImage per unit.

export interface Sprite {
  c: HTMLCanvasElement;
  w: number;
  h: number;
  ax: number; // anchor x (px in sprite space)
  ay: number; // anchor y — the FEET / ground point for standing units
}

const cache = new Map<string, Sprite>();

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function make(key: string, w: number, h: number, ax: number, ay: number, paint: Painter): Sprite {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paint(ctx, w, h);
  const s = { c, w, h, ax, ay };
  cache.set(key, s);
  return s;
}

const OUTLINE = '#181310';

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

/** Outlined, two-tone-shaded shape helper: fill a path, darker right half, outline. */
function bodyPart(
  ctx: CanvasRenderingContext2D,
  path: () => void,
  fill: string,
  outline = true,
): void {
  ctx.save();
  ctx.beginPath();
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.clip();
  // shade the right third (light comes from upper-left)
  ctx.fillStyle = 'rgba(20, 12, 8, 0.22)';
  ctx.beginPath();
  path();
  ctx.rect(ctx.canvas.width * 0.6, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fill();
  ctx.restore();
  if (outline) {
    ctx.beginPath();
    path();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
}

const SKINS = ['#e8c9a2', '#d2a077', '#a9744f'];

// ---------------------------------------------------------------- civilians
// 48×48, anchor at feet centre (24, 46). Facing RIGHT; flip at draw time.
// roles: 0 peasant, 1 head-porter, 2 robed elder, 3 child
// frames: 0..3 walk cycle (0 = contact, 2 = opposite contact), 0 doubles as idle
export function civilianSprite(role: number, frame: number, color: string): Sprite {
  return make(`civ:${role}:${frame}:${color}`, 48, 48, 24, 46, (ctx) => {
    const skin = SKINS[(role * 7 + 1) % SKINS.length];
    const cloth = role === 2 ? shadeHex(color, 0.72) : color;
    const scale = role === 3 ? 0.68 : 1;
    ctx.translate(24, 46);
    ctx.scale(scale, scale);
    const swing = [1, 0.4, -1, -0.4][frame % 4]; // leg/arm phase
    const bob = Math.abs(swing) < 0.5 ? -1.2 : 0;
    ctx.translate(0, bob);
    // far leg
    bodyPart(ctx, () => {
      ctx.moveTo(-1, -13);
      ctx.lineTo(-1 - swing * 5.5, 0);
      ctx.lineTo(-4.4 - swing * 5.5, 0);
      ctx.lineTo(-4.2, -13);
    }, '#4a3d33');
    // near leg
    bodyPart(ctx, () => {
      ctx.moveTo(4.2, -13);
      ctx.lineTo(4.4 + swing * 5.5, 0);
      ctx.lineTo(1 + swing * 5.5, 0);
      ctx.lineTo(1, -13);
    }, '#5d4d40');
    // torso (tunic / robe)
    const hem = role === 2 ? -4 : -12;
    bodyPart(ctx, () => {
      ctx.moveTo(-6.5, -26);
      ctx.lineTo(6.5, -26);
      ctx.lineTo(8, hem);
      ctx.lineTo(-8, hem);
    }, cloth);
    // belt
    if (role !== 2) {
      ctx.fillStyle = '#3d2f22';
      ctx.fillRect(-7.4, -15, 14.8, 2.6);
    }
    // far arm (swings opposite the near leg)
    bodyPart(ctx, () => {
      ctx.moveTo(-6, -25);
      ctx.lineTo(-7 - swing * 4, -14);
      ctx.lineTo(-9.6 - swing * 4, -14.6);
      ctx.lineTo(-8.4, -25);
    }, shadeHex(cloth, 0.8));
    // near arm
    bodyPart(ctx, () => {
      ctx.moveTo(6, -25);
      ctx.lineTo(7 + swing * 4, -14);
      ctx.lineTo(9.6 + swing * 4, -14.6);
      ctx.lineTo(8.4, -25);
    }, cloth);
    // hands
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(-7.6 - swing * 4, -13.6, 2, 0, Math.PI * 2);
    ctx.arc(7.6 + swing * 4, -13.6, 2, 0, Math.PI * 2);
    ctx.fill();
    // head
    bodyPart(ctx, () => {
      ctx.arc(0.6, -31, 5.6, 0, Math.PI * 2);
    }, skin);
    // hair / hat
    if (role === 2) {
      // hood
      bodyPart(ctx, () => {
        ctx.arc(0.6, -32, 6.2, Math.PI * 0.95, Math.PI * 2.05);
      }, shadeHex(color, 0.55));
    } else {
      ctx.fillStyle = role === 3 ? '#6b4a2c' : '#3c2e20';
      ctx.beginPath();
      ctx.arc(0.2, -33.4, 5, Math.PI * 0.9, Math.PI * 2.02);
      ctx.fill();
    }
    // porter's basket
    if (role === 1) {
      bodyPart(ctx, () => {
        ctx.moveTo(-7, -38);
        ctx.lineTo(7, -38);
        ctx.lineTo(5.4, -44);
        ctx.lineTo(-5.4, -44);
      }, '#9a6f3f');
      ctx.strokeStyle = '#6b4a26';
      ctx.lineWidth = 1.2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 3.4 - 0.8, -38);
        ctx.lineTo(i * 3.2 - 0.6, -44);
        ctx.stroke();
      }
    }
  });
}

// ----------------------------------------------------------------- soldiers
// 48×48, feet at (24,46), facing RIGHT (toward the enemy). Flip for the foe.
// era 0 spearman, 1 musketeer, 2 modern rifleman (crouched)
// frames: 0 ready, 1 attack, 2 recover
export function soldierSprite(era: number, frame: number, color: string): Sprite {
  return make(`sol:${era}:${frame}:${color}`, 48, 48, 24, 46, (ctx) => {
    const skin = SKINS[era % SKINS.length];
    ctx.translate(24, 46);
    const lunge = frame === 1 ? 4 : frame === 2 ? 1.5 : 0;
    if (era === 2) ctx.translate(0, 6); // crouched profile is lower
    ctx.translate(lunge * 0.6, 0);
    // legs braced
    bodyPart(ctx, () => {
      ctx.moveTo(-2, -12);
      ctx.lineTo(-7.5, 0);
      ctx.lineTo(-10.5, 0);
      ctx.lineTo(-5, -12.5);
    }, era === 2 ? '#3f4436' : '#4a3d33');
    bodyPart(ctx, () => {
      ctx.moveTo(3.4, -12.5);
      ctx.lineTo(7 + lunge, 0);
      ctx.lineTo(4 + lunge, 0);
      ctx.lineTo(0.6, -12);
    }, era === 2 ? '#4a5040' : '#5d4d40');
    // torso: uniform dyed in the nation's colour
    const coat = era === 2 ? shadeHex(color, 0.62) : color;
    bodyPart(ctx, () => {
      ctx.moveTo(-6.5, -25.5);
      ctx.lineTo(6.5, -25.5);
      ctx.lineTo(7.6, -11);
      ctx.lineTo(-7.6, -11);
    }, coat);
    // cross-belt / webbing
    ctx.strokeStyle = era === 0 ? '#c9b48a' : era === 1 ? '#e8e2d2' : '#2e2a22';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-5.5, -24);
    ctx.lineTo(6, -13);
    ctx.stroke();
    // head + era headgear
    bodyPart(ctx, () => {
      ctx.arc(0.8, -30.5, 5.4, 0, Math.PI * 2);
    }, skin);
    if (era === 0) {
      // bronze helmet with crest
      bodyPart(ctx, () => {
        ctx.arc(0.8, -31.5, 5.8, Math.PI * 0.92, Math.PI * 2.06);
      }, '#b09548');
      ctx.fillStyle = shadeHex(color, 0.85);
      ctx.fillRect(-1.4, -41, 3.6, 5.5);
    } else if (era === 1) {
      // tricorn / shako
      bodyPart(ctx, () => {
        ctx.moveTo(-6.8, -33.5);
        ctx.lineTo(8, -33.5);
        ctx.lineTo(6, -39.5);
        ctx.lineTo(-4.6, -39.5);
      }, '#2b2420');
    } else {
      // steel helmet
      bodyPart(ctx, () => {
        ctx.arc(0.8, -32, 6.2, Math.PI * 0.85, Math.PI * 2.12);
      }, '#5c6152');
    }
    // weapon
    if (era === 0) {
      // spear (thrusts on frame 1) + round shield on the far side
      const reach = frame === 1 ? 21 : frame === 2 ? 15 : 12;
      ctx.strokeStyle = '#8a6f4c';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-6, -14);
      ctx.lineTo(reach, -20);
      ctx.stroke();
      bodyPart(ctx, () => {
        ctx.moveTo(reach, -21.6);
        ctx.lineTo(reach + 5.5, -20);
        ctx.lineTo(reach, -18.4);
      }, '#cfd6de');
      bodyPart(ctx, () => {
        ctx.arc(-4, -17, 7, 0, Math.PI * 2);
      }, shadeHex(color, 0.8));
      ctx.fillStyle = '#c9b48a';
      ctx.beginPath();
      ctx.arc(-4, -17, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // arm gripping the spear
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(5, -17.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // musket / rifle levelled at the enemy
      const gunY = era === 2 ? -16 : -19;
      ctx.strokeStyle = '#4a3826';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-5, gunY + 2.5);
      ctx.lineTo(14, gunY);
      ctx.stroke();
      ctx.strokeStyle = '#2c2c30';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(4, gunY + 0.6);
      ctx.lineTo(17, gunY - 0.4);
      ctx.stroke();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(3, gunY + 1.5, 2.3, 0, Math.PI * 2);
      ctx.arc(9.5, gunY + 0.6, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** A fallen soldier, lying where they fell (drawn horizontal, tinted faintly). */
export function fallenSprite(color: string): Sprite {
  return make(`fallen:${color}`, 48, 24, 24, 14, (ctx) => {
    ctx.translate(24, 12);
    ctx.globalAlpha = 0.88;
    bodyPart(ctx, () => {
      ctx.moveTo(-14, -2);
      ctx.lineTo(6, -3.4);
      ctx.lineTo(6.6, 2.4);
      ctx.lineTo(-13.4, 3.6);
    }, shadeHex(color, 0.5));
    bodyPart(ctx, () => {
      ctx.arc(10.5, -0.5, 4, 0, Math.PI * 2);
    }, shadeHex(SKINS[0], 0.75));
    bodyPart(ctx, () => {
      ctx.moveTo(-14, 3);
      ctx.lineTo(-20, 6.5);
      ctx.lineTo(-21.5, 4);
      ctx.lineTo(-15, 0.6);
    }, '#4a3d33');
  });
}

// --------------------------------------------------------------------- cars
// 64×36, anchor centre, facing RIGHT.
const CAR_BODIES = ['#b8352c', '#2f5fa8', '#d8d5cd', '#31353a', '#b8860b'];
export function carSprite(style: number): Sprite {
  return make(`car:${style}`, 64, 36, 32, 18, (ctx) => {
    const body = CAR_BODIES[style % CAR_BODIES.length];
    ctx.translate(32, 18);
    // shadow under chassis
    ctx.fillStyle = 'rgba(6, 8, 12, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 11.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // wheels
    ctx.fillStyle = '#15161a';
    for (const wx of [-13, 12]) {
      ctx.fillRect(wx - 4.5, -12.5, 9, 4.5);
      ctx.fillRect(wx - 4.5, 8, 9, 4.5);
    }
    // body
    bodyPart(ctx, () => {
      ctx.moveTo(-24, -8);
      ctx.quadraticCurveTo(-26, 0, -24, 8);
      ctx.lineTo(20, 8.6);
      ctx.quadraticCurveTo(26.5, 0, 20, -8.6);
      ctx.closePath();
    }, body);
    // greenhouse (roof + glass)
    bodyPart(ctx, () => {
      ctx.moveTo(-12, -5.6);
      ctx.lineTo(9, -6.2);
      ctx.lineTo(12.5, 0);
      ctx.lineTo(9, 6.2);
      ctx.lineTo(-12, 5.6);
      ctx.closePath();
    }, shadeHex(body, 1.18));
    ctx.fillStyle = '#1d2733';
    ctx.fillRect(9, -5.4, 3.4, 10.8); // windshield
    ctx.fillRect(-13.5, -4.8, 3, 9.6); // rear glass
    // headlights / tail lights
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(23, -7.2, 2.6, 3.6);
    ctx.fillRect(23, 3.6, 2.6, 3.6);
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(-25.5, -6.8, 2.2, 3.2);
    ctx.fillRect(-25.5, 3.6, 2.2, 3.2);
  });
}

// -------------------------------------------------------------------- plane
// 96×96, anchor centre, nose pointing RIGHT. Tail fin dyed in nation colour.
export function planeSprite(color: string): Sprite {
  return make(`plane:${color}`, 96, 96, 48, 48, (ctx) => {
    ctx.translate(48, 48);
    // swept main wings
    bodyPart(ctx, () => {
      ctx.moveTo(6, 0);
      ctx.lineTo(-14, -34);
      ctx.lineTo(-22, -33);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-22, 33);
      ctx.lineTo(-14, 34);
      ctx.closePath();
    }, '#c7ced8');
    // engines on the wings
    for (const s of [-1, 1]) {
      bodyPart(ctx, () => {
        ctx.moveTo(-6, s * 16 - 3);
        ctx.lineTo(3, s * 16 - 3);
        ctx.lineTo(3, s * 16 + 3);
        ctx.lineTo(-6, s * 16 + 3);
      }, '#8a93a2');
    }
    // tailplane
    bodyPart(ctx, () => {
      ctx.moveTo(-30, 0);
      ctx.lineTo(-42, -13);
      ctx.lineTo(-46, -12);
      ctx.lineTo(-38, 0);
      ctx.lineTo(-46, 12);
      ctx.lineTo(-42, 13);
      ctx.closePath();
    }, '#c7ced8');
    // fuselage
    bodyPart(ctx, () => {
      ctx.moveTo(38, 0);
      ctx.quadraticCurveTo(38, -5.5, 26, -5.5);
      ctx.lineTo(-38, -4);
      ctx.quadraticCurveTo(-46, 0, -38, 4);
      ctx.lineTo(26, 5.5);
      ctx.quadraticCurveTo(38, 5.5, 38, 0);
    }, '#e8ecf2');
    // cockpit
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.moveTo(36, -1.8);
    ctx.quadraticCurveTo(38, 0, 36, 1.8);
    ctx.lineTo(30, 2.6);
    ctx.lineTo(30, -2.6);
    ctx.closePath();
    ctx.fill();
    // cabin windows
    ctx.fillStyle = '#31414f';
    for (let x = 24; x > -32; x -= 5) ctx.fillRect(x, -2.2, 2.4, 2);
    // livery stripe + dyed tail fin
    ctx.fillStyle = color;
    ctx.fillRect(-38, 2.2, 62, 2);
    bodyPart(ctx, () => {
      ctx.moveTo(-34, -1);
      ctx.lineTo(-44, -1);
      ctx.lineTo(-47, -10);
      ctx.lineTo(-40, -10);
      ctx.closePath();
    }, color);
  });
}

// ------------------------------------------------------------------ effects
export function smokePuff(): Sprite {
  return make('fx:smoke', 64, 64, 32, 32, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(88, 84, 80, 0.85)');
    g.addColorStop(0.55, 'rgba(70, 68, 66, 0.5)');
    g.addColorStop(1, 'rgba(60, 58, 56, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

export function powderSmoke(): Sprite {
  return make('fx:powder', 64, 64, 32, 32, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
    g.addColorStop(0, 'rgba(225, 222, 210, 0.9)');
    g.addColorStop(0.6, 'rgba(200, 198, 188, 0.45)');
    g.addColorStop(1, 'rgba(190, 188, 180, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

export function firePuff(): Sprite {
  return make('fx:fire', 64, 64, 32, 40, (ctx) => {
    const g = ctx.createRadialGradient(32, 38, 2, 32, 34, 26);
    g.addColorStop(0, 'rgba(255, 236, 160, 0.95)');
    g.addColorStop(0.4, 'rgba(255, 140, 40, 0.8)');
    g.addColorStop(0.75, 'rgba(200, 60, 20, 0.35)');
    g.addColorStop(1, 'rgba(120, 30, 10, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.quadraticCurveTo(50, 26, 46, 42);
    ctx.quadraticCurveTo(42, 56, 32, 56);
    ctx.quadraticCurveTo(22, 56, 18, 42);
    ctx.quadraticCurveTo(14, 26, 32, 4);
    ctx.fill();
  });
}

export function muzzleFlash(): Sprite {
  return make('fx:muzzle', 48, 48, 10, 24, (ctx) => {
    ctx.translate(10, 24);
    ctx.fillStyle = 'rgba(255, 244, 190, 0.95)';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r1 = i % 2 === 0 ? 16 : 6;
      ctx.lineTo(Math.cos(a) * r1 * 1.6, Math.sin(a) * r1 * 0.7);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 190, 90, 0.85)';
    ctx.beginPath();
    ctx.arc(2, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Explosion, 3 frames: flash → fireball → dissipating smoke ring. */
export function explosionSprite(frame: number): Sprite {
  return make(`fx:boom:${frame}`, 96, 96, 48, 48, (ctx) => {
    ctx.translate(48, 48);
    if (frame === 0) {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
      g.addColorStop(0, 'rgba(255, 250, 220, 1)');
      g.addColorStop(0.6, 'rgba(255, 200, 90, 0.9)');
      g.addColorStop(1, 'rgba(255, 140, 40, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-48, -48, 96, 96);
    } else if (frame === 1) {
      const g = ctx.createRadialGradient(0, -4, 4, 0, -4, 38);
      g.addColorStop(0, 'rgba(255, 236, 150, 0.95)');
      g.addColorStop(0.4, 'rgba(255, 130, 40, 0.85)');
      g.addColorStop(0.8, 'rgba(140, 50, 20, 0.5)');
      g.addColorStop(1, 'rgba(80, 40, 24, 0)');
      ctx.fillStyle = g;
      for (const [bx, by, br] of [[0, -6, 20], [-12, 2, 13], [12, 2, 13], [0, 8, 15]] as const) {
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = 'rgba(120, 112, 104, 0.55)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(90, 84, 78, 0.4)';
      for (const [bx, by, br] of [[-16, -14, 9], [14, -16, 8], [0, -24, 9]] as const) {
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

export function arrowSprite(): Sprite {
  return make('fx:arrow', 40, 12, 20, 6, (ctx) => {
    ctx.translate(0, 6);
    ctx.strokeStyle = '#5a4632';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(34, 0);
    ctx.stroke();
    ctx.fillStyle = '#cfd6de';
    ctx.beginPath();
    ctx.moveTo(40, 0);
    ctx.lineTo(33, -3);
    ctx.lineTo(33, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d8d2c4';
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(0, -4);
    ctx.lineTo(7, -1);
    ctx.closePath();
    ctx.moveTo(4, 0);
    ctx.lineTo(0, 4);
    ctx.lineTo(7, 1);
    ctx.closePath();
    ctx.fill();
  });
}

/** War banner, 3 wave frames, dyed. Pole base at anchor. */
export function flagSprite(color: string, frame: number): Sprite {
  return make(`fx:flag:${color}:${frame}`, 48, 64, 8, 62, (ctx) => {
    ctx.translate(8, 62);
    ctx.strokeStyle = '#6b5b46';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -56);
    ctx.stroke();
    ctx.fillStyle = '#c9b46a';
    ctx.beginPath();
    ctx.arc(0, -57, 2.6, 0, Math.PI * 2);
    ctx.fill();
    const wave = [0, 3.5, -3.5][frame % 3];
    bodyPart(ctx, () => {
      ctx.moveTo(1.5, -55);
      ctx.quadraticCurveTo(16, -53 + wave, 32, -50 + wave * 0.6);
      ctx.lineTo(30, -36 + wave * 0.4);
      ctx.quadraticCurveTo(15, -40 - wave * 0.6, 1.5, -37);
      ctx.closePath();
    }, color);
    // emblem
    ctx.fillStyle = 'rgba(255, 240, 200, 0.85)';
    ctx.beginPath();
    ctx.arc(15, -45 + wave * 0.4, 3.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Blit helper: draw sprite scaled to `hpx` tall, anchored, optional flip/rotate. */
export function blit(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  hpx: number,
  opts?: { flip?: boolean; rot?: number; alpha?: number },
): void {
  const k = hpx / s.h;
  ctx.save();
  ctx.translate(x, y);
  if (opts?.rot) ctx.rotate(opts.rot);
  if (opts?.flip) ctx.scale(-1, 1);
  if (opts?.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(s.c, -s.ax * k, -s.ay * k, s.w * k, s.h * k);
  ctx.restore();
}
