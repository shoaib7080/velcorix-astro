# Site assistant API

`chat.js` is a Vercel serverless function that proxies the site's chat widget to
the Gemini API. The widget lives in `public/assets/js/chatbot.js` and is loaded
by every page.

## Why a function and not a direct call

Anything the browser can read, a visitor can read. Calling Gemini straight from
the widget would publish the API key to every visitor, and the first person to
open devtools could spend the quota. The key stays server-side.

## Setup

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In the Vercel project: **Settings → Environment Variables → Add**
   - Name: `GEMINI_API_KEY`
   - Value: the key
   - Environments: Production, Preview, Development
3. Redeploy. Environment variables are only picked up on a new deployment.

Never commit the key. `.env` is gitignored; `.env.example` shows the shape.

## Abuse controls

The endpoint is public, so it is capped in three ways:

- **Origin check** — requests from origins other than velcorix.com or a
  `velcorix-website*.vercel.app` preview are rejected.
- **Rate limit** — 12 requests per IP per 10 minutes, plus a 200-request ceiling
  per instance.
- **Size limits** — 12 turns per conversation, 1,000 characters per message,
  6,000 total, and a 400-token cap on replies.

### Google's own quota

The model is `gemini-flash-lite-latest`. This matters: on the free tier
`gemini-flash-latest` allows only **5 requests per minute across the entire
project**, which was confirmed by hitting it during testing. A few visitors
chatting at once would exhaust that. flash-lite has a much higher ceiling and
answered the site's questions just as well in side-by-side testing.

Free-tier quota is per project, not per visitor, so our own rate limiting cannot
prevent a 429 from Google — the widget surfaces a polite message and points at
the contact page when that happens.

### Known limit

The rate limiter counts in the memory of a single serverless instance. Vercel
runs several instances under load and recycles them on cold starts, so the real
ceiling is higher than 12 per IP and resets unpredictably. It stops casual abuse
and accidental loops; it is not a hard guarantee.

If the quota starts getting burned, move the counters to a shared store —
Upstash Redis has a free tier and an official Vercel integration, and the change
is contained to `rateLimit()`.

## Local development

```
npm i -g vercel
vercel dev
```

with `GEMINI_API_KEY` in `.env.local`. Plain `python -m http.server` will serve
the static pages but not `/api/chat`, so the widget will error.
