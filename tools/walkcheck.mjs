/**
 * tools/walkcheck.mjs — can the level actually be crossed on foot?
 *
 * Every junction between two walk regions has to overlap by more than the
 * player's 0.64 m diameter, or `circleInPoly` leaves a seam the player is
 * physically stuck in: still standing in the room they came from, with the
 * next room open in front of them. level.js already says as much about the
 * meridian passage, and the gate and the landing both still had seams.
 *
 * For each leg this teleports just inside the near side, holds W, and reports
 * how far north the player actually got.
 *
 *   node tools/walkcheck.mjs
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4341;
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
await page.setViewport({ width: 900, height: 560 });
page.setDefaultNavigationTimeout(120000);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#title.is-open', { timeout: 60000 });
await page.click('#begin');
await sleep(2500);

/* drain the sump and open every gate, so nothing here is a puzzle test */
await page.evaluate(() => {
  const g = window.__meridian;
  g.world.level.drain();
  g.parts.sluice.leaf.position.y = 2.4;
  g.parts.sluice.gateBlock && g.world.walk.removeBlocker(g.parts.sluice.gateBlock);
  g.parts.orrery.gate.leaf.position.y = 3.3;
});
await sleep(1500);

/* name, startX, startZ, startFloorY, mustReachZ, heading 'north'|'south' */
const LEGS = [
  ['antechamber -> trench',   0, -7.6, 0,    -11.0, 'north'],
  ['trench -> foot of stair', 0, -12.0, -0.95, -17.0, 'north'],
  ['stair -> landing',        0, -29.0, 5.0,   -31.5, 'north'],
  ['landing -> gallery',      0, -30.5, 6,     -36.0, 'north'],
  ['gallery -> meridian passage', 0, -49.0, 6, -54.0, 'north'],
  ['meridian passage -> dome',   0, -55.0, 6, -59.0, 'north'],
];

const pad = (s, n) => String(s).padEnd(n);
let failures = 0;

for (const [name, sx, sz, sy, target, dir] of LEGS) {
  await page.evaluate(([x, z, y]) => {
    window.__meridian.player.teleport(x, z, y, 0);   // yaw 0 faces -Z
  }, [sx, sz, sy]);
  await sleep(300);
  await page.keyboard.down('w');
  // poll rather than guess at a duration: the walk is slow in the trench
  const t0 = Date.now();
  let reached = false;
  let last = 1e9;
  while (Date.now() - t0 < 45000) {
    const z = await page.evaluate(() => window.__meridian.player.pos.z);
    if (target < 0 ? z < target : z > target) { reached = true; last = z; break; }
    if (Math.abs(z - last) < 0.004) { /* stalled; keep waiting out the budget */ }
    last = z;
    await sleep(300);
  }
  await page.keyboard.up('w');
  await sleep(250);

  const st = await page.evaluate(() => {
    const g = window.__meridian;
    return {
      z: +g.player.pos.z.toFixed(2),
      y: +g.player.floorY.toFixed(2),
      region: (() => { const r = g.world.walk.regionAt(g.player.pos.x, g.player.pos.z); return r ? r.baseY : null; })(),
    };
  });
  if (!reached) failures++;
  console.log(`${reached ? '  ok ' : ' !! '} ${pad(name, 30)} ${reached ? `reached z=${st.z.toFixed(1)}` : `STUCK at z=${st.z} (needed ${target})`}`);
}

console.log(`\n${LEGS.length - failures}/${LEGS.length} junctions passable on foot`);
await browser.close();
server.kill('SIGTERM');
process.exit(failures ? 1 : 0);