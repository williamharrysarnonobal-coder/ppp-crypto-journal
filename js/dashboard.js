let USER_ACCESS_TOKEN = null;
let CURRENT_USER_EMAIL = null;
let CURRENT_USER_ID = null;
let CURRENT_USER_ROLE = null;   // 'admin' | 'user' — from user_access, not hardcoded
let CURRENT_USER_STATUS = null; // 'pending' | 'approved' | 'rejected'
function isAdminUser(){ return CURRENT_USER_ROLE === 'admin'; }

// Per-user feature gating, on top of the account-level approve/reject gate —
// an admin can block a specific approved user from specific features without
// hiding them: the nav item stays visible but locked, and clicking it just
// shows a permission-denied message instead of switching views.
const GATEABLE_FEATURES = [
  { key: 'journal', label: 'Trade Journals' },
  { key: 'accounts', label: 'My Accounts' },
  { key: 'calculator', label: 'Calculator' },
  { key: 'alerts', label: 'Trade Alerts' },
  { key: 'notebook', label: 'Notebook' },
  { key: 'achievements', label: 'Achievements' },
  { key: 'challenges', label: 'Challenges' },
  { key: 'news', label: 'Economic Calendar' }
];
let DISABLED_FEATURES = new Set();

function applyFeatureLocks(){
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    const view = el.dataset.view;
    const locked = DISABLED_FEATURES.has(view);
    el.classList.toggle('nav-locked', locked);
    let lockIcon = el.querySelector('.nav-lock-icon');
    if(locked && !lockIcon){
      lockIcon = document.createElement('span');
      lockIcon.className = 'nav-lock-icon';
      lockIcon.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
      el.appendChild(lockIcon);
    }else if(!locked && lockIcon){
      lockIcon.remove();
    }
  });
}

let ALL_TRADES = [];
let RAW_TRADES = [];
let FILTERED = [];
let SETUP_SCREENSHOTS = {}; // { [position_setups.id]: {before_screenshot, after_screenshot} }, for trades with linked_setup_id

async function loadLinkedSetupScreenshots(){
  const ids = [...new Set(RAW_TRADES.map(r => r.linked_setup_id).filter(Boolean))];
  if(!ids.length){ SETUP_SCREENSHOTS = {}; return; }
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/position_setups?id=in.(${ids.join(',')})&select=id,before_screenshot,after_screenshot`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
    });
    if(!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    SETUP_SCREENSHOTS = {};
    rows.forEach(r => { SETUP_SCREENSHOTS[r.id] = r; });
  }catch(e){
    console.error("Couldn't load linked setup screenshots:", e);
  }
}

async function viewSetupScreenshot(setupId, slot){
  const info = SETUP_SCREENSHOTS[setupId];
  const path = info ? info[`${slot}_screenshot`] : null;
  if(!path) return;
  try{
    const { data } = await sb.storage.from('setup-screenshots').createSignedUrl(path, 3600);
    if(data && data.signedUrl) openLightbox(data.signedUrl);
  }catch(e){
    console.error(`Couldn't load ${slot} screenshot:`, e);
  }
}
let calMonth = new Date();
let activeTab = "trade_setup";
let equityChartRef = null;
let winLossChartRef = null;
let breakdownChartRef = null;
let disciplineRadarRef = null;
let dayOfWeekChartRef = null;
let symbolFrequencyChartRef = null;
let currentView = "profile";

const MOON_ICON_SVG = '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN_ICON_SVG = '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function setLoading(pct){
  document.getElementById('loadingBar').style.width = pct + '%';
  if(pct >= 100){ setTimeout(()=>{document.getElementById('loadingBar').style.width='0%';}, 400); }
}

function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('collapsed');
}

(function setupSidebarTooltips(){
  const tip = document.getElementById('sidebarTooltip');
  const sidebar = document.getElementById('sidebar');
  if(!tip || !sidebar) return;

  sidebar.querySelectorAll('.nav-item, .theme-toggle').forEach(item => {
    item.addEventListener('mouseenter', () => {
      if(!sidebar.classList.contains('collapsed')) return;
      const label = item.querySelector('.nav-tooltip');
      if(!label) return;
      const rect = item.getBoundingClientRect();
      tip.textContent = label.textContent;
      tip.style.left = `${rect.right + 12}px`;
      tip.style.top = `${rect.top + rect.height / 2}px`;
      tip.style.transform = 'translateY(-50%)';
      tip.classList.add('show');
    });
    item.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
})();

function applyTheme(mode){
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  try{ localStorage.setItem('ledger-theme', mode); }catch(e){}
  syncUIPrefsToProfile();

  const btn = document.getElementById('themeToggleBtn');
  if(btn){
    btn.innerHTML = mode === 'light'
      ? `${SUN_ICON_SVG} <span class="nav-label">Light mode</span><span class="nav-tooltip">Light mode</span>`
      : `${MOON_ICON_SVG} <span class="nav-label">Dark mode</span><span class="nav-tooltip">Dark mode</span>`;
  }

  // re-render charts so their colors match the new theme
  if(FILTERED.length || ALL_TRADES.length){
    renderKPIs();
    renderEquityCurve();
    renderWinLossChart();
    renderDisciplineRadar();
    renderDayOfWeekChart();
    renderSymbolFrequencyChart();
    renderBreakdown();
  }
  if(currentView === 'settings') renderSettingsPage();
}

function toggleTheme(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  applyTheme(isLight ? 'dark' : 'light');
}

const FONT_OPTIONS = [
  { name: 'Public Sans', family: "'Public Sans',sans-serif" },
  { name: 'Manrope', family: "'Manrope',sans-serif" },
  { name: 'IBM Plex Sans', family: "'IBM Plex Sans',sans-serif" },
  { name: 'Inter', family: "'Inter',sans-serif" }
];

function applyFont(name){
  const opt = FONT_OPTIONS.find(f => f.name === name) || FONT_OPTIONS[0];
  document.documentElement.style.setProperty('--font-ui', opt.family);
  try{ localStorage.setItem('ledger-font', opt.name); }catch(e){}
  syncUIPrefsToProfile();
}

function setFontPreference(name){
  applyFont(name);
  if(currentView === 'settings') renderSettingsPage();
}

// value:null means "follow the current Theme's own accent" (gold in dark,
// amber in light) — any other value is a flat hex that overrides both themes,
// so it combines with whichever Theme (dark/light) is active.
const ACCENT_OPTIONS = [
  { name: 'Gold (Default)', value: null },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Orange', value: '#FB923C' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Coral', value: '#F97066' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Sky', value: '#0EA5E9' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Lime', value: '#84CC16' }
];

function applyAccent(name){
  const opt = ACCENT_OPTIONS.find(a => a.name === name) || ACCENT_OPTIONS[0];
  if(opt.value){
    document.documentElement.style.setProperty('--accent', opt.value);
  }else{
    document.documentElement.style.removeProperty('--accent');
  }
  try{ localStorage.setItem('ledger-accent', name); }catch(e){}
  syncUIPrefsToProfile();
}

function setAccentPreference(name){
  applyAccent(name);
  if(FILTERED.length || ALL_TRADES.length){
    renderKPIs();
    renderEquityCurve();
    renderWinLossChart();
    renderDisciplineRadar();
    renderDayOfWeekChart();
    renderSymbolFrequencyChart();
    renderBreakdown();
  }
  if(currentView === 'settings') renderSettingsPage();
}

/* ---------------- UI preferences sync (account-level, cross-device) ----------------
   Every per-device preference below is mirrored into user_profile.ui_prefs
   so it follows the ACCOUNT, not the browser — localStorage is per-site-
   address, so switching URLs/devices used to reset all of these to default.
   localStorage stays as the instant local cache (applied before login even
   resolves); the DB copy is layered on top once the profile loads. */
// NOTE: mobile_mode is deliberately NOT in this list — layout is a
// per-device choice (phone wants Mobile, laptop wants Desktop), so syncing
// it would flip every device to whatever the last one picked.
const UI_PREF_LS_KEYS = {
  theme: 'ledger-theme',
  font: 'ledger-font',
  accent: 'ledger-accent',
  field_options: 'ledger-field-options',
  unfollowed_rules_options: 'ledger-unfollowed-rules-options',
  form_field_config: 'ledger-form-field-config',
  column_config: 'ledger-column-config'
};

let _uiPrefsSyncTimer = null;
let _applyingUIPrefs = false; // guards against re-uploading prefs we just downloaded

// Debounced: rapid changes (dragging columns around, trying accents) collapse
// into one write instead of hammering Supabase per click.
function syncUIPrefsToProfile(){
  if(!CURRENT_USER_ID || _applyingUIPrefs) return;
  clearTimeout(_uiPrefsSyncTimer);
  _uiPrefsSyncTimer = setTimeout(async () => {
    const prefs = {};
    Object.entries(UI_PREF_LS_KEYS).forEach(([k, lsKey]) => {
      try{
        const v = localStorage.getItem(lsKey);
        if(v !== null) prefs[k] = v;
      }catch(e){}
    });
    try{
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profile?on_conflict=user_id`, {
        method: 'POST',
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal,resolution=merge-duplicates"
        },
        body: JSON.stringify([{ user_id: CURRENT_USER_ID, ui_prefs: prefs }])
      });
      if(!res.ok) throw new Error(await res.text());
      if(PROFILE_DATA) PROFILE_DATA.ui_prefs = prefs;
    }catch(e){
      console.error("Couldn't sync UI preferences to profile:", e);
    }
  }, 800);
}

// Called after the profile loads — pulls the account's saved prefs down into
// localStorage and re-applies whatever actually differs.
function applyUIPrefsFromProfile(){
  const prefs = PROFILE_DATA?.ui_prefs;
  if(!prefs || typeof prefs !== 'object') return;

  const changedKeys = [];
  Object.entries(UI_PREF_LS_KEYS).forEach(([k, lsKey]) => {
    if(prefs[k] === undefined || prefs[k] === null) return;
    try{
      if(localStorage.getItem(lsKey) !== prefs[k]){
        localStorage.setItem(lsKey, prefs[k]);
        changedKeys.push(k);
      }
    }catch(e){}
  });
  if(!changedKeys.length) return;

  _applyingUIPrefs = true;
  try{
    if(changedKeys.includes('theme')) applyTheme(prefs.theme === 'light' ? 'light' : 'dark');
    if(changedKeys.includes('font')) applyFont(prefs.font);
    if(changedKeys.includes('accent')) applyAccent(prefs.accent);
    if(changedKeys.includes('field_options') || changedKeys.includes('unfollowed_rules_options')) loadOptionsConfig();
    if(changedKeys.includes('form_field_config')) loadFormFieldConfig();
    if(changedKeys.includes('column_config')){ loadColumnConfig(); renderJournalTable(); }
    if(currentView === 'settings') renderSettingsPage();
    if(currentView === 'config'){ renderColumnConfigUI(); renderOptionsEditor(); renderFormFieldConfigUI(); }
  }finally{
    _applyingUIPrefs = false;
  }
}

function renderSettingsPage(){
  const currentThemeMode = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const themeGrid = document.getElementById('themeOptionGrid');
  if(themeGrid){
    themeGrid.innerHTML = `
      <div class="settings-option ${currentThemeMode==='dark'?'active':''}" onclick="applyTheme('dark')">
        <div class="settings-option-name">Dark</div>
        <div class="settings-option-sub">Default — easier on the eyes at night.</div>
      </div>
      <div class="settings-option ${currentThemeMode==='light'?'active':''}" onclick="applyTheme('light')">
        <div class="settings-option-name">Light</div>
        <div class="settings-option-sub">Bright background, dark text.</div>
      </div>
    `;
  }

  let savedFont = 'Public Sans';
  try{ savedFont = localStorage.getItem('ledger-font') || 'Public Sans'; }catch(e){}
  const fontGrid = document.getElementById('fontOptionGrid');
  if(fontGrid){
    fontGrid.innerHTML = FONT_OPTIONS.map(f => `
      <div class="settings-option ${savedFont===f.name?'active':''}" style="font-family:${f.family};" onclick="setFontPreference('${f.name}')">
        <div class="settings-option-name">${f.name}</div>
        <div class="settings-option-sub">Aa Bb Cc 123</div>
      </div>
    `).join('');
  }

  let savedAccent = 'Gold (Default)';
  try{ savedAccent = localStorage.getItem('ledger-accent') || 'Gold (Default)'; }catch(e){}
  const themeDefaultAccent = currentThemeMode === 'light' ? '#D69E2E' : '#F0B429';
  const accentGrid = document.getElementById('accentOptionGrid');
  if(accentGrid){
    accentGrid.innerHTML = ACCENT_OPTIONS.map(a => `
      <div class="settings-option ${savedAccent===a.name?'active':''}" onclick="setAccentPreference('${a.name}')">
        <div class="settings-accent-swatch" style="background:${a.value || themeDefaultAccent};"></div>
        <div class="settings-option-name">${a.name}</div>
      </div>
    `).join('');
  }

  const mobileGrid = document.getElementById('mobileModeOptionGrid');
  if(mobileGrid){
    const mobileOn = document.body.classList.contains('mobile-mode');
    mobileGrid.innerHTML = `
      <div class="settings-option ${!mobileOn?'active':''}" onclick="setMobileModePreference(false)">
        <div class="settings-option-name">Desktop</div>
        <div class="settings-option-sub">Sidebar layout — best on laptops and wide screens.</div>
      </div>
      <div class="settings-option ${mobileOn?'active':''}" onclick="setMobileModePreference(true)">
        <div class="settings-option-name">Mobile</div>
        <div class="settings-option-sub">One centered column with a corner menu — made for phones.</div>
      </div>
    `;
  }
}

(function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem('ledger-theme'); }catch(e){}
  if(saved === 'light'){
    document.documentElement.setAttribute('data-theme','light');
    const btn = document.getElementById('themeToggleBtn');
    if(btn) btn.innerHTML = `${SUN_ICON_SVG} <span class="nav-label">Light mode</span><span class="nav-tooltip">Light mode</span>`;
  }
})();

(function initFont(){
  let saved = null;
  try{ saved = localStorage.getItem('ledger-font'); }catch(e){}
  if(saved) applyFont(saved);
})();

(function initAccent(){
  let saved = null;
  try{ saved = localStorage.getItem('ledger-accent'); }catch(e){}
  if(saved) applyAccent(saved);
})();

/* ---------------- Mobile Mode (Settings > Layout) ---------------- */
function applyMobileMode(on){
  document.body.classList.toggle('mobile-mode', !!on);
  if(on){
    // The drawer always shows full labels — a collapsed sidebar state
    // makes no sense inside a slide-in menu.
    document.getElementById('sidebar')?.classList.remove('collapsed');
  }else{
    closeMobileMenu();
  }
  try{ localStorage.setItem('ledger-mobile-mode', on ? '1' : '0'); }catch(e){}
  syncUIPrefsToProfile();
}

function setMobileModePreference(on){
  applyMobileMode(on);
  if(currentView === 'settings') renderSettingsPage();
}

function toggleMobileMenu(){
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('mobileMenuBackdrop');
  if(!sb) return;
  const open = sb.classList.toggle('mobile-open');
  if(bd) bd.classList.toggle('show', open);
}

function closeMobileMenu(){
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('mobileMenuBackdrop')?.classList.remove('show');
}

(function initMobileMode(){
  let saved = null;
  try{ saved = localStorage.getItem('ledger-mobile-mode'); }catch(e){}
  if(saved === '1') document.body.classList.add('mobile-mode');
})();

// Clears the "needs-input" red flag the moment a flagged field gets a value
// (and re-flags it if cleared back to empty) — bound once on the stable
// #drawerBody container since its contents get rebuilt on every render.
(function initDrawerEmptyFieldTracking(){
  const body = document.getElementById('drawerBody');
  if(!body) return;
  const handler = (e) => {
    const field = e.target.closest('[data-field]');
    if(!field) return;
    const row = field.closest('.field-row');
    if(!row) return;
    row.classList.toggle('needs-input', field.value.trim() === '');
  };
  body.addEventListener('input', handler);
  body.addEventListener('change', handler);
})();

function switchView(view){
  if(DISABLED_FEATURES.has(view)){
    showToast("You don't have permission to access this feature.");
    return;
  }
  // In Mobile Mode the nav lives in a slide-in drawer — picking a page
  // should close it, like any mobile app menu.
  if(document.body.classList.contains('mobile-mode')) closeMobileMenu();
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

  if(view === 'journal') renderJournalTable();
  if(view === 'config'){ renderColumnConfigUI(); renderOptionsEditor(); renderFormFieldConfigUI(); }
  if(view === 'alerts'){ loadSignalAlerts(); startAlertsPolling(); } else { stopAlertsPolling(); }
  if(view === 'achievements') loadAchievements();
  if(view === 'news'){ loadMarketNewsWidget(); } else { clearInterval(econSyncLabelTimer); }
  if(view === 'challenges') renderChallenges();
  if(view === 'leaderboard') renderLeaderboard();
  if(view === 'profile') loadProfile();
  if(view === 'accounts') loadAccounts();
  if(view === 'calculator'){ renderPositionCalculator(); loadSavedSetups(); }
  if(view === 'settings') renderSettingsPage();
  if(view === 'notebook') loadNotes();
  if(view === 'admin') renderAdminConsole();
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Promise-based replacement for the native confirm() — matches the app's
// own styling instead of the browser's default dialog.
let _customConfirmResolver = null;
function customConfirm(message, okLabel){
  return new Promise(resolve => {
    document.getElementById('customConfirmMessage').textContent = message;
    document.getElementById('customConfirmOkBtn').textContent = okLabel || 'Delete';
    _customConfirmResolver = resolve;
    document.getElementById('customConfirmModal').classList.add('open');
  });
}
function resolveCustomConfirm(result){
  document.getElementById('customConfirmModal').classList.remove('open');
  if(_customConfirmResolver){ _customConfirmResolver(result); _customConfirmResolver = null; }
}

// Promise-based replacement for the native alert() — same reasoning as
// customConfirm(): the browser's own alert() doesn't match the app's look.
let _customAlertResolver = null;
function customAlert(message, title){
  return new Promise(resolve => {
    document.getElementById('customAlertTitle').textContent = title || 'Heads up';
    document.getElementById('customAlertMessage').textContent = message;
    _customAlertResolver = resolve;
    document.getElementById('customAlertModal').classList.add('open');
  });
}
function resolveCustomAlert(){
  document.getElementById('customAlertModal').classList.remove('open');
  if(_customAlertResolver){ _customAlertResolver(); _customAlertResolver = null; }
}

// Hover popup for "Rules Followed? = No" cells in the Trade Journal table —
// shows which specific rules were broken, since a "Yes" cell has nothing to
// check and doesn't need one.
function showRulesTooltip(event){
  const tip = document.getElementById('rulesTooltip');
  const cell = event.currentTarget;
  if(!tip || !cell) return;
  tip.textContent = cell.dataset.rules || '';
  const rect = cell.getBoundingClientRect();
  tip.style.left = `${rect.left}px`;
  tip.style.top = `${rect.bottom + 8}px`;
  tip.classList.add('show');
}
function hideRulesTooltip(){
  const tip = document.getElementById('rulesTooltip');
  if(tip) tip.classList.remove('show');
}

/* Auto-refresh Trade Alerts while that tab is open — the bots only push
   every ~5 min, so a short poll is enough to feel "live" without a
   websocket subscription. */
let alertsPollTimer = null;
function startAlertsPolling(){
  stopAlertsPolling();
  alertsPollTimer = setInterval(() => { if(currentView === 'alerts') loadSignalAlerts(); }, 30000);
}
function stopAlertsPolling(){
  if(alertsPollTimer){ clearInterval(alertsPollTimer); alertsPollTimer = null; }
}

async function initApp(){
  const session = await requireSession(); // redirects to login.html if not logged in
  if(!session) return;
  USER_ACCESS_TOKEN = session.access_token;
  CURRENT_USER_EMAIL = session.user?.email || null;
  CURRENT_USER_ID = session.user?.id || null;

  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_access?select=role,status,disabled_features`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
    });
    if(!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    CURRENT_USER_ROLE = rows[0]?.role || null;
    CURRENT_USER_STATUS = rows[0]?.status || null;
    DISABLED_FEATURES = new Set(rows[0]?.disabled_features || []);
  }catch(e){
    console.error("Couldn't load account access status:", e);
    CURRENT_USER_STATUS = null;
  }

  if(CURRENT_USER_STATUS !== 'approved'){
    showPendingApprovalScreen(CURRENT_USER_STATUS);
    return;
  }

  document.querySelectorAll('[data-view="admin"]').forEach(el => el.style.display = isAdminUser() ? '' : 'none');
  applyFeatureLocks();

  loadColumnConfig();
  loadOptionsConfig();
  loadFormFieldConfig();
  loadAccounts();

  setLoading(30);

  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*&order=close_date.asc`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    setLoading(70);

    if(!res.ok){
      const t = await res.text();
      throw new Error(`HTTP ${res.status} — ${t.slice(0,200)}`);
    }

    const data = await res.json();
    RAW_TRADES = data;
    ALL_TRADES = data.map(normalizeTrade);

    setLoading(100);
    document.getElementById('app').style.display = 'block';

    populateAccountFilter();
    applyFilters();
    populateJournalFilters();
    loadLinkedSetupScreenshots().then(renderJournalTable);
    renderJournalTable();
    loadProfile();
    refreshAllNavBadges();

    // Loaded eagerly (not just when their own view is first opened) so the
    // sidebar badges are accurate right from login, not just after visiting
    // Trade Alerts / Economic Calendar / Challenges at least once.
    loadSignalAlerts();
    loadMarketNewsWidget();
    renderChallenges();
    loadPendingSignupsForBadge();

  }catch(e){
    setLoading(100);
    await customAlert("Couldn't load your trades: " + e.message);
  }
}

function showPendingApprovalScreen(status){
  document.getElementById('app').style.display = 'none';
  const screen = document.getElementById('pendingApprovalScreen');
  const title = document.getElementById('pendingScreenTitle');
  const text = document.getElementById('pendingScreenText');
  if(status === 'rejected'){
    title.textContent = 'Access denied';
    text.textContent = "This account hasn't been approved. If you think this is a mistake, reach out to whoever invited you.";
  }else{
    title.textContent = 'Waiting for approval';
    text.textContent = "You're signed up — this account is just waiting for an admin to approve it before you can use the app. Check back soon.";
  }
  screen.style.display = 'flex';
}

/* ---------------- Admin Console (user permissions) ---------------- */
async function renderAdminConsole(){
  const pendingList = document.getElementById('adminPendingList');
  const allList = document.getElementById('adminAllUsersList');
  if(!pendingList || !allList) return;
  pendingList.innerHTML = `<div class="empty-state">Loading…</div>`;
  allList.innerHTML = '';
  try{
    const [accessRes, profileRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/user_access?select=*&order=requested_at.desc`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
      }),
      fetch(`${SUPABASE_URL}/rest/v1/user_profile?select=user_id,display_name,username,discord_username`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
      })
    ]);
    if(!accessRes.ok) throw new Error(await accessRes.text());
    const accessRows = await accessRes.json();
    const profileRows = profileRes.ok ? await profileRes.json() : [];
    const profileByUser = {};
    profileRows.forEach(p => { profileByUser[p.user_id] = p; });
    const merged = accessRows.map(r => ({ ...r, ...(profileByUser[r.user_id] || {}) }));
    renderAdminUserList(merged);
  }catch(e){
    console.error("Couldn't load user list:", e);
    pendingList.innerHTML = `<div class="empty-state">Couldn't load users.</div>`;
  }
}

let ADMIN_USER_ROWS = [];

function _adminDateFmt(d){
  return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

function renderAdminUserList(rows){
  ADMIN_USER_ROWS = rows;
  const pending = rows.filter(r => r.status === 'pending');
  PENDING_SIGNUPS = pending;
  refreshAllNavBadges();

  document.getElementById('adminPendingCount').textContent = pending.length;

  document.getElementById('adminPendingList').innerHTML = pending.length
    ? pending.map(r => `
        <tr>
          <td>${escapeHtml(r.email)}</td>
          <td>${escapeHtml(r.display_name || '—')}</td>
          <td>${r.username ? '@'+escapeHtml(r.username) : '—'}</td>
          <td>${escapeHtml(r.discord_username || '—')}</td>
          <td>${_adminDateFmt(r.requested_at)}</td>
          <td>
            <button class="drawer-secondary-btn" onclick="approveUser('${r.user_id}')">Approve</button>
            <button class="drawer-danger-btn" onclick="rejectUser('${r.user_id}')">Reject</button>
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" style="color:var(--muted);">No pending requests.</td></tr>`;

  filterAdminUserList();
}

function filterAdminUserList(){
  const searchEl = document.getElementById('adminUserSearch');
  const q = (searchEl ? searchEl.value : '').trim().toLowerCase();

  let others = ADMIN_USER_ROWS.filter(r => r.status !== 'pending');
  if(q){
    others = others.filter(r =>
      (r.email || '').toLowerCase().includes(q) ||
      (r.username || '').toLowerCase().includes(q) ||
      (r.display_name || '').toLowerCase().includes(q) ||
      (r.discord_username || '').toLowerCase().includes(q)
    );
  }

  document.getElementById('adminAllUsersList').innerHTML = others.length
    ? others.map(r => {
        const disabledCount = (r.disabled_features || []).length;
        return `
        <tr>
          <td>${escapeHtml(r.email)}</td>
          <td>${escapeHtml(r.display_name || '—')}</td>
          <td>${r.username ? '@'+escapeHtml(r.username) : '—'}</td>
          <td>${escapeHtml(r.discord_username || '—')}</td>
          <td><span class="pill ${r.status==='approved'?'pill-green':'pill-red'}">${escapeHtml(r.status)}</span></td>
          <td><span class="pill ${r.role==='admin'?'pill-orange':'pill-muted'}">${escapeHtml(r.role)}</span></td>
          <td>${disabledCount > 0 ? `<span class="pill pill-red">${disabledCount}/${GATEABLE_FEATURES.length}</span>` : '—'}</td>
          <td>${_adminDateFmt(r.requested_at)}</td>
          <td>${r.decided_at ? _adminDateFmt(r.decided_at) : '—'}</td>
          <td>
            ${r.status === 'approved'
              ? `<button class="poscalc-accent-btn" onclick="revokeUser('${r.user_id}')">Revoke</button>`
              : `<button class="drawer-secondary-btn" onclick="approveUser('${r.user_id}')">Approve</button>`}
            ${r.status === 'approved'
              ? `<button class="poscalc-accent-btn" onclick="openFeatureAccessModal('${r.user_id}')">Features</button>`
              : ''}
            <button class="poscalc-accent-btn" onclick="toggleAdminRole('${r.user_id}','${r.role}')">${r.role === 'admin' ? 'Make user' : 'Make admin'}</button>
          </td>
        </tr>
      `;
      }).join('')
    : `<tr><td colspan="10" style="color:var(--muted);">${q ? 'No users match your search.' : 'No other users yet.'}</td></tr>`;
}

async function _patchUserAccess(userId, patch){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_access?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json", "Prefer": "return=minimal"
      },
      body: JSON.stringify(patch)
    });
    if(!res.ok) throw new Error(await res.text());
    renderAdminConsole();
  }catch(e){
    console.error("Couldn't update user access:", e);
    await customAlert("Couldn't update — please try again.");
  }
}

function approveUser(userId){
  _patchUserAccess(userId, { status: 'approved', decided_at: new Date().toISOString() });
}
async function rejectUser(userId){
  if(!(await customConfirm('Reject this signup? They will not be able to use the app.', 'Reject'))) return;
  _patchUserAccess(userId, { status: 'rejected', decided_at: new Date().toISOString() });
}
async function revokeUser(userId){
  if(!(await customConfirm("Revoke this user's access? They will be moved back to pending.", 'Revoke'))) return;
  _patchUserAccess(userId, { status: 'pending', decided_at: new Date().toISOString() });
}
async function toggleAdminRole(userId, currentRole){
  const nextRole = currentRole === 'admin' ? 'user' : 'admin';
  if(!(await customConfirm(`Set this user's role to "${nextRole}"?`, 'Confirm'))) return;
  _patchUserAccess(userId, { role: nextRole });
}

let editingFeatureAccessUserId = null;

function openFeatureAccessModal(userId){
  const row = ADMIN_USER_ROWS.find(r => r.user_id === userId);
  if(!row) return;
  editingFeatureAccessUserId = userId;
  const disabled = new Set(row.disabled_features || []);
  document.getElementById('featureAccessList').innerHTML = GATEABLE_FEATURES.map(f => `
    <label><input type="checkbox" data-feature-key="${f.key}" ${disabled.has(f.key) ? '' : 'checked'}> ${f.label}</label>
  `).join('');
  document.getElementById('featureAccessModal').classList.add('open');
}

function closeFeatureAccessModal(){
  document.getElementById('featureAccessModal').classList.remove('open');
  editingFeatureAccessUserId = null;
}

function saveFeatureAccess(){
  if(!editingFeatureAccessUserId) return;
  const disabledFeatures = Array.from(document.querySelectorAll('#featureAccessList [data-feature-key]'))
    .filter(el => !el.checked)
    .map(el => el.dataset.featureKey);
  _patchUserAccess(editingFeatureAccessUserId, { disabled_features: disabledFeatures });
  closeFeatureAccessModal();
}

window.addEventListener('DOMContentLoaded', initApp);

function normalizeTrade(r){
  return {
    position_id: r.position_id,
    open_date: r.open_date ? new Date(r.open_date) : null,
    close_date: r.close_date ? new Date(r.close_date) : (r.open_date ? new Date(r.open_date) : null),
    symbol: r.symbol || "—",
    win_loss: (r.win_loss || "").trim(),
    trade_type: r.trade_type || "—",
    profit_loss: r.profit_loss != null ? parseFloat(r.profit_loss) : 0,
    fee: r.fee != null ? parseFloat(r.fee) : 0,
    pnl_percent: r.pnl_percent != null ? parseFloat(r.pnl_percent) : null,
    rr: r.rr != null ? parseFloat(r.rr) : null,
    entry_price: r.entry_price != null ? parseFloat(r.entry_price) : null,
    close_price: r.close_price != null ? parseFloat(r.close_price) : null,
    position_size: r.position_size != null ? parseFloat(r.position_size) : null,
    trade_setup: r.trade_setup || "Unspecified",
    pattern_type: r.pattern_type || "Unspecified",
    execution_tf: r.execution_tf || "Unspecified",
    exit_type: r.exit_type || "",
    session: r.session || computeSession(r) || "Unspecified",
    day_of_week: r.day_of_week || (r.close_date ? new Date(r.close_date).toLocaleDateString('en-US',{weekday:'long'}) : "Unspecified"),
    emotion: r.emotion || "Unspecified",
    rules_followed: r.rules_followed || "",
    unfollowed_rules: r.unfollowed_rules || "",
    account: r.account || "Unspecified",
    account_type: r.account_type || "",
    notes: r.notes || "",
    link: r.link || ""
  };
}

/* ---------------- Computed fields (mirrors the AppSheet formulas) ---------------- */
function computeObjective(row){
  const open = row.open_date ? new Date(row.open_date) : null;
  const close = row.close_date ? new Date(row.close_date) : null;
  if(!open || !close || isNaN(open) || isNaN(close)) return '';
  const hours = (close - open) / 36e5;
  if(hours < 3) return 'Scalping';
  if(hours < 23) return 'Intraday';
  if(hours < 72) return 'Day Trade';
  return 'Position Trade';
}

