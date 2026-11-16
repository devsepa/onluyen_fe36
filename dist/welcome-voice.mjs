export function getWelcomeGreeting({ now = () => new Date(), userName = '' } = {}) {
  const hour = now().getHours();
  let timeGreeting = 'Chào bạn';
  if (hour >= 5 && hour < 11) {
    timeGreeting = 'Chào buổi sáng';
  } else if (hour >= 11 && hour < 14) {
    timeGreeting = 'Chào buổi trưa';
  } else if (hour >= 14 && hour < 18) {
    timeGreeting = 'Chào buổi chiều';
  } else {
    timeGreeting = 'Chào buổi tối';
  }

  const trimmed = typeof userName === 'string' ? userName.trim() : '';
  const cleanName = trimmed && trimmed !== 'Khách'
    ? trimmed.split(/\s+/).pop()
    : '';

  if (cleanName) {
    return `${timeGreeting} ${cleanName}! Chúc bạn có một buổi ôn thi thật hiệu quả và đạt điểm cao nhé.`;
  }
  return `${timeGreeting}! Chào mừng bạn đến với Slide Ôn Thi. Chúc bạn ôn tập thật tốt và đạt kết quả cao nhé.`;
}

export function getShortGreeting({ now = () => new Date(), userName = '' } = {}) {
  const hour = now().getHours();
  let timeGreeting = 'Chào bạn';
  if (hour >= 5 && hour < 11) {
    timeGreeting = 'Chào buổi sáng';
  } else if (hour >= 11 && hour < 14) {
    timeGreeting = 'Chào buổi trưa';
  } else if (hour >= 14 && hour < 18) {
    timeGreeting = 'Chào buổi chiều';
  } else {
    timeGreeting = 'Chào buổi tối';
  }

  const trimmed = typeof userName === 'string' ? userName.trim() : '';
  const cleanName = trimmed && trimmed !== 'Khách'
    ? trimmed.split(/\s+/).pop()
    : '';

  return cleanName ? `${timeGreeting} ${cleanName}!` : `${timeGreeting}!`;
}

export function pickVietnameseVoice(voices) {
  if (!Array.isArray(voices) || !voices.length) return null;
  return (
    voices.find(v => v.lang === 'vi-VN' || v.lang === 'vi_VN') ||
    voices.find(v => v.lang && v.lang.toLowerCase().startsWith('vi')) ||
    null
  );
}

export function setupWelcomeVoice({
  speech = globalThis.speechSynthesis,
  sessionStorage = globalThis.sessionStorage,
  localStorage = globalThis.localStorage,
  getGreeting = getWelcomeGreeting,
  getUserName = () => '',
  isSoundEnabled = () => true,
  isVoiceEnabled = () => true,
  onStateChange = null,
  windowTarget = globalThis.window,
} = {}) {
  if (!speech) return { speak: () => false };

  let cachedVoices = [];
  try {
    if (typeof speech.getVoices === 'function') {
      cachedVoices = speech.getVoices() || [];
      const onVoicesChanged = () => {
        try { cachedVoices = speech.getVoices() || []; } catch {}
      };
      if (typeof speech.addEventListener === 'function') {
        speech.addEventListener('voiceschanged', onVoicesChanged);
      } else if ('onvoiceschanged' in speech) {
        speech.onvoiceschanged = onVoicesChanged;
      }
    }
  } catch {}

  function speak({ force = false } = {}) {
    if (!force) {
      if (!isSoundEnabled() || !isVoiceEnabled()) return false;
      try {
        if (sessionStorage?.getItem('sot-welcome-spoken')) return false;
      } catch {}
    }

    try {
      if (speech.speaking && typeof speech.cancel === 'function') {
        speech.cancel();
      }
      const text = getGreeting({ userName: getUserName() });
      const UtteranceClass = globalThis.SpeechSynthesisUtterance || function(t) { this.text = t; };
      const utterance = new UtteranceClass(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.95;
      utterance.pitch = 1.05;

      const allVoices = (typeof speech.getVoices === 'function' ? speech.getVoices() : []) || cachedVoices;
      const viVoice = pickVietnameseVoice(allVoices);
      if (viVoice) {
        utterance.voice = viVoice;
      }

      if (typeof speech.speak === 'function') {
        speech.speak(utterance);
      }
      try {
        sessionStorage?.setItem('sot-welcome-spoken', 'true');
      } catch {}
      return true;
    } catch {
      return false;
    }
  }

  function onFirstInteraction() {
    if (windowTarget?.removeEventListener) {
      windowTarget.removeEventListener('pointerdown', onFirstInteraction);
      windowTarget.removeEventListener('keydown', onFirstInteraction);
    }
    speak();
  }

  try {
    const alreadySpoken = sessionStorage?.getItem('sot-welcome-spoken');
    if (!alreadySpoken && windowTarget?.addEventListener) {
      windowTarget.addEventListener('pointerdown', onFirstInteraction, { once: true, passive: true });
      windowTarget.addEventListener('keydown', onFirstInteraction, { once: true, passive: true });
    }
  } catch {}

  return {
    speak,
    getGreetingText: () => getGreeting({ userName: getUserName() }),
  };
}
