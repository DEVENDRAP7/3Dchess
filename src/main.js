/**
 * Chessforge — game orchestration.
 *
 * Owns the rules state, the 3D board, input, the opponent (local, computer or
 * a peer over WebRTC) and everything the player sees on top of the canvas.
 */

import * as THREE from '../vendor/three.module.min.js';

import {
  createInitialState, cloneState, generateLegalMoves, makeMove, getGameStatus,
  toSAN, toFEN, colorOf, typeOf, opponent, squareName, findKing, inCheck,
  analyseMate, PIECE_NAMES,
} from './chess/engine.js';
import { findBestMove } from './chess/ai.js';

import { createFinishMaterials } from './render/rig.js';
import { PALETTE, BOARD_THEMES } from './render/palette.js';
import { createBoard, Markers, squareToWorld } from './render/board.js';
import { buildPrototypes, spawnPiece, updateIdle, baseYawFor } from './render/pieces.js';
import { Effects } from './render/effects.js';
import {
  Animator, buildMoveAnimation, buildCaptureAnimation, buildPromotionAnimation,
  buildDefeatAnimation,
} from './render/animations.js';
import { Stage } from './render/scene.js';

import { Sfx } from './audio/sfx.js';
import { Hud, $, GLYPH } from './ui/hud.js';
import { CODEX, ARMIES, captureLine } from './game/lore.js';
import { OnlineSession, roomCodeFromUrl, inviteLink } from './net/online.js';

const SETTINGS_KEY = 'chessforge.settings.v1';
const SAVE_KEY = 'chessforge.save.v1';
const PROTOCOL = 2;

const DEFAULT_SETTINGS = {
  sound: true,
  hints: true,
  autoCam: true,
  theme: 'classic',
  quality: 'auto',
  speed: 1,
};

class Chessforge {
  constructor() {
    this.settings = this._loadSettings();
    this.hud = new Hud();
    this.sfx = new Sfx();

    this.state = null;
    this.mode = 'ai';
    this.playerColor = 'w';
    this.difficulty = 'casual';
    this.history = [];
    this.sanList = [];
    this.pieces = new Map();
    this.selected = null;
    this.legalForSelected = [];
    this.busy = false;
    this.gameOver = false;
    this.hintMove = null;

    this.online = null;
    this.rematch = { mine: false, theirs: false };
    // Bumped by every startGame. Async work (an AI search, a queued remote
    // move) captures it and drops itself if the game moved on meanwhile.
    this.generation = 0;
  }

  // ---------------------------------------------------------------- boot ---

  async boot() {
    const progress = (percent, note) => {
      $('bootFill').style.width = percent + '%';
      if (note) $('bootNote').textContent = note;
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    };

    await progress(12, 'Raising the board…');
    const theme = BOARD_THEMES[this.settings.theme] || BOARD_THEMES.classic;
    this.stage = new Stage($('stage'), theme);
    if (this.settings.quality !== 'auto') {
      this.stage.autoQuality = false;
      this.stage.setQuality(this.settings.quality);
    }

    this.materials = createFinishMaterials();
    this.board = createBoard(theme, this.materials);
    this.stage.scene.add(this.board.root);
    this.markers = new Markers(this.stage.scene);
    this.stage.applyTheme(theme);
    document.documentElement.dataset.ui = theme.bright ? 'light' : 'dark';

    await progress(38, 'Forging the Dawn Legion…');
    this.prototypes = buildPrototypes(this.materials);

    await progress(72, 'Summoning the Umbral Court…');
    this.effects = new Effects(this.stage.scene);
    this.effects.setBright(!!theme.bright);
    this.animator = new Animator(this.effects, this.sfx);
    this.pieceGroup = new THREE.Group();
    this.stage.scene.add(this.pieceGroup);
    this.stage.pickables = [this.pieceGroup];
    this.stage.onTap = (x, y) => this.onTap(x, y);
    // Double-tap reframes the board — an easy way back from an odd angle.
    this.stage.onDoubleTap = () => {
      this.stage.faceSide(this.bottomColor());
      this.hud.toast('View reset');
    };

    await progress(92, 'Setting the pieces…');
    this._bindUi();
    this._applySettingsToUi();
    this.sfx.setEnabled(this.settings.sound);

    // Idle demo board behind the menu so the title screen isn't empty.
    this.state = createInitialState();
    this.refreshPieces();
    this.stage.faceSide('w', true);

    this._loop();
    await progress(100, 'Ready');

    $('boot').classList.add('hidden');
    $('menu').classList.remove('hidden');

    const roomCode = roomCodeFromUrl();
    if (roomCode) {
      this._navigate('setup-online');
      $('joinCode').value = roomCode;
      this.hud.toast('Room code filled in — tap Join');
    }
    this._refreshHomeButtons();
  }

  // ------------------------------------------------------------ settings ---

