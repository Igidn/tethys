import { prettyItem } from "./format";
import type { EventRecord } from "./types";

export function eventSummary(event: EventRecord): string {
  const data = (event.data ?? {}) as Record<string, unknown>;
  if (event.kind === "ore") {
    const name = data.name ? prettyItem(String(data.name)) : "ore";
    const x = data.x ?? "?";
    const y = data.y ?? "?";
    const z = data.z ?? "?";
    return `${name} · ${x}, ${y}, ${z}`;
  }
  if (event.kind === "mission_result") {
    const status = String(data.status ?? "result");
    const error = data.error ? ` · ${String(data.error)}` : "";
    const blocks = typeof data.blocks === "number" ? ` · ${data.blocks} blocks` : "";
    return `${status}${blocks}${error}`;
  }
  if (event.kind === "role_changed") return `role → ${String(data.role ?? "?")}`;
  if (event.kind === "renamed") return `call sign → ${String(data.label ?? "cleared")}`;
  if (event.kind === "connected") return `firmware ${String(data.fw ?? "unknown")}`;
  if (event.kind === "registered") return `station ${String(data.station ?? "?")}`;
  if (event.kind === "disconnected") return `link closed · ${String(data.code ?? "no code")}`;
  const text = JSON.stringify(data);
  return text === "{}" ? "no payload" : text.slice(0, 120);
}

export function eventPayload(event: EventRecord): string {
  return JSON.stringify(event.data ?? {}, null, 2);
}
