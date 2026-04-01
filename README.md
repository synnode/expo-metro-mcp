# @synnode/expo-metro-mcp

MCP server that connects to a running Expo/Metro dev server and exposes its logs to Claude Code.

Uses the **Chrome DevTools Protocol (CDP)** inspector endpoint that Metro exposes — the same channel that React Native DevTools uses. Works with Expo SDK 50+ including the new architecture (Bridgeless/JSI).

## Installation

```bash
cd expo-metro-mcp
npm install && npm run build

# Register with Claude Code CLI
claude mcp add expo-metro node /absolute/path/to/expo-metro-mcp/dist/index.js
```

Restart Claude Code after adding the server.

## Requirements

- Expo / Metro dev server running (`npx expo start`)
- A device or emulator connected to Metro (the app must be running for logs to appear)

## Configuration

```bash
# Defaults — only override if needed
METRO_PORT=8081
METRO_HOST=localhost
LOG_BUFFER_SIZE=1000
```

If Metro runs on a different port:

```bash
claude mcp add expo-metro --env METRO_PORT=8082 node /path/to/dist/index.js
```

## Available tools

| Tool | Description |
|---|---|
| `get_logs` | Recent logs from the buffer. Optional: `lines`, `level` (`error`/`warn`/`info`/`log`/`debug`), `since` (e.g. `"30s"`, `"2m"`, unix timestamp) |
| `get_errors` | Errors with stack traces from the buffer. Optional: `lines` |
| `get_status` | Connection status, device name, and buffer statistics |
| `clear_logs` | Clear the log buffer |
| `watch_logs` | Poll for incoming logs for a time window. Optional: `duration` (e.g. `"10s"`, max `"30s"`), `level` |

## How it works

Metro exposes a CDP WebSocket at `/inspector/debug`. The server polls `/json/list` every 2s to discover connected devices, then connects via CDP and enables `Runtime.consoleAPICalled` events. Metro build errors (`build_failed`, `bundling_error`) are captured separately via the `/events` WebSocket.

The server reconnects automatically when:
- Metro restarts
- The device/emulator disconnects and reconnects
- A new device connects

## Notes

- If Metro is not reachable on startup: the server starts normally, `get_status` returns `connected: false`.
- Memory is bounded by `LOG_BUFFER_SIZE` (circular buffer, oldest entries dropped first).
- The CDP connection may show a "unsupported debugging client" notice in Metro's terminal — this is harmless.
