/* PALIT SA js/supabase.js — inihahain lang ng test server, hindi kailanman
   naisusulat sa proyekto. Layunin: makapasok sa dashboard nang walang tunay na
   session, para masukat ang TUNAY na layout nito sa telepono. Kung wala ito,
   ang dashboard.html ay nag-re-redirect sa login at tatlong beses kong
   masusukat ang maling page habang iniuulat na malinis ang dashboard. */
const SUPABASE_URL = "https://fake.supabase.test";
const SUPABASE_KEY = "fake-anon-key";
const TABLE_NAME   = "trading_journal";

const sb = {
  auth: {
    getSession: async () => ({ data: { session: {
      access_token: 'fake-token',
      user: { id: '00000000-0000-4000-8000-000000000001', email: 'test@local' },
    } } }),
    getUser: async () => ({ data: { user: {
      id: '00000000-0000-4000-8000-000000000001', email: 'test@local' } } }),
    updateUser: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
  },
  storage: { from: () => ({
    createSignedUrl: async () => ({ data: null, error: { message: 'walang storage sa test' } }),
    upload: async () => ({ error: null }),
    remove: async () => ({ error: null }),
  }) },
  from: () => ({ select: () => ({ data: [], error: null }) }),
};

/* ---- ang data ---------------------------------------------------------- */
const _P = ['Continuation','Reversal','Range Break','Liquidity Sweep','Trend Pullback'];
const _S = ['Asia','London','New York','London + NY Overlap'];
const _C = ['Bullish Engulfing','H&S','Double Bottom','Flag','Wedge'];
const _X = ['TP Hit','SL Hit','Manual Early TP - Valid','Manual Early TP - Invalid'];
const _A = ['Upscale 10K','Upscale 50K','Upscale 5K'];
const _T = ['Evaluation','Demo','Funded','Exchange'];
const _R = ["Would Have BE'd Out",'No BE at Prev High/Low','Held Through Invalidation',
            'Ego Hold Despite Invalidation','Cut on Invalidation','Cut Too Early',
            'Overtrading','Revenge Trade','Moved Stop Loss','No Stop Loss'];

