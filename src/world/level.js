/**
 * level.js — one continuous space: a flooded antechamber, a stair,
 * the gear gallery, and the dome at the top of the tower.
 */
import * as THREE from 'three';
import { octagonPoly, circlePoly, rectPoly, box, cyl, stairs, archway, stainedWindow, weedCluster } from '../art/builders.js';
import { wallRing, shell, domeShell, domeWithOculus, wellRim, domeRibs, pilaster } from './arch.js';
import { pointInPoly } from '../core/walkspace.js';

/* ------------------------------------------------------------------ *
 *  Plan of the level. Everything derives from these numbers.
 * ------------------------------------------------------------------ */
export const LAYOUT = {
  ante: { poly: octagonPoly(0, 0, 9.5), y: 0, ceil: 7.0, r: 9.5 },
  sluice: { poly: rectPoly(-2.0, 2.0, -15.8, -9.35), topY: 0, botY: -0.95, rampZ: -12.0 },
  stair: { poly: rectPoly(-3.0, 3.0, -30.6, -14.6), y0: -0.95, y1: 6.0, zTop: -15.8, zBot: -30.6 },
  // Reaches 0.8 m past the gallery's south edge (z = -32.80) so the two regions
  // overlap by far more than the player's diameter. At -33.0 it overlapped by
  // 0.20 m and the player could not cross from the landing into the hall.
  // Narrowed to the stair hall's own interior (the side walls are at x = ±2.95)
  // — at ±4.6 it offered the player four metres of walkable floor on each side
  // that was neither floored nor roofed.
  landing: { poly: rectPoly(-2.95, 2.95, -34.0, -29.6), y: 6 },
  gallery: { poly: octagonPoly(0, -42.5, 10.5), y: 6, ceil: 15.6, r: 10.5 },
  // Walkable regions are tested with the player as a circle of radius 0.32, so
  // two regions that merely *touch* leave a seam wider than the player and
  // stop them dead in it. The passage therefore overlaps both the gallery
  // octagon (which ends at z = -52.2) and the dome (which starts at -56.5)
  // rather than meeting them.
  merPass: { poly: rectPoly(-2.3, 2.3, -58.0, -50.0), y: 6 },
  dome: { poly: circlePoly(0, -65.5, 9.0, 20, Math.PI / 20), y: 6, spring: 12, domeR: 9, domeH: 7 },
};

const ANT_CEIL = LAYOUT.ante.ceil;
const WATER_FLOOR = -1.35;

