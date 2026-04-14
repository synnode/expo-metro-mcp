# expo-metro-mcp — Claude Code Skill

You have access to the `expo-metro` MCP server, which connects to a running Expo/React Native dev server. Use it proactively during development — don't wait to be asked.

## Connection

Always check `get_status` first. If `connected: false`, call `connect` before fetching logs.

Metro must be running (`npx expo start`) with a device or emulator attached for logs to appear.

## When to use which tool

**Debugging errors**
1. `get_errors` — get recent errors with stack traces
2. `resolve_stack` — map bundle offsets to original source files
3. Fix the issue, then `reload` to verify

**Checking behavior / logs**
- `get_logs` — recent log output, filterable by level and time
- `watch_logs` — use after triggering an action to catch what fires (e.g. after a tap)
- `clear_logs` — clear the buffer before a focused test run

**UI verification**
1. `list_devices` — see what's running
2. `screenshot` — capture the current screen; inspect visually before tapping
3. `tap` — interact with the UI using coordinates from the screenshot
4. `swipe` — scroll lists or dismiss sheets
5. `screenshot` again — verify the result

**Switching to React Native DevTools**
Just open DevTools — the MCP connection drops automatically. Call `connect` to reattach.

## Coordinate system

- **iOS**: logical points (screenshot is pre-scaled to match)
- **Android**: pixels

Coordinates from a screenshot map 1:1 to `tap` — no manual scaling needed.

## iOS tap/swipe requirements

Requires `idb`:
```bash
brew tap facebook/fb && brew install idb-companion
pip3 install fb-idb
```

`idb_companion` starts automatically on first tap/swipe. Android works out of the box via `adb`.

## Tips

- After `reload`, wait ~1-2s before `get_logs` — Metro needs a moment to rebundle
- `watch_logs` is better than polling `get_logs` when waiting for an async event
- `resolve_stack` only works while Metro is running (it fetches the live source map)
- If `connect` keeps failing, check that a device is attached: `list_devices`
