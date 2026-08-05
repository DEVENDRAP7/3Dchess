/**
 * The cast.
 *
 * Twelve characters — six per army — each a full human figure: articulated
 * legs, plate armour, layered pauldrons, posed arms with gauntlets, a visored
 * helm or crown, and cloth that hangs off them. Built from primitives and
 * merged down to a handful of draw calls each so 32 of them run on a phone.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { Rig, G, FINISH, blob } from './rig.js';
import { PALETTE } from './palette.js';
import {
  P, skeleton, plinth, legPlate, legBooted, torsoPlate, pauldrons,
  armPlate, armRobed, neckAndHead, face, helmArmet, helmSallet,
  cape, tabard, swordUpright, shieldKite, crown,
} from './anatomy.js';

const M = FINISH.MATTE;
const T = FINISH.METAL;
const E = FINISH.GLOW;
const TAU = Math.PI * 2;

/**
 * Working height each character is authored at, and the height it is finally
 * normalised to on the board. Authoring and final size are kept separate so a
 * crown or a lance can be reshaped without every other proportion drifting.
 */
const AUTHOR_HEIGHT = { p: 1.02, n: 1.30, b: 1.20, r: 1.16, q: 1.24, k: 1.32 };
export const PIECE_HEIGHT = { p: 1.02, n: 1.20, b: 1.22, r: 1.12, q: 1.26, k: 1.32 };
export const HEIGHT = AUTHOR_HEIGHT;

// ---------------------------------------------------------------------------
// Pawn — Conscript. A footsoldier in half-plate with spear and shield.
// ---------------------------------------------------------------------------

function buildPawn(rig, pal, side) {
  const H = HEIGHT.p;
  const s = skeleton(H);
  plinth(rig, pal, 0.26);

  legPlate(rig, pal, s, 1, { stance: 0.085 * H });
  legPlate(rig, pal, s, -1, { stance: 0.085 * H });

  torsoPlate(rig, pal, s);
  tabard(rig, pal, s, { color: pal.cloth });
  pauldrons(rig, pal, s);

  // Left arm braces the shield, right arm grips the spear.
  rig.group('armL', [-P.shoulderX * H, s.shoulder, 0]);
  armPlate(rig, pal, s, -1, { elbow: [0.185 * H, 0.60 * H, 0.03 * H], hand: [0.185 * H, 0.50 * H, 0.13 * H] });
  shieldKite(rig, pal, s, -1, { color: pal.cloth, x: 0.255 * H, z: 0.10 * H });

  rig.group('armR', [P.shoulderX * H, s.shoulder, 0]);
  armPlate(rig, pal, s, 1, { elbow: [0.175 * H, 0.61 * H, 0.01 * H], hand: [0.185 * H, 0.52 * H, 0.10 * H] });
  rig.add(G.cyl(0.015 * H, 0.015 * H, 0.78 * H, 7), pal.leather, M,
    { p: [0.205 * H, 0.62 * H, 0.10 * H], r: [0.05, 0, 0.03] });
  rig.add(G.cone(0.034 * H, 0.14 * H, 7), pal.plate, T,
    { p: [0.218 * H, 1.07 * H, 0.122 * H], r: [0.05, 0, 0.03] });
  rig.add(G.torus(0.028 * H, 0.009 * H, 8), pal.trim, T,
    { p: [0.215 * H, 0.99 * H, 0.119 * H], r: [Math.PI / 2, 0, 0] });

  rig.group('head', [0, s.neck, 0]);
  neckAndHead(rig, pal, s);
  if (side === 'w') {
    // The Sunspear's face shows under an open sallet.
    face(rig, pal, s, { brow: true, mouth: true });
    helmSallet(rig, pal, s, { crest: true });
  } else {
    // The Duskblade keeps her visor down; only the eye-slit glows.
    helmSallet(rig, pal, s, { crest: true });
    rig.add(G.box(0.16 * H, 0.038 * H, 0.03 * H), pal.plateDark, T,
      { p: [0, s.headY + 0.012 * H, P.headR * H * 0.92] });
    rig.add(G.box(0.13 * H, 0.014 * H, 0.016 * H), pal.glow, E,
      { p: [0, s.headY + 0.012 * H, P.headR * H * 1.0] });
  }
  // A single brass feather, for luck
  rig.add(G.box(0.018 * H, 0.13 * H, 0.008 * H), pal.trim, T,
    { p: [0.055 * H, s.crown + 0.05 * H, -0.03 * H], r: [-0.35, 0, 0.35] });
}

// ---------------------------------------------------------------------------
// Knight — an armoured rider on a warhorse.
// ---------------------------------------------------------------------------

