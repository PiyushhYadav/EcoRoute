/**
 * EcoRoute Zero-Dependency Web Audio API Synthesizer
 * 
 * Provides self-contained procedural sound effects for Dijkstra graph traversal
 * and Mr. Bean's Mini Cooper vehicle animation (Ignition, Idle Purr, Driving Hum,
 * Deceleration Swoosh, Emerald Arrival Chime, Engine Shut-off).
 * Zero external .mp3/.wav files - instantaneous loading, 100% offline & Render compatible.
 * 
 * Upgraded with a master limiter bus (DynamicsCompressorNode) and laptop speaker optimization:
 * - 2.4x master loudness boost protected by clean limiter to prevent distortion/crackling.
 * - Harmonic overtones (2x frequency) and raised lowpass filters (500-650 Hz) for clear projection
 *   on thin laptop and mobile speakers.
 */

const STORAGE_KEY = 'ecoroute_sound_muted';
const MASTER_VOLUME = 2.4;

let audioCtx = null;
let masterGain = null;
let compressor = null;
let isMuted = false;
let activeHum = null; // { osc, oscHarmonic, harmonicGain, filter, gain }
let activeIdle = null; // { osc1, osc2, oscHarmonic, harmonicGain, filter, gain }
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
 * Lazily initialize or retrieve the shared AudioContext, masterGain, and limiter compressor.
 * Chain: all sound nodes -> masterGain -> compressor (DynamicsCompressorNode) -> ctx.destination
 */
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AudioContextClass();

      // Configure DynamicsCompressorNode as a clean safety limiter
      compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -8;
      compressor.knee.value = 12;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;
      compressor.threshold.setValueAtTime(-8, audioCtx.currentTime);
      compressor.knee.setValueAtTime(12, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(8, audioCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      compressor.release.setValueAtTime(0.15, audioCtx.currentTime);

      // Master gain node (~2.4x loudness boost, 0 when muted)
      masterGain = audioCtx.createGain();
      masterGain.gain.value = isMuted ? 0 : MASTER_VOLUME;
      masterGain.gain.setValueAtTime(isMuted ? 0 : MASTER_VOLUME, audioCtx.currentTime);

      // Signal chain: masterGain -> compressor -> destination
      masterGain.connect(compressor);
      compressor.connect(audioCtx.destination);
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
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      // Clean 12ms micro-ramp to eliminate any clicks or pops when toggling mute
      masterGain.gain.linearRampToValueAtTime(isMuted ? 0 : MASTER_VOLUME, now + 0.012);
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
 * Crisp wooden/glass "tick" (~48ms blip sweeping 680Hz -> 520Hz, peak gain 0.24)
 * fired when the Dijkstra snake arrowhead reaches a new node.
 * Balanced slightly softer than arrival chimes so rapid step sequences remain pleasant.
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
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.048);

    // Rapid micro-attack (3ms) to punchy peak (0.24) followed by fast exponential decay (48ms)
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.048);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.048);

    setTimeout(() => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (e) {}
    }, 65);
  } catch (e) {}
}

