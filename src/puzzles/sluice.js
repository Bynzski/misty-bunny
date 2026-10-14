/**
 * sluice.js — Act I. The cast-iron sluice gate and its three figures.
 */
import * as THREE from 'three';
import { box, cyl, torus, chain } from '../art/builders.js';
import { makeDigitWheel } from './wheels.js';
import { SOLUTIONS } from '../clues.js';

export function buildSluice(ctx) {
  const { M, scene } = ctx;
  const g = new THREE.Group();
  g.name = 'sluice';
  scene.add(g);

  const W = 3.9;

  /* ---------------- the gate leaf ---------------- */
  // The gate stands in the mouth of the trench: its foot on the sump floor,
  // its head filling the opening in the wall above.
  const Z = -9.52;          // world z of the gate
  const FOOT = -0.94;       // world y of the gate's bottom edge
  const H = 4.34;

  const leaf = new THREE.Group();
  leaf.position.set(0, FOOT, Z);
  g.add(leaf);

  // frame
  leaf.add(box(W, 0.2, 0.22, M.ironDark, 0, H - 0.1, 0));
  leaf.add(box(W, 0.22, 0.22, M.ironDark, 0, 0.11, 0));
  leaf.add(box(0.2, H, 0.22, M.ironDark, -W / 2 + 0.1, H / 2, 0));
  leaf.add(box(0.2, H, 0.22, M.ironDark, W / 2 - 0.1, H / 2, 0));
  // bars
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + 0.3 + i * ((W - 0.6) / 8);
    if (Math.abs(x) < 1.05) continue;                 // leave room for the plate
    leaf.add(cyl(0.045, 0.045, H - 0.3, 10, M.iron, x, H / 2, 0));
  }
  for (const y of [0.9, 2.1, 3.0]) leaf.add(box(W - 0.3, 0.09, 0.1, M.iron, 0, y, 0.02));
  // rivets
  for (let i = 0; i < 14; i++) {
    const x = -W / 2 + 0.3 + i * ((W - 0.6) / 13);
    leaf.add(box(0.07, 0.07, 0.06, M.iron, x, H - 0.1, 0.13));
    leaf.add(box(0.07, 0.07, 0.06, M.iron, x, 0.11, 0.13));
  }

  /* ---------------- the brass lock plate ---------------- */
  const PLATE_Y = 2.44;     // local; lands at eye height in the world
  const plate = new THREE.Group();
  plate.position.set(0, PLATE_Y, 0.16);
  leaf.add(plate);

  plate.add(box(1.72, 0.78, 0.1, M.brass, 0, 0, 0));
  plate.add(box(1.86, 0.9, 0.05, M.brassDark, 0, 0, -0.05));
  for (const sx of [-0.78, 0.78]) plate.add(box(0.08, 0.9, 0.08, M.brassDark, sx, 0, 0.02));
  for (const sy of [-0.39, 0.39]) plate.add(box(1.86, 0.08, 0.08, M.brassDark, 0, sy, 0.02));

  const wheels = [];
  const XS = [-0.55, 0, 0.55];
  XS.forEach((x, i) => {
    const w = makeDigitWheel(M, { radius: 0.19, faceW: 0.145, faceH: 0.165, depth: 0.26 });
    w.position.set(x, 0.02, 0.11);
    plate.add(w);
    wheels.push(w);
  });

  /* ---------------- winch and chain above the gate ---------------- */
  {
    const w = new THREE.Group();
    w.position.set(0, 4.5, Z + 0.06);
    g.add(w);
    const drum = cyl(0.16, 0.16, 1.1, 14, M.iron);
    drum.rotation.z = Math.PI / 2;
    w.add(drum);
    w.add(cyl(0.1, 0.1, 0.5, 10, M.brassDark, -0.7, 0, 0));
    w.add(cyl(0.1, 0.1, 0.5, 10, M.brassDark, 0.7, 0, 0));
    const handle = cyl(0.03, 0.03, 0.34, 8, M.brass);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0.78, 0, 0.14);
    w.add(handle);
    g.userData.winch = w;
  }
  // chains hanging from the winch down to the gate
  for (const x of [-1.2, 1.2]) {
    const c = chain(1.3, M.iron, 8);
    c.position.set(x, 4.4, Z + 0.04);
    g.add(c);
  }

  /* ---------------- state ---------------- */
  let values = [0, 0, 0];
  let opened = false;
  let tries = 0;

  function paint() { wheels.forEach((w, i) => w.userData.setIndex(values[i])); }

  function openPanel() {
    ctx.ui.openWheels({
      title: 'The Sluice Gate',
      sub: 'THE GATE KEEPS THREE FIGURES',
      count: [0, 1, 2],
      labels: ['I · month', 'II · depth', 'III · minute'],
      values: values.slice(),
      hint: 'The slate by the gate says what the three figures are.',
      onChange: (v) => { values = v; paint(); },
      onSubmit: (v) => {
        values = v;
        paint();
        if (values.every((n, i) => n === SOLUTIONS.sluice[i])) {
          solved();
        } else {
          tries++;
          ctx.audio.reject();
          ctx.player.shake(0.35);
          if (tries === 4) {
            ctx.ui.toast('The wheels turn freely but the gate does not care.', 'Read the slate, then the logbook — the slate names the figures, the logbook names the day', 'warn');
          } else if (tries > 4 && tries % 4 === 1) {
            ctx.ui.toast('Nothing.', 'The tide table gives the month and the minute. The gauge gives the depth.', 'warn');
          }
        }
      },
      onClose: () => ctx.input.requestLock(),
    });
  }

  function solved() {
    if (opened) return;
    opened = true;
    ctx.ui.closeLock();
    ctx.audio.bell(112, 0.16);
    ctx.ui.toast('The figures take. Somewhere behind the iron, a pawl drops out of its housing.', '', 'good');
    raiseGate();
    ctx.progress('sluice');
  }

  /* ---------------- the raising ---------------- */
  const winch = g.userData.winch;
  let t = 0;
  function raiseGate() {
    ctx.audio.grind(4.2, 0.17, 0.8);
    ctx.audio.drain(8);
    ctx.player.shake(0.8);
  }

  function update(dt) {
    if (!opened || t >= 1) return;
    t = Math.min(1, t + dt / 5.4);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    leaf.position.y = FOOT + e * 3.35;
    if (winch) winch.rotation.x = -e * 22;
    if (t >= 1) {
      ctx.drain();
      ctx.ui.toast('The sump goes down with a noise like a held breath let out.', 'North, and up the stair', 'good');
      ctx.audio.setSpace('open');
    }
  }

  /* ---------------- interaction ---------------- */
  const hit = box(1.8, 0.85, 0.5, new THREE.MeshBasicMaterial({ visible: false }), 0, PLATE_Y, 0.34);
  leaf.add(hit);
  ctx.register(hit, {
    id: 'sluice',
    label: 'the sluice lock',
    range: 3.4,
    enabled: () => !opened,
    use: () => {
      ctx.input.release();
      paint();
      openPanel();
    },
  });

  ctx.register(leaf, {
    id: 'sluice-gate',
    label: 'the sluice gate',
    range: 3.4,
    enabled: () => opened,
    use: () => ctx.ui.toast('Iron bars, and a channel cut for the flood that is no longer coming.'),
  });

  ctx.blockProp(0, Z - 0.4, 2.0, 0.3);

  return { group: g, update, isOpen: () => opened, plate, leaf };
}