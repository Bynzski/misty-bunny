/**
 * player.js — first-person controller.
 * Slow, deliberate, heavy: this is a place you walk through, not sprint around.
 */
import * as THREE from 'three';
import { pointInPoly, circleInPoly } from './walkspace.js';

const EYE = 1.66;
const RADIUS = 0.32;
const MAX_STEP_UP = 0.62;
const MAX_WADE = 0.6;

export function createPlayer(camera, walk, hooks = {}) {
  const P = {
    pos: new THREE.Vector3(0, 0, 5.4),
    yaw: Math.PI,
    pitch: -0.04,
    floorY: 0,
    smoothY: 0,
    bobPhase: 0,
    bobAmount: 0,
    stride: 0,
    speed: 0,
    lanternOn: true,
    wading: 0,
    inDeepWater: false,
    frozen: false,
    eye: EYE,
  };

  const wish = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const shake = { amount: 0, decay: 6 };

  P.shake = (a = 0.5) => { shake.amount = Math.max(shake.amount, a); };

  function waterSurfaceAt(x, z) {
    const w = hooks.waterAt ? hooks.waterAt(x, z) : -1e9;
    return w;
  }

  function canOccupy(x, z, fromY) {
    let ok = false, bestY = null;
    for (let i = walk.polys.length - 1; i >= 0; i--) {
      const r = walk.polys[i];
      if (!circleInPoly(x, z, RADIUS, r.pts)) continue;
      const y = r.floor ? r.floor(x, z) : r.baseY;
      if (y - fromY > MAX_STEP_UP) continue;
      ok = true; bestY = y; break;
    }
    if (!ok) return null;
    if (walk.inBlocker(x, z, RADIUS)) return null;
    const w = waterSurfaceAt(x, z);
    if (w > -1e8 && w - bestY > MAX_WADE) { P.inDeepWater = true; return null; }
    P.inDeepWater = false;
    return bestY;
  }

  P.update = (dt, input, uiOpen) => {
    /* ---------- look ---------- */
    if (input.state.locked && !uiOpen) {
      const m = input.takeMouse();
      const sens = 0.0021;
      P.yaw -= m.x * sens;
      P.pitch -= m.y * sens;
      P.pitch = Math.max(-1.35, Math.min(1.32, P.pitch));
    } else {
      input.takeMouse();
    }
    if (P.yaw > Math.PI) P.yaw -= Math.PI * 2;
    if (P.yaw < -Math.PI) P.yaw += Math.PI * 2;

    /* ---------- move ---------- */
    const active = input.state.locked && !uiOpen && !P.frozen;
    let ix = 0, iz = 0;
    if (active) {
      if (input.down('KeyW')) iz += 1;
      if (input.down('KeyS')) iz -= 1;
      if (input.down('KeyA')) ix -= 1;
      if (input.down('KeyD')) ix += 1;
    }
    const run = active && (input.down('ShiftLeft') || input.down('ShiftRight'));
    wish.set(0, 0, 0);
    if (ix || iz) {
      const l = Math.hypot(ix, iz);
      ix /= l; iz /= l;
      const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
      // A camera with rotation.y = yaw looks along (-sin yaw, 0, -cos yaw),
      // so that is what "forward" has to be. Negating it here made W walk
      // backwards — invisible to a test that only asked whether the player
      // had climbed a stair, and fatal to a test that asked which way.
      wish.x = ix * cy - iz * sy;
      wish.z = -ix * sy - iz * cy;
    }

    const waterY = waterSurfaceAt(P.pos.x, P.pos.z);
    const depth = waterY > -1e8 ? Math.max(0, waterY - P.floorY) : 0;
    P.wading = depth;

    let target = 2.55;
    if (run) target *= 1.72;
    if (depth > 0.05) target *= THREE.MathUtils.clamp(1 - depth / (MAX_WADE * 1.9), 0.3, 1);

    const accel = wish.lengthSq() > 0 ? 13 : 17;
    vel.x = THREE.MathUtils.damp(vel.x, wish.x * target, accel, dt);
    vel.z = THREE.MathUtils.damp(vel.z, wish.z * target, accel, dt);
    if (vel.lengthSq() < 1e-5) { vel.x = 0; vel.z = 0; }

    // axis-separated sliding so corners feel right
    const dx = vel.x * dt, dz = vel.z * dt;
    if (dx) {
      const nx = P.pos.x + dx;
      const y = canOccupy(nx, P.pos.z, P.floorY);
      if (y !== null) { P.pos.x = nx; P.floorY = y; }
      else { P.pos.x = canOccupy(P.pos.x + dx * 0.35, P.pos.z, P.floorY) !== null ? P.pos.x + dx * 0.35 : P.pos.x; }
    }
    if (dz) {
      const nz = P.pos.z + dz;
      const y = canOccupy(P.pos.x, nz, P.floorY);
      if (y !== null) { P.pos.z = nz; P.floorY = y; }
      else { P.pos.z = canOccupy(P.pos.x, P.pos.z + dz * 0.35, P.floorY) !== null ? P.pos.z + dz * 0.35 : P.pos.z; }
    }

    // ground snapping (feet stay glued on stairs)
    const gy = walk.heightAt(P.pos.x, P.pos.z);
    if (gy !== null) P.floorY = gy;
    P.smoothY = THREE.MathUtils.damp(P.smoothY, P.floorY, 11, dt);
    if (Math.abs(P.smoothY - P.floorY) > 1.2) P.smoothY = P.floorY;

    /* ---------- head ---------- */
    const sp = Math.hypot(vel.x, vel.z);
    P.speed = sp;
    P.bobPhase += (sp / (run ? 2.9 : 2.35)) * dt * Math.PI * 2;
    P.bobAmount = THREE.MathUtils.damp(P.bobAmount, sp > 0.15 ? 1 : 0, 7, dt);
    const bobY = Math.sin(P.bobPhase * 2) * 0.035 * P.bobAmount * (run ? 1.5 : 1);
    const bobX = Math.sin(P.bobPhase) * 0.028 * P.bobAmount;
    const roll = -Math.sin(P.bobPhase) * 0.009 * P.bobAmount + ix * 0.0;

    // footfalls
    if (sp > 0.2) {
      P.stride += sp * dt;
      const strideLen = run ? 1.35 : 1.1;
      if (P.stride > strideLen) {
        P.stride = 0;
        hooks.onFootstep?.(depth > 0.05 ? 'water' : run ? 'run' : 'step');
      }
    } else {
      P.stride = Math.min(P.stride, 0.55);
    }

    // camera shake
    shake.amount = Math.max(0, shake.amount - shake.decay * dt * Math.max(0.2, shake.amount));
    const s = shake.amount;
    const shx = (Math.random() - 0.5) * s * 0.05;
    const shy = (Math.random() - 0.5) * s * 0.05;

    camera.position.set(
      P.pos.x + bobX * Math.cos(P.yaw) + shx,
      P.smoothY + P.eye + bobY + shy,
      P.pos.z - bobX * Math.sin(P.yaw),
    );
    camera.rotation.set(P.pitch, P.yaw, roll);
    camera.fov = THREE.MathUtils.damp(camera.fov, run && sp > 1.2 ? 70 : 66, 4, dt);
    camera.updateProjectionMatrix();
    // the interaction raycast runs before the render, so refresh by hand
    camera.updateMatrixWorld(true);
  };

  /** Put the player somewhere specific, without any easing. */
  P.teleport = (x, z, y = null, yaw = Math.PI) => {
    P.pos.set(x, 0, z);
    P.floorY = y !== null ? y : (walk.heightAt(x, z) ?? 0);
    P.smoothY = P.floorY;
    P.yaw = yaw;
    P.pitch = -0.02;
    vel.set(0, 0, 0);
    P.syncCamera();
  };

  /** Snap the camera to the current player state (no bob). */
  P.syncCamera = () => {
    camera.position.set(P.pos.x, P.smoothY + P.eye, P.pos.z);
    camera.rotation.set(P.pitch, P.yaw, 0);
    camera.updateMatrixWorld(true);
  };

  P.eyeWorld = () => new THREE.Vector3(P.pos.x, P.smoothY + P.eye, P.pos.z);

  return P;
}

export { EYE, MAX_WADE };