// Linea for sustaining instrument. © Rob Casey.
// Seeded random numbers and smooth noise: the same seed always gives the same piece.
(function () {
  const LC = (globalThis.LC = globalThis.LC || {});

  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  // Returns a function giving numbers in [0, 1). `stream` keeps separate
  // uses independent of one another.
  LC.makeRng = function (seed, stream) {
    let a = hashString(String(seed) + '/' + String(stream || ''));
    const next = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.between = (min, max) => min + next() * (max - min);
    return next;
  };

  // Smooth one-dimensional noise in the manner of Perlin's (and p5's noise()):
  // four octaves, each half the strength and twice the speed of the last.
  // Returns a function noise(x) giving values in [0, 1], centred on 0.5.
  LC.makeNoise = function (seed) {
    const rng = LC.makeRng(seed, 'noise');
    const SIZE = 1024;
    const table = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) table[i] = rng();

    function smooth(x) {
      const i = Math.floor(x);
      const f = x - i;
      const a = table[((i % SIZE) + SIZE) % SIZE];
      const b = table[(((i + 1) % SIZE) + SIZE) % SIZE];
      const k = 0.5 - 0.5 * Math.cos(Math.PI * f); // ease between the two
      return a + (b - a) * k;
    }

    return function (x) {
      let sum = 0, amp = 0.5, freq = 1;
      for (let o = 0; o < 4; o++) {
        sum += amp * smooth(x * freq + o * 37.7);
        amp *= 0.5;
        freq *= 2;
      }
      return sum / 0.9375;
    };
  };

  const WORDS = ['amber', 'birch', 'cobalt', 'drift', 'ember', 'fathom', 'glass', 'harbour',
    'indigo', 'juniper', 'kelp', 'lumen', 'moss', 'nimbus', 'ochre', 'pewter',
    'quartz', 'russet', 'slate', 'tallow', 'umber', 'vellum', 'willow', 'zinc'];

  LC.randomSeed = function () {
    const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
    return pick() + '-' + pick() + '-' + Math.floor(Math.random() * 90 + 10);
  };
})();
