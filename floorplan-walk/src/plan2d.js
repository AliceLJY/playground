// The 2D plan: a coloured floor plan drawn from the house data, a furniture library to drag from, and the editing
// that goes with it (move, rotate, resize, duplicate, delete, undo, snap to walls). It owns the furniture layout;
// the 3D scene is rebuilt from that layout when the visitor switches over.
// The plan drawing and the editing are written for this page's polygon walls. The furniture symbols and the library list
// come from symbols.js (ported from wy51ai/floorplan-3d, MIT); the pointer handling follows the same project's approach.
import * as C from './core.js';
import { symbol, LIB, buildDefs } from './symbols.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const COARSE = matchMedia('(pointer:coarse)').matches;
const TAP = COARSE ? 9 : 4;                        // pixels a pointer may move and still count as a tap
const STORE = 'floorplan-walk-layout-v1';
const MM = C.MM, house = C.house;
const P = (v) => +(v * MM).toFixed(1);              // plan pixels to millimetres
const pts = (poly) => poly.map(([x, y]) => `${P(x)},${P(y)}`).join(' ');
const NS = 'stroke-width="1" vector-effect="non-scaling-stroke"';

// Library: the upstream list plus the three pieces this page adds.
const LIBRARY = LIB.map((c) => ({ cat: c.cat, items: c.items.map(([type, name, w, d]) => ({ type, name, w, d })) }));
LIBRARY.find((c) => c.cat === '客厅').items.push({ type: 'x:roundcoffee', name: '圆茶几', w: 1100, d: 1100 });
LIBRARY.find((c) => c.cat === '餐厨').items.push({ type: 'x:ovaltable', name: '椭圆餐桌', w: 2600, d: 1500 }, { type: 'x:pendant', name: '吊灯', w: 800, d: 800 });
const NOLABEL = ['plant', 'floorlamp', 'sidetable', 'barstool', 'beanbag', 'x:pendant', 'ksink', 'rug'];
const FLOOR_OF = { '门厅': 'tile800', '厨房': 'tile600', '洗衣房': 'tile600', '储藏间': 'tile600', '卫生间': 'antislip' };

// Footprint extent and the steps in its outline, for the dimension chains (millimetres, rounded to 10).
const FOOT = (() => {
  const f = house.footprint_px, xs = f.map((p) => p[0]), ys = f.map((p) => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const stepsX = [box[0], box[2]], stepsY = [box[1], box[3]];
  f.forEach(([x, y], i) => {
    const [x2, y2] = f[(i + 1) % f.length];
    if (Math.abs(x2 - x) < 1.5 && Math.abs(y2 - y) >= 30) stepsX.push(x);
    if (Math.abs(y2 - y) < 1.5 && Math.abs(x2 - x) >= 30) stepsY.push(y);
  });
  const uniq = (a) => a.sort((p, q) => p - q).filter((v, i, arr) => !i || v - arr[i - 1] > 8);
  return { box, stepsX: uniq(stepsX), stepsY: uniq(stepsY) };
})();
const BOUNDS = { x: P(FOOT.box[0]) - 2900, y: P(FOOT.box[1]) - 2900, w: P(FOOT.box[2] - FOOT.box[0]) + 5300, h: P(FOOT.box[3] - FOOT.box[1]) + 6000 };

function loadLayout() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.v === 1 && Array.isArray(s.items) && s.items.every((i) => i && typeof i.type === 'string' && isFinite(i.cx) && isFinite(i.cy) && i.w > 0 && i.d > 0)) return s.items;
  } catch (e) { /* storage may be unavailable; fall back to the default */ }
  return null;
}

