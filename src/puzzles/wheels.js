/**
 * wheels.js — the brass odometer wheels used by both combination locks.
 *
 * Ten figures round a barrel, read through one window in an index shroud.
 *
 * The drum's axis is vertical and the figures run round it the way figures run
 * round a real counter: face one towards you, read it, turn it away. That
 * sounds obvious and it was not what this prop used to be, which is most of why
 * the figures were hard to read. Four things were wrong at once.
 *
 * The axis was not shared. The figures were placed on a circle in the XZ plane
 * — a vertical axis — while the hub and both brass rim rings were built on Z.
 * So the "drum" was a rod pointing at the camera with figure cards wrapped
 * round a horizontal hoop, and the two rims read as two circles facing you
 * rather than two rings above and below the band.
 *
 * The figures were wider than the drum could carry. A card of width w wants a
 * chordal pitch of at least w, and a ten-figure drum's pitch is 2r·sin(π/10),
 * which is 0.618r. The cards were 145 mm and 120 mm on pitches of 117 mm and
 * 96 mm, so every card sheared through its neighbours.
 *
 * The bezel then made it worse instead of hiding it: its window reached 34.5°
 * off the front of a wheel whose figures are 36° apart, which is a window
 * designed to show you the next number as well as this one.
 *
 * And the figures had no floor of their own. The level runs on one key light a
 * room and near-zero ambient, so a plain lit material is worth exactly whatever
 * the room happens to be worth — the figures went to black with the lantern
 * shuttered, and in the other direction the figure and the brass around it hit
 * the same value and the bloom ate the number.
 *
 * So: one sleeve rather than ten cards, a radius derived from the figure so the
 * two cannot disagree, a shroud whose window is narrower than a cell so the
 * figure behind is geometrically unreachable, and a band that holds its own
 * value whatever the light is doing.
 */
import * as THREE from 'three';
import { box, torus, cyl } from '../art/builders.js';
import { digitBandTexture } from '../art/textures.js';

/** How far the shroud stands off the barrel. */
const SHROUD_GAP = 0.012;
/** Section of the brass rim rings that sit at each end of the band. */
const RIM_TUBE = 0.012;

/**
 * How much of one cell the window shows. Narrower than a cell, so the bezel
 * crops the figure in front of it rather than uncovering the figure behind,
 * which sits entirely outside this arc.
 */
const WINDOW_FRACTION = 0.86;

/**
 * The geometry a wheel of this size implies.
 *
 * Exposed because the two places that lay wheels out by hand got the pitch
 * wrong — the four vault wheels had their brass rims interpenetrating — and
 * because deriving the radius from the figure is the whole point: it makes
 * "figure wider than pitch" unrepresentable.
 */
export function wheelMetrics({
  digits = 10, cellW = 0.13, band = null,
} = {}) {
  const step = (Math.PI * 2) / digits;
  const radius = cellW / (2 * Math.sin(Math.PI / digits));
  const height = band ?? cellW * 1.15;
  return {
    digits, step, radius,
    band: height,
    shroudR: radius + SHROUD_GAP,
    // widest thing on the wheel, which is what a row has to be pitched past
    outerR: radius + SHROUD_GAP + RIM_TUBE * 2,
    window: step * WINDOW_FRACTION,
  };
}

const bandCache = new Map();
function bandMaterial(m) {
  const key = `${m.digits}/${Math.round(m.radius * 1000)}/${Math.round(m.band * 1000)}`;
  if (!bandCache.has(key)) {
    const t = digitBandTexture(m.digits, {
      cellPx: 168,
      aspect: (2 * Math.PI * m.radius) / m.digits / m.band,
    });
    bandCache.set(key, new THREE.MeshStandardMaterial({
      map: t,
      // The floor that keeps a figure readable in a shuttered antechamber,
      // and the ceiling that keeps it from competing with the brass when the
      // lantern is right on top of it. Same trick as the clue paper.
      emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.34,
      roughness: 0.46, metalness: 0.16, envMapIntensity: 0.5,
    }));
  }
  return bandCache.get(key);
}

