/**
 * Chessforge — search engine.
 *
 * Negamax + alpha-beta with iterative deepening, MVV-LVA move ordering,
 * killer moves and a quiescence search. Tuned to stay responsive on a phone:
 * every level has a wall-clock budget and the search returns the best move
 * from the last fully-completed depth.
 */

import {
  WHITE, BLACK, generateLegalMoves, generatePseudoMoves, makeMove, unmakeMove,
  inCheck, typeOf, colorOf, opponent, fileOf, rankOf,
} from './engine.js';

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const MATE = 100000;

// Piece-square tables, written from white's point of view with rank 8 first so
// they read like a board. Flipped for black at lookup time.
const PST_RAW = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
  kEnd: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

// Re-index so table[square] works directly with our rank*8+file layout.
const PST = {};
for (const [key, table] of Object.entries(PST_RAW)) {
  const flat = new Array(64);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) flat[r * 8 + f] = table[(7 - r) * 8 + f];
  }
  PST[key] = flat;
}

const mirror = (square) => (7 - rankOf(square)) * 8 + fileOf(square);

export const DIFFICULTIES = {
  novice: { label: 'Squire', depth: 1, timeMs: 250, blunder: 0.45, randomness: 90 },
  casual: { label: 'Knight', depth: 2, timeMs: 700, blunder: 0.18, randomness: 45 },
  skilled: { label: 'Warlord', depth: 3, timeMs: 1600, blunder: 0.05, randomness: 18 },
  master: { label: 'Grandmaster', depth: 5, timeMs: 4200, blunder: 0, randomness: 0 },
};

function isEndgame(state) {
  let material = 0;
  let queens = 0;
  for (let i = 0; i < 64; i++) {
    const piece = state.board[i];
    if (!piece) continue;
    const type = typeOf(piece);
    if (type === 'k' || type === 'p') continue;
    if (type === 'q') queens++;
    material += VALUE[type];
  }
  return queens === 0 || material <= 1300;
}

/** Static evaluation, always from the point of view of the side to move. */
export function evaluate(state) {
  let score = 0;
  const endgame = isEndgame(state);
  const pawnFiles = { w: new Array(8).fill(0), b: new Array(8).fill(0) };
  let bishops = { w: 0, b: 0 };

  for (let i = 0; i < 64; i++) {
    const piece = state.board[i];
    if (!piece) continue;
    const type = typeOf(piece);
    const color = colorOf(piece);
    const square = color === WHITE ? i : mirror(i);
    const table = type === 'k' ? (endgame ? PST.kEnd : PST.k) : PST[type];
    const value = VALUE[type] + table[square];
    score += color === WHITE ? value : -value;
    if (type === 'p') pawnFiles[color][fileOf(i)]++;
    if (type === 'b') bishops[color]++;
  }

  // A handful of cheap positional terms that make the AI play recognisable chess.
  for (const color of [WHITE, BLACK]) {
    const sign = color === WHITE ? 1 : -1;
    const files = pawnFiles[color];
    for (let f = 0; f < 8; f++) {
      if (files[f] > 1) score += sign * -12 * (files[f] - 1);          // doubled pawns
      if (files[f] > 0 && !files[f - 1] && !files[f + 1]) score += sign * -14; // isolated
    }
    if (bishops[color] >= 2) score += sign * 30;                        // bishop pair
  }

  return state.turn === WHITE ? score : -score;
}

const MVV_LVA_ATTACKER = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };

function scoreMove(move, killers, ply) {
  if (move.captured) {
    return 1_000_000 + VALUE[typeOf(move.captured)] * 10 + MVV_LVA_ATTACKER[typeOf(move.piece)];
  }
  if (move.promo) return 900_000 + VALUE[move.promo];
  const killer = killers[ply];
  if (killer && killer.from === move.from && killer.to === move.to) return 800_000;
  return 0;
}

function orderMoves(moves, killers, ply, preferred) {
  for (const move of moves) {
    move._score = scoreMove(move, killers, ply);
    if (preferred && move.from === preferred.from && move.to === preferred.to &&
        move.promo === preferred.promo) {
      move._score += 10_000_000;
    }
  }
  moves.sort((a, b) => b._score - a._score);
  return moves;
}

