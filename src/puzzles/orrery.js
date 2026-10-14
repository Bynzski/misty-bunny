/**
 * orrery.js — Act II. The meridian instrument: three glyph rings, and the
 * gate they open.
 */
import * as THREE from 'three';
import { box, cyl, torus, sphere, gearGeometry, beveledBox } from '../art/builders.js';
import { glyphTexture } from '../art/textures.js';
import { STARS, SOLUTIONS } from '../clues.js';
import { ringItems } from '../core/ui.js';
import { LAYOUT } from '../world/level.js';

export function buildOrrery(ctx) {
  const { M, scene } = ctx;
  const CX = 0, CZ = -42.5, BASE = LAYOUT.gallery.y;

  const g = new THREE.Group();
  g.name = 'orrery';
  scene.add(g);

  /* ---------------- pedestal ---------------- */
  const ped = new THREE.Group();
  ped.position.set(CX, BASE, CZ);
  g.add(ped);
  ped.add(cyl(1.9, 2.05, 0.22, 32, M.wallLow, 0, 0.11, 0));
  ped.add(cyl(1.6, 1.78, 0.62, 32, M.wallLow, 0, 0.53, 0));
  ped.add(cyl(1.66, 1.66, 0.07, 32, M.brassDark, 0, 0.87, 0));
  ped.add(cyl(1.5, 1.5, 0.14, 32, M.brassBig, 0, 0.98, 0));
  // fluting
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ped.add(cyl(0.05, 0.05, 0.6, 8, M.brassDark, Math.cos(a) * 1.6, 0.52, Math.sin(a) * 1.6));
  }

  /* ---------------- the ring assembly ---------------- */
  const head = new THREE.Group();
  head.position.set(CX, BASE, CZ);
  g.add(head);

  // fixed armillary hoops around the rings — decorative, and they frame the view
  const hoopDefs = [
    { r: 2.15, tube: 0.055, rx: 0, rz: 0 },
    { r: 2.15, tube: 0.05, rx: 0.42, rz: 0 },
    { r: 2.15, tube: 0.05, rx: 0.95, rz: 0 },
  ];
  for (const h of hoopDefs) {
    const t = torus(h.r, h.tube, M.brass, 60, 10);
    t.position.y = 1.5;
    t.rotation.x = Math.PI / 2 + h.rx;
    t.rotation.z = h.rz;
    head.add(t);
  }

  // central globe
  const globe = sphere(0.42, new THREE.MeshStandardMaterial({
    color: 0x2c3a3e, roughness: 0.5, metalness: 0.3, envMapIntensity: 1.2,
  }), 26);
  globe.position.y = 1.52;
  head.add(globe);
  for (const t of [0.4, 1.1]) {
    const r = torus(0.46, 0.016, M.brassBright, 40, 6);
    r.position.y = 1.52;
    r.rotation.x = Math.PI / 2 + t;
    head.add(r);
  }
  head.add(cyl(0.06, 0.06, 2.1, 12, M.brassDark, 0, 1.5, 0));

  /* ---------------- the three glyph rings ---------------- */
  const RING_DEF = [
    { name: 'Ring I', r: 1.56, y: 1.16 },
    { name: 'Ring II', r: 1.28, y: 1.52 },
    { name: 'Ring III', r: 1.0, y: 1.88 },
  ];

  const rings = RING_DEF.map((def) => {
    const holder = new THREE.Group();
    holder.position.y = def.y;
    head.add(holder);

    const spin = new THREE.Group();
    holder.add(spin);

    const band = torus(def.r, 0.035, M.brass, 56, 8);
    band.rotation.x = Math.PI / 2;
    spin.add(band);
    const band2 = torus(def.r, 0.014, M.brassDark, 56, 6);
    band2.rotation.x = Math.PI / 2;
    band2.position.y = -0.09;
    spin.add(band2);

    const plates = STARS.map((star, i) => {
      const a = (i / STARS.length) * Math.PI * 2;
      const tex = glyphTexture(star, { size: 128 });
      const mat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, alphaTest: 0.04,
        color: 0xd8b464, roughness: 0.34, metalness: 0.85, envMapIntensity: 1.6,
        emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.62,
      });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), mat);
      const arm = new THREE.Group();
      arm.position.set(Math.sin(a) * def.r, 0, Math.cos(a) * def.r);
      arm.rotation.y = a;
      plate.rotation.x = -0.86;
      plate.position.set(0, 0.055, 0.012);
      arm.add(plate);
      const base = box(0.07, 0.11, 0.02, M.brassDark, 0, -0.05, 0);
      base.rotation.x = -0.86;
      arm.add(base);
      spin.add(arm);
      return { plate, mat };
    });

    return { def, holder, spin, plates };
  });

  /* ---------------- the meridian index ---------------- */
  const index = new THREE.Group();
  index.position.set(CX, BASE, CZ);
  g.add(index);
  {
    // the standard stands well off to one side so it never masks the rings
    const post = cyl(0.06, 0.085, 2.6, 12, M.brassDark, 2.25, 1.3, 1.75);
    index.add(post);
    index.add(cyl(0.19, 0.22, 0.1, 14, M.brassDark, 2.25, 0.05, 1.75));
    const arm = box(2.35, 0.09, 0.09, M.brassDark, 1.1, 2.56, 1.75);
    index.add(arm);
    const brace = box(0.7, 0.06, 0.06, M.brassDark, 1.85, 2.28, 1.75);
    brace.rotation.z = -0.72;
    index.add(brace);
    const plate = beveledBox(0.62, 0.2, 0.04, 0.02);
    const sign = new THREE.Mesh(plate, M.brassBright);
    sign.position.set(2.25, 1.3, 1.7);
    sign.rotation.y = -0.5;
    index.add(sign);
    // three index pointers, one over each ring
    for (const def of RING_DEF) {
      const notch = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 3), M.brassBright);
      notch.rotation.x = -Math.PI / 2;
      notch.position.set(0, def.y, def.r + 0.09);
      index.add(notch);
      const stalk = box(0.03, 0.03, def.r + 0.1, M.brassDark, 0, def.y, def.r / 2 + 0.04);
      stalk.rotation.x = 0;
      index.add(stalk);
    }
  }

  /* ---------------- state ---------------- */
  let values = [0, 0, 0];
  const anims = [];

  function spinTo(i, index) {
    const step = (Math.PI * 2) / STARS.length;
    const target = -index * step;
    let from = rings[i].spin.rotation.y;
    let delta = target - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    anims.push({ obj: rings[i].spin, from, delta, t: 0, dur: 0.42 + Math.abs(delta) * 0.12 });
    ctx.audio.clank(0.85 + i * 0.16, 0.06);
  }

  function paint() { values.forEach((v, i) => spinTo(i, v)); }

  function update(dt) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      const e = 1 - Math.pow(1 - k, 3);
      a.obj.rotation.y = a.from + a.delta * e;
      if (k >= 1) anims.splice(i, 1);
    }
    gate.update(dt);
  }

  /* ---------------- the meridian gate ---------------- */
  const gate = buildMeridianGate(ctx, CZ, BASE);
  g.add(gate.group);

  let solved = false;

  function openPanel() {
    ctx.ui.openRings({
      title: 'The Meridian Instrument',
      sub: 'THREE RINGS · SET THEM IN THE ORDER THE STARS ROSE',
      rings: RING_DEF.map((d, i) => ({ name: d.name, items: ringItems() })),
      values: values.slice(),
      hint: 'The plate on the pedestal gives the rule. The chart on the wall gives the bearings.',
      onChange: (v) => { values = v; paint(); },
      onSubmit: (v) => {
        values = v; paint();
        if (v.every((n, i) => n === SOLUTIONS.orrery[i])) {
          succeed();
        } else {
          ctx.audio.reject();
          ctx.player.shake(0.3);
        }
      },
      onClose: () => ctx.input.requestLock(),
    });
  }

  function succeed() {
    if (solved) return;
    solved = true;
    ctx.ui.closeLock();
    ctx.audio.bell(146.8, 0.15);
    ctx.player.shake(0.9);
    gate.open();
    setTimeout(() => {
      ctx.ui.toast('Something enormous and patient begins to turn.', 'The gate north of you is opening', 'good');
    }, 2600);
  }

  /* ---------------- interaction ---------------- */
  const hit = cyl(1.75, 1.75, 2.2, 16, new THREE.MeshBasicMaterial({ visible: false }), CX, BASE + 1.1, CZ);
  g.add(hit);
  ctx.register(hit, {
    id: 'orrery',
    label: 'the meridian instrument',
    range: 3.6,
    enabled: () => !solved,
    use: () => { ctx.input.release(); paint(); openPanel(); },
  });

  ctx.register(g, {
    id: 'orrery-done',
    label: 'the meridian instrument',
    range: 3.6,
    enabled: () => solved,
    use: () => ctx.ui.toast('The rings hold. The whole tower is turning about them, very slowly.'),
  });

  ctx.blockProp(CX, CZ, 2.15, 2.15);
  ctx.blockProp(CX + 2.25, CZ + 1.75, 0.35, 0.35);

  return { group: g, update, isSolved: () => solved, rings, gate };
}

