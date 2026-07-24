<!-- 프롬프트/플레이북 라이브러리 관리: 추가·수정·삭제. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { promptStore } from "$lib/stores/prompts.svelte";
  import { t } from "$lib/i18n";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let draftTitle = $state("");
  let draftBody = $state("");
  let editingId = $state<string | null>(null);
  let editTitle = $state("");
  let editBody = $state("");
  let error = $state<string | null>(null);

  const prompts = $derived(promptStore.prompts);

  async function add() {
    if (!draftTitle.trim()) return;
    error = null;
    try {
      await promptStore.add(draftTitle.trim(), draftBody.trim());
      draftTitle = "";
      draftBody = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function startEdit(id: string, title: string, body: string) {
    editingId = id;
    editTitle = title;
    editBody = body;
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim()) return;
    error = null;
    try {
      await promptStore.update(editingId, editTitle.trim(), editBody.trim());
      editingId = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function remove(id: string) {
    error = null;
    try {
      await promptStore.remove(id);
      if (editingId === id) editingId = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(() => {
    void promptStore.load();
  });
</script>

<div class="flex flex-col gap-4">
  <div class="rounded-[10px] border bg-muted/35 p-3 text-[11px] leading-relaxed text-muted-foreground">
    {t("settings.prompts.intro")}
  </div>

  <section class="flex flex-col gap-2 rounded-[10px] border p-3">
    <h2 class="text-[11px] font-semibold text-muted-foreground">{t("settings.prompts.newHeading")}</h2>
    <Input bind:value={draftTitle} placeholder={t("settings.prompts.titlePlaceholder")} />
    <textarea
      class="h-20 w-full resize-none rounded-md border bg-input/40 px-2.5 py-2 text-[12px] outline-none focus:ring-1 focus:ring-ring"
      bind:value={draftBody}
      placeholder={t("settings.prompts.bodyPlaceholder")}
    ></textarea>
    <div class="flex justify-end">
      <Button size="sm" onclick={add} disabled={!draftTitle.trim()}>{t("common.save")}</Button>
    </div>
  </section>

  {#if error}
    <p class="text-xs text-destructive">{error}</p>
  {/if}

  <section class="flex flex-col gap-2">
    <h2 class="text-[11px] font-semibold text-muted-foreground">{t("settings.prompts.savedHeading", { count: prompts.length })}</h2>
    {#if prompts.length === 0}
      <p class="rounded-[10px] border border-dashed px-3 py-6 text-center text-[11px] text-muted-foreground">{t("settings.prompts.empty")}</p>
    {:else}
      <div class="flex flex-col gap-2">
        {#each prompts as prompt (prompt.id)}
          <div class="rounded-[10px] border p-3">
            {#if editingId === prompt.id}
              <Input bind:value={editTitle} class="mb-2" />
              <textarea
                class="mb-2 h-20 w-full resize-none rounded-md border bg-input/40 px-2.5 py-2 text-[12px] outline-none focus:ring-1 focus:ring-ring"
                bind:value={editBody}
              ></textarea>
              <div class="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onclick={() => (editingId = null)}>{t("common.cancel")}</Button>
                <Button size="sm" onclick={saveEdit} disabled={!editTitle.trim()}>{t("common.update")}</Button>
              </div>
            {:else}
              <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[12.5px] font-semibold">{prompt.title}</p>
                  {#if prompt.body}
                    <p class="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] text-muted-foreground">{prompt.body}</p>
                  {/if}
                </div>
                <button type="button" class="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("common.edit")} onclick={() => startEdit(prompt.id, prompt.title, prompt.body)}>
                  <Pencil class="size-3.5" />
                </button>
                <button type="button" class="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t("common.delete")} onclick={() => remove(prompt.id)}>
                  <Trash2 class="size-3.5" />
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
