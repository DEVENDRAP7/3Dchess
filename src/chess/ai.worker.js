/**
 * Runs the search off the main thread so the board keeps animating at 60fps
 * while the opponent thinks. main.js falls back to a synchronous search if
 * module workers aren't available.
 */
import { findBestMove } from './ai.js';

self.onmessage = (event) => {
  const { id, state, difficulty } = event.data || {};
  try {
    const result = findBestMove(state, { difficulty });
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
