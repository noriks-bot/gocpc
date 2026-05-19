// goCPC SPA — hash router + 4 pages
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const main = $('#main');

const COUNTRY_NAMES = {
  HR: 'Hrvaška', CZ: 'Češka', PL: 'Poljska', GR: 'Grčija',
  IT: 'Italija', HU: 'Madžarska', SK: 'Slovaška', SI: 'Slovenija',
  DE: 'Nemčija', RO: 'Romunija', BG: 'Bolgarija'
};

const COUNTRY_URLS = {
  HR: 'https://noriks.com/hr/', CZ: 'https://noriks.com/cz/',
  PL: 'https://noriks.com/pl/', GR: 'https://noriks.com/gr/',
  IT: 'https://noriks.com/it/', HU: 'https://noriks.com/hu/',
  SK: 'https://noriks.com/sk/', SI: 'https://noriks.com/sl/',
  RO: 'https://noriks.com/ro/', DE: 'https://noriks.com/de/',
  BG: 'https://noriks.com/bg/'
};

const HEADLINES = {
  HR: ['PIVSKI TRBUH?', 'PROBAJ OVO.', 'OPROSTITE!'],
  SK: ['PIVNÉ BRUŠKO?', 'VYSKÚŠAJTE TOTO.', 'PERFEKTNÝ STRIH'],
  CZ: ['PIVNÍ BŘICHO?', 'VYZKOUŠEJ TOHLE.', 'PERFEKTNÍ STŘIH'],
  HU: ['SÖRHAS?', 'PRÓBÁLD KI EZT.', 'TÖKÉLETES SZABÁS'],
  PL: ['PIWNY BRZUCH?', 'SPRÓBUJ TEGO.', 'IDEALNY KRÓJ'],
  GR: ['ΚΟΙΛΙΑ ΑΠΟ ΜΠΥΡΑ?', 'ΔΟΚΙΜΑΣΕ ΑΥΤΟ.', 'ΤΕΛΕΙΑ ΕΦΑΡΜΟΓΗ'],
  IT: ['PANCIA DA BIRRA?', 'PROVA QUESTO.', 'TAGLIO PERFETTO'],
  SI: ['PIVSKI TREBUH?', 'PREIZKUSI TO.', 'OPROSTITE!'],
  DE: ['BIERBAUCH?', 'PROBIER DAS.', 'PERFEKTER SCHNITT'],
  RO: ['BURTA DE BERE?', 'ÎNCEARCĂ ASTA.', 'CROIALA PERFECTĂ'],
  BG: ['БИРЕНО ШКЕМБЕ?', 'ОПИТАЙ ТОВА.', 'ПЕРФЕКТНА КРОЙКА']
};

const DESCRIPTIONS = {
  HR: ['Majica koja skriva trbuh, ističe ramena. 30 dana bez rizika.', 'Perfect Fit garantovan. Besplatna dostava iznad 70€.'],
  SK: ['Tričko ktoré skryje bruško a zvýrazní ramená. 30 dní bez rizika.', 'Perfect Fit zaručený. Doprava zdarma nad 70€.'],
  CZ: ['Tričko které skryje břicho a zvýrazní ramena. 30 dní bez rizika.', 'Perfect Fit zaručený. Doprava zdarma nad 70€.'],
  HU: ['Póló ami elrejti a sörhasat. 30 nap visszafizetési garancia.', 'Perfect Fit garantált. Ingyenes szállítás 70€ felett.'],
  PL: ['Koszulka która ukrywa brzuch i podkreśla ramiona.', 'Perfect Fit gwarantowany. Darmowa dostawa od 70€.'],
  GR: ['Μπλούζα που κρύβει την κοιλιά. 30 ημέρες χωρίς ρίσκο.', 'Perfect Fit εγγυημένο. Δωρεάν παράδοση άνω των 70€.'],
  IT: ['Maglietta che nasconde la pancia ed evidenzia le spalle.', 'Perfect Fit garantito. Spedizione gratuita sopra i 70€.'],
  SI: ['Majica, ki skrije trebuh in poudari ramena. 30 dni brez tveganja.', 'Perfect Fit zagotovljen. Brezplačna dostava nad 70€.'],
  DE: ['Shirt das Bauch verbirgt und Schultern betont.', 'Perfect Fit garantiert. Kostenloser Versand ab 70€.'],
  RO: ['Tricou care ascunde burta și subliniază umerii.', 'Perfect Fit garantat. Livrare gratuită peste 70€.'],
  BG: ['Тениска която скрива корема и подчертава раменете.', 'Perfect Fit гарантиран. Безплатна доставка над 70€.']
};

