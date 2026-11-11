// 骑楼雨夜 · 界面。只读游戏状态、往外发意图（data-act），不在这里另写一份规则。
import * as THREE from 'three';
import { P, EXTRACT, objective, rating, sealedCount } from './core.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const mmss = t => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const _v = new THREE.Vector3();

export function loadSettings() {
  const d = { sens: 1, vol: 0.7, quality: '' };
  try { Object.assign(d, JSON.parse(localStorage.getItem('qilou-rain') || '{}')); } catch (e) { /* 隐私模式下存不了就用默认值 */ }
  return d;
}
export function saveSettings(s) { try { localStorage.setItem('qilou-rain', JSON.stringify(s)); } catch (e) { /* 同上 */ } }

export function createUI(settings, quality) {
  const menu = $('#menu'), hud = $('#hud'), panel = $('.panel'), boot = $('#boot');
  const el = { text: $('#o-text'), sub: $('#o-sub'), pips: $$('.obj .pips i'), hp: $('.hp'), hpBar: $('.hp .bar i'), num: $('#a-num'), tank: $('.ammo .bar i'), cans: $('.cans'), state: $('.ammo .state'), cross: $('.cross'), radio: $('.radio'), toast: $('.toast'), prompt: $('.prompt'), dmg: $('.dmg'), dir: $('.dir'), use: $('#b-use') };
  const marks = Object.fromEntries($$('.mark').map(m => [m.dataset.m, m]));
  let act = () => {}, radioT = 0, toastT = 0, hitT = 0, dmgA = 0, dirA = 0, lastCans = -1, lastText = '', lastSub = '', backTo = 'title', screen = 'none';
  menu.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });
  $$('.tab').forEach(t => t.addEventListener('click', () => tab(t.dataset.tab)));
  function tab(name) { $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name))); $$('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== name; }); }
  const sens = $('#s-sens'), vol = $('#s-vol');
  sens.value = settings.sens; vol.value = settings.vol;
  $$('[data-q]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.q === quality.name)); b.addEventListener('click', () => act('quality:' + b.dataset.q)); });
  sens.addEventListener('input', () => { settings.sens = +sens.value; saveSettings(settings); });
  vol.addEventListener('input', () => { settings.vol = +vol.value; saveSettings(settings); act('volume'); });

  return {
    onAct(fn) { act = fn; },
    get screen() { return screen; },
    boot(msg, p) { $('#boot-msg').textContent = msg; $('#boot-bar').style.setProperty('--p', p); },
    bootDone() { boot.classList.add('gone'); setTimeout(() => { boot.hidden = true; }, 600); },
    setTouch(on) { document.body.classList.toggle('touch', on); },
    show(name) {
      screen = name; menu.dataset.s = name; menu.classList.toggle('on', name !== 'none'); hud.hidden = name === 'title';
      panel.hidden = true;
      if (name !== 'none') { const b = $(`.s-${name} .btn.pri`); if (b && !document.body.classList.contains('touch')) b.focus({ preventScroll: true }); }
    },
    panel(name) { if (!name) { panel.hidden = true; return; } panel.hidden = false; tab(name); },
    get panelOpen() { return !panel.hidden; },
    fillEnd(sim) {
      const s = sim.stats, R = rating(sim), set = (k, v) => { const n = $(`[data-f="${k}"]`); if (n) n.textContent = v; };
      set('d-time', mmss(sim.t)); set('d-seal', sealedCount(sim) + '/3'); set('d-kills', s.kills);
      set('d-tip', s.sprayT < 3 ? '提示：远处的先用喷雾，别等它们围上来。' : sim.player.cans === 0 && sim.player.tank <= 0 ? '提示：药罐空了就去骑楼底下找红箱子，手里还有凉拖。' : '提示：它抬起前身、眼睛变红，就是要扑了，横着走一步或者先拍。');
      set('w-time', mmss(sim.t)); set('w-acc', Math.round(R.acc * 100) + '%'); set('w-kills', s.kills); set('w-slaps', s.slapHits); set('w-rate', R.name);
    },
    radio(who, text) { el.radio.firstElementChild.textContent = who; el.radio.lastElementChild.textContent = text; el.radio.classList.add('on'); radioT = 2.2 + text.length * 0.13; },
    toast(text) { el.toast.textContent = text; el.toast.classList.add('on'); toastT = 1.8; },
    hit(kill) { el.cross.classList.toggle('kill', !!kill); el.cross.classList.toggle('hit', !kill); hitT = kill ? 0.3 : 0.12; },
    hurt(rel) { dmgA = 1; dirA = 1; el.dir.style.transform = `rotate(${rel}rad)`; },
    hud(sim, camera, w, h, dt, touch) {
      const p = sim.player, obj = objective(sim), n = sealedCount(sim);
      if (obj.text !== lastText) { lastText = obj.text; el.text.textContent = obj.text; }
      const sub = n < 3 ? n + '/3' : '';
      if (sub !== lastSub) { lastSub = sub; el.sub.textContent = sub; el.pips.forEach((q, i) => q.classList.toggle('on', i < n)); }
      el.hpBar.style.transform = `scaleX(${Math.max(0, p.hp / P.hp)})`; el.hp.classList.toggle('low', p.hp <= 35);
      el.num.textContent = Math.round(p.tank); el.num.classList.toggle('low', p.tank < 20);
      el.tank.style.transform = `scaleX(${p.tank / P.tank})`;
      if (p.cans !== lastCans) { lastCans = p.cans; el.cans.innerHTML = '<i></i>'.repeat(p.cans); }
      el.cross.classList.toggle('on', !!p.aimOn);
      el.state.textContent = p.reloadT > 0 ? '换罐中' : p.tank <= 0 ? (p.cans > 0 ? (touch ? '点「换罐」' : '按 R 换罐') : '没药了 · 用凉拖') : '';
      // 目标标记：投到屏幕上，出了画面就贴边
      const targets = sim.drains.filter(d => !d.sealed).map(d => [d.id, d.x, d.z]);
      if (sim.extractOpen) targets.push(['X', EXTRACT.x, EXTRACT.z]);
      for (const k in marks) marks[k].hidden = true;
      for (const [id, x, z] of targets) {
        const m = marks[id]; m.hidden = false;
        _v.set(x, 1.6, z).project(camera);
        let sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h;
        const behind = _v.z > 1;
        if (behind) { sx = w - sx; sy = h * 0.9; }
        const pad = 34, cx = Math.min(w - pad, Math.max(pad, sx)), cy = Math.min(h - 150, Math.max(64, sy));
        m.style.transform = `translate(${cx - 13}px, ${cy - 13}px)`;
        m.lastElementChild.textContent = Math.round(Math.hypot(x - p.x, z - p.z)) + '米';
        m.classList.toggle('dimmed', id !== obj.id && id !== 'X');
      }
      const d = sim.near;
      el.prompt.hidden = !d;
      if (d) {
        el.prompt.firstElementChild.innerHTML = sim.sealLock > 0 ? '被咬断了！先清掉身边的' : touch ? '按住绿色的「封」' : '按住 <kbd>E</kbd> 把井盖推回去';
        el.prompt.lastElementChild.firstElementChild.style.width = Math.round(d.prog * 100) + '%';
      }
      el.use.hidden = !d;
      if (radioT > 0) { radioT -= dt; if (radioT <= 0) el.radio.classList.remove('on'); }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('on'); }
      if (hitT > 0) { hitT -= dt; if (hitT <= 0) el.cross.classList.remove('hit', 'kill'); }
      const low = p.hp <= 35 ? 0.35 + 0.15 * Math.sin(sim.t * 6) : 0;
      dmgA = Math.max(0, dmgA - dt * 1.6); dirA = Math.max(0, dirA - dt * 1.1);
      el.dmg.style.opacity = Math.max(dmgA, low).toFixed(2); el.dir.style.opacity = dirA.toFixed(2);
    },
    reset() { lastCans = -1; lastText = ''; lastSub = 'x'; el.radio.classList.remove('on'); el.toast.classList.remove('on'); dmgA = dirA = 0; },
  };
}
