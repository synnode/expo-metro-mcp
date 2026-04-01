// Strip Metro bundle URLs from stack trace lines, keeping only line:col
// "at foo (http://10.0.2.2:8081/index.bundle//&...:1234:56)" → "at foo (:1234:56)"
const BUNDLE_URL_RE = /\(https?:\/\/[^)]+\.bundle[^)]*:(\d+:\d+)\)/g;

export function cleanMessage(message: string): string {
  return message.replace(BUNDLE_URL_RE, "(:$1)");
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
