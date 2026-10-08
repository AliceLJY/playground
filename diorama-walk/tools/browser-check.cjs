// Browser acceptance for 微缩街角·走进去: SPEC 验收条目 1-9, the scare version H1-H8, the performance budget and the player-default configuration.
// Run by hand; needs an existing Playwright install and Google Chrome (this folder installs neither).
//   node tools/build.mjs
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <out-dir> [page-url] [--shots <dir>]
// Without a URL it opens dist/index.html from disk. Writes report.json (and screenshots unless --shots points elsewhere).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
const out = argv[0] || 'browser-check';
const base = argv[1] && !argv[1].startsWith('--') ? argv[1] : 'file://' + path.resolve(__dirname, '../dist/index.html');
const shots = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : out;
const baseline = argv.includes('--baseline') ? argv[argv.indexOf('--baseline') + 1] : null;   // round 8 A1: the round-7 inside.png
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(shots, { recursive: true });
const shot = (name) => path.join(shots, name + '.png');
const f3 = (v) => (typeof v === 'number' ? v.toFixed(3) : String(v));
const isExternal = (u) => {
  if (u.startsWith('data:') || u.startsWith('blob:')) return false;
  if (base.startsWith('file:')) return u.split('?')[0] !== base.split('?')[0];
  return new URL(u).origin !== new URL(base).origin;
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { base, browser: browser.version(), when: new Date().toISOString(), checks: [], runs: [] };
  const check = (id, name, pass, detail) => { report.checks.push({ id, name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  #${id}  ${name} — ${detail}`); };
  const allErrors = [], allExternal = [];
  let loads = 0;
  async function open(query, { width = 1280, height = 720, dpr = 1, touch = false, keepCard = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage(), errors = [], external = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    page.on('request', (r) => { if (isExternal(r.url())) external.push(r.url()); });
    await page.goto(base + query);
    await page.waitForFunction(() => window.__diorama && window.__diorama.ready, null, { polling: 100, timeout: 30000 });
    loads++;
    // round 9: the normal entry opens with a card; every earlier item is measured after it is closed (SPEC N8: 先关卡再测),
    // with a real click / tap on the dimmed part of the screen (which also starts the sound, as for a real visitor)
    if (!keepCard && await page.evaluate(() => window.__diorama.card().open)) {
      if (touch) await page.touchscreen.tap(width / 2, 40); else await page.mouse.click(width / 2, 40);
      await page.waitForFunction(() => !window.__diorama.card().open, null, { polling: 100, timeout: 5000 });
    }
    const close = async () => {
      allErrors.push(...errors.map((e) => `${query || '(no query)'} ${width}x${height}: ${e}`));
      allExternal.push(...external);
      await ctx.close();
    };
    return { ctx, page, errors, external, close };
  }
  const until = async (page, fn, ms, arg) => { try { await page.waitForFunction(fn, arg, { polling: 100, timeout: ms }); return true; } catch { return false; } };
  const info = (page) => page.evaluate(() => window.__diorama.info());
  const state = (page) => page.evaluate(() => window.__diorama.state());

  // Laplacian variance in horizontal bands of a PNG, computed in a blank page (no extra Node dependencies).
  const calc = await (await browser.newContext()).newPage();
  async function bands(png, fy = 0.5, rect = null, cropTo = null) {
    const res = await calc.evaluate(async ({ b64, fy, rect, crop }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, W, H).data, Y = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) Y[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
      const area = (x0, y0, x1, y1) => {
        let n = 0, s = 0, s2 = 0;
        for (let y = Math.max(1, Math.floor(y0 * H)); y < Math.min(H - 1, Math.ceil(y1 * H)); y++) for (let x = Math.max(1, Math.floor(x0 * W)); x < Math.min(W - 1, Math.ceil(x1 * W)); x++) {
          const i = y * W + x, v = Y[i - 1] + Y[i + 1] + Y[i - W] + Y[i + W] - 4 * Y[i]; s += v; s2 += v * v; n++;
        }
        const m = s / n; return s2 / n - m * m;
      };
      const top = area(0, 0, 1, 0.2), band = area(0, fy - 0.1, 1, fy + 0.1), bottom = area(0, 0.8, 1, 1), sign = rect ? area(...rect) : null;
      let cropPng = null;
      if (crop && rect) {                            // the sign, 6x with hard pixels, so its edges can be judged by eye
        const [x0, y0, x1, y1] = [rect[0] - 0.02, rect[1] - 0.03, rect[2] + 0.02, rect[3] + 0.03].map((v, i) => Math.round(v * (i % 2 ? H : W)));
        const k = 6, o = document.createElement('canvas'); o.width = (x1 - x0) * k; o.height = (y1 - y0) * k;
        const og = o.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, o.width, o.height);
        cropPng = o.toDataURL('image/png').split(',')[1];
      }
      return { W, H, fy, top, band, bottom, sign, rTop: top / band, rBottom: bottom / band, cropPng };
    }, { b64: png.toString('base64'), fy, rect, crop: !!cropTo });
    if (cropTo && res.cropPng) fs.writeFileSync(cropTo, Buffer.from(res.cropPng, 'base64'));
    delete res.cropPng;
    return res;
  }

  // ---------- fixed views: screenshots as a visitor sees them ----------
  const views = [['hero', '?view=hero'], ['mid-aim-door', '?view=mid&aim=door'], ['door', '?view=door'], ['inside', '?view=inside'], ['next', '?view=next'], ['scare', '?view=scare'], ['reveal', '?view=reveal'], ['room', '?view=room']];
  let gpu = '', calls = {};
  for (const [name, q] of views) {
    const P = await open(q);
    await P.page.waitForTimeout(500);
    const i = await info(P.page), st = await state(P.page);
    gpu = i.gpu; calls[name] = i.calls;
    await P.page.screenshot({ path: shot(name) });
    const hz = await P.page.evaluate(() => { const h = window.__diorama.horror(); return { fired: h.fired, figure: h.figure, scare: h.scare, drawn: window.__diorama.info().figures, leaf: window.__diorama.info().leaf }; });
    report.runs.push({ name, query: q, viewport: '1280x720', dpr: i.dpr, buffer: i.buffer, calls: i.calls, triangles: i.triangles, s: st.s, mode: st.mode, cam: st.cam, eye: st.eye, doors: st.doors, horror: hz });
    await P.close();
  }
  for (const [name, q, w, h, dpr] of [['phone-hero', '?view=hero', 390, 844, 3], ['phone-inside', '?view=inside', 390, 844, 3], ['phone-scare', '?view=scare', 390, 844, 3], ['phone-reveal', '?view=reveal', 390, 844, 3], ['phone-room', '?view=room', 390, 844, 3],
    ['fold-hero', '?view=hero', 880, 920, 2], ['fold-inside', '?view=inside', 880, 920, 2], ['fold-room', '?view=room', 880, 920, 2]]) {
    const P = await open(q, { width: w, height: h, dpr, touch: true });
    await P.page.waitForTimeout(500);
    const i = await info(P.page);
    await P.page.screenshot({ path: shot(name) });
    const hz = await P.page.evaluate(() => { const h = window.__diorama.horror(); return { fired: h.fired, figure: h.figure, scare: h.scare, drawn: window.__diorama.info().figures, leaf: window.__diorama.info().leaf }; });
    report.runs.push({ name, query: q, viewport: `${w}x${h}`, deviceDpr: dpr, dpr: i.dpr, buffer: i.buffer, calls: i.calls, horror: hz });
    await P.close();
  }

  // ---------- SPEC 1: three aims, descent sampled every frame ----------
  {
    const res = {};
    for (const aim of ['door', 'street', 'roof']) {
      const P = await open('?view=hero');
      res[aim] = await P.page.evaluate((aim) => {
        const D = window.__diorama, frames = [D.enter(aim) && D.state()];
        for (let i = 0; i < 600 && frames[frames.length - 1].mode !== 'walk'; i++) frames.push(D.step(1 / 60, 1));
        const solids = D.solids(), bad = [];
        for (const f of frames) {
          const c = f.cam;
          if (c.y < D.core.groundAt(c.x, c.z) + 0.1) bad.push('ground');
          for (const s of solids) {
            if (s.kind === 'door' && !s.active) continue;
            if (c.x > s.x0 - 0.1 && c.x < s.x1 + 0.1 && c.y > s.y0 - 0.1 && c.y < s.y1 + 0.1 && c.z > s.z0 - 0.1 && c.z < s.z1 + 0.1) bad.push(s.id);
          }
        }
        const last = frames[frames.length - 1];
        return { n: frames.length, bad, last, minClear: Math.min(...frames.map((f) => f.cam.y - D.core.groundAt(f.cam.x, f.cam.z))) };
      }, aim);
      await P.close();
    }
    const det = [];
    let ok = true;
    for (const aim of ['door', 'street', 'roof']) {
      const r = res[aim], L = r.last, good = L.mode === 'walk' && Math.abs(L.eye - 1.6) <= 0.02 && Math.abs(L.cam.pitch) < 0.05 && L.tilt === 0 && Math.abs(L.fog - 0.035) <= 0.001 && r.bad.length === 0;
      ok = ok && good;
      det.push(`${aim}: eye ${f3(L.eye)} m, pitch ${f3(L.cam.pitch)}, tilt ${L.tilt}, fog ${f3(L.fog)}, ${r.n} frames, inside a solid on ${r.bad.length} (${[...new Set(r.bad)].join(',') || '-'}), land (${f3(L.cam.x)}, ${f3(L.cam.z)})`);
    }
    const roof = res.roof.last, dDoor = Math.hypot(roof.cam.x - 5.0, roof.cam.z - 0.5), yawDev = Math.abs(Math.atan2(Math.sin(roof.cam.yaw), Math.cos(roof.cam.yaw)));
    const onPavement = roof.cam.z < 3.5 && roof.eye > 1.58;
    det.push(`roof -> ${dDoor.toFixed(3)} m outside the store door (pavement ${onPavement}), yaw off by ${yawDev.toFixed(3)} rad, door openness on landing ${roof.doors[0].k}`);
    check(1, 'three landings right, no camera inside a solid (+0.1 m)', ok && dDoor >= 2.4 && dDoor <= 2.8 && onPavement && yawDev < 0.2 && roof.doors[0].k === 0, det.join(' | '));
  }

  // ---------- SPEC 2: leaving returns to the orbit of the moment of entry ----------
  {
    const P = await open('?view=hero');
    const r = await P.page.evaluate(() => {
      const D = window.__diorama, out = [];
      D.rotate(0.6, 0.12);
      for (let i = 0; i < 6; i++) D.zoomAt(0.93, 0.42, 0.6);
      for (const aim of ['door', 'street', 'roof']) {
        D.enter(aim); const trig = D.state();
        for (let i = 0; i < 300 && D.state().mode !== 'walk'; i++) D.step(1 / 60, 1);
        const p = D.state().player; D.walkTo(p.x - 1.5, p.z + 0.8);
        for (let i = 0; i < 600 && D.state().player.walking; i++) D.step(1 / 60, 1);
        D.exit(); const mid = [];
        for (let i = 0; i < 300 && D.state().mode !== 'orbit'; i++) mid.push(D.step(1 / 60, 1));
        out.push({ aim, trig, after: D.state(), frames: mid.length });
      }
      return out;
    });
    await P.close();
    let ok = true; const det = [];
    for (const { aim, trig, after } of r) {
      const o = after.orbit, t = trig.trigger.orbit, ang = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      const dc = Math.hypot(o.cx - t.cx, o.cy - t.cy, o.cz - t.cz), dr = Math.abs(o.r - t.r), da = Math.max(ang(o.theta, t.theta), ang(o.phi, t.phi));
      const same = ['s', 'fog', 'baseSides', 'groundAlpha'].every((k) => after[k] === trig[k]);
      ok = ok && dc < 0.05 && dr < 0.05 && da < 0.01 && same && after.mode === 'orbit';
      det.push(`${aim}: centre ${dc.toExponential(1)} m, radius ${dr.toExponential(1)} m, angle ${da.toExponential(1)} rad, s ${f3(after.s)}/${f3(trig.s)}, fog ${after.fog}/${trig.fog}, sides ${after.baseSides}/${trig.baseSides}, ground ${after.groundAlpha}/${trig.groundAlpha}`);
    }
    check(2, 'leaving returns to the entry orbit', ok, det.join(' | '));
  }

  // ---------- SPEC 3: five entries and exits leave nothing behind ----------
  {
    const P = await open('?view=hero');
    const r = await P.page.evaluate(() => {
      const D = window.__diorama, aims = ['door', 'street', 'roof', { x: -6, z: -3.5 }, 'door'];
      for (let i = 0; i < 8; i++) D.zoomAt(0.94, 0.5, 0.56);
      let before = null;
      for (let c = 0; c < 5; c++) {
        D.enter(aims[c]);
        if (!before) before = D.state();
        for (let i = 0; i < 300 && D.state().mode !== 'walk'; i++) D.step(1 / 60, 1);
        const p = D.state().player; D.walkTo(p.x + 1.0, p.z - 2.0);
        for (let i = 0; i < 400 && D.state().player.walking; i++) D.step(1 / 60, 1);
        D.exit();
        for (let i = 0; i < 300 && D.state().mode !== 'orbit'; i++) D.step(1 / 60, 1);
      }
      return { before, after: D.state() };
    });
    await P.close();
    const { before: b, after: a } = r, ang = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
    const dc = Math.hypot(a.orbit.cx - b.orbit.cx, a.orbit.cy - b.orbit.cy, a.orbit.cz - b.orbit.cz), dr = Math.abs(a.orbit.r - b.orbit.r);
    const da = Math.max(ang(a.orbit.theta, b.orbit.theta), ang(a.orbit.phi, b.orbit.phi)), dcam = Math.hypot(a.cam.x - b.cam.x, a.cam.y - b.cam.y, a.cam.z - b.cam.z);
    const keys = ['s', 'z', 'fog', 'tilt', 'fov', 'baseSides', 'groundAlpha', 'rainMix', 'lowpass', 'volume'], diff = keys.filter((k) => a[k] !== b[k]);
    const doorsShut = a.doors.every((d) => d.k === 0 && d.want === 0);
    check(3, 'five entries and exits leave no residue', dc < 0.05 && dr < 0.05 && da < 0.01 && dcam < 0.05 && !diff.length && doorsShut && a.mode === 'orbit',
      `after ${a.entries} entries / ${a.exits} exits: centre ${dc.toExponential(1)} m, radius ${dr.toExponential(1)} m, angles ${da.toExponential(1)} rad, camera ${dcam.toExponential(1)} m; fields differing: ${diff.join(',') || 'none'} of ${keys.length}; doors ${a.doors.map((d) => d.k).join('/')}`);
  }

  // ---------- SPEC 4: into the store, to the till, out, along the pavement, into the shop next door; 30 vs 120 steps/s ----------
  {
    const ROUTE = [[5.0, -0.6], [6.4, -2.6], [5.0, -0.6], [5.0, 1.8], [-6.0, 1.8], [-6.0, -0.6], [-6.0, -2.6]];
    const runs = {};
    for (const hz of [30, 120]) {
      const P = await open('?view=hero');
      runs[hz] = await P.page.evaluate(({ ROUTE, hz }) => {
        const D = window.__diorama, dt = 1 / hz, every = hz / 30;
        D.enter('door');
        for (let i = 0; i < 2000 && D.state().mode !== 'walk'; i++) D.step(dt, 1);
        D.walkRoute(ROUTE);
        const samples = [], frame = [], reached = new Set(), body = [0.14, 2.02];
        let worst = 0, t = 0;
        for (let i = 0; i < hz * 40 && D.state().player.walking; i++) {
          const st = D.step(dt, 1), p = st.player; t += dt;
          if ((i + 1) % every === 0) samples.push([Math.round(t * 30), st.doors.map((d) => d.k)]);
          ROUTE.forEach(([x, z], j) => { if (Math.hypot(p.x - x, p.z - z) < 0.05) reached.add(j); });
          [[0, 5.0, 1.8], [1, -6.0, 1.2]].forEach(([k, cx, w]) => { if (Math.abs(p.x - cx) < w / 2 && p.z < 0.85 && p.z > 0.45) frame.push(st.doors[k].k); });
          for (const s of D.solids()) {
            if ((s.kind === 'door' && !s.active) || s.y1 <= body[0] || s.y0 >= body[1]) continue;
            const dx = p.x - Math.max(s.x0, Math.min(p.x, s.x1)), dz = p.z - Math.max(s.z0, Math.min(p.z, s.z1));
            worst = Math.max(worst, 0.25 - Math.hypot(dx, dz));
          }
        }
        const end = D.state().player;
        return { samples, frame, reached: [...reached], worst, t, end, inNext: D.core.insideInterior(end.x, end.z) && D.core.buildingAt(end.x, end.z).id === 'next' };
      }, { ROUTE, hz });
      await P.close();
    }
    const a = runs[30], b = runs[120], byT = new Map(b.samples.map(([t, k]) => [t, k]));
    let worst = 0, n = 0;
    for (const [t, k] of a.samples) { const k2 = byT.get(t); if (!k2) continue; n++; k.forEach((v, i) => { worst = Math.max(worst, Math.abs(v - k2[i])); }); }
    const okRun = (r) => r.reached.length === ROUTE.length && r.frame.length > 0 && Math.min(...r.frame) >= 0.75 && r.worst < 1e-3 && r.inNext;
    check(4, 'walk in, to the till, out and next door; doors independent of frame rate', okRun(a) && okRun(b) && n > 300 && worst < 0.02,
      `waypoints ${a.reached.length}/${ROUTE.length} (30/s) and ${b.reached.length}/${ROUTE.length} (120/s); door openness at the frame min ${f3(Math.min(...a.frame))} / ${f3(Math.min(...b.frame))}; ` +
      `max overlap with a solid ${a.worst.toExponential(1)} / ${b.worst.toExponential(1)} m; ends next door ${a.inNext}/${b.inNext}; openness 30 vs 120 steps/s differs by at most ${worst.toExponential(2)} over ${n} common instants`);
  }

  // ---------- SPEC 5: run into everything for 10 s from three points in eight directions ----------
  {
    const P = await open('?view=hero');
    const r = await P.page.evaluate(() => {
      const D = window.__diorama, body = [0.14, 2.02], res = [];
      D.enter('door');
      for (let i = 0; i < 300 && D.state().mode !== 'walk'; i++) D.step(1 / 60, 1);
      for (const [x, z] of [[0.0, -3.5], [4.5, -5.0], [6.4, -2.6]]) for (let d = 0; d < 8; d++) {
        D.place(x, z);
        const a = (d / 8) * Math.PI * 2; D.drive(Math.cos(a) * 2.6, Math.sin(a) * 2.6);
        let worst = 0, out = -Infinity;
        for (let i = 0; i < 600; i++) {
          const p = D.step(1 / 60, 1).player;
          for (const s of D.solids()) {
            if ((s.kind === 'door' && !s.active) || s.y1 <= body[0] || s.y0 >= body[1]) continue;
            const dx = p.x - Math.max(s.x0, Math.min(p.x, s.x1)), dz = p.z - Math.max(s.z0, Math.min(p.z, s.z1));
            worst = Math.max(worst, 0.25 - Math.hypot(dx, dz));
          }
          out = Math.max(out, Math.abs(p.x) - 11.5, Math.abs(p.z) - 11.5);
        }
        D.drive(0, 0);
        res.push({ x, z, d, worst, out });
      }
      return res;
    });
    await P.close();
    const worst = Math.max(...r.map((q) => q.worst)), out = Math.max(...r.map((q) => q.out));
    check(5, 'running at 2.6 m/s never goes into a solid or out of bounds', r.length === 24 && worst < 1e-3 && out <= 0,
      `${r.length} runs of 10 s: deepest overlap ${worst.toExponential(1)} m (the 0.25 m walker against solids), closest to the walkable square edge ${f3(-out)} m inside`);
  }

  // ---------- SPEC 6: framing from the real camera ----------
  {
    const det = []; let ok = true;
    for (const [w, h, touch] of [[1280, 720, false], [1920, 1080, false], [1024, 768, false], [820, 900, true], [390, 844, true], [380, 870, true]]) {
      const P = await open('?view=hero', { width: w, height: h, touch });
      const b = await P.page.evaluate(() => window.__diorama.screenBox());
      await P.close();
      const margin = Math.min(b.model.x0, b.model.y0, 1 - b.model.x1, 1 - b.model.y1), portrait = w / h < 0.8;
      const good = margin >= 0.03 && (portrait ? b.w >= 0.6 : b.w >= 0.55 && b.w <= 0.85);
      ok = ok && good;
      det.push(`${w}x${h}${portrait ? ' (portrait)' : ''}: base width ${(b.w * 100).toFixed(1)}%, smallest margin ${(margin * 100).toFixed(1)}%${good ? '' : ' FAIL'}`);
    }
    check(6, 'hero framing', ok, det.join(' | '));
  }

  // ---------- SPEC 7: tilt-shift present outside (clear band on the store front), gone inside ----------
  {
    const m = {};
    for (const [name, q] of [['hero', '?view=hero'], ['inside', '?view=inside'], ['hero-tilt-off', '?view=hero&tilt=off'], ['inside-tilt-on', '?view=inside&tilt=on']]) {
      const P = await open(q);
      await P.page.evaluate(() => window.__diorama.ui(false));
      await P.page.waitForTimeout(300);
      const g = await P.page.evaluate(() => { const D = window.__diorama, S = D.core.SIGN, a = D.toScreen(S.x0, S.y1, S.z), b = D.toScreen(S.x1, S.y0, S.z), w = innerWidth, h = innerHeight;
        return { fy: D.info().focusY, rect: [Math.min(a[0], b[0]) / w, Math.min(a[1], b[1]) / h, Math.max(a[0], b[0]) / w, Math.max(a[1], b[1]) / h] }; });
      const hero = name.startsWith('hero');
      m[name] = await bands(await P.page.screenshot(), g.fy, hero ? g.rect : null, name === 'hero' ? shot('hero-sign-6x') : null);
      m[name].rect = hero ? g.rect : null;
      await P.close();
    }
    const heroOk = (r) => r.rTop < 0.1 && r.rBottom < 0.1, insideOk = (r) => r.rTop > 0.8 && r.rBottom > 0.8;
    const signKeep = m.hero.sign / m['hero-tilt-off'].sign;
    const r = (k) => `${m[k].rTop.toFixed(3)}/${m[k].rBottom.toFixed(3)}`;
    check(7, 'tilt-shift: top/bottom 20% bands vs the 20% clear band on the store front',
      heroOk(m.hero) && insideOk(m.inside) && !heroOk(m['hero-tilt-off']) && !insideOk(m['inside-tilt-on']) && signKeep >= 0.8,
      `clear band centred at ${(m.hero.fy * 100).toFixed(1)}% of the height (store front); hero top/band ${r('hero')} (< 0.1 each); inside (band at ${(m.inside.fy * 100).toFixed(0)}%) ${r('inside')} (> 0.8 each); ` +
      `controls that must fail: hero with tilt forced off ${r('hero-tilt-off')} -> ${heroOk(m['hero-tilt-off']) ? 'PASSES (bad)' : 'fails'}, inside with tilt forced on ${r('inside-tilt-on')} -> ${insideOk(m['inside-tilt-on']) ? 'PASSES (bad)' : 'fails'}; ` +
      `sign region keeps ${(signKeep * 100).toFixed(1)}% of its unblurred detail (>= 80%); variances hero ${['top', 'band', 'bottom'].map((k) => m.hero[k].toFixed(1)).join('/')}, inside ${['top', 'band', 'bottom'].map((k) => m.inside[k].toFixed(1)).join('/')}`);
    report.sharpness = m;
  }

  // ---------- landing view (SPEC 落点): door shut, whole door and the vending machine in view ----------
  {
    const out = {};
    for (const [name, opt] of [['landscape', {}], ['portrait', { width: 390, height: 844, dpr: 3, touch: true }]]) {
      const P = await open('?view=door', opt);
      out[name] = await P.page.evaluate(() => {
        const D = window.__diorama, C = D.core, w = innerWidth, h = innerHeight;
        const corners = (b) => { const o = []; for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) o.push(D.toScreen(x, y, z)); return o; };
        const on = (p) => p[0] >= -0.5 && p[0] <= w + 0.5 && p[1] >= -0.5 && p[1] <= h + 0.5;
        const share = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          return (Math.max(0, Math.min(x1, w) - Math.max(x0, 0)) * Math.max(0, Math.min(y1, h) - Math.max(y0, 0))) / ((x1 - x0) * (y1 - y0)); };
        const vs = C.solids().find((s) => s.id === 'vending'), vend = corners(vs), d = C.DOORS[0];
        const panel = corners({ x0: vs.x0 + 0.08, x1: vs.x1 - 0.08, y0: C.SIDEWALK_H + 0.55, y1: C.SIDEWALK_H + 1.75, z0: vs.z1, z1: vs.z1 });   // the lit front
        const door = corners({ x0: d.x0, x1: d.x1, y0: C.SIDEWALK_H, y1: C.SIDEWALK_H + C.DOOR_H, z0: C.STORE.z1, z1: C.STORE.z1 });
        const S = C.SIGN, sign = corners({ x0: S.x0, x1: S.x1, y0: S.y0, y1: S.y1, z0: S.z, z1: S.z });
        const st = D.state(), k0 = st.doors[0].k;
        D.step(1 / 60, 60); const kIdle = D.state().doors[0].k;          // stand still for a second
        D.walkTo(st.player.x, st.player.z - 0.7);                       // one step towards the door
        for (let i = 0; i < 240 && D.state().player.walking; i++) D.step(1 / 60, 1);
        D.step(1 / 60, 36);
        const lowest = Math.max(...vend.map((p) => p[1])) / h;            // how far below the frame the machine's foot reaches (1 = bottom edge)
        return { dist: st.player.z - C.STORE.z1, fov: D.info().fov, hfov: D.info().hfov, vendAll: vend.every(on), vendShare: share(vend), panelAll: panel.every(on), lowest, doorAll: door.every(on), signShare: share(sign), k0, kIdle, kStep: D.state().doors[0].k };
      });
      await P.close();
    }
    const L = out.landscape, Pt = out.portrait;
    // A level view at 1.6 m with 65 deg vertical cannot hold anything nearer than 2.5 m at ground level: the machine's foot, 1.9 m away, is cut by the
    // bottom edge wherever it stands against the facade. The check asks for its whole lit front; how much of the body shows is reported.
    check('1b', 'landing view: door shut, whole door, sign and vending machine in view', L.doorAll && L.panelAll && L.signShare > 0 && Pt.doorAll && Pt.vendShare > 0 && L.k0 === 0 && L.kIdle === 0 && L.kStep >= 0.75,
      `landed ${L.dist.toFixed(2)} m out; landscape (${L.fov.toFixed(0)} deg vertical): whole door ${L.doorAll}, vending machine lit front fully in frame ${L.panelAll}, ${(L.vendShare * 100).toFixed(0)}% of its box in frame (all corners ${L.vendAll}; its foot reaches ${(L.lowest * 100).toFixed(0)}% of the frame height), sign ${(L.signShare * 100).toFixed(0)}% in frame; ` +
      `portrait 390x844 (${Pt.fov.toFixed(1)} deg vertical, ${Pt.hfov.toFixed(1)} across): whole door ${Pt.doorAll}, vending machine ${(Pt.vendShare * 100).toFixed(0)}% of its box in frame; door openness on landing ${L.k0}, after standing 1 s ${L.kIdle}, after one 0.7 m step ${L.kStep.toFixed(2)}`);
    report.landingView = out;
  }

  // ---------- SPEC 8: phone portrait with touch: spread to enter, tap to walk, pinch to leave ----------
  {
    const P = await open('', { width: 390, height: 844, dpr: 3, touch: true });
    const { page } = P, cdp = await P.ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
    const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
    const door = await page.evaluate(() => window.__diorama.toScreen(5.0, 1.3, 0.5));
    // two fingers spread over the store door: 50 px apart to 300 px apart
    const cx = Math.round(door[0]), cy = Math.round(door[1]);
    await touch('touchStart', [[cx - 25, cy], [cx + 25, cy]]);
    for (let i = 1; i <= 25; i++) { const h = 25 + i * 5; await touch('touchMove', [[Math.max(2, cx - h), cy], [Math.min(388, cx + h), cy]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    const entering = await until(page, () => window.__diorama.state().mode !== 'orbit', 3000);
    const inside = await until(page, () => window.__diorama.state().mode === 'walk', 6000);
    const landed = await state(page), fovIn = await info(page);
    await page.screenshot({ path: shot('phone-landed') });
    // one short tap on the floor ahead
    const p0 = landed.player;
    await page.touchscreen.tap(195, 770);
    await page.waitForTimeout(150);
    const walking = (await state(page)).player.walking;
    await until(page, () => !window.__diorama.state().player.walking, 8000);
    const p1 = (await state(page)).player, moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    // two fingers pinch in to a third of the start distance, centred on the screen (the left one lands on the joystick spot)
    await touch('touchStart', [[95, 600], [295, 600]]);
    for (let i = 1; i <= 15; i++) { const h = 100 - i * 4.5; await touch('touchMove', [[195 - h, 600], [195 + h, 600]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    const leaving = await until(page, () => window.__diorama.state().mode === 'exiting' || window.__diorama.state().mode === 'orbit', 3000);
    const back = await until(page, () => window.__diorama.state().mode === 'orbit', 5000);
    const fin = await state(page), i8 = await info(page);
    report.phone = { overflow, door, landed: landed.cam, moved, i: i8 };
    check(8, 'phone portrait 390x844 with touch', overflow.sw <= overflow.cw && overflow.bw <= overflow.cw && entering && inside && walking && moved > 0.5 && leaving && back && fovIn.hfov >= 45 - 1e-6 && fovIn.fov <= 85,
      `no horizontal overflow (scrollWidth ${overflow.sw} <= ${overflow.cw}); spread over the door -> entering ${entering}, standing inside ${inside} at (${f3(landed.cam.x)}, ${f3(landed.cam.z)}) eye ${f3(landed.eye)}, view ${fovIn.fov.toFixed(1)} deg vertical / ${fovIn.hfov.toFixed(1)} deg across; ` +
      `tap -> walking ${walking}, moved ${moved.toFixed(2)} m to (${f3(p1.x)}, ${f3(p1.z)}); pinch -> leaving ${leaving}, back outside ${back} (s ${f3(fin.s)}); renderer pixel ratio ${i8.dpr} on a 3x device`);
    await P.close();
  }

  // ======================= 惊吓版 H1–H8 (SPEC 惊吓版) =======================
  const f1 = (v) => (v == null ? 'n/a' : v.toFixed(1)), f2 = (v) => (v == null ? 'n/a' : v.toFixed(2));
  // Page-side helpers: the scripted visit of core.playScare, driven through the page hooks one step at a time; `each` sees every step.
  const helpers = () => {
    const D = window.__diorama, C = D.core, P = C.SCARE_PLAN;
    const H = (window.__H = {
      dt: 1 / 60, each: null,
      step() { const st = D.step(H.dt, 1); if (H.each) H.each(st); return st; },
      until(pred, maxT = 30) { let t = 0; for (; t < maxT && !pred(); t += H.dt) H.step(); return t; },
      enter(aim = 'door') { D.enter(aim); H.until(() => D.state().mode === 'walk', 10); },
      walk(route) { D.walkRoute(route); H.until(() => !D.state().player.walking, 20); },
      look(p) { D.lookAt(...p); H.until(() => !D.state().player.looking, 6); },
      aisle() { H.walk(P.aisle); H.until(() => D.horror().e2 && D.state().t >= D.horror().e2.t0 + C.E2_TOTAL, 5); },
      e3() { H.until(() => D.state().t >= C.scareReady(D.horror()), 25); },          // round 8: E3's door shut and the dog gone
      // round 6: E4 catches the walker from 2.0 m on the way to the staff door; the scripted visit stops there
      staff() { H.look(P.behind); H.look(P.staff); H.walk([P.front]); H.look(P.staff); D.walkRoute([P.near]); H.until(() => !D.state().player.walking || !!D.horror().e4, 20); D.stopWalk(); D.lookAt(...P.staff); H.until(() => !!D.horror().e4 || !D.state().player.looking, 6); },
      bang() { H.until(() => D.horror().e4 && D.state().t >= D.horror().e4.bang + 0.6, 6); },
      leave(route = P.out, look = null) { H.walk(route); if (look) H.look(look); D.exit(); H.until(() => D.state().mode === 'orbit', 5); },
    });
  };
  // Silhouette contrast from three drawings of the same frozen frame: as is, without the figure, with the figure painted white.
  // White-minus-hidden > 20 finds the figure's own pixels (eroded by 1 px against the blur at the edges); their mean luminance
  // as drawn is compared with the same pixels drawn without it, which is what stands right behind it.
  async function silhouette(page, cropTo) {
    await page.evaluate(() => window.__diorama.ui(false)); await page.waitForTimeout(300);
    const normal = await page.screenshot();
    await page.evaluate(() => window.__diorama.hideFigure(true)); await page.waitForTimeout(300);
    const hidden = await page.screenshot();
    await page.evaluate(() => { window.__diorama.hideFigure(false); window.__diorama.figureMask(true); }); await page.waitForTimeout(300);
    const white = await page.screenshot();
    await page.evaluate(() => window.__diorama.figureMask(false)); await page.waitForTimeout(150);
    const r = await calc.evaluate(async ({ a, b, c, crop }) => {
      const load = async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return { img, d: g.getImageData(0, 0, cv.width, cv.height) }; };
      const N = await load(a), Hd = await load(b), Wt = await load(c), W = N.d.width, H = N.d.height;
      const Y = (o, i) => 0.299 * o.d.data[4 * i] + 0.587 * o.d.data[4 * i + 1] + 0.114 * o.d.data[4 * i + 2];
      const m = new Uint8Array(W * H); let raw = 0, changed = 0;
      for (let i = 0; i < W * H; i++) { if (Y(Wt, i) - Y(Hd, i) > 20) { m[i] = 1; raw++; } if (Math.abs(Y(N, i) - Y(Hd, i)) > 2) changed++; }
      let n = 0, sn = 0, sh = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; if (!(m[i] && m[i - 1] && m[i + 1] && m[i - W] && m[i + W])) continue;
        n++; sn += Y(N, i); sh += Y(Hd, i); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      let cropPng = null;
      if (crop && n) {                               // as drawn (left) and without the figure (right), 4x with hard pixels
        const pad = Math.max(16, Math.round((y1 - y0) * 0.8)), cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad), cx1 = Math.min(W, x1 + pad), cy1 = Math.min(H, y1 + pad), k = 4, w = cx1 - cx0, h = cy1 - cy0;
        const o = document.createElement('canvas'); o.width = (2 * w + 3) * k; o.height = h * k; const og = o.getContext('2d'); og.imageSmoothingEnabled = false;
        og.fillStyle = '#ffffff'; og.fillRect(0, 0, o.width, o.height);
        og.drawImage(N.img, cx0, cy0, w, h, 0, 0, w * k, h * k); og.drawImage(Hd.img, cx0, cy0, w, h, (w + 3) * k, 0, w * k, h * k);
        cropPng = o.toDataURL('image/png').split(',')[1];
      }
      return { W, H, raw, core: n, changed, figure: n ? sn / n : null, behind: n ? sh / n : null, ratio: n ? sn / sh : null, box: n ? [x0 / W, y0 / H, (x1 + 1) / W, (y1 + 1) / H] : null, cropPng };
    }, { a: normal.toString('base64'), b: hidden.toString('base64'), c: white.toString('base64'), crop: !!cropTo });
    if (cropTo && r.cropPng) fs.writeFileSync(cropTo, Buffer.from(r.cropPng, 'base64'));
    delete r.cropPng;
    return r;
  }
  // Where the figure stands on screen, and whether the camera's ray to its centre is blocked by anything but glass.
  const figureGeo = (page, spot) => page.evaluate((spot) => {
    const D = window.__diorama, C = D.core, f = C.HORROR.figure, s = C.HORROR.spots[spot], F = C.SIDEWALK_H, w = innerWidth, h = innerHeight, box = [];
    for (const x of [s.x - f.bodyR, s.x + f.bodyR]) for (const y of [F, F + f.h]) for (const z of [s.z - f.bodyR, s.z + f.bodyR]) box.push(D.toScreen(x, y, z));
    const xs = box.map((p) => p[0] / w), ys = box.map((p) => p[1] / h);
    return { figure: D.horror().figure, drawn: D.info().figures, inFrame: box.every(([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h),
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], ray: D.visibility([[s.x, F + f.h / 2, s.z]])[0] };
  }, spot);
  const boxTxt = (b) => b.map((v) => v.toFixed(3)).join(', ');

  // ---------- H1: before going in, the figure behind the till reads as a silhouette ----------
  {
    const P = await open('?view=hero');
    const g = await figureGeo(P.page, 'counter'), sil = await silhouette(P.page, shot('hero-figure-4x'));
    await P.close();
    const Q = await open('?view=hero&calm=1');
    const gc = await figureGeo(Q.page, 'counter'), silc = await silhouette(Q.page, null);
    await Q.close();
    report.h1 = { g, sil, calm: { g: gc, sil: silc } };
    check('H1', 'figure behind the till visible from outside, as a silhouette',
      g.figure === 'counter' && g.drawn.counterOrWindow && g.inFrame && g.ray.inFrustum && !g.ray.blockedBy && sil.core >= 20 && sil.ratio <= 0.6 && gc.figure === null && !gc.drawn.counterOrWindow && silc.raw === 0,
      `hero: figure '${g.figure}', drawn ${g.drawn.counterOrWindow} (colour ${g.drawn.color}); its box on screen ${g.inFrame} (${boxTxt(g.box)}); ray camera -> figure centre in view ${g.ray.inFrustum}, blocked by ${g.ray.blockedBy || 'nothing (glass not counted)'}; ` +
      `${sil.core} figure pixels (white minus hidden > 20, eroded 1 px; ${sil.raw} before) mean luminance ${f1(sil.figure)} as drawn vs ${f1(sil.behind)} right behind it = ${sil.ratio == null ? 'n/a' : (sil.ratio * 100).toFixed(1) + '%'} (needs <= 60%, i.e. >= 40% darker); ` +
      `calm=1: figure ${gc.figure}, drawn ${gc.drawn.counterOrWindow}, pixels changed by painting it white ${silc.raw}`);
  }

  // ---------- H2: the figure only disappears in the dark (frame by frame, read back from what is drawn) ----------
  {
    const P = await open('?view=hero');
    await P.page.evaluate(helpers);
    const r = await P.page.evaluate(() => {
      const D = window.__diorama, H = window.__H;
      const descend = () => {
        const i0 = D.info(), before = D.horror().figure;
        let prev = { fig: i0.figures.counterOrWindow, lamp: i0.shop.lamp, glow: i0.shop.glow }, removal = null, litPop = 0, n = 0;
        H.each = (st) => {
          const i = D.info(), now = { fig: i.figures.counterOrWindow, lamp: i.shop.lamp, glow: i.shop.glow, fz: Math.max(...i.shop.freezers), camY: st.cam.y, t: st.t }; n++;
          if (prev.fig && !now.fig) { removal = { ...now, frame: n, prevLamp: prev.lamp, prevGlow: prev.glow }; if (prev.lamp > 0.05 || now.lamp > 0.05) litPop++; }
          prev = now;
        };
        H.enter(); H.each = null;
        const h = D.horror();
        return { before, removal, litPop, n, e0: h.e0, tE0: h.fired.E0 };
      };
      const first = descend();
      H.aisle(); H.leave();                         // a visit with E2: the figure is now behind the glass
      const second = descend();
      return { first, second, roof: D.core.STORE.h };
    });
    await P.close();
    // the same blackout as pixels: the shop front just before the lights cut, and at the removal frame
    const Q = await open('?view=hero');
    await Q.page.evaluate(helpers);
    await Q.page.evaluate(() => window.__diorama.ui(false));
    // round 8: the shop's light now only shows through the small window (the rest of the front is wood), so that is what is read
    const front = () => Q.page.evaluate(() => { const D = window.__diorama, C = D.core, W = C.WINDOW, a = D.toScreen(W.x0, W.y1, C.FACADE_Z), b = D.toScreen(W.x1, W.y0, C.FACADE_Z);
      return [Math.min(a[0], b[0]) / innerWidth, Math.min(a[1], b[1]) / innerHeight, Math.max(a[0], b[0]) / innerWidth, Math.max(a[1], b[1]) / innerHeight]; });
    await Q.page.evaluate(() => { const D = window.__diorama, H = window.__H; D.enter('door'); H.until(() => D.state().t >= D.horror().e0.start - 1 / 60 - 1e-9, 2); });
    await Q.page.waitForTimeout(250);
    const ra = await front(), pa = await Q.page.screenshot({ path: shot('h2-before-blackout') });
    await Q.page.evaluate(() => { const D = window.__diorama, H = window.__H; H.until(() => !D.info().figures.counterOrWindow, 1); });
    await Q.page.waitForTimeout(250);
    const rb = await front(), pb = await Q.page.screenshot({ path: shot('h2-removal-frame') });
    await Q.close();
    const mean = (png, rect) => calc.evaluate(async ({ b64, rect }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, W, H).data; let s = 0, n = 0;
      for (let y = Math.max(0, Math.floor(rect[1] * H)); y < Math.min(H, Math.ceil(rect[3] * H)); y++) for (let x = Math.max(0, Math.floor(rect[0] * W)); x < Math.min(W, Math.ceil(rect[2] * W)); x++) { const i = 4 * (y * W + x); s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
      return s / n; }, { b64: png.toString('base64'), rect });
    const la = await mean(pa, ra), lb = await mean(pb, rb);
    report.h2 = { ...r, frontLuminance: { before: la, removal: lb } };
    const ok = (v) => v.removal && v.removal.lamp <= 0.05 && v.removal.glow <= 0.05 && v.removal.fz <= 0.05 && v.removal.prevLamp <= 0.05 && v.litPop === 0 && v.removal.camY > r.roof && v.e0.end - v.e0.start <= 0.35 + 1e-9;
    const txt = (v, k) => `${k}: figure was '${v.before}', removed at frame ${v.removal && v.removal.frame} of ${v.n} in the descent: drawn shop lamps ${f2(v.removal && v.removal.lamp * 100)}% / glow ${f2(v.removal && v.removal.glow * 100)}% / freezers ${f2(v.removal && v.removal.fz * 100)}% of normal (previous frame lamps ${f2(v.removal && v.removal.prevLamp * 100)}%), camera ${f2(v.removal && v.removal.camY)} m (roof ${r.roof} m), blackout ${f2(v.e0.end - v.e0.start)} s; vanished from a lit frame ${v.litPop} times`;
    check('H2', 'the figure disappears only while the shop is dark', ok(r.first) && ok(r.second) && lb < la,
      `${txt(r.first, 'visit 1')} | ${txt(r.second, 'visit 2 (from behind the glass)')} | as pixels: the shop window's mean luminance ${f1(la)} just before the blackout -> ${f1(lb)} at the removal frame (h2-before-blackout.png, h2-removal-frame.png)`);
  }

  // ---------- H3 (round 8): the tube blinks twice, bulbs and tube out one by one, TV black, hums silent 1.6 s, once per visit ----------
  {
    const P = await open('?view=hero');
    await P.page.evaluate(helpers);
    const r = await P.page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core;
      H.enter(); H.dt = 1 / 120;
      const off = [null, null, null], drawnOff = [null, null, null];
      let humOff = null, humOn = null, worstGain = 0, t2 = null, backTogether = null, restored = null, tvBlack = null;
      H.each = (st) => {
        const L = D.levels(), i = D.info(), t = st.t, h = D.horror();
        if (h.fired.E2 != null && t2 == null) t2 = h.fired.E2;
        if (t2 == null) return;
        if (L.bulbs[0] === 0 && off[0] == null) off[0] = t; if (L.bulbs[1] === 0 && off[1] == null) off[1] = t;
        if (t >= t2 + C.HORROR.e2.seq + 2 * C.HORROR.e2.step - 1e-9 && L.tube === 0 && off[2] == null) off[2] = t;
        if (i.shop.bulbs[0] < 0.01 && drawnOff[0] == null) drawnOff[0] = t; if (i.shop.bulbs[1] < 0.01 && drawnOff[1] == null) drawnOff[1] = t;
        if (t >= t2 + C.HORROR.e2.seq + 2 * C.HORROR.e2.step - 1e-9 && i.shop.tube < 0.01 && drawnOff[2] == null) drawnOff[2] = t;
        if (i.shop.tv && !i.shop.tv.snow && tvBlack == null) tvBlack = t;
        if (L.hum === 0 && humOff == null) humOff = t;
        if (humOff != null && humOn == null) {
          if (L.hum === 1) { humOn = t; backTogether = i.shop.bulbs.every((v) => v > 0.99) && i.shop.tv.snow === 1; restored = { buzz: L.audio.buzz, snow: L.audio.snow, freezer: L.audio.freezer }; }
          else worstGain = Math.max(worstGain, L.audio.buzz, L.audio.snow, L.audio.freezer);
        }
      };
      D.walkRoute(C.SCARE_PLAN.aisle);
      H.until(() => humOn != null && !D.state().player.walking, 25);
      H.each = null;
      H.walk([[4.2, -4.0]]); H.walk([[4.2, -6.6]]); H.until(() => false, 1);      // away and back towards the back wall, same visit
      const h = D.horror();
      return { t2, off, drawnOff, tvBlack, humOff, humOn, worstGain, backTogether, restored, again: h.history.filter((x) => x.e === 'E2' && x.visit === h.visit).length };
    });
    await P.close();
    report.h3 = r;
    const silence = r.humOn - r.humOff, rel = (v) => (v == null ? 'n/a' : (v - r.t2).toFixed(3));
    const inOrder = r.off.every((v) => v != null) && r.off[0] < r.off[1] && r.off[1] < r.off[2] && r.tvBlack != null && r.off[2] <= r.tvBlack + 1 / 120 + 1e-9;
    check('H3', 'E2 (round 8): bulbs and the tube go out one by one, the TV goes black, hums silent 1.6 s, once per visit',
      r.t2 != null && inOrder && r.drawnOff.every((v) => v != null) && Math.abs(silence - 1.6) <= 0.1 && r.worstGain === 0 && r.backTogether && r.again === 1,
      `E2 at ${f2(r.t2)} s; bulb 1, bulb 2, tube out at +${rel(r.off[0])}, +${rel(r.off[1])}, +${rel(r.off[2])} s (drawn at +${rel(r.drawnOff[0])}, +${rel(r.drawnOff[1])}, +${rel(r.drawnOff[2])}), TV black at +${rel(r.tvBlack)} s; ` +
      `silence ${silence.toFixed(3)} s (1.6 +- 0.1) with the largest of buzz/snow/freezer gains at ${r.worstGain} throughout; lights and TV back with the sound ${r.backTogether} (gains back to ${f3(r.restored && r.restored.buzz)}/${f3(r.restored && r.restored.snow)}/${f3(r.restored && r.restored.freezer)}); E2 again in this visit: ${r.again} time(s)`);
  }

  // ---------- H4 (round 6): the door opens by itself 3 s after E2 at the earliest, out of sight and >= 3 m away; one chime; nobody there ----------
  {
    const P = await open('?view=hero');
    await P.page.keyboard.press('Shift');          // first gesture: sound on, so the chime is logged as played
    await P.page.evaluate(helpers);
    const r = await P.page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core, e2end = () => D.horror().e2.t0 + C.E2_TOTAL;
      // (a) 3 m in with the door behind: nothing before E2 (12 s in the shop), then E3 exactly 3 s after E2 ends
      H.enter(); H.walk([[5.0, -0.6], [5.0, -2.7]]);
      H.until(() => D.horror().fired.E2 != null || D.horror().fired.E3 != null, 20);
      const beforeE2 = { E2: D.horror().fired.E2, E3: D.horror().fired.E3 };
      H.dt = 1 / 240; H.until(() => D.horror().fired.E3 != null, 8); H.dt = 1 / 60;
      const a3 = D.horror().fired.E3 - e2end();
      H.leave([[5.0, -0.6], [5.0, 3.1]]);
      // (c) door out of sight but 2.4 m away: nothing, not even 20 s after E2 (the 15 s fallback also needs 3 m)
      H.enter(); H.walk([[5.0, -0.6], [4.6, -2.0]]); H.look([4.6, 1.6, -9.0]);
      H.until(() => D.horror().fired.E2 != null, 20); H.until(() => D.state().t >= e2end() + 20, 25);
      const near = { E3: D.horror().fired.E3, dist: Math.hypot(D.state().player.x - 5.0, D.state().player.z - 0.4) };
      // (d) walk away with the door behind: E3 as soon as 3 m is passed
      const ids0 = D.solids().map((s) => s.id).join(','), bells0 = (D.audioLog() || []).filter((x) => x.kind === 'bell').length;
      H.dt = 1 / 120;
      const ks = []; let t3 = null, at3 = null, appeared = false;
      H.each = (st) => {
        const h = D.horror(), i = D.info();
        if (h.fired.E3 != null && t3 == null) {
          t3 = h.fired.E3;
          const c = st.cam, f = C.basis(c.yaw, c.pitch).f, d = [5.0 - c.x, 1.6 - c.y, 0.4 - c.z], L = Math.hypot(...d);
          at3 = { dist: Math.hypot(st.player.x - 5.0, st.player.z - 0.4), angle: (Math.acos((f[0] * d[0] + f[1] * d[1] + f[2] * d[2]) / L) * 180) / Math.PI, need: st.hfov / 2 + 10, inView: h.e3.inView };
        }
        if (t3 != null) { ks.push([st.t - t3, st.doors[0].k]); if (h.figure || h.scare || i.figures.counterOrWindow || i.figures.backroom) appeared = true; }
      };
      D.walkTo(4.6, -6.2); H.until(() => t3 != null && D.state().t > t3 + 3, 12); H.each = null;
      return { beforeE2, a3, near, t3, at3, ks, appeared, sameSolids: D.solids().map((s) => s.id).join(',') === ids0, bells: (D.audioLog() || []).filter((x) => x.kind === 'bell').length - bells0, audio: D.info().audio };
    });
    await P.close();
    report.h4 = { ...r, ks: undefined };
    const full = r.ks.filter(([, k]) => k === 1), held = full.length ? full[full.length - 1][0] - full[0][0] : 0, peak = Math.max(...r.ks.map(([, k]) => k)), endK = r.ks.length ? r.ks[r.ks.length - 1][1] : null;
    check('H4', 'the door opens by itself 3 s after E2 at the earliest, out of sight and >= 3 m away (round 6)',
      r.beforeE2.E2 != null && r.beforeE2.E3 === null && Math.abs(r.a3 - 3) <= 1 / 240 + 1e-9 && r.near.E3 === null && r.near.dist < 3 && r.t3 != null && r.at3.dist >= 3 && r.at3.dist < 3.05 && r.at3.angle > r.at3.need && r.at3.inView === false && peak === 1 && Math.abs(held - 1.2) <= 1 / 120 + 1e-9 && endK === 0 && r.bells === 1 && !r.appeared && r.sameSolids,
      `3 m in, door behind: E2 at ${f2(r.beforeE2.E2)} s with E3 ${r.beforeE2.E3} before it, then E3 ${r.a3.toFixed(4)} s after E2 ended (3); door out of sight but ${f2(r.near.dist)} m away: E3 ${r.near.E3} 20 s after E2; walking away: E3 at ${f2(r.t3)} s, ${f2(r.at3 && r.at3.dist)} m from the door, door ${f1(r.at3 && r.at3.angle)} deg off the view line (needs > ${f1(r.at3 && r.at3.need)}); ` +
      `opens to ${peak}, held fully open ${held.toFixed(3)} s, ends at ${endK}; chimes played during it ${r.bells} (sound ${r.audio}); anything appeared ${r.appeared}; solids unchanged ${r.sameSolids}`);
  }

  // ---------- H5: the staff-door scare (vibration recorded, bang loudness from the played gain plan) ----------
  {
    const P = await open('?view=hero');
    await P.page.keyboard.press('Shift');
    await P.page.evaluate(helpers);
    await P.page.evaluate(() => { window.__vib = []; Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p) => { window.__vib.push({ p: Array.from(p), t: window.__diorama.state().t }); return true; } }); });
    const r = await P.page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core, B = C.BACKDOOR, S = C.SCARE_PLAN;
      H.enter(); H.walk([[5.0, -0.6], [6.5, -3.5], S.near]);                                // past the till to the staff door, looking at it
      H.look(S.staff); H.until(() => D.horror().fired.E3 != null, 20); H.until(() => false, 3);
      const early = { E2: D.horror().fired.E2, E3: D.horror().fired.E3, E4: D.horror().fired.E4, wide: D.horror().wideAt, back: D.info().leaf, dist: Math.hypot(D.state().player.x - B.cx, D.state().player.z - B.cz) };
      H.leave();
      H.enter(); H.aisle(); H.e3(); H.look(S.behind); H.look(S.staff); H.walk([S.front]); H.look(S.staff);
      H.dt = 1 / 240; let at4 = null, seenAt = null; const tl = [], log0 = (D.audioLog() || []).length, vib0 = window.__vib.length;
      D.walkRoute([S.near]);
      H.each = (st) => {
        const h = D.horror(), i = D.info();
        if (h.fired.E4 != null && !at4) {
          D.stopWalk();
          seenAt = st.t; const q = D.toScreen(B.cx, C.SIDEWALK_H + B.h / 2, B.cz); at4 = { t4: h.fired.E4, E3: h.fired.E3, e3end: h.e3.closedAt, dist: Math.hypot(st.player.x - B.cx, st.player.z - B.cz), hinge: Math.hypot(st.player.x - B.hx, st.player.z - B.hz), sx: q[0] / innerWidth, px: st.player.x, pz: st.player.z, camY: st.cam.y }; }
        if (at4) tl.push({ t: st.t - at4.t4, leaf: i.leaf, fig: i.figures.backroom, shake: Math.hypot(i.camera[0] - st.cam.x, i.camera[1] - st.cam.y, i.camera[2] - st.cam.z), dark: i.darkOverlay, px: st.player.x, pz: st.player.z, camX: st.cam.x, camY: st.cam.y, camZ: st.cam.z });
      };
      H.until(() => at4 && D.state().t >= at4.t4 + 0.12, 8);
      const seen = D.visibility(C.figurePoints('backroom')).filter((x) => x.inFrustum && !x.blockedBy).length;   // information only
      H.until(() => at4 && D.state().t >= at4.t4 + 1.0, 8); H.each = null;
      return { early, at4, seen, tl, log: (D.audioLog() || []).slice(log0), allLog: D.audioLog() || [], vib: window.__vib.slice(vib0), audio: D.info().audio, wide: B.wide, bang: C.E4_BANG };
    });
    await P.close();
    // the same scare with no navigator.vibrate at all (iOS, desktop Safari): must pass silently
    const Q = await open('?view=hero');
    await Q.page.evaluate(helpers);
    const noVib = await Q.page.evaluate(() => {
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
      const D = window.__diorama, H = window.__H; H.enter(); H.aisle(); H.e3(); H.staff(); H.bang();
      return { type: typeof navigator.vibrate, E4: D.horror().fired.E4 };
    });
    await Q.page.waitForTimeout(200);
    const noVibErrors = Q.errors.length;
    await Q.close();
    const tl = r.tl, a = r.at4 || {};
    const lastWide = tl.filter((x) => Math.abs(x.leaf - r.wide) < 1e-6).pop(), firstShut = tl.find((x) => Math.abs(x.leaf) < 1e-6 && x.t > 0.05);
    const shown = tl.filter((x) => x.fig), shaking = tl.filter((x) => x.shake > 1e-9), darkened = tl.filter((x) => x.dark > 0);
    const maxShake = Math.max(...tl.map((x) => x.shake)), shakeSpan = shaking.length ? shaking[shaking.length - 1].t - shaking[0].t + 1 / 240 : 0;
    const walkerMoved = Math.max(...tl.map((x) => Math.hypot(x.px - a.px, x.pz - a.pz))), simCamMoved = Math.max(...tl.map((x) => Math.hypot(x.camX - tl[0].camX, x.camY - tl[0].camY, x.camZ - tl[0].camZ)));
    const slam = r.log.filter((x) => x.kind === 'slam'), sting = r.log.filter((x) => x.kind === 'sting'), bells = r.allLog.filter((x) => x.kind === 'bell');
    const v = r.vib;
    report.h5 = { early: r.early, at4: r.at4, vib: v, log: r.log, bells: bells.length, audio: r.audio, noVib, noVibErrors, lastWide: lastWide && lastWide.t, firstShut: firstShut && firstShut.t, maxShake, shakeSpan, darkSpan: darkened.length / 240, walkerMoved, simCamMoved };
    const okTiming = lastWide && firstShut && Math.abs(lastWide.t - 0.25) <= 0.05 && firstShut.t - lastWide.t <= 0.12 + 1 / 240 + 1e-9 && shown.length && shown[shown.length - 1].t <= firstShut.t + 1e-9;
    const okVib = v.length === 1 && JSON.stringify(v[0].p) === '[90,50,140]' && Math.abs(v[0].t - a.t4 - r.bang) <= 1 / 240 + 1e-9;
    const okSound = slam.length === 1 && sting.length === 1 && slam[0].peak / slam[0].base >= 3 && sting[0].length <= 0.6 && bells.length > 0 && bells.every((b) => Math.abs(b.peak / b.base - 2) < 1e-6) && r.audio === 'running';
    check('H5', 'staff-door scare: only after E3, figure 0.25 s, slam <= 0.12 s, small shake, one vibration, loud bang',
      r.early.E2 != null && r.early.E3 != null && r.early.E4 === null && r.early.wide === null && r.early.dist <= 2.0 && a.t4 != null && a.E3 != null && a.t4 > a.e3end && a.dist <= 2.0 && a.hinge >= 1.3 && Math.abs(a.sx - 0.5) <= 1 / 4 + 0.01 && okTiming && maxShake <= 0.03 && shakeSpan <= 0.3 && walkerMoved === 0 && simCamMoved < 1e-9 && Math.abs(darkened.length / 240 - 0.1) <= 2 / 240 && okVib && okSound && noVib.E4 != null && noVibErrors === 0,
      `standing ${f2(r.early.dist)} m from the staff door and looking at it (E2 ${f2(r.early.E2)} s and E3 ${f2(r.early.E3)} s came meanwhile; the staff door never left the view): wide ${r.early.wide}, E4 ${r.early.E4}, door at ${f1(r.early.back * 180 / Math.PI)} deg; in the full visit E4 at ${f2(a.t4)} s, after E3 (${f2(a.E3)} s, door shut again at ${f2(a.e3end)} s); walker ${f2(a.dist)} m from the door (${f2(a.hinge)} m from the hinge), door centre at ${f2(a.sx)} of the width, figure points in sight at E4+0.12 s ${r.seen}/5 (information only); ` +
      `drawn: figure in the gap until ${f2(shown.length ? shown[shown.length - 1].t : null)} s, leaf wide until ${f2(lastWide && lastWide.t)} s (0.25 +- 0.05), shut at ${f2(firstShut && firstShut.t)} s -> slam ${firstShut && lastWide ? (firstShut.t - lastWide.t).toFixed(3) : 'n/a'} s (<= 0.12); ` +
      `drawn camera shake up to ${maxShake.toFixed(4)} m over ${shakeSpan.toFixed(3)} s, walker moved ${walkerMoved} m, simulation camera moved ${simCamMoved.toExponential(1)} m; dark overlay on for ${(darkened.length / 240).toFixed(3)} s; ` +
      `navigator.vibrate (recorder) called ${v.length} time(s): ${v.map((x) => JSON.stringify(x.p) + ' at E4+' + (x.t - a.t4).toFixed(3) + ' s').join(', ')} (bang at E4+${r.bang.toFixed(3)} s); ` +
      `played gains (sound ${r.audio}): bang ${slam.length ? (slam[0].peak / slam[0].base).toFixed(2) : 'n/a'}x the bed (>= 3), sting ${sting.length ? sting[0].length.toFixed(3) : 'n/a'} s long (<= 0.6), ${bells.length} chimes at ${bells.length ? (bells[0].peak / bells[0].base).toFixed(2) : 'n/a'}x; ` +
      `with navigator.vibrate removed: E4 at ${f2(noVib.E4)} s, ${noVibErrors} errors`);
  }

  // ---------- H6: coming out, the figure stands behind the glass; it was placed where the camera could not see it ----------
  {
    const P = await open('?view=reveal');
    const g = await figureGeo(P.page, 'window'), sil = await silhouette(P.page, shot('reveal-figure-4x'));
    const rev = await P.page.evaluate(() => ({ fired: window.__diorama.horror().fired, mode: window.__diorama.state().mode }));
    await P.close();
    const ways = {};
    for (const way of ['street', 'inside', 'road', 'script']) {
      const Q = await open('?view=hero');
      await Q.page.evaluate(helpers);
      ways[way] = await Q.page.evaluate((way) => {
        const D = window.__diorama, H = window.__H, C = D.core, S = C.SCARE_PLAN;
        const W = { street: [S.out, [5.0, 1.6, 9.0]], inside: [[[5.0, -0.6], [6.2, -2.3]], [1.5, 1.25, -7.95]], road: [[...S.out, [5.0, 7.0]], [5.0, 1.6, 0.0]], script: [S.out, null] }[way];
        H.enter(); H.aisle(); H.e3(); H.staff(); H.bang();
        H.walk(W[0]); if (W[1]) H.look(W[1]);
        D.exit(); H.dt = 1 / 120;
        let placed = null; const pts = C.figurePoints('window');
        H.each = (st) => {
          if (placed || D.horror().figure !== 'window') return;
          const v = D.visibility(pts), i = D.info();
          placed = { t: st.t, camY: st.cam.y, seen: v.filter((p) => p.inFrustum && !p.blockedBy).length, of: v.length, outOfView: v.filter((p) => !p.inFrustum).length,
            blockedBy: [...new Set(v.map((p) => p.blockedBy).filter(Boolean))], lamp: i.shop.lamp, glow: i.shop.glow, how: D.horror().e5Dark ? 'dark' : 'unseen' };
        };
        H.until(() => D.state().mode === 'orbit', 5); H.each = null;
        return { placed, figure: D.horror().figure, drawn: D.info().figures.counterOrWindow };
      }, way);
      await Q.close();
    }
    report.h6 = { g, sil, rev, ways };
    const wayOk = (w) => w.placed && w.figure === 'window' && w.drawn && w.placed.camY > 3.6 && (w.placed.seen === 0 || (w.placed.lamp <= 0.05 && w.placed.glow <= 0.05));
    const wayTxt = (k, w) => !w.placed ? `${k}: not placed` : `${k}: placed at camera ${w.placed.camY.toFixed(2)} m, ${w.placed.how === 'unseen' ? `unseen (of ${w.placed.of} figure points ${w.placed.outOfView} outside the view, the rest behind ${w.placed.blockedBy.join('/') || '-'})` : `in a blackout, shop lamps ${(w.placed.lamp * 100).toFixed(1)}% (${w.placed.seen}/${w.placed.of} figure points in view)`}`;
    check('H6', 'coming out: figure behind the glass, placed where the camera could not see it',
      g.figure === 'window' && g.drawn.counterOrWindow && g.inFrame && sil.core >= 20 && sil.ratio <= 0.6 && rev.fired.E2 != null && Object.values(ways).every(wayOk),
      `reveal: figure '${g.figure}', drawn ${g.drawn.counterOrWindow}, box on screen ${g.inFrame} (${boxTxt(g.box)}), ray to its centre blocked by ${g.ray.blockedBy || 'nothing'}; ${sil.core} figure pixels mean ${f1(sil.figure)} vs ${f1(sil.behind)} behind = ${sil.ratio == null ? 'n/a' : (sil.ratio * 100).toFixed(1) + '%'} (<= 60%); ` +
      Object.entries(ways).map(([k, w]) => wayTxt(k, w)).join('; ') + ` [unseen = what SPEC asks; blackout = the fallback when the spot stays in view all the way up, which needs a decision]`);
  }

  // ---------- H7: three visits in a row ----------
  {
    const P = await open('?view=hero');
    await P.page.evaluate(helpers);
    const r = await P.page.evaluate(() => {
      const D = window.__diorama, H = window.__H, out = [];
      for (let v = 1; v <= 3; v++) {
        const startFig = D.horror().figure, i0 = D.info();
        let prev = { fig: i0.figures.counterOrWindow, lamp: i0.shop.lamp }, removal = null, litPop = 0;
        H.each = (st) => { const i = D.info(), now = { fig: i.figures.counterOrWindow, lamp: i.shop.lamp }; if (prev.fig && !now.fig) { removal = { lamp: now.lamp, prevLamp: prev.lamp, camY: st.cam.y }; if (prev.lamp > 0.05 || now.lamp > 0.05) litPop++; } prev = now; };
        H.enter(); H.each = null;
        H.aisle(); H.e3(); H.staff(); H.bang(); H.leave();
        const h = D.horror(), count = (e) => h.history.filter((x) => x.e === e && x.visit === h.visit).length;
        out.push({ visit: h.visit, startFig, removal, litPop, counts: Object.fromEntries(['E0', 'E1', 'E2', 'E3', 'E4', 'E5'].map((e) => [e, count(e)])), endFig: h.figure, mode: D.state().mode });
      }
      return out;
    });
    await P.close();
    report.h7 = r;
    const ok = r.length === 3 && r.every((v, i) => v.visit === i + 1 && ['E0', 'E2', 'E3', 'E4', 'E5'].every((e) => v.counts[e] === 1) && v.removal && v.removal.lamp <= 0.05 && v.litPop === 0 && v.endFig === 'window' && v.mode === 'orbit');
    check('H7', 'three visits in a row, each event once per visit', ok,
      r.map((v) => `visit ${v.visit}: starts with the figure at '${v.startFig}', removed with the lamps at ${f2(v.removal && v.removal.lamp * 100)}%, events ${Object.entries(v.counts).map(([e, n]) => `${e}x${n}`).join(' ')}, ends with the figure at '${v.endFig}' (${v.mode})`).join(' | '));
  }

  // ---------- H8: calm version ----------
  {
    const P = await open('?view=hero&calm=1');
    await P.page.evaluate(helpers);
    const r = await P.page.evaluate(() => {
      const D = window.__diorama, H = window.__H, S = D.core.SCARE_PLAN; let drawn = 0, minLamp = 1, maxBack = 0;
      H.each = (st) => { const i = D.info(); if (i.figures.counterOrWindow || i.figures.backroom) drawn++; minLamp = Math.min(minLamp, i.shop.lamp); maxBack = Math.max(maxBack, i.leaf); };
      H.enter(); H.walk(S.aisle); H.until(() => false, 3); H.look(S.behind); H.until(() => false, 2); H.look(S.staff); H.walk([S.near]); H.look(S.staff); H.until(() => false, 2); H.leave();
      H.each = null;
      const h = D.horror();
      return { calm: h.calm, kinds: [...new Set(h.history.map((x) => x.e))], E1: h.history.filter((x) => x.e === 'E1').length, figure: h.figure, drawn, minLamp, maxBack: (maxBack * 180) / Math.PI, trig: D.trigger('E4'), afterTrig: D.horror().fired.E4 };
    });
    await P.close();
    report.h8 = r;
    check('H8', 'calm=1: no figure, no E0 and E2-E5; the chime still rings', r.calm && r.kinds.length === 1 && r.kinds[0] === 'E1' && r.E1 >= 2 && r.figure === null && r.drawn === 0 && r.minLamp === 1 && r.maxBack <= 35 + 1e-6 && r.maxBack >= 35 - 1e-6 && r.trig === false && r.afterTrig === null,
      `calm ${r.calm}; events in a full visit: ${r.kinds.join(',')} (${r.E1} chimes); figure ${r.figure}, drawn in ${r.drawn} frames; shop lamps never below ${(r.minLamp * 100).toFixed(0)}%; staff door at most ${r.maxBack.toFixed(0)} deg (stays half open); test trigger('E4') -> ${r.trig}, E4 ${r.afterTrig}; ` +
      `the original items 1-9, performance and the player default are the other rows of this run`);
  }

  // ======================= 第四轮 R1–R9 (SPEC 店里的操作与「看整间店」视角) =======================
  let finishR9 = () => {};
  const PHONE = { width: 390, height: 844, dpr: 3, touch: true }, FOLD = { width: 880, height: 920, dpr: 2, touch: true };
  // Chrome hands touch moves to the page with the next frame, so every touch waits two frames before the next read or step
  const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const cdpTouch = async (P) => { const cdp = await P.ctx.newCDPSession(P.page); return async (type, pts) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y, radiusX: 4, radiusY: 4, force: 1 })) }); await settle(P.page); }; };
  const snap = (page) => page.evaluate(() => { const s = window.__diorama.state(); return { mode: s.mode, level: s.level, x: s.player.x, z: s.player.z, yaw: s.player.yaw, pitch: s.player.pitch, eye: s.eye, cam: s.cam, s: s.s, fog: s.fog, t: s.t, lift: s.lift, trigger: s.trigger, room: s.room, transition: s.transition }; });
  const stepN = (page, n, dt = 1 / 60) => page.evaluate(({ n, dt }) => { window.__diorama.step(dt, n); }, { n, dt });
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const angD = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  // pinch (ratio < 1) or spread (ratio > 1) with two fingers on the right side, centred at (cx, cy) css px
  async function twoFingers(T, page, cx, cy, d0, ratio, ids = [11, 12], stepEach = 0) {
    await T('touchStart', [[ids[0], cx - d0 / 2, cy], [ids[1], cx + d0 / 2, cy]]);
    for (let i = 1; i <= 10; i++) { const d = d0 * (1 + (ratio - 1) * (i / 10)); await T('touchMove', [[ids[0], cx - d / 2, cy], [ids[1], cx + d / 2, cy]]); if (stepEach) await stepN(page, stepEach); }
    await T('touchEnd', []);
  }
  // every frame of a running transition: camera outside every solid grown by 0.1 m (doors that are open and lifted parts skipped)
  const transitionFrames = (page, until) => page.evaluate((until) => {
    const D = window.__diorama, bad = [], modes = new Set();
    for (let i = 0; i < 400; i++) {
      const s = D.step(1 / 60, 1); modes.add(s.mode);
      const c = s.cam;
      for (const b of D.solids()) {
        if ((b.kind === 'door' && !b.active) || (s.lift && b.lift === s.lift)) continue;
        if (c.x > b.x0 - 0.1 && c.x < b.x1 + 0.1 && c.y > b.y0 - 0.1 && c.y < b.y1 + 0.1 && c.z > b.z0 - 0.1 && c.z < b.z1 + 0.1) bad.push(b.id);
      }
      if (s.mode === until) break;
    }
    return { bad: [...new Set(bad)], modes: [...modes], frames: modes.size };
  }, until);
  const roomShot = (page, id) => page.evaluate((id) => {
    const D = window.__diorama, C = D.core, b = C.BUILDINGS.find((q) => q.id === id), w = innerWidth, h = innerHeight;
    const corners = C.roomFloor(b).map(([x, y, z]) => D.toScreen(x, y, z)).map(([x, y]) => [x / w, y / h]);
    return { corners, inFrame: corners.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1), drawn: D.info().drawnRoofs, hint: D.pad().hint };
  }, id);

  // ---------- R1: the joystick walks, stops, never turns ----------
  {
    const P = await open('?view=door', PHONE), page = P.page, T = await cdpTouch(P);
    await page.evaluate(() => { window.__diorama.step(0, 1); window.__diorama.place(5.0, -1.5, 0); });
    const s0 = await snap(page);
    await T('touchStart', [[1, 100, 650]]);
    const pad0 = await page.evaluate(() => window.__diorama.pad());
    await T('touchMove', [[1, 100, 590]]); const a = await snap(page); await stepN(page, 60); const b = await snap(page);
    await T('touchMove', [[1, 100, 620]]); const c = await snap(page); await stepN(page, 60); const d = await snap(page);
    await page.waitForTimeout(250); await page.screenshot({ path: shot('phone-joystick') });
    const pad1 = await page.evaluate(() => window.__diorama.pad());
    await T('touchMove', [[1, 100, 645]]); const e = await snap(page); await stepN(page, 30); const f = await snap(page);
    await T('touchMove', [[1, 160, 650]]); const g0 = await snap(page); await stepN(page, 30); const g1 = await snap(page);
    await T('touchMove', [[1, 100, 590]]); await stepN(page, 12); await T('touchEnd', []); const h0 = await snap(page); await stepN(page, 12); const h1 = await snap(page);
    const pad2 = await page.evaluate(() => window.__diorama.pad());
    await P.close();
    const full = dist2(a, b), dir = Math.atan2(-(b.x - a.x), -(b.z - a.z)), half = dist2(c, d), dead = dist2(e, f), side = dist2(g0, g1), sideDir = Math.atan2(-(g1.x - g0.x), -(g1.z - g0.z)), after = dist2(h0, h1);
    report.r1 = { pad0, pad1, pad2, full, half, dead, side, after, yaw: [s0.yaw, h1.yaw] };
    check('R1', 'joystick walks along the view, in proportion, stops on release, never turns', pad0.joyShown && pad0.joyAt[0] === 100 && pad0.joyAt[1] === 650 && Math.abs(full - 1.3) <= 0.1 && angD(dir, s0.yaw) < 0.02 && Math.abs(half / full - 0.5) <= 0.1 && dead < 1e-9 && angD(sideDir, s0.yaw - Math.PI / 2) < 0.02 && after < 1e-9 && h1.yaw === s0.yaw && !pad2.joyShown,
      `390x844 touch: thumb down at (100, 650) on the left -> joystick shown ${pad0.joyShown} at (${pad0.joyAt.join(', ')}); pushed fully up 1 s -> ${full.toFixed(3)} m, ${(angD(dir, s0.yaw) * 180 / Math.PI).toFixed(2)} deg off the line of sight; half push 1 s -> ${half.toFixed(3)} m (${(half / full).toFixed(2)} of full); ` +
      `5 px (inside the 6 px dead zone) 0.5 s -> ${dead.toFixed(4)} m; pushed right 0.5 s -> ${side.toFixed(3)} m to the right of the view; let go -> ${after.toFixed(4)} m in the next 0.2 s, joystick hidden ${!pad2.joyShown}; yaw ${s0.yaw.toFixed(4)} -> ${h1.yaw.toFixed(4)}`);
  }

  // ---------- R2: joystick and right-hand drag together, never a pinch ----------
  {
    const P = await open('?view=door', PHONE), page = P.page, T = await cdpTouch(P), res = {};
    for (const order of ['joystick first', 'drag first']) {
      await page.evaluate(() => { window.__diorama.step(0, 1); window.__diorama.place(5.0, -1.5, 0); });
      const s0 = await snap(page);
      if (order === 'joystick first') { await T('touchStart', [[1, 90, 700]]); await page.waitForTimeout(300); await T('touchStart', [[1, 90, 700], [2, 300, 520]]); }
      else { await T('touchStart', [[2, 300, 520]]); await page.waitForTimeout(300); await T('touchStart', [[2, 300, 520], [1, 90, 700]]); }
      const r = { modes: new Set(), pinched: 0, closest: Infinity };
      for (let i = 1; i <= 60; i++) {
        const j = [1, 90 + i * 1.2, 700 - Math.min(45, i)], k = [2, 300 - i * 1.8, 520 + i * 1.5];
        r.closest = Math.min(r.closest, Math.hypot(k[1] - j[1], k[2] - j[2]));
        await T('touchMove', [j, k]);
        const q = await page.evaluate(() => { const D = window.__diorama, s = D.step(1 / 60, 1); return { mode: s.mode, pinching: D.pad().pinching }; });
        r.modes.add(q.mode); if (q.pinching) r.pinched++;
      }
      await T('touchEnd', []);
      const s1 = await snap(page);
      res[order] = { modes: [...r.modes], pinched: r.pinched, closest: r.closest, moved: dist2(s0, s1), turned: s1.yaw - s0.yaw };
    }
    await P.close();
    report.r2 = res;
    const ok = Object.values(res).every((r) => r.modes.length === 1 && r.modes[0] === 'walk' && r.pinched === 0 && r.moved > 0.3 && Math.abs(r.turned) > 0.3 && r.closest < 0.75 * Math.hypot(210, 180));
    check('R2', 'one finger held 300 ms, then the other (joystick or drag first): walks and turns, never a pinch', ok,
      Object.entries(res).map(([k, r]) => `${k}: walked ${r.moved.toFixed(2)} m and turned ${r.turned.toFixed(2)} rad in 1 s; fingers came within ${r.closest.toFixed(0)} px of each other (start ${Math.hypot(210, 180).toFixed(0)}; a pinch would fire below 75%); modes ${r.modes.join(',')}; frames read as a pinch ${r.pinched}`).join(' | '));
  }

  // ---------- R3: touch turning by screen width; mouse as before ----------
  {
    const res = {};
    for (const [name, opt] of [['390x844', PHONE], ['880x920', FOLD]]) {
      const P = await open('?view=door', opt), page = P.page, T = await cdpTouch(P), W = opt.width;
      await page.evaluate(() => { window.__diorama.step(0, 1); window.__diorama.place(5.0, -1.5, 0); });
      const s0 = await snap(page);
      await T('touchStart', [[1, W - 1, opt.height / 2]]);
      for (let x = W - 9; x > 1; x -= 8) await T('touchMove', [[1, x, opt.height / 2]]);
      await T('touchMove', [[1, 1, opt.height / 2]]); await T('touchEnd', []);
      const s1 = await snap(page);
      res[name] = { turned: Math.abs(s1.yaw - s0.yaw), swipe: W - 2, perWidth: (Math.abs(s1.yaw - s0.yaw) * W) / (W - 2) };
      await P.close();
    }
    const M = await open('?view=door');
    await M.page.evaluate(() => window.__diorama.step(0, 1));
    const m0 = await snap(M.page);
    await M.page.mouse.move(600, 360); await M.page.mouse.down(); await M.page.mouse.move(700, 360, { steps: 5 }); await M.page.mouse.up();
    const m1 = await snap(M.page);
    await M.close();
    const mouse = m1.yaw - m0.yaw;
    report.r3 = { res, mouse };
    check('R3', 'touch turning: a full screen width is 180 deg; mouse unchanged', Object.values(res).every((r) => Math.abs(r.perWidth - Math.PI) <= 0.1 * Math.PI) && Math.abs(Math.abs(mouse) - 0.5) < 0.005,
      Object.entries(res).map(([k, r]) => `${k}: a ${r.swipe} px swipe turned ${(r.turned * 180 / Math.PI).toFixed(1)} deg = ${(r.perWidth * 180 / Math.PI).toFixed(1)} deg per screen width (180 +- 18)`).join(' | ') + ` | mouse drag 100 px -> ${Math.abs(mouse).toFixed(3)} rad (round 3: 0.005 rad/px)`);
  }

  // ---------- R4 + R5: pinch inside -> room view; spread lands; pinch out like item 2 ----------
  {
    const r4 = {}, r5 = {};
    for (const [name, q, opt, id] of [['store 390x844', '?view=inside', PHONE, 'store'], ['next 390x844', '?view=next', PHONE, 'next'], ['store 880x920', '?view=inside', FOLD, 'store']]) {
      const P = await open(q, opt), page = P.page, T = await cdpTouch(P), W = opt.width, Hh = opt.height;
      await page.evaluate(() => window.__diorama.step(0, 1));
      const before = await snap(page);
      await twoFingers(T, page, W * 0.76, Hh * 0.55, W * 0.2, 0.55);
      const after = await snap(page);
      const fr = await transitionFrames(page, 'room');
      await page.waitForTimeout(250);
      const rs = await roomShot(page, id), s2 = await snap(page);
      if (name !== 'store 390x844') await page.screenshot({ path: shot(name.startsWith('next') ? 'phone-room-next' : 'fold-room-pinched') });
      r4[name] = { level: before.level, modeAfterPinch: after.mode, frames: fr, mode: s2.mode, ...rs };
      if (id === 'store') {
        // spread over a floor spot -> land there
        const aim = [5.4, -4.6], sc = await page.evaluate(([x, z]) => window.__diorama.toScreen(x, 0.12, z), aim);
        await twoFingers(T, page, sc[0], sc[1], 50, 2.9, [21, 22]);
        const m1 = (await snap(page)).mode, fl = await transitionFrames(page, 'walk'), s3 = await snap(page);
        // back up to the room view, then pinch out to the table
        await twoFingers(T, page, W * 0.76, Hh * 0.55, W * 0.2, 0.55, [31, 32]); await transitionFrames(page, 'room');
        const camYaw = (await snap(page)).cam.yaw;
        await twoFingers(T, page, W * 0.76, Hh * 0.55, W * 0.2, 0.55, [41, 42]);
        const m2 = await snap(page), out = await transitionFrames(page, 'orbit'), s4 = await snap(page);
        const fogAtEntry = await page.evaluate((s) => window.__diorama.core.looks(s, innerWidth / innerHeight).fog, s4.trigger.s);
        const drawn = await page.evaluate(() => window.__diorama.info().drawnRoofs);
        r5[name] = { spreadMode: m1, landFrames: fl, landed: [s3.x, s3.z], off: Math.hypot(s3.x - aim[0], s3.z - aim[1]), eye: s3.eye, pitch: s3.pitch, yaw: s3.yaw, outMode: m2.mode, outFrames: out, end: s4, fogAtEntry, drawn, camYaw };
      }
      await P.close();
    }
    report.r4 = r4; report.r5 = r5;
    const ok4 = Object.entries(r4).every(([k, r]) => {
      const id = k.startsWith('next') ? 'next' : 'store', other = id === 'store' ? 'nextRoof' : 'storeRoof';
      const off = id === 'store' ? r.drawn.storeRoof === 0 && r.drawn.storeCeiling === 0 && r.drawn.hang === 0 && r.drawn.bulbs === 0 && r.drawn.ceilingGrid === 0 : r.drawn.nextRoof === 0 && r.drawn.nextLightPanel === 0;
      return r.level === 'inside' && r.modeAfterPinch === 'rising' && r.mode === 'room' && !r.frames.modes.includes('exiting') && !r.frames.modes.includes('orbit') && r.frames.bad.length === 0 && off && r.drawn.annex === 1 && r.drawn[other] === 1 && r.inFrame;
    });
    check('R4', 'pinch inside a shop: the room view, roof and ceiling off, back room roof on, floor in frame, nothing crossed', ok4,
      Object.entries(r4).map(([k, r]) => `${k}: level ${r.level}, pinch -> ${r.modeAfterPinch} -> ${r.mode} (modes on the way ${r.frames.modes.join(',')}), camera inside a solid on ${r.frames.bad.length} frames; drawn roof/ceiling/hanging goods/bulbs/grid ${k.startsWith('next') ? `${r.drawn.nextRoof}/-/${r.drawn.nextLightPanel}/-/-` : `${r.drawn.storeRoof}/${r.drawn.storeCeiling}/${r.drawn.hang}/${r.drawn.bulbs}/${r.drawn.ceilingGrid}`}, back room ${r.drawn.annex}, other shop roof ${k.startsWith('next') ? r.drawn.storeRoof : r.drawn.nextRoof}; floor corners ${r.corners.map(([x, y]) => `(${x.toFixed(2)},${y.toFixed(2)})`).join(' ')} all in frame ${r.inFrame}; hint「${r.hint}」`).join(' | '));
    const ok5 = Object.values(r5).every((r) => r.spreadMode === 'landing' && r.landFrames.bad.length === 0 && r.off <= 0.3 && Math.abs(r.eye - 1.6) <= 0.02 && Math.abs(r.pitch) < 0.05 && r.outMode === 'exiting' && r.outFrames.modes.every((m) => m === 'exiting' || m === 'orbit') && r.end.mode === 'orbit' && r.end.s === r.end.trigger.s && Math.abs(r.end.fog - r.fogAtEntry) < 1e-12 && r.drawn.storeRoof === 1 && r.drawn.storeCeiling === 1);
    check('R5', 'from the room view: spread lands on the aimed floor; pinch goes out like item 2, roofs back', ok5,
      Object.entries(r5).map(([k, r]) => `${k}: spread over (5.4, -4.6) -> ${r.spreadMode}, landed at (${f3(r.landed[0])}, ${f3(r.landed[1])}) ${r.off.toFixed(3)} m off, eye ${f3(r.eye)}, pitch ${f3(r.pitch)}, camera inside a solid on ${r.landFrames.bad.length} frames; pinch twice -> ${r.outMode} -> ${r.end.mode}: s ${f3(r.end.s)} = entry s ${f3(r.end.trigger.s)}, fog ${r.end.fog} = ${r.fogAtEntry}, roof drawn ${r.drawn.storeRoof}, ceiling ${r.drawn.storeCeiling}`).join(' | '));
  }

  // ---------- R6: pinch on the pavement goes straight out ----------
  {
    const P = await open('?view=door', PHONE), page = P.page, T = await cdpTouch(P);
    await page.evaluate(() => window.__diorama.step(0, 1));
    const s0 = await snap(page);
    await twoFingers(T, page, 390 * 0.76, 844 * 0.55, 78, 0.55);
    const m = (await snap(page)).mode, fr = await transitionFrames(page, 'orbit'), s1 = await snap(page);
    await P.close();
    report.r6 = { level: s0.level, m, modes: fr.modes, end: s1.mode };
    check('R6', 'pinch on the pavement goes straight out', s0.level === 'street' && m === 'exiting' && !fr.modes.includes('rising') && !fr.modes.includes('room') && s1.mode === 'orbit',
      `standing on the pavement (${f3(s0.x)}, ${f3(s0.z)}), level ${s0.level}; pinch on the right half -> ${m}, modes on the way ${fr.modes.join(',')}, ends ${s1.mode}`);
  }

  // ---------- R7: desktop, real wheel and keys (real time) ----------
  {
    const P = await open('?view=inside'), page = P.page;
    const poll = async (pred, ms) => { const seen = new Set(), t0 = Date.now(); while (Date.now() - t0 < ms) { const m = (await snap(page)).mode; seen.add(m); if (pred(m)) return { ok: true, seen: [...seen] }; await page.waitForTimeout(50); } return { ok: false, seen: [...seen] }; };
    await page.evaluate(() => window.__diorama.auto(true));
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, 120); const w1 = await poll((m) => m === 'room', 3000);
    await page.waitForTimeout(400); await page.screenshot({ path: shot('room-wheel') });
    await page.mouse.wheel(0, 120); const w2 = await poll((m) => m === 'orbit', 4000);
    // in again, stand inside, wheel back to the room view, wheel forward over a floor spot
    const door = await page.evaluate(() => window.__diorama.toScreen(5.0, 1.3, 0.5)); await page.mouse.move(door[0], door[1]);
    for (let k = 0; k < 40 && (await snap(page)).mode === 'orbit'; k++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
    await poll((m) => m === 'walk', 4000);
    await page.evaluate(() => window.__diorama.place(5.0, -2.0, 0)); await page.waitForTimeout(400);
    await page.mouse.wheel(0, 120); const w3 = await poll((m) => m === 'room', 3000);
    const spot = await page.evaluate(() => window.__diorama.toScreen(4.0, 0.12, -4.5)); await page.mouse.move(spot[0], spot[1]);
    const aimed = await page.evaluate(([x, y]) => window.__diorama.groundPoint(x / innerWidth, y / innerHeight), spot);
    await page.waitForTimeout(400); await page.mouse.wheel(0, -120); const w4 = await poll((m) => m === 'walk', 3000);
    const landed = await snap(page);
    // Esc from walking inside, and from the room view
    await page.keyboard.press('Escape'); const e1 = await poll((m) => m === 'orbit', 4000);
    for (let k = 0; k < 40 && (await snap(page)).mode === 'orbit'; k++) { await page.mouse.move(door[0], door[1]); await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
    await poll((m) => m === 'walk', 4000);
    await page.evaluate(() => window.__diorama.place(5.0, -2.0, 0)); await page.waitForTimeout(400);
    await page.mouse.wheel(0, 120); await poll((m) => m === 'room', 3000);
    await page.keyboard.press('Escape'); const e2 = await poll((m) => m === 'orbit', 4000);
    await P.close();
    const off = aimed ? Math.hypot(landed.x - aimed[0], landed.z - aimed[1]) : null;
    report.r7 = { w1, w2, w3, w4, aimed, landed: [landed.x, landed.z], off, e1, e2 };
    check('R7', 'desktop: wheel back to the room view and out, wheel forward lands under the cursor, Esc out from every level',
      w1.ok && !w1.seen.includes('exiting') && w2.ok && w3.ok && w4.ok && off != null && off <= 0.3 && Math.abs(landed.eye - 1.6) <= 0.02 && e1.ok && !e1.seen.includes('room') && !e1.seen.includes('rising') && e2.ok && !e2.seen.includes('walk'),
      `inside, one notch back -> room view ${w1.ok} (${w1.seen.join(',')}); another notch back -> outside ${w2.ok} (${w2.seen.join(',')}); room view again ${w3.ok}; cursor over the floor at (${aimed ? aimed.map(f3).join(', ') : '-'}), one notch forward -> walking ${w4.ok} at (${f3(landed.x)}, ${f3(landed.z)}), ${off == null ? '-' : off.toFixed(3)} m off, eye ${f3(landed.eye)}; ` +
      `Esc while walking inside -> outside ${e1.ok} (${e1.seen.join(',')}); Esc in the room view -> outside ${e2.ok} (${e2.seen.join(',')})`);
  }

  // ---------- R8: the room view starts nothing; E5 after the roof is back ----------
  {
    const P = await open('?view=hero');
    await P.page.evaluate(helpers);
    const r = await P.page.evaluate(() => {
      const D = window.__diorama, H = window.__H, S = D.core.SCARE_PLAN;
      H.enter(); D.walkRoute(S.aisle); H.until(() => !D.state().player.walking, 20);
      const e2 = D.horror().fired.E2, n0 = D.horror().history.length;
      D.back(); H.until(() => D.state().mode === 'room', 3);
      const t0 = D.state().t; H.until(() => false, 10); const t1 = D.state().t;
      const later = D.horror().history.slice(n0).map((x) => x.e), wide = D.horror().wideAt;
      D.back(); let placed = null;
      H.each = () => { if (!placed && D.horror().figure === 'window') { const i = D.info(); placed = { roof: i.drawnRoofs.storeRoof, ceiling: i.drawnRoofs.storeCeiling, simRoof: D.roofs().store.a, camY: D.state().cam.y }; } };
      H.until(() => D.state().mode === 'orbit', 5); H.each = null;
      return { e2, stay: t1 - t0, later, wide, placed, figure: D.horror().figure };
    });
    await P.close();
    report.r8 = r;
    const hOk = report.checks.filter((c) => /^H[1-8]$/.test(String(c.id))).every((c) => c.pass) && report.checks.filter((c) => /^H[1-8]$/.test(String(c.id))).length === 8;
    check('R8', 'scare points unaffected: H1-H8 pass, nothing starts in the room view, E5 after the roof is back', hOk && r.e2 != null && r.stay >= 10 - 1e-6 && r.later.length === 0 && r.wide === null && r.placed && r.placed.roof === 1 && r.placed.simRoof === 1 && r.figure === 'window',
      `H1-H8 in this run: ${hOk ? 'all pass' : 'NOT all pass'}; E2 fired at ${f2(r.e2)} s, then the room view for ${r.stay.toFixed(2)} s: events ${r.later.length ? r.later.join(',') : 'none'}, staff door changed ${r.wide !== null}; leaving from the room view: figure placed with the roof drawn at ${r.placed ? r.placed.roof : '-'} (simulation ${r.placed ? r.placed.simRoof : '-'}), camera ${r.placed ? r.placed.camY.toFixed(2) : '-'} m; ends with the figure at '${r.figure}'`);
  }

  // ---------- R10: two fingers down together (390x844 and 880x920) ----------
  {
    const res = {};
    for (const [name, opt] of [['390x844', PHONE], ['880x920', FOLD]]) {
      const W = opt.width, Hh = opt.height, jx = W * 0.2, jy = Hh * 0.82, bx = W * 0.78, by = Hh * 0.62, r = {};
      // (1) together, one on the joystick spot, closing along the line between them
      let P = await open('?view=door', opt), page = P.page, T = await cdpTouch(P);
      await page.evaluate(() => { window.__diorama.step(0, 1); window.__diorama.place(5.0, -1.5, 0); });
      await T('touchStart', [[1, jx, jy]]); await T('touchStart', [[1, jx, jy], [2, bx, by]]);
      const pend = (await page.evaluate(() => window.__diorama.pad())).pending;
      for (let i = 1; i <= 10; i++) { const k = (i / 10) * 0.45; await T('touchMove', [[1, jx + ((bx - jx) * k) / 2, jy + ((by - jy) * k) / 2], [2, bx - ((bx - jx) * k) / 2, by - ((by - jy) * k) / 2]]); }
      await T('touchEnd', []);
      const m1 = (await snap(page)).mode, fr1 = await transitionFrames(page, 'room');
      r.one = { pending: pend, mode: m1, end: fr1.modes[fr1.modes.length - 1] };
      await P.close();
      // (2) together, the lower-left one pushed up, the right one swiping across; then (2b) swiping the other way
      for (const [key, dir] of [['two', 1], ['twoIn', -1]]) {
        P = await open('?view=door', opt); page = P.page; T = await cdpTouch(P);
        await page.evaluate(() => { window.__diorama.step(0, 1); window.__diorama.place(5.0, -1.5, 0); });
        const s0 = await snap(page), rx = W * 0.72, ry = jy - 8, modes = new Set(); let pinched = 0;
        await T('touchStart', [[1, jx, jy]]); await T('touchStart', [[1, jx, jy], [2, rx, ry]]);
        for (let i = 1; i <= 40; i++) {                 // 2/3 s: thumb up to 40 px, the other finger 100 px across
          await T('touchMove', [[1, jx, jy - Math.min(40, i * 2)], [2, rx + dir * i * 2.5, ry]]);
          const q = await page.evaluate(() => { const D = window.__diorama, s = D.step(1 / 60, 1); return { mode: s.mode, pinching: D.pad().pinching, joy: !!D.pad().joy }; });
          modes.add(q.mode); if (q.pinching) pinched++;
        }
        const joyOn = (await page.evaluate(() => window.__diorama.pad())).joyShown;
        await T('touchEnd', []);
        const s1 = await snap(page);
        r[key] = { modes: [...modes], pinched, joyOn, moved: dist2(s0, s1), turned: s1.yaw - s0.yaw };
        await P.close();
      }
      // (3) joystick held 300 ms, then the second finger, closing in
      P = await open('?view=door', opt); page = P.page; T = await cdpTouch(P);
      await page.evaluate(() => { window.__diorama.step(0, 1); window.__diorama.place(5.0, -1.5, 0); });
      const t0 = await snap(page);
      await T('touchStart', [[1, jx, jy]]); await T('touchMove', [[1, jx, jy - 30]]); await page.waitForTimeout(300);
      await T('touchStart', [[1, jx, jy - 30], [2, bx, by]]);
      const modes3 = new Set(); let pinched3 = 0;
      for (let i = 1; i <= 25; i++) {
        await T('touchMove', [[1, jx + i * 2, jy - 30 - i], [2, bx - i * 4, by + i * 2]]);
        const q = await page.evaluate(() => { const D = window.__diorama, s = D.step(1 / 60, 1); return { mode: s.mode, pinching: D.pad().pinching }; });
        modes3.add(q.mode); if (q.pinching) pinched3++;
      }
      await T('touchEnd', []);
      const t1 = await snap(page);
      r.three = { modes: [...modes3], pinched: pinched3, moved: dist2(t0, t1), turned: t1.yaw - t0.yaw };
      await P.close();
      res[name] = r;
    }
    report.r10 = res;
    const ok = Object.values(res).every((r) => r.one.pending && r.one.mode === 'rising' && r.one.end === 'room'
      && ['two', 'twoIn'].every((k) => r[k].modes.length === 1 && r[k].modes[0] === 'walk' && r[k].pinched === 0 && r[k].joyOn && r[k].moved > 0.3 && Math.abs(r[k].turned) > 0.2)
      && r.three.modes.length === 1 && r.three.modes[0] === 'walk' && r.three.pinched === 0 && r.three.moved > 0.3 && Math.abs(r.three.turned) > 0.2);
    check('R10', 'two fingers down together: closing along their line is a pinch; push up + swipe is walk and turn; a joystick held 300 ms stays one', ok,
      Object.entries(res).map(([k, r]) => `${k}: (1) together (one on the joystick spot), undecided at first ${r.one.pending}, closing along the line -> ${r.one.mode} -> ${r.one.end}; ` +
        `(2) together, thumb up + swipe out -> modes ${r.two.modes.join(',')}, pinch frames ${r.two.pinched}, joystick ${r.two.joyOn}, walked ${r.two.moved.toFixed(2)} m, turned ${r.two.turned.toFixed(2)} rad; swipe in -> ${r.twoIn.modes.join(',')}, ${r.twoIn.pinched}, ${r.twoIn.joyOn}, ${r.twoIn.moved.toFixed(2)} m, ${r.twoIn.turned.toFixed(2)} rad; ` +
        `(3) joystick held 300 ms then the other finger closing in -> modes ${r.three.modes.join(',')}, pinch frames ${r.three.pinched}, walked ${r.three.moved.toFixed(2)} m, turned ${r.three.turned.toFixed(2)} rad`).join(' | '));
  }

  // ---------- R11: portrait room view, shop long side upright ----------
  {
    const res = {};
    for (const [name, q, id] of [['store', '?view=room', 'store'], ['next', '?view=next', 'next']]) {
      const P = await open(q, PHONE), page = P.page, T = await cdpTouch(P);
      await page.evaluate(() => window.__diorama.step(0, 1));
      if (id === 'next') { await twoFingers(T, page, 390 * 0.76, 844 * 0.4, 78, 0.55); await transitionFrames(page, 'room'); }
      const r = await page.evaluate((id) => {
        const D = window.__diorama, C = D.core, b = C.BUILDINGS.find((q) => q.id === id), h = innerHeight, w = innerWidth;
        const pts = C.roomFloor(b).map(([x, y, z]) => D.toScreen(x, y, z)), ys = pts.map((p) => p[1]), xs = pts.map((p) => p[0]);
        return { mode: D.state().mode, share: (Math.max(...ys) - Math.min(...ys)) / h, wide: (Math.max(...xs) - Math.min(...xs)) / w, inFrame: pts.every(([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h), yaw: D.state().cam.yaw };
      }, id);
      res[name] = r;
      await P.close();
    }
    report.r11 = res;
    check('R11', 'portrait room view: floor box >= 45% of the screen height, corners in frame', Object.values(res).every((r) => r.mode === 'room' && r.share >= 0.45 && r.inFrame),
      Object.entries(res).map(([k, r]) => `${k} 390x844: floor box ${(r.share * 100).toFixed(1)}% of the height (round 4: about 33%), ${(r.wide * 100).toFixed(1)}% of the width, corners in frame ${r.inFrame}, camera heading ${(r.yaw * 180 / Math.PI).toFixed(0)} deg (along the long side)`).join(' | '));
  }

  // ---------- R12: the joystick ring ----------
  {
    const P = await open('?view=door', PHONE), page = P.page, T = await cdpTouch(P);
    await page.evaluate(() => window.__diorama.step(0, 1));
    const a = await page.evaluate(() => window.__diorama.pad());
    await page.waitForTimeout(200); await page.screenshot({ path: shot('phone-ring') });
    await T('touchStart', [[1, 90, 690]]); await T('touchMove', [[1, 90, 660]]);
    const b = await page.evaluate(() => window.__diorama.pad());
    await T('touchEnd', []);
    const c = await page.evaluate(() => window.__diorama.pad());
    await twoFingers(T, page, 390 * 0.76, 844 * 0.4, 78, 0.55);       // not on the joystick spot: a pinch; walking on the pavement -> out
    await transitionFrames(page, 'orbit');
    const d = await page.evaluate(() => window.__diorama.pad());
    await P.close();
    const M = await open('?view=door');
    await M.page.evaluate(() => window.__diorama.step(0, 1));
    const m = await M.page.evaluate(() => window.__diorama.pad());
    await M.close();
    report.r12 = { a, b, c, d, m };
    check('R12', 'joystick ring: shown on touch while walking with nothing down, hidden on press, back on release, never with a mouse',
      a.coarse && a.ring.shown && Math.abs(a.ring.at[0] - 390 * 0.225) < 1 && Math.abs(a.ring.at[1] - 844 * 0.8) < 1 && Math.abs(a.ring.opacity - 0.25) < 0.01 && a.ring.size === 120 && !b.ring.shown && b.joyShown && c.ring.shown && !d.ring.shown && !m.coarse && !m.ring.shown,
      `390x844 touch, walking: ring shown ${a.ring.shown} at (${a.ring.at.map((v) => v.toFixed(1)).join(', ')}) (middle of the lower-left spot), opacity ${a.ring.opacity}, ${a.ring.size} px across (joystick 120 px); thumb down -> ring ${b.ring.shown ? 'shown' : 'hidden'}, joystick ${b.joyShown}; let go -> ring ${c.ring.shown ? 'shown' : 'hidden'}; outside -> ring ${d.ring.shown ? 'shown' : 'hidden'}; desktop with a mouse (pointer coarse ${m.coarse}), walking -> ring ${m.ring.shown ? 'shown' : 'hidden'}`);
  }

  // ---------- R13: the upper left turns the head ----------
  {
    const P = await open('?view=door', PHONE), page = P.page, T = await cdpTouch(P);
    await page.evaluate(() => { window.__diorama.step(0, 1); window.__diorama.place(5.0, -1.5, 0); });
    const s0 = await snap(page);
    await T('touchStart', [[1, 78, 250]]);
    let joySeen = false;
    for (let i = 1; i <= 10; i++) { await T('touchMove', [[1, 78 + i * 10, 250]]); joySeen = joySeen || (await page.evaluate(() => window.__diorama.pad())).joyShown; }
    await stepN(page, 30); await T('touchEnd', []);
    const s1 = await snap(page);
    await P.close();
    const expect = (100 * Math.PI) / 390;
    report.r13 = { turned: s1.yaw - s0.yaw, moved: dist2(s0, s1), joySeen };
    check('R13', 'upper left: a drag turns the head, no joystick, no walking', Math.abs(Math.abs(s1.yaw - s0.yaw) - expect) < 1e-6 && dist2(s0, s1) < 1e-9 && !joySeen,
      `390x844: finger down at (78, 250) (left 45%, upper 60%), dragged 100 px right -> turned ${Math.abs(s1.yaw - s0.yaw).toFixed(4)} rad (100/390 x pi = ${expect.toFixed(4)}), walked ${dist2(s0, s1).toFixed(4)} m, joystick shown ${joySeen}`);
  }

  // ---------- R9: the 880x920 fold screen ----------
  {
    const P = await open('?view=inside', FOLD), page = P.page, T = await cdpTouch(P);
    const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    await page.evaluate(() => { window.__diorama.step(0, 1); window.__diorama.place(5.0, -1.5, 0); });
    const s0 = await snap(page);
    await T('touchStart', [[1, 200, 700]]); await T('touchMove', [[1, 200, 640]]); await stepN(page, 45);
    await page.waitForTimeout(250); await page.screenshot({ path: shot('fold-joystick') });
    await T('touchEnd', []); const s1 = await snap(page);
    await T('touchStart', [[2, 700, 400]]); for (let x = 692; x >= 480; x -= 8) await T('touchMove', [[2, x, 400]]); await T('touchEnd', []);
    const s2 = await snap(page);
    await twoFingers(T, page, 880 * 0.76, 920 * 0.55, 176, 0.55); const fr = await transitionFrames(page, 'room'); const lv1 = (await snap(page)).mode;
    const sc = await page.evaluate(() => window.__diorama.toScreen(5.4, 0.12, -4.6));
    await twoFingers(T, page, sc[0], sc[1], 60, 2.9, [21, 22]); await transitionFrames(page, 'walk'); const s3 = await snap(page);
    await twoFingers(T, page, 880 * 0.76, 920 * 0.55, 176, 0.55, [31, 32]); await transitionFrames(page, 'room');
    await twoFingers(T, page, 880 * 0.76, 920 * 0.55, 176, 0.55, [41, 42]); await transitionFrames(page, 'orbit'); const s4 = await snap(page);
    await P.close();
    const fold = { overflow, walked: dist2(s0, s1), turned: Math.abs(s2.yaw - s1.yaw), lv1, frames: fr, s3, end: s4.mode };
    report.r9 = fold;
    // judged at the very end, once items 9, performance and the player default have run too
    finishR9 = () => {
      const regress = report.checks.filter((c) => /^(1|1b|2|3|4|5|6|7|8|9|P|D|H[1-8])$/.test(String(c.id)));
      check('R9', 'regressions (H1-H8, items 1-9, 1b, performance, player default) and the 880x920 fold screen',
        regress.length === 20 && regress.every((c) => c.pass) && fold.overflow.sw <= fold.overflow.cw && fold.walked > 0.5 && Math.abs(fold.turned - (216 * Math.PI) / 880) < 0.02 && fold.lv1 === 'room' && fold.frames.bad.length === 0 && fold.s3.mode === 'walk' && Math.hypot(fold.s3.x - 5.4, fold.s3.z + 4.6) <= 0.3 && fold.end === 'orbit',
        `${regress.filter((c) => c.pass).length}/${regress.length} earlier rows pass (${regress.filter((c) => !c.pass).map((c) => c.id).join(',') || 'none failing'}); 880x920 touch: no horizontal overflow (scrollWidth ${fold.overflow.sw} <= ${fold.overflow.cw}); ` +
        `joystick 0.75 s -> ${fold.walked.toFixed(2)} m; a 216 px drag -> ${fold.turned.toFixed(3)} rad (216/880 x pi = ${((216 * Math.PI) / 880).toFixed(3)}); pinch inside -> ${fold.lv1}; spread -> walking at (${f3(fold.s3.x)}, ${f3(fold.s3.z)}); pinch, pinch -> ${fold.end}`);
    };
  }

  // ---------- performance: draw calls and frame rate ----------
  {
    const perf = {};
    for (const [name, q, dpr] of [['hero dpr1', '?view=hero', 1], ['hero dpr2', '?view=hero', 2], ['default dpr2', '', 2], ['inside dpr2', '?view=inside', 2], ['scare dpr2', '?view=scare', 2]]) {
      const P = await open(q, { dpr });
      await P.page.waitForTimeout(1200);
      const fps = await P.page.evaluate(() => new Promise((res) => { const t = []; const f = (n) => { t.push(n); if (t.length < 181) requestAnimationFrame(f); else res((t.length - 1) / ((t[t.length - 1] - t[0]) / 1000)); }; requestAnimationFrame(f); }));
      const i = await info(P.page);
      perf[name] = { fps, calls: i.calls, triangles: i.triangles, dpr: i.dpr, buffer: i.buffer };
      await P.close();
    }
    report.perf = perf;
    check('P', 'performance budget at ?view=hero 1280x720', perf['hero dpr1'].calls <= 150 && perf['hero dpr2'].fps >= 50 && perf['hero dpr1'].dpr <= 2,
      Object.entries(perf).map(([k, v]) => `${k}: ${v.fps.toFixed(1)} fps, ${v.calls} draw calls, ${v.triangles} triangles, buffer ${v.buffer.join('x')}`).join(' | ') + ` | rain 2400 segments in one LineSegments`);
  }

  // ---------- player default: no parameters, pixel ratio 2, real wheel / clicks / keys in real time ----------
  {
    const P = await open('', { dpr: 2 });
    const { page } = P;
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot('default-hero') });
    const i0 = await info(page);
    const door = await page.evaluate(() => window.__diorama.toScreen(5.0, 1.3, 0.5));
    await page.mouse.move(door[0], door[1]);
    let wheels = 0;
    for (; wheels < 40 && (await state(page)).mode === 'orbit'; wheels++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
    const inside = await until(page, () => window.__diorama.state().mode === 'walk', 6000);
    const landed = await state(page);
    await page.waitForTimeout(700);
    await page.screenshot({ path: shot('default-landed') });
    await page.mouse.click(640, 640);
    await page.waitForTimeout(120);
    const clickWalk = (await state(page)).player.walking;
    await until(page, () => !window.__diorama.state().player.walking, 8000);
    const pc = (await state(page)).player;
    await page.keyboard.down('Shift'); await page.keyboard.down('w'); await page.waitForTimeout(700);
    await page.keyboard.up('w'); await page.keyboard.up('Shift');
    const pkS = await state(page), pk = pkS.player;
    const keyMoved = Math.hypot(pk.x - pc.x, pk.z - pc.z);
    await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(760, 360, { steps: 6 }); await page.mouse.up();
    const yawDrag = (await state(page)).player.yaw - pk.yaw;
    await page.mouse.wheel(0, 120);
    const lvl = await until(page, () => ['room', 'orbit'].includes(window.__diorama.state().mode), 5000);
    const viaRoom = (await state(page)).mode === 'room';
    if (viaRoom) { await page.waitForTimeout(400); await page.mouse.wheel(0, 120); }
    const back = lvl && await until(page, () => window.__diorama.state().mode === 'orbit', 5000);
    const fin = await state(page);
    // and once more with Esc
    for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
    const again = await until(page, () => window.__diorama.state().mode === 'walk', 6000);
    await page.keyboard.press('Escape');
    const escBack = await until(page, () => window.__diorama.state().mode === 'orbit', 5000);
    const i1 = await info(page);
    report.defaultRun = { i0, landed: landed.cam, wheels, clickWalk, keyMoved, yawDrag, fin: { s: fin.s, orbit: fin.orbit, trigger: fin.trigger }, i1 };
    check('D', 'player default (no parameters, pixel ratio 2, real input)', inside && clickWalk && keyMoved > 1.0 && Math.abs(yawDrag) > 0.1 && back && again && escBack && i0.dpr === 2,
      `pixel ratio ${i0.dpr}, buffer ${i0.buffer.join('x')}, tilt pass on ${i0.tiltOn}; ${wheels} wheel notches over the door -> inside ${inside}, eye ${f3(landed.eye)}; click on floor -> walking ${clickWalk}; ` +
      `Shift+W 0.7 s -> ${keyMoved.toFixed(2)} m (now ${pkS.level === 'inside' ? 'inside the shop' : 'on the ' + pkS.level}); drag -> yaw ${yawDrag.toFixed(2)} rad; wheel back${viaRoom ? ' (in the shop: room view first, one more notch)' : ''} -> outside ${back} (s ${f3(fin.s)} = entry s ${f3(fin.trigger.s)}); wheel in again ${again}, Esc -> outside ${escBack}; sound ${i1.audio}`);
    await P.close();
  }

  // ======================= 第六轮：电脑转身、惊吓好找 (SPEC 电脑转身与惊吓好找, K1 K2 F1 F4 F5) =======================
  // ---------- K1: real keyboard turning ----------
  {
    const P = await open('?view=hero'), page = P.page;
    await page.evaluate(helpers);
    await page.evaluate(() => { const H = window.__H; H.enter(); H.walk([[5.0, -0.6], [4.6, -3.2]]); });
    const rows = [];
    const held = async (key, hz, secs) => {
      await page.evaluate(() => window.__diorama.place(4.6, -3.2, 0));    // the same spot each time, facing the back of the shop
      const a = await state(page);
      await page.keyboard.down(key);
      const b = await page.evaluate(([dt, n]) => window.__diorama.keyStep(dt, n), [1 / hz, Math.round(secs * hz)]);
      await page.keyboard.up(key);
      await page.evaluate(() => window.__diorama.keyStep(1 / 60, 1));
      const sideways = (b.player.x - a.player.x) * Math.cos(a.player.yaw) - (b.player.z - a.player.z) * Math.sin(a.player.yaw);
      return { key, hz, dyaw: b.player.yaw - a.player.yaw, moved: Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z), sideways };
    };
    for (const key of ['ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE']) for (const hz of [30, 120]) rows.push({ ...(await held(key, hz, 1)), want: key === 'ArrowLeft' || key === 'KeyQ' ? 2 : -2 });
    const side = [];
    for (const key of ['KeyA', 'KeyD']) for (const hz of [30, 120]) side.push({ ...(await held(key, hz, 0.5)), sign: key === 'KeyA' ? -1 : 1 });
    const shiftTurn = await (async () => { await page.keyboard.down('ShiftLeft'); const r = await held('ArrowLeft', 60, 1); await page.keyboard.up('ShiftLeft'); return r; })();
    // real time: the page's own loop, ArrowLeft held for one second
    await page.evaluate(() => window.__diorama.auto(true)); await page.waitForTimeout(300);
    const r0 = await state(page);
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(1000); await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(200);
    const r1 = await state(page);
    await page.evaluate(() => window.__diorama.auto(false));
    await page.evaluate(() => window.__diorama.ui(true)); await page.screenshot({ path: shot('K1-turned') });
    await P.close();
    const live = { dyaw: r1.player.yaw - r0.player.yaw, moved: Math.hypot(r1.player.x - r0.player.x, r1.player.z - r0.player.z), simT: r1.t - r0.t };
    report.k1 = { rows, side, shiftTurn, live };
    check('K1', 'turning keys: <- -> and Q E turn 2.0 rad/s in place at any step rate; A D step sideways without turning (real keyboard)',
      rows.every((x) => Math.abs(x.dyaw - x.want) <= 0.1 && x.moved === 0) && Math.max(...rows.map((x) => Math.abs(x.dyaw - x.want))) < 1e-9 &&
      side.every((x) => x.dyaw === 0 && x.sign * x.sideways > 0.6) && Math.abs(shiftTurn.dyaw - 2) < 1e-9 && Math.abs(live.dyaw - 2) <= 0.1 && live.moved === 0,
      `held 1 s through the page's key handling: ${rows.map((x) => `${x.key}@${x.hz}/s ${x.dyaw.toFixed(4)} rad, moved ${x.moved}`).join('; ')}; Shift+ArrowLeft ${shiftTurn.dyaw.toFixed(4)} rad; ` +
      `A/D 0.5 s: ${side.map((x) => `${x.key}@${x.hz}/s ${x.sideways.toFixed(3)} m sideways, yaw change ${x.dyaw}`).join('; ')}; ` +
      `real time (page loop, ArrowLeft held 1000 ms): ${live.dyaw.toFixed(3)} rad over ${live.simT.toFixed(3)} s of simulation (incl. 0.2 s after release), moved ${live.moved}`);
  }

  // ---------- K2: hints ----------
  {
    const R5_TOUCH = { inside: '左边摇杆走 · 右边拖动转头 · 捏合看整间店', street: '左边摇杆走 · 右边拖动转头 · 捏合出来' };
    const read = async (touch) => {
      const P = await open('?view=hero', touch ? { width: 390, height: 844, dpr: 3, touch: true } : {});
      await P.page.evaluate(helpers);
      const r = await P.page.evaluate(() => {
        const D = window.__diorama, H = window.__H, el = document.getElementById('hint'), txt = () => el.textContent;
        H.enter(); const street = txt(); H.walk([[5.0, -0.6], [4.6, -3.2]]); const inside = txt();
        return { street, inside, fits: el.scrollWidth <= el.clientWidth + 1, sw: el.scrollWidth, cw: el.clientWidth };
      });
      if (!touch) { await P.page.evaluate(() => window.__diorama.ui(true)); await P.page.screenshot({ path: shot('K2-hint-mouse') }); }
      await P.close();
      return r;
    };
    const mouse = await read(false), touch = await read(true);
    report.k2 = { mouse, touch };
    check('K2', 'hints: the mouse hint in the shop has "← → 转身"; the touch hints are as in round 5',
      mouse.inside === 'W S 前后 · A D 横移 · ← → 转身 · 拖动也能转 · 滚轮往后看整间店' && mouse.inside.includes('← → 转身') && mouse.fits && touch.inside === R5_TOUCH.inside && touch.street === R5_TOUCH.street,
      `mouse, in the shop: "${mouse.inside}" (fits in one line at 1280 px: ${mouse.fits}, ${mouse.sw}/${mouse.cw} px); mouse, on the pavement: "${mouse.street}"; touch: "${touch.inside}" / "${touch.street}"`);
  }

  // ---------- F1: a first-visit wanderer, three seeds, in the page ----------
  const wand = [];
  for (const [seed, aim] of [[1, 'door'], [2, 'street'], [3, 'next']]) {   // round 8: three different landings (the shop next door's door third)
    const P = await open('?view=hero');
    await P.page.keyboard.press('KeyX');            // first gesture: sound on (a key that does nothing else)
    const r = await P.page.evaluate(([seed, aim]) => window.__diorama.wander({ seed, aim, maxT: 90 }), [seed, aim]);
    const h = await P.page.evaluate(() => { const h = window.__diorama.horror(); return { history: h.history, wide: h.wideAt }; });
    const log = await P.page.evaluate(() => window.__diorama.audioLog());
    // round 7, part of the pass condition: is the figure in the staff doorway in sight 0.12 s after E4 (drawn meshes, the open leaf included)?
    const seen = await P.page.evaluate(() => {
      const D = window.__diorama, C = D.core, h = D.horror(); if (!h.e4) return null;
      D.step(1 / 240, Math.max(0, Math.round((h.e4.t0 + 0.12 - D.state().t) * 240)));
      const v = D.visibility(C.figurePoints('backroom')), st = D.state();
      return { n: v.filter((x) => x.inFrustum && !x.blockedBy).length, by: [...new Set(v.filter((x) => x.blockedBy).map((x) => x.blockedBy))], at: [st.player.x, st.player.z], core: h.e4.seen };
    });
    await P.page.screenshot({ path: shot(`F1-seed${seed}-E4`) });
    const at = (e) => { const x = h.history.find((y) => y.e === e); return x ? x.t - r.t0 : null; };
    const land = r.log.find((e) => e.phase === 'enter');
    wand.push({ seed, aim, land: land ? [land.x, land.z] : null, T: [at('E2'), at('E3'), at('E4')], ran: r.t, wide: h.wide == null ? null : h.wide - r.t0, phases: r.log.filter((e) => e.phase !== 'heard').map((e) => e.phase + '@' + (e.t - r.t0).toFixed(1)).join(' '), heard: r.log.filter((e) => e.phase === 'heard').map((e) => e.kind + '@' + (e.t - r.t0).toFixed(1)).join(' '), knocks: (log || []).filter((x) => x.kind === 'knock'), seen, errors: P.errors.length });
    await P.close();
  }
  report.f1 = wand;
  check('F1', 'a wanderer that knows nothing of the triggers meets E2, E3, E4 in order within 90 s and sees the figure (seeds 1-3 landing at the store door, the street, the shop next door; in the page)',
    wand.every((x) => x.T.every((v) => v != null) && x.T[0] < x.T[1] && x.T[1] < x.T[2] && x.T[2] <= 90 && x.errors === 0 && x.seen && x.seen.n >= 1),
    wand.map((x) => `seed ${x.seed} (aim ${x.aim}, landed ${x.land ? x.land.map((v) => v.toFixed(1)).join(',') : 'n/a'}): E2 ${f2(x.T[0])} s, E3 ${f2(x.T[1])} s, staff door wide ${f2(x.wide)} s, E4 ${f2(x.T[2])} s (phases ${x.phases}; heard ${x.heard || 'nothing'}; knocks played ${x.knocks.length}; at E4+0.12 s standing at (${x.seen ? x.seen.at.map((v) => v.toFixed(2)).join(', ') : 'n/a'}), figure points in sight ${x.seen ? x.seen.n : 'n/a'}/5 drawn (needs >= 1)${x.seen && x.seen.by.length ? ', the rest blocked by ' + x.seen.by.join('/') : ''}, ${x.seen ? x.seen.core : 'n/a'}/5 by the logic at E4)`).join(' | '));
  // pictures from seed 1: the first panel blink, the moment the first knock plays, E4
  {
    const P = await open('?view=hero'), page = P.page;
    await page.keyboard.press('KeyX');
    await page.evaluate(() => window.__diorama.wander({ seed: 1, stop: 'E2' }));
    await page.evaluate(() => { const D = window.__diorama, t0 = D.horror().e2.t0; D.step(1 / 240, Math.max(0, Math.round((t0 + 0.05 - D.state().t) * 240))); });
    const blink = await page.evaluate(() => ({ panel: { level: window.__diorama.levels().tube, lamp: window.__diorama.info().shop.tube, color: 'tube' }, t: window.__diorama.state().t - window.__diorama.horror().e2.t0 }));
    await page.evaluate(() => window.__diorama.ui(true)); await page.screenshot({ path: shot('F1-E2-blink') });
    await page.evaluate(() => { const D = window.__diorama; D.step(1 / 240, Math.round(0.1 * 240)); });
    const lit = await page.evaluate(() => ({ panel: { level: window.__diorama.levels().tube, lamp: window.__diorama.info().shop.tube, color: 'tube' }, t: window.__diorama.state().t - window.__diorama.horror().e2.t0 }));
    await page.screenshot({ path: shot('F1-E2-between') });
    await page.evaluate(() => window.__diorama.wander({ resume: true, stop: 'E4' }));
    await page.screenshot({ path: shot('F1-E4') });
    await P.close();
    report.f1Pictures = { blink, lit };
    console.log(`        F1 pictures (seed 1, paused at E2 for them): tube at E2+${blink.t.toFixed(3)} s: level ${blink.panel.level}, lamps ${blink.panel.lamp}, colour ${blink.panel.color}; at E2+${lit.t.toFixed(3)} s: level ${lit.panel.level}, lamps ${lit.panel.lamp}, colour ${lit.panel.color}`);
  }

  // ---------- V1 (round 7): the logic's sight lines to the figure agree with rays against the drawn meshes ----------
  {
    const P = await open('?view=hero'), page = P.page;
    await page.evaluate(helpers);
    const r = await page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core, B = C.BACKDOOR, pts = C.figurePoints('backroom');
      H.enter(); H.aisle(); H.e3(); H.look(C.SCARE_PLAN.behind); H.until(() => D.horror().wideAt != null, 6); H.until(() => D.levels().back >= B.wide - 1e-9, 3);
      const rows = [];
      for (const x of [4.8, 5.3, 5.8, 6.2, 6.5, 6.8, 7.2, 7.7, 8.2]) for (const z of [-6.0, -6.6, -7.2]) {
        const dx = B.cx - x, dz = B.cz - z;
        D.place(x, z, Math.atan2(-dx, -dz));
        const st = D.state(), logic = C.figureSightlines(st.cam, st.fov, st.aspect, D.levels().back), drawn = D.visibility(pts).map((v) => v.inFrustum && !v.blockedBy);
        rows.push({ x, z, logic: logic.filter(Boolean).length, drawn: drawn.filter(Boolean).length, same: logic.filter((v, i) => v === drawn[i]).length });
      }
      return { rows, back: D.levels().back, E4: D.horror().fired.E4 };
    });
    await P.close();
    const anyAgree = r.rows.filter((x) => (x.logic > 0) === (x.drawn > 0)).length, ptAgree = r.rows.reduce((a, x) => a + x.same, 0);
    report.v1 = r;
    check('V1', 'E4 figure-in-sight test: the logic (boxes + turned leaf) agrees with rays against the drawn meshes',
      Math.abs(r.back - 1.3962634) < 1e-6 && r.E4 === null && anyAgree === r.rows.length && ptAgree >= r.rows.length * 5 - 2,
      `staff door wide (${(r.back * 180 / Math.PI).toFixed(0)} deg), ${r.rows.length} spots inside the shop facing it: "at least one point in sight" agrees on ${anyAgree}/${r.rows.length}, single points on ${ptAgree}/${r.rows.length * 5}; ` +
      r.rows.map((x) => `(${x.x}, ${x.z}) ${x.logic}/${x.drawn}`).join(' '));
  }

  // ---------- F4: knocking, read from the played gain plan ----------
  {
    const P = await open('?view=hero'), page = P.page;
    await page.keyboard.press('KeyX');
    await page.evaluate(helpers);
    const r = await page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core;
      H.enter(); H.aisle(); H.e3();
      const before = (D.audioLog() || []).filter((x) => x.kind === 'knock').length;
      H.look(C.SCARE_PLAN.behind); H.until(() => D.horror().wideAt != null, 6);
      const wide = D.horror().wideAt;
      H.until(() => false, 45);
      const k45 = (D.audioLog() || []).filter((x) => x.kind === 'knock');
      H.staff(); const t4 = D.horror().fired.E4; H.until(() => false, 15);
      const all = (D.audioLog() || []).filter((x) => x.kind === 'knock');
      return { before, wide, k45, t4, after: all.filter((x) => x.simT > t4).length, total: all.length, audio: D.info().audio, door: [C.BACKDOOR.cx, C.BACKDOOR.cz] };
    });
    await P.close();
    const Q = await open('?view=hero&calm=1');
    await Q.page.keyboard.press('KeyX');
    await Q.page.evaluate(() => window.__diorama.wander({ seed: 1, maxT: 90 }));
    const calm = await Q.page.evaluate(() => ({ knocks: (window.__diorama.audioLog() || []).filter((x) => x.kind === 'knock').length, bells: (window.__diorama.audioLog() || []).filter((x) => x.kind === 'bell').length, audio: window.__diorama.info().audio }));
    await Q.close();
    const k = r.k45, gaps = k.slice(1).map((x, i) => x.simT - k[i].simT), steps = k.slice(1).map((x, i) => x.peak / k[i].peak), mults = k.map((x) => x.peak / x.base);
    const growOk = k.slice(1).every((x, i) => Math.abs(x.peak / x.base - Math.min(2.5, (k[i].peak / k[i].base) * 1.2)) < 1e-6);
    const posOk = k.every((x) => Math.hypot(x.panner.x - r.door[0], x.panner.z - r.door[1]) <= 0.5 && x.panner.z < r.door[1] && x.panner.model === 'HRTF');
    report.f4 = { ...r, k45: k.map((x) => ({ simT: x.simT, peak: x.peak, base: x.base, mult: x.mult, panner: x.panner })), calm };
    check('F4', 'knocks: start when the staff door is wide, every 6 +- 0.2 s, +20% each up to 2.5x the bed, placed at the staff door; none after E4; none in calm',
      r.audio === 'running' && r.before === 0 && k.length >= 7 && Math.abs(k[0].simT - r.wide - 0.3) < 1e-6 && gaps.every((g) => Math.abs(g - 6) <= 0.2) && growOk && Math.max(...mults) <= 2.5 + 1e-9 && Math.abs(Math.max(...mults) - 2.5) < 1e-9 && Math.abs(mults[0] - 1) < 1e-9 && posOk && r.t4 != null && r.after === 0 && calm.knocks === 0 && calm.bells > 0,
      `sound ${r.audio}; knocks before the staff door went wide: ${r.before}; door wide at ${f2(r.wide)} s, first knock played at +${k.length ? (k[0].simT - r.wide).toFixed(3) : 'n/a'} s; ${k.length} knocks in 45 s, gaps ${gaps.map((g) => g.toFixed(3)).join(' ')} s; ` +
      `played peaks ${mults.map((m) => m.toFixed(3)).join(' ')}x the bed (each / previous ${steps.map((x) => x.toFixed(3)).join(' ')}); PannerNode ${k.length ? k[0].panner.model + ' ' + k[0].panner.distance : 'n/a'} at (${k.length ? [k[0].panner.x, k[0].panner.y, k[0].panner.z].map((v) => v.toFixed(2)).join(', ') : 'n/a'}), staff door centre (${r.door.join(', ')}); ` +
      `E4 at ${f2(r.t4)} s, knocks after it ${r.after}; calm (wanderer 90 s): ${calm.knocks} knocks, ${calm.bells} chimes (sound ${calm.audio})`);
  }

  // ======================= 第八轮：老旧杂货店 (SPEC 老旧杂货店的深夜氛围, A1 A5 A6 A7 A8) 与流浪狗 (D2-D4) =======================
  async function lumStats(file) {                  // mean luminance, and the brightest 10% against the darkest 50%
    return calc.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, L = new Float32Array(d.length / 4);
      for (let i = 0; i < L.length; i++) L[i] = 0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2];
      L.sort(); const n = L.length, sum = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += L[i]; return s; };
      return { mean: sum(0, n) / n, top: sum(Math.floor(n * 0.9), n) / (n - Math.floor(n * 0.9)), bottom: sum(0, Math.floor(n * 0.5)) / Math.floor(n * 0.5), max: L[n - 1] };
    }, fs.readFileSync(file).toString('base64'));
  }
  // ---------- A1: the shop is dark now (the inside view against round 7's) ----------
  {
    const cur = await lumStats(shot('inside')), base = baseline ? await lumStats(baseline) : { mean: 152.46, recorded: true };
    const ratio = cur.top / cur.bottom;
    // the sky light and moon inside, as drawn: the same view with the bulbs and the tube off, ambient at 0, as built, and at full
    // (round 6's level); linear-light means (the screen is sRGB), so (built - none) / (full - none) is the share that is left
    const linMean = async (q) => {
      const P = await open('?view=inside&lights=0,0,0' + q); await P.page.evaluate(() => window.__diorama.ui(false)); await P.page.waitForTimeout(300);
      const buf = await P.page.screenshot(); await P.close();
      return calc.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data, lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; let s = 0;
        for (let i = 0; i < d.length; i += 4) s += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); return s / (d.length / 4); }, buf.toString('base64'));
    };
    const amb = { none: await linMean(',0'), built: await linMean(''), full: await linMean(',1') };
    amb.share = (amb.built - amb.none) / (amb.full - amb.none);
    report.a1 = { cur, base, baseline, amb };
    check('A1', 'the shop is really dark: the inside view at <= 45% of round 7\'s brightness, bright 10% >= 6x the dark half, not black; sky light inside at about 30%',
      cur.mean <= 0.45 * base.mean && ratio >= 6 && cur.mean > 8 && cur.max > 120 && amb.share >= 0.25 && amb.share <= 0.35,
      `inside view mean luminance ${cur.mean.toFixed(1)} vs round 7 ${base.mean.toFixed(1)} (${baseline ? 'measured from ' + path.basename(baseline) : 'recorded value'}) = ${(100 * cur.mean / base.mean).toFixed(1)}% (<= 45%); ` +
      `brightest 10% ${cur.top.toFixed(1)} / darkest 50% ${cur.bottom.toFixed(1)} = ${ratio.toFixed(2)} (>= 6); brightest pixel ${cur.max.toFixed(0)} (not all black); with the bulbs and tube off, linear mean ${amb.none.toFixed(4)} without sky light, ${amb.built.toFixed(4)} as built, ${amb.full.toFixed(4)} at full: sky light and moon inside at ${(100 * amb.share).toFixed(1)}% (about 30%: 25-35%)`);
  }

  // ---------- A7: performance, one shadow-casting light, and the phone ----------
  {
    const meas = async (q, opt) => {
      const P = await open(q, opt); await P.page.evaluate(() => window.__diorama.auto(true)); await P.page.waitForTimeout(2600);
      const i = await info(P.page); await P.close(); return i;
    };
    const desk = await meas('?view=hero'), deskIn = await meas('?view=inside'), phone = await meas('?view=hero', { width: 390, height: 844, dpr: 3, touch: true }), phoneIn = await meas('?view=inside', { width: 390, height: 844, dpr: 3, touch: true });
    report.a7 = { desk, deskIn, phone, phoneIn };
    check('A7', 'performance: hero 1280x720 <= 150 draw calls and >= 50 fps; one shadow-casting light; 390x844 measured too',
      desk.calls <= 150 && desk.fps >= 50 && deskIn.fps >= 50 && desk.shop.lights.shadows === 1 && deskIn.shop.lights.shadows === 1 && phone.fps >= 30 && phoneIn.fps >= 30,
      `hero 1280x720: ${desk.calls} draw calls, ${desk.fps.toFixed(1)} fps; inside 1280x720: ${deskIn.calls} calls, ${deskIn.fps.toFixed(1)} fps; lights on ${desk.shop.lights.n}, casting shadows ${desk.shop.lights.shadows}; ` +
      `390x844 (pixel ratio ${phone.dpr}): hero ${phone.calls} calls ${phone.fps.toFixed(1)} fps, inside ${phoneIn.calls} calls ${phoneIn.fps.toFixed(1)} fps (headless desktop GPU, not a phone)`);
  }

  // ---------- A5: P1 at the end of an aisle, P2 the black TV (in the page) ----------
  {
    const P = await open('?view=hero'), page = P.page;
    await page.evaluate(helpers);
    const p1 = await page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core, A = C.GROCERY.aisles[1];
      H.enter(); H.walk([[5.0, -0.6], [5.0, -2.4], [5.0, -0.4], [5.0, -2.4]]);
      H.until(() => D.horror().e2 && D.state().t >= D.horror().e2.t0 + C.E2_TOTAL, 10);
      D.place(A.cx, A.zFront + 0.3, 0);
      const t0 = D.state().t; H.dt = 1 / 240; let seen = null, on = [];
      H.each = (st) => { const L = D.levels(), i = D.info(); if (i.figures.aisle) { on.push({ t: st.t, tube: L.tube }); if (!seen && st.t >= D.horror().p1.t0 + 0.1) seen = D.visibility(C.figurePointsAt(C.aisleSpot(A))).filter((v) => v.inFrustum && !v.blockedBy).length; } };
      H.until(() => D.horror().p1 && D.state().t >= D.horror().p1.t0 + 0.12, 8); H.each = null;
      const p = D.horror().p1;
      return { p, t0, flickerStart: C.TUBE_EVENTS.some((e) => Math.abs(e.t - p.t0) < 1e-9), tubeAtStart: C.tubeFlickerOff(p.t0 + 0.01), seen, first: on.length ? on[0].t : null };
    });
    await page.evaluate(() => window.__diorama.ui(true)); await page.screenshot({ path: shot('A5-P1-aisle') });
    const p1b = await page.evaluate(() => {
      const D = window.__diorama, H = window.__H, p = D.horror().p1; let last = null, offAtEnd = false;
      H.each = (st) => { const L = D.levels(); if (D.info().figures.aisle) last = st.t; if (st.t >= p.t1 && st.t < p.t1 + 0.06 && L.tube === 0) offAtEnd = true; };
      H.until(() => D.state().t >= p.t1 + 0.2, 2); H.each = null;
      return { last, offAtEnd };
    });
    // P2: once the dog has been and gone, close to the TV and looking at it
    const p2 = await page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core; H.dt = 1 / 60;
      H.until(() => D.state().t >= C.scareReady(D.horror()) + 0.5, 30);
      D.place(5.6, -2.47, -Math.PI / 2); H.dt = 1 / 240; window.__p2black = 0;
      H.each = () => { const tv = D.info().shop.tv; if (tv && tv.reflect && tv.snow === 0) window.__p2black++; };
      H.until(() => D.horror().p2 && D.state().t >= D.horror().p2.t0 + 0.2, 2); H.each = null;
      const px = D.tvPixels(), i = D.info();
      return { p: D.horror().p2, px, figures: i.figures, dog: i.dog, solids: D.solids().length };
    });
    await page.screenshot({ path: shot('A5-P2-tv') });
    const p2b = await page.evaluate(() => { const D = window.__diorama, H = window.__H, p = D.horror().p2; H.dt = 1 / 240; H.each = () => { const tv = D.info().shop.tv; if (tv && tv.reflect && tv.snow === 0) window.__p2black++; }; H.until(() => D.state().t >= p.t1 + 0.2, 2); H.each = null; return { black: window.__p2black / 240, after: D.tvPixels() }; });
    await P.close();
    const Q = await open('?view=hero&calm=1');
    await Q.page.evaluate(helpers);
    const calm = await Q.page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core, A = C.GROCERY.aisles[1];
      H.enter(); H.walk([[5.0, -0.6], [5.0, -2.4], [5.0, -0.4], [5.0, -2.4]]); H.until(() => false, 4);
      D.place(A.cx, A.zFront + 0.3, 0); H.until(() => false, 8); D.place(5.6, -2.47, -Math.PI / 2); H.until(() => false, 2);
      return { p1: D.horror().p1, p2: D.horror().p2, fired: D.horror().fired };
    });
    await Q.close();
    report.a5 = { p1, p1b, p2: { ...p2, black: p2b.black }, calm };
    const dur = p1b.last != null && p1.first != null ? p1b.last + 1 / 240 - p1.first : null;
    check('A5', 'P1 at the aisle end for 0.6 s from a flicker to a flicker; P2 0.8 s of black screen with a figure on it, nothing behind you; none in calm',
      p1.p && p1.flickerStart && p1.tubeAtStart && Math.abs(p1.first - p1.p.t0) <= 1 / 240 + 1e-9 && Math.abs(dur - 0.6) <= 2 / 240 && p1b.offAtEnd && p1.seen >= 1 &&
      p2.p && p2.px.state.reflect && p2.px.figure < 0.5 * p2.px.around && p2.px.mean < 40 && !p2.figures.counterOrWindow && !p2.figures.backroom && !p2.figures.aisle && !p2.dog && Math.abs(p2b.black - 0.8) <= 2 / 240 && p2b.after.state.snow === 1 &&
      calm.p1 === null && calm.p2 === null,
      `P1: looking down aisle ${p1.p && p1.p.aisle} from ${f2(p1.t0)} s; the figure drawn from ${f3(p1.first)} s (a tube flicker starts at ${f3(p1.p && p1.p.t0)}: ${p1.flickerStart}, tube off then ${p1.tubeAtStart}) for ${dur == null ? 'n/a' : dur.toFixed(3)} s, the tube off again as it goes ${p1b.offAtEnd}; ${p1.seen}/5 of its points in sight (drawn meshes); ` +
      `P2 at ${f2(p2.p && p2.p.t0)} s: screen mean ${p2.px.mean.toFixed(1)}, the figure ${p2.px.figure.toFixed(1)} against ${p2.px.around.toFixed(1)} around it, black with it for ${p2b.black.toFixed(3)} s, then snow ${p2b.after.state.snow === 1}; figures drawn ${JSON.stringify({ c: p2.figures.counterOrWindow, b: p2.figures.backroom, a: p2.figures.aisle })}, dog ${p2.dog ? 'in the shop' : 'gone'}; ` +
      `calm: P1 ${calm.p1}, P2 ${calm.p2}`);
  }

  // ---------- A6: the sounds of the grocery (planned gains, and what the nodes are really set to after real time has passed) ----------
  {
    const P = await open('?view=hero'), page = P.page;
    await page.keyboard.press('KeyX');
    await page.evaluate(helpers);
    const settle = async () => { await page.waitForTimeout(700); return page.evaluate(() => window.__diorama.audioGains()); };   // the beds glide (time constant 15-80 ms) on the audio clock
    await page.evaluate(() => { const D = window.__diorama, H = window.__H; H.enter(); H.walk([[5.0, -0.6]]); });   // in through the door: the hanging bell
    const G = {};
    for (const [k, x, z, yaw] of [['near', 6.55, -2.2, -Math.PI / 2], ['mid', 4.0, -1.5, 0], ['far', -1.8, -0.9, 0]]) { await page.evaluate(([x, z, yaw]) => window.__diorama.place(x, z, yaw), [x, z, yaw]); G[k] = await settle(); }
    await page.evaluate(() => window.__diorama.place(5.0, 2.6, 0)); G.out = await settle();
    // E2: step into its silence (the simulation stands still between steps), let the nodes settle, read; then past it
    const e2 = await page.evaluate(() => { const D = window.__diorama, H = window.__H, C = D.core; D.place(5.0, -0.6, 0); D.walkRoute([[5.0, -2.4], [5.0, -0.4], [5.0, -2.4], [5.0, -0.4]]); H.until(() => !!D.horror().e2, 15); D.stopWalk(); const t0 = D.horror().e2.t0; H.dt = 1 / 240; H.until(() => D.state().t >= t0 + C.E2_DARK + 0.4, 3); return { t0, at: D.state().t - t0, hum: D.levels().hum }; });
    G.quiet = await settle();
    const e2b = await page.evaluate(() => { const D = window.__diorama, H = window.__H, C = D.core, t0 = D.horror().e2.t0; H.until(() => D.state().t >= t0 + C.E2_TOTAL + 0.3, 3); return { at: D.state().t - t0, hum: D.levels().hum }; });
    G.back = await settle();
    const r = await page.evaluate(() => { const log = window.__diorama.audioLog() || []; return { bells: log.filter((x) => x.kind === 'bell').map((b) => ({ peak: b.peak, base: b.base, voice: b.voice })), crackles: log.filter((x) => x.kind === 'crackle').length, audio: window.__diorama.info().audio }; });
    await P.close();
    report.a6 = { G, e2, e2b, ...r };
    const beds = ['buzz', 'snow', 'freezer', 'awning', 'rain'], on = (g) => beds.every((k) => g.planned[k] > 0 && g.nodes && Math.abs(g.nodes[k] - g.planned[k]) <= 0.1 * g.planned[k] + 1e-4);
    const qz = G.quiet, nodes = (g) => beds.map((k) => k + ' ' + (g.nodes ? g.nodes[k].toFixed(3) : 'n/a')).join(', ');
    check('A6', 'sounds: buzz, TV snow (nearer = louder), freezer, rain on the awning and the hanging bell all play; in the E2 silence only the rain',
      r.audio === 'running' && on(G.mid) && on(G.near) && G.near.planned.snow > G.mid.planned.snow && G.mid.planned.snow > G.far.planned.snow && G.near.nodes.snow > G.far.nodes.snow &&
      G.out.planned.awning > G.far.planned.awning && r.bells.length > 0 && r.bells.every((b) => b.voice === 'hanging bell' && Math.abs(b.peak / b.base - 2) < 1e-6) &&
      e2.hum === 0 && qz.planned.buzz === 0 && qz.planned.snow === 0 && qz.planned.freezer === 0 && qz.nodes.buzz < 0.002 && qz.nodes.snow < 0.002 && qz.nodes.freezer < 0.002 && qz.planned.rain > 0 && qz.nodes.rain > 0.5 * qz.planned.rain && qz.planned.awning > 0 &&
      e2b.hum === 1 && on(G.back) && r.crackles > 0,
      `sound ${r.audio}; mid-shop planned buzz ${f3(G.mid.planned.buzz)}, snow ${f3(G.mid.planned.snow)}, freezer ${f3(G.mid.planned.freezer)}, awning ${f3(G.mid.planned.awning)}, rain ${f3(G.mid.planned.rain)}; the nodes after 0.7 s: ${nodes(G.mid)}; ` +
      `TV snow by distance (planned / node): ${f3(G.near.planned.snow)}/${f3(G.near.nodes.snow)} at the till, ${f3(G.mid.planned.snow)}/${f3(G.mid.nodes.snow)} mid-shop, ${f3(G.far.planned.snow)}/${f3(G.far.nodes.snow)} by the far wall; rain on the awning ${f3(G.out.planned.awning)} under it outside vs ${f3(G.far.planned.awning)} at the far wall; ` +
      `${r.bells.length} hanging-bell jingles at ${r.bells.length ? (r.bells[0].peak / r.bells[0].base).toFixed(2) : 'n/a'}x the bed; tube crackles played ${r.crackles}; ` +
      `E2 silence (+${e2.at.toFixed(2)} s): planned buzz/snow/freezer ${qz.planned.buzz}/${qz.planned.snow}/${qz.planned.freezer}, nodes ${nodes(qz)}; awning ${f3(qz.planned.awning)}; after it (+${e2b.at.toFixed(2)} s) all five back ${on(G.back)} (${nodes(G.back)})`);
  }

  // ---------- D2-D4: the stray dog in the page ----------
  {
    const P = await open('?view=hero'), page = P.page;
    await page.keyboard.press('KeyX');
    await page.evaluate(helpers);
    const r = await page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core, B = C.BACKDOOR;
      const obb = (d, b) => {
        const f = [-Math.sin(d.yaw), -Math.cos(d.yaw)], rr = [Math.cos(d.yaw), -Math.sin(d.yaw)], hl = C.DOG.len / 2, hw = C.DOG.wid / 2;
        const pts = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, c]) => [d.x + f[0] * hl * a + rr[0] * hw * c, d.z + f[1] * hl * a + rr[1] * hw * c]), bp = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
        for (const ax of [[1, 0], [0, 1], f, rr]) { const pa = pts.map((p) => p[0] * ax[0] + p[1] * ax[1]), pb = bp.map((p) => p[0] * ax[0] + p[1] * ax[1]); if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false; }
        return true;
      };
      H.enter(); H.walk(C.SCARE_PLAN.aisle);
      H.dt = 1 / 120; const W = (window.__dogW = { e3: null, hits: 0, gap: Infinity, frames: 0, growl: [], first: null });
      W.each = (st) => {
        const h = D.horror(), d = h.dogView;
        if (h.e3 && W.e3 === null) W.e3 = h.e3.t0;
        if (!d) return;
        W.frames++; W.gap = Math.min(W.gap, Math.hypot(d.x - st.player.x, d.z - st.player.z));
        const boxes = D.solids().filter((s) => s.kind !== 'roof' && s.y1 > C.SIDEWALK_H + 0.05 && s.y0 < C.SIDEWALK_H + 0.6 && (s.kind !== 'door' || s.active)).map((s) => [s.x0, s.z0, s.x1, s.z1]);
        for (const lf of C.doorLeaves(st.doors).filter((l) => l.door === 0)) boxes.push([lf.x0, lf.z0, lf.x1, lf.z1]);
        const hit = boxes.find((b) => obb(d, b)); if (hit) { W.hits++; if (!W.first) W.first = { t: st.t, b: hit, d: { ...d } }; }
        if (d.phase === 'growl') { const g = D.info().dog; W.growl.push({ dev: g ? Math.abs(C.wrapAngle(g.drawnYaw - Math.atan2(-(B.cx - g.at[0]), -(B.cz - g.at[1])))) * 180 / Math.PI : 999, low: g ? g.drawnLow : 0, drawn: !!g, t: st.t, x: d.x, z: d.z }); }
      };
      H.each = W.each;
      H.until(() => D.horror().dogView && D.horror().dogView.phase === 'growl' && D.state().t >= D.horror().dog.log.find((x) => x.phase === 'growl').t + 1.2, 30);
      const dv = D.horror().dogView;
      // from behind it and to one side (2.2 m away, outside the 2 m at which it would run, and clear of its way out): the dog in
      // front, the staff door beyond it
      const cx = dv.x - 2.0, cz = dv.z + 1.0, lx = dv.x + 0.25 * (B.cx - dv.x), lz = dv.z + 0.25 * (B.cz - dv.z);   // aimed a quarter of the way from it to the door
      D.place(cx, cz, Math.atan2(-(lx - cx), -(lz - cz))); D.lookAt(lx, 0.55, lz); for (let i = 0; i < 30; i++) H.step();
      H.each = null;
      const { e3, hits, gap, frames, growl, first } = W;
      return { e3, dog0: D.horror().dog.t0, hits, gap, frames, growl, first, at: [dv.x, dv.z] };
    });
    await page.evaluate(() => window.__diorama.ui(true)); await page.screenshot({ path: shot('D3-dog-growl') });
    const r2 = await page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core, W = window.__dogW; H.dt = 1 / 120; H.each = W.each;
      D.lookAt(...C.SCARE_PLAN.behind);   // turned away from the staff door while the dog leaves: only the dog holds the staff door back
      H.until(() => D.horror().dog && D.horror().dog.closedAt !== null && D.state().t >= D.horror().dog.closedAt + 0.3, 20); H.each = null;
      const watch = { hits: W.hits, gap: W.gap, frames: W.frames, first: W.first };
      H.look(C.SCARE_PLAN.behind); H.until(() => D.horror().wideAt != null, 6); H.until(() => (D.audioLog() || []).some((x) => x.kind === 'knock'), 3);
      const dog = D.horror().dog, log = D.audioLog() || [], kinds = log.filter((x) => ['paw', 'shake', 'growl', 'whimper', 'knock'].includes(x.kind)).map((x) => ({ kind: x.kind, t: x.simT, peak: x.peak, base: x.base }));
      return { watch, wideAt: D.horror().wideAt - dog.t0, log: dog.log.map((x) => x.phase + '@' + (x.t - dog.t0).toFixed(2)), goneAt: dog.goneAt - dog.t0, closedAt: dog.closedAt - dog.t0, t0: dog.t0, kinds, doorK: D.state().doors[0].k };
    });
    await P.close();
    const Q = await open('?view=hero&calm=1');
    await Q.page.keyboard.press('KeyX');
    await Q.page.evaluate(helpers);
    const c = await Q.page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core; H.enter(); H.walk(C.SCARE_PLAN.aisle);
      H.until(() => D.horror().dogView && D.horror().dogView.phase === 'sniff' && D.state().t >= D.horror().dog.log.find((x) => x.phase === 'sniff').t + 0.6, 40);
      const sw = []; for (let i = 0; i < 48; i++) { D.step(1 / 240, 1); const g = D.info().dog; if (g) sw.push(g.tailSwing); }   // the drawn tail over 0.2 s
      const dv = D.horror().dogView, cx = dv.x - 2.0, cz = dv.z - 0.6;
      D.place(cx, cz, Math.atan2(-(dv.x - cx), -(dv.z - cz))); D.lookAt(dv.x, 0.4, dv.z); for (let i = 0; i < 60; i++) D.step(1 / 240, 1);   // turned to face it from the start
      return { tail: dv.tail, phase: dv.phase, drawn: !!D.info().dog, swing: sw.length ? Math.max(...sw) - Math.min(...sw) : 0 };
    });
    await Q.page.screenshot({ path: shot('D4-calm-dog') });
    const c2 = await Q.page.evaluate(() => { const D = window.__diorama, H = window.__H; H.until(() => D.horror().dog && D.horror().dog.goneAt !== null, 15); H.until(() => false, 20); return { kinds: (D.audioLog() || []).map((x) => x.kind), phases: D.horror().dog.log.map((x) => x.phase), dogs: D.horror().dog.t0 }; });
    await Q.close();
    report.dog = { r, r2, c, c2 };
    const order = ['paw', 'shake', 'growl', 'whimper'].map((k) => { const x = r2.kinds.find((y) => y.kind === k); return x ? x.t : null; }), knock = r2.kinds.find((x) => x.kind === 'knock');
    const maxDev = r.growl.length ? Math.max(...r.growl.map((g) => g.dev)) : null;
    const wt = r2.watch;
    check('D2', 'the dog: footprint never in a wall, shelf or door leaf, always >= 1.2 m from the walker (in the page)', wt.frames > 0 && wt.hits === 0 && wt.gap >= 1.2 && Math.abs(r.dog0 - r.e3) < 1e-9,
      `dog came in with E3 (${f2(r.e3)} s, dog at ${f2(r.dog0)} s); ${wt.frames} frames from the door opening until it had shut behind the dog: footprint overlapping a wall, shelf, crate or door leaf on ${wt.hits}${wt.first ? ' (first ' + JSON.stringify(wt.first) + ')' : ''}, closest to the walker ${wt.gap.toFixed(2)} m`);
    check('D3', 'growling at the staff door (as drawn): head within 15 deg of it, body lowered; picture D3-dog-growl', r.growl.length > 0 && maxDev < 15 && r.growl.every((g) => g.drawn) && r.growl.filter((g) => g.t - r.growl[0].t > 0.3).every((g) => g.low >= 0.099),
      `${r.growl.length} growl frames, the drawn head (tail -> head on the meshes) at most ${maxDev == null ? 'n/a' : maxDev.toFixed(2)} deg off the staff door, body lowered ${r.growl.length ? r.growl[r.growl.length - 1].low.toFixed(3) : 'n/a'} m; standing at (${r.at.map((v) => v.toFixed(2)).join(', ')})`);
    check('D4', 'dog sounds in order (paws, shake, growl, whimper), knocking only after it has gone; calm: no growl, tail wagging; once a visit',
      order.every((v) => v != null) && order[0] < order[1] && order[1] < order[2] && order[2] < order[3] && knock && knock.t > r2.t0 + r2.closedAt && r2.wideAt >= r2.closedAt - 1e-9 && r2.doorK === 0 &&
      c.tail === 'wag' && c.drawn && c.swing > 0.5 && !c2.kinds.includes('growl') && !c2.kinds.includes('whimper') && c2.kinds.includes('paw') && c2.kinds.includes('shake') && c2.phases.join(',') === 'enter,shake,walk,turn,sniff,out,gone',
      `phases ${r2.log.join(' ')}; door shut again at +${r2.closedAt.toFixed(2)} s (k ${r2.doorK}); turned away from the staff door meanwhile, it went wide at +${r2.wideAt.toFixed(2)} s; first paw/shake/growl/whimper at +${order.map((v) => (v == null ? 'n/a' : (v - r2.t0).toFixed(2))).join('/')} s; first knock at +${knock ? (knock.t - r2.t0).toFixed(2) : 'n/a'} s; ` +
      `calm: phases ${c2.phases.join(',')}, tail ${c.tail} while sniffing (the drawn tail swings through ${c.swing.toFixed(2)} rad in 0.2 s), sounds ${[...new Set(c2.kinds)].join(',')} (no growl, no whimper)`);
  }

  // ---------- pictures: dark, narrow, can't see it all (entrance, mid-aisle, at the TV, at the staff door) and the grocery from outside ----------
  {
    const P = await open('?view=hero'), page = P.page;
    await page.evaluate(helpers);
    const views = [['G-entrance', [5.0, -0.2], [2.0, 1.4, -5.0]], ['G-aisle', [0.8 + 0.525, -4.0], [1.33, 1.5, -7.5]], ['G-tv', [5.9, -2.4], [7.1, 1.3, -2.47]], ['G-backdoor', [6.3, -5.9], [6.5, 1.2, -8.6]]];
    await page.evaluate(() => { const D = window.__diorama, H = window.__H; D.enter('door'); H.until(() => D.state().mode === 'walk', 10); });
    for (const [name, [x, z], look] of views) {
      await page.evaluate(([x, z, look]) => { const D = window.__diorama; D.place(x, z, 0); D.lookAt(...look); for (let i = 0; i < 120; i++) D.step(1 / 60, 1); }, [x, z, look]);
      await page.evaluate(() => window.__diorama.ui(true)); await page.screenshot({ path: shot(name) });
    }
    await P.close();
    const Q = await open('?view=hero');
    await Q.page.evaluate(() => { const D = window.__diorama, C = D.core, q = D.toScreen(7.0, 1.6, 0.5); D.rotate(0.35, -0.1); const q2 = D.toScreen(6.2, 1.6, 0.5); D.zoomAt(0.45, q2[0] / innerWidth, q2[1] / innerHeight); });
    await Q.page.waitForTimeout(400); await Q.page.screenshot({ path: shot('G-outside') });
    await Q.close();
    const lum = {};
    for (const [name] of views.concat([['G-outside']])) lum[name] = await lumStats(shot(name));
    report.pictures = lum;
    console.log('        pictures: ' + Object.entries(lum).map(([k, v]) => `${k} mean ${v.mean.toFixed(1)}, bright 10% ${v.top.toFixed(0)} / dark half ${v.bottom.toFixed(1)}`).join('; '));
  }

  // ======================= 第九轮：夜班须知、脚印与抬头的结局 (SPEC 第九轮 N1-N8) =======================
  const NOTE_WORDS = ['夜班须知', '1. 灯灭的时候，站着别动。', '2. 门自己开了，就当没看见。', '3. 不要盯着电视超过十秒。', '4. 后面那扇门有人敲，不要过去。', '5. 下班前，记得看一眼橱窗。'];
  // ---------- N1: the opening card ----------
  {
    const P = await open('', { keepCard: true }), page = P.page;
    await page.waitForTimeout(300);
    const c0 = await page.evaluate(() => window.__diorama.card()), s0 = await page.evaluate(() => { const S = window.__diorama.state(); return JSON.stringify({ o: S.orbit, m: S.mode, s: S.s, z: S.z }); });
    await page.screenshot({ path: shot('N1-card-desktop') });
    // everything a visitor might try before closing it: drag, wheel, keys
    await page.mouse.move(300, 300); await page.mouse.down(); await page.mouse.move(520, 340, { steps: 8 }); await page.mouse.up();
    await page.mouse.move(640, 360); await page.mouse.wheel(0, -600); await page.waitForTimeout(150);
    for (const k of ['KeyW', 'ArrowLeft', 'KeyQ', 'Escape', 'Space', 'KeyF', 'Enter']) await page.keyboard.press(k);
    await page.waitForTimeout(400);
    const s1 = await page.evaluate(() => { const S = window.__diorama.state(); return JSON.stringify({ o: S.orbit, m: S.mode, s: S.s, z: S.z }); }), a1 = await page.evaluate(() => window.__diorama.info().audio), c1 = await page.evaluate(() => window.__diorama.card().open);
    await page.mouse.click(640, 120); await page.waitForTimeout(250);
    const c2 = await page.evaluate(() => ({ card: window.__diorama.card().open, audio: window.__diorama.info().audio }));
    await page.mouse.move(640, 360); await page.mouse.wheel(0, -400); await page.waitForTimeout(300);
    const s2 = await page.evaluate(() => { const S = window.__diorama.state(); return JSON.stringify({ o: S.orbit, m: S.mode, s: S.s, z: S.z }); });
    await P.close();
    // the link to the calm version, followed for real
    const L = await open('', { keepCard: true });
    const box = await L.page.evaluate(() => { const r = document.querySelector('#card a').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await Promise.all([L.page.waitForNavigation(), L.page.mouse.click(box[0], box[1])]);
    await L.page.waitForFunction(() => window.__diorama && window.__diorama.ready, null, { polling: 100 });
    const calm = await L.page.evaluate(() => ({ search: location.search, card: window.__diorama.card(), calm: window.__diorama.horror().calm }));
    await L.close();
    const V = await open('?view=hero', { keepCard: true }), cv = await V.page.evaluate(() => window.__diorama.card()); await V.close();
    const Ph = await open('', { width: 390, height: 844, dpr: 3, touch: true, keepCard: true });
    await Ph.page.waitForTimeout(300);
    const cp = await Ph.page.evaluate(() => ({ card: window.__diorama.card(), sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight }));
    await Ph.page.screenshot({ path: shot('N1-card-phone') });
    await Ph.page.touchscreen.tap(195, 120); await Ph.page.waitForTimeout(250);
    const cp2 = await Ph.page.evaluate(() => ({ card: window.__diorama.card().open, audio: window.__diorama.info().audio }));
    await Ph.close();
    report.n1 = { c0, c1, a1, c2, calm, cv, cp, cp2, same: s0 === s1, moved: s2 !== s1 };
    const inBox = (b, w, h) => b[0] >= 0 && b[1] >= 0 && b[2] <= w && b[3] <= h;
    check('N1', 'opening card: shown on the normal entry; drag, wheel and keys do nothing until it is closed; one click closes it and starts the sound; the calm link; not on fixed views; whole on 390x844',
      c0.open && /深夜杂货店/.test(c0.text) && /建议戴耳机、关灯玩/.test(c0.text) && /放大，走进去/.test(c0.text) && c0.linkText === '不敢玩？安心版' && c0.link === '?calm=1' &&
      s0 === s1 && c1 && a1 === 'not started' && !c2.card && c2.audio === 'running' && s2 !== s1 &&
      calm.search === '?calm=1' && calm.calm && /安心版：不会有吓人的东西/.test(calm.card.text) && calm.card.link === '?' && !cv.shown &&
      cp.card.open && inBox(cp.card.box, cp.iw, cp.ih) && cp.sw <= cp.iw && !cp2.card && cp2.audio === 'running',
      `card "${c0.text.replace(/\n+/g, ' / ')}", link ${c0.link}; drag + wheel + W, ←, Q, Esc, Space, F, Enter with it up: scene unchanged ${s0 === s1}, card still up ${c1}, sound ${a1}; ` +
      `one click: card ${c2.card ? 'still up' : 'gone'}, sound ${c2.audio}; a wheel notch after that zooms ${s2 !== s1}; link clicked -> ${calm.search}, calm ${calm.calm}, card "${calm.card.text.replace(/\n+/g, ' / ')}" (link back ${calm.card.link}); ?view=hero: card ${cv.shown}; ` +
      `390x844: box ${cp.card.box.map((v) => v.toFixed(0)).join(',')} inside ${cp.iw}x${cp.ih} ${inBox(cp.card.box, cp.iw, cp.ih)}, scrollWidth ${cp.sw}; one tap -> card ${cp2.card ? 'up' : 'gone'}, sound ${cp2.audio}`);
  }

  // ---------- N2: the note on the till ----------
  {
    const goNote = (page) => page.evaluate(() => { const D = window.__diorama, q = D.core.notePoint(); D.enter('door'); for (let i = 0; i < 900 && D.state().mode !== 'walk'; i++) D.step(1 / 60, 1);
      D.place(6.3, -1.9, -Math.PI / 2); D.lookAt(...q); for (let i = 0; i < 150; i++) D.step(1 / 60, 1); return D.note(); });
    const P = await open(''), page = P.page;
    const n0 = await goNote(page);
    await page.waitForTimeout(150);
    const ns = await page.evaluate(() => window.__diorama.noteScreen());
    await page.mouse.click(ns[0], ns[1]); await page.waitForTimeout(150);
    const byClick = await page.evaluate(() => window.__diorama.note());
    await page.screenshot({ path: shot('N2-note-desktop') });
    await page.mouse.click(200, 650); await page.waitForTimeout(150);
    const closedByClick = !(await page.evaluate(() => window.__diorama.note().open));
    const hb = (await page.evaluate(() => window.__diorama.note())).hintBox;
    await page.mouse.click((hb[0] + hb[2]) / 2, (hb[1] + hb[3]) / 2); await page.waitForTimeout(150);
    const byHint = await page.evaluate(() => window.__diorama.note().open);
    await page.keyboard.press('KeyF'); const closedByF = !(await page.evaluate(() => window.__diorama.note().open));
    await page.keyboard.press('KeyF'); const byF = await page.evaluate(() => window.__diorama.note().open);
    await page.keyboard.press('Enter'); const closedByEnter = !(await page.evaluate(() => window.__diorama.note().open));
    await page.keyboard.press('KeyF'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const esc = await page.evaluate(() => ({ open: window.__diorama.note().open, mode: window.__diorama.state().mode }));
    const far = await page.evaluate(() => { const D = window.__diorama; D.place(4.2, -1.9, -Math.PI / 2); D.lookAt(...D.core.notePoint()); for (let i = 0; i < 120; i++) D.step(1 / 60, 1); return D.note(); });
    await P.close();
    const T = await open('', { width: 390, height: 844, dpr: 3, touch: true }), tp = T.page;
    const t0 = await goNote(tp);
    const ts = await tp.evaluate(() => window.__diorama.noteScreen());
    await tp.touchscreen.tap(ts[0], ts[1]); await tp.waitForTimeout(200);
    const tOpen = await tp.evaluate(() => window.__diorama.note());
    await tp.screenshot({ path: shot('N2-note-phone') });
    await T.close();
    const Cm = await open('?calm=1'), cn = await goNote(Cm.page); await Cm.page.keyboard.press('KeyF'); const cOpen = await Cm.page.evaluate(() => window.__diorama.note()); await Cm.close();
    report.n2 = { n0, byClick, closedByClick, byHint, closedByF, byF, closedByEnter, esc, far, t0, tOpen, cOpen };
    const tilt = (m) => { const v = m.match(/matrix\(([^)]+)\)/); if (!v) return 0; const [a, b] = v[1].split(',').map(Number); return (Math.atan2(b, a) * 180) / Math.PI; };
    check('N2', 'the note: hint within reach when looking at it; opened by clicking it, its hint or F; words exactly as in the SPEC; closed by a click, F or Enter; Esc only closes it; >= 16 px and whole on 390x844; calm: today\'s special',
      n0.hint && n0.hintText === '收银台上有张纸条 · 点它或按 F 看看' && byClick.open && JSON.stringify(byClick.lines) === JSON.stringify(NOTE_WORDS) && closedByClick && byHint && closedByF && byF && closedByEnter && !esc.open && esc.mode === 'walk' && !far.hint &&
      t0.hint && t0.hintText === '收银台上有张纸条 · 点它看看' && tOpen.open && tOpen.fontPx >= 16 && tOpen.box[0] >= 0 && tOpen.box[1] >= 0 && tOpen.box[2] <= 390 && tOpen.box[3] <= 844 && /Kaiti SC/.test(tOpen.font) && Math.abs(tilt(tOpen.transform)) > 1 &&
      JSON.stringify(cOpen.lines) === JSON.stringify(['今日特价：汽水两块']) && cOpen.open,
      `0.94 m from it, looking at it: hint "${n0.hintText}"; click on the note -> open ${byClick.open}, lines ${JSON.stringify(byClick.lines)} (match ${JSON.stringify(byClick.lines) === JSON.stringify(NOTE_WORDS)}); click -> closed ${closedByClick}; click on the hint -> open ${byHint}; F -> closed ${closedByF}; F -> open ${byF}; Enter -> closed ${closedByEnter}; ` +
      `F then Esc -> note ${esc.open ? 'open' : 'closed'}, still ${esc.mode}; 3.0 m away: hint ${far.hint}; 390x844 touch: hint "${t0.hintText}", tap on the note -> open ${tOpen.open}, smallest font ${tOpen.fontPx} px, paper ${tOpen.box.map((v) => v.toFixed(0)).join(',')}, font ${tOpen.font}, tilted ${tilt(tOpen.transform).toFixed(1)} deg; calm: ${JSON.stringify(cOpen.lines)}`);
  }

  // ---------- N3: rule 1 in the page (pictures at 3.0, 2.0, 1.2 m) ----------
  {
    const P = await open('?view=hero'), page = P.page;
    await page.keyboard.press('KeyX');
    await page.evaluate(helpers);
    const figAt = async (name) => {
      const r = await page.evaluate(() => { const D = window.__diorama, i = D.info(), st = D.state(), f = D.levels().rule1, C = D.core, F = C.SIDEWALK_H, hf = C.HORROR.figure;
        const v = f ? D.visibility([[f.x, F + hf.h - hf.headR, f.z], [f.x, F + 0.85, f.z]]) : [];
        return { f, drawn: i.figures.warn, at: i.figures.warnAt, d: f ? Math.hypot(f.x - st.player.x, f.z - st.player.z) : null, v, t: st.t }; });
      await page.evaluate(() => window.__diorama.ui(false)); await page.screenshot({ path: shot(name) }); await page.evaluate(() => window.__diorama.ui(true));
      return r;
    };
    // E2 while walking (the first time)
    await page.evaluate(() => { const D = window.__diorama, H = window.__H; H.enter(); D.walkRoute([[5.0, -0.6], [5.0, -2.4], [5.0, -0.4], [5.0, -2.4], [5.0, -0.4]]); H.dt = 1 / 240; H.until(() => !!D.horror().e2, 20); const e2 = D.horror().e2.t0; H.until(() => D.state().t >= e2 + D.core.E2_TOTAL + 0.1, 4); });
    const f1 = await figAt('N3-figure-3.0m');
    const stay = await page.evaluate(() => { const D = window.__diorama, H = window.__H, f = D.levels().rule1; let last = null, flick = false; H.each = (st) => { if (D.info().figures.warn) last = st.t; else if (last !== null && !flick && st.t < f.t1 + 0.02) flick = D.levels().tube === 0; }; H.until(() => D.state().t >= f.t1 + 0.05, 8); H.each = null; return { t0: f.t0, t1: f.t1, last, flick }; });
    // E3 from 3 m in, then the two short blackouts, walking 1 m in each
    await page.evaluate(() => { const D = window.__diorama, H = window.__H; H.dt = 1 / 60; D.walkRoute([[4.5, -3.0]]); H.until(() => !D.state().player.walking, 10); D.lookAt(4.5, 1.6, -7); H.until(() => !!D.horror().e3, 20); });
    const shots3 = [];
    for (const [i, name] of [[0, 'N3-figure-2.0m'], [1, 'N3-figure-1.2m']]) {
      await page.evaluate((i) => { const D = window.__diorama, H = window.__H; H.dt = 1 / 240; const b = D.horror().blackouts.filter((x) => x.kind === 'short')[i]; H.until(() => D.state().t >= b.start + 0.05, 40); D.walkTo(4.5, -4.0); H.until(() => D.state().t >= b.end + 0.1, 3); }, i);
      shots3.push(await figAt(name));
      await page.evaluate(() => { const D = window.__diorama, H = window.__H; H.dt = 1 / 60; D.walkTo(4.5, -3.0); H.until(() => !D.state().player.walking, 5); D.lookAt(4.5, 1.6, -7); H.until(() => !D.state().player.looking, 3); });
    }
    await P.close();
    // standing still in E2's dark: nothing but a breath
    const Q = await open('?view=hero'), q = Q.page;
    await q.keyboard.press('KeyX');
    await q.evaluate(helpers);
    const still = await q.evaluate(() => { const D = window.__diorama, H = window.__H; H.enter(); D.walkRoute([[5.0, -0.6], [5.0, -2.4], [5.0, -0.4], [5.0, -2.4], [5.0, -0.4]]); H.dt = 1 / 240; H.until(() => !!D.horror().e2, 20); D.stopWalk(); const e2 = D.horror().e2.t0; let drawn = 0; H.each = () => { if (D.info().figures.warn) drawn++; }; H.until(() => D.state().t >= e2 + D.core.E2_TOTAL + 2, 6); H.each = null;
      return { drawn, log: D.horror().rule1.log, breath: (D.audioLog() || []).filter((x) => x.kind === 'breath') }; });
    await Q.close();
    const all = [f1, ...shots3];
    report.n3 = { all, stay, still };
    const okF = (r, want) => r.f && r.drawn && Math.abs(r.d - want) <= 0.2 + 1e-9 && r.v.every((x) => x.inFrustum !== undefined) && !r.v[0].blockedBy && !r.v[1].blockedBy && r.v[0].inFrustum;
    check('N3', 'rule 1 in the page: moving in the dark brings the figure 3.0 / 2.0 / 1.2 m ahead (drawn, its head and middle not blocked), for >= 1.2 s, gone at a flicker; standing still: no figure, a breath',
      okF(all[0], 3.0) && okF(all[1], 2.0) && okF(all[2], 1.2) && stay.last + 1 / 240 - stay.t0 >= 1.2 - 1e-6 && stay.flick && still.drawn === 0 && !still.log[0].figure && still.breath.length === 1,
      all.map((r, k) => `${['E2', 'short 1', 'short 2'][k]}: figure drawn ${r.drawn} ${r.d == null ? 'n/a' : r.d.toFixed(2)} m ahead at (${r.at ? r.at.map((v) => v.toFixed(2)).join(', ') : '-'}), head ${r.v[0] ? (r.v[0].inFrustum ? 'on screen' : 'off screen') + ', blocked by ' + (r.v[0].blockedBy || 'nothing') : 'n/a'}, middle blocked by ${r.v[1] ? r.v[1].blockedBy || 'nothing' : 'n/a'}`).join('; ') +
      `; the first drawn from ${stay.t0.toFixed(3)} to ${(stay.last + 1 / 240).toFixed(3)} s (${(stay.last + 1 / 240 - stay.t0).toFixed(2)} s), the tube off as it went ${stay.flick}; standing still: moved ${still.log[0].moved.toFixed(3)} m, figure drawn on ${still.drawn} frames, breaths played ${still.breath.length}`);
  }

  // ---------- N4: the wet footprints in the page (contrast with no sound, the dog's growl, the knocking) ----------
  {
    const P = await open('?view=hero'), page = P.page;
    await page.keyboard.press('KeyX');
    await page.evaluate(helpers);
    const r = await page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core; H.enter(); H.walk(C.SCARE_PLAN.aisle); H.dt = 1 / 120;
      H.until(() => !!D.horror().e3, 15);
      const t3 = D.horror().e3.t0, growl = [];
      H.each = (st) => { const g = D.info().dog, L = D.levels(); if (g && g.phase === 'growl') { const n = L.foot[L.foot.length - 1]; growl.push(Math.abs(C.wrapAngle(g.drawnYaw - Math.atan2(-(n.x - g.at[0]), -(n.z - g.at[1])))) * 180 / Math.PI); } };
      H.until(() => D.horror().dogView && D.horror().dogView.phase === 'growl' && D.state().t >= D.horror().dog.log.find((x) => x.phase === 'growl').t + 1.0, 20);
      H.each = null;
      const dv = D.horror().dogView, n = D.levels().foot.slice(-1)[0];
      // the growl picture: from behind the dog and to one side, the newest prints beyond it
      const cx = dv.x - 2.0, cz = dv.z + 1.0; D.place(cx, cz, Math.atan2(-(n.x - cx), -(n.z - cz))); D.lookAt((dv.x + n.x) / 2, 0.4, (dv.z + n.z) / 2); for (let i = 0; i < 30; i++) D.step(1 / 240, 1);
      return { t3, growl: growl.slice(), dog: { x: dv.x, z: dv.z }, newest: n.i };
    });
    await page.evaluate(() => window.__diorama.ui(false)); await page.screenshot({ path: shot('N4-dog-growl-at-footprints') });
    // the whole trail, once it has reached the staff door: from just inside the door looking down the shop
    const tr = await page.evaluate(() => { const D = window.__diorama, H = window.__H, C = D.core, t3 = D.horror().e3.t0; H.dt = 1 / 120;
      H.until(() => D.state().t >= t3 + C.FOOT_ARRIVE + 0.3, 10); D.place(4.4, -0.3, 0); D.lookAt(6.0, 0.0, -5.4); for (let i = 0; i < 30; i++) D.step(1 / 240, 1);
      // where each print is on screen (its four corners), so only its own pixels are read (the TV's snow moves between frames)
      // only prints in front of the camera and wholly on screen (one behind the camera projects to a mirrored box that can land on the TV)
      const cam = D.info().camera, fw = [6.0 - cam[0], 0.0 - cam[1], -5.4 - cam[2]];
      const boxes = D.levels().foot.filter((f) => (f.x - cam[0]) * fw[0] + (C.SIDEWALK_H - cam[1]) * fw[1] + (f.z - cam[2]) * fw[2] > 0.3).map((f) => { const c = Math.cos(f.yaw), s = Math.sin(f.yaw), hw = C.FOOT.wid / 2, hl = C.FOOT.len / 2;
        const pts = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => D.toScreen(f.x + a * hw * c - b * hl * s, C.SIDEWALK_H + 0.006, f.z - a * hw * s - b * hl * c));   // right (cos, -sin), forward (-sin, -cos)
        return [Math.min(...pts.map((p) => p[0])) - 2, Math.min(...pts.map((p) => p[1])) - 2, Math.max(...pts.map((p) => p[0])) + 2, Math.max(...pts.map((p) => p[1])) + 2]; }).filter((bx) => bx[0] >= 0 && bx[1] >= 0 && bx[2] <= innerWidth && bx[3] <= innerHeight);
      return { n: D.levels().foot.length, drawn: D.info().foot, boxes }; });
    await page.waitForTimeout(250);
    const withF = await page.screenshot(); await page.evaluate(() => window.__diorama.hideFoot(true)); await page.waitForTimeout(250);
    const noF = await page.screenshot(); await page.evaluate(() => window.__diorama.hideFoot(false)); await page.waitForTimeout(150);
    fs.writeFileSync(shot('N4-footprints'), withF);
    const con = await calc.evaluate(async ({ a, b, boxes }) => {
      const load = async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return { d: g.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height }; };
      const A = await load(a), B = await load(b), Y = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], seen = new Uint8Array(A.W * A.H);
      let n = 0, sa = 0, sb = 0, inBoxes = 0;
      for (const bx of boxes) for (let y = Math.max(0, Math.floor(bx[1])); y < Math.min(A.H, Math.ceil(bx[3])); y++) for (let x = Math.max(0, Math.floor(bx[0])); x < Math.min(A.W, Math.ceil(bx[2])); x++) {
        const p = y * A.W + x; if (seen[p]) continue; seen[p] = 1; inBoxes++; const i = 4 * p; if (Math.abs(Y(A.d, i) - Y(B.d, i)) > 6) { n++; sa += Y(A.d, i); sb += Y(B.d, i); } }
      return { n, inBoxes, prints: sa / n, floor: sb / n, ratio: sa / sb };
    }, { a: withF.toString('base64'), b: noF.toString('base64'), boxes: tr.boxes });
    // the knocking and the fading, from here on (turned away so the staff door may go wide)
    const k = await page.evaluate(() => { const D = window.__diorama, H = window.__H, C = D.core, t3 = D.horror().e3.t0; D.lookAt(...C.SCARE_PLAN.behind); H.dt = 1 / 60;
      H.until(() => (D.audioLog() || []).some((x) => x.kind === 'knock'), 25);
      const kn = (D.audioLog() || []).find((x) => x.kind === 'knock'), h = D.horror(), wet = (D.audioLog() || []).filter((x) => x.kind === 'wetstep');
      H.until(() => D.state().t >= t3 + 21.3, 30); const at21 = D.levels().foot.length;
      H.until(() => D.state().t >= t3 + C.FOOT_ARRIVE + 21.2, 30);
      return { knock: kn.simT - t3, wide: h.wideAt - t3, dogClosed: h.dog.closedAt - t3, arrive: C.FOOT_ARRIVE, wet: wet.length, at21, end: D.levels().foot.length, drawnEnd: D.info().foot }; });
    await P.close();
    report.n4 = { r, tr, con, k };
    const maxDev = Math.max(...r.growl);
    check('N4', 'wet footprints: the whole trail drawn to the staff door, >= 25% darker than the floor (no sound needed); the dog growls at the newest (< 20 deg, as drawn); knocking after they arrive and the dog has gone, by E3+20 s; faded after 20 s',
      tr.n === 14 && tr.drawn === 14 && tr.boxes.length >= 8 && con.n > 100 && con.ratio <= 0.75 && r.growl.length > 0 && maxDev < 20 && k.wet === 14 && k.knock > k.arrive && k.knock > k.dogClosed && k.knock <= 20 + 1e-6 && k.at21 === 13 && k.end === 0 && k.drawnEnd === 0,
      `trail: ${tr.n} prints, ${tr.drawn} drawn; inside the boxes of the ${tr.boxes.length} wholly on screen in front of the camera (needs >= 8; ${con.inBoxes} px) ${con.n} pixels changed by them, mean ${con.prints.toFixed(1)} against the floor's ${con.floor.toFixed(1)} = ${(100 * con.ratio).toFixed(1)}% (needs <= 75%); ` +
      `growl: ${r.growl.length} frames, the drawn head at most ${maxDev.toFixed(2)} deg off the newest print (print ${r.newest} at the end); wet steps played ${k.wet}; staff door wide at E3+${k.wide.toFixed(2)} s, first knock E3+${k.knock.toFixed(2)} s (last print E3+${k.arrive}, dog's door shut E3+${k.dogClosed.toFixed(2)}); ` +
      `prints left at E3+21.3 s ${k.at21}, 21 s after the last ${k.end} (drawn ${k.drawnEnd})`);
  }

  // ---------- N5: the ending (the figure behind the window looks up at you) ----------
  {
    const P = await open('?view=hero'), page = P.page;
    await page.keyboard.press('KeyX');
    await page.evaluate(helpers);
    await page.evaluate(() => { const D = window.__diorama, H = window.__H; H.enter(); H.aisle(); H.e3(); H.staff(); H.bang(); H.leave(); });
    const gazeNow = () => page.evaluate(() => { const D = window.__diorama, i = D.info(), e = i.figures.endHead, c = i.camera; if (!e) return { dev: 999, pitch: 0, mode: D.state().mode, missing: true };
      const d = [c[0] - e.pos[0], c[1] - e.pos[1], c[2] - e.pos[2]], L = Math.hypot(...d);
      return { mode: D.state().mode, dev: (Math.acos(Math.min(1, (e.dir[0] * d[0] + e.dir[1] * d[1] + e.dir[2] * d[2]) / L)) * 180) / Math.PI, pitch: e.pitch, pose: D.levels().end, t: D.state().t, fired: D.horror().fired.END, e5: D.horror().fired.E5 }; });
    const g0 = await gazeNow();
    const turn = await page.evaluate(() => { const D = window.__diorama, H = window.__H, C = D.core; H.dt = 1 / 240; const seen0 = D.horror().end.seen, t0 = D.state().t; let gaps = 0;
      H.each = () => { if (D.horror().fired.END == null && !D.horror().end.seen) gaps++; };
      H.until(() => D.horror().fired.END != null, 6); H.each = null; const t = D.horror().fired.END; H.until(() => D.state().t >= t + C.ENDING.turn, 3); return { t, t0, seen0, gaps, drone: (D.audioLog() || []).filter((x) => x.kind === 'drone').length }; });
    // closer to the shop, and from two different angles
    const pics = [];
    for (const [name, rot] of [['N5-ending-angle1', [0.35, 0.05]], ['N5-ending-angle2', [-0.7, -0.05]]]) {
      await page.evaluate(([a, b]) => { const D = window.__diorama; D.rotate(a, b); for (let i = 0; i < 120; i++) D.step(1 / 240, 1); }, rot);   // (no zoom: the exit leaves the camera at the entry orbit, already close; nearer would start an entry)
      await page.waitForTimeout(250);
      pics.push(await gazeNow());
      await page.evaluate(() => window.__diorama.ui(false)); await page.screenshot({ path: shot(name) });
      const c = await page.evaluate(() => { const D = window.__diorama, C = D.core, sp = C.HORROR.spots.window, a = D.toScreen(sp.x - 0.5, 2.4, sp.z), b = D.toScreen(sp.x + 0.5, 0.3, sp.z); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; });
      const png = await page.screenshot({ clip: { x: Math.max(0, c[0]), y: Math.max(0, c[1]), width: Math.min(1280 - Math.max(0, c[0]), c[2] - c[0]), height: Math.min(720 - Math.max(0, c[1]), c[3] - c[1]) } });
      const big = await calc.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const k = 4, cv = document.createElement('canvas'); cv.width = img.naturalWidth * k; cv.height = img.naturalHeight * k; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, cv.width, cv.height); return cv.toDataURL('image/png').split(',')[1]; }, png.toString('base64'));
      fs.writeFileSync(shot(name + '-4x'), Buffer.from(big, 'base64'));
      await page.evaluate(() => window.__diorama.ui(true));
    }
    await P.close();
    // no E4 in the visit: it stays as it was
    const Q = await open('?view=hero'), q = Q.page;
    await q.evaluate(helpers);
    const none = await q.evaluate(() => { const D = window.__diorama, H = window.__H, C = D.core; H.enter(); H.aisle(); H.leave(); H.dt = 1 / 60; H.until(() => false, 8);
      for (let i = 0; i < 60; i++) D.step(1 / 60, 1);
      const e = D.info().figures.endHead; return { fired: D.horror().fired.END, figure: D.horror().figure, pose: D.levels().end, head: e }; });
    await q.waitForTimeout(250); await q.evaluate(() => window.__diorama.ui(false)); await q.screenshot({ path: shot('N5-no-E4') });
    { const c = await q.evaluate(() => { const D = window.__diorama, C = D.core, sp = C.HORROR.spots.window, a = D.toScreen(sp.x - 0.5, 2.4, sp.z), b = D.toScreen(sp.x + 0.5, 0.3, sp.z); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; });
      const png = await q.screenshot({ clip: { x: Math.max(0, c[0]), y: Math.max(0, c[1]), width: Math.min(1280 - Math.max(0, c[0]), c[2] - c[0]), height: Math.min(720 - Math.max(0, c[1]), c[3] - c[1]) } });
      const big = await calc.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const k = 4, cv = document.createElement('canvas'); cv.width = img.naturalWidth * k; cv.height = img.naturalHeight * k; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, cv.width, cv.height); return cv.toDataURL('image/png').split(',')[1]; }, png.toString('base64'));
      fs.writeFileSync(shot('N5-no-E4-4x'), Buffer.from(big, 'base64')); }
    await Q.close();
    report.n5 = { g0, turn, pics, none };
    check('N5', 'ending: after a visit with E4 the figure behind the window, 2 s on screen, turns its head onto the camera within 1.5 s (with a low tone) and keeps it there from two other angles (< 10 deg, as drawn); without E4 it does not look up',
      g0.pose && g0.pose.armed && !g0.pose.looking && turn.gaps === 0 && Math.abs(turn.t - turn.t0 - (2 - turn.seen0)) <= 2 / 240 && turn.drone === 1 && pics.every((x) => x.mode === 'orbit' && x.dev < 10 && x.pitch > 0.1) && none.figure === 'window' && none.fired == null && none.pose && !none.pose.armed && none.head && none.head.pitch === 0 && none.head.headRel === 0,
      `E4 visit: E5 at ${g0.e5 && g0.e5.toFixed(2)} s, on screen for ${turn.seen0.toFixed(2)} s when the exit ended (${turn.t0.toFixed(2)} s), then in view throughout; it turned at ${turn.t.toFixed(2)} s = ${(turn.seen0 + turn.t - turn.t0).toFixed(3)} s on screen (2 s); the low tone played ${turn.drone}; ` +
      pics.map((x, i) => `angle ${i + 1} (${x.mode}): drawn head ${x.dev.toFixed(2)} deg off the camera, lifted ${(x.pitch * 180 / Math.PI).toFixed(1)} deg`).join('; ') +
      `; no E4: figure ${none.figure}, turned ${none.fired}, head lifted ${none.head ? (none.head.pitch * 180 / Math.PI).toFixed(1) : 'n/a'} deg, turned ${none.head ? (none.head.headRel * 180 / Math.PI).toFixed(1) : 'n/a'} deg`);
  }

  // ---------- N6: the shop window brighter than the vending machine; the dog blocked at the door ----------
  {
    const lumRect = async (file, rect) => calc.evaluate(async ({ b64, rect }) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(Math.round(rect[0]), Math.round(rect[1]), Math.max(1, Math.round(rect[2] - rect[0])), Math.max(1, Math.round(rect[3] - rect[1]))).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return s / (d.length / 4); }, { b64: fs.readFileSync(file).toString('base64'), rect });
    const Q = await open('?view=hero');
    const rects = await Q.page.evaluate(() => { const D = window.__diorama, C = D.core, q = D.toScreen(6.2, 1.6, 0.5); D.rotate(0.35, -0.1); const q2 = D.toScreen(6.2, 1.6, 0.5); D.zoomAt(0.45, q2[0] / innerWidth, q2[1] / innerHeight);
      const box = (pts) => { const s = pts.map((p) => D.toScreen(...p)), xs = s.map((v) => v[0]), ys = s.map((v) => v[1]); const pad = 0.2; const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); return [x0 + (x1 - x0) * pad, y0 + (y1 - y0) * pad, x1 - (x1 - x0) * pad, y1 - (y1 - y0) * pad]; };
      const W = C.WINDOW, F = C.SIDEWALK_H, z = C.FACADE_Z;
      return { win: box([[W.x0, W.y0, z], [W.x1, W.y0, z], [W.x0, W.y1, z], [W.x1, W.y1, z]]), vend: box([[6.03, F + 0.55, z + 0.72], [6.77, F + 0.55, z + 0.72], [6.03, F + 1.75, z + 0.72], [6.77, F + 1.75, z + 0.72]]) }; });
    await Q.page.waitForTimeout(400); await Q.page.evaluate(() => window.__diorama.ui(false)); await Q.page.screenshot({ path: shot('N6-outside') });
    await Q.close();
    const win = await lumRect(shot('N6-outside'), rects.win), vend = await lumRect(shot('N6-outside'), rects.vend);
    const gw = await lumRect(shot('G-outside'), rects.win).catch(() => null);
    const P = await open('?view=hero'), page = P.page;
    await page.evaluate(helpers);
    const dog = await page.evaluate(() => {
      const D = window.__diorama, H = window.__H, C = D.core; H.enter(); H.walk(C.SCARE_PLAN.aisle); H.dt = 1 / 120;
      H.until(() => !!D.horror().dog, 15);
      let routed = false, outAt = null, outOf = null, gap = Infinity, hits = 0;
      const obb = (d, b) => { const f = [-Math.sin(d.yaw), -Math.cos(d.yaw)], rr = [Math.cos(d.yaw), -Math.sin(d.yaw)], hl = C.DOG.len / 2, hw = C.DOG.wid / 2;
        const pts = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, c]) => [d.x + f[0] * hl * a + rr[0] * hw * c, d.z + f[1] * hl * a + rr[1] * hw * c]), bp = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
        for (const ax of [[1, 0], [0, 1], f, rr]) { const pa = pts.map((p) => p[0] * ax[0] + p[1] * ax[1]), pb = bp.map((p) => p[0] * ax[0] + p[1] * ax[1]); if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false; } return true; };
      H.each = (st) => { const d = D.horror().dogView; if (!d) return; if (!routed && d.phase === 'shake') { D.walkRoute([[2.75, -5.2], [2.75, -1.0], [4.4, -0.5]]); routed = true; }
        if (d.phase === 'out' && outAt === null) outAt = st.t; if (outAt !== null && outOf === null && d.z > C.FACADE_Z + C.DOG.r + 0.05) outOf = st.t;
        gap = Math.min(gap, Math.hypot(d.x - st.player.x, d.z - st.player.z));
        const boxes = D.solids().filter((s) => s.kind !== 'roof' && s.y1 > C.SIDEWALK_H + 0.05 && s.y0 < C.SIDEWALK_H + 0.6 && (s.kind !== 'door' || s.active)).map((s) => [s.x0, s.z0, s.x1, s.z1]);
        for (const lf of C.doorLeaves(st.doors).filter((l) => l.door === 0)) boxes.push([lf.x0, lf.z0, lf.x1, lf.z1]);
        if (boxes.some((b) => obb(d, b))) hits++; };
      H.until(() => D.horror().dog && D.horror().dog.goneAt !== null, 30); H.each = null;
      return { phases: D.horror().dog.log.map((x) => x.phase), out: outOf - outAt, gap, hits, walker: [D.state().player.x, D.state().player.z] };
    });
    await P.close();
    report.n6 = { rects, win, vend, gw, dog };
    check('N6', 'the shop window brighter than the vending machine from outside; a walker blocking the door: the dog squeezes out within 8 s, never closer than 0.6 m, never in a solid',
      win > vend && dog.phases.includes('squeeze') && dog.out <= 8 && dog.gap >= 0.6 && dog.hits === 0,
      `N6-outside: the window's mean luminance ${win.toFixed(1)} vs the vending machine's front ${vend.toFixed(1)}${gw == null ? '' : ' (G-outside, same rectangles: window ' + gw.toFixed(1) + ')'}; walker standing at (${dog.walker.map((v) => v.toFixed(2)).join(', ')}): dog ${dog.phases.join(',')}, out of the door ${dog.out.toFixed(2)} s after setting off, closest ${dog.gap.toFixed(2)} m, overlapping a solid on ${dog.hits} frames`);
  }

  // ---------- N7: the silent wanderer in the page (nothing heard; goes by what it can see) ----------
  {
    const wand2 = [];
    for (const [seed, aim] of [[1, 'door'], [2, 'street'], [3, 'next']]) {
      const P = await open('?view=hero');
      const r = await P.page.evaluate(([seed, aim]) => window.__diorama.wander({ seed, aim, maxT: 120, senses: 'sight' }), [seed, aim]);
      const h = await P.page.evaluate(() => ({ history: window.__diorama.horror().history, audio: window.__diorama.info().audio }));
      await P.page.screenshot({ path: shot(`N7-seed${seed}-E4`) });
      const at = (e) => { const x = h.history.find((y) => y.e === e); return x ? x.t - r.t0 : null; };
      wand2.push({ seed, aim, T: [at('E2'), at('E3'), at('E4')], audio: h.audio, phases: r.log.map((e) => e.phase + '@' + (e.t - r.t0).toFixed(1)).join(' '), errors: P.errors.length });
      await P.close();
    }
    report.n7 = wand2;
    const f1row = report.checks.find((c) => c.id === 'F1');
    check('N7', 'silent: a wanderer that hears nothing and goes by footprints and lit things meets E2, E3, E4 in order within 120 s (seeds 1-3, in the page, sound never started); F1 (by sound) still passes',
      wand2.every((x) => x.T.every((v) => v != null) && x.T[0] < x.T[1] && x.T[1] < x.T[2] && x.T[2] <= 120 && x.audio === 'not started' && x.errors === 0) && f1row && f1row.pass,
      wand2.map((x) => `seed ${x.seed} (aim ${x.aim}): E2 ${f2(x.T[0])} s, E3 ${f2(x.T[1])} s, E4 ${f2(x.T[2])} s, sound ${x.audio} (${x.phases})`).join(' | ') + `; F1 ${f1row && f1row.pass ? 'passes' : 'FAILS'}`);
  }

  // ---------- SPEC 9: clean start ----------
  check(9, 'clean start: no errors, no outside requests', allErrors.length === 0 && allExternal.length === 0,
    `${loads} page loads: ${allErrors.length} errors/warnings, ${allExternal.length} outside requests${allErrors.length ? ' — ' + allErrors.slice(0, 4).join(' ; ') : ''}${allExternal.length ? ' — ' + allExternal.slice(0, 4).join(' ; ') : ''}`);

  finishR9();
  {
    const ids = ['1', '1b', '2', '3', '4', '5', '6', '7', '8', '9', 'P', 'D', ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => 'H' + i), ...Array.from({ length: 13 }, (_, i) => 'R' + (i + 1)), 'K1', 'K2', 'F1', 'F4', 'V1'];
    const rows = ids.map((id) => report.checks.find((c) => String(c.id) === id));
    check('A8', 'regressions after the reskin: items 1-9, 1b, performance, player default, H1-H8, R1-R13, K1, K2, F1, F4, V1',
      rows.every((c) => c && c.pass), `${rows.filter((c) => c && c.pass).length}/${ids.length} rows pass (${ids.filter((id, i) => !rows[i] || !rows[i].pass).join(',') || 'none failing'})`);
  }  {
    const rows = report.checks.filter((c) => !/^N[1-8]$/.test(String(c.id)) && !['A8', 'F5', 'R9'].includes(String(c.id)));
    check('N8', 'regressions after round 9: every earlier row passes (the card closed first on the normal entry)', rows.every((c) => c.pass), `${rows.filter((c) => c.pass).length}/${rows.length} earlier rows pass (${rows.filter((c) => !c.pass).map((c) => c.id).join(',') || 'none failing'})`);
  }

  {
    const ids = ['1', '1b', '2', '3', '4', '5', '6', '7', '8', '9', 'P', 'D', ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => 'H' + i), ...Array.from({ length: 13 }, (_, i) => 'R' + (i + 1))];
    const rows = ids.map((id) => report.checks.find((c) => String(c.id) === id));
    check('F5', 'regressions: H1-H8 (round-6 thresholds), R1-R13, items 1-9, 1b, performance, player default',
      rows.every((c) => c && c.pass), `${rows.filter((c) => c && c.pass).length}/${ids.length} rows pass (${ids.filter((id, i) => !rows[i] || !rows[i].pass).join(',') || 'none failing'})`);
  }
  report.gpu = gpu; report.calls = calls; report.errors = allErrors; report.external = allExternal;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.pass).length;
  console.log(`\n${report.checks.length - failed}/${report.checks.length} passed · ${report.browser} · GPU ${gpu} · ${base}`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
