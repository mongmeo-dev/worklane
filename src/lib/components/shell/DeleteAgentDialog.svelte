<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import type { Agent } from "$lib/types";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { agentWorktreeHasChanges } from "$lib/ipc/projects";
  import { uiSettings } from "$lib/stores/uiSettings.svelte";
  import { t } from "$lib/i18n";

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
      <Dialog.Title>{t("deleteAgent.title")}</Dialog.Title>
      <Dialog.Description>
        {t("deleteAgent.desc", { title: agent.title })}
        {#if agent.worktreeManaged}
          {t("deleteAgent.worktreeNote", { branch: agent.branch })}
        {/if}
      </Dialog.Description>
    </Dialog.Header>
    {#if hasChanges}
      <p class="text-xs text-amber-600">{t("deleteAgent.hasChanges")}</p>
    {/if}
    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}
    <div class="flex items-center gap-2 py-1">
      <Checkbox id="dont-ask" bind:checked={dontAskAgain} />
      <Label for="dont-ask" class="text-xs">{t("deleteAgent.dontAsk")}</Label>
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>{t("common.cancel")}</Button>
      {#if hasChanges}
        <Button variant="destructive" disabled={loading} onclick={() => confirm(true)}>{t("deleteAgent.force")}</Button>
      {:else}
        <Button variant="destructive" disabled={loading} onclick={() => confirm(false)}>{t("common.delete")}</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
