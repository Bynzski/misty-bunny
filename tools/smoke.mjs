/**
 * tools/smoke.mjs — drives the game in headless Chrome and asserts that it works.
 *   node tools/smoke.mjs [--shots]
 *
 * Everything that depends on the animation loop polls a condition rather than
 * waiting a fixed time, because frame rate varies by an order of magnitude
 * between the GPU used here and a software rasteriser.
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4319;
const SHOTS = process.argv.includes('--shots');
const OUT = 'shots';
if (SHOTS && !existsSync(OUT)) mkdirSync(OUT, { recursive: true });

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) failures++;
};

/** Re-take pointer lock if the page does not currently hold it. */
async function ensureLock(page) {
  // Movement is gated on both pointer lock and having no overlay open, so a
  // page left up by an earlier step silently turns every walk into a no-op.
  await page.evaluate(() => {
    const g = window.__meridian;
    if (g.reader.isOpen) g.reader.close();
    if (g.ui.uiOpen === 'journal') g.ui.closeJournal();
  });
  if (await page.evaluate(() => window.__meridian.input.state.locked)) return true;
  await page.click('#scene');
  return !!(await until(page, () => window.__meridian.input.state.locked, null, { timeout: 8000 }));
}

/**
 * Yaw that faces a compass direction. The camera looks along
 * (-sin yaw, 0, -cos yaw), so north (-Z) is yaw 0 and east (+X) is -PI/2.
 * Writing these as names is the point: the walk tests used to pass a bare
 * Math.PI that was compensating for an inverted forward vector, so "the
 * player reached the top of the stair" passed while W actually walked away
 * from it.
 */
const NORTH = 0, SOUTH = Math.PI, EAST = -Math.PI / 2, WEST = Math.PI / 2;

/** Poll `fn` in the page until it is truthy, or give up. */
async function until(page, fn, arg, { timeout = 60000, every = 200 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, arg);
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await sleep(every);
  }
}

/**
 * Hold W until `probe` says we're done.
 *
 * Walking is gated on pointer lock, and Chrome refuses a lock for a short
 * while after one is released — which every overlay in the game does. Real
 * players clear that by pressing E or clicking, so the harness does too
 * rather than reporting a level that cannot be walked.
 */
async function walkUntil(page, probe, { timeout = 90000 } = {}) {
  await ensureLock(page);
  await page.evaluate(() => window.__meridian.input.keys.add('KeyW'));
  try {
    return await until(page, probe, null, { timeout });
  } finally {
    await page.evaluate(() => window.__meridian.input.keys.clear());
  }
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => {
  const s = String(d);
  if (!/npm notice/.test(s)) process.stderr.write('[vite] ' + s);
});

