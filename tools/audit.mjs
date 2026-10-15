/**
 * tools/audit.mjs — stand where the player stands and check that every
 * registered prop can be seen and used.
 *
 * The tide gauge shipped invisible: its plate sat inside the body of a
 * north-east pilaster, so the stone rendered straight through the graduations
 * while the interaction hitbox poked out in front and the crosshair still
 * offered "E - the tide gauge". Nothing errored, nothing crashed, and every
 * existing screenshot of the room looked plausible. The only way to catch that
 * class of bug is to put a camera where the player's is and look.
 *
 * For each registered interactable, this reports:
 *
 *   BURIED     no ray from anywhere reaches the prop, i.e. it is inside solid
 *              geometry (the gauge's failure)
 *   UNREACHED  no walkable spot exists anywhere near it (bad blockers)
 *   SILENT     the crosshair never resolves to it from any reachable spot, so
 *              the prompt never appears — usually an interaction `range` the
 *              prop's own height puts permanently out of reach
 *   PARTIAL    usable, but part of its face is buried in geometry. This is the
 *              one reachability alone cannot catch: a clue half-swallowed by a
 *              pilaster still shows its prompt, because the pick-box clears the
 *              stone while the paper does not.
 *   HARDSEE    usable, but never with a clear line of sight — something always
 *              in the way. A warning about the room, not a broken prop.
 *   CONDITIONAL deliberately disabled right now (enabled() === false); these
 *              are re-audited in the solved state by --solve
 *   ok
 *
 * Usage:
 *   node tools/audit.mjs              # audit both states + shoot shots/audit/*.png
 *   node tools/audit.mjs --no-shots   # audit only
 *
 * The run has two passes. The first is the game as it opens. Then all three
 * combination locks are driven through their real panels — clicking the actual
 * widgets and pressing Enter, exactly as a player would — so the second pass
 * audits the level in its solved state. Props that are deliberately disabled
 * until their puzzle is answered (the open sluice gate, the wound-down
 * orrery, the warm vault) cannot be checked any other way.
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4335;
const OUT = 'shots/audit';
const wantShots = !process.argv.includes('--no-shots');
if (wantShots && !existsSync(OUT)) mkdirSync(OUT, { recursive: true });

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
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#title.is-open', { timeout: 60000 });
await page.click('#begin');
await sleep(2500);

const audit = () => page.evaluate(() => {
  const g = window.__meridian;
  const T = g.world.THREE;
  const { scene, camera, walk, player } = g.world;
  scene.updateMatrixWorld(true);

  const isHidden = (o) => {
    const m = o.material;
    return !o.visible || (m && (m.visible === false || (m.transparent && m.opacity < 0.2)));
  };

  /* NB: Object3D.traverse() returns undefined, not a boolean — `!o.traverse(fn)`
   * is therefore always true and the walk below ran off the top of the scene
   * every time. This has to actually answer the question. */
  const hasVisibleMesh = (o) => {
    let yes = false;
    o.traverse((c) => { if (!yes && c.isMesh && !isHidden(c)) yes = true; });
    return yes;
  };

  /* the flood is see-through; it must never count as an occluder */
  const isWater = (o) => {
    let p = o;
    while (p) { if (p.name === 'water' || p.isWater) return true; p = p.parent; }
    return false;
  };

  /* ---- collect the registered interactables ---- */
  const items = new Map();
  scene.traverse((o) => {
    const it = o.userData && o.userData.inter;
    if (it && !items.has(it)) items.set(it, o);
  });

  const EYE = 1.62;
  const rc = new T.Raycaster();
  const results = [];

  for (const [it, node] of items) {
    const range = it.range ?? 3.6;
    const conditional = !!(it.enabled && !it.enabled());

    /* ---- the prop's VISIBLE surface ----
     * puzzle locks are registered on an invisible pick-box buried inside a
     * machine, so the thing to look at is the nearest ancestor that actually
     * has geometry. Judging the pick-box instead reports every lock as BURIED,
     * which is the opposite of the truth: they are bolted to the front of a
     * very visible machine. */
    const own = new Set();
    node.traverse((o) => own.add(o));
    let visualRoot = node;
    while (visualRoot && !hasVisibleMesh(visualRoot)) visualRoot = visualRoot.parent;

    /* Two different boxes, deliberately.
     *   selfSet - everything that must not count as an occluder of this prop.
     *             That is the whole visible assembly it is bolted to, or a
     *             machine would occlude itself and every lock would read BURIED.
     *   aimBox  - where the player's crosshair actually goes. The registered
     *             node's own bounds, which for a clue is the pick-box sitting
     *             proud of the paper. Aiming at the bounds of the *assembly*
     *             instead spreads the sample over a ten-metre orrery and
     *             reports perfectly good props as silent.
     */
    const selfSet = new Set(own);
    if (visualRoot) visualRoot.traverse((o) => selfSet.add(o));
    const visualBox = new T.Box3().setFromObject(node);
    const centre = visualBox.getCenter(new T.Vector3());
    const size = visualBox.getSize(new T.Vector3());

    /** first visible, non-self, non-water mesh between two points */
    const blocked = (from, to) => {
      const dir = to.clone().sub(from);
      const dist = dir.length();
      if (dist < 1e-4) return null;
      rc.set(from, dir.normalize());
      rc.far = dist - 0.03;
      for (const h of rc.intersectObjects(scene.children, true)) {
        const o = h.object;
        if (selfSet.has(o)) continue;
        if (isHidden(o) || isWater(o)) continue;
        // Anything translucent is see-through by definition: glass, the flood,
        // the dust motes, the volumetric shafts under the oculus. Counting those
        // as occluders reported the vault wheels as permanently hidden behind a
        // god-ray, which the player can plainly see past.
        if (o.material && o.material.transparent) continue;
        return o;
      }
      return null;
    };

    /* ---- 1. BURIED: reachable from nowhere at all ---- */
    let clearDirs = 0;
    const dirs = 30;
    const probeLen = Math.max(size.length() * 0.5, 1.4);
    for (let i = 0; i < dirs; i++) {
      const yy = 1 - (i / (dirs - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
      const th = i * 2.399963229728653;
      const d = new T.Vector3(Math.cos(th) * rad, yy, Math.sin(th) * rad);
      if (!blocked(centre.clone().addScaledVector(d, probeLen), centre)) clearDirs++;
    }

    /* ---- reachable standing spots ---- */
    const stands = [];
    const maxR = Math.max(0.7, range - 0.4);
    for (let ring = 0; ring < 5; ring++) {
      const r = maxR * (0.26 + ring * 0.185);
      for (let s = 0; s < 20; s++) {
        const a = (s / 20) * Math.PI * 2;
        const x = centre.x + Math.sin(a) * r;
        const z = centre.z + Math.cos(a) * r;
        const h = walk.heightAt(x, z);
        if (h === null || h === undefined || !Number.isFinite(h)) continue;
        if (!walk.walkableAt(x, z, 0.32)) continue;
        if (walk.inBlocker(x, z, 0.32)) continue;
        stands.push({ x, z, y: h + EYE, r });
      }
    }

    /* aim points spread over the visible surface, not just its centre — a clue
     * is read by pointing at part of it, not at the middle of its bounding box */
    const aims = [];
    {
      const n = 3;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          for (let k = 0; k < 2; k++) {
            aims.push(new T.Vector3(
              visualBox.min.x + (size.x * (i + 0.5)) / n,
              visualBox.min.y + (size.y * (j + 0.5)) / n,
              visualBox.min.z + (size.z * (k + 0.5)) / 2,
            ));
          }
        }
      }
      aims.push(centre.clone());
    }

    /* ---- how much of the FACE is actually visible? ----
     * Reachability is not enough. The gauge and the slate were both buried in a
     * pilaster, and both still passed: their pick-boxes poke clear of the stone
     * so the crosshair resolved and the prompt appeared. The clue was only
     * readable as fragments. So sample a grid across the visible sheet and
     * measure what fraction of it the player can actually see. */
    let faceTotal = 0, faceClear = 0;
    {
      /* The readable sheet is a SIBLING of the pick-box for every framed clue,
       * and a descendant for the machine-mounted plates, so both have to be
       * searched. The size guard matters: without it the largest textured plane
       * inside the sluice gate is a digit wheel, and grading the coverage of a
       * single numeral's face tells you nothing about whether the clue reads. */
      const nodeBox0 = new T.Box3().setFromObject(node);
      const ns = nodeBox0.getSize(new T.Vector3());
      const refArea = Math.max(ns.x * ns.y, ns.x * ns.z, ns.y * ns.z) || 1;

      let sheet = null, sheetSize = -1;
      const consider = (root) => root.traverse((o) => {
        if (!o.isMesh || o.geometry.type !== 'PlaneGeometry') return;
        if (!o.material || !o.material.map) return;
        const p = o.geometry.parameters;
        const a = p.width * p.height;
        if (a < refArea * 0.25 || a > refArea * 3) return;   // not a clue sheet
        if (a > sheetSize) { sheetSize = a; sheet = o; }
      });
      consider(node);
      if (node.parent) consider(node.parent);
      if (sheet) {
        const sb = new T.Box3().setFromObject(sheet);
        const N = 7;
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const pt = new T.Vector3(
              sb.min.x + (sb.max.x - sb.min.x) * (i + 0.5) / N,
              sb.max.y - (sb.max.y - sb.min.y) * (j + 0.5) / N,
              (sb.min.z + sb.max.z) / 2,
            );
            faceTotal++;
            // cast from several directions; visible if ANY has a clear line
            let seen = false;
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              const from = new T.Vector3(
                pt.x + Math.cos(a) * 2.2, pt.y + ((k % 2) ? 0.5 : -0.4), pt.z + Math.sin(a) * 2.2,
              );
              const h = walk.heightAt(from.x, from.z);
              if (h === null || !Number.isFinite(h)) continue;
              from.y = Math.max(from.y, h + 0.4);
              if (!blocked(from, pt)) { seen = true; break; }
            }
            if (seen) faceClear++;
          }
        }
      }
    }
    const facePct = faceTotal ? Math.round((faceClear / faceTotal) * 100) : null;

    let sightSpots = 0, promptSpots = 0, best = null;
    const saved = { p: player.pos.clone(), y: player.smoothY, yaw: player.yaw, pitch: player.pitch };

    for (const st of stands) {
      const from = new T.Vector3(st.x, st.y, st.z);
      let anyClear = false;
      for (const aim of aims) {
        if (blocked(from, aim)) continue;
        anyClear = true;
        break;
      }
      if (anyClear) sightSpots++;

      /* The prompt is tested from EVERY stand, occluded or not. interaction.js
       * walks the whole hit list and skips anything that is not an
       * interactable, so a railing between the eye and the prop does not stop
       * it being used — and refusing to test those stands would report props
       * that demonstrably work as broken. */
      player.teleport(st.x, st.z, st.y - EYE, 0);
      for (const aim of aims) {
        camera.position.set(st.x, st.y, st.z);
        camera.lookAt(aim);
        camera.updateMatrixWorld(true);
        const r2 = new T.Raycaster();
        r2.setFromCamera(new T.Vector2(0, 0), camera);
        r2.far = range + 0.3;
        let found = null;
        for (const h of r2.intersectObjects(scene.children, true)) {
          if (!Number.isFinite(h.distance) || h.distance > range) continue;
          let cur = h.object, guard = 0;
          while (cur && guard++ < 64) {
            const ii = cur.userData && cur.userData.inter;
            if (ii && (!ii.enabled || ii.enabled())) { found = ii; break; }
            cur = cur.parent;
          }
          if (found) break;
        }
        if (found === it) {
          promptSpots++;
          // keep the FURTHEST stand that works, not the nearest: standing at
          // arm's length puts the hand lantern a metre off the lens and blows
          // the whole prop out, which makes the photographs useless for review
          if (!best || st.r > best.r) best = { ...st, aim: aim.toArray().map((n) => +n.toFixed(2)) };
          break;
        }
      }
    }

    player.pos.copy(saved.p); player.smoothY = saved.y;
    player.yaw = saved.yaw; player.pitch = saved.pitch;
    player.syncCamera();

    results.push({
      id: it.id, label: it.label, range, conditional,
      centre: centre.toArray().map((n) => +n.toFixed(2)),
      size: size.toArray().map((n) => +n.toFixed(2)),
      clearDirs, dirs,
      stands: stands.length, sightSpots, promptSpots, best, facePct,
      status: conditional ? 'CONDITIONAL'
        : clearDirs === 0 ? 'BURIED'
        : stands.length === 0 ? 'UNREACHED'
        : promptSpots === 0 ? 'SILENT'
        // 95%, not 100%: a single blocked sample of 49 is a graze on decorative
        // geometry, not a clue with half its text behind a pier. The slate that
        // prompted this check was at 0%.
        : facePct !== null && facePct < 95 ? 'PARTIAL'
        : sightSpots === 0 ? 'HARDSEE'
        : 'ok',
    });
  }

  results.sort((a, b) => a.status.localeCompare(b.status) || a.id.localeCompare(b.id));
  return results;
});

