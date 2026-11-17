import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { graphAdapter } from './adapters/graph.js';
import { automationAdapter } from './adapters/automation.js';
import { assistedAdapter } from './adapters/assisted.js';

const app = express();
const GV = process.env.GRAPH_VERSION || 'v21.0';
const APP_ID = process.env.FB_APP_ID || '1178091165318174';
const APP_SECRET = process.env.FB_APP_SECRET;

app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: (process.env.ALLOWED_ORIGINS || '*').split(','),
    credentials: true,
  }),
);
app.use('/api/', rateLimit({ windowMs: 60_000, max: 60 }));

// --- Verify the bearer token actually belongs to THIS app (anti-token-spoof) ---
async function requireUser(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Missing access token' });
  try {
    const appToken = `${APP_ID}|${APP_SECRET}`;
    const r = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${appToken}`,
    );
    const j = await r.json();
    if (
      !j.data ||
      !j.data.is_valid ||
      String(j.data.app_id) !== String(APP_ID)
    ) {
      return res.status(401).json({ error: 'Invalid token for this app' });
    }
    req.fb = { token, userId: j.data.user_id, scopes: j.data.scopes || [] };
    next();
  } catch (e) {
    res.status(502).json({ error: 'Token verification failed' });
  }
}

// --- Short-lived -> long-lived (60 day) token ---
app.post('/api/auth/exchange', async (req, res) => {
  const { accessToken } = req.body || {};
  if (!accessToken || !APP_SECRET)
    return res.status(400).json({ error: 'Missing token or app secret' });
  const url =
    `https://graph.facebook.com/${GV}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${accessToken}`;
  const j = await (await fetch(url)).json();
  if (j.error) return res.status(400).json({ error: j.error.message });
  res.json({ accessToken: j.access_token, expiresIn: j.expires_in });
});

// --- Optional server-side graph proxy (keeps appsecret_proof on server) ---
app.get('/api/graph/*', requireUser, async (req, res) => {
  const path = req.params[0];
  const qs = new URLSearchParams(req.query);
  qs.set('access_token', req.fb.token);
  const j = await (
    await fetch(`https://graph.facebook.com/${GV}/${path}?${qs}`)
  ).json();
  res.status(j.error ? 400 : 200).json(j);
});

/**
 * --- ACTION EXECUTION ---
 * Adapter chain. Each adapter returns null if it can't handle the target.
 *   graph      : official endpoints (currently none exist for unfriend/unfollow)
 *   automation : OPT-IN headless worker (ENABLE_AUTOMATION=true) — ToS risk
 *   assisted   : always succeeds, returns a one-click deep link
 */
const CHAIN = [graphAdapter, automationAdapter, assistedAdapter];

app.post('/api/actions/execute', requireUser, async (req, res) => {
  const targets = Array.isArray(req.body.targets)
    ? req.body.targets.slice(0, 200)
    : [];
  const results = [];

  for (const t of targets) {
    let out = null;
    for (const adapter of CHAIN) {
      try {
        out = await adapter({ target: t, fb: req.fb, graphVersion: GV });
        if (out) break;
      } catch (e) {
        out = { id: t.id, status: 'failed', message: e.message };
        break;
      }
    }
    results.push(
      out || {
        id: t.id,
        status: 'failed',
        message: 'No adapter handled this target',
      },
    );
    await new Promise((r) =>
      setTimeout(r, Number(process.env.ACTION_DELAY_MS || 1200)),
    ); // throttle
  }

  res.json({ results, executedAt: new Date().toISOString() });
});

app.get('/healthz', (_, res) => res.json({ ok: true }));
app.listen(process.env.PORT || 8080, () => console.log('consumer api up'));
