<!-- 비교 다이얼로그: 팬아웃 그룹 멤버의 변경 규모를 나란히 비교하고 채택한다. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { listWorktreeFiles } from "$lib/ipc/files";
  import { fileTotals } from "$lib/files/viewModel";
  import { groupOf } from "$lib/fanout/model";
  import { statusLabel } from "$lib/data/labels";
  import { agentKindStore } from "$lib/stores/agentKinds.svelte";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import StatusDot from "./StatusDot.svelte";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import FlaskConical from "@lucide/svelte/icons/flask-conical";
  import Trophy from "@lucide/svelte/icons/trophy";
  import { runVerification, type VerifyResult } from "$lib/ipc/verify";
  import { recommendWinner } from "$lib/fanout/ranking";
  import { logEvent } from "$lib/ipc/events";
  import { t } from "$lib/i18n";

  type Totals = { changed: number; add: number; del: number };

  const group = $derived(
    shell.compareGroupId ? groupOf(projectStore.projects, shell.compareGroupId) : undefined,
  );

  let totals = $state<Record<string, Totals | null>>({});
  let loading = $state(false);
  let pendingAdopt = $state<string | null>(null);
  let copied = $state(false);
  let busy = $state(false);
  let verifyCommand = $state(
    typeof localStorage !== "undefined" ? (localStorage.getItem("verify:command") ?? "") : "",
  );
  let results = $state<Record<string, VerifyResult | null>>({});
  let verifying = $state(false);
  let showOutput = $state<string | null>(null);

  const recommended = $derived.by(() => {
    if (!group) return null;
    return recommendWinner(
      group.members.map((m) => ({
        agentId: m.id,
        changed: totals[m.id]?.changed ?? Number.POSITIVE_INFINITY,
        success: results[m.id]?.success ?? false,
        durationMs: results[m.id]?.durationMs ?? Number.POSITIVE_INFINITY,
      })),
    );
  });

  async function runVerify() {
    if (!group || verifying || !verifyCommand.trim()) return;
    verifying = true;
    if (typeof localStorage !== "undefined") localStorage.setItem("verify:command", verifyCommand.trim());
    const next: Record<string, VerifyResult | null> = {};
    await Promise.all(
      group.members.map(async (member) => {
        try {
          const result = await runVerification(member.worktreePath, verifyCommand.trim());
          next[member.id] = result;
          logEvent(member.id, "verify", t("compare.verifyLog", { result: result.success ? t("compare.pass") : t("compare.fail"), command: verifyCommand.trim() }));
        } catch {
          next[member.id] = null;
        }
      }),
    );
    results = next;
    verifying = false;
  }

  async function loadTotals() {
    if (!group) return;
    loading = true;
    const next: Record<string, Totals | null> = {};
    await Promise.all(
      group.members.map(async (member) => {
        try {
          next[member.id] = fileTotals(await listWorktreeFiles(member.worktreePath));
        } catch {
          next[member.id] = null;
        }
      }),
    );
    totals = next;
    loading = false;
  }

  async function copyPrompt() {
    if (!group?.prompt) return;
    try {
      await navigator.clipboard.writeText(group.prompt);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // 클립보드 접근 실패는 조용히 무시한다.
    }
  }

  async function adopt(agentId: string) {
    if (!group || busy) return;
    busy = true;
    try {
      for (const member of group.members) {
        if (member.id === agentId) continue;
        await projectStore.removeAgent(member.id, true, true);
      }
      logEvent(agentId, "adopt", t("compare.adoptLog"));
      shell.selectAgent(agentId);
    } catch {
      // 실패 시 다이얼로그를 유지해 다시 시도할 수 있게 한다.
    } finally {
      busy = false;
      pendingAdopt = null;
    }
  }

  $effect(() => {
    void shell.compareGroupId;
    pendingAdopt = null;
    results = {};
    showOutput = null;
    void loadTotals();
  });
</script>

