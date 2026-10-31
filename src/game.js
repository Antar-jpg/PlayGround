import * as THREE from 'three';
import {
  COURT, clamp, damp, rand, lerp, sign, approach,
  ballisticVelocity, predictLanding,
} from './utils.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';

const CYAN = 0x2ce8ff;
const MAGENTA = 0xff35c8;
const ORANGE = 0xff8a2b;
const LIME = 0xc8ff4a;
const GRAVITY = COURT.gravity;
const R = COURT.ballR;

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const prevPos = new THREE.Vector3();
const fromPos = new THREE.Vector3();
const targetPos = new THREE.Vector3();

export function createGame({ stage, ui, isTouch = false }) {
  const {
    player, ai, camera, effects, trail,
    aimMarker, landingMarker, aiLandingMarker,
  } = stage;

  const audio = new AudioEngine();
  const G = {
    phase: 'menu',
    pausedFrom: null,
    playerScore: 0,
    aiScore: 0,
    charge: 34,
    dashCd: 0,
    warpCd: 0,
    warpTime: 0,
    superArmed: false,
    rally: 0,
    bestRally: 0,
    perfects: 0,
    smashes: 0,
    shots: 0,
    elapsed: 0,
    server: 'player',
    serveTimer: 0,
    pointTimer: 0,
    shake: 0,
    fovPunch: 0,
    aiStun: 0,
    aiKnock: 0,
    aiSurgeVisual: 0,
    aiSurgeCd: 0,
    swingCd: 0,
    playerHitLock: 0,
    muted: false,
    initialServe: true,
    aimColor: LIME,
  };

  const ball = {
    pos: new THREE.Vector3(0, 1.3, 0.5),
    vel: new THREE.Vector3(),
    active: false,
    bounces: 0,
    lastHitter: 'player',
    superShot: false,
  };

  const move = {
    x: 0,
    z: COURT.playerZ,
    tx: 0,
    tz: COURT.playerZ,
    vx: 0,
    vz: 0,
  };

  let aiX = 0;
  let aiBias = 0;
  let aiHitLock = 0;
  let aiSwingCd = 0;
  let predictTimer = 0;
  let landInfo = null;
  let aiLandInfo = null;
  let bloomBase = isTouch ? 0.46 : 0.55;
  let initialised = false;

  const input = new Input({
    canvas: document.getElementById('scene'),
    stick: document.getElementById('stick'),
    knob: document.getElementById('stickKnob'),
    getPhase: () => G.phase,
    onSwing: () => swing(),
    onPower: (power) => usePower(power),
    onPause: () => togglePause(),
    onMute: () => toggleMute(),
    onStart: () => startMatch(),
    onPointer: (nx, ny) => {
      if (G.phase !== 'serve' && G.phase !== 'rally' && G.phase !== 'point') return;
      move.tx = clamp(nx * 5.0, -4.78, 4.78);
      move.tz = clamp(COURT.playerZ + ny * 2.7, 4.9, 9.45);
    },
  });

  // ---------------------------------------------------------------- lifecycle
  function startMatch() {
    audio.start();
    audio.setPaused(false);
    G.phase = 'serve';
    G.playerScore = 0;
    G.aiScore = 0;
    G.charge = 34;
    G.dashCd = 0;
    G.warpCd = 0;
    G.warpTime = 0;
    G.warpVisual = false;
    G.superArmed = false;
    G.rally = 0;
    G.bestRally = 0;
    G.perfects = 0;
    G.smashes = 0;
    G.shots = 0;
    G.shake = 0;
    G.fovPunch = 0;
    G.aiStun = 0;
    G.aiKnock = 0;
    G.aiSurgeVisual = 0;
    G.aiSurgeCd = 0;
    G.swingCd = 0;
    G.playerHitLock = 0;
    G.server = 'player';
    G.initialServe = true;
    G.aimColor = LIME;
    aiX = 0;
    aiBias = 0;
    aiSwingCd = 0;
    move.x = move.tx = 0;
    move.z = move.tz = COURT.playerZ;
    player.root.position.set(move.x, 0, move.z);
    ai.root.position.set(aiX, 0, COURT.aiZ);
    player.setSuper(false);
    ai.setSuper(false);
    stage.world.setWarp(false);
    stage.bloom.strength = bloomBase;
    ui.tint(false);
    ui.hideMenu();
    ui.hideResult();
    ui.hidePause();
    ui.showHUD();
    ui.setTouchOn(isTouch);
    ui.clearBanner();
    ui.setScores(0, 0);
    ui.setCharge(G.charge);
    ui.feed('MATCH START — YOU SERVE');
    input.reset();
    beginServe(false);
  }

  function goMenu() {
    G.phase = 'menu';
    G.warpTime = 0;
    G.superArmed = false;
    G.aiStun = 0;
    player.setSuper(false);
    ai.setSuper(false);
    stage.world.setWarp(false);
    stage.bloom.strength = bloomBase;
    ui.tint(false);
    audio.setWarp(false);
    audio.setPaused(true);
    ui.showMenu();
    ui.hideResult();
    ui.hidePause();
    aimMarker.setVisible(false);
    landingMarker.setVisible(false);
    aiLandingMarker.setVisible(false);
    stage.ballGroup.visible = true;
    stage.floorGlow.visible = true;
    stage.trail.setActive(false);
    input.reset();
  }

  function togglePause() {
    if (G.phase === 'menu' || G.phase === 'over') return;
    if (G.phase === 'paused') {
      G.phase = G.pausedFrom || 'rally';
      G.pausedFrom = null;
      ui.hidePause();
      audio.setPaused(false);
      input.reset();
      return;
    }
    G.pausedFrom = G.phase;
    G.phase = 'paused';
    ui.showPause();
    audio.setPaused(true);
    input.reset();
  }

  function toggleMute() {
    G.muted = !G.muted;
    audio.setMuted(G.muted);
    ui.setMuted(G.muted);
  }

  function beginServe(withBanner = true) {
    G.phase = 'serve';
    G.serveTimer = G.initialServe ? 0.62 : 0.95;
    G.rally = 0;
    ball.active = false;
    ball.bounces = 0;
    ball.lastHitter = G.server;
    ball.superShot = false;
    aiSwingCd = 0;
    aiBias = rand(-0.35, 0.35);
    move.x = move.tx = 0;
    move.z = move.tz = COURT.playerZ;
    aiX = 0;
    player.root.position.set(move.x, 0, move.z);
    ai.root.position.set(aiX, 0, COURT.aiZ);
    player.setSuper(G.superArmed);
    ai.setSuper(false);
    stage.ballGroup.visible = true;
    stage.floorGlow.visible = true;
    stage.trail.setActive(false);
    setServeBallPosition();
    stage.setBallTint(G.server === 'player' ? CYAN : MAGENTA, false);
    aimMarker.setVisible(false);
    landingMarker.setVisible(false);
    aiLandingMarker.setVisible(false);
    if (withBanner) {
      ui.banner('SERVE', `${G.server === 'player' ? 'YOU' : 'VEXA'} TO SERVE`, G.server === 'player' ? 'lime' : 'pink', 0.9);
    }
    G.initialServe = false;
  }

  function setServeBallPosition() {
    if (G.server === 'player') {
      ball.pos.set(move.x + 0.28, 1.44 + Math.sin(G.elapsed * 3) * 0.05, move.z - 0.92);
    } else {
      ball.pos.set(aiX - 0.25, 1.44 + Math.sin(G.elapsed * 3) * 0.05, COURT.aiZ + 0.92);
    }
    stage.syncBall(ball.pos, G.elapsed);
  }

  function launchServe() {
    if (G.server === 'player') {
      fromPos.copy(ball.pos);
      targetPos.set(rand(-2.7, 2.7), R, rand(-8.9, -6.9));
    } else {
      fromPos.copy(ball.pos);
      targetPos.set(rand(-2.7, 2.7), R, rand(6.8, 8.9));
    }
    const time = 1.24;
    ballisticVelocity(fromPos, targetPos, time, GRAVITY, ball.vel);
    ball.pos.copy(fromPos);
    ball.active = true;
    ball.bounces = 0;
    ball.lastHitter = G.server;
    ball.superShot = false;
    G.phase = 'rally';
    G.rally = 0;
    stage.trail.setActive(true);
    stage.trail.push(ball.pos);
    effects.burst(ball.pos, {
      count: 14, color: G.server === 'player' ? CYAN : MAGENTA,
      speed: 3.2, speedVar: 1.6, life: 0.4, size: 8, gravity: -2,
    });
    audio.serve();
    ui.feed(`${G.server === 'player' ? 'YOU' : 'VEXA'} SERVE`, G.server === 'player' ? 'gold' : 'pink');
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    if (G.phase === 'paused') return;
    G.elapsed += dt;
    tick(dt);
    if (G.phase === 'menu') {
      updateMenu(dt);
    } else {
      updateGame(dt);
    }
    updateCamera(dt);
    stage.bloom.strength = damp(stage.bloom.strength, G.warpTime > 0 ? 0.82 : bloomBase, 5, dt);
  }

  function tick(dt) {
    G.dashCd = Math.max(0, G.dashCd - dt);
    G.warpCd = Math.max(0, G.warpCd - dt);
    G.swingCd = Math.max(0, G.swingCd - dt);
    G.playerHitLock = Math.max(0, G.playerHitLock - dt);
    aiHitLock = Math.max(0, aiHitLock - dt);
    G.shake = Math.max(0, G.shake - dt * 2.7);
    G.fovPunch = damp(G.fovPunch, 0, 6, dt);
    if (G.aiSurgeVisual > 0) {
      G.aiSurgeVisual -= dt;
      if (G.aiSurgeVisual <= 0) ai.setSuper(false);
    }
    if (G.aiSurgeCd > 0) G.aiSurgeCd -= dt;
    if (G.warpTime > 0) {
      G.warpTime -= dt;
      if (G.warpTime <= 0) {
        G.warpTime = 0;
        stage.world.setWarp(false);
        audio.setWarp(false);
        ui.tint(false);
      }
    }
  }

  function updateMenu(dt) {
    move.x = move.tx = 0;
    move.z = move.tz = COURT.playerZ;
    player.root.position.set(0, 0, COURT.playerZ);
    player.animate(dt, G.elapsed, { speed: 0, vx: 0 });
    aiX = Math.sin(G.elapsed * 0.42) * 1.6;
    ai.root.position.set(aiX, 0, COURT.aiZ);
    ai.animate(dt, G.elapsed, { speed: 0.12, vx: Math.cos(G.elapsed * 0.42) * 0.2 });
    ball.pos.set(
      Math.sin(G.elapsed * 0.62) * 3.2,
      1.38 + Math.sin(G.elapsed * 1.15) * 0.42,
      0.6 + Math.cos(G.elapsed * 0.4) * 1.5
    );
    stage.syncBall(ball.pos, G.elapsed);
    stage.ballGroup.visible = true;
    stage.floorGlow.visible = true;
    stage.setBallTint(G.elapsed % 12 < 6 ? CYAN : MAGENTA, false);
    stage.trail.setActive(false);
    aimMarker.setVisible(false);
    landingMarker.setVisible(false);
    aiLandingMarker.setVisible(false);
    ball.active = false;
  }

  function updateGame(dt) {
    updatePlayer(dt);
    const aiDt = G.warpTime > 0 ? dt * 0.34 : dt;
    updateAI(aiDt);

    player.root.updateMatrixWorld(true);
    ai.root.updateMatrixWorld(true);

    if (G.phase === 'rally') {
      checkPlayerContact();
      checkAIContact();
    }

    if (G.phase === 'serve') {
      G.serveTimer -= dt;
      setServeBallPosition();
      if (G.serveTimer <= 0) launchServe();
    } else if (G.phase === 'rally') {
      stepBall(dt * (G.warpTime > 0 ? 0.34 : 1));
      stage.syncBall(ball.pos, G.elapsed);
      if (ball.active) trail.push(ball.pos);
      if (ball.active) checkPlayerContact();
    } else if (G.phase === 'point') {
      G.pointTimer -= dt;
      if (G.pointTimer <= 0) {
        if (G.playerScore >= 7 || G.aiScore >= 7) endMatch();
        else {
          G.server = G.server === 'player' ? 'ai' : 'player';
          beginServe(true);
        }
      }
    } else if (G.phase === 'over') {
      player.animate(dt, G.elapsed, { speed: 0, vx: 0 });
      ai.animate(dt, G.elapsed, { speed: 0, vx: 0 });
    }

    updateMarkers(dt);
  }

  function updatePlayer(dt) {
    const keys = input.keys;
    let h = 0;
    let v = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) h -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) h += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) v -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) v += 1;
    if (h || v) {
      move.tx = clamp(move.tx + h * 7.2 * dt, -4.78, 4.78);
      move.tz = clamp(move.tz + v * 5.0 * dt, 4.9, 9.45);
    }
    if (input.touch.active) {
      move.tx = clamp(move.tx + input.touch.x * 7.4 * dt, -4.78, 4.78);
      move.tz = clamp(move.tz + input.touch.y * 5.2 * dt, 4.9, 9.45);
    }
    move.tx = clamp(move.tx, -4.78, 4.78);
    move.tz = clamp(move.tz, 4.9, 9.45);
    const px = move.x;
    const pz = move.z;
    move.x = damp(move.x, move.tx, 13, dt);
    move.z = damp(move.z, move.tz, 10, dt);
    move.vx = (move.x - px) / Math.max(dt, 0.001);
    move.vz = (move.z - pz) / Math.max(dt, 0.001);
    player.root.position.set(move.x, 0, move.z);
    const speed = clamp(Math.hypot(move.vx, move.vz) / 7.4, 0, 1);
    player.setSuper(G.superArmed);
    player.animate(dt, G.elapsed, { speed, vx: move.vx });
  }

  function updateAI(dt) {
    aiSwingCd = Math.max(0, aiSwingCd - dt);
    const prevX = aiX;
    if (G.aiStun > 0) {
      G.aiStun -= dt;
      aiX = clamp(aiX + G.aiKnock * dt * 4.2, -5.0, 5.0);
      ai.root.position.set(aiX, 0, COURT.aiZ);
      ai.animate(dt, G.elapsed, { speed: 0.35, vx: G.aiKnock });
      return;
    }

    let target = 0;
    const incoming = ball.active && ball.vel.z < -0.2;
    if (incoming) {
      const t = (COURT.aiZ - 0.1 - ball.pos.z) / ball.vel.z;
      target = t > -0.3 && t < 3.2 ? ball.pos.x + ball.vel.x * Math.max(0, t) : ball.pos.x;
      target += aiBias + Math.sin(G.elapsed * 2.4) * 0.1;
    } else {
      target = clamp(-move.x * 0.22 + Math.sin(G.elapsed * 0.75) * 0.7, -2.2, 2.2);
    }
    const speed = 4.25 + Math.min(2.5, G.rally * 0.2 + G.playerScore * 0.12);
    aiX = approach(aiX, clamp(target, -4.75, 4.75), speed * dt);
    ai.root.position.set(aiX, 0, COURT.aiZ);
    const vx = (aiX - prevX) / Math.max(dt, 0.001);
    const speedNorm = clamp(Math.abs(vx) / 7, 0, 1);
    ai.animate(dt, G.elapsed, { speed: speedNorm, vx });
    ai.root.updateMatrixWorld(true);

    if (!ball.active || G.phase !== 'rally' || ball.vel.z > -0.2) return;
    if (ball.pos.z > -4.1 || ball.pos.z < -10.6) return;
    if (ball.pos.y > 3.1) return;
    const hoop = ai.getHoopWorld(tmpV);
    if (hoop.distanceTo(ball.pos) < 2.55 && aiSwingCd <= 0) {
      ai.triggerSwing();
      aiSwingCd = 0.42;
      audio.swing();
    }
  }

  // ---------------------------------------------------------------- ball
  function stepBall(dt) {
    if (!ball.active) return;
    const speed = ball.vel.length();
    const steps = clamp(Math.ceil((speed * dt) / 0.18), 1, 10);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (!ball.active) return;
      prevPos.copy(ball.pos);
      ball.vel.y += GRAVITY * h;
      ball.pos.addScaledVector(ball.vel, h);

      if (
        (prevPos.z > 0 && ball.pos.z <= 0) ||
        (prevPos.z < 0 && ball.pos.z >= 0)
      ) {
        const yAtNet = prevPos.y + (ball.pos.y - prevPos.y) * (Math.abs(prevPos.z) / Math.max(0.0001, Math.abs(ball.pos.z - prevPos.z)));
        if (Math.abs(ball.pos.x) < COURT.halfW + 0.3 && yAtNet < COURT.netH + 0.03 && yAtNet > 0) {
          netHit();
          return;
        }
      }

      if (ball.pos.y <= R && ball.vel.y < 0) {
        floorBounce();
        if (!ball.active) return;
      }

      if (Math.abs(ball.pos.x) > 20 || Math.abs(ball.pos.z) > 24) {
        ball.active = false;
        awardPoint(opponent(ball.lastHitter), 'OUT', ball.pos);
        return;
      }
    }
  }

  function floorBounce() {
    ball.pos.y = R;
    ball.vel.y = -ball.vel.y * 0.64;
    ball.vel.x *= 0.95;
    ball.vel.z *= 0.95;
    const out = Math.abs(ball.pos.x) > COURT.halfW + 0.06 || Math.abs(ball.pos.z) > COURT.halfL + 0.06;
    const side = ball.pos.z > 0 ? 'player' : 'ai';
    const color = ball.lastHitter === 'player' ? CYAN : MAGENTA;
    effects.burst(ball.pos, {
      count: 12, color, speed: 2.4, speedVar: 1.4, life: 0.32, size: 7,
      gravity: -5, upBias: 0.5, drag: 3,
    });
    effects.wave(ball.pos, { color, maxScale: 1.5, duration: 0.28, flat: true, opacity: 0.5 });
    audio.bounce();
    if (G.phase !== 'rally') return;

    const firstBounce = ball.bounces === 0;
    if (firstBounce && out) {
      awardPoint(opponent(ball.lastHitter), 'OUT', ball.pos);
      return;
    }
    if (firstBounce && side === ball.lastHitter) {
      awardPoint(opponent(ball.lastHitter), 'FAULT', ball.pos);
      return;
    }
    ball.bounces++;
    // A ball that bounced in once stays live, even if the second bounce
    // carries it beyond the line. Failing to return it loses the rally.
    if (ball.bounces >= 2) {
      awardPoint(ball.lastHitter, 'DOUBLE BOUNCE', ball.pos);
      return;
    }
    if (side === 'player') {
      ui.feed('RETURN IT!', 'gold');
      G.shake = Math.max(G.shake, 0.08);
    }
  }

  function netHit() {
    stage.world.netRipple(1.2);
    effects.burst(ball.pos, {
      count: 26, color: 0xffffff, speed: 4.5, speedVar: 2.2, life: 0.45, size: 10, gravity: -4,
    });
    effects.wave(ball.pos, { color: CYAN, maxScale: 2.0, duration: 0.35, opacity: 0.8 });
    audio.net();
    G.shake = Math.max(G.shake, 0.28);
    awardPoint(opponent(ball.lastHitter), 'NET', ball.pos);
  }

  function awardPoint(winner, reason, position) {
    if (G.phase !== 'rally') return;
    const rally = G.rally;
    G.phase = 'point';
    G.pointTimer = 1.85;
    if (winner === 'player') {
      G.playerScore++;
      G.charge = clamp(G.charge + 8, 0, 100);
    } else {
      G.aiScore++;
    }
    G.bestRally = Math.max(G.bestRally, rally);
    const color = winner === 'player' ? LIME : MAGENTA;
    effects.burst(position, {
      count: 32, color, speed: 7.5, speedVar: 4.5, life: 0.8, size: 11,
      gravity: -4, drag: 1.2, upBias: 0.25,
    });
    effects.wave(position, { color, maxScale: 5.4, duration: 0.7, opacity: 0.9 });
    effects.wave(position, { color: 0xffffff, maxScale: 2.4, duration: 0.42, opacity: 0.65 });
    G.shake = Math.max(G.shake, 0.5);
    ball.active = false;
    stage.ballGroup.visible = false;
    stage.floorGlow.visible = false;
    stage.trail.setActive(false);
    aimMarker.setVisible(false);
    landingMarker.setVisible(false);
    aiLandingMarker.setVisible(false);

    ui.banner(
      winner === 'player' ? 'POINT' : 'VEXA SCORES',
      `${reason}  ·  ${G.playerScore} — ${G.aiScore}`,
      winner === 'player' ? 'lime' : 'pink',
      1.5
    );
    ui.feed(`${winner === 'player' ? 'YOU' : 'VEXA'} TAKE THE POINT — ${reason}`, winner === 'player' ? 'gold' : 'pink');
    if (rally > 0) ui.feed(`RALLY x${rally}`, winner === 'player' ? 'gold' : '');
    audio.point(winner === 'player');
    audio.crowd(0.07);
  }

  function endMatch() {
    G.phase = 'over';
    G.superArmed = false;
    player.setSuper(false);
    ai.setSuper(false);
    ball.active = false;
    stage.ballGroup.visible = false;
    stage.floorGlow.visible = false;
    stage.trail.setActive(false);
    aimMarker.setVisible(false);
    landingMarker.setVisible(false);
    aiLandingMarker.setVisible(false);
    ui.clearBanner();
    const win = G.playerScore > G.aiScore;
    ui.showResult({
      win,
      playerScore: G.playerScore,
      aiScore: G.aiScore,
      bestRally: G.bestRally,
      perfects: G.perfects,
      smashes: G.smashes,
    });
    audio.setPaused(true);
    if (win) audio.crowd(0.09);
  }

  // ---------------------------------------------------------------- contacts
  function checkPlayerContact() {
    if (G.phase !== 'rally' || !ball.active || G.playerHitLock > 0) return;
    if (player.state.swingTime <= 0) return;
    if (ball.pos.z < 0.3) return;
    const hoop = player.getHoopWorld(tmpV);
    const d = hoop.distanceTo(ball.pos);
    if (d < 1.95) resolvePlayerReturn(d);
  }

  function checkAIContact() {
    if (G.phase !== 'rally' || !ball.active || aiHitLock > 0) return;
    if (ai.state.swingTime <= 0) return;
    if (ball.pos.z > -0.3) return;
    const hoop = ai.getHoopWorld(tmpV);
    const d = hoop.distanceTo(ball.pos);
    if (d < 1.95) resolveAIShot(d);
  }

  function resolvePlayerReturn(d) {
    if (G.playerHitLock > 0 || G.phase !== 'rally') return;
    G.playerHitLock = 0.34;
    const quality = d < 0.74 ? 'perfect' : d < 1.32 ? 'good' : 'edge';
    const superShot = G.superArmed;
    const target = playerAimTarget();
    if (quality === 'edge' && !superShot) target.x = clamp(target.x + rand(-1.1, 1.1), -4.5, 4.5);
    if (superShot) {
      G.superArmed = false;
      G.charge = 0;
      G.smashes++;
      player.setSuper(false);
      target.x = clamp(target.x, -3.9, 3.9);
      target.z = -8.85;
      G.aiStun = 1.05;
      G.aiKnock = (Math.random() < 0.5 ? -1 : 1) * 1.35;
      ui.flash('fire');
      ui.feed('SUPER SMASH — UNRETURNABLE', 'gold');
      G.shake = Math.max(G.shake, 1.0);
      G.fovPunch = 7;
      audio.smash();
    } else {
      const gain = quality === 'perfect' ? 14 : quality === 'good' ? 8 : 5;
      G.charge = clamp(G.charge + gain, 0, 100);
      if (quality === 'perfect') {
        G.perfects++;
        ui.feed('PERFECT RETURN +14', 'gold');
        G.shake = Math.max(G.shake, 0.28);
      } else if (quality === 'edge') {
        ui.feed('EDGE RETURN', '');
      }
      audio.hit(quality, false);
    }

    G.rally++;
    G.bestRally = Math.max(G.bestRally, G.rally);
    launchReturn('player', target, quality, superShot);
    strikeEffects('player', quality, superShot);
    if (!superShot) {
      aiBias = rand(-0.32, 0.32) + (quality === 'perfect' ? rand(-0.8, 0.8) : 0);
    }
  }

  function resolveAIShot(d) {
    if (aiHitLock > 0 || G.phase !== 'rally') return;
    aiHitLock = 0.34;
    const quality = Math.random() < 0.35 ? 'perfect' : 'good';
    const surge = G.rally >= 4 && G.aiSurgeCd <= 0 && Math.random() < 0.24;
    const target = {
      x: clamp(-move.x * 0.65 + rand(-1.7, 1.7), -4.4, 4.4),
      z: clamp(COURT.playerZ + rand(-1.2, 0.8), 6.3, 9.1),
    };
    if (surge) {
      target.x = move.x > 0 ? -4.15 : 4.15;
      target.z = 8.55;
      G.aiSurgeCd = 6.5;
      G.aiSurgeVisual = 0.9;
      ai.setSuper(true);
      ui.feed('VEXA SURGE — WATCH THE CORNER', 'pink');
      ui.flash('warp');
      G.shake = Math.max(G.shake, 0.34);
      audio.power();
    }
    G.rally++;
    G.bestRally = Math.max(G.bestRally, G.rally);
    G.charge = clamp(G.charge + 2, 0, 100);
    launchReturn('ai', target, quality, surge, surge ? 0.78 : 0.98);
    strikeEffects('ai', quality, surge);
    if (!surge) audio.hit('good', false);
    G.shake = Math.max(G.shake, surge ? 0.6 : 0.18);
  }

  function launchReturn(owner, target, quality, superShot, forcedTime) {
    fromPos.copy(ball.pos);
    fromPos.y = Math.max(fromPos.y, 0.34);
    let time = forcedTime;
    if (!time) {
      if (owner === 'player') {
        time = superShot ? 0.58 : quality === 'perfect' ? 0.8 : quality === 'good' ? 0.92 : 1.04;
      } else {
        time = quality === 'perfect' ? 0.9 : 1.0;
      }
    }
    targetPos.set(target.x, R, target.z);
    solveShot(fromPos, targetPos, time, ball.vel);
    ball.pos.copy(fromPos);
    ball.active = true;
    ball.bounces = 0;
    ball.lastHitter = owner;
    ball.superShot = Boolean(superShot);
    G.phase = 'rally';
    stage.trail.setActive(true);
    stage.trail.push(ball.pos);
    stage.setBallTint(superShot ? ORANGE : owner === 'player' ? CYAN : MAGENTA, Boolean(superShot));
  }

  function solveShot(from, to, time, out) {
    let t = time;
    for (let i = 0; i < 5; i++) {
      ballisticVelocity(from, to, t, GRAVITY, out);
      const tNet = -from.z / out.z;
      if (tNet > 0.02 && tNet < t) {
        const yNet = from.y + out.y * tNet + 0.5 * GRAVITY * tNet * tNet;
        if (yNet < COURT.netH + 0.3) {
          t *= 1.16;
          continue;
        }
      }
      break;
    }
    return out;
  }

  function strikeEffects(owner, quality, superShot) {
    const color = superShot ? ORANGE : owner === 'player' ? CYAN : MAGENTA;
    effects.burst(ball.pos, {
      count: superShot ? 64 : quality === 'perfect' ? 34 : 22,
      color,
      speed: superShot ? 13 : 6.2,
      speedVar: superShot ? 6 : 3,
      life: superShot ? 1 : 0.55,
      size: superShot ? 18 : 10,
      gravity: superShot ? -2 : -4,
      drag: 1.2,
      upBias: 0.2,
    });
    effects.wave(ball.pos, {
      color, maxScale: superShot ? 6.4 : quality === 'perfect' ? 3.4 : 2.4,
      duration: superShot ? 0.7 : 0.42, opacity: 0.95,
    });
    if (superShot) {
      effects.wave(ball.pos, { color: 0xffe3b0, maxScale: 3.0, duration: 0.5, opacity: 0.8 });
      effects.burst(ball.pos, {
        count: 30, color: 0xffd27a, speed: 9, speedVar: 4,
        life: 0.9, size: 15, gravity: 1, upBias: 0.5,
      });
    }
    G.fovPunch = Math.max(G.fovPunch, superShot ? 6 : quality === 'perfect' ? 2.2 : 0.8);
  }

  // ---------------------------------------------------------------- aiming
  function playerAimTarget() {
    let bias = 0;
    const keys = input.keys;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) bias -= 1.5;
    if (keys.has('KeyD') || keys.has('ArrowRight')) bias += 1.5;
    if (input.touch.active) bias += input.touch.x * 1.5;
    return {
      x: clamp(-move.x * 0.86 + bias, -4.55, 4.55),
      z: G.superArmed ? -8.6 : -7.55,
    };
  }

  function updateMarkers(dt) {
    predictTimer -= dt;
    if (predictTimer <= 0) {
      predictTimer = 0.1;
      landInfo = ball.active ? predictLanding(ball.pos, ball.vel, GRAVITY, R) : null;
      aiLandInfo = ball.active ? predictLanding(ball.pos, ball.vel, GRAVITY, R) : null;
    }

    const rallying = G.phase === 'rally';
    const serving = G.phase === 'serve';
    const playerSideIncoming = rallying && ball.active && ball.vel.z > 0.2 && ball.bounces === 0;
    if (playerSideIncoming && landInfo) {
      if (landInfo.z > 0.45 && landInfo.z < COURT.halfL + 0.4 && Math.abs(landInfo.x) < COURT.halfW + 0.3) {
        landingMarker.setPosition(landInfo.x, landInfo.z);
        landingMarker.setVisible(true);
        landingMarker.setIntensity(clamp(1.2 - landInfo.time * 0.16, 0.22, 1));
        landingMarker.pulse(G.elapsed, 4.2);
      } else {
        landingMarker.setVisible(false);
      }
    } else {
      landingMarker.setVisible(false);
    }

    const aiSideIncoming = rallying && ball.active && ball.vel.z < -0.2 && ball.bounces === 0;
    if (aiSideIncoming && aiLandInfo) {
      if (aiLandInfo.z < -0.45 && aiLandInfo.z > -COURT.halfL - 0.4 && Math.abs(aiLandInfo.x) < COURT.halfW + 0.3) {
        aiLandingMarker.setPosition(aiLandInfo.x, aiLandInfo.z);
        aiLandingMarker.setVisible(true);
        aiLandingMarker.setIntensity(clamp(1.15 - aiLandInfo.time * 0.14, 0.18, 0.9));
        aiLandingMarker.pulse(G.elapsed, 3.8);
      } else {
        aiLandingMarker.setVisible(false);
      }
    } else {
      aiLandingMarker.setVisible(false);
    }

    const canAim = (rallying && ball.active && ball.pos.z > 0.5) || (serving && G.server === 'ai');
    if (canAim) {
      const aim = playerAimTarget();
      const color = G.superArmed ? ORANGE : LIME;
      if (G.aimColor !== color) {
        G.aimColor = color;
        aimMarker.material.color.set(color).multiplyScalar(2.0);
      }
      aimMarker.setPosition(aim.x, aim.z);
      aimMarker.setVisible(true);
      aimMarker.setIntensity(G.superArmed ? 1 : 0.62 + Math.sin(G.elapsed * 5) * 0.12);
      aimMarker.pulse(G.elapsed, 5);
    } else {
      aimMarker.setVisible(false);
    }
  }

  // ---------------------------------------------------------------- powers
  function usePower(name) {
    if (G.phase !== 'rally' && G.phase !== 'serve') return;
    if (name === 'dash') return dash();
    if (name === 'warp') return warp();
    if (name === 'smash') return smash();
  }

  function dash() {
    if (G.dashCd > 0) return;
    let dir = 0;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) dir -= 1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) dir += 1;
    if (input.touch.active && Math.abs(input.touch.x) > 0.2) dir = sign(input.touch.x);
    if (!dir) {
      if (ball.active && ball.vel.z > 0) {
        const land = predictLanding(ball.pos, ball.vel, GRAVITY, R);
        dir = sign(land.x - move.x) || 1;
      } else {
        dir = sign(move.tx - move.x) || 1;
      }
    }
    const nx = clamp(move.x + dir * 2.25, -4.78, 4.78);
    move.x = nx;
    move.tx = nx;
    player.root.position.x = nx;
    G.dashCd = 3.2;
    G.fovPunch = Math.max(G.fovPunch, 3.2);
    G.shake = Math.max(G.shake, 0.22);
    stage.flashGhosts(dir);
    effects.burst(player.root.position.clone().setY(1.0), {
      count: 28, color: CYAN, speed: 4.5, speedVar: 2,
      life: 0.45, size: 9, gravity: -1.5, upBias: 0.1,
    });
    effects.wave(player.root.position.clone().setY(0.04), {
      color: CYAN, maxScale: 2.8, duration: 0.4, flat: true, opacity: 0.7,
    });
    audio.power();
    ui.feed('DASH', 'gold');
  }

  function warp() {
    if (G.warpCd > 0) return;
    if (G.charge < 35) {
      ui.feed('CORE LOW — WARP NEEDS 35%', 'gold');
      audio.ui();
      return;
    }
    G.charge = clamp(G.charge - 35, 0, 100);
    G.warpCd = 9;
    G.warpTime = 2.4;
    stage.world.setWarp(true);
    audio.warp();
    audio.setWarp(true);
    ui.tint(true);
    ui.flash('warp');
    ui.feed('TIME WARP — 2.4s', '');
    effects.wave(player.root.position.clone().setY(1.1), {
      color: 0x6bbcff, maxScale: 5, duration: 0.6, opacity: 0.75,
    });
    effects.burst(player.root.position.clone().setY(1.1), {
      count: 40, color: 0x8cd8ff, speed: 3.4, speedVar: 2,
      life: 0.8, size: 12, gravity: 0.4, drag: 2,
    });
    G.shake = Math.max(G.shake, 0.22);
  }

  function smash() {
    if (G.superArmed) {
      ui.feed('SMASH ALREADY ARMED', 'gold');
      return;
    }
    if (G.charge < 100) {
      ui.feed(`CORE ${Math.floor(G.charge)}% — SUPER NEEDS 100%`, 'gold');
      audio.ui();
      return;
    }
    G.superArmed = true;
    player.setSuper(true);
    ui.flash('warp');
    ui.feed('SUPER SMASH ARMED — HIT THE STAR', 'gold');
    audio.power();
    effects.wave(player.root.position.clone().setY(1.1), {
      color: ORANGE, maxScale: 3.5, duration: 0.55, opacity: 0.75,
    });
    effects.burst(player.root.position.clone().setY(1.2), {
      count: 30, color: ORANGE, speed: 3.2, speedVar: 1.8,
      life: 0.7, size: 13, gravity: 0.6, drag: 1.6,
    });
  }

  function swing() {
    input.consumeSwing();
    if (G.phase !== 'rally' && G.phase !== 'serve') return;
    if (G.swingCd > 0) return;
    G.swingCd = 0.34;
    G.shots++;
    player.triggerSwing();
    audio.swing();
  }

  // ---------------------------------------------------------------- camera
  const camBase = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  function updateCamera(dt) {
    let shake = G.shake;
    const sx = shake > 0.002 ? rand(-shake, shake) * 0.26 : 0;
    const sy = shake > 0.002 ? rand(-shake, shake) * 0.2 : 0;
    const sz = shake > 0.002 ? rand(-shake, shake) * 0.12 : 0;

    if (G.phase === 'menu') {
      camBase.set(
        6.35 + Math.sin(G.elapsed * 0.09) * 1.9,
        4.68 + Math.sin(G.elapsed * 0.13) * 0.36,
        14.9 + Math.cos(G.elapsed * 0.075) * 1.1
      );
      camera.position.lerp(camBase, 1 - Math.exp(-3 * dt));
      lookTarget.set(0.45 + Math.sin(G.elapsed * 0.06) * 0.4, 1.2, -2.1);
      camera.lookAt(lookTarget);
      camera.fov = damp(camera.fov, 52, 3, dt);
    } else {
      camBase.set(
        move.x * 0.55,
        3.42 + move.z * 0.02,
        move.z + 4.55
      );
      camera.position.lerp(camBase, 1 - Math.exp(-6 * dt));
      camera.position.x += sx;
      camera.position.y += sy;
      camera.position.z += sz;
      lookTarget.set(move.x * 0.12 + sx * 0.45, 1.02 + sy * 0.3, -2.35 + sz * 0.4);
      camera.lookAt(lookTarget);
      let fov = 58 + G.fovPunch;
      if (G.warpTime > 0) fov += 2.5;
      camera.fov = damp(camera.fov, fov, 6, dt);
    }
    camera.updateProjectionMatrix();
  }

  function opponent(owner) {
    return owner === 'player' ? 'ai' : 'player';
  }

  return {
    state: G,
    ball,
    move,
    audio,
    input,
    startMatch,
    goMenu,
    togglePause,
    toggleMute,
    usePower,
    swing,
    update,
    getAimTarget: playerAimTarget,
  };
}