function LAYOUT_REF() { /* placeholder removed */ }

/* ------------------------------------------------------------------ *
 *  The gate at the north end of the gallery
 * ------------------------------------------------------------------ */
function buildMeridianGate(ctx, cz, base) {
  const { M } = ctx;
  const group = new THREE.Group();
  group.position.set(0, base, cz - 10.5 + 0.1);

  const W = 4.2, H = 3.5;
  const jamb = (sx) => {
    const j = new THREE.Group();
    j.position.set(sx * (W / 2 + 0.2), 0, 0);
    j.add(box(0.4, H + 0.4, 1.0, M.wallLow, 0, (H + 0.4) / 2, 0));
    for (let i = 0; i < 4; i++) j.add(box(0.5, 0.12, 1.1, M.brassDark, 0, 0.4 + i * 0.9, 0));
    return j;
  };
  group.add(jamb(-1), jamb(1));
  group.add(box(W + 1.2, 0.5, 1.1, M.wallLow, 0, H + 0.25, 0));
  group.add(box(W + 1.0, 0.18, 0.9, M.brassDark, 0, H - 0.02, 0));

  const leaf = new THREE.Group();
  group.add(leaf);
  leaf.add(box(W, 0.22, 0.26, M.ironDark, 0, 0.11, 0));
  leaf.add(box(W, 0.22, 0.26, M.ironDark, 0, H - 0.11, 0));
  for (let i = 0; i < 7; i++) {
    const x = -W / 2 + 0.35 + i * ((W - 0.7) / 6);
    leaf.add(cyl(0.05, 0.05, H - 0.44, 10, M.iron, x, H / 2, 0));
  }
  // a great brass meridian dial on the face of the gate
  const dial = torus(0.86, 0.07, M.brass, 48, 10);
  dial.position.set(0, 1.75, 0.16);
  leaf.add(dial);
  const dial2 = torus(0.7, 0.03, M.brassDark, 48, 8);
  dial2.position.set(0, 1.75, 0.16);
  leaf.add(dial2);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const t = box(0.05, 0.16, 0.03, M.brassBright, Math.sin(a) * 0.78, 1.75 + Math.cos(a) * 0.78, 0.17);
    t.rotation.z = -a;
    leaf.add(t);
  }
  const ptr = box(0.05, 0.7, 0.03, M.brassBright, 0, 2.0, 0.18);
  leaf.add(ptr);
  for (let i = 0; i < 4; i++) leaf.add(box(W - 0.2, 0.08, 0.12, M.iron, 0, 0.6 + i * 0.85, 0.14));

  let open = false, t = 0;
  function doOpen() {
    if (open) return;
    open = true;
    ctx.audio.grind(3.6, 0.15, 1.25);
    ctx.progress('gate');
  }

  function update(dt) {
    if (!open || t >= 1) return;
    t = Math.min(1, t + dt / 4.2);
    const e = 1 - Math.pow(1 - t, 3);
    leaf.position.y = e * 3.3;
  }

  ctx.register(leaf, {
    id: 'meridian-gate',
    label: 'the meridian gate',
    range: 4,
    enabled: () => !open,
    use: () => ctx.ui.toast('Set into the gate: ' + RING_RULE, '', 'warn'),
  });

  ctx.blockProp(-2.5, cz - 10.5, 0.4, 0.6);
  ctx.blockProp(2.5, cz - 10.5, 0.4, 0.6);

  return { group, open: doOpen, update, leaf };
}

const RING_RULE = '“the three fixed stars that rose within the meridian span, in the order they rose.”';