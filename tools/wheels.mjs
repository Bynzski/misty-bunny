/**
 * tools/wheels.mjs — photograph the digit wheels at reading distance.
 *
 * The odometer drums are the one prop the player is asked to read at a glance
 * rather than examine, so they get their own shot list. `mechanisms.mjs`
 * frames each lock from whatever distance the crosshair first resolves at, and
 * that distance is chosen for the *prop*, not for the *figure* — a brass plate
 * three metres wide photographs fine while its digits are five pixels tall.
 *
 * Two things are deliberately controlled here:
 *
 *   - the figures are set to distinct values (1 2 3 / 4 5 6 7), because ten
 *     zeroes in a row cannot show whether the drum turned at all, and a legibility
 *     bug that only shows on 4, 7 and 9 is invisible in a screenshot of 000;
 *   - the lantern is photographed both lit and shuttered, because the digits are
 *     meant to be readable in the room's own light and the one number a player is
 *     left squinting at in a dark antechamber is the one they cannot report.
 *
 *   node tools/wheels.mjs               # every wheel, every distance
 *   node tools/wheels.mjs sluice        # one lock
 *   node tools/wheels.mjs --dists=0.7,1.2
 *   node tools/wheels.mjs --fx=0        # no post chain, to see the raw shading
 *   node tools/wheels.mjs --nolight     # lantern shuttered
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4346;
const OUT = 'shots/wheels';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const fx = flags.find((f) => f.startsWith('--fx='))?.slice(5) ?? '1';
const lanternOff = flags.includes('--nolight');
const dists = (flags.find((f) => f.startsWith('--dists='))?.slice(8) ?? '0.7,1.1,1.8')
  .split(',').map(Number).filter((n) => n > 0);

/* id, default distances, figures to set. Reading order left to right. */
const LOCKS = {
  sluice: { dists: [0.7, 1.1, 1.8], values: [1, 2, 3] },
  vault: { dists: [0.6, 0.9, 1.5], values: [4, 5, 6, 7] },
};

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'ignore', 'ignore'] });
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
  await sleep(250);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio',
    '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization'],
});
const page = await browser.newPage();
// --zoom renders big and photographs a crop of the middle, which is the only
// way to tell "the figure is blurred" from "the figure is four pixels tall".
const ZOOM = Number(flags.find((f) => f.startsWith('--zoom='))?.slice(7) || 0);
const VW = Math.round(1100 * (ZOOM || 1)), VH = Math.round(660 * (ZOOM || 1));
await page.setViewport({ width: VW, height: VH });
page.setDefaultNavigationTimeout(120000);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${PORT}/?fx=${fx}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#title.is-open', { timeout: 60000 });
await page.click('#begin');
await sleep(2500);

const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const list = want.length ? want.filter((w) => LOCKS[w]) : Object.keys(LOCKS);
if (!list.length) {
  console.error(`unknown lock. try one of:\n  ${Object.keys(LOCKS).join('\n  ')}`);
  await browser.close(); server.kill('SIGTERM'); process.exit(1);
}

/* The sluice plate rides on the gate leaf, so the level must be left shut. */
await page.evaluate(() => window.__meridian.world.level.drain());
await sleep(800);

await page.evaluate(() => {
  const g = window.__meridian;
  const THREE = g.world.THREE;

  /** The digit wheels in the world, in reading order. */
  window.__wheels = (which) => {
    const root = which === 'sluice' ? g.parts.sluice.plate : g.parts.vault.group;
    const found = [];
    root.traverse((o) => { if (o.userData && o.userData.setIndex) found.push(o); });
    return found;
  };

  /**
   * Stand `dist` in front of the wheel band, square on, eye at the middle
   * wheel. Not the crosshair search `mechanisms.mjs` does: here the framing is
   * the thing being measured, so it has to be exact and repeatable.
   */
  window.__standAt = (which, dist) => {
    const ws = window.__wheels(which);
    if (!ws.length) return { ok: false, why: 'no wheels found' };
    const box = new THREE.Box3();
    for (const w of ws) box.expandByObject(w);
    const c = box.getCenter(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ws[0].getWorldQuaternion(new THREE.Quaternion()));
    fwd.y = 0; fwd.normalize();
    // stand off along +z of the drum, which is the direction the bezel faces
    const x = c.x + fwd.x * dist, z = c.z + fwd.z * dist;
    const y = g.world.walk.heightAt(x, z);
    if (y === null) return { ok: false, why: `no floor at ${x.toFixed(2)},${z.toFixed(2)}` };
    const dx = c.x - x, dz = c.z - z;
    g.player.teleport(x, z, y, Math.atan2(-dx, -dz));
    g.player.pitch = Math.atan2(c.y - (y + 1.62), Math.hypot(dx, dz));
    g.player.syncCamera();
    g.player.lanternOn = true;
    return { ok: true, at: [+x.toFixed(2), +z.toFixed(2)], eyeOn: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)] };
  };

  window.__setFigures = (which, values) => {
    const ws = window.__wheels(which);
    ws.forEach((w, i) => w.userData.setIndex(values[i % values.length], false));
    return ws.length;
  };
});

for (const id of list) {
  const n = await page.evaluate(([id, vals]) => window.__setFigures(id, vals), [id, LOCKS[id].values]);
  if (!n) { console.log(`!! ${id}: no wheels`); continue; }
  for (const dist of dists) {
    const r = await page.evaluate(([id, dist, off]) => {
      if (off) window.__meridian.player.lanternOn = false;
      return window.__standAt(id, dist);
    }, [id, dist, lanternOff]);
    if (!r.ok) { console.log(`!! ${id} @${dist}: ${r.why}`); continue; }
    // let the camera settle and the shuttered/unshuttered lantern re-take effect
    await sleep(900);
    const tag = `${id}-${String(dist).replace('.', 'p')}m${lanternOff ? '-nolight' : ''}-fx${fx}${ZOOM ? `-z${ZOOM}` : ''}`;
    const shot = ZOOM
      ? { path: `${OUT}/${tag}.png`, clip: { x: VW / 2 - VW * 0.3, y: VH / 2 - VH * 0.19, width: VW * 0.6, height: VH * 0.38 } }
      : { path: `${OUT}/${tag}.png` };
    await page.screenshot(shot);
    console.log(`   ${tag}   wheels=${n}  stood at ${r.at.join(', ')}`);
  }
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);