<Dialog.Root open={shell.compareGroupId !== null} onOpenChange={(open) => (open ? null : shell.closeCompare())}>
  <Dialog.Content class="w-[720px] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[14px] p-0 sm:max-w-[720px]">
    {#if group}
      <Dialog.Header class="border-b px-5 py-3.5">
        <Dialog.Title class="text-[14px] font-semibold">{t("compare.title", { title: group.title })}</Dialog.Title>
        <Dialog.Description class="text-[11px]">{t("compare.desc", { project: group.projectName, count: group.members.length })}</Dialog.Description>
      </Dialog.Header>

      {#if group.prompt}
        <div class="flex items-start gap-2 border-b bg-muted/40 px-5 py-2.5">
          <p class="min-w-0 flex-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{group.prompt}</p>
          <button
            type="button"
            class="flex shrink-0 items-center gap-1 rounded-md border bg-card px-2 py-1 text-[10px] font-semibold hover:bg-accent"
            onclick={copyPrompt}
          >
            {#if copied}<Check class="size-3" />{t("compare.copied")}{:else}<Copy class="size-3" />{t("compare.copyPrompt")}{/if}
          </button>
        </div>
      {/if}

      <div class="flex items-center gap-1.5 border-b px-5 py-2.5">
        <FlaskConical class="size-3.5 shrink-0 text-muted-foreground" />
        <input
          class="min-w-0 flex-1 rounded-md border bg-input/40 px-2.5 py-1 font-mono text-[11px] outline-none focus:ring-1 focus:ring-ring"
          bind:value={verifyCommand}
          placeholder={t("compare.verifyPlaceholder")}
          onkeydown={(e) => e.key === "Enter" && runVerify()}
          aria-label={t("compare.verifyAria")}
        />
        <button
          type="button"
          class="flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
          disabled={verifying || !verifyCommand.trim()}
          onclick={runVerify}
        >{verifying ? t("compare.verifying") : t("compare.runVerify")}</button>
      </div>

      <div class="grid max-h-[440px] grid-cols-2 gap-3 overflow-auto p-5">
        {#each group.members as member (member.id)}
          {@const stat = totals[member.id]}
          {@const status = member.status ?? "idle"}
          <div class="flex flex-col gap-2.5 rounded-xl border bg-tile p-3.5 {recommended === member.id ? 'border-status-done ring-1 ring-status-done/40' : ''}">
            <div class="flex items-center gap-2">
              <StatusDot {status} size={8} />
              <span class="text-[12px] font-semibold">{agentKindStore.labelOf(member.kind)}</span>
              {#if recommended === member.id}
                <span class="ml-auto flex items-center gap-1 rounded-full bg-status-done/15 px-2 py-0.5 text-[9px] font-bold text-status-done-fg"><Trophy class="size-3" />{t("compare.recommended")}</span>
              {:else}
                <span class="ml-auto rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">{statusLabel(status)}</span>
              {/if}
            </div>
            <div class="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <GitBranch class="size-3" /><span class="truncate">{member.branch}</span>
            </div>
            <div class="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 font-mono text-[11px]">
              {#if loading && stat === undefined}
                <span class="text-muted-foreground">{t("compare.loading")}</span>
              {:else if stat}
                <span><span class="text-muted-foreground">{t("compare.files")}</span> {stat.changed}</span>
                <span class="text-diff-add">+{stat.add}</span>
                <span class="text-diff-remove">−{stat.del}</span>
              {:else}
                <span class="text-muted-foreground">{t("compare.noChangeInfo")}</span>
              {/if}
            </div>
            {#if results[member.id] !== undefined}
              {@const r = results[member.id]}
              {#if r === null}
                <div class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[10.5px] text-destructive">{t("compare.verifyFailed")}</div>
              {:else}
                <div class="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 font-mono text-[10.5px]">
                  <span class="rounded-full px-1.5 py-0.5 text-[9px] font-bold {r.success ? 'bg-status-done/15 text-status-done-fg' : 'bg-status-blocked text-status-blocked-on'}">{r.success ? t("compare.pass") : `${t("compare.fail")}${r.exitCode !== null ? ` ·${r.exitCode}` : ""}`}</span>
                  <span class="text-muted-foreground">{(r.durationMs / 1000).toFixed(1)}s</span>
                  {#if r.outputTail}
                    <button type="button" class="ml-auto text-[10px] text-muted-foreground hover:text-foreground" onclick={() => (showOutput = showOutput === member.id ? null : member.id)}>{t("compare.output")}</button>
                  {/if}
                </div>
                {#if showOutput === member.id && r.outputTail}
                  <pre class="max-h-28 overflow-auto rounded-lg border bg-terminal p-2 font-mono text-[9.5px] leading-relaxed text-white/70">{r.outputTail}</pre>
                {/if}
              {/if}
            {/if}
            <div class="mt-auto flex items-center gap-1.5">
              <button
                type="button"
                class="flex h-7 flex-1 items-center justify-center rounded-md border bg-card text-[11px] font-semibold hover:bg-accent"
                onclick={() => shell.selectAgent(member.id)}
              >{t("common.open")}</button>
              {#if pendingAdopt === member.id}
                <button
                  type="button"
                  class="flex h-7 flex-1 items-center justify-center rounded-md bg-status-blocked text-[11px] font-bold text-status-blocked-on disabled:opacity-50"
                  disabled={busy}
                  onclick={() => adopt(member.id)}
                >{t("compare.adoptClean")}</button>
                <button
                  type="button"
                  class="flex h-7 items-center justify-center rounded-md border px-2 text-[11px] hover:bg-accent"
                  onclick={() => (pendingAdopt = null)}
                >{t("common.cancel")}</button>
              {:else}
                <button
                  type="button"
                  class="flex h-7 flex-1 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                  disabled={busy || group.members.length < 2}
                  onclick={() => (pendingAdopt = member.id)}
                >{t("compare.adopt")}</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
