import fetch from 'node-fetch';

const KITE_API_BASE = 'https://api.kite.trade';

/**
 * Call Kite Connect API directly
 */
async function callKiteAPI(endpoint, options = {}, token) {
  const accessToken = token || process.env.KITE_ACCESS_TOKEN;
  const apiKey = process.env.KITE_API_KEY;
  
  if (!accessToken) {
    throw new Error('KITE_ACCESS_TOKEN is required but not set. Please authenticate first.');
  }

  const url = `${KITE_API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `token ${apiKey}:${accessToken}`,
      'X-Kite-Version': '3'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kite API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.status === 'error') {
    throw new Error(`Kite error: ${data.message}`);
  }

  return data.data;
}

/**
 * Get user's stock holdings
 */
export async function getHoldings(token) {
  console.log('[Kite API] Fetching holdings...');
  const holdings = await callKiteAPI('/portfolio/holdings', {}, token);
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
export async function getPositions(token) {
  console.log('[Kite API] Fetching positions...');
  const positions = await callKiteAPI('/portfolio/positions', {}, token);
  return positions;
}

/**
 * Get quote for instruments
 */
export async function getQuotes(instruments, token) {
  const params = new URLSearchParams();
  instruments.forEach(i => params.append('i', i));
  
  console.log(`[Kite API] Fetching quotes for ${instruments.length} instruments...`);
  const quotes = await callKiteAPI(`/quote?${params.toString()}`, {}, token);
  return quotes;
}

/**
 * Get user profile
 */
export async function getProfile(token) {
  console.log('[Kite API] Fetching user profile...');
  const profile = await callKiteAPI('/user/profile', {}, token);
  return profile;
}

/**
 * Place an order
 * Required params: tradingsymbol, exchange, transaction_type, quantity, order_type, product
 * Optional: price, trigger_price, validity, disclosed_quantity, tag
 */
export async function placeOrder(orderParams, token) {
  // Validate required fields
  const required = ['tradingsymbol', 'exchange', 'transaction_type', 'quantity', 'order_type', 'product'];
  for (const field of required) {
    if (!orderParams[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Set defaults
  const params = {
    validity: 'DAY',
    ...orderParams
  };
  
  // For LIMIT orders, price is required
  if (params.order_type === 'LIMIT' && !params.price) {
    throw new Error('Price is required for LIMIT orders');
  }
  
  console.log('[Kite API] Placing order:', params);
  
  // Try regular order first
  try {
    const order = await callKiteAPI('/orders/regular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params)
    }, token);
    console.log('[Kite API] Order placed. Order ID:', order.order_id);
    return order;
  } catch (error) {
    // If market is closed, try AMO (After Market Order)
    if (error.message.includes('After Market Order') || error.message.includes('switch_to_amo')) {
      console.log('[Kite API] Market closed. Placing as AMO...');
      
      // AMO orders use /orders/amo endpoint and require validity to be empty or not set
      const amoParams = { ...params };
      delete amoParams.validity; // AMO doesn't use validity parameter
      
      const amoOrder = await callKiteAPI('/orders/amo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(amoParams)
      }, token);
      console.log('[Kite API] AMO Order placed. Order ID:', amoOrder.order_id);
      return { ...amoOrder, order_type: 'AMO' };
    }
    // Re-throw if not AMO-related error
    throw error;
  }
}