export function buildLevel(ctx) {
  const { scene, M, walk } = ctx;
  const root = new THREE.Group();
  root.name = 'level';
  scene.add(root);
  ctx.root = root;

  /* ---------------- walk regions ----------------
   * Regions are tested with the player as a 0.64 m circle, so two regions that
   * merely *touch* leave a seam the player is stuck in — standing in the room
   * they came from with the next one open in front of them. Every junction on
   * the critical path therefore has to OVERLAP, not meet. The meridian passage
   * below says as much; these are the two junctions that had not been done:
   * the antechamber stopped 0.57 m short of the trench, and the landing
   * overlapped the gallery by 0.20 m. Both left the player wedged, and the
   * second one made the level impossible to finish on foot. */
  const S = LAYOUT.sluice;
  const rampFloor = (x, z) => {
    const t = THREE.MathUtils.clamp((z - S.poly[3].z) / (S.rampZ - S.poly[3].z), 0, 1);
    return THREE.MathUtils.lerp(S.topY, S.botY, t * t * (3 - 2 * t));
  };
  // The overlap has to clear the player's DIAMETER, not its radius. The octagon
  // ends at z = -8.777, so the player stops fitting inside it at z = -8.457;
  // the trench region has to already be accepting them by then, which needs its
  // north edge at z >= -8.14. -8.0 leaves a clear margin, and the floor clamps
  // to y = 0 across the whole overlap so it stays flush with the chamber.
  // Only the WALK region is extended: the ramp geometry still starts at the
  // threshold, or it would poke through the doorway into the room.
  walk.addRegion(rectPoly(S.poly[0].x, S.poly[1].x, S.poly[0].z, -8.0), S.botY, rampFloor);
  // The stair: from the foot of the trench up to the gallery.
  const T = LAYOUT.stair;
  walk.addRegion(T.poly, 0, (x, z) => {
    const t = THREE.MathUtils.clamp((z - T.zTop) / (T.zBot - T.zTop), 0, 1);
    return THREE.MathUtils.lerp(T.y0, T.y1, t);
  });
  walk.addRegion(LAYOUT.ante.poly, LAYOUT.ante.y);
  walk.addRegion(LAYOUT.landing.poly, LAYOUT.landing.y);
  walk.addRegion(LAYOUT.gallery.poly, LAYOUT.gallery.y);
  walk.addRegion(LAYOUT.merPass.poly, LAYOUT.merPass.y);
  walk.addRegion(LAYOUT.dome.poly, LAYOUT.dome.y);

  /* ================= ANTECHAMBER ================= */
  const ante = new THREE.Group(); ante.name = 'antechamber'; root.add(ante);

  ante.add(shell(LAYOUT.ante.poly, {
    y: LAYOUT.ante.y, material: M.floorWet, uvScale: 0.2,
  }));

  // wall ring, with a sluice opening on the north face (edge 5) and a boarded
  // boat door on the south face (edge 1)
  const anteWalls = wallRing(LAYOUT.ante.poly, {
    height: ANT_CEIL, material: M.wall,
    openings: [
      { edge: 5, at: 0.5, width: 4.0, height: 3.4 },
      { edge: 1, at: 0.5, width: 2.6, sill: 0, height: 2.9 },
      { edge: 3, at: 0.34, width: 1.5, sill: 2.0, height: 2.0 },
      { edge: 3, at: 0.7, width: 1.5, sill: 2.0, height: 2.0 },
      { edge: 7, at: 0.3, width: 1.5, sill: 2.0, height: 2.0 },
    ],
  });
  ante.add(anteWalls);

  // ceiling with an oculus
  const anteCeil = domeWithOculus(LAYOUT.ante.r - 0.2, 1.5, 1.65, M.ceiling, ANT_CEIL - 0.4, 30);
  ante.add(anteCeil);
  const rim = wellRim(1.65, 0.22, M.wallLow); rim.position.y = ANT_CEIL - 0.42; ante.add(rim);

  // pilasters around the octagon
  LAYOUT.ante.poly.forEach((p, i) => {
    const a = Math.atan2(p.x, p.z);
    const pil = pilaster(0.7, ANT_CEIL - 0.5, 0.34, M.wallLow);
    pil.position.set(Math.sin(a) * (LAYOUT.ante.r - 0.36), LAYOUT.ante.y, Math.cos(a) * (LAYOUT.ante.r - 0.36));
    pil.rotation.y = a;
    ante.add(pil);
  });

  // stained windows
  const winSpecs = [
    { edge: 3, at: 0.34 }, { edge: 3, at: 0.7 }, { edge: 7, at: 0.3 },
  ];
  winSpecs.forEach((w, k) => {
    const p = LAYOUT.ante.poly[w.edge], q = LAYOUT.ante.poly[(w.edge + 1) % 8];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const px = p.x + (q.x - p.x) * w.at, pz = p.z + (q.z - p.z) * w.at;
    const ang = Math.atan2(px, pz);
    const win = stainedWindow(M, 1.3, 1.8, k === 1);
    win.position.set(px, LAYOUT.ante.y + 3.0, pz);
    win.rotation.y = ang + Math.PI;
    ante.add(win);
    const sill = box(1.7, 0.14, 0.5, M.wallLow, px, LAYOUT.ante.y + 2.0, pz);
    sill.rotation.y = ang; ante.add(sill);
  });

  // a stone stair down into the sump, on the east side (visual)
  {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      g.add(box(1.8, 0.17, 0.34, M.wallLow, 6.0, -0.085 - i * 0.17, 1.4 - i * 0.34));
    }
    ante.add(g);
  }

  /* ---- the boat door on the south wall: boarded from the outside ---- */
  {
    const d = new THREE.Group();
    const p = LAYOUT.ante.poly[1], q = LAYOUT.ante.poly[2];
    const px = (p.x + q.x) / 2, pz = (p.z + q.z) / 2;
    d.position.set(px, 0, pz);
    d.rotation.y = Math.atan2(px, pz);
    for (let i = 0; i < 5; i++) {
      const b = box(3.4, 0.22, 0.12, M.wood, 0, 0.5 + i * 0.62, 0.2 + (i % 2) * 0.03);
      b.rotation.z = (i % 2 ? 1 : -1) * 0.045;
      d.add(b);
    }
    d.add(box(2.6, 2.9, 0.14, M.woodDark, 0, 1.45, 0.28));
    for (let i = 0; i < 3; i++) d.add(box(0.1, 2.9, 0.18, M.iron, -0.9 + i * 0.9, 1.45, 0.3));
    ante.add(d);
    ctx.register(d, {
      id: 'boatdoor', label: 'the boat door',
      use: () => ctx.ui.toast('Boarded from the seaward side. The boatman has your oars.'),
    });
  }

  /* ---- doorway arch into the sluice passage ---- */
  {
    const a = archway(4.0, 3.4, 0.9, M.wallLow);
    a.position.set(0, 0, -8.9);
    ante.add(a);
  }

  /* ================= SLUICE PASSAGE + STAIR ================= */
  const mid = new THREE.Group(); mid.name = 'passage'; root.add(mid);

  // passage shell (a trench cut below the antechamber floor)
  {
    const s = LAYOUT.sluice;
    const g = new THREE.Group();
    const zBot = s.poly[0].z;      // -15.8, the closed end
    const zTop = s.poly[3].z;      // -9.35, the chamber threshold
    const zMid = (zBot + zTop) / 2;
    const len = zTop - zBot;
    for (const sx of [-2.35, 2.35]) {
      g.add(box(0.7, 4.6, len, M.wall, sx, 1.35, zMid));
    }
    g.add(box(4.7, 0.6, len, M.ceiling, 0, 2.6, zMid));
    // the ramp, in seven tilted slabs
    for (let i = 0; i < 7; i++) {
      const t0 = i / 7, t1 = (i + 1) / 7;
      const z0 = THREE.MathUtils.lerp(zTop, s.rampZ, t0);
      const z1 = THREE.MathUtils.lerp(zTop, s.rampZ, t1);
      const y0 = THREE.MathUtils.lerp(s.topY, s.botY, t0 * t0 * (3 - 2 * t0));
      const y1 = THREE.MathUtils.lerp(s.topY, s.botY, t1 * t1 * (3 - 2 * t1));
      const dz = Math.abs(z1 - z0), dy = y1 - y0;
      const seg = Math.hypot(dz, dy);
      const slab = box(4.0, 0.4, seg, M.floorWet, 0, (y0 + y1) / 2 - 0.2, (z0 + z1) / 2);
      slab.rotation.x = -Math.atan2(dy, dz);
      g.add(slab);
      for (const sx of [-2.0, 2.0]) {          // retaining kerbs either side
        const rw = box(0.28, 0.85, seg, M.wallLow, sx, (y0 + y1) / 2 + 0.18, (z0 + z1) / 2);
        rw.rotation.x = -Math.atan2(dy, dz);
        g.add(rw);
      }
    }
    // flat trench floor from the foot of the ramp to the foot of the flight
    g.add(box(4.0, 0.5, s.rampZ - zBot, M.floorWet, 0, s.botY - 0.25, (s.rampZ + zBot) / 2));

    /* The threshold. The chamber floor stops at the wall (z = -8.78) and the
     * first ramp slab starts at the near side of the opening (z = -9.35), which
     * left 0.57 m of nothing between them — and 0.57 m is wider than the seam
     * that stopped the player walking, so the fix that let them through only
     * let them walk out over a hole. The floor is carried through the wall
     * thickness so the doorway has a sill to cross. */
    g.add(box(4.0, 0.5, 0.9, M.floorWet, 0, -0.25, -8.95));

    /* ---- the portal into the stair hall ----
     * This used to be a blank wall across the whole passage at z = -16.1,
     * commented "the closed end". It was written when the sump was a dead end,
     * but the flight beyond begins at z = -15.8, so the wall sat directly
     * across the first tread. Opening the sluice left the player facing solid
     * stone at the bottom of a drained trench, and because collision is driven
     * by the walk regions rather than by geometry they then walked straight
     * through it into the stair — a corridor that could only be crossed by
     * walking into a wall.
     *
     * What belongs here is the junction itself: two piers filling the step
     * between the narrow trench bore and the much wider, much taller hall, and
     * a lintel closing the void between the two ceilings. The opening left
     * between them is 4.0 m by 3.25 m, which is what the player is meant to
     * walk through.
     */
    {
      const trenchInner = 2.0;                 // inner face of the trench bore
      const hallInner = 2.95;                  // inner face of the hall walls
      const piers = hallInner - trenchInner;   // 0.95 of wall to fill each side
      const midX = (hallInner + trenchInner) / 2;
      const D = 0.7;                           // depth of the jamb, into the hall
      for (const sx of [-1, 1]) {
        g.add(box(piers, 4.6, D, M.wall, sx * midX, 1.35, zBot - D / 2));
      }
      // lintel from the top of the trench ceiling up to the hall ceiling
      const lintelBot = 2.9, lintelTop = 7.35;
      g.add(box(hallInner * 2, lintelTop - lintelBot, D, M.wall, 0, (lintelBot + lintelTop) / 2, zBot - D / 2));
      // a shallow relieving band so the head of the opening is not a raw seam
      g.add(box(trenchInner * 2 + 0.5, 0.34, D + 0.16, M.wallLow, 0, 3.07, zBot - (D + 0.16) / 2));
    }
    mid.add(g);
  }

  // stair hall
  {
    const s = LAYOUT.stair;
    const zTop = s.zBot, zBot = s.zTop;     // walked from zBot north to zTop
    const st = stairs(-2.6, 2.6, zBot, zTop, s.y0, s.y1, M.wallLow, 26);
    mid.add(st);
    // a landing where the trench and the flight meet
    mid.add(box(5.2, 0.5, 1.6, M.wallLow, 0, s.y0 - 0.25, zBot - 0.5));

    /* The landing at the HEAD of the flight, which does not exist. The treads
     * stop at about z = -30.0 and the gallery's own floor polygon does not
     * begin until its southern edge at z = -32.80, so the walk region in
     * between spans 2.8 m of nothing. The player crossed the hall mouth
     * walking on air. It reads as a hole only if the light happens to catch
     * the edge, which is why it survived so long. */
    const headZ = -30.1, galleryEdge = -32.798;
    mid.add(box(6.4, 0.5, Math.abs(galleryEdge - headZ) + 0.6,
      M.floorDry, 0, s.y1 - 0.25, (galleryEdge + headZ) / 2));
    for (const sx of [-3.4, 3.4]) {
      const len = Math.hypot(zTop - zBot, s.y1 - s.y0);
      const w = box(0.9, 5.2, len, M.wall, sx, (s.y0 + s.y1) / 2 + 1.7, (zTop + zBot) / 2);
      w.rotation.x = Math.atan2(s.y1 - s.y0, zBot - zTop);
      mid.add(w);
    }
    /* The hall roof, parallel to the side walls.
     *
     * It used to be a flat slab stretched over the whole hall, which looks
     * fine until you notice where the walls go: they lean with the flight, so
     * a flat roof closes the headroom from eight metres at the foot of the
     * stair to 1.2 m at the top — low enough that the player's eye is INSIDE
     * the slab on the landing, and a ray cast upward from there finds nothing
     * at all because the roof is already behind them. */
    {
      const ang = Math.atan2(s.y1 - s.y0, zBot - zTop);
      const len = Math.hypot(zTop - zBot, s.y1 - s.y0);
      const up = new THREE.Vector3(0, Math.cos(ang), Math.sin(ang));      // the walls' own up
      const along = new THREE.Vector3(0, -Math.sin(ang), Math.cos(ang));  // + is downhill
      const base = new THREE.Vector3(0, (s.y0 + s.y1) / 2 + 1.7, (zTop + zBot) / 2);
      const reach = 3.2;                  // extra run, to cover the upper landing
      const roof = box(7.6, 0.6, len + reach, M.ceiling, 0, 0, 0);
      roof.position.copy(base)
        .addScaledVector(up, 2.95)         // clear of the 5.2 m side walls
        .addScaledVector(along, -reach / 2) // lengthened uphill, past the landing
        .addScaledVector(along, -1.24);     // and pulled back, so the low end
      roof.rotation.x = ang;               // stays inside the trench mouth
      mid.add(roof);
    }
  }

  /* ================= GEAR GALLERY ================= */
  const gal = new THREE.Group(); gal.name = 'gallery'; root.add(gal);
  const G = LAYOUT.gallery;

  gal.add(shell(G.poly, { y: G.y, material: M.floorDry, ceil: G.ceil, ceilMaterial: M.ceiling, uvScale: 0.16 }));
  // octagon centred on (0,-42.5): edge 1 is the south wall (the stair),
  // edge 5 the north wall (the meridian gate), edges 3 and 7 east/west.
  gal.add(wallRing(G.poly, {
    height: G.ceil - G.y, y0: G.y, material: M.wall,
    openings: [
      { edge: 1, at: 0.5, width: 4.6, height: 3.6 },     // back down to the stair
      { edge: 5, at: 0.5, width: 4.6, height: 3.6 },     // meridian gate
      { edge: 3, at: 0.26, width: 1.5, sill: 6.2, height: 2.2 },
      { edge: 3, at: 0.74, width: 1.5, sill: 6.2, height: 2.2 },
      { edge: 7, at: 0.22, width: 1.5, sill: 6.6, height: 1.8 },
      { edge: 7, at: 0.78, width: 1.5, sill: 6.6, height: 1.8 },
      { edge: 1, at: 0.12, width: 1.4, sill: 5.4, height: 2.0 },
      { edge: 1, at: 0.88, width: 1.4, sill: 5.4, height: 2.0 },
    ],
  }));

  // Octagon edges, for `octagonPoly(0, -42.5, r, Math.PI / 8)`: vertex i sits
  // at 22.5 deg + 45 deg * i, where angle 0 is +X and 90 deg is +Z. Edge n
  // runs between vertices n and n+1, giving
  //   1 = the stair (south, +Z)     5 = the meridian gate (north, -Z)
  //   3 = west                       7 = east

  // ring beams and a gallery balcony
  for (const yy of [G.y + 4.4, G.y + 8.4]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(G.r - 0.35, 0.16, 10, 64),
      M.iron,
    );
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = Math.PI / 8;
    ring.position.set(0, yy, -42.5);
    gal.add(ring);
  }

  // Dome cap over the gallery shaft. The flat slab from `shell()` sits at
  // G.ceil and the cap springs from just below it, so the two met inside the
  // same centimetre and fought for the depth buffer — which is what produced
  // the dark flicker overhead. The cap now starts above the slab.
  {
    const d = domeShell(G.r - 0.2, 4.6, M.ceiling, G.ceil + 0.02, 26);
    d.position.z = -42.5;
    gal.add(d);
  }

  /* ================= MERIDIAN PASSAGE ================= */
  const mp = LAYOUT.merPass;
  mid.add(box(0.8, 4.0, Math.abs(mp.poly[0].z - mp.poly[3].z), M.wall, -2.75, G.y + 2.0, (mp.poly[0].z + mp.poly[3].z) / 2));
  mid.add(box(0.8, 4.0, Math.abs(mp.poly[0].z - mp.poly[3].z), M.wall, 2.75, G.y + 2.0, (mp.poly[0].z + mp.poly[3].z) / 2));
  mid.add(box(6.3, 0.6, Math.abs(mp.poly[0].z - mp.poly[3].z), M.ceiling, 0, G.y + 4.2, (mp.poly[0].z + mp.poly[3].z) / 2));
  mid.add(box(4.6, 0.5, Math.abs(mp.poly[0].z - mp.poly[3].z), M.floorDry, 0, G.y - 0.25, (mp.poly[0].z + mp.poly[3].z) / 2));

  /* ================= DOME ================= */
  const dgroup = new THREE.Group(); dgroup.name = 'dome'; root.add(dgroup);
  const D = LAYOUT.dome;

  dgroup.add(shell(D.poly, { y: D.y, material: M.floorDry, uvScale: 0.18 }));
  dgroup.add(wallRing(D.poly, {
    height: D.spring - D.y, y0: D.y, material: M.wall,
    openings: [
      // The way in. The dome is a 20-gon, so each wall segment is only 2.81 m
      // long and an opening the width of the 4.7 m meridian passage does not
      // fit inside one of them. wallRing silently drops any opening wider than
      // its segment, which had been sealing this doorway completely: the
      // passage to the vault was solid masonry and the game could only be
      // finished by teleporting. Three adjacent segments carry it instead.
      { edge: 3, at: 0.5, width: 2.78, height: 4.4 },
      { edge: 4, at: 0.5, width: 2.78, height: 4.4 },
      { edge: 5, at: 0.5, width: 2.78, height: 4.4 },
      { edge: 14, at: 0.5, width: 1.8, sill: 3.4, height: 2.8 },
      { edge: 9, at: 0.5, width: 1.8, sill: 3.4, height: 2.8 },
      { edge: 19, at: 0.5, width: 1.8, sill: 3.4, height: 2.8 },
    ],
  }));
  {
    const d = domeWithOculus(D.domeR - 0.15, D.domeH, 1.7, M.ceiling, D.spring, 30);
    d.position.z = -65.5;
    dgroup.add(d);
    const ribs = domeRibs(D.domeR - 0.25, D.domeH, 12, M.wallLow, 0.26, 0.4);
    ribs.position.set(0, D.spring, -65.5);
    dgroup.add(ribs);
    const rim = wellRim(1.7, 0.26, M.wallLow);
    rim.position.set(0, D.spring + D.domeH - 0.05, -65.5);
    dgroup.add(rim);
    // drum below the springing line
    dgroup.add(cyl(D.domeR - 0.15, D.domeR - 0.15, 0.4, 30, M.wallLow, 0, D.spring - 0.2, -65.5));
  }
  // tall windows
  [{ edge: 14 }, { edge: 9 }, { edge: 19 }].forEach((w, k) => {
    const p = D.poly[w.edge], q = D.poly[(w.edge + 1) % 20];
    const px = (p.x + q.x) / 2, pz = (p.z + q.z) / 2;
    const ang = Math.atan2(px, pz + 65.5);
    const win = stainedWindow(M, 1.5, 2.5, k === 1);
    win.position.set(px, D.y + 4.8, pz);
    win.rotation.y = ang + Math.PI;
    dgroup.add(win);
  });

  /* ================= WATER ================= */
  const waterMat = M.water;
  // sized to the flooded part of the level only — the stair hall is dry
  const waterGeo = new THREE.PlaneGeometry(21, 27, 24, 30);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.name = 'water';            // addressable: tools/audit.mjs must see through it
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.26, -3.2);
  water.renderOrder = 2;
  water.receiveShadow = false;
  root.add(water);

  const waterState = { level: 0.26, target: 0.26, visible: true, t: 0 };

  function waterAt(x, z) {
    if (!waterState.visible) return -1e9;
    if (pointInPoly(x, z, LAYOUT.ante.poly) || pointInPoly(x, z, LAYOUT.sluice.poly)) return waterState.level;
    return -1e9;
  }

  function drain() {
    waterState.target = WATER_FLOOR;
    waterState.t = 0.001;
  }

  function updateWater(dt, time) {
    if (waterState.t > 0) {
      waterState.t += dt;
      const k = Math.min(1, waterState.t / 7.5);
      waterState.level = THREE.MathUtils.lerp(0.26, WATER_FLOOR, k * k);
      if (k >= 1) { waterState.visible = false; water.visible = false; }
    }
    water.position.y = waterState.level;
    waterMat.normalMap.offset.x = time * 0.012;
    waterMat.normalMap.offset.y = time * 0.008;
  }

  /* ================= LIGHT PLACEMENT ================= */
  const { lights } = ctx;
  // light bouncing off the standing water, so the chamber is never pitch black
  const sumpGlow = new THREE.PointLight(0x7fa3c4, 13, 13.5, 1.6);
  sumpGlow.position.set(0, 0.55, 0);
  root.add(sumpGlow);
  // and a warm one under the orrery, where the brass throws light back
  const brassGlow = new THREE.PointLight(0xffa758, 8, 13, 1.8);
  brassGlow.position.set(0, G.y + 1.2, -40.6);
  root.add(brassGlow);
  // and a cold one at the far end, so the hall has two temperatures in it
  const coldFill = new THREE.PointLight(0x9cc0e0, 14, 26, 1.6);
  coldFill.position.set(0, G.y + 5.4, -49.5);
  root.add(coldFill);
  lights.antechamber.position.set(0, ANT_CEIL - 0.5, 0);
  lights.antechamber.target.position.set(0, 0, 0);
  lights.antechamber.angle = 0.82;
  lights.antechamber.distance = 24;
  lights.antechamber.penumbra = 0.92;
  lights.gallery.position.set(0, G.y + 2.6, -42.5);
  lights.dome.position.set(0, D.spring + D.domeH - 0.6, -65.5);
  lights.dome.target.position.set(0, D.y, -65.5);
  lights.dome.angle = 0.3;
  lights.dome.distance = 30;

  /* ================= PROP BLOCKERS ================= */
  // handled by each area module via ctx.blockProp()

  return { root, ante, gal, dgroup, mid, water, waterAt, drain, updateWater, waterState };
}

export { pointInPoly };