const C = require('../src/core.js'), P = require('../src/pilot.js');
for (const mode of ['precise', 'human', 'random', 'reckless']) {
  const rows = [];
  for (let seed = 1; seed <= 12; seed++) {
    const s = P.run(C, seed, Number(process.argv[2] || 0), mode);
    rows.push({ seed, win: s.phase === 2, t: +(s.tick / 60).toFixed(1), hp: s.hp, kills: s.kills, rank: s.level, hits: s.hits });
  }
  console.log(mode, JSON.stringify(rows));
}
