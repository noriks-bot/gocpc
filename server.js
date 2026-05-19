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
app.get('/api/countries-summary', requireAuth, async (req, res) => {
  const range = req.query.range || 'LAST_30_DAYS';
  const out = [];
  for (const [country, customerId] of Object.entries(accounts)) {
    try {
      const s = await gads.accountSummary(customerId, range);
      out.push({ country, ...s });
    } catch (e) {
      out.push({ country, customerId, error: e.message });
    }
  }
  res.json({ range, accounts: out });
});

app.get('/api/account/:country', requireAuth, async (req, res) => {
  const country = (req.params.country || '').toUpperCase();
  const customerId = accounts[country];
  if (!customerId) return res.status(404).json({ error: 'unknown country' });
  const range = req.query.range || 'LAST_30_DAYS';
  try {
    const [summary, campaigns] = await Promise.all([
      gads.accountSummary(customerId, range),
      gads.listCampaigns(customerId, range),
    ]);
    res.json({ country, customerId, range, summary, campaigns });
  } catch (e) {
    res.status(500).json({ error: e.message, body: e.body });
  }
});

app.get('/api/campaigns', requireAuth, async (req, res) => {
  const range = req.query.range || 'LAST_30_DAYS';
  const onlyCountry = (req.query.country || '').toUpperCase();
  const out = [];
  for (const [country, customerId] of Object.entries(accounts)) {
    if (onlyCountry && country !== onlyCountry) continue;
    try {
      const rows = await gads.listCampaigns(customerId, range);
      rows.forEach((r) => out.push({ country, customerId, ...r }));
    } catch (e) {
      out.push({ country, customerId, error: e.message });
    }
  }
  res.json({ range, campaigns: out });
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
  });
});

app.listen(PORT, () => {
  console.log(`gocpc listening on ${PORT}`);
  console.log('accounts:', Object.keys(accounts).join(', '));
});
