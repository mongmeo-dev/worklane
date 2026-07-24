<script lang="ts">
  import { agentKindDefaults, agentKindLabels, cliAgentKinds } from "$lib/data/labels";
  import Terminal from "@lucide/svelte/icons/terminal";
  import { autoCheckpoint } from "$lib/stores/autoCheckpoint.svelte";

  const kinds = cliAgentKinds;
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

  <section>
    <h2 class="mb-2 text-[11px] font-semibold text-muted-foreground">자동 체크포인트</h2>
    <label class="flex items-center gap-3 rounded-[10px] border p-3">
      <input
        type="checkbox"
        class="size-4 accent-primary"
        checked={autoCheckpoint.enabled}
        onchange={(e) => autoCheckpoint.setEnabled(e.currentTarget.checked)}
      />
      <div class="min-w-0 flex-1">
        <p class="text-[12px] font-medium">완료 시 자동 저장</p>
        <p class="mt-0.5 text-[10.5px] text-muted-foreground">에이전트가 작업을 마치면 worktree 상태를 체크포인트로 저장합니다. 되돌리기 전에도 항상 자동 저장됩니다.</p>
      </div>
    </label>
  </section>
</div>
