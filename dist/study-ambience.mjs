// Study Ambience Audio Engine (Pure Web Audio API - 0 KB External Files)
export function createStudyAmbience({
  storage = (typeof localStorage !== 'undefined' ? localStorage : null),
  getContext = null
} = {}) {
  let ctx = null;
  let masterGain = null;
  let activeNodes = [];
  let isPlaying = false;
  let volume = 0.45;
  let currentPreset = 'off';
  const listeners = new Set();

  function notify() {
    for (const fn of listeners) {
      try { fn({ isPlaying, currentPreset, volume }); } catch (e) {}
    }
  }

  try {
    const savedVol = storage?.getItem('sot-ambience-volume');
    if (savedVol !== null && !isNaN(Number(savedVol))) {
      volume = Math.max(0, Math.min(1, Number(savedVol)));
    }
    const savedPreset = storage?.getItem('sot-ambience-preset');
    if (savedPreset && ['rain', 'waves', 'campfire', 'lofi'].includes(savedPreset)) {
      currentPreset = savedPreset;
    }
  } catch (e) {}

  function ensureContext() {
    if (typeof window === 'undefined' && !getContext) return null;
    try {
      if (!ctx) {
        ctx = getContext ? getContext() : new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(volume, ctx.currentTime);
        masterGain.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function createPinkNoiseBuffer(c, duration = 4) {
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  function createBrownNoiseBuffer(c, duration = 4) {
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }
    return buffer;
  }

  function clearActiveNodes() {
    for (const node of activeNodes) {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch (e) {}
    }
    activeNodes = [];
  }

  // 🌧️ 1. Mưa Rơi Êm Dịu (Gentle Rain)
  function startRain(c) {
    const noise = c.createBufferSource();
    noise.buffer = createPinkNoiseBuffer(c, 4);
    noise.loop = true;

    const lowpass = c.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1050, c.currentTime);

    const highpass = c.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(120, c.currentTime);

    const rainGain = c.createGain();
    rainGain.gain.setValueAtTime(0.7, c.currentTime);

    noise.connect(lowpass);
    lowpass.connect(highpass);
    highpass.connect(rainGain);
    rainGain.connect(masterGain);
    noise.start();

    activeNodes.push(noise, lowpass, highpass, rainGain);

    const dropletTimer = setInterval(() => {
      if (!isPlaying || currentPreset !== 'rain') {
        clearInterval(dropletTimer);
        return;
      }
      try {
        const osc = c.createOscillator();
        const dGain = c.createGain();
        const now = c.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2200 + Math.random() * 1400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.04);

        dGain.gain.setValueAtTime(0.015 + Math.random() * 0.025, now);
        dGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

        osc.connect(dGain);
        dGain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.05);
      } catch (e) {}
    }, 130);

    activeNodes.push({ stop: () => clearInterval(dropletTimer) });
  }

  // 🌊 2. Sóng Biển Vỗ Về (Ocean Waves)
  function startWaves(c) {
    const noise = c.createBufferSource();
    noise.buffer = createBrownNoiseBuffer(c, 4);
    noise.loop = true;

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, c.currentTime);

    const waveGain = c.createGain();
    waveGain.gain.setValueAtTime(0.25, c.currentTime);

    const lfo = c.createOscillator();
    lfo.frequency.setValueAtTime(0.1, c.currentTime); // 10s wave surge
    const lfoGain = c.createGain();
    lfoGain.gain.setValueAtTime(0.5, c.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(waveGain.gain);

    noise.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(masterGain);

    noise.start();
    lfo.start();

    activeNodes.push(noise, filter, waveGain, lfo, lfoGain);
  }

  // ☕ 3. Lửa Ấm & Đêm Khuya (Cozy Campfire)
  function startCampfire(c) {
    const noise = c.createBufferSource();
    noise.buffer = createBrownNoiseBuffer(c, 4);
    noise.loop = true;

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, c.currentTime);

    const fireGain = c.createGain();
    fireGain.gain.setValueAtTime(0.4, c.currentTime);

    noise.connect(filter);
    filter.connect(fireGain);
    fireGain.connect(masterGain);
    noise.start();

    activeNodes.push(noise, filter, fireGain);

    const crackleTimer = setInterval(() => {
      if (!isPlaying || currentPreset !== 'campfire') {
        clearInterval(crackleTimer);
        return;
      }
      if (Math.random() > 0.42) {
        try {
          const crackle = c.createBufferSource();
          const crackleBuffer = c.createBuffer(1, c.sampleRate * 0.008, c.sampleRate);
          const d = crackleBuffer.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.3));
          crackle.buffer = crackleBuffer;

          const cGain = c.createGain();
          cGain.gain.setValueAtTime(0.04 + Math.random() * 0.08, c.currentTime);

          const hp = c.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.setValueAtTime(1400, c.currentTime);

          crackle.connect(hp);
          hp.connect(cGain);
          cGain.connect(masterGain);

          crackle.start();
        } catch (e) {}
      }
    }, 75);

    activeNodes.push({ stop: () => clearInterval(crackleTimer) });
  }

  // 🎵 4. Lo-Fi Alpha 432Hz (Ambient Focus Drone)
  function startLoFi(c) {
    const chords = [
      [216, 270, 324, 432], // A minor 9
      [180, 225, 270, 360], // F maj 7
      [240, 288, 360, 480], // C maj 9
      [202.5, 253, 303.75, 405] // G 6
    ];
    let chordIndex = 0;

    function playNextChord() {
      if (!isPlaying || currentPreset !== 'lofi') return;
      const freqs = chords[chordIndex];
      chordIndex = (chordIndex + 1) % chords.length;

      const chordGain = c.createGain();
      const now = c.currentTime;
      chordGain.gain.setValueAtTime(0.0001, now);
      chordGain.gain.linearRampToValueAtTime(0.18, now + 1.2);
      chordGain.gain.exponentialRampToValueAtTime(0.0001, now + 5.8);
      chordGain.connect(masterGain);

      for (const f of freqs) {
        const osc = c.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now);
        osc.connect(chordGain);
        osc.start(now);
        osc.stop(now + 6.0);
      }
    }

    playNextChord();
    const chordTimer = setInterval(playNextChord, 5200);
    activeNodes.push({ stop: () => clearInterval(chordTimer) });
  }

  function playPreset(preset) {
    const c = ensureContext();
    clearActiveNodes();
    currentPreset = preset;

    if (c) {
      if (preset === 'rain') startRain(c);
      else if (preset === 'waves') startWaves(c);
      else if (preset === 'campfire') startCampfire(c);
      else if (preset === 'lofi') startLoFi(c);
    }

    isPlaying = preset !== 'off';
    try {
      storage?.setItem('sot-ambience-preset', preset);
    } catch (e) {}
    notify();
  }

  function stop() {
    clearActiveNodes();
    isPlaying = false;
    currentPreset = 'off';
    try {
      storage?.setItem('sot-ambience-preset', 'off');
    } catch (e) {}
    notify();
  }

  function setVolume(val) {
    volume = Math.max(0, Math.min(1, val));
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    }
    try {
      storage?.setItem('sot-ambience-volume', String(volume));
    } catch (e) {}
    notify();
  }

  return {
    get isPlaying() { return isPlaying; },
    get currentPreset() { return currentPreset; },
    get volume() { return volume; },
    playPreset,
    stop,
    setVolume,
    subscribe(fn) {
      listeners.add(fn);
      try { fn({ isPlaying, currentPreset, volume }); } catch {}
      return () => listeners.delete(fn);
    }
  };
}
