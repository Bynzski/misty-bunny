/**
 * materials.js — the shared palette.
 *
 * The opaque surfaces come from the baked PBR sets in `pbr.js`; the things a
 * material generator cannot bake (water, glass, paper, flame) are still built
 * here as plain shader parameters. One object per look, created once, shared
 * everywhere — a scene with 1,500 geometries should not have 1,500 materials.
 */
import * as THREE from 'three';
import { loadLibrary, pbrMaterial } from './pbr.js';
import { waterNormal } from './textures.js';

export async function buildMaterials(renderer) {
  const lib = await loadLibrary(renderer);

  /* ---------- water: still a live shader, but with a real normal field ----- */
  const wn = waterNormal({ seed: 33 });
  wn.wrapS = wn.wrapT = THREE.RepeatWrapping;
  wn.repeat.set(7, 7);
  wn.anisotropy = 8;

  const M = {
    /* ---- architecture: coursed ashlar over flagstone floors ---- */
    wall: pbrMaterial(lib, 'ashlar', { normalScale: 1.0 }),
    wallLow: pbrMaterial(lib, 'ashlar', { color: 0xbfc4c8, roughness: 0.92, normalScale: 1.0 }),
    // A vault, not a wall: big flat stones with shallow transverse arches.
    // Sampled from the flagstone set but tiled far larger, so it reads as
    // structure overhead rather than as a second floor texture.
    // A vault, not a wall. Ashlar with the courses running the other way and
    // a much coarser tile, so overhead it reads as structure rather than as a
    // second floor.
    ceiling: pbrMaterial(lib, 'ashlar', { repeat: [0.5, 0.5], color: 0x424a52, roughness: 1.0, normalScale: 0.75, envMapIntensity: 0.5 }),
    floorWet: pbrMaterial(lib, 'flagstone_wet', {
      roughness: 0.85, metalness: 0.1, normalScale: 0.7, envMapIntensity: 1.5,
    }),
    floorDry: pbrMaterial(lib, 'flagstone', { roughness: 0.95, normalScale: 0.9 }),

    /* ---- metals ---- */
    brass: pbrMaterial(lib, 'brass', { roughness: 0.95, metalness: 1, normalScale: 0.7, envMapIntensity: 1.6 }),
    brassBig: pbrMaterial(lib, 'brass', { repeat: [2, 2], roughness: 1, metalness: 1, normalScale: 1, envMapIntensity: 1.2 }),
    brassBright: new THREE.MeshStandardMaterial({
      color: 0xd8ad4c, roughness: 0.18, metalness: 1, envMapIntensity: 2.2,
    }),
    brassDark: new THREE.MeshStandardMaterial({
      color: 0x6a5526, roughness: 0.52, metalness: 1, envMapIntensity: 0.9,
    }),
    iron: pbrMaterial(lib, 'iron', { repeat: [1.5, 1.5], roughness: 1, metalness: 1, normalScale: 0.9 }),
    ironDark: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.66, metalness: 0.85 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x5c8a76, roughness: 0.55, metalness: 0.8 }),

    /* ---- organics ---- */
    wood: pbrMaterial(lib, 'timber', { roughness: 0.95, normalScale: 0.8 }),
    woodDark: pbrMaterial(lib, 'timber', { color: 0x9c8878, roughness: 0.95, normalScale: 0.8 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x6b5a3c, roughness: 1 }),
    // Weed is thin and translucent in life, and a fully opaque blade reads as a
  // black slash. Keeping it double-sided, thin and faintly self-lit stops it
  // punching holes in whatever it hangs in front of.
  kelp: new THREE.MeshStandardMaterial({
    color: 0x3d4a2c, roughness: 0.52, metalness: 0.02,
    side: THREE.DoubleSide, transparent: true, opacity: 0.88,
    emissive: 0x0d1408, emissiveIntensity: 0.6,
  }),
    paper: new THREE.MeshStandardMaterial({ color: 0xd8cbaa, roughness: 0.95, side: THREE.DoubleSide }),

    /* ---- glass ---- */
    stained: new THREE.MeshPhysicalMaterial({
      color: 0x2b4a63, roughness: 0.28, metalness: 0, transparent: true, opacity: 0.72,
      emissive: 0x11304a, emissiveIntensity: 0.55, side: THREE.DoubleSide,
    }),
    stainedWarm: new THREE.MeshPhysicalMaterial({
      color: 0x6b3a1c, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.74,
      emissive: 0x4a2208, emissiveIntensity: 0.6, side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x8fb6c9, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.26,
      transmission: 0.6, thickness: 0.3, side: THREE.DoubleSide,
    }),
    lensGlass: new THREE.MeshPhysicalMaterial({
      color: 0xbfe2f0, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.3,
      transmission: 0.85, thickness: 1.2, ior: 1.6, side: THREE.DoubleSide,
      emissive: 0x123040, emissiveIntensity: 0.4,
    }),

    /* ---- water ---- */
    water: new THREE.MeshStandardMaterial({
      color: 0x1d3440, roughness: 0.055, metalness: 0.42,
      normalMap: wn, normalScale: new THREE.Vector2(0.34, 0.34),
      transparent: true, opacity: 0.88, envMapIntensity: 2.0,
    }),

    /* ---- emissive ---- */
    moon: new THREE.MeshBasicMaterial({ color: 0xdfe9f5 }),
    star: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
    ember: new THREE.MeshBasicMaterial({ color: 0xffb96b }),
  };

  M.waterNormalMap = wn;
  return M;
}

/**
 * Clue paper: a texture-backed plane.
 *
 * The page is drawn at a far higher resolution than it is ever seen on a wall,
 * because the player will spend most of their time looking at it in the
 * reading view, not in the world. Slight emissive lift keeps it legible in a
 * dark corner without flattening the lighting.
 */
export function paperMaterial(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return new THREE.MeshStandardMaterial({
    map: t, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
    // just enough lift to keep a page findable in a dark corner; any more and
    // the lantern blows the paper to flat white and the writing disappears
    emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.045,
  });
}