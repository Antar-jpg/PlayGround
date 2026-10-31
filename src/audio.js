/**
 * Synthesised arena audio: no external assets, everything is generated with
 * the Web Audio API. Music is a minimal synthwave loop with a look-ahead
 * scheduler; SFX are one-shot voices routed through the same master filter so
 * time-warp can muffle the whole arena.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.paused = false;
    this.master = null;
    this.filter = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.step = 0;
    this.nextNote = 0;
    this.timer = null;
    this.bpm = 112;
    this.stepDur = 60 / this.bpm / 4;
    this.chords = [
      [110.0, 130.81, 164.81], // Am
      [87.31, 110.0, 130.81], // F
      [130.81, 164.81, 196.0], // C
      [98.0, 123.47, 146.83], // G
    ];
  }

  async start() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.22;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 18000;
      filter.Q.value = 0.4;
      this.filter = filter;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.85;
      this.master = master;

      const musicGain = ctx.createGain();
      musicGain.gain.value = 0.42;
      this.musicGain = musicGain;
      const sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.9;
      this.sfxGain = sfxGain;

      // A little stereo echo for the arp / hits.
      const delay = ctx.createDelay(0.6);
      delay.delayTime.value = 0.26;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.2;
      const wet = ctx.createGain();
      wet.gain.value = 0.16;
      musicGain.connect(filter);
      musicGain.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(filter);
      sfxGain.connect(filter);
      filter.connect(compressor);
      compressor.connect(ctx.destination);

      this.noiseBuffer = this.makeNoise(ctx, 2);
      this.ready = true;
      this.nextNote = ctx.currentTime + 0.1;
      this.step = 0;
      this.timer = setInterval(() => this.schedule(), 60);
      await ctx.resume().catch(() => {});
    } catch (error) {
      console.warn('Audio unavailable', error);
    }
  }

  makeNoise(ctx, seconds) {
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.85, t + 0.12);
  }

  setPaused(paused) {
    this.paused = paused;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.linearRampToValueAtTime(paused ? 0.08 : 0.42, t + 0.3);
  }

  setWarp(active) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.linearRampToValueAtTime(active ? 1250 : 18000, t + (active ? 0.18 : 0.55));
  }

  schedule() {
    if (!this.ready || this.paused) return;
    const ctx = this.ctx;
    if (this.nextNote < ctx.currentTime - 1.5) this.nextNote = ctx.currentTime + 0.05;
    while (this.nextNote < ctx.currentTime + 0.24) {
      this.playStep(this.step, this.nextNote);
      this.step = (this.step + 1) % 16;
      this.nextNote += this.stepDur;
    }
  }

  playStep(step, time) {
    const chordIndex = Math.floor(this.step / 16) % 4;
    // chordIndex is based on the *next* bar; step resets each bar so hold a
    // slowly changing progression derived from the wall clock instead.
    const bar = Math.floor(time / (this.stepDur * 16)) % 4;
    const chord = this.chords[bar];

    // kick: four on the floor, soft
    if (step % 4 === 0) this.kick(time, 0.16);
    // snare / clap
    if (step === 4 || step === 12) this.snare(time, 0.055);
    // hats
    if (step % 2 === 0) this.hat(time, step % 4 === 2 ? 0.028 : 0.014, 0.03);
    // bass pulse
    if (step % 4 === 0 || step === 6 || step === 14) {
      const note = chord[0] / 2 * (step === 14 ? 2 : 1);
      this.bass(time, note, step % 4 === 0 ? 0.2 : 0.12);
    }
    // arp
    if (step % 2 === 0) {
      const idx = (step / 2 + bar * 2) % 4;
      const arp = [chord[0] * 2, chord[2] * 2, chord[1] * 2, chord[2] * 3][idx];
      this.arp(time, arp, 0.055);
    }
    // pad on bar start
    if (step === 0) this.pad(time, chord, this.stepDur * 16 * 0.94);
  }

  tone({ type = 'sine', freq = 440, endFreq = null, gain = 0.2, attack = 0.004, decay = 0.2, time = null, pan = 0, bus = null }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = time ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + decay);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(amp);
    amp.connect(panner);
    panner.connect(bus || this.musicGain);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  kick(time, gain = 0.2) {
    this.tone({ type: 'sine', freq: 130, endFreq: 42, gain, attack: 0.002, decay: 0.22, time });
  }

  snare(time, gain = 0.06) {
    const ctx = this.ctx;
    if (!ctx) return;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1900;
    filter.Q.value = 0.8;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    noise.connect(filter);
    filter.connect(amp);
    amp.connect(this.musicGain);
    noise.start(time);
    noise.stop(time + 0.14);
  }

  hat(time, gain = 0.02, decay = 0.03) {
    const ctx = this.ctx;
    if (!ctx) return;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    noise.connect(filter);
    filter.connect(amp);
    amp.connect(this.musicGain);
    noise.start(time);
    noise.stop(time + decay + 0.01);
  }

  bass(time, freq, gain = 0.16) {
    this.tone({ type: 'sawtooth', freq, endFreq: freq * 0.985, gain, attack: 0.01, decay: 0.24, time });
  }

  arp(time, freq, gain = 0.05) {
    this.tone({ type: 'triangle', freq, endFreq: freq * 1.002, gain, attack: 0.005, decay: 0.14, time, pan: Math.sin(this.step * 1.7) * 0.35 });
  }

  pad(time, chord, duration) {
    const ctx = this.ctx;
    if (!ctx) return;
    for (let i = 0; i < chord.length; i++) {
      for (const detune of [-6, 5]) {
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        osc.type = 'sawtooth';
        osc.frequency.value = chord[i];
        osc.detune.value = detune;
        amp.gain.setValueAtTime(0.0001, time);
        amp.gain.exponentialRampToValueAtTime(0.022, time + 0.4);
        amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(filter);
        filter.connect(amp);
        amp.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + duration + 0.05);
      }
    }
  }

  noiseBurst({ gain = 0.1, decay = 0.15, freq = 1200, q = 1, type = 'bandpass', time = null, bus = null }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = time ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t + decay);
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(bus || this.sfxGain);
    src.start(t);
    src.stop(t + decay + 0.02);
  }

  swing() {
    if (!this.ready) return;
    this.noiseBurst({ gain: 0.075, decay: 0.17, freq: 1500, q: 0.8 });
    this.tone({ type: 'triangle', freq: 520, endFreq: 190, gain: 0.025, decay: 0.13, bus: this.sfxGain });
  }

  hit(grade = 'good', superShot = false) {
    if (!this.ready) return;
    const perfect = grade === 'perfect';
    const freq = superShot ? 880 : perfect ? 760 : grade === 'good' ? 560 : 420;
    this.tone({ type: 'triangle', freq, endFreq: freq * 0.24, gain: superShot ? 0.24 : 0.14, attack: 0.002, decay: superShot ? 0.35 : 0.18, bus: this.sfxGain });
    this.tone({ type: 'sine', freq: freq * 0.5, endFreq: 60, gain: 0.16, attack: 0.002, decay: 0.2, bus: this.sfxGain });
    this.noiseBurst({ gain: superShot ? 0.16 : 0.07, decay: superShot ? 0.4 : 0.1, freq: superShot ? 2600 : 1700, q: 0.7 });
  }

  bounce() {
    if (!this.ready) return;
    this.tone({ type: 'sine', freq: 150, endFreq: 50, gain: 0.1, decay: 0.16, bus: this.sfxGain });
    this.noiseBurst({ gain: 0.03, decay: 0.08, freq: 500, q: 0.6 });
  }

  net() {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', freq: 180, endFreq: 55, gain: 0.09, decay: 0.22, bus: this.sfxGain });
    this.noiseBurst({ gain: 0.06, decay: 0.18, freq: 700, q: 0.4 });
  }

  power() {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', freq: 180, endFreq: 960, gain: 0.09, attack: 0.02, decay: 0.4, bus: this.sfxGain });
    this.noiseBurst({ gain: 0.08, decay: 0.45, freq: 900, q: 1.4 });
  }

  warp() {
    if (!this.ready) return;
    this.tone({ type: 'sine', freq: 1200, endFreq: 140, gain: 0.11, decay: 0.6, bus: this.sfxGain });
    this.tone({ type: 'triangle', freq: 350, endFreq: 120, gain: 0.07, decay: 0.7, bus: this.sfxGain });
    this.noiseBurst({ gain: 0.05, decay: 0.5, freq: 3000, q: 0.5 });
  }

  smash() {
    if (!this.ready) return;
    this.tone({ type: 'sine', freq: 90, endFreq: 28, gain: 0.3, decay: 0.6, bus: this.sfxGain });
    this.tone({ type: 'sawtooth', freq: 500, endFreq: 80, gain: 0.12, decay: 0.5, bus: this.sfxGain });
    this.noiseBurst({ gain: 0.2, decay: 0.6, freq: 1800, q: 0.5 });
    this.crowd(0.06);
  }

  point(win) {
    if (!this.ready) return;
    const base = win ? 440 : 220;
    const notes = win ? [base, base * 1.5, base * 2] : [base, base * 0.75];
    notes.forEach((f, i) => {
      this.tone({ type: 'triangle', freq: f, endFreq: f, gain: 0.1, attack: 0.01, decay: 0.28, time: this.ctx.currentTime + i * 0.11, bus: this.sfxGain });
    });
    this.crowd(win ? 0.05 : 0.025);
  }

  crowd(amount = 0.04) {
    if (!this.ready) return;
    this.noiseBurst({ gain: amount, decay: 0.9, freq: 850, q: 0.4 });
  }

  serve() {
    if (!this.ready) return;
    this.noiseBurst({ gain: 0.05, decay: 0.3, freq: 2200, q: 0.6 });
    this.tone({ type: 'sine', freq: 320, endFreq: 620, gain: 0.05, decay: 0.2, bus: this.sfxGain });
  }

  ui() {
    if (!this.ready) return;
    this.tone({ type: 'triangle', freq: 620, endFreq: 760, gain: 0.06, decay: 0.08, bus: this.sfxGain });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ctx?.close?.().catch(() => {});
  }
}
