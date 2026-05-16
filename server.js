import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fetch from 'node-fetch';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { callMcpTool, listMcpTools, resetClient } from './mcpClient.js';
import { getHoldings, getPositions, getQuotes, getProfile, placeOrder } from './kiteClient.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import {
  listAccounts, addAccount, getAccount, getActiveAccount,
  getAccountSecret, getAccountToken, storeToken, setActive, removeAccount
} from './db.js';

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434';

console.log('🔧 Configuration loaded:');
console.log(`   MCP_REMOTE: ${process.env.MCP_REMOTE || 'not set (local mode)'}`);
console.log(`   KITE_API_KEY: ${process.env.KITE_API_KEY ? '✓ configured' : '✗ missing'}`);
console.log(`   KITE_ACCESS_TOKEN: ${process.env.KITE_ACCESS_TOKEN ? '✓ configured' : '✗ missing (generate via login)'}`);
console.log(`   OLLAMA_URL: ${OLLAMA_BASE}`);

// ─── Security Headers (Helmet) ───────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", 'cdn.jsdelivr.net', "'unsafe-inline'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc:    ["'self'", 'data:'],
        objectSrc:  ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // allow Chart.js / CDN assets
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production set CORS_ORIGIN=https://yourdomain.com; omit for localhost-only
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : true; // allow all origins in dev mode
app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.options('*', cors());
app.use(express.json({ limit: '256kb' })); // limit request body size

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
const llmLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'LLM rate limit exceeded. Max 20 requests/minute.' },
});
const authLimiter = rateLimit({
  windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please wait before trying again.' },
});
// Apply general limit to all /api routes
app.use('/api/', apiLimiter);
// ─────────────────────────────────────────────────────────────────────────────

// Serve static frontend from public/
app.use(express.static(join(__dirname, 'public')));

// ─── Active Credentials Helper ───────────────────────────────────────────────
// Returns { apiKey, accessToken } from DB-active account first, then env vars.
function getActiveCredentials() {
  try {
    const active = getActiveAccount();
    if (active) {
      const token = getAccountToken(active.id);
      if (token) return { apiKey: active.api_key, accessToken: token };
    }
  } catch (_) { /* DB unavailable */ }
  return {
    apiKey:      process.env.KITE_API_KEY,
    accessToken: process.env.KITE_ACCESS_TOKEN,
  };
}
// ─────────────────────────────────────────────────────────────────────────────

