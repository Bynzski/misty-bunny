/**
 * interaction.js — what am I looking at, and can I use it?
 */
import * as THREE from 'three';

export function createInteraction(camera) {
  const ray = new THREE.Raycaster();
  ray.far = 4.2;
  const centre = new THREE.Vector2(0, 0);
  const items = new Set();

  const I = {
    /**
     * @param {THREE.Object3D} root  any object; the whole subtree becomes clickable
     * @param {object} spec { id, label, range?, hint?, use?, enabled?() }
     *
     * Registering a parent will not steal an interactable already claimed by a
     * child — a small hit-box sitting on a big machine keeps its own behaviour.
     */
    add(root, spec) {
      const item = { root, range: spec.range ?? 3.6, ...spec };
      items.add(item);
      root.traverse((o) => { if (!o.userData.inter) o.userData.inter = item; });
      return item;
    },

    remove(item) {
      items.delete(item);
      item.root.traverse((o) => { if (o.userData.inter === item) delete o.userData.inter; });
    },

    /** @returns {object|null} the focused item */
    update() {
      ray.setFromCamera(centre, camera);
      ray.far = 4.6;
      const scene = camera.parent;
      const hits = ray.intersectObjects(scene.children, true);
      for (const h of hits) {
        // a single malformed vertex anywhere in the level would otherwise
        // poison the sort order and defeat the range check entirely
        if (!Number.isFinite(h.distance) || h.distance > 4.6) continue;
        let o = h.object;
        // NB: never `continue` out of this loop without advancing `o`.
        for (let guard = 0; o && guard < 64; guard++) {
          const it = o.userData && o.userData.inter;
          if (it && (!it.enabled || it.enabled()) && h.distance <= it.range) return it;
          o = o.parent;
        }
      }
      return null;
    },

    get all() { return items; },
  };

  return I;
}