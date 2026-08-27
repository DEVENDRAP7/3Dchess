/**
 * Chessforge — rules engine.
 *
 * Dependency-free so it can be imported by both the renderer and the AI worker.
 * Board is a flat 64 array, index = rank * 8 + file.
 *   file 0 = 'a' … file 7 = 'h'
 *   rank 0 = white's home rank ("1") … rank 7 = black's home rank ("8")
 * Pieces are single chars: uppercase = white, lowercase = black, '' = empty.
 */

export const WHITE = 'w';
export const BLACK = 'b';

export const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

const KNIGHT_DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_DELTAS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const QUEEN_DIRS = BISHOP_DIRS.concat(ROOK_DIRS);

export const idx = (file, rank) => rank * 8 + file;
export const fileOf = (i) => i & 7;
export const rankOf = (i) => i >> 3;
export const onBoard = (file, rank) => file >= 0 && file < 8 && rank >= 0 && rank < 8;

export function squareName(i) {
  return 'abcdefgh'[fileOf(i)] + (rankOf(i) + 1);
}

export function colorOf(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? WHITE : BLACK;
}

export function typeOf(piece) {
  return piece ? piece.toLowerCase() : null;
}

export function opponent(color) {
  return color === WHITE ? BLACK : WHITE;
}

const START_LAYOUT = 'rnbqkbnr';

/** Fresh game state in the standard starting position. */
export function createInitialState() {
  const board = new Array(64).fill('');
  for (let f = 0; f < 8; f++) {
    board[idx(f, 0)] = START_LAYOUT[f].toUpperCase();
    board[idx(f, 1)] = 'P';
    board[idx(f, 6)] = 'p';
    board[idx(f, 7)] = START_LAYOUT[f];
  }
  const state = {
    board,
    turn: WHITE,
    castling: { K: true, Q: true, k: true, q: true },
    ep: -1,          // en-passant target square, or -1
    halfmove: 0,     // plies since last capture or pawn move (50-move rule)
    fullmove: 1,
    repetition: Object.create(null),
  };
  state.repetition[positionKey(state)] = 1;
  return state;
}

export function cloneState(state) {
  return {
    board: state.board.slice(),
    turn: state.turn,
    castling: { ...state.castling },
    ep: state.ep,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
    repetition: Object.assign(Object.create(null), state.repetition),
  };
}

/** Compact key describing a position for threefold-repetition bookkeeping. */
export function positionKey(state) {
  const c = state.castling;
  // Empty squares must leave a mark — otherwise join('') drops them entirely
  // and two boards with the same pieces in a different arrangement collide.
  let board = '';
  for (let i = 0; i < 64; i++) board += state.board[i] || '.';
  return board + '|' + state.turn + '|' +
    (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '') + '|' + state.ep;
}

export function findKing(state, color) {
  const target = color === WHITE ? 'K' : 'k';
  for (let i = 0; i < 64; i++) if (state.board[i] === target) return i;
  return -1;
}

/**
 * Is `square` attacked by any piece of `byColor`?
 * Walks outward from the square rather than looping over every enemy piece.
 */
export function isSquareAttacked(state, square, byColor) {
  const board = state.board;
  const f = fileOf(square);
  const r = rankOf(square);
  const white = byColor === WHITE;

  // Pawns attack diagonally forward; look backwards from the target square.
  const pawnRank = r + (white ? -1 : 1);
  const pawn = white ? 'P' : 'p';
  for (const df of [-1, 1]) {
    const pf = f + df;
    if (onBoard(pf, pawnRank) && board[idx(pf, pawnRank)] === pawn) return true;
  }

  const knight = white ? 'N' : 'n';
  for (const [df, dr] of KNIGHT_DELTAS) {
    const nf = f + df, nr = r + dr;
    if (onBoard(nf, nr) && board[idx(nf, nr)] === knight) return true;
  }

  const king = white ? 'K' : 'k';
  for (const [df, dr] of KING_DELTAS) {
    const nf = f + df, nr = r + dr;
    if (onBoard(nf, nr) && board[idx(nf, nr)] === king) return true;
  }

  const queen = white ? 'Q' : 'q';
  const rookish = white ? 'R' : 'r';
  for (const [df, dr] of ROOK_DIRS) {
    let nf = f + df, nr = r + dr;
    while (onBoard(nf, nr)) {
      const p = board[idx(nf, nr)];
      if (p) {
        if (p === rookish || p === queen) return true;
        break;
      }
      nf += df; nr += dr;
    }
  }

  const bishopish = white ? 'B' : 'b';
  for (const [df, dr] of BISHOP_DIRS) {
    let nf = f + df, nr = r + dr;
    while (onBoard(nf, nr)) {
      const p = board[idx(nf, nr)];
      if (p) {
        if (p === bishopish || p === queen) return true;
        break;
      }
      nf += df; nr += dr;
    }
  }

  return false;
}