// Deterministiko — para ang parehong takbo ay magbigay ng parehong layout.
let _seed = 42;
const _rnd = () => (_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const _pick = a => a[Math.floor(_rnd() * a.length)];

/* Ang mga trade ay nagtatapos NGAYON, hindi sa isang naka-hardcode na petsa.
   Kung hindi, ang apat na tanong na nakabatay sa oras — ang buwang ito, ang
   huling 30 araw — ay walang makikitang trade at magsasabing "kulang", at
   hindi ko malalaman kung tama ba talaga sila kapag may laman. */
const FAKE_TRADES = (() => {
  const out = [];
  /* Tatlong trade kada araw ng pangangalakal, hindi isa kada 1.25 araw.
     Kailangan nito ng dalawang tanong — "lumalala ba ako pagkatapos matalo" at
     "kailan ako dapat tumigil" — na parehong nakabatay sa pagkakasunod-sunod SA
     LOOB ng isang araw. Sa isang trade kada araw, walang "sumunod na trade" at
     sinasabi ng dalawa na kulang ang datos, kaya hindi masusubukan ang landas. */
  const SPAN_DAYS = 150;
  const PER_DAY = 3;
  const start = new Date(Date.now() - SPAN_DAYS * 864e5);
  const dayStep = SPAN_DAYS * 864e5 / (120 / PER_DAY);
  for(let i = 0; i < 120; i++){
    const day = Math.floor(i / PER_DAY);
    const slot = i % PER_DAY;
    const d = new Date(start.getTime() + day * dayStep + slot * 2.5 * 36e5);
    const roll = _rnd();
    const wl = roll < 0.42 ? 'Win' : roll < 0.82 ? 'Loss' : 'Breakeven';
    const rr = wl === 'Win' ? 1.2 + _rnd() * 2.6 : wl === 'Loss' ? -1 : 0;
    const pl = wl === 'Win' ? 120 + _rnd() * 900 : wl === 'Loss' ? -(80 + _rnd() * 420) : 0;
    const rules = [];
    if(_rnd() < 0.32) rules.push(_pick(_R));
    if(_rnd() < 0.12) rules.push(_pick(_R));
    out.push({
      id: i + 1,
      position_id: 'POS-' + String(1000 + i),
      open_date: d.toISOString(),
      close_date: new Date(d.getTime() + 3.5e6).toISOString(),
      symbol: 'BTC', trade_type: _rnd() < 0.55 ? 'Long' : 'Short',
      win_loss: wl,
      profit_loss: +pl.toFixed(2), fee: +(_rnd() * 9).toFixed(2),
      pnl_percent: +(pl / 5000 * 100).toFixed(2), rr: +rr.toFixed(2),
      entry_price: 61000 + Math.round(_rnd() * 9000),
      close_price: 61000 + Math.round(_rnd() * 9000),
      tp_price: 71000, sl_price: 60000,
      position_size: +(0.05 + _rnd() * 0.6).toFixed(3),
      trade_setup: _pick(_P), pattern_type: _pick(_P),
      execution_tf: _pick(['5m','15m','1H','4H']),
      aof_phase: _pick(['Accumulation','Manipulation','Distribution']),
      exit_type: _pick(_X), chart_pattern: _pick(_C),
      session: _pick(_S), account: _pick(_A), account_type: _pick(_T),
      /* String na pinagdugtong ng comma, HINDI array — ito ang tunay na anyo sa
         database, at ang normalizeTrade ay nag-.join(', ') dito. Ang array ay
         tahimik na nagbibigay ng zero na tag at nagtatago ng bug. */
      unfollowed_rules: rules.join(', '),
      confluence_answers: { htf_bias: _rnd() < .5 ? 'Yes' : 'No',
                            divergence: _rnd() < .5 ? 'Yes' : 'No' },
      notes: 'test row ' + i,
    });
  }
  return out;
})();

/* Pitong journaled at tatlong pending na setup. Kailangan ang mga journaled:
   ang bilang na nasa buton ng lid ("Show (7)") ang siyang dahilan kung bakit
   ligtas magtago — kung walang laman ang talahanayan, hindi masusubukan ang
   bahaging iyon at "hindi masusukat" ang lalabas sa test. */
const FAKE_SETUPS = (() => {
  const rows = [];
  for(let i = 0; i < 10; i++){
    rows.push({
      id: i + 1, symbol: 'BTC',
      created_at: new Date(Date.UTC(2026, 7, 5 + i)).toISOString(),
      account_name: _A[i % _A.length], leverage: [5, 10, 20][i % 3],
      risk_amount: 50 + i * 15, quantity: +(0.05 + i * 0.01).toFixed(3),
      entry_price: 64000 + i * 250, tp_price: 71000, sl_price: 60500,
      status: i < 7 ? 'Journaled' : 'Pending', checked: false,
    });
  }
  return rows;
})();

const FAKE_TABLES = {
  trading_journal: FAKE_TRADES,
  position_setups: FAKE_SETUPS,
  user_access: [{ role: 'admin', status: 'approved', disabled_features: [] }],
  user_profile: [{
    user_id: '00000000-0000-4000-8000-000000000001',
    display_name: 'Test User',
    // Ang salary ay nasa salary_settings, hindi sa isang top-level na column —
    // ito ang binabasa ng _salarySettings().
    salary_settings: { monthly_salary: 9000, aed_per_usd: 3.6725 },
    ui_prefs: {},
  }],
  /* account_name, HINDI name — ito ang hinahanap ng app (_journalInvalidFields).
     Ang mali kong pangalan ng column ang nagpablangko sa Trade Journal.
     Ang account_size / max_total_drawdown_pct / profit_target_pct ang eksaktong
     pangalang binabasa ng computeAccountStats(); kung hindi tugma ang mga ito,
     tahimik na magiging zero ang lahat at "walang prop firm account" ang sagot. */
  trading_accounts: _A.map((n, i) => ({
    id: i + 1, account_name: n, name: n,
    account_type: ['Evaluation', 'Funded', 'Funded'][i % 3],
    account_size: [5000, 10000, 50000][i % 3],
    current_balance: [5300, 10400, 51200][i % 3],
    profit_target_pct: 8, max_total_drawdown_pct: 6, max_daily_loss_pct: 3,
    min_daily_profit_pct: 0.5, min_trading_days: 5,
    status: 'active', firm: 'Upscale Trade',
  })),
};

/* Lahat ng data ng app ay dumadaan sa fetch() patungo sa /rest/v1/<table>,
   hindi sa sb.from(). Dito sila sinasagot. Ang hindi kilalang table ay
   nagbabalik ng [] — walang laman, pero hindi error, para ang isang table na
   hindi ko naisip ay hindi makabasag ng buong pahina. */
/* ANG ISINUSULAT, HINDI LANG ANG BINABASA.

   Ang unang bersyon nito ay nagbabalik ng [] sa bawat POST at PATCH. Ang
   ibig sabihin: gumagana ang pagbasa sa bawat pagsubok, pero ang pag-save ay
   isang butas — walang naitatala at walang masusuri. Ang bawat tanong na
   "ano ba talaga ang naisulat" ay hindi ko masagot.

   Dalawang bagay ngayon. Ang POST at PATCH ay IBINABALIK ang ipinadalang row,
   gaya ng totoong Supabase kapag Prefer: return=representation — kaya ang
   lokal na estado ng app ay nag-a-update gaya sa produksyon. At ang bawat
   pagsulat ay itinatala sa window.__WRITES, kaya masasagot ng pagsubok ang
   eksaktong tanong: anong column ang naipadala, at ano ang laman nito. */
// Nakalantad para makapaghanda ang pagsubok ng hilera bago ito basahin ng app.
window.FAKE_TABLES = FAKE_TABLES;
window.__WRITES = [];
(function interceptFetch(){
  const real = window.fetch.bind(window);
  let seq = 9000;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if(!url.includes('fake.supabase.test')) return real(input, init);
    const m = /\/rest\/v1\/([a-z_]+)/.exec(url);
    const table = m ? m[1] : '(?)';
    const method = ((init && init.method) || 'GET').toUpperCase();

    let sent = null;
    if(init && init.body){ try{ sent = JSON.parse(init.body); }catch(e){ sent = init.body; } }

    let body = [];
    if(method === 'GET'){
      body = FAKE_TABLES[table] || [];
    }else if(method === 'POST' || method === 'PATCH'){
      const rows = Array.isArray(sent) ? sent : (sent ? [sent] : []);
      if(method === 'POST'){
        // Ang totoong Postgres ang naglalagay ng id; ganoon din dito, kung hindi
        // ang bawat bagong row ay walang id at magkakadikit sa isa't isa.
        body = rows.map(r => ({ id: ++seq, ...r }));
      }else{
        /* ANG PATCH AY HINDI GUMAGAWA NG BAGONG ROW.

           Nagbibigay ito ng bagong id noon sa bawat pag-update, na hindi
           kailanman ginagawa ng Supabase — ibinabalik nito ang KAPAREHONG row,
           na-update. Ang pagkakaibang iyon ay hindi tahimik: ang app ay
           nagsusulat ng sagot pabalik gamit ang `find(s => s.id === ...)`, kaya
           ang pekeng id ay nagpapawala ng row na katatapos lang i-save. Ang
           pagsubok ay magrereklamo tungkol sa isang bug na gawa ng harness.

           Ang pagkakakilanlan ay kinukuha sa filter ng URL, gaya ng tunay. */
        const eq = {};
        String(url.split('?')[1] || '').split('&').forEach(p => {
          const [k, v] = p.split('=');
          if(v && v.startsWith('eq.')) eq[k] = decodeURIComponent(v.slice(3));
        });
        const store = FAKE_TABLES[table] || [];
        const matches = store.filter(row =>
          Object.keys(eq).every(k => String(row[k]) === eq[k]));
        const idKey = 'id' in eq ? 'id' : null;
        body = rows.flatMap(r => {
          if(matches.length){
            // Isinusulat sa tindahan, para makita ng susunod na pagbasa.
            return matches.map(row => Object.assign(row, r));
          }
          // Walang katugma sa pekeng datos — panatilihin pa rin ang id na
          // hinihingi ng URL sa halip na mag-imbento.
          const keep = { ...eq };
          if(idKey) keep.id = isNaN(Number(eq.id)) ? eq.id : Number(eq.id);
          return [{ ...keep, ...r }];
        });
      }
      /* `rows` ang IBINABALIK (ang row pagkatapos i-update, gaya ng Supabase);
         `sent` ang IPINADALA. Dalawang magkaibang tanong sila, at magkaiba na
         ang sagot mula nang mag-merge ang PATCH: ang ibinabalik ay may kasamang
         bawat lumang column ng row. Ang tanong na "anong column ang isinulat ng
         pindutang ito" ay `sent` lamang ang makakasagot. */
      window.__WRITES.push({ table, method, url, rows: body,
        sent: (Array.isArray(sent) ? sent : (sent ? [sent] : [])) });
    }else if(method === 'DELETE'){
      window.__WRITES.push({ table, method, url, rows: [] });
    }
    return new Response(JSON.stringify(body), {
      status: 200, headers: { 'Content-Type': 'application/json' } });
  };
})();

console.log('[test] pekeng Supabase — ' + FAKE_TRADES.length + ' na trade');
