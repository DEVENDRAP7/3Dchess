/**
 * The arena: 64 squares, a carved frame with rank/file lettering, a stage the
 * whole thing floats on, and the pool of markers used to show selection, legal
 * moves, captures, the last move played and check.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { Rig, G, FINISH } from './rig.js';
import { HIGHLIGHT } from './palette.js';

export const SQUARE = 1;
export const BOARD_TOP = 0;

/**
 * Board index (rank*8+file) to world position.
 * The a-file runs along -X and rank 1 sits at +Z, so a camera standing behind
 * White (at +Z, looking down -Z) sees the board the way a player does: a1 in
 * the near-left corner.
 */
export function squareToWorld(index, target = new THREE.Vector3()) {
  return target.set((index & 7) - 3.5, BOARD_TOP, 3.5 - (index >> 3));
}

export function worldToSquare(x, z) {
  const file = Math.round(x + 3.5);
  const rank = Math.round(3.5 - z);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return rank * 8 + file;
}

export function createBoard(theme, materials) {
  const root = new THREE.Group();
  const rig = new Rig();

  // Playing surface — light and dark squares merge into one mesh each.
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const light = (file + rank) % 2 === 1;
      rig.add(G.box(0.98, 0.10, 0.98), light ? theme.light : theme.dark, FINISH.MATTE,
        { p: [file - 3.5, -0.05, 3.5 - rank] });
    }
  }

  // Frame
  const inner = 4.0, outer = 4.78;
  const railLength = outer * 2;
  const railWidth = outer - inner;
  const railCentre = (outer + inner) / 2;
  for (const [px, pz, sx, sz] of [
    [0, railCentre, railLength, railWidth],
    [0, -railCentre, railLength, railWidth],
    [railCentre, 0, railWidth, railLength],
    [-railCentre, 0, railWidth, railLength],
  ]) {
    rig.add(G.box(sx, 0.16, sz), theme.frame, FINISH.MATTE, { p: [px, -0.03, pz] });
  }
  // Inner lip and outer bead in polished metal
  rig.add(G.box(8.14, 0.045, 8.14), theme.frameTrim, FINISH.METAL, { p: [0, 0.048, 0] });
  rig.add(G.box(8.0, 0.08, 8.0), theme.frame, FINISH.MATTE, { p: [0, 0.05, 0] });
  rig.add(G.box(9.68, 0.03, 9.68), theme.frameTrim, FINISH.METAL, { p: [0, -0.10, 0] });
  rig.add(G.box(9.56, 0.20, 9.56), theme.frame, FINISH.MATTE, { p: [0, -0.19, 0] });

  const boardMesh = rig.compile(materials);
  boardMesh.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = false;      // the board is what shadows land on
    node.receiveShadow = true;
  });
  root.add(boardMesh);

  // Rank/file lettering, painted once into a canvas laid over the frame.
  const labels = new THREE.Mesh(
    new THREE.PlaneGeometry(9.56, 9.56),
    new THREE.MeshBasicMaterial({
      map: makeLabelTexture(theme),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  labels.rotation.x = -Math.PI / 2;
  labels.position.y = 0.056;
  labels.renderOrder = 1;
  root.add(labels);

  // The stage the board sits on — catches shadow and grounds the scene.
  const stage = new THREE.Mesh(
    new THREE.CircleGeometry(26, 48),
    new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 0.95, metalness: 0.0 }),
  );
  stage.rotation.x = -Math.PI / 2;
  stage.position.y = -0.32;
  stage.receiveShadow = true;
  root.add(stage);

  return { root, labels, stage };
}

