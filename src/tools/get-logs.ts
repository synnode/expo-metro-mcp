import { z } from "zod";
import { metroClient, LogLevel } from "../metro-client.js";

export const GetLogsSchema = z.object({
  lines: z.number().int().min(1).max(500).optional().default(50),
  level: z.enum(["error", "warn", "info", "log"]).optional(),
  since: z.string().optional(),
});

function parseSince(since: string): number {
  // Unix timestamp as string
  const asNum = Number(since);
  if (!isNaN(asNum) && asNum > 1_000_000_000) {
    // Treat as unix seconds if < 1e12, else ms
    return asNum < 1e12 ? asNum * 1000 : asNum;
  }

  // Relative: "30s", "2m", "1h"
  const match = since.match(/^(\d+(?:\.\d+)?)(s|m|h)$/);
  if (match) {
    const value = parseFloat(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };
    return Date.now() - value * multipliers[unit];
  }

  // Fallback: treat as ms timestamp
  return asNum;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function getLogs(params: z.infer<typeof GetLogsSchema>): string {
  const since = params.since ? parseSince(params.since) : undefined;

  const entries = metroClient.getEntries({
    lines: params.lines,
    level: params.level as LogLevel | undefined,
    since,
  });

  if (entries.length === 0) {
    return "No log entries found.";
  }

  return entries
    .map((e) => `[${formatTime(e.timestamp)}] [${e.level.toUpperCase()}] ${e.message}`)
    .join("\n");
}