let APP_ACCOUNTS = {};
let APP_USER = null;

function fmt(n, dec = 0) {
  if (n == null || isNaN(n)) return '–';
  return Number(n).toLocaleString('sl-SI', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function eur(n) { return n == null ? '–' : '€' + fmt(n, 2); }
function pct(n) { return n == null ? '–' : fmt(n * 100, 2) + '%'; }
function escHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- Sortable tables ----------
function wireSortable(root = document) {
  root.querySelectorAll('table[data-sortable]').forEach((table) => {
    const ths = [...(table.tHead?.rows[0]?.cells || [])];
    ths.forEach((th, idx) => {
      if (th.dataset.nosort === '1') return;
      th.classList.add('sortable');
      th.addEventListener('click', () => sortTable(table, idx, th));
    });
  });
}

function parseSortValue(td) {
  if (!td) return null;
  const ds = td.dataset.sort;
  if (ds != null && ds !== '') {
    const n = Number(ds);
    return isNaN(n) ? ds.toLowerCase() : n;
  }
  const txt = (td.textContent || '').trim();
  if (!txt || txt === '–') return null;
  const numMatch = txt.replace(/\s|€|x|%/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(numMatch);
  if (!isNaN(n) && /\d/.test(txt)) return n;
  return txt.toLowerCase();
}

function sortTable(table, colIdx, th) {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const rows = [...tbody.rows].filter((r) => !r.dataset.skipSort);
  const otherRows = [...tbody.rows].filter((r) => r.dataset.skipSort);

  const currentDir = th.classList.contains('sort-asc') ? 'asc'
    : th.classList.contains('sort-desc') ? 'desc' : null;
  let newDir;
  if (currentDir === null) {
    const sample = rows[0]?.cells[colIdx];
    newDir = typeof parseSortValue(sample) === 'number' ? 'desc' : 'asc';
  } else {
    newDir = currentDir === 'asc' ? 'desc' : 'asc';
  }

  [...th.parentNode.cells].forEach((t) => t.classList.remove('sort-asc', 'sort-desc'));
  th.classList.add(newDir === 'asc' ? 'sort-asc' : 'sort-desc');

  const dirMul = newDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const va = parseSortValue(a.cells[colIdx]);
    const vb = parseSortValue(b.cells[colIdx]);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dirMul;
    return String(va).localeCompare(String(vb), 'sl-SI', { numeric: true }) * dirMul;
  });

  rows.forEach((r) => tbody.appendChild(r));
  otherRows.forEach((r) => tbody.appendChild(r));
}

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  if (r.status === 401) {
    location.href = '/login.html';
    throw new Error('unauthorized');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// Client-side cache layer (localStorage) — instant render + background refresh
const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_KEY_PREFIX = 'gocpc:v1:';

function cacheLoad(path) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + path);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !o.ts) return null;
    return o; // { ts, data }
  } catch { return null; }
}
function cacheSave(path, data) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + path, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    // quota or disabled — ignore
  }
}

/**
 * apiSWR(path, render)
 *  - if localStorage has data: call render(data, { stale: true, ageMs }) IMMEDIATELY
 *  - then fetch fresh, save to localStorage, and call render(data, { stale: false, ageMs })
 *  - returns the final fresh data (or throws)
 */
async function apiSWR(path, render) {
  const cached = cacheLoad(path);
  if (cached) {
    const age = Date.now() - cached.ts;
    try { render(cached.data, { stale: true, ageMs: age, fromCache: true }); } catch (e) { console.error(e); }
  }
  try {
    const fresh = await api(path);
    cacheSave(path, fresh);
    try { render(fresh, { stale: false, ageMs: 0, fromCache: false }); } catch (e) { console.error(e); }
    return fresh;
  } catch (e) {
    if (!cached) throw e;
    // we already rendered stale, just log
    console.warn('refresh failed, kept stale:', e.message);
    return cached.data;
  }
}

