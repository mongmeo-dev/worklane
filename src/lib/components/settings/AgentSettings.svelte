<script lang="ts">
  import { agentKindStore } from "$lib/stores/agentKinds.svelte";
  import { autoCheckpoint } from "$lib/stores/autoCheckpoint.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { t } from "$lib/i18n";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Plus from "@lucide/svelte/icons/plus";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

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
</script>

<div class="flex flex-col gap-5">
  <div class="rounded-[10px] border bg-muted/35 p-3 text-[11px] leading-relaxed text-muted-foreground">
    {t("settings.agents.intro")}
  </div>
  <section>
    <h2 class="mb-2 text-[11px] font-semibold text-muted-foreground">{t("settings.agents.kindsHeading")}</h2>
    <div class="overflow-hidden rounded-[10px] border">
      {#each agentKindStore.cliKinds as kind, index (kind.id)}
        <div class="flex items-center gap-2 px-3 py-2 {index < agentKindStore.cliKinds.length - 1 ? 'border-b' : ''}">
          <Input
            class="h-8 w-32 text-[12px] font-medium"
            value={kind.label}
            aria-label={t("settings.agents.kindNameLabel")}
            onchange={(e) => agentKindStore.update(kind.id, { label: e.currentTarget.value })}
          />
          <div class="flex min-w-0 flex-1 items-center gap-1.5">
            <span class="select-none font-mono text-[11px] text-muted-foreground">$</span>
            <Input
              class="h-8 flex-1 font-mono text-[11px]"
              value={kind.defaultCommand}
              placeholder={t("settings.agents.commandPlaceholder")}
              aria-label={t("settings.agents.defaultCommandLabel")}
              onchange={(e) => agentKindStore.update(kind.id, { defaultCommand: e.currentTarget.value })}
            />
          </div>
          <div class="flex shrink-0 flex-col">
            <button
              type="button"
              class="flex h-4 w-6 items-center justify-center rounded-t-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              aria-label={t("settings.agents.moveUpKind", { label: kind.label })}
              disabled={index === 0}
              onclick={() => agentKindStore.move(kind.id, -1)}
            >
              <ChevronUp class="size-3.5" />
            </button>
            <button
              type="button"
              class="flex h-4 w-6 items-center justify-center rounded-b-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              aria-label={t("settings.agents.moveDownKind", { label: kind.label })}
              disabled={index === agentKindStore.cliKinds.length - 1}
              onclick={() => agentKindStore.move(kind.id, 1)}
            >
              <ChevronDown class="size-3.5" />
            </button>
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
        <p class="px-3 py-4 text-center text-[11px] text-muted-foreground">
          {t("settings.agents.empty")}
        </p>
      {/if}
    </div>

    <div class="mt-2 flex items-end gap-2">
      <Input
        class="h-9 w-32 text-[12px]"
        bind:value={newLabel}
        placeholder={t("settings.agents.newNamePlaceholder")}
        aria-label={t("settings.agents.newNameLabel")}
        onkeydown={(e) => e.key === "Enter" && addKind()}
      />
      <Input
        class="h-9 flex-1 font-mono text-[11px]"
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
      <p class="mt-1.5 text-[11px] text-destructive">{addError}</p>
    {/if}
  </section>

  <section>
    <h2 class="mb-2 text-[11px] font-semibold text-muted-foreground">{t("settings.agents.autoCheckpointHeading")}</h2>
    <label class="flex items-center gap-3 rounded-[10px] border p-3">
      <input
        type="checkbox"
        class="size-4 accent-primary"
        checked={autoCheckpoint.enabled}
        onchange={(e) => autoCheckpoint.setEnabled(e.currentTarget.checked)}
      />
      <div class="min-w-0 flex-1">
        <p class="text-[12px] font-medium">{t("settings.agents.autoSaveTitle")}</p>
        <p class="mt-0.5 text-[10.5px] text-muted-foreground">{t("settings.agents.autoSaveDesc")}</p>
      </div>
    </label>
  </section>
</div>
