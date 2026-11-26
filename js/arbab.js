/* ============================ ARBAB (2026-11-26) ============================
   The in-app assistant, built like the MPD IT Console's ANGE. No paid API:
   a message here is a row in arbab_messages; the watcher on the office laptop
   (arbab/wait-msg.cjs, run by the Claude Code session in VS Code) picks it up,
   Claude does the work and answers with arbab/reply.cjs. arbab_state carries
   the honest status: beat_at (session alive), listen_at (watcher waiting,
   i.e. Claude is free), seen_id (last message picked up).
   Admin-only (the owner). Table missing → a note to run supabase_arbab.sql. */
const ARBAB = { last: 0, shown: new Set(), timer: null, slowTimer: null, open: false, st: null, msgs: [],
  voice: true, lang: 'en-US', rec: null, img: null, missing: false, loaded: false };
try{ ARBAB.voice = localStorage.getItem('arbabVoice') !== 'off'; ARBAB.lang = localStorage.getItem('arbabLang') || 'en-US'; }catch(e){}

const _arbabEl = id => document.getElementById(id);
function _arbabHeaders(json){
  const h = { apikey: SUPABASE_KEY, Authorization: `Bearer ${USER_ACCESS_TOKEN}` };
  if(json) h['Content-Type'] = 'application/json';
  return h;
}

(function arbabBuild(){
  const g = _arbabEl('arbabTicks'), ns = 'http://www.w3.org/2000/svg';
  if(g && !g.childNodes.length){
    for(let i = 0; i < 72; i++){
      const a = i * 5 * Math.PI / 180, big = i % 6 === 0, r1 = big ? 86 : 90, r2 = 97;
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', 100 + r1 * Math.cos(a)); l.setAttribute('y1', 100 + r1 * Math.sin(a));
      l.setAttribute('x2', 100 + r2 * Math.cos(a)); l.setAttribute('y2', 100 + r2 * Math.sin(a));
      if(big) l.setAttribute('class', 'big');
      g.appendChild(l);
    }
  }
  const w = _arbabEl('arbabWave');
  if(w && !w.childNodes.length) for(let i = 0; i < 28; i++){ const b = document.createElement('i'); b.style.setProperty('--i', i); w.appendChild(b); }
  const t = _arbabEl('arbabText');
  if(t){
    t.addEventListener('keydown', e => { if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); arbabSend(); } });
    t.addEventListener('input', () => { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; });
    t.addEventListener('paste', e => {
      const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type));
      if(f){ e.preventDefault(); arbabPickImage(f); }
    });
  }
  _arbabToolLabels();
})();
function _arbabToolLabels(){
  const v = _arbabEl('arbabVoice'), l = _arbabEl('arbabLang');
  if(v){ v.textContent = ARBAB.voice ? '🔊 Voice' : '🔇 Voice'; v.classList.toggle('off', !ARBAB.voice); }
  if(l) l.textContent = ARBAB.lang === 'fil-PH' ? 'TL' : 'EN';
}
function arbabToggleVoice(){
  ARBAB.voice = !ARBAB.voice;
  try{ localStorage.setItem('arbabVoice', ARBAB.voice ? 'on' : 'off'); }catch(e){}
  if(!ARBAB.voice && window.speechSynthesis) speechSynthesis.cancel();
  // Turning it on speaks a short line, so you hear right away that it works
  // (and the tap unlocks speech on iPhone).
  if(ARBAB.voice) _arbabSpeak(ARBAB.lang.startsWith('fil') ? 'Naka-on na ang boses.' : 'Voice is on.');
  _arbabToolLabels();
}
function arbabToggleLang(){
  ARBAB.lang = ARBAB.lang === 'fil-PH' ? 'en-US' : 'fil-PH';
  try{ localStorage.setItem('arbabLang', ARBAB.lang); }catch(e){}
  _arbabToolLabels();
}

/* ---------- status ---------- */
function _arbabMode(m){
  const root = _arbabEl('arbab');
  if(root) root.className = 'arbab ' + m;
  const label = { idle: 'ONLINE · STANDING BY', thinking: 'PROCESSING…', working: 'WORKING…', offline: 'OFFLINE', speaking: 'SPEAKING', listening: 'LISTENING…', setup: 'NOT SET UP' }[m] || m.toUpperCase();
  const st = _arbabEl('arbabState'); if(st) st.textContent = label;
}
function _arbabStatus(){
  if(ARBAB.missing){ _arbabMode('setup'); _arbabEl('arbabLink').textContent = 'Run supabase_arbab.sql in the Supabase SQL Editor first.'; return; }
  if(ARBAB.mode === 'speaking' || ARBAB.mode === 'listening') return;
  const s = ARBAB.st || {}, now = Date.now();
  const online = s.beat_at && now - Date.parse(s.beat_at) < 20000;
  const listening = s.listen_at && now - Date.parse(s.listen_at) < 12000;
  let lastUser = 0, lastAnswer = 0;
  ARBAB.msgs.forEach(m => { if(m.role === 'user') lastUser = m.id; else if(!m.progress) lastAnswer = m.id; });
  const waiting = lastUser > lastAnswer;
  _arbabMode(!online ? 'offline' : waiting ? 'thinking' : listening ? 'idle' : 'working');
  const link = _arbabEl('arbabLink');
  if(link) link.textContent = online ? 'LINKED' : 'NOT LINKED · open VS Code and say "start ARBAB"';
}