/* ---- pass 1: the level as it opens ---- */
const reportOpen = await audit();

/* ---- photograph every prop from the best spot we found ----
 * Done before the locks are opened: solving the vault ends the game and the
 * ending card sits over the whole viewport. Passing --all shoots the clean
 * ones too, which is the point — the audit can prove a prop is reachable and
 * unoccluded, but only a photograph shows whether it is legible, lit, and
 * turned the right way. */
const shootAll = process.argv.includes('--all');
const toShoot = shootAll
  ? reportOpen
  : reportOpen.filter((r) => r.status !== 'ok' && r.status !== 'CONDITIONAL');
if (wantShots && toShoot.length) {
  console.log('');
  for (const r of toShoot) {
    const st = r.best
      || { x: r.centre[0], z: r.centre[2] + 2.0, y: r.centre[1], aim: r.centre };
    await page.evaluate(([x, z, y, aim]) => {
      const g = window.__meridian, T = g.world.THREE;
      g.player.teleport(x, z, y - 1.62, 0);
      g.world.camera.position.set(x, y, z);
      g.world.camera.lookAt(new T.Vector3(aim[0], aim[1], aim[2]));
      g.world.camera.updateMatrixWorld(true);
    }, [st.x, st.z, st.y, st.aim || r.centre]);
    await sleep(750);
    const safe = String(r.id).replace(/[^a-z0-9_-]/gi, '_');
    const name = `${safe}-${r.status.toLowerCase()}.png`;
    await page.screenshot({ path: `${OUT}/${name}` });
    console.log('  shot', name);
  }
}

