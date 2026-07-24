import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let granted: boolean | null = null;

/** 알림 권한을 1회 확인/요청하고 결과를 캐시한다. 실패 시 false로 폴백한다. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (granted !== null) return granted;
  try {
    let ok = await isPermissionGranted();
    if (!ok) ok = (await requestPermission()) === "granted";
    granted = ok;
  } catch {
    granted = false;
  }
  return granted;
}

/** 주의 필요 OS 알림을 보낸다. 권한이 없거나 실패하면 조용히 무시한다. */
export async function sendAttentionNotification(title: string, body: string): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  try {
    sendNotification({ title, body });
  } catch {
    // 알림 실패는 UX에 치명적이지 않으므로 조용히 무시한다.
  }
}
