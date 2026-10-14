/**
 * input.js — keyboard + pointer-lock mouse.
 */
export function createInput(canvas, { onLockChange } = {}) {
  const keys = new Set();
  const pressed = new Set();          // edge-triggered, cleared each frame
  const state = {
    locked: false,
    mouseDX: 0,
    mouseDY: 0,
    enabled: true,
  };

  const CODE_ALIASES = {
    ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD',
  };

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const c = CODE_ALIASES[e.code] || e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Tab'].includes(c)) e.preventDefault();
    keys.add(c);
    pressed.add(c);
  });
  addEventListener('keyup', (e) => {
    keys.delete(CODE_ALIASES[e.code] || e.code);
  });
  addEventListener('blur', () => keys.clear());

  canvas.addEventListener('click', () => {
    if (state.enabled && !state.locked) canvas.requestPointerLock?.();
  });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) { keys.clear(); relockAttempts = 0; }
    onLockChange?.(state.locked);
  });

  // Chrome refuses a pointer-lock request for about a second and a quarter
  // after an exit, silently. Reading a page exits the lock to free the
  // cursor, so putting the page back a moment later lands squarely inside
  // that window and the mouse look dies with no way to get it back short of
  // clicking. Retry until it takes, then stop.
  let relockAttempts = 0;
  function relock() {
    if (state.locked || relockAttempts >= 8) return;
    relockAttempts++;
    const p = canvas.requestPointerLock?.();
    // the promise rejects when the browser refuses; newer Chrome returns one
    if (p && typeof p.catch === 'function') p.catch(() => {});
    setTimeout(relock, 180);
  }

  addEventListener('mousemove', (e) => {
    if (!state.locked || !state.enabled) return;
    state.mouseDX += e.movementX || 0;
    state.mouseDY += e.movementY || 0;
  });

  return {
    state,
    keys,
    down: (c) => keys.has(c),
    hit: (c) => pressed.has(c),
    takeMouse() {
      const d = { x: state.mouseDX, y: state.mouseDY };
      state.mouseDX = 0; state.mouseDY = 0;
      return d;
    },
    endFrame() { pressed.clear(); },
    release() { relockAttempts = 8; document.exitPointerLock?.(); },
    requestLock() { relockAttempts = 0; relock(); },
  };
}