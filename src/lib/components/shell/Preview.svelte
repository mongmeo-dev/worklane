<!-- 라이브 프리뷰: 에이전트가 띄운 dev 서버를 앱 내 iframe으로 보고, 외부 브라우저로도 연다. -->
<script lang="ts">
  import { untrack } from "svelte";
  import type { Agent } from "$lib/types";
  import { DEFAULT_PREVIEW_URL, previewStore } from "$lib/stores/preview.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import ExternalLink from "@lucide/svelte/icons/external-link";

  // AgentDetail이 {#key agent.id}로 감싸 에이전트별로 재마운트한다.
  let { agent }: { agent: Agent } = $props();

  let url = $state(untrack(() => previewStore.get(agent.id)));
  let frameKey = $state(0);

  const trimmed = $derived(url.trim());

  function persist() {
    previewStore.set(agent.id, trimmed);
  }

  function reload() {
    persist();
    frameKey += 1;
  }

  async function openExternal() {
    if (trimmed) await openUrl(trimmed);
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Enter") reload();
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-editor">
  <header class="flex h-10 shrink-0 items-center gap-1.5 border-b border-white/8 bg-editor-chrome px-2.5">
    <input
      class="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-[11px] text-white/85 outline-none focus:border-white/25"
      bind:value={url}
      onkeydown={onKey}
      onblur={persist}
      placeholder={DEFAULT_PREVIEW_URL}
      aria-label="프리뷰 URL"
      spellcheck="false"
    />
    <button
      type="button"
      class="grid size-7 shrink-0 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
      aria-label="새로고침"
      onclick={reload}
    >
      <RefreshCw class="size-3.5" />
    </button>
    <button
      type="button"
      class="grid size-7 shrink-0 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40"
      aria-label="브라우저에서 열기"
      disabled={!trimmed}
      onclick={openExternal}
    >
      <ExternalLink class="size-3.5" />
    </button>
  </header>

  <div class="min-h-0 flex-1 bg-white">
    {#if trimmed}
      {#key `${frameKey}-${trimmed}`}
        <iframe src={trimmed} title="라이브 프리뷰 · {agent.title}" class="size-full border-0"></iframe>
      {/key}
    {:else}
      <div class="grid h-full place-items-center bg-editor px-6 text-center text-[11px] text-white/45">
        <div>
          <p>dev 서버 주소를 입력하면 프리뷰가 표시됩니다.</p>
          <p class="mt-1 font-mono text-white/30">예: {DEFAULT_PREVIEW_URL}</p>
        </div>
      </div>
    {/if}
  </div>
</div>