  _loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  _saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
  }

  _applySettingsToUi() {
    $('setSound').checked = this.settings.sound;
    $('setHints').checked = this.settings.hints;
    $('setAutoCam').checked = this.settings.autoCam;
    this._segSelect('themeChoice', 'theme', this.settings.theme);
    this._segSelect('qualityChoice', 'quality', this.settings.quality);
    this._segSelect('speedChoice', 'speed', String(this.settings.speed));
    $('soundBtn').textContent = this.settings.sound ? '🔊' : '🔇';
  }

  _segSelect(containerId, attribute, value) {
    for (const button of $(containerId).children) {
      button.classList.toggle('on', button.dataset[attribute] === value);
    }
  }

  // ------------------------------------------------------------- ui wiring --

  _bindUi() {
    document.body.addEventListener('pointerdown', () => this.sfx.unlock(), { once: true });

    for (const el of document.querySelectorAll('[data-nav]')) {
      el.addEventListener('click', () => {
        this.sfx.click();
        this._navigate(el.dataset.nav);
      });
    }

    // Army + difficulty selection
    for (const button of $('sideChoice').children) {
      button.addEventListener('click', () => {
        this.sfx.click();
        for (const other of $('sideChoice').children) other.classList.toggle('on', other === button);
        this.pendingSide = button.dataset.side;
      });
    }
    $('sideChoice').children[0].classList.add('on');
    this.pendingSide = 'w';

    for (const button of $('difficultyChoice').children) {
      button.addEventListener('click', () => {
        this.sfx.click();
        this._segSelect('difficultyChoice', 'difficulty', button.dataset.difficulty);
        this.difficulty = button.dataset.difficulty;
        $('difficultyNote').textContent = {
          novice: 'Learning the ropes. Misses tactics and leaves pieces hanging.',
          casual: 'Plays quickly and punishes obvious blunders.',
          skilled: 'Looks several moves ahead and will take what you leave loose.',
          master: 'Searches deeply and plays to win. Expect no gifts.',
        }[button.dataset.difficulty];
      });
    }

    $('startBtn').addEventListener('click', () => {
      this.sfx.click();
      const side = this.pendingSide === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : this.pendingSide;
      this.startGame({ mode: this.pendingMode, playerColor: side, difficulty: this.difficulty });
    });

    $('resumeBtn').addEventListener('click', () => { this.sfx.click(); this._resume(); });

    // In-game controls
    $('menuBtn').addEventListener('click', () => {
      this.sfx.click();
      $('menu').classList.remove('hidden');
      this._navigate('home');
    });

    // Closing the menu is the safe default when a match is under way.
    $('backToGameBtn').addEventListener('click', () => {
      this.sfx.click();
      $('menu').classList.add('hidden');
    });

    $('leaveGameBtn').addEventListener('click', () => {
      this.sfx.click();
      if (this.inOnlineGame) {
        this.online.send({ t: 'resign' });
        this._leaveOnline();
      }
      this.gameOver = true;
      this.state = null;
      this.history = [];
      $('hud').classList.add('hidden');
      this._navigate('home');
      this.hud.toast('Match left');
    });
    $('soundBtn').addEventListener('click', () => {
      this.settings.sound = !this.settings.sound;
      this.sfx.setEnabled(this.settings.sound);
      this._saveSettings();
      this._applySettingsToUi();
      this.sfx.click();
    });
    $('flipBtn').addEventListener('click', () => {
      this.sfx.click();
      const facing = this.stage.desired.theta;
      const towardsBlack = Math.abs(((facing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) < 1.2;
      this.stage.faceSide(towardsBlack ? 'w' : 'b');
    });
    $('undoBtn').addEventListener('click', () => this.undo());
    $('hintBtn').addEventListener('click', () => this.showHint());
    $('movesBtn').addEventListener('click', () => {
      this.sfx.click();
      $('movesPanel').classList.toggle('hidden');
      $('fenNote').textContent = this.state ? 'FEN copied with the game' : '';
    });
    $('movesClose').addEventListener('click', () => $('movesPanel').classList.add('hidden'));
    $('copyPgnBtn').addEventListener('click', () => this._copyGame());
    $('cardClose').addEventListener('click', () => this.hud.hideCard());

    // Settings
    $('setSound').addEventListener('change', (e) => {
      this.settings.sound = e.target.checked;
      this.sfx.setEnabled(e.target.checked);
      this._saveSettings();
      $('soundBtn').textContent = this.settings.sound ? '🔊' : '🔇';
    });
    $('setHints').addEventListener('change', (e) => {
      this.settings.hints = e.target.checked;
      this._saveSettings();
      this.updateMarkers();
    });
    $('setAutoCam').addEventListener('change', (e) => {
      this.settings.autoCam = e.target.checked;
      this._saveSettings();
    });
    for (const button of $('themeChoice').children) {
      button.addEventListener('click', () => {
        this.sfx.click();
        this.settings.theme = button.dataset.theme;
        this._saveSettings();
        this._segSelect('themeChoice', 'theme', this.settings.theme);
        this._applyTheme();
      });
    }
    for (const button of $('qualityChoice').children) {
      button.addEventListener('click', () => {
        this.sfx.click();
        this.settings.quality = button.dataset.quality;
        this._saveSettings();
        this._segSelect('qualityChoice', 'quality', this.settings.quality);
        if (this.settings.quality === 'auto') {
          this.stage.autoQuality = true;
        } else {
          this.stage.autoQuality = false;
          this.stage.setQuality(this.settings.quality);
        }
      });
    }
    for (const button of $('speedChoice').children) {
      button.addEventListener('click', () => {
        this.sfx.click();
        this.settings.speed = Number(button.dataset.speed);
        this._saveSettings();
        this._segSelect('speedChoice', 'speed', String(this.settings.speed));
      });
    }

    // Codex
    for (const button of $('codexArmy').children) {
      button.addEventListener('click', () => {
        this.sfx.click();
        this._segSelect('codexArmy', 'army', button.dataset.army);
        this.hud.renderCodex(button.dataset.army);
      });
    }

    // Online
    $('hostBtn').addEventListener('click', () => this.hostRoom());
    $('joinBtn').addEventListener('click', () => this.joinRoom());
    $('joinCode').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    });
    $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinRoom(); });
    $('copyLinkBtn').addEventListener('click', () => this._copyInvite());
    $('shareBtn').addEventListener('click', () => this._shareInvite());
    $('onlineBackBtn').addEventListener('click', () => this._leaveOnline());

    // Game over
    $('rematchBtn').addEventListener('click', () => this.requestRematch());
    $('mateRematchBtn').addEventListener('click', () => {
      this.hud.hideMateScreen();
      this.requestRematch();
    });
    $('mateMenuBtn').addEventListener('click', () => {
      this.sfx.click();
      this.hud.hideMateScreen();
      this._leaveOnline();
      $('menu').classList.remove('hidden');
      this._navigate('home');
    });
    $('overMenuBtn').addEventListener('click', () => {
      this.sfx.click();
      this.hud.hideGameOver();
      this._leaveOnline();
      $('menu').classList.remove('hidden');
      this._navigate('home');
    });

    window.addEventListener('resize', () => this.stage.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.stage.resize(), 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._save();
    });
  }

  _navigate(target) {
    const panels = {
      home: 'menuHome', setup: 'menuSetup', online: 'menuOnline',
      settings: 'menuSettings', codex: 'menuCodex',
    };
    let key = target;
    if (target === 'setup-ai') { key = 'setup'; this.pendingMode = 'ai'; }
    else if (target === 'setup-local') { key = 'setup'; this.pendingMode = 'local'; }
    else if (target === 'setup-online') { key = 'online'; this.pendingMode = 'online'; }

    for (const [name, id] of Object.entries(panels)) {
      $(id).classList.toggle('hidden', name !== key);
    }
    if (key === 'setup') {
      const ai = this.pendingMode === 'ai';
      $('difficultyBlock').classList.toggle('hidden', !ai);
      $('setupTitle').textContent = ai ? 'Choose your army' : 'Who moves first?';
    }
    if (key === 'codex') this.hud.renderCodex('w');
    if (key === 'home') this._refreshHomeButtons();
  }

  /**
   * "Return to game" resumes what is on screen; "Resume saved game" loads from
   * storage and so is only offered when nothing is in progress. Conflating the
   * two is how a live online match used to get replaced by an old one.
   */
  _refreshHomeButtons() {
    const live = this.inProgress || this.inOnlineGame;
    $('backToGameBtn').classList.toggle('hidden', !live);
    $('leaveGameBtn').classList.toggle('hidden', !live);
    $('resumeBtn').classList.toggle('hidden', live || !this._hasSave());
    if (live) {
      $('backToGameNote').textContent = this.mode === 'online'
        ? (this.online?.connected ? 'Your opponent is still connected' : 'Reconnecting to your opponent')
        : 'Your match is still going';
    }
  }

  _applyTheme() {
    const theme = BOARD_THEMES[this.settings.theme];
    this.stage.applyTheme(theme);
    this.effects?.setBright(!!theme.bright);
    // Panels sit over the board, so the interface follows the board's mood.
    document.documentElement.dataset.ui = theme.bright ? 'light' : 'dark';
    this.stage.scene.remove(this.board.root);
    // The board owns its geometry and its lettering texture, unlike the pieces.
    disposeTree(this.board.root);
    this.board = createBoard(theme, this.materials);
    this.stage.scene.add(this.board.root);
  }

  // ---------------------------------------------------------- game setup ---

  startGame({ mode, playerColor, difficulty, silent = false }) {
    // Never leave a peer hanging when the player starts something else.
    if (this.mode === 'online' && mode !== 'online' && this.online) {
      this.online.send({ t: 'resign' });
      this._leaveOnline();
    }
    this.generation++;
    this.mode = mode;
    this.playerColor = playerColor;
    if (difficulty) this.difficulty = difficulty;

    this.state = createInitialState();
    this.history = [];
    this.sanList = [];
    this.selected = null;
    this.legalForSelected = [];
    this.hintMove = null;
    this.gameOver = false;
    this.busy = false;
    this.baseCaptured = { w: [], b: [] };
    this.rematch = { mine: false, theirs: false };

    this.refreshPieces();
    this.hud.setMoves([]);
    this.hud.setCaptured({ w: [], b: [] }, this.bottomColor());
    this.hud.hideGameOver();
    this.hud.hideMateScreen();
    this.hud.hideCard();
    this.mateAnalysis = null;
    $('cinematic').classList.add('hidden');
    this.stage.releaseCamera();
    $('movesPanel').classList.add('hidden');
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('undoBtn').classList.toggle('hidden', mode === 'online');
    $('hintBtn').classList.toggle('hidden', mode === 'online');

    this.stage.faceSide(this.bottomColor(), true);
    this.updateMarkers();
    this.updateTurnUi();
    if (!silent) {
      this.hud.ticker(mode === 'online'
        ? `You command the ${ARMIES[playerColor].name}`
        : `${ARMIES[this.state.turn].name} to move`);
    }
    this._save();
    this.maybeAiMove();
  }

  /** True while a match is under way — online, versus the computer, or local. */
  get inProgress() {
    return !!this.state && !this.gameOver && this.history.length > 0;
  }

  /** An online match is live only while the peer link is actually up. */
  get inOnlineGame() {
    return this.mode === 'online' && !this.gameOver && !!this.online;
  }

  /** Which army sits nearest the camera. */
  bottomColor() {
    if (this.mode === 'local') return this.state ? this.state.turn : 'w';
    return this.playerColor;
  }

  isPlayersTurn() {
    if (this.gameOver || this.busy) return false;
    if (this.mode === 'local') return true;
    return this.state.turn === this.playerColor;
  }

  // --------------------------------------------------------- piece board ---

  refreshPieces() {
    for (const piece of this.pieces.values()) this.pieceGroup.remove(piece);
    this.pieces.clear();

    for (let square = 0; square < 64; square++) {
      const code = this.state.board[square];
      if (!code) continue;
      this.addPiece(square, colorOf(code), typeOf(code));
    }
  }

  addPiece(square, color, type) {
    const piece = spawnPiece(this.prototypes, color, type);
    const position = squareToWorld(square);
    piece.position.set(position.x, 0, position.z);
    piece.rotation.y = baseYawFor(color);
    piece.userData.square = square;
    this.pieceGroup.add(piece);
    this.pieces.set(square, piece);
    return piece;
  }

  /**
   * Pieces are clones of the twelve prototypes and share their geometry and
   * materials, so they are only detached — never disposed.
   */
  removePiece(piece) {
    this.pieceGroup.remove(piece);
  }

  // -------------------------------------------------------------- input ---

  onTap(clientX, clientY) {
    this.sfx.unlock();
    if (!this.state || this.gameOver) return;
    const { square, piece } = this.stage.pick(clientX, clientY);
    if (square < 0) { this.deselect(); this.hud.hideCard(); return; }

    // Tapping the selected piece again opens its codex card.
    if (this.selected === square) {
      const code = this.state.board[square];
      if (code) this.hud.showCard(colorOf(code), typeOf(code));
      this.deselect();
      return;
    }

    if (this.selected !== null) {
      const candidates = this.legalForSelected.filter((m) => m.to === square);
      if (candidates.length) { this.tryMove(candidates); return; }
    }

    const code = this.state.board[square];
    if (!code) { this.deselect(); return; }

    const color = colorOf(code);
    const mine = this.mode === 'local' ? color === this.state.turn : color === this.playerColor;

    if (mine && color === this.state.turn && this.isPlayersTurn()) {
      this.select(square);
    } else {
      // Not yours to move — show who they are instead.
      this.hud.showCard(color, typeOf(code));
      this.deselect();
      if (!this.busy && color === this.state.turn) this.sfx.deny();
    }
  }

  select(square) {
    this.selected = square;
    this.legalForSelected = generateLegalMoves(this.state).filter((m) => m.from === square);
    this.hintMove = null;
    this.sfx.select();

    // Name the character on selection — at board scale the models are small,
    // and this saves squinting to work out which piece you just picked up.
    const code = this.state.board[square];
    if (code) {
      const entry = CODEX[colorOf(code)][typeOf(code)];
      const moves = this.legalForSelected.length;
      this.hud.ticker(`${entry.name} · ${entry.rank} — ${moves} move${moves === 1 ? '' : 's'}`);
    }
    const piece = this.pieces.get(square);
    if (piece) {
      this.effects.ring(piece.position, {
        color: PALETTE[piece.userData.color].glow, life: 0.45, from: 0.3, to: 1.1, opacity: 0.5,
      });
    }
    this.updateMarkers();
  }

  deselect() {
    this.selected = null;
    this.legalForSelected = [];
    this.updateMarkers();
  }

  async tryMove(candidates) {
    let move = candidates[0];
    if (candidates.length > 1 && candidates[0].promo) {
      // Promotion: let the player pick what the soldier becomes.
      const choice = await this.hud.askPromotion(this.state.turn);
      move = candidates.find((m) => m.promo === choice) || move;
    }
    this.deselect();
    await this.commitMove(move, { local: true });
  }

  // ------------------------------------------------------------- moving ---

  async commitMove(move, { local = false } = {}) {
    if (this.busy || this.gameOver) return;
    this.busy = true;
    this.hintMove = null;

    const san = toSAN(this.state, move);
    const snapshot = cloneState(this.state);
    const mover = this.state.turn;

    if (local && this.mode === 'online' && this.online?.connected) {
      this.online.send({
        t: 'move', ply: this.history.length,
        from: move.from, to: move.to, promo: move.promo || null,
      });
    }

    const animation = this.animateMove(move);

    makeMove(this.state, move, true);
    this.history.push({ move, san, snapshot });
    this.sanList.push(san);

    if (move.captured) {
      const victimColor = opponent(mover);
      this.hud.ticker(captureLine(
        { color: mover, type: typeOf(move.piece) },
        { color: victimColor, type: typeOf(move.captured) },
      ));
    }

    this.hud.setMoves(this.sanList);
    this.hud.setCaptured(this.capturedTally(), this.bottomColor());
    this.updateTurnUi();

    await animation;

    this.busy = false;
    this.afterMove();
  }

  /** Builds and runs the visual half of a move. */
  async animateMove(move) {
    const piece = this.pieces.get(move.from);
    if (!piece) return; // board was rebuilt underneath us
    const from = squareToWorld(move.from);
    const to = squareToWorld(move.to);
    const speed = this.settings.speed;

    const victimSquare = move.flag === 'enpassant' ? move.epCapture : (move.captured ? move.to : -1);
    const victim = victimSquare >= 0 ? this.pieces.get(victimSquare) : null;

    // Re-key the registry up front; input is blocked until the move resolves.
    if (victim) this.pieces.delete(victimSquare);
    this.pieces.delete(move.from);
    this.pieces.set(move.to, piece);
    piece.userData.square = move.to;

    const spec = buildMoveAnimation({
      piece, from, to, effects: this.effects, audio: this.sfx,
      isCapture: !!victim, speed,
    });

    const pending = [];

    if (victim) {
      // The kill fires partway through the attacker's run, so its promise has
      // to exist before the animation starts.
      const victimAt = squareToWorld(victimSquare);
      let settleVictim;
      pending.push(new Promise((resolve) => { settleVictim = resolve; }));
      spec.events.push({
        at: spec.impactAt,
        fn: () => {
          const capture = buildCaptureAnimation({
            victim, attacker: piece, at: victimAt,
            effects: this.effects, audio: this.sfx,
            attackerType: piece.userData.type,
          });
          this.animator.play(capture).then(() => {
            this.removePiece(victim);
            settleVictim();
          });
        },
      });
    }

    if (move.flag === 'castle') {
      const rook = this.pieces.get(move.rookFrom);
      if (rook) {
        this.pieces.delete(move.rookFrom);
        this.pieces.set(move.rookTo, rook);
        rook.userData.square = move.rookTo;
        const rookSpec = buildMoveAnimation({
          piece: rook,
          from: squareToWorld(move.rookFrom),
          to: squareToWorld(move.rookTo),
          effects: this.effects, audio: null, isCapture: false, speed,
        });
        pending.push(this.animator.play(rookSpec));
      }
      this.sfx.castle();
    }

    pending.push(this.animator.play(spec));
    await Promise.all(pending);

    if (move.promo) {
      const color = piece.userData.color;
      const ref = { current: piece };
      const promotion = buildPromotionAnimation({
        ref, at: to, effects: this.effects, audio: this.sfx, color,
      });
      promotion.events.push({
        at: promotion.swapAt,
        fn: () => {
          this.removePiece(piece);
          const promoted = this.addPiece(move.to, color, move.promo);
          promoted.scale.setScalar(0.001);
          ref.current = promoted;
        },
      });
      await this.animator.play(promotion);
    }
  }

  afterMove() {
    const status = getGameStatus(this.state);
    this.updateMarkers();
    this.updateTurnUi();
    this._save();

    if (status.over) {
      this.endGame(status);
      return;
    }

    if (status.check) {
      this.sfx.check();
      const king = findKing(this.state, this.state.turn);
      const at = squareToWorld(king);
      this.effects.ring(at, { color: 0xff3b47, life: 0.7, from: 0.3, to: 2.0, opacity: 0.95 });
      this.effects.flash({ x: at.x, y: 0.9, z: at.z }, { color: 0xff5560, size: 2.4, life: 0.35 });
      this.effects.shake(0.22);
      this.hud.ticker(`${ARMIES[this.state.turn].name} — your king is in check!`, { alarm: true });
    }

    if (this.mode === 'local' && this.settings.autoCam) {
      this.stage.faceSide(this.state.turn);
      this.hud.setCaptured(this.capturedTally(), this.state.turn);
    }

    this.maybeAiMove();
  }

  /**
   * Which pieces each army has lost. Rebuilt from move history every time, so
   * it stays correct through undo; `baseCaptured` carries losses from before a
   * resumed game, whose history snapshots aren't persisted.
   */
  capturedTally() {
    const base = this.baseCaptured || { w: [], b: [] };
    const lost = { w: base.w.slice(), b: base.b.slice() };
    for (const entry of this.history) {
      if (!entry.move.captured) continue;
      const victim = entry.move.captured;
      lost[colorOf(victim)].push(typeOf(victim));
    }
    return lost;
  }

  // ---------------------------------------------------------------- ai -----

  maybeAiMove() {
    if (this.mode !== 'ai' || this.gameOver) return;
    if (this.state.turn === this.playerColor) return;
    this.thinkThenMove();
  }

  async thinkThenMove() {
    const generation = this.generation;
    this.hud.setTurn(this.state.turn, {
      label: `${ARMIES[this.state.turn].name} is planning…`,
      thinking: true,
      check: inCheck(this.state, this.state.turn),
    });

    const result = await this.search(this.state, this.difficulty);
    $('thinking').classList.add('hidden');
    // A search can outlive the game that started it — never play into a
    // different game than the one we were thinking about.
    if (!result || this.gameOver || generation !== this.generation) return;

    // Match the move object to one the engine generated for this position.
    const move = generateLegalMoves(this.state).find((m) =>
      m.from === result.move.from && m.to === result.move.to &&
      (m.promo || null) === (result.move.promo || null));
    if (!move) return;
    await this.commitMove(move);
  }

  /** Runs the search in a worker when possible, on the main thread otherwise. */
  search(state, difficulty) {
    const payload = {
      board: state.board, turn: state.turn, castling: state.castling,
      ep: state.ep, halfmove: state.halfmove, fullmove: state.fullmove,
      repetition: {},
    };

    if (this.worker === undefined) {
      try {
        this.worker = new Worker(new URL('./chess/ai.worker.js', import.meta.url), { type: 'module' });
        this.workerJobs = new Map();
        this.workerSeq = 0;
        this.worker.onmessage = (event) => {
          const job = this.workerJobs.get(event.data.id);
          if (!job) return;
          this.workerJobs.delete(event.data.id);
          job(event.data.ok ? event.data.result : null);
        };
        this.worker.onerror = () => { this.worker = null; };
      } catch {
        this.worker = null;
      }
    }

    if (this.worker) {
      return new Promise((resolve) => {
        const id = ++this.workerSeq;
        this.workerJobs.set(id, resolve);
        this.worker.postMessage({ id, state: payload, difficulty });
        // If the worker dies mid-search, fall back rather than hanging.
        setTimeout(() => {
          if (this.workerJobs.has(id)) {
            this.workerJobs.delete(id);
            resolve(findBestMove(payload, { difficulty }));
          }
        }, 15000);
      });
    }

    // Yield a frame first so the "thinking" indicator actually paints.
    return new Promise((resolve) => {
      setTimeout(() => resolve(findBestMove(payload, { difficulty })), 30);
    });
  }

  async showHint() {
    if (!this.isPlayersTurn() || this.mode === 'online') return;
    this.sfx.click();
    this.hud.setTurn(this.state.turn, { label: 'Scanning the field…', thinking: true });
    const result = await this.search(this.state, 'skilled');
    $('thinking').classList.add('hidden');
    this.updateTurnUi();
    if (!result?.move) return;
    this.hintMove = result.move;
    this.updateMarkers();
    const code = this.state.board[result.move.from];
    if (code) {
      const entry = CODEX[colorOf(code)][typeOf(code)];
      this.hud.ticker(`${entry.name}: ${squareName(result.move.from)} → ${squareName(result.move.to)}`);
    }
  }

  // ------------------------------------------------------------- markers ---

  updateMarkers() {
    this.markers.clear();

    const last = this.history[this.history.length - 1];
    if (last) {
      this.markers.add(last.move.from, 'lastFrom');
      this.markers.add(last.move.to, 'lastTo');
    }

    if (this.hintMove) {
      this.markers.add(this.hintMove.from, 'hint');
      this.markers.add(this.hintMove.to, 'hint');
    }

    if (this.selected !== null) {
      this.markers.add(this.selected, 'select');
      if (this.settings.hints) {
        for (const move of this.legalForSelected) {
          this.markers.add(move.to,
            move.flag === 'castle' ? 'castle' : (move.captured ? 'capture' : 'move'));
        }
      }
    }

    if (this.state && !this.gameOver && inCheck(this.state, this.state.turn)) {
      this.markers.add(findKing(this.state, this.state.turn), 'check');
    }
  }

  updateTurnUi() {
    if (!this.state) return;
    const checked = inCheck(this.state, this.state.turn);
    let label = `${ARMIES[this.state.turn].name} to move`;
    if (this.mode === 'ai' || this.mode === 'online') {
      label = this.state.turn === this.playerColor ? 'Your move' : 'Opponent to move';
    }
    if (checked) label += ' · check';
    this.hud.setTurn(this.state.turn, { label, check: checked });
    $('undoBtn').disabled = this.history.length === 0 || this.busy;
  }

  // -------------------------------------------------------------- undo -----

  undo() {
    if (this.busy || this.mode === 'online' || !this.history.length) return;
    this.sfx.click();
    // Against the computer, take back the pair so it's the player's turn again.
    let steps = 1;
    if (this.mode === 'ai' && this.history.length >= 2 && this.state.turn === this.playerColor) steps = 2;

    const target = this.history[this.history.length - steps];
    this.state = cloneState(target.snapshot);
    this.history.length = this.history.length - steps;
    this.sanList.length = this.history.length;

    this.animator.finishAll();
    this.gameOver = false;
    this.hud.hideGameOver();
    this.selected = null;
    this.legalForSelected = [];
    this.hintMove = null;
    this.refreshPieces();
    this.hud.setMoves(this.sanList);
    this.hud.setCaptured(this.capturedTally(), this.bottomColor());
    this.updateMarkers();
    this.updateTurnUi();
    this._save();
  }

  // ----------------------------------------------------------- game over ---

  endGame(status) {
    this.gameOver = true;
    this.deselect();
    this.updateMarkers();
    this._clearSave();

    const reasons = {
      checkmate: 'Checkmate',
      stalemate: 'Stalemate',
      'fifty-move rule': 'Draw — fifty-move rule',
      'insufficient material': 'Draw — not enough material',
      'threefold repetition': 'Draw — threefold repetition',
    };

    let title = reasons[status.reason] || 'Game over';
    let text;
    let mark = '½';

    if (status.result === 'draw') {
      text = 'Neither army can force a result. The field is left as it stands.';
      this.sfx.draw();
    } else {
      const winner = status.result;
      mark = GLYPH[winner].k;
      const king = CODEX[winner].k;
      text = `${ARMIES[winner].name} takes the field. ${king.name} stands victorious.`;

      // Fireworks over the winning king.
      const kingSquare = findKing(this.state, winner);
      if (kingSquare >= 0) {
        const at = squareToWorld(kingSquare);
        const pal = PALETTE[winner];
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            this.effects.burst({ x: at.x, y: 1.4 + i * 0.2, z: at.z }, {
              count: 44, color: [pal.trim, pal.glow, pal.gem], speed: 4.4,
              size: 0.14, life: 1.3, spread: 1.7, intensity: 1.7, gravity: -1.6,
            });
            this.effects.ring(at, { color: pal.trim, life: 0.9, from: 0.3, to: 3.2, opacity: 0.8 });
          }, i * 260);
        }
        this.effects.shake(0.4);
      }

      const playerWon = this.mode === 'local' ? true : winner === this.playerColor;
      if (this.mode !== 'local') {
        title = playerWon ? 'Victory' : 'Defeat';
        text = playerWon
          ? `${ARMIES[winner].name} holds the field. ${CODEX[winner].k.name} salutes you.`
          : `${ARMIES[winner].name} breaks your line. ${CODEX[winner].k.name} shows no mercy.`;
      }
      if (playerWon) this.sfx.victory(); else this.sfx.defeat();
    }

    const canRematch = this.mode !== 'online' || !!this.online?.connected;
    if (status.reason === 'checkmate') {
      // The mate gets its own scene, then a screen explaining how it happened.
      this.playCheckmateScene(status, { mark, title, text, canRematch });
    } else {
      setTimeout(() => this.hud.showGameOver({ mark, title, text, canRematch }), 900);
    }
  }

  // ------------------------------------------------------- checkmate scene ---

  /**
   * Beat by beat: hold on the final position, close in on the losing king,
   * light up the pieces that trap him, cross out every square he cannot reach,
   * let him fall, then title card. Skippable at any point.
   */
  async playCheckmateScene(status, result) {
    const generation = this.generation;
    const analysis = analyseMate(this.state);
    this.mateAnalysis = analysis;
    this.mateResult = result;
    if (!analysis) { this.hud.showGameOver(result); return; }

    const cine = $('cinematic');
    let skipped = false;
    const skip = () => { skipped = true; };
    $('cineSkip').onclick = skip;
    cine.onclick = skip;

    cine.classList.remove('hidden');
    cine.classList.add('armed');
    requestAnimationFrame(() => cine.classList.add('show'));

    // A beat that can be cut short by the skip button.
    const beat = (ms) => new Promise((resolve) => {
      const started = performance.now();
      const tick = () => {
        if (skipped || generation !== this.generation || performance.now() - started >= ms) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    const caption = (text) => {
      const el = $('cineCaption');
      el.textContent = text;
      el.classList.add('show');
    };

    const kingPiece = this.pieces.get(analysis.kingSquare);
    const kingAt = squareToWorld(analysis.kingSquare);
    const loserName = CODEX[analysis.loser].k.name;

    await beat(700);

    // 1. Close in on the trapped king.
    if (!skipped) {
      this.stage.flyTo({
        target: { x: kingAt.x, y: 0.72, z: kingAt.z },
        radius: 4.6,
        phi: 1.02,
        theta: this.stage.spherical.theta + 0.5,
      });
      caption(`${loserName} is surrounded.`);
      this.sfx.check();
    }
    await beat(1500);

    // 2. Mark the attackers, one at a time.
    if (!skipped) {
      this.markers.clear();
      this.markers.add(analysis.kingSquare, 'mateKing');
      for (const square of analysis.checkers) {
        this.markers.add(square, 'mateChecker');
        const at = squareToWorld(square);
        this.effects.ring(at, { color: 0xffd76a, life: 0.7, from: 0.3, to: 1.6, opacity: 0.9 });
        this.effects.flash({ x: at.x, y: 0.8, z: at.z }, { color: 0xffe9b0, size: 2, life: 0.4 });
        this.sfx.select();
      }
      const names = analysis.checkers
        .map((sq) => CODEX[analysis.winner][typeOf(this.state.board[sq])].name);
      caption(`${names.join(' and ')} holds the blade.`);
    }
    await beat(1400);

    // 3. Cross out every square the king cannot use.
    if (!skipped) {
      caption('Every road out is closed.');
      for (const escape of analysis.escapes) {
        this.markers.add(escape.square, escape.reason === 'own' ? 'mateOwn' : 'mateBar',
          { spin: Math.PI / 4 });
        if (escape.reason !== 'own') {
          this.markers.add(escape.square, 'mateBar', { spin: -Math.PI / 4 });
          const at = squareToWorld(escape.square);
          this.effects.ring(at, { color: 0xff3b47, life: 0.5, from: 0.6, to: 1.0, opacity: 0.7 });
        }
        this.sfx.click();
        await beat(180);
      }
    }
    await beat(600);

    // 4. The king gives out.
    if (!skipped && kingPiece) {
      caption(`${loserName} has nowhere left to stand.`);
      await this.animator.play(buildDefeatAnimation({
        piece: kingPiece, effects: this.effects, audio: this.sfx,
      }));
    } else if (kingPiece) {
      kingPiece.userData.idle = null;
    }
    await beat(400);

    // 5. Title card.
    $('cineCaption').classList.remove('show');
    $('cineTitle').textContent = status.result === 'draw' ? 'STALEMATE' : 'CHECKMATE';
    $('cineTitle').classList.add('show');
    this.sfx.shatter();
    this.effects.shake(0.3);
    await beat(1600);

    if (generation !== this.generation) return;   // a new game started meanwhile
    this._endCheckmateScene();
  }

  _endCheckmateScene() {
    const cine = $('cinematic');
    cine.classList.remove('show', 'armed');
    cine.onclick = null;
    setTimeout(() => {
      cine.classList.add('hidden');
      $('cineTitle').classList.remove('show');
      $('cineCaption').classList.remove('show');
    }, 700);

    this.stage.releaseCamera();
    this.stage.faceSide(this.bottomColor());
    this.showMateBreakdown();
  }

  /** The screen after the scene: the position, marked up and explained. */
  showMateBreakdown() {
    const analysis = this.mateAnalysis;
    const result = this.mateResult;
    if (!analysis || !result) return;

    this.hud.renderMateBoard(this.state.board, analysis);

    const notes = [];
    for (const square of analysis.checkers) {
      const type = typeOf(this.state.board[square]);
      const entry = CODEX[analysis.winner][type];
      notes.push([`${entry.name} — the `, PIECE_NAMES[type], ` on `, squareName(square),
        ` — attacks the king and cannot be taken or blocked.`]);
    }

    const covered = analysis.escapes.filter((e) => e.reason !== 'own');
    const blocked = analysis.escapes.filter((e) => e.reason === 'own');
    if (covered.length) {
      const guards = [...new Set(covered.flatMap((e) => e.by))].map(squareName);
      notes.push([
        `The king cannot step to `,
        covered.map((e) => squareName(e.square)).join(', '),
        covered.length === 1 ? ` — that square is covered by ` : ` — those squares are covered by `,
        guards.join(', '), `.`,
      ]);
    }
    if (blocked.length) {
      notes.push([
        blocked.length === 1 ? `His own piece blocks ` : `His own pieces block `,
        blocked.map((e) => squareName(e.square)).join(', '), `.`,
      ]);
    }
    notes.push([`No piece can capture the attacker or step into the line, so the game ends here.`]);

    this.hud.showMateScreen({
      title: result.title,
      subtitle: result.text,
      mark: result.mark,
      notes,
      canRematch: result.canRematch,
    });
  }

  requestRematch() {
    this.sfx.click();
    if (this.mode === 'online') {
      if (!this.online?.connected) { this.hud.toast('Opponent has left'); return; }
      this.rematch.mine = true;
      this.online.send({ t: 'rematch' });
      if (this.rematch.theirs) {
        this._startOnlineRematch();
      } else {
        $('rematchNote').textContent = 'Waiting for your opponent…';
        $('rematchNote').classList.remove('hidden');
      }
      return;
    }
    this.hud.hideGameOver();
    const side = this.mode === 'ai' ? opponent(this.playerColor) : 'w';
    this.startGame({ mode: this.mode, playerColor: this.mode === 'ai' ? side : 'w' });
  }

  _startOnlineRematch() {
    this.rematch = { mine: false, theirs: false };
    $('rematchNote').classList.add('hidden');
    this.hud.hideGameOver();
    // Swap armies each rematch so nobody keeps the first-move advantage.
    this.onlineHostColor = opponent(this.onlineHostColor);
    const myColor = this.online.isHost ? this.onlineHostColor : opponent(this.onlineHostColor);
    this.startGame({ mode: 'online', playerColor: myColor });
  }

  // ------------------------------------------------------------- online ---

  async hostRoom() {
    this.sfx.click();
    this._resetOnlineUi();
    $('onlineActions').classList.add('hidden');
    $('roomPanel').classList.remove('hidden');
    $('roomStatus').textContent = 'Opening the room…';

    this.online = new OnlineSession();
    this._wireOnline();
    try {
      const code = await this.online.host();
      this.roomCode = code;
      $('roomCode').textContent = code;
      $('roomStatus').textContent = 'Share this code — waiting for your opponent to join.';
    } catch (err) {
      this._onlineError(err);
    }
  }

  async joinRoom() {
    const code = $('joinCode').value.trim().toUpperCase();
    if (code.length !== 5) { this.hud.toast('Room codes are five characters'); return; }
    this.sfx.click();
    this._resetOnlineUi();
    $('onlineActions').classList.add('hidden');
    $('roomPanel').classList.remove('hidden');
    $('roomCode').textContent = code;
    $('roomStatus').textContent = 'Connecting…';

    this.online = new OnlineSession();
    this._wireOnline();
    try {
      await this.online.join(code);
      this.roomCode = code;
    } catch (err) {
      this._onlineError(err);
    }
  }

  _wireOnline() {
    const session = this.online;

    session.onStatus = (kind, data) => {
      if (kind === 'latency') {
        this.hud.setNetBadge(`${data.latency}ms`, data.latency > 350);
      } else if (kind === 'reconnecting') {
        this.hud.setNetBadge('reconnecting', true);
      }
    };

    session.onOpen = () => {
      this.hud.setNetBadge('connected');
      if (session.isHost) {
        this.onlineHostColor = 'w';
        session.send({ t: 'start', protocol: PROTOCOL, hostColor: this.onlineHostColor });
        this.startGame({ mode: 'online', playerColor: this.onlineHostColor });
        this.hud.toast('Opponent connected — play!');
      } else {
        $('roomStatus').textContent = 'Connected — waiting for the board…';
      }
    };

    session.onMessage = (message) => this._onNetMessage(message);

    session.onClose = (reason) => {
      this.hud.setNetBadge('offline', true);
      this.hud.toast(reason);
      if (this.state && !this.gameOver) {
        this.gameOver = true;
        this.hud.showGameOver({
          mark: '⚑', title: 'Opponent left',
          text: 'The connection closed. You can head back and start another match.',
          canRematch: false,
        });
      }
    };

    session.onError = () => this.hud.setNetBadge('link trouble', true);
  }

  _onNetMessage(message) {
    switch (message.t) {
      case 'start': {
        if (message.protocol !== PROTOCOL) {
          this.hud.toast('Your opponent is on a different version of the game');
          return;
        }
        this.onlineHostColor = message.hostColor === 'b' ? 'b' : 'w';
        const myColor = opponent(this.onlineHostColor);
        this.startGame({ mode: 'online', playerColor: myColor });
        this.hud.toast('Connected — good luck!');
        break;
      }
      case 'move': {
        if (this.mode !== 'online' || this.gameOver) return;
        // Never trust the wire: the move must be legal in our own position.
        const legal = generateLegalMoves(this.state).find((m) =>
          m.from === message.from && m.to === message.to &&
          (m.promo || null) === (message.promo || null));
        if (!legal) {
          this.hud.toast('Ignored an illegal move from your opponent');
          return;
        }
        if (colorOf(legal.piece) === this.playerColor) return; // not theirs to make
        this._queueRemoteMove(legal);
        break;
      }
      case 'resign': {
        if (this.gameOver) return;
        this.gameOver = true;
        this.hud.showGameOver({
          mark: GLYPH[this.playerColor].k, title: 'Victory',
          text: 'Your opponent resigned. The field is yours.',
          canRematch: true,
        });
        this.sfx.victory();
        break;
      }
      case 'rematch': {
        this.rematch.theirs = true;
        if (this.rematch.mine) this._startOnlineRematch();
        else {
          $('rematchNote').textContent = 'Your opponent wants a rematch.';
          $('rematchNote').classList.remove('hidden');
          this.hud.toast('Opponent wants a rematch');
        }
        break;
      }
      default:
        break;
    }
  }

  /** Remote moves may land mid-animation; play them in order. */
  async _queueRemoteMove(move) {
    const generation = this.generation;
    this.remoteQueue = (this.remoteQueue || Promise.resolve()).then(async () => {
      while (this.busy) await new Promise((r) => setTimeout(r, 40));
      if (generation !== this.generation || this.gameOver) return;
      await this.commitMove(move);
    });
    return this.remoteQueue;
  }

  _resetOnlineUi() {
    $('onlineError').classList.add('hidden');
    if (this.online) { this.online.close(); this.online = null; }
  }

  _onlineError(err) {
    const raw = ((err && (err.message || err.type)) || 'Connection failed').toLowerCase();
    let message = (err && err.message) || 'Connection failed';

    // The underlying library's wording is unhelpful to a player, so translate
    // the cases that actually happen into something they can act on.
    if (raw.includes('could not load') || raw.includes('lost connection') ||
        raw.includes('server') || raw.includes('socket') || raw.includes('network')) {
      message = 'Could not reach the matchmaking service. Check your connection and try again — ' +
        'some networks block peer-to-peer play.';
    } else if (raw.includes('no room with that code')) {
      message = 'No room with that code. Check the letters, or ask your friend to open a new room.';
    } else if (raw.includes('no answer')) {
      message = 'No answer. The room may have closed — ask your friend to create a new one.';
    } else if (raw.includes('browser') || raw.includes('webrtc')) {
      message = 'This browser does not support peer-to-peer play. Try Chrome, Safari or Firefox.';
    }

    $('onlineError').textContent = message;
    $('onlineError').classList.remove('hidden');
    $('roomPanel').classList.add('hidden');
    $('onlineActions').classList.remove('hidden');
    if (this.online) { this.online.close(); this.online = null; }
  }

  _leaveOnline() {
    if (this.online) { this.online.close(); this.online = null; }
    this.hud.setNetBadge(null);
    $('roomPanel').classList.add('hidden');
    $('onlineActions').classList.remove('hidden');
    this._navigate('home');
  }

  async _copyInvite() {
    const link = inviteLink(this.roomCode || '');
    try {
      await navigator.clipboard.writeText(link);
      this.hud.toast('Invite link copied');
    } catch {
      this.hud.toast(link);
    }
  }

  async _shareInvite() {
    const link = inviteLink(this.roomCode || '');
    const text = `Play me at Chessforge — room ${this.roomCode}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Chessforge', text, url: link }); return; } catch { /* cancelled */ }
    }
    this._copyInvite();
  }

  async _copyGame() {
    const pgn = this.sanList
      .map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san))
      .join(' ');
    const text = `${pgn}\n\nFEN: ${toFEN(this.state)}`;
    try {
      await navigator.clipboard.writeText(text);
      this.hud.toast('Game copied to the clipboard');
    } catch {
      this.hud.toast('Could not copy — long-press the move list instead');
    }
  }

  // --------------------------------------------------------------- save ---

  _save() {
    if (this.mode === 'online' || !this.state || this.gameOver) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        state: this.state,
        sanList: this.sanList,
        mode: this.mode,
        playerColor: this.playerColor,
        difficulty: this.difficulty,
        captured: this.capturedTally(),
      }));
    } catch { /* storage full or blocked */ }
  }

  _hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  _clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }

  _resume() {
    // Loading a save replaces whatever is on the board. Refuse outright if a
    // match is under way — an online game is never in local storage, so this
    // would silently swap a live match for an old one.
    if (this.inOnlineGame) {
      this.hud.toast('You are in an online match — tap Return to game');
      return;
    }
    if (this.inProgress) {
      this.hud.toast('A match is already under way — tap Return to game');
      return;
    }

    let save;
    try { save = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { save = null; }
    if (!save?.state) { this.hud.toast('No saved game found'); return; }

    this.mode = save.mode;
    this.playerColor = save.playerColor;
    this.difficulty = save.difficulty || 'casual';
    this.state = save.state;
    this.state.repetition = this.state.repetition || Object.create(null);
    this.sanList = save.sanList || [];
    this.history = [];               // snapshots aren't stored, so undo restarts here
    this.baseCaptured = save.captured || { w: [], b: [] };
    this.gameOver = false;
    this.busy = false;
    this.selected = null;

    this.refreshPieces();
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('undoBtn').classList.toggle('hidden', this.mode === 'online');
    this.hud.setMoves(this.sanList);
    this.hud.setCaptured(save.captured || { w: [], b: [] }, this.bottomColor());
    this.stage.faceSide(this.bottomColor(), true);
    this.updateMarkers();
    this.updateTurnUi();
    this.hud.ticker('Match resumed');
    this.maybeAiMove();
  }

  // --------------------------------------------------------------- loop ---

  _loop() {
    let previous = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      const time = now / 1000;

      this.animator.update(dt);
      for (const piece of this.pieces.values()) updateIdle(piece, time);
      this.markers.update(time);
      this.effects.update(dt, this.stage.camera);
      this.stage.update(dt, this.effects);
      this.stage.render();

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

/** Only for objects that own their geometry — never for cloned pieces. */
function disposeTree(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material || material.userData?.shared) continue;
      material.map?.dispose();
    }
  });
}

const game = new Chessforge();
game.boot().catch((err) => {
  console.error(err);
  $('bootNote').textContent = 'Something went wrong starting the game: ' + err.message;
});
window.chessforge = game;
