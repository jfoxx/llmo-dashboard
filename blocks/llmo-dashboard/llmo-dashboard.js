/**
 * Loads and decorates the llmo-dashboard block.
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  // 1. Load Google Fonts
  if (!document.querySelector('link[href*="DM+Sans"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
  }

  // 2. Load Chart.js
  if (!window.Chart) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // 3. Fetch API key from config.json (AEM key-value sheet)
  try {
    const resp = await fetch('/config.json');
    if (resp.ok) {
      const cfg = await resp.json();
      const dateEntry = (cfg.data || []).find((r) => r.key === 'countdown-date');
      if (dateEntry?.value) window.LLMO_COUNTDOWN_DATE = dateEntry.value;
      const paUpdateEntry = (cfg.data || []).find((r) => r.key === 'power-automate-aem-update-url');
      if (paUpdateEntry?.value) window.LLMO_PA_UPDATE_URL = paUpdateEntry.value;
      const paAddEntry = (cfg.data || []).find((r) => r.key === 'power-automate-aem-add-url');
      if (paAddEntry?.value) window.LLMO_PA_ADD_URL = paAddEntry.value;
    }
  } catch (e) {
    // config fetch failed — fall back to localStorage / manual entry
  }

  // 4. Fetch customer data from data.json (multi-sheet workbook)
  try {
    const resp = await fetch('/data.json');
    if (!resp.ok) throw new Error(`/data.json returned ${resp.status}`);
    const json = await resp.json();
    window.LLMO_SHEET_TARGETS = json['targets']?.data || [];
    window.LLMO_SHEET_AEM = json['aem-customers']?.data || [];
    window.LLMO_SHEET_MEETINGS = json['meetings']?.data || [];
    window.LLMO_SHEET_COMPETITIVE = json['competitive']?.data || [];
    window.LLMO_SHEET_AD = json['ad']?.data || [];
  } catch (e) {
    block.innerHTML = `<div style="padding:40px;text-align:center;font-family:sans-serif;color:#E8200E">
      <strong>Failed to load dashboard data</strong><br><br>
      <span style="color:#5c6173;font-size:13px">Could not fetch /data.json — ${e.message}</span>
    </div>`;
    return;
  }

  // 5. Inject dashboard HTML
  block.innerHTML = `

<!-- COUNTDOWN TIMER -->
<div class="countdown-bar" id="countdownBar">
  <div class="cd-label">🏁 Q2 Deadline Countdown — May 29, 2026</div>
  <div class="cd-units">
    <div class="cd-unit"><div class="cd-num" id="cd-days">--</div><div class="cd-lbl">Days</div></div>
    <div class="cd-sep">:</div>
    <div class="cd-unit"><div class="cd-num" id="cd-hours">--</div><div class="cd-lbl">Hours</div></div>
    <div class="cd-sep">:</div>
    <div class="cd-unit"><div class="cd-num" id="cd-mins">--</div><div class="cd-lbl">Minutes</div></div>
    <div class="cd-sep">:</div>
    <div class="cd-unit"><div class="cd-num" id="cd-secs">--</div><div class="cd-lbl">Seconds</div></div>
  </div>
</div>


<!-- OVERLAY -->
<div class="overlay" id="overlay" onclick="closeAllPanels()"></div>

<!-- TARGET CUSTOMERS PANEL -->
<div class="panel" id="pTargets">
  <div class="panel-hdr">
    <div class="panel-title">🎯 Tier 1 Target Customers</div>
    <button class="panel-close" onclick="closeAllPanels()">✕</button>
  </div>
  <div class="panel-body">
    <div class="p-stats">
      <div class="p-stat"><div class="sv" style="color:var(--blue)">738</div><div class="sl">Total Accounts</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--green)">$55.4M</div><div class="sl">TAM</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--amber)">$75K</div><div class="sl">Avg Deal</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--purple)">13</div><div class="sl">Segments</div></div>
    </div>
    <input class="p-search" id="tgtSearch" placeholder="Search segments or owner..." oninput="renderTargets()">
    <div class="p-tbl-wrap">
      <table class="p-tbl">
        <thead><tr><th onclick="sortTbl('tgt','segment')">Segment ↕</th><th onclick="sortTbl('tgt','accounts')">Accounts ↕</th><th onclick="sortTbl('tgt','tam')">TAM ↕</th><th>Owner</th><th>Launch</th></tr></thead>
        <tbody id="tgtBody"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- AEM CUSTOMERS PANEL -->
<div class="panel" id="pAEM">
  <div class="panel-hdr">
    <div class="panel-title">🏛 Existing AEM Customers</div>
    <button class="panel-close" onclick="closeAllPanels()">✕</button>
  </div>
  <div class="panel-body">
    <div class="p-stats">
      <div class="p-stat"><div class="sv" style="color:var(--amber)" id="aemTotal">104</div><div class="sl">Total</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--blue)" id="aemEast">56</div><div class="sl">East</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--green)" id="aemWest">48</div><div class="sl">West</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--green)" id="aemContacted">0</div><div class="sl">Contacted → KPI #1</div></div>
      <div class="p-stat"><div class="sv" style="color:#f97316" id="aemEngaged">0</div><div class="sl">Engaged (→ KPI #6)</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--blue)" id="aemMtgSet">0</div><div class="sl">Mtg Scheduled → KPI #2</div></div>
    </div>
    <div id="aemKpiImpact" class="kpi-impact-bar" style="display:none">
      ✓ <span id="aemKpiMsg"></span>
    </div>
    <div class="p-filters">
      <input class="p-search" id="aemSearch" placeholder="Search accounts, AD, partner..." oninput="renderAEM()" style="flex:1;margin-bottom:0;">
      <select class="p-select" id="aemRegion" onchange="renderAEM()"><option value="">All Regions</option><option>East</option><option>West</option></select>
      <select class="p-select" id="aemAD" onchange="renderAEM()"><option value="">All ADs</option><option>Blake S</option><option>Brett M</option><option>Cam N</option><option>Eric F</option><option>Kristen V</option><option>Luisa M</option><option>Megan D</option><option>Open - NE</option><option>Paul L</option><option>Tom C</option><option>Xavier L</option></select>
      <select class="p-select" id="aemContactFilter" onchange="renderAEM()"><option value="">All Status</option><option value="contacted">Contacted</option><option value="not-contacted">Not Contacted</option></select>
    </div>
    <div class="p-tbl-wrap">
      <table class="p-tbl">
        <thead><tr>
          <th></th>
          <th onclick="sortTbl('aem','name')" style="min-width:180px">Account ↕</th>
          <th onclick="sortTbl('aem','region')">Region ↕</th>
          <th onclick="sortTbl('aem','ad')">AD ↕</th>
          <th style="min-width:130px">Ultimate Success</th>
          <th style="min-width:120px">Partner</th>
          <th style="min-width:80px;text-align:center">Contacted</th>
          <th style="min-width:140px">Contact Date</th>
          <th style="min-width:80px;text-align:center">Engaged → KPI #6</th>
          <th style="min-width:80px;text-align:center">Mtg Scheduled</th>
          <th style="min-width:140px">Mtg Date</th>
          <th style="min-width:140px">Notes</th>
        </tr></thead>
        <tbody id="aemBody"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- MEETING TRACKER PANEL -->
<div class="panel" id="pMeetings">
  <div class="panel-hdr">
    <div class="panel-title">📋 Meeting Tracker</div>
    <div style="display:flex;align-items:center;gap:8px">
      <button class="form-toggle-btn" onclick="toggleMtgForm()">+ Add Meeting</button>
      <button class="panel-close" onclick="closeAllPanels()">✕</button>
    </div>
  </div>
  <div class="panel-body">
    <div class="p-stats">
      <div class="p-stat"><div class="sv" style="color:var(--purple)" id="mtgTotal">7</div><div class="sl">Total</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--green)" id="mtgConf">6</div><div class="sl">Confirmed</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--amber)" id="mtgProg">1</div><div class="sl">In Progress</div></div>
    </div>

    <div class="add-row-form" id="mtgAddForm" style="display:none">
      <div class="add-row-title">➕ Add New Meeting</div>
      <div class="add-row-grid">
        <div class="add-field"><label>Name *</label><input id="mf_name" placeholder="Contact name"></div>
        <div class="add-field"><label>Title</label><input id="mf_title" placeholder="Job title"></div>
        <div class="add-field"><label>Account *</label><input id="mf_account" placeholder="Agency / org"></div>
        <div class="add-field"><label>Source (BDR)</label><input id="mf_source" placeholder="e.g. Chris Lim"></div>
        <div class="add-field"><label>Account Director</label><input id="mf_ad" placeholder="e.g. Tom Cook"></div>
        <div class="add-field"><label>Status</label>
          <select id="mf_status"><option>Confirmed</option><option>In-Progress</option><option>Scheduled</option><option>Completed</option></select>
        </div>
        <div class="add-field"><label>Date</label><input id="mf_date" placeholder="e.g. 3/25/26"></div>
        <div class="add-field"><label>Notes</label><input id="mf_notes" placeholder="Key takeaways..."></div>
      </div>
      <button class="add-btn" onclick="addMeeting()">Add to Tracker →</button>
    </div>

    <input class="p-search" id="mtgSearch" placeholder="Search name, account, AD..." oninput="renderMeetings()">
    <div class="p-tbl-wrap">
      <table class="p-tbl">
        <thead><tr>
          <th onclick="sortTbl('mtg','name')">Name ↕</th>
          <th>Title</th>
          <th onclick="sortTbl('mtg','account')">Account ↕</th>
          <th onclick="sortTbl('mtg','ad')">AD ↕</th>
          <th onclick="sortTbl('mtg','status')">Status ↕</th>
          <th onclick="sortTbl('mtg','date')">Date ↕</th>
          <th>Notes</th>
          <th style="text-align:center">Remove</th>
        </tr></thead>
        <tbody id="mtgBody"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- COMPETITION PANEL -->
<div class="panel wide" id="pComp">
  <div class="panel-hdr">
    <div class="panel-title">🧩 Competition — Competitive Positioning</div>
    <button class="panel-close" onclick="closeAllPanels()">✕</button>
  </div>
  <div class="panel-body">
    <div class="p-stats">
      <div class="p-stat"><div class="sv" style="color:var(--red)">5</div><div class="sl">Features Dominant</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--green)">6</div><div class="sl">Full Checkmarks</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--amber)">4</div><div class="sl">Competitors</div></div>
      <div class="p-stat" style="border-color:rgba(250,15,0,.3)"><div class="sv" style="color:var(--red);font-size:14px;margin-top:3px">Leader</div><div class="sl">Overall Position</div></div>
    </div>
    <div class="comp-tbl-wrap">
      <table class="comp-tbl">
        <thead><tr><th style="min-width:180px">Feature / Capability</th><th style="text-align:center;color:var(--red);min-width:120px">Adobe LLM Optimizer</th><th style="text-align:center;min-width:90px">Scrunch</th><th style="text-align:center;min-width:130px">Semrush AI Visibility Toolkit</th><th style="text-align:center;min-width:90px">Profound</th><th style="text-align:center;min-width:80px">Peec AI</th></tr></thead>
        <tbody id="compBody"></tbody>
      </table>
    </div>
    <div class="diff-box">
      <div class="diff-box-title">Key Differentiators</div>
      <div class="diff-grid">
        <div class="diff-item"><span>→</span><span>Only solution with <strong style="color:var(--text)">Strong</strong> actionable workflow &amp; deployment</span></div>
        <div class="diff-item"><span>→</span><span>Only solution with <strong style="color:var(--text)">full</strong> attribution to business outcomes</span></div>
        <div class="diff-item"><span>→</span><span><strong style="color:var(--text)">Strong</strong> enterprise integrations vs Moderate/Lighter for competitors</span></div>
        <div class="diff-item"><span>→</span><span>Only platform with native <strong style="color:var(--text)">Government</strong> content management at scale</span></div>
      </div>
    </div>
  </div>
</div>

<!-- HEADER -->
<header class="hdr">
  <div class="hdr-left">
    <div class="logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 501.71 444.05" fill="white"><polygon points="297.58 444.05 261.13 342.65 169.67 342.65 246.54 149.12 363.19 444.05 501.71 444.05 316.8 0 186.23 0 0 444.05 297.58 444.05 297.58 444.05"/></svg></div>
    <div><div class="hdr-title">Adobe LLM Optimizer · SLG Strategic Initiative <span class="live" style="vertical-align:middle;margin-left:8px">Live Tracker</span></div><div class="hdr-sub">Executive Sponsor: Phil Jackson · All 50 US States</div></div>
  </div>
  <div class="hdr-right">
    <button class="pill" onclick="openPanel('Targets')" style="color:var(--blue);border-color:rgba(59,130,246,.3)">Target Customers</button>
    <button class="pill" onclick="openPanel('AEM')" style="color:var(--amber);border-color:rgba(245,158,11,.3)">AEM Customers</button>
    <button class="pill" onclick="openPanel('Meetings')" style="color:var(--purple);border-color:rgba(168,85,247,.3)">Partner Sourced / Sales Activity</button>
    <button class="pill" onclick="openPanel('BDR')" style="color:#0891b2;border-color:rgba(8,145,178,.3)">Sales / BDR Sourced Meetings</button>
    <button class="pill" onclick="openPanel('GR')" style="color:#0ea5e9;border-color:rgba(14,165,233,.3)">GR / Lobbyist Sourced Meetings</button>
    <button class="pill" onclick="openPanel('Comp')" style="color:var(--red);border-color:rgba(250,15,0,.3)">Competition</button>
    <button class="pill" onclick="openPanel('Pursuit')" style="color:#0ea5e9;border-color:rgba(14,165,233,.35)">PURSUIT-Signals</button>
    <button class="pill" onclick="publishSnapshot()" style="color:var(--green);border-color:rgba(34,197,94,.3)">Publish Snapshot</button>
  </div>
</header>

<main class="main">

  <div class="banner">
    <div><h2>Position Adobe <span>LLM Optimizer</span> as the leading AI Engine Visibility Solution for Government</h2><p>State &amp; Local Government · Tier 1 Target Accounts · Ecosystem-Driven, Repeatable Framework</p></div>
    <div class="tam-row">
      <div class="tam-item"><div class="tam-val">$55.4M</div><div class="tam-lbl">Total Addressable Market</div></div>
      <div class="tam-item"><div class="tam-val">738</div><div class="tam-lbl">Tier 1 Accounts</div></div>
      <div class="tam-item"><div class="tam-val">$75K</div><div class="tam-lbl">Avg Deal Size</div></div>
    </div>
  </div>

  <div class="sec-lbl">Three Core Pain Points Addressed</div>
  <div class="pain-grid" style="margin-bottom:24px">
    <div class="pain-card"><div class="pain-icon" style="background:var(--blue-dim)">👁</div><div><div class="pain-label">Visibility</div><div class="pain-desc">Is government website content visible to AI agents from ChatGPT, Copilot, Gemini &amp; others?</div></div></div>
    <div class="pain-card"><div class="pain-icon" style="background:var(--green-dim)">📌</div><div><div class="pain-label">Mention &amp; Citation</div><div class="pain-desc">Are government agencies mentioned and their websites cited by AI platforms?</div></div></div>
    <div class="pain-card"><div class="pain-icon" style="background:var(--amber-dim)">📊</div><div><div class="pain-label">Sentiment</div><div class="pain-desc">Are sentiments associated with government agencies positive or negative in AI responses?</div></div></div>
  </div>

  <div class="sec-lbl" style="justify-content:flex-start;gap:16px">
    Performance Dials
    <div class="wk-selector">Showing: <select class="wk-select" id="dialWkSel" onchange="onDialWkChange(this.value)"></select></div>
  </div>
  <div class="dials-grid" id="dialsGrid"></div>

  <div class="sec-lbl">KPI Performance — <span id="kpiWeekLbl">—</span></div>
  <div class="kpi-grid" id="kpiGrid"></div>

  <div class="sec-lbl">Catchup Required — Weekly Average Needed to Hit Q2 Goals · <span id="cuWeekLbl">—</span></div>
  <div class="catchup-grid" id="catchupGrid"></div>

  <div class="sec-lbl">Ecosystem Breakdown · <span id="ecoWeekLbl">—</span></div>
  <div class="eco-grid" id="ecoGrid"></div>

  <div class="sec-lbl">Weekly KPI Tracker · Q2 2026 — All Weeks</div>
  <div class="table-card">
    <div class="table-card-hdr"><h3>Target vs. Actual by Week</h3><div style="font-size:10px;color:var(--muted)">Red = active dial week</div></div>
    <div class="tbl-wrap"><table id="weeklyTable"></table></div>
  </div>

  <div class="sec-lbl">Marketing &amp; Gov Relations Events · 2026</div>
  <div class="events-card">
    <div style="display:flex;gap:14px;font-size:9px;color:var(--muted);flex-wrap:wrap">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:var(--dim);opacity:.5;display:inline-block"></span>Past</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:var(--red);display:inline-block"></span>Marketing</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:var(--blue);display:inline-block"></span>Gov Relations</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:var(--dim);display:inline-block"></span>Date TBD</span>
    </div>
    <div class="events-scroll">
      <div class="ev-chip" style="opacity:.4"><div class="ev-date" style="color:var(--dim)">Mar 12, 2026 · Past</div><div class="ev-name" style="color:var(--muted)">Adobe AI Forum — Dallas</div><div class="ev-loc">Dallas, TX</div></div>
      <div class="ev-chip" style="opacity:.4"><div class="ev-date" style="color:var(--dim)">Mar 18, 2026 · Past</div><div class="ev-name" style="color:var(--muted)">OhioX GovTech Summit</div><div class="ev-loc">Columbus, OH</div></div>
      <div class="ev-chip" style="border-color:rgba(59,130,246,.45)"><div class="ev-date" style="color:var(--blue)">Mar 27, 2026 · Gov Relations</div><div class="ev-name">LLMO Enablement for SLG Lobbyists</div><div class="ev-loc">Virtual</div></div>
      <div class="ev-chip"><div class="ev-date">Apr 14–15, 2026</div><div class="ev-name">CA CIO Academy</div><div class="ev-loc">Sacramento, CA</div></div>
      <div class="ev-chip"><div class="ev-date">Apr 26–29, 2026</div><div class="ev-name">NASCIO Mid-Year</div><div class="ev-loc">Philadelphia, PA</div></div>
      <div class="ev-chip"><div class="ev-date">May 11–13, 2026</div><div class="ev-name">NAGC</div><div class="ev-loc">Palm Springs, CA</div></div>
      <div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — Seattle</div><div class="ev-loc">Seattle, WA</div></div>
      <div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — New York</div><div class="ev-loc">New York, NY</div></div>
      <div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — Columbus</div><div class="ev-loc">Columbus, OH</div></div>
      <div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — Minneapolis</div><div class="ev-loc">Minneapolis, MN</div></div>
      <div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — Los Angeles</div><div class="ev-loc">Los Angeles, CA</div></div>
      <div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — Boston</div><div class="ev-loc">Boston, MA</div></div>
      <div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — Chicago</div><div class="ev-loc">Chicago, IL</div></div>
      <div class="ev-chip" style="border-color:rgba(250,15,0,.2)"><div class="ev-date" style="color:var(--dim)">Date TBD</div><div class="ev-name">Adobe AI Forum — San Francisco</div><div class="ev-loc">San Francisco, CA</div></div>
    </div>
  </div>

</main>
<div class="footer">Adobe LLMO · SLG Strategic Initiative · Q2 2026 · Confidential — Internal Use Only · Data stored locally in each viewer's browser</div>

<!-- PURSUIT-SIGNALS PANEL -->
<div class="panel" id="pPursuit">
  <div class="panel-hdr">
    <div class="panel-title">🔍 PURSUIT-Signals Tracker</div>
    <div style="display:flex;align-items:center;gap:8px">
      <a href="https://app.pursuit.us/research/26749" target="_blank" style="font-size:10px;color:#0ea5e9;text-decoration:none;border:1px solid rgba(14,165,233,.35);border-radius:12px;padding:3px 9px;">↗ Open PURSUIT App</a>
      <button class="form-toggle-btn" onclick="togglePursuitForm()">+ Add Signal</button>
      <button class="panel-close" onclick="closeAllPanels()">✕</button>
    </div>
  </div>
  <div class="panel-body">

    <!-- Stats row -->
    <div class="p-stats">
      <div class="p-stat"><div class="sv" style="color:#0ea5e9" id="ps-total">0</div><div class="sl">Total</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--green)" id="ps-engaged">0</div><div class="sl">Engaged (→ KPI #7)</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--green)" id="ps-qual">0</div><div class="sl">Qualified</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--red)" id="ps-dq">0</div><div class="sl">Disqualified</div></div>
      <div class="p-stat"><div class="sv" style="color:var(--amber)" id="ps-pend">0</div><div class="sl">Pending</div></div>
    </div>

    <!-- Add form -->
    <div class="add-row-form" id="pursuitAddForm" style="display:none">
      <div class="add-row-title">➕ Add New Signal</div>
      <div class="add-row-grid">
        <div class="add-field">
          <label>Week Of *</label>
          <select id="pf_week">
            <option value="">— Select week —</option>
            <option value="Week 7 (Mar 16)">Week 7 (Mar 16)</option>
            <option value="Week 8 (Mar 23)">Week 8 (Mar 23)</option>
            <option value="Week 11 (Mar 30)">Week 11 (Mar 30)</option>
            <option value="Week 12 (Apr 6)">Week 12 (Apr 6)</option>
            <option value="Week 13 (Apr 13)">Week 13 (Apr 13)</option>
            <option value="Week 14 (Apr 20)">Week 14 (Apr 20)</option>
            <option value="Week 15 (Apr 27)">Week 15 (Apr 27)</option>
            <option value="Week 16 (May 4)">Week 16 (May 4)</option>
            <option value="Week 17 (May 11)">Week 17 (May 11)</option>
            <option value="Week 18 (May 18)">Week 18 (May 18)</option>
            <option value="Week 19 (May 25)">Week 19 (May 25)</option>
          </select>
        </div>
        <div class="add-field">
          <label>Date of Signal</label>
          <input id="pf_date" type="date">
        </div>
        <div class="add-field">
          <label>Qualify / DQ</label>
          <select id="pf_qualify">
            <option value="Pending">Pending</option>
            <option value="Qualified">Qualified</option>
            <option value="Disqualified">Disqualified</option>
          </select>
        </div>
        <div class="add-field">
          <label>Assigned to (AD)</label>
          <input id="pf_ad" placeholder="e.g. Tom Cook">
        </div>
        <div class="add-field">
          <label>Name of Account</label>
          <input id="pf_account" placeholder="Agency / org name">
        </div>
        <div class="add-field">
          <label>State</label>
          <input id="pf_state" placeholder="e.g. Texas">
        </div>
        <div class="add-field">
          <label>Type</label>
          <select id="pf_type">
            <option value="">— Select —</option>
            <option value="State">State</option>
            <option value="County">County</option>
            <option value="City">City</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="add-field">
          <label>Signal</label>
          <input id="pf_signal" placeholder="Brief description of signal">
        </div>
        <div class="add-field">
          <label>Engaged</label>
          <select id="pf_engaged">
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </div>
        <div class="add-field">
          <label>Notes</label>
          <input id="pf_notes" placeholder="Additional notes...">
        </div>
        <div class="add-field" style="grid-column:1/-1">
          <label>Link to Pursuit Signal (URL)</label>
          <input id="pf_link" type="url" placeholder="https://...">
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="add-btn" onclick="savePursuitSignal()">Save Signal →</button>
        <button class="add-btn" style="background:var(--card2);color:var(--text);border:1px solid var(--border)" onclick="togglePursuitForm()">Cancel</button>
      </div>
    </div>

    <input class="p-search" id="pursuitSearch" placeholder="Search account, state, AD, signal..." oninput="renderPursuit()">
    <div class="p-tbl-wrap">
      <table class="p-tbl" style="min-width:820px">
        <thead><tr>
          <th>Week Of</th>
          <th>Date of Signal</th>
          <th>Engaged</th>
          <th>Qualify / DQ</th>
          <th>Notes</th>
          <th>Assigned to (AD)</th>
          <th>Account</th>
          <th>State</th>
          <th>Type</th>
          <th>Signal</th>
          <th>Signal Link</th>
          <th style="text-align:center">Remove</th>
        </tr></thead>
        <tbody id="pursuitBody"></tbody>
      </table>
    </div>
  </div>
</div>




<!-- SLIDE PANEL OVERLAY -->
<div class="overlay-bg" id="overlayBg" onclick="closeSlidePanel()"></div>

<!-- PANEL: PARTNER SOURCED / SALES ACTIVITY -->
<div class="slide-panel" id="panelMeetings">
  <div class="sp-header">
    <div class="sp-title">🤝 Partner Sourced / Sales Activity</div>
    <button class="sp-close" onclick="closeSlidePanel()">✕</button>
  </div>
  <div class="sp-body">
    <div id="sales-form" style="display:none;background:rgba(37,99,235,.05);border:1px solid rgba(37,99,235,.2);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;color:#2563eb;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;" id="sales-form-title">New Activity</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Account</label>
          <input id="sf-account" placeholder="Account name" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Partner</label>
          <input id="sf-partner" placeholder="Partner name" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Contacted</label>
          <select id="sf-contacted" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;">
            <option value="">—</option><option value="Yes">Yes</option><option value="No">No</option>
          </select></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Date of Meeting</label>
          <input id="sf-date" type="date" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Assign To</label>
          <input id="sf-assignTo" placeholder="Assign to..." style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Notes</label>
          <input id="sf-notes" placeholder="Notes..." style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="saveSalesForm()" style="background:var(--red);color:#fff;border:none;border-radius:7px;padding:8px 18px;font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;">Save Entry</button>
        <button onclick="cancelSalesForm()" style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:7px;padding:8px 14px;font-size:13px;font-family:'DM Sans',sans-serif;cursor:pointer;">Cancel</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <span style="font-size:11px;color:var(--muted);" id="sales-count"></span>
      <button onclick="openSalesForm(-1)" style="background:var(--red);color:#fff;border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;">+ Add Activity</button>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border);">
      <table class="pt" style="min-width:740px;">
        <thead><tr>
          <th>Account</th><th>Partner</th><th>Contacted</th><th>Date of Meeting</th><th>Assign To</th><th>Notes</th><th></th>
        </tr></thead>
        <tbody id="sales-tbody"></tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--dim);margin-top:10px;">Data saved in your browser · updates KPI #4 Partner-Sourced Meetings automatically</div>
  </div>
</div>

<!-- PANEL: SALES / BDR SOURCED MEETINGS -->
<div class="slide-panel" id="panelBDR">
  <div class="sp-header">
    <div class="sp-title">📞 Sales / BDR Sourced Meetings</div>
    <button class="sp-close" onclick="closeSlidePanel()">✕</button>
  </div>
  <div class="sp-body">
    <div id="bdr-form" style="display:none;background:rgba(8,145,178,.05);border:1px solid rgba(8,145,178,.25);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;color:#0891b2;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;" id="bdr-form-title">New Meeting</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Account</label>
          <input id="bf-account" placeholder="Account name" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Assign To (BDR / AD)</label>
          <input id="bf-assignTo" placeholder="e.g. BDR - Brett M" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Entry Date <span style="color:var(--red);">★</span> <span style="color:var(--dim);font-size:9px;">(used for KPI week)</span></label>
          <input id="bf-entryDate" type="date" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Date of Meeting</label>
          <input id="bf-meetingDate" type="date" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div style="grid-column:1/-1;"><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Notes</label>
          <input id="bf-notes" placeholder="Notes..." style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="saveBDRForm()" style="background:var(--red);color:#fff;border:none;border-radius:7px;padding:8px 18px;font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;">Save Meeting</button>
        <button onclick="cancelBDRForm()" style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:7px;padding:8px 14px;font-size:13px;font-family:'DM Sans',sans-serif;cursor:pointer;">Cancel</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <span style="font-size:11px;color:var(--muted);" id="bdr-count"></span>
      <button onclick="openBDRForm(-1)" style="background:var(--red);color:#fff;border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;">+ Add Meeting</button>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border);">
      <table class="pt" style="min-width:720px;">
        <thead><tr>
          <th>Account</th><th>Assign To</th><th>Entry Date <span style="color:var(--red);font-size:9px;">★ KPI week</span></th><th>Date of Meeting</th><th>KPI Week</th><th>Notes</th><th></th>
        </tr></thead>
        <tbody id="bdr-tbody"></tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--dim);margin-top:10px;">Entry Date determines which week this counts toward KPI #2 Scheduled Meetings</div>
  </div>
</div>

<!-- PANEL: GR / LOBBYIST SOURCED MEETINGS → KPI #5 -->
<div class="slide-panel" id="panelGR">
  <div class="sp-header">
    <div class="sp-title">🏛 GR / Lobbyist Sourced Meetings</div>
    <button class="sp-close" onclick="closeSlidePanel()">✕</button>
  </div>
  <div class="sp-body">
    <div id="gr-form" style="display:none;background:rgba(14,165,233,.05);border:1px solid rgba(14,165,233,.25);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;color:#0ea5e9;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;" id="gr-form-title">New Meeting</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Account</label>
          <input id="gf-account" placeholder="Account name" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Assign To (Lobbyist / GR)</label>
          <input id="gf-assignTo" placeholder="e.g. Lobbyist - Jane Smith" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Entry Date <span style="color:#0ea5e9;font-size:9px;">auto-stamped · editable</span></label>
          <input id="gf-entryDate" type="date" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Date of Meeting</label>
          <input id="gf-meetingDate" type="date" style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
        <div style="grid-column:1/-1;"><label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Notes</label>
          <input id="gf-notes" placeholder="Notes..." style="width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 10px;font-size:13px;font-family:'DM Sans',sans-serif;"></div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="saveGRForm()" style="background:#0ea5e9;color:#fff;border:none;border-radius:7px;padding:8px 18px;font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;">Save Meeting</button>
        <button onclick="cancelGRForm()" style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:7px;padding:8px 14px;font-size:13px;font-family:'DM Sans',sans-serif;cursor:pointer;">Cancel</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <span style="font-size:11px;color:var(--muted);" id="gr-count"></span>
      <button onclick="openGRForm(-1)" style="background:#0ea5e9;color:#fff;border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;">+ Add Meeting</button>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border);">
      <table class="pt" style="min-width:760px;">
        <thead><tr>
          <th>Account</th><th>Assign To</th><th>Entry Date</th><th>Date of Meeting</th><th>KPI #5 Week</th><th>Notes</th><th></th>
        </tr></thead>
        <tbody id="gr-tbody"></tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--dim);margin-top:10px;">Entry Date determines which weekly KPI #5 bucket this meeting counts toward · Data saved in your browser</div>
  </div>
</div>


  `;

  // 5. Load dashboard init script in global scope so onclick handlers can find functions
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/blocks/llmo-dashboard/llmo-dashboard-init.js';
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });

  // 6. Rewire inline event handlers to comply with CSP
  // (nonce-based CSP suppresses unsafe-inline, blocking onclick/oninput/onchange attributes)

  function parseArgs(argsStr, element) {
    if (!argsStr.trim()) return [];
    const parts = [];
    let cur = '';
    let inStr = false;
    let strChar = '';
    for (const ch of argsStr) {
      if (!inStr && (ch === "'" || ch === '"')) { inStr = true; strChar = ch; cur += ch; }
      else if (inStr && ch === strChar) { inStr = false; cur += ch; }
      else if (!inStr && ch === ',') { parts.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts.map((a) => {
      if ((a.startsWith("'") && a.endsWith("'")) || (a.startsWith('"') && a.endsWith('"'))) return a.slice(1, -1);
      if (a === 'this') return element;
      if (a === 'this.value') return element.value;
      const n = Number(a);
      return Number.isNaN(n) ? a : n;
    });
  }

  function rewireAttr(el, attr, evtName) {
    const raw = el.getAttribute(attr);
    if (!raw) return;
    el.removeAttribute(attr);

    // event.stopPropagation(); fnName(args)
    const stopProp = raw.match(/^event\.stopPropagation\(\);\s*(\w+)\((.*)\)$/s);
    if (stopProp) {
      const [, fn, argsStr] = stopProp;
      el.addEventListener(evtName, (e) => { e.stopPropagation(); window[fn]?.(...parseArgs(argsStr, el)); });
      return;
    }
    // document.getElementById('id').classList.toggle('cls')
    const togDom = raw.match(/^document\.getElementById\('([^']+)'\)\.classList\.toggle\('([^']+)'\)$/);
    if (togDom) {
      const [, id, cls] = togDom;
      el.addEventListener(evtName, () => document.getElementById(id)?.classList.toggle(cls));
      return;
    }
    // fnName(args) — standard case; use regular function so `this` = element at call time
    const simple = raw.match(/^(\w+)\((.*)\)$/s);
    if (simple) {
      const [, fn, argsStr] = simple;
      // eslint-disable-next-line func-names
      el.addEventListener(evtName, function rewired() { window[fn]?.(...parseArgs(argsStr, this)); });
    }
  }

  const INLINE_EVENTS = [
    ['onclick', 'click'],
    ['onchange', 'change'],
    ['oninput', 'input'],
  ];

  function rewireAll(root) {
    INLINE_EVENTS.forEach(([attr, evt]) => {
      if (root.hasAttribute?.(attr)) rewireAttr(root, attr, evt);
      root.querySelectorAll(`[${attr}]`).forEach((el) => rewireAttr(el, attr, evt));
    });
  }

  rewireAll(block);

  // Catch handlers on elements added dynamically by the init script
  new MutationObserver((mutations) => {
    mutations.forEach(({ addedNodes }) => addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      rewireAll(node);
    }));
  }).observe(block, { childList: true, subtree: true });
}
