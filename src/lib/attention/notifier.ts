import type { AgentStatus } from "$lib/types";
import { listenStatus } from "$lib/ipc/status";
import { ensureNotificationPermission, sendAttentionNotification } from "$lib/ipc/notify";
import { notifyWebhook } from "$lib/ipc/webhook";
import { integrations } from "$lib/stores/integrations.svelte";
import { t } from "$lib/i18n";

/**
 * 이전 상태에서 현재 상태로의 전이가 OS 알림을 발생시켜야 하는지 판정한다.
 * - 최초 관측(prev === undefined)은 앱 시작 시 하이드레이션이므로 알리지 않는다(시작 스팸 방지).
 * - 같은 상태 반복은 알리지 않는다.
 * - 입력 대기(blocked)/완료(done)로 새로 진입할 때만 알린다.
 */
export function shouldNotify(prev: AgentStatus | undefined, next: AgentStatus): boolean {
  if (prev === undefined || prev === next) return false;
  return next === "blocked" || next === "done";
}

export interface AttentionMeta {
  agentTitle: string;
  projectName: string;
}

/** 상태 전이에 대한 알림 제목/본문을 만든다. */
export function attentionNotification(
  status: "blocked" | "done",
  meta: AttentionMeta,
): { title: string; body: string } {
  const label = status === "blocked" ? t("notify.blocked") : t("notify.done");
  const body =
    status === "blocked"
      ? t("notify.blockedBody", { project: meta.projectName })
      : t("notify.doneBody", { project: meta.projectName });
  return { title: `${meta.agentTitle} · ${label}`, body };
}

type Resolver = (agentId: string) => AttentionMeta | undefined;

/**
 * status-changed 이벤트를 구독해 주의 필요 전이 시 OS 알림을 보낸다.
 * 세션별 직전 상태를 스스로 추적해 중복/시작 스팸을 막는다.
 */
class AttentionNotifier {
  private prev = new Map<string, AgentStatus>();
  private startPromise: Promise<void> | null = null;

  /** 앱 마운트 시 1회 호출한다(멱등). resolve는 에이전트 메타를 조회한다. */
  async start(resolve: Resolver): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      await ensureNotificationPermission();
      await listenStatus((e) => {
        const before = this.prev.get(e.sessionId);
        this.prev.set(e.sessionId, e.status);
        if (!shouldNotify(before, e.status)) return;
        const meta = resolve(e.sessionId);
        if (!meta) return;
        const msg = attentionNotification(e.status as "blocked" | "done", meta);
        void sendAttentionNotification(msg.title, msg.body);
        notifyWebhook(integrations.webhookUrl, `${msg.title} — ${msg.body}`);
      });
    })();
    return this.startPromise;
  }
}

export const attentionNotifier = new AttentionNotifier();
