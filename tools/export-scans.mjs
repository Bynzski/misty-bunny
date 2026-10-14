/**
 * tools/export-scans.mjs — render every clue scan to shots/scans/ so the
 * written world can be proof-read without launching the game.
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4325;
const OUT = 'shots/scans';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'ignore', 'ignore'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(250); }

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new', protocolTimeout: 60000,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio',
      '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization'],
});
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 400 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0' });
await page.waitForSelector('#title.is-open', { timeout: 60000 });

const ids = ['tideTable', 'slate', 'logbook', 'stone', 'gauge', 'starChart', 'fragment', 'orreryPlate', 'lensPlate'];
for (const id of ids) {
  const url = await page.evaluate((i) => window.__meridian.clueCanvasUrl(i), id);
  writeFileSync(`${OUT}/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', id);
}

// report where the ink actually lands on each page
for (const id of ids) {
  const bands = await page.evaluate((i) => {
    const c = document.createElement('canvas');
    const m = window.__meridian;
    void c;
    const src = m.__canvasOf ? m.__canvasOf(i) : null;
    if (!src) return null;
    const x = src.getContext('2d');
    const d = x.getImageData(0, 0, src.width, src.height).data;
    const rows = [];
    let run = null;
    for (let y = 0; y < src.height; y++) {
      let dark = 0;
      for (let xx = 0; xx < src.width; xx += 2) {
        const k = (y * src.width + xx) * 4;
        const lum = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
        if (lum < 110) dark++;
      }
      const on = dark > 3;
      if (on && !run) run = { a: y, b: y };
      else if (on) run.b = y;
      else if (run) { rows.push(run); run = null; }
    }
    if (run) rows.push(run);
    return { size: [src.width, src.height], rows: rows.map((r) => `${r.a}-${r.b}`) };
  }, id);
  if (bands) console.log(`${id} (${bands.size.join('x')}) ink bands: ${bands.rows.join(' ')}`);
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);