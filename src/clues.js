/**
 * clues.js — the written world of The Hollow Meridian.
 *
 * Every clue lives here exactly once. It is rendered three ways:
 *   1. as a weathered texture on a prop in 3D   (art/textures.js)
 *   2. as a legible scan in the journal        (core/ui.js)
 *   3. as data for the hint system / objective tracking
 *
 * The answers are NOT stored next to their clues. Each one has to be
 * derived by the player; `puzzles/*` only knows the solution key.
 */

/* ------------------------------------------------------------------ *
 *  The ten fixed stars engraved on the orrery rings
 * ------------------------------------------------------------------ */
export const STARS = [
  { key: 'osprey',   name: 'The Osprey',   glyph: 'M3 15c3-1 5-4 9-4s6 3 9 4M12 11V6M12 6 9 8M12 6l3 2' },
  { key: 'candle',   name: 'The Candle',   glyph: 'M12 2c1.5 2 2 3 2 4a2 2 0 0 1-4 0c0-1 .5-2 2-4zM8 7h8v13H8zM6 21h12' },
  { key: 'glass',    name: 'The Glass',    glyph: 'M6 3h12M6 21h12M7 3c0 4 5 7 5 9s-5 5-5 9M17 3c0 4-5 7-5 9s5 5 5 9' },
  { key: 'pendulum', name: 'The Pendulum', glyph: 'M12 2v4M5 6h14M12 6v8M8 21a4 4 0 0 0 8 0' },
  { key: 'compass',  name: 'The Compass',  glyph: 'M12 2.5 14.4 9.6 21.5 12 14.4 14.4 12 21.5 9.6 14.4 2.5 12 9.6 9.6z' },
  { key: 'mariner',  name: 'The Mariner',  glyph: 'M12 2.6a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2zM7.5 21l1.2-6.4h6.6L16.5 21M9 14.6 4.6 19M15 14.6 19.4 19' },
  { key: 'lyre',     name: 'The Lyre',     glyph: 'M6.5 3v8a5.5 5.5 0 0 0 11 0V3M7 5c2.2 2.4 3.2 4.8 2 8.4M17 5c-2.2 2.4-3.2 4.8-2 8.4M5 21h14' },
  { key: 'anchor',   name: 'The Anchor',   glyph: 'M12 7.5v13M12 7.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM4.5 12.5a7.5 7.5 0 0 0 15 0M2 12.5h5M17 12.5h5' },
  { key: 'wolf',     name: 'The Wolf',     glyph: 'M4 3.5 8.4 8 6.6 10.2 9.8 12.4 12 10.6 14.2 12.4 17.4 10.2 15.6 8 20 3.5v8.6L15.2 17h-6.4L4 12.1z' },
  { key: 'bell',     name: 'The Bell',     glyph: 'M12 2a5.4 5.4 0 0 0-5.4 5.4v5.2L4.4 16h15.2l-2.2-3.4V7.4A5.4 5.4 0 0 0 12 2zM9.6 18.6a2.4 2.4 0 0 0 4.8 0' },
];

/** Rising azimuth, in degrees, for each star (as engraved on the chart). */
export const STAR_AZIMUTH = {
  osprey: 42, candle: 63, glass: 87, pendulum: 90, compass: 94,
  mariner: 157, lyre: 226, anchor: 271, wolf: 318, bell: 352,
};

/** The meridian span, defined only in the keeper's logbook (Act I). */
export const MERIDIAN_SPAN = { centre: 90, halfWidth: 5 };

/* ------------------------------------------------------------------ *
 *  Clues
 * ------------------------------------------------------------------ *
 *  kind:  'page'  -> printed table/poster, drawn as a canvas
 *         'hand'  -> handwriting, drawn as a canvas
 *         'plate' -> engraved brass, drawn as a canvas
 *         'chart' -> the star chart, drawn as a canvas
 *         'scale' -> the tide gauge, drawn as a canvas
 *  scan:  'tideTable' | 'slate' | 'logbook' | 'stone' | 'fragment'
 *         | 'plateOrrery' | 'starChart' | 'gauge' | 'lensPlate'
 */