function quiesce(state, alpha, beta, ctx) {
  ctx.nodes++;
  const standPat = evaluate(state);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  if (ctx.nodes % 2048 === 0 && Date.now() > ctx.deadline) throw ABORT;

  const captures = generatePseudoMoves(state, true);
  orderMoves(captures, ctx.killers, 0, null);

  for (const move of captures) {
    // Delta pruning: skip captures that cannot plausibly raise alpha.
    if (standPat + VALUE[typeOf(move.captured) || 'p'] + 200 < alpha) continue;
    const undo = makeMove(state, move);
    if (inCheck(state, opponent(state.turn))) { unmakeMove(state, move, undo); continue; }
    const score = -quiesce(state, -beta, -alpha, ctx);
    unmakeMove(state, move, undo);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

const ABORT = Symbol('search-timeout');

function negamax(state, depth, alpha, beta, ply, ctx) {
  ctx.nodes++;
  if (ctx.nodes % 2048 === 0 && Date.now() > ctx.deadline) throw ABORT;

  const checked = inCheck(state, state.turn);
  if (checked) depth++; // check extension — don't stop the search mid-tactic

  if (depth <= 0) return quiesce(state, alpha, beta, ctx);

  const moves = generatePseudoMoves(state);
  orderMoves(moves, ctx.killers, ply, ply === 0 ? ctx.preferred : null);

  let legalCount = 0;
  let best = -Infinity;

  for (const move of moves) {
    const undo = makeMove(state, move);
    if (inCheck(state, opponent(state.turn))) { unmakeMove(state, move, undo); continue; }
    legalCount++;
    const score = -negamax(state, depth - 1, -beta, -alpha, ply + 1, ctx);
    unmakeMove(state, move, undo);

    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (!move.captured) ctx.killers[ply] = { from: move.from, to: move.to };
      return alpha;
    }
  }

  if (legalCount === 0) {
    return checked ? -MATE + ply : 0; // mate scores prefer the quickest mate
  }
  // Nudge toward draws being neutral rather than attractive.
  if (state.halfmove >= 100) return 0;
  return best;
}

/**
 * Picks a move for the side to move.
 * `onProgress(depth, score)` is optional and fires after each completed depth.
 */
export function findBestMove(state, options = {}) {
  const config = DIFFICULTIES[options.difficulty] || DIFFICULTIES.casual;
  const maxDepth = options.depth || config.depth;
  const deadline = Date.now() + (options.timeMs || config.timeMs);

  const roots = generateLegalMoves(state);
  if (roots.length === 0) return null;
  if (roots.length === 1) return { move: roots[0], score: 0, depth: 0, nodes: 0 };

  const ctx = { nodes: 0, deadline, killers: [], preferred: null };
  let bestMove = roots[0];
  let bestScore = 0;
  let reachedDepth = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    const scored = [];
    try {
      let alpha = -Infinity;
      const ordered = orderMoves(roots.slice(), ctx.killers, 0, ctx.preferred);
      for (const move of ordered) {
        const undo = makeMove(state, move);
        const score = -negamax(state, depth - 1, -Infinity, -alpha, 1, ctx);
        unmakeMove(state, move, undo);
        scored.push({ move, score });
        if (score > alpha) alpha = score;
      }
    } catch (err) {
      if (err !== ABORT) throw err;
      break; // out of time — keep the previous depth's result
    }

    scored.sort((a, b) => b.score - a.score);
    reachedDepth = depth;
    bestScore = scored[0].score;
    ctx.preferred = scored[0].move;

    // Personality: weaker levels sometimes pick a merely-decent move so they
    // feel like an opponent rather than a wall.
    let choice = scored[0];
    if (config.randomness > 0) {
      const pool = scored.filter((s) => s.score >= scored[0].score - config.randomness);
      if (pool.length > 1 && Math.random() < config.blunder) {
        choice = pool[1 + Math.floor(Math.random() * (pool.length - 1))];
      } else {
        choice = pool[Math.floor(Math.random() * Math.min(pool.length, 2))] || scored[0];
      }
    }
    bestMove = choice.move;

    if (Math.abs(bestScore) > MATE - 100) break; // forced mate found
    if (Date.now() > deadline) break;
  }

  return { move: bestMove, score: bestScore, depth: reachedDepth, nodes: ctx.nodes };
}
