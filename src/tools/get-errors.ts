import { z } from "zod";
import { metroClient } from "../metro-client.js";
import { cleanMessage, formatTime } from "./format.js";

export const GetErrorsSchema = z.object({
  lines: z.coerce.number().int().min(1).max(200).optional().default(20),
});

export function getErrors(params: z.infer<typeof GetErrorsSchema>): string {
  const entries = metroClient.getEntries({ level: "error", lines: params.lines });

  if (entries.length === 0) {
    return "No errors in buffer.";
  }

  return entries
    .map((e) => `[${formatTime(e.timestamp)}] [ERROR]\n${cleanMessage(e.message)}`)
    .join("\n\n---\n\n");
}
