/**
 * Move choreography.
 *
 * Every character travels in its own way — the pawn hops, the knight vaults,
 * the bishop glides, the rook grinds, royalty floats — and every kill lands
 * with an impact, a shockwave and a body that comes apart.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { PALETTE } from './palette.js';
import { PIECE_HEIGHT, baseYawFor } from './pieces.js';

const _dir = new THREE.Vector3();

const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const easeInCubic = (k) => k * k * k;
const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutBack = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);

/** Shortest-path angle lerp so pieces never spin the long way round. */
function lerpAngle(a, b, k) {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * k;
}

export class Animator {
  constructor(effects, audio) {
    this.effects = effects;
    this.audio = audio;
    this.active = [];
  }

  get busy() {
    return this.active.length > 0;
  }

  play(spec) {
    return new Promise((resolve) => {
      this.active.push({
        t: 0,
        duration: spec.duration,
        update: spec.update,
        events: (spec.events || []).map((e) => ({ ...e, fired: false })),
        done: spec.done,
        resolve,
      });
    });
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const anim = this.active[i];
      anim.t += dt;
      const k = Math.min(1, anim.t / anim.duration);

      for (const event of anim.events) {
        if (!event.fired && k >= event.at) {
          event.fired = true;
          event.fn();
        }
      }
      if (anim.update) anim.update(k, dt);

      if (k >= 1) {
        if (anim.done) anim.done();
        this.active.splice(i, 1);
        anim.resolve();
      }
    }
  }

  /** Runs whatever is queued to completion — used when skipping animation. */
  finishAll() {
    while (this.active.length) {
      const anim = this.active.shift();
      for (const event of anim.events) if (!event.fired) { event.fired = true; event.fn(); }
      if (anim.update) anim.update(1, 0);
      if (anim.done) anim.done();
      anim.resolve();
    }
  }
}

// ---------------------------------------------------------------------------
// Per-character travel styles
// ---------------------------------------------------------------------------

const STYLE = {
  p: { duration: 0.58, hops: 2, arc: 0.16, lean: 0.22, kind: 'step' },
  n: { duration: 0.86, hops: 1, arc: 1.05, lean: 0.34, kind: 'vault' },
  b: { duration: 0.70, hops: 0, arc: 0.30, lean: 0.10, kind: 'glide' },
  r: { duration: 0.62, hops: 0, arc: 0.0, lean: 0.06, kind: 'grind' },
  q: { duration: 0.74, hops: 0, arc: 0.24, lean: 0.08, kind: 'glide' },
  k: { duration: 0.82, hops: 1, arc: 0.10, lean: 0.14, kind: 'stride' },
};

/**
 * Builds the animation for one character travelling between two squares.
 * `onImpact` fires at the moment of contact so captures land on the beat.
 */
