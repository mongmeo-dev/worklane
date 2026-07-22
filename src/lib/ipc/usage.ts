import { invoke } from "@tauri-apps/api/core";

export type UsageProvider = "claude-code" | "codex" | "cursor" | "gemini";

export interface UsageMetric {
  label: string;
  percent: number;
  valueText: string;
  resetNote: string;
}

export interface UsageInfo {
  provider: UsageProvider;
  fullName: string;
  plan: string | null;
  account: string | null;
  tier: string | null;
  primaryPercent: number | null;
  primaryReset: string | null;
  metrics: UsageMetric[];
  connected: boolean;
}

export function readCodexUsage(): Promise<UsageInfo> {
  return invoke<UsageInfo>("read_codex_usage");
}

/** 로컬 사용량 소스가 없는 CLI의 미연동 표시값을 만든다. */
export function disconnectedUsage(
  provider: UsageProvider,
  fullName: string,
  tier: string,
): UsageInfo {
  return {
    provider,
    fullName,
    plan: null,
    account: null,
    tier,
    primaryPercent: null,
    primaryReset: null,
    metrics: [],
    connected: false,
  };
}
