(function (root) {
  'use strict';
  const data = typeof module !== 'undefined' ? require('./data.js') : root.CoalData;
  const hot = typeof module !== 'undefined' ? require('./sim.hot.js') : root.CoalHot;
  function create(seed = 1, level = 0, stress = false) {
    level = Math.max(0, Math.min(data.levels.length - 1, Math.floor(Number(level) || 0)));
    const s = {
      data, stage: data.levels[level], stageIndex: level, seed: (Number(seed) >>> 0) || 1, rng: (Number(seed) >>> 0) || 1,
      phase: 0, tick: 0, x: 180, y: 260, vx: 0, vy: 0, hp: 6, maxHP: 6, invuln: 0,
      xp: 0, nextXP: 10, level: 1, revives: 0, revivals: 0, kills: 0, shots: 0, collected: 0,
      nextSpawn: 60, fire: 0, beam: 0, boss: -1, live: 0, peak: 0, spawned: 0, wall: 0, gCursor: 0,
      off: 0, burst: 0, warning: 0, event: 0, hits: 0, resets: 0, warnings: 0, fakeReveals: 0, fakeBites: 0,
      compressions: 0, pullFrames: 0, cloneHits: 0, zones: 0, zoneContacts: 0, stress: !!stress,
      cards: new Uint8Array(8), offer: new Int8Array(3).fill(-1), chosen: new Uint8Array(32), chosenCount: 0
    };
    for (const key of ['eOn', 'eKind', 'ex', 'ey', 'eHP', 'er', 'eSpeed', 'eBorn', 'eFlash', 'eHit']) s[key] = new Float64Array(512);
    for (const key of ['gOn', 'gx', 'gy', 'gFake', 'gBorn', 'gReveal', 'gValue']) s[key] = new Float64Array(768);
    for (const key of ['bOn', 'bx', 'by', 'bvx', 'bvy', 'bKind', 'bDamage', 'bID']) s[key] = new Float64Array(256);
    for (const key of ['zOn', 'zx', 'zy', 'zBorn']) s[key] = new Float64Array(12);
    s.bHit = new Uint32Array(256 * 512);
    return s;
  }
  // Cold inspection / persistence. Never called by the simulation.
  function snapshot(s) {
    return { seed: s.seed, tick: s.tick, seconds: s.tick / 60, phase: ['play', 'levelup', 'won', 'dead'][s.phase],
      level: s.stageIndex + 1, x: s.x, y: s.y, hp: s.hp, xp: s.xp, rank: s.level, kills: s.kills, enemies: s.live,
      cards: Array.from(s.cards), offers: Array.from(s.offer), warning: s.warning, off: s.off, burst: s.burst, wall: s.wall,
      bossHP: s.boss < 0 ? null : s.eHP[s.boss], hits: s.hits, resets: s.resets, compressions: s.compressions,
      fakeReveals: s.fakeReveals, shots: s.shots, zones: s.zones, revivals: s.revivals };
  }
  function unlocked(value) { const n = Number(value); return Number.isInteger(n) && n >= 1 && n <= data.levels.length ? n : 1; }
  const api = { data, create, step: hot, snapshot, unlocked };
  if (typeof module !== 'undefined') module.exports = api; else root.CoalCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