/**
 * Every piece of `byColor` that attacks `square`, as a list of squares.
 * Same sweep as {@link isSquareAttacked}, but collecting rather than short-
 * circuiting, so the mate screen can point at exactly who is doing what.
 */
export function attackersOf(state, square, byColor) {
  const board = state.board;
  const f = fileOf(square);
  const r = rankOf(square);
  const white = byColor === WHITE;
  const found = [];

  const pawnRank = r + (white ? -1 : 1);
  const pawn = white ? 'P' : 'p';
  for (const df of [-1, 1]) {
    const pf = f + df;
    if (onBoard(pf, pawnRank) && board[idx(pf, pawnRank)] === pawn) found.push(idx(pf, pawnRank));
  }

  const knight = white ? 'N' : 'n';
  for (const [df, dr] of KNIGHT_DELTAS) {
    const nf = f + df, nr = r + dr;
    if (onBoard(nf, nr) && board[idx(nf, nr)] === knight) found.push(idx(nf, nr));
  }

  const king = white ? 'K' : 'k';
  for (const [df, dr] of KING_DELTAS) {
    const nf = f + df, nr = r + dr;
    if (onBoard(nf, nr) && board[idx(nf, nr)] === king) found.push(idx(nf, nr));
  }

  const queen = white ? 'Q' : 'q';
  for (const [dirs, piece] of [[ROOK_DIRS, white ? 'R' : 'r'], [BISHOP_DIRS, white ? 'B' : 'b']]) {
    for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      while (onBoard(nf, nr)) {
        const at = idx(nf, nr);
        const p = board[at];
        if (p) {
          if (p === piece || p === queen) found.push(at);
          break;
        }
        nf += df; nr += dr;
      }
    }
  }

  return found;
}

/**
 * Why the side to move is mated: who is giving check, and for each square the
 * king might have stepped to, what stops it.
 *
 * The king is lifted off the board while testing escape squares, otherwise it
 * blocks the very line that covers the square behind it.
 */
export function analyseMate(state) {
  const loser = state.turn;
  const winner = opponent(loser);
  const kingSquare = findKing(state, loser);
  if (kingSquare < 0) return null;

  const checkers = attackersOf(state, kingSquare, winner);
  const escapes = [];
  const f = fileOf(kingSquare);
  const r = rankOf(kingSquare);

  const board = state.board;
  const kingPiece = board[kingSquare];
  board[kingSquare] = '';                      // lift the king to expose x-rays

  for (const [df, dr] of KING_DELTAS) {
    const nf = f + df, nr = r + dr;
    if (!onBoard(nf, nr)) continue;
    const to = idx(nf, nr);
    const occupant = board[to];

    if (occupant && colorOf(occupant) === loser) {
      escapes.push({ square: to, reason: 'own', piece: occupant, by: [] });
      continue;
    }
    // Defenders of an enemy piece still count: the king cannot take it either.
    const saved = board[to];
    board[to] = '';
    const by = attackersOf(state, to, winner);
    board[to] = saved;

    if (by.length) {
      escapes.push({ square: to, reason: occupant ? 'defended' : 'covered', piece: occupant, by });
    }
  }

  board[kingSquare] = kingPiece;

  return { loser, winner, kingSquare, checkers, escapes };
}