/**
 * 3. playCarIgnition():
 * Rich engine start & rev roar (~680ms, dual detuned sawtooth/triangle plus 2x harmonic overtone
 * sweeping through starter rumble into a lively warm throttle rev, low-pass filter opened to 620Hz).
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
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.linearRampToValueAtTime(620, now + 0.28);
    filter.frequency.exponentialRampToValueAtTime(300, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.08);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.32);
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

    // Subtle 2x harmonic overtone (~35% level) so thin laptop speakers clearly project engine roar
    const oscHarmonic = ctx.createOscillator();
    oscHarmonic.type = 'triangle';
    oscHarmonic.frequency.setValueAtTime(96, now);
    oscHarmonic.frequency.linearRampToValueAtTime(160, now + 0.12);
    oscHarmonic.frequency.linearRampToValueAtTime(290, now + 0.28);
    oscHarmonic.frequency.exponentialRampToValueAtTime(136, now + duration);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.35, now);

    oscHarmonic.connect(harmonicGain);
    harmonicGain.connect(filter);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    oscHarmonic.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
    oscHarmonic.stop(now + duration);

    setTimeout(() => {
      try {
        osc1.disconnect();
        osc2.disconnect();
        oscHarmonic.disconnect();
        harmonicGain.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch (e) {}
    }, 750);
  } catch (e) {}
}

/**
 * 4. startCarIdle():
 * Low idle rumble/purr (detuned oscillators at ~44Hz with lowpass filter at 520Hz,
 * organic 1.5Hz beat frequency, 2x overtone at 88Hz, gain 0.24) looping during stationary warm-up & cool-down.
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
    filter.frequency.setValueAtTime(520, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.15);

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(44, now);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(45.5, now);

    // Harmonic overtone at 2x frequency (~88Hz) at ~35% level for laptop speaker audibility
    const oscHarmonic = ctx.createOscillator();
    oscHarmonic.type = 'triangle';
    oscHarmonic.frequency.setValueAtTime(88, now);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.35, now);

    oscHarmonic.connect(harmonicGain);
    harmonicGain.connect(filter);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    oscHarmonic.start(now);

    activeIdle = { osc1, osc2, oscHarmonic, harmonicGain, filter, gain };
  } catch (e) {
    activeIdle = null;
  }
}

/**
 * stopCarIdle(fadeTime = 0.1):
 * Fades out engine idle purr cleanly with zero pops.
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
          if (idle.oscHarmonic) idle.oscHarmonic.stop();
          idle.osc1.disconnect();
          idle.osc2.disconnect();
          if (idle.oscHarmonic) idle.oscHarmonic.disconnect();
          if (idle.harmonicGain) idle.harmonicGain.disconnect();
          idle.filter.disconnect();
          idle.gain.disconnect();
        } catch (e) {}
      }, Math.ceil(fadeTime * 1000) + 40);
    } else {
      try {
        idle.osc1.stop();
        idle.osc2.stop();
        if (idle.oscHarmonic) idle.oscHarmonic.stop();
        idle.osc1.disconnect();
        idle.osc2.disconnect();
        if (idle.oscHarmonic) idle.oscHarmonic.disconnect();
        if (idle.harmonicGain) idle.harmonicGain.disconnect();
      } catch (e) {}
    }
  } catch (e) {}
}

/**
 * 5. startCarHum(speed = 1):
 * Continuous engine driving hum (~75Hz * (0.85 + 0.15 * speed), 2x overtone at 35% level,
 * lowpass filter at 560Hz, punchy gain 0.24) fades in smoothly while the Mini Cooper is cruising.
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
    filter.frequency.setValueAtTime(560, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.08);

    // Harmonic overtone at 2x frequency at ~35% level for laptop speaker clarity
    const oscHarmonic = ctx.createOscillator();
    oscHarmonic.type = 'sawtooth';
    oscHarmonic.frequency.setValueAtTime(baseFreq * 2, now);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.35, now);

    oscHarmonic.connect(harmonicGain);
    harmonicGain.connect(filter);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    oscHarmonic.start(now);
    activeHum = { osc, oscHarmonic, harmonicGain, filter, gain };
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
          if (hum.oscHarmonic) hum.oscHarmonic.stop();
          hum.osc.disconnect();
          if (hum.oscHarmonic) hum.oscHarmonic.disconnect();
          if (hum.harmonicGain) hum.harmonicGain.disconnect();
          hum.filter.disconnect();
          hum.gain.disconnect();
        } catch (e) {}
      }, Math.ceil(fadeTime * 1000) + 40);
    } else {
      try {
        hum.osc.stop();
        if (hum.oscHarmonic) hum.oscHarmonic.stop();
        hum.osc.disconnect();
        if (hum.oscHarmonic) hum.oscHarmonic.disconnect();
        if (hum.harmonicGain) hum.harmonicGain.disconnect();
      } catch (e) {}
    }
  } catch (e) {}
}

/**
 * 6. playCarBrake():
 * Filtered white-noise deceleration swoosh (~240ms bandpass sweeping 880Hz -> 250Hz, gain 0.26).
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
    swooshGain.gain.linearRampToValueAtTime(0.26, now + 0.035);
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
 * Clean, resonant two-note emerald arrival chime (C5: 523.25Hz at 0.34 gain -> G5: 783.99Hz at 0.38 gain,
 * sine wave, exponential decay). Rings out clearly and joyfully on laptop and phone speakers.
 */
