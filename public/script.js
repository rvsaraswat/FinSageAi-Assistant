// ZeroAI Assistant front-end logic
const chatEl        = document.getElementById('chat');
const userInputEl   = document.getElementById('userInput');
const sendBtnEl     = document.getElementById('sendBtn');
const modelSelectEl = document.getElementById('modelSelect');
const kiteLoginBtnEl= document.getElementById('kiteLoginBtn');
const accountsBtnEl = document.getElementById('accountsBtn');
const portfolioBtnEl= document.getElementById('portfolioBtn');
const tradeBtnEl    = document.getElementById('tradeBtn');

// ─── Fetch with timeout helper ────────────────────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(id);
  }
}

let currentModel = '';
modelSelectEl.addEventListener('change', () => {
  currentModel = modelSelectEl.value;
});

// ─── AI PRESET PROMPTS ───────────────────────────────────────────────────────

const _TRADE_BLOCK = `

**Trade Execution Protocol:**
When a user requests to place an order, respond with:
1. A brief acknowledgment ("Preparing your order...")
2. The order command block:
\`\`\`order
{
  "tradingsymbol": "SYMBOL",
  "exchange": "NSE",
  "transaction_type": "BUY",
  "quantity": 1,
  "order_type": "MARKET",
  "product": "CNC"
}
\`\`\`
IMPORTANT: Do NOT ask for confirmation — the system handles this automatically.
Rules: exchange defaults to NSE; product defaults to CNC (delivery); order_type defaults to MARKET; include price only for LIMIT orders; MIS for intraday, NRML for carry-forward.`;

const SYSTEM_PROMPTS = {
  default:
`You are FinSageAi, an expert AI investment analyst and portfolio advisor with deep knowledge of the Indian stock market, investment strategies, and risk management. You have access to real-time portfolio data and can execute trades through the Zerodha Kite Connect API.

Your capabilities include:
- Fundamental and technical analysis of Indian equities (NSE/BSE)
- Sector trends, market conditions, and macroeconomic context
- Risk-adjusted returns and portfolio diversification principles
- Tax optimization for Indian investors (LTCG, STCG, ELSS, 80C)
- Portfolio rebalancing, asset allocation, and position sizing
- Executing buy/sell orders on behalf of the user

When analyzing portfolios: use the provided numbers directly (never recalculate totals), identify specific stocks with clear buy/sell/hold signals and reasoning, consider tax implications of every trade, provide sector concentration analysis, and give both short-term and long-term actionable recommendations. Be direct, confident, and specific.` + _TRADE_BLOCK,

  conservative:
`You are FinSageAi, a conservative investment advisor for Indian retail investors. Your core philosophy is capital preservation first, steady income second.

You prioritize:
- Large-cap blue-chip stocks with consistent dividend history (TCS, Infosys, HUL, HDFC Bank, ITC)
- Diversification across at least 8–10 sectors; no single stock exceeding 10% of portfolio
- Debt allocation: recommend liquid funds, government bonds, or fixed deposits for stability
- LTCG optimization: always flag if selling early triggers higher short-term tax liability
- Mandatory stop-loss on every trade recommendation
- Avoid speculative small-caps, IPO chasing, and leveraged F&O positions

When analyzing portfolios: immediately flag concentration risks (>15% in one stock/sector), recommend portfolio insurance strategies, emphasize downside protection alongside upside, and calculate net post-tax returns. Present worst-case scenarios alongside best-case.` + _TRADE_BLOCK,

  growth:
`You are FinSageAi, a high-conviction growth investment advisor for long-term wealth builders targeting compounding returns over 5–10 year horizons.

You focus on:
- High-growth sectors: IT, AI infrastructure, EV & renewables, specialty chemicals, pharma R&D, defense manufacturing
- Mid-cap and small-cap stocks with strong earnings CAGR (>20% YoY)
- Identifying multi-bagger opportunities before institutional coverage peaks
- Emerging India themes: PLI scheme beneficiaries, data centers, fintech, clean energy
- SIP-style accumulation strategies during market corrections and dips
- Portfolio concentration in high-conviction ideas (10–15 stocks max)

When analyzing portfolios: calculate holding-period CAGR for each stock, identify positions for progressive accumulation, suggest sector rotation plays, highlight under-allocated high-growth themes, and recommend adding to winners on dips. Think in 5-year compounding terms.` + _TRADE_BLOCK,

  trader:
`You are FinSageAi, an active trading advisor for intraday and short-term traders on NSE/BSE. You specialize in technical momentum trading and risk discipline.

You focus on:
- Technical analysis: support/resistance levels, RSI, MACD, EMA crossovers, volume signals
- Momentum and breakout trading setups
- Intraday (MIS) and short-term swing trades (NRML/CNC)
- Position sizing discipline: maximum 2% capital-at-risk per trade
- Quick executable setups with specific entry, target, and stop-loss levels

For every trade recommendation: always specify entry price range, target price, stop-loss level, expected risk:reward ratio (minimum 1:2), and recommended product type (MIS for intraday, NRML for overnight). Include a clear exit strategy. Default to MIS product type unless otherwise specified.` + _TRADE_BLOCK,

  tax:
`You are FinSageAi, a tax-optimization focused investment advisor for Indian investors under the Income Tax Act 1961. Your goal is to maximize post-tax returns and minimize tax drag.

You specialize in:
- LTCG (12.5% above ₹1.25L exemption) vs STCG (20%) implications for every trade decision
- Tax-loss harvesting: identify positions to book losses that offset taxable capital gains
- Optimal holding-period management: flag positions close to the 1-year LTCG threshold
- Section 80C planning: ELSS fund allocation to claim ₹1.5L deduction
- Dividend vs growth option analysis for mutual funds under the new tax regime
- Intra-family gifting and HUF structures where applicable

When analyzing portfolios: calculate total estimated LTCG/STCG liability, quantify tax savings from holding X months longer, identify loss-harvesting candidates ranked by tax benefit, and provide a specific tax-optimized action plan with timelines.` + _TRADE_BLOCK
};

