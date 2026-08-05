/**
 * Human figures in armour.
 *
 * Every character is a real standing person: feet, shins, knees, thighs, hips,
 * torso, shoulders, articulated arms, neck and head, then armour and clothing
 * laid over the top. Proportions are heroic — about six and a half heads tall —
 * which reads as human while keeping the head large enough to see on a phone.
 *
 * All measurements are fractions of the figure's height `H`, so the same
 * anatomy scales from a footsoldier to a king without redrawing it.
 */

import { G, FINISH, blob } from './rig.js';

const M = FINISH.MATTE;
const T = FINISH.METAL;
const E = FINISH.GLOW;

/** Landmark heights and widths as fractions of total height. */
export const P = {
  sole: 0.012,
  ankle: 0.085,
  knee: 0.300,
  hip: 0.505,
  waist: 0.585,
  chest: 0.705,
  shoulder: 0.788,
  neck: 0.815,
  chin: 0.858,
  headY: 0.918,
  crown: 0.995,

  footX: 0.076,
  hipX: 0.078,
  shoulderX: 0.146,
  headR: 0.083,
};

/** Absolute landmark positions for a figure of height H. */
export function skeleton(H) {
  const s = {};
  for (const [key, value] of Object.entries(P)) s[key] = value * H;
  s.H = H;
  s.elbow = [0.168 * H, 0.618 * H, 0.018 * H];
  s.hand = [0.140 * H, 0.462 * H, 0.098 * H];
  s.shoulderPt = [P.shoulderX * H, P.shoulder * H, 0];
  return s;
}

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export function plinth(rig, pal, radius) {
  rig.add(G.lathe([
    [0, 0], [radius, 0], [radius, 0.03], [radius * 0.9, 0.046],
    [radius * 0.84, 0.056], [0, 0.056],
  ], 20), pal.plateDark, M, {});
  rig.add(G.torus(radius * 0.91, 0.014, 20), pal.trim, T, { p: [0, 0.044, 0], r: [Math.PI / 2, 0, 0] });
}

// ---------------------------------------------------------------------------
// Legs
// ---------------------------------------------------------------------------

/**
 * One armoured leg: pointed sabaton, greave, knee cop, cuisse.
 * `stance` spreads the feet; `back` shifts the leg for a striding pose.
 */
export function legPlate(rig, pal, s, side, options = {}) {
  const H = s.H;
  const x = side * (options.stance === undefined ? P.footX * H : options.stance);
  const z = options.z || 0;
  const hipX = side * P.hipX * H;

  // Sabaton — a long pointed shoe, the giveaway detail of a plate harness.
  rig.add(blob(0.115 * H, 0.062 * H, 0.20 * H), pal.plate, T, { p: [x, s.sole + 0.028 * H, z + 0.035 * H] });
  rig.add(G.cone(0.048 * H, 0.10 * H, 7), pal.plate, T,
    { p: [x, s.sole + 0.030 * H, z + 0.135 * H], r: [Math.PI / 2, 0, 0] });
  rig.add(blob(0.10 * H, 0.075 * H, 0.10 * H), pal.plateDark, T, { p: [x, s.ankle, z] });

  // Greave and knee
  rig.bone(0.052 * H, 0.042 * H, [x, s.knee - 0.02 * H, z + 0.01 * H], [x, s.ankle, z], pal.plate, T, 10);
  rig.add(G.sphere(0.058 * H, 10, 8), pal.plate, T, { p: [x, s.knee, z + 0.012 * H] });
  rig.add(G.cone(0.042 * H, 0.05 * H, 8), pal.trim, T,
    { p: [x, s.knee, z + 0.055 * H], r: [Math.PI / 2, 0, 0] });

  // Cuisse
  rig.bone(0.068 * H, 0.056 * H, [hipX, s.hip, z], [x, s.knee, z + 0.012 * H], pal.plate, T, 10);
  rig.add(G.torus(0.058 * H, 0.012 * H, 12), pal.trim, T,
    { p: [x, s.knee + 0.055 * H, z + 0.008 * H], r: [Math.PI / 2, 0, 0] });
}

/** A leg under a robe — only the boot shows. */
export function legBooted(rig, pal, s, side, options = {}) {
  const H = s.H;
  const x = side * (options.stance === undefined ? P.footX * H : options.stance);
  const z = options.z || 0;
  rig.add(blob(0.105 * H, 0.062 * H, 0.185 * H), pal.leather, M, { p: [x, s.sole + 0.03 * H, z + 0.03 * H] });
  rig.bone(0.05 * H, 0.042 * H, [x, s.knee, z], [x, s.ankle, z], pal.leather, M, 8);
}