function computeDuration(row){
  const open = row.open_date ? new Date(row.open_date) : null;
  const close = row.close_date ? new Date(row.close_date) : null;
  if(!open || !close || isNaN(open) || isNaN(close)) return '';
  const totalMinutes = Math.floor((close - open) / 60000);
  if(totalMinutes < 60) return `${totalMinutes} mins`;
  if(totalMinutes < 1440){
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h} hours` + (m > 0 ? ` ${m} mins` : '');
  }
  const d = Math.floor(totalMinutes / 1440);
  const remH = Math.floor((totalMinutes % 1440) / 60);
  return `${d} days` + (remH > 0 ? ` ${remH} hours` : '');
}

function computeSession(row){
  if(!row.open_date) return '';
  const open = new Date(row.open_date);
  if(isNaN(open)) return '';
  const hour = open.getHours(); // uses the viewer's local timezone
  if(hour >= 4 && hour < 12) return 'Asia';
  if(hour >= 12 && hour < 17) return 'London';
  if(hour >= 17 && hour < 21) return 'London + NY Overlap';
  if(hour >= 21 || hour < 2) return 'New York';
  return 'Low Liquidity';
}

function computeDayOfWeek(row){
  const d = row.close_date ? new Date(row.close_date) : (row.open_date ? new Date(row.open_date) : null);
  if(!d || isNaN(d)) return '';
  return d.toLocaleDateString('en-US', {weekday:'long'});
}

function computeTradeSummary(row){
  const val = (v) => (v === null || v === undefined || v === '') ? '—' : v;
  const money = (v) => { const n = parseFloat(v); return isNaN(n) ? val(v) : fmtMoney(n); };
  const pct = (v) => { const n = parseFloat(v); return isNaN(n) ? val(v) : n.toFixed(2)+'%'; };

  return [
    `<b>Symbol:</b> ${val(row.symbol)}`,
    `<hr>`,
    `<b>Trade Setup Details:</b>`,
    `<hr>`,
    `<b>Trade Setup:</b> ${val(row.trade_setup)}`,
    `<b>Pattern Type:</b> ${val(row.pattern_type)}`,
    `<b>AOF Phase:</b> ${val(row.aof_phase)}`,
    `<b>Execution TF:</b> ${val(row.execution_tf)}`,
    `<b>Objective:</b> ${computeObjective(row) || '—'}`,
    `<b>Trade Type:</b> ${val(row.trade_type)}`,
    ``,
    `<b>Trade Result:</b>`,
    `<hr>`,
    `<b>Result:</b> ${val(row.win_loss)}`,
    `<b>Profit/Loss:</b> ${money(row.profit_loss)}`,
    `<b>PNL Percent:</b> ${pct(row.pnl_percent)}`,
    `<b>Fee:</b> ${money(row.fee)}`,
    `<b>Trade Duration:</b> ${computeDuration(row) || '—'}`,
    ``,
    `<b>Rules Result:</b>`,
    `<hr>`,
    `<b>Rules Followed?:</b> ${val(row.rules_followed)}`,
    `<b>Unfollowed Rules:</b> ${val(row.unfollowed_rules)}`,
    ``,
    `<b>Notes:</b>`,
    `<hr>`,
    val(row.notes)
  ].join('<br>');
}

// Plain-text version of computeTradeSummary() for the copy button — strips
// the <b>/<hr>/<br> markup so it pastes cleanly into TradingView's chat/notes.
function computeTradeSummaryPlain(row){
  return computeTradeSummary(row)
    .replace(/<br>/g, '\n')
    .replace(/<hr>/g, '')
    .replace(/<\/?b>/g, '');
}

function populateAccountFilter(){
  const accounts = [...new Set(ALL_TRADES.map(t => t.account).filter(Boolean))].sort();
  const sel = document.getElementById('accountFilter');
  accounts.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    sel.appendChild(opt);
  });
}

function applyFilters(){
  const range = document.getElementById('rangeFilter').value;
  const acct = document.getElementById('accountFilter').value;
  const now = new Date();

  FILTERED = ALL_TRADES.filter(t => {
    if(acct !== 'all' && t.account !== acct) return false;
    if(!t.close_date) return range === 'all';
    if(range === '30'){
      const cutoff = new Date(); cutoff.setDate(now.getDate()-30);
      return t.close_date >= cutoff;
    }
    if(range === '90'){
      const cutoff = new Date(); cutoff.setDate(now.getDate()-90);
      return t.close_date >= cutoff;
    }
    if(range === 'month'){
      return t.close_date.getMonth() === now.getMonth() && t.close_date.getFullYear() === now.getFullYear();
    }
    return true;
  });

  document.getElementById('tradeCountLabel').textContent = `${FILTERED.length} trade${FILTERED.length===1?'':'s'} in view`;

  renderKPIs();
  renderCalendar();
  renderEquityCurve();
  renderWinLossChart();
  renderDisciplineRadar();
  renderDayOfWeekChart();
  renderSymbolFrequencyChart();
  renderBreakdownTabs();
  renderBreakdown();
  document.getElementById('aiOutput').style.display = 'none';
}

function fmtMoney(n){
  const sign = n < 0 ? "-" : "+";
  return sign + "$" + Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtNum(n, d=2){
  if(n === null || isNaN(n)) return "—";
  return n.toFixed(d);
}

// "2 minutes ago" / "1 hour ago" style relative time, so nothing needs to
// count elapsed minutes by hand.
function timeAgo(date){
  if(!date) return '';
  const seconds = Math.floor((new Date() - date) / 1000);
  if(seconds < 5) return 'just now';
  if(seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if(minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if(hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

/* ---------------- KPIs ---------------- */
function sparklineSVG(values, color){
  if(!values.length) return '';
  const w = 90, h = 26, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const step = values.length > 1 ? (w - pad*2) / (values.length - 1) : 0;
  const points = values.map((v,i) => {
    const x = pad + i*step;
    const y = h - pad - ((v - min) / range) * (h - pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;margin-top:8px;">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderKPIs(){
  const t = FILTERED;
  const wins = t.filter(x => x.win_loss.toLowerCase() === 'win');
  const losses = t.filter(x => x.win_loss.toLowerCase() === 'loss');
  const totalPnl = t.reduce((s,x) => s + (x.profit_loss||0), 0);
  const winRate = t.length ? (wins.length / t.length * 100) : 0;
  const grossWin = wins.reduce((s,x)=> s + Math.max(x.profit_loss,0), 0);
  const grossLoss = Math.abs(losses.reduce((s,x)=> s + Math.min(x.profit_loss,0), 0));
  const profitFactor = grossLoss > 0 ? (grossWin / grossLoss) : (grossWin > 0 ? Infinity : 0);
  const rrVals = t.map(x=>x.rr).filter(x => x !== null && !isNaN(x));
  const avgRR = rrVals.length ? rrVals.reduce((a,b)=>a+b,0)/rrVals.length : null;
  const avgWin = wins.length ? grossWin/wins.length : 0;
  const avgLoss = losses.length ? (losses.reduce((s,x)=>s+x.profit_loss,0)/losses.length) : 0;

  // current streak (most recent trades first)
  const sorted = [...t].filter(x=>x.close_date).sort((a,b)=> b.close_date - a.close_date);
  let streak = 0, streakType = null;
  for(const tr of sorted){
    const wl = tr.win_loss.toLowerCase();
    if(wl !== 'win' && wl !== 'loss') continue;
    if(streakType === null){ streakType = wl; streak = 1; }
    else if(wl === streakType){ streak++; }
    else break;
  }

  const pfDisplay = profitFactor===Infinity ? 100 : Math.min(profitFactor/3*100, 100);
  const rrDisplay = avgRR === null ? 0 : Math.min(Math.max(avgRR,0)/3*100, 100);
  const winBarPct = (Math.abs(avgWin)+Math.abs(avgLoss)) > 0 ? Math.abs(avgWin)/(Math.abs(avgWin)+Math.abs(avgLoss))*100 : 50;
  const feesTotal = t.reduce((s,x)=>s+(x.fee||0),0);
  const feesShare = grossWin > 0 ? Math.min(feesTotal/grossWin*100, 100) : 0;
  const streakIcons = streakType
    ? `<div style="margin-top:10px;font-size:15px;letter-spacing:3px;color:${streakType==='win'?cssVar('--win'):cssVar('--loss')};">${'$'.repeat(Math.min(streak,10))}${streak>10?'+':''}</div>`
    : '';

  // cumulative P/L trend (for the Total PnL sparkline) — last 30 closed trades in view
  const sortedByDate = [...t].filter(x=>x.close_date).sort((a,b)=> a.close_date - b.close_date);
  let cum = 0;
  const pnlTrend = sortedByDate.map(x => (cum += x.profit_loss || 0)).slice(-30);

  const kpis = [
    {label:"Total PnL", value: fmtMoney(totalPnl), cls: totalPnl>=0?'pos':'neg',
      bar: pnlTrend.length > 1 ? sparklineSVG(pnlTrend, totalPnl>=0?cssVar('--win'):cssVar('--loss')) : ''},
    {label:"Win rate", value: fmtNum(winRate,1)+"%", cls:'',
      bar: `<div class="kpi-dual-bar"><div style="width:${winRate}%;background:${cssVar('--win')};"></div><div style="width:${100-winRate}%;background:${cssVar('--loss')};"></div></div>`},
    {label:"Profit factor", value: profitFactor===Infinity?"∞":fmtNum(profitFactor,2), cls:'',
      bar: `<div class="kpi-dual-bar"><div style="width:${pfDisplay}%;background:${cssVar('--win')};"></div><div style="width:${100-pfDisplay}%;background:${cssVar('--loss')};"></div></div>`},
    {label:"Avg RR", value: avgRR===null?"—":fmtNum(avgRR,2), cls:'',
      bar: `<div class="kpi-dual-bar"><div style="width:${rrDisplay}%;background:${cssVar('--win')};"></div><div style="width:${100-rrDisplay}%;background:${cssVar('--loss')};"></div></div>`},
    {label:"Total trades", value: t.length, cls:'',
      bar: t.length ? `<div style="margin-top:8px;font-size:11px;color:var(--muted);">${wins.length} win${wins.length!==1?'s':''} · ${losses.length} loss${losses.length!==1?'es':''}</div>` : ''},
    {label:"Avg win / loss", value: fmtMoney(avgWin).replace('+','')+" / "+fmtMoney(avgLoss), cls:'',
      bar: `<div class="kpi-dual-bar"><div style="width:${winBarPct}%;background:${cssVar('--win')};"></div><div style="width:${100-winBarPct}%;background:${cssVar('--loss')};"></div></div>`},
    {label:"Current streak", value: streakType ? `${streak} ${streakType}${streak>1?'s':''}` : "—", cls: streakType==='win'?'pos':(streakType==='loss'?'neg':''),
      bar: streakIcons},
    {label:"Fees paid", value: "$"+fmtNum(feesTotal,2), cls:'',
      bar: `<div class="kpi-bar"><div class="kpi-bar-fill" style="width:${feesShare}%;background:${cssVar('--warn')};"></div></div><div style="margin-top:6px;font-size:10.5px;color:var(--muted);">${fmtNum(feesShare,1)}% of gross win</div>`}
  ];

  document.getElementById('kpiGrid').innerHTML = kpis.map(k =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.cls}">${k.value}</div>${k.bar||''}</div>`
  ).join('');
}

/* ---------------- Calendar ---------------- */
function shiftMonth(dir){
  calMonth.setMonth(calMonth.getMonth() + dir);
  renderCalendar();
}

function renderCalendar(){
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  document.getElementById('calLabel').textContent = calMonth.toLocaleDateString('en-US',{month:'long', year:'numeric'});

  const byDay = {};
  FILTERED.forEach(t => {
    if(!t.close_date) return;
    if(t.close_date.getFullYear() !== y || t.close_date.getMonth() !== m) return;
    const key = t.close_date.getDate();
    if(!byDay[key]) byDay[key] = {pnl:0, count:0, trades:[]};
    byDay[key].pnl += t.profit_loss || 0;
    byDay[key].count += 1;
    byDay[key].trades.push(t);
  });

  let bestDay = null, bestPnl = -Infinity;
  Object.entries(byDay).forEach(([d,v]) => { if(v.pnl > bestPnl){ bestPnl = v.pnl; bestDay = d; } });

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();

  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = dows.map(d=>`<div class="cal-dow">${d}</div>`).join('') + `<div class="cal-dow" style="color:var(--accent);">Week</div>`;

  // build a flat list of cells (nulls = blank), padded so it splits evenly into rows of 7
  const cells = [];
  for(let i=0;i<firstDow;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(d);
  while(cells.length % 7 !== 0) cells.push(null);

  window._calByWeek = [];

  for(let i=0; i<cells.length; i+=7){
    const weekCells = cells.slice(i, i+7);

    let weekPnl = 0, weekCount = 0, weekTrades = [];
    weekCells.forEach(d => {
      if(d === null) return;
      const info = byDay[d];
      if(info){ weekPnl += info.pnl; weekCount += info.count; weekTrades = weekTrades.concat(info.trades); }
    });

    weekCells.forEach(d => {
      if(d === null){ html += `<div class="cal-cell empty"></div>`; return; }
      const info = byDay[d];
      let cls = '', pnlHtml = '', click = '';
      if(info){
        cls = info.pnl >= 0 ? 'win' : 'loss';
        if(String(d) === bestDay) cls += ' best';
        pnlHtml = `<div class="p">${fmtMoney(info.pnl)}</div><div style="font-size:10.5px;color:var(--muted);">${info.count} trade${info.count>1?'s':''}</div>`;
        click = `onclick="showDayTrades(${y}, ${m}, ${d})"`;
      }
      html += `<div class="cal-cell ${cls}" ${click}><div class="d">${d}</div>${pnlHtml}</div>`;
    });

    // weekly summary cell
    const wkCls = weekCount > 0 ? (weekPnl >= 0 ? 'win' : 'loss') : '';
    const wkBody = weekCount > 0
      ? `<div class="p">${fmtMoney(weekPnl)}</div><div style="font-size:10.5px;color:var(--muted);">${weekCount} trade${weekCount>1?'s':''}</div>`
      : `<div style="font-size:10.5px;color:var(--muted);">—</div>`;
    const weekIdx = window._calByWeek.length;
    window._calByWeek.push({trades: weekTrades, pnl: weekPnl, count: weekCount, days: weekCells.filter(d => d !== null)});
    const wkClick = weekCount > 0 ? `onclick="showWeekTrades(${weekIdx})"` : '';
    html += `<div class="cal-cell week-cell ${wkCls}" ${wkClick}><div class="d" style="color:var(--accent);">Σ</div>${wkBody}</div>`;
  }

  document.getElementById('calGrid').innerHTML = html;
  window._calByDay = byDay;
}

/* ---------------- Equity curve ---------------- */
function renderEquityCurve(){
  const sorted = [...FILTERED].filter(t=>t.close_date).sort((a,b)=> a.close_date - b.close_date);
  let cum = 0;
  const labels = [], values = [];
  sorted.forEach(t => {
    cum += t.profit_loss || 0;
    labels.push(t.close_date.toLocaleDateString('en-US',{month:'short', day:'numeric'}));
    values.push(cum);
  });

  const ctx = document.getElementById('equityChart').getContext('2d');
  if(equityChartRef) equityChartRef.destroy();

  if(values.length === 0){
    ctx.canvas.parentElement.querySelector('canvas').style.display='none';
    return;
  }

  const finalVal = values[values.length-1];
  const lineColor = finalVal >= 0 ? cssVar('--win') : cssVar('--loss');
  const segColor = (ctx) => (ctx.p0.parsed.y < 0 || ctx.p1.parsed.y < 0) ? cssVar('--loss') : cssVar('--win');

  // Fades win color from the top down to the zero line, then loss color
  // fading back out from zero down to the bottom — matches the "green above
  // zero, red below" look, without needing per-segment clip gradients.
  const zeroFadeGradient = (context) => {
    const {chart} = context;
    const {ctx: c, chartArea, scales} = chart;
    if(!chartArea || !(chartArea.bottom > chartArea.top)) return lineColor + '22';
    const winColor = cssVar('--win'), lossColor = cssVar('--loss');
    const yZero = scales?.y?.getPixelForValue ? scales.y.getPixelForValue(0) : NaN;
    if(!Number.isFinite(yZero)) return lineColor + '22';
    const zeroRatio = Math.min(1, Math.max(0, (yZero - chartArea.top) / (chartArea.bottom - chartArea.top)));
    const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, winColor + '55');
    gradient.addColorStop(Math.max(0, zeroRatio - 0.001), winColor + '05');
    gradient.addColorStop(Math.min(1, zeroRatio + 0.001), lossColor + '05');
    gradient.addColorStop(1, lossColor + '55');
    return gradient;
  };

  equityChartRef = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: lineColor,
          backgroundColor: zeroFadeGradient,
          segment: { borderColor: segColor },
          fill: 'origin',
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
          order: 1
        },
        {
          // dotted zero-reference line
          data: labels.map(() => 0),
          borderColor: cssVar('--muted'),
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          order: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display:false },
        tooltip: {
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (ctx) => 'Cumulative P/L: ' + fmtMoney(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: { display: labels.length < 25, ticks:{color:cssVar('--muted'), font:{size:10}}, grid:{color:cssVar('--rule')} },
        y: { ticks:{color:cssVar('--muted'), font:{size:10}, callback:v=>'$'+v}, grid:{color:cssVar('--rule')} }
      }
    }
  });
}

/* ---------------- Win / Loss donut ---------------- */
function renderWinLossChart(){
  const ctx = document.getElementById('winLossChart').getContext('2d');
  if(winLossChartRef) winLossChartRef.destroy();

  if(FILTERED.length === 0){
    document.getElementById('winLossLegend').innerHTML = `<div class="empty-state">No trades in view.</div>`;
    return;
  }

  // tally every distinct value actually present in win_loss
  const counts = {};
  FILTERED.forEach(t => {
    const v = (t.win_loss || '').trim() || 'Unspecified';
    counts[v] = (counts[v] || 0) + 1;
  });

  const knownColors = {
    'Win': cssVar('--win'),
    'Loss': cssVar('--loss'),
    'Breakeven': cssVar('--info'),
    'Liquidated': cssVar('--warn')
  };
  const preferredOrder = ['Win','Loss','Breakeven','Liquidated'];

  const labels = [], dataVals = [], colors = [];
  preferredOrder.forEach(k => {
    if(counts[k]){ labels.push(k); dataVals.push(counts[k]); colors.push(knownColors[k]); delete counts[k]; }
  });
  // anything left over (unexpected values) — still shown by name, not lumped as "Other"
  Object.entries(counts).forEach(([k,v]) => { labels.push(k); dataVals.push(v); colors.push(cssVar('--muted')); });

  winLossChartRef = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: dataVals, backgroundColor: colors, borderColor: cssVar('--surface'), borderWidth: 3 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: { legend: { display:false } }
    }
  });

  const total = FILTERED.length;
  document.getElementById('winLossLegend').innerHTML = labels.map((label, i) => `
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
      <span><span style="color:${colors[i]};">●</span> ${label}</span>
      <span class="num">${dataVals[i]} (${fmtNum(dataVals[i]/total*100,1)}%)</span>
    </div>
  `).join('');
}

/* ---------------- Discipline radar ---------------- */
function renderDisciplineRadar(){
  const ctx = document.getElementById('disciplineRadar').getContext('2d');
  if(disciplineRadarRef) disciplineRadarRef.destroy();

  const t = FILTERED;
  if(t.length === 0){
    const scoreValueEl = document.getElementById('disciplineScoreValue');
    const scoreMarkerEl = document.getElementById('disciplineScoreMarker');
    const scoreTagEl = document.getElementById('disciplineScoreTag');
    if(scoreValueEl) scoreValueEl.textContent = '—';
    if(scoreMarkerEl) scoreMarkerEl.style.left = '0%';
    if(scoreTagEl){ scoreTagEl.textContent = ''; scoreTagEl.className = 'discipline-score-tag'; }
    return;
  }

  const wins = t.filter(x => x.win_loss.toLowerCase() === 'win').length;
  const winRate = t.length ? (wins/t.length*100) : 0;

  const followed = t.filter(x => x.unfollowed_rules.trim().toLowerCase() === 'rules followed').length;
  const broken = t.filter(x => x.unfollowed_rules.trim() !== '' && x.unfollowed_rules.trim().toLowerCase() !== 'rules followed').length;
  const disciplineTotal = followed + broken;
  const disciplinePct = disciplineTotal ? (followed/disciplineTotal*100) : 0;

  const rrVals = t.map(x=>x.rr).filter(x => x !== null && !isNaN(x));
  const avgRR = rrVals.length ? rrVals.reduce((a,b)=>a+b,0)/rrVals.length : 0;
  const rewardScore = Math.min(Math.max(avgRR,0)/3*100, 100);

  const grossWin = t.filter(x=>x.win_loss.toLowerCase()==='win').reduce((s,x)=>s+Math.max(x.profit_loss,0),0);
  const grossLoss = Math.abs(t.filter(x=>x.win_loss.toLowerCase()==='loss').reduce((s,x)=>s+Math.min(x.profit_loss,0),0));
  const profitFactor = grossLoss > 0 ? (grossWin/grossLoss) : (grossWin > 0 ? 3 : 0);
  const consistencyScore = Math.min(profitFactor/3*100, 100);

  const badExits = t.filter(x => {
    const et = (x.exit_type||'').toLowerCase();
    const wl = (x.win_loss||'').toLowerCase();
    return et === 'sl hit' || wl === 'liquidated';
  }).length;
  const riskControlScore = t.length ? Math.max(0, 100 - (badExits/t.length*100)) : 0;

  const disciplineScore = (winRate + disciplinePct + rewardScore + consistencyScore + riskControlScore) / 5;
  const scoreValueEl = document.getElementById('disciplineScoreValue');
  const scoreMarkerEl = document.getElementById('disciplineScoreMarker');
  const scoreTagEl = document.getElementById('disciplineScoreTag');
  if(scoreValueEl) scoreValueEl.textContent = disciplineScore.toFixed(1);
  if(scoreMarkerEl) scoreMarkerEl.style.left = `${Math.max(0, Math.min(100, disciplineScore))}%`;
  if(scoreTagEl){
    const tier = disciplineScore >= 80 ? {label:'Excellent', cls:'tag-excellent'}
      : disciplineScore >= 60 ? {label:'Good', cls:'tag-good'}
      : disciplineScore >= 40 ? {label:'Average', cls:'tag-average'}
      : disciplineScore >= 20 ? {label:'Needs Work', cls:'tag-needswork'}
      : {label:'Poor', cls:'tag-poor'};
    scoreTagEl.textContent = tier.label;
    scoreTagEl.className = 'discipline-score-tag ' + tier.cls;
  }

  disciplineRadarRef = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Win Rate','Discipline','Reward (RR)','Consistency (PF)','Risk Control'],
      datasets: [{
        data: [winRate, disciplinePct, rewardScore, consistencyScore, riskControlScore],
        backgroundColor: cssVar('--accent') + '33',
        borderColor: cssVar('--accent'),
        borderWidth: 1,
        pointBackgroundColor: cssVar('--accent'),
        pointBorderColor: cssVar('--surface'),
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { display:false, stepSize:20 },
          grid: { color: cssVar('--rule') },
          angleLines: { color: cssVar('--rule') },
          pointLabels: { color: cssVar('--ink'), font:{size:11} }
        }
      },
      plugins: {
        legend: { display:false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const explanations = {
                'Win Rate': `${wins} win${wins!==1?'s':''} out of ${t.length} trade${t.length!==1?'s':''} in view (wins ÷ total).`,
                'Discipline': disciplineTotal
                  ? `${followed} "Rules Followed" out of ${disciplineTotal} trade${disciplineTotal!==1?'s':''} with a discipline note logged.`
                  : 'No discipline notes logged yet — log "Rules Followed" or an unfollowed rule per trade to fill this in.',
                'Reward (RR)': rrVals.length
                  ? `Average RR is ${avgRR.toFixed(2)} across ${rrVals.length} trade${rrVals.length!==1?'s':''} with RR logged — scaled so 3.0+ RR = 100.`
                  : 'No RR logged on any trade in view yet.',
                'Consistency (PF)': `Profit factor is ${profitFactor===Infinity?'∞':profitFactor.toFixed(2)} — gross win ${fmtMoney(grossWin)} ÷ gross loss ${fmtMoney(grossLoss)}, scaled so PF 3.0+ = 100.`,
                'Risk Control': `${badExits} of ${t.length} trade${t.length!==1?'s':''} hit stop-loss or were liquidated (100 minus that %).`
              };
              const label = ctx.label;
              const val = ctx.parsed.r;
              const lines = [`${label}: ${val.toFixed(0)} / 100`];
              if(explanations[label]) lines.push(explanations[label]);
              return lines;
            }
          }
        }
      }
    }
  });
}

/* ---------------- Day of week performance ---------------- */
function renderDayOfWeekChart(){
  const canvas = document.getElementById('dayOfWeekChart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(dayOfWeekChartRef) dayOfWeekChartRef.destroy();

  const order = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const sums = {};
  order.forEach(d => sums[d] = {pnl:0, count:0});

  FILTERED.forEach(t => {
    const raw = (t.day_of_week || '').trim();
    const match = order.find(d => d.toLowerCase() === raw.toLowerCase());
    if(match){ sums[match].pnl += t.profit_loss || 0; sums[match].count += 1; }
  });

  const labels = order.map(d => d.slice(0,3));
  const values = order.map(d => sums[d].pnl);
  const colors = values.map(v => v >= 0 ? cssVar('--win') : cssVar('--loss'));

  dayOfWeekChartRef = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, maxBarThickness: 34 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if(elements.length) showCategoryTrades('day_of_week', order[elements[0].index]);
      },
      onHover: (evt, elements) => { canvas.style.cursor = elements.length ? 'pointer' : 'default'; },
      plugins: { legend: { display:false } },
      scales: {
        x: { ticks:{color:cssVar('--muted'), font:{size:10.5}}, grid:{display:false} },
        y: { ticks:{color:cssVar('--muted'), font:{size:10}, callback:v=>'$'+v}, grid:{color:cssVar('--rule')} }
      }
    }
  });
}

/* ---------------- Most traded symbols ---------------- */
function renderSymbolFrequencyChart(){
  const canvas = document.getElementById('symbolFrequencyChart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(symbolFrequencyChartRef) symbolFrequencyChartRef.destroy();

  const counts = {};
  FILTERED.forEach(t => {
    const key = t.symbol || 'Unspecified';
    counts[key] = (counts[key] || 0) + 1;
  });

  const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 8);
  const labels = top.map(([k]) => k);
  const values = top.map(([,v]) => v);

  if(labels.length === 0) return;

  symbolFrequencyChartRef = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: cssVar('--accent'), borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if(elements.length) showCategoryTrades('symbol', labels[elements[0].index]);
      },
      onHover: (evt, elements) => { canvas.style.cursor = elements.length ? 'pointer' : 'default'; },
      plugins: { legend: { display:false } },
      scales: {
        x: { ticks:{color:cssVar('--muted'), font:{size:10}}, grid:{color:cssVar('--rule')} },
        y: { ticks:{color:cssVar('--ink'), font:{size:11}}, grid:{display:false} }
      }
    }
  });
}

/* ---------------- Modal / clickable drill-down ---------------- */
function closeModal(){
  document.getElementById('tradeModal').classList.remove('open');
}

function renderTradeCards(trades){
  if(!trades.length) return `<div class="empty-state">No trades here.</div>`;

  const sorted = [...trades].sort((a,b) => (b.close_date||0) - (a.close_date||0));

  return sorted.map(t => {
    const isWin = t.win_loss.toLowerCase() === 'win';
    const dotCls = isWin ? 'win' : (t.win_loss.toLowerCase()==='loss' ? 'loss' : 'be');
    const dateStr = t.close_date ? t.close_date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
    return `
      <div class="trade-card">
        <div class="tc-top">
          <span class="tc-symbol"><span class="tc-dot ${dotCls}"></span>${t.symbol} <span style="color:var(--muted);font-weight:400;">${t.trade_type}</span></span>
          <span class="tc-pnl ${t.profit_loss>=0?'pos':'neg'}">${fmtMoney(t.profit_loss)}</span>
        </div>
        <div class="tc-meta">
          <span>${dateStr}</span>
          ${t.trade_setup && t.trade_setup!=='Unspecified' ? `<span>${t.trade_setup}</span>` : ''}
          ${t.session && t.session!=='Unspecified' ? `<span>${t.session}</span>` : ''}
          ${t.rr!==null && !isNaN(t.rr) ? `<span>RR ${fmtNum(t.rr,2)}</span>` : ''}
          ${t.emotion && t.emotion!=='Unspecified' ? `<span>${t.emotion}</span>` : ''}
        </div>
        ${t.unfollowed_rules ? `<div class="tc-notes" style="color:var(--loss);">${t.unfollowed_rules}</div>` : ''}
        ${t.notes ? `<div class="tc-notes">${t.notes}</div>` : ''}
        ${t.link ? `<div style="margin-top:6px;"><a href="${t.link}" target="_blank" style="color:var(--accent);font-size:11.5px;">View →</a></div>` : ''}
      </div>
    `;
  }).join('');
}

function showDayTrades(y, m, d){
  const info = window._calByDay ? window._calByDay[d] : null;
  const trades = info ? info.trades : [];
  const dateLabel = new Date(y, m, d).toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric', year:'numeric'});

  document.getElementById('modalTitle').textContent = dateLabel;
  const pnl = trades.reduce((s,t)=>s+t.profit_loss,0);
  document.getElementById('modalSub').textContent = `${trades.length} trade${trades.length===1?'':'s'} · ${fmtMoney(pnl)}`;
  document.getElementById('modalBody').innerHTML = renderTradeCards(trades);
  document.getElementById('tradeModal').classList.add('open');
}

function showWeekTrades(weekIdx){
  const week = window._calByWeek ? window._calByWeek[weekIdx] : null;
  if(!week || !week.trades.length) return;

  const days = [...week.days].sort((a,b) => a-b);
  const monthLabel = calMonth.toLocaleDateString('en-US',{month:'long', year:'numeric'});
  const rangeLabel = days.length > 1 ? `${days[0]}–${days[days.length-1]} ${monthLabel}` : `${days[0]} ${monthLabel}`;

  document.getElementById('modalTitle').textContent = `Week Summary — ${rangeLabel}`;
  document.getElementById('modalSub').textContent = `${week.count} trade${week.count===1?'':'s'} · ${fmtMoney(week.pnl)}`;
  document.getElementById('modalBody').innerHTML = renderTradeCards(week.trades);
  document.getElementById('tradeModal').classList.add('open');
}

function showCategoryTrades(field, key){
  const trades = FILTERED.filter(t => (t[field] || 'Unspecified').toString().toLowerCase() === key.toLowerCase());
  const pnl = trades.reduce((s,t)=>s+t.profit_loss,0);

  document.getElementById('modalTitle').textContent = key;
  document.getElementById('modalSub').textContent = `${trades.length} trade${trades.length===1?'':'s'} · ${fmtMoney(pnl)}`;
  document.getElementById('modalBody').innerHTML = renderTradeCards(trades);
  document.getElementById('tradeModal').classList.add('open');
}

function showDisciplineTrades(kind){
  const trades = kind === 'followed'
    ? FILTERED.filter(t => t.unfollowed_rules.trim().toLowerCase() === 'rules followed')
    : FILTERED.filter(t => t.unfollowed_rules.trim() !== '' && t.unfollowed_rules.trim().toLowerCase() !== 'rules followed');
  const pnl = trades.reduce((s,t)=>s+t.profit_loss,0);

  document.getElementById('modalTitle').textContent = kind === 'followed' ? 'Rules followed' : 'Rules broken';
  document.getElementById('modalSub').textContent = `${trades.length} trade${trades.length===1?'':'s'} · ${fmtMoney(pnl)}`;
  document.getElementById('modalBody').innerHTML = renderTradeCards(trades);
  document.getElementById('tradeModal').classList.add('open');
}

/* ---------------- Breakdown ---------------- */
const BREAKDOWN_FIELDS = [
  {key:'symbol', label:'Symbol'},
  {key:'trade_setup', label:'Setup'},
  {key:'pattern_type', label:'Pattern'},
  {key:'session', label:'Session'},
  {key:'day_of_week', label:'Day of week'},
];

function renderBreakdownTabs(){
  document.getElementById('breakdownTabs').innerHTML = BREAKDOWN_FIELDS.map(f =>
    `<div class="tab ${f.key===activeTab?'active':''}" onclick="setTab('${f.key}')">${f.label}</div>`
  ).join('') + `<div class="tab ${activeTab==='discipline'?'active':''}" onclick="setTab('discipline')">Discipline</div>`;
}

function setTab(key){
  activeTab = key;
  renderBreakdownTabs();
  renderBreakdown();
}

function renderBreakdown(){
  const body = document.getElementById('breakdownBody');

  if(activeTab === 'discipline'){
    const followed = FILTERED.filter(t => t.unfollowed_rules.trim().toLowerCase() === 'rules followed');
    const broken = FILTERED.filter(t => t.unfollowed_rules.trim() !== '' && t.unfollowed_rules.trim().toLowerCase() !== 'rules followed');
    const brokenPnl = broken.reduce((s,x)=>s+x.profit_loss,0);
    const followedPnl = followed.reduce((s,x)=>s+x.profit_loss,0);

    // tally common broken-rule phrases (excludes the "Rules Followed" marker itself)
    const tally = {};
    broken.forEach(t => {
      t.unfollowed_rules.split(/[,;]/).map(s=>s.trim()).filter(Boolean)
        .filter(r => r.toLowerCase() !== 'rules followed')
        .forEach(rule => { tally[rule] = (tally[rule]||0) + 1; });
    });
    const topRules = Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,6);

    renderBarChart(
      ['Rules followed','Rules broken'],
      [followedPnl, brokenPnl],
      [cssVar('--win'), cssVar('--loss')],
      (idx) => showDisciplineTrades(idx === 0 ? 'followed' : 'broken')
    );

    body.innerHTML = `
      <table class="breakdown">
        <tr><th></th><th>Trades</th><th>Total PnL</th><th>Win rate</th></tr>
        <tr onclick="showDisciplineTrades('followed')">
          <td style="font-family:'Public Sans',sans-serif;">Rules followed</td>
          <td>${followed.length}</td>
          <td class="${followedPnl>=0?'pos':'neg'}">${fmtMoney(followedPnl)}</td>
          <td>${followed.length ? fmtNum(followed.filter(t=>t.win_loss.toLowerCase()==='win').length/followed.length*100,1)+'%' : '—'}</td>
        </tr>
        <tr onclick="showDisciplineTrades('broken')">
          <td style="font-family:'Public Sans',sans-serif;">Rules broken</td>
          <td>${broken.length}</td>
          <td class="${brokenPnl>=0?'pos':'neg'}">${fmtMoney(brokenPnl)}</td>
          <td>${broken.length ? fmtNum(broken.filter(t=>t.win_loss.toLowerCase()==='win').length/broken.length*100,1)+'%' : '—'}</td>
        </tr>
      </table>
      ${topRules.length ? `<div style="margin-top:16px;font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Most common breaks</div>
      <table class="breakdown">${topRules.map(([rule,count])=>`<tr style="cursor:default;"><td style="font-family:'Public Sans',sans-serif;">${rule}</td><td>${count}×</td></tr>`).join('')}</table>` : ''}
    `;
    return;
  }

  const groups = {};
  FILTERED.forEach(t => {
    const key = t[activeTab] || 'Unspecified';
    if(!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const rows = Object.entries(groups).map(([key, trades]) => {
    const pnl = trades.reduce((s,x)=>s+x.profit_loss,0);
    const wins = trades.filter(t=>t.win_loss.toLowerCase()==='win').length;
    const winRate = trades.length ? (wins/trades.length*100) : 0;
    const rrVals = trades.map(t=>t.rr).filter(v=>v!==null && !isNaN(v));
    const avgRR = rrVals.length ? rrVals.reduce((a,b)=>a+b,0)/rrVals.length : null;
    return {key, count: trades.length, pnl, winRate, avgRR};
  }).sort((a,b) => b.pnl - a.pnl);

  if(rows.length === 0){
    body.innerHTML = `<div class="empty-state">No data for this breakdown yet.</div>`;
    if(breakdownChartRef) breakdownChartRef.destroy();
    return;
  }

  const topRows = rows.slice(0, 10);
  renderBarChart(
    topRows.map(r => r.key),
    topRows.map(r => r.pnl),
    topRows.map(r => r.pnl >= 0 ? cssVar('--win') : cssVar('--loss')),
    (idx) => showCategoryTrades(activeTab, topRows[idx].key)
  );

  body.innerHTML = `
    <table class="breakdown">
      <tr><th>${BREAKDOWN_FIELDS.find(f=>f.key===activeTab)?.label||''}</th><th>Trades</th><th>Win rate</th><th>Avg RR</th><th>Total PnL</th></tr>
      ${rows.map(r => `
        <tr onclick="showCategoryTrades('${activeTab}', ${JSON.stringify(r.key)})">
          <td style="font-family:'Public Sans',sans-serif;">${r.key}</td>
          <td>${r.count}</td>
          <td>${fmtNum(r.winRate,1)}%</td>
          <td>${r.avgRR===null?'—':fmtNum(r.avgRR,2)}</td>
          <td class="${r.pnl>=0?'pos':'neg'}">${fmtMoney(r.pnl)}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

function renderBarChart(labels, values, colors, onClick){
  const canvas = document.getElementById('breakdownChart');
  const ctx = canvas.getContext('2d');
  if(breakdownChartRef) breakdownChartRef.destroy();

  breakdownChartRef = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        maxBarThickness: 34
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      onClick: (evt, elements) => {
        if(elements.length && onClick) onClick(elements[0].index);
      },
      onHover: (evt, elements) => {
        canvas.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: { legend: { display:false } },
      scales: {
        x: { ticks:{color:cssVar('--muted'), font:{size:10}, callback:v=>'$'+v}, grid:{color:cssVar('--rule')} },
        y: { ticks:{color:cssVar('--ink'), font:{size:11}}, grid:{display:false} }
      }
    }
  });
}

/* ---------------- Journal table ---------------- */
const FIELD_OPTIONS = {
  win_loss: ['Loss','Win','Breakeven','Liquidated'],
  trade_type: ['Short','Long'],
  trade_setup: ['Bounce Play','Rejection Play','Invalidation Play'],
  pattern_type: ['5 mins HL','5 mins LH','15 mins HL','15 mins LH','1 hour HL','1 hour LH','30 mins Invalidation Play','4 Hour HL','4 Hour LH'],
  execution_tf: ['1 min','3 min','5 min','15 min','30 min','1 hr'],
  aof_phase: ['IC','EM','LM','Extended Movement','Invalidation','5 mins Scalping'],
  rules_followed: ['Yes','No'],
  account_type: ['Demo','Evaluation','Funded'],
  exit_type: ['Manual Early TP - Valid','Manual Early TP - Invalid','Stop Profit','TP Hit','SL Hit','Cut Loss'],
  post_be_result: ['TP After BE','SL After BE','N/A'],
  account: ['10k','25k','50k','100k','200k','Demo'],
  session: ['Asia','London','London + NY Overlap','New York','Low Liquidity'],
  day_of_week: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
};

const UNFOLLOWED_RULES_OPTIONS = [
  'Rules Followed','Early TP','Entered Early','Overleveraged','No Confirmation','Moved Stop Loss',
  'Revenge Trade','Ignored Trend','FOMO Entry','No BE at Prev High/Low','Ignored No-Trade Decision',
  'Non-BnB Setup','No Scalping Trade','Moved Take Profit','Lack of Confluence','BTC Only'
];

const OPTIONS_FIELD_META = [
  {key:'win_loss', label:'Win/Loss'},
  {key:'trade_type', label:'Trade Type'},
  {key:'trade_setup', label:'Trade Setup'},
  {key:'pattern_type', label:'Pattern Type'},
  {key:'execution_tf', label:'Execution TF'},
  {key:'aof_phase', label:'AOF Phase'},
  {key:'rules_followed', label:'Rules Followed?'},
  {key:'account_type', label:'Account Type'},
  {key:'exit_type', label:'Exit Type'},
  {key:'post_be_result', label:'Post-BE Result'},
  {key:'session', label:'Session'},
  {key:'day_of_week', label:'Day of Week'},
  {key:'unfollowed_rules', label:'Unfollowed Rules (checklist)'}
];

function getOptionsArray(key){
  return key === 'unfollowed_rules' ? UNFOLLOWED_RULES_OPTIONS : FIELD_OPTIONS[key];
}

function saveOptionsConfig(){
  try{
    localStorage.setItem('ledger-field-options', JSON.stringify(FIELD_OPTIONS));
    localStorage.setItem('ledger-unfollowed-rules-options', JSON.stringify(UNFOLLOWED_RULES_OPTIONS));
  }catch(e){}
  syncUIPrefsToProfile();
}

function loadOptionsConfig(){
  try{
    const savedFieldOpts = JSON.parse(localStorage.getItem('ledger-field-options') || 'null');
    if(savedFieldOpts){
      Object.keys(savedFieldOpts).forEach(k => {
        if(FIELD_OPTIONS[k]){
          FIELD_OPTIONS[k].length = 0;
          FIELD_OPTIONS[k].push(...savedFieldOpts[k]);
        }
      });
    }
    const savedUnfollowed = JSON.parse(localStorage.getItem('ledger-unfollowed-rules-options') || 'null');
    if(savedUnfollowed){
      UNFOLLOWED_RULES_OPTIONS.length = 0;
      UNFOLLOWED_RULES_OPTIONS.push(...savedUnfollowed);
    }
  }catch(e){}
}

function renderOptionsEditor(){
  const picker = document.getElementById('optionsFieldPicker');
  if(!picker) return;
  if(!picker.dataset.filled){
    picker.innerHTML = OPTIONS_FIELD_META.map(f => `<option value="${f.key}">${f.label}</option>`).join('');
    picker.dataset.filled = '1';
  }
  renderOptionsListFor(picker.value);
}

function renderOptionsListFor(key){
  const arr = getOptionsArray(key) || [];
  const list = document.getElementById('optionsList');
  if(!list) return;
  list.innerHTML = arr.map((opt, i) => `
    <div class="config-option-row">
      <span>${opt}</span>
      <button onclick="removeOption('${key}', ${i})" title="Remove">✕</button>
    </div>
  `).join('') || `<div class="empty-state" style="padding:12px 0;">No options yet.</div>`;
}

function addOption(){
  const picker = document.getElementById('optionsFieldPicker');
  const input = document.getElementById('newOptionInput');
  const key = picker.value;
  const val = input.value.trim();
  if(!val) return;
  const arr = getOptionsArray(key);
  if(!arr || arr.includes(val)){ input.value = ''; return; }
  arr.push(val); // mutated in place so DRAWER_FIELDS' captured references stay in sync
  input.value = '';
  saveOptionsConfig();
  renderOptionsListFor(key);
}

function removeOption(key, index){
  const arr = getOptionsArray(key);
  if(!arr) return;
  arr.splice(index, 1);
  saveOptionsConfig();
  renderOptionsListFor(key);
}

// widget: 'text' | 'number' | 'date' | 'select' | 'checklist' | 'textarea'
// editable: true = this field gets its widget in VIEW mode too (an "Easy Edit" field).
//           In CREATE mode, every field renders its widget regardless of `editable`.
const ALL_DRAWER_FIELDS = [
  {key:'symbol', label:'Symbol', widget:'text', editable:false},
  {key:'open_date', label:'Open Date', widget:'date', editable:false},
  {key:'close_date', label:'Close Date', widget:'date', editable:false},
  {key:'duration', label:'Duration', widget:'text', editable:false},
  {key:'objective', label:'Objective', widget:'text', editable:false},
  {key:'profit_loss', label:'Profit/Loss', widget:'number', editable:true},
  {key:'pnl_percent', label:'PNL Percent', widget:'number', editable:true},
  {key:'fee', label:'Fee', widget:'number', editable:false},
  {key:'rr', label:'RR', widget:'number', editable:false},
  {key:'entry_price', label:'Entry Price', widget:'number', editable:true},
  {key:'close_price', label:'Close Price', widget:'number', editable:true},
  {key:'position_size', label:'Position Size', widget:'number', editable:true},
  {key:'win_loss', label:'Win/Loss', widget:'select', editable:true, options:FIELD_OPTIONS.win_loss},
  {key:'trade_type', label:'Trade Type', widget:'select', editable:true, options:FIELD_OPTIONS.trade_type},
  {key:'trade_setup', label:'Trade Setup', widget:'select', editable:true, options:FIELD_OPTIONS.trade_setup},
  {key:'pattern_type', label:'Pattern Type', widget:'select', editable:true, options:FIELD_OPTIONS.pattern_type},
  {key:'execution_tf', label:'Execution TF', widget:'select', editable:true, options:FIELD_OPTIONS.execution_tf},
  {key:'aof_phase', label:'AOF Phase', widget:'select', editable:true, options:FIELD_OPTIONS.aof_phase},
  {key:'rules_followed', label:'Rules Followed?', widget:'select', editable:true, options:FIELD_OPTIONS.rules_followed},
  {key:'unfollowed_rules', label:'Unfollowed Rules', widget:'checklist', editable:true, options:UNFOLLOWED_RULES_OPTIONS},
  {key:'exit_type', label:'Exit Type', widget:'select', editable:true, options:FIELD_OPTIONS.exit_type},
  {key:'post_be_result', label:'Post-BE Result', widget:'select', editable:true, options:FIELD_OPTIONS.post_be_result},
  {key:'account', label:'Account', widget:'select', editable:true, options:FIELD_OPTIONS.account},
  {key:'account_type', label:'Account Type', widget:'select', editable:true, options:FIELD_OPTIONS.account_type},
  {key:'session', label:'Session', widget:'select', editable:true, options:FIELD_OPTIONS.session},
  {key:'day_of_week', label:'Day of Week', widget:'select', editable:true, options:FIELD_OPTIONS.day_of_week},
  {key:'notes', label:'Notes', widget:'textarea', editable:true},
  {key:'link', label:'Chart Link', widget:'text', editable:true},
  {key:'trade_summary', label:'Trade Summary', widget:'textarea', editable:false}
];

let FORM_FIELD_CONFIG = []; // [{key, visible}], in display order
let DRAWER_FIELDS = []; // derived: visible ALL_DRAWER_FIELDS entries, in order

function loadFormFieldConfig(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem('ledger-form-field-config') || 'null'); }catch(e){}

  if(saved && Array.isArray(saved) && saved.length){
    const savedKeys = new Set(saved.map(c => c.key));
    const extra = ALL_DRAWER_FIELDS.filter(c => !savedKeys.has(c.key)).map(c => ({key:c.key, visible:true}));
    FORM_FIELD_CONFIG = [...saved.filter(c => ALL_DRAWER_FIELDS.some(m => m.key === c.key)), ...extra];
  }else{
    FORM_FIELD_CONFIG = ALL_DRAWER_FIELDS.map(c => ({key:c.key, visible:true}));
  }
  rebuildDrawerFields();
}

