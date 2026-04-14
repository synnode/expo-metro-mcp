# expo-metro-mcp Skill

Use this skill when working on a React Native / Expo project that has a running Metro dev server. It gives you real-time log access, stack trace resolution, and direct control over iOS simulators and Android emulators.

## Prerequisites

- Metro dev server running (`npx expo start`)
- App running on a simulator or emulator (for device tools)
- iOS tap/swipe: `brew install idb-companion && pip3 install fb-idb`
- Android tap/swipe: `adb` available (Android Studio / platform-tools)

## Tool reference

| Tool | When to use |
|---|---|
| `get_status` | Always check first — confirms Metro connection and buffer stats |
| `get_logs` | Fetch recent logs; filter by level or time window |
| `get_errors` | Fetch errors with stack traces from the buffer |
| `watch_logs` | Poll for live logs after triggering an action (max 30s) |
| `resolve_stack` | Resolve bundle offsets to original source file:line |
| `clear_logs` | Clear buffer after resolving an issue |
| `reload` | Reload the RN app via Metro |
| `connect` | Grab CDP connection if disconnected or taken by DevTools |
| `disconnect` | Release CDP so React Native DevTools can connect |
| `list_devices` | List active iOS simulators and Android emulators |
| `screenshot` | Capture current screen as image (coordinates are in logical points) |
| `tap` | Tap at x,y coordinates |
| `swipe` | Swipe between two coordinates (scroll, dismiss sheets, etc.) |

## Workflows

### Debugging a crash or error

1. `get_status` — confirm Metro is connected
2. `get_errors` — fetch errors with stack traces
3. `resolve_stack` — map bundle offsets to original source locations
4. Fix the issue in source
5. `reload` — reload the app
6. `watch_logs` with `duration: "10s"` — confirm no new errors appear
7. `clear_logs` — clean up the buffer

### Visual UI verification

1. `list_devices` — find available simulators/emulators
2. `screenshot` — capture the current screen
3. Identify the target element by its coordinates in the image
4. `tap` at those coordinates
5. `screenshot` again — verify the expected screen transition occurred
6. Repeat until the flow is complete

### Scrolling / dismissing

1. `screenshot` — identify scroll start and end points
2. `swipe` from bottom to top to scroll down, top to bottom to scroll up
3. `screenshot` — verify the result

**Note:** iOS swipe simulation is limited due to idb constraints. For reliable swipe gestures, prefer Android emulators.

### Navigating a full user flow

1. `screenshot` — assess the current screen
2. Determine the next action (tap a button, fill a field, scroll)
3. Execute `tap` or `swipe`
4. `screenshot` — verify the transition
5. `watch_logs` if the action triggers async work (API calls, navigation)
6. Repeat from step 1 until the flow is complete

## Platform notes

### iOS

- Screenshots are automatically downscaled from pixel resolution to logical points via `sips`
- Tap and swipe coordinates must be in **logical points** (matching the downscaled screenshot)
- Tap requires `idb` — the MCP auto-spawns `idb_companion` and kills it after inactivity
- If `idb` is unavailable, tap falls back to `xcrun simctl io sendtouchJSON` (Xcode 14.3+)
- Physical devices are not supported — simulators only

### Android

- Screenshots are captured via `adb screencap` at native resolution
- Tap and swipe use `adb shell input` — no extra tooling required
- Works on both emulators and (if adb-connected) physical devices

## Connection management

The MCP holds a CDP WebSocket connection to Metro. React Native DevTools uses the same connection — only one client can hold it at a time.

- If DevTools is open and the MCP shows disconnected: call `connect` to take over
- Before opening DevTools: call `disconnect` to release the connection
- The MCP reconnects automatically when Metro restarts or the device reconnects

## Tips

- Always `screenshot` before tapping — coordinates are only valid for the current screen state
- Use `watch_logs` with `level: "error"` after navigation actions to catch silent failures
- If a stack trace is unreadable (bundle offsets), always run `resolve_stack` before attempting a fix
- `clear_logs` between distinct test scenarios keeps the buffer clean and `get_errors` output relevant
- If multiple devices are running, pass `platform` or `device_id` explicitly to avoid ambiguity