// ---------------------------------------------------------------------------
// Torso
// ---------------------------------------------------------------------------

/** Cuirass, faulds and tassets — the armoured core of the figure. */
export function torsoPlate(rig, pal, s, options = {}) {
  const H = s.H;
  const chest = options.chestColor || pal.plate;

  // Waist to chest
  rig.bone(0.128 * H, 0.098 * H, [0, s.chest, 0], [0, s.waist - 0.02 * H, 0], chest, T, 12);
  rig.add(blob(0.256 * H, 0.20 * H, 0.19 * H), chest, T, { p: [0, s.chest - 0.005 * H, 0] });
  // A raised centre ridge, as on a real breastplate
  rig.add(blob(0.06 * H, 0.19 * H, 0.21 * H), chest, T, { p: [0, s.chest - 0.01 * H, 0.012 * H] });
  rig.add(G.torus(0.10 * H, 0.014 * H, 14), pal.trim, T,
    { p: [0, s.waist - 0.01 * H, 0], r: [Math.PI / 2, 0, 0] });
  // Fluting: shallow ribs either side of the centre keel
  for (const side of [1, -1]) {
    rig.add(G.box(0.014 * H, 0.16 * H, 0.02 * H), pal.trim, T,
      { p: [side * 0.06 * H, s.chest - 0.01 * H, 0.096 * H], r: [0, 0, side * 0.1] });
  }

  // Faulds — the flared skirt of overlapping lames
  rig.add(G.cyl(0.10 * H, 0.152 * H, 0.10 * H, 14), chest, T, { p: [0, s.hip + 0.035 * H, 0] });
  rig.add(G.torus(0.148 * H, 0.013 * H, 16), pal.trim, T,
    { p: [0, s.hip - 0.008 * H, 0], r: [Math.PI / 2, 0, 0] });
  // Tassets hanging over the thighs
  for (const side of [1, -1]) {
    rig.add(blob(0.10 * H, 0.13 * H, 0.075 * H), chest, T,
      { p: [side * 0.10 * H, s.hip - 0.045 * H, 0.04 * H], r: [0, 0, side * -0.12] });
  }

  if (options.belt !== false) {
    rig.add(G.torus(0.108 * H, 0.022 * H, 16), pal.leather, M,
      { p: [0, s.waist + 0.01 * H, 0], r: [Math.PI / 2, 0, 0] });
    rig.add(G.box(0.06 * H, 0.05 * H, 0.026 * H), pal.trim, T, { p: [0, s.waist + 0.01 * H, 0.105 * H] });
  }
}

/** Layered pauldrons over the shoulders. */
export function pauldrons(rig, pal, s, options = {}) {
  const H = s.H;
  const color = options.color || pal.plate;
  for (const side of [1, -1]) {
    const x = side * P.shoulderX * H;
    rig.add(blob(0.155 * H, 0.115 * H, 0.165 * H), color, T, { p: [x, s.shoulder, 0] });
    rig.add(blob(0.145 * H, 0.075 * H, 0.155 * H), color, T, { p: [x * 1.06, s.shoulder - 0.045 * H, 0] });
    if (options.spike) {
      rig.add(G.cone(0.032 * H, 0.11 * H, 7), pal.trim, T,
        { p: [x * 1.2, s.shoulder + 0.05 * H, 0], r: [0, 0, side * -0.55] });
    }
    rig.add(G.torus(0.072 * H, 0.011 * H, 12), pal.trim, T,
      { p: [x, s.shoulder + 0.022 * H, 0], r: [0.2, 0, side * 0.5] });
    // Rivets along the leading edge
    for (let i = -1; i <= 1; i++) {
      rig.add(G.sphere(0.011 * H, 6, 5), pal.trim, T,
        { p: [x + side * 0.052 * H, s.shoulder + 0.01 * H + i * 0.035 * H, 0.058 * H] });
    }
  }
}

// ---------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------

/**
 * An articulated arm. `pose` overrides the elbow and hand positions so a
 * character can hold a sword, raise a staff or rest a hand on a belt.
 */