// ─── USER SETTINGS ───────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  activePreset: 'default',
  customPrompt: '',       // empty = use activePreset
  riskTolerance: '',
  investmentHorizon: '',
  taxBracket: '',
  capitalRange: ''
};

let userSettings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const raw = localStorage.getItem('finsageai_settings');
    if (raw) userSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
}

function saveSettingsToStorage() {
  try {
    localStorage.setItem('finsageai_settings', JSON.stringify(userSettings));
  } catch (e) { /* ignore */ }
}

function buildProfileContext() {
  const parts = [];
  if (userSettings.riskTolerance)     parts.push(`Risk: ${userSettings.riskTolerance}`);
  if (userSettings.investmentHorizon) parts.push(`Horizon: ${userSettings.investmentHorizon}`);
  if (userSettings.taxBracket)        parts.push(`Tax Bracket: ${userSettings.taxBracket}`);
  if (userSettings.capitalRange)      parts.push(`Capital: ${userSettings.capitalRange}`);
  return parts.length ? `\n\n**Investor Profile:** ${parts.join(' | ')}` : '';
}

function getEffectiveSystemPrompt() {
  const base = userSettings.customPrompt ||
               SYSTEM_PROMPTS[userSettings.activePreset] ||
               SYSTEM_PROMPTS.default;
  return base + buildProfileContext();
}

loadSettings();

