/**
 * diag.mjs — render one vantage point with an arbitrary tweak applied first.
 *
 * When something looks wrong in the level and you do not know what it is, the
 * fastest way to find out is to shoot the same frame twice, once with the
 * suspect switched off. This does that without editing the game.
 *
 *   node tools/diag.mjs                                        # the default view
 *   node tools/diag.mjs k-gallery                               # a named vantage
 *   node tools/diag.mjs k-gallery "g.scene.traverse(o=>{if(o.isPoints)o.visible=false})"
 *   node tools/diag.mjs --fx=0 r-dome                           # without post-processing
 *
 * The expression is evaluated in the page with `g` bound to the game, after the
 * player has been moved to the vantage point.
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4329;
const OUT = 'shots/diag';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

/* name, x, z, floorY, yaw, pitch — same convention as tour.mjs */
const VIEWS = {
  'a-spawn': [0.6, 6.4, 0, 0.34, 0.0],
  'c-tide-table': [-6.3, 0, 0, Math.PI / 2, 0.14],
  'e-stone-dark': [-5.0, -4.0, 0, 1.42, -0.30],
  'k-gallery': [0.0, -34.0, 6, 0.0, 0.06],
  'k-gallery-wide': [0.0, -34.0, 6, 0.0, 0.06],
  'n-chart': [7.3, -42.5, 6, -Math.PI / 2, 0.52],
  'q-passage': [0.0, -53.4, 6, 0.0, 0.03],
  'r-dome': [0.0, -58.5, 6, 0.0, 0.16],
  't-vault': [0.0, -61.4, 6, 0.0, 0.1],
};

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fx = flags.find((f) => f.startsWith('--fx='))?.slice(5) ?? '1';
const view = positional[0] || 'k-gallery';
const tweak = positional[1] || '';
const v = VIEWS[view];
if (!v) {
  console.error('unknown view. try one of:\n  ' + Object.keys(VIEWS).join('\n  '));
  process.exit(1);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'ignore', 'ignore'] });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/?fx=${fx}`)).ok) break; } catch {}
  await sleep(250);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new', protocolTimeout: 60000,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio',
    '--enable-features=Vulkan', '--use-angle=vulkan', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 660 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${PORT}/?fx=${fx}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#title.is-open', { timeout: 60000 });
await page.click('#begin');
await sleep(2200);

await page.evaluate(([x, z, y, yaw, pitch]) => {
  const g = window.__meridian;
  g.world.level.drain();
  g.parts.sluice.leaf.position.y = 2.4;
  g.parts.orrery.gate.leaf.position.y = 3.3;
  g.player.teleport(x, z, y, yaw);
  g.player.pitch = pitch;
  g.player.syncCamera();
}, v);

if (tweak) {
  const r = await page.evaluate((code) => {
    const g = window.__meridian;
    try { return String(eval(code)); } catch (e) { return 'ERROR: ' + e.message; }
  }, tweak);
  console.log('tweak:', r);
  await sleep(600);
}
await sleep(700);

const name = `${view}${tweak ? '-tweaked' : ''}-fx${fx}`;
await page.screenshot({ path: `${OUT}/${name}.png` });
console.log('wrote', `${OUT}/${name}.png`);

await browser.close();
server.kill('SIGTERM');
process.exit(0);