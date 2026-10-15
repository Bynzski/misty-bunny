/**
 * walkspace.js — the collision model.
 *
 * The level is a union of convex polygons, each with a floor height
 * function. The player is a circle in plan; movement slides along polygon
 * edges and cannot climb more than `maxStep` in one move.
 */

export function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, zi = pts[i].z;
    const xj = pts[j].x, zj = pts[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function createWalkSpace() {
  /** @type {{pts:any[], baseY:number, floor?:(x:number,z:number)=>number}[]} */
  const polys = [];
  /** @type {{x:number,z:number,hw:number,hd:number,tall?:boolean}[]} */
  const blockers = [];

  const api = {
    polys,
    blockers,

    /** poly: array of {x,z}; baseY: floor height; floor: optional custom function */
    addRegion(pts, baseY = 0, floor = null) {
      polys.push({ pts, baseY, floor });
      return api;
    },

    addBlocker(x, z, hw, hd, tall = true) {
      const b = { x, z, hw, hd, tall };
      blockers.push(b);
      return b;
    },

    /**
     * Drop a blocker added earlier.
     *
     * Gates are blockers until they are open and then they are not, and the
     * sluice learned that the hard way: its blocker was pushed once at build
     * time and never came out, so the passage stayed sealed after the gate had
     * risen — the player walked into an invisible wall two thirds of a metre
     * short of the trench with the leaf clear overhead. `addBlocker` hands the
     * blocker back so it can be removed again by reference.
     */
    removeBlocker(b) {
      const i = blockers.indexOf(b);
      if (i < 0) return false;
      blockers.splice(i, 1);
      return true;
    },

    /** Register every `userData.blocker` found beneath `root`. */
    addPropBlockers(root) {
      root.traverse((o) => {
        const b = o.userData && o.userData.blocker;
        if (!b) return;
        const p = new THREE_V3Like(o);
        blockers.push({ x: p.x, z: p.z, hw: b.hw, hd: b.hd, tall: b.tall !== false });
      });
      return api;
    },

    heightAt(x, z) {
      // later regions win, so overlaps resolve to the most specific
      for (let i = polys.length - 1; i >= 0; i--) {
        const r = polys[i];
        if (pointInPoly(x, z, r.pts)) return r.floor ? r.floor(x, z) : r.baseY;
      }
      return null;
    },

    regionAt(x, z) {
      for (let i = polys.length - 1; i >= 0; i--) {
        if (pointInPoly(x, z, polys[i].pts)) return polys[i];
      }
      return null;
    },

    inBlocker(x, z, radius = 0.3) {
      for (const b of blockers) {
        if (Math.abs(x - b.x) < b.hw + radius && Math.abs(z - b.z) < b.hd + radius) return b;
      }
      return null;
    },

    walkableAt(x, z, radius = 0.3) {
      // the circle must be fully inside at least one region
      for (let i = polys.length - 1; i >= 0; i--) {
        if (circleInPoly(x, z, radius, polys[i].pts)) return true;
      }
      return false;
    },
  };

  return api;
}

/** A cheap "is the whole circle inside" test: sample 8 offset points. */
export function circleInPoly(x, z, r, pts) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (!pointInPoly(x + Math.cos(a) * r, z + Math.sin(a) * r, pts)) return false;
  }
  return true;
}

/* Tiny helper so addPropBlockers doesn't need three.js imported here. */
class THREE_V3Like {
  constructor(o) {
    o.updateWorldMatrix(true, false);
    const p = new (o.position.constructor)();
    p.setFromMatrixPosition(o.matrixWorld);
    this.x = p.x; this.z = p.z;
  }
}