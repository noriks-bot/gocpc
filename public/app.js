// goCPC frontend SPA
const main = document.getElementById('main');
const meEl = document.getElementById('me');
let accounts = {};

const FLAG = { HR: '🇭🇷', CZ: '🇨🇿', PL: '🇵🇱', GR: '🇬🇷', IT: '🇮🇹', HU: '🇭🇺', SK: '🇸🇰', SI: '🇸🇮', DE: '🇩🇪', RO: '🇷🇴', BG: '🇧🇬' };

// Brand hints from noriks-creative skills (per market)
const HEADLINES = {
  SI: ['PIVSKI TREBUH?', 'PREIZKUSI TO.', 'OPROSTITE!'],
  HR: ['PIVSKI TRBUH?', 'PROBAJ OVO.'],
  SK: ['PIVNÉ BRUŠKO?', 'VYSKÚŠAJTE TOTO.'],
  CZ: ['PIVNÍ BŘICHO?', 'VYZKOUŠEJ TOHLE.'],
  HU: ['SÖRHAS?', 'PRÓBÁLD KI EZT.'],
  PL: ['PIWNY BRZUCH?', 'SPRÓBUJ TEGO.'],
  GR: ['ΚΟΙΛΙΑ ΑΠΟ ΜΠΥΡΑ?', 'ΔΟΚΙΜΑΣΕ ΑΥΤΟ.'],
  IT: ['PANCIA DA BIRRA?', 'PROVA QUESTO.'],
  DE: ['BIERBAUCH?', 'PROBIER DAS.'],
  RO: ['BURTA DE BERE?', 'ÎNCEARCĂ ASTA.'],
  BG: ['БИРЕНО КОРЕМЧЕ?', 'ОПИТАЙ ТОВА.'],
};
const URLS = {
  SI: 'https://noriks.com/sl/', HR: 'https://noriks.com/hr/', SK: 'https://noriks.com/sk/',
  CZ: 'https://noriks.com/cz/', HU: 'https://noriks.com/hu/', PL: 'https://noriks.com/pl/',
  GR: 'https://noriks.com/gr/', IT: 'https://noriks.com/it/',
};

function fmtMoney(n, ccy) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('sl-SI', { maximumFractionDigits: 2 }) + (ccy ? ' ' + ccy : '');
}
function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('sl-SI');
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return (n * 100).toFixed(2) + '%';
}

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  if (r.status === 401) {
    location.href = '/login.html';
    throw new Error('unauthorized');
  }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `HTTP ${r.status}`);
  }
  return r.json();
}

async function init() {
  try {
    const me = await api('/api/me');
    meEl.textContent = `👤 ${me.user}`;
    accounts = me.accounts || {};
  } catch (e) {
    return;
  }
  document.getElementById('logout').onclick = async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.href = '/login.html';
  };
  window.addEventListener('hashchange', route);
  route();
}

function setActive(name) {
  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === name);
  });
}

function route() {
  const h = (location.hash || '#/dashboard').replace('#/', '');
  setActive(h);
  if (h === 'dashboard') return renderDashboard();
  if (h === 'campaigns') return renderCampaigns();
  if (h === 'accounts') return renderAccounts();
  if (h === 'upload') return renderUpload();
  renderDashboard();
}