export function playArrivalChime() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const chime1Start = now + 0.02;
    const chime2Start = now + 0.18;

    // Note 1: C5 (523.25Hz)
    const oscC5 = ctx.createOscillator();
    const gainC5 = ctx.createGain();
    oscC5.type = 'sine';
    oscC5.frequency.setValueAtTime(523.25, chime1Start);

    gainC5.gain.setValueAtTime(0.001, chime1Start);
    gainC5.gain.linearRampToValueAtTime(0.34, chime1Start + 0.015);
    gainC5.gain.exponentialRampToValueAtTime(0.0001, chime1Start + 0.24);

    oscC5.connect(gainC5);
    gainC5.connect(masterGain);
    oscC5.start(chime1Start);
    oscC5.stop(chime1Start + 0.24);

    // Note 2: G5 (783.99Hz, bright, joyful arrival ring)
    const oscG5 = ctx.createOscillator();
    const gainG5 = ctx.createGain();
    oscG5.type = 'sine';
    oscG5.frequency.setValueAtTime(783.99, chime2Start);

    gainG5.gain.setValueAtTime(0.001, chime2Start);
    gainG5.gain.linearRampToValueAtTime(0.38, chime2Start + 0.015);
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
 * Engine shut-off: pitch drop (65Hz down to 22Hz over 350ms with 2x harmonic overtone and 550Hz filter)
 * followed by a crisp mechanical relay switch click (gain 0.24).
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

    // Harmonic overtone at 2x frequency (~130Hz -> 44Hz) at ~35% level
    const oscHarmonic = ctx.createOscillator();
    oscHarmonic.type = 'triangle';
    oscHarmonic.frequency.setValueAtTime(130, now);
    oscHarmonic.frequency.exponentialRampToValueAtTime(44, now + duration);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.35, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(550, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscHarmonic.connect(harmonicGain);
    harmonicGain.connect(filter);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    oscHarmonic.start(now);
    osc.stop(now + duration);
    oscHarmonic.stop(now + duration);

    // Mechanical relay switch click at the end (gain 0.24)
    const clickStart = now + 0.32;
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1100, clickStart);
    clickOsc.frequency.exponentialRampToValueAtTime(300, clickStart + 0.015);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.001, clickStart);
    clickGain.gain.linearRampToValueAtTime(0.24, clickStart + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, clickStart + 0.018);

    clickOsc.connect(clickGain);
    clickGain.connect(masterGain);

    clickOsc.start(clickStart);
    clickOsc.stop(clickStart + 0.02);

    setTimeout(() => {
      try {
        osc.disconnect();
        oscHarmonic.disconnect();
        harmonicGain.disconnect();
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
 * Immediately stops any active hum and idle purr, and smoothly ramps master gain to target
 * whenever Pause, Reset, Stop All, tab switch, or page unmount occurs. Zero clicks or pops.
 */
export function stopAllSounds() {
  stopCarHum(0.02);
  stopCarIdle(0.02);
  if (masterGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      const targetGain = isMuted ? 0 : MASTER_VOLUME;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(targetGain, now + 0.012);
    } catch (e) {}
  }
}

/**
 * 11. playUiClick():
 * Crisp, modern UI click / toggle sound effect (gain 0.24).
 */
export function playUiClick() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.025);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.025);

    setTimeout(() => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (e) {}
    }, 50);
  } catch (e) {}
}

/**
 * 12. playErrorTone():
 * Clear, gentle two-tone rejection/error buzz (gain 0.25).
 */
export function playErrorTone() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(180, now + 0.07);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.16);

    setTimeout(() => {
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch (e) {}
    }, 220);
  } catch (e) {}
}

const soundEngine = {
  unlockAudio,
  isSoundMuted,
  setSoundMuted,
  toggleMute,
  subscribeMute,
  playNodeTick,
  playCarIgnition,
  startCarIdle,
  stopCarIdle,
  startCarHum,
  stopCarHum,
  playCarBrake,
  playArrivalChime,
  playCarBrakeAndArrive,
  playEngineStop,
  stopAllSounds,
  playUiClick,
  playErrorTone,
};

export default soundEngine;