// Dynamically load available Ollama models
function formatSize(bytes) {
  if (!bytes) return '';
  const gb = bytes / 1_073_741_824;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1_048_576).toFixed(0)} MB`;
}

function modelTier(bytes) {
  const gb = bytes / 1_073_741_824;
  if (gb < 2)  return 'small';
  if (gb < 8)  return 'medium';
  if (gb < 14) return 'large';
  return 'xlarge';
}

const TIER_META = {
  small:  { label: '🟢 Small  ·  runs on 8 GB RAM',   order: 0 },
  medium: { label: '🟡 Medium  ·  needs 12–16 GB RAM', order: 1 },
  large:  { label: '🟠 Large  ·  needs 16–24 GB RAM',  order: 2 },
  xlarge: { label: '🔴 X-Large  ·  needs 24 GB+ RAM',  order: 3 },
};

async function loadModels() {
  try {
    const res = await fetchWithTimeout('/api/models', {}, 10000);
    const { models } = await res.json();
    if (!models || models.length === 0) return;

    // Group by tier
    const groups = {};
    for (const m of models) {
      const tier = modelTier(m.size);
      if (!groups[tier]) groups[tier] = [];
      groups[tier].push(m);
    }

    // Build optgroups sorted by tier order
    modelSelectEl.innerHTML = Object.entries(groups)
      .sort((a, b) => TIER_META[a[0]].order - TIER_META[b[0]].order)
      .map(([tier, list]) => {
        const options = list
          .map(m => `<option value="${m.name}">${m.name}${m.size ? '  ·  ' + formatSize(m.size) : ''}</option>`)
          .join('');
        return `<optgroup label="${TIER_META[tier].label}">${options}</optgroup>`;
      })
      .join('');

    currentModel = modelSelectEl.value;
  } catch (e) {
    console.warn('Could not load models:', e);
  }
}
loadModels();

// Check for Kite callback on page load
window.addEventListener('DOMContentLoaded', async () => {
  const params       = new URLSearchParams(window.location.search);
  const requestToken = params.get('request_token');
  const status       = params.get('status');

  if (requestToken && status === 'success') {
    // Retrieve account_id saved before OAuth redirect
    const accountId = sessionStorage.getItem('pendingLoginAccountId') || null;
    sessionStorage.removeItem('pendingLoginAccountId');

    addMessage('assistant', '🔐 Authenticating with Zerodha...');
    try {
      const res = await fetchWithTimeout('/api/kite/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_token: requestToken, account_id: accountId }),
      }, 30000);
      const data = await res.json();
      if (data.success) {
        addMessage('assistant', `✅ ${data.message} Welcome, ${data.user}!`);
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        addMessage('assistant', `❌ Authentication failed: ${data.error}`);
      }
    } catch (err) {
      addMessage('assistant', `❌ Error: ${err.message}`);
    }
  }
});

let chartCounter = 0;

function renderChart(container, chartData) {
  const canvas = document.createElement('canvas');
  canvas.id = `chart-${chartCounter++}`;
  canvas.style.maxWidth = '100%';
  canvas.style.maxHeight = '400px';
  container.appendChild(canvas);
  
  new Chart(canvas, chartData);
}

function addMessage(sender, text) {
  const div = document.createElement('div');
  div.className = `bubble ${sender}`;
  
  // Render markdown for assistant messages, plain text for user
  if (sender === 'assistant' && typeof marked !== 'undefined') {
    // Extract and remove chart blocks before markdown parsing
    const chartBlocks = [];
    let textWithoutCharts = text.replace(/```chart\n([\s\S]*?)\n```/g, (match, chartJson) => {
      try {
        chartBlocks.push(JSON.parse(chartJson));
        return ''; // Remove from text
      } catch (e) {
        console.error('Failed to parse chart data:', e);
        return match; // Keep original if parse fails
      }
    });
    
    // Extract and execute order blocks
    const orderBlocks = [];
    textWithoutCharts = textWithoutCharts.replace(/```order\n([\s\S]*?)\n```/g, (match, orderJson) => {
      try {
        orderBlocks.push(JSON.parse(orderJson));
        return '**[Order Ready for Execution]**'; // Replace with placeholder
      } catch (e) {
        console.error('Failed to parse order data:', e);
        return match;
      }
    });
    
    // Parse remaining text as markdown, sanitized with DOMPurify
    const rawHtml = marked.parse(textWithoutCharts);
    div.innerHTML = (typeof DOMPurify !== 'undefined')
      ? DOMPurify.sanitize(rawHtml)
      : rawHtml;
    
    // Render extracted charts
    chartBlocks.forEach(chartData => {
      const chartContainer = document.createElement('div');
      chartContainer.className = 'chart-container';
      div.appendChild(chartContainer);
      renderChart(chartContainer, chartData);
    });
    
    // Store pending orders for confirmation (don't execute immediately)
    orderBlocks.forEach(orderData => {
      storePendingOrder(orderData);
    });
  } else {
    div.textContent = text;
  }
  
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// Show typing indicator
function showTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'bubble assistant typing-indicator';
  div.id = 'typing-indicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// Remove typing indicator
function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) {
    indicator.remove();
  }
}

async function callLLM(prompt) {
  const payload = { model: currentModel, prompt, systemPrompt: getEffectiveSystemPrompt() };
  const res = await fetchWithTimeout('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 120000); // 2-min timeout for LLM
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return data.reply;
}

// Option A: Use LLM with system-like phrasing for portfolio analysis
// Option B: Direct MCP call (uncomment below if MCP endpoint exists)
async function analyzePortfolio() {
  try {
    addMessage('assistant', '📊 Fetching your real portfolio data from Zerodha...');
    
    // Call MCP to get real portfolio data
    const mcpRes = await fetchWithTimeout('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_holdings', params: {} }),
    }, 30000);
    
    if (!mcpRes.ok) {
      const errorData = await mcpRes.json().catch(() => ({}));
      
      // Check if authentication is needed
      if (mcpRes.status === 401 || errorData.needsAuth) {
        throw new Error('🔐 Authentication required! Please click the "🔐 Kite Login" button to connect your Zerodha account first.');
      }
      
      throw new Error(`Failed to fetch portfolio: ${errorData.error || mcpRes.statusText}`);
    }
    
    const { reply: portfolioData } = await mcpRes.json();
    addMessage('assistant', '✅ Portfolio data received. Analyzing with AI...');
    
    // Show typing indicator
    showTypingIndicator();
    
    // Extract summary and holdings
    const { holdings, summary } = portfolioData;
    
    // Create a simplified holdings table for the LLM (reduce token count)
    const holdingsTable = holdings.map(h => 
      `${h.tradingsymbol}: Qty ${h.quantity}, Avg ₹${h.average_price}, LTP ₹${h.last_price}, P&L ${h.pnl_percentage}%`
    ).join('\n');
    
    // Now ask LLM to analyze the real portfolio data
    const prompt = `Analyze my portfolio and provide expert financial advice:

