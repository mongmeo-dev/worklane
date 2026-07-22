<script lang="ts">
  import type { AgentStatus } from "$lib/types";
  import { statusLabels } from "$lib/data/labels";

  interface Props {
    status: AgentStatus;
    showLabel?: boolean;
  }

  let { status, showLabel = false }: Props = $props();

  // 상태별 점 색상 (Tailwind 클래스). running은 은은한 펄스 애니메이션을 준다.
  const dotClass: Record<AgentStatus, string> = {
    running: "bg-emerald-500 animate-pulse",
    idle: "bg-zinc-400",
    blocked: "bg-amber-500",
    done: "bg-sky-500",
  };
</script>

<span class="inline-flex items-center gap-1.5">
  <span class="size-2 rounded-full {dotClass[status]}"></span>
  {#if showLabel}
    <span class="text-xs text-muted-foreground">{statusLabels[status]}</span>
  {/if}
</span>
