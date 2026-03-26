// ═══════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════
const WEEKS = [
  {key:'wk7', date:'16-Mar', lbl:'Week 7'},  {key:'wk8', date:'23-Mar', lbl:'Week 8'},
  {key:'wk11',date:'30-Mar', lbl:'Week 11'}, {key:'wk12',date:'6-Apr',  lbl:'Week 12'},
  {key:'wk13',date:'13-Apr', lbl:'Week 13'}, {key:'wk14',date:'20-Apr', lbl:'Week 14'},
  {key:'wk15',date:'27-Apr', lbl:'Week 15'}, {key:'wk16',date:'4-May',  lbl:'Week 16'},
  {key:'wk17',date:'11-May', lbl:'Week 17'}, {key:'wk18',date:'18-May', lbl:'Week 18'},
  {key:'wk19',date:'25-May', lbl:'Week 19'},
];
const TOTAL_WEEKS = 11;
const KPI1_WK_TGT = 70, KPI2_WK_TGT = 20, KPI3_WK_TGT = 585000, KPI4_Q2_TGT = 25;

function emptyWk() {
  return {
    kpi1:{target:KPI1_WK_TGT,actual:null,bdr:null,carahsoft:null,ads:null,partners:null},
    kpi2:{target:KPI2_WK_TGT,actual:null,bdr:null,carahsoft:null,ads:null,partners:null},
    kpi3:{target:KPI3_WK_TGT,actual:null},
    kpi4:{target:KPI4_Q2_TGT,actual:null}, kpi5:{target:100,actual:null}
  };
}
function defaultData() {
  const d = {};
  WEEKS.forEach(w => d[w.key] = emptyWk());
  d.wk7 = {
    kpi1:{target:70, actual:22, bdr:17, carahsoft:0, ads:5, partners:0},
    kpi2:{target:20, actual:6,  bdr:1,  carahsoft:0, ads:5, partners:0},
    kpi3:{target:585000, actual:525000},
    kpi4:{target:25, actual:0}, kpi5:{target:100,actual:0}
  };
  return d;
}

let DATA = JSON.parse(localStorage.getItem('llmo_v3')||'null') || defaultData();
// Migrate: ensure kpi5 exists on all weeks
WEEKS.forEach(function(w){ if(DATA[w.key] && !DATA[w.key].kpi5) DATA[w.key].kpi5={target:100,actual:null}; });
let DIAL_WK = localStorage.getItem('llmo_v3_wk') || 'wk7';
let charts = {};
let tgtSort={col:'accounts',dir:-1}, aemSort={col:'name',dir:1}, mtgSort={col:'date',dir:-1};

// AEM per-row editable state: {name -> {contacted:bool, mtgSet:bool, notes:str}}
let AEM_EDITS = JSON.parse(localStorage.getItem('llmo_aem_edits')||'{}');
// BASE_ACTUALS stores the manually-entered actuals BEFORE any AEM contributions
// Initialized once from current DATA, then updated whenever manual edits happen
let BASE_ACTUALS = JSON.parse(localStorage.getItem('llmo_base_actuals')||'null');

function ensureBaseActuals(){
  if(BASE_ACTUALS) return;
  BASE_ACTUALS = {};
  WEEKS.forEach(w=>{
    BASE_ACTUALS[w.key] = {
      kpi1: DATA[w.key].kpi1.actual,
      kpi2: DATA[w.key].kpi2.actual
    };
  });
  localStorage.setItem('llmo_base_actuals', JSON.stringify(BASE_ACTUALS));
}
function syncBaseActuals(wkKey){
  // Call this whenever a manual AI/manual update changes actuals for a week
  ensureBaseActuals();
  BASE_ACTUALS[wkKey].kpi1 = DATA[wkKey].kpi1._manualActual !== undefined
    ? DATA[wkKey].kpi1._manualActual : DATA[wkKey].kpi1.actual;
  BASE_ACTUALS[wkKey].kpi2 = DATA[wkKey].kpi2._manualActual !== undefined
    ? DATA[wkKey].kpi2._manualActual : DATA[wkKey].kpi2.actual;
  localStorage.setItem('llmo_base_actuals', JSON.stringify(BASE_ACTUALS));
}

// MTG_DATA is editable — load from localStorage if available
let MTG_LIVE = JSON.parse(localStorage.getItem('llmo_mtg_live')||'null');

function save() {
  localStorage.setItem('llmo_v3', JSON.stringify(DATA));
  localStorage.setItem('llmo_v3_wk', DIAL_WK);
  localStorage.setItem('llmo_aem_edits', JSON.stringify(AEM_EDITS));
  if(MTG_LIVE) localStorage.setItem('llmo_mtg_live', JSON.stringify(MTG_LIVE));
  if(BASE_ACTUALS) localStorage.setItem('llmo_base_actuals', JSON.stringify(BASE_ACTUALS));
}