function fmtAge(ms) {
  if (ms < 1000) return 'just now';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

function cacheBadge(meta) {
  if (!meta) return '';
  if (meta.stale) return `<span class="cache-badge stale" title="iz cache, osvežujem v ozadju">⏳ cache ${fmtAge(meta.ageMs)}</span>`;
  return `<span class="cache-badge fresh">✓ live</span>`;
}

let CURRENT_RANGE = 'LAST_30_DAYS';
function getRange() {
  const v = $('#rangeSel')?.value;
  if (v) CURRENT_RANGE = v;
  return CURRENT_RANGE;
}

function pageShell(title, withRange = true) {
  main.innerHTML = `
    <div class="topbar">
      <h2>${escHTML(title)}</h2>
      ${withRange ? `
        <div class="range">
          <label>Range:</label>
          <select id="rangeSel">
            <option value="LAST_7_DAYS">Last 7 days</option>
            <option value="LAST_14_DAYS">Last 14 days</option>
            <option value="LAST_30_DAYS" selected>Last 30 days</option>
            <option value="LAST_90_DAYS">Last 90 days</option>
            <option value="THIS_MONTH">This month</option>
            <option value="LAST_MONTH">Last month</option>
          </select>
          <button id="refreshBtn">Refresh</button>
        </div>` : ''
      }
    </div>
    <div class="content" id="pageContent">
      <div class="loading">Loading…</div>
    </div>
  `;
  if (withRange) {
    // restore selected range after re-render
    const sel = $('#rangeSel');
    if (sel) sel.value = CURRENT_RANGE;
    sel.addEventListener('change', (e) => {
      CURRENT_RANGE = e.target.value;
      router();
    });
    $('#refreshBtn').addEventListener('click', async () => {
      // force refresh: clear client + server caches for this range
      try {
        Object.keys(localStorage).forEach(k => { if (k.startsWith(CACHE_KEY_PREFIX)) localStorage.removeItem(k); });
        await fetch('/api/cache/clear', { method: 'POST' });
      } catch (e) { /* ignore */ }
      router();
    });
  }
  return $('#pageContent');
}

async function pageDashboard() {
  const content = pageShell('Dashboard');
  const path = `/api/countries-summary?range=${getRange()}`;
  try {
    await apiSWR(path, (data, meta) => renderDashboard(content, data, meta));
  } catch (e) {
    content.innerHTML = `<div class="error">${escHTML(e.message)}</div>`;
  }
}

function renderDashboard(content, data, meta) {
  try {
    const countries = data.countries || data.accounts || [];
    const tot = countries.reduce((a, c) => {
      if (c.error) return a;
      a.cost += (c.cost || 0);
      a.clicks += (c.clicks || 0);
      a.impressions += (c.impressions || 0);
      a.conversions += (c.conversions || 0);
      a.conversionsValue += (c.conversionsValue || 0);
      return a;
    }, { cost: 0, clicks: 0, impressions: 0, conversions: 0, conversionsValue: 0 });

    const roas = tot.cost ? tot.conversionsValue / tot.cost : 0;
    const cpa = tot.conversions ? tot.cost / tot.conversions : 0;
    const ctr = tot.impressions ? tot.clicks / tot.impressions : 0;

    content.innerHTML = `
      <div class="kpis">
        <div class="kpi accent"><div class="label">Skupna poraba</div><div class="value">${eur(tot.cost)}</div></div>
        <div class="kpi"><div class="label">Impressions</div><div class="value">${fmt(tot.impressions)}</div></div>
        <div class="kpi"><div class="label">Kliki</div><div class="value">${fmt(tot.clicks)}</div><div class="sub">CTR ${pct(ctr)}</div></div>
        <div class="kpi"><div class="label">Konverzije</div><div class="value">${fmt(tot.conversions, 0)}</div></div>
        <div class="kpi"><div class="label">CPA</div><div class="value">${eur(cpa)}</div></div>
        <div class="kpi accent"><div class="label">ROAS</div><div class="value">${fmt(roas, 2)}x</div></div>
      </div>

      <h3 class="section">Po državah</h3>
      <div class="table-wrap">
        <table data-sortable>
          <thead><tr>
            <th>Država</th>
            <th class="num">Impr.</th><th class="num">Kliki</th>
            <th class="num">Cost</th><th class="num">Konv.</th>
            <th class="num">Conv. value</th><th class="num">CPA</th><th class="num">ROAS</th>
          </tr></thead>
          <tbody>
            ${countries.map(c => {
              if (c.error) return `<tr><td><span class="flag">${c.country}</span></td><td colspan="7" style="color:#ff8a8a;font-size:12px">${escHTML(c.error)}</td></tr>`;
              const r = c.cost ? (c.conversionsValue / c.cost) : 0;
              const cp = c.conversions ? (c.cost / c.conversions) : 0;
              return `<tr style="cursor:pointer" onclick="location.hash='#/account/${c.country}'">
                <td><span class="flag">${c.country}</span> ${escHTML(COUNTRY_NAMES[c.country] || '')}</td>
                <td class="num">${fmt(c.impressions)}</td>
                <td class="num">${fmt(c.clicks)}</td>
                <td class="num">${eur(c.cost)}</td>
                <td class="num">${fmt(c.conversions, 0)}</td>
                <td class="num">${eur(c.conversionsValue)}</td>
                <td class="num">${eur(cp)}</td>
                <td class="num" style="color:${r>=3?'var(--green)':(r>=1?'var(--text)':'var(--red)')}">${fmt(r, 2)}x</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td class="label-cell">SKUPAJ</td>
              <td class="num">${fmt(tot.impressions)}</td>
              <td class="num">${fmt(tot.clicks)}</td>
              <td class="num">${eur(tot.cost)}</td>
              <td class="num">${fmt(tot.conversions, 0)}</td>
              <td class="num">${eur(tot.conversionsValue)}</td>
              <td class="num">${eur(cpa)}</td>
              <td class="num">${fmt(roas, 2)}x</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    wireSortable(content);
  } catch (e) {
    content.innerHTML = `<div class="error">${escHTML(e.message)}</div>`;
  }
}

async function pageAccounts() {
  const content = pageShell('Računi / države');
  const path = `/api/countries-summary?range=${getRange()}`;
  try {
    await apiSWR(path, (data, meta) => renderAccounts(content, data, meta));
  } catch (e) {
    content.innerHTML = `<div class="error">${escHTML(e.message)}</div>`;
  }
}

function renderAccounts(content, data, meta) {
  try {
    const countries = data.countries || data.accounts || [];
    const tot = countries.reduce((a, c) => {
      if (c.error) return a;
      a.cost += (c.cost || 0);
      a.conversions += (c.conversions || 0);
      a.conversionsValue += (c.conversionsValue || 0);
      return a;
    }, { cost: 0, conversions: 0, conversionsValue: 0 });
    const totRoas = tot.cost ? tot.conversionsValue / tot.cost : 0;
    content.innerHTML = `
      <div class="notice">Klikni na državo za podrobne kampanje. ${cacheBadge(meta)}</div>
      <div class="table-wrap">
        <table data-sortable>
          <thead><tr>
            <th>Country</th><th>Customer ID</th>
            <th class="num">Spend</th><th class="num">Conv.</th>
            <th class="num">Conv. value</th><th class="num">ROAS</th>
          </tr></thead>
          <tbody>
            ${countries.map(c => {
              if (c.error) return `<tr><td><span class="flag">${c.country}</span></td><td colspan="5" style="color:#ff8a8a;font-size:12px">${escHTML(c.error)}</td></tr>`;
              const r = c.cost ? (c.conversionsValue / c.cost) : 0;
              return `<tr style="cursor:pointer" onclick="location.hash='#/account/${c.country}'">
                <td><span class="flag">${c.country}</span> ${escHTML(COUNTRY_NAMES[c.country] || '')}</td>
                <td style="color:var(--text-3);font-size:12px">${escHTML(c.customerId || '–')}</td>
                <td class="num">${eur(c.cost)}</td>
                <td class="num">${fmt(c.conversions, 1)}</td>
                <td class="num">${eur(c.conversionsValue)}</td>
                <td class="num">${fmt(r, 2)}x</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td class="label-cell">SKUPAJ</td>
              <td></td>
              <td class="num">${eur(tot.cost)}</td>
              <td class="num">${fmt(tot.conversions, 1)}</td>
              <td class="num">${eur(tot.conversionsValue)}</td>
              <td class="num">${fmt(totRoas, 2)}x</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    wireSortable(content);
  } catch (e) {
    content.innerHTML = `<div class="error">${escHTML(e.message)}</div>`;
  }
}

async function pageAccountDetail(country) {
  const content = pageShell(`${country} — ${COUNTRY_NAMES[country] || ''}`);
  const path = `/api/account/${country}?range=${getRange()}`;
  try {
    await apiSWR(path, (data, meta) => renderAccountDetail(content, data, meta, country));
  } catch (e) {
    content.innerHTML = `<div class="error">${escHTML(e.message)}</div>`;
  }
}

function renderAccountDetail(content, data, meta, country) {
  try {
    const s = data.summary || {};
    const r = s.cost ? (s.conversionsValue / s.cost) : 0;
    content.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="label">Spend</div><div class="value">${eur(s.cost)}</div><div class="sub">${s.currency || ''}</div></div>
        <div class="kpi"><div class="label">Clicks</div><div class="value">${fmt(s.clicks)}</div></div>
        <div class="kpi"><div class="label">Conversions</div><div class="value">${fmt(s.conversions, 1)}</div></div>
        <div class="kpi"><div class="label">ROAS</div><div class="value">${fmt(r, 2)}x</div></div>
      </div>

      <h3 class="section">Campaigns (${data.campaigns.length})</h3>
      <div class="table-wrap">
        <table data-sortable>
          <thead><tr>
            <th>Name</th><th>Status</th><th>Type</th>
            <th class="num">Budget/day</th>
            <th class="num">Spend</th><th class="num">Clicks</th>
            <th class="num">Conv.</th><th class="num">Conv. value</th>
            <th class="num">ROAS</th>
            <th data-nosort="1">Actions</th>
          </tr></thead>
          <tbody>
            ${data.campaigns.length ? data.campaigns.map(c => campaignRow(c, country)).join('') : '<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--text-3)">No campaigns</td></tr>'}
          </tbody>
          ${data.campaigns.length ? (() => {
            const tc = data.campaigns.reduce((a, c) => ({
              budget: a.budget + (c.dailyBudget || 0),
              cost: a.cost + (c.cost || 0),
              clicks: a.clicks + (c.clicks || 0),
              conversions: a.conversions + (c.conversions || 0),
              conversionsValue: a.conversionsValue + (c.conversionsValue || 0),
            }), { budget: 0, cost: 0, clicks: 0, conversions: 0, conversionsValue: 0 });
            const totRoas = tc.cost ? tc.conversionsValue / tc.cost : 0;
            return `<tfoot>
              <tr>
                <td class="label-cell">SKUPAJ ${data.campaigns.length}</td>
                <td></td>
                <td></td>
                <td class="num">${eur(tc.budget)}</td>
                <td class="num">${eur(tc.cost)}</td>
                <td class="num">${fmt(tc.clicks)}</td>
                <td class="num">${fmt(tc.conversions, 1)}</td>
                <td class="num">${eur(tc.conversionsValue)}</td>
                <td class="num">${fmt(totRoas, 2)}x</td>
                <td></td>
              </tr>
            </tfoot>`;
          })() : ''}
        </table>
      </div>
    `;
    wireCampaignActions(content);
    wireSortable(content);
  } catch (e) {
    content.innerHTML = `<div class="error">${escHTML(e.message)}</div>`;
  }
}

function campaignRow(c, country) {
  const isEnabled = c.status === 'ENABLED';
  const isRemoved = c.status === 'REMOVED';
  const toggleLabel = isEnabled ? 'Pause' : 'Resume';
  const toggleNext = isEnabled ? 'PAUSED' : 'ENABLED';
  const budgetCell = c.dailyBudget != null && c.dailyBudget > 0
    ? `<span class="budget-display" data-budget="${c.dailyBudget}">${eur(c.dailyBudget)}</span>`
    : '<span style="color:var(--text-3);font-size:11px">–</span>';
  return `<tr data-country="${country}" data-campaign-id="${c.id}" data-budget-resource="${escHTML(c.budgetResource || '')}">
    <td>${escHTML(c.name || '–')}</td>
    <td><span class="status-pill ${(c.status || '').toLowerCase()}">${escHTML(c.status || '–')}</span></td>
    <td style="font-size:11px;color:var(--text-3)">${escHTML(c.type || '–')}</td>
    <td class="num">${budgetCell}</td>
    <td class="num">${eur(c.cost)}</td>
    <td class="num">${fmt(c.clicks)}</td>
    <td class="num">${fmt(c.conversions, 1)}</td>
    <td class="num">${eur(c.conversionsValue)}</td>
    <td class="actions">
      ${isRemoved ? '<span style="color:var(--text-3);font-size:11px">removed</span>' : `
        <button class="btn-toggle" data-next="${toggleNext}">${toggleLabel}</button>
        <button class="btn-budget">€</button>
      `}
    </td>
  </tr>`;
}

function wireCampaignActions(scope) {
  scope.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr');
      const country = tr.dataset.country;
      const id = tr.dataset.campaignId;
      const next = e.target.dataset.next;
      if (!confirm(`${next === 'ENABLED' ? 'Vključi' : 'Zaustavi'} kampanjo?`)) return;
      e.target.disabled = true;
      e.target.textContent = '…';
      try {
        const r = await fetch(`/api/campaign/${country}/${id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        router();
      } catch (err) {
        alert('Napaka: ' + err.message);
        e.target.disabled = false;
      }
    });
  });
  scope.querySelectorAll('.btn-budget').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr');
      const country = tr.dataset.country;
      const id = tr.dataset.campaignId;
      const budgetResource = tr.dataset.budgetResource;
      const current = tr.querySelector('.budget-display')?.dataset.budget || '';
      const v = prompt(`Nov dnevni budget v EUR (trenutno ${current || '–'}):`, current);
      if (v == null) return;
      const amount = parseFloat(v);
      if (!amount || amount <= 0) { alert('Neveljaven znesek.'); return; }
      e.target.disabled = true;
      e.target.textContent = '…';
      try {
        const r = await fetch(`/api/campaign/${country}/${id}/budget`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dailyBudgetEur: amount, budgetResource }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        router();
      } catch (err) {
        alert('Napaka: ' + err.message);
        e.target.disabled = false;
        e.target.textContent = '€';
      }
    });
  });
}

