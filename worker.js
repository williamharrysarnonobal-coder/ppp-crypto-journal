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
    if (url.pathname === '/api/volume') return handleVolume(request, url);
    const up = url.pathname.match(/^\/api\/upscale\/(check|link|unlink|quote|order|cancel|status|move_be)$/);
    if (up) return handleUpscale(request, env, up[1]);
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

/* VOLUME KADA ORAS para sa Market Hours. Ang Gold ay COMEX gold futures (GC=F)
   mula sa Yahoo — walang CORS ang Yahoo kaya dito dumadaan. Ang BTC ay kinukuha
   ng browser mismo sa Binance. Huling ~30 araw, 1 oras bawat bar; naka-cache
   nang isang oras para iisang kuha lang ng lahat. */
async function handleVolume(request, url) {
  if (request.method !== 'GET') return json({ error: 'GET only.' }, 405);
  const symbol = url.searchParams.get('symbol');
  if (symbol !== 'gold') return json({ error: 'Unknown symbol.' }, 400);
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.local/volume/gold/${new Date().toISOString().slice(0, 13)}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  let data;
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1h&range=1mo', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return json({ error: `Volume source returned ${res.status}.` }, 502);
    data = await res.json();
  } catch {
    return json({ error: 'Could not reach the volume source.' }, 502);
  }
  const r = data && data.chart && data.chart.result && data.chart.result[0];
  const ts = (r && r.timestamp) || [];
  const vol = (r && r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].volume) || [];
  const bars = [];
  ts.forEach((t, i) => { const v = vol[i]; if (Number.isFinite(v) && v > 0) bars.push([t * 1000, v]); });
  const out = json({ symbol: 'gold', source: 'COMEX gold futures (GC=F)', bars });
  out.headers.set('Cache-Control', 'public, max-age=3600');
  await cache.put(cacheKey, out.clone());
  return out;
}

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

/* ANG ORDER SA UPSCALE.

   Bawat account sa journal ay may sariling Upscale API key. Ang key ay
   hinding-hindi itinatago nang hubad: ine-encrypt ito rito (AES-GCM) gamit ang
   UPSCALE_ENC_KEY, isang Cloudflare secret, bago isulat sa trading_accounts —
   at hindi na ito ibinabalik sa browser kailanman. Ang browser ay nagpapadala
   lang ng "aling account" at ng mga presyo; ang Worker ang bumabasa ng key,
   at sa pamamagitan lang ng login ng user (RLS), kaya ang account ng iba ay
   hindi maaabot.

   Set once in Cloudflare → Workers → ppp-crypto-journal → Settings →
   Variables and Secrets:   UPSCALE_ENC_KEY  (32 random bytes, base64)

   Lahat ng numero sa Upscale API ay "fp9": integer string na ×10⁹. */
const SB_URL = 'https://ofohjebtyppsxgjuqxme.supabase.co';
// The public anon key — the same one js/supabase.js ships to every browser.
// RLS is the real boundary; every call below carries the user's own token.
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mb2hqZWJ0eXBwc3hnanVxeG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTEyODUsImV4cCI6MjA5ODM4NzI4NX0.koW1I7dFrBToH9azx3TPZwyFrY1HIr2XAgFS72DRI34';
const UPSCALE_API = 'https://api.upscale.trade';

