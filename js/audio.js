// Linea for Cello. © Rob Casey.
// Sound. Each line's tone is handed to the browser's audio engine ahead of
// time, complete with its pitch curve and its fade in and out, so the sound
// is timed by the audio clock and a slow screen frame cannot disturb it.
(function () {
  const LC = (globalThis.LC = globalThis.LC || {});

  const PEAK = 0.25;        // loudest a single voice gets (two voices, one each side)
  const AHEAD = 60;         // hand over tones that start within this many seconds
  const TOP_UP = 5;         // ...checking for more this often
  const CURVE_RATE = 50;    // points per second in the pitch and loudness curves
  const LEAD = 0.06;        // a breath between pressing play and the clock moving

  let ctx = null;
  let session = null;       // what is playing now: its tones and its own volume control

  function ensureContext() {
    if (ctx) return ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    return ctx;
  }

  // The clock the whole piece runs on while playing.
  function clock() {
    return ctx ? ctx.currentTime : performance.now() / 1000;
  }

  function scheduleTone(s, line) {
    const scoreNow = s.scoreT + (ctx.currentTime - s.clockT);
    const begin = Math.max(line.toneStart, scoreNow + 0.02);   // joining part-way through, if need be
    const dur = line.toneEnd - begin;
    if (dur < 0.1) return;
    const when = s.clockT + (begin - s.scoreT);
    const from = begin - line.toneStart;

    const n = Math.max(2, Math.ceil(dur * CURVE_RATE) + 1);
    const freq = new Float32Array(n);
    const amp = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const tau = from + dur * i / (n - 1);
      freq[i] = line.hz(tau);
      amp[i] = PEAK * line.env(tau);
    }
    amp[n - 1] = 0;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq[0];
    osc.frequency.setValueCurveAtTime(freq, when, dur);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueCurveAtTime(amp, when, dur);

    osc.connect(gain);
    let last = gain;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = line.voice === 0 ? -1 : 1;   // first voice hard left, second hard right
      gain.connect(pan);
      last = pan;
    }
    last.connect(s.out);

    osc.start(when);
    osc.stop(when + dur + 0.05);
    const tone = { osc, last };
    osc.onended = () => {
      try { last.disconnect(); } catch (e) { /* already gone */ }
      s.tones.delete(tone);
    };
    s.tones.add(tone);
  }

  function topUp(s) {
    const scoreNow = s.scoreT + (ctx.currentTime - s.clockT);
    const lines = s.score.lines;
    while (s.next < lines.length && lines[s.next].toneStart < scoreNow + AHEAD) {
      const line = lines[s.next++];
      if (line.toneEnd > scoreNow) scheduleTone(s, line);
    }
  }

  LC.audio = {
    clock,

    // Start sounding the score from time `t`. Returns the clock reading that
    // corresponds to `t`, for the transport to count from.
    start(score, t, volume) {
      LC.audio.stop();
      if (!ensureContext()) return clock();
      if (ctx.state !== 'running') ctx.resume();

      const now = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, now);
      out.gain.linearRampToValueAtTime(volume, now + 0.1);   // no click when joining mid-tone
      out.connect(ctx.destination);

      const s = { score, scoreT: t, clockT: now + LEAD, out, tones: new Set(), next: 0, timer: null };
      topUp(s);
      s.timer = setInterval(() => topUp(s), TOP_UP * 1000);
      session = s;
      return s.clockT;
    },

    // Fade what is sounding to silence and let it go.
    stop() {
      const s = session;
      if (!s) return;
      session = null;
      clearInterval(s.timer);
      const now = ctx.currentTime;
      s.out.gain.cancelScheduledValues(now);
      s.out.gain.setValueAtTime(s.out.gain.value, now);
      s.out.gain.linearRampToValueAtTime(0, now + 0.06);
      setTimeout(() => {
        s.tones.forEach((tone) => {
          tone.osc.onended = null;
          try { tone.osc.stop(); } catch (e) { /* never started */ }
          try { tone.last.disconnect(); } catch (e) { /* already gone */ }
        });
        s.tones.clear();
        s.out.disconnect();
      }, 150);
    },

    setVolume(volume) {
      if (session) session.out.gain.setTargetAtTime(volume, ctx.currentTime + 0.1, 0.05);
    },
  };
})();
