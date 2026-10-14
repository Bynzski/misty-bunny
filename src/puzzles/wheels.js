/**
 * wheels.js — the brass odometer wheels used by both combination locks.
 * Ten digits around a drum; a bezel shows whichever one faces the player.
 */
import * as THREE from 'three';
import { box, torus, cyl } from '../art/builders.js';
import { digitTexture } from '../art/textures.js';

const digitCache = new Map();
function digitMat(n) {
  if (!digitCache.has(n)) digitCache.set(n, digitTexture(n));
  return digitCache.get(n);
}

export function makeDigitWheel(M, {
  digits = 10, radius = 0.175, faceW = 0.135, faceH = 0.15, depth = 0.3, bezel = true,
} = {}) {
  const g = new THREE.Group();
  const drum = new THREE.Group();
  g.add(drum);

  const core = cyl(radius * 0.98, radius * 0.98, depth, 28, M.ironDark);
  core.rotation.x = Math.PI / 2;
  drum.add(core);

  const step = (Math.PI * 2) / digits;
  for (let i = 0; i < digits; i++) {
    const a = i * step;
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(faceW, faceH),
      new THREE.MeshStandardMaterial({ map: digitMat(i), roughness: 0.7, metalness: 0.1 }),
    );
    p.position.set(Math.sin(a) * (radius + 0.002), 0, Math.cos(a) * (radius + 0.002));
    p.rotation.y = a;
    drum.add(p);
  }
  // brass rims either side of the digit band
  for (const z of [-depth / 2 - 0.012, depth / 2 + 0.012]) {
    const r = torus(radius + 0.012, 0.016, M.brass, 28, 7);
    r.position.z = z;
    drum.add(r);
  }

  if (bezel) {
    const bw = faceW + 0.07, bh = faceH + 0.07, t = 0.035, zf = depth / 2 + 0.05;
    g.add(box(bw + t * 2, t, 0.06, M.brass, 0, bh / 2, zf));
    g.add(box(bw + t * 2, t, 0.06, M.brass, 0, -bh / 2, zf));
    g.add(box(t, bh, 0.06, M.brass, -bw / 2, 0, zf));
    g.add(box(t, bh, 0.06, M.brass, bw / 2, 0, zf));
    // index notch
    const mark = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 3), M.brassBright);
    mark.rotation.x = Math.PI / 2;
    mark.position.set(0, bh / 2 + 0.05, zf + 0.01);
    g.add(mark);
  }

  let current = 0;
  const setIndex = (i, animated = true) => {
    current = ((i % digits) + digits) % digits;
    const target = -current * step;
    if (!animated) { drum.rotation.y = target; return; }
    // shortest way round
    let from = drum.rotation.y;
    let delta = target - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const t0 = performance.now();
    const dur = 150 + Math.abs(delta) * 60;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      drum.rotation.y = from + delta * e;
      if (k < 1 && drum.parent) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  g.userData.setIndex = setIndex;
  g.userData.getIndex = () => current;
  setIndex(0, false);
  return g;
}

/** Small brass column a wheel sits on, with a knurled cap. */
export function wheelPost(M, h = 0.5, r = 0.05) {
  const g = new THREE.Group();
  g.add(cyl(r, r * 1.25, h, 12, M.brassDark, 0, h / 2, 0));
  g.add(cyl(r * 1.5, r * 1.5, 0.05, 12, M.brass, 0, h + 0.02, 0));
  return g;
}