function buildKnight(rig, pal, side) {
  const H = HEIGHT.n;
  // The rider is a smaller figure sitting on the horse's back.
  const s = skeleton(H * 0.60);
  const seat = 0.50 * H;         // height of the saddle
  plinth(rig, pal, 0.30);

  // --- horse ---
  for (const [x, z] of [[0.115, 0.15], [-0.115, 0.15], [0.115, -0.16], [-0.115, -0.16]]) {
    rig.bone(0.05, 0.036, [x, 0.34, z], [x, 0.075, z], pal.beast, M, 8);
    rig.add(blob(0.07, 0.06, 0.085), pal.plateDark, M, { p: [x, 0.05, z] });
    rig.add(G.torus(0.045, 0.012, 10), pal.trim, T, { p: [x, 0.15, z], r: [Math.PI / 2, 0, 0] });
  }
  rig.add(blob(0.26, 0.27, 0.52), pal.beast, M, { p: [0, 0.44, -0.02] });
  rig.add(blob(0.245, 0.24, 0.26), pal.beast, M, { p: [0, 0.45, 0.16] });
  // Caparison
  rig.add(G.cyl(0.245, 0.28, 0.26, 14, true), pal.cloth, M, { p: [0, 0.36, -0.02], s: [1, 1, 1.5] });
  rig.add(G.torus(0.278, 0.018, 16), pal.trim, T,
    { p: [0, 0.235, -0.02], r: [Math.PI / 2, 0, 0], s: [1, 1.5, 1] });
  rig.add(blob(0.23, 0.09, 0.28), pal.leather, M, { p: [0, seat + 0.02, -0.05] });

  // Neck and mane
  rig.bone(0.115, 0.085, [0, 0.60, 0.14], [0, 0.80, 0.26], pal.beast, M, 10);
  for (let i = 0; i < 5; i++) {
    rig.add(G.box(0.018, 0.09, 0.06), pal.hair, M,
      { p: [0, 0.62 + i * 0.05, 0.10 - i * 0.028], r: [0.5, 0, 0] });
  }

  // Head — the silhouette that says "knight"
  rig.group('head', [0, 0.80, 0.22]);
  rig.add(blob(0.15, 0.185, 0.30), pal.beast, M, { p: [0, 0.86, 0.32] });
  rig.add(blob(0.115, 0.125, 0.21), pal.beast, M, { p: [0, 0.815, 0.46] });
  rig.add(blob(0.105, 0.075, 0.075), pal.beastDark, M, { p: [0, 0.785, 0.535] });
  rig.add(G.sphere(0.016, 6, 5), pal.stoneDark, M, { p: [0.035, 0.795, 0.552] });
  rig.add(G.sphere(0.016, 6, 5), pal.stoneDark, M, { p: [-0.035, 0.795, 0.552] });
  for (const x of [0.066, -0.066]) {
    rig.add(G.cone(0.04, 0.11, 7), pal.beast, M, { p: [x, 1.005, 0.26], r: [-0.2, 0, x > 0 ? 0.24 : -0.24] });
    rig.add(G.cone(0.026, 0.065, 6), pal.plateDark, M, { p: [x, 1.01, 0.265], r: [-0.2, 0, x > 0 ? 0.24 : -0.24] });
  }
  rig.add(blob(0.115, 0.075, 0.15), pal.beastDark, M, { p: [0, 0.775, 0.40] });   // jaw
  rig.add(blob(0.16, 0.14, 0.16), pal.beast, M, { p: [0, 0.845, 0.245] });        // cheek
  rig.add(blob(0.148, 0.11, 0.27), pal.plate, T, { p: [0, 0.935, 0.36] });        // chamfron
  rig.add(G.cone(0.034, 0.17, 8), pal.trim, T, { p: [0, 1.025, 0.33], r: [-0.28, 0, 0] });
  for (const x of [0.098, -0.098]) {
    rig.add(blob(0.05, 0.042, 0.035), pal.beastDark, M, { p: [x, 0.885, 0.393] });
    rig.add(G.sphere(0.016, 7, 6), pal.eye, E, { p: [x, 0.885, 0.404] });
  }
  // Forelock falling between the ears
  rig.add(G.box(0.05, 0.10, 0.03), pal.hair, M, { p: [0, 0.985, 0.30], r: [0.5, 0, 0] });

  // --- rider: a proper armoured figure, seated ---
  rig.group('body');
  const riderZ = -0.10;
  const lift = seat + 0.055;

  // Legs bent around the horse's flanks
  for (const x of [1, -1]) {
    rig.bone(0.052, 0.044, [x * 0.13, lift + 0.10, riderZ], [x * 0.20, lift - 0.06, riderZ + 0.09],
      pal.plate, T, 9);
    rig.add(G.sphere(0.05, 9, 7), pal.plate, T, { p: [x * 0.20, lift - 0.06, riderZ + 0.09] });
    rig.bone(0.044, 0.036, [x * 0.20, lift - 0.06, riderZ + 0.09], [x * 0.20, lift - 0.20, riderZ + 0.20],
      pal.plate, T, 9);
    rig.add(blob(0.08, 0.05, 0.13), pal.plate, T, { p: [x * 0.20, lift - 0.235, riderZ + 0.24] });
  }

  // Torso
  const chestY = lift + 0.235;
  rig.bone(0.125, 0.10, [0, chestY, riderZ], [0, lift + 0.09, riderZ], pal.plate, T, 12);
  rig.add(blob(0.25, 0.20, 0.19), pal.plate, T, { p: [0, chestY - 0.01, riderZ] });
  rig.add(G.cyl(0.10, 0.15, 0.09, 14), pal.plate, T, { p: [0, lift + 0.075, riderZ] });
  rig.add(G.torus(0.105, 0.02, 14), pal.leather, M, { p: [0, lift + 0.145, riderZ], r: [Math.PI / 2, 0, 0] });
  for (const x of [0.15, -0.15]) {
    rig.add(blob(0.155, 0.115, 0.165), pal.plate, T, { p: [x, chestY + 0.075, riderZ] });
    rig.add(blob(0.14, 0.07, 0.15), pal.plate, T, { p: [x * 1.06, chestY + 0.035, riderZ] });
  }

  // Head with a plumed great helm
  const headY = chestY + 0.20;
  rig.bone(0.048, 0.055, [0, headY - 0.06, riderZ], [0, chestY + 0.10, riderZ], pal.skin, M, 8);
  rig.add(G.sphere(0.085, 13, 10), pal.plate, T, { p: [0, headY, riderZ], s: [1, 1.08, 1.12] });
  rig.add(blob(0.185, 0.13, 0.14), pal.plate, T, { p: [0, headY - 0.012, riderZ + 0.05] });
  rig.add(G.box(0.15, 0.022, 0.03), pal.plateDark, T, { p: [0, headY + 0.022, riderZ + 0.088] });
  rig.add(G.box(0.125, 0.012, 0.016), pal.glow, E, { p: [0, headY + 0.022, riderZ + 0.098] });
  rig.add(blob(0.026, 0.05, 0.20), pal.trim, T, { p: [0, headY + 0.088, riderZ] });

  rig.group('plume', [0, headY + 0.09, riderZ]);
  for (let i = 0; i < 4; i++) {
    rig.add(G.box(0.036, 0.13 - i * 0.015, 0.016), pal.cloth, M,
      { p: [0, headY + 0.10 - i * 0.022, riderZ - 0.045 - i * 0.05], r: [0.55 + i * 0.16, 0, 0] });
  }

  // Lance couched under the right arm
  rig.group('armR', [0.17, chestY + 0.05, riderZ]);
  rig.bone(0.05, 0.042, [0.155, chestY + 0.055, riderZ], [0.20, chestY - 0.10, riderZ + 0.04], pal.plate, T, 9);
  rig.add(G.sphere(0.048, 9, 7), pal.plate, T, { p: [0.20, chestY - 0.10, riderZ + 0.04] });
  rig.bone(0.044, 0.036, [0.20, chestY - 0.10, riderZ + 0.04], [0.185, chestY - 0.14, riderZ + 0.17], pal.plate, T, 9);
  rig.add(G.cyl(0.019, 0.028, 0.84, 8), pal.leather, M,
    { p: [0.30, chestY - 0.03, riderZ + 0.04], r: [0.10, 0, -0.16] });
  rig.add(G.cone(0.040, 0.18, 8), pal.plate, T,
    { p: [0.372, chestY + 0.47, riderZ + 0.09], r: [0.10, 0, -0.16] });
  rig.add(G.cone(0.070, 0.12, 10), pal.trim, T,
    { p: [0.245, chestY - 0.40, riderZ - 0.005], r: [Math.PI - 0.10, 0, 0.16] });

  // Left arm on the reins
  rig.group('armL', [-0.17, chestY + 0.05, riderZ]);
  rig.bone(0.05, 0.042, [-0.155, chestY + 0.055, riderZ], [-0.185, chestY - 0.09, riderZ + 0.06], pal.plate, T, 9);
  rig.add(G.sphere(0.048, 9, 7), pal.plate, T, { p: [-0.185, chestY - 0.09, riderZ + 0.06] });
  rig.bone(0.044, 0.036, [-0.185, chestY - 0.09, riderZ + 0.06], [-0.135, chestY - 0.12, riderZ + 0.24], pal.plate, T, 9);
  rig.add(blob(0.065, 0.075, 0.065), pal.plateDark, T, { p: [-0.135, chestY - 0.12, riderZ + 0.24] });

  rig.group('cape', [0, chestY + 0.09, riderZ - 0.08]);
  rig.add(G.cape(0.135, 0.21, 0.42, 1.7, 10), pal.clothDeep, M,
    { p: [0, chestY - 0.10, riderZ - 0.09], twoSided: true });
}