**Portfolio Summary:**
- Total Stocks: ${summary.total_stocks}
- Total Current Value: ₹${summary.total_current_value.toFixed(2)}
- Total Investment: ₹${summary.total_investment.toFixed(2)}
- Total P&L: ₹${summary.total_pnl.toFixed(2)} (${summary.total_pnl_percentage}%)

**Holdings:**
${holdingsTable}

IMPORTANT: Use the exact total current value of ₹${summary.total_current_value.toFixed(2)} in your summary. Do not recalculate.

Provide a comprehensive analysis with:

1. **Portfolio Health Summary** (use pre-calculated values above)
2. **Sector Analysis** - Identify sector concentration and diversification gaps
3. **Top Performers & Underperformers** - List top 3 gainers and top 3 losers with analysis
4. **Risk Assessment** - Concentration risk, sector exposure, volatility concerns
5. **Actionable Recommendations:**
   - Specific stocks to SELL (with reasoning: poor fundamentals, overvalued, sector concerns)
   - Specific stocks to HOLD (with reasoning: good fundamentals, fair valuation)
   - Stocks to ADD/INCREASE (if portfolio is under-diversified in certain sectors)
   - Suggested allocation changes with specific percentages

6. **Near-term Action Plan** - What to do in the next 1-3 months

Be direct and confident. Provide specific stock names and clear buy/sell/hold signals.

Then include these charts to visualize the portfolio:

