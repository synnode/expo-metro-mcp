import { execSync } from "child_process";

export type Platform = "ios" | "android";

export interface Device {
  id: string;
  name: string;
  platform: Platform;
}

function runCommand(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { timeout: 2000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function listIOSDevices(): Device[] {
  if (!isCommandAvailable("xcrun")) return [];

  const output = runCommand("xcrun simctl list devices booted --json");
  if (!output) return [];

  try {
    const json = JSON.parse(output) as {
      devices: Record<string, Array<{ udid: string; name: string; state: string }>>;
    };

    const devices: Device[] = [];
    for (const [, sims] of Object.entries(json.devices)) {
      for (const sim of sims) {
        if (sim.state === "Booted") {
          devices.push({ id: sim.udid, name: sim.name, platform: "ios" });
        }
      }
    }
    return devices;
  } catch {
    return [];
  }
}

export function listAndroidDevices(): Device[] {
  if (!isCommandAvailable("adb")) return [];

  const output = runCommand("adb devices -l");
  if (!output) return [];

  const devices: Device[] = [];
  const lines = output.split("\n").slice(1); // skip "List of devices attached"

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2 || parts[1] !== "device") continue;

    const id = parts[0];
    // Extract model from the line if available
    const modelMatch = line.match(/model:(\S+)/);
    const name = modelMatch ? modelMatch[1].replace(/_/g, " ") : id;

    devices.push({ id, name, platform: "android" });
  }
  return devices;
}

export function listAllDevices(): Device[] {
  return [...listIOSDevices(), ...listAndroidDevices()];
}

export function pickDevice(platform?: string, deviceId?: string): Device | null {
  const all = listAllDevices();
  if (!all.length) return null;

  if (deviceId) {
    return all.find((d) => d.id === deviceId || d.name.toLowerCase().includes(deviceId.toLowerCase())) ?? null;
  }

  if (platform === "ios") {
    return all.find((d) => d.platform === "ios") ?? null;
  }
  if (platform === "android") {
    return all.find((d) => d.platform === "android") ?? null;
  }

  // Default: prefer iOS if available (typically the active dev target)
  return all.find((d) => d.platform === "ios") ?? all[0];
}
