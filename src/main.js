import { createGame } from './game.js';
import { SOLUTIONS } from './clues.js';

const boot = async () => {
  try {
    const game = await createGame();
    // handy for poking at the level from the console
    window.__meridian = game;
    // tools/audit.mjs drives the three combination locks through their real
    // panels to reach the solved state, and cannot do that without the keys.
    game.solutions = SOLUTIONS;
  } catch (err) {
    console.error(err);
    const msg = document.querySelector('#loadmsg');
    if (msg) {
      msg.textContent = 'the tower would not open: ' + (err && err.message ? err.message : err);
      msg.style.color = '#b4573f';
    }
  }
};

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();