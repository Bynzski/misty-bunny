/**
 * arch.js — masonry. Walls are built edge by edge so that doorways,
 * windows and blind arches are openings in a real wall rather than decals.
 */
import * as THREE from 'three';
import { box } from '../art/builders.js';

function centroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p.x; z += p.z; }
  return { x: x / poly.length, z: z / poly.length };
}

/**
 * Build a wall along every edge of `poly`.
 * openings: [{ edge, at (0..1 along the edge), width, sill, height, arch }]
 */
export function wallRing(poly, {
  height = 4, y0 = 0, material, thickness = 0.62, openings = [],
} = {}) {
  const g = new THREE.Group();
  const c = centroid(poly);

  const place = (p, q, from, len, h, baseY) => {
    if (len <= 0.02 || h <= 0.02) return;
    const dx = q.x - p.x, dz = q.z - p.z;
    const full = Math.hypot(dx, dz);
    const ux = dx / full, uz = dz / full;
    let nx = uz, nz = -ux;
    const mx = p.x + ux * from + (len / 2) * ux;
    const mz = p.z + uz * from + (len / 2) * uz;
    if ((mx - c.x) * nx + (mz - c.z) * nz < 0) { nx = -nx; nz = -nz; }
    const px = p.x + ux * (from + len / 2);
    const pz = p.z + uz * (from + len / 2);
    const m = box(len, h, thickness, material, px + nx * (thickness / 2), y0 + baseY + h / 2, pz + nz * (thickness / 2));
    m.rotation.y = Math.atan2(nx, nz);
    g.add(m);
  };

  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const ops = openings
      .filter((o) => o.edge === i)
      .map((o) => ({ from: (o.at ?? 0.5) * len - o.width / 2, w: o.width, sill: o.sill ?? 0, h: o.height }))
      .filter((o) => o.from >= -0.02 && o.from + o.w <= len + 0.02)
      .sort((a, b) => a.from - b.from);

    let cursor = 0;
    for (const o of ops) {
      place(p, q, cursor, o.from - cursor, height, 0);
      if (o.sill > 0.02) place(p, q, o.from, o.w, o.sill, 0);                 // under a window
      const headY = o.sill + o.h;
      if (height - headY > 0.02) place(p, q, o.from, o.w, height - headY, headY); // lintel wall
      cursor = o.from + o.w;
    }
    place(p, q, cursor, len - cursor, height, 0);
  });

  return g;
}

/**
 * Wall UV density is not configurable, and should not be.
 *
 * `box()` bakes world-scaled UVs, so a wall built from boxes is already at
 * the right texel density for its real size. Scaling the UVs afterwards — as
 * this used to do — stretches the texture on some segments and not others,
 * because each segment is a different size and the same factor cannot be
 * right for all of them. That is where the "one tall brick, four short ones"
 * look on the walls came from.
 */

/** Floor + ceiling slabs for a region. */
export function shell(poly, { y, ceil, material, ceilMaterial, uvScale = 0.22 }) {
  const g = new THREE.Group();
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.z)));
  const fg = new THREE.ShapeGeometry(shape);
  const uv = fg.attributes.uv, pos = fg.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * uvScale, pos.getY(i) * uvScale);
  fg.rotateX(-Math.PI / 2);
  const f = new THREE.Mesh(fg, material);
  f.position.y = y;
  f.receiveShadow = true;
  g.add(f);
  if (ceil != null) {
    const cg = new THREE.ShapeGeometry(shape);
    const cuv = cg.attributes.uv, cpos = cg.attributes.position;
    for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cpos.getX(i) * uvScale, cpos.getY(i) * uvScale);
    cg.rotateX(Math.PI / 2);
    // ShapeGeometry faces +Z. rotateX(+90°) carries that to -Y, so the
    // normals point down and the slab is only drawn from below — which is
    // correct for a ceiling, and was quietly culling the whole thing away.
    const c = new THREE.Mesh(cg, ceilMaterial || material);
    c.position.y = ceil;
    c.receiveShadow = true;
    g.add(c);
  }
  return g;
}

/** A domed ceiling, as a lathe (BackSide so you see it from within). */
export function domeShell(radius, height, material, y = 0, seg = 30) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector2(Math.cos(t * Math.PI * 0.5) * radius, Math.sin(t * Math.PI * 0.5) * height));
  }
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), material.clone());
  m.material.side = THREE.BackSide;
  m.position.y = y;
  m.receiveShadow = true;
  domeUV(m.geometry, 0.6);
  return m;
}

/**
 * Project a lathe of revolution into planar UVs at a constant texel density.
 *
 * A dome or drum is one of the few surfaces in the level that is neither a
 * flat plane nor a box, so neither of the UV schemes in `builders.js` applies.
 * Sweeping by azimuth and dropping the height term tiles stone across it in a
 * way that matches the walls — the alternative, leaving the lathe's own UVs,
 * piles the entire 360 degrees into one tile and gives a smeared spiral.
 */
function domeUV(geo, scale) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv[i * 2] = Math.atan2(z, x) / (Math.PI * 2) * (Math.PI * 2 * Math.hypot(x, z) || 1) * scale;
    uv[i * 2 + 1] = y * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** A dome with a circular hole in the crown. */
export function domeWithOculus(radius, height, holeR, material, y = 0, seg = 30) {
  const pts = [];
  const tEnd = Math.acos(Math.min(0.98, holeR / radius));
  for (let i = 0; i <= 18; i++) {
    const t = tEnd + (i / 18) * (Math.PI * 0.5 - tEnd);
    pts.push(new THREE.Vector2(Math.cos(t) * radius, Math.sin(t) * height));
  }
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), material.clone());
  m.material.side = THREE.BackSide;
  m.position.y = y;
  m.receiveShadow = true;
  domeUV(m.geometry, 0.6);
  return m;
}

/** A stone rim around a circular opening. */
export function wellRim(r, tube, material) {
  const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 40), material);
  t.rotation.x = Math.PI / 2;
  t.castShadow = true; t.receiveShadow = true;
  return t;
}

/** Ribs running up the inside of a dome. */
export function domeRibs(radius, height, count, material, w = 0.16, d = 0.2) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const shape = new THREE.Shape();
    // a curved rib, built in the r/t plane then swept to its bearing
    const steps = 12;
    shape.moveTo(radius, 0);
    for (let s = 1; s <= steps; s++) {
      const t = (s / steps) * Math.PI * 0.5;
      shape.lineTo(Math.cos(t) * radius, Math.sin(t) * height);
    }
    for (let s = steps; s >= 0; s--) {
      const t = (s / steps) * Math.PI * 0.5;
      shape.lineTo(Math.cos(t) * (radius - w), Math.sin(t) * (height - d * 0.0) - 0.0);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, material);
    m.rotation.y = -a;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** Buttress pilaster against a flat wall. */
export function pilaster(w, h, d, material) {
  const g = new THREE.Group();
  g.add(box(w, h, d, material, 0, h / 2, d / 2));
  g.add(box(w * 1.25, 0.16, d * 1.3, material, 0, h - 0.1, d / 2));
  g.add(box(w * 1.35, 0.24, d * 1.45, material, 0, 0.12, d / 2));
  return g;
}