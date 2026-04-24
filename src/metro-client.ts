import WebSocket from "ws";
import http from "http";

const METRO_PORT = parseInt(process.env.METRO_PORT ?? "8081", 10);
const METRO_HOST = process.env.METRO_HOST ?? "localhost";
const LOG_BUFFER_SIZE = parseInt(process.env.LOG_BUFFER_SIZE ?? "1000", 10);

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

export type LogLevel = "error" | "warn" | "info" | "log" | "debug";

export interface RawStackFrame {
  functionName: string;
  url: string;    // full original URL from CDP (may be device IP)
  line: number;   // 0-indexed (CDP convention)
  col: number;    // 0-indexed
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  rawMessage?: string;     // original message before URL stripping (for component stack parsing)
  rawFrames?: RawStackFrame[];
}

// CDP Runtime.consoleAPICalled type → our LogLevel
const CDP_TYPE_MAP: Record<string, LogLevel> = {
  log: "log",
  info: "info",
  warning: "warn",
  warn: "warn",
  error: "error",
  debug: "debug",
  dir: "log",
  dirxml: "log",
  table: "log",
  assert: "error",
};

interface CdpTarget {
  id: string;
  webSocketDebuggerUrl: string;
  title?: string;
}

interface CdpMessage {
  method?: string;
  id?: number;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface PendingResponse {
  resolve: (value: CdpMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function formatArgs(args: Array<{ type?: string; value?: unknown; description?: string }>): string {
  return args
    .map((a) => {
      if (a.value !== undefined && a.value !== null) return String(a.value);
      if (a.description) return a.description;
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

async function fetchTargets(host: string, port: number): Promise<CdpTarget[]> {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/json/list`, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body) as unknown;
          if (Array.isArray(parsed)) {
            resolve(parsed as CdpTarget[]);
          } else {
            resolve([]);
          }
        } catch {
          resolve([]);
        }
      });
    });
    req.on("error", () => resolve([]));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve([]);
    });
  });
}

class MetroClient {
  private buffer: LogEntry[] = [];
  private cdpWs: WebSocket | null = null;
  private eventsWs: WebSocket | null = null;
  private _connected = false;
  private _currentTargetId: string | null = null;
  private _lastConnectedAt: Date | null = null;
  private _totalReceived = 0;
  private _stopped = false;
  private _eventsBackoff = INITIAL_BACKOFF_MS;
  private _deviceTitle: string | null = null;
  private _nextMessageId = 1;
  private pendingResponses = new Map<number, PendingResponse>();

  readonly host = METRO_HOST;
  readonly port = METRO_PORT;

  get connected() {
    return this._connected;
  }

  get lastConnectedAt() {
    return this._lastConnectedAt;
  }

  get totalReceived() {
    return this._totalReceived;
  }

  get bufferedEntries() {
    return this.buffer.length;
  }

  get deviceTitle() {
    return this._deviceTitle;
  }

  start() {
    this._stopped = false;
    this.connectEvents();
  }

  stop() {
    this._stopped = true;
    if (this.cdpWs) {
      this.cdpWs.terminate();
      this.cdpWs = null;
    }
    if (this.eventsWs) {
      this.eventsWs.terminate();
      this.eventsWs = null;
    }
  }

  disconnect() {
    this.rejectPendingResponses(new Error("Disconnected from Metro CDP."));
    if (this.cdpWs) {
      this.cdpWs.terminate();
      this.cdpWs = null;
    }
    this._connected = false;
    this._currentTargetId = null;
    this._deviceTitle = null;
  }

  getEntries(options: {
    lines?: number;
    level?: LogLevel;
    since?: number;
  } = {}): LogEntry[] {
    let entries = this.buffer;

    if (options.since !== undefined) {
      entries = entries.filter((e) => e.timestamp >= options.since!);
    }

    if (options.level) {
      entries = entries.filter((e) => e.level === options.level);
    }

    const lines = options.lines ?? 50;
    return entries.slice(-lines);
  }

  clearBuffer(): number {
    const count = this.buffer.length;
    this.buffer = [];
    return count;
  }

  async grabConnection(): Promise<string> {
    await this.checkForNewTarget();
    // Give the WebSocket a moment to open
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (this._connected) {
      return `Connected to ${this._deviceTitle ?? "device"}.`;
    }
    return "No device found. Is Metro running with a connected device?";
  }

  async evaluate(expression: string, timeoutMs = 5_000): Promise<CdpMessage> {
    if (!this._connected || !this.cdpWs || this.cdpWs.readyState !== WebSocket.OPEN) {
      await this.checkForNewTarget();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (!this._connected || !this.cdpWs || this.cdpWs.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to Metro CDP. Start Expo, make sure a device is attached, then call connect.");
    }

    return this.sendCdpCommand("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      generatePreview: false,
      replMode: true,
    }, timeoutMs);
  }

  private addEntry(entry: LogEntry) {
    this._totalReceived++;
    this.buffer.push(entry);
    if (this.buffer.length > LOG_BUFFER_SIZE) {
      this.buffer.shift();
    }
  }

  private async checkForNewTarget() {
    const targets = await fetchTargets(this.host, this.port);
    if (!targets.length) {
      if (this._connected) {
        this._connected = false;
        this._currentTargetId = null;
        this._deviceTitle = null;
      }
      return;
    }

    const target = targets[0];
    if (target.id === this._currentTargetId && this.cdpWs?.readyState === WebSocket.OPEN) {
      return; // Already connected to this target
    }

    // New target found (or reconnect needed), connect
    this.connectCdp(target);
  }

  private connectCdp(target: CdpTarget) {
    // Close existing CDP connection
    if (this.cdpWs) {
      this.cdpWs.terminate();
      this.cdpWs = null;
    }

    this._currentTargetId = target.id;
    this._deviceTitle = target.title ?? null;

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    this.cdpWs = ws;

    ws.on("open", () => {
      this._connected = true;
      this._lastConnectedAt = new Date();
      // Enable Runtime domain to receive console events
      ws.send(JSON.stringify({ id: 1, method: "Runtime.enable", params: {} }));
    });

    ws.on("message", (data) => {
      let msg: CdpMessage;
      try {
        msg = JSON.parse(data.toString()) as CdpMessage;
      } catch {
        return;
      }

      if (typeof msg.id === "number") {
        const pending = this.pendingResponses.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingResponses.delete(msg.id);
          pending.resolve(msg);
          return;
        }
      }

      if (msg.method === "Runtime.consoleAPICalled" && msg.params) {
        this.handleConsoleEvent(msg.params);
      }
    });

    ws.on("close", () => {
      if (this.cdpWs === ws) {
        this.rejectPendingResponses(new Error("Metro CDP connection closed."));
        this._connected = false;
        this.cdpWs = null;
        this._currentTargetId = null;
        this._deviceTitle = null;
        // No auto-reconnect — use connect tool to reattach when needed
      }
    });

    ws.on("error", () => {
      // Handled by close
    });
  }

  private sendCdpCommand(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<CdpMessage> {
    const ws = this.cdpWs;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Metro CDP is not connected."));
    }

    const id = this._nextMessageId++;

    return new Promise<CdpMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(id);
        reject(new Error(`CDP command timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pendingResponses.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pendingResponses.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private rejectPendingResponses(error: Error) {
    for (const [id, pending] of this.pendingResponses.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingResponses.delete(id);
    }
  }

  private handleConsoleEvent(params: Record<string, unknown>) {
    const type = typeof params.type === "string" ? params.type : "log";
    const level: LogLevel = CDP_TYPE_MAP[type] ?? "log";
    const args = Array.isArray(params.args)
      ? (params.args as Array<{ type?: string; value?: unknown; description?: string }>)
      : [];
    const message = formatArgs(args);
    const ts = typeof params.timestamp === "number" ? Math.round(params.timestamp) : Date.now();

    if (!message) return;

    // Capture raw stack frames for source map resolution
    const stackTrace = params.stackTrace as { callFrames?: Array<{ functionName?: string; url?: string; lineNumber?: number; columnNumber?: number }> } | undefined;
    const rawFrames: RawStackFrame[] | undefined = stackTrace?.callFrames
      ?.filter((f) => f.url && !f.url.startsWith("native"))
      .map((f) => ({
        functionName: f.functionName ?? "(anonymous)",
        url: f.url!,
        line: f.lineNumber ?? 0,
        col: f.columnNumber ?? 0,
      }));

    // Only store rawMessage if it contains URLs (needed for component stack parsing)
    const rawMessage = message.includes("http://") ? message : undefined;

    this.addEntry({ timestamp: ts, level, message, rawMessage, rawFrames: rawFrames?.length ? rawFrames : undefined });
  }

  // Also listen to /events for Metro build errors (build_failed, bundling_error)
  private connectEvents() {
    if (this._stopped) return;

    const url = `ws://${this.host}:${this.port}/events`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleEventsReconnect();
      return;
    }

    this.eventsWs = ws;

    ws.on("open", () => {
      this._eventsBackoff = INITIAL_BACKOFF_MS;
    });

    ws.on("message", (data) => {
      let event: { type?: string; message?: string } | null = null;
      try {
        event = JSON.parse(data.toString()) as { type?: string; message?: string };
      } catch {
        return;
      }

      if (event.type === "build_failed" || event.type === "bundling_error") {
        this.addEntry({
          timestamp: Date.now(),
          level: "error",
          message: event.message ?? event.type,
        });
      }
    });

    ws.on("close", () => {
      if (this.eventsWs === ws) {
        this.eventsWs = null;
        this.scheduleEventsReconnect();
      }
    });

    ws.on("error", () => {
      // Handled by close
    });
  }

  private scheduleEventsReconnect() {
    if (this._stopped) return;
    setTimeout(() => {
      this._eventsBackoff = Math.min(this._eventsBackoff * 2, MAX_BACKOFF_MS);
      this.connectEvents();
    }, this._eventsBackoff);
  }
}

export const metroClient = new MetroClient();