**1. Portfolio Allocation (Pie Chart)** - Show top holdings by current value:

\`\`\`chart
{
  "type": "pie",
  "data": {
    "labels": ["Stock1", "Stock2", "Stock3", "Others"],
    "datasets": [{
      "data": [25, 20, 15, 40],
      "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40", "#E7E9ED", "#8DD3C7"]
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "legend": { "position": "bottom" },
      "title": { "display": true, "text": "Portfolio Allocation by Value" }
    }
  }
}
\`\`\`

**2. Profit & Loss by Stock (Bar Chart)** - Show P&L percentage for each holding:

\`\`\`chart
{
  "type": "bar",
  "data": {
    "labels": ["STOCK1", "STOCK2", "STOCK3", "STOCK4"],
    "datasets": [{
      "label": "P&L %",
      "data": [30, 15, -10, 5],
      "backgroundColor": ["#10B981", "#10B981", "#EF4444", "#10B981"]
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "title": { "display": true, "text": "Profit & Loss by Stock" },
      "legend": { "display": false }
    },
    "scales": {
      "y": { "beginAtZero": true, "title": { "display": true, "text": "P&L %" } }
    }
  }
}
\`\`\`

**3. Sector Allocation (Doughnut Chart)** - Group stocks by sector:

\`\`\`chart
{
  "type": "doughnut",
  "data": {
    "labels": ["IT", "Banking", "Consumer", "Others"],
    "datasets": [{
      "data": [35, 25, 20, 20],
      "backgroundColor": ["#3B82F6", "#10B981", "#F59E0B", "#6366F1"]
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "legend": { "position": "bottom" },
      "title": { "display": true, "text": "Sector-wise Distribution" }
    }
  }
}
\`\`\``;

    const reply = await callLLM(prompt);
    
    // Remove typing indicator
    removeTypingIndicator();
    
    if (!reply || reply.trim().length === 0) {
      throw new Error('Received empty response from AI');
    }
    
    addMessage('assistant', reply);
  } catch (err) {
    // Remove typing indicator on error too
    removeTypingIndicator();
    console.error(err);
    addMessage('assistant', 'Error analyzing portfolio: ' + err.message);
  }
}

