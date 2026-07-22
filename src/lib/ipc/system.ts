import { invoke } from "@tauri-apps/api/core";

export interface SystemResources {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
}

export function readSystemResources(): Promise<SystemResources> {
  return invoke<SystemResources>("read_system_resources");
}
