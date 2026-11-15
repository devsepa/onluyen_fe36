// YouTube Study Music Engine for Slide Ôn Thi
export const DEFAULT_YOUTUBE_VIDEO_ID = 'g9Xy8AfK-1w';

export function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  // If it's already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts[0] === 'embed' || pathParts[0] === 'shorts' || pathParts[0] === 'v') {
        const id = pathParts[1];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    } else if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').split('?')[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch (e) {
    // Regex fallback
    const match = trimmed.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*)/);
    if (match && match[1] && match[1].length === 11) {
      return match[1];
    }
  }
  return null;
}

export function createYouTubeStudyAudio({
  storage = (typeof localStorage !== 'undefined' ? localStorage : null),
  defaultVideoId = DEFAULT_YOUTUBE_VIDEO_ID
} = {}) {
  let videoId = defaultVideoId;
  let volume = 50; // 0 to 100
  let isPlaying = false;
  let playerInstance = null;
  const listeners = new Set();

  try {
    const savedId = storage?.getItem('sot-yt-video-id');
    if (savedId && /^[a-zA-Z0-9_-]{11}$/.test(savedId)) {
      videoId = savedId;
    }
    const savedVol = storage?.getItem('sot-yt-volume');
    if (savedVol !== null && !isNaN(Number(savedVol))) {
      volume = Math.max(0, Math.min(100, Number(savedVol)));
    }
  } catch (e) {}

  function notify() {
    for (const fn of listeners) {
      try {
        fn({
          videoId,
          volume,
          isPlaying,
          isDefault: videoId === defaultVideoId
        });
      } catch (e) {}
    }
  }

  function setVideoId(idOrUrl) {
    const id = extractYouTubeId(idOrUrl);
    if (!id) return false;
    videoId = id;
    try {
      storage?.setItem('sot-yt-video-id', id);
    } catch (e) {}
    if (playerInstance) {
      try {
        if (typeof playerInstance.loadVideoById === 'function') {
          playerInstance.loadVideoById({ videoId: id });
        }
      } catch (e) {}
    }
    notify();
    return true;
  }

  function resetToDefault() {
    return setVideoId(defaultVideoId);
  }

  function setVolume(val) {
    volume = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
    try {
      storage?.setItem('sot-yt-volume', String(volume));
    } catch (e) {}
    if (playerInstance && typeof playerInstance.setVolume === 'function') {
      try {
        playerInstance.setVolume(volume);
      } catch (e) {}
    }
    notify();
  }

  function togglePlay() {
    if (!playerInstance) return;
    try {
      if (isPlaying) {
        playerInstance.pauseVideo();
      } else {
        playerInstance.playVideo();
      }
    } catch (e) {}
  }

  function play() {
    if (playerInstance && typeof playerInstance.playVideo === 'function') {
      try { playerInstance.playVideo(); } catch (e) {}
    }
  }

  function pause() {
    if (playerInstance && typeof playerInstance.pauseVideo === 'function') {
      try { playerInstance.pauseVideo(); } catch (e) {}
    }
  }

  function setPlayer(p) {
    playerInstance = p;
    if (playerInstance && typeof playerInstance.setVolume === 'function') {
      try { playerInstance.setVolume(volume); } catch (e) {}
    }
  }

  function handleStateChange(stateCode) {
    // YT.PlayerState: 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
    if (stateCode === 1) {
      isPlaying = true;
    } else if (stateCode === 2 || stateCode === 0) {
      isPlaying = false;
    }
    notify();
  }

  return {
    get videoId() { return videoId; },
    get volume() { return volume; },
    get isPlaying() { return isPlaying; },
    get isDefault() { return videoId === defaultVideoId; },
    setVideoId,
    resetToDefault,
    setVolume,
    togglePlay,
    play,
    pause,
    setPlayer,
    handleStateChange,
    subscribe(fn) {
      listeners.add(fn);
      try {
        fn({
          videoId,
          volume,
          isPlaying,
          isDefault: videoId === defaultVideoId
        });
      } catch (e) {}
      return () => listeners.delete(fn);
    }
  };
}
