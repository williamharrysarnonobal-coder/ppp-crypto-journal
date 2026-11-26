/* ======================== PIN LOCK (2026-11-26) ========================
   A screen lock, like the MPD IT Console's: after 15 minutes with no activity
   the app is covered by a keypad until the PIN is entered. It keeps people who
   pick up the phone or laptop out of the journal and the money pages; the
   account password still guards the data itself.

   - Off until the user sets a PIN in Settings → PIN lock (4–6 digits).
   - One PIN for every device: synced through user_profile.ui_prefs.pin_lock
     (UI_PREF_LS_KEYS in dashboard.js). Only a salted PBKDF2-SHA256 hash is
     stored, never the PIN. 'off' means turned off (so it syncs off too).
   - Locks after 15 min idle, and on opening the app when the last activity
     (any tab, this browser) was more than 15 min ago.
   - "Forgot PIN?" and 5 wrong tries sign out. Logging back in with the
     password clears the PIN (_pinAfterLogin), so a new one can be set. */
const PIN_LS = 'tanaydana-pin';
const PIN_ACTIVE_LS = 'tanaydana-last-active';
const PIN_RESET_LS = 'tanaydana-pin-reset';
const PIN_IDLE_MS = 15 * 60 * 1000;
const PIN_MAX_TRIES = 5;
const PIN_ITER = 150000;

function _pinRecord(){
  try{
    const raw = localStorage.getItem(PIN_LS);
    if(!raw || raw === 'off') return null;
    const r = JSON.parse(raw);
    return r && r.hash && r.salt ? r : null;
  }catch(e){ return null; }
}
const _b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const _unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function _pinHash(pin, saltBytes, iter){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: iter }, key, 256);
  return _b64(bits);
}
async function _pinCheck(pin){
  const r = _pinRecord();
  if(!r) return false;
  return (await _pinHash(pin, _unb64(r.salt), r.iter || PIN_ITER)) === r.hash;
}
async function _pinSave(pin){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const rec = { v: 1, len: pin.length, iter: PIN_ITER, salt: _b64(salt), hash: await _pinHash(pin, salt, PIN_ITER) };
  try{ localStorage.setItem(PIN_LS, JSON.stringify(rec)); }catch(e){}
  if(typeof syncUIPrefsToProfile === 'function') syncUIPrefsToProfile();
}
function _pinTurnOff(){
  try{ localStorage.setItem(PIN_LS, 'off'); }catch(e){}
  if(typeof syncUIPrefsToProfile === 'function') syncUIPrefsToProfile();
}

/* ---------- activity ---------- */
let _pinLastWrite = 0;
function _pinTouch(){
  if(_pinLocked) return;
  const now = Date.now();
  if(now - _pinLastWrite < 5000) return;      // one write every 5 s is plenty
  _pinLastWrite = now;
  try{ localStorage.setItem(PIN_ACTIVE_LS, String(now)); }catch(e){}
}
function _pinLastActive(){
  try{ return Number(localStorage.getItem(PIN_ACTIVE_LS)) || 0; }catch(e){ return 0; }
}
function _pinShouldLock(){
  if(!_pinRecord()) return false;
  const last = _pinLastActive();
  return last > 0 && Date.now() - last > PIN_IDLE_MS;
}

/* ---------- the overlay ---------- */
let _pinLocked = false, _pinEntry = '', _pinMode = 'unlock', _pinFirst = '', _pinTries = 0, _pinBusy = false, _pinDone = null;
const PIN_LOCK_SVG = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';

