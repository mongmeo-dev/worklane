<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import type { Agent } from "$lib/types";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { agentWorktreeHasChanges } from "$lib/ipc/projects";
  import { uiSettings } from "$lib/stores/uiSettings.svelte";

  let { open = $bindable(false), agent }: { open?: boolean; agent: Agent } = $props();

  let hasChanges = $state(false);
  let dontAskAgain = $state(false);
  let error = $state("");
  let loading = $state(false);

  // 다이얼로그가 열릴 때 변경 유무 조회
  $effect(() => {
    if (open && agent) {
      loading = true;
      agentWorktreeHasChanges(agent.id)
        .then((v) => (hasChanges = v))
        .catch(() => (hasChanges = false))
        .finally(() => (loading = false));
    }
  });

  async function confirm(force: boolean) {
    error = "";
    try {
      await projectStore.removeAgent(agent.id, agent.worktreeManaged, force);
      if (dontAskAgain) uiSettings.skipWorktreeDeletePrompt = true;
      open = false;
    } catch (e) {
      // WORKTREE_DIRTY면 강제 삭제 재확인은 버튼으로 처리
      error = String(e);
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>에이전트 삭제</Dialog.Title>
      <Dialog.Description>
        "{agent.title}"을(를) 삭제합니다.
        {#if agent.worktreeManaged}
          앱이 생성한 worktree({agent.branch})도 함께 제거됩니다.
        {/if}
      </Dialog.Description>
    </Dialog.Header>
    {#if hasChanges}
      <p class="text-xs text-amber-600">이 worktree에 커밋되지 않은 변경사항이 있습니다.</p>
    {/if}
    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}
    <div class="flex items-center gap-2 py-1">
      <Checkbox id="dont-ask" bind:checked={dontAskAgain} />
      <Label for="dont-ask" class="text-xs">다음부터 묻지 않고 자동으로 안전 제거</Label>
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>취소</Button>
      {#if hasChanges}
        <Button variant="destructive" disabled={loading} onclick={() => confirm(true)}>강제 삭제</Button>
      {:else}
        <Button variant="destructive" disabled={loading} onclick={() => confirm(false)}>삭제</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
