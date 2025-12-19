import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { callMcpTool, listMcpTools, resetClient } from './mcpClient.js';
import { getHoldings, getPositions, getQuotes, getProfile, placeOrder } from './kiteClient.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

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

// Enable CORS for frontend served from a different port (e.g., 8000)
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);
// Handle preflight requests
app.options('*', cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(join(__dirname, 'public')));

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
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  // Fallback to /api/generate if /api/chat not supported
  if (res.status === 404 || res.status === 405) {
    console.warn(`Ollama /api/chat returned ${res.status}, trying /api/generate`);
    url = `${OLLAMA_BASE}/api/generate`;
    body = { model, prompt, stream: true };
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
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
}

// Helper: call Kite API or local MCP server actions
async function callMCP(action, params = {}) {
  // For Kite-specific actions, use direct Kite API
  switch (action) {
    case 'get_holdings':
    case 'holdings':
      return await getHoldings();
    
    case 'get_positions':
    case 'positions':
      return await getPositions();
    
    case 'get_profile':
    case 'profile':
      return await getProfile();
    
    case 'get_quotes':
    case 'quotes':
      if (params.instruments) {
        return await getQuotes(params.instruments);
      }
      throw new Error('instruments parameter required for quotes');
    
    case 'place_order':
      return await placeOrder(params);
    
    default:
      // Try MCP for other actions
      if (process.env.MCP_REMOTE === '1' || process.env.MCP_REMOTE === 'true') {
        const mcpRes = await callMcpTool(action, params);
        return mcpRes;
      }
      // Fallback: call local HTTP MCP adapter
      const url = `http://localhost:5000/${encodeURIComponent(action)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`MCP error ${res.status}: ${text}`);
      }
      return await res.json();
  }
}

// POST /api/llm -> { model, prompt }
app.post('/api/llm', async (req, res) => {
  try {
    const { model, prompt } = req.body || {};
    if (!model || !prompt) {
      return res.status(400).json({ error: 'model and prompt are required' });
    }
    const reply = await chatWithOllama(model, prompt);
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
    
    // Check if access token is available when using remote MCP
    const mcpRemote = process.env.MCP_REMOTE === '1' || process.env.MCP_REMOTE === 'true';
    if (mcpRemote && !process.env.KITE_ACCESS_TOKEN) {
      return res.status(401).json({ 
        error: 'Kite authentication required. Please click "🔐 Kite Login" to authenticate first.',
        needsAuth: true
      });
    }
    
    const reply = await callMCP(action, params);
    res.json({ reply });
  } catch (err) {
    console.error('Error in /api/mcp:', err);
    res.status(500).json({ error: err?.message || 'Unknown error' });
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

// GET /api/kite/login - Redirect to Kite login
app.get('/api/kite/login', (req, res) => {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'KITE_API_KEY not configured' });
  }
  const loginUrl = `https://kite.zerodha.com/connect/login?api_key=${apiKey}`;
  res.json({ loginUrl });
});

// Handle Kite OAuth callback (manual token exchange for now)
app.post('/api/kite/token', async (req, res) => {
  try {
    const { request_token } = req.body;
    if (!request_token) {
      return res.status(400).json({ error: 'request_token is required' });
    }

    const apiKey = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;
    
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'KITE_API_KEY or KITE_API_SECRET not configured' });
    }

    // Generate checksum: sha256(api_key + request_token + api_secret)
    const checksum = crypto.createHash('sha256')
      .update(apiKey + request_token + apiSecret)
      .digest('hex');

    console.log(`[Kite Auth] Exchanging request_token for access_token...`);
    
    // Exchange request token for access token
    const response = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3'
      },
      body: new URLSearchParams({
        api_key: apiKey,
        request_token: request_token,
        checksum: checksum
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Kite Auth] Failed:', errorText);
      return res.status(response.status).json({ 
        error: `Kite API error: ${errorText}` 
      });
    }

    const data = await response.json();
    console.log('[Kite Auth] Success! Access token obtained.');
    
    // Store in environment (in-memory for this session)
    process.env.KITE_ACCESS_TOKEN = data.data.access_token;
    
    // Reset MCP client to use new access token
    resetClient();
    
    res.json({ 
      success: true, 
      user: data.data.user_name,
      message: 'Authentication successful! You can now access your portfolio data.'
    });
  } catch (err) {
    console.error('[Kite Auth] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 15600;
app.listen(PORT, () => {
  console.log(`🚀 API server running on ${PORT}`);
});
