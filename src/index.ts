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
import { ScreenshotSchema, screenshot } from "./tools/screenshot.js";
import { TapSchema, SwipeSchema, tap, swipe } from "./tools/tap.js";
import { InputTextSchema, InputKeySchema, inputText, inputKey } from "./tools/input.js";
import { listDevices } from "./tools/list-devices.js";

const server = new McpServer({
  name: "expo-metro-mcp",
  version: "1.0.3",
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

server.registerTool(
  "list_devices",
  {
    description: "List active iOS simulators and Android emulators. Use this to find available devices before taking screenshots or sending taps.",
  },
  async () => {
    const result = listDevices();
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "screenshot",
  {
    description: "Take a screenshot of the active iOS simulator or Android emulator. Returns the image directly. Optionally specify platform ('ios' or 'android') or device_id if multiple devices are running.",
    inputSchema: ScreenshotSchema.shape,
  },
  async (params) => {
    const result = screenshot(params as Parameters<typeof screenshot>[0]);
    if (result.type === "image") {
      const dimNote = result.width && result.height
        ? `Screenshot dimensions: ${result.width}x${result.height}px. Use these exact coordinates for tap and swipe — no scaling needed.`
        : "Screenshot dimensions unknown.";
      return {
        content: [
          { type: "image", data: result.data, mimeType: result.mimeType },
          { type: "text", text: dimNote },
        ],
      };
    }
    return { content: [{ type: "text", text: result.text }] };
  }
);

server.registerTool(
  "tap",
  {
    description: "Tap at x,y coordinates on the active simulator/emulator. Use screenshot first to determine coordinates. iOS requires idb (brew install idb-companion && pip3 install fb-idb). Android works via adb out of the box. Optionally specify platform or device_id.",
    inputSchema: TapSchema.shape,
  },
  async (params) => {
    const result = tap(params as Parameters<typeof tap>[0]);
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "swipe",
  {
    description: "Swipe from one coordinate to another. Requires idb on iOS (brew install idb-companion && pip3 install fb-idb). Android works via adb out of the box. Useful for scrolling lists or dismissing sheets.",
    inputSchema: SwipeSchema.shape,
  },
  async (params) => {
    const result = swipe(params as Parameters<typeof swipe>[0]);
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "input_text",
  {
    description: "Type text into the currently focused input field on the active simulator/emulator. Use tap to focus an input first, then call this tool. Works without requiring the on-screen keyboard to be visible. iOS requires idb (brew install idb-companion && pip3 install fb-idb). Android works via adb out of the box.",
    inputSchema: InputTextSchema.shape,
  },
  async (params) => {
    const result = inputText(params as Parameters<typeof inputText>[0]);
    return { content: [{ type: "text", text: result }] };
  }
);

server.registerTool(
  "input_key",
  {
    description: "Send a special key press to the active simulator/emulator. Supported keys: enter, backspace, delete, tab, escape, home, end, back, space, up, down, left, right. Use after input_text to submit forms (enter) or correct mistakes (backspace).",
    inputSchema: InputKeySchema.shape,
  },
  async (params) => {
    const result = inputKey(params as Parameters<typeof inputKey>[0]);
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
