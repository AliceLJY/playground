// D65 OKLab / OKLCH. Palette inputs and returned display values are sRGB.
// The ramp is rebuilt only when the time changes.
const POSITIONS = [0, .48, .72, .84, .94, 1];

export function toOklch(hex) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  const bAxis = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return [.2104542553 * l + .793617785 * m - .0040720468 * s,
    Math.hypot(a, bAxis), Math.atan2(bAxis, a)];
}

export function mixOklch(a, b, t) {
  const hueDelta = Math.atan2(Math.sin(b[2] - a[2]), Math.cos(b[2] - a[2]));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + hueDelta * t];
}

function linearRgb([lightness, chroma, hue]) {
  const a = chroma * Math.cos(hue), b = chroma * Math.sin(hue);
  const l = (lightness + .3963377774 * a + .2158037573 * b) ** 3;
  const m = (lightness - .1055613458 * a - .0638541728 * b) ** 3;
  const s = (lightness - .0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
}

export function toSrgb(lch) {
  const inGamut = rgb => rgb.every(value => value >= -.0000001 && value <= 1.0000001);
  let rgb = linearRgb(lch);
  if (!inGamut(rgb)) {
    // Preserve the bright boundary and its hue. Clipping RGB channels would
    // bend the hue where the blue-to-peach arc reaches the display gamut.
    let low = 0, high = lch[1];
    for (let i = 0; i < 14; i++) {
      const chroma = (low + high) / 2;
      if (inGamut(linearRgb([lch[0], chroma, lch[2]]))) low = chroma;
      else high = chroma;
    }
    rgb = linearRgb([lch[0], low, lch[2]]);
  }
  return rgb.map(value => {
    value = Math.max(0, Math.min(1, value));
    return value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
  });
}

export function atmosphereColor(a, b, t) {
  return toSrgb(mixOklch(toOklch(a), toOklch(b), t));
}

export function fillSkyRamp(state, data) {
  const stops = state.a.sky.map((hex, i) => mixOklch(toOklch(hex), toOklch(state.b.sky[i]), state.t));
  const height = data.length / 4;
  let segment = 0;
  for (let row = 0; row < height; row++) {
    const position = row / (height - 1);
    while (segment < POSITIONS.length - 2 && position > POSITIONS[segment + 1]) segment++;
    const fraction = (position - POSITIONS[segment]) / (POSITIONS[segment + 1] - POSITIONS[segment]);
    const rgb = toSrgb(mixOklch(stops[segment], stops[segment + 1], fraction));
    // DataTexture rows are bottom-up. Palette positions are top-down.
    const offset = (height - 1 - row) * 4;
    for (let k = 0; k < 3; k++) data[offset + k] = Math.round(rgb[k] * 255);
    data[offset + 3] = 255;
  }
  return toSrgb(stops[4]);
}
