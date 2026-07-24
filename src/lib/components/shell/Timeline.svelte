<!-- 세션 감사 타임라인: 에이전트의 커밋/푸시/PR/검증/체크포인트/상태 이벤트를 최신순으로 본다. -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Agent } from "$lib/types";
  import type { AgentEvent } from "$lib/ipc/events";
  import { listEvents } from "$lib/ipc/events";
  import ScrollText from "@lucide/svelte/icons/scroll-text";

  let { agent }: { agent: Agent } = $props();

  let open = $state(false);
  let events = $state<AgentEvent[]>([]);
  let loading = $state(false);
  let root = $state<HTMLElement>();

  const KIND: Record<string, { label: string; cls: string }> = {
    commit: { label: "커밋", cls: "text-status-running-fg" },
    push: { label: "푸시", cls: "text-status-running-fg" },
    pr: { label: "PR", cls: "text-accent-share" },
    verify: { label: "검증", cls: "text-status-done-fg" },
    checkpoint: { label: "체크포인트", cls: "text-muted-foreground" },
    rollback: { label: "롤백", cls: "text-status-blocked-fg" },
    status: { label: "상태", cls: "text-muted-foreground" },
    adopt: { label: "채택", cls: "text-status-done-fg" },
    fanout: { label: "팬아웃", cls: "text-accent-share" },
  };

  function meta(kind: string) {
    return KIND[kind] ?? { label: kind, cls: "text-muted-foreground" };
  }

  function formatTime(ms: number): string {
    return new Date(ms).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function loadEvents() {
    loading = true;
    try {
      events = await listEvents(agent.id);
    } catch {
      events = [];
    } finally {
      loading = false;
    }
  }

  function toggle() {
    open = !open;
    if (open) void loadEvents();
  }

  function outsideClick(event: MouseEvent) {
    if (root && event.target instanceof Node && !root.contains(event.target)) open = false;
  }

  onMount(() => {
    window.addEventListener("click", outsideClick);
    return () => window.removeEventListener("click", outsideClick);
  });
</script>

<div bind:this={root} class="relative">
  <button
    type="button"
    class="flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[10.5px] font-semibold hover:bg-accent {open ? 'bg-accent' : ''}"
    aria-label="타임라인"
    aria-expanded={open}
    onclick={toggle}
  >
    <ScrollText class="size-3" />타임라인
  </button>

  {#if open}
    <div
      class="absolute right-0 top-[calc(100%+6px)] z-40 w-80 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
      role="dialog"
      aria-label="세션 타임라인"
    >
      <header class="border-b px-3.5 py-2.5 text-[12px] font-semibold">활동 타임라인</header>
      {#if loading}
        <p class="px-3 py-5 text-center text-[11px] text-muted-foreground">불러오는 중…</p>
      {:else if events.length === 0}
        <p class="px-3 py-5 text-center text-[11px] text-muted-foreground">기록된 활동이 없습니다.</p>
      {:else}
        <ul class="max-h-[340px] overflow-auto py-1">
          {#each events as event (event.id)}
            <li class="flex items-start gap-2.5 px-3.5 py-1.5">
              <span class="mt-0.5 w-16 shrink-0 text-[9.5px] font-semibold {meta(event.kind).cls}">{meta(event.kind).label}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[11px]">{event.detail}</span>
                <span class="block font-mono text-[9px] text-muted-foreground">{formatTime(event.createdAt)}</span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
