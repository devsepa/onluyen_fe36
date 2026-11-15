import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudyAmbience } from '../dist/study-ambience.mjs';

test('createStudyAmbience initializes safely without DOM or AudioContext', () => {
  const ambience = createStudyAmbience();
  assert.equal(typeof ambience.playPreset, 'function');
  assert.equal(typeof ambience.stop, 'function');
  assert.equal(typeof ambience.setVolume, 'function');
  assert.equal(typeof ambience.subscribe, 'function');
  assert.equal(ambience.isPlaying, false);
  assert.equal(ambience.currentPreset, 'off');
  assert.equal(typeof ambience.volume, 'number');
});

test('createStudyAmbience respects mock storage and preserves presets', () => {
  const map = new Map([
    ['sot-ambience-volume', '0.7'],
    ['sot-ambience-preset', 'rain']
  ]);
  const mockStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v))
  };

  const ambience = createStudyAmbience({ storage: mockStorage });
  assert.equal(ambience.volume, 0.7);
  assert.equal(ambience.currentPreset, 'rain');

  ambience.setVolume(0.9);
  assert.equal(ambience.volume, 0.9);
  assert.equal(mockStorage.getItem('sot-ambience-volume'), '0.9');

  ambience.playPreset('waves');
  assert.equal(ambience.currentPreset, 'waves');
  assert.equal(ambience.isPlaying, true);
  assert.equal(mockStorage.getItem('sot-ambience-preset'), 'waves');

  ambience.stop();
  assert.equal(ambience.isPlaying, false);
  assert.equal(ambience.currentPreset, 'off');
  assert.equal(mockStorage.getItem('sot-ambience-preset'), 'off');
});

test('createStudyAmbience clamps volume between 0 and 1', () => {
  const ambience = createStudyAmbience();
  ambience.setVolume(-0.5);
  assert.equal(ambience.volume, 0);

  ambience.setVolume(1.8);
  assert.equal(ambience.volume, 1);
});

test('createStudyAmbience notifies subscribers on state changes', () => {
  const ambience = createStudyAmbience();
  const history = [];
  const unsubscribe = ambience.subscribe((state) => {
    history.push({ ...state });
  });

  ambience.setVolume(0.6);
  ambience.playPreset('campfire');
  ambience.stop();
  unsubscribe();
  ambience.playPreset('lofi');

  assert.ok(history.length >= 4);
  assert.equal(history[history.length - 2].currentPreset, 'campfire');
  assert.equal(history[history.length - 1].currentPreset, 'off');
});

test('createStudyAmbience synthesizes sound nodes when AudioContext is provided', () => {
  let createdNodes = 0;
  const mockContext = {
    currentTime: 10,
    sampleRate: 44100,
    state: 'running',
    resume: async () => {},
    createGain: () => ({
      gain: {
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {}
      },
      connect: () => {},
      disconnect: () => {}
    }),
    createBuffer: () => ({
      getChannelData: () => new Float32Array(100)
    }),
    createBufferSource: () => {
      createdNodes++;
      return {
        buffer: null,
        loop: false,
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {}
      };
    },
    createBiquadFilter: () => ({
      type: 'lowpass',
      frequency: {
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {}
      },
      Q: { setValueAtTime: () => {} },
      connect: () => {},
      disconnect: () => {}
    }),
    createOscillator: () => {
      createdNodes++;
      return {
        type: 'sine',
        frequency: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {}
        },
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {}
      };
    },
    destination: {}
  };

  const ambience = createStudyAmbience({ getContext: () => mockContext });
  ambience.playPreset('rain');
  assert.ok(createdNodes > 0);

  ambience.playPreset('waves');
  ambience.playPreset('campfire');
  ambience.playPreset('lofi');
  ambience.stop();
  assert.equal(ambience.isPlaying, false);
});
