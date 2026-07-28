<script lang="ts">
  import type { AgentStatus } from "$lib/types";
  import type { StatusCounts } from "$lib/shell/derived";
  import type { OverviewFilter } from "$lib/stores/shell.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { statusLabel } from "$lib/data/labels";
  import { t } from "$lib/i18n";

  let { counts }: { counts: StatusCounts } = $props();

  const chips: { status: AgentStatus; filter: OverviewFilter; className: string }[] = [
    { status: "failed", filter: "failed", className: "text-destructive border-destructive/30 bg-destructive/10" },
    { status: "running", filter: "running", className: "text-status-running-fg border-status-running/25 bg-status-running/10" },
    { status: "blocked", filter: "blocked", className: "text-status-blocked-fg border-status-blocked/30 bg-status-blocked/10" },
    { status: "idle", filter: "all", className: "text-status-idle border-status-idle/25 bg-status-idle/10" },
    { status: "done", filter: "done", className: "text-status-done-fg border-status-done/25 bg-status-done/10" },
  ];
</script>

<nav class="flex items-center gap-1.5" aria-label={t("statusChips.nav")}>
  {#each chips as chip (chip.status)}
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-2xs font-medium transition-[filter,background-color] hover:brightness-125 {chip.className}"
      aria-label={t("statusChips.view", { count: counts[chip.status], label: statusLabel(chip.status) })}
      onclick={() => shell.setFilter(chip.filter)}
    >
      <span class="size-1.5 rounded-full bg-current {chip.status === 'blocked' ? 'status-ring-anim animate-[status-ring-pulse_1.8s_ease-out_infinite]' : ''}"></span>
      {counts[chip.status]} {statusLabel(chip.status)}
    </button>
  {/each}
</nav>