function rebuildDrawerFields(){
  DRAWER_FIELDS = FORM_FIELD_CONFIG
    .filter(c => c.visible)
    .map(c => ALL_DRAWER_FIELDS.find(m => m.key === c.key))
    .filter(Boolean);
}

function saveFormFieldConfig(){
  try{ localStorage.setItem('ledger-form-field-config', JSON.stringify(FORM_FIELD_CONFIG)); }catch(e){}
  syncUIPrefsToProfile();
  rebuildDrawerFields();
}

function toggleFormFieldVisible(key, visible){
  const c = FORM_FIELD_CONFIG.find(c => c.key === key);
  if(c) c.visible = visible;
  saveFormFieldConfig();
}

async function resetFormFieldConfig(){
  if(!(await customConfirm('Reset form fields to default?', 'Reset'))) return;
  try{ localStorage.removeItem('ledger-form-field-config'); }catch(e){}
  loadFormFieldConfig();
  syncUIPrefsToProfile();
  renderFormFieldConfigUI();
}

function renderFormFieldConfigUI(){
  const container = document.getElementById('formFieldConfigList');
  if(!container) return;
  container.innerHTML = FORM_FIELD_CONFIG.map((c) => {
    const meta = ALL_DRAWER_FIELDS.find(m => m.key === c.key);
    return `
      <div class="config-col-row" draggable="true" data-key="${c.key}">
        <span class="config-drag-handle">⠿</span>
        <label class="config-col-check">
          <input type="checkbox" ${c.visible?'checked':''} onchange="toggleFormFieldVisible('${c.key}', this.checked)">
          ${meta ? meta.label : c.key}
        </label>
      </div>
    `;
  }).join('');
  _attachDragReorder(container, FORM_FIELD_CONFIG, () => { saveFormFieldConfig(); renderFormFieldConfigUI(); });
}

const ALL_JOURNAL_COLUMNS = [
  {key:'no', label:'No.'},
  {key:'symbol', label:'Symbol'},
  {key:'win_loss', label:'Win/Loss'},
  {key:'trade_type', label:'Trade Type'},
  {key:'trade_setup', label:'Trade Setup'},
  {key:'pattern_type', label:'Pattern Type'},
  {key:'execution_tf', label:'Execution TF'},
  {key:'aof_phase', label:'AOF Phase'},
  {key:'profit_loss', label:'Profit/Loss'},
  {key:'pnl_percent', label:'PNL Percent'},
  {key:'rr', label:'RR'},
  {key:'entry_price', label:'Entry Price'},
  {key:'close_price', label:'Close Price'},
  {key:'position_size', label:'Position Size'},
  {key:'rules_followed', label:'Rules Followed?'},
  {key:'unfollowed_rules', label:'Unfollowed Rules'},
  {key:'exit_type', label:'Exit Type'},
  {key:'post_be_result', label:'Post-BE Result'},
  {key:'account', label:'Account'},
  {key:'account_type', label:'Account Type'},
  {key:'session', label:'Session'},
  {key:'day_of_week', label:'Day of Week'},
  {key:'open_date', label:'Open Date'},
  {key:'close_date', label:'Close Date'},
  {key:'duration', label:'Duration'},
  {key:'objective', label:'Objective'},
  {key:'fee', label:'Fee'},
  {key:'notes', label:'Notes'},
  {key:'trade_summary', label:'Trade Summary'},
  {key:'screenshot_before', label:'Screenshot (Before)'},
  {key:'screenshot_after', label:'Screenshot (After)'}
];

const DEFAULT_JOURNAL_COLUMN_ORDER = [
  'rules_followed','symbol','win_loss','profit_loss','exit_type','objective',
  'trade_type','pattern_type','aof_phase','execution_tf','account','account_type',
  'session','day_of_week','duration','unfollowed_rules',
  'entry_price','close_price','position_size'
];

let COLUMN_CONFIG = []; // [{key, visible}] for every ALL_JOURNAL_COLUMNS entry, in display order
let JOURNAL_COLUMNS = []; // derived: 'link' + visible columns from COLUMN_CONFIG, in order

function loadColumnConfig(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem('ledger-column-config') || 'null'); }catch(e){}

  if(saved && Array.isArray(saved) && saved.length){
    const savedKeys = new Set(saved.map(c => c.key));
    const extra = ALL_JOURNAL_COLUMNS.filter(c => !savedKeys.has(c.key)).map(c => ({key:c.key, visible:false}));
    COLUMN_CONFIG = [...saved.filter(c => ALL_JOURNAL_COLUMNS.some(m => m.key === c.key)), ...extra];
  }else{
    COLUMN_CONFIG = ALL_JOURNAL_COLUMNS
      .map(c => ({key:c.key, visible: DEFAULT_JOURNAL_COLUMN_ORDER.includes(c.key)}))
      .sort((a,b) => {
        const ai = DEFAULT_JOURNAL_COLUMN_ORDER.indexOf(a.key);
        const bi = DEFAULT_JOURNAL_COLUMN_ORDER.indexOf(b.key);
        if(ai===-1 && bi===-1) return 0;
        if(ai===-1) return 1;
        if(bi===-1) return -1;
        return ai-bi;
      });
  }
  rebuildJournalColumns();
}

function rebuildJournalColumns(){
  JOURNAL_COLUMNS = [{key:'link', label:''}, ...COLUMN_CONFIG
    .filter(c => c.visible)
    .map(c => ALL_JOURNAL_COLUMNS.find(m => m.key === c.key))
    .filter(Boolean)];
}

function saveColumnConfig(){
  try{ localStorage.setItem('ledger-column-config', JSON.stringify(COLUMN_CONFIG)); }catch(e){}
  syncUIPrefsToProfile();
  rebuildJournalColumns();
  renderJournalTable();
}

function toggleColumnVisible(key, visible){
  const c = COLUMN_CONFIG.find(c => c.key === key);
  if(c) c.visible = visible;
  saveColumnConfig();
}

async function resetColumnConfig(){
  if(!(await customConfirm('Reset columns to default?', 'Reset'))) return;
  try{ localStorage.removeItem('ledger-column-config'); }catch(e){}
  loadColumnConfig();
  syncUIPrefsToProfile();
  renderColumnConfigUI();
  renderJournalTable();
}

function renderColumnConfigUI(){
  const container = document.getElementById('columnConfigList');
  if(!container) return;
  container.innerHTML = COLUMN_CONFIG.map((c) => {
    const meta = ALL_JOURNAL_COLUMNS.find(m => m.key === c.key);
    return `
      <div class="config-col-row" draggable="true" data-key="${c.key}">
        <span class="config-drag-handle">⠿</span>
        <label class="config-col-check">
          <input type="checkbox" ${c.visible?'checked':''} onchange="toggleColumnVisible('${c.key}', this.checked)">
          ${meta ? meta.label : c.key}
        </label>
      </div>
    `;
  }).join('');
  _attachDragReorder(container, COLUMN_CONFIG, () => { saveColumnConfig(); renderColumnConfigUI(); });
}

/* ---------------- Shared drag-to-reorder for config lists ---------------- */
let _dragReorderKey = null;

function _attachDragReorder(container, configArr, onReorder){
  container.querySelectorAll('.config-col-row').forEach(row => {
    row.addEventListener('dragstart', () => {
      _dragReorderKey = row.dataset.key;
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
    });
    row.addEventListener('dragover', (e) => { e.preventDefault(); });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetKey = row.dataset.key;
      if(!_dragReorderKey || _dragReorderKey === targetKey) return;
      const fromIdx = configArr.findIndex(c => c.key === _dragReorderKey);
      const toIdx = configArr.findIndex(c => c.key === targetKey);
      if(fromIdx === -1 || toIdx === -1) return;
      const [moved] = configArr.splice(fromIdx, 1);
      configArr.splice(toIdx, 0, moved);
      _dragReorderKey = null;
      onReorder();
    });
  });
}

/* ---------------- Configuration sub-tabs ---------------- */
let activeConfigTab = 'columns';

function switchConfigTab(tab){
  activeConfigTab = tab;
  document.querySelectorAll('#view-config .subnav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('#view-config .subnav-panel').forEach(el => el.classList.toggle('active', el.id === 'configPanel-' + tab));
}

const JOURNAL_FILTER_FIELDS = [
  {key:'win_loss', selectId:'filterWinLoss', prefix:'Win/Loss'},
  {key:'trade_setup', selectId:'filterSetup', prefix:'Setup'},
  {key:'session', selectId:'filterSession', prefix:'Session'},
  {key:'account', selectId:'filterAccount', prefix:'Account'},
  {key:'day_of_week', selectId:'filterDay', prefix:'Day'}
];

function populateJournalFilters(){
  JOURNAL_FILTER_FIELDS.forEach(f => {
    const sel = document.getElementById(f.selectId);
    if(!sel) return;
    const current = sel.value;
    const values = [...new Set(RAW_TRADES.map(r => r[f.key]).filter(Boolean))].sort();
    sel.innerHTML = `<option value="all">${f.prefix}: All</option>` +
      values.map(v => `<option value="${v}">${v}</option>`).join('');
    if(values.includes(current)) sel.value = current;
  });
}

function clearJournalFilters(){
  document.getElementById('journalSearch').value = '';
  JOURNAL_FILTER_FIELDS.forEach(f => {
    const sel = document.getElementById(f.selectId);
    if(sel) sel.value = 'all';
  });
  renderJournalTable();
}

function _journalCellValue(row, key){
  if(key === 'objective') return computeObjective(row) || '—';
  if(key === 'duration') return computeDuration(row) || '—';
  if(key === 'trade_summary'){
    const plain = computeTradeSummary(row).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.length > 120 ? plain.slice(0, 120) + '…' : plain;
  }
  if(key === 'session') return row.session || computeSession(row) || '—';
  if(key === 'day_of_week') return row.day_of_week || computeDayOfWeek(row) || '—';

  let v = row[key];
  if(v === null || v === undefined || v === '') return '—';

  if(key === 'profit_loss'){
    const num = parseFloat(v);
    return isNaN(num) ? v : fmtMoney(num);
  }
  if(key === 'fee'){
    const num = parseFloat(v);
    return isNaN(num) ? v : '$' + Math.abs(num).toFixed(2);
  }
  if(['pnl_percent','rr','entry_price','close_price'].includes(key)){
    const num = parseFloat(v);
    if(isNaN(num)) return v;
    if(key === 'pnl_percent') return num.toFixed(2) + '%';
    return num.toFixed(2);
  }
  if(key === 'position_size'){
    const num = parseFloat(v);
    if(isNaN(num)) return v;
    return num.toFixed(6).replace(/\.?0+$/,'') || '0';
  }
  if(['open_date','close_date','created_at','updated_at'].includes(key)){
    const d = new Date(v);
    if(isNaN(d.getTime())) return v;
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }
  return String(v);
}

function _box(boxClass, text){
  return `<span class="box-badge ${boxClass}">${text}</span>`;
}

function _winLossBoxClass(winLossRaw){
  const v = (winLossRaw || '').toString().trim().toLowerCase();
  if(v === 'win') return 'box-win';
  if(v === 'loss') return 'box-loss';
  if(v === 'breakeven' || v === 'be') return 'box-be';
  return null;
}

function _journalColoredCell(key, row, plainVal){
  const raw = row[key];
  if(raw === null || raw === undefined || raw === '') return null;
  const v = String(raw).trim();
  const lower = v.toLowerCase();

  if(key === 'rules_followed'){
    if(lower === 'yes') return _box('box-solid-win', v);
    if(lower === 'no') return _box('box-solid-loss', v);
  }
  if(key === 'win_loss'){
    const c = _winLossBoxClass(raw);
    if(c) return _box(c, v);
  }
  if(key === 'profit_loss' || key === 'pnl_percent'){
    const c = _winLossBoxClass(row.win_loss);
    if(c) return _box(c, plainVal);
  }
  if(key === 'exit_type'){
    if(lower === 'stop profit') return _box('box-be', v);
    if(lower === 'sl hit') return _box('box-loss', v);
    if(lower === 'tp hit') return _box('box-win', v);
    if(lower === 'cut loss') return _box('box-orange', v);
    if(lower === 'manual early tp - valid') return _box('box-win', v);
    if(lower === 'manual early tp - invalid') return _box('box-loss', v);
  }
  return null;
}

function getFilteredJournalRows(){
  const query = (document.getElementById('journalSearch')?.value || '').trim().toLowerCase();

  let rows = RAW_TRADES;
  if(query){
    rows = rows.filter(r => {
      return ['symbol','position_id','trade_setup','pattern_type','session','account']
        .some(k => (r[k] || '').toString().toLowerCase().includes(query));
    });
  }

  JOURNAL_FILTER_FIELDS.forEach(f => {
    const sel = document.getElementById(f.selectId);
    const val = sel ? sel.value : 'all';
    if(val && val !== 'all'){
      rows = rows.filter(r => r[f.key] === val);
    }
  });

  // sort by No. (ascending); rows without a number fall to the end
  return [...rows].sort((a,b) => {
    const an = parseFloat(a.no), bn = parseFloat(b.no);
    const aValid = !isNaN(an), bValid = !isNaN(bn);
    if(aValid && bValid) return an - bn;
    if(aValid) return -1;
    if(bValid) return 1;
    return 0;
  });
}

function renderJournalTable(){
  const table = document.getElementById('journalTable');
  if(!table) return;

  const rows = getFilteredJournalRows();

  document.getElementById('journalCountLabel').textContent = `${rows.length} trade${rows.length===1?'':'s'}`;

  if(rows.length === 0){
    table.innerHTML = `<tr><td style="padding:24px;color:var(--muted);">No trades found.</td></tr>`;
    return;
  }

  const thead = `<thead><tr>${JOURNAL_COLUMNS.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r => `
    <tr onclick='openTradeViewModal(${JSON.stringify(r.position_id)})' style="cursor:pointer;">
      ${JOURNAL_COLUMNS.map(c => {
        if(c.key === 'link'){
          return r.link
            ? `<td onclick="event.stopPropagation();"><a class="link-btn" href="${r.link}" target="_blank">${linkIconSVG()}</a></td>`
            : `<td><span class="link-btn disabled">—</span></td>`;
        }
        if(c.key === 'screenshot_before' || c.key === 'screenshot_after'){
          const slot = c.key === 'screenshot_before' ? 'before' : 'after';
          const info = SETUP_SCREENSHOTS[r.linked_setup_id];
          const hasImg = info && info[`${slot}_screenshot`];
          return hasImg
            ? `<td onclick="event.stopPropagation();"><button class="link-btn" onclick="viewSetupScreenshot(${r.linked_setup_id}, '${slot}')">${imageIconSVG()}</button></td>`
            : `<td><span class="link-btn disabled">—</span></td>`;
        }
        const val = _journalCellValue(r, c.key);
        const colored = _journalColoredCell(c.key, r, val);
        if(colored){
          if(c.key === 'rules_followed' && String(r.rules_followed||'').trim().toLowerCase() === 'no'){
            const rulesText = escapeHtml(r.unfollowed_rules || 'No rules specified');
            return `<td data-rules="${rulesText}" onmouseenter="showRulesTooltip(event)" onmouseleave="hideRulesTooltip()">${colored}</td>`;
          }
          return `<td title="${String(r[c.key]||'').replace(/"/g,'&quot;')}">${colored}</td>`;
        }
        if(c.key === 'profit_loss'){
          const num = parseFloat(r.profit_loss);
          const cls = !isNaN(num) ? (num>=0?'pos':'neg') : '';
          return `<td class="${cls}">${val}</td>`;
        }
        return `<td title="${String(r[c.key]||'').replace(/"/g,'&quot;')}">${val}</td>`;
      }).join('')}
    </tr>
  `).join('')}</tbody>`;

  table.innerHTML = thead + tbody;
}

/* ---------------- Drawer (view / edit / create trade) ---------------- */
let drawerMode = 'view'; // 'view' | 'create'
let drawerPositionId = null;
let drawerRowData = {};
let drawerEditing = false;

function _toISODateInput(val){
  if(!val) return '';
  const d = new Date(val);
  if(isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------------- Easy Add (paste-to-prefill) ---------------- */
const EASY_ADD_FIELD_SPECS = [
  {label:'open date', valueLines:2, key:'open_date'},
  {label:'close date', valueLines:2, key:'close_date'},
  {label:'symbol', valueLines:1, key:'symbol'},
  {label:'realized p&l', valueLines:1, key:'profit_loss'},
  {label:'fee', valueLines:1, key:'fee'}
];

const EASY_ADD_TEMPLATE = `Open Date


Close Date


Symbol

Realized P&L

Fee
`;

// Set by journalFromSetup() right before opening Easy Add, so the parsed
// paste-text can be merged with the calculator/notes data we already have
// (account, position size, symbol, notes). Cleared once consumed or if the
// modal is closed without proceeding, so it never leaks into an unrelated
// Easy Add session started from the Trade Journal's own "+ Add Trade".
let pendingJournalPrefill = null;
// The saved setup's id being journaled, if any — set alongside
// pendingJournalPrefill. Transferred to drawerJournalSetupId once Easy Add
// actually proceeds to the drawer, so saveDrawer() can flip that setup's
// Status to "Journaled" once the trade is truly saved (not just prefilled).
let pendingJournalSetupId = null;
let drawerJournalSetupId = null;

function openEasyAddModal(){
  document.getElementById('easyAddBroker').value = 'upscale';
  document.getElementById('easyAddError').textContent = '';
  document.getElementById('easyAddModal').classList.add('open');
  switchEasyAddBroker();
}

function closeEasyAddModal(){
  document.getElementById('easyAddModal').classList.remove('open');
  pendingJournalPrefill = null;
  pendingJournalSetupId = null;
}

function switchEasyAddBroker(){
  const broker = document.getElementById('easyAddBroker').value;
  const input = document.getElementById('easyAddInput');
  document.getElementById('easyAddError').textContent = '';

  if(broker === 'manual'){
    input.value = EASY_ADD_TEMPLATE;
    input.placeholder = 'Paste here…';
    const pos = EASY_ADD_TEMPLATE.indexOf('Open Date') + 'Open Date'.length + 1;
    input.focus();
    input.setSelectionRange(pos, pos);
  }else{
    input.value = '';
    input.placeholder = 'Paste the full position card from Upscale here…';
    input.focus();
  }
}

function _parseExchangeDateTime(dateStr, timeStr){
  const dm = (dateStr||'').match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if(!dm) return null;
  const dd = dm[1].padStart(2,'0');
  const mm = dm[2].padStart(2,'0');
  const year = dm[3].length === 2 ? '20'+dm[3] : dm[3];
  const tm = (timeStr||'').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const hh = tm ? tm[1].padStart(2,'0') : '00';
  const min = tm ? tm[2] : '00';
  const ss = tm && tm[3] ? tm[3] : '00';
  return `${year}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

// Upscale's "Positions" export pastes as multiple blocks (the aggregate
// position row, then one row per fill/order) — we only need the aggregate
// numbers (first Pnl:/Fee: found) plus the earliest/latest timestamp across
// every block (open vs. close time), since Upscale doesn't label them.
function parseUpscaleEasyAddText(raw){
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed = {};

  const symLine = lines.find(l => /^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/.test(l));
  if(symLine) parsed.symbol = symLine;

  const dirLine = lines.find(l => /^(LONG|SHORT)\b/i.test(l));
  if(dirLine) parsed.trade_type = /^LONG/i.test(dirLine) ? 'Long' : 'Short';

  const pnlLine = lines.find(l => /^Pnl:/i.test(l));
  if(pnlLine){
    const m = pnlLine.match(/Pnl:\s*(-?[\d,]+\.?\d*)/i);
    if(m) parsed.profit_loss = parseFloat(m[1].replace(/,/g,''));
  }

  // The position card's top summary row already shows the TOTAL fee for
  // the round-trip (its per-fill rows below — Open/Close — just break that
  // same total down into the two legs, they don't add anything extra) —
  // so only the first "Fee:" line matters; summing every "Fee:" line would
  // count the per-fill breakdown on top of the total that already includes it.
  const feeLine = lines.find(l => /^Fee:/i.test(l));
  if(feeLine){
    const m = feeLine.match(/Fee:\s*(-?[\d,]+\.?\d*)/i);
    if(m) parsed.fee = parseFloat(m[1].replace(/,/g,''));
  }

  const avgLine = lines.find(l => /^Avg:/i.test(l));
  if(avgLine){
    const m = avgLine.match(/Avg:\s*\$?([\d,]+\.?\d*)/i);
    if(m) parsed.entry_price = parseFloat(m[1].replace(/,/g,''));
  }

  const closePriceLine = lines.find(l => /^Close:/i.test(l));
  if(closePriceLine){
    const m = closePriceLine.match(/Close:\s*\$?([\d,]+\.?\d*)/i);
    if(m) parsed.close_price = parseFloat(m[1].replace(/,/g,''));
  }

  // Position size — the first bare decimal number with no "$" and no comma
  // (Collateral values always have a comma, e.g. "20,198.4").
  const sizeLine = lines.find(l => /^\d+\.\d+$/.test(l));
  if(sizeLine) parsed.position_size = parseFloat(sizeLine);

  // PNL % — price move from entry to close, sign-flipped for Short so a
  // profitable trade always shows positive (matches profit_loss's sign
  // convention). This is the price's % move, not an account-equity return.
  if(parsed.entry_price && parsed.close_price){
    const rawPct = (parsed.close_price - parsed.entry_price) / parsed.entry_price * 100;
    parsed.pnl_percent = parsed.trade_type === 'Short' ? -rawPct : rawPct;
  }

  // Win/Loss follows directly from the sign of the realized P&L we just parsed.
  if(parsed.profit_loss != null){
    parsed.win_loss = parsed.profit_loss > 0 ? 'Win' : (parsed.profit_loss < 0 ? 'Loss' : 'Breakeven');
  }

  // Exit type — Upscale's per-fill row says "Close" then the reason on the
  // next line (SL/TP). "SL" alone doesn't mean a loss — Upscale uses it for
  // any stop-type order, including a trailing/breakeven stop that locks in
  // profit — so we only call it "SL Hit" when the P&L was actually negative;
  // otherwise it's a stop that closed in profit ("Stop Profit").
  // "Market" (a manual close) isn't mapped — we can't tell from this alone
  // whether it was a valid early exit or a cut loss.
  const closeIdx = lines.findIndex(l => /^Close$/i.test(l));
  if(closeIdx !== -1 && lines[closeIdx+1]){
    const reason = lines[closeIdx+1].toUpperCase();
    if(reason === 'SL'){
      parsed.exit_type = (parsed.profit_loss != null && parsed.profit_loss < 0) ? 'SL Hit' : 'Stop Profit';
    }else if(reason === 'TP'){
      parsed.exit_type = 'TP Hit';
    }
  }

  const timestamps = [];
  for(let i = 0; i < lines.length - 1; i++){
    if(/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(lines[i]) && /^\d{1,2}:\d{2}(:\d{2})?$/.test(lines[i+1])){
      const iso = _parseExchangeDateTime(lines[i], lines[i+1]);
      if(iso) timestamps.push(iso);
    }
  }
  if(timestamps.length){
    timestamps.sort();
    parsed.open_date = timestamps[0];
    parsed.close_date = timestamps[timestamps.length - 1];
  }

  return parsed;
}

function parseEasyAddText(){
  const raw = document.getElementById('easyAddInput').value;
  const errEl = document.getElementById('easyAddError');
  errEl.textContent = '';
  const broker = document.getElementById('easyAddBroker').value;

  let parsed;
  if(broker === 'upscale'){
    parsed = parseUpscaleEasyAddText(raw);
  }else{
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    parsed = {};
    EASY_ADD_FIELD_SPECS.forEach(spec => {
      const idx = lines.findIndex(l => l.toLowerCase() === spec.label);
      if(idx === -1) return;
      const values = lines.slice(idx+1, idx+1+spec.valueLines);
      if(values.length < spec.valueLines) return;

      if(spec.key === 'open_date' || spec.key === 'close_date'){
        const iso = _parseExchangeDateTime(values[0], values[1]);
        if(iso) parsed[spec.key] = iso;
      }else if(spec.key === 'symbol'){
        let sym = values[0].toUpperCase();
        if(!sym.includes('/')) sym += '/USD';
        parsed.symbol = sym;
      }else{
        const num = parseFloat(values[0].replace(/,/g,''));
        if(!isNaN(num)) parsed[spec.key] = num;
      }
    });
  }

  // Merge in the calculator/notes data from "Journal", if that's how this
  // modal was opened — pasted-text values win on overlap since they're the
  // real, closed-trade numbers, not the calculator's earlier estimate.
  if(pendingJournalPrefill){
    parsed = { ...pendingJournalPrefill, ...parsed };
  }

  if(!Object.keys(parsed).length){
    errEl.textContent = "Couldn't recognize any fields in that text. Make sure you copied the full position card.";
    return;
  }

  drawerJournalSetupId = pendingJournalSetupId;
  closeEasyAddModal();
  openDrawer('create', null, parsed);
}

/* ---------------- Trade View popup (read-only, with Previous/Next) ---------------- */
let tradeViewList = [];
let tradeViewIndex = -1;

function openTradeViewModal(positionId){
  tradeViewList = getFilteredJournalRows();
  tradeViewIndex = tradeViewList.findIndex(r => r.position_id === positionId);
  renderTradeViewModal();
  document.getElementById('tradeViewModal').classList.add('open');
}

function renderTradeViewModal(){
  const row = tradeViewList[tradeViewIndex];
  if(!row) return;

  document.getElementById('tradeViewTitle').textContent = (row.symbol || 'Trade') + (row.no ? ` · #${row.no}` : '');
  document.getElementById('tradeViewSetupNotesBtn').style.display = row.linked_setup_id ? 'flex' : 'none';

  const wideFields = new Set(['notes','trade_summary','unfollowed_rules']);
  document.getElementById('tradeViewBody').innerHTML = DRAWER_FIELDS.map(f => {
    const spanCls = wideFields.has(f.key) ? ' span-2' : '';
    if(f.key === 'objective' || f.key === 'duration'){
      const computed = f.key === 'objective' ? computeObjective(row) : computeDuration(row);
      return `<div class="field-row${spanCls}"><label>${f.label}</label><div class="field-static">${computed || '—'}</div></div>`;
    }
    if(f.key === 'trade_summary'){
      return `<div class="field-row${spanCls}">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <label style="margin-bottom:0;">${f.label}</label>
          <button class="poscalc-copy-btn" title="Copy Trade Summary" onclick="copyTradeSummaryToClipboard(this)" data-summary="${escapeHtml(computeTradeSummaryPlain(row))}">${copyIconSVG()}</button>
        </div>
        <div class="field-static">${computeTradeSummary(row)}</div>
      </div>`;
    }
    if(f.key === 'open_date' || f.key === 'close_date'){
      const raw = row[f.key];
      const display = raw ? new Date(raw).toLocaleString(undefined,{dateStyle:'medium', timeStyle:'short'}) : '—';
      return `<div class="field-row${spanCls}"><label>${f.label}</label><div class="field-static">${display}</div></div>`;
    }
    const display = _journalCellValue(row, f.key);
    const colored = _journalColoredCell(f.key, row, escapeHtml(String(display)));
    const valueHtml = colored || escapeHtml(String(display));
    return `<div class="field-row${spanCls}"><label>${f.label}</label><div class="field-static">${valueHtml}</div></div>`;
  }).join('');

  document.getElementById('tradeViewPrevBtn').disabled = tradeViewIndex <= 0;
  document.getElementById('tradeViewNextBtn').disabled = tradeViewIndex < 0 || tradeViewIndex >= tradeViewList.length - 1;
}

function navigateTradeView(dir){
  const newIndex = tradeViewIndex + dir;
  if(newIndex < 0 || newIndex >= tradeViewList.length) return;
  tradeViewIndex = newIndex;
  renderTradeViewModal();
}

function closeTradeViewModal(){
  document.getElementById('tradeViewModal').classList.remove('open');
}

function editFromTradeView(){
  const row = tradeViewList[tradeViewIndex];
  if(!row) return;
  closeTradeViewModal();
  openDrawer('view', row.position_id);
  enterEditMode();
}

// Reuses deleteDrawer()'s confirm+delete+balance-adjust logic without
// requiring the full drawer to be open first — only closes this popup if
// the trade actually got removed (not on a cancelled confirm or an error).
async function deleteFromTradeView(){
  const row = tradeViewList[tradeViewIndex];
  if(!row) return;
  drawerPositionId = row.position_id;
  drawerRowData = row;
  await deleteDrawer();
  if(!RAW_TRADES.some(r => r.position_id === row.position_id)){
    closeTradeViewModal();
  }
}

function openDrawer(mode, positionId, prefill){
  drawerMode = mode;
  drawerPositionId = positionId || null;
  drawerEditing = (mode === 'create');
  drawerRowData = mode === 'view' ? (RAW_TRADES.find(r => r.position_id === positionId) || {}) : (prefill || {});

  renderDrawerFields();

  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
}

function enterEditMode(){
  drawerEditing = true;
  renderDrawerFields();
}

function renderDrawerFields(){
  const mode = drawerMode;
  const row = drawerRowData;

  document.getElementById('drawerTitle').textContent = mode === 'create'
    ? 'Add trade'
    : (row.symbol || 'Trade') + (row.no ? ` · #${row.no}` : '');
  document.getElementById('drawerDeleteBtn').style.display = mode === 'view' ? 'inline-block' : 'none';
  document.getElementById('drawerEditBtn').style.display = (mode === 'view' && !drawerEditing) ? 'inline-block' : 'none';
  document.getElementById('drawerSetupNotesBtn').style.display = (mode === 'view' && row.linked_setup_id) ? 'inline-block' : 'none';
  document.getElementById('drawerSaveBtn').style.display = (mode === 'create' || drawerEditing) ? 'inline-block' : 'none';
  document.getElementById('drawerSaveBtn').textContent = mode === 'create' ? 'Add trade' : 'Save changes';
  document.getElementById('drawerError').textContent = '';

  const body = document.getElementById('drawerBody');
  body.innerHTML = DRAWER_FIELDS.map(f => {
    if(f.key === 'objective' || f.key === 'duration'){
      const computed = f.key === 'objective' ? computeObjective(row) : computeDuration(row);
      return `<div class="field-row"><label>${f.label}</label><div class="field-static">${computed || '—'}</div></div>`;
    }
    if(f.key === 'trade_summary'){
      return `<div class="field-row">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <label style="margin-bottom:0;">${f.label}</label>
          <button class="poscalc-copy-btn" title="Copy Trade Summary" onclick="copyTradeSummaryToClipboard(this)" data-summary="${escapeHtml(computeTradeSummaryPlain(row))}">${copyIconSVG()}</button>
        </div>
        <div class="field-static">${computeTradeSummary(row)}</div>
      </div>`;
    }

    const showWidget = mode === 'create' || f.editable || drawerEditing;
    let raw = row[f.key];
    if(!raw && f.key === 'session') raw = computeSession(row) || '';
    if(!raw && f.key === 'day_of_week') raw = computeDayOfWeek(row) || '';

    if(!showWidget){
      const display = (raw === null || raw === undefined || raw === '') ? '—' : String(raw);
      return `<div class="field-row"><label>${f.label}</label><div class="field-static">${display}</div></div>`;
    }

    // In create mode, flag still-empty fields red so nothing gets missed
    // after Easy Add prefills only some of them.
    const isEmpty = raw === undefined || raw === null || raw === '';
    const rowCls = (mode === 'create' && isEmpty) ? 'field-row needs-input' : 'field-row';

    if(f.widget === 'select'){
      let selectOptions = f.options;
      if(f.key === 'pattern_type' && row.trade_setup && TRADE_SETUP_PATTERN_MAP[row.trade_setup]){
        selectOptions = TRADE_SETUP_PATTERN_MAP[row.trade_setup];
      }
      const opts = selectOptions.map(o => `<option value="${o}" ${raw===o?'selected':''}>${o}</option>`).join('');
      const onchange = f.key === 'account' ? ` onchange="syncAccountTypeFromAccount(this.value)"`
        : f.key === 'trade_setup' ? ` onchange="syncPatternTypeFromSetup(this.value)"`
        : f.key === 'pattern_type' ? ` onchange="syncExecutionFromPattern(this.value)"`
        : f.key === 'win_loss' ? ` onchange="syncPostBEFromWinLoss(this.value)"`
        : '';
      return `<div class="${rowCls}"><label>${f.label}</label><select data-field="${f.key}"${onchange}><option value="">—</option>${opts}</select></div>`;
    }
    if(f.widget === 'checklist'){
      const selected = (raw || '').split(/[,;]/).map(s=>s.trim()).filter(Boolean);
      const boxes = f.options.map(o => `
        <label><input type="checkbox" data-checklist="${f.key}" value="${o}" ${selected.includes(o)?'checked':''}> ${o}</label>
      `).join('');
      return `<div class="${rowCls}"><label>${f.label}</label><div class="checklist-box">${boxes}</div></div>`;
    }
    if(f.widget === 'date'){
      return `<div class="${rowCls}"><label>${f.label}</label><input type="datetime-local" data-field="${f.key}" value="${_toISODateInput(raw)}"></div>`;
    }
    if(f.widget === 'number'){
      return `<div class="${rowCls}"><label>${f.label}</label><input type="number" step="any" data-field="${f.key}" value="${raw!==undefined&&raw!==null?raw:''}"></div>`;
    }
    if(f.widget === 'textarea'){
      return `<div class="${rowCls}"><label>${f.label}</label><textarea data-field="${f.key}">${raw||''}</textarea></div>`;
    }
    return `<div class="${rowCls}"><label>${f.label}</label><input type="text" data-field="${f.key}" value="${raw!==undefined&&raw!==null?raw:''}"></div>`;
  }).join('');

  // Prefilled values (Easy Add / Journal from a saved setup) set the
  // select's initial value directly, which doesn't fire "change" — so the
  // dependent auto-fills below need a proactive nudge on create, same as
  // if the user had just picked them by hand.
  if(mode === 'create'){
    if(row.account) syncAccountTypeFromAccount(row.account);
    if(row.pattern_type) syncExecutionFromPattern(row.pattern_type);
    if(row.win_loss) syncPostBEFromWinLoss(row.win_loss);
  }
}

function closeDrawer(){
  document.getElementById('drawerOverlay').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
}

function _collectDrawerPatch(){
  const patch = {};

  document.querySelectorAll('#drawerBody [data-field]').forEach(el => {
    const key = el.dataset.field;
    let val = el.value;
    if(val === '') val = null;
    if(el.type === 'number' && val !== null) val = parseFloat(val);
    patch[key] = val;
  });

  // checklist fields (currently just unfollowed_rules) — join checked values
  const checklistKeys = new Set();
  document.querySelectorAll('#drawerBody [data-checklist]').forEach(el => checklistKeys.add(el.dataset.checklist));
  checklistKeys.forEach(key => {
    const checked = [...document.querySelectorAll(`#drawerBody [data-checklist="${key}"]:checked`)].map(el => el.value);
    patch[key] = checked.join(', ');
  });

  return patch;
}

async function saveDrawer(){
  const errEl = document.getElementById('drawerError');
  errEl.textContent = '';
  const saveBtn = document.getElementById('drawerSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  let justJournaledSetup = false;

  try{
    const patch = _collectDrawerPatch();

    if(drawerMode === 'create'){
      const maxNo = RAW_TRADES.reduce((m,r) => { const n = parseFloat(r.no); return !isNaN(n) && n>m ? n : m; }, 0);
      patch.no = patch.no || (maxNo + 1);
      patch.position_id = 'WEB-' + Date.now().toString(36).toUpperCase();
      if(drawerJournalSetupId) patch.linked_setup_id = drawerJournalSetupId;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${USER_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(patch)
      });
      if(!res.ok) throw new Error(await res.text());
      const inserted = await res.json();
      RAW_TRADES.push(inserted[0] || patch);

      if(drawerJournalSetupId){
        setSetupStatus(drawerJournalSetupId, 'Journaled');
        justJournaledSetup = true;
        drawerJournalSetupId = null;
      }

    }else{
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?position_id=eq.${encodeURIComponent(drawerPositionId)}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${USER_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(patch)
      });
      if(!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      const idx = RAW_TRADES.findIndex(r => r.position_id === drawerPositionId);
      if(idx > -1 && updated[0]) RAW_TRADES[idx] = updated[0];
    }

    ALL_TRADES = RAW_TRADES.map(normalizeTrade);
    populateAccountFilter();
    populateJournalFilters();
    applyFilters();
    renderJournalTable();
    refreshAllNavBadges();
    if(justJournaledSetup) loadLinkedSetupScreenshots().then(renderJournalTable);

    const oldAccount = drawerMode === 'create' ? null : (drawerRowData.account || null);
    const oldNet = drawerMode === 'create' ? 0 : ((parseFloat(drawerRowData.profit_loss) || 0) - (parseFloat(drawerRowData.fee) || 0));
    const newAccount = patch.account || null;
    const newNet = (parseFloat(patch.profit_loss) || 0) - (parseFloat(patch.fee) || 0);
    if(oldAccount === newAccount){
      if(newAccount) await adjustAccountBalance(newAccount, newNet - oldNet);
    }else{
      if(oldAccount) await adjustAccountBalance(oldAccount, -oldNet);
      if(newAccount) await adjustAccountBalance(newAccount, newNet);
    }

    closeDrawer();

  }catch(e){
    errEl.textContent = "Couldn't save: " + e.message + ". Make sure your Supabase table has INSERT/UPDATE policies enabled for this key.";
  }finally{
    saveBtn.disabled = false;
    saveBtn.textContent = drawerMode === 'create' ? 'Add trade' : 'Save changes';
  }
}

async function deleteDrawer(){
  if(!drawerPositionId) return;
  if(!(await customConfirm('Delete this trade permanently? This cannot be undone.'))) return;

  const errEl = document.getElementById('drawerError');
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?position_id=eq.${encodeURIComponent(drawerPositionId)}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());

    const deletedAccount = drawerRowData.account || null;
    const deletedNet = (parseFloat(drawerRowData.profit_loss) || 0) - (parseFloat(drawerRowData.fee) || 0);
    const linkedSetupId = drawerRowData.linked_setup_id || null;

    RAW_TRADES = RAW_TRADES.filter(r => r.position_id !== drawerPositionId);
    ALL_TRADES = RAW_TRADES.map(normalizeTrade);
    populateAccountFilter();
    populateJournalFilters();
    applyFilters();
    renderJournalTable();
    refreshAllNavBadges();

    if(deletedAccount) await adjustAccountBalance(deletedAccount, -deletedNet);
    if(linkedSetupId) setSetupStatus(linkedSetupId, 'Pending');

    closeDrawer();

  }catch(e){
    errEl.textContent = "Couldn't delete: " + e.message + ". Make sure your Supabase table has a DELETE policy enabled for this key.";
  }
}

/* ---------------- AI Insights ---------------- */
async function generateInsights(){
  const btn = document.getElementById('aiBtn');
  const out = document.getElementById('aiOutput');
  btn.disabled = true;
  btn.textContent = "Thinking…";
  out.style.display = 'block';
  out.textContent = "Analyzing your trades…";

  const summary = buildSummaryForAI();

  try{
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are a trading coach reviewing a trader's journal data. Be direct, specific, and concise — no generic platitudes. Base every observation only on the numbers given. Structure your reply as:\n1. A one-line honest read of current performance.\n2. 2-3 specific patterns you notice (best/worst setup, session, emotion, discipline correlation, etc.)\n3. One or two concrete adjustments to try next, tied directly to the data.\nKeep it under 180 words. Do not use markdown headers, just plain text with line breaks.\n\nHere is the trader's data:\n${JSON.stringify(summary, null, 2)}`
        }]
      })
    });

    const data = await response.json();
    const text = (data.content || []).map(b => b.text || "").join("\n").trim();
    out.textContent = text || "Couldn't generate insights from this response — try again.";
  }catch(e){
    out.textContent = "AI insights aren't available in this environment. If you've deployed this dashboard outside of Claude, you'll need to wire this button to your own Anthropic API key via a small backend proxy (the direct browser call only works inside Claude's artifact sandbox).";
  }finally{
    btn.disabled = false;
    btn.textContent = "Generate insights";
  }
}

function buildSummaryForAI(){
  const t = FILTERED;
  const wins = t.filter(x=>x.win_loss.toLowerCase()==='win');
  const losses = t.filter(x=>x.win_loss.toLowerCase()==='loss');
  const totalPnl = t.reduce((s,x)=>s+x.profit_loss,0);

  function groupSummary(field){
    const groups = {};
    t.forEach(tr => {
      const key = tr[field] || 'Unspecified';
      if(!groups[key]) groups[key] = {count:0, pnl:0, wins:0};
      groups[key].count++;
      groups[key].pnl += tr.profit_loss;
      if(tr.win_loss.toLowerCase()==='win') groups[key].wins++;
    });
    return Object.entries(groups).map(([k,v]) => ({name:k, trades:v.count, pnl: +v.pnl.toFixed(2), win_rate: +(v.wins/v.count*100).toFixed(1)}));
  }

  const broken = t.filter(x => x.unfollowed_rules.trim() !== '');

  return {
    total_trades: t.length,
    total_pnl: +totalPnl.toFixed(2),
    win_rate: t.length ? +(wins.length/t.length*100).toFixed(1) : 0,
    avg_rr: (()=>{const v=t.map(x=>x.rr).filter(x=>x!==null&&!isNaN(x)); return v.length? +(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2):null;})(),
    by_setup: groupSummary('trade_setup'),
    by_session: groupSummary('session'),
    by_emotion: groupSummary('emotion'),
    by_day_of_week: groupSummary('day_of_week'),
    trades_with_broken_rules: broken.length,
    broken_rules_pnl: +broken.reduce((s,x)=>s+x.profit_loss,0).toFixed(2)
  };
}

let toastTimer = null;
function showToast(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------------- Sidebar notification badges + notification center ---------------- */

// Admin-only: pending signups waiting for approval. Populated eagerly at
// login (for admins) so the badge is right immediately, and re-populated
// for free whenever the Admin Console's own list loads (renderAdminUserList).
let PENDING_SIGNUPS = [];

async function loadPendingSignupsForBadge(){
  if(!isAdminUser()) return;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_access?select=email,requested_at&status=eq.pending&order=requested_at.desc`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
    });
    if(!res.ok) throw new Error(await res.text());
    PENDING_SIGNUPS = await res.json();
  }catch(e){
    console.error("Couldn't load pending signups:", e);
    PENDING_SIGNUPS = [];
  }
  refreshAllNavBadges();
}

