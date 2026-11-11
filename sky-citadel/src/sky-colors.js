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

// Straight line in OKLab: a blue-to-warm blend crosses a pale, luminous neutral instead of
// swinging through pink or green on a hue arc. Used for the sky ramp and for time-of-day blends.
export function mixOklab(a, b, t) {
  const ax = a[1] * Math.cos(a[2]), ay = a[1] * Math.sin(a[2]);
  const bx = b[1] * Math.cos(b[2]), by = b[1] * Math.sin(b[2]);
  const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
  return [a[0] + (b[0] - a[0]) * t, Math.hypot(x, y), Math.atan2(y, x)];
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
  return toSrgb(mixOklab(toOklch(a), toOklch(b), t));
}

export function fillSkyRamp(state, data) {
  const stops = state.a.sky.map((hex, i) => mixOklab(toOklch(hex), toOklch(state.b.sky[i]), state.t));
  const height = data.length / 4;
  let segment = 0;
  for (let row = 0; row < height; row++) {
    const position = row / (height - 1);
    while (segment < POSITIONS.length - 2 && position > POSITIONS[segment + 1]) segment++;
    const fraction = (position - POSITIONS[segment]) / (POSITIONS[segment + 1] - POSITIONS[segment]);
    const rgb = toSrgb(mixOklab(stops[segment], stops[segment + 1], fraction));
    // DataTexture rows are bottom-up. Palette positions are top-down.
    const offset = (height - 1 - row) * 4;
    for (let k = 0; k < 3; k++) data[offset + k] = Math.round(rgb[k] * 255);
    data[offset + 3] = 255;
  }
  // Fog takes the pale haze stop, so distant clouds fade lighter and bluer, not into the warm floor.
  return toSrgb(stops[2]);
}

// What two rejected skies taught, as rules over a top-to-bottom list of row colours.
// They are regression guards for those specific failures, not a proof that a sky looks good.
// `strict` is for the five keyframes; the looser set is for the blends between them, where a
// brief dusty rose or pale lavender is intended and was judged by eye.
export function skyRuleFailures(hexRows, strict = true) {
  const rows = hexRows.map(hex => { const [l, c, h] = toOklch(hex); return {hex, l, c, hue: (h * 180 / Math.PI + 360) % 360}; });
  const failures = [], first = (name, test) => { const i = rows.findIndex(test); if (i >= 0) failures.push(`${name} at row ${i} ${rows[i].hex}`); };
  // 1. Mud: a mid-lightness row with almost no colour. Pale neutrals are fine; they read as haze.
  //    The rejected grey band measured chroma .018.
  first('grey band', r => r.l >= .35 && r.l < .78 && r.c < (strict ? .024 : .02));
  // 2. Dull warm: khaki, tan and beige. A weakly coloured warm row has to be light; a vivid one
  //    (ember, burnt orange) may be dark. The rejected khaki measured chroma .040 at lightness .72.
  first('dull warm', r => r.hue >= 30 && r.hue <= 110 && r.c >= .03 && r.c < (strict ? .07 : .05) && r.l < .77);
  // 3. Pastel pink or magenta band between the blue and the warm floor. Dark plum at afterglow is not this.
  //    The rejected pink measured chroma .107 at lightness .80.
  first('pink band', r => (r.hue >= 300 || r.hue < 25) && r.c >= (strict ? .06 : .085) && r.l >= (strict ? .68 : .75));
  // 4. Over-saturated primary blue. The rejected blues measured chroma .135 to .164.
  first('loud blue', r => r.hue >= 200 && r.hue <= 290 && r.c > .125);
  // 5. Lightness must not dip on the way down to the cream stop (84% of the height).
  const until = Math.round((rows.length - 1) * .84);
  if (strict) for (let i = 1; i <= until; i++) if (rows[i].l < rows[i - 1].l - .005) { failures.push(`lightness dips at row ${i} ${rows[i].hex}`); break; }
  return failures;
}