async function pageCampaigns() {
  const content = pageShell('Kampanje (vse države)');
  const range = getRange();
  const path = `/api/campaigns?range=${range}`;
  const render = (data, meta) => renderCampaignsPage(content, data, meta);
  try {
    await apiSWR(path, render);
  } catch (e) {
    content.innerHTML = `<div class="error">${escHTML(e.message)}</div>`;
  }
}

function renderCampaignsPage(content, data, meta) {
  try {
    const campaigns = data.campaigns || [];
    const total = data.total != null ? data.total : campaigns.length;
    const countries = [...new Set(campaigns.map(c => c.country))];
    const tot = campaigns.reduce((a, c) => {
      if (c.error) return a;
      a.cost += (c.cost || 0); a.clicks += (c.clicks || 0);
      a.impressions += (c.impressions || 0); a.conversions += (c.conversions || 0);
      a.conversionsValue += (c.conversionsValue || 0);
      return a;
    }, { cost: 0, clicks: 0, impressions: 0, conversions: 0, conversionsValue: 0 });
    const totRoas = tot.cost ? tot.conversionsValue / tot.cost : 0;
    const totCpa = tot.conversions ? tot.cost / tot.conversions : 0;

    content.innerHTML = `
      <div class="notice">
        Skupaj <strong>${total}</strong> kampanj v ${countries.length} državah (${countries.join(', ')}), sortirano po porabi.
        ${cacheBadge(meta)}
      </div>
      <div class="filter-bar" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <button class="filter-btn active" data-filter="all">VSE (${campaigns.length})</button>
        <button class="filter-btn" data-filter="ENABLED">ENABLED (${campaigns.filter(c=>c.status==='ENABLED').length})</button>
        <button class="filter-btn" data-filter="PAUSED">PAUSED (${campaigns.filter(c=>c.status==='PAUSED').length})</button>
        <button class="filter-btn" data-filter="REMOVED">REMOVED (${campaigns.filter(c=>c.status==='REMOVED').length})</button>
      </div>
      <div class="table-wrap">
        <table id="campaignsTable" data-sortable>
          <thead><tr>
            <th>Country</th><th>Campaign</th><th>Status</th><th>Type</th>
            <th class="num">Daily €</th>
            <th class="num">Impr.</th><th class="num">Kliki</th>
            <th class="num">Spend</th><th class="num">Konv.</th>
            <th class="num">CPA</th><th class="num">ROAS</th>
            <th data-nosort="1">Actions</th>
          </tr></thead>
          <tbody>
            ${campaigns.length ? campaigns.map(c => {
              if (c.error) return `<tr data-status="ERROR"><td><span class="flag">${c.country}</span></td><td colspan="11" style="color:#ff8a8a;font-size:12px">${escHTML(c.error)}</td></tr>`;
              const r = c.cost ? (c.conversionsValue / c.cost) : 0;
              const cp = c.conversions ? (c.cost / c.conversions) : 0;
              const isEnabled = c.status === 'ENABLED';
              const isRemoved = c.status === 'REMOVED';
              const toggleLabel = isEnabled ? 'Pause' : 'Resume';
              const toggleNext = isEnabled ? 'PAUSED' : 'ENABLED';
              const budgetCell = c.dailyBudget != null && c.dailyBudget > 0
                ? `<span class="budget-display" data-budget="${c.dailyBudget}">${eur(c.dailyBudget)}</span>`
                : '<span style="color:var(--text-3);font-size:11px">–</span>';
              return `<tr data-status="${escHTML(c.status || '')}" data-country="${c.country}" data-campaign-id="${c.id}" data-budget-resource="${escHTML(c.budgetResource || '')}">
                <td><span class="flag">${c.country}</span></td>
                <td style="font-weight:500;color:var(--text)">${escHTML(c.name || '–')}</td>
                <td><span class="status-pill ${(c.status || '').toLowerCase()}">${escHTML(c.status || '–')}</span></td>
                <td style="font-size:11px;color:var(--text-3)">${escHTML(c.type || '–')}</td>
                <td class="num">${budgetCell}</td>
                <td class="num">${fmt(c.impressions)}</td>
                <td class="num">${fmt(c.clicks)}</td>
                <td class="num">${eur(c.cost)}</td>
                <td class="num">${fmt(c.conversions, 0)}</td>
                <td class="num">${eur(cp)}</td>
                <td class="num" style="color:${r>=3?'var(--green)':(r>=1?'var(--text)':(c.cost>0?'var(--red)':'var(--text-3)'))}">${fmt(r, 2)}x</td>
                <td class="actions">${isRemoved ? '<span style="color:var(--text-3);font-size:11px">removed</span>' : `<button class="btn-toggle" data-next="${toggleNext}">${toggleLabel}</button> <button class="btn-budget">€</button>`}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="12" style="text-align:center;padding:30px;color:var(--text-3)">No campaigns</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5" class="label-cell">SKUPAJ ${total}</td>
              <td class="num">${fmt(tot.impressions)}</td>
              <td class="num">${fmt(tot.clicks)}</td>
              <td class="num">${eur(tot.cost)}</td>
              <td class="num">${fmt(tot.conversions, 0)}</td>
              <td class="num">${eur(totCpa)}</td>
              <td class="num">${fmt(totRoas, 2)}x</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    // filter
    $$('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.dataset.filter;
        $$('#campaignsTable tbody tr').forEach(tr => {
          tr.style.display = (f === 'all' || tr.dataset.status === f) ? '' : 'none';
        });
      });
    });
    wireCampaignActions(content);
    wireSortable(content);
  } catch (e) {
    content.innerHTML = `<div class="error">${escHTML(e.message)}</div>`;
  }
}