// Only trades CREATED through this app (position_id starts with "WEB-",
// assigned in saveDrawer()'s create path) are checked for missing fields —
// a legacy/imported trade keeps its real historical open_date even if you
// add it today, so open_date can't tell "new entry" from "old trade";
// position_id can, since every app-created row gets stamped once, at
// creation, regardless of what date the trade itself happened on.
const REQUIRED_JOURNAL_FIELDS = [
  'symbol','win_loss','profit_loss','account','entry_price','close_price',
  'position_size','rules_followed','trade_type','exit_type','trade_setup'
];
const REQUIRED_JOURNAL_FIELD_LABELS = {
  symbol: 'Symbol', win_loss: 'Win/Loss', profit_loss: 'Profit/Loss', account: 'Account',
  entry_price: 'Entry Price', close_price: 'Close Price', position_size: 'Position Size',
  rules_followed: 'Rules Followed?', trade_type: 'Trade Type', exit_type: 'Exit Type', trade_setup: 'Trade Setup'
};

function getMissingFieldLabels(t){
  return REQUIRED_JOURNAL_FIELDS
    .filter(key => t[key] === null || t[key] === undefined || t[key] === '')
    .map(key => REQUIRED_JOURNAL_FIELD_LABELS[key]);
}

function getIncompleteTrades(){
  return RAW_TRADES.filter(t => {
    if(!(t.position_id || '').startsWith('WEB-')) return false;
    return REQUIRED_JOURNAL_FIELDS.some(key => t[key] === null || t[key] === undefined || t[key] === '');
  });
}
function getIncompleteTradesCount(){ return getIncompleteTrades().length; }

function getUpcomingHighImpactEvents(){
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600000);
  return ECON_EVENTS.filter(e => {
    if(e.impact !== 'High') return false;
    const d = new Date(e.event_date);
    return !isNaN(d) && d >= now && d <= in24h;
  });
}

// A challenge has no "completed_at" of its own — .done is just recomputed
// fresh from trades/achievements every render — so "newly" completed is
// tracked by diffing against the last set of done titles we've shown a
// notification for, saved in localStorage (persists across sessions).
// The "seen" list lives in BOTH localStorage (instant, works before the
// profile loads) and the user_profile row in Supabase (survives switching
// devices, browsers, or site URLs — localStorage is per-site-address, so
// moving from the old Netlify URL to tanaydana.com wiped it and re-notified
// every already-completed challenge).
function _getSeenChallengeTitles(){
  let seenTitles = [];
  try{ seenTitles = JSON.parse(localStorage.getItem('ledger-seen-completed-challenges') || '[]'); }catch(e){}
  const fromProfile = Array.isArray(PROFILE_DATA?.seen_completed_challenges) ? PROFILE_DATA.seen_completed_challenges : [];
  return Array.from(new Set([...seenTitles, ...fromProfile]));
}

function getNewlyCompletedChallenges(){
  const doneNow = COMPUTED_CHALLENGES.filter(c => c.done);
  const seenSet = new Set(_getSeenChallengeTitles());
  return doneNow.filter(c => !seenSet.has(c.title));
}

function markChallengesNotificationSeen(){
  const doneNow = COMPUTED_CHALLENGES.filter(c => c.done).map(c => c.title);
  // Merge into the existing seen list rather than replacing it — a
  // streak-based challenge (Hot Streak, Clean Week, etc.) can briefly go
  // back to "not done" between renders; overwriting the seen list would
  // drop it and let it re-trigger a "newly completed" notification later
  // even though it was already seen once.
  const merged = Array.from(new Set([..._getSeenChallengeTitles(), ...doneNow]));
  try{ localStorage.setItem('ledger-seen-completed-challenges', JSON.stringify(merged)); }catch(e){}
  _persistSeenChallenges(merged);
}

async function _persistSeenChallenges(list){
  await _persistProfileList('seen_completed_challenges', list);
}

// Shared upsert for the per-account "already notified" lists on user_profile
// (seen challenges, seen calendar events) — one column per call.
async function _persistProfileList(column, list){
  if(!CURRENT_USER_ID) return;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profile?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal,resolution=merge-duplicates"
      },
      body: JSON.stringify([{ user_id: CURRENT_USER_ID, [column]: list }])
    });
    if(!res.ok) throw new Error(await res.text());
    if(PROFILE_DATA) PROFILE_DATA[column] = list;
  }catch(e){
    console.error(`Couldn't sync ${column} to profile:`, e);
  }
}

// High-impact calendar events had no "seen" state at all — the badge used to
// sit there for up to 24h until the event itself passed. Same treatment as
// challenges now: seeing them in the notification center clears the count,
// tracked per-account (DB) with localStorage as the instant local cache.
function _getSeenEventIds(){
  let seenIds = [];
  try{ seenIds = JSON.parse(localStorage.getItem('ledger-seen-event-notifs') || '[]'); }catch(e){}
  const fromProfile = Array.isArray(PROFILE_DATA?.seen_event_notifications) ? PROFILE_DATA.seen_event_notifications : [];
  return Array.from(new Set([...seenIds, ...fromProfile]));
}

function getUnseenHighImpactEvents(){
  const seenSet = new Set(_getSeenEventIds());
  return getUpcomingHighImpactEvents().filter(e => !seenSet.has(e.id));
}

function markEventsNotificationSeen(){
  const currentIds = getUpcomingHighImpactEvents().map(e => e.id);
  // Keep only the most recent 200 ids so the list doesn't grow forever —
  // old events fall out of the 24h window anyway, their ids are dead weight.
  const merged = Array.from(new Set([..._getSeenEventIds(), ...currentIds])).slice(-200);
  try{ localStorage.setItem('ledger-seen-event-notifs', JSON.stringify(merged)); }catch(e){}
  _persistProfileList('seen_event_notifications', merged);
}

function updateNavBadge(view, count){
  const el = document.getElementById('navBadge-' + view);
  if(!el) return;
  if(count > 0){
    el.textContent = count > 99 ? '99+' : String(count);
    el.style.display = 'inline-flex';
  }else{
    el.style.display = 'none';
  }
}

function refreshAllNavBadges(){
  const incompleteCount = getIncompleteTradesCount();
  const eventsCount = getUnseenHighImpactEvents().length;
  const alertsCount = SIGNAL_ALERTS.filter(isNewSignal).length;
  const challengesCount = getNewlyCompletedChallenges().length;
  const signupsCount = isAdminUser() ? PENDING_SIGNUPS.length : 0;
  updateNavBadge('journal', incompleteCount);
  updateNavBadge('news', eventsCount);
  updateNavBadge('alerts', alertsCount);
  updateNavBadge('challenges', challengesCount);
  updateNavBadge('admin', signupsCount);
  updateNotifBellBadge(incompleteCount + eventsCount + alertsCount + challengesCount + signupsCount);
  if(document.getElementById('notifCenterPanel')?.classList.contains('open')) renderNotifCenter();
}

function updateNotifBellBadge(count){
  const el = document.getElementById('notifBellBadge');
  if(!el) return;
  if(count > 0){
    el.textContent = count > 99 ? '99+' : String(count);
    el.style.display = 'inline-flex';
  }else{
    el.style.display = 'none';
  }
}

function toggleNotifCenter(){
  const panel = document.getElementById('notifCenterPanel');
  if(!panel) return;
  if(panel.classList.contains('open')){
    panel.classList.remove('open');
    // Items got marked "seen" when the panel rendered — recount now so the
    // badges clear the moment it closes instead of on the next poll cycle.
    refreshAllNavBadges();
  }else{
    renderNotifCenter();
    panel.classList.add('open');
  }
}

function closeNotifCenter(){
  const panel = document.getElementById('notifCenterPanel');
  if(panel && panel.classList.contains('open')){
    panel.classList.remove('open');
    refreshAllNavBadges();
  }
}

// Closes the panel on an outside click, like any normal dropdown.
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notifCenterPanel');
  const bell = document.getElementById('notifBellBtn');
  if(!panel || !panel.classList.contains('open')) return;
  if(panel.contains(e.target) || (bell && bell.contains(e.target))) return;
  panel.classList.remove('open');
  refreshAllNavBadges();
});

// Clicking a notification item shows what it's actually about first — no
// more guessing which fields are missing, or jumping blind into a page —
// then "OK" carries you to wherever that notification points.
let _notifDetailOkAction = null;

function showNotifDetail(title, bodyHtml, okAction, okLabel){
  document.getElementById('notifDetailTitle').textContent = title;
  document.getElementById('notifDetailBody').innerHTML = bodyHtml;
  document.getElementById('notifDetailOkBtn').textContent = okLabel || 'OK';
  _notifDetailOkAction = okAction;
  document.getElementById('notifDetailModal').classList.add('open');
}

function closeNotifDetailModal(){
  document.getElementById('notifDetailModal').classList.remove('open');
  _notifDetailOkAction = null;
}

function runNotifDetailOk(){
  const action = _notifDetailOkAction;
  closeNotifDetailModal();
  if(action) action();
}

function showTradeIncompleteDetail(positionId){
  const t = RAW_TRADES.find(x => x.position_id === positionId);
  if(!t) return;
  const missing = getMissingFieldLabels(t);
  const bodyHtml = missing.length
    ? `<p style="margin:0 0 8px;">This trade is missing:</p><ul style="margin:0;padding-left:18px;">${missing.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`
    : `<p style="margin:0;">No longer missing anything — refresh the notification list.</p>`;
  showNotifDetail(t.symbol || 'Incomplete Trade', bodyHtml, () => goToTradeFromNotif(positionId), 'Go to Trade');
}

function showEventDetailFromNotif(eventId){
  const e = ECON_EVENTS.find(x => x.id === eventId);
  if(!e) return;
  const when = new Date(e.event_date).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  const bodyHtml = `
    <div style="margin-bottom:6px;"><strong>${escapeHtml(e.country || '')}</strong> · ${when}</div>
    ${e.forecast != null ? `<div>Forecast: ${escapeHtml(String(e.forecast))}</div>` : ''}
    ${e.previous != null ? `<div>Previous: ${escapeHtml(String(e.previous))}</div>` : ''}
    ${e.comment ? `<div style="margin-top:8px;">${escapeHtml(e.comment)}</div>` : ''}
  `;
  showNotifDetail(e.title, bodyHtml, () => { closeNotifCenter(); switchView('news'); }, 'Go to Calendar');
}

