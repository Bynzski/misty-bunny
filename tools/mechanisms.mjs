/**
 * tools/mechanisms.mjs — photograph every lock at reading distance, twice:
 * once as the player meets the machine in the world, and once with the panel
 * open. The numbers on a spinning wheel are the game's whole input, and a
 * panel that is legible on screen can still be a blur on a brass wheel two
 * metres away under a lantern.
 *
 * The vantage is found the same way the game finds one: step back around the
 * prop until the crosshair actually resolves to it. Hand-placed coordinates
 * were wrong often enough to be worthless, and a wrong vantage photographs
 * whatever happened to be behind it.
 *
 *   node tools/mechanisms.mjs [id ...]
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4345;
const OUT = 'shots/mechanisms';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

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
await page.setViewport({ width: 1100, height: 660 });
page.setDefaultNavigationTimeout(120000);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#title.is-open', { timeout: 60000 });
await page.click('#begin');
await sleep(2500);

/* The prop, and how close we would like to stand to it. */
const TARGETS = [
  ['sluice', 1.6], ['orrery', 2.6], ['vault', 1.8],
  ['orreryPlate', 1.1], ['lensPlate', 1.0], ['meridian-gate', 1.8],
];
const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const list = want.length ? TARGETS.filter(([id]) => want.includes(id)) : TARGETS;

/* Deliberately NOT opening the sluice first: its lock plate rides on the gate
 * leaf, so raising the gate lifts the wheels 3.35 m out of the frame. Each
 * machine is photographed in the state the player meets it. */
await page.evaluate(() => window.__meridian.world.level.drain());
await sleep(800);

await page.evaluate(() => {
  const g = window.__meridian;
  const THREE = g.world.THREE;
  /** Find a standing spot at about `dist` where the crosshair hits `wanted`. */
  window.__frame = (wanted, dist) => {
    g.world.scene.updateMatrixWorld(true);
    const items = [];
    g.world.scene.traverse((o) => {
      const it = o.userData && o.userData.inter;
      if (it && !items.includes(it)) items.push(it);
    });
    const item = items.find((i) => i.id === wanted);
    if (!item) return { ok: false, why: 'not registered' };
    const wp = new THREE.Vector3();
    item.root.getWorldPosition(wp);
    for (const d of [dist, dist * 1.25, dist * 0.8, dist * 1.6]) {
      for (let s = 0; s < 32; s++) {
        const a = (s / 32) * Math.PI * 2 + 0.11;
        const x = wp.x + Math.sin(a) * d, z = wp.z + Math.cos(a) * d;
        const y = g.world.walk.heightAt(x, z);
        if (y === null || g.world.walk.inBlocker(x, z, 0.32)) continue;
        const dx = wp.x - x, dz = wp.z - z;
        g.player.teleport(x, z, y, Math.atan2(-dx, -dz));
        g.player.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(wp.y - (y + 1.62), Math.hypot(dx, dz))));
        g.player.syncCamera();
        const it = g.I.update();
        if (it && it.id === wanted) return { ok: true, at: [+x.toFixed(2), +z.toFixed(2)], aim: wp.toArray().map((n) => +n.toFixed(2)) };
      }
    }
    return { ok: false, why: 'no spot resolved the crosshair to it' };
  };
});

for (const [id, dist] of list) {
  const r = await page.evaluate(([id, dist]) => window.__frame(id, dist), [id, dist]);
  if (!r.ok) { console.log(`!! ${id}: ${r.why}`); continue; }
  await sleep(800);
  await page.screenshot({ path: `${OUT}/${id}-world.png` });
  console.log(`   ${id}  framed from ${r.at.join(', ')}`);
}

/* and each panel, opened through its real control path */
for (const [id] of list.filter(([id]) => ['sluice', 'orrery', 'vault'].includes(id))) {
  const r = await page.evaluate((id) => {
    const g = window.__meridian;
    document.querySelector('#lock').classList.remove('is-open');
    let f = null;
    g.world.scene.traverse((o) => { const it = o.userData && o.userData.inter; if (it && it.id === id && !f) f = it; });
    if (!f) return { ok: false };
    if (f.enabled && !f.enabled()) return { ok: false, why: 'disabled' };
    f.use();
    return { ok: document.querySelector('#lock').classList.contains('is-open') };
  }, id);
  if (!r.ok) { console.log(`!! ${id} panel: ${r.why || 'did not open'}`); continue; }
  await sleep(700);
  await page.screenshot({ path: `${OUT}/${id}-panel.png` });
  console.log(`   ${id} panel`);
  await page.evaluate(() => document.querySelector('#lock').classList.remove('is-open'));
  await sleep(200);
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);