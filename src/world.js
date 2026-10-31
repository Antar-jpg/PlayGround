import * as THREE from 'three';
import {
  COURT, TAU, clamp, rand, radialTexture, glowTexture, windowTexture,
  textTexture, makeCourtGridTexture, smoothstep,
} from './utils.js';

const CYAN = 0x2ce8ff;
const MAGENTA = 0xff35c8;
const VIOLET = 0x6b5bff;
const ORANGE = 0xff8a2b;
const WHITE = 0xffffff;

function neon(color, intensity = 3.2) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    toneMapped: false,
  });
}

function glowSprite(color, scale, opacity = 0.6) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(color).multiplyScalar(1.6),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(scale);
  return sprite;
}

function addLine(group, x1, z1, x2, z2, color, width = 0.055, y = 0.018) {
  const alongZ = Math.abs(z2 - z1) >= Math.abs(x2 - x1);
  const geo = alongZ
    ? new THREE.BoxGeometry(width, 0.014, Math.abs(z2 - z1))
    : new THREE.BoxGeometry(Math.abs(x2 - x1), 0.014, width);
  const mesh = new THREE.Mesh(geo, neon(color, 2.6));
  mesh.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

function buildCourt(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- raised platform -------------------------------------------------
  const platformMat = new THREE.MeshStandardMaterial({
    color: 0x060b16,
    metalness: 0.82,
    roughness: 0.34,
    envMapIntensity: 0.9,
  });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.68, 22.3), platformMat);
  platform.position.y = -0.36;
  platform.receiveShadow = true;
  group.add(platform);

  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(13.35, 0.12, 22.65),
    new THREE.MeshStandardMaterial({ color: 0x0a1220, metalness: 1, roughness: 0.18 })
  );
  skirt.position.y = -0.05;
  group.add(skirt);

  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.035, 22.3),
      neon(side < 0 ? CYAN : MAGENTA, 2.6)
    );
    strip.position.set(side * 6.7, -0.04, 0);
    group.add(strip);
  }
  const glowEdge = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.03, 0.05), neon(CYAN, 1.8));
  glowEdge.position.set(0, -0.03, 11.18);
  group.add(glowEdge);

  // ---- floor -----------------------------------------------------------
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0x050813,
    metalness: 0.82,
    roughness: 0.19,
    clearcoat: 1.0,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.3,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 21.8), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  floor.receiveShadow = true;
  group.add(floor);

  const gridMap = makeCourtGridTexture();
  gridMap.wrapS = gridMap.wrapT = THREE.RepeatWrapping;
  gridMap.repeat.set(2.5, 4.4);
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(12.8, 21.8),
    new THREE.MeshBasicMaterial({
      map: gridMap,
      transparent: true,
      opacity: 0.27,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.01;
  group.add(grid);

  // side halos
  for (const [z, color] of [[5.4, CYAN], [-5.4, MAGENTA]]) {
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 10.6),
      new THREE.MeshBasicMaterial({
        map: radialTexture(256, color === CYAN ? '44,232,255' : '255,53,200', 0.02),
        transparent: true,
        opacity: 0.11,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(0, 0.012, z);
    group.add(halo);
  }

  // ---- court markings --------------------------------------------------
  const W = COURT.halfW;
  const L = COURT.halfL;
  for (const z of [1, -1]) {
    const color = z > 0 ? CYAN : MAGENTA;
    addLine(group, -W, z * L, W, z * L, color, 0.07);
    addLine(group, -W, z * (L - 0.001), -W, z * 0.15, color);
    addLine(group, W, z * (L - 0.001), W, z * 0.15, color);
    addLine(group, -W, z * 3.45, W, z * 3.45, color, 0.045);
    addLine(group, 0, z * 0.15, 0, z * 3.45, WHITE, 0.035);
    addLine(group, -W * 0.76, z * 0.15, -W * 0.76, z * L, color, 0.028, 0.016);
    addLine(group, W * 0.76, z * 0.15, W * 0.76, z * L, color, 0.028, 0.016);
  }
  // Net-line indicators on the floor
  addLine(group, -W - 0.3, 0, W + 0.3, 0, WHITE, 0.03);
  // center marks
  for (const z of [6.9, -6.9]) {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), neon(z > 0 ? CYAN : MAGENTA, 2.2));
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = Math.PI / 4;
    mark.position.set(0, 0.02, z);
    group.add(mark);
  }

  // ---- net -------------------------------------------------------------
  const netUniforms = {
    uTime: { value: 0 },
    uRipple: { value: 0 },
    uColor: { value: new THREE.Color(CYAN).multiplyScalar(1.5) },
  };
  const netMat = new THREE.ShaderMaterial({
    uniforms: netUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uRipple;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        uv.x += sin(uv.y * 17.0 + uTime * 7.0) * uRipple * 0.05;
        vec2 cells = vec2(uv.x * 48.0, uv.y * 11.0);
        vec2 g = abs(fract(cells) - 0.5);
        float line = smoothstep(0.39, 0.5, max(g.x, g.y));
        float edge = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
        float sweep = 0.55 + 0.45 * sin(uTime * 2.2 + vUv.x * 14.0);
        vec3 color = uColor * (0.65 + sweep * 0.55 + uRipple * 1.8);
        gl_FragColor = vec4(color, line * edge * (0.34 + uRipple * 0.7));
      }
    `,
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 0.4, COURT.netH), netMat);
  net.position.set(0, COURT.netH / 2 + 0.05, 0);
  group.add(net);

  const netTape = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.44, 0.07, 0.045), neon(WHITE, 1.6));
  netTape.position.set(0, COURT.netH + 0.035, 0);
  group.add(netTape);
  const netTapeGlow = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.44, 0.012, 0.18), neon(CYAN, 1.7));
  netTapeGlow.position.set(0, COURT.netH + 0.08, 0);
  group.add(netTapeGlow);

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.11, COURT.netH + 0.22, 12),
      new THREE.MeshStandardMaterial({ color: 0x0a111d, metalness: 1, roughness: 0.2 })
    );
    post.position.set(side * (W + 0.22), (COURT.netH + 0.2) / 2, 0);
    post.castShadow = true;
    group.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), neon(side < 0 ? CYAN : MAGENTA, 3));
    cap.position.set(side * (W + 0.22), COURT.netH + 0.24, 0);
    group.add(cap);
  }

  return { group, netMaterial: netMat, netUniforms, floor };
}

function buildStands(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const stepMat = new THREE.MeshStandardMaterial({
    color: 0x080d18,
    metalness: 0.55,
    roughness: 0.55,
    envMapIntensity: 0.5,
  });
  const crowdGeo = new THREE.BoxGeometry(0.16, 0.36, 0.16);
  const crowdMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const crowdData = [];

  function addTierRun(innerX, zMin, zMax, side, rows = 6) {
    for (let i = 0; i < rows; i++) {
      const x = innerX + side * i * 1.12;
      const top = 0.38 + i * 0.52;
      const depth = zMax - zMin;
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.52, depth), stepMat);
      step.position.set(x, top - 0.26, (zMin + zMax) / 2);
      step.receiveShadow = true;
      group.add(step);

      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.02, depth),
        neon(i % 2 === 0 ? CYAN : MAGENTA, 1.4)
      );
      strip.position.set(x - side * 0.57, top + 0.002, (zMin + zMax) / 2);
      group.add(strip);

      const count = Math.floor(depth * 2.4);
      for (let j = 0; j < count; j++) {
        const z = rand(zMin + 0.3, zMax - 0.3);
        const xj = x + rand(-0.3, 0.3);
        const y = top + 0.18 + rand(0, 0.06);
        crowdData.push({ x: xj, y, z, color: crowdColor() });
      }
      if (i === 0) {
        // barrier along the front row
        const barrier = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.68, depth),
          new THREE.MeshStandardMaterial({ color: 0x0c1828, metalness: 0.7, roughness: 0.4 })
        );
        barrier.position.set(x - side * 0.58, top + 0.34, (zMin + zMax) / 2);
        group.add(barrier);
      }
    }
  }

  function crowdColor() {
    const r = Math.random();
    if (r < 0.08) return new THREE.Color(CYAN).multiplyScalar(1.8);
    if (r < 0.14) return new THREE.Color(MAGENTA).multiplyScalar(1.7);
    if (r < 0.2) return new THREE.Color(ORANGE).multiplyScalar(1.2);
    const shade = rand(0.03, 0.18);
    return new THREE.Color(shade * 0.7, shade * 0.9, shade * 1.2);
  }

  addTierRun(8.3, -11.2, 11.2, 1, 6);
  addTierRun(-8.3, -11.2, 11.2, -1, 6);

  // far stand
  for (let i = 0; i < 6; i++) {
    const z = -13.3 - i * 1.12;
    const top = 0.38 + i * 0.52;
    const step = new THREE.Mesh(new THREE.BoxGeometry(20.5, 0.52, 1.12), stepMat);
    step.position.set(0, top - 0.26, z);
    step.receiveShadow = true;
    group.add(step);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(20.5, 0.02, 0.035), neon(i % 2 ? MAGENTA : CYAN, 1.5));
    strip.position.set(0, top + 0.002, z + 0.57);
    group.add(strip);
    const count = 38;
    for (let j = 0; j < count; j++) {
      crowdData.push({ x: rand(-9.2, 9.2), y: top + 0.18 + rand(0, 0.06), z: z + rand(-0.3, 0.3), color: crowdColor() });
    }
  }

  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdData.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < crowdData.length; i++) {
    const d = crowdData[i];
    dummy.position.set(d.x, d.y, d.z);
    dummy.rotation.y = rand(-0.4, 0.4);
    dummy.scale.set(rand(0.7, 1.3), rand(0.8, 1.2), rand(0.7, 1.3));
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
    crowd.setColorAt(i, d.color);
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  group.add(crowd);

  // front barriers / ad boards
  for (const [x, z, w, color] of [
    [-8.0, 0, 0.08, CYAN], [8.0, 0, 0.08, MAGENTA],
    [0, -12.6, 20.4, MAGENTA],
  ]) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(w === 0.08 ? 0.14 : 20.4, 0.8, w === 0.08 ? 22 : 0.14),
      new THREE.MeshStandardMaterial({ color: 0x07101d, roughness: 0.4, metalness: 0.7 })
    );
    board.position.set(x, 0.4, z);
    group.add(board);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(w === 0.08 ? 0.16 : 20.4, 0.025, w === 0.08 ? 22 : 0.16),
      neon(color, 1.6)
    );
    glow.position.set(x, 0.8, z);
    group.add(glow);
  }

  return { group };
}

function buildBackdrop(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- sky dome --------------------------------------------------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform float uTime;
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 low = vec3(0.008, 0.004, 0.024);
        vec3 mid = vec3(0.055, 0.012, 0.10);
        vec3 high = vec3(0.015, 0.006, 0.04);
        vec3 col = mix(low, mid, smoothstep(0.42, 0.56, h));
        col = mix(col, high, smoothstep(0.6, 0.95, h));
        float horizon = exp(-pow((h - 0.5) * 12.0, 2.0));
        col += vec3(0.28, 0.03, 0.18) * horizon * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 40, 24), skyMat);
  group.add(sky);

  // stars
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 650; i++) {
    const theta = rand(0, TAU);
    const phi = Math.acos(rand(0.08, 0.95));
    const r = 120;
    starPos.push(Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(theta) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 0.7,
    color: new THREE.Color(0.7, 0.9, 1.4),
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: radialTexture(64, '200,240,255', 0.02),
    toneMapped: false,
  }));
  group.add(stars);

  // ---- synthwave sun ---------------------------------------------------
  const sunMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        if (r > 0.5) discard;
        vec3 top = vec3(1.0, 0.32, 0.55);
        vec3 bottom = vec3(1.0, 0.62, 0.12);
        vec3 col = mix(bottom, top, smoothstep(0.0, 0.9, vUv.y));
        // dark horizontal stripes in the lower half
        float stripe = step(0.0, sin((vUv.y * 34.0) + uTime * 0.4));
        float mask = smoothstep(0.0, 0.22, vUv.y) + stripe;
        float bands = mix(1.0, mask, smoothstep(0.45, 0.18, vUv.y) * 0.92);
        float edge = 1.0 - smoothstep(0.47, 0.5, r);
        gl_FragColor = vec4(col * 1.05, bands * edge);
      }
    `,
  });
  const sun = new THREE.Mesh(new THREE.CircleGeometry(9.4, 64), sunMat);
  sun.position.set(0, 16.5, -72);
  group.add(sun);
  const sunGlow = glowSprite(0xff4b8a, 24, 0.1);
  sunGlow.position.set(0, 16.5, -73);
  group.add(sunGlow);

  // ---- skyline ---------------------------------------------------------
  const win = windowTexture();
  win.wrapS = win.wrapT = THREE.RepeatWrapping;
  win.repeat.set(2, 5);
  const buildingMat = new THREE.MeshStandardMaterial({
    color: 0x03050c,
    emissive: 0xffffff,
    emissiveMap: win,
    emissiveIntensity: 1.15,
    roughness: 0.85,
    metalness: 0.2,
  });
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildings = new THREE.InstancedMesh(buildingGeo, buildingMat, 60);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 60; i++) {
    const angle = rand(-1.16, 1.16) * Math.PI;
    const dist = rand(44, 86);
    const x = Math.sin(angle) * dist;
    const z = -Math.cos(angle) * dist;
    const h = rand(8, 32);
    const w = rand(3.5, 9);
    const d = rand(3.5, 9);
    dummy.position.set(x, h / 2 - 1.8, z);
    dummy.rotation.y = rand(-0.2, 0.2);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    buildings.setMatrixAt(i, dummy.matrix);
  }
  buildings.instanceMatrix.needsUpdate = true;
  group.add(buildings);

  // low haze / ground plane
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(115, 48),
    new THREE.MeshStandardMaterial({ color: 0x02030a, roughness: 0.65, metalness: 0.4 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.75;
  group.add(ground);

  return { group, skyMat, sunMat, sun };
}

function buildArena(scene, camera) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- light rigs ------------------------------------------------------
  const rigGroup = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x4bd8ff).multiplyScalar(0.5),
    transparent: true,
    opacity: 0.045,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const beamMatPink = beamMat.clone();
  beamMatPink.color = new THREE.Color(0xff4bd0).multiplyScalar(0.5);
  for (const [x, z, pink] of [[-8, -8, false], [8, -8, true], [-8, 8, true], [8, 8, false]]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.16, 8.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x09111e, metalness: 0.95, roughness: 0.25 })
    );
    pole.position.set(x, 4.1, z);
    rigGroup.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.55), neon(pink ? MAGENTA : CYAN, 2.8));
    head.position.set(x, 8.25, z);
    rigGroup.add(head);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 8.2, 24, 1, true), pink ? beamMatPink : beamMat);
    beam.position.set(x, 4.1, z);
    rigGroup.add(beam);
  }
  group.add(rigGroup);

  // ---- overhead halo rings --------------------------------------------
  const halo1 = new THREE.Mesh(
    new THREE.TorusGeometry(15.4, 0.028, 6, 140),
    neon(CYAN, 1.9)
  );
  halo1.rotation.x = Math.PI / 2;
  halo1.position.y = 11.4;
  group.add(halo1);

  const halo2 = new THREE.Mesh(
    new THREE.TorusGeometry(12.8, 0.022, 6, 120),
    neon(MAGENTA, 1.6)
  );
  halo2.rotation.x = Math.PI / 2 + 0.12;
  halo2.position.y = 12.6;
  group.add(halo2);

  // ---- floating drones -------------------------------------------------
  const drones = [];
  const droneGeo = new THREE.SphereGeometry(0.1, 10, 8);
  const droneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ORANGE).multiplyScalar(2.4), toneMapped: false });
  const droneGlow = radialTexture(64, '255,170,90', 0.03);
  for (let i = 0; i < 9; i++) {
    const drone = new THREE.Group();
    const core = new THREE.Mesh(droneGeo, droneMat);
    drone.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: droneGlow,
      color: 0xffb060,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    glow.scale.setScalar(0.85);
    drone.add(glow);
    drone.userData = {
      radius: rand(9, 14),
      speed: rand(0.08, 0.16) * (i % 2 ? 1 : -1),
      phase: rand(0, TAU),
      y: rand(6.5, 10.5),
    };
    group.add(drone);
    drones.push(drone);
  }

  // ---- holographic banners --------------------------------------------
  const bannerTex = textTexture('VOLT RALLY', {
    width: 1024,
    height: 300,
    color: '#e7fdff',
    accent: '#2ce8ff',
    sub: 'SUPERPOWERED SPORT  //  NEO TOKYO',
    font: '900 116px Orbitron, Arial Black, sans-serif',
    subFont: '700 26px Rajdhani, sans-serif',
  });
  const bannerMat = new THREE.MeshBasicMaterial({
    map: bannerTex,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 4.6), bannerMat);
  banner.position.set(0, 8.0, -20.2);
  group.add(banner);

  const sideTex = textTexture('VEXA', {
    width: 512,
    height: 256,
    color: '#ffd9f5',
    accent: '#ff35c8',
    sub: 'ARENA CHAMPION',
    font: '900 120px Orbitron, Arial Black, sans-serif',
  });
  const sideMat = new THREE.MeshBasicMaterial({
    map: sideTex,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.1), sideMat);
    sign.position.set(side * 10.6, 5.3, -11.5);
    sign.rotation.y = side * 0.22;
    group.add(sign);
  }

  // ---- floating dust ---------------------------------------------------
  const dustCount = 420;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustSpeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = rand(-17, 17);
    dustPos[i * 3 + 1] = rand(0.2, 12);
    dustPos[i * 3 + 2] = rand(-22, 15);
    dustSpeed[i] = rand(0.15, 0.65);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.08,
    color: new THREE.Color(0.6, 0.85, 1.2),
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: radialTexture(32, '180,230,255', 0.02),
    toneMapped: false,
  }));
  group.add(dust);

  return {
    group,
    drones,
    bannerMat,
    sideMat,
    halo1,
    halo2,
    dust,
    dustPos,
    dustSpeed,
    skyMat: null,
  };
}

