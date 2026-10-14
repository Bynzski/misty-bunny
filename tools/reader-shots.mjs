/**
 * tools/reader-shots.mjs — screenshot the reading view at several
 * magnifications for each clue.
 *
 * Reading is the game's core verb and it happens entirely in the DOM rather
 * than in the scene, so the tour — which flies a camera around the level —
 * cannot see it. This drives the reader directly instead.
 *
 *   node tools/reader-shots.mjs
 *   node tools/reader-shots.mjs tideTable slate
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4327;
const OUT = 'shots/reader';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const IDS = ['tideTable', 'slate', 'logbook', 'stone', 'gauge',
  'starChart', 'fragment', 'orreryPlate', 'lensPlate'];
const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const want = ids.length ? ids : IDS;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'ignore', 'ignore'] });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/?fx=0`)).ok) break; } catch {}
  await sleep(250);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new', protocolTimeout: 60000,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio',
      '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1180, height: 820 });
page.setDefaultNavigationTimeout(90000);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${PORT}/?fx=0`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#title.is-open', { timeout: 60000 });
await page.click('#begin');
await sleep(1500);

for (const id of want) {
  const ok = await page.evaluate((i) => {
    const g = window.__meridian;
    if (!g || !g.reader) return false;
    g.reader.openReadable(i);
    return !!document.querySelector('#reader.is-open');
  }, id);
  if (!ok) { console.log('FAIL', id); continue; }
  await sleep(600);

  // as it opens: zoomed to comfortable reading size
  await page.screenshot({ path: `${OUT}/${id}-1-open.png` });
  // and as far as it goes, to prove the print is genuinely resolvable
  await page.evaluate(() => {
    const img = document.querySelector('#readimg');
    img.style.transform = 'translate(0px,0px) scale(4.2)';
  });
  await sleep(250);
  await page.screenshot({ path: `${OUT}/${id}-2-zoom.png` });
  console.log('shot', id);
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);