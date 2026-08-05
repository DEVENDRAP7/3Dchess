/**
 * A tiny modelling toolkit.
 *
 * Characters are sculpted from a few dozen primitives, which would be a few
 * dozen draw calls each — far too many for 32 of them on a phone. So parts are
 * declared into named animation groups, their colours are baked into vertex
 * colours, and everything sharing a group + surface finish is merged into one
 * mesh. A full character ends up at roughly four draw calls.
 */

import * as THREE from '../../vendor/three.module.min.js';

const _obj = new THREE.Object3D();
const _color = new THREE.Color();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export const FINISH = { MATTE: 'matte', METAL: 'metal', GLOW: 'glow' };

/** Shared materials — one set for the whole game, keyed by finish. */
export function createFinishMaterials() {
  const mark = (material) => {
    // Flags these as owned by nobody in particular, so scene teardown skips them.
    material.userData.shared = true;
    return material;
  };
  return {
    [FINISH.MATTE]: mark(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.72, metalness: 0.04,
    })),
    [FINISH.METAL]: mark(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.26, metalness: 0.86,
    })),
    [FINISH.GLOW]: mark(new THREE.MeshBasicMaterial({
      vertexColors: true, toneMapped: false,
    })),
  };
}

export class Rig {
  constructor() {
    this.parts = [];
    this.current = 'body';
    this.origins = {};
  }

  /**
   * Subsequent parts belong to this animation group. `origin` sets the group's
   * pivot, so a head nods around the neck and an arm swings from the shoulder
   * rather than from the character's feet.
   */
  group(name, origin) {
    this.current = name;
    if (origin) this.origins[name] = origin;
    return this;
  }

  /**
   * @param geometry  a THREE.BufferGeometry (consumed — do not reuse)
   * @param color     hex colour baked into vertex colours
   * @param finish    FINISH.MATTE | METAL | GLOW
   * @param t         { p:[x,y,z], r:[x,y,z], s:number|[x,y,z], twoSided:boolean }
   *
   * `twoSided` duplicates the surface with reversed winding. Cloth — capes,
   * banners, tabards — is open geometry that would otherwise vanish when seen
   * from its back face, and the merged materials cull backfaces for speed.
   */
  add(geometry, color, finish = FINISH.MATTE, t = {}) {
    _obj.position.set(...(t.p || [0, 0, 0]));
    _obj.rotation.set(...(t.r || [0, 0, 0]));
    const s = t.s === undefined ? 1 : t.s;
    if (typeof s === 'number') _obj.scale.set(s, s, s);
    else _obj.scale.set(...s);
    _obj.updateMatrix();

    this.parts.push({
      group: this.current,
      finish,
      color,
      geometry,
      matrix: _obj.matrix.clone(),
      twoSided: !!t.twoSided,
    });
    return this;
  }

  /**
   * A tapered limb segment spanning two points in space — the basic unit of
   * every arm, leg and neck. Handles the orientation maths so characters can
   * be posed by naming joint positions rather than angles.
   */
  bone(rTop, rBottom, from, to, color, finish = FINISH.MATTE, segments = 8) {
    _a.set(...from);
    _b.set(...to);
    _dir.subVectors(_b, _a);
    const length = _dir.length();
    if (length < 1e-6) return this;

    _mid.addVectors(_a, _b).multiplyScalar(0.5);
    _quat.setFromUnitVectors(_up, _dir.normalize());
    _scale.set(1, length, 1);

    this.parts.push({
      group: this.current,
      finish,
      color,
      // Unit-height cylinder, stretched to span the joint.
      geometry: G.cyl(rTop, rBottom, 1, segments),
      matrix: new THREE.Matrix4().compose(_mid, _quat, _scale),
    });
    return this;
  }

  /** Mirrors the most recent part across X — handy for limbs. */
  mirrorLast() {
    const last = this.parts[this.parts.length - 1];
    const matrix = new THREE.Matrix4().makeScale(-1, 1, 1).multiply(last.matrix);
    this.parts.push({ ...last, geometry: last.geometry.clone(), matrix });
    return this;
  }

