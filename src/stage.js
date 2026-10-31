import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildWorld } from './world.js';
import { createAthlete } from './athlete.js';
import { Effects } from './effects.js';
import { COURT, clamp, radialTexture, glowTexture } from './utils.js';

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uWarp: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uWarp;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * (0.0012 + r2 * 0.0045);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;

      // cool the shadows, warm the highlights
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col * vec3(0.92, 1.0, 1.08), col * vec3(1.04, 1.0, 0.96), smoothstep(0.18, 0.9, l));
      col = mix(col, col * vec3(0.72, 0.94, 1.35) + vec3(0.0, 0.015, 0.05), uWarp * 0.45);

      float vig = smoothstep(1.12, 0.32, length(d) * 1.55);
      col *= mix(0.42, 1.0, vig);

      float grain = fract(sin(dot(uv * (1.0 + fract(uTime) * 0.01), vec2(12.9898, 78.233))) * 43758.5453);
      col += (grain - 0.5) * 0.018;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

function makeGhost(player, color) {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(1.5),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const ghost = player.root.clone(true);
  ghost.traverse((child) => {
    if (child.isMesh) {
      child.material = material;
      child.castShadow = false;
    }
    if (child.isSprite) child.visible = false;
    if (child.isLineSegments) child.visible = false;
  });
  ghost.visible = false;
  return { ghost, material, life: 0, maxLife: 0.38 };
}

