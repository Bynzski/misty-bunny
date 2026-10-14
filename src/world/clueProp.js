/**
 * clueProp.js — turning a clue into a thing you can walk up to and read.
 */
import * as THREE from 'three';
import { box, cyl, framedDoc } from '../art/builders.js';
import { clueCanvas, mulberry32 } from '../art/textures.js';
import { paperMaterial } from '../art/materials.js';
import { CLUES } from '../clues.js';

const cache = new Map();
function matFor(id) {
  if (!cache.has(id)) cache.set(id, paperMaterial(clueCanvas(id)));
  return cache.get(id);
}

/**
 * Register a prop so that reading it copies the clue into the journal.
 * `guard` runs first; returning false refuses the reading (and explains why).
 */
export function registerClue(ctx, root, id, { label, range = 3.0, hint, guard } = {}) {
  const clue = CLUES[id];
  return ctx.register(root, {
    id,
    label: label || clue.title,
    range,
    hint,
    use: () => {
      // the guard is the only thing standing between the player and the page,
      // so it runs before anything else touches the clue
      if (guard && guard() === false) return;
      const fresh = ctx.ui.discover(id);
      ctx.audio.paper();
      if (fresh) {
        ctx.ui.toast(`Copied into the journal — <b>${clue.title}</b>`, 'press J to read it again', 'good');
      }
      ctx.stats.cluesRead++;
      // lift the page off the wall and hold it up to the lantern
      ctx.reader.openReadable(id);
    },
  });
}

/** Framed paper on a wall. */
export function framedSheet(ctx, id, w) {
  const src = clueCanvas(id);
  const h = w * (src.height / src.width);
  const g = framedDoc(matFor(id), ctx.M.wood, w, h);
  // a sheet of glass and a bit of dust
  const dust = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.05, depthWrite: false,
  }));
  dust.position.z = 0.03;
  g.add(dust);
  return g;
}

/** Engraved brass plate on a wall or stand. */
export function brassPlate(ctx, id, w) {
  const src = clueCanvas(id);
  const h = w * (src.height / src.width);
  const tex = new THREE.CanvasTexture(src);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.46, metalness: 0.75, envMapIntensity: 1.5,
  }));
  g.add(face);
  g.add(box(w + 0.06, h + 0.06, 0.045, ctx.M.brassDark, 0, 0, -0.03));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const b = cyl(0.022, 0.022, 0.03, 8, ctx.M.brassBright, sx * (w / 2 - 0.03), sy * (h / 2 - 0.03), 0.03);
    b.rotation.x = Math.PI / 2;
    g.add(b);
  }
  return g;
}

/** A rough slab of grey stone with the inscription on its face. */
export function stoneSlab(ctx, id, { w = 1.5, h = 1.0, seed = 3, thickness = 0.22 } = {}) {
  const g = new THREE.Group();
  const rand = mulberry32(seed);
  const mat = matFor(id);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  face.position.z = thickness / 2 + 0.001;
  g.add(face);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, thickness), ctx.M.wallLow);
  g.add(back);
  // knock the corners off a bit
  for (let i = 0; i < 10; i++) {
    const chip = box(0.1 + rand() * 0.2, 0.08 + rand() * 0.14, thickness + 0.02, ctx.M.wallLow,
      (rand() - 0.5) * w, (rand() - 0.5) * h, 0);
    chip.rotation.set(rand(), rand(), rand());
    g.add(chip);
  }
  // damp stain bleeding up from the base
  const damp = new THREE.Mesh(new THREE.PlaneGeometry(w, h * 0.5), new THREE.MeshBasicMaterial({
    color: 0x2a2c22, transparent: true, opacity: 0.26, depthWrite: false,
  }));
  damp.position.set(0, -h * 0.26, thickness / 2 + 0.004);
  g.add(damp);
  return g;
}

/**
 * The great painted star chart.
 *
 * This was a `CircleGeometry`, which was quietly fatal: the drawing is a
 * square canvas, so cropping it to a disc threw away exactly the four corners
 * that the table of rising bearings occupies — and that table is the answer
 * to Act II. It now hangs as a square painted board with the compass rose
 * drawn inside it, so every figure on the page is present in the world and
 * not merely in the journal.
 */
export function chartDisc(ctx, id, r = 3.0) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), matFor(id));
  g.add(face);

  // a heavy brass surround, mitred at the corners
  const t = 0.16;
  for (const [w, h, x, y] of [
    [r * 2 + t * 2, t, 0, r + t / 2],
    [r * 2 + t * 2, t, 0, -r - t / 2],
    [t, r * 2, -r - t / 2, 0],
    [t, r * 2, r + t / 2, 0],
  ]) {
    g.add(box(w, h, 0.16, ctx.M.brassDark, x, y, -0.06));
  }
  // corner bosses
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const b = cyl(0.14, 0.14, 0.12, 10, ctx.M.brassBright, sx * r, sy * r, 0.06);
    b.rotation.x = Math.PI / 2;
    g.add(b);
  }
  // a thin inner bead, so the board reads as mounted rather than floating
  g.add(box(r * 2 + 0.06, r * 2 + 0.06, 0.03, ctx.M.brass, 0, 0, -0.04));

  // it hangs from a chain
  const chain = cyl(0.02, 0.02, 2.6, 6, ctx.M.ironDark, 0, r + 1.3, -0.12);
  g.add(chain);
  return g;
}

/** A lectern: angled top on a turned column. */
export function lectern(ctx, h = 1.05) {
  const g = new THREE.Group();
  g.add(cyl(0.26, 0.32, 0.08, 16, ctx.M.brassDark, 0, 0.04, 0));
  g.add(cyl(0.055, 0.07, h, 12, ctx.M.brassDark, 0, h / 2, 0));
  const top = box(0.62, 0.035, 0.44, ctx.M.brass, 0, h, 0);
  top.rotation.x = -0.42;
  g.add(top);
  const lip = box(0.62, 0.05, 0.03, ctx.M.brassDark, 0, h + 0.085, -0.2);
  lip.rotation.x = -0.42;
  g.add(lip);
  return g;
}