/**
 * antechamber.js — Act I. Flooded, dark, and written all over.
 */
import * as THREE from 'three';
import {
  box, cyl, torus, chain, crate, barrel, ropeCoil, weedCluster, pipe, oilLamp, lightShaft,
} from '../art/builders.js';
import { framedSheet, registerClue } from './clueProp.js';
import { clueCanvas } from '../art/textures.js';

export function buildAntechamber(ctx) {
  const { M, scene, level } = ctx;
  const g = new THREE.Group();
  g.name = 'anteProps';
  scene.add(g);

  const R = 9.5;

  /* ================= CLUE: the tide table (west wall) ================= */
  {
    const p = new THREE.Group();
    p.position.set(-8.62, 2.35, 0);
    p.rotation.y = Math.PI / 2;
    g.add(p);
    const sheet = framedSheet(ctx, 'tideTable', 1.0);
    p.add(sheet);
    // Kelp drapes over the top edge of the frame only. It reads as growth and
    // marks the sheet as worth a second look, without covering the columns of
    // figures — an unreadable tide table is a dead end rather than a mystery.
    const weed = weedCluster(M, 17, 5, 0.5);
    weed.position.set(-0.34, 1.06, 0.07);
    weed.scale.set(0.55, 0.46, 1.1);
    p.add(weed);
    const hit = box(1.2, 1.6, 0.4, new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 0.25);
    p.add(hit);
    registerClue(ctx, hit, 'tideTable', { label: 'a tide table' });
  }

  /* ================= CLUE: the keeper's slate (beside the sluice) ================= */
  {
    const p = new THREE.Group();
    p.position.set(-3.25, 1.62, -8.6);
    p.rotation.y = 0.12;
    g.add(p);
    p.add(framedSheet(ctx, 'slate', 0.9));
    const hit = box(1.1, 1.5, 0.4, new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 0.25);
    p.add(hit);
    registerClue(ctx, hit, 'slate', { label: "the keeper's slate" });
  }

  /* ================= CLUE: the tide gauge (north-east pier) ================= */
  {
    const p = new THREE.Group();
    p.position.set(3.35, 1.95, -8.58);
    g.add(p);
    const src = clueCanvas('gauge');
    const tex = new THREE.CanvasTexture(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 1.42),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.8, envMapIntensity: 1.6 }));
    p.add(face);
    p.add(box(0.58, 1.48, 0.05, M.brassDark, 0, 0, -0.03));
    // a small window of water behind the float, so it reads as live
    const tube = box(0.14, 1.3, 0.06, M.glass, 0, 0, 0.035);
    p.add(tube);
    for (const sx of [-0.2, 0.2]) p.add(cyl(0.035, 0.035, 1.5, 8, M.brassDark, sx, 0, 0.02));
    const hit = box(0.7, 1.6, 0.5, new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 0.3);
    p.add(hit);
    registerClue(ctx, hit, 'gauge', { label: 'the tide gauge' });
    ctx.blockProp(3.35, -8.5, 0.35, 0.2);
  }

  /* ================= CLUE: the keeper's logbook (east alcove) ================= */
  {
    const p = new THREE.Group();
    p.position.set(7.5, 0, 2.4);
    p.rotation.y = -Math.PI / 2 - 0.3;
    g.add(p);

    // desk
    p.add(box(1.9, 0.1, 0.85, M.wood, 0, 0.78, 0));
    for (const sx of [-0.85, 0.85]) for (const sz of [-0.33, 0.33]) {
      p.add(box(0.09, 0.78, 0.09, M.woodDark, sx, 0.39, sz));
    }
    p.add(box(1.7, 0.16, 0.08, M.woodDark, 0, 0.62, -0.36));

    // the book
    const book = new THREE.Group();
    book.position.set(0.05, 0.84, 0.02);
    book.rotation.y = 0.22;
    p.add(book);
    book.add(box(0.52, 0.1, 0.4, M.woodDark, 0, 0.05, 0));
    const pages = box(0.48, 0.07, 0.36, new THREE.MeshStandardMaterial({ color: 0xcfc2a0, roughness: 0.95 }), 0, 0.12, 0);
    book.add(pages);
    book.add(box(0.54, 0.025, 0.42, M.woodDark, 0, 0.17, 0));
    const ribbon = box(0.03, 0.01, 0.5, new THREE.MeshStandardMaterial({ color: 0x7a2622, roughness: 0.9 }), 0.12, 0.185, 0.06);
    book.add(ribbon);
    ctx.register(book, {
      id: 'logbook',
      label: "the keeper's logbook",
      range: 2.6,
      use: () => {
        const fresh = ctx.ui.discover('logbook');
        ctx.audio.paper();
        ctx.ui.toast(fresh
          ? 'Water-swollen, but the ink held. <b>Copied into the journal.</b>'
          : "The keeper's logbook", 'press J to read it again', fresh ? 'good' : '');
        ctx.stats.cluesRead++;
      },
    });

    // inkwell + quill
    p.add(cyl(0.07, 0.09, 0.11, 12, M.glass, -0.62, 0.88, 0.16));
    const quill = cyl(0.004, 0.012, 0.3, 6, M.woodDark, -0.6, 1.02, 0.14);
    quill.rotation.z = 0.5;
    p.add(quill);

    // the fallen beam that hides the desk in the first place
    const beam = box(3.4, 0.34, 0.34, M.woodDark, 0.6, 1.55, 0.9);
    beam.rotation.set(0.2, 0.34, 1.32);
    p.add(beam);
    ctx.blockProp(7.3, 2.4, 0.7, 1.2);
  }

  /* ================= CLUE: the foundation stone (dark NW corner) ================= */
  const stoneGroup = new THREE.Group();
  {
    const p = new THREE.Group();
    p.position.set(-6.85, 0.68, -5.25);
    p.rotation.set(-0.16, 0.74, 0.05);
    g.add(p);
    const slab = new THREE.Group();
    p.add(slab);
    const rnd = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const src = clueCanvas('stone');
    const tex = new THREE.CanvasTexture(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.84),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
    face.position.z = 0.115;
    slab.add(face);
    slab.add(box(1.26, 0.84, 0.22, M.wallLow, 0, 0, -0.01));
    // a mound of rubble for it to lean on, heaped up out of the water
    for (let i = 0; i < 14; i++) {
      const r = box(0.14 + rnd(i) * 0.3, 0.1 + rnd(i + 3) * 0.2, 0.14 + rnd(i + 6) * 0.26, M.wallLow,
        (rnd(i + 1) - 0.5) * 1.7, -0.42 - rnd(i + 2) * 0.22, (rnd(i + 4) - 0.5) * 0.8);
      r.rotation.set(rnd(i) * 3, rnd(i + 5) * 3, rnd(i + 7) * 3);
      slab.add(r);
    }
    const hit = box(1.4, 1.05, 0.7, new THREE.MeshBasicMaterial({ visible: false }), 0, 0, 0.4);
    slab.add(hit);
    registerClue(ctx, hit, 'stone', {
      label: 'a foundation stone',
      hint: 'worn too smooth to read by this light',
      guard: () => {
        if (ctx.player.lanternOn) return true;
        ctx.audio.click();
        ctx.ui.toast('Worn nearly smooth, and too far off to read by what light there is.',
          'hold the lantern close — press F', 'warn');
        return false;
      },
    });
    ctx.blockProp(-6.9, -5.3, 1.1, 1.1);
  }

  /* ================= dressing ================= */
  dressing(ctx, g);

  /* ================= the lantern in your hand ================= */
  // (attached to the camera in game.js; here we only make sure the room is dark enough)

  // a single cold shaft of light from the oculus
  {
    const cone = lightShaft({ topR: 1.5, botR: 2.6, height: 7.0, opacity: 0.22, taper: 0.6 });
    cone.position.set(0, 3.5, 0);
    g.add(cone);
    ctx.shafts.push({ mat: cone.material });
  }

  // weed on the high wall, well above the waterline and clear of any clue
  for (let i = 0; i < 5; i++) {
    const a = i * 1.27;
    const weed = weedCluster(M, 40 + i * 7, 9);
    weed.position.set(Math.cos(a) * (R - 0.9), 6.3, Math.sin(a) * (R - 0.9));
    weed.rotation.y = a;
    g.add(weed);
  }

  return { group: g };
}