function rangeSelect(current) {
  const opts = ['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'LAST_14_DAYS', 'LAST_30_DAYS', 'THIS_MONTH', 'LAST_MONTH'];
  return `<select id="rangeSel">${opts.map((o) => `<option value="${o}" ${o === current ? 'selected' : ''}>${o.replace(/_/g, ' ')}</option>`).join('')}</select>`;
}

async function renderDashboard() {
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Dashboard</h2>
        <div class="sub">Pregled vseh kampanj po državah</div>
      </div>
      <div class="controls">${rangeSelect('LAST_30_DAYS')}</div>
    </div>
    <div id="content"><div class="loading">Loading countries...</div></div>
  `;
  document.getElementById('rangeSel').onchange = (e) => loadDashboard(e.target.value);
  loadDashboard('LAST_30_DAYS');
}

async function loadDashboard(range) {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const data = await api(`/api/countries-summary?range=${range}`);
    const totals = data.countries.reduce(
      (a, x) => {
        if (!x.error) {
          a.cost += x.cost || 0;
          a.clicks += x.clicks || 0;
          a.impressions += x.impressions || 0;
          a.conversions += x.conversions || 0;
          a.conversionsValue += x.conversionsValue || 0;
        }
        return a;
      },
      { cost: 0, clicks: 0, impressions: 0, conversions: 0, conversionsValue: 0 }
    );
    const cpa = totals.conversions ? totals.cost / totals.conversions : 0;
    const roas = totals.cost ? totals.conversionsValue / totals.cost : 0;

    c.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Skupna poraba</div><div class="value">${fmtMoney(totals.cost)}<span class="ccy">EUR</span></div></div>
        <div class="kpi"><div class="label">Impressions</div><div class="value">${fmtNum(totals.impressions)}</div></div>
        <div class="kpi"><div class="label">Kliki</div><div class="value">${fmtNum(totals.clicks)}</div></div>
        <div class="kpi"><div class="label">Konverzije</div><div class="value">${fmtNum(totals.conversions)}</div></div>
        <div class="kpi"><div class="label">CPA</div><div class="value">${fmtMoney(cpa)}<span class="ccy">EUR</span></div></div>
        <div class="kpi"><div class="label">ROAS</div><div class="value">${roas.toFixed(2)}x</div></div>
      </div>
      <div class="tbl-wrap">
        <div class="tbl-head">Po državah</div>
        <table>
          <thead><tr>
            <th>Država</th><th>Customer ID</th><th class="num">Impr.</th><th class="num">Kliki</th>
            <th class="num">Cost</th><th class="num">Konv.</th><th class="num">Conv. value</th><th class="num">CPA</th><th class="num">ROAS</th>
          </tr></thead>
          <tbody>
            ${data.countries.map((x) => {
              if (x.error) return `<tr><td><span class="flag">${FLAG[x.country] || ''} ${x.country}</span></td><td colspan="8" style="color:#ef4444">${x.error}</td></tr>`;
              const cpa = x.conversions ? x.cost / x.conversions : 0;
              const roas = x.cost ? x.conversionsValue / x.cost : 0;
              return `<tr>
                <td><a href="#/accounts/${x.country}" style="color:#fff;text-decoration:none"><span class="flag">${FLAG[x.country] || ''} ${x.country}</span></a></td>
                <td style="color:#666">${x.customerId}</td>
                <td class="num">${fmtNum(x.impressions)}</td>
                <td class="num">${fmtNum(x.clicks)}</td>
                <td class="num">${fmtMoney(x.cost)} ${x.currency || ''}</td>
                <td class="num">${fmtNum(x.conversions)}</td>
                <td class="num">${fmtMoney(x.conversionsValue)}</td>
                <td class="num">${fmtMoney(cpa)}</td>
                <td class="num">${roas.toFixed(2)}x</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    c.innerHTML = `<div class="notice error">${e.message}</div>`;
  }
}

async function renderCampaigns() {
  main.innerHTML = `
    <div class="page-head">
      <div><h2>Vse kampanje</h2><div class="sub">Flat list across all accounts</div></div>
      <div class="controls">${rangeSelect('LAST_30_DAYS')}</div>
    </div>
    <div id="content"><div class="loading">Loading campaigns...</div></div>
  `;
  document.getElementById('rangeSel').onchange = (e) => loadCampaigns(e.target.value);
  loadCampaigns('LAST_30_DAYS');
}

async function loadCampaigns(range) {
  const c = document.getElementById('content');
  c.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const data = await api(`/api/campaigns?range=${range}`);
    c.innerHTML = `
      <div class="tbl-wrap">
        <div class="tbl-head">${data.total} kampanj</div>
        <table>
          <thead><tr>
            <th>Država</th><th>Kampanja</th><th>Status</th><th>Tip</th>
            <th class="num">Impr.</th><th class="num">Kliki</th><th class="num">Cost</th>
            <th class="num">Konv.</th><th class="num">CPA</th>
          </tr></thead>
          <tbody>
            ${data.campaigns.map((x) => {
              const cpa = x.conversions ? x.cost / x.conversions : 0;
              return `<tr>
                <td><span class="flag">${FLAG[x.country] || ''} ${x.country}</span></td>
                <td>${x.name || '—'}</td>
                <td><span class="status-tag status-${x.status}">${x.status || '—'}</span></td>
                <td style="color:#888;font-size:12px">${(x.type || '').replace('_', ' ')}</td>
                <td class="num">${fmtNum(x.impressions)}</td>
                <td class="num">${fmtNum(x.clicks)}</td>
                <td class="num">${fmtMoney(x.cost)}</td>
                <td class="num">${fmtNum(x.conversions)}</td>
                <td class="num">${fmtMoney(cpa)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    c.innerHTML = `<div class="notice error">${e.message}</div>`;
  }
}

