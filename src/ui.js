const $ = (id) => document.getElementById(id);

export class UI {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.touchEnabled = false;
    this.bannerTimer = 0;
    this.last = {
      playerScore: -1, aiScore: -1, charge: -1, dash: -1, warp: -1,
      smashReady: null, armed: null, rally: -1, phase: '',
    };

    this.hud = $('hud');
    this.menu = $('menu');
    this.result = $('result');
    this.resultCard = this.result.querySelector('.result-card');
    this.pause = $('pause');
    this.bannerEl = $('banner');
    this.bannerMain = $('bannerMain');
    this.bannerSub = $('bannerSub');
    this.scorePlayer = $('scorePlayer');
    this.scoreAI = $('scoreAI');
    this.chargeFill = $('chargeFill');
    this.chargePct = $('chargePct');
    this.chargeReady = $('chargeReady');
    this.rallyChip = $('rallyChip');
    this.rallyCount = $('rallyCount');
    this.rallyBest = $('rallyBest');
    this.feedRoot = $('feed');
    this.boostBadge = $('boostBadge');
    this.hintFade = $('hintFade');
    this.fxTint = $('fxTint');
    this.fxFlash = $('fxFlash');
    this.touchUI = $('touchUI');
    this.muteBtn = $('muteBtn');
    this.pauseBtn = $('pauseBtn');
    this.loader = $('loader');
    this.loaderText = $('loaderText');

    this.pw = {
      dash: { btn: $('pwDash'), cd: $('cdDash') },
      warp: { btn: $('pwWarp'), cd: $('cdWarp') },
      smash: { btn: $('pwSmash'), cd: $('cdSmash') },
    };