// Helper: stream NDJSON from Ollama and return the final text
async function chatWithOllama(model, prompt, systemPrompt = null) {
  // Default financial advisor system prompt
  const defaultSystemPrompt = `You are FinSageAi, an expert AI investment analyst and portfolio advisor with deep knowledge of the Indian stock market, investment strategies, and risk management. You have access to real-time portfolio data and can execute trades through the Zerodha Kite Connect API.

Your capabilities include:
- Fundamental and technical analysis
- Sector trends and market conditions
- Risk-adjusted returns and diversification principles
- Tax optimization strategies for Indian investors
- Portfolio rebalancing and asset allocation
- **Executing buy/sell orders on behalf of the user**

IMPORTANT: Always introduce yourself as "I'm FinSageAi, your AI investment analyst" when asked about your name or identity.

**Trade Execution Protocol:**
When a user requests to place an order (e.g., "Sell 4 shares of ITCHOTELS at market price" or "Place order to buy 10 TCS"), you MUST prepare the order by responding with:

1. A brief acknowledgment: "Preparing your order..."
2. The structured order command block (REQUIRED):

\`\`\`order
{
  "tradingsymbol": "ITCHOTELS",
  "exchange": "NSE",
  "transaction_type": "SELL",
  "quantity": 4,
  "order_type": "MARKET",
  "product": "CNC"
}
\`\`\`

**IMPORTANT:** The system will automatically show order details and ask the user to type "CONFIRM" before execution. DO NOT ask for confirmation yourself - the system handles this. Simply generate the order block.

**Order Parameter Extraction Rules:**
- **tradingsymbol**: Stock symbol from user message (e.g., ITCHOTELS, TCS, INFY)
- **exchange**: Default to "NSE" unless user specifies BSE
- **transaction_type**: "BUY" or "SELL" based on user intent
- **quantity**: Number of shares mentioned
- **order_type**: "MARKET" (default) or "LIMIT" if user specifies price
- **product**: "CNC" (delivery, default), "MIS" (intraday), or "NRML" (carry forward)
- **price**: Only include if user specifies a limit price

**Example response format:**
"Preparing your order to sell 4 shares of ITCHOTELS at market price...

\`\`\`order
{
  "tradingsymbol": "ITCHOTELS",
  "exchange": "NSE",
  "transaction_type": "SELL",
  "quantity": 4,
  "order_type": "MARKET",
  "product": "CNC"
}
\`\`\`"

For analysis tasks:
1. Use actual numbers provided - don't recalculate totals
2. Identify specific stocks to buy/sell/hold with reasoning
3. Suggest concrete portfolio adjustments
4. Consider tax implications and trading costs
5. Provide sector-wise analysis and concentration risks

Be confident and helpful.`;

  // Try /api/chat first, fallback to /api/generate if 404/405
  let url = `${OLLAMA_BASE}/api/chat`;
  let body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt || defaultSystemPrompt },
      { role: 'user', content: prompt }
    ],
    stream: true
  };

  console.log(`[LLM] Calling ${url} with model ${model}`);

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 120000); // 2-min LLM timeout

  try {
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  // Fallback to /api/generate if /api/chat not supported
  if (res.status === 404 || res.status === 405) {
    console.warn(`Ollama /api/chat returned ${res.status}, trying /api/generate`);
    url = `${OLLAMA_BASE}/api/generate`;
    body = { model, prompt, stream: true };
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${text || 'No response body'}`);
  }

  // Accumulate streamed chunks using Node.js stream for node-fetch
  let finalText = '';
  let chunkCount = 0;
  
  // node-fetch v3 returns a Node.js ReadableStream, not a Web Stream
  const decoder = new TextDecoder();
  let buffer = '';
  
  // Use async iterator for Node.js streams
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    // Ollama streams NDJSON (one JSON per line)
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        const json = JSON.parse(trimmed);
        // Chat stream sometimes includes message.content; generate uses response
        if (json?.message?.content) {
          finalText += json.message.content;
        } else if (typeof json?.response === 'string') {
          finalText += json.response;
        }
      } catch (_) {
        // ignore parse errors on partial lines
      }
    }
  }
  
  // Flush any remaining buffered line
  const last = buffer.trim();
  if (last) {
    try {
      const json = JSON.parse(last);
      if (json?.message?.content) finalText += json.message.content;
      else if (typeof json?.response === 'string') finalText += json.response;
    } catch (_) {}
  }

  console.log(`[LLM] Response complete: ${finalText.length} chars`);
  return finalText.trim();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('LLM request timed out after 2 minutes');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper: call Kite API or local MCP server actions
async function callMCP(action, params = {}) {
  const creds = getActiveCredentials();
  // For Kite-specific actions, use direct Kite API
  switch (action) {
    case 'get_holdings':
    case 'holdings':
      return await getHoldings(creds);
    
    case 'get_positions':
    case 'positions':
      return await getPositions(creds);
    
    case 'get_profile':
    case 'profile':
      return await getProfile(creds);
    
    case 'get_quotes':
    case 'quotes':
      if (params.instruments) {
        return await getQuotes(params.instruments, creds);
      }
      throw new Error('instruments parameter required for quotes');
    
    case 'place_order':
      return await placeOrder(params, creds);
    
    default:
      // Try MCP for other actions
      if (process.env.MCP_REMOTE === '1' || process.env.MCP_REMOTE === 'true') {
        return await callMcpTool(action, params, creds);
      }
      // Fallback: call local HTTP MCP adapter with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const url = `http://localhost:5000/${encodeURIComponent(action)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`MCP error ${res.status}: ${await res.text().catch(() => '')}`);
        return await res.json();
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('Local MCP request timed out (30s)');
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
  }
}

