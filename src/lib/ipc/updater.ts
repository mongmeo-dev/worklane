import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type { Update };

/** 업데이트 가능 여부를 확인한다. 없으면 null. */
export function checkUpdate(): Promise<Update | null> {
  return check();
}

/** 업데이트를 내려받아 설치하고 앱을 재시작한다. */
export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
