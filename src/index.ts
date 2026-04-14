#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { metroClient } from "./metro-client.js";
import { GetLogsSchema, getLogs } from "./tools/get-logs.js";
import { GetErrorsSchema, getErrors } from "./tools/get-errors.js";
import { getStatus } from "./tools/get-status.js";
import { clearLogs } from "./tools/clear-logs.js";
import { WatchLogsSchema, watchLogs } from "./tools/watch-logs.js";
import { reload } from "./tools/reload.js";
import { ResolveStackSchema, resolveStack, invalidateSourceMapCache } from "./tools/resolve-stack.js";

const server = new McpServer({
  name: "expo-metro-mcp",
  version: "0.1.0",
});

server.registerTool(
  "get_logs",
  {
    description: "Fetch recent logs from the Metro dev server buffer. Supports filtering by level and time.",
    inputSchema: GetLogsSchema.shape,
  },
  async (params) => {
    const result = getLogs(params as Parameters<typeof getLogs>[0]);
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "get_errors",
  {
    description: "Fetch recent errors from the Metro dev server buffer, with stack traces.",
    inputSchema: GetErrorsSchema.shape,
  },
  async (params) => {
    const result = getErrors(params as Parameters<typeof getErrors>[0]);
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "get_status",
  {
    description: "Check the connection status of the Metro dev server and buffer statistics.",
  },
  async () => {
    const result = getStatus();
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "connect",
  {
    description: "Grab the CDP connection to the Metro dev server. Use this if get_status shows disconnected, or to take over the connection from React Native DevTools.",
  },
  async () => {
    const result = await metroClient.grabConnection();
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "disconnect",
  {
    description: "Release the CDP connection so React Native DevTools can connect. Use this before switching to DevTools. Call connect when you want to reattach.",
  },
  async () => {
    metroClient.disconnect();
    return { content: [{ type: "text", text: "Disconnected. DevTools can now connect freely." }] };
  }
);

server.registerTool(
  "clear_logs",
  {
    description: "Clear the internal log buffer. Useful after resolving an issue.",
  },
  async () => {
    const result = clearLogs();
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "watch_logs",
  {
    description: "Listen for incoming logs for a short time window and return all collected entries.",
    inputSchema: WatchLogsSchema.shape,
  },
  async (params) => {
    const result = await watchLogs(params as Parameters<typeof watchLogs>[0]);
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "reload",
  {
    description: "Reload the React Native app via Metro.",
  },
  async () => {
    invalidateSourceMapCache();
    const result = await reload();
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "resolve_stack",
  {
    description: "Resolve a stack trace from the buffer against the Metro source map, showing original file:line instead of bundle offsets. Optionally filter by error message substring.",
    inputSchema: ResolveStackSchema.shape,
  },
  async (params) => {
    const result = await resolveStack(params as Parameters<typeof resolveStack>[0]);
    return { content: [{ type: "text", text: result }] };
  }
);

async function main() {
  metroClient.start();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", () => {
    metroClient.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    metroClient.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
