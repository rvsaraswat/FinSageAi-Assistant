# FinSageAi Assistant - AI Agent Instructions

## Project Overview
AI-powered Zerodha trading assistant that combines local Ollama LLMs with Kite Connect API and Model Context Protocol (MCP) for real-time portfolio analysis and trade execution.

**Architecture:** Express API bridge (port 15600) → Ollama (11434) + Kite API + optional MCP remote server

## Critical Components

### 1. Dual API Integration
- **Direct Kite API** ([kiteClient.js](../kiteClient.js)): Primary method for `get_holdings`, `get_positions`, `place_order`, `get_quotes`
- **MCP Remote** ([mcpClient.js](../mcpClient.js)): Fallback/alternative using JSON-RPC protocol via `https://mcp.kite.trade/mcp`
- **Switch controlled by:** `MCP_REMOTE` env var (`'1'` or `'true'` enables MCP mode)

### 2. Authentication Flow (Daily Token Refresh)
Kite access tokens expire **daily at 6 AM**. Follow this workflow:

1. Frontend triggers: `GET /api/kite/login` → receives login URL
2. User completes OAuth at `kite.zerodha.com`
3. Callback: `POST /api/kite/token` with `request_token`
4. Server generates checksum: `sha256(api_key + request_token + api_secret)`
5. Exchanges for `access_token`, stores in `process.env.KITE_ACCESS_TOKEN`
6. Calls `resetClient()` to invalidate cached connections

**See:** [KITE_AUTH_GUIDE.md](../KITE_AUTH_GUIDE.md) for complete auth protocol

### 3. LLM-Driven Trade Execution Protocol
The system uses **structured code blocks** for order extraction:

**Pattern:** LLM generates → Frontend parses → User confirms → API executes

```javascript
// LLM output format (detected in script.js)
```order
{
  "tradingsymbol": "ITCHOTELS",
  "exchange": "NSE",
  "transaction_type": "SELL",
  "quantity": 4,
  "order_type": "MARKET",
  "product": "CNC"
}
```
```

**Frontend parsing:** [script.js](../public/script.js#L75-L85) extracts ````order` blocks, calls `storePendingOrder()`, prompts "Type CONFIRM to execute"

**Backend execution:** `POST /api/mcp` with `action: "place_order"` → [server.js](../server.js#L212) routes to [kiteClient.js](../kiteClient.js#L103)

### 4. System Prompt Engineering
Default financial advisor persona in [server.js](../server.js#L47-L103):
- Introduces as "FinSageAi"
- Knows order execution protocol (generate ````order` blocks)
- Performs sector analysis, risk assessment, tax optimization
- Uses real portfolio data when available

**Custom prompts:** Override via `systemPrompt` parameter in `chatWithOllama()`

## Development Workflows

### Local Development
```powershell
# Setup
npm install
$env:KITE_API_KEY='your_key'
$env:KITE_API_SECRET='your_secret'
$env:OLLAMA_URL='http://localhost:11434'  # Optional, defaults to this

# Run
npm start  # Starts on port 15600

# Test connectivity
Invoke-RestMethod http://localhost:15600/api/health
```

### Docker Deployment
```bash
docker-compose up -d  # Reads .env, maps 15600, connects to host Ollama via host.docker.internal
```
**See:** [DOCKER_DEPLOYMENT.md](../DOCKER_DEPLOYMENT.md)

### Debugging Common Issues
- **"KITE_ACCESS_TOKEN is required"** → User needs to authenticate via `🔐 Kite Login` button
- **Ollama connection refused** → Ensure `ollama serve` running; check `OLLAMA_URL` env var
- **MCP tool not found** → Verify `MCP_REMOTE=1` and tool name matches `listMcpTools()` output
- **Order not executing** → Check if LLM generated proper ````order` block; verify user typed "CONFIRM"

## Project-Specific Patterns

### API Endpoint Structure
- **POST /api/llm**: Chat with Ollama (`{model, prompt}` → `{reply}`)
- **POST /api/mcp**: Call Kite/MCP actions (`{action, params}` → `{reply}`)
- **GET /api/health**: System status (Ollama + MCP connectivity)
- **GET /api/kite/login**: Generate OAuth URL
- **POST /api/kite/token**: Exchange `request_token` for `access_token`

### Ollama Streaming Handling
[server.js](../server.js#L118-L180) implements fallback: `/api/chat` → `/api/generate` (for older Ollama versions)

Accumulates NDJSON chunks:
```javascript
// Handles both message.content (chat) and response (generate)
if (json?.message?.content) finalText += json.message.content;
else if (typeof json?.response === 'string') finalText += json.response;
```

### Chart Rendering Protocol
Similar to order blocks, LLMs can generate charts:
```javascript
```chart
{
  "type": "bar",
  "data": { "labels": [...], "datasets": [...] },
  "options": { "responsive": true }
}
```
```

**Frontend:** [script.js](../public/script.js#L54-L62) extracts, creates canvas, renders via Chart.js

### ESM Module Convention
**`package.json`:** `"type": "module"` → All files use ES6 imports:
```javascript
import express from 'express';  // Not require()
import { fileURLToPath } from 'url';  // For __dirname equivalent
```

## Environment Variables
```env
KITE_API_KEY=your_api_key          # Required: Zerodha app credentials
KITE_API_SECRET=your_api_secret    # Required: For checksum generation
KITE_ACCESS_TOKEN=                 # Set dynamically via /api/kite/token
MCP_REMOTE=1                       # Optional: Enable MCP mode (vs direct Kite API)
KITE_MCP_URL=https://mcp.kite.trade/mcp  # Optional: MCP server endpoint
OLLAMA_URL=http://localhost:11434  # Optional: Override Ollama base URL
PORT=15600                         # Optional: Override Express port
```

## Key Files Reference
- [server.js](../server.js): API routes, Ollama bridge, authentication logic
- [kiteClient.js](../kiteClient.js): Direct Kite Connect API calls (holdings, positions, orders)
- [mcpClient.js](../mcpClient.js): MCP JSON-RPC client for remote tool invocation
- [public/script.js](../public/script.js): Frontend state management, markdown rendering, order confirmation flow
- [KITE_AUTH_GUIDE.md](../KITE_AUTH_GUIDE.md): Complete OAuth protocol documentation
- [SETUP_ZERODHA_DATA.md](../SETUP_ZERODHA_DATA.md): Troubleshooting real portfolio data access

## Testing Checklist
When modifying core functionality:
1. Verify `/api/health` returns green for Ollama + MCP
2. Test LLM chat with different models (llama3.1:8b, qwen2.5:14b)
3. Authenticate and fetch `get_holdings` (should return real portfolio)
4. Generate test order via LLM, verify ````order` block extraction
5. Check Docker build if deployment files changed

## Future Extension Points
- **Order validation:** Add pre-flight checks in [kiteClient.js](../kiteClient.js#L103) before placing orders
- **Chart types:** Extend [script.js](../public/script.js#L54) chart parser for pie/line charts
- **Token persistence:** Store `KITE_ACCESS_TOKEN` in database instead of `process.env` for multi-instance deployments
- **MCP tool discovery:** Auto-populate available MCP tools in UI via `/api/mcp/tools` endpoint