async function placeTrade(symbol, qty) {
  try {
    addMessage('assistant', `Placing trade for ${symbol} x ${qty}...`);
    const res = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'place_order', params: { symbol, quantity: qty } })
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Trade error ${res.status}: ${txt}`);
    }
    const data = await res.json();
    addMessage('assistant', 'Trade response: ' + JSON.stringify(data.reply));
  } catch (err) {
    console.error(err);
    addMessage('assistant', 'Error placing trade: ' + err.message);
  }
}

// Store pending order for confirmation
let pendingOrder = null;

function storePendingOrder(orderParams) {
  pendingOrder = orderParams;
  
  const { tradingsymbol, exchange, transaction_type, quantity, order_type, product, price } = orderParams;
  
  // Build confirmation message
  let confirmMsg = `📋 **Order Ready for Confirmation:**\n\n`;
  confirmMsg += `- **Stock:** ${tradingsymbol}\n`;
  confirmMsg += `- **Exchange:** ${exchange || 'NSE'}\n`;
  confirmMsg += `- **Type:** ${transaction_type}\n`;
  confirmMsg += `- **Quantity:** ${quantity} shares\n`;
  confirmMsg += `- **Order Type:** ${order_type}\n`;
  confirmMsg += `- **Product:** ${product || 'CNC'}\n`;
  if (price) confirmMsg += `- **Price:** ₹${price}\n`;
  
  confirmMsg += `\n⚠️ **Please type "CONFIRM" to execute this order, or "CANCEL" to abort.**`;
  
  addMessage('assistant', confirmMsg);
}

// Execute order (after confirmation)
async function executeOrder(orderParams) {
  try {
    const { tradingsymbol, exchange, transaction_type, quantity, order_type, product, price } = orderParams;
    
    addMessage('assistant', '⏳ Executing order...');
    
    const res = await fetchWithTimeout('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'place_order', params: orderParams }),
    }, 30000);
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errorData.error || `Order failed with status ${res.status}`);
    }
    
    const data = await res.json();
    const orderType = data.reply.order_type === 'AMO' ? ' (AMO - After Market Order)' : '';
    addMessage('assistant', `✅ **Order Placed Successfully!**${orderType}\n\n**Order ID:** ${data.reply.order_id || 'N/A'}\n\nYour order has been submitted to the exchange.`);
    
    // Clear pending order
    pendingOrder = null;
  } catch (err) {
    console.error('Order execution error:', err);
    
    // Enhanced error message with guidance
    let errorMsg = `❌ **Order Failed:** ${err.message}`;
    
    // Check for specific error types and provide guidance
    if (err.message.includes('need to be authorised at CDSL') || err.message.includes('TPIN')) {
      errorMsg += `\n\n📝 **How to Fix:**\n`;
      errorMsg += `1. Go to [Zerodha Console](https://console.zerodha.com)\n`;
      errorMsg += `2. Navigate to **Portfolio → Holdings**\n`;
      errorMsg += `3. Click on **Authorise** next to ${orderParams.tradingsymbol}\n`;
      errorMsg += `4. Enter your CDSL TPIN to authorize the shares\n`;
      errorMsg += `5. Try placing the order again after authorization\n\n`;
      errorMsg += `**Note:** CDSL requires authorization before selling holdings. This is a one-time process per sale.`;
    } else if (err.message.includes('After Market Order') || err.message.includes('market hours')) {
      errorMsg += `\n\n**Note:** Market is currently closed. Order will be placed as AMO (After Market Order) and executed when market opens.`;
    } else if (err.message.includes('insufficient')) {
      errorMsg += `\n\n**Note:** Insufficient funds or quantity in your account.`;
    }
    
    addMessage('assistant', errorMsg);
    pendingOrder = null;
  }
}

async function handleSend() {
  const text = userInputEl.value.trim();
  if (!text) return;
  userInputEl.value = '';
  addMessage('user', text);
  
  // Check for order confirmation
  const upperText = text.trim().toUpperCase();
  
  if (pendingOrder) {
    if (upperText === 'CONFIRM' || upperText === 'YES') {
      // Execute the pending order
      await executeOrder(pendingOrder);
      return;
    } else if (upperText === 'CANCEL' || upperText === 'NO') {
      // Cancel the pending order
      pendingOrder = null;
      addMessage('assistant', '❌ **Order Cancelled.** The order was not placed.');
      return;
    }
    // If user says something else while order is pending, remind them
    addMessage('assistant', '⚠️ You have a pending order. Please type **CONFIRM** to execute it or **CANCEL** to abort it.');
    return;
  }
  
  // Show typing indicator
  showTypingIndicator();
  
  try {
    const reply = await callLLM(text);
    
    // Remove typing indicator and show response
    removeTypingIndicator();
    addMessage('assistant', reply);
  } catch (err) {
    removeTypingIndicator();
    console.error(err);
    addMessage('assistant', 'Error: ' + err.message);
  }
}

sendBtnEl.addEventListener('click', handleSend);
userInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSend();
});
kiteLoginBtnEl.addEventListener('click', () => openAccountsModal());

// ─── ACCOUNTS MODAL ──────────────────────────────────────────────────────────

const accountsModalEl        = document.getElementById('accountsModal');
const closeAccountsBtnEl     = document.getElementById('closeAccountsBtn');
const closeAccountsFooterBtn = document.getElementById('closeAccountsFooterBtn');
const addAccountBtnEl        = document.getElementById('addAccountBtn');

function openAccountsModal() {
  loadAccounts();
  accountsModalEl.removeAttribute('hidden');
}
function closeAccountsModal() {
  accountsModalEl.setAttribute('hidden', '');
}