export function inCheck(state, color = state.turn) {
  const king = findKing(state, color);
  if (king < 0) return false;
  return isSquareAttacked(state, king, opponent(color));
}

function pushMove(list, move) {
  list.push(move);
  return move;
}

/**
 * Pseudo-legal moves for the side to move (king may be left in check).
 * `capturesOnly` is used by the AI's quiescence search.
 */
export function generatePseudoMoves(state, capturesOnly = false) {
  const moves = [];
  const board = state.board;
  const us = state.turn;
  const them = opponent(us);
  const white = us === WHITE;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || colorOf(piece) !== us) continue;
    const type = typeOf(piece);
    const f = fileOf(from);
    const r = rankOf(from);

    if (type === 'p') {
      const dir = white ? 1 : -1;
      const startRank = white ? 1 : 6;
      const promoRank = white ? 7 : 0;
      const oneRank = r + dir;

      if (onBoard(f, oneRank) && !board[idx(f, oneRank)]) {
        const to = idx(f, oneRank);
        if (!capturesOnly || oneRank === promoRank) {
          if (oneRank === promoRank) {
            for (const promo of ['q', 'r', 'b', 'n']) {
              pushMove(moves, { from, to, piece, captured: '', promo, flag: 'promotion' });
            }
          } else {
            pushMove(moves, { from, to, piece, captured: '', promo: null, flag: 'quiet' });
          }
        }
        // Double step, only from the home rank and only across empty squares.
        const twoRank = r + dir * 2;
        if (!capturesOnly && r === startRank && !board[idx(f, twoRank)]) {
          pushMove(moves, { from, to: idx(f, twoRank), piece, captured: '', promo: null, flag: 'double' });
        }
      }

      for (const df of [-1, 1]) {
        const cf = f + df;
        if (!onBoard(cf, oneRank)) continue;
        const to = idx(cf, oneRank);
        const target = board[to];
        if (target && colorOf(target) === them) {
          if (oneRank === promoRank) {
            for (const promo of ['q', 'r', 'b', 'n']) {
              pushMove(moves, { from, to, piece, captured: target, promo, flag: 'promotion' });
            }
          } else {
            pushMove(moves, { from, to, piece, captured: target, promo: null, flag: 'capture' });
          }
        } else if (!target && to === state.ep) {
          const grabbed = idx(cf, r);
          pushMove(moves, {
            from, to, piece, captured: board[grabbed], promo: null,
            flag: 'enpassant', epCapture: grabbed,
          });
        }
      }
      continue;
    }

    if (type === 'n' || type === 'k') {
      const deltas = type === 'n' ? KNIGHT_DELTAS : KING_DELTAS;
      for (const [df, dr] of deltas) {
        const nf = f + df, nr = r + dr;
        if (!onBoard(nf, nr)) continue;
        const to = idx(nf, nr);
        const target = board[to];
        if (target && colorOf(target) === us) continue;
        if (capturesOnly && !target) continue;
        pushMove(moves, {
          from, to, piece, captured: target, promo: null,
          flag: target ? 'capture' : 'quiet',
        });
      }

      if (type === 'k' && !capturesOnly) {
        // Castling: rights intact, path empty, and the king never passes
        // through (or lands on) an attacked square.
        const rights = white ? ['K', 'Q'] : ['k', 'q'];
        const homeRank = white ? 0 : 7;
        if (r === homeRank && f === 4 && !isSquareAttacked(state, from, them)) {
          if (state.castling[rights[0]] &&
              !board[idx(5, homeRank)] && !board[idx(6, homeRank)] &&
              board[idx(7, homeRank)] === (white ? 'R' : 'r') &&
              !isSquareAttacked(state, idx(5, homeRank), them) &&
              !isSquareAttacked(state, idx(6, homeRank), them)) {
            pushMove(moves, {
              from, to: idx(6, homeRank), piece, captured: '', promo: null,
              flag: 'castle', side: 'king',
              rookFrom: idx(7, homeRank), rookTo: idx(5, homeRank),
            });
          }
          if (state.castling[rights[1]] &&
              !board[idx(3, homeRank)] && !board[idx(2, homeRank)] && !board[idx(1, homeRank)] &&
              board[idx(0, homeRank)] === (white ? 'R' : 'r') &&
              !isSquareAttacked(state, idx(3, homeRank), them) &&
              !isSquareAttacked(state, idx(2, homeRank), them)) {
            pushMove(moves, {
              from, to: idx(2, homeRank), piece, captured: '', promo: null,
              flag: 'castle', side: 'queen',
              rookFrom: idx(0, homeRank), rookTo: idx(3, homeRank),
            });
          }
        }
      }
      continue;
    }

    const dirs = type === 'b' ? BISHOP_DIRS : type === 'r' ? ROOK_DIRS : QUEEN_DIRS;
    for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      while (onBoard(nf, nr)) {
        const to = idx(nf, nr);
        const target = board[to];
        if (target) {
          if (colorOf(target) === them) {
            pushMove(moves, { from, to, piece, captured: target, promo: null, flag: 'capture' });
          }
          break;
        }
        if (!capturesOnly) {
          pushMove(moves, { from, to, piece, captured: '', promo: null, flag: 'quiet' });
        }
        nf += df; nr += dr;
      }
    }
  }

  return moves;
}

