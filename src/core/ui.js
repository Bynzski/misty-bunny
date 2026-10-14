/**
 * ui.js — prompts, toasts, the journal, and the combination panels.
 */
import { CLUES, STARS } from '../clues.js';
import { clueCanvasUrl } from '../art/textures.js';

const $ = (s) => document.querySelector(s);

export function createUI({ audio } = {}) {
  const el = {
    hud: $('#hud'),
    prompt: $('#prompt'),
    toasts: $('#toasts'),
    water: $('#waterwarn'),
    badge: $('#journalbadge'),
    badgeNum: $('#badgenum'),
    journal: $('#journal'),
    journalTabs: $('#journaltabs'),
    journalBody: $('#journalbody'),
    journalCount: $('#journalcount'),
    lock: $('#lock'),
    lockTitle: $('#locktitle'),
    lockSub: $('#locksub'),
    lockWheels: $('#lockwheels'),
    lockRings: $('#lockrings'),
    lockHint: $('#lockhint'),
  };

  const found = new Set();
  const order = ['tideTable', 'logbook', 'slate', 'gauge', 'stone', 'orreryPlate', 'starChart', 'fragment', 'lensPlate'];

  let uiOpen = null; // 'journal' | 'lock' | 'ending'
  let journalSel = null;
  let onJournalClose = null;
  let onJournalOpen = null;

  /* ------------------------------ toasts ------------------------------ */
  function toast(text, sub = '', kind = '') {
    const d = document.createElement('div');
    d.className = 'toast' + (kind ? ` toast--${kind}` : '');
    d.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    el.toasts.appendChild(d);
    while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
    setTimeout(() => {
      d.classList.add('out');
      setTimeout(() => d.remove(), 520);
    }, kind === 'bad' ? 4200 : 3400);
  }

  /* ------------------------------ prompt ------------------------------ */
  function setPrompt(html) {
    if (!html) { el.prompt.classList.remove('on'); el.hud.classList.remove('active'); return; }
    el.prompt.innerHTML = html;
    el.prompt.classList.add('on');
    el.hud.classList.add('active');
  }

  /* ------------------------------ journal ------------------------------ */
  function journalTabList() {
    el.journalTabs.innerHTML = '';
    for (const id of order) {
      if (!found.has(id)) continue;
      const c = CLUES[id];
      const b = document.createElement('button');
      b.className = 'tab' + (journalSel === id ? ' sel' : '');
      b.textContent = c.title.replace(/^Keeper's /, '');
      b.onclick = () => { journalSel = id; audio?.paper(); renderJournal(); };
      el.journalTabs.appendChild(b);
    }
  }

  function renderJournal() {
    journalTabList();
    if (!journalSel || !found.has(journalSel)) journalSel = order.find((i) => found.has(i)) || null;
    journalTabList();
    el.journalBody.innerHTML = '';
    if (!journalSel) {
      el.journalBody.innerHTML = `<p class="clue empty">Nothing copied down yet. Press <kbd>E</kbd> when you want to read something properly — it comes with you.</p>`;
      el.journalCount.textContent = '0 of 9';
      return;
    }
    const c = CLUES[journalSel];
    const wrap = document.createElement('div');
    wrap.className = 'clue';
    wrap.innerHTML = `
      <h3>${c.title}</h3>
      <p class="where">${c.where}</p>
      <img class="scan" alt="${c.title}" src="${clueCanvasUrl(c.scan)}" />
      ${c.text ? `<pre class="transcript">${escapeHtml(c.text)}</pre>` : ''}
      ${c.derived ? `<div class="derived">${c.derived}</div>` : ''}
    `;
    el.journalBody.appendChild(wrap);
    el.journalCount.textContent = `${found.size} of ${order.length}`;
    el.journalBody.scrollTop = 0;
  }

  function openJournal() {
    uiOpen = 'journal';
    el.journal.classList.add('is-open');
    el.hud.classList.remove('on');
    onJournalOpen?.();
    renderJournal();
    audio?.paper();
  }
  function closeJournal() {
    uiOpen = null;
    el.journal.classList.remove('is-open');
    el.hud.classList.add('on');
    onJournalClose?.();
  }

  /* --------------------------- combination --------------------------- */
  let lockState = null;

  function openWheels(cfg) {
    uiOpen = 'lock';
    lockState = { kind: 'wheels', cfg, values: cfg.values.slice() };
    el.lock.classList.add('is-open');
    el.lock.classList.remove('overlay--sheet');
    el.lockTitle.textContent = cfg.title;
    el.lockSub.textContent = cfg.sub || '';
    el.lockRings.classList.add('hidden');
    el.lockWheels.classList.remove('hidden');
    el.lockHint.textContent = cfg.hint || '';
    renderWheels();
    audio?.clank(0.8, 0.06);
  }

  function renderWheels() {
    const { cfg, values } = lockState;
    el.lockWheels.innerHTML = '';
    cfg.count.forEach((c, i) => {
      const col = document.createElement('div');
      col.className = 'wheel' + (cfg.solved && cfg.solved[i] ? ' solved' : '');
      col.innerHTML = `
        <div class="wheel__label">${cfg.labels ? cfg.labels[i] : 'Fig. ' + (i + 1)}</div>
        <div class="wheel__body"><div class="wheel__val">${values[i]}</div></div>
        <div class="wheel__step">
          <button data-d="-1">◀</button>
          <button data-d="1">▶</button>
        </div>`;
      col.querySelectorAll('button').forEach((b) => {
        b.onclick = () => step(i, +b.dataset.d);
      });
      el.lockWheels.appendChild(col);
    });
  }

  function step(i, d) {
    const max = lockState.cfg.max ?? 9;
    lockState.values[i] = (lockState.values[i] + d + max + 1) % (max + 1);
    audio?.clank(0.9 + i * 0.14, 0.05);
    cfg().onChange?.(lockState.values.slice());
    renderWheels();
  }

  let ringsState = null;
  function openRings(cfg) {
    uiOpen = 'lock';
    lockState = { kind: 'rings', cfg };
    ringsState = { values: cfg.values.slice() };
    el.lock.classList.add('is-open');
    el.lockTitle.textContent = cfg.title;
    el.lockSub.textContent = cfg.sub || '';
    el.lockWheels.classList.add('hidden');
    el.lockRings.classList.remove('hidden');
    el.lockHint.textContent = cfg.hint || '';
    renderRings();
    audio?.clank(0.7, 0.06);
  }

  function renderRings() {
    const { cfg } = lockState;
    el.lockRings.innerHTML = '';
    cfg.rings.forEach((ring, ri) => {
      const row = document.createElement('div');
      row.className = 'ringrow';
      const name = document.createElement('div');
      name.className = 'ringrow__name';
      name.textContent = ring.name;
      row.appendChild(name);
      const gs = document.createElement('div');
      gs.className = 'ringrow__glyphs';
      ring.items.forEach((it, ii) => {
        const b = document.createElement('button');
        const selected = ringsState.values[ri] === ii;
        b.className = 'glyphbtn' + (selected ? ' sel' : '') + (cfg.solved?.[ri] === ii ? ' locked' : '');
        b.innerHTML = `<svg viewBox="-2 -2 30 30"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="${it.glyph}"/></g></svg><span>${it.short}</span>`;
        b.title = it.name;
        b.onclick = () => {
          ringsState.values[ri] = ii;
          audio?.clank(1 + ii * 0.06, 0.05);
          cfg.onChange?.(ringsState.values.slice());
          renderRings();
        };
        gs.appendChild(b);
      });
      row.appendChild(gs);
      el.lockRings.appendChild(row);
    });
  }

  function ringStep(ri, d) {
    const n = lockState.cfg.rings[ri].items.length;
    ringsState.values[ri] = (ringsState.values[ri] + d + n) % n;
    audio?.clank(0.9, 0.05);
    lockState.cfg.onChange?.(ringsState.values.slice());
    renderRings();
  }

  function closeLock() {
    if (lockState?.cfg.onClose) lockState.cfg.onClose();
    uiOpen = null;
    el.lock.classList.remove('is-open');
    el.hud.classList.add('on');
  }

  const cfg = () => (lockState.kind === 'rings' ? { onChange: lockState.cfg.onChange } : lockState.cfg);

  /* ------------------------------ wiring ------------------------------ */
  $('#journalclose').onclick = closeJournal;
  $('#lockclose').onclick = closeLock;
  $('#locktry').onclick = () => {
    const values = lockState.kind === 'rings' ? ringsState.values.slice() : lockState.values.slice();
    lockState.cfg.onSubmit?.(values);
  };

  addEventListener('keydown', (e) => {
    if (uiOpen === 'lock') {
      const k = e.code;
      if (k === 'Escape') { e.preventDefault(); closeLock(); return; }
      const wheelCfg = lockState.kind === 'wheels' ? lockState.cfg : null;
      if (wheelCfg) {
        if (k === 'ArrowUp' || k === 'ArrowDown') {
          e.preventDefault();
          const idx = lockState.hoverWheel ?? 0;
          step(idx, k === 'ArrowUp' ? 1 : -1);
          return;
        }
        if (/^Digit[1-9]$/.test(k)) { lockState.hoverWheel = +k.slice(5) - 1; renderWheels(); return; }
      } else {
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          e.preventDefault();
          const ri = ringsState.focus ?? 0;
          ringStep(ri, k === 'ArrowRight' ? 1 : -1);
          return;
        }
        if (/^Digit[1-9]$/.test(k)) { ringsState.focus = +k.slice(5) - 1; renderRings(); return; }
      }
      if (k === 'Enter') { lockState.cfg.onSubmit?.(lockState.kind === 'rings' ? ringsState.values.slice() : lockState.values.slice()); return; }
    }
    if (uiOpen === 'journal' && (e.code === 'KeyJ' || e.code === 'Escape')) { e.preventDefault(); closeJournal(); return; }
  });

  /* --------------------------- public bits --------------------------- */
  const U = {
    get uiOpen() { return uiOpen; },
    get found() { return found; },
    toast,
    setPrompt,
    openJournal,
    closeJournal,
    openWheels,
    openRings,
    closeLock,
    setWaterWarn(text) {
      if (text) { el.water.textContent = text; el.water.classList.add('on'); }
      else el.water.classList.remove('on');
    },
    has(id) { return found.has(id); },
    discover(id) {
      if (found.has(id)) return false;
      found.add(id);
      el.badgeNum.textContent = found.size;
      el.badge.classList.add('on', 'pulse');
      setTimeout(() => el.badge.classList.remove('pulse'), 950);
      if (!journalSel) journalSel = id;
      return true;
    },
    onJournalClose(fn) { onJournalClose = fn; },
    onJournalOpen(fn) { onJournalOpen = fn; },
    setHud(on) { el.hud.classList.toggle('on', on); },
    lockValues() { return lockState ? (lockState.kind === 'rings' ? ringsState.values.slice() : lockState.values.slice()) : null; },
  };

  $('#journalbadge').style.pointerEvents = 'auto';
  $('#journalbadge').style.cursor = 'pointer';
  $('#journalbadge').onclick = () => { uiOpen === 'journal' ? closeJournal() : openJournal(); };

  return U;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** ring item descriptors for the orrery panel */
export function ringItems() {
  return STARS.map((s) => ({ key: s.key, name: s.name.toUpperCase(), short: s.name.split(' ')[1].slice(0, 3), glyph: s.glyph }));
}