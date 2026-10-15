/**
 * textures.js — every surface in the game is generated at runtime on a
 * 2D canvas. No image files ship with this project.
 */
import * as THREE from 'three';
import { CLUES, STARS, STAR_AZIMUTH, MERIDIAN_SPAN } from '../clues.js';

/* ------------------------------------------------------------------ *
 *  small helpers
 * ------------------------------------------------------------------ */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  return { c, x, w, h };
}

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';
const MONO = 'Menlo, Consolas, "DejaVu Sans Mono", monospace';
const HAND = '"Segoe Script", "Bradley Hand", "Snell Roundhand", "Apple Chancery", cursive';

/** Tileable value-noise field. */
function noiseField(size, cells, rand) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const out = new Float32Array(size * size);
  const s = cells / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x * s, fy = y * s;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
      const i00 = (y0 % cells) * cells + (x0 % cells);
      const i10 = (y0 % cells) * cells + ((x0 + 1) % cells);
      const i01 = ((y0 + 1) % cells) * cells + (x0 % cells);
      const i11 = ((y0 + 1) % cells) * cells + ((x0 + 1) % cells);
      const a = g[i00] + (g[i10] - g[i00]) * ux;
      const b = g[i01] + (g[i11] - g[i01]) * ux;
      out[y * size + x] = a + (b - a) * uy;
    }
  }
  return out;
}

