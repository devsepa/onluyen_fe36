# Completion slingshot

Manual **Kết thúc** and **Nộp bài** save the current session before opening the game. The game is lazy-loaded in a native dialog; its styles live inside a shadow root and do not change the study UI. The app's theme and persisted sound setting are reused. Answers and scoring stay in the existing quiz engine.

When the first otherwise-successful shot approaches the rim, the bin dodges once to a side with enough room. That shot cannot complete the session. The bin stays at its new position; the next aiming guide is recalculated. `completionDodgeUsed` is saved on the session, so closing and reopening does not repeat the prank. A genuine miss still lets the user try again. Keyboard arrows and Space, the Shoot button, mouse and touch are supported.

Only a successful game resolves the manual completion gate. Closing it keeps the current answers and drafts. Exam deadlines bypass the gate, abort any active game and use the existing submission path. Session identity and a pending guard prevent stale wins, double clicks and double history entries. If the game genuinely fails to load, an explicit confirmation offers direct submission; it does not silently submit.

The service worker caches the game module without executing it, making later/offline use possible. Standalone preview navigation cannot replace the offline app home. Animation pauses in hidden tabs and all observers, handlers and audio resources are disposed on close. Reduced motion disables the decorative confetti.

`dist/slingshot-preview.html` remains the standalone source/demo. Run `node scripts/build-slingshot-game.mjs` after editing it to regenerate `dist/slingshot-game.mjs`. Production changes to the game wrapper belong in that generator. Validation: Node tests cover completion races, persistence and offline caching; `scripts/browser-completion-game-qa.mjs` uses a separate Chrome profile on port 9233 for end-to-end study/exam, theme, viewport, dodge, cancellation and deadline checks.
