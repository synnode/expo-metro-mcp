# @synnode/expo-metro-mcp

MCP server that connects to a running Expo/Metro dev server and exposes its logs to Claude Code.

Uses the **Chrome DevTools Protocol (CDP)** inspector endpoint that Metro exposes — the same channel that React Native DevTools uses. Works with Expo SDK 50+ including the new architecture (Bridgeless/JSI).

## Installation

```bash
# Register with Claude Code CLI
claude mcp add expo-metro npx @synnode/expo-metro-mcp
```

Or install globally and register:

```bash
npm install -g @synnode/expo-metro-mcp
claude mcp add expo-metro expo-metro-mcp
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
claude mcp add expo-metro --env METRO_PORT=8082 npx @synnode/expo-metro-mcp
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
| `screenshot` | Take a screenshot of the active simulator/emulator. Returns the image + pixel dimensions. Optional: `platform`, `device_id` |
| `tap` | Tap at x,y coordinates on the active simulator/emulator. Optional: `platform`, `device_id` |
| `swipe` | Swipe from one coordinate to another. Optional: `duration_ms`, `platform`, `device_id` |
| `input_text` | Type text into the focused input field — works without the on-screen keyboard. Optional: `platform`, `device_id` |
| `input_key` | Send a special key press: `enter`, `backspace`, `delete`, `tab`, `escape`, `back`, `space`, arrow keys. Optional: `platform`, `device_id` |

## Screenshot & UI automation

`screenshot`, `tap`, `swipe`, `input_text`, and `input_key` interact directly with your running simulator or emulator — no extra packages or paid plans needed.

**Requirements:**
- **iOS screenshots**: macOS with Xcode installed (`xcrun simctl` must be available)
- **iOS tap/swipe/input**: `idb` — Facebook's iOS Development Bridge
  ```bash
  brew tap facebook/fb && brew install idb-companion
  pip3 install fb-idb
  ```
- **Android**: `adb` in your PATH (part of Android SDK platform-tools) — all tools work out of the box

**Notes:**
- `screenshot` returns the image alongside its pixel dimensions — use those coordinates directly for `tap`/`swipe`, no manual scaling needed
- `input_text` types into the focused field without requiring the on-screen keyboard to appear
- To fill a form: `tap` the field → `input_text` the value → `input_key "enter"` to submit
- If multiple devices are running, use `list_devices` to find the ID and pass it via `device_id`
- iOS screenshots work without idb — only tap/swipe/input require it

## Using alongside React Native DevTools

CDP only allows one client at a time. Switching between the MCP and DevTools is seamless — whichever connects last takes over, and the other is kicked out automatically.

- **To use DevTools**: just open or reconnect it. The MCP will be disconnected automatically.
- **To return to MCP**: call `connect`. DevTools will lose its connection.

`disconnect` is available if you want to explicitly release the connection first, but it's not required.

`get_status` always shows whether the MCP is currently connected.

## How it works

Metro exposes a CDP WebSocket at `/inspector/debug`. On `connect`, the server calls `/json/list` to discover the active device target, then attaches via CDP and enables `Runtime.consoleAPICalled` events. Metro build errors (`build_failed`, `bundling_error`) are captured separately via the `/events` WebSocket, which reconnects automatically.

## Teaching Claude Code about this MCP

Add [`SKILL.md`](./SKILL.md) to your project root (or `CLAUDE.md`) to teach Claude Code how to use this MCP effectively — when to check logs, how to debug errors, how to use screenshots and taps, and more.

```bash
curl -o SKILL.md https://raw.githubusercontent.com/Synnode/expo-metro-mcp/master/SKILL.md
```

## Notes

- If Metro is not reachable on startup: the server starts normally, `get_status` returns `connected: false`. Call `connect` once your dev server is up.
- Memory is bounded by `LOG_BUFFER_SIZE` (circular buffer, oldest entries dropped first).
- The CDP connection may show an "unsupported debugging client" notice in Metro's terminal — this is harmless.
