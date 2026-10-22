// The board's words. Plain data, so the Node tests can read exactly what the page writes.
// A line is { text, doodle, target }: doodle is circle | underline | box | arrow, target is the part of
// the line the doodle goes around (the whole line when left out).
(function (root) {
  var PAGES = [
    { title: "手写板书是怎么做的?",
      lines: [
        { text: "它不是视频,是一张网页录了屏", doodle: "underline", target: "网页" },
        { text: "文字层:手写字体 + 逐字揭示", doodle: "circle", target: "手写字体" },
        { text: "手层:一只手跟着揭示前沿走", doodle: "circle", target: "跟着" },
        { text: "涂鸦层:SVG 描边圈重点、画箭头", doodle: "box", target: "SVG 描边" },
      ] },
    { title: "两种容器,一套机制",
      lines: [
        { text: "翻页模式:一页一页讲,像 PPT", doodle: "arrow" },
        { text: "自由模式:长卷往下写,镜头跟笔", doodle: "underline", target: "镜头跟笔" },
        { text: "TTS 旁白定每行时长,零生图", doodle: "circle", target: "零生图" },
      ] },
  ];
  if (typeof module === 'object' && module.exports) module.exports = PAGES; else root.HB_PAGES = PAGES;
})(typeof window !== 'undefined' ? window : globalThis);