function makeLabelTexture(theme) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const px = size / 9.56;              // pixels per board unit
  const centre = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#' + theme.frameTrim.toString(16).padStart(6, '0');
  ctx.font = `600 ${Math.round(px * 0.34)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.92;

  // The plane is laid flat face-up: canvas +X is world +X and canvas +Y is
  // world +Z, which is also "towards the White player". So text drawn normally
  // reads upright from White's side of the board.
  const toCanvasX = (worldX) => centre + worldX * px;
  const toCanvasY = (worldZ) => centre + worldZ * px;
  const edge = 4.38; // middle of the frame rail, in board units

  for (let f = 0; f < 8; f++) {
    const x = toCanvasX(f - 3.5);
    const letter = 'abcdefgh'[f];
    ctx.fillText(letter, x, toCanvasY(edge));           // White's rail
    ctx.save();
    ctx.translate(x, toCanvasY(-edge));                 // Black's rail
    ctx.rotate(Math.PI);
    ctx.fillText(letter, 0, 0);
    ctx.restore();
  }
  for (let r = 0; r < 8; r++) {
    const y = toCanvasY(3.5 - r);
    const label = String(r + 1);
    ctx.save();
    ctx.translate(toCanvasX(edge), y);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(label, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(toCanvasX(-edge), y);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// ---------------------------------------------------------------------------
// Square markers
// ---------------------------------------------------------------------------

const MARKER_STYLES = {
  select: { color: HIGHLIGHT.select, kind: 'ring', opacity: 0.95 },
  move: { color: HIGHLIGHT.move, kind: 'dot', opacity: 0.8 },
  capture: { color: HIGHLIGHT.capture, kind: 'ring', opacity: 0.9 },
  castle: { color: HIGHLIGHT.castle, kind: 'ring', opacity: 0.85 },
  lastFrom: { color: HIGHLIGHT.lastMove, kind: 'square', opacity: 0.28 },
  lastTo: { color: HIGHLIGHT.lastMove, kind: 'square', opacity: 0.45 },
  check: { color: HIGHLIGHT.check, kind: 'ring', opacity: 1 },
  hint: { color: HIGHLIGHT.select, kind: 'square', opacity: 0.35 },
};

export class Markers {
  constructor(parent) {
    this.parent = parent;
    this.pool = [];
    this.active = [];
    this.group = new THREE.Group();
    this.group.renderOrder = 2;
    parent.add(this.group);

    this.geometries = {
      ring: new THREE.RingGeometry(0.36, 0.46, 28),
      dot: new THREE.CircleGeometry(0.15, 20),
      square: new THREE.PlaneGeometry(0.98, 0.98),
    };
  }

  _acquire() {
    let marker = this.pool.pop();
    if (!marker) {
      marker = new THREE.Mesh(this.geometries.ring, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      }));
      marker.rotation.x = -Math.PI / 2;
      this.group.add(marker);
    }
    marker.visible = true;
    this.active.push(marker);
    return marker;
  }

  clear() {
    for (const marker of this.active) {
      marker.visible = false;
      this.pool.push(marker);
    }
    this.active.length = 0;
  }

  add(square, style) {
    const spec = MARKER_STYLES[style];
    if (!spec) return null;
    const marker = this._acquire();
    marker.geometry = this.geometries[spec.kind];
    marker.material.color.setHex(spec.color);
    marker.material.opacity = spec.opacity;
    const pos = squareToWorld(square);
    marker.position.set(pos.x, 0.062 + (spec.kind === 'square' ? 0 : 0.002), pos.z);
    marker.scale.setScalar(1);
    marker.userData.style = style;
    marker.userData.baseOpacity = spec.opacity;
    return marker;
  }

  /** Gentle pulse so the markers read as live UI rather than decals. */
  update(time) {
    for (const marker of this.active) {
      const style = marker.userData.style;
      if (style === 'check') {
        const pulse = 0.5 + 0.5 * Math.sin(time * 7);
        marker.material.opacity = 0.55 + pulse * 0.45;
        marker.scale.setScalar(1 + pulse * 0.09);
      } else if (style === 'select') {
        marker.rotation.z = time * 0.6;
        marker.scale.setScalar(1 + Math.sin(time * 3.4) * 0.05);
      } else if (style === 'move' || style === 'capture') {
        marker.scale.setScalar(1 + Math.sin(time * 3 + marker.position.x) * 0.08);
      }
    }
  }

  dispose() {
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
  }
}
