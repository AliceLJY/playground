const D = __DATA__;
const root = document.querySelector(".nc");
const stage = root.querySelector(".nc-stage");
const house = stage.querySelector(".nc-house");
const shadow = stage.querySelector("[data-shadow]");
const svg = stage.querySelector(".nc-svg");
const tipEl = root.querySelector("[data-tip]");
const speedEl = root.querySelector("[data-speed]");
const soundEl = root.querySelector("[data-sound]");
const readout = root.querySelector("[data-readout]");
const stepButtons = [...root.querySelectorAll(".nc-step")];
const modeButtons = [...root.querySelectorAll("[data-mode]")];

// 白天 / 黑夜：只切 body 的 data-theme，两套配色都在同一份 CSS 里
const themeButtons = [...root.querySelectorAll("[data-theme-set]")];
function setTheme(next, save) {
  document.body.setAttribute("data-theme", next);
  themeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === next)));
  if (save) { try { localStorage.setItem("nanchan-theme", next); } catch (e) {} }
}
try { const t = localStorage.getItem("nanchan-theme"); if (t === "light" || t === "dark") setTheme(t, false); } catch (e) {}
themeButtons.forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.themeSet, true)));
const resetLink = root.querySelector("[data-reset]");
const fenInput = root.querySelector("[data-fen]");
const fenOut = root.querySelector("[data-fen-out]");
const fenNote = root.querySelector("[data-fen-note]");
const chip = (id) => root.querySelector(`[data-chip="${id}"]`);
const still = matchMedia("(prefers-reduced-motion: reduce)");

const nodes = [...house.querySelectorAll(".it")].map((el) => ({
  el,
  piece: el.dataset.piece,
  step: el.dataset.step,
  key: Number(el.dataset.k),
  m: el.dataset.m.split(",").map(Number),
  shown: "",
  hidden: null,
}));
for (const node of nodes) node.lift = node.m[0] * D.V[0] + node.m[1] * D.V[1] + node.m[2] * D.V[2];
let order = nodes.map((_, i) => i);
const piece = Object.fromEntries(D.pieces.map((id) => [id, { x: 1, v: 0, target: 1, pending: null, shown: false }]));
const STEPS = D.steps;

let done = 0; // 已完成的步数
let busy = false;
let clock = 0;
let frame = 0;
let last = 0;
let visible = true;
let mode = "manual";
let autoTimer = 0;
let fen = D.fen;
let thump = null; // 夯台基的三下
let grow = null; // 砌墙：从下往上长
let manual = false;
let reorders = 0;
let soundTimer = 0; // 逐帧检查用：由 window.__nc.advance 推进时钟
try { const saved = localStorage.getItem("nanchan-mode"); if (saved === "auto" || saved === "manual") mode = saved; } catch (e) {}

function say(text) { if (readout.textContent !== text) readout.textContent = text; }
const fenKey = () => String(Math.round(fen * 2) / 2);
function sayFor(id) {
  const list = D.say[id] || [];
  const hit = list.find(([mm]) => String(mm) === fenKey());
  return hit ? hit[1] : list.length ? list[0][1] : "";
}

function showStep(id, on) {
  for (const node of nodes) if (node.step === id) {
    if (on && node.hidden !== false) { node.el.removeAttribute("data-hide"); node.hidden = false; }
    if (!on && node.hidden !== true) { node.el.setAttribute("data-hide", ""); node.hidden = true; }
  }
}

function steerSpring(state, dt, calm) {
  if (state.pending && clock >= state.pending.at) { state.target = state.pending.value; state.pending = null; }
  if (calm) { state.x = state.target; state.v = 0; return state.pending !== null; }
  for (let i = 0; i < D.spring.substeps; i++) {
    const h = dt / D.spring.substeps;
    state.v += ((state.target - state.x) * D.spring.stiffness - state.v * D.spring.damping) * h;
    state.x += state.v * h;
  }
  if (Math.abs(state.target - state.x) < 1e-5 && Math.abs(state.v) < 1e-4) { state.x = state.target; state.v = 0; return state.pending !== null; }
  return true;
}