/* ---------- messages ---------- */
function _arbabAtBottom(){ const l = _arbabEl('arbabLog'); return !l || l.scrollHeight - l.scrollTop - l.clientHeight < 60; }
function _arbabStick(on){ if(on){ const l = _arbabEl('arbabLog'); if(l) l.scrollTop = 1e9; } }
function _arbabType(node, text, fast, stick){
  if(fast){ node.textContent = text; return; }
  node.classList.add('arbab-caret');
  let i = 0; const step = Math.max(1, Math.round(text.length / 220));
  const tick = () => { i = Math.min(text.length, i + step); node.textContent = text.slice(0, i); _arbabStick(stick);
    if(i < text.length) setTimeout(tick, 14); else node.classList.remove('arbab-caret'); };
  tick();
}
async function _arbabImgUrl(path){
  try{ const { data } = await sb.storage.from('profile-images').createSignedUrl(path, 3600); return data && data.signedUrl; }catch(e){ return null; }
}
function _arbabAdd(m, fast){
  if(ARBAB.shown.has(m.id)) return;
  ARBAB.shown.add(m.id);
  const log = _arbabEl('arbabLog'); if(!log) return;
  log.querySelector('.arbab-empty')?.remove();
  const stick = _arbabAtBottom() || m.role === 'user';
  const row = document.createElement('div');
  row.className = 'arbab-msg ' + (m.role === 'user' ? 'me' : 'ai') + (m.progress ? ' progress' : '');
  const who = document.createElement('div'); who.className = 'arbab-who';
  who.textContent = (m.role === 'user' ? 'YOU' : 'ARBAB') + ' · ' + new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const body = document.createElement('div'); body.className = 'arbab-text';
  row.append(who, body);
  if(m.image_path){
    const img = document.createElement('img'); img.className = 'arbab-img'; img.alt = 'Attached image';
    _arbabImgUrl(m.image_path).then(u => { if(u){ img.src = u; img.onclick = () => window.open(u, '_blank'); } });
    row.appendChild(img);
  }
  log.appendChild(row);
  _arbabType(body, m.text || '', fast || m.role === 'user' || m.progress, stick);
  _arbabStick(stick);
  if(!fast && m.role === 'arbab' && !m.progress) _arbabSpeak(m.text || '');
}
async function _arbabFetch(){
  if(typeof USER_ACCESS_TOKEN === 'undefined' || !USER_ACCESS_TOKEN || typeof isAdminUser !== 'function' || !isAdminUser()) return;
  try{
    const [mr, sr] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/arbab_messages?select=*&id=gt.${ARBAB.last}&order=id.asc&limit=300`, { headers: _arbabHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/arbab_state?select=*`, { headers: _arbabHeaders() })
    ]);
    if(mr.status === 404 || sr.status === 404){ ARBAB.missing = true; _arbabStatus(); return; }
    if(!mr.ok) throw new Error(await mr.text());
    ARBAB.missing = false;
    const rows = await mr.json();
    ARBAB.st = sr.ok ? ((await sr.json())[0] || null) : ARBAB.st;
    const first = !ARBAB.loaded;
    rows.forEach(m => { ARBAB.msgs.push(m); ARBAB.last = Math.max(ARBAB.last, m.id); if(ARBAB.open) _arbabAdd(m, first); });
    ARBAB.loaded = true;
    if(ARBAB.open) _arbabMarkRead();
    _arbabBadge();
    _arbabStatus();
  }catch(e){ console.warn('ARBAB', e); }
}
// Unread = ARBAB answers newer than the last one you saw (kept per browser).
function _arbabLastRead(){ try{ return Number(localStorage.getItem('arbabRead')) || 0; }catch(e){ return 0; } }
function _arbabMarkRead(){
  const lastAns = ARBAB.msgs.filter(m => m.role === 'arbab').reduce((a, m) => Math.max(a, m.id), 0);
  try{ localStorage.setItem('arbabRead', String(lastAns)); }catch(e){}
}
function _arbabBadge(){
  const b = _arbabEl('navBadge-arbab'); if(!b) return;
  const n = ARBAB.open ? 0 : ARBAB.msgs.filter(m => m.role === 'arbab' && !m.progress && m.id > _arbabLastRead()).length;
  b.textContent = n > 9 ? '9+' : String(n); b.style.display = n ? '' : 'none';
}

