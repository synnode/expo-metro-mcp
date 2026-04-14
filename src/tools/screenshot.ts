import { z } from "zod";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { listAllDevices, pickDevice } from "./devices.js";

export const ScreenshotSchema = z.object({
  device_id: z.string().optional(),
  platform: z.enum(["ios", "android"]).optional(),
});

function captureIOS(deviceId: string, outputPath: string): void {
  execSync(`xcrun simctl io "${deviceId}" screenshot "${outputPath}"`, {
    timeout: 10_000,
    stdio: ["ignore", "ignore", "pipe"],
  });
}

function captureAndroid(deviceId: string, outputPath: string): void {
  const tmpDevice = `/sdcard/mcp_screenshot_${Date.now()}.png`;
  execSync(`adb -s "${deviceId}" shell screencap -p "${tmpDevice}"`, {
    timeout: 10_000,
    stdio: ["ignore", "ignore", "pipe"],
  });
  execSync(`adb -s "${deviceId}" pull "${tmpDevice}" "${outputPath}"`, {
    timeout: 10_000,
    stdio: ["ignore", "ignore", "pipe"],
  });
  execSync(`adb -s "${deviceId}" shell rm "${tmpDevice}"`, {
    timeout: 5_000,
    stdio: "ignore",
  });
}

export function screenshot(params: z.infer<typeof ScreenshotSchema>): {
  type: "image";
  data: string;
  mimeType: string;
} | { type: "text"; text: string } {
  const devices = listAllDevices();
  if (!devices.length) {
    return {
      type: "text",
      text: "No active simulators or emulators found. Start a simulator (iOS) or emulator (Android) first.",
    };
  }

  const device = pickDevice(params.platform, params.device_id);
  if (!device) {
    return {
      type: "text",
      text: `No matching device found. Available: ${devices.map((d) => `${d.name} (${d.platform})`).join(", ")}`,
    };
  }

  const outputPath = path.join(os.tmpdir(), `expo-mcp-screenshot-${Date.now()}.png`);

  try {
    if (device.platform === "ios") {
      captureIOS(device.id, outputPath);
    } else {
      captureAndroid(device.id, outputPath);
    }

    const imageData = fs.readFileSync(outputPath).toString("base64");
    fs.unlinkSync(outputPath);

    return {
      type: "image",
      data: imageData,
      mimeType: "image/png",
    };
  } catch (err) {
    try { fs.unlinkSync(outputPath); } catch {}
    const msg = err instanceof Error ? err.message : String(err);
    return { type: "text", text: `Screenshot failed: ${msg}` };
  }
}