/* ---- drive the three combination locks through their real panels ---- *
 * Clicks the actual widgets and presses Enter, so this exercises the whole
 * chain — panel, validation, solve, and the enabled() flags that gate the
 * post-solve props — rather than poking internal state. */
const solved = await page.evaluate(async () => {
  const g = window.__meridian;
  const S = g.solutions;
  const log = [];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lockEl = () => document.querySelector('#lock');
  const wheels = () => [...document.querySelectorAll('#lockwheels .wheel')];
  const rings = () => [...document.querySelectorAll('#lockrings .ringrow')];
  // ui.js reads e.code, not e.key — a synthetic 'key'-only event is ignored
  const submit = async () => {
    for (const target of [lockEl(), document, window]) {
      target.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }));
    }
    await sleep(500);
    return lockEl().classList.contains('is-open');
  };

  async function spin(key, want) {
    const cols = wheels();
    if (!cols.length) return `no wheels for ${key}`;
    for (let i = 0; i < want.length; i++) {
      // renderWheels() rebuilds the whole panel on every step, so the button
      // nodes have to be re-queried each turn or the read value never changes
      let guard = 0;
      for (;;) {
        const col = document.querySelectorAll('#lockwheels .wheel')[i];
        if (!col) return `${key}: wheel ${i} vanished`;
        const cur = +col.querySelector('.wheel__val').textContent;
        if (cur === want[i] || guard++ > 20) break;
        col.querySelector(`button[data-d="${cur < want[i] ? 1 : -1}"]`).click();
        await sleep(5);
      }
    }
    return (await submit()) ? `${key}: panel still open` : `${key}: solved`;
  }

  async function pickRings(key, want) {
    for (let i = 0; i < want.length; i++) {
      const row = document.querySelectorAll('#lockrings .ringrow')[i];
      if (!row) return `${key}: ring ${i} missing`;
      const btns = row.querySelectorAll('.glyphbtn');
      if (!btns[want[i]]) return `${key}: ring ${i} has no option ${want[i]} (of ${btns.length})`;
      btns[want[i]].click();
      await sleep(5);
    }
    return (await submit()) ? `${key}: panel still open` : `${key}: solved`;
  }

  function close() { lockEl().classList.remove('is-open'); }

  const findItem = (id) => {
    let found = null;
    g.world.scene.traverse((o) => {
      const it = o.userData && o.userData.inter;
      if (it && it.id === id && !found) found = it;
    });
    return found;
  };

  // 1. the sluice — three digit wheels
  close();
  findItem('sluice').use();
  await sleep(250);
  log.push(await spin('sluice', S.sluice));
  close();

  // 2. the orrery — three rings of star glyphs
  findItem('orrery').use();
  await sleep(250);
  log.push(await pickRings('orrery', S.orrery));
  close();

  // 3. the vault — four digit wheels
  findItem('vault').use();
  await sleep(250);
  log.push(await spin('vault', S.lens));
  close();

  return { log, sluiceOpen: g.parts.sluice.isOpen() };
});