export function armPlate(rig, pal, s, side, pose = {}) {
  const H = s.H;
  const shoulder = [side * P.shoulderX * H, s.shoulder - 0.02 * H, 0];
  const elbow = pose.elbow
    ? [side * pose.elbow[0], pose.elbow[1], pose.elbow[2]]
    : [side * s.elbow[0], s.elbow[1], s.elbow[2]];
  const hand = pose.hand
    ? [side * pose.hand[0], pose.hand[1], pose.hand[2]]
    : [side * s.hand[0], s.hand[1], s.hand[2]];
  const color = pose.color || pal.plate;
  const finish = pose.finish || T;

  rig.bone(0.05 * H, 0.042 * H, shoulder, elbow, color, finish, 9);      // upper arm
  rig.add(G.sphere(0.048 * H, 9, 7), color, finish, { p: elbow });        // couter
  rig.bone(0.044 * H, 0.036 * H, elbow, hand, color, finish, 9);          // forearm
  rig.add(blob(0.062 * H, 0.075 * H, 0.062 * H), pose.glove || pal.plateDark,
    pose.glove ? M : T, { p: hand });                                     // gauntlet
  return { shoulder, elbow, hand };
}

/** A sleeved arm for robed characters — the hand still shows. */
export function armRobed(rig, pal, s, side, pose = {}) {
  const H = s.H;
  const shoulder = [side * P.shoulderX * H, s.shoulder - 0.02 * H, 0];
  const elbow = pose.elbow
    ? [side * pose.elbow[0], pose.elbow[1], pose.elbow[2]]
    : [side * s.elbow[0], s.elbow[1], s.elbow[2]];
  const hand = pose.hand
    ? [side * pose.hand[0], pose.hand[1], pose.hand[2]]
    : [side * s.hand[0], s.hand[1], s.hand[2]];

  rig.bone(0.075 * H, 0.085 * H, shoulder, elbow, pal.cloth, M, 9);
  rig.bone(0.085 * H, 0.062 * H, elbow, hand, pal.cloth, M, 9);
  rig.add(G.torus(0.062 * H, 0.014 * H, 12), pal.trim, T, { p: hand, r: [1.2, 0, 0] });
  rig.add(G.sphere(0.042 * H, 9, 7), pal.skin, M, { p: [hand[0], hand[1] - 0.03 * H, hand[2] + 0.01 * H] });
  return { shoulder, elbow, hand };
}

// ---------------------------------------------------------------------------
// Head and helmets
// ---------------------------------------------------------------------------

export function neckAndHead(rig, pal, s, options = {}) {
  const H = s.H;
  rig.bone(0.05 * H, 0.058 * H, [0, s.chin - 0.02 * H, 0], [0, s.neck - 0.02 * H, 0], pal.skin, M, 8);
  if (options.gorget !== false) {
    rig.add(G.torus(0.082 * H, 0.026 * H, 14), pal.plate, T,
      { p: [0, s.neck + 0.006 * H, 0], r: [Math.PI / 2, 0, 0] });
  }
  rig.add(G.sphere(P.headR * H, 14, 11), pal.skin, M,
    { p: [0, s.headY, 0], s: [1, 1.09, 1.02] });
}

/**
 * A face: brow, eye sockets, eyes with a dark rim so they don't read as bare
 * dots, a nose, and an optional mouth line. Small features, but they are what
 * turn a sphere into a person.
 */
export function face(rig, pal, s, options = {}) {
  const H = s.H;
  const r = P.headR * H;
  const y = options.y === undefined ? s.headY + 0.012 * H : options.y;
  const z = options.z === undefined ? r * 0.86 : options.z;
  const spread = options.spread === undefined ? 0.036 * H : options.spread;
  const size = options.size === undefined ? 0.015 * H : options.size;

  for (const side of [1, -1]) {
    // A recessed socket reads as an eye even before the highlight lands.
    rig.add(blob(size * 3.1, size * 2.3, size * 1.4), pal.plateDark, M,
      { p: [side * spread, y, z * 0.96] });
    rig.add(G.sphere(size, 8, 6), pal.eye, E, { p: [side * spread, y, z] });
  }

  // Nose
  rig.add(blob(0.028 * H, 0.05 * H, 0.045 * H), pal.skin, M,
    { p: [0, y - 0.026 * H, z * 0.98] });

  if (options.brow) {
    for (const side of [1, -1]) {
      rig.add(G.box(0.058 * H, 0.017 * H, 0.026 * H), pal.hair, M,
        { p: [side * spread, y + 0.034 * H, z * 0.93], r: [0, 0, side * -0.16] });
    }
  }
  if (options.mouth) {
    rig.add(G.box(0.05 * H, 0.011 * H, 0.02 * H), pal.plateDark, M,
      { p: [0, y - 0.062 * H, z * 0.94] });
  }
}

/**
 * A closed armet with a visor — the helmet from a real suit of plate.
 * `open` leaves the face visible below a raised visor.
 */