function showAlertDetailFromNotif(alertId){
  const a = SIGNAL_ALERTS.find(x => x.id === alertId);
  if(!a) return;
  const when = new Date(a.alert_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  const bodyHtml = `
    <div style="margin-bottom:6px;color:var(--muted);">${when}</div>
    <div style="white-space:pre-line;">${escapeHtml(a.message || '')}</div>
  `;
  showNotifDetail(a.setup || a.symbol || 'Trade Alert', bodyHtml, () => { closeNotifCenter(); switchView('alerts'); }, 'Go to Alerts');
}

function showChallengeDetailFromNotif(title){
  const c = COMPUTED_CHALLENGES.find(x => x.title === title);
  if(!c) return;
  const bodyHtml = `<p style="margin:0;">You just earned <strong>+${c.points} points</strong> for this challenge.</p>`;
  showNotifDetail('🏆 ' + title, bodyHtml, () => goToChallengeFromNotif(title), 'View Challenge');
}

function goToTradeFromNotif(positionId){
  closeNotifCenter();
  switchView('journal');
  openTradeViewModal(positionId);
}

function renderNotifCenter(){
  const body = document.getElementById('notifCenterBody');
  if(!body) return;

  const incomplete = getIncompleteTrades();
  const events = getUnseenHighImpactEvents();
  const alerts = SIGNAL_ALERTS.filter(isNewSignal);
  const sections = [];

  if(incomplete.length){
    sections.push(`
      <div class="notif-section">
        <div class="notif-section-title">Incomplete Trades (${incomplete.length})</div>
        ${incomplete.slice(0, 5).map(t => `
          <div class="notif-item" onclick='showTradeIncompleteDetail(${JSON.stringify(t.position_id)})'>
            <span>${escapeHtml(t.symbol || 'Unnamed trade')}</span>
            <span class="notif-item-meta">${t.open_date ? new Date(t.open_date).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '—'}</span>
          </div>
        `).join('')}
        ${incomplete.length > 5 ? `<div class="notif-more" onclick="closeNotifCenter(); switchView('journal');">+${incomplete.length - 5} more →</div>` : ''}
      </div>
    `);
  }

  if(events.length){
    sections.push(`
      <div class="notif-section">
        <div class="notif-section-title">High Impact Events (${events.length})</div>
        ${events.map(e => `
          <div class="notif-item" onclick="showEventDetailFromNotif(${e.id})">
            <span>${escapeHtml(e.title)}</span>
            <span class="notif-item-meta">${new Date(e.event_date).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
          </div>
        `).join('')}
      </div>
    `);
  }

  if(alerts.length){
    sections.push(`
      <div class="notif-section">
        <div class="notif-section-title">New Trade Alerts (${alerts.length})</div>
        ${alerts.slice(0, 5).map(a => `
          <div class="notif-item" onclick="showAlertDetailFromNotif(${a.id})">
            <span>${escapeHtml(a.setup || a.symbol || 'Alert')}</span>
            <span class="notif-item-meta">${new Date(a.alert_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
          </div>
        `).join('')}
        ${alerts.length > 5 ? `<div class="notif-more" onclick="closeNotifCenter(); switchView('alerts');">+${alerts.length - 5} more →</div>` : ''}
      </div>
    `);
  }

  const newlyCompletedChallenges = getNewlyCompletedChallenges();
  if(newlyCompletedChallenges.length){
    sections.push(`
      <div class="notif-section">
        <div class="notif-section-title">Challenges Completed (${newlyCompletedChallenges.length})</div>
        ${newlyCompletedChallenges.map(c => `
          <div class="notif-item" onclick='showChallengeDetailFromNotif(${JSON.stringify(c.title)})'>
            <span>🏆 ${escapeHtml(c.title)}</span>
            <span class="notif-item-meta">+${c.points} pts</span>
          </div>
        `).join('')}
      </div>
    `);
  }

  if(isAdminUser() && PENDING_SIGNUPS.length){
    sections.push(`
      <div class="notif-section">
        <div class="notif-section-title">Pending Signups (${PENDING_SIGNUPS.length})</div>
        ${PENDING_SIGNUPS.slice(0, 5).map(s => `
          <div class="notif-item" onclick='showSignupDetailFromNotif(${JSON.stringify(s.email)})'>
            <span>${escapeHtml(s.email)}</span>
            <span class="notif-item-meta">${s.requested_at ? new Date(s.requested_at).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '—'}</span>
          </div>
        `).join('')}
        ${PENDING_SIGNUPS.length > 5 ? `<div class="notif-more" onclick="closeNotifCenter(); switchView('admin');">+${PENDING_SIGNUPS.length - 5} more →</div>` : ''}
      </div>
    `);
  }

  body.innerHTML = sections.length ? sections.join('') : '<div class="notif-empty">You\'re all caught up 🎉</div>';

  // Seeing them in the notification center counts as "read" — clears the
  // badge next refresh instead of re-notifying about the same completions.
  if(newlyCompletedChallenges.length) markChallengesNotificationSeen();
  if(events.length) markEventsNotificationSeen();
}

function goToChallengeFromNotif(title){
  closeNotifCenter();
  switchView('challenges');
  openChallengeDetail(title);
}

function showSignupDetailFromNotif(email){
  const s = PENDING_SIGNUPS.find(x => x.email === email);
  if(!s) return;
  const requested = s.requested_at ? new Date(s.requested_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '—';
  const bodyHtml = `<p style="margin:0;"><strong>${escapeHtml(email)}</strong> signed up and is waiting for approval.</p><p style="margin:6px 0 0;">Requested: ${requested}</p>`;
  showNotifDetail('New Signup', bodyHtml, () => goToAdminFromNotif(), 'Review');
}

function goToAdminFromNotif(){
  closeNotifCenter();
  switchView('admin');
}

/* ---------------- Trade Alerts (individual bot alerts, from signal_alerts) ---------------- */
let SIGNAL_ALERTS = [];

async function manualRefreshAlerts(){
  await loadSignalAlerts();
  const newCount = SIGNAL_ALERTS.filter(isNewSignal).length;
  showToast(newCount === 0 ? 'Data refreshed — no new alerts' : `Data refreshed — ${newCount} new alert${newCount>1?'s':''}`);
}

let alertsSeenFilter = 'all';
function switchAlertsSeenFilter(f){
  alertsSeenFilter = f;
  document.querySelectorAll('#alertsSeenFilterTabs .tab').forEach(el => el.classList.toggle('active', el.dataset.f === f));
  renderAlertsTables();
}

let lastAlertsSyncAt = null;
let hasLoadedSignalAlertsOnce = false;
let lastKnownUnseenAlertCount = 0;

async function loadSignalAlerts(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?select=*&order=alert_at.desc`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    SIGNAL_ALERTS = await res.json();
    lastAlertsSyncAt = new Date();
  }catch(e){
    console.error("Couldn't load signal alerts:", e);
    SIGNAL_ALERTS = [];
  }
  if(isAdminUser()) await loadSignalOutcomes();
  renderAlertsTables();
  refreshAllNavBadges();

  // Only toast when the unseen count grows on a LATER load (i.e. the 30s
  // poll actually found something new) — not on the very first load, which
  // would otherwise toast about alerts that have been sitting there a while.
  const unseenCount = SIGNAL_ALERTS.filter(isNewSignal).length;
  if(hasLoadedSignalAlertsOnce && unseenCount > lastKnownUnseenAlertCount){
    const justIn = unseenCount - lastKnownUnseenAlertCount;
    showToast(`🔔 ${justIn} new trade alert${justIn > 1 ? 's' : ''}`);
  }
  hasLoadedSignalAlertsOnce = true;
  lastKnownUnseenAlertCount = unseenCount;
}

/* ---------------- Signal outcome tracking (Bitcoin accuracy, admin-only) ---------------- */
let SIGNAL_OUTCOMES = [];

async function loadSignalOutcomes(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_outcomes?select=*&order=noted_at.desc`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    SIGNAL_OUTCOMES = await res.json();
  }catch(e){
    console.error("Couldn't load signal outcomes:", e);
    SIGNAL_OUTCOMES = [];
  }
}

function signalAccuracyFor(symbol){
  const rows = SIGNAL_OUTCOMES.filter(o => o.symbol === symbol);
  const played = rows.filter(o => o.outcome === 'played_out').length;
  return { total: rows.length, played, pct: rows.length ? Math.round((played / rows.length) * 100) : null };
}

function outcomeFor(symbol, setup){
  return SIGNAL_OUTCOMES.find(o => o.symbol === symbol && o.setup === (setup || ''));
}

async function recordSignalOutcome(symbol, setup, outcome){
  if(!isAdminUser()) return;
  try{
    // Upserts on (symbol, setup) — re-clicking for the same setup updates the
    // existing row instead of adding a duplicate, so re-tallying is safe and
    // the button state is editable (you can change your mind).
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_outcomes?on_conflict=symbol,setup`, {
      method: 'POST',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal,resolution=merge-duplicates"
      },
      body: JSON.stringify([{ symbol, setup: setup || '', outcome, noted_at: new Date().toISOString() }])
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(e){
    console.error("Couldn't record signal outcome:", e);
    const hint = /relation .* does not exist/i.test(e.message) ? "\n\nLooks like the signal_outcomes table doesn't exist yet — run supabase_signal_outcomes.sql in your Supabase SQL editor."
      : /no unique or exclusion constraint/i.test(e.message) ? "\n\nYour signal_outcomes table is missing the UNIQUE(symbol, setup) constraint — re-run the latest supabase_signal_outcomes.sql in your Supabase SQL editor."
      : "";
    await customAlert("Couldn't save that — please try again." + hint);
    return;
  }
  await loadSignalOutcomes();
  renderAlertsTables();
  if(currentAlertDetailId !== null) openAlertDetail(currentAlertDetailId);
}

function fmtSignalVolume(vol){
  const n = parseFloat(vol);
  if(vol === null || vol === undefined || isNaN(n)) return '—';
  if(n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if(n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  if(n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function fmtSignalTime(ts){
  if(!ts) return '—';
  const d = new Date(ts);
  if(isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

function isNewSignal(s){
  return !s.seen;
}

async function markAlertSeen(id){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ seen: true })
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(e){
    console.error("Couldn't mark alert as seen:", e);
    return;
  }
  const s = SIGNAL_ALERTS.find(a => a.id === id);
  if(s) s.seen = true;
  refreshAllNavBadges();
  lastKnownUnseenAlertCount = SIGNAL_ALERTS.filter(isNewSignal).length;
}

async function deleteAlert(id){
  if(!(await customConfirm('Delete this alert? This cannot be undone.'))) return;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Prefer": "return=minimal"
      }
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(e){
    console.error("Couldn't delete alert:", e);
    showToast("Couldn't delete that alert — please try again.");
    return;
  }
  SIGNAL_ALERTS = SIGNAL_ALERTS.filter(s => s.id !== id);
  renderAlertsTables();
  refreshAllNavBadges();
  lastKnownUnseenAlertCount = SIGNAL_ALERTS.filter(isNewSignal).length;
}

function activeAlertsTab(){
  const el = document.querySelector('#view-alerts .subnav-item.active');
  return el ? el.dataset.tab : 'bitcoin';
}

async function markAllAlertsSeen(){
  const category = activeAlertsTab();
  const unseenIds = SIGNAL_ALERTS.filter(s => s.category === category && !s.seen).map(s => s.id);
  if(!unseenIds.length){ showToast('No new alerts to mark as read.'); return; }
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?id=in.(${unseenIds.join(',')})`, {
      method: 'PATCH',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ seen: true })
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(e){
    console.error("Couldn't mark alerts as read:", e);
    showToast("Couldn't mark alerts as read — please try again.");
    return;
  }
  SIGNAL_ALERTS.forEach(s => { if(unseenIds.includes(s.id)) s.seen = true; });
  renderAlertsTables();
  refreshAllNavBadges();
  lastKnownUnseenAlertCount = SIGNAL_ALERTS.filter(isNewSignal).length;
  showToast(`Marked ${unseenIds.length} alert${unseenIds.length>1?'s':''} as read`);
}

async function deleteOldAlerts(){
  const category = activeAlertsTab();
  const seenIds = SIGNAL_ALERTS.filter(s => s.category === category && s.seen).map(s => s.id);
  if(!seenIds.length){ showToast('No seen alerts to delete.'); return; }
  if(!(await customConfirm(`Delete ${seenIds.length} seen alert${seenIds.length>1?'s':''}? This cannot be undone.`))) return;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?id=in.(${seenIds.join(',')})`, {
      method: 'DELETE',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Prefer": "return=minimal"
      }
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(e){
    console.error("Couldn't delete old alerts:", e);
    showToast("Couldn't delete old alerts — please try again.");
    return;
  }
  SIGNAL_ALERTS = SIGNAL_ALERTS.filter(s => !seenIds.includes(s.id));
  renderAlertsTables();
  refreshAllNavBadges();
  lastKnownUnseenAlertCount = SIGNAL_ALERTS.filter(isNewSignal).length;
  showToast(`Deleted ${seenIds.length} seen alert${seenIds.length>1?'s':''}`);
}

function renderAlertsTables(){
  renderAlertsTableFor('bitcoin');
  renderAlertsTableFor('altcoin');
  const label = document.getElementById('alertsCountLabel');
  if(label){
    if(!SIGNAL_ALERTS.length){
      label.textContent = 'No alerts yet — check your bot scripts are running.';
    }else{
      const newCount = SIGNAL_ALERTS.filter(isNewSignal).length;
      label.textContent = `${SIGNAL_ALERTS.length} alert${SIGNAL_ALERTS.length===1?'':'s'}`
        + (newCount ? ` · 🆕 ${newCount} new` : '');
    }
  }
  const syncLabel = document.getElementById('alertsLastSync');
  if(syncLabel){
    syncLabel.textContent = lastAlertsSyncAt ? `Last synced: ${timeAgo(lastAlertsSyncAt)}` : '';
  }
}

function renderAlertsTableFor(category){
  const table = document.getElementById('alertsTable-' + category);
  if(!table) return;
  let rows = SIGNAL_ALERTS.filter(s => s.category === category);
  if(alertsSeenFilter === 'new') rows = rows.filter(isNewSignal);
  else if(alertsSeenFilter === 'seen') rows = rows.filter(s => !isNewSignal(s));

  if(rows.length === 0){
    table.innerHTML = `<tr><td style="padding:24px;color:var(--muted);">No alerts ${alertsSeenFilter === 'all' ? 'yet' : `in "${alertsSeenFilter}"`}.</td></tr>`;
    return;
  }

  const thead = `<thead><tr><th>Symbol</th><th>Setup</th><th>Volume</th><th>Received</th><th>Status</th><th style="text-align:right;"></th></tr></thead>`;
  const tbody = `<tbody>${rows.map(r => {
    let outcomeIcon = '';
    if(r.category === 'bitcoin' && isAdminUser()){
      const o = outcomeFor(r.symbol, r.setup || '');
      if(o) outcomeIcon = o.outcome === 'played_out' ? ' (Played Out)' : ' (Invalidated)';
    }
    const isNew = isNewSignal(r);
    return `
    <tr onclick='openAlertDetail(${r.id})' style="cursor:pointer;">
      <td>${r.symbol}</td>
      <td>${escapeHtml(r.setup) || '—'}${outcomeIcon}</td>
      <td>${fmtSignalVolume(r.volume)}</td>
      <td>${fmtSignalTime(r.alert_at)}</td>
      <td>${isNew ? '<span class="pill pill-blue">NEW</span>' : '<span class="pill pill-muted">Seen</span>'}</td>
      <td onclick="event.stopPropagation();" style="text-align:right;">
        <div style="display:inline-flex;align-items:center;gap:8px;">
          ${r.tradingview_url ? `<a class="link-btn" href="${r.tradingview_url}" target="_blank">${linkIconSVG()}</a>` : `<span class="link-btn disabled">—</span>`}
          ${!isNew ? `<button class="drawer-danger-btn" style="padding:4px 10px;font-size:11px;" onclick='deleteAlert(${r.id})'>${deleteIconSVG()}</button>` : ''}
        </div>
      </td>
    </tr>
  `;
  }).join('')}</tbody>`;
  table.innerHTML = thead + tbody;
}

function switchAlertsTab(tab){
  document.querySelectorAll('#view-alerts .subnav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('#view-alerts .subnav-panel').forEach(el => el.classList.toggle('active', el.id === 'alertsPanel-' + tab));
}

let currentAlertDetailId = null;

function openAlertDetail(id){
  const s = SIGNAL_ALERTS.find(x => x.id === id);
  if(!s) return;
  currentAlertDetailId = id;

  const alertTime = s.alert_at
    ? new Date(s.alert_at).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})
    : '—';

  let outcomeBlock = '';
  if(s.category === 'bitcoin' && isAdminUser()){
    const acc = signalAccuracyFor(s.symbol);
    const accLine = acc.total
      ? `${acc.played}/${acc.total} played out so far (${acc.pct}%)`
      : `No history logged yet — start tracking below.`;
    const setupKey = s.setup || '';
    const setupArg = JSON.stringify(setupKey);
    const existing = outcomeFor(s.symbol, setupKey);
    const playedCls = existing?.outcome === 'played_out' ? ' active-played' : '';
    const notCls = existing?.outcome === 'not_played_out' ? ' active-not' : '';
    outcomeBlock = `
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--rule);">
        <div style="margin-bottom:10px;font-size:12.5px;color:var(--muted);"><strong style="color:var(--ink);">Your accuracy:</strong> ${accLine}</div>
        <div style="display:flex;gap:10px;">
          <button class="outcome-btn${playedCls}" style="flex:1;" onclick='recordSignalOutcome(${JSON.stringify(s.symbol)}, ${setupArg}, "played_out")'>Played Out</button>
          <button class="outcome-btn${notCls}" style="flex:1;" onclick='recordSignalOutcome(${JSON.stringify(s.symbol)}, ${setupArg}, "not_played_out")'>Invalidated</button>
        </div>
        <div style="margin-top:8px;font-size:11px;color:var(--muted);">Tracking setup: "${setupKey || '—'}" — click again to change your answer.</div>
      </div>
    `;
  }

  document.getElementById('modalTitle').textContent = `${s.symbol} — ${s.setup || 'Alert'}`;
  document.getElementById('modalSub').textContent = `Time: ${alertTime}`;
  document.getElementById('modalBody').innerHTML = `
    <div style="margin-bottom:14px;white-space:pre-line;">${escapeHtml(s.message) || '—'}</div>
    <div style="margin-bottom:14px;"><strong>Volume:</strong> ${fmtSignalVolume(s.volume)}</div>
    ${s.tradingview_url ? `<div style="margin-top:16px;"><a href="${s.tradingview_url}" target="_blank" style="color:var(--accent);">View on TradingView →</a></div>` : ''}
    ${outcomeBlock}
  `;
  document.getElementById('tradeModal').classList.add('open');

  if(!s.seen){
    s.seen = true;
    markAlertSeen(s.id);
    renderAlertsTables();
  }
}

/* ---------------- Achievements (private per-user gallery) ---------------- */
let ACHIEVEMENTS = [];
let activeAchievementTab = 'all';
const ACH_CATEGORIES = ['Tournament', 'Withdrawal'];

async function loadAchievements(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/achievements?select=*&order=created_at.desc`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    ACHIEVEMENTS = await Promise.all(rows.map(async r => {
      const { data, error } = await sb.storage.from('achievements').createSignedUrl(r.image_path, 3600);
      return { ...r, imageUrl: error ? null : data.signedUrl };
    }));
  }catch(e){
    console.error("Couldn't load achievements:", e);
    ACHIEVEMENTS = [];
  }
  renderAchievementTabs();
  renderAchievementGrid();
}

function renderAchievementTabs(){
  const wrap = document.getElementById('achievementTabs');
  if(!wrap) return;
  const tabs = ['all', ...ACH_CATEGORIES];
  wrap.innerHTML = tabs.map(t =>
    `<div class="tab ${activeAchievementTab===t?'active':''}" onclick="switchAchievementTab('${t}')">${t==='all'?'All':t}</div>`
  ).join('');
}

function switchAchievementTab(tab){
  activeAchievementTab = tab;
  renderAchievementTabs();
  renderAchievementGrid();
}

function renderAchievementGrid(){
  const grid = document.getElementById('achievementGrid');
  if(!grid) return;
  const label = document.getElementById('achievementsCountLabel');
  if(label) label.textContent = `${ACHIEVEMENTS.length} achievement${ACHIEVEMENTS.length===1?'':'s'} uploaded`;

  const rows = activeAchievementTab === 'all' ? ACHIEVEMENTS : ACHIEVEMENTS.filter(a => a.category === activeAchievementTab);

  if(rows.length === 0){
    grid.innerHTML = `<div class="empty-state">No achievements in this category yet.</div>`;
    return;
  }

  grid.innerHTML = rows.map(a => `
    <div class="ach-card" onclick='openAchievementDetail(${a.id})'>
      ${a.imageUrl
        ? `<img src="${a.imageUrl}">`
        : `<div style="height:150px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;">Image unavailable</div>`}
      <div class="ach-card-body">
        <div class="subject">${escapeHtml(a.subject)}</div>
        ${a.body ? `<div class="body-text">${escapeHtml(a.body)}</div>` : ''}
        <div class="meta-row">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span class="pill ${a.category==='Tournament'?'pill-blue':'pill-green'}">${a.category}</span>
            ${a.category === 'Withdrawal' && a.amount != null ? `<span class="pill pill-orange">$${Number(a.amount).toFixed(2)}</span>` : ''}
          </div>
          <span class="date">${new Date(a.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
        </div>
      </div>
    </div>
  `).join('');
}

let editingAchievementId = null;

function toggleAchAmountField(){
  const isWithdrawal = document.getElementById('achCategory').value === 'Withdrawal';
  document.getElementById('achAmountRow').style.display = isWithdrawal ? 'block' : 'none';
}

function openAchievementModal(id){
  editingAchievementId = id || null;
  const a = id ? ACHIEVEMENTS.find(x => x.id === id) : null;

  document.getElementById('achModalTitle').textContent = a ? 'Edit Achievement' : '+ Add Achievement';
  document.getElementById('achCategory').value = a ? a.category : 'Tournament';
  document.getElementById('achAmount').value = a && a.amount != null ? a.amount : '';
  document.getElementById('achSubject').value = a ? a.subject : '';
  document.getElementById('achBody').value = a ? (a.body || '') : '';
  document.getElementById('achImage').value = '';
  document.getElementById('achImageHint').textContent = a ? 'Leave empty to keep the current image.' : '';
  document.getElementById('achUploadError').textContent = '';
  document.getElementById('achUploadBtn').textContent = a ? 'Save changes' : 'Upload';
  toggleAchAmountField();
  document.getElementById('achievementModal').classList.add('open');
}
function closeAchievementModal(){
  document.getElementById('achievementModal').classList.remove('open');
}

async function saveAchievement(){
  const category = document.getElementById('achCategory').value;
  const amount = category === 'Withdrawal' && document.getElementById('achAmount').value !== ''
    ? parseFloat(document.getElementById('achAmount').value)
    : null;
  const subject = document.getElementById('achSubject').value.trim();
  const body = document.getElementById('achBody').value.trim();
  const fileInput = document.getElementById('achImage');
  const file = fileInput.files[0];
  const errEl = document.getElementById('achUploadError');
  const btn = document.getElementById('achUploadBtn');
  errEl.textContent = '';

  if(!subject){ errEl.textContent = 'Subject is required.'; return; }
  if(!editingAchievementId && !file){ errEl.textContent = 'Please choose an image.'; return; }

  btn.disabled = true;
  btn.textContent = editingAchievementId ? 'Saving…' : 'Uploading…';

  try{
    const { data: { user } } = await sb.auth.getUser();
    const existing = editingAchievementId ? ACHIEVEMENTS.find(a => a.id === editingAchievementId) : null;
    let imagePath = existing ? existing.image_path : null;

    if(file){
      const newPath = `${user.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const { error: uploadErr } = await sb.storage.from('achievements').upload(newPath, file);
      if(uploadErr) throw uploadErr;
      if(existing) await sb.storage.from('achievements').remove([existing.image_path]);
      imagePath = newPath;
    }

    const res = editingAchievementId
      ? await fetch(`${SUPABASE_URL}/rest/v1/achievements?id=eq.${editingAchievementId}`, {
          method: 'PATCH',
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({ category, subject, body, amount, image_path: imagePath })
        })
      : await fetch(`${SUPABASE_URL}/rest/v1/achievements`, {
          method: 'POST',
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify([{ category, subject, body, amount, image_path: imagePath }])
        });
    if(!res.ok) throw new Error(await res.text());

    closeAchievementModal();
    closeAchievementDetail();
    await loadAchievements();
  }catch(e){
    console.error("Couldn't save achievement:", e);
    const msg = e?.message || e?.error_description || String(e);
    let hint = '';
    if(/bucket not found/i.test(msg)) hint = ' The "achievements" storage bucket doesn\'t exist yet — create it in Supabase Storage (Storage > New bucket, name it exactly "achievements", Public OFF).';
    else if(/row-level security/i.test(msg)) hint = ' Missing storage permissions — re-run the storage policy section of supabase_achievements.sql in the SQL editor.';
    else if(/relation .* does not exist/i.test(msg)) hint = ' The achievements table doesn\'t exist yet — run supabase_achievements.sql in the SQL editor.';
    errEl.textContent = "Couldn't save: " + msg + hint;
  }finally{
    btn.disabled = false;
    btn.textContent = editingAchievementId ? 'Save changes' : 'Upload';
  }
}

async function deleteAchievement(id, imagePath){
  if(!(await customConfirm('Delete this achievement?'))) return;
  try{
    await sb.storage.from('achievements').remove([imagePath]);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/achievements?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    closeAchievementDetail();
    await loadAchievements();
  }catch(e){
    console.error("Couldn't delete achievement:", e);
    await customAlert("Couldn't delete — please try again.");
  }
}

function openAchievementDetail(id){
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if(!a) return;
  document.getElementById('achDetailImg').src = a.imageUrl || '';
  document.getElementById('achDetailSubject').textContent = a.subject;
  document.getElementById('achDetailCategory').textContent = a.category;
  document.getElementById('achDetailCategory').className = 'pill ' + (a.category === 'Tournament' ? 'pill-blue' : 'pill-green');
  const amountEl = document.getElementById('achDetailAmount');
  if(a.category === 'Withdrawal' && a.amount != null){
    amountEl.textContent = `$${Number(a.amount).toFixed(2)}`;
    amountEl.style.display = 'inline-flex';
  }else{
    amountEl.style.display = 'none';
  }
  document.getElementById('achDetailDate').textContent = new Date(a.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  document.getElementById('achDetailBody').textContent = a.body || '—';
  document.getElementById('achDetailEditBtn').onclick = () => { closeAchievementDetail(); openAchievementModal(id); };
  document.getElementById('achDetailDeleteBtn').onclick = () => deleteAchievement(id, a.image_path);
  document.getElementById('achievementDetailModal').classList.add('open');
}
function closeAchievementDetail(){
  document.getElementById('achievementDetailModal').classList.remove('open');
}

function openLightbox(url){
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightboxModal').classList.add('open');
}
function closeLightbox(){
  document.getElementById('lightboxModal').classList.remove('open');
}

/* ---------------- Economic Calendar (own data, fed by economic_calendar_bot.py) ---------------- */
let ECON_EVENTS = [];
let selectedEconDate = null;
let econCalMonth = new Date();
let activeEconImpactFilters = new Set(['High','Medium','Low','Holiday']);
const ECON_IMPACT_LEVELS = ['High','Medium','Low','Holiday'];
const ECON_IMPACT_RANK = {high:0, medium:1, low:2, holiday:3};

function sortEconEventsByImpact(events){
  return [...events].sort((a,b) => {
    const rankDiff = (ECON_IMPACT_RANK[(a.impact||'').toLowerCase()] ?? 9) - (ECON_IMPACT_RANK[(b.impact||'').toLowerCase()] ?? 9);
    if(rankDiff !== 0) return rankDiff;
    return new Date(a.event_date) - new Date(b.event_date);
  });
}
let lastEconSyncAt = null;
let econSyncLabelTimer = null;

async function loadMarketNewsWidget(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/economic_events?select=*&order=event_date.asc`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
    });
    if(!res.ok) throw new Error(await res.text());
    ECON_EVENTS = await res.json();
    lastEconSyncAt = new Date();
  }catch(e){
    console.error("Couldn't load economic events:", e);
    ECON_EVENTS = [];
  }
  renderEconSyncLabel();
  clearInterval(econSyncLabelTimer);
  econSyncLabelTimer = setInterval(renderEconSyncLabel, 30000);

  // A previously-selected date or displayed month can go stale once a fresh
  // sync replaces the underlying data (e.g. old "this week" rows superseded
  // by a full month) — drop them so we re-pick sensibly below instead of
  // showing a day/month that no longer matches what's actually loaded.
  if(ECON_EVENTS.length){
    const selectionStillValid = selectedEconDate && ECON_EVENTS.some(e => new Date(e.event_date).toDateString() === selectedEconDate);
    if(!selectionStillValid) selectedEconDate = null;

    // No valid prior selection (first visit, or it just went stale) —
    // default to today so there's something to see right away.
    if(!selectedEconDate){
      selectedEconDate = new Date().toDateString();
      econCalMonth = new Date();
    }

    const displayedMonthHasData = ECON_EVENTS.some(e => {
      const d = new Date(e.event_date);
      return d.getFullYear() === econCalMonth.getFullYear() && d.getMonth() === econCalMonth.getMonth();
    });
    if(!displayedMonthHasData){
      econCalMonth = new Date(ECON_EVENTS[0].event_date);
    }
  }

  renderEconImpactFilterRow();
  renderEconCalGrid();
  refreshAllNavBadges();
}

function renderEconSyncLabel(){
  const el = document.getElementById('econLastSync');
  if(el) el.textContent = lastEconSyncAt ? `Last synced: ${timeAgo(lastEconSyncAt)}` : '';
}

function renderEconImpactFilterRow(){
  const row = document.getElementById('econImpactFilterRow');
  if(!row) return;
  const allActive = ECON_IMPACT_LEVELS.every(l => activeEconImpactFilters.has(l));
  const tags = [`<span class="tag-filter ${allActive?'active':''}" onclick="setEconImpactFilterAll()">All</span>`]
    .concat(ECON_IMPACT_LEVELS.map(l =>
      `<span class="tag-filter ${activeEconImpactFilters.has(l)?'active':''}" onclick="toggleEconImpactFilter('${l}')">${l}</span>`
    ));
  row.innerHTML = tags.join('');
}

function toggleEconImpactFilter(level){
  if(activeEconImpactFilters.has(level)){
    if(activeEconImpactFilters.size === 1) return; // keep at least one level selected
    activeEconImpactFilters.delete(level);
  }else{
    activeEconImpactFilters.add(level);
  }
  renderEconImpactFilterRow();
  renderEconCalGrid();
}

function setEconImpactFilterAll(){
  activeEconImpactFilters = new Set(ECON_IMPACT_LEVELS);
  renderEconImpactFilterRow();
  renderEconCalGrid();
}

function filteredEconEvents(){
  return ECON_EVENTS.filter(e => {
    const level = ECON_IMPACT_LEVELS.find(l => l.toLowerCase() === (e.impact||'').toLowerCase());
    return level && activeEconImpactFilters.has(level);
  });
}

function shiftEconCalMonth(dir){
  econCalMonth.setMonth(econCalMonth.getMonth() + dir);
  renderEconCalGrid();
}

function renderEconCalGrid(){
  const grid = document.getElementById('econCalGrid');
  if(!grid) return;

  const y = econCalMonth.getFullYear(), m = econCalMonth.getMonth();
  const labelEl = document.getElementById('econCalLabel');
  if(labelEl) labelEl.textContent = econCalMonth.toLocaleDateString('en-US',{month:'long', year:'numeric'});

  const byDay = {};
  filteredEconEvents().forEach(e => {
    const d = new Date(e.event_date);
    if(d.getFullYear() !== y || d.getMonth() !== m) return;
    const key = d.getDate();
    if(!byDay[key]) byDay[key] = [];
    byDay[key].push(e);
  });

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const todayStr = new Date().toDateString();

  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');

  for(let i=0;i<firstDow;i++) html += `<div class="cal-cell empty"></div>`;

  for(let d=1; d<=daysInMonth; d++){
    const dateObj = new Date(y, m, d);
    const dateStr = dateObj.toDateString();
    const events = byDay[d] || [];
    const impacts = new Set(events.map(e => (e.impact||'').toLowerCase()));
    const dots = ['high','medium','low'].filter(i => impacts.has(i)).map(i => `<span class="econ-impact-dot econ-impact-${i}"></span>`).join('');
    const cls = [
      events.length ? 'has-events' : '',
      dateStr === todayStr ? 'today' : '',
      dateStr === selectedEconDate ? 'selected' : ''
    ].filter(Boolean).join(' ');
    const click = events.length ? `onclick="selectEconDay('${dateStr}')"` : '';
    html += `
      <div class="cal-cell econ-cal-cell ${cls}" ${click}>
        <div class="d">${d}</div>
        ${events.length ? `<div class="econ-cell-dots">${dots}</div><div class="econ-cell-count">${events.length}</div>` : ''}
      </div>
    `;
  }

  grid.innerHTML = html;
  renderEconCalDetail();
}

function selectEconDay(key){
  selectedEconDate = key;
  renderEconCalGrid();
}

function renderEconCalDetail(){
  const titleEl = document.getElementById('econCalDetailTitle');
  const bodyEl = document.getElementById('econCalDetailBody');
  if(!titleEl || !bodyEl) return;

  if(!selectedEconDate){
    titleEl.textContent = 'Select a day';
    bodyEl.innerHTML = `<div class="empty-state">Click a day with events to see its details here.</div>`;
    return;
  }

  const dayEvents = sortEconEventsByImpact(
    filteredEconEvents().filter(e => new Date(e.event_date).toDateString() === selectedEconDate)
  );

  titleEl.textContent = new Date(selectedEconDate).toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric'});

  bodyEl.innerHTML = dayEvents.map(e => {
    const time = new Date(e.event_date).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    const impact = (e.impact||'').toLowerCase();
    const impactClass = impact==='high' ? 'pill-red' : impact==='medium' ? 'pill-orange' : impact==='holiday' ? 'pill-blue' : 'pill-muted';
    const values = [
      e.forecast ? `Forecast: ${escapeHtml(e.forecast)}` : '',
      e.previous ? `Previous: ${escapeHtml(e.previous)}` : '',
      e.actual ? `Actual: ${escapeHtml(e.actual)}` : ''
    ].filter(Boolean).map(v => `<span>${v}</span>`).join('');
    return `
      <div class="econ-event-row" onclick="openEconEventModal(${e.id})" style="cursor:pointer;">
        <div class="econ-event-time">${time}</div>
        <div class="econ-event-main">
          <div class="econ-event-title">${escapeHtml(e.country || '')} — ${escapeHtml(e.title)}</div>
          ${values ? `<div class="econ-event-values">${values}</div>` : ''}
        </div>
        <span class="pill ${impactClass}">${escapeHtml(e.impact || '—')}</span>
      </div>
    `;
  }).join('') || `<div class="empty-state">No events this day.</div>`;
}

// Plain-language explanations for the most common recurring indicators —
// used as a fallback whenever TradingView's own "comment" field is empty
// for that specific event (which is common), matched by keyword against
// the event title. Includes a Tagalog version since not every trader knows
// these terms by their English name.
const ECON_GLOSSARY = [
  { keywords: ['unemployment rate'],
    en: "The percentage of the labor force that is jobless and actively looking for work. A rising rate usually signals a weakening economy; a falling rate signals a strengthening one.",
    tl: "Ang porsyento ng mga tao sa labor force na walang trabaho pero aktibong naghahanap. Kapag tumataas ito, senyales ng humihinang ekonomiya; kapag bumababa, senyales ng lumalakas na ekonomiya." },
  { keywords: ['non farm payrolls', 'nonfarm payrolls', 'nfp'],
    en: "The number of new jobs added in the US economy (excluding farm workers). One of the most-watched US reports — a strong number often strengthens the US dollar, a weak number often weakens it.",
    tl: "Bilang ng bagong trabahong naidagdag sa ekonomiya ng US (hindi kasama ang agrikultura). Isa sa pinaka-binabantayang report — kapag malakas ang resulta, karaniwang lumalakas ang US dollar; kapag mahina, humihina." },
  { keywords: ['core cpi', 'cpi'],
    en: "Measures the average change in prices consumers pay for goods and services — the main gauge of inflation. Higher-than-expected CPI often pushes central banks toward raising interest rates.",
    tl: "Sinusukat ang pagbabago sa presyo ng mga bilihin at serbisyo — pangunahing panukat ng inflation. Kapag mas mataas sa inaasahan, karaniwang tumataas ang posibilidad na itaas ng central bank ang interest rate." },
  { keywords: ['gdp'],
    en: "The total value of goods and services produced by a country — the broadest measure of economic growth. Higher growth is generally positive for that country's currency.",
    tl: "Kabuuang halaga ng mga produkto at serbisyong ginawa ng isang bansa — pangkalahatang sukatan ng paglago ng ekonomiya. Mas mataas na paglago ay karaniwang positibo para sa currency ng bansang iyon." },
  { keywords: ['interest rate decision', 'rate decision', 'cash rate', 'ocr'],
    en: "The central bank's announcement of whether it's raising, cutting, or holding its benchmark interest rate. Usually the single biggest market-moving event for a currency.",
    tl: "Anunsyo ng central bank kung itataas, ibababa, o pananatilihin ang benchmark interest rate. Karaniwang ito ang pinakamalaking pwedeng magpagalaw ng presyo ng currency." },
  { keywords: ['manufacturing pmi', 'services pmi', 'composite pmi', ' pmi'],
    en: "A survey-based reading of business conditions. Above 50 means the sector is expanding, below 50 means it's contracting.",
    tl: "Sukatan mula sa survey ng mga business conditions. Kapag lampas 50, lumalago ang sektor; kapag mas mababa sa 50, humihina/nagko-contract ito." },
  { keywords: ['retail sales'],
    en: "Measures the total value of sales at the retail level — a key sign of consumer spending strength, which drives most economies.",
    tl: "Sinusukat ang kabuuang benta sa antas ng retail — mahalagang senyales ng lakas ng paggastos ng consumer, na siyang pangunahing nagpapatakbo ng karamihan ng ekonomiya." },
  { keywords: ['trade balance'],
    en: "The difference between a country's exports and imports. A surplus (more exports) is usually positive for the currency; a deficit (more imports) can be negative.",
    tl: "Ang pagkakaiba ng exports at imports ng isang bansa. Ang surplus (mas maraming exports) ay karaniwang positibo para sa currency; ang deficit (mas maraming imports) ay maaaring negatibo." },
  { keywords: ['ppi', 'producer price'],
    en: "Measures the average change in prices that producers/businesses receive for their goods — an early signal of inflation before it reaches consumers.",
    tl: "Sinusukat ang pagbabago sa presyong natatanggap ng mga producer/negosyo — maagang senyales ng inflation bago ito umabot sa consumer." },
  { keywords: ['consumer confidence', 'consumer sentiment'],
    en: "Measures how optimistic consumers feel about the economy and their own finances. Higher confidence usually means more spending ahead.",
    tl: "Sinusukat kung gaano ka-optimistiko ang mga consumer sa ekonomiya at sa sarili nilang pananalapi. Mas mataas na confidence ay senyales ng mas maraming paggastos sa hinaharap." },
  { keywords: ['building permits', 'housing starts'],
    en: "Tracks new construction activity — a leading indicator of economic strength since building requires confidence in future demand.",
    tl: "Sinusubaybayan ang bagong construction activity — maagang senyales ng lakas ng ekonomiya dahil nangangailangan ng tiwala sa hinaharap na pangangailangan ang pagtatayo." },
  { keywords: ['jobless claims', 'unemployment claims'],
    en: "The number of people filing for unemployment benefits for the first time in a given week — a fast-moving, weekly gauge of labor market health.",
    tl: "Bilang ng mga taong unang beses na nag-apply ng unemployment benefits sa isang linggo — mabilis at lingguhang sukatan ng kalusugan ng labor market." },
  { keywords: ['fomc'],
    en: "The US Federal Reserve's policy statement or detailed meeting notes — markets scan these closely for hints about future rate moves.",
    tl: "Pahayag o detalyadong tala ng miting ng US Federal Reserve — maingat itong sinusuri ng merkado para sa mga senyales ng susunod na galaw sa interest rate." },
  { keywords: [' speaks', 'speech'],
    en: "A central bank official speaking publicly — markets watch for any hint about future monetary policy direction.",
    tl: "Pampublikong pananalita ng isang opisyal ng central bank — binabantayan ng merkado ang anumang senyales tungkol sa hinaharap na direksyon ng patakaran sa pananalapi." },
  { keywords: ['employment change'],
    en: "The net number of jobs added or lost in the economy over the period — similar to Non-Farm Payrolls but used by other countries.",
    tl: "Netong bilang ng trabahong naidagdag o nawala sa ekonomiya sa loob ng panahong ito — halos katulad ng Non-Farm Payrolls pero ginagamit ng ibang bansa." }
];

function findEconGlossaryEntry(title){
  const t = (title || '').toLowerCase();
  return ECON_GLOSSARY.find(g => g.keywords.some(k => t.includes(k))) || null;
}

let econEventLangIsTagalog = false;

function openEconEventModal(id){
  const e = ECON_EVENTS.find(x => x.id === id);
  if(!e) return;

  // Track this event's position within its day's list (same order shown in
  // the side panel) so Previous/Next can step through without closing the popup.
  const dayList = sortEconEventsByImpact(
    filteredEconEvents().filter(x => new Date(x.event_date).toDateString() === selectedEconDate)
  );
  const dayIndex = dayList.findIndex(x => x.id === id);
  window._econEventDayList = dayList;
  window._econEventDayIndex = dayIndex;

  const prevBtn = document.getElementById('econEventPrevBtn');
  const nextBtn = document.getElementById('econEventNextBtn');
  prevBtn.disabled = dayIndex <= 0;
  nextBtn.disabled = dayIndex < 0 || dayIndex >= dayList.length - 1;

  const impact = (e.impact||'').toLowerCase();
  const impactClass = impact==='high' ? 'pill-red' : impact==='medium' ? 'pill-orange' : impact==='holiday' ? 'pill-blue' : 'pill-muted';

  document.getElementById('econEventTitle').textContent = `${e.country ? e.country + ' — ' : ''}${e.title}`;
  const impactEl = document.getElementById('econEventImpact');
  impactEl.textContent = e.impact || '—';
  impactEl.className = 'pill ' + impactClass;
  document.getElementById('econEventDate').textContent = new Date(e.event_date).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});

  const values = [
    { label: 'Forecast', value: e.forecast },
    { label: 'Previous', value: e.previous },
    { label: 'Actual', value: e.actual }
  ].filter(v => v.value);
  document.getElementById('econEventValues').innerHTML = values.map(v => `
    <div class="acc-stat-box">
      <div class="acc-stat-label">${v.label}</div>
      <div class="acc-stat-value">${escapeHtml(String(v.value))}</div>
    </div>
  `).join('') || '';

  econEventLangIsTagalog = false;
  window._econEventGlossary = findEconGlossaryEntry(e.title);
  window._econEventComment = e.comment || null;
  window._econEventCommentTl = e.comment_tl || null;

  document.getElementById('econEventCommentWrap').style.display = window._econEventComment ? 'block' : 'none';

  // One toggle for the whole modal — shown whenever there's at least one
  // Tagalog version available (glossary match and/or a translated comment).
  const anyTagalogAvailable = !!window._econEventGlossary || !!window._econEventCommentTl;
  document.getElementById('econEventLangBtn').style.display = anyTagalogAvailable ? 'inline-block' : 'none';

  renderEconEventDescription();
  document.getElementById('econEventModal').classList.add('open');
}

function renderEconEventDescription(){
  const glossary = window._econEventGlossary;
  const glossaryWrap = document.getElementById('econEventGlossaryWrap');
  glossaryWrap.style.display = glossary ? 'block' : 'none';

  const langBtn = document.getElementById('econEventLangBtn');
  langBtn.textContent = 'Translate';
  langBtn.classList.toggle('active-translate', econEventLangIsTagalog);
  langBtn.title = econEventLangIsTagalog ? 'Showing Tagalog — click to switch back to English' : 'Click to translate to Tagalog';
  if(glossary){
    document.getElementById('econEventGlossaryText').textContent = econEventLangIsTagalog ? glossary.tl : glossary.en;
  }

  if(window._econEventComment){
    document.getElementById('econEventComment').textContent = (econEventLangIsTagalog && window._econEventCommentTl)
      ? window._econEventCommentTl
      : window._econEventComment;
  }
}

function toggleEconEventLang(){
  econEventLangIsTagalog = !econEventLangIsTagalog;
  renderEconEventDescription();
}

function closeEconEventModal(){
  document.getElementById('econEventModal').classList.remove('open');
}

function navigateEconEvent(dir){
  const list = window._econEventDayList || [];
  const newIndex = (window._econEventDayIndex ?? 0) + dir;
  if(newIndex < 0 || newIndex >= list.length) return;
  openEconEventModal(list[newIndex].id);
}

/* ---------------- Challenges ---------------- */

// Forging/blacksmith-themed marks — the team likens trading discipline to
// forging metal (paghahasa): each rep on the anvil sharpens the craft.
const CHALLENGE_ICONS = {
  shield: '<path d="M4 15h11l3-4h2v4a2 2 0 0 1-2 2H8L4 15z"/><path d="M7 17v4M17 17v4"/>', // anvil
  'shield-check': '<path d="M4 15h11l3-4h2v4a2 2 0 0 1-2 2H8L4 15z"/><path d="M7 17v4M17 17v4"/><path d="M8.5 10l1.5 1.5L13 8"/>', // anvil, verified
  scale: '<path d="M8 3 4 10l3 2 4-7"/><path d="M16 3l4 7-3 2-4-7"/><path d="M7 12l5 9 5-9"/>', // tongs
  flame: '<path d="M12 2c-2 4-6 6-6 11a6 6 0 0 0 12 0c0-2-1-3-2-4 0 2-1 3-2 3-1.5 0-2-1.5-1-3 1-2 0-5-1-7z"/>', // forge fire
  'trending-up': '<path d="M15 4l5 5-3 3-5-5 3-3z"/><path d="M13 8 4 17l3 3 9-9"/>', // hammer striking up
  'trending-down': '<path d="M9 20l-5-5 3-3 5 5-3 3z"/><path d="M11 16 20 7l-3-3-9 9"/>', // hammer striking down
  octagon: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86"/><path d="M9 12l2 2 4-4"/>', // maker's stamp
  'bar-chart': '<path d="M4 18l1-3h6l1 3-2 2H6l-2-2z"/><path d="M4 12l1-3h6l1 3-2 2H6l-2-2z"/>', // stacked ingots
  compass: '<path d="M12 2 9 14h6L12 2z"/><path d="M9 14l-2 8h10l-2-8"/>', // chisel
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  refresh: '<path d="M3 8l9-3 9 3v8l-9 3-9-3V8z"/><path d="M3 8l9 3 9-3M12 11v10"/>', // bellows
  dollar: '<path d="M5 16 7 8h10l2 8-4 3H9l-4-3z"/>', // ingot
  trophy: '<path d="M8 21V11a4 4 0 0 1 8 0v10"/><circle cx="8" cy="21" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="21" r="1.3" fill="currentColor" stroke="none"/>', // horseshoe
  percent: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><path d="M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.5 3.5M8.5 15.5 5 19"/>', // hammer sparks
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>', // anvil face rings
  ban: '<path d="M8 3 5 9l2 1 3-6"/><path d="M16 3l3 6-2 1-3-6"/><path d="M7 10l5 4 5-4"/>', // tongs shut
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  medal: '<path d="M8 21V13a4 4 0 0 1 8 0v8"/><circle cx="8" cy="21" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="21" r="1.3" fill="currentColor" stroke="none"/><path d="M9 13a3 3 0 0 1 6 0"/>', // horseshoe, hung
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  shuffle: '<rect x="3" y="8" width="8" height="10" rx="4"/><rect x="13" y="8" width="8" height="10" rx="4"/>', // forged chain link
  hash: '<circle cx="7" cy="7" r="1.6" fill="currentColor" stroke="none"/><circle cx="17" cy="7" r="1.6" fill="currentColor" stroke="none"/><circle cx="7" cy="17" r="1.6" fill="currentColor" stroke="none"/><circle cx="17" cy="17" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>', // rivets
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  zap: '<path d="M15 4l5 5-3 3-5-5 3-3z"/><path d="M13 8 7 14"/><path d="M3 17l2-1M3 20h3M2 14l2 1"/>' // hammer strike
};
function challengeIconSVG(name){
  return `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${CHALLENGE_ICONS[name] || CHALLENGE_ICONS.star}</svg>`;
}

// Thresholds are spaced across the full point pool from all 26 challenges
// (~1980 points max) so "Legendary" still means having done nearly
// everything, instead of capping out with lots of unused headroom.
const CHALLENGE_RANKS = [
  {min:0, label:'Raw Ore'},
  {min:250, label:'Kindled'},
  {min:500, label:'Hammered'},
  {min:800, label:'Tempered'},
  {min:1150, label:'Sharpened'},
  {min:1500, label:'Master Forger'},
  {min:1850, label:'Legendary Blade'}
];
function rankForPoints(points){
  let current = CHALLENGE_RANKS[0], next = null;
  for(const r of CHALLENGE_RANKS){
    if(points >= r.min) current = r; else { next = r; break; }
  }
  return { current, next };
}

