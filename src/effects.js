import * as THREE from 'three';
import { TAU, rand, easeOutCubic, clamp, glowTexture } from './utils.js';

const PARTICLE_VERT = /* glsl */`
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (18.0 / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAG = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.time = 0;

    const MAX = 900;
    this.max = MAX;
    this.cursor = 0;
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    this.alphas = new Float32Array(MAX);
    this.velocities = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.gravity = new Float32Array(MAX);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry = geo;
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // shockwave pool
    this.ringGeo = new THREE.RingGeometry(0.92, 1.0, 64);
    this.waves = [];
    for (let i = 0; i < 18; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.ringGeo, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.waves.push({ mesh, material, life: 0, maxLife: 1, maxScale: 3, flat: false, billboard: false });
    }
    this.waveCursor = 0;

    this.trails = [];
  }

  burst(pos, {
    count = 20,
    color = 0x2ce8ff,
    speed = 5,
    speedVar = 3,
    life = 0.6,
    lifeVar = 0.4,
    size = 10,
    sizeVar = 6,
    gravity = -6,
    drag = 1.2,
    upBias = 0.3,
    spread = 1,
  } = {}) {
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const theta = rand(0, TAU);
      const z = rand(-1, 1);
      const r = Math.sqrt(1 - z * z);
      const sp = speed + rand(-speedVar, speedVar);
      this.positions[idx * 3] = pos.x;
      this.positions[idx * 3 + 1] = pos.y;
      this.positions[idx * 3 + 2] = pos.z;
      this.velocities[idx * 3] = Math.cos(theta) * r * sp * spread;
      this.velocities[idx * 3 + 1] = (z * sp + upBias * speed) * spread;
      this.velocities[idx * 3 + 2] = Math.sin(theta) * r * sp * spread;
      const l = Math.max(0.05, life + rand(-lifeVar, lifeVar));
      this.life[idx] = l;
      this.maxLife[idx] = l;
      this.drag[idx] = drag;
      this.gravity[idx] = gravity;
      const cc = base.clone();
      cc.offsetHSL(rand(-0.05, 0.05), rand(-0.15, 0.1), rand(-0.05, 0.18));
      this.colors[idx * 3] = cc.r;
      this.colors[idx * 3 + 1] = cc.g;
      this.colors[idx * 3 + 2] = cc.b;
      this.sizes[idx] = size + rand(-sizeVar, sizeVar);
      this.alphas[idx] = 1;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  wave(pos, {
    color = 0x2ce8ff,
    maxScale = 3,
    duration = 0.5,
    flat = false,
    opacity = 0.9,
    rotation = 0,
  } = {}) {
    const slot = this.waves[this.waveCursor];
    this.waveCursor = (this.waveCursor + 1) % this.waves.length;
    slot.mesh.position.copy(pos);
    slot.mesh.visible = true;
    slot.mesh.scale.setScalar(0.2);
    slot.material.color.set(color).multiplyScalar(1.8);
    slot.material.opacity = opacity;
    slot.life = duration;
    slot.maxLife = duration;
    slot.maxScale = maxScale;
    slot.flat = flat;
    slot.opacity = opacity;
    if (flat) {
      slot.mesh.quaternion.identity();
      slot.mesh.rotation.x = -Math.PI / 2;
      slot.mesh.rotation.z = rotation;
    } else {
      slot.mesh.quaternion.copy(this.camera.quaternion);
      slot.mesh.rotateZ(rotation);
    }
  }

  update(dt) {
    this.time += dt;
    const dirty = { pos: false, color: false, size: false, alpha: false };
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        dirty.alpha = true;
        dirty.size = true;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.velocities[i * 3] *= d;
      this.velocities[i * 3 + 1] = this.velocities[i * 3 + 1] * d + this.gravity[i] * dt;
      this.velocities[i * 3 + 2] *= d;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      this.alphas[i] = k * k;
      dirty.pos = true;
      dirty.alpha = true;
    }
    if (dirty.pos) this.geometry.attributes.position.needsUpdate = true;
    if (dirty.alpha) this.geometry.attributes.aAlpha.needsUpdate = true;
    if (dirty.size) this.geometry.attributes.aSize.needsUpdate = true;
    if (dirty.color) this.geometry.attributes.aColor.needsUpdate = true;

    for (const wave of this.waves) {
      if (wave.life <= 0) continue;
      wave.life -= dt;
      const t = clamp(1 - wave.life / wave.maxLife, 0, 1);
      const scale = 0.2 + easeOutCubic(t) * wave.maxScale;
      wave.mesh.scale.setScalar(scale);
      wave.material.opacity = wave.opacity * Math.pow(1 - t, 1.8);
      if (wave.life <= 0) wave.mesh.visible = false;
    }

    for (const trail of this.trails) trail.update(dt);
  }

  createMarker(color, radius = 0.6) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.8),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 48), mat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    const inner = new THREE.Mesh(new THREE.RingGeometry(radius * 0.25, radius * 0.31, 32), mat);
    inner.rotation.x = -Math.PI / 2;
    group.add(inner);

    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(radius * 0.08, radius * 0.32), mat);
      tick.rotation.x = -Math.PI / 2;
      tick.rotation.z = (i / 4) * TAU;
      tick.position.set(Math.cos((i / 4) * TAU) * radius * 1.18, 0, Math.sin((i / 4) * TAU) * radius * 1.18);
      group.add(tick);
    }

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.02, radius * 0.16, 1.4, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(0.7),
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    beam.position.y = 0.7;
    group.add(beam);
    group.position.y = 0.025;
    group.visible = false;
    this.scene.add(group);
    return {
      group,
      material: mat,
      setVisible(v) { group.visible = v; },
      setPosition(x, z) { group.position.set(x, 0.025, z); },
      setIntensity(v) {
        mat.opacity = clamp(v, 0, 1) * 0.9;
        beam.material.opacity = clamp(v, 0, 1) * 0.2;
      },
      pulse(time, speed = 3) {
        const s = 1 + Math.sin(time * speed) * 0.06;
        group.scale.set(s, 1, s);
        ring.rotation.z = time * 0.6;
      },
    };
  }

  createTrail({ color = 0x2ce8ff, length = 30, size = 0.24 } = {}) {
    const positions = new Float32Array(length * 3);
    const colors = new Float32Array(length * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    line.frustumCulled = false;
    this.scene.add(line);

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    }));
    points.frustumCulled = false;
    this.scene.add(points);

    const base = new THREE.Color(color);
    const history = new Array(length).fill(null).map(() => new THREE.Vector3());
    const head = { x: 0, y: 0, z: 0 };
    let has = false;
    let active = true;

    const trail = {
      line,
      points,
      setActive(v) {
        active = v;
        line.visible = v;
        points.visible = v;
        if (!v) has = false;
      },
      setColor(c) {
        base.set(c);
      },
      push(pos) {
        if (!active) return;
        if (!has) {
          for (const p of history) p.copy(pos);
          has = true;
        } else {
          for (let i = length - 1; i > 0; i--) history[i].copy(history[i - 1]);
          history[0].copy(pos);
        }
        for (let i = 0; i < length; i++) {
          const p = history[i];
          positions[i * 3] = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = p.z;
          const k = Math.pow(1 - i / length, 2.2);
          colors[i * 3] = base.r * k;
          colors[i * 3 + 1] = base.g * k;
          colors[i * 3 + 2] = base.b * k;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.color.needsUpdate = true;
      },
      update(dt) {
        if (!active) return;
        // gently collapse the tail when the ball stops moving
        for (let i = 1; i < length; i++) {
          const p = history[i];
          p.lerp(history[i - 1], dt * 1.8);
        }
        for (let i = 0; i < length; i++) {
          const p = history[i];
          positions[i * 3] = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = p.z;
        }
        geo.attributes.position.needsUpdate = true;
        pGeo.attributes.position.needsUpdate = true;
      },
    };
    this.trails.push(trail);
    return trail;
  }
}
