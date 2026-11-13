# Study explanations and navigation

- 103 Node tests passed, including wraparound navigation and refusing conflicting AI answers.
- Static reference and JavaScript syntax checks passed.
- Isolated Chrome profile with synthetic questions: 1440×900, 390×844, 320×568 and 844×390, in light and dark themes. Answer controls and feedback remained within the viewport.
- Verified automatic navigation from question 2 to question 5 after an incorrect answer when questions 1, 3 and 4 were already answered. Verified correct multi-answer submission advances only after explicit checking.
- Verified explanations appear immediately, the full explanation opens in a paginated dialog, and exam mode hides feedback and the automatic-navigation control.
- Screenshots are in ignored `outputs/study-flow/`. Browser checks: `node scripts/browser-study-flow-qa.mjs` with the existing isolated Chrome debugger on port 9223 and local server on port 8080.
- Confirmed the repository has a public AI backend variable. No authenticated, billable Gemini request was made during QA; live model response and account quota were not verified.

Missing explanations use the existing authenticated `/v1/answers` service. Generated text is cached separately from answer provenance. A model result with a different answer is displayed as a conflict message; it never changes the original answer. Requests run once per question per page session, with a bounded timeout. Study auto-navigation waits five seconds after feedback is ready, wraps to unanswered questions, and stops on manual navigation or opening the full explanation. Completing every question does not submit the session automatically.