function pageUpload() {
  const content = pageShell('Upload new campaign', false);
  const countries = Object.keys(APP_ACCOUNTS);

  content.innerHTML = `
    <div class="notice">
      Naloži novo <strong>Search kampanjo</strong> v Google Ads. Kampanja se kreira v statusu <strong>PAUSED</strong> — preden gre live, ročno preveri v Google Ads UI in vključi.
      Material (video/slike) se shrani za poznejšo Performance Max / video integracijo.
    </div>

    <form id="uploadForm" enctype="multipart/form-data">
      <div class="form-grid">
        <div class="field">
          <label>Country / market *</label>
          <select name="country" id="country" required>
            <option value="">— select —</option>
            ${countries.map(c => `<option value="${c}">${c} — ${COUNTRY_NAMES[c] || ''}</option>`).join('')}
          </select>
          <div class="hint">7 aktivnih MCC accountov</div>
        </div>

        <div class="field">
          <label>Campaign name *</label>
          <input name="name" required placeholder="e.g. 2026-05_HR_PivskiTrbuh_Search">
          <div class="hint">Convention: YYYY-MM_MARKET_Hook_Type</div>
        </div>

        <div class="field">
          <label>Daily budget (EUR) *</label>
          <input name="dailyBudgetEur" type="number" step="0.01" min="1" required placeholder="e.g. 25.00">
        </div>

        <div class="field">
          <label>Final URL *</label>
          <input name="finalUrl" type="url" id="finalUrl" required placeholder="https://noriks.com/…">
          <div class="hint">Landing page. Auto-fills based on country.</div>
        </div>

        <div class="field"><label>Headline 1</label><input name="headline1" id="h1" maxlength="30" placeholder="max 30 char"></div>
        <div class="field"><label>Headline 2</label><input name="headline2" id="h2" maxlength="30" placeholder="max 30 char"></div>
        <div class="field"><label>Headline 3</label><input name="headline3" id="h3" maxlength="30" placeholder="max 30 char"></div>
        <div class="field"></div>

        <div class="field full"><label>Description 1</label><textarea name="description1" id="d1" maxlength="90" placeholder="max 90 char"></textarea></div>
        <div class="field full"><label>Description 2</label><textarea name="description2" id="d2" maxlength="90" placeholder="max 90 char"></textarea></div>

        <div class="field full">
          <label>Video creatives (optional, MP4)</label>
          <label for="videos" class="dropzone">📹 Klikni za izbiro MP4 datotek (max 5, do 500MB each)</label>
          <input type="file" name="videos" id="videos" multiple accept="video/*" style="display:none">
          <div class="file-list" id="videoList"></div>
        </div>

        <div class="field full">
          <label>Image creatives (optional, JPG/PNG)</label>
          <label for="images" class="dropzone">🖼️ Klikni za izbiro slik (max 20)</label>
          <input type="file" name="images" id="images" multiple accept="image/*" style="display:none">
          <div class="file-list" id="imageList"></div>
        </div>

        <div class="full" style="display:flex;gap:12px;align-items:center;margin-top:10px">
          <button type="submit" class="primary" id="submitBtn">Create campaign (PAUSED)</button>
          <span id="formMsg" style="font-size:13px;color:var(--text-3)"></span>
        </div>
      </div>
    </form>

    <div id="result" style="margin-top:24px"></div>
  `;

  $('#country').addEventListener('change', (e) => {
    const c = e.target.value;
    if (!c) return;
    if (COUNTRY_URLS[c] && !$('#finalUrl').value) $('#finalUrl').value = COUNTRY_URLS[c];
    if (HEADLINES[c]) {
      if (!$('#h1').value) $('#h1').value = HEADLINES[c][0] || '';
      if (!$('#h2').value) $('#h2').value = HEADLINES[c][1] || '';
      if (!$('#h3').value) $('#h3').value = HEADLINES[c][2] || '';
    }
    if (DESCRIPTIONS[c]) {
      if (!$('#d1').value) $('#d1').value = DESCRIPTIONS[c][0] || '';
      if (!$('#d2').value) $('#d2').value = DESCRIPTIONS[c][1] || '';
    }
  });

  function wireFilePicker(inputId, listId) {
    const inp = $('#' + inputId);
    const list = $('#' + listId);
    inp.addEventListener('change', () => {
      list.innerHTML = [...inp.files].map(f => `
        <div class="file-item"><span>${escHTML(f.name)}</span><span>${fmt(f.size / 1024 / 1024, 2)} MB</span></div>
      `).join('');
    });
  }
  wireFilePicker('videos', 'videoList');
  wireFilePicker('images', 'imageList');

  $('#uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#submitBtn');
    const msg = $('#formMsg');
    const result = $('#result');
    btn.disabled = true;
    msg.textContent = 'Creating…';
    result.innerHTML = '';
    try {
      const fd = new FormData(e.target);
      const r = await fetch('/api/upload-campaign', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      result.innerHTML = `
        <div class="success">
          ✅ Campaign created (PAUSED) in ${j.country} — customer ${j.customerId}.<br>
          Resource: <code>${escHTML(j.campaign?.campaignResource || '')}</code>
        </div>
        <pre class="json-debug">${escHTML(JSON.stringify(j, null, 2))}</pre>
      `;
      msg.textContent = '✅ Done.';
      e.target.reset();
      $('#videoList').innerHTML = '';
      $('#imageList').innerHTML = '';
    } catch (err) {
      result.innerHTML = `<div class="error">❌ ${escHTML(err.message)}</div>`;
      msg.textContent = '';
    } finally {
      btn.disabled = false;
    }
  });
}

async function router() {
  const hash = location.hash || '#/dashboard';
  const parts = hash.replace(/^#\//, '').split('/');
  const route = parts[0] || 'dashboard';

  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));

  if (route === 'dashboard') await pageDashboard();
  else if (route === 'accounts') await pageAccounts();
  else if (route === 'campaigns') await pageCampaigns();
  else if (route === 'upload') pageUpload();
  else if (route === 'account' && parts[1]) await pageAccountDetail(parts[1].toUpperCase());
  else location.hash = '#/dashboard';
}

async function boot() {
  try {
    const me = await api('/api/me');
    APP_USER = me.user;
    APP_ACCOUNTS = me.accounts || {};
    $('#me').textContent = APP_USER + ' · ' + Object.keys(APP_ACCOUNTS).length + ' accounts';
  } catch (e) {
    return;
  }
  $('#logout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.href = '/login.html';
  });
  window.addEventListener('hashchange', router);
  router();
}

boot();