const CASTLE_SQUARES = {
  0: 'Q', 4: 'KQ', 7: 'K',
  56: 'q', 60: 'kq', 63: 'k',
};

/** Applies `move` in place and returns an undo record for {@link unmakeMove}. */
export function makeMove(state, move, trackRepetition = false) {
  const board = state.board;
  const undo = {
    castling: { ...state.castling },
    ep: state.ep,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
    captured: move.captured,
    repetitionKey: null,
  };

  const white = state.turn === WHITE;
  const type = typeOf(move.piece);

  board[move.from] = '';
  if (move.flag === 'enpassant') board[move.epCapture] = '';
  board[move.to] = move.promo ? (white ? move.promo.toUpperCase() : move.promo) : move.piece;

  if (move.flag === 'castle') {
    board[move.rookTo] = board[move.rookFrom];
    board[move.rookFrom] = '';
  }

  // Castling rights die when the king or a rook leaves (or a rook is taken).
  for (const square of [move.from, move.to]) {
    const affected = CASTLE_SQUARES[square];
    if (!affected) continue;
    for (const right of affected) state.castling[right] = false;
  }

  state.ep = move.flag === 'double' ? idx(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2) : -1;
  state.halfmove = (type === 'p' || move.captured) ? 0 : state.halfmove + 1;
  if (!white) state.fullmove++;
  state.turn = opponent(state.turn);

  if (trackRepetition) {
    const key = positionKey(state);
    undo.repetitionKey = key;
    state.repetition[key] = (state.repetition[key] || 0) + 1;
  }

  return undo;
}

export function unmakeMove(state, move, undo) {
  const board = state.board;

  if (undo.repetitionKey) {
    const left = (state.repetition[undo.repetitionKey] || 1) - 1;
    if (left <= 0) delete state.repetition[undo.repetitionKey];
    else state.repetition[undo.repetitionKey] = left;
  }

  state.turn = opponent(state.turn);
  state.castling = undo.castling;
  state.ep = undo.ep;
  state.halfmove = undo.halfmove;
  state.fullmove = undo.fullmove;

  board[move.from] = move.piece;
  board[move.to] = '';

  if (move.flag === 'enpassant') {
    board[move.epCapture] = undo.captured;
  } else if (undo.captured) {
    board[move.to] = undo.captured;
  }

  if (move.flag === 'castle') {
    board[move.rookFrom] = board[move.rookTo];
    board[move.rookTo] = '';
  }
}

/** Fully legal moves for the side to move. */
export function generateLegalMoves(state) {
  const legal = [];
  for (const move of generatePseudoMoves(state)) {
    const undo = makeMove(state, move);
    if (!inCheck(state, opponent(state.turn))) legal.push(move);
    unmakeMove(state, move, undo);
  }
  return legal;
}

export function legalMovesFrom(state, from) {
  return generateLegalMoves(state).filter((m) => m.from === from);
}