export function makeDigitWheel(M, opts = {}) {
  const m = wheelMetrics(opts);
  const g = new THREE.Group();
  const drum = new THREE.Group();
  g.add(drum);

  /* ---- the barrel ---- */
  const core = cyl(m.radius * 0.985, m.radius * 0.985, m.band * 0.94, 28, M.ironDark);
  drum.add(core);

  // One sleeve for all ten figures. Its UVs run 0..1 round the circumference
  // and the band texture carries the half-cell offset that puts figure i at
  // u = i/digits, so turning the drum by -i·step brings figure i to the window.
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(
      m.radius, m.radius, m.band,
      Math.max(64, m.digits * 14), 1, true,
    ),
    bandMaterial(m),
  );
  drum.add(sleeve);

  /* ---- the shroud: everything except the window ---- */
  // An open cylinder missing one arc of `window` radians, centred on the front.
  // A CylinderGeometry puts theta = 0 on +Z with its axis already vertical,
  // which is the orientation the figures were always drawn in.
  const shroud = new THREE.Mesh(
    new THREE.CylinderGeometry(
      m.shroudR, m.shroudR, m.band + 0.02,
      Math.max(64, m.digits * 14), 1, true,
      m.window / 2, Math.PI * 2 - m.window,
    ),
    M.brassDark,
  );
  g.add(shroud);

  // rims above and below the band, which is where rims on a counter are
  for (const y of [-(m.band / 2 + 0.014), m.band / 2 + 0.014]) {
    const r = torus(m.shroudR + RIM_TUBE, RIM_TUBE, M.brass, 32, 8);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    g.add(r);
  }

  /* ---- the bezel, sized off the window it is framing ---- */
  // Projected width of the window's mouth. The aperture is a shade under it so
  // the bars overlap the cut edge of the shroud rather than leaving it showing.
  //
  // Dark brass, not bright. The figure in the window is pale on near-black, so
  // anything bright immediately around it costs contrast — and this frame is
  // the thing closest to the figure, at arm's length from a hand lantern.
  const aw = m.shroudR * Math.sin(m.window / 2) * 0.97;
  const ah = m.band / 2 + 0.008;
  const t = 0.032;
  const zf = m.shroudR * Math.cos(m.window / 2) + 0.004;
  g.add(box(aw * 2 + t * 2, t, 0.05, M.brassDark, 0, ah + t / 2, zf));
  g.add(box(aw * 2 + t * 2, t, 0.05, M.brassDark, 0, -ah - t / 2, zf));
  g.add(box(t, ah * 2, 0.05, M.brassDark, -aw - t / 2, 0, zf));
  g.add(box(t, ah * 2, 0.05, M.brassDark, aw + t / 2, 0, zf));

  // index notch above the window, marking the place you read at
  const mark = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.056, 3), M.brassBright);
  mark.rotation.x = Math.PI;
  mark.position.set(0, ah + t + 0.036, zf);
  g.add(mark);

  /* ---- state ---- */
  let current = 0;
  const setIndex = (i, animated = true) => {
    current = ((i % m.digits) + m.digits) % m.digits;
    const target = -current * m.step;
    if (!animated) { drum.rotation.y = target; return; }
    // shortest way round
    let from = drum.rotation.y;
    let delta = target - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const t0 = performance.now();
    const dur = 150 + Math.abs(delta) * 60;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      drum.rotation.y = from + delta * e;
      if (k < 1 && drum.parent) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  g.userData.setIndex = setIndex;
  g.userData.getIndex = () => current;
  setIndex(0, false);
  return g;
}

/**
 * A row of wheels, pitched so that no two can touch whatever figure size it is
 * asked for. The pitch is the widest point of a wheel plus a fixed air gap.
 */
export function digitRow(M, count, opts = {}) {
  const { gap = 0.05, ...rest } = opts;
  const m = wheelMetrics(rest);
  const pitch = m.outerR * 2 + gap;
  const g = new THREE.Group();
  const wheels = [];
  for (let i = 0; i < count; i++) {
    const w = makeDigitWheel(M, rest);
    w.position.x = (i - (count - 1) / 2) * pitch;
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.pitch = pitch;
  return g;
}

/** Small brass column a wheel sits on, with a knurled cap. */
export function wheelPost(M, h = 0.5, r = 0.05) {
  const g = new THREE.Group();
  g.add(cyl(r, r * 1.25, h, 12, M.brassDark, 0, h / 2, 0));
  g.add(cyl(r * 1.5, r * 1.5, 0.05, 12, M.brass, 0, h + 0.02, 0));
  return g;
}