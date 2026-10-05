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
    if (url.pathname === '/api/economic-events') return handleEconomicEvents(request);
    // Everything else is the site itself.
    return serveAsset(request, env);
  }
};

/* ANG HTML AY HINDI DAPAT MA-CACHE. ANG IBA, OO.

   Ang bawat <script> at <link> sa mga pahina ay may `?v=NNN`, at iyon ang
   nagsasabi sa browser na may bagong bersyon. Pero ang bilang na iyon ay
   NAKASULAT SA LOOB ng dashboard.html — kaya kung ang HTML mismo ang naka-cache,
   hihingin pa rin nito ang lumang `?v=` at hindi mababago ang pahina kahit
   ilang beses pang mag-deploy.

   Iyon mismo ang nangyari: naka-push at naka-deploy na ang bagong code, pero
   ang browser ay nagsasalita pa rin sa lumang HTML. Walang error, walang
   babala — mukhang hindi lang gumagana ang mga pagbabago.

   `no-cache` ay HINDI "huwag itabi": itinatabi pa rin ito, tinatanong lang muna
   kung nagbago bago gamitin. Isang mabilis na 304 kapag pareho, ang bagong
   pahina kapag hindi. Ang JS at CSS ay nananatiling naka-cache nang matagal —
   sila ang may `?v=`, at iyon ang tamang paraan para sa kanila. */
async function serveAsset(request, env) {
  const res = await env.ASSETS.fetch(request);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return res;

  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-cache, must-revalidate');
  return out;
}

/* ANG CALENDAR NA HINDI UMAASA SA BOT.

   Ang economic_events ay pinupunan ng isang bot sa Google Apps Script tuwing
   anim na oras. Kapag tumigil ang trigger nito — at tahimik itong tumitigil,
   walang babala sa app — walang balita para sa buong buwan, gaya ng nangyari
   noong Oktubre.

   Kaya kinukuha rin ito ng Worker nang direkta mula sa parehong pinagkukunan.
   Ang browser ay hindi makakakuha nito mismo: hinihingi ng TradingView ang
   Origin header nila, na hindi maitatakda ng isang pahina. Pampublikong datos
   ito at walang susi, kaya walang secret dito. Naka-cache nang 30 minuto para
   hindi tamaan ang TradingView sa bawat pagbukas. Medium at High lamang, gaya
   ng bot, para iisa ang laman ng dalawa. */
const CALENDAR_URL = 'https://economic-calendar.tradingview.com/events';
const CALENDAR_COUNTRIES = 'US,EU,GB,JP,CN,AU,CA,NZ,CH';
const CALENDAR_IMPACT = { '0': 'Medium', '1': 'High' };

async function handleEconomicEvents(request) {
  if (request.method !== 'GET') return json({ error: 'GET only.' }, 405);

  const cache = caches.default;
  const now = new Date();
  // Isang susi kada oras: sapat na sariwa, at iisa ang cache ng lahat.
  const cacheKey = new Request(`https://cache.local/econ/${now.toISOString().slice(0, 13)}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Mula sa simula ng buwang ito hanggang 35 araw pasulong, para may laman ang
  // buong kasalukuyang buwan sa calendar, hindi lang mula ngayon.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(now.getTime() + 35 * 86400000);
  const upstream = `${CALENDAR_URL}?from=${encodeURIComponent(from.toISOString())}`
    + `&to=${encodeURIComponent(to.toISOString())}&countries=${CALENDAR_COUNTRIES}`;

  let data;
  try {
    const res = await fetch(upstream, {
      headers: { Origin: 'https://www.tradingview.com', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return json({ error: `Calendar source returned ${res.status}.` }, 502);
    data = await res.json();
  } catch {
    return json({ error: 'Could not reach the calendar source.' }, 502);
  }

  const seen = new Set();
  const events = [];
  for (const e of (data && data.result) || []) {
    const impact = CALENDAR_IMPACT[String(e.importance)];
    const title = (e.title || '').trim();
    if (!impact || !title || !e.date) continue;
    const key = `${title}|${e.country || ''}|${e.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      title, country: e.country || null, event_date: e.date, impact,
      forecast: e.forecast ?? null, previous: e.previous ?? null,
      actual: e.actual ?? null, comment: e.comment || null, comment_tl: null
    });
  }

  const out = new Response(JSON.stringify({ events, fetched_at: now.toISOString() }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' }
  });
  await cache.put(cacheKey, out.clone());
  return out;
}

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
