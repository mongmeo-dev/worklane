<script lang="ts">
  import type { Agent } from "$lib/types";
  import type { ReviewStatus } from "$lib/ipc/review";
  import { gitCommitAll, gitOpenPullRequest, gitPush, gitReviewStatus } from "$lib/ipc/review";
  import { canCommit, canPush, pushLabel } from "$lib/review/model";
  import { shell } from "$lib/stores/shell.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import GitCommitHorizontal from "@lucide/svelte/icons/git-commit-horizontal";
  import Upload from "@lucide/svelte/icons/upload";
  import GitPullRequestArrow from "@lucide/svelte/icons/git-pull-request-arrow";

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
      await gitCommitAll(agent.worktreePath, message);
      message = "";
      note = "커밋했습니다.";
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
      note = `푸시 완료 · ${branch}`;
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
      await openUrl(pr.url);
      note = pr.mode === "gh" ? "PR을 열었습니다." : "GitHub compare 페이지를 열었습니다.";
    } catch (e) {
      error = reason(e);
    } finally {
      busy = null;
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
    <span class="font-semibold text-foreground">검토 · 커밋</span>
    {#if status}
      <span class="ml-auto flex items-center gap-1.5 font-mono">
        {#if status.changedCount > 0}<span class="text-accent-share">{status.changedCount} 변경</span>{/if}
        {#if status.ahead > 0}<span class="text-diff-add">↑{status.ahead}</span>{/if}
        {#if status.behind > 0}<span class="text-diff-remove">↓{status.behind}</span>{/if}
      </span>
    {/if}
  </div>

  <textarea
    class="mt-2 h-14 w-full resize-none rounded-md border bg-input/40 px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    placeholder={status && status.changedCount > 0 ? "커밋 메시지" : "커밋할 변경이 없습니다"}
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
      {busy === "commit" ? "커밋 중" : "커밋"}
    </button>
    <button
      type="button"
      class="flex h-7 items-center justify-center gap-1 rounded-md border bg-card text-[10.5px] font-semibold hover:bg-accent disabled:opacity-40"
      disabled={!status || !canPush(status) || busy !== null}
      onclick={push}
    >
      <Upload class="size-3.5" />
      {busy === "push" ? "푸시 중" : status ? pushLabel(status) : "푸시"}
    </button>
    <button
      type="button"
      class="flex h-7 items-center justify-center gap-1 rounded-md border bg-card text-[10.5px] font-semibold hover:bg-accent disabled:opacity-40"
      disabled={!status || !status.hasRemote || busy !== null}
      onclick={pullRequest}
    >
      <GitPullRequestArrow class="size-3.5" />
      {busy === "pr" ? "여는 중" : "PR"}
    </button>
  </div>

  {#if error}
    <p class="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">{error}</p>
  {:else if note}
    <p class="mt-2 text-[10px] text-status-done-fg">{note}</p>
  {:else if status && !status.hasRemote}
    <p class="mt-2 text-[10px] text-muted-foreground">origin 원격이 없어 푸시·PR을 사용할 수 없습니다.</p>
  {/if}
</div>