async function renderAccounts() {
  main.innerHTML = `
    <div class="page-head">
      <div><h2>Računi / države</h2><div class="sub">${Object.keys(accounts).length} povezanih računov</div></div>
    </div>
    <div class="tbl-wrap">
      <div class="tbl-head">MCC accounts</div>
      <table>
        <thead><tr><th>Država</th><th>Customer ID</th><th>Trgovina</th></tr></thead>
        <tbody>
          ${Object.entries(accounts).map(([c, id]) => `
            <tr>
              <td><span class="flag">${FLAG[c] || ''} ${c}</span></td>
              <td style="color:#666;font-family:monospace">${id}</td>
              <td><a href="${URLS[c] || '#'}" target="_blank" style="color:#F5D900">${URLS[c] || ''}</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderUpload() {
  const countryOpts = Object.keys(accounts).map((c) => `<option value="${c}">${FLAG[c] || ''} ${c}</option>`).join('');
  main.innerHTML = `
    <div class="page-head">
      <div><h2>Upload new campaign</h2><div class="sub">Performance / Search kampanja (kreirana v PAUSED stanju)</div></div>
    </div>
    <div class="form-card">
      <form id="uploadForm">
        <div class="form-row">
          <div class="form-field">
            <label>Država</label>
            <select name="country" id="countrySel" required>${countryOpts}</select>
            <div class="hint">Glede na izbor se nastavijo predlogi za headline + landing URL</div>
          </div>
          <div class="form-field">
            <label>Daily budget (EUR)</label>
            <input type="number" name="dailyBudgetEur" step="0.5" min="1" value="20" required>
          </div>
        </div>
        <div class="form-row full">
          <div class="form-field">
            <label>Naziv kampanje</label>
            <input type="text" name="name" placeholder="goCPC — HR — Shirts 2026-05" required>
          </div>
        </div>
        <div class="form-row full">
          <div class="form-field">
            <label>Final URL (landing)</label>
            <input type="url" name="finalUrl" id="finalUrlInput" required>
          </div>
        </div>

        <div class="brand-hints" id="headlineHints">
          <strong>Predlogi headline (Noriks brand bible):</strong>
          <div class="row" id="headlineChips"></div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label>Headline 1 (max 30)</label>
            <input type="text" name="headline1" maxlength="30" required>
          </div>
          <div class="form-field">
            <label>Headline 2 (max 30)</label>
            <input type="text" name="headline2" maxlength="30">
          </div>
        </div>
        <div class="form-row full">
          <div class="form-field">
            <label>Headline 3 (max 30)</label>
            <input type="text" name="headline3" maxlength="30">
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>Description 1 (max 90)</label>
            <textarea name="description1" maxlength="90" required></textarea>
          </div>
          <div class="form-field">
            <label>Description 2 (max 90)</label>
            <textarea name="description2" maxlength="90"></textarea>
          </div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label>Videi (UGC/TikTok, MP4)</label>
            <div class="file-drop" id="videoDrop">📹 Klikni ali povleci video fajle</div>
            <input type="file" name="videos" id="videoInput" accept="video/*" multiple style="display:none">
            <div class="file-list" id="videoList"></div>
          </div>
          <div class="form-field">
            <label>Slike (statične kreative)</label>
            <div class="file-drop" id="imageDrop">🖼️ Klikni ali povleci slike</div>
            <input type="file" name="images" id="imageInput" accept="image/*" multiple style="display:none">
            <div class="file-list" id="imageList"></div>
          </div>
        </div>

        <button type="submit" class="btn" id="submitBtn">🚀 Ustvari kampanjo</button>
      </form>
      <div id="uploadResult"></div>
    </div>
  `;

  const countrySel = document.getElementById('countrySel');
  const finalUrl = document.getElementById('finalUrlInput');
  const chips = document.getElementById('headlineChips');
  const form = document.getElementById('uploadForm');
  const result = document.getElementById('uploadResult');

  function updateHints() {
    const c = countrySel.value;
    finalUrl.value = URLS[c] || '';
    const heads = HEADLINES[c] || [];
    chips.innerHTML = heads.map((h) => `<span class="chip" data-h="${h}">${h}</span>`).join('') || '<span style="color:#666">— ni predlogov za to državo</span>';
    chips.querySelectorAll('.chip').forEach((el) => {
      el.onclick = () => {
        const empty = ['headline1', 'headline2', 'headline3'].find((k) => !form[k].value);
        if (empty) form[empty].value = el.dataset.h;
      };
    });
  }
  countrySel.onchange = updateHints;
  updateHints();

  // file inputs
  function wireDrop(dropId, inputId, listId) {
    const drop = document.getElementById(dropId);
    const inp = document.getElementById(inputId);
    const list = document.getElementById(listId);
    drop.onclick = () => inp.click();
    inp.onchange = () => {
      list.innerHTML = Array.from(inp.files).map((f) => `<div class="file">📎 ${f.name} <span style="color:#666">(${(f.size / 1024 / 1024).toFixed(1)} MB)</span></div>`).join('');
    };
  }
  wireDrop('videoDrop', 'videoInput', 'videoList');
  wireDrop('imageDrop', 'imageInput', 'imageList');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Pošiljam...';
    result.innerHTML = '';
    try {
      const fd = new FormData(form);
      const r = await fetch('/api/upload-campaign', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      result.innerHTML = `<div class="notice success" style="margin-top:24px">
        ✅ Kampanja uspešno ustvarjena (PAUSED).<br>
        Country: <b>${d.country}</b><br>
        Customer: <code>${d.customerId}</code><br>
        Campaign resource: <code>${d.campaign.campaignResource}</code><br>
        Budget resource: <code>${d.campaign.budgetResource}</code><br>
        Files: ${(d.files.videos.length + d.files.images.length)} (${d.files.videos.length} videos, ${d.files.images.length} images)<br>
        <em style="color:#888">${d.campaign.note}</em>
      </div>`;
      form.reset();
      updateHints();
    } catch (err) {
      result.innerHTML = `<div class="notice error" style="margin-top:24px">❌ ${err.message}</div>`;
    }
    btn.disabled = false;
    btn.textContent = '🚀 Ustvari kampanjo';
  };
}

init();
