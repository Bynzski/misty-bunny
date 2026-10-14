/**
 * builders.js — reusable geometry. Everything in the level is assembled
 * from these; there are no imported models.
 */
import * as THREE from 'three';
import { mulberry32 } from './textures.js';

/* ------------------------------------------------------------------ *
 *  polygons & floors
 * ------------------------------------------------------------------ */
export function circlePoly(cx, cz, r, n = 16, rot = 0) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    p.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
  }
  return p;
}

export function rectPoly(x0, x1, z0, z1) {
  return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}

export function octagonPoly(cx, cz, r, rot = Math.PI / 8) {
  return circlePoly(cx, cz, r, 8, rot);
}

function shapeFromPoly(poly) {
  return new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.z)));
}

export function polyFloor(poly, y, material, uvScale = 0.18) {
  const g = new THREE.ShapeGeometry(shapeFromPoly(poly), 4);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * uvScale, pos.getY(i) * uvScale);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

/** Rescale a geometry's UVs so that 1 unit of UV is `s` metres of surface. */
export function scaleUV(geo, s) {
  if (!s || s === 1) return geo;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  uv.needsUpdate = true;
  return geo;
}

/**
 * How many UV units one metre of surface gets on the prop primitives.
 *
 * Every material is authored at one tile per UV unit, so this number — not a
 * per-material repeat — is what decides whether a barrel's texture reads as
 * brass grain or as camouflage. Three.js primitives ship with UVs spanning 0..1
 * across the whole face no matter how big the face is, which is why a 1 m
 * crate and a 0.2 m knob would otherwise show the same texture at wildly
 * different scales.
 */
const PROP_UV = 0.42;

/**
 * Replace a geometry's UVs with a box projection in its own local space,
 * picking the two axes least aligned with each vertex normal.
 *
 * This is a bake, not a shader trick: it runs once at build time. It seams on
 * curved surfaces, which is invisible at prop scale and a great deal cheaper
 * than a triplanar shader would be for a level this size.
 */
export function worldBoxUV(geo, s = PROP_UV) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz) { u = z; v = y; }
    else if (ny >= nx && ny >= nz) { u = x; v = z; }
    else { u = x; v = y; }
    uv[i * 2] = u * s;
    uv[i * 2 + 1] = v * s;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** A wall ring following `outer`, with `inner` as the hollow. */
export function polyWall(outer, inner, { y0 = 0, height = 4, material, uvScale = 0.35 } = {}) {
  const shape = shapeFromPoly(outer);
  shape.holes.push(new THREE.Path(inner.map((p) => new THREE.Vector2(p.x, -p.z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  // ExtrudeGeometry emits UVs in world units; bring them onto the same
  // metres-per-tile footing as polyFloor and shell.
  scaleUV(g, uvScale);
  const m = new THREE.Mesh(g, material);
  m.position.y = y0;
  m.castShadow = true; m.receiveShadow = true;
  m.userData.uvScale = uvScale;
  return m;
}

/** Solid slab (a chunk of rock) spanning a polygon. */
export function polySlab(poly, { y0 = -1, height = 1, material, uvScale = 0.3 } = {}) {
  const g = new THREE.ExtrudeGeometry(shapeFromPoly(poly), { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  scaleUV(g, uvScale);
  const m = new THREE.Mesh(g, material);
  m.position.y = y0;
  m.receiveShadow = true; m.castShadow = true;
  return m;
}

/** A convex polygon's outward offset by `d`. */
export function offsetPoly(poly, d) {
  return poly.map((p) => {
    const l = Math.hypot(p.x, p.z) || 1;
    return { x: p.x + (p.x / l) * d, z: p.z + (p.z / l) * d };
  });
}

/* ------------------------------------------------------------------ *
 *  primitives
 * ------------------------------------------------------------------ */
export function beveledBox(w, h, d, r = 0.02, steps = 1) {
  const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3);
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y); s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr); s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: d, bevelEnabled: true, bevelThickness: Math.min(rr * 0.8, 0.02), bevelSize: Math.min(rr * 0.8, 0.02), bevelSegments: 1, steps,
  });
  g.translate(0, 0, -d / 2);
  g.computeVertexNormals();
  return worldBoxUV(g);
}

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(worldBoxUV(new THREE.BoxGeometry(w, h, d)), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function cyl(rt, rb, h, seg, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(worldBoxUV(new THREE.CylinderGeometry(rt, rb, h, seg)), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function torus(r, tube, material, seg = 48, rings = 12) {
  const m = new THREE.Mesh(worldBoxUV(new THREE.TorusGeometry(r, tube, rings, seg)), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function sphere(r, material, seg = 20) {
  const m = new THREE.Mesh(worldBoxUV(new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2))), material);
  m.castShadow = true;
  return m;
}

/** A gear wheel as an extruded shape with real teeth. */
export function gearGeometry(radius, teeth, thickness, { toothDepth = radius * 0.13, boreRatio = 0.28, spokes = 6 } = {}) {
  const shape = new THREE.Shape();
  const rIn = radius - toothDepth;
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    // root -> flank -> tip -> flank
    const pts = [
      [a0 + step * 0.06, rIn], [a0 + step * 0.20, radius], [a0 + step * 0.44, radius],
      [a0 + step * 0.58, rIn], [a0 + step * 0.92, rIn],
    ];
    for (const [a, r] of pts) {
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0 && a === pts[0][0]) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
  }
  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * boreRatio, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  // lightening holes between the spokes
  if (radius > 0.45) {
    const rr = radius * 0.55, hr = radius * 0.15;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + step * 0.5;
      const p = new THREE.Path();
      p.absarc(Math.cos(a) * rr, Math.sin(a) * rr, hr, 0, Math.PI * 2, true);
      shape.holes.push(p);
    }
  }

  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelThickness: radius * 0.02, bevelSize: radius * 0.02, bevelSegments: 1,
  });
  g.translate(0, 0, -thickness / 2);
  g.computeVertexNormals();
  return g;
}

