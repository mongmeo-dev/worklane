<script lang="ts">
  import { onMount } from "svelte";
  import type { UsageInfo } from "$lib/ipc/usage";
  import type { SystemResources } from "$lib/ipc/system";
  import { disconnectedUsage, installClaudeStatusline, readClaudeUsage, readCodexUsage } from "$lib/ipc/usage";
  import { readSystemResources } from "$lib/ipc/system";
  import { shell } from "$lib/stores/shell.svelte";
  import { clampPercent, gaugeColorClass, gaugeTextClass, resourceLabel } from "$lib/usage/display";
  import { overBudget } from "$lib/usage/budget";
  import { budget } from "$lib/stores/budget.svelte";
  import { sendAttentionNotification } from "$lib/ipc/notify";
  import { notifyWebhook } from "$lib/ipc/webhook";
  import { integrations } from "$lib/stores/integrations.svelte";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import UsagePopover from "./UsagePopover.svelte";

  let root: HTMLElement;
  let usage = $state<UsageInfo[]>([
    disconnectedUsage("claude-code", "Claude Code", "Anthropic 계정"),
    disconnectedUsage("codex", "Codex CLI", "OpenAI 계정"),
    disconnectedUsage("cursor", "Cursor CLI", "Cursor 계정"),
    disconnectedUsage("gemini", "Gemini CLI", "Google 계정"),
  ]);
  let resources = $state<SystemResources>({ cpuPercent: 0, ramUsedGb: 0, ramTotalGb: 0 });
  const ramPercent = $derived(resources.ramTotalGb > 0 ? (resources.ramUsedGb / resources.ramTotalGb) * 100 : 0);

  const shortLabels: Record<UsageInfo["provider"], string> = {
    "claude-code": "CLAUDE",
    codex: "CODEX",
    cursor: "CURSOR",
    gemini: "GEMINI",
  };

  async function refreshUsage() {
    const [claude, codex] = await Promise.allSettled([readClaudeUsage(), readCodexUsage()]);
    const next = [...usage];
    if (claude.status === "fulfilled") next[0] = claude.value;
    if (codex.status === "fulfilled") next[1] = codex.value;
    usage = next;
    notifyBudgetCrossings(next);
  }

  const prevOver: Record<string, boolean> = {};

  /** 예산 임계값을 새로 넘은 제공자에 대해서만 OS 알림을 보낸다. */
  function notifyBudgetCrossings(list: UsageInfo[]) {
    for (const info of list) {
      const over = info.connected && overBudget(info.primaryPercent, budget.threshold);
      if (over && !prevOver[info.provider] && info.primaryPercent !== null) {
        const title = `${info.fullName} 사용량 ${Math.round(info.primaryPercent)}%`;
        const body = `예산 임계값 ${budget.threshold}%를 넘었습니다.`;
        void sendAttentionNotification(title, body);
        notifyWebhook(integrations.webhookUrl, `${title} — ${body}`);
      }
      prevOver[info.provider] = over;
    }
  }

  async function initializeUsage() {
    try {
      await installClaudeStatusline();
    } catch {
      // 권한이나 설정 형식 문제는 Claude 항목의 미연동 상태로 표현한다.
    }
    await refreshUsage();
  }

  async function refreshResources() {
    try {
      resources = await readSystemResources();
    } catch {
      // 일시 실패 시 마지막 성공 값을 유지한다.
    }
  }

  function outsideClick(event: MouseEvent) {
    if (root && event.target instanceof Node && !root.contains(event.target)) shell.closeUsagePopover();
  }

  onMount(() => {
    void initializeUsage();
    void refreshResources();
    const usageTimer = window.setInterval(refreshUsage, 30_000);
    const resourceTimer = window.setInterval(refreshResources, 5_000);
    window.addEventListener("click", outsideClick);
    return () => {
      window.clearInterval(usageTimer);
      window.clearInterval(resourceTimer);
      window.removeEventListener("click", outsideClick);
    };
  });
</script>

<footer bind:this={root} class="flex h-[30px] shrink-0 items-center border-t bg-sidebar px-2 text-[9.5px] text-sidebar-foreground">
  <span class="px-1.5 font-semibold text-muted-foreground">사용량</span>
  <div class="flex min-w-0 items-center gap-0.5">
    {#each usage as info (info.provider)}
      <div class="relative">
        <button
          type="button"
          class="flex h-6 items-center gap-1.5 rounded-[7px] px-2 hover:bg-sidebar-accent {shell.usagePopover === info.provider ? 'bg-sidebar-accent' : ''}"
          aria-expanded={shell.usagePopover === info.provider}
          onclick={() => shell.toggleUsagePopover(info.provider)}
        >
          <span class="font-mono text-[9px] font-semibold text-muted-foreground">{shortLabels[info.provider]}</span>
          {#if info.connected && info.primaryPercent !== null}
            <span class="h-1 w-14 overflow-hidden rounded-full bg-muted">
              <span class="block h-full rounded-full {gaugeColorClass(info.primaryPercent)}" style:width={`${clampPercent(info.primaryPercent)}%`}></span>
            </span>
            <span class="font-mono font-semibold {gaugeTextClass(info.primaryPercent)}">{Math.round(info.primaryPercent)}%</span>
            {#if overBudget(info.primaryPercent, budget.threshold)}
              <TriangleAlert class="size-3 text-status-blocked-fg" aria-label={`예산 ${budget.threshold}% 초과`} />
            {/if}
            <span class="hidden max-w-28 truncate text-muted-foreground/70 2xl:inline">{info.primaryReset ?? "초기화 시점 미확인"}</span>
          {:else}
            <span class="rounded-full bg-muted px-1.5 py-0.5 text-[8.5px] text-muted-foreground">연동 안 됨</span>
          {/if}
        </button>
        {#if shell.usagePopover === info.provider}<UsagePopover {info} />{/if}
      </div>
    {/each}
  </div>

  <div class="ml-auto flex items-center gap-3 px-1.5">
    <div class="flex items-center gap-1.5">
      <span class="font-mono text-[9px] text-muted-foreground">CPU</span>
      <span class="h-1 w-12 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full {gaugeColorClass(resources.cpuPercent)}" style:width={`${clampPercent(resources.cpuPercent)}%`}></span></span>
      <span class="font-mono font-semibold {gaugeTextClass(resources.cpuPercent)}">{Math.round(resources.cpuPercent)}%</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="font-mono text-[9px] text-muted-foreground">RAM</span>
      <span class="h-1 w-12 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full {gaugeColorClass(ramPercent)}" style:width={`${clampPercent(ramPercent)}%`}></span></span>
      <span class="font-mono font-semibold {gaugeTextClass(ramPercent)}">{resources.ramTotalGb > 0 ? resourceLabel(resources.ramUsedGb, resources.ramTotalGb) : "—"}</span>
    </div>
  </div>
</footer>