export function hasInsufficientMaterial(state) {
  const minors = { w: [], b: [] };
  for (let i = 0; i < 64; i++) {
    const piece = state.board[i];
    if (!piece) continue;
    const type = typeOf(piece);
    if (type === 'k') continue;
    if (type === 'p' || type === 'r' || type === 'q') return false;
    minors[colorOf(piece)].push({ type, square: i });
  }
  const w = minors.w, b = minors.b;
  if (w.length === 0 && b.length === 0) return true;                    // K vs K
  if (w.length + b.length === 1) return true;                          // K+minor vs K
  if (w.length === 1 && b.length === 1 &&
      w[0].type === 'b' && b[0].type === 'b') {
    const lightW = (fileOf(w[0].square) + rankOf(w[0].square)) % 2;
    const lightB = (fileOf(b[0].square) + rankOf(b[0].square)) % 2;
    return lightW === lightB;                                          // same-colour bishops
  }
  return false;
}

/**
 * Terminal-state check. Returns `{ over, result, reason }` where result is
 * 'w' | 'b' | 'draw' | null.
 */
export function getGameStatus(state) {
  const moves = generateLegalMoves(state);
  const checked = inCheck(state, state.turn);

  if (moves.length === 0) {
    if (checked) {
      return { over: true, result: opponent(state.turn), reason: 'checkmate', check: true };
    }
    return { over: true, result: 'draw', reason: 'stalemate', check: false };
  }
  if (state.halfmove >= 100) {
    return { over: true, result: 'draw', reason: 'fifty-move rule', check: checked };
  }
  if (hasInsufficientMaterial(state)) {
    return { over: true, result: 'draw', reason: 'insufficient material', check: checked };
  }
  const key = positionKey(state);
  if ((state.repetition[key] || 0) >= 3) {
    return { over: true, result: 'draw', reason: 'threefold repetition', check: checked };
  }
  return { over: false, result: null, reason: null, check: checked, moves };
}

/** Standard algebraic notation, disambiguated the way real scoresheets are. */
export function toSAN(state, move) {
  if (move.flag === 'castle') {
    const base = move.side === 'king' ? 'O-O' : 'O-O-O';
    return base + checkSuffix(state, move);
  }
  const type = typeOf(move.piece);
  const target = squareName(move.to);
  let san = '';

  if (type === 'p') {
    if (move.captured) san += 'abcdefgh'[fileOf(move.from)] + 'x';
    san += target;
    if (move.promo) san += '=' + move.promo.toUpperCase();
  } else {
    san += type.toUpperCase();
    const rivals = generateLegalMoves(state).filter((m) =>
      m.to === move.to && m.from !== move.from && typeOf(m.piece) === type);
    if (rivals.length) {
      const sameFile = rivals.some((m) => fileOf(m.from) === fileOf(move.from));
      const sameRank = rivals.some((m) => rankOf(m.from) === rankOf(move.from));
      if (!sameFile) san += 'abcdefgh'[fileOf(move.from)];
      else if (!sameRank) san += String(rankOf(move.from) + 1);
      else san += squareName(move.from);
    }
    if (move.captured) san += 'x';
    san += target;
  }

  return san + checkSuffix(state, move);
}

function checkSuffix(state, move) {
  const undo = makeMove(state, move);
  let suffix = '';
  if (inCheck(state, state.turn)) {
    suffix = generateLegalMoves(state).length === 0 ? '#' : '+';
  }
  unmakeMove(state, move, undo);
  return suffix;
}

export function toFEN(state) {
  let fen = '';
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const piece = state.board[idx(f, r)];
      if (!piece) { empty++; continue; }
      if (empty) { fen += empty; empty = 0; }
      fen += piece;
    }
    if (empty) fen += empty;
    if (r > 0) fen += '/';
  }
  const c = state.castling;
  const rights = (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '');
  fen += ` ${state.turn} ${rights || '-'} ${state.ep >= 0 ? squareName(state.ep) : '-'}`;
  fen += ` ${state.halfmove} ${state.fullmove}`;
  return fen;
}