function getMTGData() { return MTG_LIVE || MTG_DATA; }
function resetData() {
  if (!confirm('Reset all data to Week 7 defaults?')) return;
  DATA = defaultData(); DIAL_WK = 'wk7';
  AEM_EDITS = {}; BASE_ACTUALS = null; MTG_LIVE = null;
  localStorage.removeItem('llmo_aem_edits');
  localStorage.removeItem('llmo_base_actuals');
  localStorage.removeItem('llmo_mtg_live');
  save(); renderAll();
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function fmtM(v){if(v===null||v===undefined)return'—';if(v>=1000000)return'$'+(v/1000000).toFixed(2)+'M';return'$'+Math.round(v/1000)+'K';}
function fmtN(v){return(v===null||v===undefined)?'—':String(v);}
function pct(a,t){if(a===null||!t)return null;return Math.round((a/t)*100);}
function badgeCls(p){return p===null?'b-low':p>=100?'b-good':p>=60?'b-ok':'b-low';}
function badgeTxt(p){return p===null?'N/A':p+'%';}
function getWk(k){return WEEKS.find(w=>w.key===k);}
function weeksWithData(){return WEEKS.filter(w=>DATA[w.key].kpi1.actual!==null);}
function remainingWeeks(afterKey){
  const idx=WEEKS.findIndex(w=>w.key===afterKey);
  return WEEKS.length-idx-1;
}

// ═══════════════════════════════════════════════════════════
// CATCHUP CALCULATIONS
// ═══════════════════════════════════════════════════════════
function calcCatchup(wkKey) {
  const d = DATA[wkKey];
  const rem = remainingWeeks(wkKey);
  if (rem === 0) return null;

  // KPI1: accounts outreached — weekly target
  const k1gap = KPI1_WK_TGT - (d.kpi1.actual || 0);
  const k1needed = KPI1_WK_TGT + (k1gap / rem);

  // KPI2: meetings — weekly target
  const k2gap = KPI2_WK_TGT - (d.kpi2.actual || 0);
  const k2needed = KPI2_WK_TGT + (k2gap / rem);

  // KPI3: pipeline — weekly target
  const k3gap = KPI3_WK_TGT - (d.kpi3.actual || 0);
  const k3needed = KPI3_WK_TGT + (k3gap / rem);

  // KPI4: Q2 total target — spread remaining over remaining weeks
  const k4done = d.kpi4.actual || 0;
  const k4left = Math.max(0, KPI4_Q2_TGT - k4done);
  const k4needed = k4left / rem;

  return { rem, k1gap, k1needed, k2gap, k2needed, k3gap, k3needed, k4left, k4needed };
}

// ═══════════════════════════════════════════════════════════
// RENDER KPI CARDS
// ═══════════════════════════════════════════════════════════
function renderKPI() {
  const w = getWk(DIAL_WK), d = DATA[DIAL_WK];
  document.getElementById('kpiWeekLbl').textContent = w.lbl+' ('+w.date+')';
  // KPI6: AEM Engaged count (from AEM_EDITS), KPI7: Pursuit Signals engaged count
  var aemEngagedCount = Object.values(AEM_EDITS).filter(function(e){return e.engaged;}).length;
  var pursuitEngagedCount = pursuitRows.filter(function(r){return r.engaged==='Yes';}).length;
  const cfgs = [
    {cls:'kpi1',lbl:'KPI #1',color:'var(--blue)', title:'Accounts Outreached',    a:d.kpi1.actual, t:d.kpi1.target},
    {cls:'kpi2',lbl:'KPI #2',color:'var(--green)',title:'Scheduled Meetings',      a:d.kpi2.actual, t:d.kpi2.target},
    {cls:'kpi3',lbl:'KPI #3',color:'var(--amber)',title:'Net New SS3 Pipeline',    a:d.kpi3.actual, t:d.kpi3.target, money:true},
    {cls:'kpi4',lbl:'KPI #4',color:'var(--purple)',title:'Partner-Sourced Meetings',a:d.kpi4.actual,t:d.kpi4.target},
    {cls:'kpi5',lbl:'KPI #5',color:'#0ea5e9',title:'GR / Lobbyist Sourced Meetings',a:d.kpi5?d.kpi5.actual:null,t:d.kpi5?d.kpi5.target:100},
    {cls:'kpi6',lbl:'KPI #6',color:'#f97316',title:'AEM Customers Engaged',        a:aemEngagedCount,t:null,link:'AEM'},
    {cls:'kpi7',lbl:'KPI #7',color:'#0ea5e9',title:'PURSUIT Signals Engaged',      a:pursuitEngagedCount,t:null,link:'Pursuit'},
  ];
  document.getElementById('kpiGrid').innerHTML = cfgs.map(c => {
    const p = c.t ? pct(c.a, c.t) : null;
    const av = c.a===null ? '—' : (c.money ? fmtM(c.a) : c.a);
    const tv = c.t ? (c.money ? fmtM(c.t) : c.t) : null;
    const linkBtn = c.link ? `<span onclick="openPanel('${c.link}')" style="font-size:9px;color:${c.color};cursor:pointer;text-decoration:underline;text-underline-offset:2px;margin-left:4px">↗ View</span>` : '';
    return `<div class="kpi-card ${c.cls}">
      <div class="kpi-top"><div class="kpi-lbl">${c.lbl}</div><div class="kpi-badge ${p!==null?badgeCls(p):'badge-info'}">${p!==null?badgeTxt(p):'LIVE'}</div></div>
      <div class="kpi-val" style="color:${c.color}">${av}</div>
      ${tv!==null ? `<div class="kpi-target">Target: <span>${tv}</span></div>` : `<div class="kpi-target" style="color:var(--dim)">Cumulative total${linkBtn}</div>`}
      <div class="kpi-title">${c.title}</div>
      <div class="prog-bar"><div class="prog-fill" style="width:${Math.min(p||0,100)}%;background:${c.color}"></div></div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// RENDER CATCHUP
// ═══════════════════════════════════════════════════════════
function renderCatchup() {
  const w = getWk(DIAL_WK), d = DATA[DIAL_WK];
  document.getElementById('cuWeekLbl').textContent = w.lbl+' ('+w.date+')';
  const cu = calcCatchup(DIAL_WK);
  if (!cu) {
    document.getElementById('catchupGrid').innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--muted);font-size:12px">Final week — no remaining weeks to calculate catchup.</div>';
    return;
  }

  const cards = [
    {
      kpi:'KPI #1',title:'Accounts Outreached',color:'var(--blue)',
      gap: cu.k1gap, gapFmt: cu.k1gap > 0 ? '-'+cu.k1gap : '+'+Math.abs(cu.k1gap),
      rows:[
        {lbl:'Week '+w.lbl+' actual', val: fmtN(d.kpi1.actual)},
        {lbl:'Weekly target', val: KPI1_WK_TGT},
        {lbl:'Weeks remaining', val: cu.rem},
      ],
      needed: Math.ceil(cu.k1needed),
      neededFmt: Math.ceil(cu.k1needed)+' / wk',
      sub: (cu.k1needed > KPI1_WK_TGT ? '+'+Math.ceil(cu.k1needed-KPI1_WK_TGT)+' above weekly target' : 'On pace — keep going!')
    },
    {
      kpi:'KPI #2',title:'Scheduled Meetings',color:'var(--green)',
      gap: cu.k2gap, gapFmt: cu.k2gap > 0 ? '-'+cu.k2gap : '+'+Math.abs(cu.k2gap),
      rows:[
        {lbl:'Week '+w.lbl+' actual', val: fmtN(d.kpi2.actual)},
        {lbl:'Weekly target', val: KPI2_WK_TGT},
        {lbl:'Weeks remaining', val: cu.rem},
      ],
      needed: Math.ceil(cu.k2needed),
      neededFmt: Math.ceil(cu.k2needed)+' / wk',
      sub: (cu.k2needed > KPI2_WK_TGT ? '+'+Math.ceil(cu.k2needed-KPI2_WK_TGT)+' above weekly target' : 'On pace — keep going!')
    },
    {
      kpi:'KPI #3',title:'Net New SS3 Pipeline',color:'var(--amber)',
      gap: cu.k3gap, gapFmt: cu.k3gap > 0 ? '-'+fmtM(cu.k3gap) : '+'+fmtM(Math.abs(cu.k3gap)),
      rows:[
        {lbl:'Week '+w.lbl+' actual', val: fmtM(d.kpi3.actual)},
        {lbl:'Weekly target', val: fmtM(KPI3_WK_TGT)},
        {lbl:'Weeks remaining', val: cu.rem},
      ],
      needed: Math.ceil(cu.k3needed),
      neededFmt: fmtM(Math.ceil(cu.k3needed))+' / wk',
      sub: (cu.k3needed > KPI3_WK_TGT ? '+'+fmtM(Math.ceil(cu.k3needed-KPI3_WK_TGT))+' above target' : 'On pace — keep going!')
    },
    {
      kpi:'KPI #4',title:'Partner-Sourced Meetings',color:'var(--purple)',
      gap: cu.k4left, gapFmt: '-'+cu.k4left+' remaining',
      rows:[
        {lbl:'Q2 target', val: KPI4_Q2_TGT},
        {lbl:'Actual to date', val: fmtN(d.kpi4.actual)},
        {lbl:'Weeks remaining', val: cu.rem},
      ],
      needed: cu.k4needed.toFixed(1),
      neededFmt: cu.k4needed.toFixed(1)+' / wk',
      sub: cu.k4left+' meetings left to source'
    }
  ];

  document.getElementById('catchupGrid').innerHTML = cards.map(c => `
    <div class="catchup-card">
      <div class="cu-header">
        <div class="cu-kpi">${c.kpi}</div>
        <div class="cu-gap-badge">${c.gapFmt}</div>
      </div>
      ${c.rows.map(r=>`<div class="cu-row"><div class="cu-rowlbl">${r.lbl}</div><div class="cu-rowval">${r.val}</div></div>`).join('')}
      <div class="cu-catchup">
        <div class="cu-catchup-lbl">Avg needed / week to hit Q2 goal</div>
        <div class="cu-catchup-val" style="color:${c.color}">${c.neededFmt}</div>
        <div class="cu-catchup-sub">${c.sub}</div>
      </div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════
// RENDER ECO GRID
// ═══════════════════════════════════════════════════════════
function renderEco() {
  const w = getWk(DIAL_WK), d = DATA[DIAL_WK];
  document.getElementById('ecoWeekLbl').textContent = w.lbl;
  const nn = v => v===null ? `<span style="color:var(--dim)">—</span>` : v;
  const aemEngCt  = Object.values(AEM_EDITS).filter(e=>e.engaged).length;
  const pursEngCt = pursuitRows.filter(r=>r.engaged==='Yes').length;
  document.getElementById('ecoGrid').innerHTML = `
    <div class="eco-card"><div class="eco-title">KPI #1 · Accounts</div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#6366f1"></span>BDR</div><div class="eco-val" style="color:#6366f1">${nn(d.kpi1.bdr)}</div></div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:var(--amber)"></span>Carahsoft</div><div class="eco-val" style="color:var(--amber)">${nn(d.kpi1.carahsoft)}</div></div>
    </div>
    <div class="eco-card"><div class="eco-title">KPI #2 · Meetings</div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#6366f1"></span>BDR</div><div class="eco-val" style="color:#6366f1">${nn(d.kpi2.bdr)}</div></div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:var(--amber)"></span>Carahsoft</div><div class="eco-val" style="color:var(--amber)">${nn(d.kpi2.carahsoft)}</div></div>
    </div>
    <div class="eco-card"><div class="eco-title">KPI #4 · Partner-Sourced Meetings</div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:var(--purple)"></span>Actual</div><div class="eco-val" style="color:var(--purple)">${nn(d.kpi4.actual)}</div></div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:var(--dim)"></span>Q2 Target</div><div class="eco-val" style="color:var(--muted)">${d.kpi4.target}</div></div>
    </div>
    <div class="eco-card"><div class="eco-title">KPI #5 · GR/Lobbyist Meetings</div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#0ea5e9"></span>Actual</div><div class="eco-val" style="color:#0ea5e9">${nn(d.kpi5?d.kpi5.actual:null)}</div></div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:var(--dim)"></span>Q2 Target</div><div class="eco-val" style="color:var(--muted)">${d.kpi5?d.kpi5.target:10}</div></div>
    </div>
    <div class="eco-card"><div class="eco-title">KPI #6 · AEM Customers Engaged</div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#f97316"></span>Engaged</div><div class="eco-val" style="color:#f97316">${aemEngCt}</div></div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:var(--dim)"></span>Total AEM Accounts</div><div class="eco-val" style="color:var(--muted)">104</div></div>
    </div>
    <div class="eco-card"><div class="eco-title">KPI #7 · PURSUIT Signals Engaged</div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#0ea5e9"></span>Engaged</div><div class="eco-val" style="color:#0ea5e9">${pursEngCt}</div></div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:var(--dim)"></span>Total Signals</div><div class="eco-val" style="color:var(--muted)">${pursuitRows.length}</div></div>
    </div>
    <div class="eco-card"><div class="eco-title">Q2 Overall Targets</div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:var(--blue)"></span># of Meetings</div><div class="eco-val" style="color:var(--blue)">244</div></div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:var(--amber)"></span># of SS3 Opps</div><div class="eco-val" style="color:var(--amber)">80</div></div>
      <div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:var(--green)"></span>Stage 3 Pipeline</div><div class="eco-val" style="color:var(--green)">$6.0M</div></div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════
// RENDER CHARTS
// ═══════════════════════════════════════════════════════════
function renderCharts() { /* chart section removed by user request */ }

// ═══════════════════════════════════════════════════════════
// RENDER WEEKLY TABLE
// ═══════════════════════════════════════════════════════════
function renderTable() {
  // Build per-week KPI6 engaged counts using contactDate bucketing
  const kpi6ByWk = {};
  WEEKS.forEach(w=>{ kpi6ByWk[w.key]=0; });
  Object.values(AEM_EDITS).forEach(e=>{
    if(e.engaged && e.contactDate){
      const wk=dateToWeekKey(e.contactDate);
      if(wk && kpi6ByWk[wk]!==undefined) kpi6ByWk[wk]++;
    }
  });
  const kpi6WeekMap = { kpi6eng: kpi6ByWk };

  let h = '<thead><tr><th style="min-width:200px">KPI / Metric</th>';
  WEEKS.forEach(w => h+=`<th class="${w.key===DIAL_WK?'wk-active':''}">${w.date}<br><span style="font-weight:400;font-size:8px;text-transform:none">${w.lbl}</span></th>`);
  h += '</tr></thead><tbody>';
  const rows=[
    {s:'KPI #1 — Accounts Outreached'},
    {l:'↳ Target',    f:d=>d.kpi1.target, dim:true},
    {l:'↳ Actual',    f:d=>d.kpi1.actual, clr:'#fa0f00'},
    {l:'· BDR',       f:d=>d.kpi1.bdr, clr:'#6366f1',i:true},
    {l:'· Carahsoft',f:d=>d.kpi1.carahsoft,clr:null,i:true},
    {l:'· ADs',       f:d=>d.kpi1.ads, clr:'#22c55e',i:true},
    {l:'· Partners',  f:d=>d.kpi1.partners,clr:'#a855f7',i:true},
    {s:'KPI #2 — Scheduled Meetings'},
    {l:'↳ Target',    f:d=>d.kpi2.target, dim:true},
    {l:'↳ Actual',    f:d=>d.kpi2.actual, clr:'#22c55e'},
    {l:'· BDR',       f:d=>d.kpi2.bdr, clr:'#6366f1',i:true},
    {l:'· Carahsoft',f:d=>d.kpi2.carahsoft,clr:null,i:true},
    {l:'· ADs',       f:d=>d.kpi2.ads, clr:'#22c55e',i:true},
    {l:'· Partners',  f:d=>d.kpi2.partners,clr:'#a855f7',i:true},
    {s:'KPI #3 — Net New SS3 Pipeline'},
    {l:'↳ Target',    f:d=>d.kpi3.target, dim:true, money:true},
    {l:'↳ Actual',    f:d=>d.kpi3.actual, clr:'#f59e0b',money:true},
    {s:'KPI #4 — Partner-Sourced Meetings'},
    {l:'↳ Target Q2', f:d=>d.kpi4.target, dim:true},
    {l:'↳ Actual',    f:d=>d.kpi4.actual, clr:'#a855f7'},
    {s:'KPI #5 — GR / Lobbyist Sourced Meetings'},
    {l:'↳ Target',    f:d=>d.kpi5?d.kpi5.target:null, dim:true},
    {l:'↳ Actual',    f:d=>d.kpi5?d.kpi5.actual:null, clr:'#0ea5e9'},
    {s:'KPI #6 — AEM Customers Engaged (by Contact Date Week)'},
    {l:'↳ Engaged', weekFn:true, weekKey:'kpi6eng', clr:'#f97316'},
    {s:'KPI #7 — PURSUIT Signals Engaged (Cumulative)'},
    {l:'↳ Total Engaged', live:true, liveVal:()=>pursuitRows.filter(r=>r.engaged==='Yes').length, clr:'#0ea5e9'},
  ];
  rows.forEach(r=>{
    if(r.s){h+=`<tr><td colspan="${WEEKS.length+1}" class="sec-hdr">${r.s}</td></tr>`;return;}
    const ist=r.i?'padding-left:20px;color:var(--muted);':''; const dmt=r.dim?'color:var(--dim);':'';
    h+=`<tr><td class="row-lbl" style="${ist}${dmt}">${r.l}</td>`;
    if(r.weekFn){
      // Per-week lookup from a precomputed map (e.g. KPI6 by contactDate week)
      const map = kpi6WeekMap[r.weekKey] || {};
      const cs = r.clr ? `color:${r.clr};font-weight:600;` : '';
      WEEKS.forEach(w=>{
        const v = map[w.key];
        if(v===undefined||v===0){h+='<td class="val-empty">—</td>';return;}
        h+=`<td style="${cs}">${v}</td>`;
      });
    } else if(r.live){
      // Live cumulative KPI — same value shown across all weeks
      const lv = r.liveVal();
      const cs = r.clr ? `color:${r.clr};font-weight:600;` : '';
      WEEKS.forEach(()=>{ h+=`<td style="${cs}">${lv}</td>`; });
    } else {
      WEEKS.forEach(w=>{
        const v=r.f(DATA[w.key]);
        if(v===null||v===undefined){h+='<td class="val-empty">—</td>';return;}
        const disp=r.money?fmtM(v):v;
        const cs=r.dim?'color:var(--dim);':(r.clr?`color:${r.clr};`:'');
        h+=`<td style="${cs}">${disp}</td>`;
      });
    }
    h+='</tr>';
  });
  document.getElementById('weeklyTable').innerHTML=h+'</tbody>';
}

// ═══════════════════════════════════════════════════════════
// DIALS
// ═══════════════════════════════════════════════════════════
const DIAL_CFGS = [
  {id:'d1',bid:'db1',kpi:'KPI #1',title:'Accounts Outreached',max:100,red:50,yellow:70,fmt:v=>v,thresh:'< 50 Red · 50–69 Yellow · 70+ Green',get:d=>d.kpi1.actual},
  {id:'d2',bid:'db2',kpi:'KPI #2',title:'Meetings with Customer',max:30,red:10,yellow:20,fmt:v=>v,thresh:'< 10 Red · 10–19 Yellow · 20+ Green',get:d=>d.kpi2.actual},
  {id:'d3',bid:'db3',kpi:'KPI #3',title:'Net New SS3 Pipeline',max:700000,red:500000,yellow:585000,fmt:v=>'$'+Math.round(v/1000)+'K',thresh:'< $500K Red · $500–585K Yellow · $585K+ Green',get:d=>d.kpi3.actual},
  {id:'d4',bid:'db4',kpi:'KPI #4',title:'Partner-Sourced Mtgs',max:35,red:10,yellow:25,fmt:v=>v,thresh:'< 10 Red · 10–24 Yellow · 25+ Green',get:d=>d.kpi4.actual},
  {id:'d5',bid:'db5',kpi:'KPI #5',title:'GR/Lobbyist Sourced Mtgs',max:150,red:40,yellow:100,fmt:v=>v,thresh:'< 40 Red · 40–99 Yellow · 100+ Green',get:d=>d.kpi5?d.kpi5.actual:null},
  {id:'d6',bid:'db6',kpi:'KPI #6',title:'AEM Customers Engaged',max:104,red:20,yellow:52,fmt:v=>v,thresh:'< 20 Red · 20–51 Yellow · 52+ Green',get:()=>Object.values(AEM_EDITS).filter(e=>e.engaged).length},
  {id:'d7',bid:'db7',kpi:'KPI #7',title:'PURSUIT Signals Engaged',max:50,red:5,yellow:15,fmt:v=>v,thresh:'< 5 Red · 5–14 Yellow · 15+ Green',get:()=>pursuitRows.filter(r=>r.engaged==='Yes').length},
];

function buildDials() {
  document.getElementById('dialsGrid').innerHTML = DIAL_CFGS.map(c=>`
    <div class="dial-card">
      <div class="dial-kpi">${c.kpi}</div>
      <div class="dial-title">${c.title}</div>
      <canvas id="${c.id}" width="200" height="118" style="display:block;margin:0 auto"></canvas>
      <div id="${c.bid}" class="dial-badge"></div>
      <div class="dial-thresh">${c.thresh}</div>
    </div>`).join('');
}

function drawDial(cfg, val) {
  const cv=document.getElementById(cfg.id); if(!cv)return;
  const ctx=cv.getContext('2d');
  const W=cv.width,H=cv.height,cx=W/2,cy=H-12,r=72,aw=13;
  ctx.clearRect(0,0,W,H);
  const re=Math.PI+(cfg.red/cfg.max)*Math.PI, ye=Math.PI+(cfg.yellow/cfg.max)*Math.PI;
  function arc(s,e,c){ctx.beginPath();ctx.arc(cx,cy,r,s,e);ctx.strokeStyle=c;ctx.lineWidth=aw;ctx.lineCap='butt';ctx.stroke();}
  arc(Math.PI,0,'rgba(0,0,0,.08)');arc(Math.PI,re,'#ef4444');arc(re,ye,'#f59e0b');arc(ye,0,'#22c55e');
  ctx.beginPath();ctx.arc(cx,cy,r-aw/2-1,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();
  if(val!==null){const a=Math.PI+(Math.min(val,cfg.max)/cfg.max)*Math.PI;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+(r-8)*Math.cos(a),cy+(r-8)*Math.sin(a));ctx.strokeStyle='#1a1d27';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.stroke();}
  ctx.beginPath();ctx.arc(cx,cy,5,0,Math.PI*2);ctx.fillStyle='#1a1d27';ctx.fill();
  ctx.font="500 20px 'DM Mono',monospace";ctx.fillStyle='#1a1d27';ctx.textAlign='center';ctx.textBaseline='bottom';
  ctx.fillText(val!==null?cfg.fmt(val):'—',cx,cy-6);
  ctx.font="400 9px 'DM Sans',sans-serif";ctx.fillStyle='#9ca3b0';
  ctx.textAlign='left';ctx.fillText('0',cx-r-2,cy+12);ctx.textAlign='right';ctx.fillText(cfg.fmt(cfg.max),cx+r+2,cy+12);
  const b=document.getElementById(cfg.bid); if(!b)return;
  const[st,bg,cl]=val===null?['NO DATA','rgba(0,0,0,.06)','var(--dim)']:val>=cfg.yellow?['ON TRACK','rgba(34,197,94,.15)','#22c55e']:val>=cfg.red?['AT RISK','rgba(245,158,11,.15)','#f59e0b']:['BEHIND','rgba(239,68,68,.15)','#ef4444'];
  b.textContent=st;b.style.background=bg;b.style.color=cl;
}

function renderDials(){DIAL_CFGS.forEach(c=>drawDial(c,c.get(DATA[DIAL_WK])));}

// ═══════════════════════════════════════════════════════════
// WEEK SELECTORS
// ═══════════════════════════════════════════════════════════
function populateSelects() {
  ['dialWkSel','aiWkSel'].forEach(id=>{
    const sel=document.getElementById(id); if(!sel)return;
    sel.innerHTML='';
    WEEKS.forEach(w=>{
      const has=DATA[w.key].kpi1.actual!==null;
      const o=document.createElement('option');
      o.value=w.key; o.textContent=`${w.lbl} · ${w.date}${has?' ✓':''}`;
      if(w.key===DIAL_WK)o.selected=true;
      sel.appendChild(o);
    });
  });
}
function onDialWkChange(wk){DIAL_WK=wk;save();renderAll();}

// ═══════════════════════════════════════════════════════════
// PANEL DATA
// ═══════════════════════════════════════════════════════════
const TGT_DATA = window.LLMO_SHEET_TARGETS.map((r) => ({ ...r, accounts: Number(r.accounts), tam: Number(r.tam) }));

const AEM_DATA = window.LLMO_SHEET_AEM;

const MTG_DATA = window.LLMO_SHEET_MEETINGS;

// ─── PARTNER SOURCED / SALES ACTIVITY ────────────────────────────────────────
function loadSales(){
  try{ return JSON.parse(localStorage.getItem('llmo_sales_v1')||'null')||[]; }
  catch(e){ return []; }
}
function saveSales(){
  localStorage.setItem('llmo_sales_v1', JSON.stringify(salesRows));
}
let salesRows = loadSales();
let salesEditIdx = -1;

function renderSalesActivity(){
  const tb = document.getElementById('sales-tbody');
  if(!tb) return;
  const ct = document.getElementById('sales-count');
  if(ct) ct.textContent = salesRows.length + ' entr' + (salesRows.length===1?'y':'ies');
  if(salesRows.length === 0){
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--muted);font-size:13px;">No activities yet — click <strong style="color:var(--red);">+ Add Activity</strong> to get started</td></tr>';
    return;
  }
  var html = '';
  for(var i=0; i<salesRows.length; i++){
    var r = salesRows[i];
    var yn = r.contacted==='Yes'
      ? '<span class="yn-yes">Yes</span>'
      : (r.contacted==='No' ? '<span style="font-size:11px;font-weight:500;padding:2px 7px;border-radius:4px;background:rgba(220,38,38,.1);color:#dc2626;">No</span>' : '<span class="yn-no">—</span>');
    html += '<tr onclick="openSalesForm(' + i + ')" style="cursor:pointer;" title="Click to edit">'
      + '<td class="pt-acct">' + (r.account||'—') + '</td>'
      + '<td style="font-size:12px;">' + (r.partner||'—') + '</td>'
      + '<td>' + yn + '</td>'
      + '<td style="font-size:12px;white-space:nowrap;">' + (r.date||'—') + '</td>'
      + '<td style="font-size:12px;white-space:nowrap;">' + (r.assignTo||'—') + '</td>'
      + '<td style="font-size:12px;color:var(--muted);max-width:200px;white-space:normal;line-height:1.4;">' + (r.notes||'') + '</td>'
      + '<td><button onclick="event.stopPropagation();deleteSalesRow(' + i + ')" style="background:none;border:none;cursor:pointer;color:var(--dim);font-size:14px;padding:2px 6px;border-radius:4px;" title="Delete">&#x2715;</button></td>'
      + '</tr>';
  }
  tb.innerHTML = html;
}

function openSalesForm(idx){
  salesEditIdx = idx;
  var form  = document.getElementById('sales-form');
  var title = document.getElementById('sales-form-title');
  if(!form) return;
  if(idx === -1){
    document.getElementById('sf-account').value   = '';
    document.getElementById('sf-partner').value   = '';
    document.getElementById('sf-contacted').value = '';
    document.getElementById('sf-date').value      = '';
    document.getElementById('sf-assignTo').value  = '';
    document.getElementById('sf-notes').value     = '';
    if(title) title.textContent = 'New Activity';
  } else {
    var r = salesRows[idx];
    document.getElementById('sf-account').value   = r.account   || '';
    document.getElementById('sf-partner').value   = r.partner   || '';
    document.getElementById('sf-contacted').value = r.contacted || '';
    document.getElementById('sf-date').value      = r.date      || '';
    document.getElementById('sf-assignTo').value  = r.assignTo  || '';
    document.getElementById('sf-notes').value     = r.notes     || '';
    if(title) title.textContent = 'Edit Activity';
  }
  form.style.display = 'block';
  document.getElementById('sf-account').focus();
  var body = document.querySelector('#panelMeetings .sp-body');
  if(body) body.scrollTo({top:0, behavior:'smooth'});
}

function cancelSalesForm(){
  var form = document.getElementById('sales-form');
  if(form) form.style.display = 'none';
  salesEditIdx = -1;
}

function saveSalesForm(){
  var account   = document.getElementById('sf-account').value.trim();
  var partner   = document.getElementById('sf-partner').value.trim();
  var contacted = document.getElementById('sf-contacted').value;
  var date      = document.getElementById('sf-date').value;
  var assignTo  = document.getElementById('sf-assignTo').value.trim();
  var notes     = document.getElementById('sf-notes').value.trim();
  var row = { account:account, partner:partner, contacted:contacted, date:date, assignTo:assignTo, notes:notes };
  if(salesEditIdx === -1){ salesRows.push(row); } else { salesRows[salesEditIdx] = row; }
  saveSales();
  cancelSalesForm();
  syncKpi4();
  renderSalesActivity();
}

function deleteSalesRow(i){
  if(!confirm('Delete this activity?')) return;
  salesRows.splice(i, 1);
  saveSales();
  syncKpi4();
  renderSalesActivity();
}

// Sync KPI #4 = total Partner Sourced / Sales Activity rows
function syncKpi4(){
  var count = salesRows.filter(function(r){ return r.account||r.partner; }).length;
  if(DATA[DIAL_WK]) DATA[DIAL_WK].kpi4.actual = count;
  save();
  renderKPI();
  renderEco();
  renderDials();
}

// ─── WEEK-DATE HELPER (shared by BDR + GR) ──────────────────────────────────
const WEEK_DATES = {
  wk7:'2026-03-16', wk8:'2026-03-23', wk11:'2026-03-30', wk12:'2026-04-06',
  wk13:'2026-04-13', wk14:'2026-04-20', wk15:'2026-04-27', wk16:'2026-05-04',
  wk17:'2026-05-11', wk18:'2026-05-18', wk19:'2026-05-25'
};
function getWeekForDate(dateStr){
  if(!dateStr) return null;
  var d = new Date(dateStr + 'T00:00:00');
  var keys = Object.keys(WEEK_DATES);
  for(var i=0; i<keys.length; i++){
    var wStart = new Date(WEEK_DATES[keys[i]] + 'T00:00:00');
    var wEnd   = i < keys.length-1 ? new Date(WEEK_DATES[keys[i+1]] + 'T00:00:00') : new Date('2026-06-01T00:00:00');
    if(d >= wStart && d < wEnd) return keys[i];
  }
  return null;
}

// ─── SALES / BDR SOURCED MEETINGS → KPI #2 ──────────────────────────────────
function loadBDR(){ try{ return JSON.parse(localStorage.getItem('llmo_bdr_v1')||'null')||[]; } catch(e){ return []; } }
function saveBDR(){ localStorage.setItem('llmo_bdr_v1', JSON.stringify(bdrRows)); }
let bdrRows = loadBDR();
let bdrEditIdx = -1;

function renderBDR(){
  var tb = document.getElementById('bdr-tbody'); if(!tb) return;
  var ct = document.getElementById('bdr-count');
  if(ct) ct.textContent = bdrRows.length + ' entr' + (bdrRows.length===1?'y':'ies');
  if(bdrRows.length === 0){
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--muted);font-size:13px;">No meetings yet — click <strong style="color:var(--red);">+ Add Meeting</strong> to get started</td></tr>';
    return;
  }
  var html = '';
  for(var i=0; i<bdrRows.length; i++){
    var r = bdrRows[i];
    var wk = getWeekForDate(r.entryDate);
    var wkObj = wk ? WEEKS.find(function(w){return w.key===wk;}) : null;
    var wkLabel = wkObj ? (wkObj.lbl||wkObj.label||wk) : (wk||'—');
    html += '<tr onclick="openBDRForm(' + i + ')" style="cursor:pointer;" title="Click to edit">'
      + '<td class="pt-acct">' + (r.account||'—') + '</td>'
      + '<td style="font-size:12px;">' + (r.assignTo||'—') + '</td>'
      + '<td style="font-size:12px;white-space:nowrap;">' + (r.entryDate||'—') + '</td>'
      + '<td style="font-size:12px;white-space:nowrap;">' + (r.meetingDate||'—') + '</td>'
      + '<td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(8,145,178,.12);color:#0891b2;">' + wkLabel + '</span></td>'
      + '<td style="font-size:12px;color:var(--muted);max-width:200px;white-space:normal;line-height:1.4;">' + (r.notes||'') + '</td>'
      + '<td><button onclick="event.stopPropagation();deleteBDRRow(' + i + ')" style="background:none;border:none;cursor:pointer;color:var(--dim);font-size:14px;padding:2px 6px;border-radius:4px;" title="Delete">&#x2715;</button></td>'
      + '</tr>';
  }
  tb.innerHTML = html;
}

function openBDRForm(idx){
  bdrEditIdx = idx;
  var form = document.getElementById('bdr-form'); var title = document.getElementById('bdr-form-title');
  if(!form) return;
  if(idx === -1){
    document.getElementById('bf-account').value=''; document.getElementById('bf-assignTo').value='';
    document.getElementById('bf-entryDate').value=new Date().toISOString().slice(0,10);
    document.getElementById('bf-meetingDate').value=''; document.getElementById('bf-notes').value='';
    if(title) title.textContent='New Meeting';
  } else {
    var r=bdrRows[idx];
    document.getElementById('bf-account').value=r.account||''; document.getElementById('bf-assignTo').value=r.assignTo||'';
    document.getElementById('bf-entryDate').value=r.entryDate||''; document.getElementById('bf-meetingDate').value=r.meetingDate||'';
    document.getElementById('bf-notes').value=r.notes||'';
    if(title) title.textContent='Edit Meeting';
  }
  form.style.display='block'; document.getElementById('bf-account').focus();
  var body=document.querySelector('#panelBDR .sp-body'); if(body) body.scrollTo({top:0,behavior:'smooth'});
}

function cancelBDRForm(){ var f=document.getElementById('bdr-form'); if(f) f.style.display='none'; bdrEditIdx=-1; }

function saveBDRForm(){
  var row={ account:document.getElementById('bf-account').value.trim(), assignTo:document.getElementById('bf-assignTo').value.trim(),
            entryDate:document.getElementById('bf-entryDate').value, meetingDate:document.getElementById('bf-meetingDate').value,
            notes:document.getElementById('bf-notes').value.trim() };
  if(bdrEditIdx===-1){ bdrRows.push(row); } else { bdrRows[bdrEditIdx]=row; }
  saveBDR(); cancelBDRForm(); syncKpi2fromBDR(); renderBDR();
}

function deleteBDRRow(i){ if(!confirm('Delete this meeting?')) return; bdrRows.splice(i,1); saveBDR(); syncKpi2fromBDR(); renderBDR(); }

function syncKpi2fromBDR(){
  var counts={}; WEEKS.forEach(function(w){ counts[w.key]=0; });
  bdrRows.forEach(function(r){
    if(!r.account && !r.assignTo) return;
    var wk=getWeekForDate(r.entryDate); if(wk && counts[wk]!==undefined) counts[wk]++;
  });
  WEEKS.forEach(function(w){
    var d=DATA[w.key]; if(!d) return;
    if(d.kpi2.actualNonBdr===undefined) d.kpi2.actualNonBdr=d.kpi2.actual;
    var base=d.kpi2.actualNonBdr||0, cnt=counts[w.key];
    if(base>0||cnt>0) d.kpi2.actual=base+cnt;
  });
  save(); renderKPI(); renderEco(); renderCharts(); renderTable(); renderDials(); renderCatchup();
}

// ─── GR / LOBBYIST SOURCED MEETINGS → KPI #5 ────────────────────────────────
function loadGR(){ try{ return JSON.parse(localStorage.getItem('llmo_gr_v1')||'null')||[]; } catch(e){ return []; } }
function saveGR(){ localStorage.setItem('llmo_gr_v1', JSON.stringify(grRows)); }
let grRows = loadGR();
let grEditIdx = -1;

function renderGR(){
  var tb=document.getElementById('gr-tbody'); if(!tb) return;
  var ct=document.getElementById('gr-count'); if(ct) ct.textContent=grRows.length+' entr'+(grRows.length===1?'y':'ies');
  if(grRows.length===0){
    tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--muted);font-size:13px;">No meetings yet — click <strong style="color:#0ea5e9;">+ Add Meeting</strong> to get started</td></tr>';
    return;
  }
  var html='';
  for(var i=0; i<grRows.length; i++){
    var r=grRows[i];
    var wk=getWeekForDate(r.entryDate);
    var wkObj=wk?WEEKS.find(function(w){return w.key===wk;}):null;
    var wkDisp=wkObj?(wkObj.lbl||wkObj.label||wk):(wk||'—');
    html+='<tr onclick="openGRForm('+i+')" style="cursor:pointer;" title="Click to edit">'
      +'<td class="pt-acct">'+(r.account||'—')+'</td>'
      +'<td style="font-size:12px;">'+(r.assignTo||'—')+'</td>'
      +'<td style="font-size:12px;white-space:nowrap;">'+(r.entryDate||'—')+'</td>'
      +'<td style="font-size:12px;white-space:nowrap;">'+(r.meetingDate||'—')+'</td>'
      +'<td><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(14,165,233,.12);color:#0ea5e9;">'+wkDisp+'</span></td>'
      +'<td style="font-size:12px;color:var(--muted);max-width:200px;white-space:normal;line-height:1.4;">'+(r.notes||'')+'</td>'
      +'<td><button onclick="event.stopPropagation();deleteGRRow('+i+')" style="background:none;border:none;cursor:pointer;color:var(--dim);font-size:14px;padding:2px 6px;border-radius:4px;" title="Delete">&#x2715;</button></td>'
      +'</tr>';
  }
  tb.innerHTML=html;
}

function openGRForm(idx){
  grEditIdx=idx;
  var form=document.getElementById('gr-form'); var title=document.getElementById('gr-form-title');
  if(!form) return;
  if(idx===-1){
    document.getElementById('gf-account').value=''; document.getElementById('gf-assignTo').value='';
    document.getElementById('gf-entryDate').value=new Date().toISOString().slice(0,10);
    document.getElementById('gf-meetingDate').value=''; document.getElementById('gf-notes').value='';
    if(title) title.textContent='New Meeting';
  } else {
    var r=grRows[idx];
    document.getElementById('gf-account').value=r.account||''; document.getElementById('gf-assignTo').value=r.assignTo||'';
    document.getElementById('gf-entryDate').value=r.entryDate||''; document.getElementById('gf-meetingDate').value=r.meetingDate||'';
    document.getElementById('gf-notes').value=r.notes||'';
    if(title) title.textContent='Edit Meeting';
  }
  form.style.display='block'; document.getElementById('gf-account').focus();
  var body=document.querySelector('#panelGR .sp-body'); if(body) body.scrollTo({top:0,behavior:'smooth'});
}

function cancelGRForm(){ var f=document.getElementById('gr-form'); if(f) f.style.display='none'; grEditIdx=-1; }

function saveGRForm(){
  var row={ account:document.getElementById('gf-account').value.trim(), assignTo:document.getElementById('gf-assignTo').value.trim(),
            entryDate:document.getElementById('gf-entryDate').value||new Date().toISOString().slice(0,10),
            meetingDate:document.getElementById('gf-meetingDate').value, notes:document.getElementById('gf-notes').value.trim() };
  if(grEditIdx===-1){ grRows.push(row); } else { grRows[grEditIdx]=row; }
  saveGR(); cancelGRForm(); syncKpi5fromGR(); renderGR();
}

function deleteGRRow(i){ if(!confirm('Delete this meeting?')) return; grRows.splice(i,1); saveGR(); syncKpi5fromGR(); renderGR(); }

function syncKpi5fromGR(){
  var counts={}; WEEKS.forEach(function(w){ counts[w.key]=0; });
  grRows.forEach(function(r){
    if(!r.account && !r.assignTo) return;
    var wk=getWeekForDate(r.entryDate); if(wk && counts[wk]!==undefined) counts[wk]++;
  });
  WEEKS.forEach(function(w){
    var d=DATA[w.key]; if(!d||!d.kpi5) return;
    if(d.kpi5.actualNonGR===undefined) d.kpi5.actualNonGR=d.kpi5.actual;
    var base=d.kpi5.actualNonGR||0, cnt=counts[w.key];
    if(base>0||cnt>0) d.kpi5.actual=base+cnt;
  });
  save(); renderKPI(); renderEco(); renderCharts(); renderTable(); renderDials(); renderCatchup();
}


const COMP_DATA = window.LLMO_SHEET_COMPETITIVE.map((r) => ({ f: r.feature, a: r.adobe, s: r.scrunch, se: r.semrush, p: r.profound, pe: r.peec }));

// ═══════════════════════════════════════════════════════════
// PANEL RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════════
function ownerBadge(o){
  if(!o)return'';
  const lo=o.toLowerCase();
  const[bg,cl]=lo.includes('ad')?['rgba(59,130,246,.15)','#3b82f6']:lo.includes('bdr')?['rgba(99,102,241,.15)','#818cf8']:['rgba(245,158,11,.15)','#f59e0b'];
  return `<span class="p-badge" style="background:${bg};color:${cl}">${o}</span>`;
}
function statusBadge(s){
  const lo=(s||'').toLowerCase();
  const[bg,cl]=lo==='confirmed'?['rgba(34,197,94,.15)','#22c55e']:['rgba(245,158,11,.15)','#f59e0b'];
  return `<span class="p-badge" style="background:${bg};color:${cl}">${s}</span>`;
}
function compCell(v,isA){
  if(v==='check')return`<td style="text-align:center"><span style="display:inline-flex;align-items:center;justify-content:center;width:21px;height:21px;background:#22c55e;border-radius:4px;font-size:11px;color:#fff">✓</span></td>`;
  const m={Strong:{bg:'rgba(250,15,0,.15)',cl:'#fa0f00',fw:'600'},Yes:{bg:'rgba(250,15,0,.15)',cl:'#fa0f00',fw:'600'},Moderate:{bg:'rgba(245,158,11,.12)',cl:'#f59e0b',fw:'400'},Partial:{bg:'rgba(245,158,11,.12)',cl:'#f59e0b',fw:'400'},Basic:{bg:'rgba(255,255,255,.06)',cl:'#8a8f99',fw:'400'},Limited:{bg:'rgba(239,68,68,.1)',cl:'#ef4444',fw:'400'},Weak:{bg:'rgba(239,68,68,.1)',cl:'#ef4444',fw:'400'},Lighter:{bg:'rgba(239,68,68,.1)',cl:'#ef4444',fw:'400'},No:{bg:'rgba(239,68,68,.15)',cl:'#ef4444',fw:'600'}};
  const s=m[v]||{bg:'rgba(255,255,255,.06)',cl:'#8a8f99',fw:'400'};
  const br=isA?'border:1px solid rgba(250,15,0,.3);':'';
  return `<td style="text-align:center"><span style="display:inline-block;font-size:10px;font-weight:${s.fw};padding:2px 9px;border-radius:9px;background:${s.bg};color:${s.cl};${br}">${v}</span></td>`;
}

function renderTargets(){
  const q=(document.getElementById('tgtSearch')||{}).value||'';
  let rows=[...TGT_DATA].filter(r=>!q||r.segment.toLowerCase().includes(q.toLowerCase())||r.owner.toLowerCase().includes(q.toLowerCase()));
  rows.sort((a,b)=>{const av=tgtSort.col==='segment'?a.segment:tgtSort.col==='accounts'?a.accounts:a.tam,bv=tgtSort.col==='segment'?b.segment:tgtSort.col==='accounts'?b.accounts:b.tam;return av>bv?tgtSort.dir:av<bv?-tgtSort.dir:0;});
  document.getElementById('tgtBody').innerHTML=rows.map(r=>`<tr><td style="color:var(--text);font-weight:500">${r.segment}</td><td style="color:var(--blue);font-family:'DM Mono',monospace">${r.accounts}</td><td style="color:var(--green);font-family:'DM Mono',monospace">${fmtM(r.tam)}</td><td>${ownerBadge(r.owner)}</td><td style="font-size:10px;color:var(--dim)">${r.launch}</td></tr>`).join('');
}

// Map a JS Date to the correct WEEKS key (each week covers Mon–Sun of that period)
function dateToWeekKey(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  if(isNaN(d)) return null;
  // Week boundaries: each week starts on the date listed and runs 7 days
  const wkDates = [
    {key:'wk7', start:new Date('2026-03-16'), end:new Date('2026-03-22')},
    {key:'wk8', start:new Date('2026-03-23'), end:new Date('2026-03-29')},
    {key:'wk11',start:new Date('2026-03-30'), end:new Date('2026-04-05')},
    {key:'wk12',start:new Date('2026-04-06'), end:new Date('2026-04-12')},
    {key:'wk13',start:new Date('2026-04-13'), end:new Date('2026-04-19')},
    {key:'wk14',start:new Date('2026-04-20'), end:new Date('2026-04-26')},
    {key:'wk15',start:new Date('2026-04-27'), end:new Date('2026-05-03')},
    {key:'wk16',start:new Date('2026-05-04'), end:new Date('2026-05-10')},
    {key:'wk17',start:new Date('2026-05-11'), end:new Date('2026-05-17')},
    {key:'wk18',start:new Date('2026-05-18'), end:new Date('2026-05-24')},
    {key:'wk19',start:new Date('2026-05-25'), end:new Date('2026-05-31')},
  ];
  for(const w of wkDates){ if(d>=w.start && d<=w.end) return w.key; }
  return null;
}

function fmtDateDisplay(iso){
  if(!iso) return '—';
  const d=new Date(iso+'T12:00:00'); if(isNaN(d)) return iso;
  return (d.getMonth()+1)+'/'+d.getDate()+'/'+String(d.getFullYear()).slice(2);
}

// Recompute AEM contributions into DATA weekly buckets
function applyAEMToKPIs(){
  ensureBaseActuals();
  // Count AEM contributions per week from scratch
  const aem1={}, aem2={};
  WEEKS.forEach(w=>{ aem1[w.key]=0; aem2[w.key]=0; });
  Object.entries(AEM_EDITS).forEach(([name,e])=>{
    if(e.contacted && e.contactDate){
      const wk=dateToWeekKey(e.contactDate);
      if(wk) aem1[wk]++;
    }
    if(e.mtgSet && e.mtgDate){
      const wk=dateToWeekKey(e.mtgDate);
      if(wk) aem2[wk]++;
    }
  });
  // Apply: base + AEM. If base is null and AEM=0, keep null (no data). If AEM>0, always set.
  WEEKS.forEach(w=>{
    const base1 = BASE_ACTUALS[w.key] ? BASE_ACTUALS[w.key].kpi1 : null;
    const base2 = BASE_ACTUALS[w.key] ? BASE_ACTUALS[w.key].kpi2 : null;
    DATA[w.key].kpi1.actual = (aem1[w.key]>0 || base1!==null) ? ((base1||0) + aem1[w.key]) : null;
    DATA[w.key].kpi2.actual = (aem2[w.key]>0 || base2!==null) ? ((base2||0) + aem2[w.key]) : null;
  });
}

function renderAEM(){
  const q=(document.getElementById('aemSearch')||{}).value||'';
  const reg=(document.getElementById('aemRegion')||{}).value||'';
  const ad=(document.getElementById('aemAD')||{}).value||'';
  const cf=(document.getElementById('aemContactFilter')||{}).value||'';
  let rows=[...AEM_DATA].filter(r=>{
    const mt=!q||r.name.toLowerCase().includes(q.toLowerCase())||r.ad.toLowerCase().includes(q.toLowerCase())||r.partner.toLowerCase().includes(q.toLowerCase());
    const edit=AEM_EDITS[r.name]||{};
    const contactMatch=!cf||(cf==='contacted'&&edit.contacted)||(cf==='not-contacted'&&!edit.contacted);
    return mt&&(!reg||r.region===reg)&&(!ad||r.ad===ad)&&contactMatch;
  });
  rows.sort((a,b)=>{const av=a[aemSort.col]||'',bv=b[aemSort.col]||'';return av>bv?aemSort.dir:av<bv?-aemSort.dir:0;});

  const totalContacted=Object.values(AEM_EDITS).filter(e=>e.contacted).length;
  const totalMtgSet=Object.values(AEM_EDITS).filter(e=>e.mtgSet).length;
  const e2=rows.filter(r=>r.region==='East').length, w2=rows.filter(r=>r.region==='West').length;
  document.getElementById('aemTotal').textContent=rows.length;
  document.getElementById('aemEast').textContent=e2;
  document.getElementById('aemWest').textContent=w2;
  document.getElementById('aemContacted').textContent=totalContacted;
  document.getElementById('aemMtgSet').textContent=totalMtgSet;
  var totalEngaged=Object.values(AEM_EDITS).filter(function(e){return e.engaged;}).length;
  var engEl=document.getElementById('aemEngaged');if(engEl)engEl.textContent=totalEngaged;

  const impactBar=document.getElementById('aemKpiImpact');
  const impactMsg=document.getElementById('aemKpiMsg');
  if(totalContacted>0||totalMtgSet>0){
    impactBar.style.display='flex';
    impactMsg.textContent=`${totalContacted} contact(s) → KPI #1 · ${totalMtgSet} meeting(s) → KPI #2 · ${totalEngaged} engaged → KPI #6`;
  } else { impactBar.style.display='none'; }

  document.getElementById('aemBody').innerHTML=rows.map(r=>{
    const[rbg,rc]=r.region==='East'?['rgba(59,130,246,.15)','#3b82f6']:['rgba(34,197,94,.12)','#22c55e'];
    const edit=AEM_EDITS[r.name]||{contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:'',engaged:false,success:'',partner:''};
    const key=encodeURIComponent(r.name);

    const INP="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:3px 7px;font-size:11px;font-family:'DM Sans',sans-serif;width:100%;";
    const SEL="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:3px 7px;font-size:11px;font-family:'DM Sans',sans-serif;cursor:pointer;";

    // 1. Ultimate Success — Yes/No select
    const successVal = edit.success || '';
    const successSel = `<select onchange="saveAEMSuccess('${key}',this.value)" style="${SEL}">
      <option value=""${successVal===''?' selected':''}>—</option>
      <option value="Yes"${successVal==='Yes'?' selected':''}>Yes</option>
      <option value="No"${successVal==='No'?' selected':''}>No</option>
    </select>`;

    // 2. Partner — editable text input
    const partnerVal = (AEM_EDITS[r.name] && AEM_EDITS[r.name].partner !== undefined)
      ? AEM_EDITS[r.name].partner : (r.partner || '');
    const partnerInput = `<input type="text" value="${partnerVal.replace(/"/g,'&quot;')}"
      placeholder="Add partner…" onchange="saveAEMPartner('${key}',this.value)"
      style="${INP}min-width:110px;">`;

    // 3. Contacted — Yes/No select (drives KPI #1 via contactDate)
    const contVal = edit.contacted ? 'Yes' : 'No';
    const contSel = `<select onchange="setAEMContactedVal('${key}',this.value)" style="${SEL}">
      <option value="No"${!edit.contacted?' selected':''}>No</option>
      <option value="Yes"${edit.contacted?' selected':''}>Yes</option>
    </select>`;

    // 4. Contact Date — date input (always visible; clears when Contacted=No)
    const cWkKey=edit.contactDate?dateToWeekKey(edit.contactDate):null;
    const cWkLbl=cWkKey?getWk(cWkKey).lbl:(edit.contactDate?'out of range':'');
    const contDateInput = `<div style="display:flex;flex-direction:column;gap:2px;">
      <input type="date" value="${edit.contactDate||''}"
        onchange="setAEMContactDate('${key}',this.value)"
        style="${INP}min-width:120px;">
      ${cWkLbl?`<span id="clbl_${key}" style="font-size:9px;color:var(--blue);font-weight:500">${cWkLbl}</span>`:`<span id="clbl_${key}"></span>`}
    </div>`;

    // 5. Engaged — Yes/No select (drives KPI #6 via contactDate week)
    const engVal = edit.engaged ? 'Yes' : 'No';
    const engSel = `<select onchange="setAEMEngagedVal('${key}',this.value)" style="${SEL}">
      <option value="No"${!edit.engaged?' selected':''}>No</option>
      <option value="Yes"${edit.engaged?' selected':''}>Yes</option>
    </select>`;

    // 6. Meeting Scheduled — Yes/No select (drives KPI #2 via mtgDate)
    const mtgVal = edit.mtgSet ? 'Yes' : 'No';
    const mtgSel = `<select onchange="setAEMMtgVal('${key}',this.value)" style="${SEL}">
      <option value="No"${!edit.mtgSet?' selected':''}>No</option>
      <option value="Yes"${edit.mtgSet?' selected':''}>Yes</option>
    </select>`;

    // 7. Mtg Date — date input (always visible)
    const mWkKey=edit.mtgDate?dateToWeekKey(edit.mtgDate):null;
    const mWkLbl=mWkKey?getWk(mWkKey).lbl:(edit.mtgDate?'out of range':'');
    const mtgDateInput = `<div style="display:flex;flex-direction:column;gap:2px;">
      <input type="date" value="${edit.mtgDate||''}"
        onchange="setAEMMtgDate('${key}',this.value)"
        style="${INP}min-width:120px;">
      ${mWkLbl?`<span id="mlbl_${key}" style="font-size:9px;color:var(--green);font-weight:500">${mWkLbl}</span>`:`<span id="mlbl_${key}"></span>`}
    </div>`;

    // 8. Notes — always-visible text input
    const notesInput = `<input type="text" value="${(edit.notes||'').replace(/"/g,'&quot;')}"
      placeholder="Add note…" onchange="saveAEMNote2('${key}',this.value)"
      style="${INP}min-width:130px;">`;

    return`<tr>
      <td style="color:var(--text);font-weight:500;max-width:180px;white-space:normal;line-height:1.4">${r.name}</td>
      <td><span class="p-badge" style="background:${rbg};color:${rc}">${r.region}</span></td>
      <td style="white-space:nowrap;color:var(--text);font-size:11px">${r.ad}</td>
      <td style="min-width:130px">${successSel}</td>
      <td style="min-width:120px">${partnerInput}</td>
      <td style="min-width:80px;text-align:center">${contSel}</td>
      <td style="min-width:140px">${contDateInput}</td>
      <td style="min-width:80px;text-align:center">${engSel}</td>
      <td style="min-width:80px;text-align:center">${mtgSel}</td>
      <td style="min-width:140px">${mtgDateInput}</td>
      <td style="min-width:140px">${notesInput}</td>
    </tr>`;
  }).join('');
}

function saveAEMPartner(encodedName, val){
  var name = decodeURIComponent(encodedName);
  if(!AEM_EDITS[name]) AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].partner = val;
  writeAEMActivity(name);
  save();
}


function saveAEMSuccess(encodedName, val){
  var name = decodeURIComponent(encodedName);
  if(!AEM_EDITS[name]) AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].success = val;
  writeAEMActivity(name);
  save();
  renderAEM();
}

// ─── AEM POWER AUTOMATE WRITE PATH ───────────────────────────────────────────
function buildAEMPayload(name) {
  const e = AEM_EDITS[name] || {};
  const r = AEM_DATA.find(function(row){ return row.name === name; }) || {};
  return {
    name,
    contacted: e.contacted ? 'Yes' : '',
    'contact-date': e.contactDate || '',
    'mtg-set': e.mtgSet ? 'Yes' : '',
    'mtg-date': e.mtgDate || '',
    notes: e.notes || '',
    engaged: e.engaged ? 'Yes' : '',
    success: e.success !== undefined ? e.success : (r.success || ''),
    partner: e.partner !== undefined ? e.partner : (r.partner || ''),
  };
}

function showAEMWriteError(msg) {
  var bar = document.getElementById('aemWriteError');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'aemWriteError';
    bar.style = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#dc2626;color:#fff;padding:10px 18px;border-radius:8px;font-size:12px;z-index:9999;font-family:DM Sans,sans-serif;';
    document.body.appendChild(bar);
  }
  bar.textContent = '⚠ Failed to save: ' + msg;
  bar.style.display = 'block';
  setTimeout(function(){ bar.style.display = 'none'; }, 5000);
}

