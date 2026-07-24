<!-- 팬아웃 다이얼로그: 하나의 작업/프롬프트를 여러 CLI 에이전트에 병렬로 분기 생성한다. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { AgentKind, Project } from "$lib/types";
  import { agentKindDefaults, agentKindLabels } from "$lib/data/labels";
  import { fanoutBranch } from "$lib/fanout/model";
  import { projectStore } from "$lib/stores/projects.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import Check from "@lucide/svelte/icons/check";

  let { open = $bindable(false), project }: { open?: boolean; project: Project } = $props();

  interface Row {
    kind: AgentKind;
    selected: boolean;
    command: string;
  }

  const kinds = Object.keys(agentKindLabels) as AgentKind[];
  let title = $state("");
  let prompt = $state("");
  let startPoint = $state("main");
  let rows = $state<Row[]>(
    kinds.map((kind, index) => ({ kind, selected: index < 2, command: agentKindDefaults[kind] })),
  );
  let error = $state("");
  let busy = $state(false);

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
        await projectStore.addAgent({
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
      }
      open = false;
      reset();
      shell.openCompare(groupId);
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>팬아웃 — {project.name}</Dialog.Title>
      <Dialog.Description>한 작업을 여러 에이전트에 병렬 분기해 결과를 비교합니다.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-3 py-2">
      <div class="flex flex-col gap-1.5">
        <Label for="fo-title">작업 이름</Label>
        <Input id="fo-title" bind:value={title} placeholder="예: 로그인 리팩터링" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="fo-prompt">프롬프트 (선택)</Label>
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
