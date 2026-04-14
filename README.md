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
| `connect` | Grab the CDP connection from Metro. Use after `disconnect` or when `get_status` shows disconnected |
| `disconnect` | Release the CDP connection so React Native DevTools can connect freely |
| `reload` | Reload the React Native app via Metro |
| `resolve_stack` | Resolve a stack trace against the Metro source map, showing original file/line instead of bundle offsets |
| `list_devices` | List active iOS simulators and Android emulators |
| `screenshot` | Take a screenshot of the active simulator/emulator. Returns the image directly. Optional: `platform`, `device_id` |
| `tap` | Tap at x,y coordinates on the active simulator/emulator. Optional: `platform`, `device_id` |
| `swipe` | Swipe from one coordinate to another (Android only). Optional: `duration_ms`, `platform`, `device_id` |

## Screenshot & UI automation

`screenshot`, `tap`, and `swipe` interact directly with your running simulator or emulator — no extra packages or paid plans needed.

**Requirements:**
- **iOS screenshots**: macOS with Xcode installed (`xcrun simctl` must be available)
- **iOS tap/swipe**: `idb` — Facebook's iOS Development Bridge
  ```bash
  brew install idb-companion
  pip3 install fb-idb
  ```
- **Android**: `adb` in your PATH (part of Android SDK platform-tools) — tap, swipe and screenshot all work out of the box

**Notes:**
- If multiple devices are running, use `list_devices` to find the ID and pass it via `device_id`
- Coordinates are in points (iOS logical pixels) or pixels (Android)
- iOS screenshots work without idb — only tap/swipe require it

## Using alongside React Native DevTools

CDP only allows one client at a time. The MCP server does **not** auto-reconnect, so you can freely switch between it and DevTools:

1. Use `disconnect` to release the connection before opening DevTools
2. Open React Native DevTools as usual
3. When done, close DevTools and call `connect` to reattach the MCP server

`get_status` always shows whether the MCP is currently connected.

## How it works

Metro exposes a CDP WebSocket at `/inspector/debug`. On `connect`, the server calls `/json/list` to discover the active device target, then attaches via CDP and enables `Runtime.consoleAPICalled` events. Metro build errors (`build_failed`, `bundling_error`) are captured separately via the `/events` WebSocket, which reconnects automatically.

## Notes

- If Metro is not reachable on startup: the server starts normally, `get_status` returns `connected: false`. Call `connect` once your dev server is up.
- Memory is bounded by `LOG_BUFFER_SIZE` (circular buffer, oldest entries dropped first).
- The CDP connection may show an "unsupported debugging client" notice in Metro's terminal — this is harmless.