accountsBtnEl.addEventListener('click', openAccountsModal);
closeAccountsBtnEl.addEventListener('click', closeAccountsModal);
closeAccountsFooterBtn.addEventListener('click', closeAccountsModal);
accountsModalEl.addEventListener('click', e => { if (e.target === accountsModalEl) closeAccountsModal(); });

async function loadAccounts() {
  const listEl = document.getElementById('accountsList');
  try {
    const res  = await fetchWithTimeout('/api/accounts', {}, 10000);
    const { accounts } = await res.json();
    renderAccountsList(accounts);
  } catch (e) {
    listEl.innerHTML = '<p class="accounts-empty">Could not load accounts.</p>';
  }
}

function renderAccountsList(accounts) {
  const listEl = document.getElementById('accountsList');
  if (!accounts || accounts.length === 0) {
    listEl.innerHTML = '<p class="accounts-empty">No accounts added yet. Fill in the form below to add your Zerodha API credentials.</p>';
    return;
  }
  listEl.innerHTML = accounts.map(a => {
    const statusClass = (a.has_token && !a.token_expired) ? 'status-ok' : 'status-warn';
    const statusText  = a.has_token
      ? (a.token_expired ? '⚠️ Token expired — re-login needed' : `✅ Authenticated${a.user_name ? ' — ' + a.user_name : ''}`)
      : '🔒 Not logged in';
    return `
      <div class="account-item${a.is_active ? ' acc-active' : ''}">
        <div class="account-info">
          <span class="account-name">${a.name}</span>
          ${a.is_active ? '<span class="acc-badge">● Active</span>' : ''}
          <span class="account-key">${a.api_key_hint}</span>
          <span class="account-status ${statusClass}">${statusText}</span>
        </div>
        <div class="account-actions">
          ${!a.is_active ? `<button class="btn-sm btn-outline" onclick="activateAccount('${a.id}')">Set Active</button>` : ''}
          <button class="btn-sm btn-primary" onclick="loginAccount('${a.id}')">&#128274; Login</button>
          <button class="btn-sm btn-danger" onclick="deleteAccount('${a.id}')">&#10005;</button>
        </div>
      </div>`;
  }).join('');
}

window.activateAccount = async function(id) {
  await fetchWithTimeout(`/api/accounts/${id}/activate`, { method: 'POST' }, 10000);
  await loadAccounts();
};

window.loginAccount = function(id) {
  sessionStorage.setItem('pendingLoginAccountId', id);
  fetchWithTimeout(`/api/kite/login?account_id=${id}`, {}, 10000)
    .then(r => r.json())
    .then(data => { if (data.loginUrl) window.location.href = data.loginUrl; })
    .catch(err => addMessage('assistant', '❌ Error: ' + err.message));
};

window.deleteAccount = async function(id) {
  if (!confirm('Remove this Zerodha account? This cannot be undone.')) return;
  await fetchWithTimeout(`/api/accounts/${id}`, { method: 'DELETE' }, 10000);
  await loadAccounts();
};

addAccountBtnEl.addEventListener('click', async () => {
  const name      = document.getElementById('accName').value.trim();
  const apiKey    = document.getElementById('accApiKey').value.trim();
  const apiSecret = document.getElementById('accApiSecret').value.trim();
  if (!name || !apiKey || !apiSecret) {
    alert('Please fill in all three fields.');
    return;
  }
  try {
    const res  = await fetchWithTimeout('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, api_key: apiKey, api_secret: apiSecret }),
    }, 10000);
    const data = await res.json();
    if (!res.ok) { alert('Error: ' + data.error); return; }
    document.getElementById('accName').value      = '';
    document.getElementById('accApiKey').value    = '';
    document.getElementById('accApiSecret').value = '';
    await loadAccounts();
    addMessage('assistant', `✅ **Account “${name}” added!** Click the 🔐 Login button next to it to authenticate with Zerodha.`);
  } catch (err) {
    alert('Error: ' + err.message);
  }
});
portfolioBtnEl.addEventListener('click', () => analyzePortfolio());
tradeBtnEl.addEventListener('click', () => {
  addMessage('assistant', `📝 **How to Place Orders:**

To place an order, please ask me in natural language. For example:
- "Buy 10 shares of INFY at market price"
- "Sell 5 shares of TCS as a limit order at ₹3500"
- "Place a buy order for RELIANCE, quantity 2, CNC product type"

I'll help you construct the proper order with all required details:
- **Exchange**: NSE or BSE
- **Transaction Type**: BUY or SELL
- **Order Type**: MARKET or LIMIT
- **Product**: CNC (delivery), MIS (intraday), or NRML (carry forward)
- **Quantity** and **Price** (for limit orders)

**Note:** Order placement is disabled in the quick button for safety. Use the chat for careful order creation.`);
});

