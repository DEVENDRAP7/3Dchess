/** DOM side of the game: panels, lists, cards and transient messages. */

import { CODEX, ARMIES } from '../game/lore.js';

export const GLYPH = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER = { q: 0, r: 1, b: 2, n: 3, p: 4, k: 5 };

export const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.tickerTimer = null;
    this.toastTimer = null;
  }

  // -- transient messages ---------------------------------------------------

  ticker(text, { alarm = false, hold = 2600 } = {}) {
    const el = $('ticker');
    el.textContent = text;
    el.classList.toggle('alarm', alarm);
    el.classList.add('show');
    clearTimeout(this.tickerTimer);
    this.tickerTimer = setTimeout(() => el.classList.remove('show'), hold);
  }

  toast(text, hold = 2800) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('hidden'), hold);
  }

  // -- turn indicator -------------------------------------------------------

  setTurn(color, { check = false, label = null, thinking = false } = {}) {
    $('turnDot').className = 'turn-dot ' + color;
    $('turnText').textContent = label || `${ARMIES[color].name} to move`;
    $('turnPill').classList.toggle('check', check);
    $('thinking').classList.toggle('hidden', !thinking);
  }

  setNetBadge(text, bad = false) {
    const badge = $('netBadge');
    if (!text) { badge.classList.add('hidden'); return; }
    badge.classList.remove('hidden');
    badge.textContent = text;
    badge.classList.toggle('bad', bad);
  }

  // -- captured trays -------------------------------------------------------

  /**
   * `captured` is { w: [types…], b: [types…] } listing pieces *lost* by each
   * army. The tray shown at the top belongs to the player at the top.
   */
  setCaptured(captured, bottomColor) {
    const topColor = bottomColor === 'w' ? 'b' : 'w';
    const score = { w: 0, b: 0 };
    for (const color of ['w', 'b']) {
      for (const type of captured[color]) score[color] += PIECE_VALUE[type];
    }

    const paint = (trayId, lostBy) => {
      const tray = $(trayId);
      const owner = lostBy === 'w' ? 'b' : 'w';   // the army that took them
      const items = tray.querySelector('.tray-items');
      const list = captured[lostBy].slice().sort((a, b) => ORDER[a] - ORDER[b]);
      items.className = 'tray-items ' + lostBy;
      items.textContent = list.map((t) => GLYPH[lostBy][t]).join('');
      const lead = score[lostBy] - score[owner];
      tray.querySelector('.tray-score').textContent = lead > 0 ? '+' + lead : '';
      tray.classList.toggle('show', list.length > 0);
    };

    // The tray at the top lists what the top player has lost.
    paint('trayTop', topColor);
    paint('trayBottom', bottomColor);
  }

  // -- move list ------------------------------------------------------------

  setMoves(sanList) {
    const body = $('movesTable').querySelector('tbody');
    body.textContent = '';
    for (let i = 0; i < sanList.length; i += 2) {
      const row = document.createElement('tr');
      const number = document.createElement('td');
      number.className = 'n';
      number.textContent = (i / 2 + 1) + '.';
      row.appendChild(number);

      for (const offset of [0, 1]) {
        const cell = document.createElement('td');
        cell.textContent = sanList[i + offset] || '';
        if (i + offset === sanList.length - 1) cell.className = 'last';
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
    const scroll = document.querySelector('.moves-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  // -- character card -------------------------------------------------------

  showCard(color, type) {
    const entry = CODEX[color][type];
    $('cardGlyph').textContent = GLYPH[color][type];
    $('cardName').textContent = entry.name;
    $('cardRank').textContent = `${entry.rank} · ${ARMIES[color].name}`;
    $('cardPersonality').textContent = entry.personality;
    $('cardDress').textContent = entry.dress;
    $('cardHelm').textContent = entry.helm;
    $('cardQuirk').textContent = entry.quirk;
    $('cardSignature').textContent = `${entry.signature} — ${entry.moveStyle}`;
    $('cardPanel').classList.remove('hidden');
  }

  hideCard() {
    $('cardPanel').classList.add('hidden');
  }

  // -- codex ----------------------------------------------------------------

  renderCodex(army) {
    const list = $('codexList');
    list.textContent = '';
    const header = document.createElement('p');
    header.className = 'hint-text';
    header.textContent = `${ARMIES[army].realm} — "${ARMIES[army].motto}"`;
    list.appendChild(header);

    for (const type of ['k', 'q', 'r', 'b', 'n', 'p']) {
      const entry = CODEX[army][type];
      const card = document.createElement('div');
      card.className = 'codex-entry';

      const title = document.createElement('h4');
      const glyph = document.createElement('span');
      glyph.className = 'glyph';
      glyph.textContent = GLYPH[army][type];
      title.appendChild(glyph);
      title.appendChild(document.createTextNode(entry.name));
      const rank = document.createElement('span');
      rank.textContent = entry.rank;
      title.appendChild(rank);
      card.appendChild(title);

      for (const [label, value] of [
        ['Bearing', entry.personality],
        ['Dress', entry.dress],
        ['Helm', entry.helm],
        ['Habit', entry.quirk],
        ['On the move', `${entry.signature} — ${entry.moveStyle}`],
      ]) {
        const line = document.createElement('p');
        const strong = document.createElement('b');
        strong.textContent = label + ': ';
        line.appendChild(strong);
        line.appendChild(document.createTextNode(value));
        card.appendChild(line);
      }
      list.appendChild(card);
    }
  }

  // -- promotion ------------------------------------------------------------

  askPromotion(color) {
    return new Promise((resolve) => {
      const grid = $('promoGrid');
      grid.textContent = '';
      const names = { q: 'Queen', r: 'Rampart', b: 'Oracle', n: 'Rider' };
      for (const type of ['q', 'r', 'b', 'n']) {
        const button = document.createElement('button');
        const glyph = document.createElement('span');
        glyph.className = 'g';
        glyph.textContent = GLYPH[color][type];
        const label = document.createElement('span');
        label.className = 'n';
        label.textContent = names[type];
        button.append(glyph, label);
        button.addEventListener('click', () => {
          $('promotion').classList.add('hidden');
          resolve(type);
        }, { once: true });
        grid.appendChild(button);
      }
      $('promotion').classList.remove('hidden');
    });
  }

  // -- checkmate breakdown --------------------------------------------------

  /**
   * Draws the final position as a flat diagram, marked up so the mate reads at
   * a glance: who delivers it, where the king is, and every square he cannot
   * step to. Always drawn with rank 1 at the bottom, like a printed board.
   */
  renderMateBoard(board, analysis) {
    const grid = $('mateBoard');
    grid.textContent = '';
    const checkers = new Set(analysis.checkers);
    const covered = new Map(analysis.escapes.map((e) => [e.square, e.reason]));

    for (let rank = 7; rank >= 0; rank--) {
      for (let file = 0; file < 8; file++) {
        const index = rank * 8 + file;
        const cell = document.createElement('div');
        cell.className = 'sq ' + ((file + rank) % 2 === 1 ? 'light' : 'dark');

        if (index === analysis.kingSquare) cell.classList.add('king');
        else if (checkers.has(index)) cell.classList.add('checker');
        else if (covered.has(index)) cell.classList.add(covered.get(index) === 'own' ? 'own' : 'covered');

        const code = board[index];
        if (code) {
          const glyph = document.createElement('span');
          const color = code === code.toUpperCase() ? 'w' : 'b';
          glyph.className = 'g ' + color;
          glyph.textContent = GLYPH[color][code.toLowerCase()];
          cell.appendChild(glyph);
        }
        grid.appendChild(cell);
      }
    }
  }

  showMateScreen({ title, subtitle, mark, notes, canRematch }) {
    $('mateMark').textContent = mark;
    $('mateTitle').textContent = title;
    $('mateSubtitle').textContent = subtitle;

    const list = $('mateNotes');
    list.textContent = '';
    for (const note of notes) {
      const li = document.createElement('li');
      // Notes arrive as [plain, emphasised, plain, …] so squares can be bolded
      // without ever putting caller text through innerHTML.
      note.forEach((part, i) => {
        if (i % 2 === 1) {
          const b = document.createElement('b');
          b.textContent = part;
          li.appendChild(b);
        } else {
          li.appendChild(document.createTextNode(part));
        }
      });
      list.appendChild(li);
    }

    $('mateRematchBtn').classList.toggle('hidden', !canRematch);
    $('mateRematchNote').classList.add('hidden');
    $('mateScreen').classList.remove('hidden');
  }

  hideMateScreen() {
    $('mateScreen').classList.add('hidden');
  }

  // -- game over ------------------------------------------------------------

  showGameOver({ mark, title, text, canRematch = true, note = '' }) {
    $('overMark').textContent = mark;
    $('overTitle').textContent = title;
    $('overText').textContent = text;
    $('rematchBtn').classList.toggle('hidden', !canRematch);
    const noteEl = $('rematchNote');
    noteEl.textContent = note;
    noteEl.classList.toggle('hidden', !note);
    $('gameover').classList.remove('hidden');
  }

  hideGameOver() {
    $('gameover').classList.add('hidden');
  }
}