/** Stair flight built from real treads. */
export function stairs(x0, x1, zStart, zEnd, yStart, yEnd, material, steps = 14) {
  const g = new THREE.Group();
  const dz = (zEnd - zStart) / steps;
  const dy = (yEnd - yStart) / steps;
  for (let i = 0; i < steps; i++) {
    const z = zStart + dz * (i + 0.5);
    const y = yStart + dy * (i + 1);
    const tread = box(x1 - x0, dy + 0.06, Math.abs(dz) + 0.04, material, (x0 + x1) / 2, y - (dy + 0.06) / 2 + 0.001, z);
    g.add(tread);
    // riser face catches the light
    const riser = box(x1 - x0, Math.abs(dy), 0.06, material, (x0 + x1) / 2, y - Math.abs(dy) / 2, z - Math.sign(dz) * (Math.abs(dz) / 2) - 0.02);
    riser.receiveShadow = true;
    g.add(riser);
  }
  // side stringers
  for (const sx of [x0, x1]) {
    const s = box(0.3, 0.9, Math.abs(zEnd - zStart), material, sx + (sx === x0 ? -0.15 : 0.15), (yStart + yEnd) / 2, (zStart + zEnd) / 2);
    s.rotation.x = Math.atan2(yEnd - yStart, zEnd - zStart);
    s.material = material;
    g.add(s);
  }
  return g;
}

/** Arched doorway opening punched through a wall ring segment. */
export function archFrame(w, h, depth, material, seg = 18) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(-w / 2, h - w / 2);
  shape.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
  shape.lineTo(w / 2, 0);
  const hole = new THREE.Path();
  hole.moveTo(-w / 2 + 0.34, 0);
  hole.lineTo(-w / 2 + 0.34, h - w / 2 - 0.1);
  hole.absarc(0, h - w / 2 - 0.1, w / 2 - 0.34, Math.PI, 0, true);
  hole.lineTo(w / 2 - 0.34, 0);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: seg });
  geo.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return g;
}