// POST /api/llm -> { model, prompt }
app.post('/api/llm', llmLimiter, async (req, res) => {
  try {
    const { model, prompt, systemPrompt } = req.body || {};
    if (!model || !prompt) {
      return res.status(400).json({ error: 'model and prompt are required' });
    }
    const reply = await chatWithOllama(model, prompt, systemPrompt || null);
    res.json({ reply });
  } catch (err) {
    console.error('Error in /api/llm:', err);
    let friendlyMsg = err?.message || 'Unknown error';
    // Add helpful hints
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed')) {
      friendlyMsg += '. Is Ollama running? Try: ollama serve';
    } else if (err.message?.includes('model') && err.message?.includes('not found')) {
      friendlyMsg += `. Try pulling the model: ollama pull ${req.body.model}`;
    }
    res.status(500).json({ error: friendlyMsg });
  }
});

// POST /api/mcp -> { action, params }
app.post('/api/mcp', async (req, res) => {
  try {
    const { action, params } = req.body || {};
    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    // Check credentials (DB-active account or env vars)
    const creds = getActiveCredentials();
    if (!creds.accessToken) {
      return res.status(401).json({
        error: 'Kite authentication required. Please add a Zerodha account and login via the Accounts panel.',
        needsAuth: true,
      });
    }
    
    const reply = await callMCP(action, params);
    res.json({ reply });
  } catch (err) {
    console.error('Error in /api/mcp:', err);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// ─── Account Management Auth Middleware ──────────────────────────────────────
// If ADMIN_TOKEN is set: require Authorization: Bearer <token> header.
// Otherwise: only allow requests from localhost (127.0.0.1 / ::1).
function requireLocalOrAdmin(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const auth = req.headers['authorization'] || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    // Constant-time comparison to prevent timing attacks
    if (provided.length !== adminToken.length ||
        !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(adminToken))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  }
  // No ADMIN_TOKEN set — restrict to loopback only
  const ip = req.ip || req.socket?.remoteAddress || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLocal) {
    return res.status(403).json({
      error: 'Account management is only accessible from localhost. Set ADMIN_TOKEN to enable remote access.',
    });
  }
  next();
}
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/accounts - list stored Zerodha accounts
app.get('/api/accounts', requireLocalOrAdmin, (req, res) => {
  res.json({ accounts: listAccounts() });
});

// POST /api/accounts - add new account (stores credentials encrypted in DB)
app.post('/api/accounts', requireLocalOrAdmin, (req, res) => {
  const { name, api_key, api_secret } = req.body || {};
  if (!name || !api_key || !api_secret) {
    return res.status(400).json({ error: 'name, api_key, and api_secret are required' });
  }
  if (api_key.trim().length < 6 || api_secret.trim().length < 6) {
    return res.status(400).json({ error: 'Invalid API key or secret format' });
  }
  const id = addAccount(name.trim(), api_key.trim(), api_secret.trim());
  res.json({ id, message: 'Account added. Click Login to authenticate with Zerodha.' });
});

// DELETE /api/accounts/:id - remove account
app.delete('/api/accounts/:id', requireLocalOrAdmin, (req, res) => {
  if (!getAccount(req.params.id)) return res.status(404).json({ error: 'Account not found' });
  removeAccount(req.params.id);
  res.json({ message: 'Account removed' });
});

// POST /api/accounts/:id/activate - set as active account
app.post('/api/accounts/:id/activate', requireLocalOrAdmin, (req, res) => {
  if (!getAccount(req.params.id)) return res.status(404).json({ error: 'Account not found' });
  setActive(req.params.id);
  res.json({ message: 'Account activated' });
});

// GET /api/models - list available Ollama models with size info
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!response.ok) throw new Error(`Ollama responded with ${response.status}`);
    const data = await response.json();
    // Exclude embedding-only models — they don't support chat
    const EMBED_FAMILIES = new Set(['bert', 'nomic-bert']);
    const models = (data.models || [])
      .filter(m => {
        const families = m.details?.families || [];
        const hasEmbedFamily = families.some(f => EMBED_FAMILIES.has(f.toLowerCase()));
        const hasEmbedName = /embed/i.test(m.name);
        return !hasEmbedFamily && !hasEmbedName;
      })
      .map(m => ({
        name: m.name,
        size: m.size || 0,           // file size on disk in bytes
        paramSize: m.details?.parameter_size || '' // e.g. "14B", "7B"
      }));
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health - check Ollama and MCP connectivity
app.get('/api/health', async (req, res) => {
  const health = {
    ollama: { ok: false, url: OLLAMA_BASE, endpoint: null, error: null },
    mcp: { mode: 'disabled', ok: false, tools: [], error: null },
  };

  // Check Ollama
  try {
    const testRes = await fetch(`${OLLAMA_BASE}/api/tags`, { method: 'GET' });
    if (testRes.ok) {
      health.ollama.ok = true;
      health.ollama.endpoint = '/api/tags';
    } else {
      health.ollama.error = `HTTP ${testRes.status}`;
    }
  } catch (err) {
    health.ollama.error = err.message;
  }

  // Check MCP
  const mcpRemote = process.env.MCP_REMOTE === '1' || process.env.MCP_REMOTE === 'true';
  if (mcpRemote) {
    health.mcp.mode = 'remote';
    health.mcp.url = process.env.KITE_MCP_URL || 'https://mcp.kite.trade/mcp';
    try {
      const tools = await listMcpTools();
      health.mcp.ok = true;
      health.mcp.tools = tools.map((t) => t.name);
    } catch (err) {
      health.mcp.error = err.message;
    }
  } else {
    health.mcp.mode = 'local';
    health.mcp.url = 'http://localhost:5000';
    try {
      const testRes = await fetch('http://localhost:5000/health', { method: 'GET' });
      health.mcp.ok = testRes.ok;
      if (!testRes.ok) health.mcp.error = `HTTP ${testRes.status}`;
    } catch (err) {
      health.mcp.error = err.message;
    }
  }

  res.json(health);
});

