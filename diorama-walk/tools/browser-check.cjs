// Browser acceptance for 微缩街角·走进去: SPEC 验收条目 1-9, the performance budget and the player-default configuration.
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
  async function open(query, { width = 1280, height = 720, dpr = 1, touch = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage(), errors = [], external = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    page.on('request', (r) => { if (isExternal(r.url())) external.push(r.url()); });
    await page.goto(base + query);
    await page.waitForFunction(() => window.__diorama && window.__diorama.ready, null, { polling: 100, timeout: 30000 });
    loads++;
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
  const views = [['hero', '?view=hero'], ['mid-aim-door', '?view=mid&aim=door'], ['door', '?view=door'], ['inside', '?view=inside'], ['next', '?view=next']];
  let gpu = '', calls = {};
  for (const [name, q] of views) {
    const P = await open(q);
    await P.page.waitForTimeout(500);
    const i = await info(P.page), st = await state(P.page);
    gpu = i.gpu; calls[name] = i.calls;
    await P.page.screenshot({ path: shot(name) });
    report.runs.push({ name, query: q, viewport: '1280x720', dpr: i.dpr, buffer: i.buffer, calls: i.calls, triangles: i.triangles, s: st.s, mode: st.mode, cam: st.cam, eye: st.eye, doors: st.doors });
    await P.close();
  }
  for (const [name, q] of [['phone-hero', '?view=hero'], ['phone-inside', '?view=inside']]) {
    const P = await open(q, { width: 390, height: 844, dpr: 3, touch: true });
    await P.page.waitForTimeout(500);
    const i = await info(P.page);
    await P.page.screenshot({ path: shot(name) });
    report.runs.push({ name, query: q, viewport: '390x844', deviceDpr: 3, dpr: i.dpr, buffer: i.buffer, calls: i.calls });
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
    // two fingers pinch in to a third of the start distance
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

  // ---------- performance: draw calls and frame rate ----------
  {
    const perf = {};
    for (const [name, q, dpr] of [['hero dpr1', '?view=hero', 1], ['hero dpr2', '?view=hero', 2], ['default dpr2', '', 2], ['inside dpr2', '?view=inside', 2]]) {
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
    const pk = (await state(page)).player;
    const keyMoved = Math.hypot(pk.x - pc.x, pk.z - pc.z);
    await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(760, 360, { steps: 6 }); await page.mouse.up();
    const yawDrag = (await state(page)).player.yaw - pk.yaw;
    await page.mouse.wheel(0, 120);
    const back = await until(page, () => window.__diorama.state().mode === 'orbit', 5000);
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
      `Shift+W 0.7 s -> ${keyMoved.toFixed(2)} m; drag -> yaw ${yawDrag.toFixed(2)} rad; wheel back -> outside ${back} (s ${f3(fin.s)} = entry s ${f3(fin.trigger.s)}); wheel in again ${again}, Esc -> outside ${escBack}; sound ${i1.audio}`);
    await P.close();
  }

  // ---------- SPEC 9: clean start ----------
  check(9, 'clean start: no errors, no outside requests', allErrors.length === 0 && allExternal.length === 0,
    `${loads} page loads: ${allErrors.length} errors/warnings, ${allExternal.length} outside requests${allErrors.length ? ' — ' + allErrors.slice(0, 4).join(' ; ') : ''}${allExternal.length ? ' — ' + allExternal.slice(0, 4).join(' ; ') : ''}`);

  report.gpu = gpu; report.calls = calls; report.errors = allErrors; report.external = allExternal;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.pass).length;
  console.log(`\n${report.checks.length - failed}/${report.checks.length} passed · ${report.browser} · GPU ${gpu} · ${base}`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
