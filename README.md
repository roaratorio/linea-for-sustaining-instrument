# Linea for Cello

Composed and designed by Rob Casey.

An animated score for cello and sine tones. Lines are drawn inside a box whose
height is a range of pitch, shown in notation at the left. When the tail of a
line starts to disappear, a sine tone begins; its pitch follows the point where
the line is vanishing. The cellist plays sustained tones in the same register,
in ways that may cause beating with the sine tones. The two voices sound hard
left and hard right.

## Running it

Open `index.html` in a browser. There is nothing to install or build, and
nothing is fetched from the internet.

| Key | Action |
|---|---|
| Space | Play / pause |
| ← → | Jump 10 seconds (with Shift: 1 minute) |
| Home or 0 | Back to the start |
| S | Setup |
| F | Fullscreen |
| D | Light / dark |

Click the timeline at the bottom to jump to that point.

## Setup

Everything is set in the Setup panel and takes effect at once. Settings are
remembered in the browser.

- **Seed**: the same seed always gives the same lines.
- **A4 tuning**: the reference pitch for the sine tones.
- **Wait before the tail fades**: seconds between a line starting and its tone beginning.
- **Tail slow-down**: how much slower the tail vanishes than the line was drawn; tones last this many times longer.
- **Tone fade in / out**: seconds for each tone to fade in and out.
- **Faint guide line at each semitone**: optional lines across the box.
- **Ranges**: played in order. Each has a lowest and highest note (for example `F#2` and `A2`; `C4` is middle C), a number of pairs of lines, and a clef.

© Rob Casey. All rights reserved.