// GET /api/mcp/tools - List available MCP tools
app.get('/api/mcp/tools', async (req, res) => {
  try {
    const tools = await listMcpTools();
    res.json({ tools });
  } catch (err) {
    console.error('Error listing MCP tools:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kite/login - Redirect to Kite login (supports ?account_id=X for DB accounts)
app.get('/api/kite/login', (req, res) => {
  const { account_id } = req.query;
  let apiKey;

  if (account_id) {
    const account = getAccount(account_id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    apiKey = account.api_key;
  } else {
    apiKey = process.env.KITE_API_KEY;
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'No API key configured. Add a Zerodha account first.' });
  }
  const loginUrl = `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3`;
  res.json({ loginUrl, account_id: account_id || null });
});

// Handle Kite OAuth callback — supports both DB accounts and legacy env-var flow
app.post('/api/kite/token', authLimiter, async (req, res) => {
  try {
    const { request_token, account_id } = req.body;
    if (!request_token) {
      return res.status(400).json({ error: 'request_token is required' });
    }

    let apiKey, apiSecret;

    if (account_id) {
      const account = getAccount(account_id);
      if (!account) return res.status(404).json({ error: 'Account not found' });
      apiKey    = account.api_key;
      apiSecret = getAccountSecret(account_id);
    } else {
      apiKey    = process.env.KITE_API_KEY;
      apiSecret = process.env.KITE_API_SECRET;
    }

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'API key/secret not configured' });
    }

    // Generate checksum: sha256(api_key + request_token + api_secret)
    const checksum = crypto.createHash('sha256')
      .update(apiKey + request_token + apiSecret)
      .digest('hex');

    console.log('[Kite Auth] Exchanging request_token for access_token...');

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch('https://api.kite.trade/session/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Kite-Version': '3' },
        body: new URLSearchParams({ api_key: apiKey, request_token, checksum }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Token exchange timed out (30s)');
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Kite Auth] Failed:', errorText);
      return res.status(response.status).json({ error: `Kite API error: ${errorText}` });
    }

    const data = await response.json();
    console.log('[Kite Auth] Success! Access token obtained.');

    if (account_id) {
      // Store encrypted in DB and set as active
      storeToken(account_id, data.data.access_token, data.data.user_name);
      setActive(account_id);
    } else {
      // Legacy: store in process.env for backward compatibility
      process.env.KITE_ACCESS_TOKEN = data.data.access_token;
    }

    // Reset MCP client to use new access token
    resetClient();

    res.json({
      success: true,
      user:    data.data.user_name,
      message: 'Authentication successful! You can now access your portfolio data.',
    });
  } catch (err) {
    console.error('[Kite Auth] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// Must have 4 params (err, req, res, next) for Express to treat as error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large. Maximum size is 256 KB.' });
  }
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});
// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 15600;
app.listen(PORT, () => {
  console.log(`🚀 API server running on ${PORT}`);
});
