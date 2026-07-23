<script lang="ts">
  import type { UsageInfo } from "$lib/ipc/usage";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { clampPercent, gaugeColorClass, gaugeTextClass } from "$lib/usage/display";
  import ExternalLink from "@lucide/svelte/icons/external-link";

  let { info }: { info: UsageInfo } = $props();

  const dashboardUrls: Partial<Record<UsageInfo["provider"], string>> = {
    "claude-code": "https://claude.ai/settings/usage",
    codex: "https://chatgpt.com/codex/settings/usage",
    cursor: "https://cursor.com/dashboard",
    gemini: "https://aistudio.google.com/app/usage",
  };

  async function openDashboard() {
    const url = dashboardUrls[info.provider];
    if (url) await openUrl(url);
  }
</script>

<div class="absolute bottom-[calc(100%+8px)] left-0 z-40 w-64 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl" role="dialog" aria-label={`${info.fullName} 사용량 상세`}>
  <header class="border-b px-3.5 py-3">
    <div class="flex items-center gap-2">
      <h2 class="text-[12.5px] font-semibold">{info.fullName}</h2>
      <span class="rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">{info.plan ?? (info.connected ? "플랜 미확인" : "연동 안 됨")}</span>
    </div>
    <p class="mt-1 truncate font-mono text-[9.5px] text-muted-foreground">{info.account ?? "계정 정보를 확인할 수 없습니다."}</p>
  </header>

  <div class="flex flex-col gap-3 p-3.5">
    {#if info.metrics.length > 0}
      {#each info.metrics as metric (metric.label)}
        <section>
          <div class="flex items-center gap-2 text-[10.5px]">
            <span class="min-w-0 flex-1 truncate text-muted-foreground">{metric.label}</span>
            <span class="font-mono font-semibold {gaugeTextClass(metric.percent)}">{metric.valueText}</span>
          </div>
          <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <span class="block h-full rounded-full {gaugeColorClass(metric.percent)}" style:width={`${clampPercent(metric.percent)}%`}></span>
          </div>
          <p class="mt-1 text-[9.5px] text-muted-foreground/75">{metric.resetNote}</p>
        </section>
      {/each}
    {:else}
      <p class="rounded-lg bg-muted/60 p-3 text-[10.5px] leading-relaxed text-muted-foreground">
        {info.provider === "claude-code" ? "Claude Code 세션에서 상태 줄 연동이 실행되면 사용량이 표시됩니다." : "이 CLI는 신뢰할 수 있는 로컬 사용량 소스를 제공하지 않습니다."}
      </p>
    {/if}
  </div>

  <footer class="flex items-center gap-2 border-t px-3.5 py-2.5">
    <span class="text-[9.5px] text-muted-foreground">{info.tier ?? "CLI 계정"}</span>
    <button type="button" class="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-accent-share" onclick={openDashboard}>
      대시보드 열기 <ExternalLink class="size-3" />
    </button>
  </footer>
</div>
