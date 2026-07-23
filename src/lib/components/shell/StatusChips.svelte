<script lang="ts">
  import type { AgentStatus } from "$lib/types";
  import type { StatusCounts } from "$lib/shell/derived";
  import type { OverviewFilter } from "$lib/stores/shell.svelte";
  import { shell } from "$lib/stores/shell.svelte";

  let { counts }: { counts: StatusCounts } = $props();

  const chips: { status: AgentStatus; filter: OverviewFilter; label: string; className: string }[] = [
    { status: "running", filter: "running", label: "실행 중", className: "text-status-running-fg border-status-running/25 bg-status-running/10" },
    { status: "blocked", filter: "blocked", label: "입력 대기", className: "text-status-blocked-fg border-status-blocked/30 bg-status-blocked/10" },
    { status: "idle", filter: "all", label: "대기", className: "text-status-idle border-status-idle/25 bg-status-idle/10" },
    { status: "done", filter: "done", label: "완료", className: "text-status-done-fg border-status-done/25 bg-status-done/10" },
  ];
</script>

<nav class="flex items-center gap-1.5" aria-label="전체 에이전트 상태">
  {#each chips as chip (chip.status)}
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-medium transition-[filter,background-color] hover:brightness-125 {chip.className}"
      aria-label={`${chip.label} ${counts[chip.status]}개 보기`}
      onclick={() => shell.setFilter(chip.filter)}
    >
      <span class="size-1.5 rounded-full bg-current {chip.status === 'blocked' ? 'status-ring-anim animate-[status-ring-pulse_1.8s_ease-out_infinite]' : ''}"></span>
      {counts[chip.status]} {chip.label}
    </button>
  {/each}
</nav>
