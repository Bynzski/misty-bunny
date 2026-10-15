/**
 * gallery.js — Act II. The machine hall.
 */
import * as THREE from 'three';
import {
  box, cyl, torus, chain, crate, barrel, pipe, gearGeometry, stainedWindow, oilLamp,
} from '../art/builders.js';
import { chartDisc, brassPlate, stoneSlab, lectern, registerClue } from './clueProp.js';
import { clueCanvas } from '../art/textures.js';

export function buildGallery(ctx) {
  const { M, scene } = ctx;
  const g = new THREE.Group();
  g.name = 'galleryProps';
  scene.add(g);

  const CY = -42.5, FY = 6;
  const rnd = (i) => ((Math.sin(i * 45.164) * 43758.5453) % 1 + 1) % 1;

  /* ================= CLUE: the star chart (east wall) ================= */
  {
    const chart = chartDisc(ctx, 'starChart', 3.05);
    chart.position.set(9.56, 9.5, CY);
    chart.rotation.y = -Math.PI / 2;
    g.add(chart);
    // a hood over it to throw its light back onto the wall
    const hood = box(0.5, 0.4, 7.4, M.iron, 9.9, 12.9, CY);
    g.add(hood);
    const l = new THREE.SpotLight(0xffe0b0, 26, 12, 0.85, 0.7, 1.6);
    l.position.set(9.0, 12.6, CY);
    l.target.position.set(9.5, 9.4, CY);
    g.add(l, l.target);

    const hit = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(9.45, 9.5, CY);
    hit.rotation.y = -Math.PI / 2;
    g.add(hit);
    registerClue(ctx, hit, 'starChart', { label: 'the star chart', range: 4.2 });
  }

  /* ================= CLUE: the instruction plate (on a lectern) ================= */
  {
    const stand = lectern(ctx, 1.0);
    stand.position.set(3.9, FY, -39.3);
    stand.rotation.y = -0.55;
    g.add(stand);
    const plate = brassPlate(ctx, 'orreryPlate', 0.86);
    plate.position.set(3.9, FY + 1.06, -39.12);
    plate.rotation.set(-0.42, -0.55, 0);
    g.add(plate);
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(plate.position);
    hit.rotation.copy(plate.rotation);
    hit.translateZ(0.06);
    g.add(hit);
    registerClue(ctx, hit, 'orreryPlate', { label: 'the instruction plate' });
    ctx.blockProp(3.9, -39.3, 0.5, 0.5);
  }

  /* ================= CLUE: the broken inscription (workbench) ================= */
  {
    const bench = new THREE.Group();
    bench.position.set(-6.6, FY, -40.2);
    bench.rotation.y = 0.72;
    g.add(bench);
    bench.add(box(2.6, 0.1, 0.95, M.wood, 0, 0.92, 0));
    bench.add(box(2.4, 0.06, 0.5, M.wood, 0, 0.42, -0.28));
    for (const sx of [-1.15, 1.15]) for (const sz of [-0.4, 0.4]) {
      bench.add(box(0.1, 0.9, 0.1, M.woodDark, sx, 0.45, sz));
    }
    bench.add(box(2.6, 0.5, 0.07, M.woodDark, 0, 0.66, -0.45));

    // the tarpaulin, half pulled back
    const tarp = box(1.5, 0.06, 1.0, M.kelp, 0.5, 0.99, 0.02);
    tarp.rotation.y = 0.12;
    bench.add(tarp);

    const slab = stoneSlab(ctx, 'fragment', { w: 0.78, h: 0.49, seed: 77, thickness: 0.16 });
    slab.position.set(-0.55, 1.04, 0.04);
    slab.rotation.set(-Math.PI / 2, 0, 0.2);
    bench.add(slab);

    // tools, a chisel, a rule
    bench.add(cyl(0.014, 0.02, 0.28, 6, M.iron, 0.1, 1.0, 0.3));
    bench.add(box(0.5, 0.012, 0.03, M.brass, -0.1, 0.99, -0.32));
    bench.add(cyl(0.05, 0.05, 0.12, 10, M.woodDark, 0.9, 1.02, 0.3));

    const hit = box(1.0, 0.8, 0.9, new THREE.MeshBasicMaterial({ visible: false }), -0.55, 1.15, 0.04);
    bench.add(hit);
    registerClue(ctx, hit, 'fragment', { label: 'a broken inscription' });
    ctx.blockProp(-6.6, -40.2, 1.4, 0.8);
  }

  /* ================= windows ================= */
  [{ edge: 3, at: 0.26 }, { edge: 3, at: 0.74 }].forEach((w, k) => {
    const p = GAL_POLY[w.edge], q = GAL_POLY[(w.edge + 1) % 8];
    const px = p.x + (q.x - p.x) * w.at;
    const pz = p.z + (q.z - p.z) * w.at;
    const ang = Math.atan2(px, pz + 42.5);
    const win = stainedWindow(M, 1.3, 1.9, k === 1);
    win.position.set(px, FY + 8.2, pz);
    win.rotation.y = ang + Math.PI;
    g.add(win);
  });

  /* ================= the machine: gear trains ================= */
  const trains = [
    { x: -9.4, z: -40.0, ry: Math.PI / 2, gears: [[0, 1.5, 26], [1, 1.05, 18], [0, 0.7, 12]] },
    { x: -9.4, z: -45.0, ry: Math.PI / 2, gears: [[0, 1.25, 22], [1, 0.82, 15]] },
    { x: 0.0, z: -51.6, ry: 0, gears: [[0, 1.7, 30], [1, 1.1, 20], [0, 0.75, 14]] },
  ];
  for (const t of trains) {
    const train = new THREE.Group();
    train.position.set(t.x, FY + 4.2, t.z);
    train.rotation.y = t.ry;
    g.add(train);
    train.add(box(0.28, 6.2, 0.28, M.iron, -0.2, -1.0, 0));
    let y = 0;
    t.gears.forEach(([dir, r, teeth], i) => {
      const gm = new THREE.Mesh(gearGeometry(r, teeth, 0.13, { toothDepth: r * 0.12 }), M.brassBig);
      gm.position.set(0, y, 0.2);
      train.add(gm);
      const hub = cyl(r * 0.16, r * 0.16, 0.4, 12, M.brassDark, 0, y, 0.2);
      hub.rotation.x = Math.PI / 2;
      train.add(hub);
      // bracket back to the wall
      train.add(box(0.5, 0.14, 0.14, M.iron, -0.3, y, 0.2));
      const spin = { obj: gm, speed: (dir === 0 ? -1 : 1) * (1.1 / r) * (teeth / 26) };
      ctx.spinners.push(spin);
      y += dir === 0 ? -(r + 0.25) : r + 0.25;
      void i;
    });
  }

  /* a free-standing differential at floor level, slowly turning */
  {
    const diff = new THREE.Group();
    diff.position.set(-5.0, FY + 1.5, -46.4);
    diff.rotation.y = 0.3;
    g.add(diff);
    diff.add(cyl(0.55, 0.7, 2.9, 14, M.iron, 0, -1.4, 0));
    const a = new THREE.Mesh(gearGeometry(1.25, 22, 0.14), M.brass);
    a.rotation.x = Math.PI / 2;
    a.position.y = 0.4;
    diff.add(a);
    const b = new THREE.Mesh(gearGeometry(0.8, 14, 0.12), M.brassBig);
    b.rotation.x = Math.PI / 2;
    b.position.set(1.1, 0.4, 0.4);
    diff.add(b);
    ctx.spinners.push({ obj: a, speed: 0.055 }, { obj: b, speed: -0.085 });
    ctx.blockProp(-5.0, -46.4, 0.8, 0.8);
  }

  /* ================= pipework ================= */
  {
    g.add(pipe([
      [9.2, FY + 0.4, -38.6], [9.2, FY + 5.0, -38.6], [5.0, FY + 6.4, -38.6],
      [-2.0, FY + 6.4, -38.6], [-9.2, FY + 6.4, -40.6], [-9.2, FY + 0.4, -40.6],
    ], 0.13, M.iron, 10));
    g.add(pipe([
      [9.2, FY + 1.2, -46.2], [9.2, FY + 7.6, -46.2], [-1.0, FY + 8.4, -46.2],
      [-9.2, FY + 8.4, -45.0], [-9.2, FY + 2.0, -45.0],
    ], 0.1, M.copper, 10));
    for (const [x, y, z] of [[9.2, FY + 3.0, -38.6], [-2.0, FY + 6.4, -38.6], [-9.2, FY + 4.0, -40.6]]) {
      const v = cyl(0.16, 0.16, 0.26, 10, M.brassDark, x, y, z);
      g.add(v);
      const wheel = torus(0.2, 0.025, M.brass, 24, 7);
      wheel.position.set(x, y + 0.2, z);
      wheel.rotation.x = Math.PI / 2;
      g.add(wheel);
    }
  }

  /* ================= a catwalk over the south half ================= */
  {
    const cw = new THREE.Group();
    g.add(cw);
    const y = FY + 4.4;
    const deck = box(15.0, 0.14, 1.5, M.woodDark, 0, y, -35.6);
    cw.add(deck);
    for (let i = 0; i < 24; i++) {
      cw.add(box(0.06, 0.9, 0.06, M.iron, -7.2 + i * 0.62, y + 0.5, -34.9));
    }
    cw.add(box(15.0, 0.07, 0.07, M.iron, 0, y + 0.95, -34.9));
    cw.add(box(15.0, 0.05, 0.05, M.iron, 0, y + 0.55, -34.9));
    for (const x of [-7.4, -3.7, 3.7, 7.4]) {
      const c = cyl(0.09, 0.09, y - FY, 10, M.iron, x, FY + (y - FY) / 2, -35.6);
      cw.add(c);
    }
    // ladder up to it
    for (let i = 0; i < 11; i++) {
      cw.add(cyl(0.025, 0.025, 0.6, 6, M.iron, 6.9, FY + 0.3 + i * 0.38, -36.6));
    }
    cw.add(cyl(0.035, 0.035, 4.6, 8, M.iron, 6.62, FY + 2.3, -36.6));
    cw.add(cyl(0.035, 0.035, 4.6, 8, M.iron, 7.18, FY + 2.3, -36.6));
  }

  /* ================= clutter and light ================= */
  const clutter = [
    [6.6, -47.4], [7.3, -46.4], [6.4, -48.3], [-7.4, -47.6], [-6.6, -48.5],
  ];
  clutter.forEach(([x, z], i) => {
    const c = crate(M, 0.75, 0.65, 0.75, 300 + i);
    c.position.set(x, FY, z);
    c.rotation.y = rnd(i) * 3;
    g.add(c);
    ctx.blockProp(x, z, 0.5, 0.5);
  });
  [[8.0, -36.0], [-8.0, -37.0], [2.0, -49.0]].forEach(([x, z], i) => {
    const b = barrel(M, 0.32, 0.88);
    b.position.set(x, FY, z);
    b.rotation.y = rnd(i + 50) * 3;
    g.add(b);
    ctx.blockProp(x, z, 0.4, 0.4);
  });

  // a working lamp so the hall is navigable
  {
    const lamp = oilLamp(M);
    lamp.position.set(-2.2, FY + 4.2, -37.2);
    g.add(lamp);
    const pl = new THREE.PointLight(0xffb45e, 9, 16, 1.7);
    pl.position.set(-2.2, FY + 4.0, -37.2);
    g.add(pl);
    // The lamp hangs at FY + 4.2 and the player's eye is at FY + 1.62, so even
    // standing directly underneath it the lamp is 2.58 m away — which put it
    // outside its own 2.2 m interaction range. It was plainly visible and could
    // never be used: no standing position put the prompt on screen. The reach
    // is a looking distance, not an arm's length, so it has to clear the height
    // the lamp actually hangs at.
    ctx.register(lamp, {
      id: 'gallerylamp', label: 'a working lamp', range: 3.6,
      use: () => ctx.ui.toast('Wick trimmed, glass clean. Someone has kept this one lit for eighty years.'),
    });
  }
  {
    const lamp2 = oilLamp(M);
    lamp2.position.set(5.4, FY + 4.4, -48.0);
    g.add(lamp2);
    const pl = new THREE.PointLight(0xffa94e, 6, 13, 1.8);
    pl.position.set(5.4, FY + 4.2, -48.0);
    g.add(pl);
  }

  // chains hanging from the beams
  for (let i = 0; i < 5; i++) {
    const a = -2.2 + i * 1.1;
    const c = chain(1.8 + rnd(i) * 3.4, M.iron, 14);
    c.position.set(Math.sin(a) * 8, FY + 9.4, CY + Math.cos(a) * 8);
    g.add(c);
  }

  /* the floor: a brass meridian inlay running north-south */
  {
    const inlay = box(0.22, 0.02, 19.0, M.brassDark, 0, FY + 0.012, CY);
    g.add(inlay);
    for (let i = 0; i < 13; i++) {
      const t = box(0.9, 0.02, 0.1, M.brass, 0, FY + 0.014, CY - 9 + i * 1.5);
      g.add(t);
    }
  }

  return { group: g };
}

/** gallery octagon vertices, duplicated here so the windows line up with the walls */
const GAL_POLY = (() => {
  const p = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
    p.push({ x: Math.cos(a) * 10.5, z: -42.5 + Math.sin(a) * 10.5 });
  }
  return p;
})();