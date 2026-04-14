import { spawn, ChildProcess } from "child_process";

let companionProcess: ChildProcess | null = null;
let companionUdid: string | null = null;

export function ensureIdbCompanion(udid: string): void {
  if (companionProcess && !companionProcess.killed && companionUdid === udid) {
    return; // Already running for this device
  }

  if (companionProcess && !companionProcess.killed) {
    companionProcess.kill(); // Different device, restart
  }

  companionProcess = spawn("idb_companion", ["--udid", udid], {
    detached: false,
    stdio: "ignore",
  });
  companionUdid = udid;

  companionProcess.on("exit", () => {
    companionProcess = null;
    companionUdid = null;
  });

  // Give companion time to start before first command
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);
}

process.on("exit", () => companionProcess?.kill());
process.on("SIGTERM", () => { companionProcess?.kill(); process.exit(0); });
process.on("SIGINT", () => { companionProcess?.kill(); process.exit(0); });