function _pinEnsureOverlay(){
  let el = document.getElementById('pinLockOverlay');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'pinLockOverlay';
  el.className = 'pinlock';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'PIN lock');
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="pinlock-box">
      <div class="pinlock-ring" aria-hidden="true"><span class="pinlock-ring-a"></span><span class="pinlock-ring-b"></span><span class="pinlock-icon">${PIN_LOCK_SVG}</span></div>
      <div class="pinlock-title" id="pinLockTitle">Tanaydana locked</div>
      <div class="pinlock-hint" id="pinLockHint">Enter your PIN</div>
      <div class="pinlock-dots" id="pinLockDots" aria-live="polite"></div>
      <div class="pinlock-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button type="button" class="pinlock-key" data-k="${n}">${n}</button>`).join('')}
        <button type="button" class="pinlock-key pinlock-key-sm" data-k="back" aria-label="Delete">⌫</button>
        <button type="button" class="pinlock-key" data-k="0">0</button>
        <button type="button" class="pinlock-key pinlock-key-sm" data-k="enter">Enter</button>
      </div>
      <div class="pinlock-foot">
        <button type="button" class="pinlock-link" id="pinLockAlt"></button>
      </div>
    </div>`;
  el.addEventListener('click', e => {
    const k = e.target.closest('.pinlock-key');
    if(k) _pinPress(k.dataset.k);
  });
  el.querySelector('#pinLockAlt').addEventListener('click', () => {
    if(_pinMode === 'unlock') _pinForgot(); else _pinClose(false);
  });
  document.body.appendChild(el);
  return el;
}
function _pinLen(){ const r = _pinRecord(); return (r && r.len) || 6; }
function _pinRenderDots(){
  const want = _pinMode === 'unlock' || _pinMode === 'verify' ? _pinLen() : Math.max(4, Math.min(6, _pinEntry.length < 4 ? 4 : _pinEntry.length + (_pinEntry.length < 6 ? 1 : 0)));
  const dots = document.getElementById('pinLockDots');
  if(dots) dots.innerHTML = Array.from({ length: want }, (_, i) => `<span class="${i < _pinEntry.length ? 'on' : ''}"></span>`).join('');
}
function _pinSetText(title, hint, alt){
  document.getElementById('pinLockTitle').textContent = title;
  document.getElementById('pinLockHint').textContent = hint;
  document.getElementById('pinLockAlt').textContent = alt;
}
function _pinShake(msg){
  const box = document.querySelector('#pinLockOverlay .pinlock-box');
  if(box){ box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); }
  if(msg) document.getElementById('pinLockHint').textContent = msg;
  _pinEntry = ''; _pinRenderDots();
}
function _pinOpen(mode, done){
  const el = _pinEnsureOverlay();
  _pinMode = mode; _pinEntry = ''; _pinFirst = ''; _pinDone = done || null;
  if(mode === 'unlock') _pinSetText('Tanaydana locked', 'Enter your PIN', 'Forgot PIN? Log out');
  if(mode === 'verify') _pinSetText('Confirm it’s you', 'Enter your current PIN', 'Cancel');
  if(mode === 'set') _pinSetText('Create your PIN', '4 to 6 digits, then Enter', 'Cancel');
  el.classList.add('open');
  document.body.classList.add('pinlock-active');
  _pinRenderDots();
  // Focus the screen itself (typing digits works), not the "1" key — a
  // focused key looked as if it had been pressed.
  setTimeout(() => el.focus({ preventScroll: true }), 30);
}
function _pinClose(ok){
  const el = document.getElementById('pinLockOverlay');
  if(el) el.classList.remove('open');
  document.body.classList.remove('pinlock-active');
  const done = _pinDone; _pinDone = null;
  if(done) done(ok);
}
function pinLockNow(){
  if(!_pinRecord() || _pinLocked) return;
  _pinLocked = true; _pinTries = 0;
  _pinOpen('unlock');
}
async function _pinPress(k){
  if(_pinBusy) return;
  if(k === 'back'){ _pinEntry = _pinEntry.slice(0, -1); _pinRenderDots(); return; }
  if(k === 'enter'){ await _pinSubmit(); return; }
  if(!/^\d$/.test(k)) return;
  const max = _pinMode === 'set' || _pinMode === 'confirm' ? 6 : _pinLen();
  if(_pinEntry.length >= max) return;
  _pinEntry += k; _pinRenderDots();
  // Unlocking needs no Enter: it checks as soon as the last digit is in.
  if((_pinMode === 'unlock' || _pinMode === 'verify') && _pinEntry.length === _pinLen()) await _pinSubmit();
}
async function _pinSubmit(){
  _pinBusy = true;
  try{
    if(_pinMode === 'unlock' || _pinMode === 'verify'){
      if(_pinEntry.length < 4) return;
      if(await _pinCheck(_pinEntry)){
        if(_pinMode === 'unlock'){ _pinLocked = false; _pinLastWrite = 0; _pinTouch(); }
        _pinClose(true);
        return;
      }
      _pinTries++;
      if(_pinMode === 'unlock' && _pinTries >= PIN_MAX_TRIES){ _pinShake('Too many tries. Logging out…'); setTimeout(_pinForgot, 900); return; }
      _pinShake(_pinMode === 'unlock' ? `Wrong PIN · ${PIN_MAX_TRIES - _pinTries} ${PIN_MAX_TRIES - _pinTries === 1 ? 'try' : 'tries'} left` : 'Wrong PIN');
      return;
    }
    if(_pinMode === 'set'){
      if(_pinEntry.length < 4){ _pinShake('Use at least 4 digits'); return; }
      _pinFirst = _pinEntry; _pinEntry = ''; _pinMode = 'confirm';
      _pinSetText('Confirm your PIN', 'Enter the same PIN again', 'Cancel'); _pinRenderDots();
      return;
    }
    if(_pinMode === 'confirm'){
      if(_pinEntry !== _pinFirst){ _pinMode = 'set'; _pinFirst = ''; _pinSetText('Create your PIN', '4 to 6 digits, then Enter', 'Cancel'); _pinShake('PINs didn’t match. Try again.'); return; }
      await _pinSave(_pinEntry);
      _pinLastWrite = 0; _pinTouch();
      _pinClose(true);
      if(typeof showToast === 'function') showToast('PIN lock is on');
    }
  }finally{ _pinBusy = false; }
}
function _pinForgot(){
  try{ localStorage.setItem(PIN_RESET_LS, '1'); }catch(e){}
  if(typeof authSignOut === 'function') authSignOut();
}
// Called when the profile arrives after a login (applyUIPrefsFromProfile).
function _pinAfterLogin(){
  let flagged = false;
  try{ flagged = localStorage.getItem(PIN_RESET_LS) === '1'; localStorage.removeItem(PIN_RESET_LS); }catch(e){}
  if(!flagged) return;
  _pinTurnOff();
  if(typeof PROFILE_DATA !== 'undefined' && PROFILE_DATA && PROFILE_DATA.ui_prefs) PROFILE_DATA.ui_prefs.pin_lock = 'off';
  _pinLocked = false; _pinClose(false);
  if(typeof showToast === 'function') setTimeout(() => showToast('PIN removed. Set a new one in Settings → PIN lock.'), 800);
}

/* ---------- Settings → PIN lock ---------- */
function renderPinLockSettings(){
  const el = document.getElementById('pinLockSettings');
  if(!el) return;
  const on = !!_pinRecord();
  el.innerHTML = on
    ? `<div class="pinlock-status"><span class="pill pill-green">On</span><span>Locks after 15 minutes without activity.</span></div>
       <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
         <button type="button" class="poscalc-accent-btn" onclick="pinChange()">Change PIN</button>
         <button type="button" class="drawer-secondary-btn" onclick="pinDisable()">Turn off</button>
         <button type="button" class="drawer-secondary-btn" onclick="pinLockNow()">Lock now</button>
       </div>`
    : `<div class="pinlock-status"><span class="pill pill-muted">Off</span><span>No PIN set yet.</span></div>
       <div style="margin-top:12px;"><button type="button" class="poscalc-accent-btn btn-primary" onclick="pinSetup()">Set PIN</button></div>`;
}
function pinSetup(){ _pinOpen('set', () => renderPinLockSettings()); }
function pinChange(){ _pinOpen('verify', ok => { if(ok) setTimeout(() => _pinOpen('set', () => renderPinLockSettings()), 150); }); }
function pinDisable(){
  _pinOpen('verify', ok => {
    if(!ok) return;
    _pinTurnOff(); renderPinLockSettings();
    if(typeof showToast === 'function') showToast('PIN lock is off');
  });
}

/* ---------- wiring ---------- */
['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(t =>
  window.addEventListener(t, _pinTouch, { passive: true, capture: true }));
document.addEventListener('keydown', e => {
  const el = document.getElementById('pinLockOverlay');
  if(!el || !el.classList.contains('open')) return;
  if(/^\d$/.test(e.key)){ e.preventDefault(); _pinPress(e.key); }
  else if(e.key === 'Backspace'){ e.preventDefault(); _pinPress('back'); }
  else if(e.key === 'Enter'){ e.preventDefault(); _pinPress('enter'); }
  else if(e.key === 'Escape' && _pinMode !== 'unlock'){ e.preventDefault(); _pinClose(false); }
  else if(e.key === 'Tab'){ /* stay inside the keypad */ const keys = [...el.querySelectorAll('button')]; const i = keys.indexOf(document.activeElement);
    e.preventDefault(); keys[(i + (e.shiftKey ? -1 : 1) + keys.length) % keys.length].focus(); }
}, true);
// Opening the app (or coming back to the tab) after a long gap locks first.
if(_pinShouldLock()) pinLockNow(); else _pinTouch();
document.addEventListener('visibilitychange', () => { if(!document.hidden && _pinShouldLock()) pinLockNow(); });
setInterval(() => { if(_pinShouldLock()) pinLockNow(); }, 20000);
