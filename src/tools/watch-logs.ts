import { z } from "zod";
import { metroClient, LogLevel } from "../metro-client.js";
import { cleanMessage, formatTime } from "./format.js";

export const WatchLogsSchema = z.object({
  duration: z.string().optional().default("10s"),
  level: z.enum(["error", "warn", "info", "log", "debug"]).optional(),
});

function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)(s|m)$/);
  if (!match) return 10_000;

  const value = parseFloat(match[1]);
  const unit = match[2];
  const ms = unit === "m" ? value * 60_000 : value * 1_000;

  // Cap at 30s
  return Math.min(ms, 30_000);
}

const POLL_INTERVAL_MS = 500;

export async function watchLogs(params: z.infer<typeof WatchLogsSchema>): Promise<string> {
  if (!metroClient.connected) {
    return "Metro is not connected. Start Expo dev server and try again.";
  }

  const durationMs = parseDurationMs(params.duration);
  const startTime = Date.now();
  const levelFilter = params.level as LogLevel | undefined;

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (Date.now() - startTime >= durationMs) {
        clearInterval(interval);
        resolve();
      }
    }, POLL_INTERVAL_MS);
  });

  // Collect entries that arrived after we started watching.
  // Filter by timestamp instead of buffer index so circular-buffer eviction can't skew results.
  const newEntries = metroClient.getEntries({ since: startTime, lines: metroClient.bufferedEntries });

  const filtered = levelFilter
    ? newEntries.filter((e) => e.level === levelFilter)
    : newEntries;

  if (filtered.length === 0) {
    return `No logs received during ${params.duration} window.`;
  }

  return filtered
    .map((e) => `[${formatTime(e.timestamp)}] [${e.level.toUpperCase()}] ${cleanMessage(e.message)}`)
    .join("\n");
}
