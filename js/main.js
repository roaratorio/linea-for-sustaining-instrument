// Linea for sustaining instrument. © Rob Casey.
// Transport and controls: the clock, play / pause / seek, keyboard and toolbar.
(function () {
  const LC = globalThis.LC;
  const STORE_KEY = 'linea-for-cello.config';
  const PANEL_WIDTH = 420;

  const canvas = document.getElementById('score');
  const ctx = canvas.getContext('2d');
  const playBtn = document.getElementById('play');
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // Open the piece last edited on this computer, else the default.
  function initialConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved) {
        const cfg = Object.assign(clone(LC.defaults), saved);
        LC.buildScore(cfg);
        return cfg;
      }
    } catch (e) { /* nothing saved, or it no longer loads */ }
    return clone(LC.defaults);
  }

  let config = initialConfig();
  let score = LC.buildScore(config);

  let W = 0, H = 0;
  const ui = { theme: 'light', playing: false, hoverT: null, idle: false, tlAlpha: 1 };

  // The clock: time is always "anchor time + audio-clock time since anchor",
  // so picture and sound share one clock and a slow frame cannot make them drift.
  let anchorT = 0;
  let anchorClock = 0;

  function now() {
    if (!ui.playing) return anchorT;
    return anchorT + (LC.audio.clock() - anchorClock);
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(config)); } catch (e) { /* private window */ }
  }

  function startSound(t) {
    anchorT = t;
    anchorClock = LC.audio.start(score, t, config.volume);
  }

  function play() {
    if (ui.playing) return;
    if (anchorT >= score.duration) anchorT = 0;
    ui.playing = true;
    startSound(anchorT);
    keepAwake(true);
    refreshBar();
  }

  function pause() {
    if (!ui.playing) return;
    anchorT = now();
    ui.playing = false;
    LC.audio.stop();
    keepAwake(false);
    refreshBar();
  }

  // Jump to a point in the piece, playing on from there if already playing.
  function seek(t) {
    t = Math.min(Math.max(t, 0), score.duration);
    if (ui.playing) startSound(t);
    else anchorT = t;
  }

  // Swap in a new version of the piece. A config that cannot be built is
  // refused and the current score stays as it was.
  function applyConfig(next) {
    let built;
    try { built = LC.buildScore(next); } catch (e) { return { ok: false, error: e.message }; }
    const t = now();
    config = clone(next);
    score = built;
    seek(Math.min(t, score.duration));
    save();
    return { ok: true };
  }

  // Volume alone never rebuilds the piece or interrupts a tone.
  function setVolume(v) {
    config.volume = Math.min(1, Math.max(0, v));
    LC.audio.setVolume(config.volume);
    save();
  }

  // Display-only choices: no need to rebuild the piece or interrupt a tone.
  function setDisplay(key, value) {
    if (typeof value !== 'string') value = !!value;
    config[key] = value;
    score[key] = value;
    save();
  }

  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* not available here; harmless */ }
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const panelOpen = LC.setup.isOpen && window.innerWidth > PANEL_WIDTH + 500;
    W = window.innerWidth - (panelOpen ? PANEL_WIDTH : 0);
    H = window.innerHeight;
    canvas.style.width = W + 'px';
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function frame() {
    let t = now();
    if (ui.playing && t >= score.duration) {
      t = score.duration;
      anchorT = t;
      ui.playing = false;
      LC.audio.stop();
      keepAwake(false);
      refreshBar();
    }
    ui.soundBlocked = ui.playing && LC.audio.blocked();
    const hide = score.hideTimeline && ui.playing && ui.idle && !LC.setup.isOpen;
    ui.tlAlpha += ((hide ? 0 : 1) - ui.tlAlpha) * 0.1;
    LC.draw(ctx, W, H, score, Math.max(0, t), ui);
    requestAnimationFrame(frame);
  }

  // --- Toolbar --------------------------------------------------------------

  function refreshBar() {
    playBtn.textContent = ui.playing ? 'Pause' : 'Play';
    document.body.dataset.theme = ui.theme;
    document.body.classList.toggle('playing', ui.playing);
  }

  function toggleTheme() {
    ui.theme = ui.theme === 'dark' ? 'light' : 'dark';
    refreshBar();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  }

  const onClick = (id, fn) => document.getElementById(id).addEventListener('click', (e) => {
    e.currentTarget.blur(); // so Space afterwards plays/pauses rather than re-pressing the button
    fn();
  });
  onClick('play', () => (ui.playing ? pause() : play()));
  onClick('restart', () => seek(0));
  onClick('open-setup', () => LC.setup.toggle());
  onClick('theme', toggleTheme);
  onClick('full', toggleFullscreen);

  // Any click or key press is a chance to un-block sound the browser is holding back.
  window.addEventListener('pointerdown', () => LC.audio.nudge(), true);
  window.addEventListener('keydown', () => LC.audio.nudge(), true);

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return; // typing in setup
    const big = e.shiftKey ? 60 : 10;
    if (e.key === ' ') { e.preventDefault(); ui.playing ? pause() : play(); }
    else if (e.key === 'ArrowRight') seek(now() + big);
    else if (e.key === 'ArrowLeft') seek(now() - big);
    else if (e.key === 'Home' || e.key === '0') seek(0);
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else if (e.key === 'd' || e.key === 'D') toggleTheme();
    else if (e.key === 's' || e.key === 'S') LC.setup.toggle();
    else if (e.key === 'Escape' && LC.setup.isOpen) LC.setup.close();
  });

  // Click the timeline to jump to that point.
  function timelineTime(e) {
    const tl = LC.layout(W, H, score.size).tl;
    if (e.clientY < tl.y - 10 || e.clientY > tl.y + tl.h + 22) return null;
    if (e.clientX < tl.x - 4 || e.clientX > tl.x + tl.w + 4) return null;
    return score.duration * Math.min(1, Math.max(0, (e.clientX - tl.x) / tl.w));
  }

  canvas.addEventListener('mousemove', (e) => {
    ui.hoverT = timelineTime(e);
    canvas.style.cursor = ui.hoverT === null ? '' : 'pointer';
  });
  canvas.addEventListener('mouseleave', () => { ui.hoverT = null; });
  canvas.addEventListener('click', (e) => {
    const t = timelineTime(e);
    if (t !== null) seek(t);
  });

  // The toolbar gets out of the way while playing.
  let idleTimer = null;
  function wake() {
    document.body.classList.remove('idle');
    ui.idle = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { document.body.classList.add('idle'); ui.idle = true; }, 2500);
  }
  window.addEventListener('mousemove', wake);
  window.addEventListener('resize', resize);

  // Also handy for experimenting from the browser console.
  LC.app = {
    get score() { return score; },
    get config() { return config; },
    now, play, pause, seek, applyConfig, setVolume, setDisplay, resize, ui,
  };

  resize();
  refreshBar();
  wake();
  requestAnimationFrame(frame);
})();
