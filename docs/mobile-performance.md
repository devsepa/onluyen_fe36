# Mobile runtime load

The ambient canvas previously requested frames continuously, and the aurora overrides forced motion even in economy/reduced-motion modes. YouTube also initialized and attempted playback automatically on load, first interaction and opening the sound menu.

- Touch/small screens now use a static gradient without canvas frames or blurred moving auroras, even if a legacy economy preference is off. Reduced motion, economy and active quizzes also stop background frames. Desktop decorative drawing is capped at 24 fps.
- Mobile decorative logo/audio indicators and backdrop blur are disabled. Core controls and feedback keep their colors and layout.
- Mobile/economy YouTube initialization requires an explicit play/load action. Opening the sound menu does not initialize it. Audio selected by the user remains available.
- The player progress tracker stops while paused/hidden, updates at 1 Hz during playback and skips UI writes when its controls are hidden. The homepage clock does not update its hidden card while studying.

Validation: 257 unit tests and static checks passed. Isolated Chrome QA checked 1440px desktop, 390px and 320px phones, original dark appearance with legacy light storage, answer grading, explicit media initialization and canvas inactivity during quizzes. In one 5-second mobile-emulation idle sample, the ambient canvas performed zero draws and the page did not request YouTube until Play was pressed. This verifies less background work, not physical phone temperature or battery savings; no real-device temperature measurement was performed. Ignored measurements/screenshots are in `outputs/thermal/`.
