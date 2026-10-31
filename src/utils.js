import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const COURT = {
  halfW: 5.65,
  halfL: 10.25,
  netH: 1.02,
  playerZ: 8.35,
  aiZ: -8.35,
  ballR: 0.18,
  gravity: -19.5,
};

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const sign = (v) => (v < 0 ? -1 : 1);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOutCubic = (t) => {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const wrap = (v, min, max) => {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
};

export function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  if (value > target) return Math.max(target, value - amount);
  return target;
}

/** Solve the launch velocity needed to reach `to` from `from` in `time` seconds. */
export function ballisticVelocity(from, to, time, gravity = -19.5, out = new THREE.Vector3()) {
  const t = Math.max(0.05, time);
  return out.set(
    (to.x - from.x) / t,
    (to.y - from.y) / t - 0.5 * gravity * t,
    (to.z - from.z) / t
  );
}

/** Numerically find where a ballistic ball crosses the floor. */
export function predictLanding(pos, vel, gravity = -19.5, floor = 0.16, step = 1 / 90) {
  const p = pos.clone();
  const v = vel.clone();
  let t = 0;
  for (let i = 0; i < 260; i++) {
    v.y += gravity * step;
    p.addScaledVector(v, step);
    t += step;
    if (p.y <= floor && v.y < 0) {
      return { x: p.x, z: p.z, time: t, y: floor };
    }
    if (Math.abs(p.x) > 22 || p.z < -30 || p.z > 30) break;
  }
  return { x: p.x, z: p.z, time: t, y: floor };
}

export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function radialTexture(size = 128, rgb = '255,255,255', hardness = 0.08) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(hardness, `rgba(${rgb},0.95)`);
    g.addColorStop(0.35, `rgba(${rgb},0.3)`);
    g.addColorStop(0.7, `rgba(${rgb},0.06)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function glowTexture() {
  return radialTexture(256, '255,255,255', 0.05);
}

export function textTexture(text, {
  width = 1024,
  height = 256,
  color = '#dffcff',
  accent = '#2ce8ff',
  sub = '',
  font = '900 120px Orbitron, Arial Black, sans-serif',
  subFont = '600 26px Rajdhani, sans-serif',
  align = 'center',
} = {}) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const x = align === 'left' ? 40 : w / 2;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 32;
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(align === 'left' ? 40 : w * 0.2, h * 0.72, w * 0.6, 3);
    ctx.globalAlpha = 1;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, x, h * (sub ? 0.4 : 0.5));
    if (sub) {
      ctx.shadowBlur = 14;
      ctx.font = subFont;
      ctx.fillStyle = accent;
      ctx.fillText(sub, x, h * 0.73);
    }
  });
}

export function windowTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, w, h);
    const cols = 6;
    const rows = 18;
    const cw = w / cols;
    const ch = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = Math.random();
        if (lit > 0.58) {
          const palette = ['#37d9ff', '#ff3ec8', '#ffd28a', '#7c8cff'];
          ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
          ctx.globalAlpha = 0.25 + Math.random() * 0.65;
          ctx.fillRect(x * cw + cw * 0.2, y * ch + ch * 0.22, cw * 0.6, ch * 0.42);
        }
      }
    }
    ctx.globalAlpha = 1;
  });
}

export function makeCourtGridTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(70,200,255,0.22)';
    ctx.lineWidth = 2;
    const cells = 32;
    for (let i = 0; i <= cells; i++) {
      const p = (i / cells) * w;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,60,200,0.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= cells; i++) {
      const p = (i / cells) * w;
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(w, 0);
      ctx.stroke();
    }
  });
}

export function disposeObject(root) {
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose?.();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        for (const key of Object.keys(m)) {
          const value = m[key];
          if (value && value.isTexture) value.dispose?.();
        }
        m.dispose?.();
      }
    }
  });
}
