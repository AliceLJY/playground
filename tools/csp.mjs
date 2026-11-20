// 单文件三维页面共用的内容安全策略（CSP）：页面只能跑写在文件里的代码、只能用内存里生成的 data: / blob: 数据，
// 任何联网请求、外部图片、音频、字体、模型都由浏览器直接拒绝。页面能完整打开，本身就证明它没从外面加载任何东西。
// 2026-11-21 立，做法借自 Wode44398/tingyuyuan（听雨园）。各页 tools/build.mjs 用 withCsp() 把它插在 <head> 最前面。
// connect-src 放行 data: / blob:：Three.js 的部分加载器读内嵌数据时走 fetch，放行它们不开放任何网络来源。
// 运行时核对：tools/csp-check.cjs。
export const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob:",
  'worker-src blob:',
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data:',
  'connect-src data: blob:',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;

// 把 CSP 放成 <head> 的第一个元素（必须在任何脚本之前才生效），并核对确实只有一条、且在第一个 <script> 之前。
export function withCsp(html) {
  if (html.split('<head>').length !== 2) throw new Error('page must contain exactly one <head>');
  if (/http-equiv="Content-Security-Policy"/i.test(html)) throw new Error('page already has a CSP; remove it from the template');
  const out = html.replace('<head>', () => '<head>\n' + CSP_META);
  const at = out.indexOf(CSP_META), firstScript = out.search(/<script\b/i);
  if (firstScript !== -1 && firstScript < at) throw new Error('CSP must come before the first <script>');
  return out;
}
