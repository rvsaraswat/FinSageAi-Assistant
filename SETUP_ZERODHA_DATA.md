# Setting Up Real Zerodha Portfolio Data

## Problem
The app was using **fake/mock data** (INFY, TCS, HDFCBANK) instead of fetching your actual Zerodha portfolio.

## Solution
I've updated the code to:
1. ✅ Pass `KITE_ACCESS_TOKEN` to the MCP remote server
2. ✅ Call `get_holdings` MCP tool to fetch real portfolio data
3. ✅ Analyze actual holdings with the LLM

## Steps to Get Real Portfolio Data

### 1. Start the Server
```powershell
npm start
```

### 2. Authenticate with Zerodha
You need a **fresh** access token (the old `request_token` from earlier expired after a few minutes).

**Option A: Use the UI (Recommended)**
1. Open http://localhost:15600 in your browser
2. Click the **🔐 Kite Login** button
3. Log in to your Zerodha account
4. You'll be redirected back with a new `request_token`
5. The app will automatically exchange it for an `access_token`

**Option B: Manual Token Generation**
```powershell
# 1. Get login URL
$loginUrl = "https://kite.zerodha.com/connect/login?api_key=v bv6mv8fppo3ry"
Start-Process $loginUrl

# 2. After login, copy the request_token from the redirect URL
# 3. Exchange for access token
$body = @{ request_token = 'YOUR_NEW_REQUEST_TOKEN_HERE' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:15600/api/kite/token' -Method POST -ContentType 'application/json' -Body $body
```

### 3. Verify Authentication
Check the server logs. You should see:
```
[Kite Auth] Exchanging request_token for access_token...
[Kite Auth] Success! Access token obtained.
```

Or test the health endpoint:
```powershell
Invoke-RestMethod -Uri 'http://localhost:15600/api/health'
```

Should show: `KITE_ACCESS_TOKEN: ✓ configured`

### 4. Test Portfolio Fetch
Once authenticated, click **"Analyze Portfolio"** in the UI. The app will now:

1. Call MCP `get_holdings` tool → Fetches real data from Zerodha
2. Pass holdings to LLM → AI analyzes your actual stocks
3. Generate charts → Based on your real portfolio allocation

## Available MCP Tools

To see what tools are available from the Zerodha MCP server:
```powershell
Invoke-RestMethod -Uri 'http://localhost:15600/api/mcp/tools'
```

Common tools:
- `get_holdings` - Fetch your stock holdings
- `get_positions` - Fetch open positions
- `place_order` - Place a new order
- `get_orders` - Get order history
- `get_quotes` - Get live market quotes

## Troubleshooting

### Error: "Token is invalid or has expired"
- Request tokens expire in ~5 minutes
- Generate a fresh one by clicking **🔐 Kite Login** again

### Error: "KITE_ACCESS_TOKEN: ✗ missing"
- You haven't authenticated yet
- Follow Step 2 above to get an access token

### Error: "MCP tool not found: get_holdings"
- The Zerodha MCP server might use a different tool name
- Check available tools: `GET /api/mcp/tools`
- Update `analyzePortfolio()` in `script.js` with the correct tool name

### Error: "Failed to fetch portfolio"
- Check server logs for details
- Verify access token is valid (tokens expire at 6 AM daily)
- Check internet connection to Zerodha servers

## Code Changes Made

### `mcpClient.js`
- Added `KITE_ACCESS_TOKEN` and `KITE_API_KEY` as environment variables when connecting to mcp-remote
- This ensures the MCP server has authentication to call Zerodha APIs

### `public/script.js`
- Changed `analyzePortfolio()` to call `/api/mcp` with `get_holdings` action
- Fetches real portfolio data before asking LLM to analyze
- LLM now receives actual holdings instead of fake data

### `server.js`
- Added `GET /api/mcp/tools` endpoint to list available MCP tools
- Existing `/api/mcp` endpoint now passes tools to the authenticated MCP client

## Next Steps

1. **Restart the server**: `npm start`
2. **Authenticate**: Click 🔐 Kite Login in the UI
3. **Test**: Click "Analyze Portfolio" to see real data
4. **Ask questions**: Try asking "What's my worst performing stock?" or "Show my sector allocation"

The app will now use your actual Zerodha portfolio data! 🎉