/** Free-standing arch (used over passageways that are not in a wall ring). */
export function archway(w, h, depth, material) {
  const outer = new THREE.Shape();
  outer.moveTo(-w / 2 - 0.4, 0);
  outer.lineTo(-w / 2 - 0.4, h);
  outer.lineTo(w / 2 + 0.4, h);
  outer.lineTo(w / 2 + 0.4, 0);
  const hole = new THREE.Path();
  hole.moveTo(-w / 2, 0);
  hole.lineTo(-w / 2, h - w / 2);
  hole.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
  hole.lineTo(w / 2, 0);
  hole.lineTo(-w / 2, 0);
  outer.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Iron pipe following a list of points. */
export function pipe(points, radius, material, seg = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = worldBoxUV(new THREE.TubeGeometry(curve, Math.max(24, points.length * 12), radius, seg, false));
  const m = new THREE.Mesh(g, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function chain(length, material, links = null) {
  const g = new THREE.Group();
  const n = links || Math.max(2, Math.round(length / 0.16));
  for (let i = 0; i < n; i++) {
    const t = torus(0.075, 0.019, material, 12, 6);
    t.position.y = -i * 0.125;
    t.rotation.y = (i % 2) * Math.PI / 2;
    t.rotation.x = Math.PI / 2;
    t.castShadow = true;
    g.add(t);
  }
  return g;
}

/* ------------------------------------------------------------------ *
 *  props
 * ------------------------------------------------------------------ */
export function crate(M, w = 0.8, h = 0.7, d = 0.8, seed = 1) {
  const rand = mulberry32(seed);
  const g = new THREE.Group();
  const body = box(w, h, d, M.woodDark, 0, h / 2, 0);
  body.rotation.y = rand() * 0.02;
  g.add(body);
  const t = 0.06;
  for (const sy of [-h / 2 + t / 2 + 0.01, h / 2 - t / 2 - 0.01]) {
    g.add(box(w + 0.03, t, d + 0.03, M.wood, 0, sy, 0));
  }
  for (const sx of [-w / 2 + 0.03, w / 2 - 0.03]) {
    g.add(box(t, h + 0.03, d + 0.03, M.wood, sx, 0, 0));
  }
  g.userData.blocker = { hw: w / 2 + 0.05, hd: d / 2 + 0.05 };
  return g;
}

export function barrel(M, r = 0.32, h = 0.86) {
  const g = new THREE.Group();
  const b = cyl(r, r * 0.88, h, 16, M.wood);
  b.position.y = h / 2;
  g.add(b);
  for (const yy of [h * 0.18, h * 0.5, h * 0.82]) {
    const ring = torus(r * 1.02, 0.022, M.iron, 20, 6);
    ring.rotation.x = Math.PI / 2; ring.position.y = yy;
    g.add(ring);
  }
  g.userData.blocker = { hw: r + 0.06, hd: r + 0.06 };
  return g;
}

export function ropeCoil(M, r = 0.3) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const t = torus(r - i * 0.055, 0.028, M.rope, 24, 6);
    t.rotation.x = Math.PI / 2;
    t.position.y = i * 0.055;
    t.scale.y = 1 - i * 0.05;
    g.add(t);
  }
  g.userData.blocker = { hw: r + 0.05, hd: r + 0.05 };
  return g;
}

/** A stained-glass window: leaded quarries plus a coloured pane. */
export function stainedWindow(M, w, h, warm = false) {
  const g = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), warm ? M.stainedWarm : M.stained);
  g.add(pane);
  const lead = M.ironDark;
  const cols = Math.max(2, Math.round(w / 0.42));
  const rows = Math.max(2, Math.round(h / 0.42));
  for (let i = 1; i < cols; i++) {
    const b = box(0.025, h, 0.02, lead, -w / 2 + (i * w) / cols, 0, 0.012); g.add(b);
  }
  for (let j = 1; j < rows; j++) {
    const b = box(w, 0.025, 0.02, lead, 0, -h / 2 + (j * h) / rows, 0.012); g.add(b);
  }
  const fr = 0.09;
  g.add(box(w + fr * 2, fr, 0.14, M.wallLow, 0, h / 2 + fr / 2, 0.02));
  g.add(box(w + fr * 2, fr, 0.14, M.wallLow, 0, -h / 2 - fr / 2, 0.02));
  g.add(box(fr, h, 0.14, M.wallLow, -w / 2 - fr / 2, 0, 0.02));
  g.add(box(fr, h, 0.14, M.wallLow, w / 2 + fr / 2, 0, 0.02));
  return g;
}

/** Framed document: paper plane + wooden/brass frame. */
export function framedDoc(paperMaterial_, frameMaterial, w, h) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paperMaterial_);
  g.add(p);
  const t = 0.055;
  g.add(box(w + t * 2, t, 0.05, frameMaterial, 0, h / 2 + t / 2, 0.01));
  g.add(box(w + t * 2, t, 0.05, frameMaterial, 0, -h / 2 - t / 2, 0.01));
  g.add(box(t, h + t * 2, 0.05, frameMaterial, -w / 2 - t / 2, 0, 0.01));
  g.add(box(t, h + t * 2, 0.05, frameMaterial, w / 2 + t / 2, 0, 0.01));
  return g;
}

/** Engraved brass plate with a paper/metal texture face. */
export function engravedPlate(texture, w, h, material) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.5, metalness: 0.72, envMapIntensity: 1.2,
  }));
  g.add(face);
  const back = box(w + 0.07, h + 0.07, 0.05, material, 0, 0, -0.032);
  g.add(back);
  return g;
}

