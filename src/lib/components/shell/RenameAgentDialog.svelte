<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { t } from "$lib/i18n";
  import { projectStore } from "$lib/stores/projects.svelte";
  import type { Agent } from "$lib/types";

  let { open = $bindable(false), agent }: { open?: boolean; agent: Agent } = $props();

  let title = $state("");
  let submitting = $state(false);
  let error = $state(false);
  let previousAgentId = $state("");
  let previousOpen = $state(open);
  let operationGeneration = 0;

  $effect(() => {
    const agentChanged = agent.id !== previousAgentId;
    const openChanged = open !== previousOpen;

    if (agentChanged || openChanged) {
      operationGeneration += 1;
      title = agent.title;
      submitting = false;
      error = false;
      previousAgentId = agent.id;
      previousOpen = open;
    }
  });

  async function submit() {
    const nextTitle = title.trim();
    if (!nextTitle || submitting) return;

    const submittedAgentId = agent.id;
    const generation = ++operationGeneration;
    submitting = true;
    error = false;

    const isCurrentOperation = () =>
      generation === operationGeneration && submittedAgentId === agent.id && open;

    try {
      await projectStore.patchAgentTitle(submittedAgentId, nextTitle);
      if (isCurrentOperation()) open = false;
    } catch {
      if (isCurrentOperation()) error = true;
    } finally {
      if (isCurrentOperation()) submitting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{t("renameAgent.title")}</Dialog.Title>
    </Dialog.Header>
    <form class="flex flex-col gap-3 py-2" onsubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div class="flex flex-col gap-1.5">
        <Label for="rename-agent-title">{t("renameAgent.name")}</Label>
        <Input id="rename-agent-title" bind:value={title} placeholder={t("renameAgent.namePlaceholder")} disabled={submitting} aria-invalid={error} aria-describedby={error ? "rename-agent-error" : undefined} />
      </div>
      {#if error}
        <p id="rename-agent-error" role="alert" class="text-xs text-destructive">{t("renameAgent.error")}</p>
      {/if}
      <Dialog.Footer>
        <Button type="submit" disabled={!title.trim() || submitting}>
          {submitting ? t("renameAgent.saving") : t("common.save")}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