/* ---------- send ---------- */
function arbabPickImage(file){
  if(!file) return;
  if(!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)){ showToast('Only PNG, JPG, GIF or WEBP images'); return; }
  if(file.size > 6 * 1024 * 1024){ showToast('Image too large (max 6 MB)'); return; }
  ARBAB.img = file;
  const box = _arbabEl('arbabAttach');
  box.hidden = false;
  box.innerHTML = `<img alt="" src="${URL.createObjectURL(file)}"><span>${escapeHtml(file.name || 'Pasted image')}</span><button type="button" onclick="arbabDropImage()" aria-label="Remove image">✕</button>`;
}
function arbabDropImage(){ ARBAB.img = null; const b = _arbabEl('arbabAttach'); b.hidden = true; b.innerHTML = ''; }
async function arbabSend(){
  const t = _arbabEl('arbabText');
  const text = (t.value || '').trim();
  if(!text && !ARBAB.img) return;
  if(ARBAB.missing){ showToast('Run supabase_arbab.sql in Supabase first.'); return; }
  t.value = ''; t.style.height = 'auto';
  let image_path = null;
  try{
    if(ARBAB.img){
      const ext = (ARBAB.img.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      image_path = `${CURRENT_USER_ID}/arbab/${Date.now()}.${ext}`;
      const up = await sb.storage.from('profile-images').upload(image_path, ARBAB.img, { contentType: ARBAB.img.type, upsert: false });
      if(up.error) throw up.error;
      arbabDropImage();
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/arbab_messages`, {
      method: 'POST', headers: { ..._arbabHeaders(true), Prefer: 'return=representation' },
      body: JSON.stringify([{ role: 'user', text, image_path }])
    });
    if(!res.ok) throw new Error(await res.text());
    const [row] = await res.json();
    ARBAB.msgs.push(row); ARBAB.last = Math.max(ARBAB.last, row.id);
    _arbabAdd(row, true);
    _arbabStatus();
  }catch(e){
    console.error('ARBAB send', e);
    t.value = text;
    showToast("Couldn't send to ARBAB. " + (e.message || ''));
  }
}
// Quick questions (2026-11-26): one tap on a phone instead of typing.
function arbabAsk(q){
  const t = _arbabEl('arbabText');
  if(!t || !q) return;
  t.value = q.trim();
  arbabSend();
}
async function arbabClear(){
  if(!(await customConfirm('Delete the whole ARBAB conversation? This can\'t be undone.', 'Delete'))) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/arbab_messages?user_id=eq.${CURRENT_USER_ID}`, { method: 'DELETE', headers: _arbabHeaders() });
  if(!res.ok){ showToast("Couldn't clear the chat."); return; }
  ARBAB.msgs = []; ARBAB.shown.clear();
  const log = _arbabEl('arbabLog'); if(log) log.innerHTML = '';
  _arbabGreet(); _arbabStatus();
}
function _arbabGreet(){
  const log = _arbabEl('arbabLog');
  if(log && !log.children.length){
    const d = document.createElement('div'); d.className = 'arbab-empty';
    d.textContent = 'Ask me anything about your trades, your money or the bots. I answer from the Claude session on the office laptop.';
    log.appendChild(d);
  }
}

/* ---------- voice ---------- */
/* Fixed 2026-11-26 ("voice doesn't work"):
   - iPhone Safari and Chrome only let a page talk after it has spoken once
     inside a tap. The answer arrives seconds later from polling (no tap), so
     it was silently blocked. Every tap/keypress on the page now "unlocks"
     speech with a silent utterance, once.
   - cancel() right before speak() drops the new utterance in Safari: only
     cancel when something is actually playing, then wait a moment.
   - Chrome stops a long utterance after ~15 s: speak in sentence chunks.
   - Pick a real voice for the language; Tagalog falls back to the default
     voice when the device has none (it was silent before). */
let _arbabSpeechUnlocked = false;
function _arbabUnlockSpeech(){
  if(_arbabSpeechUnlocked || !window.speechSynthesis) return;
  try{
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
    _arbabSpeechUnlocked = true;
  }catch(e){}
}
// Events that count as a real tap for iPhone (touchend/click, not pointerdown).
['touchend', 'click', 'keydown'].forEach(t => window.addEventListener(t, _arbabUnlockSpeech, { capture: true, passive: true }));
function _arbabVoiceFor(lang){
  const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  const base = lang.split('-')[0].toLowerCase();
  return vs.find(v => v.lang && v.lang.toLowerCase() === lang.toLowerCase())
    || vs.find(v => v.lang && v.lang.toLowerCase().startsWith(base))
    || (base === 'fil' ? vs.find(v => /^tl/i.test(v.lang || '')) : null)
    || null;
}
if(window.speechSynthesis){ try{ speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices(); }catch(e){} }
function _arbabChunks(text){
  const clean = text.replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  const parts = clean.match(/[^.!?\n]+[.!?]*\s*/g) || [clean];
  const out = [];
  parts.forEach(p => {
    const last = out.length - 1;
    if(last >= 0 && (out[last] + p).length < 180) out[last] += p; else out.push(p);
  });
  return out.map(s => s.trim()).filter(Boolean);
}
function _arbabSpeak(text){
  if(!ARBAB.voice || !window.speechSynthesis || !text) return;
  try{
    const go = () => {
      const chunks = _arbabChunks(text), voice = _arbabVoiceFor(ARBAB.lang);
      chunks.forEach((c, i) => {
        const u = new SpeechSynthesisUtterance(c);
        if(voice){ try{ u.voice = voice; }catch(e){} u.lang = voice.lang; } else if(!ARBAB.lang.startsWith('fil')) u.lang = ARBAB.lang;
        if(i === 0) u.onstart = () => { ARBAB.mode = 'speaking'; _arbabMode('speaking'); };
        if(i === chunks.length - 1) u.onend = () => { ARBAB.mode = null; _arbabStatus(); };
        u.onerror = () => { ARBAB.mode = null; _arbabStatus(); };
        speechSynthesis.speak(u);
      });
      if(speechSynthesis.paused) speechSynthesis.resume();
    };
    if(speechSynthesis.speaking || speechSynthesis.pending){ speechSynthesis.cancel(); setTimeout(go, 120); }
    else go();
  }catch(e){}
}
/* Mic (fixed 2026-11-26, "can't press the mic"): on the iPhone Home Screen
   app the browser's speech input is usually missing or refused, and it used
   to fail silently, so the button looked dead. Now: no speech input, or it
   fails → say why and open the keyboard, whose own 🎤 dictation works there. */
function _arbabDictateHint(why){
  const t = _arbabEl('arbabText');
  if(t){ t.focus(); }
  showToast((why ? why + ' ' : '') + 'Tap the 🎤 on your keyboard to dictate instead.');
}
function arbabMic(){
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!R){ _arbabDictateHint('Voice input isn’t available here.'); return; }
  if(ARBAB.rec){ ARBAB.rec.stop(); return; }
  let rec;
  try{ rec = new R(); }catch(e){ _arbabDictateHint('Voice input isn’t available here.'); return; }
  ARBAB.rec = rec;
  rec.lang = ARBAB.lang; rec.interimResults = true; rec.continuous = false;
  const t = _arbabEl('arbabText'), before = t.value ? t.value + ' ' : '';
  rec.onstart = () => { ARBAB.mode = 'listening'; _arbabMode('listening'); _arbabEl('arbabMic').classList.add('on'); };
  rec.onresult = e => { t.value = before + [...e.results].map(r => r[0].transcript).join(''); };
  rec.onerror = e => {
    const err = e && e.error;
    if(err === 'no-speech' || err === 'aborted') return;
    if(err === 'not-allowed') _arbabDictateHint('Microphone permission is off for this site.');
    else _arbabDictateHint('Voice input didn’t work' + (err ? ` (${err}).` : '.'));
  };
  rec.onend = () => {
    ARBAB.rec = null; ARBAB.mode = null; _arbabEl('arbabMic').classList.remove('on'); _arbabStatus();
    if(t.value.trim() && t.value.trim() !== before.trim()) arbabSend();
  };
  try{ rec.start(); }
  catch(e){ ARBAB.rec = null; _arbabDictateHint('Voice input didn’t start.'); }
}

/* ---------- open / close ---------- */
function arbabOnView(on){
  ARBAB.open = on;
  clearInterval(ARBAB.timer); ARBAB.timer = null;
  if(on){
    if(ARBAB.loaded){ ARBAB.msgs.forEach(m => _arbabAdd(m, true)); _arbabStick(true); }
    _arbabGreet();
    _arbabFetch().then(() => { _arbabGreet(); _arbabMarkRead(); _arbabBadge(); });
    ARBAB.timer = setInterval(_arbabFetch, 2500);
    setTimeout(() => _arbabEl('arbabText')?.focus(), 50);
  }else if(window.speechSynthesis && ARBAB.mode === 'speaking'){
    speechSynthesis.cancel();
  }
}
// In the background: a slow check so the sidebar badge shows new answers.
ARBAB.slowTimer = setInterval(() => { if(!ARBAB.open) _arbabFetch(); }, 20000);
setTimeout(() => { if(!ARBAB.open) _arbabFetch(); }, 6000);