async function writeAEMActivity(name) {
  const url = window.LLMO_PA_URL;
  if (!url) return; // no flow configured yet
  const payload = buildAEMPayload(name);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error('Flow returned ' + resp.status);
    // Re-fetch sheet ~10s later to confirm AEM has republished
    setTimeout(async function() {
      try {
        const r = await fetch('/data.json');
        if (r.ok) {
          const json = await r.json();
          if (json['aem-customers']?.data) window.LLMO_SHEET_AEM = json['aem-customers'].data;
        }
      } catch(e) { /* silent background sync */ }
    }, 10000);
  } catch(e) {
    showAEMWriteError(e.message);
  }
}

// ─── AEM field helpers ───────────────────────────────────────────────────────
function setAEMContactedVal(key, val){
  const name=decodeURIComponent(key);
  if(!AEM_EDITS[name])AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].contacted = (val==='Yes');
  if(!AEM_EDITS[name].contacted) AEM_EDITS[name].contactDate='';
  writeAEMActivity(name);
  applyAEMToKPIs(); save(); renderAEM(); renderKPI(); renderCatchup(); renderTable(); syncKPI67();
}

function setAEMEngagedVal(key, val){
  const name=decodeURIComponent(key);
  if(!AEM_EDITS[name])AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].engaged = (val==='Yes');
  writeAEMActivity(name);
  save(); renderAEM(); syncKPI67();
}

