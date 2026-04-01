import { z } from "zod";
import { metroClient, LogEntry } from "../metro-client.js";

export const GetErrorsSchema = z.object({
  lines: z.number().int().min(1).max(200).optional().default(20),
});

function isStackContinuation(entry: LogEntry): boolean {
  // An entry is a stack trace continuation if:
  // - It starts with whitespace (indented stack frame)
  // - It contains " at " (JS stack frame pattern)
  const msg = entry.message;
  return /^\s/.test(msg) || /\bat\b/.test(msg);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function getErrors(params: z.infer<typeof GetErrorsSchema>): string {
  const allErrors = metroClient.getEntries({ level: "error", lines: params.lines });

  if (allErrors.length === 0) {
    return "No errors in buffer.";
  }

  // Also grab all entries to look for stack continuation lines following errors
  const all = metroClient.getEntries({ lines: 1000 });

  // Build merged error blocks
  const blocks: string[] = [];

  for (const errorEntry of allErrors) {
    const idx = all.indexOf(errorEntry);
    const lines: string[] = [
      `[${formatTime(errorEntry.timestamp)}] [ERROR] ${errorEntry.message}`,
    ];

    // Collect consecutive continuation entries after this error
    if (idx !== -1) {
      let i = idx + 1;
      while (i < all.length && isStackContinuation(all[i])) {
        lines.push(`  ${all[i].message}`);
        i++;
      }
    }

    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n");
}
