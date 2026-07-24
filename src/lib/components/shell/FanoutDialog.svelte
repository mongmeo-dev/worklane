<!-- 팬아웃 다이얼로그: 하나의 작업/프롬프트를 여러 CLI 에이전트에 병렬로 분기 생성한다. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { AgentKind, Project } from "$lib/types";
  import { agentKindDefaults, agentKindLabels, cliAgentKinds } from "$lib/data/labels";
  import { fanoutBranch } from "$lib/fanout/model";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { promptStore } from "$lib/stores/prompts.svelte";
  import { githubIssues, type GithubIssue } from "$lib/ipc/github";
  import { linearIssues, type LinearIssue } from "$lib/ipc/linear";
  import { integrations } from "$lib/stores/integrations.svelte";
  import { logEvent } from "$lib/ipc/events";
  import { playbookStore } from "$lib/stores/playbooks.svelte";
  import type { Playbook } from "$lib/ipc/playbooks";
  import { onMount } from "svelte";
  import Check from "@lucide/svelte/icons/check";
  import Library from "@lucide/svelte/icons/library";
  import Save from "@lucide/svelte/icons/save";
  import CircleDot from "@lucide/svelte/icons/circle-dot";
  import BookMarked from "@lucide/svelte/icons/book-marked";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  import type { FanoutSeed } from "$lib/stores/composer.svelte";

  let {
    open,
    onOpenChange,
    project,
    seed = null,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    project: Project;
    seed?: FanoutSeed | null;
  } = $props();

  // 다이얼로그가 열릴 때(닫힘→열림) 시드가 있으면 제목/프롬프트를 채운다.
  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen && seed) {
      title = seed.title;
      prompt = seed.prompt;
    }
    wasOpen = open;
  });

  interface Row {
    kind: AgentKind;
    selected: boolean;
    command: string;
  }

  const kinds = cliAgentKinds;
  let title = $state("");
  let prompt = $state("");
  let startPoint = $state("main");
  let rows = $state<Row[]>(
    kinds.map((kind, index) => ({ kind, selected: index < 2, command: agentKindDefaults[kind] })),
  );
  let error = $state("");
  let busy = $state(false);
  let libOpen = $state(false);
  let saved = $state(false);

  function insertPrompt(body: string, promptTitle: string) {
    prompt = body;
    if (!title.trim()) title = promptTitle;
    libOpen = false;
  }

  async function saveToLibrary() {
    if (!prompt.trim()) return;
    try {
      await promptStore.add(title.trim() || "제목 없는 프롬프트", prompt.trim());
      saved = true;
      setTimeout(() => (saved = false), 1500);
    } catch {
      // 저장 실패는 조용히 무시(라이브러리 없이도 팬아웃은 가능).
    }
  }

  let issuesOpen = $state(false);
  let issues = $state<GithubIssue[]>([]);
  let issuesLoading = $state(false);
  let issuesError = $state<string | null>(null);
  let pbOpen = $state(false);
  let pbSaved = $state(false);

  function applyPlaybook(pb: Playbook) {
    prompt = pb.prompt;
    startPoint = pb.base.trim() || "main";
    if (!title.trim()) title = pb.name;
    rows = kinds.map((kind) => {
      const member = pb.members.find((m) => m.kind === kind);
      return { kind, selected: Boolean(member), command: member?.command ?? agentKindDefaults[kind] };
    });
    pbOpen = false;
  }

  async function savePlaybook() {
    if (!title.trim() || selected.length === 0) return;
    try {
      await playbookStore.add(
        title.trim(),
        prompt.trim(),
        startPoint.trim(),
        selected.map((r) => ({ kind: r.kind, command: r.command.trim() })),
      );
      pbSaved = true;
      setTimeout(() => (pbSaved = false), 1500);
    } catch {
      // 저장 실패는 조용히 무시(플레이북 없이도 팬아웃 가능).
    }
  }
  async function toggleIssues() {
    issuesOpen = !issuesOpen;
    if (issuesOpen && issues.length === 0) {
      issuesLoading = true;
      issuesError = null;
      try {
        issues = await githubIssues(project.path);
      } catch (e) {
        issuesError = e instanceof Error ? e.message : String(e);
      } finally {
        issuesLoading = false;
      }
    }
  }

  function pickIssue(issue: GithubIssue) {
    title = issue.title;
    if (issue.body.trim()) prompt = issue.body.trim();
    issuesOpen = false;
  }

  let linearOpen = $state(false);
  let linearList = $state<LinearIssue[]>([]);
  let linearLoading = $state(false);
  let linearError = $state<string | null>(null);

  async function toggleLinear() {
    linearOpen = !linearOpen;
    if (linearOpen) {
      linearLoading = true;
      linearError = null;
      try {
        linearList = await linearIssues(integrations.linearKey);
      } catch (e) {
        linearError = e instanceof Error ? e.message : String(e);
      } finally {
        linearLoading = false;
      }
    }
  }

  function pickLinear(issue: LinearIssue) {
    title = `${issue.identifier} ${issue.title}`;
    if (issue.description.trim()) prompt = issue.description.trim();
    linearOpen = false;
  }

  onMount(() => {
    if (promptStore.prompts.length === 0) void promptStore.load();
    if (playbookStore.playbooks.length === 0) void playbookStore.load();
  });

  const selected = $derived(rows.filter((r) => r.selected));
  const canSubmit = $derived(
    title.trim().length > 0 &&
      startPoint.trim().length > 0 &&
      selected.length >= 2 &&
      selected.every((r) => r.command.trim().length > 0),
  );

  function uuid(): string {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `g-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }

  function reset() {
    title = "";
    prompt = "";
    startPoint = "main";
    rows = kinds.map((kind, index) => ({ kind, selected: index < 2, command: agentKindDefaults[kind] }));
    error = "";
  }

  async function submit() {
    if (!canSubmit || busy) return;
    error = "";
    busy = true;
    const groupId = uuid();
    try {
      for (const row of selected) {
        const agent = await projectStore.addAgent({
          projectId: project.id,
          projectPath: project.path,
          title: title.trim(),
          kind: row.kind,
          command: row.command.trim(),
          branch: fanoutBranch(title.trim(), row.kind, groupId),
          startPoint: startPoint.trim(),
          groupId,
          prompt: prompt.trim() || undefined,
        });
        logEvent(agent.id, "fanout", `팬아웃 생성 · ${title.trim()}`);
      }
      onOpenChange(false);
      reset();
      shell.openCompare(groupId);
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>팬아웃 — {project.name}</Dialog.Title>
      <Dialog.Description>한 작업을 여러 에이전트에 병렬 분기해 결과를 비교합니다.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-3 py-2">
      <div class="flex items-center gap-1.5 rounded-lg border bg-muted/30 px-2.5 py-1.5">
        <BookMarked class="size-3.5 text-muted-foreground" />
        <span class="text-[11px] font-semibold text-muted-foreground">플레이북</span>
        <div class="relative">
          <button type="button" class="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[10.5px] font-semibold hover:bg-accent {pbOpen ? 'bg-accent' : ''}" disabled={playbookStore.playbooks.length === 0} onclick={() => (pbOpen = !pbOpen)}>
            불러오기{playbookStore.playbooks.length > 0 ? ` (${playbookStore.playbooks.length})` : ""}
          </button>
          {#if pbOpen}
            <div class="absolute left-0 top-[calc(100%+4px)] z-50 max-h-52 w-64 overflow-auto rounded-lg border bg-popover text-popover-foreground shadow-xl">
              {#each playbookStore.playbooks as pb (pb.id)}
                <div class="flex items-center gap-1 px-1 py-0.5">
                  <button type="button" class="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-[11px] hover:bg-accent" onclick={() => applyPlaybook(pb)}>{pb.name} · {pb.members.length}개</button>
                  <button type="button" class="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="플레이북 삭제" onclick={() => playbookStore.remove(pb.id)}><Trash2 class="size-3" /></button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        <button type="button" class="ml-auto flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[10.5px] font-semibold hover:bg-accent disabled:opacity-40" disabled={!title.trim() || selected.length === 0} onclick={savePlaybook}>
          <Save class="size-3" />{pbSaved ? "저장됨" : "현재 설정 저장"}
        </button>
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2">
          <Label for="fo-title" class="flex-1">작업 이름</Label>
          <div class="relative">
            <button type="button" class="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[10px] font-semibold hover:bg-accent {issuesOpen ? 'bg-accent' : ''}" onclick={toggleIssues}>
              <CircleDot class="size-3" />GitHub 이슈
            </button>
            {#if issuesOpen}
              <div class="absolute right-0 top-[calc(100%+4px)] z-50 max-h-60 w-72 overflow-auto rounded-lg border bg-popover text-popover-foreground shadow-xl">
                {#if issuesLoading}
                  <p class="px-3 py-3 text-[11px] text-muted-foreground">이슈를 불러오는 중…</p>
                {:else if issuesError}
                  <p class="px-3 py-3 text-[10.5px] text-destructive">{issuesError}</p>
                {:else if issues.length === 0}
                  <p class="px-3 py-3 text-[11px] text-muted-foreground">열린 이슈가 없습니다.</p>
                {:else}
                  {#each issues as issue (issue.number)}
                    <button type="button" class="flex w-full items-start gap-1.5 px-3 py-1.5 text-left hover:bg-accent" onclick={() => pickIssue(issue)}>
                      <span class="shrink-0 font-mono text-[10px] text-muted-foreground">#{issue.number}</span>
                      <span class="min-w-0 flex-1 truncate text-[11px]">{issue.title}</span>
                    </button>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
          <div class="relative">
            <button type="button" class="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[10px] font-semibold hover:bg-accent {linearOpen ? 'bg-accent' : ''}" onclick={toggleLinear}>
              <CircleDot class="size-3" />Linear
            </button>
            {#if linearOpen}
              <div class="absolute right-0 top-[calc(100%+4px)] z-50 max-h-60 w-72 overflow-auto rounded-lg border bg-popover text-popover-foreground shadow-xl">
                {#if linearLoading}
                  <p class="px-3 py-3 text-[11px] text-muted-foreground">이슈를 불러오는 중…</p>
                {:else if linearError}
                  <p class="px-3 py-3 text-[10.5px] text-destructive">{linearError}</p>
                {:else if linearList.length === 0}
                  <p class="px-3 py-3 text-[11px] text-muted-foreground">할당된 이슈가 없습니다.</p>
                {:else}
                  {#each linearList as issue (issue.identifier)}
                    <button type="button" class="flex w-full items-start gap-1.5 px-3 py-1.5 text-left hover:bg-accent" onclick={() => pickLinear(issue)}>
                      <span class="shrink-0 font-mono text-[10px] text-muted-foreground">{issue.identifier}</span>
                      <span class="min-w-0 flex-1 truncate text-[11px]">{issue.title}</span>
                    </button>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        </div>
        <Input id="fo-title" bind:value={title} placeholder="예: 로그인 리팩터링" />
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2">
          <Label for="fo-prompt" class="flex-1">프롬프트 (선택)</Label>
          {#if promptStore.prompts.length > 0}
            <div class="relative">
              <button type="button" class="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[10px] font-semibold hover:bg-accent {libOpen ? 'bg-accent' : ''}" onclick={() => (libOpen = !libOpen)}>
                <Library class="size-3" />라이브러리
              </button>
              {#if libOpen}
                <div class="absolute right-0 top-[calc(100%+4px)] z-50 max-h-52 w-56 overflow-auto rounded-lg border bg-popover text-popover-foreground shadow-xl">
                  {#each promptStore.prompts as p (p.id)}
                    <button type="button" class="block w-full truncate px-3 py-1.5 text-left text-[11px] hover:bg-accent" onclick={() => insertPrompt(p.body, p.title)}>{p.title}</button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
          <button type="button" class="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[10px] font-semibold hover:bg-accent disabled:opacity-40" disabled={!prompt.trim()} onclick={saveToLibrary}>
            <Save class="size-3" />{saved ? "저장됨" : "저장"}
          </button>
        </div>
        <textarea
          id="fo-prompt"
          class="h-20 w-full resize-none rounded-md border bg-input/40 px-2.5 py-2 text-[12px] outline-none focus:ring-1 focus:ring-ring"
          bind:value={prompt}
          placeholder="각 에이전트에 전달할 작업 지시. 비교 화면에서 복사할 수 있습니다."
        ></textarea>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="fo-start">분기 기준(start-point)</Label>
        <Input id="fo-start" bind:value={startPoint} placeholder="예: main" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>에이전트 (2개 이상 선택)</Label>
        <div class="flex flex-col gap-1.5">
          {#each rows as row (row.kind)}
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors {row.selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}"
                aria-pressed={row.selected}
                aria-label={`${agentKindLabels[row.kind]} 선택`}
                onclick={() => (row.selected = !row.selected)}
              >
                {#if row.selected}<Check class="size-3.5" />{/if}
              </button>
              <span class="w-24 shrink-0 text-[12px] font-medium">{agentKindLabels[row.kind]}</span>
              <Input
                class="h-8 flex-1 font-mono text-[11px]"
                bind:value={row.command}
                disabled={!row.selected}
                aria-label={`${agentKindLabels[row.kind]} 실행 커맨드`}
              />
            </div>
          {/each}
        </div>
      </div>
      {#if error}
        <p class="text-xs text-destructive">{error}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button onclick={submit} disabled={!canSubmit || busy}>
        {busy ? "생성 중…" : `${selected.length}개 에이전트 생성`}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
