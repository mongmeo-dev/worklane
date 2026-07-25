<!-- 라이브 프리뷰: 에이전트가 띄운 dev 서버를 앱 내 iframe으로 보고, 외부 브라우저로도 연다. -->
<script lang="ts">
  import type { Agent } from "$lib/types";
  import { DEFAULT_PREVIEW_URL, parsePreviewUrl, previewStore } from "$lib/stores/preview.svelte";
  import { createPreviewContextActions } from "$lib/preview/contextActions";
  import { createPreviewContextBridge, type PreviewContextBridge } from "$lib/preview/contextBridge";
  import { createContextMenuTrigger } from "$lib/context-menu/trigger";
  import { openContextMenu } from "$lib/stores/contextMenu.svelte";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Radar from "@lucide/svelte/icons/radar";
  import { detectPreviewPorts } from "$lib/ipc/ports";
  import { t } from "$lib/i18n";
  import { actionErrors } from "$lib/stores/actionErrors.svelte";
  import { onMount, tick } from "svelte";

  // sessionId는 포트를 감지할 활성 터미널 세션이다.
  let { agent, sessionId }: { agent: Agent; sessionId?: string } = $props();

  const preview = $derived(previewStore.snapshot(agent.id));
  const frameUrl = $derived(parsePreviewUrl(preview.persistedUrl));
  const previewContextMenu = createContextMenuTrigger(() => previewActions().menu);
  let previewFrame = $state<HTMLIFrameElement | null>(null);
  let contextBridge: PreviewContextBridge | null = null;
  let portMenu = $state<HTMLDivElement | null>(null);
  let detectButton = $state<HTMLButtonElement | null>(null);

  function previewActions() {
    return createPreviewContextActions(preview);
  }
  function openPreviewContextMenu({ point, origin }: { point: { x: number; y: number }; origin: HTMLIFrameElement }) {
    openContextMenu({
      ...createPreviewContextActions(previewStore.snapshot(agent.id)).menu,
      point,
      origin,
    });
  }

  function onFrameLoad(event: Event) {
    const frame = event.currentTarget;
    if (!(frame instanceof HTMLIFrameElement)) return;
    contextBridge?.setFrame(frame);
    contextBridge?.issueToken(frame);
  }

  onMount(() => {
    contextBridge = createPreviewContextBridge({ open: openPreviewContextMenu });
    contextBridge.setFrame(previewFrame);
    contextBridge.issueToken();

    return () => contextBridge?.destroy();
  });
  $effect(() => {
    contextBridge?.setFrame(previewFrame);
  });

  function persist() {
    previewStore.persist(agent.id, preview.draftUrl);
  }

  function reload() {
    previewActions().reload();
  }

  async function openExternal() {
    try {
      await previewActions().openBrowser();
    } catch (reason) {
      actionErrors.report(reason);
    }
  }

  let ports = $state<number[]>([]);
  let portsOpen = $state(false);
  let detecting = $state(false);
  let portError = $state(false);
  let detectGeneration = 0;
  let observedSessionId: string | undefined;

  $effect(() => {
    if (sessionId === observedSessionId) return;
    observedSessionId = sessionId;
    detectGeneration += 1;
    detecting = false;
    ports = [];
    portsOpen = false;
    portError = false;
  });

  $effect(() => {
    if (!portsOpen) return;
    void tick().then(() => portMenu?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
  });

  function isCurrentDetection(generation: number, requestedSessionId: string | undefined): boolean {
    return generation === detectGeneration && sessionId === requestedSessionId;
  }

  async function detect() {
    const generation = ++detectGeneration;
    const requestedSessionId = sessionId;
    detecting = true;
    portError = false;

    if (!requestedSessionId) {
      if (isCurrentDetection(generation, requestedSessionId)) {
        ports = [];
        portsOpen = true;
        detecting = false;
      }
      return;
    }

    try {
      const detectedPorts = await detectPreviewPorts(requestedSessionId);
      if (!isCurrentDetection(generation, requestedSessionId)) return;
      ports = detectedPorts;
      portsOpen = true;
    } catch {
      if (!isCurrentDetection(generation, requestedSessionId)) return;
      ports = [];
      portError = true;
      portsOpen = true;
    } finally {
      if (isCurrentDetection(generation, requestedSessionId)) detecting = false;
    }
  }

  function pickPort(port: number) {
    previewStore.setDraft(agent.id, `http://localhost:${port}`);
    previewStore.reload(agent.id);
    portsOpen = false;
    detectButton?.focus();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape" && portsOpen) {
      event.preventDefault();
      portsOpen = false;
      detectButton?.focus();
      return;
    }
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) reload();
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-editor">
  <header class="flex h-10 shrink-0 items-center gap-1.5 border-b border-white/8 bg-editor-chrome px-2.5" role="toolbar" tabindex="-1" aria-label={t("contextMenu.preview")} oncontextmenu={previewContextMenu.oncontextmenu} onkeydown={onKey}>
    <input
      class="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-[11px] text-white/85 outline-none focus:border-white/25"
      value={preview.draftUrl}
      oninput={(event) => previewStore.setDraft(agent.id, event.currentTarget.value)}
      onblur={persist}
      placeholder={DEFAULT_PREVIEW_URL}
      aria-label={t("preview.urlAria")}
      spellcheck="false"
    />
    <div class="relative shrink-0">
      <button
        type="button"
        class="grid size-7 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40 {portsOpen ? 'bg-white/10 text-white' : ''}"
        bind:this={detectButton}
        aria-label={t("preview.detectPorts")}
        aria-expanded={portsOpen}
        aria-haspopup="menu"
        aria-controls="preview-port-menu"
        disabled={detecting}
        onclick={detect}
      >
        <Radar class="size-3.5 {detecting ? 'animate-spin' : ''}" />
      </button>
      {#if portsOpen}
        <div bind:this={portMenu} id="preview-port-menu" class="absolute right-0 top-[calc(100%+6px)] z-40 w-40 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl" role="menu" tabindex="-1" aria-label={t("preview.detectPorts")} onkeydown={onKey}>
          {#if ports.length > 0}
            {#each ports as port (port)}
              <button type="button" role="menuitem" class="block w-full px-3 py-1.5 text-left font-mono text-[11px] hover:bg-accent" onclick={() => pickPort(port)}>localhost:{port}</button>
            {/each}
          {:else if portError}
            <p class="px-3 py-2 text-[10.5px] text-destructive" role="alert">{t("preview.portDetectionError")}</p>
          {:else}
            <p class="px-3 py-2 text-[10.5px] text-muted-foreground">{t("preview.noPorts")}</p>
          {/if}
        </div>
      {/if}
    </div>
    <button
      type="button"
      class="grid size-7 shrink-0 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
      aria-label={t("preview.refresh")}
      onclick={reload}
    >
      <RefreshCw class="size-3.5" />
    </button>
    <button
      type="button"
      class="grid size-7 shrink-0 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40"
      aria-label={t("preview.openBrowser")}
      disabled={!parsePreviewUrl(preview.draftUrl)}
      onclick={openExternal}
    >
      <ExternalLink class="size-3.5" />
    </button>
  </header>

  <div class="min-h-0 flex-1 bg-white">
    {#if frameUrl}
      {#key `${preview.reloadRevision}-${frameUrl}`}
        <iframe
          bind:this={previewFrame}
          src={frameUrl}
          title={t("preview.frameTitle", { title: agent.title })}
          class="size-full border-0"
          role="document"
          sandbox="allow-scripts allow-forms allow-popups"
          referrerpolicy="no-referrer"
          onload={onFrameLoad}
        ></iframe>
      {/key}
    {:else}
      <div class="grid h-full place-items-center bg-editor px-6 text-center text-[11px] text-white/45" role="region" aria-label={t("contextMenu.preview")} oncontextmenu={previewContextMenu.oncontextmenu}>
        <div>
          <p>{t("preview.emptyMain")}</p>
          <p class="mt-1 font-mono text-white/30">{t("preview.emptyExample", { url: DEFAULT_PREVIEW_URL })}</p>
        </div>
      </div>
    {/if}
  </div>
</div>
