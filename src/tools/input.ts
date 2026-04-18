import { z } from "zod";
import { execSync } from "child_process";
import { listAllDevices, pickDevice } from "./devices.js";
import { ensureIdbCompanion, isIdbAvailable } from "./idb.js";

export const InputTextSchema = z.object({
  text: z.string().describe("Text to type into the focused input field"),
  device_id: z.string().optional(),
  platform: z.enum(["ios", "android"]).optional(),
});

export const InputKeySchema = z.object({
  key: z
    .enum([
      "enter",
      "backspace",
      "delete",
      "tab",
      "escape",
      "home",
      "end",
      "back",
      "space",
      "up",
      "down",
      "left",
      "right",
    ])
    .describe("Key to press"),
  device_id: z.string().optional(),
  platform: z.enum(["ios", "android"]).optional(),
});

// Android keyevent codes
// https://developer.android.com/reference/android/view/KeyEvent
const ANDROID_KEYCODES: Record<string, number> = {
  enter: 66,
  backspace: 67,
  delete: 67,
  tab: 61,
  escape: 111,
  home: 3,
  end: 123,
  back: 4,
  space: 62,
  up: 19,
  down: 20,
  left: 21,
  right: 22,
};

// idb uses HID usage codes for key events
// https://developer.apple.com/documentation/hiddriverkit/iohidusagetables
const IDB_HID_KEYCODES: Record<string, number> = {
  enter: 40,
  backspace: 42,
  delete: 76,
  tab: 43,
  escape: 41,
  home: 74,
  end: 77,
  back: 41, // no native "back" on iOS, map to escape
  space: 44,
  up: 82,
  down: 81,
  left: 80,
  right: 79,
};

function inputTextIOS(deviceId: string, text: string): void {
  if (isIdbAvailable()) {
    ensureIdbCompanion(deviceId);
    // Escape single quotes in text for shell safety
    const escaped = text.replace(/'/g, `'"'"'`);
    execSync(`idb ui text '${escaped}' --udid "${deviceId}"`, {
      timeout: 10_000,
      stdio: ["ignore", "ignore", "pipe"],
    });
    return;
  }
  throw new Error(
    `iOS text input requires idb.\n` +
    `Install via: brew install idb-companion && pip3 install fb-idb`
  );
}

function inputTextAndroid(deviceId: string, text: string): void {
  // adb shell input text is best-effort only. It handles simple text reliably,
  // but symbols, unicode, and newlines are inconsistent across Android versions.
  if (/\n|\r/.test(text)) {
    throw new Error("Android text input does not support newlines reliably. Send text line-by-line and use input_key 'enter' between lines.");
  }

  const escaped = text
    .replace(/%/g, "%25")
    .replace(/ /g, "%s")
    .replace(/[&<>|;$`()\[\]{}*!?#~]/g, (char) => `\\${char}`)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');

  execSync(`adb -s "${deviceId}" shell input text "${escaped}"`, {
    timeout: 10_000,
    stdio: ["ignore", "ignore", "pipe"],
  });
}

function inputKeyIOS(deviceId: string, key: string): void {
  if (isIdbAvailable()) {
    ensureIdbCompanion(deviceId);
    const code = IDB_HID_KEYCODES[key];
    if (code === undefined) throw new Error(`Unknown key: ${key}`);
    execSync(`idb ui key ${code} --udid "${deviceId}"`, {
      timeout: 5_000,
      stdio: ["ignore", "ignore", "pipe"],
    });
    return;
  }
  throw new Error(
    `iOS key input requires idb.\n` +
    `Install via: brew install idb-companion && pip3 install fb-idb`
  );
}

function inputKeyAndroid(deviceId: string, key: string): void {
  const code = ANDROID_KEYCODES[key];
  if (code === undefined) throw new Error(`Unknown key: ${key}`);
  execSync(`adb -s "${deviceId}" shell input keyevent ${code}`, {
    timeout: 5_000,
    stdio: ["ignore", "ignore", "pipe"],
  });
}

export function inputText(params: z.infer<typeof InputTextSchema>): string {
  const devices = listAllDevices();
  if (!devices.length) return "No active simulators or emulators found.";

  const device = pickDevice(params.platform, params.device_id);
  if (!device) {
    return `No matching device found. Available: ${devices.map((d) => `${d.name} (${d.platform})`).join(", ")}`;
  }

  try {
    if (device.platform === "ios") {
      inputTextIOS(device.id, params.text);
    } else {
      inputTextAndroid(device.id, params.text);
    }
    return `Typed "${params.text}" on ${device.name} [${device.platform}].`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `input_text failed: ${msg}`;
  }
}

export function inputKey(params: z.infer<typeof InputKeySchema>): string {
  const devices = listAllDevices();
  if (!devices.length) return "No active simulators or emulators found.";

  const device = pickDevice(params.platform, params.device_id);
  if (!device) {
    return `No matching device found. Available: ${devices.map((d) => `${d.name} (${d.platform})`).join(", ")}`;
  }

  try {
    if (device.platform === "ios") {
      inputKeyIOS(device.id, params.key);
    } else {
      inputKeyAndroid(device.id, params.key);
    }
    return `Key "${params.key}" sent to ${device.name} [${device.platform}].`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `input_key failed: ${msg}`;
  }
}
