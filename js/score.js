// Linea for sustaining instrument. © Rob Casey.
// The score. From a small config (seed, ranges, timings) this works out the
// whole piece in advance: every line, where it wanders, and when its tone
// sounds. Drawing and sound both read from this, so they cannot disagree.
//
// Distances across the box are fractions of its width (0 = left edge,
// 1 = right edge). Heights are fractions of the range (0 = lowest note at the
// bottom edge, 1 = highest note at the top edge). Times are in seconds.
(function () {
  const LC = (globalThis.LC = globalThis.LC || {});

  // These come from the original p5 sketch (a 1000 px canvas at 30 frames a second).
  const SPEED = 0.0375;          // how fast a line is drawn: box-widths per second
  const START_MIN = 0.0375;      // a line starts somewhere in this stretch...
  const START_MAX = 0.1125;
  const END_MAX = 0.8375;        // ...and stops no further right than this
  const MIN_DRAW = 4;            // shortest line, in seconds of drawing
  const REST_CHANCE = 0.25;      // how often one of the two voices sits a pair out
  const NOISE_RATE = 0.15;       // how quickly a line wanders
  const WANDER = 1.8;            // how much of the range it tends to cover
  const EDGE = 0.03;             // lines turn back this far inside the box
  const LEAD_IN = 2;             // seconds before the first line
  const GAP = 1;                 // seconds of empty box between pairs

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  // --- Notes ----------------------------------------------------------------

  const LETTERS = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  // "F#2", "Bb3", "c4" -> where the note sits on a staff and how it sounds.
  // Octaves are scientific: C4 is middle C.
  LC.parseNote = function (text) {
    const m = /^\s*([A-Ga-g])\s*(#|♯|b|♭)?\s*(-?\d)\s*$/.exec(String(text));
    if (!m) return null;
    const letter = m[1].toUpperCase();
    const acc = !m[2] ? '' : (m[2] === '#' || m[2] === '♯') ? '#' : 'b';
    const octave = parseInt(m[3], 10);
    return {
      name: letter + acc + octave,
      letter, acc, octave,
      step: LETTERS[letter] + 7 * octave,                       // staff position
      midi: 12 * (octave + 1) + SEMIS[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0),
      label: letter + (acc === '#' ? '♯' : acc === 'b' ? '♭' : ''),
    };
  };

  LC.midiToHz = (midi, a4) => a4 * Math.pow(2, (midi - 69) / 12);

  // --- Default piece ---------------------------------------------------------

  LC.defaults = {
    seed: 'linea-1',
    a4: 440,          // tuning of A4 in Hz
    tailLife: 15,     // seconds a drawn point stays visible; the tone begins when the tail starts to vanish
    tailSlow: 2,      // how many times slower the tail vanishes than the line was drawn; tones last this many times longer
    toneFade: 5,      // seconds for a tone to fade in, and to fade out
    volume: 0.8,
    guides: false,
    hideTimeline: false, // fade the timeline away while playing, until the mouse moves    // faint lines across the box at each semitone
    sections: [
      { low: 'F#2', high: 'A2', pairs: 15, clef: 'auto' },
      { low: 'E3', high: 'G#3', pairs: 35, clef: 'auto' },
    ],
  };

  // --- Building --------------------------------------------------------------

  function buildSection(spec, index, a4) {
    let low = LC.parseNote(spec.low);
    let high = LC.parseNote(spec.high);
    const n = index + 1;
    if (!low) throw new Error('range ' + n + ': "' + spec.low + '" is not a note (try F#2 or Bb3)');
    if (!high) throw new Error('range ' + n + ': "' + spec.high + '" is not a note (try F#2 or Bb3)');
    if (low.midi === high.midi) throw new Error('range ' + n + ': the two notes are the same');
    if (low.midi > high.midi) { const swap = low; low = high; high = swap; }
    const pairs = Math.round(Number(spec.pairs));
    if (!(pairs >= 1 && pairs <= 500)) throw new Error('range ' + n + ': the number of pairs must be between 1 and 500');

    let clef = spec.clef;
    if (clef !== 'bass' && clef !== 'tenor' && clef !== 'alto' && clef !== 'treble') {
      clef = (low.midi + high.midi) / 2 <= 59 ? 'bass' : 'treble';
    }

    // One tick per semitone, spaced exactly as the pitches are.
    const names = (low.acc === 'b' || high.acc === 'b') ? FLAT_NAMES : SHARP_NAMES;
    const ticks = [];
    for (let m = low.midi; m <= high.midi; m++) {
      const label = m === low.midi ? low.label : m === high.midi ? high.label : names[((m % 12) + 12) % 12];
      ticks.push({ v: (m - low.midi) / (high.midi - low.midi), label });
    }

    return {
      index, low, high, clef, pairs, ticks,
      lowHz: LC.midiToHz(low.midi, a4),
      highHz: LC.midiToHz(high.midi, a4),
      label: low.label + low.octave + ' – ' + high.label + high.octave,
      start: 0, end: 0,
    };
  }

  LC.buildScore = function (cfg) {
    if (!cfg || !Array.isArray(cfg.sections) || !cfg.sections.length) throw new Error('the piece needs at least one range');
    const a4 = Number(cfg.a4);
    if (!(a4 >= 380 && a4 <= 480)) throw new Error('A4 must be between 380 and 480 Hz');
    const life = Number(cfg.tailLife);
    if (!(life >= 2 && life <= 120)) throw new Error('the wait before the tail fades must be between 2 and 120 seconds');
    const toneFade = Number(cfg.toneFade);
    if (!(toneFade >= 0.05 && toneFade <= 30)) throw new Error('the tone fade must be between 0.05 and 30 seconds');

    const slow = Number(cfg.tailSlow);
    if (!(slow >= 1 && slow <= 20)) throw new Error('the tail slow-down must be between 1 and 20');

    const rng = LC.makeRng(cfg.seed, 'lines');
    const noise = LC.makeNoise(cfg.seed);
    const sections = cfg.sections.map((s, i) => buildSection(s, i, a4));
    const lines = [];
    let t = LEAD_IN;
    let pairCount = 0;

    sections.forEach((sec) => {
      sec.start = t;
      const ratio = sec.highHz / sec.lowHz;
      for (let p = 0; p < sec.pairs; p++) {
        // Decide which voices play this pair; never neither.
        let present = [rng() >= REST_CHANCE, rng() >= REST_CHANCE];
        const fallback = rng() < 0.5 ? 0 : 1;
        if (!present[0] && !present[1]) present[fallback] = true;

        let longest = 0;
        for (let voice = 0; voice < 2; voice++) {
          // Always draw the same count of random numbers, so that changing
          // one thing in the setup disturbs the rest as little as possible.
          const x0 = rng.between(START_MIN, START_MAX);
          const lengthRoll = rng();
          const offset = rng() * 900;
          if (!present[voice]) continue;

          const minLen = SPEED * MIN_DRAW;
          const len = minLen + lengthRoll * (END_MAX - x0 - minLen);
          const draw = len / SPEED;             // seconds spent drawing
          const dur = draw * slow;              // seconds the tail takes to travel the line: how long the tone lasts
          const fade = Math.min(toneFade, dur / 2);

          const line = {
            section: sec.index, pair: pairCount, voice,
            t0: t,                              // drawing starts
            x0, draw, dur, slow,
            toneStart: t + life,                // the tail starts to vanish: the tone fades in
            toneEnd: t + life + dur,            // the last of the line vanishes: silence
            // Height in the range (0..1) at `tau` seconds along the line.
            pos(tau) {
              let v = 0.5 + (noise(offset + NOISE_RATE * tau) - 0.5) * WANDER;
              for (let k = 0; k < 4 && (v < EDGE || v > 1 - EDGE); k++) {
                v = v < EDGE ? 2 * EDGE - v : 2 * (1 - EDGE) - v;   // turn back at the edges
              }
              return clamp(v, EDGE, 1 - EDGE);
            },
            // Across the box at `tau` seconds along the line.
            x(tau) { return x0 + SPEED * tau; },
            // Frequency of the tone `tau` seconds after it starts: the tone
            // traces the line at the point where the tail is vanishing.
            hz(tau) { return sec.lowHz * Math.pow(ratio, line.pos(clamp(tau / slow, 0, draw))); },
            // Loudness (0..1) of the tone `tau` seconds after it starts.
            env(tau) {
              if (tau <= 0 || tau >= dur) return 0;
              if (tau < fade) return 0.5 - 0.5 * Math.cos(Math.PI * tau / fade);
              if (tau > dur - fade) return 0.5 - 0.5 * Math.cos(Math.PI * (dur - tau) / fade);
              return 1;
            },
          };
          lines.push(line);
          longest = Math.max(longest, dur);
        }
        t += life + longest + GAP;
        pairCount++;
      }
      sec.end = t;
    });

    return { sections, lines, life, guides: !!cfg.guides, hideTimeline: !!cfg.hideTimeline, pairs: pairCount, duration: t + 3 };
  };

  LC.formatTime = function (t) {
    const s = Math.max(0, Math.floor(t));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
})();
