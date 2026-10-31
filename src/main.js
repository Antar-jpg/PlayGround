import { createStage } from './stage.js';
import { UI } from './ui.js';
import { createGame } from './game.js';

const isTouch =
  window.matchMedia?.('(pointer: coarse)').matches ||
  (navigator.maxTouchPoints || 0) > 0 ||
  window.innerWidth <= 820;

document.body.classList.toggle('touch', isTouch);

let stage = null;
let game = null;

const ui = new UI({
  onPlay: () => game?.startMatch(),
  onMenu: () => game?.goMenu(),
  onPause: () => game?.togglePause(),
  onRestart: () => game?.startMatch(),
  onMute: () => game?.toggleMute(),
  onPower: (power) => game?.usePower(power),
  onSwing: () => game?.swing(),
});
ui.setTouch(isTouch);

try {
  stage = createStage(document.getElementById('scene'), { isTouch });
  game = createGame({ stage, ui, isTouch });
  game.goMenu();
} catch (error) {
  console.error(error);
  ui.error('WEBGL UNAVAILABLE — TRY A NEWER BROWSER');
}

let last = performance.now();
let visualTime = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  if (stage && game) {
    const dt = game.state.phase === 'paused' ? 0 : raw;
    game.update(dt);
    if (dt > 0) visualTime += dt;
    stage.tick(dt, visualTime);
    ui.update(raw, game.state);
    stage.render();
  }
}
requestAnimationFrame(frame);

const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.race([
  fontsReady,
  new Promise((resolve) => setTimeout(resolve, 1400)),
]).then(() => {
  setTimeout(() => ui.loaderDone(), 220);
});

document.addEventListener('visibilitychange', () => {
  if (!game) return;
  const phase = game.state.phase;
  if (document.hidden && (phase === 'serve' || phase === 'rally' || phase === 'point')) {
    game.togglePause();
  }
});

// A small, stable surface for browser verification and curious players.
window.__VOLT_RALLY__ = {
  get game() { return game; },
  get stage() { return stage; },
  start: () => game?.startMatch(),
  menu: () => game?.goMenu(),
};
