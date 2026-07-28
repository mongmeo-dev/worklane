<script lang="ts">
  import type { Agent, Project } from "$lib/types";
  import type { OverviewFilter } from "$lib/stores/shell.svelte";
  import { allAgents, representativeTerminalId } from "$lib/shell/derived";
  import { shell } from "$lib/stores/shell.svelte";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
  import { terminalPool } from "$lib/terminal/pool";
  import { listWorktreeFiles } from "$lib/ipc/files";
  import { agentKindStore } from "$lib/stores/agentKinds.svelte";
  import { t, type MessageKey } from "$lib/i18n";
  import StatusDot from "./StatusDot.svelte";
  import { filterAgents, searchAgents, sortAgents, tileAction, type OverviewSort } from "./overviewModel";
  import { Button } from "$lib/components/ui/button";
  import { projectDialogUi } from "$lib/stores/projectDialogUi.svelte";
  import Search from "@lucide/svelte/icons/search";
  import Plus from "@lucide/svelte/icons/plus";
  import FolderPlus from "@lucide/svelte/icons/folder-plus";
  import GitBranch from "@lucide/svelte/icons/git-branch";

  let { projects }: { projects: Project[] } = $props();

  const SORT_KEY = "overview:sort";
  let query = $state("");
  let sort = $state<OverviewSort>(
    (typeof localStorage !== "undefined" ? (localStorage.getItem(SORT_KEY) as OverviewSort | null) : null) ?? "activity",
  );
  function setSort(value: OverviewSort) {
    sort = value;
    if (typeof localStorage !== "undefined") localStorage.setItem(SORT_KEY, value);
  }
  const sorts: { value: OverviewSort; labelKey: MessageKey }[] = [
    { value: "activity", labelKey: "overview.sort.activity" },
    { value: "status", labelKey: "overview.sort.status" },
    { value: "name", labelKey: "overview.sort.name" },
  ];

  const agents = $derived(allAgents(projects));
  const projectNameById = $derived(
    new Map(projects.flatMap((p) => p.agents.map((a) => [a.id, p.name] as const))),
  );
  const nameOf = (agent: Agent) => projectNameById.get(agent.id) ?? "";
  const shownAgents = $derived(
    sortAgents(searchAgents(filterAgents(agents, shell.overviewFilter), query, nameOf), sort),
  );
  const filters: { value: OverviewFilter; labelKey: MessageKey }[] = [
    { value: "all", labelKey: "overview.filter.all" },
    { value: "running", labelKey: "overview.filter.running" },
    { value: "blocked", labelKey: "overview.filter.blocked" },
    { value: "done", labelKey: "overview.filter.done" },
    { value: "failed", labelKey: "overview.filter.failed" },
  ];

  function filterCount(filter: OverviewFilter): number {
    return filter === "all" ? agents.length : agents.filter((agent) => (agent.status ?? "idle") === filter).length;
  }

  async function openAction(event: MouseEvent, agent: Agent) {
    event.stopPropagation();
    shell.selectAgent(agent.id);
    if ((agent.status ?? "idle") !== "done") return;
    try {
      const firstChanged = (await listWorktreeFiles(agent.worktreePath)).find((file) => file.change !== "none");
      if (firstChanged) shell.openFile(firstChanged.path);
    } catch {
      // 상세 화면에서 파일 패널 오류 상태로 다시 시도할 수 있다.
    }
  }

  function tileClass(agent: Agent): string {
    const status = agent.status ?? "idle";
    if (status === "blocked") return "border-status-blocked/55 shadow-[0_0_24px_color-mix(in_oklch,var(--status-blocked)_10%,transparent)]";
    if (status === "failed") return "border-destructive/55 shadow-[0_0_24px_color-mix(in_oklch,var(--destructive)_10%,transparent)]";
    // 전체 불투명도로 눌러버리면 다크 고정인 터미널 미리보기까지 회색으로 떠서
    // 라이트 모드에서 카드가 망가진다. 강조/후퇴는 테두리로만 표현한다.
    if (status === "idle") return "border-border/60";
    if (status === "done") return "border-status-done/35";
    return "";
  }

  // 살아있는 xterm 버퍼에서 실제 렌더된 화면을 읽는다. revision은 출력마다 올라가는
  // 반응형 신호라, 이를 먼저 읽어 두면 새 출력이 올 때 타일 미리보기가 재계산된다.
  function previewOf(id: string): string {
    sessionStatus.revision(id);
    return terminalPool.snapshot(id);
  }
</script>

