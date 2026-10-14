/**
 * tools/tour.mjs — fly the camera to a set of vantage points and photograph
 * the level. Used to review the art without playing through it.
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4328;
const OUT = 'shots/tour';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

/* [name, x, z, floorY, yaw, pitch] — floorY is the walking surface, not eye. */
const SHOTS = [
  ['a-spawn',        0.6, 6.4, 0, 0.34, 0.0],
  ['b-sluice',       0.0, -7.4, 0, 0.0, -0.02],
  ['c-tide-table',   -6.3, 0, 0, Math.PI / 2, 0.14],
  ['d-logbook',      5.9, 2.6, 0, 1.9, -0.28],
  ['e-stone-dark',   -5.0, -4.0, 0, 1.42, -0.30],
  ['f-stone-lit',    -5.0, -4.0, 0, 1.42, -0.30],
  ['g-gauge',        2.4, -7.4, 0, 0.0, 0.10],
  ['h-window',       0.0, 4.6, 0, 3.05, 0.28],
  ['i-trench',       0.0, -10.6, 0, 0.0, 0.12],
  ['j-stair',        0.0, -17.0, 6, 0.0, 0.1],
  ['k-gallery-wide', 0.0, -34.0, 6, 0.0, 0.06],
  ['l-orrery',       0.0, -38.6, 6, 0.0, 0.1],
  ['m-orrery-side',  3.2, -38.0, 6, 0.55, 0.08],
  ['n-chart',        7.3, -42.5, 6, -Math.PI / 2, 0.52],
  ['o-bench',        -5.0, -41.0, 6, 0.9, -0.2],
  ['p-gate',         0.0, -49.0, 6, 0.0, 0.02],
  ['q-passage',      0.0, -53.4, 6, 0.0, 0.03],
  ['r-dome',         0.0, -58.5, 6, 0.0, 0.16],
  ['s-dome-wide',    5.4, -61.0, 6, 0.9, 0.12],
  ['t-vault',        0.0, -61.4, 6, 0.0, 0.1],
  ['u-vault-close',  0.0, -63.4, 6, 0.0, 0.0],
  ['v-oculus',       0.0, -63.0, 6, 0.0, 0.75],
  ['w-telescope',    -3.0, -67.0, 6, 0.7, 0.16],
  ['x-look-back',    0.0, -44.0, 6, 3.14159, 0.02],
];

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'ignore', 'ignore'] });
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(250); }

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new', protocolTimeout: 60000,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio',
      '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 660 });
page.setDefaultNavigationTimeout(90000);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', async (m) => {
  if (m.type() !== 'error') return;
  const parts = await Promise.all(m.args().map((a) => a.evaluate((v) => (v && v.stack) || String(v)).catch(() => '?')));
  console.log('[err]', parts.join(' | ').slice(0, 600));
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#title.is-open', { timeout: 60000 });
await page.click('#begin');
await sleep(2500);

// open the sluice and the meridian gate so the level is seen in its final state
await page.evaluate(() => {
  const g = window.__meridian;
  g.world.level.drain();
  g.parts.sluice.leaf.position.y = 2.4;
  g.parts.orrery.gate.leaf.position.y = 3.3;

});

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const [name, x, z, y, yaw, pitch] of SHOTS) {
  if (ONLY && !ONLY.some((o) => name.includes(o))) continue;
  await page.evaluate(([x, z, y, yaw, pitch]) => {
    const g = window.__meridian;
    g.player.teleport(x, z, y, yaw);
    g.player.pitch = pitch;
    g.player.syncCamera();
  }, [x, z, y, yaw, pitch]);
  await sleep(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 25000 });
  console.log('shot', name);
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);