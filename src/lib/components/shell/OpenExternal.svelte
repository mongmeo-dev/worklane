<!-- worktree를 외부 에디터/파일 매니저로 여는 소형 메뉴. -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { ExternalApp } from "$lib/ipc/external";
  import { openInApp } from "$lib/ipc/external";
  import SquareArrowOutUpRight from "@lucide/svelte/icons/square-arrow-out-up-right";

  let { worktreePath }: { worktreePath: string } = $props();

  let open = $state(false);
  let error = $state<string | null>(null);
  let root = $state<HTMLElement>();

  const items: { app: ExternalApp; label: string }[] = [
    { app: "vscode", label: "VS Code" },
    { app: "cursor", label: "Cursor" },
    { app: "zed", label: "Zed" },
    { app: "finder", label: "파일 매니저" },
  ];

  async function choose(app: ExternalApp) {
    error = null;
    try {
      await openInApp(worktreePath, app);
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
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
    aria-label="외부 앱으로 열기"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <SquareArrowOutUpRight class="size-3" />열기
  </button>

  {#if open}
    <div
      class="absolute right-0 top-[calc(100%+6px)] z-40 w-40 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
      role="menu"
    >
      {#each items as item (item.app)}
        <button
          type="button"
          class="flex w-full items-center px-3 py-1.5 text-left text-[11.5px] hover:bg-accent"
          role="menuitem"
          onclick={() => choose(item.app)}
        >{item.label}</button>
      {/each}
      {#if error}
        <p class="border-t px-3 py-1.5 text-[10px] text-destructive">{error}</p>
      {/if}
    </div>
  {/if}
</div>
