/**
 * tools/gaps.mjs — find the holes in the level.
 *
 * The portal and the walk-region seams were both found by looking, and both
 * had been there a while. This automates the looking: it walks the set of
 * points the player can actually stand on and asks two questions about each.
 *
 *   HOLE   is there a floor under their feet? If the first solid thing below is
 *          more than a step down, they are walking on nothing.
 *   SKY   is there a roof over their head? If a ray up escapes the level, the
 *          room is open to the void and will read as a black gap or a seam of
 *          daylight between two zones.
 *
 * It runs in both gate states, because a closed gate legitimately blocks a
 * doorway and an open one may expose a seam that was hidden behind it.
 *
 *   node tools/gaps.mjs [--shots]
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4342;
const SHOTS = process.argv.includes('--shots');
const OUT = 'shots/gaps';
if (SHOTS && !existsSync(OUT)) mkdirSync(OUT, { recursive: true });

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
await page.setViewport({ width: 1000, height: 600 });
page.setDefaultNavigationTimeout(120000);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 240)); });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#title.is-open', { timeout: 60000 });
await page.click('#begin');
await sleep(2500);

const scan = () => page.evaluate(() => {
  const g = window.__meridian;
  const T = g.world.THREE;
  const { scene, walk, player } = g.world;
  scene.updateMatrixWorld(true);

  const isSeeThrough = (o) => {
    const m = o.material;
    return !o.visible || (m && (m.visible === false || m.transparent));
  };

  const rc = new T.Raycaster();
  const from = new T.Vector3();
  const dir = new T.Vector3();

  /* Openings that are meant to be there. The two oculi are real holes in the
   * roof and the whole shaft of light down them is the point, so the detector
   * has to know about them or it reports the best-lit part of the level. */
  const OCULI = [
    { x: 0, z: 0, r: 1.65 },        // antechamber, ANT_CEIL
    { x: 0, z: -65.5, r: 1.7 },     // the vault dome
  ];
  const underOculus = (x, z) => OCULI.some((o) => Math.hypot(x - o.x, z - o.z) < o.r);

  const holes = [];
  const skies = [];

  // sample the whole walkable set at 0.7 m
  const STEP = 0.7;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of walk.polys) {
    for (const q of p.pts) {
      minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
      minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z);
    }
  }
  for (let x = minX; x <= maxX; x += STEP) {
    for (let z = minZ; z <= maxZ; z += STEP) {
      if (!walk.walkableAt(x, z, 0.32)) continue;
      const y = walk.heightAt(x, z);
      if (y === null || !Number.isFinite(y)) continue;

      // ---- floor underfoot ----
      from.set(x, y + 0.35, z);
      dir.set(0, -1, 0);
      rc.set(from, dir); rc.far = 6;
      let floor = null;
      for (const h of rc.intersectObjects(scene.children, true)) {
        if (isSeeThrough(h.object)) continue;
        // ignore the piece the player is notionally standing on
        if (h.object.name === 'water') continue;
        floor = h; break;
      }
      const drop = floor ? (from.y - floor.point.y) : 99;
      if (drop > 1.1) {
        holes.push({ x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2), drop: +drop.toFixed(2), hit: floor ? floor.object.geometry.type : null });
      }

      // ---- roof overhead ----
      from.set(x, y + 1.7, z);
      dir.set(0, 1, 0);
      rc.set(from, dir); rc.far = 40;
      let roof = null;
      for (const h of rc.intersectObjects(scene.children, true)) {
        if (isSeeThrough(h.object)) continue;
        if (h.object.name === 'water') continue;
        roof = h; break;
      }
      if (!roof && !underOculus(x, z)) skies.push({ x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2) });
    }
  }

  return { holes, skies };
});

function summarise(list, key) {
  // cluster nearby hits so one hole in a wall does not print forty lines
  const out = [];
  const sorted = [...list].sort((a, b) => (a.z - b.z) || (a.x - b.x));
  let cur = null;
  for (const p of sorted) {
    if (cur && Math.hypot(p.x - cur.x0, p.z - cur.z0) < 1.6) {
      cur.n++;
      cur.x1 = p.x; cur.z1 = p.z;
      cur.worst = key === 'drop' ? Math.max(cur.worst, p[key]) : cur.worst;
    } else {
      if (cur) out.push(cur);
      cur = { x0: p.x, z0: p.z, x1: p.x, z1: p.z, n: 1, worst: key === 'drop' ? p[key] : 0, y: p.y };
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function report(label) {
  const { holes, skies } = await scan();
  console.log(`\n=== ${label} ===`);
  console.log(`holes underfoot: ${holes.length} samples, ${summarise(holes, 'drop').length} clusters`);
  for (const c of summarise(holes, 'drop')) {
    console.log(`  !! HOLE  x ${c.x0}..${c.x1}  z ${c.z0}..${c.z1}  y=${c.y}  drop ${c.worst.toFixed(2)}m  (${c.n} samples)`);
  }
  console.log(`open to the void overhead: ${skies.length} samples, ${summarise(skies, 'drop').length} clusters`);
  for (const c of summarise(skies, 'drop')) {
    console.log(`  !! SKY   x ${c.x0}..${c.x1}  z ${c.z0}..${c.z1}  y=${c.y}  (${c.n} samples)`);
  }
  if (SHOTS && (holes.length || skies.length)) {
    const seen = new Set();
    for (const c of [...summarise(holes, 'drop'), ...summarise(skies, 'drop')]) {
      const key = `${c.x0.toFixed(0)},${c.z0.toFixed(0)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await page.evaluate(([x, z, y]) => {
        const g = window.__meridian, T = g.world.THREE;
        g.player.teleport(x, z, y, 0);
        g.world.camera.position.set(x, y + 1.7, z);
        g.world.camera.lookAt(new T.Vector3(x, y + 0.2, z - 6));
        g.world.camera.updateMatrixWorld(true);
      }, [c.x0, c.z0, c.y]);
      await sleep(500);
      const name = `gap-${key.replace(/[.,]/g, '_')}.png`;
      await page.screenshot({ path: `${OUT}/${name}` });
    }
  }
  return { holes, skies };
}

const closed = await report('gates closed');
writeFileSync('shots/gaps-closed.json', JSON.stringify(closed, null, 2));

// open everything
await page.evaluate(() => {
  const g = window.__meridian;
  g.world.level.drain();
  g.parts.sluice.leaf.position.y = 2.4;
  if (g.parts.sluice.gateBlock) g.world.walk.removeBlocker(g.parts.sluice.gateBlock);
  g.parts.orrery.gate.leaf.position.y = 3.3;
});
await sleep(1500);

const open = await report('gates open');
writeFileSync('shots/gaps-open.json', JSON.stringify(open, null, 2));

await browser.close();
server.kill('SIGTERM');
const total = closed.holes.length + closed.skies.length + open.holes.length + open.skies.length;
process.exit(total ? 1 : 0);