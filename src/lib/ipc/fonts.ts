import { invoke } from "@tauri-apps/api/core";

/** 시스템 폰트 패밀리 목록을 조회한다. 실패 시 조용히 빈 배열로 폴백한다. */
export async function listFonts(): Promise<string[]> {
  try {
    return await invoke<string[]>("list_system_fonts");
  } catch {
    return [];
  }
}
