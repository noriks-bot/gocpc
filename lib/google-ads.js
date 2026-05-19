// lib/google-ads.js — minimal REST client for Google Ads API v23
// OAuth refresh + GAQL searchStream + mutate helpers
const https = require('https');

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`);
            err.status = res.statusCode;
            err.body = json;
            reject(err);
          } else {
            resolve(json);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`));
          } else {
            resolve({ raw: data });
          }
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function parseAccounts(envValue) {
  // "HR:8108364842,CZ:3336860319,..." -> { HR: '8108364842', ... }
  const out = {};
  if (!envValue) return out;
  envValue.split(',').forEach((pair) => {
    const [code, id] = pair.split(':').map((s) => s.trim());
    if (code && id) out[code.toUpperCase()] = id;
  });
  return out;
}

class GoogleAdsClient {
  constructor(cfg) {
    this.clientId = cfg.clientId;
    this.clientSecret = cfg.clientSecret;
    this.refreshToken = cfg.refreshToken;
    this.developerToken = cfg.developerToken;
    this.loginCustomerId = cfg.loginCustomerId; // MCC
    this.accounts = cfg.accounts || {}; // { HR: '8108...', ... }
    this._accessToken = null;
    this._accessTokenExp = 0;
  }

  async getAccessToken() {
    if (this._accessToken && Date.now() < this._accessTokenExp - 60_000) {
      return this._accessToken;
    }
    const postData = new URLSearchParams({
      refresh_token: this.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    }).toString();

    const result = await httpsRequest(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      postData
    );

    if (!result.access_token) {
      throw new Error('OAuth refresh failed: ' + JSON.stringify(result));
    }
    this._accessToken = result.access_token;
    this._accessTokenExp = Date.now() + (result.expires_in || 3600) * 1000;
    return this._accessToken;
  }

  _baseHeaders(accessToken) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': this.developerToken,
      'login-customer-id': this.loginCustomerId,
      'Content-Type': 'application/json',
    };
  }

  // GAQL search (paginated, returns flat array of results)
  async search(customerId, query) {
    const accessToken = await this.getAccessToken();
    const body = JSON.stringify({ query });
    const result = await httpsRequest(
      {
        hostname: 'googleads.googleapis.com',
        path: `/v23/customers/${customerId}/googleAds:searchStream`,
        method: 'POST',
        headers: {
          ...this._baseHeaders(accessToken),
          'Content-Length': Buffer.byteLength(body),
        },
      },
      body
    );

    const out = [];
    if (Array.isArray(result)) {
      result.forEach((page) => {
        if (page.results) out.push(...page.results);
      });
    } else if (result.results) {
      out.push(...result.results);
    }
    return out;
  }

  // Generic mutate (returns full response)
  async mutate(customerId, path, payload) {
    const accessToken = await this.getAccessToken();
    const body = JSON.stringify(payload);
    return httpsRequest(
      {
        hostname: 'googleads.googleapis.com',
        path: `/v23/customers/${customerId}${path}`,
        method: 'POST',
        headers: {
          ...this._baseHeaders(accessToken),
          'Content-Length': Buffer.byteLength(body),
        },
      },
      body
    );
  }

  // ─── High-level helpers ──────────────────────────────────

  async listCampaigns(customerId, dateRange = 'LAST_30_DAYS') {
    const q = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.start_date,
        campaign.end_date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date DURING ${dateRange}
      ORDER BY metrics.cost_micros DESC
    `;
    const rows = await this.search(customerId, q);
    // Aggregate rows by campaign (searchStream returns 1 row per campaign per day if segmented, here not segmented → 1 row per campaign with totals)
    return rows.map((r) => ({
      id: r.campaign?.id,
      name: r.campaign?.name,
      status: r.campaign?.status,
      type: r.campaign?.advertisingChannelType,
      startDate: r.campaign?.startDate,
      endDate: r.campaign?.endDate,
      impressions: Number(r.metrics?.impressions || 0),
      clicks: Number(r.metrics?.clicks || 0),
      costMicros: Number(r.metrics?.costMicros || 0),
      cost: Number(r.metrics?.costMicros || 0) / 1_000_000,
      conversions: Number(r.metrics?.conversions || 0),
      conversionsValue: Number(r.metrics?.conversionsValue || 0),
    }));
  }

  async accountSummary(customerId, dateRange = 'LAST_30_DAYS') {
    const q = `
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value
      FROM customer
      WHERE segments.date DURING ${dateRange}
    `;
    const rows = await this.search(customerId, q);
    if (!rows.length) {
      return {
        id: customerId,
        name: null,
        currency: null,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        conversionsValue: 0,
      };
    }
    // Aggregate (account-level row, but to be safe sum if multiple)
    const agg = rows.reduce(
      (a, r) => {
        a.impressions += Number(r.metrics?.impressions || 0);
        a.clicks += Number(r.metrics?.clicks || 0);
        a.costMicros += Number(r.metrics?.costMicros || 0);
        a.conversions += Number(r.metrics?.conversions || 0);
        a.conversionsValue += Number(r.metrics?.conversionsValue || 0);
        return a;
      },
      { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, conversionsValue: 0 }
    );
    return {
      id: rows[0].customer?.id || customerId,
      name: rows[0].customer?.descriptiveName,
      currency: rows[0].customer?.currencyCode,
      impressions: agg.impressions,
      clicks: agg.clicks,
      cost: agg.costMicros / 1_000_000,
      conversions: agg.conversions,
      conversionsValue: agg.conversionsValue,
    };
  }

  // Create a Search campaign — minimal valid payload
  // Returns { campaignBudget, campaign } resource names
  async createSearchCampaign(customerId, opts) {
    const {
      name,
      dailyBudgetEur,
      finalUrl,
      headline1,
      headline2,
      headline3,
      description1,
      description2,
    } = opts;

    // 1. Create budget (mutate via campaignBudgets:mutate)
    const budgetResp = await this.mutate(customerId, `/campaignBudgets:mutate`, {
      operations: [
        {
          create: {
            name: `${name} — budget`,
            amountMicros: String(Math.round(dailyBudgetEur * 1_000_000)),
            deliveryMethod: 'STANDARD',
          },
        },
      ],
    });
    const budgetResource = budgetResp.results?.[0]?.resourceName;
    if (!budgetResource) throw new Error('Budget create failed: ' + JSON.stringify(budgetResp));

    // 2. Create campaign (PAUSED) referencing budget
    const campaignResp = await this.mutate(customerId, `/campaigns:mutate`, {
      operations: [
        {
          create: {
            name,
            advertisingChannelType: 'SEARCH',
            status: 'PAUSED',
            manualCpc: { enhancedCpcEnabled: false },
            campaignBudget: budgetResource,
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: true,
              targetContentNetwork: false,
              targetPartnerSearchNetwork: false,
            },
          },
        },
      ],
    });
    const campaignResource = campaignResp.results?.[0]?.resourceName;
    if (!campaignResource) throw new Error('Campaign create failed: ' + JSON.stringify(campaignResp));

    return {
      budgetResource,
      campaignResource,
      headlines: [headline1, headline2, headline3].filter(Boolean),
      descriptions: [description1, description2].filter(Boolean),
      finalUrl,
      note: 'Campaign created in PAUSED state. Ad group + ads not yet created (next step in iteration 2).',
    };
  }
}

module.exports = { GoogleAdsClient, parseAccounts };
