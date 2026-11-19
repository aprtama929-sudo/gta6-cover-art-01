// Panel Pop composer: panel layouts and the cover renderer.
//
// A cover is a dark-framed poster: cream gutters between photo panels,
// each panel cover-fitting its own graded photo, a chunky auto-fitted
// title across the top, a letter-spaced subtitle pill near the bottom
// and a ringed medallion badge in the corner. Empty panels get a neon
// sun placeholder. All lettering and decoration are drawn from plain
// canvas shapes and system fonts — nothing is loaded from anywhere.

export const LAYOUTS = {
  poster: 'Poster',
  strips: 'Strips',
  trio: 'Trio',
  quad: 'Quad',
  duo: 'Duo',
  solo: 'Solo',
};

const FRAME_COLOUR = '#171310';
const GUTTER_COLOUR = '#f2e7cf';

// Frame thickness and gutter width for a canvas of the given size, plus
// the inner rectangle the panels live in.
export function coverGeometry(W, H) {
  const frame = Math.max(10, Math.round(Math.min(W, H) * 0.022));
  const gap = Math.max(6, Math.round(Math.min(W, H) * 0.014));
  return { frame, gap, inner: { x: frame, y: frame, w: W - frame * 2, h: H - frame * 2 } };
}

// Panel rectangles for a layout inside the inner box.
export function layoutRects(kind, inner, gap) {
  const { x, y, w, h } = inner;
  switch (kind) {
    case 'solo':
      return [{ x, y, w, h }];
    case 'trio': {
      const cw = (w - gap * 2) / 3;
      return [0, 1, 2].map((i) => ({ x: x + i * (cw + gap), y, w: cw, h }));
    }
    case 'quad': {
      const cw = (w - gap) / 2, ch = (h - gap) / 2;
      return [
        { x, y, w: cw, h: ch }, { x: x + cw + gap, y, w: cw, h: ch },
        { x, y: y + ch + gap, w: cw, h: ch }, { x: x + cw + gap, y: y + ch + gap, w: cw, h: ch },
      ];
    }
    case 'poster': {
      const topH = (h - gap) * 0.62;
      const bw = (w - gap) / 2, by = y + topH + gap, bh = h - topH - gap;
      return [
        { x, y, w, h: topH },
        { x, y: by, w: bw, h: bh }, { x: x + bw + gap, y: by, w: bw, h: bh },
      ];
    }
    case 'strips': {
      const heroW = w * 0.52;
      const sw = w - heroW - gap, sh = (h - gap * 2) / 3;
      return [
        { x, y, w: heroW, h },
        ...[0, 1, 2].map((i) => ({ x: x + heroW + gap, y: y + i * (sh + gap), w: sw, h: sh })),
      ];
    }
    case 'duo': {
      const leftW = w * 0.44;
      const rw = w - leftW - gap, rh = (h - gap) / 2;
      return [
        { x, y, w: leftW, h },
        { x: x + leftW + gap, y, w: rw, h: rh },
        { x: x + leftW + gap, y: y + rh + gap, w: rw, h: rh },
      ];
    }
    default:
      return [{ x, y, w, h }];
  }
}

function paintPlaceholder(ctx, r) {
  const sky = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  sky.addColorStop(0, '#241047');
  sky.addColorStop(0.52, '#8f2d63');
  sky.addColorStop(0.78, '#ff7a3d');
  sky.addColorStop(1, '#ffd76e');
  ctx.fillStyle = sky;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  // Striped neon sun.
  const cx = r.x + r.w / 2, cy = r.y + r.h * 0.44;
  const rad = Math.min(r.w, r.h) * 0.21;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#ffd76e';
  ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  ctx.fillStyle = 'rgba(255, 110, 60, 0.85)';
  let stripeY = cy + rad * 0.08, stripeH = rad * 0.05;
  while (stripeY < cy + rad) {
    ctx.fillRect(cx - rad, stripeY, rad * 2, stripeH);
    stripeY += stripeH * 2.4;
    stripeH *= 1.5;
  }
  ctx.restore();
  // Horizon glow line.
  ctx.fillStyle = 'rgba(20, 8, 30, 0.55)';
  ctx.fillRect(r.x, r.y + r.h * 0.78, r.w, r.h * 0.22);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(Math.min(r.w, r.h) * 0.075)}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try { ctx.letterSpacing = '4px'; } catch { /* older engines */ }
  ctx.fillText('ADD A PHOTO', cx, r.y + r.h * 0.89);
  try { ctx.letterSpacing = '0px'; } catch { /* older engines */ }
}

