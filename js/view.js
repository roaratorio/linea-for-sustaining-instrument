// Linea for Cello. © Rob Casey.
// Drawing. Given the score and a time, paint the whole screen.
// Nothing in here changes the score or keeps time.
(function () {
  const LC = (globalThis.LC = globalThis.LC || {});

  // The two voice colours are taken from a Clyfford Still painting.
  LC.themes = {
    light: {
      bg: '#f3efe6', ink: '#1f1b18', faint: '#a39c90', accent: '#800311', guide: 'rgba(31,27,24,0.09)',
      voices: [[224, 160, 0], [128, 3, 17]],
      played: 'rgba(0,0,0,0.06)',
    },
    dark: {
      bg: '#14110f', ink: '#e4dfd5', faint: '#7d766b', accent: '#e0a000', guide: 'rgba(228,223,213,0.10)',
      voices: [[224, 160, 0], [176, 24, 38]],
      played: 'rgba(255,255,255,0.08)',
    },
  };

  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const MONO = '"Courier New", Courier, monospace';
  const CLEF_FONT = '"Apple Symbols", "Noto Music", "Segoe UI Symbol", serif';
  const RANGE_FADE = 1.5;      // seconds for a change of range to cross-fade
  const RANGE_PREVIEW = 20;    // seconds of warning before a change of range
  const DISSOLVE = 0.1;        // the stretch of line, in box-widths, that fades ahead of the tail

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')';

  // Where everything goes for a window of this size.
  LC.layout = function (W, H) {
    const tlH = 78;
    const panelW = clamp(W * 0.24, 200, 400);
    const boxX = panelW + 56;
    const boxW = Math.max(200, W - boxX - 40);
    const boxH = clamp(boxW / 3, 70, Math.max(70, H - tlH - 150));
    const boxY = Math.max(70, (H - tlH - boxH) / 2 + 12);
    const tl = { x: 30, y: H - 44, w: W - 60, h: 16 };
    return { W, H, panelW, boxX, boxY, boxW, boxH, tl };
  };

  function stroke(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // --- Notation ---------------------------------------------------------------

  // Each clef: its glyph, how tall to draw it and where its top sits (in staff
  // spaces above the middle line), and the staff position of the bottom line.
  const CLEFS = {
    treble: { glyph: '𝄞', height: 7.2, top: 3.55, bottomStep: 30 },   // bottom line E4
    bass: { glyph: '𝄢', height: 3.3, top: 2.05, bottomStep: 18 },     // bottom line G2
    tenor: { glyph: '𝄡', height: 4.0, top: 3.0, bottomStep: 22 },     // bottom line D3
  };

  const glyphMetrics = {};
  function drawGlyph(ctx, glyph, x, top, height) {
    let m = glyphMetrics[glyph];
    if (!m) {
      ctx.font = '100px ' + CLEF_FONT;
      const tm = ctx.measureText(glyph);
      m = glyphMetrics[glyph] = { asc: tm.actualBoundingBoxAscent, desc: tm.actualBoundingBoxDescent };
    }
    const h = m.asc + m.desc;
    if (!(h > 0)) return;
    const scale = height / h;
    ctx.font = 100 * scale + 'px ' + CLEF_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(glyph, x, top + m.asc * scale);
  }

  // A staff with its clef and the two notes that bound the range, joined by a line.
  function drawRange(ctx, th, sec, x0, yMid, sp, staffW, alpha) {
    if (alpha <= 0) return;
    const clef = CLEFS[sec.clef];
    const yOf = (step) => yMid + 2 * sp - (step - clef.bottomStep) * sp / 2;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = th.ink;
    ctx.strokeStyle = th.ink;

    drawGlyph(ctx, clef.glyph, x0 + sp * 0.3, yMid - clef.top * sp, clef.height * sp);

    const notes = [
      { note: sec.low, x: x0 + staffW * 0.56 },
      { note: sec.high, x: x0 + staffW * 0.84 },
    ];
    notes.forEach(({ note, x }) => {
      const y = yOf(note.step);
      ctx.lineWidth = Math.max(1, sp * 0.13);
      for (let s = clef.bottomStep - 2; s >= note.step; s -= 2) stroke(ctx, x - sp * 1.15, yOf(s), x + sp * 1.15, yOf(s));
      for (let s = clef.bottomStep + 10; s <= note.step; s += 2) stroke(ctx, x - sp * 1.15, yOf(s), x + sp * 1.15, yOf(s));
      ctx.beginPath();
      ctx.ellipse(x, y, sp * 0.68, sp * 0.47, -0.35, 0, Math.PI * 2);
      ctx.fill();
      if (note.acc) {
        ctx.font = sp * 2.5 + 'px ' + CLEF_FONT;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(note.acc === 'b' ? '♭' : '♯', x - sp * 0.95, y - (note.acc === 'b' ? sp * 0.3 : 0));
      }
    });

    // The line between them: anywhere from one note to the other.
    const a = notes[0], b = notes[1];
    const ya = yOf(a.note.step), yb = yOf(b.note.step);
    const startX = a.x + sp * 1.0;
    const endX = b.x - sp * (b.note.acc ? 2.2 : 1.0);
    const slope = (yb - ya) / (b.x - a.x);
    ctx.lineWidth = Math.max(1.2, sp * 0.2);
    stroke(ctx, startX, ya + slope * (startX - a.x), endX, ya + slope * (endX - a.x));
    ctx.restore();
  }

  function drawPanel(ctx, L, th, score, t) {
    const sp = Math.min(clamp(L.boxH * 0.06, 7, 20), (L.panelW - 30) / 15);
    const staffW = sp * 15;
    const x0 = Math.max(18, (L.panelW - staffW) / 2 + 8);
    const yMid = L.boxY + L.boxH / 2;

    ctx.strokeStyle = th.ink;
    ctx.lineWidth = Math.max(1, sp * 0.13);
    for (let i = -2; i <= 2; i++) stroke(ctx, x0, yMid + i * sp, x0 + staffW, yMid + i * sp);

    const { sec, prev, p } = currentSection(score, t);
    if (prev && p < 1) drawRange(ctx, th, prev, x0, yMid, sp, staffW, 1 - p);
    drawRange(ctx, th, sec, x0, yMid, sp, staffW, p);

    // The range in words, and a warning of the next one.
    const size = clamp(L.boxH * 0.085, 14, 27);
    const shown = prev && p < 0.5 ? prev : sec;
    const y = yMid + sp * 6.2 + size * 0.4;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 ' + size + 'px ' + FONT;
    ctx.fillStyle = th.ink;
    ctx.fillText(shown.label, x0, y);

    const next = score.sections[sec.index + 1];
    const remaining = sec.end - t;
    if (next && remaining < RANGE_PREVIEW) {
      ctx.globalAlpha = clamp((RANGE_PREVIEW - remaining) / 2, 0, 1);
      ctx.fillStyle = th.accent;
      ctx.font = size * 0.85 + 'px ' + FONT;
      ctx.fillText('→ ' + next.label + '   ' + Math.ceil(remaining) + 's', x0, y + size * 1.5);
      ctx.globalAlpha = 1;
    }
  }

  // Which range applies at time t, and how far a cross-fade from the last has got.
  function currentSection(score, t) {
    const secs = score.sections;
    let i = 0;
    while (i + 1 < secs.length && secs[i + 1].start <= t) i++;
    const p = i > 0 ? clamp((t - secs[i].start) / RANGE_FADE, 0, 1) : 1;
    return { sec: secs[i], prev: i > 0 ? secs[i - 1] : null, p };
  }

  // --- The box ----------------------------------------------------------------

  function drawTicks(ctx, L, th, sec, alpha) {
    if (alpha <= 0) return;
    const size = clamp(L.boxH * 0.075, 13, 24);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = th.ink;
    ctx.fillStyle = th.ink;
    ctx.lineWidth = 1;
    ctx.font = size + 'px ' + MONO;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const minGap = size * 1.05;                     // skip labels that would collide
    let lastY = Infinity;
    sec.ticks.forEach((tick, i) => {
      const y = L.boxY + L.boxH * (1 - tick.v);
      const edge = i === 0 || i === sec.ticks.length - 1;
      if (!edge) stroke(ctx, L.boxX, y, L.boxX + L.boxW * 0.025, y);
      const topY = L.boxY;
      const room = lastY - y >= minGap && (edge || y - topY >= minGap);
      if (edge || room) {
        ctx.fillText(tick.label, L.boxX - 10, y);
        lastY = y;
      }
    });
    ctx.restore();
  }

  // Optional faint lines across the box at each semitone.
  function drawGuides(ctx, L, th, sec, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = th.guide;
    ctx.lineWidth = 1;
    sec.ticks.slice(1, -1).forEach((tick) => {
      const y = Math.round(L.boxY + L.boxH * (1 - tick.v)) + 0.5;
      stroke(ctx, L.boxX, y, L.boxX + L.boxW, y);
    });
    ctx.restore();
  }

  // One line: drawn left to right at full strength. The tail sets off `life`
  // seconds after the line began and travels `slow` times slower than the line
  // was drawn; only the stretch just ahead of the tail fades, so the line stays
  // legible right up to the point where it is vanishing.
  function drawLine(ctx, L, th, score, line, t) {
    const age = t - line.t0;
    if (age <= 0 || age >= score.life + line.dur) return;
    const life = score.life;
    const tail = Math.max(0, (age - life) / line.slow);   // the oldest point still showing
    const head = Math.min(age, line.draw);           // the newest
    const X = (tau) => L.boxX + L.boxW * line.x(tau);
    const Y = (tau) => L.boxY + L.boxH * (1 - line.pos(tau));
    // Seconds a point spends fading before the tail reaches it.
    const fadeTime = Math.min(DISSOLVE / (line.x(1) - line.x(0)) * line.slow, life * 0.6);
    const alphaAt = (tau) => {
      const k = clamp((life + tau * line.slow - age) / fadeTime, 0, 1);
      return k * k * (3 - 2 * k);
    };
    const colour = th.voices[line.voice];
    const width = Math.max(4, L.boxH * 0.032);

    const xTail = X(tail), xHead = X(head);
    if (xHead - xTail < 0.75) {
      ctx.fillStyle = rgba(colour, alphaAt(head));
      ctx.beginPath();
      ctx.arc(xHead, Y(head), width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // The fade runs smoothly along the line, so one gradient paints it all.
    const grad = ctx.createLinearGradient(xTail, 0, xHead, 0);
    const STOPS = 48;
    for (let k = 0; k <= STOPS; k++) {
      grad.addColorStop(k / STOPS, rgba(colour, alphaAt(tail + (head - tail) * k / STOPS)));
    }
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(xTail, Y(tail));
    const step = 1 / 30;
    for (let tau = (Math.floor(tail / step) + 1) * step; tau < head; tau += step) ctx.lineTo(X(tau), Y(tau));
    ctx.lineTo(xHead, Y(head));
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // --- Timeline -----------------------------------------------------------------

  function drawTimeline(ctx, L, th, score, t, ui) {
    const tl = L.tl;
    const X = (time) => tl.x + tl.w * clamp(time / score.duration, 0, 1);

    // When each voice sounds.
    const rowH = tl.h / 2;
    score.lines.forEach((line) => {
      ctx.fillStyle = rgba(th.voices[line.voice], 0.85);
      const x1 = X(line.toneStart);
      ctx.fillRect(x1, tl.y + line.voice * rowH + 1, Math.max(1, X(line.toneEnd) - x1), rowH - 2);
    });

    ctx.fillStyle = th.played;
    ctx.fillRect(tl.x, tl.y, X(t) - tl.x, tl.h);

    // The ranges.
    ctx.strokeStyle = th.faint;
    ctx.lineWidth = 1;
    ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, tl.w - 1, tl.h - 1);
    ctx.font = '12px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    score.sections.forEach((sec) => {
      const x = X(sec.start);
      if (sec.index > 0) stroke(ctx, x + 0.5, tl.y - 5, x + 0.5, tl.y + tl.h);
      const room = X(sec.end) - x;
      ctx.fillStyle = t >= sec.start && t < sec.end ? th.ink : th.faint;
      if (room > ctx.measureText(sec.label).width + 10) ctx.fillText(sec.label, x + (sec.index > 0 ? 5 : 0), tl.y - 8);
    });

    // Playhead, and the time.
    ctx.strokeStyle = th.ink;
    ctx.lineWidth = 1.5;
    stroke(ctx, X(t), tl.y - 4, X(t), tl.y + tl.h + 4);
    ctx.fillStyle = th.ink;
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(LC.formatTime(t) + ' / ' + LC.formatTime(score.duration), tl.x + tl.w, tl.y + tl.h + 20);

    if (ui.hoverT !== null && ui.hoverT !== undefined) {
      const x = X(ui.hoverT);
      ctx.strokeStyle = th.accent;
      ctx.lineWidth = 1;
      stroke(ctx, x, tl.y - 4, x, tl.y + tl.h + 4);
      ctx.fillStyle = th.accent;
      ctx.textAlign = x > tl.x + tl.w - 60 ? 'right' : 'left';
      ctx.fillText(LC.formatTime(ui.hoverT), x + (ctx.textAlign === 'right' ? -6 : 6), tl.y + tl.h + 20);
    }
  }

  // --- Everything -----------------------------------------------------------------

  LC.draw = function (ctx, W, H, score, t, ui) {
    const th = LC.themes[ui.theme] || LC.themes.light;
    const L = LC.layout(W, H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);

    drawPanel(ctx, L, th, score, t);

    const { sec, prev, p } = currentSection(score, t);
    if (prev && p < 1) drawTicks(ctx, L, th, prev, 1 - p);
    drawTicks(ctx, L, th, sec, p);
    if (score.guides) {
      if (prev && p < 1) drawGuides(ctx, L, th, prev, 1 - p);
      drawGuides(ctx, L, th, sec, p);
    }

    // Lines are kept inside the box even where their round ends would poke out.
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.boxX, L.boxY, L.boxW, L.boxH);
    ctx.clip();
    score.lines.forEach((line) => drawLine(ctx, L, th, score, line, t));
    ctx.restore();

    ctx.strokeStyle = th.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(L.boxX) + 0.5, Math.round(L.boxY) + 0.5, Math.round(L.boxW), Math.round(L.boxH));

    drawTimeline(ctx, L, th, score, t, ui);
  };
})();
