# Project preferences

- For every UI change, compare and verify the PC and mobile layouts before finishing. Do not validate only one viewport.
- Maintain both light and dark themes. Check readable text, form controls, selected/correct/incorrect states, dialogs, navigation and empty states in both themes.
- Use a desktop viewport around 1440 px and mobile viewport around 390 px; also check narrow mobile widths for horizontal overflow. Keep primary actions usable by touch.
- Preserve Google OAuth configuration, source restrictions, local question banks and study/exam behavior when changing presentation.
- Keep tabs focused on their own tasks: sources for source selection/import, library for question review/editing, practice for study/exams, history/results for submitted work. Do not repeat promotional headers, global statistic cards or unrelated actions across tabs. Scope asynchronous import messages to the sources tab and do not navigate users away from another task when import finishes.
- Treat the website as a visitor-facing study app, including when the owner is testing it. Do not expose developer/admin setup, Google Cloud/API instructions, Client ID inputs or diagnostics that require technical configuration in visitor navigation. Keep shared OAuth configuration in `dist/site-config.mjs`; visitors only connect their Google account and grant access. Preserve useful plain-language import errors and progress.
- The avatar is the sole entry for Google login, account switching and logout. Do not duplicate account controls inside Documents; show a sign-in reminder there for guests and reveal source selection/import after connection.
- Record browser verification and any limits honestly. Use an isolated QA browser profile and synthetic data; never clear or overwrite the user's browser storage for tests.
