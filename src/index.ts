#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { metroClient } from "./metro-client.js";
import { GetLogsSchema, getLogs } from "./tools/get-logs.js";
import { GetErrorsSchema, getErrors } from "./tools/get-errors.js";
import { getStatus } from "./tools/get-status.js";
import { clearLogs } from "./tools/clear-logs.js";
import { WatchLogsSchema, watchLogs } from "./tools/watch-logs.js";

const server = new McpServer({
  name: "expo-metro-mcp",
  version: "0.1.0",
});

server.tool(
  "get_logs",
  "Fetch recent logs from the Metro dev server buffer. Supports filtering by level and time.",
  GetLogsSchema.shape,
  async (params) => {
    const result = getLogs(params as Parameters<typeof getLogs>[0]);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "get_errors",
  "Fetch recent errors from the Metro dev server buffer, with stack traces merged into readable blocks.",
  GetErrorsSchema.shape,
  async (params) => {
    const result = getErrors(params as Parameters<typeof getErrors>[0]);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "get_status",
  "Check the connection status of the Metro dev server and buffer statistics.",
  {},
  async () => {
    const result = getStatus();
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "clear_logs",
  "Clear the internal log buffer. Useful after resolving an issue.",
  {},
  async () => {
    const result = clearLogs();
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "watch_logs",
  "Listen for incoming logs for a short time window and return all collected entries.",
  WatchLogsSchema.shape,
  async (params) => {
    const result = await watchLogs(params as Parameters<typeof watchLogs>[0]);
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
