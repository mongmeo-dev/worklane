import { invoke } from "@tauri-apps/api/core";

export interface SystemResources {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
}

export function readSystemResources(): Promise<SystemResources> {
  return invoke<SystemResources>("read_system_resources");
}

export interface CommandPreflight {
  executable: string;
  available: boolean;
}

export function preflightCommand(executable: string): Promise<CommandPreflight> {
  return invoke<CommandPreflight>("preflight_command", { executable });
}
