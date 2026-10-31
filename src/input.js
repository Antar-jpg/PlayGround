import { clamp } from './utils.js';

const ACTIVE_PHASES = new Set(['serve', 'rally', 'point']);

export class Input {
  constructor({
    canvas, stick, knob,
    onSwing, onPower, onPause, onMute, onStart, onPointer, getPhase,
  }) {
    this.canvas = canvas;
    this.stick = stick;
    this.knob = knob;
    this.onSwing = onSwing;
    this.onPower = onPower;
    this.onPause = onPause;
    this.onMute = onMute;
    this.onStart = onStart;
    this.onPointer = onPointer;
    this.getPhase = getPhase;

    this.keys = new Set();
    this.pointer = { x: 0, y: 0, active: false };
    this.touch = { x: 0, y: 0, active: false };
    this.stickPointer = null;
    this.swinging = false;

    this.bind();
  }

  active() {
    return ACTIVE_PHASES.has(this.getPhase());
  }

  bind() {
    window.addEventListener('keydown', (event) => {
      const code = event.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) event.preventDefault();
      if (event.repeat) return;
      this.keys.add(code);

      if (code === 'Space' || code === 'Enter') {
        if (this.getPhase() === 'menu') {
          this.onStart?.();
          return;
        }
      }
      if (code === 'Space') {
        if (this.active()) this.requestSwing();
        return;
      }
      if (code === 'KeyQ' && this.active()) return this.onPower?.('dash');
      if (code === 'KeyE' && this.active()) return this.onPower?.('warp');
      if (code === 'KeyR' && this.active()) return this.onPower?.('smash');
      if (code === 'KeyM') return this.onMute?.();
      if (code === 'Escape' || code === 'KeyP') {
        const phase = this.getPhase();
        if (phase !== 'menu' && phase !== 'over') this.onPause?.();
      }
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.active = false;
      this.touch.x = 0;
      this.touch.y = 0;
      this.resetStick();
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const rect = this.canvas.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      this.pointer.active = true;
      this.pointer.x = clamp(nx, -1.2, 1.2);
      this.pointer.y = clamp(ny, -1.2, 1.2);
      if (this.active()) this.onPointer?.(this.pointer.x, this.pointer.y);
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.pointerType === 'touch') event.preventDefault();
      if (this.active()) this.requestSwing();
    });

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    if (this.stick) this.bindStick();
  }

  bindStick() {
    const update = (event) => {
      const rect = this.stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = (event.clientX - cx) / (rect.width * 0.42);
      let dy = (event.clientY - cy) / (rect.height * 0.42);
      const length = Math.hypot(dx, dy);
      if (length > 1) {
        dx /= length;
        dy /= length;
      }
      this.touch.x = dx;
      this.touch.y = dy;
      this.touch.active = true;
      this.knob.style.transform = `translate(${dx * 27}px, ${dy * 27}px)`;
    };

    this.stick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.stickPointer = event.pointerId;
      this.stick.setPointerCapture(event.pointerId);
      update(event);
    });
    this.stick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickPointer) return;
      event.preventDefault();
      update(event);
    });
    const release = (event) => {
      if (event.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.touch.active = false;
      this.touch.x = 0;
      this.touch.y = 0;
      this.resetStick();
    };
    this.stick.addEventListener('pointerup', release);
    this.stick.addEventListener('pointercancel', release);
    this.stick.addEventListener('lostpointercapture', release);
  }

  resetStick() {
    if (this.knob) this.knob.style.transform = 'translate(0px, 0px)';
  }

  requestSwing() {
    if (this.swinging) return;
    this.swinging = true;
    this.onSwing?.();
  }

  consumeSwing() {
    this.swinging = false;
  }

  reset() {
    this.keys.clear();
    this.touch.active = false;
    this.touch.x = 0;
    this.touch.y = 0;
    this.resetStick();
    this.swinging = false;
  }
}
