// Serverless chat endpoint for the Velcorix site assistant.
//
// The Gemini key lives only in the GEMINI_API_KEY environment variable on
// Vercel. It must never reach the browser, which is the whole reason this
// function exists instead of the widget calling Google directly.

// flash-lite rather than flash: on the free tier `gemini-flash-latest` caps at
// 5 requests per minute for the whole project, which a handful of simultaneous
// visitors would exhaust. flash-lite has a much higher ceiling and answers this
// kind of scoped FAQ question just as well.
const MODEL = "gemini-flash-lite-latest";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Requests from anywhere else are rejected. Preview deploys are allowed so the
// widget can be tested before a change reaches production.
const ALLOWED_ORIGINS = [
  "https://www.velcorix.com",
  "https://velcorix.com",
  "http://localhost:3000",
];
const ALLOWED_ORIGIN_PATTERN = /^https:\/\/velcorix-website[\w-]*\.vercel\.app$/;

// Rate limiting. These counters live in the memory of a single serverless
// instance, so Vercel running several instances at once multiplies the real
// ceiling, and a cold start resets it. That makes this a brake on casual abuse,
// not a guarantee. See the note in the PR about Upstash if we need a hard cap.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 12;
const MAX_PER_INSTANCE = 200;

const ipHits = new Map();
let instanceHits = [];

// Input ceilings, kept tight because every accepted token costs quota.
const MAX_TURNS = 12;
const MAX_CHARS_PER_MESSAGE = 1000;
const MAX_CHARS_TOTAL = 6000;
const MAX_OUTPUT_TOKENS = 400;

const SYSTEM_PROMPT = `You are the assistant on the website of Velcorix, a mechanical trading and consultancy firm based in the UAE.

Velcorix works in four areas:
- Services: bolt torquing and tensioning, flange management and machining, hot tapping, pneumatic and hydro testing, pre-commissioning, crane installation, offshore and petrochemical work, project management, and specialised manpower supply.
- Rentals: cranes, compressors, generators, welding machines, earth-moving equipment, binder pullers, tube and shell equipment, hydrotesting units, and 5kW/10kW solar units.
- Shutdown management.
- Consultancy and EPC advisory.

How to answer:
- Be brief. Two or three sentences is usually right. This is a chat window, not a brochure.
- Only discuss Velcorix and its work. If asked about anything else, say that you can only help with Velcorix enquiries and offer the contact page.
- Never invent prices, availability, equipment specifications, certifications, delivery times, or project references. If you do not know, say so and point the visitor to the contact page.
- For quotes, technical specifications, or anything commercial, direct the visitor to the contact page or WhatsApp. Those enquiries need a person.
- Never state a phone number or email address yourself. Say "the contact page" and let the page links handle it.
- Write plainly. No markdown formatting, no bullet points, no headings.`;

function prune(timestamps, now) {
  const cutoff = now - WINDOW_MS;
  let i = 0;
  while (i < timestamps.length && timestamps[i] <= cutoff) i++;
  return i === 0 ? timestamps : timestamps.slice(i);
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

// Returns null when the caller is within limits, or a retry delay in seconds.
function rateLimit(ip, now) {
  instanceHits = prune(instanceHits, now);
  if (instanceHits.length >= MAX_PER_INSTANCE) return 300;

  const hits = prune(ipHits.get(ip) || [], now);
  if (hits.length >= MAX_PER_IP) {
    ipHits.set(ip, hits);
    return Math.ceil((hits[0] + WINDOW_MS - now) / 1000);
  }

  hits.push(now);
  ipHits.set(ip, hits);
  instanceHits.push(now);

  // Stop the map growing without bound on a long-lived instance.
  if (ipHits.size > 5000) {
    for (const [key, value] of ipHits) {
      if (prune(value, now).length === 0) ipHits.delete(key);
    }
  }
  return null;
}

function originAllowed(origin) {
  // Same-origin requests from some clients omit the header entirely. Those are
  // still rate limited, so allow them rather than break the widget.
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGIN_PATTERN.test(origin);
}

// Accepts the widget's transcript and returns Gemini `contents`, or throws.
function buildContents(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }
  if (messages.length > MAX_TURNS) {
    throw new Error("conversation too long");
  }

  let total = 0;
  const contents = messages.map((message) => {
    const role = message && message.role === "model" ? "model" : "user";
    const text = typeof message?.text === "string" ? message.text.trim() : "";
    if (!text) throw new Error("every message needs text");
    if (text.length > MAX_CHARS_PER_MESSAGE) throw new Error("message too long");
    total += text.length;
    return { role, parts: [{ text }] };
  });

  if (total > MAX_CHARS_TOTAL) throw new Error("conversation too long");
  if (contents[contents.length - 1].role !== "user") {
    throw new Error("last message must be from the visitor");
  }
  return contents;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!originAllowed(req.headers.origin)) {
    return res.status(403).json({ error: "Forbidden." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Configuration problem, not the visitor's fault — log it, stay vague.
    console.error("GEMINI_API_KEY is not set");
    return res.status(503).json({ error: "The assistant is unavailable right now." });
  }

  const retryAfter = rateLimit(clientIp(req), Date.now());
  if (retryAfter !== null) {
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "That's a lot of questions in a short time. Please try again shortly, or use the contact page.",
    });
  }

  let contents;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    contents = buildContents(body?.messages);
  } catch (err) {
    return res.status(400).json({ error: "Sorry, I couldn't read that message." });
  }

  try {
    const upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!upstream.ok) {
      // The upstream body can echo the key back in some error shapes, so it is
      // logged but never returned to the browser.
      console.error("Gemini error", upstream.status, await upstream.text());
      return res.status(502).json({ error: "The assistant is having trouble. Please try the contact page." });
    }

    const data = await upstream.json();
    const reply = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      // Usually a safety block or an empty candidate.
      return res.status(200).json({
        reply: "Sorry, I can't help with that one. The contact page is the best route for this.",
      });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("chat handler failed", err);
    return res.status(502).json({ error: "The assistant is having trouble. Please try the contact page." });
  }
};