function setAEMMtgVal(key, val){
  const name=decodeURIComponent(key);
  if(!AEM_EDITS[name])AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].mtgSet = (val==='Yes');
  if(!AEM_EDITS[name].mtgSet){
    AEM_EDITS[name].mtgDate='';
    if(MTG_LIVE) MTG_LIVE=MTG_LIVE.filter(m=>m._aemSource!==name);
  }
  writeAEMActivity(name);
  applyAEMToKPIs(); save(); renderAEM(); renderMeetings(); renderKPI(); renderCatchup(); renderTable();
}

// saveAEMNote2: always-visible input version (replaces click-to-edit span)
function saveAEMNote2(key, val){
  const name=decodeURIComponent(key);
  if(!AEM_EDITS[name])AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].notes=val;
  writeAEMActivity(name);
  save();
}



function toggleAEMContact(key){
  const name=decodeURIComponent(key);
  if(!AEM_EDITS[name])AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].contacted=!AEM_EDITS[name].contacted;
  if(!AEM_EDITS[name].contacted) AEM_EDITS[name].contactDate=''; // clear date when un-marking
  writeAEMActivity(name);
  applyAEMToKPIs(); save(); renderAEM(); renderKPI(); renderCatchup(); renderTable(); syncKPI67();
}

function toggleAEMEngaged(encodedName){
  var name = decodeURIComponent(encodedName);
  if(!AEM_EDITS[name]) AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].engaged = !AEM_EDITS[name].engaged;
  writeAEMActivity(name);
  save(); renderAEM(); syncKPI67();
}


function setAEMContactDate(key, val){
  const name=decodeURIComponent(key);
  if(!AEM_EDITS[name])AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].contactDate=val;
  // Update the inline week label without re-rendering whole table
  const wkKey=dateToWeekKey(val);
  const lbl=wkKey ? getWk(wkKey).lbl : (val?'out of range':'');
  const span=document.getElementById('clbl_'+key);
  if(span) span.textContent=lbl;
  // Switch dial week to show the update
  if(wkKey){ DIAL_WK=wkKey; const s=document.getElementById('dialWkSel'); if(s)s.value=wkKey; }
  writeAEMActivity(name);
  applyAEMToKPIs(); save(); renderKPI(); renderCatchup(); renderTable(); renderDials(); populateSelects();
}

function toggleAEMMtg(key){
  const name=decodeURIComponent(key);
  if(!AEM_EDITS[name])AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].mtgSet=!AEM_EDITS[name].mtgSet;
  if(!AEM_EDITS[name].mtgSet){
    AEM_EDITS[name].mtgDate='';
    // Remove auto-created meeting entry for this account
    if(MTG_LIVE) MTG_LIVE=MTG_LIVE.filter(m=>m._aemSource!==name);
  }
  writeAEMActivity(name);
  applyAEMToKPIs(); save(); renderAEM(); renderMeetings(); renderKPI(); renderCatchup(); renderTable();
}

function setAEMMtgDate(key, val){
  const name=decodeURIComponent(key);
  if(!AEM_EDITS[name])AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].mtgDate=val;
  // Look up account info from AEM_DATA (avoids passing problematic strings via HTML)
  const aemRow=AEM_DATA.find(r=>r.name===name)||{};
  // Update the inline week label without re-rendering whole table
  const wkKey=dateToWeekKey(val);
  const lbl=wkKey ? getWk(wkKey).lbl : (val?'out of range':'');
  const span=document.getElementById('mlbl_'+key);
  if(span) span.textContent=lbl;
  // Create or update the auto-entry in MTG_LIVE
  if(!MTG_LIVE) MTG_LIVE=[...MTG_DATA.map(r=>({...r}))];
  const existing=MTG_LIVE.findIndex(m=>m._aemSource===name);
  const dateDisp=fmtDateDisplay(val);
  if(existing>=0){
    MTG_LIVE[existing].date=dateDisp;
  } else {
    MTG_LIVE.push({
      name:'(TBD — update in Meeting Tracker)',
      title:'',
      account:aemRow.name||name,
      source:'AEM Customers',
      ad:aemRow.ad||'',
      status:'Scheduled',
      date:dateDisp,
      notes:'Auto-created from AEM Customers panel',
      _aemSource:name
    });
  }
  // Switch dial week to show the update
  if(wkKey){ DIAL_WK=wkKey; const s=document.getElementById('dialWkSel'); if(s)s.value=wkKey; }
  writeAEMActivity(name);
  applyAEMToKPIs(); save(); renderMeetings(); renderKPI(); renderCatchup(); renderTable(); renderDials(); populateSelects();
}

function editAEMNote(key,el){
  const name=decodeURIComponent(key);
  if(!AEM_EDITS[name])AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  const cur=AEM_EDITS[name].notes||'';
  el.outerHTML=`<input class="note-input" value="${cur.replace(/"/g,'&quot;')}" onblur="saveAEMNote('${key}',this)" onkeydown="if(event.key==='Enter')this.blur()" autofocus>`;
}
function saveAEMNote(key,input){
  const name=decodeURIComponent(key);
  if(!AEM_EDITS[name])AEM_EDITS[name]={contacted:false,contactDate:'',mtgSet:false,mtgDate:'',notes:''};
  AEM_EDITS[name].notes=input.value;
  writeAEMActivity(name);
  save(); renderAEM();
}

