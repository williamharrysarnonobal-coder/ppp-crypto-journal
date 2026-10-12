const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* POST-STOP PROFIT sa tunay na dashboard.
   1. Lumalabas ba ang column — sa bagong browser AT sa may lumang saved config?
   2. Ang drawer: Stop Profit -> pula hanggang masagot; ibang exit -> N/A.
   3. Ang save habang WALA pa ang column sa database: hindi dapat masira. */
const http=require('http'), fs=require('fs'), path=require('path'),
      os=require('os'), { spawn }=require('child_process');
const ROOT=__ROOT + '';
const PORT=8896, CDP=9328;
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript',
  '.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/') p='/index.html';
  if(p==='/js/supabase.js'){ res.writeHead(200,{'Content-Type':'text/javascript'});
    return res.end(fs.readFileSync(path.join(__dirname,'fake-supabase.js'))); }
  fs.readFile(path.join(ROOT,p),(e,b)=>{ if(e) return res.writeHead(404).end();
    res.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'}); res.end(b); }); });
let ws,chrome,id=0; const pend=new Map(); let S; const errors=[];
const send=(m,p,s)=>new Promise((res,rej)=>{ const i=++id; pend.set(i,{res,rej});
  ws.send(JSON.stringify({id:i,method:m,params:p||{},sessionId:s}));
  setTimeout(()=>{ if(pend.delete(i)) rej(new Error('timeout '+m)); },40000); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ev(e,a){ const r=await send('Runtime.evaluate',
  {returnByValue:true,awaitPromise:!!a,expression:e},S);
  if(r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description||'?').split('\n')[0]);
  return r.result.value; }
let fail=0;
const ok=(l,c,x)=>{ if(!c) fail++; console.log('  '+(c?'ok   ':'MALI ')+l.padEnd(50)+(x||'')); };

(async()=>{
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const prof=fs.mkdtempSync(path.join(os.tmpdir(),'cdpPS-'));
  chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars',
     '--remote-debugging-port='+CDP,'--user-data-dir='+prof,'about:blank'],{stdio:'ignore'});
  let info; for(let i=0;i<60&&!info;i++){ await sleep(250);
    try{ info=await (await fetch('http://127.0.0.1:'+CDP+'/json/version')).json(); }catch(e){} }
  ws=new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ ws.onopen=r; ws.onerror=j; });
  ws.onmessage=e=>{ const m=JSON.parse(e.data);
    if(m.method==='Runtime.exceptionThrown')
      errors.push((m.params.exceptionDetails.exception?.description||'?').split('\n')[0]);
    if(m.id&&pend.has(m.id)){ const {res,rej}=pend.get(m.id); pend.delete(m.id);
      m.error?rej(new Error(m.error.message)):res(m.result); } };
  const { targetId }=await send('Target.createTarget',{url:'about:blank'});
  const a0=await send('Target.attachToTarget',{targetId,flatten:true}); S=a0.sessionId;
  await send('Page.enable',{},S); await send('Runtime.enable',{},S);
  await send('Emulation.setDeviceMetricsOverride',{width:1512,height:950,deviceScaleFactor:1,mobile:false},S);

  const load = async () => {
    await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/dashboard.html`},S);
    for(let i=0;i<60;i++){ await sleep(250);
      const n=await ev('typeof ALL_TRADES==="undefined"?-1:ALL_TRADES.length'); if(n>0) break; }
    await sleep(1400);
    await ev("document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));");
  };

  console.log('1. ANG COLUMN\n');
  await load();
  let cols = await ev('JOURNAL_COLUMNS.map(c=>c.key)');
  ok('bagong browser: nakikita', cols.includes('post_stop_profit_result'));
  ok('  katabi ng Exit Type', cols.indexOf('post_stop_profit_result') === cols.indexOf('exit_type') + 1,
     cols.slice(cols.indexOf('exit_type'), cols.indexOf('exit_type')+3).join(' > '));

  // Lumang saved config: walang alam sa bagong key, at may Post-Cutloss na nakikita.
  await ev(`localStorage.setItem('ledger-column-config', JSON.stringify(
    ['symbol','win_loss','exit_type','post_cutloss_result','profit_loss'].map(k=>({key:k,visible:true}))
    .concat(ALL_JOURNAL_COLUMNS.filter(c=>!['symbol','win_loss','exit_type','post_cutloss_result','profit_loss','post_stop_profit_result'].includes(c.key)).map(c=>({key:c.key,visible:false})))))`);
  await load();
  cols = await ev('JOURNAL_COLUMNS.map(c=>c.key)');
  console.log('   ' + cols.join(' > '));
  ok('lumang config: nakikita na rin', cols.includes('post_stop_profit_result'));
  ok('  pagkatapos ng Post-Cutloss', cols.indexOf('post_stop_profit_result') === cols.indexOf('post_cutloss_result') + 1);
  const head = await ev(`[...document.querySelectorAll('#journalTable thead th, table thead th')].map(t=>t.textContent.trim()).join('|')`);
  ok('nasa header ng table', head.includes('Post-Stop Profit'));

  // Itinago niya -> hindi na ibinabalik.
  await ev(`(()=>{ const c=COLUMN_CONFIG.find(x=>x.key==='post_stop_profit_result'); c.visible=false; saveColumnConfig(); })()`);
  await load();
  cols = await ev('JOURNAL_COLUMNS.map(c=>c.key)');
  ok('itinago niya -> nananatiling nakatago', !cols.includes('post_stop_profit_result'));

  console.log('\n2. ANG DRAWER\n');
  const pid = await ev('ALL_TRADES[ALL_TRADES.length-1].position_id');
  const drawer = await ev(`(async()=>{
    openDrawer('edit', ${JSON.stringify(pid)});
    await new Promise(r=>setTimeout(r,500));
    const ex = document.querySelector('#drawerBody [data-field="exit_type"]');
    const ps = document.querySelector('#drawerBody [data-field="post_stop_profit_result"]');
    if(!ex || !ps) return { found:false };
    const opts = [...ps.options].map(o=>o.value).filter(Boolean);
    ex.value='Stop Profit'; ex.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,100));
    const a = { v: ps.value, red: ps.closest('.field-row')?.classList.contains('needs-input') };
    ex.value='TP Hit'; ex.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,100));
    const b = { v: ps.value };
    ex.value='Stop Profit'; ex.dispatchEvent(new Event('change',{bubbles:true}));
    ps.value='TP After Stop Profit';
    return { found:true, opts, a, b };
  })()`, true);
  ok('may field sa drawer', drawer.found);
  if(drawer.found){
    ok('tatlong pagpipilian', drawer.opts.join(',') === 'TP After Stop Profit,SL After Stop Profit,N/A', drawer.opts.join(', '));
    ok('Stop Profit -> blangko at pula', drawer.a.v === '' && drawer.a.red, JSON.stringify(drawer.a));
    ok('TP Hit -> N/A', drawer.b.v === 'N/A', drawer.b.v);
  }

  console.log('\n3. SAVE HABANG WALA PA ANG COLUMN SA DATABASE\n');
  const save = await ev(`(async()=>{
    const real = window.fetch; const sent = [];
    window.fetch = async (url, opts) => {
      if(opts && opts.body && String(url).includes('/rest/v1/') && opts.body.includes('post_stop_profit_result')){
        sent.push('rejected');
        return new Response(JSON.stringify({code:'PGRST204',message:"Could not find the 'post_stop_profit_result' column of 'trading_journal' in the schema cache"}),{status:400});
      }
      if(opts && opts.body && String(url).includes('/rest/v1/')) sent.push('accepted');
      return real(url, opts);
    };
    await saveDrawer();
    await new Promise(r=>setTimeout(r,400));
    const err = (document.getElementById('drawerError')||{}).textContent || '';
    // Ikalawang save: hindi na dapat ipadala ang column.
    sent.push('|');
    openDrawer('edit', ${JSON.stringify(pid)}); await new Promise(r=>setTimeout(r,400));
    await saveDrawer(); await new Promise(r=>setTimeout(r,300));
    window.fetch = real;
    return { sent, err, closed: !document.querySelector('#drawer.open') };
  })()`, true);
  console.log('   ' + save.sent.join(' '));
  ok('tinanggihan ang una, pumasa ang ulit', save.sent.slice(0,2).join(',') === 'rejected,accepted');
  ok('walang error na ipinakita', !save.err.trim(), save.err.slice(0,80));
  ok('ikalawang save: diretso, walang tanggi', save.sent.slice(3).every(x => x === 'accepted') && save.sent.length > 3);

  console.log('\n4. ANG INVALIDATION PLAY NA LONG\n');
  const q = await ev(`CONFLUENCE_SETUPS['Long|30 mins Invalidation Play'].items[0].text`);
  ok('Bear Territory (Green Histogram)', q === '1H MACD in Bear Territory (Green Histogram)?', q);

  ok('walang JS error', errors.length === 0, errors.length + '');
  errors.slice(0,3).forEach(x => console.log('       ' + x.slice(0,140)));
  console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
  await send('Target.closeTarget',{targetId}); ws.close(); chrome.kill(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e=>{ console.error('BUMAGSAK: '+e.message);
  try{ chrome.kill(); }catch(_){} try{ server.close(); }catch(_){} process.exit(2); });
