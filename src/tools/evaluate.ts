import { z } from "zod";
import { metroClient } from "../metro-client.js";

export const EvaluateSchema = z.object({
  code: z.string().min(1).max(20_000),
  timeout_ms: z.coerce.number().int().min(100).max(30_000).optional().default(5_000),
});

function formatRemoteValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatExceptionDetails(details: Record<string, unknown> | undefined): string {
  if (!details) return "Unknown runtime error.";

  const text = typeof details.text === "string" ? details.text : "Runtime evaluation failed.";
  const exception = details.exception && typeof details.exception === "object"
    ? (details.exception as Record<string, unknown>)
    : undefined;
  const description = typeof exception?.description === "string"
    ? exception.description
    : typeof exception?.value === "string"
      ? exception.value
      : undefined;

  return description ? `${text}\n${description}` : text;
}

export async function evaluate(params: z.infer<typeof EvaluateSchema>): Promise<string> {
  const response = await metroClient.evaluate(params.code, params.timeout_ms);

  if (response.error) {
    const bits = [response.error.message ?? "CDP error"];
    if (response.error.data !== undefined) {
      bits.push(formatRemoteValue(response.error.data));
    }
    return `Evaluation failed.\n${bits.join("\n")}`;
  }

  const result = response.result && typeof response.result === "object"
    ? (response.result as Record<string, unknown>)
    : undefined;

  const exceptionDetails = result?.exceptionDetails && typeof result.exceptionDetails === "object"
    ? (result.exceptionDetails as Record<string, unknown>)
    : undefined;
  if (exceptionDetails) {
    return `Evaluation threw.\n${formatExceptionDetails(exceptionDetails)}`;
  }

  const remoteResult = result?.result && typeof result.result === "object"
    ? (result.result as Record<string, unknown>)
    : undefined;

  if (!remoteResult) {
    return "Evaluation completed, but no result was returned.";
  }

  const type = typeof remoteResult.type === "string" ? remoteResult.type : "unknown";
  const subtype = typeof remoteResult.subtype === "string" ? remoteResult.subtype : undefined;
  const value = remoteResult.value;
  const description = typeof remoteResult.description === "string" ? remoteResult.description : undefined;

  const header = [`type: ${type}`];
  if (subtype) header.push(`subtype: ${subtype}`);

  const body = value !== undefined ? formatRemoteValue(value) : description ?? "(no serializable value)";

  return `${header.join(", ")}\n${body}`;
}
