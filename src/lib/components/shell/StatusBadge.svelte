<script lang="ts">
  import type { AgentStatus } from "$lib/types";
  import { statusLabels } from "$lib/data/labels";
  import { badgeClasses } from "./statusBadge";

  let { status }: { status: AgentStatus } = $props();
</script>

<span class={badgeClasses(status)}>{statusLabels[status]}</span>
