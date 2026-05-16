import fetch from 'node-fetch';

// Reset client connection (useful when access token changes)
export function resetClient() {
  // No-op for HTTP-based implementation, kept for API compatibility
}

// For remote MCP servers, use direct HTTP calls instead of SDK
async function callRemoteMCP(url, method, params) {
  const accessToken = process.env.KITE_ACCESS_TOKEN;
  const apiKey = process.env.KITE_API_KEY;
  
  if (!accessToken) {
    throw new Error('KITE_ACCESS_TOKEN is required but not set. Please authenticate first.');
  }

  console.log(`[MCP] Calling ${method} at ${url}`);
  console.log(`[MCP] Using API Key: ${apiKey?.substring(0, 8)}...`);
  console.log(`[MCP] Access Token: ${accessToken?.substring(0, 10)}...`);
  
  const requestBody = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: method,
    params: {
      ...params,
      // Try passing credentials at top level of params
      api_key: apiKey,
      access_token: accessToken
    }
  };

  console.log(`[MCP] Request:`, JSON.stringify(requestBody).substring(0, 300));
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Kite-Version': '3',
      // Also try Authorization header format
      'Authorization': `token ${apiKey}:${accessToken}`
    },
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  console.log(`[MCP] Response Status: ${response.status}`);
  console.log(`[MCP] Response Body:`, responseText.substring(0, 500));

  if (!response.ok) {
    throw new Error(`MCP remote error: ${response.status} ${response.statusText} - ${responseText}`);
  }

  const data = JSON.parse(responseText);
  
  if (data.error) {
    throw new Error(`MCP error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result;
}

export async function listMcpTools() {
  try {
    // For remote MCP, use direct HTTP call
    const url = process.env.KITE_MCP_URL || 'https://mcp.kite.trade/mcp';
    const result = await callRemoteMCP(url, 'tools/list', {});
    return result.tools || [];
  } catch (err) {
    throw new Error(`Failed to list MCP tools: ${err.message}`);
  }
}

export async function callMcpTool(toolName, toolArgs = {}) {
  try {
    // For remote MCP, use direct HTTP call
    const url = process.env.KITE_MCP_URL || 'https://mcp.kite.trade/mcp';
    const result = await callRemoteMCP(url, 'tools/call', {
      name: toolName,
      arguments: toolArgs
    });
    return result;
  } catch (err) {
    throw new Error(`Failed to call MCP tool '${toolName}': ${err.message}`);
  }
}
