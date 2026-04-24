import { z } from "zod";
import { metroClient } from "../metro-client.js";

const MMKV_ROOT = "globalThis.__EXPO_METRO_MCP__?.mmkv";

export const MmkvGetSchema = z.object({
  key: z.string().min(1).max(500),
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

export const MmkvSetSchema = z.object({
  key: z.string().min(1).max(500),
  value: z.string().max(200_000),
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

export const MmkvRemoveSchema = z.object({
  key: z.string().min(1).max(500),
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

export const MmkvKeysSchema = z.object({
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

export const MmkvGetJsonSchema = z.object({
  key: z.string().min(1).max(500),
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

export const MmkvSetJsonSchema = z.object({
  key: z.string().min(1).max(500),
  value: z.unknown(),
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

export const MmkvMergeJsonSchema = z.object({
  key: z.string().min(1).max(500),
  value: z.record(z.string(), z.unknown()),
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

export const ZustandPersistGetSchema = z.object({
  key: z.string().min(1).max(500),
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

export const ZustandPersistSetSchema = z.object({
  key: z.string().min(1).max(500),
  state: z.record(z.string(), z.unknown()),
  version: z.number().int().optional(),
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

export const ZustandPersistMergeSchema = z.object({
  key: z.string().min(1).max(500),
  state: z.record(z.string(), z.unknown()),
  version: z.number().int().optional(),
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

function escapeForJs(value: string): string {
  return JSON.stringify(value);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function evaluateJson(code: string, timeoutMs: number): Promise<unknown> {
  const response = await metroClient.evaluate(code, timeoutMs);

  if (response.error) {
    throw new Error(response.error.message ?? "CDP evaluation failed.");
  }

  const result = response.result && typeof resultOrObject(response.result) === "object"
    ? (resultOrObject(response.result) as Record<string, unknown>)
    : undefined;

  const exceptionDetails = result?.exceptionDetails && typeof resultOrObject(result.exceptionDetails) === "object"
    ? (result.exceptionDetails as Record<string, unknown>)
    : undefined;
  if (exceptionDetails) {
    const text = typeof exceptionDetails.text === "string" ? exceptionDetails.text : "Runtime evaluation failed.";
    const exception = exceptionDetails.exception && typeof resultOrObject(exceptionDetails.exception) === "object"
      ? (exceptionDetails.exception as Record<string, unknown>)
      : undefined;
    const description = typeof exception?.description === "string"
      ? exception.description
      : typeof exception?.value === "string"
        ? exception.value
        : undefined;
    throw new Error(description ? `${text}\n${description}` : text);
  }

  const remoteResult = result?.result && typeof resultOrObject(result.result) === "object"
    ? (result.result as Record<string, unknown>)
    : undefined;

  return remoteResult?.value;
}

function resultOrObject(value: unknown): object | null {
  return value && typeof value === "object" ? value as object : null;
}

function mmkvBootstrapExpression(inner: string): string {
  return `(() => {
    const mmkv = ${MMKV_ROOT};
    if (!mmkv) {
      throw new Error("MMKV debug hook not found at globalThis.__EXPO_METRO_MCP__.mmkv");
    }
    if (typeof mmkv.getItem !== "function" || typeof mmkv.setItem !== "function" || typeof mmkv.removeItem !== "function" || typeof mmkv.getAllKeys !== "function") {
      throw new Error("MMKV debug hook is present but missing one or more required methods: getItem, setItem, removeItem, getAllKeys");
    }
    return (${inner})();
  })()`;
}

function parseStoredJson(raw: string | null): unknown {
  if (raw == null) return null;
  return JSON.parse(raw) as unknown;
}

export async function mmkvGet(params: z.infer<typeof MmkvGetSchema>): Promise<string> {
  const value = await evaluateJson(mmkvBootstrapExpression(`() => ({ key: ${escapeForJs(params.key)}, value: mmkv.getItem(${escapeForJs(params.key)}) ?? null })`), params.timeout_ms);
  return formatJson(value);
}

export async function mmkvSet(params: z.infer<typeof MmkvSetSchema>): Promise<string> {
  const value = await evaluateJson(mmkvBootstrapExpression(`() => {
    mmkv.setItem(${escapeForJs(params.key)}, ${escapeForJs(params.value)});
    return { ok: true, key: ${escapeForJs(params.key)}, value: mmkv.getItem(${escapeForJs(params.key)}) ?? null };
  }`), params.timeout_ms);
  return formatJson(value);
}

export async function mmkvRemove(params: z.infer<typeof MmkvRemoveSchema>): Promise<string> {
  const value = await evaluateJson(mmkvBootstrapExpression(`() => {
    mmkv.removeItem(${escapeForJs(params.key)});
    return { ok: true, key: ${escapeForJs(params.key)} };
  }`), params.timeout_ms);
  return formatJson(value);
}

export async function mmkvKeys(params: z.infer<typeof MmkvKeysSchema>): Promise<string> {
  const value = await evaluateJson(mmkvBootstrapExpression(`() => ({ keys: mmkv.getAllKeys() })`), params.timeout_ms);
  return formatJson(value);
}

export async function mmkvGetJson(params: z.infer<typeof MmkvGetJsonSchema>): Promise<string> {
  const raw = await evaluateJson(mmkvBootstrapExpression(`() => mmkv.getItem(${escapeForJs(params.key)}) ?? null`), params.timeout_ms) as string | null;
  const parsed = parseStoredJson(raw);
  return formatJson({ key: params.key, value: parsed });
}

export async function mmkvSetJson(params: z.infer<typeof MmkvSetJsonSchema>): Promise<string> {
  const encoded = JSON.stringify(params.value);
  const value = await evaluateJson(mmkvBootstrapExpression(`() => {
    mmkv.setItem(${escapeForJs(params.key)}, ${escapeForJs(encoded)});
    return { ok: true, key: ${escapeForJs(params.key)}, value: JSON.parse(mmkv.getItem(${escapeForJs(params.key)}) ?? "null") };
  }`), params.timeout_ms);
  return formatJson(value);
}

export async function mmkvMergeJson(params: z.infer<typeof MmkvMergeJsonSchema>): Promise<string> {
  const existingRaw = await evaluateJson(mmkvBootstrapExpression(`() => mmkv.getItem(${escapeForJs(params.key)}) ?? null`), params.timeout_ms) as string | null;
  const existing = existingRaw == null ? {} : parseStoredJson(existingRaw);

  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    throw new Error("Existing MMKV value is not a JSON object, so merge would be sketchy. Use mmkv_set_json instead.");
  }

  const merged = { ...(existing as Record<string, unknown>), ...params.value };
  return mmkvSetJson({ key: params.key, value: merged, timeout_ms: params.timeout_ms });
}

export async function zustandPersistGet(params: z.infer<typeof ZustandPersistGetSchema>): Promise<string> {
  const raw = await evaluateJson(mmkvBootstrapExpression(`() => mmkv.getItem(${escapeForJs(params.key)}) ?? null`), params.timeout_ms) as string | null;
  const parsed = parseStoredJson(raw) as { state?: unknown; version?: unknown } | null;
  return formatJson({
    key: params.key,
    state: parsed?.state ?? null,
    version: typeof parsed?.version === "number" ? parsed.version : null,
    raw: parsed,
  });
}

export async function zustandPersistSet(params: z.infer<typeof ZustandPersistSetSchema>): Promise<string> {
  const payload = {
    state: params.state,
    ...(params.version !== undefined ? { version: params.version } : {}),
  };
  return mmkvSetJson({ key: params.key, value: payload, timeout_ms: params.timeout_ms });
}

export async function zustandPersistMerge(params: z.infer<typeof ZustandPersistMergeSchema>): Promise<string> {
  const raw = await evaluateJson(mmkvBootstrapExpression(`() => mmkv.getItem(${escapeForJs(params.key)}) ?? null`), params.timeout_ms) as string | null;
  const parsed = raw == null ? null : parseStoredJson(raw) as { state?: unknown; version?: unknown } | null;
  const existingState = parsed?.state;

  if (existingState != null && (typeof existingState !== "object" || Array.isArray(existingState))) {
    throw new Error("Existing persisted Zustand state is not an object, so merge would be sketchy. Use zustand_persist_set instead.");
  }

  const merged = {
    state: {
      ...((existingState as Record<string, unknown> | null) ?? {}),
      ...params.state,
    },
    version: params.version ?? (typeof parsed?.version === "number" ? parsed.version : undefined),
  };

  return mmkvSetJson({ key: params.key, value: merged, timeout_ms: params.timeout_ms });
}
