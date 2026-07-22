<script lang="ts">
  import type { Agent } from "$lib/types";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tabs from "$lib/components/ui/tabs";
  import { agentKindLabels, statusLabels } from "$lib/data/labels";
  import StatusDot from "./StatusDot.svelte";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import Terminal from "./Terminal.svelte";
  import DiffView from "./DiffView.svelte";

  interface Props {
    agent: Agent | undefined;
  }

  let { agent }: Props = $props();

  // 플랫폼 기본 셸. Windows는 후속 대응 (현재 개발 대상은 macOS 우선).
  function defaultShell(): string {
    return "/bin/zsh";
  }
</script>

<section class="flex min-w-0 flex-1 flex-col bg-background">
  {#if agent}
    <!-- 선택된 에이전트 헤더 -->
    <div class="flex items-center gap-3 px-4 py-3">
      <StatusDot status={agent.status ?? "idle"} />
      <div class="min-w-0">
        <h2 class="truncate text-sm font-semibold">{agent.title}</h2>
        <div class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{agentKindLabels[agent.kind]}</span>
          <GitBranch class="size-3" />
          <span class="truncate">{agent.branch}</span>
        </div>
      </div>
      <Badge variant="secondary" class="ml-auto shrink-0">
        {statusLabels[agent.status ?? "idle"]}
      </Badge>
    </div>

    <Separator />

    <!-- 터미널 / 변경사항 탭 -->
    <Tabs.Root value="terminal" class="flex min-h-0 flex-1 flex-col gap-0">
      <div class="px-4 pt-3">
        <Tabs.List>
          <Tabs.Trigger value="terminal">터미널</Tabs.Trigger>
          <Tabs.Trigger value="diff">변경사항</Tabs.Trigger>
        </Tabs.List>
      </div>

      <Tabs.Content value="terminal" class="min-h-0 flex-1 p-2">
        {#key agent.id}
          <div class="h-full w-full overflow-hidden rounded-lg border bg-black p-1">
            <Terminal
              sessionId={agent.id}
              cmd={defaultShell()}
              cwd="."
            />
          </div>
        {/key}
      </Tabs.Content>

      <Tabs.Content value="diff" class="min-h-0 flex-1 p-2">
        {#key agent.id}
          <div class="h-full w-full overflow-hidden rounded-lg border bg-background">
            <DiffView worktreePath={agent.worktreePath} />
          </div>
        {/key}
      </Tabs.Content>
    </Tabs.Root>
  {:else}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-sm text-muted-foreground">좌측에서 에이전트를 선택하세요</p>
    </div>
  {/if}
</section>
