// Pure helpers for the handwriting board: timing numbers, the seeded jitter, doodle paths.
// No DOM in here, so the Node tests can run it.  Works as a plain <script> (window.HBCore) and as require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HBCore = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // seconds; the reveal time of one character is the base time times a seeded jitter
  var CFG = {
    cjkDur: 0.17, asciiDur: 0.075, spaceDur: 0.03,
    jitter: 0.30,
    linePause: 0.32, titlePause: 0.5,
    doodleDur: 0.6, doodlePause: 0.22,
    pageTurn: 0.65,
    handLeave: 0.3,                       // the hand fades off the board at the end of each page
    pageHold: 0.3,                        // the bare finished page rests this long before it turns
    handLift: 4,                          // pen tip sits this far above the baseline (stage px)
  };

  // Two board shapes.  Numbers are in "stage px"; the page scales the stage to fit the frame.  Landscape is the 16:9 video-style
  // board; portrait is nearly square (720x740) with the writing a little smaller in stage terms but much larger on a phone screen.
  // follow: flow mode scrolls the board once the pen is lower than this.  hand: size of the hand relative to landscape.
  var LAYOUTS = {
    landscape: { name: 'landscape', w: 1280, h: 720, body: 46, title: 66, lh: 1.55, gap: 14, titleGap: 26, padT: 78, padR: 96, padL: 110, flowPadT: 40, follow: 380, hand: 1 },
    portrait: { name: 'portrait', w: 720, h: 740, body: 44, title: 62, lh: 1.75, gap: 22, titleGap: 34, padT: 90, padR: 24, padL: 40, flowPadT: 50, follow: 420, hand: 0.7 },
  };
  var MAX_SCALE = 1.25;   // never blow the stage up beyond this on a big monitor

  // Largest the board can be inside availW x availH (CSS px) in the given shape.
  function fitLayout(L, availW, availH) {
    var s = Math.max(0.05, Math.min(availW / L.w, availH / L.h, MAX_SCALE));
    return { layout: L, scale: s, w: L.w * s, h: L.h * s, bodyPx: L.body * s, titlePx: L.title * s };
  }
  // Pick the shape that makes the writing larger on screen (ties go to landscape).
  function chooseLayout(availW, availH) {
    var a = fitLayout(LAYOUTS.landscape, availW, availH), b = fitLayout(LAYOUTS.portrait, availW, availH);
    return b.bodyPx > a.bodyPx + 1e-9 ? b : a;
  }

  // seeded pseudo-random in [0,1): same input, same picture
  function seed01(i) { var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  function isCJK(c) { return /[㐀-鿿豈-﫿　-〿＀-￯]/.test(c); }

  // A space is drawn as a no-break space so the inline-block box around it never collapses.  That is the code point the
  // font has to carry, so the font tests and the subset tool go through these two instead of the raw text.
  function displayChar(c) { return c === ' ' ? '\u00a0' : c; }
  function displayText(text) { return Array.from(text).map(displayChar).join(''); }

  // reveal time of each character of a line
  function charDurations(text, seedBase) {
    return Array.from(text).map(function (c, ci) {
      if (c === ' ') return CFG.spaceDur;
      var base = isCJK(c) ? CFG.cjkDur : CFG.asciiDur;
      return base * (1 - CFG.jitter / 2 + CFG.jitter * seed01(seedBase + ci));
    });
  }

  // doodle path for a rectangle r = {x,y,w,h} in stage px.  Hand-made Béziers with seeded wobble, no assets.
  // maxX (optional): the right-most x a doodle may reach; only the arrow, which points off to the right of its line, uses it.
  function doodleFor(kind, r, seed, maxX) {
    var j = function (k, amp) { return (seed01(seed * 7 + k) - 0.5) * amp; };
    if (kind === 'circle') {
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 2, rx = r.w / 2 + 16, ry = r.h / 2 + 8;
      // start at the left, go round a little more than once (the overlap of a hand-drawn circle);
      // 16 jittered points turned into smooth cubic segments (Catmull-Rom)
      var N = 16, pts = [];
      for (var k = 0; k <= N + 1; k++) { var a = Math.PI + (k / N) * Math.PI * 2 * 1.06; pts.push([cx + Math.cos(a) * (rx + j(k, 6)), cy + Math.sin(a) * (ry + j(k + 20, 5))]); }
      var d = 'M' + pts[0][0] + ' ' + pts[0][1];
      for (var m = 0; m < pts.length - 1; m++) {
        var p0 = pts[Math.max(m - 1, 0)], p1 = pts[m], p2 = pts[m + 1], p3 = pts[Math.min(m + 2, pts.length - 1)];
        var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ' C' + c1[0] + ' ' + c1[1] + ' ' + c2[0] + ' ' + c2[1] + ' ' + p2[0] + ' ' + p2[1];
      }
      return d;
    }
    if (kind === 'underline') {
      var y = r.y + r.h - 6, x0 = r.x - 6, x1 = r.x + r.w + 6, n = 3, u = 'M' + x0 + ' ' + y;
      for (var q = 1; q <= n * 2; q++) { var x = x0 + (x1 - x0) * (q / (n * 2)); u += ' Q' + (x - (x1 - x0) / (n * 4)) + ' ' + (y + (q % 2 ? 6 : -4) + j(q, 3)) + ' ' + x + ' ' + (y + j(q + 9, 2)); }
      return u;
    }
    if (kind === 'box') {
      var bx0 = r.x - 12, by0 = r.y + 2, bx1 = r.x + r.w + 12, by1 = r.y + r.h + 2;
      return 'M' + (bx0 + j(1, 6)) + ' ' + (by0 + j(2, 6)) + ' L' + (bx1 + j(3, 6)) + ' ' + (by0 + j(4, 6)) + ' L' + (bx1 + j(5, 6)) + ' ' + (by1 + j(6, 6)) +
        ' L' + (bx0 + j(7, 6)) + ' ' + (by1 + j(8, 6)) + ' L' + (bx0 + j(9, 6)) + ' ' + (by0 - 4);
    }
    if (kind === 'arrow') {
      var ay = r.y + r.h / 2 + 4, ax0 = r.x + r.w + 26, ax1 = ax0 + (maxX == null ? 150 : Math.min(150, Math.max(60, maxX - ax0)));
      return 'M' + ax0 + ' ' + (ay + j(1, 4)) + ' Q' + ((ax0 + ax1) / 2) + ' ' + (ay - 10 + j(2, 6)) + ' ' + ax1 + ' ' + ay + ' M' + (ax1 - 26) + ' ' + (ay - 20) + ' L' + ax1 + ' ' + ay + ' L' + (ax1 - 28) + ' ' + (ay + 16);
    }
    return '';
  }

  return { CFG: CFG, LAYOUTS: LAYOUTS, MAX_SCALE: MAX_SCALE, fitLayout: fitLayout, chooseLayout: chooseLayout, seed01: seed01, isCJK: isCJK, displayChar: displayChar, displayText: displayText, charDurations: charDurations, doodleFor: doodleFor };
});