/** Hand lantern: the light you carry. */
export function lantern(M) {
  const g = new THREE.Group();
  g.add(cyl(0.085, 0.1, 0.05, 12, M.brassDark, 0, 0.1, 0));
  g.add(cyl(0.075, 0.085, 0.055, 12, M.brassDark, 0, -0.1, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(box(0.014, 0.19, 0.014, M.brass, Math.cos(a) * 0.062, 0, Math.sin(a) * 0.062));
  }
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.19, 14, 1, true), M.glass);
  g.add(glass);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), M.ember);
  flame.scale.set(1, 1.9, 1);
  flame.position.y = -0.02;
  flame.name = 'flame';
  g.add(flame);
  const bail = torus(0.055, 0.006, M.brass, 16, 5);
  bail.position.y = 0.15; bail.rotation.y = Math.PI / 2;
  g.add(bail);
  return g;
}

/** Hanging oil lamp with a wire bail. */
export function oilLamp(M) {
  const g = new THREE.Group();
  g.add(cyl(0.07, 0.1, 0.05, 12, M.brassDark, 0, 0.17, 0));
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.062, 0.2, 14, 1, true), M.glass);
  glass.position.y = 0.06;
  g.add(glass);
  g.add(cyl(0.09, 0.07, 0.06, 12, M.brassDark, 0, -0.07, 0));
  const wire = torus(0.1, 0.006, M.iron, 16, 5);
  wire.position.y = 0.26; wire.rotation.y = Math.PI / 2;
  g.add(wire);
  return g;
}

/**
 * Sagging sheets of hanging weed.
 *
 * Each blade tapers to a point and is curled so that no two present a flat
 * edge-on silhouette — an untapered quad seen from the side disappears
 * entirely, which is what turned the tide-table kelp into a row of black
 * slashes. `drop` shortens the whole cluster for use as a trim on a prop
 * rather than a curtain in a corner.
 */
export function weedCluster(M, seed = 1, count = 14, drop = 1) {
  const rand = mulberry32(seed);
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const len = (0.28 + rand() * 0.85) * drop;
    const w = 0.022 + rand() * 0.030;
    const curl = (rand() - 0.5) * 0.34;
    const s = new THREE.Shape();
    s.moveTo(-w, 0);
    s.lineTo(w, 0);
    // one side out, the other back, meeting at a tip: a lens, not a rectangle
    s.bezierCurveTo(w * 1.6, -len * 0.34, curl + w, -len * 0.72, curl, -len);
    s.bezierCurveTo(curl - w, -len * 0.72, -w * 1.6, -len * 0.34, -w, 0);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 6), M.kelp);
    m.position.set((rand() - 0.5) * 0.9, 0, (rand() - 0.5) * 0.35);
    m.rotation.y = rand() * Math.PI;
    m.rotation.z = (rand() - 0.5) * 0.5;
    g.add(m);
  }
  return g;
}

/** Brass valve wheel. */
export function valveWheel(M, r = 0.22, spokes = 5) {
  const g = new THREE.Group();
  g.add(torus(r, r * 0.09, M.brass, 32, 10));
  g.add(cyl(r * 0.16, r * 0.16, r * 0.3, 12, M.brassDark));
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const s = box(r * 1.9, r * 0.1, r * 0.07, M.brass, 0, 0, 0);
    s.rotation.z = a;
    g.add(s);
  }
  return g;
}

/** Point the group's -Z at `target`. */
export function lookAtY(obj, target) {
  const dx = target.x - obj.position.x, dz = target.z - obj.position.z;
  obj.rotation.y = Math.atan2(dx, dz);
  return obj;
}

export function faceWall(obj, angleY) { obj.rotation.y = angleY; return obj; }

/**
 * A shaft of light, drawn as a cone that fades out at its silhouette so it
 * reads as haze rather than a plastic tube.
 */
export function lightShaft({ topR, botR, height, color = [0.70, 0.81, 0.98], opacity = 0.10, taper = 1 } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Vector3(...color) },
      uTaper: { value: taper },
    },
    vertexShader: `
      varying vec2 vU; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vU = uv; vP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec2 vU; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform float uTaper;
      void main(){
        // brightest where we look straight through the haze, gone at the edges
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float body = pow(facing, 1.5);
        float along = pow(clamp(vU.y, 0.0, 1.0), uTaper);
        float ends = smoothstep(0.0, 0.14, vU.y) * (1.0 - smoothstep(0.92, 1.0, vU.y));
        float dust = 0.82 + 0.18 * sin(vP.y * 6.0 + uTime * 0.5 + vP.x * 2.4);
        gl_FragColor = vec4(uColor, body * along * ends * uOpacity * dust);
      }`,
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, height, 28, 1, true), mat);
  m.renderOrder = 3;
  return m;
}