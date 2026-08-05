/**
 * Everything that flashes, sparks, cracks or drifts.
 *
 * One pooled point cloud handles all particles, one pool of rings handles all
 * shockwaves, and a small trauma value drives camera shake. Nothing here
 * allocates during play.
 */

import * as THREE from '../../vendor/three.module.min.js';

const PARTICLE_CAPACITY = 1400;
const _v = new THREE.Vector3();

function makeSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.trauma = 0;

    // --- particles -------------------------------------------------------
    this.cursor = 0;
    this.positions = new Float32Array(PARTICLE_CAPACITY * 3);
    this.colors = new Float32Array(PARTICLE_CAPACITY * 3);
    this.sizes = new Float32Array(PARTICLE_CAPACITY);
    this.velocities = new Float32Array(PARTICLE_CAPACITY * 3);
    this.life = new Float32Array(PARTICLE_CAPACITY);
    this.maxLife = new Float32Array(PARTICLE_CAPACITY);
    this.baseSize = new Float32Array(PARTICLE_CAPACITY);
    this.baseColor = new Float32Array(PARTICLE_CAPACITY * 3);
    this.gravity = new Float32Array(PARTICLE_CAPACITY);
    this.drag = new Float32Array(PARTICLE_CAPACITY);
    this.spin = new Float32Array(PARTICLE_CAPACITY);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);

    // A hand-rolled point material so each particle can carry its own size.
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: makeSpriteTexture() }, uScale: { value: 1 } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale * (300.0 / max(-mv.z, 0.001));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor, 1.0) * tex;
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    // --- shockwave rings --------------------------------------------------
    this.ringGeometry = new THREE.RingGeometry(0.62, 0.78, 40);
    this.rings = [];
    this.ringPool = [];

    // --- impact flashes ---------------------------------------------------
    this.flashGeometry = new THREE.PlaneGeometry(1, 1);
    this.flashes = [];
    this.flashPool = [];

    this._ambient();
  }

  /** Slow motes drifting over the board, purely for atmosphere. */
  _ambient() {
    for (let i = 0; i < 90; i++) {
      this.spawn({
        x: (Math.random() - 0.5) * 13,
        y: Math.random() * 5,
        z: (Math.random() - 0.5) * 13,
        vx: (Math.random() - 0.5) * 0.05,
        vy: 0.02 + Math.random() * 0.05,
        vz: (Math.random() - 0.5) * 0.05,
        color: 0x8fa7ff,
        size: 0.03 + Math.random() * 0.04,
        life: 8 + Math.random() * 8,
        gravity: 0,
        drag: 0,
        intensity: 0.35,
      });
    }
    this.ambientTimer = 0;
  }

  spawn(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % PARTICLE_CAPACITY;
    const i3 = i * 3;

    this.positions[i3] = o.x;
    this.positions[i3 + 1] = o.y;
    this.positions[i3 + 2] = o.z;
    this.velocities[i3] = o.vx || 0;
    this.velocities[i3 + 1] = o.vy || 0;
    this.velocities[i3 + 2] = o.vz || 0;

    const c = new THREE.Color(o.color === undefined ? 0xffffff : o.color);
    const intensity = o.intensity === undefined ? 1 : o.intensity;
    this.baseColor[i3] = c.r * intensity;
    this.baseColor[i3 + 1] = c.g * intensity;
    this.baseColor[i3 + 2] = c.b * intensity;

    this.baseSize[i] = o.size === undefined ? 0.1 : o.size;
    this.life[i] = this.maxLife[i] = o.life === undefined ? 1 : o.life;
    this.gravity[i] = o.gravity === undefined ? -2.6 : o.gravity;
    this.drag[i] = o.drag === undefined ? 1.6 : o.drag;
    this.spin[i] = o.spin || 0;
    return i;
  }

  /** Radial burst — the workhorse for impacts, dust and sparks. */
  burst(position, options = {}) {
    const count = options.count || 24;
    const speed = options.speed || 2.2;
    const spread = options.spread === undefined ? 1 : options.spread;
    const upward = options.upward === undefined ? 0.6 : options.upward;
    const radius = options.radius || 0.1;

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random() * (1 + spread) * 0.7);
      const s = speed * (0.45 + Math.random() * 0.75);
      const dx = Math.sin(phi) * Math.cos(theta);
      const dz = Math.sin(phi) * Math.sin(theta);
      this.spawn({
        x: position.x + dx * radius,
        y: position.y + (Math.random() - 0.3) * radius,
        z: position.z + dz * radius,
        vx: dx * s,
        vy: Math.abs(Math.cos(phi)) * s * upward + (options.lift || 0),
        vz: dz * s,
        color: Array.isArray(options.color)
          ? options.color[(Math.random() * options.color.length) | 0]
          : options.color,
        size: (options.size || 0.11) * (0.55 + Math.random() * 0.9),
        life: (options.life || 0.85) * (0.6 + Math.random() * 0.7),
        gravity: options.gravity,
        drag: options.drag,
        intensity: options.intensity,
      });
    }
  }

  /** A low, wide puff — footfalls and heavy landings. */
  dust(position, options = {}) {
    const count = options.count || 16;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (options.speed || 1.1) * (0.4 + Math.random());
      this.spawn({
        x: position.x + Math.cos(a) * 0.12,
        y: position.y + 0.03,
        z: position.z + Math.sin(a) * 0.12,
        vx: Math.cos(a) * s,
        vy: 0.25 + Math.random() * 0.4,
        vz: Math.sin(a) * s,
        color: options.color === undefined ? 0xbfae8f : options.color,
        size: (options.size || 0.16) * (0.6 + Math.random()),
        life: 0.55 + Math.random() * 0.45,
        gravity: -0.8,
        drag: 2.6,
        intensity: options.intensity === undefined ? 0.7 : options.intensity,
      });
    }
  }

  /** Sparkles laid down along a moving character's path. */
  trail(position, options = {}) {
    const count = options.count || 2;
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: position.x + (Math.random() - 0.5) * 0.22,
        y: position.y + Math.random() * 0.35,
        z: position.z + (Math.random() - 0.5) * 0.22,
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0.25 + Math.random() * 0.5,
        vz: (Math.random() - 0.5) * 0.3,
        color: options.color,
        size: (options.size || 0.09) * (0.5 + Math.random()),
        life: 0.5 + Math.random() * 0.5,
        gravity: options.gravity === undefined ? 0.25 : options.gravity,
        drag: 1.2,
        intensity: options.intensity === undefined ? 1.3 : options.intensity,
      });
    }
  }

  /** Expanding ground ring — landings, captures, check. */
  ring(position, options = {}) {
    let ring = this.ringPool.pop();
    if (!ring) {
      ring = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 4;
      this.scene.add(ring);
    }
    ring.visible = true;
    ring.position.set(position.x, position.y + 0.07, position.z);
    if (options.vertical) {
      ring.rotation.set(0, options.yaw || 0, 0);
    } else {
      ring.rotation.set(-Math.PI / 2, 0, 0);
    }
    ring.material.color.setHex(options.color === undefined ? 0xffffff : options.color);
    ring.material.opacity = options.opacity === undefined ? 0.9 : options.opacity;
    ring.scale.setScalar(options.from === undefined ? 0.2 : options.from);
    this.rings.push({
      mesh: ring,
      t: 0,
      life: options.life || 0.6,
      from: options.from === undefined ? 0.2 : options.from,
      to: options.to === undefined ? 1.6 : options.to,
      opacity: options.opacity === undefined ? 0.9 : options.opacity,
    });
    return ring;
  }

  /** A brief camera-facing bloom at a point in space. */
  flash(position, options = {}) {
    let flash = this.flashPool.pop();
    if (!flash) {
      flash = new THREE.Mesh(this.flashGeometry, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        toneMapped: false, map: this.points.material.uniforms.uMap.value,
      }));
      flash.renderOrder = 6;
      this.scene.add(flash);
    }
    flash.visible = true;
    flash.position.set(position.x, position.y, position.z);
    flash.material.color.setHex(options.color === undefined ? 0xffffff : options.color);
    flash.material.opacity = 1;
    const size = options.size || 2;
    flash.scale.setScalar(size * 0.4);
    this.flashes.push({ mesh: flash, t: 0, life: options.life || 0.35, size });
    return flash;
  }

  /** Adds camera trauma; the scene squares it for a punchy falloff. */
  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt, camera) {
    this.time += dt;

    // Particles
    const pos = this.positions, vel = this.velocities, col = this.colors, size = this.sizes;
    for (let i = 0; i < PARTICLE_CAPACITY; i++) {
      if (this.life[i] <= 0) { size[i] = 0; continue; }
      this.life[i] -= dt;
      if (this.life[i] <= 0) { size[i] = 0; continue; }

      const i3 = i * 3;
      const damping = Math.max(0, 1 - this.drag[i] * dt);
      vel[i3] *= damping;
      vel[i3 + 1] = vel[i3 + 1] * damping + this.gravity[i] * dt;
      vel[i3 + 2] *= damping;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      // Bounce sparks off the board instead of letting them sink through it.
      if (pos[i3 + 1] < 0.02 && vel[i3 + 1] < 0) {
        pos[i3 + 1] = 0.02;
        vel[i3 + 1] *= -0.32;
      }

      const k = this.life[i] / this.maxLife[i];
      const fade = k * k;
      col[i3] = this.baseColor[i3] * fade;
      col[i3 + 1] = this.baseColor[i3 + 1] * fade;
      col[i3 + 2] = this.baseColor[i3 + 2] * fade;
      size[i] = this.baseSize[i] * (0.35 + k * 0.65);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.size.needsUpdate = true;

    // Top the ambient motes back up as they expire.
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 0.35;
      this.spawn({
        x: (Math.random() - 0.5) * 13,
        y: -0.2,
        z: (Math.random() - 0.5) * 13,
        vx: (Math.random() - 0.5) * 0.05,
        vy: 0.06 + Math.random() * 0.08,
        vz: (Math.random() - 0.5) * 0.05,
        color: 0x8fa7ff,
        size: 0.03 + Math.random() * 0.04,
        life: 9 + Math.random() * 6,
        gravity: 0,
        drag: 0,
        intensity: 0.35,
      });
    }

    // Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      const eased = 1 - Math.pow(1 - k, 3);
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * eased);
      r.mesh.material.opacity = r.opacity * (1 - k);
      if (k >= 1) {
        r.mesh.visible = false;
        this.ringPool.push(r.mesh);
        this.rings.splice(i, 1);
      }
    }

    // Flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      f.mesh.scale.setScalar(f.size * (0.4 + k * 0.9));
      f.mesh.material.opacity = (1 - k) * (1 - k);
      if (camera) f.mesh.quaternion.copy(camera.quaternion);
      if (k >= 1) {
        f.mesh.visible = false;
        this.flashPool.push(f.mesh);
        this.flashes.splice(i, 1);
      }
    }

    this.trauma = Math.max(0, this.trauma - dt * 1.9);
  }

  /** Offset the camera should apply this frame, in world units. */
  shakeOffset(target = _v) {
    const s = this.trauma * this.trauma;
    if (s <= 0) return target.set(0, 0, 0);
    const t = this.time * 34;
    return target.set(
      Math.sin(t * 1.7) * s * 0.34,
      Math.sin(t * 2.3 + 1.1) * s * 0.26,
      Math.sin(t * 1.3 + 2.4) * s * 0.34,
    );
  }
}
