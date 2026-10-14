/**
 * dome.js — Act III. The observatory, and the year it wants.
 */
import * as THREE from 'three';
import { box, cyl, torus, lightShaft } from '../art/builders.js';
import { brassPlate, registerClue } from './clueProp.js';
import { plateTexture } from '../art/textures.js';

export function buildDome(ctx) {
  const { M, scene } = ctx;
  const g = new THREE.Group();
  g.name = 'domeProps';
  scene.add(g);

  const CX = 0, CZ = -65.5, FY = 6;
  const rnd = (i) => ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1;

  /* ================= CLUE: the lens plate ================= */
  {
    const stand = new THREE.Group();
    stand.position.set(2.5, FY, -62.6);
    stand.rotation.y = -0.25;
    g.add(stand);
    stand.add(cyl(0.3, 0.36, 0.1, 16, M.brassDark, 0, 0.05, 0));
    stand.add(cyl(0.06, 0.075, 1.25, 12, M.brassDark, 0, 0.66, 0));
    const plate = brassPlate(ctx, 'lensPlate', 0.95);
    plate.position.set(0, 1.36, 0.03);
    plate.rotation.x = -0.16;
    stand.add(plate);
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 1.36, 0.1);
    hit.rotation.x = -0.16;
    stand.add(hit);
    registerClue(ctx, hit, 'lensPlate', { label: 'the lens plate' });
    ctx.blockProp(2.5, -62.6, 0.4, 0.4);
  }

  /* ================= builders' plaque ================= */
  {
    const p = new THREE.Group();
    p.position.set(-2.9, FY + 1.9, -70.6);
    p.rotation.y = -0.62;
    g.add(p);
    const tex = plateTexture('HOLLOW MERIDIAN', { sub: 'INSTRUMENT No. 4' });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.5, metalness: 0.7, envMapIntensity: 1.3,
    }));
    p.add(face);
    p.add(box(1.5, 0.44, 0.06, M.brassDark, 0, 0, -0.04));

    const tex2 = plateTexture('E. M.', { sub: 'BUILDER & KEEPER' });
    const face2 = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshStandardMaterial({
      map: tex2, roughness: 0.5, metalness: 0.7,
    }));
    face2.position.set(0, -0.85, 0.01);
    p.add(face2);
    p.add(box(0.9, 0.29, 0.06, M.brassDark, 0, -0.85, -0.03));

    const hit = box(1.5, 1.6, 0.4, new THREE.MeshBasicMaterial({ visible: false }), 0, -0.3, 0.2);
    p.add(hit);
    ctx.register(hit, {
      id: 'builders', label: 'a builders’ plaque', range: 2.8,
      use: () => ctx.ui.toast('HOLLOW MERIDIAN · Instrument No. 4 · E. M., builder and keeper. One name. He built it and then he kept it.'),
    });
  }

  /* ================= the great telescope ================= */
  {
    const scope = new THREE.Group();
    scope.position.set(-5.2, FY, -68.4);
    scope.rotation.y = 0.9;
    g.add(scope);

    // pier
    scope.add(cyl(0.7, 0.9, 0.22, 16, M.wallLow, 0, 0.11, 0));
    scope.add(cyl(0.42, 0.58, 2.1, 16, M.wallLow, 0, 1.26, 0));
    scope.add(cyl(0.6, 0.6, 0.12, 16, M.brassDark, 0, 2.36, 0));

    const mount = new THREE.Group();
    mount.position.y = 2.6;
    mount.rotation.x = -0.72;
    scope.add(mount);
    const yoke = cyl(0.2, 0.2, 0.5, 14, M.brassDark, 0, 0.2, 0);
    yoke.rotation.z = Math.PI / 2;
    mount.add(yoke);

    const tube = cyl(0.26, 0.34, 3.6, 20, M.brassBig, 0, 1.0, 0);
    mount.add(tube);
    for (const y of [-0.4, 0.5, 1.5, 2.4]) {
      const r = torus(0.33, 0.035, M.brass, 24, 7);
      r.rotation.x = Math.PI / 2;
      r.position.y = y;
      mount.add(r);
    }
    const obj = cyl(0.4, 0.3, 0.3, 20, M.brassBright, 0, 2.9, 0);
    mount.add(obj);
    const finder = cyl(0.07, 0.08, 0.9, 12, M.brassDark, 0.4, 1.6, 0);
    mount.add(finder);
    mount.add(box(0.2, 0.06, 0.06, M.brassBright, 0.3, 1.15, 0.28));

    // counterweight
    mount.add(cyl(0.05, 0.05, 1.0, 8, M.iron, 0, -0.5, 0));
    mount.add(cyl(0.22, 0.22, 0.2, 12, M.ironDark, 0, -1.0, 0));

    ctx.spinners.push({ obj: mount, speed: 0.004 });
    ctx.blockProp(-5.2, -68.4, 0.9, 0.9);
    ctx.register(scope, {
      id: 'scope', label: 'the great telescope', range: 3.0,
      use: () => ctx.ui.toast('Swings a hair every few minutes, the way a thing will when the roof above it is not quite shut.'),
    });
  }

  /* ================= observation furniture ================= */
  {
    // a rail around the drum, with a gap on the entry side
    const rail = new THREE.Group();
    rail.position.set(CX, FY, CZ);
    g.add(rail);
    for (let i = 0; i < 24; i++) {
      if (i === 6 || i === 7) continue;
      const a = (i / 24) * Math.PI * 2;
      const x = Math.sin(a) * 3.6, z = Math.cos(a) * 3.6;
      rail.add(cyl(0.035, 0.035, 1.0, 8, M.brassDark, x, 0.5, z));
      rail.add(cyl(0.06, 0.06, 0.08, 8, M.brass, x, 1.02, z));
      if (i % 3 === 0) {
        const a2 = ((i + 1) / 24) * Math.PI * 2;
        const x2 = Math.sin(a2) * 3.6, z2 = Math.cos(a2) * 3.6;
        const len = Math.hypot(x2 - x, z2 - z);
        const b = cyl(0.022, 0.022, len, 8, M.brassDark, (x + x2) / 2, 1.0, (z + z2) / 2);
        b.rotation.set(Math.PI / 2, 0, -Math.atan2(x2 - x, z2 - z) + Math.PI / 2);
        b.rotation.z = Math.atan2(x2 - x, z - z2);
        rail.add(b);
      }
    }

    // a writing desk with charts
    const desk = new THREE.Group();
    desk.position.set(4.6, FY, -69.2);
    desk.rotation.y = 0.5;
    g.add(desk);
    desk.add(box(1.8, 0.08, 0.8, M.wood, 0, 0.78, 0));
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.32, 0.32]) desk.add(box(0.08, 0.78, 0.08, M.woodDark, sx, 0.39, sz));
    for (let i = 0; i < 3; i++) {
      const sheet = box(0.6, 0.012, 0.44, M.paper, -0.4 + i * 0.1, 0.83 + i * 0.013, 0.02 + i * 0.06);
      sheet.rotation.y = (rnd(i) - 0.5) * 0.5;
      desk.add(sheet);
    }
    desk.add(cyl(0.14, 0.16, 0.05, 14, M.brassDark, 0.6, 0.85, -0.2));
    ctx.blockProp(4.6, -69.2, 0.9, 0.5);
    ctx.register(desk, {
      id: 'domedesk', label: 'a writing desk', range: 2.6,
      use: () => ctx.ui.toast('Observation sheets going back to the autumn. The last entry is the seventh of March, and it is only one line.'),
    });

    // a chair, tipped over
    const chair = new THREE.Group();
    chair.position.set(5.8, FY, -68.0);
    chair.rotation.set(1.4, 0.8, 0.3);
    g.add(chair);
    chair.add(box(0.46, 0.05, 0.44, M.woodDark, 0, 0.45, 0));
    chair.add(box(0.46, 0.5, 0.05, M.woodDark, 0, 0.7, -0.2));
    for (const sx of [-0.2, 0.2]) for (const sz of [-0.18, 0.18]) chair.add(box(0.04, 0.45, 0.04, M.wood, sx, 0.22, sz));
  }

  /* ================= the drum of the instrument ================= */
  {
    // a decorative brass ring in the floor around the vault
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.05, 8, 60), M.brassDark);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(CX, FY + 0.02, CZ);
    g.add(ring);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const t = box(0.5, 0.02, 0.09, M.brass, Math.sin(a) * 3.3, FY + 0.014, CZ + Math.cos(a) * 3.3);
      t.rotation.y = a;
      g.add(t);
    }
    const line = box(0.2, 0.02, 8.6, M.brassDark, CX, FY + 0.012, CZ);
    g.add(line);
  }

  /* ================= dust and moonlight ================= */
  {
    const cone = lightShaft({ topR: 1.5, botR: 3.2, height: 12.5, opacity: 0.12, taper: 1.5 });
    cone.position.set(0, 12.5, -65.5);
    g.add(cone);
    ctx.shafts.push({ mat: cone.material });

    // motes drifting in the shaft
    const N = 190;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rnd(i) * Math.PI * 2;
      const r = Math.sqrt(rnd(i + 1)) * 3.0;
      pos[i * 3] = CX + Math.sin(a) * r;
      pos[i * 3 + 1] = FY + rnd(i + 2) * 12;
      pos[i * 3 + 2] = CZ + Math.cos(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xbcd6f2, size: 0.03, transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    g.add(pts);
    ctx.motes = pts;
  }

  /* ================= a last, small piece of business ================= */
  {
    const bust = new THREE.Group();
    bust.position.set(-3.4, FY + 0.9, -60.4);
    g.add(bust);
    bust.add(cyl(0.3, 0.36, 0.14, 16, M.brassDark, 0, 0.07, 0));
    bust.add(cyl(0.06, 0.06, 0.72, 10, M.brassDark, 0, 0.45, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), M.brassBright);
    head.scale.set(1, 1.25, 0.9);
    head.position.y = 0.98;
    bust.add(head);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 12), M.brass);
    shoulders.scale.set(1.3, 0.55, 0.8);
    shoulders.position.y = 0.82;
    bust.add(shoulders);
    ctx.blockProp(-3.4, -60.4, 0.4, 0.4);
    ctx.register(bust, {
      id: 'bust', label: 'a small brass bust', range: 2.6,
      use: () => ctx.ui.toast('The same face as the builder on the plaque, cast small enough to hold in one hand. Somebody loved him.'),
    });
  }

  return { group: g };
}