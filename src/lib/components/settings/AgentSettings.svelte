<script lang="ts">
  import type { AgentKind } from "$lib/types";
  import { agentKindDefaults, agentKindLabels } from "$lib/data/labels";
  import Terminal from "@lucide/svelte/icons/terminal";

  const kinds = Object.keys(agentKindLabels) as AgentKind[];
</script>

<div class="flex flex-col gap-5">
  <div class="rounded-[10px] border bg-muted/35 p-3 text-[11px] leading-relaxed text-muted-foreground">
    새 에이전트를 만들 때 종류를 선택하면 아래 커맨드가 자동으로 입력됩니다.
  </div>
  <section>
    <h2 class="mb-2 text-[11px] font-semibold text-muted-foreground">기본 실행 커맨드</h2>
    <div class="overflow-hidden rounded-[10px] border">
      {#each kinds as kind, index (kind)}
        <div class="flex h-11 items-center gap-3 px-3 {index < kinds.length - 1 ? 'border-b' : ''}">
          <Terminal class="size-3.5 text-muted-foreground" />
          <span class="w-24 text-[12px] font-medium">{agentKindLabels[kind]}</span>
          <code class="min-w-0 flex-1 rounded-md bg-background px-2.5 py-1.5 font-mono text-[10.5px] text-muted-foreground">$ {agentKindDefaults[kind]}</code>
        </div>
      {/each}
    </div>
  </section>
</div>
