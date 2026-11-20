/**
 * EcoRoute Zero-Dependency Web Audio API Synthesizer
 * 
 * Provides self-contained procedural sound effects for Dijkstra graph traversal
 * and Mr. Bean's Mini Cooper vehicle animation (Ignition, Idle Purr, Driving Hum,
 * Deceleration Swoosh, Emerald Arrival Chime, Engine Shut-off).
 * Zero external .mp3/.wav files - instantaneous loading, 100% offline & Render compatible.
 */

const STORAGE_KEY = 'ecoroute_sound_muted';
const MASTER_VOLUME = 0.22;

let audioCtx = null;
let masterGain = null;
let isMuted = false;
let activeHum = null; // { osc, filter, gain }
let activeIdle = null; // { osc1, osc2, filter, gain }
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
 * Ultra-subtle, crisp wooden/glass "tick" (~45ms blip sweeping 680Hz -> 520Hz, low gain 0.08)
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
 * Richer engine start & rev roar (~680ms, dual detuned sawtooth/triangle
 * sweeping through starter rumble into a lively warm throttle rev).
 */
export function playCarIgnition() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const duration = 0.68;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, now);
    filter.frequency.linearRampToValueAtTime(520, now + 0.28);
    filter.frequency.exponentialRampToValueAtTime(240, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.08);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.32);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Dual detuned oscillators for authentic engine roar
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(48, now);
    osc1.frequency.linearRampToValueAtTime(80, now + 0.12);
    osc1.frequency.linearRampToValueAtTime(145, now + 0.28);
    osc1.frequency.exponentialRampToValueAtTime(68, now + duration);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.detune.setValueAtTime(9.0, now);
    osc2.frequency.setValueAtTime(48, now);
    osc2.frequency.linearRampToValueAtTime(80, now + 0.12);
    osc2.frequency.linearRampToValueAtTime(145, now + 0.28);
    osc2.frequency.exponentialRampToValueAtTime(68, now + duration);

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
    }, 750);
  } catch (e) {}
}

/**
 * 4. startCarIdle():
 * Gentle low idle rumble/purr (detuned oscillators at ~44Hz with lowpass filter at 140Hz,
 * organic 1.5Hz beat frequency, low gain ~0.038) looping during stationary warm-up & cool-down.
 */
export function startCarIdle() {
  stopCarIdle(0.05);
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.038, now + 0.15);

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(44, now);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(45.5, now);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);

    activeIdle = { osc1, osc2, filter, gain };
  } catch (e) {
    activeIdle = null;
  }
}

/**
 * stopCarIdle(fadeTime = 0.1):
 * Fades out engine idle purr cleanly.
 */
export function stopCarIdle(fadeTime = 0.1) {
  if (!activeIdle) return;
  const idle = activeIdle;
  activeIdle = null;

  try {
    const ctx = getAudioContext();
    if (ctx && idle.gain) {
      const now = ctx.currentTime;
      idle.gain.gain.cancelScheduledValues(now);
      idle.gain.gain.setValueAtTime(idle.gain.gain.value, now);
      idle.gain.gain.linearRampToValueAtTime(0.0001, now + fadeTime);

      setTimeout(() => {
        try {
          idle.osc1.stop();
          idle.osc2.stop();
          idle.osc1.disconnect();
          idle.osc2.disconnect();
          idle.filter.disconnect();
          idle.gain.disconnect();
        } catch (e) {}
      }, Math.ceil(fadeTime * 1000) + 40);
    } else {
      try {
        idle.osc1.stop();
        idle.osc2.stop();
        idle.osc1.disconnect();
        idle.osc2.disconnect();
      } catch (e) {}
    }
  } catch (e) {}
}

/**
 * 5. startCarHum(speed = 1):
 * Very soft, continuous low-pass filtered engine driving hum (~75Hz * (0.85 + 0.15 * speed), gain 0.065)
 * fades in smoothly (80ms) while the Mini Cooper is cruising.
 */
