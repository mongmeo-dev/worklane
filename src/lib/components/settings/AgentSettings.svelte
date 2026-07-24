<script lang="ts">
  import { agentKindStore } from "$lib/stores/agentKinds.svelte";
  import { autoCheckpoint } from "$lib/stores/autoCheckpoint.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Plus from "@lucide/svelte/icons/plus";

  let newLabel = $state("");
  let newCommand = $state("");
  let addError = $state("");

  function addKind() {
    const label = newLabel.trim();
    if (!label) {
      addError = "종류 이름을 입력해 주세요.";
      return;
    }
    agentKindStore.add(label, newCommand);
    newLabel = "";
    newCommand = "";
    addError = "";
  }
</script>

<div class="flex flex-col gap-5">
  <div class="rounded-[10px] border bg-muted/35 p-3 text-[11px] leading-relaxed text-muted-foreground">
    새 에이전트를 만들 때 종류를 선택하면 아래 실행 커맨드가 자동으로 입력됩니다. 종류를 직접 추가하거나 삭제하고, 이름·기본 커맨드를 바로 수정할 수 있습니다.
  </div>
  <section>
    <h2 class="mb-2 text-[11px] font-semibold text-muted-foreground">에이전트 종류</h2>
    <div class="overflow-hidden rounded-[10px] border">
      {#each agentKindStore.cliKinds as kind, index (kind.id)}
        <div class="flex items-center gap-2 px-3 py-2 {index < agentKindStore.cliKinds.length - 1 ? 'border-b' : ''}">
          <Input
            class="h-8 w-32 text-[12px] font-medium"
            value={kind.label}
            aria-label="종류 이름"
            onchange={(e) => agentKindStore.update(kind.id, { label: e.currentTarget.value })}
          />
          <div class="flex min-w-0 flex-1 items-center gap-1.5">
            <span class="select-none font-mono text-[11px] text-muted-foreground">$</span>
            <Input
              class="h-8 flex-1 font-mono text-[11px]"
              value={kind.defaultCommand}
              placeholder="실행 커맨드"
              aria-label="기본 실행 커맨드"
              onchange={(e) => agentKindStore.update(kind.id, { defaultCommand: e.currentTarget.value })}
            />
          </div>
          <button
            type="button"
            class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`${kind.label} 삭제`}
            onclick={() => agentKindStore.remove(kind.id)}
          >
            <Trash2 class="size-3.5" />
          </button>
        </div>
      {/each}
      {#if agentKindStore.cliKinds.length === 0}
        <p class="px-3 py-4 text-center text-[11px] text-muted-foreground">
          등록된 에이전트 종류가 없습니다. 아래에서 새 종류를 추가하세요.
        </p>
      {/if}
    </div>

    <div class="mt-2 flex items-end gap-2">
      <Input
        class="h-9 w-32 text-[12px]"
        bind:value={newLabel}
        placeholder="이름 (예: Aider)"
        aria-label="새 종류 이름"
        onkeydown={(e) => e.key === "Enter" && addKind()}
      />
      <Input
        class="h-9 flex-1 font-mono text-[11px]"
        bind:value={newCommand}
        placeholder="실행 커맨드 (예: aider)"
        aria-label="새 종류 실행 커맨드"
        onkeydown={(e) => e.key === "Enter" && addKind()}
      />
      <Button class="h-9 shrink-0 gap-1" onclick={addKind}>
        <Plus class="size-3.5" />추가
      </Button>
    </div>
    {#if addError}
      <p class="mt-1.5 text-[11px] text-destructive">{addError}</p>
    {/if}
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
