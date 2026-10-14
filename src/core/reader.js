/**
 * reader.js — holding a page up to the lantern.
 *
 * Reading is the entire verb of this game. In the world a clue is a thing you
 * walk up to, which is the right way to *find* one and a poor way to read
 * one: a tide table at arm's length on a dark wall gives you four pixel rows
 * of mush. So examining a clue lifts it off the wall and fills the screen,
 * where it can be panned and magnified until the strokes of the ink are
 * separate objects.
 *
 * The image is the same canvas that is on the prop in the world — one source,
 * so the page you study and the page you found can never disagree.
 */
import { CLUES } from '../clues.js';
import { clueCanvas } from '../art/textures.js';

const $ = (s) => document.querySelector(s);

const MIN_SCALE = 0.1;
// Far enough that a single printed character breaks into visible strokes.
// Past about 8x a 1024 px page is only showing interpolation, not detail.
const MAX_SCALE = 8;

export function createReader({ audio } = {}) {
  const el = {
    root: $('#reader'),
    stage: $('#readstage'),
    img: $('#readimg'),
    title: $('#readtitle'),
    where: $('#readwhere'),
    transcript: $('#readtranscript'),
    close: $('#readclose'),
    fit: $('#readfit'),
    text: $('#readtext'),
  };

  let open = false;
  let scale = 1, x = 0, y = 0;
  let clue = null;
  let dragging = false;
  let lastX = 0, lastY = 0;

  function apply() {
    el.img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  /** Scale at which the whole page sits inside the stage with a margin. */
  function fitScale() {
    const r = el.stage.getBoundingClientRect();
    const pad = 48;
    if (!r.width || !r.height) return 1;
    return Math.min((r.width - pad) / el.img.naturalWidth, (r.height - pad) / el.img.naturalHeight, 1.6);
  }

  function fit() {
    scale = fitScale();
    x = 0; y = 0;
    apply();
  }

  /**
   * Start at the scale where the writing is comfortably readable rather than
   * merely visible, and centre on the top-left of the text block — a page
   * fitted to the screen has its smallest type at about four pixels.
   */
  function openReadable(id) {
    const c = CLUES[id];
    if (!c) return;
    clue = c;
    open = true;

    el.title.textContent = c.title;
    el.where.textContent = c.where || '';
    el.img.src = clueCanvas(c.scan).toDataURL('image/png');
    el.img.alt = c.title;

    const parts = [];
    if (c.text) parts.push(`<pre>${escapeHtml(c.text)}</pre>`);
    if (c.derived) parts.push(`<div class="derived">${c.derived}</div>`);
    if (!parts.length) parts.push('<p class="empty">There is no writing on this, only wear.</p>');
    el.transcript.innerHTML = parts.join('');
    setTranscript(false);

    el.root.classList.add('is-open');
    // the image must be decoded before it can be fitted to its own size
    const go = () => {
      fit();
      const readable = Math.max(scale, 1.0);
      scale = Math.min(readable, MAX_SCALE);
      x = 0;
      y = el.img.naturalHeight * scale * 0.18;
      apply();
    };
    if (el.img.complete && el.img.naturalWidth) go();
    else el.img.onload = go;
    audio?.paper();
  }

  function close() {
    if (!open) return;
    open = false;
    el.root.classList.remove('is-open');
    el.img.removeAttribute('src');
    audio?.paper();
  }

  function setTranscript(on) {
    const show = on === undefined ? el.transcript.classList.contains('hidden') : on;
    el.transcript.classList.toggle('hidden', !show);
    el.text.textContent = show ? 'Hide Transcript' : 'Transcript';
  }

  /* ------------------------------ input ------------------------------ */

  el.stage.addEventListener('wheel', (e) => {
    if (!open) return;
    e.preventDefault();
    const r = el.stage.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width / 2 - x;
    const my = e.clientY - r.top - r.height / 2 - y;
    const k = Math.exp(-e.deltaY * 0.0016);
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * k));
    // zoom about the pointer, so the texel you are pointing at stays put
    const f = next / scale;
    x = mx - mx * f;
    y = my - my * f;
    scale = next;
    apply();
  }, { passive: false });

  el.stage.addEventListener('pointerdown', (e) => {
    if (!open) return;
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    el.stage.classList.add('dragging');
    el.stage.setPointerCapture(e.pointerId);
  });
  el.stage.addEventListener('pointermove', (e) => {
    const r = el.stage.getBoundingClientRect();
    el.stage.style.setProperty('--lx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.stage.style.setProperty('--ly', `${((e.clientY - r.top) / r.height) * 100}%`);
    if (!dragging) return;
    x += e.clientX - lastX;
    y += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    apply();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    el.stage.classList.remove('dragging');
    try { el.stage.releasePointerCapture(e.pointerId); } catch {}
  };
  el.stage.addEventListener('pointerup', endDrag);
  el.stage.addEventListener('pointercancel', endDrag);

  el.close.onclick = close;
  el.fit.onclick = () => { fit(); audio?.paper(); };
  el.text.onclick = () => { setTranscript(); audio?.paper(); };

  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (!open) return;
    const k = e.code;
    if (k === 'Escape' || k === 'KeyE' || k === 'KeyJ') { e.preventDefault(); close(); return; }
    if (k === 'KeyT') { e.preventDefault(); setTranscript(); audio?.paper(); return; }
    if (k === 'Digit0') { e.preventDefault(); fit(); audio?.paper(); return; }
    if (k === 'Equal' || k === 'NumpadAdd') { e.preventDefault(); scale = Math.min(MAX_SCALE, scale * 1.25); apply(); return; }
    if (k === 'Minus' || k === 'NumpadSubtract') { e.preventDefault(); scale = Math.max(MIN_SCALE, scale / 1.25); apply(); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) { e.preventDefault(); keys.add(k); return; }
    // don't let the rest of the game react to keys typed at a page
    if (/^(Key|Arrow|Digit|Space|Tab)/.test(k)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));

  (function tick() {
    requestAnimationFrame(tick);
    if (!open || !keys.size) return;
    const step = 90;
    if (keys.has('ArrowLeft')) x += step;
    if (keys.has('ArrowRight')) x -= step;
    if (keys.has('ArrowUp')) y += step;
    if (keys.has('ArrowDown')) y -= step;
    apply();
  })();

  addEventListener('resize', () => { if (open) fit(); });

  const R = {
    get isOpen() { return open; },
    openReadable,
    close,
    has: (id) => !!CLUES[id],
    onOpen: null,
    onClose: null,
  };

  // notify outside the call so a caller can release the pointer lock without
  // the click that opened the reader immediately re-acquiring it
  function _open(id) { openReadable(id); R.onOpen?.(); }
  function _close() { if (open) { close(); R.onClose?.(); } }
  R.openReadable = (id) => _open(id);
  R.close = () => _close();
  return R;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}