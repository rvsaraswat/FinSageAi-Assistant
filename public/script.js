// ZeroAI Assistant front-end logic
const chatEl = document.getElementById('chat');
const userInputEl = document.getElementById('userInput');
const sendBtnEl = document.getElementById('sendBtn');
const modelSelectEl = document.getElementById('modelSelect');
const kiteLoginBtnEl = document.getElementById('kiteLoginBtn');
const portfolioBtnEl = document.getElementById('portfolioBtn');
const tradeBtnEl = document.getElementById('tradeBtn');

let currentModel = modelSelectEl.value;
modelSelectEl.addEventListener('change', () => {
  currentModel = modelSelectEl.value;
});

// Check for Kite callback on page load
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const requestToken = params.get('request_token');
  const status = params.get('status');
  
  if (requestToken && status === 'success') {
    addMessage('assistant', '🔐 Authenticating with Zerodha...');
    try {
      const res = await fetch('/api/kite/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_token: requestToken })
      });
      const data = await res.json();
      if (data.success) {
        addMessage('assistant', `✅ ${data.message} Welcome, ${data.user}!`);
        // Clear URL parameters
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
    
    // Parse remaining text as markdown
    div.innerHTML = marked.parse(textWithoutCharts);
    
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
  const payload = { model: currentModel, prompt };
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
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
    const mcpRes = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_holdings', params: {} })
    });
    
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
    
    const res = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'place_order', 
        params: orderParams
      })
    });
    
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
kiteLoginBtnEl.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/kite/login');
    const data = await res.json();
    if (data.loginUrl) {
      addMessage('assistant', '🔐 Redirecting to Zerodha login...');
      window.location.href = data.loginUrl;
    } else {
      addMessage('assistant', '❌ Failed to get login URL');
    }
  } catch (err) {
    addMessage('assistant', '❌ Error: ' + err.message);
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

addMessage('assistant', 'Welcome! Select a model and start chatting.');