export const STATUSES = ['busy', 'waiting', 'done', 'idle', 'away', 'off', 'unknown'];
export const MINUTE = 60_000;
export const PUSH_TTL = 10 * MINUTE;
export const iso = (ms) => new Date(ms).toISOString();
export const beijingHour = (now) => new Date(now + 8 * 3_600_000).getUTCHours();
export const beijingDay = (now) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
export const isNight = (now) => beijingHour(now) >= 23 || beijingHour(now) < 8;
export const cleanText = (s, max = 80) => Array.from(String(s ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim()).slice(0, max).join('');

// The public API never exposes arbitrary task summaries. These are private categories only.
export function taskCategory(value) {
  const s = cleanText(value);
  if (/代码|编程|开发|code|debug|test/i.test(s)) return '编程';
  if (/视频|图片|素材|video|image|render/i.test(s)) return '媒体制作';
  if (/写|文稿|文档|write|draft/i.test(s)) return '写作';
  if (/查|搜索|研究|search|research/i.test(s)) return '资料整理';
  return s ? '处理任务' : '';
}

export function cleanNotice(value) {
  // Split before removing controls so a second line can never be pulled into a notice.
  // Limit the original first line before redaction, so shortened placeholders cannot pull later text in.
  let s = cleanText(String(value ?? '').split(/[\r\n\u2028\u2029]/u)[0]);
  s = s.replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/https?:\/\/\S+/giu, '〔链接〕')
    .replace(/(?:~?\/|[A-Z]:\\)[^\s，。；、]+/giu, '〔路径〕')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, '〔账号〕')
    .replace(/@[\p{L}\p{N}_.-]+/gu, '〔账号〕')
    .replace(/(?:账号|账户|account|token|api[_ -]?key|password)\s*[:：=]?\s*[^\s，。；]+/giu, '〔私密信息〕')
    .replace(/(?:(?:[$¥￥€£]|USD|CNY|RMB|EUR)\s*\d[\d,.]*|\d[\d,.]*\s*(?:元|美元|美金|人民币|万元|USD|CNY|RMB|EUR)|[零〇一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟]+(?:元|美元|美金))/giu, '〔金额〕')
    .replace(/\+?\d[\d -]{7,}\d/gu, '〔号码〕');
  return cleanText(s);
}

export function validTime(value, now) {
  return Number.isFinite(value) && value > 0 && value <= now + MINUTE;
}

export function inactive(lastSignalAt, now, fallback = 'idle') {
  if (!validTime(lastSignalAt, now)) return 'unknown';
  return now - lastSignalAt >= 30 * MINUTE ? (isNight(now) ? 'off' : 'idle') : fallback;
}

export function mtimeStatus({ running, mtime }, now) {
  if (running === false) return 'off';
  if (running !== true || !validTime(mtime, now)) return 'unknown';
  if (now - mtime < 3 * MINUTE) return 'busy';
  return inactive(mtime, now);
}

