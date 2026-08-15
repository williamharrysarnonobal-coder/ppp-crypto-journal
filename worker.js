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
