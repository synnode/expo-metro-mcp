# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-04-14

### Changed
- Minify dist output (32KB → 19KB)

## [1.0.0] - 2026-04-14

### Added
- `get_logs` — fetch recent logs from the Metro buffer with optional level and time filters
- `get_errors` — fetch recent errors with stack traces
- `get_status` — connection status, device name, and buffer statistics
- `connect` — grab the CDP connection from Metro
- `disconnect` — release the CDP connection so React Native DevTools can connect freely
- `clear_logs` — clear the log buffer
- `watch_logs` — poll for incoming logs for a time window
- `reload` — reload the React Native app via Metro
- `resolve_stack` — resolve stack traces against the Metro source map, showing original file/line instead of bundle offsets
- `list_devices` — list active iOS simulators and Android emulators
- `screenshot` — capture a screenshot from the active simulator/emulator. iOS screenshots are automatically downscaled to logical point resolution to match tap coordinates
- `tap` — tap at x,y coordinates on iOS simulator (via idb) or Android emulator (via adb)
- `swipe` — swipe gesture on iOS simulator (via idb) or Android emulator (via adb)

### Notes
- iOS tap/swipe requires `idb`: `brew tap facebook/fb && brew install idb-companion && pip3 install fb-idb`
- `idb_companion` is spawned automatically on first tap/swipe
- Android automation works out of the box via `adb`
