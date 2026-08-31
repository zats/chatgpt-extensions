import type { ExtensionMessage, JsonObject } from "@chatgptx/api";

export const NATIVE_PROBE_EVIDENCE_FILE = "evidence.json";
export const NATIVE_PROBE_SCHEMA_VERSION = 1;
export const NATIVE_PROBE_NODE_INPUT = "native-main-probe";
export const NATIVE_PROBE_NODE_SHA256 =
  "a28a20cd7a09cc9be1dcec47b3a301baabe4b1ea0583ece756542eb937a2b762";
export const NATIVE_PROBE_OBJC_INPUT = "ChatGPTX native main probe";
export const NATIVE_PROBE_FOUNDATION =
  "/System/Library/Frameworks/Foundation.framework/Foundation";

export const NATIVE_PROBE_METHOD_BEGIN = "probe.begin";
export const NATIVE_PROBE_METHOD_CANCEL = "probe.cancel";
export const NATIVE_PROBE_METHOD_FINALIZE = "probe.finalize";
export const NATIVE_PROBE_EVENT_TARGETED = "probe.targeted";
export const NATIVE_PROBE_EVENT_BROADCAST = "probe.broadcast";
export const NATIVE_PROBE_EVENT_CANCEL_STARTED = "probe.cancel-started";
export const NATIVE_PROBE_EVENT_CANCEL_OBSERVED = "probe.cancel-observed";

export function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function requiredNonce(value: ExtensionMessage | undefined): string {
  const nonce = record(value)?.nonce;
  if (typeof nonce !== "string" || nonce.length === 0) {
    throw new TypeError("Native Main Probe requires a nonce");
  }
  return nonce;
}

export function jsonObject(value: unknown): JsonObject {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  const result = record(parsed);
  if (!result) throw new TypeError("Native Main Probe value is not a JSON object");
  return result as JsonObject;
}
