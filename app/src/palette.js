// Panel Pop colour grades.
//
// A grade is a split-tone recipe: shadows are pulled toward one colour,
// highlights toward another, with saturation and contrast baked in. The
// editor's Brightness / Contrast / Saturation sliders ride on top of the
// chosen recipe. Everything is plain per-pixel maths on ImageData, done
// once per photo and cached, so the composer can stay at full frame rate.

export const GRADES = {
  clean: {
    label: 'Clean',
    shadow: [24, 24, 28], high: [244, 244, 240],
    saturation: 1.0, contrast: 1.0, tone: 0.0,
  },
  sunset: {
    label: 'Vice Sunset',
    shadow: [48, 18, 76], high: [255, 186, 102],
    saturation: 1.28, contrast: 1.07, tone: 0.32,
  },
  neon: {
    label: 'Neon Nights',
    shadow: [12, 10, 56], high: [126, 238, 255],
    saturation: 1.38, contrast: 1.12, tone: 0.3,
  },
  midnight: {
    label: 'Midnight',
    shadow: [5, 8, 24], high: [168, 196, 238],
    saturation: 0.82, contrast: 1.16, tone: 0.26,
  },
  golden: {
    label: 'Golden Hour',
    shadow: [58, 29, 10], high: [255, 226, 150],
    saturation: 1.16, contrast: 1.04, tone: 0.3,
  },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Rewrite an ImageData buffer in place with the given recipe and the
// user's adjustment multipliers ({ bright, con, sat } around 1).
export function gradePixels(data, recipe, adj) {
  const con = recipe.contrast * adj.con;
  const sat = recipe.saturation * adj.sat;
  const bright = adj.bright;
  const tone = recipe.tone;
  const sh = recipe.shadow, hi = recipe.high;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    r = clamp01((r - 0.5) * con + 0.5) * bright;
    g = clamp01((g - 0.5) * con + 0.5) * bright;
    b = clamp01((b - 0.5) * con + 0.5) * bright;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = clamp01(lum + (r - lum) * sat);
    g = clamp01(lum + (g - lum) * sat);
    b = clamp01(lum + (b - lum) * sat);
    if (tone > 0) {
      const keep = 1 - tone;
      r = r * keep + ((sh[0] + (hi[0] - sh[0]) * lum) / 255) * tone;
      g = g * keep + ((sh[1] + (hi[1] - sh[1]) * lum) / 255) * tone;
      b = b * keep + ((sh[2] + (hi[2] - sh[2]) * lum) / 255) * tone;
    }
    data[i] = Math.round(clamp01(r) * 255);
    data[i + 1] = Math.round(clamp01(g) * 255);
    data[i + 2] = Math.round(clamp01(b) * 255);
  }
}

// Draw an image onto a fresh canvas (long edge capped for speed), grade
// the pixels, and hand the canvas back as the drawable for a panel.
export function gradedCanvas(img, gradeKey, adj) {
  const recipe = GRADES[gradeKey] ?? GRADES.clean;
  const cap = 1600;
  const scale = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  if (gradeKey === 'clean' && adj.bright === 1 && adj.con === 1 && adj.sat === 1) return canvas;
  const pixels = ctx.getImageData(0, 0, w, h);
  gradePixels(pixels.data, recipe, adj);
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
