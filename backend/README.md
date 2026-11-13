# Gemini backend

The frontend remains on GitHub Pages. This Cloudflare Worker calls Gemini with a private secret. It accepts only authenticated Google users from the configured origin and enforces persisted quotas before billable requests. Never add keys to frontend code or commit them.

## Deploy using GitHub (no CLI required)

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up and complete email verification. Enable your Workers subdomain in Workers & Pages.
2. Create a Cloudflare API token using the **Edit Cloudflare Workers** template for your account. Copy your Account ID from the dashboard.
3. Create a Gemini API key at https://aistudio.google.com/api-keys. Use a project with an appropriate quota/billing cap.
4. Open https://github.com/devsepa/onluyen_fe36/settings/secrets/actions and add repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GEMINI_API_KEY`. Do not put them in Variables, source files or chat.
5. Run **Deploy AI backend → Run workflow** at https://github.com/devsepa/onluyen_fe36/actions/workflows/ai-backend.yml. This deploys `backend/worker.mjs` and injects the Gemini key as a Worker secret.
6. Copy the deployed URL, such as `https://onluyen-fe36-ai.<your-subdomain>.workers.dev`. Add repository **Variable** (not Secret) `AI_API_BASE` with that public URL at https://github.com/devsepa/onluyen_fe36/settings/variables/actions . Run **Publish GitHub Pages** again. Its build step injects only that public URL into `dist/site-config.mjs`; the Gemini key stays on the Worker. Alternatively configure the URL in the source file and push.

Until the URL is configured, AI controls explain that the feature is being prepared and do not make requests. Existing slide imports, notes, practice and history continue working.

## Owner settings

- `GEMINI_API_KEY`: secret; never returned to clients, sent as an HTTP header to Gemini.
- `GEMINI_MODEL`: defaults to `gemini-2.5-flash`; change to a model supported by your project if necessary. Real availability must be checked with your key.
- `ALLOWED_ORIGINS`: exact comma-separated frontend origins. Production: `https://devsepa.github.io`. Local testing may add `http://localhost:8080` temporarily.
- `USER_DAILY_QUESTIONS`: default 150 per Google subject per UTC day.
- `GLOBAL_DAILY_QUESTIONS`: default 1000 across all users per UTC day.
- At most 5 questions per call, 12 calls per user per minute. Failed Gemini attempts still consume the reserved quota, limiting billable retries. These are application ceilings, not a dollar budget or provider billing cap.
- Durable Object stores quota counts and SHA-256 user identifiers only, clears older days by alarm. No question bank or Google tokens are stored server-side. Answers remain local to each browser and exported banks; this is not a shared question repository.
- CORS is not authentication. Backend checks the Google access token with Google's userinfo endpoint, then reserves account/global quota. The access token is never forwarded to Gemini. Do not open the endpoint for anonymous callers.

## Local development

Use Wrangler 4 (`npx wrangler dev` from `backend/`) with an ignored `.dev.vars` containing `GEMINI_API_KEY`. Set `ALLOWED_ORIGINS` for the local frontend and a valid Google session. No real key is needed for unit/browser mocked tests.

## Behavior

Only questions without answers are sent to Gemini after a disclosure/consent dialog. Original notes or manually chosen answers are not replaced. The response must include exactly the requested question IDs and valid option labels. Multiple-choice/malformed/uncertain questions remain unanswered. Answers are saved after each batch with `answerSource=gemini`, `verified=false`; a visitor can accept proposals in one explicit action. Stop/reload preserves prior saved batches; continuing processes remaining unanswered questions. Question edits during a request invalidate its result. Exam mode never reveals explanations before submission.

No live Gemini request or production Worker deployment can be verified without the owner's Cloudflare account and key. Tests mock those APIs; they do not assert model correctness. AI can make mistakes.

Official references: https://ai.google.dev/gemini-api/docs/structured-output and https://developers.cloudflare.com/workers/configuration/secrets/ .