export const CLUES = {
  tideTable: {
    id: 'tideTable',
    kind: 'page',
    scan: 'tideTable',
    title: 'Tide Table — Bellrock Sound',
    where: 'Antechamber · west wall, above the waterline',
    finding: 'Pinned above the waterline, curling at the corners.',
    text:
`BELLROCK SOUND · TIDE TABLE
SEASON: MARCH 1889

   DAY      HIGH     LOW    HEIGHT
 Feb 24    03:40   09:58     5.1
 Feb 25    04:33   10:49     5.6
 Feb 26    05:27   11:41     6.0
 Feb 27    06:20   12:33     6.5
 Feb 28    07:14   13:26     6.2
  Mar 1    02:12   08:31     5.4
  Mar 2    03:05   09:22     5.9
  Mar 3    03:58   10:16     6.4
  Mar 4    04:51   11:08     6.8
  Mar 5    05:44   12:00     7.1
  Mar 6    06:42   12:53     7.6

* HEIGHTS AT THE BELL, in fathoms above chart datum.
  THEY ARE NOT THE SUMP. FOR THE SUMP, READ THE GAUGE.`,
  },

  slate: {
    id: 'slate',
    kind: 'hand',
    scan: 'slate',
    title: "Keeper's Slate",
    where: 'Antechamber · on the sill beside the sluice gate',
    finding: 'Chalk, half scrubbed away by salt. Legible in raking light.',
    text:
`THE GATE KEEPS
THREE FIGURES.

  I.    the MONTH of the great tide
  II.   the DEPTH of the sump,
        in fathoms, as the
        GAUGE reads it now
  III.  the LAST figure of the
        minutes past the turn
        of high water

Set them in order.
Do not hurry it.

          — E. M., 1889`,
  },

  logbook: {
    id: 'logbook',
    kind: 'hand',
    scan: 'logbook',
    title: "Keeper's Logbook",
    where: 'Antechamber · the desk under the fallen beam, east side',
    finding: 'Water-swollen, but the ink held.',
    text:
`BELLROCK LIGHT — KEEPER'S LOG

24 Feb.  Wind SW, moderate. Nothing in the sump
         but rain.

26 Feb.  Dredged the lower gallery to the knee.
         The gauge reads true. Trust the brass
         and not my arithmetic.

28 Feb.  Snow on the Sound, thawing fast.

 1 Mar.  Clear and bitter. Sleeve the glass.

 3 Mar.  Water rising all afternoon.

 5 Mar.  Nothing to report.

 6 Mar.  It came higher this season than any day
         of it. I barred the sluice at the turn of
         the tide and let it run. The gate wants
         three figures, the way the last one did.

 7 Mar.  Gate still barred. The meridian span is
         five degrees either side of due east,
         and nothing outside it will pass.`,
  },

  stone: {
    id: 'stone',
    kind: 'hand',
    scan: 'stone',
    title: 'Foundation Stone',
    where: 'Antechamber · the dark corner north-west, under the debris',
    finding: 'Only legible with the lantern held close.',
    requiresLantern: true,
    text:
`HOLLOW MERIDIAN

THIS TOWER WAS BEGUN
MDCCC

— the rest of the line is broken away —`,
  },

  gauge: {
    id: 'gauge',
    kind: 'scale',
    scan: 'gauge',
    title: 'Tide Gauge',
    where: 'Antechamber · the graduated brass plate on the north-east pier',
    finding: 'Old brass, still true. A float rides at the standing water.',
    text:
`GRADUATED IN FATHOMS.

The float rides at the standing water in the
sump and has not moved since the sixth.`,
    // Deliberately does not give the figure. Reading a graduated brass plate
    // against a float is the intended difficulty of this clue; handing the
    // number over in the journal reduced a three-way join to two clues and
    // gave away the middle of the sluice combination for free.
    derived:
      `Roman numerals are counted <i>up</i> from the sill, so the first
       graduation is <b>I</b> and not the first line. Whatever the float is
       resting against is the depth the sump is at <i>now</i>.`,
  },

  orreryPlate: {
    id: 'orreryPlate',
    kind: 'plate',
    scan: 'plateOrrery',
    title: 'Instruction Plate',
    where: 'Gear Gallery · bolted to the foot of the orrery',
    finding: 'Brass, engraved and polished by eight decades of thumbs.',
    text:
`THE MERIDIAN GATE ANSWERS TO THE THREE FIXED
STARS THAT ROSE WITHIN THE MERIDIAN SPAN.

SET THE RINGS IN THE ORDER THEY ROSE.

                             — E. M.`,
  },

  starChart: {
    id: 'starChart',
    kind: 'chart',
    scan: 'starChart',
    title: 'Star Chart',
    where: 'Gear Gallery · the great painted disc, north wall',
    finding: 'A painted ceiling plan, lifted from the dome and rolled.',
    text:
`RISING AZIMUTH — the bearing at which each figure
first clears the horizon, taken the equinox.

The compass shows the meridian span. Only the
stars that rise inside the arc will answer.`,
  },

  fragment: {
    id: 'fragment',
    kind: 'hand',
    scan: 'fragment',
    title: 'Broken Inscription',
    where: 'Gear Gallery · the workbench beneath the tarpaulin',
    finding: 'A wedge of the same grey stone, fits the gap in the foundation stone.',
    text:
`...AND FINISHED
LXXXIX`,
  },

  lensPlate: {
    id: 'lensPlate',
    kind: 'plate',
    scan: 'lensPlate',
    title: 'Lens Plate',
    where: 'Meridian Dome · beside the vault wheels',
    finding: 'Set into the brass drum of the instrument itself.',
    text:
`SET THE VAULT TO THE YEAR OF COMPLETION,
IN PLAIN FIGURES.

THE NUMERARY OF THIS HOUSE —
    MDCCC = 1800        L = 50
    XXX  =  30         IX =  9

RECORD THE YEAR OF THE INSTRUMENT.
NOT THE YEAR OF THE REIGN.`,
  },
};

/**
 * Objectives drive the (optional) hint system. The index is the stage the
 * player is currently *in*, not the one they just finished.
 */
export const OBJECTIVES = [
  { id: 'sluice', hint: 'The antechamber is ankle-deep and dark, and somebody has written things down in it. The sluice gate is to the north, and it wants three figures.' },
  { id: 'gallery', hint: 'North, and up the long stair. The sump should be down by now.' },
  { id: 'orrery', hint: 'The instrument in the middle of the hall wants three stars, set in three rings, in the order they rose. The plate on the pedestal gives the rule.' },
  { id: 'dome', hint: 'The meridian gate is open. The dome is at the top of the passage beyond it.' },
  { id: 'lens', hint: 'The vault wants a year in plain figures. The inscription is broken in two: one half is on a bench in the gear gallery, the other is a foundation stone in a dark corner of the antechamber.' },
  { id: 'done', hint: 'It is finished.' },
];

/** Solution keys. Never shown to the player. */
export const SOLUTIONS = {
  sluice: [3, 7, 2],
  orrery: [STARS.findIndex((s) => s.key === 'glass'),
           STARS.findIndex((s) => s.key === 'pendulum'),
           STARS.findIndex((s) => s.key === 'compass')],
  lens: [1, 8, 8, 9],
};