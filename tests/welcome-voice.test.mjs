import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWelcomeGreeting,
  pickVietnameseVoice,
  setupWelcomeVoice,
} from '../dist/welcome-voice.mjs';

test('getWelcomeGreeting formats time-aware messages for morning, noon, afternoon, and night', () => {
  const morningDate = () => new Date('2026-11-16T08:30:00');
  const noonDate = () => new Date('2026-11-16T12:15:00');
  const afternoonDate = () => new Date('2026-11-16T15:45:00');
  const nightDate = () => new Date('2026-11-16T20:00:00');

  assert.match(getWelcomeGreeting({ now: morningDate }), /Chào buổi sáng/);
  assert.match(getWelcomeGreeting({ now: noonDate }), /Chào buổi trưa/);
  assert.match(getWelcomeGreeting({ now: afternoonDate }), /Chào buổi chiều/);
  assert.match(getWelcomeGreeting({ now: nightDate }), /Chào buổi tối/);
});

test('getWelcomeGreeting addresses user with their intimate name when logged in', () => {
  const morningDate = () => new Date('2026-11-16T08:30:00');
  const greeting = getWelcomeGreeting({ now: morningDate, userName: 'Nguyễn Văn Duy' });
  assert.match(greeting, /Chào buổi sáng Duy!/);

  const guestGreeting = getWelcomeGreeting({ now: morningDate, userName: 'Khách' });
  assert.match(guestGreeting, /Chào buổi sáng! Chào mừng bạn đến với Slide Ôn Thi/);
});

test('pickVietnameseVoice selects exact vi-VN or vi-prefix voice', () => {
  const mockVoices = [
    { name: 'Alex', lang: 'en-US' },
    { name: 'Microsoft An Online (Natural) - Vietnamese (Vietnam)', lang: 'vi-VN' },
    { name: 'Linh', lang: 'vi' },
  ];
  const viVn = pickVietnameseVoice(mockVoices);
  assert.equal(viVn?.name, 'Microsoft An Online (Natural) - Vietnamese (Vietnam)');

  const fallbackVoices = [
    { name: 'Google UK English Female', lang: 'en-GB' },
    { name: 'Google tiếng Việt', lang: 'vi' },
  ];
  const vi = pickVietnameseVoice(fallbackVoices);
  assert.equal(vi?.name, 'Google tiếng Việt');

  const noVi = pickVietnameseVoice([{ name: 'David', lang: 'en-US' }]);
  assert.equal(noVi, null);
  assert.equal(pickVietnameseVoice([]), null);
});

test('setupWelcomeVoice speaks once on interaction and respects session cache', () => {
  const spoken = [];
  const mockSpeech = {
    speaking: false,
    cancel() {},
    getVoices: () => [{ name: 'An', lang: 'vi-VN' }],
    speak(utterance) {
      spoken.push(utterance.text);
    },
  };

  const store = new Map();
  const mockSessionStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
  };

  const listeners = new Map();
  const mockWindow = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };

  const welcome = setupWelcomeVoice({
    speech: mockSpeech,
    sessionStorage: mockSessionStorage,
    getUserName: () => 'Duy',
    isSoundEnabled: () => true,
    isVoiceEnabled: () => true,
    windowTarget: mockWindow,
  });

  assert.equal(spoken.length, 0);
  assert.ok(listeners.has('pointerdown'));

  // First interaction triggers speech
  listeners.get('pointerdown')();
  assert.equal(spoken.length, 1);
  assert.match(spoken[0], /Duy/);
  assert.equal(mockSessionStorage.getItem('sot-welcome-spoken'), 'true');

  // Second call without force should be skipped
  assert.equal(welcome.speak({ force: false }), false);
  assert.equal(spoken.length, 1);

  // Force call plays regardless of session state
  assert.equal(welcome.speak({ force: true }), true);
  assert.equal(spoken.length, 2);
});

test('setupWelcomeVoice respects voice disabled setting', () => {
  const spoken = [];
  const mockSpeech = {
    speaking: false,
    getVoices: () => [],
    speak(utterance) { spoken.push(utterance.text); },
  };

  const store = new Map();
  const mockSessionStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
  };

  const welcome = setupWelcomeVoice({
    speech: mockSpeech,
    sessionStorage: mockSessionStorage,
    isSoundEnabled: () => true,
    isVoiceEnabled: () => false,
  });

  assert.equal(welcome.speak({ force: false }), false);
  assert.equal(spoken.length, 0);

  // Forcing speak still works for preview / test
  assert.equal(welcome.speak({ force: true }), true);
  assert.equal(spoken.length, 1);
});
