import { z } from "zod";
import { execSync } from "child_process";
import { listAllDevices, pickDevice } from "./devices.js";

export const TapSchema = z.object({
  x: z.number().int().describe("X coordinate in points/pixels"),
  y: z.number().int().describe("Y coordinate in points/pixels"),
  device_id: z.string().optional(),
  platform: z.enum(["ios", "android"]).optional(),
});

export const SwipeSchema = z.object({
  x1: z.number().int(),
  y1: z.number().int(),
  x2: z.number().int(),
  y2: z.number().int(),
  duration_ms: z.number().int().min(50).max(5000).optional().default(300),
  device_id: z.string().optional(),
  platform: z.enum(["ios", "android"]).optional(),
});

function tapIOS(deviceId: string, x: number, y: number): void {
  execSync(`xcrun simctl io "${deviceId}" sendtouchtype touch --point "${x},${y}"`, {
    timeout: 5_000,
    stdio: ["ignore", "ignore", "pipe"],
  });
}

function tapAndroid(deviceId: string, x: number, y: number): void {
  execSync(`adb -s "${deviceId}" shell input tap ${x} ${y}`, {
    timeout: 5_000,
    stdio: ["ignore", "ignore", "pipe"],
  });
}

function swipeIOS(_deviceId: string, _x1: number, _y1: number, _x2: number, _y2: number, _durationMs: number): void {
  // xcrun simctl does not support swipe gestures natively.
  // Throw so the caller can return a clear message.
  throw new Error("iOS simulator does not support swipe via simctl. Use an Android emulator for swipe gestures, or trigger the scroll programmatically in your app.");
}

function swipeAndroid(deviceId: string, x1: number, y1: number, x2: number, y2: number, durationMs: number): void {
  execSync(`adb -s "${deviceId}" shell input swipe ${x1} ${y1} ${x2} ${y2} ${durationMs}`, {
    timeout: 10_000,
    stdio: ["ignore", "ignore", "pipe"],
  });
}

export function tap(params: z.infer<typeof TapSchema>): string {
  const devices = listAllDevices();
  if (!devices.length) {
    return "No active simulators or emulators found.";
  }

  const device = pickDevice(params.platform, params.device_id);
  if (!device) {
    return `No matching device found. Available: ${devices.map((d) => `${d.name} (${d.platform})`).join(", ")}`;
  }

  try {
    if (device.platform === "ios") {
      tapIOS(device.id, params.x, params.y);
    } else {
      tapAndroid(device.id, params.x, params.y);
    }
    return `Tapped (${params.x}, ${params.y}) on ${device.name} [${device.platform}].`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Tap failed: ${msg}`;
  }
}

export function swipe(params: z.infer<typeof SwipeSchema>): string {
  const devices = listAllDevices();
  if (!devices.length) {
    return "No active simulators or emulators found.";
  }

  const device = pickDevice(params.platform, params.device_id);
  if (!device) {
    return `No matching device found. Available: ${devices.map((d) => `${d.name} (${d.platform})`).join(", ")}`;
  }

  try {
    if (device.platform === "ios") {
      swipeIOS(device.id, params.x1, params.y1, params.x2, params.y2, params.duration_ms);
      return `Swiped from (${params.x1}, ${params.y1}) to (${params.x2}, ${params.y2}) on ${device.name} [ios]. Note: iOS swipe simulation is limited — use Android for reliable swipe gestures.`;
    } else {
      swipeAndroid(device.id, params.x1, params.y1, params.x2, params.y2, params.duration_ms);
      return `Swiped from (${params.x1}, ${params.y1}) to (${params.x2}, ${params.y2}) on ${device.name} [android] over ${params.duration_ms}ms.`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Swipe failed: ${msg}`;
  }
}
