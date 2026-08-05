/**
 * All sound is synthesised at runtime — no audio files to download, and every
 * character gets a voice that matches its weight. Nothing is created until the
 * player's first tap, which is also what unlocks audio on iOS.
 */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.noiseBuffer = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;

    // A touch of room so the board feels like a hall rather than a phone speaker.
    const convolver = this.ctx.createConvolver();
    convolver.buffer = this._impulse(1.6, 2.6);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.18;
    this.master.connect(this.ctx.destination);
    this.master.connect(convolver);
    convolver.connect(wet);
    wet.connect(this.ctx.destination);

    this.noiseBuffer = this._noise(2);
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  get ready() {
    return this.enabled && this.ctx && this.master;
  }

  _noise(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _impulse(seconds, decay) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  /** One-shot tone. */
  _tone({ freq, endFreq, type = 'sine', gain = 0.2, attack = 0.005, duration = 0.25, delay = 0, detune = 0 }) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /** One-shot filtered noise — impacts, dust, stone. */
  _noiseHit({ gain = 0.25, duration = 0.3, filter = 'lowpass', freq = 900, endFreq, q = 1, delay = 0 }) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;

    const biquad = this.ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(freq, t0);
    if (endFreq) biquad.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
    biquad.Q.value = q;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    source.connect(biquad);
    biquad.connect(env);
    env.connect(this.master);
    source.start(t0);
    source.stop(t0 + duration + 0.05);
  }

  // -- character voices -----------------------------------------------------

  move(type, color) {
    if (!this.ready) return;
    const low = color === 'b';
    switch (type) {
      case 'n': // hooves
        for (let i = 0; i < 3; i++) {
          this._noiseHit({ gain: 0.16, duration: 0.09, filter: 'bandpass', freq: 260, q: 3, delay: i * 0.055 });
        }
        break;
      case 'r': // stone grinding
        this._noiseHit({ gain: 0.22, duration: 0.42, filter: 'lowpass', freq: 420, endFreq: 130, q: 1.2 });
        this._tone({ freq: 62, endFreq: 44, type: 'square', gain: 0.09, duration: 0.4 });
        break;
      case 'b': // a soft chime
        this._tone({ freq: low ? 520 : 660, type: 'triangle', gain: 0.1, duration: 0.5 });
        this._tone({ freq: low ? 780 : 990, type: 'sine', gain: 0.05, duration: 0.4, delay: 0.04 });
        break;
      case 'q':
        this._tone({ freq: low ? 440 : 587, endFreq: low ? 660 : 880, type: 'triangle', gain: 0.11, duration: 0.55 });
        this._tone({ freq: low ? 220 : 293, type: 'sine', gain: 0.07, duration: 0.5 });
        break;
      case 'k':
        this._noiseHit({ gain: 0.2, duration: 0.25, filter: 'lowpass', freq: 300, endFreq: 110 });
        this._tone({ freq: low ? 98 : 131, type: 'sine', gain: 0.12, duration: 0.45 });
        break;
      default: // pawn footfall
        this._noiseHit({ gain: 0.14, duration: 0.13, filter: 'lowpass', freq: 620, endFreq: 200 });
        break;
    }
  }

  land(type) {
    if (!this.ready) return;
    if (type === 'n') {
      this._noiseHit({ gain: 0.3, duration: 0.24, filter: 'lowpass', freq: 700, endFreq: 130 });
      this._tone({ freq: 90, endFreq: 50, type: 'sine', gain: 0.16, duration: 0.26 });
    } else if (type === 'r') {
      this._tone({ freq: 70, endFreq: 42, type: 'square', gain: 0.14, duration: 0.32 });
      this._noiseHit({ gain: 0.16, duration: 0.2, filter: 'lowpass', freq: 320, endFreq: 100 });
    } else if (type === 'b' || type === 'q') {
      this._tone({ freq: 880, endFreq: 1320, type: 'sine', gain: 0.055, duration: 0.3 });
    } else {
      this._noiseHit({ gain: 0.17, duration: 0.16, filter: 'lowpass', freq: 500, endFreq: 150 });
    }
  }

  /** Steel meeting steel, weighted by who threw the blow. */
  impact(attackerType) {
    if (!this.ready) return;
    const heavy = attackerType === 'r' || attackerType === 'q' || attackerType === 'k';
    this._noiseHit({ gain: 0.4, duration: 0.16, filter: 'highpass', freq: 1800, q: 0.8 });
    this._noiseHit({ gain: 0.34, duration: 0.34, filter: 'lowpass', freq: heavy ? 500 : 900, endFreq: 90 });
    this._tone({ freq: heavy ? 150 : 240, endFreq: 55, type: 'square', gain: 0.2, duration: 0.28 });
    this._tone({ freq: 2400, endFreq: 1200, type: 'triangle', gain: 0.1, duration: 0.2, delay: 0.01 });
  }

  shatter() {
    if (!this.ready) return;
    this._noiseHit({ gain: 0.22, duration: 0.55, filter: 'bandpass', freq: 2600, endFreq: 700, q: 0.7 });
    for (let i = 0; i < 5; i++) {
      this._tone({
        freq: 900 + Math.random() * 1800, endFreq: 300, type: 'triangle',
        gain: 0.05, duration: 0.22, delay: i * 0.035,
      });
    }
  }

  check() {
    if (!this.ready) return;
    this._tone({ freq: 740, type: 'sawtooth', gain: 0.12, duration: 0.18 });
    this._tone({ freq: 622, type: 'sawtooth', gain: 0.12, duration: 0.3, delay: 0.16 });
  }

  promote() {
    if (!this.ready) return;
    [523, 659, 784, 1047].forEach((freq, i) => {
      this._tone({ freq, type: 'triangle', gain: 0.13, duration: 0.6, delay: i * 0.075 });
    });
  }

  castle() {
    if (!this.ready) return;
    this._noiseHit({ gain: 0.2, duration: 0.3, filter: 'lowpass', freq: 500, endFreq: 140 });
    this._tone({ freq: 196, endFreq: 262, type: 'triangle', gain: 0.11, duration: 0.35 });
  }

  select() {
    this._tone({ freq: 880, type: 'sine', gain: 0.06, duration: 0.09 });
  }

  click() {
    this._tone({ freq: 520, type: 'square', gain: 0.04, duration: 0.06 });
  }

  deny() {
    this._tone({ freq: 180, endFreq: 110, type: 'square', gain: 0.09, duration: 0.16 });
  }

  victory() {
    if (!this.ready) return;
    [523, 659, 784, 1047, 1319].forEach((freq, i) => {
      this._tone({ freq, type: 'triangle', gain: 0.14, duration: 0.9, delay: i * 0.12 });
      this._tone({ freq: freq / 2, type: 'sine', gain: 0.08, duration: 0.9, delay: i * 0.12 });
    });
  }

  defeat() {
    if (!this.ready) return;
    [392, 349, 294, 220].forEach((freq, i) => {
      this._tone({ freq, type: 'sawtooth', gain: 0.1, duration: 1.0, delay: i * 0.18 });
    });
    this._noiseHit({ gain: 0.16, duration: 1.4, filter: 'lowpass', freq: 400, endFreq: 60, delay: 0.4 });
  }

  draw() {
    if (!this.ready) return;
    [440, 415, 440].forEach((freq, i) => {
      this._tone({ freq, type: 'triangle', gain: 0.1, duration: 0.7, delay: i * 0.2 });
    });
  }
}
