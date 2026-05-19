require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleAdsClient, parseAccounts } = require('./lib/google-ads');

const app = express();
const PORT = process.env.PORT || 3011;

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'mistermegazmaga2026';

// ── Storage for uploaded creative assets ──
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ── Google Ads client ──
const accounts = parseAccounts(process.env.GOOGLE_ADS_ACCOUNTS);
const ga = new GoogleAdsClient({
  clientId: process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  accounts,
});

// ── Middleware ──
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'gocpc-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.user === ADMIN_USER) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.redirect('/login.html');
}

// ── Public endpoints ──
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'gocpc',
    version: '0.2.0',
    uptime: process.uptime(),
    accounts: Object.keys(accounts),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    req.session.user = user;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.use(express.static(path.join(__dirname, 'public-anon')));

// ── Protected ──
app.use(requireAuth);

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user, accounts });
});

app.get('/api/countries-summary', async (req, res) => {
  const dateRange = (req.query.range || 'LAST_30_DAYS').toUpperCase();
  const out = [];
  for (const [country, custId] of Object.entries(accounts)) {
    try {
      const s = await ga.accountSummary(custId, dateRange);
      out.push({ country, customerId: custId, ...s });
    } catch (e) {
      out.push({ country, customerId: custId, error: e.message });
    }
  }
  res.json({ range: dateRange, countries: out });
});

app.get('/api/account/:country', async (req, res) => {
  const country = (req.params.country || '').toUpperCase();
  const custId = accounts[country];
  if (!custId) return res.status(404).json({ error: 'unknown country', country });
  const dateRange = (req.query.range || 'LAST_30_DAYS').toUpperCase();
  try {
    const [summary, campaigns] = await Promise.all([
      ga.accountSummary(custId, dateRange),
      ga.listCampaigns(custId, dateRange),
    ]);
    res.json({ country, customerId: custId, range: dateRange, summary, campaigns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/campaigns', async (req, res) => {
  const dateRange = (req.query.range || 'LAST_30_DAYS').toUpperCase();
  const all = [];
  for (const [country, custId] of Object.entries(accounts)) {
    try {
      const list = await ga.listCampaigns(custId, dateRange);
      list.forEach((c) => all.push({ country, customerId: custId, ...c }));
    } catch (e) {
      console.error(`[campaigns] ${country} ${custId}: ${e.message}`);
    }
  }
  all.sort((a, b) => (b.cost || 0) - (a.cost || 0));
  res.json({ range: dateRange, total: all.length, campaigns: all });
});

app.post(
  '/api/upload-campaign',
  upload.fields([
    { name: 'videos', maxCount: 5 },
    { name: 'images', maxCount: 20 },
  ]),
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
      } = req.body || {};

      const custId = accounts[(country || '').toUpperCase()];
      if (!custId) return res.status(400).json({ error: 'invalid country', country });
      if (!name || !dailyBudgetEur || !finalUrl) {
        return res.status(400).json({ error: 'missing required fields (name, dailyBudgetEur, finalUrl)' });
      }

      const result = await ga.createSearchCampaign(custId, {
        name,
        dailyBudgetEur: Number(dailyBudgetEur),
        finalUrl,
        headline1,
        headline2,
        headline3,
        description1,
        description2,
      });

      const filesMeta = {
        videos: (req.files?.videos || []).map((f) => ({
          original: f.originalname,
          stored: f.filename,
          size: f.size,
          mimetype: f.mimetype,
        })),
        images: (req.files?.images || []).map((f) => ({
          original: f.originalname,
          stored: f.filename,
          size: f.size,
          mimetype: f.mimetype,
        })),
      };

      res.json({
        ok: true,
        country,
        customerId: custId,
        campaign: result,
        files: filesMeta,
      });
    } catch (e) {
      console.error('[upload-campaign]', e);
      res.status(500).json({ error: e.message, body: e.body });
    }
  }
);

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[gocpc] listening on http://127.0.0.1:${PORT}`);
  console.log(`[gocpc] accounts: ${Object.keys(accounts).join(', ')}`);
});
