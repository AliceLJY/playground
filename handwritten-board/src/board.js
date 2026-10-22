// The handwriting board: lays the words out, builds one GSAP timeline that reveals them character by character
// with a hand that follows the pen tip, and wires the player controls.  Needs vendor/gsap.min.js, src/pages.js, src/core.js.
(function () {
  'use strict';
  var C = window.HBCore, PAGES = window.HB_PAGES, CFG = C.CFG, seed01 = C.seed01, isCJK = C.isCJK;
  var $ = function (id) { return document.getElementById(id); };
  var wrap = $('wrap'), head = $('head'), bar = $('bar'), frame = $('frame'), stage = $('stage'), board = $('board'), doodles = $('doodles'), hand = $('hand'), pagenumEl = $('pagenum');
  var ui = { pagemode: $('pagemode'), speed: $('speed'), font: $('font'), replay: $('replay'), playpause: $('playpause') };
  var params = new URLSearchParams(location.search);
  var VIEW = params.get('view');                  // page1 | page2 | mid | null (normal playback)
  if (params.get('mode') === 'flow') ui.pagemode.checked = false;   // fixed views can also be taken in flow (long scroll) mode
  var t0 = performance.now();

  var LAYOUT = C.LAYOUTS.landscape;
  var lastBox = { w: 0, h: 0 };
  var tl = null, scale = 1, marks = { pageDone: [], mid: 0 }, ready = false, readyMs = null;

  // ---------- size: pick the board shape for this screen and scale it to fit ----------
  function cssNum(v) { return parseFloat(v) || 0; }
  function availableBox() {
    var cs = getComputedStyle(wrap), headH = head.offsetParent ? head.offsetHeight : 0;
    var padX = cssNum(cs.paddingLeft) + cssNum(cs.paddingRight), padY = cssNum(cs.paddingTop) + cssNum(cs.paddingBottom), gap = cssNum(cs.rowGap);
    return { w: wrap.clientWidth - padX, h: window.innerHeight - padY - headH - bar.offsetHeight - gap * (headH ? 2 : 1) };
  }
  // sets the frame size and returns true when the board shape changed (the caller then rebuilds the timeline)
  function fit() {
    var box = availableBox(), pick = C.chooseLayout(box.w, box.h), changed = pick.layout !== LAYOUT;
    LAYOUT = pick.layout; scale = pick.scale; lastBox = box;
    frame.style.width = pick.w + 'px'; frame.style.height = pick.h + 'px';
    stage.style.transform = 'scale(' + scale + ')';
    return changed;
  }
  function applyLayoutVars() {
    var set = function (k, v) { stage.style.setProperty(k, v); };
    set('--sw', LAYOUT.w + 'px'); set('--sh', LAYOUT.h + 'px'); set('--fs', LAYOUT.body + 'px'); set('--fs-title', LAYOUT.title + 'px');
    set('--lh', LAYOUT.lh); set('--gap', LAYOUT.gap + 'px'); set('--title-gap', LAYOUT.titleGap + 'px');
    set('--pad-t', LAYOUT.padT + 'px'); set('--pad-r', LAYOUT.padR + 'px'); set('--pad-l', LAYOUT.padL + 'px'); set('--flow-pad-t', LAYOUT.flowPadT + 'px');
    stage.dataset.layout = LAYOUT.name;
  }

  // put PAGES into the DOM.  Page mode: pages stacked; flow mode: pages run down one long scroll
  function layout(pageMode) {
    board.querySelectorAll('.page').forEach(function (p) { p.remove(); });
    doodles.innerHTML = '';
    PAGES.forEach(function (pg, pi) {
      var page = document.createElement('div');
      page.className = 'page' + (pageMode ? '' : ' flow');
      page.dataset.page = pi;
      var mk = function (spec, cls) {
        var line = document.createElement('div');
        line.className = 'line ' + cls;
        var text = spec.text || spec, tStart = -1, tEnd = -1;
        if (spec.target) { tStart = text.indexOf(spec.target); tEnd = tStart >= 0 ? tStart + spec.target.length : -1; }
        Array.from(text).forEach(function (c, ci) {
          var s = document.createElement('span');
          s.className = 'ch' + (c === ' ' ? ' sp' : '') + (/[A-Za-z0-9]/.test(c) ? ' lat' : '') + (ci >= tStart && ci < tEnd ? ' tgt' : '');
          s.textContent = C.displayChar(c);
          line.appendChild(s);
        });
        page.appendChild(line);
        return line;
      };
      pg._titleEl = mk(pg.title, 'title');
      pg._lineEls = pg.lines.map(function (l) { return mk(l, 'body'); });
      board.appendChild(page);
      pg._el = page;
    });
    var h = pageMode ? LAYOUT.h : board.scrollHeight;
    doodles.setAttribute('height', h); doodles.style.height = h + 'px';
  }

  // rectangle in stage px (scale divided out; the board's own translate is zero while measuring)
  function rectOf(el) {
    var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return { x: (r.left - s.left) / scale, y: (r.top - s.top) / scale, w: r.width / scale, h: r.height / scale };
  }
  function unionRect(els) {
    var rs = els.map(rectOf);
    var x0 = Math.min.apply(null, rs.map(function (r) { return r.x; })), y0 = Math.min.apply(null, rs.map(function (r) { return r.y; }));
    var x1 = Math.max.apply(null, rs.map(function (r) { return r.x + r.w; })), y1 = Math.max.apply(null, rs.map(function (r) { return r.y + r.h; }));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // the hand: its pen tip is anchored at (x, y) in stage px
  var handPos = { x: -400, y: -400, rot: 0, alpha: 0 };
  function applyHand() {
    hand.style.transform = 'translate(' + (handPos.x - 20) + 'px, ' + (handPos.y - 240) + 'px) rotate(' + handPos.rot + 'deg) scale(' + LAYOUT.hand + ')';
    hand.style.opacity = handPos.alpha;
  }

  function buildTimeline(pageMode) {
    if (tl) { tl.kill(); tl = null; }
    gsap.set(board, { y: 0 });
    applyLayoutVars();
    layout(pageMode);
    // everything visible and in place while measuring
    PAGES.forEach(function (pg) { gsap.set(pg._el, { autoAlpha: 1, y: 0 }); });
    var measure = new Map();
    PAGES.forEach(function (pg) {
      [pg._titleEl].concat(pg._lineEls).forEach(function (line) { measure.set(line, Array.from(line.querySelectorAll('.ch')).map(rectOf)); });
    });

    tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    handPos.x = -400; handPos.y = -400; handPos.alpha = 0; applyHand();
    marks = { pageDone: [], mid: 0 };
    var boardY = 0;

    PAGES.forEach(function (pg, pi) {
      var page = pg._el, setLabel = function () { pagenumEl.textContent = (pi + 1) + ' / ' + PAGES.length; };
      if (pageMode && pi > 0) {
        var prev = PAGES[pi - 1]._el;
        tl.set(page, { autoAlpha: 0, y: 24 });
        tl.to({}, { duration: CFG.pageHold });
        tl.call(setLabel, null, tl.duration());      // the number changes as the old page starts to wipe away
        tl.to(prev, { autoAlpha: 0, y: -40, duration: CFG.pageTurn, ease: 'power2.inOut' });
        tl.to(page, { autoAlpha: 1, y: 0, duration: CFG.pageTurn, ease: 'power2.out' }, '<0.25');
        tl.add(function () {}, '+=0.05');
      } else {
        if (pageMode) tl.set(page, { autoAlpha: 1, y: 0 }, 0);
        tl.call(setLabel, null, tl.duration());
      }
      if (pageMode) tl.set({}, {}, tl.duration());

      var lines = [{ el: pg._titleEl, spec: null, text: pg.title, isTitle: true }].concat(pg.lines.map(function (spec, li) { return { el: pg._lineEls[li], spec: spec, text: spec.text, isTitle: false }; }));
      lines.forEach(function (ln, li) {
        var chars = Array.from(ln.el.querySelectorAll('.ch')), rects = measure.get(ln.el);
        var seedBase = pi * 100 + li * 10;
        var durs = C.charDurations(ln.text, seedBase);
        // flow mode: camera follows the pen once the line sinks below LAYOUT.follow
        var lineRect = rects.length ? unionRect(chars) : rectOf(ln.el);
        if (!pageMode) {
          var target = Math.max(0, lineRect.y + lineRect.h - LAYOUT.follow);
          if (target > boardY + 1) { boardY = target; tl.to(board, { y: -boardY, duration: 0.55, ease: 'power2.inOut' }); }
        }
        // hand moves to the start of the line
        var first = rects[0];
        tl.to(handPos, { x: first.x, y: first.y + first.h - CFG.handLift, alpha: 1, duration: li === 0 && pi === 0 ? 0.6 : 0.34, ease: 'power2.inOut', onUpdate: applyHand });
        // per character: the clip-path reveal and the hand's sideways move share one time span
        var lineStart = tl.duration();
        chars.forEach(function (c, ci) {
          var r = rects[ci], d = durs[ci], at = tl.duration();
          tl.fromTo(c, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: d }, at);
          tl.fromTo(handPos, { x: r.x, y: r.y + r.h - CFG.handLift, rot: -3 + 6 * seed01(seedBase + ci + 3) },
            { x: r.x + r.w, y: r.y + r.h - CFG.handLift + (isCJK(c.textContent) ? 2 : 0), rot: -3 + 6 * seed01(seedBase + ci + 5), duration: d, onUpdate: applyHand }, at);
        });
        if (pi === 0 && li === 3) marks.mid = (lineStart + tl.duration()) / 2;   // halfway through the third body line of page 1
        // doodle
        if (ln.spec && ln.spec.doodle) {
          var tgt = ln.spec.target ? chars.filter(function (c) { return c.classList.contains('tgt'); }) : chars;
          var rr = tgt.length ? unionRect(tgt) : lineRect;
          var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', C.doodleFor(ln.spec.doodle, rr, seedBase + 77, LAYOUT.w - 24));
          path.dataset.page = pi;
          doodles.appendChild(path);
          var len = path.getTotalLength();
          path.style.strokeDasharray = len; path.style.strokeDashoffset = len; path.style.opacity = 0;
          var p0 = path.getPointAtLength(0);
          tl.to(handPos, { x: p0.x, y: p0.y, duration: 0.22, ease: 'power2.inOut', onUpdate: applyHand }, '+=0.06');
          var prog = { p: 0 }, at2 = tl.duration();
          tl.set(path, { opacity: 0.92 }, at2);
          tl.to(path, { strokeDashoffset: 0, duration: CFG.doodleDur, ease: 'power1.inOut' }, at2);
          tl.to(prog, { p: 1, duration: CFG.doodleDur, ease: 'power1.inOut', onUpdate: function () {
            var pt = path.getPointAtLength(prog.p * len); handPos.x = pt.x; handPos.y = pt.y; applyHand(); } }, at2);
          tl.to({}, { duration: CFG.doodlePause });
        }
        tl.to({}, { duration: ln.isTitle ? CFG.titlePause : CFG.linePause });
      });
      // the hand lifts off, so the finished page is bare for a moment: this is the fixed view's moment (marks.pageDone)
      tl.to(handPos, { alpha: 0, duration: CFG.handLeave, onUpdate: applyHand });
      marks.pageDone[pi] = tl.duration();
    });
    // page mode: a page's doodles leave with the page
    if (pageMode) {
      PAGES.forEach(function (pg, pi) {
        if (pi === 0) return;
        var paths = Array.from(doodles.querySelectorAll('path[data-page="' + (pi - 1) + '"]'));
        var t0s = tl.getTweensOf(PAGES[pi - 1]._el).filter(function (t) { return t.vars.autoAlpha === 0; }).map(function (t) { return t.startTime(); })[0];
        if (paths.length && t0s != null) tl.to(paths, { opacity: 0, y: -40, duration: CFG.pageTurn, ease: 'power2.inOut' }, t0s);
      });
    }
    // end: 1 s hold on the finished board
    tl.to({}, { duration: 1.0 });

    tl.eventCallback('onUpdate', function () {
      $('progbar').style.width = (tl.progress() * 100) + '%';
      $('clock').textContent = tl.time().toFixed(1) + 's / ' + tl.duration().toFixed(1) + 's';
      syncPlayButton();
    });
    tl.eventCallback('onComplete', syncPlayButton);
    return tl;
  }

  function rebuild(keepRatio) {
    var ratio = keepRatio && tl ? tl.progress() : 0, wasPaused = tl ? tl.paused() : false;
    buildTimeline(ui.pagemode.checked);
    tl.timeScale(parseFloat(ui.speed.value));
    tl.progress(ratio);
    if (!wasPaused && ratio < 1) tl.play();
    syncPlayButton();
  }

  // ---------- controls ----------
  var ended = function () { return tl.progress() >= 1; };
  function syncPlayButton() {
    var label = ended() ? '▶ 再看一遍' : tl.paused() ? '▶ 继续' : '⏸ 暂停';
    if (ui.playpause.textContent !== label) ui.playpause.textContent = label;
  }
  // tap / button / space: pause or resume; after the last page it starts over
  function toggle() {
    if (!tl) return;
    if (ended()) tl.restart(); else tl.paused(!tl.paused());
    syncPlayButton();
  }
  ui.pagemode.addEventListener('change', function () { rebuild(true); });
  ui.speed.addEventListener('change', function () { if (tl) tl.timeScale(parseFloat(ui.speed.value)); });
  ui.font.addEventListener('change', function () {
    document.documentElement.style.setProperty('--hand-font', ui.font.value + ', "Hannotate SC", "STKaiti", serif');
    document.fonts.ready.then(function () { rebuild(true); });
  });
  ui.replay.addEventListener('click', function () { if (tl) { tl.restart(); syncPlayButton(); } });
  ui.playpause.addEventListener('click', toggle);
  frame.addEventListener('click', toggle);
  document.addEventListener('keydown', function (e) {
    if ((e.key === ' ' || e.key === 'Spacebar') && !e.target.closest('button, select, input, label, a')) { e.preventDefault(); toggle(); }
  });
  var resizing = 0;
  function onResize() {
    cancelAnimationFrame(resizing);
    resizing = requestAnimationFrame(function () { if (fit() && tl) rebuild(true); });
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // The font menu only offers fonts this device has: draw a sample with and without the font, same fallback;
  // identical pixels mean the browser had nothing to switch to (not installed, or it lacks these characters).
  function fontInstalled(cssFamily) {
    var c = document.createElement('canvas'); c.width = 400; c.height = 60;
    var g = c.getContext('2d', { willReadFrequently: true }), sample = '手写板书是怎么做的';
    var draw = function (fam) { g.clearRect(0, 0, c.width, c.height); g.font = '40px ' + fam; g.fillText(sample, 4, 44); return g.getImageData(0, 0, c.width, c.height).data; };
    var a = draw(cssFamily + ', serif'), b = draw('serif');
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
    return false;
  }
  function markUnavailableFonts() {
    Array.from(ui.font.options).forEach(function (o) {
      if (o.value === '"Long Cang"') return;
      if (!fontInstalled(o.value)) { o.disabled = true; o.textContent += '(本机没有)'; }
    });
  }

  // ---------- fixed views ----------
  function applyView() {
    var at = { page1: marks.pageDone[0], page2: marks.pageDone[1], mid: marks.mid }[VIEW];
    if (at == null) return;
    tl.pause(); tl.seek(at, false); tl.eventCallback('onUpdate')();
  }

  // ---------- debugging / test hook ----------
  function revealOf(el) {
    var m = /inset\(\s*[\d.]+(?:px)?\s+([\d.]+)%/.exec(getComputedStyle(el).clipPath || '');
    return m ? 1 - parseFloat(m[1]) / 100 : 1;
  }
  function state() {
    var lines = [];
    PAGES.forEach(function (pg, pi) {
      [pg._titleEl].concat(pg._lineEls).forEach(function (el, li) {
        var fr = Array.from(el.querySelectorAll('.ch')).map(revealOf);
        lines.push({ page: pi, index: li, title: li === 0, chars: fr.length, revealed: fr.reduce(function (a, b) { return a + b; }, 0) });
      });
    });
    var ds = Array.from(doodles.querySelectorAll('path')).map(function (p) {
      var len = parseFloat(p.style.strokeDasharray) || 1, off = parseFloat(p.style.strokeDashoffset);
      return { page: +p.dataset.page, drawn: Math.max(0, Math.min(1, 1 - off / len)), opacity: parseFloat(getComputedStyle(p).opacity) };
    });
    return {
      ready: ready, view: VIEW, layout: LAYOUT.name, mode: ui.pagemode.checked ? 'page' : 'flow',
      time: tl.time(), duration: tl.duration(), progress: tl.progress(), paused: tl.paused(), ended: ended(), speed: tl.timeScale(),
      font: ui.font.value, pageLabel: pagenumEl.textContent, lines: lines, doodles: ds,
      hand: { x: handPos.x, y: handPos.y, alpha: handPos.alpha },
      marks: { pageDone: marks.pageDone.slice(), mid: marks.mid },
      box: lastBox, stage: { w: LAYOUT.w, h: LAYOUT.h, scale: scale }, frame: { w: frame.clientWidth, h: frame.clientHeight }, readyMs: readyMs,
    };
  }
  window.__handBoard = {
    get ready() { return ready; },
    state: state,
    seek: function (t) { tl.pause(); tl.seek(t, false); tl.eventCallback('onUpdate')(); },
    play: function () { tl.play(); syncPlayButton(); }, pause: function () { tl.pause(); syncPlayButton(); },
    // frame clock for headless renderers
    duration: function () { return tl ? tl.duration() : 0; },
  };
  window.__seek = window.__handBoard.seek; window.__duration = window.__handBoard.duration;

  // ---------- start ----------
  fit();
  document.fonts.load('46px "Long Cang"').catch(function () {}).then(function () { return document.fonts.ready; }).then(function () {
    markUnavailableFonts();
    fit();
    buildTimeline(ui.pagemode.checked);
    ready = true; readyMs = Math.round(performance.now() - t0);
    if (VIEW) applyView(); else tl.play();
    syncPlayButton();
  });
})();