export function createPlan2D({ getStyle, onChange }) {
  const svg = $('#plan');
  let items = loadLayout() || C.defaultLayout();
  const ui = { sel: null, layers: { dims: true, labels: true, furn: true, wallSnap: true } };
  let view = { x0: 0, y0: 0, s: 0.03 }, uidN = 1;
  const undoStack = [], redoStack = [];
  const getF = (id) => items.find((f) => f.id === id);
  const uid = () => 'u' + Date.now().toString(36) + uidN++;
  const snapState = () => JSON.stringify(items);
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ v: 1, items })); } catch (e) { /* private mode: nothing to do */ } }
  function commit(before) { undoStack.push(before); if (undoStack.length > 150) undoStack.shift(); redoStack.length = 0; save(); onChange(items); }
  function mutate(fn) { const b = snapState(); fn(); commit(b); renderAll(); }
  function restore(json) { items = JSON.parse(json); if (ui.sel && !getF(ui.sel)) ui.sel = null; save(); onChange(items); renderAll(); }
  function undo() { if (!undoStack.length) return toast('没有可撤销的操作'); redoStack.push(snapState()); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapState()); restore(redoStack.pop()); }

  // ---------------- drawing the house (does not change while editing) ----------------
  function renderHouse() {
    const wood = getStyle() === 'walnut' ? 'walnut' : 'wood';
    $('#defs').innerHTML = buildDefs();
    let s = '';
    for (const z of house.floor_zones) for (const poly of z.polygons_px) s += `<polygon class="room" data-room="${z.room}" points="${pts(poly)}" fill="url(#m-${FLOOR_OF[z.room] || wood})"/>`;
    for (const d of house.doors) { const [x0, y0, x1, y1] = d.rect_px; s += `<rect x="${P(x0)}" y="${P(y0)}" width="${P(x1 - x0)}" height="${P(y1 - y0)}" fill="#e2dacb" stroke="#b9b0a0" ${NS} pointer-events="none"/>`; }
    for (const [x0, y0, x1, y1] of C.STAIRS_PX) s += `<rect x="${P(x0)}" y="${P(y0)}" width="${P(x1 - x0)}" height="${P(y1 - y0)}" fill="#ead9bf" stroke="#9c8a6c" ${NS} pointer-events="none"/>`;
    const fp = C.FIREPLACE;
    s += `<g transform="translate(${fp.cx} ${fp.cy}) rotate(${fp.rot})" pointer-events="none">${symbol(fp.type, fp.w, fp.d, C.itemColor(fp, getStyle()))}</g>`;
    $('#gRooms').innerHTML = s;

    const ring = (poly) => 'M' + poly.map(([x, y]) => `${P(x)} ${P(y)}`).join('L') + 'Z';
    $('#gWalls').innerHTML = house.walls.map((w) => `<path class="wall" d="${ring(w.outer)}${w.holes.map(ring).join('')}" fill-rule="evenodd" fill="#6f695e"/>`).join('');

    const WS = `stroke="#4f7394" ${NS}`, DS = `stroke="#3d3a34" ${NS}`;
    let o = '';
    const pane = ([x0, y0, x1, y1]) => {
      const w = x1 - x0, h = y1 - y0;
      let t = `<rect x="${P(x0)}" y="${P(y0)}" width="${P(w)}" height="${P(h)}" fill="#f7fbfd" ${WS}/>`;
      for (const k of [1 / 3, 2 / 3]) t += w >= h ? `<line x1="${P(x0)}" y1="${P(y0 + h * k)}" x2="${P(x1)}" y2="${P(y0 + h * k)}" ${WS}/>` : `<line x1="${P(x0 + w * k)}" y1="${P(y0)}" x2="${P(x0 + w * k)}" y2="${P(y1)}" ${WS}/>`;
      return t;
    };
    for (const op of house.openings) if (op.kind === 'window') o += pane(op.rect_px);
    for (const dw of house.diagonal_windows) o += `<polygon points="${pts(dw.quad_px)}" fill="#f7fbfd" ${WS}/><line x1="${P(dw.a_px[0])}" y1="${P(dw.a_px[1])}" x2="${P(dw.b_px[0])}" y2="${P(dw.b_px[1])}" ${WS}/>`;
    for (const d of house.doors) if (d.glazed) o += pane(d.rect_px);
    const toMm = (x, z) => [(x + C.CX * C.M) * 1000, (z + C.CY * C.M) * 1000];
    for (const d of C.DOORS) {
      for (const p of d.panels_px) o += pane(p);
      const col = d.id === 'o20' ? '#b5653a' : '#3d3a34';
      for (const lf of d.leaves) {
        const [hx, hy] = toMm(lf.hx, lf.hz), L = lf.len * 1000, T = 40;
        const ox = hx + lf.sx * L, oy = hy + lf.sz * L, cx = hx + lf.ax * L, cy = hy + lf.az * L;
        const sweep = lf.sx * lf.az - lf.sz * lf.ax > 0 ? 1 : 0;
        o += `<polygon points="${hx},${hy} ${ox},${oy} ${ox + lf.ax * T},${oy + lf.az * T} ${hx + lf.ax * T},${hy + lf.az * T}" fill="#fff" stroke="${col}" stroke-width="${d.id === 'o20' ? 1.8 : 1}" vector-effect="non-scaling-stroke"/>`;
        o += `<path d="M${ox} ${oy}A${L} ${L} 0 0 ${sweep} ${cx} ${cy}" fill="none" ${DS} stroke-dasharray="5 3" opacity=".7"/>`;
      }
    }
    const fd = house.doors.find((d) => d.id === 'o20'), ex = P((fd.rect_px[0] + fd.rect_px[2]) / 2 + 6), ey = P(fd.rect_px[3]);
    o += `<path d="M${ex} ${ey + 1250}V${ey + 380}M${ex - 170} ${ey + 660}L${ex} ${ey + 360}L${ex + 170} ${ey + 660}" fill="none" stroke="#b5653a" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <text x="${ex + 280}" y="${ey + 1050}" font-size="420" fill="#b5653a">入户</text>`;
    $('#gOpen').innerHTML = o;

    const halo = 'stroke="#fbf9f4" stroke-width="60" paint-order="stroke" stroke-linejoin="round"';
    $('#gLabels').innerHTML = house.rooms.map((r) => {
      const x = P(r.center_px[0]), y = P(r.center_px[1]), small = r.area_m2 < 8;
      return `<text x="${x}" y="${y}" font-size="${small ? 330 : 520}" font-weight="600" text-anchor="middle" fill="#2b2824" ${halo}>${esc(r.name_zh)}</text>
        <text x="${x}" y="${y + (small ? 360 : 520)}" font-size="${small ? 250 : 360}" text-anchor="middle" fill="#7d7366" ${halo}>${r.area_m2.toFixed(1)} m²</text>`;
    }).join('');

    // dimension chains: the steps of the outline along the top and the left, overall sizes on all four sides
    const DC = '#7d7160', LS = `stroke="${DC}" ${NS}`, TK = `stroke="${DC}" stroke-width="2" vector-effect="non-scaling-stroke"`;
    const txt = (x, y, v, rot) => `<text x="${x}" y="${y}" font-size="${v < 1400 ? 260 : 400}" text-anchor="middle" fill="${DC}" ${rot ? `transform="rotate(-90 ${x} ${y})"` : ''}>${v}</text>`;
    const chain = (horiz, at, stepsPx) => {
      const p = stepsPx.map((v) => Math.round(P(v) / 10) * 10);
      let t = horiz ? `<line x1="${p[0]}" y1="${at}" x2="${p.at(-1)}" y2="${at}" ${LS}/>` : `<line x1="${at}" y1="${p[0]}" x2="${at}" y2="${p.at(-1)}" ${LS}/>`;
      p.forEach((v) => { t += horiz
        ? `<line x1="${v}" y1="${at - 200}" x2="${v}" y2="${at + 200}" ${LS}/><line x1="${v - 100}" y1="${at + 100}" x2="${v + 100}" y2="${at - 100}" ${TK}/>`
        : `<line x1="${at - 200}" y1="${v}" x2="${at + 200}" y2="${v}" ${LS}/><line x1="${at - 100}" y1="${v + 100}" x2="${at + 100}" y2="${v - 100}" ${TK}/>`; });
      for (let i = 0; i < p.length - 1; i++) { const mid = (p[i] + p[i + 1]) / 2, v = p[i + 1] - p[i]; t += horiz ? txt(mid, at - 130, v) : txt(at - 130, mid, v, true); }
      return t;
    };
    const [bx0, by0, bx1, by1] = FOOT.box, top = P(by0), left = P(bx0), bottom = P(by1), right = P(bx1);
    let dm = chain(true, top - 2000, [bx0, bx1]) + chain(false, left - 2000, [by0, by1]) + chain(true, bottom + 2200, [bx0, bx1]) + chain(false, right + 1500, [by0, by1]);
    if (FOOT.stepsX.length > 2) dm += chain(true, top - 1000, FOOT.stepsX);
    if (FOOT.stepsY.length > 2) dm += chain(false, left - 1000, FOOT.stepsY);
    $('#gDims').innerHTML = dm;
  }

  // ---------------- drawing the furniture ----------------
  function renderFurn() {
    const g = $('#gFurn'), style = getStyle();
    g.setAttribute('display', ui.layers.furn ? 'inline' : 'none');
    g.innerHTML = items.map((f) => {
      const m = Math.min(f.w, f.d), fs = Math.max(230, Math.min(360, m * 0.3));
      const label = m >= 900 && !NOLABEL.includes(f.type)
        ? `<text transform="rotate(${-f.rot})" font-size="${fs}" text-anchor="middle" dominant-baseline="central" fill="#4a443c" opacity=".8" pointer-events="none">${esc(f.name)}</text>` : '';
      return `<g class="furn" data-fid="${f.id}" transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">${symbol(f.type, f.w, f.d, C.itemColor(f, style))}${label}</g>`;
    }).join('');
  }
  function renderSel() {
    const k = 1 / view.s, f = ui.sel && getF(ui.sel);
    let s = '';
    if (f) {
      const p = 5 * k, A = 'stroke="#b5653a" vector-effect="non-scaling-stroke"', hs = COARSE ? 1.7 : 1, ro = (COARSE ? 40 : 26) * k, hit = (COARSE ? 24 : 11) * k;
      const sx = f.w / 2 + p, sy = f.d / 2 + p;
      s += `<g transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">
        <rect x="${-f.w / 2 - p}" y="${-f.d / 2 - p}" width="${f.w + 2 * p}" height="${f.d + 2 * p}" fill="none" ${A} stroke-width="1.5" stroke-dasharray="5 3" pointer-events="none"/>
        <line x1="0" y1="${-f.d / 2 - p}" x2="0" y2="${-f.d / 2 - ro}" ${A} stroke-width="1" pointer-events="none"/>
        <circle data-handle="rot" cx="0" cy="${-f.d / 2 - ro}" r="${hit}" fill="transparent"/>
        <circle data-handle="rot" cx="0" cy="${-f.d / 2 - ro}" r="${6 * hs * k}" fill="#fff" ${A} stroke-width="1.5"><title>拖动旋转（Shift 自由角度）</title></circle>
        <circle data-handle="size" cx="${sx}" cy="${sy}" r="${hit}" fill="transparent"/>
        <rect data-handle="size" x="${sx - 5 * hs * k}" y="${sy - 5 * hs * k}" width="${10 * hs * k}" height="${10 * hs * k}" fill="#b5653a"><title>拖动调整尺寸</title></rect></g>`;
      const { hh } = C.aabb(f);
      s += `<text x="${f.cx}" y="${f.cy + hh + 24 * k}" font-size="${12 * k}" text-anchor="middle" fill="#b5653a" font-weight="600" pointer-events="none" stroke="#fff" stroke-width="${3 * k}" paint-order="stroke">${f.w} × ${f.d}</text>`;
    }
    $('#gSel').innerHTML = s;
  }
  function renderAll() { renderFurn(); renderSel(); renderPanel(); syncTools(); }

  // ---------------- side panel, floating bar, library ----------------
  function renderPanel() {
    renderFab();
    const p = $('#panel'), f = ui.sel && getF(ui.sel);
    if (f) {
      const col = C.itemColor(f, getStyle());
      p.innerHTML = `<section><h3>家具属性</h3><div class="form">
          <label class="full">名称<input id="fName" value="${esc(f.name)}"></label>
          <label>宽 (mm)<input type="number" id="fW" value="${f.w}" min="100" step="10"></label>
          <label>深 (mm)<input type="number" id="fD" value="${f.d}" min="100" step="10"></label>
          <label>旋转 (°)<input type="number" id="fR" value="${f.rot}" step="15"></label>
          <label>颜色<input type="color" id="fC" value="${col}"></label></div>
        <div class="muted" style="margin-top:8px">占地 ${(f.w * f.d / 1e6).toFixed(2)} m²${f.color ? ' · 已单独指定颜色' : ' · 颜色跟随木色'}</div>
        <div class="actions"><button class="btn" data-a="rot">旋转 90°</button><button class="btn" data-a="dup">复制</button>
          ${f.color ? '<button class="btn" data-a="uncolor">跟随木色</button>' : ''}<button class="btn danger" data-a="del">删除</button><button class="btn" data-a="done">← 返回</button></div></section>
        <section class="muted">拖动家具移动；拖上方圆点旋转；拖右下角方块改尺寸。靠近墙面会自动贴齐。</section>`;
      const upd = (fn) => mutate(() => { const g = getF(f.id); if (g) fn(g); });
      const num = (id, fn) => { $(id).onchange = (e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) upd((g) => fn(g, v)); }; };
      $('#fName').onchange = (e) => upd((g) => { g.name = e.target.value.trim() || g.name; });
      num('#fW', (g, v) => { g.w = Math.max(100, Math.round(v)); });
      num('#fD', (g, v) => { g.d = Math.max(100, Math.round(v)); });
      num('#fR', (g, v) => { g.rot = C.norm(v); });
      $('#fC').onchange = (e) => upd((g) => { g.color = e.target.value; });
      p.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => act(b.dataset.a); });
      return;
    }
    const total = house.rooms.reduce((a, r) => a + r.area_m2, 0);
    p.innerHTML = `<section><h3>房间面积</h3><table>${house.rooms.map((r) => `<tr><td>${esc(r.name_zh)}</td><td class="r">${r.area_m2.toFixed(1)} m²</td></tr>`).join('')}</table>
        <div class="total"><span>合计</span><b>${total.toFixed(1)} m²</b></div>
        <div class="muted" style="margin-top:4px">面积按墙体内净尺寸计算；比例尺由楼梯踏步宽推出。</div></section>
      <section><h3>方案统计</h3><div class="stats"><div><small>家具数量</small><span class="big" id="statCount">${items.length}</span></div>
        <div><small>木色</small><span class="big" style="font-size:16px">${C.STYLES[getStyle()].zh}</span></div></div>
        <div class="actions"><button class="btn" data-a="reset">恢复原样</button><button class="btn danger" data-a="clear">清空布置</button></div></section>
      <section><h3>${COARSE ? '触屏操作' : '键盘快捷键'}</h3><div class="kbd">${COARSE
        ? '<kbd>家具库</kbd><span>点一下放到画面中央，或按住拖到指定位置</span><kbd>点家具</kbd><span>选中后拖动；拖圆点旋转、拖方块改尺寸</span><kbd>单指 / 双指</kbd><span>空白处平移 / 捏合缩放</span>'
        : '<kbd>拖拽</kbd><span>左侧家具拖入平面图</span><kbd>R</kbd><span>旋转 90°（Shift 反向）</span><kbd>方向键</kbd><span>微调 10 mm（Shift 100 mm）</span><kbd>⌘/Ctrl D</kbd><span>复制</span><kbd>Delete</kbd><span>删除</span><kbd>⌘/Ctrl Z</kbd><span>撤销（加 Shift 重做）</span><kbd>F</kbd><span>适应窗口</span><kbd>T</kbd><span>切换 2D / 3D</span><kbd>Esc</kbd><span>取消选择</span>'}</div></section>
      <section class="muted">家具图例、家具库清单与三维家具模型移植自 <a href="https://github.com/wy51ai/floorplan-3d" target="_blank" rel="noopener">floorplan-3d</a>（MIT）。户型图来自 Wikimedia Commons，公有领域。</section>`;
    p.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => act(b.dataset.a); });
  }
  function renderFab() {
    const fab = $('#fab'), f = ui.sel && getF(ui.sel);
    if (!f) { fab.classList.remove('show'); return; }
    fab.innerHTML = `<span class="name">${esc(f.name)}</span><button class="btn" data-a="rotL">↺</button><button class="btn" data-a="rot">↻ 旋转</button>
      <button class="btn" data-a="dup">复制</button><button class="btn danger" data-a="del">删除</button><span class="sep"></span><button class="btn" data-a="done">完成</button>`;
    fab.classList.add('show');
    fab.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => act(b.dataset.a); });
  }
  function buildLib() {
    const style = getStyle();
    $('#lib').innerHTML = LIBRARY.map((c, ci) => `<h4>${c.cat}</h4><div class="lib-grid">${c.items.map((it, ii) => {
      const pad = Math.max(it.w, it.d) * 0.08;
      return `<div class="item" data-key="${ci}:${ii}" title="点击添加，或拖到平面图里">
        <svg viewBox="${-it.w / 2 - pad} ${-it.d / 2 - pad} ${it.w + 2 * pad} ${it.d + 2 * pad}">${symbol(it.type, it.w, it.d, C.itemColor(it, style))}</svg><b>${esc(it.name)}</b><small>${it.w}×${it.d}</small></div>`;
    }).join('')}</div>`).join('') + `<div class="hint">家具按真实尺寸（mm）绘制。${COARSE ? '点一下放到画面中央，或按住拖到平面图里。' : '点击添加到画面中央，或直接拖到平面图里。'}</div>`;
    document.querySelectorAll('#lib .item').forEach((el) => el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      const [ci, ii] = el.dataset.key.split(':').map(Number);
      libDrag = { el, id: e.pointerId, sx: e.clientX, sy: e.clientY, it: LIBRARY[ci].items[ii], ghost: null };
    }));
  }
  function syncTools() {
    document.querySelectorAll('[data-p2]').forEach((b) => {
      const k = b.dataset.p2;
      if (k === 'undo') b.disabled = !undoStack.length;
      if (k === 'redo') b.disabled = !redoStack.length;
      if (k in ui.layers) b.classList.toggle('on', ui.layers[k]);
    });
    $('#count2d').textContent = `${items.length} 件家具`;
  }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

  // ---------------- actions ----------------
  function select(id) { ui.sel = id; renderSel(); renderPanel(); }
  function act(a) {
    const f = ui.sel && getF(ui.sel);
    if (a === 'done') return select(null);
    if (a === 'reset') { ui.sel = null; return mutate(() => { items = C.defaultLayout(); }), toast('已恢复成图纸上的布置，可撤销'); }
    if (a === 'clear') { if (!items.length) return toast('当前没有家具'); ui.sel = null; return mutate(() => { items = []; }), toast('已清空布置，可撤销'); }
    if (!f) return;
    if (a === 'rot' || a === 'rotL') mutate(() => { f.rot = C.norm(f.rot + (a === 'rot' ? 90 : -90)); });
    else if (a === 'del') { ui.sel = null; mutate(() => { items = items.filter((g) => g.id !== f.id); }); }
    else if (a === 'dup') { const n = { ...f, id: uid(), cx: f.cx + 200, cy: f.cy + 200 }; ui.sel = n.id; mutate(() => { items.push(n); }); }
    else if (a === 'uncolor') mutate(() => { delete f.color; });
  }
  function addItem(it, x, y) {
    const f = { id: uid(), type: it.type, name: it.name, cx: Math.round(x / 10) * 10, cy: Math.round(y / 10) * 10, w: it.w, d: it.d, rot: 0 };
    ui.sel = f.id;
    mutate(() => { if (it.type === 'rug') items.unshift(f); else items.push(f); });
    toast(`已添加「${it.name}」${it.w}×${it.d}`);
    return f;
  }

  // ---------------- view ----------------
  function applyView() {
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W || !H) return;
    svg.setAttribute('viewBox', `${view.x0} ${view.y0} ${W / view.s} ${H / view.s}`);
    const nice = [500, 1000, 2000, 5000, 10000].find((v) => v * view.s >= 60) || 10000;
    $('#sbBar').style.width = nice * view.s + 'px';
    $('#sbText').textContent = `${nice / 1000} m`;
    renderSel();
  }
  function fit() {
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W || !H) return;
    view.s = Math.min(W / BOUNDS.w, H / BOUNDS.h);
    view.x0 = BOUNDS.x - (W / view.s - BOUNDS.w) / 2; view.y0 = BOUNDS.y - (H / view.s - BOUNDS.h) / 2;
    applyView();
  }
  function zoomAt(ns, mx, my) {
    ns = Math.max(0.006, Math.min(1, ns));
    const px = view.x0 + mx / view.s, py = view.y0 + my / view.s;
    view.s = ns; view.x0 = px - mx / ns; view.y0 = py - my / ns; applyView();
  }
  function toMM(e) { const r = svg.getBoundingClientRect(); return { x: view.x0 + (e.clientX - r.left) / view.s, y: view.y0 + (e.clientY - r.top) / view.s }; }
  const toScreen = (x, y) => { const r = svg.getBoundingClientRect(); return [r.left + (x - view.x0) * view.s, r.top + (y - view.y0) * view.s]; };

  // ---------------- pointer handling on the plan ----------------
  let drag = null, pinch = null, libDrag = null;
  const touches = new Map();
  const svgXY = (x, y) => { const r = svg.getBoundingClientRect(); return [x - r.left, y - r.top]; };
  const pinchInfo = () => { const [a, b] = [...touches.values()]; return { d: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), c: svgXY((a.x + b.x) / 2, (a.y + b.y) / 2) }; };
  function endDrag(cancel) {
    const d = drag; drag = null; svg.classList.remove('panning');
    if (!d) return;
    if (d.kind === 'pan') { if (!cancel && !d.moved) select(null); return; }
    if (d.moved) { commit(d.before); renderAll(); }
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || e.button === 2) return;
    if (e.pointerType !== 'mouse') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.setPointerCapture(e.pointerId);
      if (touches.size >= 2) { endDrag(drag?.kind === 'pan'); const { d, c } = pinchInfo(); pinch = { d, c, s: view.s, px: view.x0 + c[0] / view.s, py: view.y0 + c[1] / view.s }; return; }
    }
    if (pinch) return;
    const p = toMM(e), t = e.target, h = t.closest('[data-handle]');
    if (h && ui.sel) drag = { kind: h.dataset.handle, id: ui.sel, sx: e.clientX, sy: e.clientY, before: snapState(), moved: false };
    else if (t.closest('[data-fid]')) {
      const f = getF(t.closest('[data-fid]').dataset.fid);
      if (ui.sel !== f.id) select(f.id);
      drag = { kind: 'move', id: f.id, sx: e.clientX, sy: e.clientY, ox: p.x - f.cx, oy: p.y - f.cy, before: snapState(), moved: false };
    } else drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, x0: view.x0, y0: view.y0, moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      if (touches.size < 2) return;
      const { d, c } = pinchInfo(), ns = Math.max(0.006, Math.min(1, (pinch.s * d) / pinch.d));
      view.s = ns; view.x0 = pinch.px - c[0] / ns; view.y0 = pinch.py - c[1] / ns; applyView();
      return;
    }
    if (!drag) return;
    const p = toMM(e), far = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) >= TAP;
    if (drag.kind === 'pan') {
      if (!drag.moved && !far) return;
      drag.moved = true; svg.classList.add('panning');
      view.x0 = drag.x0 - (e.clientX - drag.sx) / view.s; view.y0 = drag.y0 - (e.clientY - drag.sy) / view.s; applyView(); return;
    }
    const f = getF(drag.id); if (!f) return;
    if (!drag.moved && !far) return;                 // a tap on a piece must not nudge it
    drag.moved = true;
    if (drag.kind === 'move') [f.cx, f.cy] = C.snapMove(f, p.x - drag.ox, p.y - drag.oy, 10 / view.s, ui.layers.wallSnap);
    else if (drag.kind === 'rot') { const a = (Math.atan2(p.y - f.cy, p.x - f.cx) * 180) / Math.PI + 90; f.rot = C.norm(e.shiftKey ? a : Math.round(a / 15) * 15); }
    else if (drag.kind === 'size') {
      const a = (f.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const dx = p.x - f.cx, dy = p.y - f.cy, lx = dx * c + dy * s, ly = -dx * s + dy * c, ax = -f.w / 2, ay = -f.d / 2;
      const nw = Math.max(100, Math.round((lx - ax) / 10) * 10), nd = Math.max(100, Math.round((ly - ay) / 10) * 10);
      const mx = ax + nw / 2, my = ay + nd / 2;
      f.cx += mx * c - my * s; f.cy += mx * s + my * c; f.w = nw; f.d = nd;
    }
    renderFurn(); renderSel();
  });
  const onEnd = (e) => { touches.delete(e.pointerId); if (pinch) { if (touches.size < 2) pinch = null; return; } endDrag(e.type === 'pointercancel'); };
  svg.addEventListener('pointerup', onEnd); svg.addEventListener('pointercancel', onEnd);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(view.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  svg.addEventListener('dblclick', (e) => { if (e.target.closest('[data-fid]')) act('rot'); });

  // dragging out of the library: pointer events, because HTML5 drag and drop is unreliable on touch screens
  const dropPoint = (x, y) => { const r = $('#stage2d').getBoundingClientRect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null; return toMM({ clientX: x, clientY: y }); };
  addEventListener('pointermove', (e) => {
    if (!libDrag || e.pointerId !== libDrag.id) return;
    const { it } = libDrag;
    if (!libDrag.ghost) {
      if (Math.hypot(e.clientX - libDrag.sx, e.clientY - libDrag.sy) < TAP) return;
      const g = libDrag.ghost = document.createElement('div'); g.id = 'ghost';
      g.innerHTML = `<svg viewBox="${-it.w / 2} ${-it.d / 2} ${it.w} ${it.d}">${symbol(it.type, it.w, it.d, C.itemColor(it, getStyle()))}</svg>`;
      document.body.appendChild(g); libDrag.el.classList.add('dragging');
    }
    Object.assign(libDrag.ghost.style, { width: Math.max(28, it.w * view.s) + 'px', height: Math.max(20, it.d * view.s) + 'px', left: e.clientX + 'px', top: e.clientY + 'px' });
  });
  function endLibDrag(e, ok) {
    if (!libDrag || e.pointerId !== libDrag.id) return;
    const d = libDrag; libDrag = null;
    d.el.classList.remove('dragging');
    if (d.ghost) { d.ghost.remove(); if (!ok) return; const p = dropPoint(e.clientX, e.clientY); if (p) addItem(d.it, p.x, p.y); return; }
    if (ok) addItem(d.it, view.x0 + svg.clientWidth / 2 / view.s, view.y0 + svg.clientHeight / 2 / view.s);   // a tap: drop it in the middle of the view
  }
  addEventListener('pointerup', (e) => endLibDrag(e, true));
  addEventListener('pointercancel', (e) => endLibDrag(e, false));

  // toolbar buttons marked data-p2
  document.querySelectorAll('[data-p2]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.p2;
    if (k === 'undo') undo(); else if (k === 'redo') redo(); else if (k === 'fit') fit();
    else if (k === 'zoomIn') zoomAt(view.s * 1.25, svg.clientWidth / 2, svg.clientHeight / 2); else if (k === 'zoomOut') zoomAt(view.s * 0.8, svg.clientWidth / 2, svg.clientHeight / 2);
    else if (k === 'reset' || k === 'clear') act(k);
    else if (k in ui.layers) { ui.layers[k] = !ui.layers[k]; $('#gDims').setAttribute('display', ui.layers.dims ? 'inline' : 'none'); $('#gLabels').setAttribute('display', ui.layers.labels ? 'inline' : 'none'); renderAll(); }
  }));
  new ResizeObserver(() => { if (svg.clientWidth) { if (!view.fitted) { fit(); view.fitted = true; } else applyView(); } }).observe(svg);

  // Keys while the plan is showing. Returns true when the key was used.
  function handleKey(e) {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return true; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return true; }
    if (mod && k === 'd') { e.preventDefault(); act('dup'); return true; }
    if (mod) return false;
    if (k === 'f') fit();
    else if (k === 'r') act(e.shiftKey ? 'rotL' : 'rot');
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); act('del'); }
    else if (k === 'escape') select(null);
    else if (k.startsWith('arrow') && ui.sel) {
      e.preventDefault(); const st = e.shiftKey ? 100 : 10;
      mutate(() => { const f = getF(ui.sel); if (k === 'arrowleft') f.cx -= st; if (k === 'arrowright') f.cx += st; if (k === 'arrowup') f.cy -= st; if (k === 'arrowdown') f.cy += st; });
    } else if (k === '+' || k === '=') zoomAt(view.s * 1.25, svg.clientWidth / 2, svg.clientHeight / 2);
    else if (k === '-') zoomAt(view.s * 0.8, svg.clientWidth / 2, svg.clientHeight / 2);
    else return false;
    return true;
  }

  renderHouse(); buildLib(); renderAll();
  return {
    layout: () => items, handleKey, fit, select, act, toScreen,
    restyle() { renderHouse(); buildLib(); renderAll(); },
    shown() { view.fitted = false; if (svg.clientWidth) { fit(); view.fitted = true; } },
    // for checks: where a piece and a library card sit on screen
    screenOf(id) { const f = getF(id); return f ? toScreen(f.cx, f.cy) : null; },
    view: () => ({ ...view }), selected: () => ui.sel, undoDepth: () => undoStack.length,
  };
}
