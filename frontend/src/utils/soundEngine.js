/**
 * EcoRoute Zero-Dependency Web Audio API Synthesizer
 * 
 * Provides self-contained procedural sound effects for Dijkstra graph traversal
 * and Mr. Bean's Mini Cooper vehicle animation.
 * Zero external .mp3/.wav files - instantaneous loading, 100% offline & Render compatible.
 */

const STORAGE_KEY = 'ecoroute_sound_muted';
const MASTER_VOLUME = 0.22;

let audioCtx = null;
let masterGain = null;
let isMuted = false;
let activeHum = null; // { osc, filter, gain }
const muteListeners = new Set();

// Load initial mute state from localStorage (default: false / sound on)
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    isMuted = saved === 'true';
  } catch (e) {
    isMuted = false;
  }
}

/**
 * Lazily initialize or retrieve the shared AudioContext and masterGain
 */
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AudioContextClass();
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(isMuted ? 0 : MASTER_VOLUME, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);
    } catch (e) {
      console.warn('Web Audio initialization error:', e);
      return null;
    }
  }
  return audioCtx;
}

/**
 * 1. unlockAudio():
 * Lazily creates or resumes the shared AudioContext on user interaction
 * (Play, Run All, Step, Replay Drive, or sound toggle) to comply with browser autoplay policies.
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/**
 * Check if sound effects are currently muted
 */
export function isSoundMuted() {
  return isMuted;
}

/**
 * Set master mute state and persist in localStorage
 */
export function setSoundMuted(muted) {
  isMuted = Boolean(muted);
  try {
    localStorage.setItem(STORAGE_KEY, isMuted ? 'true' : 'false');
  } catch (e) {}

  if (masterGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(isMuted ? 0 : MASTER_VOLUME, now);
    } catch (e) {}
  }

  if (isMuted) {
    stopAllSounds();
  } else {
    unlockAudio();
  }

  muteListeners.forEach((cb) => {
    try {
      cb(isMuted);
    } catch (e) {}
  });
}

/**
 * Toggle master mute state
 */
export function toggleMute() {
  const next = !isMuted;
  setSoundMuted(next);
  return next;
}

/**
 * Subscribe to mute state changes
 */
export function subscribeMute(listener) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

/**
 * 2. playNodeTick():
 * Ultra-subtle, crisp wooden/glass "tick" (~45ms blip sweeping 680Hz → 520Hz, low gain 0.08)
 * fired when the Dijkstra snake arrowhead reaches a new node.
 */
export function playNodeTick() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.045);

    // Rapid micro-attack (2ms) followed by fast exponential decay (45ms)
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.045);

    setTimeout(() => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (e) {}
    }, 60);
  } catch (e) {}
}

/**
 * 3. playCarIgnition():
 * Warm low-pass filtered engine purr/rev (~280ms, dual detuned sawtooth/triangle
 * sweeping 65Hz → 115Hz → 85Hz through a 320Hz low-pass filter).
 */
export function playCarIgnition() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const duration = 0.28;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Dual detuned oscillators for authentic engine warmth
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(65, now);
    osc1.frequency.linearRampToValueAtTime(115, now + 0.12);
    osc1.frequency.linearRampToValueAtTime(85, now + duration);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.detune.setValueAtTime(7.5, now); // 7.5 cent detune
    osc2.frequency.setValueAtTime(65, now);
    osc2.frequency.linearRampToValueAtTime(115, now + 0.12);
    osc2.frequency.linearRampToValueAtTime(85, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);

    setTimeout(() => {
      try {
        osc1.disconnect();
        osc2.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch (e) {}
    }, 340);
  } catch (e) {}
}

/**
 * 4. startCarHum(speed = 1):
 * Very soft, continuous low-pass filtered engine hum (~75Hz * (0.85 + 0.15 * speed), gain 0.07)
 * fades in smoothly (80ms) while the Mini Cooper is driving.
 */
export function startCarHum(speed = 1) {
  // Always safely clean up any prior hum before starting
  stopCarHum(0.02);

  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const baseFreq = Math.max(55, Math.min(130, 75 * (0.85 + 0.15 * (speed || 1))));

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    // Smooth 80ms fade-in to subtle gain 0.07
    gain.gain.linearRampToValueAtTime(0.07, now + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    activeHum = { osc, filter, gain };
  } catch (e) {
    activeHum = null;
  }
}

