<script lang="ts">
  import type { Agent } from "$lib/types";
  import type { ReviewStatus } from "$lib/ipc/review";
  import { gitCommitAll, gitOpenPullRequest, gitPush, gitReviewStatus } from "$lib/ipc/review";
  import { canCommit, canPush, pushLabel } from "$lib/review/model";
  import { shell } from "$lib/stores/shell.svelte";
  import { logEvent } from "$lib/ipc/events";
  import { t } from "$lib/i18n";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import GitCommitHorizontal from "@lucide/svelte/icons/git-commit-horizontal";
  import Upload from "@lucide/svelte/icons/upload";
  import GitPullRequestArrow from "@lucide/svelte/icons/git-pull-request-arrow";
  import GitMerge from "@lucide/svelte/icons/git-merge";
  import { gitMergePreview, gitMergeIntoBase, type MergePreview } from "$lib/ipc/merge";

  let { agent, onChanged }: { agent: Agent; onChanged?: () => void } = $props();

  let status = $state<ReviewStatus | null>(null);
  let message = $state("");
  let busy = $state<"commit" | "push" | "pr" | null>(null);
  let note = $state<string | null>(null);
  let error = $state<string | null>(null);

  function reason(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  async function refresh() {
    try {
      status = await gitReviewStatus(agent.worktreePath);
    } catch {
      status = null;
    }
  }

  async function commit() {
    if (!status || !canCommit(status.changedCount, message)) return;
    busy = "commit";
    error = null;
    note = null;
    try {
      const committed = message.trim();
      await gitCommitAll(agent.worktreePath, message);
      logEvent(agent.id, "commit", committed);
      message = "";
      note = t("review.committed");
      await refresh();
      onChanged?.();
    } catch (e) {
      error = reason(e);
    } finally {
      busy = null;
    }
  }

  async function push() {
    if (!status || !canPush(status)) return;
    busy = "push";
    error = null;
    note = null;
    try {
      const branch = await gitPush(agent.worktreePath);
      logEvent(agent.id, "push", branch);
      note = t("review.pushDone", { branch });
      await refresh();
    } catch (e) {
      error = reason(e);
    } finally {
      busy = null;
    }
  }

  async function pullRequest() {
    busy = "pr";
    error = null;
    note = null;
    try {
      const pr = await gitOpenPullRequest(agent.worktreePath);
      logEvent(agent.id, "pr", `${pr.mode}: ${pr.url}`);
      await openUrl(pr.url);
      note = pr.mode === "gh" ? t("review.prOpened") : t("review.compareOpened");
    } catch (e) {
      error = reason(e);
    } finally {
      busy = null;
    }
  }

  let merging = $state(false);
  let mergeConflicts = $state<string[]>([]);
  let pendingMerge = $state<MergePreview | null>(null);

  async function previewMerge() {
    merging = true;
    error = null;
    note = null;
    mergeConflicts = [];
    pendingMerge = null;
    try {
      const preview = await gitMergePreview(agent.worktreePath);
      if (preview.alreadyMerged) {
        note = t("review.alreadyMerged", { base: preview.base });
      } else if (preview.conflicts.length > 0) {
        mergeConflicts = preview.conflicts;
      } else {
        pendingMerge = preview;
      }
    } catch (e) {
      error = reason(e);
    } finally {
      merging = false;
    }
  }

  async function confirmMerge() {
    if (!pendingMerge) return;
    merging = true;
    error = null;
    try {
      const message = await gitMergeIntoBase(agent.worktreePath);
      logEvent(agent.id, "merge", `${pendingMerge.branch} → ${pendingMerge.base}`);
      note = message;
      pendingMerge = null;
      await refresh();
      shell.bumpWorktree();
    } catch (e) {
      error = reason(e);
    } finally {
      merging = false;
    }
  }

  $effect(() => {
    void agent.worktreePath;
    void shell.worktreeRev;
    void refresh();
  });
</script>

<div class="shrink-0 border-t bg-sidebar px-3 py-2.5">
  <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
    <GitCommitHorizontal class="size-3.5" />
    <span class="font-semibold text-foreground">{t("review.heading")}</span>
    {#if status}
      <span class="ml-auto flex items-center gap-1.5 font-mono">
        {#if status.changedCount > 0}<span class="text-accent-share">{t("review.changed", { count: status.changedCount })}</span>{/if}
        {#if status.ahead > 0}<span class="text-diff-add">↑{status.ahead}</span>{/if}
        {#if status.behind > 0}<span class="text-diff-remove">↓{status.behind}</span>{/if}
      </span>
    {/if}
  </div>

  <textarea
    class="mt-2 h-14 w-full resize-none rounded-md border bg-input/40 px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    placeholder={status && status.changedCount > 0 ? t("review.commitPlaceholder") : t("review.noChanges")}
    disabled={!status || status.changedCount === 0 || busy !== null}
    bind:value={message}
  ></textarea>

  <div class="mt-2 grid grid-cols-3 gap-1.5">
    <button
      type="button"
      class="flex h-7 items-center justify-center gap-1 rounded-md bg-primary text-[10.5px] font-semibold text-primary-foreground disabled:opacity-40"
      disabled={!status || !canCommit(status.changedCount, message) || busy !== null}
      onclick={commit}
    >
      <GitCommitHorizontal class="size-3.5" />
      {busy === "commit" ? t("review.committing") : t("review.commit")}
    </button>
    <button
      type="button"
      class="flex h-7 items-center justify-center gap-1 rounded-md border bg-card text-[10.5px] font-semibold hover:bg-accent disabled:opacity-40"
      disabled={!status || !canPush(status) || busy !== null}
      onclick={push}
    >
      <Upload class="size-3.5" />
      {busy === "push" ? t("review.pushing") : status ? pushLabel(status) : t("review.push")}
    </button>
    <button
      type="button"
      class="flex h-7 items-center justify-center gap-1 rounded-md border bg-card text-[10.5px] font-semibold hover:bg-accent disabled:opacity-40"
      disabled={!status || !status.hasRemote || busy !== null}
      onclick={pullRequest}
    >
      <GitPullRequestArrow class="size-3.5" />
      {busy === "pr" ? t("review.opening") : "PR"}
    </button>
  </div>

  {#if pendingMerge}
    <div class="mt-1.5 flex items-center gap-1.5">
      <button
        type="button"
        class="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-status-done text-[10.5px] font-bold text-background disabled:opacity-50"
        disabled={merging}
        onclick={confirmMerge}
      >
        <GitMerge class="size-3.5" />{t("review.mergeInto", { base: pendingMerge.base })}
      </button>
      <button type="button" class="h-7 rounded-md border px-2.5 text-[10.5px] hover:bg-accent" onclick={() => (pendingMerge = null)}>{t("common.cancel")}</button>
    </div>
  {:else}
    <button
      type="button"
      class="mt-1.5 flex h-7 w-full items-center justify-center gap-1 rounded-md border bg-card text-[10.5px] font-semibold hover:bg-accent disabled:opacity-40"
      disabled={!status || busy !== null || merging}
      onclick={previewMerge}
    >
      <GitMerge class="size-3.5" />{merging ? t("review.merging") : t("review.mergeToBase")}
    </button>
  {/if}

  {#if mergeConflicts.length > 0}
    <p class="mt-1.5 rounded-md border border-status-blocked/30 bg-status-blocked/10 px-2 py-1 text-[10px] text-status-blocked-fg">
      {t("review.conflictSummary", { count: mergeConflicts.length, list: mergeConflicts.slice(0, 4).join(", ") })}{mergeConflicts.length > 4 ? " …" : ""}
    </p>
  {/if}

  {#if error}
    <p class="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">{error}</p>
  {:else if note}
    <p class="mt-2 text-[10px] text-status-done-fg">{note}</p>
  {:else if status && !status.hasRemote}
    <p class="mt-2 text-[10px] text-muted-foreground">{t("review.noRemote")}</p>
  {/if}
</div>