function renderMeetings(){
  if(!MTG_LIVE) MTG_LIVE=[...MTG_DATA.map(r=>({...r}))];
  const q=(document.getElementById('mtgSearch')||{}).value||'';
  let rows=MTG_LIVE.filter(r=>!q||[r.name,r.account,r.ad].join(' ').toLowerCase().includes(q.toLowerCase()));
  rows.sort((a,b)=>{const av=a[mtgSort.col]||'',bv=b[mtgSort.col]||'';if(mtgSort.col==='date'){return(new Date(a.date)-new Date(b.date))*mtgSort.dir;}return av>bv?mtgSort.dir:av<bv?-mtgSort.dir:0;});
  const conf=MTG_LIVE.filter(r=>r.status==='Confirmed').length;
  const prog=MTG_LIVE.filter(r=>r.status==='In-Progress'||r.status==='Scheduled').length;
  document.getElementById('mtgTotal').textContent=MTG_LIVE.length;
  document.getElementById('mtgConf').textContent=conf;
  document.getElementById('mtgProg').textContent=prog;
  document.getElementById('mtgBody').innerHTML=rows.map((r,i)=>{
    const idx=MTG_LIVE.indexOf(r);
    const isAEM=!!r._aemSource;
    const aemTag=isAEM?`<span style="font-size:8px;background:rgba(37,99,235,.12);color:#1d4ed8;border-radius:8px;padding:1px 5px;margin-left:4px">AEM</span>`:'';
    // Editable cells: Name, Title, Account, AD, Status, Date
    function editCell(field,curVal,inputStyle){
      return `<span class="note-cell" style="color:var(--text)" onclick="editMtgCell(${idx},'${field}',this,'${inputStyle||''}')" title="Click to edit">${curVal||'<em style=color:var(--dim)>edit...</em>'}</span>`;
    }
    const statusOpts=['Confirmed','In-Progress','Scheduled','Completed'].map(s=>`<option${s===r.status?' selected':''}>${s}</option>`).join('');
    return`<tr>
      <td style="white-space:nowrap">${editCell('name',r.name,'')}${aemTag}</td>
      <td style="font-size:10px;white-space:nowrap">${editCell('title',r.title,'width:100px')}</td>
      <td style="white-space:nowrap">${editCell('account',r.account,'width:160px')}</td>
      <td style="white-space:nowrap">${editCell('ad',r.ad,'width:100px')}</td>
      <td><select onchange="updateMtgField(${idx},'status',this.value)" style="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:2px 6px;font-size:10px;font-family:'DM Sans',sans-serif;cursor:pointer">${statusOpts}</select></td>
      <td style="font-family:'DM Mono',monospace;white-space:nowrap;font-size:10px">${editCell('date',r.date,'width:90px')}</td>
      <td style="font-size:10px;max-width:150px;white-space:normal">${editCell('notes',r.notes,'width:130px')}</td>
      <td style="text-align:center"><button onclick="removeMeeting(${idx})" style="background:rgba(220,38,38,.1);color:#dc2626;border:none;border-radius:5px;padding:3px 8px;font-size:10px;cursor:pointer;font-family:'DM Sans',sans-serif">✕</button></td>
    </tr>`;
  }).join('');
}

function addMeeting(){
  if(!MTG_LIVE) MTG_LIVE=[...MTG_DATA.map(r=>({...r}))];
  const name=document.getElementById('mf_name').value.trim();
  const account=document.getElementById('mf_account').value.trim();
  if(!name||!account){alert('Name and Account are required.');return;}
  MTG_LIVE.push({
    name, title:document.getElementById('mf_title').value.trim(),
    account, source:document.getElementById('mf_source').value.trim(),
    ad:document.getElementById('mf_ad').value.trim(),
    status:document.getElementById('mf_status').value,
    date:document.getElementById('mf_date').value.trim(),
    notes:document.getElementById('mf_notes').value.trim()
  });
  save();
  ['mf_name','mf_title','mf_account','mf_source','mf_ad','mf_date','mf_notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('mf_status').value='Confirmed';
  renderMeetings();
}

function removeMeeting(idx){
  if(!confirm('Remove this meeting entry?'))return;
  MTG_LIVE.splice(idx,1);
  save(); renderMeetings();
}

function editMtgCell(idx,field,el,inputStyle){
  const cur=(MTG_LIVE[idx]||{})[field]||'';
  el.outerHTML=`<input class="note-input" style="${inputStyle}" value="${String(cur).replace(/"/g,'&quot;')}"
    onblur="saveMtgCell(${idx},'${field}',this)"
    onkeydown="if(event.key==='Enter')this.blur()" autofocus>`;
}
function saveMtgCell(idx,field,input){
  if(!MTG_LIVE[idx]) return;
  MTG_LIVE[idx][field]=input.value;
  save(); renderMeetings();
}
function updateMtgField(idx,field,val){
  if(!MTG_LIVE[idx]) return;
  MTG_LIVE[idx][field]=val;
  save();
}
function editMtgCell(idx,field,el,inputStyle){
  const cur=(MTG_LIVE[idx]||{})[field]||'';
  el.outerHTML=`<input class="note-input" style="${inputStyle}" value="${String(cur).replace(/"/g,'&quot;')}"
    onblur="saveMtgCell(${idx},'${field}',this)"
    onkeydown="if(event.key==='Enter')this.blur()" autofocus>`;
}
function saveMtgCell(idx,field,input){
  if(!MTG_LIVE[idx]) return;
  MTG_LIVE[idx][field]=input.value;
  save(); renderMeetings();
}
function updateMtgField(idx,field,val){
  if(!MTG_LIVE[idx]) return;
  MTG_LIVE[idx][field]=val;
  save();
}
function toggleMtgForm(){
  const f=document.getElementById('mtgAddForm');
  f.style.display=f.style.display==='none'?'block':'none';
}

function renderComp(){
  document.getElementById('compBody').innerHTML=COMP_DATA.map(r=>`<tr><td>${r.f}</td>${compCell(r.a,true)}${compCell(r.s,false)}${compCell(r.se,false)}${compCell(r.p,false)}${compCell(r.pe,false)}</tr>`).join('');
}

function sortTbl(tbl,col){
  if(tbl==='tgt'){tgtSort.dir=tgtSort.col===col?-tgtSort.dir:-1;tgtSort.col=col;renderTargets();}
  if(tbl==='aem'){aemSort.dir=aemSort.col===col?-aemSort.dir:1;aemSort.col=col;renderAEM();}
  if(tbl==='mtg'){mtgSort.dir=mtgSort.col===col?-mtgSort.dir:-1;mtgSort.col=col;renderMeetings();}
}

// ═══════════════════════════════════════════════════════════
// PANEL OPEN / CLOSE
// ═══════════════════════════════════════════════════════════
// slide-panel keys -> HTML IDs
const SLIDE_MAP={Meetings:'panelMeetings',BDR:'panelBDR',GR:'panelGR'};

function openPanel(which){
  // Close all old-style panels
  closeAllPanels();
  // Close all slide panels
  ['panelMeetings','panelBDR','panelGR'].forEach(function(id){var e=document.getElementById(id);if(e)e.classList.remove('open');});
  var ovBg=document.getElementById('overlayBg');if(ovBg)ovBg.classList.remove('visible');

  if(SLIDE_MAP[which]){
    // New right-side slide panel
    var sp=document.getElementById(SLIDE_MAP[which]);
    if(sp){sp.classList.add('open');if(ovBg)ovBg.classList.add('visible');document.body.style.overflow='hidden';}
    if(which==='Meetings')renderSalesActivity();
    if(which==='BDR')renderBDR();
    if(which==='GR')renderGR();
  } else {
    // Old left-side panel
    const el=document.getElementById('p'+which);
    if(el){el.classList.add('open');document.getElementById('overlay').classList.add('on');}
    if(which==='Targets')renderTargets();
    if(which==='AEM')renderAEM();
    if(which==='Comp')renderComp();
    if(which==='Pursuit')renderPursuit();
  }
}
function closeAllPanels(){
  ['pTargets','pAEM','pMeetings','pComp','pPursuit'].forEach(function(id){var el=document.getElementById(id);if(el)el.classList.remove('open');});
  var ov=document.getElementById('overlay');if(ov)ov.classList.remove('on');
  // Also close slide panels
  ['panelMeetings','panelBDR','panelGR'].forEach(function(id){var e=document.getElementById(id);if(e)e.classList.remove('open');});
  var ovBg=document.getElementById('overlayBg');if(ovBg)ovBg.classList.remove('visible');
  document.body.style.overflow='';
}
function closeSlidePanel(){
  ['panelMeetings','panelBDR','panelGR'].forEach(function(id){var e=document.getElementById(id);if(e)e.classList.remove('open');});
  var ovBg=document.getElementById('overlayBg');if(ovBg)ovBg.classList.remove('visible');
  document.body.style.overflow='';
}

// ═══════════════════════════════════════════════════════════
// AI PANEL
// ═══════════════════════════════════════════════════════════
function toggleAI(){document.getElementById('aiPanel').classList.toggle('open');}
function setAIStatus(t,m){const el=document.getElementById('aiStatus');el.className='ai-status '+t;el.textContent=m;}

async function runAI(){
  const key=window.LLMO_API_KEY;
  if(!key){showKeyModal();return;}
  const input=document.getElementById('aiInput').value.trim();
  if(!input){setAIStatus('error','Please describe this week\'s numbers first.');return;}
  const wk=document.getElementById('aiWkSel').value;
  const wo=getWk(wk);
  const btn=document.getElementById('aiBtn');
  btn.disabled=true;btn.textContent='Parsing with AI...';
  setAIStatus('loading','⏳ Claude is reading your update...');
  const SYS=`Extract KPI numbers from the user's weekly update. Return ONLY valid JSON with these keys (null for missing):
{"kpi1_actual":number|null,"kpi1_bdr":number|null,"kpi1_carahsoft":number|null,"kpi1_ads":number|null,"kpi1_partners":number|null,"kpi2_actual":number|null,"kpi2_bdr":number|null,"kpi2_carahsoft":number|null,"kpi2_ads":number|null,"kpi2_partners":number|null,"kpi3_actual":number|null,"kpi4_actual":number|null}
kpi1=accounts outreached. kpi2=meetings scheduled. kpi3=pipeline dollars (convert K/M). kpi4=partner-sourced meetings. No markdown, no explanation.`;
  try{
    const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:400,system:SYS,messages:[{role:'user',content:input}]})});
    if(!resp.ok){const e=await resp.json();throw new Error(e.error?.message||'API error '+resp.status);}
    const json=await resp.json();
    const p=JSON.parse(json.content[0].text.trim());
    const d=DATA[wk];
    const set=(obj,k,pk)=>{if(p[pk]!==null&&p[pk]!==undefined)obj[k]=p[pk];};
    set(d.kpi1,'actual','kpi1_actual');set(d.kpi1,'bdr','kpi1_bdr');set(d.kpi1,'carahsoft','kpi1_carahsoft');set(d.kpi1,'ads','kpi1_ads');set(d.kpi1,'partners','kpi1_partners');
    set(d.kpi2,'actual','kpi2_actual');set(d.kpi2,'bdr','kpi2_bdr');set(d.kpi2,'carahsoft','kpi2_carahsoft');set(d.kpi2,'ads','kpi2_ads');set(d.kpi2,'partners','kpi2_partners');
    set(d.kpi3,'actual','kpi3_actual');set(d.kpi4,'actual','kpi4_actual');
    DIAL_WK=wk; ensureBaseActuals(); syncBaseActuals(wk); save(); renderAll();
    const updates=[];
    if(p.kpi1_actual!==null)updates.push(`KPI1: ${p.kpi1_actual} accounts`);
    if(p.kpi2_actual!==null)updates.push(`KPI2: ${p.kpi2_actual} meetings`);
    if(p.kpi3_actual!==null)updates.push(`KPI3: ${fmtM(p.kpi3_actual)} pipeline`);
    if(p.kpi4_actual!==null)updates.push(`KPI4: ${p.kpi4_actual} partner meetings`);
    setAIStatus('success','✓ '+wo.lbl+' updated — '+(updates.join(' · ')||'no values found'));
    document.getElementById('aiInput').value='';
  }catch(e){setAIStatus('error','✗ '+e.message);}
  finally{btn.disabled=false;btn.textContent='Parse & Update Dashboard →';}
}

function applyManual(){
  const wk=document.getElementById('aiWkSel').value, wo=getWk(wk), d=DATA[wk];
  const g=id=>{const v=document.getElementById(id).value;return v===''?null:Number(v);};
  const set=(obj,k,val)=>{if(val!==null)obj[k]=val;};
  set(d.kpi1,'actual',g('m1a'));set(d.kpi1,'bdr',g('m1b'));set(d.kpi1,'carahsoft',g('m1c'));set(d.kpi1,'ads',g('m1d'));
  set(d.kpi2,'actual',g('m2a'));set(d.kpi2,'bdr',g('m2b'));set(d.kpi2,'carahsoft',g('m2c'));set(d.kpi2,'ads',g('m2d'));
  set(d.kpi3,'actual',g('m3a'));set(d.kpi4,'actual',g('m4a'));
  DIAL_WK=wk; ensureBaseActuals(); syncBaseActuals(wk); save(); renderAll();
  setAIStatus('success','✓ Manual update applied for '+wo.lbl);
}

// ═══════════════════════════════════════════════════════════
// API KEY
// ═══════════════════════════════════════════════════════════
function saveKey(){
  const k=document.getElementById('apiKeyInput').value.trim();
  if(!k.startsWith('sk-ant')){alert('Please enter a valid Anthropic API key starting with sk-ant...');return;}
  localStorage.setItem('llmo_key',k);
  document.getElementById('apiModal').classList.remove('on');
}
function showKeyModal(){
  document.getElementById('apiModal').classList.add('on');
  document.getElementById('apiKeyInput').value=localStorage.getItem('llmo_key')||'';
}

