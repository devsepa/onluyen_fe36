import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeId,
  createYouTubeStudyAudio,
  DEFAULT_YOUTUBE_VIDEO_ID
} from '../dist/study-youtube.mjs';

test('extractYouTubeId parses standard and short YouTube links correctly', () => {
  assert.equal(
    extractYouTubeId('https://www.youtube.com/watch?v=g9Xy8AfK-1w&list=RDg9Xy8AfK-1w&start_radio=1&t=2466s'),
    'g9Xy8AfK-1w'
  );
  assert.equal(
    extractYouTubeId('https://youtu.be/g9Xy8AfK-1w?t=100'),
    'g9Xy8AfK-1w'
  );
  assert.equal(
    extractYouTubeId('https://www.youtube.com/embed/g9Xy8AfK-1w'),
    'g9Xy8AfK-1w'
  );
  assert.equal(
    extractYouTubeId('https://www.youtube.com/shorts/g9Xy8AfK-1w'),
    'g9Xy8AfK-1w'
  );
  assert.equal(
    extractYouTubeId('g9Xy8AfK-1w'),
    'g9Xy8AfK-1w'
  );
  assert.equal(extractYouTubeId('invalid-link'), null);
  assert.equal(extractYouTubeId(''), null);
  assert.equal(extractYouTubeId(null), null);
});

test('createYouTubeStudyAudio manages default video and storage', () => {
  const map = new Map();
  const mockStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v))
  };

  const yt = createYouTubeStudyAudio({ storage: mockStorage });
  assert.equal(yt.videoId, DEFAULT_YOUTUBE_VIDEO_ID);
  assert.equal(yt.volume, 50);
  assert.equal(yt.isPlaying, false);
  assert.equal(yt.isDefault, true);

  // Set new valid video ID
  const success = yt.setVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(success, true);
  assert.equal(yt.videoId, 'dQw4w9WgXcQ');
  assert.equal(yt.isDefault, false);
  assert.equal(mockStorage.getItem('sot-yt-video-id'), 'dQw4w9WgXcQ');

  // Reset to default
  yt.resetToDefault();
  assert.equal(yt.videoId, DEFAULT_YOUTUBE_VIDEO_ID);
  assert.equal(yt.isDefault, true);
  assert.equal(mockStorage.getItem('sot-yt-video-id'), DEFAULT_YOUTUBE_VIDEO_ID);
});

test('createYouTubeStudyAudio controls volume and notifications', () => {
  const yt = createYouTubeStudyAudio();
  const notifications = [];
  const unsubscribe = yt.subscribe((state) => {
    notifications.push({ ...state });
  });

  yt.setVolume(80);
  assert.equal(yt.volume, 80);

  yt.setVolume(150);
  assert.equal(yt.volume, 100);

  yt.setVolume(-10);
  assert.equal(yt.volume, 0);

  unsubscribe();
  yt.setVolume(60);
  assert.equal(notifications[notifications.length - 1].volume, 0);
});

test('createYouTubeStudyAudio binds to player instance and handles state changes', () => {
  const yt = createYouTubeStudyAudio();
  let volumeSet = null;
  let played = false;
  let paused = false;

  const mockPlayer = {
    setVolume: (v) => { volumeSet = v; },
    playVideo: () => { played = true; },
    pauseVideo: () => { paused = true; }
  };

  yt.setPlayer(mockPlayer);
  assert.equal(volumeSet, 50);

  yt.handleStateChange(1); // PLAYING
  assert.equal(yt.isPlaying, true);

  yt.togglePlay();
  assert.equal(paused, true);

  yt.handleStateChange(2); // PAUSED
  assert.equal(yt.isPlaying, false);

  yt.togglePlay();
  assert.equal(played, true);
});
