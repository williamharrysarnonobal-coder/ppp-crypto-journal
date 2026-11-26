// ARBAB laptop side — shared helpers for beat.cjs, wait-msg.cjs and reply.cjs.
// Talks to Supabase with the service_role key read from the gitignored
// bot_secrets.py next to the bots (never printed, never committed).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OWNER_ID = 'de907681-6970-4f87-bd46-9c30eb807b0b';   // William — ARBAB answers only this account
const UPLOADS = path.join(__dirname, 'uploads');           // gitignored; images you attach land here

function secrets() {
  const src = fs.readFileSync(path.join(ROOT, 'bot_secrets.py'), 'utf8');
  const get = (k) => { const m = new RegExp('^\\s*' + k + '\\s*=\\s*["\']([^"\']+)["\']', 'm').exec(src); return m && m[1]; };
  const url = get('SUPABASE_URL'), key = get('SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing in bot_secrets.py');
  return { url: url.replace(/\/$/, ''), key };
}
const S = secrets();
const H = { apikey: S.key, Authorization: 'Bearer ' + S.key, 'Content-Type': 'application/json' };

async function rest(pathAndQuery, init = {}) {
  const r = await fetch(S.url + '/rest/v1/' + pathAndQuery, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
// Upsert this account's status row (beat / listen / seen).
async function setState(fields) {
  await rest('arbab_state?on_conflict=user_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ user_id: OWNER_ID, ...fields }])
  });
}
async function getState() {
  const rows = await rest(`arbab_state?user_id=eq.${OWNER_ID}&select=seen_id`);
  return rows && rows[0] ? rows[0] : { seen_id: 0 };
}
// Download an attached image from the private bucket so Claude can look at it.
async function downloadImage(storagePath) {
  const r = await fetch(`${S.url}/storage/v1/object/profile-images/${storagePath.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: S.key, Authorization: 'Bearer ' + S.key } });
  if (!r.ok) throw new Error('image ' + r.status);
  fs.mkdirSync(UPLOADS, { recursive: true });
  const file = path.join(UPLOADS, path.basename(storagePath));
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { OWNER_ID, rest, setState, getState, downloadImage, sleep };