let COMPUTED_CHALLENGES = [];
let challengeFilter = 'all';

function getWeekKey(d){
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

async function loadAchievementSummaryForChallenges(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/achievements?select=category,created_at,amount`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    return await res.json();
  }catch(e){
    console.error("Couldn't load achievement summary:", e);
    return [];
  }
}

function computeChallenges(trades, achRows){
  const closed = trades.filter(t => t.close_date).sort((a,b) => a.close_date - b.close_date);
  const recentFirst = [...closed].reverse();

  // 1. No Overtrading — max 3 trades/day, longest streak of qualifying days
  const byDay = {};
  closed.forEach(t => {
    const key = t.close_date.toISOString().slice(0,10);
    byDay[key] = (byDay[key] || 0) + 1;
  });
  const days = Object.keys(byDay).sort();
  let dayStreak = 0, maxDayStreak = 0;
  days.forEach(d => {
    if(byDay[d] <= 3){ dayStreak++; maxDayStreak = Math.max(maxDayStreak, dayStreak); }
    else dayStreak = 0;
  });
  const c1 = {
    icon:'shield', title:'No Overtrading', points:60,
    desc:'Max 3 trades per day, for consecutive days.',
    howTo:'We look at your closed trades grouped by day. Any day with 3 or fewer trades counts toward the streak; a day with 4+ trades resets it to zero. Levels: 3, 7, 14, 21, 30 days in a row.',
    current: maxDayStreak, tiers: [3, 7, 14, 21, 30], target: 30, done: maxDayStreak >= 30
  };

  // 2. Risk:Reward Discipline — streak of RR >= 2 (most recent first)
  let rrStreak = 0;
  for(const t of recentFirst){
    if(t.rr !== null && !isNaN(t.rr) && t.rr >= 2) rrStreak++;
    else break;
  }
  const c2 = {
    icon:'scale', title:'Risk:Reward Discipline', points:80,
    desc:'Consecutive trades with an RR of at least 1:2.',
    howTo:'Counted from your most recent trade backwards, using the RR value you log per trade. As soon as one trade has RR below 2, the streak resets. Levels: 2, 5, 10, 15, 20 in a row.',
    current: rrStreak, tiers: [2, 5, 10, 15, 20], target: 20, done: rrStreak >= 20
  };

  // 3. Iron Discipline — streak of rules_followed = Yes
  let rulesStreak = 0;
  for(const t of recentFirst){
    if((t.rules_followed || '').toLowerCase() === 'yes') rulesStreak++;
    else break;
  }
  const c3 = {
    icon:'shield-check', title:'Iron Discipline', points:100,
    desc:'Consecutive trades where you followed your rules 100%.',
    howTo:'Based on the "Rules Followed" field you set on each trade. Mark it "Yes" on consecutive trades (most recent first) to build this streak — one "No" resets it to zero. Levels: 2, 5, 10, 15, 20 in a row.',
    current: rulesStreak, tiers: [2, 5, 10, 15, 20], target: 20, done: rulesStreak >= 20
  };

  // 4. Hot Streak — consecutive winning weeks (grouped Mon-Sun)
  const byWeek = {};
  closed.forEach(t => {
    const key = getWeekKey(t.close_date);
    byWeek[key] = (byWeek[key] || 0) + (t.profit_loss || 0);
  });
  const weekKeys = Object.keys(byWeek).sort();
  let weekStreak = 0, maxWeekStreak = 0;
  weekKeys.forEach(w => {
    if(byWeek[w] > 0){ weekStreak++; maxWeekStreak = Math.max(maxWeekStreak, weekStreak); }
    else weekStreak = 0;
  });
  const c4 = {
    icon:'flame', title:'Hot Streak', points:90,
    desc:'Consecutive winning weeks (positive total P/L per week).',
    howTo:'Your closed trades are grouped into Monday–Sunday weeks and summed by total P/L. Every week with a positive total extends the streak; a negative week resets it. Levels: 1, 2, 3, 4, 5 winning weeks in a row.',
    current: maxWeekStreak, tiers: [1, 2, 3, 4, 5], target: 5, done: maxWeekStreak >= 5
  };

  // 5. Efficient Edge — profit factor over the last 100 trades, leveled up
  const last100 = recentFirst.slice(0, 100);
  const gw = last100.filter(t => t.profit_loss > 0).reduce((s,t) => s + t.profit_loss, 0);
  const gl = Math.abs(last100.filter(t => t.profit_loss < 0).reduce((s,t) => s + t.profit_loss, 0));
  const pf = gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0);
  const pfDisplay = last100.length >= 100 ? Math.min(pf === Infinity ? 2 : pf, 2) : 0;
  const c5 = {
    icon:'trending-up', title:'Efficient Edge', points:100,
    desc:'Profit factor over your last 100 trades.',
    howTo:'Profit factor = total gross wins ÷ total gross losses, over your most recent 100 closed trades (needs at least 100 logged). Levels: 1.0, 1.2, 1.5, 1.8, 2.0 profit factor.',
    current: pfDisplay, tiers: [1, 1.2, 1.5, 1.8, 2], target: 2, done: last100.length >= 100 && pf >= 2,
    statOverride: last100.length >= 100 ? `Profit factor: ${pf===Infinity?'∞':pf.toFixed(2)}` : `${last100.length}/100 trades so far`
  };

  // 6. Shrinking Losses — % your avg loss size improved vs the previous 20 trades
  const last20 = recentFirst.slice(0, 20);
  const prev20 = recentFirst.slice(20, 40);
  const avgLoss = arr => {
    const losses = arr.filter(t => t.profit_loss < 0);
    return losses.length ? losses.reduce((s,t) => s + t.profit_loss, 0) / losses.length : 0;
  };
  const recentAvgLoss = avgLoss(last20), prevAvgLoss = avgLoss(prev20);
  const improvementPct = prev20.length > 0 && prevAvgLoss !== 0
    ? Math.max(0, ((Math.abs(prevAvgLoss) - Math.abs(recentAvgLoss)) / Math.abs(prevAvgLoss)) * 100)
    : 0;
  const c6 = {
    icon:'trending-down', title:'Shrinking Losses', points:70,
    desc:'Your average loss size, shrinking vs your previous 20 trades.',
    howTo:'We compare the average losing trade size in your most recent 20 trades against the 20 before that. Levels: 5%, 10%, 20%, 35%, 50% smaller average loss.',
    current: improvementPct, tiers: [5, 10, 20, 35, 50], target: 50, done: prev20.length > 0 && improvementPct >= 50,
    statOverride: prev20.length > 0 ? `Now: $${Math.abs(recentAvgLoss).toFixed(2)} · Before: $${Math.abs(prevAvgLoss).toFixed(2)}` : 'Needs more trades to compare.'
  };

  // 7. Drawdown Guard — tighter max-drawdown control over time
  let peak = 0, maxDD = 0, cum = 0;
  closed.forEach(t => {
    cum += t.profit_loss || 0;
    peak = Math.max(peak, cum);
    const dd = peak > 0 ? (peak - cum) / peak * 100 : 0;
    maxDD = Math.max(maxDD, dd);
  });
  const ddSafety = peak > 0 ? Math.max(0, 100 - maxDD) : 0;
  const c7 = {
    icon:'octagon', title:'Drawdown Guard', points:90,
    desc:'Keep your max drawdown tight against peak equity.',
    howTo:'Built from your cumulative equity curve — the biggest drop from any peak to the lowest point after it, as a percentage of that peak. Levels: staying under 50%, 40%, 30%, 20%, 10% max drawdown.',
    current: ddSafety, tiers: [50, 60, 70, 80, 90], target: 90, done: peak > 0 && maxDD < 10,
    statOverride: peak > 0 ? `Max drawdown: ${maxDD.toFixed(1)}%` : 'Not enough data yet.'
  };

  // 8. Consistent Volume — trades logged this month
  const now = new Date();
  const thisMonthTrades = closed.filter(t => t.close_date.getFullYear() === now.getFullYear() && t.close_date.getMonth() === now.getMonth());
  const c8 = {
    icon:'bar-chart', title:'Consistent Volume', points:60,
    desc:'Trades logged this month — showing up consistently, not a quota.',
    howTo:'A simple count of your closed trades where the close date falls in the current calendar month. Levels: 5, 10, 20, 40, 60 trades — resets each month. This tracks consistency, not a target; never force a trade just to move this number.',
    current: thisMonthTrades.length, tiers: [5, 10, 20, 40, 60], target: 60, done: thisMonthTrades.length >= 60
  };

  // 9. Explorer — different setups used this month
  const setupsThisMonth = new Set(thisMonthTrades.map(t => t.trade_setup).filter(Boolean));
  const c9 = {
    icon:'compass', title:'Explorer', points:50,
    desc:'Different setups used this month.',
    howTo:'Counts the number of distinct values in your "Trade Setup" field across this month\'s closed trades. Levels: 1, 2, 3, 5, 8 different setups. Only count setups you\'d genuinely take — don\'t force an unfamiliar one just to add to this.',
    current: setupsThisMonth.size, tiers: [1, 2, 3, 5, 8], target: 8, done: setupsThisMonth.size >= 8
  };

  // 10. Clean Week — most recent week had zero losses
  const lastWeekKey = weekKeys[weekKeys.length - 1];
  const lastWeekTrades = closed.filter(t => getWeekKey(t.close_date) === lastWeekKey);
  const lastWeekLossCount = lastWeekTrades.filter(t => (t.win_loss || '').toLowerCase() === 'loss').length;
  let cleanWeekStreak = 0, maxCleanWeekStreak = 0;
  weekKeys.forEach(w => {
    const weekTrades = closed.filter(t => getWeekKey(t.close_date) === w);
    const hasLoss = weekTrades.some(t => (t.win_loss || '').toLowerCase() === 'loss');
    if(weekTrades.length > 0 && !hasLoss){ cleanWeekStreak++; maxCleanWeekStreak = Math.max(maxCleanWeekStreak, cleanWeekStreak); }
    else cleanWeekStreak = 0;
  });
  const c10 = {
    icon:'star', title:'Clean Week', points:40,
    desc:'Consecutive weeks with zero losses.',
    howTo:'Looks at each Monday–Sunday week and checks whether any closed trade in it is marked "Loss." A week with wins, breakevens, or no trades still counts as clean; one loss resets the streak. Levels: 1, 2, 3, 4, 5 clean weeks in a row.',
    current: maxCleanWeekStreak, tiers: [1, 2, 3, 4, 5], target: 5, done: maxCleanWeekStreak >= 5,
    statOverride: lastWeekTrades.length ? `This week so far: ${lastWeekTrades.length} trades, ${lastWeekLossCount} loss${lastWeekLossCount===1?'':'es'}` : 'No trades yet this week.'
  };

  // 11. Comeback Kid — how many times a losing week was followed by a winning week
  let comebackCount = 0;
  for(let i = 1; i < weekKeys.length; i++){
    if(byWeek[weekKeys[i-1]] < 0 && byWeek[weekKeys[i]] > 0) comebackCount++;
  }
  const c11 = {
    icon:'refresh', title:'Comeback Kid', points:70,
    desc:'Bounced back from a losing week into a winning week.',
    howTo:'Scans your weekly P/L history for every losing week (negative total) immediately followed by a winning week (positive total). Levels: 1, 2, 3, 4, 5 comebacks, lifetime.',
    current: comebackCount, tiers: [1, 2, 3, 4, 5], target: 5, done: comebackCount >= 5
  };

  // 12/13. Achievements-based
  const withdrawals = achRows.filter(a => a.category === 'Withdrawal');
  const tournaments = achRows.filter(a => a.category === 'Tournament');
  const c12 = {
    icon:'dollar', title:'Funded & Withdrawing', points:150,
    desc:'Successful withdrawals logged in Achievements.',
    howTo:'Counts your Achievements entries where Category = "Withdrawal." Upload a new achievement each time you get a successful payout. Levels: 1, 2, 3, 4, 5 withdrawals.',
    current: withdrawals.length, tiers: [1, 2, 3, 4, 5], target: 5, done: withdrawals.length >= 5
  };

  // 27. Cash Out — total amount withdrawn, lifetime (uses the Amount field on Withdrawal achievements)
  const totalWithdrawn = withdrawals.reduce((s,a) => s + (parseFloat(a.amount) || 0), 0);
  const c27 = {
    icon:'dollar', title:'Cash Out', points:120,
    desc:'Total amount withdrawn, lifetime.',
    howTo:'Sums the "Amount" field on your Achievements entries where Category = "Withdrawal." Fill in the amount when you upload a withdrawal achievement. Levels: $100, $500, $1,000, $5,000, $10,000 total withdrawn.',
    current: totalWithdrawn, tiers: [100, 500, 1000, 5000, 10000], target: 10000, done: totalWithdrawn >= 10000,
    statOverride: `$${totalWithdrawn.toFixed(2)} withdrawn so far`
  };
  const c13 = {
    icon:'trophy', title:'Tournament Grinder', points:130,
    desc:'Tournaments logged in Achievements.',
    howTo:'Counts your Achievements entries where Category = "Tournament." Upload a new achievement each time you join or place in a tournament. Levels: 1, 3, 5, 7, 10 tournaments.',
    current: tournaments.length, tiers: [1, 3, 5, 7, 10], target: 10, done: tournaments.length >= 10
  };

  // 14. Global Trader — different sessions traded this month
  const sessionsThisMonth = new Set(thisMonthTrades.map(t => t.session).filter(s => s && s !== 'Unspecified'));
  const c14 = {
    icon:'globe', title:'Global Trader', points:60,
    desc:'Different sessions traded this month.',
    howTo:'Counts the distinct values in your "Session" field (Asia, London, London + NY Overlap, New York, Low Liquidity) across this month\'s closed trades. Levels: 1, 2, 3, 4, 5 different sessions. Only trade a session when there\'s a real setup — don\'t trade a session just to check it off.',
    current: sessionsThisMonth.size, tiers: [1, 2, 3, 4, 5], target: 5, done: sessionsThisMonth.size >= 5
  };

  // 15. Setup Specialist — win rate on your best setup, 10+ trades using it
  const setupStats = {};
  closed.forEach(t => {
    const key = t.trade_setup;
    if(!key || key === 'Unspecified') return;
    if(!setupStats[key]) setupStats[key] = { wins: 0, total: 0 };
    setupStats[key].total++;
    if((t.win_loss || '').toLowerCase() === 'win') setupStats[key].wins++;
  });
  let bestSetup = null, bestSetupRate = 0;
  Object.entries(setupStats).forEach(([name, s]) => {
    if(s.total >= 10 && s.wins / s.total > bestSetupRate){ bestSetupRate = s.wins / s.total; bestSetup = name; }
  });
  const c15 = {
    icon:'target', title:'Setup Specialist', points:110,
    desc:'Win rate on your best setup, across at least 10 trades using it.',
    howTo:'Groups your closed trades by "Trade Setup" and checks each one with at least 10 trades for its win rate. Levels: 40%, 50%, 60%, 70%, 80% win rate on any single setup. This is an observation, not a target — don\'t skip a valid setup just to protect the percentage.',
    current: bestSetup ? Math.round(bestSetupRate * 100) : 0, tiers: [40, 50, 60, 70, 80], target: 80,
    done: !!bestSetup && bestSetupRate >= 0.8,
    statOverride: bestSetup ? `Best: "${bestSetup}" at ${Math.round(bestSetupRate*100)}%` : 'No setup with 10+ trades yet'
  };

  // (Retired: a "trade both directions" challenge used to live here — removed
  // because rewarding a minimum Long/Short count could tempt forcing a trade
  // in whichever direction you're short on, just to hit the number. That's
  // the opposite of what this page should encourage.)

  // 17. Century Club — trades logged, all-time
  const c17 = {
    icon:'hash', title:'Century Club', points:100,
    desc:'Trades logged, all-time.',
    howTo:'A simple lifetime count of every closed trade you\'ve logged. Levels: 20, 50, 100, 250, 500 trades — no time limit.',
    current: closed.length, tiers: [20, 50, 100, 250, 500], target: 500, done: closed.length >= 500
  };

  // 18. Green Month — fully completed calendar months with positive total P/L
  const monthTotals = {};
  closed.forEach(t => {
    const key = `${t.close_date.getFullYear()}-${t.close_date.getMonth()}`;
    monthTotals[key] = (monthTotals[key] || 0) + (t.profit_loss || 0);
  });
  const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const greenMonthCount = Object.keys(monthTotals).filter(k => k !== thisMonthKey && monthTotals[k] > 0).length;
  const c18 = {
    icon:'calendar', title:'Green Month', points:90,
    desc:'Fully completed calendar months with positive total P/L.',
    howTo:'Groups your closed trades by calendar month (excluding the current, still-in-progress month) and sums P/L for each. Levels: 1, 2, 3, 4, 6 green months, lifetime.',
    current: greenMonthCount, tiers: [1, 2, 3, 4, 6], target: 6, done: greenMonthCount >= 6
  };

  // 19. Journal Keeper — 10 consecutive trades with notes filled in
  let notesStreak = 0;
  for(const t of recentFirst){
    if((t.notes || '').trim()) notesStreak++;
    else break;
  }
  const c19 = {
    icon:'book', title:'Journal Keeper', points:60,
    desc:'Consecutive trades with notes filled in.',
    howTo:'Checks your most recent trades (newest first) for a filled-in "Notes" field. One trade without notes resets the streak. Levels: 5, 10, 20, 50, 100 in a row.',
    current: notesStreak, tiers: [5, 10, 20, 50, 100], target: 100, done: notesStreak >= 100
  };

  // 20. Rule Setter — personal trading rules saved in Profile
  const ruleCount = (PROFILE_DATA?.trading_rules || []).length;
  const c20 = {
    icon:'list', title:'Rule Setter', points:40,
    desc:'Personal trading rules saved in your Profile.',
    howTo:'Counts the rules you\'ve added under "My Trading Rules" on your Profile page. Levels: 1, 2, 3, 5, 10 rules.',
    current: ruleCount, tiers: [1, 2, 3, 5, 10], target: 10, done: ruleCount >= 10
  };

  // 21. Vision Board Set — uploaded an inspiration image on Profile
  const hasVisionBoard = !!PROFILE_DATA?.inspiration_image_path;
  const c21 = {
    icon:'image', title:'Vision Board Set', points:30,
    desc:'Uploaded an inspiration image on your Profile.',
    howTo:'Checks whether you\'ve uploaded an image under "My Vision Board" on your Profile page. Upload one from Edit mode to complete this.',
    current: hasVisionBoard ? 1 : 0, target: 1, done: hasVisionBoard
  };

  // 22. Breakeven Saver — trades where you secured profit after moving SL to breakeven
  const beSaves = closed.filter(t => t.post_be_result === 'TP After BE').length;
  const c22 = {
    icon:'check-circle', title:'Breakeven Saver', points:70,
    desc:'Trades where you secured profit after moving SL to breakeven.',
    howTo:'Counts trades where your "Post-BE Result" is "TP After BE" — meaning you moved your stop to breakeven and still walked away with profit instead of just avoiding a loss. Levels: 2, 5, 10, 20, 30 trades.',
    current: beSaves, tiers: [2, 5, 10, 20, 30], target: 30, done: beSaves >= 30
  };

  // 23. Weekday Ace — win rate on your best day of the week, 10+ trades on it
  const dayStats = {};
  closed.forEach(t => {
    const key = t.day_of_week;
    if(!key || key === 'Unspecified') return;
    if(!dayStats[key]) dayStats[key] = { wins: 0, total: 0 };
    dayStats[key].total++;
    if((t.win_loss || '').toLowerCase() === 'win') dayStats[key].wins++;
  });
  let bestDay = null, bestDayRate = 0;
  Object.entries(dayStats).forEach(([name, s]) => {
    if(s.total >= 10 && s.wins / s.total > bestDayRate){ bestDayRate = s.wins / s.total; bestDay = name; }
  });
  const c23 = {
    icon:'medal', title:'Weekday Ace', points:90,
    desc:'Win rate on your best day of the week, across at least 10 trades.',
    howTo:'Groups your closed trades by day of the week and checks each day with at least 10 trades for its win rate. Levels: 40%, 50%, 60%, 70%, 80% win rate on any single day. Don\'t avoid trading a good setup on a given day just to protect this number.',
    current: bestDay ? Math.round(bestDayRate * 100) : 0, tiers: [40, 50, 60, 70, 80], target: 80,
    done: !!bestDay && bestDayRate >= 0.8,
    statOverride: bestDay ? `Best: ${bestDay} at ${Math.round(bestDayRate*100)}%` : 'No day with 10+ trades yet'
  };

  // 24. Fee Control — fees this month kept low relative to gross win (resets monthly)
  const monthGrossWin = thisMonthTrades.filter(t => t.profit_loss > 0).reduce((s,t) => s + t.profit_loss, 0);
  const monthFees = thisMonthTrades.reduce((s,t) => s + (t.fee || 0), 0);
  const monthFeePct = monthGrossWin > 0 ? (monthFees / monthGrossWin) * 100 : 0;
  const feeSafety = monthGrossWin > 0 ? Math.max(0, 100 - monthFeePct) : 0;
  const c24 = {
    icon:'percent', title:'Fee Control', points:60,
    desc:'Fees this month, kept low relative to your gross win.',
    howTo:'Fees this month ÷ gross win this month, as a percentage — lower is better. Levels: staying under 50%, 40%, 30%, 20%, 10% of gross win. Resets every month, so there\'s always a fresh shot at it.',
    current: feeSafety, tiers: [50, 60, 70, 80, 90], target: 90, done: monthGrossWin > 0 && monthFeePct <= 10
  };

  // 25. Monthly Win Rate — win rate for this month's trades (resets monthly)
  const monthWins = thisMonthTrades.filter(t => (t.win_loss || '').toLowerCase() === 'win').length;
  const monthWinRate = thisMonthTrades.length > 0 ? (monthWins / thisMonthTrades.length) * 100 : 0;
  const c25 = {
    icon:'zap', title:'Monthly Win Rate', points:70,
    desc:'Win rate for this month\'s trades.',
    howTo:'Wins ÷ total closed trades this month. Levels: 40%, 50%, 60%, 70%, 80% win rate. Resets every month — a fresh scoreboard each time. Never sit out a valid trade near month-end just to protect this number.',
    current: thisMonthTrades.length > 0 ? monthWinRate : 0, tiers: [40, 50, 60, 70, 80], target: 80,
    done: thisMonthTrades.length > 0 && monthWinRate >= 80
  };

  // 26. Weeks Won — winning weeks within this month (resets monthly)
  const weeksThisMonthKeys = [...new Set(thisMonthTrades.map(t => getWeekKey(t.close_date)))];
  const weeksWonThisMonth = weeksThisMonthKeys.filter(w => (byWeek[w] || 0) > 0).length;
  const c26 = {
    icon:'calendar', title:'Weeks Won', points:60,
    desc:'Winning weeks within this month.',
    howTo:'Counts how many Monday–Sunday weeks touching this month had a positive total P/L. Levels: 1, 2, 3, 4, 5 winning weeks. Resets every month. Keep trading your plan as usual — don\'t go quiet just because a week is already green.',
    current: weeksWonThisMonth, tiers: [1, 2, 3, 4, 5], target: 5, done: weeksWonThisMonth >= 5
  };

  // 28-30. Account compliance guards — pass/fail checks against your real prop
  // firm account rules (My Accounts), not performance targets to chase. These
  // only appear once you've added at least one Prop Firm account.
  const propAccounts = TRADING_ACCOUNTS.filter(a => a.account_type !== 'Exchange' && a.account_size && a.status !== 'Failed');
  const accStatsCache = propAccounts.map(a => ({ acc: a, stats: computeAccountStats(a) }));

  let c28 = null;
  const accountsWithDailyLimit = accStatsCache.filter(x => x.stats.dailyLossLimit > 0);
  if(accountsWithDailyLimit.length){
    const breached = accountsWithDailyLimit.some(x => x.stats.dailyLossUsed >= x.stats.dailyLossLimit);
    c28 = {
      icon:'shield', title:'Daily Loss Guard', points:40,
      desc:"Stay within today's Max Daily Loss on every account.",
      howTo:"Checks each Prop Firm account's trades closed today against its Max Daily Loss % rule. This is a same-day pass/fail check, not a target — a day with no trades on that account stays passed by default. Never keep trading past a breach just to \"fix\" this.",
      current: breached ? 0 : 1, target: 1, done: !breached
    };
  }

  let c29 = null;
  const accountsWithDrawdownFloor = accStatsCache.filter(x => x.stats.drawdownFloor > 0);
  if(accountsWithDrawdownFloor.length){
    const breached = accountsWithDrawdownFloor.some(x => x.stats.currentBalance < x.stats.drawdownFloor);
    c29 = {
      icon:'shield-check', title:'Account Drawdown Guard', points:40,
      desc:'Keep every account above its Max Total Drawdown floor.',
      howTo:"Compares each Prop Firm account's current balance to its Max Total Drawdown % rule. Pass/fail, not a target to push toward — the further above the floor, the safer, but there's no reason to trade more just to widen the gap.",
      current: breached ? 0 : 1, target: 1, done: !breached
    };
  }

  let c30 = null;
  const accountsWithDayTarget = accStatsCache.filter(x => x.stats.profitableDaysTarget);
  if(accountsWithDayTarget.length){
    let best = null;
    accountsWithDayTarget.forEach(x => {
      const frac = x.stats.profitableDaysCount / x.stats.profitableDaysTarget;
      if(!best || frac > best.frac) best = { frac, current: x.stats.profitableDaysCount, target: x.stats.profitableDaysTarget };
    });
    c30 = {
      icon:'medal', title:'Profitable Days Met', points:50,
      desc:'Hit the minimum profitable trading days required by your account.',
      howTo:"Counts distinct days where an account's trades netted positive, against its Minimum Trading Days rule. There's no reason to force a trade on a slow day just to add to this count — an unprofitable or no-trade day simply doesn't count, without penalty.",
      current: best.current, target: best.target, done: best.current >= best.target
    };
  }

  return [c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c17,c18,c19,c20,c21,c22,c23,c24,c25,c26,c27,c28,c29,c30].filter(Boolean);
}

const LOCKED_CHALLENGES = [
  {icon:'percent', title:'1% Risk Master', desc:'Risking ≤1% per trade, 30 trades in a row.', needs:'Needs an entry price, stop-loss price, or account balance field to calculate the % risked per trade.'},
  {icon:'target', title:'SL Discipline', desc:'Always setting a Stop Loss before entering.', needs:'Needs a new checkbox field ("SL set before entry?") on the trade form.'},
  {icon:'ban', title:'No Revenge Trading', desc:'Skipping the next signal after a loss.', needs:'Needs a log of skipped signals — not tracked yet.'},
  {icon:'search', title:'Confluence Purist', desc:'Only entering when every confluence condition is "Met."', needs:'Needs a history/snapshot log of Trade Alerts (currently only the latest state is stored).'},
  {icon:'clock', title:'Same-Day Journaling', desc:'Logging every trade within 24 hours.', needs:'Needs a "created_at" column on trading_journal that records when you actually logged the trade.'},
  {icon:'calendar', title:'Daily Check-in Streak', desc:'Visiting the dashboard every day.', needs:'Needs new tracking of login/visit dates — not derived from trades.'},
  {icon:'medal', title:'Tournament Placement', desc:'Placing Top 10 or winning a tournament.', needs:'Needs a structured "placement" field on Achievements (currently just free text in subject/body).'}
];

function tierBarHTML(current, tiers){
  return `
    <div class="tier-bar">
      ${tiers.map((t, i) => {
        const prev = i === 0 ? 0 : tiers[i-1];
        const reached = current >= t;
        const pct = reached ? 100 : Math.max(0, Math.min(100, ((current - prev) / (t - prev)) * 100));
        return `
          <div class="tier-segment">
            <div class="tier-track"><div class="tier-fill ${reached ? 'reached' : ''}" style="width:${pct}%;"></div></div>
            <div class="tier-mark ${reached ? 'reached' : ''}">${t}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function activeCardHTML(c, status){
  const badgeCls = status === 'done' ? 'badge-done' : status === 'next' ? 'badge-next' : '';
  const tagText = status === 'done' ? 'Achieved' : status === 'next' ? 'Next up' : 'In Progress';
  const progressHTML = c.tiers
    ? tierBarHTML(c.current, c.tiers)
    : `<div class="challenge-progress-bar"><div class="challenge-progress-fill" style="width:${c.target ? Math.min(100, (c.current / c.target) * 100) : 0}%;"></div></div>`;
  const statText = c.statOverride || `${c.current} / ${c.target}`;
  return `
    <div class="challenge-card ${status}" onclick='openChallengeDetail(${JSON.stringify(c.title)})'>
      <div class="challenge-hover-tip">${c.howTo || c.desc}</div>
      <div class="challenge-badge ${badgeCls}">
        <div class="challenge-badge-shape">${challengeIconSVG(c.icon)}</div>
        ${status === 'done' ? `<span class="challenge-badge-mark check">✓</span>` : ''}
      </div>
      <div class="challenge-info">
        <div class="card-tag">${tagText}</div>
        <div class="challenge-title">${c.title}</div>
        <div class="challenge-desc">${c.desc}</div>
        ${progressHTML}
        <div class="challenge-stat">${statText}</div>
      </div>
      <div class="challenge-points">+${c.points}</div>
    </div>
  `;
}

function lockedCardHTML(c){
  return `
    <div class="challenge-card locked">
      <div class="challenge-badge">
        <div class="challenge-badge-shape">${challengeIconSVG(c.icon)}</div>
        <span class="challenge-badge-mark lock">${challengeIconSVG('lock')}</span>
      </div>
      <div class="challenge-info">
        <div class="challenge-title">${c.title}</div>
        <div class="challenge-desc">${c.desc}</div>
        <div class="challenge-lock-note">${c.needs}</div>
      </div>
    </div>
  `;
}

function switchChallengeFilter(f){
  challengeFilter = f;
  document.querySelectorAll('#challengeFilterTabs .tab').forEach(el => el.classList.toggle('active', el.dataset.f === f));
  renderChallengeGrid();
}

function renderRankLadder(totalPoints){
  const wrap = document.getElementById('rankLadder');
  if(!wrap) return;
  const { current } = rankForPoints(totalPoints);
  const n = CHALLENGE_RANKS.length;
  const maxMin = CHALLENGE_RANKS[n - 1].min;
  const overallPct = Math.min(100, (totalPoints / maxMin) * 100);
  const rankIcons = ['star', 'flame', 'shield-check', 'trending-up', 'medal', 'octagon', 'trophy'];

  const medals = CHALLENGE_RANKS.map((r, i) => {
    const reached = totalPoints >= r.min;
    const isCurrent = r.label === current.label;
    return `
      <div class="rank-medal ${reached ? 'reached' : ''} ${isCurrent ? 'current' : ''}" onclick='openRankDetail(${JSON.stringify(r.label)}, ${totalPoints})'>
        ${isCurrent ? `<div class="rank-medal-you">You are here</div>` : ''}
        <div class="rank-medal-shape">${challengeIconSVG(rankIcons[i] || 'star')}</div>
        <div class="rank-medal-label">${r.label}</div>
      </div>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="rank-track">
      <div class="rank-track-bar"><div class="rank-track-fill" style="width:${overallPct}%;"></div></div>
      <div class="rank-medals">${medals}</div>
    </div>
  `;
}

const RANK_DESCRIPTIONS = {
  'Raw Ore': "Everyone starts here, unshaped. Log your trades and work through the challenges to start building points.",
  'Kindled': "The fire's lit — you're forming real habits, and the small, consistent decisions are starting to add up.",
  'Hammered': "Shaped by repetition. Your discipline is becoming routine rather than effort. Keep stacking consistent decisions.",
  'Tempered': "Hardened by trial. You've shown consistency across several different areas of your trading, not just one.",
  'Sharpened': "A refined edge — a high, well-rounded level of discipline that takes sustained, deliberate practice to reach.",
  'Master Forger': "You're clearing the hardest levels on most challenges, not just the easy first steps.",
  'Legendary Blade': "You've worked through nearly every challenge here. This reflects a long track record, not luck."
};

function openRankDetail(label, totalPoints){
  const idx = CHALLENGE_RANKS.findIndex(r => r.label === label);
  if(idx === -1) return;
  const rank = CHALLENGE_RANKS[idx];
  const nextRank = CHALLENGE_RANKS[idx + 1];
  const rangeText = nextRank ? `${rank.min} – ${nextRank.min - 1} points` : `${rank.min}+ points`;
  const reached = totalPoints >= rank.min;

  let statusText;
  if(!reached){
    statusText = `Not reached yet — ${rank.min - totalPoints} more point${rank.min - totalPoints === 1 ? '' : 's'} gets you here. No rush, this updates automatically as you log trades.`;
  }else if(nextRank && totalPoints < nextRank.min){
    statusText = `This is where you are right now — ${nextRank.min - totalPoints} point${nextRank.min - totalPoints === 1 ? '' : 's'} away from ${nextRank.label}.`;
  }else if(!nextRank){
    statusText = `You're at the top of the ladder — every rank below this one is behind you.`;
  }else{
    statusText = `You passed through this rank already on your way to where you are now.`;
  }

  // Only show the full points breakdown when this is the rank you're
  // currently at — it's the same underlying list for every rank otherwise,
  // since points are cumulative, so showing it everywhere was redundant.
  const { current } = rankForPoints(totalPoints);
  const isCurrent = label === current.label;
  let breakdownSection = '';
  if(isCurrent){
    const achievedList = COMPUTED_CHALLENGES.filter(c => c.done).sort((a,b) => b.points - a.points);
    const breakdownHTML = achievedList.length
      ? achievedList.map(c => `
          <div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:6px 0;border-bottom:1px solid var(--rule);">
            <span>${escapeHtml(c.title)}</span>
            <span style="color:var(--win);font-weight:600;flex-shrink:0;">+${c.points}</span>
          </div>
        `).join('')
      : `<div class="empty-state" style="padding:10px 0;">No challenges achieved yet — every one you complete adds points here.</div>`;
    breakdownSection = `
      <div style="font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">How your points were earned</div>
      ${breakdownHTML}
    `;
  }

  document.getElementById('modalTitle').textContent = label;
  document.getElementById('modalSub').textContent = rangeText;
  document.getElementById('modalBody').innerHTML = `
    <div style="font-size:13px;color:var(--ink);line-height:1.6;margin-bottom:10px;">${RANK_DESCRIPTIONS[label] || ''}</div>
    <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:18px;">${statusText}</div>
    ${breakdownSection}
  `;
  document.getElementById('tradeModal').classList.add('open');
}

function renderChallengeGrid(){
  const grid = document.getElementById('challengesGrid');
  const lockedGrid = document.getElementById('challengesLockedGrid');
  if(!grid) return;

  const doneCount = COMPUTED_CHALLENGES.filter(c => c.done).length;
  const totalPoints = COMPUTED_CHALLENGES.filter(c => c.done).reduce((s,c) => s + c.points, 0);
  const maxPoints = COMPUTED_CHALLENGES.reduce((s,c) => s + c.points, 0);

  const label = document.getElementById('challengesCountLabel');
  if(label) label.textContent = `${doneCount} / ${COMPUTED_CHALLENGES.length} achieved`;

  const { current, next } = rankForPoints(totalPoints);
  document.getElementById('challengeRankLabel').textContent = current.label;
  document.getElementById('challengePointsTotal').textContent = totalPoints;
  document.getElementById('challengePointsAway').textContent = next
    ? `${next.min - totalPoints} points to ${next.label}`
    : `Max rank reached — ${maxPoints} points available`;
  renderRankLadder(totalPoints);

  // Achieved challenges come first, then whatever's still open — ordered by
  // how close each one is to finishing, so the nearest-to-done is always up top.
  const progressFraction = c => {
    const finalTarget = c.tiers ? c.tiers[c.tiers.length - 1] : c.target;
    return finalTarget > 0 ? Math.min(1, c.current / finalTarget) : 0;
  };
  const done = [...COMPUTED_CHALLENGES].filter(c => c.done).sort((a,b) => a.points - b.points);
  const notDone = [...COMPUTED_CHALLENGES].filter(c => !c.done).sort((a,b) => progressFraction(b) - progressFraction(a));
  const withStatus = [
    ...done.map(c => ({ c, status: 'done' })),
    ...notDone.map((c, i) => ({ c, status: i === 0 ? 'next' : 'upcoming' }))
  ];

  const rows = challengeFilter === 'achieved' ? withStatus.filter(x => x.status === 'done')
    : challengeFilter === 'unachieved' ? withStatus.filter(x => x.status !== 'done')
    : withStatus;

  grid.innerHTML = rows.length ? rows.map(x => activeCardHTML(x.c, x.status)).join('') : `<div class="empty-state">No challenges in this filter.</div>`;
  if(lockedGrid) lockedGrid.innerHTML = LOCKED_CHALLENGES.map(lockedCardHTML).join('');

  LAST_LEADERBOARD_SCORE = { points: totalPoints, label: current.label };
  syncLeaderboardScore(totalPoints, current.label);
}

// Remembered so loadProfile() can re-sync with the real display name — the
// first sync at login can fire before the profile has loaded, which would
// otherwise leave the email prefix as this trader's leaderboard name.
let LAST_LEADERBOARD_SCORE = null;

// Publishes this trader's own total points + rank to the shared
// challenge_leaderboard table so the Leaderboard page can rank everyone
// against each other — points themselves are still computed entirely
// client-side from this user's own trades, this just shares the result.
async function syncLeaderboardScore(points, rankLabel){
  try{
    const displayName = PROFILE_DATA?.display_name || PROFILE_DATA?.username || (CURRENT_USER_EMAIL || '').split('@')[0] || 'Trader';
    await fetch(`${SUPABASE_URL}/rest/v1/challenge_leaderboard?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({ display_name: displayName, points, rank_label: rankLabel, updated_at: new Date().toISOString() })
    });
  }catch(e){
    console.error("Couldn't sync leaderboard score:", e);
  }
}

async function renderLeaderboard(){
  const body = document.getElementById('leaderboardBody');
  if(!body) return;
  body.innerHTML = `<div class="empty-state">Loading…</div>`;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/challenge_leaderboard?select=*&order=points.desc`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
    });
    if(!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    body.innerHTML = rows.length ? rows.map((r, i) => `
      <div class="leaderboard-row ${r.user_id === CURRENT_USER_ID ? 'leaderboard-row-me' : ''}">
        <div class="leaderboard-rank">#${i + 1}</div>
        <div class="leaderboard-name">${escapeHtml(r.display_name || 'Trader')}${r.user_id === CURRENT_USER_ID ? '<span class="pill pill-blue">You</span>' : ''}</div>
        <div class="leaderboard-tier">${escapeHtml(r.rank_label || '—')}</div>
        <div class="leaderboard-points">${r.points} pts</div>
      </div>
    `).join('') : `<div class="empty-state">No scores yet.</div>`;
  }catch(e){
    console.error("Couldn't load leaderboard:", e);
    body.innerHTML = `<div class="empty-state">Couldn't load the leaderboard.</div>`;
  }
}

async function renderChallenges(){
  const grid = document.getElementById('challengesGrid');
  if(grid) grid.innerHTML = `<div class="empty-state">Loading…</div>`;

  const achRows = await loadAchievementSummaryForChallenges();
  COMPUTED_CHALLENGES = computeChallenges(ALL_TRADES, achRows);
  if(grid) renderChallengeGrid();
  refreshAllNavBadges();
}

function openChallengeDetail(title){
  const c = COMPUTED_CHALLENGES.find(x => x.title === title);
  if(!c) return;
  const statText = c.statOverride || `${c.current} / ${c.target}`;
  const badge = document.getElementById('challengeDetailBadge');
  badge.className = 'challenge-badge' + (c.done ? ' badge-done' : '');
  badge.innerHTML = `<div class="challenge-badge-shape">${challengeIconSVG(c.icon)}</div>` + (c.done ? '<span class="challenge-badge-mark check">✓</span>' : '');
  document.getElementById('challengeDetailTitle').textContent = c.title;
  document.getElementById('challengeDetailPoints').textContent = `+${c.points} points${c.done ? ' · Achieved' : ''}`;
  document.getElementById('challengeDetailHowTo').textContent = c.howTo || c.desc;
  document.getElementById('challengeDetailProgressWrap').innerHTML = c.tiers
    ? tierBarHTML(c.current, c.tiers)
    : `<div class="challenge-progress-bar" style="height:8px;"><div class="challenge-progress-fill" style="width:${c.target ? Math.min(100, (c.current / c.target) * 100) : 0}%;"></div></div>`;
  document.getElementById('challengeDetailStat').textContent = statText;
  document.getElementById('challengeDetailModal').classList.add('open');
}
function closeChallengeDetail(){
  document.getElementById('challengeDetailModal').classList.remove('open');
}

/* ---------------- Profile (trader identity, rules, inspiration board) ---------------- */
let PROFILE_DATA = null;
let profileRulesArr = [];
let profileEditing = false;

const PROFILE_STYLE_OPTIONS = ['Scalper', 'Day Trader', 'Swing Trader', 'Position Trader'];
const PROFILE_MARKET_OPTIONS = ['Crypto', 'Forex', 'Stocks', 'Multiple'];

async function loadProfile(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profile?select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    PROFILE_DATA = rows[0] || null;
  }catch(e){
    console.error("Couldn't load profile:", e);
    PROFILE_DATA = null;
  }
  // The profile carries the cross-device "seen challenges" list and UI
  // preferences — now that it's loaded, apply both so this device matches
  // what the account last saved anywhere else.
  applyUIPrefsFromProfile();
  refreshAllNavBadges();
  // Re-send the leaderboard entry now that the real display name is known —
  // the first sync at login can beat this profile fetch and would otherwise
  // leave the email prefix as the visible leaderboard name.
  if(LAST_LEADERBOARD_SCORE) syncLeaderboardScore(LAST_LEADERBOARD_SCORE.points, LAST_LEADERBOARD_SCORE.label);
  await renderProfile();
}

function enterProfileEditMode(){
  profileEditing = true;
  renderProfile();
}

function cancelProfileEdit(){
  profileEditing = false;
  renderProfile();
}

async function renderProfile(){
  const p = PROFILE_DATA || {};

  document.getElementById('profileEditBtn').style.display = profileEditing ? 'none' : 'inline-block';
  document.getElementById('profileCancelBtn').style.display = profileEditing ? 'inline-block' : 'none';
  document.getElementById('profileSaveBtn').style.display = profileEditing ? 'inline-block' : 'none';
  document.getElementById('profileEditPanel').style.display = profileEditing ? 'block' : 'none';

  // Header card — always shows the saved values, whether editing or not.
  const initial = (p.display_name || '').trim().charAt(0).toUpperCase() || '?';
  document.getElementById('profileAvatar').textContent = initial;
  document.getElementById('profileHeaderName').innerHTML = p.display_name
    ? `${escapeHtml(p.display_name)}${p.nickname ? ` <span class="profile-nickname">(${escapeHtml(p.nickname)})</span>` : ''}`
    : 'Set your name';
  document.getElementById('profileHeaderBadges').innerHTML = `
    <span class="pill pill-blue">${escapeHtml(p.trading_style || 'Trading style')}</span>
    <span class="pill pill-orange">${escapeHtml(p.primary_market || 'Market')}</span>
    ${p.risk_per_trade != null ? `<span class="pill pill-green">Risk ${p.risk_per_trade}%</span>` : ''}
  `;
  document.getElementById('profileHeaderWhy').textContent = p.my_why ? `"${p.my_why}"` : '';

  // Rank badge — mirrors your current rank from the Challenges page.
  try{
    const rankIcons = ['star', 'flame', 'shield-check', 'trending-up', 'medal', 'octagon', 'trophy'];
    const achRowsForRank = await loadAchievementSummaryForChallenges();
    const challengesForRank = computeChallenges(ALL_TRADES, achRowsForRank);
    const totalPointsForRank = challengesForRank.filter(c => c.done).reduce((s,c) => s + c.points, 0);
    const { current: currentRank } = rankForPoints(totalPointsForRank);
    const rankIdx = CHALLENGE_RANKS.findIndex(r => r.label === currentRank.label);
    document.getElementById('profileRankIcon').innerHTML = challengeIconSVG(rankIcons[rankIdx] || 'star');
    document.getElementById('profileRankTitle').textContent = currentRank.label;
  }catch(e){
    console.error("Couldn't compute rank for profile badge:", e);
  }

  const fields = document.getElementById('profileFieldsPanel');
  if(profileEditing){
    fields.innerHTML = `
      <div class="field-row"><label>Display Name</label><input id="profileName" placeholder="Your name" value="${escapeHtml(p.display_name || '')}"></div>
      <div class="field-row"><label>Nickname</label><input id="profileNickname" placeholder="e.g. JessiePinkman" value="${escapeHtml(p.nickname || '')}"></div>
      <div class="field-row"><label>Username (used to log in)</label><input id="profileUsername" placeholder="e.g. juandelacruz" autocapitalize="off" autocorrect="off" value="${escapeHtml(p.username || '')}"></div>
      <div class="field-row"><label>Discord Username</label><input id="profileDiscord" placeholder="e.g. juandelacruz#0001" value="${escapeHtml(p.discord_username || '')}"></div>
      <div class="field-row"><label>Trading Style</label>
        <select id="profileStyle">${PROFILE_STYLE_OPTIONS.map(s => `<option value="${s}" ${p.trading_style===s?'selected':''}>${s}</option>`).join('')}</select>
      </div>
      <div class="field-row"><label>Primary Market</label>
        <select id="profileMarket">${PROFILE_MARKET_OPTIONS.map(m => `<option value="${m}" ${p.primary_market===m?'selected':''}>${m}</option>`).join('')}</select>
      </div>
      <div class="field-row"><label>Risk Per Trade (%)</label><input id="profileRisk" type="number" step="0.1" placeholder="e.g. 0.3" value="${p.risk_per_trade ?? ''}"></div>
      <div class="field-row"><label>My Why</label><textarea id="profileWhy" placeholder="Why are you doing this?">${escapeHtml(p.my_why || '')}</textarea></div>
    `;
  }else{
    fields.innerHTML = '';
  }

  renderProfileRules(p.trading_rules || []);

  const img = document.getElementById('profileInspoImg');
  const placeholder = document.getElementById('profileInspoPlaceholder');
  const uploadBtn = document.getElementById('profileInspoUploadBtn');
  const editHint = document.getElementById('profileInspoEditHint');
  if(uploadBtn) uploadBtn.textContent = p.inspiration_image_path ? 'Change image' : 'Upload image';
  img.onclick = profileEditing ? null : () => openLightbox(img.src);
  img.style.cursor = profileEditing ? 'default' : 'zoom-in';

  if(p.inspiration_image_path){
    try{
      const { data, error } = await sb.storage.from('profile-images').createSignedUrl(p.inspiration_image_path, 3600);
      if(error) throw error;
      img.src = data.signedUrl;
      img.style.display = 'block';
      placeholder.style.display = 'none';
      editHint.style.display = profileEditing ? 'flex' : 'none';
    }catch(e){
      console.error("Couldn't load inspiration image:", e);
      img.style.display = 'none';
      editHint.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.innerHTML = `<div>Couldn't load your inspiration image (${escapeHtml(e?.message || String(e))}). Try uploading it again from Edit mode.</div>`;
    }
  }else{
    img.style.display = 'none';
    editHint.style.display = 'none';
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `<div>No inspiration image yet — add one from Edit mode.</div>`;
  }
}

function renderProfileRules(rules){
  profileRulesArr = [...rules];
  const wrap = document.getElementById('profileRulesList');
  const addRow = document.getElementById('profileRulesAddRow');
  if(addRow) addRow.style.display = profileEditing ? 'flex' : 'none';

  if(!profileRulesArr.length){
    wrap.innerHTML = `<div class="empty-state" style="padding:10px 0;">${profileEditing ? 'No rules yet — add your first one below.' : 'No rules added yet.'}</div>`;
    return;
  }

  wrap.innerHTML = profileRulesArr.map((rule, i) => profileEditing
    ? `<div class="config-option-row"><span>${escapeHtml(rule)}</span><button onclick="removeProfileRule(${i})">✕</button></div>`
    : `<div class="profile-rule-static">${escapeHtml(rule)}</div>`
  ).join('');
}

function addProfileRule(){
  const input = document.getElementById('newRuleInput');
  const val = input.value.trim();
  if(!val) return;
  profileRulesArr.push(val);
  input.value = '';
  renderProfileRules(profileRulesArr);
}

function removeProfileRule(i){
  profileRulesArr.splice(i, 1);
  renderProfileRules(profileRulesArr);
}

async function uploadInspirationImage(file){
  if(!file) return;
  try{
    const { data: { user } } = await sb.auth.getUser();
    const path = `${user.id}/inspiration_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;

    const { error: uploadErr } = await sb.storage.from('profile-images').upload(path, file);
    if(uploadErr) throw uploadErr;

    const oldPath = PROFILE_DATA?.inspiration_image_path;
    await persistProfile({ inspiration_image_path: path });
    if(oldPath) await sb.storage.from('profile-images').remove([oldPath]);

    await loadProfile();
    showToast('Inspiration image updated');
  }catch(e){
    console.error("Couldn't upload inspiration image:", e);
    const msg = e?.message || String(e);
    const hint = /bucket not found/i.test(msg) ? ' The "profile-images" storage bucket doesn\'t exist yet — create it in Supabase Storage.' : '';
    await customAlert("Couldn't upload image: " + msg + hint);
  }
}

async function persistProfile(partial){
  const { data: { user } } = await sb.auth.getUser();
  const nameEl = document.getElementById('profileName');
  const body = {
    user_id: user.id,
    display_name: nameEl ? nameEl.value.trim() : (PROFILE_DATA?.display_name || ''),
    nickname: document.getElementById('profileNickname')
      ? document.getElementById('profileNickname').value.trim()
      : (PROFILE_DATA?.nickname || ''),
    username: document.getElementById('profileUsername')
      ? document.getElementById('profileUsername').value.trim().toLowerCase() || null
      : (PROFILE_DATA?.username || null),
    discord_username: document.getElementById('profileDiscord')
      ? document.getElementById('profileDiscord').value.trim() || null
      : (PROFILE_DATA?.discord_username || null),
    trading_style: document.getElementById('profileStyle')?.value || PROFILE_DATA?.trading_style || 'Scalper',
    primary_market: document.getElementById('profileMarket')?.value || PROFILE_DATA?.primary_market || 'Crypto',
    risk_per_trade: document.getElementById('profileRisk')
      ? (parseFloat(document.getElementById('profileRisk').value) || null)
      : (PROFILE_DATA?.risk_per_trade ?? null),
    trading_rules: profileRulesArr,
    my_why: document.getElementById('profileWhy') ? document.getElementById('profileWhy').value.trim() : (PROFILE_DATA?.my_why || ''),
    updated_at: new Date().toISOString(),
    ...partial
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profile?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal,resolution=merge-duplicates"
    },
    body: JSON.stringify([body])
  });
  if(!res.ok) throw new Error(await res.text());
  PROFILE_DATA = { ...(PROFILE_DATA || {}), ...body };
}

async function saveProfile(){
  const usernameEl = document.getElementById('profileUsername');
  if(usernameEl && usernameEl.value.trim() && !/^[a-z0-9_.]{3,20}$/.test(usernameEl.value.trim().toLowerCase())){
    await customAlert("Username must be 3-20 characters: lowercase letters, numbers, underscore, or period only.");
    return;
  }

  const btn = document.getElementById('profileSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try{
    await persistProfile({ inspiration_image_path: PROFILE_DATA?.inspiration_image_path || null });
    profileEditing = false;
    await renderProfile();
    showToast('Profile saved');
  }catch(e){
    console.error("Couldn't save profile:", e);
    const msg = String(e.message || '');
    await customAlert(msg.includes('duplicate') || msg.includes('username')
      ? "That username is already taken — please pick another."
      : "Couldn't save — please try again.");
  }finally{
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

/* ---------------- My Accounts (prop firm accounts + their rules) ---------------- */
let TRADING_ACCOUNTS = [];
let editingAccountId = null;

async function loadAccounts(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_accounts?select=*&order=created_at.asc`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    TRADING_ACCOUNTS = await res.json();
  }catch(e){
    console.error("Couldn't load trading accounts:", e);
    TRADING_ACCOUNTS = [];
  }
  syncAccountFieldOptions();
  renderAccountsList();
}

// Keeps the Journal's "Account" dropdown in sync with the real accounts from
// My Accounts, instead of a manually-maintained list — mutated in place so
// ALL_DRAWER_FIELDS' captured reference to FIELD_OPTIONS.account stays in sync.
// Falls back to whatever's already there if no accounts exist yet.
function syncAccountFieldOptions(){
  if(!TRADING_ACCOUNTS.length) return;
  FIELD_OPTIONS.account.length = 0;
  FIELD_OPTIONS.account.push(...TRADING_ACCOUNTS.map(a => a.account_name));
}

// Applies a +/- delta to an account's current_balance whenever a trade tagged
// to that account is added, edited, or deleted — so balance/progress stays
// live without retyping it after every trade. Silently no-ops if the trade's
// "Account" text doesn't match a real account (legacy/free-text values).
async function adjustAccountBalance(accountName, delta){
  if(!accountName || !delta) return;
  const acc = TRADING_ACCOUNTS.find(a => a.account_name === accountName);
  if(!acc) return;
  const newBalance = (parseFloat(acc.current_balance) || 0) + delta;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_accounts?id=eq.${acc.id}`, {
      method: 'PATCH',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ current_balance: newBalance })
    });
    if(!res.ok) throw new Error(await res.text());
    acc.current_balance = newBalance;
    if(currentView === 'accounts') renderAccountsList();
  }catch(e){
    console.error("Couldn't auto-update account balance:", e);
  }
}

// Auto-fills the Journal's "Account Type" (Demo/Evaluation/Funded) from the
// selected account's Phase, so it doesn't need to be typed twice.
function syncAccountTypeFromAccount(accountName){
  const acc = TRADING_ACCOUNTS.find(a => a.account_name === accountName);
  if(!acc) return;
  let mapped = null;
  if(acc.phase === 'Funded') mapped = 'Funded';
  else if(acc.phase && acc.phase.startsWith('Evaluation')) mapped = 'Evaluation';
  else if(acc.account_type === 'Exchange') mapped = 'Demo';
  if(!mapped) return;
  const sel = document.querySelector('#drawerBody [data-field="account_type"]');
  if(sel){
    sel.value = mapped;
    // setting .value programmatically doesn't fire "change", so the
    // needs-input red flag wouldn't otherwise know this field got filled
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// Which Pattern Type options make sense for each Trade Setup — HL patterns
// belong to Bounce Play, LH patterns to Rejection Play, and the 30 min
// invalidation pattern is shared since it's used by both plus its own setup.
const TRADE_SETUP_PATTERN_MAP = {
  'Bounce Play': ['5 mins HL','15 mins HL','1 hour HL','30 mins Invalidation Play','4 Hour HL'],
  'Rejection Play': ['5 mins LH','15 mins LH','1 hour LH','30 mins Invalidation Play','4 Hour LH'],
  'Invalidation Play': ['30 mins Invalidation Play']
};

// Re-filters the Pattern Type dropdown to only the options relevant to the
// selected Trade Setup — clears the current pick if it's no longer valid.
function syncPatternTypeFromSetup(setupValue){
  const sel = document.querySelector('#drawerBody [data-field="pattern_type"]');
  if(!sel) return;
  const allowed = TRADE_SETUP_PATTERN_MAP[setupValue] || FIELD_OPTIONS.pattern_type;
  const current = sel.value;
  const opts = allowed.map(o => `<option value="${o}" ${current===o?'selected':''}>${o}</option>`).join('');
  sel.innerHTML = `<option value="">—</option>${opts}`;
  if(current && !allowed.includes(current)) sel.value = '';
  // rebuilding innerHTML/setting .value doesn't fire "change" on its own —
  // dispatch it so the needs-input red flag stays in sync either way
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

// "5 mins HL"/"5 mins LH" are always executed on the 1 min chart as a
// scalp — locks in the Execution TF and AOF Phase that go with them.
function syncExecutionFromPattern(patternValue){
  if(patternValue !== '5 mins HL' && patternValue !== '5 mins LH') return;
  const tfSel = document.querySelector('#drawerBody [data-field="execution_tf"]');
  if(tfSel){ tfSel.value = '1 min'; tfSel.dispatchEvent(new Event('change', { bubbles: true })); }
  const aofSel = document.querySelector('#drawerBody [data-field="aof_phase"]');
  if(aofSel){ aofSel.value = '5 mins Scalping'; aofSel.dispatchEvent(new Event('change', { bubbles: true })); }
}

// Post-BE Result only means something when the trade actually reached
// breakeven — anything else (Win/Loss/Liquidated) defaults to N/A.
function syncPostBEFromWinLoss(winLossValue){
  if(winLossValue === 'Breakeven') return;
  const sel = document.querySelector('#drawerBody [data-field="post_be_result"]');
  if(sel){ sel.value = 'N/A'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
}

// Derives all the compliance/progress numbers for one account from the real
// trades tagged to it (ALL_TRADES where account === account_name) — no extra
// table needed, since account_size/rules are fixed and current_balance is
// already kept live by adjustAccountBalance().
function computeAccountStats(acc){
  const trades = ALL_TRADES.filter(t => t.account === acc.account_name && t.close_date);
  const accountSize = Number(acc.account_size) || 0;
  const currentBalance = acc.current_balance != null ? Number(acc.current_balance) : accountSize;

  const today = new Date(); today.setHours(0,0,0,0);
  const todaysPL = trades
    .filter(t => { const d = new Date(t.close_date); d.setHours(0,0,0,0); return d.getTime() === today.getTime(); })
    .reduce((s,t) => s + (t.profit_loss || 0), 0);
  const dailyLossUsed = todaysPL < 0 ? Math.abs(todaysPL) : 0;
  const dailyLossLimit = accountSize * (Number(acc.max_daily_loss_pct) || 0) / 100;
  const dayStartBalance = currentBalance - todaysPL;
  const dailyStopBalance = dayStartBalance - dailyLossLimit;

  const drawdownFloor = accountSize - accountSize * (Number(acc.max_total_drawdown_pct) || 0) / 100;
  const profitGoal = accountSize + accountSize * (Number(acc.profit_target_pct) || 0) / 100;
  const balanceRangeFraction = (profitGoal > drawdownFloor)
    ? Math.max(0, Math.min(1, (currentBalance - drawdownFloor) / (profitGoal - drawdownFloor)))
    : 0;

  // Trades since the current phase began — Total Earn and Profitable Days
  // reset here so profit made during a previous phase doesn't carry over
  // into this phase's target (set "Phase Start Date"/"Balance at Phase
  // Start" on the account whenever you move to a new phase).
  const phaseStart = acc.phase_start_date ? new Date(acc.phase_start_date + 'T00:00:00') : null;
  const phaseTrades = phaseStart ? trades.filter(t => t.close_date >= phaseStart) : trades;

  const dayPL = {};
  phaseTrades.forEach(t => {
    const key = new Date(t.close_date).toDateString();
    dayPL[key] = (dayPL[key] || 0) + (t.profit_loss || 0);
  });
  // Upscale only counts a day toward the minimum trading days rule if it
  // cleared at least $50 profit — a day that's merely break-even/slightly
  // positive doesn't count.
  const profitableDaysCount = Object.values(dayPL).filter(v => v >= 50).length;
  const profitableDaysTarget = Number(acc.min_trading_days) || null;

  const sortedTrades = [...phaseTrades].sort((a,b) => a.close_date - b.close_date);
  let cum = 0;
  const series = sortedTrades.map(t => { cum += (t.profit_loss || 0); return { date: t.close_date, cum }; });
  const totalEarn = acc.phase_start_balance != null ? (currentBalance - Number(acc.phase_start_balance)) : cum;
  const targetEarn = accountSize * (Number(acc.profit_target_pct) || 0) / 100;

  return {
    accountSize, currentBalance, todaysPL, dailyLossUsed, dailyLossLimit, dayStartBalance, dailyStopBalance,
    drawdownFloor, profitGoal, balanceRangeFraction, profitableDaysCount, profitableDaysTarget,
    series, totalEarn, targetEarn
  };
}

let accountDetailChartRef = null;

function openAccountDetail(id){
  const a = TRADING_ACCOUNTS.find(x => x.id === id);
  if(!a) return;
  const s = computeAccountStats(a);

  document.getElementById('accDetailName').textContent = a.account_name;
  const startLabel = a.start_date ? `· start ${new Date(a.start_date + 'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'})}` : '';
  const statusLabel = a.status && a.status !== 'Ongoing' ? ` · ${a.status}` : '';
  document.getElementById('accDetailSub').textContent = `${a.prop_firm || ''} ${startLabel}${statusLabel}`.trim();

  const stages = ['Evaluation Phase 1','Evaluation Phase 2','Funded'];
  const stageIdx = stages.indexOf(a.phase);
  document.getElementById('accDetailStepper').innerHTML = stages.map((label,i) => {
    const cls = stageIdx < 0 ? '' : (i < stageIdx ? 'done' : (i === stageIdx ? 'current' : ''));
    const tooltip = escapeHtml(phaseStepTooltip(a, s, stageIdx, i, label));
    return `<div class="acc-step ${cls}" data-tooltip="${tooltip}"><div class="acc-step-line"></div><div class="acc-step-circle">${i < stageIdx ? '✓' : i+1}</div><div class="acc-step-label">${label.replace('Evaluation ','')}</div></div>`;
  }).join('');

  if(s.dailyLossLimit > 0){
    document.getElementById('accDetailDailyLoss').textContent = `$${s.dailyLossUsed.toLocaleString(undefined,{maximumFractionDigits:2})} / $${s.dailyLossLimit.toLocaleString(undefined,{maximumFractionDigits:2})}`;
    document.getElementById('accDetailDailyRange').innerHTML = `<span>start ${s.dayStartBalance.toLocaleString(undefined,{maximumFractionDigits:2})}</span><span>stop ${s.dailyStopBalance.toLocaleString(undefined,{maximumFractionDigits:2})}</span>`;
  }else{
    document.getElementById('accDetailDailyLoss').textContent = '—';
    document.getElementById('accDetailDailyRange').innerHTML = '';
  }

  document.getElementById('accDetailProfitDays').textContent = s.profitableDaysTarget
    ? `${s.profitableDaysCount} of ${s.profitableDaysTarget}`
    : `${s.profitableDaysCount} days`;

  document.getElementById('accDetailBalance').textContent = `$${s.currentBalance.toLocaleString(undefined,{maximumFractionDigits:2})}`;
  document.getElementById('accDetailBalanceFill').style.width = `${(s.balanceRangeFraction*100).toFixed(1)}%`;
  document.getElementById('accDetailBalanceRange').innerHTML = s.profitGoal
    ? `<span>stop ${s.drawdownFloor.toLocaleString(undefined,{maximumFractionDigits:0})}</span><span>goal ${s.profitGoal.toLocaleString(undefined,{maximumFractionDigits:0})}</span>`
    : '';

  const phaseTarget = phaseTargetFor(a.phase, s.accountSize);
  const earnStr = `$${s.totalEarn.toLocaleString(undefined,{maximumFractionDigits:2})}`;
  document.getElementById('accDetailEarn').textContent = (phaseTarget !== null)
    ? `${earnStr} / $${phaseTarget.toLocaleString(undefined,{maximumFractionDigits:2})}`
    : earnStr;

  // Open the modal before creating the chart, and defer the chart itself to
  // the next animation frame — Chart.js measures the canvas at construction
  // time, and a canvas that hasn't finished its layout pass after display:
  // none -> flex still reports stale/zero dimensions, which collapses the
  // zero-line gradient to a flat single color instead of the real
  // above/below-zero split.
  document.getElementById('accountDetailModal').classList.add('open');
  requestAnimationFrame(() => renderAccountEarnChart(s));
}

function closeAccountDetail(){
  document.getElementById('accountDetailModal').classList.remove('open');
}

// Upscale's fixed 5%/8% profit targets per evaluation phase — null for
// Funded (no fixed dollar target, it's ongoing payouts from there).
function phaseTargetFor(label, size){
  const l = (label || '').trim();
  if(l === 'Evaluation Phase 1') return size * 0.05;
  if(l === 'Evaluation Phase 2') return size * 0.08;
  return null;
}

// Hover text for a Phase stepper step — shown as "$achieved / $target" so
// a passed phase reads as fully reached (matches its own target) and the
// current phase reads as live progress. Changing the phase itself happens
// from Edit Account.
function phaseStepTooltip(acc, s, stageIdx, i, label){
  const size = Number(acc.account_size) || 0;

  if(label === 'Funded'){
    if(i < stageIdx) return 'Funded';
    if(i === stageIdx) return `Funded — $${(s.totalEarn||0).toLocaleString(undefined,{maximumFractionDigits:2})} earned`;
    return 'Not yet funded';
  }

  const target = phaseTargetFor(label, size);
  const targetStr = `$${target.toLocaleString(undefined,{maximumFractionDigits:2})}`;

  if(i < stageIdx) return `${targetStr} / ${targetStr} — target reached`;
  if(i === stageIdx){
    const achieved = Math.max(0, s.totalEarn || 0);
    return `$${achieved.toLocaleString(undefined,{maximumFractionDigits:2})} / ${targetStr}`;
  }
  return `Target: ${targetStr}`;
}

function renderAccountEarnChart(s){
  const canvas = document.getElementById('accDetailChart');
  const ctx = canvas.getContext('2d');
  if(accountDetailChartRef){ accountDetailChartRef.destroy(); accountDetailChartRef = null; }
  if(!s.series.length) return;

  const labels = s.series.map(p => p.date.toLocaleDateString('en-US',{month:'short', day:'numeric'}));
  const values = s.series.map(p => p.cum);
  const finalVal = values[values.length - 1];
  const lineColor = finalVal >= 0 ? cssVar('--win') : cssVar('--loss');
  const segColor = (c) => (c.p0.parsed.y < 0 || c.p1.parsed.y < 0) ? cssVar('--loss') : cssVar('--win');

  // Same "green above zero, red below" fade used by the main Equity Curve.
  const zeroFadeGradient = (context) => {
    const {chart} = context;
    const {ctx: c, chartArea, scales} = chart;
    if(!chartArea || !(chartArea.bottom > chartArea.top)) return lineColor + '22';
    const winColor = cssVar('--win'), lossColor = cssVar('--loss');
    const yZero = scales?.y?.getPixelForValue ? scales.y.getPixelForValue(0) : NaN;
    if(!Number.isFinite(yZero)) return lineColor + '22';
    const zeroRatio = Math.min(1, Math.max(0, (yZero - chartArea.top) / (chartArea.bottom - chartArea.top)));
    const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, winColor + '55');
    gradient.addColorStop(Math.max(0, zeroRatio - 0.001), winColor + '05');
    gradient.addColorStop(Math.min(1, zeroRatio + 0.001), lossColor + '05');
    gradient.addColorStop(1, lossColor + '55');
    return gradient;
  };

  accountDetailChartRef = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      {
        data: values, borderColor: lineColor, backgroundColor: zeroFadeGradient,
        segment: { borderColor: segColor },
        fill: 'origin', tension: 0.25, pointRadius: 0, borderWidth: 2, order: 1
      },
      {
        // dotted zero-reference line
        data: labels.map(() => 0),
        borderColor: cssVar('--muted'),
        borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false, order: 0
      }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => item.datasetIndex === 0,
          callbacks: { label: (c) => 'Cumulative: ' + fmtMoney(c.parsed.y) }
        }
      },
      scales: { x: { display: true, grid: { display: false } }, y: { display: true } }
    }
  });
}

function renderAccountsList(){
  const propPanel = document.getElementById('accountsPropFirmPanel');
  const exchPanel = document.getElementById('accountsExchangePanel');
  const emptyState = document.getElementById('accountsEmptyState');
  if(!propPanel || !exchPanel) return;

  populateCalcAccountDropdown();

  if(!TRADING_ACCOUNTS.length){
    propPanel.style.display = 'none';
    exchPanel.style.display = 'none';
    if(emptyState) emptyState.style.display = 'block';
    return;
  }
  if(emptyState) emptyState.style.display = 'none';

  const propFirmAccounts = TRADING_ACCOUNTS.filter(a => a.account_type !== 'Exchange');
  const exchangeAccounts = TRADING_ACCOUNTS.filter(a => a.account_type === 'Exchange');

  propPanel.style.display = propFirmAccounts.length ? 'block' : 'none';
  exchPanel.style.display = exchangeAccounts.length ? 'block' : 'none';

  document.getElementById('accountsListPropFirm').innerHTML = propFirmAccounts.map(accountCardHTML).join('');
  document.getElementById('accountsListExchange').innerHTML = exchangeAccounts.map(accountCardHTML).join('');
}

function accountCardHTML(a){
    const isExchange = a.account_type === 'Exchange';

    const rules = [];
    if(isExchange){
      rules.push(`<span class="pill pill-muted">Manual entry — API sync not connected yet</span>`);
    } else {
      if(a.max_daily_loss_pct != null) rules.push(`<span class="pill pill-red">Daily Loss ${a.max_daily_loss_pct}%</span>`);
      if(a.max_total_drawdown_pct != null) rules.push(`<span class="pill pill-red">Max DD ${a.max_total_drawdown_pct}%</span>`);
      if(a.profit_target_pct != null) rules.push(`<span class="pill pill-green">Target ${a.profit_target_pct}%</span>`);
      if(a.min_trading_days != null) rules.push(`<span class="pill pill-blue">Min ${a.min_trading_days} days</span>`);
      if(a.consistency_rule_pct != null) rules.push(`<span class="pill pill-orange">Consistency ${a.consistency_rule_pct}%</span>`);
    }

    let balanceHTML = '';
    if(a.current_balance != null && a.account_size){
      const pl = a.current_balance - a.account_size;
      const plPct = (pl / a.account_size) * 100;
      const plClass = pl >= 0 ? 'account-pl-pos' : 'account-pl-neg';
      const sign = pl >= 0 ? '+' : '';
      balanceHTML += `<div class="account-card-balance">$${Number(a.current_balance).toLocaleString()} <span class="${plClass}">(${sign}$${Math.abs(pl).toLocaleString()} · ${sign}${plPct.toFixed(1)}%)</span></div>`;

      if(a.profit_target_pct){
        const progressFraction = Math.max(0, Math.min(1, plPct / a.profit_target_pct));
        balanceHTML += `
          <div class="account-progress-bar"><div class="account-progress-fill" style="width:${(progressFraction*100).toFixed(1)}%;"></div></div>
          <div class="account-progress-label">${plPct >= 0 ? '' : '-'}${Math.abs(plPct).toFixed(1)}% of ${a.profit_target_pct}% target</div>
        `;
      }
    } else if(a.current_balance != null){
      balanceHTML += `<div class="account-card-balance">$${Number(a.current_balance).toLocaleString()}</div>`;
    }

    const startLabel = a.start_date ? `· start ${new Date(a.start_date + 'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'})}` : '';
    const metaLabel = isExchange
      ? `${escapeHtml(a.exchange_name || 'Exchange')} ${startLabel}`
      : `${escapeHtml(a.prop_firm || '—')} ${a.account_size ? `· $${Number(a.account_size).toLocaleString()}` : ''} ${a.phase ? `· ${escapeHtml(a.phase)}` : ''} ${startLabel}`;

    const status = a.status || 'Ongoing';
    const statusBoxClass = status === 'Passed' ? 'box-solid-win' : (status === 'Failed' ? 'box-solid-loss' : 'box-solid-info');
    const statusBadge = !isExchange ? `<div class="account-card-status box-badge ${statusBoxClass}">${status}</div>` : '';

    const riskBase = a.account_size ? Number(a.account_size) : (a.current_balance != null ? Number(a.current_balance) : null);
    const tradeCount = ALL_TRADES.filter(t => t.account === a.account_name).length;
    const riskHTML = (riskBase != null || tradeCount > 0)
      ? `<div class="account-card-risk">
          <div>Total Trades: <span>${tradeCount}</span></div>
          ${riskBase != null ? `<div>Risk Per Trade: <span>$${(riskBase * 0.003).toLocaleString(undefined,{maximumFractionDigits:2})}</span> <span class="account-risk-pct">(0.3%)</span></div>` : ''}
        </div>`
      : '';

    const cardClick = isExchange ? `openAccountModal(${a.id})` : `openAccountDetail(${a.id})`;

    return `
      <div class="account-card" onclick='${cardClick}'>
        ${statusBadge}
        <div class="account-card-name">${escapeHtml(a.account_name)}</div>
        <div class="account-card-meta">${metaLabel}</div>
        ${balanceHTML}
        <div class="account-card-rules">${rules.join('') || '<span class="pill pill-muted">No rules set</span>'}</div>
        ${riskHTML}
        <button class="account-edit-btn-corner" onclick='event.stopPropagation(); openAccountModal(${a.id})' title="Edit account">${accountEditIconSVG()}</button>
      </div>
    `;
}

// Manual "Save" draft — kept in localStorage (not the database) since it's
// just scratch state while waiting for a price to confirm before actually
// trading, so a page refresh doesn't wipe the Stop Loss %/Take Profit %/
// leverage list/price levels you'd already typed in.
let calcDraftLoaded = false;

function loadCalculatorDraft(){
  try{
    const raw = localStorage.getItem('poscalc-draft');
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    console.error("Couldn't load calculator draft:", e);
    return null;
  }
}

function saveCalculatorDraft(){
  const draft = {
    accountId: document.getElementById('calcAccount').value || null,
    stopLossPct: document.getElementById('calcStopLossPct').value || null,
    takeProfitPct: document.getElementById('calcTakeProfitPct').value || null,
    leverageList: document.getElementById('calcLeverageList').value || null,
    stopLevel: document.getElementById('calcStopLevel').value || null,
    profitLevel: document.getElementById('calcProfitLevel').value || null
  };
  try{
    localStorage.setItem('poscalc-draft', JSON.stringify(draft));
    showToast('Calculator draft saved');
  }catch(e){
    console.error("Couldn't save calculator draft:", e);
  }
}

function clearCalculatorDraft(){
  try{ localStorage.removeItem('poscalc-draft'); }catch(e){}
  document.getElementById('calcAccount').value = '';
  document.getElementById('calcStopLossPct').value = '';
  document.getElementById('calcTakeProfitPct').value = '';
  document.getElementById('calcLeverageList').value = '1,2,3,4,5';
  document.getElementById('calcStopLevel').value = '';
  document.getElementById('calcProfitLevel').value = '';
  renderPositionCalculator();
  showToast('Calculator cleared');
}

function populateCalcAccountDropdown(){
  const sel = document.getElementById('calcAccount');
  if(!sel) return;
  let prevValue = sel.value;

  if(!calcDraftLoaded){
    calcDraftLoaded = true;
    const draft = loadCalculatorDraft();
    if(draft){
      if(draft.accountId) prevValue = draft.accountId;
      if(draft.stopLossPct != null) document.getElementById('calcStopLossPct').value = draft.stopLossPct;
      if(draft.takeProfitPct != null) document.getElementById('calcTakeProfitPct').value = draft.takeProfitPct;
      if(draft.leverageList) document.getElementById('calcLeverageList').value = draft.leverageList;
      if(draft.stopLevel != null) document.getElementById('calcStopLevel').value = draft.stopLevel;
      if(draft.profitLevel != null) document.getElementById('calcProfitLevel').value = draft.profitLevel;
    }
  }

  sel.innerHTML = '<option value="">Select account…</option>' +
    TRADING_ACCOUNTS.map(a => `<option value="${a.id}">${escapeHtml(a.account_name)}</option>`).join('');
  if(TRADING_ACCOUNTS.some(a => String(a.id) === prevValue)) sel.value = prevValue;
  renderPositionCalculator();
}

// Reads the calculator's current inputs and derives risk amount / position
// size — shared by the table render and by "Trade This Setup" so both use
// the exact same numbers.
function getCalculatorState(){
  const accSel = document.getElementById('calcAccount');
  const account = accSel ? TRADING_ACCOUNTS.find(a => String(a.id) === accSel.value) : null;
  const accountBase = account ? Number(account.account_size ?? account.current_balance ?? 0) : 0;
  const riskPct = PROFILE_DATA?.risk_per_trade != null ? Number(PROFILE_DATA.risk_per_trade) : 0.3;
  const riskAmount = accountBase * (riskPct / 100);
  const slPct = parseFloat(document.getElementById('calcStopLossPct').value);
  const tpPct = parseFloat(document.getElementById('calcTakeProfitPct').value);
  const positionSize = (account && slPct > 0) ? riskAmount / (slPct / 100) : null;
  return { account, riskPct, riskAmount, slPct, tpPct, positionSize };
}

function renderPositionCalculator(){
  const riskAmountEl = document.getElementById('calcRiskAmount');
  const positionSizeEl = document.getElementById('calcPositionSize');
  const tableBody = document.getElementById('calcTableBody');
  if(!riskAmountEl || !tableBody) return;

  const { account, riskPct, riskAmount, slPct, tpPct, positionSize } = getCalculatorState();

  riskAmountEl.textContent = account ? `$${riskAmount.toLocaleString(undefined,{maximumFractionDigits:2})} (${riskPct}%)` : '—';
  positionSizeEl.textContent = positionSize != null ? `$${positionSize.toLocaleString(undefined,{maximumFractionDigits:2})}` : '—';

  const leverages = (document.getElementById('calcLeverageList').value || '')
    .split(',').map(v => parseFloat(v.trim())).filter(v => v > 0);

  if(positionSize == null || !leverages.length){
    tableBody.innerHTML = `<tr><td colspan="7" style="color:var(--muted);">Select an account and enter a Stop Loss % to see leverage breakdown.</td></tr>`;
    return;
  }

  // "Best" = the lowest leverage whose required margin still fits inside the
  // account's actual available balance — use the least leverage necessary
  // instead of always maxing it out. Falls back to the cheapest-margin
  // option if even the highest leverage doesn't fit.
  const availableBalance = account ? Number(account.current_balance ?? account.account_size ?? 0) : 0;
  const rows = leverages.map(lev => ({ lev, margin: positionSize / lev }));
  const affordable = rows.filter(r => r.margin <= availableBalance);
  const bestByMinLeverage = affordable.length
    ? affordable.reduce((best, r) => r.lev < best.lev ? r : best, affordable[0]).lev
    : rows.reduce((best, r) => r.margin < best.margin ? r : best, rows[0]).lev;

  // Stop Loss % / Take Profit % are PRICE distances — they don't change with
  // leverage (the stop price is the stop price no matter your margin), so
  // every row repeats the same top-level %. Margin is what shrinks per
  // leverage (Position Size / Leverage), and since Margin x Leverage always
  // equals the fixed Position Size, the dollar Loss/Profit come out
  // identical on every row too — that's the whole point of position sizing.
  tableBody.innerHTML = leverages.map(lev => {
    const margin = positionSize / lev;
    const profit = (tpPct > 0 && slPct > 0) ? riskAmount * (tpPct / slPct) : null;
    const loss = riskAmount;
    const isBest = lev === bestByMinLeverage;
    return `<tr class="${isBest ? 'poscalc-row-best' : ''}">
      <td>${lev}x</td>
      <td class="poscalc-margin-cell">${margin.toFixed(2)} <button class="poscalc-copy-btn" title="Copy margin" onclick="copyMarginToClipboard('${margin.toFixed(2)}', this)">${copyIconSVG()}</button></td>
      <td>${slPct > 0 ? slPct.toFixed(4)+'%' : '—'}</td>
      <td>${tpPct > 0 ? tpPct.toFixed(4)+'%' : '—'}</td>
      <td>${profit != null ? '$'+profit.toLocaleString(undefined,{maximumFractionDigits:2}) : '—'}</td>
      <td>$${loss.toLocaleString(undefined,{maximumFractionDigits:2})}</td>
      <td><button class="poscalc-accent-btn" onclick="tradeThisSetup(${lev})">Trade This Setup</button></td>
    </tr>`;
  }).join('');
}

function copyIconSVG(){
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
}

async function copyMarginToClipboard(value, btn){
  try{
    await navigator.clipboard.writeText(value);
  }catch(e){
    console.error("Couldn't copy to clipboard:", e);
    return;
  }
  const original = btn.innerHTML;
  btn.classList.add('copied');
  btn.innerHTML = '✓';
  setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = original; }, 1200);
}

async function copyTradeSummaryToClipboard(btn){
  try{
    await navigator.clipboard.writeText(btn.dataset.summary || '');
  }catch(e){
    console.error("Couldn't copy trade summary:", e);
    return;
  }
  const original = btn.innerHTML;
  btn.classList.add('copied');
  btn.innerHTML = '✓';
  setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = original; }, 1200);
}

async function tradeThisSetup(lev){
  const { account, riskAmount, slPct, tpPct, positionSize } = getCalculatorState();
  if(!account || positionSize == null){
    await customAlert('Select an account and a Stop Loss % first.');
    return;
  }
  const margin = positionSize / lev;

  const payload = {
    account_id: account.id,
    account_name: account.account_name,
    leverage: lev,
    margin: margin,
    stop_loss_pct: slPct,
    take_profit_pct: (tpPct > 0 ? tpPct : null),
    risk_amount: riskAmount,
    position_size: positionSize,
    status: 'Pending'
  };

  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/position_setups`, {
      method: 'POST',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error(await res.text());
    loadSavedSetups();
  }catch(e){
    console.error("Couldn't save setup:", e);
    await customAlert("Couldn't save this setup — please try again.");
  }
}