export function buildMoveAnimation(ctx) {
  const { piece, from, to, effects, audio, isCapture, speed = 1 } = ctx;
  const type = piece.userData.type;
  const color = piece.userData.color;
  const pal = PALETTE[color];
  const style = STYLE[type];
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const duration = (style.duration + distance * 0.045) / speed;

  const baseYaw = baseYawFor(color);
  const startYaw = piece.rotation.y;
  const travelYaw = Math.atan2(to.x - from.x, to.z - from.z) - baseYaw;
  const groups = piece.userData.groups;

  _dir.set(to.x - from.x, 0, to.z - from.z).normalize();
  const events = [];
  const arcHeight = style.arc;

  // Departure and arrival flourishes, tuned per character.
  events.push({
    at: 0.02,
    fn: () => {
      audio?.move(type, color);
      if (style.kind === 'vault') {
        effects.dust(from, { count: 14, color: pal.stoneDark, speed: 1.4 });
      } else if (style.kind === 'grind') {
        effects.dust(from, { count: 10, color: pal.stone, speed: 0.8 });
      } else if (style.kind === 'glide') {
        effects.ring(from, { color: pal.glow, life: 0.5, from: 0.15, to: 0.85, opacity: 0.5 });
      } else {
        effects.dust(from, { count: 8, speed: 0.7, color: pal.leather });
      }
    },
  });

  events.push({
    at: 0.97,
    fn: () => {
      if (isCapture) return; // the capture beat has its own, louder payoff
      audio?.land(type);
      if (style.kind === 'vault') {
        effects.dust(to, { count: 20, speed: 2.0, color: pal.stoneDark });
        effects.ring(to, { color: pal.trim, life: 0.5, from: 0.3, to: 1.5, opacity: 0.7 });
        effects.shake(0.16);
      } else if (style.kind === 'grind') {
        effects.dust(to, { count: 14, speed: 1.1, color: pal.stone });
        effects.ring(to, { color: pal.glow, life: 0.45, from: 0.4, to: 1.2, opacity: 0.4 });
        effects.shake(0.12);
      } else if (style.kind === 'glide') {
        effects.burst(to, {
          count: 14, color: [pal.glow, pal.gem], speed: 1.1, size: 0.09,
          life: 0.6, gravity: 0.2, intensity: 1.4,
        });
      } else if (type === 'k') {
        effects.ring(to, { color: pal.gem, life: 0.6, from: 0.25, to: 1.35, opacity: 0.55 });
        effects.dust(to, { count: 12, speed: 0.9, color: pal.leather });
        effects.shake(0.08);
      } else {
        effects.dust(to, { count: 10, speed: 0.9, color: pal.leather });
      }
    },
  });

  let trailTimer = 0;

  const update = (k, dt) => {
    const travel = style.kind === 'vault' ? easeInOutCubic(k)
      : style.kind === 'grind' ? easeInOutCubic(k)
      : easeOutCubic(k);

    piece.position.x = from.x + (to.x - from.x) * travel;
    piece.position.z = from.z + (to.z - from.z) * travel;

    // Vertical path: a smooth arc, optionally chopped into hops.
    let y = 0;
    if (arcHeight > 0) {
      const hops = style.hops || 1;
      const phase = style.hops > 1 ? (k * hops) % 1 : k;
      y = Math.sin(Math.PI * phase) * arcHeight;
      if (style.kind === 'glide') y = Math.sin(Math.PI * k) * arcHeight + 0.06 * Math.min(1, k * 6);
    }
    piece.position.y = y;

    // Face the direction of travel, then settle back to the army's facing.
    const settle = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    piece.rotation.y = lerpAngle(startYaw, lerpAngle(baseYaw + travelYaw, baseYaw, 1 - settle), Math.min(1, k * 5));

    // Lean into the movement.
    const lean = Math.sin(Math.PI * k) * style.lean;
    if (groups.body) groups.body.rotation.x = lean * 0.5;

    if (style.kind === 'vault') {
      // The horse tucks its legs and the rider's plume streams backwards.
      if (groups.head) groups.head.rotation.x = -0.35 + Math.sin(Math.PI * k) * 0.5;
      if (groups.plume) groups.plume.rotation.x = 0.6 + Math.sin(Math.PI * k) * 0.9;
      if (groups.body) groups.body.rotation.x = Math.sin(Math.PI * k) * -0.28;
    } else if (style.kind === 'glide') {
      if (groups.cape) groups.cape.rotation.x = -Math.sin(Math.PI * k) * 0.45;
      if (groups.halo) groups.halo.rotation.y += dt * 6;
      if (groups.orb) groups.orb.rotation.y += dt * 8;
    } else if (style.kind === 'grind') {
      if (groups.banner) groups.banner.rotation.x = -Math.sin(Math.PI * k) * 0.5;
      if (groups.armL) groups.armL.rotation.x = Math.sin(k * Math.PI * 3) * 0.3;
      if (groups.armR) groups.armR.rotation.x = -Math.sin(k * Math.PI * 3) * 0.3;
    } else {
      if (groups.armL) groups.armL.rotation.x = Math.sin(k * Math.PI * 2 * (style.hops || 1)) * 0.5;
      if (groups.armR) groups.armR.rotation.x = -Math.sin(k * Math.PI * 2 * (style.hops || 1)) * 0.5;
    }

    // Signature trails.
    trailTimer -= dt;
    if (trailTimer <= 0 && k < 0.95) {
      trailTimer = 0.03;
      const at = { x: piece.position.x, y: piece.position.y + 0.15, z: piece.position.z };
      if (type === 'b') {
        effects.trail(at, { color: pal.glow, count: 2, size: 0.1, intensity: 1.5 });
      } else if (type === 'q') {
        effects.trail(at, { color: [pal.gem, pal.trim], count: 2, size: 0.11, intensity: 1.6 });
      } else if (type === 'n' && k > 0.1 && k < 0.9) {
        effects.trail({ ...at, y: at.y + 0.3 }, { color: pal.cloth, count: 1, size: 0.08, intensity: 0.9 });
      } else if (type === 'k') {
        effects.trail(at, { color: pal.gem, count: 1, size: 0.07, intensity: 0.9 });
      } else if (type === 'r') {
        effects.dust({ x: piece.position.x, y: 0, z: piece.position.z },
          { count: 1, speed: 0.5, color: pal.stone, size: 0.14, intensity: 0.5 });
      }
    }
  };

  const done = () => {
    piece.position.set(to.x, 0, to.z);
    piece.rotation.y = baseYaw;
    for (const group of Object.values(groups)) {
      group.rotation.x = 0;
      group.rotation.z = 0;
    }
  };

  return { duration, update, events, done, impactAt: 0.72 };
}

