// server.js — gocpc.noriks.com (Google Ads management UI)
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { GoogleAdsClient, parseAccounts } = require('./lib/google-ads');

const PORT = process.env.PORT || 3011;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'mistermegazmaga2026';

const accounts = parseAccounts(process.env.GOOGLE_ADS_ACCOUNTS);

const gads = new GoogleAdsClient({
  clientId: process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  accounts,
});

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

// auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'auth required' });
}

// ----- In-memory cache with stale-while-revalidate -----
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const cacheStore = new Map(); // key -> { value, ts, pending }

function cacheGet(key) {
  return cacheStore.get(key);
}
function cacheSet(key, value) {
  cacheStore.set(key, { value, ts: Date.now(), pending: null });
}
function cacheInvalidate(prefix) {
  for (const k of cacheStore.keys()) {
    if (k.startsWith(prefix)) cacheStore.delete(k);
  }
}

async function cachedFetch(key, fetcher) {
  const entry = cacheStore.get(key);
  const now = Date.now();
  const fresh = entry && (now - entry.ts) < CACHE_TTL_MS;

  if (entry && fresh) {
    return { value: entry.value, fromCache: true, ageMs: now - entry.ts };
  }

  // Stale-while-revalidate: if we have stale data, return it AND kick off background refresh
  if (entry && !entry.pending) {
    entry.pending = fetcher()
      .then((value) => { cacheSet(key, value); })
      .catch((e) => { console.error('background refresh failed', key, e.message); })
      .finally(() => { const e2 = cacheStore.get(key); if (e2) e2.pending = null; });
    return { value: entry.value, fromCache: true, stale: true, ageMs: now - entry.ts };
  }

  // No entry — must wait for first fetch
  if (entry && entry.pending) {
    await entry.pending;
    const e2 = cacheStore.get(key);
    return { value: e2.value, fromCache: false, ageMs: 0 };
  }

  // Cold cache
  const value = await fetcher();
  cacheSet(key, value);
  return { value, fromCache: false, ageMs: 0 };
}

// ----- Static -----
// public-anon: login screen (accessible without auth)
app.use('/anon', express.static(path.join(__dirname, 'public-anon')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public-anon', 'login.html')));

// gated static
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path === '/login' || req.path.startsWith('/anon/')) return next();
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
});
app.use(express.static(path.join(__dirname, 'public')));

// ----- API: auth -----
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = { username };
    return res.json({ ok: true, user: { username } });
  }
  return res.status(401).json({ error: 'invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user, accounts: Object.keys(accounts) });
  }
  return res.status(401).json({ error: 'not logged in' });
});

// ----- API: data -----
async function fetchCountriesSummary(range) {
  const entries = Object.entries(accounts);
  const results = await Promise.all(
    entries.map(async ([country, customerId]) => {
      try {
        const s = await gads.accountSummary(customerId, range);
        return { country, customerId, ...s };
      } catch (e) {
        return { country, customerId, error: e.message };
      }
    })
  );
  return results;
}

