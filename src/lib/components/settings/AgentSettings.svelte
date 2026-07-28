<script lang="ts">
  import { agentKindStore } from "$lib/stores/agentKinds.svelte";
  import { autoCheckpoint } from "$lib/stores/autoCheckpoint.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { t } from "$lib/i18n";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Plus from "@lucide/svelte/icons/plus";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";

  let newLabel = $state("");
  let newCommand = $state("");
  let addError = $state("");

  function addKind() {
    const label = newLabel.trim();
    if (!label) {
      addError = t("agentKind.nameRequired");
      return;
    }
    agentKindStore.add(label, newCommand);
    newLabel = "";
    newCommand = "";
    addError = "";
  }

  // 드래그 앤 드롭으로 종류 순서를 바꾼다. dragIndex는 잡은 항목, overIndex는 현재 놓을 위치.
  let dragIndex = $state<number | null>(null);
  let overIndex = $state<number | null>(null);

  function onDragStart(e: DragEvent, index: number) {
    dragIndex = index;
    overIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      // Firefox는 데이터가 설정되어야 드래그를 시작한다.
      e.dataTransfer.setData("text/plain", String(index));
    }
  }

  function onDragOver(e: DragEvent, index: number) {
    if (dragIndex === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    overIndex = index;
  }

  function onDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex !== null) agentKindStore.reorder(dragIndex, index);
    dragIndex = null;
    overIndex = null;
  }

  function onDragEnd() {
    dragIndex = null;
    overIndex = null;
  }

  // 드래그가 어려운 사용자를 위한 키보드 대체: 핸들에 포커스 후 위/아래 화살표로 이동.
  function onHandleKeydown(e: KeyboardEvent, index: number) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      agentKindStore.reorder(index, index - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      agentKindStore.reorder(index, index + 1);
    }
  }
</script>

<div class="flex flex-col gap-5">
  <div class="rounded-[10px] border bg-muted/35 p-3 text-xs leading-relaxed text-muted-foreground">
    {t("settings.agents.intro")}
  </div>
  <section>
    <h2 class="mb-2 text-xs font-semibold text-muted-foreground">{t("settings.agents.kindsHeading")}</h2>
    <div class="overflow-hidden rounded-[10px] border" role="list">
      {#each agentKindStore.cliKinds as kind, index (kind.id)}
        <div
          class="flex items-center gap-2 px-3 py-2 {index < agentKindStore.cliKinds.length - 1 ? 'border-b' : ''} {dragIndex === index ? 'opacity-40' : ''} {overIndex === index && dragIndex !== null && dragIndex !== index ? 'bg-accent/60' : ''}"
          role="listitem"
          ondragover={(e) => onDragOver(e, index)}
          ondrop={(e) => onDrop(e, index)}
        >
          <button
            type="button"
            draggable="true"
            class="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
            aria-label={t("settings.agents.dragHandle", { label: kind.label })}
            ondragstart={(e) => onDragStart(e, index)}
            ondragend={onDragEnd}
            onkeydown={(e) => onHandleKeydown(e, index)}
          >
            <GripVertical class="size-4" />
          </button>
          <Input
            class="h-8 w-32 text-sm font-medium"
            value={kind.label}
            aria-label={t("settings.agents.kindNameLabel")}
            onchange={(e) => agentKindStore.update(kind.id, { label: e.currentTarget.value })}
          />
          <div class="flex min-w-0 flex-1 items-center gap-1.5">
            <span class="select-none font-mono text-xs text-muted-foreground">$</span>
            <Input
              class="h-8 flex-1 font-mono text-xs"
              value={kind.defaultCommand}
              placeholder={t("settings.agents.commandPlaceholder")}
              aria-label={t("settings.agents.defaultCommandLabel")}
              onchange={(e) => agentKindStore.update(kind.id, { defaultCommand: e.currentTarget.value })}
            />
          </div>
          <button
            type="button"
            class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={t("settings.agents.removeKind", { label: kind.label })}
            onclick={() => agentKindStore.remove(kind.id)}
          >
            <Trash2 class="size-3.5" />
          </button>
        </div>
      {/each}
      {#if agentKindStore.cliKinds.length === 0}
        <p class="px-3 py-4 text-center text-xs text-muted-foreground">
          {t("settings.agents.empty")}
        </p>
      {/if}
    </div>

    <div class="mt-2 flex items-end gap-2">
      <Input
        class="h-9 w-32 text-sm"
        bind:value={newLabel}
        placeholder={t("settings.agents.newNamePlaceholder")}
        aria-label={t("settings.agents.newNameLabel")}
        onkeydown={(e) => e.key === "Enter" && addKind()}
      />
      <Input
        class="h-9 flex-1 font-mono text-xs"
        bind:value={newCommand}
        placeholder={t("settings.agents.newCommandPlaceholder")}
        aria-label={t("settings.agents.newCommandLabel")}
        onkeydown={(e) => e.key === "Enter" && addKind()}
      />
      <Button class="h-9 shrink-0 gap-1" onclick={addKind}>
        <Plus class="size-3.5" />{t("common.add")}
      </Button>
    </div>
    {#if addError}
      <p class="mt-1.5 text-xs text-destructive">{addError}</p>
    {/if}
  </section>

  <section>
    <h2 class="mb-2 text-xs font-semibold text-muted-foreground">{t("settings.agents.autoCheckpointHeading")}</h2>
    <label class="flex items-center gap-3 rounded-[10px] border p-3">
      <input
        type="checkbox"
        class="size-4 accent-primary"
        checked={autoCheckpoint.enabled}
        onchange={(e) => autoCheckpoint.setEnabled(e.currentTarget.checked)}
      />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">{t("settings.agents.autoSaveTitle")}</p>
        <p class="mt-0.5 text-2xs text-muted-foreground">{t("settings.agents.autoSaveDesc")}</p>
      </div>
    </label>
  </section>
</div>
