<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import type { Project } from "$lib/types";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { t } from "$lib/i18n";

  let { open = $bindable(false), project }: { open?: boolean; project: Project } = $props();

  let error = $state("");
  let loading = $state(false);

  async function confirm() {
    error = "";
    loading = true;
    try {
      await projectStore.removeProject(project.id);
      open = false;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{t("deleteProject.title")}</Dialog.Title>
      <Dialog.Description>
        {t("deleteProject.desc", { name: project.name, count: project.agents.length })}
      </Dialog.Description>
    </Dialog.Header>
    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>{t("common.cancel")}</Button>
      <Button variant="destructive" disabled={loading} onclick={confirm}>{t("common.delete")}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
