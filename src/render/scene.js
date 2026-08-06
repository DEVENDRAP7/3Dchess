/**
 * Renderer, lighting, and the touch camera.
 *
 * Quality is picked from the device and then adapts: if the frame rate sags
 * the renderer quietly steps down resolution and shadows rather than stuttering.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { worldToSquare } from './board.js';

const TAU = Math.PI * 2;
const _pointer = new THREE.Vector2();
const _shakeOffset = new THREE.Vector3();

export const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 512, antialias: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, antialias: true },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, antialias: true },
};

export function detectQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (cores <= 4 && (memory <= 3 || mobile)) return 'medium';
  if (cores <= 2 || memory <= 2) return 'low';
  return 'high';
}

export class Stage {
  constructor(canvas, theme) {
    this.canvas = canvas;
    this.theme = theme;

    this.qualityName = detectQuality();
    const quality = QUALITY[this.qualityName];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.antialias,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.fog, 16, 46);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
    this.target = new THREE.Vector3(0, 0.15, 0);
    this.desiredTarget = this.target.clone();
    this.homeTarget = this.target.clone();

    // Camera lives on a sphere around the board.
    this.spherical = { radius: 12.5, theta: 0, phi: 0.86 };
    this.desired = { ...this.spherical };
    this.limits = { minRadius: 6.5, maxRadius: 20, minPhi: 0.18, maxPhi: 1.32 };

    this._buildLights();
    this._bindInput();

    this.pickables = [];
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.frameTimes = [];
    this.autoQuality = true;
    this.interacting = false;
    this.spin = 0;
    this.cinematic = false;
    this.resize();
  }

  _buildLights() {
    const theme = this.theme;

    this.hemi = new THREE.HemisphereLight(theme.sky, theme.ground, 0.85);
    this.scene.add(this.hemi);

    this.key = new THREE.DirectionalLight(theme.keyLight, 2.7);
    this.key.position.set(5.5, 11, 6.5);
    this.key.castShadow = true;
    const shadow = this.key.shadow;
    shadow.mapSize.set(QUALITY[this.qualityName].shadowSize, QUALITY[this.qualityName].shadowSize);
    shadow.camera.near = 1;
    shadow.camera.far = 34;
    shadow.camera.left = -7.5;
    shadow.camera.right = 7.5;
    shadow.camera.top = 7.5;
    shadow.camera.bottom = -7.5;
    shadow.bias = -0.0012;
    shadow.normalBias = 0.022;
    this.scene.add(this.key);
    this.scene.add(this.key.target);

    this.fill = new THREE.DirectionalLight(theme.fillLight, 0.8);
    this.fill.position.set(-7, 5, -6);
    this.scene.add(this.fill);

    // Warm and cool pools over each army's home rank.
    this.whiteGlow = new THREE.PointLight(0xffca7a, 18, 12, 2);
    this.whiteGlow.position.set(0, 2.6, -4.6);
    this.scene.add(this.whiteGlow);

    this.blackGlow = new THREE.PointLight(0x9a6bff, 18, 12, 2);
    this.blackGlow.position.set(0, 2.6, 4.6);
    this.scene.add(this.blackGlow);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.42);
    this.scene.add(this.ambient);
  }

  applyTheme(theme) {
    this.theme = theme;
    this.scene.background.setHex(theme.sky);
    this.scene.fog.color.setHex(theme.fog);
    this.hemi.color.setHex(theme.sky);
    this.hemi.groundColor.setHex(theme.ground);
    this.key.color.setHex(theme.keyLight);
    this.fill.color.setHex(theme.fillLight);

    // A daylit board needs flat, generous light; a night board wants contrast
    // and the coloured pools over each army's home rank.
    const bright = !!theme.bright;
    this.hemi.intensity = bright ? 1.25 : 0.85;
    this.ambient.intensity = bright ? 0.75 : 0.42;
    this.key.intensity = bright ? 2.2 : 2.7;
    this.fill.intensity = bright ? 0.55 : 0.8;
    this.whiteGlow.intensity = bright ? 3 : 18;
    this.blackGlow.intensity = bright ? 3 : 18;
    this.scene.fog.near = bright ? 22 : 16;
    this.scene.fog.far = bright ? 70 : 46;
    this.renderer.toneMappingExposure = bright ? 0.98 : 1.08;
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.qualityName = name;
    const quality = QUALITY[name];
    this.renderer.shadowMap.enabled = quality.shadows;
    this.key.castShadow = quality.shadows;
    this.key.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    if (this.key.shadow.map) {
      this.key.shadow.map.dispose();
      this.key.shadow.map = null;
    }
    this.resize();
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, QUALITY[this.qualityName].pixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;

    // A portrait phone is narrow, so the horizontal field of view is what has
    // to fit the board's ~10 units. Widen the lens and stand further back.
    const portrait = height > width;
    this.camera.fov = portrait ? 60 : 46;
    this.limits.minRadius = portrait ? 9 : 6.5;
    this.limits.maxRadius = portrait ? 30 : 20;
    this.camera.updateProjectionMatrix();
    this.portrait = portrait;
  }

  /**
   * Moves the camera somewhere specific for a cinematic. While `cinematic` is
   * set the camera glides rather than snapping, and gestures are ignored.
   */
  flyTo({ target, radius, theta, phi }) {
    this.cinematic = true;
    this.spin = 0;
    if (target) this.desiredTarget.set(target.x, target.y, target.z);
    if (radius !== undefined) this.desired.radius = radius;
    if (phi !== undefined) this.desired.phi = phi;
    if (theta !== undefined) {
      // Take the short way round from wherever the camera currently is.
      const delta = ((theta - this.spherical.theta + Math.PI) % TAU) - Math.PI;
      this.desired.theta = this.spherical.theta + delta;
    }
  }

  /** Ends cinematic mode and hands the camera back to the player. */
  releaseCamera() {
    this.cinematic = false;
    this.desiredTarget.copy(this.homeTarget);
  }

  /** Points the camera from behind the given army. */
  faceSide(color, immediate = false) {
    // theta 0 puts the camera at +Z, which is behind White's home rank.
    this.spin = 0;
    this.cinematic = false;
    this.desiredTarget.copy(this.homeTarget);
    this.desired.theta = color === 'w' ? 0 : Math.PI;
    this.desired.phi = this.portrait ? 0.58 : 0.80;
    this.desired.radius = this.portrait ? 17.0 : 13.2;
    if (immediate) {
      this.spherical.theta = this.desired.theta;
      this.spherical.phi = this.desired.phi;
      this.spherical.radius = this.desired.radius;
      this.target.copy(this.homeTarget);
    } else {
      // Always rotate the short way round.
      const delta = ((this.desired.theta - this.spherical.theta + Math.PI) % TAU) - Math.PI;
      this.desired.theta = this.spherical.theta + delta;
    }
  }

  /**
   * Camera controls.
   *
   * Two rules make this feel precise rather than floaty:
   *
   * 1. While a finger is down the camera is driven *directly* — no easing
   *    between where the gesture says the camera should be and where it is.
   *    Smoothing only runs when the camera is travelling to a target on its
   *    own (flipping sides, settling after a fling).
   * 2. Gestures are absolute, not incremental. A pinch is measured against the
   *    finger spread and radius recorded when the second finger landed, so
   *    zoom cannot drift; rotation is measured against the anchor recorded when
   *    the drag began. Rounding errors never accumulate.
   */
  _bindInput() {
    const canvas = this.canvas;
    const pointers = new Map();

    // Gesture anchors: the camera state and finger geometry at gesture start.
    let anchor = null;
    let dragged = false;
    let downTime = 0;
    let downPos = { x: 0, y: 0 };
    let lastTapTime = 0;
    let lastMoveTime = 0;
    let spinVelocity = 0;

    const viewport = () => Math.min(canvas.clientWidth || 1, canvas.clientHeight || 1);

    const centreOf = (list) => {
      let x = 0, y = 0;
      for (const p of list) { x += p.x; y += p.y; }
      return { x: x / list.length, y: y / list.length };
    };

    /** Re-anchors to the current fingers, keeping the camera exactly where it is. */
    const rebase = () => {
      const list = [...pointers.values()];
      if (!list.length) { anchor = null; return; }
      const centre = centreOf(list);
      anchor = {
        centre,
        theta: this.desired.theta,
        phi: this.desired.phi,
        radius: this.desired.radius,
        spread: list.length >= 2 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 0,
      };
    };

    const onDown = (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragged = false;
        downTime = performance.now();
        downPos = { x: e.clientX, y: e.clientY };
        spinVelocity = 0;
      } else {
        dragged = true;      // a second finger is never a tap
      }
      this.interacting = true;
      rebase();
    };

    const onMove = (e) => {
      if (!pointers.has(e.pointerId) || !anchor) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const list = [...pointers.values()];
      const now = performance.now();

      if (list.length === 1) {
        const travel = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        if (!dragged && travel > 8) { dragged = true; rebase(); return; }
        if (!dragged) return;

        // A full sweep of the short screen edge turns the board half a turn,
        // so the gesture feels the same on any device.
        const span = viewport();
        const dx = e.clientX - anchor.centre.x;
        const dy = e.clientY - anchor.centre.y;
        const previousTheta = this.desired.theta;
        this.desired.theta = anchor.theta - (dx / span) * Math.PI;
        this.desired.phi = clamp(anchor.phi - (dy / span) * Math.PI * 0.8,
          this.limits.minPhi, this.limits.maxPhi);

        // Track spin speed so releasing mid-sweep glides to a stop.
        const dt = Math.max(1, now - lastMoveTime);
        spinVelocity = (this.desired.theta - previousTheta) / dt * 16;
      } else {
        const centre = centreOf(list);
        const spread = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);

        // Zoom is a straight ratio against the spread at pinch start.
        if (anchor.spread > 10 && spread > 10) {
          this.desired.radius = clamp(anchor.radius * (anchor.spread / spread),
            this.limits.minRadius, this.limits.maxRadius);
        }
        // Two fingers can still orbit, using the midpoint.
        const span = viewport();
        this.desired.theta = anchor.theta - ((centre.x - anchor.centre.x) / span) * Math.PI;
        this.desired.phi = clamp(anchor.phi - ((centre.y - anchor.centre.y) / span) * Math.PI * 0.8,
          this.limits.minPhi, this.limits.maxPhi);
      }
      lastMoveTime = now;
    };

    const onUp = (e) => {
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);

      if (pointers.size === 0) {
        this.interacting = false;
        anchor = null;
        // Only carry momentum from a genuine sweep, never from a stray twitch.
        this.spin = dragged && Math.abs(spinVelocity) > 0.004 ? clamp(spinVelocity, -0.09, 0.09) : 0;
      } else {
        rebase();            // lifting one of two fingers must not jump the view
      }

      if (!wasSingle || dragged) return;
      if (performance.now() - downTime > 500) return;

      // Double-tap on empty space reframes the board.
      const now = performance.now();
      if (now - lastTapTime < 300) {
        lastTapTime = 0;
        if (this.onDoubleTap) this.onDoubleTap(e.clientX, e.clientY);
        return;
      }
      lastTapTime = now;
      if (this.onTap) this.onTap(e.clientX, e.clientY);
    };

    canvas.addEventListener('pointerdown', onDown, { passive: true });
    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerup', onUp, { passive: true });
    canvas.addEventListener('pointercancel', onUp, { passive: true });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Exponential so each notch feels the same at any distance.
      const step = Math.exp(clamp(e.deltaY, -120, 120) * 0.0016);
      this.desired.radius = clamp(this.desired.radius * step,
        this.limits.minRadius, this.limits.maxRadius);
      this.spin = 0;
    }, { passive: false });

    // Stop the browser treating board drags as scrolling or page zoom.
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('gesturestart', (e) => e.preventDefault());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Screen coordinates to { square, piece } under the finger. */
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this.pickables, true);
    if (hits.length) {
      // Climb to the piece container — the only node carrying a board square.
      let node = hits[0].object;
      while (node && node.userData?.square === undefined) node = node.parent;
      if (node) return { square: node.userData.square, piece: node };
    }

    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, point)) {
      const square = worldToSquare(point.x, point.z);
      if (square >= 0) return { square, piece: null };
    }
    return { square: -1, piece: null };
  }

  update(dt, effects) {
    // Momentum from a release, decaying smoothly to a stop.
    if (this.spin && !this.interacting) {
      this.desired.theta += this.spin;
      this.spin *= Math.pow(0.045, dt);
      if (Math.abs(this.spin) < 0.0006) this.spin = 0;
    }

    if (this.interacting && !this.cinematic) {
      // Under the finger the camera goes exactly where the gesture puts it.
      this.spherical.theta = this.desired.theta;
      this.spherical.phi = this.desired.phi;
      this.spherical.radius = this.desired.radius;
    } else {
      // A slower glide during a cinematic; the usual snap otherwise.
      const rate = this.cinematic ? 0.16 : 0.0016;
      const smoothing = 1 - Math.pow(rate, dt);
      this.spherical.theta += (this.desired.theta - this.spherical.theta) * smoothing;
      this.spherical.phi += (this.desired.phi - this.spherical.phi) * smoothing;
      this.spherical.radius += (this.desired.radius - this.spherical.radius) * smoothing;
    }
    const targetRate = 1 - Math.pow(this.cinematic ? 0.16 : 0.002, dt);
    this.target.lerp(this.desiredTarget, targetRate);

    const { radius, theta, phi } = this.spherical;
    const sinPhi = Math.sin(phi);
    this.camera.position.set(
      this.target.x + radius * sinPhi * Math.sin(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * sinPhi * Math.cos(theta),
    );

    if (effects) {
      effects.shakeOffset(_shakeOffset);
      this.camera.position.add(_shakeOffset);
    }
    this.camera.lookAt(this.target);

    this._trackPerformance(dt);
  }

  /** Drops quality a tier if we spend too long below ~40fps. */
  _trackPerformance(dt) {
    if (!this.autoQuality) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const average = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (average > 0.025) {
      if (this.qualityName === 'high') this.setQuality('medium');
      else if (this.qualityName === 'medium') this.setQuality('low');
      else this.autoQuality = false;
    } else if (average < 0.0145 && this.qualityName === 'low') {
      this.autoQuality = false; // don't oscillate
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
