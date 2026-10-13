const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
﻿/* POST-STOP PROFIT sa tunay na dashboard.
   1. Lumalabas ba ang column â€” sa bagong browser AT sa may lumang saved config?
   2. Ang drawer: Stop Profit -> pula hanggang masagot; ibang exit -> N/A.
   3. Ang save habang WALA pa ang column sa database: hindi dapat masira. */
const http=require('http'), fs=require('fs'), path=require('path'),
      os=require('os'), { spawn }=require('child_process');
const ROOT=__ROOT + '';
const PORT=8921, CDP=9353;
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

  console.log('MOBILE');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true},S);
  await load();
  await ev("document.body.classList.add('mobile-mode')");
  const over = async (label) => {
    const r = await ev(`(()=>{ const W = document.documentElement.clientWidth; const bad = [];
      document.querySelectorAll('.view.active *, .modal-overlay.open *').forEach(el => {
        const b = el.getBoundingClientRect(); if(!b.width || !b.height) return;
        const cs = getComputedStyle(el); if(cs.position === 'fixed' && !el.closest('.modal-overlay')) return;
        let p = el.parentElement, clipped = false;
        while(p){ const o = getComputedStyle(p).overflowX; if(o === 'auto' || o === 'scroll' || o === 'hidden'){ const pb = p.getBoundingClientRect(); if(pb.right <= W + 1){ clipped = true; break; } } p = p.parentElement; }
        if(!clipped && b.right > W + 1) bad.push((el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName) + ' ' + Math.round(b.right));
      });
      return { W, docW: document.documentElement.scrollWidth, bad: [...new Set(bad)].slice(0, 12) }; })()`);
    ok(label + ': no sideways scroll', r.docW <= r.W + 1 && !r.bad.length, JSON.stringify(r).slice(0, 300));
  };
  const shoot = async (name) => {
    const h = await ev('Math.min(document.documentElement.scrollHeight, 5000)');
    const s = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height:h,scale:0.6}},S);
    fs.writeFileSync(path.join(__dirname, name), Buffer.from(s.data,'base64'));
  };
  await ev("switchView('dashboard')"); await sleep(1500);
  await over('dashboard');
  const y0 = await ev(`document.getElementById('review-week').closest('.row').getBoundingClientRect().top + scrollY`);
  const s1 = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:y0-300,width:390,height:1700,scale:0.6}},S);
  fs.writeFileSync(path.join(__dirname,'m-dash.png'), Buffer.from(s1.data,'base64'));
  await ev("switchView('profile')"); await sleep(1500);
  await over('profile');
  await shoot('m-profile.png');
  await ev("switchView('hours')"); await sleep(800);
  await over('market hours');
  await shoot('m-hours.png');
  await ev("switchView('news')"); await sleep(600);
  await ev(`(()=>{ const d=new Date(); ECON_EVENTS=[{id:901,event_date:new Date(d.getFullYear(),d.getMonth(),d.getDate(),16,30).toISOString(),country:'US',title:'FOMC Meeting Minutes and a long title',impact:'High',forecast:'0.3%',previous:'0.2%',actual:'0.4%'}]; selectedEconDate=d.toDateString(); econCalMonth=new Date(); renderEconCalGrid(); })()`);
  await over('calendar news');
  await ev("openEconShare('day')"); await sleep(200);
  await over('calendar share popup');
  await ev("closeEconShare()");
  await ev("switchView('playbooks')"); await sleep(600);
  await over('playbooks');
  await ev("selectPlaybook(_pbKeyList.indexOf('Long|15 mins HL')); setPlaybookTab('stats')"); await sleep(300);
  await over('playbooks stats');
  await shoot('m-playbooks.png');
  await ev("scrollTo(0,0); editPlaybook()"); await sleep(300);
  await over('playbook editor');
  const s3 = await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:390,height:844,scale:0.8}},S);
  fs.writeFileSync(path.join(__dirname,'m-pb-edit.png'), Buffer.from(s3.data,'base64'));
  await ev("closePlaybookEditor(); setPlaybookTab('checklist')");
  await ev("switchView('journal')"); await sleep(800);
  await ev(`document.querySelector('#journalTable tbody tr').click()`); await sleep(800);
  await ok('trade page open', (await ev('currentView')) === 'trade');
  await over('trade page');
  await shoot('m-trade.png');
  await ev("setTradeTab('review')"); await sleep(400);
  await over('trade page review');
  await shoot('m-trade-review.png');
  await ev("switchView('plan')"); await sleep(1000);
  await over('daily plan');
  await shoot('m-plan.png');
  await ev("openDailyPlan(_dpIso(new Date()))"); await sleep(400);
  await over('daily plan popup');
  const s2 = await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:390,height:844,scale:0.8}},S);
  fs.writeFileSync(path.join(__dirname,'m-plan-modal.png'), Buffer.from(s2.data,'base64'));
  await ev("closeDailyPlan()");
  // Bawat iba pang page, at ang mga popup na madalas gamitin sa phone.
  const VIEWS = ['journal', 'notebook', 'mood', 'alerts', 'reports', 'accounts', 'calculator', 'paper',
                 'salary', 'config', 'settings', 'admin', 'achievements', 'challenges', 'leaderboard', 'finance'];
  for(const v of VIEWS){
    const exists = await ev(`!!document.getElementById('view-${v}')`);
    if(!exists) continue;
    await ev(`switchView('${v}')`); await sleep(700);
    await over(v);
  }
  await shoot('m-calculator.png');
  await ev("switchView('dashboard')"); await sleep(400);
  await ev("toggleNotifFab(true)"); await sleep(300);
  await over('bell panel');
  await ev("toggleNotifFab(false)");
  await ev(`(()=>{ const by = window._calByDay || {}; const d = Object.keys(by)[0]; if(d) showDayTrades(calMonth.getFullYear(), calMonth.getMonth(), Number(d)); })()`); await sleep(300);
  await ev("if(document.getElementById('tradeModal').classList.contains('open')) openShareDay()"); await sleep(200);
  await over('day share popup');
  await ev("closeShareDay(); closeModal()");
  await ev("switchView('playbooks')"); await sleep(400);
  await ev("openPlaybookImport()"); await sleep(200);
  await over('playbook import popup');
  await ev("closePlaybookCode(); newPlaybook()"); await sleep(200);
  await over('new playbook editor');
  await ev("closePlaybookEditor()");
  await ev("switchView('news')"); await sleep(400);
  await ev("openEconShare('month')"); await sleep(200);
  await over('calendar share month');
  await ev("closeEconShare()");
  ok('walang JS error', errors.length === 0, errors.length + '');
  errors.slice(0,3).forEach(x => console.log('       ' + x.slice(0,140)));
  console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
  await send('Target.closeTarget',{targetId}); ws.close(); chrome.kill(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e=>{ console.error('BUMAGSAK: '+e.message);
  try{ chrome.kill(); }catch(_){} try{ server.close(); }catch(_){} process.exit(2); });
