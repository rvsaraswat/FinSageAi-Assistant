import fetch from 'node-fetch';

const KITE_API_BASE = 'https://api.kite.trade';

/**
 * Call Kite Connect API directly
 */
async function callKiteAPI(endpoint, options = {}, creds = {}) {
  const accessToken = creds.accessToken || process.env.KITE_ACCESS_TOKEN;
  const apiKey      = creds.apiKey      || process.env.KITE_API_KEY;
  
  if (!accessToken) {
    throw new Error('KITE_ACCESS_TOKEN is required but not set. Please authenticate first.');
  }

  const url        = `${KITE_API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `token ${apiKey}:${accessToken}`,
        'X-Kite-Version': '3',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kite API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    if (data.status === 'error') throw new Error(`Kite error: ${data.message}`);
    return data.data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Kite API request timed out (30s)');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get user's stock holdings
 */
export async function getHoldings(creds = {}) {
  console.log('[Kite API] Fetching holdings...');
  const holdings = await callKiteAPI('/portfolio/holdings', {}, creds);
  console.log(`[Kite API] Retrieved ${holdings.length} holdings`);
  
  // Calculate total current value and other metrics
  let totalCurrentValue = 0;
  let totalInvestment = 0;
  
  holdings.forEach(holding => {
    const currentValue = holding.quantity * holding.last_price;
    const investment = holding.quantity * holding.average_price;
    totalCurrentValue += currentValue;
    totalInvestment += investment;
    
    // Add calculated fields to each holding
    holding.current_value = currentValue;
    holding.investment = investment;
    holding.pnl = currentValue - investment;
    holding.pnl_percentage = ((currentValue - investment) / investment * 100).toFixed(2);
  });
  
  const totalPnL = totalCurrentValue - totalInvestment;
  const totalPnLPercentage = ((totalPnL / totalInvestment) * 100).toFixed(2);
  
  console.log(`[Kite API] Total Current Value: ₹${totalCurrentValue.toFixed(2)}`);
  console.log(`[Kite API] Total Investment: ₹${totalInvestment.toFixed(2)}`);
  console.log(`[Kite API] Total P&L: ₹${totalPnL.toFixed(2)} (${totalPnLPercentage}%)`);
  
  return {
    holdings,
    summary: {
      total_stocks: holdings.length,
      total_current_value: totalCurrentValue,
      total_investment: totalInvestment,
      total_pnl: totalPnL,
      total_pnl_percentage: parseFloat(totalPnLPercentage)
    }
  };
}

/**
 * Get user's open positions
 */
export async function getPositions(creds = {}) {
  console.log('[Kite API] Fetching positions...');
  const positions = await callKiteAPI('/portfolio/positions', {}, creds);
  return positions;
}

export async function getQuotes(instruments, creds = {}) {
  const params = new URLSearchParams();
  instruments.forEach(i => params.append('i', i));
  console.log(`[Kite API] Fetching quotes for ${instruments.length} instruments...`);
  const quotes = await callKiteAPI(`/quote?${params.toString()}`, {}, creds);
  return quotes;
}

export async function getProfile(creds = {}) {
  console.log('[Kite API] Fetching user profile...');
  const profile = await callKiteAPI('/user/profile', {}, creds);
  return profile;
}

/**
 * Place an order
 * Required params: tradingsymbol, exchange, transaction_type, quantity, order_type, product
 * Optional: price, trigger_price, validity, disclosed_quantity, tag
 */
export async function placeOrder(orderParams, creds = {}) {
  // Validate required fields
  const required = ['tradingsymbol', 'exchange', 'transaction_type', 'quantity', 'order_type', 'product'];
  for (const field of required) {
    if (!orderParams[field]) throw new Error(`Missing required field: ${field}`);
  }

  // Enum validation
  const VALID_EXCHANGES    = new Set(['NSE', 'BSE', 'NFO', 'BFO', 'MCX', 'CDS']);
  const VALID_TX_TYPES     = new Set(['BUY', 'SELL']);
  const VALID_ORDER_TYPES  = new Set(['MARKET', 'LIMIT', 'SL', 'SL-M']);
  const VALID_PRODUCTS     = new Set(['CNC', 'MIS', 'NRML', 'CO', 'BO']);

  if (!VALID_EXCHANGES.has(orderParams.exchange))
    throw new Error(`Invalid exchange '${orderParams.exchange}'. Must be one of: ${[...VALID_EXCHANGES].join(', ')}`);
  if (!VALID_TX_TYPES.has(orderParams.transaction_type))
    throw new Error(`Invalid transaction_type '${orderParams.transaction_type}'. Must be BUY or SELL`);
  if (!VALID_ORDER_TYPES.has(orderParams.order_type))
    throw new Error(`Invalid order_type '${orderParams.order_type}'. Must be one of: ${[...VALID_ORDER_TYPES].join(', ')}`);
  if (!VALID_PRODUCTS.has(orderParams.product))
    throw new Error(`Invalid product '${orderParams.product}'. Must be one of: ${[...VALID_PRODUCTS].join(', ')}`);

  // Quantity must be a positive integer
  const qty = Number(orderParams.quantity);
  if (!Number.isInteger(qty) || qty <= 0)
    throw new Error('quantity must be a positive integer');

  // Sanitize tradingsymbol: only allow alphanumeric, hyphen, ampersand, dot
  if (!/^[A-Z0-9&._-]{1,30}$/i.test(orderParams.tradingsymbol))
    throw new Error(`Invalid tradingsymbol: '${orderParams.tradingsymbol}'`);

  const params = { validity: 'DAY', ...orderParams, quantity: qty };

  if (params.order_type === 'LIMIT' && !params.price) {
    throw new Error('Price is required for LIMIT orders');
  }

  console.log('[Kite API] Placing order:', params);

  try {
    const order = await callKiteAPI('/orders/regular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    }, creds);
    console.log('[Kite API] Order placed. Order ID:', order.order_id);
    return order;
  } catch (error) {
    if (error.message.includes('After Market Order') || error.message.includes('switch_to_amo')) {
      console.log('[Kite API] Market closed. Placing as AMO...');
      const amoParams = { ...params };
      delete amoParams.validity;
      const amoOrder = await callKiteAPI('/orders/amo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(amoParams),
      }, creds);
      console.log('[Kite API] AMO Order placed. Order ID:', amoOrder.order_id);
      return { ...amoOrder, order_type: 'AMO' };
    }
    throw error;
  }
}