let SAVED_SETUPS = [];
let editingSetupNotesId = null;

async function loadSavedSetups(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/position_setups?select=*&order=created_at.desc`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
    });
    if(!res.ok) throw new Error(await res.text());
    SAVED_SETUPS = await res.json();
  }catch(e){
    console.error("Couldn't load saved setups:", e);
    SAVED_SETUPS = [];
  }
  renderSavedSetups();
}

function setupStatusPillClass(status){
  if(status === 'Pending') return 'pill-orange';
  if(status === 'Won' || status === 'Closed' || status === 'Journaled') return 'pill-green';
  if(status === 'Lost') return 'pill-red';
  return 'pill-muted';
}

function setupRowHTML(s){
  const margin = Number(s.margin);
  const slPct = s.stop_loss_pct != null ? Number(s.stop_loss_pct) : null;
  const tpPct = s.take_profit_pct != null ? Number(s.take_profit_pct) : null;
  const riskAmount = Number(s.risk_amount);
  const profit = (tpPct != null && slPct) ? riskAmount * (tpPct / slPct) : null;
  const loss = riskAmount;
  const updateCount = Array.isArray(s.notes_log) ? s.notes_log.length : 0;
  const status = s.status || 'Pending';
  const statusPillClass = setupStatusPillClass(status);
  return `
  <tr onclick="openSetupNotesModal(${s.id})" style="cursor:pointer;">
    <td>${escapeHtml(s.symbol || '—')}</td>
    <td>${new Date(s.created_at).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}</td>
    <td>${escapeHtml(s.account_name || '—')}</td>
    <td>${s.leverage}x</td>
    <td>${margin.toFixed(2)}</td>
    <td>${slPct != null ? slPct.toFixed(4)+'%' : '—'}</td>
    <td>${tpPct != null ? tpPct.toFixed(4)+'%' : '—'}</td>
    <td>${profit != null ? '$'+profit.toLocaleString(undefined,{maximumFractionDigits:2}) : '—'}</td>
    <td>${loss != null ? '$'+loss.toLocaleString(undefined,{maximumFractionDigits:2}) : '—'}</td>
    <td>$${riskAmount.toLocaleString(undefined,{maximumFractionDigits:2})}</td>
    <td>$${Number(s.position_size).toLocaleString(undefined,{maximumFractionDigits:2})}</td>
    <td>${updateCount}</td>
    <td><span class="pill ${statusPillClass}">${escapeHtml(status)}</span></td>
    <td>
      ${status !== 'Journaled'
        ? `<button class="poscalc-accent-btn" onclick="event.stopPropagation(); journalFromSetup(${s.id})">Journal</button>`
        : `<button class="poscalc-accent-btn" onclick="event.stopPropagation(); setSetupStatus(${s.id}, 'Pending')">Revert to Pending</button>`}
      <button class="drawer-danger-btn" onclick="event.stopPropagation(); deleteSavedSetup(${s.id})">Delete</button>
    </td>
  </tr>
`;
}

function renderSavedSetups(){
  const pendingTable = document.getElementById('pendingSetupsTable');
  const pendingBody = document.getElementById('pendingSetupsBody');
  const pendingEmptyState = document.getElementById('pendingSetupsEmptyState');
  const journaledTable = document.getElementById('journaledSetupsTable');
  const journaledBody = document.getElementById('journaledSetupsBody');
  const journaledEmptyState = document.getElementById('journaledSetupsEmptyState');
  if(!pendingTable || !pendingBody || !journaledTable || !journaledBody) return;

  const pending = SAVED_SETUPS.filter(s => (s.status || 'Pending') !== 'Journaled');
  const journaled = SAVED_SETUPS.filter(s => s.status === 'Journaled');

  if(pending.length){
    pendingEmptyState.style.display = 'none';
    pendingTable.style.display = '';
    pendingBody.innerHTML = pending.map(setupRowHTML).join('');
  }else{
    pendingEmptyState.style.display = 'block';
    pendingTable.style.display = 'none';
  }

  if(journaled.length){
    journaledEmptyState.style.display = 'none';
    journaledTable.style.display = '';
    journaledBody.innerHTML = journaled.map(setupRowHTML).join('');
  }else{
    journaledEmptyState.style.display = 'block';
    journaledTable.style.display = 'none';
  }
}

// Before/After are two fixed, independent slots (not a growing log) — each
// pasted image replaces whatever was in that slot. Uploaded to storage only
// on Save, so cancelling out of the modal costs nothing.
let activeScreenshotSlot = 'before';
let pendingScreenshotBlobs = { before: null, after: null };
let removedScreenshotSlots = { before: false, after: false };

function setActiveScreenshotSlot(slot){
  activeScreenshotSlot = slot;
}

function _screenshotZoneId(slot){
  return slot === 'before' ? 'setupNotesBeforeDropzone' : 'setupNotesAfterDropzone';
}

document.addEventListener('paste', (e) => {
  const modal = document.getElementById('setupNotesModal');
  if(!modal || !modal.classList.contains('open')) return;
  const items = e.clipboardData && e.clipboardData.items;
  if(!items) return;
  for(const item of items){
    if(item.type && item.type.startsWith('image/')){
      const blob = item.getAsFile();
      if(!blob) continue;
      pendingScreenshotBlobs[activeScreenshotSlot] = blob;
      removedScreenshotSlots[activeScreenshotSlot] = false;
      renderScreenshotSlotPreview(activeScreenshotSlot, URL.createObjectURL(blob));
      e.preventDefault();
      break;
    }
  }
});

function renderScreenshotSlotPreview(slot, url){
  const zone = document.getElementById(_screenshotZoneId(slot));
  if(!zone) return;
  zone.innerHTML = `
    <img src="${url}" onclick="event.stopPropagation(); openLightbox('${url}')">
    <button class="poscalc-copy-btn" title="Remove" onclick="event.stopPropagation(); removeScreenshotSlot('${slot}')">✕</button>
  `;
}

function removeScreenshotSlot(slot){
  pendingScreenshotBlobs[slot] = null;
  removedScreenshotSlots[slot] = true;
  const zone = document.getElementById(_screenshotZoneId(slot));
  if(zone) zone.innerHTML = 'Click, then paste (Ctrl+V)';
}

function resetScreenshotSlots(){
  activeScreenshotSlot = 'before';
  pendingScreenshotBlobs = { before: null, after: null };
  removedScreenshotSlots = { before: false, after: false };
}

async function loadScreenshotSlotsIntoModal(s){
  for(const slot of ['before','after']){
    const path = s[`${slot}_screenshot`];
    const zone = document.getElementById(_screenshotZoneId(slot));
    if(!zone) continue;
    if(path){
      try{
        const { data } = await sb.storage.from('setup-screenshots').createSignedUrl(path, 3600);
        if(data && data.signedUrl) renderScreenshotSlotPreview(slot, data.signedUrl);
        else zone.innerHTML = 'Click, then paste (Ctrl+V)';
      }catch(e){
        console.error(`Couldn't load ${slot} screenshot:`, e);
        zone.innerHTML = 'Click, then paste (Ctrl+V)';
      }
    }else{
      zone.innerHTML = 'Click, then paste (Ctrl+V)';
    }
  }
}