// ─── SETTINGS MODAL ──────────────────────────────────────────────────────────

const settingsModalEl  = document.getElementById('settingsModal');
const settingsBtnEl    = document.getElementById('settingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn= document.getElementById('cancelSettingsBtn');
const saveSettingsBtn  = document.getElementById('saveSettingsBtn');
const systemPromptText = document.getElementById('systemPromptText');
const riskToleranceEl  = document.getElementById('riskTolerance');
const investHorizonEl  = document.getElementById('investmentHorizon');
const taxBracketEl     = document.getElementById('taxBracket');
const capitalRangeEl   = document.getElementById('capitalRange');

function openSettings() {
  // Populate fields from current state
  systemPromptText.value = userSettings.customPrompt ||
                           SYSTEM_PROMPTS[userSettings.activePreset] ||
                           SYSTEM_PROMPTS.default;
  riskToleranceEl.value = userSettings.riskTolerance || '';
  investHorizonEl.value = userSettings.investmentHorizon || '';
  taxBracketEl.value    = userSettings.taxBracket || '';
  capitalRangeEl.value  = userSettings.capitalRange || '';
  // Highlight active preset button
  document.querySelectorAll('.preset-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.preset === userSettings.activePreset)
  );
  settingsModalEl.removeAttribute('hidden');
}

function closeSettingsModal() {
  settingsModalEl.setAttribute('hidden', '');
}

settingsBtnEl.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettingsModal);
cancelSettingsBtn.addEventListener('click', closeSettingsModal);

// Close on backdrop click
settingsModalEl.addEventListener('click', e => {
  if (e.target === settingsModalEl) closeSettingsModal();
});

// Preset button clicks — fill textarea and highlight button
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.dataset.preset;
    systemPromptText.value = SYSTEM_PROMPTS[preset] || SYSTEM_PROMPTS.default;
    userSettings.activePreset = preset;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

saveSettingsBtn.addEventListener('click', () => {
  const activePresetText = SYSTEM_PROMPTS[userSettings.activePreset] || SYSTEM_PROMPTS.default;
  const typed = systemPromptText.value.trim();
  // Only store as custom if it differs from the selected preset
  userSettings.customPrompt      = typed === activePresetText ? '' : typed;
  userSettings.riskTolerance     = riskToleranceEl.value;
  userSettings.investmentHorizon = investHorizonEl.value;
  userSettings.taxBracket        = taxBracketEl.value;
  userSettings.capitalRange      = capitalRangeEl.value;
  saveSettingsToStorage();
  closeSettingsModal();

  const presetLabel = btn => document.querySelector(`.preset-btn[data-preset="${userSettings.activePreset}"]`)?.textContent || userSettings.activePreset;
  const profileParts = [];
  if (userSettings.riskTolerance)     profileParts.push(userSettings.riskTolerance);
  if (userSettings.investmentHorizon) profileParts.push(userSettings.investmentHorizon);
  const summary = profileParts.length ? ` | Profile: ${profileParts.join(', ')}` : '';
  addMessage('assistant', `✅ **Settings saved!** Using preset: **${userSettings.activePreset}**${summary}\n\nAll future responses will use your configuration.`);
});

addMessage('assistant', 'Welcome! Select a model and start chatting.');