for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* not up */ }
  await sleep(250);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  protocolTimeout: 60000,
  dumpio: !!process.env.CHROME_LOG,
  // Prefer a real GPU. On a box without one Chrome silently falls back to
  // SwiftShader, which runs the level at under 2 fps and makes every timed
  // wait below look like a hang.
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio',
    '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 600, deviceScaleFactor: 1 });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('HB ') || t.startsWith('HT ')) { if (process.env.HB) console.log('   ' + t); return; }
    if (m.type() === 'error') errors.push('console: ' + t);
    if (m.type() === 'warning' && /THREE\./.test(m.text())) errors.push('three: ' + t);
  });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('error', (e) => { console.log('!! PAGE CRASHED: ' + e.message); process.exit(3); });

  const T0 = Date.now();
  const step = (msg) => console.log(`    [${((Date.now() - T0) / 1000).toFixed(1)}s] ${msg}`);
  let shotFails = 0;
  const shot = async (name) => {
    if (!SHOTS) return;
    try {
      await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 15000 });
      step('shot ' + name);
    } catch (e) {
      shotFails++;
      step(`shot ${name} FAILED: ${String(e).slice(0, 90)}`);
    }
  };

  console.log('\n▸ loading');
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#title.is-open', { timeout: 90000 });
  ok('title screen appears', true);
  await shot('01-title');

  console.log('▸ beginning');
  await page.click('#begin');
  await sleep(2000);
  await shot('02-antechamber');

  const gl = await page.evaluate(() => {
    const g = window.__meridian;
    return {
      // Walk the graph rather than reading renderer.info: with the post chain
      // on, the last thing three.js submitted was a fullscreen quad, so
      // info.render reports that and not the level.
      tris: g.countTriangles(),
      calls: g.renderer.info.render.calls,
      pos: [+g.player.pos.x.toFixed(2), +g.player.pos.z.toFixed(2)],
      interactables: g.I.all.size,
    };
  });
  ok('game object exposed', gl.interactables > 20, `${gl.interactables} interactables`);
  ok('renders geometry', gl.tris > 1000, `${gl.tris} triangles · ${gl.calls} draw calls · ${gl.interactables} interactables`);
  ok('player starts in the antechamber', gl.pos[1] > 4 && gl.pos[1] < 8, `at x=${gl.pos[0]} z=${gl.pos[1]}`);

  // a heartbeat straight off the render loop, so we can see it die
  await page.evaluate(() => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      n++;
      if (n % 60 === 0) console.log(`HB rAF=${n} t=${Math.round(performance.now() - t0)}ms`);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setInterval(() => {
      console.log(`HT timer t=${Math.round(performance.now() - t0)}ms raf=${n} vis=${document.visibilityState}`);
    }, 1000);
  });

  /* ------------------------------------------------------------------ *
   *  helpers installed in the page
   * ------------------------------------------------------------------ */
  await page.evaluate(() => {
    const g = window.__meridian;
    const THREE = g.world.THREE;
    /** Walk the player to a sensible spot and look at an interactable. */
    window.__aimAt = (wanted, useIt = false) => {
      g.scene.updateMatrixWorld(true);
      const item = [...g.I.all].find((i) => i.id === wanted);
      if (!item) return { ok: false, why: 'not registered' };
      const wp = new THREE.Vector3();
      item.root.getWorldPosition(wp);
      for (const dist of [1.3, 1.8, 2.4, 3.0, 3.4]) {
        for (let s = 0; s < 24; s++) {
          const a = (s / 24) * Math.PI * 2 + 0.13;
          const x = wp.x + Math.sin(a) * dist;
          const z = wp.z + Math.cos(a) * dist;
          const y = g.walk.heightAt(x, z);
          if (y === null || g.walk.inBlocker(x, z, 0.32)) continue;
          const dx = wp.x - x, dz = wp.z - z;
          g.player.teleport(x, z, y, Math.atan2(-dx, -dz));
          g.player.pitch = Math.max(-1.25, Math.min(1.25, Math.atan2(wp.y - (y + 1.66), Math.hypot(dx, dz))));
          g.player.syncCamera();
          const it = g.I.update();
          if (it && it.id === wanted) {
            if (useIt) it.use();
            return { ok: true, at: [+x.toFixed(1), +z.toFixed(1)] };
          }
        }
      }
      return { ok: false, why: 'no line of sight' };
    };
    window.__focus = () => { const it = g.I.update(); return it ? it.id : null; };
    window.__use = () => { const it = g.I.update(); if (!it) return null; it.use?.(); return it.id; };
    window.__walk = (on) => (on ? g.input.keys.add('KeyW') : g.input.keys.clear());
  });

  /* ------------------------------------------------------------------ *
   *  clue reachability
   * ------------------------------------------------------------------ */
  console.log('\n▸ clues');
  const reach = async (id) => page.evaluate((w) => window.__aimAt(w, true), id);

  const clueIds = ['tideTable', 'slate', 'gauge', 'logbook', 'stone', 'orreryPlate', 'starChart', 'fragment', 'lensPlate'];
  for (const id of clueIds) {
    const r = await reach(id);
    ok(`clue reachable: ${id}`, r.ok, r.ok ? '' : `${r.why}${r.near?.length ? ' (saw ' + r.near.join(', ') + ')' : ''}`);
  }
  const found = await page.evaluate(() => [...window.__meridian.ui.found]);
  ok('all nine clues land in the journal', found.length === 9, `${found.length}/9: ${found.join(', ')}`);

  /* ------------------------------------------------------------------ *
   *  the reading view — the fix for pages you cannot read off a wall
   * ------------------------------------------------------------------ */
  console.log('\n\u25b8 the reading view');
  const readerOk = await page.evaluate(async () => {
    const g = window.__meridian;
    const bad = [];
    for (const id of ['tideTable', 'starChart', 'stone', 'slate']) {
      g.reader.close();
      g.reader.openReadable(id);
      await new Promise((r) => setTimeout(r, 120));
      const root = document.querySelector('#reader');
      const img = document.querySelector('#readimg');
      if (!root.classList.contains('is-open')) { bad.push(id + ': did not open'); continue; }
      if (!img || !img.src.startsWith('data:image/png')) { bad.push(id + ': no image'); continue; }
      if (!img.naturalWidth) { bad.push(id + ': image never decoded'); continue; }
      if (document.querySelector('#readtitle').textContent.trim() === '') bad.push(id + ': no title');
      // the whole point: it can be magnified well past what the wall shows
      const fit = img.style.transform;
      g.reader.close();
    }
    g.reader.close();
    return bad;
  });
  ok('every page opens and decodes', readerOk.length === 0, readerOk.join('; '));

  // The point of the reading view is that print which is illegible on a wall
  // becomes resolvable. Measure that the player can actually zoom in, rather
  // than asserting a number: drive the real wheel handler and check the page
  // ends up far larger on screen than the stage it sits in.
  const zoomOk = await page.evaluate(async () => {
    const g = window.__meridian;
    g.reader.openReadable('tideTable');
    const img = document.querySelector('#readimg');
    if (!img.decode) { g.reader.close(); return { w: 0 }; }
    // the handler swaps the src; decode the element currently in the document
    await img.decode();
    if (!img.naturalWidth) {
      await new Promise((r) => { img.onload = r; setTimeout(r, 3000); });
      await img.decode();
    }
    const stage = document.querySelector('#readstage');
    const rect = stage.getBoundingClientRect();
    const at = () => +(img.style.transform.match(/scale\(([\d.]+)\)/)?.[1] || 1);
    const opened = img.naturalWidth * at();
    // twenty notches of scroll wheel in
    for (let i = 0; i < 20; i++) {
      stage.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -120, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        bubbles: true, cancelable: true,
      }));
    }
    const zoomed = img.naturalWidth * at();
    const r = { w: img.naturalWidth, h: img.naturalHeight, opened: Math.round(opened), zoomed: Math.round(zoomed), stage: Math.round(rect.width) };
    g.reader.close();          // strips the src, which zeroes naturalWidth
    return r;
  });
  ok('a page can be magnified far past the wall view',
    zoomOk.w >= 700 && zoomOk.zoomed > zoomOk.stage * 2,
    `${zoomOk.w}\u00d7${zoomOk.h} source \u00b7 ${zoomOk.opened}px on open \u2192 ${zoomOk.zoomed}px zoomed (stage ${zoomOk.stage}px)`);

  // A page up must stop the player walking. Measure it by pressing W and
  // confirming the position does not change, then put the page back.
  const blockedWalk = await page.evaluate(async () => {
    const g = window.__meridian;
    g.reader.close();
    await new Promise((r) => setTimeout(r, 500));      // let the pointer lock return
    g.player.teleport(0, 6.4, 0, Math.PI);
    g.input.keys.add('KeyW');
    await new Promise((r) => setTimeout(r, 900));    // get up to walking speed
    const walking = g.player.pos.z;
    g.reader.openReadable('logbook');
    // The controller keeps its velocity for a moment after input stops, so
    // measure between two samples taken well after the page went up. Comparing
    // against the pre-open position would report the coast as movement.
    await new Promise((r) => setTimeout(r, 900));
    const a = g.player.pos.z;
    await new Promise((r) => setTimeout(r, 700));
    const b = g.player.pos.z;
    const open = g.reader.isOpen;
    g.reader.close();
    g.input.keys.delete('KeyW');
    return {
      open, walking: +walking.toFixed(2),
      a: +a.toFixed(3), b: +b.toFixed(3), drift: +(b - a).toFixed(3),
    };
  });
  ok('a page up stops you walking',
    blockedWalk.open && Math.abs(blockedWalk.drift) < 0.01,
    `z ${blockedWalk.walking} while walking, then held (drift ${blockedWalk.drift} m over 0.7 s)`);
  await page.evaluate(() => window.__meridian.reader.close());
  await sleep(900);


  const journalOk = await page.evaluate(() => {
    const ui = window.__meridian.ui;
    ui.openJournal();
    const bad = [];
    for (const tab of document.querySelectorAll('#journaltabs .tab')) {
      tab.click();
      const img = document.querySelector('#journalbody .scan');
      if (!img) { bad.push('no scan'); continue; }
      if (!img.src.startsWith('data:image/png')) bad.push('bad image');
      if (!document.querySelector('#journalbody h3')) bad.push('no title');
    }
    if (bad.length) bad.push('body=' + document.querySelector('#journalbody').innerHTML.slice(0, 100));
    ui.closeJournal();
    return bad;
  });
  ok('journal renders every clue', journalOk.length === 0, journalOk.join('; '));
  await page.evaluate(() => { window.__meridian.ui.openJournal(); });
  await sleep(600);
  await shot('03-journal');
  await page.evaluate(() => window.__meridian.ui.closeJournal());
  const st2 = await page.evaluate(() => ({ rd: window.__meridian.reader.isOpen, ui: window.__meridian.ui.uiOpen }));


  // software rasterising at full quality is brutally slow; drop the cost for
  // the functional half of the run and turn it back on for screenshots
  const cheap = () => page.evaluate(() => {
    const g = window.__meridian;
    g.renderer.setPixelRatio(0.3);
    g.renderer.shadowMap.autoUpdate = false;
  });
  const full = async () => {
    await page.evaluate(() => {
      const g = window.__meridian;
      g.renderer.setPixelRatio(1);
      g.renderer.shadowMap.autoUpdate = true;
    });
  };
  const shotFast = async (n) => {
    try { await full(); } catch (e) { step('full() failed: ' + String(e).slice(0, 80)); }
    await shot(n);
    try { await cheap(); } catch (e) { step('cheap() failed: ' + String(e).slice(0, 80)); }
  };
  await cheap();
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(n); };
    requestAnimationFrame(tick);
  }));
  console.log(`  (software renderer: ~${fps} fps at reduced quality)`);

  /* ------------------------------------------------------------------ *
   *  the foundation stone needs the lantern
   * ------------------------------------------------------------------ */
  console.log('\n▸ the dark corner');
  const stoneTest = await page.evaluate(() => {
    const g = window.__meridian;
    g.ui.found.delete('stone');            // the sweep above already read it
    const a = window.__aimAt('stone');
    g.player.lanternOn = false;
    g.player.syncCamera();
    const dark = g.I.update();
    const darkId = dark ? dark.id : null;
    dark?.use();
    const afterDark = g.ui.has('stone');
    g.player.lanternOn = true;
    g.player.syncCamera();
    const lit = g.I.update();
    lit?.use();
    const opened = g.reader.isOpen;
    g.reader.close();          // examining lifts the page; put it back
    return { aimed: a.ok, id: darkId, afterDark, afterLit: g.ui.has('stone'), opened };
  });
  ok('the stone is there in the dark', stoneTest.id === 'stone');
  ok('…but unreadable without the lantern', stoneTest.afterDark === false);
  ok('…and readable with it', stoneTest.afterLit === true);
  ok('…and it comes up as a page you can study', stoneTest.opened === true);

  /* ------------------------------------------------------------------ *
   *  movement and collision
   * ------------------------------------------------------------------ */
  console.log('\n▸ movement');

  // W must go where the camera is pointing. This is the check that would have
  // caught the inverted forward vector in the first place.
  await ensureLock(page);
  const facing = await page.evaluate(async () => {
    const g = window.__meridian;
    const out = {};
    for (const [yaw, key] of [[0, 'north'], [-Math.PI / 2, 'east']]) {
      g.player.teleport(0, 0, 0, yaw);
      g.input.keys.add('KeyW');
      await new Promise((r) => setTimeout(r, 800));
      out[key] = { x: +g.player.pos.x.toFixed(2), z: +g.player.pos.z.toFixed(2),
                   locked: g.input.state.locked, ui: g.ui.uiOpen, rd: g.reader.isOpen,
                   frozen: g.player.frozen, wading: +g.player.wading.toFixed(2), keys: [...g.input.keys] };
      g.input.keys.clear();
      await new Promise((r) => setTimeout(r, 200));
    }
    return out;
  });
  ok('W walks the way the camera faces',
    facing.north.z < -0.8 && facing.north.x === 0 && facing.east.x > 0.8,
    `north ${JSON.stringify(facing.north)} \u00b7 east ${JSON.stringify(facing.east)}`);

  const flooded = await page.evaluate(() => {
    const g = window.__meridian;
    g.player.teleport(0, -6.0, 0, Math.PI);
    return g.world.level.waterState.level;
  });
  ok('the sump starts flooded', flooded > 0.2, `water at ${flooded.toFixed(2)}`);

  // Movement is gated on pointer lock, and every overlay hands the cursor back
  // through a release/re-acquire pair. If that has not settled, walking tests
  // silently measure nothing.
  // Reading releases the cursor; putting the page back must give it back.
  // exitPointerLock is async — state.locked only flips on the event, so this
  // has to wait for the change rather than read it on the next line.
  await page.evaluate(() => window.__meridian.reader.openReadable('tideTable'));
  const released = await until(page, () => !window.__meridian.input.state.locked, null, { timeout: 4000 });
  await page.evaluate(() => window.__meridian.reader.close());
  ok('reading a page hands the cursor over', !!released);
  await page.evaluate((yaw) => window.__meridian.player.teleport(0, -7.6, 0, yaw), NORTH);
  await walkUntil(page, () => window.__meridian.player.pos.z < -10.6, { timeout: 20000 })
    .catch(() => {});
  const blockedAt = await page.evaluate(() => window.__meridian.player.pos.z);
  ok('deep water stops you reaching the trench', blockedAt > -9.6, `stopped at z=${blockedAt.toFixed(2)}`);

  await page.evaluate((yaw) => { const g = window.__meridian; g.player.teleport(0, 0, 0, yaw); }, EAST);
  await walkUntil(page, () => window.__meridian.player.pos.x > 8.4, { timeout: 20000 });
  const wallX = await page.evaluate(() => window.__meridian.player.pos.x);
  ok('the octagon walls hold', wallX < 9.2, `x=${wallX.toFixed(2)}`);

  /* ------------------------------------------------------------------ *
   *  puzzle 1 — the sluice gate
   * ------------------------------------------------------------------ */
  console.log('\n▸ sluice gate');
  const aimedSluice = await page.evaluate(() => window.__aimAt('sluice', true));
  ok('the sluice lock can be aimed at and used', aimedSluice.ok, JSON.stringify(aimedSluice));
  await sleep(500);
  ok('the wheel panel opens', await page.evaluate(() => document.querySelector('#lock').classList.contains('is-open')));
  await page.evaluate(() => document.querySelector('#locktry').click());
  await sleep(800);
  ok('wrong figures are rejected', await page.evaluate(() => !window.__meridian.parts.sluice.isOpen()));

  await page.evaluate(() => {
    [3, 7, 2].forEach((n, i) => {
      const col = document.querySelectorAll('.wheel')[i];
      for (let k = 0; k < n; k++) col.querySelectorAll('.wheel__step button')[1].click();
    });
  });
  await sleep(400);
  const shown = await page.evaluate(() => window.__meridian.ui.lockValues());
  ok('the panel holds 3-7-2', shown.join(',') === '3,7,2', shown.join(','));
  await shotFast('04-sluice-panel');
  step('clicking the try button');
  await page.evaluate(() => document.querySelector('#locktry').click());
  step('clicked');
  await until(page, () => window.__meridian.parts.sluice.isOpen(), null, { timeout: 15000 });
  step('sluice poll done');
  ok('the correct figures open the sluice', await page.evaluate(() => window.__meridian.parts.sluice.isOpen()));
  await shotFast('05-sluice-open');

  await until(page, () => window.__meridian.world.level.waterState.level < -0.5, null, { timeout: 60000 });
  const drained = await page.evaluate(() => window.__meridian.world.level.waterState.level);
  ok('the sump drains away', drained < -0.5, `water now ${drained.toFixed(2)}`);
  const gone = await until(page, () => !window.__meridian.world.level.water.visible, null, { timeout: 30000 });
  ok('the water mesh is retired', !!gone);

  await page.evaluate((yaw) => window.__meridian.player.teleport(0, -11, -0.9, yaw), NORTH);
  const reachedGallery = await walkUntil(page, () => window.__meridian.player.floorY > 5.5, { timeout: 90000 });
  const upstairs = await page.evaluate(() => ({ y: window.__meridian.player.floorY, z: +window.__meridian.player.pos.z.toFixed(1) }));
  ok('the stair carries you up to the gallery', !!reachedGallery, `y=${upstairs.y.toFixed(2)} at z=${upstairs.z}`);
  await shotFast('06-gallery');

  /* ------------------------------------------------------------------ *
   *  puzzle 2 — the meridian instrument
   * ------------------------------------------------------------------ */
  console.log('\n▸ meridian instrument');
  const aimedOrrery = await page.evaluate(() => window.__aimAt('orrery', true));
  ok('the instrument can be aimed at and used', aimedOrrery.ok, JSON.stringify(aimedOrrery));
  await sleep(400);
  ok('the ring panel opens', await page.evaluate(() => !document.querySelector('#lockrings').classList.contains('hidden')));

  await page.evaluate(() => {
    // GLASS (87°), PENDULUM (90°), COMPASS (94°) — the three inside 090°±5
    [2, 3, 4].forEach((want, r) => {
      const rows = document.querySelectorAll('.ringrow');
      const btns = rows[r].querySelectorAll('.glyphbtn');
      if (!btns[want]) throw new Error('glyph button missing');
      btns[want].click();
    });
  });
  const ringsSettled = await until(page, () => {
    const rings = window.__meridian.parts.orrery.rings;
    const step = (Math.PI * 2) / 10;
    return rings.every((r, i) => {
      const want = -[2, 3, 4][i] * step;
      let d = r.spin.rotation.y - want;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d) < 0.03;
    });
  }, null, { timeout: 20000 });
  ok('the 3D rings follow the panel', !!ringsSettled);
  await shotFast('07-orrery-panel');
  await page.evaluate(() => document.querySelector('#locktry').click());
  await sleep(600);
  await until(page, () => window.__meridian.parts.orrery.isSolved(), null, { timeout: 15000 });
  ok('the three stars solve the instrument', await page.evaluate(() => window.__meridian.parts.orrery.isSolved()));
  await shotFast('08-orrery-solved');

  const gateUp = await until(page, () => window.__meridian.parts.orrery.gate.leaf.position.y > 3.0, null, { timeout: 40000 });
  ok('the meridian gate rises', !!gateUp);
  await shotFast('09-gate-open');

  // Every previous step reached the vault by teleporting next to it, which
  // means nothing in the suite had ever checked that the meridian passage is
  // actually a passage. Walk it.
  await ensureLock(page);
  await page.evaluate(() => {
    const g = window.__meridian;
    g.player.teleport(0, -51.5, 6, 0);        // just inside the gallery's north edge
  });
  const reachedDome = await walkUntil(page, () => window.__meridian.player.pos.z < -60, { timeout: 60000 });
  const passage = await page.evaluate(() => {
    const p = window.__meridian.player;
    return { z: +p.pos.z.toFixed(1), x: +p.pos.x.toFixed(2), y: +p.floorY.toFixed(2) };
  });
  ok('the meridian passage can be walked to the dome',
    !!reachedDome, passage.x === 0 ? `walked to z=${passage.z}` : `stopped at ${JSON.stringify(passage)}`);

  /* ------------------------------------------------------------------ *
   *  puzzle 3 — the vault
   * ------------------------------------------------------------------ */
  console.log('\n▸ the vault');
  const aimedVault = await page.evaluate(() => window.__aimAt('vault', true));
  ok('the vault wheels can be aimed at and used', aimedVault.ok, JSON.stringify(aimedVault));
  await sleep(400);
  await page.evaluate(() => {
    [1, 8, 8, 9].forEach((n, i) => {
      const col = document.querySelectorAll('.wheel')[i];
      for (let k = 0; k < n; k++) col.querySelectorAll('.wheel__step button')[1].click();
    });
  });
  await sleep(400);
  await shotFast('10-vault-panel');
  await page.evaluate(() => document.querySelector('#locktry').click());
  await until(page, () => window.__meridian.parts.vault.isOpen(), null, { timeout: 15000 });
  ok('the vault opens on 1889', await page.evaluate(() => window.__meridian.parts.vault.isOpen()));
  await until(page, () => document.querySelector('#ending').classList.contains('is-open'), null, { timeout: 40000 });
  ok('the ending arrives', await page.evaluate(() => document.querySelector('#ending').classList.contains('is-open')));
  await shotFast('11-ending');

  /* ------------------------------------------------------------------ */
  console.log('\n▸ console');
  const real = errors.filter((e) => !/favicon|Autoplay|AudioContext|SwiftShader|GroupMarkerNotSet|GL_DISPLAY_ERROR|Failed to load resource/i.test(e));
  ok('no runtime errors', real.length === 0, real.slice(0, 6).join(' | '));

  const perf = await page.evaluate(() => {
    const g = window.__meridian;
    return {
      tris: g.countTriangles(),
      geo: g.renderer.info.memory.geometries,
      tex: g.renderer.info.memory.textures,
      prog: g.renderer.info.programs?.length,
    };
  });
  console.log(`\n  scene: ${perf.tris} triangles · ${perf.geo} geometries · ${perf.tex} textures · ${perf.prog} programs`);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nall good\n');
process.exit(failures ? 1 : 0);