function paintPanel(ctx, r, slot) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  if (slot && slot.img) {
    const iw = slot.img.width, ih = slot.img.height;
    const scale = Math.max(r.w / iw, r.h / ih) * slot.zoom;
    const dw = iw * scale, dh = ih * scale;
    const dx = r.x + (r.w - dw) / 2 + slot.sx * r.w;
    const dy = r.y + (r.h - dh) / 2 + slot.sy * r.h;
    ctx.drawImage(slot.img, dx, dy, dw, dh);
  } else {
    paintPlaceholder(ctx, r);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(10, 6, 4, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
}

const TITLE_FILLS = {
  white: null,
  sunset: ['#fff3a6', '#ffb03a', '#ff5e62', '#c93b8f'],
  neon: ['#d8fbff', '#5ee7ff', '#4d7cff', '#b967ff'],
  gold: ['#fff6c4', '#ffd94d', '#e09f1f', '#9c6b0d'],
};

function paintTitle(ctx, W, H, view) {
  const title = (view.title ?? '').trim();
  if (!title) return;
  const maxW = W * 0.92;
  let px = H * 0.148 * (view.titleScale ?? 1);
  const setFont = (s) => { ctx.font = `900 ${s}px "Arial Black", "Segoe UI", system-ui, sans-serif`; };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setFont(px);
  while (ctx.measureText(title).width > maxW && px > 12) {
    px *= 0.94;
    setFont(px);
  }
  const cx = W / 2, cy = H * 0.118;
  const stops = TITLE_FILLS[view.titleFill] ?? null;
  if (stops) {
    const grad = ctx.createLinearGradient(0, cy - px / 2, 0, cy + px / 2);
    stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = '#ffffff';
  }
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = '#17110c';
  ctx.lineWidth = px * 0.17;
  ctx.strokeText(title, cx, cy);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowOffsetY = px * 0.055;
  ctx.shadowBlur = 0;
  ctx.fillText(title, cx, cy);
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetY = 0;
}

function paintSubtitle(ctx, W, H, view) {
  const text = (view.subtitle ?? '').trim().toUpperCase();
  if (!text) return;
  const px = H * 0.027;
  ctx.font = `600 ${px}px "Segoe UI", system-ui, sans-serif`;
  try { ctx.letterSpacing = `${Math.round(px * 0.32)}px`; } catch { /* older engines */ }
  const tw = ctx.measureText(text).width;
  const padX = px * 1.1, pillH = px * 2.05;
  const pillW = tw + padX * 2;
  const x = (W - pillW) / 2, y = H * 0.9;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, pillW, pillH, pillH / 2);
  else ctx.rect(x, y, pillW, pillH);
  ctx.fillStyle = 'rgba(13, 10, 16, 0.74)';
  ctx.fill();
  ctx.fillStyle = '#ffe9b0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, y + pillH / 2 + 1);
  try { ctx.letterSpacing = '0px'; } catch { /* older engines */ }
}

function star(ctx, cx, cy, r, colour) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}

function paintBadge(ctx, W, H, view) {
  if (!view.badge) return;
  const R = Math.min(W, H) * 0.072;
  const cx = W - R - Math.min(W, H) * 0.048;
  const cy = R + Math.min(W, H) * 0.048;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#e3ac2e';
  ctx.fill();
  ctx.lineWidth = R * 0.07;
  ctx.strokeStyle = '#fff0bc';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.76, 0, Math.PI * 2);
  ctx.fillStyle = '#771126';
  ctx.fill();
  star(ctx, cx, cy - R * 0.38, R * 0.16, '#ffd94d');
  star(ctx, cx, cy + R * 0.42, R * 0.11, '#ffd94d');
  ctx.fillStyle = '#ffe9a8';
  ctx.font = `900 ${Math.round(R * 0.62)}px "Arial Black", "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((view.badgeText ?? 'VI').slice(0, 4), cx, cy + R * 0.02);
}

// Render the whole cover. `view` carries everything the editor state
// holds; `preview` adds the selection ring used while editing.
export function paintCover(ctx, W, H, view) {
  const { gap, inner } = coverGeometry(W, H);
  ctx.fillStyle = FRAME_COLOUR;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = GUTTER_COLOUR;
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  const rects = layoutRects(view.layout, inner, gap);
  rects.forEach((r, i) => paintPanel(ctx, r, view.panels[i]));
  // Soft vignette over the artwork.
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.74);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  // Dusk scrim along the bottom so the subtitle pill sits well.
  const scrim = ctx.createLinearGradient(0, H * 0.78, 0, H);
  scrim.addColorStop(0, 'rgba(8,5,10,0)');
  scrim.addColorStop(1, 'rgba(8,5,10,0.38)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H * 0.78, W, H * 0.22);
  paintBadge(ctx, W, H, view);
  paintTitle(ctx, W, H, view);
  paintSubtitle(ctx, W, H, view);
  if (view.preview && view.selected >= 0 && rects[view.selected]) {
    const r = rects[view.selected];
    ctx.save();
    ctx.strokeStyle = '#ffcf3f';
    ctx.lineWidth = Math.max(3, W * 0.004);
    ctx.setLineDash([16, 11]);
    ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    ctx.restore();
  }
  return rects;
}
