(function (root) {
  'use strict';
  const data = {
    width: 360, height: 520, fps: 60,
    // Hero: drawn 2 units per sprite pixel. Damage uses the body centre; walls and props stop the feet.
    hero: { speed: 2.1, hitRadius: 10, footY: 20, footRadius: 14, orbit: 34, minX: 22, maxX: 338, minY: 46, maxY: 489 },
    // Props (half sizes in units): server rack, token crates, coal heap, old terminal. Bullets fly over them.
    props: [{ hw: 21, hh: 28 }, { hw: 24, hh: 21 }, { hw: 26, hh: 18 }, { hw: 20, hh: 17 }],
    // Candidate prop centres, kept clear of the start point, the boss entrances and the field edge.
    slots: [[84, 128], [276, 128], [76, 262], [284, 262], [86, 392], [274, 392], [180, 452], [180, 164]],
    url: 'https://aliceljy.github.io/playground/coal-breakout/',
    levels: [
      { name: '幻觉怪', subtitle: '眼见，也不一定为实。', duration: 6000, kind: 0, props: 4, boss: '大幻觉', bossHP: 65, mechanism: 1,
        wavePeriod: 480, waveLength: 150, mimicSpeed: 125, clonePeriod: 300, cloneSpeed: 80,
        hint: '捡绿色经验 · 粉芯闪烁的宝石会咬人', briefing: '躲开问号团，靠捡经验升级。粉芯闪烁的宝石是假货；靠近它会先张口，再追咬。首领只有白色描边的真身会受伤。' },
      { name: '上下文溢出', subtitle: '给自己，留一点余地。', duration: 7800, kind: 1, props: 4, boss: '上下文黑洞', bossHP: 150, mechanism: 2,
        wallRate: .04, wallMax: 84, elitePeriod: 2100, eliteOffset: 900, pull: 1.1, wavePeriod: 600, waveLength: 180,
        hint: '文字墙正在收紧 · 击败黄色压缩器推回墙', briefing: '文字墙会向内挤。优先靠近黄色压缩器，让助手打掉它腾出空间。首领会把你和宝石吸向中心，逆着引力走。' },
      { name: '额度重置', subtitle: '停火四秒，也要活下去。', duration: 7800, kind: 2, props: 4, boss: '429 限流大魔王', bossHP: 420, mechanism: 3,
        hint: '每 40 秒停火 4 秒 · 红条预警时先找空地', briefing: '每 40 秒重置额度：提前 3 秒警报，停火 4 秒，随后爆发 5 秒。首领的黄框将在 1.2 秒后变红，别留在里面。' }
    ],
    enemies: [
      { hp: 2, speed: 30, radius: 9 }, { hp: 3, speed: 55, radius: 10 },
      { hp: 2, speed: 39, radius: 9 }, { hp: 14, speed: 23, radius: 13 },
      { hp: 3, speed: 70, radius: 10 }, { hp: 200, speed: 23, radius: 26 },
      { hp: 1, speed: 23, radius: 23 }
    ],
    cards: [
      { name: '子 agent', tag: '环绕火力', desc: '增加一个自动索敌的小助手，围着你一起开火。', icon: '++' },
      { name: 'lint 规则', tag: '直线清场', desc: '每 2 秒打出穿透光束。升级增加伤害和光束宽度。', icon: '/', workflow: 'clear' },
      { name: '并行调用', tag: '扇形弹幕', desc: '每个助手每轮多射一发，覆盖两侧的敌人。', icon: '≋', workflow: 'clear' },
      { name: '重试三次', tag: '更快出手', desc: '助手的开火间隔缩短 18%，近身压力更小。', icon: '»' },
      { name: '上下文压缩', tag: '远处拾取', desc: '拾取半径增加 24；不必走进敌群也能升级。', icon: '↧', workflow: 'sustain' },
      { name: 'checkpoint 存档', tag: '多一次机会', desc: '增加一次免死：原地回满生命，推开周围敌人。', icon: '♥', workflow: 'sustain' },
      { name: '缓存命中', tag: '高速走位', desc: '移动速度提高 15%，更快穿过包围与预警区。', icon: '↗' },
      { name: '温度调低', tag: '精准重击', desc: '暴击率增加 22%；暴击造成三倍伤害。', icon: '✦' }
    ]
  };
  if (typeof module !== 'undefined') module.exports = data;
  else root.CoalData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
