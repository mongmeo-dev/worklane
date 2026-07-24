<!-- src/lib/components/shell/ProjectDialog.svelte -->
<!-- 프로젝트 추가 다이얼로그: 이름 입력 + 네이티브 디렉토리 선택. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { agentKindStore } from "$lib/stores/agentKinds.svelte";
  import type { AgentKind } from "$lib/types";
  import { t } from "$lib/i18n";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let name = $state("");
  let path = $state("");
  let error = $state("");
  let kind = $state<AgentKind>(agentKindStore.selectableKindIds[0]);
  let submitting = $state(false);

  async function pickDir() {
    const selected = await openDialog({ directory: true });
    if (typeof selected === "string") {
      path = selected;
      if (!name) name = selected.split("/").pop() ?? "";
    }
  }

  async function submit() {
    if (submitting) return;
    error = "";
    submitting = true;
    try {
      const project = await projectStore.addProject(
        name.trim(),
        path.trim(),
        kind,
        agentKindStore.defaultCommandOf(kind),
      );
      const defaultAgent = project.agents[0];
      if (defaultAgent) shell.selectAgent(defaultAgent.id);
      open = false;
      name = "";
      path = "";
      kind = agentKindStore.selectableKindIds[0];
    } catch (e) {
      error = String(e);
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{t("projectDialog.title")}</Dialog.Title>
    </Dialog.Header>
    <div class="flex flex-col gap-3 py-2">
      <div class="flex flex-col gap-1.5">
        <Label for="proj-name">{t("projectDialog.name")}</Label>
        <Input id="proj-name" bind:value={name} placeholder={t("projectDialog.namePlaceholder")} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>{t("projectDialog.firstAgent")}</Label>
        <Select.Root
          type="single"
          value={kind}
          onValueChange={(value) => (kind = value as AgentKind)}
        >
          <Select.Trigger>{agentKindStore.labelOf(kind)}</Select.Trigger>
          <Select.Content>
            {#each agentKindStore.selectableKindIds as value (value)}
              <Select.Item value={value}>{agentKindStore.labelOf(value)}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="text-[10px] text-muted-foreground">
          {t("projectDialog.firstAgentNote")}
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="proj-path">{t("projectDialog.path")}</Label>
        <div class="flex gap-2">
          <Input id="proj-path" bind:value={path} placeholder={t("projectDialog.pathPlaceholder")} readonly />
          <Button variant="secondary" onclick={pickDir}>{t("common.select")}</Button>
        </div>
      </div>
      {#if error}
        <p class="text-xs text-destructive">{error}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button onclick={submit} disabled={submitting || !name.trim() || !path.trim()}>
        {submitting ? t("common.adding") : t("common.add")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