console.log('\nsolving the locks through their panels:');
for (const l of solved.log) console.log('  ' + l);
await sleep(1200);   // let the gates finish winding up

/* ---- pass 2: the level as the player leaves it ---- */
const reportSolved = await audit();

/* ------------------------------------------------------------------ */
const byId = new Map();
for (const r of reportOpen) if (!byId.has(r.id)) byId.set(r.id, { ...r, solved: null });
for (const r of reportSolved) {
  const cur = byId.get(r.id);
  if (!cur) continue;
  cur.solved = {
    status: r.status, sightSpots: r.sightSpots, stands: r.stands,
    promptSpots: r.promptSpots, best: r.best, facePct: r.facePct,
  };
  // a prop that was conditional and is clean once its puzzle is answered is fine
  const carry = { ok: 'ok', SILENT: 'SILENT', PARTIAL: 'PARTIAL', HARDSEE: 'HARDSEE', BURIED: 'BURIED' };
  if (cur.status === 'CONDITIONAL' && carry[r.status]) cur.status = carry[r.status];
}
const report = [...byId.values()];

/* ------------------------------------------------------------------ */
const bad = report.filter((r) => r.status !== 'ok' && r.status !== 'CONDITIONAL');
const pad = (s, n) => String(s).padEnd(n);
console.log(`\naudited ${report.length} registered props (open state + solved state)\n`);
for (const r of report) {
  const mark = r.status === 'ok' ? '  . ' : ' !! ';
  const after = r.solved
    ? `  after: ${pad(r.solved.status, 10)} prompt ${r.solved.promptSpots}`
    : '';
  console.log(`${mark}${pad(r.status, 12)} ${pad(r.id, 14)} ${pad(r.label, 26)} `
    + `reach ${pad(r.sightSpots + '/' + r.stands, 8)} prompt ${pad(r.promptSpots, 5)}`
    + ` clear ${pad(r.clearDirs + '/' + r.dirs, 7)}`
    + ` face ${pad(r.facePct === null ? '-' : r.facePct + '%', 6)}${after}`);
}
const clean = report.filter((r) => r.status === 'ok').length;
console.log(`\n${clean}/${report.length} props clean`);
if (bad.length) {
  console.log('\nproblems:');
  for (const r of bad) console.log(`  ${r.status.padEnd(9)} ${r.id} (${r.label}) at ${r.centre.join(', ')}`);
}
writeFileSync('shots/audit.json', JSON.stringify(report, null, 2));

await browser.close();
server.kill('SIGTERM');
process.exit(bad.length ? 1 : 0);