/**
 * stopCarHum(fadeTime = 0.12):
 * Fades out cleanly (120ms default) when stopping, pausing, resetting, or unmounting.
 * NEVER leaves a stuck hum playing.
 */
export function stopCarHum(fadeTime = 0.12) {
  if (!activeHum) return;
  const hum = activeHum;
  activeHum = null;

  try {
    const ctx = getAudioContext();
    if (ctx && hum.gain) {
      const now = ctx.currentTime;
      hum.gain.gain.cancelScheduledValues(now);
      hum.gain.gain.setValueAtTime(hum.gain.gain.value, now);
      hum.gain.gain.linearRampToValueAtTime(0.0001, now + fadeTime);

      setTimeout(() => {
        try {
          hum.osc.stop();
          hum.osc.disconnect();
          hum.filter.disconnect();
          hum.gain.disconnect();
        } catch (e) {}
      }, Math.ceil(fadeTime * 1000) + 40);
    } else {
      try {
        hum.osc.stop();
        hum.osc.disconnect();
      } catch (e) {}
    }
  } catch (e) {}
}

/**
 * 5. playCarBrakeAndArrive():
 * Brief gentle filtered white-noise deceleration swoosh (~220ms bandpass sweeping 900Hz → 260Hz)
 * followed by a clean, soft two-note emerald arrival chime (C5 → G5, sine wave, exponential decay).
 */
export function playCarBrakeAndArrive() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;

    // A. Gentle deceleration swoosh (~220ms filtered white noise)
    const noiseDuration = 0.22;
    const sampleRate = ctx.sampleRate || 44100;
    const bufferSize = Math.floor(sampleRate * noiseDuration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const channelData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.Q.setValueAtTime(2.8, now);
    bpf.frequency.setValueAtTime(900, now);
    bpf.frequency.exponentialRampToValueAtTime(260, now + noiseDuration);

    const swooshGain = ctx.createGain();
    swooshGain.gain.setValueAtTime(0.001, now);
    swooshGain.gain.linearRampToValueAtTime(0.06, now + 0.035);
    swooshGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDuration);

    whiteNoise.connect(bpf);
    bpf.connect(swooshGain);
    swooshGain.connect(masterGain);

    whiteNoise.start(now);
    whiteNoise.stop(now + noiseDuration);

    // B. Clean two-note emerald arrival chime (C5: 523.25Hz, G5: 783.99Hz)
    const chime1Start = now + 0.16;
    const chime2Start = now + 0.32;

    // Note 1: C5
    const oscC5 = ctx.createOscillator();
    const gainC5 = ctx.createGain();
    oscC5.type = 'sine';
    oscC5.frequency.setValueAtTime(523.25, chime1Start);

    gainC5.gain.setValueAtTime(0.001, chime1Start);
    gainC5.gain.linearRampToValueAtTime(0.08, chime1Start + 0.015);
    gainC5.gain.exponentialRampToValueAtTime(0.0001, chime1Start + 0.22);

    oscC5.connect(gainC5);
    gainC5.connect(masterGain);
    oscC5.start(chime1Start);
    oscC5.stop(chime1Start + 0.22);

    // Note 2: G5 (bright, joyful arrival ring)
    const oscG5 = ctx.createOscillator();
    const gainG5 = ctx.createGain();
    oscG5.type = 'sine';
    oscG5.frequency.setValueAtTime(783.99, chime2Start);

    gainG5.gain.setValueAtTime(0.001, chime2Start);
    gainG5.gain.linearRampToValueAtTime(0.09, chime2Start + 0.015);
    gainG5.gain.exponentialRampToValueAtTime(0.0001, chime2Start + 0.36);

    oscG5.connect(gainG5);
    gainG5.connect(masterGain);
    oscG5.start(chime2Start);
    oscG5.stop(chime2Start + 0.36);

    setTimeout(() => {
      try {
        whiteNoise.disconnect();
        bpf.disconnect();
        swooshGain.disconnect();
        oscC5.disconnect();
        gainC5.disconnect();
        oscG5.disconnect();
        gainG5.disconnect();
      } catch (e) {}
    }, 750);
  } catch (e) {}
}

/**
 * 6. stopAllSounds():
 * Immediately stops any active hum and cancels scheduled gain values whenever
 * Pause, Reset, Stop All, tab switch, or page unmount occurs.
 */
export function stopAllSounds() {
  stopCarHum(0.01);
  if (masterGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(isMuted ? 0 : MASTER_VOLUME, now);
    } catch (e) {}
  }
}
