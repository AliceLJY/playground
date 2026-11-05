// 刀马旦精灵 · 角色状态机。浏览器与 Node 测试共用：输入 → 状态、帧号、位置、朝向。
// 没有画面、不碰 DOM——画图在 game.js。规格与验收条目见 README_CN.md。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DMD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 跑步没有自己的帧：六段跑步视频都过不了循环检测，暂用走路帧加速（README「已知不足」）。
  const RUN_PLAYBACK = 2.2;     // 跑步时走路帧的播放倍速
  const WALK_SPEED = 0.12;      // 舞台像素 / 毫秒
  const RUN_SPEED = 0.30;
  const ONE_SHOTS = ['attack', 'jump', 'hurt'];

  const isOneShot = (s) => ONE_SHOTS.includes(s);

  function create(clips, opts = {}) {
    return {
      clips,
      x: opts.x ?? 300,
      minX: opts.minX ?? 80,
      maxX: opts.maxX ?? 880,
      face: 1,
      state: 'idle',
      frame: 0,
      acc: 0,
      plays: { idle: 0, walk: 0, attack: 0, jump: 0, hurt: 0 },
    };
  }

  function setState(p, s) {
    if (p.state === s) return;
    p.state = s; p.frame = 0; p.acc = 0;
    p.plays[s] = (p.plays[s] || 0) + 1;
  }

  // 一招没收完之前不接下一招，走路和待机随时可以被出招打断。
  function trigger(p, action) {
    if (!isOneShot(action) || isOneShot(p.state)) return false;
    setState(p, action);
    return true;
  }

  // input: { left, right, run }，dt 毫秒。
  function step(p, input, dt) {
    const moving = !!input.left !== !!input.right;
    if (!isOneShot(p.state)) {
      if (moving) { p.face = input.right ? 1 : -1; setState(p, 'walk'); }
      else setState(p, 'idle');
    }
    const clip = p.clips[p.state];
    const rate = p.state === 'walk' && input.run ? RUN_PLAYBACK : 1;
    p.acc += dt * rate;
    let guard = 0;
    while (p.acc >= clip.ms[p.frame % clip.ms.length] && guard++ < 1000) {
      p.acc -= clip.ms[p.frame % clip.ms.length];
      p.frame++;
      if (p.frame >= clip.count) {
        if (isOneShot(p.state)) {
          setState(p, moving ? 'walk' : 'idle');
          if (moving) p.face = input.right ? 1 : -1;
          break;
        }
        p.frame = 0;
      }
    }
    if (p.state === 'walk') p.x += p.face * dt * (input.run ? RUN_SPEED : WALK_SPEED);
    p.x = Math.max(p.minX, Math.min(p.maxX, p.x));
    return p;
  }

  // 这一帧在图集里的位置，以及画到舞台上时相对脚底锚点的偏移。
  function cellOf(clip, frame) {
    const f = Math.max(0, Math.min(frame, clip.count - 1));
    const [w, h] = clip.cell;
    return { sx: (f % clip.cols) * w, sy: Math.floor(f / clip.cols) * h, w, h, dx: -clip.anchor[0], dy: -clip.anchor[1] };
  }

  const durationMs = (clip) => clip.ms.reduce((a, b) => a + b, 0);

  return { RUN_PLAYBACK, WALK_SPEED, RUN_SPEED, ONE_SHOTS, isOneShot, create, setState, trigger, step, cellOf, durationMs };
});