class UpscaleError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const toFp9 = (n) => {
  const s = Number(n).toFixed(9);
  const neg = s.startsWith('-');
  const [w, f] = (neg ? s.slice(1) : s).split('.');
  const v = BigInt(w) * 1000000000n + BigInt(f);
  return (neg ? -v : v).toString();
};
const fromFp9 = (raw) => (raw == null || raw === '') ? null : Number(BigInt(String(raw))) / 1e9;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function encKey(env) {
  const raw = unb64(env.UPSCALE_ENC_KEY);
  if (raw.length !== 32) throw new UpscaleError(500, 'bad_enc_key', 'UPSCALE_ENC_KEY must be 32 bytes, base64.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encKey(env), new TextEncoder().encode(text));
  return `v1:${b64(iv)}:${b64(ct)}`;
}
async function decrypt(env, stored) {
  const [v, iv, ct] = String(stored || '').split(':');
  if (v !== 'v1' || !iv || !ct) throw new UpscaleError(400, 'no_key', 'This account has no Upscale API key.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await encKey(env), unb64(ct));
  return new TextDecoder().decode(pt);
}

async function sbUser(token) {
  const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  return u && u.id ? u : null;
}
async function sbAccount(token, id) {
  const res = await fetch(`${SB_URL}/rest/v1/trading_accounts?id=eq.${encodeURIComponent(id)}`
    + '&select=id,account_name,upscale_api_key_enc,upscale_account_id', {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const t = await res.text();
    if (t.includes('upscale_')) throw new UpscaleError(500, 'no_columns', 'Run supabase_trading_accounts_upscale_api.sql in Supabase first.');
    throw new UpscaleError(502, 'db', 'Could not read the account.');
  }
  const rows = await res.json();
  if (!rows.length) throw new UpscaleError(404, 'not_found', 'Account not found.');
  return rows[0];
}
async function sbPatchAccount(token, id, patch) {
  const res = await fetch(`${SB_URL}/rest/v1/trading_accounts?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    const t = await res.text();
    if (t.includes('upscale_')) throw new UpscaleError(500, 'no_columns', 'Run supabase_trading_accounts_upscale_api.sql in Supabase first.');
    throw new UpscaleError(502, 'db', 'Could not save the account.');
  }
}

// Plain-language versions of Upscale's error codes — the part he will read.
const UPSCALE_MESSAGES = {
  session_expired: 'The Upscale API key was rejected — it may be expired or deleted. Add a new one in Edit account.',
  api_trading_not_enabled: 'API trading is not switched on for this Upscale account.',
  account_access_denied: 'This API key cannot trade that Upscale account.',
  insufficient_balance: 'Not enough available balance on Upscale for this order.',
  market_paused: 'This market is paused on Upscale right now.',
  market_close_only: 'This market is close-only on Upscale right now.',
  market_price_stale: 'Upscale had no fresh price for this market — try again in a moment.',
  api_key_rate_limit_exceeded: 'Upscale rate limit reached — wait a few seconds and try again.',
  idempotency_key_in_flight: 'This order is already being sent.',
  account_not_found: 'Upscale could not find that account.',
  market_not_found: 'Upscale has no such market.',
};

async function upscale(key, method, path, body, idem) {
  const res = await fetch(`${UPSCALE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(idem ? { 'x-idempotency-key': idem } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const code = payload && payload.error;
    const detail = payload && payload.message;
    throw new UpscaleError(res.status, code || 'upscale',
      UPSCALE_MESSAGES[code] || `Upscale said: ${Array.isArray(detail) ? detail.join('; ') : (detail || res.status)}`);
  }
  return payload;
}

const PHASE_LABEL = {
  active_evaluation: 'Evaluation', active_verification: 'Verification',
  funded: 'Funded', funded_success: 'Funded'
};
function summarizeAccount(a) {
  const size = fromFp9(a.initialAccountBalance);
  const bal = fromFp9(a.riskStatus && a.riskStatus.currentBalance) ?? fromFp9(a.accountBalance);
  const r = a.riskStatus || {};
  return {
    accountId: a.accountId,
    phase: PHASE_LABEL[a.currentPhase] || a.currentPhase || '',
    status: a.status, apiTrading: !!a.apiTrading,
    size, balance: bal,
    label: `${size != null ? '$' + size.toLocaleString('en-US') : '?'} · ${PHASE_LABEL[a.currentPhase] || a.currentPhase || ''}`,
    consistency: r.consistencyRuleApplies ? {
      met: !!r.consistencyRuleMet,
      ratio: fromFp9(r.consistencyRuleRatio),
      limit: fromFp9(r.consistencyRuleLimit),
      bestDay: fromFp9(r.maxPeriodDailyEquityDelta)
    } : null
  };
}

// "BTC", "btc/usd", "BTCUSDT", "BTC-PERP" -> "BTC"
function baseAssetOf(symbol) {
  const s = String(symbol || '').toUpperCase().trim();
  if (!s) return '';
  const head = s.split(/[\/\-_: ]/)[0];
  return head.replace(/(USDT|USDC|USD|PERP)$/, '') || head;
}

async function findMarket(key, accountId, symbol) {
  const asset = baseAssetOf(symbol);
  if (!asset) throw new UpscaleError(400, 'no_symbol', 'Put the Symbol in the calculator first (e.g. BTC).');
  const markets = await upscale(key, 'GET', `/v2/markets?accountId=${encodeURIComponent(accountId)}`);
  const m = (markets || []).find(x => x.config && String(x.config.baseAsset).toUpperCase() === asset);
  if (!m) throw new UpscaleError(404, 'market_not_found', `Upscale has no ${asset} market for this account.`);
  return {
    id: m.id, asset, ticker: m.config.ticker || `${asset}/USD`,
    price: fromFp9(m.state && m.state.indexPrice),
    paused: !!(m.settings && m.settings.isPaused) || !!(m.schedule && m.schedule.inPause),
    closeOnly: !!(m.settings && m.settings.isCloseOnly)
  };
}

const STOP_TYPES = new Set(['stop', 'stop_market', 'trailing_stop']);
// The executed order's own records: `parentOrderId` on the TP/SL it spawned.
const isChildOf = (o, id) => [].concat(o.parentOrderId || []).includes(id);
// Fill price of an executed entry order: indexPrice is the execution price,
// triggerPrice the requested level (crypto fills at the trigger).
const entryOf = (o) => fromFp9(o.indexPrice) || fromFp9(o.triggerPrice);
// When an order was filled, as ISO. Upscale's field name is not pinned down in
// its docs, so the likely ones are tried in order; seconds or ms both work.
// Null when none is there — the app then uses the time it saw the change.
const tsOf = (o) => {
  const v = o && (o.executedAt ?? o.filledAt ?? o.updatedAt ?? o.updateTime ?? o.createdAt);
  if (v == null || v === '') return null;
  const n = Number(v);
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(v);
  return isNaN(d) ? null : d.toISOString();
};
// Two prices the same level, within 0.02% (a tick or the spread).
const sameLevel = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / b < 0.0002;

// Long: an entry below the market waits for price to come down (limit);
// above it waits for price to break up (stop). Short is the mirror.
function pickOrderType(direction, entry, price) {
  if (!(price > 0)) return null;
  const better = direction === 'long' ? entry < price : entry > price;
  return better ? 'limit' : 'stop_market';
}

async function handleUpscale(request, env, action) {
  if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
  try {
    if (!env.UPSCALE_ENC_KEY) throw new UpscaleError(500, 'not_configured',
      'Upscale trading is not set up on the server yet — add the UPSCALE_ENC_KEY secret in Cloudflare.');
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || !(await sbUser(token))) throw new UpscaleError(401, 'auth', 'Your session expired — sign in again.');
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new UpscaleError(400, 'bad_request', 'Bad request.');
    const accId = String(body.tradingAccountId ?? '');
    if (!/^[\w-]{1,64}$/.test(accId)) throw new UpscaleError(400, 'bad_request', 'Which account?');

    // Make sure the journal account is the caller's before touching anything.
    const row = await sbAccount(token, accId);

    if (action === 'check' || action === 'link') {
      const apiKey = String(body.apiKey || '').trim();
      if (!/^usk_[\w-]{8,256}$/.test(apiKey)) throw new UpscaleError(400, 'bad_key', 'That does not look like an Upscale API key (it starts with usk_).');
      const accounts = (await upscale(apiKey, 'GET', '/accounts/with-risk-status') || []).map(summarizeAccount);
      if (action === 'check') return json({ accounts });

      const pick = accounts.find(a => a.accountId === body.upscaleAccountId);
      if (!pick) throw new UpscaleError(400, 'bad_account', 'That Upscale account is not under this key.');
      if (!pick.apiTrading) throw new UpscaleError(400, 'api_trading_not_enabled', UPSCALE_MESSAGES.api_trading_not_enabled);
      await sbPatchAccount(token, accId, {
        upscale_api_key_enc: await encrypt(env, apiKey),
        upscale_account_id: pick.accountId,
        upscale_account_label: pick.label
      });
      return json({ ok: true, label: pick.label, accountId: pick.accountId });
    }

    if (action === 'unlink') {
      await sbPatchAccount(token, accId, { upscale_api_key_enc: null, upscale_account_id: null, upscale_account_label: null });
      return json({ ok: true });
    }

    // quote / order need a linked account.
    if (!row.upscale_api_key_enc || !row.upscale_account_id)
      throw new UpscaleError(400, 'not_linked', `${row.account_name} has no Upscale API key yet.`);
    const key = await decrypt(env, row.upscale_api_key_enc);
    const upId = row.upscale_account_id;

    /* ANG KALAGAYAN NG MGA ORDER NA NILAGAY NATIN.

       Order Placed  → nasa active orders pa (naghihintay ng presyo)
       In Position   → na-execute na, at may bukas pang TP/SL na anak nito
       Closed        → na-execute, at wala nang bukas na anak; ang TP o SL na
                       na-execute ang nagsasabi kung alin ang tumama
       Cancelled     → kinansela (ng tao, ng posisyon, o ng error)
       Unknown       → hindi makita sa huling 100 — iniiwan ng app ang dati. */
    if (action === 'status') {
      const ids = (Array.isArray(body.orderIds) ? body.orderIds : [])
        .map(String).filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20);
      if (!ids.length) return json({ states: {} });
      const asset = baseAssetOf(body.symbol) || 'BTC';
      const asArr = x => Array.isArray(x) ? x : ((x && (x.data || x.items)) || []);
      const active = asArr(await upscale(key, 'GET', `/orders/${encodeURIComponent(upId)}/active`));
      const history = asArr(await upscale(key, 'GET',
        `/orders/${encodeURIComponent(upId)}/${encodeURIComponent(asset)}/history?limit=100`));
      const states = {};
      for (const id of ids) {
        if (active.some(o => o.id === id)) { states[id] = { state: 'Order Placed' }; continue; }
        const h = history.find(o => o.id === id);
        if (!h) { states[id] = { state: 'Unknown' }; continue; }
        if (String(h.status).startsWith('canceled')) { states[id] = { state: 'Cancelled' }; continue; }
        if (h.status === 'active') { states[id] = { state: 'Order Placed' }; continue; }
        if (h.status !== 'executed') { states[id] = { state: 'Unknown' }; continue; }
        const entry = entryOf(h);
        const liveStop = active.find(o => isChildOf(o, id) && STOP_TYPES.has(o.type));
        if (active.some(o => isChildOf(o, id))) {
          states[id] = { state: 'In Position', entry,
            stop: liveStop ? fromFp9(liveStop.triggerPrice) : null,
            atBE: !!(liveStop && sameLevel(fromFp9(liveStop.triggerPrice), entry)) };
          continue;
        }
        const closer = history.find(o => isChildOf(o, id) && o.status === 'executed');
        const pnl = closer ? fromFp9(closer.realizedPnl) : null;
        let how = null;
        if (closer) {
          if (closer.type === 'take') how = 'TP Hit';
          else if (STOP_TYPES.has(closer.type)) {
            // Ang stop na may kita at wala sa entry ay isang trailing stop na
            // nag-lock ng kita: "Stop Profit", gaya ng sa Easy Add.
            how = sameLevel(fromFp9(closer.triggerPrice), entry) ? 'BE Hit'
              : (pnl != null && pnl > 0) ? 'Stop Profit' : 'SL Hit';
          }
        }
        // Para sa auto-journal: ang exit at ang oras ng fill at ng pagsara.
        states[id] = { state: 'Closed', how, pnl, entry,
          exit: closer ? entryOf(closer) : null,
          openedAt: tsOf(h), closedAt: closer ? tsOf(closer) : null };
      }
      return json({ states });
    }

    /* MOVE SL TO BE. Ang SL na nakakabit sa posisyon ay isang "stop" order na
       anak ng entry order; inililipat ito sa presyong pinasukan. Hindi ito
       ginagawa kung lampas na ang presyo sa entry sa maling panig — ang stop
       sa entry ay tatamaan agad at isasara ang posisyon. */
    if (action === 'move_be') {
      const id = String(body.orderId || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UpscaleError(400, 'bad_order', 'Which order?');
      const asset = baseAssetOf(body.symbol) || 'BTC';
      const asArr = x => Array.isArray(x) ? x : ((x && (x.data || x.items)) || []);
      const active = asArr(await upscale(key, 'GET', `/orders/${encodeURIComponent(upId)}/active`));
      const stop = active.find(o => isChildOf(o, id) && STOP_TYPES.has(o.type));
      if (!stop) throw new UpscaleError(409, 'no_stop', 'No open stop loss found for this order — it may not be filled yet, or it is already closed.');
      const history = asArr(await upscale(key, 'GET',
        `/orders/${encodeURIComponent(upId)}/${encodeURIComponent(asset)}/history?limit=100`));
      const h = history.find(o => o.id === id);
      const entry = h ? entryOf(h) : null;
      if (!(entry > 0)) throw new UpscaleError(409, 'no_entry', 'Could not read the fill price from Upscale.');
      if (sameLevel(fromFp9(stop.triggerPrice), entry)) return json({ ok: true, stop: entry, already: true });
      const market = await findMarket(key, upId, asset);
      const dir = h.direction || stop.direction;
      const ahead = dir === 'long' ? market.price > entry : market.price < entry;
      if (!ahead) throw new UpscaleError(409, 'not_in_profit',
        `Price (${market.price}) is not past your entry (${entry}) yet — a stop at breakeven would close the trade straight away.`);
      const res = await upscale(key, 'PATCH', `/orders/${encodeURIComponent(stop.id)}`, { triggerPrice: toFp9(entry) });
      return json({ ok: true, stop: entry, stopOrderId: res && res.id });
    }

    if (action === 'cancel') {
      const orderId = String(body.orderId || '');
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new UpscaleError(400, 'bad_order', 'Which order?');
      // Make sure the order belongs to this account before cancelling it.
      const active = await upscale(key, 'GET', `/orders/${encodeURIComponent(upId)}/active`) || [];
      const list = Array.isArray(active) ? active : (active.items || active.data || []);
      if (!list.some(o => o && o.id === orderId)) {
        throw new UpscaleError(409, 'not_active',
          'That order is no longer waiting on Upscale — it has filled or was already cancelled. Check the terminal; if it filled, close the position there.');
      }
      await upscale(key, 'DELETE', `/orders/${encodeURIComponent(orderId)}`);
      return json({ ok: true });
    }

    const market = await findMarket(key, upId, body.symbol);

    if (action === 'quote') {
      const all = (await upscale(key, 'GET', '/accounts/with-risk-status') || []).map(summarizeAccount);
      const acct = all.find(a => a.accountId === upId) || null;
      return json({ market, account: acct });
    }

    // ---- order ----
    const entry = Number(body.entry), sl = Number(body.sl), tp = body.tp == null || body.tp === '' ? null : Number(body.tp);
    const qty = Number(body.quantity), lev = Math.round(Number(body.leverage));
    if (!(entry > 0) || !(sl > 0) || entry === sl) throw new UpscaleError(400, 'bad_prices', 'Entry and SL are needed, and must differ.');
    if (!(qty > 0)) throw new UpscaleError(400, 'bad_qty', 'Quantity must be above zero.');
    if (!(lev >= 1 && lev <= 200)) throw new UpscaleError(400, 'bad_lev', 'Leverage is missing.');
    const direction = entry > sl ? 'long' : 'short';
    if (tp != null && (!(tp > 0) || (direction === 'long' ? tp <= entry : tp >= entry)))
      throw new UpscaleError(400, 'bad_tp', 'TP is on the wrong side of Entry.');
    if (market.paused) throw new UpscaleError(403, 'market_paused', UPSCALE_MESSAGES.market_paused);
    if (market.closeOnly) throw new UpscaleError(403, 'market_close_only', UPSCALE_MESSAGES.market_close_only);
    const type = pickOrderType(direction, entry, market.price);
    if (!type) throw new UpscaleError(409, 'market_price_stale', UPSCALE_MESSAGES.market_price_stale);

    // Sized by quantity (sizeMode base), so the loss at SL is exactly the
    // risk amount. `amount` is the RESERVE taken from the free balance, and per
    // Upscale's docs it must cover "margin, fee, spread and buffer" — not the
    // margin alone. Sending the bare margin got a stop_market cancelled with
    // "reserved amount was insufficient for execution due to an increase in
    // slippage": it fills past the trigger and needs a little more than that.
    // So: margin with room for price to slip, plus fees and spread on the
    // notional, kept inside the account's free balance.
    const notional = qty * entry;
    const margin = notional / lev;
    const SLIP = type === 'limit' ? 0.005 : 0.02;   // a stop fills past its trigger; a limit does not
    const FEES = 0.003;                              // fee + spread, both legs, on the notional
    let reserve = margin * (1 + SLIP) + notional * FEES;
    try {
      const all = (await upscale(key, 'GET', '/accounts/with-risk-status') || []).map(summarizeAccount);
      const acct = all.find(a => a.accountId === upId);
      const free = acct && Number(acct.balance);
      if (free > 0 && reserve > free * 0.99) {
        // Not enough room for the full buffer: reserve what there is, as long
        // as it still covers the margin and the fees.
        if (free * 0.99 < margin + notional * FEES) throw new UpscaleError(400, 'insufficient_balance', UPSCALE_MESSAGES.insufficient_balance);
        reserve = free * 0.99;
      }
    } catch (e) { if (e instanceof UpscaleError) throw e; /* balance unknown: keep the buffer */ }
    const order = {
      accountId: upId, marketId: market.id, type, direction,
      sizeMode: 'base', baseSize: toFp9(qty),
      amount: toFp9(reserve), leverage: toFp9(lev),
      triggerPrice: toFp9(entry), stopTriggerPrice: toFp9(sl)
    };
    if (tp != null) order.takeTriggerPrice = toFp9(tp);
    const idem = /^[\w-]{8,80}$/.test(String(body.idempotencyKey || '')) ? body.idempotencyKey : crypto.randomUUID();
    const res = await upscale(key, 'POST', '/orders', order, idem);
    if (res && res.status === 'canceled_by_error') {
      throw new UpscaleError(400, 'canceled_by_error',
        `Upscale cancelled the order: ${(res.errorCode || []).join(', ') || res.reason || 'unknown reason'}.`);
    }
    return json({ ok: true, orderId: res && res.id, status: res && res.status, type, direction,
      price: market.price, ticker: market.ticker });
  } catch (e) {
    if (e instanceof UpscaleError) return json({ error: e.message, code: e.code }, e.status >= 400 && e.status < 600 ? e.status : 500);
    console.error('upscale handler failed', e && e.message);
    return json({ error: 'Something went wrong talking to Upscale.' }, 502);
  }
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