async function uploadSetupScreenshot(blob, setupId, slot){
  const { data: { user } } = await sb.auth.getUser();
  const ext = (blob.type && blob.type.split('/')[1]) || 'png';
  const path = `${user.id}/setup_${setupId}_${slot}_${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('setup-screenshots').upload(path, blob, { contentType: blob.type || 'image/png' });
  if(error) throw error;
  return path;
}

async function openSetupNotesModal(id){
  let s = SAVED_SETUPS.find(x => x.id === id);
  if(!s){
    // Opened from the Trade Journal side, where SAVED_SETUPS may never have
    // been loaded — fetch this one row directly instead of requiring a
    // detour through the Calculator view first.
    try{
      const res = await fetch(`${SUPABASE_URL}/rest/v1/position_setups?id=eq.${id}&select=*`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
      });
      if(!res.ok) throw new Error(await res.text());
      const rows = await res.json();
      s = rows[0];
      if(s) SAVED_SETUPS.push(s);
    }catch(e){
      console.error("Couldn't load setup:", e);
    }
  }
  if(!s) return;
  editingSetupNotesId = id;
  resetScreenshotSlots();
  document.getElementById('setupNotesSymbol').value = s.symbol || '';
  document.getElementById('setupNotesNewEntry').value = '';
  renderSetupNotesLog(s.notes_log || []);
  loadScreenshotSlotsIntoModal(s);
  document.getElementById('setupNotesModal').classList.add('open');
}

function closeSetupNotesModal(){
  document.getElementById('setupNotesModal').classList.remove('open');
  editingSetupNotesId = null;
  resetScreenshotSlots();
}

function renderSetupNotesLog(log){
  const el = document.getElementById('setupNotesLog');
  if(!log.length){
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;">No notes yet.</div>';
    return;
  }
  el.innerHTML = log.map(entry => `
    <div style="margin-bottom:10px;">
      <div style="font-size:11px;color:var(--muted);font-family:'IBM Plex Mono',monospace;">${new Date(entry.ts).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</div>
      <div style="font-size:13px;color:var(--ink);white-space:pre-wrap;">${escapeHtml(entry.text)}</div>
    </div>
  `).join('');
}

// Appends a timestamped entry instead of overwriting one blob of text, so
// each update while the trade is open keeps its own datetime.
async function saveSetupNotes(){
  try{
    if(!editingSetupNotesId){ await customAlert("No setup is open — close this and click a saved setup row first."); return; }
    const s = SAVED_SETUPS.find(x => x.id === editingSetupNotesId);
    if(!s){ await customAlert("Couldn't find that saved setup — try reopening it."); return; }

    const symbol = document.getElementById('setupNotesSymbol').value.trim() || null;
    const newText = document.getElementById('setupNotesNewEntry').value.trim();
    const hasScreenshotChange = pendingScreenshotBlobs.before || pendingScreenshotBlobs.after
      || removedScreenshotSlots.before || removedScreenshotSlots.after;
    if(!newText && !hasScreenshotChange && symbol === (s.symbol || null)){
      await customAlert('Nothing to save — enter a Symbol, write a New Note, or paste a screenshot first.');
      return;
    }
    const log = Array.isArray(s.notes_log) ? [...s.notes_log] : [];
    if(newText) log.push({ ts: new Date().toISOString(), text: newText });

    const patch = { symbol, notes_log: log };
    for(const slot of ['before','after']){
      if(pendingScreenshotBlobs[slot]){
        patch[`${slot}_screenshot`] = await uploadSetupScreenshot(pendingScreenshotBlobs[slot], editingSetupNotesId, slot);
      }else if(removedScreenshotSlots[slot]){
        patch[`${slot}_screenshot`] = null;
      }
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/position_setups?id=eq.${editingSetupNotesId}`, {
      method: 'PATCH',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(patch)
    });
    if(!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    if(!rows.length){
      throw new Error("Nothing actually updated in the database (0 rows) — the UPDATE policy on position_setups is probably missing. Run supabase_position_setups_add_update_policy.sql in Supabase.");
    }

    // Update local state directly instead of round-tripping through a
    // reload — shows the new entry immediately, no dependence on refetch timing.
    Object.assign(s, patch);
    document.getElementById('setupNotesNewEntry').value = '';
    resetScreenshotSlots();
    renderSetupNotesLog(log);
    renderSavedSetups();
  }catch(e){
    console.error("Couldn't save setup notes:", e);
    await customAlert("Couldn't save: " + e.message);
  }
}

// Opens the same Setup Notes modal from a Trade Journal entry that was
// created via "Journal" — same underlying position_setups row either way,
// so edits made here show up back in the Calculator too.
function openLinkedSetupNotes(){
  if(!drawerRowData || !drawerRowData.linked_setup_id) return;
  openSetupNotesModal(drawerRowData.linked_setup_id);
}
function openLinkedSetupNotesFromTradeView(){
  const row = tradeViewList[tradeViewIndex];
  if(!row || !row.linked_setup_id) return;
  openSetupNotesModal(row.linked_setup_id);
}

// Carries a saved setup's Account/Position Size/Symbol/notes log into the
// same create-drawer Easy Add prefills — the timestamped log gets flattened
// into Timestamp/Comment blocks since the Trade Journal's Notes field is
// plain text.
function journalFromSetup(id){
  const s = SAVED_SETUPS.find(x => x.id === id);
  if(!s) return;
  const log = Array.isArray(s.notes_log) ? s.notes_log : [];
  const notesText = log.map(entry =>
    `${new Date(entry.ts).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}\n${entry.text}`
  ).join('\n\n');

  const slPct = s.stop_loss_pct != null ? Number(s.stop_loss_pct) : null;
  const tpPct = s.take_profit_pct != null ? Number(s.take_profit_pct) : null;
  const rr = (slPct && tpPct != null) ? +(tpPct / slPct).toFixed(2) : undefined;

  pendingJournalPrefill = {
    account: s.account_name || undefined,
    position_size: s.position_size != null ? Number(s.position_size) : undefined,
    symbol: s.symbol || undefined,
    notes: notesText || undefined,
    rr: rr
  };
  pendingJournalSetupId = id;
  openEasyAddModal();
}

// Flips a saved setup's Status to "Journaled" once its trade actually gets
// saved to the Trade Journal (not just prefilled/parsed) — updates local
// state directly and only re-renders the Saved Setups table if it's the
// active view, matching the pattern used by saveSetupNotes().
async function setSetupStatus(id, status){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/position_setups?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify({ status })
    });
    if(!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    if(!rows.length) return;
    const s = SAVED_SETUPS.find(x => x.id === id);
    if(s) s.status = status;
    if(currentView === 'calculator') renderSavedSetups();
  }catch(e){
    console.error(`Couldn't set setup status to ${status}:`, e);
  }
}

async function deleteSavedSetup(id){
  if(!(await customConfirm('Delete this saved setup?'))) return;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/position_setups?id=eq.${id}`, {
      method: 'DELETE',
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
    });
    if(!res.ok) throw new Error(await res.text());
    SAVED_SETUPS = SAVED_SETUPS.filter(s => s.id !== id);
    renderSavedSetups();
  }catch(e){
    console.error("Couldn't delete setup:", e);
    await customAlert("Couldn't delete this setup — please try again.");
  }
}

function accountEditIconSVG(){
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
}

function editIconSVG(){
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
}

function deleteIconSVG(){
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px;"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
}

function linkIconSVG(){
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>`;
}

function imageIconSVG(){
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
}

function openAccountModal(id){
  editingAccountId = id || null;
  const a = id ? TRADING_ACCOUNTS.find(x => x.id === id) : null;

  document.getElementById('accountModalTitle').textContent = a ? 'Edit Account' : '+ Add Account';
  document.getElementById('accType').value = a ? (a.account_type || 'Prop Firm') : 'Prop Firm';
  document.getElementById('accName').value = a ? a.account_name : '';
  document.getElementById('accPropFirm').value = a ? (a.prop_firm || '') : '';
  document.getElementById('accExchangeName').value = a ? (a.exchange_name || 'Binance') : 'Binance';
  document.getElementById('accSize').value = a && a.account_size != null ? a.account_size : '';
  document.getElementById('accBalance').value = a && a.current_balance != null ? a.current_balance : '';
  document.getElementById('accPhase').value = a ? (a.phase || 'Evaluation Phase 1') : 'Evaluation Phase 1';
  document.getElementById('accStatus').value = a ? (a.status || 'Ongoing') : 'Ongoing';
  document.getElementById('accStartDate').value = a && a.start_date ? a.start_date : '';
  document.getElementById('accPhaseStartDate').value = a && a.phase_start_date ? a.phase_start_date : '';
  document.getElementById('accPhaseStartBalance').value = a && a.phase_start_balance != null ? a.phase_start_balance : '';
  document.getElementById('accMaxDailyLoss').value = a && a.max_daily_loss_pct != null ? a.max_daily_loss_pct : '';
  document.getElementById('accMaxDrawdown').value = a && a.max_total_drawdown_pct != null ? a.max_total_drawdown_pct : '';
  document.getElementById('accProfitTarget').value = a && a.profit_target_pct != null ? a.profit_target_pct : '';
  document.getElementById('accMinDays').value = a && a.min_trading_days != null ? a.min_trading_days : '';
  document.getElementById('accConsistency').value = a && a.consistency_rule_pct != null ? a.consistency_rule_pct : '';
  document.getElementById('accountError').textContent = '';
  document.getElementById('accountSaveBtn').textContent = a ? 'Save changes' : 'Save Account';
  document.getElementById('accountDeleteBtn').style.display = a ? 'inline-block' : 'none';
  toggleAccountTypeFields();
  document.getElementById('accountModal').classList.add('open');
}
function closeAccountModal(){
  document.getElementById('accountModal').classList.remove('open');
}

function toggleAccountTypeFields(){
  const isExchange = document.getElementById('accType').value === 'Exchange';
  document.getElementById('accPropFirmFields').style.display = isExchange ? 'none' : 'block';
  document.getElementById('accExchangeFields').style.display = isExchange ? 'block' : 'none';
}

function _numOrNull(id){
  const v = document.getElementById(id).value;
  return v === '' ? null : parseFloat(v);
}

async function saveAccount(){
  const errEl = document.getElementById('accountError');
  const btn = document.getElementById('accountSaveBtn');
  errEl.textContent = '';

  const accountName = document.getElementById('accName').value.trim();
  if(!accountName){ errEl.textContent = 'Account name is required.'; return; }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const accountType = document.getElementById('accType').value;
  const isExchange = accountType === 'Exchange';

  const payload = {
    account_type: accountType,
    account_name: accountName,
    account_size: isExchange ? null : _numOrNull('accSize'),
    current_balance: _numOrNull('accBalance'),
    start_date: document.getElementById('accStartDate').value || null,
    prop_firm: isExchange ? null : (document.getElementById('accPropFirm').value.trim() || null),
    status: isExchange ? 'Ongoing' : document.getElementById('accStatus').value,
    phase: isExchange ? null : document.getElementById('accPhase').value,
    phase_start_date: isExchange ? null : (document.getElementById('accPhaseStartDate').value || null),
    phase_start_balance: isExchange ? null : _numOrNull('accPhaseStartBalance'),
    max_daily_loss_pct: isExchange ? null : _numOrNull('accMaxDailyLoss'),
    max_total_drawdown_pct: isExchange ? null : _numOrNull('accMaxDrawdown'),
    profit_target_pct: isExchange ? null : _numOrNull('accProfitTarget'),
    min_trading_days: isExchange ? null : (document.getElementById('accMinDays').value === '' ? null : parseInt(document.getElementById('accMinDays').value, 10)),
    consistency_rule_pct: isExchange ? null : _numOrNull('accConsistency'),
    exchange_name: isExchange ? document.getElementById('accExchangeName').value : null
  };

  try{
    const res = editingAccountId
      ? await fetch(`${SUPABASE_URL}/rest/v1/trading_accounts?id=eq.${editingAccountId}`, {
          method: 'PATCH',
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify(payload)
        })
      : await fetch(`${SUPABASE_URL}/rest/v1/trading_accounts`, {
          method: 'POST',
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify([payload])
        });
    if(!res.ok) throw new Error(await res.text());

    closeAccountModal();
    await loadAccounts();
    showToast(editingAccountId ? 'Account updated' : 'Account added');
  }catch(e){
    console.error("Couldn't save account:", e);
    let hint = '';
    try{
      const parsed = JSON.parse(e.message);
      if(parsed.message) hint = parsed.message;
    }catch(_){ hint = e.message || ''; }
    errEl.textContent = hint ? `Couldn't save — ${hint}` : "Couldn't save — please try again.";
  }finally{
    btn.disabled = false;
    btn.textContent = editingAccountId ? 'Save changes' : 'Save Account';
  }
}

async function deleteAccount(){
  if(!editingAccountId) return;
  if(!(await customConfirm('Delete this account? This cannot be undone.'))) return;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_accounts?id=eq.${editingAccountId}`, {
      method: 'DELETE',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Prefer": "return=minimal"
      }
    });
    if(!res.ok) throw new Error(await res.text());
    closeAccountModal();
    await loadAccounts();
    showToast('Account deleted');
  }catch(e){
    console.error("Couldn't delete account:", e);
    await customAlert("Couldn't delete — please try again.");
  }
}

/* ---------------- Notebook ---------------- */
let NOTES = [];
let editingNoteId = null;
let viewingNoteId = null;
const NOTE_TAGS = ['General','Strategy','Psychology','Market Notes','Trade Review','Accounts'];
const NOTE_TAG_PILL_CLASS = {
  Strategy: 'pill-orange',
  Psychology: 'pill-red',
  'Market Notes': 'pill-green',
  'Trade Review': 'pill-muted',
  Accounts: 'pill-blue',
  General: 'pill-muted'
};
let activeNoteTagFilter = 'All';

async function loadNotes(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notebook_entries?select=*&order=updated_at.desc`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}` }
    });
    if(!res.ok) throw new Error(await res.text());
    NOTES = await res.json();
  }catch(e){
    console.error("Couldn't load notes:", e);
    NOTES = [];
  }
  renderNoteTagFilters();
  renderNoteList();
}

function renderNoteTagFilters(){
  const row = document.getElementById('noteTagFilterRow');
  if(!row) return;
  const tags = ['All', ...NOTE_TAGS];
  row.innerHTML = tags.map(t =>
    `<span class="tag-filter ${activeNoteTagFilter===t?'active':''}" onclick="switchNoteTagFilter('${t}')">${t}</span>`
  ).join('');
}

function switchNoteTagFilter(tag){
  activeNoteTagFilter = tag;
  renderNoteTagFilters();
  renderNoteList();
}

function renderNoteList(){
  const wrap = document.getElementById('noteListItems');
  if(!wrap) return;
  const search = (document.getElementById('noteSearchInput')?.value || '').trim().toLowerCase();

  let list = NOTES;
  if(activeNoteTagFilter !== 'All') list = list.filter(n => (n.tag || 'General') === activeNoteTagFilter);
  if(search) list = list.filter(n => (n.title||'').toLowerCase().includes(search) || (n.body||'').toLowerCase().includes(search));

  if(!list.length){
    wrap.innerHTML = `<div class="empty-state">No notes yet — click "+ New Note" to start writing.</div>`;
    return;
  }

  wrap.innerHTML = list.map(n => {
    const dateLabel = n.updated_at ? new Date(n.updated_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
    const snippet = (n.body || '').replace(/\s+/g,' ').trim();
    const tagClass = NOTE_TAG_PILL_CLASS[n.tag] || 'pill-muted';
    return `
      <div class="note-item ${viewingNoteId===n.id?'selected':''}" onclick="selectNote(${n.id})">
        <div class="note-item-top">
          <span class="note-item-title">${escapeHtml(n.title || 'Untitled')}</span>
          <span class="note-item-date">${dateLabel}</span>
        </div>
        <div class="note-item-snippet">${escapeHtml(snippet) || '—'}</div>
        <span class="pill ${tagClass}">${escapeHtml(n.tag || 'General')}</span>
      </div>
    `;
  }).join('');
}

function openNoteModal(id){
  editingNoteId = id || null;
  const n = id ? NOTES.find(x => x.id === id) : null;
  document.getElementById('noteModalTitle').textContent = n ? 'Edit Note' : '+ New Note';
  document.getElementById('noteTitleInput').value = n ? (n.title || '') : '';
  document.getElementById('noteTagSelect').value = n ? (n.tag || 'General') : 'General';
  document.getElementById('noteBodyInput').value = n ? (n.body || '') : '';
  document.getElementById('noteModalError').textContent = '';
  document.getElementById('noteModal').classList.add('open');
}

function closeNoteModal(){
  document.getElementById('noteModal').classList.remove('open');
}

async function saveNote(){
  const errEl = document.getElementById('noteModalError');
  errEl.textContent = '';
  const title = document.getElementById('noteTitleInput').value.trim();
  if(!title){ errEl.textContent = 'Please add a title.'; return; }

  const btn = document.getElementById('noteSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const payload = {
    title,
    tag: document.getElementById('noteTagSelect').value,
    body: document.getElementById('noteBodyInput').value,
    updated_at: new Date().toISOString()
  };

  try{
    const res = editingNoteId
      ? await fetch(`${SUPABASE_URL}/rest/v1/notebook_entries?id=eq.${editingNoteId}`, {
          method: 'PATCH',
          headers: {
            "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json", "Prefer": "return=minimal"
          },
          body: JSON.stringify(payload)
        })
      : await fetch(`${SUPABASE_URL}/rest/v1/notebook_entries`, {
          method: 'POST',
          headers: {
            "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json", "Prefer": "return=minimal"
          },
          body: JSON.stringify([payload])
        });
    if(!res.ok) throw new Error(await res.text());
    const wasEditing = editingNoteId;
    closeNoteModal();
    await loadNotes();
    if(wasEditing) selectNote(wasEditing);
    showToast(wasEditing ? 'Note updated' : 'Note created');
  }catch(e){
    console.error("Couldn't save note:", e);
    errEl.textContent = "Couldn't save — please try again.";
  }finally{
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

function selectNote(id){
  const n = NOTES.find(x => x.id === id);
  if(!n) return;
  viewingNoteId = id;

  document.getElementById('noteDetailEmpty').style.display = 'none';
  document.getElementById('noteDetailWrap').style.display = 'block';
  document.getElementById('noteDetailTitle').textContent = n.title || 'Untitled';
  const tagEl = document.getElementById('noteDetailTag');
  tagEl.textContent = n.tag || 'General';
  tagEl.className = 'pill ' + (NOTE_TAG_PILL_CLASS[n.tag] || 'pill-muted');
  document.getElementById('noteDetailDate').textContent = n.updated_at
    ? `Last edited ${new Date(n.updated_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}`
    : '';
  document.getElementById('noteDetailText').textContent = n.body || '';

  renderNoteList();
}

function editSelectedNote(){
  if(viewingNoteId) openNoteModal(viewingNoteId);
}

async function deleteSelectedNote(){
  if(!viewingNoteId) return;
  if(!(await customConfirm('Delete this note permanently? This cannot be undone.'))) return;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notebook_entries?id=eq.${viewingNoteId}`, {
      method: 'DELETE',
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${USER_ACCESS_TOKEN}`, "Prefer": "return=minimal" }
    });
    if(!res.ok) throw new Error(await res.text());
    viewingNoteId = null;
    document.getElementById('noteDetailWrap').style.display = 'none';
    document.getElementById('noteDetailEmpty').style.display = 'block';
    await loadNotes();
    showToast('Note deleted');
  }catch(e){
    console.error("Couldn't delete note:", e);
    await customAlert("Couldn't delete — please try again.");
  }
}
