// Cloudflare Worker: serves the static site, plus one endpoint that turns a
// recording into text.
//
// The Groq API key lives here as a secret and never reaches the browser. A key
// shipped inside the page would be readable by anyone who opened devtools and
// usable by anyone who found it — the whole reason this endpoint exists rather
// than calling Groq from dashboard.js directly.
//
// Set it once with:   wrangler secret put GROQ_API_KEY

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';
// Comfortably longer than any spoken note, and well under Groq's own limit.
const MAX_BYTES = 20 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/transcribe') return handleTranscribe(request, env);
    // Everything else is the site itself.
    return env.ASSETS.fetch(request);
  }
};

async function handleTranscribe(request, env) {
  // Open /api/transcribe in a browser to see whether this Worker can actually
  // see the key. "I set the secret but it still says not configured" is almost
  // always a name that doesn't match, or a secret added to a different Worker
  // than the one serving the site — and neither is visible from the outside.
  // Binding NAMES only; no value, no length, nothing derived from the key.
  if (request.method === 'GET') {
    return json({
      configured: Boolean(env.GROQ_API_KEY),
      expecting: 'GROQ_API_KEY',
      bindings: Object.keys(env).sort()
    });
  }
  if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
  if (!env.GROQ_API_KEY) {
    return json({ error: 'Transcription is not set up on the server yet.' }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Could not read the recording.' }, 400);
  }

  const audio = form.get('audio');
  if (!audio || typeof audio === 'string') return json({ error: 'No audio was sent.' }, 400);
  if (audio.size === 0) return json({ error: 'The recording was empty.' }, 400);
  if (audio.size > MAX_BYTES) return json({ error: 'That recording is too long.' }, 413);

  // Only the two values the page can send. Anything else is ignored rather
  // than passed through to the upstream API.
  const language = form.get('language') === 'en' ? 'en' : 'tl';

  const upstream = new FormData();
  upstream.append('file', audio, audio.name || 'note.webm');
  upstream.append('model', MODEL);
  upstream.append('language', language);
  upstream.append('response_format', 'json');

  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: upstream
    });
  } catch {
    return json({ error: 'Could not reach the transcription service.' }, 502);
  }

  // Out of quota. Worth naming plainly and with a time, because "failed (429)"
  // reads like a bug when it is simply the free tier doing what it says.
  if (res.status === 429) {
    const header = res.headers.get('retry-after');
    const secs = header ? Math.ceil(Number(header)) : NaN;
    return json({
      error: Number.isFinite(secs) && secs > 0
        ? `Free-tier limit reached — try again in about ${humanWait(secs)}.`
        : 'Free-tier limit reached — try again in a little while.',
      retryAfter: Number.isFinite(secs) ? secs : null
    }, 429);
  }

  if (res.status === 401 || res.status === 403) {
    console.error('groq rejected the API key', res.status);
    return json({ error: 'The transcription key was rejected — check GROQ_API_KEY.' }, 502);
  }

  if (!res.ok) {
    // The upstream body can carry request ids and account detail. Log it,
    // don't hand it to the browser.
    const detail = await res.text().catch(() => '');
    console.error('groq transcription failed', res.status, detail);
    return json({ error: `Transcription failed (${res.status}).` }, 502);
  }

  const data = await res.json().catch(() => null);
  const text = data && typeof data.text === 'string' ? data.text.trim() : '';
  return json({ text });
}

// "about 40 seconds" / "about 6 minutes" / "about 2 hours" — enough to tell a
// per-minute limit apart from a daily one, which is the only decision the
// number actually informs.
function humanWait(seconds) {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const mins = Math.round(seconds / 60);
  if (mins < 90) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.round(seconds / 3600);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // A transcript is one-off and personal; nothing should cache it.
      'Cache-Control': 'no-store'
    }
  });
}
