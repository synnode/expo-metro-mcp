import { listAllDevices } from "./devices.js";

export function listDevices(): string {
  const devices = listAllDevices();

  if (!devices.length) {
    return "No active simulators or emulators found.\n\n- iOS: start a simulator via Xcode or `xcrun simctl boot <device>`\n- Android: start an emulator via Android Studio or `emulator -avd <name>`";
  }

  const lines = devices.map((d) => `- ${d.name} [${d.platform}]  id: ${d.id}`);
  return `Active devices (${devices.length}):\n${lines.join("\n")}`;
}
