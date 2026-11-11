// Appearance regression: diagnostic build uses the production entry and render path, exposing objects only in this file.
// NODE_PATH="$(npm root -g)" node tools/look-check.cjs <out-dir> [--revision <git-revision>]
// Captures fixed views, next-door exit, shop cutaway and exit; report.json keeps actual mesh/material states and pixel checks.
// Transition states come from the simulation; the extra front-paper shots change only the probe camera, never the state.
const { chromium } = require('playwright');
const { build } = require('esbuild');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), out = process.argv[2];
const revision = process.argv.includes('--revision') ? process.argv[process.argv.indexOf('--revision') + 1] : null;
if (!out) throw new Error('usage: look-check.cjs <out-dir>');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const bundle = await build({ entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false,
    plugins: [{ name: 'appearance-probe', setup(b) { b.onLoad({ filter: /src\/.*\.js$/ }, a => ({
      contents: (revision ? execFileSync('git', ['show', revision + ':diorama-walk/' + path.relative(root, a.path)], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(a.path, 'utf8'))
        + (a.path.endsWith('/main.js') ? '\nwindow.__lookCheck = { MESH, look, leaves, composer, camera };' : ''), loader: 'js', resolveDir: path.dirname(a.path),
    })); } }],
  });
  const html = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8').replace('<!--BUNDLE-->', () => '<script>' + bundle.outputFiles[0].text.replace(/<\/script/g, '<\\/script') + '</script>');
  const file = path.resolve(out, 'instrumented.html'); fs.writeFileSync(file, html);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
  const report = { browser: browser.version(), checks: [], states: {}, errors: [] };
  const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
  const open = async (view, phone = false) => {
    const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 664 } : { width: 1440, height: 810 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone });
    const page = await ctx.newPage(); page.on('pageerror', e => report.errors.push(e.message));
    await page.goto('file://' + file + '?view=' + view + '&calm=1');
    await page.waitForFunction(() => window.__diorama?.ready, null, { polling: 100 });
    await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 100));
    await page.evaluate(() => __diorama.ui(false));
    return { ctx, page };
  };
  const snap = page => page.evaluate(() => {
    const { MESH: M, look: L, leaves } = __lookCheck;
    const state = m => m && ({ visible: m.visible, alpha: m.material.opacity, transparent: m.material.transparent, material: m.material.uuid });
    const names = ['signText', 'lightbox@store', 'lightboxText@store', 'neon', 'sign2Text', 'papers'];
    return { mode: __diorama.state().mode, roofs: __diorama.roofs(), cam: __diorama.state().cam, info: __diorama.info(), meshes: Object.fromEntries(names.map(k => [k, state(M[k])])),
      fu: leaves.slice(0, 2).map(l => state(l.children.find(m => m.geometry === L.fuGeo))),
      halos: L.halos.map(h => ({ visible: h.s.visible, alpha: h.s.material.opacity, full: h.op })),
    };
  });
  const shot = async (page, name) => { await page.evaluate(() => __lookCheck.composer.render(0)); await page.screenshot({ path: path.join(out, name + '.png') }); };
  const fading = async (page, id) => page.evaluate(id => {
    const D = __diorama; if (!D.exit()) return false;
    for (let i = 0; i < 240; i++) { D.step(1 / 240); const a = D.roofs()[id].a; if (a > .25 && a < .75) return true; }
    return false;
  }, id);
  try {
    for (const [view, phone] of [['hero', false], ['door', false], ['hero', true]]) {
      const { ctx, page } = await open(view, phone), name = phone ? 'phone-hero' : view;
      report.states[name] = await snap(page); await shot(page, name);
      if (name === 'hero') {
        const normals = await page.evaluate(() => {
          const p = __lookCheck.look.refl.geometry.attributes.position, ys = [];
          for (let i = 0; i < p.count; i += 3) { const ax = p.getX(i + 1) - p.getX(i), az = p.getZ(i + 1) - p.getZ(i), bx = p.getX(i + 2) - p.getX(i), bz = p.getZ(i + 2) - p.getZ(i); ys.push(az * bx - ax * bz); }
          return ys;
        });
        check('reflection triangles face up', normals.every(y => y > 0), normals);
        await page.evaluate(() => { __lookCheck.look.refl.visible = false; }); await shot(page, 'hero-no-reflections');
      }
      await ctx.close();
    }
    {
      const { ctx, page } = await open('next');
      check('next-door exit reaches a partial fade', await fading(page, 'next'));
      const s = report.states['next-fade'] = await snap(page); await shot(page, 'next-fade');
      // Keep the real exit state, but also view it from the fixed hero camera so the front papers are visible.
      await page.evaluate(({ cam: c, info }) => { const camera = __lookCheck.camera; camera.position.set(c.x, c.y, c.z); camera.rotation.set(c.pitch, c.yaw, 0, 'YXZ'); camera.fov = info.fov; camera.updateProjectionMatrix(); }, report.states.hero);
      await shot(page, 'next-fade-front');
      await page.evaluate(({ cam: c, info }) => { const camera = __lookCheck.camera; camera.position.set(c.x, c.y, c.z); camera.rotation.set(c.pitch, c.yaw, 0, 'YXZ'); camera.fov = info.fov; camera.updateProjectionMatrix(); }, report.states.door);
      await shot(page, 'next-fade-papers');
      check('next sign fades without fading papers or either door paper', s.meshes.sign2Text.alpha < .75 && s.meshes.papers.alpha === 1 && s.fu.every(m => m.alpha === 1), s);
      check('paper materials are independently owned', new Set([s.meshes.sign2Text.material, s.meshes.papers.material, ...s.fu.map(m => m.material)]).size === 4);
      await ctx.close();
    }
    {
      const { ctx, page } = await open('inside');
      check('direct shop exit reaches a partial fade', await fading(page, 'store'));
      const s = report.states['store-lift-fade'] = await snap(page); await shot(page, 'store-lift-fade');
      check('main sign and halo fade together during direct exit', s.meshes.signText.alpha < .75 && Math.abs(s.halos[0].alpha / s.halos[0].full - s.meshes.signText.alpha) < 1e-6, s);
      await page.evaluate(() => __diorama.step(1 / 60, 120));
      const end = await snap(page);
      check('exit restores lightbox, lettering and halo', end.mode === 'orbit' && end.meshes['lightbox@store'].alpha === 1 && end.meshes['lightboxText@store']?.alpha === 1 && end.halos[1].visible && Math.abs(end.halos[1].alpha - end.halos[1].full) < 1e-6, end);
      await ctx.close();
    }
    {
      const { ctx, page } = await open('inside');
      await page.evaluate(() => { __diorama.back(); __diorama.step(1 / 60, 120); });
      const s = report.states.room = await snap(page); await shot(page, 'room');
      const shell = s.meshes['lightbox@store'], text = s.meshes['lightboxText@store'];
      check('room hides lightbox shell, both text faces and its halo', s.mode === 'room' && !shell.visible && text && !text.visible && !s.halos[1].visible, s);
      check('shop exit reaches a partial fade', await fading(page, 'store'));
      const e = report.states['store-fade'] = await snap(page); await shot(page, 'store-fade');
      check('exiting lightbox shell, text and halo share alpha', !!e.meshes['lightboxText@store'] && Math.abs(e.meshes['lightbox@store'].alpha - e.meshes['lightboxText@store'].alpha) < 1e-6 && Math.abs(e.halos[1].alpha / e.halos[1].full - e.meshes['lightbox@store'].alpha) < 1e-6, e);
      check('main sign halo shares its sign fade', Math.abs(e.halos[0].alpha / e.halos[0].full - e.meshes.signText.alpha) < 1e-6, e);
      await ctx.close();
    }
    // Read back screenshots in the browser's native canvas; compare only pixels that actually changed.
    const ctx = await browser.newContext(), page = await ctx.newPage();
    const data = ['hero', 'hero-no-reflections'].map(n => fs.readFileSync(path.join(out, n + '.png')).toString('base64'));
    const pixels = await page.evaluate(async data => {
      const images = await Promise.all(data.map(s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; })));
      const c = document.createElement('canvas'); c.width = images[0].width; c.height = images[0].height; const g = c.getContext('2d');
      const a = images.map(i => { g.drawImage(i, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; });
      let count = 0, sum = 0, peak = 0;
      for (let i = 0; i < a[0].length; i += 4) { const d = Math.max(...[0, 1, 2].map(k => Math.abs(a[0][i + k] - a[1][i + k]))); if (d > 3) { count++; sum += d; peak = Math.max(peak, d); } }
      return { count, meanChanged: count ? sum / count : 0, peak };
    }, data);
    check('reflections affect visible pixels', pixels.count > 100, pixels);
    await ctx.close(); check('page errors', report.errors.length === 0, report.errors);
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  process.exitCode = report.checks.some(c => !c.pass) ? 1 : 0;
})();