export function helmArmet(rig, pal, s, options = {}) {
  const H = s.H;
  const y = s.headY;
  const r = P.headR * H;

  rig.add(G.sphere(r * 1.16, 14, 11), pal.plate, T, { p: [0, y + 0.006 * H, 0], s: [1, 1.06, 1.1] });
  // Comb along the crown
  rig.add(blob(0.028 * H, 0.05 * H, 0.21 * H), pal.plate, T, { p: [0, y + 0.085 * H, -0.005 * H] });
  rig.add(blob(0.02 * H, 0.03 * H, 0.19 * H), pal.trim, T, { p: [0, y + 0.10 * H, -0.005 * H] });

  if (options.open) {
    // Raised visor sitting above the brow, face showing beneath.
    rig.add(blob(0.20 * H, 0.075 * H, 0.13 * H), pal.plate, T,
      { p: [0, y + 0.072 * H, 0.055 * H], r: [-0.5, 0, 0] });
  } else {
    // Tapered visor with a vision slit and breath holes.
    rig.add(blob(0.185 * H, 0.135 * H, 0.145 * H), pal.plate, T, { p: [0, y - 0.012 * H, 0.048 * H] });
    rig.add(G.cone(0.062 * H, 0.09 * H, 8), pal.plate, T,
      { p: [0, y - 0.03 * H, 0.10 * H], r: [Math.PI / 2, 0, 0] });
    rig.add(G.box(0.155 * H, 0.022 * H, 0.03 * H), pal.plateDark, T, { p: [0, y + 0.026 * H, 0.098 * H] });
    rig.add(G.box(0.13 * H, 0.011 * H, 0.016 * H), pal.glow, E, { p: [0, y + 0.026 * H, 0.108 * H] });
    for (let i = -1; i <= 1; i++) {
      rig.add(G.box(0.012 * H, 0.03 * H, 0.014 * H), pal.plateDark, T,
        { p: [i * 0.035 * H, y - 0.045 * H, 0.105 * H] });
    }
  }

  // Bevor protecting the throat
  rig.add(G.torus(0.088 * H, 0.03 * H, 14), pal.plate, T,
    { p: [0, s.chin - 0.03 * H, 0.006 * H], r: [Math.PI / 2, 0, 0] });
}

/** An open sallet with a nose guard — lighter infantry headgear. */
export function helmSallet(rig, pal, s, options = {}) {
  const H = s.H;
  const y = s.headY;
  const r = P.headR * H;

  rig.add(G.dome(r * 1.18, 14, 8), pal.plate, T, { p: [0, y - 0.005 * H, 0] });
  rig.add(G.torus(r * 1.2, 0.026 * H, 16), pal.plate, T, { p: [0, y + 0.005 * H, 0], r: [Math.PI / 2, 0, 0] });
  // Swept tail at the back
  rig.add(blob(0.17 * H, 0.055 * H, 0.14 * H), pal.plate, T,
    { p: [0, y - 0.008 * H, -0.085 * H], r: [0.55, 0, 0] });
  rig.add(G.torus(r * 1.14, 0.011 * H, 16), pal.trim, T, { p: [0, y + 0.055 * H, 0], r: [Math.PI / 2, 0, 0] });
  // Nose guard down the face
  rig.add(G.box(0.032 * H, 0.10 * H, 0.026 * H), pal.plate, T, { p: [0, y - 0.018 * H, r * 0.98] });
  if (options.crest) {
    rig.add(G.sphere(0.022 * H, 8, 6), pal.trim, T, { p: [0, y + 0.10 * H, 0] });
  }
}

// ---------------------------------------------------------------------------
// Clothing and equipment
// ---------------------------------------------------------------------------

/** A cloak hanging from the shoulders. Lives in its own group so it can sway. */
export function cape(rig, pal, s, options = {}) {
  const H = s.H;
  const top = options.top === undefined ? s.shoulder + 0.02 * H : options.top;
  const bottom = options.bottom === undefined ? 0.10 * H : options.bottom;
  const height = top - bottom;
  rig.add(G.cape(0.17 * H, 0.30 * H, height, options.arc || 2.35, 12), options.color || pal.clothDeep, M,
    { p: [0, (top + bottom) / 2, -0.02 * H], twoSided: true });
  if (options.collar !== false) {
    rig.add(G.torus(0.15 * H, 0.032 * H, 14, 6), options.collarColor || pal.hair, M,
      { p: [0, top - 0.01 * H, -0.02 * H], r: [Math.PI / 2, 0, 0] });
  }
}

