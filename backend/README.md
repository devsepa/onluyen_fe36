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
- `GEMINI_MODEL`: defaults to `gemini-3.8-flash`; change to a model supported by your project if necessary. Real availability must be checked with your key.
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
## Automatic completion update

Source/manual answers remain preferred. Frontend automatic jobs check notes first and send only still-missing questions, with a visible opt-out and stop control. AI proposals can be practiced immediately but retain `verified=false` and an explicit AI-suggestion label; acceptance is optional. A failed automatic bank signature is not endlessly retried on every reload in the same tab.

`scripts/select-gemini-model.mjs` selects an available stable Flash-Lite backup as `GEMINI_FALLBACK_MODEL` during CI. `generateWithFallback` tries it at most once after primary 503/timeout/404 or a response-configuration error; quota and credential errors are not retried. Model provenance reflects the model actually used. One reserved batch can result in two provider calls; application question quotas therefore do not equal a dollar spending cap. The live CI smoke test verifies the same fallback path as the deployed Worker.


## Original slide image input
Notes are checked first. Missing answers use one original PNG/JPEG/WebP image per Worker request (about 2 MB maximum). Gemini receives image bytes and question labels, never Google access tokens or private slide URLs. Images are not persisted in the quota store or local question bank. Multiple correct labels (AD/ACE) are supported and AI proposals never overwrite source or manual answers. Existing authentication, quotas, stop/resume and AI provenance tags still apply.


## Shared decks
The SHARED_DECKS SQLite Durable Object binding (migration v2) stores explicitly published slide images, ordered labels, answers and explanations. The catalog and published images are readable without Google login from allowed web origins. Creation, upload, publication and removal require Google authentication; only the owner can modify/remove a deck. Drafts are private and expire after 24 hours. Published decks are immutable; publish a new deck to update content. Limits: 3 creations/account/day, 500 questions/deck, 800 KB/image, 100 MB/deck. Image bytes are chunked below Durable Object per-value limits. Google tokens, profile details and study history are never included in public metadata. Existing AI quota storage and Secrets remain separate. Storage now contains intentionally shared content and consumes the account Durable Object storage allowance.


## Slide classification
Image answers now include kind (question/other/uncertain) and the visible ordered labels. Native structured questions and clear note-backed image questions are accepted without an AI round trip. Unclear image slides are inspected only when AI is enabled; advertisements, introductions, resource links and unclassified images are excluded from new imports. The original image remains the displayed question; no OCR transcription replaces it. Existing unanswered bank images confirmed as non-questions by AI are removed while answered/edited questions are protected.


## Handling 400 and 429 errors
AI uses only required structured-output parameters, and prefers the image-tested Flash-Lite model. Upstream 400 errors are categorized without exposing Google response bodies, keys or question content. Invalid image bytes are rejected before generation; one unreadable image does not block subsequent questions. See https://aistudio.google.com/docs/troubleshooting for model parameter compatibility.
Google getThumbnail calls share a paced queue (1.2 s minimum spacing), a short-lived account-scoped URL cache and quota cooldown with bounded retries. Published-deck uploads keep a private draft and local id/fingerprint after interruption; the authenticated owner can query uploaded indices at GET /v1/decks/:id/draft and resume only missing images for up to the existing 24-hour expiry. No Google token is stored in the draft checkpoint. Existing pre-fix uploads were deleted on failure and cannot be restored. See https://developers.google.com/workspace/slides/api/limits.
