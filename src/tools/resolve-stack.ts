import { z } from "zod";
import http from "http";
import { SourceMapConsumer } from "source-map";
import { metroClient, RawStackFrame } from "../metro-client.js";

export const ResolveStackSchema = z.object({
  message: z.string().optional(),
});

// Cache: map URL → SourceMapConsumer
const cache = new Map<string, { consumer: SourceMapConsumer; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000;

function toLocalhostUrl(url: string, host: string, port: number): string {
  return url.replace(/^https?:\/\/[^/]+/, `http://${host}:${port}`);
}

// http://localhost:8081/index.bundle//&platform=android&... → http://localhost:8081/index.map?platform=android&...
// http://localhost:8081/App.bundle//&...                    → http://localhost:8081/App.map?...
function toSourceMapUrl(bundleUrl: string): string {
  // Extract all params — keep them all, they identify the exact module bundle
  const paramsMatch = bundleUrl.match(/(?:\/\/&|\?)(.+)$/);
  const params = paramsMatch ? paramsMatch[1] : "dev=true&minify=false";

  // Replace /Foo.bundle (with any trailing path/query) with /Foo.map
  const mapBase = bundleUrl.replace(/(\/[^/?]+)\.bundle.*$/, "$1.map");
  return `${mapBase}?${params}`;
}

async function fetchSourceMap(mapUrl: string): Promise<SourceMapConsumer | null> {
  const cached = cache.get(mapUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.consumer;
  }

  return new Promise((resolve) => {
    const url = new URL(mapUrl);
    const req = http.get({ hostname: url.hostname, port: Number(url.port) || 8081, path: url.pathname + url.search }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", async () => {
        if (res.statusCode !== 200) { resolve(null); return; }
        try {
          const raw = JSON.parse(Buffer.concat(chunks).toString()) as Parameters<(typeof SourceMapConsumer)["with"]>[0];
          const consumer = await SourceMapConsumer.with(raw, null, (c) => c);
          cache.set(mapUrl, { consumer, fetchedAt: Date.now() });
          resolve(consumer);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(10_000, () => { req.destroy(); resolve(null); });
  });
}

export function invalidateSourceMapCache() {
  cache.forEach((v) => v.consumer.destroy());
  cache.clear();
}

// Parse all bundle stack frames from raw message text
// Format: "  at FunctionName (http://host/Foo.bundle//&...:line:col)"
function parseMessageFrames(rawMessage: string): RawStackFrame[] {
  const re = /at\s+([\w$.<>[\] ]+?)\s+\((https?:\/\/[^)]+\.bundle[^)]*):(\d+):(\d+)\)/g;
  const frames: RawStackFrame[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawMessage)) !== null) {
    frames.push({
      functionName: m[1].trim(),
      url: m[2],
      line: parseInt(m[3]) - 1, // convert to 0-indexed
      col: parseInt(m[4]),
    });
  }
  return frames;
}

async function resolveFrames(frames: RawStackFrame[]): Promise<string[]> {
  const lines: string[] = [];

  // Group frames by bundle URL to avoid fetching the same map multiple times
  const byMap = new Map<string, RawStackFrame[]>();
  for (const frame of frames) {
    const local = toLocalhostUrl(frame.url, metroClient.host, metroClient.port);
    const mapUrl = toSourceMapUrl(local);
    if (!byMap.has(mapUrl)) byMap.set(mapUrl, []);
    byMap.get(mapUrl)!.push(frame);
  }

  // Fetch all needed source maps
  const consumers = new Map<string, SourceMapConsumer | null>();
  await Promise.all([...byMap.keys()].map(async (mapUrl) => {
    consumers.set(mapUrl, await fetchSourceMap(mapUrl));
  }));

  for (const frame of frames) {
    const local = toLocalhostUrl(frame.url, metroClient.host, metroClient.port);
    const mapUrl = toSourceMapUrl(local);
    const consumer = consumers.get(mapUrl) ?? null;

    if (consumer) {
      const pos = consumer.originalPositionFor({ line: frame.line + 1, column: frame.col });
      if (pos.source) {
        const src = pos.source.replace(/^.*\/\/\//, "").replace(/\?.*$/, "");
        lines.push(`  at ${frame.functionName} (${src}:${pos.line}:${pos.column})`);
        continue;
      }
    }
    lines.push(`  at ${frame.functionName} (:${frame.line + 1}:${frame.col})`);
  }

  return lines;
}

export async function resolveStack(params: z.infer<typeof ResolveStackSchema>): Promise<string> {
  const errors = metroClient.getEntries({ level: "error", lines: 50 });
  const entry = params.message
    ? [...errors].reverse().find((e: typeof errors[0]) => e.message.includes(params.message!))
    : errors.at(-1);

  if (!entry) return "No error entries in buffer.";

  const errorTitle = `[ERROR] ${entry.message.split("\n")[0]}`;

  if (!entry.rawMessage) {
    return `${errorTitle}\n\nNo stack frames available.`;
  }

  // Resolve all bundle frames from the message text, then filter to user code only
  const allFrames = parseMessageFrames(entry.rawMessage);
  if (!allFrames.length) return `${errorTitle}\n\nNo stack frames available.`;

  const resolvedLines = await resolveFrames(allFrames);

  // Filter: keep only frames that resolved to a real source file outside node_modules
  const userLines = resolvedLines.filter((line) =>
    !line.includes("node_modules") && !line.includes("(:") // strip unresolved bundle offsets
  );

  const output: string[] = [errorTitle, ""];
  if (userLines.length) {
    output.push(...userLines);
  } else {
    // Nothing in user code — fall back to all resolved frames
    output.push(...resolvedLines);
  }

  return output.join("\n");
}
