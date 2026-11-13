# Study explanation and update improvements

The study screen prepares the current question plus at most two upcoming unanswered questions. Requests share a single queue, reuse an answer/content/source fingerprint cache across reloads, drop obsolete queued work, stop on quota/authentication errors, and retry only when explicitly requested or after reconnecting Google. The learner can disable preparation before starting or from the question map. Exam mode never prepares or reveals explanations before submission. Speaker-note and manual explanations take precedence.

The explanation-purpose AI schema includes the exact original choice text and a specific reason for each option. Feedback shows the correct answer and text, why it satisfies the question, the learner's actual choice and why it fails, and missing choices for incomplete multi-answer submissions. The original answer key is never replaced. Conflicting AI answers remain visible errors. Generated content remains labeled as AI and unverified.

Answer selection, multi-answer confirmation, grading, flags and asynchronous explanation responses update only the affected controls, map states, progress and feedback. Existing image elements and the question card are retained. Feedback is immediately visible; long text scrolls inside its region while answer/navigation controls stay in the viewport. Interacting with feedback stops automatic navigation.

AI errors expose a bounded Retry action. The existing account avatar is moved into the study header so an expired/disconnected session can reconnect without finishing the study session. Switching accounts during an active session remains restricted. The avatar returns to its original location on leaving the quiz.

Each deployment stamps the commit SHA into HTML metadata, the public release manifest, asset URLs and the relative JavaScript module graph. Visible-tab checks use no-store requests every five minutes and on returning to the tab. New releases expose Update in the page and quiz header. Updating preserves the active saved session and asks before reloading it; imports, publishing and bulk AI jobs must finish first. Update checks failing offline do not interrupt study.

Validation:

- 122 Node tests: structured schema validation, refusal of conflicting/partial responses, prefetch windows, shared in-flight work, single concurrency, persistence, cancellation and immediate re-request, quota/error retry bounds, cache eviction and storage denial, deployment version stamping and stale-cache bypass, plus the existing suite.
- Browser QA (`node scripts/browser-study-speed-qa.mjs`) used an isolated profile, synthetic slides, mocked Google sessions and delayed/error/structured AI responses. Verified stable image/card/control element identities on selection, grading and retry; preparation limited to three questions; cache reuse after reload; opt-out; no hidden answer/selection sent to AI; expired login/reconnect without losing answers; conflict handling; multi-answer confirmation; and version update preserving the active session.
- Study/exam × light/dark × 1440×900, 390×844, 320×568 and 844×390: 16 combinations before/after grading, no horizontal/page overflow, answer and navigation controls inside the viewport. Screenshots are in ignored `outputs/study-speed/`.
- JavaScript syntax and static asset checks passed. Live deployment and Gemini verification are checked through the GitHub workflows; browser QA itself does not call a real Google account or billable model.

AI can still be slow on the first uncached question and may return an uncertain or conflicting result. Preparation lowers the wait rather than guaranteeing instantaneous completion. The bounded browser cache can evict older explanations; existing note explanations and saved question banks are retained.