  /** Merges everything down and returns a THREE.Group of animation groups. */
  compile(materials) {
    const buckets = new Map();
    for (const part of this.parts) {
      const key = part.group + '|' + part.finish;
      if (!buckets.has(key)) buckets.set(key, { group: part.group, finish: part.finish, parts: [] });
      buckets.get(key).parts.push(part);
    }

    const root = new THREE.Group();
    const groups = new Map();
    // Each animation group is a pivot holding an inner node. The pivot carries
    // the joint position; the inner node is what animations move. Keeping them
    // separate means an idle loop can set `position.y` outright without
    // knocking the head off the neck.
    const groupFor = (name) => {
      if (!groups.has(name)) {
        const pivot = new THREE.Group();
        pivot.name = name + ':pivot';
        const origin = this.origins[name];
        if (origin) pivot.position.set(...origin);
        const inner = new THREE.Group();
        inner.name = name;
        pivot.add(inner);
        root.add(pivot);
        groups.set(name, inner);
      }
      return groups.get(name);
    };
    groupFor('body');

    for (const bucket of buckets.values()) {
      const geometry = mergeParts(bucket.parts, this.origins[bucket.group]);
      const mesh = new THREE.Mesh(geometry, materials[bucket.finish]);
      mesh.castShadow = bucket.finish !== FINISH.GLOW;
      mesh.receiveShadow = false;
      mesh.name = bucket.group + ':' + bucket.finish;
      groupFor(bucket.group).add(mesh);
    }

    for (const part of this.parts) part.geometry.dispose();
    // Deliberately not stored on userData: Object3D.clone() deep-copies
    // userData through JSON, which cannot carry scene-graph references.
    return root;
  }
}

/** Concatenates transformed, vertex-coloured geometries into one buffer. */
function mergeParts(parts, origin) {
  let vertexCount = 0;
  const prepared = [];
  // Parts are authored in model space; rebase them onto the group's pivot.
  const rebase = origin
    ? new THREE.Matrix4().makeTranslation(-origin[0], -origin[1], -origin[2])
    : null;

  for (const part of parts) {
    let geo = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    geo.applyMatrix4(rebase ? rebase.clone().multiply(part.matrix) : part.matrix);
    // A negative-determinant matrix (mirrored limbs) flips winding order.
    if (part.matrix.determinant() < 0) flipWinding(geo);
    geo.computeVertexNormals();
    const count = geo.attributes.position.count;
    vertexCount += count;
    prepared.push({ geo, count, color: part.color });

    if (part.twoSided) {
      const back = geo.clone();
      flipWinding(back);
      back.computeVertexNormals();
      vertexCount += count;
      prepared.push({ geo: back, count, color: part.color });
    }
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  let offset = 0;
  for (const { geo, count, color } of prepared) {
    positions.set(geo.attributes.position.array.subarray(0, count * 3), offset * 3);
    normals.set(geo.attributes.normal.array.subarray(0, count * 3), offset * 3);
    _color.setHex(color, THREE.SRGBColorSpace);
    for (let i = 0; i < count; i++) {
      colors[(offset + i) * 3] = _color.r;
      colors[(offset + i) * 3 + 1] = _color.g;
      colors[(offset + i) * 3 + 2] = _color.b;
    }
    offset += count;
    geo.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

function flipWinding(geo) {
  const pos = geo.attributes.position.array;
  for (let i = 0; i < pos.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const tmp = pos[i + 3 + k];
      pos[i + 3 + k] = pos[i + 6 + k];
      pos[i + 6 + k] = tmp;
    }
  }
}

// ---------------------------------------------------------------------------
// Geometry shorthands. Segment counts are deliberately low — these are read at
// thumbnail size on a phone and the silhouette is what matters.
// ---------------------------------------------------------------------------

export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  cone: (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg),
  sphere: (r, wseg = 12, hseg = 9) => new THREE.SphereGeometry(r, wseg, hseg),
  /** Upper half of a sphere — helmet bowls and skull caps. */
  dome: (r, wseg = 12, hseg = 6) => new THREE.SphereGeometry(r, wseg, hseg, 0, Math.PI * 2, 0, Math.PI / 2),
  torus: (r, tube, seg = 14, rad = 8) => new THREE.TorusGeometry(r, tube, rad, seg),
  ring: (inner, outer, seg = 32) => new THREE.RingGeometry(inner, outer, seg),
  plane: (w, h, ws = 1, hs = 1) => new THREE.PlaneGeometry(w, h, ws, hs),

  /** Surface of revolution from [radius, height] pairs — robes, gowns, plinths. */
  lathe: (profile, seg = 14) => new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), seg),

  /**
   * An open cylinder wedge — used for capes and cloaks. `arc` is the sweep in
   * radians, centred on -Z (behind the character).
   */
  cape: (rTop, rBottom, height, arc = 2.1, seg = 10) => new THREE.CylinderGeometry(
    rTop, rBottom, height, seg, 3, true, Math.PI - arc / 2, arc),

  /** Tapered limb segment, origin at the shoulder/hip end. */
  limb: (rTop, rBottom, length, seg = 8) => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, seg, 1);
    g.translate(0, -length / 2, 0);
    return g;
  },
};

/** Rounds off a box by scaling a low-poly sphere — cheaper than real bevels. */
export function blob(w, h, d) {
  const g = new THREE.SphereGeometry(0.5, 10, 7);
  g.scale(w, h, d);
  return g;
}
