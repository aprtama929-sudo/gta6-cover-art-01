// Panel Pop editor: state, controls, canvas interaction, PNG export and
// the screenshot-scene protocol used by tools/shots.mjs.
//
// Everything runs locally. Photos are read as data URLs or come from the
// two bundled samples; nothing is ever uploaded anywhere.

import { GRADES, gradedCanvas } from './palette.js';
import { LAYOUTS, coverGeometry, layoutRects, paintCover } from './compose.js';

const SAMPLES = { pier: 'samples/pier.jpg', boulevard: 'samples/boulevard.jpg' };
const EXPORT_SIZES = [[1080, 1080], [1080, 1350], [1920, 1080], [1080, 1920]];

const blankPanel = () => ({ key: null, zoom: 1, sx: 0, sy: 0 });

const state = {
  layout: 'poster',
  grade: 'sunset',
  bright: 1, con: 1, sat: 1,
  title: 'PANEL POP',
  subtitle: 'Welcome to Leonida',
  titleFill: 'sunset',
  titleScale: 1,
  badge: true,
  badgeText: 'VI',
  panels: [blankPanel(), blankPanel(), blankPanel(), blankPanel()],
  selected: 0,
};

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const ctx = stage.getContext('2d');

// ---- image loading + graded cache -------------------------------------

const imageCache = new Map();
function loadImage(key) {
  if (!key) return Promise.resolve(null);
  if (!imageCache.has(key)) {
    imageCache.set(key, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = SAMPLES[key] ?? key;
    }));
  }
  return imageCache.get(key);
}

const gradedCache = new Map();
function gradedCacheKey(panel) {
  return [panel.key, state.grade, state.bright, state.con, state.sat].join('|');
}
function gradedFor(panel) {
  if (!panel.key) return null;
  const cacheKey = gradedCacheKey(panel);
  if (!gradedCache.has(cacheKey)) {
    gradedCache.set(cacheKey, { canvas: null });
    loadImage(panel.key).then((img) => {
      if (img) {
        gradedCache.get(cacheKey).canvas = gradedCanvas(img, state.grade, state);
        render();
      }
    });
  }
  return gradedCache.get(cacheKey).canvas;
}
async function ensureGraded(panel) {
  if (!panel.key) return;
  const cacheKey = gradedCacheKey(panel);
  if (!gradedCache.has(cacheKey) || !gradedCache.get(cacheKey).canvas) {
    const img = await loadImage(panel.key);
    if (img) gradedCache.set(cacheKey, { canvas: gradedCanvas(img, state.grade, state) });
  }
}

// ---- rendering ----------------------------------------------------------

function currentView(preview) {
  return {
    layout: state.layout,
    panels: state.panels.map((p) => ({ img: gradedFor(p), zoom: p.zoom, sx: p.sx, sy: p.sy })),
    title: state.title,
    subtitle: state.subtitle,
    titleFill: state.titleFill,
    titleScale: state.titleScale,
    badge: state.badge,
    badgeText: state.badgeText,
    selected: state.selected,
    preview,
  };
}

function render() {
  paintCover(ctx, stage.width, stage.height, currentView(true));
}

function panelRects() {
  const { gap, inner } = coverGeometry(stage.width, stage.height);
  return layoutRects(state.layout, inner, gap);
}

// ---- history ------------------------------------------------------------

const undoStack = [];
const redoStack = [];
function snapshot() {
  return JSON.stringify({
    layout: state.layout, grade: state.grade,
    bright: state.bright, con: state.con, sat: state.sat,
    title: state.title, subtitle: state.subtitle,
    titleFill: state.titleFill, titleScale: state.titleScale,
    badge: state.badge, badgeText: state.badgeText,
    panels: state.panels.map((p) => ({ ...p })),
    selected: state.selected,
  });
}
function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
}
function restore(json) {
  const s = JSON.parse(json);
  Object.assign(state, s);
  gradedCache.clear();
  syncControls();
  render();
}

// ---- controls -----------------------------------------------------------

function syncControls() {
  document.querySelectorAll('#layouts button').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  $('grade').value = state.grade;
  $('bright').value = state.bright;
  $('con').value = state.con;
  $('sat').value = state.sat;
  $('title').value = state.title;
  $('subtitle').value = state.subtitle;
  $('titleFill').value = state.titleFill;
  $('titleSize').value = state.titleScale;
  $('badgeOn').checked = state.badge;
  $('badgeText').value = state.badgeText;
  syncPanelControls();
}

function syncPanelControls() {
  const idx = Math.max(0, state.selected);
  const p = state.panels[idx];
  $('selLabel').textContent = `Panel ${idx + 1}`;
  $('zoom').value = p.zoom;
  $('sx').value = p.sx;
  $('sy').value = p.sy;
}

