<!-- 크로스 프로젝트 태스크 보드: 프로젝트를 가로질러 계획하고, 태스크에서 팬아웃으로 실행을 연결한다. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import type { Project } from "$lib/types";
  import type { Task, TaskStatus } from "$lib/ipc/tasks";
  import { taskStore } from "$lib/stores/tasks.svelte";
  import { composer } from "$lib/stores/composer.svelte";
  import { t, type MessageKey } from "$lib/i18n";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import GitFork from "@lucide/svelte/icons/git-fork";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let { open = $bindable(false), projects }: { open?: boolean; projects: Project[] } = $props();

  const STATUSES: { id: TaskStatus; labelKey: MessageKey }[] = [
    { id: "todo", labelKey: "taskBoard.status.todo" },
    { id: "doing", labelKey: "taskBoard.status.doing" },
    { id: "done", labelKey: "taskBoard.status.done" },
  ];

  let newTitle = $state("");
  let newNotes = $state("");
  let newProject = $state("");
  let error = $state<string | null>(null);

  let editingId = $state<string | null>(null);
  let editTitle = $state("");
  let editNotes = $state("");

  const tasks = $derived(taskStore.tasks);

  function projectName(projectId: string | null): string | null {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.name ?? null;
  }

  function byStatus(status: TaskStatus): Task[] {
    return tasks.filter((t) => t.status === status);
  }

  async function add() {
    if (!newTitle.trim()) return;
    error = null;
    try {
      await taskStore.add(newProject || null, newTitle.trim(), newNotes.trim());
      newTitle = "";
      newNotes = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function move(task: Task, dir: -1 | 1) {
    const index = STATUSES.findIndex((s) => s.id === task.status);
    const next = STATUSES[index + dir];
    if (next) void taskStore.setStatus(task.id, next.id);
  }

  function start(task: Task) {
    composer.openFanout({ projectId: task.projectId, title: task.title, prompt: task.notes });
    if (task.status === "todo") void taskStore.setStatus(task.id, "doing");
    open = false;
  }

  function startEdit(task: Task) {
    editingId = task.id;
    editTitle = task.title;
    editNotes = task.notes;
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim()) return;
    await taskStore.edit(editingId, editTitle.trim(), editNotes.trim());
    editingId = null;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="w-[860px] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[14px] p-0 sm:max-w-[860px]">
    <Dialog.Header class="border-b px-5 py-3.5">
      <Dialog.Title class="text-[14px] font-semibold">{t("taskBoard.title")}</Dialog.Title>
      <Dialog.Description class="text-[11px]">{t("taskBoard.desc")}</Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-5 py-2.5">
      <Input class="h-8 min-w-40 flex-1 text-[12px]" bind:value={newTitle} placeholder={t("taskBoard.newTitle")} onkeydown={(e) => e.key === "Enter" && add()} />
      <Input class="h-8 min-w-40 flex-[2] text-[12px]" bind:value={newNotes} placeholder={t("taskBoard.newNotes")} />
      <select
        class="h-8 rounded-md border bg-background px-2 text-[11.5px]"
        bind:value={newProject}
        aria-label={t("taskBoard.projectAria")}
      >
        <option value="">{t("taskBoard.noProject")}</option>
        {#each projects as project (project.id)}
          <option value={project.id}>{project.name}</option>
        {/each}
      </select>
      <Button size="sm" onclick={add} disabled={!newTitle.trim()}>{t("common.add")}</Button>
    </div>

    {#if error}
      <p class="border-b bg-destructive/10 px-5 py-1.5 text-[10.5px] text-destructive">{error}</p>
    {/if}

    <div class="grid max-h-[460px] grid-cols-3 gap-3 overflow-auto p-4">
      {#each STATUSES as column (column.id)}
        <section class="flex min-h-40 flex-col gap-2 rounded-xl border bg-tile/50 p-2.5">
          <h2 class="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-muted-foreground">
            {t(column.labelKey)}
            <span class="rounded-full bg-muted px-1.5 text-[9.5px]">{byStatus(column.id).length}</span>
          </h2>
          {#each byStatus(column.id) as task (task.id)}
            <div class="rounded-lg border bg-card p-2.5">
              {#if editingId === task.id}
                <Input class="mb-1.5 h-7 text-[12px]" bind:value={editTitle} />
                <textarea class="mb-1.5 h-14 w-full resize-none rounded-md border bg-input/40 px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-ring" bind:value={editNotes}></textarea>
                <div class="flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" class="h-6 px-2 text-[10.5px]" onclick={() => (editingId = null)}>{t("common.cancel")}</Button>
                  <Button size="sm" class="h-6 px-2 text-[10.5px]" onclick={saveEdit} disabled={!editTitle.trim()}>{t("common.update")}</Button>
                </div>
              {:else}
                <div class="flex items-start gap-1.5">
                  <p class="min-w-0 flex-1 text-[12px] font-semibold">{task.title}</p>
                  <button type="button" class="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("common.edit")} onclick={() => startEdit(task)}><Pencil class="size-3" /></button>
                  <button type="button" class="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t("common.delete")} onclick={() => taskStore.remove(task.id)}><Trash2 class="size-3" /></button>
                </div>
                {#if projectName(task.projectId)}
                  <span class="mt-1 inline-block rounded-full bg-accent-share/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent-share">{projectName(task.projectId)}</span>
                {/if}
                {#if task.notes}
                  <p class="mt-1 line-clamp-2 whitespace-pre-wrap text-[10.5px] text-muted-foreground">{task.notes}</p>
                {/if}
                <div class="mt-2 flex items-center gap-1">
                  <button type="button" class="grid size-6 place-items-center rounded-md border text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label={t("taskBoard.prev")} disabled={task.status === "todo"} onclick={() => move(task, -1)}><ChevronLeft class="size-3.5" /></button>
                  <button type="button" class="grid size-6 place-items-center rounded-md border text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label={t("taskBoard.next")} disabled={task.status === "done"} onclick={() => move(task, 1)}><ChevronRight class="size-3.5" /></button>
                  {#if task.status !== "done"}
                    <button type="button" class="ml-auto flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground" onclick={() => start(task)}>
                      <GitFork class="size-3" />{t("taskBoard.fanout")}
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </section>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>