<section class="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-[22px] pb-[22px] pt-[18px]">
  <header class="flex shrink-0 flex-col gap-3">
    <div class="flex items-end gap-3">
      <div class="min-w-0">
        <h1 class="text-lg font-bold">{t("overview.title")}</h1>
        <p class="mt-0.5 text-xs text-muted-foreground">{t("overview.summary", { agents: agents.length, projects: projects.length })}</p>
      </div>
      <!-- 대상이 0개면 검색·필터·정렬은 조작할 것이 없는 죽은 컨트롤이라 숨긴다. -->
      {#if agents.length > 0}
      <label class="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-card/70 px-3 focus-within:border-focus-ring">
        <Search class="size-3.5 shrink-0 text-muted-foreground" />
        <input
          bind:value={query}
          class="w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground focus:w-48"
          placeholder={t("overview.searchPlaceholder")}
          aria-label={t("overview.searchAria")}
          spellcheck="false"
        />
      </label>
      {/if}
    </div>

    {#if agents.length > 0}
    <div class="flex flex-wrap items-center gap-2">
      <!-- 상태 필터가 1차 축이므로 먼저 오고, 정렬은 보조 축으로 오른쪽에 둔다. -->
      <div class="flex items-center gap-1 rounded-full border bg-card/70 p-0.5" role="group" aria-label={t("statusChips.nav")}>
        {#each filters as filter (filter.value)}
          {@const active = shell.overviewFilter === filter.value}
          <button
            type="button"
            aria-pressed={active}
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors {active ? 'bg-accent text-foreground' : filter.value === 'blocked' ? 'text-status-blocked-fg hover:bg-status-blocked/10' : filter.value === 'failed' ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => shell.setFilter(filter.value)}
          >
            {t(filter.labelKey)}{(filter.value === "blocked" || filter.value === "failed") && filterCount(filter.value) > 0 ? ` ${filterCount(filter.value)}` : ""}
          </button>
        {/each}
      </div>
      <div class="ml-auto flex items-center gap-0.5 rounded-full border bg-card/70 p-0.5">
        {#each sorts as option (option.value)}
          <button
            type="button"
            aria-pressed={sort === option.value}
            class="rounded-full px-2.5 py-1 text-xs font-medium transition-colors {sort === option.value ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => setSort(option.value)}
          >{t(option.labelKey)}</button>
        {/each}
      </div>
    </div>
    {/if}
  </header>

  <div class="min-h-0 flex-1 overflow-auto">
    {#if shownAgents.length > 0}
      <div class="grid min-h-full auto-rows-[minmax(210px,1fr)] grid-cols-[repeat(auto-fit,minmax(245px,1fr))] gap-[13px]">
        {#each shownAgents as agent (agent.id)}
          {@const status = agent.status ?? "idle"}
          {@const tail = previewOf(representativeTerminalId(agent))}
          <!-- 카드 전체를 클릭 가능하게 하되 중첩 버튼을 만들지 않는다.
               제목 버튼의 ::after가 카드를 덮고, 주요 액션만 그 위(z-10)에 둔다. -->
          <article
            class="group relative flex min-h-[210px] flex-col overflow-hidden rounded-xl border bg-tile p-3 transition-[transform,border-color,opacity] hover:-translate-y-0.5 hover:border-foreground/25 focus-within:border-focus-ring {tileClass(agent)}"
          >
            <div class="flex items-center gap-2">
              <StatusDot {status} size={7} />
              <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">
                <button
                  type="button"
                  class="block w-full truncate text-left after:absolute after:inset-0 after:content-['']"
                  onclick={() => shell.selectAgent(agent.id)}
                >{agent.title}</button>
              </h2>
              <span class="font-mono text-2xs font-medium uppercase tracking-wide text-muted-foreground">{agentKindStore.labelOf(agent.terminals?.[0]?.kind ?? agent.kind)}</span>
            </div>
            <div class="mt-1.5 flex items-center gap-1.5 font-mono text-2xs text-muted-foreground">
              <GitBranch class="size-3 shrink-0" />
              <span class="truncate">{agent.branch}</span>
            </div>
            <div class="mt-3 flex min-h-0 flex-1 items-end overflow-hidden rounded-lg border border-white/5 bg-terminal p-3 font-mono text-2xs leading-[1.65] text-white/70">
              <pre class="max-h-full w-full whitespace-pre-wrap">{tail || `$ ${agent.terminals?.[0]?.command ?? agent.command}\n${t("overview.previewPlaceholder")}`}</pre>
            </div>
            <footer class="mt-2.5 flex items-center gap-2 text-2xs text-muted-foreground">
              {#if status === "failed"}
                <span class="rounded-full bg-destructive px-2 py-0.5 font-semibold text-destructive-foreground">{t("status.failed")}</span>
              {:else if status === "blocked"}
                <span class="rounded-full bg-status-blocked px-2 py-0.5 font-semibold text-status-blocked-on">{t("status.blocked")}</span>
              {:else}
                <span class="truncate">{agent.lastActivity ?? t("common.waitingActivity")}</span>
              {/if}
              <button
                type="button"
                class="relative z-10 ml-auto shrink-0 rounded-full px-2.5 py-1 font-semibold transition-colors {status === 'failed' ? 'bg-destructive text-destructive-foreground' : status === 'blocked' ? 'bg-status-blocked text-status-blocked-on' : status === 'done' ? 'text-status-done-fg hover:bg-status-done/10' : 'text-foreground hover:bg-accent'}"
                aria-label={`${agent.title} — ${tileAction(status)}`}
                onclick={(event) => openAction(event, agent)}
              >{tileAction(status)}</button>
            </footer>
          </article>
        {/each}
      </div>
    {:else}
      <div class="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed p-8">
        {#if projects.length === 0}
          <!-- 첫 실행: "에이전트가 없다"가 아니라 "무엇을 해야 하는지"를 말한다. -->
          <div class="max-w-sm text-center">
            <div class="mx-auto grid size-10 place-items-center rounded-xl border bg-card">
              <FolderPlus class="size-5 text-muted-foreground" />
            </div>
            <p class="mt-3 text-base font-semibold">{t("overview.firstRunTitle")}</p>
            <p class="mt-1.5 text-xs text-muted-foreground">{t("overview.firstRunDesc")}</p>
            <Button class="mt-4" onclick={() => projectDialogUi.open()}>
              <Plus class="size-4" />
              {t("sidebar.addProject")}
            </Button>
          </div>
        {:else}
          <div class="text-center">
            <p class="text-sm font-medium">{t("overview.empty")}</p>
            <button type="button" class="mt-2 text-xs font-medium text-accent-share hover:underline" onclick={() => { query = ""; shell.setFilter("all"); }}>{t("overview.showAll")}</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</section>