// ═══════════════════════════════════════════════════════════
// PUBLISH SNAPSHOT
// ═══════════════════════════════════════════════════════════
function publishSnapshot(){
  const SE='<'+'/script>';
  const pub=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const d=DATA[DIAL_WK], wo=getWk(DIAL_WK);
  const cu=calcCatchup(DIAL_WK);

  // Pre-render all sections as static HTML strings
  function kpiHTML(){
    const cfgs=[{cls:'kpi1',lbl:'KPI #1',color:'#3b82f6',title:'Accounts Outreached',a:d.kpi1.actual,t:d.kpi1.target},{cls:'kpi2',lbl:'KPI #2',color:'#22c55e',title:'Scheduled Meetings',a:d.kpi2.actual,t:d.kpi2.target},{cls:'kpi3',lbl:'KPI #3',color:'#f59e0b',title:'Net New SS3 Pipeline',a:d.kpi3.actual,t:d.kpi3.target,money:true},{cls:'kpi4',lbl:'KPI #4',color:'#a855f7',title:'Partner-Sourced Meetings',a:d.kpi4.actual,t:d.kpi4.target}];
    return cfgs.map(c=>{const p=pct(c.a,c.t);const av=c.a===null?'—':(c.money?fmtM(c.a):c.a);const tv=c.money?fmtM(c.t):c.t;return`<div class="kpi-card ${c.cls}"><div class="kpi-top"><div class="kpi-lbl">${c.lbl}</div><div class="kpi-badge ${badgeCls(p)}">${badgeTxt(p)}</div></div><div class="kpi-val" style="color:${c.color}">${av}</div><div class="kpi-target">Target: <span>${tv}</span></div><div class="kpi-title">${c.title}</div><div class="prog-bar"><div class="prog-fill" style="width:${Math.min(p||0,100)}%;background:${c.color}"></div></div></div>`;}).join('');
  }

  function catchupHTML(){
    if(!cu)return'<div style="grid-column:1/-1;padding:16px;text-align:center;color:#8a8f99;font-size:12px">Final week — no remaining weeks.</div>';
    const cards=[
      {kpi:'KPI #1',color:'#3b82f6',gap:cu.k1gap,gapFmt:cu.k1gap>0?'-'+cu.k1gap:'+'+Math.abs(cu.k1gap),rows:[{l:'Actual',v:fmtN(d.kpi1.actual)},{l:'Weekly target',v:KPI1_WK_TGT},{l:'Weeks left',v:cu.rem}],need:Math.ceil(cu.k1needed),needFmt:Math.ceil(cu.k1needed)+' / wk',sub:cu.k1needed>KPI1_WK_TGT?'+'+Math.ceil(cu.k1needed-KPI1_WK_TGT)+' above target':'On pace — keep going!'},
      {kpi:'KPI #2',color:'#22c55e',gap:cu.k2gap,gapFmt:cu.k2gap>0?'-'+cu.k2gap:'+'+Math.abs(cu.k2gap),rows:[{l:'Actual',v:fmtN(d.kpi2.actual)},{l:'Weekly target',v:KPI2_WK_TGT},{l:'Weeks left',v:cu.rem}],need:Math.ceil(cu.k2needed),needFmt:Math.ceil(cu.k2needed)+' / wk',sub:cu.k2needed>KPI2_WK_TGT?'+'+Math.ceil(cu.k2needed-KPI2_WK_TGT)+' above target':'On pace — keep going!'},
      {kpi:'KPI #3',color:'#f59e0b',gap:cu.k3gap,gapFmt:cu.k3gap>0?'-'+fmtM(cu.k3gap):'+'+fmtM(Math.abs(cu.k3gap)),rows:[{l:'Actual',v:fmtM(d.kpi3.actual)},{l:'Weekly target',v:fmtM(KPI3_WK_TGT)},{l:'Weeks left',v:cu.rem}],need:Math.ceil(cu.k3needed),needFmt:fmtM(Math.ceil(cu.k3needed))+' / wk',sub:cu.k3needed>KPI3_WK_TGT?'+'+fmtM(Math.ceil(cu.k3needed-KPI3_WK_TGT))+' above target':'On pace — keep going!'},
      {kpi:'KPI #4',color:'#a855f7',gap:cu.k4left,gapFmt:'-'+cu.k4left+' remaining',rows:[{l:'Q2 target',v:KPI4_Q2_TGT},{l:'Actual',v:fmtN(d.kpi4.actual)},{l:'Weeks left',v:cu.rem}],need:cu.k4needed.toFixed(1),needFmt:cu.k4needed.toFixed(1)+' / wk',sub:cu.k4left+' meetings left to source'},
    ];
    return cards.map(c=>`<div class="catchup-card"><div class="cu-header"><div class="cu-kpi">${c.kpi}</div><div class="cu-gap-badge">${c.gapFmt}</div></div>${c.rows.map(r=>`<div class="cu-row"><div class="cu-rowlbl">${r.l}</div><div class="cu-rowval">${r.v}</div></div>`).join('')}<div class="cu-catchup"><div class="cu-catchup-lbl">Avg needed / week</div><div class="cu-catchup-val" style="color:${c.color}">${c.needFmt}</div><div class="cu-catchup-sub">${c.sub}</div></div></div>`).join('');
  }

  function ecoHTML(){
    const nn=v=>v===null?'—':String(v);
    return`<div class="eco-card"><div class="eco-title">KPI #1 · Accounts</div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#6366f1"></span>BDR</div><div class="eco-val" style="color:#6366f1">${nn(d.kpi1.bdr)}</div></div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#f59e0b"></span>Carahsoft</div><div class="eco-val" style="color:#f59e0b">${nn(d.kpi1.carahsoft)}</div></div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#22c55e"></span>ADs</div><div class="eco-val" style="color:#22c55e">${nn(d.kpi1.ads)}</div></div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#a855f7"></span>Partners</div><div class="eco-val" style="color:#a855f7">${nn(d.kpi1.partners)}</div></div></div><div class="eco-card"><div class="eco-title">KPI #2 · Meetings</div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#6366f1"></span>BDR</div><div class="eco-val" style="color:#6366f1">${nn(d.kpi2.bdr)}</div></div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#f59e0b"></span>Carahsoft</div><div class="eco-val" style="color:#f59e0b">${nn(d.kpi2.carahsoft)}</div></div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#22c55e"></span>ADs</div><div class="eco-val" style="color:#22c55e">${nn(d.kpi2.ads)}</div></div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#a855f7"></span>Partners</div><div class="eco-val" style="color:#a855f7">${nn(d.kpi2.partners)}</div></div></div><div class="eco-card"><div class="eco-title">KPI #4 · Partner Meetings</div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#a855f7"></span>Actual</div><div class="eco-val" style="color:#a855f7">${nn(d.kpi4.actual)}</div></div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#4a4f5a"></span>Q2 Target</div><div class="eco-val" style="color:#8a8f99">${d.kpi4.target}</div></div></div><div class="eco-card"><div class="eco-title">Q2 Overall Targets</div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#3b82f6"></span># of Meetings</div><div class="eco-val" style="color:#3b82f6">244</div></div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#f59e0b"></span># of SS3 Opps</div><div class="eco-val" style="color:#f59e0b">80</div></div><div class="eco-row"><div class="eco-member"><span class="eco-dot" style="background:#22c55e"></span>Stage 3 Pipeline</div><div class="eco-val" style="color:#22c55e">$6.0M</div></div></div>`;
  }

  function tableHTML(){
    let h='<thead><tr><th style="min-width:190px">KPI / Metric</th>';
    WEEKS.forEach(w=>h+=`<th class="${w.key===DIAL_WK?'wk-active':''}">${w.date}<br><span style="font-weight:400;font-size:8px;text-transform:none">${w.lbl}</span></th>`);
    h+='</tr></thead><tbody>';
    const rows=[{s:'KPI #1 — Accounts Outreached'},{l:'↳ Target',f:dd=>dd.kpi1.target,dim:true},{l:'↳ Actual',f:dd=>dd.kpi1.actual,clr:'#fa0f00'},{l:'· BDR',f:dd=>dd.kpi1.bdr,clr:'#6366f1',i:true},{l:'· Carahsoft',f:dd=>dd.kpi1.carahsoft,clr:null,i:true},{l:'· ADs',f:dd=>dd.kpi1.ads,clr:'#22c55e',i:true},{l:'· Partners',f:dd=>dd.kpi1.partners,clr:'#a855f7',i:true},{s:'KPI #2 — Scheduled Meetings'},{l:'↳ Target',f:dd=>dd.kpi2.target,dim:true},{l:'↳ Actual',f:dd=>dd.kpi2.actual,clr:'#22c55e'},{l:'· BDR',f:dd=>dd.kpi2.bdr,clr:'#6366f1',i:true},{l:'· Carahsoft',f:dd=>dd.kpi2.carahsoft,clr:null,i:true},{l:'· ADs',f:dd=>dd.kpi2.ads,clr:'#22c55e',i:true},{l:'· Partners',f:dd=>dd.kpi2.partners,clr:'#a855f7',i:true},{s:'KPI #3 — Net New SS3 Pipeline'},{l:'↳ Target',f:dd=>dd.kpi3.target,dim:true,money:true},{l:'↳ Actual',f:dd=>dd.kpi3.actual,clr:'#f59e0b',money:true},{s:'KPI #4 — Partner-Sourced Meetings'},{l:'↳ Target Q2',f:dd=>dd.kpi4.target,dim:true},{l:'↳ Actual',f:dd=>dd.kpi4.actual,clr:'#a855f7'}];
    rows.forEach(r=>{if(r.s){h+=`<tr><td colspan="${WEEKS.length+1}" class="sec-hdr">${r.s}</td></tr>`;return;}const ist=r.i?'padding-left:18px;color:#8a8f99;':'';const dmt=r.dim?'color:#4a4f5a;':'';h+=`<tr><td class="row-lbl" style="${ist}${dmt}">${r.l}</td>`;WEEKS.forEach(w=>{const v=r.f(DATA[w.key]);if(v===null||v===undefined){h+='<td class="val-empty">—</td>';return;}const disp=r.money?fmtM(v):v;const cs=r.dim?'color:#4a4f5a;':(r.clr?`color:${r.clr};`:'');h+=`<td style="${cs}">${disp}</td>`;});h+='</tr>';});
    return h+'</tbody>';
  }

  function tgtPanelHTML(){
    return TGT_DATA.map(r=>{const lo=r.owner.toLowerCase();const[bg,cl]=lo.includes('ad')?['rgba(59,130,246,.15)','#3b82f6']:lo.includes('bdr')?['rgba(99,102,241,.15)','#818cf8']:['rgba(245,158,11,.15)','#f59e0b'];return`<tr><td style="color:#f0f2f5;font-weight:500">${r.segment}</td><td style="color:#3b82f6;font-family:DM Mono,monospace">${r.accounts}</td><td style="color:#22c55e;font-family:DM Mono,monospace">${fmtM(r.tam)}</td><td><span style="display:inline-block;font-size:9px;font-weight:500;padding:2px 7px;border-radius:9px;background:${bg};color:${cl}">${r.owner}</span></td><td style="font-size:10px;color:#4a4f5a">${r.launch}</td></tr>`;}).join('');
  }

  function aemPanelHTML(){
    return AEM_DATA.map(r=>{const[rbg,rc]=r.region==='East'?['rgba(59,130,246,.15)','#3b82f6']:['rgba(34,197,94,.12)','#22c55e'];return`<tr><td style="color:#f0f2f5;font-weight:500;max-width:240px;white-space:normal;line-height:1.4">${r.name}</td><td><span style="display:inline-block;font-size:9px;font-weight:500;padding:2px 7px;border-radius:9px;background:${rbg};color:${rc}">${r.region}</span></td><td style="white-space:nowrap;color:#f0f2f5">${r.ad}</td><td style="font-size:10px;color:#8a8f99">${r.partner||'—'}</td><td>${r.success==='Yes'?'<span style="display:inline-block;font-size:9px;font-weight:500;padding:2px 7px;border-radius:9px;background:rgba(34,197,94,.15);color:#22c55e">✓ Yes</span>':'<span style="color:#4a4f5a;font-size:10px">—</span>'}</td></tr>`;}).join('');
  }

  function mtgPanelHTML(){
    return MTG_DATA.map(r=>{const[bg,cl]=r.status==='Confirmed'?['rgba(34,197,94,.15)','#22c55e']:['rgba(245,158,11,.15)','#f59e0b'];return`<tr><td style="color:#f0f2f5;font-weight:500;white-space:nowrap">${r.name}</td><td style="font-size:10px;white-space:nowrap">${r.title}</td><td style="white-space:nowrap">${r.account}</td><td style="white-space:nowrap;color:#f0f2f5">${r.ad}</td><td><span style="display:inline-block;font-size:9px;font-weight:500;padding:2px 7px;border-radius:9px;background:${bg};color:${cl}">${r.status}</span></td><td style="font-family:DM Mono,monospace;white-space:nowrap;font-size:10px">${r.date}</td><td style="font-size:10px;max-width:160px;white-space:normal">${r.notes}</td></tr>`;}).join('');
  }

  function compPanelHTML(){
    return COMP_DATA.map(r=>{
      function cc(v,isA){if(v==='check')return`<td style="text-align:center"><span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:#22c55e;border-radius:4px;font-size:10px;color:#fff">✓</span></td>`;const m={Strong:{bg:'rgba(250,15,0,.15)',cl:'#fa0f00',fw:'600'},Yes:{bg:'rgba(250,15,0,.15)',cl:'#fa0f00',fw:'600'},Moderate:{bg:'rgba(245,158,11,.12)',cl:'#f59e0b',fw:'400'},Partial:{bg:'rgba(245,158,11,.12)',cl:'#f59e0b',fw:'400'},Basic:{bg:'rgba(255,255,255,.06)',cl:'#8a8f99',fw:'400'},Limited:{bg:'rgba(239,68,68,.1)',cl:'#ef4444',fw:'400'},Weak:{bg:'rgba(239,68,68,.1)',cl:'#ef4444',fw:'400'},Lighter:{bg:'rgba(239,68,68,.1)',cl:'#ef4444',fw:'400'},No:{bg:'rgba(239,68,68,.15)',cl:'#ef4444',fw:'600'}};const s=m[v]||{bg:'rgba(255,255,255,.06)',cl:'#8a8f99',fw:'400'};const br=isA?'border:1px solid rgba(250,15,0,.3);':'';return`<td style="text-align:center"><span style="display:inline-block;font-size:10px;font-weight:${s.fw};padding:2px 8px;border-radius:9px;background:${s.bg};color:${s.cl};${br}">${v}</span></td>`;}
      return`<tr><td style="color:#f0f2f5;font-weight:500;font-size:12px;line-height:1.4">${r.f}</td>${cc(r.a,true)}${cc(r.s,false)}${cc(r.se,false)}${cc(r.p,false)}${cc(r.pe,false)}</tr>`;
    }).join('');
  }

  const chartData=JSON.stringify({k1t:d.kpi1.target,k1a:d.kpi1.actual||0,k2t:d.kpi2.target,k2a:d.kpi2.actual||0,k3t:d.kpi3.target,k3a:d.kpi3.actual||0,wk:wo.lbl});
  const dialData=JSON.stringify([{kpi:'KPI #1',title:'Accounts Outreached',max:100,red:50,yellow:70,val:d.kpi1.actual,money:false},{kpi:'KPI #2',title:'Meetings',max:30,red:10,yellow:20,val:d.kpi2.actual,money:false},{kpi:'KPI #3',title:'Net New SS3 Pipeline',max:700000,red:500000,yellow:585000,val:d.kpi3.actual,money:true},{kpi:'KPI #4',title:'Partner-Sourced Mtgs',max:35,red:10,yellow:25,val:d.kpi4.actual,money:false}]);

  const html=`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Adobe LLMO Dashboard · ${pub}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js">${SE}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--red:#E8200E;--bg:#f0f2f7;--card:#ffffff;--card2:#f7f8fb;--border:rgba(0,0,0,.09);--border-red:rgba(232,32,14,.3);--text:#1a1d27;--muted:#5c6173;--dim:#9ca3b0;--green:#16a34a;--amber:#d97706;--blue:#2563eb;--purple:#7c3aed;--r:10px;--rl:14px;}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;}
.hdr{background:var(--card);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200;gap:10px;flex-wrap:wrap;}
.hdr-left{display:flex;align-items:center;gap:11px;}
.logo{width:30px;height:30px;background:var(--red);border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.logo svg{width:17px;height:17px;}
.hdr-title{font-size:13px;font-weight:600;}
.hdr-sub{font-size:10px;color:var(--muted);margin-top:1px;}
.snap-badge{font-size:10px;background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.25);border-radius:20px;padding:3px 10px;}
.ro-bar{background:rgba(37,99,235,.06);border-bottom:1px solid rgba(37,99,235,.12);padding:7px 24px;font-size:11px;color:#1d4ed8;text-align:center;}
.pill{font-size:10px;background:var(--card2);border:1px solid var(--border);border-radius:20px;padding:3px 9px;cursor:pointer;font-family:'DM Sans',sans-serif;}
.pill:hover{border-color:rgba(255,255,255,.2);}
.main{padding:20px 24px;max-width:1300px;margin:0 auto;}
.sec-lbl{font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;display:flex;align-items:center;gap:10px;}
.sec-lbl::after{content:'';flex:1;height:1px;background:var(--border);}
.banner{background:linear-gradient(135deg,#fff5f5 0%,#fef2f2 100%);border:1px solid var(--border-red);border-radius:var(--rl);padding:18px 24px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:18px;}
.banner h2{font-size:15px;font-weight:600;letter-spacing:-.3px;}.banner h2 span{color:var(--red);}
.banner p{font-size:11px;color:var(--muted);margin-top:3px;}
.tam-row{display:flex;gap:20px;flex-shrink:0;}.tam-item{text-align:right;}
.tam-val{font-family:'DM Mono',monospace;font-size:16px;font-weight:500;}.tam-lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:1px;}
.pain-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;}
.pain-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:13px 15px;display:flex;align-items:flex-start;gap:10px;}
.pain-icon{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;}
.pain-label{font-size:12px;font-weight:500;}.pain-desc{font-size:10px;color:var(--muted);margin-top:2px;line-height:1.4;}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
.kpi-card{background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:16px;position:relative;overflow:hidden;}
.kpi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
.kpi1::before{background:var(--blue)}.kpi2::before{background:var(--green)}.kpi3::before{background:var(--amber)}.kpi4::before{background:var(--purple)}.kpi5::before{background:#0ea5e9}.kpi6::before{background:#f97316}.kpi7::before{background:#0ea5e9}
.kpi-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:11px;}
.kpi-lbl{font-size:9px;font-weight:500;color:var(--dim);text-transform:uppercase;letter-spacing:.8px;}
.kpi-badge{font-size:9px;font-weight:500;padding:2px 6px;border-radius:20px;font-family:'DM Mono',monospace;}
.b-low{background:rgba(220,38,38,.12);color:#dc2626}.b-ok{background:rgba(217,119,6,.12);color:#b45309}.b-good{background:rgba(22,163,74,.12);color:#15803d}
.kpi-val{font-family:'DM Mono',monospace;font-size:26px;font-weight:500;letter-spacing:-1px;}
.kpi-target{font-size:10px;color:var(--muted);margin-top:2px;}.kpi-target span{color:var(--text);font-weight:500;}
.kpi-title{font-size:11px;color:var(--muted);margin-top:7px;}
.prog-bar{height:3px;background:rgba(0,0,0,.08);border-radius:2px;margin-top:10px;overflow:hidden;}
.prog-fill{height:100%;border-radius:2px;}
.catchup-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
.catchup-card{background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:14px;}
.cu-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;}
.cu-kpi{font-size:9px;font-weight:500;color:var(--dim);text-transform:uppercase;letter-spacing:.8px;}
.cu-gap-badge{font-size:9px;font-weight:500;padding:2px 6px;border-radius:20px;background:rgba(220,38,38,.12);color:#dc2626;}
.cu-row{display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);}
.cu-row:last-child{border-bottom:none;}
.cu-rowlbl{font-size:10px;color:var(--muted);}.cu-rowval{font-family:'DM Mono',monospace;font-size:11px;color:var(--text);}
.cu-catchup{margin-top:10px;padding-top:8px;border-top:1px solid var(--border);}
.cu-catchup-lbl{font-size:9px;color:var(--muted);margin-bottom:2px;}
.cu-catchup-val{font-family:'DM Mono',monospace;font-size:18px;font-weight:500;}
.cu-catchup-sub{font-size:9px;color:var(--muted);margin-top:1px;}
.eco-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;}
.eco-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:13px;}
.eco-title{font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:9px;}
.eco-row{display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);}
.eco-row:last-child{border-bottom:none;}
.eco-member{font-size:11px;display:flex;align-items:center;gap:6px;}
.eco-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
.eco-val{font-family:'DM Mono',monospace;font-size:12px;font-weight:500;}
.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;}
.chart-card{background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:16px;}
.chart-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;}
.chart-title{font-size:12px;font-weight:500;}.chart-sub{font-size:10px;color:var(--muted);margin-top:1px;}
.chart-legend{display:flex;gap:10px;}.leg-item{display:flex;align-items:center;gap:3px;font-size:9px;color:var(--muted);}
.leg-sq{width:6px;height:6px;border-radius:2px;}.chart-wrap{position:relative;width:100%;height:180px;}
.table-card{background:var(--card);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:20px;}
.table-card-hdr{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}
.table-card-hdr h3{font-size:12px;font-weight:500;}
.tbl-wrap{overflow-x:auto;}
table{width:100%;border-collapse:collapse;font-size:10px;min-width:820px;}
thead tr{background:var(--card2);}
th{padding:8px 10px;text-align:left;font-size:8px;font-weight:500;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);border-bottom:1px solid var(--border);white-space:nowrap;}
th.wk-active{color:var(--red);}
td{padding:6px 10px;border-bottom:1px solid var(--border);color:var(--muted);font-family:'DM Mono',monospace;font-size:10px;}
td.row-lbl{font-family:'DM Sans',sans-serif;font-size:10px;color:var(--text);}
td.sec-hdr{background:var(--card2);font-family:'DM Sans',sans-serif;font-size:8px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;}
td.val-empty{color:var(--dim);}
tr:last-child td{border-bottom:none;}
.dials-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
.dial-card{background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:16px;text-align:center;}
.dial-kpi{font-size:9px;font-weight:500;color:var(--dim);text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px;}
.dial-title{font-size:11px;font-weight:500;margin-bottom:5px;}
.dial-badge{display:inline-block;font-size:9px;font-weight:500;padding:3px 10px;border-radius:20px;margin-top:3px;}
.dial-thresh{font-size:9px;color:var(--dim);margin-top:7px;line-height:1.5;}
.overlay{position:fixed;inset:0;background:rgba(30,33,44,.4);z-index:400;display:none;}
.overlay.on{display:block;}
.panel{position:fixed;left:-110%;top:0;bottom:0;width:760px;background:var(--card);border-right:1px solid var(--border);z-index:500;display:flex;flex-direction:column;transition:left .3s cubic-bezier(.4,0,.2,1);box-shadow:10px 0 30px rgba(0,0,0,.12);}
.panel.wide{width:840px;}.panel.open{left:0;}
.panel-hdr{padding:16px 20px 13px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.panel-title{font-size:13px;font-weight:600;display:flex;align-items:center;gap:7px;}
.panel-close{background:none;border:none;color:var(--muted);cursor:pointer;font-size:17px;padding:2px 5px;border-radius:4px;}
.panel-close:hover{background:var(--card2);color:var(--text);}
.panel-body{flex:1;overflow-y:auto;padding:16px 20px;}
.p-stats{display:flex;gap:8px;margin-bottom:13px;flex-wrap:wrap;}
.p-stat{background:var(--card2);border:1px solid var(--border);border-radius:7px;padding:8px 12px;flex:1;min-width:80px;}
.p-stat .sv{font-family:'DM Mono',monospace;font-size:17px;font-weight:500;}
.p-stat .sl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:2px;}
.p-tbl-wrap{overflow-x:auto;}
.p-tbl{width:100%;border-collapse:collapse;font-size:10px;}
.p-tbl thead tr{background:var(--card2);}
.p-tbl th{padding:7px 10px;text-align:left;font-size:8px;font-weight:500;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);border-bottom:1px solid var(--border);white-space:nowrap;}
.p-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;}
.p-tbl tr:last-child td{border-bottom:none;}.p-tbl tr:hover td{background:rgba(255,255,255,.02);}
.comp-tbl-wrap{overflow-x:auto;}
.comp-tbl{width:100%;border-collapse:collapse;font-size:10px;min-width:660px;}
.comp-tbl thead tr{background:var(--card2);}
.comp-tbl th{padding:8px 10px;text-align:left;font-size:8px;font-weight:500;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);border-bottom:1px solid var(--border);white-space:nowrap;}
.comp-tbl td{padding:8px 10px;border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;text-align:center;}
.comp-tbl td:first-child{text-align:left;color:var(--text);font-weight:500;font-family:'DM Sans',sans-serif;font-size:11px;line-height:1.4;}
.comp-tbl tr:last-child td{border-bottom:none;}
.diff-box{margin-top:16px;padding:12px 14px;background:var(--card2);border-radius:7px;border-left:3px solid var(--red);}
.diff-box-title{font-size:9px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:7px;}
.diff-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.diff-item{font-size:10px;color:var(--muted);display:flex;align-items:flex-start;gap:5px;line-height:1.4;}
.diff-item span:first-child{color:var(--red);flex-shrink:0;}
.events-card{background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:16px;margin-bottom:20px;}
.events-scroll{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-top:9px;}
.ev-chip{background:var(--card2);border:1px solid var(--border);border-radius:var(--r);padding:8px 12px;flex-shrink:0;min-width:150px;}
.ev-date{font-size:9px;color:var(--red);font-weight:500;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;}
.ev-name{font-size:10px;font-weight:500;color:var(--text);line-height:1.3;}
.ev-loc{font-size:9px;color:var(--muted);margin-top:2px;}
.footer{text-align:center;padding:13px;font-size:9px;color:var(--dim);border-top:1px solid var(--border);}
@media(max-width:900px){.main{padding:12px;}.kpi-grid,.pain-grid,.eco-grid,.dials-grid,.charts-grid,.catchup-grid{grid-template-columns:repeat(2,1fr);}.banner{flex-direction:column;}.panel{width:100%;}}
</style></head><body>
<div class="overlay" id="sOverlay" onclick="sCloseAll()"></div>
<div class="panel" id="spTargets"><div class="panel-hdr"><div class="panel-title">🎯 Target Customers</div><button class="panel-close" onclick="sCloseAll()">✕</button></div><div class="panel-body"><div class="p-stats"><div class="p-stat"><div class="sv" style="color:var(--blue)">738</div><div class="sl">Total Accounts</div></div><div class="p-stat"><div class="sv" style="color:var(--green)">$55.4M</div><div class="sl">TAM</div></div><div class="p-stat"><div class="sv" style="color:var(--amber)">$75K</div><div class="sl">Avg Deal</div></div><div class="p-stat"><div class="sv" style="color:var(--purple)">13</div><div class="sl">Segments</div></div></div><div class="p-tbl-wrap"><table class="p-tbl"><thead><tr><th>Segment</th><th>Accounts</th><th>TAM</th><th>Owner</th><th>Launch</th></tr></thead><tbody>${tgtPanelHTML()}</tbody></table></div></div></div>
<div class="panel" id="spAEM"><div class="panel-hdr"><div class="panel-title">🏛 AEM Customers</div><button class="panel-close" onclick="sCloseAll()">✕</button></div><div class="panel-body"><div class="p-stats"><div class="p-stat"><div class="sv" style="color:var(--amber)">104</div><div class="sl">Total</div></div><div class="p-stat"><div class="sv" style="color:var(--blue)">56</div><div class="sl">East</div></div><div class="p-stat"><div class="sv" style="color:var(--green)">48</div><div class="sl">West</div></div><div class="p-stat"><div class="sv" style="color:var(--green)">25</div><div class="sl">Success</div></div></div><div class="p-tbl-wrap"><table class="p-tbl"><thead><tr><th>Account</th><th>Region</th><th>AD</th><th>Partner</th><th>Success</th></tr></thead><tbody>${aemPanelHTML()}</tbody></table></div></div></div>
<div class="panel" id="spMeetings"><div class="panel-hdr"><div class="panel-title">📋 Meeting Tracker</div><button class="panel-close" onclick="sCloseAll()">✕</button></div><div class="panel-body"><div class="p-stats"><div class="p-stat"><div class="sv" style="color:var(--purple)">7</div><div class="sl">Total</div></div><div class="p-stat"><div class="sv" style="color:var(--green)">6</div><div class="sl">Confirmed</div></div><div class="p-stat"><div class="sv" style="color:var(--amber)">1</div><div class="sl">In Progress</div></div></div><div class="p-tbl-wrap"><table class="p-tbl"><thead><tr><th>Name</th><th>Title</th><th>Account</th><th>AD</th><th>Status</th><th>Date</th><th>Notes</th></tr></thead><tbody>${mtgPanelHTML()}</tbody></table></div></div></div>
<div class="panel wide" id="spComp"><div class="panel-hdr"><div class="panel-title">🧩 Competition — Competitive Positioning</div><button class="panel-close" onclick="sCloseAll()">✕</button></div><div class="panel-body"><div class="p-stats"><div class="p-stat"><div class="sv" style="color:var(--red)">5</div><div class="sl">Dominant</div></div><div class="p-stat"><div class="sv" style="color:var(--green)">6</div><div class="sl">Checkmarks</div></div><div class="p-stat"><div class="sv" style="color:var(--amber)">4</div><div class="sl">Competitors</div></div><div class="p-stat" style="border-color:rgba(250,15,0,.3)"><div class="sv" style="color:var(--red);font-size:13px;margin-top:2px">Leader</div><div class="sl">Position</div></div></div><div class="comp-tbl-wrap"><table class="comp-tbl"><thead><tr><th style="min-width:170px">Feature</th><th style="text-align:center;color:var(--red);min-width:110px">Adobe LLM Optimizer</th><th style="text-align:center;min-width:85px">Scrunch</th><th style="text-align:center;min-width:120px">Semrush AI Visibility</th><th style="text-align:center;min-width:85px">Profound</th><th style="text-align:center;min-width:75px">Peec AI</th></tr></thead><tbody>${compPanelHTML()}</tbody></table></div><div class="diff-box"><div class="diff-box-title">Key Differentiators</div><div class="diff-grid"><div class="diff-item"><span>→</span><span>Only solution with <strong style="color:var(--text)">Strong</strong> actionable workflow &amp; deployment</span></div><div class="diff-item"><span>→</span><span>Only solution with <strong style="color:var(--text)">full</strong> attribution to business outcomes</span></div><div class="diff-item"><span>→</span><span><strong style="color:var(--text)">Strong</strong> enterprise integrations vs Moderate/Lighter</span></div><div class="diff-item"><span>→</span><span>Only platform with native <strong style="color:var(--text)">Government</strong> content management</span></div></div></div></div></div>
<header class="hdr"><div class="hdr-left"><div class="logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 501.71 444.05" fill="white"><polygon points="297.58 444.05 261.13 342.65 169.67 342.65 246.54 149.12 363.19 444.05 501.71 444.05 316.8 0 186.23 0 0 444.05 297.58 444.05 297.58 444.05"/></svg></div><div><div class="hdr-title">Adobe LLM Optimizer · SLG Strategic Initiative</div><div class="hdr-sub">Executive Sponsor: Phil Jackson · All 50 US States</div></div></div><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><button class="pill" onclick="sOpen('Targets')" style="color:var(--blue);border-color:rgba(59,130,246,.3)">🎯 Target Customers</button><button class="pill" onclick="sOpen('AEM')" style="color:var(--amber);border-color:rgba(245,158,11,.3)">🏛 AEM Customers</button><button class="pill" onclick="sOpen('Meetings')" style="color:var(--purple);border-color:rgba(168,85,247,.3)">📋 Meeting Tracker</button><button class="pill" onclick="sOpen('Comp')" style="color:var(--red);border-color:rgba(250,15,0,.3)">🧩 Competition</button><a href="https://app.pursuit.us/research/26749" target="_blank" class="pill" style="color:#0ea5e9;border-color:rgba(14,165,233,.35);text-decoration:none;display:inline-flex;align-items:center;gap:5px">🔍 PURSUIT-Signals ↗</a><div class="snap-badge">📸 Snapshot · ${pub}</div><div class="pill" style="cursor:default">Q2 2026 · Read-Only</div></div></header>
<div class="ro-bar">👁 Read-only snapshot — published ${pub}. Contact the initiative owner to update.</div>
<main class="main">
<div class="banner"><div><h2>Position Adobe <span>LLM Optimizer</span> as the leading AI Engine Visibility Solution for Government</h2><p>State &amp; Local Government · Tier 1 Target Accounts · Ecosystem-Driven, Repeatable Framework</p></div><div class="tam-row"><div class="tam-item"><div class="tam-val">$55.4M</div><div class="tam-lbl">Total Addressable Market</div></div><div class="tam-item"><div class="tam-val">738</div><div class="tam-lbl">Tier 1 Accounts</div></div><div class="tam-item"><div class="tam-val">$75K</div><div class="tam-lbl">Avg Deal Size</div></div></div></div>
<div class="sec-lbl">Three Core Pain Points Addressed</div>
<div class="pain-grid"><div class="pain-card"><div class="pain-icon" style="background:rgba(59,130,246,.12)">👁</div><div><div class="pain-label">Visibility</div><div class="pain-desc">Is government website content visible to AI agents from ChatGPT, Copilot, Gemini?</div></div></div><div class="pain-card"><div class="pain-icon" style="background:rgba(34,197,94,.12)">📌</div><div><div class="pain-label">Mention &amp; Citation</div><div class="pain-desc">Are government agencies mentioned and cited by AI platforms?</div></div></div><div class="pain-card"><div class="pain-icon" style="background:rgba(245,158,11,.12)">📊</div><div><div class="pain-label">Sentiment</div><div class="pain-desc">Are sentiments associated with agencies positive or negative in AI responses?</div></div></div></div>
<div class="sec-lbl">Performance Dials · ${wo.lbl}</div>
<div class="dials-grid" id="sDialsGrid"></div>
<div class="sec-lbl">KPI Performance · ${wo.lbl} (${wo.date}) — Published Snapshot</div>
<div class="kpi-grid">${kpiHTML()}</div>
<div class="sec-lbl">Catchup Required — Weekly Average Needed · ${wo.lbl}</div>
<div class="catchup-grid">${catchupHTML()}</div>
<div class="sec-lbl">Ecosystem Breakdown · ${wo.lbl}</div>
<div class="eco-grid">${ecoHTML()}</div>
<div class="sec-lbl">Target vs. Actual — Visual Trends</div>
<div class="charts-grid"><div class="chart-card"><div class="chart-hdr"><div><div class="chart-title">Accounts Outreached &amp; Meetings</div><div class="chart-sub">Target vs Actual · ${wo.lbl}</div></div><div class="chart-legend"><div class="leg-item"><div class="leg-sq" style="background:var(--blue)"></div>Target</div><div class="leg-item"><div class="leg-sq" style="background:var(--red)"></div>Actual</div></div></div><div class="chart-wrap"><canvas id="sc1"></canvas></div></div><div class="chart-card"><div class="chart-hdr"><div><div class="chart-title">Pipeline Progress ($)</div><div class="chart-sub">Net New SS3 · ${wo.lbl}</div></div><div class="chart-legend"><div class="leg-item"><div class="leg-sq" style="background:var(--amber)"></div>Target</div><div class="leg-item"><div class="leg-sq" style="background:var(--red)"></div>Actual</div></div></div><div class="chart-wrap"><canvas id="sc2"></canvas></div></div></div>
<div class="sec-lbl">Weekly KPI Tracker · Q2 2026</div>
<div class="table-card"><div class="table-card-hdr"><h3>Target vs. Actual — All Weeks</h3><div style="font-size:10px;color:var(--muted)">Red = published week</div></div><div class="tbl-wrap"><table>${tableHTML()}</table></div></div>
<div class="sec-lbl">Marketing &amp; Gov Relations Events · 2026</div>
<div class="events-card"><div style="display:flex;gap:12px;font-size:9px;color:var(--muted);flex-wrap:wrap"><span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:var(--dim);opacity:.5;display:inline-block"></span>Past</span><span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:var(--red);display:inline-block"></span>Marketing</span><span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:var(--blue);display:inline-block"></span>Gov Relations</span><span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:var(--dim);display:inline-block"></span>Date TBD</span></div><div class="events-scroll"><div class="ev-chip" style="opacity:.4"><div class="ev-date" style="color:var(--dim)">Mar 12 · Past</div><div class="ev-name" style="color:var(--muted)">Adobe AI Forum — Dallas</div><div class="ev-loc">Dallas, TX</div></div><div class="ev-chip" style="opacity:.4"><div class="ev-date" style="color:var(--dim)">Mar 18 · Past</div><div class="ev-name" style="color:var(--muted)">OhioX GovTech Summit</div><div class="ev-loc">Columbus, OH</div></div><div class="ev-chip" style="border-color:rgba(59,130,246,.45)"><div class="ev-date" style="color:var(--blue)">Mar 27 · Gov Relations</div><div class="ev-name">LLMO Enablement for SLG Lobbyists</div><div class="ev-loc">Virtual</div></div><div class="ev-chip"><div class="ev-date">Apr 14–15, 2026</div><div class="ev-name">CA CIO Academy</div><div class="ev-loc">Sacramento, CA</div></div><div class="ev-chip"><div class="ev-date">Apr 26–29, 2026</div><div class="ev-name">NASCIO Mid-Year</div><div class="ev-loc">Philadelphia, PA</div></div><div class="ev-chip"><div class="ev-date">May 11–13, 2026</div><div class="ev-name">NAGC</div><div class="ev-loc">Palm Springs, CA</div></div><div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — Seattle</div><div class="ev-loc">Seattle, WA</div></div><div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — New York</div><div class="ev-loc">New York, NY</div></div><div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — Chicago</div><div class="ev-loc">Chicago, IL</div></div><div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — San Francisco</div><div class="ev-loc">San Francisco, CA</div></div></div></div>
</main>
<div class="footer">Adobe LLMO · SLG Strategic Initiative · Q2 2026 · Confidential — Snapshot published ${pub} · Read-only view</div>
<script>
var CD=${chartData};var DD=${dialData};
Chart.defaults.color='#5c6173';Chart.defaults.borderColor='rgba(0,0,0,.06)';Chart.defaults.font.family="'DM Sans',sans-serif";Chart.defaults.font.size=10;
var base={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#1a1d27',borderColor:'rgba(0,0,0,.15)',borderWidth:1}},scales:{x:{grid:{color:'rgba(0,0,0,.05)'},ticks:{color:'#5c6173'}},y:{grid:{color:'rgba(0,0,0,.05)'},ticks:{color:'#5c6173'},beginAtZero:true}}};
new Chart(document.getElementById('sc1'),{type:'bar',data:{labels:['Accounts Outreached','Scheduled Meetings'],datasets:[{label:'Target',data:[CD.k1t,CD.k2t],backgroundColor:'rgba(59,130,246,.25)',borderColor:'#3b82f6',borderWidth:1.5,borderRadius:4},{label:'Actual',data:[CD.k1a,CD.k2a],backgroundColor:'rgba(250,15,0,.35)',borderColor:'#fa0f00',borderWidth:1.5,borderRadius:4}]},options:base});
var po=JSON.parse(JSON.stringify(base));po.plugins.tooltip.callbacks={label:function(c){return' $'+c.raw.toLocaleString();}};po.scales.y.ticks={color:'#8a8f99',callback:function(v){return'$'+(v/1000).toFixed(0)+'K';}};
new Chart(document.getElementById('sc2'),{type:'bar',data:{labels:['Pipeline'],datasets:[{label:'Target',data:[CD.k3t],backgroundColor:'rgba(245,158,11,.25)',borderColor:'#f59e0b',borderWidth:1.5,borderRadius:4},{label:'Actual',data:[CD.k3a],backgroundColor:'rgba(250,15,0,.35)',borderColor:'#fa0f00',borderWidth:1.5,borderRadius:4}]},options:po});
var dg=document.getElementById('sDialsGrid');if(dg){dg.innerHTML=DD.map(function(c,i){return'<div class="dial-card"><div class="dial-kpi">'+c.kpi+'</div><div class="dial-title">'+c.title+'</div><canvas id="sd'+i+'" width="190" height="112" style="display:block;margin:0 auto"></canvas><div id="sdb'+i+'" class="dial-badge"></div><div class="dial-thresh"></div></div>';}).join('');}
DD.forEach(function(cfg,i){var cv=document.getElementById('sd'+i);if(!cv)return;var ctx=cv.getContext('2d'),W=cv.width,H=cv.height,cx=W/2,cy=H-10,r=68,aw=12;ctx.clearRect(0,0,W,H);var re=Math.PI+(cfg.red/cfg.max)*Math.PI,ye=Math.PI+(cfg.yellow/cfg.max)*Math.PI;function arc(s,e,c){ctx.beginPath();ctx.arc(cx,cy,r,s,e);ctx.strokeStyle=c;ctx.lineWidth=aw;ctx.lineCap='butt';ctx.stroke();}arc(Math.PI,0,'rgba(0,0,0,.08)');arc(Math.PI,re,'#ef4444');arc(re,ye,'#f59e0b');arc(ye,0,'#22c55e');ctx.beginPath();ctx.arc(cx,cy,r-aw/2-1,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();var val=cfg.val;if(val!==null){var a=Math.PI+(Math.min(val,cfg.max)/cfg.max)*Math.PI;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+(r-7)*Math.cos(a),cy+(r-7)*Math.sin(a));ctx.strokeStyle='#1a1d27';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.stroke();}ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.fillStyle='#1a1d27';ctx.fill();var disp=val===null?'—':(cfg.money?'$'+Math.round(val/1000)+'K':String(val));ctx.font="500 18px 'DM Mono',monospace";ctx.fillStyle='#1a1d27';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(disp,cx,cy-5);ctx.font="400 8px 'DM Sans',sans-serif";ctx.fillStyle='#9ca3b0';ctx.textAlign='left';ctx.fillText('0',cx-r-2,cy+11);ctx.textAlign='right';ctx.fillText(cfg.money?'$700K':String(cfg.max),cx+r+2,cy+11);var b=document.getElementById('sdb'+i);if(!b)return;var st,bg,cl;if(val===null){st='NO DATA';bg='rgba(0,0,0,.06)';cl='#9ca3b0';}else if(val>=cfg.yellow){st='ON TRACK';bg='rgba(34,197,94,.15)';cl='#22c55e';}else if(val>=cfg.red){st='AT RISK';bg='rgba(245,158,11,.15)';cl='#f59e0b';}else{st='BEHIND';bg='rgba(239,68,68,.15)';cl='#ef4444';}b.textContent=st;b.style.background=bg;b.style.color=cl;});
function sOpen(w){sCloseAll();var p=document.getElementById('sp'+w);if(p)p.classList.add('open');var o=document.getElementById('sOverlay');if(o)o.classList.add('on');}
function sCloseAll(){['spTargets','spAEM','spMeetings','spComp'].forEach(function(id){var el=document.getElementById(id);if(el)el.classList.remove('open');});var o=document.getElementById('sOverlay');if(o)o.classList.remove('on');}
${SE}


</body></html>`;

  const date2=new Date().toISOString().slice(0,10);
  const fname='LLMO-Dashboard-Snapshot-'+date2+'.html';
  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=fname;a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════
// RENDER ALL
// ═══════════════════════════════════════════════════════════
function renderAll(){
  renderKPI();
  renderCatchup();
  renderEco();
  renderCharts();
  renderTable();
  renderDials();
  populateSelects();
}

function initDashboard(){
  if(!window.LLMO_API_KEY) document.getElementById('apiModal').classList.add('on');
  if(!MTG_LIVE) MTG_LIVE=[...MTG_DATA.map(r=>({...r}))];
  // Seed AEM_EDITS from sheet data (sheet is source of truth; localStorage overrides if present)
  AEM_DATA.forEach(function(r) {
    if (!AEM_EDITS[r.name]) AEM_EDITS[r.name] = {};
    var e = AEM_EDITS[r.name];
    if (!e.contacted && r.contacted === 'Yes') e.contacted = true;
    if (!e.contactDate && r['contact-date']) e.contactDate = r['contact-date'];
    if (!e.mtgSet && r['mtg-set'] === 'Yes') e.mtgSet = true;
    if (!e.mtgDate && r['mtg-date']) e.mtgDate = r['mtg-date'];
    if (!e.notes && r.notes) e.notes = r.notes;
    if (!e.engaged && r.engaged === 'Yes') e.engaged = true;
  });
  ensureBaseActuals();
  if(Object.keys(AEM_EDITS).length>0) applyAEMToKPIs();
  buildDials();
  renderAll();
  // Sync saved tracker data into KPIs on load
  if(salesRows.filter(function(r){return r.account||r.partner;}).length>0) syncKpi4();
  if(bdrRows.filter(function(r){return r.account||r.assignTo;}).length>0) syncKpi2fromBDR();
  if(grRows.filter(function(r){return r.account||r.assignTo;}).length>0) syncKpi5fromGR();
}
// initDashboard() is called at the bottom of the script, after all let/const declarations

// ─── PURSUIT-SIGNALS ────────────────────────────────────────────────────────
function loadPursuit(){try{return JSON.parse(localStorage.getItem('llmo_pursuit_v1')||'null')||[];}catch(e){return[];}}
function savePursuit(){localStorage.setItem('llmo_pursuit_v1',JSON.stringify(pursuitRows));}
let pursuitRows = loadPursuit();
let pursuitFormOpen = false;

function togglePursuitForm(){
  pursuitFormOpen = !pursuitFormOpen;
  document.getElementById('pursuitAddForm').style.display = pursuitFormOpen ? 'block' : 'none';
  if(pursuitFormOpen){
    // Set today as default signal date
    document.getElementById('pf_date').value = new Date().toISOString().slice(0,10);
  }
}

function savePursuitSignal(){
  var week    = document.getElementById('pf_week').value.trim();
  var date    = document.getElementById('pf_date').value;
  var engaged = document.getElementById('pf_engaged').value;
  var qualify = document.getElementById('pf_qualify').value;
  var notes   = document.getElementById('pf_notes').value.trim();
  var ad      = document.getElementById('pf_ad').value.trim();
  var account = document.getElementById('pf_account').value.trim();
  var state   = document.getElementById('pf_state').value.trim();
  var type    = document.getElementById('pf_type').value;
  var signal  = document.getElementById('pf_signal').value.trim();
  var link    = document.getElementById('pf_link').value.trim();

  if(!account && !signal){ alert('Please enter at least an Account or Signal.'); return; }

  pursuitRows.push({week,date,engaged,qualify,notes,ad,account,state,type,signal,link});
  savePursuit();
  // Reset form fields
  ['pf_week','pf_qualify','pf_type','pf_engaged'].forEach(function(id){document.getElementById(id).selectedIndex=0;});
  ['pf_date','pf_ad','pf_account','pf_state','pf_signal','pf_notes','pf_link'].forEach(function(id){document.getElementById(id).value='';});
  pursuitFormOpen = false;
  document.getElementById('pursuitAddForm').style.display='none';
  renderPursuit();
  syncKPI67();
}

function deletePursuitRow(i){
  if(!confirm('Remove this signal?')) return;
  pursuitRows.splice(i,1);
  savePursuit();
  renderPursuit();
  syncKPI67();
}

function togglePursuitEngaged(i){
  if(!pursuitRows[i]) return;
  pursuitRows[i].engaged = (pursuitRows[i].engaged === 'Yes') ? 'No' : 'Yes';
  savePursuit();
  renderPursuit();
  syncKPI67();
}


function savePursuitNote(i, val){
  if(!pursuitRows[i]) return;
  pursuitRows[i].notes = val;
  savePursuit();
}

function togglePursuitQualify(i){
  if(!pursuitRows[i]) return;
  var cur = pursuitRows[i].qualify || 'Pending';
  var next = cur === 'Pending' ? 'Qualified' : (cur === 'Qualified' ? 'Disqualified' : 'Pending');
  pursuitRows[i].qualify = next;
  savePursuit();
  renderPursuit();
}


function renderPursuit(){
  var q = (document.getElementById('pursuitSearch')||{value:''}).value.toLowerCase();
  var rows = pursuitRows.filter(function(r){
    if(!q) return true;
    return [r.week,r.date,r.engaged,r.qualify,r.notes,r.ad,r.account,r.state,r.type,r.signal,r.link]
      .some(function(v){ return (v||'').toLowerCase().includes(q); });
  });

  var total   = pursuitRows.length;
  var engaged = pursuitRows.filter(function(r){return r.engaged==='Yes';}).length;
  var qual    = pursuitRows.filter(function(r){return r.qualify==='Qualified';}).length;
  var dq      = pursuitRows.filter(function(r){return r.qualify==='Disqualified';}).length;
  var pend    = total - qual - dq;

  var setEl = function(id,v){var el=document.getElementById(id);if(el)el.textContent=v;};
  setEl('ps-total',   total);
  setEl('ps-engaged', engaged);
  setEl('ps-qual',    qual);
  setEl('ps-dq',      dq);
  setEl('ps-pend',    pend);

  var tb = document.getElementById('pursuitBody');
  if(!tb) return;

  if(rows.length === 0){
    tb.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--dim)">No signals yet \u2014 click <strong style="color:#0ea5e9">+ Add Signal</strong> to get started</td></tr>';
    return;
  }

  var html = '';
  rows.forEach(function(r){
    var realIdx  = pursuitRows.indexOf(r);
    var badgeCls = r.qualify==='Qualified' ? 'q' : (r.qualify==='Disqualified' ? 'dq' : 'pending');
    var engBadge = r.engaged==='Yes'
      ? '<button onclick="event.stopPropagation();togglePursuitEngaged(' + realIdx + ')" style="font-size:9px;font-weight:600;padding:3px 9px;border-radius:9px;background:rgba(22,163,74,.15);color:#16a34a;border:1px solid rgba(22,163,74,.3);cursor:pointer;font-family:DM Sans,sans-serif;">✓ Yes</button>'
      : '<button onclick="event.stopPropagation();togglePursuitEngaged(' + realIdx + ')" style="font-size:9px;padding:3px 9px;border-radius:9px;background:rgba(0,0,0,.05);color:var(--muted);border:1px solid var(--border);cursor:pointer;font-family:DM Sans,sans-serif;">○ No</button>';
    var linkCell = r.link
      ? '<a href="' + r.link + '" target="_blank" style="color:#0ea5e9;font-size:10px;text-decoration:none;border-bottom:1px solid rgba(14,165,233,.3)">&#8599; View</a>'
      : '<span style="color:var(--dim)">—</span>';
    html += '<tr>'
      + '<td style="white-space:nowrap;color:var(--text);font-size:10px">' + (r.week||'—') + '</td>'
      + '<td style="white-space:nowrap;font-family:DM Mono,monospace;font-size:10px">' + (r.date||'—') + '</td>'
      + '<td>' + engBadge + '</td>'
      + '<td>'
      + (function(){
          var q = r.qualify || 'Pending';
          var styles = {
            'Qualified':    'font-size:9px;font-weight:600;padding:4px 10px;border-radius:9px;background:rgba(22,163,74,.15);color:#16a34a;border:1px solid rgba(22,163,74,.35);cursor:pointer;font-family:DM Sans,sans-serif;white-space:nowrap;',
            'Disqualified': 'font-size:9px;font-weight:600;padding:4px 10px;border-radius:9px;background:rgba(220,38,38,.12);color:#dc2626;border:1px solid rgba(220,38,38,.3);cursor:pointer;font-family:DM Sans,sans-serif;white-space:nowrap;',
            'Pending':      'font-size:9px;font-weight:600;padding:4px 10px;border-radius:9px;background:rgba(245,158,11,.12);color:#d97706;border:1px solid rgba(245,158,11,.3);cursor:pointer;font-family:DM Sans,sans-serif;white-space:nowrap;'
          };
          var labels = { 'Qualified':'✓ Qualified', 'Disqualified':'✕ DQ', 'Pending':'⏳ Pending' };
          return '<button onclick="event.stopPropagation();togglePursuitQualify(' + realIdx + ')" title="Click to cycle: Pending → Qualified → DQ" style="' + (styles[q]||styles['Pending']) + '">' + (labels[q]||'Pending') + '</button>';
        })()
      + '</td>'
      + '<td style="min-width:140px"><input type="text" value="' + (r.notes||'').replace(/"/g,'&quot;') + '" placeholder="Add note…" onchange="savePursuitNote(' + realIdx + ',this.value)" onclick="event.stopPropagation()" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:3px 7px;font-size:11px;font-family:\'DM Sans\',sans-serif;"></td>'
      + '<td style="white-space:nowrap">' + (r.ad||'—') + '</td>'
      + '<td style="color:var(--text);font-weight:500;white-space:nowrap">' + (r.account||'—') + '</td>'
      + '<td style="white-space:nowrap">' + (r.state||'—') + '</td>'
      + '<td style="white-space:nowrap">' + (r.type||'—') + '</td>'
      + '<td style="max-width:180px;white-space:normal;line-height:1.4">' + (r.signal||'') + '</td>'
      + '<td style="white-space:nowrap">' + linkCell + '</td>'
      + '<td style="text-align:center"><button onclick="deletePursuitRow(' + realIdx + ')" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:13px;padding:1px 5px;border-radius:3px" title="Remove">&#x2715;</button></td>'
      + '</tr>';
  });
  tb.innerHTML = html;
}


// ─── SYNC KPI #6 + KPI #7 ───────────────────────────────────────────────────
function syncKPI67(){
  // These KPIs are computed live from AEM_EDITS and pursuitRows, 
  // so just re-render the KPI grid
  renderKPI();
}


if(document.readyState==='complete'){initDashboard();}
else{window.addEventListener('load',initDashboard);}

// ─── COUNTDOWN TIMER ────────────────────────────────────────────────────────
(function(){
  var target = new Date(window.LLMO_COUNTDOWN_DATE);
  var lbl = document.querySelector('.cd-label');
  if(lbl) lbl.textContent = '🏁 Q2 Deadline Countdown — ' + target.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  function pad(n){return String(n).padStart(2,'0');}
  function tick(){
    var now = new Date();
    var diff = target - now;
    if(diff <= 0){
      document.getElementById('countdownBar').innerHTML='<div class="cd-label" style="font-size:14px">🏁 Q2 Deadline Reached — May 29, 2026</div>';
      return;
    }
    var days  = Math.floor(diff/86400000);
    var hours = Math.floor((diff%86400000)/3600000);
    var mins  = Math.floor((diff%3600000)/60000);
    var secs  = Math.floor((diff%60000)/1000);
    var d=document.getElementById('cd-days');
    var h=document.getElementById('cd-hours');
    var m=document.getElementById('cd-mins');
    var s=document.getElementById('cd-secs');
    if(d)d.textContent=pad(days);
    if(h)h.textContent=pad(hours);
    if(m)m.textContent=pad(mins);
    if(s)s.textContent=pad(secs);
  }
  tick();
  setInterval(tick,1000);
})();

