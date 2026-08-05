/**
 * Peer-to-peer play.
 *
 * There is no game server — the two browsers talk directly over WebRTC, which
 * is what lets the whole thing live on GitHub Pages. A public broker is used
 * only to introduce the peers; once connected, moves never touch it.
 *
 * Both sides run the full rules engine and validate everything they receive,
 * so a tampered peer cannot make an illegal move happen on your board.
 */

const BROKER_PREFIX = 'chessforge-v1-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
const CODE_LENGTH = 5;

// STUN gets most peers connected; the TURN relay is a best-effort fallback for
// mobile networks behind symmetric NAT. Swap in your own credentials if you
// ever need guaranteed relay capacity.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

let peerScriptPromise = null;

/** Loads the WebRTC helper on demand — offline and solo play never pay for it. */
function loadPeerLibrary() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerScriptPromise) return peerScriptPromise;
  peerScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/peerjs.min.js';
    script.async = true;
    script.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('peer library failed to load')));
    script.onerror = () => reject(new Error('could not load the multiplayer library'));
    document.head.appendChild(script);
  });
  return peerScriptPromise;
}

export function makeRoomCode() {
  let code = '';
  const random = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[random[i] % CODE_ALPHABET.length];
  return code;
}

export function roomCodeFromUrl() {
  const params = new URLSearchParams(location.search);
  const code = params.get('room') || params.get('r');
  if (!code) return null;
  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length === CODE_LENGTH ? cleaned : null;
}

export function inviteLink(code) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

export class OnlineSession {
  constructor() {
    this.peer = null;
    this.connection = null;
    this.code = null;
    this.isHost = false;
    this.connected = false;
    this.latency = null;
    this.closed = false;

    // Consumers assign these.
    this.onStatus = () => {};
    this.onOpen = () => {};
    this.onMessage = () => {};
    this.onClose = () => {};
    this.onError = () => {};

    this._pingTimer = null;
    this._pingSentAt = 0;
  }

  async host() {
    const Peer = await loadPeerLibrary();
    this.isHost = true;

    // The broker rejects an ID that's already taken, so retry with a new code.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeRoomCode();
      try {
        await this._createPeer(Peer, BROKER_PREFIX + code);
        this.code = code;
        this.onStatus('waiting', { code });
        this.peer.on('connection', (connection) => {
          if (this.connection) {
            // Only one opponent per room.
            try { connection.close(); } catch { /* already gone */ }
            return;
          }
          this._attach(connection);
        });
        return code;
      } catch (err) {
        if (err && err.type === 'unavailable-id' && attempt < 4) continue;
        throw err;
      }
    }
    throw new Error('could not open a room, please try again');
  }

  async join(code) {
    const Peer = await loadPeerLibrary();
    this.isHost = false;
    this.code = code;
    await this._createPeer(Peer, null);
    this.onStatus('connecting', { code });

    const connection = this.peer.connect(BROKER_PREFIX + code, {
      reliable: true,
      serialization: 'json',
      metadata: { role: 'guest' },
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('no answer — check the code, or ask them to reopen the room')), 20000);
      connection.on('open', () => { clearTimeout(timeout); resolve(); });
      connection.on('error', (err) => { clearTimeout(timeout); reject(err); });
      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        reject(err.type === 'peer-unavailable' ? new Error('no room with that code') : err);
      });
    });

    this._attach(connection);
  }

  _createPeer(Peer, id) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(id, {
        debug: 0,
        config: { iceServers: ICE_SERVERS, sdpSemantics: 'unified-plan' },
      });
      const cleanup = () => {
        peer.off('open', onOpen);
        peer.off('error', onError);
      };
      const onOpen = () => { cleanup(); this.peer = peer; resolve(peer); };
      const onError = (err) => {
        cleanup();
        try { peer.destroy(); } catch { /* nothing to clean up */ }
        reject(err);
      };
      peer.on('open', onOpen);
      peer.on('error', onError);

      // Errors after setup shouldn't tear the game down silently.
      peer.on('disconnected', () => {
        if (!this.closed) {
          this.onStatus('reconnecting', {});
          try { peer.reconnect(); } catch { /* broker gone; P2P link may survive */ }
        }
      });
    });
  }

  _attach(connection) {
    this.connection = connection;
    connection.on('data', (raw) => {
      let message = raw;
      if (typeof raw === 'string') {
        try { message = JSON.parse(raw); } catch { return; }
      }
      if (!message || typeof message !== 'object') return;
      if (message.t === 'ping') { this.send({ t: 'pong', at: message.at }); return; }
      if (message.t === 'pong') {
        this.latency = Math.round(performance.now() - this._pingSentAt);
        this.onStatus('latency', { latency: this.latency });
        return;
      }
      this.onMessage(message);
    });

    connection.on('close', () => this._handleClose('Opponent disconnected'));
    connection.on('error', (err) => this.onError(err));

    const announce = () => {
      this.connected = true;
      this.onStatus('connected', { code: this.code });
      this.onOpen();
      this._startPings();
    };
    if (connection.open) announce();
    else connection.on('open', announce);
  }

  _startPings() {
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      if (!this.connection?.open) return;
      this._pingSentAt = performance.now();
      this.send({ t: 'ping', at: this._pingSentAt });
    }, 4000);
  }

  _handleClose(reason) {
    if (this.closed) return;
    this.connected = false;
    clearInterval(this._pingTimer);
    this.onClose(reason);
  }

  send(message) {
    if (!this.connection || !this.connection.open) return false;
    try {
      this.connection.send(message);
      return true;
    } catch (err) {
      this.onError(err);
      return false;
    }
  }

  close() {
    this.closed = true;
    clearInterval(this._pingTimer);
    try { this.connection?.close(); } catch { /* already closed */ }
    try { this.peer?.destroy(); } catch { /* already destroyed */ }
    this.connection = null;
    this.peer = null;
    this.connected = false;
  }
}