/** A tabard or surcoat hanging over the armour. */
export function tabard(rig, pal, s, options = {}) {
  const H = s.H;
  const top = options.top === undefined ? s.chest + 0.04 * H : options.top;
  const bottom = options.bottom === undefined ? s.hip - 0.10 * H : options.bottom;
  const color = options.color || pal.cloth;
  for (const facing of [0, Math.PI]) {
    rig.add(G.cape(0.115 * H, 0.135 * H, top - bottom, 1.5, 8), color, M,
      { p: [0, (top + bottom) / 2, 0], r: [0, facing, 0], twoSided: true });
  }
  rig.add(G.torus(0.126 * H, 0.011 * H, 16), pal.trim, T,
    { p: [0, bottom + 0.008 * H, 0], r: [Math.PI / 2, 0, 0] });
}

/**
 * A longsword held point-down in front of the body, the way a knight stands
 * at rest in an armoury.
 */
export function swordUpright(rig, pal, s, options = {}) {
  const H = s.H;
  const x = options.x === undefined ? 0 : options.x;
  const z = options.z === undefined ? 0.16 * H : options.z;
  const tip = options.tip === undefined ? 0.05 * H : options.tip;
  const guard = options.guard === undefined ? s.waist - 0.02 * H : options.guard;
  const gripTop = guard + 0.13 * H;

  rig.add(G.box(0.036 * H, guard - tip, 0.014 * H), pal.plateDark, T, { p: [x, (guard + tip) / 2, z] });
  rig.add(G.cone(0.026 * H, 0.07 * H, 4), pal.plateDark, T, { p: [x, tip - 0.02 * H, z], r: [Math.PI, 0, 0] });
  rig.add(G.box(0.20 * H, 0.022 * H, 0.026 * H), pal.trim, T, { p: [x, guard, z] });
  rig.add(G.cyl(0.019 * H, 0.019 * H, gripTop - guard, 8), pal.leather, M,
    { p: [x, (guard + gripTop) / 2, z] });
  rig.add(G.sphere(0.032 * H, 9, 7), pal.trim, T, { p: [x, gripTop, z] });
  return { grip: [x, (guard + gripTop) / 2 + 0.02 * H, z] };
}

/** A kite shield strapped to the forearm. */
export function shieldKite(rig, pal, s, side, options = {}) {
  const H = s.H;
  const x = side * (options.x === undefined ? 0.20 * H : options.x);
  const y = options.y === undefined ? s.waist + 0.04 * H : options.y;
  const z = options.z === undefined ? 0.13 * H : options.z;

  rig.add(blob(0.22 * H, 0.28 * H, 0.045 * H), options.color || pal.cloth, M,
    { p: [x, y, z], r: [0, side * 0.3, side * 0.06] });
  rig.add(G.cone(0.11 * H, 0.13 * H, 4), options.color || pal.cloth, M,
    { p: [x, y - 0.155 * H, z], r: [Math.PI, side * 0.3, side * 0.06] });
  rig.add(G.torus(0.06 * H, 0.016 * H, 10), pal.trim, T,
    { p: [x - side * 0.012 * H, y + 0.03 * H, z + 0.022 * H], r: [Math.PI / 2, 0, 0] });
  rig.add(G.sphere(0.03 * H, 8, 6), pal.gem, E, { p: [x - side * 0.014 * H, y + 0.03 * H, z + 0.03 * H] });
}

/** A crown of spikes and gems sitting on the head. */
export function crown(rig, pal, s, options = {}) {
  const H = s.H;
  const points = options.points || 5;
  const radius = options.radius === undefined ? 0.095 * H : options.radius;
  const base = options.base === undefined ? s.crown - 0.045 * H : options.base;
  const tall = options.tall === undefined ? 0.075 * H : options.tall;

  rig.add(G.cyl(radius * 1.02, radius * 1.06, 0.055 * H, 16), pal.trim, T, { p: [0, base + 0.02 * H, 0] });
  rig.add(G.torus(radius * 1.06, 0.012 * H, 18), pal.trimDeep, T,
    { p: [0, base + 0.048 * H, 0], r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const dx = Math.sin(a) * radius;
    const dz = Math.cos(a) * radius;
    const h = i === 0 ? tall * 1.45 : tall;
    rig.add(G.cone(0.026 * H, h, 7), pal.trim, T, { p: [dx, base + 0.05 * H + h / 2, dz], r: [0, a, 0] });
    rig.add(G.sphere(0.019 * H, 8, 6), pal.gem, E, { p: [dx, base + 0.055 * H + h, dz] });
  }
  if (options.jewel !== false) {
    rig.add(G.sphere(0.03 * H, 10, 8), pal.gem, E,
      { p: [0, base + 0.035 * H, radius * 1.02], s: [1, 1.2, 0.7] });
  }
}

export { M, T, E };