export function startCarHum(speed = 1) {
  stopCarHum(0.02);
  stopCarIdle(0.05);

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
    gain.gain.linearRampToValueAtTime(0.065, now + 0.08);

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
 * 6. playCarBrake():
 * Gentle filtered white-noise deceleration swoosh (~240ms bandpass sweeping 880Hz -> 250Hz).
 */
export function playCarBrake() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const noiseDuration = 0.24;
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
    bpf.Q.setValueAtTime(2.6, now);
    bpf.frequency.setValueAtTime(880, now);
    bpf.frequency.exponentialRampToValueAtTime(250, now + noiseDuration);

    const swooshGain = ctx.createGain();
    swooshGain.gain.setValueAtTime(0.001, now);
    swooshGain.gain.linearRampToValueAtTime(0.055, now + 0.035);
    swooshGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDuration);

    whiteNoise.connect(bpf);
    bpf.connect(swooshGain);
    swooshGain.connect(masterGain);

    whiteNoise.start(now);
    whiteNoise.stop(now + noiseDuration);

    setTimeout(() => {
      try {
        whiteNoise.disconnect();
        bpf.disconnect();
        swooshGain.disconnect();
      } catch (e) {}
    }, 320);
  } catch (e) {}
}

/**
 * 7. playArrivalChime():
 * Clean, soft two-note emerald arrival chime (C5: 523.25Hz -> G5: 783.99Hz, sine wave, exponential decay).
 */
export function playArrivalChime() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const chime1Start = now + 0.02;
    const chime2Start = now + 0.18;

    // Note 1: C5
    const oscC5 = ctx.createOscillator();
    const gainC5 = ctx.createGain();
    oscC5.type = 'sine';
    oscC5.frequency.setValueAtTime(523.25, chime1Start);

    gainC5.gain.setValueAtTime(0.001, chime1Start);
    gainC5.gain.linearRampToValueAtTime(0.08, chime1Start + 0.015);
    gainC5.gain.exponentialRampToValueAtTime(0.0001, chime1Start + 0.24);

    oscC5.connect(gainC5);
    gainC5.connect(masterGain);
    oscC5.start(chime1Start);
    oscC5.stop(chime1Start + 0.24);

    // Note 2: G5 (bright, joyful arrival ring)
    const oscG5 = ctx.createOscillator();
    const gainG5 = ctx.createGain();
    oscG5.type = 'sine';
    oscG5.frequency.setValueAtTime(783.99, chime2Start);

    gainG5.gain.setValueAtTime(0.001, chime2Start);
    gainG5.gain.linearRampToValueAtTime(0.09, chime2Start + 0.015);
    gainG5.gain.exponentialRampToValueAtTime(0.0001, chime2Start + 0.38);

    oscG5.connect(gainG5);
    gainG5.connect(masterGain);
    oscG5.start(chime2Start);
    oscG5.stop(chime2Start + 0.38);

    setTimeout(() => {
      try {
        oscC5.disconnect();
        gainC5.disconnect();
        oscG5.disconnect();
        gainG5.disconnect();
      } catch (e) {}
    }, 650);
  } catch (e) {}
}

/**
 * 8. playCarBrakeAndArrive():
 * Backwards compatibility helper chaining brake swoosh and arrival chime.
 */
export function playCarBrakeAndArrive() {
  playCarBrake();
  playArrivalChime();
}

/**
 * 9. playEngineStop():
 * Subtle engine shut-off: short drop in pitch (65Hz down to 22Hz over 350ms with filter closing)
 * followed by a delicate mechanical relay switch click.
 */
export function playEngineStop() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const duration = 0.35;

    // Engine spin-down tone
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(65, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, now);
    filter.frequency.exponentialRampToValueAtTime(40, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration);

    // Subtle relay / key switch click at the end
    const clickStart = now + 0.32;
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1100, clickStart);
    clickOsc.frequency.exponentialRampToValueAtTime(300, clickStart + 0.015);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.001, clickStart);
    clickGain.gain.linearRampToValueAtTime(0.04, clickStart + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, clickStart + 0.018);

    clickOsc.connect(clickGain);
    clickGain.connect(masterGain);

    clickOsc.start(clickStart);
    clickOsc.stop(clickStart + 0.02);

    setTimeout(() => {
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
        clickOsc.disconnect();
        clickGain.disconnect();
      } catch (e) {}
    }, 450);
  } catch (e) {}
}

/**
 * 10. stopAllSounds():
 * Immediately stops any active hum and idle purr, and cancels scheduled gain values whenever
 * Pause, Reset, Stop All, tab switch, or page unmount occurs.
 */
export function stopAllSounds() {
  stopCarHum(0.01);
  stopCarIdle(0.01);
  if (masterGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(isMuted ? 0 : MASTER_VOLUME, now);
    } catch (e) {}
  }
}
