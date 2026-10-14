/**
 * game.js — wiring everything together and running the loop.
 */
import * as THREE from 'three';
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { createPlayer } from './core/player.js';
import { createWalkSpace } from './core/walkspace.js';
import { createInteraction } from './core/interaction.js';
import { createAudio } from './core/audio.js';
import { createUI } from './core/ui.js';
import { createReader } from './core/reader.js';
import { buildMaterials } from './art/materials.js';
import { lantern } from './art/builders.js';
import { buildLevel } from './world/level.js';
import { buildAntechamber } from './world/antechamber.js';
import { buildGallery } from './world/gallery.js';
import { buildDome } from './world/dome.js';
import { buildSluice } from './puzzles/sluice.js';
import { buildOrrery } from './puzzles/orrery.js';
import { buildVault } from './puzzles/lens.js';
import { OBJECTIVES } from './clues.js';
import { clueCanvasUrl, clueCanvas } from './art/textures.js';

const $ = (s) => document.querySelector(s);

export async function createGame() {
  const canvas = $('#scene');
  const params = new URLSearchParams(location.search);
  // ?fx=0 turns off the whole post chain — useful on software rasterisers
  const post = params.get('fx') !== '0';
  const engine = createEngine(canvas, { post });
  const { renderer, scene, camera, lights, stars, vignette, flash, render, countTriangles } = engine;

  const M = await buildMaterials(renderer);

  const audio = createAudio();
  const ui = createUI({ audio });
  const reader = createReader({ audio });
  const input = createInput(canvas, { onLockChange: () => ui.setPrompt(null) });
  const walk = createWalkSpace();
  const I = createInteraction(camera);

  /* -------------------------------------------------------------- *
   *  the shared world context
   * -------------------------------------------------------------- */
  const world = {
    THREE, scene, camera, renderer, M, walk, audio, ui, reader, input, lights,
    level: null,
    player: null,
    spinners: [],
    shafts: [],
    motes: null,
    objective: 0,
    stats: { start: performance.now(), cluesRead: 0, steps: 0 },
    register: (root, spec) => I.add(root, spec),
    blockProp: (x, z, hw, hd) => walk.addBlocker(x, z, hw, hd),
    progress(id) {
      // the objective is the stage you are IN, not the one you just finished
      if (id === 'sluice') world.objective = Math.max(world.objective, 1);  // on up the stair
      if (id === 'gate') world.objective = Math.max(world.objective, 3);    // the dome
      if (id === 'lens') world.objective = Math.max(world.objective, 5);    // finished
    },
    setFlash: (amount, ms) => doFlash(amount, ms),
    finish: () => doEnding(),
    drain: () => {},
  };

  world.level = buildLevel(world);
  world.drain = world.level.drain;

  buildAntechamber(world);
  buildGallery(world);
  buildDome(world);
  const sluice = buildSluice(world);
  const orrery = buildOrrery(world);
  const vault = buildVault(world);

  /* ---------------- the lantern in your hand ---------------- */
  const handLantern = lantern(M);
  handLantern.position.set(0.42, -0.46, -0.62);
  handLantern.scale.setScalar(0.62);
  handLantern.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  camera.add(handLantern);
  const flame = handLantern.getObjectByName('flame');
  lights.lantern.position.set(0.22, -0.16, -0.4);
  lights.lantern.castShadow = false;

  /* ---------------- the player ---------------- */
  const player = createPlayer(camera, walk, {
    waterAt: world.level.waterAt,
    onFootstep: (kind) => audio.footstep(kind),
  });
  world.player = player;
  player.teleport(0.6, 6.4, 0, 0.34);

  /* ---------------- flash & ending ---------------- */
  function doFlash(amount, ms) {
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      flash.style.opacity = String(amount * Math.sin(k * Math.PI));
      if (k < 1) requestAnimationFrame(tick);
      else flash.style.opacity = '0';
    };
    tick();
  }

  let ended = false;
  function doEnding() {
    if (ended) return;
    ended = true;
    const mins = Math.max(1, Math.round((performance.now() - world.stats.start) / 60000));
    $('#endingtitle').textContent = 'The Meridian Opens';
    $('#endingbody').innerHTML = `
      The vault takes the year and the whole instrument breathes in, once, the way a
      held instrument does when the hand finally stops arguing with it.<br><br>
      The lens swings round to the Sound. Somewhere far below, in a chamber that is no
      longer underwater, a sluice gate stands open on three figures that nobody else
      has ever thought to try.<br><br>
      <em>You did not have to solve anything. You only had to read what he wrote down,
      and believe that he meant it.</em>`;
    $('#endingstats').innerHTML = `
      <div><b>${mins}</b>minutes in the tower</div>
      <div><b>${world.stats.cluesRead}</b>pages copied</div>
      <div><b>${Math.round(world.stats.steps)}</b>metres walked</div>`;
    ui.setHud(false);
    input.release();
    $('#ending').classList.add('is-open');
  }

  /* ---------------- prompt ---------------- */
  let promptKey = '';
  function updatePrompt() {
    if (ui.uiOpen || reader.isOpen) { ui.setPrompt(null); promptKey = ''; return; }
    const it = I.update();
    if (!it) { ui.setPrompt(null); promptKey = ''; return; }
    const key = it.id + '|' + it.label;
    if (key !== promptKey) {
      promptKey = key;
      ui.setPrompt(`<b>E</b> ${it.label}${it.hint ? `<span style="opacity:.5"> — ${it.hint}</span>` : ''}`);
    }
  }

  /* ---------------- keys ---------------- */
  function handleKeys() {
    if (input.hit('KeyJ')) {
      if (reader.isOpen) { reader.close(); input.requestLock(); }
      else if (ui.uiOpen === 'journal') { ui.closeJournal(); input.requestLock(); }
      else if (!ui.uiOpen) { input.release(); ui.openJournal(); }
    }
    if (input.hit('KeyF') && !ui.uiOpen) {
      player.lanternOn = !player.lanternOn;
      audio.click();
    }
    if (input.hit('KeyH') && !ui.uiOpen) {
      ui.toast((OBJECTIVES[world.objective] || OBJECTIVES[0]).hint, 'hint', 'warn');
    }
    if (input.hit('KeyM')) ui.toast(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    if (input.hit('Escape')) input.release();

    if (input.hit('KeyE') && !ui.uiOpen && !reader.isOpen && input.state.locked) {
      const it = I.update();
      if (it) { player.shake(0.08); it.use?.(); }
    }
  }

  /* ---------------- loop ---------------- */
  const prev = new THREE.Vector3();
  let time = 0, lastSpace = null, lastNow = performance.now();

  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    time += dt;

    handleKeys();

    prev.copy(player.pos);
    player.update(dt, input, ui.uiOpen || reader.isOpen);
    world.stats.steps += Math.hypot(player.pos.x - prev.x, player.pos.z - prev.z);

    sluice.update(dt);
    orrery.update(dt);
    vault.update(dt, time);
    world.level.updateWater(dt, time);

    for (const s of world.spinners) s.obj.rotation.z += s.speed * dt;
    for (const s of world.shafts) s.mat.uniforms.uTime.value = time;
    if (world.motes) world.motes.rotation.y = time * 0.012;

    /* lantern */
    const flick = 0.84 + Math.sin(time * 11.3) * 0.06 + Math.sin(time * 27.7) * 0.035;
    // bright enough to light a room, dim enough that a page held 60 cm away
    // is not reduced to a white blob
    lights.lantern.intensity = player.lanternOn ? 17 * flick : 0;
    handLantern.visible = player.lanternOn;
    if (flame) {
      flame.scale.set(0.85 + flick * 0.22, 1.6 + flick * 0.55, 0.85 + flick * 0.22);
      flame.material.color.setHSL(0.075, 0.9, 0.5 + flick * 0.14);
    }
    const bob = Math.sin(player.bobPhase) * player.bobAmount;
    handLantern.position.set(0.41 + bob * 0.05, -0.46 + Math.abs(bob) * 0.015, -0.6);
    handLantern.rotation.z = 0.1 - bob * 0.07;

    /* room tone */
    ui.setWaterWarn(player.inDeepWater ? 'Too deep to wade' : '');

    stars.material.uniforms.uTime.value = time;
    stars.rotation.y = time * 0.0022;

    // arriving in the gear hall is itself a stage
    if (world.objective === 1 && player.pos.z < -31) world.objective = 2;

    const space = player.pos.z < -54 ? 'open' : player.pos.z < -30 ? 'hall' : 'small';
    if (space !== lastSpace) { lastSpace = space; audio.setSpace(space); }

    updatePrompt();
    render(dt);
    input.endFrame();
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    const steps = [
      ['cutting the stone', 12],
      ['casting the brass', 32],
      ['setting the courses', 56],
      ['raising the gearwork', 80],
      ['lighting the lamps', 94],
      ['going ashore', 100],
    ];
    const fill = $('#loadfill'), msg = $('#loadmsg');
    for (const [text, pct] of steps) {
      msg.textContent = text + '…';
      fill.style.width = pct + '%';
      await new Promise((r) => setTimeout(r, 80));
    }
    renderer.compile(scene, camera);
    $('#loading').classList.remove('is-open');
    $('#title').classList.add('is-open');
    frame();
  }

  $('#begin').onclick = async () => {
    $('#title').classList.remove('is-open');
    ui.setHud(true);
    vignette.style.opacity = '1';
    await audio.start();
    audio.setSpace('small');
    input.requestLock();
    setTimeout(() => ui.toast('The boat is already out of sight of the tower.',
      'WASD to walk · E to examine · F for the lantern · J for your journal'), 800);
    setTimeout(() => ui.toast('Someone has written things down in this room.'), 8000);
  };

  $('#endcontinue').onclick = () => {
    $('#ending').classList.remove('is-open');
    ui.setHud(true);
    input.requestLock();
  };
  $('#endrestart').onclick = () => location.reload();

  ui.onJournalClose(() => input.requestLock());
  ui.onJournalOpen(() => input.release());
  // the reader has no confirmation step: E or Esc puts the page back
  reader.onClose = () => input.requestLock();
  reader.onOpen = () => input.release();

  boot();

  return { scene, renderer, camera, player, ui, reader, world, audio, input, walk, I, engine,
           clueCanvasUrl, post, countTriangles,
           __canvasOf: clueCanvas,
           parts: { sluice, orrery, vault } };
}