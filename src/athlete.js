import * as THREE from 'three';
import { TAU, clamp, lerp, smoothstep, radialTexture } from './utils.js';

const UP = new THREE.Vector3(0, 1, 0);

function capsule(radius, length, mat) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), mat);
  mesh.castShadow = true;
  return mesh;
}

function makeStrings(radius, color) {
  const positions = [];
  const count = 7;
  for (let i = 1; i < count; i++) {
    const y = -radius + (i / count) * radius * 2;
    const half = Math.sqrt(Math.max(0, radius * radius - y * y));
    positions.push(-half, y, 0, half, y, 0);
    positions.push(y, -half, 0, y, half, 0);
  }
  // clip the vertical lines into a circular-ish bundle by shifting them
  const geo = new THREE.BufferGeometry();
  const arr = [];
  for (let i = 0; i < positions.length; i += 6) {
    const x1 = positions[i], y1 = positions[i + 1];
    const x2 = positions[i + 2], y2 = positions[i + 3];
    if (Math.hypot(x1, y1) > radius || Math.hypot(x2, y2) > radius) continue;
    arr.push(x1, y1, 0, x2, y2, 0);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.4),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
}

export function createAthlete({ tint = 0x2ce8ff, accent = 0x9ffcff, ai = false } = {}) {
  const tintColor = new THREE.Color(tint);
  const accentColor = new THREE.Color(accent);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const suitMat = new THREE.MeshStandardMaterial({
    color: 0x12283c,
    emissive: 0x071b2c,
    emissiveIntensity: 0.55,
    metalness: 0.35,
    roughness: 0.46,
    envMapIntensity: 1.15,
  });
  const suitLight = new THREE.MeshStandardMaterial({
    color: 0x1d3b54,
    emissive: 0x0b2740,
    emissiveIntensity: 0.65,
    metalness: 0.3,
    roughness: 0.5,
    envMapIntensity: 1.0,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: tintColor.clone().multiplyScalar(0.22),
    emissive: tintColor.clone(),
    emissiveIntensity: 1.35,
    metalness: 0.7,
    roughness: 0.24,
    envMapIntensity: 1.1,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor.clone().multiplyScalar(0.45),
    emissive: accentColor.clone(),
    emissiveIntensity: 2.2,
    metalness: 0.5,
    roughness: 0.2,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: tintColor.clone().multiplyScalar(2.7),
    toneMapped: false,
  });
  const whiteGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1, 1, 1).multiplyScalar(2.2),
    toneMapped: false,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x040810,
    metalness: 0.95,
    roughness: 0.18,
  });

  // ---------------- legs ----------------
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.17, 0.92, 0);
    body.add(hip);
    const thigh = capsule(0.095, 0.22, suitMat);
    thigh.position.y = -0.19;
    thigh.scale.z = 1.12;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.4;
    hip.add(knee);
    const shin = capsule(0.078, 0.22, suitLight);
    shin.position.y = -0.19;
    knee.add(shin);
    const shinGlow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.02), glowMat);
    shinGlow.position.set(0, -0.17, -0.075);
    knee.add(shinGlow);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.36), suitMat);
    boot.position.set(0, -0.44, -0.08);
    boot.castShadow = true;
    knee.add(boot);
    const bootGlow = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.25), glowMat);
    bootGlow.position.set(0, -0.39, -0.09);
    knee.add(bootGlow);
    legs.push({ hip, knee, side });
  }

  // ---------------- torso ----------------
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.2, 0.2, 12), suitMat);
  hips.position.y = 0.98;
  hips.castShadow = true;
  body.add(hips);

  const torso = capsule(0.25, 0.46, suitMat);
  torso.position.y = 1.27;
  torso.scale.set(1.28, 1.0, 0.82);
  body.add(torso);

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.27, 0.08), armorMat);
  chestPlate.position.set(0, 1.35, -0.19);
  chestPlate.castShadow = true;
  body.add(chestPlate);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 20), glowMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.52;
  body.add(collar);

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), accentMat);
  core.position.set(0, 1.4, -0.24);
  body.add(core);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(64, ai ? '255,80,210' : '80,240,255', 0.03),
    color: accentColor.clone().multiplyScalar(1.5),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  coreGlow.scale.setScalar(0.7);
  coreGlow.position.set(0, 1.4, -0.27);
  body.add(coreGlow);

  // waist trim
  for (const side of [-1, 1]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.03), glowMat);
    trim.position.set(side * 0.19, 1.13, -0.13);
    trim.rotation.z = side * 0.18;
    body.add(trim);
  }

  // ---------------- head ----------------
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.12, 8), suitLight);
  neck.position.y = 1.62;
  body.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 16), suitLight);
  head.position.y = 1.81;
  head.scale.set(0.95, 1.08, 0.92);
  head.castShadow = true;
  body.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 20, 16, 0, TAU, 0, Math.PI * 0.62), darkMetal);
  helmet.position.y = 1.84;
  helmet.scale.set(1.02, 1.02, 1.04);
  helmet.castShadow = true;
  body.add(helmet);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.062, 0.055), ai ? whiteGlowMat : accentMat);
  visor.position.set(0, 1.83, -0.142);
  visor.rotation.x = -0.12;
  body.add(visor);

  const visorGlow = glowSpriteLocal(ai ? 0xff8be5 : 0x8ffcff, 0.62, 0.65);
  visorGlow.position.set(0, 1.83, -0.18);
  body.add(visorGlow);

  // crest / antenna
  if (ai) {
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.28, 6), darkMetal);
    antenna.position.set(0.13, 2.02, 0.03);
    antenna.rotation.z = -0.3;
    body.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), glowMat);
    tip.position.set(0.17, 2.15, 0.03);
    body.add(tip);
  } else {
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.2), armorMat);
    crest.position.set(0, 1.98, 0.02);
    crest.rotation.x = -0.18;
    body.add(crest);
  }

  // shoulder pads / orbs
  const shoulders = [];
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), suitMat);
    pad.position.set(side * 0.37, 1.46, 0);
    pad.scale.set(1.1, 0.85, 0.95);
    pad.castShadow = true;
    body.add(pad);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.016, 5, 16, Math.PI), glowMat);
    cap.position.set(side * 0.39, 1.49, 0);
    cap.rotation.set(0, 0, side > 0 ? -0.2 : Math.PI + 0.2);
    body.add(cap);
    shoulders.push(pad);
  }

  // ---------------- arms ----------------
  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.38, 1.45, 0);
    body.add(shoulder);

    const upper = capsule(0.072, 0.2, suitMat);
    upper.position.y = -0.16;
    shoulder.add(upper);
    const upperGlow = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.15, 0.025), glowMat);
    upperGlow.position.set(side * 0.055, -0.16, -0.04);
    shoulder.add(upperGlow);

    const elbow = new THREE.Group();
    elbow.position.y = -0.33;
    shoulder.add(elbow);

    const forearm = capsule(0.06, 0.2, suitLight);
    forearm.position.y = -0.16;
    elbow.add(forearm);
    const forearmGlow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.02), glowMat);
    forearmGlow.position.set(side * 0.04, -0.16, -0.035);
    elbow.add(forearmGlow);

    const hand = new THREE.Group();
    hand.position.y = -0.34;
    elbow.add(hand);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), darkMetal);
    fist.scale.set(0.9, 1.05, 0.9);
    fist.castShadow = true;
    hand.add(fist);

    return { shoulder, elbow, hand };
  }

  const armL = makeArm(-1);
  armL.shoulder.rotation.set(0.22, 0, -0.32);
  armL.elbow.rotation.set(0.55, 0, 0);

  const armR = makeArm(1);
  armR.shoulder.rotation.set(1.0, -0.25, -0.12);
  armR.elbow.rotation.set(0.55, 0, 0);
  armR.hand.rotation.set(-1.25, 0, 0);

  // ---------------- racket ----------------
  const racket = new THREE.Group();
  armR.hand.add(racket);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.36, 10), darkMetal);
  grip.position.y = -0.12;
  grip.castShadow = true;
  racket.add(grip);
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.008, 5, 12), glowMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.24 + i * 0.085;
    racket.add(ring);
  }

  const throat = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8), suitMat);
  throat.position.y = 0.12;
  racket.add(throat);

  const hoop = new THREE.Group();
  hoop.position.y = 0.52;
  racket.add(hoop);

  const hoopRadius = 0.36;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(hoopRadius, 0.028, 8, 40), armorMat);
  rim.castShadow = true;
  hoop.add(rim);

  const rimInner = new THREE.Mesh(new THREE.TorusGeometry(hoopRadius - 0.045, 0.009, 5, 36), glowMat);
  hoop.add(rimInner);

  const strings = makeStrings(hoopRadius - 0.02, tint);
  hoop.add(strings);

  const sweetSpot = new THREE.Mesh(
    new THREE.CircleGeometry(0.085, 16),
    new THREE.MeshBasicMaterial({
      color: accentColor.clone().multiplyScalar(2.2),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
  );
  hoop.add(sweetSpot);

  // energy slash arc, hidden until a swing
  const slashMat = new THREE.MeshBasicMaterial({
    color: tintColor.clone().multiplyScalar(2.4),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const slash = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 32, 1, 0.2, Math.PI * 1.45), slashMat);
  slash.position.y = 0.52;
  slash.rotation.z = -0.4;
  racket.add(slash);

  // racket aura
  const racketGlow = glowSpriteLocal(ai ? 0xff72dc : 0x7ef7ff, 1.5, 0.32);
  racketGlow.position.y = 0.52;
  hoop.add(racketGlow);

  // ---------------- aura / extras ----------------
  const footGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 2.1),
    new THREE.MeshBasicMaterial({
      map: radialTexture(128, ai ? '255,60,200' : '50,230,255', 0.02),
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  footGlow.rotation.x = -Math.PI / 2;
  footGlow.position.y = 0.02;
  root.add(footGlow);

  // Soft camera-side key so the suit silhouette never crushes to black.
  const fillLight = new THREE.PointLight(tint, 18, 5.5, 2);
  fillLight.position.set(0, 2.2, ai ? -2.0 : 2.0);
  root.add(fillLight);

  let halo = null;
  if (ai) {
    halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.29, 0.012, 5, 36),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xff4fd0).multiplyScalar(2.2),
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    halo.position.set(0, 2.02, 0.05);
    halo.rotation.x = 1.2;
    body.add(halo);
  }

  root.traverse((child) => {
    if (child.isMesh && child.material && child.material.isMeshStandardMaterial) {
      child.castShadow = true;
    }
  });
  hoop.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  // ---------------- runtime ----------------
  const state = {
    swingTime: 0,
    swingDuration: 0.32,
    speed: 0,
    lean: 0,
    superMode: false,
    time: Math.random() * 10,
    baseY: 0,
  };
  const rest = {
    shoulderX: 1.0,
    shoulderY: -0.25,
    shoulderZ: -0.12,
    torsoY: 0,
  };

  function triggerSwing() {
    state.swingTime = state.swingDuration;
  }

  function animate(dt, time, opts = {}) {
    state.time = time;
    const moving = clamp(opts.speed ?? 0, 0, 1);
    const phase = time * (7.5 + moving * 2.5);
    const bob = moving > 0.05 ? Math.abs(Math.sin(phase)) * 0.045 * moving : Math.sin(time * 1.8) * 0.012;
    const breathe = Math.sin(time * 1.5) * 0.01;

    body.position.y = bob + breathe;
    body.rotation.x = lerp(body.rotation.x, -0.055 - moving * 0.055, 1 - Math.exp(-8 * dt));
    const targetLean = clamp((opts.vx ?? 0) * 0.06, -0.22, 0.22);
    body.rotation.z = lerp(body.rotation.z, -targetLean, 1 - Math.exp(-7 * dt));

    // stride
    const stride = Math.sin(phase) * 0.55 * moving;
    legs[0].hip.rotation.x = lerp(legs[0].hip.rotation.x, stride, 1 - Math.exp(-12 * dt));
    legs[1].hip.rotation.x = lerp(legs[1].hip.rotation.x, -stride, 1 - Math.exp(-12 * dt));
    legs[0].knee.rotation.x = Math.max(0, -stride) * 0.9;
    legs[1].knee.rotation.x = Math.max(0, stride) * 0.9;

    // arms idle
    armL.shoulder.rotation.x = 0.22 + Math.sin(phase) * 0.2 * moving;
    armL.shoulder.rotation.z = -0.32 - Math.sin(time * 1.7) * 0.03;

    let p = 0;
    if (state.swingTime > 0) {
      state.swingTime = Math.max(0, state.swingTime - dt);
      p = 1 - state.swingTime / state.swingDuration;
    }
    const wind = smoothstep(0, 0.3, p);
    const strike = smoothstep(0.24, 0.6, p);
    const recover = smoothstep(0.66, 1, p);

    const windup = wind * (1 - recover * 0.7);
    armR.shoulder.rotation.x = rest.shoulderX + windup * 0.22 - strike * 0.45 * (1 - recover);
    armR.shoulder.rotation.y = rest.shoulderY - windup * 0.95 + strike * 2.0 * (1 - recover);
    armR.shoulder.rotation.z = rest.shoulderZ - windup * 0.25 + strike * 0.35;
    armR.elbow.rotation.x = 0.55 + strike * 0.35 * (1 - recover);
    body.rotation.y = lerp(body.rotation.y, -windup * 0.32 + strike * 0.52 * (1 - recover), 0.5);

    // hover / super pulse
    const pulse = 1 + Math.sin(time * 5.2) * 0.08;
    core.scale.setScalar(state.superMode ? pulse * 1.55 : pulse);
    core.rotation.y = time * 1.4;
    core.rotation.x = time * 0.7;
    coreGlow.material.opacity = state.superMode ? 1 : 0.75 + Math.sin(time * 4) * 0.12;
    coreGlow.scale.setScalar(state.superMode ? 1.2 : 0.68);
    chestPlate.material.emissiveIntensity = state.superMode ? 3.2 + Math.sin(time * 12) * 0.8 : 1.35;
    racketGlow.material.opacity = state.superMode ? 0.8 : 0.24 + Math.sin(time * 3) * 0.08;

    slashMat.opacity = p > 0.2 && p < 0.68 ? Math.sin(((p - 0.2) / 0.48) * Math.PI) * (state.superMode ? 0.95 : 0.55) : 0;
    slash.rotation.z = -0.4 + strike * 1.1;

    if (halo) {
      halo.rotation.z = time * 1.1;
      halo.position.y = 2.02 + Math.sin(time * 2) * 0.04;
    }

    visor.scale.x = 1 + (state.superMode ? Math.sin(time * 16) * 0.1 : 0);
    state.p = p;
  }

  function setSuper(active) {
    state.superMode = active;
  }

  const hoopWorld = new THREE.Vector3();
  function getHoopWorld(target = hoopWorld) {
    return hoop.getWorldPosition(target);
  }

  function getSpeed() {
    return state.speed;
  }

  return {
    root,
    body,
    racket,
    hoop,
    armR,
    state,
    tint,
    ai,
    triggerSwing,
    animate,
    setSuper,
    getHoopWorld,
    getSpeed,
    footGlow,
    core,
  };
}

function glowSpriteLocal(color, scale, opacity) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(64, color === 0xff8be5 ? '255,140,230' : '140,250,255', 0.02),
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  sprite.scale.setScalar(scale);
  return sprite;
}
