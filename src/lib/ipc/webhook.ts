import { invoke } from "@tauri-apps/api/core";

/** Slack/Discord 웹훅으로 메시지를 보낸다. */
export function sendWebhook(url: string, text: string): Promise<void> {
  return invoke("send_webhook", { url, text });
}

/** URL이 있으면 fire-and-forget으로 전송한다. 실패는 조용히 무시한다. */
export function notifyWebhook(url: string, text: string): void {
  if (!url.trim()) return;
  void sendWebhook(url.trim(), text).catch(() => {});
}
