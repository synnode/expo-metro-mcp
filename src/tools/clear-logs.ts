import { metroClient } from "../metro-client.js";

export function clearLogs(): string {
  const count = metroClient.clearBuffer();
  return `Cleared ${count} log ${count === 1 ? "entry" : "entries"} from the buffer.`;
}
