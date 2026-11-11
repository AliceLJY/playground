// Runs on decoded GPU pixels in the browser. All rows belong to a separate
// sky-only render, with city, clouds, stars and moving foreground hidden.
function measureSky({data, screen, background, rawSky, width, height}) {
  function hsv([r, g, b]) {
    const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
    let hue = delta === 0 ? 0 : high === r ? ((g - b) / delta + 6) % 6
      : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return {h: hue * 60, s: high ? delta / high : 0, v: high / 255};
  }
  function oklab(rgb) {
    const [r, g, b] = rgb.map(v => {
      v /= 255;
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
    const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
    const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    return [.2104542553 * l + .793617785 * m - .0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
      .0259040371 * l + .7827717662 * m - .808675766 * s];
  }
  const rows = [];
  let khaki = 0, cloudPixels = 0, brownCloudPixels = 0;
  for (let y = 0; y < height; y++) {
    const rgb = [0, 0, 0];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const pixel = [data[i], data[i + 1], data[i + 2]];
      for (let k = 0; k < 3; k++) rgb[k] += pixel[k];
      const c = hsv(pixel);
      if (c.h >= 25 && c.h <= 60 && c.s < .40 && c.v > .45) khaki++;
      if (background && y >= height * .65 && [0, 1, 2].some(k => Math.abs(background[i + k] - rawSky[i + k]) > 8)) {
        cloudPixels++;
        const cloud = hsv([background[i], background[i + 1], background[i + 2]]);
        // Warm-white cloud highlights (#FFF2DE) are intentionally allowed.
        if (cloud.h >= 25 && cloud.h <= 60 && cloud.s < .40 && cloud.v > .45 && cloud.v < .90) brownCloudPixels++;
      }
    }
    for (let k = 0; k < 3; k++) rgb[k] /= width;
    const lab = oklab(rgb);
    rows.push({y, rgb, hex: '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''),
      ...hsv(rgb), lab, chroma: Math.hypot(lab[1], lab[2])});
  }
  // Smooth nine rows to reject 8-bit steps. A grey valley needs an actual
  // desaturation and recovery, plus perceptible travel on both adjacent-row
  // OKLab paths. A pale, monotonically brightening blue horizon is valid.
  const smooth = rows.map((row, i) => {
    const band = rows.slice(Math.max(0, i - 4), Math.min(height, i + 5));
    const lab = [0, 1, 2].map(k => band.reduce((sum, r) => sum + r.lab[k], 0) / band.length);
    return {lab, saturation: Math.hypot(lab[1], lab[2]) / Math.max(lab[0], .001)};
  });
  const path = [0];
  for (let i = 1; i < height; i++) {
    path[i] = path[i - 1] + Math.hypot(...smooth[i].lab.map((v, k) => v - smooth[i - 1].lab[k]));
  }
  const valleys = [], reach = Math.ceil(height * .30);
  for (let i = 10; i < height - 10; i++) {
    if (smooth[i].saturation >= .105) continue;
    let left = i, right = i;
    for (let j = Math.max(0, i - reach); j < i - 9; j++) {
      if (smooth[j].saturation > smooth[left].saturation) left = j;
    }
    for (let j = i + 10; j < Math.min(height, i + reach); j++) {
      if (smooth[j].saturation > smooth[right].saturation) right = j;
    }
    const drop = smooth[left].saturation - smooth[i].saturation;
    const recovery = smooth[right].saturation - smooth[i].saturation;
    if (drop >= .035 && recovery >= .035 && path[i] - path[left] >= .025 && path[right] - path[i] >= .025) {
      valleys.push({y: i, left, right, saturation: smooth[i].saturation, drop, recovery});
    }
  }
  const minimum = rows.reduce((a, b) => a.s < b.s ? a : b);
  // These two margin pixels are below the HUD and above all cloud/city
  // silhouettes in the six accepted scenes. Detect a stale normal frame.
  const screenSkyMaxError = Math.max(...[16, width - 17].flatMap(x => {
    const i = (Math.floor(height * .25) * width + x) * 4;
    return [0, 1, 2].map(k => Math.abs(screen[i + k] - data[i + k]));
  }));
  return {width, height, skyPixels: width * height, minSaturation: minimum.s,
    screenSkyMaxError,
    minimumRow: minimum.y, khakiFraction: khaki / (width * height),
    cloudPixels, brownCloudFraction: cloudPixels ? brownCloudPixels / cloudPixels : 0,
    greyValleyRows: valleys.length, worstValley: valleys.sort((a, b) => a.saturation - b.saturation)[0] || null,
    adjacentDeltaEMax: Math.max(...rows.slice(1).map((row, i) => Math.hypot(...row.lab.map((v, k) => v - rows[i].lab[k])))),
    samples: [0, .2, .4, .6, .72, .82, .9, .95, 1].map(t => rows[Math.round(t * (height - 1))]), rows};
}
module.exports = {measureSky};
