// Linea for sustaining instrument. © Rob Casey.
// The setup panel: the ranges and timings of the piece, editable, with the
// score rebuilt live behind it. It edits a plain config object (the same shape
// as LC.defaults) and hands it to LC.app.applyConfig().
(function () {
  const LC = globalThis.LC;
  const panel = document.getElementById('setup');
  let config = null;
  let timer = null;

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== false) node.setAttribute(k, v);
    });
    kids.flat().forEach((kid) => {
      if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
    });
    return node;
  }

  function changed() {
    clearTimeout(timer);
    timer = setTimeout(apply, 250);
  }

  function apply() {
    const result = LC.app.applyConfig(config);
    const status = document.getElementById('setup-status');
    if (!status) return;
    status.className = result.ok ? '' : 'error';
    if (!result.ok) { status.textContent = 'Not applied: ' + result.error; return; }
    const score = LC.app.score;
    status.textContent = 'Length ' + LC.formatTime(score.duration) + '   ·   ' +
      score.sections.map((s) => s.label + ' from ' + LC.formatTime(s.start)).join('   ·   ');
  }

  // A labelled input bound to obj[key].
  function field(label, obj, key, opts) {
    opts = opts || {};
    const input = el('input', {
      type: opts.type || 'text', value: obj[key],
      min: opts.min, max: opts.max, step: opts.step, spellcheck: 'false',
      oninput: () => {
        if (opts.type === 'number') {
          const v = parseFloat(input.value);
          if (!isFinite(v)) return;
          obj[key] = v;
        } else {
          obj[key] = input.value;
        }
        if (opts.check) input.classList.toggle('bad', !opts.check(input.value));
        changed();
      },
    });
    return el('label', { class: 'field' + (opts.wide ? ' wide' : '') }, el('span', {}, label), input);
  }

  function rangeCard(sec, i) {
    const clef = el('select', {
      onchange: () => { sec.clef = clef.value; changed(); },
    }, ['auto', 'bass', 'tenor', 'alto', 'treble'].map((c) =>
      el('option', { value: c, selected: (sec.clef || 'auto') === c }, c[0].toUpperCase() + c.slice(1))));

    const isNote = (v) => !!LC.parseNote(v);
    return el('div', { class: 'card' },
      el('div', { class: 'card-head' },
        el('strong', {}, 'Range ' + (i + 1)),
        config.sections.length > 1 && el('button', {
          class: 'link',
          onclick: () => { config.sections.splice(i, 1); render(); changed(); },
        }, 'Remove')),
      el('div', { class: 'grid' },
        field('Lowest note', sec, 'low', { check: isNote }),
        field('Highest note', sec, 'high', { check: isNote }),
        field('Pairs of lines', sec, 'pairs', { type: 'number', min: 1, max: 500, step: 1 }),
        el('label', { class: 'field' }, el('span', {}, 'Clef'), clef)));
  }

  function render() {
    const volume = el('input', {
      type: 'range', min: 0, max: 1, step: 0.01, value: config.volume,
      oninput: () => { config.volume = parseFloat(volume.value); LC.app.setVolume(config.volume); },
    });
    const guides = el('input', {
      type: 'checkbox', checked: config.guides ? '' : false,
      onchange: () => { config.guides = guides.checked; LC.app.setDisplay('guides', guides.checked); },
    });
    const hideTimeline = el('input', {
      type: 'checkbox', checked: config.hideTimeline ? '' : false,
      onchange: () => { config.hideTimeline = hideTimeline.checked; LC.app.setDisplay('hideTimeline', hideTimeline.checked); },
    });
    const seed = field('Seed (the same seed always gives the same lines)', config, 'seed', { wide: true });

    panel.replaceChildren(
      el('div', { class: 'setup-head' },
        el('h2', {}, 'Setup'),
        el('button', { class: 'link', onclick: () => LC.setup.close() }, 'Close')),

      el('div', { class: 'card' },
        el('div', { class: 'grid' },
          seed,
          el('div', { class: 'field wide' },
            el('button', {
              class: 'tool',
              onclick: () => { config.seed = LC.randomSeed(); render(); changed(); },
            }, 'New seed')),
          field('A4 tuning (Hz)', config, 'a4', { type: 'number', min: 380, max: 480, step: 0.5 }),
          field('Wait before the tail fades (s)', config, 'tailLife', { type: 'number', min: 2, max: 120, step: 1 }),
          field('Tail slow-down (×)', config, 'tailSlow', { type: 'number', min: 1, max: 20, step: 0.5 }),
          field('Tone fade in / out (s)', config, 'toneFade', { type: 'number', min: 0.05, max: 30, step: 0.5 }),
          el('label', { class: 'field' }, el('span', {}, 'Volume'), volume),
          el('label', { class: 'check wide' }, guides, 'Faint guide line at each semitone'),
          el('label', { class: 'check wide' }, hideTimeline, 'Hide the timeline while playing (move the mouse to bring it back)')),
        el('p', { class: 'hint' }, 'Each line is drawn at full strength. After the wait, its tail starts to disappear and its tone begins; the tone follows the vanishing point until the last of the line has gone. The tail slow-down sets how long that takes: at 1 the tail vanishes as fast as the line was drawn; at 3 it takes three times as long, so each tone lasts three times longer.')),

      el('p', { class: 'hint' }, 'Ranges are played in order. Write notes as a letter, an optional # or b, and an octave: C4 is middle C, C2 is two octaves below it.'),
      ...config.sections.map(rangeCard),

      el('div', { class: 'setup-actions' },
        el('button', {
          class: 'tool',
          onclick: () => {
            const last = config.sections[config.sections.length - 1];
            config.sections.push({ low: last.low, high: last.high, pairs: 10, clef: 'auto' });
            render(); changed();
          },
        }, '+ Add a range'),
        el('button', {
          class: 'tool',
          onclick: () => {
            if (!confirm('Replace the current setup with the original piece?')) return;
            config = JSON.parse(JSON.stringify(LC.defaults));
            render(); changed();
          },
        }, 'Reset')),

      el('p', { id: 'setup-status' }));
    apply();
  }

  LC.setup = {
    isOpen: false,
    open() {
      config = JSON.parse(JSON.stringify(LC.app.config));
      LC.setup.isOpen = true;
      panel.hidden = false;
      document.body.classList.add('setup-open');
      render();
      LC.app.resize();
    },
    close() {
      LC.setup.isOpen = false;
      panel.hidden = true;
      document.body.classList.remove('setup-open');
      LC.app.resize();
    },
    toggle() { LC.setup.isOpen ? LC.setup.close() : LC.setup.open(); },
  };
})();