export function deriveSignal(source, signal, previous = {}, now) {
  const memory = { ...(previous.memory || {}) };
  const result = (status, extra = {}) => ({ status, memory, ...extra });
  if (!signal || signal.error) return result('unknown');
  if (source.type === 'push') {
    const at = previous.lastSignalAt;
    return result(at ? inactive(at, now) : 'idle', { badge: source.waitLabel || '' });
  }
  if (source.type === 'courier') return result('idle');
  if (source.type === 'codex') {
    if (signal.running === true) return result('busy', { lastSignalAt: now });
    if (signal.running !== false) return result('unknown');
    // No interactive process: the Codex app shows only through its rollout file, written while a turn runs.
    if (validTime(signal.rolloutMtime, now)) {
      if (now - signal.rolloutMtime < 3 * MINUTE) return result('busy', { lastSignalAt: signal.rolloutMtime });
      const lastSignalAt = Math.max(signal.rolloutMtime, previous.lastSignalAt || 0);
      return result(inactive(lastSignalAt, now), { lastSignalAt });
    }
    const lastSignalAt = previous.lastSignalAt || now;
    return result(inactive(lastSignalAt, now), { lastSignalAt });
  }
  if (source.type === 'cc') {
    if (!Array.isArray(signal.sessions)) return result('unknown');
    const live = signal.sessions.filter(s => s.alive === true);
    const badge = String(live.length);
    const busy = live.filter(s => s.status === 'busy');
    if (busy.length) {
      const lastSignalAt = Math.max(...busy.map(s => s.at));
      return result(validTime(lastSignalAt, now) ? inactive(lastSignalAt, now, 'busy') : 'unknown', { badge, lastSignalAt });
    }
    if (signal.uncertain || live.some(s => !STATUSES.includes(s.status))) return result('unknown', { badge });
    if (!live.length) return result('off', { badge });
    const lastSignalAt = Math.max(...live.map(s => s.at));
    return result(inactive(lastSignalAt, now), { badge, lastSignalAt });
  }
  if (source.type === 'launchd' || source.type === 'etwin') {
    // A live run of the CLI (any window, any caller) is work; when the last one ends the desk celebrates, then the
    // run's end time counts as a signal so a stopped bridge does not read as off right after a terminal session.
    if (Number.isInteger(signal.processes) && signal.processes > 0) { memory.processAt = now; return result('busy', { lastSignalAt: now, badge: String(signal.processes) }); }
    if (memory.processAt && now - memory.processAt < 20_000) return result('done', { lastSignalAt: memory.processAt, badge: '' });
    const fallback = mtimeStatus(signal, now);
    const ranAt = validTime(memory.processAt, now) ? memory.processAt : 0;
    if (fallback === 'off' && ranAt) return result(now - ranAt < 30 * MINUTE ? 'idle' : 'off', { lastSignalAt: ranAt, badge: '' });
    if (fallback === 'off' || fallback === 'unknown') return result(fallback, { badge: '' });
    if (source.type === 'etwin') {
      // Busy from the moment a reply or distill is requested until it lands (3 minutes at most, the query timeout);
      // the landed reply is a short done. A fresh log by itself (heartbeats, self-loop wake-ups, routing) is not work.
      if (signal.started) memory.workAt = now;
      if (signal.activity) { memory.activityAt = now; memory.workAt = 0; }
      if (memory.workAt && now - memory.workAt < 3 * MINUTE) return result('busy', { lastSignalAt: memory.workAt, badge: '' });
      if (memory.activityAt && now - memory.activityAt < 20_000) return result('done', { lastSignalAt: memory.activityAt, badge: '' });
      const lastSignalAt = Math.max(signal.mtime, memory.activityAt || 0);
      return result(inactive(lastSignalAt, now), { lastSignalAt, badge: '' });
    }
    if (fallback === 'busy') return result('busy', { lastSignalAt: signal.mtime, badge: '' });
    const lastSignalAt = Math.max(signal.mtime, ranAt);
    return result(inactive(lastSignalAt, now), { lastSignalAt, badge: '' });
  }
  if (source.type === 'statusfiles') {
    // A live local CLI run of the same engine is work at this desk too; its end is a short done, then half an hour of idle.
    if (Number.isInteger(signal.processes) && signal.processes > 0) { memory.processAt = now; return result('busy', { lastSignalAt: now, badge: String(signal.processes) }); }
    if (memory.processAt && now - memory.processAt < 20_000) return result('done', { lastSignalAt: memory.processAt, badge: '' });
    const ranAt = validTime(memory.processAt, now) && now - memory.processAt < 30 * MINUTE ? memory.processAt : 0;
    // A slip older than two hours is stale (the box sleeps and forgets to say done); then the mirror decides.
    // A busy slip from a box that no longer answers ssh is a forgotten slip, not work: nobody works asleep.
    const fresh = (signal.slips || []).filter(s => validTime(s.at, now) && now - s.at < 120 * MINUTE && !(signal.asleep && s.status === 'busy'));
    const pick = (status) => fresh.filter(s => s.status === status);
    const latestAt = (list) => Math.max(...list.map(s => s.at));
    if (pick('waiting').length) return result('waiting', { lastSignalAt: latestAt(pick('waiting')), badge: String(pick('waiting').length) });
    if (pick('busy').length) return result('busy', { lastSignalAt: latestAt(pick('busy')), badge: String(pick('busy').length) });
    const done = pick('done').filter(s => now - s.at < 10 * MINUTE);
    if (done.length) return result('done', { lastSignalAt: latestAt(done), badge: '' });
    if (ranAt) return result('idle', { lastSignalAt: ranAt, badge: '' });
    if (signal.asleep) return result('away', { badge: '' });
    const via = deriveSignal({ type: 'artifacts', returnAway: source.returnAway }, signal.fallback, previous, now);
    return { ...via, badge: '' };
  }
  if (source.type === 'artifacts') {
    if (signal.empty) return result('away');
    if (!validTime(signal.mtime, now)) return result('unknown');
    if (!memory.seenMtime || signal.mtime > memory.seenMtime) {
      // A recent first observation is a delivery; old mirrors establish a baseline only.
      if (memory.seenMtime || now - signal.mtime < 120 * MINUTE) memory.doneUntil = now + 20_000;
      memory.seenMtime = signal.mtime;
    }
    if (memory.doneUntil > now) return result('done', { lastSignalAt: signal.mtime });
    return result(source.returnAway || now - signal.mtime >= 120 * MINUTE ? 'away' : 'idle', { lastSignalAt: signal.mtime });
  }
  return result('unknown');
}

export function reduceMember(source, signal, previous = {}, now) {
  const observed = deriveSignal(source, signal, previous, now);
  const push = previous.push;
  const usePush = push && validTime(push.at, now) && now - push.at < PUSH_TTL && STATUSES.includes(push.status);
  const status = usePush ? push.status : observed.status;
  // Minutes at work today (Beijing day): the gap since the previous tick is added while that tick was busy. A gap over
  // a minute (the office was down) is not counted, and midnight starts the count over.
  const day = beijingDay(now), sameDay = previous.workedDay === day, gap = Number.isFinite(previous.tickAt) ? now - previous.tickAt : 0;
  const workedMs = (sameDay ? previous.workedMs || 0 : 0) + (previous.status === 'busy' && sameDay && gap > 0 && gap <= MINUTE ? gap : 0);
  return {
    ...previous, ...observed, status, workedMs, workedDay: day, tickAt: now,
    lastSignalAt: usePush ? push.at : observed.lastSignalAt ?? previous.lastSignalAt,
    statusSince: previous.status === status && previous.statusSince ? previous.statusSince : iso(now),
    ...(push && !usePush ? { push: undefined } : {})
  };
}

export class RateLimiter {
  constructor() { this.actors = new Map(); this.global = []; }
  take(id, now) {
    this.global = this.global.filter(t => now - t < MINUTE);
    if (this.actors.has(id) && now - this.actors.get(id) < 2000 || this.global.length >= 120) return false;
    this.actors.set(id, now); this.global.push(now); return true;
  }
}

export function appendNotice(notices, text, now) {
  return [...notices, { at: iso(now), text: cleanNotice(text) }].slice(-20);
}
