import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

// Reset client connection (useful when access token changes)
export function resetClient() {
  // No-op for HTTP-based implementation, kept for API compatibility
}

// For remote MCP servers, use direct HTTP calls instead of SDK
async function callRemoteMCP(url, method, params, creds = {}) {
  const accessToken = creds.accessToken || process.env.KITE_ACCESS_TOKEN;
  const apiKey      = creds.apiKey      || process.env.KITE_API_KEY;

  if (!accessToken) {
    throw new Error('KITE_ACCESS_TOKEN is required. Please authenticate first.');
  }

  console.log(`[MCP] Calling ${method}`);

  const requestBody = {
    jsonrpc: '2.0',
    id: randomUUID(),
    method,
    params: { ...params, api_key: apiKey, access_token: accessToken },
  };

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const responseText = await response.text();
    console.log(`[MCP] Response status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`MCP remote error: ${response.status} ${response.statusText}`);
    }

    const data = JSON.parse(responseText);
    if (data.error) {
      throw new Error(`MCP error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    return data.result;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('MCP request timed out (30s)');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function listMcpTools(creds = {}) {
  try {
    const url = process.env.KITE_MCP_URL || 'https://mcp.kite.trade/mcp';
    const result = await callRemoteMCP(url, 'tools/list', {}, creds);
    return result.tools || [];
  } catch (err) {
    throw new Error(`Failed to list MCP tools: ${err.message}`);
  }
}

export async function callMcpTool(toolName, toolArgs = {}, creds = {}) {
  try {
    const url = process.env.KITE_MCP_URL || 'https://mcp.kite.trade/mcp';
    const result = await callRemoteMCP(url, 'tools/call', { name: toolName, arguments: toolArgs }, creds);
    return result;
  } catch (err) {
    throw new Error(`Failed to call MCP tool '${toolName}': ${err.message}`);
  }
}
