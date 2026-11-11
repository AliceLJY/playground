// 浏览器打不开 WebGL 时盖一层看得清的说明，别让页面空着卡住
export function noWebGL() {
  if (document.getElementById('nogl')) return;
  const d = document.createElement('div'); d.id = 'nogl'; d.setAttribute('role', 'alert');
  d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:28px;box-sizing:border-box;background:#17202b;color:#f6ecdc;font:15px/1.9 system-ui,-apple-system,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;text-align:center';
  d.textContent = '这个页面要用 WebGL 画三维画面，这台设备的浏览器打不开。换一个浏览器，或者打开硬件加速后再试。';
  document.body.append(d);
}