// ---------------------------------------------------------------------------
// Bishop — a robed cleric under a tall cleft mitre.
// ---------------------------------------------------------------------------

function buildBishop(rig, pal, side) {
  const H = HEIGHT.b;
  const s = skeleton(H);
  plinth(rig, pal, 0.27);

  legBooted(rig, pal, s, 1);
  legBooted(rig, pal, s, -1);

  // Robe from the shoulders to the floor
  rig.add(G.lathe([
    [0, 0.02 * H], [0.20 * H, 0.03 * H], [0.235 * H, 0.09 * H], [0.215 * H, 0.28 * H],
    [0.175 * H, 0.46 * H], [0.145 * H, 0.60 * H], [0.135 * H, 0.70 * H],
    [0.145 * H, 0.76 * H], [0.10 * H, 0.80 * H], [0, 0.81 * H],
  ], 18), pal.cloth, M, {});
  rig.add(G.torus(0.228 * H, 0.018 * H, 20), pal.trim, T, { p: [0, 0.085 * H, 0], r: [Math.PI / 2, 0, 0] });

  // Stole down the front, and a jewelled clasp
  for (const x of [0.052 * H, -0.052 * H]) {
    rig.add(G.box(0.05 * H, 0.42 * H, 0.018 * H), pal.trim, T,
      { p: [x, 0.50 * H, 0.132 * H], r: [0.1, 0, 0] });
  }
  rig.add(G.box(0.11 * H, 0.024 * H, 0.022 * H), pal.gem, E, { p: [0, 0.63 * H, 0.146 * H] });

  // Shoulders under the cope
  rig.add(blob(0.30 * H, 0.21 * H, 0.27 * H), pal.cloth, M, { p: [0, s.shoulder - 0.02 * H, 0] });
  for (const x of [0.125 * H, -0.125 * H]) {
    rig.add(blob(0.13 * H, 0.15 * H, 0.16 * H), pal.cloth, M, { p: [x, s.shoulder - 0.03 * H, 0] });
  }
  rig.add(G.torus(0.115 * H, 0.032 * H, 14), pal.trim, T,
    { p: [0, s.neck + 0.01 * H, 0], r: [Math.PI / 2, 0, 0] });

  // Sleeved arms — the left blesses, the right holds the crozier
  rig.group('armL', [-P.shoulderX * H, s.shoulder, 0]);
  armRobed(rig, pal, s, -1, { elbow: [0.155 * H, 0.58 * H, 0.03 * H], hand: [0.118 * H, 0.46 * H, 0.155 * H] });

  rig.group('armR', [P.shoulderX * H, s.shoulder, 0]);
  armRobed(rig, pal, s, 1, { elbow: [0.16 * H, 0.58 * H, 0.02 * H], hand: [0.148 * H, 0.50 * H, 0.125 * H] });
  rig.add(G.cyl(0.014 * H, 0.014 * H, 0.92 * H, 7), pal.leather, M,
    { p: [0.168 * H, 0.55 * H, 0.125 * H], r: [0.04, 0, 0.02] });
  rig.add(G.torus(0.055 * H, 0.018 * H, 14), pal.trim, T,
    { p: [0.183 * H, 1.02 * H, 0.135 * H], r: [0, 0, 0.32] });
  rig.add(G.sphere(0.05 * H, 12, 9), pal.glow, E, { p: [0.183 * H, 1.02 * H, 0.135 * H] });

  // Head and the mitre
  rig.group('head', [0, s.neck, 0]);
  rig.bone(0.05 * H, 0.058 * H, [0, s.chin - 0.02 * H, 0], [0, s.neck - 0.02 * H, 0], pal.skin, M, 8);
  rig.add(G.sphere(P.headR * H, 14, 11), pal.skin, M, { p: [0, s.headY, 0], s: [1, 1.09, 1.02] });
  face(rig, pal, s, { brow: true, mouth: true });
  rig.add(blob(0.19 * H, 0.09 * H, 0.17 * H), pal.hair, M, { p: [0, s.headY - 0.055 * H, -0.03 * H] });

  const mitreBase = s.crown - 0.05 * H;
  rig.add(G.lathe([
    [0.10 * H, mitreBase], [0.112 * H, mitreBase + 0.025 * H], [0.106 * H, mitreBase + 0.08 * H],
    [0.078 * H, mitreBase + 0.145 * H], [0.04 * H, mitreBase + 0.19 * H], [0, mitreBase + 0.21 * H],
  ], 14), pal.cloth, M, { s: [1.28, 1, 0.52] });
  // Orphrey — the embroidered band running up the front of the mitre.
  rig.add(G.box(0.032 * H, 0.20 * H, 0.02 * H), pal.trim, T,
    { p: [0, mitreBase + 0.095 * H, 0.052 * H], r: [-0.12, 0, 0] });
  // Infulae — the two ribbons hanging down the back
  for (const x of [0.05 * H, -0.05 * H]) {
    rig.add(G.box(0.045 * H, 0.20 * H, 0.014 * H), pal.trim, T,
      { p: [x, mitreBase - 0.08 * H, -0.085 * H], twoSided: true });
  }
  rig.add(G.torus(0.106 * H, 0.022 * H, 16), pal.trim, T,
    { p: [0, mitreBase + 0.012 * H, 0], r: [Math.PI / 2, 0, 0], s: [1.24, 0.55, 1] });
  rig.add(G.sphere(0.03 * H, 10, 8), pal.gem, E,
    { p: [0, mitreBase + 0.03 * H, 0.062 * H], s: [1, 1.3, 0.6] });
  rig.add(G.sphere(0.022 * H, 8, 6), pal.trim, T, { p: [0, mitreBase + 0.225 * H, 0] });

  // Witchlight that never quite settles
  rig.group('orb', [0, s.crown + 0.12 * H, 0]);
  rig.add(G.sphere(0.026 * H, 8, 6), pal.glow, E, { p: [0.20 * H, s.crown + 0.12 * H, 0] });
  rig.add(G.sphere(0.017 * H, 7, 5), pal.glow, E, { p: [-0.17 * H, s.crown + 0.17 * H, 0.06 * H] });
  if (side === 'b') {
    rig.add(G.sphere(0.014 * H, 6, 5), pal.glow, E, { p: [0.06 * H, s.crown + 0.06 * H, -0.19 * H] });
  }
}