/**
 * The kill. The victim is struck, knocked back, then comes apart into a cloud
 * of its own colours and rises off the board.
 */
export function buildCaptureAnimation(ctx) {
  const { victim, attacker, at, effects, audio, attackerType } = ctx;
  const pal = PALETTE[victim.userData.color];
  const attackerPal = PALETTE[attacker.userData.color];
  const height = PIECE_HEIGHT[victim.userData.type];
  const groups = victim.userData.groups;

  const knockDir = new THREE.Vector3(
    victim.position.x - attacker.position.x, 0, victim.position.z - attacker.position.z);
  if (knockDir.lengthSq() < 1e-6) knockDir.set(0, 0, 1);
  knockDir.normalize();

  const origin = victim.position.clone();
  const centre = { x: at.x, y: height * 0.55, z: at.z };
  const duration = 0.72;

  const events = [
    {
      at: 0,
      fn: () => {
        audio?.impact(attackerType);
        effects.shake(0.42);
        effects.flash(centre, { color: 0xffffff, size: 2.6, life: 0.22 });
        effects.ring(at, {
          color: attackerPal.trim, life: 0.55, from: 0.25, to: 2.1, opacity: 0.95,
        });
        // A vertical slash plane through the victim, aligned with the blow.
        effects.ring(centre, {
          color: attackerPal.glow, life: 0.35, from: 0.2, to: 1.5, opacity: 0.8,
          vertical: true, yaw: Math.atan2(knockDir.x, knockDir.z) + Math.PI / 2,
        });
        effects.burst(centre, {
          count: 34, color: [pal.cloth, pal.plate, attackerPal.glow], speed: 4.2,
          size: 0.14, life: 0.75, spread: 1.4, radius: 0.18, intensity: 1.4,
        });
      },
    },
    {
      at: 0.28,
      fn: () => {
        audio?.shatter();
        effects.burst(centre, {
          count: 30, color: [pal.plate, pal.trim, pal.gem], speed: 2.6,
          size: 0.11, life: 0.9, spread: 1.6, radius: 0.22, intensity: 1.1,
        });
      },
    },
  ];

  let emitTimer = 0;

  const update = (k, dt) => {
    if (k < 0.22) {
      // Recoil — knocked back and tilted.
      const p = k / 0.22;
      const push = Math.sin(p * Math.PI * 0.5) * 0.26;
      victim.position.x = origin.x + knockDir.x * push;
      victim.position.z = origin.z + knockDir.z * push;
      victim.position.y = Math.sin(p * Math.PI) * 0.14;
      if (groups.body) groups.body.rotation.x = -p * 0.5;
      victim.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.09);
      return;
    }

    // Dissolve — spin up and out of the world.
    const p = (k - 0.22) / 0.78;
    const eased = easeInCubic(p);
    victim.position.y = eased * 1.15;
    victim.rotation.y += dt * (2.5 + p * 7);
    victim.rotation.z = eased * 0.7 * (knockDir.x > 0 ? 1 : -1);
    victim.scale.setScalar(Math.max(0.001, 1 - eased * 0.98));

    emitTimer -= dt;
    if (emitTimer <= 0) {
      emitTimer = 0.035;
      effects.trail(
        { x: victim.position.x, y: victim.position.y + height * 0.4, z: victim.position.z },
        { color: [pal.gem, pal.glow, pal.cloth], count: 3, size: 0.1, gravity: 0.9, intensity: 1.4 },
      );
    }
  };

  return { duration, update, events };
}

