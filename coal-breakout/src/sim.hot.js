'use strict';
// All simulation work, including spawning and card offers, stays in this allocation-free file.
// Named top-level declarations only. Pools and tables are created by core.js before play.
function random(s) {
  s.rng ^= s.rng << 13; s.rng ^= s.rng >>> 17; s.rng ^= s.rng << 5;
  return (s.rng >>> 0) / 4294967296;
}
function bound(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
// Props: a seeded handful of axis-aligned boxes chosen from fixed slots, built once by core.create.
function layout(s) {
  const mode = s.stage.mechanism, count = s.stage.props, slots = s.data.slots;
  // Small seeds start xorshift near zero; burn a few draws so seeds 1, 2, 3 ... and each level get different rooms.
  for (let k = 0; k < 6 + s.stageIndex * 6; k++) random(s);
  let used = 0, kind = Math.floor(random(s) * 4);
  for (let n = 0; n < count; n++) {
    let k = Math.floor(random(s) * slots.length), tries = 0;
    // The context stage keeps its middle open: the shrinking wall is that level's obstacle.
    while (tries++ < 16 && ((used >> k & 1) || mode === 2 && k === 7)) k = (k + 1) % slots.length;
    used |= 1 << k; kind = (kind + 1) % 4;
    const size = s.data.props[kind];
    s.oOn[n] = 1; s.oKind[n] = kind; s.ohw[n] = size.hw; s.ohh[n] = size.hh;
    s.ox[n] = Math.round(slots[k][0] + (random(s) - .5) * 12); s.oy[n] = Math.round(slots[k][1] + (random(s) - .5) * 12);
  }
  s.flowOn = 0;
}
// Circle-versus-box separation for every live prop. Writes the corrected centre to s.cx / s.cy.
function pushOut(s, x, y, r) {
  for (let i = 0; i < s.oOn.length; i++) {
    if (!s.oOn[i]) continue;
    const l = s.ox[i] - s.ohw[i], rr = s.ox[i] + s.ohw[i], t = s.oy[i] - s.ohh[i], b = s.oy[i] + s.ohh[i];
    const qx = bound(x, l, rr), qy = bound(y, t, b), dx = x - qx, dy = y - qy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); x = qx + dx / d * r; y = qy + dy / d * r; }
    else {
      // Centre inside the box: leave by the shallowest side.
      const pl = x - l, pr = rr - x, pt = y - t, pb = b - y, m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = l - r; else if (m === pr) x = rr + r; else if (m === pt) y = t - r; else y = b + r;
    }
  }
  s.cx = x; s.cy = y;
}
// Segment against every live prop grown by r (slab test). 1 = clear line.
function clear(s, x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0;
  for (let i = 0; i < s.oOn.length; i++) {
    if (!s.oOn[i]) continue;
    let lo = 0, hi = 1;
    const l = s.ox[i] - s.ohw[i] - r, rr = s.ox[i] + s.ohw[i] + r, t = s.oy[i] - s.ohh[i] - r, b = s.oy[i] + s.ohh[i] + r;
    if (Math.abs(dx) < 1e-9) { if (x0 < l || x0 > rr) continue; }
    else { let a = (l - x0) / dx, c = (rr - x0) / dx; if (a > c) { const w = a; a = c; c = w; } lo = Math.max(lo, a); hi = Math.min(hi, c); }
    if (lo > hi) continue;
    if (Math.abs(dy) < 1e-9) { if (y0 < t || y0 > b) continue; }
    else { let a = (t - y0) / dy, c = (b - y0) / dy; if (a > c) { const w = a; a = c; c = w; } lo = Math.max(lo, a); hi = Math.min(hi, c); }
    if (lo <= hi) return 0;
  }
  return 1;
}
function cellFree(s, cx, cy) {
  const x = cx * 12 + 6, y = cy * 12 + 6;
  for (let i = 0; i < s.oOn.length; i++) {
    if (s.oOn[i] && Math.abs(x - s.ox[i]) < s.ohw[i] + 8 && Math.abs(y - s.oy[i]) < s.ohh[i] + 8) return 0;
  }
  return 1;
}
// Breadth-first distance to the hero's feet on a 12-unit grid; enemies without a clear line follow it downhill.
function chase(s) {
  const flow = s.flow, queue = s.queue;
  flow.fill(-1);
  const gx = bound(Math.floor(s.x / 12), 0, 29), gy = bound(Math.floor((s.y + s.data.hero.footY) / 12), 0, 43);
  let head = 0, tail = 0; flow[gy * 30 + gx] = 0; queue[tail++] = gy * 30 + gx;
  while (head < tail) {
    const c = queue[head++], cx = c % 30, cy = (c - cx) / 30, d = flow[c] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || nx > 29 || ny < 0 || ny > 43) continue;
      const n = ny * 30 + nx;
      if (flow[n] >= 0 || !cellFree(s, nx, ny)) continue;
      flow[n] = d; queue[tail++] = n;
    }
  }
  s.flowOn = 1;
}
// Unit step direction for enemy i that walks around props. Writes s.cx / s.cy.
function steer(s, i) {
  const dx = s.x - s.ex[i], dy = s.y - s.ey[i], d = Math.hypot(dx, dy) || 1;
  s.cx = dx / d; s.cy = dy / d;
  if (!s.flowOn || clear(s, s.ex[i], s.ey[i], s.x, s.y + s.data.hero.footY * .5, s.er[i] * .8)) return;
  const cx = bound(Math.floor(s.ex[i] / 12), 0, 29), cy = bound(Math.floor(s.ey[i] / 12), 0, 43);
  let best = s.flow[cy * 30 + cx], bx = -1, by = -1;
  if (best < 0) best = 32767;
  for (let k = 0; k < 8; k++) {
    const ox = k === 0 || k === 4 || k === 5 ? 1 : k === 1 || k === 6 || k === 7 ? -1 : 0;
    const oy = k === 2 || k === 4 || k === 6 ? 1 : k === 3 || k === 5 || k === 7 ? -1 : 0;
    const nx = cx + ox, ny = cy + oy;
    if (nx < 0 || nx > 29 || ny < 0 || ny > 43) continue;
    const v = s.flow[ny * 30 + nx];
    // No corner cutting: a diagonal needs both of its side cells open.
    if (v < 0 || ox && oy && (s.flow[cy * 30 + nx] < 0 || s.flow[ny * 30 + cx] < 0)) continue;
    if (v < best) { best = v; bx = nx; by = ny; }
  }
  if (bx < 0) return;
  const tx = bx * 12 + 6 - s.ex[i], ty = by * 12 + 6 - s.ey[i], td = Math.hypot(tx, ty) || 1;
  s.cx = tx / td; s.cy = ty / td;
}
function enemy(s, kind, x, y) {
  for (let i = 0; i < s.eOn.length; i++) {
    if (s.eOn[i]) continue;
    const d = s.data.enemies[kind];
    s.cx = x; s.cy = y; if (d.radius < 20) pushOut(s, x, y, d.radius);
    s.eOn[i] = 1; s.eKind[i] = kind; s.ex[i] = s.cx; s.ey[i] = s.cy;
    s.eHP[i] = d.hp; s.er[i] = d.radius;
    s.eSpeed[i] = kind === 4 && s.stage.mechanism === 1 ? s.stage.mimicSpeed : kind === 6 && s.stage.mechanism === 1 ? s.stage.cloneSpeed : d.speed;
    s.eBorn[i] = s.tick; s.eFlash[i] = 0; s.eHit[i] = -1;
    s.live++; s.spawned++; s.peak = Math.max(s.peak, s.live);
    return i;
  }
  return -1;
}
function gem(s, x, y, fake, value) {
  for (let i = 0; i < s.gOn.length; i++) {
    if (s.gOn[i]) continue;
    pushOut(s, x, y, 6);
    s.gOn[i] = 1; s.gx[i] = s.cx; s.gy[i] = s.cy; s.gFake[i] = fake;
    s.gBorn[i] = s.tick; s.gReveal[i] = 0; s.gValue[i] = value;
    return i;
  }
  // Pool exhaustion conserves experience: replace an old real gem, carrying its value.
  const i = s.gCursor++ % s.gOn.length;
  s.gx[i] = x; s.gy[i] = y; s.gValue[i] += value; s.gFake[i] = 0; s.gReveal[i] = 0;
  return i;
}
function hurt(s) {
  if (s.invuln > 0 || s.phase !== 0) return;
  s.hp--; s.hits++; s.invuln = 84; s.hurtUntil = s.tick + 18; s.event = 3;
  if (s.hp > 0) return;
  if (s.revives > 0) {
    s.revives--; s.hp = s.maxHP; s.invuln = 180; s.hurtUntil = 0; s.revivals++; s.event = 7;
    for (let i = 0; i < s.eOn.length; i++) {
      if (!s.eOn[i]) continue;
      const dx = s.ex[i] - s.x, dy = s.ey[i] - s.y, d = Math.hypot(dx, dy) || 1;
      if (d < 110) {
        s.ex[i] = bound(s.ex[i] + dx / d * 90, 20, 340); s.ey[i] = bound(s.ey[i] + dy / d * 90, 24, 494);
        if (s.er[i] < 20) { pushOut(s, s.ex[i], s.ey[i], s.er[i]); s.ex[i] = s.cx; s.ey[i] = s.cy; }
      }
    }
  } else { s.phase = 3; s.event = 5; }
}
function hit(s, i, damage) {
  if (s.eKind[i] === 6) { s.eFlash[i] = 12; s.cloneHits++; return; }
  s.eHP[i] -= damage; s.eFlash[i] = 8;
  if (s.eHP[i] > 0) return;
  s.eOn[i] = 0; s.live--; s.kills++; s.event = 1;
  if (i === s.boss) { s.phase = 2; s.event = 6; return; }
  if (s.eKind[i] === 3) { s.wall = Math.max(0, s.wall - 18); s.compressions++; s.event = 8; }
  gem(s, s.ex[i], s.ey[i], 0, s.eKind[i] === 3 ? 12 : 2);
}
function bullet(s, x, y, angle, beam) {
  for (let i = 0; i < s.bOn.length; i++) {
    if (s.bOn[i]) continue;
    s.bOn[i] = beam ? 22 : 55; s.bx[i] = x; s.by[i] = y;
    s.bvx[i] = Math.cos(angle) * (beam ? 13 : 5.6);
    s.bvy[i] = Math.sin(angle) * (beam ? 13 : 5.6);
    s.bKind[i] = beam; s.bDamage[i] = beam ? 2 + s.cards[1] * 2 : random(s) < s.cards[7] * .22 ? 3 : 1;
    s.bID[i] = ++s.shots;
    return;
  }
}
// Pure selection: reuse offer order and never advance the seeded RNG.
function autoChoice(s) {
  if (s.workflow === 'clear' || s.workflow === 'sustain') {
    for (let i = 0; i < 3; i++) {
      const c = s.offer[i];
      if (c >= 0 && c < s.cards.length && s.cards[c] < 3 && s.data.cards[c].workflow === s.workflow) return i;
    }
  }
  return 0;
}
function offer(s) {
  s.phase = 1;
  for (let j = 0; j < 3; j++) {
    let c = Math.floor(random(s) * 8), tries = 0;
    while (tries++ < 24 && (s.cards[c] >= 3 || c === s.offer[0] && j > 0 || c === s.offer[1] && j > 1)) c = (c + 1) % 8;
    s.offer[j] = tries > 24 ? -1 : c;
  }
  if (s.level % 2 === 0) { const choice = autoChoice(s); s.autoCard = s.offer[choice]; s.autoUntil = s.tick + 150; choose(s, choice); s.event = 12; }
}
function choose(s, choice) {
  if (s.phase !== 1 || choice < -1 || choice > 2 || choice !== Math.floor(choice)) return;
  if (choice >= 0 && s.offer[choice] >= 0) {
    const c = s.offer[choice];
    s.cards[c]++; if (s.chosenCount < s.chosen.length) s.chosen[s.chosenCount++] = c;
    if (c === 5) s.revives++;
  }
  s.level++; s.prevXP = s.nextXP; s.nextXP += 10 + s.level * 5;
  if (s.level % 3 === 0) s.hp = Math.min(s.maxHP, s.hp + 1);
  s.phase = 0; s.event = 2;
}
function spawn(s) {
  const side = Math.floor(random(s) * 4), t = random(s), w = s.wall;
  let x = 20 + w + t * (320 - w * 2), y = 28 + w + t * (464 - w * 2);
  if (side === 0) x = 20 + w;
  if (side === 1) x = 340 - w;
  if (side === 2) y = 28 + w;
  if (side === 3) y = 492 - w;
  const i = enemy(s, s.stage.kind, x, y);
  if (i >= 0) s.eSpeed[i] *= .85 + random(s) * .3 + Math.min(.55, s.tick / s.stage.duration * .4);
}
function zone(s, x, y) {
  for (let i = 0; i < s.zOn.length; i++) {
    if (s.zOn[i]) continue;
    s.zOn[i] = 150; s.zx[i] = bound(x, 52, 308); s.zy[i] = bound(y, 56, 464);
    s.zBorn[i] = s.tick; s.zones++;
    return;
  }
}
function step(s, ix, iy, card) {
  s.event = 0;
  if (s.phase === 1) { if (card >= -1 && card <= 2) choose(s, card); return; }
  if (s.phase !== 0) return;
  s.tick++; if (s.invuln > 0) s.invuln--;
  const mode = s.stage.mechanism;
  const cycle = s.tick % 2400;
  s.warning = mode === 3 && cycle >= 2220 ? 2400 - cycle : 0;
  const wasOff = s.off;
  s.off = mode === 3 && s.tick >= 2400 && cycle < 240 ? 240 - cycle : 0;
  s.burst = mode === 3 && s.tick >= 2400 && cycle >= 240 && cycle < 540 ? 540 - cycle : 0;
  if (s.off && !wasOff) { s.resets++; s.event = 9; }
  if (s.warning === 180) { s.warnings++; s.event = 10; }
  if (wasOff && !s.off) s.event = 11;
  if (mode === 2) {
    s.wall = Math.min(s.stage.wallMax, s.wall + s.stage.wallRate);
    // The token wall swallows a prop before the gap between them gets narrower than the hero.
    for (let i = 0; i < s.oOn.length; i++) {
      if (s.oOn[i] && Math.min(s.ox[i] - s.ohw[i], s.oy[i] - s.ohh[i], 360 - s.ox[i] - s.ohw[i], 520 - s.oy[i] - s.ohh[i]) < s.wall + 34) { s.oOn[i] = 0; s.flowOn = 0; }
    }
  }
  const length = Math.hypot(ix, iy);
  if (length > 1) { ix /= length; iy /= length; }
  const speed = s.data.hero.speed * (1 + s.cards[6] * .15);
  s.vx = ix * speed; s.vy = iy * speed;
  s.x += s.vx; s.y += s.vy;
  if (s.boss >= 0 && mode === 2) {
    const dx = 180 - s.x, dy = 260 - s.y, d = Math.hypot(dx, dy) || 1;
    s.x += dx / d * s.stage.pull; s.y += dy / d * s.stage.pull; s.pullFrames++;
  }
  const hero = s.data.hero;
  s.x = bound(s.x, hero.minX + s.wall, hero.maxX - s.wall);
  s.y = bound(s.y, hero.minY + s.wall, hero.maxY - s.wall);
  pushOut(s, s.x, s.y + hero.footY, hero.footRadius);
  if (s.cx !== s.x || s.cy !== s.y + hero.footY) s.blocked++;
  s.x = s.cx; s.y = s.cy - hero.footY;
  if (s.tick % 6 === 1) chase(s);
  if (s.tick === 1) {
    gem(s, 190, 210, 0, 2); gem(s, 220, 250, 0, 2); gem(s, 150, 275, 0, 2);
  }
  if (s.stress && s.live < 320) { for (let j = 0; j < 12; j++) spawn(s); }
  if (s.tick >= s.nextSpawn) {
    spawn(s); if (s.tick > 3600) spawn(s);
    // Short pressure waves alternate with recovery; average traffic stays near the original cadence.
    const cadence = mode < 3 && s.tick >= 1800 ? s.tick % s.stage.wavePeriod < s.stage.waveLength ? .5 : 1.5 : 1;
    s.nextSpawn = s.tick + Math.round(Math.max(22, 75 - Math.floor(s.tick / 190)) * cadence);
  }
  if (mode === 1 && s.tick % 270 === 0) gem(s, 30 + random(s) * 300, 40 + random(s) * 440, 1, 2);
  if (mode === 2 && s.tick % s.stage.elitePeriod === s.stage.eliteOffset) enemy(s, 3, 60 + random(s) * 240, 64 + s.wall);
  if (s.tick === s.stage.duration) {
    s.boss = enemy(s, 5, 180, 100); s.eHP[s.boss] = s.stage.bossHP; s.event = 4;
    if (mode === 2) { s.ex[s.boss] = 180; s.ey[s.boss] = 260; }
  }
  if (s.boss >= 0 && mode === 1 && (s.tick - s.stage.duration) % s.stage.clonePeriod === 0) {
    for (let j = 0; j < s.eOn.length; j++) if (s.eOn[j] && s.eKind[j] === 6) { s.eOn[j] = 0; s.live--; }
    enemy(s, 6, bound(s.ex[s.boss] - 74, 30, 330), bound(s.ey[s.boss] + 40, 40, 480));
    enemy(s, 6, bound(s.ex[s.boss] + 74, 30, 330), bound(s.ey[s.boss] - 40, 40, 480));
  }
  if (s.boss >= 0 && mode === 3 && (s.tick - s.stage.duration) % 180 === 0) {
    zone(s, s.x, s.y); zone(s, 52 + random(s) * 256, 56 + random(s) * 408);
  }
  for (let i = 0; i < s.eOn.length; i++) {
    if (!s.eOn[i]) continue;
    if (s.eFlash[i]) s.eFlash[i]--;
    if (s.tick - s.eBorn[i] < 36) continue;
    if (i !== s.boss || mode !== 2) {
      // Ordinary monsters walk around props; the huge boss and its clones are phantoms that drift over them.
      if (s.er[i] < 20) steer(s, i);
      else { const dx = s.x - s.ex[i], dy = s.y - s.ey[i], d = Math.hypot(dx, dy) || 1; s.cx = dx / d; s.cy = dy / d; }
      s.ex[i] += s.cx * s.eSpeed[i] / 60; s.ey[i] += s.cy * s.eSpeed[i] / 60;
      if (s.er[i] < 20) { pushOut(s, s.ex[i], s.ey[i], s.er[i]); s.ex[i] = s.cx; s.ey[i] = s.cy; }
    }
    if (Math.hypot(s.x - s.ex[i], s.y - s.ey[i]) < s.er[i] + s.data.hero.hitRadius) hurt(s);
  }
  if (s.phase === 3) return;
  for (let i = 0; i < s.zOn.length; i++) {
    if (!s.zOn[i]) continue;
    s.zOn[i]--;
    if (s.tick - s.zBorn[i] >= 72 && Math.abs(s.x - s.zx[i]) < 43 && Math.abs(s.y - s.zy[i]) < 43) { s.zoneContacts++; hurt(s); }
  }
  if (s.phase === 3) return;
  if (!s.off) {
    s.fire--; s.beam--;
    if (s.fire <= 0 || s.beam <= 0 && s.cards[1]) {
      let nearest = -1, distance = Infinity;
      for (let i = 0; i < s.eOn.length; i++) {
        if (!s.eOn[i] || s.tick - s.eBorn[i] < 36 || s.eKind[i] === 6) continue;
        const d = (s.ex[i] - s.x) ** 2 + (s.ey[i] - s.y) ** 2;
        if (d < distance) { nearest = i; distance = d; }
      }
      if (nearest >= 0) {
        if (s.fire <= 0) {
          for (let h = 0; h < 2 + s.cards[0]; h++) {
            const a = s.tick * .025 + h * Math.PI * 2 / (2 + s.cards[0]);
            const hx = s.x + Math.cos(a) * s.data.hero.orbit, hy = s.y + Math.sin(a) * s.data.hero.orbit;
            const aim = Math.atan2(s.ey[nearest] - hy, s.ex[nearest] - hx);
            for (let n = 0; n < 1 + s.cards[2]; n++) bullet(s, hx, hy, aim + (n - s.cards[2] / 2) * .14, 0);
          }
          s.fire = Math.round(36 * (.82 ** s.cards[3]) / (s.burst ? 2.4 : 1));
        }
        if (s.beam <= 0 && s.cards[1]) {
          bullet(s, s.x, s.y, Math.atan2(s.ey[nearest] - s.y, s.ex[nearest] - s.x), 1); s.beam = 120;
        }
      }
    }
  }
  for (let b = 0; b < s.bOn.length; b++) {
    if (!s.bOn[b]) continue;
    if (s.off) { s.bOn[b] = 0; continue; }
    s.bOn[b]--; s.bx[b] += s.bvx[b]; s.by[b] += s.bvy[b];
    if (s.bx[b] < 0 || s.bx[b] > 360 || s.by[b] < 0 || s.by[b] > 520) { s.bOn[b] = 0; continue; }
    for (let i = 0; i < s.eOn.length; i++) {
      if (!s.eOn[i] || s.tick - s.eBorn[i] < 36 || s.bHit[b * 512 + i] === s.bID[b]) continue;
      const dx = s.ex[i] - s.bx[b], dy = s.ey[i] - s.by[b], r = s.er[i] + (s.bKind[b] ? 4 + s.cards[1] : 3);
      if (dx * dx + dy * dy > r * r) continue;
      s.bHit[b * 512 + i] = s.bID[b]; hit(s, i, s.bDamage[b]);
      if (!s.bKind[b]) { s.bOn[b] = 0; break; }
    }
  }
  for (let i = 0; i < s.gOn.length; i++) {
    if (!s.gOn[i]) continue;
    let dx = s.x - s.gx[i], dy = s.y - s.gy[i], d = Math.hypot(dx, dy);
    if (s.gFake[i]) {
      if (!s.gReveal[i] && d < 48) { s.gReveal[i] = s.tick; s.fakeReveals++; }
      if (s.gReveal[i] && s.tick - s.gReveal[i] >= 42) { enemy(s, 4, s.gx[i], s.gy[i]); s.gOn[i] = 0; s.fakeBites++; }
      continue;
    }
    if (mode === 2 && s.boss >= 0) {
      const cx = 180 - s.gx[i], cy = 260 - s.gy[i], cd = Math.hypot(cx, cy) || 1;
      s.gx[i] += cx / cd * .45; s.gy[i] += cy / cd * .45;
    }
    if (d < 30 + s.cards[4] * 24) { s.gx[i] += dx * .14; s.gy[i] += dy * .14; }
    else if (mode === 2 && s.boss >= 0) { pushOut(s, s.gx[i], s.gy[i], 6); s.gx[i] = s.cx; s.gy[i] = s.cy; }
    if (d < 15) { s.xp += s.gValue[i]; s.gOn[i] = 0; s.collected++; }
  }
  if (s.phase === 0 && s.xp >= s.nextXP) offer(s);
}
step.random = random; step.enemy = enemy; step.gem = gem; step.hurt = hurt;
step.hit = hit; step.choose = choose; step.zone = zone;
step.autoChoice = autoChoice; step.layout = layout; step.pushOut = pushOut; step.clear = clear; step.chase = chase;
if (typeof module !== 'undefined') module.exports = step;
else globalThis.CoalHot = step;
