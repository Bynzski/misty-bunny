/**
 * lens.js — Act III. The vault: a year in plain figures, and the light.
 */
import * as THREE from 'three';
import { box, cyl, torus, sphere, pipe } from '../art/builders.js';
import { digitRow } from './wheels.js';
import { SOLUTIONS } from '../clues.js';

export function buildVault(ctx) {
  const { M, scene } = ctx;
  const CX = 0, CZ = -65.5, BASE = 6;

  const g = new THREE.Group();
  g.name = 'vault';
  scene.add(g);

  /* ---------------- drum ---------------- */
  g.add(cyl(2.35, 2.5, 0.3, 24, M.wallLow, CX, BASE + 0.15, CZ));
  g.add(cyl(1.95, 2.15, 0.42, 24, M.wallLow, CX, BASE + 0.51, CZ));
  g.add(cyl(2.0, 2.0, 0.08, 24, M.brassDark, CX, BASE + 0.76, CZ));
  g.add(cyl(1.5, 1.5, 0.16, 24, M.brassBig, CX, BASE + 0.88, CZ));

  // four columns carrying the optic
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = CX + Math.sin(a) * 1.32, z = CZ + Math.cos(a) * 1.32;
    g.add(cyl(0.075, 0.09, 3.4, 12, M.brassDark, x, BASE + 2.66, z));
    g.add(cyl(0.13, 0.13, 0.14, 12, M.brass, x, BASE + 4.4, z));
    // decorative scrolled brace
    const br = pipe([
      [x, BASE + 1.5, z],
      [x * 0.86 + CX * 0.14, BASE + 2.1, z * 0.86 + CZ * 0.14],
      [CX + Math.sin(a) * 0.5, BASE + 2.9, CZ + Math.cos(a) * 0.5],
    ], 0.032, M.brass, 8);
    g.add(br);
  }

  /* ---------------- the wheel housing ---------------- */
  const housing = new THREE.Group();
  housing.position.set(CX, BASE + 1.62, CZ);
  g.add(housing);

  const shell1 = cyl(0.86, 0.86, 1.5, 24, M.brassBig, 0, 0, 0);
  housing.add(shell1);
  for (const y of [0.72, -0.72]) {
    const r = torus(0.88, 0.045, M.brassBright, 32, 8);
    r.rotation.x = Math.PI / 2; r.position.y = y;
    housing.add(r);
  }
  // Four figures, so the plate has to be wide; it already overhangs the
  // housing's drum on either side, and a narrower figure would only make the
  // year harder to read at the one distance the player ever stands at it.
  const facePlate = box(1.66, 0.48, 0.12, M.brass, 0, 0, 0.78);
  housing.add(facePlate);
  housing.add(box(1.74, 0.56, 0.06, M.brassDark, 0, 0, 0.73));

  const wheels = [];
  {
    const row = digitRow(M, 4, { cellW: 0.095, gap: 0.02 });
    row.position.set(0, 0.01, 0.88);
    housing.add(row);
    wheels.push(...row.userData.wheels);
  }

  /* ---------------- the optic ---------------- */
  const optic = new THREE.Group();
  optic.position.set(CX, BASE + 3.5, CZ);
  g.add(optic);

  const cradle = new THREE.Group();
  optic.add(cradle);
  for (let i = 0; i < 7; i++) {
    const y = -0.72 + i * 0.24;
    const r = 1.28 - Math.abs(i - 3) * 0.14;
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.14, 28, 1, false),
      M.lensGlass,
    );
    lens.position.y = y;
    cradle.add(lens);
    const edge = torus(r + 0.01, 0.022, M.brassBright, 36, 7);
    edge.rotation.x = Math.PI / 2; edge.position.y = y;
    cradle.add(edge);
  }
  cradle.add(cyl(0.98, 1.3, 0.2, 28, M.brassBig, 0, -0.9, 0));
  cradle.add(cyl(1.3, 0.98, 0.2, 28, M.brassBig, 0, 0.9, 0));
  optic.add(cyl(0.22, 0.22, 1.0, 16, M.brassDark, 0, 0.4, 0));

  /* ---------------- state ---------------- */
  let values = [0, 0, 0, 0];
  let opened = false;
  let tries = 0;
  const paint = () => wheels.forEach((w, i) => w.userData.setIndex(values[i]));

  /* ---------------- the beam ---------------- */
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vU; varying vec3 vP; void main(){ vU=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: `
      varying vec2 vU; varying vec3 vP; uniform float uOpacity; uniform float uTime;
      void main(){
        float edge = smoothstep(0.0,0.35,vU.x)*smoothstep(1.0,0.65,vU.x);
        float fall = smoothstep(1.0,0.0,vU.y);
        float shimmer = 0.85 + 0.15*sin(vU.y*22.0 - uTime*2.4);
        vec3 c = mix(vec3(0.55,0.78,1.0), vec3(0.92,0.97,1.0), fall);
        gl_FragColor = vec4(c, edge * fall * uOpacity * shimmer);
      }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.55, 13, 32, 1, true), beamMat);
  beam.position.set(CX, BASE + 3.5 + 6.4, CZ);
  beam.visible = false;
  scene.add(beam);

  const core = new THREE.PointLight(0xbfe0ff, 0, 40, 1.4);
  core.position.set(CX, BASE + 4, CZ);
  scene.add(core);

  let beamT = 0;

  /* ---------------- interaction ---------------- */
  function openPanel() {
    ctx.ui.openWheels({
      title: 'The Vault',
      sub: 'SET TO THE YEAR OF COMPLETION, IN PLAIN FIGURES',
      count: [0, 1, 2, 3],
      labels: ['thousands', 'hundreds', 'tens', 'units'],
      values: values.slice(),
      hint: 'The plate beside the wheels gives the numerary of the house.',
      onChange: (v) => { values = v; paint(); },
      onSubmit: (v) => {
        values = v; paint();
        if (values.every((n, i) => n === SOLUTIONS.lens[i])) succeed();
        else {
          tries++;
          ctx.audio.reject();
          ctx.player.shake(0.35);
          if (tries === 3) ctx.ui.toast('Not that year.', 'The plate says to record the year of the instrument, not of the reign', 'warn');
          if (tries === 6) ctx.ui.toast('The brass stays cold.', 'The inscription is broken in two. Both halves exist: one in the dark, one on a bench.', 'warn');
        }
      },
      onClose: () => ctx.input.requestLock(),
    });
  }

  function succeed() {
    if (opened) return;
    opened = true;
    ctx.ui.closeLock();
    ctx.audio.bell(130.8, 0.19);
    ctx.audio.swell(14, 0.17);
    ctx.player.shake(1.1);
    beam.visible = true;
    ctx.progress('lens');
    ctx.setFlash(0.9, 2600);
    setTimeout(() => ctx.ui.toast('The optic takes the light and gives it back straight.', '', 'good'), 1400);
    setTimeout(() => ctx.finish(), 7200);
  }

  function update(dt, time) {
    if (opened && beamT < 1) {
      beamT = Math.min(1, beamT + dt / 3.2);
      beamMat.uniforms.uOpacity.value = beamT * 0.55;
      core.intensity = beamT * 40;
      beam.scale.set(1 + beamT * 0.3, 1 + beamT * 0.55, 1 + beamT * 0.3);
    }
    if (opened) {
      cradle.rotation.y += dt * 0.22;
      optic.rotation.y += dt * 0.08;
    }
    beamMat.uniforms.uTime.value = time;
    optic.position.y = BASE + 3.5 + Math.sin(time * 0.4) * 0.02;
  }

  const hit = cyl(1.1, 1.1, 1.3, 12, new THREE.MeshBasicMaterial({ visible: false }), CX, BASE + 1.62, CZ + 0.9);
  g.add(hit);
  ctx.register(hit, {
    id: 'vault',
    label: 'the vault wheels',
    range: 3.4,
    enabled: () => !opened,
    use: () => { ctx.input.release(); paint(); openPanel(); },
  });

  ctx.register(housing, {
    id: 'vault-done',
    label: 'the vault',
    range: 3.4,
    enabled: () => opened,
    use: () => ctx.ui.toast('Warm now. It has not been warm since the sixth of March.'),
  });

  ctx.blockProp(CX, CZ, 2.6, 2.6);

  return { group: g, update, isOpen: () => opened };
}