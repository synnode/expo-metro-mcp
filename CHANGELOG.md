# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- `EXPO_METRO_MCP_READ_ONLY=1` to disable MMKV/Zustand write helpers at the server layer
- `EXPO_METRO_MCP_MMKV_PREFIX_ALLOWLIST` to constrain MMKV/Zustand access to explicit key prefixes

### Changed
- `evaluate` is now registered only when `EXPO_METRO_MCP_ENABLE_EVAL=1` is set
- `mmkv_keys` now filters results through the MMKV prefix allowlist when configured

## [1.0.6] - 2026-04-24

### Added
- `mmkv_get_json`, `mmkv_set_json`, and `mmkv_merge_json` helpers for JSON-valued MMKV entries
- `zustand_persist_get`, `zustand_persist_set`, and `zustand_persist_merge` helpers for seeding and patching persisted Zustand state in the usual `{ state, version? }` shape

## [1.0.5] - 2026-04-24

### Added
- `mmkv_get`, `mmkv_set`, `mmkv_remove`, and `mmkv_keys` tools for apps that expose a dev-only MMKV debug hook at `globalThis.__EXPO_METRO_MCP__.mmkv`

## [1.0.4] - 2026-04-24

### Added
- `evaluate` — run JavaScript directly inside the connected React Native runtime via Metro CDP `Runtime.evaluate`, with async support and formatted return values/errors

## [1.0.3] - 2026-04-15

### Added
- `input_text` — type text into the focused input field without requiring the on-screen keyboard (Android: `adb shell input text`, iOS: `idb ui text`)
- `input_key` — send special key presses: enter, backspace, delete, tab, escape, home, end, back, space, arrow keys (Android: `adb shell input keyevent`, iOS: `idb ui key` with HID codes)

## [1.0.2] - 2026-04-15

### Fixed
- `screenshot` now returns image dimensions (`width x height` in px) alongside the image. The MCP includes a text note with the exact pixel size so callers never need to guess or manually calculate a scale factor for `tap`/`swipe` coordinates

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