/**
 * Pawn reaching the far rank: light column, burst, and the new piece rises.
 * `ref.current` is swapped from the pawn to the promoted character halfway
 * through, so the animation keeps driving whichever body is on the square.
 */
export function buildPromotionAnimation(ctx) {
  const { ref, at, effects, audio, color } = ctx;
  const pal = PALETTE[color];
  const duration = 0.9;

  const events = [
    {
      at: 0,
      fn: () => {
        audio?.promote();
        effects.ring(at, { color: pal.trim, life: 0.9, from: 0.2, to: 2.4, opacity: 0.9 });
        for (let i = 0; i < 26; i++) {
          effects.spawn({
            x: at.x + (Math.random() - 0.5) * 0.7,
            y: at.y,
            z: at.z + (Math.random() - 0.5) * 0.7,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 2.2 + Math.random() * 2.4,
            vz: (Math.random() - 0.5) * 0.3,
            color: Math.random() < 0.5 ? pal.trim : pal.glow,
            size: 0.13, life: 1.1, gravity: -0.5, drag: 0.5, intensity: 1.6,
          });
        }
      },
    },
    {
      at: 0.45,
      fn: () => {
        effects.flash({ x: at.x, y: at.y + 0.6, z: at.z }, { color: pal.glow, size: 3.4, life: 0.4 });
        effects.burst({ x: at.x, y: at.y + 0.5, z: at.z }, {
          count: 40, color: [pal.trim, pal.glow, pal.gem], speed: 3.4,
          size: 0.13, life: 0.9, spread: 1.5, intensity: 1.6,
        });
        effects.shake(0.2);
      },
    },
  ];

  const update = (k) => {
    const piece = ref.current;
    if (!piece) return;
    if (k < 0.45) {
      piece.scale.setScalar(Math.max(0.001, 1 - easeInCubic(k / 0.45)));
      piece.rotation.y += 0.35;
    } else {
      const p = (k - 0.45) / 0.55;
      piece.scale.setScalar(Math.min(1, easeOutBack(p)));
      piece.position.y = (1 - easeOutCubic(p)) * 0.7;
      piece.rotation.y = (1 - p) * 4;
    }
  };

  const done = () => {
    const piece = ref.current;
    if (!piece) return;
    piece.scale.setScalar(1);
    piece.position.y = 0;
    piece.rotation.y = baseYawFor(color);
  };

  return { duration, update, events, done, swapAt: 0.45 };
}

export { easeOutCubic, easeInOutCubic, easeOutBack, lerpAngle };
