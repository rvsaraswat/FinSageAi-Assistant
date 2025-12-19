# Zerodha Kite Connect Authentication Guide

## Overview
Zerodha uses OAuth2-like authentication with a manual login flow. Access tokens expire daily at 6 AM.

## Authentication Flow

### 1. Get API Credentials
- Visit https://developers.kite.trade/
- Subscribe (₹2,000/month)
- Create an app
- Note your **API Key** and **API Secret**

### 2. Initial Login (Daily)
The access token expires every day, so you need to:

1. **Generate Login URL**:
   ```
   https://kite.zerodha.com/connect/login?api_key=YOUR_API_KEY
   ```

2. **User logs in** through browser
   - Enter Zerodha credentials
   - Complete 2FA
   - Authorize the app

3. **Get Request Token**:
   After login, Zerodha redirects to your callback URL with:
   ```
   http://your-redirect-url?request_token=XXXXX&action=login&status=success
   ```

4. **Exchange for Access Token**:
   Make API call to generate session:
   ```javascript
   POST https://api.kite.trade/session/token
   Body: {
     api_key: YOUR_API_KEY,
     request_token: XXXXX,
     checksum: sha256(api_key + request_token + api_secret)
   }
   ```
   
   Response contains `access_token` - valid until 6 AM next day.

5. **Use Access Token**:
   All subsequent API calls require header:
   ```
   X-Kite-Version: 3
   Authorization: token api_key:access_token
   ```

## Option A: Manual Token Generation (Quick Start)

1. Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```

2. Edit `.env` and add your API credentials:
   ```
   KITE_API_KEY=your_actual_api_key
   KITE_API_SECRET=your_actual_secret
   ```

3. Generate token manually:
   - Visit: `https://kite.zerodha.com/connect/login?api_key=YOUR_API_KEY`
   - Login and authorize
   - Copy `request_token` from redirect URL
   - Use the token exchange script (see below)

4. Paste the access token in `.env`:
   ```
   KITE_ACCESS_TOKEN=generated_access_token_here
   ```

## Option B: Build Login Flow in App

### Add Dependencies
```powershell
npm install dotenv kiteconnect
```

### Create Authentication Endpoints

#### `/api/kite/login` - Generate login URL
```javascript
app.get('/api/kite/login', (req, res) => {
  const loginUrl = `https://kite.zerodha.com/connect/login?api_key=${process.env.KITE_API_KEY}`;
  res.json({ loginUrl });
});
```

#### `/api/kite/callback` - Handle redirect
```javascript
app.get('/api/kite/callback', async (req, res) => {
  const { request_token } = req.query;
  
  // Generate checksum
  const crypto = require('crypto');
  const checksum = crypto
    .createHash('sha256')
    .update(process.env.KITE_API_KEY + request_token + process.env.KITE_API_SECRET)
    .digest('hex');
  
  // Exchange for access token
  const response = await fetch('https://api.kite.trade/session/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      api_key: process.env.KITE_API_KEY,
      request_token: request_token,
      checksum: checksum
    })
  });
  
  const data = await response.json();
  // Store data.access_token securely (session, database, etc.)
  
  res.redirect('/?auth=success');
});
```

#### Using `kiteconnect` SDK
```javascript
import { KiteConnect } from 'kiteconnect';

const kc = new KiteConnect({
  api_key: process.env.KITE_API_KEY,
});

// After getting request_token from callback:
const session = await kc.generateSession(request_token, process.env.KITE_API_SECRET);
kc.setAccessToken(session.access_token);

// Now you can call APIs:
const holdings = await kc.getHoldings();
const positions = await kc.getPositions();
```

## Key API Endpoints for Portfolio

### Get Holdings
```javascript
GET https://api.kite.trade/portfolio/holdings
Headers: 
  X-Kite-Version: 3
  Authorization: token api_key:access_token

Response: [{
  tradingsymbol: "INFY",
  quantity: 10,
  average_price: 1540.50,
  last_price: 1568.30,
  pnl: 278.00,
  ...
}]
```

### Get Positions
```javascript
GET https://api.kite.trade/portfolio/positions
```

### Place Order
```javascript
POST https://api.kite.trade/orders/regular
Body: {
  tradingsymbol: "INFY",
  exchange: "NSE",
  transaction_type: "BUY",
  order_type: "MARKET",
  quantity: 1,
  product: "CNC",
  validity: "DAY"
}
```

## Security Best Practices

1. **Never commit `.env`** - Already in `.gitignore`
2. **Rotate secrets** if exposed
3. **Use HTTPS** in production
4. **Store tokens securely** - Use encryption or secure session storage
5. **Handle expiry** - Implement token refresh or re-login flow

## Testing Without Real Money

1. Use Zerodha's **Kite Connect API sandbox** (if available)
2. Start with small quantities
3. Test with liquid stocks
4. Use `product: "CNC"` for delivery orders (less risky than MIS)

## Next Steps

Want me to:
1. **Implement the login flow** in the app with UI buttons?
2. **Add KiteConnect SDK** and create portfolio/order endpoints?
3. **Create a token generation script** you can run manually each day?

Let me know which approach you prefer!
