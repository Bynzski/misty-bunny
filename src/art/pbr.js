/**
 * pbr.js — loads the baked material sets and turns them into three.js
 * materials.
 *
 * The maps come from `tools/blender/materials.py`, which writes three PNGs per
 * material: `_albedo` (sRGB), `_normal` (tangent space, OpenGL +Y), and `_orm`
 * (the glTF packing — R ambient occlusion, G roughness, B metalness). Packing
 * the three scalar maps into one image is the reason this is cheap to ship:
 * a whole material is three files rather than six.
 *
 * Every set is authored at 1 tile = 1 UV unit, so the size you see a stone
 * at is decided entirely by the `uvScale` passed to the geometry builders in
 * `builders.js` — not by per-material repeat factors, which is how textures
 * end up at three different densities in three different rooms.
 */
import * as THREE from 'three';

const FILES = import.meta.glob('./maps/*.png', { eager: true, query: '?url', import: 'default' });

const SETS = ['ashlar', 'flagstone', 'flagstone_wet', 'timber', 'brass', 'iron'];

function url(name) {
  const key = './maps/' + name;
  const u = FILES[key];
  if (!u) throw new Error('missing baked texture: ' + key);
  return u;
}

function load(src, { srgb, aniso }) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(src, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      resolve(t);
    }, undefined, reject);
  });
}

/**
 * Fetch every material set once. Returns a library that `material()` below
 * draws from; the library keeps the original textures so that every material
 * can be given its own repeat without duplicating any pixels.
 */
export async function loadLibrary(renderer) {
  const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const lib = {};
  await Promise.all(SETS.map(async (name) => {
    const [albedo, normal, orm] = await Promise.all([
      load(url(name + '_albedo.png'), { srgb: true, aniso }),
      load(url(name + '_normal.png'), { srgb: false, aniso }),
      load(url(name + '_orm.png'), { srgb: false, aniso }),
    ]);
    lib[name] = { albedo, normal, orm };
  }));
  return lib;
}

/**
 * A MeshStandardMaterial backed by one baked set.
 *
 * `roughness` and `metalness` scale the baked maps rather than replacing
 * them, so `roughness: 0.6` is "a bit glossier than the bake" and not "flat
 * 0.6 everywhere" — the variation baked into the map survives.
 */
export function pbrMaterial(lib, set, {
  repeat = [1, 1],
  color = 0xffffff,
  roughness = 1,
  metalness = 1,
  normalScale = 1,
  envMapIntensity = 1,
  ...rest
} = {}) {
  const s = lib[set];
  if (!s) throw new Error('unknown material set: ' + set);
  const wrap = (t) => {
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  };
  return new THREE.MeshStandardMaterial({
    map: wrap(s.albedo),
    normalMap: wrap(s.normal),
    aoMap: wrap(s.orm),
    roughnessMap: wrap(s.orm),
    metalnessMap: wrap(s.orm),
    color,
    roughness,
    metalness,
    envMapIntensity,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    ...rest,
  });
}