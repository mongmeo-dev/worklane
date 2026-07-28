<script lang="ts">
  import type { UsageInfo } from "$lib/ipc/usage";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { clampPercent, gaugeColorClass, gaugeTextClass } from "$lib/usage/display";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { t } from "$lib/i18n";

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

<div class="absolute bottom-[calc(100%+8px)] left-0 z-40 w-64 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl" role="dialog" aria-label={t("usagePopover.detailAria", { name: info.fullName })}>
  <header class="border-b px-3.5 py-3">
    <div class="flex items-center gap-2">
      <h2 class="text-sm font-semibold">{info.fullName}</h2>
      <span class="rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground">{info.plan ?? (info.connected ? t("usagePopover.planUnknown") : t("usage.notConnected"))}</span>
    </div>
    <p class="mt-1 truncate font-mono text-2xs text-muted-foreground">{info.account ?? t("usagePopover.accountUnknown")}</p>
  </header>

  <div class="flex flex-col gap-3 p-3.5">
    {#if info.metrics.length > 0}
      {#each info.metrics as metric (metric.label)}
        <section>
          <div class="flex items-center gap-2 text-2xs">
            <span class="min-w-0 flex-1 truncate text-muted-foreground">{metric.label}</span>
            <span class="font-mono font-semibold {gaugeTextClass(metric.percent)}">{metric.valueText}</span>
          </div>
          <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <span class="block h-full rounded-full {gaugeColorClass(metric.percent)}" style:width={`${clampPercent(metric.percent)}%`}></span>
          </div>
          <p class="mt-1 text-2xs text-muted-foreground">{metric.resetNote}</p>
        </section>
      {/each}
    {:else}
      <p class="rounded-lg bg-muted/60 p-3 text-2xs leading-relaxed text-muted-foreground">
        {info.provider === "claude-code" ? t("usagePopover.claudeHint") : t("usagePopover.noSource")}
      </p>
    {/if}
  </div>

  <footer class="flex items-center gap-2 border-t px-3.5 py-2.5">
    <span class="text-2xs text-muted-foreground">{info.tier ?? t("usagePopover.cliAccount")}</span>
    <button type="button" class="ml-auto inline-flex items-center gap-1 text-2xs font-semibold text-accent-share" onclick={openDashboard}>
      {t("usagePopover.openDashboard")} <ExternalLink class="size-3" />
    </button>
  </footer>
</div>