export function buildWorld(scene, renderer, camera) {
  const court = buildCourt(scene);
  const stands = buildStands(scene);
  const backdrop = buildBackdrop(scene);
  const arena = buildArena(scene, camera);

  const state = {
    netRipple: 0,
    warp: 0,
    shake: 0,
    time: 0,
  };

  function update(dt, time, cameraRef) {
    state.time = time;
    court.netUniforms.uTime.value = time;
    court.netUniforms.uRipple.value = state.netRipple;
    state.netRipple = Math.max(0, state.netRipple - dt * 2.8);

    backdrop.skyMat.uniforms.uTime.value = time;
    backdrop.sunMat.uniforms.uTime.value = time;
    arena.halo1.rotation.z = time * 0.025;
    arena.halo2.rotation.z = -time * 0.035;
    arena.halo1.position.y = 11.4 + Math.sin(time * 0.4) * 0.12;
    arena.halo2.position.y = 12.6 + Math.sin(time * 0.3 + 2) * 0.16;

    for (const drone of arena.drones) {
      const d = drone.userData;
      const a = time * d.speed + d.phase;
      drone.position.set(Math.cos(a) * d.radius, d.y + Math.sin(time * 0.7 + d.phase) * 0.5, Math.sin(a) * d.radius - 3);
    }

    arena.bannerMat.opacity = 0.74 + Math.sin(time * 1.7) * 0.05 + (Math.random() < 0.008 ? -0.25 : 0);
    arena.sideMat.opacity = 0.4 + Math.sin(time * 0.9 + 1) * 0.07;

    const positions = arena.dust.geometry.attributes.position.array;
    for (let i = 0; i < arena.dustSpeed.length; i++) {
      positions[i * 3 + 1] += arena.dustSpeed[i] * dt;
      positions[i * 3] += Math.sin(time * 0.2 + i) * dt * 0.06;
      if (positions[i * 3 + 1] > 12.5) {
        positions[i * 3 + 1] = 0.2;
        positions[i * 3] = rand(-17, 17);
        positions[i * 3 + 2] = rand(-22, 15);
      }
    }
    arena.dust.geometry.attributes.position.needsUpdate = true;

    if (arena.warp !== state.warp) {
      arena.warp = state.warp;
    }
  }

  function netRipple(strength = 1) {
    state.netRipple = Math.min(1.4, state.netRipple + strength);
  }

  function setWarp(active) {
    state.warp = active ? 1 : 0;
  }

  return {
    update,
    netRipple,
    setWarp,
    court,
    state,
  };
}
