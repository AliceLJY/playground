// 碎碎平安 · the connection to the shared room. Only numbers and codes go over the wire; names and colours are
// picked here from fixed lists and sent as indexes. If the room cannot be reached the page simply stays single-player.

// 64 names a visitor can be called by, shown as 「访客 XX」. Index 0..63 is all that is ever sent.
export const NAMES = ['青柚','橘子','杏仁','芒果','山楂','龙眼','荔枝','枇杷','杨梅','柿子','石榴','樱桃','桑葚','青梅','葡萄','蜜桃',
  '雪梨','柠檬','椰子','菠萝','木瓜','莲子','红豆','绿豆','芝麻','花生','核桃','栗子','松子','红枣','银杏','百合',
  '茉莉','桂花','菊花','兰草','竹叶','松针','柳絮','梧桐','海棠','玉兰','山茶','杜鹃','芍药','牡丹','紫藤','蔷薇',
  '白鹭','喜鹊','黄鹂','燕子','麻雀','画眉','鸳鸯','仙鹤','锦鲤','熊猫','狸花','三花','橘猫','柴犬','小鹿','白兔'];
// 12 colours readable on the dark shelf.
export const COLORS = ['#ff8a65','#ffd54f','#aed581','#4dd0e1','#64b5f6','#9575cd','#f06292','#e57373','#81c784','#ffb74d','#4db6ac','#ba68c8'];
export const DEFAULT_URL = 'wss://suisui.aliceljy.xyz/room/ws';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// Who I am in the room: a random name and colour picked once in this browser.
export function myLook() {
  let n = Number(store.get('suisui.name')), c = Number(store.get('suisui.color'));
  if (!Number.isInteger(n) || n < 0 || n >= NAMES.length) { n = Math.floor(Math.random() * NAMES.length); store.set('suisui.name', String(n)); }
  if (!Number.isInteger(c) || c < 0 || c >= COLORS.length) { c = Math.floor(Math.random() * COLORS.length); store.set('suisui.color', String(c)); }
  return { n, c };
}

// My own worries, by the id the room gave them. Only this browser ever knows the words.
export const myNotes = {
  all() { try { return JSON.parse(store.get('suisui.notes') || '{}') || {}; } catch { return {}; } },
  get(id) { return id ? this.all()[id] || '' : ''; },
  set(id, text) { const a = this.all(); a[id] = text; const keys = Object.keys(a); while (keys.length > 40) delete a[keys.shift()]; store.set('suisui.notes', JSON.stringify(a)); },
};

// Connect, say hi, hand every message to onMessage; on any failure call onDown and retry with backoff.
// onUp fires when the welcome snapshot arrives. Returns { send, close, get up }.
export function connect(url, { onUp, onMessage, onDown }) {
  let ws = null, up = false, stopped = false, retry = 0, timer = 0;
  // A small message every 15 s keeps the connection alive through proxies and tells the room this page is still here.
  setInterval(() => { if (up && ws && ws.readyState === 1) ws.send('{"t":"k"}'); }, 15000);
  const look = myLook();
  const open = () => {
    if (stopped) return;
    try { ws = new WebSocket(url); } catch { return fail(); }
    const t = setTimeout(() => { if (!up) { try { ws.close(); } catch { /* ignore */ } } }, 10000);   // mobile networks in China can take seconds
    ws.onopen = () => {
      const tok = store.get('suisui.token');
      ws.send(JSON.stringify({ t: 'hi', n: look.n, c: look.c, ...(tok && /^[0-9a-f]{32}$/.test(tok) ? { tok } : {}) }));
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'W') { clearTimeout(t); up = true; retry = 0; store.set('suisui.token', m.you.tok); onUp(m); return; }
      if (m.t === 'F') { stopped = true; }              // room is full: stay single-player for this visit
      onMessage(m);
    };
    ws.onclose = () => { clearTimeout(t); fail(); };
    ws.onerror = () => { /* onclose follows */ };
  };
  const fail = () => {
    const was = up; up = false; ws = null;
    onDown(was);
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(open, Math.min(30000, 2000 * 2 ** retry++));
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !up && !ws && !stopped) { clearTimeout(timer); retry = 0; open(); }
  });
  open();
  return {
    send(m) { if (up && ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; },
    close() { stopped = true; clearTimeout(timer); if (ws) ws.close(); },
    get up() { return up; },
  };
}
