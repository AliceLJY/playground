// 搭台 · 跨用户痕迹共享。一个 Cloudflare Worker 加一个 KV（绑定名 DATAI_TRACES）。
// 存的只是「第几秒做了哪个动作」：没有名字、没有文字、没有 id，七天自然过期；服务端按白名单重建对象，多余字段一律丢掉。
// 协议见 README「跨用户痕迹」一节。

export const ORIGIN = 'https://aliceljy.github.io';
export const MAX_BODY = 2048;      // 字节
export const MAX_DUR = 1800;       // 一次最长记半小时
export const MAX_ACTS = 200;
export const TTL = 7 * 24 * 3600;  // 秒
export const POSTS_PER_HOUR = 6;   // 每个地址每小时最多留几次
export const MAX_N = 12;
export const EDIT_WINDOW = 3 * 3600 * 1000; // 留下后多久内还能凭凭条把它换成完整的那一趟（毫秒）
const PLAYER_CODES = new Set([0, 1, 2, 3, 4, 5, 6, 8]); // 7 是「抿茶」，只给桌上的别人用
const FAR = 9999999999999;         // key 用倒数时刻，KV 的 list 按字典序升序给，最新的就排在最前

// 白名单重建：合法返回 { v, dur, acts }，不合法返回 null
export function cleanTrace(x) {
  if (!x || typeof x !== 'object' || x.v !== 1) return null;
  const dur = x.dur;
  if (typeof dur !== 'number' || !Number.isFinite(dur) || dur < 0 || dur > MAX_DUR) return null;
  if (!Array.isArray(x.acts) || x.acts.length > MAX_ACTS) return null;
  const acts = [];
  let last = 0;
  for (const a of x.acts) {
    if (!Array.isArray(a) || a.length !== 2) return null;
    const [t, c] = a;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < last || t > dur) return null;
    if (!Number.isInteger(c) || !PLAYER_CODES.has(c)) return null;
    acts.push([Math.round(t * 10) / 10, c]);
    last = t;
  }
  return { v: 1, dur: Math.round(dur * 10) / 10, acts };
}

function cors(extra) {
  return { 'access-control-allow-origin': ORIGIN, 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin', ...extra };
}
function json(status, body, extra) {
  return new Response(JSON.stringify(body), { status, headers: cors({ 'content-type': 'application/json; charset=utf-8', ...extra }) });
}

export async function handle(request, env, now) {
  const url = new URL(request.url);
  const at = now || Date.now();
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  const kv = env.DATAI_TRACES;

  if (request.method === 'GET' && url.pathname === '/traces') {
    const n = Math.max(1, Math.min(MAX_N, parseInt(url.searchParams.get('n') || '12', 10) || 12));
    const list = await kv.list({ prefix: 'trace:', limit: n });
    const out = [];
    for (const k of list.keys) {
      const raw = await kv.get(k.name);
      if (!raw) continue;
      try { const v = JSON.parse(raw); const c = cleanTrace(v); if (c && typeof v.at === 'number') out.push({ k: k.name.slice(6), at: v.at, ...c }); } catch (e) { /* 坏的跳过 */ }
    }
    return json(200, out, { 'cache-control': 'public, max-age=30' });
  }

  if (request.method === 'POST' && url.pathname === '/trace') {
    const origin = request.headers.get('origin');
    if (origin && origin !== ORIGIN) return json(403, { error: 'origin' });
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY) return json(413, { error: 'too large' });
    let body;
    try { body = JSON.parse(text); } catch (e) { return json(400, { error: 'json' }); }
    const trace = cleanTrace(body);
    if (!trace) return json(400, { error: 'shape' });
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const rlKey = `rl:${ip}:${Math.floor(at / 3600000)}`;
    const used = parseInt((await kv.get(rlKey)) || '0', 10) || 0;
    if (used >= POSTS_PER_HOUR) return json(429, { error: 'slow down' }, { 'retry-after': '3600' });
    await kv.put(rlKey, String(used + 1), { expirationTtl: 7200 });
    const key = `${String(FAR - at).padStart(13, '0')}-${Math.random().toString(36).slice(2, 6)}`;
    // 凭条：只回给留下它的那个页面，之后凭它把这一条换成完整的那一趟；GET 永远不吐它
    const t = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await kv.put('trace:' + key, JSON.stringify({ ...trace, at, t }), { expirationTtl: TTL });
    return json(201, { k: key, t });
  }

  // 换成完整的那一趟：PUT /trace/<k>，body { t, v, dur, acts }。凭条对得上、在时限内才换；进门时刻不变
  const m = url.pathname.match(/^\/trace\/([0-9]{13}-[a-z0-9]{1,8})$/);
  if (request.method === 'PUT' && m) {
    const origin = request.headers.get('origin');
    if (origin && origin !== ORIGIN) return json(403, { error: 'origin' });
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY + 100) return json(413, { error: 'too large' });
    let body;
    try { body = JSON.parse(text); } catch (e) { return json(400, { error: 'json' }); }
    const trace = cleanTrace(body);
    if (!trace || typeof body.t !== 'string') return json(400, { error: 'shape' });
    const raw = await kv.get('trace:' + m[1]);
    if (!raw) return json(404, { error: 'gone' });
    let old;
    try { old = JSON.parse(raw); } catch (e) { return json(404, { error: 'gone' }); }
    if (typeof old.t !== 'string' || old.t !== body.t) return json(403, { error: 'ticket' });
    if (at - old.at > EDIT_WINDOW) return json(409, { error: 'too late' });
    const left = Math.max(60, Math.round((old.at + TTL * 1000 - at) / 1000));
    await kv.put('trace:' + m[1], JSON.stringify({ ...trace, at: old.at, t: old.t }), { expirationTtl: left });
    return json(200, { k: m[1] });
  }

  return json(404, { error: 'not found' });
}

export default { fetch: (request, env) => handle(request, env) };