// ---------------------------------------------------------------------------
// Rook — a siege guard in the heaviest armour, under a tower helm.
// ---------------------------------------------------------------------------

function buildRook(rig, pal, side) {
  const H = HEIGHT.r;
  const s = skeleton(H);
  plinth(rig, pal, 0.30);

  legPlate(rig, pal, s, 1, { stance: 0.105 * H });
  legPlate(rig, pal, s, -1, { stance: 0.105 * H });

  // A broader, heavier cuirass than the others
  rig.bone(0.15 * H, 0.115 * H, [0, s.chest, 0], [0, s.waist - 0.02 * H, 0], pal.stone, M, 12);
  rig.add(blob(0.30 * H, 0.23 * H, 0.22 * H), pal.stone, M, { p: [0, s.chest - 0.005 * H, 0] });
  rig.add(G.cyl(0.115 * H, 0.175 * H, 0.11 * H, 14), pal.stone, M, { p: [0, s.hip + 0.035 * H, 0] });
  rig.add(G.torus(0.17 * H, 0.014 * H, 16), pal.trim, T,
    { p: [0, s.hip - 0.01 * H, 0], r: [Math.PI / 2, 0, 0] });

  // Portcullis grille worn across the chest
  for (let i = -1; i <= 1; i++) {
    rig.add(G.box(0.02 * H, 0.19 * H, 0.024 * H), pal.plateDark, T,
      { p: [i * 0.072 * H, s.chest - 0.01 * H, 0.108 * H] });
    rig.add(G.box(0.19 * H, 0.02 * H, 0.024 * H), pal.plateDark, T,
      { p: [0, s.chest - 0.01 * H + i * 0.072 * H, 0.108 * H] });
  }
  rig.add(G.sphere(0.055 * H, 10, 8), pal.glow, E, { p: [0, s.chest - 0.01 * H, 0.075 * H] });

  // Enormous shoulders
  for (const x of [1, -1]) {
    rig.add(blob(0.22 * H, 0.16 * H, 0.22 * H), pal.stone, M, { p: [x * 0.165 * H, s.shoulder, 0] });
    rig.add(blob(0.20 * H, 0.10 * H, 0.20 * H), pal.stone, M, { p: [x * 0.178 * H, s.shoulder - 0.06 * H, 0] });
    // Miniature battlements on each pauldron
    for (let i = -1; i <= 1; i++) {
      rig.add(G.box(0.045 * H, 0.05 * H, 0.05 * H), pal.stoneDark, M,
        { p: [x * 0.165 * H + i * 0.055 * H, s.shoulder + 0.085 * H, 0] });
    }
  }

  rig.group('armL', [-0.19 * H, s.shoulder, 0]);
  armPlate(rig, pal, s, -1, {
    elbow: [0.215 * H, 0.60 * H, 0.02 * H], hand: [0.225 * H, 0.44 * H, 0.06 * H], color: pal.stone, finish: M,
  });
  rig.group('armR', [0.19 * H, s.shoulder, 0]);
  armPlate(rig, pal, s, 1, {
    elbow: [0.215 * H, 0.60 * H, 0.02 * H], hand: [0.225 * H, 0.44 * H, 0.06 * H], color: pal.stone, finish: M,
  });

  // Head: a tower helm crowned with crenellations
  rig.group('head', [0, s.neck, 0]);
  rig.bone(0.055 * H, 0.062 * H, [0, s.chin, 0], [0, s.neck - 0.02 * H, 0], pal.stoneDark, M, 8);
  rig.add(G.cyl(0.10 * H, 0.115 * H, 0.17 * H, 14), pal.stone, M, { p: [0, s.headY, 0] });
  rig.add(blob(0.225 * H, 0.19 * H, 0.215 * H), pal.stone, M, { p: [0, s.headY, 0] });
  // Arrow-slit eyes with a furnace behind them
  rig.add(G.box(0.16 * H, 0.038 * H, 0.03 * H), pal.stoneDark, M,
    { p: [0, s.headY + 0.012 * H, 0.10 * H] });
  for (const x of [0.045 * H, -0.045 * H]) {
    rig.add(G.box(0.035 * H, 0.016 * H, 0.018 * H), pal.glow, E, { p: [x, s.headY + 0.012 * H, 0.112 * H] });
  }
  rig.add(G.cyl(0.145 * H, 0.125 * H, 0.045 * H, 16), pal.stone, M, { p: [0, s.crown + 0.005 * H, 0] });
  rig.add(G.torus(0.145 * H, 0.012 * H, 18), pal.trim, T,
    { p: [0, s.crown + 0.022 * H, 0], r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    rig.add(G.box(0.062 * H, 0.075 * H, 0.055 * H), pal.stone, M,
      { p: [Math.sin(a) * 0.108 * H, s.crown + 0.065 * H, Math.cos(a) * 0.108 * H], r: [0, a, 0] });
  }
  rig.add(G.sphere(0.075 * H, 10, 8), pal.glow, E, { p: [0, s.crown + 0.045 * H, 0], s: [1, 0.45, 1] });

  // Banner on a pole strapped to the back
  rig.group('banner', [0, s.shoulder, -0.16 * H]);
  rig.add(G.cyl(0.013 * H, 0.013 * H, 0.62 * H, 6), pal.leather, M, { p: [0, 0.78 * H, -0.18 * H] });
  rig.add(G.box(0.20 * H, 0.26 * H, 0.011 * H), pal.cloth, M,
    { p: [0.10 * H, 0.98 * H, -0.185 * H], twoSided: true });
  rig.add(G.box(0.20 * H, 0.02 * H, 0.015 * H), pal.trim, T, { p: [0.10 * H, 0.855 * H, -0.185 * H] });
  rig.add(G.sphere(0.028 * H, 8, 6), pal.gem, E, { p: [0, 1.10 * H, -0.18 * H] });
}

// ---------------------------------------------------------------------------
// Queen — a woman in gown and armoured corselet, caped and crowned.
// ---------------------------------------------------------------------------

function buildQueen(rig, pal, side) {
  const H = HEIGHT.q;
  const s = skeleton(H);
  plinth(rig, pal, 0.28);

  // Gown sweeping to the floor
  rig.add(G.lathe([
    [0, 0.02 * H], [0.215 * H, 0.03 * H], [0.245 * H, 0.09 * H], [0.215 * H, 0.26 * H],
    [0.165 * H, 0.42 * H], [0.128 * H, 0.55 * H], [0.112 * H, 0.62 * H], [0, 0.64 * H],
  ], 20), pal.cloth, M, {});
  rig.add(G.torus(0.238 * H, 0.018 * H, 20), pal.trim, T, { p: [0, 0.085 * H, 0], r: [Math.PI / 2, 0, 0] });
  // A band of gold thread around the hem rather than panels that float free
  rig.add(G.torus(0.20 * H, 0.012 * H, 22), pal.trim, T, { p: [0, 0.30 * H, 0], r: [Math.PI / 2, 0, 0] });
  rig.add(G.torus(0.148 * H, 0.010 * H, 20), pal.trim, T, { p: [0, 0.47 * H, 0], r: [Math.PI / 2, 0, 0] });

  // Corselet
  rig.bone(0.115 * H, 0.088 * H, [0, s.chest, 0], [0, s.waist - 0.03 * H, 0], pal.plate, T, 12);
  rig.add(blob(0.225 * H, 0.19 * H, 0.17 * H), pal.plate, T, { p: [0, s.chest - 0.01 * H, 0] });
  rig.add(G.torus(0.095 * H, 0.016 * H, 14), pal.trim, T,
    { p: [0, s.waist - 0.02 * H, 0], r: [Math.PI / 2, 0, 0] });
  rig.add(G.sphere(0.036 * H, 10, 8), pal.gem, E, { p: [0, s.chest + 0.01 * H, 0.10 * H] });
  rig.add(G.torus(0.055 * H, 0.011 * H, 12), pal.trim, T,
    { p: [0, s.chest + 0.01 * H, 0.096 * H], r: [Math.PI / 2, 0, 0] });

  pauldrons(rig, pal, s, { spike: true });

  // Bare arms, one hand open, one resting
  rig.group('armL', [-P.shoulderX * H, s.shoulder, 0]);
  armPlate(rig, pal, s, -1, {
    elbow: [0.165 * H, 0.62 * H, 0.02 * H], hand: [0.128 * H, 0.49 * H, 0.125 * H],
    color: pal.skin, finish: M, glove: pal.skin,
  });
  rig.group('armR', [P.shoulderX * H, s.shoulder, 0]);
  armPlate(rig, pal, s, 1, {
    elbow: [0.165 * H, 0.62 * H, 0.02 * H], hand: [0.128 * H, 0.49 * H, 0.125 * H],
    color: pal.skin, finish: M, glove: pal.skin,
  });

  // Head, hair and a seven-pointed crown
  rig.group('head', [0, s.neck, 0]);
  neckAndHead(rig, pal, s, { gorget: false });
  face(rig, pal, s, { mouth: true });
  rig.add(blob(0.215 * H, 0.20 * H, 0.20 * H), pal.hair, M, { p: [0, s.headY + 0.012 * H, -0.022 * H] });
  for (const x of [0.088 * H, -0.088 * H]) {
    rig.add(blob(0.085 * H, 0.26 * H, 0.085 * H), pal.hair, M, { p: [x, s.headY - 0.10 * H, -0.03 * H] });
  }
  crown(rig, pal, s, { points: 7, radius: 0.098 * H, tall: 0.115 * H });

  rig.group('cape', [0, s.shoulder + 0.02 * H, -0.05 * H]);
  cape(rig, pal, s, { bottom: 0.06 * H, arc: 2.4 });

  // Eclipse halo
  rig.group('halo', [0, s.crown + 0.14 * H, 0]);
  rig.add(G.torus(0.17 * H, 0.007 * H, 28), pal.glow, E,
    { p: [0, s.crown + 0.14 * H, 0], r: [Math.PI / 2 - 0.35, 0, 0] });
  if (side === 'b') {
    rig.add(G.torus(0.125 * H, 0.005 * H, 24), pal.gem, E,
      { p: [0, s.crown + 0.14 * H, 0], r: [Math.PI / 2 + 0.4, 0.5, 0] });
  }
}

// ---------------------------------------------------------------------------
// King — full regalia, ermine mantle, sword point-down at rest.
// ---------------------------------------------------------------------------

function buildKing(rig, pal, side) {
  const H = HEIGHT.k;
  const s = skeleton(H);
  plinth(rig, pal, 0.29);

  legPlate(rig, pal, s, 1, { stance: 0.09 * H });
  legPlate(rig, pal, s, -1, { stance: 0.09 * H });

  torsoPlate(rig, pal, s);

  // Long robe over the harness, open at the front
  rig.add(G.lathe([
    [0.155 * H, s.hip + 0.02 * H], [0.20 * H, 0.34 * H], [0.225 * H, 0.20 * H],
    [0.245 * H, 0.09 * H], [0.235 * H, 0.03 * H], [0, 0.025 * H],
  ], 20), pal.cloth, M, {});
  rig.add(G.torus(0.243 * H, 0.018 * H, 20), pal.trim, T, { p: [0, 0.075 * H, 0], r: [Math.PI / 2, 0, 0] });
  rig.add(G.box(0.09 * H, 0.42 * H, 0.02 * H), pal.trim, T, { p: [0, 0.32 * H, 0.155 * H], r: [0.1, 0, 0] });

  pauldrons(rig, pal, s);

  // Ermine mantle over the shoulders
  rig.add(blob(0.42 * H, 0.14 * H, 0.34 * H), pal.hair, M, { p: [0, s.shoulder + 0.035 * H, -0.01 * H] });
  rig.add(G.torus(0.13 * H, 0.045 * H, 16, 6), pal.hair, M,
    { p: [0, s.neck + 0.02 * H, 0], r: [Math.PI / 2, 0, 0] });

  // Both hands on the sword hilt, blade point-down before him
  rig.group('armL', [-P.shoulderX * H, s.shoulder, 0]);
  armPlate(rig, pal, s, -1, { elbow: [0.175 * H, 0.615 * H, 0.02 * H], hand: [0.052 * H, 0.545 * H, 0.155 * H] });
  rig.group('armR', [P.shoulderX * H, s.shoulder, 0]);
  armPlate(rig, pal, s, 1, { elbow: [0.175 * H, 0.615 * H, 0.02 * H], hand: [0.052 * H, 0.60 * H, 0.155 * H] });
  rig.group('body');
  swordUpright(rig, pal, s, { z: 0.165 * H, guard: 0.50 * H, tip: 0.05 * H });

  // Head, beard, and the Everdawn Crown
  rig.group('head', [0, s.neck, 0]);
  neckAndHead(rig, pal, s, { gorget: false });
  face(rig, pal, s, { brow: true });
  rig.add(G.cone(0.085 * H, 0.17 * H, 10), pal.hair, M,
    { p: [0, s.headY - 0.10 * H, 0.03 * H], r: [Math.PI, 0, 0] });
  rig.add(blob(0.20 * H, 0.11 * H, 0.19 * H), pal.hair, M, { p: [0, s.headY + 0.03 * H, -0.025 * H] });
  crown(rig, pal, s, { points: 5, radius: 0.105 * H, tall: 0.12 * H, base: s.crown });

  rig.group('cape', [0, s.shoulder + 0.02 * H, -0.06 * H]);
  cape(rig, pal, s, { bottom: 0.05 * H, arc: 2.4, collar: false });
}

const BUILDERS = { p: buildPawn, n: buildKnight, b: buildBishop, r: buildRook, q: buildQueen, k: buildKing };

// ---------------------------------------------------------------------------
// Idle behaviour — what makes them read as characters rather than props
// ---------------------------------------------------------------------------

const IDLE = {
  p: (g, t, phase) => {
    // Nervous, quick, always shifting weight; taps the shield periodically.
    const bob = Math.sin(t * 2.5 + phase) * 0.010;
    g.body.position.y = bob;
    g.body.rotation.z = Math.sin(t * 1.3 + phase) * 0.020;
    if (g.head) {
      g.head.rotation.y = Math.sin(t * 0.9 + phase * 2) * 0.26;
      g.head.position.y = bob;
    }
    const tap = Math.max(0, Math.sin(t * 0.8 + phase)) ** 12;
    if (g.armL) { g.armL.rotation.x = -tap * 0.45; g.armL.position.y = bob; }
    if (g.armR) { g.armR.rotation.z = Math.sin(t * 1.1 + phase) * 0.05; g.armR.position.y = bob; }
  },
  n: (g, t, phase) => {
    // The horse breathes and nods; the rider rocks with it.
    const breath = Math.sin(t * 1.9 + phase) * 0.010;
    g.body.position.y = breath;
    g.body.rotation.z = Math.sin(t * 0.8 + phase) * 0.013;
    if (g.head) {
      g.head.rotation.x = Math.sin(t * 1.35 + phase) * 0.11 - 0.03;
      g.head.rotation.y = Math.sin(t * 0.62 + phase * 1.7) * 0.17;
      g.head.position.y = breath;
    }
    if (g.plume) {
      g.plume.rotation.x = Math.sin(t * 2.4 + phase) * 0.14;
      g.plume.position.y = breath;
    }
    if (g.cape) { g.cape.rotation.x = Math.sin(t * 1.4 + phase) * 0.06; g.cape.position.y = breath; }
    if (g.armR) { g.armR.rotation.x = Math.sin(t * 1.1 + phase) * 0.035; g.armR.position.y = breath; }
    if (g.armL) g.armL.position.y = breath;
  },
  b: (g, t, phase) => {
    // Never quite touches the ground. The witchlight orbits.
    const hover = 0.04 + Math.sin(t * 1.15 + phase) * 0.032;
    g.body.position.y = hover;
    g.body.rotation.y = Math.sin(t * 0.4 + phase) * 0.08;
    if (g.head) { g.head.position.y = hover; g.head.rotation.z = Math.sin(t * 0.7 + phase) * 0.03; }
    if (g.armL) g.armL.position.y = hover;
    if (g.armR) { g.armR.position.y = hover; g.armR.rotation.z = Math.sin(t * 0.9 + phase) * 0.035; }
    if (g.orb) {
      g.orb.position.y = hover;
      g.orb.rotation.y = t * 1.5 + phase;
      g.orb.rotation.z = Math.sin(t * 0.8) * 0.35;
    }
  },
  r: (g, t, phase) => {
    // Barely moves. Rumbles. The banner does most of the living.
    const rumble = Math.sin(t * 7.3 + phase) * 0.0022 + Math.sin(t * 1.1) * 0.0035;
    g.body.position.y = rumble;
    if (g.head) { g.head.position.y = rumble; g.head.rotation.y = Math.sin(t * 0.3 + phase) * 0.06; }
    if (g.armL) g.armL.rotation.x = Math.sin(t * 0.9 + phase) * 0.05;
    if (g.armR) g.armR.rotation.x = Math.sin(t * 0.9 + phase + 1.6) * 0.05;
    if (g.banner) {
      g.banner.rotation.z = Math.sin(t * 2.1 + phase) * 0.08;
      g.banner.rotation.x = Math.sin(t * 1.6 + phase) * 0.045;
    }
  },
  q: (g, t, phase) => {
    // Floats. Cape drifts. Halo turns on its own axis.
    const float = 0.02 + Math.sin(t * 1.05 + phase) * 0.020;
    g.body.position.y = float;
    g.body.rotation.y = Math.sin(t * 0.35 + phase) * 0.06;
    if (g.head) { g.head.position.y = float; g.head.rotation.y = Math.sin(t * 0.55 + phase) * 0.18; }
    if (g.armL) g.armL.position.y = float;
    if (g.armR) g.armR.position.y = float;
    if (g.cape) {
      g.cape.position.y = float;
      g.cape.rotation.z = Math.sin(t * 1.2 + phase) * 0.04;
      g.cape.rotation.x = Math.sin(t * 0.9 + phase) * 0.028;
    }
    if (g.halo) {
      g.halo.position.y = float;
      g.halo.rotation.y = t * 0.85;
      g.halo.rotation.z = Math.sin(t * 0.5) * 0.2;
    }
  },
  k: (g, t, phase) => {
    // Slow breathing, a weary lean, and a crown that pulses like a heartbeat.
    const breath = Math.sin(t * 1.05 + phase) * 0.008;
    g.body.position.y = breath;
    g.body.rotation.z = Math.sin(t * 0.45 + phase) * 0.014;
    if (g.head) {
      g.head.position.y = breath;
      g.head.rotation.y = Math.sin(t * 0.4 + phase) * 0.13;
      g.head.rotation.x = Math.sin(t * 0.6 + phase) * 0.028;
    }
    if (g.armR) { g.armR.position.y = breath; g.armR.rotation.z = Math.sin(t * 0.85 + phase) * 0.022; }
    if (g.armL) g.armL.position.y = breath;
    if (g.cape) {
      g.cape.position.y = breath;
      g.cape.rotation.z = Math.sin(t * 0.75 + phase) * 0.028;
    }
  },
};

/**
 * Builds all twelve characters once. Board pieces are `.clone()`d from these
 * prototypes so geometry and materials are shared.
 */
export function buildPrototypes(materials) {
  const prototypes = {};
  for (const color of ['w', 'b']) {
    prototypes[color] = {};
    for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
      const rig = new Rig();
      BUILDERS[type](rig, PALETTE[color], color);
      const model = rig.compile(materials);

      // Normalise to the piece's board height, tip of crown to base.
      const box = new THREE.Box3().setFromObject(model);
      if (box.max.y > 0) model.scale.setScalar(PIECE_HEIGHT[type] / box.max.y);

      model.userData.type = type;
      model.userData.color = color;
      prototypes[color][type] = model;
    }
  }
  return prototypes;
}

/**
 * Which way a character stands. Models are authored facing +Z; White's home
 * rank is at +Z, so White turns to face down-board and Black faces up-board.
 */
export function baseYawFor(color) {
  return color === 'w' ? Math.PI : 0;
}

/** Instantiates a character from its prototype, ready to place on the board. */
export function spawnPiece(prototypes, color, type) {
  const model = prototypes[color][type].clone();
  // Children are joint pivots; the node inside each one is what gets animated.
  const groups = {};
  for (const pivot of model.children) {
    const inner = pivot.children[0];
    if (inner) groups[inner.name] = inner;
  }

  const container = new THREE.Group();
  container.add(model);
  model.rotation.y = baseYawFor(color);

  container.userData = {
    color,
    type,
    model,
    groups,
    phase: Math.random() * TAU,
    idle: IDLE[type],
    height: HEIGHT[type],
  };
  return container;
}

/** Drives every character's idle loop. */
export function updateIdle(container, time) {
  const d = container.userData;
  if (d.idle) d.idle(d.groups, time, d.phase);
}