function fbmField(size, octaves, rand) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0, cells = 4;
  for (let o = 0; o < octaves; o++) {
    const f = noiseField(size, cells, rand);
    for (let i = 0; i < out.length; i++) out[i] += f[i] * amp;
    tot += amp; amp *= 0.5; cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

/** Paint a noise field over a canvas as a translucent multiply/screen layer. */
function overlayField(x, w, h, field, color, strength, mode = 'source-over') {
  const img = x.createImageData(w, h);
  const [r, g, b] = color;
  for (let i = 0; i < w * h; i++) {
    const v = field[i] * strength;
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.max(0, Math.min(255, v * 255));
  }
  const tmp = mk(w, h);
  tmp.x.putImageData(img, 0, 0);
  x.globalCompositeOperation = mode;
  x.drawImage(tmp.c, 0, 0, w, h);
  x.globalCompositeOperation = 'source-over';
}

/* grime / stains ------------------------------------------------- */
function stains(x, w, h, rand, count, color, maxA = 0.14) {
  for (let i = 0; i < count; i++) {
    const cx = rand() * w, cy = rand() * h;
    const r = (0.06 + rand() * 0.3) * Math.min(w, h);
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(${color},${maxA * (0.4 + rand() * 0.6)})`);
    gr.addColorStop(0.6, `rgba(${color},${maxA * 0.35})`);
    gr.addColorStop(1, `rgba(${color},0)`);
    x.fillStyle = gr;
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
}

function speckle(x, w, h, rand, count, colors, size = 1.6, alpha = 0.25) {
  for (let i = 0; i < count; i++) {
    x.globalAlpha = alpha * (0.3 + rand() * 0.7);
    x.fillStyle = colors[(rand() * colors.length) | 0];
    const s = size * (0.4 + rand() * 1.4);
    x.beginPath(); x.arc(rand() * w, rand() * h, s, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
}

/** Ragged, water-eaten edge mask. */
function eatenEdges(x, w, h, rand, amount = 14) {
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < amount * 8; i++) {
    const side = (rand() * 4) | 0;
    let px, py;
    if (side === 0) { px = rand() * w; py = 0; }
    else if (side === 1) { px = w; py = rand() * h; }
    else if (side === 2) { px = rand() * w; py = h; }
    else { px = 0; py = rand() * h; }
    x.beginPath();
    x.arc(px, py, 3 + rand() * amount, 0, 7);
    x.fill();
  }
  x.globalCompositeOperation = 'source-over';
}

/** Chalky, slightly broken stroke of text. */
function chalkText(x, text, px, py, size, color = 'rgba(232,236,230,', weight = 1.6, jitter = 0.9, seedFn = Math.random) {
  x.save();
  x.font = `${size}px ${HAND}`;
  x.textBaseline = 'alphabetic';
  x.fillStyle = color + '1)';
  for (let pass = 0; pass < 7; pass++) {
    x.globalAlpha = 0.16 + (pass === 0 ? 0.34 : 0.08);
    const ox = (seedFn() - 0.5) * jitter, oy = (seedFn() - 0.5) * jitter;
    x.fillText(text, px + ox, py + oy);
  }
  x.globalAlpha = 1;
  x.restore();
}

/** Engraved text: a dark cut with a bright lower lip. */
function engraveText(x, text, px, py, size, font = SERIF, spacing = 0) {
  x.save();
  x.font = `${size}px ${font}`;
  if (spacing) {
    // manual letter spacing
    let cx = px;
    for (const ch of text) { x.fillText(ch, cx, py); cx += x.measureText(ch).width + spacing; }
  } else {
    x.fillText(text, px, py);
  }
  x.restore();
}

function engraveBlock(x, text, px, py, size, lineH, opts = {}) {
  const { font = SERIF, color = 'rgba(30,24,12,.86)', hi = 'rgba(255,244,208,.30)', spacing = 0, align = 'left' } = opts;
  const lines = text.split('\n');
  x.save();
  x.font = `${size}px ${font}`;
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';

  // dy is an ABSOLUTE baseline, already offset by the caller
  const drawLine = (ln, dx, y, fill) => {
    x.fillStyle = fill;
    if (spacing) {
      let total = 0;
      for (const ch of ln) total += x.measureText(ch).width + spacing;
      total -= spacing;
      let sx = align === 'center' ? px - total / 2 : align === 'right' ? px - total : px;
      for (const ch of ln) { x.fillText(ch, sx + dx, y); sx += x.measureText(ch).width + spacing; }
    } else {
      const prev = x.textAlign;
      x.textAlign = align;
      x.fillText(ln, px + dx, y);
      x.textAlign = prev;
    }
  };

  lines.forEach((ln, i) => {
    const yy = py + i * lineH;
    drawLine(ln, 1.4, yy + 1.6, hi);   // lit lower lip of the cut
    drawLine(ln, 0, yy, color);        // the cut itself
  });
  x.restore();
  return lines.length * lineH;
}

/* ------------------------------------------------------------------ *
 *  clue scans
 * ------------------------------------------------------------------ */

function paperBase(x, w, h, rand, tone = '#d9cbaa') {
  x.fillStyle = tone; x.fillRect(0, 0, w, h);
  const f = fbmField(128, 5, rand);
  const tmp = mk(128, 128);
  const img = tmp.x.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = f[i];
    img.data[i * 4] = 120; img.data[i * 4 + 1] = 98; img.data[i * 4 + 2] = 62;
    img.data[i * 4 + 3] = Math.max(0, (v - 0.42)) * 150;
  }
  tmp.x.putImageData(img, 0, 0);
  x.globalAlpha = 0.5; x.drawImage(tmp.c, 0, 0, w, h); x.globalAlpha = 1;
  stains(x, w, h, rand, 16, '110,84,44', 0.2);
  stains(x, w, h, rand, 7, '58,42,20', 0.16);
}

function scanTideTable() {
  const { c, x, w, h } = mk(768, 1120);
  const rand = mulberry32(18490812);
  paperBase(x, w, h, rand, '#dccfae');

  engraveBlock(x, 'BELLROCK SOUND', w / 2, 92, 34, 1, { align: 'center', spacing: 3 });
  engraveBlock(x, 'TIDE TABLE', w / 2, 142, 26, 1, { align: 'center', spacing: 5 });
  engraveBlock(x, 'SEASON:  MARCH 1889', w / 2, 190, 18, 1, { align: 'center', spacing: 3 });

  x.strokeStyle = 'rgba(43,32,19,.5)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(70, 214); x.lineTo(w - 70, 214); x.stroke();

  const rows = [
    ['Feb 24', '03:40', '09:58', '5.1'], ['Feb 25', '04:33', '10:49', '5.6'],
    ['Feb 26', '05:27', '11:41', '6.0'], ['Feb 27', '06:20', '12:33', '6.5'],
    ['Feb 28', '07:14', '13:26', '6.2'], ['Mar  1', '02:12', '08:31', '5.4'],
    ['Mar  2', '03:05', '09:22', '5.9'], ['Mar  3', '03:58', '10:16', '6.4'],
    ['Mar  4', '04:51', '11:08', '6.8'], ['Mar  5', '05:44', '12:00', '7.1'],
    ['Mar  6', '06:42', '12:53', '7.6'],
  ];
  x.font = `21px ${MONO}`;
  x.textAlign = 'left';
  const cols = [112, 300, 466, 606];
  ['DAY', 'HIGH', 'LOW', 'HEIGHT'].forEach((t, i) => {
    x.fillStyle = '#2b2013';
    x.fillText(t, cols[i], 262);
  });
  x.strokeStyle = 'rgba(43,32,19,.34)';
  x.beginPath(); x.moveTo(96, 278); x.lineTo(w - 96, 278); x.stroke();

  rows.forEach((r, i) => {
    const y = 322 + i * 52;
    r.forEach((t, j) => {
      x.fillStyle = 'rgba(38,27,14,.92)';
      x.fillText(t, cols[j], y);
    });
    x.strokeStyle = 'rgba(60,46,26,.12)';
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(96, y + 15); x.lineTo(w - 96, y + 15); x.stroke();
  });

  engraveBlock(x,
    '* HEIGHTS AT THE BELL, in fathoms above chart datum.\n  THEY ARE NOT THE SUMP. FOR THE SUMP, READ THE GAUGE.',
    104, 930, 18, 30, { font: SERIF, color: 'rgba(46,34,18,.82)', spacing: 0.3 });

  stains(x, w, h, rand, 9, '88,66,34', 0.18);
  // a tide line creeping up from the bottom
  const lg = x.createLinearGradient(0, h - 150, 0, h);
  lg.addColorStop(0, 'rgba(52,44,26,0)');
  lg.addColorStop(0.7, 'rgba(52,44,26,.2)');
  lg.addColorStop(1, 'rgba(30,34,28,.42)');
  x.fillStyle = lg; x.fillRect(0, h - 150, w, 150);
  eatenEdges(x, w, h, rand, 11);
  return c;
}

function scanSlate() {
  const { c, x, w, h } = mk(768, 1024);
  const rand = mulberry32(18890307);
  x.fillStyle = '#23262a'; x.fillRect(0, 0, w, h);
  const f = fbmField(160, 5, mulberry32(77));
  overlayField(x, w, h, resizeField(f, 160, w, h), [150, 160, 172], 0.16);
  stains(x, w, h, rand, 12, '10, 12, 14', 0.4);

  x.strokeStyle = 'rgba(200,210,205,.2)'; x.lineWidth = 3;
  x.strokeRect(46, 46, w - 92, h - 92);

  chalkText(x, 'THE GATE KEEPS', 92, 168, 54);
  chalkText(x, 'THREE FIGURES.', 92, 230, 54);
  x.strokeStyle = 'rgba(210,220,215,.26)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(92, 262); x.lineTo(400, 260); x.stroke();

  chalkText(x, 'I.    the MONTH of the great tide', 96, 344, 38);
  chalkText(x, 'II.   the DEPTH of the sump,', 96, 420, 38);
  chalkText(x, '      in fathoms, as the', 140, 476, 38);
  chalkText(x, '      GAUGE reads it now', 140, 532, 38);
  chalkText(x, 'III.  the LAST figure of the', 96, 628, 38);
  chalkText(x, '      minutes past the turn', 140, 684, 38);
  chalkText(x, '      of high water', 140, 740, 38);

  chalkText(x, 'Set them in order.', 96, 838, 38);
  chalkText(x, 'Do not hurry it.', 96, 892, 38);
  chalkText(x, '— E. M., 1889', 330, 972, 34);

  // smudges where a sleeve has wiped it
  for (let i = 0; i < 9; i++) {
    x.globalAlpha = 0.022 + rand() * 0.03;
    x.fillStyle = '#dfe6e0';
    x.beginPath();
    x.ellipse(120 + rand() * (w - 240), 140 + rand() * (h - 260), 40 + rand() * 70, 12 + rand() * 26, rand() * 3, 0, 7);
    x.fill();
  }
  x.globalAlpha = 1;
  eatenEdges(x, w, h, rand, 7);
  return c;
}

function scanLogbook() {
  const { c, x, w, h } = mk(768, 1024);
  const rand = mulberry32(18890306);
  paperBase(x, w, h, rand, '#e0d3b4');
  // ruled lines
  x.strokeStyle = 'rgba(70,80,110,.16)'; x.lineWidth = 1.4;
  for (let y = 150; y < h - 60; y += 34) {
    x.beginPath(); x.moveTo(54, y); x.lineTo(w - 54, y + (rand() - 0.5) * 2.4); x.stroke();
  }
  x.strokeStyle = 'rgba(140,60,50,.25)';
  x.beginPath(); x.moveTo(168, 110); x.lineTo(168, h - 60); x.stroke();

  engraveBlock(x, "BELLROCK LIGHT — KEEPER'S LOG", 54, 96, 30, 1, { spacing: 1.6, color: 'rgba(48,32,18,.9)' });
  x.strokeStyle = 'rgba(60,42,22,.45)'; x.lineWidth = 2.2;
  x.beginPath(); x.moveTo(54, 112); x.lineTo(w - 54, 112); x.stroke();

  const entries = [
    ['24 Feb.', 'Wind SW, moderate. Nothing in the sump\nbut rain.'],
    ['26 Feb.', 'Dredged the lower gallery to the knee.\nThe gauge reads true. Trust the brass\nand not my arithmetic.'],
    ['28 Feb.', 'Snow on the Sound, thawing fast.'],
    ['1 Mar.', 'Clear and bitter. Sleeve the glass.'],
    ['3 Mar.', 'Water rising all afternoon.'],
    ['5 Mar.', 'Nothing to report.'],
    ['6 Mar.', 'It came higher this season than any day\nof it. I barred the sluice at the turn of\nthe tide and let it run. The gate wants\nthree figures, the way the last one did.'],
    ['7 Mar.', 'Gate still barred. The meridian span is\nfive degrees either side of due east,\nand nothing outside it will pass.'],
  ];
  let y = 190;
  const ink = 'rgba(38,30,44,.88)';
  for (const [d, body] of entries) {
    x.fillStyle = 'rgba(52,40,30,.9)';
    x.font = `23px ${SERIF}`;
    x.fillText(d, 62, y);
    x.fillStyle = ink;
    x.font = `22px ${HAND}`;
    const lines = body.split('\n');
    lines.forEach((ln, i) => x.fillText(ln, 186, y + i * 34));
    y += lines.length * 34 + 16;
  }

  stains(x, w, h, rand, 8, '92,70,36', 0.18);
  const lg = x.createLinearGradient(0, h - 260, 0, h);
  lg.addColorStop(0, 'rgba(60,48,28,0)');
  lg.addColorStop(1, 'rgba(44,38,24,.4)');
  x.fillStyle = lg; x.fillRect(0, h - 260, w, 260);
  eatenEdges(x, w, h, rand, 10);
  return c;
}

function stoneBase(x, w, h, rand, tone = '#8d8b83') {
  x.fillStyle = tone; x.fillRect(0, 0, w, h);
  const f = fbmField(128, 6, rand);
  overlayField(x, w, h, resizeField(f, 128, w, h), [40, 38, 34], 0.4, 'multiply');
  overlayField(x, w, h, resizeField(fbmField(128, 4, mulberry32(rand() * 1e6)), 128, w, h), [225, 222, 210], 0.16);
  stains(x, w, h, rand, 14, '58, 66, 52', 0.2);
  speckle(x, w, h, rand, 1400, ['#6d6b62', '#a5a296', '#4f5a4a'], 2.2, 0.2);
}

function scanStone() {
  const { c, x, w, h } = mk(768, 512);
  const rand = mulberry32(1800);
  stoneBase(x, w, h, rand, '#8f8d85');
  engraveBlock(x, 'HOLLOW MERIDIAN', 96, 130, 46, 1, { spacing: 4, color: 'rgba(28,26,22,.88)', hi: 'rgba(255,255,240,.26)' });
  x.strokeStyle = 'rgba(30,28,24,.35)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(96, 158); x.lineTo(w - 220, 156); x.stroke();
  engraveBlock(x, 'THIS TOWER WAS\nBEGUN\nMDCCC', 96, 250, 46, 78, { spacing: 3, color: 'rgba(26,24,20,.9)', hi: 'rgba(255,255,240,.24)' });
  chalkText(x, '— the rest of the line is broken away —', 96, 452, 26, 'rgba(226,222,208,', 1.4, 0.7, mulberry32(9));
  // a ragged fracture running off the lower right, where the rest went
  x.strokeStyle = 'rgba(18,17,15,.7)'; x.lineWidth = 5; x.lineJoin = 'round';
  x.beginPath();
  x.moveTo(w + 10, 268);
  for (let i = 0; i <= 9; i++) {
    x.lineTo(w - 8 - i * 13, 268 + i * 26 + (rand() - 0.5) * 16);
  }
  x.stroke();
  x.strokeStyle = 'rgba(255,255,240,.14)'; x.lineWidth = 2;
  x.beginPath();
  x.moveTo(w + 10, 273);
  for (let i = 0; i <= 9; i++) {
    x.lineTo(w - 8 - i * 13, 273 + i * 26 + (rand() - 0.5) * 16);
  }
  x.stroke();
  return c;
}

function scanFragment() {
  const { c, x, w, h } = mk(640, 400);
  const rand = mulberry32(1889);
  x.clearRect(0, 0, w, h);
  // irregular wedge of stone
  x.save();
  x.beginPath();
  x.moveTo(28, 66); x.lineTo(300, 30); x.lineTo(596, 92); x.lineTo(612, 300); x.lineTo(380, 366); x.lineTo(52, 322);
  x.closePath();
  x.clip();
  stoneBase(x, w, h, rand, '#93918a');
  engraveBlock(x, '...AND FINISHED', 62, 150, 38, 1, { spacing: 2.4, color: 'rgba(28,26,22,.88)', hi: 'rgba(255,255,240,.24)' });
  engraveBlock(x, 'LXXXIX', 62, 268, 78, 1, { spacing: 7, color: 'rgba(26,24,20,.9)', hi: 'rgba(255,255,240,.24)' });
  x.restore();
  // torn edge shading
  x.strokeStyle = 'rgba(20,20,18,.45)'; x.lineWidth = 3; x.stroke();
  return c;
}

function brassBase(x, w, h, rand, hi = '#8a6c26', lo = '#4a3712') {
  const g = x.createLinearGradient(0, 0, w * 0.7, h);
  g.addColorStop(0, hi); g.addColorStop(0.45, '#6d5420'); g.addColorStop(1, lo);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const f = fbmField(128, 5, rand);
  overlayField(x, w, h, resizeField(f, 128, w, h), [255, 232, 160], 0.2, 'screen');
  stains(x, w, h, rand, 16, '30, 46, 34', 0.3); // verdigris
  stains(x, w, h, rand, 8, '20, 14, 4', 0.25);
  speckle(x, w, h, rand, 700, ['#3f5a48', '#2f4436'], 2.4, 0.2);
}

function scanPlateOrrery() {
  const { c, x, w, h } = mk(768, 448);
  const rand = mulberry32(4411);
  brassBase(x, w, h, rand);
  x.strokeStyle = 'rgba(20,14,4,.5)'; x.lineWidth = 6; x.strokeRect(24, 24, w - 48, h - 48);
  x.strokeStyle = 'rgba(255,230,160,.22)'; x.lineWidth = 2; x.strokeRect(34, 34, w - 68, h - 68);
  engraveBlock(x, 'THE MERIDIAN GATE ANSWERS TO THE THREE\nFIXED STARS THAT ROSE WITHIN THE\nMERIDIAN SPAN.', w / 2, 120, 32, 46,
    { align: 'center', color: 'rgba(26,20,6,.88)', hi: 'rgba(255,238,180,.3)', spacing: 1.6 });
  engraveBlock(x, 'SET THE RINGS IN THE ORDER THEY ROSE.', w / 2, 300, 28, 1,
    { align: 'center', color: 'rgba(26,20,6,.85)', hi: 'rgba(255,238,180,.26)', spacing: 1.4 });
  engraveBlock(x, '— E. M.', w / 2, 372, 24, 1, { align: 'center', color: 'rgba(26,20,6,.7)', hi: 'rgba(255,238,180,.2)' });
  return c;
}

function scanLensPlate() {
  const { c, x, w, h } = mk(768, 560);
  const rand = mulberry32(9911);
  brassBase(x, w, h, rand, '#93762c', '#513c14');
  x.strokeStyle = 'rgba(20,14,4,.5)'; x.lineWidth = 6; x.strokeRect(22, 22, w - 44, h - 44);
  engraveBlock(x, 'SET THE VAULT TO THE YEAR OF\nCOMPLETION, IN PLAIN FIGURES.', w / 2, 118, 34, 50,
    { align: 'center', color: 'rgba(26,20,6,.9)', hi: 'rgba(255,238,180,.3)', spacing: 1.8 });
  engraveBlock(x, 'THE NUMERARY OF THIS HOUSE —\n\n    MDCCC = 1800          L = 50\n    XXX  =  30           IX =  9', 92, 268, 30, 46,
    { color: 'rgba(26,20,6,.88)', hi: 'rgba(255,238,180,.28)', spacing: 1.2 });
  engraveBlock(x, 'RECORD THE YEAR OF THE INSTRUMENT.\nNOT THE YEAR OF THE REIGN.', w / 2, 478, 25, 38,
    { align: 'center', color: 'rgba(26,20,6,.78)', hi: 'rgba(255,238,180,.22)', spacing: 1.4 });
  return c;
}

function scanGauge() {
  const { c, x, w, h } = mk(384, 1024);
  const rand = mulberry32(707);
  brassBase(x, w, h, rand, '#9a7c2e', '#54401a');
  x.strokeStyle = 'rgba(20,14,4,.45)'; x.lineWidth = 5; x.strokeRect(16, 16, w - 32, h - 32);
  const numerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const top = 92, bot = h - 92, n = 12;
  x.textBaseline = 'middle';
  for (let i = 0; i <= n; i++) {
    const yy = bot - (i / n) * (bot - top);
    const major = i % 2 === 0;
    x.strokeStyle = 'rgba(22,16,6,.6)'; x.lineWidth = major ? 4 : 2;
    x.beginPath(); x.moveTo(54, yy); x.lineTo(major ? 150 : 120, yy); x.stroke();
    x.strokeStyle = 'rgba(255,232,170,.16)'; x.lineWidth = 1.4;
    x.beginPath(); x.moveTo(54, yy + 2.5); x.lineTo(major ? 150 : 120, yy + 2.5); x.stroke();
    if (numerals[i]) {
      x.fillStyle = 'rgba(24,18,6,.85)'; x.fillText(numerals[i], 168, yy + 1.5);
      x.fillStyle = 'rgba(255,236,178,.22)'; x.fillText(numerals[i], 169.5, yy + 3);
    }
  }
  // the float, resting at VII
  const yv = bot - (7 / n) * (bot - top);
  x.fillStyle = 'rgba(250,246,235,.95)';
  x.beginPath(); x.moveTo(40, yv - 17); x.lineTo(150, yv - 17); x.lineTo(150, yv + 17); x.lineTo(40, yv + 17); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(30,24,10,.6)'; x.lineWidth = 2; x.stroke();
  x.fillStyle = 'rgba(30,24,10,.85)'; x.font = `15px ${MONO}`; x.textAlign = 'center';
  x.fillText('VII', 95, yv + 1);
  x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(44, yv - 13, 100, 5);
  x.textAlign = 'left';
  engraveBlock(x, 'SUMP', w / 2, 58, 22, 1, { align: 'center', color: 'rgba(24,18,6,.75)', hi: 'rgba(255,236,178,.2)', spacing: 3 });
  stains(x, w, h, rand, 10, '30, 46, 34', 0.26);
  return c;
}

/** Parse the compact glyph path strings in clues.js and stroke them. */
export function strokeGlyphPath(x, d, { lineWidth = 1.3, color = '#000' } = {}) {
  const toks = d.match(/[ML]|-?[\d.]+/g) || [];
  let i = 0, cx = 0, cy = 0;
  x.save();
  x.strokeStyle = color;
  x.lineWidth = lineWidth;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.beginPath();
  while (i < toks.length) {
    const t = toks[i++];
    if (t === 'M') { cx = +toks[i++]; cy = +toks[i++]; x.moveTo(cx, cy); }
    else if (t === 'L') { const nx = +toks[i++], ny = +toks[i++]; x.lineTo(nx, ny); }
    else { x.lineTo(+t, +toks[i++]); }
  }
  x.stroke();
  x.restore();
}

function scanStarChart() {
  const S = 1024;
  const { c, x, w, h } = mk(S, S);
  const rand = mulberry32(21600);

  paperBase(x, w, h, rand, '#d8c8a2');
  x.save();
  x.beginPath(); x.rect(0, 0, w, h); x.clip();

  /* The prop in the gallery is a disc, and a square texture cropped to a
     circle loses the four corners. So the chart is drawn *inside* its own
     inscribed circle, and the disc geometry is sized to match exactly. */

  /* ---------- the rose ---------- */
  const cx = w / 2, cy = 318, R = 282;
  const SAFE = 288;                     // keep every mark inside the rim
  const A = (b) => ((b - 90) * Math.PI) / 180;

  for (let i = 0; i < 300; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * R;
    x.globalAlpha = 0.15 + rand() * 0.45;
    x.fillStyle = rand() > 0.86 ? '#7a4a2a' : '#2a2016';
    x.beginPath(); x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.7 + rand() * 1.8, 0, 7); x.fill();
  }
  x.globalAlpha = 1;

  x.strokeStyle = 'rgba(52,40,24,.20)'; x.lineWidth = 1;
  for (let i = 1; i <= 4; i++) { x.beginPath(); x.arc(cx, cy, (R / 4) * i, 0, 7); x.stroke(); }

  for (let d = 0; d < 360; d += 5) {
    const major = d % 45 === 0, mid = d % 15 === 0;
    const len = major ? 30 : mid ? 17 : 9;
    const a = A(d);
    x.strokeStyle = 'rgba(40,30,18,.55)';
    x.lineWidth = major ? 2.6 : 1.2;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    x.lineTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
    x.stroke();
  }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const d of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const a = A(d);
    const lbl = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[d];
    x.fillStyle = 'rgba(36,26,14,.85)';
    x.font = `20px ${SERIF}`;
    x.fillText(lbl, cx + Math.cos(a) * (R - 48), cy + Math.sin(a) * (R - 48));
  }

  /* ---------- the meridian span, the only thing in colour ---------- */
  const { centre, halfWidth } = MERIDIAN_SPAN;
  const a0 = A(centre - halfWidth), a1 = A(centre + halfWidth);
  x.beginPath();
  x.arc(cx, cy, R - 2, a0, a1);
  x.arc(cx, cy, R * 0.46, a1, a0, true);
  x.closePath();
  x.fillStyle = 'rgba(172,48,32,.30)'; x.fill();
  x.strokeStyle = 'rgba(140,32,22,.75)'; x.lineWidth = 2.5; x.stroke();

  x.save();
  x.fillStyle = 'rgba(122,26,18,.95)';
  x.font = `bold 21px ${SERIF}`;
  const am = A(centre);
  x.translate(cx + Math.cos(am) * (R * 0.72), cy + Math.sin(am) * (R * 0.72));
  x.rotate(am + Math.PI / 2);
  x.fillText('MERIDIAN SPAN', 0, 0);
  x.restore();

  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.font = `bold 21px ${MONO}`;
  x.fillStyle = 'rgba(122,26,18,.9)';
  x.fillText(`${String(centre).padStart(3, '0')}\u00b0 \u00b1 ${halfWidth}`, cx + 14, cy - 14);

  /* ---------- the ten figures, tabulated ----------
     The table is the answer to Act II, so it sits inside the circle and is
     sized to be read at walking distance rather than squeezed into whatever
     space is left over. */
  const top = 652;
  x.strokeStyle = 'rgba(43,32,19,.45)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(250, top - 30); x.lineTo(w - 250, top - 30); x.stroke();

  engraveBlock(x, 'THE TEN FIXED FIGURES', w / 2, top - 52, 25, 1, { align: 'center', spacing: 4 });

  const colL = 300, colR = 724;
  x.font = `18px ${MONO}`;
  x.fillStyle = 'rgba(43,32,19,.72)';
  x.textAlign = 'left';  x.fillText('FIGURE', colL, top + 4);
  x.textAlign = 'right'; x.fillText('RISES AT', colR, top + 4);
  x.strokeStyle = 'rgba(43,32,19,.28)'; x.lineWidth = 1.4;
  x.beginPath(); x.moveTo(colL - 12, top + 14); x.lineTo(colR + 12, top + 14); x.stroke();

  const rows = STARS.map((st) => ({ st, bearing: STAR_AZIMUTH[st.key] }))
    .sort((p, q) => p.bearing - q.bearing);

  rows.forEach((e, i) => {
    const y = top + 44 + i * 25.5;
    x.save();
    x.translate(colL - 36, y - 20);
    x.scale(0.78, 0.78);
    strokeGlyphPath(x, e.st.glyph, { lineWidth: 1.8, color: 'rgba(40,30,18,.9)' });
    x.restore();
    x.textAlign = 'left';
    x.fillStyle = 'rgba(36,26,14,.95)';
    x.font = `20px ${SERIF}`;
    x.fillText(e.st.name.toUpperCase(), colL, y);
    x.textAlign = 'right';
    x.font = `21px ${MONO}`;
    x.fillStyle = 'rgba(40,30,18,.95)';
    x.fillText(`${String(e.bearing).padStart(3, '0')}\u00b0`, colR, y);
    x.strokeStyle = 'rgba(60,46,26,.12)';
    x.beginPath(); x.moveTo(colL - 12, y + 9); x.lineTo(colR + 12, y + 9); x.stroke();
  });

  x.textAlign = 'center';
  x.fillStyle = 'rgba(40,30,18,.72)';
  x.font = `italic 19px ${SERIF}`;
  x.fillText('Rising azimuth: the bearing at which each figure first clears the horizon,', cx, 992);
  x.fillText('taken the equinox. Only those rising inside the arc will answer.', cx, 1015);

  x.restore();
  stains(x, w, h, rand, 12, '88,66,34', 0.16);
  eatenEdges(x, w, h, rand, 9);
  return c;
}

/* nearest-neighbour field resize (cheap + keeps the noise chunky, which suits stone) */
function resizeField(f, fw, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(fw - 1, (y * fw / h) | 0);
    for (let x2 = 0; x2 < w; x2++) {
      const sx = Math.min(fw - 1, (x2 * fw / w) | 0);
      out[y * w + x2] = f[sy * fw + sx];
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  material textures
 * ------------------------------------------------------------------ */
export function stoneTexture({ size = 512, seed = 1, tint = '#6f6c64', rough = 0.94, wet = 0, mortar = 0 } = {}) {
  const { c, x, w, h } = mk(size, size);
  const rand = mulberry32(seed);
  x.fillStyle = tint; x.fillRect(0, 0, w, h);
  const f = fbmField(128, 6, rand);
  overlayField(x, w, h, resizeField(f, 128, w, h), [22, 20, 18], 0.55, 'multiply');
  overlayField(x, w, h, resizeField(fbmField(128, 4, mulberry32(seed * 7 + 3)), 128, w, h), [220, 216, 205], 0.18);
  stains(x, w, h, rand, 22, '46, 58, 44', 0.24);
  stains(x, w, h, rand, 10, '18, 16, 12', 0.22);
  speckle(x, w, h, rand, size * 4, ['#56534c', '#8c887c', '#3d4a3c'], 2.4, 0.22);
  if (wet) {
    const g = x.createLinearGradient(0, h * (1 - wet), 0, h);
    g.addColorStop(0, 'rgba(18,28,30,0)');
    g.addColorStop(1, 'rgba(12,24,28,.72)');
    x.fillStyle = g; x.fillRect(0, h * (1 - wet), w, h * wet);
  }
  if (mortar) {
    // coursed blocks
    x.strokeStyle = 'rgba(16,14,12,.55)';
    const rowsN = 6, rh = h / rowsN;
    for (let r = 0; r < rowsN; r++) {
      x.lineWidth = 3.5;
      x.beginPath(); x.moveTo(0, r * rh); x.lineTo(w, r * rh); x.stroke();
      const off = (r % 2) * (w / 8);
      for (let b = 0; b < 4; b++) {
        const bx = off + b * (w / 4);
        x.beginPath(); x.moveTo(bx, r * rh); x.lineTo(bx, (r + 1) * rh); x.stroke();
      }
    }
    x.globalAlpha = 0.2; x.strokeStyle = '#fff';
    for (let r = 0; r < rowsN; r++) {
      const off = (r % 2) * (w / 8);
      x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(0, r * rh + 2.6); x.lineTo(w, r * rh + 2.6); x.stroke();
      for (let b = 0; b < 4; b++) { x.beginPath(); x.moveTo(off + b * (w / 4) + 2.6, r * rh); x.lineTo(off + b * (w / 4) + 2.6, (r + 1) * rh); x.stroke(); }
    }
    x.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.rough = rough;
  return t;
}

export function brassTexture({ size = 512, seed = 5, verdigris = 0.3, base = '#8a6c26' } = {}) {
  const { c, x, w, h } = mk(size, size);
  const rand = mulberry32(seed);
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, base); g.addColorStop(0.5, '#6d5420'); g.addColorStop(1, '#493610');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  overlayField(x, w, h, resizeField(fbmField(128, 5, rand), 128, w, h), [255, 236, 170], 0.24, 'screen');
  overlayField(x, w, h, resizeField(fbmField(64, 4, mulberry32(seed + 11)), 64, w, h), [26, 18, 4], 0.3, 'multiply');
  stains(x, w, h, rand, Math.round(24 * verdigris) + 4, '34, 62, 48', 0.32);
  stains(x, w, h, rand, 8, '20, 14, 4', 0.3);
  speckle(x, w, h, rand, size * 2, ['#3d5a48', '#2c4234'], 2.6, 0.22);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function ironTexture({ size = 512, seed = 9 } = {}) {
  const { c, x, w, h } = mk(size, size);
  const rand = mulberry32(seed);
  x.fillStyle = '#2b2b2e'; x.fillRect(0, 0, w, h);
  overlayField(x, w, h, resizeField(fbmField(128, 6, rand), 128, w, h), [10, 9, 8], 0.6, 'multiply');
  stains(x, w, h, rand, 26, '104, 58, 30', 0.4); // rust
  stains(x, w, h, rand, 10, '70, 40, 22', 0.3);
  speckle(x, w, h, rand, size * 3, ['#5a3520', '#1b1b1d', '#7a4526'], 2.2, 0.28);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function woodTexture({ size = 512, seed = 21, tone = '#4a3520' } = {}) {
  const { c, x, w, h } = mk(size, size);
  const rand = mulberry32(seed);
  x.fillStyle = tone; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    x.strokeStyle = `rgba(${20 + rand() * 60 | 0},${12 + rand() * 40 | 0},${4 + rand() * 20 | 0},${0.06 + rand() * 0.2})`;
    x.lineWidth = 0.6 + rand() * 3.2;
    const y0 = rand() * h;
    x.beginPath();
    x.moveTo(0, y0);
    x.bezierCurveTo(w * 0.3, y0 + (rand() - 0.5) * 40, w * 0.7, y0 + (rand() - 0.5) * 40, w, y0 + (rand() - 0.5) * 20);
    x.stroke();
  }
  const knots = 5;
  for (let i = 0; i < knots; i++) {
    const kx = rand() * w, ky = rand() * h, kr = 8 + rand() * 22;
    for (let r = kr; r > 0; r -= 2) {
      x.strokeStyle = `rgba(28,16,6,${0.05 + rand() * 0.1})`;
      x.lineWidth = 1.4;
      x.beginPath(); x.ellipse(kx, ky, r, r * 0.6, rand(), 0, 7); x.stroke();
    }
  }
  stains(x, w, h, rand, 14, '16, 20, 16', 0.24);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Gentle two-layer ripple normal map for standing water. */
export function waterNormal({ size = 512, seed = 33 } = {}) {
  const { c, x, w, h } = mk(size, size);
  const a = fbmField(128, 4, mulberry32(seed));
  const b = fbmField(128, 5, mulberry32(seed + 4));
  const img = x.createImageData(w, h);
  const at = (f, u, v) => f[((v + 128) % 128) * 128 + ((u + 128) % 128)];
  for (let y = 0; y < h; y++) {
    for (let u = 0; u < w; u++) {
      const dx = (at(a, u + 1, y) - at(a, u - 1, y)) * 3.2 + (at(b, u + 1, y) - at(b, u - 1, y)) * 1.6;
      const dy = (at(a, u, y + 1) - at(a, u, y - 1)) * 3.2 + (at(b, u, y + 1) - at(b, u, y - 1)) * 1.6;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * w + u) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ------------------------------------------------------------------ *
 *  small utility textures
 * ------------------------------------------------------------------ */
/**
 * The figures on an odometer drum, drawn as a single strip that wraps the
 * barrel once.
 *
 * Ten separate flat cards cannot be taped round a ten-figure drum: a card of
 * width w wants a chordal pitch of at least w, and the pitch of a drum is
 * 2r·sin(π/10) — 0.618r, not r. A 145 mm card on a 117 mm pitch does not sit
 * beside its neighbour, it goes through it. One sleeve has no such problem,
 * because the spacing is the drawing's job and the canvas does the arithmetic.
 *
 * Each figure is kept well inside its own cell, which is what lets a bezel
 * crop the edges of the figure in front of it without ever uncovering the one
 * behind. A real counter does the same thing, and the margins are what buy it.
 *
 * `aspect` is the cell's width divided by the band's height, so the figures are
 * not stretched when the barrel is not round.
 *
 * The returned texture carries a half-cell wrap offset, which is the whole
 * reason this function owns the spacing rather than leaving it to the barrel.
 * Figure n is drawn at u = (n + 0.5)/digits, because that is where the centre
 * of the nth cell of a strip of cells falls — but the barrel puts u = 0 at the
 * front, and turning the drum by n steps brings u = n/digits there, not
 * u = (n + 0.5)/digits. Uncorrected, every figure is presented half a cell off
 * the front, which puts it behind the edge of the window rather than in it.
 */
export function digitBandTexture(digits = 10, { cellPx = 160, aspect = 0.86 } = {}) {
  const w = cellPx * digits;
  const h = Math.round(cellPx / aspect);
  const { c, x } = mk(w, h);
  const cw = w / digits;

  // The ground has to stay dark under every light in the level. This band sits
  // inside a brass bezel a hand's width from a lantern, and a mid-grey ground
  // is the first thing the bloom finds and the last thing the eye can read a
  // figure against.
  const ground = x.createLinearGradient(0, 0, 0, h);
  ground.addColorStop(0, '#1b1a17');
  ground.addColorStop(0.30, '#121110');
  ground.addColorStop(0.72, '#0e0d0c');
  ground.addColorStop(1, '#191714');
  x.fillStyle = ground;
  x.fillRect(0, 0, w, h);

  // one recessed panel per cell, and a bright rule on each division, so the
  // drum reads as ten counted places rather than as a smear of numerals
  for (let i = 0; i < digits; i++) {
    const x0 = i * cw;
    x.fillStyle = 'rgba(0,0,0,.34)';
    x.fillRect(x0 + cw * 0.06, 2, cw * 0.88, h - 4);
    x.fillStyle = 'rgba(232,208,138,.30)';
    x.fillRect(x0, 0, Math.max(1, cellPx * 0.008), h);
    x.fillStyle = 'rgba(232,208,138,.10)';
    x.fillRect(x0 + cw * 0.06, 2, cw * 0.88, Math.max(1, h * 0.006));
  }

  // The figure, sized off its own measured ink box rather than off the font
  // size — the advance width of a monospace digit and the width of the mark it
  // draws are not the same thing, and only one of them is what the eye reads.
  const targetW = cw * 0.72;
  const targetH = h * 0.78;
  x.textAlign = 'center';
  x.textBaseline = 'middle';

  for (let i = 0; i < digits; i++) {
    const ch = String(i);
    const cx = i * cw + cw / 2;
    const cy = h / 2;

    x.save();
    x.translate(cx, cy);

    x.font = `bold ${cellPx}px ${MONO}`;
    const m = x.measureText(ch);
    const iw = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
    const ih = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
    const s = Math.min(targetW / iw, targetH / ih);
    x.scale(s, s);

    // glow first, so the figure keeps a halo when the band is in shadow
    x.shadowColor = 'rgba(236,206,132,.55)';
    x.shadowBlur = cellPx * 0.20;
    x.fillStyle = 'rgba(226,198,128,.42)';
    x.fillText(ch, 0, 0);
    x.shadowBlur = 0;

    // the cut itself: a dark bevel below, a lit bevel above
    x.fillStyle = 'rgba(0,0,0,.85)';
    x.fillText(ch, 0, cellPx * 0.022);
    const face = x.createLinearGradient(0, -ih / 2, 0, ih / 2);
    face.addColorStop(0, '#fff3d2');
    face.addColorStop(0.55, '#f0d89c');
    face.addColorStop(1, '#cfa960');
    x.fillStyle = face;
    x.fillText(ch, 0, 0);

    x.restore();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  // see above: figure n is presented at the window by turning the drum n steps
  t.offset.x = 0.5 / digits;
  // the band is seen almost edge-on for most of its travel, so the mip chain
  // is what the eye actually reads for two thirds of every turn
  t.anisotropy = 16;
  return t;
}

export function glyphTexture(star, { size = 128, dark = false } = {}) {
  const { c, x } = mk(size, size);
  x.clearRect(0, 0, size, size);
  x.save();
  x.scale(size / 26, size / 26);
  x.translate(1, 1);
  strokeGlyphPath(x, star.glyph, { lineWidth: 1.4, color: dark ? '#2a2210' : '#e8d28a' });
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Small engraved brass nameplate, used for scenery signage. */
export function plateTexture(text, { w = 512, h = 128, sub = '' } = {}) {
  const { c, x } = mk(w, h);
  const rand = mulberry32(text.length * 977 + text.charCodeAt(0));
  brassBase(x, w, h, rand, '#8e7229', '#4c3814');
  x.strokeStyle = 'rgba(20,14,4,.5)'; x.lineWidth = 4; x.strokeRect(9, 9, w - 18, h - 18);
  engraveBlock(x, text, w / 2, sub ? h / 2 - 6 : h / 2 + 14, 34, 1,
    { align: 'center', color: 'rgba(24,18,6,.9)', hi: 'rgba(255,238,180,.3)', spacing: 3 });
  if (sub) engraveBlock(x, sub, w / 2, h / 2 + 26, 18, 1, { align: 'center', color: 'rgba(24,18,6,.7)', hi: 'rgba(255,238,180,.2)', spacing: 2 });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ------------------------------------------------------------------ *
 *  public: scan canvases (cached)
 * ------------------------------------------------------------------ */
const SCAN_PAINTERS = {
  tideTable: scanTideTable, slate: scanSlate, logbook: scanLogbook,
  stone: scanStone, fragment: scanFragment, gauge: scanGauge,
  starChart: scanStarChart, plateOrrery: scanPlateOrrery, lensPlate: scanLensPlate,
};

const scanCache = new Map();

/**
 * `id` may be a clue id (e.g. `orreryPlate`) or a bare scan id
 * (e.g. `plateOrrery`) — both resolve to the same drawing.
 */
export function clueCanvas(id) {
  if (scanCache.has(id)) return scanCache.get(id);
  const clue = CLUES[id];
  const scan = clue ? clue.scan : id;
  const paint = SCAN_PAINTERS[scan];
  if (!paint) throw new Error('no scan painter for ' + id);
  const c = paint();
  scanCache.set(id, c);
  return c;
}

const urlCache = new Map();
export function clueCanvasUrl(id) {
  if (!urlCache.has(id)) urlCache.set(id, clueCanvas(id).toDataURL('image/png'));
  return urlCache.get(id);
}