export function createStage(canvas, { isTouch = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x05030c, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060311, 0.0115);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 260);
  camera.position.set(7.2, 4.8, 14.6);
  camera.lookAt(0.4, 1.2, -2.2);

  // ---------- environment & lights ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.34;
  envScene.dispose?.();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0x39506f, 0x120016, 0.62));

  const key = new THREE.DirectionalLight(0xc8eaff, 1.55);
  key.position.set(9, 18, 11);
  key.castShadow = true;
  key.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 55;
  key.shadow.camera.left = -15;
  key.shadow.camera.right = 15;
  key.shadow.camera.top = 17;
  key.shadow.camera.bottom = -14;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  scene.add(key.target);
  key.target.position.set(0, 0, -1);

  const coolRim = new THREE.PointLight(0x2ce8ff, 44, 26, 2);
  coolRim.position.set(-6.5, 5.2, 8.2);
  scene.add(coolRim);
  const hotRim = new THREE.PointLight(0xff35c8, 40, 26, 2);
  hotRim.position.set(6.5, 5.2, -8.2);
  scene.add(hotRim);
  const fill = new THREE.PointLight(0x6b7dff, 22, 30, 2);
  fill.position.set(0, 9, 2);
  scene.add(fill);

  const world = buildWorld(scene, renderer, camera);

  // ---------- athletes ----------
  const player = createAthlete({ tint: 0x2ce8ff, accent: 0x9ffcff, ai: false });
  player.root.position.set(0, 0, COURT.playerZ);
  scene.add(player.root);

  const ai = createAthlete({ tint: 0xff35c8, accent: 0xffa8e6, ai: true });
  ai.root.position.set(0, 0, COURT.aiZ);
  ai.root.rotation.y = Math.PI;
  scene.add(ai.root);

  // ---------- ball ----------
  const ballGroup = new THREE.Group();
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x2ce8ff,
    emissiveIntensity: 3.1,
    metalness: 0.35,
    roughness: 0.18,
  });
  const ballSphere = new THREE.Mesh(new THREE.SphereGeometry(COURT.ballR, 28, 20), ballMat);
  ballSphere.castShadow = true;
  ballGroup.add(ballSphere);

  const ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(0x2ce8ff).multiplyScalar(1.4),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  ballGlow.scale.setScalar(0.62);
  ballGroup.add(ballGlow);

  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x9ffcff).multiplyScalar(1.8),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const ballRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.008, 4, 36), ringMat);
  const ballRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.006, 4, 36), ringMat.clone());
  ballRing1.rotation.x = 1.1;
  ballRing2.rotation.y = 0.6;
  ballGroup.add(ballRing1, ballRing2);
  scene.add(ballGroup);

  const ballLight = new THREE.PointLight(0x2ce8ff, 12, 14, 2);
  scene.add(ballLight);

  const floorGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({
      map: radialTexture(128, '70,230,255', 0.02),
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.y = 0.022;
  scene.add(floorGlow);

  // ---------- effects ----------
  const effects = new Effects(scene, camera);
  const trail = effects.createTrail({ color: 0x2ce8ff, length: 34, size: 0.22 });
  const aimMarker = effects.createMarker(0xc8ff4a, 0.56);
  const landingMarker = effects.createMarker(0x2ce8ff, 0.66);
  const aiLandingMarker = effects.createMarker(0xff35c8, 0.5);

  const ghosts = [makeGhost(player, 0x2ce8ff), makeGhost(player, 0x6bffe9)];

  // ---------- post ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), isTouch ? 0.46 : 0.55, 0.44, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);

  // ---------- helpers ----------
  const tmpColor = new THREE.Color();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    vignette.uniforms.uTime.value = 0;
  }
  window.addEventListener('resize', resize);
  resize();

  function setBallTint(color, superShot = false) {
    tmpColor.set(color);
    ballMat.emissive.copy(tmpColor);
    ballMat.emissiveIntensity = superShot ? 6.0 : 3.1;
    ballGlow.material.color.copy(tmpColor).multiplyScalar(superShot ? 1.9 : 1.4);
    ballGlow.scale.setScalar(superShot ? 1.25 : 0.62);
    ballRing1.material.color.copy(tmpColor).multiplyScalar(1.9);
    ballRing2.material.color.copy(tmpColor).multiplyScalar(1.4);
    ballLight.color.copy(tmpColor);
    ballLight.intensity = superShot ? 42 : 12;
    floorGlow.material.color.copy(tmpColor).multiplyScalar(1.1);
    trail.setColor(superShot ? 0xff9b3d : color);
  }

  function syncBall(pos, time) {
    ballGroup.position.copy(pos);
    ballLight.position.copy(pos);
    ballSphere.rotation.x = time * 3.2;
    ballSphere.rotation.y = time * 2.1;
    ballRing1.rotation.z = time * 1.8;
    ballRing2.rotation.x = time * 1.2;
    const pulse = 1 + Math.sin(time * 8) * 0.06;
    ballGlow.scale.setScalar((ballMat.emissiveIntensity > 5 ? 1.25 : 0.62) * pulse);

    floorGlow.position.set(pos.x, 0.022, pos.z);
    const height = Math.max(0, pos.y);
    const s = clamp(1.35 - height * 0.11, 0.25, 1.35);
    floorGlow.scale.set(s, s, s);
    floorGlow.material.opacity = clamp(0.4 - height * 0.04, 0.05, 0.4);
  }

  function flashGhosts(dir) {
    for (let i = 0; i < ghosts.length; i++) {
      const g = ghosts[i];
      g.life = g.maxLife;
      g.ghost.visible = true;
      g.ghost.position.set(
        player.root.position.x - dir * (0.9 + i * 0.75),
        0,
        player.root.position.z + i * 0.12
      );
      g.ghost.rotation.y = player.root.rotation.y;
      g.material.opacity = 0.34 - i * 0.1;
    }
  }

  function updateGhosts(dt) {
    for (const g of ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt;
      if (g.life <= 0) {
        g.ghost.visible = false;
        continue;
      }
      g.material.opacity = Math.max(0, (g.life / g.maxLife) * 0.34);
    }
  }

  function tick(dt, time) {
    world.update(dt, time, camera);
    effects.update(dt);
    updateGhosts(dt);
    vignette.uniforms.uTime.value = time;
  }

  function render() {
    composer.render();
  }

  return {
    renderer, scene, camera, composer, bloom, vignette, world, effects, trail,
    player, ai, ballGroup, ballSphere, ballGlow, ballLight, ballRing1, ballRing2,
    floorGlow, aimMarker, landingMarker, aiLandingMarker, ghosts,
    setBallTint, syncBall, flashGhosts, tick, render, resize,
  };
}