    this.bind();
  }

  bind() {
    $('playBtn')?.addEventListener('click', () => this.cb.onPlay?.());
    $('againBtn')?.addEventListener('click', () => this.cb.onPlay?.());
    $('menuBtn')?.addEventListener('click', () => this.cb.onMenu?.());
    this.pauseBtn?.addEventListener('click', () => this.cb.onPause?.());
    $('resumeBtn')?.addEventListener('click', () => this.cb.onPause?.());
    $('restartBtn')?.addEventListener('click', () => this.cb.onRestart?.());
    this.muteBtn?.addEventListener('click', () => this.cb.onMute?.());
    this.pw.dash.btn?.addEventListener('click', () => this.cb.onPower?.('dash'));
    this.pw.warp.btn?.addEventListener('click', () => this.cb.onPower?.('warp'));
    this.pw.smash.btn?.addEventListener('click', () => this.cb.onPower?.('smash'));
    $('swingBtn')?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.cb.onSwing?.();
    });
  }

  setTouch(enabled) {
    this.touchEnabled = enabled;
    document.body.classList.toggle('touch', enabled);
  }

  showMenu() {
    this.menu.hidden = false;
    this.menu.classList.remove('leaving');
    this.hideHUD();
    this.setTouchOn(false);
    this.hideResult();
    this.hidePause();
  }

  hideMenu() {
    this.menu.classList.add('leaving');
    this.setTouchOn(this.touchEnabled);
  }

  showHUD() { this.hud.classList.add('live'); }
  hideHUD() { this.hud.classList.remove('live'); }
  setTouchOn(on) { this.touchUI.classList.toggle('on', Boolean(on && this.touchEnabled)); }

  showResult({ win, playerScore, aiScore, bestRally, perfects, smashes }) {
    this.result.hidden = false;
    this.resultCard.classList.toggle('lose', !win);
    $('resultTitle').textContent = win ? 'VICTORY' : 'DEFEAT';
    $('resultSub').textContent = win ? 'THE ARENA REMEMBERS YOUR NAME' : 'VEXA KEEPS THE CROWN — FOR NOW';
    $('resultEyebrow').textContent = win ? 'MATCH COMPLETE' : 'MATCH COMPLETE';
    $('resultPlayer').textContent = String(playerScore);
    $('resultAI').textContent = String(aiScore);
    $('statRally').textContent = String(bestRally);
    $('statPerfect').textContent = String(perfects);
    $('statSmash').textContent = String(smashes);
  }

  hideResult() { this.result.hidden = true; }
  showPause() { this.pause.hidden = false; }
  hidePause() { this.pause.hidden = true; }

  banner(main, sub = '', tone = '', duration = 1.5) {
    this.bannerMain.textContent = main;
    this.bannerSub.textContent = sub;
    this.bannerEl.className = `banner show ${tone}`.trim();
    this.bannerTimer = duration;
  }

  clearBanner() {
    this.bannerEl.classList.remove('show');
    this.bannerTimer = 0;
  }

  feed(text, tone = '') {
    const item = document.createElement('div');
    item.className = `feed-item ${tone}`.trim();
    item.textContent = text;
    this.feedRoot.appendChild(item);
    while (this.feedRoot.children.length > 4) this.feedRoot.firstElementChild.remove();
    setTimeout(() => item.remove(), 1900);
  }

  flash(kind = 'fire') {
    this.fxFlash.classList.remove('fire', 'warp');
    // force the animation to restart even when re-triggered in the same frame
    void this.fxFlash.offsetWidth;
    this.fxFlash.classList.add(kind);
  }

  tint(on) {
    this.fxTint.classList.toggle('on', Boolean(on));
  }

  setMuted(muted) {
    this.muteBtn.setAttribute('aria-pressed', String(muted));
  }

  setScores(player, ai) {
    this.scorePlayer.textContent = String(player);
    this.scoreAI.textContent = String(ai);
  }

  setCharge(charge) {
    const pct = Math.round(charge);
    this.chargeFill.style.width = `${pct}%`;
    this.chargePct.textContent = `${pct}%`;
  }

  setCooldown(entry, remaining, total, tired = false) {
    if (remaining > 0.01) {
      entry.btn.classList.add('cooling');
      entry.cd.style.setProperty('--p', String((remaining / total) * 100));
    } else {
      entry.btn.classList.remove('cooling');
      entry.cd.style.setProperty('--p', '0');
    }
    entry.btn.classList.toggle('tired', Boolean(tired));
  }

  update(dt, state) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show');
    }

    const l = this.last;
    const prevCharge = l.charge;
    if (state.playerScore !== l.playerScore || state.aiScore !== l.aiScore) {
      this.setScores(state.playerScore, state.aiScore);
      l.playerScore = state.playerScore;
      l.aiScore = state.aiScore;
    }
    if (state.charge !== l.charge) {
      this.setCharge(state.charge);
      l.charge = state.charge;
    }
    if (state.dashCd !== l.dash) {
      this.setCooldown(this.pw.dash, state.dashCd, 3.2);
      l.dash = state.dashCd;
    }
    if (state.warpCd !== l.warp || state.charge !== prevCharge) {
      this.setCooldown(this.pw.warp, state.warpCd, 9, state.charge < 35);
      l.warp = state.warpCd;
    }
    const smashReady = state.charge >= 100 || state.superArmed;
    this.pw.smash.btn.classList.toggle('ready', smashReady);
    this.chargeFill.classList.toggle('hot', Boolean(state.superArmed || state.charge >= 100));
    this.chargeReady.classList.toggle('on', smashReady);
    this.chargeReady.textContent = state.superArmed ? 'SMASH ARMED — HIT THE STAR' : 'R — SUPER SMASH';
    if (state.superArmed !== l.armed) {
      this.boostBadge.classList.toggle('on', Boolean(state.superArmed));
      l.armed = state.superArmed;
    }
    if (state.rally !== l.rally || state.phase !== l.phase) {
      this.rallyChip.classList.toggle('show', state.rally > 0 && (state.phase === 'rally' || state.phase === 'serve'));
      this.rallyCount.textContent = String(state.rally);
      this.rallyBest.textContent = state.bestRally > 0 ? `BEST ${state.bestRally}` : '';
      l.rally = state.rally;
      l.phase = state.phase;
    }
    this.hintFade.classList.toggle('gone', state.shots > 0 || state.elapsed > 22);
  }

  loaderDone() {
    this.loader.classList.add('done');
  }

  error(message) {
    this.loaderText.textContent = message;
  }
}