function place() {
  for (const node of nodes) {
    const share = piece[node.piece].x;
    const tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    const ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;
    let text = share === 0 ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (thump && node.piece === "stand") text = `translate(0 ${thump.dy.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text); else node.el.removeAttribute("transform");
    }
  }
  const next = nodes.map((_, i) => i).sort((a, b) => nodes[a].key + nodes[a].lift * piece[nodes[a].piece].x - (nodes[b].key + nodes[b].lift * piece[nodes[b].piece].x));
  if (next.some((index, at) => index !== order[at])) {
    const fragment = document.createDocumentFragment();
    for (const index of next) fragment.appendChild(nodes[index].el);
    house.appendChild(fragment);
    order = next;
    reorders++;
  }
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  const calm = still.matches;
  let moving = false;
  for (const id of D.pieces) if (steerSpring(piece[id], dt, calm)) moving = true;
  if (thump) {
    thump.t += dt;
    const k = Math.floor(thump.t / 0.42);
    const local = thump.t - k * 0.42;
    thump.dy = k < 3 ? 1.2 * Math.exp(-local * 9) * Math.sin(local * 22) : 0;
    const f = Math.min(1, thump.t / 1.26);
    house.style.setProperty("--base-fill", String(f * f * (3 - 2 * f)));
    if (k >= 3) { thump = null; house.style.removeProperty("--base-fill"); }
    else moving = true;
  }
  if (grow) {
    grow.t += dt;
    const f = Math.min(1, grow.t / 1.6);
    const e = f * f * (3 - 2 * f);
    // 砌墙：整片墙一起由淡到实（按包围盒裁切会把等轴墙面切成斜三角碎片，试过不用）
    const op = f >= 1 ? "0.999" : Math.min(0.999, e).toFixed(3); // 停在 0.999：透明度从 <1 跳到 1 时浏览器换一种合成方式，会闪一下
    for (const node of nodes) if (node.step === "wall") node.el.style.opacity = op;
    if (f >= 1) grow = null; else moving = true;
  }
  place();
  if (!moving && busy) finishStep();
  frame = visible && (moving || busy) && !manual ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (manual) return; if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };

function sound(id) {
  const step = STEPS.find((s) => s.id === id);
  const p = D.soundAt[id];
  if (!step || !p) return;
  soundEl.textContent = step.sound;
  soundEl.style.left = `${(p[0] / D.W) * 100}%`;
  soundEl.style.top = `${(p[1] / D.H) * 100}%`;
  soundEl.removeAttribute("data-pop");
  void soundEl.offsetWidth;
  soundEl.setAttribute("data-pop", "");
  clearTimeout(soundTimer);
  soundTimer = setTimeout(() => soundEl.removeAttribute("data-pop"), 1600);
}

function refreshButtons() {
  stepButtons.forEach((b, i) => {
    b.disabled = busy || i !== done;
    b.toggleAttribute("data-next", !busy && i === done);
    b.toggleAttribute("data-done", i < done);
    b.toggleAttribute("data-run", busy && i === done);
  });
  stage.dataset.done = String(done);
}

function setTip(text) { if (tipEl.textContent !== text) tipEl.textContent = text; }

function press(i) {
  if (busy || i !== done || i >= STEPS.length) return;
  const step = STEPS[i];
  busy = true;
  setTip(step.hint);
  sound(step.id);
  chip("part").textContent = step.part || (step.id === "apart" ? "木构 7 层 + 台基" : "全部装回");
  say(sayFor(step.id));
  const construct = !!D.stepPieces[step.id];
  speedEl.hidden = !construct || still.matches;
  if (step.id === "wall") {
    for (const node of nodes) if (node.step === "wall") node.el.style.opacity = "0";
    showStep("wall", true);
    grow = { t: still.matches ? 9 : 0 };
  } else if (step.id === "base") {
    showStep("base", true);
    if (shadow) shadow.style.visibility = "";
    piece.stand.x = 0; piece.stand.target = 0;
    if (!still.matches) thump = { t: 0, dy: 0 };
  } else if (construct) {
    let n = 0;
    showStep(step.id, true);
    for (const id of D.stepPieces[step.id]) {
      piece[id].x = 1; piece[id].v = 0;
      piece[id].pending = { value: 0, at: clock + (still.matches ? 0 : 0.18 + n++ * D.spring.stagger) };
    }
  } else if (step.id === "apart") {
    stage.setAttribute("data-apart", "");
    let n = 0;
    for (const id of D.stagger) { if (id === "stand") continue; piece[id].pending = { value: 1, at: clock + (still.matches ? 0 : n++ * D.spring.stagger) }; }
  } else if (step.id === "again") {
    let n = 0;
    for (const id of [...D.stagger].reverse()) { if (id === "stand") continue; piece[id].pending = { value: 0, at: clock + (still.matches ? 0 : n++ * D.spring.stagger) }; }
  }
  if (step.id === "bracket" && window.__ncInset) window.__ncInset.start();
  refreshButtons();
  stage.setAttribute("aria-valuetext", `${i + 1}. ${step.name}`);
  run();
}

function finishStep() {
  busy = false;
  if (STEPS[done] && STEPS[done].id === "again") stage.removeAttribute("data-apart");
  done += 1;
  speedEl.hidden = true;
  const next = STEPS[done];
  if (next) setTip(`下一步：按「${done + 1} ${next.name}」。`);
  else setTip("搭好了。按「从头来」再看一遍。");
  refreshButtons();
  if (mode === "auto") scheduleAuto();
}

function reset() {
  clearTimeout(autoTimer);
  busy = false;
  thump = null;
  done = 0;
  stage.removeAttribute("data-apart");
  grow = null;
  for (const node of nodes) if (node.step === "wall") node.el.style.opacity = "";
  for (const id of D.pieces) { piece[id].x = 1; piece[id].v = 0; piece[id].target = 1; piece[id].pending = null; }
  for (const s of STEPS) showStep(s.id, false);
  if (shadow) shadow.style.visibility = "hidden";
  piece.stand.x = 0; piece.stand.target = 0;
  place();
  if (window.__ncInset) window.__ncInset.stop(true);
  setTip("先把地基夯结实。按「1 夯台基」。");
  say("还是一块空地");
  chip("part").textContent = "空地";
  speedEl.hidden = true;
  refreshButtons();
  if (mode === "auto") scheduleAuto();
}

function scheduleAuto() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (mode !== "auto") return;
    if (done >= STEPS.length) reset();
    else press(done);
  }, done >= STEPS.length ? 2600 : done === 0 ? 900 : 1300);
}

function setMode(next) {
  mode = next;
  try { localStorage.setItem("nanchan-mode", next); } catch (e) {}
  modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === next)));
  if (next === "auto") { if (!busy) scheduleAuto(); } else clearTimeout(autoTimer);
}

// 分值滑杆：整座殿按 1 分的毫米数缩放（地上的十尺杆不变），读数一起重算
const anchor = D.anchor;
function setFen(value) {
  fen = Number(value);
  const scale = fen / D.fen;
  house.setAttribute("transform", Math.abs(scale - 1) < 1e-6 ? "" : `translate(${anchor[0]} ${anchor[1]}) scale(${scale.toFixed(4)}) translate(${-anchor[0]} ${-anchor[1]})`);
  fenOut.textContent = `${fen.toFixed(1)} mm`;
  fenNote.textContent = Math.abs(fen - D.fen) < 0.01 ? "实测（张荣 2022）" : "假想：换一把尺子";
  const c = D.chips;
  const cmOf = (f) => (f * fen) / 10;
  chip("fen").textContent = `1 分 = ${fen.toFixed(1)} mm`;
  chip("cai").textContent = `${c.cai.guang}×${c.cai.hou} 分 = ${cmOf(c.cai.guang).toFixed(1)}×${cmOf(c.cai.hou).toFixed(1)} cm`;
  chip("column").textContent = `${Math.round(c.column)} 分 = ${(cmOf(c.column) / 100).toFixed(2)} m`;
  chip("eave").textContent = `${Math.round(c.eave)} 分 = ${(cmOf(c.eave) / 100).toFixed(2)} m · 示意`;
  chip("ju").textContent = `${c.ju} 分 = ${(cmOf(c.ju) / 100).toFixed(2)} m · 1:${c.ratio.toFixed(2)}`;
  const step = STEPS[Math.max(0, done - 1)];
  if (done > 0) say(sayFor(step.id));
}
fenInput.addEventListener("input", () => setFen(fenInput.value));

stepButtons.forEach((b, i) => b.addEventListener("click", () => { if (mode === "auto") setMode("manual"); press(i); }));
modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
resetLink.addEventListener("click", (event) => { event.preventDefault(); reset(); });
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter" || event.key === "ArrowRight") { event.preventDefault(); press(done); }
  if (event.key === "Home" || event.key === "Escape") { event.preventDefault(); reset(); }
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
let manualNow = 0;
window.__nc = { debug: () => JSON.stringify({ reorders, x: Object.fromEntries(Object.entries(piece).map(([k, v]) => [k, +v.x.toFixed(6)])) }), zooms: () => { const r = svg.getBoundingClientRect(); const k = r.width / D.W; return Object.fromEntries(Object.entries(D.zooms).map(([n, p]) => [n, [p[0] * k, p[1] * k]])); }, press: (i) => press(i ?? done), reset, state: () => ({ done, busy, mode, fen }), setFen,
  advance(sec) { if (!manual) { manual = true; root.setAttribute("data-manual", ""); cancelAnimationFrame(frame); frame = 0; manualNow = 1000; last = manualNow; } const n = Math.max(1, Math.round(sec * 60)); if (sec === 0) { tick(manualNow); return busy; } for (let i = 0; i < n; i++) { manualNow += (sec * 1000) / n; tick(manualNow); } return busy; } };

reset();
setFen(fen);
setMode(mode);
