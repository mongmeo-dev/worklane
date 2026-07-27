import { t } from "$lib/i18n";

export type ActionErrorCode =
  | "WORKTREE_DIRTY"
  | "SESSION_CLOSED"
  | "SESSION_NOT_FOUND"
  | "AGENT_NOT_FOUND"
  | "AGENT_TITLE_REQUIRED"
  | "INVALID_EXECUTABLE"
  | "UNKNOWN";

export interface ActionErrorEvent {
  id: number;
  code: ActionErrorCode;
  reason: string;
}

const KNOWN_CODES = new Set<ActionErrorCode>([
  "WORKTREE_DIRTY",
  "SESSION_CLOSED",
  "SESSION_NOT_FOUND",
  "AGENT_NOT_FOUND",
  "AGENT_TITLE_REQUIRED",
  "INVALID_EXECUTABLE",
]);

function textOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message.trim();
  if (typeof reason === "string") return reason.trim();
  if (reason && typeof reason === "object") {
    const value = reason as Record<string, unknown>;
    if (typeof value.message === "string") return value.message.trim();
    if (typeof value.error === "string") return value.error.trim();
    try {
      return JSON.stringify(reason);
    } catch {
      return "";
    }
  }
  return reason == null ? "" : String(reason).trim();
}

export function normalizeActionError(reason: unknown): Omit<ActionErrorEvent, "id"> {
  const text = textOf(reason);
  const objectCode =
    reason && typeof reason === "object" && typeof (reason as Record<string, unknown>).code === "string"
      ? String((reason as Record<string, unknown>).code)
      : "";
  const codeCandidate = objectCode || text;
  const code = KNOWN_CODES.has(codeCandidate as ActionErrorCode)
    ? (codeCandidate as ActionErrorCode)
    : "UNKNOWN";
  return { code, reason: text };
}

export function actionErrorMessage(event: ActionErrorEvent): string {
  if (event.code !== "UNKNOWN") return t(`actionError.${event.code}`);
  return event.reason
    ? t("actionError.withReason", { reason: event.reason })
    : t("actionError.unknown");
}

class ActionErrorStore {
  event = $state<ActionErrorEvent | null>(null);
  #nextId = 0;

  report(reason: unknown): void {
    this.event = { id: ++this.#nextId, ...normalizeActionError(reason) };
  }

  dismiss(): void {
    this.event = null;
  }
}

export const actionErrors = new ActionErrorStore();
