<script lang="ts">
  import type { AgentStatus } from "$lib/types";
  import { statusLabels } from "$lib/data/labels";
  import { dotClasses } from "./statusDot";

  interface Props {
    status: AgentStatus;
    size?: number;
    showLabel?: boolean;
  }

  let { status, size = 8, showLabel = false }: Props = $props();
</script>

<span class="inline-flex items-center gap-1.5">
  <span
    class="shrink-0 rounded-full {dotClasses(status)}"
    style="width:{size}px;height:{size}px"
  ></span>
  {#if showLabel}
    <span class="text-xs text-muted-foreground">{statusLabels[status]}</span>
  {/if}
</span>