app.get('/api/countries-summary', requireAuth, async (req, res) => {
  const range = req.query.range || 'LAST_30_DAYS';
  const key = `countries-summary:${range}`;
  try {
    const { value, fromCache, stale, ageMs } = await cachedFetch(key, () => fetchCountriesSummary(range));
    res.set('X-Cache', fromCache ? (stale ? 'STALE' : 'HIT') : 'MISS');
    res.set('X-Cache-Age-Ms', String(ageMs || 0));
    res.json({ range, countries: value, _cache: { fromCache, stale: !!stale, ageMs } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/account/:country', requireAuth, async (req, res) => {
  const country = (req.params.country || '').toUpperCase();
  const customerId = accounts[country];
  if (!customerId) return res.status(404).json({ error: 'unknown country' });
  const range = req.query.range || 'LAST_30_DAYS';
  const key = `account:${country}:${range}`;
  try {
    const { value, fromCache, stale, ageMs } = await cachedFetch(key, async () => {
      const [summary, campaigns] = await Promise.all([
        gads.accountSummary(customerId, range),
        gads.listCampaigns(customerId, range),
      ]);
      return { summary, campaigns };
    });
    res.set('X-Cache', fromCache ? (stale ? 'STALE' : 'HIT') : 'MISS');
    res.set('X-Cache-Age-Ms', String(ageMs || 0));
    res.json({
      country, customerId, range,
      summary: value.summary, campaigns: value.campaigns,
      _cache: { fromCache, stale: !!stale, ageMs },
    });
  } catch (e) {
    res.status(500).json({ error: e.message, body: e.body });
  }
});

async function fetchAllCampaigns(range) {
  const entries = Object.entries(accounts);
  const perCountry = await Promise.all(
    entries.map(async ([country, customerId]) => {
      try {
        const rows = await gads.listCampaigns(customerId, range);
        return rows.map((r) => ({ country, customerId, ...r }));
      } catch (e) {
        return [{ country, customerId, error: e.message }];
      }
    })
  );
  const flat = perCountry.flat();
  flat.sort((a, b) => (b.cost || 0) - (a.cost || 0));
  return flat;
}

app.get('/api/campaigns', requireAuth, async (req, res) => {
  const range = req.query.range || 'LAST_30_DAYS';
  const onlyCountry = (req.query.country || '').toUpperCase();
  const key = `campaigns:${range}`;
  try {
    const { value, fromCache, stale, ageMs } = await cachedFetch(key, () => fetchAllCampaigns(range));
    const filtered = onlyCountry ? value.filter((c) => c.country === onlyCountry) : value;
    res.set('X-Cache', fromCache ? (stale ? 'STALE' : 'HIT') : 'MISS');
    res.set('X-Cache-Age-Ms', String(ageMs || 0));
    res.json({
      range,
      total: filtered.length,
      campaigns: filtered,
      _cache: { fromCache, stale: !!stale, ageMs },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----- API: campaign mutations -----
function resolveCustomerId(country) {
  return accounts[(country || '').toUpperCase()];
}

app.post('/api/campaign/:country/:campaignId/status', requireAuth, async (req, res) => {
  const customerId = resolveCustomerId(req.params.country);
  if (!customerId) return res.status(404).json({ error: 'unknown country' });
  const { status } = req.body || {};
  if (!['ENABLED', 'PAUSED'].includes(status)) {
    return res.status(400).json({ error: 'status must be ENABLED or PAUSED' });
  }
  try {
    const result = await gads.updateCampaignStatus(customerId, req.params.campaignId, status);
    // bust cache so the next read reflects the change
    cacheInvalidate('campaigns:');
    cacheInvalidate(`account:${req.params.country.toUpperCase()}:`);
    res.json({ ok: true, status, result });
  } catch (e) {
    console.error('status update error', e);
    res.status(500).json({ error: e.message, body: e.body });
  }
});

app.post('/api/campaign/:country/:campaignId/budget', requireAuth, async (req, res) => {
  const customerId = resolveCustomerId(req.params.country);
  if (!customerId) return res.status(404).json({ error: 'unknown country' });
  const { dailyBudgetEur, budgetResource } = req.body || {};
  const amount = parseFloat(dailyBudgetEur);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'dailyBudgetEur > 0 required' });
  let resource = budgetResource;
  try {
    // If no budgetResource provided, look it up
    if (!resource) {
      const rows = await gads.search(
        customerId,
        `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${req.params.campaignId}`
      );
      resource = rows[0]?.campaign?.campaignBudget;
      if (!resource) return res.status(404).json({ error: 'budget resource not found' });
    }
    const result = await gads.updateCampaignBudget(customerId, resource, amount);
    cacheInvalidate('campaigns:');
    cacheInvalidate(`account:${req.params.country.toUpperCase()}:`);
    res.json({ ok: true, dailyBudgetEur: amount, budgetResource: resource, result });
  } catch (e) {
    console.error('budget update error', e);
    res.status(500).json({ error: e.message, body: e.body });
  }
});

// ----- API: upload new campaign -----
app.post(
  '/api/upload-campaign',
  requireAuth,
  upload.array('media', 10),
  async (req, res) => {
    try {
      const {
        country,
        name,
        dailyBudgetEur,
        finalUrl,
        headline1,
        headline2,
        headline3,
        description1,
        description2,
      } = req.body;

      const cc = (country || '').toUpperCase();
      const customerId = accounts[cc];
      if (!customerId) return res.status(400).json({ error: 'unknown country' });
      if (!name) return res.status(400).json({ error: 'name required' });

      const budget = parseFloat(dailyBudgetEur || '10');
      const out = await gads.createSearchCampaign(customerId, {
        name,
        dailyBudgetEur: budget,
        finalUrl,
        headline1,
        headline2,
        headline3,
        description1,
        description2,
      });

      const mediaFiles = (req.files || []).map((f) => ({
        originalName: f.originalname,
        size: f.size,
        path: f.path,
      }));

      res.json({ ok: true, country: cc, customerId, ...out, media: mediaFiles });
    } catch (e) {
      console.error('upload-campaign error', e);
      res.status(500).json({ error: e.message, body: e.body });
    }
  }
);

// ----- Cache admin -----
app.get('/api/cache/status', requireAuth, (req, res) => {
  const now = Date.now();
  const entries = [...cacheStore.entries()].map(([k, v]) => ({
    key: k,
    ageMs: now - v.ts,
    ageSec: Math.round((now - v.ts) / 1000),
    fresh: (now - v.ts) < CACHE_TTL_MS,
    pending: !!v.pending,
    size: Array.isArray(v.value) ? v.value.length : (v.value && typeof v.value === 'object' ? Object.keys(v.value).length : 1),
  }));
  res.json({ ttlMs: CACHE_TTL_MS, entries });
});

app.post('/api/cache/clear', requireAuth, (req, res) => {
  const before = cacheStore.size;
  cacheStore.clear();
  res.json({ ok: true, cleared: before });
});

// ----- Health -----
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'gocpc',
    accounts: Object.keys(accounts),
    hasGoogleAds: Boolean(
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
        process.env.GOOGLE_ADS_REFRESH_TOKEN &&
        process.env.GOOGLE_ADS_CLIENT_ID
    ),
    cache: { entries: cacheStore.size, ttlMs: CACHE_TTL_MS },
  });
});

// ----- Cache warmup -----
async function warmupCache() {
  const ranges = ['LAST_7_DAYS', 'LAST_30_DAYS'];
  for (const range of ranges) {
    try {
      const campaignsKey = `campaigns:${range}`;
      const countriesKey = `countries-summary:${range}`;
      await Promise.all([
        cachedFetch(campaignsKey, () => fetchAllCampaigns(range)),
        cachedFetch(countriesKey, () => fetchCountriesSummary(range)),
      ]);
      console.log(`[warmup] cached ${range}`);
    } catch (e) {
      console.error(`[warmup] ${range} failed:`, e.message);
    }
  }
}

app.listen(PORT, () => {
  console.log(`gocpc listening on ${PORT}`);
  console.log('accounts:', Object.keys(accounts).join(', '));
  // warm cache on boot so first user request is instant
  warmupCache().catch((e) => console.error('warmup error', e));
});