function buildControls() {
  const wrap = $('layouts');
  for (const [key, label] of Object.entries(LAYOUTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.layout = key;
    b.textContent = label;
    b.addEventListener('click', () => {
      pushHistory();
      state.layout = key;
      if (state.selected >= panelRects().length) state.selected = 0;
      syncControls();
      render();
    });
    wrap.appendChild(b);
  }
  const gradeSel = $('grade');
  for (const [key, g] of Object.entries(GRADES)) {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = g.label;
    gradeSel.appendChild(o);
  }
  gradeSel.addEventListener('change', () => {
    pushHistory();
    state.grade = gradeSel.value;
    gradedCache.clear();
    render();
  });
  const adj = (id, prop) => {
    $(id).addEventListener('input', (e) => {
      state[prop] = Number(e.target.value);
      gradedCache.clear();
      render();
    });
    $(id).addEventListener('change', pushHistory);
  };
  adj('bright', 'bright');
  adj('con', 'con');
  adj('sat', 'sat');

  const setPhoto = (key) => {
    pushHistory();
    state.panels[state.selected].key = key;
    gradedCache.clear();
    render();
  };
  $('usePier').addEventListener('click', () => setPhoto('pier'));
  $('useBoulevard').addEventListener('click', () => setPhoto('boulevard'));
  $('clearPanel').addEventListener('click', () => setPhoto(null));
  $('uploadBtn').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(f);
    e.target.value = '';
  });
  $('spreadBtn').addEventListener('click', () => {
    const key = state.panels[state.selected].key;
    if (!key) return;
    pushHistory();
    state.panels.forEach((p) => { p.key = key; });
    render();
  });

  const panelSlider = (id, prop) => {
    $(id).addEventListener('input', (e) => {
      state.panels[state.selected][prop] = Number(e.target.value);
      render();
    });
    $(id).addEventListener('change', pushHistory);
  };
  panelSlider('zoom', 'zoom');
  panelSlider('sx', 'sx');
  panelSlider('sy', 'sy');

  $('title').addEventListener('input', (e) => { state.title = e.target.value; render(); });
  $('title').addEventListener('change', pushHistory);
  $('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; render(); });
  $('subtitle').addEventListener('change', pushHistory);
  $('titleFill').addEventListener('change', (e) => { pushHistory(); state.titleFill = e.target.value; render(); });
  $('titleSize').addEventListener('input', (e) => { state.titleScale = Number(e.target.value); render(); });
  $('titleSize').addEventListener('change', pushHistory);
  $('badgeOn').addEventListener('change', (e) => { pushHistory(); state.badge = e.target.checked; render(); });
  $('badgeText').addEventListener('input', (e) => { state.badgeText = e.target.value; render(); });
  $('badgeText').addEventListener('change', pushHistory);

  $('undoBtn').addEventListener('click', () => {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
  });
  $('redoBtn').addEventListener('click', () => {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
  });
  $('resetBtn').addEventListener('click', () => {
    pushHistory();
    state.panels = [blankPanel(), blankPanel(), blankPanel(), blankPanel()];
    state.selected = 0;
    gradedCache.clear();
    syncPanelControls();
    render();
  });

  document.querySelectorAll('.export-btn').forEach((b) => {
    b.addEventListener('click', () => exportPng(Number(b.dataset.w), Number(b.dataset.h)));
  });
}

async function exportPng(w, h) {
  await Promise.all(state.panels.map(ensureGraded));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const view = currentView(false);
  paintCover(off.getContext('2d'), w, h, view);
  off.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `panel-pop-${w}x${h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

// ---- canvas pointer interaction -----------------------------------------

let drag = null;
function canvasPoint(e) {
  const box = stage.getBoundingClientRect();
  return {
    x: (e.clientX - box.left) * (stage.width / box.width),
    y: (e.clientY - box.top) * (stage.height / box.height),
  };
}
stage.addEventListener('pointerdown', (e) => {
  const pt = canvasPoint(e);
  const rects = panelRects();
  const idx = rects.findIndex((r) => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h);
  if (idx === -1) return;
  if (idx !== state.selected) {
    state.selected = idx;
    syncPanelControls();
  }
  const p = state.panels[idx];
  drag = { idx, startX: pt.x, startY: pt.y, sx: p.sx, sy: p.sy, rect: rects[idx], moved: false };
  stage.setPointerCapture(e.pointerId);
  render();
});
stage.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const pt = canvasPoint(e);
  const p = state.panels[drag.idx];
  p.sx = Math.max(-0.6, Math.min(0.6, drag.sx + (pt.x - drag.startX) / drag.rect.w));
  p.sy = Math.max(-0.6, Math.min(0.6, drag.sy + (pt.y - drag.startY) / drag.rect.h));
  drag.moved = true;
  syncPanelControls();
  render();
});
stage.addEventListener('pointerup', () => {
  if (drag && drag.moved) pushHistory();
  drag = null;
});
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = state.panels[state.selected];
  p.zoom = Math.max(1, Math.min(3.5, p.zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
  syncPanelControls();
  render();
}, { passive: false });

// ---- screenshot scenes ----------------------------------------------------

async function applyScene(q) {
  const photo = q.get('photo');
  if (photo && SAMPLES[photo]) {
    state.panels.forEach((p) => { p.key = photo; });
  }
  if (q.get('caption')) state.title = q.get('caption');
  if (q.get('subtitle')) state.subtitle = q.get('subtitle');
  if (q.get('layout') && LAYOUTS[q.get('layout')]) state.layout = q.get('layout');
  if (q.get('grade') && GRADES[q.get('grade')]) state.grade = q.get('grade');
  if (q.get('badge') === '0') state.badge = false;
  const size = q.get('size');
  if (size && /^\d+x\d+$/.test(size)) {
    const [w, h] = size.split('x').map(Number);
    stage.width = w;
    stage.height = h;
  }
  state.selected = -1;
  gradedCache.clear();
  await Promise.all(state.panels.map(ensureGraded));
}

async function boot() {
  buildControls();
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (shot) {
    document.body.dataset.shot = shot;
    await applyScene(q);
  }
  syncControls();
  render();
  if (shot) {
    await document.fonts.ready;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      render();
      window.__shotReady = true;
    }));
  }
}

boot();