/* ------------------------------------------------------------------ */
function dressing(ctx, g) {
  const { M } = ctx;
  const R = 9.5;
  const rnd = (i) => ((Math.sin(i * 78.233) * 43758.5453) % 1 + 1) % 1;

  /* crates and barrels */
  const clutter = [
    [5.2, -4.6, 0.4], [5.8, -4.1, -0.7], [5.0, -5.2, 1.1],
    [-4.4, -5.9, 0.6], [-4.9, -5.2, -0.2], [6.4, 5.2, 0.9],
    [5.5, 5.8, -0.4], [-6.1, 4.6, 0.2],
  ];
  clutter.forEach(([x, z, ry], i) => {
    const c = crate(M, 0.7 + rnd(i) * 0.25, 0.6 + rnd(i + 2) * 0.2, 0.7 + rnd(i + 4) * 0.2, 100 + i);
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    g.add(c);
    ctx.blockProp(x, z, 0.5, 0.5);
  });

  [[6.9, -2.0], [-5.6, -2.4], [6.4, 3.2], [-3.0, 6.2]].forEach(([x, z], i) => {
    const b = barrel(M, 0.33, 0.9);
    b.position.set(x, 0, z);
    b.rotation.y = rnd(i + 30) * 3;
    g.add(b);
    ctx.blockProp(x, z, 0.4, 0.4);
  });

  [[7.9, -5.4], [-7.6, 1.0]].forEach(([x, z], i) => {
    const r = ropeCoil(M, 0.34);
    r.position.set(x, 0, z);
    g.add(r);
    ctx.blockProp(x, z, 0.42, 0.42);
  });

  /* an upturned dinghy */
  {
    const boat = new THREE.Group();
    boat.position.set(-2.6, 0, 5.4);
    boat.rotation.y = 0.7;
    g.add(boat);
    const shape = new THREE.Shape();
    shape.moveTo(-1.8, 0); shape.quadraticCurveTo(0, -0.62, 1.8, 0);
    shape.quadraticCurveTo(0, 0.34, -1.8, 0);
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.56, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }), M.woodDark);
    hull.rotation.x = Math.PI / 2;
    hull.position.set(0, -0.3, 0);
    boat.add(hull);
    for (let i = 0; i < 3; i++) {
      const th = box(2.4 - i * 0.3, 0.07, 0.12, M.wood, 0, -0.12, -0.2 + i * 0.2);
      boat.add(th);
    }
    boat.rotation.z = 0.08;
    ctx.blockProp(-2.6, 5.4, 1.7, 0.6);
  }

  /* hanging chains from the oculus rim */
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const len = 1.4 + rnd(i + 11) * 2.2;
    const c = chain(len, M.iron, Math.round(len / 0.16));
    c.position.set(Math.sin(a) * 1.5, 6.5, Math.cos(a) * 1.5);
    g.add(c);
  }

  /* iron ribs around the octagon, low down */
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = torus(1.5, 0.07, M.iron, 40, 8);
    t.position.set(0, 3.4, 0);
    t.rotation.x = Math.PI / 2;
    t.rotation.z = a;
    t.position.set(Math.sin(a) * 0.1, 3.4, Math.cos(a) * 0.1);
    g.add(t);
  }

  /* a stove, a shelf, a bell */
  {
    const shelf = new THREE.Group();
    shelf.position.set(4.2, 0, 6.6);
    shelf.rotation.y = -0.9;
    g.add(shelf);
    for (let i = 0; i < 3; i++) shelf.add(box(2.0, 0.06, 0.34, M.wood, 0, 1.1 + i * 0.55, 0));
    shelf.add(box(0.07, 2.2, 0.34, M.woodDark, -0.95, 1.4, 0));
    shelf.add(box(0.07, 2.2, 0.34, M.woodDark, 0.95, 1.4, 0));
    for (let i = 0; i < 9; i++) {
      const j = box(0.1, 0.2 + rnd(i) * 0.14, 0.1, M.glass, -0.8 + rnd(i + 3) * 1.6, 1.25 + (i % 3) * 0.55, rnd(i + 5) * 0.12 - 0.06);
      shelf.add(j);
    }
    ctx.blockProp(4.2, 6.6, 0.9, 0.5);
  }

  {
    const bell = new THREE.Group();
    bell.position.set(-8.0, 0, -5.6);
    g.add(bell);
    const frame = box(0.2, 3.2, 0.2, M.iron, 0, 1.6, 0);
    bell.add(frame);
    bell.add(box(1.3, 0.16, 0.2, M.iron, 0.5, 3.1, 0));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.6, 0.7, 20, 1, true), M.brass);
    b.position.set(1.0, 2.5, 0);
    bell.add(b);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 8, 24), M.brassDark);
    t.rotation.x = Math.PI / 2; t.position.set(1.0, 2.15, 0);
    bell.add(t);
    bell.add(cyl(0.06, 0.06, 0.5, 8, M.brassDark, 1.0, 1.95, 0));
    ctx.register(bell, {
      id: 'bell',
      label: 'the keeper’s bell',
      range: 3.0,
      use: () => {
        ctx.audio.bell(174.6, 0.12);
        ctx.player.shake(0.3);
        ctx.ui.toast('One strike, and it goes on ringing in the stone for a long time.');
      },
    });
    ctx.blockProp(-8.0, -5.6, 0.4, 0.4);
  }

  /* a stove pipe climbing out through the oculus */
  {
    const p = pipe([[-6.4, 0.1, -6.8], [-6.4, 2.2, -6.8], [-4.6, 4.4, -4.4], [-2.2, 6.2, -2.0], [-1.2, 7.2, -1.1]], 0.16, M.iron, 10);
    g.add(p);
    const stove = new THREE.Group();
    stove.position.set(-6.4, 0, -6.8);
    g.add(stove);
    stove.add(box(1.1, 0.9, 0.8, M.iron, 0, 0.45, 0));
    stove.add(box(1.2, 0.08, 0.9, M.ironDark, 0, 0.94, 0));
    stove.add(box(0.55, 0.4, 0.06, M.ironDark, 0, 0.5, 0.41));
    ctx.blockProp(-6.4, -6.8, 0.6, 0.5);
  }

  /* weed along the waterline */
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const weed = weedCluster(M, 90 + i * 13, 10);
    weed.position.set(Math.sin(a) * (R - 0.75), 0.5 + rnd(i) * 1.2, Math.cos(a) * (R - 0.75));
    weed.rotation.y = a + Math.PI;
    g.add(weed);
  }

  /* a broken lens on the floor */
  {
    const lens = new THREE.Group();
    lens.position.set(3.0, 0.02, -3.0);
    g.add(lens);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.2 + rnd(i) * 0.2, 7), M.glass);
      s.rotation.x = -Math.PI / 2;
      s.position.set((rnd(i + 2) - 0.5) * 1.6, 0.01, (rnd(i + 5) - 0.5) * 1.6);
      lens.add(s);
    }
    ctx.register(lens, {
      id: 'brokenlens',
      label: 'a broken lens',
      range: 2.4,
      use: () => ctx.ui.toast('Ground glass, half a finger thick. Whatever this window looked through, it was looking at something very far away.'),
    });
  }

  /* tide-line on the walls: a band of dark stone */
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.9, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2b332c, roughness: 1 }),
  );
  band.rotation.y = Math.PI / 8;
  band.position.y = 0.42;
  g.add(band);
}