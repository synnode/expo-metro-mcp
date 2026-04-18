import { execSync, spawn, ChildProcess } from "child_process";

let companionProcess: ChildProcess | null = null;
let companionUdid: string | null = null;

export function isIdbAvailable(): boolean {
  try {
    execSync("which idb", { timeout: 2000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sleepMs(ms: number): void {
  // Tiny sync sleep used only during local companion bootstrap.
  // We keep it isolated here so callers don't duplicate the hack.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function ensureIdbCompanion(udid: string): void {
  if (companionProcess && !companionProcess.killed && companionUdid === udid) {
    return;
  }

  if (companionProcess && !companionProcess.killed) {
    companionProcess.kill();
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

  // idb commands can fail immediately if the companion socket is not ready yet.
  // A short bootstrap delay is simpler and more reliable here than retrying every caller.
  sleepMs(800);
}

process.on("exit", () => companionProcess?.kill());
process.on("SIGTERM", () => { companionProcess?.kill(); process.exit(0); });
process.on("SIGINT", () => { companionProcess?.kill(); process.exit(0); });
